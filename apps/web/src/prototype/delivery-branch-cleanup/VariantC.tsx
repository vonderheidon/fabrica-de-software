// PROTÓTIPO DESCARTÁVEL — Variante C: uma frase-resumo legível; cada escolha sublinhada abre o controle no lugar.
import { useEffect, useState } from 'react';
import { finalBranch, fixture, modeLabel, prepBlockers } from './scenario.js';
import type { BranchOption, Scenario } from './scenario.js';

export function VariantC({ s }: { s: Scenario }) {
  return <>
    <ProjectConfig s={s} />
    <Prepare s={s} />
    <AttemptDetail s={s} />
    <IcrElevation s={s} />
  </>;
}

type Editing = null | 'branch' | 'name' | 'cleanup';

function Sentence({ s, mode, option, setOption, name, setName, cleanup, setCleanup, withName }: { s: Scenario; mode: 'icr' | 'commit' | 'pr'; option: BranchOption; setOption: (v: BranchOption) => void; name: string; setName: (v: string) => void; cleanup: boolean; setCleanup: (v: boolean) => void; withName: boolean }) {
  const [editing, setEditing] = useState<Editing>(null);
  const effective: BranchOption = mode === 'pr' ? 'new' : option;
  const final = withName ? finalBranch(s, effective, name) : effective === 'new' ? 'uma branch nova com nome sugerido pela issue' : 'a branch em checkout';
  const toggle = (e: Editing) => setEditing(editing === e ? null : e);
  return <>
    <p className="proto-sentence">
      {mode === 'icr' ? <>Ao aprovar, <b>nada é gravado</b> na Pasta do projeto; a versão fica guardada para publicar depois. </> : <>
        Ao aprovar, o commit entra {' '}
        {mode === 'pr' ? <b>numa branch nova</b> : <button type="button" className="link" onClick={() => toggle('branch')}>{effective === 'new' ? 'numa branch nova' : 'na branch em checkout'}</button>}
        {withName && <>{' '}<button type="button" className="link" onClick={() => effective === 'new' && toggle('name')}><code>{final}</code></button></>}
        {effective === 'new' && <> criada a partir de <code>{fixture.base}</code></>}
        {mode === 'pr' && <>, e a PR é aberta para <code>{fixture.base}</code></>}. </>}
      Depois, o ambiente da issue {' '}
      {mode === 'icr' ? <b>é mantido</b> : <button type="button" className="link" onClick={() => toggle('cleanup')}>{cleanup ? 'é removido' : 'é mantido'}</button>}.
    </p>
    {editing === 'branch' && <div className="row" style={{ marginTop: 10 }}>
      <label className="form-check"><input type="radio" checked={effective === 'checkout'} onChange={() => setOption('checkout')} />Branch em checkout{withName && ` (${fixture.checkedOut})`}</label>
      <label className="form-check"><input type="radio" checked={effective === 'new'} onChange={() => setOption('new')} />Branch nova</label>
    </div>}
    {editing === 'name' && <div className="form-field" style={{ marginTop: 10, maxWidth: 460 }}><label>Nome da branch nova</label><input value={name} onChange={e => setName(e.currentTarget.value)} /></div>}
    {editing === 'cleanup' && <div style={{ marginTop: 10 }}>
      <label className="form-check"><input type="checkbox" checked={cleanup} onChange={e => setCleanup(e.currentTarget.checked)} />Remover o ambiente depois da entrega</label>
      <p className="proto-inline-info">Apaga só a pasta de trabalho. Versões aprovadas, evidências e histórico ficam.</p>
    </div>}
    {mode === 'icr' && <p className="proto-inline-info">Limpeza automática indisponível no ICR; remova manualmente no detalhe da tentativa.</p>}
  </>;
}

