const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = 'C:/Users/jeffe/Documents/Apps/nova-fabrica-software/';
const dir = root + 'docs/Docs20261023_014848/';
const planPath = dir + 'sprints20261023_014848.json';
const reportPath = dir + 'sprint-validation20261023_014848.md';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const bytes = fs.readFileSync(planPath);
assert.equal(hash(bytes), '5ec5d758c53c37441ffefe4115c65a70fc6d8ea6ec19b108cbe691e923803b0d', 'Unexpected input version; do not replay revision.');
const original = JSON.parse(bytes.toString('utf8'));
const plan = structuredClone(original);
const report = fs.readFileSync(reportPath, 'utf8');
const get = id => plan.sprints.find(s => s.id === 'sprint-' + id);
const copy = s => structuredClone(s);
const specPath = 'docs/Docs20261023_014848/SPEC20261023_014848.md';
assert.equal(hash(fs.readFileSync(root + specPath)), '8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91');

// S5: preserve the scope while correcting documentary precedence.
plan.project.description = 'Evoluir a fábrica existente conforme docs/Docs20261023_014848/SPEC20261023_014848.md. Fontes aprovadas desta execução: PRD20261023_014848.md para produto/escopo e stories-requisitos20261023_014848.md para comportamento/aceite, conforme precedência registrada na SPEC. FEEDBACK-PROXIMO-PACOTE-V3.md é contexto subordinado; não reabrir discovery nem decisões já consolidadas. Cobrir US-01–23, RF-01–88, RNF-01–18 e os complementos E1-a/E2-a. Trabalhar no repositório canônico preservando alterações. O plano não aprova fase, Design Lock, implementação, providers ou efeitos externos. Provas controladas, UI renderizada, Windows/Git e integrações reais têm gates distintos. Usar porta 4310 quando a execução estiver autorizada. Não realizar staging, commit, push ou publicação deste repositório sem autorização correspondente.';
get('001').hints.existing_files.unshift(specPath);
get('001').hints.architecture_notes += ' A SPEC datada desta execução é a referência técnica; PRD e stories aprovados seguem a precedência nela registrada. Feedback não é fonte concorrente. As estimativas são previsões de esforço ativo, não garantia nem autorização: ao atingir três rounds sem aceite, registrar pendência e pedir replanejamento; nunca concluir por esgotamento do teto. A numeração segue a ordem do array e os hints acompanham a renumeração desta revisão.';

// S6: isolate transversal allocation work from location identity.
const allocation = copy(get('002'));
allocation.id = 'sprint-041';
allocation.name = 'Alocação gerenciada e adaptação dos consumidores';
allocation.description = 'Concluir US-15.C1–C3/RF-64–66 nos consumidores: alocação de novos recursos, leitura, execução, recuperação, retenção, publicação, abertura e exclusão. Não mover legado.';
allocation.features = [get('002').features.pop()];
allocation.dependencies = ['sprint-001', 'sprint-002'];
allocation.estimated_rounds = 3;
allocation.hints.architecture_notes = 'Consumir identidade e leitura compatível da sprint-002. Estimativa de três rounds: alocação e produtores; adaptação dos consumidores listados no aceite; regressão de referências novas/legadas e persistência limitada. A integração de todos os consumidores é condição de aceite, sem encaminhá-la ao fechamento final. Movimento legado pertence à sprint-003.';
get('002').name = 'Identidade e leitura das localizações gerenciadas';
get('002').description = 'Entregar identidade, revisão e leitura compatível das localizações por projeto, incluindo colisões de nome e renomeação. Parte de US-15.C1–C3/RF-64–66; alocação e adaptação transversal pertencem à sprint-041.';
get('002').estimated_rounds = 2;
get('002').hints.architecture_notes = 'Aplicar o contrato da sprint-001. Dois rounds previstos: identidade/contrato de leitura e conferência de referências novas/legadas, colisões e renomeação. Não movimentar legado. A alocação integrada e adaptação de consumidores são responsabilidade explícita da sprint-041; esta entrega não declara todo RF-64–66 concluído.';
for (const s of plan.sprints) if (s.dependencies.includes('sprint-002')) s.dependencies.push('sprint-041');

