# Sprint-001 — Consolidar inventário e contrato de comportamento

Data: 2026-10-22. Entrega exclusivamente documental, no repositório canônico. Implementação das sprints-002 a 008 é planejamento futuro condicionado à autorização humana. Este documento não aprova SPEC, Database, Security, Design Lock ou avanço de fase. Não foi executado pipeline, scaffold, provider, recrutamento, publicação ou operação externa.

## Fontes e baseline observada

- `AGENTS.md`, `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md` existem e foram consultados nos trechos pertinentes às responsabilidades, fontes e validação.
- `SPEC.md` **não existe** no filesystem atual; `git status --short` registra ` D SPEC.md`. Não foi restaurada nem reconstruída a partir do Git. Referências AC da raiz nos documentos do pacote são históricas, sem conferência contra a fonte ausente.
- Localizados em `docs/Docs20261022_160728/`: `PRD20261022_160728.md`, `stories-requisitos20261022_160728.md`, `discovery20261022_160728.md`, `SPEC20261022_160728.md`, `enrich-suggestions20261022_160728.md` e `sprints20261022_160728.json`. Consultados resumo/limites, requisitos e aceites, decisões E1–E4, mapa frontend e Security 5.1–5.3. O catálogo SQL extenso da SPEC não foi reexecutado ou auditado integralmente; não se atestam suas contagens de tabelas/migrations.
- PRD, trecho Database: saída recuperada termina em “identidade, contexto e i”. Continuação ausente não foi reconstruída; análise truncada não comprova aprovação. A SPEC §1 atribui OKs Backend/Frontend à informação anterior do usuário, sem registro oficial localizado. `spec-validation` declarar consistência não constitui aprovação humana de Database/Security.
- Conflito histórico: a integração menciona GitNexus, mas AGENTS vigente o proíbe. Seguiu-se AGENTS: CodeGraph consultado porque `.codegraph/` existe; nenhum GitNexus usado. Não é necessária decisão nova para inventariar, mas não se declara resolvido o texto normativo antigo.
- HEAD consultado por `git log -1 --format=%H`: `868020ba13a72665ffc5228e4c38453798c41d7b`. Identifica somente o baseline versionado, não os arquivos locais não rastreados nem esta entrega.
- Estado inicial preservado: exclusão de `SPEC.md`; modificação de `docs/Docs20261022_160728/discovery20261022_160728.md`; não rastreados no pacote: `.build-spec.cjs`, PRD, SPEC, enrich-suggestions, prd-validation, spec-validation, sprint-validation, sprints.v1.json, sprints20261022_160728.json e stories-requisitos (todos com os nomes datados existentes). Não foram editados por esta sprint. `git diff --stat` inicial: dois arquivos rastreados, 145 inserções e 516 exclusões.
- A consulta opcional à memória serviu somente de orientação para a linguagem e os diagnósticos de Preparar; conclusões deste inventário foram conferidas nas fontes atuais. Saídas grandes de exploração foram truncadas pelo limite de saída; foram feitas leituras menores de contratos, serviço, storage, hook, rotas, critérios e segurança. Não se afirma leitura integral da SPEC de mais de 16 mil linhas ou auditoria integral do backend.

## Inventário verificável AS-IS e destinos

Os caminhos abaixo são relativos à raiz. “Consulta” não significa executar um check de diagnostics. Relatório concluído significa observação persistida, não prontidão atual nem autorização. Nenhuma linha desta tabela é uma implementação nova.

| Superfície | Consumidor atual e hooks | Origem da decisão / contratos / gatilho | Efeito permitido e ações existentes | Destino e sprint futura |
| --- | --- | --- | --- | --- |
| Configuração global | `apps/web/src/features/projects/ProjectForm.tsx:ProjectConfigurationForm` com projectId null; `useConfiguration.ts:useConfiguration`; `GitHubSetupPanel.tsx`; `useGitHubSetup.ts`; `ProjectsFolderField.tsx`; `useNativeSelection.ts`; `features/profiles/ProfilesPanel.tsx` | `apps/controller/src/http/routes/projects.ts`; `modules/projects/index.ts`; `storage/configuration-reads.ts`; settings/onboarding/perfis; GET settings e github-options explícito no fluxo GitHub | Consultar configuração persistida, Verificar status, vínculo/troca explícitos, confirmar pasta e salvar com ETag; observar não salva rascunho. Diagnóstico manual ainda central em Registros | Configuração: GitHub, pasta/perfis e integração; s003 |
| Projeto / catálogo | Mesmo `ProjectConfigurationForm` com projectId; `features/projects/useProjects.ts`; `app/PrincipalScreen.tsx:PrincipalScreen`; `ProjectDeletionPendingNotice.tsx`; `useProjectDeletionRestriction` | `storage/configuration-reads.ts` pré-requisitos; configuração/opções; `modules/projects/index.ts`; `packages/contracts/src/projects.ts` | Consulta, edição/salvamento explícitos; origem/remoto, quadro/Status, papéis, locks; dirty/revalidação informativos. Não substituir captura ativa | Condições junto dos campos, catálogo só resumo/acesso; s004 |
| Preparação | `features/preparations/PreparationDialog.tsx:PreparationDialog`; `IssueOptionsNotice.tsx:IssueOptionsNotice`; `api/preparation-requests.ts` | `modules/projects/preparations.ts:createPreparations`, `observe`, `effective`, `getPreparation`; `modules/github/client.ts:assessIssueReadiness`; `modules/pipeline/start.ts`; `packages/contracts/src/preparations.ts` | GET issues/preparação pode consultar GitHub e origem; consultas e pré-requisitos atuais não equivalem a diagnostics. Salvar/iniciar são ações explícitas distintas. Preservar retry fora de Ready, parser e revalidação real | Seletor issue, critérios, configuração efetiva e resumo; **nenhum escopo diagnostics preparation**; s004 |
| Tentativa | `features/attempts/AttemptDetailDialog.tsx:AttemptDetailDialog`; `useAttempt.ts:useAttempt`; `useAttemptActions.ts:useAttemptActions`; `QuestionDecisionCard.tsx`; `PublicationDialog.tsx` | `http/routes/attempts.ts`, `recovery.ts`, `publication.ts`; `storage/operation-summary.ts:readOperationSummary`; `storage/diagnostics.ts:diagnosticContext`; autoridade e capacidades existentes | Leituras de estado/recursos; cancelar, retry, abertura/remoção/reconciliação somente pelas ações próprias. Registro de recurso não comprova parada física/acesso | Estado/autoridade separados de recursos e versão; recursos junto de Parada/ambiente/ações nativas; s005 |
| Entrega | Mesmo detalhe; `features/attempts/useDelivery.ts:useDelivery`; seleção roundId/deliveryId; checks-editor no `ProjectForm.tsx` | `http/routes/deliveries.ts`; `modules/verification/index.ts:createVerification`; `storage/verification.ts`; `packages/contracts/src/http-execution/verification.ts` e `deliveries.ts` | Checks executados pelo controlador após captura/intenção, não por consultar prontidão. Artefatos/diff sob demanda com autorização. Mesma tree para checks/revisão/publicação; correção gera outra versão | Comando/cwd/timeout no projeto; resultado/artefato na versão selecionada; s004/s005 |
| Criação | `features/projects/ProjectCreationDialog.tsx:ProjectCreationDialog`, `CreationResult`, variável `visibleEffects`; funções `reviewPlan`, `submitCreation`, `consultOperation`, `reconcile`, `consultReconcile` | `modules/projects/scaffold.ts:createScaffold`, `plan`, `revalidate`, `executeRemote`; `http/routes/scaffold.ts`; `packages/contracts/src/http-observation/scaffold.ts` | Consultar opções/plano/resultado; criar só após autorização do plano; reconciliação é comando explícito distinto de consultar recibo. Falha/unknown preservam etapas e fontes effects/remote_effects | Formulário/plano e resultado; configuração/identidade conforme suporte, resources junto de etapas; nunca maestri_context; s006 |
| Dashboard | `features/operations/DashboardPanel.tsx:DashboardPanel`; `useOperation.ts:useOperation`; `useActiveAttempt.ts`; `features/queue/useQueue.ts` | `http/routes/operation.ts:installOperationRoutes`; `storage/operation-summary.ts:readOperationSummary`; `HttpOperationSummary`; onboarding, impediments e fila | Leituras/polling existentes, refresh e navegação; hoje blocos separados podem repetir causa. Observação da integração é histórica/pontual | Só resumos e links globais/projeto/tentativa. **Sem seletor ou execução centralizada**; s007 |
| Registros | `features/records/RecordsPanel.tsx:RecordsPanel`; `useRecords.ts:useRecords`, `RecordFilters`; `DiagnosticContextPicker.tsx:DiagnosticContextPicker`; `useDiagnostics.ts:useDiagnostics` | `http/routes/events.ts`; `HttpEventPage`; atualmente também GET/POST diagnostics e GET operations | Hoje escolhe contexto/checks, atualiza diagnóstico, verifica selecionados e consulta resultado. Eventos têm filtros, includeTechnical, cursor, anterior/próxima e retry | Retirar somente painel e consumo useDiagnostics depois de disponibilizar destinos. Preservar eventos, relatórios e recibos; s007 |

Prefixos omitidos na coluna de consumidor após o primeiro caminho: `apps/web/src/`. Nos produtores: `apps/controller/src/`.

## Contrato existente de diagnostics e controle por ação (E1)

Fonte: `apps/controller/src/modules/storage/diagnostics.ts:supportedChecks`, `diagnosticContext`, `configurationDiagnostics`, `readContextDiagnostics`, `acceptDiagnostic`, `recoverDiagnostic`, `finishDiagnostic`, `interruptDiagnostics`; execução em `apps/controller/src/modules/diagnostics/index.ts:createDiagnostics`.

| Check | Escopos suportados hoje | Origem / efeito do POST explícito | Controle e alcance futuro |
| --- | --- | --- | --- |
| configuration | host, project, attempt, creation | Configuração persistida e vínculos; validação da raiz confirmada pelo serviço quando aplicável. Não salva edição, não concede autoridade | Um controle compartilhado pasta/perfis no global e origem/quadro/papéis no projeto, resultados por seção; condições específicas do objeto nos respectivos destinos |
| github_identity | host, project, attempt, creation | `github.getIdentity`, compara conta observada/configurada; não faz login, bind ou switch | Verificar status do GitHub único no fluxo atual; não duplicar ação por relatório ou seção; objetos encaminham correção global |
| maestri_context | host, project, attempt | `execution.preflight`, consulta nativa não paga; não prova inferência/provider/MCP | Integração global, único controle; suporte no backend para outros escopos não obriga duplicar controle global no detalhe |
| resources | attempt, creation | `storage.checkHealth`, registros de recursos/etapas e efeitos; não cria/reconcilia/para nada | Um controle junto dos recursos da tentativa ou etapas/efeitos da criação |

