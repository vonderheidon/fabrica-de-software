# Inventário por finalidade — V4 — retirada do legado anterior ao V3

## Fechamento dos cortes na continuação direta - 29/10/2026, após 15h02

Esta seção atualiza as decisões de execução de G1-G8; as descrições anteriores permanecem como inventário histórico. Provas e limites completos estão em retirada-aceite.md, seção de entrega das sprints 002 a 005.

| Grupo | Decisão efetiva e evidência de finalidade | Corte e preservação |
| --- | --- | --- |
| G1/G7 | O layout por projeto foi introduzido no V3 76907bf; os retornos dataDirectory e resolveLegacyRepositoryReference atendiam referências work/git globais sem esse vínculo. O produtor corrente em storage/attempts.ts grava projects/<projectId>/v1/managed/work/<attemptId>/implementation. | Retirados o resolvedor antigo, todos os fallbacks por falta de resolver e os alvos adicionais globais de exclusão. Referência lógica v1 permanece ligada à localização física corrente verificada, inclusive v2 após transição. Proteções de identidade, ancestrais, volume, links, compartilhados e diário atual mantidas; 26 provas Windows e 2 integradas finais. |
| G2 | Escritas atuais produzem Backlog e outros quatro IDs distintos; quatro estados não têm produtor atual. | Contratos, codec e ramos STATUS_MAPPING_LEGACY retirados. Cadastro com github_project nulo preservado. Formulário mantém os cinco campos, sem fluxo substituto. |
| G3 | Planejador/autorização atuais produzem boardName, remote e remote_push. | Removidas variantes antigas e LEGACY_CREATION_REPLAN_REQUIRED, sem inferir quadro. Mantidos plano/hash, autorização durável, etapas do quadro, reconciliação e recibos. |
| G4 | Exceção de bootstrap expressamente aprovada às 14h20, sem reclassificar helpers V3 por idade. | Instalação direta v54/digest; v53 conforme preservado. SQL histórico executável apenas em fixtures de teste, não distribuído. Produção atual de composição e cabeçalhos mantida. |
| G5 | git show c7c3f22:packages/contracts/src/preparations.ts confirma costDefaults no contrato anterior; 163e869 remove o campo dos produtores e introduz historicalCapture/historicalSnapshot para descartá-lo na leitura. Ambos antecedem o pacote V3; não existe produtor corrente dessa variante. | Retirados somente os schemas/conversões costDefaults, não os readers atuais. Preservados v3_delivery, publication_target nula/omitida, effort nulo, composição opcional, bytes e hashes. Bootstrap recusa inclusive revisão de preparação não ativa com o campo retirado. |
| G6/G8 | Reserva sem IDs, opcionais de perfis/resultados e HistoricalProfile têm finalidade corrente. resultSchemaFor já diferencia novos resultados dos envelopes arquivados no HEAD. | Preservados; não surgiu outra variante exclusivamente antiga comprovada para cortar. Testes e revisão independente confirmaram as fronteiras sem impor IDs antes da observação nem reescrever histórico. |

Também retiradas as consultas condicionais de tabelas ausentes em configuration-reads, project-configuration-lock e project-deletion-barrier: destinavam-se a schemas parciais/fixtures históricas, agora recusados pelo bootstrap. Fixtures pertinentes passaram a fornecer o schema ou as tabelas atuais necessárias. Não se retiraram proteções de atividade, exclusão ou publicação.

## Atualização da decisão de bootstrap — 29/10/2026, 14h20

A decisão específica do usuário consolidou a instalação direta v54/digest, com ledger vazio, e a abertura de bases correntes v53 conformes com ledger real intacto. Para G4, a retirada do executor de migrations histórico e seus backfills é uma exceção de escopo expressa da decisão de bootstrap, não uma classificação dos helpers V3 como pré-V3. Os testes atuais preservam valores de perfil com composição nula, guidance, revisão e timestamps; tentativas novas continuam produzindo cabeçalhos de busca. Prefixos parciais não são atualizados silenciosamente. As declarações abaixo de D-001 pendente e de bloqueio exclusivo desse formato são históricas e ficam superadas por esta decisão, sem ampliar a retirada de G1–G3/G5–G8.

Referências efetivas conferidas: `migrations.ts` (`loadSchemaRecognitionResources`, `inspectHistory`, `initializeSchema`), `database-inspection.ts`, `openStorageWithSchema` em `storage/index.ts`, `resources/storage/initial-schema.v54.sql` e `schema-recognition.v1.json`. Histórico SQL permanece exclusivamente como entrada de fixtures de testes; distribuição copia somente os dois recursos atuais. As origens V3 já identificadas continuam registradas no G4, e as demais classificações sem evidência permanecem impedimentos para as sprints responsáveis.

