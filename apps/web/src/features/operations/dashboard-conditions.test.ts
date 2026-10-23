import { expect, it } from 'vitest';
import { dashboardConditions, conditionDestination } from './dashboard-conditions.js';

it('combines equivalent sources while preserving independent causes, objects and previous observations', () => {
  const condition = { code: 'ACCOUNT_UNOBSERVED', cause: 'Conta necessária', recovery: 'Configurar', previous: false };
  const items = dashboardConditions([condition, { ...condition, code: 'ONBOARDING_ACCOUNT_RELINK_REQUIRED' },
    { ...condition, code: 'ACCOUNT_MISMATCH' }, { ...condition, facts: { project_id: 'project-a' } },
    { ...condition, facts: { project_id: 'project-b' } }, { ...condition, previous: true }]);
  expect(items).toHaveLength(5);
  expect(conditionDestination(items[0]!).href).toBe('#principal/configuracao');
  expect(conditionDestination(items[2]!).href).toContain('projectId=project-a');
  expect(conditionDestination({ ...condition, facts: { attempt_id: 'attempt-a', project_id: 'project-a' } }).href).toContain('attemptId=attempt-a');
  expect(conditionDestination({ ...condition, code: 'IMPLEMENTER_PROFILE_REQUIRED' }).href).toBe('#principal/perfis');
});

it('summarizes missing roles together only when all profiles are missing in the same context', () => {
  const item = { cause: 'Perfil ausente', recovery: 'Perfis', previous: false };
  expect(dashboardConditions(['PROFILES_REQUIRED', 'IMPLEMENTER_PROFILE_REQUIRED', 'ONBOARDING_REVIEWER_PROFILE_REQUIRED'].map(code => ({ ...item, code })))).toHaveLength(1);
  expect(dashboardConditions(['IMPLEMENTER_PROFILE_REQUIRED', 'REVIEWER_PROFILE_REQUIRED'].map(code => ({ ...item, code })))).toHaveLength(2);
});
