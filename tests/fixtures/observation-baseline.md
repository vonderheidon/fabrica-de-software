# Fundação do ensaio C4

Fonte vigente para a continuação: `.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/revisao-escopo-20261021/SPEC-20261021_150214-1ec379.md`, Tests/D4 e F1, e Decisions da mesma revisão. Esta fixture é o aparato inicial, não o baseline completo F2–F5 nem uma otimização.

A execução direta de 2026-10-21 abrange as sprints 001 a 004, autorizadas separadamente pelo usuário. D4 foi corrigido: encaminhamento de prompts, consulta de perfis e mudanças no LionClaw não são entregáveis nem bloqueios desta continuação. Os registros abaixo sobre o run encerrado são históricos e não representam pendências da revisão vigente. A medição backend da sprint-002 está descrita em `backend-measurement.md`; os percursos web e seus limites estão registrados em `SPEC_PROGRESS.md`. O baseline executado está em `.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/observation-baseline.md`; a sprint-005 aguarda autorização.

`observationFixture` e `withObservationFixture` em `observation-baseline.ts` compõem `attemptFixture`, Storage SQLite real e `createQueue` existentes. Não iniciam pipeline, rede, servidor, provider ou terminal. Cada instância tem diretório temporário exclusivo; o wrapper fecha conexões, recursos próprios e restaura Date.now em finally, inclusive quando o callback falha. Use instâncias sequenciais: o relógio controlado é global ao worker de teste. Não use concorrência entre fixtures no mesmo worker.

## Configuração reproduzível

| Cenário | Projetos | Issues por projeto | Memberships por issue | Páginas simuladas por listagem/contexto | Latência virtual por página |
|---|---:|---:|---:|---:|---:|
| base | 2 | 10 | 1 | 1 | 5 ms |
| expanded | 2 | 10 | 3 | 2 | 5 ms |
| large | 2 | 100 | 3 | 2 | 5 ms |

Relógio inicial: 1800000000000 ms; cada resposta avança o relógio pelo custo de suas páginas e cede uma microtask. `advance` permite expirar o cache. Não são sleeps, latência de parede ou simulação de caminho crítico concorrente. Configuração local por projeto usa board distinto, Ready e conta sintética ACCOUNT_test. Automação global permanece desligada; nenhuma tentativa é iniciada. Perfis sintéticos vêm de attemptFixture, sem catálogo/provider real.

As páginas são respostas sintéticas no seam QueueGitHub, que já recebe coleções completas. Não exercitam paginação GraphQL do cliente nem comprovam número de subprocessos GH. F2 deverá usar GhRunner/onSend para contar envios reais da implementação de transporte. A cardinalidade de memberships é efetivamente materializada, incluindo uma pertencente ao board configurado. UUIDs de banco, ETags, summaryHash, observationId e instantes locais de criação não são comparados byte a byte entre instâncias; relações de elegibilidade e sequência dos registros são comparadas.

`read` seleciona `queue.read` somente para display; scheduler, scope e authorization selecionam `queue.observe` sem conceder autorização de efeito. `changeAccount` e `failNextResponse` permitem reproduzir mudança de identidade e falha, na posição indicada pela mesma sequência de ações. `advance` e contextos explícitos reproduzem fase/gatilho/repetição. Nenhuma alteração é aplicada ao banco do operador.

## Registros privados

`ObservationSample` tem cenário, repetição, cold/warm, finalidade, gatilho, consumerId, executionId, physicalExecutionIds, categoria, contagem, duração virtual, conclusão e cardinalidades. Categorias consumer, logical e synthetic_page são séries diferentes; nunca somar as três como envios remotos. Cada página física simulada recebe ID único; cache aquecido registra consumidor sem gerar outra página e referencia os mesmos physicalExecutionIds da leitura fria. O contador físico pertence à fixture, não a cada consumidor; conte os IDs distintos somente na categoria synthetic_page. Esta primeira interface serializa jornadas; compartilhamento simultâneo será exercitado no baseline consumidor F2–F4.

Os campos são projetados explicitamente, sem query, variáveis, argv, headers, corpo, ambiente, checkout ou erro bruto. Use somente identificadores sintéticos nos contextos. Não há DTO público, endpoint, header, tabela, migration ou adapter de produção para medir. Frequência de uso real é desconhecida. Estes testes não escolhem uma primeira otimização nem estabelecem meta/p95.

Reprodução: `npm.cmd test -- tests/integration/observation-baseline.test.ts --reporter=dot`.

## Encaminhamento D4 no run encerrado (histórico)

