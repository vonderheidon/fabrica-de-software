// @ts-check
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

// Offline evidence checks only. This module cannot launch the product or authorize effects.
export const scenarioRequirements = Object.freeze({
  'registration-icr': ['AC-01', 'AC-05', 'AC-06', 'AC-07', 'AC-09', 'AC-13', 'AC-20', 'INT-03', 'INT-06', 'INT-18'],
  'correction': ['AC-08', 'AC-13', 'INT-18'],
  'tui-mcp': ['AC-15', 'AC-23', 'AC-25', 'INT-01', 'INT-02', 'INT-04', 'INT-05', 'INT-09', 'INT-10', 'INT-12', 'INT-14'],
  'transport': ['AC-24', 'INT-13'],
  'question': ['AC-14', 'INT-07'],
  'answer-unknown': ['AC-14', 'INT-07'],
  'cancel-startup': ['AC-16', 'AC-26', 'INT-15', 'INT-16'],
  'cancel-child': ['AC-16', 'AC-26', 'INT-15', 'INT-16'],
  'restart-retry': ['AC-17', 'AC-18', 'AC-20', 'INT-08', 'INT-17'],
  'ui-prerequisites': ['S2', 'S3', 'S4', 'INT-11'],
});
export const prerequisiteIds = ['sprint-017', 'sprint-033', 'sprint-034'];
export const toolNames = ['node', 'git', 'gh', 'maestri', 'omp', 'gitnexus', 'playwright-mcp', 'chrome'];
export const requiredEffects = ['provider', 'managed-git', 'github-comment', 'github-status', 'own-cancel', 'own-restart'];
const closed = { additionalProperties: false };
const text = Type.String({ minLength: 1, maxLength: 2048, pattern: '\\S' });
const id = Type.String({ minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$' });
const sha256 = Type.String({ pattern: '^[a-f0-9]{64}$' });
const time = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const nullableTime = Type.Union([time, Type.Null()]);
const texts = Type.Array(id, { maxItems: 100, uniqueItems: true });
const profile = Type.Object({ provider: text, model: text, effort: text }, closed);
export const EvidenceManifest = Type.Object({
  formatVersion: Type.Literal(1), proofId: id, preparedAtMs: time, startedAtMs: nullableTime, endedAtMs: nullableTime,
  product: Type.Object({ version: text, sourceRevision: Type.Union([text, Type.Null()]), sourceEvidenceId: Type.Union([id, Type.Null()]) }, closed),
  authorization: Type.Union([Type.Null(), Type.Object({
    referenceEvidenceId: id, authorizedAtMs: time, expiresAtMs: time,
    accountId: text, repositoryId: text, repositoryUrl: Type.String({ pattern: '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' }),
    projectId: text, issueIds: Type.Array(id, { minItems: 1, maxItems: 20, uniqueItems: true }), host: text,
    profiles: Type.Object({ implementer: profile, reviewer: profile }, closed),
    budget: Type.Object({ currency: Type.String({ pattern: '^[A-Z]{3}$' }), maximum: Type.Number({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }) }, closed),
    effects: Type.Array(id, { minItems: 1, maxItems: 20, uniqueItems: true }),
  }, closed)]),
  tools: Type.Array(Type.Object({ name: id, version: Type.Union([text, Type.Null()]), reason: Type.Union([text, Type.Null()]) }, closed), { maxItems: 20 }),
  prerequisites: Type.Array(Type.Object({ id, state: Type.Union(['verified', 'pending', 'failed'].map(v => Type.Literal(v))), evidenceIds: texts }, closed), { maxItems: 3 }),
  attempts: Type.Array(Type.Object({ attemptId: id, captureEvidenceId: id }, closed), { maxItems: 20 }),
  evidence: Type.Array(Type.Object({
    id, path: Type.String({ minLength: 1, maxLength: 512 }), sha256,
    bytes: Type.Integer({ minimum: 1, maximum: 8 * 1024 * 1024 }),
    kind: Type.Union(['real', 'local', 'controlled'].map(v => Type.Literal(v))), capturedAtMs: time,
  }, closed), { maxItems: 100 }),
  scenarios: Type.Array(Type.Object({
    id, state: Type.Union(['pending', 'passed', 'failed'].map(v => Type.Literal(v))),
    evidenceIds: texts, attemptIds: texts, reason: Type.Union([text, Type.Null()]),
  }, closed), { maxItems: 10 }),
}, closed);

/** @typedef {import('@sinclair/typebox').Static<typeof EvidenceManifest>} Manifest */
/** @param {string} root @param {string} path */
function contained(root, path) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}

/** Bounded, read-only access; no arbitrary paths, symlinks, junctions or raw errors in output.
 * @param {string} root @param {string} path @param {number} maximum
 */
export function readEvidence(root, path, maximum) {
  if (!/^[a-zA-Z0-9_./ -]+\.(?:json|md|txt|log|png)$/.test(path) || path.split('/').some(s => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    throw new Error('EVIDENCE_PATH_INVALID');
  }
  const base = realpathSync(root);
  let target = base;
  for (const segment of path.split('/')) {
    target = resolve(target, segment);
    if (!contained(base, target) || lstatSync(target).isSymbolicLink() || !contained(base, realpathSync(target))) throw new Error('EVIDENCE_PATH_INVALID');
  }
  const fd = openSync(target, 'r');
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > maximum) throw new Error('EVIDENCE_SIZE_INVALID');
    // Reading one extra byte detects growth without allocating an unbounded buffer.
    const buffer = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    const after = fstatSync(fd);
    if (size !== before.size || after.size !== size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.ino !== before.ino) throw new Error('EVIDENCE_CHANGED');
    return buffer.subarray(0, size);
  } finally { closeSync(fd); }
}

