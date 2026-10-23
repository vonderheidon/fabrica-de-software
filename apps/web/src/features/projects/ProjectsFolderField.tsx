import type { SelectionCapabilities } from '#contracts';
import type { NativeSelectionController, NativeSelectionState } from './useNativeSelection.js';
import { nativeSelectionMessage } from './useNativeSelection.js';


export function ProjectsFolderField({ persistedValue, value, capability, selection, onChange, onRevalidate, saveError, disabled = false }: {
  persistedValue: string | null;
  value: string | null;
  capability: SelectionCapabilities['projects_root'];
  selection: NativeSelectionController;
  onChange: (value: string | null) => void;
  onRevalidate: (() => void) | null;
  saveError: { message: string; requestId: string | null } | null;
  disabled?: boolean;
}) {
  const candidate = selection.candidates.projects_root;
  const currentSelection = selection.state.status !== 'idle' && selection.state.kind === 'projects_root' ? selection.state : null;
  const selectionBusy = selection.state.status === 'selecting';
  const message = currentSelection ? nativeSelectionMessage(currentSelection) : null;
  const differsFromSaved = value !== persistedValue;

  return <div className="form-field field-full projects-folder-field">
    <label htmlFor="projects-root-path">Raiz dos projetos</label>
    <div className="projects-folder-input-row">
      <input id="projects-root-path" type="text" value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value || null)} aria-invalid={Boolean(saveError)} aria-describedby={`projects-root-help${saveError ? ' projects-root-error' : ''}`} />
      <button type="button" onClick={() => void selection.select('projects_root')} disabled={disabled || selectionBusy || !capability.available}>
        {selectionBusy && currentSelection?.status === 'selecting' ? 'Aguardando a janela…' : 'Selecionar pasta'}
      </button>
    </div>
    <p id="projects-root-help" className="field-guidance">Pasta local para novos projetos. Alterá-la não move os existentes. Exemplo: C:\Projetos.</p>
    {!capability.available && <div className="notice" role="status"><p>A seleção assistida de pasta está indisponível nesta sessão.</p></div>}
    {differsFromSaved && <><p className="projects-folder-saved-value"><span className="eyebrow">Pasta salva</span><span className="mono">{persistedValue ?? 'Ainda não configurada'}</span></p><p className="selection-message" role="status">A edição atual ainda não foi salva. A pasta salva permanece ativa.</p></>}
    {message && <p className={selectionStateIsWarning(currentSelection) ? 'selection-message selection-message-warning' : 'selection-message'} role={selectionStateIsWarning(currentSelection) ? 'alert' : 'status'}>{message}</p>}
    {candidate && <div className="projects-folder-candidate">
      <p><span className="eyebrow">{candidate === persistedValue ? 'Pasta já salva' : 'Candidata da seleção'}</span><span className="mono">{candidate}</span></p>
      {candidate === persistedValue
        ? <p className="muted">A configuração persistida já contém esta raiz. Projetos existentes continuam usando suas origens registradas.</p>
        : <><p className="muted">A seleção não altera nem confirma a configuração. Use a pasta para colocá-la no rascunho e depois salve a configuração.</p><button type="button" onClick={() => onChange(candidate)} disabled={disabled || value === candidate}>Usar esta pasta</button></>}
    </div>}
    {onRevalidate && value !== null && <button type="button" onClick={onRevalidate} disabled={disabled}>
      {saveError ? 'Revalidar e salvar esta pasta' : 'Validar e salvar esta pasta'}
    </button>}
    {saveError && <div id="projects-root-error" className="notice" role="alert">
      <b>A pasta não foi confirmada</b>
      <p>{saveError.message} A edição e o valor salvo anteriormente foram mantidos. Tente salvar novamente após a revalidação ou escolha outra pasta.</p>

    </div>}
  </div>;
}

function selectionStateIsWarning(state: NativeSelectionState | null): boolean {
  return state?.status === 'expired' || state?.status === 'unavailable' || state?.status === 'concurrent';
}
