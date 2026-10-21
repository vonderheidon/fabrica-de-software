import { existsSync, mkdirSync } from 'node:fs';
import { acceptCreation, acceptCreationReconciliation, finishCreationReconciliation, completeCreation, failCreation, interruptCreations, readCreation, recordCreationStep, recoverCreation, type CreationCommand, type ReconcileCreationCommand } from './creations.js';
import type { CreationStep } from '#contracts';
export type { CreationCommand } from './creations.js';
import { readAttemptPage, readAttemptDetail, readDeliveryDetail } from './queries.js';
import type { AttemptListQuery, AttemptDetailQuery, DeliveryDetailQuery } from '#contracts';
import { recordEffectIntent, readEffect, claimEffect, finishEffect, assertEffectAuthorized, type EffectIntent } from './effects.js';
import { acceptPublication, recoverPublication, finishPublicationRequest, publicationSnapshot, recordAuthority, finalizeICR, publicationSummary, effectsFor, assertPublicationEligible, type PublicationCommand, type AuthorityObservation } from './publication.js';
export type { EffectIntent, EffectOrigin } from './effects.js';
export type { PublicationCommand, AuthorityObservation } from './publication.js';
import { readQuestion, recordAnswer, recoverAnswer, type AnswerCommand } from './questions.js';
import { expireLimits, readMeasurements } from './measurements.js';
import type { Question, AttemptMeasurements } from '#contracts';
export type { AnswerCommand } from './questions.js';
import { beginReview, readReview, readRounds, recordReviewIntegrity, recordReviewWorkspace, beginCorrection, openFindings, type CorrectionPlan } from './reviews.js';
import { ProducerResult, type RoundHistory, type Review, type Finding } from '#contracts';
import { Value } from '@sinclair/typebox/value';
export type { CorrectionPlan } from './reviews.js';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { beginVerification, startCheck, finishCheck, finishVerification, readArtifact, readCheckHistory, type VerificationPlan, type CheckCompletion } from './verification.js';
import type { Artifact, CheckHistory, CheckHistoryQuery } from '#contracts';
export type { VerificationPlan, CheckCompletion } from './verification.js';
import type { CatalogQuery, ConfigurationView, EventPage, EventQuery, FactorySettings, ProjectDetail, ProjectPage, SettingsView } from '#contracts';
import { StorageError } from './errors.js';
import { applyMigrations, inspectHistory, loadMigrations } from './migrations.js';
import { captureLocalHost, readGitHubExecutablePath, readLinkedGitHubAccount, readSettings, seedSettings } from './settings.js';
import { hasUncertainAccountCleanup, OperationError, readOperation, readCompletedProjectDeletion, saveTimeDefaults, settingsETag, type SaveTimeDefaults, type StoredOperation } from './operations.js';
import { attemptEvent, createAttempt, interruptAttempts, readAttempt, readCapture, recordDispatchFailure, recordWorkspace, recoverAttempt, type AttemptCommand, type CreateAttempt } from './attempts.js';
import { createExecutionPersistence } from './execution.js';
import { acceptRecovery, recoverRecovery, finishRecovery, readResources, readOwnedPassage, resourceSnapshot, validatePreviousAttempt, type RecoveryCommand, type ResourceSnapshot } from './recovery.js';
export type { RecoveryCommand, ResourceSnapshot } from './recovery.js';
import { beginCapture, deliveryView, finishCapture, recoverCaptureRetry, retryCapture, type CaptureClaim, type RetryCaptureCommand } from './deliveries.js';
import type { CapturedContent } from '../workspaces/index.js';
import type { DeliveryView, PassageBinding } from '#contracts';
export type { CaptureClaim, RetryCaptureCommand } from './deliveries.js';
import type { ExecutionPersistence } from '../execution/index.js';
import type { AttemptCapture, AttemptStatus } from '#contracts';
import { readEvents } from './events.js';
import { readOperationSummary } from './operation-summary.js';
import { acceptDiagnostic, recoverDiagnostic, finishDiagnostic, readContextDiagnostics, diagnosticContext, interruptDiagnostics, type DiagnosticCommand } from './diagnostics.js';
import type { DiagnosticContext, ContextDiagnostic, OperationSummaryQuery } from '#contracts';
export type { DiagnosticCommand } from './diagnostics.js';
import { readPreparation, recoverPreparationCommand, savePreparation, type PreparationCommand, type SavePreparation, type StoredPreparation } from './preparations.js';
import { configurationETag, digest, guarded, readConfiguration, readProject, readProjects, readSettingsView } from './configuration-reads.js';
import { recoverConfigurationCommand, registerProject, saveConfiguration, saveSettings, type ConfigurationCommand, type RegisterProject, type SaveConfiguration, type SaveSettings } from './configuration-writes.js';
import { latestIssueAttempt, readQueueCycle, recordQueueObservations, type QueueCycle, type QueueCycleObservation } from './queue-cycles.js';
import { queueETag, recoverQueueChange, saveQueueChange, type QueueChange } from './queue.js';
import type { QueueScope } from '#contracts';
import { createProjectDeletionPersistence, type FinalizeProjectDeletion } from './project-deletions.js';
import { createDeletionWorkerPersistence } from './project-deletion-worker.js';
export type { DeletionWorker } from './project-deletion-worker.js';
import type { ProjectDeletionInventory } from './project-deletion-inventory.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { acceptProjectDeletion, recoverProjectDeletion, readProjectDeletion, type AcceptProjectDeletion, type ProjectDeletionCommand } from './project-deletion-acceptance.js';
export type { AcceptProjectDeletion, ProjectDeletionCommand } from './project-deletion-acceptance.js';
export type { FinalizeProjectDeletion } from './project-deletions.js';
export type { ProjectDeletionInventory } from './project-deletion-inventory.js';