// S3/S6: move the full storage action to a bounded UI sprint.
const storageUI = copy(get('009'));
storageUI.id = 'sprint-042';
storageUI.name = 'Localizações e transição gerenciada na interface';
storageUI.description = 'Completar US-15.C1–C4/RF-64–68 na interface: consulta, ação V08 e acompanhamento durável até resultado ou pendência explícita.';
storageUI.features = [get('009').features.pop()];
storageUI.dependencies = ['sprint-001', 'sprint-002', 'sprint-041', 'sprint-003', 'sprint-009'];
storageUI.hints.key_interfaces.push('StorageTransitionPlan', 'StorageTransitionCommand', 'OperationProgress');
storageUI.hints.existing_files.push('apps/web/src/features/operations/useOperation.ts');
storageUI.hints.architecture_notes = 'Consumir plano/diário da sprint-003, localizações da sprint-002 e consumidores da sprint-041. A ação de transição pertence integralmente a esta sprint; a sprint-009 entrega somente criação e cadastro. Usar acompanhamento durável existente. Dois rounds: ação e leitura; recuperação, recusas e prova renderizada. Preservar layout aprovado e registrar no SPEC_PROGRESS.md os caminhos efetivos de ProjectConfigurationDialog/useProjectStorage.';
storageUI.features[0].acceptance_criteria.push(
  'Ação explícita envia V08 com plano, hash, revisão e identidade vigentes; 202 significa aceitação, sem anunciar movimento concluído, e duplo envio é bloqueado.',
  'Resposta perdida ou fechar/reabrir conserva a identidade da operação e consulta seu andamento; parcial, incerto, bloqueado e resultado confirmado são distintos, sem repetir movimento por GET ou refresh.',
  'Plano/revisão vencidos, atividade, efeito incerto ou exclusão concorrente recusam a ação e preservam rascunho; a interface exige rever o plano atual sem fabricar destino ou autorização.',
  'Prova renderizada cobre comando aceito, resposta perdida, reabertura, resultado confirmado, parcial/incerteza e recusa por plano vencido; causa e próxima ação correspondem ao backend.'
);
get('009').name = 'Criação completa e cadastro na interface';
get('009').description = 'Completar as superfícies de US-02/US-03: criação obrigatória com retomada e cadastro incompleto com prontidão explícita. A área gerenciada e ação V08 pertencem à sprint-042.';
get('009').hints.architecture_notes = 'Consumir as sprints-004 a sprint-008, preservando design e controles compartilhados. Dois rounds: criação/retomada e cadastro/prontidão com prova renderizada dos dois percursos. A área gerenciada e a transição são entregues pela sprint-042, com dependência explícita da sprint-003.';

// S2: session identity is owned before occupation; continuation extends it.
get('012').features[0].acceptance_criteria.push('Esta sprint entrega também a identidade persistida mínima em attempt_sessions, única por tentativa/papel, antes da ocupação que a referencia; FKs e exclusividade de sessão/terminal são verificadas sem depender da sprint-013.');
get('012').hints.architecture_notes += ' A identidade persistida mínima de attempt_sessions é responsabilidade desta sprint, junto da nova sessão exigida por feat-025. A sprint-013 estende a continuidade entre passagens/versões e não recria essa responsabilidade. Três rounds mantidos: identidades e ocupação; observação/recuperação conservadora; contratos negativos e prova de recurso.';
get('012').hints.key_interfaces.push('AttemptSession');
get('013').hints.architecture_notes += ' Consumir attempt_sessions e suas constraints entregues na sprint-012; aqui se valida continuidade entre passagens/versões, isolamento e atualização do ambiente, sem duplicar a criação da identidade mínima.';