## Escopo e regra de classificação

Este inventário cobre os oito grupos iniciais, os dez conjuntos US e a cadeia alcançável de consumidores observados no HEAD 6ee0391145832b34fc44c6af020013b211fb72bb. Depois da captura, o checkout recebeu um candidato local de instalação direta ainda sem decisão D-001: `migrations.ts` agora lê catálogo estático e schema v54; `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders` não estão mais no módulo, e prefixos parciais são rejeitados. A atualização do G4 abaixo registra essa divergência sem classificar a retirada como anterior ao V3.

Uma classificação de retirada exige evidência de que o ramo atende somente um contrato anterior ao V3 e não possui produtor, estado de ciclo de vida, histórico ou consumidor atual. Nome com legacy, data, número de migration, format_version=1, grafia privada e campo ausente não bastam. Classificações insuficientes são impedimentos antes da sprint que removeria o ramo.

Estados usados abaixo:

- **Retirada justificada:** requisito atual identifica a variante anterior e o fluxo produtor vigente não a gera. A feature responsável ainda precisa retirar e verificar todos os consumidores.
- **Preservar:** o comportamento corresponde a estado, histórico, proteção ou contrato atual. Sua retirada seria regressão.
- **Impedimento:** a forma antiga aparece no armazenamento ou tem consumidores atuais, e as fontes disponíveis não provam sua finalidade exclusiva anterior ao V3. Não remover até resolver a classificação.

Fontes normativas da feature: PRD, SPEC e stories em `docs/Docs20261028_162109/`. A matriz de responsabilidades reutiliza a leitura integral registrada em `docs/Docs20261028_162109/sprint-validation20261028_162109.md`, seção S1. Interfaces e linhas citadas foram conferidas nas fontes atuais; CodeGraph foi usado somente como orientação.

## Oito grupos iniciais

### G1 — Raiz global antiga e resolução de workspace

- **Arquivos, símbolos e formato:** `apps/controller/src/modules/workspaces/project-storage.ts`, `resolveAttemptRoot` e `resolveRepositoryReference`; `apps/controller/src/modules/storage/project-storage-locations.ts`; `apps/controller/src/modules/storage/project-storage-transitions.ts`. Referências antigas são strings como `work/<attemptId>/implementation` e `git/<attemptId>.git`; o layout atual é relativo a `projects/<projectId>/v<layoutVersion>/<locationKey>`. O estado atual de projeto ainda sem alocação é `state=current`, `managed_root=null`, `locations=[]`.
- **Produtor:** criação/preparação e materialização de tentativa; a raiz atual é alocada pelo resolvedor de armazenamento de projeto. `apps/controller/src/main.ts` injeta `resolveAttemptRoot` no fluxo montado por `apps/controller/src/modules/workspaces/index.ts`.
- **Consumidores HTTP, storage, executor e UI:** rotas de projeto, preparação, tentativas, captura, diff, recuperação e entregas usam os serviços de workspaces. O storage persiste `attempts.workspace_reference`, `resources.reference`, `project_storage_locations` e `project_storage_transitions`. O executor Maestri/OMP recebe o workspace materializado; a UI consome views de projeto/tentativa, sem resolver caminho local.
- **Persistência e testes:** `apps/controller/src/modules/storage/project-storage-locations.test.ts`, `tests/integration/storage-transition.test.ts`, testes de workspace/preparação/captura/recuperação e `tests/native/project-deletion.integration.proof.ts` exercitam layouts e proteção em fixtures.
- **Finalidade e decisão:** US-07.C2/C3 e RF-18/19 identificam como retirada o fallback para a raiz global de recursos exclusivos e o leitor ligado a esse layout. A evidência é o contrato corrente com localização versionada por projeto e a proibição explícita de fallback, não o nome do helper. A view sem localização antes da alocação continua legítima e deve permanecer; isso não autoriza devolver a raiz global a um consumidor. **Retirada justificada para o fallback comprovadamente global; preservar estados sem localização e inspeções de identidade/volume/ancestrais.** Responsabilidade de remoção/consumidores: sprint-004, features 022–029 conforme a matriz do plano.

### G2 — Mapeamento de quadro de quatro estados

