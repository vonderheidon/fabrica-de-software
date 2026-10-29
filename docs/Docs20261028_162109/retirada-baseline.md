# Baseline anterior — V4 — retirada do legado anterior ao V3

## Referência atual aceita pelo usuário — 29/10/2026, 14h20

Referência substituta autorizada para esta feature: `.cache/sprint001-reference-20261029-1420/result.json`, 21 capturas de Dashboard, Projetos, Perfis Globais, Fila Ready, Tentativas, Registros e Configuração em 1440×1000, 1100×480 e 390×640. Autoria: chat principal Codex; independentReviewer=false e historicalBaseline=false. Não é captura retroativa ou atribuída ao Revisor.

Janela externa observada 1795×1012, viewports emulados separadamente, DPR=1 e visualViewport.scale=1 em todos os casos. Sem overflow horizontal por medição DOM nos 21 cenários; imagens Configuração desktop e Projetos narrow inspecionadas visualmente. Console consultado sem erros/warnings. É referência de comparação, não auditoria completa de UI. Rotas reais em 4310, sem interceptação de APIs; nenhuma criação, início, publicação ou exclusão acionada.

Asset servido `index-fcrw0smO.js`, SHA-256 `f875ea9c5c635d1c9ab1d21a1581c9347281989c25f4a5cdc49008b5e263afa9`, CSS `index-CK1Sh9xa.css`. HEAD, fontes/recursos presentes e hashes PNG em manifest.json, SHA-256 `b5c7178458be149dc8f34fa1492aa49369ed825fedc77e6ae779e607bb36d4a4`. Catálogo somente de hashes; não contém banco/checkout. Alterações documentais posteriores são identificadas no aceite e na validação do plano, sem afirmar igualdade de hashes antigos. Manifesto original preservado.

Validação desta continuação: typecheck/lint aprovados; suíte integral 1.994 testes/169 arquivos aprovada; distribuição aprovada com SQLite nativo e reinício controlado. A prova física anterior `.cache/persistence-proof-tnjMk2/report.json` continua identificada por seu escopo, schema 54 e referências preservadas. Sem Maestri/OMP real. Reset autorizado não foi necessário: o controller abriu a base existente normalmente.

## Revisão direta de 2026-10-29, após 14h10

Referência posterior às alterações existentes, sem substituir o baseline original: build passou com JS `index-fcrw0smO.js`, SHA-256 `f875ea9c5c635d1c9ab1d21a1581c9347281989c25f4a5cdc49008b5e263afa9`; CSS continua `index-CK1Sh9xa.css`. Esse JS não é o asset anterior e não foi apresentado como bundle servido ou captura visual do Revisor.

`npm.cmd run proof:persistence` passou: `.cache/persistence-proof-tnjMk2/report.json`, observedAt `2026-10-29T17:14:35.645Z`, schema 54, status `local_persistence_and_process_recovery_passed`. A prova percorre SQLite temporário, medições de cache, processos físicos e reinícios controlados. O verificador e a prova nativa foram alinhados à instalação direta 54; continuam exigindo integridade, FKs, preservação das referências e paradas observadas. Não é execução Maestri/OMP real nem publicação.

`npm.cmd run test:compiled` passou com HTTP/SSE/SQLite reais em fixture, idempotência, process lock, shutdown, restart e revogação da sessão; preflight Maestri controlado. Os 28 testes dirigidos de instalação, composição, cabeçalhos e relatório passaram. A reabertura direta foi testada com Database.exec bloqueado, settings iguais e ledger vazio. Lint e git diff --check passaram; typecheck encontrou testes de contratos de outras superfícies ainda desalinhados; suíte integral não repetida.

SHA-256 reconferidos e preservados: manifesto `8871268c7a953bf6abf810cc89f12058b28817c9f3847527f021c05c4f47cd63`, SPEC da feature `28792af89689ca324e6c725ddccdf15721503bb72821a90ea6898f864ad934ab`, plano `77b381621d919af8896777870b029be48055a0eeca65c3b26ac87492f87ccf9d`. Nenhuma captura retroativa ou aprovação D-001 produzida nesta revisão. Ver a matriz mais recente no início de retirada-aceite.md.

