import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Choice = { value: string; label: string; disabled: boolean };
type Props = {
  id?: string;
  value: string;
  children: ReactNode;
  disabled?: boolean;
  required?: boolean;
  onChange?: (event: { currentTarget: { value: string } }) => void;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  loading?: boolean;
  footer?: ReactNode;
};

function choiceText(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? choiceText(child.props.children) : String(child)).join('');
}

function readChoices(children: ReactNode): Choice[] {
  const result: Choice[] = [];
  Children.forEach(children, child => {
    if (!isValidElement<{ value?: string; disabled?: boolean; children?: ReactNode }>(child)) return;
    if (child.type === 'option') result.push({ value: String(child.props.value ?? ''), label: choiceText(child.props.children), disabled: Boolean(child.props.disabled) });
    else result.push(...readChoices(child.props.children));
  });
  return result;
}

export function CustomSelect({ id, value, children, disabled, required, onChange, searchValue, onSearchChange, searchLabel = 'Buscar opção', loading, footer, ...aria }: Props) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 320, transform: 'none' });
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const choices = readChoices(children);
  const query = searchValue ?? search;
  const filtered = onSearchChange ? choices : choices.filter(choice => choice.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const selected = choices.find(choice => choice.value === value);

  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function changeSearch(next: string) { setSearch(next); onSearchChange?.(next); }

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      // Fixed coordinates inherit CSS zoom; client rectangles already include it.
      let scale = 1;
      for (let element: HTMLElement | null = trigger.current; element; element = element.parentElement) scale *= Number.parseFloat(getComputedStyle(element).zoom) || 1;
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const height = Math.min(320, Math.max(100, below >= 220 || below >= above ? below : above));
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
      const upwards = below < 220 && below < above;
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) / scale, top: (upwards ? rect.top - 6 : rect.bottom + 6) / scale, width: width / scale, maxHeight: height / scale, transform: upwards ? 'translateY(-100%)' : 'none' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  return <span className="custom-select" ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !disabled) {
      event.preventDefault();
      if (!open) { changeSearch(''); setOpen(true); return; }
      const controls = Array.from(popup.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? []);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      controls[(index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length]?.focus();
    }
  }}>
    <button {...aria} ref={trigger} id={controlId} role="combobox" type="button" className="custom-select-trigger" data-value={value} disabled={disabled} aria-invalid={invalid && !value ? true : aria['aria-invalid']} aria-expanded={open} aria-controls={open ? `${controlId}-popup` : undefined} aria-haspopup="dialog" aria-required={required} onClick={event => { event.preventDefault(); if (!open) changeSearch(''); setOpen(current => !current); }}>
      <span>{selected?.label ?? 'Selecione…'}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {required && <input className="custom-select-validation" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={value} onChange={() => {}} onInvalid={event => {
      event.preventDefault(); setInvalid(true);
      const firstInvalid = event.currentTarget.form?.querySelector(':invalid');
      if (!firstInvalid || firstInvalid === event.currentTarget) { trigger.current?.focus(); changeSearch(''); setOpen(true); }
    }} />}
    {open && !disabled && <span ref={popup} id={`${controlId}-popup`} className="custom-select-popup" role="dialog" aria-label={searchLabel} style={position}>
      <span className="custom-select-search-label" id={`${controlId}-search-label`}>{searchLabel}</span>
      <input autoFocus id={`${controlId}-search`} aria-labelledby={`${controlId}-search-label`} placeholder="Digite para buscar" value={query} onChange={event => changeSearch(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
      <span className="custom-select-options">
        {filtered.map(choice => <button type="button" key={choice.value} data-value={choice.value} disabled={choice.disabled} aria-pressed={choice.value === value} onClick={event => { event.preventDefault(); onChange?.({ currentTarget: { value: choice.value } }); setInvalid(false); close(true); }}>{choice.label}</button>)}
        {loading && <span className="custom-select-notice" role="status">Consultando opções…</span>}
        {!loading && filtered.length === 0 && <span className="custom-select-notice" role="status">Nenhuma opção encontrada.</span>}
        {footer}
      </span>
    </span>}
  </span>;
}
