// PROTÓTIPO DESCARTÁVEL — estado fictício compartilhado pelas variantes.
export type Mode = 'icr' | 'commit' | 'pr';
export type BranchOption = 'checkout' | 'new';
export type PrepWarning = 'none' | 'name_taken_typed' | 'name_taken_suggested' | 'detached' | 'invalid_folder' | 'dirty';
export type CleanupState = 'not_requested' | 'done' | 'pending' | 'waiting';

export interface Scenario {
  mode: Mode;
  projectBranchDefault: BranchOption;
  projectCleanupDefault: boolean;
  warning: PrepWarning;
  cleanup: CleanupState;
}

export const defaultScenario: Scenario = { mode: 'commit', projectBranchDefault: 'new', projectCleanupDefault: false, warning: 'none', cleanup: 'pending' };

export const fixture = {
  project: 'loja-web',
  folder: 'C:\\Users\\operador\\Projetos\\loja-web',
  repo: 'acme/loja-web',
  base: 'main',
  checkedOut: 'feat/login',
  issue: { number: 48, title: 'Entrega na Pasta do projeto' },
  suggested: 'feat/48-entrega-na-pasta-do-projeto',
  suggestedFree: 'feat/48-entrega-na-pasta-do-projeto-2',
  commit: '9f3c2a17b4e1',
  approvedRef: 'refs/factory/issues/48/approved/r2',
  cleanupReason: 'Arquivo em uso: node_modules\\.vite\\deps\\chunk-ABC.js (WORKSPACE_FILE_LOCKED)',
};

export const modeLabel: Record<Mode, string> = { icr: 'ICR', commit: 'Commit', pr: 'PR' };

export function finalBranch(s: Scenario, option: BranchOption, typed: string): string {
  if (s.mode === 'pr' || option === 'new') return s.warning === 'name_taken_suggested' ? fixture.suggestedFree : typed;
  return fixture.checkedOut;
}

const warningLabel: Record<PrepWarning, string> = {
  none: 'Nenhum', name_taken_typed: 'Nome digitado já existe', name_taken_suggested: 'Nome sugerido já existe (sufixo)',
  detached: 'Pasta em detached HEAD', invalid_folder: 'Pasta do projeto inválida', dirty: 'Pasta suja no commit',
};

export function ScenarioBar({ value, onChange }: { value: Scenario; onChange: (s: Scenario) => void }) {
  const set = <K extends keyof Scenario>(key: K, v: Scenario[K]) => onChange({ ...value, [key]: v });
  return <section className="proto-scenario" aria-label="Cenário do protótipo">
    <b>Cenário</b>
    <label>Modo <select value={value.mode} onChange={e => set('mode', e.currentTarget.value as Mode)}><option value="icr">ICR</option><option value="commit">Commit</option><option value="pr">PR</option></select></label>
    <label>Padrão de branch do projeto <select value={value.projectBranchDefault} onChange={e => set('projectBranchDefault', e.currentTarget.value as BranchOption)}><option value="new">Branch nova</option><option value="checkout">Branch em checkout</option></select></label>
    <label>Limpeza padrão <select value={String(value.projectCleanupDefault)} onChange={e => set('projectCleanupDefault', e.currentTarget.value === 'true')}><option value="false">Desligada</option><option value="true">Ligada</option></select></label>
    <label>Aviso <select value={value.warning} onChange={e => set('warning', e.currentTarget.value as PrepWarning)}>{Object.entries(warningLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label>Limpeza (detalhe) <select value={value.cleanup} onChange={e => set('cleanup', e.currentTarget.value as CleanupState)}><option value="not_requested">Não solicitada</option><option value="waiting">Aguardando entrega</option><option value="done">Concluída</option><option value="pending">Pendente (falhou)</option></select></label>
  </section>;
}

/** Avisos do Preparar, iguais nas três variantes (o conteúdo é decidido; o que muda é onde aparecem). */
export function prepBlockers(s: Scenario, option: BranchOption, typed: string): { title: string; text: string; blocks: boolean }[] {
  const out: { title: string; text: string; blocks: boolean }[] = [];
  if (s.warning === 'invalid_folder') out.push({ title: 'Pasta do projeto inválida', text: `${fixture.folder} não é um clone de ${fixture.repo}. Corrija em Configurar projeto.`, blocks: true });
  if (s.warning === 'detached' && s.mode !== 'icr') out.push({ title: 'Pasta do projeto em detached HEAD', text: 'Faça checkout de uma branch na Pasta do projeto antes de iniciar.', blocks: true });
  const usesNew = s.mode === 'pr' || option === 'new';
  if (s.mode !== 'icr' && usesNew && s.warning === 'name_taken_typed') out.push({ title: `A branch ${typed} já existe`, text: 'A branch nova nunca escreve numa branch existente. Escolha outro nome ou use Branch em checkout.', blocks: true });
  if (s.mode !== 'icr' && usesNew && s.warning === 'name_taken_suggested') out.push({ title: 'Nome sugerido já em uso', text: `A entrega usará ${fixture.suggestedFree}.`, blocks: false });
  return out;
}
