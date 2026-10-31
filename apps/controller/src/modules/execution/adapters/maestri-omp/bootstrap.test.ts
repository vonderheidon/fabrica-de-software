import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { attemptSessionDirectoryReference, passageBootstrapDirectoryReference, type PassageRequest } from '#contracts';
import { loadRoleResources } from '../../roles.js';
import type { ExecutionHost } from '../../index.js';
import type { PassageChannel } from './channel.js';
import { writeBootstrap } from './bootstrap.js';

vi.mock('./native.js', () => ({ runCli: vi.fn(async () => ({ exitCode: 0, stdout: '' })) }));

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });

it('creates issue-scoped sessions, accepts legacy references, and rejects a mismatched issue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'factory-bootstrap-path-')); directories.push(root);
  const data = join(root, 'var', 'factory'); await mkdir(data, { recursive: true });
  const managed = join(data, 'projects', randomUUID(), 'v1', 'managed'); await mkdir(managed, { recursive: true });
  const cwd = join(managed, 'issues', '17', 'workspace'); await mkdir(cwd, { recursive: true });
  const attemptId = randomUUID(); const role = loadRoleResources().get('implementer')!;
  const request: PassageRequest = {
    binding: { attemptId, passageId: randomUUID(), role: 'implementer', round: 1, deliveryVersion: randomUUID() },
    profile: { name: 'Test', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: '' },
    cwd, task: 'Test bootstrap path', criterionIds: ['ac-1'], previousFindingKeys: [], gitNexusRequired: false, roleResource: role.reference,
  };
  const host: ExecutionHost = { maestriExecutable: 'maestri', ompExecutable: 'omp', powershellExecutable: process.execPath, inheritedEnvironment: {} };
  const channel: PassageChannel = { port: 4310, token: 'test-token', send: async () => {}, close: async () => {} };
  const resolveAttemptRoot = async () => managed;
  const resolveAttemptArea = async (id: string, area: 'publication' | 'sessions' | 'evidence') => join(managed, 'issues', '17', 'attempts', id, area);
  const write = (sessionDirectoryRelative: string, passageId = randomUUID(), previousTerminalStopped = false) => writeBootstrap(data,
    { ...request, binding: { ...request.binding, passageId } }, host, role, channel, '18.11.1', resolveAttemptRoot,
    sessionDirectoryRelative, resolveAttemptArea, previousTerminalStopped);

  const mismatched = attemptSessionDirectoryReference(18, attemptId, 'implementer');
  await expect(write(mismatched)).rejects.toMatchObject({ code: 'RESOURCE_INVALID' });

  const currentReference = attemptSessionDirectoryReference(17, attemptId, 'implementer');
  const currentPassageId = randomUUID();
  const stale = await write(currentReference, currentPassageId);
  await expect(write(currentReference, currentPassageId)).rejects.toMatchObject({ code: 'RESOURCE_INVALID' });
  const current = await write(currentReference, currentPassageId, true);
  expect(current.path).toBe(stale.path);
  const currentPayload = JSON.parse(await readFile(current.path, 'utf8')) as { sessionDirectory: string; npmCacheDirectory: string };
  expect(current.path).toBe(join(data, ...passageBootstrapDirectoryReference(currentPassageId).split('/'), 'launch.json'));
  expect(currentPayload.sessionDirectory).toBe(join(managed, ...currentReference.split('/')));
  expect(currentPayload.npmCacheDirectory).toBe(join(data, 'runtime', 'npm-cache'));
  expect((await stat(currentPayload.npmCacheDirectory)).isDirectory()).toBe(true);
  await current.removeSecret();
  await expect(stat(join(data, ...passageBootstrapDirectoryReference(currentPassageId).split('/')))).rejects.toMatchObject({ code: 'ENOENT' });

  const emptyPassageId = randomUUID();
  await mkdir(join(data, ...passageBootstrapDirectoryReference(emptyPassageId).split('/')));
  const empty = await write(currentReference, emptyPassageId);
  await empty.removeSecret();

  const legacyReference = `sessions/${attemptId}/implementer`;
  const legacy = await write(legacyReference);
  const legacyPayload = JSON.parse(await readFile(legacy.path, 'utf8')) as { sessionDirectory: string };
  expect(legacyPayload.sessionDirectory).toBe(join(managed, ...legacyReference.split('/')));
  await legacy.removeSecret();
});
