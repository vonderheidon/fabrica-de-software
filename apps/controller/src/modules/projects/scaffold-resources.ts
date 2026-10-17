import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ScaffoldEngineering } from '#contracts';
import { OperationError } from '../storage/index.js';

export function scaffoldDigest(value: unknown): string {
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object'
    ? `{${Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v);
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export const fileDigest = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
export interface TemplateFile { path: string; content: string }
const closed = { additionalProperties: false } as const;
const manifest = Type.Object({ formatVersion: Type.Literal(1), id: Type.Literal('factory.engineering'), templates: Type.Array(Type.Object({
  id: Type.String({ pattern: '^[a-z0-9.-]{1,128}$' }), label: Type.String({ minLength: 1, maxLength: 256 }),
  files: Type.Array(Type.Object({ path: Type.String({ minLength: 1, maxLength: 1024 }), content: Type.String({ maxLength: 65536 }) }, closed), { maxItems: 40 }),
}, closed), { minItems: 1, maxItems: 20 }) }, closed);
export function safeTemplatePath(path: string): boolean {
  return path.length <= 1024 && !/[\\:<>"|?*\x00-\x1f\x7f]/.test(path) && path.split('/').every(p => p.length > 0 && p !== '.' && p !== '..' &&
    !/[. ]$/.test(p) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p) &&
    !/^(?:\.git|\.agents|\.claude|node_modules|dist|build|coverage|\.cache)$/i.test(p)) &&
    !/(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key)|credentials(?:\..*)?|id_rsa)$/i.test(path.replace(/\.env(?:\.[^/]*)?\.example$/i, 'environment-example'));
}
async function resource(directory: string, name: string): Promise<string> {
  const path = resolve(directory, name); const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw new Error('RESOURCE_INVALID');
  const bytes = await readFile(path); if (bytes.length > 262144) throw new Error('RESOURCE_INVALID');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export async function loadScaffoldCatalog(directory = fileURLToPath(new URL('../../../../../resources/templates/', import.meta.url))) {
  try {
    for (const path of [directory, resolve(directory,'engineering')]) {
      const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('RESOURCE_REDIRECTED');
    }
    const catalogText = await resource(directory, 'catalog.v1.json'); const catalog: unknown = JSON.parse(catalogText);
    if (!Value.Check(manifest, catalog)) throw new Error('CATALOG_INVALID');
    const engineering = await Promise.all(['issue-tracker', 'domain', 'triage-labels'].map(n => resource(directory, `engineering/${n}.md`)));
    if (engineering.some(t => !t.trim())) throw new Error('RESOURCE_EMPTY');
    const digest = scaffoldDigest([catalogText, engineering]);
    const templates = catalog.templates.map(template => {
      const keys = template.files.map(f => f.path.toLowerCase());
      if (new Set(keys).size !== keys.length || keys.some(k => keys.some(other => other.startsWith(`${k}/`))) || template.files.some(f => !safeTemplatePath(f.path) || Buffer.byteLength(f.content) > 65536) ||
        template.files.some(f => f.path.toLowerCase() === '.gitignore' && f.path !== '.gitignore') ||
        template.files.some(f => ['docs/agents/issue-tracker.md', 'docs/agents/domain.md', 'docs/agents/triage-labels.md'].includes(f.path.toLowerCase()))) throw new Error('TEMPLATE_INVALID');
      return { ...template, digest: scaffoldDigest([digest, template]) };
    });
    if (new Set(templates.map(t => t.id)).size !== templates.length) throw new Error('TEMPLATE_DUPLICATED');
    return { id: catalog.id, version: 1 as const, digest, templates, engineering };
  } catch { throw new OperationError(503, 'SCAFFOLD_RESOURCE_INVALID', 'Scaffold resources are missing or invalid. Restore the distributed resources.'); }
}
export function renderEngineering(files: readonly TemplateFile[], resources: readonly string[], triageEnabled: boolean) {
  const result = files.map(f => ({ ...f }));
  const original = result.find(f => f.path.toLowerCase() === 'agents.md');
  if (original && original.path !== 'AGENTS.md') throw new OperationError(400, 'TEMPLATE_INVALID', 'The instructions filename must be AGENTS.md.');
  let content = original?.content ?? '';
  const headings = [...content.matchAll(/^## Agent skills\s*$/gm)];
  if (headings.length > 1) throw new OperationError(400, 'TEMPLATE_INVALID', 'Agent skills sections must be unique.');
  if (headings.length === 0) content = `${content ? `${content.trimEnd()}\n\n` : ''}## Agent skills\n`;
  const start = /^## Agent skills\s*$/m.exec(content)!.index;
  const next = content.slice(start + 15).search(/^## /m);
  const end = next < 0 ? content.length : start + 15 + next;
  let section = content.slice(start, end);
  for (const [heading, pointer] of [
    ['Issue tracker', 'Before reading or publishing tickets, read `docs/agents/issue-tracker.md` for the GitHub workflow.'],
    ['Domain docs', 'Before exploring domain code or recording a decision, read `docs/agents/domain.md`.'],
    ...(triageEnabled ? [['Triage labels', 'Before triaging an issue, read `docs/agents/triage-labels.md` for the configured role mapping.']] : []),
  ]) {
    if (!heading || !pointer) continue;
    if (!section.includes(pointer.match(/`([^`]+)`/)?.[1] ?? pointer)) {
      const existing = new RegExp(`^### ${heading}\\s*$`, 'm').exec(section);
      if (existing) { const at = existing.index + existing[0].length; section = section.slice(0,at) + `\n\n${pointer}\n` + section.slice(at); }
      else section += `\n### ${heading}\n\n${pointer}\n`;
    }
  }
  content = content.slice(0, start) + section + content.slice(end);
  if (original) original.content = content; else result.push({ path: 'AGENTS.md', content });
  const ignore = result.find(f => f.path === '.gitignore');
  const exclusions = ['.env', '.env.*', '!.env.example', '!.env.*.example', 'node_modules/', 'dist/', 'build/', 'coverage/', '.cache/', '*.log', '*.pem', '*.key'];
  const ignoreContent = `${ignore?.content.trimEnd() ?? ''}\n${exclusions.filter(p => !ignore?.content.split(/\r?\n/).includes(p)).join('\n')}\n`;
  if (ignore) ignore.content = ignoreContent; else result.push({ path: '.gitignore', content: ignoreContent });
  result.push({ path: 'docs/agents/issue-tracker.md', content: resources[0]! }, { path: 'docs/agents/domain.md', content: resources[1]! });
  if (triageEnabled) result.push({ path: 'docs/agents/triage-labels.md', content: resources[2]! });
  result.sort((a, b) => a.path < b.path ? -1 : 1);
  if (result.reduce((n, f) => n + Buffer.byteLength(f.content), 0) > 262144 || result.some(f => Buffer.byteLength(f.content) > 65536)) throw new OperationError(400, 'TEMPLATE_TOO_LARGE', 'Rendered scaffold exceeds its resource limits.');
  return result;
}
export const engineeringSummary = (triageEnabled: boolean): Static<typeof ScaffoldEngineering> => ({ tracker: 'github', domain: 'single-context', instructionFile: 'AGENTS.md', triageEnabled, installsSkills: false, createsLabels: false });