function ProjectConfig({ s }: { s: Scenario }) {
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setOption(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  return <section className="card form-section proto-surface">
    <span className="eyebrow">Configurar projeto</span><h2>Como as entregas aterrissam</h2>
    <div className="form-field"><label>Pasta do projeto</label><div className="row"><input style={{ flex: 1 }} defaultValue={fixture.folder} /><button type="button">Selecionar pasta</button></div>
      {s.warning === 'invalid_folder' && <p className="proto-inline-warn">Não é um clone de {fixture.repo}.</p>}</div>
    <div style={{ marginTop: 14 }}><span className="eyebrow">Padrão para novas tentativas (modo {modeLabel[s.mode]})</span>
      <Sentence s={s} mode={s.mode} option={option} setOption={setOption} name="" setName={() => {}} cleanup={cleanup} setCleanup={setCleanup} withName={false} /></div>
  </section>;
}

function Prepare({ s }: { s: Scenario }) {
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [name, setName] = useState(fixture.suggested);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setOption(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  const effective: BranchOption = s.mode === 'pr' ? 'new' : option;
  const blockers = prepBlockers(s, effective, name);
  return <section className="card preparation-section proto-surface">
    <span className="eyebrow">Preparar · resumo antes de iniciar</span><h2>#{fixture.issue.number} · {fixture.issue.title}</h2>
    <p className="muted" style={{ marginTop: 0 }}>{modeLabel[s.mode]} · Pasta do projeto <span className="mono">{fixture.folder}</span></p>
    <div className="notice" style={{ background: '#f7f8f9', borderColor: 'var(--border)' }}>
      <Sentence s={s} mode={s.mode} option={option} setOption={setOption} name={name} setName={setName} cleanup={s.mode !== 'icr' && cleanup} setCleanup={setCleanup} withName />
    </div>
    {blockers.map(b => <div key={b.title} className={`notice ${b.blocks ? 'proto-blocker' : ''}`}><b>{b.title}</b><p>{b.text}</p></div>)}
    <div className="dialog-actions"><button type="button" className="primary" disabled={blockers.some(b => b.blocks)}>Revisar e autorizar</button></div>
  </section>;
}

function AttemptDetail({ s }: { s: Scenario }) {
  const branch = s.mode === 'icr' ? null : finalBranch(s, s.mode === 'pr' ? 'new' : s.projectBranchDefault, fixture.suggested);
  const dirty = s.warning === 'dirty' && s.mode === 'commit';
  return <section className="card proto-surface">
    <span className="eyebrow">Detalhe da tentativa · cabeçalho</span>
    <div className="line"><h2 style={{ margin: 0 }}>#{fixture.issue.number} · {fixture.issue.title}</h2>
      <div className="proto-chips">
        <span className="pill">{s.mode === 'icr' ? 'ICR aprovado' : dirty ? 'Commit bloqueado' : 'Entrega concluída'}</span>
        {branch && <span className="pill neutral">{branch}</span>}
        {s.mode !== 'icr' && !dirty && <span className="pill neutral">{fixture.commit}</span>}
        <span className={`pill ${s.cleanup === 'pending' ? 'warn' : 'neutral'}`}>{{ done: 'Ambiente limpo', pending: 'Limpeza pendente', waiting: 'Limpeza após a entrega', not_requested: 'Ambiente mantido' }[s.cleanup]}</span>
      </div></div>
    {dirty && <div className="queue-error" role="alert" style={{ marginTop: 14 }}><p><strong>A Pasta do projeto tem alterações não commitadas.</strong> Faça commit, stash ou descarte e tente de novo.</p><p className="mono">src/app.tsx · package.json</p><button type="button">Tentar de novo</button></div>}
    {s.cleanup === 'pending' && <div className="notice" role="status" style={{ marginTop: 14 }}><b>A entrega está concluída, mas a limpeza do ambiente falhou</b><p>{fixture.cleanupReason}</p><button type="button">Remover ambiente</button></div>}
    {s.cleanup === 'not_requested' && <p className="muted" style={{ marginTop: 14 }}>O ambiente da issue continua em var/factory. <button type="button">Remover ambiente</button></p>}
  </section>;
}

function IcrElevation({ s }: { s: Scenario }) {
  const [target, setTarget] = useState<'commit' | 'pr'>('commit');
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [name, setName] = useState(fixture.suggested);
  return <section className="card proto-surface">
    <span className="eyebrow">Elevação tardia de um ICR</span><h2>Publicar a versão aprovada</h2>
    <p className="proto-sentence">Publicar como {' '}
      <select value={target} onChange={e => setTarget(e.currentTarget.value as 'commit' | 'pr')} style={{ width: 'auto', display: 'inline-block' }}><option value="commit">Commit</option><option value="pr">PR</option></select>
      {' '}a versão <code>{fixture.approvedRef}</code>, sem nova revisão.</p>
    <div className="notice" style={{ background: '#f7f8f9', borderColor: 'var(--border)' }}>
      <Sentence s={s} mode={target} option={option} setOption={setOption} name={name} setName={setName} cleanup={false} setCleanup={() => {}} withName />
    </div>
    <div className="dialog-actions"><button type="button" className="primary">Publicar</button></div>
  </section>;
}