## Identidade e escopo da captura

- **Revisão Git:** HEAD `6ee0391145832b34fc44c6af020013b211fb72bb`, consultado com `git show -s --format=%H HEAD` em 2026-10-29. O working tree já continha artefatos não commitados na pasta `docs/Docs20261028_162109/` e um PDF fora deste escopo; este baseline identifica o HEAD mais os arquivos locais medidos, não uma árvore limpa.
- **Ambiente:** Windows x64, Node.js v24.22.0, npm 11.19.1, better-sqlite3 13.0.3, SQLite 3.53.4, Vite 8.3.4. A prova de persistência usa `node:perf_hooks`; os tempos abaixo são observações locais, sem SLA.
- **Manifesto de arquivos:** `retirada-baseline-hashes.json`, SHA-256 `8871268c7a953bf6abf810cc89f12058b28817c9f3847527f021c05c4f47cd63`. Contém 138 caminhos, tamanhos e SHA-256, incluindo 53 migrations SQL, código/contratos/testes pertinentes, fontes normativas, assets do build e hashes das capturas existentes. Não contém conteúdo dos arquivos, banco, checkout, secrets ou credenciais.
- **Build local anterior às alterações desta sprint:** `npm.cmd run build` terminou com exit 0. Bundle JS `dist/web/assets/index-9lJmdHMI.js`, 1.162.994 bytes, SHA-256 `4557e2bea587faaaa8ae0159c2a02006fa3f1ae8ecdc08f4c2d3731b3d59700f`; CSS `dist/web/assets/index-CK1Sh9xa.css`, 103.595 bytes, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`. O aviso de bundle JS acima de 500 kB permanece. O build não reiniciou o controller nem alterou o banco operacional.

Os hashes identificam os arquivos locais no instante observado. O manifesto é um catálogo de integridade, não cópia de fonte. As fontes de cenário incluem `scripts/persistence-proof.mjs`, `tests/acceptance/persistence-maintenance.test.ts`, `tests/fixtures/persistence-measurement.ts`, fixtures de tentativa/publicação e os testes de storage; suas versões também constam do manifesto.

## Schema e reconhecimento de dados

`npm.cmd run proof:persistence` terminou com exit 0 em 2026-10-29; relatório local: `.cache/persistence-proof-JvTRkJ/report.json`. A fixture vazia abriu pelo `openStorage` normal, atingiu `user_version=53`, relatou 57 tabelas, integrity_check `ok` e zero violações de foreign key. Três verificações posteriores também registraram schema 53, integrity `ok`, zero FKs inválidas e nenhuma tabela retirada. O relatório conta 579 células text/blob inspecionadas na etapa base.

Esta é evidência de instalação temporária pelo mecanismo atual, que carrega/aplica a cadeia SQL existente. Não é demonstração da instalação direta exigida: `loadMigrations()` abre os 53 arquivos SQL para compor `Migration.sql` e calcular seus checksums; `applyMigrations()` os executa na instalação limpa. Nenhuma base operacional foi aberta, migrada, escrita ou usada como fixture. Não afirmo reconhecimento de uma base corrente real nem execução de migrations em outro banco.

O caminho real do código confirma por que o relatório não prova instalação direta: `openStorage()` chama `loadMigrations()` (`apps/controller/src/modules/storage/index.ts:259–260`); `loadMigrations()` lê os 53 arquivos SQL e calcula seus SHA-256 (`apps/controller/src/modules/storage/migrations.ts:119–135`). Para uma base existente, `openStorageWithMigrations()` abre primeiro uma conexão somente leitura e chama `inspectHistory()` antes de abrir a conexão gravável (`index.ts:271–301`). `inspectHistory()` valida `application_id=0x4e465331`, `user_version`, sequência, nomes e checksums das linhas `schema_migrations` contra essa lista carregada (`migrations.ts:9, 138–170`). Na instalação vazia, `applyMigrations()` executa cada `migration.sql`, grava nome/checksum/timestamp depois da execução e atualiza `user_version` (`migrations.ts:211–259`).

O teste `apps/controller/src/modules/storage/local-installation.test.ts` reabre uma fixture no schema corrente e compara antes/depois `application_id`, `user_version` e todas as linhas do ledger; também compara nomes/checksums com `loadMigrations()`. Isso demonstra preservação ao reabrir uma fixture criada pelo mecanismo atual, conforme o addendum abaixo. A prova ainda carrega SQL histórico para compor o catálogo e criar a fixture, portanto não demonstra instalação direta sem SQL executável. Nenhuma base operacional foi aberta. Não afirmo execução de migrations que não ocorreu. feat-003.AC1 segue bloqueado até a decisão de proveniência e uma demonstração executável do caminho direto.

### Decisão específica necessária — formato do histórico para instalação direta

**Recomendação para decisão:** manter `schema_migrations` como histórico de operações realmente aplicadas nas bases existentes; validar nomes e checksums dessas linhas contra um catálogo estático, não executável, incluído no bundle; e reconhecer instalações diretas por um registro explícito de baseline do schema final, validado por `application_id`, `user_version` e digest da estrutura. A instalação direta não cria linhas/timestamps que afirmem a execução das migrations 001–053. As bases existentes preservam seu ledger real e seus timestamps. Este caminho introduz uma representação distinta de baseline e exige alterar a regra de reconhecimento; não foi implementado nem tratado como aprovado.

**Impedimento submetido:** feat-003.AC2 permanece dependente da decisão do usuário/pipeline sobre aceitar esse formato ou indicar outro. Até essa decisão e a demonstração correspondente, feat-003 e as sprints dependentes não recebem conclusão.

## Persistência, payload e desempenho antes da retirada

Parâmetros do mecanismo existente: cache sintético de 0, 16 e 64 MiB em diretório temporário exclusivo; SQLite em arquivo real temporário; 20 amostras por superfície; nove projeções HTTP medidas; leitura por rotas de produção via inject; executor/Git/captura/revisão controlados. O relatório preserva min/max/p50/p95, hashes de payload e tamanhos por etapa. Cache, Git e conteúdo de projeto não foram copiados para SQLite nem incluídos no relatório. Esses resultados são baseline local controlado, não prova Maestri/OMP, publicação ou latência de produção.

| Cache gerado | DB | WAL | SHM | Git retido | Trabalho operacional | Auxiliar | Schema/inspeção |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 B | 4.096 B | 3.036.472 B | 32.768 B | 36 B | 164 B | 0 B | 57 tabelas; 579 células text/blob |
| 16.777.216 B | 4.096 B | 3.036.472 B | 32.768 B | 36 B | 16.777.380 B | 0 B | 57 tabelas; 579 células text/blob |
| 67.108.864 B | 4.096 B | 3.036.472 B | 32.768 B | 36 B | 67.109.028 B | 0 B | 57 tabelas; 579 células text/blob |

Payload foi constante entre os três tamanhos; latência em milissegundos. Cada célula registra mediana/p50 e p95. O hash completo por payload e máximos está no relatório JSON.

| Superfície | Payload | 0 MiB p50/p95 | 16 MiB p50/p95 | 64 MiB p50/p95 |
| --- | ---: | ---: | ---: | ---: |
| catalog | 653 B | 1,037 / 1,397 | 0,755 / 0,927 | 0,908 / 0,951 |
| listings | 386 B | 1,008 / 1,124 | 0,535 / 0,738 | 0,761 / 0,897 |
| history | 8.331 B | 1,574 / 1,996 | 1,236 / 1,574 | 1,397 / 1,653 |
| polling | 4.600 B | 6,786 / 7,874 | 6,430 / 7,065 | 5,029 / 7,292 |
| delivery | 5.335 B | 8,290 / 9,493 | 6,771 / 8,540 | 8,141 / 8,893 |
| producerResult | 763 B | 1,336 / 1,633 | 1,195 / 1,412 | 1,316 / 2,019 |
| rounds | 339 B | 0,711 / 0,921 | 0,506 / 0,744 | 0,732 / 0,752 |
| dashboard | 938 B | 2,004 / 2,342 | 1,528 / 2,206 | 1,988 / 2,164 |
| pagedPassagesNext | 5.249 B | 7,648 / 9,022 | 7,871 / 9,006 | 7,439 / 9,010 |

O mecanismo não emite `EXPLAIN QUERY PLAN`; não há plano de consulta registrado nem comparação correspondente nesta referência. Não inferir estabilidade de plano a partir da latência. Se uma retirada alterar consultas ou índices, a comparação do mesmo cenário permanece pendente até ser produzida pelo mecanismo aprovado.

## Referência visual anterior

Referência disponível: `.cache/ui-removal-gate-20261028/result-final.json` e 14 capturas PNG no mesmo diretório. O registro identifica Playwright MCP/Chrome, distribuição servida em `127.0.0.1:4310`, APIs controladas, JS `index-CgQwicAS.js` (1.162.345 bytes, SHA-256 `065a6bd7a60869897fee0e6b11368ecfbfdc19dc970837b1a0d3b25aa83452ae`) e CSS `index-CK1Sh9xa.css` (103.595 bytes, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`). Esse JS difere do bundle recompilado e identificado acima; as capturas permanecem associadas ao asset histórico correto.