- **Arquivos, símbolos e formato:** `packages/contracts/src/projects.ts`, `LegacyStatusOptionIds`, `LegacyProjectMapping`, `ReadProjectMapping` e `StatusOptionIds`; `apps/controller/src/modules/projects/status-mapping.ts`; erros `STATUS_MAPPING_LEGACY` em queue, preparations e configuration reads. O ramo antigo contém quatro IDs (`ready`, `in_progress`, `in_review`, `delivered`); o contrato atual contém cinco, acrescentando `backlog`, e exige cinco IDs distintos.
- **Produtor:** a configuração atual de projeto salva os cinco estados; criação pelo formulário e writes de configuração não produzem o objeto de quatro IDs.
- **Consumidores HTTP, storage, executor e UI:** GET/PUT de apps/controller/src/http/routes/projects.ts e rotas de queue/preparations no controller; project_revisions.status_options_json e projeções no storage; seleção Ready na preparação/fila; apps/web/src/features/projects/ProjectForm.tsx, apps/web/src/features/projects/ProjectReadiness.tsx, apps/web/src/features/preparations/PreparationDialog.tsx e apps/web/src/features/queue/QueuePanel.tsx. O executor usa a preparação atual, sem converter o mapeamento.
- **Persistência e testes:** `packages/contracts/src/project-mapping.test.ts`, `apps/controller/src/modules/projects/project-mapping.test.ts`, `apps/controller/src/modules/storage/configuration-json.test.ts`, `apps/controller/src/modules/storage/preparations.test.ts` e `tests/integration/queue-scheduler.test.ts`; estado privado em `project_revisions.status_options_json`.
- **Finalidade e decisão:** US-03.C2, RF-06/07 e o produtor de cinco estados distinguem a variante incompatível da configuração vigente. Não há conversão nem Backlog inventado. **Retirada justificada para o leitor de quatro estados e seus diagnósticos/consumidores exclusivos.** Preservar validação de cinco IDs, Ready e mensagens existentes que continuem corretas. Responsabilidade atual: sprint-003, `feat-007` (origens 007/008/009).

### G3 — Plano antigo de criação de projeto

- **Arquivos, símbolos e formato:** `packages/contracts/src/scaffold.ts` e `packages/contracts/src/http-observation/scaffold.ts` definem `LegacyScaffoldInput`/`LegacyScaffoldPlan` além do plano atual; `apps/controller/src/modules/projects/scaffold.ts` trata `LEGACY_CREATION_REPLAN_REQUIRED`; `apps/controller/src/http/observation-views.ts` projeta a observação correspondente. A variante antiga não carrega o conjunto integral atual, incluindo quadro, remoto e modo `remote_push`.
- **Produtor:** apps/web/src/features/projects/ProjectCreationDialog.tsx envia o plano atual; planejamento e autorização usam o contrato completo e seu hash.
- **Consumidores HTTP, storage, executor e UI:** rotas de planos/criações e DTOs de observação; apps/controller/src/modules/storage/creations.ts persiste plan_json, hash, operações/efeitos e recibos; workspace local/GitHub durante criação, sem executor Maestri/OMP; ProjectCreationDialog consulta e reconcilia a operação.
- **Persistência e testes:** `tests/integration/scaffold.test.ts`, `tests/integration/remote-scaffold.test.ts`, `packages/contracts/src/observation-public.test.ts` e testes de persistência de criações cobrem planos, efeitos e retomada.
- **Finalidade e decisão:** US-04.C2/C3 e RF-09/10 exigem o plano atual integral e proíbem preencher campo ausente para aceitar um plano anterior. Essa evidência semântica sustenta retirar a variante que não possui os campos/modos atuais; `format_version` isolado não é usado como justificativa. **Retirada justificada para a variante antiga; preservar hash, autorização durável, idempotência, reconciliação e recibos atuais.** Responsabilidade atual: sprint-003, `feat-010` (origens 010/011/012).

### G4 — Cadeia de migrations e validação de schema histórico

