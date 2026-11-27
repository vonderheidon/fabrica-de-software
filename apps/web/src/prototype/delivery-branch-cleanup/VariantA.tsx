// PROTÓTIPO DESCARTÁVEL — Variante A: campos soltos no formulário atual, sem bloco próprio.
import { useEffect, useState } from 'react';
import { finalBranch, fixture, modeLabel, prepBlockers } from './scenario.js';
import type { BranchOption, Scenario } from './scenario.js';

export function VariantA({ s }: { s: Scenario }) {
  return <>
    <ProjectConfig s={s} />
    <Prepare s={s} />
    <AttemptDetail s={s} />
    <IcrElevation s={s} />
  </>;
}

function ProjectConfig({ s }: { s: Scenario }) {
  const [branch, setBranch] = useState<BranchOption>(s.projectBranchDefault);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setBranch(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  return <section className="card form-section proto-surface">
    <span className="eyebrow">Configurar projeto</span><h2>{fixture.project}</h2>
    <div className="form-grid">
      <div className="form-field field-full"><label>Pasta do projeto</label><div className="row"><input style={{ flex: 1 }} defaultValue={fixture.folder} /><button type="button">Selecionar pasta</button></div>
        {s.warning === 'invalid_folder' ? <p className="proto-inline-warn">Esta pasta não é um clone de {fixture.repo}.</p> : <p className="proto-inline-info">Clone de {fixture.repo} · branch atual {fixture.checkedOut}</p>}</div>
      <div className="form-field"><label>Branch base</label><select defaultValue="main"><option>main</option></select></div>
      <div className="form-field"><label>Modo de entrega padrão</label><select defaultValue={s.mode}><option value="icr">ICR</option><option value="commit">Commit</option><option value="pr">PR</option></select></div>
      <div className="form-field"><label>Branch de entrega padrão</label><select value={branch} onChange={e => setBranch(e.currentTarget.value as BranchOption)}><option value="new">Branch nova</option><option value="checkout">Branch em checkout</option></select>
        <p className="proto-inline-info">Vale para Commit. O PR sempre usa branch nova. O nome é sugerido a cada issue no Preparar.</p></div>
      <div className="form-field"><label className="form-check"><input type="checkbox" checked={cleanup} onChange={e => setCleanup(e.currentTarget.checked)} />Remover o ambiente da issue depois da entrega</label>
        <p className="proto-inline-info">Depois de commit confirmado ou PR aberta. Versões aprovadas e evidências ficam guardadas.</p></div>
    </div>
  </section>;
}

function Prepare({ s }: { s: Scenario }) {
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const [name, setName] = useState(fixture.suggested);
  const [cleanup, setCleanup] = useState(s.projectCleanupDefault);
  useEffect(() => { setOption(s.projectBranchDefault); setCleanup(s.projectCleanupDefault); }, [s.projectBranchDefault, s.projectCleanupDefault]);
  const effective: BranchOption = s.mode === 'pr' ? 'new' : option;
  const blockers = prepBlockers(s, effective, name);
  const blocked = blockers.some(b => b.blocks);
  return <section className="card preparation-section proto-surface">
    <span className="eyebrow">Preparar</span><h2>#{fixture.issue.number} · {fixture.issue.title}</h2>
    <div className="form-grid">
      <div className="form-field"><label>Modo de entrega</label><select value={s.mode} disabled><option value={s.mode}>{modeLabel[s.mode]}</option></select></div>
      <div className="form-field"><label>Branch base</label><select defaultValue="main"><option>main</option></select></div>
      {s.mode !== 'icr' && <>
        <div className="form-field"><label>Branch de entrega</label>
          <select value={effective} disabled={s.mode === 'pr'} onChange={e => setOption(e.currentTarget.value as BranchOption)}><option value="new">Branch nova</option><option value="checkout">Branch em checkout ({fixture.checkedOut})</option></select>
          {s.mode === 'pr' && <p className="proto-inline-info">O modo PR sempre cria uma branch nova.</p>}</div>
        {effective === 'new' ? <div className="form-field"><label>Nome da branch nova</label><input value={name} onChange={e => setName(e.currentTarget.value)} />
          {s.warning === 'name_taken_typed' && <p className="proto-inline-warn">Já existe. Escolha outro nome ou use Branch em checkout.</p>}
          {s.warning === 'name_taken_suggested' && <p className="proto-inline-info">Em uso; será usada {fixture.suggestedFree}.</p>}</div>
          : <div className="form-field"><label>Branch em checkout</label><input value={fixture.checkedOut} readOnly /><p className="proto-inline-info">A tentativa parte da ponta desta branch.</p></div>}
      </>}
      <div className="form-field field-full"><label className="form-check"><input type="checkbox" checked={s.mode !== 'icr' && cleanup} disabled={s.mode === 'icr'} onChange={e => setCleanup(e.currentTarget.checked)} />Remover o ambiente depois da entrega</label>
        {s.mode === 'icr' && <p className="proto-inline-info">Indisponível no ICR. Você pode remover manualmente no detalhe da tentativa.</p>}</div>
    </div>
    {blockers.map(b => <div key={b.title} className={`notice ${b.blocks ? 'proto-blocker' : ''}`} role={b.blocks ? 'alert' : 'status'}><b>{b.title}</b><p>{b.text}</p></div>)}
    <dl className="preparation-facts">
      <div><dt>Pasta do projeto</dt><dd className="mono">{fixture.folder}</dd></div>
      <div><dt>Branch de entrega</dt><dd>{s.mode === 'icr' ? 'Sem commit (ICR)' : `${effective === 'new' ? 'Nova' : 'Em checkout'}: ${finalBranch(s, effective, name)}`}</dd></div>
      <div><dt>Limpeza do ambiente</dt><dd>{s.mode !== 'icr' && cleanup ? 'Automática após a entrega' : 'Manter ambiente'}</dd></div>
    </dl>
    <div className="dialog-actions"><button type="button" className="primary" disabled={blocked}>Revisar e autorizar</button></div>
  </section>;
}

function AttemptDetail({ s }: { s: Scenario }) {
  const branch = s.mode === 'icr' ? null : finalBranch(s, s.mode === 'pr' ? 'new' : s.projectBranchDefault, fixture.suggested);
  return <section className="card proto-surface">
    <span className="eyebrow">Detalhe da tentativa</span><h2>#{fixture.issue.number} · {fixture.issue.title}</h2>
    {s.warning === 'dirty' && s.mode === 'commit' && <div className="queue-error" role="alert"><p><strong>Commit bloqueado:</strong> a Pasta do projeto tem alterações não commitadas.</p><ul><li className="mono">src/app.tsx</li><li className="mono">package.json</li></ul></div>}
    <div className="delivery-result delivery-result-complete">
      <div className="delivery-result-heading"><div><span className="eyebrow">Resultado da versão selecionada</span><h3>{s.mode === 'icr' ? 'ICR aprovado' : 'Entrega concluída'}</h3></div>{s.mode === 'pr' && <a className="delivery-result-link" href="#">Ver PR</a>}</div>
      <dl className="delivery-result-facts">
        <div><dt>Modo autorizado</dt><dd>{modeLabel[s.mode]}</dd></div>
        <div><dt>Critérios comprovados</dt><dd>4 de 4</dd></div>
        <div><dt>Revisão independente</dt><dd>Aprovada nesta versão</dd></div>
        <div className="delivery-fact-wide"><dt>Pasta do projeto</dt><dd>{fixture.folder}</dd></div>
        {branch && <div className="delivery-fact-wide"><dt>Branch usada</dt><dd>{branch}</dd></div>}
        {s.mode !== 'icr' && <div><dt>Commit confirmado</dt><dd><code>{fixture.commit}</code></dd></div>}
        <div><dt>Limpeza do ambiente</dt><dd>{cleanupText(s)}</dd></div>
      </dl>
    </div>
    <h3 style={{ marginTop: 22 }}>Recursos da tentativa</h3>
    <div className="line" style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div><b>Ambiente da issue</b><p className="muted" style={{ margin: 0 }}>var/factory/managed/issues/48/workspace</p>
        {s.cleanup === 'pending' && <p className="proto-inline-warn">Limpeza pendente: {fixture.cleanupReason}</p>}</div>
      {s.cleanup !== 'done' ? <button type="button">Remover ambiente</button> : <span className="pill neutral">Removido</span>}
    </div>
  </section>;
}

function cleanupText(s: Scenario): string {
  if (s.cleanup === 'done') return 'Concluída';
  if (s.cleanup === 'pending') return 'Pendente — ver Recursos';
  if (s.cleanup === 'waiting') return 'Após a entrega';
  return 'Não solicitada';
}

function IcrElevation({ s }: { s: Scenario }) {
  const [target, setTarget] = useState<'commit' | 'pr'>('commit');
  const [option, setOption] = useState<BranchOption>(s.projectBranchDefault);
  const effective = target === 'pr' ? 'new' : option;
  return <section className="card proto-surface">
    <span className="eyebrow">Elevação tardia de um ICR</span><h2>Publicar a versão aprovada</h2>
    <div className="form-grid">
      <div className="form-field"><label>Novo modo</label><select value={target} onChange={e => setTarget(e.currentTarget.value as 'commit' | 'pr')}><option value="commit">Commit</option><option value="pr">PR</option></select></div>
      <div className="form-field"><label>Branch de entrega</label><select value={effective} disabled={target === 'pr'} onChange={e => setOption(e.currentTarget.value as BranchOption)}><option value="new">Branch nova</option><option value="checkout">Branch em checkout ({fixture.checkedOut})</option></select></div>
      {effective === 'new' && <div className="form-field"><label>Nome da branch nova</label><input defaultValue={fixture.suggested} /></div>}
    </div>
    <p className="muted">Publica exatamente <code>{fixture.approvedRef}</code>, sem nova revisão. Se a base avançou, entra a rodada de integração.</p>
    <div className="dialog-actions"><button type="button" className="primary">Publicar como {target === 'pr' ? 'PR' : 'Commit'}</button></div>
  </section>;
}
