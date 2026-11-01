# SPEC Progress — C1: observação da preparação no início Ready

## Referência e escopo

- Run: `20261031_224030-d54caf` — **Otimização do início de issues Ready**.
- Referência do código de produto medida: `HEAD 81cb58b63b92a499bd98945a82666051c542eb4b`. No início desta sprint, `git status --short` estava vazio e este arquivo ainda não existia.
- Seleção: **C1**, conforme `ArchitectureDecisions-20261031_224030-d54caf.md`, fonte primária da decisão. Os documentos de diagnosis, candidates e map são contexto e evidência arquitetural; não substituem a decisão registrada.
- Recorte desta sprint: registrar o estado e obter a referência controlada do caminho existente. Esta execução não aprova a implementação planejada nem autoriza efeitos externos.

Artefatos do run, todos relativos à raiz canônica:

| Artefato | Caminho |
|---|---|
| SPEC | `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/SPEC-20261031_224030-d54caf.md` |
| ArchitectureDecisions — fonte primária de C1 e D1–D3 | `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/ArchitectureDecisions-20261031_224030-d54caf.md` |
| ArchitectureDiagnosis | `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/ArchitectureDiagnosis-20261031_224030-d54caf.md` |
| ArchitectureCandidates | `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/ArchitectureCandidates-20261031_224030-d54caf.md` |
| ArchitectureMap | `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/ArchitectureMap-20261031_224030-d54caf.md` |

Artefatos auxiliares consultados: `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/sprints-20261031_224030-d54caf.json` e `.lionclaw/pipelines/architecture-review/20261031_224030-d54caf/spec-validation-20261031_224030-d54caf.md`. O relatório de validação registra completude e consistência do plano; seu PASS não é prova do comportamento implementado. A narrativa de triagem em ArchitectureCandidates registra `selectedCandidateId` nulo naquele estágio; ArchitectureDecisions registra depois a escolha C1 e é a referência para esta execução. Essa diferença de estágio fica preservada, sem simular gate ou mudança de fase.

## Fontes consultadas e estado inicial

Foram consultados `AGENTS.md`, `README.md`, `docs/operation/README.md`, `GLOSSARY.md`, `package.json`, os cinco artefatos acima e as fontes atuais do percurso: `apps/controller/src/modules/projects/preparations.ts`, `apps/controller/src/modules/projects/queue.ts`, `apps/controller/src/modules/pipeline/start.ts`, `apps/controller/src/modules/storage/attempts.ts`, `tests/integration/preparations.test.ts`, `tests/integration/queue-scheduler.test.ts`, `tests/integration/c1-baseline.probe.test.ts` e `tests/fixtures/attempt.ts`. CodeGraph serviu para orientação; o conteúdo atual dos arquivos e os testes determinam o comportamento registrado.

O percurso observado é `dispatchQueueCandidate` → `createPreparation` → `getPreparation` → `startAttempt` → revalidação do resumo antes do aceite → revalidação final da seleção Ready → aceite transacional em `storage.createAttempt` → preparo do workspace → revalidação do resumo após o aceite → `startPassage`. A verificação posterior ao aceite foi contada à parte em `pipeline.acceptance`; ela permanece necessária e não entra nas três observações do trecho Preparations usadas como base do AC-04.

O recorte C1 não altera seleção/consumo Ready, disponibilidade de terminais, transporte, schemas, HTTP, frontend ou persistência de conteúdo Git. Não foi identificada divergência de contrato que exija alterá-los. As decisões continuam sendo:

- **D1 — validade no ciclo Ready:** qualquer reaproveitamento fica restrito à mesma invocação de início Ready; a observação final antes do aceite continua obrigatória; não há cache entre ciclos nem política nova de expiração.
- **D2 — responsabilidade de Preparations:** Preparations concentra a política de produzir, reaproveitar e renovar o resumo; Pipeline coordena o início; não se adiciona Module ou Adapter.
- **D3 — superfície do produto:** a otimização não acrescenta bloqueios, confirmações, etapas manuais ou textos à UI; verificações atuais permanecem e ganho real de velocidade precisa ser medido.

## Matriz D1–D3, entregas, critérios e provas

Os significados de D1–D3 vêm de ArchitectureDecisions. A associação de entregas, AC e T vem da SPEC e de `sprints-20261031_224030-d54caf.json`. “Planejado” não significa implementado. T6 tem somente a metade de referência anterior registrada nesta sprint; a comparação com a versão candidata permanece futura.

| Decisão e vínculo | Sprints / features → AC → provas | Estado do vínculo nesta sprint |
|---|---|---|
| **D1 — ciclo Ready** | `sprint-002/feat-003`, `feat-004`, `feat-005`; `sprint-003/feat-006`, `feat-007`, `feat-008` → AC-02, AC-03, AC-09, AC-10 → T1–T5 | Planejado. Esta linha de base não implementa validade por ciclo, isolamento, recuperação ou proteções de aceite. |
| **D2 — política em Preparations** | `sprint-002/feat-003`, `feat-004`; `sprint-003/feat-006`, `feat-007` → AC-01, AC-03, AC-04, AC-06, AC-09 → T1–T5 | Planejado. A contagem anterior está registrada abaixo; envelope, renovação candidata, conflitos e regressões continuam pendentes. |
| **D2 — complemento de AC-04** | `sprint-001/feat-002` e `sprint-004/feat-009` → AC-04 → T6 | Evidência local obtida para a referência anterior: 3 observações completas e 4 consultas de issue em Preparations. A medição após integração e a comparação pareada continuam pendentes em sprint-004/feat-009. |
| **D3 — sem novas exigências de UI** | `sprint-001/feat-002`, `sprint-003/feat-008`, `sprint-004/feat-009`, `feat-010`, `feat-011` → AC-05–AC-08, AC-10 → T5–T7 | Linha de base local registrada. Compatibilidade, regressões, comparação completa, inspeção visual, ensaio real e aceite permanecem pendentes. |