Viewports registrados: 1440×1000, 1100×480 e 390×640; DPR 1; visualViewport.scale 1; zoom observado em 100%. As dez medições cobrem configuração, preparação, histórico de tentativas, detalhe de tentativa entregue, queue e habilitação da queue. Capturas preservadas incluem configuration desktop/low/narrow, preparation narrow, attempt history low/narrow, failed detail, producer evidence narrow, delivered detail, retry, queue board-position, queue fallback full/narrow e queue summary conflict low.

**Limite para feat-002.AC2:** o JSON não registra tamanho externo da janela do Chrome nem identifica o executor como Revisor. O registro em `SPEC_PROGRESS.md` descreve o roteiro de UI controlado anterior, sem atribuir captura independente ao Revisor. Assim, as imagens são referência visual histórica útil, mas não são promovidas a captura revisora nem satisfazem os metadados de janela/autoria pedidos. A auditoria visual desta sprint fica para o Revisor pelo mecanismo próprio; o Coder não repetiu a auditoria.

### Nova tentativa independente — 2026-10-29

O Revisor independente tentou abrir `http://127.0.0.1:4310/` via Playwright MCP em 2026-10-29 04:29:40 UTC e recebeu `net::ERR_CONNECTION_REFUSED`. Nenhum PNG foi produzido e nenhum viewport, dimensão externa da janela, DPR ou zoom foi medido. A captura não foi simulada nem atribuída às imagens de 28/10. O README orienta executar `npm.cmd start` dentro de um terminal Maestri autorizado; esse terminal não estava disponível nesta sessão. feat-002.AC2 permanece pendente até uma captura real do Revisor.

