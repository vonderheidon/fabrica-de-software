# Registro de aceite e decisões - retirada V4

## Continuação autorizada de 29/10/2026 às 16h37 - implementação e provas finais

Esta seção supersede somente os estados técnicos da continuação das 16h25 abaixo. Não altera gates internos do LionClaw nem transforma autorização de execução em aceite formal. O usuário autorizou prosseguir com as provas reais. Alvos privados e instalações descartáveis foram escolhidos e registrados antes dos respectivos efeitos; nenhum efeito foi dirigido ao repositório canônico da fábrica.

### Correções entregues

- workspaces/git.ts habilita core.longpaths=true por chamada somente no Windows. prepare.ts persiste a opção exclusivamente no clone novo da tentativa, e capture.ts exclusivamente no bare retido. A reprodução passou de Filename too long no clone e fetch local com exit 128/not our ref para clone/fetch/captura reais. O upload-pack local não herdava a opção efêmera da chamada. Nenhuma configuração Git global ou origem do operador foi alterada.
- Roteiros nativos usam instalação var/factory, resolvedor persistido e injeção no bootstrap, com criação explícita do pai .cache e prefixos temporários curtos. A recuperação confirma handoff também após a segunda tentativa no percurso completo.
- A prova de perda de rastreamento observa PIDs após aguardar a confirmação, distinguindo atividade imediatamente após perda de parada automática confirmada durante o await. Não se afrouxou o contrato do produto nem se fabricou parada.
- A orientação da prova de continuidade distingue IDs do contrato privado e exige que a evidência de progresso esteja literalmente também nos critérios pertinentes. Uma orientação intermediária do chat sobre findingKey estava errada: o código atual exige o UUID do achado. Ela foi corrigida; não foi alterado o validador para aceitar payload inválido.
- persistence-maintenance.test.ts registra EXPLAIN QUERY PLAN dos SELECTs realmente executados nas nove superfícies, com os mesmos bindings somente em memória. Instrumenta o aquecimento existente, sem requisições extras ou duração nas vinte amostras; relatório contém hash do SQL e plano, sem SQL, bindings, código ou cache.

A documentação oficial de Git for Windows confirmou o suporte core.longpaths. Context7 foi consultado primeiro e não trouxe o detalhe Windows necessário; complemento oficial: https://gitforwindows.org/git-cannot-create-a-file-or-directory-with-a-long-path.html.

### Verificação local da versão final

| Superfície | Resultado e evidência |
| --- | --- |
| Typecheck/lint/diff-check | PASS. Logs retirada-005-typecheck-last.log, retirada-005-lint-final.log em .tmp; diff sem whitespace inválido. |
| Suíte padrão | PASS, 1.999 testes em 170 arquivos, quatro workers: .tmp/retirada-005-tests-final-2.log. |
| HTTP | PASS, 4/4 em dois arquivos: .tmp/retirada-005-http-final.log. |
| Build | PASS: .tmp/retirada-005-build-final.log; aviso de chunk >500 kB permanece. |
| Compilado/execução/distribuição | PASS: .tmp/retirada-005-compiled-final.log, execution-final.log e distribution-final.log, com prefixo retirada-005 em todos. |
| Workspace e abertura | 34 testes dirigidos de prepare/capture/materialize; current-storage-open 4/4 na repetição isolada. |
| Persistência/processos | PASS: .cache/persistence-proof-7Jgcju/report.json, com schema54, recuperação física e planos atuais. Git/execução/revisão da medição permanecem controlados. |
| Revisão independente | Standards: nenhum achado pendente após corrigir criação de .cache. Spec: nenhum achado bloqueante nos deltas finais de produção. Revisão estática não substitui as provas reais abaixo. |

Falhas intermediárias preservadas: dois timeouts de 10 s em current-storage-open na campanha concorrente, seguidos de 4/4 isolados e suíte completa 1.999/1.999 sem ampliar timeout; primeira instrumentação SQL adicionava requisições e recebeu 429, corrigida para reutilizar o aquecimento; compilação de recursos nativos durante provas vivas falhou e foi repetida com sucesso após o encerramento delas. Não se promoveu execução interrompida a sucesso. A suíte completa antecede os últimos ajustes exclusivamente nos roteiros nativos; estes não pertencem à suíte padrão e receberam suas próprias execuções reais.

### E3: comparação observada, sem meta nova

Relatório: .cache/retirada-005-authorized-20261029/persistence-comparison.json. Mesmo Windows/Node24.22.0, massas0/16/64MiB, nove superfícies e vinte amostras. Baseline schema53/ledger antigo versus schema54 direto e fixtures ajustadas: não são bases idênticas.

- Nas três massas atuais: databaseBytes=1187840, walBytes=1726312, sharedMemoryBytes=32768 e otherAuxiliaryBytes=0; somente o trabalho operacional cresce pelos bytes do cache.
- Payloads das nove superfícies têm os mesmos tamanhos do baseline: 653,386,8331,4600,5335,763,339,938 e5249 bytes. Percentis e diferenças de tamanhos estão no JSON; não se atribui ganho de desempenho a esta retirada.
- Nove conjuntos de planos, 160 observações de statements por massa; planos iguais entre as três massas atuais. O baseline não registrou planos, portanto não existe comparação histórica de EXPLAIN. Os ajustes finais não mudaram consultas ou índices de produção.
- Metadados, referências Git, resultados e recuperação física continuam verificados pelo relatório. Conteúdo de checkout/cache não foi copiado ao banco nem ao relatório.

### Maestri/OMP real

| Cenário | Resultado comprovado | Evidência e limite |
| --- | --- | --- |
| Continuidade/correção | PASS no recorte: seis passagens, três versões, duas correções e duas conversas, uma por papel, preservadas dentro da tentativa; value.txt=3 ao final | .cache/c-eC3mIq/result.json, progress.json e bridge-trace.json. OMP18.13.3; openai-codex/gpt-6-luna/high confirmado por handshake; TUI, Git, SQLite e parada nativos. Rejeições são encenadas para exercitar transporte/correção; autoridade/efeitos GitHub controlados. |
| Outra tentativa e reutilização | Duas tentativas entregues; quatro IDs OMP distintos e dois terminais gerenciados reutilizados | .cache/r-ziGorX/handshakes.json e banco de fixture somente leitura, reconferidos em recovery-coverage.json. O roteiro completo original falhou ao tentar iniciar a terceira tentativa sem handoff; somente os fatos anteriores reconferidos são aproveitados. |
| Cancelamento/perda | PASS no recorte stops_only: cancelamento com pai/filho ativos, perda injetada no canal real, preservação da incerteza e parada física verificada | .cache/r-R68Qmu/result.json, duas passagens reais. Perda é induzida na fronteira de callback, não queda acidental do provider; o cleanup automático pode terminar durante a observação. |
| Criação completa | PASS, repo privado, push inicial e cinco operações de quadro confirmados | .cache/g-nCFVii/result.json e plan.json; quadro, cinco estados, vínculo e view verificados pelo produto. |
| Entrega/publicação | PASS, resultado entregue, Implementador e Revisor reais, checks Node observados, commit/push/PR da árvore aprovada | .cache/g-nCFVii/publication-result.json e pr-readback.json, duas passagens reais. Recibos do produto reconferidos por gh pr view independente. |

Efeitos externos criados e preservados: repositório privado https://github.com/vonderheidon/retirada-v4-20261029-e0870f77, quadro https://github.com/users/vonderheidon/projects/17, issue1 e PR2. PR aberto em https://github.com/vonderheidon/retirada-v4-20261029-e0870f77/pull/2, base main, head920680c15ce0ddf71c69c4f1e958be3598deab40, árvore revisada683748f513ac09fbebf60688db89cc7ba1a9c0b3. Não houve merge nem exclusão desses recursos.

Cada invocação OMP foi limitada pelo roteiro a seis passagens/nove minutos, ou quatro/nove minutos para publicação; stops_only limita a duas passagens. As repetições consumiram passagens adicionais e estão registradas. Não há custo monetário aferido para declarar. Logs e recibos de autorização/saída em .cache/retirada-005-authorized-20261029. Fonte/hash dos roteiros e produção em source-manifest.json no mesmo diretório.

