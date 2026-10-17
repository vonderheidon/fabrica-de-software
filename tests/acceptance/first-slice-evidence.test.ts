import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Static } from '@sinclair/typebox';
import { EvidenceManifest, checkManifestFile, evaluateEvidence, evidenceExitCode, prerequisiteIds, readEvidence, requiredEffects, scenarioRequirements, toolNames } from '../../scripts/first-slice-evidence.mjs';

type Manifest = Static<typeof EvidenceManifest>;
const bytes = Buffer.from('Synthetic evidence for validator tests only. Ação 😀');
const hash = createHash('sha256').update(bytes).digest('hex');
function candidate(): Manifest {
  return {
    formatVersion: 1, proofId: 'synthetic-validator-case', preparedAtMs: 1, startedAtMs: 3, endedAtMs: 5,
    product: { version: '0.1.0', sourceRevision: null, sourceEvidenceId: 'source' },
    authorization: { referenceEvidenceId: 'authorization', authorizedAtMs: 2, expiresAtMs: 6, accountId: 'account', repositoryId: 'repo',
      repositoryUrl: 'https://github.com/test-org/repo', projectId: 'project', issueIds: ['issue'], host: 'test-host',
      profiles: { implementer: { provider: 'test', model: 'test', effort: 'high' }, reviewer: { provider: 'test', model: 'test', effort: 'high' } },
      budget: { currency: 'USD', maximum: 1 }, effects: [...requiredEffects] },
    tools: toolNames.map(name => ({ name, version: 'synthetic', reason: null })),
    prerequisites: prerequisiteIds.map(id => ({ id, state: 'verified', evidenceIds: ['ui'] })),
    attempts: [{ attemptId: 'attempt-1', captureEvidenceId: 'capture-1' }, { attemptId: 'attempt-2', captureEvidenceId: 'capture-2' }],
    evidence: ['source', 'authorization', 'ui', 'capture-1', 'capture-2', 'observation'].map(id => ({
      id, path: `${id}.md`, sha256: hash, bytes: bytes.length, kind: 'real', capturedAtMs: ['source', 'authorization'].includes(id) ? 2 : 4,
    })),
    scenarios: Object.keys(scenarioRequirements).map(id => ({ id, state: 'passed', reason: null, evidenceIds: ['observation'],
      attemptIds: id === 'restart-retry' ? ['attempt-1', 'attempt-2'] : ['attempt-1'] })),
  };
}
const evaluate = (m: unknown) => evaluateEvidence(m, () => bytes);
const directories: string[] = [];
afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true }); });

