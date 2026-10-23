import { OperatorState } from '../../app/OperatorSupport.js';
import { CurrentDiagnosticNotices, DiagnosticHistory } from '../records/DiagnosticNotices.js';
import { useDiagnostics } from '../records/useDiagnostics.js';

export function CreationConditions({ creationId }: { creationId: string }) {
  const diagnostic = useDiagnostics({ scope: 'creation', id: creationId });
  const checks = [
    ['resources', 'Verificar recursos'], ['configuration', 'Verificar configuração da criação'],
    ['github_identity', 'Verificar identidade GitHub'],
  ] as const;
  const busy = Boolean(diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state));
  return <section aria-label="Condições da criação">
    <h4>Condições e recursos registrados</h4>
    <p className="muted">A consulta não executa etapas nem confirma prontidão para iniciar uma issue. Corrija condições globais na <a href="#principal/configuracao">Configuração</a>.</p>
    <CurrentDiagnosticNotices items={diagnostic.view?.diagnostics ?? []} previous={diagnostic.stale || diagnostic.refreshing} projectId={null} />
    <DiagnosticHistory reports={diagnostic.view?.reports ?? []} />
    <div className="row">{checks.filter(([check]) => diagnostic.supportedChecks.includes(check)).map(([check, label]) => <button key={check} type="button" disabled={busy || diagnostic.loading || diagnostic.refreshing || diagnostic.stale} onClick={() => void diagnostic.verify([check])}>{label}</button>)}
      <button type="button" onClick={diagnostic.refresh}>Atualizar leitura das condições</button>
      {diagnostic.verification && <button type="button" onClick={diagnostic.retryReceipt}>Consultar resultado original</button>}
    </div>
    {(diagnostic.loading || diagnostic.refreshing) && <p role="status">Consultando condições registradas…</p>}
    {diagnostic.error && <p role="alert">{diagnostic.error}</p>}
    {diagnostic.verification && <div role="status"><b>{diagnostic.previous ? 'Resultado anterior' : 'Operação original'}</b> · <OperatorState value={diagnostic.verification.state} />
      {diagnostic.verification.error && <p>{diagnostic.verification.error}</p>}
      {diagnostic.verification.queryError && <p>{diagnostic.verification.queryError}</p>}
      {diagnostic.verification.operationError && <p>{diagnostic.verification.operationError.message}</p>}
    </div>}
  </section>;
}
