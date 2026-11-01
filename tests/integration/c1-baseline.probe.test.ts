import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueue } from '../../apps/controller/src/modules/projects/index.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';

type Stage =
  | 'queue.observe'
  | 'queue.revalidateForDispatch'
  | 'preparations.createPreparation'
  | 'preparations.getPreparation'
  | 'preparations.prepareReadyStart'
  | 'preparations.revalidateSummary'
  | 'pipeline.acceptance'
  | 'unclassified';
type MeasurementMode = 'before' | 'after';
type Dependency =
  | 'getIdentity'
  | 'getIssueContextById'
  | 'getProject'
  | 'listProjectItems'
  | 'inspectOrigin';
type StageCounts = Record<Dependency, number>;
type Sample = {
  sample: number;
  mode: MeasurementMode;
  preparationId: string;
  attemptId: string;
  dispatchBoundary: string;
  queueObserveCalls: number;
  queueRevalidationCalls: number;
  prepareReadyStartCalls: number;
  preparationOperationId: string;
  attemptOperationId: string;
  preAcceptanceSummaryRevalidations: number;
  postAcceptanceSummaryRevalidations: number;
  completePreparationObservations: number;
  preparationIssueQueries: number;
  dependencyCallsByStage: Record<Stage, StageCounts>;
  pipelineCalls: {
    getCatalog: number;
    roleResources: number;
    observeManagedTerminal: number;
    observeTools: number;
    prepareAttempt: number;
    startPassage: number;
    rateLimitSnapshotReads: number;
  };
  dispatchToDurableAcceptanceMs: number;
  dispatchToStartPassageDoubleMs: number;
};

const fixtures: AttemptFixture[] = [];
const readSystemNow = Date.now.bind(Date);
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

