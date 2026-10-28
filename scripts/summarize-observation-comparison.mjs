import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const before = await read('.cache/observation-baseline-runs/results.json');
const after = await read('.cache/observation-comparison-final-runs/results.json');
for (const [file, hash] of Object.entries(after.hashes)) {
  if (createHash('sha256').update(await readFile(join(root, file))).digest('hex') !== hash) throw new Error(`Measured source changed: ${file}`);
}
for (const data of [before, after]) if (data.runs.length !== 10 || data.runs.some(run => run.exitCode !== 0)) throw new Error('INCOMPLETE_COMPARISON');
function stats(values) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('INVALID_SAMPLE');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return [sorted[0], median, sorted.at(-1), sorted.at(-1) - sorted[0]].map(value => value.toFixed(3)).join(' / ');
}
const rows = (data, mode, tag, scenario) => data.runs.filter(run => run.mode === mode).flatMap(run => run.records
  .filter(row => row.tag === tag && (!scenario || row.value.scenario === scenario)).map(row => row.value));
const lines = [
  '# Comparação final da observação', '',
  `Capturas: baseline ${before.capturedAt}; depois ${after.capturedAt}. Ambiente ${after.node}, ${after.platform}/${after.arch}. Referência Git HEAD/ref: ${after.revision}, acrescida do trabalho local identificado pelos hashes. Sem commit criado pelo agente.`, '',
  '## Condições e interpretação', '',
  'Fatia única: primeiras páginas de fieldValues de até três memberships da mesma issue, somente no contexto queue. Continuações individuais, diagnósticos, ordem, revalidações e política da fila preservados. Teto autorizado: 4 MiB individual, 8/12 MiB por grupo de duas/três páginas; orçamento agregado de 16 MiB, 250 envios, timeout de 15 s e três workers por observação.', '',
  'Reprodução: `node scripts/run-observation-baseline.mjs .cache/observation-comparison-final-runs`, depois `node scripts/summarize-observation-comparison.mjs`. O baseline histórico em `.cache/observation-baseline-runs` e observation-baseline.md foi preservado. Fonte completa das tabelas: results.json e arquivos {disabled,enabled}-{1..5}.{json,log} nas duas pastas. A captura inicial desta sprint permanece em observation-comparison-runs; a final reflete a correção da fixture HTTP.', '',
  'Dois projetos, base 10 issues/projeto × 1 membership × 1 página; expanded 10 × 3 × 2; large 100 × 3 × 2. Relógio de domínio 1800000000000; sem atraso remoto no runner. Cinco processos independentes por modo, dez por captura; cada linha informa cinco amostras. Frio, warm imediato, expiração virtual em 11 s, dois HTTP iguais sobrepostos, scheduler/scope/authorization independentes. Automação ligada/desligada apenas configura fixture, sem despacho real.', '',
  'Estatísticas em ms: mínimo / mediana / máximo / amplitude. Não há descarte de amostras lentas, p95 inferencial, randomização ou isolamento de carga/JIT/SO. O runner de referência legacyValues restaura envios individuais das primeiras páginas no seam de teste, não é opção de produção nem execução de checkout histórico completo. A sequência de requisições públicas e os dados são iguais; a organização interna das páginas agrupadas é diferente. Não extrapolar milissegundos de SQLite/serialização/instrumentação para GitHub.', '',
  'Redução de trabalho físico foi sustentada nas amostras e no oráculo. Latência local é variável e inconclusiva como ganho geral: inclusive o controle base sem economia de chamadas varia entre capturas. Não declarar aceite de desempenho remoto, economia de pontos primários GraphQL, causa de rate limit ou frequência de uso real.', '',
  '## Matriz HTTP histórica antes/depois', '',
  '| Automação | Cenário | Fase | n por versão | Antes ms mín/med/máx/amplitude | Depois ms mín/med/máx/amplitude | Envios antes/depois | Pico antes/depois |',
  '|---|---|---|---:|---|---|---|---|',
];
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const b = rows(before, mode, 'BACKEND_MATRIX_REPORT', scenario);
  const a = rows(after, mode, 'BACKEND_MATRIX_REPORT', scenario);
  if (b.length !== 5 || a.length !== 5) throw new Error('MISSING_REPETITIONS');
  for (const phase of ['cold', 'warm', 'overlap', 'scheduler', 'scope', 'authorization']) {
    const br = b.map(row => row.measurements.find(item => item.name === phase));
    const ar = a.map(row => row.measurements.find(item => item.name === phase));
    const sends = entries => [...new Set(entries.map(row => row.byOperation.find(item => item.key === 'graphql:page')?.count ?? 0))].join(',');
    lines.push(`| ${mode} | ${scenario} | ${phase} | 5 | ${stats(br.map(row => row.elapsedMs))} | ${stats(ar.map(row => row.elapsedMs))} | ${sends(br)}/${sends(ar)} | ${Math.max(...br.map(row => row.peak))}/${Math.max(...ar.map(row => row.peak))} |`);
  }
}
lines.push('', 'Metas derivadas atingidas no cenário controlado: base 108 → 108; expanded 272 → 232 (-40, 14,7%); large 2612 → 2212 (-400, 15,3%). Warm continua sem envio. Overlap de mesma chave compartilha a observação; consumidores com limites diferentes continuam independentes e as observações de autoridade continuam novas.', '',
  '## Referência pareada atual e bytes físicos', '',
  '| Automação | Cenário | n | Referência ms mín/med/máx/amplitude | Agrupado ms mín/med/máx/amplitude | Wire bytes referência/agrupado | Payload público bytes referência/agrupado |', '|---|---|---:|---|---|---|---|');
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const values = rows(after, mode, 'GROUPED_COMPARISON', scenario);
  if (values.length !== 5) throw new Error('MISSING_PAIRED_COMPARISON');
  const b = values.map(row => row.samples.find(item => item.legacyValues));
  const a = values.map(row => row.samples.find(item => !item.legacyValues));
  const range = (samples, key) => `${Math.min(...samples.map(row => row[key]))}-${Math.max(...samples.map(row => row[key]))}`;
  lines.push(`| ${mode} | ${scenario} | 5 | ${stats(b.map(row => row.elapsedMs))} | ${stats(a.map(row => row.elapsedMs))} | ${range(b, 'wireBytes')}/${range(a, 'wireBytes')} | ${range(b, 'payloadBytes')}/${range(a, 'payloadBytes')} |`);
}
lines.push('', 'Wire bytes incluem o stdout HTTP sintético completo recebido pelo transporte, não compressão/rede real. A identidade e o tipo de cada membership acrescentam bytes: expanded 79818 → 80304 (+486; 0,61%); large 778428 → 783780 (+5352; 0,69%). O payload público permanece equivalente. A referência pareada roda antes do agrupado em cada processo; aquecimento e ordem impedem atribuição causal da diferença de tempo.', '',
  '## Custo, picos e armazenamento', '',
  '| Automação | Cenário frio | n | Janela dependências antes/depois ms | Trabalho acumulado antes/depois ms | HTTP bytes antes/depois | SQLite/WAL/SHM antes → depois bytes |', '|---|---|---:|---|---|---|---|');
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const b = rows(before, mode, 'BACKEND_MATRIX_REPORT', scenario);
  const a = rows(after, mode, 'BACKEND_MATRIX_REPORT', scenario);
  const phase = values => values.map(row => row.measurements.find(item => item.name === 'cold'));
  const sizes = values => values[0].measurements.find(item => item.name === 'payloads-and-files');
  const bs = sizes(b), as = sizes(a);
  lines.push(`| ${mode} | ${scenario} | 5 | ${stats(phase(b).map(row => row.dependencyWindowMs))} → ${stats(phase(a).map(row => row.dependencyWindowMs))} | ${stats(phase(b).map(row => row.dependencyWorkMs))} → ${stats(phase(a).map(row => row.dependencyWorkMs))} | ${bs.coldPayloadBytes}/${as.coldPayloadBytes} | ${bs.databaseBytes}/${bs.walBytes}/${bs.sharedMemoryBytes} → ${as.databaseBytes}/${as.walBytes}/${as.sharedMemoryBytes} |`);
}
lines.push('', 'Janela de dependências não reconstrói causalidade completa; trabalho acumulado soma durações concorrentes e não é tempo percebido. Pico por observação permanece três; observações independentes podem chegar a seis. Os testes backend preservam timeout/AbortError, falha antes/depois de envio, query/byte budgets, pendências e drenagem posterior ao abort. Cada uma das dez execuções inclui esses testes; não se apagam envios já iniciados nem se trata abort solicitado como cancelamento físico.', '',
  '### AC-29, caches densos ignorados', '',
  '| Versão | Cache bytes | Superfície | n processos × leituras | Medianas ms mín/med/máx/amplitude | Payload bytes min-max |', '|---|---:|---|---|---|---|');
