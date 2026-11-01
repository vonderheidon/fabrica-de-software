import type { HttpAttemptDetail } from '#contracts';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { CurrentDiagnosticNotices } from '../records/DiagnosticNotices.js';
import { useDiagnostics } from '../records/useDiagnostics.js';

export function AttemptConditions({ attempt, resources = false }: { attempt: HttpAttemptDetail; resources?: boolean }) {
  const diagnostic = useDiagnostics(resources ? { scope: 'attempt', id: attempt.id } : null);
  if (!resources) return <>
    {attempt.authority?.reason && <OperatorDiagnosticCard code={attempt.authority.reason} state="blocked" cause={attempt.authority.reason} recovery={attempt.authority.recovery} />}
    {attempt.diagnostic && attempt.diagnostic !== attempt.authority?.reason && <OperatorDiagnosticCard code={attempt.diagnostic} state="blocked" cause={attempt.diagnostic} recovery="Atualize a tentativa e consulte os registros antes de uma nova ação." />}
  </>;
  const items = (diagnostic.view?.diagnostics ?? []).filter((item) => item.check === 'resources');
  const previousRead = Boolean(diagnostic.error) || diagnostic.stale && !diagnostic.refreshing;
  const busy = Boolean(diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state));
  return <div>
    <p className="muted">Esta consulta não comprova parada física dos terminais. <a href={`#principal/registros?attemptId=${encodeURIComponent(attempt.id)}`}>Ver histórico de verificações</a></p>
    <CurrentDiagnosticNotices items={items.filter(item => item.state !== 'passed')} previous={previousRead} projectId={attempt.project_id} />
    <div className="row">
      <button type="button" disabled={busy || diagnostic.loading || diagnostic.refreshing || diagnostic.stale || !diagnostic.supportedChecks.includes('resources')} onClick={() => void diagnostic.verify(['resources'])}>Verificar situação</button>
      {previousRead && <button type="button" onClick={diagnostic.refresh}>Atualizar verificação</button>}
      {diagnostic.verification && diagnostic.verification.state !== 'succeeded' && <button type="button" onClick={diagnostic.retryReceipt}>Consultar verificação</button>}
    </div>
    {diagnostic.loading && <p role="status">Consultando condições registradas dos recursos…</p>}
    {diagnostic.error && <p role="alert">{diagnostic.error}</p>}
    {diagnostic.verification && !diagnostic.previous && <div role="status">Verificação · <OperatorState value={diagnostic.verification.state} />
      {diagnostic.verification.error && <p>{diagnostic.verification.error}</p>}
      {diagnostic.verification.queryError && <p>{diagnostic.verification.queryError}</p>}
    </div>}
  </div>;
}
