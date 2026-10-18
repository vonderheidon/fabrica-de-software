import { Type, type Static } from '@sinclair/typebox';
import { GitHubAccount, GitHubId } from './github.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });

export const GitHubSetupDiagnostic = Type.Object({
  code: text(128), message: text(), recovery: text(),
}, closed);
export type GitHubSetupDiagnostic = Static<typeof GitHubSetupDiagnostic>;

export const GitHubExecutableObservation = Type.Union([
  Type.Object({
    state: Type.Literal('observed'), path: text(4096), version: text(64),
    diagnostics: Type.Array(GitHubSetupDiagnostic, { maxItems: 100 }),
  }, closed),
  Type.Object({
    state: Type.Union([Type.Literal('not_found'), Type.Literal('unavailable')]),
    path: Type.Null(), version: Type.Null(), diagnostics: Type.Array(GitHubSetupDiagnostic, { maxItems: 100 }),
  }, closed),
]);
export type GitHubExecutableObservation = Static<typeof GitHubExecutableObservation>;

export const GitHubSetupAccount = Type.Object({
  id: GitHubId, login: Type.String({ minLength: 1, maxLength: 100 }),
  active: Type.Boolean(), valid: Type.Boolean(), eligible: Type.Boolean(),
}, closed);
export type GitHubSetupAccount = Static<typeof GitHubSetupAccount>;

export const AccountBinding = Type.Object({
  action: Type.Union([Type.Literal('bind'), Type.Literal('switch')]),
  account_id: GitHubId,
}, closed);
export type AccountBinding = Static<typeof AccountBinding>;

export const GitHubSetupOptions = Type.Object({
  executable: GitHubExecutableObservation,
  linked_account: Type.Union([GitHubAccount, Type.Null()]),
  observed_account: Type.Union([GitHubAccount, Type.Null()]),
  accounts: Type.Array(GitHubSetupAccount, { maxItems: 100 }),
  diagnostics: Type.Array(GitHubSetupDiagnostic, { maxItems: 100 }),
  retry_at_ms: Type.Union([timestamp, Type.Null()]),
}, closed);
export type GitHubSetupOptions = Static<typeof GitHubSetupOptions>;