### Estado dos critérios globais da SPEC

| Critério | Estado e evidência |
|---|---|
| AC-01 | Planejado em D2; política e Interface futura de Preparations ainda não foram implementadas. |
| AC-02 | Planejado em D1; nenhum reaproveitamento entre operações foi implementado ou validado. |
| AC-03 | Planejado em D1/D2; renovação, ETags e rejeição de mudanças continuam pendentes de T2/T3/T5. |
| AC-04 | **Referência anterior medida:** 3 observações completas e 4 consultas lógicas de issue no trecho Preparations. A redução candidata para 2/3 e a comparação T6 ainda não foram executadas; AC-04 não está concluído. |
| AC-05 | Planejado em D3; esta sprint não alterou HTTP/frontend e não fez validação visual. Compatibilidade pública ainda requer regressões pertinentes. |
| AC-06 | Planejado em D2/D3; preservação de seleção, consumo, perfis, ferramentas, recursos e pausa requer T2/T3/T5 e as suítes correspondentes. |
| AC-07 | Relatório local da referência disponível neste arquivo. A comparação abrangente antes/depois e seu relatório final continuam pendentes. |
| AC-08 | Pendente. Não houve comparação real autorizada nem marco verificável de início OMP. |
| AC-09 | Planejado em D1/D2; falhas pós-gravação, recibos e recuperação explícita requerem T1–T3. |
| AC-10 | Planejado em D1–D3; isolamento, abandono, ciclo de despacho e compatibilidade do formato persistido requerem T4/T5 e regressões locais. |

### Estado das provas T1–T7

| Prova | Estado |
|---|---|
| T1–T5 | Planejadas para as features de sprint-002 e sprint-003. A prova nominal desta sprint é uma linha de base e não substitui esses cenários de contrato e ciclo de vida. |
| T6 | A referência anterior foi medida localmente. A versão candidata ainda não existe nesta fase; não há comparação antes/depois nem alegação de redução. |
| T7 | Pendente. Sem envios físicos GitHub, interface visual, provider real, Maestri/OMP ou publicação nesta execução. O double `startPassage` não comprova início real. |

## Referência controlada do percurso anterior

O ensaio usou a prova local existente `tests/integration/c1-baseline.probe.test.ts`, com Storage aberto pela fixture em SQLite temporário novo por amostra. O cenário foi um projeto com quadro configurado, uma issue Ready executável e sem bloqueios. GitHub e OMP foram doubles; nenhum provider ou banco operacional foi acessado. A fixture de cada amostra foi fechada e removida ao final.

Data da medição: `2026-11-01`.

Foram executadas 8 amostras: 1 aquecimento excluído e 7 medidas. Cada chamada observada de identidade, issue, quadro e origem recebeu delay de 3 ms. O processo Node/Vitest já estava aquecido após a amostra excluída; cada medida usou SQLite novo e não havia cache de provider. O intervalo de polling configurado era 15.000 ms; o ensaio chamou `tick()` diretamente e não incluiu espera por polling. O relógio começa na primeira chamada a `Date.now` cujo stack contém `dispatchQueueCandidate` e termina no aceite durável ou na chamada ao double `startPassage`; esse limite observável fica alguns passos síncronos depois da entrada da função e não mede tempo real de execução OMP.

As contagens abaixo são chamadas lógicas observadas pelos wrappers do teste. Não são envios físicos GitHub. Preparations conta apenas o trecho até o aceite; a renovação posterior ao aceite fica identificada como `pipeline.acceptance`.

| Etapa | Operações | getIdentity | getIssueContextById | getProject | listProjectItems | inspectOrigin |
|---|---:|---:|---:|---:|---:|---:|
| Queue `observe` | 1 | 2 | 1 | 1 | 1 | 1 |
| Queue `revalidateForDispatch` | 2 | 4 | 2 | 2 | 2 | 2 |
| Preparations `createPreparation` | 1 | 1 | 2 | 1 | 0 | 1 |
| Preparations `getPreparation` | 1 | 1 | 1 | 1 | 0 | 1 |
| Preparations `revalidateSummary` antes do aceite | 1 | 1 | 1 | 1 | 0 | 1 |
| `pipeline.acceptance`: renovação após o aceite | 1 | 1 | 1 | 1 | 0 | 1 |

O estágio `createPreparation` inclui a consulta de issue para validar a seleção antes de persistir, além da consulta dentro da observação completa. Assim, o trecho Preparations tem 3 observações completas (contadas pelo mínimo entre chamadas a identidade, quadro, origem e issue por estágio) e 4 consultas lógicas de issue. A renovação após o aceite acrescenta uma observação completa e uma consulta de issue fora dessa contagem. As dependências de Queue e `pipeline.acceptance` também permanecem separadas.

Chamadas transitivas de Pipeline por amostra: `getCatalog=1`, `roleResources=1`, `observeManagedTerminal=0`, `observeTools=1`, `prepareAttempt=1`, `startPassage=1` e `rateLimitSnapshotReads=3`. Isso descreve os doubles exercitados; não representa atividade física do Maestri/OMP.