Falhas reais preservadas: clone longo inicial; terminal de prova sem Maestro Mode; captura/fetch local; continuidade anterior recusada e encerrada por deadline; recuperação completa interrompida por ausência do segundo handoff; asserção de perda comparando liveness anterior ao await; preparação de publicação recusando destino explícito de projeto de origem local. Corrigiram-se os roteiros ou as causas pertinentes, sem converter recusas em aprovação. Resposta inicial da criação de issue foi perdida pelo parser do ensaio: a issue existente foi consultada e reutilizada, sem criar duplicata. O percurso público passou com origem local e destino implícito válido, sem alterar esse contrato para acomodar o ensaio.

### Segurança e INT: fronteiras atuais

| Critério | Evidência atual / limite |
| --- | --- |
| RNF-02 | http-security.test.ts e HTTP/compiled/distribution finais; Host/Origin/Fetch-Site/cookie/CSRF e revogação no reinício preservados. |
| INT-01/03/04/05 | Conexão nativa real, perfis efetivos, duas sessões por tentativa, TUI e ferramentas nativas nas provas acima. |
| INT-02/06/10 | Recusas reais de lançamento/resultado, resultado durável e recuperação de formato dentro da mesma sessão; logs de falha preservados. Não confundir refusas de domínio com transporte indisponível. |
| INT-07/09 | Pergunta humana e uso de MCP necessário não foram exercitados nestes cenários mínimos; regressões locais permanecem, sem novo PASS real desses critérios. |
| INT-08/16/17 | Perda induzida e parada de pai/filho próprios, outra tentativa em novo ambiente e conversas novas comprovadas no recorte acima. Não é matriz exaustiva de falhas. |
| INT-11 | Auditoria do Revisor atual por MCP, browser fechado; comparação integral continua parcial pelos limites abaixo. |
| INT-12 | GitNexus não requerido nos cenários; não foi executado, conforme instrução do workspace. |
| INT-13 | UTF-8 real nas tarefas/resultados em PT-BR e smoke socket fragmentado/EOF/malformed/oversize; nenhuma garantia adicional para todos os modos de falha. |
| INT-14 | TUI/lançamento Windows reais e smoke cwd/argv com espaços/Unicode usando Node. A combinação OMP real em cwd com espaços/Unicode não foi reexecutada; não promover esse smoke a esse aceite específico integral. |
| INT-15 | Cancelamento real no trabalho com filho comprovado; cancelamento durante inicialização permanece em provas locais, não novo cenário provider real. |
| INT-18 | Três versões/revisões na continuidade; publicação real com árvore/commit/PR da versão aprovada conferidos. |

### Interface revisada e gate restante

Evidência independente: .cache/retirada-005-reviewer-20261029/result.json, screenshots e snapshots. Foram renderizados modal longo, projeto sem alocação, plano integral, sessão reservada sem IDs, histórico e exclusão parcial, com APIs reais/controladas identificadas. Projetos1440x1000 ficou idêntico por SHA256 à referência aceita. Nenhum código web mudou nesta continuação. Browser do Revisor e o browser operacional do chat foram encerrados.

feat-038.AC1/AC2 permanecem PARCIAIS: o baseline aceito não contém os modais/estados específicos e a janela externa do Chrome difere. feat-038.AC3 passou para a nova evidência identificada. Não existe captura retroativa nem igualdade universal de pixels/ações declarada.

| Critério Sprint005 | Estado final desta continuação |
| --- | --- |
| feat-035.AC1/AC2/AC3 | PASS local no recorte documentado, inclusive plano atual e comparação dos parâmetros disponíveis; baseline sem EXPLAIN preservado como limite. |
| feat-039.AC1/AC2/AC3/AC4 | Revisão/cortes/checks/alinhamento documentados; sem achado bloqueante nos deltas. Auditoria visual conserva seu gate próprio. |
| feat-040.AC1 | Autorização registrada e alvos isolados; efeitos reais delimitados nos planos/recibos. |
| feat-040.AC2/AC3 | Provas reais realizadas nos recortes acima, com publicação confirmada; INT sem novo cenário real mantêm os limites explícitos. |
| feat-040.AC4 e feat-041.AC1/AC2/AC3 | Cobertura e pendências rastreáveis, sem promover mocks/histórico a evidência real atual. Esta seção resolve as pendências genéricas de Maestri/OMP/criação/publicação da matriz anterior somente nos cenários efetivamente executados. |
| feat-041.AC4 / encerramento integral | PENDENTE. Comparação visual integral, combinação real específica de INT-14, recortes INT sem nova prova quando exigidos pelo gate e aprovações formais não são declarados satisfeitos. |

### Ativação operacional

O servidor estava parado; Shell #5 foi confirmado no prompt do repositório canônico e iniciou npm.cmd start, com health200. O backend então ativo antecede os últimos ajustes Windows de git/prepare/capture, comprovados no bundle compilado por provas isoladas.

A consulta atual de shutdown retorna o mesmo impedimento anterior: um executor de id9b07451f-7d34-43fa-bf01-7eea1a681042, tentativa ce38022e-aeb1-42d8-830e-0e264d437ee0, estado uncertain. GET resources retorna terminais com parada confirmed e cleanup complete. O código preserva sessões lógicas uncertain mesmo após alguns recibos de parada; isso explica por que a leitura de recursos por si só não elimina o bloqueio, mas não autoriza reescrever o estado. Nenhum registro operacional foi alterado manualmente, nenhum encerramento foi forçado e nenhuma fila foi pausada para contornar a condição. A ativação operacional final continua pendente de reconciliação pelo contrato vigente ou decisão de escopo específica. A divergência preexistente não foi transformada em nova funcionalidade nesta retirada.

Não houve commit, stage ou push no repositório canônico; os commits/push/PR descritos acima pertencem exclusivamente ao repositório privado de prova autorizado.



## Continuação direta da Sprint 005 - revisão iniciada às 16h25 de 29/10/2026

Não há nova implementação funcional pendente demonstrada nesta revisão. Há correção dos roteiros de comprovação: session-continuity.proof.ts e session-recovery.proof.ts ainda injetavam a raiz global da fixture e não forneciam projectStorageRootForAttempt ao adapter. Agora usam instalação var/factory, resolvedor de produção com persistência, raiz corrente para leituras e bootstrap, e recriam o inspector ao reabrir storage na recuperação. Rechecagem de evidência usa o novo layout; os relatórios históricos não foram regravados nem revalidados por esse caminho. O teste de storage-transition cobre alocação, recusa antes dela e resolução após reabertura dessa fixture. Isso prepara a prova real; NÃO comprova execução OMP.

### Verificações desta continuação

- typecheck e lint passaram; HTTP 4/4; build passou, mesmos assets index-DTl89MIO.js e index-CK1Sh9xa.css.
- Suíte integral antes dos ajustes finais dos roteiros: 1.998 testes em 170 arquivos, 87,48 s, PASS. A contagem observada difere do registro anterior de 1.999; não foi substituída por aquela contagem.
- test:persistence: 52/52, PASS. Smokes compiled, execution-compiled e distribution: PASS. Logs desta rodada em .tmp/retirada-1625-*.log.
- proof:persistence: PASS, .cache/persistence-proof-xPEftY/report.json, observado às 19:29:32 UTC, Node v24.22.0, schema 54. SQLite/filesystem/HTTP e recuperação em processos físicos; GitHub/execução/revisão controlados. Não é prova de provider.
- Testes dirigidos: current-storage-open, storage-transition e http-security passaram 34/34 antes do novo caso; storage-transition passou 7/7 incluindo o novo caso de layout/reabertura. Typecheck, lint e diff --check passaram após os ajustes. Nenhum código de produção ou interface foi alterado nesta continuação.

### Matriz de cobertura da versão

Versão: HEAD 6ee0391145832b34fc44c6af020013b211fb72bb mais working tree local. As fontes de produção continuam identificadas pelo manifesto .cache/retirada-final-20261029/source-manifest.json e pelo bundle recompilado igual. Mudanças adicionais desta continuação: dois roteiros nativos, fixture attempt e teste storage-transition; documentação de aceite/progresso. LOCAL significa evidência determinística da superfície descrita, não aceite integral. Cada linha abaixo aponta ao conjunto de implementação, prova positiva/negativa e limite definido no catálogo; não são novos requisitos.

