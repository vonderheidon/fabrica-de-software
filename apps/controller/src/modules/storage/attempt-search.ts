import type { AttemptListQuery } from '#contracts';

export class InvalidAttemptSearch extends Error {}

export interface PreparedAttemptSearch {
  issueNumber: number | null;
  titleNeedle: string | null;
  fromMs: number | null;
  untilMs: number | null;
  timeZone: string | null;
}

type CivilParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };

function invalid(message: string): never {
  throw new InvalidAttemptSearch(message);
}

function parseCalendarDate(value: string): number {
  const match = /^(\d{4,5})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return invalid('Use datas no formato AAAA-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || year > 10000) return invalid('A data informada não existe no calendário.');
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return invalid('A data informada não existe no calendário.');
  }
  return date.getTime();
}

function nextCalendarDate(value: string): string {
  const date = new Date(parseCalendarDate(value));
  date.setUTCDate(date.getUTCDate() + 1);
  const year = date.getUTCFullYear();
  if (year > 10000) return invalid('A data final ultrapassa o intervalo suportado.');
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function utcEpoch(parts: CivilParts): number {
  const value = new Date(0);
  value.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  value.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return value.getTime();
}

function readCivilParts(formatter: Intl.DateTimeFormat, epochMs: number): CivilParts {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    millisecond: Number(parts.fractionalSecond ?? '0'),
  };
}

function civilDate(parts: CivilParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23',
    });
  } catch {
    return invalid('Informe um fuso horário IANA válido.');
  }
}

function startOfCivilDay(value: string, formatter: Intl.DateTimeFormat): number {
  const naiveStart = parseCalendarDate(value);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 3) {
    const instant = naiveStart + hours * 60 * 60 * 1000;
    offsets.add(utcEpoch(readCivilParts(formatter, instant)) - instant);
  }
  const starts = [...offsets]
    .map(offset => naiveStart - offset)
    .filter(instant => civilDate(readCivilParts(formatter, instant)) === value)
    .sort((left, right) => left - right);
  if (starts.length === 0) return invalid('A data informada não existe nesse fuso horário.');
  return starts[0]!;
}

export function normalizeAttemptTitle(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\u00df/g, 'ss').replace(/\u03c2/g, '\u03c3').replace(/\u017f/g, 's');
}

export function prepareAttemptSearch(query: AttemptListQuery): PreparedAttemptSearch {
  const hasDateBound = query.dateFrom !== undefined || query.dateTo !== undefined;
  if (hasDateBound && !query.timeZone) return invalid('Informe o fuso horário IANA para filtrar por período.');
  if (query.dateFrom !== undefined) parseCalendarDate(query.dateFrom);
  if (query.dateTo !== undefined) parseCalendarDate(query.dateTo);
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    return invalid('A data inicial deve ser anterior ou igual à data final.');
  }

  const formatter = query.timeZone ? formatterFor(query.timeZone) : null;
  const timeZone = formatter?.resolvedOptions().timeZone ?? null;
  const fromMs = query.dateFrom && formatter ? startOfCivilDay(query.dateFrom, formatter) : null;
  const nextDay = query.dateTo ? nextCalendarDate(query.dateTo) : null;
  const untilMs = nextDay && formatter ? startOfCivilDay(nextDay, formatter) : null;
  const issueNumber = query.issueNumber === undefined ? null : Number(query.issueNumber);
  if (issueNumber !== null && (!Number.isSafeInteger(issueNumber) || issueNumber <= 0)) {
    return invalid('Informe um número de issue inteiro e positivo.');
  }
  return {
    issueNumber,
    titleNeedle: query.issueTitle === undefined ? null : normalizeAttemptTitle(query.issueTitle),
    fromMs,
    untilMs,
    timeZone,
  };
}