Rotas existentes: `apps/controller/src/http/routes/operation.ts:installOperationRoutes`, GET/POST `/api/v1/diagnostics`, GET `/api/v1/operation`; `security/index.ts:commandHeaders`, `sendOperationAccepted`; `observation-views.ts:toHttpDiagnosticsView`. Contratos em `packages/contracts/src/http-observation/operation.ts` definem DiagnosticContext/Checks/View, reexportados como `HttpDiagnosticContext`, `HttpDiagnosticChecks`, `HttpDiagnosticsView` por `packages/contracts/src/index.ts`. Modelos privados em `packages/contracts/src/operation.ts` não devem ser renomeados.

Limites conferidos: 1–4 checks únicos; até 100 diagnósticos atuais, 104 por relatório e quatro relatórios na leitura; oito verificações pendentes por processo e uma aceita por contexto; intenção/recibo/evento transacionais antes do IO, hash canônico dos checks ordenados, escopo instalação/conta/contexto e stamp de revisão/perfis. Contexto alterado falha a conclusão; restart interrompe sem replay. GET lê persistência, sem disparar checks. Uma operação succeeded pode conter blocked/unavailable: não certifica prontidão.

`useDiagnostics` hoje: GET no efeito de contexto e em eventos/resync; POST somente `verify`; `refresh` relê; `retryReceipt` consulta operação original. Poll de recibo inicial 500 ms e seguintes 1500 ms enquanto accepted/running. Falha de consulta vira unavailable e não repete POST. Identidade local é scope:id, **não inclui conta/revisão**, e callback de ação não tem a mesma proteção de ciclo da leitura. Correlação está em estado React local e se perde ao desmontar. São lacunas para s002, não garantia satisfeita por localizar o hook. Não criar polling ou persistência novos.

## E2–E4, destinos e provas futuras

| Decisão | AS-IS / lacuna | Comportamento esperado / prova / responsável |
| --- | --- | --- |
| E1 | Seletor/checks em Registros; resultados de configuration podem abranger várias seções | Um controle por ação/check no contexto; não inventar subchecks. s003 global, s004 projeto/preparação, s005 tentativa, s006 criação; contar envios por clique e navegação |
| E2 | Registros renderiza leitura e relatórios separadamente; previous depende da operação local | Aviso detalhado atual único; históricos equivalentes resumidos como anteriores com data/estado; corrigir configuração, reabrir e não apresentar bloqueio antigo vigente. s002 e aplicação s003–007 |
| E3 | Campos técnicos funcionais coexistem com avisos operacionais | Zero dumps/IDs/códigos nos avisos; conservar comando/cwd/timeout, paths pertinentes, artefatos autorizados e eventos técnicos. s004/005/006/007; conferir renderização e download sem ampliar acesso |
| E4 | Desmontagem perde operação; quatro relatórios não garantem recuperar aceitação desconhecida | Na mesma sessão, memória mantém correlação no contexto original ao reabrir; após reload somente leituras recuperáveis existentes. Explicar correlação irrecuperável, sem conclusão presumida ou segundo POST. s002 e aplicação s003–006 |

O mapa detalhado de cada RF/RNF, critério US e item Security está em [matriz-rastreabilidade.md](matriz-rastreabilidade.md). O catálogo identifica testes com nome/linha; somente os seis arquivos do complemento final foram executados nesta rodada. Provas futuras por superfície s003–007: Playwright MCP/Chrome desktop/mobile, teclado/foco e retorno ao acionador, assets reconstruídos/recarregados identificados e contadores de zero execuções externas por navegação. Sem ferramenta/prova, permanece pendente. s008 consolida evidências válidas, sem repetir tudo por rotina.

## Validação técnica executada nesta sprint documental

Scripts conferidos em `package.json` (versões fixadas também em `package-lock.json`): `typecheck = tsc -p tsconfig.check.json --noEmit`; `lint = node scripts/check-boundaries.mjs`; `build = tsc -p tsconfig.json && vite build && node scripts/copy-resources.mjs`; `test = vitest run`. Outros scripts disponíveis incluem test:http, test:compiled, test:execution-compiled, test:verification-compiled, test:distribution e test:persistence; não foram executados nesta sprint.

| Comando efetivo | Resultado observado |
| --- | --- |
| npm.cmd run typecheck | Exit 0 |
| npm.cmd run lint | Exit 0; Module boundaries and TypeScript conventions: OK |
| npm.cmd run build | Exit 0; Vite 8.3.4, 377 módulos, JS index-tQtOGKAZ.js 995,15 kB / gzip 250,20 kB; aviso existente de chunk acima de 500 kB |

Build atualiza somente distribuição gerada/ignorada; não altera fonte, contratos, schema, dependência ou dado operacional. A suíte integral não foi executada. Foi executado um recorte de testes existentes (abaixo), sem código ou teste novo. Compilação não comprova reorganização, browser, segurança integral ou integração externa. Nenhum navegador ou serviço operacional foi aberto.

## Pendências e checkpoint humano

Fonte principal ausente e trecho Database truncado permanecem explicitamente pendentes; não bloqueiam este levantamento autorizado nem permitem reconstrução/aprovação. A integração antiga atribui prova visual ao Revisor, enquanto o plano futuro pede prova por superfície: registrar papel e autorização antes dessa execução, sem tratar esta sprint documental como dispensa ou aceite. Não houve UI implementada, portanto skills de design/load_skill não foram aplicadas; os nomes solicitados não estão no catálogo disponível e não se inventou ferramenta de carregamento.

Entrega documental não equivale à entrega funcional. A autorização atual termina no inventário/mapa. Sprints-002 a 008, aceites de SPEC/Database/Security/Design Lock e qualquer avanço permanecem dependentes dos mecanismos humanos correspondentes. Zero escrita Git, alteração do LionClaw ou aprovação simulada.

## Complemento — baseline controlada executada e conferência final

Comando: `npm.cmd test -- tests/diagnostic-receipt-rendering.test.ts tests/github-diagnostics-rendering.test.ts tests/integration/operation-diagnostics.test.ts tests/integration/http-security.test.ts tests/integration/verification.test.ts apps/web/src/api/http.test.ts --reporter=json --outputFile=docs/Docs20261022_160728/validacao-sprint001.json`. Exit 0: **69 testes aprovados, zero falhas**, seis arquivos. [Relatório com casos e resultados](validacao-sprint001.json). Testes preexistentes; executam baseline controlada AS-IS, não a reorganização futura. Demais casos da matriz permanecem somente localizados. Não houve execução da suíte integral ou ensaio nativo/externo/visual.

A matriz contém 39 RF, 12 RNF e os 59 critérios individuais das dez US, além de E1–E4, sete passos de 5.1, todos os 15 itens do checklist 5.2, cenários transversais e cada variável/regra de 5.3. O plano contém oito entradas de sprint, apesar de metadata.total_sprints informar sete: a matriz usa os IDs efetivos sprint-001 a sprint-008, sem editar o plano nem inferir avanço.

A descrição histórica do plano cita HEAD 3efa162 e correção local em RecordsPanel; a consulta atual retornou o HEAD e estado registrados acima, sem modificação local rastreada nesse componente. O componente atual preserva “Consultando registros…”. Não se reproduziu nem reverteu a correção histórica.

Conferência final: `git diff --check` passou para rastreados; leitura UTF-8 e verificação de espaços finais dos três arquivos novos passaram separadamente. `git status --short` preserva exatamente os dois estados rastreados iniciais e acrescenta somente estes três arquivos à lista de não rastreados: SPEC_PROGRESS.md, matriz-rastreabilidade.md e validacao-sprint001.json. Nenhum arquivo de implementação foi alterado.

## Sprint-002 — Preservar contexto, observações e consulta da operação original

Data: 2026-10-22. Implementação explicitamente solicitada nesta tarefa, restrita às garantias locais desta sprint. Não aprova checkpoints de SPEC/Database/Security/Design Lock, não inicia pipeline nem autoriza as próximas sprints. Trabalho canônico e Git somente leitura. As alterações preexistentes, incluindo a ausência de SPEC.md, foram preservadas; o SPEC_PROGRESS.md da raiz não foi editado nesta execução.

### Fontes e implementação

- Consultados AGENTS.md, GLOSSARY.md, contrato de integração e a SPEC deste pacote, sobretudo §4.6/E2–E4 e RF-32–38, além do inventário e matriz da sprint-001. A fonte principal SPEC.md continua ausente, sem reconstrução. CodeGraph orientou a leitura do hook e seus consumidores. Context7 confirmou o padrão React de cleanup e descarte de respostas obsoletas; não houve atualização de dependências. As skills de design nomeadas e load_skill não estão disponíveis; preservados os componentes, tokens e composição existentes.
- A implementação parcial de useDiagnostics, DiagnosticNotices, RecordsPanel e seus testes já estava no workspace na abertura desta execução. Foi preservada e validada, com reforços descritos abaixo; não se atribui a esta rodada a autoria integral desse trabalho anterior.
- useDiagnostics conserva correlação somente em memória por instalação, conta e objeto, com identidade da revisão/settings/perfis original. Leituras anterior/posterior e geração de efeito impedem respostas invertidas ou de ciclo fechado de substituir a leitura atual. Fechar/reabrir não cria outro POST; as leituras existentes podem recuperar operação persistida após perda da memória, sempre identificada como anterior. Ausência dessa recuperação recebe explicação, sem conclusão presumida.
- Reforço desta rodada: ao mudar a revisão do mesmo objeto, conserva-se a leitura anterior explicitamente stale até confirmação da nova; uma falha não apaga o relatório. Troca de conta ou objeto não herda o conteúdo. Falha ao consultar recibo preserva o estado conhecido accepted/running, a correlação e o erro original; queryError é independente. A consulta interrompida aguarda retryReceipt explícito, sem repetir o POST. Acompanhamento periódico continua restrito à operação aceita/em andamento; não foi criado polling de prontidão.
- DiagnosticNotices agrupa avisos por check, código de condição, causa, próxima ação e referências de contexto conhecidas. Equivalentes com estados distintos produzem uma apresentação que conserva a restrição reportada, sem modificar dados ou gates. Checks, objetos, contas e ações diferentes permanecem separados. Relatórios persistidos são resumos anteriores com data/estado; bloqueio corrigido desaparece da leitura atual e permanece no histórico. Nenhum DTO, protocolo, schema, armazenamento persistente, TTL ou regra de autorização/elegibilidade foi introduzido.
- RecordsPanel continua hospedando a apresentação nesta sprint de fundação local; a realocação aos destinos proprietários pertence às sprints seguintes. Mantidos atualizar leitura, verificar e consultar resultado original. Avisos usam OperatorDiagnosticCard/operator-language sem expor códigos, IDs, recibos ou fatos técnicos na explicação operacional.