O executor atual recebeu na tarefa do usuário a instrução obrigatória de ler Tests → Instruções de execução e promoção ao contexto efetivo da SPEC deste run; o bloco foi efetivamente lido nesta execução antes da implementação. Também recebeu autorização explícita para leitura/edição e checks locais, sem restrição somente Git. Configuração observável: agente Codex, modo Default, PowerShell, repositório canônico e filesystem workspace-write. ID de perfil LionClaw, provider/modelo/esforço resolvidos e handler externo não estão disponíveis nas ferramentas desta sessão; não são inferidos da fixture nem do nome do agente.

A descoberta das ferramentas disponíveis não encontrou conector LionClaw para consultar composição de tarefas, perfis cadastrados e configuração resolvida ou aplicar atualização suportada. A busca nos artefatos locais só encontrou a exigência, não o handler. Portanto, promoção aos executores posteriores e perfil externo permanece **pendente**. A camada LionClaw precisa disponibilizar seu mecanismo suportado de consulta/atualização do handler e perfil selecionados, com projeção sanitizada do contexto resultante. Então aplicar D4 na composição normal e iniciar nova execução ou atualizar a sessão por mecanismo suportado. Não houve edição de internals externos, seed, reinício, gate ou avanço de fase. Manifesto e este registro não comprovam esse encaminhamento externo.

O bloco normativo permanece na SPEC citada: comandos/checks e medição autorizados; Playwright MCP; Maestri somente com manual/helpers Wire; gestão apenas de servidor próprio em 127.0.0.1:4310, preservando terceiros e segredos e sem publicação ou consumo pago indiscriminado. Nenhuma dessas permissões textuais é alegada como disponibilidade técnica de ferramenta.

### Rastreamento após rejeição do Evaluator — 2026-10-21

A inspeção somente leitura do código externo do LionClaw localizou os pontos abaixo. Caminhos relativos à raiz do LionClaw, não à fábrica. São evidências estáticas do mecanismo; não demonstram a versão em execução nem o perfil cadastrado.

| Ponto confirmado no código | Aplicação necessária pelo proprietário do LionClaw |
|---|---|
| `electron/main/harness-engine.ts:1211`, `spawnCoder`; composição em 1231–1235 e envio em 1272–1275 | Encaminhar D4 e o caminho da SPEC do run tanto na primeira rodada quanto nas correções. `briefingPrefix` só é acrescentado na rodada 1. |
| `electron/main/harness-prompts.ts:251`, `buildCoderFeedbackPrompt` | O prompt de correção contém feedback e critérios, mas não recebe `specPath` nem `briefingPrefix`. Acrescentar referência obrigatória a D4 apenas ao briefing inicial não cobre esse caminho. |
| `electron/main/harness-engine.ts:1353`, `spawnEvaluator`; composição em 1368 e envio em 1407–1410; `harness-evaluator.ts:11`, `buildEvaluatorPrompt` | Incluir D4 ou leitura obrigatória junto ao caminho exato da SPEC também no contexto de validação. |
| `electron/main/harness-engine.ts:1222–1225` e `1362–1365` | Os IDs usados vêm de `sprint.coderAgentId` e `sprint.evaluatorAgentId`, seguidos de `getAgent`. O plano local da sprint 001 indica `backend-developer` e `harness-evaluator`; isso não comprova o cadastro selecionado em runtime. |
| `electron/preload/index.ts:133–137`; `electron/main/ipc/agents.ts:59–74` | Mecanismo suportado do aplicativo: `window.lionclaw.agents.get(id)` / `update(id, patch)`, via IPC `agents:get` / `agents:update`. Atualizar o perfil efetivamente selecionado, preservando os demais campos; não editar SQLite, seed ou RULES por shell. |
| `electron/main/agent-runtime/execute.ts:104–117`; `electron/main/agent-config-resolver.ts:62–78`, `112–125`, `164–173` | Capturar projeção sanitizada da configuração após resolução/overrides/transforms e antes do despacho. A composição inclui RULES, systemPrompt, ferramentas habilitadas e MCPs vinculados; perfil isolado não prova contexto final. Registrar provider/modelo/esforço efetivos sem credenciais, env ou argumentos dos MCPs. |

O README do LionClaw informa que não há API HTTP exposta em produção. Nesta sessão não há ferramenta LionClaw/IPC nem CLI `lionclaw`; Playwright MCP não fornece acesso ao renderer Electron já aberto por si só. Não foi tentado contornar isso por porta adivinhada, acesso ao banco do operador ou edição externa. O mecanismo IPC acima foi localizado estaticamente, mas não pôde ser invocado nesta sessão.

