import { isValidElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectCreationDialog } from '../apps/web/src/features/projects/ProjectCreationDialog.js';

const deferred = vi.hoisted(() => ({ updates: [] as Array<() => unknown>, stateIndex: 0 }));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const index = deferred.stateIndex++;
    const state = index === 1 ? {
      templates: [{ id: 'engineering', label: 'Engineering' }, { id: 'other', label: 'Other' }],
      creation_modes: [], account: { id: 'fixture-user', login: 'operator' }, prerequisites: [], projects_root: null,
    } : typeof initial === 'object' && initial !== null && 'creationMode' in initial
      ? { ...initial, creationMode: 'remote_no_push' } : initial;
    return [state, (update: unknown) => {
      if (typeof update === 'function') deferred.updates.push(() => update(state));
    }];
  },
}));

type FieldProps = {
  id?: string;
  type?: string;
  children?: ReactNode;
  onChange?: (event: { currentTarget: { value: string; checked: boolean } | null }) => void;
};

function findField(node: ReactNode, id: string): FieldProps | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findField(child, id);
      if (found) return found;
    }
  }
  if (!isValidElement<FieldProps>(node)) return undefined;
  if (node.props.id === id || (id === 'triage' && node.props.type === 'checkbox')) return node.props;
  return findField(node.props.children, id);
}

beforeEach(() => { deferred.updates.length = 0; deferred.stateIndex = 0; });

it.each([
  ['creation-name', 'name', 'Project'],
  ['creation-template', 'templateId', 'engineering'],
  ['creation-destination', 'destinationRelative', 'project'],
  ['creation-branch', 'baseBranch', 'release'],
  ['creation-mode', 'creationMode', 'remote_no_push'],
  ['creation-remote-name', 'remoteName', 'remote-project'],
  ['creation-visibility', 'visibility', 'public'],
  ['creation-owner-account', 'ownerId', 'fixture-owner'],
])('preserves %s after React clears the event currentTarget', (id, property, value) => {
  const tree = ProjectCreationDialog({ creationId: null, onCreationId: vi.fn(), onPlanReview: vi.fn(), onPlanEdit: vi.fn(), onOpenProject: vi.fn() });
  const field = findField(tree, id);
  expect(field?.onChange).toBeTypeOf('function');
  const event = { currentTarget: { value: String(value), checked: false } as { value: string; checked: boolean } | null };
  field?.onChange?.(event);
  event.currentTarget = null;
  expect(deferred.updates.length).toBeGreaterThan(0);
  const states = deferred.updates.map((update) => update());
  expect(states).toContainEqual(expect.objectContaining({ [property]: value }));
});

it('does not offer a triage toggle for the engineering included in every creation', () => {
  const tree = ProjectCreationDialog({ creationId: null, onCreationId: vi.fn(), onPlanReview: vi.fn(), onPlanEdit: vi.fn(), onOpenProject: vi.fn() });
  expect(findField(tree, 'triage')).toBeUndefined();
});
