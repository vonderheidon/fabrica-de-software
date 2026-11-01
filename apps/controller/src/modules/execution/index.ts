import type { CatalogModel, ExecutionCatalog, ExecutionProfileValue, ExecutionQuestion, PassageBinding, PassageRequest, PassageResult, RoleResourceReference } from '#contracts';
import { createMaestriOmp } from './adapters/maestri-omp/adapter.js';
import { loadRoleResources } from './roles.js';

export type PassageHandle = Readonly<{ passageId: string }>;
import type { ExecutionCode } from './errors.js';
import type { ToolObservation } from '#contracts';
import type { AttemptAreaResolver } from '../workspaces/index.js';
export { ExecutionError, ResultValidationError, type ResultValidationIssue, type ExecutionCode } from './errors.js';
export type PassageState = 'starting' | 'ready' | 'partial' | 'interrupted' | 'cancelled';
export interface PassageRecord {
  handle: PassageHandle; binding: PassageBinding; requestHash: string; state: PassageState;
  roleResource: RoleResourceReference; terminalName: string; diagnostic: ExecutionCode | null;
  effectiveProfile: ExecutionProfileValue | null; executorVersion: string | null;
  terminalResourceName?: string; terminalId?: string | null; workspaceId?: string | null;
  attemptSessionId?: string; sessionDirectoryRelative?: string; terminalGeneration?: number; managedTerminalName?: string;
}
export interface AttemptSessionIdentity {
  id: string; attemptId: string; role: PassageBinding['role']; managedTerminalId: string;
  terminalName: string; terminalId: string | null; workspaceId: string | null; generation: number;
  terminalState: 'planned' | 'occupied' | 'available' | 'uncertain' | 'retired';
  state: 'reserved' | 'active' | 'completed' | 'uncertain' | 'interrupted';
  ompSessionId: string | null; sessionDirectoryRelative: string;
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
  reserve(input: PassageRecord, terminalAvailabilityConfirmed?: boolean): { created: boolean; record: PassageRecord };
  getAttemptSession(handle: PassageHandle, binding?: PassageBinding): AttemptSessionIdentity;
  allocateTerminal(handle: PassageHandle, binding?: PassageBinding): AttemptSessionIdentity;
  confirmTerminal(handle: PassageHandle, observation: { workspaceId: string; terminalId: string; ompSessionId: string }): void;
  claimContinuation(handle: PassageHandle): void;
  releaseOccupancy(handle: PassageHandle, state: 'released' | 'uncertain', reason: string | null): void;
  getPassage(handle: PassageHandle): PassageRecord;
  record(handle: PassageHandle, state: PassageState, code: ExecutionCode | null, event: ExecutionEvent['type']): void;
  /** Atomically save the observed exact profile/version, ready state and passage-ready event. */
  confirmReady(handle: PassageHandle, profile: ExecutionProfileValue, executorVersion: string): void;
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
  prepareTerminalLaunch?: (reference: { workspaceId: string; terminalName: string; generation?: number }, command: string) => Promise<string>;
  bindTerminalProcess?: (reference: { workspaceId: string; terminalName: string; terminalId: string; generation?: number }) => void;
  closeTerminalProcesses?: () => Promise<void>;
  /** Absolute native executable paths; CMD/BAT/PS1 launchers are rejected, never guessed. */
  maestriExecutable: string; ompExecutable: string; powershellExecutable: string;
  /** Only the environment actually inherited by the anchor process. Not an HTTP DTO. */
  inheritedEnvironment: NodeJS.ProcessEnv;
  openExistingTerminal?: (reference: { workspaceId: string; terminalId: string }) => Promise<void>;
  /** Stops only the identified factory terminal's processes, preserving its canvas identity.
   * Acceptance alone does not confirm termination; confirmStoppedTerminal must observe it.
   */
  stopTerminal?: (reference: { workspaceId: string; terminalName: string; terminalId: string; generation?: number }) => Promise<void>;
  /** Only a process-local owned launch may be stopped before terminal handshake. */
  stopPendingTerminal?: (reference: { workspaceId: string; terminalName: string; terminalId?: string; generation?: number }) => Promise<boolean>;
  /** Optional host capability: true requires current observation of this exact factory
   * terminal identity and confirmation that its prior process and known writers are stopped.
   * It gates both reuse/replacement and cleanup; CLI acceptance or a missing list entry is insufficient.
   * Never supplied by HTTP, environment flags, executable discovery or a user-provided PID.
   */
  confirmStoppedTerminal?: (reference: { workspaceId: string; terminalName: string; terminalId?: string; generation?: number }) => Promise<boolean>;
}
export interface ExecutionOptions {
  validatePassageScope?: (binding: PassageBinding) => Promise<void>;
  validateReviewerResult?: (binding: PassageBinding) => Promise<void>;
  dataDirectory: string; persistence: ExecutionPersistence; host?: ExecutionHost;
  resolveHost?: () => Promise<ExecutionHost | undefined>;
  projectStorageRootForAttempt?: (attemptId: string, allocate?: boolean) => Promise<string>;
  projectStorageAreaForAttempt?: AttemptAreaResolver;
  /** Defaults to resources distributed next to the application. */
  roleDirectory?: string;
}
export interface InteractionSurface {
  kind: 'terminal'; reference: string; available: boolean; reason: string | null;
  open: (() => Promise<void>) | null;
}
export interface Execution {
  observeManagedTerminal?: (reference: { workspaceId?: string; terminalName: string; terminalId?: string }) => Promise<'stopped' | 'running' | 'missing' | 'uncertain'>;
  reconcilePassageStop?: (handle: PassageHandle) => Promise<boolean>;
  /** Quiesce a live, completed reviewer before preparing its next immutable checkout. */
  preparePassageHandoff(source: PassageHandle): Promise<void>;
  getCatalog(): Promise<ExecutionCatalog>;
  continuePassage(source: PassageHandle, request: Omit<PassageRequest, 'cwd'> & { cwd?: string }): Promise<PassageRecord>;
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
export type { CatalogModel, ExecutionCatalog, ExecutionProfileValue, ExecutionProfileValue as ExecutionProfile, ExecutionQuestion, PassageBinding, PassageRequest, PassageResult, RoleResourceReference };
export { withWindowsTerminalJobs } from './terminal-jobs.js';