// S1: explicit backend owner, after all contributing facts and before UI.
const summary = copy(get('025'));
summary.id = 'sprint-043';
summary.name = 'Contrato e projeção do resumo consolidado';
summary.description = 'Entregar US-17.C1–C4/RF-74–75 e RNF-12 no backend: DeliverySummaryView em E07/E12, com fatos da versão, critérios e recibos. Somente leitura.';
summary.estimated_rounds = 2;
summary.complexity = 'medium';
summary.dependencies = ['sprint-001', 'sprint-015', 'sprint-016', 'sprint-023', 'sprint-024', 'sprint-025'];
summary.features = [{id:'feat-086', name:'Projeção consolidada por versão e recibos', description:'Disponibilizar o contrato de leitura exigido pela tela sem criar autoridade ou repetir efeitos.', acceptance_criteria:[
  'E07/HttpAttemptDetail e E12/HttpDeliveryDetail expõem delivery_summary conforme o catálogo da SPEC e DeliverySummaryView, respeitando tentativa, rodada e entrega selecionadas e recusando IDs cruzados.',
  'Resumo deriva resultado, referência fixa, localização, branch, commit, PR, critérios, checks, achados resolvidos e limitações dos fatos da versão e recibos pertinentes; texto de execução não concede aprovação.',
  'Entrega parcial, incerta, adaptação pendente, não verificado e legado sem dado permanecem explícitos; commit confirmado não implica checkout_updated=true e continuação preserva histórico.',
  'GET, refresh e navegação não executam efeitos; detalhes extensos são sob demanda, sem capturas/logs/checkouts completos em polling ou listagens.',
  'Contratos de resposta e testes determinísticos cobrem ICR, commit, PR, continuação, versão adaptada, parcial, legado e troca de seleção; SPEC_PROGRESS.md registra os caminhos efetivos dos contratos e projeções antes da sprint-026.'
]}];
summary.hints.existing_files = ['SPEC_PROGRESS.md', specPath, 'packages/contracts/src/http-execution/attempts.ts', 'apps/controller/src/http/execution-views.ts', 'apps/controller/src/modules/queries/index.ts', 'apps/controller/src/modules/storage/queries.ts'];
summary.hints.key_interfaces = ['DeliverySummaryView', 'HttpAttemptDetail', 'HttpDeliveryDetail', 'HttpPublicationSummary'];
summary.hints.architecture_notes = 'Consumir os fatos de aprovação e entrega da sprint-015, sprint-016, sprint-023, sprint-024 e sprint-025. Dois rounds: contrato e projeção; testes de seleção, estados e leitura sem efeitos. Não acrescentar publicação, persistência de checkout ou nova decisão de produto. A sprint-026 consome os caminhos efetivamente registrados aqui.';
get('026').dependencies.push('sprint-043');
get('026').estimated_rounds = 3;
get('026').complexity = 'high';
get('026').hints.architecture_notes += ' O backend de DeliverySummaryView/E07/E12 é entregue pela sprint-043, dependência obrigatória anterior. Ler no SPEC_PROGRESS.md seus caminhos efetivos. Reestimada em três rounds: preparação/destino; continuação/operação incerta; resumo e prova renderizada integrada. Esta sprint não entrega a projeção backend.';

// S4/S6: operational composition proof precedes deterministic final closure.
const operational = copy(get('040'));
operational.id = 'sprint-044';
operational.name = 'Conferência dos gates operacionais e composição real';
operational.description = 'Conferir provas de domínio e completar somente provas reais/visuais dependentes da composição final de US-01–23. Gate obrigatório sem evidência mantém esta sprint pendente.';
operational.features = [get('040').features.splice(1,1)[0]];
operational.dependencies = [...get('040').dependencies, 'sprint-041', 'sprint-042', 'sprint-043'];
operational.hints.architecture_notes = 'Três rounds de esforço ativo: conferir evidências por versão e lacunas de composição; percursos reais finais necessários e autorizados; prova renderizada/host e conferência de recibos. Não repetir provas de domínio ainda válidas. Espera por autorização/capacidade não é esforço estimável nem aceite; falta de prova bloqueia fechamento. Não iniciar provider ou publicação como consequência desta revisão documental.';
operational.features[0].acceptance_criteria.push('A matriz de gates vincula requisito, versão, cenário, superfície e evidência atual; prova de domínio só é reutilizada com identidade e compatibilidade demonstradas. Mudança que a invalide exige prova pertinente, sem transformar mera existência de arquivo em sucesso.');
get('040').name = 'Regressão integrada e fechamento das evidências';
get('040').description = 'Concluir a regressão determinística da composição e a documentação final depois dos gates operacionais. Fechar US-01–23/RF-01–88/RNF-01–18/INT pertinentes somente com aceites obrigatórios satisfeitos.';
get('040').dependencies.push('sprint-041', 'sprint-042', 'sprint-043', 'sprint-044');
get('040').features[0].acceptance_criteria[0] = 'Todos os comandos configurados obrigatórios pertinentes de typecheck, lint, testes, HTTP, aceitação, build e distribuição passam na versão final integrada; a suíte padrão não chama providers nem produz efeitos externos. Falha reproduzível é registrada como pendência e não satisfaz o aceite; falha preexistente registra relação com o escopo e decisão de tratamento, sem equivalência automática a sucesso.';
get('040').features[1].acceptance_criteria.push('A sprint só conclui quando seus checks obrigatórios e os gates operacionais obrigatórios da sprint-044 possuem evidência válida da versão pertinente; ausência de autorização, capacidade, prova ou correção mantém o fechamento pendente.');
get('040').hints.architecture_notes += ' Provas operacionais de composição e conferência de evidências pertencem à sprint-044. Três rounds mantidos para regressão determinística/segurança, upgrade/distribuição e rastreabilidade/documentação; provas específicas de domínio são produzidas nas sprints responsáveis, sem repetição automática.';

