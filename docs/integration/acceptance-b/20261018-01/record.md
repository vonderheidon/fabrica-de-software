# Registro da Etapa B — 20261018-01

Data de preparação: 2026-10-18. Estado: **roteiros preparados; provas externas pendentes**. Este identificador é documental e não identifica uma execução.

## Identidade e separação dos resultados

| Superfície | Resultado local consolidado | Aceite visual atual | Integração real | Revisão imutável |
| --- | --- | --- | --- | --- |
| Primeira fatia, S20 / sprint-018 | Preservado no registro local de consolidação em `SPEC_PROGRESS.md`; ver limites abaixo | Pendente para as telas e versão atuais | Pendente | Pendente |
| Publicação na interface, S23 / sprint-021 | Mesmo registro local consolidado; adapters externos foram controlados | Pendente para os três modos nesta versão | Pendente | Pendente |
| Fila, S26 / sprint-024 | Mesmo registro local consolidado; consulta/worker externo não foram exercitados | Pendente para esta versão | Pendente | Pendente |
| Aceite transversal, S34 / sprint-032 | Mesmo registro local consolidado | Há evidência visual histórica parcial em `acceptance-transversal/visual-evidence.md`; não identifica esta versão e não fecha os critérios | Pendente | Pendente |

Não há referência Git imutável autorizada desta entrega nesta preparação. O workspace contém alterações locais; `HEAD` anterior, hashes de arquivos e inventários não o substituem. Versão, commit, tree, runtime, responsável, raiz/cwd, ferramentas e autorização de cada execução permanecem sem preenchimento obrigatório nos roteiros. Sem esses valores não se inicia uma prova externa.

## Resultado local reutilizado

O registro anterior `SPEC_PROGRESS.md`, seção **“Consolidação local, segurança e persistência leve”**, registra os checks locais executados: typecheck e lint aprovados, suíte com 1.235 testes, build, `test:compiled`, `test:execution-compiled`, `test:verification-compiled`, distribuição, ensaios de manutenção e `proof:persistence`. A medição local comparou caches de 0, 16 e 64 MiB e registrou payloads estáveis de listagens (335 B), histórico (6.872 B) e polling (3.137 B), sem estabelecer SLA.

Esses resultados são históricos e locais. Os adapters Git/GitHub/Maestri/OMP foram controlados nas provas pertinentes; eles não comprovam provider, GitHub, terminal Maestri/OMP, Chrome ou efeitos remotos reais. Não foram reexecutados nesta preparação, nem promovidos a aceite da versão atual.

## Pré-requisitos comuns por execução

- Referência imutável da entrega fornecida pelo fluxo autorizado, com identificador da versão, commit e tree correspondentes. Nenhum SHA de `HEAD`, inventário ou digest avulso substitui a referência.
- Responsável identificado por papel e alias seguro; runtime e raiz/cwd exatos anotados antes de qualquer efeito.
- Conta GitHub vinculada e revalidada; repositório, Project, owner, item/campo/opções de Status e issues definidos por IDs; estado/assignee observado no momento da prova.
- Perfis exatos capturados para Implementador e Revisor: provider, modelo, esforço (inclusive `null` quando aplicável), guidance e versão do recurso de papel.
- Acesso efetivo conferido no mesmo runtime responsável. Ferramenta listada, chamada em outro runtime, fixture, Wire e conexão nativa do produto recebem classificações diferentes.
- Autorizações explícitas por provider e por efeito, contendo alvo, ação, responsável, janela e limites de uso/efeito. Não derivar autorização de instalação, onboarding, diagnóstico ou preparação deste documento.
- Plano para interromper somente browser, processos, terminais, child writers e recursos iniciados pela prova; recursos alheios e resultados anteriores permanecem preservados.

## Registro obrigatório de disponibilidade e chamadas

Para cada ferramenta/capacidade, preencher uma linha no registro da execução com: `listed`, `called_in_responsible_runtime`, `access_from_other_runtime`, `fixture`, `wire`, `product_native`, versão/build, horário, chamada segura, saída sanitizada, resultado e evidência. `listed` não implica chamada. `wire` não comprova `product_native`. Fixture não é integração real.

Nesta preparação, `git` foi usado somente para inspeção local autorizada (`status`, `diff`, `show`, `ls-files`); não foi executada chamada GH, OMP, Maestri, Wire, provider ou Playwright. As ferramentas `repo-graph` e `graph-search` não aparecem no inventário desta sessão; GitNexus não foi usado. Essa ausência do inventário do agente não determina disponibilidade no runtime de uma execução futura.

