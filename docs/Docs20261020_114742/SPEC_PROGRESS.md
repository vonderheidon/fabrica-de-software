# Sprint — Fundação persistente e contratos de exclusão

## Aviso Ready e validação real — revalidação de 2026-10-20, 22:30 (Brasília)

**Entrega integral PENDENTE.** Conferidos AGENTS, SPEC/GLOSSARY/integração, contrato deste pacote e acompanhamento anterior. O aviso literal “Issues que continuam em Ready podem ser executadas novamente.” já estava em QueueEnableDialog; foi preservado, sem confirmação adicional. O guard de habilitação continua exigindo observação válida, ETag, autorização do resumo corrente e ausência de envio/incerteza. A criação em configuration-writes continua persistindo automation_enabled=false. As provas anteriores de cadastro/reload são históricas; não foram repetidas nesta rodada nem tratadas como recadastro após exclusão.

### Correção descoberta no navegador

Playwright MCP acessou o controlador existente em 4310. Ao navegar da Principal para uma rota com diálogo inválido, o navegador apresentou tela vazia e “Rendered fewer hooks than expected”. PrincipalScreen retornava o erro de rota antes do efeito de atualização após exclusão. O retorno foi movido para depois desse efeito, mantendo todos os hooks incondicionais. A documentação oficial React foi consultada via Context7 (resolve seguido de query). Aplicada a skill diagnosing-bugs. CodeGraph foi recusado pela revisão automática por exigir aprovação indisponível; detalhes confirmados no arquivo atual. As skills de design nomeadas não foram encontradas nos diretórios consultados e load_skill não está disponível; não houve redesenho.

Entregue `apps/web/src/app/principal-route-lifecycle.test.ts`: monta a Principal real e transita entre rota válida, inválida e válida sem desmontar o componente; dependências de dados/coleção são controladas. O teste passou após a correção. Isso comprova o lifecycle controlado, não o browser corrigido.

### Bloqueio atual de atualização e evidência

Após o build, o HTML servido apontou para `/assets/index-30azsGAW.js`, mas a requisição real do navegador recebeu 401 e não montou a aplicação. `http/assets.ts` enumera rotas estáticas existentes no startup (`wildcard:false`); o controlador em execução havia registrado o nome anterior. O processo existente não foi reiniciado nesta rodada. Para provar a versão corrigida é necessário reiniciar o controlador pelo procedimento operacional e recarregar a página. Não foi ampliado o acesso público aos assets por wildcard nem alterada a proteção da API.

[Screenshot atual sanitizado](browser-20261020/current-bundle-blocked.png), 1249×861, inspecionado visualmente: tela vazia após recarregamento. O screenshot registra somente o impedimento; não é evidência de diálogo, sucesso ou aceite. Nenhum cadastro foi criado/alterado e nenhum pedido de habilitação ou exclusão foi enviado nesta rodada.

### Checks executados

| Check | Resultado desta rodada |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0, inclusive após o novo teste |
| `npm.cmd run lint` | Exit 0 após a correção |
| `npm.cmd run build` | Exit 0 após a correção; JS 972,11 kB, aviso de chunk acima de 500 kB observado na primeira compilação |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 1.467 testes/109 arquivos, 84,82 s; execução iniciada antes da correção de hooks |
| Testes focados Principal/lifecycle/diálogo/polling | Exit 0 após a correção; 16 testes/4 arquivos |
| `npm.cmd run test:http` | Exit 0; 4 testes/2 arquivos, 5,34 s; antes da correção exclusivamente web |
| `git diff --check` | Exit 0 após a alteração de código |

### Cobertura consolidada preservada

| Critérios | Situação |
| --- | --- |
| US-01–02 / RF-01–08 | Provas anteriores de perdas, bloqueio, foco e teclado preservadas; confirmação real e caminhos completos continuam pendentes. |
| US-03–05 / RF-09–26 | Cobertura controlada de barreiras/pertencimento preservada; garantia nativa segura continua indisponível. |
| US-06 / RF-27–33 | Integração temporária anterior preservada; sucesso e vazio no browser pendentes. |
| US-07 / RF-34–41 | Testes controlados de polling/lifecycle/seleção preservados. Pendência, retry, resposta tardia, fechamento após aceite e rascunhos alheios sem prova real integral. |
| US-08 / RF-42–44 | Aviso e default false preservados; cadastro/reload têm evidência anterior. Recadastro após exclusão e habilitação real não comprovados. |
| RNF-01–04/06/09/10 | Suíte local acima, sem promoção a integração operacional. |
| RNF-05 / AC-29 | Consolidada a sprint-013 e sua reexecução anterior: caches 0/16/64 MiB; payloads 2.923/364/2.361 bytes, DB/WAL/SHM 917.504/4.185.952/32.768 bytes e artefatos 85 bytes constantes. 20 amostras/superfície/volume, sem SLA. Esses números são da prova anterior registrada neste acompanhamento, não nova medição desta rodada. |
| RNF-07 / AC-27 / INT-11 | Jornada completa, zoom nativo, árvore de acessibilidade da versão corrigida e silêncio de anúncios durante polling continuam pendentes. O navegador está disponível; o carregamento da versão corrigida está bloqueado pelo controlador sem restart. |
| RNF-08 | Código atual ainda declara safeReferenceRemoval=false. As três falhas anteriores de criação de junction por EPERM permanecem; não reexecutadas nem dispensadas. |
| E1–E3 | Provas controladas anteriores preservadas; sem nova prova visual de mudança de origem, disputa de vínculos ou substituição. |
| E4–E6 | Provas controladas anteriores preservadas; recuperação, rascunhos alheios e retomada entre alvos sem prova operacional integral. |

**feat-027-c1/c2/c5, a entrega afetada e a conclusão integral permanecem PENDENTES.** Requerem qualificação segura das fixtures nativas e jornada completa exclusivamente em temporários, além do restart para servir a versão atual. Nenhum efeito destrutivo, instalação, mudança de credenciais, sessão/provider Maestri/OMP, publicação ou escrita Git foi executado. Integração Maestri/OMP continua gate separado com autorização própria. O SPEC_PROGRESS canônico da raiz não foi editado nesta rodada; alterações preexistentes foram preservadas.

## Sprint-005 — Remoção de filesystem com identidade protegida [BLOQUEADA; NÃO CONCLUÍDA]

### Revalidação executada em 2026-10-20

Esta rodada autoriza expressamente os comandos locais de leitura e validação; a restrição histórica de terminal somente Git não foi aplicada. Conferidos AGENTS.md, contrato deste pacote, interfaces de workspaces, inspeção/reconciliação e testes atuais. A documentação Node 24 consultada via Context7 confirma que rm/rmdir recebem pathname; não foi identificada na composição existente uma primitiva de remoção por referência com proteção dos ancestrais. Não foi acrescentado fallback destrutivo, coordenador, dependência ou capacidade simulada de produção.

Alteração delimitada em `apps/controller/src/modules/workspaces/deletion.test.ts`: as fixtures nativas passam a ser criadas exclusivamente por mkdtemp sob `.cache` do workspace autorizado. O temporário externo do sandbox recusava rename com EPERM. Na nova localização, a prova real de reaparecimento, preservação da identidade substituta, retirada externa por rename e reconciliação posterior passou. A autorização original permanece a referência; nenhum objeto substituto foi adotado. A limpeza dos testes usa somente os diretórios vazios e o link exclusivos da fixture, sem remoção recursiva.

Resultados efetivamente executados:

- `npm.cmd run typecheck`: exit 0, inclusive após a alteração da fixture.
- `npm.cmd run lint`: exit 0.
- `npm.cmd run build`: exit 0; aviso existente de bundle web acima de 500 kB.
- `npm.cmd test -- apps/controller/src/modules/workspaces/deletion.test.ts --reporter=dot --no-color`: **exit 1, 31 aprovados e 1 falhou**. A criação da junction da fixture foi recusada com EPERM também dentro de `.cache`. O teste obrigatório não foi ignorado, substituído por mock ou contado como sucesso. A primeira execução no temporário externo teve 30 aprovados e duas falhas EPERM (rename e junction).

Não houve execução da suíte completa nem remoção operacional. A falha de permissão é um bloqueio concreto desta prova nativa; não foram alteradas ACLs, credenciais ou privilégios para contorná-la. A suíte focada continua vermelha e a sprint continua **não concluída**. Ausência observada duas vezes não equivale a garantia de ausência estável durante finalização SQL. Permanecem pendentes a remoção protegida, as corridas adjacentes aos efeitos, remoção de links sem atingir destinos, arquivos bloqueados/acesso negado nativos e eliminação integral dos conteúdos exigidos. Documentar esse impedimento não libera o percurso destrutivo nem satisfaz os critérios de aceite. Nenhuma interface nova foi entregue nesta rodada.

Conferência em 2026-10-20 no repositório canônico. Foram inspecionados o acompanhamento deste pacote, `workspaces/deletion.ts`, `workspaces/deletion.test.ts`, os exports de `workspaces/index.ts` e os scripts configurados. Alterações preexistentes foram preservadas. Nenhum efeito de filesystem foi executado nesta rodada.

Impedimento concreto: a composição atual usa `nativeDeletionInspectionPlatform`, cuja capacidade `safeReferenceRemoval` é explicitamente falsa. O módulo não possui primitiva destrutiva por referência de objeto com proteção dos ancestrais. Repetir `lstat`/`realpath` antes de uma exclusão por pathname não satisfaz a garantia exigida. Não foi acrescentada remoção recursiva por string, fallback, capacidade fictícia, dependência ou infraestrutura para contornar esse limite.

A reconciliação existente sempre observa novamente os alvos, inclusive os anteriormente marcados como removidos, compara a autorização original e orienta retirar externamente a pasta substituta sem adotar sua identidade. Os testes existentes contêm casos controlados e fixtures nativas de ausência, reaparecimento e ancestral redirecionado. Sua presença não comprova execução, ausência estável sob corrida ou remoção segura. Não foram entregues novos arquivos, interfaces, coordenador ou autorização de efeito nesta rodada.

Critérios ainda pendentes: remoção por referência protegida; corridas adversariais adjacentes aos efeitos; remoção de symlinks/junctions sem atingir destinos; remoção integral de `.git`, ignorados, conteúdo pessoal/não publicado e acréscimos posteriores; bloqueios nativos de acesso/arquivo aberto; e reconciliação comprovada junto ao percurso destrutivo. A documentação deste impedimento não conclui a capacidade nem libera exclusão ou finalização SQL.

Typecheck, lint, testes e build não executados nesta rodada. Foi solicitada exceção à proibição explícita de comandos não Git para leitura UTF-8 e scripts locais de validação. Sem resposta, não foi usado executor alternativo. Consultas Git foram somente de leitura e não atestam keyring. Próximo passo técnico: executar os checks após a exceção e identificar uma primitiva já disponível na composição confiável que satisfaça o contrato, com provas adversariais reais exclusivamente em fixtures temporárias. Enquanto não houver essa primitiva e essas provas, manter a capacidade destrutiva indisponível e esta sprint pendente.

## Sprint-003 — Conferência de alvos e segurança de caminhos

Data: 2026-10-20. **Implementação no workspace; validação executável pendente.** Este registro é exclusivo deste pacote. Não altera o acompanhamento canônico nem representa aprovação ou exclusão operacional.

Fontes: AGENTS.md, SPEC canônica, GLOSSARY, INTEGRACAO-MAESTRI-OMP (preservação e INT-16), PRD/stories deste pacote e SPEC20261020_114742 §§2.1/3.2, protocolo de caminhos e US-04/05/06. Consumidos os contratos e o fecho relacional das duas sprints anteriores. Context7 resolvido e consultado para Node 24: lstat com bigint, realpath e identidade não única por pathname. Repo-graph/graph-search não estão expostos; GitNexus não foi usado.

Entrega desta rodada:

- `storage/project-deletion-paths.ts`: snapshot SQL somente de leitura, exportado por `Storage.getProjectDeletionPaths(projectId)`. Usa `readProject` para o escopo e `projectDeletionInventory` para pertencimento. A origem vem exclusivamente da revisão corrente; revisões históricas não viram alvos. Seleciona folhas conhecidas de work/Git/artifacts por tentativa e execution-bootstrap por passagem. Não enumera arquivos internos. Recursos sem ownership, referências de implementação inesperadas, evidências fora do padrão conhecido ou schema diferente de 26 produzem bloqueios. Ledger, chaves relacionais, recursos, origens/proteções e configuração pertinente formam a versão do inventário.
- Proteções incluem origens correntes de outros cadastros em todas as contas, destinos de criações, recursos/folhas de outras tentativas, banco, lock, instalação e contêineres compartilhados. Destinos históricos de criação não são removidos por referência histórica. As folhas gerenciadas permanecem distintas dos contêineres; uma origem dentro da instalação permanece bloqueada.
- `workspaces/deletion.ts`: `createDeletionInspector`, tipos `DeletionInspectionInput`, `DeletionInspection`, `DeletionPathClaim`, `DeletionPathObservation` e `DeletionInspectionPlatform`; exports públicos em `workspaces/index.ts`. `inspectProjectDeletion` compara caminhos lexicais/efetivos, caixa segundo a capacidade fornecida, aliases por identidade, raízes, ancestrais e sobreposições; repete observações para detectar substituição durante a conferência. Inspeção anterior pode ser fornecida para detectar mudança de conjunto/política/identidade/resolução/ancestrais. Digest inclui cadastro/revisão/inventário/política/capacidade e fatos de raiz, sem tamanho, timestamps de modificação ou hashes de conteúdo interno.
- `projectDeletionCapability` explicita a capacidade atual. A implementação Node faz somente observação com lstat/realpath; **safeReferenceRemoval=false**. Alvos de filesystem ficam bloqueados com motivo e próxima ação. Não existe remoção por string, primitiva destrutiva, autorização, rota, worker ou alegação de eliminação de TOCTOU nesta entrega. Uma composição segura futura precisa fornecer e validar a primitiva de referência/ancestrais antes de liberar efeitos; o port controlado dos testes não comprova essa capacidade no Windows.
- `workspaces/deletion.test.ts`: provas escritas para determinismo, espaços/Unicode, caixa, raízes, caminhos lexicais proibidos, instalação, contêineres, aliases, resolução de symlink/junction, acesso negado/bloqueio/resolução incerta, ausência explícita, substituição de alvo/ancestral/resolução, corrida durante leitura e falta da primitiva. O port não permite enumeração interna.
- `storage/project-deletion-paths.test.ts`: prova escrita para A→B→URL, preservação das três revisões, versão determinística e ausência de escrita durante o snapshot. Estes testes **ainda não foram executados**.

