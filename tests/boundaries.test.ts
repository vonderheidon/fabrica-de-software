import { describe, expect, it } from 'vitest';
import { inspectSource, inspectTree } from '../scripts/check-boundaries.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('static dependency boundaries', () => {
  it('accepts public interfaces and storage private seams', () => {
    expect(inspectSource('apps/controller/src/main.ts', "import { openStorage } from './modules/storage/index.js'" )).toEqual([]);
    expect(inspectSource('apps/controller/src/modules/storage/settings.ts', "import { StorageError } from './errors.js'" )).toEqual([]);
  });
  it('actually scans TSX files and excludes test fixtures from production lint', () => {
    const cache = resolve('.cache'); mkdirSync(cache, { recursive: true });
    const directory = mkdtempSync(resolve(cache, 'boundaries-proof-'));
    try {
      writeFileSync(resolve(directory, 'Card.tsx'), 'const value: any = <p>Card</p>;');
      writeFileSync(resolve(directory, 'Card.test.tsx'), 'const testValue: any = 1;');
      expect(inspectTree(directory)).toHaveLength(1);
      expect(inspectTree(directory)[0]).toContain('explicit any is forbidden');
    } finally { rmSync(directory, { recursive: true }); }
  });
  it.each([
    "import { openStorage } from '../../../controller/src/modules/storage/index.js'",
    "export { createExecution } from '../../../controller/src/modules/execution/index.js'",
    "type Runtime = import('../../../controller/src/modules/execution/index.js').Execution",
    "const runtime = import('../../../controller/src/main.js')",
    "import runtime = require('../../../controller/src/main.js')",
  ])('keeps controller runtime out of UI even through a public index: %s', source => {
    expect(inspectSource('apps/web/src/app/Card.tsx', source)).toContain('apps/web/src/app/Card.tsx: UI cannot import controller runtime');
  });
  it('allows UI DTO imports and rejects contracts IO through reexports and dynamic imports', () => {
    expect(inspectSource('apps/web/src/app/Card.tsx', "import type { Delivery } from '#contracts'; export const Card = () => <p>Delivery</p>;")).toEqual([]);
    for (const source of ["export { readFile } from 'node:fs/promises'", "const fs = import('node:fs')", "type Runtime = import('node:fs').Stats"]) {
      expect(inspectSource('packages/contracts/src/index.ts', source)).toContain('packages/contracts/src/index.ts: contracts must contain schemas/types only; IO/runtime imports are forbidden');
    }
    expect(inspectSource('apps/web/src/app/Card.tsx', "import fs from 'node:fs'")).toContain('apps/web/src/app/Card.tsx: UI cannot import server IO/runtime');
    expect(inspectSource('apps/web/src/app/Card.tsx', "import { spawn } from 'child_process'")).toContain('apps/web/src/app/Card.tsx: UI cannot import server IO/runtime');
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
  it.each([
    "import { spawn as launch } from 'node:child_process'; launch('gh', [])",
    "import * as processes from 'node:child_process'; processes.execFile('maestri.exe', [])",
    "import processes from 'node:child_process'; const executable = 'omp'; processes.spawn(executable, [])",
    "const executable = 'gh'; spawn(executable, [])",
    "import { exec as run } from 'node:child_process'; run('gh api graphql')",
    "import * as processes from 'node:child_process'; processes['spawn']('omp.exe', [])",
    "import processes from 'node:child_process'; processes.execSync('\"C:/Program Files/Maestri/maestri.exe\" list')",
    "execFile('gh.cmd', ['api', 'graphql'])",
    "spawn('C:/Program Files/Maestri/omp.exe', [])",
  ])('detects literal launchers through imports and constants: %s', source => {
    expect(inspectSource('apps/controller/src/modules/projects/service.ts', source).some(e => /GH belongs|Maestri\/OMP belongs/.test(e))).toBe(true);
  });
});
