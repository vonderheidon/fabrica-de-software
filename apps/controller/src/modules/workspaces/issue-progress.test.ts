import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderIssueProgress, writeIssueProgressFile, type IssueProgressDocument } from './issue-progress.js';

const directory = async () => mkdtemp(join(tmpdir(), 'factory-issue-progress-'));
const document = (): IssueProgressDocument => ({
  identity: { projectId: 'project-1', repositoryId: 'repo-1', issueId: 'issue-24' },
  issueNumber: 24, issueTitle: 'Keep retry work', updatedAtMs: Date.UTC(2026, 9, 30, 12), milestone: 'workspace_ready',
  attempt: { id: 'attempt-current', passageId: 'passage-current', predecessorAttemptId: 'attempt-previous',
    round: 1, phase: 'implementing', result: null, suspension: null },
  workspace: { initialState: 'inherited_attempt', sourceAttemptId: 'attempt-previous',
    initialContentIdentity: 'a'.repeat(40), comparisonBaseSha: 'a'.repeat(40) },
  rounds: [{ round: 1, deliveryId: 'delivery-1', producerPassageId: 'passage-current',
    producerReceiptId: 'receipt-1', reviewId: 'review-1', reviewState: 'approved', reviewIndependence: 'valid',
    contentIdentity: 'b'.repeat(40), commitSha: 'c'.repeat(40), checkCount: 3,
    criteria: { passed: 2, failed: 0, notVerified: 1 }, blockingFindings: 0 }],
  blockingFindings: 0,
  predecessor: { attemptId: 'attempt-previous', predecessorAttemptId: null, result: 'interrupted',
    phase: 'implementing', suspension: null, deliveryId: 'delivery-old', contentIdentity: 'd'.repeat(40),
    reviewState: null, blockingFindings: 1 },
  decisions: [{ id: 'decision-1', operationId: 'operation-1', action: 'guidance', createdAtMs: Date.UTC(2026, 9, 30, 12) }],
});

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('issue progress file', () => {
  it('summarizes implementation, validation, review and predecessor evidence without copying conversation text', () => {
    const rendered = renderIssueProgress(document());
    expect(rendered).toContain('Objetivo:** Keep retry work');
    expect(rendered).toContain('checks reportados: 3');
    expect(rendered).toContain('review-1');
    expect(rendered).toContain('delivery-old');
    expect(rendered).toContain('Confirme este resumo contra os arquivos');
    expect(rendered).not.toContain('guidance text');
    expect(rendered).not.toContain('summary');
  });

  it('redacts credential-like titles and replaces the owned file atomically without accumulating logs', async () => {
    const root = await directory(); directories.push(root);
    const path = join(root, 'progress.md');
    const first = document();
    first.issueTitle = 'Fix retry token=ghp_abcdefghijklmnopqrstuvwxyz123456';
    await writeIssueProgressFile(path, first);
    const initial = await readFile(path, 'utf8');
    expect(initial).toContain('redigido');
    expect(initial).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');

    const next = { ...first, updatedAtMs: first.updatedAtMs + 1000, milestone: 'delivery_captured' as const };
    await writeIssueProgressFile(path, next);
    const updated = await readFile(path, 'utf8');
    expect(updated).toContain('Versão de trabalho capturada');
    expect(updated).not.toContain('Workspace da issue preparado');
    expect((await readdir(root)).sort()).toEqual(['progress.md']);
  });

  it('preserves unowned or differently identified progress files', async () => {
    const root = await directory(); directories.push(root);
    const path = join(root, 'progress.md');
    await writeFile(path, 'operator notes\\n', 'utf8');
    await expect(writeIssueProgressFile(path, document())).rejects.toMatchObject({ code: 'ISSUE_PROGRESS_FILE_UNOWNED' });
    expect(await readFile(path, 'utf8')).toBe('operator notes\\n');

    const owned = join(root, 'owned');
    await mkdir(owned);
    const ownedPath = join(owned, 'progress.md');
    await writeIssueProgressFile(ownedPath, document());
    const other = document();
    other.identity = { ...other.identity, issueId: 'issue-other' };
    await expect(writeIssueProgressFile(ownedPath, other)).rejects.toMatchObject({ code: 'ISSUE_PROGRESS_IDENTITY_MISMATCH' });
    expect(await readFile(ownedPath, 'utf8')).toContain('issue-24');
  });
});