Validação desta rodada: `git diff --check` terminou com exit 0. **Typecheck, lint, testes e build não foram executados.** A solicitação simultaneamente exige os checks e proíbe comandos que não comecem com git. Foi solicitada exceção explícita para leitura e validação local; a resposta permanece pendente. Leituras UTF-8 pelo filesystem do REPL e edições por apply_patch; nenhum compilador/test runner foi usado por executor alternativo para contornar a regra. A implementação permanece sem confirmação de compilação e de aceite até a execução dos scripts configurados e correção de eventuais falhas.

Nenhuma migration adicional, dependência instalada, backup, descoberta de pastas movidas, arquivo operacional removido, Git/GH de escrita, provider, Maestri/OMP, publicação, mudança de credenciais/ACL ou instalação operacional como alvo. As alterações preexistentes das sprints anteriores foram preservadas. A primitiva segura Windows e corridas adversariais reais não foram exercitadas; o comportamento de produção é bloqueio explícito.


Data: 2026-10-20. **Implementada no workspace; validação técnica pendente.** Este registro pertence exclusivamente ao pacote `Docs20261020_114742`; o acompanhamento canônico não foi alterado. Não representa aprovação ou mudança de fase.

## Fontes e escopo

Consultados `AGENTS.md`, as partes pertinentes de `SPEC.md`, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, `PRD20261020_114742.md`, `stories-requisitos20261020_114742.md` e a SPEC da feature, especialmente §§2.1/2.3/3.2. Critérios desta sprint: três tabelas aditivas, preservação do schema/ledger existente, identidades protegidas, recibo mínimo e contratos wire fechados. Não foram implementados autorização, worker, finalização, barreiras de trabalho, rotas ou remoção de recursos.

Context7: resolução de TypeBox e better-sqlite3 seguida de consulta sobre objetos fechados/uniões e funções SQL por conexão/transações síncronas. As APIs e dependências fixadas foram preservadas. Repo-graph/graph-search não estão disponíveis nesta sessão; não foi usado GitNexus. A consulta opcional à memória externa foi rejeitada pela revisão automática por estar fora do escopo; seu conteúdo não foi usado.

## Entrega e exports

- `apps/controller/src/modules/storage/migrations/025_project_deletions.sql`: cria `project_deletions`, `project_deletion_targets` e `project_deletion_receipts`, todas STRICT. Inclui nulabilidade, defaults, enums, CHECKs, PK/UNIQUE/FKs RESTRICT e o índice de recuperação, sem índices redundantes. Não altera tabelas, triggers ou migrations históricas. Identidade da autorização e metadados autorizados dos alvos são imutáveis; progresso permanece atualizável. Recibo tem exatamente `operation_id`, `request_fingerprint` e `result`; UPDATE/DELETE são recusados.
- `apps/controller/src/modules/storage/migrations.ts`: registra 025 como último delta; schema corrente passa de 24 para 25, sem mudança no protocolo do runner.
- `apps/controller/src/modules/storage/index.ts`: registra a função SQL privada `factory_project_deletion_finalization_allowed(operation_id)`, sempre negada nesta fundação. Não há setter, contexto privilegiado ativo, novo método público de storage ou comando para inserir autorização/recibo. Conexão externa sem a função também não consegue inserir recibo. A futura sprint de finalização deverá implementar e provar a capacidade transacional exata prevista na SPEC; não pode simplesmente liberar essa função.
- `packages/contracts/src/project-deletions.ts`, reexportado por `packages/contracts/src/index.ts`: schemas e tipos `DeletionTarget`, `DeletionBlocker`, `DeletionPreview`, `DeletionPending`, `DeletionCompleted`, `DeletionStatus`, `DeletionSummary`, `DeletionConfirmation` e `DeletionResume`. Snake_case, objetos fechados, UUID compartilhado, digest hexadecimal de 64 caracteres, limites de nome/caminho/mensagem/chave e revisão inteira segura. Arrays de alvos não são truncados por limite inventado.
- Composições opt-in no mesmo arquivo: `ProjectSummaryWithDeletion`, `ProjectPageWithDeletion`, `ProjectDetailWithDeletion`, `ConfigurationViewWithDeletion` e `OperationViewWithDeletion`. Preservam os campos anteriores e preparam o consumidor seguinte. Os schemas usados pelas rotas existentes continuam inalterados; nenhuma rota passa a emitir a extensão nesta sprint.

## Testes acrescentados e adaptações

- `apps/controller/src/modules/storage/project-deletions.test.ts`: provas escritas para banco novo, upgrade SQLite real 24→25, objetos históricos/ledger/settings/conta/projeto/revisão/operação/eventos preservados, tabelas novas vazias, índices sem duplicação, FKs, reopen, rollback integral de DDL, constraints, progresso, identidades imutáveis e recibo bloqueado/imutável. A capacidade positiva de recibo é simulada somente numa conexão separada de teste; nenhum setter foi criado em produção.
- `packages/contracts/src/project-deletions.test.ts`: formatos válidos, campos extras, UUID/digest/estados/revisões/tamanhos inválidos, `confirmed=false`, corpos vazios e proibição de dados do projeto no resultado `succeeded`; composições compatíveis com a operação comum existente.
- `tests/fixtures/project-deletion-schema.ts`: retira somente o delta novo em bancos descartáveis para reconstruir fixtures históricas. Chamado por `tests/fixtures/profile-effort-schema.ts` e `tests/fixtures/inference-limits-schema.ts`; não faz parte de produção.
- Expectativas do schema corrente atualizadas em `storage/{initial-configuration,local-installation,operations,preparations,storage}.test.ts` e `tests/integration/{attempt-transactions,deliveries,inference-limits,local-publication,operation-diagnostics,pr-publication,projects,publication,questions,queue-scheduler,recovery,remote-scaffold,reviews,scaffold,verification}.test.ts`. Fora disso, as expectativas históricas não foram promovidas para versões novas nem seus contratos alterados.

## Evidências e bloqueio de validação

`git status --short` inicial mostrou somente o diretório desta proposta como não rastreado. Consultas Git foram somente de leitura. `git diff --check` passou para o diff rastreado durante a implementação; a revisão final estática e de whitespace não equivale a compilação ou execução dos testes.

**Typecheck, lint, testes e build não foram executados.** A solicitação exige esses checks e simultaneamente proíbe qualquer comando que não comece com `git`. Foi solicitada exceção explícita para os scripts locais npm/Node; a resposta permanece pendente nesta rodada. Não foi utilizado outro executor para contornar a restrição. Os testes escritos não são evidência de aprovação e esta sprint não está declarada validada ou concluída.

Após liberar os checks, executar `npm.cmd run typecheck`, `npm.cmd run lint`, os testes focados novos, `npm.cmd test -- --reporter=dot --no-color` e `npm.cmd run build`; corrigir eventuais falhas e registrar seus resultados reais. Conferir a distribuição da migration 025 após build. A integração das extensões às rotas/consumidores pertence à sprint correspondente.

Nenhuma dependência instalada, setup de scaffold, operação Git de escrita, GitHub, provider, recrutamento, publicação, remoção real, migração da instalação operacional ou mudança de credenciais/ACL. Somente código e testes foram preparados no repositório canônico. Não houve browser ou revisão independente de referência Git imutável.


# Sprint-002 — Pertencimento integral e exceção SQL restrita

Revisão de continuidade em 2026-10-20: a implementação e as fixtures desta sprint já estavam presentes no workspace ao iniciar esta rodada e foram preservadas. Foram relidos o inventário, a capacidade transacional, a migration 026 e os testes de histórico/finalização. `git status --short` foi consultado somente para identificar alterações preexistentes; `git diff --check` terminou com exit 0. Essa conferência não executa SQL nem comprova os critérios de aceite. Foi solicitada exceção explícita à regra de terminal somente Git para typecheck, lint, testes e build; sem resposta nesta rodada, esses checks continuam pendentes e nenhum executor alternativo foi usado para contornar a restrição. Não houve remoção de arquivos ou exclusão operacional.

Implementação em revisão no workspace em 2026-10-20; validação executável pendente de autorização dos scripts npm, devido à restrição explícita de terminal somente Git. Não representa aprovação de sprint, fase ou exclusão real.

Fontes: SPEC20261020_114742.md §§2.1–2.3 e sprint-002/feat-003/feat-004; PRD RF-26/29–33 e RNF-06; fronteiras de storage e transações da SPEC canônica e preservação de recursos de INT-16. Context7 consultado para transações síncronas/immediate/rollback do better-sqlite3; nenhuma dependência alterada.

Entrega acrescentada:

- `storage/project-deletion-inventory.ts`: seleção explícita de 40 tabelas exclusivas, chaves simples/compostas e resolução de domínios de operações/eventos; FKs em ambas as direções e conflitos de domínio produzem bloqueios com motivo/próxima ação. Cadastros são isolados pelo project_id, sem seleção por repositório, nome, URL, conta ou perfil. Metadados/conteúdo de checkout não são copiados.
- `storage/project-deletions.ts`: capacidade da conexão em memória, sem setter; geração/token/operação/cadastro e pendência finalizing são verificados pelas guardas. Chaves capturadas antes de DELETE; IMMEDIATE, foreign_keys=ON, defer_foreign_keys restrito à transação; remoção de folhas/pais/ciclos, resíduos/FKs, recibo mínimo e cleanup em finally. Exige operação project.delete, revisão autorizada e alvos com ausência registrada. Não realiza inspeção nem remoção de filesystem.
- `storage/migrations/026_project_deletion_finalization.sql`: adapta somente guardas DELETE exclusivas e acrescenta guardas onde ausentes. Preserva guardas UPDATE/identidade/estado e tabelas históricas. Migrations 001–025 não foram editadas. Registrada em migrations.ts; schema corrente 26.
- Exports de storage/index.ts: tipos `ProjectDeletionInventory`, `FinalizeProjectDeletion`; métodos `getProjectDeletionInventory(projectId)` e `finalizeProjectDeletion(command)`. Sem rota HTTP, flag persistente, worker ou autorização pública novos. Consumidores seguintes devem provar ausência de filesystem imediatamente antes da chamada; esta sprint é a prova relacional, não a liberação da exclusão real.
- `tests/fixtures/project-deletion-history.ts`: dois cadastros com o mesmo nome/URL/repositório/issue, três rodadas, resultados, revisão/achados/resoluções, perguntas, verificações/artefatos, recursos, publicações/efeitos, criação/reconciliação, diagnósticos e fila; contas/perfis/configuração/host compartilhados preservados.
- `storage/project-deletion-finalization.test.ts`: seleção integral, isolamento, referência de queue_cycles de outro cadastro, conflito de domínio, guardas fechadas, geração/token/cadastro incorretos, alvos não verificados, probes de contexto ativo, UPDATE imutável, ABORT/ROLLBACK, falha no recibo, limpeza do contexto e novo banco/upgrade com histórico. Usa a capacidade real, sem substituir função SQL por retorno 1.
- `storage/project-deletions.test.ts`: expectativa do schema 26, preservação de objetos que não sejam guardas DELETE adaptadas e remoção da simulação permissiva do recibo. Prova positiva/imutabilidade do recibo movida para finalização real da fixture.
- `tests/fixtures/project-deletion-schema.ts`: downgrade exclusivamente de fixtures descartáveis restaura as guardas históricas antes de remover deltas 026/025. Expectativas de versão corrente dos testes existentes passam a 26.

Validação até este ponto: `git diff --check` passou. Typecheck/lint/Vitest ainda não executados nesta rodada; nenhum critério é declarado comprovado por testes antes dessa execução. Nenhuma operação Git de escrita, instalação de dependências, provider, publicação externa ou exclusão de recursos do usuário.

## Sprint-004 — Aceite durável e barreiras concorrentes

Data: 2026-10-20. **Implementação preparada no workspace; validação técnica pendente.** Este registro é exclusivo deste pacote; o SPEC_PROGRESS.md canônico não foi editado nesta rodada. Alterações preexistentes foram preservadas. Não representa aprovação, mudança de fase ou autorização de exclusão operacional.

Fontes consultadas: AGENTS.md, SPEC canônica (início, versões, persistência e provas por superfície), GLOSSARY (interrupção e cancelamento), INTEGRACAO-MAESTRI-OMP (parada e INT-16), PRD/stories deste pacote (US-02/03/04/07, RF-09–16 e RNF-03/04/09/10) e SPEC20261020_114742 §§2.1/3.2. Consumidos o pertencimento e o inventário/inspeção das sprints anteriores. Repo-graph/graph-search não estão expostos nesta sessão; GitNexus não foi usado.

### Entregas e interfaces desta rodada

