import type { HttpContextDiagnostic, HttpDiagnosticCheck } from '#contracts';
import { useDiagnostics } from '../records/useDiagnostics.js';
import { CurrentDiagnosticNotices } from '../records/DiagnosticNotices.js';
import { OperatorState } from '../../app/OperatorSupport.js';
import { operatorErrorMessage } from '../../app/operator-language.js';

export type GlobalDiagnostics = ReturnType<typeof useDiagnostics>;
export function useGlobalDiagnostics(enabled: boolean): GlobalDiagnostics {
  return useDiagnostics(enabled ? { scope: 'host' } : null);
}

export function globalConditionSection(item: HttpContextDiagnostic): 'github' | 'folder' | 'profiles' | 'integration' | 'configuration' {
  if (item.check === 'github_identity' || item.code.includes('ACCOUNT')) return 'github';
  if (item.check === 'maestri_context') return 'integration';
  if (item.code.includes('PROJECTS_ROOT')) return 'folder';
  if (item.code.includes('PROFILE')) return 'profiles';
  return 'configuration';
}

export function GlobalConditions({ diagnostic, section }: { diagnostic: GlobalDiagnostics; section: ReturnType<typeof globalConditionSection> }) {
  const select = (items: readonly HttpContextDiagnostic[]) => {
    const relevant = items.filter((item) => globalConditionSection(item) === section);
    return section === 'profiles' && relevant.some((item) => item.code === 'PROFILES_REQUIRED')
      ? relevant.filter((item) => !/^(ONBOARDING_)?(IMPLEMENTER|REVIEWER)_PROFILE_REQUIRED$/.test(item.code)) : relevant;
  };
  return <div className="global-readiness-conditions">
    {select(diagnostic.view?.diagnostics ?? []).some((item) => item.code === 'PROFILES_REQUIRED') && <div className="notice" role="status"><b>Nenhum perfil de execução cadastrado</b><p>{diagnostic.stale || diagnostic.refreshing ? 'A leitura anterior não encontrava perfis.' : 'Cadastre um perfil Implementador e um perfil Revisor em Perfis para preparar novas execuções.'}</p></div>}
    <CurrentDiagnosticNotices items={select(diagnostic.view?.diagnostics ?? []).filter((item) => item.code !== 'PROFILES_REQUIRED')} previous={diagnostic.stale || diagnostic.refreshing} projectId={null} />
  </div>;
}

export function GlobalVerification({ diagnostic, check, label, refreshLabel }: { diagnostic: GlobalDiagnostics; check: Extract<HttpDiagnosticCheck, 'configuration' | 'maestri_context'>; label?: string; refreshLabel?: string }) {
  const busy = Boolean(diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state));
  const integration = check === 'maestri_context';
  const operation = diagnostic.verification?.checks?.includes(check) ? diagnostic.verification : null;
  return <div className="global-verification" aria-busy={diagnostic.loading || diagnostic.refreshing}>
    <p className="muted">{integration ? 'Observação pontual do contexto nativo Maestri/OMP. Não comprova execução de provider nem disponibilidade de MCP.' : label ? 'Verifica o projeto salvo. Não valida o rascunho nem confirma salvamento.' : 'Verifica pasta e perfis salvos. Não valida o rascunho.'}</p>
    <div className="row">
      <button type="button" onClick={() => void diagnostic.verify([check])} disabled={busy || diagnostic.loading || diagnostic.refreshing || diagnostic.stale || !diagnostic.supportedChecks.includes(check)}>{label ?? (integration ? 'Verificar integração' : 'Verificar pasta e perfis')}</button>
      <button type="button" onClick={diagnostic.refresh} aria-label={refreshLabel ?? (integration ? 'Atualizar leitura da integração' : 'Atualizar leitura de pasta e perfis')}>Atualizar leitura</button>
      {operation && (operation.state === 'unavailable' || operation.state === 'unknown' || operation.queryError) && <button type="button" onClick={diagnostic.retryReceipt} disabled={operation.querying}>Consultar resultado</button>}
    </div>
    {(diagnostic.loading || diagnostic.stale && !diagnostic.refreshing && !diagnostic.error) && <p role="status">Observações anteriores não confirmam a configuração atual. Atualize a leitura.</p>}
    {diagnostic.error && <p role="alert">{diagnostic.error}</p>}
    {operation && (!diagnostic.previous || operation.error || operation.queryError || operation.operationError) && <div role="status"><b>{diagnostic.previous ? 'Resultado anterior' : 'Operação original'}</b> · <OperatorState value={operation.state} />
      {operation.error && <p>{operation.errorCode ? operatorErrorMessage(operation.errorCode, operation.error) : operation.error}</p>}
      {operation.queryError && <p>{operation.queryError}</p>}
      {operation.operationError && <p>{operatorErrorMessage(operation.operationError.code, operation.operationError.message)}</p>}
    </div>}
  </div>;
}
