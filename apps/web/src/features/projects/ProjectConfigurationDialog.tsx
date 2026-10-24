import { useState } from 'react';
import type { ProjectStorageView } from '#contracts';
import { useProjectStorage } from './useProjectStorage.js';

const states = { current: 'Localização verificada', legacy: 'Organização legada', transitioning: 'Transição em andamento', uncertain: 'Transição incerta', blocked: 'Transição bloqueada' };
const steps: Readonly<Record<string, string>> = { planned: 'Plano aceito', quiescence_checked: 'Atividade conferida', moving: 'Movimento em andamento', verifying: 'Conferindo destino', publishing_location: 'Confirmando localização' };
const causes: Readonly<Record<string, string>> = {
  STORAGE_TRANSITION_INTERRUPTED: 'O acompanhamento foi interrompido antes da confirmação final.',
  STORAGE_TRANSITION_BOTH_PRESENT: 'Origem e destino estão presentes. Ambos foram preservados para conferência.',
  STORAGE_TRANSITION_BOTH_MISSING: 'Nem a origem nem o destino puderam ser encontrados.',
  STORAGE_TRANSITION_ACCESS_DENIED: 'O controlador não conseguiu acessar as pastas.',
  STORAGE_TRANSITION_SOURCE_CHANGED: 'A identidade da pasta de origem mudou.',
  STORAGE_TRANSITION_DESTINATION_CHANGED: 'A identidade da pasta de destino mudou.',
  STORAGE_TRANSITION_DESTINATION_EXISTS: 'O destino já existe e não pode ser substituído.',
  STORAGE_TRANSITION_CROSS_VOLUME: 'As pastas estão em volumes diferentes; o movimento seguro não está disponível.',
  STORAGE_TRANSITION_MOVE_FAILED: 'O movimento não pôde ser confirmado; os caminhos foram preservados.',
};
function storageCause(cause: string): string {
  return causes[cause] ?? (/^[A-Z0-9_]+$/.test(cause) ? 'O controlador não conseguiu conferir as localizações com segurança.' : cause);
}