- Novo `storage/project-deletion-acceptance.ts`: tipos `ProjectDeletionCommand` e `AcceptProjectDeletion`; recuperação do fingerprint original antes de cadastro/CAS/filesystem, leitura de pendência/recibo e aceite IMMEDIATE. A transação repete recuperação, escopo, ETag vigente do cadastro, revisão, digest, claims, versão do inventário e atividade; grava operação, recibo de aceite, pendência, metadados dos alvos e evento juntos. Uma segunda chave aponta para a operação já pendente por erro PROJECT_DELETION_PENDING. Depois da finalização SQL, a recuperação usa o recibo mínimo antes de procurar o projeto removido. Nenhum efeito é agendado por este módulo.
- Novos métodos de `Storage`, exportados por `storage/index.ts`: `acceptProjectDeletion`, `recoverProjectDeletion` e `getProjectDeletion`; tipos públicos internos acima. `operations.ts` projeta project.delete somente com vínculo, evento e recibo correspondentes, distinguindo aceitação, execução e pendência.
- Novo `projects/project-deletions.ts`, exportado por `projects/index.ts`: `createProjectDeletions({storage,workspaces})`, com `preview` e `accept`. Recuperação precede a inspeção; a inspeção de filesystem é assíncrona e externa à transação. **Não há rota de confirmação, composição no controlador, worker ou primitiva destrutiva conectados.** A composição nativa anterior continua recusando alvos quando não dispõe de remoção segura por referência.
- Novo `storage/project-deletion-barrier.ts`: barreiras privadas compartilhadas de projeto/tentativa, sobreposição lexical/efetiva e atividade. Normaliza separadores/caixa de caminhos Windows, compara raízes por segmentos e considera a resolução dos ancestrais de alvos ausentes. Os candidatos de origem vêm tanto do pedido quanto da inspeção canônica já existente; diretórios globais vêm da validação canônica existente. Não há IO de filesystem no callback SQL.
- A prévia de caminhos agora inclui bloqueios de atividade; o aceite repete a consulta. Tentativa sem resultado, terminal sem parada confirmada, lançamento starting, captura/check em curso, parada de check incerta, publicação/efeito pendente ou unknown, remoção/abertura nativa incertas e criação/reconciliação incompletas impedem autorização. Não solicita cancelamento nem parada. Perda de acompanhamento ou result final, isoladamente, não comprovam encerramento.
- Persistência permanece no schema 26 e nas tabelas existentes; nenhuma migration ou dependência nova. Alvos guardam somente caminhos, identidades/ancestrais/política e pertencimento/progresso previstos. Não são copiados arquivos, checkout, índice, logs, caches ou evidências. Identidades de alvos são projetadas explicitamente ao serializar os metadados.

### Autorizadores efetivamente alterados no código

| Autorizador | Barreira no aceite/transação | Projeção/serviço |
| --- | --- | --- |
| Preparação criar/editar | `savePreparation`, após recuperar operação original | Serviço recusa nova escrita e a prévia inclui PROJECT_DELETION_PENDING |
| Início manual e automático | `createAttempt`, antes de CAS/consumo/intenção | `pipeline/start.ts` recusa antes das consultas externas; repete na transação após observações assíncronas |
| Scheduler/ciclos | `consumeQueueCycle`; observação tardia ignora cadastro pendente | Fila exclui oportunidades pendentes com motivo/ação; atualização de cadastros duplicados não cria referência no cadastro pendente |
| Publicação/revalidação/aumento | `acceptPublication` e `assertPublicationEligible` | Capacidades de concluir/reconciliar ficam indisponíveis |
| Intenção/claim/envio de efeitos de tentativa | `validateAttemptEffect`, compartilhado por intenção, claim e autorização final | Conserva registro de efeitos já enviados; não autoriza efeito seguinte |
| Configuração do cadastro | `saveConfiguration` e `insertRevision` | Recusa explícita no serviço; listagem/detalhe/configuração incluem pré-requisito e ETag de configuração distingue pendência |
| Cadastro/recadastro e mudança de origem | `registerProject`, `saveConfiguration` e `insertRevision` | Compara pedido lexical e origem canônica contra alvos pendentes; mesmo remoto em caminho independente continua possível |
| Diretório global de projetos | `writeGlobals`, inclusive save agregado | Mudança anterior altera inventário; mudança posterior sobreposta é rejeitada |
| Scaffold e cadastro final | `acceptCreation`, `recordCreationStep`, `registerProject` no cadastro final | Destino anterior integra proteções/inventário; destino posterior sobreposto é recusado |
| Abertura/remoção de recursos | `acceptRecovery` para comandos distintos de cancelamento | Operações nativas/remoções ainda aceitas ou incertas também impedem o aceite da exclusão |

As recuperações idênticas continuam anteriores à barreira: recuperar recibo não constitui nova autorização de trabalho. As transações e os métodos de storage existentes continuam privados/síncronos. A detecção de disponibilidade de tabelas nas barreiras atende construtores históricos de fixtures anteriores à 025; o storage operacional só é exposto após verificar/aplicar o ledger completo.

### Provas escritas e estado da validação

Novo `storage/project-deletion-acceptance.test.ts`: cenários preparados para rollback em cada componente do aceite; SQL busy em outra conexão; replay/resposta perdida e reopen; segunda chave; CAS/digest/inventário obsoletos; vínculos anteriores/posteriores; cadastro independente; configuração/preparação/ciclos bloqueados; recibo mínimo após finalização SQL controlada; início manual em voo com observação pausada; scheduler com candidato previamente elegível; ordem inversa com tentativa ativa; cancelamento sem parada comprovada; publicação e exclusão em ambas as ordens. A inspeção/capacidade do host é controlada; os testes não excluem qualquer pasta operacional. **Estes testes ainda não foram executados e não comprovam os critérios de aceite.**

- `git diff --check`: exit 0 para o diff rastreado.
- `git diff --no-index --check -- NUL <arquivo>` dos quatro arquivos novos de implementação/teste desta rodada: sem apontamentos de whitespace; exit 1 esperado pela diferença em relação a NUL.
- **Typecheck, lint, testes e build não executados.** A solicitação também proíbe qualquer comando de terminal que não comece com git. Foi solicitada uma exceção explícita para leitura/validação local; não houve resposta até este registro. Não se executou compilador/test runner por outro mecanismo para contornar essa regra. A compilação e os resultados das novas provas permanecem desconhecidos; esta sprint não está declarada validada/concluída.

Após a exceção, executar os scripts configurados `npm.cmd run typecheck`, `npm.cmd run lint`, testes focados de exclusão, `npm.cmd test -- --reporter=dot --no-color` e `npm.cmd run build`, corrigindo falhas antes do aceite técnico. Permanecem separados a integração do futuro coordenador, as provas nativas adversariais Windows e quaisquer aceites externos. Nenhum Git de escrita, GitHub, Maestri/OMP/provider, instalação, remoção operacional, publicação, mudança de credenciais/ACL ou fase foi executado nesta rodada.

## Sprint — Coordenador durável e recuperação de execução [IMPLEMENTADA; VALIDAÇÃO LOCAL]

Data: 2026-10-20. Fontes: AGENTS.md, SPEC.md, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, SPEC20261020_114742.md §3.2 (protocolo 3–9 e recuperação), PRD e stories do pacote. Critérios desta sprint: posse exclusiva com fencing, efeitos fora de SQL, falha global interrompível, reconciliação de removing, recuperação E4 e retomada da autorização original. Alterações anteriores preservadas; o SPEC_PROGRESS.md canônico não foi atualizado por esta sprint.

- Entregues `projects/deletion.ts` e export público `createDeletionCoordinator`: agendamento após aceite, retomada manual, recuperação única por startup, drain/close. Não há timer, polling executor, recrutamento, publicação ou sessão HTTP persistida. Retomada aguarda somente reconferência; execução continua sob posse do coordenador.
- Entregue `storage/project-deletion-worker.ts`, acessível por `Storage.deletionWorker`: claim atômico, token UUID e geração crescente, conferência da operação autorizada, snapshot, transição a running somente após reconciliação, progresso removing/removed e liberação para pending/reconfirmation_required/finalizing. Cada escrita verifica posse; timeout não transfere ownership. Recuperação da conexão ocorre uma única vez sob o lock exclusivo já adquirido no startup; outro coordenador na mesma conexão não reassume worker vivo.
- Snapshot reconstrói exclusivamente claims e identidades/ancestrais/política originalmente persistidos; compara conjunto completo atual e nunca amplia alvos nem aceita substituta. A leitura interna por token/geração permite recuperação independente da conta selecionada, sem abrir as consultas comuns de projetos entre contas. Não usa If-Match antigo para retomar.
- `workspaces.removeProjectDeletion` recebe callbacks tipados de progresso: antes de cada alvo o coordenador relê autorização/atividade/pertencimento e reconfere todos os caminhos; SQL fica fora do IO. Divergência observada durante a conferência também bloqueia. Falha interrompe novos efeitos; ausência final é novamente conferida. Efeito sem commit do progresso deixa removing reconciliável, sem restaurar arquivos.
- `main.ts` compõe recuperação depois do pré-voo e sob o lock da instalação, e fecha o coordenador antes do storage. accepted/running/pending/finalizing são tentados uma vez por startup; reconfirmation_required aguarda comando manual. Falha não se rearma por consulta. `can_retry` considera estado e ausência de token ativo.
- Conclusão física entrega estado finalizing para a próxima fatia de finalização SQL; não chama finalização pública, não declara succeeded e não libera a capacidade nativa Windows ainda não qualificada. Sem migration, dependência, remoção operacional, Git de escrita ou efeito externo.

### Provas e limites

`storage/project-deletion-worker.test.ts`: 13 testes com SQLite real e filesystem controlado, incluindo schedules/resumes concorrentes, worker vivo sem roubo, fencing, falha persistente sem retry periódico/polling, substituta preservada, startup nos quatro estados, reconferência manual, efeito com falha de progresso e recuperação sem segunda remoção, conjunto vazio URL-only, retorno de resume antes do efeito terminar e mudança de conta sem ampliar leituras.

A primeira suíte completa encontrou cinco expectativas anteriores da web incompatíveis com a linguagem atual do operador (exposição de IDs/recibos/diagnósticos técnicos e texto antigo). Foram ajustados somente esses testes, conservando verificações de mensagem humana, próxima ação e ausência de replay; nenhuma mudança de produto web. A repetição completa passou com 1.421 testes/103 arquivos antes dos últimos ajustes; os 13 testes focados finais passaram. Resultados finais adicionais serão registrados abaixo.

Prova nativa destrutiva e UI não foram executadas. A capacidade padrão continua bloqueada; as pendências anteriores de junction/qualificação nativa não são resolvidas por estes testes. A execução física usa adapter controlado; não equivale a exclusão real Windows ou aceite integrado do percurso.

### Validação final executada

| Check | Resultado nesta entrega |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict de produção/testes/cliente |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.422 testes em 103 arquivos**, 77,71 s; versão final com os 13 testes novos do coordenador |
| `npm.cmd run build` | Exit 0; controlador/recursos/cliente; aviso existente de bundle web acima de 500 kB (946,07 kB minificado) |
| `npm.cmd run test:compiled` após build final | Exit 0; HTTP/SSE/SQLite reais, lock, shutdown e restart/sessão; pré-voo controlado, Maestri/OMP não executados |
| `git diff --check` | Exit 0 |

O schema permanece 26. Nenhum comando Git de escrita, provider, GitHub, tracker, instalação, remoção operacional ou mudança de fase foi executado. Finalização pública e qualificação da primitiva nativa permanecem nas fatias próprias; esta validação não declara aceite destrutivo real.

## Sprint — Finalização integral e recuperação mínima [IMPLEMENTADA; VALIDAÇÃO LOCAL]

Data: 2026-10-20. Fontes: AGENTS.md, SPEC.md §§8/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e SPEC20261020_114742.md §§2.1/3.2, PRD e stories deste pacote. Escopo: ausência atual antes da conclusão, fecho relacional exclusivo, recibo mínimo atômico, fencing e recuperação pela chave original após remoção do cadastro. Histórico anterior preservado; o SPEC_PROGRESS.md canônico não foi alterado nesta rodada.

### Entregas e contratos efetivos

- `projects/deletion.ts`: o coordenador agora chama `Storage.finalizeProjectDeletion` imediatamente após a reconferência de todos os alvos e a exigência de observações `absent`. Não libera token/generation nem aguarda outro IO entre essa prova e a transação final. Recibo de etapa não basta para concluir. Recriação ou erro de observação conserva pendência; uma geração invalidada não conclui.
- `storage/project-deletions.ts`: integrada a transação existente de fecho completo e acrescentada reconferência síncrona de atividade dentro do commit. Preserva conferência de revisão, token/generation, autorização, metadados de ausência, pertencimento integral, chaves exclusivas, guards restritos, ausência de resíduos e `foreign_key_check`. Recibo mínimo e eliminação de contexto/recuperação confirmam juntos. Falha no DELETE, guard, integridade ou INSERT do recibo reverte o SQL; arquivos já removidos não são restaurados. O coordenador registra pendência sem repetir efeitos por consulta.
- `storage/operations.ts` e `storage/index.ts`: entregue `readCompletedProjectDeletion` e método público `Storage.getCompletedProjectDeletion(operationId)`, retornando apenas `DeletionCompleted` ou null mediante UUID exato. Não procura cadastro, conta antiga, repositório, issue, nome ou caminho. `getOperation`/`StoredOperation` das operações normais permanecem intactos.
- `http/app.ts`: GET `/api/v1/operations/:operationId` recupera a conclusão mínima antes da consulta normal, usando o schema compartilhado existente `OperationViewWithDeletion` (`OperationView | DeletionCompleted`). Exclusão concluída responde exclusivamente `{operation_id,state:'succeeded'}`, sem request_id, recurso ou recibo detalhado. Proteção de sessão/Host e erros comuns permanecem. A consulta específica interna `getProjectDeletion` e a confirmação `recoverProjectDeletion` já existentes recuperam o mesmo resultado; replay divergente é recusado antes de procurar cadastro ou aplicar CAS. Rotas públicas de confirmar/status/retomar continuam pertencendo à próxima fatia HTTP.
- Schema permanece 26; não houve migration, dependência nova, cópia de conteúdo, histórico paralelo ou ampliação da capacidade destrutiva nativa.

