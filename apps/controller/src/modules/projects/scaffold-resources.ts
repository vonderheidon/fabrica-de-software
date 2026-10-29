import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ScaffoldEngineering, type ScaffoldInput } from '#contracts';
import { OperationError } from '../storage/index.js';

export function scaffoldDigest(value: unknown): string {
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object'
    ? `{${Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v);
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export const fileDigest = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
export interface TemplateFile { path: string; content: string }
export function renderScaffoldReadme(files: readonly TemplateFile[], input: ScaffoldInput): TemplateFile[] {
  const name = input.name.trim().replace(/[\r\n]+/g, ' ');
  const remote = input.remote;
  const status = `Remoto GitHub \`${remote.name}\` associado como \`origin\`, com o commit inicial publicado na branch \`${input.baseBranch}\`.`;
  const content = `# ${name}\n\nProjeto ${name}, preparado com configuração de engenharia para desenvolvimento pela Nova Fábrica.\n\n## Estado inicial\n\n${status}\n\n## Próximos passos\n\n1. Defina o escopo do projeto e implemente a aplicação. Este scaffold fornece configuração de engenharia.\n2. Configure um GitHub Project e seu mapeamento de Status na fábrica, e vincule a issue ao quadro antes de iniciar uma tentativa.\n3. Consulte \`AGENTS.md\` e \`docs/agents/\` para as orientações de trabalho.\n`;
  return files.map(file => file.path === 'README.md' ? { ...file, content } : { ...file });
}
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
function validateRenderedPaths(files: readonly TemplateFile[]): void {
  const paths = files.map(file => file.path.toLowerCase());
  if (files.some(file => !safeTemplatePath(file.path)) || new Set(paths).size !== paths.length ||
    paths.some(path => paths.some(other => other.startsWith(`${path}/`)))) {
    throw new OperationError(400, 'TEMPLATE_INVALID', 'Template files conflict with the generated engineering files.');
  }
}
interface InstructionHeading { level: number; title: string; start: number; end: number }
function instructionHeadings(content: string): InstructionHeading[] {
  const lines = content.split(/(?<=\n)/); const headings: InstructionHeading[] = [];
  let offset = 0; let fence: { marker: string; length: number } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!; const text = line.replace(/\r?\n$/, '');
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (delimiter && delimiter[1]![0] === fence.marker && delimiter[1]!.length >= fence.length && !delimiter[2]!.trim()) fence = undefined;
    } else if (delimiter) fence = { marker: delimiter[1]![0]!, length: delimiter[1]!.length };
    else {
      const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(text);
      const underline = lines[index + 1]?.replace(/\r?\n$/, '');
      if (atx) headings.push({ level: atx[1]!.length, title: atx[2]!.replace(/[ \t]+#+[ \t]*$/, '').trim().toLowerCase(), start: offset, end: offset + line.length });
      else if (/^ {0,3}\S/.test(text) && underline !== undefined && /^ {0,3}(?:=+|-+)[ \t]*$/.test(underline)) {
        const next = lines[++index]!;
        headings.push({ level: underline.trim()[0] === '=' ? 1 : 2, title: text.trim().toLowerCase(), start: offset, end: offset + line.length + next.length });
        offset += next.length;
      }
    }
    offset += line.length;
  }
  return headings;
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
      renderEngineering(template.files, engineering, false);
      renderEngineering(template.files, engineering, true);
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
  const headings = instructionHeadings(content).filter(heading => heading.level === 2 && heading.title === 'agent skills');
  if (headings.length > 1) throw new OperationError(400, 'TEMPLATE_INVALID', 'Agent skills sections must be unique.');
  if (headings.length === 0) content = `${content ? `${content.trimEnd()}\n\n` : ''}## Agent skills\n`;
  const allHeadings = instructionHeadings(content);
  const start = allHeadings.find(heading => heading.level === 2 && heading.title === 'agent skills')!.start;
  const end = allHeadings.find(heading => heading.start > start && heading.level <= 2)?.start ?? content.length;
  let section = content.slice(start, end);
  for (const [heading, pointer] of [
    ['Issue tracker', 'Before reading or publishing tickets, read `docs/agents/issue-tracker.md` for the GitHub workflow.'],
    ['Domain docs', 'Before exploring domain code or recording a decision, read `docs/agents/domain.md`.'],
    ...(triageEnabled ? [['Triage labels', 'Before triaging an issue, read `docs/agents/triage-labels.md` for the configured role mapping.']] : []),
  ]) {
    if (!heading || !pointer) continue;
    const sectionHeadings = instructionHeadings(section);
    const matches = sectionHeadings.filter(candidate => candidate.level === 3 && candidate.title === heading.toLowerCase());
    if (matches.length > 1) throw new OperationError(400, 'TEMPLATE_INVALID', 'Engineering instruction subsections must be unique.');
    const existing = matches[0];
    const subsectionEnd = existing ? sectionHeadings.find(candidate => candidate.start > existing.start && candidate.level <= 3)?.start ?? section.length : 0;
    if (existing && section.slice(existing.end, subsectionEnd).includes(pointer.match(/`([^`]+)`/)?.[1] ?? pointer)) continue;
    if (existing) section = section.slice(0,existing.end) + `\n${pointer}\n\n` + section.slice(existing.end);
    else section += `${section.endsWith('\n') ? '' : '\n'}\n### ${heading}\n\n${pointer}\n\n`;
  }
  content = content.slice(0, start) + section + content.slice(end);
  if (original) original.content = content; else result.push({ path: 'AGENTS.md', content });
  const ignore = result.find(f => f.path === '.gitignore');
  const exclusions = ['.env', '.env.*', '!.env.example', '!.env.*.example', 'credentials', 'credentials.*', 'id_rsa', 'node_modules/', 'dist/', 'build/', 'coverage/', '.cache/', '.playwright-mcp/', '*.log', '*.pem', '*.key'].join('\n');
  const previousIgnore = ignore?.content ?? '';
  const ignoreContent = previousIgnore.replace(/\r\n/g, '\n').trimEnd().endsWith(exclusions) ? previousIgnore
    : `${previousIgnore}${previousIgnore && !previousIgnore.endsWith('\n') ? '\n' : ''}\n${exclusions}\n`;
  if (ignore) ignore.content = ignoreContent; else result.push({ path: '.gitignore', content: ignoreContent });
  result.push({ path: 'docs/agents/issue-tracker.md', content: resources[0]! }, { path: 'docs/agents/domain.md', content: resources[1]! });
  if (triageEnabled) result.push({ path: 'docs/agents/triage-labels.md', content: resources[2]! });
  validateRenderedPaths(result);
  result.sort((a, b) => a.path < b.path ? -1 : 1);
  if (result.reduce((n, f) => n + Buffer.byteLength(f.content), 0) > 262144 || result.some(f => Buffer.byteLength(f.content) > 65536)) throw new OperationError(400, 'TEMPLATE_TOO_LARGE', 'Rendered scaffold exceeds its resource limits.');
  return result;
}
export const engineeringSummary = (triageEnabled: boolean): Static<typeof ScaffoldEngineering> => ({ tracker: 'github', domain: 'single-context', instructionFile: 'AGENTS.md', triageEnabled, installsSkills: false, createsLabels: false });