## Evidência V4 de 28/10 preservada

`docs/Docs20261027_205916/v4-final-acceptance-matrix.md` e `SPEC_PROGRESS.md` permanecem intactos. O complemento real de 28/10 registra seis passagens, três versões e duas correções/rejeições roteirizadas em Maestri/OMP real, com sessões separadas, checkout único e Git/SQLite/captura/parada nativos no recorte registrado. Referências: matriz V4, seção “Complemento de evidência real — 2026-10-28, 13:39”, e `SPEC_PROGRESS.md`, seção “Ciclo real autorizado no chat — 2026-10-28, 13:34–13:39”.

Limites preservados: autoridade e efeitos GitHub foram controlados; `checks=[]`; o ciclo não executou publicação externa; e não houve retry como outra tentativa. Não promover esse recorte a aceite completo ou prova da retirada. Nenhuma passagem adicional foi solicitada nesta sprint.

## Estado da referência

O baseline identifica fontes, revisão, ambientes, fixtures, parâmetros, bundle e limites observados antes de qualquer alteração desta sprint. A inspeção e o teste de reabertura confirmam preservação de `application_id` e ledger em fixture no caminho atual, que ainda carrega SQLs históricos; não existe demonstração de instalação direta. A nova tentativa visual do Revisor foi bloqueada pela indisponibilidade do servidor e não produziu captura. O plano de consulta também não foi produzido pelo mecanismo existente. Nenhuma aprovação de PRD, SPEC, plano, Design Lock, fase ou gate é inferida. As evidências anteriores continuam identificadas por escopo e sem reclassificação.