### Provas executadas e limites

- `project-deletion-worker.test.ts`: expectativas anteriores evoluídas de finalizing para succeeded; 17 testes finais com SQLite real e filesystem controlado. Cinco regressões adicionais cobrem recriação, impossibilidade de observar ausência, falha do recibo após efeito físico, retomada sem segunda remoção e geração obsoleta. A falha SQL preserva autorização/identidades e não grava recibo; replay usa a chave original e fingerprint divergente conflita. Logs do coordenador contêm somente códigos sanitizados.
- `project-deletion-acceptance.test.ts`: regressão adicional de commit com resposta perdida, reabertura do storage, nova aplicação/sessão técnica e GET protegido da operação. Verifica resposta mínima exata, recuperação sem nova inspeção, conflito do fingerprint, inexistência de cadastro/alvos/autorização/histórico exclusivo, recibo com exatamente três campos e FK check vazio. Operação/evento global de settings são preservados integralmente e sua resposta HTTP continua sendo OperationView. Logs não contêm projectId, digest da autorização ou caminho da fixture. A primeira expectativa dessa prova exigia indevidamente remover a operação global; foi corrigida para exigir sua preservação, sem alterar produção.
- `project-deletion-finalization.test.ts`: 12 provas anteriores passaram novamente, incluindo histórico completo em todas as tabelas exclusivas, ciclos, dados indiretos e deduplicação, preservação de compartilhados/outro cadastro, upgrade, rollback de DELETE/recibo e guards de geração/posse. Não são provas de filesystem nativo.

| Check | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, cliente e testes strict |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções |
| Suíte completa antes do último caso adicional de observação indisponível | Exit 0; 1.426 testes/103 arquivos, 77,67 s |
| Suíte completa final com o caso adicional | Exit 0; **1.427 testes/103 arquivos**, 79,81 s |
| Coordenador após o caso adicional | Exit 0; 17 testes |
| `npm.cmd run build` | Exit 0; controlador/recursos/web; aviso existente de chunk web de 946,07 kB acima de 500 kB |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, lock, shutdown e restart/sessão reais; preflight controlado, Maestri/OMP não executados |
| `git diff --check` | Exit 0 antes da atualização documental |

Não houve exclusão operacional, execução da prova destrutiva nativa, browser, GitHub/Maestri/OMP/provider, instalação, mudança de credenciais, Git de escrita ou mudança de fase. Persistem as falhas anteriores de criação de junction por EPERM: a capacidade nativa padrão não foi liberada. A finalização foi comprovada sob observações/remoção controladas; não se declara aceite destrutivo Windows integral nem resolução da feat-009. Os testes de reabertura HTTP desta sprint usam novas instâncias no mesmo processo; o smoke compilado comprova separadamente restart de processos do controlador, sem exclusão nativa.


## Sprint 008 — API integrada e proteções HTTP [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-20. Identidade conferida no plano do pacote: sprint-008, índice 7, API integrada e proteções HTTP. Repositório canônico e alterações anteriores preservados. Este registro complementa as sprints anteriores, sem modificar o SPEC_PROGRESS.md da raiz.

### Fontes, contrato e interfaces entregues

- Fontes: AGENTS.md; SPEC.md, arquitetura e validação; GLOSSARY.md; INTEGRACAO-MAESTRI-OMP.md; SPEC20261020_114742.md §3.2, PRD e stories do pacote. Cobertura das duas features desta sprint: quatro rotas normativas e extensões compatíveis. Provas definidas: Fastify inject/SQLite reais com inspeção e remoção controladas, schemas fechados, CAS/idempotência, concorrência, rate limit, compilação e smoke compilado. Context7: skill context7-mcp, resolução de Fastify e consulta de validação/serialização por código HTTP; mantidas dependências e versões.
- Novo apps/controller/src/http/routes/project-deletions.ts: installProjectDeletionRoutes, com GET /api/v1/projects/:projectId/deletion-preview, POST /api/v1/projects/:projectId/deletion, GET /api/v1/project-deletions/:operation_id e POST /api/v1/project-deletions/:operation_id/resume. projectId das rotas existentes permanece. Schemas explícitos de params, query, body e respostas; ErrorResponse comum, limites e installSecurity existentes, sem timeout ampliado, path arbitrário, SSE próprio ou integração externa.
- A prévia devolve ETag do projeto conferido e can_confirm/blockers. O serviço createProjectDeletions.preview retorna agora {view,etag}; relê a revisão depois do IO para não associar ETag novo a prévia antiga. Conferência indisponível recebe 503 sanitizado. Confirmar exige UUID, confirmed:true, digest e If-Match; recupera primeiro o recibo/operação original, inclusive após remoção do cadastro, antes de CAS ou inspeção. Resposta 202 indica somente aceite durável; replay concluído retorna 200 mínimo. Location aponta à consulta independente.
- Resume exige corpo {} e Idempotency-Key igual ao operation_id original. Usa o coordenador existente, sem nova operação/autorização; aguarda somente reconferência, sem aguardar remoção. Running devolve estado sem segundo worker. Reconferência insegura retorna 409 com motivo/recuperação PT-BR e preserva a autorização original. GET de status apenas lê persistência, sem inspeção, recuperação ou efeitos.
- http/app.ts conecta as rotas; main.ts injeta a mesma instância de workspaces/coordenador já usada na recuperação de startup e no shutdown. A composição isolada de createApp cria um coordenador próprio e o fecha, sem executar recuperação por consulta. GET operations conserva a união OperationViewWithDeletion já entregue na sprint anterior e as operações normais.
- Novo packages/contracts/src/deletion-summary.ts centraliza DeletionSummary sem dependência circular. ProjectSummary, ProjectDetail e ConfigurationView exigem deletion:DeletionSummary|null; ProjectPage, ProjectRegistered e ConfigurationSaved herdam a extensão. Os exports WithDeletion existentes permanecem compatíveis. configuration-reads.ts lê somente operation_id/state/reason/recovery, sem carregar alvos ou autorizações. Projeto concluído segue 404. O consumidor web usa ProjectPage compartilhado; sua fixture foi atualizada sem alterar UI.
- Barreiras transacionais existentes de configuração, preparação, início, publicação e vínculos sobrepostos foram preservadas. PROJECT_DELETION_PENDING mantém message/recovery PT-BR e capacidade negativa nos pré-requisitos. Nenhum SQL foi movido para HTTP/projects, nenhuma migration ou dependência foi criada e nenhuma capacidade destrutiva foi liberada.

### Provas e resultados

- Novo tests/integration/project-deletion-http.test.ts: seis testes com bootstrap/sessão reais em inject, SQLite real e filesystem controlado. Cobre prévia/ETag, aceite 202/Location, replay sem segundo agendamento, resumos sem alvos, consulta sem remoção, configuração bloqueada, conclusão mínima nas duas consultas, replay/retomada após excluir cadastro e 404 do projeto. Recusa Host, Origin, Fetch-Site, sessão, CSRF, mídia, chave, corpo/caminho adicional, digest e revisão inválidos, além de If-Match ausente. Confere no-store/nosniff e ErrorResponse sanitizado, rate limit 429/Retry-After, conferência indisponível 503, resume com chave/corpo incorretos, 409 inseguro e duas retomadas durante remoção pendente com uma só execução.
- Os testes antigos de acceptance foram atualizados somente para o envelope {view,etag} da prévia. A primeira rodada detectou fixture sem host configurado e tipos de GitHub incompletos; corrigida a composição de teste, sem relaxar segurança ou domínio. Os checks seguintes passaram.
- Typecheck, lint e build configurados: exit 0 na versão final. Build distribuiu controlador, recursos e cliente (JS 946,36 kB minificado; tamanho acima da referência de 500 kB já observada).
- Suíte completa inicial: exit 0, 1.431 testes/104 arquivos, 106,37 s. Depois de acrescentar duas provas e ajustar os erros de inspeção/reconferência, suíte focada HTTP/coordenador: exit 0, 23 testes/2 arquivos, 8,55 s. Resultado integral final registrado no complemento abaixo.
- npm.cmd run test:compiled: exit 0; HTTP/SSE/SQLite reais, sessão, CAS/idempotência, replay, limites de streams, shutdown/EOF, lock entre processos e restart com revogação de sessão. Preflight controlado; Maestri/OMP não executados. git diff --check: exit 0.

### Limites preservados

Nenhuma exclusão operacional, teste destrutivo nativo, acesso GitHub/Maestri/OMP/provider, publicação, browser, instalação de dependência ou Git de escrita foi executado. Finalização dos testes HTTP usa prova de ausência controlada e não comprova remoção nativa. A pendência anterior de junctions/EPERM e safeReferenceRemoval=false continua válida; esta sprint não libera a capacidade Windows nem conclui feat-009. A implementação HTTP e os checks locais não concedem aceite nativo, visual, revisão independente imutável, aprovação ou mudança de fase.


### Complemento — validação integral final da sprint 008

- npm.cmd test -- --reporter=dot --no-color: exit 0, **1.433 testes em 104 arquivos**, 75,65 s, após todos os ajustes de produção e as seis provas HTTP. Os relatórios locais AC-29 mantiveram payloads e persistência independentes dos caches de 0/16/64 MiB, sob Git/executor controlados.
- Typecheck, lint, build e test:compiled já passaram na mesma versão de produção; os limites de integração/nativo descritos acima permanecem. O diff final foi conferido somente em leitura. Nenhum commit ou push foi executado.

## Sprint 009 — Transporte frontend e operações incertas [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-20. Fontes: AGENTS.md, SPEC.md §§8.5/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e SPEC deste pacote §4.3; conferidos contratos e rotas da sprint-008. Preservadas as alterações preexistentes. Nenhuma dependência instalada ou operação Git de escrita.

- Novo `apps/web/src/api/project-deletion.ts`: adaptadores explícitos de prévia, status e alvos; validação TypeBox dos envelopes recebidos; `getProjectDeletionPreview`, `confirmProjectDeletion`, `getProjectDeletionStatus`, `resumeProjectDeletion`, `recoverUncertainOperation` e `resendProjectDeletion`. Wrapper existente em `apps/web/src/api/http.ts` fornece sessão/CSRF, same-origin, JSON e renovação técnica sem replay automático. Confirmação conserva corpo serializado, contexto iniciador congelado, ETag e UUID originais em memória; chave divergente e confirmação independente durante incerteza são recusadas. Cliques concorrentes compartilham a promessa em voo, inclusive na reapresentação e retomada.
- Novo `apps/web/src/features/projects/useProjectDeletion.ts`: `useProjectDeletionPreview` e `useProjectDeletionStatus`, com identidade por contexto/versionamento e UUID, ETag separado, abort/cleanup e descarte de respostas obsoletas. `observeDeletion` agenda somente leituras serializadas, com intervalo/backoff recebidos da configuração existente; para em sucesso ou unmount sem cancelar/executar exclusão. Alvos vêm apenas da prévia e acompanhamento, sem acrescentá-los às listagens. A sprint-010 pode importar hooks e comandos deste arquivo; não há diálogo novo nesta entrega.
- `apps/web/src/api/uncertain-operations.ts`: tipo `project.delete`, persistindo exclusivamente UUID/tipo/instante. Operação normal e recibo mínimo concluído são discriminados pelo contrato compartilhado, sem GET do cadastro. Pendente abre consulta específica; 404 e indisponibilidade conservam incerteza. Após 401, o wrapper renova sessão e a camada consulta a mesma chave, preservando o erro original quando a recuperação falha. Após reload não se reconstrói o pedido; somente consulta é possível. Reenvio explícito consulta primeiro o recibo e verifica instalação/conta antes de usar exatamente projeto/corpo/ETag/chave originais.
- Conclusão elimina pedido original, vínculo transitório e operação incerta resolvida. Marcadores técnicos mínimos em memória impedem regressão por status pendente tardio. `apps/web/src/app/drafts.ts` limpa e impede regravação dos rascunhos exclusivos do cadastro, preservando os demais. `useProjects.ts` remove o cadastro dos resultados atuais/tardios; `useConfiguration.ts` descarta leitura tardia e limpa a visão concluída. Notificação local de conclusão limpa prévia e acompanhamento montados. As fontes existentes `apps/web/src/features/projects/configuration-requests.ts` e `save-lifecycle.ts` foram conferidas e preservadas.
- Documentação React consultada via Context7 (resolução seguida de consulta de cleanup de efeitos e respostas obsoletas). Skills de design nomeadas e `load_skill` não estão disponíveis; esta sprint não implementa UI nem altera composição visual.

