import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDefiniteDeletionRejection, type DeletionOriginContext, type ProjectDeletionPreview, type ProjectDeletionStatus } from '../../api/project-deletion.js';
import { wrapDialogTabFocus } from '../../app/dialog-focus.js';
import { confirmProjectDeletion, recoverUncertainOperation, useProjectDeletionPreview, useProjectDeletionStatus, resumeProjectDeletion } from './useProjectDeletion.js';

export const deletionWarning = 'Serão removidos o cadastro, o histórico, as evidências, a pasta original inteira e os ambientes locais exclusivos indicados, incluindo .git, arquivos ignorados, arquivos pessoais e trabalho não publicado. Não há backup automático. Retire antes tudo o que deseja preservar. Após confirmar, não há cancelamento. Arquivos adicionados nessas pastas durante a remoção também serão apagados; não use essas pastas durante a exclusão. Recursos do GitHub, outros cadastros e recursos compartilhados serão preservados.';

export function ProjectDeletionWarnings({ sourceKind, hasUnsavedChanges }: { sourceKind: 'local' | 'github'; hasUnsavedChanges: boolean }) {
  return <section aria-label="Perdas e preservações"><p>{deletionWarning}</p>
    <p>A exclusão considera a origem atualmente salva. Pastas de origens anteriores serão preservadas.</p>
    {sourceKind === 'github' && <p>A origem salva é somente uma URL. Não existe busca de pasta externa; nenhuma pasta de origem local histórica será removida.</p>}
    {hasUnsavedChanges && <p role="note">A exclusão usa a configuração salva. Alterações não salvas não serão aplicadas.</p>}
  </section>;
}

export function ProjectDeletionTargetList({ targets }: { targets: ProjectDeletionPreview['targets'] }) {
  const labels = { original_directory: 'Pasta original inteira', exclusive_workspace: 'Ambiente local exclusivo', exclusive_artifact: 'Artefato exclusivo' };
  return <ul className="project-deletion-targets">{targets.map((target) => <li key={target.targetKey}><b>{labels[target.targetKind]}</b><span>{target.path}</span></li>)}</ul>;
}

export function deletionProgress(status: ProjectDeletionStatus | null): string {
  if (!status) return '';
  switch (status.state) {
    case 'succeeded': return 'Exclusão concluída.';
    case 'accepted': return 'Exclusão aceita. Aguardando execução.';
    case 'running': return 'Exclusão em andamento.';
    case 'finalizing': return 'Finalizando a remoção do cadastro.';
    case 'pending': return 'Exclusão pendente. Consulte os impedimentos. Itens já removidos não serão restaurados.';
    case 'reconfirmation_required': return 'A conferência dos caminhos precisa ser atualizada. Itens já removidos não serão restaurados.';
  }
}

