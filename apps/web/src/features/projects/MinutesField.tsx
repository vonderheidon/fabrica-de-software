import { useEffect, useRef, useState } from 'react';
import { presentMillisecondsAsMinutes, resolveMinuteDraft } from './time-minutes.js';
import { FieldHelp } from './FieldHelp.js';

type Props = {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  allowZero?: boolean;
  maximumMilliseconds?: number;
  onChange: (milliseconds: number) => void;
  onValidityChange: (message: string | null) => void;
};

export function MinutesField({ id, label, value, disabled = false, allowZero = false, maximumMilliseconds = 2_147_483_647, onChange, onValidityChange }: Props) {
  const initialPresentation = presentMillisecondsAsMinutes(value);
  const initialValueRef = useRef(value);
  const initialTextRef = useRef(initialPresentation.text);
  const valueRef = useRef(value);
  const [text, setText] = useState(initialPresentation.text);
  const [error, setError] = useState<string | null>(null);
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  useEffect(() => {
    if (valueRef.current === value) return;
    valueRef.current = value;
    const next = presentMillisecondsAsMinutes(value);
    initialValueRef.current = value;
    initialTextRef.current = next.text;
    setText(next.text);
    setError(null);
    onValidityChange(null);
  }, [onValidityChange, value]);

  function validate(nextText: string): ReturnType<typeof resolveMinuteDraft> {
    const result = resolveMinuteDraft(nextText, initialTextRef.current, initialValueRef.current, allowZero, maximumMilliseconds);
    const message = result.valid ? null : result.message;
    setError(message);
    onValidityChange(message);
    return result;
  }

  function handleBlur(): void {
    const result = validate(text);
    if (result.valid && result.milliseconds !== initialValueRef.current) onChange(result.milliseconds);
  }

  const presentation = presentMillisecondsAsMinutes(value);
  const showApproximation = presentation.approximate && text === initialTextRef.current;
  const describedBy = [helpId, showApproximation ? noteId : null, error ? errorId : null]
    .filter((item): item is string => item !== null)
    .join(' ') || undefined;

  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <span className="input-with-unit">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={64}
        value={text}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => {
          const nextText = event.currentTarget.value;
          setText(nextText);
          validate(nextText);
        }}
        onBlur={handleBlur}
      />
      <small>min</small>
    </span>
    <FieldHelp id={helpId} label={label} />
    {showApproximation && <small id={noteId} className="muted">Valor aproximado; o inteiro salvo será preservado enquanto o texto exibido não mudar.</small>}
    {error && <span id={errorId} className="error" role="alert">{error}</span>}
  </div>;
}