| Conjunto | Implementação (caminhos relativos a apps/controller/src/modules, exceto prefixos explícitos) | Prova | Positivo / negativo | Resultado e limite |
| --- | --- | --- | --- | --- |
| B | storage/migrations.ts, database-inspection.ts, index.ts; resources/storage | storage.test.ts, local-installation.test.ts, tests/integration/current-storage-open.test.ts | Instalação/reabertura atuais; recusa de identidade/schema/ledger/dados incompatíveis sem mudar banco ou sidecars | LOCAL |
| Q | contracts/projects.ts; projects/status-mapping.ts, preparations.ts, queue.ts | contracts/project-mapping.test.ts; projects/project-mapping.test.ts; tests/integration/queue-scheduler.test.ts | Cinco IDs distintos; quatro estados e duplicados recusados | LOCAL |
| C | contracts/scaffold.ts; projects/scaffold.ts; storage/creations.ts; http/observation-views.ts | tests/integration/scaffold.test.ts, remote-scaffold.test.ts | Plano integral e recibos; plano incompleto recusado, replay controlado sem duplicação | LOCAL; efeito GitHub real PENDENTE |
| P | storage/historical-configuration.ts, configuration-json.ts, preparations.ts; pipeline/start.ts | storage/configuration-json.test.ts, profile-composition.test.ts, preparations.test.ts; tests/acceptance/execution-composition.test.ts | Captura/configuração atuais e nulos legítimos; costDefaults retirado recusado sem conversão | LOCAL; escolhas efetivas OMP PENDENTE |
| X | execution/index.ts, adapters/maestri-omp/bootstrap.ts; pipeline/start.ts; storage/execution.ts | tests/integration/recovery.test.ts, managed-terminals.test.ts; tests/native/session-continuity.proof.ts, session-recovery.proof.ts | Reserva sem IDs e recuperação controlada; incerteza preservada. Roteiros reais corrigidos, NÃO executados nesta rodada | LOCAL; Maestri/OMP real PENDENTE |
| R | workspaces/project-storage.ts, prepare.ts, capture.ts, diff.ts, materialize.ts, publication.ts, recovery.ts, retention.ts | workspaces/*.test.ts; tests/integration/storage-transition.test.ts; tests/native/project-deletion.integration.proof.ts | Localização corrente e transição; resolvedor/referência ausentes recusados, sem fallback global | LOCAL; percurso real PENDENTE |
| D | storage/project-deletion-paths.ts, project-deletion-worker.ts; workspaces/publication.ts, remote-publication.ts | storage/project-deletion-*.test.ts; tests/integration/project-deletion-http.test.ts; provas Windows anteriores em retirada-aceite.md | Inventário atual, identidade/geração e recibos; substituição/link/posse obsoleta recusados | LOCAL; publicação real PENDENTE |
| H | storage/historical-configuration.ts; modules/queries; http/execution-views.ts | tests/acceptance/persistence-maintenance.test.ts, persistence-audit.test.ts, persistence-report.test.ts | Bytes/referências e payloads leves preservados; ausência de conteúdo de checkout nos dados/respostas | LOCAL; plano de consulta PENDENTE |
| U | web/features/projects/ProjectForm.tsx, ProjectCreationDialog.tsx; features/queue/QueuePanel.tsx; app/operator-language.ts | Diff existente; .cache/retirada-final-20261029/result.json e pixel-comparison.json | Ramos antigos removidos; capturas anteriores do chat principal. Não demonstram todos os estados nem autoria do Revisor | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| S | http/security; configuração e autorização dos módulos atuais | tests/integration/http-security.test.ts; tests/integration/shutdown.test.ts; scripts/smoke-compiled.mjs | Sessão válida e leitura atual; Host/Origin/Fetch-Site/CSRF inválidos recusados, sessão revogada após restart | LOCAL |
| A | scripts/copy-resources.mjs, package-distribution.mjs, smoke-distribution.mjs | Build; smokes compilado, execução e distribuição desta rodada | Recursos portáteis e cwd distintos; segundo controller recusado; UTF-8/EOF e argv Windows com fixture Node | LOCAL; integração Maestri/OMP PENDENTE |
| N | retirada-inventario.md; SPEC.md; INTEGRACAO-MAESTRI-OMP.md; plano vigente | Inventário G1-G8 e revisões anteriores registradas; typecheck/lint desta rodada | Retiradas classificadas e garantias preservadas; registros históricos não promovidos a prova atual | LOCAL; gates formais PENDENTE |

| Critério da feature | Conjunto de evidências | Resultado |
| --- | --- | --- |
| US-01.C1 | B | LOCAL |
| US-01.C2 | B | LOCAL |
| US-01.C3 | B | LOCAL |
| US-01.C4 | B | LOCAL |
| US-02.C1 | B | LOCAL |
| US-02.C2 | B | LOCAL |
| US-02.C3 | B | LOCAL |
| US-02.C4 | B | LOCAL |
| US-03.C1 | Q | LOCAL |
| US-03.C2 | Q | LOCAL |
| US-03.C3 | Q | LOCAL |
| US-03.C4 | Q | LOCAL |
| US-04.C1 | C | LOCAL; efeito GitHub real PENDENTE |
| US-04.C2 | C | LOCAL; efeito GitHub real PENDENTE |
| US-04.C3 | C | LOCAL; efeito GitHub real PENDENTE |
| US-04.C4 | C | LOCAL; efeito GitHub real PENDENTE |
| US-05.C1 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| US-05.C2 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| US-05.C3 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| US-05.C4 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| US-06.C1 | X | LOCAL; Maestri/OMP real PENDENTE |
| US-06.C2 | X | LOCAL; Maestri/OMP real PENDENTE |
| US-06.C3 | X | LOCAL; Maestri/OMP real PENDENTE |
| US-06.C4 | X | LOCAL; Maestri/OMP real PENDENTE |
| US-06.C5 | X | LOCAL; Maestri/OMP real PENDENTE |
| US-07.C1 | R | LOCAL; percurso real PENDENTE |
| US-07.C2 | R | LOCAL; percurso real PENDENTE |
| US-07.C3 | R | LOCAL; percurso real PENDENTE |
| US-07.C4 | R | LOCAL; percurso real PENDENTE |
| US-07.C5 | R | LOCAL; percurso real PENDENTE |
| US-08.C1 | D | LOCAL; publicação real PENDENTE |
| US-08.C2 | D | LOCAL; publicação real PENDENTE |
| US-08.C3 | D | LOCAL; publicação real PENDENTE |
| US-08.C4 | D | LOCAL; publicação real PENDENTE |
| US-08.C5 | D | LOCAL; publicação real PENDENTE |
| US-08.C6 | D | LOCAL; publicação real PENDENTE |
| US-09.C1 | H | LOCAL; plano de consulta PENDENTE |
| US-09.C2 | H | LOCAL; plano de consulta PENDENTE |
| US-09.C3 | H | LOCAL; plano de consulta PENDENTE |
| US-09.C4 | H | LOCAL; plano de consulta PENDENTE |
| US-10.C1 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| US-10.C2 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| US-10.C3 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| US-10.C4 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| RF-01 | B | LOCAL |
| RF-02 | B | LOCAL |
| RF-03 | B | LOCAL |
| RF-04 | B | LOCAL |
| RF-05 | B | LOCAL |
| RF-06 | Q | LOCAL |
| RF-07 | Q | LOCAL |
| RF-08 | Q | LOCAL |
| RF-09 | C | LOCAL; efeito GitHub real PENDENTE |
| RF-10 | C | LOCAL; efeito GitHub real PENDENTE |
| RF-11 | C | LOCAL; efeito GitHub real PENDENTE |
| RF-12 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| RF-13 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| RF-14 | P | LOCAL; escolhas efetivas OMP PENDENTE |
| RF-15 | X | LOCAL; Maestri/OMP real PENDENTE |
| RF-16 | X | LOCAL; Maestri/OMP real PENDENTE |
| RF-17 | X | LOCAL; Maestri/OMP real PENDENTE |
| RF-18 | R | LOCAL; percurso real PENDENTE |
| RF-19 | R | LOCAL; percurso real PENDENTE |
| RF-20 | R | LOCAL; percurso real PENDENTE |
| RF-21 | D | LOCAL; publicação real PENDENTE |
| RF-22 | D | LOCAL; publicação real PENDENTE |
| RF-23 | D | LOCAL; publicação real PENDENTE |
| RF-24 | D | LOCAL; publicação real PENDENTE |
| RF-25 | H | LOCAL; plano de consulta PENDENTE |
| RF-26 | H | LOCAL; plano de consulta PENDENTE |
| RF-27 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| RF-28 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| RNF-01 | B | LOCAL |
| RNF-02 | S | LOCAL |
| RNF-03 | D | LOCAL; publicação real PENDENTE |
| RNF-04 | C | LOCAL; efeito GitHub real PENDENTE |
| RNF-05 | U | PARCIAL; auditoria visual completa do Revisor PENDENTE |
| RNF-06 | H | LOCAL; plano de consulta PENDENTE |
| RNF-07 | N | LOCAL; gates formais PENDENTE |
| RNF-08 | N | LOCAL; gates formais PENDENTE |
| RNF-09 | A | LOCAL; integração Maestri/OMP PENDENTE |
| RNF-10 | N | LOCAL; gates formais PENDENTE |

### E1, E2, E3, segurança e integração

- E1: B, instalação direta 54 e reconhecimento 53 conformes, ledger vazio versus ledger real; recusas sem escrita cobertas em current-storage-open e storage. Nenhuma migração operacional executada.
- E2: R/D, referência lógica v1 distinta da localização física corrente, alocação, transição e recusa sem resolvedor; transição atual e autorização de exclusão/publicação preservadas.
- E3 e metadados: H e relatório físico desta rodada. Mesmas massas 0/16/64 MiB, nove superfícies, vinte amostras; sem SLA ou ganho inventado. Os relatórios NÃO registram EXPLAIN QUERY PLAN; feat-035.AC2 não está integralmente fechado. A comparação histórica não equivale a igualdade de fixtures: schema/ledger e massa de dados sofreram as mudanças documentadas.
- RNF-02 / segurança HTTP: http-security.test.ts cobre sessão/cookie válido, rejeição de Origin/Host/Fetch-Site, bootstrap inválido e leituras sem sessão; compiled/distribution comprovam revogação após reinício. A sessão técnica continua distinta da autoridade GitHub.
- INT-13: test:execution-compiled desta rodada, UTF-8 fragmentado e EOF; malformed/invalidUtf8 = FRAME_INVALID, oversize = FRAME_OVERSIZE, incompleteEof = CHANNEL_EOF. Transporte local real, provider não executado.
- INT-14: mesmo smoke comprova lançamento Windows com Node como recorder, cwd/argv Unicode/espaços. TUI e lançamento OMP real desta versão permanecem PENDENTES.
- INT-01/02/03/04/05/06/07/08/15/16/17/18: regressões locais e roteiros existentes não substituem nova prova real; gates reais permanecem PENDENTES. INT-11 e feat-038 exigem auditoria visual completa atribuída ao Revisor.
- feat-039.AC4: revisões independentes anteriores preservadas com seus limites; os ajustes novos de roteiro não receberam nova revisão independente. Não atribuir revisão do chat principal ao Revisor.
- feat-040: autorização específica de alvo/perfis/provider/modelo/esforço/custo/efeitos solicitada nesta conversa; sem resposta registrada, nenhuma chamada paga, recrutamento, criação GitHub ou publicação foi iniciada.
- feat-041: rastreabilidade local ampliada nesta matriz; aceite integral PENDENTE. PRD/SPEC/plano/Design Lock e gates do pipeline mantêm somente os estados efetivamente registrados. Backend operacional ocupado permanece preservado, sem ativação ou reconciliação presumida.



## Entrega direta das sprints 002 a 005 - 29/10/2026, após 15h02

O usuário pediu implementação direta do restante e revisão do trabalho anterior. Implementação e verificações locais concluídas no checkout canônico; o aceite integral permanece pendente dos gates reais abaixo. Nenhum estado interno do pipeline foi alterado. A conclusão anterior da Sprint 001 e a decisão das 14h20 permanecem preservadas.

| Recorte do plano | Resultado desta entrega | Evidência |
| --- | --- | --- |
| Sprint 002, feat-004 e origens 005/006/014 | Implementação e prova local concluídas | Instalação direta v54 com 57 tabelas e ledger vazio; reconhecimento v53 com ledger real; testes de identidade/schema/checksums/integridade/FK, reinício sem DDL/seed e perfis com composição legitimamente nula. Bootstrap inspeciona também todas as capturas, revisões de preparação e referências de implementação antes de escrita. |
| Sprint 003, feat-007/010/013 | Implementação e prova local concluídas | Cinco estados distintos em leitura/escrita; plano remoto integral em HTTP/storage/consulta; retirada dos codecs antigos e do descarte de costDefaults. Tests current-storage-open verificam recusa sem alteração de banco/WAL/SHM para captura, revisão inativa de preparação e referência global retiradas. |
| Sprint 003, feat-016 e regressões atuais | Conferência estática e regressões locais concluídas | Preservados opcionais legítimos de sessões, perfis e resultados; resultSchemaFor continua exigindo os campos pertinentes dos novos resultados. HistoricalProfile, evidências e chaves privadas atuais permanecem; nenhuma remoção baseada apenas em nome ou ausência. Prova Maestri/OMP nova continua pendente. |
| Sprint 004, feat-022/027 e origens | Implementação, regressões e prova Windows concluídas | Sem estado legacy nem resolvedor global; falta de persistência/resolvedor/referência é recusada. Consumidores de execução/bootstrap/captura/diff/materialização/revisão/publicação/recuperação/retenção exigem resolvedor. Exclusão enumera raízes registradas, transições atuais, original e destinos autorizados; não acrescenta work/git/execution-bootstrap globais. |
| Sprint 005, feat-035/039 | Provas locais, revisão estática independente e browser realizadas | Comandos abaixo, duas revisões independentes e 21 capturas atuais. Não se atribui autoria visual ao Revisor do produto nem aceite formal ao pipeline. |
| Sprint 005, feat-040/041 | PENDENTE no aceite real | Sem nova autorização específica de alvo, perfil/provider/modelo/esforço, custo e efeitos para Maestri/OMP, criação e publicação reais. Provas antigas conservam seus limites. Não declarar encerramento integral da feature. |

### Validação reproduzível

| Comando | Resultado |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0 |
| npm.cmd run lint | PASS, exit 0 |
| npm.cmd test -- --reporter=dot --no-color --maxWorkers=8 | PASS, 1.999 testes em 170 arquivos; 92,37 s |
| npm.cmd run test:http | PASS, 4 testes em 2 arquivos |
| npm.cmd run build | PASS; 410 módulos web; aviso existente de chunk acima de 500 kB |
| npm.cmd run test:compiled | PASS; HTTP/SSE/SQLite reais, CAS/idempotência, lock, shutdown e reinício; anchor controlado |
| npm.cmd run test:execution-compiled | PASS; sockets/UTF-8/EOF e lançamento PowerShell com fixture Node; sem OMP/provider |
| npm.cmd run test:distribution | PASS; artefato isolado, dois cwd, segundo controller recusado, identidade preservada e sessões revogadas no reinício |
| npm.cmd run proof:persistence | PASS; .cache/persistence-proof-aYwSta/report.json; schema direto 54, massa 0/16/64 MiB e recuperação em três processos distintos |
| npm.cmd run test:deletion-native | PASS, 26 testes Windows; referência/handle, substituição, links/junctions, retomada e exclusão integrada |
| npm.cmd exec -- vitest run --config vitest.deletion.config.ts tests/native/project-deletion.integration.proof.ts --reporter=verbose | PASS, 2 testes após a última conferência de referências no bootstrap |
| git diff --check | PASS, sem whitespace inválido |

A suíte inicial desta continuação passou 1.994 testes. As rodadas intermediárias expuseram 19 falhas de expectativas/fixtures antigas e depois uma fixture de fila sem tabela de transição; corrigidas para contratos atuais. A prova Windows integrada também exigiu substituir o alvo global da fixture pela raiz gerenciada e criar seu controle positivo de IO. Os resultados finais acima não apagam essas falhas intermediárias, registradas em .tmp/retirada-tests-2.log, retirada-tests-3.log e retirada-native-deletion*.log.

### Interface e versão examinadas

- Manifesto de 109 fontes/recursos/testes/scripts alterados: .cache/retirada-final-20261029/source-manifest.json. HEAD de referência: 6ee0391145832b34fc44c6af020013b211fb72bb; entrega inclui alterações locais e arquivos novos, sem commit.
- Playwright MCP/Chrome, sete páginas em 1440x1000, 1100x480 e 390x640; capturas e metadados de viewport/janela/DPR/escala/assets em .cache/retirada-final-20261029/result.json. Zero overflow horizontal; formulário com os cinco Status e sem aviso antigo; criação sem modos retirados. Navegação e Escape conferidos sem salvar configuração, criar recursos ou iniciar tentativa.
- Bundle final servido: index-DTl89MIO.js, SHA-256 271404d1aaf633d217dd9c77c4bf23ede68de2b35b1a68a01cae929e334feccf. CSS index-CK1Sh9xa.css, SHA-256 03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7. Console sem erros.
- Comparação com a referência aceita das 14h20 preservada em pixel-comparison.json: 19/21 dimensões integrais iguais; não há igualdade pixel a pixel. Foco de navegação e conteúdo operacional variam; não usar essa comparação como prova de igualdade de dados. Diff de componentes/estilos examinado: sem controles ou telas novos, retirada dos ramos antigos e redução dos textos tornados incorretos, incluindo a ajuda existente de Backlog.
- Health existente reutilizado na porta 4310. O controller ocupado no Shell #5 foi preservado, sem reinício; o browser comprova o bundle web final, e os smokes em processos temporários comprovam o backend compilado final. Isso não comprova ativação do novo backend no controller operacional.

### Revisão independente por eixo

**Standards:** /root/review_standards, skill code-review, somente leitura: zero violações documentadas bloqueantes. Observação heurística sem falha demonstrada: captura integral de banco/sidecars e cópia temporária aumentam memória e IO na abertura; não se criou otimização ou infraestrutura fora do escopo.

**Spec:** /root/review_spec, mesma versão de produção e complemento documental conferidos: zero bugs concretos encontrados. Preservados contratos atuais, nulabilidade legítima, referência lógica v1 com localização física corrente v2, ausência de conversão silenciosa e garantias de exclusão. Revisões estáticas não executaram nem substituem as provas reais do produto.

Total: Standards 0 violações bloqueantes e 1 observação heurística; Spec 0 achados concretos. Não há aceite formal de integração/publicação.

Nenhum commit, push, publicação, reset de banco operacional ou alteração de configuração de projeto foi realizado. Permanecem pendentes a ativação do backend operacional final e os gates reais/formais de feat-040/041, com autorização específica conforme o contrato.

Conferência operacional para ativação: a listagem retornou zero tentativas ativas, mas o encerramento guiado identificou um executor dependente (9b07451f-7d34-43fa-bf01-7eea1a681042), ligado à tentativa ce38022e-aeb1-42d8-830e-0e264d437ee0. O detalhe dessa tentativa registra entrega concluída e limpeza concluída; a verificação existente de situação foi executada e concluiu, mas o bloqueio de encerramento permaneceu. Não foi inferida a causa dessa divergência, não se alteraram registros internos nem se forçou processo ou cancelamento. Evidência: .cache/retirada-final-20261029/shutdown-blocker.png. Não se pausaram novos inícios nem se solicitou fechamento quando ocioso; serviço anterior e dados preservados. A ativação exige reconciliar esse impedimento pelo fluxo vigente.

## Fechamento da continuação direta — 2026-10-29, após decisão das 14h20

Estado: Sprint 001 concluída no escopo da continuação direta autorizada, conforme a emenda da SPEC e do plano. Esta matriz supersede as pendências históricas abaixo para esta sprint. Não altera o estado interno nem simula gate do LionClaw.

| Critério | Estado | Evidência atual |
| --- | --- | --- |
| feat-001.AC1 | PASS | Inventário G1–G8 e US-01–US-10, produtores/consumidores, persistência, testes e responsáveis; atualização de G4 identifica os símbolos efetivos. |
| feat-001.AC2 | PASS | Classificação por finalidade mantida; bootstrap G4 é exceção específica aprovada, sem reclassificar helpers V3 como pré-V3. Produtores atuais e valores existentes preservados por testes. Candidatos de G5/G7 sem prova não recebem autorização de retirada. |
| feat-001.AC3 | PASS | Presença conferida de 44/44 IDs US, 28/28 RF e 10/10 RNF, com matriz de responsabilidades preservada. |
| feat-002.AC1 | PASS | Baseline e manifesto originais preservados; HEAD/hashes posteriores em `.cache/sprint001-reference-20261029-1420/manifest.json`, com 81 fontes/recursos presentes e hashes de 21 capturas. |
| feat-002.AC2 | PASS | Critério emendado pelo usuário: referência atual do chat principal via Playwright MCP/Chrome, sete páginas e três viewports, janela/DPR/escala/bundle em result.json. Não é captura anterior nem revisão independente. |
| feat-002.AC3 | PASS | Provas históricas preservadas nos seus escopos; sem reatribuição e sem nova execução Maestri/OMP ou publicação. |
| feat-003.AC1 | PASS | Instalação direta v54/ledger vazio/digest final; v53 conforme com ledger real preservado. Testes de recusa, reabertura sem Database.exec/seed duplicado, perfis/cabeçalhos e prova física `.cache/persistence-proof-tnjMk2/report.json`. |
| feat-003.AC2 | PASS | Decisão específica das 14h20 consolida v54/digest sem schema_installation. Registrada no desbloqueio, SPEC da feature e plano; sem ledger fictício. |
| feat-003.AC3 | PASS | Seções iniciais de SPEC.md e INTEGRACAO-MAESTRI-OMP.md alinham cinco estados, plano integral, ausência de backfills históricos e localização atual, preservando os demais contratos. Continuação direta autorizada, sem simular gate. |
| feat-003.AC4 | PASS | Decisões, interfaces, hashes atuais, provas e limites em SPEC_PROGRESS.md, baseline, inventário, desbloqueio e validação do plano. |

Validação final: typecheck/lint exit 0; suíte integral em oito workers, 1.994/1.994 testes em 169 arquivos, 79,84 s. A primeira suíte teve duas expectativas antigas de leitura de quatro estados reprovadas, 1.992/1.994; corrigidas para verificar recusa sem reescrita. Build, smoke compilado e proof:persistence passaram na rodada anterior sobre as mesmas fontes de produção. `test:distribution` passou nesta continuação, SQLite nativo, dois processos em cwd distintos, segundo controller recusado e identidade preservada no reinício; anchor controlado, sem Maestri/OMP.

Os testes de criação foram alinhados ao plano remoto completo com efeitos GitHub controlados, mantendo falha, retomada, recibos, idempotência e recusas dos modos retirados. O controller foi iniciado no Shell #5 livre e confirmado pelo Wire; health ok, bundle servido index-fcrw0smO.js igual ao build identificado. A base existente abriu normalmente; reset não foi necessário. A referência atual não é auditoria visual independente. Sprint 002 e seguintes não recebem aceite por este fechamento.

## Revisão direta da Sprint 001 em 2026-10-29, após 14h10

O usuário autorizou revisar e completar a implementação, começando pela Sprint 001, no chat principal. Esta autorização não foi registrada como aprovação de D-001, dispensa de baseline ou aprovação de gate do pipeline. Esta seção descreve a revisão mais recente e supersede os resultados técnicos antigos abaixo para os comandos aqui repetidos; os demais registros permanecem históricos.

| Critério | Resultado desta revisão |
| --- | --- |
| feat-001.AC1 | Inventário existente preservado; os oito grupos e dez conjuntos US estão documentados. A revisão de código desta execução concentrou-se em G4/bootstrap, composição e cabeçalhos de busca, sem afirmar nova auditoria integral dos demais grupos. |
| feat-001.AC2 | BLOQUEADO: a retirada dos helpers com origem V3 e a recusa de schemas parciais não são comprovadas como retirada exclusivamente pré-V3. Não promover o candidato a aceite só porque os testes dirigidos passaram. |
| feat-001.AC3 | PASS documental: conferência de presença de 44/44 IDs US, 28/28 RF e 10/10 RNF, sem IDs ausentes. Isso confere cobertura nominal, não demonstra todas as finalidades. |
| feat-002.AC1 | Baseline original e manifesto preservados; novo build e prova posterior identificados separadamente em retirada-baseline.md. |
| feat-002.AC2 | PENDENTE: a captura anterior atribuída ao Revisor não existe nas evidências conferidas. Solicitada decisão explícita sobre uma referência atual com limite histórico, sem fabricar captura retroativa. |
| feat-002.AC3 | Evidências anteriores preservadas, inclusive limites da prova real V4; nenhuma nova execução Maestri/OMP ou publicação. |
| feat-003.AC1 | Demonstração técnica local disponível: 16 testes de instalação/composição/cabeçalhos, ledger v53 preservado, instalação direta v54 com ledger vazio, reabertura sem execução de schema SQL ou substituição do seed e prova completa de recuperação. O formato continua condicionado à decisão específica. |
| feat-003.AC2 | PENDENTE: submetida ao usuário a consolidação do candidato v54/digest, sem a tabela adicional proposta em D-001. Não há resposta registrada nesta execução. |
| feat-003.AC3 | PENDENTE: fontes normativas e plano preservados enquanto a decisão específica e as aprovações pertinentes não estiverem resolvidas. |
| feat-003.AC4 | PASS documental desta rodada: decisões solicitadas, alterações, comandos, resultados e limites registrados neste arquivo, no baseline e em SPEC_PROGRESS.md. |

Correções desta execução: removido um fragmento JSX sem fechamento em ProjectCreationDialog.tsx, sem elemento ou texto novo; alinhadas a schema direto 54 as expectativas de scripts/persistence-proof.mjs, tests/native/persistence-recovery.proof.ts e tests/acceptance/persistence-report.test.ts; acrescentado teste de reabertura sem DDL/seed em local-installation.test.ts. As expectativas de reconhecimento e preservação do ledger v53 não foram alteradas.

Validação: 28/28 testes dirigidos em quatro arquivos, lint, build, test:compiled, proof:persistence e git diff --check passaram. A prova anterior à correção falhou primeiro em compile_controller pelo JSX; a prova nativa dirigida reproduziu esperado 53/recebido 54; a prova completa posterior passou. Typecheck ainda falha em testes de contratos de mapping/scaffold preexistentes à rodada, com referências a variantes removidas e fixtures incompletas. A suíte integral não foi reexecutada; o resultado histórico de 1.995 testes não é atribuído a esta rodada.

Sprint 001 permanece sem conclusão formal. Nenhum estado interno do LionClaw, gate, banco operacional, commit ou publicação foi alterado.

Atualizado em 2026-10-29 após o feedback do Evaluator. Este registro mantém execução local, evidência visual do Revisor, aprovação normativa e decisão de metadados como fatos separados. Gerar documentos ou passar checks técnicos não aprova PRD, SPEC, plano, Design Lock ou fase.

## Matriz de aceite

| Critério | Estado | Evidência e limite |
| --- | --- | --- |
| feat-001.AC1 | PASS | `retirada-inventario.md` cobre os oito grupos, 10 US, caminhos alcançáveis adicionais, produtores/consumidores por superfície, persistência, testes, finalidade, decisão e sprint. |
| feat-001.AC2 | BLOQUEADO | O candidato local atual remove `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders`, cuja origem V3 está comprovada pelos commits `76907bf` e `ebdd67e`, e rejeita todo histórico anterior à versão 53. Não há evidência de finalidade exclusivamente pré-V3 para todos esses schemas. Nenhuma remoção pode ser justificada apenas por nome, data, número, `format_version=1`, grafia privada ou campo ausente. |
| feat-001.AC3 | PASS | A matriz de `retirada-inventario.md` enumera US-01.C1–US-10.C4, RF-01–RF-28 e RNF-01–RNF-10 com os grupos responsáveis; ambiguidades ficam no bloco de impedimentos. |
| feat-002.AC1 | PASS | `retirada-baseline.md` fixa HEAD, hashes de fontes/fixtures/documentos locais, bundle, runtime, parâmetros de schema/persistência/desempenho e resultados, sem armazenar SQL, banco ou checkout. |
| feat-002.AC2 | PENDENTE | A tentativa revisora histórica recebeu `net::ERR_CONNECTION_REFUSED`; nesta retomada, `GET /api/v1/health` respondeu HTTP 200. Não foi produzida captura nem medidas de viewport/janela/DPR/zoom, e a disponibilidade do controller não substitui a evidência atribuída ao Revisor. |
| feat-002.AC3 | PASS | `retirada-baseline.md` preserva referência ao complemento de 28/10: seis passagens, três versões, duas correções; GitHub controlado, `checks=[]`, sem publicação real e sem retry como outra tentativa. A matriz original não foi alterada. |
| feat-003.AC1 | BLOQUEADO | Há um candidato de instalação direta com `initial-schema.v54.sql` e catálogo estático, mas não há aprovação D-001 nem demonstração técnica válida. O typecheck atual falha; as provas anteriores ocorreram antes da substituição do bootstrap. O reconhecimento pretende aceitar schema direto v54 e ledger completo v53, mas rejeita históricos parciais sem classificação aprovada. Ver o adendo em `retirada-baseline.md`. |
| feat-003.AC2 | PASS | O impedimento e a decisão específica foram submetidos neste registro, com recomendação e invariantes. A solução continua pendente no pipeline; feat-003 e sprints dependentes permanecem bloqueadas até decisão autorizada. |
| feat-003.AC3 | PENDENTE | `sprint-validation20261028_162109.md` B5 registra que o gate final aguardava decisão do usuário. Esta correção não alterou `SPEC.md` nem `INTEGRACAO-MAESTRI-OMP.md`; alinhamento depende das aprovações pertinentes no pipeline. |
| feat-003.AC4 | PASS | `SPEC_PROGRESS.md` registra os três artefatos, decisão de proveniência, paths/interfaces efetivos e gates pendentes. Nenhuma aprovação foi deduzida da geração dos documentos ou dos checks. |

## Decisão específica solicitada: proveniência de `schema_migrations`

**Fato do baseline anterior.** `migrations.ts` declarava `applicationId=0x4e465331`; `loadMigrations()` carregava 53 arquivos SQL e calculava SHA-256; `inspectHistory()` reconhecia linhas sequenciais de `schema_migrations` e comparava versão, nome e checksum; `applyMigrations()` gravava `applied_at_ms` depois de executar cada SQL. O ledger não distinguia migration executada de schema final criado diretamente.

**Conflito.** A instalação direta precisa criar a forma final sem carregar SQL histórico executável, ao mesmo tempo que uma base atual reconhecida conserva application_id, user_version, nomes e checksums pertinentes e não atribui execução que não ocorreu. Preservar `schema_migrations` exatamente como ledger de execução não fornece proveniência para o banco direto. Inserir 53 linhas comuns com timestamp fabricado também não satisfaz a condição de veracidade.

**Decisão requerida no pipeline antes de liberar feat-004/sprint-002:** autorizar uma representação explícita de proveniência para schema instalado diretamente, separada da evidência de migrations realmente executadas, com os invariantes seguintes:

1. preservar `application_id=0x4e465331`, a sequência/nomes/checksums das bases atuais reconhecidas e suas linhas existentes sem alteração;
2. identificar sem ambiguidade instalação direta do schema final, sem dizer que os 53 SQLs foram executados;
3. manter metadados em runtime sem carregar SQL histórico executável e sem alterar banco existente para fazê-lo passar;
4. recusar base desconhecida, parcial, futura ou incoerente antes de escrita;
5. definir no gate o formato físico e o vínculo com `user_version`/ledger antes de codificar ou alterar a SPEC.

Recomendação técnica submetida: formato mínimo de proveniência explícita, com a identidade do schema direto e a referência imutável da tabela de nomes/checksums, sem duplicar conteúdo SQL. O campo/tabela/arquivo concreto continua sem escolha e não foi implementado. Se o gate não autorizar formato adicional, a decisão alternativa precisa reabrir o contrato de instalação direta; não se deve inferir uma solução via timestamp, versão 053 ou linhas sintéticas.

## Alinhamento normativo preparado, não aplicado

Após aprovação pertinente, revisar somente os trechos contraditórios, com referência ao inventário e preservação dos contratos atuais:

| Documento e trecho atual | Ajuste a decidir no gate | Garantias a manter |
| --- | --- | --- |
| `SPEC.md` 3153–3158: união `LegacyHttpScaffoldPlan`, quatro destinos e leitura/conversão de mapeamento antigo | alinhar escrita/leitura suportadas à SPEC desta feature; não aceitar variante anterior no fluxo operacional; manter registros antigos opacos e imutáveis quando não forem interpretados | plano atual integral, cinco IDs distintos, Ready, hashes/recibos e ausência de Backlog inventado |
| `SPEC.md` 1535, 1752, 3162 e 3182: backfills de cabeçalho/referências, conversores privados e composição | separar backfill comprovadamente atual de transformação exclusivamente histórica; retirar apenas a composição retroativa comprovada e resolver I-06 antes de classificar `issue_number/title` | dados atuais, cabeçalhos comprovados, composição efetiva atual, opcionais/nulos legítimos e histórico sem mutação |
| `INTEGRACAO-MAESTRI-OMP.md` 151–154: associação de sessões históricas e migration aditiva | distinguir continuidade atual da conversão/associação exclusiva anterior ao V3, sem inferir vínculo por nome/tempo | nova sessão lógica por tentativa, identidade confirmada, parada incerta não confirmada e evidência real separada |
| `SPEC.md` 1537 e `INTEGRACAO-MAESTRI-OMP.md` 156–170: layout, leitores de compatibilidade, transição e backfill de localização | remover exigências de fallback/transição do layout global exclusivamente antigo quando I-07/I-09 estiverem provados | raiz de banco/recursos compartilhados, pasta original, layout atual versionado `vN→v(N+1)`, propriedade, identidade, autorização e retomada |

`docs/Docs20261028_162109/sprint-validation20261028_162109.md` §B5 mantém gate pendente. Aprovação do plano, decisão de metadados, autorização de implementação e Design Lock são atos diferentes; este registro não os simula.

## Atualização do checkout após o baseline — decisão ainda pendente

O checkout contém agora `loadSchemaRecognitionResources()` e `initializeSchema()`, `database-inspection.ts` e os recursos estáticos `schema-recognition.v1.json`/`initial-schema.v54.sql`. O candidato cria schema direto v54 e reconhece ledger completo v53. Também rejeita históricos parciais e remove do módulo os helpers V3 `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders`. Não há aprovação D-001 registrada; a implementação não autoriza classificar esses históricos como exclusivamente pré-V3 nem concluir feat-001/003.

Na validação atual, `npm.cmd run typecheck` terminou com exit 1, incluindo `application_id` indefinido em `migrations.ts`, referência a `openStorageAtMigrationVersionForTests` removida e importação de `applicationId` não exportada pela fixture. O lint e `git diff --check` terminaram com exit 0. O build e a prova de persistência anteriores à troca de bootstrap não validam este candidato.

## Revalidação técnica após o feedback

`npm.cmd run proof:persistence` passou antes da correção da fixture: `local_persistence_and_process_recovery_passed`. Esse resultado é independente do erro descrito abaixo; não comprova instalação direta nem qualquer gate externo.

| Comando/prova | Resultado |
| --- | --- |
| Primeiro `npm.cmd test -- --reporter=dot --no-color` | Exit 1; 5 falhas e 2.010 aprovados em 169 arquivos. Todas as falhas estavam em `attempt-search.test.ts` e tinham a mesma causa: `SqliteError: no such column: a.diagnostic`. |
| Repro mínimo antes da alteração | `npm.cmd exec -- vitest run apps/controller/src/modules/storage/attempt-search.test.ts -t "finds a title match beyond the unfiltered first page and treats LIKE characters literally" --reporter=dot --no-color`; falhou duas vezes em ~0,8 s com a mesma exceção. |
| Correção | Adicionada a coluna nullable `diagnostic` apenas à DDL da fixture em `apps/controller/src/modules/storage/attempt-search.test.ts`. A migration atual `005_attempts.sql` já define `diagnostic`; `readAttemptPage()` a seleciona. Nenhum código de produção foi alterado. |
| Repro mínimo após a alteração | Mesmo comando; exit 0, 1/1 teste passou. |
| Suíte do arquivo | `npm.cmd exec -- vitest run apps/controller/src/modules/storage/attempt-search.test.ts --reporter=dot --no-color`; exit 0, 11/11 testes. |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript aprovadas. |
| `npm.cmd test -- --reporter=dot --no-color` após correção | Exit 0; 2.015/2.015 testes em 169 arquivos, 119,06 s. |
| `npm.cmd run build` após correção | Exit 0; Vite 8.3.4, 410 módulos transformados. JS 1.162.994 bytes (gzip 290,66 kB), CSS 103.595 bytes (gzip 18,44 kB); aviso existente de bundle acima de 500 kB. |
| Cobertura documental | 8/8 grupos, 44/44 IDs US, 28/28 RF e 10/10 RNF; matrix usa os grupos de feature consolidados do plano de cinco sprints. |

Hash SHA-256 do fixture antes da correção: `5fe353105b808f094f62b2263b3809f5ff44ba0f71a4a4ce716353172f4bb35e`; depois: `bde8bf95be0b117d5f9479f7ffcacc7d2fc0e84e731e386aefe5817e42098e36`. A query permaneceu idêntica (`402c4a83da7264ca0ff7ea23e61020efcbf24581c670f2bf687d70dc2a08e03a`). Os resultados técnicos não comprovam a captura do Revisor, UI atual, decisão de proveniência, aprovação normativa, integração Maestri/OMP real ou publicação.

## Addendum — revalidação local em 2026-10-29

Esta execução valida novamente o checkout atual; mantém os resultados anteriores acima como registros históricos e não altera os estados de aceite.

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções aprovadas. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 2.016 testes em 169 arquivos, duração observada de 119,80 s. |
| `npm.cmd run build` | Exit 0; 410 módulos web, JS 1.162.994 bytes e CSS 103.595 bytes; aviso de bundle acima de 500 kB permanece. Os hashes dos assets coincidem com os registrados no baseline. |
| `npm.cmd run proof:persistence` | Exit 0; `.cache/persistence-proof-4iFvdH/report.json`, schema 53, 57 tabelas, integrity `ok`, zero violações de FK. A fixture percorre o bootstrap atual e não prova instalação direta. |
| `git diff --check` | Exit 0. |

A conferência do manifesto original encontrou 137/138 entradas idênticas; a única divergência é `SPEC_PROGRESS.md`, atualizado por adendos posteriores à captura. O arquivo de hashes original foi mantido. O SHA-256 e o tamanho atuais ficam registrados no adendo de `retirada-baseline.md`. Nenhum código de produção foi alterado nesta rodada.

Continuam pendentes `feat-002.AC2` (captura atual do Revisor com viewport, janela, DPR e zoom) e `feat-003.AC1` (demonstração de instalação direta sem SQL histórico executável). D-001 está submetida à decisão específica do pipeline; `feat-003.AC3` depende das aprovações normativas pertinentes. Portanto, não se declara conclusão da Sprint 001 nem liberação da sprint-002.

## Addendum — retentativa após feedback do Evaluator — 2026-10-29

Os dois critérios apontados continuam sem evidência suficiente. Esta retentativa não altera seus estados nem os resultados anteriores.

- `feat-002.AC2`: `maestri list` e `maestri debug` nesta sessão PowerShell retornaram que a CLI só está disponível dentro de terminais Maestri (`MAESTRI_PIPE` ausente). Não foi possível encaminhar a captura pelo Revisor no fluxo próprio; nenhum screenshot foi produzido ou atribuído a ele. Esta observação descreve somente este contexto e não afirma indisponibilidade do Wire em outro contexto autorizado.
- `feat-003.AC1`: nenhuma alteração de bootstrap foi feita. O teste de reabertura existente continua cobrindo apenas uma fixture gerada por `openStorage`; não demonstra instalação direta nem dispensa a leitura dos SQLs históricos. D-001 em `retirada-desbloqueio.md` continua como proposta não aprovada e depende de decisão específica do pipeline antes de implementar o novo formato.
- Validação técnica desta retentativa: `npm.cmd run typecheck`, `npm.cmd run lint`, os testes dirigidos de `attempt-search.test.ts` e `local-installation.test.ts` (2 arquivos, 16 testes), e `git diff --check` terminaram com exit 0. Isso não substitui captura independente nem decisão de proveniência.

Assim, `feat-002.AC2` permanece PENDENTE, `feat-003.AC1` permanece BLOQUEADO e `feat-003.AC3` permanece condicionado às aprovações do pipeline. Nenhuma feature ou sprint dependente é declarada completa.

## Addendum — revalidação desta retomada — 2026-10-29

HEAD observado: `6ee0391145832b34fc44c6af020013b211fb72bb`. Não houve alteração de produção, migration, SPEC ou plano. Os arquivos de teste anteriormente modificados foram preservados.

| Comando/prova | Resultado desta retomada |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções aprovadas. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 1 na primeira execução: 2.009/2.016 testes, com quatro timeouts sob 169 workers e três expectativas instáveis (WAL, evento SSE `resync` e preflight). |
| Suíte integral com `--maxWorkers=8` | Exit 0; 2.016/2.016 testes, 169 arquivos, 141,47 s. Nenhuma das sete falhas da primeira execução se repetiu; a causa da instabilidade não foi isolada, e o primeiro resultado permanece registrado como falha. |
| `npm.cmd run build` | Exit 0; 410 módulos, JS 1.162.994 bytes / gzip 290,66 kB, CSS 103.595 bytes / gzip 18,44 kB. Hashes coincidem com o baseline; aviso de bundle acima de 500 kB mantido. |
| Acesso Wire / captura do Revisor | Manual e helpers lidos. `pwsh` existe, mas o arquivo de credencial protegida esperado não está presente neste contexto. Nenhuma chamada Wire, inicialização de controller ou captura foi feita; isso não prova indisponibilidade em outro contexto e não satisfaz feat-002.AC2. |

O conjunto de ferramentas desta sessão não oferece ação de aprovação/encaminhamento no pipeline. Nenhuma decisão D-001 foi registrada; feat-003.AC1 permanece BLOQUEADO, feat-003.AC3 permanece PENDENTE e Sprint 001 continua sem conclusão. Os resultados locais não substituem esses gates.

## Addendum — verificação após a última alteração do workspace — 2026-10-29

- O health do controller respondeu HTTP 200 em `127.0.0.1:4310/api/v1/health`. Isso libera o pré-requisito de disponibilidade, mas não cria captura visual. feat-002.AC2 segue PENDENTE até o Revisor capturar os cenários com autoria, viewport, janela, DPR e zoom.
- Neste ponto da retomada, os helpers V3 foram restaurados e seus testes semânticos voltaram a cobrir composição idempotente e backfill tipado. A alteração transitória sem helpers não é a versão atual; o inventário G4 e a seção de correção final descrevem o estado validado.
- `openStorage()` ainda carrega os 53 SQLs históricos e não demonstra instalação direta. D-001 não foi aprovada pelo pipeline; feat-003.AC1 permanece BLOQUEADO e feat-003.AC3 continua PENDENTE das aprovações normativas. A recusa de schemas parciais não substitui a decisão de proveniência.
- Validação técnica da edição intermediária sem helpers (estado transitório): typecheck exit 0; lint exit 0; suíte integral em oito workers, 2.017/2.017 testes em 169 arquivos, 159,79 s; build exit 0, 410 módulos; `git diff --check` exit 0. O bundle JS continua acima de 500 kB.

Nenhuma feature ou sprint é declarada completa por esses resultados locais. A matriz V4 de 28/10 permanece intacta com seus limites já registrados.

## Correção final do estado — 2026-10-29

- A verificação mais recente encontrou os dois helpers V3 presentes em `migrations.ts`; os testes voltaram a cobrir composição e backfill tipado. Os hashes monitorados foram estáveis durante a suíte integral.
- Validação do estado atual: typecheck, lint e build exit 0; 2.017/2.017 testes em 169 arquivos (161,91 s); `git diff --check` exit 0. O aviso de bundle acima de 500 kB permanece.
- `feat-001.AC2` volta a PASS para esses candidatos porque a retirada dos helpers não está no estado atual. `feat-002.AC2` segue PENDENTE sem captura do Revisor. `feat-003.AC1` segue BLOQUEADO sem instalação direta/D-001, e `feat-003.AC3` segue PENDENTE das aprovações normativas.

## Reavaliação final do checkout — 2026-10-29

Esta seção supersede estados “finais” anteriores deste registro. O checkout atual contém um candidato v54 de instalação direta sem decisão D-001 aprovada. O candidato rejeita schemas parciais e remove helpers com origem comprovada na V3; portanto `feat-001.AC2` é BLOQUEADO. A prova de persistência não passou e não demonstra o caminho direto; `feat-003.AC1` é BLOQUEADO. `feat-002.AC2` permanece PENDENTE da captura do Revisor com metadados exigidos; `feat-003.AC3` permanece PENDENTE das aprovações do pipeline. A submissão da decisão em `feat-003.AC2` não equivale à aprovação.

Validação do snapshot: typecheck, lint e build passaram. A suíte integral falhou com 1.894/2.015 testes aprovados e 121 falhas em 46 arquivos; `proof:persistence` falhou na fase `measurements`. `git diff --check` passou. Os resultados completos e hashes locais estão no adendo final de `retirada-baseline.md`; não houve revisão visual do Coder, screenshot atribuído ao Revisor, aprovação do pipeline, execução real Maestri/OMP ou publicação.

## Revalidação da continuação direta — 2026-10-29

Esta seção registra o worktree final desta retomada e substitui os resultados do snapshot local anterior acima. Ela não altera gates nem estado interno do pipeline. O usuário orientou considerar as Sprints 001 e 002 feitas para prosseguir com a implementação restante.

- Revisão somente leitura da mudança completa, seguida de três correções pontuais: removido o código legado de um caso genérico de teste, a guarda redundante de `backlog` e o aviso de inventário de exclusão que não era alcançável após a validação de schema no bootstrap.
- HEAD de referência: `6ee0391145832b34fc44c6af020013b211fb72bb`; os arquivos alterados permanecem no working tree. Sem stage, commit, push, publicação, reset/limpeza de banco operacional ou alteração de configuração de projeto.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- --maxWorkers=8 --reporter=dot --no-color` (1.998/1.998 testes em 170 arquivos), `npm.cmd run build`, `npm.cmd run test:persistence` (52/52), `npm.cmd run proof:persistence`, `npm.cmd run test:compiled`, `npm.cmd run test:execution-compiled`, `npm.cmd run test:distribution`, `npm.cmd run test:deletion-native` (26/26) e `git diff --check`: PASS.
- `npm.cmd run test:http` falhou uma vez ao ser iniciado simultaneamente com outras provas, com corpo SSE vazio antes do heartbeat. O rerun isolado passou 4/4 e a suíte integral final passou; a causa da ocorrência inicial não foi determinada.
- Playwright MCP no controller já disponível: HTTP health 200, bundle `index-DTl89MIO.js` conferido por hash SHA-256 `271404d1aaf633d217dd9c77c4bf23ede68de2b35b1a68a01cae929e334feccf`, viewport 1779x861, DPR 1, escala 1. A configuração mostrou Backlog, Ready, Em andamento, Em revisão e Entregue, sem aviso do mapeamento de quatro estados. A criação mostrou apenas o plano remoto completo. Nenhum formulário foi salvo; console sem erros ou avisos. Essa captura pertence ao chat principal, não ao Revisor independente.
- `proof:persistence` reportou `local_persistence_and_process_recovery_passed`. A prova Windows de exclusão passou 26/26 em fixtures temporárias. O build gerou 410 módulos, JS 1.159,42 kB (289,79 kB gzip) e CSS 103,59 kB; permanece o aviso configurado de chunk acima de 500 kB.
- Revisão independente: zero violações documentadas bloqueantes; permanecem como observações heurísticas a leitura/hash de snapshots completos repetidos na abertura e a delegação transparente de `openStorage` para `openStorageWithSchema`. Não foi feita otimização/refatoração sem evidência de impacto.
- Não foram executados novo percurso real Maestri/OMP, criação GitHub ou publicação. As evidências existentes conservam seus limites. Não houve captura atribuída ao Revisor, aprovação formal de PRD/SPEC/plano/Design Lock, nem alteração de gate nesta sessão.
