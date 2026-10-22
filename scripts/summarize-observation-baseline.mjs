import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, '.cache', 'observation-baseline-runs', 'results.json');
const data = JSON.parse(await readFile(source, 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const [file, hash] of Object.entries(data.hashes)) {
  if (createHash('sha256').update(await readFile(join(root, file))).digest('hex') !== hash) throw new Error(`Measured source changed: ${file}`);
}
if (data.runs.length !== 10 || data.runs.some(run => run.exitCode !== 0)) throw new Error('INCOMPLETE_BASELINE');
const stats = values => {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('INVALID_BASELINE_SAMPLE');
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return `${sorted[0].toFixed(3)} / ${median.toFixed(3)} / ${sorted.at(-1).toFixed(3)} / ${(sorted.at(-1) - sorted[0]).toFixed(3)}`;
};
const values = (mode, tag, predicate = () => true) => data.runs.filter(run => run.mode === mode)
  .flatMap(run => run.records.filter(row => row.tag === tag && predicate(row.value)).map(row => row.value));
const lines = [
  '# Baseline C4 anterior à otimização', '',
  `Captura: ${data.capturedAt}. Referência Git lida de HEAD/ref: \`${data.revision}\`; contém trabalho local adicional identificado pelos hashes abaixo.`,
  `Ambiente: ${data.node}, ${data.platform}/${data.arch}; dependências do package-lock existente. Cinco processos independentes por modo, dez execuções ao todo.`,
  `Versões fixadas: better-sqlite3 ${pkg.dependencies['better-sqlite3']}, Fastify ${pkg.dependencies.fastify}, React ${pkg.dependencies.react}, Vitest ${pkg.devDependencies.vitest}, TypeScript ${pkg.devDependencies.typescript}, happy-dom ${pkg.devDependencies['happy-dom']}.`,
  'Fontes vigentes: Decisions/SPEC/plano em `revisao-escopo-20261021/`, D1–D4, F1–F5; SPEC de produto §§8.4/8.5/10.2 e AC-29; GLOSSARY e contrato Maestri/OMP. Não representa aprovação ou avanço do pipeline.', '',
  'Reprodução na raiz canônica: `node scripts/run-observation-baseline.mjs`, depois `node scripts/summarize-observation-baseline.mjs`. Não altera código de produção. Logs e registros privados: `.cache/observation-baseline-runs/{disabled,enabled}-{1..5}.{log,json}` e `results.json`. O relatório não depende da retenção de checkout, índice ou caches.', '',
  '## Condições, amostragem e limites', '',
  '- Dois projetos; base: 10 issues por projeto, uma membership e uma página. Expanded: 10 issues/projeto, três memberships e duas páginas. Large: 100 issues/projeto, três memberships e duas páginas. Conta sintética ACCOUNT_test/synthetic-user; nenhum GitHub, GH nativo, provider ou terminal real.',
  '- Relógio de domínio inicial 1800000000000. Runner GraphQL sintético sem atraso injetado; tempos backend são performance.now da execução instrumentada local, incluindo SQLite e serialização HTTP. Os 5 ms/página virtuais da fixture sem wire não são somados a essas latências.',
  '- Automação global desligada/ligada separadamente; os dois projetos estão habilitados. Pipeline da fixture é fechado antes das medições; scheduler/scope/authorization chamam observe sem despachar tentativa. Não simula execução física de etapas nem efeitos externos.',
  '- Por fixture: cold HTTP limit=25; warm imediato; avanço virtual de 11 s para expirar cache; dois HTTP idênticos sobrepostos; scheduler, scope e authorization independentes. Cada HTTP tem seu span; elapsed do overlap é o término do par, não a soma das durações.',
  '- Cinco totais por cenário/modo: mínimo / mediana / máximo / amplitude (máximo menos mínimo). Sem média como conclusão e sem p95 inferencial com cinco observações. Não há randomização de ordem; JIT, cache do SO, instrumentação e carga concorrente afetam os milissegundos. Não comparar enabled/disabled como efeito causal da automação.',
  '- Web: PrincipalScreen e descendentes reais, happy-dom restrito ao arquivo, fetch sintético de 10 ms, sessão preparada fora da jornada, polling de 15 s, passos de 200 ms e resolução de conteúdo útil de 1 ms após commit via act. AppShell/onboarding/SSE não integram suas contagens. O DOM não mede pintura ou latência de rede.',
  '- Frequência real de abertura, eventos, navegação, projetos/memberships e uso diário: desconhecida. Cenários e prioridades são condicionais ao uso representado. Não há afirmação de causa do bloqueio GitHub relatado nem redução de rate-limit points medida.', '',
  '## HTTP backend e custo atribuído', '',
  '| Automação | Cenário | Fase | n | ms: mín / med / máx / amplitude | Envios GraphQL por observação | Pico físico |',
  '|---|---|---|---:|---|---:|---:|',
];
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const rows = values(mode, 'BACKEND_MATRIX_REPORT', row => row.scenario === scenario);
  if (rows.length !== 5) throw new Error('MISSING_REPETITIONS');
  for (const phase of ['cold', 'warm', 'overlap', 'scheduler', 'scope', 'authorization']) {
    const phases = rows.map(row => row.measurements.find(item => item.name === phase));
    const sends = phases.map(row => row.byOperation.find(item => item.key === 'graphql:page')?.count ?? 0);
    if (new Set(sends).size !== 1) throw new Error('VARIABLE_PHYSICAL_COUNTS');
    lines.push(`| ${mode} | ${scenario} | ${phase} | 5 | ${stats(phases.map(row => row.elapsedMs))} | ${sends[0]} | ${Math.max(...phases.map(row => row.peak))} |`);
  }
}
lines.push('', 'Frio e overlap idêntico usam 108/272/2612 envios para base/expanded/large; warm não envia. Compartilhamento de chave idêntica já existe e não é oportunidade nova. Scope/scheduler/authorization continuam com leituras atuais e não serão fundidos ao cache de exibição.', '',
  '| Automação | Cenário frio | n | HTTP ms: mín / med / máx / amplitude | Janela das dependências ms: mín / med / máx / amplitude | Trabalho acumulado ms: mín / med / máx / amplitude |',
  '|---|---|---:|---|---|---|');
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const rows = values(mode, 'BACKEND_MATRIX_REPORT', row => row.scenario === scenario).map(row => row.measurements.find(item => item.name === 'cold'));
  lines.push(`| ${mode} | ${scenario} | 5 | ${stats(rows.map(row => row.httpMs[0]))} | ${stats(rows.map(row => row.dependencyWindowMs))} | ${stats(rows.map(row => row.dependencyWorkMs))} |`);
}
lines.push('', 'HTTP é o intervalo inclusivo até resposta serializada; a janela de dependências contém lacunas e não reconstrói o grafo causal completo. Trabalho acumulado soma execuções e pode sobrepor concorrência; não equivale à latência percebida. Nenhuma duração é extrapolada para GitHub.', '',
  '| Cenário frio | Identity | ProjectItems | Project | ProjectFields | QueueIssue | Assignees | Blockers | Memberships | ItemValues |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const scenario of ['base', 'expanded', 'large']) {
  const op = values('disabled', 'BACKEND_MATRIX_REPORT', row => row.scenario === scenario)[0].measurements.find(row => row.name === 'cold').operations;
  lines.push(`| ${scenario} | ${['Identity', 'ProjectItems', 'Project', 'ProjectFields', 'QueueIssue', 'Assignees', 'Blockers', 'Memberships', 'ItemValues'].map(key => op[key]).join(' | ')} |`);
}
lines.push('', '| Automação | Cenário | HTTP frio/aquecido (bytes) | Itens na página / total | SQLite / WAL / SHM (bytes) | SQL frio run/all/get | SQL warm run/all/get |', '|---|---|---:|---|---|---|---|');
for (const mode of ['disabled', 'enabled']) for (const scenario of ['base', 'expanded', 'large']) {
  const row = values(mode, 'BACKEND_MATRIX_REPORT', row => row.scenario === scenario)[0];
  const size = row.measurements.find(item => item.name === 'payloads-and-files');
  const sql = entries => ['sql:run', 'sql:all', 'sql:get'].map(key => entries.find(item => item.key === key)?.count ?? 0).join('/');
  lines.push(`| ${mode} | ${scenario} | ${size.coldPayloadBytes}/${size.warmPayloadBytes} | ${size.itemsOnPage}/${row.issues} | ${size.databaseBytes}/${size.walBytes}/${size.sharedMemoryBytes} | ${sql(size.coldSql)} | ${sql(size.warmSql)} |`);
}
lines.push('', 'Entre consumidores de limit=7 e limit=25, duas observações expanded enviam 544 páginas e atingem pico agregado 6 (três workers em cada). São parâmetros públicos diferentes: não se declara equivalência de páginas nem se amplia cache para mascarar a diferença.', '', '## Conteúdo útil e gatilhos web', '',
  '| Automação | Cenário | n | HTTP: mín / med / máx / amplitude | Bytes totais respondidos: mín / med / máx / amplitude | Estados por janela (sucesso/falha/pendente) | Abort em pendência / conclusão posterior |',
  '|---|---|---:|---|---|---|---|');
