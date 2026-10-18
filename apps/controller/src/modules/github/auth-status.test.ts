import { describe, expect, it, vi } from 'vitest';
import { queryGhAuthentication } from './transport.js';
import type { GitHubContext } from './transport.js';

const context: GitHubContext = { kind: 'windows_keyring', executable: process.execPath, cwd: process.cwd() };

describe('GitHub CLI authentication observation', () => {
  it('queries only github.com and projects login/status fields without raw auth data', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stdout: JSON.stringify({ hosts: {
      'github.com': [
        { state: 'success', active: true, host: 'github.com', login: 'active-user', tokenSource: 'keyring', token: 'SECRET_MARKER' },
        { state: 'success', active: false, host: 'github.com', login: 'inactive-user', tokenSource: 'keyring', error: 'ERROR_SECRET_MARKER' },
        { state: 'error', active: false, host: 'github.com', login: 'invalid-user', tokenSource: 'keyring' },
      ],
      'github.enterprise.example': [{ state: 'success', active: true, host: 'github.enterprise.example', login: 'enterprise-user' }],
    } }) }));

    const result = await queryGhAuthentication(context, run);

    expect(run).toHaveBeenCalledWith(context, ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], 262_144, 15_000);
    expect(result).toEqual({ state: 'observed', accounts: [
      { login: 'active-user', active: true, valid: true },
      { login: 'inactive-user', active: false, valid: true },
      { login: 'invalid-user', active: false, valid: false },
    ], diagnostics: [{ code: 'GITHUB_AUTH_NEEDS_ATTENTION',
      message: 'Uma ou mais contas do GitHub CLI precisam de regularização.',
      recovery: 'Ative a conta ou regularize a autenticação no GitHub CLI fora da fábrica e consulte novamente.' }] });
    expect(JSON.stringify(result)).not.toContain('SECRET_MARKER');
    expect(JSON.stringify(result)).not.toContain('ERROR_SECRET_MARKER');
    expect(JSON.stringify(result)).not.toContain('enterprise-user');
  });

  it('returns a regularization orientation when github.com has no authenticated accounts', async () => {
    const result = await queryGhAuthentication(context, async () => ({ exitCode: 0, stdout: '{"hosts":{}}' }));
    expect(result).toMatchObject({ state: 'observed', accounts: [], diagnostics: [{ code: 'GITHUB_AUTH_REQUIRED' }] });
  });

  it('sanitizes fatal CLI failures and malformed machine output', async () => {
    const failed = await queryGhAuthentication(context, async () => ({ exitCode: 1, stdout: 'TOKEN_MARKER' }));
    const malformed = await queryGhAuthentication(context, async () => ({ exitCode: 0, stdout: 'TOKEN_MARKER' }));
    expect(failed).toMatchObject({ state: 'unavailable', accounts: [], diagnostics: [{ code: 'GITHUB_AUTH_STATUS_UNAVAILABLE' }] });
    expect(malformed).toMatchObject({ state: 'unavailable', accounts: [], diagnostics: [{ code: 'GITHUB_AUTH_RESPONSE_INVALID' }] });
    expect(JSON.stringify([failed, malformed])).not.toContain('TOKEN_MARKER');
  });

  it('does not run the CLI when the host did not supply authorized access', async () => {
    const run = vi.fn();
    const result = await queryGhAuthentication(undefined, run);
    expect(result).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'GITHUB_CONTEXT_UNAVAILABLE' }] });
    expect(run).not.toHaveBeenCalled();
  });
});