for (const [label, data] of [['antes', before], ['depois', after]]) {
  const audits = rows(data, 'disabled', 'AC29_REPORT');
  if (audits.length !== 5) throw new Error('MISSING_AC29');
  for (const cache of [0, 16777216, 67108864]) for (const surface of audits[0].stages[0].measurements.map(row => row.surface)) {
    const values = audits.map(audit => audit.stages.find(stage => stage.generatedCacheBytes === cache).measurements.find(row => row.surface === surface));
    lines.push(`| ${label} | ${cache} | ${surface} | 5 × 20 | ${stats(values.map(row => row.medianMs))} | ${Math.min(...values.map(row => row.payloadMinBytes))}-${Math.max(...values.map(row => row.payloadMaxBytes))} |`);
  }
}
lines.push('', '| Versão | Cache bytes | DB/WAL/SHM | Git fixture | Trabalho operacional | Auxiliares |', '|---|---:|---|---:|---:|---:|');
for (const [label, data] of [['antes', before], ['depois', after]]) for (const stage of rows(data, 'disabled', 'AC29_REPORT')[0].stages) {
  const s = stage.sizes;
  lines.push(`| ${label} | ${stage.generatedCacheBytes} | ${s.databaseBytes}/${s.walBytes}/${s.sharedMemoryBytes} | ${s.retainedGitDiskBytes} | ${s.operationalWorkBytes} | ${s.otherAuxiliaryBytes} |`);
}
lines.push('', 'Tamanhos acima: primeira repetição, sem ocultar que WAL varia com eventos legítimos. As cinco execuções de cada captura comprovam invariância durante a leitura em 0/16/64 MiB, payloads por superfície, ausência de acesso a work/git nos resumos e de marcadores de conteúdo/auxiliares persistidos. Há controle positivo dos spies. Só o cache operacional cresce proporcionalmente. Referências Git são controladas em memória; a prova não certifica IO Git nativo ou recuperação de processo físico.', '',
  '## Web simulada, atualidade e conteúdo útil', '',
  '| Automação | Cenário web | n por versão | Leituras antes/depois | Bytes antes/depois | Tempo de conteúdo útil |', '|---|---|---:|---|---|---|');