function emptyStageCounts(): Record<Stage, StageCounts> {
  const empty = (): StageCounts => ({
    getIdentity: 0,
    getIssueContextById: 0,
    getProject: 0,
    listProjectItems: 0,
    inspectOrigin: 0,
  });
  return {
    'queue.observe': empty(),
    'queue.revalidateForDispatch': empty(),
    'preparations.createPreparation': empty(),
    'preparations.getPreparation': empty(),
    'preparations.prepareReadyStart': empty(),
    'preparations.revalidateSummary': empty(),
    'pipeline.acceptance': empty(),
    unclassified: empty(),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function summarize(values: number[]): { values: number[]; median: number; min: number; max: number; medianAbsoluteDeviation: number } {
  const center = median(values);
  return {
    values,
    median: Number(center.toFixed(3)),
    min: Number(Math.min(...values).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
    medianAbsoluteDeviation: Number(median(values.map(value => Math.abs(value - center))).toFixed(3)),
  };
}

async function runSample(sampleNumber: number, mode: MeasurementMode): Promise<Sample> {
  const fixture = await attemptFixture();
  fixtures.push(fixture);
  await fixture.pipeline.close();

  const settings = fixture.storage.getGlobalConfiguration();
  fixture.storage.saveSettings({
    operationId: randomUUID(),
    expectedRevision: settings.etag,
    changes: { automation_enabled: true },
    body: { changes: { automation_enabled: true } },
  });
  const current = fixture.storage.getConfiguration(fixture.projectId);
  const {
    id: _id,
    project_id: _projectId,
    revision: _revision,
    created_at_ms: _createdAtMs,
    ...configuration
  } = current.view.configuration;
  fixture.storage.saveConfiguration({
    operationId: randomUUID(),
    expectedRevision: current.etag,
    projectId: fixture.projectId,
    body: { project_changes: { automation_enabled: true } },
    configuration: { ...configuration, automation_enabled: true },
    globalChanges: {},
  });
  vi.mocked(fixture.github.listProjectItems).mockResolvedValue(complete([{
    id: 'ITEM_test',
    archived: false,
    kind: 'issue',
    contentId: fixture.issue.id,
    title: fixture.issue.title,
    url: fixture.issue.url,
    executable: true,
  }]));

  const counts = emptyStageCounts();
  let activeStage: Stage = 'unclassified';
  const track = (dependency: Dependency): void => { counts[activeStage][dependency] += 1; };
  const withStage = async <T>(stage: Stage, run: () => Promise<T>): Promise<T> => {
    const previous = activeStage;
    activeStage = stage;
    try { return await run(); }
    finally { activeStage = previous; }
  };
  const dependencyDelayMs = 3;
  const delay = () => new Promise<void>(resolve => setTimeout(resolve, dependencyDelayMs));

  const getIdentity = vi.mocked(fixture.github.getIdentity).getMockImplementation();
  if (!getIdentity) throw new Error('BASELINE_GET_IDENTITY_DOUBLE_MISSING');
  vi.spyOn(fixture.github, 'getIdentity').mockImplementation(async () => {
    track('getIdentity'); await delay(); return getIdentity();
  });
  const getIssueContextById = vi.mocked(fixture.github.getIssueContextById).getMockImplementation();
  if (!getIssueContextById) throw new Error('BASELINE_GET_ISSUE_DOUBLE_MISSING');
  vi.spyOn(fixture.github, 'getIssueContextById').mockImplementation(async (...args) => {
    track('getIssueContextById'); await delay(); return getIssueContextById(...args);
  });
  const getProject = vi.mocked(fixture.github.getProject).getMockImplementation();
  if (!getProject) throw new Error('BASELINE_GET_PROJECT_DOUBLE_MISSING');
  vi.spyOn(fixture.github, 'getProject').mockImplementation(async (...args) => {
    track('getProject'); await delay(); return getProject(...args);
  });
  const listProjectItems = vi.mocked(fixture.github.listProjectItems).getMockImplementation();
  if (!listProjectItems) throw new Error('BASELINE_LIST_ITEMS_DOUBLE_MISSING');
  vi.spyOn(fixture.github, 'listProjectItems').mockImplementation(async (...args) => {
    track('listProjectItems'); await delay(); return listProjectItems(...args);
  });
  const inspectOriginImplementation = vi.mocked(fixture.workspaces.inspectOrigin).getMockImplementation();
  if (!inspectOriginImplementation) throw new Error('BASELINE_INSPECT_ORIGIN_DOUBLE_MISSING');
  const inspectOrigin = inspectOriginImplementation as typeof fixture.workspaces.inspectOrigin;
  vi.spyOn(fixture.workspaces, 'inspectOrigin').mockImplementation(async (...args) => {
    track('inspectOrigin'); await delay(); return inspectOrigin(...args);
  });

  const queue = createQueue({
    storage: fixture.storage,
    github: fixture.github,
    workspaces: fixture.workspaces,
    hostName: 'test-host',
  });
  let queueObserveCalls = 0;
  const observe = queue.observe.bind(queue);
  vi.spyOn(queue, 'observe').mockImplementation(async (...args) => {
    queueObserveCalls += 1;
    return withStage('queue.observe', () => observe(...args));
  });
  let queueRevalidationCalls = 0;
  const revalidateForDispatch = queue.revalidateForDispatch.bind(queue);
  vi.spyOn(queue, 'revalidateForDispatch').mockImplementation(async (...args) => {
    queueRevalidationCalls += 1;
    return withStage('queue.revalidateForDispatch', () => revalidateForDispatch(...args));
  });

  let prepareReadyStartCalls = 0;
  let preAcceptanceSummaryRevalidations = 0;
  let postAcceptanceSummaryRevalidations = 0;
  let durableAcceptanceAt: number | null = null;
  let acceptedAttemptId: string | null = null;
  let preparationOperationId: string | null = null;
  let attemptOperationId: string | null = null;
  let preparationId: string | null = null;
  const prepareReadyStart = fixture.preparations.prepareReadyStart.bind(fixture.preparations);
  const preparations = {
    ...fixture.preparations,
    createPreparation: async (...args: Parameters<typeof fixture.preparations.createPreparation>) =>
      withStage('preparations.createPreparation', () => fixture.preparations.createPreparation(...args)),
    getPreparation: async (...args: Parameters<typeof fixture.preparations.getPreparation>) =>
      withStage('preparations.getPreparation', () => fixture.preparations.getPreparation(...args)),
    prepareReadyStart: async (...args: Parameters<typeof fixture.preparations.prepareReadyStart>) => {
      prepareReadyStartCalls += 1;
      const result = mode === 'before'
        ? await (async () => {
          const created = await withStage('preparations.createPreparation', () => fixture.preparations.createPreparation(...args));
          const prepared = await withStage('preparations.getPreparation', () => fixture.preparations.getPreparation(created.view.preparation.id));
          return {
            body: {
              preparationId: prepared.view.preparation.id,
              preparationRevision: prepared.view.preparation.revision,
              authorizedSummaryHash: prepared.view.preparation.summary_hash,
              authorized: true as const,
            },
            expectedRevision: prepared.etag,
            operationId: created.operationId,
            receipt: created.receipt,
          };
        })()
        : await withStage('preparations.prepareReadyStart', () => prepareReadyStart(...args));
      preparationId = result.body.preparationId;
      preparationOperationId = result.operationId;
      return result;
    },
    revalidateSummary: async (...args: Parameters<typeof fixture.preparations.revalidateSummary>) => {
      const stage: Stage = durableAcceptanceAt === null ? 'preparations.revalidateSummary' : 'pipeline.acceptance';
      if (stage === 'preparations.revalidateSummary') preAcceptanceSummaryRevalidations += 1;
      else postAcceptanceSummaryRevalidations += 1;
      return withStage(stage, () => fixture.preparations.revalidateSummary(...args));
    },
  };

  let dispatchStartedAt: number | null = null;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    const value = readSystemNow();
    if (dispatchStartedAt === null && new Error().stack?.includes('dispatchQueueCandidate')) {
      dispatchStartedAt = performance.now();
    }
    return value;
  });

  const createAttempt = fixture.storage.createAttempt.bind(fixture.storage);
  vi.spyOn(fixture.storage, 'createAttempt').mockImplementation(input => {
    const result = createAttempt(input);
    if (result.created) {
      durableAcceptanceAt = performance.now();
      acceptedAttemptId = result.operation.resource.id;
      preparationId = input.command.body.preparationId;
      attemptOperationId = input.command.operationId;
    }
    return result;
  });

  const pipelineCalls = {
    getCatalog: 0,
    roleResources: 0,
    observeManagedTerminal: 0,
    observeTools: 0,
    prepareAttempt: 0,
    startPassage: 0,
    rateLimitSnapshotReads: 0,
  };
  const getCatalog = vi.mocked(fixture.execution.getCatalog).getMockImplementation();
  if (!getCatalog) throw new Error('BASELINE_CATALOG_DOUBLE_MISSING');
  vi.spyOn(fixture.execution, 'getCatalog').mockImplementation(async (...args) => {
    pipelineCalls.getCatalog += 1;
    return getCatalog(...args);
  });
  const roleResources = vi.mocked(fixture.execution.roleResources).getMockImplementation();
  if (!roleResources) throw new Error('BASELINE_ROLE_RESOURCES_DOUBLE_MISSING');
  vi.spyOn(fixture.execution, 'roleResources').mockImplementation((...args) => {
    pipelineCalls.roleResources += 1;
    return roleResources(...args);
  });
  const observeManagedTerminal = vi.mocked(fixture.execution.observeManagedTerminal!).getMockImplementation();
  if (!observeManagedTerminal) throw new Error('BASELINE_TERMINAL_DOUBLE_MISSING');
  vi.spyOn(fixture.execution, 'observeManagedTerminal').mockImplementation(async (...args) => {
    pipelineCalls.observeManagedTerminal += 1;
    return observeManagedTerminal(...args);
  });
  const observeToolsImplementation = vi.mocked(fixture.observeTools).getMockImplementation();
  if (!observeToolsImplementation) throw new Error('BASELINE_TOOLS_DOUBLE_MISSING');
  const observeTools = observeToolsImplementation as typeof fixture.observeTools;
  vi.spyOn(fixture, 'observeTools').mockImplementation(async (...args) => {
    pipelineCalls.observeTools += 1;
    return observeTools(...args);
  });
  const prepareAttemptImplementation = vi.mocked(fixture.workspaces.prepareAttempt).getMockImplementation();
  if (!prepareAttemptImplementation) throw new Error('BASELINE_PREPARE_ATTEMPT_DOUBLE_MISSING');
  const prepareAttempt = prepareAttemptImplementation as typeof fixture.workspaces.prepareAttempt;
  vi.spyOn(fixture.workspaces, 'prepareAttempt').mockImplementation(async (...args) => {
    pipelineCalls.prepareAttempt += 1;
    return prepareAttempt(...args);
  });
  let startPassageAt: number | null = null;
  const startPassage = vi.mocked(fixture.execution.startPassage).getMockImplementation();
  if (!startPassage) throw new Error('BASELINE_START_PASSAGE_DOUBLE_MISSING');
  vi.spyOn(fixture.execution, 'startPassage').mockImplementation(async (...args) => {
    pipelineCalls.startPassage += 1;
    startPassageAt = performance.now();
    return startPassage(...args);
  });
  const getRateLimitSnapshot = vi.mocked(fixture.github.getRateLimitSnapshot).getMockImplementation();
  if (!getRateLimitSnapshot) throw new Error('BASELINE_RATE_LIMIT_DOUBLE_MISSING');
  vi.spyOn(fixture.github, 'getRateLimitSnapshot').mockImplementation((...args) => {
    pipelineCalls.rateLimitSnapshotReads += 1;
    return getRateLimitSnapshot(...args);
  });

  fixture.pipeline = createPipeline({
    ...fixture.dependencies,
    preparations,
    github: fixture.github,
    queue,
  });
  const tickStartedAt = performance.now();
  await fixture.pipeline.tick();
  await fixture.pipeline.drain();

  expect(dispatchStartedAt).not.toBeNull();
  expect(durableAcceptanceAt).not.toBeNull();
  expect(startPassageAt).not.toBeNull();
  expect(preparationId).not.toBeNull();
  expect(acceptedAttemptId).not.toBeNull();
  expect(queueObserveCalls).toBe(1);
  expect(queueRevalidationCalls).toBe(2);
  expect(prepareReadyStartCalls).toBe(1);
  expect(preparationOperationId).not.toBeNull();
  expect(attemptOperationId).not.toBeNull();
  expect(attemptOperationId).not.toBe(preparationOperationId);
  expect(Object.values(counts).reduce((sum, stage) => sum + stage.getIdentity, 0)).toBeGreaterThanOrEqual(3);

  const preparationStages: Stage[] = [
    ...(mode === 'before'
      ? ['preparations.createPreparation', 'preparations.getPreparation'] as const
      : ['preparations.prepareReadyStart'] as const),
    'preparations.revalidateSummary',
  ];
  const preparationIssueQueries = preparationStages.reduce(
    (sum, stage) => sum + counts[stage].getIssueContextById,
    0,
  );
  const completePreparationObservations = preparationStages.reduce((total, stage) => {
    const stageCounts = counts[stage];
    return total + Math.min(stageCounts.getIdentity, stageCounts.getProject, stageCounts.inspectOrigin, stageCounts.getIssueContextById);
  }, 0);
  expect(completePreparationObservations).toBe(mode === 'before' ? 3 : 2);
  expect(preparationIssueQueries).toBe(mode === 'before' ? 4 : 3);
  expect(preAcceptanceSummaryRevalidations).toBe(1);
  expect(postAcceptanceSummaryRevalidations).toBe(1);
  expect(fixture.storage.listAttempts({}).items).toHaveLength(1);
  expect(fixture.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });

  const dispatchBoundary = 'first Date.now call with dispatchQueueCandidate on stack';
  const result: Sample = {
    sample: sampleNumber,
    mode,
    preparationId: preparationId!,
    attemptId: acceptedAttemptId!,
    preparationOperationId: preparationOperationId!,
    attemptOperationId: attemptOperationId!,
    dispatchBoundary,
    queueObserveCalls,
    queueRevalidationCalls,
    prepareReadyStartCalls,
    preAcceptanceSummaryRevalidations,
    postAcceptanceSummaryRevalidations,
    completePreparationObservations,
    preparationIssueQueries,
    dependencyCallsByStage: counts,
    pipelineCalls,
    dispatchToDurableAcceptanceMs: Number((durableAcceptanceAt! - dispatchStartedAt!).toFixed(3)),
    dispatchToStartPassageDoubleMs: Number((startPassageAt! - dispatchStartedAt!).toFixed(3)),
  };
  if (tickStartedAt > dispatchStartedAt!) throw new Error('DISPATCH_BOUNDARY_PRECEDES_TICK');
  return result;
}