### Adendo: candidato local de schema direto — 2026-10-29

Após a captura deste baseline, o checkout recebeu um candidato que substitui o carregamento/aplicação das migrations por reconhecimento de schema. Este estado não altera o baseline histórico nem comprova gate, instalação real ou migração de banco operacional. Os seis arquivos locais pertinentes foram identificados apenas por tamanho e SHA-256:

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/controller/src/modules/storage/index.ts` | 44.276 | `1356e8ade0ec6be0f655d4badc307906ab56a81e118b8773c0dbb858797f09ec` |
| `apps/controller/src/modules/storage/migrations.ts` | 12.918 | `d2a32e4e31dd52045e518ac285e02e91ebbab8d1f644fe043571a396cefdf1c1` |
| `apps/controller/src/modules/storage/database-inspection.ts` | 4.881 | `b25d0f8bc7f46823b164488279fc6e6682356200029e0d6b89f59dce73699d66` |
| `apps/controller/src/modules/storage/local-installation.test.ts` | 6.667 | `da3cd861689a0a280dc437b0236922c6e8c7e23d61b8767fe688c7d33d7ad291` |
| `resources/storage/initial-schema.v54.sql` | 145.941 | `bc36c6f6d6f73d8389464b829dd58f9133c5d0be6c29d935b29bf080e440cca8` |
| `resources/storage/schema-recognition.v1.json` | 8.988 | `b8da897213ff0feded3148132be74120effccf77987e1a95c8ffc458d417cf59` |

O candidato reconhece ledger completo v53 e schema direto v54. Não conserva caminho de upgrade para schemas parciais e não inclui mais `migrateLegacyProfileComposition` nem `backfillAttemptSearchHeaders` no módulo. O typecheck atual falhou; portanto não há prova de execução válida deste caminho. O formato não tem aprovação D-001 registrada e as recusas parciais permanecem sem classificação V3. O manifesto histórico `retirada-baseline-hashes.json` permanece intacto.

## Addendum — fixture de busca do histórico

Na validação técnica posterior, `readAttemptPage()` selecionou `attempts.diagnostic`, coluna definida em `migrations/005_attempts.sql`. A fixture dedicada de `attempt-search.test.ts` não a declarava. Hashes dos bytes antes da correção local: fixture `5fe353105b808f094f62b2263b3809f5ff44ba0f71a4a4ce716353172f4bb35e`; query `queries.ts` `402c4a83da7264ca0ff7ea23e61020efcbf24581c670f2bf687d70dc2a08e03a`. O manifesto de 138 caminhos foi capturado antes desta correção e permanece intacto; este addendum registra os dois arquivos omitidos sem alterar aquele manifesto nem incluir conteúdo de código.

## Addendum — reconhecimento de base atual

`apps/controller/src/modules/storage/local-installation.test.ts`, SHA-256 `a79f74ae0780bbef0ec99cfd65004258aa95cd97342e3b557d56125d9f1e5dc8` (6.963 bytes), agora cobre a reabertura de uma fixture temporária no schema corrente. A prova compara antes/depois `application_id`, `user_version` e cada linha do ledger (`version`, `name`, `checksum`, `applied_at_ms`); também confere a identidade `0x4e465331` e a correspondência de nomes/checksums com o catálogo carregado. `npm.cmd exec -- vitest run apps/controller/src/modules/storage/local-installation.test.ts apps/controller/src/modules/storage/attempt-search.test.ts --reporter=dot --no-color` passou: dois arquivos, 16 testes.

Esta prova demonstra preservação do ledger ao reabrir uma base corrente criada em fixture, sem usar nem modificar banco operacional. Ela não demonstra instalação direta. `openStorage()` ainda carrega os 53 arquivos SQL históricos para calcular os checksums, e a fixture inicial é produzida pelo mecanismo atual; portanto o requisito de não carregar SQL histórico executável permanece sem solução autorizada e feat-003.AC1 continua bloqueado. A decisão D-001 segue necessária antes de outro formato/mecanismo.

## Addendum — reconciliação do manifesto e revalidação local — 2026-10-29

O manifesto histórico de 138 caminhos foi conferido por tamanho e SHA-256. 137 entradas permanecem idênticas. A única diferença é `SPEC_PROGRESS.md`: o manifesto preserva a captura original de 794.234 bytes e SHA-256 `116694660bee53f7a6b2e9d0f520a4263b6bc30d5b0a3c669822204944ef2012`; o arquivo de progresso atualizado após os adendos tem 810.328 bytes e SHA-256 `f06aaa21ff7d48ba05f3357077fabf61a5966a9e0814ab8f10616606d2d9a58a`. A divergência é documental e posterior à captura. O JSON original não foi reescrito, e não há outra divergência nos 137 arquivos medidos restantes.

Revalidação sem alteração de produção: typecheck e lint terminaram com exit 0; a suíte completa passou em 2.016 testes/169 arquivos; build terminou com exit 0, produzindo os mesmos assets identificados acima (JS 1.162.994 bytes, SHA-256 `4557e2bea587faaaa8ae0159c2a02006fa3f1ae8ecdc08f4c2d3731b3d59700f`; CSS 103.595 bytes, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`). O aviso de bundle JS acima de 500 kB permanece.

