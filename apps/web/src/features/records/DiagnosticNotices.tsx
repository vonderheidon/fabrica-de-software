import type { HttpContextDiagnostic, HttpDiagnosticReport } from '#contracts';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { diagnosticCopyFor } from '../../app/operator-language.js';

function conditionKey(item: HttpContextDiagnostic): string {
  const facts = item.facts;
  // A cause belongs to its domain condition and resource, never to wording alone.
  return JSON.stringify([item.check, item.code, item.cause, item.recovery, facts.expected_account_id,
    facts.observed_account_id, facts.project_id, facts.creation_id, facts.attempt_id, facts.expected_host, facts.observed_host]);
}
export function CurrentDiagnosticNotices({ items, previous, projectId, inProjectConfiguration = false }: { items: readonly HttpContextDiagnostic[]; previous: boolean; projectId: string | null; inProjectConfiguration?: boolean }) {
  const unique = new Map<string, HttpContextDiagnostic>();
  const emphasis = { passed: 0, unavailable: 1, blocked: 2 } as const;
  for (const item of items) {
    const key = conditionKey(item);
    const prior = unique.get(key);
    // Consolidate presentation only; keep any reported restriction visible.
    if (!prior || emphasis[item.state] >= emphasis[prior.state]) unique.set(key, item);
  }
  return <>{[...unique].map(([key, item]) => <OperatorDiagnosticCard key={key} code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} previous={previous} projectId={projectId} inProjectConfiguration={inProjectConfiguration} />)}</>;
}
export function DiagnosticHistory({ reports, compact = false }: { reports: readonly HttpDiagnosticReport[]; compact?: boolean }) {
  const groups = new Map<string, { item: HttpContextDiagnostic; occurrences: { at: number; state: string }[] }>();
  for (const report of reports) {
    const seen = new Set<string>();
    for (const item of report.diagnostics) {
      const key = conditionKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? { item, occurrences: [] };
      group.occurrences.push({ at: report.created_at_ms, state: item.state });
      groups.set(key, group);
    }
  }
  return <section aria-label="Observações anteriores">
    {!compact && reports.map((report) => <p className="muted" key={report.operation_id}>Verificação anterior · <OperatorState value={report.state} /> · <time dateTime={new Date(report.created_at_ms).toISOString()}>{new Date(report.created_at_ms).toLocaleString('pt-BR')}</time></p>)}
    {[...groups].map(([key, { item, occurrences }]) => {
      const copy = diagnosticCopyFor(item.code, item.state, item.cause, item.recovery);
      return <details className="diagnostic-report is-previous" key={key}><summary>Observação anterior · {copy.title} · {occurrences.length} {occurrences.length === 1 ? 'ocorrência' : 'ocorrências'} · <time dateTime={new Date(occurrences[0]!.at).toISOString()}>{new Date(occurrences[0]!.at).toLocaleString('pt-BR')}</time> · <OperatorState value={occurrences[0]!.state} /></summary>
        <p>{copy.cause}</p>
        {occurrences.map((occurrence, index) => <p key={index}><time dateTime={new Date(occurrence.at).toISOString()}>{new Date(occurrence.at).toLocaleString('pt-BR')}</time> · <OperatorState value={occurrence.state} /> · anterior</p>)}
      </details>;
    })}
  </section>;
}