export function ProjectDeletionDialog({ originContext, currentRevision, installationId, accountId, hasUnsavedChanges, pollingIntervalMs, returnFocusTarget, onClose, initialOperationId = null }: {
  initialOperationId?: string | null;
  currentRevision: number;
  originContext: DeletionOriginContext; installationId: string; accountId: string | null; hasUnsavedChanges: boolean;
  pollingIntervalMs: number; returnFocusTarget: HTMLElement | null; onClose: () => void;
}) {
  const [context] = useState(() => Object.freeze({ ...originContext }));
  const [operationId, setOperationId] = useState<string | null>(initialOperationId);
  const [accepted, setAccepted] = useState<ProjectDeletionStatus | null>(null);
  const [phase, setPhase] = useState<'preview' | 'submitting' | 'uncertain' | 'stale_preview' | 'accepted'>(initialOperationId ? 'accepted' : 'preview');
  const preview = useProjectDeletionPreview(operationId ? null : context);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState('');
  const [querying, setQuerying] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const observation = useProjectDeletionStatus(phase === 'accepted' ? operationId : null, pollingIntervalMs);
  const status = observation.status ?? accepted;
  const stale = currentRevision !== context.projectRevision;
  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => {
      mounted.current = false;
      const restoreFocus = !document.activeElement || document.activeElement === document.body || Boolean(dialog?.contains(document.activeElement));
      dialog?.close();
      if (!restoreFocus) return;
      if (returnFocusTarget?.isConnected && !returnFocusTarget.matches(':disabled, [inert]')) returnFocusTarget.focus();
      else {
        const fallback = document.querySelector<HTMLElement>('[aria-current="page"], main h1, main h2');
        if (fallback) { fallback.setAttribute('tabindex', '-1'); fallback.focus(); }
      }
    };
  }, [returnFocusTarget]);
  async function confirm() {
    if (submitting.current || stale || phase !== 'preview' || preview.loading || !preview.preview?.canConfirm || !preview.etag || preview.preview.blockers.length) return;
    submitting.current = true;
    const id = crypto.randomUUID();
    setOperationId(id); setPhase('submitting'); setMessage('');
    try {
      const result = await confirmProjectDeletion({ context, installationId, accountId, operationId: id, etag: preview.etag,
        confirmation: { confirmed: true, authorization_digest: preview.preview.authorizationDigest } });
      if (mounted.current) { setAccepted(result); setPhase('accepted'); }
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (isDefiniteDeletionRejection(error)) {
        setOperationId(null);
        setPhase('stale_preview'); setMessage(`${error.message} ${error.recovery ?? 'Consulte novamente a configuração salva antes de confirmar.'}`);
      } else { setPhase('uncertain'); setMessage('Não foi possível confirmar o estado. Consulte o andamento antes de qualquer novo pedido.'); }
    } finally { submitting.current = false; }
  }
  async function resume() {
    if (!operationId || retrying || !status || status.state === 'succeeded' || !status.canRetry) return;
    setRetrying(true); setMessage('');
    try { const next = await resumeProjectDeletion(operationId); if (mounted.current) { setAccepted(next); observation.refetch(); } }
    catch { if (mounted.current) { setMessage('Não foi possível retomar. Consulte os impedimentos atuais antes de tentar novamente.'); observation.refetch(); } }
    finally { if (mounted.current) setRetrying(false); }
  }
  async function query() {
    if (!operationId || querying) return;
    setQuerying(true);
    try {
      const result = await recoverUncertainOperation(operationId);
      if (!mounted.current) return;
      if (result.kind === 'missing') setMessage('O pedido ainda não foi localizado. Continue consultando o andamento; a ausência não confirma que nada foi enviado.');
      else { setAccepted(result.status); setPhase('accepted'); setMessage(''); }
    } catch { if (mounted.current) setMessage('Não foi possível consultar o andamento. Tente consultar novamente.'); }
    finally { if (mounted.current) setQuerying(false); }
  }
  const blockers = status && status.state !== 'succeeded' ? status.blockers : phase === 'preview' ? preview.preview?.blockers ?? [] : [];
  return createPortal(<dialog ref={dialogRef} className="profile-delete-dialog project-deletion-dialog" aria-modal="true" aria-labelledby="project-deletion-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const dialog = event.currentTarget;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      wrapDialogTabFocus({ shiftKey: event.shiftKey, activeElement: document.activeElement as HTMLElement | null, dialog, focusables, activeOutsideDialog: !dialog.contains(document.activeElement), preventDefault: () => event.preventDefault() });
    }}>
    <h2 id="project-deletion-title" ref={titleRef} tabIndex={-1}>{operationId ? `Acompanhamento da exclusão de “${context.projectName}”` : `Excluir definitivamente “${context.projectName}”?`}</h2>
    {stale && !operationId && <p role="alert">A configuração salva mudou. Volte à configuração e abra uma nova conferência.</p>}
    <div role="status" aria-live="polite" aria-atomic="true">{phase === 'submitting' ? 'Enviando pedido de exclusão…' : phase === 'uncertain' ? 'Estado da exclusão não confirmado.' : phase === 'accepted' ? deletionProgress(status) : preview.loading ? 'Conferindo a configuração salva…' : ''}</div>
    {phase !== 'accepted' && <>
      <ProjectDeletionWarnings sourceKind={preview.preview?.sourceKind ?? 'local'} hasUnsavedChanges={hasUnsavedChanges} />
      {preview.preview && <ProjectDeletionTargetList targets={preview.preview.targets} />}
    </>}
    {status && status.state !== 'succeeded' && <ProjectDeletionTargetList targets={status.targets} />}
    {(message || preview.error || observation.error) && <p role="alert">{message || preview.error || observation.error}</p>}
    {blockers.length > 0 && <div role="alert">{blockers.map((blocker, index) => <div key={index}><p>{blocker.reason}</p><p><b>Próxima ação:</b> {blocker.recovery}</p></div>)}</div>}
    {phase === 'preview' && preview.preview && !preview.preview.canConfirm && blockers.length === 0 && <p role="alert">A conferência não permite excluir. Atualize a conferência antes de tentar novamente.</p>}
    {status && (status.state === 'pending' || status.state === 'reconfirmation_required') && <p>Itens já removidos não serão restaurados. Após reiniciar o controlador, pendências seguras serão retomadas; caminhos que exigem nova conferência aguardam Tentar novamente.</p>}
    {operationId && <p>Fechar ou navegar apenas deixa o acompanhamento. O pedido enviado não pode ser cancelado ou desfeito.</p>}
    <div className="profile-delete-actions">
      <button type="button" onClick={onClose}>{operationId ? 'Fechar acompanhamento' : 'Voltar à configuração'}</button>
      {(phase === 'preview' || phase === 'stale_preview') && <button type="button" disabled={preview.loading} onClick={() => { setMessage(''); setPhase('preview'); preview.refetch(); }}>Atualizar conferência</button>}
      {status && (status.state === 'pending' || status.state === 'reconfirmation_required') && status.canRetry && <button type="button" disabled={retrying} onClick={() => void resume()}>{retrying ? 'Solicitando retomada…' : 'Tentar novamente'}</button>}
      {phase === 'uncertain' && <button type="button" disabled={querying} onClick={() => void query()}>{querying ? 'Consultando…' : 'Consultar andamento'}</button>}
      {phase === 'preview' && <button type="button" className="danger-button" disabled={stale || preview.loading || !preview.preview?.canConfirm || !preview.etag || blockers.length > 0} onClick={() => void confirm()}>Excluir definitivamente</button>}
    </div>
  </dialog>, document.body);
}
