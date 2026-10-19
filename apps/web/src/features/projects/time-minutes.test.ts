import { describe, expect, it } from 'vitest';
import { formatMinuteValue, parseMinutes, presentMillisecondsAsMinutes, resolveMinuteDraft } from './time-minutes.js';

describe('exact minute conversion', () => {
  it.each([
    ['2', 120_000],
    ['5', 300_000],
    ['30', 1_800_000],
    ['0,5', 30_000],
    ['2.5', 150_000],
    ['0,00005', 3],
  ])('converts %s minutes to %i integer milliseconds', (minutes, expected) => {
    expect(parseMinutes(minutes)).toEqual({ valid: true, milliseconds: expected });
  });

  it.each([
    ['0', 'Informe um valor em minutos maior que zero.'],
    ['-1', 'Informe um valor em minutos maior que zero.'],
    ['texto', 'Informe os minutos com vírgula ou ponto decimal, sem separador de milhar.'],
    ['1.000.000', 'Informe os minutos com vírgula ou ponto decimal, sem separador de milhar.'],
    ['0,000001', 'Este valor em minutos não corresponde a um número inteiro de milissegundos.'],
    ['35792', 'Esse valor em minutos ultrapassa o máximo permitido.'],
  ])('rejects %s with a minute-specific validation message', (minutes, message) => {
    expect(parseMinutes(minutes)).toEqual({ valid: false, message });
  });

  it('accepts representable values near the supported millisecond bounds', () => {
    expect(parseMinutes('0,00005')).toEqual({ valid: true, milliseconds: 3 });
    expect(parseMinutes('35791,3941')).toEqual({ valid: true, milliseconds: 2_147_483_646 });
  });
});

describe('minute presentation and round-trip', () => {
  it('shows exact values without a precision marker', () => {
    expect(presentMillisecondsAsMinutes(15_000)).toEqual({ text: '0,25', approximate: false });
    expect(formatMinuteValue(15_000)).toBe('0,25 min');
  });

  it.each([
    [1, '0,0000166667'],
    [2_147_483_647, '35791,3941166667'],
  ])('marks %i ms as approximate at ten decimal places', (milliseconds, text) => {
    expect(presentMillisecondsAsMinutes(milliseconds)).toEqual({ text, approximate: true });
    expect(formatMinuteValue(milliseconds)).toBe(`${text} min · Valor aproximado`);
  });

  it.each([1, 2_147_483_647])('keeps the original %i ms value through blur and an edit/undo round-trip', (milliseconds) => {
    const initial = presentMillisecondsAsMinutes(milliseconds).text;
    expect(resolveMinuteDraft(initial, initial, milliseconds)).toEqual({ valid: true, milliseconds });
    const intermediate = milliseconds === 1 ? '0,00005' : '30';
    const edited = resolveMinuteDraft(intermediate, initial, milliseconds);
    expect(edited).toEqual({ valid: true, milliseconds: milliseconds === 1 ? 3 : 1_800_000 });
    expect(resolveMinuteDraft(initial, initial, milliseconds)).toEqual({ valid: true, milliseconds });
  });
});
