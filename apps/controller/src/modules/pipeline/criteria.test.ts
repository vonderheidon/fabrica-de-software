import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CriteriaPreview } from '#contracts';
import { interpretIssue } from './index.js';

const parse = (list: string, heading = 'Critérios de aceite') => interpretIssue({ title: 'Implement feature', body: `## Objetivo / Escopo\nDeliver an observable feature.\n## ${heading}\n${list}` });
describe('criteria captured from the issue body by occurrence', () => {
  it.each(['What to build', 'Descrição', 'Description', 'O que construir', 'Objetivo e escopo'])('accepts ticket content under %s after metadata', heading => {
    const result = interpretIssue({ title: 'Configure installation', body: `## Parent\n#23\n## ${heading}\nConfigure the local installation.\n## Acceptance criteria\n- AC-1: Settings persist.\n## Blocked by\nNone` });
    expect(result).toMatchObject({ executable: true, objective: 'Configure the local installation.', reasons: [] });
    expect(result.criteria).toHaveLength(1);
  });
  it.each(['Critérios de aceitação', 'Acceptance Criteria:', 'Critérios de aceite'])('accepts criteria heading %s', heading => {
    expect(parse('- Observable result', heading).executable).toBe(true);
  });
  it('does not use metadata or unrelated lists as objective and criteria', () => {
    expect(interpretIssue({ title: 'Task', body: '## Parent\n#23\n## References\n- Link\n## Acceptance criteria\n- Valid' })).toMatchObject({ executable: false, reasons: ['ISSUE_OBJECTIVE_REQUIRED'] });
  });
  it.each(['Critérios de aceite', 'Acceptance criteria', '**Critérios de aceite**'])('accepts a Markdown list under %s', (heading) => {
    const result = parse('- [ ] [ac-9] First criterion\n1. Second criterion\n+ [x] Third criterion', heading);
    expect(result.executable).toBe(true); expect(Value.Check(CriteriaPreview, result)).toBe(true);
    expect(result.criteria.map((c) => c.id)).toEqual(['ac-9', 'ac-1', 'ac-2']);
  });
  it('reserves all explicit IDs before generating IDs and preserves repeated texts', () => {
    const result = parse('- Same requirement\n- **AC-1**: Same requirement\n- Same requirement');
    expect(result.criteria.map((c) => [c.id, c.text, c.occurrence_index, c.explicit])).toEqual([
      ['ac-2', 'Same requirement', 1, false], ['ac-1', 'Same requirement', 2, true], ['ac-3', 'Same requirement', 3, false],
    ]);
  });
  it.each(['[ac-1]', '`AC-1`:', '**ac-1**:', '(ac-1)'])('rejects duplicate explicit IDs for %s', (id) => {
    const result = parse(`- ac-1: First\n- ${id} Second`);
    expect(result).toMatchObject({ executable: false, criteria: [], reasons: ['CRITERION_ID_DUPLICATED'] });
  });
  it.each([
    { title: ' ', body: 'Goal\n## Acceptance criteria\n- Valid' },
    { title: 'Title', body: '## Acceptance criteria\n- Valid' },
    { title: 'Title', body: 'Goal\n## Acceptance criteria\nFree comment without list' },
  ])('requires title, objective and a valid list', (input) => expect(interpretIssue(input).executable).toBe(false));
  it('ignores commented and fenced lists, and free text after another section', () => {
    const result = parse('<!--\n- ac-1: comment\n-->\n```md\n- ac-1: example\n```\n- ac-1: Actual\n  continued text\n## Comments\n- ac-1: Comment');
    expect(result.criteria).toEqual([{ id: 'ac-1', text: 'Actual\ncontinued text', occurrence_index: 1, explicit: true }]);
  });
  it('supports Setext headings and rejects empty or invalid identifiers', () => {
    expect(interpretIssue({ title: 'Title', body: 'Objective\n===\nGoal\nAcceptance criteria\n---\n- Valid' }).executable).toBe(true);
    expect(parse('- ac-0: Invalid').reasons).toContain('CRITERION_ID_INVALID');
    expect(parse('- [ac-1]').reasons).toContain('CRITERION_TEXT_INVALID');
    expect(parse('- [ ] ').executable).toBe(false);
  });
  it('changes the digest for criterion edits while ignoring free comments and checkbox state', () => {
    expect(parse('- [ ] ac-1: Criterion\n## Comments\nEditorial').digest).toBe(parse('- [x] ac-1: Criterion').digest);
    expect(parse('- ac-1: Changed').digest).not.toBe(parse('- ac-1: Criterion').digest);
  });
  it('rejects excess instead of returning an executable truncated list', () => {
    const result = parse(Array.from({ length: 1001 }, () => '- Requirement').join('\n'));
    expect(result).toMatchObject({ executable: false, criteria: [] });
  });
});
