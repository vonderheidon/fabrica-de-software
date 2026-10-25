import { describe, expect, it, vi } from 'vitest';
import { createToolDetector } from './index.js';
import type { ToolPreferences } from '#contracts';

const preferences: ToolPreferences = {
  format_version: 1,
  git: { preferred_path: null, last_validated_at_ms: null },
  maestri: { preferred_path: null, last_validated_at_ms: null },
  omp: { preferred_path: null, last_validated_at_ms: null },
  powershell: { preferred_path: null, last_validated_at_ms: null },
};

describe('native tool discovery', () => {
  it('reports the same OMP version format as the execution adapter', async () => {
    const detector = createToolDetector({ platform: 'win32', stat: async () => ({ isFile: () => true }),
      access: async () => {}, run: async () => 'omp/18.12.5' });
    expect(await detector.validate('C:\\OMP\\omp.exe', 'omp')).toEqual({ path: 'C:\\OMP\\omp.exe', version: '18.12.5' });
  });
  it('validates candidates without a shell and preserves Unicode paths', async () => {
    const calls: Array<{ path: string; args: readonly string[] }> = [];
    const detector = createToolDetector({ environment: () => ({ PATH: 'C:\\Tools ç\\Git\\cmd;D:\\Program Files\\Git\\cmd' }), platform: 'win32',
      stat: async () => ({ isFile: () => true }), access: async () => {},
      run: async (path, args) => { calls.push({ path, args }); return `${args[0] ?? 'PowerShell'} 2.44.0`; } });

    const result = await detector.detect(preferences, 'C:\\Tools ç\\gh.exe');

    expect(result.git.state).toBe('ambiguous');
    expect(result.git.candidates).toHaveLength(2);
    expect(result.git.selected_path).toBeNull();
    expect(result.gh.selected_path).toBe('C:\\Tools ç\\gh.exe');
    expect(calls.every(call => call.args.length > 0)).toBe(true);
    expect(calls.some(call => call.path.includes('Tools ç'))).toBe(true);
  });

  it('uses a saved, currently valid preference to resolve multiple candidates', async () => {
    const selectedPath = 'D:\\Executables ç\\git.exe';
    const detector = createToolDetector({ environment: () => ({ PATH: 'C:\\Git\\cmd;D:\\Executables ç' }), platform: 'win32',
      stat: async () => ({ isFile: () => true }), access: async () => {}, run: async () => 'git version 2.50.0' });
    const stored = { ...preferences, git: { preferred_path: selectedPath, last_validated_at_ms: 1 } };

    const result = await detector.detect(stored, null);

    expect(result.git.state).toBe('available');
    expect(result.git.selected_path).toBe(selectedPath);
    expect(result.git.candidates).toHaveLength(2);
  });

  it('does not treat a found Maestri executable as a connected session', async () => {
    const detector = createToolDetector({ environment: () => ({ PATH: 'C:\\Maestri' }), platform: 'win32',
      stat: async () => ({ isFile: () => true }), access: async () => {}, run: async () => 'maestri 0.25.0' });
    const result = await detector.detect(preferences, null);

    expect(result.maestri.state).toBe('available');
    expect(result.maestri.candidates[0]?.version).toBe('maestri 0.25.0');
  });

  it('stamps only validated preferences and clears stale timestamps when a path is removed', async () => {
    const detector = createToolDetector({ platform: 'win32', stat: async () => ({ isFile: () => true }), access: async () => {},
      run: async () => 'omp 24.1.0', clock: () => 1234 });
    const stamped = await detector.stamp(preferences, { omp: 'C:\\OMP ç\\omp.exe' });

    expect(stamped.omp).toEqual({ preferred_path: 'C:\\OMP ç\\omp.exe', last_validated_at_ms: 1234 });
    await expect(detector.stamp(preferences, { git: 'C:\\wrong.exe' })).rejects.toThrow('TOOL_PREFERENCE_INVALID');
    const cleared = await detector.stamp(stamped, { omp: null });
    expect(cleared.omp).toEqual({ preferred_path: null, last_validated_at_ms: null });
  });

  it('keeps native executable discovery unavailable off Windows', async () => {
    const run = vi.fn(async () => 'must not run');
    const detector = createToolDetector({ environment: () => ({ PATH: '/usr/bin' }), platform: 'linux', run });

    const result = await detector.detect(preferences, null);

    expect(result.git.state).toBe('unavailable');
    expect(result.gh.state).toBe('unavailable');
    expect(run).not.toHaveBeenCalled();
  });

  it('does not claim absence when the PATH candidate scan reaches its bound', async () => {
    const path = Array.from({ length: 129 }, (_, index) => `C:\\Tools\\${index}`).join(';');
    const detector = createToolDetector({ environment: () => ({ PATH: path }), platform: 'win32',
      stat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }, access: async () => {}, run: async () => 'unused' });

    const result = await detector.detect(preferences, null);

    expect(result.git).toMatchObject({ state: 'ambiguous', selected_path: null, candidates: [], diagnostic: 'TOOL_DISCOVERY_INCOMPLETE' });
  });
});