### Evidências locais e correções durante a validação

| Execução | Resultado efetivo |
| --- | --- |
| Recorte inicial, sete arquivos | 79 testes aprovados, exit 0; validacao-sprint002-inicial.json |
| Duas regressões novas antes da correção | 18 aprovados / 2 falhas, exit 1; validacao-sprint002-regressoes-antes.json. Reproduzem perda da leitura após revisão e substituição do estado aceito por erro de consulta |
| Recorte final da sprint e segurança HTTP | 84 aprovados, zero falhas, exit 0; validacao-sprint002-final.json |
| Primeira suíte integral | 1.614 aprovados / 7 falhas, exit 1; validacao-sprint002-integral.json. Resultado preservado, sem alegação de sucesso |
| Reprodução isolada das falhas externas ao diagnóstico | Mesmas sete falhas, exit 1; validacao-sprint002-falhas-isoladas.json |
| Manutenção final dos quatro arquivos de testes | 67 aprovados, zero falhas, exit 0; validacao-sprint002-manutencao-final.json |
| Suíte integral final após todas as correções | 1.622 aprovados, zero falhas e zero pendentes em 125 arquivos, exit 0; validacao-sprint002-integral-final.json |
| npm.cmd run typecheck | Exit 0 após as últimas alterações de código e testes |
| npm.cmd run lint | Exit 0 após as últimas alterações de código e testes |
| npm.cmd run build | Exit 0; 378 módulos, index-C8wxJLXj.js 998,27 kB / gzip 251,24 kB. Aviso existente de chunk acima de 500 kB |

As falhas de manutenção foram corrigidas nos testes: ProjectCreationDialog já não oferece toggle de triagem e só mostra template com mais de uma opção; a fixture agora carrega duas opções e testa eventos dos controles existentes, incluindo nome e proprietário. Scaffold já normaliza triagem para true: a asserção confere o arquivo de engenharia incluído. A ajuda compacta existente não obedece a um mínimo arbitrário de 80 caracteres: os testes mantêm cobertura dos campos e significado de prazo/unidades, sem impor expansão de texto. Nenhum desses fluxos de produção foi alterado.

deletion-absence.test.ts falhava no unlink de uma junction que não existia, ocultando a falha de preparação da fixture. O ramo de segurança da suíte padrão agora usa diretório real e lstat controlado que o declara link. A prova com junction real foi preservada em tests/native/project-deletion.proof.ts, no comando nativo opt-in existente; não foi executada nesta sprint e não recebe aceite. Não se afirma que uma prova controlada demonstre comportamento nativo de junction ou remoção por referência. A skill diagnosing-bugs orientou reprodução isolada e correção, sem mudar capacidades de produção ou credenciais.

### Limites e continuidade

Os relatórios JSON deste diretório são evidência controlada, não prova de browser, GitHub/keyring, Maestri/OMP/provider, parada física ou publicação. Não foi executada validação visual nesta rodada; a integração atribui esse aceite ao Revisor independente na versão fixa. Evidências visuais anteriores mencionadas na matriz não foram reexecutadas nem promovidas por esta tarefa. Não houve instalação de dependência, abertura/migração do banco operacional, ação Git de escrita ou efeitos externos. Aceites das superfícies proprietárias e revisão independente permanecem nas respectivas etapas.

Fechamento: sprint-002 implementada e validada localmente. Typecheck, lint, build, recorte de 84 testes e suíte integral de 1.622 testes passaram; git diff --check passou. Conferência UTF-8/whitespace dos arquivos novos concluída sem apontamentos. Não constitui aprovação de fase, aceite visual/nativo ou autorização para sprint-003.

## Sprint-003 — Localizar prontidão na Configuração global

Data: 2026-10-22. **Implementação, validação técnica e prova Playwright MCP/Chrome desktop/mobile concluídas.** A reavaliação executada abaixo substitui a pendência histórica de browser; não representa aprovação do Evaluator ou mudança de fase. Escopo RF-01–05 e RF-31–39 no contexto global, US-01, E1–E4. Nenhuma próxima sprint, pipeline ou aprovação foi iniciada. A ausência preexistente de SPEC.md e as demais alterações locais foram preservadas; o SPEC_PROGRESS.md da raiz não foi editado nesta execução.

### Fontes e implementação

- Consultados AGENTS.md, GLOSSARY.md, responsabilidades do contrato de integração, SPEC do pacote (destinos, RF/RNF e §5), stories, inventário e garantias das sprints anteriores. CodeGraph orientou a leitura; arquivos atuais prevaleceram. Context7 confirmou preservação de estado na mesma posição React e descarte de respostas após cleanup. Não houve instalação ou mudança de dependências.
- `GlobalReadiness.tsx` compõe o hook existente com contexto implícito host. Distribui condições e relatórios anteriores por GitHub/conta, pasta, perfis e integração. Não há seletor de contexto, novo endpoint, regra de elegibilidade, polling de prontidão ou mudança de persistência. Registros continua disponível nesta sprint.
- `ProjectConfigurationForm` mantém a edição montada. Pasta recebe condições ao lado do campo e preserva sua confirmação própria; perfis recebem contagens quando presentes, acesso à coleção e um único aviso de ausência total. A supressão é restrita aos dois avisos de papel ausente quando já existe ausência total; outras restrições continuam visíveis. A cópia global de ausência total não usa a orientação de selecionar perfis de um projeto.
- GitHub recebe as condições globais no painel existente e conserva o único Verificar status, login/vínculo observados e ações explícitas de vínculo/troca. O optional slot de condições não altera o uso do painel no onboarding.
- Há um Verificar pasta e perfis (`configuration`) e um Verificar integração (`maestri_context`). Ambos têm atualização GET de fatos globais. A operação original e sua consulta aparecem somente junto do check de origem. `useDiagnostics` conserva em memória também os checks originais, inclusive ao recuperar relatório persistido; nenhum dado adicional é persistido. Incerteza bloqueia novo envio e consulta somente o ID original.
- A integração informa explicitamente observação pontual do contexto nativo, sem comprovar provider/MCP. Relatórios anteriores continuam anteriores com data; nenhuma leitura valida rascunho ou concede autoridade. Atualizar diagnóstico não chama setters de save/conflito nem troca o ETag do formulário.
- Skills de design nomeadas e ferramenta load_skill não constam no catálogo disponível; `.agents/skills/` está ausente. Preservados shell, tokens e classes responsivas existentes. Nenhum vídeo ou redesenho foi introduzido.

### Evidências executadas

| Prova | Resultado e limite |
| --- | --- |
| Renderização/interação da Configuração real | Dez testes novos em `global-readiness.test.ts`, React/happy-dom, formulário e hooks reais com transporte controlado. Conta não vinculada, necessidade de novo vínculo, identidade divergente e leitura indisponível; pasta não confirmada/ausente/inacessível/alterada; ausência total e restrição independente de perfil; integração pontual e ausência de seletor |
| E1/RNF-01/RNF-02 na abertura | Zero POST diagnostics, zero PUT settings; exatamente um Verificar status. Os dois botões explícitos enviam somente seu check a `/diagnostics?scope=host`. Sem rota de criação/início/publicação invocada; transporte controlado, não contagem de processos externos reais |
| E2/E3: resultado original | Um POST por ação, consulta GET da mesma Idempotency-Key/operationId, sem segundo POST; um único acesso à consulta no destino pertinente. Fechar/reabrir, conta/revisão, falhas de consulta e inversões também cobertos pelos testes existentes de useDiagnostics |
| E4: rascunho/save/conflito | Campo da pasta mantém valor e nó DOM ao atualizar; foco no botão de atualização preservado no DOM simulado. Saves 400 e 412 preservam rascunho, erro/conflito e comparação separada após refresh e verificação; somente um PUT com If-Match original |
| Recorte final | `validacao-sprint003-final.json`: 94 testes aprovados, zero falhas, oito arquivos, incluindo segurança HTTP, cliente, diagnóstico, recibos e linguagem. Transporte/adapters controlados |
| Suíte integral | `validacao-sprint003-integral.json`: 1.632 aprovados, zero falhas e zero pendentes, 126 arquivos. Executada antes do último ajuste exclusivamente de cópia histórica/tradução de erros em GlobalReadiness; esse ajuste e a separação final de cenários da fixture foram cobertos pelo recorte final |
| Typecheck / lint | `npm.cmd run typecheck` e `npm.cmd run lint`: exit 0; strict e limites existentes preservados |
| Build final | `npm.cmd run build`: exit 0, 379 módulos; index-xhqW-JG1.js 1.005,28 kB / gzip 253,04 kB. Aviso conhecido de chunk acima de 500 kB permanece |
| Whitespace | `git diff --check`: exit 0; Git somente leitura |

Falhas de preparação preservadas em `validacao-sprint003-inicial.json`: Value.Create não gera strings com pattern sem default. A fixture passou a fornecer SettingsView explícito. Asserções posteriores foram alinhadas aos textos humanos já produzidos por OperatorDiagnosticCard, e o teste de save passou a fornecer uma instanceId técnica controlada antes de tentar o PUT. Nenhum schema, gate, conflito ou proteção de produção foi relaxado.

### Checklist §5 aplicado à superfície

| Item de §5.2 | Evidência existente ou lacuna |
| --- | --- |
| Sessão/cookie | http-security e cliente no recorte; configuração não alterada. Cookie observado no browser permanece pendente |
| RLS | N/A SQLite; escopo host/conta e isolamento de useDiagnostics preservados, testes existentes no recorte/integral |
| CORS/Host/Origin | Segurança HTTP existente exercitada no recorte; sem middleware ou origem nova |
| Rate limit | Suíte integral de segurança existente; sem limites alterados |
| Validação de entradas | Checks globais exatos nos novos testes; schemas/CSRF/revisões existentes no recorte |
| Webhook | N/A; nenhum webhook |
| Segredos | Nenhuma fonte de segredo, configuração ou credencial nova; fixtures só contêm identidades sintéticas |
| Upload/artefatos | N/A à UI alterada; nenhuma ampliação de upload/download |
| Autoridade após observação | Gates inalterados; regressões existentes de início/publicação na integral. Nenhuma observação tratada como autorização |
| Zero efeitos por navegação | Contadores de requests na abertura e consulta original; serviço de diagnóstico e segurança controlados no recorte. Navegação real desktop/mobile pendente |
| Dados/proveniência/recibos | Relatórios por seção, históricos rotulados anteriores e correlação original preservados; sem mudança SQL/DTO |
| Respostas antigas/rascunhos | Testes de useDiagnostics e novos testes do formulário com 400/412 e foco DOM |
| Resposta perdida | Testes existentes accepted/uncertain e recuperação da operação original, sem replay |
| Linguagem sem códigos/IDs | Renderizações no recorte; ausência total global tem cópia própria. Inspeção visual de todos os estados permanece pendente |
| Mesma versão nos checks/revisão/publicação | Sem alteração nessas superfícies; regressões existentes na integral, sem prova externa nova |

