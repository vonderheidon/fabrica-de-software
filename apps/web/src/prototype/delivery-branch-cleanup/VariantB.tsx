// PROTÓTIPO DESCARTÁVEL — Variante B: bloco "Entrega" próprio, opções em cartões e prévia do que acontece na pasta.
import { useEffect, useState } from 'react';
import type React from 'react';
import { finalBranch, fixture, modeLabel, prepBlockers } from './scenario.js';
import type { BranchOption, Scenario } from './scenario.js';

export function VariantB({ s }: { s: Scenario }) {
  return <>
    <ProjectConfig s={s} />
    <Prepare s={s} />
    <AttemptDetail s={s} />
    <IcrElevation s={s} />
  </>;
}

function BranchCards({ value, onChange, prLocked, name, onName, s }: { value: BranchOption; onChange: (v: BranchOption) => void; prLocked: boolean; name?: string; onName?: (v: string) => void; s: Scenario }) {
  return <div className="proto-radio-cards" role="radiogroup" aria-label="Branch de entrega">
    <div className="proto-radio-card" role="radio" aria-checked={value === 'checkout'} data-on={value === 'checkout'} aria-disabled={prLocked} onClick={() => !prLocked && onChange('checkout')}>
      <b>Branch em checkout</b>
      <span className="muted">O commit entra em <code>{fixture.checkedOut}</code> e os arquivos da pasta são atualizados. A tentativa parte da ponta dela.</span>
      {prLocked && <span className="muted">Indisponível no PR.</span>}
    </div>
    <div className="proto-radio-card" role="radio" aria-checked={value === 'new'} data-on={value === 'new'} onClick={() => onChange('new')}>
      <b>Branch nova</b>
      <span className="muted">Cria a branch a partir de <code>{fixture.base}</code> e faz checkout dela na pasta.</span>
      {value === 'new' && onName && <>
        <input value={name} onClick={e => e.stopPropagation()} onChange={e => onName(e.currentTarget.value)} aria-label="Nome da branch nova" />
        {s.warning === 'name_taken_typed' && <span className="proto-inline-warn">Esta branch já existe.</span>}
        {s.warning === 'name_taken_suggested' && <span className="proto-inline-info">Em uso; será {fixture.suggestedFree}.</span>}
      </>}
    </div>
  </div>;
}

function CleanupToggle({ checked, onChange, disabled, note }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
    <label className="form-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.currentTarget.checked)} /><b>Limpar o ambiente depois da entrega</b></label>
    {note ? <p className="proto-inline-info">{note}</p> : <div className="proto-preview">
      <span><b>Apaga:</b> a pasta de trabalho da issue (arquivos, ignorados, dependências instaladas).</span>
      <span><b>Guarda:</b> versões aprovadas, evidências, sessões e histórico da tentativa.</span>
      <span className="muted">Só depois de commit confirmado ou PR aberta. Se a entrega falhar, o ambiente fica para a correção.</span>
    </div>}
  </div>;
}