- **Arquivos, símbolos e formato:** no baseline inicial: `apps/controller/src/modules/storage/migrations.ts`, `loadMigrations`, `inspectHistory`, `applyMigrations`, `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders`; `apps/controller/src/modules/storage/migrations/001_*.sql` a `053_*.sql`. O candidato atual acrescenta `database-inspection.ts`, `resources/storage/schema-recognition.v1.json` e `resources/storage/initial-schema.v54.sql`; remove os dois helpers V3 do módulo e substitui `loadMigrations`/`applyMigrations` por `loadSchemaRecognitionResources`/`initializeSchema`. O formato anterior guardava versão, nome, checksum e timestamp em `schema_migrations`, além de `application_id` e `user_version`.
- **Produtor:** inicialização normal de storage em `apps/controller/src/modules/storage/index.ts` chama `loadMigrations` e a rotina de aplicação/inspeção.
- **Consumidores HTTP, storage, executor e UI:** inicialização do controller precede todas as rotas e consultas; configuração, criação, execução, histórico e UI dependem do schema aberto. Não há chamada HTTP de migration nem executor de produto que deva contornar o bootstrap.
- **Persistência e testes:** `factory.sqlite`, `schema_migrations`, schema/índices/triggers e configurações; `apps/controller/src/modules/storage/storage.test.ts`, `apps/controller/src/modules/storage/local-installation.test.ts`, testes de versões e `scripts/persistence-proof.mjs`.
- **Finalidade e decisão:** US-01/02 e RF-01–05 exigem instalação direta no schema final e recusa pré-escrita de bases incompatíveis. Os commits V3 76907bf e ebdd67e comprovam que `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders` não são exclusivamente anteriores ao V3. O candidato local atual reconhece instalação direta v54 ou ledger completo v53; rejeita prefixos parciais e não mantém caminho de upgrade para eles. Essa rejeição não está classificada como retirada pré-V3, portanto **feat-001.AC2 fica bloqueada**. O formato de proveniência continua sujeito à decisão específica D-001; não o tratar como aprovado nem concluir feat-003/sprints dependentes. Conservar identidade 0x4e465331, ledger realmente aplicado, nomes/checksums pertinentes, integrity/FK e ausência de escrita na recusa. Não afirmar que uma migration foi executada se não foi.

### G5 — Capturas, escolhas e configuração histórica

- **Arquivos, símbolos e formato:** `apps/controller/src/modules/storage/historical-configuration.ts` define `historicalCapture`, `historicalSnapshot`, `retiredCostDefaults`, `readCapturedConfiguration` e `readPreparationChoices`. `attempts.capture_json` guarda chaves privadas como `v3_delivery`; `preparations.choices_json` guarda escolhas serializadas. Há conversores de grafia entre JSON privado e contratos atuais.
- **Produtor:** serializeCapture e serializePreparationChoices gravam a forma privada atual; apps/controller/src/modules/storage/configuration-json.ts e configuração/preparação versionadas produzem os valores correntes.
- **Consumidores HTTP, storage, executor e UI:** `apps/controller/src/modules/storage/attempts.ts`, `apps/controller/src/modules/storage/measurements.ts` e `apps/controller/src/modules/storage/preparations.ts`; views HTTP de tentativa/observação e consultas de resultados; pipeline lê a configuração capturada; UI de tentativas, perfil histórico e histórico de registros.
- **Persistência e testes:** attempts.capture_json, preparations.choices_json e projeções da configuração; apps/controller/src/modules/storage/configuration-json.test.ts, tests/integration/attempts.test.ts, tests/integration/backend-measurement.test.ts, apps/controller/src/modules/storage/preparations.test.ts e apps/controller/src/modules/storage/profile-composition.test.ts; também testes de histórico.
- **Finalidade e decisão:** a adaptação de `costDefaults` aparece como candidata ligada a configuração antiga, mas o leitor é usado por consultas de capturas e preparações históricas que podem pertencer ao produto atual. O nome `retired`, `formatVersion=1` ou chave privada não provam exclusividade anterior ao V3. **Impedimento para remover os readers completos ou normalizar JSON.** Classificar cada campo contra produtores, versões e consumidores; preservar leitura imutável, bytes, hashes e opcionais até prova individual. Responsabilidade atual de configuração: sprint-003 `feat-013` (origens 013/015/033/034); a fronteira de execução/histórico pertence também a `feat-016` na sprint-003; medições finais ficam em `feat-035`, sprint-005.

### G6 — Campos opcionais de sessão, terminal e resultado

