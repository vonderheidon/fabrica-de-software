import { Type, type Static } from '@sinclair/typebox';
import { GitHubBranch, GitHubRepository, GitHubDiagnostic } from './github.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
export const OriginSource = Type.Object({ kind: Type.Union([Type.Literal('local'), Type.Literal('github')]), location: text(32768) }, closed);
export type OriginSource = Static<typeof OriginSource>;
export const OriginRequest = Type.Object({ source: OriginSource, baseBranch: text(1024), remoteName: Type.Optional(text(128)) }, closed);
export type OriginRequest = Static<typeof OriginRequest>;
export const OriginDiagnostic = Type.Object({
  code: Type.Union((['CONTEXT_UNAVAILABLE', 'ORIGIN_INVALID', 'BRANCH_INVALID', 'BRANCH_NOT_FOUND', 'GIT_UNAVAILABLE',
    'GIT_RESPONSE_INVALID', 'REMOTE_MISSING', 'REMOTE_AMBIGUOUS', 'REMOTE_UNSUPPORTED', 'REMOTE_UNCONFIRMED',
    'REMOTE_MISMATCH', 'HEAD_UNBORN', 'LOCAL_CHANGES_EXCLUDED', 'ORIGIN_CHANGED', 'PROJECT_REQUIRED'] as const).map((code) => Type.Literal(code))),
  message: text(), recovery: text(),
}, closed);
export type OriginDiagnostic = Static<typeof OriginDiagnostic>;
export const OriginInspection = Type.Object({
  state: Type.Union([Type.Literal('identified'), Type.Literal('unavailable'), Type.Literal('invalid')]),
  source: Type.Union([OriginSource, Type.Null()]),
  local: Type.Union([Type.Object({
    root: text(32768), headSha: Type.Union([Type.String({ pattern: '^[0-9a-f]{40,64}$' }), Type.Null()]),
    dirty: Type.Boolean(),
  }, closed), Type.Null()]),
  base: Type.Union([Type.Object({ branch: text(1024), sha: Type.String({ pattern: '^[0-9a-f]{40,64}$' }), observedFrom: Type.Union([Type.Literal('local'), Type.Literal('github')]) }, closed), Type.Null()]),
  remote: Type.Union([Type.Object({
    name: Type.Union([text(128), Type.Null()]), url: text(), confirmed: Type.Boolean(),
    repository: Type.Union([GitHubRepository, Type.Null()]), branch: Type.Union([GitHubBranch, Type.Null()]),
  }, closed), Type.Null()]),
  diagnostics: Type.Array(OriginDiagnostic),
  githubDiagnostics: Type.Array(GitHubDiagnostic),
  retryAtMs: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]),
  /** Project membership is checked later against the issue; origin inspection never grants execution. */
  executionReady: Type.Literal(false),
}, closed);
export type OriginInspection = Static<typeof OriginInspection>;
