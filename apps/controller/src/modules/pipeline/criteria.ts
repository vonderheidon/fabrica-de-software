import { createHash } from 'node:crypto';
import type { CriteriaPreview, Criterion, Prerequisite } from '#contracts';

export function preparationDigest(value: unknown): string {
  function canonical(item: unknown): string {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    return `{${Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, part]) => `${JSON.stringify(key)}:${canonical(part)}`).join(',')}}`;
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f*_`]/g, '').toLowerCase().replace(/[\s:/_-]+/g, ' ').trim();

const contentDiagnostics: Readonly<Record<string, Omit<Prerequisite, 'code'>>> = {
  ISSUE_TITLE_REQUIRED: { message: 'A issue não tem título.', recovery: 'Informe um título que identifique o trabalho e consulte novamente a preparação.' },
  ISSUE_OBJECTIVE_REQUIRED: { message: 'O objetivo da issue está ausente ou não foi reconhecido.', recovery: 'Descreva o trabalho sob Objetivo, Escopo, Descrição, Objective, Scope ou What to build e consulte novamente a preparação.' },
  CRITERIA_LIST_INVALID: { message: 'A lista de critérios de aceite está ausente, vazia ou excede 1.000 itens.', recovery: 'Use uma lista Markdown não vazia sob Critérios de aceite, Critérios de aceitação ou Acceptance criteria.' },
  CRITERION_ID_INVALID: { message: 'Um critério tem identificação inválida.', recovery: 'Use identificadores AC-1, AC-2 e seguintes, com número positivo, ou omita os IDs para gerá-los automaticamente.' },
  CRITERION_ID_DUPLICATED: { message: 'Dois ou mais critérios usam o mesmo identificador.', recovery: 'Atribua um identificador AC distinto a cada critério e consulte novamente a preparação.' },
  CRITERION_TEXT_INVALID: { message: 'Um critério está vazio ou excede 65.536 caracteres.', recovery: 'Descreva um resultado verificável em cada item da lista, dentro do limite de tamanho.' },
};

export function issueContentPrerequisite(code: string): Prerequisite | null {
  const diagnostic = contentDiagnostics[code];
  return diagnostic ? { code, ...diagnostic } : null;
}

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
      if (/^(?:criterios de aceite|criterios de aceitacao|acceptance criteria)$/.test(name)) { section = 'criteria'; sectionDepth = depth; }
      else if (/^(?:objetivo|escopo|objetivo e escopo|objetivo escopo|descricao|o que construir|o que implementar|objective|scope|objective and scope|description|what to build|what to implement)$/.test(name)) { section = 'objective'; sectionDepth = depth; }
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
    return { id, text: entry.text, occurrence_index: index + 1, explicit: entry.id !== undefined };
  });
  // Invalid lists never become a capturable set, even when some entries were individually valid.
  const valid = reasons.length === 0;
  const captured = valid ? criteria : [];
  return { executable: valid, objective: scope, criteria: captured,
    digest: preparationDigest(captured.map(({ id, text }) => ({ id, text }))), reasons: [...new Set(reasons)] };
}