- **Arquivos, símbolos e formato:** `apps/controller/src/modules/execution/index.ts`, `PassageRecord` e `AttemptSessionIdentity`; `packages/contracts/src/execution.ts`, `packages/contracts/src/http-execution/protocol-views.ts`; `apps/controller/src/modules/storage/execution.ts`; `apps/controller/src/modules/execution/roles.ts` e `apps/controller/src/modules/execution/adapters/maestri-omp/bootstrap.ts`. IDs de terminal/workspace/OMP e origem de sessão podem estar nulos ou ausentes enquanto a sessão está reservada ou a identidade ainda não foi observada.
- **Produtor:** reserva/plano de terminal precede handshake e confirmação; somente a observação confirma IDs de terminal/workspace/OMP. A continuação cria sua própria identidade e não importa conversa de outra tentativa.
- **Consumidores HTTP, storage, executor e UI:** DTOs de apps/controller/src/http/execution-views.ts, protocolos e event stream; tabelas attempt_sessions, managed_terminals, terminal_occupancies, passages e passage_results; adapter/roles aplicam o contrato após observação; apps/web/src/features/attempts/PassageFacts.tsx, apps/web/src/features/attempts/HistoricalProfile.tsx e apps/web/src/features/attempts/AttemptDetailDialog.tsx apresentam os dados confirmados.
- **Persistência e testes:** apps/controller/src/modules/execution/execution.test.ts, apps/controller/src/modules/execution/terminal-observation.test.ts, tests/integration/execution-public.test.ts, tests/integration/recovery.test.ts e provas nativas tests/native/session-recovery.proof.ts e tests/native/session-continuity.proof.ts cobrem reserva, observação, recuperação e continuidade.
- **Finalidade e decisão:** US-06.C1/C2 e os contratos de reserva mostram que a ausência antes da observação é estado atual possível. Não classificar opcionais como legado pela ausência. **Preservar nulabilidade, estado reservado, confirmação e incerteza.** Responsabilidade atual de contratos e consumidores: sprint-003 `feat-016` (origens 016–021/036/037), com configuração em `feat-013`; provas autorizadas permanecem no fechamento `feat-040`, sprint-005.

### G7 — Destinos globais no inventário de exclusão

- **Arquivos, símbolos e formato:** `apps/controller/src/modules/storage/project-deletion-paths.ts`, `readProjectDeletionPaths`, e `apps/controller/src/modules/storage/project-deletion-inventory.ts`; caminhos materializados incluem `work/<attemptId>`, `git/<attemptId>.git` e `execution-bootstrap/<passageId>`, além das raízes atuais `projects/<projectId>/vN/managed` e dos destinos de transição versionada.
- **Produtor:** referências de workspace/resource e snapshots de tentativa entram no inventário; a transição atual registra origem/destino autorizadas e versionadas.
- **Consumidores HTTP, storage, executor e UI:** preview/inspeção, autorização, worker, finalização e retomada de exclusão no controller; `project_deletion_targets` e recibos no storage; workspaces/Git são destinos de execução; UI aciona a operação atual sem escolher caminho arbitrário.
- **Persistência e testes:** alvos autorizados, identidade observada, proprietário, geração/recibo e digest do inventário; `apps/controller/src/modules/storage/project-deletion-paths.test.ts`, testes de acceptance/worker e `tests/native/project-deletion.integration.proof.ts`.
- **Finalidade e decisão:** US-08.C2/RF-22 determina retirar somente destinos adicionais exclusivamente do layout antigo. A presença de caminhos globais no código e em fixtures não prova que cada referência persistida seja anterior ao V3; os testes também protegem recursos de outras tentativas e pastas compartilhadas. **Impedimento por alvo:** remover apenas o destino cujo vínculo ao layout antigo e ausência de uso atual forem demonstrados; preservar as raízes versionadas, transição atual, caminhos compartilhados, propriedade, autorização, worker e recuperação parcial. Responsabilidade atual: sprint-004 `feat-027` (origens 027/030/031/032), com resolvedor/consumidores integrados em `feat-022` (origens 022–026/028/029).

### G8 — Histórico de tentativas, perfil capturado e consultas

- **Arquivos, símbolos e formato:** apps/web/src/features/attempts/HistoricalProfile.tsx, apps/web/src/features/attempts/AttemptDetailDialog.tsx e apps/web/src/features/attempts/PassageFacts.tsx; apps/controller/src/modules/queries/; storage de attempts/passages/results/deliveries/reviews; contrato HttpAttemptDetail e consultas resumidas/detalhadas.
- **Produtor:** perfil/configuração capturados na tentativa, resultado por passagem/versão, revisão e evidências da rodada.
- **Consumidores HTTP, storage, executor e UI:** consultas paginadas e detalhe sob demanda; storage lê IDs, hashes e vínculos; executor/revisor produz resultados atuais vinculados a tentativa/papel/rodada; UI exibe perfil e histórico associados àquela tentativa.
- **Persistência e testes:** capturas e referências imutáveis de attempts/results/reviews/deliveries; apps/web/src/features/attempts/historical-profile.test.ts, apps/web/src/features/attempts/attempt-detail.test.ts e tests/integration/attempt-results.test.ts cobrem perfil histórico, detalhe e evidências.
- **Finalidade e decisão:** US-06, US-09 e US-10 exigem conservar perfil capturado, evidências, hashes, versões e histórico atual. “Historical” descreve a relação temporal com uma tentativa, não compatibilidade anterior ao V3. **Preservar componente, consultas, IDs e leitura sob demanda.** Responsabilidade atual: sprint-003 `feat-013` (origens 013/015/033/034) e `feat-016` (origens 016–021/036/037); fechamento da comparação em `feat-035`, sprint-005 (origens 035/038).