Validação: oito testes novos em `apps/web/src/api/project-deletion.test.ts`, incluindo contratos/contexto, ETag e headers, duplo clique/resposta perdida, 401/recibo mínimo, pendência/retomada, consulta antes de reapresentação idêntica, troca de conta, reload, limpeza isolada, respostas tardias e polling/backoff/cleanup. Uma fixture inicial de SettingsView precisava declarar valor de cursor ao usar Value.Create; corrigida apenas a fixture. Testes focados finais: 13 testes/3 arquivos aprovados (transporte novo, configuration-save e web-state); após o ajuste final de preservação de erro de recuperação, os oito testes novos passaram novamente. Suíte completa: **1.441 testes/105 arquivos aprovados**, 86,49 s, antes dos ajustes finais de notificação/limpeza e preservação de erro; essas superfícies foram revalidadas pelos testes focados. Typecheck, lint e build configurados passaram; build mantém o aviso histórico de bundle acima de 500 kB. `git diff --check` passou.

Limites: fetch é controlado nestas provas; não houve browser, exclusão operacional, prova destrutiva nativa, GitHub/Maestri/OMP/provider ou publicação. Esta entrega não libera safeReferenceRemoval nem resolve junctions/EPERM da sprint nativa. Os hooks estão entregues para composição pela sprint-010; não se declara aceite visual, revisão independente imutável, aprovação ou mudança de fase.

## Sprint 010 — Confirmação acessível na configuração [IMPLEMENTADA; VALIDADA LOCALMENTE; BROWSER PENDENTE]

Data: 2026-10-20. Fontes: AGENTS.md, SPEC.md §§8.5/9/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, PRD/stories deste pacote e SPEC20261020_114742.md §§4.1–4.6. Conferidos os contratos e hooks registrados na sprint-009. Provas definidas antes da edição: renderização controlada, handlers de confirmação/saída, contratos de transporte, limites de foco, typecheck, lint e build. Alterações anteriores preservadas; SPEC_PROGRESS.md da raiz não foi alterado por esta sprint.

- Novos `apps/web/src/features/projects/ProjectDeletionAction.tsx` e `ProjectDeletionDialog.tsx`. `ProjectConfigurationForm`, em `ProjectForm.tsx`, oferece a entrada exclusivamente na configuração do cadastro. O acionador consulta nome/revisão salvos pelo contrato ProjectDetail, descarta retorno após cleanup e fixa projectId/projectName/projectRevision/contextVersion ao abrir. A identidade do componente inclui cadastro/conta; mudança de revisão durante a conferência bloqueia a autorização antiga. Os rascunhos não são enviados, salvos ou descartados ao abrir/fechar.
- `ProjectDeletionTargetList` mostra todos os alvos com categorias distintas e caminhos integrais, escapados pelo React, com quebra de linha. `ProjectDeletionWarnings` conserva integralmente o texto obrigatório de §4.5, explica origem somente URL, preservação de origens anteriores e configuração salva quando há edição pendente. A observação não informa se houve troca de origem; por isso a orientação sobre origens anteriores é apresentada em todas as conferências.
- Diálogo local nativo `showModal`, em portal sobre a rota atual, reutiliza estilos do diálogo de exclusão existente, tokens e `wrapDialogTabFocus`. Tem título associado, aria-modal, foco inicial no título, contenção de Tab/Shift+Tab, saída segura e retorno ao acionador conectado ou ponto válido da navegação. CSS adicional permite leitura de caminhos/perdas e quebra das ações em telas estreitas. Não há nome digitado, checkbox ou segunda confirmação. As skills de design nomeadas e load_skill não estavam disponíveis; preservada a composição existente, sem dependência nova.
- O clique único usa ETag/digest e contexto originais; guarda síncrona impede envio duplicado. Loading, bloqueios, revisão obsoleta e envio impedem confirmação. Incerteza oferece Consultar andamento pela chave original, sem replay. Consulta aceita passa a polling pelos hooks existentes; status usa texto estável por estado, sem revisão/contador anunciados. Bloqueios apresentam motivo/próxima ação em alerta; IDs, hashes, recibos e diagnóstico bruto não são renderizados. Escape, saída e navegação não enviam cancelamento nem desfazer. Polling não tem efeito de foco associado.
- `api/project-deletion.ts`: rejeições HTTP definitivas liberam somente o pedido recusado, permitindo confirmar outra conferência atualizada; 401, timeout e falha de transporte preservam a incerteza e a identidade original. O mesmo classificador é usado pelo diálogo e pelo transporte.

Validação: typecheck, lint e build configurados passaram; build mantém aviso histórico de bundle acima de 500 kB. Suíte completa passou com **1.449 testes/106 arquivos**, 77,25 s. Após o ajuste final que compartilha a classificação de rejeições definitivas e amplia seus casos, os testes focados finais passaram com **23 testes/3 arquivos**, incluindo sete testes novos de apresentação/interação, transporte e limites de foco. Os testes cobrem texto integral, caminhos/categorias, escape, metadados ausentes, nome/título/modal/status/alerta, loading/blocked/stale/submitting/uncertain, handlers sem efeito ao sair, duplo clique/contexto fixo, recusa obsoleta e marcação de progresso idêntica entre polls de revisões distintas. As provas de foco por teclado reutilizam os testes de fronteira existentes. Não são testes de DOM/browser: foco renderizado, comportamento nativo, mobile e zoom continuam para a prova visual da sprint-014.

Nenhum browser, exclusão operacional, prova destrutiva nativa, GitHub/Maestri/OMP/provider, instalação, publicação ou Git de escrita foi executado. A capacidade nativa continua bloqueada conforme o registro anterior; esta UI não a libera. Não se declara aceite visual/nativo, revisão independente imutável, aprovação ou mudança de fase.


## Sprint 011 — Acompanhamento persistente e conclusão no frontend [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-20. Fontes: AGENTS.md, SPEC.md §§8–10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, SPEC20261020_114742.md §§3.2/4 e PRD/stories deste pacote. Escopo: pendência reabrível, retomada pela autorização original, restrições conhecidas e conclusão seletiva (RF-35/36/40/41 e critérios desta sprint). Histórico preservado; o SPEC_PROGRESS.md canônico não foi editado nesta execução.

- Entregue apps/web/src/features/projects/ProjectDeletionPendingNotice.tsx, com ProjectDeletionPendingNotice, rememberProjectDeletion, knownProjectDeletion e useProjectDeletionRestriction. Resumos de configuração, detalhe e catálogo reconstituem a pendência após recarga, vinculam operação/cadastro antes da consulta mínima e permitem abrir o mesmo acompanhamento sem renderizar a chave. Falha de observação não libera restrição conhecida; eventos/resync reconsultam somente dados. Nenhum caminho ou conteúdo é persistido no navegador por esse aviso.
- ProjectDeletionAction mantém o acompanhamento aberto após o aceite e oferece o aviso ao fechar. ProjectDeletionDialog recebe initialOperationId, dispensa prévia/confirmar no acompanhamento e permite retomada explícita apenas em pending/reconfirmation_required com canRetry do servidor. Mostra motivo/ação fornecidos, irreversibilidade e recuperação após reinício sem percentual/prazo. Não aceita identidade substituta nem oferece força. Consultas e polling não chamam resume; fechar/desmontar não cancela. Status e alertas permanecem estáveis em polling sem mudança relevante.
- ProjectForm bloqueia o save agregado do cadastro pendente sem descartar edição; PreparationDialog impede criação, autosave e início conhecidos como bloqueados; PublicationDialog consulta o cadastro e mantém publicação indisponível quando a consulta falha ou há pendência. Botões de preparação no catálogo/Principal respeitam a restrição. Barreiras do servidor permanecem inalteradas.
- Conclusão continua exclusiva de succeeded no transporte existente. Vínculo observado impede associar status estrangeiro; recibo mínimo limpa prévia/recuperação e invalida as projeções existentes. drafts.ts retira somente edições exclusivas e transfere alterações globais do formulário agregado para o rascunho global, preservando valores já existentes, perfis, outros cadastros e pedidos globais existentes. Escritas tardias do cadastro removido são recusadas. Memória de preparações exclusiva é limpa e resultados tardios não a repovoam.
- Novo deletion-selection.ts e testes: a conclusão usa a seleção atual da navegação, limpa seus vínculos somente se ainda apontar ao removido e preserva seleção alternativa. Foco retorna ao seletor/contexto válido; o frame de foco reconfere se outro projeto já foi selecionado. Fechamento do diálogo preserva foco pertinente que já esteja fora dele.
- Novos project-deletion-completion.test.ts e deletion-selection.test.ts; ampliado project-deletion-polling.test.ts com DOM happy-dom/React, timers e transporte controlado. Cobrem reabertura do resumo após remontagem, mesma chave sem exposição, falha de consulta, retry por capacidade/ação, ausência de envio em polling, fechamento/desmontagem e resposta tardia; regressões existentes conferem zero mutações dos nós de status/alerta em polling inalterado. Limpeza agregada e seleção alternada são verificadas separadamente.

Validação executada: npm.cmd run typecheck, npm.cmd run lint e npm.cmd run build: exit 0. Suíte completa na rodada anterior aos ajustes finais: 1.457 testes/108 arquivos, exit 0, 82,98 s. Suíte focada final: 27 testes/5 arquivos, exit 0. git diff --check: exit 0. Build mantém o aviso histórico de bundle acima de 500 kB (cerca de 972 kB minificado). Nenhuma dependência instalada. Documentação React consultada via Context7 (resolução seguida de consulta sobre cleanup, respostas obsoletas e identidade de estado). As skills de design nomeadas e load_skill não estavam disponíveis; composição e tokens existentes foram preservados.

Limites: happy-dom e transporte controlado não comprovam renderização Chrome, teclado nativo, mobile/zoom ou remoção física. Nenhum navegador, exclusão operacional, prova destrutiva nativa, GitHub/Maestri/OMP/provider, publicação ou Git de escrita foi executado. A capacidade destrutiva Windows continua não liberada conforme a pendência anterior de junctions/EPERM; esta sprint não altera essa fronteira. Aceite visual/nativo, revisão independente imutável, aprovação e mudança de fase não são declarados.

## Sprint 012 — Recadastro e prova integrada de isolamento [VALIDADA LOCALMENTE; ACEITE NATIVO PENDENTE]

Data: 2026-10-20. Fontes e matriz da validação inicial em [isolation-evidence.md](isolation-evidence.md). Reutilizadas as fixtures entregues nas sprints-001 a 011; alterações preexistentes preservadas. O acompanhamento da raiz não foi editado na validação inicial. Nenhuma migration, dependência nova ou operação Git de escrita.

- `apps/controller/src/modules/storage/project-deletion-finalization.test.ts`: dois casos novos, banco novo e upgrade com histórico integral. Excluem o selecionado com automação ligada e recadastram o mesmo repositório: UUID novo, automação false, perfis/Project sem herança, nenhuma chave operacional herdada. Comparam todas as linhas do cadastro vizinho, incluindo deduplicação/consumos, e dados globais antes/depois e após reopen. `tests/fixtures/project-deletion-history.ts` ganha parâmetro opcional de automação, falso por padrão; os novos testes usam true explicitamente.
- `tests/integration/project-deletion-http.test.ts`: cinco casos novos. Sessão/prévia/aceite/coordenador/sucesso/recadastro via POST/replay mínimo preservam o outro cadastro, sem início ou cancelamento de agente. Quatro casos reabrem SQLite em accepted/running/pending/finalizing, falham no recibo final, comprovam rollback e retomam a mesma autorização após retirar a falha. As fixtures conservam motivos/recuperação exigidos pelo schema; o cursor global pode avançar sem alterar configuração/ETag alheios.
- Matriz consolidada de RNF-01–04/06/08–10 e E1–E6 identifica os testes anteriores novamente executados: barreira contra manual/scheduler/publicação, dois aceites/resumes, substituição/ausência, falhas no aceite/progresso/finalização/recibo, replay e recuperação. RNF-05/AC-29 da exclusão permanece obrigatório na sprint-013; relatórios históricos não o dispensam.

| Comando desta rodada | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0, repetido após o último ajuste de fixture |
| `npm.cmd run lint` | Exit 0, repetido após o último ajuste de fixture |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.467 testes/109 arquivos**, 80,31 s na rodada final; rodada anterior também passou |
| Testes focados de finalização | Exit 0; 14 testes, incluindo novo/upgrade com automação true→false |
| Testes focados HTTP de exclusão | Exit 0; 11 testes |
| `npm.cmd run test:http` | Primeira chamada simultânea à suíte completa: exit 1, heartbeat ausente/corpo vazio no caso EOF; chamada isolada posterior: exit 0, **4 testes/2 arquivos**, 2,48 s |
| `npm.cmd run build` | Exit 0 na rodada final; controlador/recursos/cliente, bundle JS 971,94 kB minificado; aviso de tamanho acima de 500 kB observado na rodada anterior |
| `npm.cmd run test:deletion-native` | **Exit 1: 14 passaram, 3 falharam**, 24,85 s; EPERM na criação de junction raiz/descendente/ancestral |

A falha inicial HTTP permanece registrada. A skill diagnosing-bugs foi aplicada: o caso usa stream de 35 ms e margem de handler de 10 ms; sensibilidade de agendamento sob concorrência é hipótese, não causa comprovada. A execução isolada manteve heartbeat/EOF normal/ausência de erros e passou, sem alterar servidor ou suprimir asserções. As falhas iniciais dos testes novos eram fixtures (campo view omitido, motivo obrigatório de pending e comparação indevida do cursor global); foram corrigidas e as suítes repetidas, sem relaxar gates.

Na validação inicial, a qualificação nativa permaneceu incompleta: os três casos de junction falharam antes de observar o produto; não foram omitidos nem substituídos por mocks. Os 14 positivos incluem remoção real somente de fixtures exclusivas `.cache/reference-proof-*`, preservação de destinos/irmãos, arquivo em uso, substituição adjacente ao efeito e operação workspaces com candidato exclusivo de qualificação. Naquela rodada não havia prova integrada. A revalidação abaixo acrescenta essa composição; os casos junction seguem sem prova e `safeReferenceRemoval=false` continua sem liberação destrutiva. Portanto esta sprint NÃO tem aceite integral RNF-08/nativo nem aprovação global.