for (const mode of ['disabled', 'enabled']) {
  const all = values(mode, 'WEB_WINDOW_REPORT');
  for (const scenario of [...new Set(all.map(row => row.scenario))]) {
    const rows = all.filter(row => row.scenario === scenario);
    if (rows.length !== 5) throw new Error('MISSING_WEB_REPETITIONS');
    lines.push(`| ${mode} | ${scenario} | 5 | ${stats(rows.map(row => row.requests))} | ${stats(rows.map(row => row.responseBytes))} | ${rows[0].completions.success}/${rows[0].completions.failure}/${rows[0].completions.pending} | ${rows[0].abortedPending}/${rows[0].drained} |`);
  }
}
lines.push('', 'As contagens de estado acima descrevem a janela antes do unmount: pedidos intencionalmente retidos continuam pendentes e não são excluídos como lentidão. Abort solicitado não significa cancelamento remoto. Timeout/AbortError do runner são exercitados nos testes backend em todas as dez execuções, com contagens separadas e sem apagar custo iniciado; não se mede timeout real de 15 s.', '',
  'Conteúdo útil é verificado no DOM e separado de parcial, erro, conteúdo anterior e vazio completo. Nas leituras automáticas desta fixture, abertura fria e refresh aquecido dão 10 ms simulados (cinco amostras por modo/tela, mínimo=mediana=máximo=10, amplitude=0). Não é uma meta de produção. Casos de liberação manual podem ter duração virtual zero porque o protocolo não injeta espera; não participam de percentis de latência.', '',
  'Dashboard ocioso por 120 s: operation=2, active=2, queue=8, projects=1; Fila=8 queue. Refresh manual acrescenta quatro/uma leituras. Navegação Dashboard → Fila → Tentativas → Dashboard: queue=3, operation=2, attempts=3, projects=3. Vinte eventos em 200 ms: Dashboard=60, Fila=20, histórico filtrado vazio=10. Eventos de outro projeto são pertinentes ao escopo global. Coincidência, resync, settings.updated, erro tardio, paginação e seleção por IDs conservam as verificações da sprint-003.', '',
  '## AC-29: volume, persistência e acesso a conteúdo', '',
  'Cinco execuções independentes da prova existente persistence-maintenance. Cada execução usa 0/16/64 MiB de cache denso ignorado, um warm-up por superfície e 20 leituras HTTP por superfície/volume. Estatísticas abaixo são mínimo/mediana/máximo/amplitude das cinco medianas locais, não de amostras agrupadas nem p95 inferencial. A automação não é variável desse ensaio de armazenamento; ele não despacha trabalho.', '',
  '| Cache (bytes) | Superfície | n processos × leituras | Medianas ms: mín / med / máx / amplitude | Payload mínimo–máximo (bytes) |', '|---:|---|---|---|---:|');