/** @param {unknown} value @param {(path: string, maximum: number) => Uint8Array} read */
export function evaluateEvidence(value, read) {
  if (!Value.Check(EvidenceManifest, value)) return { state: 'invalid', readyForReview: false, diagnostics: ['MANIFEST_INVALID'] };
  const m = value;
  /** @type {string[]} */
  const diagnostics = [];
  let invalid = false;
  /** @param {string} code */
  const add = code => { diagnostics.push(code); };
  /** @param {string} code */
  const reject = code => { invalid = true; add(code); };
  /** @param {{id: string}[]} entries */
  const unique = entries => new Set(entries.map(e => e.id)).size === entries.length;
  if (!unique(m.evidence) || !unique(m.scenarios) || !unique(m.prerequisites) || new Set(m.attempts.map(a => a.attemptId)).size !== m.attempts.length) reject('DUPLICATE_ID');
  if (new Set(m.evidence.map(e => e.path)).size !== m.evidence.length) reject('DUPLICATE_EVIDENCE_PATH');
  const evidence = new Map(m.evidence.map(e => [e.id, e]));
  /** @param {string[]} ids @param {string} code @param {boolean} real */
  const requireEvidence = (ids, code, real) => {
    if (ids.length === 0 || ids.some(i => !evidence.has(i) || (real && evidence.get(i)?.kind !== 'real'))) add(code);
  };
  /** @param {string} id @param {string} code */
  const requirePreflight = (id, code) => {
    const e = evidence.get(id);
    if (e && m.startedAtMs !== null && e.capturedAtMs > m.startedAtMs) reject(code);
  };
  let total = 0;
  for (const e of m.evidence) {
    total += e.bytes;
    if (total > 64 * 1024 * 1024) { reject('EVIDENCE_BUDGET_EXCEEDED'); break; }
    try {
      const bytes = read(e.path, 8 * 1024 * 1024);
      if (bytes.byteLength !== e.bytes || createHash('sha256').update(bytes).digest('hex') !== e.sha256) reject('EVIDENCE_INTEGRITY_FAILED');
    } catch { reject('EVIDENCE_UNREADABLE'); }
  }
  if (!m.product.sourceEvidenceId) add('PRODUCT_SOURCE_PENDING');
  else {
    requireEvidence([m.product.sourceEvidenceId], 'PRODUCT_SOURCE_PENDING', true);
    requirePreflight(m.product.sourceEvidenceId, 'PRODUCT_SOURCE_AFTER_START');
  }
  if (!m.authorization) add('AUTHORIZATION_PENDING');
  else {
    const a = m.authorization;
    requireEvidence([a.referenceEvidenceId], 'AUTHORIZATION_EVIDENCE_REQUIRED', true);
    requirePreflight(a.referenceEvidenceId, 'AUTHORIZATION_EVIDENCE_AFTER_START');
    if (a.authorizedAtMs >= a.expiresAtMs || (m.startedAtMs !== null && m.startedAtMs < a.authorizedAtMs) || (m.endedAtMs !== null && m.endedAtMs > a.expiresAtMs)) reject('AUTHORIZATION_WINDOW_INVALID');
    if (requiredEffects.some(effect => !a.effects.includes(effect)) || a.effects.some(effect => !requiredEffects.includes(effect))) reject('EFFECT_AUTHORIZATION_INVALID');
  }
  if (m.startedAtMs === null || m.endedAtMs === null) add('REAL_EXECUTION_PENDING');
  else if (m.startedAtMs < m.preparedAtMs || m.endedAtMs < m.startedAtMs) reject('PROOF_WINDOW_INVALID');
  if (m.startedAtMs === null && m.endedAtMs !== null) reject('PROOF_WINDOW_INVALID');
  if (m.tools.length !== toolNames.length || new Set(m.tools.map(t => t.name)).size !== toolNames.length || toolNames.some(name => !m.tools.some(t => t.name === name && t.version !== null && t.reason === null))) add('VERSIONS_PENDING');
  for (const id of prerequisiteIds) {
    const p = m.prerequisites.find(p => p.id === id);
    if (!p || p.state !== 'verified') add(`PREREQUISITE_PENDING:${id}`);
    else requireEvidence(p.evidenceIds, `PREREQUISITE_EVIDENCE_REQUIRED:${id}`, true);
  }
  for (const a of m.attempts) {
    requireEvidence([a.captureEvidenceId], 'ATTEMPT_CAPTURE_REQUIRED', true);
    const e = evidence.get(a.captureEvidenceId);
    if (e && ((m.startedAtMs !== null && e.capturedAtMs < m.startedAtMs) || (m.endedAtMs !== null && e.capturedAtMs > m.endedAtMs))) reject('ATTEMPT_CAPTURE_OUTSIDE_PROOF');
  }
  for (const id of Object.keys(scenarioRequirements)) {
    const s = m.scenarios.find(s => s.id === id);
    if (!s || s.state !== 'passed') { add(`SCENARIO_PENDING:${id}`); continue; }
    if (s.reason !== null) reject(`SCENARIO_CONFLICT:${id}`);
    requireEvidence(s.evidenceIds, `REAL_EVIDENCE_REQUIRED:${id}`, id !== 'transport');
    if (id === 'transport' && s.evidenceIds.some(ref => evidence.get(ref)?.kind === 'controlled')) add('LOCAL_TRANSPORT_EVIDENCE_REQUIRED');
    if (s.attemptIds.length === 0 || s.attemptIds.some(ref => !m.attempts.some(a => a.attemptId === ref))) add(`ATTEMPT_CORRELATION_REQUIRED:${id}`);
    if (id === 'restart-retry' && s.attemptIds.length < 2) add('DISTINCT_RETRY_ATTEMPTS_REQUIRED');
    const startedAtMs = m.startedAtMs; const endedAtMs = m.endedAtMs;
    if (startedAtMs !== null && endedAtMs !== null && s.evidenceIds.some(ref => {
      const e = evidence.get(ref); return e && (e.capturedAtMs < startedAtMs || e.capturedAtMs > endedAtMs);
    })) reject(`EVIDENCE_OUTSIDE_PROOF:${id}`);
  }
  if (m.scenarios.some(s => !Object.hasOwn(scenarioRequirements, s.id))) reject('UNKNOWN_SCENARIO');
  const failed = m.scenarios.some(s => s.state === 'failed') || m.prerequisites.some(p => p.state === 'failed');
  return { state: failed ? 'failed' : invalid ? 'invalid' : diagnostics.length ? 'pending' : 'ready_for_review', readyForReview: diagnostics.length === 0 && !failed,
    acceptance: 'requires_independent_review', diagnostics: [...new Set(diagnostics)] };
}

/** @param {{state: string, readyForReview: boolean}} report */
export function evidenceExitCode(report) {
  return report.readyForReview ? 0 : report.state === 'invalid' || report.state === 'failed' ? 1 : 2;
}

/** @param {string} file */
export function checkManifestFile(file) {
  try {
    const path = resolve(file);
    const raw = readEvidence(dirname(path), relative(dirname(path), path), 1024 * 1024);
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    return evaluateEvidence(parsed, (name, maximum) => readEvidence(dirname(path), name, maximum));
  } catch { return { state: 'invalid', readyForReview: false, diagnostics: ['MANIFEST_UNREADABLE'] }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = process.argv.length === 3 ? checkManifestFile(process.argv[2] ?? '') : { state: 'invalid', readyForReview: false, diagnostics: ['MANIFEST_ARGUMENT_REQUIRED'] };
  console.log(JSON.stringify(report));
  process.exitCode = evidenceExitCode(report);
}