SQLite, HTTP inject/loopback e arquivos temporários pertinentes são reais; ausência nas fixtures SQL e adapters GitHub/executor são controlados. Reopen não é morte de processo. Nenhum projeto do usuário, instalação operacional, provider, recrutamento Maestri/OMP, force stop ou mutação GitHub foi alvo. Não houve publicação, commit/push, alteração de credenciais/ACL, aceite visual ou mudança de fase. Preservação remota continua asserção controlada; revisão imutável e browser são gates próprios.

### Revalidação após feedback do evaluator — 2026-10-20

- `windows-reference.ts` e `windows-reference.cs` adicionam observação nativa em lotes de até 25 caminhos. Cada caminho mantém a validação de identidade e ancestrais; isso removeu o timeout HTTP de 15 s na prévia com o histórico completo.
- `project-deletion-history.ts` passa a criar destinos e referências coerentes com o inventário e permite montar o mesmo par de cadastros sem uma exclusão previamente semeada.
- `tests/native/project-deletion.integration.proof.ts` percorreu Fastify HTTP, coordenador, filesystem Win32 e finalização SQLite no histórico completo. Cadastro vizinho da mesma origem GitHub manteve todos os arquivos e linhas do inventário, inclusive deduplicação/consumos. Passou em 55,78 s; a permissão `safeReferenceRemoval=true` está restrita à fixture descartável.

| Comando repetido | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.467 testes/109 arquivos**, 76,38 s |
| `npm.cmd run test:http` | Exit 0; **4 testes/2 arquivos**, 2,33 s |
| `npm.cmd run build` | Exit 0; bundle JS 971,94 kB, aviso acima de 500 kB |
| `npm.cmd run test:deletion-native` | **Exit 1; 15 passaram/3 falharam**, 57,03 s; a integração passou, junctions falharam com EPERM antes das asserções |

O aceite permanece incompleto. `mklink /J` foi negado no workspace e no diretório temporário do sistema; `New-Item -ItemType Junction` e `FSCTL_SET_REPARSE_POINT` foram negados no workspace. `safeReferenceRemoval=false` permanece e nenhum caso foi substituído. Não foi feita medição de volume específica da exclusão, reservada à sprint-013. `repo-graph` e `graph-search` não estavam disponíveis no inventário desta sessão; GitNexus não foi usado.

## Sprint 013 — Medição de persistência e volume [MEDIÇÃO VALIDADA LOCALMENTE]

Data: 2026-10-20. Fontes: `AGENTS.md`, `SPEC.md` AC-29, `SPEC20261020_114742.md` §2.3/RNF-05 e `sprints20261020_114742.json` feat-025. Reutilizados o histórico relacional e o percurso HTTP/coordenador da Sprint 012. Esta seção registra a medição específica da exclusão sem substituir as pendências nativas de junction, revisão imutável ou aceite global.

- `tests/native/project-deletion.integration.proof.ts` agora mede o mesmo cadastro, autorização aceita ainda pendente e três consultas (`GET /api/v1/projects`, histórico filtrado por `operation_id` e `GET /api/v1/project-deletions/:operation_id`) com 0, 16 e 64 MiB de cache ignorado dentro do workspace exclusivo da fixture. Cada superfície teve um aquecimento e 20 amostras sequenciais por volume. Os corpos foram comparados integralmente com a referência; são registrados tamanho de payload, mediana, p95 e máximo, sem conservar corpos nem conteúdo dos arquivos.
- A prova usa controle positivo das sondas de IO e confirma zero leitura de `work/`, `git/` e `artifacts/` durante as consultas. Audita 46 tabelas/1.355 células TEXT/BLOB por marcador sintético, verifica os arquivos de artefato, `data_version`, sequência de eventos e `total_changes()`. A tabela de alvos autorizados permaneceu com 8 linhas nos três volumes. Os arquivos do cache aparecem apenas no workspace temporário; a exclusão integrada os remove depois das amostras e preserva as linhas e a árvore de arquivos do cadastro vizinho.