describe('temporary C1 before-and-after measurement', () => {
  it('records paired controlled Ready dispatch paths using only temp SQLite and doubles', async () => {
    await runSample(0, 'before');
    await runSample(0, 'after');
    const pairs: Array<{ pair: number; before: Sample; after: Sample }> = [];
    for (let index = 1; index <= 7; index += 1) {
      const beforeFirst = index % 2 === 1;
      const first = await runSample(index, beforeFirst ? 'before' : 'after');
      const second = await runSample(index, beforeFirst ? 'after' : 'before');
      pairs.push({ pair: index, before: first.mode === 'before' ? first : second, after: first.mode === 'after' ? first : second });
    }
    const beforeSamples = pairs.map(pair => pair.before);
    const afterSamples = pairs.map(pair => pair.after);
    expect(beforeSamples.every(sample => JSON.stringify(sample.dependencyCallsByStage) === JSON.stringify(beforeSamples[0]!.dependencyCallsByStage))).toBe(true);
    expect(afterSamples.every(sample => JSON.stringify(sample.dependencyCallsByStage) === JSON.stringify(afterSamples[0]!.dependencyCallsByStage))).toBe(true);
    expect(beforeSamples.every(sample => JSON.stringify(sample.pipelineCalls) === JSON.stringify(beforeSamples[0]!.pipelineCalls))).toBe(true);
    expect(afterSamples.every(sample => JSON.stringify(sample.pipelineCalls) === JSON.stringify(afterSamples[0]!.pipelineCalls))).toBe(true);
    const acceptanceDeltas = pairs.map(pair => pair.after.dispatchToDurableAcceptanceMs - pair.before.dispatchToDurableAcceptanceMs);
    const startDeltas = pairs.map(pair => pair.after.dispatchToStartPassageDoubleMs - pair.before.dispatchToStartPassageDoubleMs);
    const project = (sample: Sample) => ({
      preparationId: sample.preparationId,
      attemptId: sample.attemptId,
      dispatchToDurableAcceptanceMs: sample.dispatchToDurableAcceptanceMs,
      dispatchToStartPassageDoubleMs: sample.dispatchToStartPassageDoubleMs,
    });
    console.log('C1_PAIRED_JSON=' + JSON.stringify({
      scenario: 'one configured project, one executable Ready issue, no blockers',
      storage: 'fresh temporary SQLite database per sample',
      providers: 'none; GitHub and OMP boundaries are test doubles',
      delayMsPerObservedIdentityIssueProjectItemsAndOriginCall: 3,
      warmupSamplesExcludedPerPath: 1,
      measuredPairs: pairs.length,
      failures: { before: 0, after: 0 },
      pollingIntervalMs: fixtures[fixtures.length - 1]!.storage.getSettings().time_defaults.polling_interval_ms,
      cacheCondition: 'Node/Vitest warm after the excluded sample; each measured sample uses a fresh SQLite database; no provider cache',
      dispatchBoundary: 'first Date.now call with dispatchQueueCandidate on stack; this precedes a few synchronous steps at function entry',
      logicalOperationsPerSample: {
        queue: { observe: 1, revalidateForDispatch: 2 },
        preparationsBefore: { createPreparation: 1, getPreparation: 1, revalidateSummary: 1 },
        preparationsAfter: { prepareReadyStart: 1, revalidateSummary: 1 },
        pipelineAcceptanceRenewal: 1,
      },
      logicalDependencyCallsByStagePerSample: {
        before: beforeSamples[0]!.dependencyCallsByStage,
        after: afterSamples[0]!.dependencyCallsByStage,
      },
      transitivePipelineCallsPerSample: {
        before: beforeSamples[0]!.pipelineCalls,
        after: afterSamples[0]!.pipelineCalls,
      },
      dispatchToDurableAcceptanceMs: { before: summarize(beforeSamples.map(sample => sample.dispatchToDurableAcceptanceMs)), after: summarize(afterSamples.map(sample => sample.dispatchToDurableAcceptanceMs)), pairedDeltaAfterMinusBefore: summarize(acceptanceDeltas) },
      dispatchToStartPassageDoubleMs: { before: summarize(beforeSamples.map(sample => sample.dispatchToStartPassageDoubleMs)), after: summarize(afterSamples.map(sample => sample.dispatchToStartPassageDoubleMs)), pairedDeltaAfterMinusBefore: summarize(startDeltas) },
      pairs: pairs.map(pair => ({ pair: pair.pair, before: project(pair.before), after: project(pair.after) })),
    }));
  }, 30_000);
});
