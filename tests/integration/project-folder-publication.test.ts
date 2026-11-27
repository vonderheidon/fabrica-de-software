import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthorizeUpgrade, EffectView } from '#contracts';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { toHttpAttemptDetail } from '../../apps/controller/src/http/execution-views.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { readCapturedConfiguration, readPreparationChoices } from '../../apps/controller/src/modules/storage/historical-configuration.js';
const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(mode: 'icr' | 'commit' | 'pr') { const f = await publicationFixture(true, mode, true); fixtures.push(f); return f; }
const folderOf = (f: PublicationFixture) => f.storage.getConfiguration(f.projectId).view.configuration.source.location;
const effect = (f: PublicationFixture, kind: EffectView['kind']) => f.storage.getEffects(f.attemptId).find(e => e.kind === kind)!;
const upgrade = (f: PublicationFixture, targetMode: 'commit' | 'pr'): AuthorizeUpgrade => {
  const summary = f.storage.getPublicationSummary(f.attemptId);
  return { deliveryId: f.status().deliveryId!, currentMode: summary.mode, targetMode, authorized: true,
    authorizedAdditionalEffectsHash: summary.upgrades!.find(u => u.targetMode === targetMode)!.summaryHash };
};

describe('publication destination is always the Pasta do projeto', () => {
  it.each(['commit', 'pr'] as const)('publishes %s into the project folder without any per-attempt choice', async mode => {
    const f = await fixture(mode); await f.implement(); await f.approve();
    const folder = folderOf(f);
    expect(f.status()).toMatchObject({ result: 'delivered' });
    expect(f.workspaces.inspectDeliveryTarget).toHaveBeenCalledOnce();
    expect(f.workspaces.inspectDeliveryTarget.mock.calls[0]![0]).toBe(folder);
    expect(f.storage.findDeliveryTarget(f.attemptId, f.status().deliveryId!)).toMatchObject({ local_path: folder, selection_operation_id: null });
    expect(effect(f, 'local_commit').state).toBe('confirmed');
    if (mode === 'pr') { expect(effect(f, 'push').state).toBe('confirmed'); expect(effect(f, 'pull_request').state).toBe('confirmed'); }
    expect(f.db.prepare('SELECT count(*) AS n FROM publication_target_selections').get()).toEqual({ n: 0 });
  });

  it('offers PR to a local-origin project with a GitHub repository and publishes it into the project folder', async () => {
    const f = await fixture('icr'); await f.implement(); await f.approve();
    const configured = f.storage.getAttemptCapture(f.attemptId).configuration.configuration.source;
    expect(configured).toMatchObject({ kind: 'local', repository_id: f.issue.repository.id });
    expect(f.storage.getPublicationSummary(f.attemptId).upgrades!.find(u => u.targetMode === 'pr')).toMatchObject({ capability: { available: true } });
    await f.pipeline.authorizePublicationUpgrade(f.attemptId, upgrade(f, 'pr'), f.context()); await f.pipeline.drain();
    expect(f.workspaces.inspectDeliveryTarget.mock.calls[0]![0]).toBe(folderOf(f));
    expect(effect(f, 'pull_request').state).toBe('confirmed');
  });

  it('blocks Commit local and Pull request of a legacy GitHub-sourced project until it has a Pasta do projeto', async () => {
    const f = await publicationFixture(true, 'icr', true, { sourceKind: 'github' }); fixtures.push(f); await f.implement(); await f.approve();
    const upgrades = f.storage.getPublicationSummary(f.attemptId).upgrades!;
    expect(upgrades.map(upgraded => upgraded.targetMode)).toEqual(['commit', 'pr']);
    for (const upgraded of upgrades) {
      expect(upgraded.capability).toMatchObject({ available: false, reason_code: 'PROJECT_FOLDER_MISSING' });
    }
    expect(f.workspaces.inspectDeliveryTarget).not.toHaveBeenCalled();
  });

  it('refuses the removed publication_target choice when preparing an attempt', async () => {
    const f = await fixture('icr');
    const choice = { format_version: 1, repository_id: f.issue.repository.id, selection: { kind: 'existing_clone', path: folderOf(f) } };
    await expect(f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'commit', guidance: '', overrides: {},
      publication_target: choice } as never, { operationId: randomUUID(), expectedRevision: undefined })).rejects.toMatchObject({ code: 'PREPARATION_INVALID' });
  });

  it('no longer exposes a destination on the attempt detail, nor a route to choose one', async () => {
    const f = await fixture('commit'); await f.implement(); await f.approve();
    const detail = toHttpAttemptDetail(f.storage.getAttemptDetail(f.attemptId, {}));
    expect(detail).not.toHaveProperty('publication_target');
    expect(detail).not.toHaveProperty('publication_target_hash');
    expect(detail.history_sections ?? []).not.toContain('target_selections');
    const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
    const app = createApp(config, f.storage, undefined, undefined, undefined, f.pipeline);
    try {
      const host = new URL(config.browserOrigin).host; const origin = config.browserOrigin;
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
      const headers = { host, origin, cookie: session.headers['set-cookie']!.toString().split(';')[0]!, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token,
        'idempotency-key': randomUUID(), 'if-match': `"${f.attemptId}:${f.status().revision}"` };
      const response = await app.inject({ method: 'POST', url: `/api/v1/attempts/${f.attemptId}/publication/target`, headers,
        payload: { delivery_id: f.status().deliveryId!, repository_id: f.issue.repository.id, selection: { kind: 'existing_clone', path: folderOf(f) }, authorized: true } });
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('still reads an attempt capture and preparation recorded with the removed destination intent', async () => {
    const f = await fixture('icr');
    const capture = JSON.parse((f.db.prepare('SELECT capture_json FROM attempts WHERE id=?').get(f.attemptId) as { capture_json: string }).capture_json) as Record<string, unknown>;
    const legacy = { format_version: 1, publication_target: null, publication_target_hash: null, authorization_operation_id: randomUUID() };
    expect(readCapturedConfiguration({ ...capture, v3_delivery: legacy })).not.toHaveProperty('v3Delivery');
    const preparationId = f.storage.getAttemptCapture(f.attemptId).preparationId;
    const choices = JSON.parse((f.db.prepare('SELECT choices_json FROM preparation_revisions WHERE preparation_id=?').get(preparationId) as { choices_json: string }).choices_json) as { choices: object };
    const stored = { ...choices, choices: { ...choices.choices, publication_target: { format_version: 1, repository_id: f.issue.repository.id, selection: { kind: 'clone', destination: folderOf(f) } } } };
    expect(readPreparationChoices(stored)).not.toHaveProperty('publication_target');
  });
});