`npm.cmd run proof:persistence` terminou com exit 0 e status `local_persistence_and_process_recovery_passed`; relatório adicional `.cache/persistence-proof-4iFvdH/report.json`, observado em 2026-10-29T04:42:09.182Z. A fixture temporária observou schema 53, 57 tabelas, integrity `ok` e zero violações de FK nos reinícios. As medições controladas mantiveram database/WAL/SHM e payloads iguais nos caches de 0, 16 e 64 MiB. Isso revalida o mecanismo atual e a recuperação da fixture; ainda usa o bootstrap com SQL histórico, Git controlado e evidências/revisão controladas. Não demonstra instalação direta nem resolve D-001. `git diff --check` passou; os estados de feat-002.AC2 e feat-003.AC1 não mudaram.

## Addendum — retentativa do Evaluator — 2026-10-29

Após novo registro em `SPEC_PROGRESS.md`, o arquivo tem 811.738 bytes e SHA-256 `451b4f8ff2c9278b8b4d23624cf867e6b3f8444da025de5685f92430816d0a37`. O manifesto histórico continua inalterado e identifica a captura anterior de 794.234 bytes; essa diferença permanece limitada ao progresso documental posterior. A validação desta retentativa passou em typecheck, lint, 16 testes dirigidos e `git diff --check`.

A retentativa não gerou screenshot do Revisor nem alterou o bootstrap. `openStorage()` ainda carrega os SQLs históricos, e a proposta D-001 ainda depende do checkpoint de decisão do pipeline. Ver `retirada-aceite.md` para os estados e limites exatos dos dois critérios reprovados.

## Addendum — revalidação documental após retomada — 2026-10-29