// Keep each original proof criterion and assign operational evidence to its domain.
const evidence = {
  '003':'Prova Windows/Git de transição parcial e recuperação pertence a esta entrega, após autorização aplicável.',
  '004':'Prova de distribuição limpa/Unicode e reinício pertence ao percurso desta sprint com a sprint-005.',
  '007':'Prova GitHub de cinco colunas/ordem/visualização/vínculo e retomada da criação pertence a esta entrega, quando autorizada.',
  '013':'Prova real Maestri/OMP de continuidade dos dois papéis, sessão nova por tentativa, perfil efetivo, perda e cancelamento pertinente pertence a este percurso com a sprint-012, quando autorizada.',
  '023':'Prova Git/Windows de preservação tracked/staged/untracked e recibos pertence a esta entrega.',
  '025':'Prova autorizada de commit/push/PR e reconciliação sem duplicação pertence a esta entrega.',
  '028':'Prova nativa de exclusão segura, baseline/meta e comparação pertence a esta entrega.',
  '036':'Prova da notificação e seu link no host pertence a esta entrega.'
};
for (const [id,note] of Object.entries(evidence)) get(id).hints.architecture_notes += ' '+note+' A sprint-044 confere validade e somente completa o que depende da composição final; autorização ausente mantém o gate pendente.';
const reasons = {
 '004':'Mantida separada da sprint-005: dois rounds para inicializador portátil, cinco ferramentas, seleção nativa e revalidação; envolve fronteira de host independente da apresentação.',
 '005':'Mantida separada da sprint-004: dois rounds para wizard, rascunhos/contexto e prova renderizada. Somar o par exige quatro rounds; não há evidência de redução para três.',
 '010':'Mantida separada da sprint-011: dois rounds para composição/migração idempotente, captura e segurança do contrato.',
 '011':'Mantida separada da sprint-010: dois rounds para editor, conflitos/limites e histórico com prova renderizada. Não há fundamento para comprimir quatro rounds do par em três.',
 '035':'Mantida separada da sprint-036: dois rounds para reserva exclusiva durável, concorrência/replay e recibos.',
 '036':'Mantida separada da sprint-035: dois rounds para permissão, consumidor entre abas, envio e prova no host. Não há fundamento para reduzir os quatro rounds do par a três.'
};
for(const [id,note] of Object.entries(reasons)) get(id).hints.architecture_notes += ' '+note;

// Insert then renumber once, including every textual hint reference.
const order = [];
for (const s of plan.sprints) {
  if(s.id === 'sprint-026') order.push(summary);
  if(s.id === 'sprint-040') order.push(operational);
  order.push(s);
  if(s.id === 'sprint-002') order.push(allocation);
  if(s.id === 'sprint-009') order.push(storageUI);
}
const mapping = new Map(order.map((s,i)=>[s.id,'sprint-'+String(i+1).padStart(3,'0')]));
const remapText = s => s.replace(/sprints?-\d{3}/g, id => {
  const key = id.replace('sprints-', 'sprint-');
  const result = mapping.get(key) || key;
  return id.startsWith('sprints-') ? result.replace('sprint-', 'sprints-') : result;
});
function remap(value){
  if(typeof value==='string') return remapText(value);
  if(Array.isArray(value)) return value.map(remap);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
  return value;
}
plan.sprints = order.map((s,index)=>({...remap(s),index}));
for (const s of plan.sprints) s.dependencies = [...new Set(s.dependencies)];
plan.metadata.version = 2;
plan.metadata.total_sprints = plan.sprints.length;
plan.metadata.total_features = plan.sprints.flatMap(s=>s.features).length;

