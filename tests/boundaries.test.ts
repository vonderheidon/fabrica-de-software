import { describe, expect, it } from 'vitest';
import { inspectSource } from '../scripts/check-boundaries.mjs';

describe('static dependency boundaries', () => {
  it('accepts public interfaces and storage private seams', () => {
    expect(inspectSource('apps/controller/src/main.ts', "import { openStorage } from './modules/storage/index.js'" )).toEqual([]);
    expect(inspectSource('apps/controller/src/modules/storage/settings.ts', "import { StorageError } from './errors.js'" )).toEqual([]);
  });
  it.each([
    "import { readSettings } from '../storage/settings.js'",
    "export { readSettings } from '../storage/settings.js'",
    "const x = import('../storage/settings.js')",
    "type T = import('../storage/settings.js').T",
    "import { x } from '../../http/app.js'",
    "import Database from 'better-sqlite3'",
    "const query = 'SELECT name FROM projects'",
    "const value: any = 1",
    "// @ts-ignore\nconst value = 1",
  ])('rejects a module boundary violation: %s', (source) => {
    expect(inspectSource('apps/controller/src/modules/projects/service.ts', source).length).toBeGreaterThan(0);
  });
  it.each(["import { readFile } from 'node:fs'", "import { x } from '../../../apps/controller/src/main.js'", 'const value = process.env.SECRET', 'const value = fetch("https://example.com")'])('keeps IO/runtime out of contracts', (source) => {
    expect(inspectSource('packages/contracts/src/index.ts', source).length).toBeGreaterThan(0);
  });
  it('allows contracts to compose schemas within their package', () => {
    expect(inspectSource('packages/contracts/src/index.ts', "export * from './github.js'")).toEqual([]);
    expect(inspectSource('packages/contracts/src/workspaces.ts', "import { GitHubRepository } from './github.js'")).toEqual([]);
  });
  it('keeps direct Git and GH execution in their owning modules', () => {
    expect(inspectSource('apps/controller/src/modules/projects/service.ts', "execFile('gh', ['api','user'])")).toContain('apps/controller/src/modules/projects/service.ts: GH belongs to github');
    expect(inspectSource('apps/controller/src/modules/projects/service.ts', "spawn('git', ['status'])")).toContain('apps/controller/src/modules/projects/service.ts: Git belongs to workspaces');
    expect(inspectSource('apps/controller/src/modules/github/service.ts', "spawn('gh', ['api','graphql'])")).toEqual([]);
    expect(inspectSource('apps/controller/src/modules/workspaces/service.ts', "execFile('git', ['status'])")).toEqual([]);
  });
  it('keeps native Maestri/OMP launchers and SDK imports inside execution', () => {
    expect(inspectSource('apps/controller/src/modules/projects/service.ts', "spawn('omp.exe', [])")).toContain('apps/controller/src/modules/projects/service.ts: Maestri/OMP belongs to execution');
    expect(inspectSource('apps/controller/src/main.ts', "execFile('maestri', ['list'])")).toContain('apps/controller/src/main.ts: Maestri/OMP belongs to execution');
    expect(inspectSource('apps/controller/src/modules/pipeline/index.ts', "import { createAgentSession } from '@oh-my-pi/pi-coding-agent'")).toContain('apps/controller/src/modules/pipeline/index.ts: OMP belongs to execution');
    expect(inspectSource('apps/controller/src/modules/execution/adapters/native.ts', "spawn('omp.exe', [])")).toEqual([]);
  });
});
