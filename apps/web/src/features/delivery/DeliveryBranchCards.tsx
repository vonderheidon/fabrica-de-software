import { useId, type ReactNode } from 'react';

export type DeliveryBranchKind = 'existing' | 'new';
export interface BranchNameField { value: string; onChange: (value: string) => void; notice?: { tone: 'warn' | 'info'; text: string } | null }

/** The two Branch de entrega options, each saying what happens in the Pasta do projeto. */
export function DeliveryBranchCards({ value, onChange, baseBranch, prLocked = false, disabled = false, label = 'Branch de entrega', name }: {
  value: DeliveryBranchKind; onChange: (value: DeliveryBranchKind) => void; baseBranch: string; prLocked?: boolean; disabled?: boolean; label?: string;
  name?: BranchNameField;
}) {
  const group = useId();
  const nameId = `${group}-name`;
  const card = (kind: DeliveryBranchKind, title: string, effect: ReactNode, extra?: ReactNode) => {
    const unavailable = disabled || (kind === 'existing' && prLocked);
    return <div className="delivery-branch-card" data-selected={value === kind} aria-disabled={unavailable}>
      <label className="delivery-branch-card-title"><input type="radio" name={group} value={kind} checked={value === kind} disabled={unavailable} onChange={() => onChange(kind)} /><b>{title}</b></label>
      <span className="muted">{effect}</span>
      {extra}
    </div>;
  };
  return <fieldset className="delivery-branch-cards" disabled={disabled}>
    <legend>{label}</legend>
    {card('existing', 'Branch em checkout', 'O commit entra na branch em checkout na Pasta do projeto e os arquivos da pasta são atualizados.',
      prLocked ? <span className="muted">Indisponível no PR: a PR sempre parte de uma branch nova.</span> : null)}
    {card('new', 'Branch nova', <>Cria a branch a partir da ponta de <code>{baseBranch}</code>, faz checkout dela na pasta e grava o commit.</>,
      value === 'new' && name ? <span className="delivery-branch-name">
        <label htmlFor={nameId}>Nome da branch nova</label>
        <input id={nameId} value={name.value} disabled={disabled} onChange={event => name.onChange(event.currentTarget.value)} />
        {name.notice && <span className={name.notice.tone === 'warn' ? 'delivery-branch-warn' : 'delivery-branch-info'} role={name.notice.tone === 'warn' ? 'alert' : 'status'}>{name.notice.text}</span>}
      </span> : null)}
  </fieldset>;
}

/** What approving does to the Pasta do projeto, in the operator's words. */
export function deliveryPreview(mode: 'commit' | 'pr', kind: DeliveryBranchKind, branch: string, baseBranch: string): ReactNode {
  return <>
    {kind === 'new' ? <>Cria <code>{branch}</code> a partir de <code>{baseBranch}</code>, faz checkout e grava o commit.</> : <>Grava o commit em <code>{branch}</code> e atualiza os arquivos.</>}
    {mode === 'pr' && <> Depois abre a PR para <code>{baseBranch}</code>.</>}
  </>;
}