function ProjectConfig({ s }: { s: Scenario }) {
  const [branch, setBranch] = useState<BranchOption>(s.projectBranchDefault);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setBranch(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  return <section className="card form-section proto-surface">
    <span className="eyebrow">Configurar projeto · seção Entrega</span><h2>Entrega</h2>
    <div className="form-field"><label>Pasta do projeto</label><div className="row"><input style={{ flex: 1 }} defaultValue={fixture.folder} /><button type="button">Selecionar pasta</button></div>
      <div className="proto-chips" style={{ marginTop: 8 }}>
        {s.warning === 'invalid_folder' ? <span className="pill warn">Não é clone de {fixture.repo}</span> : <span className="pill">Clone de {fixture.repo}</span>}
        <span className="pill neutral">Em checkout: {s.warning === 'detached' ? 'detached HEAD' : fixture.checkedOut}</span>
      </div></div>
    <div className="form-grid" style={{ marginTop: 14 }}>
      <div className="form-field"><label>Modo padrão</label><select defaultValue={s.mode}><option value="icr">ICR</option><option value="commit">Commit</option><option value="pr">PR</option></select></div>
      <div className="form-field"><label>Branch base</label><select defaultValue="main"><option>main</option></select></div>
    </div>
    <label style={{ display: 'block', fontWeight: 650, margin: '10px 0 8px' }}>Branch de entrega padrão (Commit)</label>
    <BranchCards value={branch} onChange={setBranch} prLocked={false} s={s} />
    <CleanupToggle checked={cleanup} onChange={setCleanup} />
  </section>;
}

function Prepare({ s }: { s: Scenario }) {
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [name, setName] = useState(fixture.suggested);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setOption(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  const effective: BranchOption = s.mode === 'pr' ? 'new' : option;
  const blockers = prepBlockers(s, effective, name);
  const final = finalBranch(s, effective, name);
  return <section className="card preparation-section proto-surface">
    <span className="eyebrow">Preparar · bloco Entrega</span><h2>#{fixture.issue.number} · {fixture.issue.title}</h2>
    <div className="row" style={{ marginBottom: 14 }}><span className="muted">Modo</span>{(['icr', 'commit', 'pr'] as const).map(m => <span key={m} className={`pill ${m === s.mode ? '' : 'neutral'}`}>{modeLabel[m]}</span>)}</div>
    {blockers.filter(b => b.blocks && b.title.startsWith('Pasta')).map(b => <div key={b.title} className="notice proto-blocker" role="alert"><b>{b.title}</b><p>{b.text}</p><a href="#">Abrir Configurar projeto</a></div>)}
    {s.mode === 'icr'
      ? <p className="muted">ICR não faz commit na Pasta do projeto. A versão aprovada fica guardada e pode ser publicada depois.</p>
      : <BranchCards value={effective} onChange={setOption} prLocked={s.mode === 'pr'} name={name} onName={setName} s={s} />}
    {blockers.filter(b => !b.title.startsWith('Pasta')).map(b => <div key={b.title} className={`notice ${b.blocks ? 'proto-blocker' : ''}`}><b>{b.title}</b><p>{b.text}</p></div>)}
    {s.mode !== 'icr' && <div className="proto-preview">
      <span className="eyebrow">Na Pasta do projeto, ao aprovar</span>
      <span>{effective === 'new' ? <>Cria <code>{final}</code> a partir de <code>{fixture.base}</code>, faz checkout e grava o commit.</> : <>Grava o commit em <code>{final}</code> e atualiza os arquivos.</>}{s.mode === 'pr' && <> Depois abre a PR para <code>{fixture.base}</code>.</>}</span>
      <span className="muted">{fixture.folder}</span>
    </div>}
    <CleanupToggle checked={s.mode !== 'icr' && cleanup} disabled={s.mode === 'icr'} onChange={setCleanup} note={s.mode === 'icr' ? 'Indisponível no ICR. A remoção manual fica no detalhe da tentativa.' : undefined} />
    <div className="dialog-actions"><button type="button" className="primary" disabled={blockers.some(b => b.blocks)}>Revisar e autorizar</button></div>
  </section>;
}

function AttemptDetail({ s }: { s: Scenario }) {
  const branch = s.mode === 'icr' ? null : finalBranch(s, s.mode === 'pr' ? 'new' : s.projectBranchDefault, fixture.suggested);
  const dirty = s.warning === 'dirty' && s.mode === 'commit';
  const step = (dot: string, title: string, text: React.ReactNode, action?: React.ReactNode) => <li><span className={`proto-dot ${dot}`} /><div><b>{title}</b><div className="muted">{text}</div></div><div>{action}</div></li>;
  return <section className="card proto-surface">
    <span className="eyebrow">Detalhe da tentativa · linha da entrega</span><h2>#{fixture.issue.number} · {fixture.issue.title}</h2>
    <ol className="proto-steps">
      {step('ok', 'Versão aprovada', <code>{fixture.approvedRef}</code>)}
      {s.mode === 'icr'
        ? step('off', 'Sem commit (ICR)', 'Pode ser publicada depois como Commit ou PR.', <button type="button">Publicar…</button>)
        : dirty ? step('warn', 'Commit bloqueado', <>Pasta suja: <span className="mono">src/app.tsx, package.json</span></>, <button type="button">Tentar de novo</button>)
        : step('ok', `Commit em ${branch}`, <><code>{fixture.commit}</code> · {fixture.folder}</>)}
      {s.mode === 'pr' && !dirty && step('ok', 'PR aberta', `${branch} → ${fixture.base}`, <a href="#">Ver PR</a>)}
      {s.cleanup === 'done' && step('ok', 'Ambiente limpo', 'Pasta de trabalho removida. Histórico e evidências preservados.')}
      {s.cleanup === 'pending' && step('warn', 'Limpeza pendente', fixture.cleanupReason, <button type="button">Remover ambiente</button>)}
      {s.cleanup === 'waiting' && step('off', 'Limpeza agendada', 'Roda quando a entrega for confirmada.')}
      {s.cleanup === 'not_requested' && step('off', 'Ambiente mantido', 'var/factory/managed/issues/48/workspace', <button type="button">Remover ambiente</button>)}
    </ol>
  </section>;
}

function IcrElevation({ s }: { s: Scenario }) {
  const [target, setTarget] = useState<'commit' | 'pr'>('commit');
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [name, setName] = useState(fixture.suggested);
  const effective = target === 'pr' ? 'new' : option;
  return <section className="proto-modal proto-surface">
    <span className="eyebrow">Elevação tardia de um ICR · diálogo</span><h2>Publicar a versão aprovada</h2>
    <div className="row" style={{ marginBottom: 14 }}>{(['commit', 'pr'] as const).map(m => <button key={m} type="button" className={m === target ? 'primary' : ''} onClick={() => setTarget(m)}>{modeLabel[m]}</button>)}</div>
    <BranchCards value={effective} onChange={setOption} prLocked={target === 'pr'} name={name} onName={setName} s={s} />
    <p className="muted">Publica exatamente <code>{fixture.approvedRef}</code>, sem nova revisão.</p>
    <div className="dialog-actions"><button type="button" className="primary">Publicar</button></div>
  </section>;
}