const audits = values('disabled', 'AC29_REPORT');
for (const cache of [0, 16_777_216, 67_108_864]) for (const surface of audits[0].stages[0].measurements.map(row => row.surface)) {
  const rows = audits.map(audit => audit.stages.find(stage => stage.generatedCacheBytes === cache).measurements.find(row => row.surface === surface));
  lines.push(`| ${cache} | ${surface} | 5 × 20 | ${stats(rows.map(row => row.medianMs))} | ${Math.min(...rows.map(row => row.payloadMinBytes))}–${Math.max(...rows.map(row => row.payloadMaxBytes))} |`);
}
lines.push('', '| Cache (bytes) | DB | WAL | SHM | Artefatos | Git de fixture | Trabalho operacional | Auxiliares |', '|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const stage of audits[0].stages) {
  const s = stage.sizes;
  lines.push(`| ${stage.generatedCacheBytes} | ${s.databaseBytes} | ${s.walBytes} | ${s.sharedMemoryBytes} | ${s.evidenceBytes} | ${s.retainedGitDiskBytes} | ${s.operationalWorkBytes} | ${s.otherAuxiliaryBytes} |`);
}
lines.push('', 'Tabela de tamanhos: primeira repetição; as cinco confirmam invariância na fase de leitura por data_version/eventos/auditoria e igualdade de payload por superfície dentro de cada banco. O único crescimento proporcional é o próprio arquivo ignorado operacional. Instrumentação fs com controle positivo prova ausência de leitura/enumeração de work/git/artifacts pelos resumos; auditoria SQLite e inspeção de auxiliares não encontram marcadores de conteúdo. A inspeção da fixture fora da janela lê arquivos para auditoria e não é custo da consulta.', '',
  'Referência, árvore e base Git aprovadas permanecem identificáveis após close/reopen e remoção elegível controlada; não são snapshots de checkout ou índice. O Git e o executor dessa prova são controlados; não constitui recuperação de processo físico ou prova de Git externo. Alterações posteriores de WAL por operações legítimas não são crescimento atribuído a cache.', '',
  '## Ranking e primeira fatia', '',
  '| Prioridade | Candidato | Evidência e frequência | Decisão |', '|---:|---|---|---|',
  '| 1 | Primeiras páginas de fieldValues dos memberships no contexto de fila | ItemValues=20/120/1200 envios, antes do resultado útil; três memberships materializadas em expanded/large. Frequência real de memberships múltiplas desconhecida. | Selecionado: composição das primeiras páginas, sem omitir memberships/campos. |',
  '| 2 | Gatilhos web e sobreposição | 60 GETs para vinte eventos globais; cache já compartilha chaves iguais. A pertinência precisa ser comprovada por tipo, e os eventos de outro projeto não são irrelevantes na visão global. | Não filtrar nem reduzir atualidade nesta fatia. |',
  '| 3 | Paginação/limites com observação repetida | 544 envios em dois limites diferentes. Ampliar reutilização entre páginas pode mudar a atualidade da continuação. | Não incluir. |',
  '| 4 | SQL/resumos/persistência | 343 execuções no cold base e 1603 no large; oito no warm. Payload e armazenamento não crescem com 64 MiB de cache. Tempos locais não representam IO remoto. | Sem refatoração Storage ou nova infraestrutura. |', '',
  'Fatia única selecionada: backend, dentro de `getIssueContextById(id, { purpose: queue })` e `readIssueContext`. Compor em um envio as primeiras páginas de fieldValues de até três memberships da mesma issue. Continuar todas as páginas seguintes de cada conexão pelo seu cursor, preservando todas as memberships, campos select/number, ordem, diagnósticos e parcialidade. Para uma membership, manter o custo e caminho equivalente. Isto é alvo e orçamento para implementação futura, não mudança já aplicada nem redução comprovada.', '',
  'Superfícies previstas: `apps/controller/src/modules/github/client.ts`, `queries.ts`; `transport.ts` somente se necessário para reutilizar uma primeira página já recebida no coletor sem reenviá-la. Não alterar contrato público, createQueue.read/observe/save, TTL, chave de cache, filtros de eventos, pipeline/start ou publication. O seam de transporte de teste e github.test recebem as respostas e regressões pertinentes; os ensaios precisam continuar capazes de executar a referência anterior e a nova versão com as mesmas condições.', '',
  'Metas derivadas do baseline para grupos de três: base permanece no máximo 108 envios; expanded 272 → no máximo 232; large 2612 → no máximo 2212. Conta: economizar duas primeiras páginas por issue com três memberships, 20×2=40 e 200×2=400. ItemValues 120→80 e 1200→800; páginas de continuação não são cortadas. Não impor percentual de latência sem rede real. O resultado só pode ser aceito após o oráculo e a matriz antes/depois comprovarem menor trabalho, sem regressão sustentada de tempo/conteúdo útil no alvo.', '',
  'Garantias: conta/projeto/finalidade permanecem isolados, sem compartilhar autorização. Mesma observação de conta antes/depois, três workers por observação, nenhuma nova simultaneidade de issues ou retry. Query e byte budgets continuam contando envios/bytes efetivos; timeout/throttle/backoff e limites de resposta continuam ativos. Não remover erros de memberships que antes contribuíam para partial. Node ausente/duplicado/tipo inválido, erro parcial GraphQL, acesso negado, budget/bytes, segunda página falha ou cursor repetido devem manter incompletude e diagnóstico, nunca elegibilidade falsa. Batching não pode transformar payload antes aceito em falha por um limite menor efetivo: demonstrar limites do grupo e cobertura de fronteira antes de concluir a implementação.', '',
  'Viabilidade sprint-005, limite de três rounds: (1) implementação restrita de consulta/adaptação da primeira página e testes de equivalência; (2) provas adversariais de paginação, node ausente/fora de ordem/duplicado, falhas e budgets; (3) repetir matriz, typecheck/lint/build e corrigir achados da mesma fatia. O recorte não inclui batching de continuações, GraphQL genérico, scheduler, coalescência nova nem UI. Cabe no orçamento configurado pelo tamanho do recorte e seams existentes; isso é estimativa, não garantia. Se uma falha exigir alterar semântica pública, atualidade, erro ou limite, parar essa adoção e registrar o impedimento; não migrar automaticamente a outro candidato nem ampliar escopo.', '',
  'A consulta agrupada precisa ser validada contra o schema oficial antes de implementar. Context7 confirmou fieldValues como conexão com first/after e paginação de 1–100. Menos envios não equivale automaticamente a menor pontuação GraphQL, pois custo primário é calculado por conexões. Referências oficiais: [Projects](https://docs.github.com/en/graphql/reference/projects), [paginação](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api), [limites](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api). Sem benchmark de rede nem chamada GitHub real nesta sprint.', '',
  'Não foi identificada necessidade de mudar atualidade, layout, contrato, escopo de autorização ou risco de efeito externo. Uma alteração assim não está autorizada pela seleção. A sprint-005 aguarda autorização do usuário; não foi iniciada.', '', '## Identidade dos arquivos medidos', '',
  'Alterações locais desta sprint: ensaio observation-matrix.test.ts, variação de automação/relatórios privados no ensaio web e scripts de reprodução/consolidação. Fixtures e implementação anterior preservadas. Não se atesta inventário Git completo: usaram-se HEAD/ref e hashes, sem comandos Git autenticados ou mutáveis.', '',
  '| Arquivo | SHA-256 |', '|---|---|');
for (const [file, hash] of Object.entries(data.hashes)) lines.push(`| ${file} | ${hash} |`);
await writeFile(join(root, '.lionclaw', 'pipelines', 'architecture-review', '20261021_150214-1ec379', 'observation-baseline.md'), lines.join('\n') + '\n');
console.log('Baseline report generated from ten successful runs; measured source hashes verified.');