| Amostra | preparationId | attemptId | Despacho → aceite durável (ms) | Despacho → `startPassage` do double (ms) |
|---:|---|---|---:|---:|
| 1 | `a616436f-a0a5-4132-a20a-4d597cfa8c95` | `5b702754-766c-4780-b608-14627d55c815` | 321.605 | 346.039 |
| 2 | `52c7ad09-e582-43bd-8c7e-953af7bf188a` | `3e49599a-3a72-4598-9638-5b59f4e9b7aa` | 312.447 | 337.141 |
| 3 | `87c3065f-5cc1-4395-840d-d5cc950b8249` | `c725d038-eb34-491c-8dc3-9ef9448781a4` | 322.866 | 346.022 |
| 4 | `6198c3dc-34ea-4bf8-a834-387969e4dea0` | `6d9380e4-f891-4dfd-9e5e-83fc81f802b1` | 360.448 | 380.627 |
| 5 | `fb6636d8-7f5d-4806-9637-2a454a9408fd` | `a116545b-9709-4946-98bc-5dd24f4a8032` | 305.942 | 337.515 |
| 6 | `93a9f8be-5b77-4ce8-8ddb-e8d80e8a4d2c` | `1b4bafac-801d-41ff-99fb-576adbb5ab04` | 329.574 | 352.952 |
| 7 | `6f50cd17-83f9-4b36-b0eb-3580566297e7` | `087688ba-823c-46c4-9b35-e392c6aebe80` | 301.466 | 322.586 |

| Marco | Mediana (ms) | Mínimo (ms) | Máximo (ms) |
|---|---:|---:|---:|
| Entrada observável do despacho → aceite durável | 321.605 | 301.466 | 360.448 |
| Entrada observável do despacho → `startPassage` do double | 346.022 | 322.586 | 380.627 |

Os registros correlacionam separadamente apenas os IDs aleatórios de preparação e tentativa. O artefato não contém envelope completo, corpo/título da issue, orientação dos perfis, tokens, headers, credenciais ou conteúdo sensível. A inspeção do JSON emitido pelo teste confirmou que os campos registrados se limitam a cenário, contagens, IDs, configuração de ensaio e tempos.

Durante a execução, a prova revelou defeitos no próprio instrumento: referências `.bind()` a `vi.fn` continuavam apontando para mocks substituídos pelos wrappers, e a captura local de `Date.now` recapturava um spy entre amostras. A prova foi corrigida para capturar as implementações originais dos doubles, manter uma referência ao relógio nativo e separar a renovação pós-aceite. A execução final passou e confirmou as contagens nominais 3/4. Não houve alteração da implementação de produto.

## Validação e pendências

- Prova controlada: `npm.cmd test -- tests/integration/c1-baseline.probe.test.ts --reporter=verbose` — passou; 1 arquivo, 1 teste, 7 amostras medidas e 1 aquecimento excluído.
- Lint: `npm.cmd run lint` — passou (`Module boundaries and TypeScript conventions: OK`).
- Build: `npm.cmd run build` — passou (`tsc`, Vite e cópia dos recursos). Vite emitiu aviso de chunk JavaScript acima de 500 kB.
- Typecheck na sprint 001: `npm.cmd run typecheck` — falhou somente em `apps/web/src/features/shutdown/shutdown-dialog.test.ts:18` (TS2769: tipo do mock `onClose` não encaixa em `() => void`). Naquele registro, o arquivo estava inalterado e pertencia ao frontend, excluído do recorte C1.
- Suíte completa: `npm.cmd test -- --reporter=dot` — 182 arquivos passaram, 5 falharam; 2.184 testes passaram e 8 falharam. Falhas: uma asserção de texto em `tests/queue-panel-rendering.test.ts`; três leituras ENOENT em `tests/integration/attempts.test.ts`; EPERM ao limpar temporário em `tests/integration/shutdown.test.ts`; `STORAGE_TRANSITION_ACCESS_DENIED` em `apps/controller/src/modules/storage/project-storage-locations.test.ts`; e dois `ISSUE_PROGRESS_WRITE_FAILED` em `apps/controller/src/modules/workspaces/issue-progress.test.ts`. Esses arquivos estão fora desta mudança; os erros de acesso/limpeza ocorreram nos temporários sob o sandbox Windows.
- Validação visual, integração real GitHub/Maestri/OMP, ensaio de desempenho real, publicação e aceite formal: pendentes e fora das evidências produzidas aqui.
- Próxima etapa: sprint-002/feat-003 a feat-005 implementa e prova o contrato em Preparations; sprint-003/feat-006 a feat-008 integra o despacho preservando renovação/aceite; sprint-004/feat-009 completa a comparação controlada antes/depois. O resultado real e as pendências permanecem separados conforme D3.

## Sprint 001 - Fundação de evidências e linha de base controlada [CONCLUIDA]
- Rastreabilidade do escopo e dos contratos existentes: Registrar em SPEC_PROGRESS.md as fontes consultadas, o estado inicial e a correspondência entre AC-01–AC-10, T1–T7 e as entregas previstas.
- Referência controlada do percurso anterior: Obter a linha de base nominal em ambiente temporário, com contagens por etapa e tempos comparáveis ao percurso candidato.

## Sprint 002 - Contrato interno de preparação para início Ready [IMPLEMENTADA, PROVAS LOCAIS]

