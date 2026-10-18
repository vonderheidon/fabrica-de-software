import type { HashRoute } from './hash-route.js';
import { routeIdentity } from './hash-route.js';

export type DraftValue = string | number | boolean | null | readonly DraftValue[] | { readonly [key: string]: DraftValue };

const drafts = new Map<string, Map<string, DraftValue>>();

export function configurationDraftIdentity(accountId: string | null, resource: string, step = 'configuration', profileId: string | null = null): string {
  return JSON.stringify([accountId, resource, step, profileId]);
}

export function getDraft<T extends DraftValue>(identity: string, field: string): T | undefined {
  return drafts.get(identity)?.get(field) as T | undefined;
}

export function setDraft(identity: string, field: string, value: DraftValue): void {
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