// Revalidation: actual schema keys retained; original criteria/precedence conserved.
const positions = new Map(plan.sprints.map((s,i)=>[s.id,i]));
const allFeatures = plan.sprints.flatMap(s=>s.features);
assert.equal(new Set(allFeatures.map(f=>f.id)).size, allFeatures.length);
assert.equal(positions.size,44);
assert.equal(plan.metadata.total_features,86);
for(const s of plan.sprints){
  assert.equal(s.id,'sprint-'+String(s.index+1).padStart(3,'0'));
  assert(s.estimated_rounds>=1 && s.estimated_rounds<=plan.project.config.max_rounds_per_sprint);
  assert.equal(new Set(s.dependencies).size,s.dependencies.length);
  for(const d of s.dependencies) assert(positions.has(d) && positions.get(d)<s.index, s.id+' invalid dependency '+d);
  for(const f of s.hints.existing_files) assert(fs.existsSync(root+f),'Missing hint: '+f);
}
const featureMap = new Map(allFeatures.map(f=>[f.id,f]));
let conserved=0;
for(const f of original.sprints.flatMap(s=>s.features)) for(const [i,c] of f.acceptance_criteria.entries()){
  if(f.id==='feat-083' && i===0) continue;
  assert(featureMap.get(f.id).acceptance_criteria.includes(remapText(c)), 'Lost original criterion '+f.id);
  conserved++;
}
for(const s of original.sprints) for(const d of s.dependencies) assert(plan.sprints[positions.get(mapping.get(s.id))].dependencies.includes(mapping.get(d)),'Original edge removed');
assert.equal(plan.project.config.max_rounds_per_sprint,3);
assert.deepEqual(plan.project.config,original.project.config);
const stats = {
 sprints:plan.sprints.length,features:allFeatures.length,
 criteria:allFeatures.reduce((n,f)=>n+f.acceptance_criteria.length,0),
 rounds:plan.sprints.reduce((n,s)=>n+s.estimated_rounds,0),
 dependencies:plan.sprints.reduce((n,s)=>n+s.dependencies.length,0),
 originalCriteriaPreserved:conserved, strengthenedCriteria:1
};
const output = JSON.stringify(plan,null,2)+'\n';
const newHash = hash(Buffer.from(output));
const rows = original.sprints.map(s=>'| '+s.id+' | '+mapping.get(s.id)+' | '+plan.sprints[positions.get(mapping.get(s.id))].name+' |').join('\n');
const inventory = plan.sprints.map(s=>'| '+s.id+' | '+s.name+' | '+s.features.map(f=>f.id).join(', ')+' | '+s.estimated_rounds+' |').join('\n');
const coverage = [
 ['01',['004','005']],['02',['006','007','009']],['03',['006','008','009']],
 ['04',['023','024','025','026']],['05',['021','022','023','026']],['06',['022','023','024','025','026']],['07',['023','026']],
 ['08',['010','011','019']],['09',['012','013','014','019']],['10',['012','013','014']],['11',['015','020']],['12',['013','015','016','020']],
 ['13',['017','019','020']],['14',['018','019','020']],['15',['001','002','003','041','042']],['16',['027','028','029']],['17',['043','026']],
 ['18',['033','034']],['19',['035','036']],['20',['037','038','039']],['21',['030','032']],['22',['031','032']],['23',['034']]
].map(([us,ids])=>'| US-'+us+' — todos os critérios da matriz original | '+ids.map(id=>mapping.get('sprint-'+id)).join(', ')+' | Coberto no plano |').join('\n');
let supplement = `\n\n---\n\n## Revisão 3 — ajustes autorizados e revalidação do plano\n\nData: 23/10/2026. **Estado vigente: plano revisado, aguardando aceite final do usuário.** A autorização recebida cobre ajustes e nova validação; não aprova fase nem inicia implementação. As revisões 1 e 2 acima são histórico, incluindo seus estados anteriores. Esta revisão registra a resolução vigente.\n\n### Alterações e resolução dos achados\n\n| Achado | Alteração no plano (IDs finais) | Resultado |\n| --- | --- | --- |\n| S1 | ${mapping.get('sprint-043')}/feat-086 entrega DeliverySummaryView e E07/E12; ${mapping.get('sprint-026')} depende dela | Resolvido no plano; cinco aceites explícitos para contrato, versão, recibos, parcial/legado e leitura sem efeito |\n| S2 | ${mapping.get('sprint-012')} entrega identidade mínima de attempt_sessions antes de ocupação; ${mapping.get('sprint-013')} consome e estende continuidade | Resolvido; responsabilidades e ordem explícitas |\n| S3 | feat-019 transferida para ${mapping.get('sprint-042')}, dependente de ${mapping.get('sprint-003')} | Resolvido; ação V08, 202, resposta perdida, reabertura, parcial/incerteza e plano vencido com prova renderizada |\n| S4 | ${mapping.get('sprint-040')}/feat-083 exige checks obrigatórios passando; feat-085 impede fechamento com gate pendente | Resolvido; falha registrada não equivale a aceite |\n| S5 | Descrição geral e hints iniciais apontam a SPEC datada e precedência PRD/stories; feedback subordinado | Resolvido; orientação de reabrir discovery removida |\n| S6 | Recortes e rounds descritos abaixo; três pares mantidos com justificativa | Resolvido como decisão de planejamento; estimativas não constituem prova de capacidade |\n| S7 | Nenhuma dependência original removida | Avaliação concluída conservadoramente; semântica do executor não confirmada, simplificação não realizada |\n\n### Dimensionamento decidido\n\nResultado: **${stats.sprints} sprints, ${stats.features} features, ${stats.criteria} critérios e ${stats.rounds} rounds estimados**, com máximo de três rounds por sprint. Não se adotou 37 nem 23 como meta. O aumento decorre de quatro responsabilidades antes concentradas ou implícitas, não de funcionalidades adicionais de produto. As 85 features originais permanecem; feat-086 explicita cobertura obrigatória já existente na SPEC.\n\n| Recorte original | Decisão e esforço ativo estimado | Justificativa |\n| --- | --- | --- |\n| 002 | ${mapping.get('sprint-002')}: 2 rounds; ${mapping.get('sprint-041')}: 3 rounds | Separar identidade/leitura de localizações da alocação e adaptação transversal de consumidores; três rounds para ambos juntos não estava justificado |\n| 009 | ${mapping.get('sprint-009')}: 2 rounds; ${mapping.get('sprint-042')}: 2 rounds | Criação/cadastro conservam dois percursos; transição com ação e recuperação ganha aceite e responsabilidade próprios |\n| 026 | Backend ${mapping.get('sprint-043')}: 2 rounds; UI ${mapping.get('sprint-026')}: 3 rounds, antes 2 | Backend antes ausente fica explícito; UI tem preparação, continuação e resumo, um grupo por round previsto, com prova integrada |\n| 040 | Gates operacionais ${mapping.get('sprint-044')}: 3 rounds; fechamento ${mapping.get('sprint-040')}: 3 rounds | Separar disponibilidade/prova real da regressão determinística e documentação; provas de domínio ficam nas sprints responsáveis, reutilizadas somente com validade demonstrada |\n\nOs pares originais **004+005, 010+011 e 035+036 foram mantidos separados**. Cada par conserva quatro rounds somados: respectivamente host/detecção e wizard; migração/captura e editor/histórico; reserva/recibo e consumidor/prova no host. Não há histórico de capacidade ou redução demonstrável que sustente comprimir esses trabalhos em três rounds sem retirar aceites. A fundamentação específica consta também dos hints de cada sprint. Não se eleva o teto nem se presume economia por eliminar uma passagem de contexto.\n\nO incremento líquido é de ${stats.rounds-96} rounds previstos. As sprints novas com uma feature possuem vários cenários e fronteiras de validação; não são ajustes triviais. Os rounds são previsão de esforço ativo, não duração de calendário nem garantia; autorização, fornecedor e host podem impedir aceite por tempo indeterminado. Ao esgotar o teto, registrar pendência e replanejar, sem marcar conclusão automática.\n\n### S7 — limite da verificação do executor\n\nOrientação por CodeGraph e busca dirigida nos diretórios apps, packages, scripts e .lionclaw não localizaram o consumidor de sprints.json, max_rounds_per_sprint ou dependências de sprint. Os pipelines versionados em .lionclaw contêm artefatos; a coordenação de tentativas da fábrica não comprova a semântica do executor deste plano. A busca ficou restrita à raiz autorizada e não se inspecionou instalação externa. Portanto não foi confirmada a hipótese de que dependências transitivas podem ser removidas sem mudar execução/contexto. **Todas as 367 arestas originais foram preservadas por mapeamento**, acrescentando somente pré-requisitos das responsabilidades separadas. S7 não bloqueia cobertura do plano; permanece uma oportunidade opcional de legibilidade, sem alegação de semântica confirmada.\n\n### Revalidação realizada\n\n- JSON válido; mesmos campos estruturais do plano original; configuração e identificadores de execução preservados. Metadados de quantidade e versão atualizados.\n- ${stats.sprints} IDs de sprint e ${stats.features} IDs de feature únicos; índices contíguos e IDs na ordem do array. Todas as referências textuais sprint-NNN nos hints/descrições foram renumeradas junto das dependências.\n- ${stats.dependencies} dependências finais, todas existentes e anteriores; sem repetição na lista de cada sprint, sem ciclos. Nenhuma aresta original removida; pré-requisitos de alocação, ação de transição, resumo backend e gates finais precedem seus consumidores.\n- ${stats.originalCriteriaPreserved} dos 286 critérios originais preservados textualmente, salvo renumeração de referências; o critério restante foi fortalecido em S4. Novos critérios fecham as lacunas sem retirar aceites existentes.\n- Todos os caminhos de hints.existing_files existem; nomes de interfaces futuras são entregas previstas, não alegação de código pronto. Caminhos efetivos futuros devem ser registrados durante as entregas.\n- Cobertura temática das 23 histórias/88 RF/18 RNF preservada; US-15, US-17, RNF-12 e RNF-18 agora têm responsáveis e aceites antes faltantes. E1-a/E2-a e guardas originais preservados. Provas reais, visuais, nativas e determinísticas continuam distintas.\n- Nenhum código de produto alterado, teste de produto executado, pipeline iniciado ou efeito externo autorizado por esta revisão. Verificações estruturais não comprovam comportamento implementado.\n\n### Matriz de cobertura vigente — IDs finais\n\n| História | Sprints responsáveis principais | Situação |\n| --- | --- | --- |\n${coverage}\n\nAs provas de composição real terminam em ${mapping.get('sprint-044')}; a regressão integrada e a rastreabilidade final em ${mapping.get('sprint-040')}. A matriz RF/RNF da revisão 1 continua aplicável usando o mapeamento abaixo, acrescida das quatro entregas explicitadas nesta revisão.\n\n### Mapeamento dos quarenta IDs anteriores\n\n| ID na revisão 2 | ID final | Nome vigente |\n| --- | --- | --- |\n${rows}\n\nNovas responsabilidades: ${mapping.get('sprint-041')} (feat-004 transferida), ${mapping.get('sprint-042')} (feat-019 transferida), ${mapping.get('sprint-043')} (feat-086 nova, cobertura obrigatória do resumo), ${mapping.get('sprint-044')} (feat-084 transferida).\n\n### Plano resultante completo\n\n| Sprint | Entrega | Features | Rounds |\n| --- | --- | --- | --- |\n${inventory}\n\n### Identidade dos artefatos e aceite final\n\nSHA-256 da SPEC inalterada: 8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91.\n\nSHA-256 do plano revisado: ${newHash}.\n\nA edição e as verificações documentais estão registradas em revise-sprints-v2.cjs nesta pasta, com guarda contra reexecução sobre outra versão. Esta é uma revisão do plano, não implementação. **Não permanecem lacunas de cobertura identificadas abertas no plano; a aprovação final continua pertencendo ao usuário.** Permanecem como condições futuras: compatibilização documental das sessões prevista na primeira sprint e provas obrigatórias com autorização/capacidade pertinentes. A semântica externa do executor não foi verificada; por isso S7 não resultou em remoção de dependências.\n\nSe nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.\n`;
JSON.parse(output);
fs.writeFileSync(planPath,output,'utf8');
fs.appendFileSync(reportPath,supplement,'utf8');
assert.equal(hash(fs.readFileSync(planPath)),newHash);
console.log(JSON.stringify({stats,planHash:newHash,mapping:Object.fromEntries(mapping)},null,2));
