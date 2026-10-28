# Nova fábrica de software

Controlador local com persistência, proteção HTTP, operações consultáveis, cadastro/catálogo de projetos e configuração global/por projeto com perfis exatos e revisões imutáveis. A cobertura das sprints e as interfaces disponíveis estão em [SPEC_PROGRESS.md](SPEC_PROGRESS.md).

Para instalar e operar, consulte o [manual local](docs/operation/README.md), que cobre modos ICR/Commit/PR, diretórios, recuperação, notificações locais, pausa e encerramento. As notificações do navegador são opcionais e as pendências continuam disponíveis na interface.

## Requisitos e instalação

Node.js **24.x** e npm. Execute os comandos na raiz deste repositório canônico, em PowerShell. As versões diretas são exatas em `package.json`; `package-lock.json` fixa a árvore resolvida. O driver SQLite inclui binário nativo para as plataformas distribuídas pelo pacote; esta execução foi validada no Windows com Node 24.20.0.

Operações Git exigem **Git 2.45 ou posterior**, com suporte a `--no-lazy-fetch`; versões anteriores são recusadas pelo detector para impedir fetch implícito. Falhas de execução/configuração são distintas de autoria ausente. Criação falha antes de qualquer efeito permite revisar e confirmar outro plano para o mesmo destino, preservando o histórico; criações com efeitos iniciados ou incertos continuam reservadas.

```powershell
npm.cmd ci --cache .cache/npm --no-audit --no-fund
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:http
npm.cmd run test:acceptance
npm.cmd run build
npm.cmd run test:compiled
npm.cmd run test:execution-compiled
npm.cmd run test:distribution
```

No PowerShell que bloqueia scripts `.ps1`, use `npm.cmd` no lugar de `npm`. O cache explícito mantém a instalação dentro do workspace mesmo quando o ambiente define outro cache. Não é necessário instalar ferramentas globalmente nem executar setup de scaffold.

O launcher padrão (`npm start`) habilita a política de criação por plano confirmado, sem exigir argumentos de executáveis. Revisar o plano não cria recursos; os efeitos dependem da confirmação explícita. Se Git aparecer com escolha pendente, valide e salve um executável em Configuração e reinicie o controlador para aplicar a seleção.

`npm test` usa Vitest em modo não interativo, Fastify inject e SQLite temporário. O setup bloqueia conexões de rede e subprocessos; não chama providers, Maestri, terminais ou GitHub. `test:compiled` usa HTTP/SSE loopback real, porta efêmera e diretório/cwd temporários. Verifica shutdown, concorrência com outro processo Node e liberação do lock depois de término abrupto do processo criado pelo próprio teste. Nenhum dos comandos executa Git/GH.

### Playwright MCP no OMP para revisão web

Revisões com critérios de interface exigem Playwright MCP e Google Chrome instalado no host executor, conforme [INTEGRACAO-MAESTRI-OMP.md, seção 4](INTEGRACAO-MAESTRI-OMP.md#4-mcps-e-ferramentas). Ter Playwright disponível no chat do operador não o disponibiliza automaticamente às sessões OMP da fábrica.

Na configuração de usuário do OMP, `~/.omp/agent/mcp.json`, acrescente a entrada abaixo ao objeto `mcpServers`, preservando os demais servidores e configurações:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.83",
        "--browser",
        "chrome",
        "--isolated",
        "--allow-unrestricted-file-access"
      ]
    }
  }
}
```

Node.js/npm devem estar acessíveis ao OMP para executar `npx`. A versão acima foi validada em 19/10/2026. `--isolated` usa um perfil de teste separado do navegador pessoal; `--allow-unrestricted-file-access` permite abrir páginas por `file://`, necessário para critérios que exigem HTML local sem servidor, e também permite acesso a arquivos fora das raízes do workspace.

Em `~/.omp/agent/config.yml`, configure:

```yaml
browser:
  enabled: false
```

O OMP 18.11.1 suprime servidores de automação como Playwright MCP quando o navegador nativo está habilitado. Desabilitá-lo permite carregar o MCP exigido pelo Revisor. Se houver perfil OMP nomeado ou diretório de configuração personalizado, aplique as entradas na configuração efetivamente usada pelo executor; não apenas na do chat do operador.

Novas sessões carregam a configuração. Em sessões existentes, execute `/mcp reload` e confira `/mcp list`: `playwright` deve aparecer conectado. Antes de uma revisão real, confirme abertura de HTML, inspeção do conteúdo renderizado e screenshot pelo MCP, fechando o navegador de teste ao terminar. A configuração foi validada com 25 ferramentas descobertas no OMP e abertura de HTML local no Chrome isolado; isso comprova o ambiente, não aprova entregas anteriores nem inicia outra tentativa.