### Histórico da pendência de browser (superado pela execução abaixo)

#### Reavaliação após feedback do Evaluator — 2026-10-22

Playwright MCP está exposto nesta reavaliação. A tentativa de navegação para `http://localhost:4310` falhou antes de carregar a página: `Browser is already in use`, com orientação do MCP para usar `--isolated`. As tentativas de fechar a página, listar abas e consultar a sessão por `browser_run_code_unsafe` retornaram o mesmo erro. As ferramentas expostas não oferecem parâmetro de isolamento. Não houve execução de cenário, carregamento de assets no Chrome ou screenshot. Não foram encerrados processos de outras sessões nem alterado o perfil do navegador. O registro anterior de ferramenta ausente descreve a execução anterior; o impedimento atual é a inicialização do navegador MCP.

Validação técnica repetida nesta reavaliação: `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint` e `git diff --check` concluíram com exit 0. O recorte `global-readiness.test.ts`, `useDiagnostics.test.ts` e `diagnostic-notices-rendering.test.ts` aprovou 37 testes, zero falhas, registrado em `validacao-sprint003-reavaliacao.json`. Build manteve `index-xhqW-JG1.js` e `index-Dm67tbx6.css`, com o aviso existente de chunk acima de 500 kB.

**feat-007-c5 continua pendente e a sprint continua reprovada por falta da prova desktop/mobile.** Para retomar, é necessário liberar a sessão que usa o perfil do Playwright MCP ou disponibilizar o MCP com `--isolated`; então executar os cenários abaixo com assets reconstruídos/recarregados. A validação técnica não substitui essa prova. Nenhum código de produto foi alterado nesta reavaliação.

Playwright MCP não consta entre as ferramentas expostas, após busca pelo nome e descrição. Não houve chamada recusada nem rejeição de aprovação: a capacidade está ausente. Não foram usados CUA, Desktop Commander ou Playwright por outra interface para apresentar um resultado como a prova MCP exigida.

`sprint003-assets.json` registra Node 24.22.0, assets reconstruídos e SHA-256. Esses arquivos **não foram carregados/recarregados em Chrome nesta execução**: loadedAssets=null e executedViewports=[] são explícitos. Viewports previstos, ainda não executados: desktop 1440×1000 e mobile 390×844. Nenhum screenshot ou contraste/foco renderizado é declarado.

Permanecem pendentes em ambos os viewports: abrir Configuração; estados de conta e pasta; acessar Perfis e voltar; executar cada verificação sintética; atualizar leitura preservando foco/rascunho/erro/conflito; consultar operação original; operar todos os controles por teclado; abrir/fechar os diálogos existentes e conferir retorno ao disparador, foco visível, rolagem e layout. A futura prova deve reconstruir/recarregar os assets da versão então sob prova e registrar cenário/viewport/assets/screenshots neste diretório. Testes happy-dom não dispensam RNF-06.

Nenhum banco operacional, GitHub/keyring, seletor nativo, Maestri/OMP/provider, recrutamento ou publicação foi acionado. Não houve Git de escrita, commit/push, migração ou instalação. **A sprint não está declarada entregue ou aceita integralmente enquanto faltar a prova visual obrigatória.**

### Reavaliação executada — Playwright MCP/Chrome desktop e mobile

Executada em 2026-10-22, Chrome 155.0.8059.86 no Windows, via `browser_run_code_unsafe` do Playwright MCP. A sessão iniciou normalmente; a primeira navegação encontrou a porta 4310 sem servidor. Foi iniciado somente o servidor estático `sprint003-static.mjs`, após `npm.cmd run build`, com APIs interceptadas por fixtures sintéticas no navegador. Nenhum banco operacional foi aberto. A indisponibilidade descrita acima é histórica e não se aplica a esta execução.

`sprint003-browser.playwright.js` contém as fixtures e asserções executadas. `sprint003-browser-result.json` registra cenários, controles, estilos de foco, viewport e requests com correlação das operações. `sprint003-loaded-assets.json` registra SHA-256 calculado no próprio navegador após recarga sem cache; os dois hashes coincidem com os assets reconstruídos em `sprint003-assets.json`: JavaScript `index-xhqW-JG1.js` e CSS `index-Dm67tbx6.css`. Não houve alteração de código do produto nesta correção.

| Cenário | 1440×1000 e 390×844 |
| --- | --- |
| Configuração → Gerenciar Perfis → Novo perfil → Configuração | Acesso por Enter; abertura/navegação geram zero POSTs diagnostics e zero mutações (RNF-01/RNF-02). Todos os requests de API ficam interceptados, portanto zero chamadas a adapters externos |
| Teclado na Configuração | Todos os controles visíveis habilitados alcançados por Tab; `:focus-visible`, outline/sombra registrados. Campos e ações conservam a sequência do layout existente; seletor nativo permanece explicitamente desabilitado na fixture |
| Diálogo Criar perfil | Foco inicial dentro do diálogo, 24 Tabs sem escape de foco, Escape fecha e devolve foco a Novo perfil. Screenshot registra footer e foco; nenhum perfil criado |
| GitHub | Único Verificar status, acionado por Enter; detalhes abertos pelo teclado mostram identidade sintética sem vínculo/troca de conta |
| Rascunho e conflito | Save controlado retorna 412; atualização preserva campo `C:\draft-browser`, conflito, comparação separada e foco no botão. Cobertura 400 permanece nos testes de renderização executados novamente |
| Verificações explícitas | Um POST global por check `configuration` e `maestri_context`; Enter em Consultar resultado original realiza GET da operação com a mesma Idempotency-Key, sem repetir POST. Integração mantém texto de observação pontual, sem afirmar provider/MCP |
| Layout e linguagem | Seis screenshots inspecionados: `sprint003-{desktop,mobile}-{configuration,profiles,dialog}.png`. Sem overflow horizontal na Configuração (scrollWidth 1425/375 para viewport 1440/390); seções, ordem, campos e footer existentes preservados, sem redesenho |

Checklist §5: a lacuna de navegação real e inspeção visual desta superfície está resolvida pelas provas acima. As demais evidências de segurança/renderização/linguagem da tabela anterior são reutilizadas. A fixture de sessão é sintética: observação de cookie real permanece explicitamente fora desta prova, sem atribuir a ela validação do controlador HTTP. Os erros 412 no console são respostas intencionais do cenário de conflito; o status de reconexão decorre do SSE sintético, não de uma integração real.

Validação técnica repetida: build, typecheck, lint e `git diff --check` passaram; **45 testes aprovados, zero falhas**, em quatro arquivos (`global-readiness`, `useDiagnostics`, `diagnostic-notices-rendering`, `http`), relatório `validacao-sprint003-browser-reteste.json`. O aviso existente de chunk acima de 500 kB permanece. As duas tentativas iniciais do roteiro falharam por seletores de teste (título Perfis Globais e identidade dentro de details fechado); os seletores foram corrigidos e a jornada completa passou nos dois viewports. Nenhum comportamento de produto foi alterado para fazer a prova passar.

**feat-007-c5: prova obrigatória executada e aprovada pelas asserções e inspeção desta rodada; entrega disponível para reavaliação independente.** Sem provider, recrutamento, publicação, instalação de dependências, Git de escrita ou início de outra sprint.

## Sprint-004 — Localizar condições do projeto e da preparação

Data: 2026-10-22. **Implementação e validações locais concluídas, incluindo Playwright MCP/Chrome desktop/mobile com API sintética.** Entrega disponível para revisão; nenhuma aprovação de fase ou próxima sprint foi iniciada.

### Fontes e alterações

- AGENTS.md, SPEC deste pacote, US-02/03/09/10 e RF-06–17/20, inventário/progresso anterior, GLOSSARY e responsabilidades da integração Maestri/OMP. SPEC.md da raiz continua ausente antes desta tarefa; não foi restaurada nem reconstruída. CodeGraph orientou a leitura dos componentes; arquivos atuais prevaleceram. Context7 confirmou a preservação de estado React na mesma posição. As skills de design nomeadas e load_skill não estavam disponíveis; preservados os componentes, tokens, layout e modal existentes, sem nova dependência.
- `ProjectReadiness.tsx` distribui as observações existentes de configuration por origem/remoto, quadro/Status e associação dos papéis. A classificação escolhe somente o destino de apresentação; não calcula elegibilidade. Conta/pasta mantêm acesso à Configuração; existência global de perfis permanece distinta da associação no projeto. Informações de alterações locais e revalidação não geram cartão de bloqueio.
- `ProjectConfigurationForm` reutiliza useDiagnostics no contexto project aberto: um Verificar condições do projeto, atualização GET e consulta da operação original. Ações não dependem de seletor técnico. A verificação consulta o salvo; não escreve campos, não troca ETag do editor, não confirma save e permanece fora do fieldset bloqueado. Locks de tentativa/publicação, exclusão, rascunhos e conflito continuam com seus mecanismos anteriores. Catálogo preservado com resumo e acesso, sem relatório completo novo.
- `PreparationDialog` localiza as condições recebidas junto da seleção da issue, configuração efetiva e critérios. Remoto/base, repositório arquivado, revisão e referência de perfil ficam no resumo efetivo. Impedimentos globais têm resumo e acesso à correção; revalidação é informativa. Iniciar e hasBlockingPrerequisites não foram alterados. Não há useDiagnostics de preparação, preflight manual obrigatório, novo endpoint, regra de domínio, SQL ou migration.
- `IssueOptionsNotice` agrupa os códigos equivalentes de acesso também quando vêm em prerequisites, conservando restrições distintas e nova consulta. `operator-language.ts` passa a identificar causas de fechamento/tipo, leitura incompleta, vínculo/Status/bloqueadores e divergências de base/repositório/revisão/perfil. Os códigos não aparecem como explicação principal.
- Checks mantêm comando, cwd relativo e timeout editáveis no fluxo existente. A regressão de verification agora compara explicitamente a captura completa antes/depois da alteração posterior da configuração, além de conferir comandos/resultados históricos. O teste encerra a tentativa e comprova remoção do lock antes da edição posterior; não contorna a proibição de editar projeto durante tentativa ativa.

### Provas técnicas e comportamentais