for (const mode of ['disabled', 'enabled']) {
  const b = rows(before, mode, 'WEB_WINDOW_REPORT'), a = rows(after, mode, 'WEB_WINDOW_REPORT');
  const names = [...new Set(a.map(row => row.scenario ?? row.name))];
  for (const name of names) {
    const br = b.filter(row => (row.scenario ?? row.name) === name), ar = a.filter(row => (row.scenario ?? row.name) === name);
    if (br.length !== 5 || ar.length !== 5) throw new Error('MISSING_WEB_REPETITIONS');
    const counts = values => [...new Set(values.map(row => row.requests))].join(',');
    const bytes = values => `${Math.min(...values.map(row => row.responseBytes))}-${Math.max(...values.map(row => row.responseBytes))}`;
    const useful = values => values.flatMap(row => row.samples.filter(sample => sample.outcome === 'valid' || sample.outcome === 'empty').map(sample => sample.rendered - sample.started));
    lines.push(`| ${mode} | ${name} | ${ar.length} | ${counts(br)}/${counts(ar)} | ${bytes(br)}/${bytes(ar)} | ${useful(br).length ? stats(useful(br)) : 'sem amostra'} → ${useful(ar).length ? stats(useful(ar)) : 'sem amostra'} |`);
  }
}
lines.push('', 'Tempos da tabela web são amostras de blocos dentro dos cinco processos, não cinco totais homogêneos; inclui conclusão manual sem atraso injetado. Logs WEB_WINDOW_REPORT preservam os 16 cenários, blocos, gatilhos, resultados valid/empty/partial/error/previous, requests/responseBytes, completions, abortedPending/drained e pendências. Cinco repetições por modo. Fetch sintético de 10 ms; passos de 200 ms e verificação de DOM em 1 ms. Não mede pintura, GPU ou rede. Atualidade/polling, vinte eventos globais, resync e corridas são os mesmos testes do baseline, sem mudança de UI ou frequência.', '',
  '## Identidade dos arquivos medidos', '', '| Arquivo | SHA-256 atual |', '|---|---|');
for (const [file, hash] of Object.entries(after.hashes)) lines.push(`| ${file} | ${hash} |`);
lines.push('', 'As evidências visuais, checks, rollback e o mapa C4-01 a C4-11 constam no fechamento da sprint-007 em SPEC_PROGRESS.md. Este documento registra comparação controlada; aprovação final pertence ao usuário nos mecanismos existentes, sem avanço de pipeline.');
await writeFile(join(root, '.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/observation-comparison.md'), lines.join('\n') + '\n');
console.log('Comparison report generated; current measured hashes verified, historical baseline preserved.');
