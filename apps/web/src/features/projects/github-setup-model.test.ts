import { describe, expect, it } from 'vitest';
import type { GitHubSetupOptions } from '#contracts';
import { accountBindingAction, eligibleGitHubAccounts, linkedAccountMatchesSettings } from './github-setup-model.js';

const options: GitHubSetupOptions = {
  executable: { state: 'observed', path: 'C:\\tools\\gh.exe', version: '2.0.0', diagnostics: [] },
  linked_account: { id: 'github-linked', login: 'linked-user' },
  observed_account: { id: 'github-active', login: 'active-user' },
  accounts: [
    { id: 'github-active', login: 'active-user', active: true, valid: true, eligible: true },
    { id: 'inactive-user', login: 'inactive-user', active: false, valid: true, eligible: false },
    { id: 'invalid-user', login: 'invalid-user', active: true, valid: false, eligible: false },
    { id: 'unconfirmed-user', login: 'unconfirmed-user', active: true, valid: true, eligible: false },
  ],
  diagnostics: [], retry_at_ms: null,
};

describe('GitHub setup account choices', () => {
  it('offers only accounts that are active, valid, and identity-confirmed', () => {
    expect(eligibleGitHubAccounts(options).map((account) => account.login)).toEqual(['active-user']);
  });

  it('binds an eligible observed login when no account is linked', () => {
    const unlinked = { ...options, linked_account: null };
    expect(linkedAccountMatchesSettings(unlinked, null)).toBe(true);
    expect(accountBindingAction(unlinked, null, 'github-active', true)).toBe('bind');
  });

  it('switches only after the linked identity agrees with the shared settings snapshot', () => {
    expect(accountBindingAction(options, 'github-linked', 'github-active', true)).toBe('switch');
    expect(accountBindingAction(options, 'different-settings-account', 'github-active', true)).toBeNull();
    expect(accountBindingAction(options, 'github-linked', 'github-active', false)).toBeNull();
  });

  it('does not issue a binding command when the selected login is already linked', () => {
    const current = { ...options, observed_account: options.linked_account,
      accounts: [{ id: 'github-linked', login: 'linked-user', active: true, valid: true, eligible: true }] };
    expect(accountBindingAction(current, 'github-linked', 'github-linked', true)).toBeNull();
  });
});