- Fonte de escopo: `SPEC-20261031_224030-d54caf.md`, Interface Changes e T1–T4; a seleção C1 e D1–D3 permanecem conforme `ArchitectureDecisions-20261031_224030-d54caf.md`.
- `apps/controller/src/modules/projects/preparations.ts`: `prepareReadyStart` valida as mesmas escolhas, usa o comando durável `preparation.create` e deriva `StartAttempt`, ETag, `operationId` e recibo da única preparação observada. A Interface Preparations existente expõe a operação; rotas, contratos HTTP e schemas não foram alterados.
- `tests/integration/preparations.test.ts`: cobertura nominal com quadro configurado confirmou uma observação completa (identidade, issue, quadro e origem) e a consulta prévia de issue; a operação não cria tentativa nem consulta/consome itens Ready. Também foram exercitados validação anterior à gravação, falhas após gravação, recuperação explícita sem duplicação, payload incompatível, recibo indisponível, leituras incompletas e rejeitadas por dependência, conflitos pós-await de preparação/configuração, configuração sem quadro, conclusão concorrente inversa, renovação e reabertura do Storage com leitura e atualização pelo contrato anterior.
- Validações finais: `npm.cmd test -- tests/integration/preparations.test.ts --reporter=verbose` — passou, 1 arquivo e 40 testes; `npm.cmd run typecheck` — passou; `npm.cmd run lint` — passou; `npm.cmd run build` — passou com aviso Vite de chunk JavaScript acima de 500 kB; `git diff --check` — passou.
- O primeiro typecheck desta sprint encontrou TS2769 em `apps/web/src/features/shutdown/shutdown-dialog.test.ts:18`, falha já registrada na linha de base. O tipo do mock local foi corrigido para `() => void`/`vi.fn<() => void>()`; a segunda rodada completa de typecheck, lint e build passou.
- Limites: Pipeline e `tests/integration/queue-scheduler.test.ts` permanecem no percurso anterior conforme o escopo desta sprint. A contagem comprovada é da nova operação Preparations; não comprova redução total do despacho (AC-04), ganho de latência, atividade física GitHub/Maestri/OMP, execução real, publicação ou aceite formal. A suíte completa não foi executada nesta sprint.
- Próximo passo: integrar o envelope no despacho Ready em sprint-003, mantendo `revalidateSummary` e as verificações/aceite atuais; depois completar a comparação controlada de ponta a ponta em sprint-004.

## Sprint 002 - Contrato interno de preparação para início Ready [CONCLUIDA]
- Envelope coerente da preparação observada: Disponibilizar a operação interna prepareReadyStart com as entradas e o retorno definidos na SPEC, sem observação intermediária adicional.
- Durabilidade, recuperação e falhas de observação: Comprovar as fronteiras de falha antes e depois da gravação e a recuperação explícita do comando.
- Isolamento entre chamadas e compatibilidade persistida: Demonstrar que o envelope tem duração local e que os dados continuam utilizáveis pelas operações anteriores.

## Sprint 003 - Integração Ready com renovação e aceite preservados [IMPLEMENTADA, PROVAS LOCAIS]

