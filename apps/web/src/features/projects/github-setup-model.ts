import type { GitHubSetupOptions } from '#contracts';

export type GitHubSetupAccount = GitHubSetupOptions['accounts'][number];

export function eligibleGitHubAccounts(options: GitHubSetupOptions | null): GitHubSetupAccount[] {
  return options?.accounts.filter((account) => account.active && account.valid && account.eligible) ?? [];
}

export function linkedAccountMatchesSettings(options: GitHubSetupOptions, settingsAccountId: string | null): boolean {
  return (options.linked_account?.id ?? null) === settingsAccountId;
}

export function accountBindingAction(options: GitHubSetupOptions, settingsAccountId: string | null, selectedAccountId: string | null, observationCurrent: boolean): 'bind' | 'switch' | null {
  if (!observationCurrent || !linkedAccountMatchesSettings(options, settingsAccountId) || selectedAccountId === null || selectedAccountId === settingsAccountId) return null;
  return settingsAccountId === null ? 'bind' : 'switch';
}
