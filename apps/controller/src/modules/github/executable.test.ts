import { describe, expect, it, vi } from 'vitest';
import { GitHubExecutableResolver } from './executable.js';
import { createGitHub } from './index.js';
import type { CommandResponse, GitHubContext, GitHubHostAccess } from './transport.js';
import type { ToolObservation } from '#contracts';

const access: GitHubHostAccess = { kind: 'windows_keyring', cwd: 'C:\\factory' };
function version(_context: GitHubContext, available: boolean): ToolObservation {
  return { tool: 'gh', state: available ? 'observed' : 'unavailable', version: available ? '2.70.0' : null,
    cause: available ? null : 'GH_VERSION_QUERY_FAILED', affectedRequirements: available ? [] : ['RF-28', 'RF-29'], observedAtMs: 1 };
}

describe('GitHub executable resolution', () => {
  it('revalidates the saved path first and falls through to other candidates after failure', async () => {
    const first = 'C:\\first\\gh.exe'; const second = 'D:\\configured\\gh.exe'; const saved = 'E:\\saved\\gh.exe';
    const attempted: string[] = [];
    const resolver = new GitHubExecutableResolver({ access,
      environment: () => ({ PATH: 'C:\\first', GH_PATH: second, GH_TOKEN: 'TOKEN_MARKER', GITHUB_TOKEN: 'OTHER_TOKEN_MARKER' }),
      stat: async () => ({ isFile: () => true }),
      observeVersion: async context => { attempted.push(context.executable); return version(context, context.executable === second); },
    });

    const result = await resolver.resolve(saved);

    expect(attempted).toEqual([saved, first, second]);
    expect(result.observation).toEqual({ state: 'observed', path: second, version: '2.70.0', diagnostics: [
      { code: 'GH_CANDIDATE_INVALID', message: 'Um candidato do GitHub CLI existe, mas não passou por gh --version.', recovery: 'A busca continuará; se nenhum candidato funcionar, selecione outro executável.' },
      { code: 'GH_CANDIDATE_INVALID', message: 'Um candidato do GitHub CLI existe, mas não passou por gh --version.', recovery: 'A busca continuará; se nenhum candidato funcionar, selecione outro executável.' },
    ] });
    expect(resolver.currentContext()).toMatchObject({ executable: second, kind: 'windows_keyring' });
    expect(JSON.stringify(result)).not.toContain('TOKEN_MARKER');
    expect(JSON.stringify(result)).not.toContain('OTHER_TOKEN_MARKER');
  });

  it('falls through the saved path to a valid GH_PATH candidate', async () => {
    const ghPath = 'D:\\stale\\gh.exe'; const saved = 'E:\\saved\\gh.exe';
    const attempted: string[] = [];
    const resolver = new GitHubExecutableResolver({ access,
      environment: () => ({ PATH: '', GH_PATH: ghPath }),
      stat: async () => ({ isFile: () => true }),
      observeVersion: async context => { attempted.push(context.executable); return version(context, context.executable === ghPath); },
    });

    const result = await resolver.resolve(saved);

    expect(attempted).toEqual([saved, ghPath]);
    expect(result.observation).toMatchObject({ state: 'observed', path: ghPath, version: '2.70.0' });
    expect(result.observation.diagnostics).toHaveLength(1);
  });

  it('does not report the CLI absent when the PATH candidate bound truncates discovery', async () => {
    const path = Array.from({ length: 257 }, (_, index) => `C:\\tools\\${index}`).join(';');
    const resolver = new GitHubExecutableResolver({ access, environment: () => ({ PATH: path }),
      stat: async () => ({ isFile: () => true }), observeVersion: async context => version(context, false),
    });
    const result = await resolver.resolve(null);
    expect(result.observation.state).toBe('unavailable');
    expect(result.observation.diagnostics.some(item => item.code === 'GH_DISCOVERY_INCOMPLETE')).toBe(true);
    expect(result.observation.diagnostics.at(-1)?.code).toBe('GITHUB_CLI_UNAVAILABLE');
  });

  it('validates a manual choice without activating it until the save is committed', async () => {
    const saved = 'E:\\old\\gh.exe'; const manual = 'F:\\selected\\gh.exe';
    const resolver = new GitHubExecutableResolver({ access, environment: () => ({ PATH: '', GH_PATH: '' }),
      stat: async () => ({ isFile: () => true }),
      observeVersion: async context => version(context, context.executable === manual),
    });
    const current = await resolver.resolve(saved);
    const validated = await resolver.validate(manual);

    expect(current.observation.state).toBe('unavailable');
    expect(resolver.currentContext()).toBeNull();
    expect(validated.observation).toMatchObject({ state: 'observed', path: manual, version: '2.70.0' });
    expect(resolver.currentContext()).toBeNull();
    resolver.activate(validated.observation);
    expect(resolver.currentContext()).toMatchObject({ executable: manual, kind: 'windows_keyring' });
  });

  it('does not discover a context when the host supplied no keyring capability', async () => {
    const stat = vi.fn(async () => ({ isFile: () => true }));
    const observeVersion = vi.fn(async (context: GitHubContext) => version(context, true));
    const resolver = new GitHubExecutableResolver({ environment: () => ({ PATH: 'C:\\tools' }), stat, observeVersion });

    const result = await resolver.resolve(null);

    expect(result.observation).toMatchObject({ state: 'unavailable', path: null, version: null });
    expect(result.observation.diagnostics[0]?.code).toBe('GITHUB_CONTEXT_UNAVAILABLE');
    expect(resolver.currentContext()).toBeNull();
    expect(stat).not.toHaveBeenCalled();
    expect(observeVersion).not.toHaveBeenCalled();
  });

  it('reports denied candidate inspection as unavailable instead of claiming the CLI is absent', async () => {
    const resolver = new GitHubExecutableResolver({ access, environment: () => ({ PATH: 'C:\\protected' }),
      stat: async () => { throw Object.assign(new Error('private'), { code: 'EACCES' }); },
      observeVersion: async context => version(context, true),
    });
    const result = await resolver.resolve(null);
    expect(result.observation.state).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('does not use token variables as candidates', async () => {
    const stat = vi.fn(async () => ({ isFile: () => true }));
    const observeVersion = vi.fn(async (context: GitHubContext) => version(context, true));
    const resolver = new GitHubExecutableResolver({ access,
      environment: () => ({ PATH: '', GH_TOKEN: 'GH_TOKEN_MARKER', GITHUB_TOKEN: 'GITHUB_TOKEN_MARKER' }), stat, observeVersion,
    });
    const result = await resolver.resolve(null);
    expect(result.observation.state).toBe('not_found');
    expect(result.observation.diagnostics.at(-1)?.code).toBe('GITHUB_CLI_NOT_FOUND');
    expect(stat).not.toHaveBeenCalled();
    expect(observeVersion).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('TOKEN_MARKER');
  });

  it('moves clients created before a save to the newly validated executable', async () => {
    const previous = 'C:\\old\\gh.exe'; const selected = 'D:\\new\\gh.exe'; const paths: string[] = [];
    const resolver = new GitHubExecutableResolver({ access, environment: () => ({ PATH: '', GH_PATH: '' }),
      stat: async () => ({ isFile: () => true }), observeVersion: async context => version(context, true),
    });
    const runnerFactory = (context: GitHubContext) => async (_input: string, onSend?: () => void): Promise<CommandResponse> => {
      paths.push(context.executable);
      onSend?.();
      return { exitCode: 0, stdout: `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ data: { viewer: { id: 'ACCOUNT_test', login: 'test-user' } } })}` };
    };
    const github = createGitHub({ access, resolver, savedExecutablePath: () => previous, runnerFactory });

    await github.resolveExecutable(previous);
    expect((await github.getIdentity()).state).toBe('complete');
    const validated = await github.validateExecutable(selected);
    github.activateExecutable(validated);
    expect((await github.getIdentity()).state).toBe('complete');

    expect(paths).toEqual([previous, selected]);
  });
});
