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
  | 'preparations.revalidateSummary'
  | 'pipeline.acceptance'
  | 'unclassified';
type Dependency =
  | 'getIdentity'
  | 'getIssueContextById'
  | 'getProject'
  | 'listProjectItems'
  | 'inspectOrigin';
type StageCounts = Record<Dependency, number>;
type Sample = {
  sample: number;
  preparationId: string;
  attemptId: string;
  dispatchBoundary: string;
  queueObserveCalls: number;
  queueRevalidationCalls: number;
  preparationCreateCalls: number;
  preparationReadCalls: number;
  finalSummaryRevalidations: number;
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

async function runSample(sampleNumber: number, warmup: boolean): Promise<Sample> {
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

  const getIdentity = fixture.github.getIdentity.bind(fixture.github);
  vi.spyOn(fixture.github, 'getIdentity').mockImplementation(async () => {
    track('getIdentity'); await delay(); return getIdentity();
  });
  const getIssueContextById = fixture.github.getIssueContextById.bind(fixture.github);
  vi.spyOn(fixture.github, 'getIssueContextById').mockImplementation(async (...args) => {
    track('getIssueContextById'); await delay(); return getIssueContextById(...args);
  });
  const getProject = fixture.github.getProject.bind(fixture.github);
  vi.spyOn(fixture.github, 'getProject').mockImplementation(async (...args) => {
    track('getProject'); await delay(); return getProject(...args);
  });
  const listProjectItems = fixture.github.listProjectItems.bind(fixture.github);
  vi.spyOn(fixture.github, 'listProjectItems').mockImplementation(async (...args) => {
    track('listProjectItems'); await delay(); return listProjectItems(...args);
  });
  const inspectOrigin = fixture.workspaces.inspectOrigin.bind(fixture.workspaces);
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

  let preparationCreateCalls = 0;
  const createPreparation = fixture.preparations.createPreparation.bind(fixture.preparations);
  let preparationId: string | null = null;
  const preparations = {
    ...fixture.preparations,
    createPreparation: async (...args: Parameters<typeof fixture.preparations.createPreparation>) => {
      preparationCreateCalls += 1;
      const result = await withStage('preparations.createPreparation', () => createPreparation(...args));
      preparationId = result.view.preparation.id;
      return result;
    },
    getPreparation: async (...args: Parameters<typeof fixture.preparations.getPreparation>) => {
      return withStage('preparations.getPreparation', () => fixture.preparations.getPreparation(...args));
    },
    revalidateSummary: async (...args: Parameters<typeof fixture.preparations.revalidateSummary>) => {
      return withStage('preparations.revalidateSummary', () => fixture.preparations.revalidateSummary(...args));
    },
  };

  let dispatchStartedAt: number | null = null;
  const actualDateNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => {
    const value = actualDateNow();
    if (dispatchStartedAt === null && new Error().stack?.includes('dispatchQueueCandidate')) {
      dispatchStartedAt = performance.now();
    }
    return value;
  });

  let durableAcceptanceAt: number | null = null;
  let acceptedAttemptId: string | null = null;
  const createAttempt = fixture.storage.createAttempt.bind(fixture.storage);
  vi.spyOn(fixture.storage, 'createAttempt').mockImplementation(input => {
    const result = createAttempt(input);
    if (result.created) {
      durableAcceptanceAt = performance.now();
      acceptedAttemptId = result.operation.resource.id;
      preparationId = input.command.body.preparationId;
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
  vi.spyOn(fixture.execution, 'getCatalog').mockImplementation(async (...args) => {
    pipelineCalls.getCatalog += 1;
    return fixture.execution.getCatalog(...args);
  });
  vi.spyOn(fixture.execution, 'roleResources').mockImplementation((...args) => {
    pipelineCalls.roleResources += 1;
    return fixture.execution.roleResources(...args);
  });
  vi.spyOn(fixture.execution, 'observeManagedTerminal').mockImplementation(async (...args) => {
    pipelineCalls.observeManagedTerminal += 1;
    return fixture.execution.observeManagedTerminal!(...args);
  });
  vi.spyOn(fixture, 'observeTools').mockImplementation(async (...args) => {
    pipelineCalls.observeTools += 1;
    return fixture.observeTools(...args);
  });
  vi.spyOn(fixture.workspaces, 'prepareAttempt').mockImplementation(async (...args) => {
    pipelineCalls.prepareAttempt += 1;
    return fixture.workspaces.prepareAttempt(...args);
  });
  let startPassageAt: number | null = null;
  const startPassage = fixture.execution.startPassage.bind(fixture.execution);
  vi.spyOn(fixture.execution, 'startPassage').mockImplementation(async (...args) => {
    pipelineCalls.startPassage += 1;
    startPassageAt = performance.now();
    return startPassage(...args);
  });
  const getRateLimitSnapshot = fixture.github.getRateLimitSnapshot.bind(fixture.github);
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
  const pollingIntervalMs = fixture.storage.getSettings().time_defaults.polling_interval_ms;
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
  expect(preparationCreateCalls).toBe(1);
  expect(Object.values(counts).reduce((sum, stage) => sum + stage.getIdentity, 0)).toBeGreaterThanOrEqual(3);

  const preparationStages: Stage[] = [
    'preparations.createPreparation',
    'preparations.getPreparation',
    'preparations.revalidateSummary',
  ];
  const preparationIssueQueries = preparationStages.reduce(
    (sum, stage) => sum + counts[stage].getIssueContextById,
    0,
  );
  const completePreparationObservations = preparationStages.filter(stage =>
    counts[stage].getIdentity === 1
      && counts[stage].getProject === 1
      && counts[stage].inspectOrigin === 1
      && counts[stage].getIssueContextById >= 1,
  ).length;
  expect(completePreparationObservations).toBe(3);
  expect(preparationIssueQueries).toBe(4);
  expect(fixture.storage.listAttempts({}).items).toHaveLength(1);
  expect(fixture.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });

  const dispatchBoundary = 'first Date.now call with dispatchQueueCandidate on stack';
  const result: Sample = {
    sample: sampleNumber,
    preparationId: preparationId!,
    attemptId: acceptedAttemptId!,
    dispatchBoundary,
    queueObserveCalls,
    queueRevalidationCalls,
    preparationCreateCalls,
    preparationReadCalls: 1,
    finalSummaryRevalidations: 1,
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

describe('temporary C1 prior-path measurement', () => {
  it('records a controlled Ready dispatch baseline using only temp SQLite and doubles', async () => {
    await runSample(0, true);
    const samples: Sample[] = [];
    for (let index = 1; index <= 7; index += 1) samples.push(await runSample(index, false));
    const acceptanceTimes = samples.map(sample => sample.dispatchToDurableAcceptanceMs);
    const startTimes = samples.map(sample => sample.dispatchToStartPassageDoubleMs);
    console.log('C1_BASELINE_JSON=' + JSON.stringify({
      scenario: 'one configured project, one executable Ready issue, no blockers',
      storage: 'fresh temporary SQLite database per sample',
      providers: 'none; GitHub and OMP boundaries are test doubles',
      delayMsPerObservedIdentityIssueProjectAndOriginCall: 3,
      warmupSamplesExcluded: 1,
      measuredSamples: samples.length,
      pollingIntervalMs: fixtures[fixtures.length - 1]!.storage.getSettings().time_defaults.polling_interval_ms,
      cacheCondition: 'Node/Vitest warm after the excluded sample; each measured sample uses a fresh SQLite database; no provider cache',
      dispatchToDurableAcceptanceMs: {
        values: acceptanceTimes,
        median: Number(median(acceptanceTimes).toFixed(3)),
        min: Math.min(...acceptanceTimes),
        max: Math.max(...acceptanceTimes),
      },
      dispatchToStartPassageDoubleMs: {
        values: startTimes,
        median: Number(median(startTimes).toFixed(3)),
        min: Math.min(...startTimes),
        max: Math.max(...startTimes),
      },
      samples,
    }));
  });
});