## Dez conjuntos US e fechamento de fluxo

Esta matriz cobre cada domínio, seus produtores/consumidores e a feature/sprint que deve fechar a fronteira. Os grupos são os consolidados no plano de cinco sprints; origens continuam pesquisáveis na seção B2 da validação do plano. Os detalhes de formatos, persistência, testes e decisão estão nos grupos G1–G8 acima.

| Conjunto | Formato/entrada e produtor | Consumidores HTTP, storage, executor e UI | Persistência/testes pertinentes | Decisão e responsável |
| --- | --- | --- | --- | --- |
| US-01 — instalação atual | Diretório vazio; bootstrap de storage e schema final | Inicialização antes das rotas; storage atende todos os módulos; UI não acessa SQL | migrations, settings; storage/local-installation e prova de persistência | Demonstração bloqueada pela representação de histórico, `feat-003`/sprint-001; `feat-004` (origens 004/005/006/014)/sprint-002 depende dela |
| US-02 — recusar base incompatível | application_id, user_version, quick/FK checks, ledger e configuração observada | Inspeção antes de conexão gravável; erros chegam à rota existente sem recuperação nova | banco e WAL/SHM; testes de storage/local-installation e cenários incompatíveis | Preservar recusa sem escrita; resolver metadados em `feat-003`, depois implementar bootstrap/recusa em `feat-004`/sprint-002 |
| US-03 — quadro atual | Mapeamento de cinco IDs; produtor atual é configuração de projeto | API de configuration/queue; storage de revisão; preparation/fila usam Ready; formulário/readiness/queue exibem estado atual | project_revisions; testes de mapping, configuration, preparation e queue | Retirada de quatro estados justificada; `feat-007` (origens 007/008/009)/sprint-003 |
| US-04 — plano atual | Plano integral de scaffold, com quadro, remoto e remote_push; produtor é ProjectCreationDialog | HTTP plan/create/observation; creations e recibos; workspace Git/GitHub; dialog reconcilia | plan_json/hash/effects; scaffold e remote-scaffold | Retirada de planos incompletos justificada; sprint-003 `feat-010` (origens 010–012) |
| US-05 — configuração/preparação atuais | Configuração salva, perfil composto e choices snapshot; serializadores atuais | HTTP config/preparation; storage config/choices; pipeline captura a configuração efetiva; formulários preservam rascunho | configuration revisions, preparation choices, capture; testes de JSON e composition | Preservar campos atuais/opcionais; costDefaults antigo segue impedido até prova de finalidade; sprint-003 `feat-013` (origens 013/015/033/034) |
| US-06 — execução/recuperação | Reserva, sessão/papel, resultado, passagem e evidência; IDs são confirmados por observação | HTTP attempts/events/results; sessions/terminals/passages; adapter Maestri/OMP e roles; AttemptDetail/PassageFacts/HistoricalProfile | attempt_sessions, terminals, passages/results/reviews; testes de execution/recovery/session | Preservar nulos legítimos e identidade por tentativa; sprint-003 `feat-016` (origens 016–021/036/037) |
| US-07 — localizações atuais | Referência de tentativa e localização versionada; alocador atual | Rotas e services de projeto/attempt; storage de locations/transitions; executor usa workspace materializado; UI consome view | locations, transitions, references; project-storage tests | Fallback global antigo é candidato justificado; estado sem alocação e transição atual ficam; sprint-004 `feat-022` (origens 022–026/028/029) |
| US-08 — publicar/excluir | Referência Git aprovada, destino autorizado e inventário versionado | Rotas de publish/delete; receipts/targets/workers; workspace Git; diálogos de operação atuais | delivery targets, deletion targets, generations/receipts; acceptance e native proof | Classificar cada alvo antes de remover; sprint-004 `feat-022` (publicação/refs) e `feat-027` (origens 027/030–032, exclusão) |
| US-09 — histórico atual | Captura por tentativa/versão, resultado, parecer e evidence; produtores atuais | Query/HTTP summary e detail; storage imutável; executor/reviewer vinculados à rodada; records e perfil histórico | attempts/passages/results/deliveries/reviews; query/history tests | Preservar história e grafia privada sem normalização; sprint-003 `feat-013/016`, fechamento em sprint-005 `feat-035` (origens 035/038) |
| US-10 — interface vigente | Projeções atuais de configuração, criação, preparação, fila, tentativas e registros | Consumers React e rotas existentes; storage/contracts/executor atrás da API; captura visual compara a mesma superfície | testes de componentes e `ui-removal-gate` existente | Retirar somente UI exclusiva de formatos demonstrados; zero acréscimos; cortes em sprints 003/004 (`feat-007/010/013/016/022/027`), comparação em sprint-005 `feat-035` |

