import { createHash } from 'node:crypto';
import type { CriteriaPreview, Criterion } from '#contracts';

export function preparationDigest(value: unknown): string {
  function canonical(item: unknown): string {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    return `{${Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, part]) => `${JSON.stringify(key)}:${canonical(part)}`).join(',')}}`;
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f*_`]/g, '').toLowerCase().replace(/[\s:/_-]+/g, ' ').trim();

/** Only the issue body introduces criteria. Comments and task-list check marks are not authority. */
export function interpretIssue(input: { title: string; body: string }): CriteriaPreview {
  const reasons: string[] = []; const entries: string[] = []; const objective: string[] = [];
  let section: 'criteria' | 'objective' | 'other' = 'objective'; let sectionDepth = 7;
  let fence: { character: string; length: number } | null = null; let comment = false;
  let active = -1;
  const body = input.body.replace(/^([^\n]+)\r?\n(={3,}|-{3,})\s*$/gm, (_match, title: string, underline: string) => `${underline[0] === '=' ? '#' : '##'} ${title}`);
  for (const raw of body.split(/\r?\n/)) {
    // Ignore fenced examples and HTML comments instead of treating example lists as requirements.
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
    if (delimiter) {
      if (!fence) fence = { character: delimiter[0]!, length: delimiter.length };
      else if (delimiter[0] === fence.character && delimiter.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    let line = ''; let rest = raw;
    while (rest.length) {
      const start = rest.indexOf(comment ? '-->' : '<!--');
      if (start < 0) { if (!comment) line += rest; break; }
      if (!comment) line += rest.slice(0, start);
      rest = rest.slice(start + (comment ? 3 : 4)); comment = !comment;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const name = normalized(heading[2] ?? ''); const depth = heading[1]!.length;
      if (name === 'criterios de aceite' || name === 'acceptance criteria') { section = 'criteria'; sectionDepth = depth; }
      else if (/^(?:objetivo|escopo|objetivo e escopo|objetivo escopo|objective|scope|objective and scope)$/.test(name)) { section = 'objective'; sectionDepth = depth; }
      else if (depth <= sectionDepth) { section = 'other'; sectionDepth = depth; }
      active = -1; continue;
    }
    if (section === 'objective' && line.trim() && !/^\s*(?:>|!\[|\[.+\]:)/.test(line)) objective.push(line.trim());
    if (section !== 'criteria') continue;
    const item = /^\s{0,3}(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/.exec(line);
    if (item) { entries.push((item[1] ?? '').trim()); active = entries.length - 1; }
    else if (/^\s{2,}\S/.test(line) && active >= 0) entries[active] += `\n${line.trim()}`;
    else if (line.trim()) active = -1;
  }
  if (!input.title.trim()) reasons.push('ISSUE_TITLE_REQUIRED');
  const scope = objective.join('\n').trim();
  if (!scope) reasons.push('ISSUE_OBJECTIVE_REQUIRED');
  if (!entries.length || entries.some((text) => !text.trim()) || entries.length > 1000) reasons.push('CRITERIA_LIST_INVALID');
  const used = new Set<string>();
  const parsed = entries.slice(0, 1000).map((entry) => {
    const explicit = /^(?:\[\s*(ac-[0-9]+)\s*\]|\(\s*(ac-[0-9]+)\s*\)|(?:\*\*|`)?(ac-[0-9]+)(?:\*\*|`)?)(?:\s*[:.)\-–—]\s*|\s+|$)/i.exec(entry);
    const id = (explicit?.[1] ?? explicit?.[2] ?? explicit?.[3])?.toLowerCase(); const text = explicit ? entry.slice(explicit[0].length).trim() : entry.trim();
    if (id && (!/^ac-[1-9][0-9]*$/.test(id) || id.length > 128)) reasons.push('CRITERION_ID_INVALID');
    if (id && used.has(id)) reasons.push('CRITERION_ID_DUPLICATED');
    if (id) used.add(id);
    if (!text || text.length > 65536) reasons.push('CRITERION_TEXT_INVALID');
    return { id, text };
  });
  let next = 1;
  const criteria: Criterion[] = parsed.map((entry, index) => {
    while (used.has(`ac-${next}`)) next++;
    const id = entry.id ?? `ac-${next++}`; used.add(id);
    return { id, text: entry.text, occurrenceIndex: index + 1, explicit: entry.id !== undefined };
  });
  // Invalid lists never become a capturable set, even when some entries were individually valid.
  const valid = reasons.length === 0;
  const captured = valid ? criteria : [];
  return { executable: valid, objective: scope, criteria: captured,
    digest: preparationDigest(captured.map(({ id, text }) => ({ id, text }))), reasons: [...new Set(reasons)] };
}