| Prova | Resultado e limite |
| --- | --- |
| Novos testes de renderização | 15 testes em project-readiness.test.ts: localização, associação versus coleção, único configuration, operação original sem replay, checks editados/DOM/foco preservados, lock e preparação bloqueada com linguagem específica |
| RNF-01/RNF-02 | Abrir projeto gera zero POST diagnostics e zero saves. Preparação usa somente seu POST de criação já existente; zero consultas diagnostics, início ou publicação. Após ação explícita, um POST configuration e GET do mesmo operationId, sem repetição. Contadores do transporte controlado; não são medição de processos externos |
| Recorte final após linguagem | `validacao-sprint004-direcionada-linguagem.json`: 112 testes aprovados, zero falhas; inclui preparação, operação/diagnóstico, verification, lock, useDiagnostics e linguagem |
| Suíte integral | `validacao-sprint004-integral.json`: 1.647 aprovados, zero falhas e pendentes, antes do último ajuste exclusivamente de linguagem; ajuste final coberto pelo recorte de 112 testes e browser final |
| Typecheck e lint finais | npm.cmd run typecheck e npm.cmd run lint: exit 0 |
| Build final | npm.cmd run build: exit 0, 380 módulos, JS index-BySLvHl8.js 1.016,16 kB / gzip 255,33 kB; aviso conhecido acima de 500 kB preservado |
| Whitespace | git diff --check: exit 0; nenhuma ação Git de escrita |

Falhas dos ensaios iniciais: duas expectativas de texto dos testes diferiam de maiúsculas/minúsculas da cópia existente; consulta de recibo precisava avançar o timer real de 500 ms do hook. Testes corrigidos sem alterar o comportamento. O build da ampliação de linguagem detectou duas entradas de base já existentes; duplicatas retiradas, preservando as originais. Typecheck/build finais passaram. O recorte inicial com falha permanece em validacao-sprint004-direcionada.json.

### Prova Playwright MCP/Chrome da versão final

Chrome 155.0.8059.86, Windows. A busca inicial não expunha Playwright; uma nova descoberta tornou a ferramenta disponível e a prova foi executada, resolvendo a pendência inicial. `sprint004-browser.playwright.js` contém fixtures e asserções; `sprint004-browser-result.json` registra a jornada final de 2026-10-22T23:21:28Z, requests, controles, foco, viewports, browser e hashes calculados pelo Chrome após recarga.

- Desktop 1440×1000 e mobile 390×844: todos os controles visíveis habilitados das duas superfícies foram alcançados em 100 Tabs por diálogo, com foco contido e :focus-visible/outline ou sombra registrados. Abrir por Enter e fechar por Escape devolveu foco a Selecionar projeto e Preparar. Acesso a Perfis operado por teclado. Links de correção também integram a sequência Tab.
- Origem/remoto, papéis, quadro, comando/cwd/timeout e ações localizados; três campos de check preenchidos. Save sintético retorna 412. Atualizar leitura preserva rascunho, conflito e foco. Uma verificação explícita envia somente configuration com project id aberto; consulta usa a operação original e não repete POST.
- Preparação controlada com issue fechada, base divergente, repositório arquivado, referência alterada, conta divergente e critérios inválidos: permanece bloqueada, sem diagnóstico de preparação. Consulta parcial mostra aviso/nova consulta; resposta completa remove aviso. Critérios e resumo global têm linguagem específica, sem Atenção necessária genérica para esses casos.
- JS carregado: `index-BySLvHl8.js`, SHA-256 `2c37233dc36df68831f313262d1341fc8eea0440061bda6c923cd19b8b912ce7`. CSS `index-Dm67tbx6.css`, SHA-256 `31e6eb824fc6a292fdeea1c6b85cb08c577fcd3965d8f61a73197d652dafc87b`. Ambos conferidos com dist/web. Não há nova folha de estilo.
- Screenshots sprint004-{desktop,mobile}-{project,checks-conflict,preparation,criteria}.png. Inspecionados desktop projeto/configuração efetiva e mobile projeto/configuração efetiva/critérios; navegação alcança conteúdo com rolagem interna, sem overflow horizontal global. Footer e composição existentes preservados.
- Jornada final: zero pageerrors. HTTP 412 no console é intencional. Ensaios anteriores pararam no beforeunload e na confirmação existente Sair e manter rascunho; o roteiro passou a operar essa confirmação antes de navegar. Outro ensaio tentou focar a navegação durante restauração assíncrona de foco; aguardou-se a conclusão do diálogo antes do Enter. Nenhuma proteção de produto foi removida.
- Servidor estático próprio `sprint004-static.mjs`, PID 26144, somente 127.0.0.1:4310; APIs interceptadas integralmente e servidor recusa /api. Um primeiro servidor próprio usando o script histórico foi encerrado e substituído por esse servidor restrito a loopback antes da jornada final. Página deixada em about:blank, interceptações removidas e servidor próprio encerrado. Sem banco do operador, provider, recrutamento ou publicação.

### Checklist §5 por superfície

| Item | Evidência ou limite |
| --- | --- |
| Sessão/cookie/Host/Origin/CORS/rate limit/CSRF | Sem alteração HTTP. Regressões existentes na integral; browser usa sessão sintética e não comprova cookie real |
| RLS | N/A SQLite; isolamento por objeto/conta/revisão reutilizado de useDiagnostics e seus testes, presentes no recorte |
| Validação de entrada | POST configuration exato e operação original; schemas, CAS e gates preservados nos testes de integração |
| Webhook/upload | N/A, nenhum endpoint ou upload novo; artefatos não alterados |
| Segredos | Fixtures sintéticas, sem credenciais, corpo de projeto ou ambientes reais; nenhum segredo ou configuração nova |
| Zero efeitos por navegação | Contadores web e requests Chrome; nenhuma chamada nativa ou adapter externo configurado na prova |
| Atualidade/rascunho/conflito/incerteza | Recorte useDiagnostics e formulário; refresh GET não salva; consulta do operationId original sem reenvio |
| Elegibilidade/autoridade | assessIssueReadiness, pipeline/start e blocked inalterados; testes preparação/lock e integral. Observação favorável não substitui gate de início |
| Captura/versão | Comparação integral explícita na regressão verification; checks históricos e comandos capturados preservados |
| Linguagem/renderização/teclado | 15 testes novos, recorte de linguagem e Chrome desktop/mobile acima; não é auditoria universal de acessibilidade |

Sem Git/GH, provider, Maestri/OMP, tracker, instalação de dependências, commit/push, migração ou alteração de instalação operacional. Provas controladas e browser com API sintética não equivalem a integração externa. Nenhuma próxima sprint, aprovação, Design Lock ou avanço de pipeline foi executado.
## Sprint-005 — Separar autoridade, recursos e versão na tentativa

Data: 2026-10-22. Implementação e validação local, com prova Playwright MCP/Chrome desktop/mobile de UI real e API sintética. Escopo US-04/05, RF-18–22, RNF-01/02/06. Esta execução não aprova fases nem inicia a próxima sprint. Fontes: AGENTS.md, SPEC deste pacote (§4.3 e §5), GLOSSARY.md, contrato de integração e garantias das sprints-002/003/004. SPEC.md da raiz continua ausente; não foi reconstruída. Alterações anteriores e concorrentes foram preservadas, inclusive README.md e SPEC_PROGRESS.md da raiz; esses dois arquivos não foram editados por esta sprint.

### Implementação e vínculo

- `AttemptConditions.tsx` mantém autoridade no estado operacional. Diagnóstico geral com o mesmo código da autoridade tem um único cartão detalhado, com a recuperação da autoridade; condições diferentes continuam separadas. Suspensão permanece explicitamente no estado, independente de autoridade, acompanhamento, resultado e limpeza. Nenhum gate foi modificado.
- Junto de Parada, ambiente e ações nativas, o hook existente recebe exclusivamente `{scope:'attempt',id:attempt.id}`. Oferece Verificar recursos somente quando esse check já é suportado, atualização GET e consulta da operação original. Condições atuais e relatórios anteriores continuam distintos, com as garantias de conta/revisão/ciclo da sprint-002. A consulta original não reenvia diagnóstico, não reconcilia publicação e não cria capacidade. A leitura dos registros explicita que não comprova parada física, acesso ao conteúdo ou abertura; a correção global aponta para Configuração. Ownership, parada incerta e falta de capacidade continuam nos controles de cada recurso.
- A identidade de seleção inclui tentativa, rodada e entrega. As respostas de primeira página, continuação, retry de seção, diff e evidência são descartadas depois de mudar essa identidade ou desmontar. A máscara de renderização evita mostrar registros da seleção anterior antes de o efeito limpar o estado. O resumo da mesma tentativa fica montado para preservar controles/foco, mas sua entrega inferida só é usada quando corresponde à consulta atual. ETag antigo de outra seleção não é oferecido.
- Recursos/resultado produtor têm uma identidade de leitura por tentativa/entrega. Publicação recebe uma instância por deliveryId, impedindo transferência da confirmação local de autorização entre versões. Não houve alteração nos contratos, identidade Git, schemas, SQL, endpoints, capabilities ou headers de produção.
- A prova Chrome reproduziu retorno de foco incorreto: a abertura do histórico escrevia o hash diretamente, sem registrar o disparador no shell. Agora usa o host de diálogo existente; abrir outro detalhe limpa seleção antiga de rodada/entrega. O botão Consultar tem referência DOM por attemptId, permitindo reencontrá-lo se a lista for recriada durante a mudança de filtro. Na ausência do disparador, permanece o fallback existente para navegação. Atualizar dados e trocar rodada mantêm foco nos controles exercitados.
- Linguagem: `captured` agora é apresentado como Capturada. Critérios vazios de uma entrega capturada não afirmam que a captura inexiste. Shell, estilos, geometria e layout aprovados foram mantidos, sem dependências novas. Skills de design citadas e load_skill não estão disponíveis; aplicado o checklist disponível react-best-practices, mantendo React 18 e os padrões locais. Context7 confirmou cleanup e descarte de conclusões assíncronas; CodeGraph orientou a leitura, confirmada nos arquivos atuais.

### Provas de comportamento, linguagem e contadores

