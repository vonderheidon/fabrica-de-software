import type { HttpContextDiagnostic } from '#contracts';

type Condition = { code: string; cause: string; recovery: string; facts?: HttpContextDiagnostic['facts']; previous: boolean };

function family(code: string): string {
  const value = code.replace(/^ONBOARDING_/, '');
  if (['ACCOUNT_UNOBSERVED', 'ACCOUNT_REQUIRED', 'ACCOUNT_NOT_CONFIGURED', 'ACCOUNT_RELINK_REQUIRED'].includes(value)) return 'account-required';
  if (['PROJECTS_ROOT_CONFIRMATION_REQUIRED', 'PROJECTS_ROOT_NOT_CONFIRMED'].includes(value)) return 'folder-confirmation';
  return value;
}

export function dashboardConditions(items: readonly Condition[]): Condition[] {
  const unique = new Map<string, Condition>();
  for (const item of items) {
    const canonical = family(item.code);
    const key = JSON.stringify([family(item.code), item.facts?.attempt_id, item.facts?.project_id,
      item.facts?.expected_account_id, item.facts?.observed_account_id, item.previous,
      ['account-required', 'folder-confirmation', 'PROJECTS_ROOT_REQUIRED', 'PROFILES_REQUIRED', 'IMPLEMENTER_PROFILE_REQUIRED', 'REVIEWER_PROFILE_REQUIRED'].includes(canonical) ? null : [item.cause, item.recovery]]);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].filter(item => !/^(ONBOARDING_)?(IMPLEMENTER|REVIEWER)_PROFILE_REQUIRED$/.test(item.code) ||
    ![...unique.values()].some(other => other.code === 'PROFILES_REQUIRED' && other.previous === item.previous &&
      other.facts?.project_id === item.facts?.project_id && other.facts?.attempt_id === item.facts?.attempt_id));
}

export function conditionDestination(item: Condition): { href: string; label: string } {
  if (item.facts?.attempt_id) return { href: `#principal/tentativas?dialog=detail&attemptId=${encodeURIComponent(item.facts.attempt_id)}`, label: 'Abrir tentativa' };
  if (item.facts?.project_id) return { href: `#principal/projetos?dialog=project-configuration&projectId=${encodeURIComponent(item.facts.project_id)}`, label: 'Abrir projeto' };
  if (item.code.startsWith('PROJECT_')) return { href: '#principal/fila', label: 'Ver projetos na fila' };
  return item.code.includes('PROFILE') ? { href: '#principal/perfis', label: 'Abrir Perfis' } : { href: '#principal/configuracao', label: 'Abrir Configuração' };
}