- Fonte de escopo: `SPEC-20261031_224030-d54caf.md`, AC-01–AC-06 e AC-09–AC-10; seleção C1 e decisões D1–D3 mantidas conforme `ArchitectureDecisions-20261031_224030-d54caf.md`.
- `apps/controller/src/modules/pipeline/start.ts`: Pipeline recebe `prepareReadyStart`; o despacho usa corpo e ETag do envelope diretamente. Removida a leitura intermediária `getPreparation` e removida a necessidade de `createPreparation` no recorte de dependências do Pipeline. O ID da operação de tentativa é gerado separadamente e protegido contra igualdade com o ID da operação de preparação. `revalidateSummary`, seleção Ready final, ETags transacionais, aceite/consumo e agendamento depois da gravação permanecem ativos.
- `tests/integration/queue-scheduler.test.ts`: o ponto de intervenção dos testes foi movido de `getPreparation` para logo após `prepareReadyStart`. Casos controlados cobrem conta, assignee, status, blockers, critérios, base SHA/branch, configuração do Project, perfil, pausa global/do projeto, revisão da preparação, modo, destino, identidade do repositório, mudança de ETag depois da renovação, fechamento durante I/O, sobreposição/falha de ticks, concorrência de consumo e predecessor em ciclo Ready rearmado. Divergências não aceitam tentativa nem consomem a fila; abandono mantém a preparação durável.
- `tests/integration/c1-baseline.probe.test.ts`: o probe agora mede a candidata, ainda com SQLite temporário e GitHub/OMP doubles. Foram observadas 2 observações completas e 3 consultas lógicas de issue em Preparations; a renovação antes do aceite e a renovação de aceite continuam separadas. Os IDs das operações de preparação e tentativa são distintos. Em 7 amostras e 1 aquecimento excluído, despacho até aceite durável: mediana 298,420 ms, mínimo 279,715 ms, máximo 309,784 ms; despacho até `startPassage` do double: mediana 324,850 ms, mínimo 302,631 ms, máximo 334,293 ms. São tempos do ensaio controlado, não início físico OMP nem comparação pareada final.
- Teste focado: `npm.cmd test -- tests/integration/queue-scheduler.test.ts tests/integration/c1-baseline.probe.test.ts --reporter=dot` — passou; 2 arquivos e 67 testes.
- Suítes de contrato: `npm.cmd test -- tests/integration/queue-scheduler.test.ts tests/integration/attempts.test.ts tests/integration/attempt-transactions.test.ts tests/integration/preparations.test.ts --reporter=dot` — 159 passaram e 3 falharam. As três falhas são ENOENT ao ler `progress.md` nos testes de progresso em `tests/integration/attempts.test.ts`; são os mesmos caminhos de progresso em `%TEMP%` já registrados na linha de base. `queue-scheduler`, `attempt-transactions` e `preparations` passaram nesta execução.
- Validação técnica: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` e `git diff --check` passaram. O Vite manteve o aviso de bundle acima de 500 kB.
- Limites: o probe confirma contagens e tempos somente em doubles; não houve GitHub, Maestri, OMP, provider, início físico, publicação, validação visual ou aceite formal. A comparação abrangente pareada de T6 e o marco real de T7 permanecem abertos conforme AC-07–AC-08; a medição não declara ganho de velocidade real.
- Próximo passo: sprint-004/feat-009, concluir a comparação controlada antes/depois e manter o ensaio real separado, sujeito à autorização específica de alvo, conta, host, perfis, orçamento e efeitos.

## Sprint 003 - Integração Ready com renovação e aceite preservados [CONCLUIDA]
- Consumo do envelope no despacho automático: Integrar prepareReadyStart à coordenação existente sem leitura intermediária ou montagem manual do resumo em Pipeline.
- Rejeição de mudanças materiais e conflitos de aceite: Preservar a intenção dos testes anteriores e cobrir alterações entre o envelope, a renovação e o aceite.
- Ciclo de vida do despacho e bloqueios existentes: Comprovar abandono seguro, exclusão local e manutenção das verificações operacionais atuais.

## Sprint 004 - Comparação controlada e fechamento das evidências locais [EXECUTADA; regressão ampla parcial]

### Referência, candidato e condições

- Fonte de escopo: `SPEC-20261031_224030-d54caf.md`, feat-009–feat-011, AC-01–AC-10 e T1–T7; C1 e D1–D3 permanecem conforme `ArchitectureDecisions-20261031_224030-d54caf.md`.
- Referência: `HEAD 81cb58b63b92a499bd98945a82666051c542eb4b`, também registrada na sprint-001. Candidato: alterações locais C1 nos arquivos de produto abaixo, no mesmo checkout e sem commit. A medição antes reproduz o trecho histórico `createPreparation` → `getPreparation` por essas interfaces e compartilha o mesmo `dispatchQueueCandidate`, Queue, início de tentativa, renovação final e aceite da composição atual. Assim, isola a observação intermediária removida; não executa dois bundles históricos lado a lado.
- Identidade do candidato medido: SHA-256 de `apps/controller/src/modules/projects/preparations.ts`: `E0AA1D82B2490904D856F44B83F06EEF2CAE08A8CDF37E784380A947AD7F16E9`; `apps/controller/src/modules/pipeline/start.ts`: `5C2E9479CF1FB73C35D1D0BF52404A50C7EE0C5BD18BCD10478B2307738EC170`. Instrumento `tests/integration/c1-baseline.probe.test.ts`: `DABB3F83856A3471879C3A3695414D7C288DAEE4DFF651F46A95F816697EFAC9`. Fixture determinística `tests/fixtures/attempt.ts`: `60E04DECBE3F66B7AAEEAD0B4CE4BDB4EB85D7A3D7D9F8957F49E10A2DA72D1D`.
- Cenário e conteúdo: `attemptFixture`, um projeto configurado, uma issue executável em Ready, sem bloqueios, mesmos critérios/configuração/perfis fixos da fixture. Cada observação usou SQLite temporário novo; os IDs aleatórios de preparação e tentativa estão correlacionados abaixo. O relatório não grava título/corpo da issue, instruções dos perfis ou envelope.
- Ambiente em 2026-11-01: Node `v24.22.0`, Vitest `v5.0.5`; um aquecimento por percurso excluído e sete pares medidos, com a ordem alternada entre pares. Cada chamada lógica observada de identidade, issue, Project, itens do Project e origem recebeu delay de 3 ms. Polling configurado em 15.000 ms, mas `tick()` foi chamado diretamente, sem esperar o polling. Sem cache de provider, rede, quota ou cooldown reais.
- O cronômetro começa na primeira chamada `Date.now` com `dispatchQueueCandidate` na pilha e termina no aceite SQLite durável ou na chamada a `startPassage` do double. A entrada medida ocorre alguns passos síncronos após a entrada da função. `startPassage` é somente o double: não comprova início de sessão ou passagem no OMP.

### Comparação estrutural

Operações observadas por amostra. O pedido do relatório abrange o trecho até o aceite; a renovação `pipeline.acceptance` depois da gravação é mostrada separadamente e permanece nos dois percursos.

| Operação | Antes | Depois |
|---|---:|---:|
| `queue.observe` | 1 | 1 |
| `queue.revalidateForDispatch` | 2 | 2 |
| Preparations: `createPreparation` | 1 | 0 |
| Preparations: `getPreparation` intermediário | 1 | 0 |
| Preparations: `prepareReadyStart` | 0 | 1 |
| Preparations: `revalidateSummary` pré-aceite | 1 | 1 |
| Pipeline: renovação pós-aceite | 1 | 1 |
| Observações completas em Preparations antes do aceite | 3 | 2 |
| Observações completas incluindo renovação pós-aceite | 4 | 3 |
| Consultas lógicas de issue em Preparations antes do aceite | 4 | 3 |

Contagens lógicas por estágio e por amostra, na ordem `getIdentity / getIssueContextById / getProject / listProjectItems / inspectOrigin`:

| Estágio | Antes | Depois |
|---|---:|---:|
| Queue `observe` | 2 / 1 / 1 / 1 / 1 | 2 / 1 / 1 / 1 / 1 |
| Queue `revalidateForDispatch` | 4 / 2 / 2 / 2 / 2 | 4 / 2 / 2 / 2 / 2 |
| Preparations `createPreparation` | 1 / 2 / 1 / 0 / 1 | 0 / 0 / 0 / 0 / 0 |
| Preparations `getPreparation` | 1 / 1 / 1 / 0 / 1 | 0 / 0 / 0 / 0 / 0 |
| Preparations `prepareReadyStart` | 0 / 0 / 0 / 0 / 0 | 1 / 2 / 1 / 0 / 1 |
| Preparations `revalidateSummary` pré-aceite | 1 / 1 / 1 / 0 / 1 | 1 / 1 / 1 / 0 / 1 |
| Pipeline `acceptance` pós-aceite | 1 / 1 / 1 / 0 / 1 | 1 / 1 / 1 / 0 / 1 |
| **Total do percurso medido** | **10 / 8 / 7 / 3 / 7** | **9 / 7 / 6 / 3 / 6** |

Chamadas transitivas de Pipeline por amostra, idênticas antes/depois: `getCatalog=1`, `roleResources=1`, `observeManagedTerminal=0`, `observeTools=1`, `prepareAttempt=1`, `startPassage=1`, `rateLimitSnapshotReads=3`. Portanto, o percurso reduziu uma observação completa e quatro chamadas lógicas associadas (identidade, issue, Project e origem); Queue, renovação final, seleção/consumo Ready e etapas de execução observáveis mantiveram as contagens.

### Amostras pareadas e correlação

Valores em milissegundos; delta = depois − antes. Foram sete pares válidos e zero falhas em cada percurso.

| Par | Aceite antes | Aceite depois | Δ aceite | `startPassage` double antes | `startPassage` double depois | Δ double |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 315,697 | 309,120 | -6,577 | 343,856 | 338,055 | -5,801 |
| 2 | 308,962 | 306,081 | -2,881 | 337,735 | 333,454 | -4,281 |
| 3 | 308,528 | 277,174 | -31,354 | 320,508 | 291,079 | -29,429 |
| 4 | 318,824 | 302,904 | -15,920 | 336,832 | 330,488 | -6,344 |
| 5 | 292,677 | 294,279 | +1,602 | 303,908 | 322,177 | +18,269 |
| 6 | 302,204 | 293,083 | -9,121 | 328,736 | 305,069 | -23,667 |
| 7 | 310,970 | 293,981 | -16,989 | 322,894 | 306,152 | -16,742 |

Resumo com mediana, mínimo–máximo e MAD (desvio absoluto mediano):

| Marco | Antes | Depois | Delta pareado |
|---|---|---|---|
| Despacho → aceite durável | mediana 308,962; 292,677–318,824; MAD 6,735 | mediana 294,279; 277,174–309,120; MAD 8,625 | mediana -9,121; -31,354–+1,602; MAD 6,799 |
| Despacho → `startPassage` do double | mediana 328,736; 303,908–343,856; MAD 8,228 | mediana 322,177; 291,079–338,055; MAD 15,878 | mediana -6,344; -29,429–+18,269; MAD 10,398 |

Correlação dos IDs de recurso, sem gravar conteúdo da issue ou envelope:

| Par | Antes: preparação / tentativa | Depois: preparação / tentativa |
|---:|---|---|
| 1 | `b87f891e-36f4-4f9a-840e-2cbe5530d17d` / `bd866e6b-5227-42ea-9581-e2632463fc37` | `8f2757be-0dc1-4ce9-afb2-aa38fbf68837` / `44a18bd6-3179-49e6-90db-a80df68d527b` |
| 2 | `f6275b6b-58d0-4f33-b547-7a28e13c9352` / `bb2388c1-c298-4c24-a349-2a93e527b41b` | `c9973969-5f59-47c8-a2f4-bfbad0c54a22` / `d3d91e5b-9927-4a91-9b0e-105ee53d6434` |
| 3 | `8696a807-ae75-4a0f-9047-ac241e25acb1` / `3c384a36-2c4a-46aa-bd11-511c51228736` | `7ab180a2-7d35-4f6b-8bf4-369c3de2ba67` / `8c1f512d-d9f5-43f0-9627-0f7b1b325457` |
| 4 | `f63114c1-836f-4a18-b719-5f5935418ce5` / `f746561e-316f-4ebd-aa34-fd1308e28bc2` | `4f11198f-c5a6-44b8-b624-eb8020a3a5df` / `f64fe6a5-c4ff-4297-86ea-a82d9e7e389f` |
| 5 | `bef68df0-1104-45e7-9c80-ea1e41bfda7e` / `1b4703f1-fcbb-4666-9315-d90ae0ce7cae` | `b6608643-5336-4f63-beb0-f4262c196960` / `dc209542-9742-4e78-9ec8-f31fc595102d` |
| 6 | `08af0d0c-6139-4d53-874d-4bdda59f5347` / `3b758f29-8beb-4e2f-8a66-929fe75425da` | `70eef730-f5e6-4db3-bac4-8dfc7c648c64` / `a6b182c2-fd9f-49ec-b5d2-d47299e6b9e7` |
| 7 | `7b42145d-5d8b-415a-9e26-64fc4c0e1834` / `44549425-c8c0-437a-b3b3-a2596487e489` | `a54ee72d-5626-4223-ad4d-ab911c0a9e29` / `c422802a-133c-4516-afb8-e42ef626d34e` |

Os tempos controlados mostram deltas positivos e negativos e dispersão entre pares. São inconclusivos para velocidade real. Chamadas lógicas não equivalem a envios físicos GitHub; aceite durável não equivale a início OMP; invocar `startPassage` do double não demonstra terminal ou passagem real. Os valores históricos separados da sprint-001 e sprint-003 permanecem acima sem serem combinados a estes pares.

### Estados independentes da entrega

| Dimensão | Estado | Evidência e limite |
|---|---|---|
| Implementação local | Comprovada nesta execução | Alterações C1, regressões focadas e comparação controlada; a suíte completa permanece parcial pelas falhas descritas abaixo. |
| Revisão independente da implementação | Pendente | Este registro não contém resultado de revisão independente; checks locais e comparação controlada não substituem essa revisão. |
| Validação visual | Pendente | `use_playwright=false`; não houve inspeção visual com Playwright, CUA ou outro navegador. |
| Desempenho real | Pendente | T7 não foi executado, não há marco real OMP observado e os tempos registrados são controlados; nenhum ganho real é declarado. |
| Aceite formal | Pendente | Não há decisão de aceite formal registrada nesta execução. |

### Compatibilidade, AC/T e matriz D1–D3

O diff C1 de produto está limitado a `apps/controller/src/modules/projects/preparations.ts` e `apps/controller/src/modules/pipeline/start.ts`. Permanecem sem alterações os contratos `packages/contracts/`, rotas/schemas/autenticação HTTP e fontes de produto do frontend. As suítes `preparations`, `queue-scheduler`, `attempts`, `attempt-transactions` e HTTP passaram nesta execução. Os testes de Preparations exercitam comando `preparation.create`, recibos, `event_cursor`, ETags, leitura/recuperação após reabertura e fluxos anteriores. A inspeção e a regressão não encontraram alteração de fluxo manual, schema público, texto, etapa, confirmação ou bloqueio de UI.

| Decisão | Sprints/features → AC → T | Evidência e estado atual |
|---|---|---|
| D1 — validade no ciclo Ready | sprint-002/feat-003–005; sprint-003/feat-006–008 → AC-02, AC-03, AC-06, AC-09, AC-10 → T1–T5 | Implementado e testado localmente em `tests/integration/preparations.test.ts`, `tests/integration/queue-scheduler.test.ts`, `tests/integration/attempts.test.ts` e `tests/integration/attempt-transactions.test.ts`. Sem cache entre ciclos; renovação final preservada. |
| D2 — política em Preparations | sprint-002/feat-003–004; sprint-003/feat-006–007; sprint-004/feat-009 → AC-01, AC-03, AC-04, AC-06, AC-09 → T1–T6 | `prepareReadyStart` e integração C1 cobertos pelos testes acima; comparação com contagens, etapas, tempos e IDs em `tests/integration/c1-baseline.probe.test.ts` e neste registro. |
| D3 — sem novas exigências de UI | sprint-001/feat-002; sprint-003/feat-008; sprint-004/feat-009–011 → AC-05–AC-08, AC-10 → T5–T7 | Nenhuma fonte de produto UI/texto/etapa foi alterada. Inspeção visual pendente; `use_playwright=false`, sem Playwright ou CUA. T7 real pendente. A falha isolada de `tests/queue-panel-rendering.test.ts` está detalhada abaixo e não foi ocultada. |

| Critério | Estado e evidência desta execução |
|---|---|
| AC-01 | Implementado no contrato interno de Preparations; `preparations.test.ts` passou. |
| AC-02 | Validade local por chamada; testes de Preparations e ciclo de fila passaram, sem cache entre invocações. |
| AC-03 | Renovação, revisão/ETag e conflitos cobertos em Preparations e `queue-scheduler.test.ts`; teste focado passou. |
| AC-04 | Redução controlada de 3 para 2 observações completas e de 4 para 3 consultas lógicas de issue em Preparations comprovada por sete pares. Ganho real permanece sem comprovação. |
| AC-05 | Interfaces públicas e UI sem mudança no diff; HTTP e testes contratuais passaram. A suíte completa conserva uma falha de asserção de texto em arquivo fora do diff. |
| AC-06 | Seleção, consumo, pausas, perfil, catálogo, recursos e ciclo de despacho cobertos pela regressão de fila; passou. |
| AC-07 | Comparação controlada antes/depois e dispersão reportadas acima. Só doubles; não há marco físico. |
| AC-08 | Evidência local entregue; desempenho real até início OMP continua pendente, sem alegação de ganho. |
| AC-09 | Falhas após gravação, recuperação de recibo e não duplicação cobertas por `preparations.test.ts`; passou. |
| AC-10 | Isolamento, abandono, concorrência, consumo e compatibilidade persistida cobertos pelas suítes focadas; passaram. |

| Prova | Estado |
|---|---|
| T1–T4 | Cobertura local em `tests/integration/preparations.test.ts`; 40 testes passaram na sprint-002 e integrações foram reexecutadas na suíte focada atual. |
| T2–T5 | `tests/integration/queue-scheduler.test.ts`, `tests/integration/attempts.test.ts`, `tests/integration/attempt-transactions.test.ts`; incluídos na execução atual de 162 testes aprovados. |
| T6 | Concluída localmente com sete pares isolados pelo probe acima. |
| T7 | Pendente: sem alvo, conta, host/terminal Maestri, perfis, orçamento e efeitos autorizados para o ensaio. Também falta identificar o evento/recibo verificável do início físico OMP e coletar contadores de envios GitHub no transporte real. Inspeção visual permanece pendente; `use_playwright=false`. |

As sprints-002 e 003 tinham estimativa de três rounds cada em `sprints-20261031_224030-d54caf.json`. Esse esforço maior é registrado como risco de execução; não reduziu a cobertura nem acrescentou requisito de produto.

### Validação local

| Comando | Resultado observado |
|---|---|
| `npm.cmd test -- tests/integration/c1-baseline.probe.test.ts --reporter=verbose --no-color` | Passou; 1 teste, 7 pares, 1 aquecimento por percurso excluído, zero falhas. |
| `npm.cmd test -- tests/integration/preparations.test.ts tests/integration/queue-scheduler.test.ts tests/integration/attempts.test.ts tests/integration/attempt-transactions.test.ts` | Passou nesta repetição; 4 arquivos, 162 testes. |
| `npm.cmd run typecheck` | Passou nesta repetição. |
| `npm.cmd run lint` | Passou nesta repetição: `Module boundaries and TypeScript conventions: OK`. |
| `npm.cmd test` | Parcial nesta repetição: 184 arquivos passaram, 3 falharam; 2.221 testes passaram e 3 falharam. Não é sucesso integrado. |
| `npm.cmd run test:http` | Passou nesta repetição; 3 arquivos, 5 testes. |
| `npm.cmd run test:acceptance` | Passou nesta repetição; 8 arquivos, 64 testes. |
| `npm.cmd run build` | Passou nesta repetição (tsc, Vite e cópia de recursos); aviso Vite de chunk JavaScript de 1.167,93 kB acima de 500 kB. |
| `npm.cmd run test:compiled` | Passou nesta repetição; smoke com HTTP, SSE e SQLite reais locais. Preflight Maestri controlado; Maestri/OMP não executados. |
| `npm.cmd run test:execution-compiled` | Passou nesta repetição; smoke de execução compilada. Integração real Maestri/OMP não executada. |
| `git diff --check` | Passou (exit 0). Como `SPEC_PROGRESS.md` ainda não está rastreado, foi verificado separadamente: UTF-8 válido e nenhuma linha com espaços finais. |

Falhas da suíte completa nesta repetição: `tests/queue-panel-rendering.test.ts` — 1 falha de 12; o teste espera `data.order.description` na renderização, ausente do markup recebido. `tests/integration/shutdown.test.ts` — 1 falha ao limpar diretório `factory-shutdown-*`, com `EPERM` no `%TEMP%` isolado do sandbox Windows. `apps/controller/src/modules/storage/project-storage-locations.test.ts` — 1 falha de 8, `STORAGE_TRANSITION_ACCESS_DENIED` ao mover diretório durante a recuperação. São evidências parciais, não sucesso integrado; os arquivos e o comportamento de UI/storage citados estão fora do recorte C1. Nenhuma dessas falhas foi ocultada por alteração de UI ou storage.

### Rollback e continuidade

Se aparecer regressão de correção, limitar a reversão às mudanças C1 de `preparations.ts`, `start.ts` e testes correspondentes, preservando trabalho preexistente. O caminho anterior continua sendo `createPreparation` → `getPreparation` → `startAttempt`; a compatibilidade de leitura/recuperação pelo mesmo Storage temporário está comprovada em `tests/integration/preparations.test.ts`. Manter a renovação final em `revalidateSummary`. Não fazer migration, limpeza, reset, publicação nem repetição automática de efeitos.

O próximo ensaio real requer autorização explícita e dados concretos do alvo (projeto/repositório/issue), conta GitHub, workspace e terminal/host Maestri, perfis selecionados, orçamento e efeitos permitidos. Precisa ainda definir um evento/recibo que comprove início do Implementador no OMP e capturar os contadores de envios físicos, sem confundi-los com chamadas lógicas. Para cada amostra antes/depois, correlacionar separadamente os IDs de preparação e tentativa, quando esta existir, em campos próprios; não concatenar nem tratar esses IDs como uma única identidade. Não registrar o envelope completo, título, corpo ou conteúdo da issue, orientação/guidance dos perfis, tokens, headers, credenciais ou qualquer conteúdo sensível. O registro deve ser pontual para o ensaio e não acrescentar telemetria permanente ao produto. Este protocolo documental não autoriza executar o ensaio nem criar essa telemetria. Não há SLO nem quantidade mínima de amostras aprovada. Até esse ensaio e a inspeção visual, desempenho real, T7 e aceite formal permanecem pendentes.

## Sprint 004 - Comparação controlada e fechamento das evidências locais [CONCLUIDA]
- Comparação abrangente antes e depois: Comparar a referência da sprint-001 com o percurso integrado em condições equivalentes.
- Regressão integrada e compatibilidade pública: Executar os comandos configurados e verificar que o recorte não alterou contratos públicos nem interfaces do usuário.
- Estado de aceite, pendências reais e rollback: Concluir SPEC_PROGRESS.md com rastreabilidade das provas e instruções de continuidade, sem simular aprovação ou ensaio externo.
