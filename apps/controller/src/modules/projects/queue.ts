import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Value } from '@sinclair/typebox/value';
import { QueueCommand, QueueQuery, type GitHubAccount, type GitHubQueryResult, type QueueItem, type QueueObservation, type QueueQuery as QueueQueryType } from '#contracts';
import type { Static } from '@sinclair/typebox';
import { OperationError, type Storage } from '../storage/index.js';
import { assessIssueReadiness, type GitHub } from '../github/index.js';

type QueueGitHub = Pick<GitHub, 'getIdentity' | 'getProject' | 'listProjectItems' | 'getIssueContextById'>;
type QueueDependencies = { storage: Storage; github: QueueGitHub; hostName?: string };
export interface QueueResult { observation: QueueObservation; etag: string; items: readonly QueueItem[] }
export class QueueSummaryChanged extends OperationError {
  constructor(readonly current: QueueResult) { super(409, 'QUEUE_SUMMARY_CHANGED', 'The queue observation changed. Review the updated summary before enabling.'); }
}
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const problem = (status: 400 | 404 | 409 | 412 | 428 | 503, code: string, message: string): never => { throw new OperationError(status, code, message); };
type QueueCommandBody = Static<typeof QueueCommand>;

export function createQueue({ storage, github, hostName = hostname() }: QueueDependencies) {
  // Only retry deadlines are retained; no board or previous authority is cached.
  let retryAtMs = 0;
  let failureDelayMs = 0;
  async function observe(query: QueueQueryType): Promise<QueueResult> {
    if (!Value.Check(QueueQuery, query)) problem(400, 'QUEUE_QUERY_INVALID', 'Queue query is invalid.');
    if (query.projectId && query.projectIds) problem(400, 'QUEUE_SCOPE_INVALID', 'Select one project scope.');
    const selectedIds = query.projectId ? [query.projectId] : query.projectIds?.split(',').sort();
    if (selectedIds && (selectedIds.length > 100 || new Set(selectedIds).size !== selectedIds.length)) problem(400, 'QUEUE_SCOPE_INVALID', 'Select up to 100 distinct projects.');
    const catalog = selectedIds ? null : storage.listProjects({ limit: '100' });
    const allProjects = selectedIds ? selectedIds.map(id => storage.getProject(id).view.project) : [...(catalog?.items ?? [])];
    let catalogCursor = catalog?.next_cursor ?? null;
    while (catalogCursor) {
      const next = storage.listProjects({ limit: '100', cursor: catalogCursor });
      allProjects.push(...next.items);
      catalogCursor = next.next_cursor;
    }
    if (allProjects.length > 100) problem(503, 'QUEUE_SCOPE_LIMIT', 'Queue observation supports at most 100 configured projects. Select one project.');
    const settings = storage.getGlobalConfiguration();
    const configurations = new Map(allProjects.map((project) => [project.id, storage.getConfiguration(project.id)]));
    const scope = { kind: selectedIds ? 'project' as const : 'account' as const, projectIds: allProjects.map(project => project.id).sort() };
    const etag = storage.getQueueETag(scope);
    const now = Date.now();
    const deferred = now < retryAtMs;
    const identity: GitHubQueryResult<GitHubAccount> = deferred
      ? { state: 'unavailable', data: null, retryAtMs, diagnostics: [] }
      : await github.getIdentity();
    const queueEnabled = settings.view.settings.automation_enabled && (!selectedIds || selectedIds.every(id => configurations.get(id)!.view.configuration.automation_enabled));
    const activeAttempt = storage.listAttempts({ result: 'active', limit: '1' }).items[0] ?? null;
    const currentHost = hostName;
    const diagnostics: QueueObservation['diagnostics'] = identity.diagnostics.map(({ code, message, recovery }) => ({ code, message, recovery }));
    if (deferred) diagnostics.push({ code: 'QUEUE_READ_BACKOFF', message: 'Consulta adiada após falha de leitura.', recovery: 'Aguarde o próximo instante de consulta informado.' });
    let remoteRetryAtMs = identity.retryAtMs ?? 0;
    const modesByProject: QueueObservation['modesByProject'] = [];
    const rows: QueueItem[] = [];
    let complete = identity.state === 'complete' && Boolean(identity.data);
    const sortValues = new Map<QueueItem, { priority: number | null; board: number | null; direction: 'asc' | 'desc' }>();
    let priorityAvailable = false;
    let boardAvailable = false;

    for (const projectSummary of allProjects) {
      const configured = configurations.get(projectSummary.id)!;
      const configuration = configured.view.configuration;
      modesByProject.push({ projectId: projectSummary.id, mode: configuration.default_delivery_mode });
      if (!configuration.github_project || !configuration.source.repository_id) {
        complete = false;
        diagnostics.push({ code: 'PROJECT_NOT_READY', message: `${projectSummary.name}: GitHub Project ou repositório não está configurado.`, recovery: 'Configure os IDs do Project e do repositório antes de habilitar a fila.' });
        continue;
      }
      if (deferred || identity.state !== 'complete' || !identity.data) continue;
      const [items, projectDetails] = await Promise.all([
        github.listProjectItems(configuration.github_project.id), github.getProject(configuration.github_project.id),
      ]);
      remoteRetryAtMs = Math.max(remoteRetryAtMs, items.retryAtMs ?? 0, projectDetails.retryAtMs ?? 0);
      diagnostics.push(...items.diagnostics.map(({ code, message, recovery }) => ({ code, message, recovery })),
        ...projectDetails.diagnostics.map(({ code, message, recovery }) => ({ code, message, recovery })));
      if (items.state !== 'complete' || projectDetails.state !== 'complete' || !projectDetails.data) complete = false;
      const details = projectDetails.data;
      const mappingValid = details?.project.id === configuration.github_project.id &&
        details.project.owner.id === configuration.github_project.owner_id && !details.project.closed &&
        Object.values(configuration.github_project.status_option_ids).every((id) => details.singleSelectFields
          .find((field) => field.id === configuration.github_project?.status_field_id)?.options.some((option) => option.id === id));
      if (!mappingValid) {
        complete = false;
        diagnostics.push({ code: 'PROJECT_MAPPING_INVALID', message: 'O Project, proprietário ou mapeamento de Status diverge da configuração.', recovery: 'Confira os IDs configurados no projeto.' });
      }
      const priorityField = configuration.queue_order.priority_field_id;
      const numericPriority = Boolean(priorityField && details?.numberFields?.some((field) => field.id === priorityField));
      const useBoard = configuration.queue_order.use_board_position && (items.data ?? []).every((item) => item.position !== undefined);
      priorityAvailable ||= numericPriority;
      boardAvailable ||= useBoard;
      if (priorityField && !numericPriority) diagnostics.push({ code: 'PRIORITY_VALUE_UNAVAILABLE', message: 'O campo de prioridade numérica não está disponível neste Project.', recovery: 'Confira o ID do campo; será usada posição documentada ou número/ID.' });
      if (configuration.queue_order.use_board_position && !useBoard) diagnostics.push({ code: 'BOARD_POSITION_UNAVAILABLE', message: 'A leitura não fornece posição documentada dos itens.', recovery: 'A ordem usa número crescente e ID.' });
      if (activeAttempt) diagnostics.push({ code: 'QUEUE_OCCUPIED', message: 'Já existe uma tentativa ativa. Os demais candidatos permanecem visíveis e não serão descartados.', recovery: 'A fila pode consumir o próximo candidato quando a tentativa terminar.' });
      for (const item of items.data ?? []) {
        const projectLabel = projectSummary.name;
        const cycle = item.contentId && settings.view.settings.account_id ? storage.getQueueCycle(settings.view.settings.account_id, projectSummary.id, item.contentId) : null;
        const prior = cycle?.consumedAttemptId ? { id: cycle.consumedAttemptId, active: storage.getAttempt(cycle.consumedAttemptId).result === null }
          : (!cycle || cycle.cycleNumber === 1) && item.contentId ? storage.getLatestIssueAttempt(configuration.source.repository_id, item.contentId) : null;
        const kind = item.kind;
        let eligible = false;
        let reasons: QueueItem['reasons'][number][] = [];
        let issueId: string | null = null;
        let number: number | null = null;
        let title = item.title;
        let url = item.url;
        let assignees: QueueItem['assignees'] = [];
        let status: string | null = null;
        let ready = false;
        let priority: number | null = null;

        if (kind !== 'issue') {
          reasons = [kind === 'draft' ? 'DRAFT_ITEM' : kind === 'pull_request' ? 'PULL_REQUEST' : 'READ_INCOMPLETE'];
          if (kind === 'inaccessible') complete = false;
        } else if (item.contentId) {
          const issue = await github.getIssueContextById(item.contentId);
          remoteRetryAtMs = Math.max(remoteRetryAtMs, issue.retryAtMs ?? 0);
          diagnostics.push(...issue.diagnostics.map(({ code, message, recovery }) => ({ code, message, recovery })));
          if (issue.state !== 'complete' || !issue.data || !('repository' in issue.data) || !projectDetails.data) {
            complete = false;
            reasons = ['READ_INCOMPLETE'];
          } else {
            const context = issue.data;
            const readiness = assessIssueReadiness({ identity, issue, project: projectDetails, expectedAccountId: settings.view.settings.account_id ?? '',
              repositoryId: configuration.source.repository_id, projectId: configuration.github_project.id,
              statusFieldId: configuration.github_project.status_field_id, readyOptionId: configuration.github_project.status_option_ids.ready });
            reasons = readiness.reasons;
            eligible = readiness.eligible;
            issueId = context.id;
            number = context.number;
            title = context.title;
            url = context.url;
            assignees = context.assignees.map(({ id, login }) => ({ id, login }));
            if (assignees.length === 0) reasons.push('ASSIGNEE_MISSING');
            else if (assignees.length > 1) reasons.push('MULTIPLE_ASSIGNEES');
            else if (assignees[0]?.id !== identity.data?.id) reasons.push('ASSIGNEE_OTHER');
            const membership = context.memberships.find((entry) => entry.itemId === item.id && entry.projectId === configuration.github_project?.id && !entry.archived);
            if (!membership || context.id !== item.contentId || !mappingValid) {
              eligible = false;
              reasons.push('PROJECT_MEMBERSHIP_MISSING');
            }
            const statusValue = membership?.statusValues.find((entry) => entry.fieldId === configuration.github_project?.status_field_id);
            status = statusValue?.name ?? null;
            ready = statusValue?.optionId === configuration.github_project?.status_option_ids.ready;
            priority = numericPriority ? membership?.numberValues?.find((entry) => entry.fieldId === priorityField)?.value ?? null : null;
          }
        } else {
          complete = false;
          reasons = ['READ_INCOMPLETE'];
        }
        if (item.archived) { eligible = false; reasons.push('ARCHIVED_ITEM'); }
        const readyEligible = ready && eligible;
        if (prior) {
          eligible = false;
          reasons = [...new Set([...reasons, 'ALREADY_CONSUMED' as const])];
        }
        if (!configuration.automation_enabled && !selectedIds) {
          eligible = false;
          reasons = [...new Set([...reasons, 'AUTOMATION_DISABLED' as const])];
        }
        if (eligible && activeAttempt) {
          eligible = false;
          reasons = [...new Set([...reasons, 'ATTEMPT_ACTIVE' as const])];
        }
        const row: QueueItem = { projectId: projectSummary.id, projectName: projectLabel, itemId: item.id, kind, issueId, number, title, url, assignees,
          status, ready, readyEligible, eligible, reasons: [...new Set(reasons)], consumption: prior ? prior.active ? 'active' : 'consumed' : complete ? 'available' : 'unknown',
          attemptId: prior?.id ?? null, order: { position: 1,
            criterion: numericPriority ? `Prioridade numérica ${configuration.queue_order.priority_direction}; ${useBoard ? 'posição do Project' : 'número/ID'}`
              : useBoard ? 'Posição documentada do Project; número/ID' : 'Fallback: número crescente; ID',
            value: priority === null ? null : String(priority) } };
        rows.push(row);
        sortValues.set(row, { priority, board: useBoard ? item.position ?? null : null, direction: configuration.queue_order.priority_direction });
      }
    }
    const configStamp = [settings.etag, ...allProjects.map((project) => configurations.get(project.id)!.etag)];
    let configurationChanged = settings.etag !== storage.getGlobalConfiguration().etag ||
      allProjects.some((project) => configurations.get(project.id)!.etag !== storage.getConfiguration(project.id).etag);
    // Account observations bracket the remote read. This is not a remote transaction.
    const lastIdentity = !deferred && identity.state === 'complete' ? await github.getIdentity() : identity;
    configurationChanged ||= settings.etag !== storage.getGlobalConfiguration().etag ||
      allProjects.some((project) => configurations.get(project.id)!.etag !== storage.getConfiguration(project.id).etag);
    if (!selectedIds) {
      const currentIds: string[] = [];
      let cursor: string | null = null;
      do {
        const page = storage.listProjects({ limit: '100', ...(cursor ? { cursor } : {}) });
        currentIds.push(...page.items.map((project) => project.id));
        cursor = page.next_cursor;
      } while (cursor);
      configurationChanged ||= hash(currentIds.sort()) !== hash(scope.projectIds);
    }
    remoteRetryAtMs = Math.max(remoteRetryAtMs, lastIdentity.retryAtMs ?? 0);
    const accountChanged = lastIdentity.state !== identity.state || lastIdentity.data?.id !== identity.data?.id;
    if (configurationChanged || accountChanged) {
      complete = false;
      diagnostics.push(...lastIdentity.diagnostics);
      diagnostics.push({ code: 'QUEUE_OBSERVATION_CHANGED', message: 'Configuração ou conta mudou durante a consulta.', recovery: 'Consulte novamente o resumo atual.' });
    }
    const order = { criterion: priorityAvailable ? 'numeric-priority' : boardAvailable ? 'project-position' : 'issue-number',
      description: 'Projetos por ID; em cada projeto, prioridade numérica na direção configurada (ausentes por último), posição documentada quando disponível, número crescente e ID. Sem posição disponível, fallback por número/ID.' };
    const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
    rows.sort((a, b) => {
      const projectOrder = compareId(a.projectId, b.projectId);
      if (projectOrder) return projectOrder;
      const av = sortValues.get(a)!; const bv = sortValues.get(b)!;
      const priorityOrder = av.priority === null ? (bv.priority === null ? 0 : 1) : bv.priority === null ? -1
        : (av.priority - bv.priority) * (av.direction === 'asc' ? 1 : -1);
      return priorityOrder || (av.board !== null && bv.board !== null ? av.board - bv.board : 0) ||
        (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || compareId(a.issueId ?? a.itemId, b.issueId ?? b.itemId);
    });
    rows.forEach((row, index) => { row.order.position = index + 1; });
    const valid = complete && settings.view.settings.account_id !== null && settings.view.settings.account_id === identity.data?.id && modesByProject.length > 0;
    if (!complete) for (const row of rows) {
      row.eligible = false;
      row.readyEligible = false;
      row.reasons = [...new Set([...row.reasons, 'READ_INCOMPLETE' as const])];
      if (row.consumption === 'available') row.consumption = 'unknown';
    }
    const eligibleTotal = complete ? rows.filter((row) => row.eligible).length : null;
    const summaryHash = hash({ scope, configStamp, modesByProject, accountId: identity.data?.id ?? null,
      expectedAccountId: settings.view.settings.account_id, host: currentHost, complete, valid, eligibleTotal,
      candidates: rows.map(({ projectId, itemId, kind, issueId, ready, readyEligible, eligible, reasons, status, assignees, order: itemOrder }) =>
        [projectId, itemId, kind, issueId, ready, readyEligible, eligible, reasons, status, assignees.map((assignee) => assignee.id).sort(), itemOrder]), order });
    const intervalMs = settings.view.settings.time_defaults.polling_interval_ms;
    const backoffMaxMs = settings.view.settings.time_defaults.polling_backoff_max_ms ?? Math.max(intervalMs, 60_000);
    if (!deferred) {
      failureDelayMs = complete ? 0 : Math.min(backoffMaxMs, Math.max(intervalMs, failureDelayMs * 2));
      retryAtMs = complete ? 0 : Math.max(Date.now() + failureDelayMs, remoteRetryAtMs);
    }
    const observationId = randomUUID();
    const pageScope = hash([summaryHash, selectedIds ?? null]);
    let offset = 0;
    if (query.cursor) {
      try {
        const decoded: unknown = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        const candidate = decoded && typeof decoded === 'object' ? decoded as { scope?: unknown; offset?: unknown } : null;
        if (!candidate || candidate.scope !== pageScope || typeof candidate.offset !== 'number' || !Number.isSafeInteger(candidate.offset) || candidate.offset < 0 || candidate.offset >= rows.length) {
          throw new OperationError(409, 'QUEUE_CHANGED', 'The observed queue changed. Reload the first page.');
        }
        offset = candidate.offset;
      } catch (error) {
        if (error instanceof OperationError) throw error;
        problem(400, 'QUEUE_CURSOR_INVALID', 'Queue cursor is invalid.');
      }
    }
    const limit = Number(query.limit ?? '25');
    const pageItems = rows.slice(offset, offset + limit);
    const hasMore = offset + limit < rows.length;
    const observation: QueueObservation = {
      scope, enabled: queueEnabled, valid, complete, observationId, summaryHash, observedAtMs: now,
      eligibleTotal,
      modesByProject, account: { id: identity.data?.id ?? null, login: identity.data?.login ?? null },
      host: { expected: currentHost, observed: currentHost, matches: true },
      order, page: { items: pageItems, has_more: hasMore, next_cursor: hasMore ? Buffer.from(JSON.stringify({ scope: pageScope, offset: offset + limit })).toString('base64url') : null, event_cursor: settings.view.event_cursor },
      diagnostics: [...new Map(diagnostics.map((entry) => [JSON.stringify(entry), entry])).values()].slice(0, 100), eventCursor: settings.view.event_cursor,
      polling: { intervalMs, backoffMaxMs, retryAtMs: retryAtMs || null, nextPollAtMs: Math.max(Date.now() + intervalMs, retryAtMs) },
    };
    return { observation, etag, items: rows };
  }

  async function save(command: QueueCommandBody, context: { operationId: string; expectedRevision: string | undefined }) {
    if (!Value.Check(QueueCommand, command)) problem(400, 'QUEUE_COMMAND_INVALID', 'Queue command is invalid.');
    if (command.scope.kind === 'project' && !command.scope.projectIds.length) problem(400, 'QUEUE_SCOPE_INVALID', 'Select at least one project.');
    const query = { ...(command.scope.kind === 'project' ? { projectIds: [...command.scope.projectIds].sort().join(',') } : {}), limit: '100' };
    const change = { ...context, body: command };
    let operation = storage.recoverQueueChange(change);
    if (!operation) {
      if (context.expectedRevision === undefined) problem(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
      if (command.enabled) {
        const fresh = await observe(query);
        if (!fresh.observation.complete || !fresh.observation.valid || fresh.observation.summaryHash !== command.authorizedSummaryHash ||
          fresh.etag !== context.expectedRevision || hash(fresh.observation.scope.projectIds) !== hash([...command.scope.projectIds].sort()) ||
          (command.scope.kind === 'project' && !storage.getSettings().automation_enabled)) throw new QueueSummaryChanged(fresh);
      }
      try { operation = storage.saveQueueChange(change); }
      catch (error) {
        if (command.enabled && error instanceof OperationError && ['REVISION_CONFLICT', 'QUEUE_SCOPE_CHANGED', 'QUEUE_AUTHORITY_REQUIRED'].includes(error.code)) throw new QueueSummaryChanged(await observe(query));
        throw error;
      }
    }
    const receipt = operation.receipt;
    if (!receipt) return problem(503, 'QUEUE_RECEIPT_UNAVAILABLE', 'The queue change was not confirmed.');
    const latest = await observe({ ...query, limit: '25' });
    return { queue: latest.observation, operationId: operation.operation_id, receipt, etag: latest.etag };
  }

  return { observe, save };
}