O manifesto original `retirada-baseline-hashes.json` foi rechecado sem sobrescrita: 137/138 entradas mantêm tamanho e SHA-256; a única divergência é `SPEC_PROGRESS.md`, agora com 813.730 bytes e SHA-256 `daf20cb5a9dd8bf08a56584d157c68dc506a64890365ef20454a6c34aa0db68a`, devido aos adendos posteriores. O manifesto continua preservando a captura original de 794.234 bytes e SHA-256 `116694660bee53f7a6b2e9d0f520a4263b6bc30d5b0a3c669822204944ef2012`.

O build repetido nesta retomada gerou os mesmos assets do baseline: JS `index-9lJmdHMI.js`, 1.162.994 bytes, SHA-256 `4557e2bea587faaaa8ae0159c2a02006fa3f1ae8ecdc08f4c2d3731b3d59700f`; CSS `index-CK1Sh9xa.css`, 103.595 bytes, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`. Nenhum código de produção, contrato, migration ou asset mudou. O mecanismo existente não emite `EXPLAIN QUERY PLAN`; a ausência de referência anterior segue explícita. Não foi feita captura pelo Revisor e não foi demonstrada instalação direta.

## Addendum — correção do Evaluator e estado final observado — 2026-10-29

HEAD consultado: `6ee0391145832b34fc44c6af020013b211fb72bb`. O manifesto original continua preservado: 138 caminhos, sem conteúdo de arquivo, banco operacional, checkout ou credenciais. A comparação desta retomada encontrou quatro divergências; os valores do manifesto identificam o baseline anterior e permanecem sem sobrescrita.

| Arquivo | Bytes atuais | SHA-256 atual | Bytes no manifesto | SHA-256 no manifesto |
| --- | ---: | --- | ---: | --- |
| `AGENTS.md` | 8.021 | `449388717718dfd54ea00272ea36c7bebddfa7d6918cdb3aabf0a0b12fd1374a` | 6.733 | `111387458988f3ec1c22024b7bd533d9c714ae86b21e9d819351d00c5fc83b4a` |
| `SPEC_PROGRESS.md` | 819.252 | `be6eaa4c6406771eb6cd34f071a86fdeee1db6d75f90096cb504eedba80164f5` | 794.234 | `116694660bee53f7a6b2e9d0f520a4263b6bc30d5b0a3c669822204944ef2012` |
| `apps/controller/src/modules/storage/index.ts` | 44.871 | `a3713fe9a8828d05803bab651e4a319ade04a5797ab9577008ace7b8060ec638` | 44.531 | `963ca7d0772145844f511081a420d69bc22f761bf1d1cc4ea62c9002c50772ac` |
| `apps/controller/src/modules/storage/project-storage-locations.test.ts` | 12.292 | `56ee13a495c5fcf2485add3c9644e4f3ef1d414fecf6158a6351a65c62dde408` | 12.095 | `0729852c59b793ade77be90cf632d9a4e6cde7b9e62b879470bcad4fefba1894` |

Arquivos locais pertinentes não incluídos no manifesto original: `apps/controller/src/modules/storage/errors.ts` (877 bytes, SHA-256 `11d7e0233a93153c8fe33c71c2588b9c8ffcfb2ec5c9abdd2d86bf2411f6a1e8`), `local-installation.test.ts` (8.624 bytes, `f3b6c36831109bdaad550abb8bcc89b31f7ad81cc1c0ba8cae3cebe0840c91c9`), `initial-configuration.test.ts` (16.533 bytes, `c31e35c72749d8f4f9e6b0d3681b801ae95e0cbf0dd9a0e74c151e6ea6e8a795`), `operations.test.ts` (6.104 bytes, `8d1127add334e7ac4d2edc92ddf8ba1f1953fd292e2e912f1fe37c269a46f2b7`), `preparations.test.ts` (7.371 bytes, `87c19253b81df18ff383aa38ba30b6d920a7aa5eb8967e0a917f9a7cce30dc03`) e `attempt-search-migration.test.ts` (3.302 bytes, `ec3c94bad9ece4fb182d01183731517d275fcc66202a7ad985893a60880f0868`).

Validação do estado cujos hashes foram conferidos: typecheck e lint exit 0; suíte integral em oito workers, 2.017/2.017 testes em 169 arquivos (161,91 s); build exit 0, 410 módulos, JS 1.162.994 bytes, SHA-256 `4557e2bea587faaaa8ae0159c2a02006fa3f1ae8ecdc08f4c2d3731b3d59700f`, CSS 103.595 bytes, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`; `git diff --check` exit 0. O aviso do bundle acima de 500 kB permanece. Os hashes monitorados coincidiram antes e depois da suíte.