Referências de configuração: [OMP MCP](https://github.com/can1357/oh-my-pi/blob/main/docs/mcp-config.md) e [Playwright MCP](https://github.com/microsoft/playwright-mcp).

## Inicialização e distribuição

```powershell
npm run build
npm run package:local
npm run test:distribution
```

O pacote completo é gerado em uma pasta nova `build/Fábrica distribuição-<id>`, com dependências de produção, bundle, migrations, contratos e recursos. É específico ao SO/arquitetura/ABI nativa registrados em `distribution.json`. Consulte o [manual de operação e recuperação](docs/operation/README.md) para preparar o terminal-âncora, atualizar e recuperar pendências.

Dentro de um terminal Maestri autorizado, execute `npm.cmd start` sem caminhos obrigatórios. O launcher detecta Git, Maestri, OMP, PowerShell e GitHub CLI no host atual, revalida preferências salvas e permite seleção nativa quando não houver candidato único. Preferências de caminho não confirmam a conexão Maestri nem concedem keyring/elevação. O controlador abre configurações e wizard mesmo quando ferramentas estão indisponíveis; bloqueia somente operações que dependem delas. `GET /api/v1/settings/tool-options` retorna candidatos validados e a conexão Maestri separadamente. O contexto herdado é usado como encontrado, sem login ou credenciais em argumentos. Lock, configuração, migrations e recursos válidos precedem scheduler/HTTP. `startController(hostContext)` continua sendo a composição confiável para autorizações/capacidades nativas delimitadas.

O processo executa JavaScript compilado em `dist/`. Recursos resolvem por runtime. O health check técnico é `GET http://127.0.0.1:4310/api/v1/health`, com resposta `{ "status": "ok" }`; verifica SQLite sem comprovar provider/MCP. Ctrl+C/SIGTERM revoga sessões/canais e coordenação, encerra esperas e fecha HTTP/banco/lock. Restart conserva histórico e interrompe trabalho incompleto sem restaurar agentes. O smoke de distribuição usa pré-voo controlado; não é prova de Maestri/OMP real.

Estão disponíveis `POST /api/v1/session`, `GET /api/v1/operations/:operationId`, `GET /api/v1/events`, `GET /api/v1/events/stream` e as rotas de projetos/configuração descritas abaixo. O bootstrap exige Origin exato, Host configurado, `Content-Type: application/json`, `X-Factory-Client: web` e `{}`. Emite cookie HttpOnly de sessão e CSRF independente, mantidos somente em memória. Leituras operacionais/SSE exigem cookie; mutações também passam pelo controle global de JSON/Origin/CSRF. CORS permanece fechado. A sessão técnica não autentica pessoa nem concede autoridade GitHub.

Os contratos comuns públicos usam snake_case: sessão `{csrf_token,instance_id}`, erros com `request_id/field_errors/operation_id/affected_requirements`, operações com `operation_id/status_url/request_id` e recibos com `event_cursor`. Páginas `Page` usam `next_cursor/has_more/event_cursor`; capacidades usam `reason_code` e medidas indisponíveis usam `affected_requirements`. `FactorySettings`, `TimeDefaults`, `ArtifactPolicy` e seus patches globais também usam as chaves públicas da SPEC §3.2. Objetos fechados recusam aliases camelCase. Settings, cadastro, catálogo, configuração/opções de projetos e preparações também usam snake_case de ponta a ponta, incluindo `profile_changes`, `project_changes`, `global_changes`, `base_branch`, `github_project`, `effective_configuration`, escolhas e origens. Queries usam `owner_id/owner_kind/github_project_id/status_field_id`; paths `:projectId/:preparationId` e navegação legada conservam os identificadores. Os DTOs aninhados de issue desta família são projetados explicitamente; os modelos internos do adapter GitHub permanecem próprios. Os documentos privados versionados de configuração, captura e recibos conservam as chaves originais, por codecs explícitos de storage; leituras não reescrevem histórico, fatos ou conteúdo do operador.

`GET /api/v1/settings/execution-options` solicita uma observação nova ao OMP instalado usando `omp models --json`. `loaded` representa todos os modelos `chat` selecionáveis retornados pelo runtime atual depois de validar a resposta completa; falha, vazio, duplicidade ou linha incompatível resulta em `unavailable`. `thinking: null` vira `efforts: []` e perfis persistem `effort: null`; o lançamento omite `--thinking` nesse caso. A consulta não recruta agentes nem chama inferência, e a versão OMP é metadado, sem faixa fixa.

O lock local é adquirido antes de abrir o banco principal e independe da porta. Usa a trava do sistema operacional sobre `<raiz da instalação>/var/factory/controller-lock.sqlite`, separado do banco de domínio; não depende de PID, expiração ou remoção de arquivo residual. A raiz da instalação determina o armazenamento e sua exclusão local. Outra instalação independente não participa desse lock. Várias UIs compartilham o worker existente. O vínculo inicial da conta observada continua pendência de produto (`PF-06`); não há procedimento de seed SQL para contorná-lo.

Limites efetivos: corpo 16 KiB; headers 8 KiB e 64 campos; 128 conexões e 128 sessões por processo; 100 requisições por socket; 60 bootstraps e 600 requisições por minuto por instância. Timeouts: conexão/headers 10 s, recebimento/handler 15 s, keep-alive 5 s e espera SQLite 5 s. Não são SLAs. O limite de sessões recusa novas entradas com 503 e preserva as existentes; não há TTL nem expulsão silenciosa. Reiniciar revoga todas as sessões.

Eventos usam páginas de 25, máximo 100, com cursor de continuação ligado à instalação/conta/filtros/ordem e ao teto da primeira página. Os filtros `operation_id`, `project_id` e `attempt_id` podem ser combinados; os vínculos são validados no servidor. Novos eventos não entram na continuação de uma página antiga. SSE usa `cursor` sequencial e `Last-Event-ID` prevalente, com `resync` quando a sequência é inválida ou não pode ser recuperada. Há 8 streams por processo, 2 por sessão, buffer de 16 KiB, polling de 1 s e duração máxima de 60 s; o cliente reconecta usando a última sequência recebida, deduplicando por `seq`. Desconexão e revogação encerram o stream, sem efeito de negócio. `event_cursor` da página é o cursor sequencial do snapshot, distinto de `next_cursor` da paginação. O evento paginado contém `seq/entity_type/entity_id/entity_revision/occurred_at_ms/operation_id/event_type`. O JSON do frame `controller-event` é distinto: `{entity:{type,id},revision,operation_id,event_type,project_id?,attempt_id?,facts}`; a sequência fica no campo SSE `id:`. O cliente valida o schema compartilhado do frame antes de deduplicar/avisar seus consumidores.

### Operação e diagnóstico contextual

`GET /api/v1/operation?project_id?` retorna conta configurada/observada, identidade técnica local para suporte, automação e pausa, tentativa ativa e contagem, até cinco candidatos observados, cinco resultados recentes, impedimentos e observação da integração nativa. Dados e `event_cursor` são lidos no mesmo snapshot SQLite, sem Git/GitHub/preflight, checkout, diff, transcript ou documentos completos de resultado. Os candidatos usam somente elegibilidade/ordem efetivamente registradas nas novas observações completas do scheduler; ciclos históricos sem esses fatos não são promovidos. `candidate_observation.requires_revalidation` é sempre true: essa lista histórica leve não concede despacho nem substitui GET /queue. O indicador de integração traz a observação não paga com timestamp/causa, nunca afirma prova de provider ou MCP. Wire não é conexão do produto.

`GET /api/v1/diagnostics?scope=host` consulta fatos existentes e quatro relatórios recentes. Para `project`, `creation` e `attempt`, forneça também `id` UUID do contexto. Não combine ID com `scope=host`. Cada diagnóstico contém `check`, `state`, `code`, `cause`, `affectedRequirements`, `facts`, `recovery` e `observedAtMs`.

`POST /api/v1/diagnostics` usa o mesmo contexto em query, body `{ "checks": ["configuration", "github_identity"] }`, sessão/Origin/CSRF e `Idempotency-Key` UUID. Retorna 202/Location/recibo somente após intenção, vínculos, operação e evento confirmados atomicamente. Consulte `/operations/:operationId` e GET /diagnostics; não repita o POST quando a resposta for incerta. Ordem dos checks não muda a identidade semântica. Replay recupera a operação original antes de novo IO. Contexto alterado durante a verificação não recebe confirmação atual.

| Contexto | Checks suportados |
| --- | --- |
| host | configuration, github_identity, maestri_context |
| project | configuration, github_identity, maestri_context |
| creation | configuration, github_identity, resources |
| attempt | configuration, github_identity, maestri_context, resources |

Configuration consulta configuração/vínculos locais; github_identity consulta o adapter autorizado, preservando indisponibilidade/rate limit/conta divergente; maestri_context chama somente o preflight nativo não pago. Resources verifica registros de etapas, ownership e acompanhamento existentes, com incerteza explícita: não afirma parada física, integridade de arquivos ou acesso remoto. Ausência de perfil, credencial, contexto ou acompanhamento recebe causa/recuperação; não cria recursos de teste, não recruta, não chama provider e não altera credenciais/ACLs ou autoridade.

Migration 018 acrescenta `diagnostic_runs` STRICT com FKs, guards e índices, além dos fatos mínimos de elegibilidade/ordem em `queue_cycles`; versões anteriores são preservadas. Resultado e evento de conclusão são atômicos; erro SQL não confirma a verificação. Há até oito verificações por processo e uma pendente por contexto. Reinício preserva recibos/relatórios e marca incompletos como `unknown`/`DIAGNOSTIC_INTERRUPTED`, sem replay. `succeeded` na operação significa que a consulta terminou e foi persistida; o relatório pode conter checks blocked/unavailable. Nenhum diagnóstico confere autoridade para executar/publicar.

## Configuração

As variáveis de [.env.example](.env.example) são lidas do ambiente do processo, sem carregamento automático de `.env`. Se desejado, o Node 24 pode carregar um `.env` local com `node --env-file=.env scripts/start-host.mjs`, após o build. Os cinco CLIs são detectados sem argumentos obrigatórios. Preferências de Git, Maestri, OMP e PowerShell ficam em `tool_preferences_json`; o caminho GH permanece somente em `gh_executable_path`. `GET /api/v1/settings/tool-options` revalida candidatos, enquanto `GET /api/v1/settings/github-options` observa separadamente autenticação GitHub. Nunca preencha o exemplo versionado com segredos.

| Variável | Default e validação |
| --- | --- |
| `NODE_ENV` | `production`; aceita `production`, `development`, `test` |
| `FACTORY_BIND_HOST` | `127.0.0.1`; somente `127.0.0.1` ou `::1` |
| `FACTORY_PORT` | `4310`; inteiro de 1 a 65535 |
| `FACTORY_BROWSER_ORIGIN` | Origem HTTP exata de host/porta; divergência impede startup |
| `FACTORY_LOG_LEVEL` | `info`; níveis Pino ou `silent` |

O banco fica obrigatoriamente em `<raiz da instalação>/var/factory/factory.sqlite`, em disco local, independentemente do cwd. `FACTORY_DATA_DIR` é ignorada. Configuração persistida e HTTP não mudam esse caminho. Ambientes, Git retido, evidências e lock usam `var/factory` nessa instalação; nenhum caminho pessoal é distribuído. Banco e cache estão ignorados. Não compartilhe o arquivo por rede nem remova WAL/SHM manualmente.

## Organização e evolução

Um único pacote npm evita links de workspaces no Windows. O código preserva a organização normativa: `apps/controller/src`, `packages/contracts/src` e módulos com interface pública em `index.ts`. O import privado `#contracts` resolve os schemas fonte durante o typecheck e JavaScript compilado em produção.

`npm run lint` aplica regras estáticas com a AST TypeScript: sem `any` explícito, sem supressões, sem SQL/driver fora de storage, sem imports de internos de outro módulo ou IO/runtime em contracts. É um check de arquitetura e convenções, não um formatador.

Novas migrations são SQL incrementais em `storage/migrations`, com entrada ordenada em `loadMigrations`. Não edite migrations já aplicadas: checksum divergente interrompe a abertura. O ledger, `application_id` e `user_version` devem coincidir. A migration 032 versiona a composição efetiva dos perfis; conteúdo legado que excede o limite fica preservado, sem versão efetiva, e bloqueia novos usos até edição explícita. Falha de migration reverte schema/ledger/seed; banco desconhecido, mais novo ou corrompido é recusado, sem fallback para banco vazio.

Novas tabelas e operações entram nas sprints consumidoras. Atualize `SPEC_PROGRESS.md` em toda sprint com fontes, comandos reais, interfaces, provas e pendências.

## Adapter Maestri/OMP

`modules/execution/index.ts` disponibiliza `createExecution`, `startPassage`, `observe`, `getResult`, `answerQuestion`, `cancelAttempt` e `interactionSurface`. O adapter usa uma extensão na própria TUI OMP, handshake com perfil exato e canal privado de resultado/pergunta. Os recursos versionados distribuem schemas técnicos por papel; suas instruções comportamentais v1 são usadas pela migration para compor `guidance` e não são acrescentadas como prompt oculto depois dela. O pipeline compõe o adapter com a persistência SQLite de tentativas/passagens/resultados; o início manual está descrito abaixo.

Consulte [composição, limites e decisão do transporte](docs/integration/maestri-omp-adapter.md). OMP conferido: 18.11.1; preflight não chama provider. `npm run test:execution-compiled` faz prova local de loopback UTF-8/EOF e argv/cwd no PowerShell com Node como fixture, sem provider ou recrutamento. Integração Maestri/OMP real e abertura nativa no host permanecem para a sprint 018 autorizada. Não configure credenciais, contexto Wire ou bootstrap do executor pelo navegador.

## Consultas GitHub e inspeção de origens

As interfaces públicas são `createGitHub` em `modules/github/index.ts` e `createWorkspaces` em `modules/workspaces/index.ts`. O módulo `projects` compõe esses serviços no cadastro/configuração; não há despacho nesta sprint.

`createGitHub()` sem contexto retorna `context_unavailable`. O host autorizado fornece `context:{kind:'windows_keyring',executable,cwd}`, com caminhos absolutos para o GH instalado e diretório de execução. Essa declaração pertence à composição confiável do host, não a um body HTTP, variável de ambiente ou detecção de binário no PATH. Ela não eleva o processo nem comprova autenticação: `getIdentity()` consulta a conta efetiva. `startController({github?,git?,execution?})` exige pré-voo nativo antes de compor o worker; sem argumentos falha com `CONTEXT_MISSING`. Não forneça esse contexto em um runtime sem acesso autorizado ao keyring. Não houve prova real de keyring neste ambiente.

Métodos: `getIdentity`, `getProjectOwner(id)`, `listRepositories`, `getRepository({owner,name})`, `resolveBranch(reference,branch)`, `listProjects({kind:'user'|'organization',login})`, `getProject(id)`, `validateProjectSelection({id,statusFieldId,statusOptionIds})`, `listProjectItems(id)` e `getIssueContext({owner,name,number})`. Retornam `{state,data,diagnostics,retryAtMs}`. Somente `complete` representa leitura integral; dados de `partial` não habilitam despacho. IDs externos são strings e não são convertidos para números. Um ID não localizado permanece ausente/inacessível: a API pode ocultar a distinção por permissão.

As consultas paginam separadamente repositórios, Projects, campos, itens, comentários, responsáveis, bloqueadores, vínculos e valores de campos. O contexto carrega comentários completos sob demanda, sem inferir critérios de aceite deles. Referências são extraídas do corpo e dos comentários; bloqueadores estruturados vêm de `blockedBy`. PRs/drafts são identificados sem execução. `assessIssueReadiness` verifica a observação atual por IDs de conta/repositório/Project/Status, responsabilidade exclusiva, issue aberta e bloqueadores; seu resultado não é uma autorização durável. Preparação e publicação futuras devem repetir as consultas.

GH recebe somente queries GraphQL fixas por JSON em stdin, sem shell ou segredos em argv. Não há login, alteração de credenciais, atribuição de responsáveis, criação de campos ou mudança de Status. Paginação inválida, referência inacessível, limite excedido e falha intermediária produzem diagnóstico. Rate limit mantém cooldown compartilhado entre consultas do adapter e respeita o maior prazo fornecido por Retry-After/reset; sem prazo utilizável, aguarda 60 s, sem repetir automaticamente. Não há cache de identidade/autoridade.

Limites técnicos: 100 objetos por página; 100 páginas por conexão; 250 chamadas e 16 MiB de respostas por operação; 4 MiB e 15 s por subprocesso. Excesso produz leitura parcial/indisponível, nunca um resultado completo truncado. São limites de recursos, não SLAs. Stderr e exceções nativas não são retornados, registrados ou persistidos; diagnósticos contêm códigos e recuperação fixos.

`createWorkspaces({github,context?})` recebe contexto Git separado `{kind:'windows_keyring',executable}`. `inspectOrigin({source:{kind:'local'|'github',location},baseBranch,remoteName?})` identifica origem por propriedades Git/URL e ID remoto, preserva a origem e retorna base SHA e pré-requisitos. Caminho local deve ser absoluto e acessível; a raiz é resolvida em runtime. HTTPS/SSH de `github.com` são aceitos; URL com credencial, query ou fragmento é recusada sem ecoar o valor. Vários remotos/URLs exigem escolha explícita, sem preferência silenciosa por `origin`. Remoto ausente permite identificar cadastro local, mas não habilita execução. Project e vínculo da issue continuam obrigatórios na preparação.

A inspeção local usa apenas `rev-parse`, `status --porcelain=v2 -z` e leitura de configuração. Desabilita refresh opcional do índice, lazy fetch, fsmonitor e prompts; remove seletores Git herdados que desviariam o cwd. Não faz fetch, stash, reset, commit ou limpeza. Base local é a branch exata em `refs/heads`; divergência de SHA remoto é informada. Mudanças dirty ficam fora da futura tentativa. A inspeção não grava SQL, checkout, índice, caches ou snapshots.

A suíte padrão usa respostas controladas e processos falsos. A fixture de filesystem compara bytes/índice/HEAD antes/depois, sem executar Git. Prova com Git temporário real, ajuda das versões instaladas e consulta GitHub real precisam do contexto autorizado com keyring; não foram executadas neste runtime. Documentação de referência: [GH API](https://cli.github.com/manual/gh_api), [GraphQL Projects](https://docs.github.com/en/graphql/reference/projects), [GraphQL Issues](https://docs.github.com/en/graphql/reference/issues) e [Git status](https://git-scm.com/docs/git-status), consultadas via Context7/documentação oficial.

## Projetos e configuração persistida

Todas as rotas abaixo usam `/api/v1`, sessão técnica e `no-store`. POST/PUT exigem JSON, Origin e CSRF, além de `Idempotency-Key` UUID criado pelo cliente. PUT exige o ETag da leitura correspondente em `If-Match`.

| Rota | Contrato |
| --- | --- |
| `GET /projects?search=&limit=&cursor=` | Resumos com identidade, origem, revisão e pré-requisitos; página de 25, máximo 100. Busca literal por nome; ordenação SQLite `NOCASE` por nome e desempate por ID. |
| `POST /projects` | `{name,source:{kind:'local'|'github',location},base_branch}`; `201`, Location, ETag e operation_id durável. Origem passa por `workspaces.inspectOrigin`. Local sem remoto é permitido. |
| `GET /projects/:projectId` | `{project,prerequisites,eventCursor}`, ETag do projeto. |
| `GET /settings` | `{settings,profiles,eventCursor}`, com `composition_version` de cada perfil; ETag composto de settings, IDs/revisões e versões de composição. |
| `PUT /settings` | `{changes,profile_changes?}`; gravação única, novo ETag, operation_id e receipt. |
| `GET /projects/:projectId/configuration` | `{configuration,settings,profiles,prerequisites,eventCursor}`, ETag composto também com projeto/revisão corrente. |
| `PUT /projects/:projectId/configuration` | `{project_changes,global_changes?,profile_changes?}`; confirma nova revisão imutável, ponteiro, globais explícitos, perfis, índice da operação e evento na mesma transação. |
| `GET /projects/:projectId/configuration-options` | `owner_id?,owner_kind?,github_project_id?,status_field_id?,cursor?,limit?`; Projects pessoais/organizacionais, campos/opções, perfis, completeness, diagnostics e retry_at_ms. Permite consultar uma seleção ainda não salva. |

O cadastro gera UUID próprio e uma revisão inicial obrigatória, mesmo com nome/pasta repetidos. Não clona, recruta ou altera a origem. A FK composta vincula ponteiro, projeto e número de revisão; guards impedem UPDATE/DELETE do histórico. Pré-requisitos são observações/configuração, incluindo aviso de dirty excluído; preparação ainda precisa revalidar conta, remoto, issue/Project, base e executor. Consultar um Project não seleciona uma conta persistida nem concede autorização.

O cursor do catálogo vincula instalação, conta, busca e ordenação; fixa o limite superior das inclusões visíveis na primeira página. Não carrega checks, guidance, conteúdos do repositório, índice ou HEAD. O cursor de opções também vincula configuração, seleção e conjunto remoto: mudança exige recarregar a primeira página com `409 OPTIONS_CHANGED`, sem truncamento silencioso. Leitura remota parcial/indisponível é explícita.

`project_changes` cobre origem/base, Project e owner por node ID, campo single-select e opções distintas `ready/in_progress/in_review/delivered`, perfis dos dois papéis, checks, correções, modo, automação, ordem e guidance. Mapeamento não nulo precisa ser completo, acessível e validado por `github` antes de gravar. `queue_order` usa `{use_board_position:boolean}`; a fila ordena projetos por ID e aplica posição do quadro, número e ID conforme a configuração e a leitura completa dos itens. Checks usam `{id,command,cwd_relative,timeout_ms?}`; IDs distintos e cwd relativo sem escapes. Cada novo projeto começa com correções 2 (0–5), modo `icr` e automação desligada.

`changes/global_changes` editam raiz dos projetos, automação e defaults separados de tempo e artefatos. Omissões, inclusive dentro de defaults/queue_order, são preservadas; listas fornecidas são substituições explícitas. O hostname é capturado internamente; host, diretório de dados e Workspace Maestri ID não são editáveis. A execução continua validando o contexto Maestri herdado. Intervalo de consulta e tempo ativo aceitam inteiros de 1 a 2.147.483.647 ms; defaults de 15.000 e 1.800.000 ms. TTL permanece separado, com zero configurado distinto de não configurado. Não há tetos financeiros ou de tokens de inferência. Artefatos mantêm `automatic_deletion:false`.

Diretórios informados são resolvidos relativamente ao diretório de dados do bootstrap ou como absolutos, canonicalizados e conferidos como diretórios locais acessíveis para leitura/escrita; erro não confirma gravação. A raiz dos projetos afeta novos projetos; os caminhos operacionais da instalação são fixos. Atualização preserva `var/factory`; migração física entre instalações permanece procedimento separado.

`profile_changes` é uma lista de perfis completos `{id?,name,executor:'maestri-omp',provider,model,effort,guidance}`; `composition_version` é do servidor e não pode ser definido no comando. ID ausente cria um perfil com UUID do servidor e versão de composição 1; ID existente edita por CAS, sem resetar os demais. ID desconhecido recebe 404; duplicado recebe 400; capacidade total 100. Valores são preservados exatamente, sem provider/modelo/esforço demonstrativos ou fallback. Selecione perfis pelos IDs retornados. Não há exclusão de perfil referenciado.

ETags são opacos. Ausência gera 428; revisão alterada gera 412; chave reutilizada com conteúdo/precondição/escopo diferentes gera 409. Repetição idêntica recupera o recibo antes de CAS, validação remota ou acesso a diretórios; a resposta inclui a leitura atual do mesmo recurso e o recibo original. Comando sem mudança efetiva retorna `409 NO_CHANGES`. A interface oferece formulários de configuração global e por projeto, preserva rascunhos em conflito e orienta consultar uma operação quando a resposta fica incerta.

Interface de serviço: `createProjects({storage,github,workspaces,directoryBase})`, em `modules/projects/index.ts`, oferece `registerProject/listProjects/getProject/getSettings/saveSettings/getConfiguration/saveConfiguration/getConfigurationOptions`. IO remoto/filesystem antecede SQL. `storage` expõe leituras editáveis `{view,etag}`, gravações tipadas e recuperação idempotente; não oferece conexão/transação pública. TypeBox e tipos estão em `packages/contracts/src/projects.ts`, reexportados por `#contracts`; schemas comuns ficam em `base.ts`.

Provas locais incluem SQLite real, HTTP inject, rollback em cada ponto da gravação agregada, duas abas, corrida durante IO, idempotência, histórico e migração real 2→3. O smoke compilado exercita settings/CAS/idempotência e catálogo por HTTP loopback real, além de SSE/shutdown/lock. Um ensaio anterior controlou a resolução de `realpath` por `EPERM`; a Sprint 043 acrescentou a prova separada de distribuição Unicode e correção manual de ferramentas registrada em [sprint043-gates.md](docs/operation/sprint043-gates.md). Esses cenários não equivalem a uma prova irrestrita de canonicalização para todos os diretórios.

## Scaffold local, remoto e reconciliação

O backend mantém leituras compatíveis com criações históricas, mas a escrita pública oferece somente `remote_push`: remoto GitHub, push do commit inicial e quadro Kanban completo são obrigatórios. As rotas usam sessão técnica; os POSTs exigem JSON, Origin, CSRF e `Idempotency-Key` UUID. Alvos remotos precisam de autorização específica na composição confiável do host.

| Rota | Contrato |
| --- | --- |
| `GET /api/v1/scaffold/options` | Catálogo e a única modalidade de escrita `remote_push`, com capacidades e pré-requisitos atuais. |
| `POST /api/v1/scaffold/plans` | Exige `name`, `board_name`, `creation_mode:'remote_push'`, branch, template, destino e `remote:{owner_id,name,visibility}`. Retorna um `HttpScaffoldPlanV3` completo e seu hash sem criar diretório, Git ou remoto. |
| `POST /api/v1/scaffold/creations` | Exige `{plan_hash,plan,authorized:true}` V3. Revalida todo o plano e confirma intenção, creationId, operação e evento antes dos efeitos. Retorna `202 OperationAccepted`, com `resource:{type:'creation',id}` e Location. |
| `GET /api/v1/scaffold/creations/:creationId` | Lê etapas, efeitos e recibos, quadro/nome/URL comprovados, próxima ação, diagnóstico, pré-requisitos e ETag; não executa efeitos nem lê arquivos do projeto. |
| `POST /api/v1/scaffold/creations/:creationId/reconcile` | `{}` com ETag da criação. Retorna `202 OperationAccepted`/Location, reconciliando efeitos incertos pela identidade e reutilizando os confirmados antes de qualquer continuação. Não recebe attemptId/deliveryId. |

Configure `projectsRoot` em settings. O destino é relativo a essa raiz e seu pai deve existir; o destino final deve ser novo. Caminhos absolutos, escapes, nomes Windows reservados, links/junctions e alteração de identidade dos diretórios são recusados. O plano vincula instalação, ETag agregado de configuração, conta observada, template, metadados dos arquivos, branch, engenharia, destino e efeitos. Mudança inicial exige outro plano; não há assinatura de autoridade permanente. Mesmo sem contexto Git é possível planejar, com o pré-requisito explícito; criar exige o contexto confiável de `startController({git,...})`, que não pode vir de HTTP ou ambiente.

`resources/templates` contém o catálogo e os textos de engenharia; o build os distribui em `dist/resources/templates`, resolvidos por `import.meta.url`. Não dependem de skills pessoais. O template gera tracker GitHub, regras de consumo de glossário/ADRs e apontadores em `AGENTS.md`, preservando instruções e seções existentes do template, inclusive quando há `CLAUDE.md`. `triageEnabled` representa a escolha de usar a skill de triagem já disponível no ambiente dos agentes; habilite somente quando aplicável. A escolha inclui o vocabulário e seu apontador no plano. Nenhuma skill ou label é instalada/criada. `.gitignore` exclui credenciais conhecidas e saídas geradas e conserva exemplos `.env*.example`; isso não é um scanner universal de segredos.

O catálogo valida também os caminhos acrescentados pela engenharia, com triagem ligada e desligada: colisão entre arquivo e diretório, inclusive por diferença de maiúsculas no Windows, recusa o template antes da intenção ou criação do destino. Os apontadores reconhecem títulos ATX e Setext, preservam exemplos em blocos de código e recusam seções de engenharia duplicadas. As exclusões obrigatórias ficam após as regras do template para prevalecer sobre exceções anteriores; exemplos `.env.example` e `.env.*.example` continuam versionáveis.

O destino é reservado exclusivamente. Etapas directory/files/git/baseline são registradas antes/depois; baseline usa `chore: initialize project`, identidade técnica `Factory <factory@localhost>`, branch escolhida, hooks/templates vazios e configuração Git global/sistema desabilitada para essa operação. SHA, ref, ausência de parent e estado limpo são conferidos antes do push. O Project obrigatório recebe o `board_name` do plano, exatamente as opções Backlog, Ready, In progress, In review e Done nessa ordem, vínculo ao repositório, view `Kanban` em layout `BOARD_LAYOUT` e agrupamento/coluna visível por Status verificados por releitura. O mapeamento V3 é salvo no cadastro; cadastro e conclusão são atômicos. Perfis ficam ausentes, automação desligada e nenhum agente ou issue é iniciado.

Falha conserva arquivos, Git, baseline conhecido, efeitos confirmados e sua próxima ação. Uma etapa cujo resultado não pôde ser gravado permanece incerta; replay recupera o recibo e não repete criação. Restart converte operações de quadro interrompidas em incertas; E57 as reconcilia antes de continuar. Efeitos de quadro seguem o diário específico `creation_board_operations`, e efeitos remotos de repositório/origin/push usam `effects`. A conclusão exige os três efeitos remotos e os cinco tipos de quadro confirmados. Há no máximo oito criações/reconciliações acompanhadas por processo. SQL guarda plano por metadados, referências e estado, sem bytes do template/projeto, índice, caches ou cópias de checkout.

`ControllerHostContext.scaffoldAuthorization` contém `accountId` e `targets:[{ownerId,name,visibility,allowPush}]`. O host fornece autorização delimitada aos adapters GitHub e Git; ela não vem de HTTP, variável de ambiente ou PATH e não eleva processos. Conta, configuração e recursos são revalidados antes de cada efeito. Planejamento e pré-envio consultam todas as páginas de repositórios acessíveis do owner, respeitando os limites/cooldown GitHub existentes. Capacidades de quadro também são verificadas. Repositório existente é recusado; permissão insuficiente, leitura parcial ou resposta inesperada não comprovam disponibilidade.

O novo remoto recebe na descrição um marcador de instalação/criação/plano/operação. Confirmação e reconciliação conferem ID, owner, nome, URL, visibilidade, timestamp e marcador; nome semelhante não basta. O ID confirmado precede `origin`. Somente `remote_push` envia o baseline, com um refspec SHA→`refs/heads/<baseBranch>`, sem força, tags ou outros recursos. A confirmação exige releitura da ref/SHA remota. Git mantém o credential helper normal; configuração que redirecione o transporte é recusada.

`CreationView.effects` e `board_operations` oferecem registros duráveis e recibos; `remote_effects` inclui efeitos não iniciados ou não solicitados. `unknown` nunca é reenviado sem reconciliação. Planos V3 são schemas estritos e compartilham a forma entre planejamento, comando autorizado e leitura. Planos históricos sem `board_name` permanecem consultáveis com hash e conteúdo original; o nome só é exibido se um recibo de quadro o comprovar. O V3 não pode ser substituído por uma união permissiva de leitura.

Os testes de scaffold usam adapters controlados para Git/GitHub e não constituem prova externa. A validação técnica da alteração mais recente está registrada em `SPEC_PROGRESS.md`; integração Git/GH, criação/push reais e aceite integral AC-02/03/12 exigem prova no host e alvo autorizados.

## Cliente web

`npm run build` compila o controlador e o cliente React 18 para `dist/web`. O controlador serve essa pasta na mesma origem loopback; a página abre na Principal e não oferece formulário ou sessão humana. Os únicos destinos internos são `#principal/dashboard`, `#principal/projetos`, `#principal/fila`, `#principal/tentativas`, `#principal/registros` e `#principal/configuracao`; `#login` é normalizado para a Principal. Parâmetros permitidos guardam contexto de leitura e identificadores, não segredos ou rascunhos.

`apps/web/src/api/http.ts` serializa `POST /api/v1/session`, conserva CSRF somente na memória do módulo e usa caminhos relativos. Um `401` em leitura permite um bootstrap e uma nova leitura; um `401` após comando só renova a sessão e não repete o comando. `403` mantém diagnóstico visível, sem CORS ou bootstrap em loop. `AppShell` mantém um diálogo acessível compartilhado, com foco inicial, contenção de Tab, fundo inerte, Escape e retorno do foco. O dashboard, projetos, configurações e registros consultam rotas existentes; fila e tentativas exibem disponibilidade explícita até existirem contratos de leitura.

A composição e os tokens visuais seguem `docs/Docs20261016_073031/design/artifact.html` e `design-contract.json`: grafite/branco/laranja, seis destinos, breakpoints 950/650 px e densidade aprovada. Não houve inspeção visual automatizada nesta sprint; o build comprova a compilação e empacotamento, não o aceite visual Playwright/Chrome.

## Preparação de issue e ambiente independente

As rotas usam a proteção HTTP comum, sem iniciar processos. `POST/PUT` exigem `Idempotency-Key` e PUT também exige `If-Match` do GET da preparação.

| Rota | Comportamento |
| --- | --- |
| `GET /api/v1/projects/:projectId/issues?search=&limit=&cursor=` | Itens do Project configurado, com tipo, motivos e completude. PR/draft não são issues executáveis. O cursor vincula conta, instalação, configuração, busca e conjunto observado; mudança exige recarregar a primeira página. |
| `POST /api/v1/projects/:projectId/preparations` | `{issue_id,delivery_mode,guidance,overrides,previous_attempt_id?}`; retorna 201, Location, ETag, preparação e recibo durável. O node ID deve resolver para uma issue do repositório configurado. |
| `GET /api/v1/preparations/:preparationId` | `{preparation,event_cursor}` e ETag; consulta escolhas efetivas, origem dos valores, critérios, efeitos, base SHA, bloqueios e `summary_hash`. |
| `PUT /api/v1/preparations/:preparationId` | `{changes:{issue_id?,delivery_mode?,guidance?,overrides?}}`; CAS, nova revisão e recibo na mesma transação. Um objeto `overrides` fornecido substitui o conjunto anterior; `{}` remove os overrides. |

Overrides aceitam `base_branch`, `implementer_profile`, `reviewer_profile`, `checks`, `correction_limit`, `time_defaults` e `artifact_policy`. Perfil aceita `{kind:'reference',id,revision}` exatos ou `{kind:'value',profile}` completo. Defaults não são alterados. Configuração/perfis são materializados por valor no preview; guidance do perfil é a instrução comportamental efetiva, enquanto guidance de projeto/preparação permanece contexto separado. Credenciais reconhecidas são redigidas antes do resumo/captura. TTL ausente e zero configurado conservam seus estados. Novas preparações e capturas não registram tetos financeiros ou de tokens de inferência. A migration 021 remove cost_defaults_json; documentos históricos imutáveis conservam seus bytes, com projeção de leitura compatível sem aplicação de tetos. Alterar configuração do projeto requer salvar novamente a preparação para vincular a revisão atual.

O parser público `interpretIssue({title,body})`, em `pipeline/index.ts`, aceita seções Markdown `Critérios de aceite`/`Acceptance criteria` com listas, checkboxes opcionais e IDs `ac-N`. IDs explícitos são únicos sem distinção de maiúsculas; IDs gerados reservam todos os explícitos e seguem as ocorrências. Textos iguais permanecem critérios distintos. Comentários livres, exemplos em fences e comentários HTML não introduzem critérios. Título, objetivo/escopo e lista válida são obrigatórios; erro não produz um conjunto truncado executável. `github.getIssueContextById(id)` confere identidade antes e depois da consulta completa.

`createPreparations({storage,github,workspaces})` e seu tipo são públicos em `projects/index.ts`. Oferece `listIssues`, `createPreparation`, `getPreparation`, `updatePreparation` e `revalidateSummary({preparationId,preparationRevision,authorizedSummaryHash})`. A revalidação relê a observação e recusa mudança material com `409 SUMMARY_CHANGED`; alterações da preparação/configuração durante IO recebem 412. Qualquer save muda revisão/hash. O hash inclui issue/objetivo/critérios/referências/dependências, conta, base fixa, configuração efetiva, modo e efeitos. A revalidação não aceita início, não persiste autoridade e não substitui o gate transacional da futura sprint de tentativas.

Preparações persistem escolhas e seu histórico imutável, operação e evento. `storage.getPreparation/recoverPreparationCommand/savePreparation` não expõem SQL. Repetições recuperam a operação antes de CAS/validação de escrita e retornam o recurso atual com recibo original; montar a resposta atual consulta novamente os previews remotos. `GET /operations/:operationId` permite recuperar o recibo mesmo se a consulta remota do preview falhar após o commit. `previousAttemptId` ainda retorna 404: nenhum vínculo com tentativa inexistente é aceito antes da sprint consumidora.

`createWorkspaces({github,context?,dataDirectory?}).prepareAttempt({attemptId,issueNumber,source,baseSha})` prepara `<data>/work/<attemptId>/implementation` e branch `factory/<issueNumber>/<attemptId>`. O diretório de dados vem da composição confiável; o input não escolhe o destino. Exige contexto autorizado, ID UUID, SHA completo e pasta de tentativa nova. Clona com `--no-local --no-hardlinks --no-checkout`, sem shared/reference/alternates, e faz checkout da SHA fornecida somente no clone próprio. A origem recebe apenas leitura de raiz/commit, sem importar dirty. Hooks/templates do clone ficam desabilitados; gitdir/worktree são explícitos. Alternates, clone shallow, submodules, filtros de conteúdo e symlinks não suportados no Windows geram diagnóstico. Falha devolve recurso, ownership, base/branch e código sanitizado; preserva o recurso parcial e não adota uma pasta existente. Retentativa de uma execução usará outro ID.

O preview informa `can_start:false`: consultar/salvar uma preparação não concede autoridade nem inicia clone/processo. O comando de início abaixo revalida o resumo e persiste a intenção antes dos efeitos. As provas locais usam SQLite/HTTP inject reais e Git/GitHub/canonicalização controlados; clone Git real e integração Maestri/OMP continuam sem prova no runtime atual.

## Contratos HTTP de execução e entrega

Os schemas `Http*` de `packages/contracts/src/http-execution/`, reexportados por `#contracts`, definem a representação HTTP de tentativas, perguntas, recuperação, entregas, revisão e publicação. As rotas e o cliente web usam esses schemas; os nomes sem esse prefixo continuam descrevendo modelos internos e protocolos privados. Exemplos: `HttpAttemptDetail`, `HttpQuestion`, `HttpDeliveryDetail`, `HttpProducerResult` e `HttpEffectView`. As projeções campo a campo ficam em `http/execution-views.ts`, sem conversor genérico de chaves em runtime.

Requests, responses e queries dessa família usam exclusivamente snake_case, incluindo `project_id`, `round_id`, `delivery_id`, `content_identity`, `git_ref`, `scope_choice`, `plan_hash`, `delivery_receipt` e `authorized_mode`. Objetos fechados recusam aliases antigos, inclusive junto às chaves canônicas. Os parâmetros de path mantidos e a navegação por hash conservam seus nomes.

Capturas privadas, hashes semânticos de comandos, resultados oficiais, recibos e pareceres não são reescritos. `PassageRequest/PassageBinding`, transporte da extensão OMP, recursos de papéis e respostas externas GitHub conservam seus formatos suportados; somente suas projeções HTTP são normalizadas. `202` confirma aceitação durável; entrega da resposta, parada física e conclusão da publicação dependem dos seus próprios recibos e estados. Não há outro endpoint de início ou CRUD, nem reexecução da implementação para publicar.

## Início manual e resultado oficial durável

`POST /api/v1/attempts` recebe `{preparation_id,preparation_revision,authorized_summary_hash,authorized:true}`, `If-Match` da preparação e `Idempotency-Key` UUID. Exige sessão, Origin e CSRF. Retorna `202 OperationAccepted`, com `resource:{type:'attempt',id}`, recibo durável e `Location` de `/api/v1/operations/:operationId`, antes de aguardar clone/handshake. `GET /api/v1/attempts/:attemptId` retorna detalhe com ETag: fase, suspensão, resultado, tracking, passagem/rodada, diagnóstico, revisão, cursor e recibo do resultado. Não carrega captura ou evidências completas.

`GET /api/v1/attempts/:attemptId?section=profiles` carrega sob demanda as instruções efetivas capturadas dos dois papéis, revisão/versão, contexto resumido da issue e critérios e resumo do contrato técnico. Tokens conhecidos, credenciais em URLs, headers e chaves privadas são redigidos. Capturas antigas sem `composition_version` permanecem sem versão inferida.

`createPipeline({storage,preparations,execution,workspaces,observeTools,hostName?,logFailure})` é a composição pública em `pipeline/index.ts`. `startAttempt` refaz a observação de conta, issue aberta, assignee exclusivo, Ready, Project/owner/vínculo/Status, bloqueadores, remoto e base em todos os modos; usa automaticamente este computador. A transação IMMEDIATE repete CAS/configuração, deduplica por conta/repositório/issue e grava operação/recibo, tentativa, critérios, rodada 1, passagem implementadora e recursos planejados. IO externo ocorre antes ou depois dessa transação. Uma chave idêntica recupera o recibo antes de novas consultas ou efeitos; chave divergente retorna 409. Concorrência por issue retorna `ATTEMPT_ACTIVE` com referência à tentativa do escopo válido, inclusive entre cadastros duplicados. Início manual já consumido exige uma futura ação explícita de nova tentativa; não reinicia após falha/restart.

`AttemptCapture` (`formatVersion:1`) preserva por tentativa `preparationId/preparationRevision`, `summaryHash`, `accountId`, contexto completo da issue, `baseSha`, `configuration` efetiva com perfis por valor (ID/revisão/guidance/composition_version), `origins`, critérios por identidade e `criteriaDigest`. `roleResources` captura ambos os papéis com `id/role/version/path/sha256`. `tools` contém uma observação própria para `node/git/gh/maestri/omp`: `state/version/cause/affectedRequirements/observedAtMs`. Versão indisponível é `null`, com causa e requisitos pendentes; a tentativa fica suspensa por `TOOL_VERSION_UNAVAILABLE`, sem clone/provider. Contrato obrigatório ausente/ inválido impede despacho. Não há preflight pago, conteúdo de checkout, índice, cache ou transcript na captura.

Após o commit, o pipeline registra o início do ambiente e chama `prepareAttempt` com identidade e SHA capturadas. Confirma ownership/falha no journal, preserva recurso parcial e revalida autoridade/resumo antes de chamar `startPassage`. O port `storage.executionPersistence()` reserva a passagem, a sessão lógica por papel/tentativa e a ocupação exclusiva do terminal gerenciado. `managed_terminals`, `attempt_sessions` e `terminal_occupancies` guardam instalação, host, papel, posse e geração; o handshake registra IDs físicos e OMP observados antes de autorizar a tarefa. Outra tentativa usa diretório/sessão OMP próprios. Um terminal anterior só é reutilizado após confirmação física atual pelo `ExecutionHost.confirmStoppedTerminal`; sem essa capacidade, a fábrica preserva o terminal anterior e cria um terminal próprio novo. Reinício torna ocupações ativas incertas, sem lease ou restauração de sessão. Defaults ou recursos alterados não reescrevem capturas anteriores. Cancelamento durante clone conserva o recurso retornado e impede despacho posterior.

`ExecutionPersistence.acceptResult` aceita somente schema do papel, vínculo exato e todos os criterionIds capturados, únicos e com evidência/veredito. Grava hash canônico, UUID de recibo, resumo, resultados por critério, fase e eventos na mesma transação; só então o canal privado envia ACK. Repetição idêntica recebe o mesmo recibo, inclusive após reopen; outro hash conflita. Payload inválido, SQL busy ou falha em qualquer escrita não ocupa resultado/recibo e permite corrigir/repetir o payload. Resultado implementador move para `verifying`, mantendo resultado final nulo; a declaração do agente não aprova nem conclui a entrega. O mesmo port confirma revisão/achados/resoluções com a prova de independência descrita abaixo.

Migration 005 acrescenta tabelas STRICT `attempts`, `attempt_criteria`, `rounds`, `passages`, `resources`, `passage_results`, `criterion_results`, `passage_events` e `execution_questions`. FKs compostas impedem vínculos entre tentativas; guards preservam campos capturados, critérios, identidades e resultados aceitos. A migration 033 acrescenta identidade mínima da sessão por tentativa/papel e ocupações exclusivas, sem backfill de históricos; terminais gerenciados são compartilhados e não são removidos junto com um projeto. Fase, suspensão, tracking e resultado continuam eixos distintos. Pergunta pendente impede resultado; somente recibo de resposta libera sua suspensão. Restart marca tentativas incompletas como `interrupted`, preserva capturas/resultados e não restaura sessões nem agenda outro lançamento.

As provas locais incluem SQLite real, HTTP inject e adapter real com native/channel/bootstrap controlados, verificando commit antes do ACK e recuperação após falha. Git/GH, clone, TUI/provider, MCP útil e abertura nativa reais exigem host/contexto autorizados e a integração opt-in; não são comprovados por essas fixtures. Publicação, nova tentativa e UI de início/detalhe continuam nas sprints consumidoras. Captura Git, validações do produtor e revisão estão descritos abaixo.

## Versão Git imutável e repetição de captura

Aceitar o resultado oficial do Implementador agora grava também uma entrega `pending`, na mesma transação do hash/recibo/critérios. Após o commit, o pipeline reserva a captura e executa o IO. `writesStopped:true` continua obrigatório; a extensão OMP observa `tool_execution_start/end` e recusa `execution_complete` enquanto outra ferramenta estiver em execução. O Implementador deve aguardar também seus processos que continuam em background. Essa coordenação não é um supervisor de processos nem um bloqueio do filesystem. Conversa e ferramentas nativas continuam disponíveis; o contrato proíbe novas escritas de produto até uma rodada explícita de correção.

`workspaces.captureDelivery({attemptId,passageId,deliveryId,baseSha,declaredFiles})` usa somente o clone próprio. Enumera nomes Git por NUL, inspeciona bytes/modos e prepara índice temporário inicializado da base. O índice de implementação recebe somente leitura; nenhum `add`, refresh ou reset é aplicado nele. Duas observações de conteúdo/HEAD/índice/seleção, mais a conferência das leituras intermediárias, detectam alterações durante a captura. Não há vigilância contínua. Lock/conflito de índice, sparse checkout, arquivo especial/symlink, submodule, ponteiro LFS, filtro de conteúdo e incompatibilidades geram diagnóstico antes da revisão.

Objetos ficam em `<data>/git/<attemptId>.git`. Um commit técnico privado ancora a tree e tem a base como único parent; `contentIdentity` é o ID Git da tree. A ref exclusiva `refs/factory/deliveries/<deliveryId>` usa criação com precondição de ausência e nunca é sobrescrita. Ref direta, commit/tree/base e objetos são conferidos antes da confirmação e ao ler diff. O repositório não usa alternates/hardlinks para depender do ambiente removível. Esse commit técnico não é o commit de entrega, baseline de scaffold ou autorização para push. Banco e eventos guardam somente identidades, refs, hashes, diagnósticos e metadados; índice temporário é descartado também nas falhas tratadas.

Ignorados não são enumerados para coleta. Arquivos novos com nomes conhecidos de segredo (`.env` exceto modelos example/sample/template, credenciais/netrc/chaves privadas/secrets) são excluídos; um desses nomes já tracked recusa a captura. Isso é uma regra conservadora por nomes conhecidos, não um detector universal de segredos. `declaredFiles` é uma extensão opcional compatível do resultado v1: caminhos relativos declarados, sem bytes. Quando um arquivo novo declarado é ignorado ou excluído pela regra de segredos, `delivery.warnings` registra tentativa/passagem/versão, caminho e motivo. A declaração não autoriza coletar o conteúdo excluído. A sprint 017 consumirá esses metadados no detalhe.

| Endpoint | Contrato |
| --- | --- |
| `GET /api/v1/deliveries/:deliveryId` | Metadados, estado `pending/running/captured/failed`, avisos, ETag e event_cursor. Sem conteúdo ou diff completo. O resumo de tentativa oferece `delivery_id` após o resultado. |
| `GET /api/v1/deliveries/:deliveryId/diff?limit=25&cursor=...` | Calculado sob demanda da ref retida; paths/modos/status, patch textual e indicação de binário, tamanho ou encoding não suportado. `next_cursor/has_more` explícitos, vinculados à versão. Limite 25/máximo 100; nenhum path fornecido pelo cliente. |
| `POST /api/v1/attempts/:attemptId/deliveries/:deliveryId/capture/retry` | `{producer_passage_id}`, sessão/Origin/CSRF, `If-Match` **da tentativa** e `Idempotency-Key`. Retorna `202 OperationAccepted`/Location somente após claim, operação, recibo e evento duráveis. |

Repetição exige a mesma passagem produtora concluída e ainda acompanhada, falha técnica e revisão atual. Estado alterado, captura simultânea, versão capturada, interrupção/cancelamento ou continuidade revogada retornam `CAPTURE_RETRY_NOT_ALLOWED`. Não recruta Implementador nem refaz clone. Resposta perdida é recuperada pelo mesmo operationId antes de verificar novas revisões; conteúdo/precondição divergentes conflitam. Cada execução técnica tem histórico em `capture_runs`. Se a ref foi criada mas o commit de metadados falhou, a repetição só a recupera se tree e base coincidirem; conteúdo diferente exige outra versão.

Limites técnicos de captura: 100.000 arquivos, 16 MiB/arquivo e 128 MiB de conteúdo total; limites existentes do subprocesso Git continuam 4 MiB de stdout/15 s por chamada. O excesso é diagnóstico, nunca entrega truncada. Patch acima de 64 KiB de blobs somados recebe `PATCH_TOO_LARGE`; patches emitidos respeitam teto de 256 KiB/página, além do limite de entradas. Binários e texto não UTF-8 são identificados sem patch corrompido.

Migration 006 acrescenta `deliveries`, `capture_runs` e `capture_warnings` STRICT, FKs compostas e guards de identidade/conteúdo/histórico. Resultados anteriores são preservados com entrega identificável e continuidade revogada; migration/restart não restauram autoridade. Reservar ou confirmar uma passagem de Revisor exige entrega `captured` e resultado estruturado do Implementador para a mesma versão. A revisão confere a ref/tree/base capturada no checkout da tentativa.

Provas locais: SQLite e filesystem reais com Git/canonicalização controlados; HTTP protegido, rollback, idempotência, recuperação de ref, persistência dos avisos sem bytes excluídos, modos, nomes com espaços/Unicode e parsing NUL de quebras de linha, diff paginado após remoção da implementação, conflitos e contenção. A medição AC-29 usa cache ignorado de 16 MiB e registra banco/WAL, metadados auxiliares, payload e latências em `SPEC_PROGRESS.md`. Objetos/ref Git reais, canonicalização integral neste sandbox, retenção após morte de runtime Git real e o percurso Maestri/OMP continuam pendentes no host autorizado. Fixtures não encerram AC-09/13/29 ou INT-18 integrais.

## Prova de persistência e manutenção modular

`npm.cmd run proof:persistence` executa os ensaios AC-28/29 locais e gera JSON/Markdown em diretório exclusivo de `.cache`, somente após sucesso. Inclui massa ignorada de 0/16/64 MiB, banco/WAL/auxiliares, payloads/latências das consultas finais, auditoria e recuperação por Git controlado; os resultados do produtor são registrados como dados estruturados da passagem, sem executor manual. Não chama Git/GH ou providers. Recuperação com objetos Git reais após encerramento dos processos permanece pendente. Roteiro, metodologia e limites em [docs/integration/persistence-maintenance/README.md](docs/integration/persistence-maintenance/README.md).

## Validação dos papéis e evidências

O Implementador usa as ferramentas e o shell normais do OMP para executar build, typecheck, lint e testes pertinentes que estejam disponíveis. O resultado estruturado registra cada comando pertinente em `ImplementerResult.checks` (`id`, `outcome` e `evidence`), incluindo limitações e comandos que não puderam ser executados. Esses registros pertencem à passagem e à versão; não são definições configuráveis nem aprovação automática.

Depois de aceitar o resultado produtor e confirmar a captura Git da versão, o pipeline inicia a revisão independente diretamente. Não cria execução manual, não aguarda `verification_runs` e não bloqueia por ausência de comandos configurados. Resultado inválido, produtor ainda ativo, perda de acompanhamento, cancelamento ou conteúdo capturado inválido continuam bloqueando o avanço.

O Revisor recebe o resultado produtor, os critérios e a identidade exata de `git_ref`/`content_identity`, além dos achados e diferenças pertinentes. A conversa do Implementador não é compartilhada. A revisão começa mesmo quando há resultado técnico inconclusivo ou critério `not_verified`, para que o Revisor avalie a versão; a aprovação exige evidência independente pertinente para cada critério e resolução dos bloqueantes atuais e anteriores.

Correções criam uma nova rodada e captura. Resultados, critérios, achados e pareceres anteriores continuam ligados às suas versões. `ReviewCommandRepetition` conserva comando, evidência prévia e motivo concreto, com evidência vinculada ao resultado produtor da mesma versão; não mantém vínculo `check_id`.

Migration 053 remove `verification_runs`, `checks` e `artifacts`. Ela não converte nem apaga dados desses mecanismos: se encontrar qualquer registro, recusa a abertura e preserva o banco. A migration 052 também recusa revisões antigas antes de substituir seu vínculo por `implementer_passage_id`. Históricos de fase, inclusive `verifying`, permanecem; o novo percurso não depende de executor manual.

As rotas `/api/v1/deliveries/:deliveryId/checks` e `/api/v1/artifacts/:artifactId` não existem mais. `GET /api/v1/deliveries/:deliveryId/producer-result` e as consultas de revisão continuam carregando sob demanda os resultados dos papéis. O resumo não apresenta contagem de checks manuais.

## Revisão independente e correções limitadas

Após resultado estruturado e captura concluída, o pipeline registra revisão/passagem/terminal antes do lançamento. O Revisor recebe o resultado produtor e a versão atual, sem conversa do Implementador nem artifact de check manual. `workspaces.materializeReview(delivery,reviewId)` verifica e devolve o checkout único da tentativa contra a referência capturada; revisão e implementação usam o mesmo conteúdo aprovado. Recurso parcial não é adotado ou apagado. Passagens de revisão compartilham a sessão OMP do Revisor dentro da tentativa; outra tentativa recebe sessão e ambiente novos. Handshake rejeita identidade física/lógica duplicada em ocupação viva.

Antes de aceitar o primeiro resultado revisor, `validateReviewerResult` na composição exige `workspaces.validateReview`. A verificação relê a ref retida, HEAD, status NUL e bytes de todos os blobs tracked, sem filtros, sem escrever objetos/índice e sem confiar em flags assume-unchanged/skip-worktree. Confere modos onde suportados e estabilidade das leituras; inclusões não ignoradas/staging/remoções/commits ou bytes divergentes invalidam o parecer. Caches ignored gerados ficam fora do produto. Falha de leitura/Git impede confirmação; invalidez já observada é permanente naquela revisão, mesmo se o checkout for reparado. Isso é conferência na entrega do parecer, sem bloqueio de filesystem ou vigilância contínua.

Migration 008 acrescenta `reviews`, `findings` e `finding_resolutions` STRICT, índices, FKs compostas e guards. A migration 052 vincula cada revisão ao resultado persistido da passagem exata do Implementador. `acceptResult` confirma resultado/recibo, critérios, achados e resoluções antes do ACK. Cada achado recebe UUID próprio, preservando também a chave declarada pelo Revisor, problema, evidência, resultado esperado e vínculos; categoria técnica é explícita, inclusive com `criterionIds:[]`. Revisão posterior recebe os UUIDs como `findingKey` das resoluções. Cobertura exata, ausência de duplicatas e vínculos à mesma tentativa são obrigatórios. Aprovação exige critérios passed, independência válida, nenhum impedimento novo e resolução independente dos anteriores; não resolve achados por declaração do Implementador. `declaredVerdict` distingue aprovação declarada de um parecer invalidado. Aprovação histórica move a fase a `publishing`, com resultado final nulo: o gate atual e os efeitos de publicação continuam necessários.

Reprovação registra a próxima rodada antes de enviar contexto estruturado. `execution.continuePassage(source,request)` usa somente a sessão viva do Implementador e seu cwd/perfil/recurso originais; não recruta outro terminal. A passagem nova tem identidade/resultado próprios e `session_source_id` imutável liga sua sessão à passagem anterior. Frame/ACK de continuação confirma o enfileiramento por `sendUserMessage(...,{deliverAs:'followUp'})`; timeout/perda fica diagnosticado e não reenvia cegamente. O campo opcional v1 `findingResponses` torna-se obrigatório, com IDs exatos, quando há achados na correção. Só o próximo Revisor resolve os achados.

Rodadas vão de 1 a `1 + correctionLimit`, padrão 2 correções, aceitando 0–5. Toda correção produz outro deliveryId/ref, captura, resultado produtor e validações pertinentes; Implementador e Revisor mantêm suas próprias sessões lógicas da tentativa. A última correção também é revisada. Esgotamento encerra `finished/rejected` e preserva pendências/resultados; pergunta humana não consome rodada. Perda da sessão implementadora mantém diagnóstico e histórico, sem substituta oculta. A desconexão de um Revisor já concluído não revoga uma correção posterior. Reinício interrompe trabalho incompleto, sem restaurar sessões ou agendar passagem. Contexto tem teto de 1000 achados pendentes e os limites de frame/tarefa existentes; excesso impede despacho, sem truncamento aprovável.

| GET protegido | Conteúdo sob demanda |
| --- | --- |
| `/api/v1/attempts/:attemptId/rounds` | Até seis resumos com rodada, entrega/tree, passagem/recibo produtor e ID/estado da revisão; sem conteúdo de arquivos ou parecer completo. |
| `/api/v1/deliveries/:deliveryId/review` | Parecer, independência, critérios, achados e resoluções daquela versão; null antes de planejar a revisão. |
| `/api/v1/deliveries/:deliveryId/producer-result` | Resultado estruturado/recibo imutáveis do Implementador daquela versão. |

Consultas verificam a conta atual; não expõem controle de sessão nem executam Git. Os recursos v1 distribuídos evoluíram com instruções de correção/identidade de achados e `findingResponses` opcional; capturas históricas mantêm suas referências e digests originais, sem reescrita. A captura não arquiva os bytes dos recursos antigos; distribuição divergente impede despacho, sem substituir o contrato capturado.

As provas locais cobrem SQLite/HTTP/filesystem reais e dependências Git/canonicalização/lançamento controladas: limites 0–5, última revisão, árvores distintas, rollback, busy, idempotência/reopen, migração 7→8, histórico imutável, escopo, produto alterado, continuação/ACK/timeout/perda e ausência de substituta. Git real, TUI Maestri/OMP/provider e independência observada no host continuam para a execução opt-in autorizada. Esses testes não encerram AC-07/08/13 ou INT-03/06/18 integrais.

## Decisão humana, tempos e limites

Migration 009 evolui `execution_questions` com revisão, resposta/hash, operação, TTL, expiração, recibo e contexto de escopo; acrescenta `passage_measurements` STRICT. Perguntas mantêm a fase, a rodada e a sessão. O controlador valida schema e vínculo, sem classificador de manutenção. Resultado oficial com pergunta pendente recebe erro corrigível. Conversa livre não responde à pergunta formal. Identidade, conteúdo da pergunta, resposta confirmada e estados terminais têm guards; operações/eventos não contêm o texto da resposta.

| Endpoint protegido | Contrato |
| --- | --- |
| `GET /api/v1/attempts/:attemptId` | Acrescenta `pending_question_id`; não carrega pergunta/issue completas no polling. |
| `GET /api/v1/attempts/:attemptId/questions/:questionId` | Pergunta, vínculo, revisão/ETag, estado, TTL, resposta e recibo correlacionado; contexto atual/capturado quando há decisão de escopo. |
| `POST /api/v1/attempts/:attemptId/questions/:questionId/answer` | `{answer,scope_choice?}`, If-Match da pergunta e Idempotency-Key. Retorna 202/Location após gravar resposta, hash, operação, revisão e evento atomicamente. |
| `GET /api/v1/attempts/:attemptId/measurements` | Tempo ativo e espera humana agregados e por passagem, TTL/limites capturados, expiração e pendências de medição. Até 12 passagens, sem logs/checkout. |
| `GET /api/v1/operations/:operationId` | Projeta `question.answer`: accepted/running/succeeded/unknown/failed, conservando o recibo da aceitação. A consulta não envia a resposta. |

Ausência de revisão retorna 428; revisão antiga 412; pergunta expirada/cancelada/respondida ou passagem sem acompanhamento recusa nova submissão. Replay idêntico recupera a operação antes do CAS; divergência de texto/precondição/escopo retorna 409. O envio recebe um claim persistido `sending` antes do canal. Somente o recibo da operação na passagem original confirma `delivered`. Timeout/EOF/falha de entrega ficam `delivery_unknown`, com avanço suspenso e sem reenvio no replay ou consulta. ACK tardio válido reconcilia esse estado; ACK de pergunta expirada/cancelada não a reabre. Outra suspensão nunca é removida por esse recibo. Na correção, a correlação usa a passagem lógica atual na sessão original.

A coordenação relê a issue no intervalo de polling configurado e antes de aceitar o primeiro resultado oficial de cada passagem na composição de produção. Usa o parser existente e compara IDs/textos dos critérios do corpo com o digest capturado; comentários e edição editorial fora dos critérios não mudam esse conjunto. Leitura parcial/indisponível não comprova igualdade. Alteração relevante gera pergunta com critérios/digests atuais e capturados, sem editar a captura. `scopeChoice:keep_captured` é obrigatório para continuar essa decisão e entrega uma orientação explícita para manter IDs/textos/digest. `adopt_new` retorna `NEW_ATTEMPT_REQUIRED`: atualizar a issue no GitHub e preparar outra tentativa são ações separadas, sem mutação remota implícita. Decisão já entregue vale para aquela alteração observada; outra alteração exige nova decisão.

O tempo mede duração de passagem acompanhada, a partir de ready, por relógio do controlador; não mede CPU ou faturamento do provider. Espera humana, inclusive entrega incerta, não consome o limite ativo por passagem. Há checkpoints operacionais a cada 1 s, sem persistir transcript ou emitir evento de progresso por tick. TTL configurado usa inteiro seguro em ms; zero expira imediatamente e `not_configured` não expira. Expiração da pergunta mantém `QUESTION_EXPIRED` e impede avanço, sem afirmar parada física. Expiração ativa é persistida antes da solicitação de cancelamento; o estado físico continua no recibo do recurso, inclusive uncertain. Detecção numa borda de resultado conserva o pedido pendente para a coordenação. Silêncio de terminal não é prova de falha.

Zero medido, limite não configurado, medição indisponível e não aplicável permanecem distintos. Custo não observado pelo executor é `unavailable/EXECUTOR_COST_NOT_OBSERVED`, com RF-61 e pendência explícita; a observação de custo é independente dos controles de tempo e TTL, sem estado de aplicação de teto financeiro. Não foi criada telemetria financeira ou consumo fictício. Sem passagem iniciada, a medição pertinente é não aplicável. Perda de acompanhamento/restart torna incompletas as medições afetadas; downtime não é contado como execução. A migração conserva perguntas/respostas históricas, cancela coordenação incompleta da v8 e não inventa recibos/medições anteriores.

Provas locais: HTTP inject/SQLite reais, CAS, rollback/busy, escopo, identidade/histórico, relógio controlado, timeout/ACK tardio, follow-up e passagem de correção sob adapter/extensão controlados. UI da decisão permanece para sprint 033; TUI/provider/MCP reais e AC-14/15/INT-05/07 integrais exigem a prova autorizada da sprint 018.

## Cancelamento, interrupção e nova tentativa

Migration 010 acrescenta revisão/remoção ao journal de recursos e registros específicos de cancelamento, remoção e abertura nativa. Nenhum desses registros guarda conteúdo de projeto, índice, transcript ou body de comando. Migrations anteriores permanecem intactas.

| Endpoint protegido | Contrato |
| --- | --- |
| `POST /api/v1/attempts/:attemptId/cancel` | `{reason?}` e Idempotency-Key; If-Match não condiciona cancelamento. Confirma revogação, operação/recibo/evento antes de abortar coordenação ou pedir parada. 202 significa cancelamento solicitado. |
| `GET /api/v1/attempts/:attemptId/resources` | Recursos próprios registrados, ownership, lançamento, parada, diagnóstico, revisão, remoção e limpeza `pending/complete/uncertain`. Sem varredura por nome/PID. |
| `GET /api/v1/attempts/:attemptId/resources/:resourceId/removal-plan` | Perdas, preservações, capacidade/motivo, plan_hash e ETag do recurso; sem exclusão. |
| `POST /api/v1/attempts/:attemptId/resources/:resourceId/remove` | `{plan_hash,confirmed:true}`, Idempotency-Key e If-Match do recurso. Revalida plano, parada e retenção antes da intenção durável e novamente antes da exclusão. |
| `GET /api/v1/attempts/:attemptId/passages/:passageId/interaction` | Referência sanitizada e capacidade atual da sessão existente. |
| `POST /api/v1/attempts/:attemptId/passages/:passageId/interaction/open` | `{}` e Idempotency-Key; revalida a sessão nativa existente, sem terminal substituto. |
| `GET /api/v1/attempts/:attemptId/resources/:resourceId/folder` | Referência do ambiente e capacidade atual de abertura. |
| `POST /api/v1/attempts/:attemptId/resources/:resourceId/folder/open` | `{}` e Idempotency-Key; abre somente a pasta gerada pelo servidor a partir do recurso registrado. |

Repetições idênticas recuperam o recibo antes de IO/CAS e não repetem parada, remoção ou abertura. Conteúdo, rota/vínculo ou precondição divergentes conflitam. `attempt.cancel/succeeded` na consulta da operação significa revogação durável; parada física continua em `resources.stopState` e `cleanup`. Recrutamento pendente conhecido recebe parada quando retorna; stop concorrente compartilha a mesma solicitação. Desconexão do canal interrompe a tentativa correspondente, fecha sua coordenação e conserva resultados. Reinício marca trabalho incompleto `interrupted` e intenções de remoção/abertura ainda aceitas `unknown`, sem replay, provider ou conversa restaurados.

Nova preparação aceita `previousAttemptId` somente da mesma conta/projeto/issue e de tentativa encerrada. Seus parâmetros continuam editáveis; novas leituras usam issue, configuração e base atuais. Esse vínculo dispensa somente Ready, mantendo conta, responsabilidade exclusiva, Project/campo/opção válidos, issue aberta, bloqueadores, origem e unicidade ativa. Iniciar cria UUID, captura, clone e processo próprios. Não importa alterações/sessão anteriores nem exige limpeza global; um residual da tentativa antiga continua diagnosticável.

Remoção está delimitada ao recurso `implementation`, em `<data>/work/<attemptId>/implementation`. Exige tentativa encerrada, todos os terminais próprios confirmados parados, nenhum lançamento ou captura pendente. Confere as refs/commits/trees/bases, ownership e objetos retidos de todas as entregas. Compara o produto atual à última versão retida, inclusive arquivos adicionais não ignorados: conteúdo sem retenção impede exclusão, mesmo com confirmação. O plano informa a perda de arquivos ignorados e do índice/metadados locais. Inventário transitório de nomes/metadados e verificação de bytes produzem somente um hash; nada disso é armazenado como snapshot auxiliar.

O plano muda com conteúdo, metadados, ownership, estado, revisão ou retenção diferentes. Paths são resolvidos por ID, com canonicalização/identidade e recusa de symlink/junction. Remoção usa percurso explícito sem seguir links, sem force e sem atingir a raiz da tentativa, Git retido ou recursos compartilhados. Limites: 100.000 entradas, profundidade 64; comparação de produto até 16 MiB/arquivo e 128 MiB agregados. Erro durante exclusão pode deixar ambiente parcial e operação unknown; não há retry destrutivo automático nem outro remove sobre intenção incerta. Não se promete bloqueio de filesystem contra alterações externas concorrentes.

Abertura depende da composição confiável: `ExecutionHost.openExistingTerminal` e `ControllerHostContext.openFolder`. Ausência de suporte retorna capacidade com motivo e `409 NATIVE_OPEN_UNAVAILABLE` no comando. O recibo confirma somente o pedido nativo aceito, sem afirmar que uma janela está visível. Nenhum body aceita path, comando ou PID. `ExecutionHost.confirmStoppedTerminal` é capacidade opcional do host para observar término físico do terminal próprio e seus escritores conhecidos; possui prazo de 15 s. Ela não é configurável por HTTP/ambiente, e um retorno verdadeiro exige observação autoritativa. Sem essa capacidade/prova, `dismiss` continua uncertain e remoção permanece bloqueada. Não há observador/supervisor geral ou promessa de contenção de brokers/daemons.

Provas locais usam SQLite/HTTP inject/filesystem reais, com Git, canonicalização, TUI e capacidades nativas controlados. Exclusões de validação atingem somente fixtures identificadas em `.cache`. Cancelamento real na inicialização e durante trabalho com filho, nova tentativa Maestri/OMP real, confirmação física e abertura nativa no host continuam sem prova; compilação e fixtures não encerram AC-16–18/26 ou INT-08/15–17 integrais. O journal de publicação abaixo conserva efeitos concluídos após a revogação e impede os seguintes.

## ICR consultável e acompanhamento GitHub

`publication/index.ts` oferece `createPublication`, `Publication` e `PublicationDependencies`. A composição do pipeline conecta aprovação à conclusão dos modos capturados `icr`, `commit` e `pr`, e projeta implementação/validação/correção em In progress, revisão em In review e modo concluído em Delivered. ICR registra comentário; Commit acrescenta o commit local; PR publica a branch e registra o resultado na PR para a base capturada. Done, corpo e checkboxes da issue não são alterados.

| Endpoint protegido | Entrada e resultado |
| --- | --- |
| `POST /api/v1/attempts/:attemptId/publication/complete` | `{delivery_id,authorized_mode:'icr' ou 'commit' ou 'pr',authorized:true}`, If-Match da tentativa e Idempotency-Key. Modo deve coincidir com a autorização durável, capturada ou ampliada. 202 após intenção/recibo duráveis; consulta da operação informa conclusão ou pendência. |
| `POST /api/v1/attempts/:attemptId/publication/reconcile` | `{delivery_id}`, If-Match da tentativa e Idempotency-Key. Consulta fatos dos efeitos conhecidos, sem nova mutação remota. |
| `POST /api/v1/attempts/:attemptId/publication/authorize-upgrade` | `{delivery_id,current_mode,target_mode,authorized_additional_effects_hash,authorized:true}`, If-Match da tentativa e Idempotency-Key. Confirma uma vez os acréscimos do resumo atual em `GET /deliveries/:deliveryId` → `publication.upgrades`. Somente modo superior, tentativa encerrada e versão aprovada com gate válido. Retorna 202/Location; replay recupera o recibo. |
| `POST /api/v1/attempts/:attemptId/revalidate` | `{}`, If-Match da tentativa e Idempotency-Key. Reobserva conta, responsabilidade e quadro; remove somente a suspensão de autoridade resolvida. |
| `GET /api/v1/attempts` | `project_id?`, `result?` (`active` ou resultado final), `cursor?`, `limit?`; `HttpAttemptPage`, sem captura, critérios ou evidência completos. |
| `GET /api/v1/attempts/:attemptId` | `round_id?` (número 1–6), `delivery_id?`, `section?`, `cursor?`, `limit?`; `HttpAttemptDetail` e ETag da tentativa. |
| `GET /api/v1/deliveries/:deliveryId` | `section?`, `cursor?`, `limit?`; `HttpDeliveryDetail`, identidade da versão, revisão, publicação, limites/tempos e capacidades. |

`queries/index.ts` oferece `createQueries(storage)`, `Queries.listAttempts/getAttempt/getDelivery`. As seções `rounds/passages/criteria/reviews/findings/questions/effects/resources` têm páginas independentes, padrão 25/máximo 100. Cursor vincula instalação/conta, seleção, filtros e ordenação; teto observado exclui novas inclusões da continuação. Selecionar uma versão anterior mantém seus critérios, parecer e resoluções, mesmo com outra rodada ativa. A rodada planejada pode ser consultada antes de existir uma entrega capturada. Perguntas apresentam metadados/recibos; seu conteúdo e resposta ficam no endpoint específico.

O detalhe distingue fase, suspensão, resultado final, revisão por versão, efeitos, parada/limpeza, medições/limites e capacidades. Resumos de publicação contam estados por SQL, sem carregar os documentos de identidade dos efeitos. Capacidades indicam bloqueios locais conhecidos (`EFFECT_UNRESOLVED`, `RESOURCES_NOT_RECONCILED`, `ICR_ENVIRONMENT_UNAVAILABLE`, `MODE_COMPLETED`); uma capacidade disponível ainda exige gate atual no comando. Nenhum GET revalida autoridade, despacha ou publica. Diff e resultados estruturados dos papéis continuam sob demanda nas rotas existentes.

`storage.recordEffectIntent` registra operação, autorização, identidade esperada e evento atomicamente, antes da mutação. `claimEffect` confirma envio; `finishEffect` grava estado/recibo. O journal distingue origens de tentativa/criação, sem semear criação fictícia. Migration 011 acrescenta `effects`, `publication_requests`, `attempt_authority`, `controller_authority`, índices/FKs e guards históricos. Não guarda bodies do comentário, checkout, índice, caches, diff ou transcript.

O gate exige a versão corrente capturada/aprovada, resultado produtor e revisão independente vinculados à mesma tree, modo capturado autorizado e nenhuma pergunta/cancelamento ou suspensão impeditiva. ICR exige ambiente próprio preservado; Commit usa a retenção independente, inclusive após remoção da implementação. Confere retenção e objetos antes dos efeitos e reobserva os vínculos atuais depois desse IO. Conta diferente pausa novos despachos; assignee alterado revoga publicação e solicita cancelamento. Status externo divergente suspende avanço com orientação, sem forçar o quadro. Releituras não fornecem CAS remoto nem exclusão entre instalações independentes.

Comentário usa marcador exclusivo por instalação/tentativa/versão, hash do corpo e IDs de tree/base/revisão. Reconciliação exige leitura completa, marcador único, autor, corpo e alvo exatos. Status enviado é confirmado por releitura do item/campo/opção. Timeout após envio fica `unknown`; consulta/complete não o reenviam cegamente. Falha SQL impede o próximo efeito. Confirmação tardia após cancelamento registra o fato e conserva a revogação. Falha de comentário ou projeção mantém aprovação, versão, diff/evidências e trabalho local, sem novo Implementador ou consumo.

Restart preserva fatos/recibos, marca envios incompletos unknown e revoga continuidade antiga. Concluir versão histórica aprovada exige nova ação explícita, recursos reconciliados e gate atual; não restaura sessão de agente. ICR local concluído e projeção Delivered pendente continuam estados separados.

Mutações reais exigem `ControllerHostContext.githubMutationAuthorization` com conta, repositórios e Projects explicitamente conhecidos, além do contexto GitHub autorizado. Não é lido de body HTTP, sessão ou variável de ambiente. Sem essa capacidade, o adapter recusa antes do IO. Esta sprint não autoriza escrever em alvos reais. As provas locais usam HTTP inject/SQLite reais e GitHub/Git/TUI controlados; AC-09/12/22 e INT-18 integrais dependem do percurso real autorizado.

## Observação completa da fila Ready

`GET /api/v1/queue?project_id=&cursor=&limit=` consulta o conjunto atual, com sessão técnica e ETag. Para selecionar vários projetos, use `project_ids=<UUID>,<UUID>` (até 100 IDs distintos, sem combinar com `project_id`). O limite padrão é 25, máximo 100 itens por página. `eligible_total` considera todos os candidatos consultados, incluindo os que não aparecem na página atual. Escopo account suporta até 100 projetos; acima disso retorna `503 QUEUE_SCOPE_LIMIT` e exige seleção de projetos, sem truncar uma observação válida. No resumo de projetos selecionados, candidatos elegíveis são contados mesmo com a automação desses projetos desligada, permitindo autorizar sua habilitação.

Elegibilidade exige issue aberta no repositório e Project configurados, item não arquivado, Status Ready por IDs, um único assignee com o ID da conta e nenhum bloqueador aberto. Sem responsável, responsável alheio, múltiplos responsáveis, draft e PR recebem motivos específicos. Bloqueadores não invalidam as demais issues. A consulta aplica também os estados locais já existentes de automação/consumo/ocupação, sem alterá-los. Ready representa uma condição observada, independente da ordem temporal entre atribuição e Status.

O adapter pagina itens, definições e valores dos campos. Prioridade usa exclusivamente o campo numérico configurado, na direção `asc`/`desc`, com valores ausentes por último. Em seguida usa posição quando `useBoardPosition` está habilitado e a leitura fornece posição documentada; número crescente e ID desempatarão. Sem posição, o fallback para número/ID é explícito. Projetos são agrupados por ID; prioridades de campos de Projects diferentes não são comparadas. A consulta solicita `POSITION ASC` do Project, sem prometer a ordenação de uma view visual filtrada. Referência primária: [GitHub GraphQL Projects](https://docs.github.com/en/graphql/reference/projects#projectv2itemorderfield).

`observationId`, `observedAtMs`, `complete`, `valid`, `scope`, `modesByProject`, `order`, `eligibleTotal` e `summaryHash` descrevem o resumo. Hash e cursor vinculam configuração observada, conta/host, escopo, candidatos, quantidade, modos e ordem; outra página usa o mesmo hash enquanto o conteúdo material permanece igual. Alteração de configuração, catálogo ou conta durante IO invalida o conjunto. Leitura parcial, autenticação inválida, rate limit e vínculo inconsistente produzem `valid:false`, total não confirmado e diagnóstico; não representam uma fila vazia válida. As leituras não constituem transação ou CAS remoto.

`polling` informa `intervalMs`, `backoffMaxMs`, `retryAtMs` e `nextPollAtMs`. A configuração existente `time_defaults.polling_interval_ms` define o intervalo; `polling_backoff_max_ms` opcional limita a progressão exponencial local (padrão efetivo: maior entre intervalo e 60 s). Retry-After/reset do adapter prevalece mesmo acima desse máximo. Durante o prazo, nenhuma nova chamada GitHub é feita pelo observador; ele retorna observação inválida com `QUEUE_READ_BACKOFF`. Sucesso limpa o backoff. O cliente da fila agenda a próxima leitura por esse contrato e aplica backoff finito aos erros de transporte.

GET não grava observações no banco, consome ciclos, cria preparações ou inicia tentativas. Em memória ficam somente prazos/contadores de retry, sem cópia integral do quadro ou cache que conceda autoridade. O scheduler fica no processo controlador, composto uma vez por `startController`; interfaces apenas consultam ou comandam essa instância. A composição HTTP sem contexto confiável continua recusando trabalho real.

### Habilitação e consumo durável

`PUT /api/v1/queue` recebe `{enabled,scope:{kind:'account'|'project',project_ids},observation_id?,authorized_summary_hash?}`, If-Match da consulta de fila e Idempotency-Key. Habilitar reconsulta conta/host, conjunto completo, quantidade, modos e configuração. Mudança material retorna `409 QUEUE_SUMMARY_CHANGED`, `queue` com o resumo atual e novo ETag. O ETag inclui settings/perfis e todas as revisões de projeto no escopo. Projetos selecionados são alterados juntos em uma transação, preservando revisões anteriores; a chave considera o comando de fila completo. Operação/recibo ficam consultáveis mesmo se a leitura posterior à escrita falhar.

Escopo account controla a chave global; scope project altera a automação dos projetos selecionados e exige a chave global ligada para habilitar. Pausar não depende de leitura remota completa e impede novos inícios, preservando tentativa ativa, consumos e histórico. Retomar exige novo resumo atual. A UI existente usa escopo account; seleção múltipla é disponibilizada pela API.

O scheduler respeita o prazo de polling/backoff, registra somente observações completas e válidas e revalida novamente antes de usar `startAttempt`, a mesma operação manual. Configuração e pausa são conferidas outra vez na transação de início. `queue_cycles` mantém o ciclo observado; `queue_consumptions` guarda o histórico imutável por conta/projeto/repositório/issue/ciclo. Tentativa, consumo, captura, intenção e recibo são confirmados juntos antes de clone/processo. Cadastros duplicados do mesmo repositório/issue compartilham o consumo dos ciclos Ready observados.

Ready residual, resposta perdida, cancelamento, falha de projeção e restart não repetem o ciclo. Outro ciclo exige observar saída de Ready e depois retorno elegível; transições offline não são reconstruídas. Nova tentativa explícita continua disponível pela preparação existente. O índice único de issue ativa é preservado e um índice parcial limita a uma tentativa automática ativa por conta; o início automático também espera qualquer tentativa ativa da conta.

O lock local de instalação é adquirido antes de storage/listen e independe de porta/projeto. Instalações independentes não compartilham exclusão: handoff exige cancelar/encerrar a tentativa anterior antes de atribuir a outra conta e rearmar Ready. O worker observa a conta e reutiliza a governança de publicação: troca de conta pausa despachos, responsável alterado solicita cancelamento e divergência de Status suspende avanço até resolução/revalidação, sem takeover ou reescrita forçada. As provas locais não substituem consulta GitHub, execução Maestri/OMP ou aceite visual reais.

## Publicação privada e Commit local

`workspaces.materializePublication(delivery,operationId)` reserva `<data>/work/<attemptId>/publication/<operationId>/checkout`, clona exclusivamente `<data>/git/<attemptId>.git`, busca a ref retida e confere commit técnico, tree, base e objetos. Não consulta a implementação ou seus caches. Diretório existente/parcial não é adotado, resetado ou removido.

`createLocalCommit(delivery,effect,authorize)` exige o efeito `local_commit` durável/claimed e nova conferência de autoridade imediatamente antes da escrita. Cria por `commit-tree` a tree aprovada com um único parent/base; nunca usa `add`, índice mutável ou uma nova captura. A mensagem `feat: deliver issue #N` inclui tentativa, delivery e operationId. Identidade técnica e data UTC fixa da intenção independem da configuração global. O commit fica ancorado por CAS de criação em `refs/heads/factory/<issueNumber>/<attemptId>` no Git gerenciado retido, distinto da ref técnica da captura e do baseline de scaffold. Nenhum push é realizado.

`reconcileLocalCommit` somente consulta: ref direta, tree, parent único, mensagem/operationId e integridade precisam coincidir. Resposta perdida após criar a ref permite confirmar o mesmo commit. Ref ausente/divergente ou falha de leitura mantém unknown, sem criar outro commit ou sobrescrever branch. Falha antes da criação de commit pode ser conhecida; materialização parcial é preservada e não é readotada em outra ação. Um objeto criado sem ref confirmável continua incerto e exige diagnóstico; não há retry cego.

Tree igual à base é conferida no Git e precisa coincidir com `hasDelta:false`. Com revisão/evidências aprovadas, o efeito fica `not_applicable/APPROVED_NO_DELTA`, sem commit vazio. O comentário identificado inclui SHA/branch ou motivo de ausência de delta e referências aos resultados/evidências. Conclusão exige commit confirmado/não aplicável e comentário confirmado; Delivered é projeção posterior. Falhas e confirmações tardias conservam aprovação e fatos anteriores sem relançar o Implementador.

Migration 014 amplia os journals de efeitos/pedidos preservando registros, recibos, ordem e guards. As consultas leves apresentam `publication.commit` com estado, SHA, motivo e operationId, separados de revisão, resultado final e limpeza. O suporte backend PR e aumento de modo é descrito abaixo. O bloqueio inicial de PR mencionado na implementação original do backend foi removido nas sprints 028–029, que conectaram os modos e a continuação à interface.

Provas locais usam SQLite/filesystem/HTTP controlado e Git controlado. A [matriz da Sprint 043](docs/operation/sprint043-gates.md) registra separadamente os cenários reais de Git/GitHub e Maestri/OMP, com suas identidades e limites. Uma prova real vale para o cenário documentado e não substitui autorização ou evidência de outros efeitos.

## PR, reconciliação e aumento de modo

O modo PR capturado autoriza o push necessário sem confirmação entre commit/push/PR. `workspaces.pushApproved` usa somente objetos retidos, valida tree/parent/mensagem/operação do commit local e envia um único refspec SHA→`refs/heads/factory/<issueNumber>/<attemptId>` para o HTTPS do repositório confirmado. Exige contexto Git com keyring e autorização de conta/repositório da composição confiável (`pushAuthorization`, derivada de `ControllerHostContext.githubMutationAuthorization`). Rejeita reescrita de URLs e transportes alternativos; conserva o credential helper normal do host. Confirma por `ls-remote --refs` com ref/SHA exatos. Branch remota divergente não é sobrescrita.

`github.mutateEffect` cria PR por GraphQL com repositórios head/base exatos, branch própria e base capturada. Consulta todas as páginas pertinentes antes e depois do envio. Confirma repositório, head/base, SHA, autor, marcador único, hash do corpo, título, estado aberto e URL; consulta também os refs atuais do head e da base. O corpo contém escopo, base/versão, critérios, parecer e pendências não impeditivas vinculados ao attemptId. Conteúdo editorial é tratado para impedir gatilhos de fechamento; não há merge, force-push ou edição de critérios. As releituras não oferecem CAS remoto: alteração concorrente após uma leitura pode produzir efeito incerto, que exige diagnóstico/reconciliação.

Intenção/claim são confirmados antes de cada mutação e o recibo antes da seguinte. O adapter GitHub chama a autorização novamente após as consultas prévias; cancelamento/restart invalidam a continuidade. Timeout enviado fica unknown até leitura confirmável. `reconcilePush` e `reconcilePullRequest` consultam os fatos conhecidos sem criar recursos; ausência, duplicidade, diferenças de identidade ou leitura parcial não autorizam replay. Confirmações tardias são registradas mesmo após cancelamento e não autorizam os próximos efeitos. Commit/push/PR sem delta recebem `not_applicable/APPROVED_NO_DELTA`, sem push ou PR vazia.

O recibo de PR preserva `targetOperationId` quando a publicação possui alvo local selado, tanto na confirmação inicial quanto na reconciliação. A persistência exige esse vínculo com a operação autorizada; uma PR existente não precisa ser recriada para confirmar seu recibo.

Migration 015 amplia os journals e adiciona `publication_upgrades`, imutável e vinculada a tentativa/versão/operação. O resumo oferece somente modos superiores para tentativa encerrada com versão corrente aprovada; o hash vincula revisões, configuração, versão/revisão técnica e estados dos efeitos. Autorizar valida retenção/evidências, gate atual, CAS e resumo antes da transação. A autorização adicional, recibo e evento são atômicos; a captura original e efeitos confirmados permanecem intactos. `authorizations.capturedMode` e `authorizedMode` são distintos. `complete` usa o modo já autorizado, sem exigir a confirmação adicional novamente, e `publication.localState` distingue conclusão do modo de um resultado anterior entregue.

Após restart não há conclusão automática nem restauração de sessão. A ação explícita exige recursos antigos reconciliados, gate atual e reconciliação dos efeitos. Falha conserva aprovação/refs/recibos; não reimplementa trabalho. Os contratos `publication.push`, `pullRequest` e `upgrades` apresentam estados, recibos, motivos e capacidades. Resumos não leem checkout, caches, diff ou bytes de logs; SQLite guarda somente referências/hashes/autorizações/estado. A prova real delimitada de commit/push/PR está registrada na Sprint 043; os testes com adapters controlados continuam cobrindo outras combinações sem alegar que ocorreram no GitHub.

## Prova integrada da primeira fatia

O [roteiro de aceitação](docs/integration/first-slice/README.md) cobre cadastro→ICR, TUI/MCP/GitNexus, pergunta/resposta, cancelamento e restart/nova tentativa, consumindo as sprints 017/033/034 do plano. O [registro da primeira fatia](docs/integration/first-slice/20261017-02/report.md) é histórico; a situação mais recente dos gates operacionais está em [sprint043-gates.md](docs/operation/sprint043-gates.md), com cada prova delimitada ao seu cenário.

`npm.cmd run test:acceptance` executa somente contratos locais. `npm.cmd run acceptance:check -- <manifest.json>` confere evidências locais sem executar efeitos; o manifesto atual retorna pendência. Mesmo um registro apto a revisão exige conferência independente dos anexos e aceite pelos mecanismos do pipeline. Os testes e smokes não autorizam providers, Git/GH, publicação ou parada de recursos reais.

Os campos específicos de observação, diagnóstico, fila e scaffold usam DTOs `Http*` em `packages/contracts/src/http-observation`, com projeções explícitas em `http/observation-views.ts`. Queries e JSON recusam aliases camelCase; paths e navegação mantêm os nomes existentes. Planos, relatórios, recibos privados e hashes de comandos conservam seus formatos históricos. A normalização não migra o banco, não converte textos/fatos arbitrários e não altera gates, consumo ou reconciliação.
