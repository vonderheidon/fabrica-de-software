import type { GitHubProjectDetails, IssueContext, ProjectItem } from '#contracts';
import { createClient } from '../../apps/controller/src/modules/github/client.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { GitHubExecutableResolver } from '../../apps/controller/src/modules/github/executable.js';
import { GraphQLReader, queryLimits, type GhRunner } from '../../apps/controller/src/modules/github/transport.js';
import { valuesQuery } from '../../apps/controller/src/modules/github/queries.js';
import type { BackendMeasurement } from './backend-measurement.js';

export interface ObservationWireControls {
  legacyValues?: boolean;
  afterSend?: (operation: string, secondPage: boolean) => Promise<void>;
  fault?: 'duplicate' | 'cursor' | 'denied' | 'throttle' | 'page_failure' | 'runner_failure';
  faultProjectId?: string;
  afterResponse?: (bytes: number) => void;
  commentBytes?: number;
  applyLatency?: boolean;
  commentConfirmation?: 'exact' | 'absent' | 'duplicate' | 'second_page' | 'divergent';
  statusConfirmation?: 'exact' | 'divergent' | 'second_page';
  groupedResponseExtraBytes?: number;
  simpleResponseExtraBytes?: number;
  unicodeEnvelope?: boolean;
  repetition?: number;
  sendOrder?: string[];
  responseLimit?: (value: number | null) => void;
  selectionProfile?: (profile: ObservationSelectionProfile) => void;
}

export interface ObservationSelectionProfile {
  operation: string; issue_title: boolean; issue_body: boolean; comments: boolean; assignees: boolean;
  blockers: boolean; memberships: boolean; field_values: boolean; references: boolean;
}