export { StorageError } from './errors.js';
export { OperationError, type SaveTimeDefaults, type StoredOperation } from './operations.js';
export { acquireControllerLock } from './controller-lock.js';
export { AttemptConflict, type AttemptCommand, type CreateAttempt } from './attempts.js';
export type { PreparationCommand, SavePreparation, StoredPreparation } from './preparations.js';
export type { ConfigurationCommand, RegisterProject, SaveConfiguration, SaveSettings } from './configuration-writes.js';
export type { QueueCycle, QueueCycleObservation } from './queue-cycles.js';

export interface Editable<T> { view: T; etag: string }

export interface StorageDiagnostics {
  readonly foreignKeys: 1;
  readonly journalMode: 'wal';
  readonly synchronous: 2;
  readonly busyTimeoutMs: number;
  readonly schemaVersion: number;
}

export interface Storage {
  deletionWorker: ReturnType<typeof createDeletionWorkerPersistence>;
  acceptProjectDeletion(input: AcceptProjectDeletion): ReturnType<typeof acceptProjectDeletion>;
  recoverProjectDeletion(command: ProjectDeletionCommand): ReturnType<typeof recoverProjectDeletion>;
  getProjectDeletion(operationId: string): ReturnType<typeof readProjectDeletion>;
  getProjectDeletionPaths(projectId: string): ReturnType<typeof readProjectDeletionPaths>;
  getProjectDeletionInventory(projectId: string): ProjectDeletionInventory;
  finalizeProjectDeletion(command: FinalizeProjectDeletion): { operation_id: string; state: 'succeeded' };
  captureLocalHost(): void;
  getOperationSummary(query: OperationSummaryQuery): ReturnType<typeof readOperationSummary>;
  getContextDiagnostics(context: DiagnosticContext): ReturnType<typeof readContextDiagnostics>;
  getDiagnosticContext(context: DiagnosticContext): ReturnType<typeof diagnosticContext>;
  acceptDiagnostic(command: DiagnosticCommand): ReturnType<typeof acceptDiagnostic>;
  recoverDiagnostic(command: DiagnosticCommand): StoredOperation | null;
  finishDiagnostic(command: DiagnosticCommand, results: ContextDiagnostic[]): void;
  interruptDiagnostics(): void;
  acceptCreation(command: CreationCommand): ReturnType<typeof acceptCreation>;
  acceptCreationReconciliation(command: ReconcileCreationCommand): ReturnType<typeof acceptCreationReconciliation>;
  finishCreationReconciliation(operationId: string,diagnostic: string | null): void;
  recoverCreation(command: CreationCommand): StoredOperation | null;
  getCreation(id: string): ReturnType<typeof readCreation>;
  recordCreationStep(id: string, step: CreationStep['step'], state: CreationStep['state'], baselineSha?: string): void;
  completeCreation(id: string): void;
  failCreation(id: string, diagnostic: string): void;
  interruptCreations(): void;
  listAttempts(query: AttemptListQuery): ReturnType<typeof readAttemptPage>;
  getAttemptDetail(id: string, query: AttemptDetailQuery): ReturnType<typeof readAttemptDetail>;
  getDeliveryDetail(id: string, query: DeliveryDetailQuery): ReturnType<typeof readDeliveryDetail>;
  recordEffectIntent(input: EffectIntent): ReturnType<typeof recordEffectIntent>;
  getEffect(id: string): ReturnType<typeof readEffect>;
  claimEffect(id: string, revision: number, sourceOperationId?: string): boolean;
  assertEffectAuthorized(id: string, sourceOperationId: string): void;
  finishEffect(...args: Parameters<typeof finishEffect> extends [unknown, ...infer Rest] ? Rest : never): void;
  getEffects(attemptId: string): ReturnType<typeof effectsFor>;
  getPublicationSnapshot(attemptId: string, deliveryId?: string): ReturnType<typeof publicationSnapshot>;
  getPublicationSummary(attemptId: string, deliveryId?: string): ReturnType<typeof publicationSummary>;
  assertPublicationEligible(attemptId: string, deliveryId: string, explicit: boolean): void;
  recordAuthority(id: string, stamp: string, observation: AuthorityObservation): void;
  finalizeICR(id: string, deliveryId: string, stamp: string, explicit: boolean): void;
  recoverPublication(command: PublicationCommand): StoredOperation | null;
  acceptPublication(command: PublicationCommand): ReturnType<typeof acceptPublication>;
  finishPublicationRequest(id: string, state: 'succeeded' | 'failed' | 'unknown', diagnostic: string | null): void;
  getAuthorityCandidates(): string[];
  recordControllerAccount(expectedRevision: number, observedAccountId: string | null): void;
  getPassageForAttempt(attemptId: string, passageId: string): ReturnType<typeof readOwnedPassage>;
  getResources(attemptId: string): ReturnType<typeof readResources>;
  getResourceSnapshot(attemptId: string, resourceId: string): ResourceSnapshot;
  validatePreviousAttempt(id: string, projectId: string, issueId: string): void;
  recoverRecovery(command: RecoveryCommand): StoredOperation | null;
  acceptRecovery(command: RecoveryCommand, snapshotStamp?: string): { operation: StoredOperation; created: boolean };
  finishRecovery(operationId: string, outcome: 'confirmed' | 'failed' | 'unknown'): void;
  getQuestion(attemptId: string, questionId: string): Editable<Question>;
  recordAnswer(command: AnswerCommand): StoredOperation;
  markAnswerUnknown(command: AnswerCommand): void;
  recoverAnswer(command: AnswerCommand): StoredOperation | null;
  getMeasurements(attemptId: string): AttemptMeasurements;
  expireLimits(): string[];
  getScopeCandidates(): PassageBinding[];
  getRounds(attemptId: string): RoundHistory;
  getProducerResult(deliveryId: string): ProducerResult;
  beginReview(deliveryId: string): Review | null;
  getReview(deliveryId: string): Review | null;
  getOpenFindings(attemptId: string, beforeRound: number): Finding[];
  recordReviewWorkspace(deliveryId: string, ready: boolean, diagnostic: string | null): void;
  recordReviewIntegrity(binding: PassageBinding, valid: boolean): void;
  beginCorrection(deliveryId: string): CorrectionPlan | null;
  beginVerification(deliveryId: string): VerificationPlan;
  startCheck(checkId: string): void;
  finishCheck(checkId: string, completion: CheckCompletion): void;
  finishVerification(id: string, diagnostic?: string | null): void;
  getArtifact(id: string): Artifact;
  getCheckHistory(deliveryId: string, query: CheckHistoryQuery): CheckHistory;
  onResultAccepted(listener: (binding: PassageBinding) => void): () => void;
  getDelivery(id: string): DeliveryView;
  beginCapture(id: string): CaptureClaim | null;
  finishCapture(claim: CaptureClaim, content: CapturedContent | null, diagnostic: string | null): void;
  recoverCaptureRetry(command: RetryCaptureCommand): StoredOperation | null;
  retryCapture(command: RetryCaptureCommand): { operation: StoredOperation; claim: CaptureClaim | null };
  createAttempt(input: CreateAttempt): { created: boolean; operation: StoredOperation };
  recoverAttempt(command: AttemptCommand): StoredOperation | null;
  getAttempt(id: string): AttemptStatus;
  getAttemptCapture(id: string): AttemptCapture;
  recordWorkspace(id: string, state: 'starting' | 'ready' | 'failed', owned: boolean, diagnostic: string | null): void;
  recordDispatchFailure(id: string, code: string): void;
  interruptAttempts(): void;
  executionPersistence(): ExecutionPersistence;
  getPreparation(id: string): StoredPreparation;
  recoverPreparationCommand(command: PreparationCommand): StoredOperation | null;
  savePreparation(input: SavePreparation): StoredOperation;
  getSettings(): FactorySettings;
  getGitHubExecutablePath(): string | null;
  getLinkedGitHubAccount(): { id: string; login: string } | null;
  getDiagnostics(): StorageDiagnostics;
  checkHealth(): void;
  getSettingsETag(): string;
  getOperation(operationId: string): StoredOperation | null;
  getCompletedProjectDeletion(operationId: string): ReturnType<typeof readCompletedProjectDeletion>;
  hasUncertainAccountCleanup(operationId: string): boolean;
  saveTimeDefaults(input: SaveTimeDefaults): StoredOperation;
  getEvents(query: EventQuery, through?: string): EventPage;
  getGlobalConfiguration(): Editable<SettingsView>;
  getProject(projectId: string): Editable<ProjectDetail>;
  listProjects(query: CatalogQuery): ProjectPage;
  getConfiguration(projectId: string): Editable<ConfigurationView>;
  recoverConfigurationCommand(command: ConfigurationCommand): StoredOperation | null;
  registerProject(input: RegisterProject): StoredOperation;
  saveSettings(input: SaveSettings): StoredOperation;
  saveConfiguration(input: SaveConfiguration): StoredOperation;
  getQueueCycle(accountId: string, projectId: string, issueId: string): QueueCycle | null;
  getLatestIssueAttempt(repositoryId: string, issueId: string): { id: string; active: boolean } | null;
  getQueueETag(scope: QueueScope): string;
  recoverQueueChange(command: QueueChange): StoredOperation | null;
  saveQueueChange(command: QueueChange): StoredOperation;
  recordQueueObservations(observations: readonly QueueCycleObservation[]): void;
  close(): void;
}

