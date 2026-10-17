import { Socket } from 'node:net';
import { vi } from 'vitest';

// The standard suite is local: inject, temporary SQLite and pure contracts only.
vi.stubGlobal('fetch', () => { throw new Error('Network access is forbidden in the standard test suite'); });
vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {
  throw new Error('Socket connections are forbidden in the standard test suite');
});
vi.mock('node:child_process', () => {
  const forbidden = () => { throw new Error('Subprocesses are forbidden in the standard test suite'); };
  return { spawn: forbidden, spawnSync: forbidden, exec: forbidden, execSync: forbidden, execFile: forbidden, execFileSync: forbidden, fork: forbidden };
});
