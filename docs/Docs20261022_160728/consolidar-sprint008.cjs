const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const base = path.join(root, 'docs/Docs20261022_160728');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(base, name), value, 'utf8');
const report = JSON.parse(read('validacao-sprint008-integral.json'));
if (!report.success || report.numFailedTests || report.numPendingTests) throw new Error('Final validation is incomplete');
const relative = name => path.relative(root, name).replaceAll('\\', '/');
const suites = report.testResults.map(s => ({ file: relative(s.name), cases: s.assertionResults.map(a => ({ name: a.fullName, status: a.status })) }));
const groups = {
  G: ['global-readiness.test.ts', 'github-diagnostics-rendering.test.ts'],
  P: ['project-readiness.test.ts', 'projects.test.ts'],
  I: ['project-readiness.test.ts', 'preparations.test.ts', 'issue-options-notice.test.ts'],
  T: ['attempt-detail.test.ts', 'recovery.test.ts'],
  V: ['attempt-detail.test.ts', 'verification.test.ts', 'reviews.test.ts', 'publication.test.ts'],
  C: ['creation-conditions.test.ts', 'remote-scaffold.test.ts', 'scaffold.test.ts'],
  R: ['records-history.test.ts', 'operation-diagnostics.test.ts'],
  D: ['dashboard-conditions.test.ts', 'observation-baseline.test.ts'],
  X: ['useDiagnostics.test.ts', 'diagnostic-notices-rendering.test.ts', 'diagnostic-receipt-rendering.test.ts', 'configuration-save-web.test.ts'],
};
const selected = names => suites.filter(s => names.some(n => s.file.endsWith('/' + n)));
const caseLink = names => selected(names).map(s => `[${s.file}](../../${s.file}) (${s.cases.length} cas; catálogo exato em sprint008-casos.json)`).join('; ');
const sourceFiles = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, e.name);
    if (e.isSymbolicLink()) throw new Error('Unexpected source link');
    if (e.isDirectory()) walk(file);
    else sourceFiles.push({ file: relative(file), sha256: hash(fs.readFileSync(file)) });
  }
}
for (const dir of ['apps', 'packages', 'resources', 'scripts']) walk(dir);
for (const file of ['package.json', 'package-lock.json', '.env.example']) sourceFiles.push({ file, sha256: hash(fs.readFileSync(file)) });
sourceFiles.sort((a,b) => a.file.localeCompare(b.file));
const version = hash(JSON.stringify(sourceFiles));
const assets = fs.readdirSync(path.join(root, 'dist/web/assets')).map(file => ({ file, sha256: hash(fs.readFileSync(path.join(root, 'dist/web/assets', file))) }));
const visual = [];
for (let sprint = 3; sprint <= 7; sprint++) {
  const name = `sprint00${sprint}-browser-result.json`;
  const j = JSON.parse(read(name));
  const refs = [...(j.assets || []), ...j.results.flatMap(r => r.assets || [])];
  const normalized = [...new Map(refs.map(a => [typeof a === 'string' ? a : a.url, a])).values()];
  const matches = normalized.every(a => typeof a !== 'string' && assets.some(b => b.file === a.url.split('/').pop() && b.sha256 === a.sha256));
  const requests = j.requests || [];
  const mutations = requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/session'));
  const posts = mutations.filter(r => r.method === 'POST' && r.path.endsWith('/diagnostics'));
  const operations = posts.map(r => r.operation || r.id || null);
  visual.push({ sprint, file: name, sha256: hash(read(name)), assets: normalized,
    status: matches ? 'current_assets_recorded' : 'previous_bundle_requires_reviewer_confirmation',
    viewports: j.results.map(r => r.viewport),
    diagnosticPosts: posts.length, diagnosticOperationIds: operations,
    businessMutations: mutations.filter(r => !r.path.endsWith('/diagnostics')).map(r => ({ method: r.method, path: r.path })),
    errors: j.errors || [],
    limit: 'Synthetic API; totals are not navigation-only counters. See originating sprint for action chronology. Missing operation IDs do not prove distinct durable intentions.' });
}
const evidence = fs.readdirSync(base).filter(n => /^(sprint00[3-7]-.*\.(json|png|js)|validacao-sprint00[1-7].*\.json)$/.test(n)).map(file => ({ file, bytes: fs.statSync(path.join(base,file)).size, sha256: hash(fs.readFileSync(path.join(base,file))) }));
write('sprint008-casos.json', JSON.stringify({ version, sourceFiles, suites }, null, 2) + '\n');
write('sprint008-conferencia.json', JSON.stringify({ version, assets, visual, evidence, tests: { passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests, files: report.testResults.length }, scope: 'Source fingerprint, not a Git reference or approval' }, null, 2) + '\n');
let md = `# Matriz final — sprint-008\n\nVersão de trabalho: fingerprint SHA-256 \`${version}\`, inventário em [sprint008-casos.json](sprint008-casos.json). Não é referência Git imutável. Resultado técnico: ${report.numPassedTests} aprovados, zero falhas/pendentes, ${report.testResults.length} arquivos, [relatório integral](validacao-sprint008-integral.json). Typecheck, lint e build executados com exit 0.\n\nA matriz histórica permanece em matriz-rastreabilidade.md. Cada linha abaixo conserva requisito e sprint proprietária e acrescenta os arquivos/casos efetivamente executados. Aprovação de uma suíte não certifica todos os critérios de uma story; casos exatos e resultados individuais constam no catálogo. **Entrega integral pendente**: confirmar as superfícies 003–006 sobre o bundle final pelo Revisor. O contrato INTEGRACAO-MAESTRI-OMP.md §4 reserva a ele o aceite visual; esta consolidação não o substitui por nova auditoria do Implementador.\n\n## Evidência por superfície\n\n`;
md += '| Grupo / sprint | Casos executados na versão final | Visual e limite |\n| --- | --- | --- |\n';
for (const [g,names] of Object.entries(groups)) {
  const sp = ({G:'003',P:'004',I:'004',T:'005',V:'004/005',C:'006',R:'007',D:'007',X:'002; aplicação 003–007'})[g];
  md += `| ${g} / ${sp} | ${caseLink(names)} | ${['R','D'].includes(g) ? 'Rastro 007 confere com assets finais; desktop/mobile/teclado registrados, API sintética.' : 'Provas históricas preservadas; pendente confirmação visual da versão final nas superfícies 003–006.'} |\n`;
}
md += '\n## Todos os requisitos e critérios individuais\n\n| Critério / fonte | Texto normativo | Sprint / grupo / casos | Resultado e pendência |\n| --- | --- | --- | --- |\n';
const old = read('matriz-rastreabilidade.md').split('\n');
for (const line of old.filter(l => /^\| (?:RF-\d+|RNF-\d+|US-\d+\.\d+) \/ L/.test(l))) {
  const cols = line.split('|').slice(1,-1).map(s => s.trim());
  const group = (cols[2].match(/\/ ([GPITVCRDX])(?:;|$)/) || [])[1] || 'X';
  md += `| ${cols[0]} | ${cols[1]} | ${cols[2]}; grupo ${group} acima | Casos controlados aprovados; ${['R','D'].includes(group) ? 'rastro visual 007 com assets atuais.' : 'pendente confirmação visual final quando aplicável; não declarar conclusão integral.'} |\n`;
}
md += '\n## E1–E4\n\n| Item | Evidência / sprint | Resultado / limite |\n| --- | --- | --- |\n';
for (const [id,text] of Object.entries({E1:'global-readiness/project-readiness/attempt-detail/creation-conditions: um controle por ação/check; contadores e rastros 003–006',E2:'diagnostic-notices-rendering/useDiagnostics/dashboard-conditions: equivalência por causa/contexto/próxima ação e histórico anterior',E3:'project-readiness/attempt-detail/records-history: comando/cwd/timeout, artefatos e eventos autorizados preservados; linguagem nos avisos',E4:'useDiagnostics/operation-diagnostics: aceitação/consulta indisponível, fechamento/reabertura, idempotência SQL e consulta da identidade original'})) md += `| ${id} | s002 e aplicação 003–007: ${text}; casos no catálogo final | Aprovado no seam controlado; visual final 003–006 pendente. Reload não inventa correlação ausente. |\n`;
md += '\n## SPEC 5.1–5.3 — cada item e cenário\n\n| Item | Mecanismo preservado | Arquivo / caso | Resultado / sprint / N/A |\n| --- | --- | --- | --- |\n';
const seen = new Set();
for (const l of old.filter(l => /^\| 5\.[123]/.test(l))) {
  const c = l.split('|').slice(1,-1).map(s => s.trim());
  if (c.length < 4 || seen.has(c[0])) continue;
  seen.add(c[0]);
  const na = /RLS|Webhook signature|File upload/.test(c[0]);
  md += `| ${c[0]} | ${c[1]} | ${c[2]} | s002/aplicação 003–007/conferência 008. ${na ? 'N/A somente para RLS nativo SQLite, assinatura de webhook ausente ou upload ausente; escopo e download continuam obrigatórios.' : 'Regressões pertinentes executadas na integral; localizar resultado exato em sprint008-casos.json. Casos visuais finais 003–006 pendentes; sem prova externa.'} |\n`;
}
md += '\n## Conferência visual e RNF-01/02\n\n| Sprint | POST diagnostics total | Identidades registradas | Validade dos assets |\n| --- | ---: | --- | --- |\n';
for (const v of visual) md += `| ${v.sprint} | ${v.diagnosticPosts} | ${v.diagnosticOperationIds.filter(Boolean).length}/${v.diagnosticPosts} | ${v.status}; [rastro](${v.file}) |\n`;
md += '\nOs totais incluem ações explícitas; não são efeitos causados por navegar. Aberturas têm zero POST de diagnóstico segundo as asserções de cada roteiro e os testes de superfície. Sprint003 contém dois PUTs controlados com a mesma identidade em viewports independentes: isso não é prova de duas intenções SQL nem replay em produção. Sprint006 não registra Idempotency-Key no rastro: uma intenção durável é comprovada pelo caso `commits intent before observation and deduplicates accepted or completed commands without new IO` de operation-diagnostics, não inferida de screenshots. Sprint004 registra POSTs de preparação existentes e PUTs de conflito por ação explícita; não são novos efeitos de diagnóstico. Sprint007: zero diagnóstico ou mutação de negócio, dois bootstraps técnicos. Nenhuma contagem do browser prova ausência de subprocesso remoto real.\n\n## Escopo, segurança e pendências\n\nEsta sprint altera somente documentação/evidências neste diretório. Nenhuma alteração funcional, schema, migration, endpoint, contrato público, dependência ou regra de autorização/elegibilidade foi feita. O working tree já continha mudanças anteriores, incluindo remoção de SPEC.md; não foram restauradas nem atribuídas a esta sprint. HEAD é baseline, não incorpora o trabalho não commitado. Git somente leitura.\n\nPacote mantém SQL em storage, checks funcionais, histórico, eventos técnicos opcionais e artefatos por versão. Provas de sessão/cookie/revogação, 401 leitura uma vez/mutação sem replay, 403 sem replay, Host/Origin/CSRF, rate limit/Retry-After, schemas/CAS, segredos, autoridade e artefatos são reutilizadas da integral final e dos casos discriminados, sem controles/testes novos. .env.example conserva as cinco opções normativas e instalação relativa; nenhum segredo/configuração operacional foi lido.\n\nPendências obrigatórias: (1) Revisor confirmar Configuração/projeto/preparação/tentativa/criação sobre o JS final, ou produzir evidência verificável de não invalidação por mudanças posteriores; (2) revisão independente vinculada à versão fixa, quando exigida pelo fluxo, sem criar commit por conta do usuário. Ferramenta Playwright MCP disponível (lista de abas consultada); ausência de ferramenta não é justificativa usada. Não houve nova execução de UI, provider, Wire, GitHub, Maestri/OMP, publicação ou avanço. O tamanho do bundle segue acima de 500 kB; aviso real do build, fora do escopo funcional deste fechamento.\n';
write('matriz-final-sprint008.md', md);
write('validacao-sprint008-checks.json', JSON.stringify({
  version,
  testStartedAt: new Date(report.startTime).toISOString(),
  checks: [
    { command: 'npm.cmd run typecheck', exitCode: 0 },
    { command: 'npm.cmd run lint', exitCode: 0 },
    { command: 'npm.cmd test -- --reporter=json --outputFile=docs/Docs20261022_160728/validacao-sprint008-integral.json', exitCode: 0, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests, files: report.testResults.length },
    { command: 'npm.cmd run build', exitCode: 0, warning: 'JavaScript chunk exceeds 500 kB', modules: 383, javascriptKB: 1014.57, gzipKB: 255.35 },
  ],
  reportSha256: hash(read('validacao-sprint008-integral.json')),
  integralAcceptance: 'pending',
  reason: 'Visual proof of earlier bundles requires final reviewer confirmation for surfaces 003-006',
}, null, 2) + '\n');
console.log(JSON.stringify({ version, tests: report.numPassedTests, files: report.testResults.length, matrixRows: md.split('\n').filter(l => l.startsWith('|')).length, visualPending: visual.filter(v => v.status !== 'current_assets_recorded').map(v => v.sprint) }));
