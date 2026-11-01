export type ExecutionCode = 'CONTEXT_MISSING' | 'CONTEXT_STALE' | 'CLI_UNAVAILABLE' | 'CLI_UNSUPPORTED' |
  'INPUT_INVALID' | 'RESOURCE_INVALID' | 'PROFILE_MISMATCH' | 'HANDSHAKE_TIMEOUT' | 'TRACKING_LOST' |
  'FRAME_INVALID' | 'FRAME_OVERSIZE' | 'CHANNEL_EOF' | 'CHANNEL_TIMEOUT' | 'STORAGE_FAILED' |
  'RESULT_INVALID' | 'RESULT_CONFLICT' | 'ANSWER_CONFLICT' | 'CANCELLED' | 'LAUNCH_UNCERTAIN' | 'INTERACTION_UNAVAILABLE';
export class ExecutionError extends Error {
  constructor(readonly code: ExecutionCode) { super(code); this.name = 'ExecutionError'; }
}
export interface ResultValidationIssue { path: string; rule: string }
export class ResultValidationError extends ExecutionError {
  constructor(readonly issues: readonly ResultValidationIssue[]) { super('RESULT_INVALID'); }
}
