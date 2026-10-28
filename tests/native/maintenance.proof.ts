import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { ImplementerResult } from '#contracts';
import { publicationFixture } from '../fixtures/publication.js';

it('stores producer validation evidence with its result and sends that result to the independent reviewer', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const fixture = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache') });
  try {
    const checks: ImplementerResult['checks'] = [
      { id: 'npm.cmd run typecheck', outcome: 'passed in the controlled result fixture', evidence: 'No TypeScript diagnostics were returned.' },
      { id: 'npm.cmd test -- tests/integration/reviews.test.ts', outcome: 'not_run', evidence: 'The controlled passage did not execute a local test process.' },
    ];
    await fixture.implement(checks);
    const deliveryId = fixture.status().deliveryId!;
    const accepted = fixture.storage.getProducerResult(deliveryId)!;
    expect(accepted.result.checks).toEqual(checks);
    const reviewerRequest = vi.mocked(fixture.execution.startPassage).mock.calls[1]?.[0];
    expect(reviewerRequest).toBeDefined();
    const task = JSON.parse(reviewerRequest!.task) as { delivery: { id: string; contentIdentity: string }; producerResult: unknown };
    expect(task.delivery.id).toBe(deliveryId);
    expect(task.delivery.contentIdentity).toBe(fixture.storage.getDelivery(deliveryId).delivery.contentIdentity);
    expect(task.producerResult).toEqual(accepted);
    await fixture.approve();
    expect(fixture.storage.getReview(deliveryId)?.state).toBe('approved');
    expect(fixture.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
    console.log('AC28_NATIVE_REPORT ' + JSON.stringify({ formatVersion: 1, producerChecks: checks.length, reviewerReceivedProducerResult: true,
      manualVerificationSchema: 'retired', reviewer: 'controlled', provider: 'not_started' }));
  } finally { await fixture.close(); }
});