O health local respondeu HTTP 200 em `127.0.0.1:4310`. Nenhuma navegação visual ou captura foi feita pelo Coder; os metadados de janela/viewport/zoom e a autoria de Revisor seguem ausentes. A instalação direta ainda não foi demonstrada e `openStorage()` continua carregando os 53 SQLs; D-001 não foi aprovada.

### Correção do estado de retirada observado

O arquivo atual `migrations.ts` (hash igual ao manifesto: `48d1dd2f130850bcef35f17446f8c3c8cd62f001cc2e1b76a7bb70546fd8af68`) contém `migrateLegacyProfileComposition` e `backfillAttemptSearchHeaders`, com hooks de aplicação. Os testes atuais verificam composição idempotente e backfill apenas para capturas tipadas. O histórico Git local situa os helpers em commits V3: `76907bf` em 2026-10-23 e `ebdd67e` em 2026-10-25; por isso permanecem preservados e não são classificados como pré-V3.

### Resultado de validação do candidato v54 — 2026-10-29

Este registro posterior supersede a descrição de código “atual” em adendos anteriores; não altera o baseline nem o manifesto original. No snapshot verificado, `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` terminaram com exit 0. O build copiou os recursos estáticos para `dist/resources/storage/` e manteve os mesmos bundles JS/CSS listados no baseline.

`npm.cmd test -- --maxWorkers=8 --reporter=dot --no-color` terminou com exit 1: 1.894/2.015 testes passaram; 121 falharam em 46/169 arquivos. `npm.cmd run proof:persistence` também terminou com exit 1, fase `measurements`, sem relatório de sucesso. Esses resultados não demonstram instalação direta, preservação do histórico reconhecido nem cumprimento de ACs de compatibilidade.

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/controller/src/modules/storage/index.ts` | 44.276 | `1356e8ade0ec6be0f655d4badc307906ab56a81e118b8773c0dbb858797f09ec` |
| `apps/controller/src/modules/storage/migrations.ts` | 12.918 | `d2a32e4e31dd52045e518ac285e02e91ebbab8d1f644fe043571a396cefdf1c1` |
| `apps/controller/src/modules/storage/database-inspection.ts` | 4.881 | `b25d0f8bc7f46823b164488279fc6e6682356200029e0d6b89f59dce73699d66` |
| `apps/controller/src/modules/storage/local-installation.test.ts` | 6.667 | `da3cd861689a0a280dc437b0236922c6e8c7e23d61b8767fe688c7d33d7ad291` |
| `tests/fixtures/historical-schema.ts` | 3.978 | `e98e18a0018c02faadd89b7bbfc15602584645a71b268b3c88f13f006904947a` |
| `scripts/copy-resources.mjs` | 5.875 | `238cb14f7414e90fe1401b7d380b93bd5efb7d63151f587efcfcc1008912ce39` |
| `resources/storage/initial-schema.v54.sql` | 145.941 | `bc36c6f6d6f73d8389464b829dd58f9133c5d0be6c29d935b29bf080e440cca8` |
| `resources/storage/schema-recognition.v1.json` | 8.988 | `b8da897213ff0feded3148132be74120effccf77987e1a95c8ffc458d417cf59` |

O candidato segue sem aprovação D-001. Ele rejeita prefixos de migration anteriores ao ledger completo, e os helpers comprovadamente V3 não constam do módulo atual. `feat-001.AC2` e `feat-003.AC1` permanecem bloqueados. A captura de `feat-002.AC2` não foi produzida pelo Revisor; nenhuma aprovação do pipeline foi inferida.
