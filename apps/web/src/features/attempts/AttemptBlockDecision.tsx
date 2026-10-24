import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HttpAttemptDetail, HttpMakeAttemptDecision, OperationAccepted, OperationView, SettingsView } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { decisionLabel, EvidenceList } from './CorrectionHistory.js';
import { CustomSelect } from '../../app/CustomSelect.js';

type Action = HttpMakeAttemptDecision['action'];
type Draft = { action: Action | null; guidance: string; profile: string; profileLabel: string; operationId: string | null; busy: boolean; locked: boolean; reviewedEtag: string | null; submittedEtag: string | null; confirmed: boolean; error: string; notice: string; listeners: Set<() => void> };
// Session-only drafts survive closing the dialog; accepted/uncertain commands never become new commands on reopen.
const drafts = new Map<string, Draft>();
export function AttemptBlockDecision({ attempt, etag, current, onRefresh }: { attempt: HttpAttemptDetail; etag: string | null; current: boolean; onRefresh: () => void }) {
  const block = attempt.block;
  const key = `${attempt.expected_account_id}:${attempt.id}:${block?.id ?? ''}`;
  const [, render] = useReducer(value => value + 1, 0);
  let draft = drafts.get(key);
  if (!draft) { draft = { action: null, guidance: '', profile: '', profileLabel: '', operationId: null, busy: false, locked: false, reviewedEtag: etag, submittedEtag: null, confirmed: false, error: '', notice: '', listeners: new Set() }; drafts.set(key, draft); }
  const state = draft;
  const active = useRef(true);
  const [profiles, setProfiles] = useState<SettingsView['profiles']>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const update = (values: Partial<Draft>) => { Object.assign(state, values); state.listeners.forEach(listener => listener()); };
  useEffect(() => { active.current = true; state.listeners.add(render); return () => { active.current = false; state.listeners.delete(render); }; }, [state]);
  useEffect(() => { setFooter(document.getElementById('attempt-decision-actions')); }, []);
  async function consult() {
    const operationId = state.operationId;
    if (!operationId || state.busy) return;
    update({ busy: true });
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (operation.operation_id !== operationId || operation.kind !== 'attempt.decision' || operation.resource.id !== attempt.id) throw new Error('Operação incompatível.');
      update({ confirmed: operation.state === 'succeeded', error: '', notice: operation.state === 'succeeded' ? state.action === 'change_profile' ? 'Decisão registrada. Sucessora preparada, sem iniciar. A tentativa anterior ainda exige encerramento explícito.' : 'Decisão registrada. Consulte o estado atualizado da tentativa.' : operation.state === 'failed' ? 'A operação falhou. Consulte o estado atual antes de qualquer nova decisão.' : 'Operação ainda sem conclusão confirmada. Consulte novamente; não haverá reenvio.' });
      if (active.current) onRefresh();
    } catch { update({ notice: 'Envio sem confirmação. Consulte a mesma operação novamente; a decisão não será reenviada.' }); }
    finally { update({ busy: false }); }
  }
  useEffect(() => { if (state.operationId && !state.busy) void consult(); }, []);
  if (!block) return null;
  const capabilities = { guidance: block.guidance_capability, change_profile: block.change_profile_capability, end: block.end_capability };
  const stale = state.reviewedEtag !== etag;
  const eligible = current && !attempt.result && attempt.suspension === 'CORRECTION_BLOCKED' && Boolean(attempt.delivery_id) && attempt.selected_delivery_id === attempt.delivery_id;
  async function loadProfiles() {
    try {
      const data = await requestJson<SettingsView>('/api/v1/settings');
      if (active.current) { setProfiles(data.profiles); setProfilesLoaded(true); }
    } catch { update({ error: 'Não foi possível consultar os perfis. Consulte novamente antes de escolher.' }); }
  }
  async function submit() {
    const action = state.action;
    if (!block || !eligible || stale || !etag || !action || !capabilities[action].available || state.busy || state.locked) return;
    const profile = profiles.find(item => `${item.id}:${item.revision}` === state.profile);
    const common = { block_id: block.id, block_revision: block.revision, delivery_id: attempt.delivery_id!, authorized: true as const };
    let body: HttpMakeAttemptDecision;
    if (action === 'guidance') { if (!state.guidance.trim()) return; body = { ...common, action, guidance: state.guidance }; }
    else if (action === 'change_profile') { if (!profile || !['implementer', 'reviewer'].includes(profile.profile_type)) return; body = { ...common, action, profile_id: profile.id, profile_revision: profile.revision, role: profile.profile_type as 'implementer' | 'reviewer' }; }
    else body = { ...common, action };
    const operationId = crypto.randomUUID();
    update({ operationId, submittedEtag: etag, confirmed: false, busy: true, locked: true, error: '', notice: '' });
    try {
      const { data } = await requestJsonWithMetadata<OperationAccepted>(`/api/v1/attempts/${encodeURIComponent(attempt.id)}/decisions`, { method: 'POST', headers: { 'Idempotency-Key': operationId, 'If-Match': etag }, body: JSON.stringify(body) });
      if (data.operation_id !== operationId) throw new Error('Recibo incompatível.');
      update({ notice: action === 'change_profile' ? 'Sucessora preparada, sem iniciar. Encerre explicitamente a tentativa anterior antes de iniciar a sucessora.' : action === 'end' ? 'Encerramento solicitado. A parada física ainda precisa ser confirmada.' : 'Orientação registrada para continuar na mesma tentativa, com perfil e limite preservados.' });
      if (active.current) onRefresh();
    } catch (reason) {
      if (reason instanceof HttpError && reason.status < 500) {
        update({ operationId: null, locked: false, reviewedEtag: null, error: reason.status === 412 ? 'A revisão venceu. Seu rascunho foi preservado. Atualize e reveja a ação antes de confirmar.' : 'A decisão foi recusada. Atualize o estado e reveja a ação; seu rascunho foi preservado.' });
        if (active.current) onRefresh();
      } else update({ notice: 'Envio sem confirmação. Consulte a mesma operação; não confirme outra decisão.' });
    } finally { update({ busy: false }); }
  }
  const actionButton = state.operationId ? <button type="button" disabled={state.busy} onClick={() => void consult()}>Consultar decisão enviada</button> : <button type="button" className="primary" disabled={!eligible || !etag || stale || state.busy || state.locked || !state.action || !capabilities[state.action].available || state.action === 'guidance' && !state.guidance.trim() || state.action === 'change_profile' && !profiles.some(item => `${item.id}:${item.revision}` === state.profile)} onClick={() => void submit()}>Confirmar decisão</button>;
  return <section className="attempt-axis-card card attempt-block-decision" aria-label="Decisão sobre o bloqueio"><h3>Correção automática interrompida</h3><p>{block.cause}</p><p>{block.recovery}</p>
    <p>Correções utilizadas: {attempt.round - 1} de {block.correction_limit}. No primeiro bloqueio: {block.consecutive_no_progress} correções consecutivas sem progresso.</p>
    <details><summary>Evidências do primeiro bloqueio</summary><EvidenceList values={block.evidence} /></details>
    {!eligible && <p role="status">A decisão está indisponível nesta seleção ou estado. Consulte a versão atual.</p>}
    <fieldset disabled={!eligible || state.busy || state.locked}><legend>Escolha uma ação</legend>{(['guidance', 'change_profile', 'end'] as const).map(action => <div key={action}><label><input type="radio" name={`block-action-${attempt.id}`} checked={state.action === action} disabled={!capabilities[action].available} onChange={() => update({ action })} />{decisionLabel(action)}</label>{!capabilities[action].available && <p className="muted">{capabilities[action].reason ?? 'Ação indisponível no estado atual.'}</p>}</div>)}
      {state.action === 'guidance' && <div className="form-field"><p>A orientação continua nesta tentativa com o perfil capturado e o limite restante. Não altera os critérios.</p><label htmlFor="block-guidance">Orientação contextual</label><textarea id="block-guidance" maxLength={8192} value={state.guidance} onChange={event => update({ guidance: event.target.value })} /></div>}
      {state.action === 'change_profile' && <div className="form-field"><p>A troca prepara uma sucessora com nova captura e sessão. Não inicia a sucessora nem encerra esta tentativa; preserva o limite total.</p><button type="button" onClick={() => void loadProfiles()}>Consultar perfis disponíveis</button><label htmlFor="block-profile">Perfil e papel da sucessora</label><CustomSelect id="block-profile" disabled={!eligible || state.busy || state.locked} value={state.profile} onChange={event => { const value = event.currentTarget.value; const profile = profiles.find(item => `${item.id}:${item.revision}` === value); update({ profile: value, profileLabel: profile ? `${profile.name} · ${profile.profile_type === 'implementer' ? 'Implementador' : 'Revisor'} · revisão ${profile.revision}` : '' }); }}><option value="">Escolha um perfil</option>{state.profile && !profiles.some(item => `${item.id}:${item.revision}` === state.profile) && <option value={state.profile} disabled>{state.profileLabel} · consulte a disponibilidade</option>}{profiles.filter(item => ['implementer', 'reviewer'].includes(item.profile_type)).map(item => <option key={item.id} value={`${item.id}:${item.revision}`}>{item.name} · {item.profile_type === 'implementer' ? 'Implementador' : 'Revisor'} · revisão {item.revision}</option>)}</CustomSelect>{profilesLoaded && !profiles.length && <p>Nenhum perfil disponível.</p>}</div>}
      {state.action === 'end' && <p>Solicita cancelamento e parada pelos mecanismos existentes. A confirmação da parada permanece no ambiente da tentativa.</p>}
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}{state.notice && <p role="status">{state.notice}</p>}
    {stale && !state.locked && <div role="status"><p>A tentativa mudou. Confira a causa e a escolha; o rascunho permanece preservado.</p><button type="button" disabled={!eligible || !etag} onClick={() => update({ reviewedEtag: etag, error: '' })}>Revisei o estado e a ação</button></div>}
    {state.confirmed && eligible && etag && etag !== state.submittedEtag && <button type="button" disabled={state.busy} onClick={() => update({ action: null, operationId: null, locked: false, confirmed: false, reviewedEtag: etag, error: '', notice: 'A decisão anterior permanece no histórico. Escolha explicitamente a próxima ação para o bloqueio atual.' })}>Escolher nova decisão para o estado atual</button>}
    {footer ? createPortal(actionButton, footer) : <div className="attempt-recovery-actions">{actionButton}</div>}
  </section>;
}
