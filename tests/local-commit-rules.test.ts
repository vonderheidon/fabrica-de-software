import { expect, it } from 'vitest';
import { canAdaptLocalCommitIntegration, canFinishLocalCommit } from '#contracts';
import { isInvalidNtfsPath } from '../apps/controller/src/modules/workspaces/checkout-landing.js';

it('records unresolved repair refusals and base changes when an unknown local commit is reconciled', () => {
  for (const reason of ['PROJECT_FOLDER_REPAIR_REFUSED','DELIVERY_BASE_CHANGED','PROJECT_FOLDER_LANDING_UNVERIFIED']) {
    expect(canFinishLocalCommit('unknown','unknown',reason), reason).toBe(true);
  }
  expect(canFinishLocalCommit('unknown','unknown','DELIVERY_TARGET_UNAVAILABLE')).toBe(false);
});

it('keeps a running local commit running on transient reasons, closing it only on conclusive results', () => {
  expect(canFinishLocalCommit('running','unknown','DELIVERY_TARGET_UNAVAILABLE')).toBe(false);
  expect(canFinishLocalCommit('running','failed_known','DELIVERY_TARGET_UNAVAILABLE')).toBe(false);
  expect(canFinishLocalCommit('running','unknown',null)).toBe(false);
  expect(canFinishLocalCommit('running','confirmed',null)).toBe(true);
  expect(canFinishLocalCommit('running','not_applicable','APPROVED_NO_DELTA')).toBe(true);
  expect(canFinishLocalCommit('running','failed_known','COMMIT_NOT_OBSERVED')).toBe(true);
  expect(canFinishLocalCommit('running','unknown','PROJECT_FOLDER_LANDING_UNVERIFIED')).toBe(true);
  expect(canFinishLocalCommit('running','unknown','PROJECT_FOLDER_REPAIR_REFUSED')).toBe(true);
});

it('adapts the integration only when nothing was left in the Pasta do projeto', () => {
  expect(canAdaptLocalCommitIntegration(undefined)).toBe(true);
  expect(canAdaptLocalCommitIntegration({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' })).toBe(true);
  expect(canAdaptLocalCommitIntegration({ state:'failed_known',reason:'PROJECT_FOLDER_REPAIR_REFUSED' })).toBe(false);
  expect(canAdaptLocalCommitIntegration({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' })).toBe(false);
  expect(canAdaptLocalCommitIntegration({ state:'unknown',reason:'PROJECT_FOLDER_REPAIR_REFUSED' })).toBe(false);
});

it('rejects the reserved console device names with any extension, case-insensitively', () => {
  for (const name of ['CONIN$','conout$','CONIN$.txt','dir/ConOut$.log','con','COM1.txt']) expect(isInvalidNtfsPath(name), name).toBe(true);
  for (const name of ['conin','coninx$','conout$x','a/conin.txt','ok.txt']) expect(isInvalidNtfsPath(name), name).toBe(false);
});