describe('offline first slice evidence gate', () => {
  it('offers review only: consistent metadata and checksums cannot approve a real integration', () => {
    expect(evaluate(candidate())).toMatchObject({ state: 'ready_for_review', readyForReview: true, acceptance: 'requires_independent_review' });
  });
  it('keeps the current unexecuted run pending instead of reporting success', () => {
    const result = checkManifestFile(resolve('docs/integration/first-slice/20261017-01/manifest.json'));
    expect(result.readyForReview).toBe(false);
    expect(result.diagnostics).toContain('AUTHORIZATION_PENDING');
    expect(result.diagnostics).toContain('REAL_EXECUTION_PENDING');
  });
  it.each(Object.keys(scenarioRequirements))('requires actual evidence for scenario %s', id => {
    const m = candidate(); m.scenarios.find(s => s.id === id)!.state = 'pending';
    expect(evaluate(m).diagnostics).toContain(`SCENARIO_PENDING:${id}`);
  });
  it('rejects controlled evidence relabelled as a passed product scenario', () => {
    const m = candidate(); m.evidence.find(e => e.id === 'observation')!.kind = 'controlled';
    expect(evaluate(m).diagnostics).toContain('REAL_EVIDENCE_REQUIRED:registration-icr');
    expect(evaluate(m).diagnostics).toContain('LOCAL_TRANSPORT_EVIDENCE_REQUIRED');
  });
  it('requires authorization before execution and within its bounded period and effect scope', () => {
    const m = candidate(); m.authorization!.authorizedAtMs = 4;
    expect(evaluate(m).diagnostics).toContain('AUTHORIZATION_WINDOW_INVALID');
    m.authorization!.authorizedAtMs = 2; m.authorization!.effects.push('push');
    expect(evaluate(m).diagnostics).toContain('EFFECT_AUTHORIZATION_INVALID');
  });
  it.each(['source', 'authorization'])('refuses preflight evidence %s recorded after effects began', id => {
    const m = candidate(); m.evidence.find(e => e.id === id)!.capturedAtMs = 4;
    const result = evaluate(m);
    expect(result).toMatchObject({ state: 'invalid', readyForReview: false });
    expect(result.diagnostics).toContain(id === 'source' ? 'PRODUCT_SOURCE_AFTER_START' : 'AUTHORIZATION_EVIDENCE_AFTER_START');
    expect(evidenceExitCode(result)).toBe(1);
  });
  it.each([0, 6])('refuses attempt captures outside the proof even when scenario evidence is current (%i)', capturedAtMs => {
    const m = candidate(); m.evidence.find(e => e.id === 'capture-1')!.capturedAtMs = capturedAtMs;
    expect(evaluate(m)).toMatchObject({ state: 'invalid', diagnostics: ['ATTEMPT_CAPTURE_OUTSIDE_PROOF'] });
  });
  it('keeps an authorized proof awaiting execution pending rather than claiming an invalid execution window', () => {
    const m = candidate(); m.startedAtMs = null; m.endedAtMs = null;
    const result = evaluate(m);
    expect(result).toMatchObject({ state: 'pending', readyForReview: false });
    expect(result.diagnostics).toContain('REAL_EXECUTION_PENDING');
    expect(result.diagnostics).not.toContain('AUTHORIZATION_WINDOW_INVALID');
    expect(evidenceExitCode(result)).toBe(2);
  });
  it('rejects an end without a start and inherited object property names as scenarios', () => {
    const m = candidate(); m.startedAtMs = null; m.scenarios[0]!.id = 'toString';
    expect(evaluate(m)).toMatchObject({ state: 'invalid', readyForReview: false });
    expect(evaluate(m).diagnostics).toEqual(expect.arrayContaining(['PROOF_WINDOW_INVALID', 'UNKNOWN_SCENARIO']));
  });
  it('rejects missing versions, duplicate cases, dangling evidence and uncorrelated retry', () => {
    const m = candidate(); m.tools[0]!.version = null; m.scenarios[m.scenarios.length - 1] = m.scenarios[0]!;
    m.attempts[0]!.captureEvidenceId = 'absent'; m.scenarios.find(s => s.id === 'restart-retry')!.attemptIds = ['attempt-1'];
    const result = evaluate(m);
    expect(result.diagnostics).toEqual(expect.arrayContaining(['VERSIONS_PENDING', 'DUPLICATE_ID', 'ATTEMPT_CAPTURE_REQUIRED', 'DISTINCT_RETRY_ATTEMPTS_REQUIRED']));
  });
  it('rejects earlier evidence, missing prerequisite proof and failed cases', () => {
    const m = candidate(); m.evidence.find(e => e.id === 'observation')!.capturedAtMs = 0;
    m.prerequisites[0]!.evidenceIds = []; m.scenarios[0]!.state = 'failed'; m.scenarios[0]!.reason = 'Observed failure';
    expect(evaluate(m)).toMatchObject({ state: 'failed', readyForReview: false });
    expect(evaluate(m).diagnostics).toContain('PREREQUISITE_EVIDENCE_REQUIRED:sprint-017');
    expect(evaluate(m).diagnostics).toContain('EVIDENCE_OUTSIDE_PROOF:question');
  });
  it('validates schema without echoing rejected input or private read errors', () => {
    expect(evaluate({ ...candidate(), credential: 'private-test-marker' })).toMatchObject({ state: 'invalid', diagnostics: ['MANIFEST_INVALID'] });
    expect(JSON.stringify(evaluateEvidence(candidate(), () => { throw new Error('private-test-marker'); }))).not.toContain('private-test-marker');
  });
  it('detects changed evidence bytes even when the recorded size matches', () => {
    const changed = Buffer.from(bytes); changed[0] = 0;
    expect(evaluateEvidence(candidate(), () => changed).diagnostics).toContain('EVIDENCE_INTEGRITY_FAILED');
    expect(evidenceExitCode(evaluateEvidence(candidate(), () => changed))).toBe(1);
  });
  it('returns failure for unreadable attachments and failed observations, with pending reserved for missing proof', () => {
    expect(evidenceExitCode(evaluateEvidence(candidate(), () => { throw new Error('unreadable'); }))).toBe(1);
    const m = candidate(); m.scenarios[0]!.state = 'failed';
    expect(evidenceExitCode(evaluate(m))).toBe(1);
    expect(evidenceExitCode(evaluate(candidate()))).toBe(0);
    m.scenarios[0]!.state = 'pending'; m.scenarios[0]!.reason = 'Not executed';
    expect(evidenceExitCode(evaluate(m))).toBe(2);
  });
  it.each(['../outside.md', 'nested/../../outside.md', 'C:/outside.md', '/outside.md', '.git/config', 'nested\\outside.md', 'file.md:stream', 'file.md\n'])('refuses path %j before opening files', path => {
    expect(() => readEvidence('.', path, 1024)).toThrow('EVIDENCE_PATH_INVALID');
  });
  it('checks real bounded UTF-8 files without changing their content', () => {
    const cache = resolve('.cache'); mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(resolve(cache, 'acceptance-evidence-')); directories.push(dir);
    writeFileSync(resolve(dir, 'observation.md'), bytes);
    expect(readEvidence(dir, 'observation.md', 1024)).toEqual(bytes);
    expect(() => readEvidence(dir, 'observation.md', 1)).toThrow('EVIDENCE_SIZE_INVALID');
    const m = candidate(); m.evidence = m.evidence.map(e => ({ ...e, path: 'observation.md' }));
    expect(evaluate(m).diagnostics).toContain('DUPLICATE_EVIDENCE_PATH');
  });
});
