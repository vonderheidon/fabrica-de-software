import type { GitHubProjectDetails, IssueContext, ProjectItem } from '#contracts';
import { createClient } from '../../apps/controller/src/modules/github/client.js';
import { GraphQLReader, type GhRunner } from '../../apps/controller/src/modules/github/transport.js';
import { valuesQuery } from '../../apps/controller/src/modules/github/queries.js';
import type { BackendMeasurement } from './backend-measurement.js';

export interface ObservationWireControls {
  legacyValues?: boolean;
  afterSend?: (operation: string, secondPage: boolean) => Promise<void>;
  fault?: 'duplicate' | 'cursor' | 'denied' | 'throttle' | 'page_failure';
  faultProjectId?: string;
  afterResponse?: (bytes: number) => void;
}

/** Synthetic wire responses consumed by the unmodified production GraphQL client. */
export function observationWire(input: {
  issues: Map<string, IssueContext>; items: Map<string, ProjectItem[]>;
  projects: Map<string, GitHubProjectDetails>; pages: number; account: () => string;
}, meter: BackendMeasurement, controls: ObservationWireControls = {}) {
  function page(nodes: unknown[], cursor: unknown, items = false) {
    const split = Math.ceil(nodes.length / input.pages);
    const second = cursor === 'page-2';
    const values = input.pages === 1 ? nodes : second ? nodes.slice(split) : nodes.slice(0, split);
    return { nodes: items && second && controls.fault === 'duplicate' ? [...values, nodes[0]] : values,
      pageInfo: { hasNextPage: input.pages === 2 && (!second || (items && controls.fault === 'cursor')),
        endCursor: input.pages === 2 && (!second || (items && controls.fault === 'cursor')) ? 'page-2' : null } };
  }
  const run: GhRunner = async (body, onSend) => {
    const request: { query: string; variables: { id?: string; ids?: string[]; cursor?: string } } = JSON.parse(body);
    onSend?.();
    const operation = /query Factory(\w+)/.exec(request.query)?.[1] ?? 'unknown';
    await controls.afterSend?.(operation, request.variables.cursor === 'page-2');
    await Promise.resolve();
    const id = request.variables.id ?? '';
    const cursor = request.variables.cursor;
    const status = controls.fault === 'denied' ? 403 : controls.fault === 'throttle' ? 429 : 503;
    if ((!controls.faultProjectId || controls.faultProjectId === id) && ((operation === 'ProjectItems' && cursor === 'page-2' && controls.fault === 'page_failure')
      || (operation === 'ProjectItems' && (controls.fault === 'denied' || controls.fault === 'throttle')))) {
      return { exitCode: 0, stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n${controls.fault === 'throttle' ? 'retry-after: 60\r\n' : ''}\r\n{}` };
    }
    const issue = input.issues.get(id);
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
    else if (request.query.includes('query FactoryQueueIssue(') && issue) data = { node: { ...issue, __typename: 'Issue',
      repository: { ...issue.repository, defaultBranchRef: { name: issue.repository.defaultBranch } } } };
    else if (request.query.includes('query FactoryAssignees(') && issue) data = { node: { assignees: page(issue.assignees, cursor) } };
    else if (request.query.includes('query FactoryBlockers(') && issue) data = { node: { blockedBy: page(issue.blockers, cursor) } };
    else if (request.query.includes('query FactoryMemberships(') && issue) data = { node: { projectItems: page(issue.memberships.map(m => ({
      id: m.itemId, isArchived: m.archived, project: { id: m.projectId },
    })), cursor) } };
    else if (request.query.includes('query FactoryGroupedValues(')) {
      data = { nodes: request.variables.ids!.map(itemId => {
        const membership = [...input.issues.values()].flatMap(value => value.memberships).find(m => m.itemId === itemId)!;
        return { id: itemId, __typename: 'ProjectV2Item', fieldValues: page(membership.statusValues.map((value, index) => ({
          __typename: 'ProjectV2ItemFieldSingleSelectValue', id: `${itemId}-value-${index}`, field: { id: value.fieldId },
          optionId: value.optionId, name: value.name,
        })), undefined) };
      }) };
    }
    else if (request.query.includes('query FactoryItemValues(')) {
      const membership = [...input.issues.values()].flatMap(value => value.memberships).find(m => m.itemId === id);
      if (!membership) throw new Error('UNKNOWN_SYNTHETIC_MEMBERSHIP');
      data = { node: { fieldValues: page(membership.statusValues.map((value, index) => ({
        __typename: 'ProjectV2ItemFieldSingleSelectValue', id: `${id}-value-${index}`, field: { id: value.fieldId },
        optionId: value.optionId, name: value.name,
      })), cursor) } };
    } else throw new Error('UNEXPECTED_SYNTHETIC_QUERY');
    const stdout = `HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}`;
    controls.afterResponse?.(Buffer.byteLength(stdout));
    return { exitCode: 0, stdout };
  };
  const reader = new GraphQLReader(meter.runner(run));
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
  return createClient(reader);
}
