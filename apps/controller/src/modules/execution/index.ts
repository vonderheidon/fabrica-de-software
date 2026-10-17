import type { ExecutionProfile, ExecutionQuestion, PassageBinding, PassageRequest, PassageResult, RoleResourceReference } from '#contracts';
import { createMaestriOmp } from './adapters/maestri-omp/adapter.js';
import { loadRoleResources } from './roles.js';

export type PassageHandle = Readonly<{ passageId: string }>;
import type { ExecutionCode } from './errors.js';
import type { ToolObservation } from '#contracts';
export { ExecutionError, type ExecutionCode } from './errors.js';
export type PassageState = 'starting' | 'ready' | 'partial' | 'interrupted' | 'cancelled';
export interface PassageRecord {
  handle: PassageHandle; binding: PassageBinding; requestHash: string; state: PassageState;
  roleResource: RoleResourceReference; terminalName: string; diagnostic: ExecutionCode | null;
  effectiveProfile: ExecutionProfile | null; executorVersion: string | null;
}
export interface ExecutionEvent { sequence: number; type: 'passage-ready' | 'question-raised' | 'question-answer-receipt' | 'result-accepted' | 'tracking-lost' | 'cleanup-updated'; code: ExecutionCode | null }
export interface ResultRecord { binding: PassageBinding; result: PassageResult; sha256: string; receiptId: string }
export interface QuestionRecord { binding: PassageBinding; questionId: string; question: ExecutionQuestion; sha256: string; scopeChange?: import('#contracts').ScopeChange }
export interface AnswerRecord { operationId: string; questionId: string; answer: string; state: 'recorded' | 'delivered' | 'delivery_unknown'; scopeDigest?: string }
export interface StopReceipt { passageId: string; state: 'requested' | 'confirmed' | 'uncertain' }

/** Synchronous durable operations supplied by the owning pipeline/storage composition.
 * reserve must reject conflicting identities and return an existing receipt for an identical request.
 * acceptResult/raiseQuestion/recordAnswer are atomic and idempotent; they commit before returning.
 * record and its event are atomic. Never substitute a volatile store in production.
 */
export interface ExecutionPersistence {
  reserve(input: PassageRecord): { created: boolean; record: PassageRecord };
  getPassage(handle: PassageHandle): PassageRecord;
  record(handle: PassageHandle, state: PassageState, code: ExecutionCode | null, event: ExecutionEvent['type']): void;
  /** Atomically save the observed exact profile/version, ready state and passage-ready event. */
  confirmReady(handle: PassageHandle, profile: ExecutionProfile, executorVersion: string): void;
  observe(handle: PassageHandle, after: number, limit: number): ExecutionEvent[];
  acceptResult(input: Omit<ResultRecord, 'receiptId'>): ResultRecord;
  getResult(handle: PassageHandle): ResultRecord | null;
  raiseQuestion(input: Omit<QuestionRecord, 'questionId'>): QuestionRecord;
  recordAnswer(handle: PassageHandle, questionId: string, answer: string, operationId: string): AnswerRecord;
  claimAnswer(handle: PassageHandle, operationId: string): boolean;
  confirmAnswer(handle: PassageHandle, operationId: string, state: AnswerRecord['state']): AnswerRecord;
  recordCancellation(attemptId: string, operationId: string): PassageHandle[];
  recordStop(handle: PassageHandle, receipt: StopReceipt): void;
}
export interface ExecutionHost {
  /** Absolute native executable paths; CMD/BAT/PS1 launchers are rejected, never guessed. */
  maestriExecutable: string; ompExecutable: string; powershellExecutable: string;
  /** Only the environment actually inherited by the anchor process. Not an HTTP DTO. */
  inheritedEnvironment: NodeJS.ProcessEnv;
  openExistingTerminal?: (reference: { workspaceId: string; terminalId: string }) => Promise<void>;
  /** Optional host capability: true requires observed termination of this factory terminal
   * and its known writers. CLI acceptance/absence from a UI list is insufficient.
   * Never supplied by HTTP, environment flags, executable discovery or a user-provided PID.
   */
  confirmStoppedTerminal?: (reference: { workspaceId: string; terminalName: string }) => Promise<boolean>;
}
export interface ExecutionOptions {
  validatePassageScope?: (binding: PassageBinding) => Promise<void>;
  validateReviewerResult?: (binding: PassageBinding) => Promise<void>;
  dataDirectory: string; persistence: ExecutionPersistence; host?: ExecutionHost;
  /** Defaults to resources distributed next to the application. */
  roleDirectory?: string;
}
export interface InteractionSurface {
  kind: 'terminal'; reference: string; available: boolean; reason: string | null;
  open: (() => Promise<void>) | null;
}
export interface Execution {
  continuePassage(source: PassageHandle, request: Omit<PassageRequest, 'cwd'>): Promise<PassageRecord>;
  observeVersions(): Promise<ToolObservation[]>;
  roleResources(): RoleResourceReference[];
  preflight(): Promise<{ ready: boolean; code: ExecutionCode | null; ompVersion: string | null }>;
  startPassage(request: PassageRequest, signal?: AbortSignal): Promise<PassageRecord>;
  observe(handle: PassageHandle, cursor?: number): ExecutionEvent[];
  getResult(handle: PassageHandle): ResultRecord | null;
  answerQuestion(handle: PassageHandle, questionId: string, answer: string, operationId: string): Promise<AnswerRecord>;
  cancelAttempt(attemptId: string, operationId: string): Promise<StopReceipt[]>;
  interactionSurface(handle: PassageHandle): InteractionSurface;
  close(): Promise<void>;
}
export function createExecution(options: ExecutionOptions): Execution {
  return createMaestriOmp(options, loadRoleResources(options.roleDirectory));
}
export type { ExecutionProfile, ExecutionQuestion, PassageBinding, PassageRequest, PassageResult, RoleResourceReference };