/** Synthetic wire responses consumed by the unmodified production GraphQL client. */
export function observationWire(input: {
  issues: Map<string, IssueContext>; items: Map<string, ProjectItem[]>;
  projects: Map<string, GitHubProjectDetails>; pages: number; account: () => string; latencyMs?: number; largeCommentBytes?: number;
}, meter: BackendMeasurement, controls: ObservationWireControls = {}, path: 'client' | 'composed' = 'client') {
  let oversizedGroupedResponseRepetition: number | null = null;
  function page(nodes: unknown[], cursor: unknown, items = false) {
    const split = Math.ceil(nodes.length / input.pages);
    const second = cursor === 'page-2';
    const values = input.pages === 1 ? nodes : second ? nodes.slice(split) : nodes.slice(0, split);
    return { nodes: items && second && controls.fault === 'duplicate' ? [...values, nodes[0]] : values,
      pageInfo: { hasNextPage: input.pages === 2 && (!second || (items && controls.fault === 'cursor')),
        endCursor: input.pages === 2 && (!second || (items && controls.fault === 'cursor')) ? 'page-2' : null } };
  }
  const run: GhRunner = async (body, onSend, maxResponseBytes) => {
    const request: { query: string; variables: { id?: string; ids?: string[]; cursor?: string; owner?: string; name?: string; number?: number } } = JSON.parse(body);
    const operation = /query Factory(\w+)/.exec(request.query)?.[1] ?? 'unknown';
    const hasComments = /\bcomments\s*\(/u.test(request.query);
    const selectsIssueHeader = operation === 'QueueIssue' || operation === 'Issue';
    controls.selectionProfile?.({ operation, issue_title: selectsIssueHeader && /\btitle\b/u.test(request.query),
      issue_body: selectsIssueHeader && /\bbody\b/u.test(request.query),
      comments: hasComments, assignees: /\bassignees\s*\(/u.test(request.query),
      blockers: /\bblockedBy\s*\(/u.test(request.query), memberships: /\bprojectItems\s*\(/u.test(request.query),
      field_values: /\bfieldValues\b|fieldValueByName/u.test(request.query), references: /\breferences\b/u.test(request.query) });
    onSend?.();
    controls.sendOrder?.push(`${operation}:${request.variables.cursor === 'page-2' ? 'page-2' : 'page-1'}`);
    await controls.afterSend?.(operation, request.variables.cursor === 'page-2');
    if (controls.applyLatency && (input.latencyMs ?? 0) > 0) {
      meter.noteProviderSimulatedMs(input.latencyMs!);
      await new Promise(resolve => setTimeout(resolve, input.latencyMs));
    }
    else await Promise.resolve();
    if (controls.fault === 'runner_failure') {
      meter.noteResponseBytes(null); meter.noteConservativeUnknownConsumptionBytes(maxResponseBytes ?? queryLimits.responseBytes);
      throw new Error('SYNTHETIC_RUNNER_FAILURE');
    }
    const id = request.variables.id ?? '';
    const cursor = request.variables.cursor;
    const status = controls.fault === 'denied' ? 403 : controls.fault === 'throttle' ? 429 : 503;
    if ((!controls.faultProjectId || controls.faultProjectId === id) && ((operation === 'ProjectItems' && cursor === 'page-2' && controls.fault === 'page_failure')
      || (operation === 'ProjectItems' && (controls.fault === 'denied' || controls.fault === 'throttle')))) {
      const stdout = `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n${controls.fault === 'throttle' ? 'retry-after: 60\r\n' : ''}\r\n{}`;
      meter.noteResponseBytes(Buffer.byteLength(stdout, 'utf8'));
      controls.responseLimit?.(maxResponseBytes ?? null);
      controls.afterResponse?.(Buffer.byteLength(stdout, 'utf8'));
      return { exitCode: 0, stdout };
    }
    const issue = input.issues.get(id) ?? [...input.issues.values()].find(candidate =>
      request.query.includes('query FactoryIssue(') && candidate.number === request.variables.number &&
      candidate.repository.owner.login === request.variables.owner && candidate.repository.name === request.variables.name);
    const project = input.projects.get(id);
    let data: unknown;
    if (request.query.includes('query FactoryIdentity ')) data = { viewer: { id: input.account(), login: 'synthetic-user' } };
    else if (request.query.includes('query FactoryProject(') && project) data = { node: { ...project.project,
      owner: { ...project.project.owner, __typename: 'Organization' } } };
    else if (request.query.includes('query FactoryProjectFields(') && project) data = { node: { fields: page(
      project.singleSelectFields.map(field => ({ ...field, __typename: 'ProjectV2SingleSelectField' })), cursor) } };
    else if (request.query.includes('query FactoryProjectItems(')) data = { node: { items: page((input.items.get(id) ?? []).map(item => ({
      id: item.id, isArchived: item.archived, content: { __typename: 'Issue', id: item.contentId, title: item.title, url: item.url },
    })), cursor, !controls.faultProjectId || controls.faultProjectId === id) } };
    else if (request.query.includes('query FactoryIssueAuthority(') && issue) data = { node: { __typename: 'Issue', id: issue.id, state: issue.state,
      repository: { ...issue.repository, defaultBranchRef: { name: issue.repository.defaultBranch } } } };
    else if (request.query.includes('query FactoryIssueCommentConfirmation(') && issue) {
      const expected = { id: 'COMMENT_confirmation', url: `${issue.url}#issuecomment-1`, body: 'C12-MARKER\nExpected confirmation',
        author: { id: input.account(), login: 'synthetic-user' }, updatedAt: '2026-10-29T00:00:00Z' };
      const commentBytes = controls.commentBytes ?? input.largeCommentBytes ?? 0;
      const comments = controls.commentConfirmation === 'absent' ? []
        : [...(commentBytes ? [{ ...expected, id: 'COMMENT_large', body: '!'.repeat(commentBytes) }] : []), expected];
      data = { node: { __typename: 'Issue', id: issue.id, repository: { id: issue.repository.id }, comments: page(comments, cursor) } };
    }
    else if (request.query.includes('query FactoryIssueStatusConfirmation(') && issue) data = { node: { __typename: 'Issue', id: issue.id,
      repository: { id: issue.repository.id }, projectItems: page(issue.memberships.map(m => ({
        id: m.itemId, isArchived: m.archived, project: { id: m.projectId },
      })), cursor) } };
    else if (request.query.includes('query FactoryQueueIssue(') && issue) data = { node: { ...issue, __typename: 'Issue',
      repository: { ...issue.repository, defaultBranchRef: { name: issue.repository.defaultBranch } } } };
    else if (request.query.includes('query FactoryIssueReference(') && issue) data = { node: { __typename: 'Issue', id: issue.id, number: issue.number,
      repository: { name: issue.repository.name, owner: { login: issue.repository.owner.login } } } };
    else if (request.query.includes('query FactoryIssue(') && issue) data = { repository: { issueOrPullRequest: { ...issue,
      __typename: 'Issue', repository: { ...issue.repository,
        defaultBranchRef: { name: issue.repository.defaultBranch } } } } };
    else if (request.query.includes('query FactoryAssignees(') && issue) data = { node: { assignees: page(issue.assignees, cursor) } };
    else if (request.query.includes('query FactoryComments(') && issue) {
      const expected = { id: 'COMMENT_confirmation', url: `${issue.url}#issuecomment-1`, body: 'C12-MARKER\nExpected confirmation',
        author: { id: input.account(), login: 'synthetic-user' }, updatedAt: '2026-10-29T00:00:00Z' };
      const commentBytes = controls.commentBytes ?? input.largeCommentBytes ?? 0;
      const large = commentBytes ? [{ ...expected, id: 'COMMENT_large', body: '!'.repeat(commentBytes) }] : [];
      const confirmation = controls.commentConfirmation === 'absent' ? [] : controls.commentConfirmation === 'divergent'
        ? [{ ...expected, body: 'C12-MARKER\nDivergent confirmation' }]
        : controls.commentConfirmation === 'exact' || controls.commentConfirmation === 'second_page' ? [expected]
          : controls.commentConfirmation === 'duplicate' ? [expected, { ...expected, id: 'COMMENT_duplicate' }] : [];
      const comments = [...large, ...confirmation];
      if (controls.commentConfirmation === 'divergent') comments[comments.length - 1] = { ...expected, author: { id: 'ACCOUNT_other', login: 'other-user' } };
      data = { node: { comments: page(comments, cursor) } };
    }
    else if (request.query.includes('query FactoryBlockers(') && issue) data = { node: { blockedBy: page(issue.blockers, cursor) } };
    else if (request.query.includes('query FactoryMemberships(') && issue) data = { node: { projectItems: page(issue.memberships.map(m => ({
      id: m.itemId, isArchived: m.archived, project: { id: m.projectId },
    })), cursor) } };
    else if (request.query.includes('query FactoryGroupedValues(')) {
      data = { nodes: request.variables.ids!.map(itemId => {
        const membership = [...input.issues.values()].flatMap(value => value.memberships).find(m => m.itemId === itemId)!;
        const statusValues = membership.statusValues.map((value, index) => ({
          __typename: 'ProjectV2ItemFieldSingleSelectValue', id: `${itemId}-value-${index}`, field: { id: value.fieldId },
          optionId: value.optionId, name: value.name,
        }));
        const numberValue = { __typename: 'ProjectV2ItemFieldNumberValue', id: `${itemId}-number` };
        const values = controls.statusConfirmation === 'second_page' ? [numberValue, ...statusValues] : [...statusValues, numberValue];
        const status = controls.statusConfirmation === 'divergent' && itemId === input.issues.values().next().value?.memberships[0]?.itemId
          ? values.map(value => value.__typename === 'ProjectV2ItemFieldSingleSelectValue' ? { ...value, optionId: 'OPTION_divergent' } : value) : values;
        return { id: itemId, __typename: 'ProjectV2Item', fieldValues: page(status, undefined) };
      }) };
    }
    else if (request.query.includes('query FactoryItemValues(')) {
      const membership = [...input.issues.values()].flatMap(value => value.memberships).find(m => m.itemId === id);
      if (!membership) throw new Error('UNKNOWN_SYNTHETIC_MEMBERSHIP');
      const statusValues = membership.statusValues.map((value, index) => ({
        __typename: 'ProjectV2ItemFieldSingleSelectValue', id: `${id}-value-${index}`, field: { id: value.fieldId },
        optionId: controls.statusConfirmation === 'divergent' && id === [...input.issues.values()][0]?.memberships[0]?.itemId
          ? 'OPTION_divergent' : value.optionId, name: value.name,
      }));
      const numberValue = { __typename: 'ProjectV2ItemFieldNumberValue', id: `${id}-number` };
      const values = controls.statusConfirmation === 'second_page' ? [numberValue, ...statusValues] : [...statusValues, numberValue];
      data = { node: { fieldValues: page(values, cursor) } };
    } else throw new Error('UNEXPECTED_SYNTHETIC_QUERY');
    const repetition = controls.repetition ?? 1;
    const groupedValues = request.query.includes('query FactoryGroupedValues(');
    const simpleValues = request.query.includes('query FactoryItemValues(');
    const extensionBytes = groupedValues && repetition !== oversizedGroupedResponseRepetition
      ? controls.groupedResponseExtraBytes ?? 0 : simpleValues ? controls.simpleResponseExtraBytes ?? 0 : 0;
    if (groupedValues && extensionBytes > 0) oversizedGroupedResponseRepetition = repetition;
    const usage = `${'x'.repeat(extensionBytes)}${extensionBytes > 0 && controls.unicodeEnvelope ? 'ç😀' : ''}`;
    const payload = JSON.stringify({ data, ...(extensionBytes ? { extensions: { usage } } : {}) });
    const stdout = `HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n${payload}`;
    const bytes = Buffer.byteLength(stdout, 'utf8');
    controls.afterResponse?.(bytes);
    controls.responseLimit?.(maxResponseBytes ?? null);
    if (bytes > (maxResponseBytes ?? queryLimits.responseBytes)) {
      meter.noteResponseBytes(null); meter.noteConservativeUnknownConsumptionBytes(maxResponseBytes ?? queryLimits.responseBytes);
      return { exitCode: 1, stdout: '' };
    }
    meter.noteResponseBytes(bytes);
    return { exitCode: 0, stdout };
  };
  const measuredRunner = meter.runner(run);
  let client: ReturnType<typeof createClient>;
  if (path === 'composed') {
    const context = { kind: 'windows_keyring' as const, cwd: 'C:\\synthetic', executable: 'C:\\synthetic\\gh.exe' };
    const resolver = new GitHubExecutableResolver({ access: context, initialExecutable: context.executable,
      environment: () => ({ PATH: '' }), stat: async () => ({ isFile: () => true }),
      observeVersion: async () => ({ tool: 'gh', state: 'observed', version: 'synthetic', cause: null, affectedRequirements: [], observedAtMs: 1 }) });
    client = createGitHub({ context, resolver, savedExecutablePath: () => context.executable,
      runnerFactory: () => measuredRunner, observeAdmissionWaitMs: durationMs => meter.noteAdmissionWaitMs(durationMs) });
  } else {
    const reader = new GraphQLReader(measuredRunner, Date.now, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      durationMs => meter.noteAdmissionWaitMs(durationMs));
    if (controls.legacyValues) {
      const scope = reader.scope.bind(reader);
      reader.scope = () => {
        const scoped = scope(); const query = scoped.query.bind(scoped);
        scoped.query = async (text, variables, onSend, responsePages) => {
          if (!text.includes('query FactoryGroupedValues(')) return query(text, variables, onSend, responsePages);
          const nodes: unknown[] = [];
          for (const id of variables.ids as string[]) {
            const single = await query(valuesQuery, { id, cursor: null });
            if (!single.data || single.state !== 'complete') return single;
            nodes.push({ ...single.data.node as object, id, __typename: 'ProjectV2Item' });
          }
          return { state: 'complete', data: { nodes }, diagnostics: [], retryAtMs: null };
        };
        return scoped;
      };
    }
    client = createClient(reader);
  }
  return client;
}