Pendência concreta da camada LionClaw: aplicar D4 nos três caminhos de composição, atualizar os perfis selecionados pela interface suportada quando necessário e, na execução normal seguinte ou atualização suportada, registrar por executor o run/sprint/rodada, agentId, contexto encaminhado com D4/SPEC e configuração resolvida sanitizada. Não criar execução autônoma de certificação nem avançar fase para produzir essa evidência. **Os dois critérios de encaminhamento continuam não atendidos até existir essa evidência real.**

## C12 — cargas de baseline do run 20261029_211418-4de31f

Esta seção acrescenta o percurso GraphQL ao aparato histórico C4; não reinterpreta nem substitui a medição antiga no seam `QueueGitHub`.

| Cenário | Issues por projeto | Memberships | Páginas | Comentário grande | Atraso sintético por envio |
|---|---:|---:|---:|---:|---:|
| `one-page-one-membership` | 10 | 1 | 1 | 0 bytes | 5 ms |
| `two-page-two-memberships` | 10 | 2 | 2 | 0 bytes | 5 ms |
| `two-page-three-memberships` | 10 | 3 | 2 | 0 bytes | 5 ms |
| `large-comment-continuation` | 10 | 1 | 2 | 900.000 bytes em comentário separado | 5 ms |
| `large-grouped-response` | 2 cadastradas por projeto; uma consultada | 3 | 2 | 0 bytes; envelope agrupado de 4.500.000 bytes adicionais | 5 ms |

Cada carga principal usa dois projetos e observa os 20 issues da fila pelo consumidor real `createQueue`, com os IDs sintéticos associados à ordem UUID real do desempate, conta `ACCOUNT_test` e mesmos critérios da fixture. Em seguida lê o contexto completo de um issue. As cinco cargas principais são repetidas três vezes no percurso direto `createClient` e três vezes pela composição `createGitHub` com `runnerFactory`. A carga `large-grouped-response` é uma medição separada de um issue com três memberships, repetida três vezes por percurso. O teste registra rótulos fixos de operação/cursor, limites numéricos, contagens, bytes, durações e resultados; não retém nem imprime consulta, variáveis ou corpo.

`observationWire` responde pelas queries reais de `GraphQLReader`, `scope`, `collect` e `createQueue`. A fila usa os três workers existentes e dispara a leitura completa dos 20 issues; o contexto de um issue e as confirmações rodam depois. Assignee, comentário, blocker, membership e valores têm cursores próprios. Em respostas de status de duas páginas, a página 1 contém um valor numérico dispensado e a página 2 contém Status. O comentário de 900.000 bytes está abaixo do limite contratual individual e a segunda página contém a confirmação exata. `sendOrder` conserva a sequência efetivamente disparada usando só nomes fixos `Factory*` e `page-1/page-2`.

O teste de confirmação separa comentário exato, ausente, duplicado, divergente e exato na página seguinte; e Status exato, divergente e na página seguinte. Seu oráculo sintético confere Issue/repositório/URL, autor `ACCOUNT_test`, corpo e SHA-256 esperados, item `ITEM_synthetic_0_1`, projeto `PVT_synthetic_0`, campo `FIELD_test`, opção `READY` e membership única não arquivada. Verifica DTO `IssueContext` completo, sem executar mutação nem substituir a reconciliação durável de Publication. A rota pública de fila também valida `HttpQueueObservation`, cursor, ordem e elegibilidade pelos dois percursos.

Cooldown usa resposta 429 sintética com `Retry-After: 60`; uma segunda consulta é bloqueada antes de novo `onSend`. Saturação dispara seis leituras juntas, sem espera de produção neste snapshot. Esse resultado é concorrência simulada: não é prova de subprocessos GH nem atende por si só ao teto de três envios físicos da implementação futura. Runner com falha após `onSend` marca bytes desconhecidos, não zero. O grupo de três memberships inclui envelope sintético JSON `extensions` para superar 4 MiB sem alterar os nós selecionados; a composição atual não encaminha `responseBytes` ao `runnerFactory`, então a falha esperada é registrada como limitação.

Reprodução focada: `npm.cmd test -- tests/integration/backend-measurement.test.ts --reporter=verbose --no-color`. A medição de fila/DTO permanece também em `tests/integration/backend-measurement.test.ts`; seu teste de três workers por observação e seis agregados continua nomeado e reportado como concorrência **lógica**.