## Caminhos adicionais alcançáveis incluídos

- Injeção e chamada dos resolvedores: apps/controller/src/main.ts; apps/controller/src/modules/workspaces/index.ts; apps/controller/src/modules/workspaces/prepare.ts, apps/controller/src/modules/workspaces/capture.ts, apps/controller/src/modules/workspaces/diff.ts, apps/controller/src/modules/workspaces/materialize.ts, apps/controller/src/modules/workspaces/recovery.ts, apps/controller/src/modules/workspaces/retention.ts, apps/controller/src/modules/workspaces/publication.ts, apps/controller/src/modules/workspaces/remote-publication.ts e apps/controller/src/modules/workspaces/delivery-target.ts.
- Projeções e gravações de configuração: apps/controller/src/http/routes/projects.ts; apps/controller/src/modules/storage/configuration-reads.ts, apps/controller/src/modules/storage/configuration-writes.ts, apps/controller/src/modules/storage/configuration-command-json.ts; apps/controller/src/modules/projects/queue.ts e apps/controller/src/modules/projects/preparations.ts.
- Planejamento e observação de criação: apps/controller/src/http/routes/scaffold.ts, apps/controller/src/modules/projects/scaffold.ts, apps/controller/src/http/observation-views.ts, apps/controller/src/modules/storage/creations.ts, apps/web/src/features/projects/ProjectCreationDialog.tsx e packages/contracts/src/observation-public.test.ts.
- Sessão/resultado e histórico: apps/controller/src/http/execution-views.ts, apps/controller/src/modules/execution/adapters/maestri-omp/bootstrap.ts, apps/controller/src/modules/pipeline/start.ts, apps/controller/src/modules/storage/attempts.ts, apps/controller/src/modules/storage/execution.ts, apps/controller/src/modules/queries/, apps/web/src/features/attempts/AttemptDetailDialog.tsx, apps/web/src/features/attempts/PassageFacts.tsx, apps/web/src/features/attempts/HistoricalProfile.tsx e apps/web/src/features/records/.
- Exclusão e alvos: apps/controller/src/modules/storage/project-deletion-acceptance.ts, apps/controller/src/modules/storage/project-deletion-worker.ts, apps/controller/src/modules/storage/project-deletion-paths.test.ts e tests/native/project-deletion.integration.proof.ts.

Essa lista fecha os consumidores alcançáveis; um import/caller é dependência técnica, não evidência de que seu comportamento seja obsoleto. Cada fronteira precisa encerrar produtor, consumidores diretos, persistência, testes e superfície UI no sprint responsável.

## Matriz de critérios US → features responsáveis

Fonte: SPEC da feature, seção de critérios, e matriz completa S1 de `docs/Docs20261028_162109/sprint-validation20261028_162109.md`. Os 44 IDs estão discriminados individualmente. As features abaixo são os grupos consolidados do plano vigente; as origens antigas permanecem rastreáveis pela tabela §B2 da validação do plano.

| Critério | Feature(s) |
| --- | --- |
| US-01.C1 | feat-004 |
| US-01.C2 | feat-004 |
| US-01.C3 | feat-004 |
| US-01.C4 | feat-004 |
| US-02.C1 | feat-004 |
| US-02.C2 | feat-004 |
| US-02.C3 | feat-004 |
| US-02.C4 | feat-004 |
| US-03.C1 | feat-007 |
| US-03.C2 | feat-007 |
| US-03.C3 | feat-007 |
| US-03.C4 | feat-007 |
| US-04.C1 | feat-010 |
| US-04.C2 | feat-010 |
| US-04.C3 | feat-010 |
| US-04.C4 | feat-010 |
| US-05.C1 | feat-013 |
| US-05.C2 | feat-013 |
| US-05.C3 | feat-013 |
| US-05.C4 | feat-013 |
| US-06.C1 | feat-016 |
| US-06.C2 | feat-016 |
| US-06.C3 | feat-016 |
| US-06.C4 | feat-016 |
| US-06.C5 | feat-016 |
| US-07.C1 | feat-022 |
| US-07.C2 | feat-022 |
| US-07.C3 | feat-022 |
| US-07.C4 | feat-022 |
| US-07.C5 | feat-022 |
| US-08.C1 | feat-022 |
| US-08.C2 | feat-027 |
| US-08.C3 | feat-022, feat-027 |
| US-08.C4 | feat-027 |
| US-08.C5 | feat-027 |
| US-08.C6 | feat-004, feat-027 |
| US-09.C1 | feat-013, feat-016 |
| US-09.C2 | feat-013, feat-016 |
| US-09.C3 | feat-013, feat-016 |
| US-09.C4 | feat-035 |
| US-10.C1 | feat-007, feat-010, feat-013, feat-016, feat-022, feat-027 |
| US-10.C2 | feat-035 |
| US-10.C3 | feat-035 e os cortes de domínio responsáveis pelos textos |
| US-10.C4 | feat-035 e os cortes de domínio responsáveis pelas ações |