| Cache ignorado | DB / WAL / SHM (bytes) | Artefatos da fixture (bytes) | `work/` (bytes) | Alvos de exclusão | Listagem: bytes; mediana / p95 (ms) | Histórico: bytes; mediana / p95 (ms) | Polling: bytes; mediana / p95 (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 MiB | 917.504 / 4.185.952 / 32.768 | 85 | 110 | 8 | 2.923; 0,938 / 1,471 | 364; 0,610 / 0,806 | 2.361; 1,119 / 1,268 |
| 16 MiB | 917.504 / 4.185.952 / 32.768 | 85 | 16.777.326 | 8 | 2.923; 0,935 / 1,033 | 364; 0,572 / 0,712 | 2.361; 0,891 / 1,307 |
| 64 MiB | 917.504 / 4.185.952 / 32.768 | 85 | 67.108.974 | 8 | 2.923; 0,818 / 1,208 | 364; 0,591 / 0,726 | 2.361; 0,808 / 1,100 |

Os 85 bytes de artefatos são arquivos sintéticos da fixture; não são logs de execução real. Os payloads permaneceram byte a byte iguais. O banco/WAL/SHM, as 46 tabelas, a contagem de células TEXT/BLOB, os eventos e os 8 alvos não mudaram enquanto o conteúdo de `work/` cresceu 64 MiB. Latências são observações do Fastify `inject` neste host e não definem SLA.

| Validação desta sprint | Resultado |
| --- | --- |
| `npm.cmd run test:deletion-persistence` | Exit 0; 1 prova integrada aprovada, remoção dos alvos temporários e preservação integral do cadastro vizinho; relatório agregado `AC29_PROJECT_DELETION_REPORT`, sem conteúdo de projeto |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.467 testes em 109 arquivos**, 81,88 s |
| `npm.cmd run build` | Exit 0; controlador, recursos e cliente compilados |
| `git diff --check` | Exit 0 |

Nenhuma dependência foi instalada. O comando direcionado e a suíte usam somente fixtures descartáveis explicitamente criadas em `.cache`; o relatório registra agregados e tempos, não caminhos por arquivo, conteúdo excluído, IDs da fixture ou dumps do banco. A matriz nativa completa continua pendente nos casos de junction negados por `EPERM`; o override de capacidade é restrito à fixture de qualificação, e esta medição não libera `safeReferenceRemoval` em produção. Git/GitHub, providers, Maestri/OMP e publicação não foram executados. A medição de volume desta sprint está concluída localmente; isso não equivale à aprovação integral da feature de exclusão ou do pipeline.

## Sprint — Aviso Ready e validação real da jornada [AVISO IMPLEMENTADO; ACEITE INTEGRAL PENDENTE]

Data: 2026-10-20. Fontes conferidas: AGENTS.md, SPEC.md (fila, persistência e provas por superfície), GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, SPEC20261020_114742.md §4.6 e plano de validação, acompanhamento deste pacote e isolation-evidence.md. Alterações preexistentes preservadas; acompanhamento canônico da raiz não alterado.

- `apps/web/src/features/queue/QueueEnableDialog.tsx` apresenta literalmente “Issues que continuam em Ready podem ser executadas novamente.” no fluxo existente. É texto estático com a classe notice existente, sem novo checkbox, etapa, anúncio periódico ou confirmação. Hash autorizado, ETag, observação válida, envio único e tratamento de incerteza permanecem nos gates existentes; não há recuperação de histórico excluído ou alteração da capacidade de execução.
- O estado de automação continua vindo da configuração retornada pelo servidor. `ProjectForm.tsx` usa `draft.project.automation_enabled` derivado dessa leitura. Os testes de recadastro em `project-deletion-finalization.test.ts` verificam true→false, novo UUID e false após reopen; `project-deletion-http.test.ts` verifica a configuração após recadastro HTTP. Isso é prova controlada/SQLite, não observação de reload no browser.

### Cobertura consolidada e limites

| Escopo | Evidência existente, novamente exercitada pela suíte padrão desta rodada | Gate que permanece |
| --- | --- | --- |
| US-01/02; RF-01–08 | Transporte, diálogo e HTTP: prévia salva, perdas, clique único, CAS e saída sem cancelamento | Confirmação/caminhos/perdas em Chrome, teclado e zoom |
| US-03; RF-09–16 | Aceitação, barreira e worker: trabalho ativo/incerto, concorrência, scheduler/manual/publicação | Garantia nativa e jornada visual de bloqueio |
| US-04/05; RF-17–26 | Inventário, caminhos, isolamento e finalização: pertencimento exclusivo, vizinhos preservados e alvos substituídos | Junctions Windows e remoção segura liberada; caminhos completos em browser |
| US-06; RF-27–33 | Finalização e HTTP: remoção relacional atômica, sem succeeded parcial, recibo mínimo | Percurso destrutivo integral em temporários sob capacidade segura qualificada |
| US-07; RF-34–41 | Worker, transporte, completion, selection e polling: retomada, resposta tardia, fechamento sem cancelar, rascunhos e seleção alheios preservados | Reload, retry, sucesso/vazio, foco e anúncios observados em browser |
| US-08; RF-42–44 | Recadastro HTTP/SQLite sem herança, automação false após reopen; aviso literal no diálogo atual | Recadastro/reload/habilitação observados em browser |
| RNF-01–04/06/09/10 | Matriz de isolation-evidence.md: segurança HTTP, isolamento, rollback/recuperação, interleavings, migrations/guards, fronteiras e ausência de force stop | Prova operacional não é inferida dos adapters controlados |
| RNF-05 / AC-29 | Sprint-013 acima: caches 0/16/64 MiB, payloads 2.923/364/2.361 bytes constantes, DB/WAL/SHM e 85 bytes de artefatos constantes; 20 amostras por consulta/volume, sem SLA | Resultado histórico consolidado, não reexecutado nesta sprint; não libera capacidade nativa |
| RNF-07 / AC-27 / INT-11 | Tentativas de acesso ao navegador registradas abaixo | Obrigatório e pendente; sem screenshots ou árvore de acessibilidade reais |
| RNF-08 | Testes controlados de caminhos; resultados nativos anteriores preservados | Três casos de junction falharam ao criar fixture por EPERM; safeReferenceRemoval=false reconfirmado no código atual |
| E1/E2/E3 | Matriz de isolamento: origem salva, disputa de vínculos/aceite, substituição e ausência com ancestral seguro | Garantia nativa integral e inspeção visual |
| E4/E5/E6 | Matriz de isolamento: recuperação dos estados, rascunhos exclusivos/globais e interrupção dos efeitos após falha | Browser/restart operacional e primitiva segura qualificada |

### Prova obrigatória de navegador e segurança

`Playwright MCP browser_tabs(action=list)` retornou `MCP tool call requires approval, but approval policy is never`. A revisão automática rejeitou essa consulta; não foi possível abrir a prova por esse MCP. A alternativa CUA `getState()` retornou `apps: []` e `browsers: []`. Nenhum browser foi controlado, nenhum screenshot foi produzido e nenhuma árvore de acessibilidade real foi coletada. Não houve instalação de navegador/infraestrutura nem uso de perfil pessoal para contornar o gate.

Logo, confirmação, caminhos completos, perdas, bloqueio, pendência, retry, resposta tardia, reload, fechamento sem cancelamento, sucesso/vazio, desktop/mobile, teclado/zoom, foco, seleção/rascunhos alheios e ausência de metadados técnicos visíveis **permanecem sem aceite real**. `ProjectDeletionDialog` mantém região status/polite/atomic e alertas de bloqueio/erro; `project-deletion-polling.test.ts` verifica estabilidade dos nós durante polling inalterado em happy-dom. Isso não comprova árvore nativa ou anúncios de tecnologia assistiva; esse critério permanece pendente.

O adapter Windows continua declarando `safeReferenceRemoval=false`. Nenhuma exclusão operacional ou override de produção foi executado. A jornada destrutiva só poderá ser validada em projetos/diretórios temporários de ensaio depois de qualificar a garantia segura. O impedimento de browser e a garantia nativa pendente mantêm RNF-07/RNF-08, a entrega afetada e a conclusão integral da feature pendentes. Integração Maestri/OMP/provider é gate separado, sem autorização de custo/efeitos nesta sprint e sem sessão iniciada implicitamente.

As skills de design nomeadas não foram encontradas no catálogo ou nos diretórios pesquisados; não existe load_skill disponível. A inserção preserva composição/tokens existentes. Nenhuma dependência, migration, alteração de credencial, Git de escrita, publicação, Design Lock ou mudança de fase.

### Checks desta rodada

- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run lint`: exit 0.
- `npm.cmd run build`: exit 0; aviso existente de bundle acima de 500 kB (972,11 kB minificado).
- `npm.cmd test -- --reporter=dot --no-color`: exit 0; 1.467 testes em 109 arquivos, 80,53 s. Inclui as regressões de recadastro/reopen, barreiras, seleção/rascunhos e polling sem alteração relevante; adapters externos permanecem controlados.
- `npm.cmd run test:http`: exit 0; 4 testes em 2 arquivos, 2,33 s; executado isoladamente após a suíte completa.
- `git diff --check`: exit 0 na conferência final. O acompanhamento deste pacote é novo no estado Git encontrado; seu whitespace foi conferido adicionalmente por `git diff --no-index --check` contra NUL.

### Reavaliação de feat-027-c1/c2/c5 após rejeição — 2026-10-20

Nova tentativa efetiva: `Playwright MCP browser_navigate` para loopback retornou `MCP tool call requires approval, but approval policy is never` (isError=true). A revisão automática rejeitou a navegação antes de abrir a página. A alternativa `CUA getState()` retornou novamente `apps: []` e `browsers: []`. Não houve navegador controlado, screenshot, árvore de acessibilidade nativa nem medição de anúncios durante polling. Esses resultados são impedimentos de acesso, não provas de UI.

**feat-027-c1, feat-027-c2 e feat-027-c5 permanecem PENDENTES, assim como a entrega afetada e a conclusão integral da feature.** A matriz US-01–08, RF-01–44, RNFs e E1–E6 acima mantém seus limites. Foco, contenção de teclado, seleção/rascunhos alheios, metadados visíveis, desktop/mobile/zoom e todos os estados da jornada continuam sem aceite de navegador. Atributos ARIA e testes controlados não demonstram anúncios reais nem ausência de repetição em consultas sucessivas.

Conferência atual de `apps/controller/src/modules/workspaces/deletion.ts`: a composição nativa mantém `safeReferenceRemoval=false`. Não foi removido esse gate nem realizada exclusão operacional. O percurso destrutivo continua condicionado à garantia segura qualificada e exclusivamente a projetos/diretórios temporários criados para ensaio. Para retomar a prova faltam acesso autorizado a Playwright MCP/Chrome e a garantia segura necessária ao percurso destrutivo. Maestri/OMP/provider permanece gate separado, sem execução implícita. Nenhuma mudança de UI ou flexibilização de critério foi feita para contornar esses impedimentos.

Checks repetidos nesta reavaliação: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` terminaram com exit 0; build com aviso de bundle JS de 972,11 kB. `npm.cmd test -- --reporter=dot --no-color`: exit 0, 1.467 testes/109 arquivos, 79,06 s. `npm.cmd run test:http`, após a suíte completa: exit 0, 4 testes/2 arquivos, 2,32 s. `git diff --check` e conferência UTF-8 de whitespace do acompanhamento: exit 0. A suíte nativa não foi repetida nesta rodada; suas pendências anteriores permanecem. Esses checks não alteram os gates reais descritos acima.

### Nova conferência após feedback do Evaluator — 2026-10-20, 20:51

A tentativa real de `Playwright MCP browser_navigate` para `http://127.0.0.1:3000` foi rejeitada antes de abrir a página: `MCP tool call requires approval, but approval policy is never`. A consulta alternativa `CUA getState()` retornou `apps: []` e `browsers: []`. Não há screenshot, árvore de acessibilidade ou observação de anúncios obtidos nesta rodada. A navegação rejeitada não comprova disponibilidade do servidor nem comportamento da interface.

O arquivo atual `apps/controller/src/modules/workspaces/deletion.ts` mantém `safeReferenceRemoval: false` nas composições nativas. Não houve override, exclusão operacional ou início de sessão Maestri/OMP/provider. Não foram encontradas as skills de design nomeadas nos diretórios locais consultados; não foi alterada a UI nesta rodada.

Validação técnica repetida: typecheck, lint e build com exit 0; build com o aviso existente de bundle JS de 972,11 kB. Suíte padrão: **1.467 testes em 109 arquivos aprovados**, 79,88 s. HTTP, executado em seguida: **4 testes em 2 arquivos aprovados**, 2,32 s. `git diff --check` aprovado. A suíte nativa não foi reexecutada; seus limites anteriores permanecem.

**feat-027-c1/c2/c5, a entrega afetada e a conclusão integral continuam PENDENTES.** A matriz consolidada de US/RF/RNF/E acima continua aplicável. A próxima prova depende de navegador acessível e, para os cenários destrutivos, da garantia segura qualificada, usando exclusivamente projetos e diretórios temporários de ensaio. Os checks desta rodada não substituem esses requisitos nem autorizam integração externa.
### Revalidação após rejeição — 2026-10-20, 21:22

Nesta sessão, a descoberta de ferramentas não disponibilizou Playwright MCP. A consulta efetiva `CUA getState()` retornou `apps: []` e `browsers: []`; a tentativa explícita `CUA createBrowserTab("chrome", "about:blank")` respondeu `Browser is not available: chrome`. Não houve rejeição de aprovação nesta tentativa: o impedimento observado foi indisponibilidade do navegador. Nenhuma página foi controlada, screenshot produzido ou árvore de acessibilidade coletada. Anúncios e silêncio durante polling não foram observados.

O código atual mantém o aviso literal de Ready no diálogo existente e a leitura de `draft.project.automation_enabled` no formulário. A confirmação de exclusão continua exigindo prévia válida, ETag, ausência de bloqueios e contexto atual. A composição nativa mantém `safeReferenceRemoval=false`; não houve override ou exclusão operacional. Nenhuma alteração de UI foi necessária ou realizada. As skills de design solicitadas e a ferramenta `load_skill` não estão no catálogo disponível.

Checks repetidos: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram (exit 0); bundle JS de 972,11 kB com o aviso existente acima de 500 kB. `npm.cmd test`: 1.467 testes em 109 arquivos aprovados, 76,23 s. `npm.cmd run test:http`: quatro testes em dois arquivos aprovados, 4,34 s. `git diff --check` passou antes deste registro. A suíte nativa não foi repetida. Não houve instalação, escrita Git, publicação ou sessão Maestri/OMP/provider.

**feat-027-c1/c2/c5 e a conclusão integral continuam PENDENTES.** A matriz US-01–08, RF-01–44, RNFs e E1–E6 acima permanece aplicável com seus limites. Faltam navegador real acessível e garantia segura qualificada para o percurso destrutivo exclusivamente em temporários. Desktop/mobile, teclado/zoom, foco, rascunhos e seleção alheios, metadados visíveis, transições e anúncios durante polling continuam sem aceite real. Os checks desta sessão não substituem esses gates; Maestri/OMP permanece gate separado sujeito à autorização correspondente.

### Revalidação após feedback do Evaluator — 2026-10-20, 21:24

Tentativa atual efetiva: `Playwright MCP browser_tabs(action=list)` retornou `isError=true`, com `MCP tool call requires approval, but approval policy is never`. A revisão automática rejeitou a consulta. A consulta alternativa `CUA getState()` retornou `apps: []` e `browsers: []`. Nenhuma página foi controlada; não há screenshots, árvore nativa, transições ou silêncio de anúncios observados nesta rodada. Não foi usado executor alternativo para contornar a rejeição.

Validação técnica novamente executada: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram. Build mantém aviso de bundle JS de 972,11 kB. Vitest direcionado aos seis arquivos de transporte, diálogo, conclusão, polling, seleção e PrincipalScreen: **30 testes aprovados**. Vitest direcionado a `project-deletion-finalization.test.ts` e `project-deletion-http.test.ts`: **25 testes aprovados**, incluindo cobertura controlada de recadastro/configuração. `git diff --check` passou. Suíte completa e provas nativas não foram repetidas nesta rodada.

O código atual mantém o aviso literal Ready, o campo de automação derivado da configuração e `safeReferenceRemoval=false` na composição nativa. Nenhuma UI ou garantia foi alterada. **feat-027-c1/c2/c5, RNF-07, o percurso afetado por RNF-08 e a conclusão integral continuam PENDENTES.** A matriz US-01–08, RF-01–44, RNFs e E1–E6 acima conserva seus limites; os 55 testes controlados não substituem os cenários reais exigidos. Para retomar é necessário acesso autorizado a navegador real e garantia segura qualificada para exclusão exclusivamente em projetos/diretórios temporários de ensaio. Maestri/OMP/provider continua gate separado, sem sessão iniciada. Alterações preexistentes preservadas, sem escrita Git ou publicação.

### Conferência desta execução — 2026-10-20, 21:43

O aviso Ready já estava presente no diálogo existente, literalmente e sem confirmação adicional. Nenhuma mudança de UI foi necessária. A configuração continua lendo `draft.project.automation_enabled` da resposta persistida; reload no navegador permanece sem prova. As skills de design nomeadas e `load_skill` não estão disponíveis no catálogo desta sessão. CodeGraph foi tentado para orientação, mas a CLI instalada recusou `explore` como comando desconhecido; os arquivos atuais foram conferidos diretamente.

Tentativa efetiva de navegador: `CUA getState()` retornou `apps: []` e `browsers: []`; `CUA createBrowserTab('chrome', 'about:blank')` retornou `Browser is not available: chrome`. Não houve rejeição de aprovação nesta execução, mas indisponibilidade do navegador. Não foram coletados screenshots, árvore de acessibilidade, transições, anúncios ou silêncio durante polling. Desktop/mobile, teclado/zoom, foco, seleção e rascunhos alheios continuam sem aceite real.

Checks desta execução: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build`: exit 0. Bundle JS: 972,11 kB, com aviso acima de 500 kB. Os seis arquivos direcionados de transporte, diálogo, conclusão, polling, seleção e PrincipalScreen passaram: **30 testes**, exit 0. Suíte completa, HTTP e provas nativas não foram repetidos. Esses testes usam transporte/DOM controlados e não substituem navegador real.

A matriz consolidada US-01–08, RF-01–44, RNFs e E1–E6 acima conserva seus limites. RNF-05/AC-29 da sprint-013 permanece evidência histórica, não reexecutada: caches 0/16/64 MiB, payloads constantes de 2.923/364/2.361 bytes e DB/WAL/SHM/artefatos constantes, sem SLA. A composição atual mantém `safeReferenceRemoval=false`; nenhuma garantia foi flexibilizada, nenhum projeto foi excluído e nenhum provider ou sessão Maestri/OMP foi iniciado. **feat-027-c1/c2/c5, RNF-07, o percurso afetado por RNF-08 e a conclusão integral permanecem PENDENTES**, até navegador acessível e qualificação segura para ensaios exclusivamente temporários. Integração Maestri/OMP permanece gate separado. Alterações preexistentes e acompanhamento canônico da raiz preservados; nenhuma escrita Git ou publicação.

### Conferência da sprint — 2026-10-20, 21:16

O aviso literal já estava implementado em `QueueEnableDialog.tsx`, no fluxo existente e sem confirmação adicional. Conferidos os gates de observação válida, hash, ETag, envio e incerteza, além das provas de recadastro com `automation_enabled=false` após reopen e na configuração HTTP. Nenhuma alteração adicional de UI foi necessária. As skills de design nomeadas não foram encontradas no catálogo nem nos diretórios locais pesquisados; não há ferramenta `load_skill` disponível.

Nesta rodada, `Playwright MCP browser_tabs(action=list)` foi rejeitado pela revisão automática com `MCP tool call requires approval, but approval policy is never`. A alternativa `CUA getState()` retornou `apps: []` e `browsers: []`. Não foram obtidos screenshots, árvore de acessibilidade nativa ou anúncios observados. Regiões status/polite/atomic e alertas foram conferidos somente no código; estabilidade sob polling continua prova controlada. Não foi instalado navegador ou usado executor alternativo para contornar a rejeição.

Checks efetivamente executados: typecheck, lint e build com exit 0; bundle JS 972,11 kB, com o aviso existente acima de 500 kB. Suíte padrão: 1.467 testes em 109 arquivos aprovados, 79,11 s. Suíte HTTP: quatro testes em dois arquivos aprovados, 2,40 s. `git diff --check` passou. A suíte nativa não foi repetida. O código atual mantém `safeReferenceRemoval=false`; não houve override ou exclusão operacional.

A cobertura US-01–08, RF-01–44, RNFs e E1–E6 consolidada acima permanece com os mesmos limites. RNF-05/AC-29 da sprint-013 permanece resultado histórico: caches 0/16/64 MiB, payloads de 2.923/364/2.361 bytes e DB/WAL/SHM/artefatos constantes, sem SLA; a prova específica não foi reexecutada nesta rodada. **feat-027-c1/c2/c5, RNF-07 e o percurso afetado por RNF-08 permanecem pendentes, assim como a conclusão integral da feature.** A jornada destrutiva requer garantia segura qualificada e somente temporários de ensaio. Maestri/OMP/provider permanece gate separado, sem autorização ou sessão iniciada implicitamente. Nenhuma escrita Git, publicação, aprovação ou mudança de fase foi realizada; o acompanhamento canônico da raiz foi preservado.


### Revalidação com Playwright MCP acessível — 2026-10-20

Nesta execução, browser_tabs(action=list) respondeu com uma aba about:blank: o navegador está acessível. As navegações reais a http://127.0.0.1:3000 e http://127.0.0.1:4310 retornaram net::ERR_CONNECTION_REFUSED. Portanto, o impedimento atual é ausência de aplicação acessível nesses endereços, e não indisponibilidade ou rejeição de aprovação do Playwright. Nenhum screenshot da aplicação, árvore de acessibilidade, transição ou anúncio durante polling foi obtido. CUA não foi utilizado.

A composição startController exige execution.preflight antes de criar a superfície HTTP. Não foi iniciado contexto Maestri/OMP/provider, nem usado preflight fictício para apresentar integração como real. A composição nativa de workspaces/deletion.ts continua com safeReferenceRemoval=false; não houve override nem exclusão operacional. feat-027-c1/c2/c5 e a conclusão integral permanecem PENDENTES. A matriz US-01–08, RF-01–44, RNFs e E1–E6 acima conserva os limites; o percurso destrutivo depende de garantia segura qualificada e exclusivamente de projetos/diretórios temporários de ensaio.

Checks concluídos nesta execução: typecheck, lint e build com exit 0; bundle JS 972,11 kB, com aviso acima de 500 kB. Suíte padrão: 1.467 testes em 109 arquivos aprovados, 110,38 s. Suíte HTTP: 4 testes em 2 arquivos aprovados, 6,93 s. git diff --check aprovado. Provas nativas não foram repetidas. Esses checks não substituem a prova real obrigatória. As skills de design nomeadas e load_skill não foram encontrados no catálogo e nos diretórios locais consultados; nenhuma UI foi alterada.

### Prova parcial em aplicação acessível — 2026-10-20, 21:55 (Brasília)

Playwright MCP acessou a aplicação já em execução em `http://127.0.0.1:4310`, título Nova Fábrica. Diferentemente da rodada anterior, a aplicação respondeu. Nenhum servidor, sessão de executor ou provider foi iniciado pelo agente. Nenhuma mutação de negócio, habilitação ou exclusão foi enviada. O aviso Ready já estava implementado; não foi necessário alterar código de UI. As skills de design solicitadas e `load_skill` não foram encontradas; não houve redesenho.

- No diálogo real `enable-queue`, a árvore de acessibilidade contém o aviso literal, exatamente um checkbox de autorização existente e o botão Habilitar fila desabilitado antes da autorização. Foco inicial no botão Fechar diálogo; Shift+Tab moveu para Cancelar mantendo o foco dentro do diálogo. Escape fechou o diálogo e retornou foco à navegação Fila Ready.
- Desktop 1249×861: ausência de overflow horizontal no documento. Viewport mobile 390×844: diálogo entre x=20 e x=355, y=42,20 e y=801,80; ausência de overflow horizontal e botão ainda desabilitado. Trata-se de viewport de navegador, sem alegação de dispositivo físico.
- Screenshots sanitizados por recorte exclusivo do aviso, sem conta, nomes de projetos ou metadados: [desktop](ready-desktop.png) e [mobile](ready-mobile.png). Os recortes comprovam a renderização do texto; medidas e interações acima foram obtidas por observação do DOM e teclado no Playwright. Não comprovam a jornada completa nem a versão recém-compilada: o processo já estava em execução e não foi reiniciado.
- Typecheck, lint e build desta rodada: exit 0; bundle JS 972,11 kB com aviso de chunk acima de 500 kB. Cinco arquivos focados de transporte, diálogo, polling, conclusão e seleção: 27 testes aprovados. Resultados da suíte completa e HTTP são acrescentados abaixo após término.

A matriz consolidada US-01–08, RF-01–44, RNFs e E1–E6 permanece válida com os limites anteriores. Esta evidência avança somente a comunicação de US-08/RF-44 e o teclado/layout do diálogo de habilitação. Automação false após recadastro/reload, confirmação de exclusão, caminhos/perdas, bloqueio, pendência/retry/resposta tardia, fechamento de acompanhamento sem cancelar, sucesso/vazio, seleção/rascunhos alheios, zoom nativo e status/alerta com silêncio durante polling **continuam sem prova real nesta rodada**. Os 27 testes são controlados, não prova desses cenários no browser.

RNF-08 continua bloqueado: a composição nativa mantém `safeReferenceRemoval=false`; provas anteriores de junction foram impedidas por EPERM. Não foi aplicado override nem usado projeto real como alvo. O percurso destrutivo exige capacidade segura qualificada e projetos/diretórios temporários exclusivos de ensaio. RNF-07, feat-027-c1/c2/c5 e a conclusão integral permanecem pendentes. Maestri/OMP permanece gate separado sujeito a autorização própria.

RNF-05/AC-29 consolidado da sprint-013, sem reexecução: caches 0/16/64 MiB, payloads de listagem/histórico/polling 2.923/364/2.361 bytes constantes; DB/WAL/SHM e 85 bytes de artefatos constantes, 20 amostras por consulta/volume, sem SLA. Essa prova de volume não libera a capacidade destrutiva.

#### Ajustes de validação da rodada

Aplicada a skill `diagnosing-bugs` à falha reproduzida duas vezes por `npm.cmd run test:http`: `ECONNRESET` na fixture do seletor. A fixture usava conexão de 20 ms e espera de 50 ms, deixando a preparação da primeira requisição exposta a um prazo muito curto. Ajustada exclusivamente a fixture para 500/750 ms: o seletor continua esperando além do timeout de conexão, preservando o propósito da prova. Os quatro testes HTTP passaram (exit 0). Não foi alterado o handler de produção, nem inferida causa para incidentes históricos. Context7 consultado sobre `connectionTimeout` do Fastify.

A primeira suíte padrão terminou com 1.466 aprovados e uma falha de SSE (503 e ERR_HTTP_HEADERS_SENT) no teste de precedência de Last-Event-ID. A fixture encerrava o stream em 35 ms com apenas 10 ms adicionais até o deadline do handler; ampliada essa margem de teste para 500 ms. A prova anterior continua usando deadline ordinário de 10 ms para verificar streaming além desse prazo. Os dois testes focados passaram. Suíte completa novamente executada para conferir o ajuste; resultado final registrado abaixo. Nenhum timeout de produção foi alterado.

Uma nova navegação confirmou o aviso também após carregamento da página. Control++ não produziu mudança observável de viewport/DPR/visualViewport.scale; portanto **zoom nativo não foi comprovado**. Control+0 e Escape restauraram o estado de navegação. Nenhum POST de habilitação foi enviado.

Resultados finais após ajustes: typecheck, lint, build e `git diff --check` com exit 0; suíte padrão **1.467 testes em 109 arquivos**, exit 0, 84,18 s; suíte HTTP **4 testes em 2 arquivos**, exit 0. Os 27 testes focados de frontend e os dois testes focados de SSE também passaram. O build preserva bundle JS de 972,11 kB; o aviso de tamanho não foi tratado como falha nem como aceite de performance. Provas nativas destrutivas não foram reexecutadas. O acompanhamento da raiz não foi editado nesta rodada; nenhum comando Git de escrita foi executado. A entrega integral continua pendente dos gates reais descritos acima.

### Revalidação com árvore nativa e cadastro temporário — 2026-10-20, 22:10 (Brasília)

Fontes: SPEC deste pacote §4.6, plano obrigatório RNF-07/RNF-08 e sprint-014/feat-026–027. A aplicação existente respondeu em `http://127.0.0.1:4310`. Usado exclusivamente Playwright MCP para navegador; nenhum CUA. O CodeGraph retornou `MCP tool call requires approval, but approval policy is never`: a revisão automática impediu essa consulta, e os arquivos atuais foram lidos diretamente. As skills de design nomeadas e `load_skill` não foram encontradas no catálogo nem nos diretórios de skills pesquisados. Nenhuma UI foi implementada ou redesenhada nesta rodada.

Foi criado pela interface somente o cadastro **Ensaio temporário exclusão A**, com origem URL de ensaio, sem clonar, criar repositório remoto ou diretório de origem. A resposta real de configuração retornou `automation_enabled=false`; após reload, nova consulta retornou HTTP 200 e false, e o checkbox continuou desmarcado. Isso comprova novo cadastro/reload; não comprova recadastro após uma exclusão concluída. O cliente carregou `/assets/index-jDYwtaAV.js`, mesmo nome produzido pelo build desta rodada. O controlador existente não foi reiniciado; não se afirma identidade imutável de sua versão.

**Evidência real acrescentada, sanitizada e inspecionada visualmente:**

- [Diálogo desktop completo](browser-20261020/blocked-desktop.png), viewport 1280×900: perdas completas, preservação do GitHub e das origens anteriores, aviso de origem somente URL, bloqueio com motivo/próxima ação e ação destrutiva desabilitada. A lista de alvos veio vazia; a imagem não comprova caminhos de filesystem.
- [Diálogo mobile](browser-20261020/blocked-mobile.png) e [ações após rolagem por foco](browser-20261020/blocked-mobile-actions.png), viewport 390×844: diálogo de 341 px de largura, sem overflow horizontal; conteúdo vertical rolável e botão Atualizar conferência visível após receber foco. As duas imagens documentam partes complementares do mesmo diálogo.
- [Automação após reload](browser-20261020/automation-after-reload.png): checkbox real desmarcado. Recorte limitado ao controle para não registrar configuração pessoal.
- [Árvore nativa de acessibilidade](browser-20261020/blocked-native-ax.json): extraída por CDP `Accessibility.getFullAXTree`, limitada à subárvore do diálogo, sem identificadores internos. Contém `dialog/modal`, `status/live=polite/atomic=true`, `alert/live=assertive/atomic=true` e botão destrutivo desabilitado. Não é uma reconstrução de atributos nem happy-dom.
- [Observações e limites](browser-20261020/observations.json): a árvore nativa também capturou `status` com o texto real “Conferindo a configuração salva…”, seguido de alerta de bloqueio. Foco inicial no título; cinco Tabs alternaram entre Voltar à configuração e Atualizar conferência, sempre dentro do diálogo; Shift+Tab manteve contenção. Escape fechou e devolveu foco a Excluir definitivamente; monitoramento desse fechamento registrou zero comandos de exclusão. Inspeção visual e busca dirigida não encontraram UUIDs, hashes, códigos ou recibos no diálogo observado. Isso não é prova universal de todos os estados.

A conferência real retornou “Não foi possível conferir com segurança todos os caminhos.” e “Verifique o acesso às pastas e consulte novamente a exclusão.” Não houve aceite nem pedido destrutivo enviado pelo navegador. O cadastro temporário permanece registrado com automação desligada, pois sua exclusão também está bloqueada; nenhum cadastro preexistente foi alterado. Control+Equal duas vezes manteve innerWidth=1280, DPR=1 e visualViewport.scale=1; Control+0 restaurou o atalho, mas **zoom nativo continua sem prova**. Não foram fabricadas respostas para alcançar estados ausentes.

**Garantia segura reexecutada:** `npm.cmd run test:deletion-native` terminou com exit 1, **15 aprovados e 3 falhas**, 75,57 s. Os três casos de junction (descendente, raiz e ancestral) falharam com `EPERM` durante a criação das fixtures, antes de comprovar o comportamento. A prova integrada passou em 74,05 s; usou apenas a capacidade controlada já existente na fixture e removeu exclusivamente seus temporários, preservando o cadastro vizinho. Nenhum override foi aplicado à composição do produto: `safeReferenceRemoval=false` permanece. Não se tentou contornar a restrição alterando permissões ou credenciais.

A prova integrada repetiu RNF-05/AC-29: caches de 0/16/64 MiB; payloads de listagem/histórico/polling constantes em 2.923/364/2.361 bytes; DB/WAL/SHM constantes em 917.504/4.185.952/32.768 bytes; artefatos de 85 bytes e 8 alvos autorizados. Vinte amostras por superfície/volume, sem inventário por arquivo e sem SLA. Esses resultados atualizam a medição local; não liberam a capacidade nativa nem provam navegador.

| Check final desta rodada | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run build` | Exit 0; JS 972,11 kB; aviso existente acima de 500 kB |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 1.467 testes/109 arquivos; 86,98 s |
| `npm.cmd run test:http` | Exit 0; 4 testes/2 arquivos; 5,21 s |
| `npm.cmd run test:deletion-native` | Exit 1; 15 aprovados/3 falhas de criação de junction; 75,57 s |
| `git diff --check` | Exit 0 antes e após o registro das evidências; arquivos novos também conferidos diretamente |

**Cobertura consolidada e situação atual:**

| Escopo | Evidência e limite |
| --- | --- |
| US-01–02 / RF-01–08 | Conferência bloqueada, perdas, teclado, fechamento e árvore nativa observados no browser. Aceite real, caminhos completos e efeitos permanecem pendentes. |
| US-03–05 / RF-09–26 | Matriz anterior de isolamento/pertencimento e provas controladas preservadas; RNF-08 ainda falha em junctions. Nenhuma liberação destrutiva. |
| US-06 / RF-27–33 | Prova integrada temporária reexecutada, com finalização e preservação do vizinho; sucesso/vazio no browser continuam pendentes. |
| US-07 / RF-34–41 | Testes de transporte/lifecycle/seleção/polling passaram na suíte. Sem prova real de pendência, retry, resposta tardia, fechamento após aceite, preservação de seleção/rascunhos alheios ou silêncio durante polling. |
| US-08 / RF-42–44 | Novo cadastro e reload false observados no browser. Aviso Ready e validações existentes preservados; evidência anterior do diálogo permanece. Recadastro após exclusão não foi observado. |
| RNF-01–04/06/09/10 | Cobertura controlada da matriz de isolamento e suíte final preservada; não convertida em prova operacional externa. |
| RNF-05 / AC-29 | Medição integrada 0/16/64 MiB reexecutada nesta rodada, conforme resultados acima. |
| RNF-07 / AC-27 / INT-11 | Avanço real limitado a loading→blocked, perdas, desktop/mobile, foco, teclado e reload. Jornada completa e zoom continuam pendentes. |
| RNF-08 | Três falhas nativas de junction por EPERM; composição segura indisponível. |
| E1–E3 | Cobertura controlada anterior preservada; não houve prova visual de troca de origem, disputa de vínculos ou substituição de alvo. |
| E4–E6 | Cobertura controlada anterior preservada; não houve aceite real no browser para provar recuperação, rascunhos alheios ou interrupção/retomada entre alvos. |

**feat-027-c1/c2/c5, a entrega afetada e a conclusão integral continuam PENDENTES.** A presença real de status/alerta não comprova silêncio durante polling nem anúncios de leitor de tela. Para concluir faltam qualificação segura em ambiente que permita as três fixtures de junction e a jornada completa no navegador, exclusivamente em temporários. Nenhuma sessão ou provider Maestri/OMP foi iniciado; sua integração pertinente permanece gate separado sujeito à autorização correspondente. Não houve escrita Git, publicação ou mudança de fase. Alterações preexistentes e o acompanhamento canônico da raiz foram preservados.
