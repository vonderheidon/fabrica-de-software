import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { readAttemptPage } from '../dist/apps/controller/src/modules/storage/queries.js';

const accountId = 'measurement-account';
const installationId = 'measurement-installation';
const projectA = randomUUID();
const projectB = randomUUID();
const rowCount = 10_000;
const payload = JSON.stringify({ capture: 'x'.repeat(4096) });
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE factory_settings (
    id TEXT, installation_id TEXT, account_id TEXT, designated_host TEXT, projects_root TEXT,
    automation_enabled INTEGER, time_defaults_json TEXT, artifact_policy_json TEXT,
    revision INTEGER, created_at_ms INTEGER, updated_at_ms INTEGER
  );
  CREATE TABLE operation_requests (operation_id TEXT, installation_id TEXT, account_id TEXT);
  CREATE TABLE events (seq INTEGER, operation_id TEXT);
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY, account_id TEXT, project_id TEXT, issue_id TEXT, issue_number INTEGER, issue_title TEXT,
    phase TEXT, result TEXT, suspension TEXT, revision INTEGER, created_at_ms INTEGER, updated_at_ms INTEGER, capture_json TEXT
  );
  CREATE INDEX attempts_account_created ON attempts(account_id,created_at_ms,id);
  CREATE INDEX attempts_project_created ON attempts(project_id,created_at_ms,id);
  CREATE INDEX attempts_account_issue_number_created ON attempts(account_id,issue_number,created_at_ms DESC,id DESC);
`);
db.prepare(`INSERT INTO factory_settings VALUES (
  'local', ?, ?, NULL, NULL, 0,
  '{"formatVersion":1,"pollingIntervalMs":15000,"passageActiveTimeMs":1800000,"questionTtl":{"state":"not_configured"}}',
  '{"formatVersion":1,"automaticDeletion":false}', 1, 1, 1
)`).run(installationId, accountId);

const addAttempt = db.prepare(`INSERT INTO attempts (
  id,account_id,project_id,issue_id,issue_number,issue_title,phase,result,suspension,revision,created_at_ms,updated_at_ms,capture_json
) VALUES (?,?,?,?,?,?,?,?,NULL,1,?,?,?)`);
db.transaction(() => {
  const start = Date.parse('2024-01-01T00:00:00Z');
  for (let index = 0; index < rowCount; index += 1) {
    const issueNumber = index % 100 + 1;
    const issueTitle = index % 50 === 0 ? `Target Café ${index} 50%_literal` : `Issue ${issueNumber} historical title`;
    addAttempt.run(randomUUID(), index % 20 === 0 ? 'measurement-other-account' : accountId,
      index % 3 === 0 ? projectA : projectB, `issue-${index}`, issueNumber, issueTitle,
      'finished', index % 5 === 0 ? 'failed' : 'delivered', start + index * 60_000, start + index * 60_000 + 1000, payload);
  }
})();

function instrument(database) {
  const statements = [];
  const proxy = {
    prepare(sql, ...options) {
      const statement = database.prepare(sql, ...options);
      return new Proxy(statement, {
        get(target, property) {
          if (property === 'all') return (...bindings) => {
            if (sql.includes('FROM attempts a WHERE')) statements.push({ sql, bindings: bindings[0] });
            return target.all(...bindings);
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  return { proxy, statements };
}

function explain(entry) {
  return db.prepare(`EXPLAIN QUERY PLAN ${entry.sql}`).all(entry.bindings).map(row => row.detail);
}

function measure(name, query, cursor = null) {
  const { proxy, statements } = instrument(db);
  const options = cursor ? { ...query, cursor } : query;
  const samplesMs = [];
  let result;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const started = performance.now();
    result = readAttemptPage(proxy, options);
    const duration = performance.now() - started;
    if (iteration > 0) samplesMs.push(Number(duration.toFixed(3)));
  }
  const sql = statements[0]?.sql ?? '';
  return {
    name, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[Math.floor(samplesMs.length / 2)],
    rows: result.items.length, hasMore: result.has_more,
    queryPlan: statements.length ? explain(statements[0]) : [],
    readsCaptureJson: /\bcapture_json\b/i.test(sql),
    usesLike: /\bLIKE\b/i.test(sql),
  };
}

const firstQuery = { limit: '25' };
const firstPage = readAttemptPage(db, firstQuery);
const combinedQuery = {
  limit: '25', projectId: projectA, result: 'delivered', issueNumber: '17',
  dateFrom: '2024-01-05', dateTo: '2024-01-12', timeZone: 'UTC',
};
const results = {
  dataset: { attempts: rowCount, largeCapturePayloadBytesPerAttempt: Buffer.byteLength(payload), accounts: 2, projects: 2 },
  scenarios: [
    measure('first-page', firstQuery),
    measure('next-page', firstQuery, firstPage.next_cursor),
    measure('empty-title-search', { limit: '25', issueTitle: 'no matching title exists' }),
    measure('exact-issue-number', { limit: '25', issueNumber: '17' }),
    measure('combined-number-project-result-period', combinedQuery),
    measure('unicode-literal-title', { limit: '25', issueTitle: '50%_' }),
  ],
  indexes: db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='index' AND tbl_name='attempts' ORDER BY name").all(),
  database: { pages: db.pragma('page_count', { simple: true }), pageSize: db.pragma('page_size', { simple: true }) },
};
const filename = resolve('.cache/sprint033/attempt-search-measurement.json');
mkdirSync(resolve('.cache/sprint033'), { recursive: true });
writeFileSync(filename, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ filename, ...results }, null, 2));
db.close();
