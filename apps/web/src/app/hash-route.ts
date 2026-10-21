export const tabs = ['dashboard', 'projetos', 'perfis', 'fila', 'tentativas', 'registros', 'configuracao'] as const;
export type PrincipalTab = (typeof tabs)[number];

const tabLabels: Record<PrincipalTab, string> = {
  dashboard: 'Principal',
  projetos: 'Projetos',
  perfis: 'Perfis Globais',
  fila: 'Fila Ready',
  tentativas: 'Tentativas',
  registros: 'Registros',
  configuracao: 'Configuração',
};

export const dialogIds = [
  'register', 'create', 'creation-plan', 'partial', 'preparation', 'start-confirmation',
  'enable-queue', 'authority', 'detail', 'decision', 'stop', 'delivery', 'publication',
  'diagnostic', 'interaction', 'profile', 'initial-setup', 'project-configuration',
] as const;
export type DialogId = (typeof dialogIds)[number];

export type HashRoute = {
  tab: PrincipalTab;
  params: URLSearchParams;
  error: string | null;
};

const contextIds = ['projectId', 'issueId', 'attemptId', 'deliveryId', 'roundId', 'creationId', 'questionId', 'operationId'] as const;

export function routeIdentity(route: HashRoute): string {
  return JSON.stringify([route.tab, ...contextIds.map((key) => route.params.get(key) ?? ''), route.params.get('filter') ?? '']);
}

export function parseHash(hash: string): HashRoute {
  if (!hash || hash === '#' || hash === '#login' || hash === '#principal') {
    return { tab: 'dashboard', params: new URLSearchParams(), error: null };
  }

  const match = /^#principal\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return { tab: 'dashboard', params: new URLSearchParams(), error: 'A rota informada não é válida.' };

  const tabValue = match[1];
  if (!tabs.some((tab) => tab === tabValue)) {
    return { tab: 'dashboard', params: new URLSearchParams(), error: 'A seção solicitada não existe.' };
  }

  const params = new URLSearchParams(match[2] ?? '');
  const allowed = new Set<string>([...contextIds, 'dialog', 'search', 'filter', 'profileId']);
  for (const key of params.keys()) {
    if (!allowed.has(key)) return { tab: tabValue as PrincipalTab, params, error: 'O contexto da rota contém parâmetros inválidos.' };
  }
  for (const key of contextIds) {
    const value = params.get(key);
    if (value !== null && (value.length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value))) {
      return { tab: tabValue as PrincipalTab, params, error: `O identificador ${key} é inválido.` };
    }
  }
  const profileId = params.get('profileId');
  if (profileId !== null && (profileId.length === 0 || profileId.length > 256 || /[\u0000-\u001f]/.test(profileId))) {
    return { tab: tabValue as PrincipalTab, params, error: 'O identificador do perfil é inválido.' };
  }
  const roundId = params.get('roundId');
  if (roundId !== null && !/^[1-6]$/.test(roundId)) return { tab: tabValue as PrincipalTab, params, error: 'A rodada selecionada é inválida.' };
  const dialog = params.get('dialog');
  if (dialog !== null && !dialogIds.some((id) => id === dialog)) {
    return { tab: tabValue as PrincipalTab, params, error: 'O conteúdo solicitado não é válido.' };
  }
  if (tabValue === 'configuracao' && params.has('projectId') && !params.has('dialog')) {
    params.set('dialog', 'project-configuration');
    return { tab: 'projetos', params, error: null };
  }
  return { tab: tabValue as PrincipalTab, params, error: null };
}

export function labelForTab(tab: PrincipalTab): string {
  return tabLabels[tab];
}

export function buildHash(tab: PrincipalTab, params = new URLSearchParams()): string {
  const safe = new URLSearchParams();
  for (const key of [...contextIds, 'search', 'filter', 'profileId', 'dialog']) {
    const value = params.get(key);
    if (value !== null) safe.set(key, value);
  }
  const query = safe.toString();
  return `#principal/${tab}${query ? `?${query}` : ''}`;
}
