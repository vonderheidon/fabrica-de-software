import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { vi } from 'vitest';
import type { GitHubQueryResult, IssueContext, ProjectItem, QueueQuery } from '#contracts';
import type { BackendMeasurement } from './backend-measurement.js';
import { observationWire, type ObservationWireControls } from './observation-wire.js';
import { createQueue } from '../../apps/controller/src/modules/projects/index.js';
import { attemptFixture, complete } from './attempt.js';

// Private test protocol. No query, argv, response body or environment is retained.
export type ObservationPurpose = 'display' | 'scheduler' | 'scope' | 'authorization';
export type ObservationTrigger = 'mount' | 'event' | 'resync' | 'timer' | 'manual';
export interface ObservationSample {
  scenario: string; repetition: number; phase: 'cold' | 'warm';
  purpose: ObservationPurpose; trigger: ObservationTrigger;
  consumerId: string; executionId: string; physicalExecutionIds: string[];
  category: 'consumer' | 'logical' | 'synthetic_page';
  count: number; durationMs: number; completion: 'completed' | 'failed';
  projects: number; issuesPerProject: number; memberships: number; pages: number;
}
export interface ObservationScenario {
  id: string; issuesPerProject: number; memberships: 1 | 3; pages: 1 | 2;
  latencyMs: number;
}
export const observationScenarios: readonly ObservationScenario[] = [
  { id: 'base', issuesPerProject: 10, memberships: 1, pages: 1, latencyMs: 5 },
  { id: 'expanded', issuesPerProject: 10, memberships: 3, pages: 2, latencyMs: 5 },
  { id: 'large', issuesPerProject: 100, memberships: 3, pages: 2, latencyMs: 5 },
];