## Matriz RF → features responsáveis

| Critério | Feature(s) |
| --- | --- |
| RF-01 | feat-004 |
| RF-02 | feat-004 |
| RF-03 | feat-004 |
| RF-04 | feat-004 |
| RF-05 | feat-003, feat-004 |
| RF-06 | feat-007 |
| RF-07 | feat-007 |
| RF-08 | feat-007 |
| RF-09 | feat-010 |
| RF-10 | feat-010 |
| RF-11 | feat-010 |
| RF-12 | feat-013 |
| RF-13 | feat-004, feat-013 |
| RF-14 | feat-013, feat-016 |
| RF-15 | feat-016 |
| RF-16 | feat-016 |
| RF-17 | feat-016 |
| RF-18 | feat-022 |
| RF-19 | feat-022 |
| RF-20 | feat-022 |
| RF-21 | feat-022 |
| RF-22 | feat-027 |
| RF-23 | feat-027 |
| RF-24 | feat-027 |
| RF-25 | feat-013, feat-016 |
| RF-26 | feat-013, feat-016, feat-035 |
| RF-27 | feat-007, feat-010, feat-013, feat-016, feat-022, feat-027, feat-035 |
| RF-28 | feat-035 e os cortes de domínio responsáveis pelos textos |

## Matriz RNF → features responsáveis

| Critério | Feature(s) |
| --- | --- |
| RNF-01 | feat-004, feat-013, feat-016, feat-022, feat-027 |
| RNF-02 | feat-007, feat-010, feat-013, feat-016, feat-022, feat-027, feat-035, feat-039 |
| RNF-03 | feat-016, feat-022, feat-027 |
| RNF-04 | feat-004, feat-010, feat-016, feat-022, feat-027 |
| RNF-05 | feat-035 e os cortes de domínio responsáveis pelos componentes |
| RNF-06 | feat-002, feat-013, feat-016, feat-022, feat-035 |
| RNF-07 | feat-001, feat-004, feat-007, feat-010, feat-013, feat-016, feat-022, feat-027, feat-039 |
| RNF-08 | feat-004, feat-007, feat-010, feat-013, feat-016, feat-022, feat-027, feat-039 |
| RNF-09 | feat-004, feat-022, feat-035 |
| RNF-10 | feat-001, feat-002, feat-003, feat-035, feat-039, feat-040 |

## Impedimentos antes de retirar qualquer ramo não comprovado

1. **Schema e migrations:** feat-003 precisa de decisão sobre o formato de baseline/histórico. Não liberar bootstrap da sprint-002 antes da demonstração específica.
2. **Configuração histórica:** delimitar campo por campo de `historicalCapture`/`historicalSnapshot`; manter capturas/choices somente leitura até provar a origem anterior ao V3. `formatVersion=1`, `costDefaults` ou grafia privada isoladamente não fecham a prova.
3. **Referências e exclusão:** classificar por referência e proprietário os alvos `work`, `git` e `execution-bootstrap`; conservar recursos atuais compartilhados, proteção contra substituição e transição versionada.
4. **Execução:** ausência de IDs enquanto reserva ou antes de observação é legítima; nenhuma obrigatoriedade nova de `terminal_id`, `workspace_id`, `omp_session_id` ou `session_source_id` pode ser inferida.
5. **Histórico/UI:** `HistoricalProfile`, resultados, revisão, evidências, consultas leves e detalhes sob demanda continuam contratos atuais. A idade do dado e o nome “historical” não autorizam retirar.
6. **Alinhamento normativo:** SPEC.md e INTEGRACAO-MAESTRI-OMP.md permanecem sem edição nesta sprint documental. Após aprovação pertinente no pipeline, alinhar os trechos de quatro estados, planos antigos, composição retroativa, backfills e layout antigo e registrar referências exatas. Esta entrega não presume aprovação nem Design Lock.

As obrigações correspondem a feat-001.AC1–AC3 e feat-003.AC2–AC4. A existência desta matriz não conclui a sprint nem autoriza a remoção antecipada de consumidores.
