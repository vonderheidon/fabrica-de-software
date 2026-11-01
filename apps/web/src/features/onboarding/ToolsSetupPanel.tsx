import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolOptions } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { CustomSelect } from '../../app/CustomSelect.js';
import { requestJson } from '../../api/http.js';
import { nativeSelectionMessage, useNativeSelection } from '../projects/useNativeSelection.js';
import { useOnboarding, type OnboardingController } from './useOnboarding.js';

const tools = ['git', 'maestri', 'omp', 'powershell', 'gh'] as const;
type Tool = typeof tools[number];
const labels: Record<Tool, string> = { git: 'Git', maestri: 'Maestri', omp: 'OMP', powershell: 'PowerShell', gh: 'GitHub CLI' };
type Props = { onboarding: OnboardingController; disabled?: boolean; resetKey?: number; compactHeading?: boolean; onDraftStateChange?: (dirty: boolean, saving: boolean) => void };

export function ToolsSetupPanel(props: Props) {
  const settings = props.onboarding.load.snapshot?.settings;
  const identity = JSON.stringify([settings?.settings.installation_id, settings?.settings.account_id]);
  return <ToolsSetupContent key={identity} {...props} />;
}

function ToolsSetupContent({ onboarding, disabled = false, resetKey = 0, compactHeading = false, onDraftStateChange }: Props) {
  const [observation, setObservation] = useState<ToolOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Tool, string>>>({});
  const selection = useNativeSelection();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const submitted = useRef<{ tool: Tool; path: string } | null>(null);
  const callback = useRef(onDraftStateChange);
  callback.current = onDraftStateChange;
  const operation = onboarding.operation;
  const settingsRevision = onboarding.load.snapshot?.etag;
  const pending = operation.status === 'saving' || operation.status === 'uncertain';
  const busy = onboarding.busy || selection.state.status === 'selecting';
  const dirty = Object.keys(drafts).length > 0 || tools.some(tool => Boolean(selection.candidates[`${tool}_executable`]));

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<ToolOptions>('/api/v1/settings/tool-options', { signal: abort.signal });
      if (!Value.Check(ToolOptions, data)) throw new Error('Invalid tool observation');
      if (current === generation.current) setObservation(data);
    } catch {
      if (current === generation.current) setError('Não foi possível revalidar as ferramentas. Mantenha suas escolhas e tente detectar novamente.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [refresh, settingsRevision]);
  useEffect(() => { callback.current?.(dirty, busy); }, [dirty, busy]);
  useEffect(() => () => callback.current?.(false, false), []);
  useEffect(() => { setDrafts({}); for (const tool of tools) selection.clearCandidate(`${tool}_executable`); }, [resetKey]);
  useEffect(() => {
    for (const tool of tools) {
      const path = selection.candidates[`${tool}_executable`];
      if (!path) continue;
      setDrafts(current => ({ ...current, [tool]: path }));
      selection.clearCandidate(`${tool}_executable`);
    }
  }, [selection.candidates]);
  useEffect(() => {
    if (operation.status !== 'confirmed' || operation.kind !== 'tools') return;
    const sent = submitted.current;
    if (sent) {
      setDrafts(current => {
        if (current[sent.tool] !== sent.path) return current;
        const next = { ...current }; delete next[sent.tool]; return next;
      });
      selection.clearCandidate(`${sent.tool}_executable`);
      submitted.current = null;
    }
  }, [operation]);

  function save(tool: Tool): void {
    const path = drafts[tool];
    if (!path?.trim() || pending || disabled || busy) return;
    submitted.current = { tool, path };
    void onboarding.saveTool(tool, path);
  }

  const selectionMessage = nativeSelectionMessage(selection.state);
  return <section className="card form-section tools-setup" aria-label="Ferramentas desta instalação">
    <div className={compactHeading ? 'tools-detection-action' : 'settings-section-heading'}>{!compactHeading && <div><span className="eyebrow">Instalação</span><h3>Ferramentas desta instalação</h3></div>}<button type="button" onClick={() => void refresh()} disabled={loading || busy}>Detectar novamente</button></div>
    {!compactHeading && <p>As opções válidas são usadas automaticamente. Corrija somente ferramentas ausentes ou com escolha pendente.</p>}
    {loading && <p role="status">{observation ? 'Revalidando; o resumo anterior permanece visível.' : 'Detectando as ferramentas instaladas…'}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {onboarding.load.error && <div role="alert"><p>A leitura da configuração falhou. As escolhas salvas exibidas são da leitura anterior; seus rascunhos foram mantidos.</p><button type="button" onClick={() => void onboarding.refresh()}>Atualizar escolhas salvas</button></div>}
    <div className="tools-summary">{tools.map(tool => {
      const item = observation?.tools[tool];
      const saved = tool === 'gh' ? null : onboarding.load.snapshot?.settings.tool_preferences[tool].preferred_path;
      const manual = item && (item.state !== 'available' || Boolean(saved && saved !== item.selected_path));
      const hasCandidates = Boolean(item?.candidates.length);
      const showPath = Boolean(manual && !hasCandidates) || Boolean(drafts[tool]?.trim());
      return <article key={tool} className="tool-summary" data-state={manual ? 'pending' : item?.state}>
        <div><b>{labels[tool]}</b><span className="tool-status">{!item ? 'Aguardando detecção' : item.state === 'available' ? 'Localizado e validado' : item.state === 'ambiguous' ? 'Escolha pendente' : 'Não disponível'}</span></div>
        {item?.selected_path && <p className="tool-path">{item.selected_path} <small>{item.candidates.find(option => option.path === item.selected_path)?.version}</small></p>}
        {saved && saved !== item?.selected_path && <p className="tool-path">Caminho salvo: {saved}. A leitura atual não confirmou esse caminho.</p>}
        {manual && <>
          {!hasCandidates && <p className="tool-hint">Não encontramos o {labels[tool]}.</p>}
          {item.candidates.length > 0 && <div className="form-field"><label htmlFor={`tool-${tool}-candidate`}>Opções de {labels[tool]}</label><CustomSelect id={`tool-${tool}-candidate`} searchable={false} value={drafts[tool] ?? ''} disabled={disabled || pending || busy} onChange={event => { const path = event.currentTarget.value; setDrafts(current => ({ ...current, [tool]: path })); }}><option value="">Selecione…</option>{item.candidates.map(option => <option key={option.path} value={option.path}>{option.path} · {option.version}</option>)}</CustomSelect></div>}
        </>}
        {(manual || drafts[tool] !== undefined) && <div className="form-field">
          {showPath && <><label htmlFor={`tool-${tool}-path`}>Caminho escolhido de {labels[tool]}</label><div className="tool-path-picker"><input id={`tool-${tool}-path`} placeholder="Caminho absoluto do executável" value={drafts[tool] ?? ''} disabled={disabled || pending || busy} onChange={event => { const path = event.currentTarget.value; setDrafts(current => ({ ...current, [tool]: path })); }} /><button type="button" aria-label={`Procurar ${hasCandidates || drafts[tool]?.trim() ? 'outro ' : ''}executável de ${labels[tool]}`} disabled={disabled || pending || busy} onClick={() => void selection.select(`${tool}_executable`)}>{hasCandidates || drafts[tool]?.trim() ? 'Procurar outro executável…' : 'Procurar executável…'}</button></div></>}
          <button className="primary" type="button" disabled={disabled || pending || busy || !drafts[tool]?.trim()} onClick={() => save(tool)}>Validar e salvar {labels[tool]}</button>
        </div>}
      </article>;
    })}</div>
    {selectionMessage && <p role="status">{selectionMessage}</p>}
    {operation.status === 'failed' && operation.kind === 'tools' && <p role="alert" className="error">A escolha não foi salva. {operation.message} Confira o executável e tente novamente; seu rascunho foi mantido.</p>}
    {operation.status === 'confirmed' && operation.kind === 'tools' && <div className="save-success" role="status"><p>Executável salvo com sucesso. A alteração será usada na próxima inicialização.</p></div>}
    {operation.status === 'uncertain' && operation.kind === 'tools' && <div role="alert"><p>A gravação está sem confirmação. Consulte a operação original antes de salvar outra escolha.</p><button type="button" onClick={() => void onboarding.recover()}>Consultar gravação das ferramentas</button>{operation.canResend && <button type="button" onClick={() => void onboarding.recover(true)}>Reapresentar a mesma gravação</button>}{operation.recoveryError && <p>{operation.recoveryError}</p>}</div>}
  </section>;
}

export function ToolsConfigurationPanel({ disabled = false }: { disabled?: boolean }) {
  const onboarding = useOnboarding(true);
  if (!onboarding.load.snapshot) return <section className="card" role={onboarding.load.error ? 'alert' : 'status'}><p>{onboarding.load.error?.message ?? 'Consultando as escolhas salvas das ferramentas…'}</p>{onboarding.load.error && <button type="button" onClick={() => void onboarding.refresh()}>Consultar escolhas novamente</button>}</section>;
  return <ToolsSetupPanel onboarding={onboarding} disabled={disabled} />;
}
