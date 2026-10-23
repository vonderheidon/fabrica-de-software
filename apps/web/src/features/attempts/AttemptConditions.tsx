import type { HttpAttemptDetail } from '#contracts';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { CurrentDiagnosticNotices, DiagnosticHistory } from '../records/DiagnosticNotices.js';
import { useDiagnostics } from '../records/useDiagnostics.js';

export function AttemptConditions({ attempt, resources = false }: { attempt: HttpAttemptDetail; resources?: boolean }) {
  const diagnostic = useDiagnostics(resources ? { scope: 'attempt', id: attempt.id } : null);
  if (!resources) return <>
    {attempt.authority?.reason && <OperatorDiagnosticCard code={attempt.authority.reason} state="blocked" cause={attempt.authority.reason} recovery={attempt.authority.recovery} />}
    {attempt.diagnostic && attempt.diagnostic !== attempt.authority?.reason && <OperatorDiagnosticCard code={attempt.diagnostic} state="blocked" cause={attempt.diagnostic} recovery="Atualize a tentativa e consulte os registros antes de uma nova ação." />}
  </>;
  const items = (diagnostic.view?.diagnostics ?? []).filter((item) => item.check === 'resources');
  const busy = Boolean(diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state));
  return <div>
    <p className="muted">A leitura dos recursos registrados não comprova parada física, acesso ao conteúdo nem capacidade de abertura. Condições globais são corrigidas na <a href="#principal/configuracao">Configuração</a>.</p>
    <CurrentDiagnosticNotices items={items} previous={diagnostic.stale || diagnostic.refreshing} projectId={attempt.project_id} />
    <DiagnosticHistory reports={(diagnostic.view?.reports ?? []).map((report) => ({ ...report, diagnostics: report.diagnostics.filter((item) => item.check === 'resources') }))} />
    <div className="row">
      <button type="button" disabled={busy || diagnostic.loading || diagnostic.refreshing || diagnostic.stale || !diagnostic.supportedChecks.includes('resources')} onClick={() => void diagnostic.verify(['resources'])}>Verificar recursos</button>
      <button type="button" onClick={diagnostic.refresh}>Atualizar leitura dos recursos</button>
      {diagnostic.verification && <button type="button" onClick={diagnostic.retryReceipt}>Consultar resultado original</button>}
    </div>
    {(diagnostic.loading || diagnostic.refreshing) && <p role="status">Consultando condições registradas dos recursos…</p>}
    {diagnostic.error && <p role="alert">{diagnostic.error}</p>}
    {diagnostic.verification && <div role="status">{diagnostic.previous ? 'Operação anterior' : 'Operação original'} · <OperatorState value={diagnostic.verification.state} />
      {diagnostic.verification.error && <p>{diagnostic.verification.error}</p>}
      {diagnostic.verification.queryError && <p>{diagnostic.verification.queryError}</p>}
    </div>}
  </div>;
}
