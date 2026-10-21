export type MinuteParseResult =
  | { valid: true; milliseconds: number }
  | { valid: false; message: string };

export type MinutePresentation = { text: string; approximate: boolean };

const millisecondsPerMinute = 60_000n;
const displayScale = 10n ** 10n;

export function parseMinutes(text: string, allowZero = false, maximumMilliseconds = 2_147_483_647): MinuteParseResult {
  const value = text.trim();
  if (value.startsWith('-')) return { valid: false, message: 'Informe um valor em minutos maior que zero.' };
  if (value.length === 0 || value.length > 64) {
    return { valid: false, message: 'Informe os minutos com vírgula ou ponto decimal, sem separador de milhar.' };
  }

  const match = /^(\d+)(?:[.,](\d+))?$/.exec(value);
  if (!match) return { valid: false, message: 'Informe os minutos com vírgula ou ponto decimal, sem separador de milhar.' };

  const whole = match[1];
  if (whole === undefined) return { valid: false, message: 'Informe um valor em minutos maior que zero.' };
  const fraction = match[2] ?? '';
  const denominator = 10n ** BigInt(fraction.length);
  const minuteNumerator = BigInt(whole) * denominator + BigInt(fraction || '0');
  const millisecondNumerator = minuteNumerator * millisecondsPerMinute;

  if (millisecondNumerator % denominator !== 0n) {
    return { valid: false, message: 'Este valor em minutos não corresponde a um número inteiro de milissegundos.' };
  }

  const milliseconds = millisecondNumerator / denominator;
  if (milliseconds === 0n && !allowZero) return { valid: false, message: 'Informe um valor em minutos maior que zero.' };
  if (milliseconds > BigInt(maximumMilliseconds)) {
    return { valid: false, message: 'Esse valor em minutos ultrapassa o máximo permitido.' };
  }

  return { valid: true, milliseconds: Number(milliseconds) };
}

export function presentMillisecondsAsMinutes(milliseconds: number): MinutePresentation {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new RangeError('Milliseconds must be a non-negative safe integer.');
  }

  const scaledNumerator = BigInt(milliseconds) * displayScale;
  const truncated = scaledNumerator / millisecondsPerMinute;
  const remainder = scaledNumerator % millisecondsPerMinute;
  const rounded = remainder * 2n >= millisecondsPerMinute ? truncated + 1n : truncated;
  const whole = rounded / displayScale;
  const fraction = (rounded % displayScale).toString().padStart(10, '0').replace(/0+$/, '');

  return {
    text: fraction ? `${whole},${fraction}` : whole.toString(),
    approximate: remainder !== 0n,
  };
}

export function resolveMinuteDraft(text: string, initialText: string, initialMilliseconds: number, allowZero = false, maximumMilliseconds = 2_147_483_647): MinuteParseResult {
  return text === initialText ? { valid: true, milliseconds: initialMilliseconds } : parseMinutes(text, allowZero, maximumMilliseconds);
}

export function formatMinuteValue(milliseconds: number): string {
  const value = presentMillisecondsAsMinutes(milliseconds);
  return `${value.text} min${value.approximate ? ' · Valor aproximado' : ''}`;
}
