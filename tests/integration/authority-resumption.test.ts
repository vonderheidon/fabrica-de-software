import { expect, it, vi } from 'vitest';
import { publicationFixture } from '../fixtures/publication.js';

for (const point of ['review-stage', 'review-launch'] as const) for (const invalidations of [1, 2]) {
  it(`resumes ${point} after ${invalidations} stale observations without duplicate work`, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const f = await publicationFixture();
    try {
      let rejected = 0;
      const record = f.storage.recordAuthority.bind(f.storage);
      vi.spyOn(f.storage, 'recordAuthority').mockImplementation((id, stamp, observation) => {
        const atPoint = (point === 'review-stage' && f.status().phase === 'reviewing' && vi.mocked(f.workspaces.materializeReview).mock.calls.length === 0)
          || (point === 'review-launch' && vi.mocked(f.workspaces.materializeReview).mock.calls.length > 0);
        if (rejected < invalidations && atPoint) {
          rejected++;
          f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(id);
        }
        return record(id, stamp, observation);
      });
      await f.implement();
      expect(rejected).toBe(invalidations);
      expect(f.status().suspension).toBeNull();
      expect(f.execution.startPassage).toHaveBeenCalledTimes(invalidations === 1 ? 2 : 1);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16000);
      await f.pipeline.tick(); await f.pipeline.drain();
      expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(Date.now() + 16000);
      await f.pipeline.tick(); await f.pipeline.drain();
      expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
      expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
      expect(f.workspaces.materializeReview).toHaveBeenCalledTimes(1);
      expect(f.storage.getEffects(f.attemptId).filter(effect => effect.kind === 'project_status' && effect.state === 'confirmed')).toHaveLength(2);
      expect(f.logFailure).not.toHaveBeenCalledWith('AUTHORITY_OBSERVATION_STALE');
    } finally { await f.close(); vi.restoreAllMocks(); vi.useRealTimers(); }
  });
}

it.each(['correction', 'correction-stage'] as const)('resumes %s without a second round or replacement passage', async point => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const f = await publicationFixture();
  try {
    await f.implement();
    let rejected = 0;
    const record = f.storage.recordAuthority.bind(f.storage);
    vi.spyOn(f.storage, 'recordAuthority').mockImplementation((id, stamp, observation) => {
      if (rejected < 2 && (point === 'correction' || f.status().phase === 'implementing')) {
        rejected++;
        f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(id);
      }
      return record(id, stamp, observation);
    });
    await f.approve(false);
    expect(rejected).toBe(2);
    expect(f.execution.continuePassage).not.toHaveBeenCalled();
    expect(f.status().suspension).toBeNull();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16000);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.execution.continuePassage).toHaveBeenCalledTimes(1);
    expect(f.persistence.getPassage({ passageId: f.status().passageId }).binding.round).toBe(2);
    clock.mockReturnValue(Date.now() + 16000);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.execution.continuePassage).toHaveBeenCalledTimes(1);
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
    expect(f.logFailure).not.toHaveBeenCalledWith('AUTHORITY_OBSERVATION_STALE');
  } finally { await f.close(); vi.restoreAllMocks(); vi.useRealTimers(); }
});

it.each(['cancel', 'close', 'assignee', 'status', 'partial'] as const)('does not resume stale work after %s revokes authority', async change => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const f = await publicationFixture();
  try {
    let rejected = 0;
    const record = f.storage.recordAuthority.bind(f.storage);
    vi.spyOn(f.storage, 'recordAuthority').mockImplementation((id, stamp, observation) => {
      if (rejected++ < 2) f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(id);
      return record(id, stamp, observation);
    });
    await f.implement();
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    const effects = f.mutateEffect.mock.calls.length;
    if (change === 'cancel') await f.pipeline.cancelAttempt(f.attemptId, {}, f.context());
    if (change === 'close') await f.pipeline.close();
    if (change === 'assignee') f.issue.assignees = [];
    if (change === 'status') f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
    if (change === 'partial') f.issueReader.mockResolvedValue({ state: 'partial', data: f.issue, diagnostics: [], retryAtMs: null });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16000);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    expect(f.mutateEffect).toHaveBeenCalledTimes(effects);
    if (change === 'cancel' || change === 'assignee') expect(f.status().result).toBe('cancelled');
    if (change === 'status') expect(f.status().suspension).toBe('KANBAN_DIVERGENCE');
    if (change === 'partial') expect(f.status().suspension).toBe('AUTHORITY_UNAVAILABLE');
  } finally { await f.close(); vi.restoreAllMocks(); vi.useRealTimers(); }
});