| Capacidade | Listada no inventário desta sessão | Chamada nesta sessão | Runtime responsável pela prova | Outro runtime / fixture / Wire / nativo | Versão, horário e resultado |
| --- | --- | --- | --- | --- | --- |
| Git local | CLI usada por `functions.exec_command` | Sim, somente leituras do repositório para preparar docs | Não; este não é o runtime do produto | Não é prova de Git gerenciado | Versão não consultada; leitura local apenas |
| GitHub CLI / API | Sem conector dedicado listado; binário não foi sondado | Não | Pendente | Sem acesso de outro runtime, fixture ou produto observado | Não observado |
| OMP / Maestri nativo | Sem conector dedicado listado; executáveis não foram sondados | Não | Pendente | Nenhuma sessão Wire ou TUI do produto observada | Não observado |
| Wire Maestri | Manual e helpers referenciados na documentação do repositório | Não | Pendente | Não foi chamado via outro runtime; não é integração nativa do produto | Sem horário/resultado nesta rodada |
| Playwright MCP / Chrome | Playwright MCP aparece no inventário; Chrome não foi iniciado | Não | Pendente | Não houve browser, screenshot ou fixture visual | Versão não observada |
| `repo-graph` / `graph-search` | Não listadas no inventário desta sessão | Não | Pendente | Não substituídas por GitNexus ou fixtures | Versões/resultado não observados |
| Provider / execução de agente | Nenhum provider executado | Não | Pendente | Fixtures históricas permanecem classificadas como locais/controladas nos relatórios de origem | Sem consumo nesta preparação |

Os valores “não sondado” e “não observado” não significam indisponibilidade. A execução futura deve refazer essa tabela no runtime responsável e salvar horário e evidência da chamada efetiva.

## Autorizações que ainda precisam de alvo

| Escopo | Autorização exigida antes do início | Estado nesta preparação |
| --- | --- | --- |
| Provedor/modelo | Provider e modelo de cada papel, chamadas/passagens permitidas, janela e limite externo de uso/custo definidos pelo responsável | Pendente |
| Git local gerenciado | Cadastro/clone por tentativa, retenção de conteúdo, refs técnicas, materialização, checks e eventual commit privado, conforme roteiro | Pendente |
| GitHub leitura | Conta vinculada e allowlist de repositório, Project, issues e campos consultados | Pendente |
| GitHub escrita | Separar comentário ICR, transição de Status, criação remota, push de baseline e criação de PR; autorizar cada efeito e alvo individualmente | Pendente |
| Maestri/OMP | Host/terminal de teste, recrutamento, interação, parada de recursos próprios e eventual restart/retry | Pendente |
| Navegador | Playwright MCP/Chrome de teste, perfil descartável, origem local e cenários de UI autorizados | Pendente |
| Revisão | Revisor independente, acesso somente à referência entregue e autorização para executar os checks nela | Pendente |

## Registro de pendências e divergência documental

Nenhuma chamada externa ou mudança de produto foi realizada por esta sprint. Resultados de execução permanecem `pending` até haver chamada observada, autorização correspondente e evidência própria; indisponibilidade não é `failed` do produto.

O roteiro histórico da primeira fatia descreve GitNexus útil no clone. O `AGENTS.md` fornecido para esta tarefa proíbe GitNexus e manda usar `repo-graph`/`graph-search`. Este registro segue a instrução atual e não altera a SPEC histórica: o critério de grafo fica pendente até que as ferramentas compatíveis estejam disponíveis e o responsável alinhe a fonte normativa. Não consultar ou usar GitNexus como substituto.

Para acesso de LionClaw ao Maestri, a execução deve ler `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` e usar os helpers existentes. Isso deve ser registrado como `wire`, distinto do terminal-âncora e da conexão nativa do produto. Não inferir indisponibilidade do Wire pela ausência de `MAESTRI_PIPE` no shell externo.

## Higiene das evidências

Registrar comandos/rotas, horários, versão, IDs correlacionados, resultado e limites. Redigir antes de salvar. Não anexar token, cookie/CSRF, bootstrap, transcript, banco integral, checkout, índice Git, caches ou conteúdo integral do projeto. Evidência binária aprovada (por exemplo, screenshot) recebe caminho relativo, bytes e SHA-256 depois de sanitizada. Evidências anteriores não são sobrescritas.
