import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeletionPreview, SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { createDeletionCoordinator } from '../../apps/controller/src/modules/projects/index.js';
import { deletionTables, identifier, primaryKey, type ProjectDeletionInventory } from '../../apps/controller/src/modules/storage/project-deletion-inventory.js';
import { createDeletionInspector, windowsReferenceDeletionPlatform } from '../../apps/controller/src/modules/workspaces/deletion.js';
import { attemptFixture } from '../fixtures/attempt.js';
import { projectDeletionHistory } from '../fixtures/project-deletion-history.js';
import { assertNoContent, auditDatabase, inventory } from '../fixtures/persistence-measurement.js';

const cacheMarker = 'PROJECT_DELETION_CACHE_CONTENT_AC29_76543210';

type FileTreeSnapshot =
  | { kind: 'directory'; mode: number; entries: Record<string, FileTreeSnapshot> }
  | { kind: 'file'; mode: number; contents: string };

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function snapshotTree(path: string): Promise<FileTreeSnapshot> {
  const stat = await lstat(path);
  const mode = stat.mode & 0o7777;
  if (stat.isDirectory()) {
    const entries: Record<string, FileTreeSnapshot> = {};
    for (const name of (await readdir(path)).sort()) entries[name] = await snapshotTree(join(path, name));
    return { kind: 'directory', mode, entries };
  }
  if (stat.isFile()) return { kind: 'file', mode, contents: (await readFile(path)).toString('base64') };
  throw new Error('UNSUPPORTED_DELETION_FIXTURE_ENTRY');
}

async function createFileTree(path: string, label: string): Promise<void> {
  await mkdir(join(path, 'nested', 'deeper'), { recursive: true });
  await writeFile(join(path, 'root.bin'), Buffer.from([0, 17, 127, 255]));
  await writeFile(join(path, 'nested', 'empty.txt'), Buffer.alloc(0));
  await writeFile(join(path, 'nested', 'deeper', 'contents.txt'), label, 'utf8');
}

function observeContentIO(directory: string) {
  const readers = [vi.spyOn(fs, 'readFileSync'), vi.spyOn(fs, 'openSync'), vi.spyOn(fs, 'readdirSync'), vi.spyOn(fs, 'statSync'), vi.spyOn(fs, 'lstatSync'),
    vi.spyOn(fsPromises, 'readFile'), vi.spyOn(fsPromises, 'open'), vi.spyOn(fsPromises, 'readdir'), vi.spyOn(fsPromises, 'stat'), vi.spyOn(fsPromises, 'lstat')];
  syncBuiltinESMExports();
  const root = directory.replaceAll('\\', '/').toLowerCase();
  return {
    assertNoContentIO() {
      const accessed = readers.some(reader => reader.mock.calls.some(args => {
        const path = String(args[0]).replaceAll('\\', '/').toLowerCase();
        return ['work', 'git', 'artifacts'].some(part => path === `${root}/${part}` || path.startsWith(`${root}/${part}/`));
      }));
      expect(accessed, 'project list, event history and deletion polling must not read work/Git/artifact content').toBe(false);
    },
    clear() { for (const reader of readers) reader.mockClear(); },
    assertInstrumented() { expect(readers[5]).toHaveBeenCalled(); },
    restore() { for (const reader of readers) reader.mockRestore(); syncBuiltinESMExports(); },
  };
}

async function writeIgnoredCache(path: string, totalBytes: number, previousBytes: number): Promise<void> {
  const chunk = Buffer.alloc(1_048_576, cacheMarker);
  const file = await open(path, previousBytes === 0 ? 'w' : 'a');
  try {
    for (let written = previousBytes; written < totalBytes; written += chunk.length) await file.writeFile(chunk);
    await file.sync();
  } finally {
    await file.close();
  }
}

function measurementSummary(durations: number[], payloadBytes: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  const orderedSizes = [...payloadBytes].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    payloadMinBytes: Math.min(...orderedSizes),
    payloadMaxBytes: Math.max(...orderedSizes),
    medianMs: (sorted[9]! + sorted[10]!) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    maxMs: sorted.at(-1)!,
  };
}

function rowsForInventory(db: Database.Database, inventory: ProjectDeletionInventory) {
  return Object.fromEntries(deletionTables.map(table => {
    const keys = new Set(inventory.keys[table]);
    const keyColumns = primaryKey(db, table);
    const rows = db.prepare(`SELECT * FROM ${identifier(table)} ORDER BY rowid`).all() as Record<string, unknown>[];
    return [table, rows.filter(row => keys.has(JSON.stringify(keyColumns.map(column => row[column]))))];
  }));
}