| Evidência | Resultado e limite |
| --- | --- |
| `attempt-detail.test.ts` | Três testes React/happy-dom com componente e hooks reais: abertura GET-only; diagnóstico geral/autoridade duplicados apresentados uma vez e suspensão separada; POST explícito somente `resources` no attemptId aberto; respostas invertidas de seção/diff/log; foco ao atualizar. A versão final da fixture inclui diagnóstico favorável de recursos, sem liberar cancelamento/publicação recusados pelas capacidades. |
| `validacao-sprint005-direcionada.json` | 156 testes aprovados, sete arquivos: detalhe, useDiagnostics, verification, reviews, publication, PR e diagnóstico contextual. SQLite/HTTP inject reais e adapters externos controlados. |
| `validacao-sprint005-integral-final.json` | 1.650 aprovados, zero falhas/pendentes, 128 arquivos. Após esse resultado, somente a fixture do primeiro teste foi reforçada com diagnóstico favorável e a asserção de publicação indisponível; o recorte final abaixo passou com esse reforço. |
| `validacao-sprint005-final.json` | Recorte final de detalhe, baseline web e download/verification, após o reforço de diagnóstico favorável. Todos aprovados; conferir contagens no relatório JSON. Não se repetiram os demais cenários já aprovados. |
| Typecheck / lint / build | `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: exit 0 depois das correções de produção. Build: 381 módulos, `index-DhXT4if7.js` 1.020,02 kB / gzip 256,23 kB. Aviso conhecido de chunk acima de 500 kB permanece. |
| RNF-01/02 | Abertura do detalhe no DOM controlado e nas duas viewports: zero POST de diagnóstico por navegação e zero comando de negócio. Uma ação explícita de verificação por viewport produz um POST com `checks:['resources']`; consulta original usa GET com a mesma operação, sem segundo POST. Rastro completo em `sprint005-browser-result.json`. Bootstrap técnico é separado da navegação do detalhe. Nenhum provider, recrutamento, abertura nativa, criação, publicação ou reconciliação real. |
| Mesma identidade de conteúdo | Reexecutados testes existentes de verification (definições capturadas/tree/histórico/artifacts), reviews (clone/tree próprios e correção em outra rodada/versão) e publicação/PR (aprovação da versão corrente, retenção, autoridade revogada, stale e cancelamento). Relatório favorável não participa dos autorizadores; diagnóstico não alterou esses módulos. |

Falhas preservadas: a primeira compilação identificou import não usado e campo indevido na nova fixture; corrigidos antes dos checks finais. `validacao-sprint005-integral.json` registra 1.649 aprovados/uma falha: o teste antigo do histórico esperava alteração direta do hash. Foi adaptado para conferir o callback de abertura com os mesmos attemptId/projectId e disparador, mantendo paginação/abort/troca de projeto. A suíte integral final passou depois dessa adaptação. Nenhum gate de produção foi relaxado.

### Playwright MCP/Chrome e assets efetivamente recebidos

Autorização explícita desta tarefa para prova controlada pelo Implementador; não equivale à revisão independente prevista na integração. Browser Chrome 155, Playwright MCP disponível. Porta 4310 estava livre. Reutilizado o servidor estático documental existente `sprint004-static.mjs`, processo próprio PID 36328 / sessão 13400, limitado a 127.0.0.1 e com `/api` recusada fora da interceptação. Somente dist/web foi servido; banco do operador não foi aberto. APIs integralmente sintéticas, incluindo SSE finito, sem inferir integração externa.

- Assets reconstruídos e página recarregada em cada viewport: 1440×1000 e 390×844. Fetch do JS dentro do Chrome confirmou `index-DhXT4if7.js`, SHA-256 `21eea55b3133761ce0804c7874777bc624fb55766f498ef3cf7cad905ff5ca52`. Roteiro em `sprint005-browser.playwright.js`, dados controlados em `sprint005-fixtures.json`, resultados/rastros em `sprint005-browser-result.json`.
- Abertura pelo histórico; autoridade duplicada reduzida a um aviso, suspensão humana independente e recursos incertos/ownership não confirmado; ação de verificação/consulta original; atualização preservando foco; troca para rodada 2 pelo seletor customizado usando teclado. Diff e log da entrega A liberados depois de B não aparecem em B. Continuação usa `cursor-b` com deliveryId B; log/diff atuais de B são consultáveis e renderizados como texto.
- Cem passos Tab por viewport alcançaram os controles habilitados do diálogo, com foco visível e contido; Shift+Tab contido; Escape retornou ao botão Consultar, inclusive após recriação da lista. Troca de rodada preservou foco no seletor. Ações indisponíveis permanecem desabilitadas; não se simulou abertura nativa ou autorização externa. Links externos tiveram acesso por teclado, sem navegação ao GitHub. Largura global sem overflow nas duas viewports.
- Seis capturas atuais: `sprint005-{desktop,mobile}-{attempt,resources,version}.png`. Todas inspecionadas: hierarquia, estado/autoridade, recursos, controles e log da versão B legíveis; rolagem interna dá acesso ao conteúdo e rodapé permanece disponível. Não se declara auditoria universal de acessibilidade ou contraste além dos controles/viewports exercitados.
- Falhas de roteiro: primeiro uso de ArrowDown/Enter apenas abriu o popup de busca do seletor, sem selecionar Rodada 2; roteiro corrigido para ativar sua opção por teclado. Ao ampliar a prova, a fixture repetia o mesmo artefato na continuação e o locator strict encontrou dois logs; a página seguinte passou a representar outro check sem duplicação. Esses erros de fixture não foram convertidos em resultado do produto. A perda de retorno ao disparador foi defeito real corrigido e revalidado. Jornada final sem pageerrors.
- Ao terminar, página em about:blank, interceptações removidas e aba de teste fechada. Servidor próprio encerrado por sua sessão; porta 4310 reconferida sem listener. Nenhum processo alheio, CUA, Desktop Commander, Git de escrita, publicação ou provider.

### Checklist §5.2 por superfície e lacunas

| Item | Evidência ou lacuna real |
| --- | --- |
| Sessão/cookie, same-origin/Host/Origin, rate limit | Segurança existente preservada, coberta pela suíte integral; browser desta sprint tem transporte sintético, portanto não é prova de cookie HTTP real. Nenhum header, limite ou bootstrap de produção alterado. |
| Escopo/RLS | RLS N/A SQLite. Diagnóstico e ações recebem attemptId aberto; testes de escopo/conta em operation-diagnostics e useDiagnostics reexecutados. |
| Entradas/CSRF/revisão | Schemas e wrappers existentes, teste HTTP de diagnóstico protegido no recorte; nenhuma rota ou payload novo. ETag da seleção anterior indisponível. |
| Webhook/upload | N/A; nenhum webhook ou upload. |
| Segredos | Somente dados sintéticos nos anexos; nenhum ambiente, keyring, token real, credencial ou transcript coletado. |
| Download autorizado | `tests/integration/verification.test.ts`, caso “serves protected inert evidence…” reexecutado: anônimo 401, sessão válida 200, text/plain, CSP `default-src 'none'; sandbox` (asserção acrescentada), attachment, nosniff, no-store, path arbitrário 400, corrupção/ausência diagnosticadas, outra conta 404. Produção em http/routes/deliveries.ts inalterada; nenhuma ampliação de acesso. Browser sintético comprova exibição textual, não revalida esses headers reais. |
| Autoridade/versão após diagnóstico | Capacidades negativas continuam negativas com diagnóstico de recursos favorável; testes de publicação/revisão/verification reexecutados mantêm identidade e autoridade atuais. Integração GitHub/OMP real permanece fora deste ensaio autorizado. |
| Zero efeitos por navegação | Contadores locais/Chrome descritos acima; somente leituras e verificação manual solicitada. |
| Proveniência/histórico/recibos | Sem mudança de persistência; históricos rotulados, consulta original pela correlação existente, sem replay/reconciliação. |
| Respostas antigas/rascunhos | Corridas de seleção novas e vinte testes existentes de useDiagnostics no recorte, incluindo objeto/conta/revisão/fechamento/reabertura. Superfície não edita rascunho de configuração. |
| Resposta perdida | Casos accepted/uncertain/recibo indisponível de useDiagnostics reexecutados. Consulta só GET e nenhuma repetição de verificação no Chrome. |
| Linguagem/avisos | Autoridade, suspensão e recursos separados; estados capturados traduzidos; seis capturas e testes de renderização. Códigos/IDs não usados como explicação principal. |
| Mesma versão/correção | Suites verification/reviews/publication/PR e seleção/paginação/log no Chrome; prova externa não executada nem requerida pelo cenário controlado. |

Entrega local desta sprint concluída nos cenários e limites acima. Revisão independente, integração externa, parada física e aprovação de fase não são inferidas. Próxima sprint não iniciada.

## Sprint-006 — Localizar condições e consolidar efeitos da criação

Data: 2026-10-22. Implementação e validação local concluídas para US-06, RF-23–27/RF-39 e RNF-01/02/06–09. Fontes: AGENTS.md, SPEC deste pacote (§4.4, US-06 e checklist §5), GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, contratos HTTP de scaffold e garantias das sprints anteriores. SPEC.md da raiz permanece removida no workspace; não foi restaurada. Alterações anteriores preservadas. README.md e SPEC_PROGRESS.md da raiz não foram editados nesta sprint.

### Implementação

- Formulário e plano conservam pré-requisitos antes da autorização e oferecem acesso à correção global. Nenhuma modificação nos inputs, plan_hash, efeitos autorizados, capabilities, schemas ou persistência. A confirmação continua ligada ao plano existente; navegar ou consultar não autoriza criação.
- `CreationConditions.tsx` utiliza `useDiagnostics` existente com contexto implícito `{scope:'creation',id:creationId}`. Oferece recursos, configuração e identidade somente quando retornados como suportados. Não oferece nem solicita maestri_context, mesmo se uma resposta incorreta o listar. Atualizar leitura é GET; consultar resultado original reutiliza a correlação existente, inclusive após reabertura na mesma página. Relatórios anteriores continuam identificados e erros da ação/consulta permanecem separados. Não foi criado polling de diagnóstico; o hook conserva apenas a consulta das operações já solicitadas.
- `creation-effects.ts` consolida a projeção remota com seu registro durável pela combinação kind/operation_id; projeção sem operation_id associa-se ao registro do mesmo tipo, conforme o contrato existente. Identidades distintas permanecem representadas. Registro durável prevalece e a fonte exibida é identificada. Não há mutação das coleções recebidas. Cada efeito remoto aparece uma vez em Efeitos remotos e pendências; as listas locais conservam suas etapas confirmadas e pendentes, sem repetir os efeitos remotos numa segunda lista.
- `CreationResult` mantém conclusão independente dos pré-requisitos posteriores da issue e acesso à configuração do projeto. Falha de atualização conserva o resultado anterior, informa a falha e impede conferência baseada nessa leitura antiga. Falhas e resultados de outra creationId não aparecem no objeto novo. Falha inicial continua oferecendo nova consulta. Nenhum efeito ou reconciliação é disparado implicitamente.
- Modal, footer, CSS, tokens, navegação e layout existentes preservados. CodeGraph orientou a leitura. Skills de design nomeadas e load_skill não estão disponíveis no catálogo; não foram anunciadas como aplicadas. Referência visual existente conferida sem redesenho.

### Provas de comportamento e validação

| Prova | Resultado e limite |
| --- | --- |
| `creation-conditions.test.ts` | Quatro testes React/happy-dom: abertura GET-only; conclusão independente; efeito único; erro original e consulta indisponível após reabertura sem segundo envio; fontes imutáveis/identidades independentes; falha de atualização preserva resultado e troca de criação não herda esse resultado. |
| `validacao-sprint006-direcionada.json` | 121 testes aprovados: criação, useDiagnostics, eventos de formulário, scaffold local/remoto e diagnóstico contextual. Executado antes do quarto teste novo. SQLite/HTTP inject reais, adapters externos controlados. |
| `validacao-sprint006-final.json` | 33 testes aprovados em criação/useDiagnostics/eventos, incluindo o quarto teste novo e a máscara de contexto final. |
| `validacao-sprint006-integral-final.json` | **1.654 aprovados, zero falhas e zero pendentes**, success=true, após a última edição de produção e teste. Integral anterior em validacao-sprint006-integral.json: 1.653 aprovados antes do teste adicional e reforço de contexto. |
| Typecheck / lint / build | npm.cmd run typecheck, npm.cmd run lint e npm.cmd run build: exit 0. Build final: 383 módulos, index-BhIH-huL.js 1.024,40 kB / gzip 257,09 kB. Aviso conhecido acima de 500 kB permanece. |
| RNF-01/02 | Abertura e consulta controladas geram zero criações, reconciliações, vínculo, despacho ou publicação. Chrome: um POST explícito de diagnóstico por viewport, checks=['resources'], scope=creation e id aberto; dois GETs da operação original no total, sem segundo POST. Dois POSTs de plano e dois bootstraps técnicos são ações distintas, sem efeitos de criação. Rastro em sprint006-browser-result.json. |

Falhas de ensaio: o primeiro teste usava 503 esperando a mensagem de uma falha conhecida; o hook corretamente apresentou envio não confirmado. Ajustada a fixture para 409, sem alterar o hook. O teste adicional do componente inteiro inicialmente devolvia DTO de diagnóstico no endpoint de options; corrigida a fixture. Roteiro Chrome inicialmente usou títulos/botões homônimos sem escopo e tentou consultar antes da resposta da ação; locators foram delimitados ao plano/diálogo e a resposta original passou a ser aguardada antes da consulta. Uma substituição de texto via node -e falhou por quoting no PowerShell; corrigida por apply_patch. Esses ensaios não foram apresentados como sucesso; recorte, integral e browser finais passaram.

### Playwright MCP/Chrome — versão final

Chrome 155.0.8059.86, Windows, execução final em 2026-10-22T23:53:59Z. Servidor estático próprio PID 32244 / sessão 83300, em 127.0.0.1:4310, reutilizando sprint004-static.mjs. Porta inicialmente livre. Servidor recusa /api; todas as APIs foram interceptadas com dados sintéticos. Não foi aberto banco do operador. Assets reconstruídos e página recarregada em cada viewport: desktop 1440×1000 e mobile 390×844.

- JS recebido e hasheado no Chrome: index-BhIH-huL.js, SHA-256 `51fffbb1a4aab0fbeb7828114cde95986a32428c22a62dbc39836685ae5d5ca9`. CSS index-Dm67tbx6.css, SHA-256 `31e6eb824fc6a292fdeea1c6b85cb08c577fcd3965d8f61a73197d652dafc87b`. Ambos conferidos com os bytes de dist/web; CSS inalterado.
- Formulário remoto, plano com condição Git e acesso à Configuração, autorização por Space habilitando/desabilitando Criar projeto sem executar o comando. Resultado concluído com pendências posteriores, efeito incerto apresentado uma vez, erro da verificação e consulta indisponível simultâneos. Atualização de criação falha sem apagar o resultado anterior; nova leitura apresenta resultado parcial. Não foi criada nenhuma pasta/repositório.
- Cem Tabs por formulário, plano e resultado em cada viewport, com foco contido e marca visível por outline ou sombra; Shift+Tab também contido. Modalidade remota selecionada por teclado, campos remotos alcançados. Atualizar condições mantém foco no botão. Escape do plano e do resultado devolve foco ao disparador Criar projeto. Links de correção alcançados por Tab; abrir configuração disponível sem alterar os efeitos. Nenhum overflow horizontal global. Controles de conferir efeitos foram alcançados por teclado, sem ativação, pois a prova exige zero reconciliações implícitas e não requer efeito real.
- Oito screenshots atuais sprint006-{desktop,mobile}-{form,plan,completed,partial}.png; script sprint006-browser.playwright.js, fixture sprint006-fixtures.json e rastro sprint006-browser-result.json. Inspecionados formulário desktop, formulário/plano/resultado mobile e resultado desktop: hierarquia, erro original, consulta, pendências e footer legíveis com rolagem interna. Não é auditoria universal de acessibilidade ou integração externa. Jornada final: zero pageerrors; HTTP 409/503 são falhas sintéticas intencionais.
- Ao terminar: página em about:blank, interceptações removidas, servidor próprio encerrado pela sessão e porta 4310 sem listener. Sem CUA, Desktop Commander ou processo de terceiro encerrado.

### Checklist §5 por superfície

| Item | Evidência ou lacuna |
| --- | --- |
| Sessão/cookie/Host/Origin/CORS/CSRF/rate limit | Segurança existente e schemas preservados; regressões integrais e operation-diagnostics. Browser interceptado não comprova cookie/CSRF reais. Nenhum header ou limite alterado. |
| Escopo e concorrência | creationId explícito no diagnóstico; garantias objeto/conta/revisão/fechamento de useDiagnostics reexecutadas. RLS N/A SQLite. Máscara impede apresentação de resultado/erro de outra criação. |
| Entradas, autorização e replay | DTOs de plano/criação e operações inalterados; suites scaffold local/remoto reexecutadas. Agrupamento apenas visual; teste compara fontes antes/depois. Consulta não envia criação nem conferência. |
| Webhook/upload/download | N/A nesta superfície; nenhum endpoint, upload, arquivo servido ou download novo. Proteções de artefatos não alteradas; integral inclui regressões existentes. |
| Segredos | Somente identidades/caminhos e respostas sintéticas nos anexos. Nenhuma credencial, ambiente, keyring ou transcript coletado. |
| Resultado anterior e recibo | Teste de erro original/consulta indisponível/reabertura com um único POST e consulta original no Chrome; testes existentes de resposta perdida e relatórios anteriores reutilizados. Falha de atualização mantém criação anterior explicitamente marcada. |
| Autoridade e prontidão | Diagnóstico não participa de autorização; resultado completed não depende da prontidão posterior. Gates de criação/início/publicação inalterados e regressões integrais preservadas. Nenhuma integração externa inferida. |
| Linguagem e renderização | Estados humanos e proveniência sem IDs/códigos como explicação principal; condições Git, perfis posteriores, falha/incerteza e próximo passo observados nas capturas. |
| RNF-06 | Desktop/mobile, teclado, foco visível, atualização e retorno ao disparador executados com assets finais; rastro detalha controles e hashes. |

Entrega local concluída nos cenários controlados descritos. Nenhuma dependência, migration, criação real, provider, recrutamento, publicação, Git de escrita, aprovação ou mudança de fase. Integração GitHub/Maestri/OMP real e revisão independente não são comprovadas por essa prova e permanecem separadas. Próxima sprint não iniciada.

## Sprint-007 — Concluir histórico e resumos com provas por superfície

Data: 2026-10-22, horário de Brasília. Implementação e prova controlada concluídas localmente. Fontes: AGENTS.md, SPEC deste pacote (US-07/08/09, RF-28/29/32/39, RNF-01/02/06 e §5), inventário da sprint-001, destinos e provas das sprints-003 a 006, GLOSSARY e responsabilidades da integração Maestri/OMP. A SPEC da raiz continua ausente; não foi restaurada. CodeGraph consultado antes de editar. Skills de design nomeadas e load_skill não estão disponíveis; composição/tokens existentes preservados. Nenhuma dependência, migration ou contrato HTTP alterado.

### Implementação e comportamento

- `RecordsPanel` deixa de importar/consumir useDiagnostics, seletor de contexto e checks; removidos atualização/verificação/consulta operacional desse painel. Preservada a correção preexistente: nomes de projetos/issues, contexto dos eventos, filtros, acesso aos objetos e lista/paginação. Referências de tentativa/operação ficam em formulário recolhido com aplicação explícita, para digitação sem remount a cada caractere. Incluir eventos técnicos permanece disponível. Nenhum registro persistido foi apagado.
- `records-history.test.ts` monta componente/hook/wrapper reais com fetch controlado: consulta somente GETs de histórico/catálogo (bootstrap técnico separado), percorre continuação, muda filtro sem reaproveitar cursor e recusa qualquer chamada diagnostics/operations. Eventos de verificação entram pela página existente. A prova de recibo em `diagnostic-receipt-rendering.test.ts` agora pertence a `GlobalConditions` na seção Pasta, preservando conclusão anterior e privacidade de recibos/IDs.
- `dashboard-conditions.ts` combina onboarding, impedimentos e diagnósticos da fila na apresentação. Aliases conhecidos de ausência de conta/pasta e papéis são normalizados; identidade de projeto/tentativa e divergência de conta continuam na chave. Códigos não equivalentes conservam causa/próxima ação distintas. Ausência de todos os perfis resume os papéis somente no mesmo contexto. Observações anteriores ficam identificadas; fontes não são alteradas. Testes verificam deduplicação, objetos distintos e destinos.
- `DashboardPanel` mantém resumos com acesso à Configuração/Perfis, projeto ou tentativa correspondente. Diagnóstico de projeto agregado sem identidade fornecida pela fila aponta para a própria fila para identificar o objeto, sem inventar ID. Removidos cartões detalhados repetidos de onboarding/fila e o link Diagnóstico para Registros. Linguagem passa pelo tradutor existente. A integração é explicitamente última observação, sem garantia atual. Dashboard não consulta useDiagnostics nem inicia checks.
- Chrome revelou perda de foco ao desabilitar Atualizar painel. O botão agora mantém foco com aria-disabled e guarda contra nova atualização enquanto ocupado. A espera do ensaio web de observação foi alinhada a aria-disabled; contagens e gatilhos não foram alterados.

### Validação técnica

| Prova | Resultado |
| --- | --- |
| npm.cmd run typecheck | Exit 0 após alterações finais de produção/testes. |
| npm.cmd run lint | Exit 0; fronteiras/convenções preservadas. |
| Recorte final: records-history, dashboard-conditions, observation-baseline e diagnostic-receipt-rendering | 20 aprovados; `validacao-sprint007-direcionada.json`. |
| npm.cmd test integral final | Exit 0; **1.657 aprovados, zero falhas/pendentes**; `validacao-sprint007-integral-final2.json`. Inclui segurança HTTP, armazenamento, preparações e verificação existentes. |
| npm.cmd run build | Exit 0; 383 módulos, JS index-CBv0kJ7I.js 1.014,57 kB / gzip 255,35 kB. Aviso conhecido acima de 500 kB permanece. |
| git diff --check | Exit 0; Git somente leitura. |

Histórico de ensaio preservado: primeira integral `validacao-sprint007-integral.json` passou com 1.657 testes antes da correção de foco. `validacao-sprint007-integral-final.json` falhou somente na espera antiga do ensaio de observação: disabled já não representava o bloqueio ARIA. Corrigida a espera sem remover contagens; recorte e integral final2 passaram. Browser inicialmente reproduziu perda de foco real; outra tentativa aguardou diálogo antes de a coleção habilitar Novo perfil. A fixture passou a aguardar o botão habilitado. Esses resultados intermediários não foram apresentados como prova final.

### Playwright MCP/Chrome e contadores por superfície

Script reproduzível: `sprint007-browser.playwright.js`; rastro integral: `sprint007-browser-result.json`; quatro capturas `sprint007-{desktop,mobile}-{dashboard,records}.png`. Chrome 155.0.8059.86, desktop 1440×1000 e mobile 390×844. Assets reconstruídos e reload em cada viewport. JS index-CBv0kJ7I.js SHA-256 `8ade7d7836ad43991704d04aae02a7c1a361c00d56e6853c10c8e25965344fbf`; CSS index-Dm67tbx6.css SHA-256 `31e6eb824fc6a292fdeea1c6b85cb08c577fcd3965d8f61a73197d652dafc87b`. Bytes recebidos no Chrome comparados com dist/web: iguais.

- Servidor estático próprio 127.0.0.1:4310, primeiro PID 21456 e repetição final PID 22408, ambos encerrados pelas respectivas sessões após uso. Reutilizado sprint004-static.mjs, que recusa /api. Todas as APIs interceptadas, sem banco do operador. Página final about:blank e interceptações removidas. Sem CUA ou Desktop Commander.
- Dashboard: três fontes equivalentes de conta produzem um resumo; quatro causas/contextos distintos continuam visíveis. Links globais, de projeto e de tentativa conferidos; navegação a Perfis por Enter, abertura de Novo perfil, Escape e retorno de foco ao disparador executados. Atualizar painel dispara novas leituras e mantém foco. Última observação Maestri identificada como anterior.
- Registros: paginação próxima/anterior, incluir eventos técnicos por Space, seleção de projeto por teclado, filtro da tentativa e aplicação da referência de operação executados. Mudança de filtro sem cursor anterior; seção de referências aberta por Enter, edição e controles alcançados por teclado. 65 Tabs por superfície e viewport, contornos/sombras visíveis registrados; controles das referências também percorridos. Sem overflow horizontal global. Navegação lateral mobile mantém sua rolagem local aprovada.
- Capturas atuais das duas superfícies inspecionadas em desktop/mobile: hierarquia, ações e linguagem legíveis, composição existente mantida. Não é auditoria universal de acessibilidade. Stream sintético finito mostra Reconectando; esta prova não mede SSE real.
- **RNF-01/02:** rastro final contém somente GETs e dois POSTs de bootstrap session. Zero GET/POST diagnostics, zero verificações, vínculo/troca, criação, reconciliação, despacho, recrutamento ou publicação. Não se infere ausência de IO remoto das consultas normais do produto em ambiente real; os adapters desta prova são controlados.

### Checklist §5 por superfície e limites

| Item | Evidência ou lacuna |
| --- | --- |
| Sessão, cookie, Host/Origin, CORS, CSRF, rate limit | Nenhuma alteração de API/segurança. Regressões integrais existentes passaram. Chrome interceptado não comprova cookie/CSRF reais; provas HTTP existentes são reutilizadas, sem novo ensaio redundante. |
| Escopo/input/autorização | Contratos e DTOs inalterados. Cursores reiniciam em troca de filtro; condições agrupam por recurso, preservando restrições independentes. RLS N/A SQLite. |
| Histórico/recibos e replay | Nenhuma escrita ou exclusão por realocação. Evento de verificação consultável, recibo renderizado na superfície proprietária. UseDiagnostics e suas provas anteriores de contexto/recuperação não foram modificados. |
| Webhook/upload/download | N/A, nenhum endpoint, upload ou download novo. Artefatos e sua proteção permanecem na versão proprietária; regressões existentes na integral. |
| Segredos e linguagem | Fixtures sintéticas, sem credenciais ou headers privados coletados; rastro guarda método/path/query. Avisos usam português e destinos, sem códigos/IDs/recibos como explicação principal. Referências são campos recolhidos de filtro. |
| Autoridade e versão | Diagnóstico não autoriza início/publicação. Nenhum backend, configuração capturada, check/revisão ou gate de versão alterado; regressões existentes reexecutadas. |
| RNF-06 | Chrome real, assets finais, teclado/foco/refresh/retorno e viewports executados conforme rastro. Sem redesenho ou ampliação a ensaios externos. |

Sprint concluída nos cenários locais/controlados acima. Não comprova GitHub/keyring, provider ou integração Maestri/OMP reais, nem revisão independente por ref imutável. Não houve instalação operacional como alvo, staging, commit, push, publicação, aprovação ou mudança de fase. Evidências desta execução permanecem neste diretório.

## Sprint-008 — Consolidar evidências e pendências da versão entregue

Consolidação documental executada em 2026-10-22 (Brasília). **Checks locais aprovados; entrega integral pendente.** Fontes: SPEC deste pacote, stories, matriz da sprint-001, registros e anexos das sprints-002 a 007, AGENTS.md, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md §4. SPEC.md da raiz permanece ausente, conforme situação inicial; nenhuma reconstrução ou aprovação foi inferida.

- [Matriz final](matriz-final-sprint008.md): cada critério individual US-01–10, RF-01–39, RNF-01–12, E1–E4 e itens/cenários 5.1–5.3, incluindo N/A de RLS, webhook e upload. O catálogo anterior permanece histórico; a matriz final é o estado de conferência desta rodada.
- [Casos e versão](sprint008-casos.json): títulos completos e resultados de cada caso da integral, paths relativos e hashes de produção/recursos/configuração. Fingerprint `eb2b437c23bde05a3dfc9b266e5b4c27cfbadfa1077cc96496b4ebc2f2bc8806`; não é referência Git imutável. HEAD consultado `868020ba13a72665ffc5228e4c38453798c41d7b` identifica somente baseline, não o working tree entregue.
- [Conferência dos anexos](sprint008-conferencia.json): tamanho/SHA-256 dos artefatos existentes, assets, viewports, contadores por rastro e limites de correlação. [Checks](validacao-sprint008-checks.json) e [integral](validacao-sprint008-integral.json): typecheck, lint, testes e build configurados executados, todos exit 0; **1.657 testes aprovados, zero falhas/pendentes, 131 arquivos**. Build: 383 módulos, JS 1.014,57 kB/gzip 255,35 kB; aviso real acima de 500 kB preservado. Nenhuma falha técnica nesta rodada; falhas intermediárias anteriores permanecem nos anexos e no progresso proprietário.
- RNF-01/02 e intenção única: resultados de navegação e ações explícitas são separados na matriz. Totais dos POSTs diagnostics dos rastros 003/004/005/006/007: 4/2/2/2/0; não são execuções causadas pela navegação. Verificação SQL de intenção antes do IO, deduplicação e ausência de replay reutiliza operation-diagnostics; não se infere intenção durável somente de um screenshot ou de rastro que omite a chave. PUTs de conflito, criação de preparação existente e POST de plano explícitos permanecem discriminados.
- Escopo: somente documentação/evidências deste diretório editadas nesta sprint, sem implementação funcional adicional. Consulta `git diff --name-only` para HTTP/storage/contracts/package/lock não apontou alterações; demais alterações e arquivos novos preexistentes foram preservados. Zero mudança de schema, migrations, endpoints, contratos públicos, dependências ou autorização/elegibilidade atribuível a este fechamento. Checks funcionais, eventos técnicos e artefatos por versão permanecem cobertos pelos casos existentes. Git somente leitura; git diff --check passou.

### Validade visual e pendências obrigatórias

Assets reconstruídos: JS index-CBv0kJ7I.js SHA-256 `8ade7d7836ad43991704d04aae02a7c1a361c00d56e6853c10c8e25965344fbf`, CSS index-Dm67tbx6.css SHA-256 `31e6eb824fc6a292fdeea1c6b85cb08c577fcd3965d8f61a73197d652dafc87b`. Correspondem ao rastro final 007, desktop/mobile/teclado/foco de Registros e Dashboard. As provas 003–006 usam bundles anteriores; preservadas como evidências da versão observada, sem certificação automática do bundle final. Falta confirmação pertinente pelo Revisor, ou demonstração verificável de que as mudanças posteriores não invalidam cada superfície: Configuração, projeto, preparação bloqueada, tentativa e criação parcial.

Playwright MCP está disponível (listagem de abas consultada); não houve bloqueio automático, ausência de browser ou alegação de ferramenta indisponível nesta rodada. O contrato de integração §4 determina: “A validação visual completa dos critérios de aceite cabe ao Revisor independente sobre a versão fixa”. Este Implementador conferiu os artefatos, sem substituir esse papel por nova auditoria nem delegar sem autorização. Não se declara RNF-06 integralmente encerrado. Revisão independente por versão fixa e confirmação visual final continuam pendentes; isso impede conclusão integral, aprovação ou avanço.

Segurança reutilizada sem testes redundantes: sessão/cookie/revogação, 401 leitura uma vez/mutação sem replay, 403 sem replay, Host/Origin/CSRF, limites/Retry-After, schemas/CAS, logs/segredos, escopo/autoridade/idempotência, consulta sem efeito, rascunhos/histórico/linguagem e artefatos por versão. Browser sintético não prova cookie/keyring/provider reais. N/A dos mecanismos ausentes não dispensa escopo dos serviços ou proteção do download. .env.example inspecionado, cinco opções normativas sem novas variáveis; nenhum ambiente privado ou banco operacional lido.

Reprodução da consolidação: `node docs/Docs20261022_160728/consolidar-sprint008.cjs`, após os quatro checks configurados, confere o resultado integral e produz matriz/catálogos. Não executa provider, browser, Git/GH, pipeline, aprovação ou efeitos externos. Todos os artefatos desta rodada estão neste diretório; nenhuma instalação, integração real, publicação, commit ou push foi executado.