/** Content hosted by the existing configuration dialog; never creates another modal. */
export function ProjectConfigurationDialog({ projectId, installationId, accountId, storage, etag, disabled, onRefresh }: {
  projectId: string; installationId: string; accountId: string | null; storage: ProjectStorageView; etag: string; disabled: boolean; onRefresh: () => void;
}) {
  const transition = useProjectStorage({ projectId, installationId, accountId, storage, etag, onRefresh });
  const [authorization, setAuthorization] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const plan = storage.transition_plan;
  const signature = JSON.stringify([etag, plan]);
  const operation = transition.operation;
  const pending = Boolean(transition.operationId || storage.active_transition_operation_id);
  async function copy(path: string): Promise<void> {
    try { await navigator.clipboard.writeText(path); setCopied('Caminho copiado.'); }
    catch { setCopied('Não foi possível copiar. Selecione o caminho completo acima.'); }
  }
  return <section className="card form-section project-storage" aria-labelledby="project-storage-title">
    <h2 id="project-storage-title">Localizações do projeto</h2>
    <dl className="project-storage-paths">
      <div><dt>Pasta original</dt><dd>{storage.original_path ?? 'Origem remota; não há pasta original local.'}</dd>{storage.original_path && <button type="button" onClick={() => void copy(storage.original_path!)}>Copiar pasta original</button>}</div>
      <div><dt>Pasta gerenciada</dt><dd>{storage.managed_root ?? 'Nenhuma raiz gerenciada verificada.'}</dd>{storage.managed_root && <button type="button" onClick={() => void copy(storage.managed_root!)}>Copiar pasta gerenciada</button>}</div>
    </dl>
    <p>A pasta original permanece no lugar. Caminhos gerenciados relativos partem da instalação da fábrica. Banco e recursos compartilhados permanecem globais.</p>
    <a href={`#principal/tentativas?projectId=${encodeURIComponent(projectId)}`}>Consultar ambientes e ações de abertura das tentativas</a>
    {copied && <p role="status">{copied}</p>}
    <p><strong>{states[storage.state]}</strong></p>
    {storage.cause && <p>{storageCause(storage.cause)}</p>}
    <p><strong>Próxima ação:</strong> {storage.recovery ?? (storage.state === 'legacy' ? 'Consulte os ambientes existentes. A transição exige uma raiz e um plano verificados pelo controlador.' : 'Consulte o plano atual antes de autorizar qualquer transição.')}</p>
    {storage.locations.length > 0 && <details><summary>Localizações registradas</summary><ul>{storage.locations.map(location => <li key={location.id}><span>{location.current ? 'Atual' : 'Histórica'} · layout {location.layout_version}</span><p className="storage-path">{location.path}</p></li>)}</ul></details>}
    {transition.failure && <div role="alert" className="notice"><p>{transition.failure.message}</p><p><strong>Próxima ação:</strong> {transition.failure.recovery}</p></div>}
    {pending && <div className="notice" aria-live="polite">
      <strong>{operation?.state === 'succeeded' ? 'Transição concluída e verificada' : operation?.progress?.state === 'blocked' ? 'Transição bloqueada' : operation?.state === 'unknown' ? 'Resultado incerto; localizações preservadas' : operation?.state === 'failed' ? 'Transição não concluída' : 'Transição aceita ou aguardando confirmação'}</strong>
      {operation?.progress && 'step' in operation.progress && <p>{steps[operation.progress.step]}</p>}
      {operation?.error && <><p>{operation.error.message}</p><p><strong>Próxima ação:</strong> {operation.error.recovery}</p></>}
      {!operation && <p>O envio não comprova movimento concluído. Consulte a operação original; fechar esta janela não cancela o trabalho.</p>}
      {operation && ['unknown', 'failed'].includes(operation.state) && !transition.canResume && <p>O pedido original não está mais nesta sessão. Consulte o andamento e encaminhe a pendência ao suporte para retomar com a mesma identidade; não autorize outro movimento.</p>}
      <div className="row"><button type="button" disabled={transition.busy} onClick={() => void transition.consult()}>Consultar transição original</button>
        {transition.canResume && <button type="button" disabled={disabled || transition.busy} onClick={() => void transition.send(true)}>Retomar a mesma operação</button>}
        {operation?.state === 'succeeded' && <button type="button" onClick={transition.acknowledge}>Conferir localização atual</button>}</div>
    </div>}
    {!pending && plan && <div className="storage-transition-plan">
      <h3>Plano de transição</h3><p>Origem verificada: <span className="storage-path">{storage.locations.find(location => location.id === plan.source_location_id)?.path ?? 'Origem não encontrada; atualize o plano.'}</span></p>
      <p>Destino na instalação: <span className="storage-path">{plan.destination_relative}</span></p>
      {!plan.capability.available && <div className="notice"><p>{plan.capability.reason ?? 'A transição não está disponível.'}</p><p><strong>Próxima ação:</strong> {plan.capability.recovery ?? 'Atualize o plano e confira as condições do projeto.'}</p></div>}
      {plan.capability.available && <><label className="storage-transition-authorization"><input type="checkbox" checked={authorization === signature} disabled={disabled || transition.busy} onChange={event => setAuthorization(event.currentTarget.checked ? signature : null)} />Autorizo a transição entre a origem e o destino deste plano. A pasta original permanece intacta.</label>
        <button type="button" className="primary" disabled={disabled || transition.busy || transition.requiresReview || authorization !== signature || !storage.locations.some(location => location.id === plan.source_location_id && location.current)} onClick={() => { setAuthorization(null); void transition.send(); }}>{transition.busy ? 'Enviando…' : 'Autorizar transição gerenciada'}</button></>}
    </div>}
    <button type="button" disabled={transition.busy} onClick={() => { setAuthorization(null); onRefresh(); }}>Atualizar e rever plano</button>
  </section>;
}
