import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ExecutionQuestion, ImplementerResult, ReviewerResult, type PassageRole, type RoleResourceReference } from '#contracts';
import { ExecutionError } from './errors.js';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export interface RoleResource {
  reference: RoleResourceReference; instructions: string;
  resultSchema: typeof ImplementerResult | typeof ReviewerResult;
  questionSchema: typeof ExecutionQuestion;
}
export function loadRoleResources(directory = fileURLToPath(new URL('../../../../../resources/roles/', import.meta.url))): Map<PassageRole, RoleResource> {
  const resources = new Map<PassageRole, RoleResource>();
  try {
    for (const role of ['implementer', 'reviewer'] as const) {
      const name = `${role}.v1.json`;
      if (statSync(resolve(directory, name)).size > 131_072) throw new ExecutionError('RESOURCE_INVALID');
      const bytes = readFileSync(resolve(directory, name));
      if (bytes.length > 131_072) throw new ExecutionError('RESOURCE_INVALID');
      const resource: unknown = JSON.parse(bytes.toString('utf8'));
      const expected = role === 'implementer' ? ImplementerResult : ReviewerResult;
      if (!resource || typeof resource !== 'object' || Array.isArray(resource)) throw new ExecutionError('RESOURCE_INVALID');
      const r = resource as Record<string, unknown>;
      if (Object.keys(r).sort().join(',') !== 'id,instructions,questionSchema,resultSchema,role,version' ||
        r.id !== `factory.${role}` || r.role !== role || r.version !== 1 ||
        typeof r.instructions !== 'string' || !r.instructions.trim() ||
        canonical(r.resultSchema) !== canonical(expected) || canonical(r.questionSchema) !== canonical(ExecutionQuestion)) throw new ExecutionError('RESOURCE_INVALID');
      resources.set(role, {
        reference: { id: `factory.${role}`, role, version: 1, path: `resources/roles/${name}`, sha256: createHash('sha256').update(bytes).digest('hex') },
        instructions: r.instructions, resultSchema: expected, questionSchema: ExecutionQuestion,
      });
    }
    return resources;
  } catch { throw new ExecutionError('RESOURCE_INVALID'); }
}
