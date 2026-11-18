import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidAttemptSearch, normalizeAttemptTitle, prepareAttemptSearch } from './attempt-search.js';
import { readAttemptPage } from './queries.js';

const currentAccount = 'account-a';
const installationId = 'installation-a';
const projectA = randomUUID();
const projectB = randomUUID();
const databases: Database.Database[] = [];

function database(): Database.Database {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE factory_settings (
      id TEXT, installation_id TEXT, account_id TEXT, designated_host TEXT, projects_root TEXT,
      automation_enabled INTEGER, time_defaults_json TEXT, artifact_policy_json TEXT,
      revision INTEGER, created_at_ms INTEGER, updated_at_ms INTEGER
    );
    CREATE TABLE operation_requests (operation_id TEXT, installation_id TEXT, account_id TEXT);
    CREATE TABLE events (seq INTEGER, operation_id TEXT);
    CREATE TABLE publication_requests (attempt_id TEXT, state TEXT, diagnostic TEXT);
    CREATE TABLE attempts (
      id TEXT, account_id TEXT, project_id TEXT, issue_id TEXT, issue_number INTEGER, issue_title TEXT,
      phase TEXT, result TEXT, suspension TEXT, diagnostic TEXT, revision INTEGER, created_at_ms INTEGER, updated_at_ms INTEGER
    );
  `);
  db.prepare(`INSERT INTO factory_settings VALUES (
    'local', ?, ?, NULL, NULL, 0,
    '{"formatVersion":1,"pollingIntervalMs":15000,"passageActiveTimeMs":1800000,"questionTtl":{"state":"not_configured"}}',
    '{"formatVersion":1,"automaticDeletion":false}', 1, 1, 1
  )`).run(installationId, currentAccount);
  return db;
}

function attempt(db: Database.Database, input: Partial<{
  accountId: string; projectId: string; issueId: string; issueNumber: number; issueTitle: string | null;
  phase: string; result: string | null; suspension: string | null; createdAtMs: number; updatedAtMs: number;
}> = {}): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO attempts (
    id,account_id,project_id,issue_id,issue_number,issue_title,phase,result,suspension,revision,created_at_ms,updated_at_ms
  ) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(
    id, input.accountId ?? currentAccount, input.projectId ?? projectA, input.issueId ?? `issue-${id}`,
    input.issueNumber ?? 1, input.issueTitle === undefined ? 'Issue title' : input.issueTitle,
    input.phase ?? 'finished', input.result === undefined ? 'delivered' : input.result, input.suspension ?? null,
    input.createdAtMs ?? 1_000, input.updatedAtMs ?? 2_000,
  );
  return id;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe('attempt search normalization and date boundaries', () => {
  it('normalizes Unicode case while preserving accents and literal title characters', () => {
    expect(normalizeAttemptTitle('CAFÉ Straße Σς longſ')).toBe('café strasse σσ longs');
    expect(normalizeAttemptTitle('Cafe\u0301')).toBe('café');
    expect(normalizeAttemptTitle('cafe')).not.toBe(normalizeAttemptTitle('café'));
  });

  it('calculates civil-day bounds across daylight-saving transitions without adding 24 hours', () => {
    const spring = prepareAttemptSearch({ dateFrom: '2024-03-10', dateTo: '2024-03-10', timeZone: 'America/New_York' });
    expect(spring.fromMs).toBe(Date.parse('2024-03-10T05:00:00.000Z'));
    expect(spring.untilMs).toBe(Date.parse('2024-03-11T04:00:00.000Z'));
    expect(spring.untilMs! - spring.fromMs!).toBe(23 * 60 * 60 * 1000);

    const fall = prepareAttemptSearch({ dateFrom: '2024-11-03', dateTo: '2024-11-03', timeZone: 'America/New_York' });
    expect(fall.fromMs).toBe(Date.parse('2024-11-03T04:00:00.000Z'));
    expect(fall.untilMs).toBe(Date.parse('2024-11-04T05:00:00.000Z'));
    expect(fall.untilMs! - fall.fromMs!).toBe(25 * 60 * 60 * 1000);
  });

  it.each([
    [{ dateFrom: '2024-02-30', timeZone: 'UTC' }, 'calendário'],
    [{ dateFrom: '2024-03-11', dateTo: '2024-03-10', timeZone: 'UTC' }, 'anterior'],
    [{ dateFrom: '2024-03-10' }, 'fuso horário IANA'],
    [{ dateFrom: '2024-03-10', timeZone: 'Not/A_Timezone' }, 'fuso horário IANA válido'],
  ] as const)('rejects invalid date search %#', (query, message) => {
    expect(() => prepareAttemptSearch(query)).toThrow(new RegExp(message));
    expect(() => prepareAttemptSearch(query)).toThrow(InvalidAttemptSearch);
  });
});

describe('readAttemptPage', () => {
  it('finds a title match beyond the unfiltered first page and treats LIKE characters literally', () => {
    const db = database();
    for (let index = 0; index < 25; index += 1) {
      attempt(db, { createdAtMs: 10_000 + index, issueTitle: 'Another issue' });
    }
    const target = attempt(db, { createdAtMs: 1_000, issueNumber: 77, issueTitle: 'CAFÉ Straße 50%_done' });
    attempt(db, { createdAtMs: 900, issueNumber: 77, issueTitle: 'CAFÉ Straße 50xxdone' });
    const injectionText = "' OR 1=1 --";
    const injectionRow = attempt(db, { createdAtMs: 800, issueNumber: 78, issueTitle: injectionText });

    const firstUnfilteredPage = readAttemptPage(db, { limit: '25' });
    expect(firstUnfilteredPage.has_more).toBe(true);
    expect(firstUnfilteredPage.items.map(row => row.id)).not.toContain(target);

    const found = readAttemptPage(db, { limit: '25', issueNumber: '77', issueTitle: 'Cafe\u0301 STRASSE 50%_' });
    expect(found.items.map(row => row.id)).toEqual([target]);
    expect(found.has_more).toBe(false);
    expect(readAttemptPage(db, { limit: '25', issueTitle: injectionText }).items.map(row => row.id)).toEqual([injectionRow]);
  });

  it('combines account, project, result, number, title and inclusive local dates before pagination', () => {
    const db = database();
    const range = prepareAttemptSearch({ dateFrom: '2024-11-03', dateTo: '2024-11-03', timeZone: 'America/New_York' });
    const before = attempt(db, { createdAtMs: range.fromMs! - 1, issueNumber: 3, issueTitle: 'Match' });
    const firstIncluded = attempt(db, { createdAtMs: range.fromMs!, issueNumber: 3, issueTitle: 'Match' });
    const lastIncluded = attempt(db, { createdAtMs: range.untilMs! - 1, issueNumber: 3, issueTitle: 'Match' });
    const after = attempt(db, { createdAtMs: range.untilMs!, issueNumber: 3, issueTitle: 'Match' });
    attempt(db, { createdAtMs: range.fromMs!, issueNumber: 4, issueTitle: 'Match' });
    attempt(db, { createdAtMs: range.fromMs!, projectId: projectB, issueNumber: 3, issueTitle: 'Match' });
    attempt(db, { createdAtMs: range.fromMs!, issueNumber: 3, issueTitle: 'Match', result: 'failed' });
    attempt(db, { accountId: 'account-b', createdAtMs: range.fromMs!, issueNumber: 3, issueTitle: 'Match' });

    const result = readAttemptPage(db, {
      limit: '25', projectId: projectA, result: 'delivered', issueNumber: '3', issueTitle: 'match',
      dateFrom: '2024-11-03', dateTo: '2024-11-03', timeZone: 'America/New_York',
    });
    expect(result.items.map(row => row.id)).toEqual([lastIncluded, firstIncluded]);
    expect(result.items.map(row => row.id)).not.toContain(before);
    expect(result.items.map(row => row.id)).not.toContain(after);
  });

  it('applies combined filters before pagination for a matching row beyond the unfiltered first page', () => {
    const db = database();
    const range = prepareAttemptSearch({ dateFrom: '2024-11-03', dateTo: '2024-11-03', timeZone: 'America/New_York' });
    for (let index = 0; index < 40; index += 1) {
      attempt(db, { projectId: projectA, result: 'delivered', issueNumber: 9, issueTitle: 'Other issue', createdAtMs: range.fromMs! + 10_000 + index });
    }
    attempt(db, { projectId: projectA, result: 'delivered', issueNumber: 77, issueTitle: 'Release 50xx_candidate', createdAtMs: range.fromMs! + 2_000 });
    const target = attempt(db, { projectId: projectA, result: 'delivered', issueNumber: 77, issueTitle: 'Release 50%_candidate', createdAtMs: range.fromMs! + 1_000 });

    const unfiltered = readAttemptPage(db, { limit: '25' });
    expect(unfiltered.items.map(row => row.id)).not.toContain(target);
    const filtered = readAttemptPage(db, {
      limit: '1', projectId: projectA, result: 'delivered', issueNumber: '77', issueTitle: '50%_',
      dateFrom: '2024-11-03', dateTo: '2024-11-03', timeZone: 'America/New_York',
    });
    expect(filtered.items.map(row => row.id)).toEqual([target]);
    expect(filtered.has_more).toBe(false);
  });

  it('keeps continuation pages inside the insertion ceiling and rejects a cursor after filter changes', () => {
    const db = database();
    const original = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      original.add(attempt(db, { createdAtMs: 100_000 + index, issueTitle: 'Common title' }));
    }
    attempt(db, { accountId: 'account-b', createdAtMs: 200_000, issueTitle: 'Common title' });
    const query = { limit: '25', issueTitle: 'common title', timeZone: 'America/Sao_Paulo' };
    const first = readAttemptPage(db, query);
    expect(first.items).toHaveLength(25);
    expect(first.has_more).toBe(true);
    const lateInsert = attempt(db, { createdAtMs: 300_000, issueTitle: 'Common title' });
    expect(() => readAttemptPage(db, { ...query, issueTitle: 'different title', cursor: first.next_cursor! }))
      .toThrow(expect.objectContaining({ code: 'QUERY_CURSOR_INVALID' }));

    const ids = [...first.items.map(row => row.id)];
    let cursor = first.next_cursor;
    while (cursor) {
      const next = readAttemptPage(db, { ...query, cursor });
      ids.push(...next.items.map(row => row.id));
      cursor = next.next_cursor;
    }
    expect(new Set(ids)).toEqual(original);
    expect(ids).not.toContain(lateInsert);
    expect(ids).toHaveLength(60);
  });

  it('returns a distinct successful empty page', () => {
    const result = readAttemptPage(database(), { issueTitle: 'absent title' });
    expect(result).toMatchObject({ items: [], has_more: false, next_cursor: null });
  });
});
