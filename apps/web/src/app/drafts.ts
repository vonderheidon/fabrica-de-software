import type { HashRoute } from './hash-route.js';
import { routeIdentity } from './hash-route.js';

export type DraftValue = string | number | boolean | null | readonly DraftValue[] | { readonly [key: string]: DraftValue };

function isDraftRecord(value: DraftValue | undefined): value is { readonly [key: string]: DraftValue } { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

const drafts = new Map<string, Map<string, DraftValue>>();
const deletedProjects = new Set<string>();

function belongsToProject(identity: string, projectId: string): boolean {
  try {
    const value: unknown = JSON.parse(identity);
    return Array.isArray(value) && value.some((part: unknown) => part === projectId);
  } catch { return false; }
}

export function clearProjectDrafts(projectId: string): void {
  deletedProjects.add(projectId);
  for (const [identity, fields] of drafts) {
    if (!belongsToProject(identity, projectId)) continue;
    // Aggregated editors contain both exclusive project edits and unrelated global edits.
    const editor = fields.get('project-configuration');
    if (isDraftRecord(editor) && 'values' in editor) {
      const values = editor.values;
      if (isDraftRecord(values)) {
        const globalValues = Object.fromEntries(Object.entries(values).filter(([path]) => path.startsWith('global.')));
        if (Object.keys(globalValues).length) {
          const parts = JSON.parse(identity) as DraftValue[];
          const globalIdentity = configurationDraftIdentity(typeof parts[0] === 'string' ? parts[0] : null, 'global-settings');
          const globalFields = drafts.get(globalIdentity) ?? new Map<string, DraftValue>();
          const existing = globalFields.get('project-configuration');
          const priorValues = isDraftRecord(existing) && 'values' in existing && isDraftRecord(existing.values) ? existing.values : {};
          const merged = { ...globalValues, ...priorValues };
          globalFields.set('project-configuration', { ...(isDraftRecord(existing) ? existing : {}), dirty: Object.keys(merged), values: merged });
          drafts.set(globalIdentity, globalFields);
        }
      }
    }
    drafts.delete(identity);
  }
}

export function configurationDraftIdentity(accountId: string | null, resource: string, step = 'configuration', profileId: string | null = null): string {
  return JSON.stringify([accountId, resource, step, profileId]);
}

export function getDraft<T extends DraftValue>(identity: string, field: string): T | undefined {
  return drafts.get(identity)?.get(field) as T | undefined;
}

export function setDraft(identity: string, field: string, value: DraftValue): void {
  if ([...deletedProjects].some((projectId) => belongsToProject(identity, projectId))) return;
  const current = drafts.get(identity) ?? new Map<string, DraftValue>();
  current.set(field, value);
  drafts.set(identity, current);
}

export function clearDraft(identity: string, field: string): void {
  const current = drafts.get(identity);
  current?.delete(field);
  if (current?.size === 0) drafts.delete(identity);
}

export function draftIdentity(route: HashRoute): string {
  return routeIdentity(route);
}