export interface StorageOptions {
  readonly dataDirectory: string;
  readonly busyTimeoutMs?: number;
}

export function openStorage(options: StorageOptions): Storage {
  const timeout = options.busyTimeoutMs ?? 5000;
  if (!options.dataDirectory.trim() || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) {
    throw new StorageError('STORAGE_CONFIGURATION_INVALID');
  }
  const directory = resolve(options.dataDirectory);
  const filename = resolve(directory, 'factory.sqlite');
  const migrations = loadMigrations();
  let db: Database.Database | undefined;
  try {
    // Incompatible existing files are inspected without changing their journal or content.
    if (existsSync(filename)) {
      const probe = new Database(filename, { readonly: true, fileMustExist: true, timeout });
      try { inspectHistory(probe, migrations); } finally { probe.close(); }
    }
    mkdirSync(directory, { recursive: true });
    db = new Database(filename, { timeout });
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    const foreignKeys: unknown = db.pragma('foreign_keys', { simple: true });
    const journalMode: unknown = db.pragma('journal_mode', { simple: true });
    const synchronous: unknown = db.pragma('synchronous', { simple: true });
    const busyTimeout: unknown = db.pragma('busy_timeout', { simple: true });
    if (foreignKeys !== 1 || journalMode !== 'wal' || synchronous !== 2 || busyTimeout !== timeout) {
      throw new StorageError('STORAGE_PRAGMA_MISMATCH');
    }
    const connection = db;
    const projectDeletions = createProjectDeletionPersistence(connection);
    const resultListeners = new Set<(binding: PassageBinding) => void>();
    applyMigrations(connection, migrations, () => seedSettings(connection));
    const tables = connection.prepare<[], { name: string; strict: number }>(
      "SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND name NOT LIKE 'sqlite_%'",
    ).all();
    const foreignKeyViolations: unknown = connection.pragma('foreign_key_check');
    if (tables.some((table) => table.strict !== 1) || !Array.isArray(foreignKeyViolations) || foreignKeyViolations.length !== 0) {
      throw new StorageError('STORAGE_INTEGRITY_FAILED');
    }
    readSettings(connection);
    const diagnostics: StorageDiagnostics = Object.freeze({
      foreignKeys, journalMode, synchronous, busyTimeoutMs: timeout, schemaVersion: migrations.length,
    });
    return {
      deletionWorker: createDeletionWorkerPersistence(connection, directory),
      getProjectDeletionPaths: projectId => guarded(() => connection.transaction(() => readProjectDeletionPaths(connection, projectId, directory))()),
      acceptProjectDeletion: input => guarded(() => acceptProjectDeletion(connection, directory, input)),
      recoverProjectDeletion: command => guarded(() => connection.transaction(() => recoverProjectDeletion(connection, command))()),
      getProjectDeletion: operationId => guarded(() => connection.transaction(() => readProjectDeletion(connection, operationId))()),
      getProjectDeletionInventory: projectId => guarded(() => projectDeletions.inventory(projectId)),
      finalizeProjectDeletion: command => guarded(() => projectDeletions.finalize(command)),
      captureLocalHost: () => guarded(() => captureLocalHost(connection)),
      listAttempts: query => guarded(() => connection.transaction(() => readAttemptPage(connection, query))()),
      getAttemptDetail: (id, query) => guarded(() => connection.transaction(() => readAttemptDetail(connection, id, query))()),
      getDeliveryDetail: (id, query) => guarded(() => connection.transaction(() => readDeliveryDetail(connection, id, query))()),
      recordEffectIntent: input => recordEffectIntent(connection, input),
      getEffect: id => guarded(() => connection.transaction(() => readEffect(connection, id))()),
      claimEffect: (id, revision, sourceOperationId) => claimEffect(connection, id, revision, sourceOperationId),
      assertEffectAuthorized: (id, sourceOperationId) => guarded(() => connection.transaction(() => assertEffectAuthorized(connection,id,sourceOperationId))()),
      finishEffect: (...args) => finishEffect(connection, ...args),
      getEffects: id => guarded(() => connection.transaction(() => effectsFor(connection, id))()),
      getPublicationSnapshot: (id, deliveryId) => guarded(() => connection.transaction(() => publicationSnapshot(connection, id, deliveryId))()),
      getPublicationSummary: (id, deliveryId) => guarded(() => connection.transaction(() => publicationSummary(connection, id, deliveryId))()),
      assertPublicationEligible: (id, deliveryId, explicit) => guarded(() => connection.transaction(() => assertPublicationEligible(connection, id, deliveryId, explicit))()),
      recordAuthority: (id, stamp, observation) => recordAuthority(connection, id, stamp, observation),
      finalizeICR: (id, deliveryId, stamp, explicit) => finalizeICR(connection, id, deliveryId, stamp, explicit),
      recoverPublication: command => guarded(() => connection.transaction(() => recoverPublication(connection, command))()),
      acceptPublication: command => acceptPublication(connection, command),
      finishPublicationRequest: (id, state, diagnostic) => finishPublicationRequest(connection, id, state, diagnostic),
      getAuthorityCandidates: () => guarded(() => connection.prepare<[string | null], { id: string }>('SELECT id FROM attempts WHERE account_id IS ? AND result IS NULL ORDER BY created_at_ms,id').all(readSettings(connection).account_id).map(a => a.id)),
      recordControllerAccount: (expectedRevision, observedAccountId) => guarded(() => connection.transaction(() => {
        const settings = readSettings(connection);
        if (settings.revision !== expectedRevision) throw new OperationError(412,'REVISION_CONFLICT','The configured account changed during observation.');
        connection.prepare(`INSERT INTO controller_authority(id,configured_account_id,observed_account_id,dispatch_paused,observed_at_ms) VALUES ('local',?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET configured_account_id=excluded.configured_account_id,observed_account_id=excluded.observed_account_id,dispatch_paused=excluded.dispatch_paused,observed_at_ms=excluded.observed_at_ms`)
          .run(settings.account_id,observedAccountId,observedAccountId !== null && observedAccountId === settings.account_id ? 0 : 1,Date.now());
      }).immediate()),
      getPassageForAttempt: (id, passageId) => guarded(() => connection.transaction(() => readOwnedPassage(connection, id, passageId))()),
      getResources: id => guarded(() => connection.transaction(() => readResources(connection, id))()),
      getResourceSnapshot: (id, resourceId) => guarded(() => connection.transaction(() => resourceSnapshot(connection, id, resourceId))()),
      validatePreviousAttempt: (id, projectId, issueId) => guarded(() => connection.transaction(() => validatePreviousAttempt(connection, id, projectId, issueId))()),
      recoverRecovery: command => guarded(() => connection.transaction(() => recoverRecovery(connection, command))()),
      acceptRecovery: (command, stamp) => acceptRecovery(connection, command, stamp),
      finishRecovery: (id, outcome) => finishRecovery(connection, id, outcome),
      getQuestion: (id, q) => guarded(() => connection.transaction(() => readQuestion(connection, id, q))()),
      recordAnswer: command => recordAnswer(connection, command),
      markAnswerUnknown: command => guarded(() => connection.transaction(() => {
        const changed = connection.prepare("UPDATE execution_questions SET state='delivery_unknown',revision=revision+1 WHERE id=? AND attempt_id=? AND answer_operation_id=? AND state IN ('recorded','sending')")
          .run(command.questionId, command.attemptId, command.operationId);
        if (changed.changes) {
          connection.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), command.attemptId);
          attemptEvent(connection, command.attemptId, 'question.answer-unknown');
        }
      }).immediate()),
      recoverAnswer: command => guarded(() => connection.transaction(() => recoverAnswer(connection, command))()),
      getMeasurements: id => guarded(() => connection.transaction(() => readMeasurements(connection, id))()),
      expireLimits: () => guarded(() => connection.transaction(() => expireLimits(connection)).immediate()),
      getScopeCandidates: () => guarded(() => connection.transaction(() => connection.prepare<[string | null], PassageBinding>(`SELECT p.attempt_id AS attemptId,p.id AS passageId,p.role,p.round_number AS round,p.delivery_version AS deliveryVersion
        FROM passages p JOIN attempts a ON a.id=p.attempt_id WHERE a.account_id IS ? AND a.result IS NULL AND a.suspension IS NULL AND p.state='ready'
        AND NOT EXISTS (SELECT 1 FROM passage_results r WHERE r.passage_id=p.id)`).all(readSettings(connection).account_id))()),
      getRounds: id => guarded(() => connection.transaction(() => readRounds(connection, id))()),
      getProducerResult: id => guarded(() => connection.transaction(() => {
        const delivery = deliveryView(connection, id).delivery;
        const result = createExecutionPersistence(connection).getResult({ passageId: delivery.producerPassageId });
        if (!Value.Check(ProducerResult, result)) throw new StorageError('OPERATION_DATA_INVALID'); return result;
      })()),
      beginReview: id => beginReview(connection, id),
      getReview: id => guarded(() => connection.transaction(() => readReview(connection, id))()),
      getOpenFindings: (id, round) => guarded(() => connection.transaction(() => { readAttempt(connection, id); return openFindings(connection, id, round); })()),
      recordReviewWorkspace: (id, ready, code) => recordReviewWorkspace(connection, id, ready, code),
      recordReviewIntegrity: (binding, valid) => recordReviewIntegrity(connection, binding, valid),
      beginCorrection: id => beginCorrection(connection, id),
      beginVerification: id => beginVerification(connection, id),
      startCheck: id => startCheck(connection, id),
      finishCheck: (id, completion) => finishCheck(connection, id, completion),
      finishVerification: (id, diagnostic) => finishVerification(connection, id, diagnostic),
      getArtifact: id => guarded(() => connection.transaction(() => readArtifact(connection, id))()),
      getCheckHistory: (id, query) => guarded(() => connection.transaction(() => readCheckHistory(connection, id, query))()),
      onResultAccepted: (listener) => { resultListeners.add(listener); return () => { resultListeners.delete(listener); }; },
      getDelivery: (id) => guarded(() => connection.transaction(() => deliveryView(connection, id))()),
      beginCapture: (id) => beginCapture(connection, id),
      finishCapture: (claim, content, diagnostic) => finishCapture(connection, claim, content, diagnostic),
      recoverCaptureRetry: (command) => guarded(() => connection.transaction(() => recoverCaptureRetry(connection, command))()),
      retryCapture: (command) => retryCapture(connection, command),
      createAttempt: (input) => createAttempt(connection, input),
      recoverAttempt: (command) => guarded(() => connection.transaction(() => recoverAttempt(connection, command))()),
      getAttempt: (id) => guarded(() => connection.transaction(() => readAttempt(connection, id))()),
      getAttemptCapture: (id) => guarded(() => connection.transaction(() => readCapture(connection, id))()),
      recordWorkspace: (id, state, owned, diagnostic) => recordWorkspace(connection, id, state, owned, diagnostic),
      recordDispatchFailure: (id, code) => recordDispatchFailure(connection, id, code),
      interruptAttempts: () => { if (connection.open) interruptAttempts(connection); },
      executionPersistence: () => createExecutionPersistence(connection, binding => { for (const listener of resultListeners) listener(binding); }),
      getPreparation: (id) => guarded(() => connection.transaction(() => readPreparation(connection, id))()),
      recoverPreparationCommand: (command) => guarded(() => connection.transaction(() => recoverPreparationCommand(connection, command))()),
      savePreparation: (input) => savePreparation(connection, input),
      acceptCreation: command => acceptCreation(connection, command),
      acceptCreationReconciliation: command => acceptCreationReconciliation(connection,command),
      finishCreationReconciliation: (operationId,diagnostic) => finishCreationReconciliation(connection,operationId,diagnostic),
      recoverCreation: command => guarded(() => connection.transaction(() => recoverCreation(connection, command))()),
      getCreation: id => guarded(() => connection.transaction(() => readCreation(connection, id))()),
      recordCreationStep: (id, step, state, sha) => recordCreationStep(connection, id, step, state, sha),
      completeCreation: id => completeCreation(connection, id),
      failCreation: (id, diagnostic) => failCreation(connection, id, diagnostic),
      interruptCreations: () => interruptCreations(connection),
      getSettings: () => readSettings(connection),
      getGitHubExecutablePath: () => guarded(() => readGitHubExecutablePath(connection)),
      getLinkedGitHubAccount: () => guarded(() => readLinkedGitHubAccount(connection)),
      getSettingsETag: () => {
        const settings = readSettings(connection);
        return settingsETag(settings.installation_id, settings.revision);
      },
      getCompletedProjectDeletion: id => guarded(() => readCompletedProjectDeletion(connection, id)),
      getOperation: (id) => {
        try { return connection.transaction(() => readOperation(connection, id))(); }
        catch (error) {
          if (error instanceof StorageError || error instanceof OperationError) throw error;
          throw new StorageError('OPERATION_DATA_INVALID', { cause: error });
        }
      },
      hasUncertainAccountCleanup: (id) => guarded(() => connection.transaction(() => hasUncertainAccountCleanup(connection, id))()),
      saveTimeDefaults: (input) => saveTimeDefaults(connection, input),
      getEvents: (query, through) => readEvents(connection, query, through),
      getOperationSummary: query => guarded(() => connection.transaction(() => readOperationSummary(connection, query))()),
      getContextDiagnostics: context => guarded(() => connection.transaction(() => readContextDiagnostics(connection, context))()),
      getDiagnosticContext: context => guarded(() => connection.transaction(() => diagnosticContext(connection, context))()),
      acceptDiagnostic: command => acceptDiagnostic(connection, command),
      recoverDiagnostic: command => guarded(() => connection.transaction(() => recoverDiagnostic(connection, command))()),
      finishDiagnostic: (command, results) => finishDiagnostic(connection, command, results),
      interruptDiagnostics: () => { if (connection.open) interruptDiagnostics(connection); },
      getGlobalConfiguration: () => guarded(() => connection.transaction(() => {
        const view = readSettingsView(connection); return { view, etag: configurationETag(view) };
      })()),
      getProject: (id) => guarded(() => connection.transaction(() => {
        const view = readProject(connection, id); return { view, etag: `"${digest([view.project.id, view.project.current_revision_id, view.project.revision])}"` };
      })()),
      listProjects: (query) => guarded(() => connection.transaction(() => readProjects(connection, query))()),
      getConfiguration: (id) => guarded(() => connection.transaction(() => {
        const view = readConfiguration(connection, id); return { view, etag: configurationETag(view) };
      })()),
      recoverConfigurationCommand: (command) => guarded(() => connection.transaction(() => recoverConfigurationCommand(connection, command))()),
      registerProject: (input) => registerProject(connection, input),
      saveSettings: (input) => saveSettings(connection, input),
      saveConfiguration: (input) => saveConfiguration(connection, input),
      getQueueCycle: (accountId, projectId, issueId) => guarded(() => connection.transaction(() => readQueueCycle(connection, accountId, projectId, issueId))()),
      getLatestIssueAttempt: (repositoryId, issueId) => guarded(() => connection.transaction(() => latestIssueAttempt(connection, repositoryId, issueId))()),
      recordQueueObservations: observations => recordQueueObservations(connection, observations),
      getQueueETag: scope => guarded(() => connection.transaction(() => queueETag(connection, scope))()),
      recoverQueueChange: command => guarded(() => connection.transaction(() => recoverQueueChange(connection, command))()),
      saveQueueChange: command => saveQueueChange(connection, command),
      getDiagnostics: () => diagnostics,
      checkHealth: () => { connection.prepare('SELECT 1').get(); },
      close: () => { if (connection.open) connection.close(); },
    };
  } catch (error) {
    if (db?.open) db.close();
    if (error instanceof StorageError) throw error;
    throw new StorageError('STORAGE_OPEN_FAILED', { cause: error });
  }
}
