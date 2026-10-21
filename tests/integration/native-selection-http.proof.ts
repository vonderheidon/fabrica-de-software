import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { installProjectRoutes } from '../../apps/controller/src/http/routes/projects.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { createProjects } from '../../apps/controller/src/modules/projects/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

it('keeps the native picker alive after a complete HTTP POST body arrives', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-native-selection-'));
  const storage = openStorage({ dataDirectory: directory });
  // Allow request parsing/schema setup before exercising the longer picker wait.
  // The picker still outlives the socket timeout, so removing the route override fails this proof.
  const app = Fastify({ connectionTimeout: 500 });
  let pickerAborted = false;
  const projects = createProjects({
    storage, github: createGitHub(), directoryBase: directory,
    workspaces: { inspectOrigin: async () => { throw new Error('Origin inspection is outside this proof.'); } },
    selectProjectsDirectory: async signal => {
      await new Promise<void>(resolve => setTimeout(resolve, 750));
      pickerAborted = signal?.aborted ?? false;
      return pickerAborted ? null : directory;
    },
  });
  installProjectRoutes(app, projects);
  try {
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(origin + '/api/v1/settings/selections', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'projects_root' }), signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'selected', kind: 'projects_root', path: directory });
    expect(pickerAborted).toBe(false);
    expect(storage.getGlobalConfiguration().view.settings.projects_root).toBeNull();
  } finally {
    await app.close();
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('closes the native picker when the client disconnects after sending the POST body', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-native-disconnect-'));
  const storage = openStorage({ dataDirectory: directory });
  const app = Fastify({ handlerTimeout: 1000 });
  const client = new AbortController();
  let pickerSignal: AbortSignal | undefined;
  let markStarted: () => void = () => { throw new Error('Picker start observer was not initialized.'); };
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  let markClosed: () => void = () => { throw new Error('Picker close observer was not initialized.'); };
  const closed = new Promise<void>(resolve => { markClosed = resolve; });
  installProjectRoutes(app, createProjects({
    storage, github: createGitHub(), directoryBase: directory,
    workspaces: { inspectOrigin: async () => { throw new Error('Origin inspection is outside this proof.'); } },
    selectProjectsDirectory: signal => {
      pickerSignal = signal;
      markStarted();
      return new Promise<null>(resolve => {
        const close = () => { markClosed(); resolve(null); };
        if (signal?.aborted) close();
        else signal?.addEventListener('abort', close, { once: true });
      });
    },
  }));
  try {
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = fetch(origin + '/api/v1/settings/selections', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'projects_root' }), signal: client.signal,
    });
    const outcome = response.catch((error: unknown) => error);
    await started;
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    expect(pickerSignal?.aborted).toBe(false);
    client.abort();
    expect(await outcome).toBeInstanceOf(Error);
    await closed;
    expect(pickerSignal?.aborted).toBe(true);
  } finally {
    client.abort();
    await app.close();
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