describe.skipIf(process.platform !== 'win32')('native project deletion integration proof', () => {
  it('preserves the complete sibling registration tree through HTTP acceptance and native removal', async () => {
    const cacheRoot = resolve(process.cwd(), '.cache');
    await mkdir(cacheRoot, { recursive: true });
    const f = await attemptFixture(cacheRoot);
    cleanup.push(() => f.close());
    const history = projectDeletionHistory(f.db, () => {}, false, false, f.directory);
    const selectedId = history.selected.projectId;
    const otherId = history.other.projectId;
    const selectedConfiguration = f.storage.getConfiguration(selectedId).view.configuration;
    const otherConfiguration = f.storage.getConfiguration(otherId).view.configuration;
    expect(selectedConfiguration.source).toEqual(otherConfiguration.source);
    expect(selectedConfiguration.source.kind).toBe('github');

    const dataDirectory = resolve(f.directory);
    const input = f.storage.getProjectDeletionPaths(selectedId);
    expect(input.blockers).toEqual([]);
    for (const target of input.targets) {
      const targetRelative = relative(dataDirectory, resolve(target.path));
      expect(targetRelative === '' || (!isAbsolute(targetRelative) && !targetRelative.startsWith(`..${sep}`) && targetRelative !== '..'),
        'native removal targets must stay inside this explicit test fixture').toBe(true);
    }
    await Promise.all(['work', 'git', 'artifacts', 'execution-bootstrap', 'fixture']
      .map(name => mkdir(join(dataDirectory, name), { recursive: true })));
    await Promise.all(input.targets.map((target, index) => createFileTree(target.path, `selected:${target.key}:${index}`)));
    const otherPassages = f.db.prepare<[string], { id: string }>(
      'SELECT id FROM passages WHERE attempt_id=? ORDER BY id',
    ).all(history.other.attemptId);
    const otherRoots = [
      join(dataDirectory, 'work', history.other.attemptId),
      join(dataDirectory, 'git', `${history.other.attemptId}.git`),
      join(dataDirectory, 'artifacts', history.other.attemptId),
      ...otherPassages.map(({ id }) => join(dataDirectory, 'execution-bootstrap', id)),
    ];
    await Promise.all(otherRoots.map((root, index) => createFileTree(root, `other-registration:${index}`)));
    const otherInventory = f.storage.getProjectDeletionInventory(otherId);
    const sqlBefore = rowsForInventory(f.db, otherInventory);
    const filesBefore = await Promise.all(otherRoots.map(snapshotTree));

    const workspaces = createDeletionInspector(windowsReferenceDeletionPlatform());
    const coordinator = createDeletionCoordinator({ storage: f.storage, workspaces, logFailure: f.logFailure });
    const schedule = vi.spyOn(coordinator, 'schedule').mockResolvedValue();
    const config = loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory);
    const app = createApp(config, f.storage, undefined,
      { github: { ...createGitHub(), ...f.github }, workspaces: f.workspaces },
      { github: f.github, workspaces: f.workspaces }, f.pipeline, undefined, undefined,
      { workspaces, coordinator });
    cleanup.push(async () => { await coordinator.close(); await app.close(); });

    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: {
      host: new URL(config.browserOrigin).host, origin: config.browserOrigin,
      'content-type': 'application/json', 'x-factory-client': 'web',
    }, payload: {} });
    expect(session.statusCode).toBe(200);
    const headers = { host: new URL(config.browserOrigin).host, origin: config.browserOrigin,
      'content-type': 'application/json', cookie: String(session.headers['set-cookie']).split(';')[0]!,
      'x-csrf-token': session.json<SessionResponse>().csrf_token };
    const preview = await app.inject({ method: 'GET', url: `/api/v1/projects/${selectedId}/deletion-preview`, headers });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json<DeletionPreview>()).toMatchObject({ can_confirm: true, blockers: [] });
    const previewBody = preview.json<DeletionPreview>();
    const operationId = randomUUID();
    const accepted = await app.inject({ method: 'POST', url: `/api/v1/projects/${selectedId}/deletion`, headers: {
      ...headers, 'idempotency-key': operationId, 'if-match': String(preview.headers.etag),
    }, payload: { confirmed: true, authorization_digest: previewBody.authorization_digest } });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ operation_id: operationId, state: 'accepted' });

    const workRoot = join(dataDirectory, 'work', history.selected.attemptId);
    const cacheDirectory = join(workRoot, 'implementation', 'node_modules', '.cache');
    const cachePath = join(cacheDirectory, 'ignored.bin');
    expect(input.targets.some(target => resolve(target.path) === resolve(workRoot))).toBe(true);
    await writeFile(join(workRoot, '.gitignore'), '/implementation/node_modules/\n');
    await mkdir(cacheDirectory, { recursive: true });

    const endpoints = {
      listing: '/api/v1/projects',
      history: `/api/v1/events?operation_id=${operationId}`,
      polling: `/api/v1/project-deletions/${operationId}`,
    };
    const referencePayloads = new Map<string, string>();
    const baselineSequence = f.db.prepare('SELECT max(seq) AS seq FROM events').get();
    const baselineChanges = f.db.prepare('SELECT total_changes() AS changes').get();
    const baselineDataVersion = f.db.pragma('data_version', { simple: true });
    const initialTargetRows = f.db.prepare<[string], { count: number }>(
      'SELECT count(*) AS count FROM project_deletion_targets WHERE operation_id=?',
    ).get(operationId)!.count;
    const stages = [];
    let previousCacheBytes = 0;
    for (const cacheBytes of [0, 16 * 1024 * 1024, 64 * 1024 * 1024]) {
      if (cacheBytes > previousCacheBytes) await writeIgnoredCache(cachePath, cacheBytes, previousCacheBytes);
      previousCacheBytes = cacheBytes;
      const measured = [];
      const contentIO = observeContentIO(dataDirectory);
      try {
        // Positive control: prove that the same built-in readers are observed.
        await readFile(join(workRoot, 'root.bin'));
        contentIO.assertInstrumented(); contentIO.clear();
        for (const [surface, url] of Object.entries(endpoints)) {
          const durations: number[] = [];
          const payloadBytes: number[] = [];
          for (let sample = -1; sample < 20; sample++) {
            const start = performance.now();
            const response = await app.inject({ url, headers });
            const duration = performance.now() - start;
            expect(response.statusCode, `${surface}: ${response.body}`).toBe(200);
            expect(response.headers['cache-control']).toBe('no-store');
            const body = response.body;
            const reference = referencePayloads.get(surface);
            if (reference === undefined) referencePayloads.set(surface, body);
            else expect(body, `${surface} payload must remain identical as ignored cache volume grows`).toBe(reference);
            assertNoContent(Buffer.from(body), [cacheMarker]);
            if (surface === 'polling') expect(response.json()).toMatchObject({ operation_id: operationId, state: 'accepted' });
            if (sample >= 0) { durations.push(duration); payloadBytes.push(Buffer.byteLength(response.body)); }
          }
          measured.push({ surface, ...measurementSummary(durations, payloadBytes), payloadStable: true });
        }
        contentIO.assertNoContentIO();
      } finally { contentIO.restore(); }

      const files = await inventory(dataDirectory);
      const cacheFile = files.find(file => file.path === relative(dataDirectory, cachePath).replaceAll('\\', '/'));
      expect(cacheFile?.sizeBytes ?? 0).toBe(cacheBytes);
      for (const file of files.filter(entry => entry.path.startsWith('artifacts/'))) {
        assertNoContent(await readFile(join(dataDirectory, file.path)), [cacheMarker]);
      }
      const databaseAudit = auditDatabase(f.db, [cacheMarker]);
      const targetRows = f.db.prepare<[string], { count: number }>(
        'SELECT count(*) AS count FROM project_deletion_targets WHERE operation_id=?',
      ).get(operationId)!.count;
      stages.push({
        cacheBytes,
        databaseBytes: files.find(file => file.path === 'factory.sqlite')?.sizeBytes ?? 0,
        walBytes: files.find(file => file.path === 'factory.sqlite-wal')?.sizeBytes ?? 0,
        sharedMemoryBytes: files.find(file => file.path === 'factory.sqlite-shm')?.sizeBytes ?? 0,
        artifactBytes: files.filter(file => file.path.startsWith('artifacts/')).reduce((sum, file) => sum + file.sizeBytes, 0),
        workBytes: files.filter(file => file.path.startsWith('work/')).reduce((sum, file) => sum + file.sizeBytes, 0),
        projectDeletionTargetRows: targetRows,
        databaseAudit,
        measurements: measured,
      });
    }
    expect(stages.map(stage => stage.projectDeletionTargetRows)).toEqual([initialTargetRows, initialTargetRows, initialTargetRows]);
    expect(stages.map(stage => stage.databaseAudit)).toEqual([stages[0]!.databaseAudit, stages[0]!.databaseAudit, stages[0]!.databaseAudit]);
    expect(f.db.pragma('data_version', { simple: true })).toBe(baselineDataVersion);
    expect(f.db.prepare('SELECT max(seq) AS seq FROM events').get()).toEqual(baselineSequence);
    expect(f.db.prepare('SELECT total_changes() AS changes').get()).toEqual(baselineChanges);
    expect(schedule).toHaveBeenCalledTimes(1);
    console.log('AC29_PROJECT_DELETION_REPORT ' + JSON.stringify({ formatVersion: 1,
      level: 'real_sqlite_filesystem_fastify_inject_windows_reference_controlled', stages,
      comparison: { sameFixtureAndQueries: true, payloadsIdentical: true, contentIoDuringQueries: false,
        databaseRowsAndEventsStable: true, perFileInventoryPersisted: false },
      limitations: ['Synthetic cache markers were checked only against SQLite and official artifacts; this is not a universal content scanner.',
        'Native removal operates only inside the explicitly created attemptFixture directory.',
        'No latency SLA or real Git/GitHub/Maestri/OMP integration is claimed.'] }));

    schedule.mockRestore();
    await coordinator.schedule(operationId);
    await coordinator.drain();
    expect(f.storage.getProjectDeletion(operationId)).toEqual({ operation_id: operationId, state: 'succeeded' });
    for (const target of input.targets) await expect(lstat(target.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(rowsForInventory(f.db, otherInventory)).toEqual(sqlBefore);
    expect(await Promise.all(otherRoots.map(snapshotTree))).toEqual(filesBefore);
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
  }, 120_000);
});