/** Owns no real network/runtime. Queue and SQLite are production implementations. */
export async function observationFixture(scenario: ObservationScenario, meter?: BackendMeasurement, wire = false, controls?: ObservationWireControls) {
  if (!/^[a-z]+$/.test(scenario.id) || !Number.isSafeInteger(scenario.issuesPerProject)
    || scenario.issuesPerProject < 2 || scenario.issuesPerProject > 1000
    || ![1, 3].includes(scenario.memberships) || ![1, 2].includes(scenario.pages)
    || !Number.isSafeInteger(scenario.latencyMs) || scenario.latencyMs < 0) throw new Error('INVALID_SYNTHETIC_SCENARIO');
  const f = await attemptFixture();
  try {
    await f.pipeline.close();
    // Bind synthetic identities to the real UUID order used by queue's tie breaker.
    const projectIds = [f.projectId, f.register()].sort();
    const issues = new Map<string, IssueContext>();
    const items = new Map<string, ProjectItem[]>();
    const projects = new Map<string, typeof f.project>();
    for (const [index, projectId] of projectIds.entries()) {
      const boardId = `PVT_synthetic_${index}`;
      const current = f.storage.getConfiguration(projectId);
      const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
      const mapping = { ...configuration.github_project!, id: boardId } as import('#contracts').ProjectMapping;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId,
        body: { project_changes: { github_project: mapping, automation_enabled: true } },
        configuration: { ...configuration, github_project: mapping, automation_enabled: true }, globalChanges: {} });
      projects.set(boardId, { ...structuredClone(f.project), project: { ...f.project.project, id: boardId } });
      const rows: ProjectItem[] = [];
      for (let number = 1; number <= scenario.issuesPerProject; number++) {
        const id = `I_synthetic_${index}_${number}`;
        const itemId = `ITEM_synthetic_${index}_${number}`;
        const issue = { ...structuredClone(f.issue), id, number, title: `Synthetic ${number}`,
          memberships: Array.from({ length: scenario.memberships }, (_, membership) => ({
            ...structuredClone(f.issue.memberships[0]!), itemId: membership === 0 ? itemId : `${itemId}_${membership}`,
            projectId: membership === 0 ? boardId : `PVT_extra_${membership}`,
          })) };
        issues.set(id, issue);
        rows.push({ id: itemId, contentId: id, kind: 'issue', archived: false, executable: true, title: issue.title, url: issue.url });
      }
      items.set(boardId, rows);
    }
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const samples: ObservationSample[] = [];
    let sequence = 0;
    type Context = { purpose: ObservationPurpose; trigger: ObservationTrigger; repetition: number; phase: 'cold' | 'warm'; consumerId: string };
    const contexts = new AsyncLocalStorage<{ active: Context; pages: string[] }>();
    let accountId = 'ACCOUNT_test';
    let failNext = false;
    let closed = false;
    let displayPages: string[] = [];
    function record(category: ObservationSample['category'], executionId: string, durationMs: number, completion: ObservationSample['completion']) {
      const context = contexts.getStore();
      if (!context) throw new Error('SYNTHETIC_CONTEXT_REQUIRED');
      const { active, pages: currentPages } = context;
      if (category === 'synthetic_page') currentPages.push(executionId);
      samples.push({ ...active, scenario: scenario.id, executionId, category, count: 1, durationMs, completion,
        physicalExecutionIds: category === 'consumer' ? [...currentPages] : category === 'synthetic_page' ? [executionId] : [],
        projects: 2, issuesPerProject: scenario.issuesPerProject, memberships: scenario.memberships, pages: scenario.pages });
    }
    async function response<T>(data: T, pages = 1) {
      const executionId = `physical-${++sequence}`;
      const start = now;
      for (let page = 0; page < pages; page++) {
        now += scenario.latencyMs;
        await Promise.resolve();
        const failed = failNext; failNext = false;
        record('synthetic_page', `${executionId}-page-${page}`, scenario.latencyMs, failed ? 'failed' : 'completed');
        if (failed) { record('logical', executionId, now - start, 'failed'); throw new Error('SYNTHETIC_REMOTE_FAILURE'); }
      }
      record('logical', executionId, now - start, 'completed');
      return complete(structuredClone(data));
    }
    const traced = <T>(operation: string, run: () => Promise<GitHubQueryResult<T>>) => meter
      ? meter.measure('logical', operation, run, result => result.state === 'complete' ? 'success' : 'failure') : run();
    const remote = wire && meter ? observationWire({ issues, items, projects, pages: scenario.pages, account: () => accountId }, meter, controls) : null;
    const github = {
      getIdentity: () => traced('identity', () => remote ? remote.getIdentity() : response({ id: accountId, login: 'synthetic-user' })),
      getProject: (id: string) => traced('project', () => { if (remote) return remote.getProject(id); const value = projects.get(id); if (!value) throw new Error('UNKNOWN_SYNTHETIC_PROJECT'); return response(value); }),
      listProjectItems: (id: string) => traced('items', () => { if (remote) return remote.listProjectItems(id); const value = items.get(id); if (!value) throw new Error('UNKNOWN_SYNTHETIC_PROJECT'); return response(value, scenario.pages); }),
      getIssueContextById: (id: string) => traced('issue', () => { if (remote) return remote.getIssueContextById(id, { purpose: 'queue' }); const value = issues.get(id); if (!value) throw new Error('UNKNOWN_SYNTHETIC_ISSUE'); return response(value, scenario.pages); }),
    };
    const queue = createQueue({ storage: f.storage, github, workspaces: f.workspaces, hostName: 'synthetic-host' });
    return {
      storage: f.storage, directory: f.directory, projectIds, samples, queue, issues, projects, pipeline: f.pipeline,
      github: { ...f.github, ...github }, workspaces: f.workspaces,
      advance(ms: number) { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('INVALID_CLOCK_ADVANCE'); now += ms; },
      changeAccount() { accountId = 'ACCOUNT_changed'; },
      failNextResponse() { failNext = true; },
      async read(context: Context, query: QueueQuery = {}) {
        if (closed) throw new Error('SYNTHETIC_FIXTURE_BUSY_OR_CLOSED');
        return contexts.run({ active: context, pages: [] }, async () => {
        const currentPages = contexts.getStore()!.pages;
        const start = now;
        try {
          const result = await (context.purpose === 'display' ? queue.read(query) : queue.observe(query));
          if (context.purpose === 'display') {
            if (currentPages.length) displayPages = [...currentPages];
            else currentPages.push(...displayPages);
          }
          record('consumer', `consumer-${++sequence}`, now - start, 'completed');
          return result;
        } catch (error) {
          record('consumer', `consumer-${++sequence}`, now - start, 'failed');
          throw error;
        }
        });
      },
      async close() { if (closed) return; closed = true; try { await f.close(); } finally { clock.mockRestore(); } },
    };
  } catch (error) { await f.close(); throw error; }
}

export async function withObservationFixture<T>(scenario: ObservationScenario,
  run: (fixture: Awaited<ReturnType<typeof observationFixture>>) => Promise<T>,
  options?: { meter: BackendMeasurement; wire: boolean; controls?: ObservationWireControls }): Promise<T> {
  const fixture = await observationFixture(scenario, options?.meter, options?.wire, options?.controls);
  try { return await run(fixture); } finally { await fixture.close(); }
}
