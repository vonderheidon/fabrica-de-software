import { expect, it } from 'vitest';
import { clearProjectDrafts, configurationDraftIdentity, getDraft, setDraft } from '../../app/drafts.js';

it('preserves aggregate global edits and independent profile/other project drafts after completion and late writes', () => {
  const project = configurationDraftIdentity('account', 'removed-aggregate');
  const global = configurationDraftIdentity('account', 'global-settings');
  const other = configurationDraftIdentity('account', 'other-project');
  const profile = configurationDraftIdentity('account', 'profile', 'editor', 'profile-id');
  setDraft(global, 'project-configuration', { dirty: ['global.projects_root'], values: { 'global.projects_root': 'existing root' } });
  setDraft(project, 'project-configuration', {
    dirty: ['global.automation_enabled', 'global.projects_root', 'project.base_branch'],
    values: { 'global.automation_enabled': true, 'global.projects_root': 'aggregate root', 'project.base_branch': 'private branch' },
    pendingCommand: { id: 'obsolete', signature: 'old request' },
  });
  setDraft(other, 'editor', 'other draft'); setDraft(profile, 'editor', 'profile draft');
  clearProjectDrafts('removed-aggregate');
  expect(getDraft(project, 'project-configuration')).toBeUndefined();
  expect(getDraft(global, 'project-configuration')).toEqual({
    dirty: ['global.automation_enabled', 'global.projects_root'],
    values: { 'global.automation_enabled': true, 'global.projects_root': 'existing root' },
  });
  expect(getDraft(other, 'editor')).toBe('other draft');
  expect(getDraft(profile, 'editor')).toBe('profile draft');
  setDraft(project, 'project-configuration', 'late response');
  expect(getDraft(project, 'project-configuration')).toBeUndefined();
});
