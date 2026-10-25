import { useProjectDeletionStatus } from '../projects/useProjectDeletion.js';
import { deletionProgress, ProjectDeletionTargetList } from '../projects/ProjectDeletionDialog.js';

export function DeletionInventoryRecord({ operationId }: { operationId: string }) {
  const observation = useProjectDeletionStatus(operationId, 15_000);
  const status = observation.status;
  return <section className="card records-deletion-inventory" aria-labelledby="records-deletion-inventory-title">
    <div className="line records-deletion-inventory-heading">
      <div><span className="eyebrow">Exclusão</span><h2 id="records-deletion-inventory-title">Inventário autorizado</h2></div>
      <button type="button" onClick={observation.refetch}>Atualizar andamento</button>
    </div>
    <p role="status" aria-live="polite">{status ? deletionProgress(status) : observation.loading ? 'Consultando a mesma operação de exclusão…' : 'O andamento ainda não foi consultado.'}</p>
    {observation.error && <div role="alert"><p>{observation.error}</p><p><strong>Próxima ação:</strong> consulte novamente esta operação.</p></div>}
    {status?.state === 'succeeded' && <p>Exclusão concluída. O acompanhamento não expõe mais os destinos removidos.</p>}
    {status && status.state !== 'succeeded' && <>
      <ProjectDeletionTargetList targets={status.targets} />
      {status.blockers.length > 0 && <ul className="records-deletion-blockers">{status.blockers.map((blocker) => <li key={`${blocker.reason}\n${blocker.recovery}`}>
        <b>{blocker.reason}</b><span><strong>Próxima ação:</strong> {blocker.recovery}</span>
      </li>)}</ul>}
    </>}
  </section>;
}
