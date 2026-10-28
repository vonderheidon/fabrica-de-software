# Progresso da implementação

## Sprint — Ciclo de save, rascunhos e operações incertas na web [IMPLEMENTADA NO WORKSPACE; VALIDAÇÃO PENDENTE]

Data: 2026-10-18. Fontes: AGENTS.md, SPEC.md §§8.5/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e SPEC do pacote `docs/Docs20261017_233303/SPEC20261017_233303.md`, E02/§4.3, US-18, RF-94–97 e RNF-11/12. Nenhuma dependência instalada ou operação Git de escrita executada.

- Novo `apps/web/src/api/configuration-body.ts`: mede bytes UTF-8 do JSON serializado; limite inclusivo de 16.384 bytes e mensagem literal da SPEC. `http.ts` aplica a verificação antes de bootstrap/envio dos PUTs de settings/configuração e normaliza a apresentação de 413 sem alterar o body. Rebootstrap conserva a falha original e notifica releituras sem replay de mutação.
- Novo `apps/web/src/api/configuration-save.ts`: conserva request integral exclusivamente em memória, com rota/método/ID/If-Match e contexto originais. Metadados mínimos são registrados antes do envio. Consulta usa o ID original; 404 conserva incerteza e habilita apenas revalidação/reapresentação explícita da mesma operação. Reexecução exige instalação/conta/contexto originais, sem reconstruir payload, trocar ETag ou gerar ID. Reload perde o request e mantém somente consulta/suporte.
- `uncertain-operations.ts` projeta ID/tipo/instante explicitamente na leitura e escrita, impedindo persistência acidental de propriedades adicionais de objetos estruturalmente compatíveis.
- `ProjectForm.tsx`, `useConfiguration.ts`, `save-lifecycle.ts` e `drafts.ts`: comparação de conflito separada, aplicação de edição somente por ação explícita, rascunho em memória com conta/recurso e helper para etapa/perfil, polling sem substituir campos, erro de atualização independente, geração invalidada no cleanup e paginação protegida contra retorno tardio. Editor oferece consulta/reapresentação e bloqueia novo save durante incerteza.
- Novos testes: `tests/configuration-save-web.test.ts` e `apps/web/src/api/configuration-save.test.ts`, para fronteira UTF-8/Unicode/escapes, metadados mínimos, contexto, cleanup, consulta anterior ao replay, corpo/ETag/chave originais e ausência de replay após reload ou troca de conta. Documentação React consultada via Context7 para cleanup de efeitos e respostas obsoletas. Skills de design nomeadas no pedido não estavam disponíveis; preservada a composição existente, sem redesenho.

Validação desta rodada: `git diff --check` passou. Typecheck, lint, testes e build **não executados**: foi solicitada exceção explícita à regra da sessão que proíbe comandos não iniciados por git; resposta ainda pendente. Nenhum executor alternativo foi usado para contornar essa regra. Testes escritos não constituem prova de funcionamento; compilação e critérios integrais permanecem sem confirmação. Não houve browser, GitHub/Maestri/OMP real, provider, publicação, instalação operacional como alvo ou mudança de fase. A revisão automática rejeitou a consulta opcional à memória externa como conteúdo privado fora do escopo; esse conteúdo não foi usado.

## Registro atual — Progresso e conclusão do onboarding no servidor [IMPLEMENTAÇÃO NO WORKSPACE; VALIDAÇÃO PENDENTE]

- Views de settings e configuração agora incluem onboarding derivado, contagens de perfis vivos por tipo, capacidades de seleção do host e cursor de eventos. A primeira etapa incompleta usa o vínculo local persistido, a confirmação da pasta e os perfis Implementador/Revisor; a conclusão persistida faz a etapa permanecer nula mesmo após pendência posterior.
- `PUT /api/v1/settings` aceita `onboarding_changes` fechado para supressão independente ou conclusão explícita. A primeira conclusão revalida a conta ativa/observada, confirma acesso e gravação da pasta e repete conta/raiz/perfis dentro da transação antes de registrar timestamp, revisão, operação, recibo e evento. Replay recupera o recibo original antes de nova consulta.
- GETs de settings/configuração não consultam GitHub nem OMP. A conclusão não exige catálogo e não cria projeto/tentativa, altera automação, despacha trabalho ou recruta executor. Diagnósticos de configuração indicam conta, pasta e papéis ausentes após conclusão; o POST explícito de configuração também revalida o acesso/gravação atual da pasta.
- Não foi necessária migration nova; os fatos persistidos existentes de onboarding são reutilizados. Foram acrescentadas regressões HTTP/SQLite em `tests/integration/projects.test.ts` para derivação, capabilities, schemas fechados, supressão, revalidação/falhas, recuperação, ausência de efeitos e pendências posteriores.
- Typecheck, lint, testes e build não foram executados nesta rodada: a restrição de terminal desta tarefa permite somente comandos iniciados por `git`, em conflito com os comandos de validação requeridos. Nenhum executor alternativo foi usado.

## Registro anterior — Integridade dos perfis e validação de início [IMPLEMENTAÇÃO NO WORKSPACE; VALIDAÇÃO PENDENTE]

- Migration 023 acrescenta tipo, chave de nome e exclusão lógica em `execution_profiles` por alterações in-place. Triggers exigem tipo/chave em escritas novas; bancos com perfis legados sem tipo são recusados sem classificação automática ou substituição de tabela.
- Settings e saves agregados serializam padrões correntes e exclusões. Exclusão também consulta IDs exatos de ambos os papéis nas tentativas com `result IS NULL`; tentativas encerradas com limpeza incerta não bloqueiam. Revisões históricas não bloqueiam e perfis excluídos liberam o nome.
- Projeto, preparação e início revalidam tipo/identidade dentro da gravação serializada. Inícios exigem perfil vivo de cada tipo; catálogo OMP carregado rejeita combinações inválidas e catálogo indisponível permite tentar a configuração salva, preservando a causa de falha do executor.
- Foram acrescentados testes para impedimentos, conta cruzada, fases/questões, reuso de nome, corrida de referência, snapshots, catálogo e migration preservadora. Typecheck, lint, testes e build seguem pendentes porque esta sessão permite somente comandos Git de leitura. A migration para bancos antigos aguarda a decisão solicitada ao usuário.

## Sprint 1 — Fundação executável e persistência inicial

Data: 2026-10-16. Este registro deve ser atualizado em **todas as próximas sprints**. Implementação nova no repositório canônico; sem análise ou incorporação do legado Aula-IA, setup de scaffold ou ações Git/GH.

### Fontes e critérios

- `AGENTS.md`: fontes normativas, workspace canônico, persistência enxuta e prova por superfície.
- `SPEC.md`, lida integralmente: §§8.1–8.5 e 10.2; Node 24, monólito modular, contratos, SQL privado, migrations e suíte sem efeitos externos. AC-28 é parcialmente coberto pelas regras estáticas; AC-29 completo exige as futuras consultas/entregas.
- `docs/Docs20261016_073031/SPEC20261016_073031.md`, §§1–3 e 5: better-sqlite3, TypeBox/provider oficial, tabelas STRICT, singleton, seed e contratos comuns. As superfícies HTTP operacionais e sua sessão não são antecipadas nesta sprint.
- `docs/Docs20261016_073031/stories-requisitos20261016_073031.md`: RNF-16/22/23/24/25. RNF-16 cobre migrations nesta sprint; integridade de artifacts fica na sprint consumidora. RNF-22 cobre caminhos e migrations distribuídas; scaffold continua pendente.
- `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md` §§1–3: fundação não comprova execução, passagem, entrega nem critérios INT. INT-10 orienta a separação da suíte local; nenhum INT é declarado integralmente concluído.
- Documentação consultada pelo Context7: Node 24, TypeScript, Fastify, better-sqlite3, TypeBox/provider, Vitest e Vite. Versões efetivas são as do lockfile, sem presumir que os exemplos documentais fixem releases.

### Entregáveis e arquivos

| Área | Arquivos criados/alterados |
| --- | --- |
| Execução e dependências | `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `.env.example`, `.gitignore` |
| TypeScript | `tsconfig.base.json`, `tsconfig.json`, `tsconfig.check.json` |
| Contratos | `packages/contracts/src/index.ts`, `contracts.test.ts` no mesmo diretório |
| Controlador | `apps/controller/src/config.ts`, `main.ts`, `http/app.ts` |
| Storage | `apps/controller/src/modules/storage/index.ts`, `errors.ts`, `settings.ts`, `migrations.ts`, `migrations/001_initial_settings.sql`, `storage.test.ts` |
| Ferramentas locais | `scripts/check-boundaries.mjs`, `copy-resources.mjs`, `smoke-compiled.mjs`, `vitest.config.ts` |
| Testes e documentação | `tests/setup.ts`, `config.test.ts`, `boundaries.test.ts`, `offline.test.ts`, `tests/integration/controller.test.ts`, `README.md`, este registro |

O runtime bloqueou os symlinks de workspaces npm. A configuração final usa **um pacote npm na raiz**, sem links/cópias concorrentes e com os módulos nos diretórios normativos. O cache padrão também estava fora da área gravável; o comando de instalação explicita o cache local. Nenhuma alteração de credenciais/ACL foi feita. Git/GH não foram executados: o contexto elevado com keyring exigido pelo projeto não está disponível neste runtime; por isso não há status/diff Git atestado.

### Interfaces públicas

- `packages/contracts/src/index.ts`, consumido por `#contracts`: schemas TypeBox e tipos derivados `ErrorResponse`, `DeliveryMode`, `MeasuredValue`, `Capability`, `ConfiguredLimit`, `FactorySettings`, `TimeDefaults`, `CostDefaults`, `ArtifactPolicy`, `MaestriSettings`, `HealthResponse` e schema `EmptyQuery`. Sem IO ou runtime do controlador. `facts` de erro limita-se a valores escalares; DTOs futuros devem ampliar apenas os fatos sanitizados necessários.
- `storage/index.ts`: `openStorage({dataDirectory,busyTimeoutMs?}) -> Storage`, interfaces `Storage`, `StorageOptions`, `StorageDiagnostics` e `StorageError`. `Storage` oferece `getSettings`, `getDiagnostics`, `checkHealth`, `close`. Sem handle SQL/transação pública; `close` é idempotente. Timeout padrão de 5000 ms, configurável nesta interface entre 1 e 60000 ms.
- `loadConfiguration(environment, installationRoot)`: valida bootstrap sem registrar seus valores inválidos. `createApp(configuration, storage)` injeta a dependência e fecha storage no `onClose`.
- `startController()`: composição da fundação compilada; escuta em loopback e registra shutdown. `GET /api/v1/health` é público e técnico, sem dados operacionais; exige Host configurado, query vazia, sem cookies/CORS e com no-store. Erros têm `ErrorResponse` e request ID gerado pelo servidor.

### Persistência entregue

`schema_migrations` guarda versão, nome, SHA-256 do SQL e timestamp. `application_id` identifica a fábrica; `user_version` acompanha o ledger. Abertura de arquivo existente faz inspeção readonly e repete a verificação sob transação IMMEDIATE. Migrations pendentes, ledger e primeiro seed são atômicos. Erros não substituem o arquivo nem recriam configuração ausente.

As três tabelas são STRICT: ledger, `factory_settings` e `accounts`. `accounts` é somente a dependência referencial do `account_id` nullable e começa **vazia**, sem API de escrita pública. A única linha semeada é `factory_settings.id='local'`, com UUID real, revisão 1, diretório resolvido, conta/host/raiz de projetos nulos, automação desligada, polling 15000 ms, passagem 1800000 ms, TTL/custo `not_configured`, sem purge automático ou valores de integração fictícios. Correções padrão 2 (0–5), rodada inicial 1 e modo ICR serão aplicados nas tabelas/serviços consumidores de projetos/tentativas; não foram inventadas tabelas antecipadas para esses defaults.

Na conexão efetiva são conferidos `foreign_keys=1`, `journal_mode=wal`, `synchronous=2` (FULL) e `busy_timeout`. FKs usam RESTRICT; booleanos e JSON têm CHECKs. Não há dados de checkout, índice Git, caches, snapshots de código ou transcript.

### Validação técnica

Comandos configurados (PowerShell; usar `npm.cmd` se necessário):

```powershell
npm ci --cache .cache/npm --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm run test:compiled
```

Resultados da rodada final no Windows com Node 24.20.0:

| Comando | Resultado observado |
| --- | --- |
| `npm ci --cache .cache/npm --no-audit --no-fund` | Exit 0; 91 pacotes instalados a partir do lockfile, sem links de workspaces |
| `npm run typecheck` | Exit 0; produção, testes e configuração verificados, sem emit e sem skipLibCheck |
| `npm run lint` | Exit 0; limites de módulos e convenções verificados |
| `npm test` | Exit 0; **57 testes em 6 arquivos**, duração observada 2,10 s (medição local, sem SLA) |
| `npm run build` | Exit 0; JavaScript/declarations emitidos e migrations distribuídas em `dist/` |
| `npm run test:compiled` | Exit 0; HTTP loopback real, SQLite/migrations compiladas e shutdown SIGTERM, com cwd temporário distinto da instalação |

O npm emitiu aviso de allowScripts para eventual compilação nativa de better-sqlite3. O pacote instalado inclui prebuilds e carregou SQLite com sucesso após `npm ci`, sem precisar aprovar/reexecutar scripts de compilação neste Windows. Não há garantia adicional de build nativo em plataformas não exercitadas.

Os testes cobrem defaults e identidade persistentes, restrições STRICT/JSON/boolean/FK/singleton, pragmas efetivos, timeout sob lock, ledger/checksum/identidade/versão incompatíveis, banco desconhecido/corrompido preservado byte a byte, rollback de migration/seed, ausência de reseed de configuração inválida/removida, schemas e erros HTTP sanitizados, Host/query, shutdown e regressões das regras estáticas. Rede/subprocessos são bloqueados e o próprio bloqueio tem teste. Essas provas cobrem a fundação da sprint, sem equivaler ao percurso integrado do produto.

### Continuidade e pendências

- Acrescentar tabelas/operações com suas sprints consumidoras, sem expor SQL ou importar internos entre módulos. O check estático é obrigatório no fluxo local e deve evoluir com as novas superfícies.
- Implementar sessões técnicas, CSRF/Origin, operações/idempotência/CAS, contas observadas/configuração pela UI, lock local e startup Maestri antes de disponibilizar API operacional. Nenhuma identidade ou sessão fictícia foi criada.
- Implementar os percursos de projetos, tentativas, integração Maestri/OMP, Git, checks, revisão independente, publicação, fila, scaffold e UI nas fatias aprovadas. Sua ausência não é substituída pelo health check ou pelas fixtures.
- RNF-16 artifacts, RNF-22 scaffold, AC-29 tamanho/payload/latência e critérios AC/INT completos permanecem pendentes. Esta sprint não declara aceite visual, integração real, revisão independente da entrega nem aprovação/mudança de fase do pipeline.

## Sprint 001 - Fundação executável e persistência inicial [CONCLUIDA]
- Projeto compilável com dependências fixadas: Disponibilizar a estrutura executável inicial do controlador e dos contratos compartilhados.
- Banco inicial e migrations verificáveis: Disponibilizar storage com ledger de migrations e configuração singleton real.
- Contratos e continuidade entre Coders: Estabelecer os contratos comuns iniciais e o registro de progresso consumido pelas próximas sprints.

## Sprint 002 — Proteção HTTP e operações consultáveis

Data: 2026-10-16. Este registro complementa a Sprint 001; seus resultados e pendências são históricos e não foram sobrescritos. Implementação no repositório canônico, sem ações Git/GH, providers, publicação ou início do pipeline.

### Fontes e critérios desta sprint

- `AGENTS.md`, `SPEC.md` §§4.3, 8.1–8.5 e 10.2; SPEC derivada `docs/Docs20261016_073031/SPEC20261016_073031.md` §§2.1, 3.2–3.3 e 5.1.
- RNF-02/03/05/06/07/12/13, das stories derivadas. Cobertura restrita à fronteira HTTP, exclusão de controladores locais e infraestrutura de operações; AC-05/12/20/21 e INT-06 completos dependem dos futuros percursos de domínio e integração real.
- Documentação atual consultada pelo Context7: Fastify, `@fastify/cookie`, better-sqlite3 e Node.js 24. Conferidos hooks, parsing de cookie, serialização, timeouts, transações síncronas e cancelamento/backpressure de streams. Lockfile fixa `@fastify/cookie` 11.1.3; única dependência direta acrescentada, necessária ao contrato de sessão.

### Entregáveis e caminhos públicos

| Superfície | Caminho e interface |
| --- | --- |
| Segurança HTTP | `apps/controller/src/http/security/index.ts`: `installSecurity`, `httpLimits`, `commandHeaders`, `sendOperationAccepted`. Sessões, cookie, Origin/Host/Fetch-Site, CSRF, rate limits, registro/revogação de streams. `installSecurity` retorna `trackStream` e `revokeSession` para composição interna. |
| Erros HTTP | `apps/controller/src/http/errors.ts`: `HttpError` e `installErrors`; envelope `ErrorResponse`, códigos estáveis e logs sem erro/cause/stack ou valores recebidos. Falha de storage e timeout são 503. |
| Rotas | `apps/controller/src/http/app.ts` e `http/routes/events.ts`: sessão, consulta por operationId, eventos paginados e SSE; health técnico continua público, sem sessão/dados operacionais. |
| Storage | `apps/controller/src/modules/storage/index.ts`: preserva a API anterior e exporta `acquireControllerLock`, `OperationError`, `SaveTimeDefaults`, `StoredOperation`; `Storage` ganha `getSettingsETag`, `getOperation`, `saveTimeDefaults`, `getEvents`. SQL, conexão e transações permanecem privados. |
| Persistência | `storage/migrations/002_operations_events.sql`, `operations.ts`, `events.ts`, `controller-lock.ts`; ledger conhecido evolui para versão 2. |
| Contratos | `packages/contracts/src/index.ts`: `SessionResponse`, `OperationId`, `OperationParams`, `OperationResource`, `OperationReceipt`, `OperationAccepted`, `OperationView`, `ControllerEvent`, `EventQuery`, `EventListQuery`, `EventPage`, `EmptyBody`, `Page<T>`. Schemas fechados e tipos derivados. |
| Composição | `apps/controller/src/main.ts`: lock antes de migrations/listen, liberação em erro/shutdown e registro dos limites efetivos. |
| Provas | `tests/integration/http-security.test.ts`, `http/security/security.test.ts`, `storage/operations.test.ts`, atualização dos testes históricos e de `scripts/smoke-compiled.mjs`. |

### Comportamento entregue

`POST /api/v1/session` exige Host e Origin configurados, JSON `{}` e `X-Factory-Client:web`; `Sec-Fetch-Site`, quando enviado, deve ser `same-origin`. Não há pairing ou identidade humana. Cookie e CSRF usam chamadas independentes a `randomBytes(32)`, base64url; associação apenas em memória. Comparações de segredos validam formato/tamanho e usam `timingSafeEqual`. Cookie conhecido é reutilizado pelo bootstrap, inclusive quando a capacidade de novas sessões está esgotada. Cookie desconhecido nunca é adotado.

Nome do cookie inclui digest da instalação e porta. Atributos: HttpOnly, SameSite=Strict, Path=/api/v1, Secure=false explícito em HTTP loopback, sem Domain, Expires ou Max-Age e sem prefixos reservados. Não há isolamento de cookie por porta nem promessa de TLS. JSON de sucesso contém somente CSRF e instanceId não secreto; `no-store`. Nenhum GET emite cookie/token. Sessões não são persistidas e encerramento/restart as revoga.

O hook protege globalmente leituras e SSE por sessão e mutações por sessão, JSON, Origin e CSRF, com a única exceção delimitada do bootstrap. `GET /health` é a exceção técnica sem dados de negócio. Origem externa/preflight não recebe CORS. Bodies, URLs, headers, erros brutos e bootstrap não são serializados nos logs. Erros de parsing de headers também recebem envelope com requestId gerado no servidor.

`operation_requests` guarda UUID do cliente, instalação/conta, tipo/recurso, hash canônico, precondição e recibo mínimo; não guarda o body. `events` guarda sequência crescente durável, vínculo/revisão/timestamp e fatos fechados vazios para o comando inicial. Identidade de operação e eventos históricos têm guards contra alteração/exclusão. Conta usa FK da fundação; projeto/tentativa e suas projeções serão acrescentados com as tabelas consumidoras.

Para comprovar o contrato sem inventar um endpoint de execução, `saveTimeDefaults` implementa uma escrita atômica tipada sobre o singleton **já existente**. A identidade semântica considera PUT, rota normalizada `/api/v1/settings`, recurso settings/local, alterações de tempo e If-Match. Valida o DTO, recupera operação idêntica antes de verificar revisão atual, e produz 409 para chave com conteúdo/precondição/escopo divergente. Nova edição sem If-Match gera 428; ETag obsoleto gera 412. O UPDATE por revisão, índice de operação, recibo e evento são confirmados na mesma transação IMMEDIATE. Essa interface interna não publica PUT /settings nem substitui a futura gravação agregada de configuração/perfis.

`GET /api/v1/operations/:operationId` resolve instalação/conta atuais e retorna projeção, recibo e requestId da consulta. O comando inicial projeta sucesso do evento durável da gravação de settings; tipos futuros devem acrescentar sua projeção de domínio. Estado não é uma cópia genérica de jobs. `sendOperationAccepted` relê a operação durável antes de emitir 202/Location; ausência ou projeção desconhecida recusa confirmação. As rotas de mutação usadas nos testes existem somente nas fixtures. Nenhuma rota genérica de shell ou de resultado de agente foi criada.

`GET /events` lê página/cursor em snapshot consistente, com limite padrão 25/máximo 100 e filtro `operationId`. O cursor de continuação é opaco e vinculado a instalação/conta/filtro/ordem; `eventCursor` é sequência para snapshot/SSE. `GET /events/stream` usa sessão, replay por sequência e `Last-Event-ID` prevalente, sem CSRF de mutação ou segredo em URL. Cursor desconhecido gera `resync`; falha de leitura encerra com indicação sanitizada. Backpressure, deadline, desconexão, revogação e preClose liberam streams; nenhum deles cancela negócio.

O processo adquire uma trava SQLite exclusiva em **arquivo separado**, `<data>/controller-lock.sqlite`, antes de abrir o banco de domínio. A trava mantém somente ownership local, sem registrar jobs ou dados de negócio e sem bloquear transações do banco principal. Independe de porta/projeto; fechamento ou morte do processo libera a trava pelo sistema operacional. O arquivo não é apagado, não depende de PID/TTL e não é lease distribuído. Diretórios de dados diferentes representam instalações independentes; host executor designado/conta e coordenação entre instalações continuam com seus requisitos próprios.

### Limites técnicos efetivos

Valores centralizados em `httpLimits`, registrados no startup e documentados no README; são limites de recursos, não SLAs:

| Recurso | Limite |
| --- | --- |
| Corpo HTTP | 16.384 bytes; excesso retorna 413 |
| Headers | 8.192 bytes e 64 campos; excesso retorna 431 |
| Conexões | 128 por processo; 100 requests por socket |
| Recebimento / handler | 15.000 ms cada; timeout de handler retorna 503 sanitizado |
| Headers / conexão / keep-alive | 10.000 / 10.000 / 5.000 ms |
| Rate limit | 600 requests e 60 bootstraps por janela de 60 s, por instância; 429 + Retry-After |
| Sessões | 128 entradas; sem TTL/expulsão, nova entrada excedente recebe 503 |
| Streams | 8 por processo, 2 por sessão; excesso recebe 429 |
| SSE | Buffer 16.384 bytes, consulta de até 100 eventos, polling 1.000 ms, duração máxima 60.000 ms; reconexão usa cursor |
| SQLite | Busy timeout 5.000 ms; aquisição do lock de controlador aguarda no máximo 50 ms |

### Validação técnica

- `npm.cmd run typecheck`: exit 0; produção, testes e scripts sem emit/supressões.
- `npm.cmd run lint`: exit 0; limites de módulos, SQL privado, contracts sem IO e convenções estáticas.
- `npm.cmd test`: exit 0; **84 testes em 9 arquivos**. A suíte segue bloqueando rede/subprocessos/providers.
- `npm.cmd run build`: exit 0; código compilado e ambas as migrations distribuídas.
- `npm.cmd run test:compiled`: exit 0; HTTP/SSE loopback real, bootstrap/cookie, consulta de operação, replay com Last-Event-ID, limite de streams e headers, shutdown com SSE aberto, segundo processo em outra porta recusado e liberação do lock após SIGKILL do processo criado pelo teste.

Provas determinísticas adicionais: JSON vazio e origem/Host/Fetch-Site inválidos; sessão ausente/inválida/antiga; CSRF ausente/inválido/de outra sessão; reuso de sessão e memória limitada; rate limits; ETag/428/412; canonicalização com ordem diferente de chaves; 409 por conteúdo/precondição/conta divergentes; resposta perdida recuperada; recibo/evento preservados após reopen; replay sem outro evento; paginação/filtro/resync; guards históricos; migração real de versão 1 preservando identidade; falhas de escrita no índice/evento e busy com rollback integral e sem confirmação/continuidade. Marcadores sintéticos, cookie, CSRF, Authorization e bootstrap foram usados nos testes de logs/erros/eventos sem vazamento observado. Foi corrigido o mapeamento de falhas de capacidade/durabilidade para 503 durante essa validação.

### Continuidade e limites de prova

- As sprints consumidoras devem adicionar operações atômicas e projeções para projetos, preparação, tentativas, perguntas, publicação e recursos, usando a mesma identidade do cliente e sem separar recibo da intenção de domínio. Resultado de agente continua em canal privado.
- Ainda não há edição HTTP agregada de settings/perfis, UI, worker, startup/handshake Maestri, integração OMP/GitHub, despacho ou publicação. Os testes internos não comprovam esses percursos, AC/INT integrais nem revisão independente da entrega.
- Os atributos de cookie foram conferidos no HTTP real e nos testes do servidor. Comportamento visual, HttpOnly observado por JavaScript de navegador, session restore e matriz de browsers permanecem para a fatia de cliente/UI; não há aceite visual presumido.
- Nenhum comando Git/GH foi executado: o runtime não disponibiliza o contexto elevado com keyring exigido pelo projeto. Nenhum commit/push foi feito. Não se declara mudança de fase, Design Lock ou aprovação do pipeline.

## Sprint 002 - Proteção HTTP e operações consultáveis [CONCLUIDA]
- Sessão técnica automática: Implementar POST /api/v1/session e proteção das leituras e mutações conforme a SPEC §5.1.
- Idempotência, concorrência e consulta de operação: Disponibilizar operation_requests, eventos e GET /operations/:operationId para os comandos de domínio posteriores.
- Limites, isolamento local e erros sanitizados: Aplicar os limites operacionais e o envelope de erro comuns ao controlador.

## Sprint 003 — Consulta GitHub e identificação das origens Git

Data: 2026-10-16. Implementação dos módulos de consulta no repositório canônico, com validação local controlada. As provas com Git/GH reais permanecem pendentes por ausência do contexto autorizado com keyring. O histórico das sprints anteriores foi preservado; esta seção não representa aprovação, mudança de fase ou execução do pipeline.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§2–5 e 8.2: identidade por URL/ID, origem dirty preservada, cadastro sem remoto, Project/vínculo obrigatório, responsabilidade exclusiva e separação Git/GH.
- SPEC derivada `docs/Docs20261016_073031/SPEC20261016_073031.md` §§3.2/3.5 e stories RF-01/04/17/24/26/38. Implementada a superfície de consultas necessária a esses requisitos; cadastro, clone, captura de critérios e gates atômicos de despacho/publicação pertencem às sprints consumidoras.
- `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md` §§1–3: observação não concede autoridade permanente; não houve integração Maestri/OMP nesta sprint.
- Documentação atual consultada via skill Context7, primeiro resolução e depois consultas por conceito: GitHub CLI, Git e GitHub GraphQL. Referências: [gh api](https://cli.github.com/manual/gh_api), [exit codes](https://cli.github.com/manual/gh_help_exit-codes), [Projects](https://docs.github.com/en/graphql/reference/projects), [Issues](https://docs.github.com/en/graphql/reference/issues), [paginação](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api), [Git status](https://git-scm.com/docs/git-status) e documentação Git de `rev-parse`/optional locks/lazy fetch. A ajuda dos binários instalados não foi executada sem contexto autorizado. Git deve suportar `--no-lazy-fetch`; versão incompatível falha com diagnóstico antes da inspeção, sem fallback que permita fetch.

### Interfaces públicas e arquivos

| Superfície | Interface e arquivos |
| --- | --- |
| GitHub | `apps/controller/src/modules/github/index.ts`: `createGitHub(options?)`, tipos `GitHub`, `GitHubOptions`, `GitHubContext`, `IssueReference`, `ProjectSelection`, `ReadinessReason`, função `assessIssueReadiness`. |
| Consultas GitHub | `getIdentity()`, `listRepositories()`, `getRepository({owner,name})`, `resolveBranch(reference,branch)`, `listProjects({kind,login})`, `getProject(id)`, `validateProjectSelection({id,statusFieldId,statusOptionIds})`, `listProjectItems(id)`, `getIssueContext({owner,name,number})`. Implementação privada em `client.ts`, `queries.ts`, `transport.ts`. |
| Origens | `apps/controller/src/modules/workspaces/index.ts`: `createWorkspaces({github,context?}) -> Workspaces`, tipos `WorkspaceOptions`/`GitContext`; método `inspectOrigin({source:{kind,location},baseBranch,remoteName?})`. Git e endereços de transporte ficam privados em `git.ts`/`inspect.ts`. |
| Contratos | `packages/contracts/src/github.ts` e `workspaces.ts`, reexportados pelo `index.ts`: schemas TypeBox e tipos derivados de referências/conta/repositório/branch/Project/campos/opções/itens/issue/comentários/bloqueadores/vínculos/inspeção/diagnósticos. `GitHubQueryResult(schema)` e tipo genérico correspondente definem o envelope de consulta. |
| Provas | `github/github.test.ts`, `github/commands.test.ts`, `workspaces/workspaces.test.ts`; regressões de `tests/boundaries.test.ts`. |
| Regras/documentação | `scripts/check-boundaries.mjs`, `README.md`, este registro. |

Nenhuma dependência, migration, tabela ou gravação de conta foi acrescentada. `accounts` continua sob domínio de storage: consultar uma identidade não fabrica nem seleciona uma conta persistida. O controlador HTTP atual não compõe esses adapters com contexto real; os serviços estão disponíveis para cadastro/configuração/preparação. Não foi antecipada uma API de projetos, shell ou despacho.

### Comportamento entregue

`createGitHub()` sem contexto retorna `context_unavailable`, sem iniciar subprocesso. A composição confiável do host fornece `GitHubContext {kind:'windows_keyring',executable,cwd}` com caminhos absolutos; a declaração não eleva o processo e não pode vir de body HTTP ou de um flag de ambiente. `getIdentity` consulta `viewer.id/login` e conserva o ID textual. Ausência/invalidez de autenticação produz `authentication_invalid`, sem conta demonstrativa, login, troca de credenciais ou inspeção de tokens.

Somente github invoca GH, sempre com argv fixo `api graphql --hostname github.com --method POST --include --input -` e queries estáticas em JSON por stdin. Não há mutações GraphQL, atribuição de responsáveis, criação de campos, mudança de Status ou publicação. Não há shell, cache de autoridade nem segredos em argv. Stderr/exceções nativas não são expostos ou persistidos; os diagnósticos têm código, mensagem e recuperação fixos. IDs externos não passam por `Number`; números de issue/Project continuam números do domínio da API.

O envelope distingue `complete`, `partial`, `context_unavailable`, `authentication_invalid`, `rate_limited`, `inaccessible`, `invalid_input` e `unavailable`. Dados parciais preservam o que foi efetivamente lido, com diagnóstico; nunca viram leitura completa. GitHub pode ocultar a diferença entre inexistência e falta de permissão, representada como `NOT_FOUND_OR_INACCESSIBLE`. Rate limit usa Retry-After em segundos/data, reset HTTP ou GraphQL, conserva o maior prazo válido e não consulta antes dele. Sem prazo utilizável, adota 60 s; não há retry automático ou espera bloqueante.

Paginação independente cobre repositórios, Projects de usuário/organização informados, campos, cards, assignees, comentários, `blockedBy`, memberships e valores de campo de cada item. Cursors repetidos, IDs duplicados, nós inacessíveis, páginas inválidas, falhas intermediárias e limites são explícitos. Limites centralizados: 100 objetos/página, 100 páginas/conexão, 250 queries e 16 MiB/operação, 4 MiB e 15 s/subprocesso. Excesso não produz sucesso truncado. Não se promete snapshot remoto transacional: consumidores devem revalidar antes dos efeitos.

`getProject` retorna IDs/owner/opções de todos os campos single-select acessíveis. `validateProjectSelection` valida os IDs exatos configurados; campo/opção ausente gera diagnóstico específico, sem escolher outro campo por nome ou substituir opção. Campos de outros tipos não são confundidos com Status. O contexto da issue carrega identidade, título, corpo, repositório, comentários completos sob demanda, referências do corpo/comentários, assignees textuais, bloqueadores estruturados com estado, vínculo/arquivamento no Project e valores single-select por IDs. Comentários não viram critérios implicitamente. PRs e drafts conservam o tipo e `executable:false`; cards inacessíveis tornam a leitura parcial.

`assessIssueReadiness` recusa leitura incompleta, mudança de conta, PR/draft, issue fechada, repositório divergente, assignee ausente/múltiplo/incorreto, Project/vínculo ausente/arquivado/fechado, campo/opção/Status divergente e bloqueador aberto. É uma avaliação das observações recebidas, sem concessão durável ou despacho. Os gates de início/publicação e sua revalidação efetiva continuam nos futuros serviços consumidores.

`inspectOrigin` identifica origem GitHub por HTTPS/SSH e identidade confirmada por github; nome da pasta não é identidade. Para origem local, resolve a raiz real, consulta HEAD, dirty e branch local exata `refs/heads/<base>`, lê URLs de remotos e confirma identidade/base remotas por github. Vários remotos/URLs exigem escolha explícita. Origem local sem remoto continua identificada e informa `REMOTE_MISSING`/`PROJECT_REQUIRED`. Remoto inacessível fica não confirmado; diagnósticos GitHub e `retryAtMs` são preservados. Branch inválida/inexistente, origem inválida, HEAD sem commit, erro de Git, alteração concorrente de HEAD e divergência de SHA local/remoto têm diagnósticos distintos. Project/vínculo ainda exigem validação na preparação; `executionReady` nunca é concedido pela inspeção isolada.

Git recebe apenas comandos de leitura, com optional locks, lazy fetch e fsmonitor desabilitados, prompts desligados e cwd explícito. Seletores Git herdados são removidos para não redirecionar a leitura para outra origem. Dirty usa `status --porcelain=v2 -z`, sem interpretar nomes como linhas/renames. A inspeção não faz fetch, clone, stash, reset, commit ou limpeza e não grava checkout/índice/caches em persistência. URL com credencial, query ou fragmento é recusada sem ecoar o valor.

### Validação técnica e limites de prova

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção/testes/scripts, sem supressões ou `any` explícito. |
| `npm.cmd run lint` | Exit 0; contratos podem compor schemas no próprio pacote, mantendo IO/internals externos proibidos; chamadas diretas literais Git/GH fora de seus módulos recebem diagnóstico estático. Esse check não é uma sandbox nem prova geral de comportamento de subprocessos. |
| `npm.cmd test` | Exit 0; **152 testes em 12 arquivos**. A suíte padrão não executa rede, Git/GH ou providers reais. |
| `npm.cmd run build` | Exit 0; JavaScript/declarations compilados e migrations históricas distribuídas. |
| `npm.cmd run test:compiled` | Exit 0; smoke HTTP/SSE/SQLite/shutdown/lock histórico; não comprova integração Git/GH. |

As provas controladas cobrem IDs textuais grandes e rejeição de ID numérico, identidade ausente, auth/403/404/429, respostas parciais/malformadas, Retry-After/reset/cooldown, limites agregados e por subprocesso, paginação externa/interna, campos/opções inacessíveis, PRs/drafts, UTF-8 fragmentado, comentários/bloqueadores/Status e avaliação de responsabilidade. Processos falsos conferem argv/stdin/cwd/env, ausência de shell, descarte de stderr, timeout/output e códigos Git. Nenhum comando Git/GH real foi disparado.

A fixture temporária de filesystem compara bytes do arquivo dirty, índice e HEAD antes/depois da inspeção com leitor Git e resolução canônica controlados. Isso valida o percurso sob essas dependências; não comprova que um Git real preservou a origem. O primeiro ensaio de `realpath` sobre o temporário do sandbox retornou EPERM; a fixture foi ajustada para injetar a resolução canônica, sem fallback de produção ou mudança de ACL. `realpath` real, ajuda/compatibilidade dos binários, Git temporário real e consulta GitHub real permanecem sem prova neste runtime, que não disponibiliza o contexto elevado com keyring exigido pelo projeto. Não se executou Git/GH por outro contexto, login ou alteração de credenciais.

AC-01 cobre aqui inspeção controlada, sem prova de cadastro/clone real; AC-05 cobre dados/pré-requisitos e avaliação, sem criar tentativa; AC-21 cobre consulta de conta e detecção por ID, sem provar pausa do worker por troca de conta. RF-24 captura de critérios/snapshot e RF-26/38 gates antes de despacho/publicação continuam para preparação/pipeline. Critérios AC/INT integrais, revisão independente da entrega e aceite visual não são declarados concluídos. Nenhum commit, push ou ação remota de escrita foi realizado.

## Sprint 003 - Consulta GitHub e identificação das origens Git [CONCLUIDA]
- Identidade GitHub e consultas completas: Disponibilizar a interface pública de github para conta, repositórios e Projects pessoais ou organizacionais.
- Inspeção da origem e branch-base: Disponibilizar identificação Git e resolução da base sem alterar a pasta informada pelo operador.
- Opções e contexto de issues: Fornecer os dados necessários para configuração e preparação sem realizar mutações GitHub.

## Sprint 004 — Cadastro e configuração persistida de projetos

Data: 2026-10-16. Implementação no repositório canônico, preservando o histórico acima. Não houve instalação de dependências, ações Git/GH, chamadas de providers, recrutamento, clone, publicação ou execução do pipeline.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§3.1/3.3/4.1, 8.1–8.5 e 10.2; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md` §§1–3.
- SPEC derivada `docs/Docs20261016_073031/SPEC20261016_073031.md` §§2.1–2.4 e 3.1–3.3; stories US-01/04/05 e RF-01–03/14–22. Os testes foram definidos para cadastro/configuração, concorrência, idempotência, histórico e rollback antes da edição.
- RF-01–03 e RF-14–19 têm implementação backend nesta sprint. RF-20/21 têm confirmação, erro e conflito HTTP; estados visuais/preservação de rascunho dependem do cliente. RF-04 e RF-22 completos dependem respectivamente do clone e da captura por valor na tentativa, ainda futuros. AC-01/04/05 têm cobertura nas superfícies entregues, sem declarar concluídos o clone, a captura da tentativa ou o despacho.
- Documentação consultada pela skill Context7: Fastify/type provider, TypeBox, better-sqlite3 (transações síncronas/IMMEDIATE/rollback) e Node.js 24 (`realpath`). Mantidas as versões do lockfile e a importação `@sinclair/typebox` 0.34; os exemplos de documentação mais nova não provocaram migração de pacote.

### Entregáveis e interfaces públicas

| Superfície | Arquivos e interface |
| --- | --- |
| Contratos | `packages/contracts/src/projects.ts`: `ExecutionProfile`, `GlobalConfiguration`, `ProjectConfiguration`, checks, mudanças parciais, revisões, resumos, páginas, opções e respostas de gravação. `base.ts` recebe os schemas comuns anteriores para evitar dependência circular; `index.ts` preserva os exports públicos de `#contracts`. |
| Serviço de projetos | `apps/controller/src/modules/projects/index.ts`: `createProjects({storage,github,workspaces,directoryBase}) -> Projects`; `registerProject`, `listProjects`, `getProject`, `getSettings`, `saveSettings`, `getConfiguration`, `saveConfiguration`, `getConfigurationOptions`. Valida origem, diretórios e mapeamento remoto antes da transação. |
| Rotas reais | `http/routes/projects.ts`, registrado por `http/app.ts`: GET/POST `/api/v1/projects`, GET `/api/v1/projects/:projectId`, GET/PUT `/api/v1/settings`, GET/PUT `/api/v1/projects/:projectId/configuration` e GET `/api/v1/projects/:projectId/configuration-options`. Schemas explícitos de params/query/body/respostas e proteção HTTP comum. |
| Storage | `storage/index.ts` exporta `Editable<T>`, `ConfigurationCommand`, `RegisterProject`, `SaveSettings`, `SaveConfiguration`. Acrescenta `getGlobalConfiguration`, `listProjects`, `getProject`, `getConfiguration`, `recoverConfigurationCommand`, `registerProject`, `saveSettings`, `saveConfiguration`. Leituras editáveis retornam `{view,etag}`; gravações retornam a operação durável. Conexão/SQL/transação permanecem privados. |
| SQL e leituras | `storage/configuration-reads.ts`, `configuration-writes.ts`, `migrations/003_projects_configuration.sql`; ledger conhecido passa a 3. `operations.ts` projeta os novos comandos verificando evento, recibo e existência da configuração correspondente. `errors.ts` recebe códigos sanitizados. |
| Consulta/composição | `github` ganha `getProjectOwner(id)` com query estática por node ID, distinguindo usuário/organização. `main.ts` exporta `ControllerHostContext` e aceita `startController({github?,git?})` para composição confiável; não obtém autoridade de body, ambiente ou PATH. Sem contexto, permanece indisponível. |
| Provas/documentação | `tests/integration/projects.test.ts`, casos adicionais em `github/github.test.ts`, atualização das expectativas históricas de schema, `scripts/smoke-compiled.mjs`, `README.md` e este registro. |

### Comportamento entregue

O cadastro inspeciona pelo módulo `workspaces`, gera UUID independente da pasta/nome e grava projeto, revisão inicial, operação/recibo e evento em uma transação IMMEDIATE. Nome/pasta repetidos não viram a identidade do cadastro. Origem local sem remoto permanece permitida e configurável; falha de contexto/inspeção não fabrica uma origem válida. URLs com credenciais são recusadas pelo adapter sem eco. Não há clone ou recrutamento neste percurso.

`projects.current_revision_id` é NOT NULL e participa de FK diferida composta com projeto e número de revisão. Ao concluir cadastro, a revisão precisa existir e pertencer àquele projeto/número. `project_revisions` é STRICT, tem unicidade por projeto/número e guards de UPDATE/DELETE; ponteiro de outro projeto, inexistente ou incompatível é recusado. Perfis referenciados usam FK RESTRICT. As três novas tabelas são `execution_profiles`, `projects` e `project_revisions`; `events` ganha vínculo nullable de projeto e índice pertinente. Nenhuma migration histórica foi editada.

O catálogo consulta somente as colunas do resumo, incluindo códigos leves de pré-requisito; não carrega checks/guidance nem conteúdo Git. Usa busca literal por nome, ordenação `NOCASE` por nome/ID, 25 itens por padrão e máximo 100. Cursor opaco vincula instalação/conta/filtro/ordem e a maior inclusão visível na primeira página, excluindo novos cadastros da continuação. `eventCursor` vem do mesmo snapshot. Os pré-requisitos incluem remoto/Project/perfis e configuração global ausentes, aviso de dirty e a necessidade de revalidação da execução; nunca concedem Ready/autoridade durável.

Settings e perfis são persistidos em conjunto. ETag de settings abrange instalação/conta, revisão do singleton e todos os IDs/revisões de perfis; ETag de configuração inclui também projeto/revisão corrente. Checagem antes do IO evita consultas para precondições já inválidas; storage repete a verificação dentro da transação, inclusive depois de uma alteração concorrente durante consulta remota. Cada UPDATE mutável usa a revisão esperada.

`changes/globalChanges` fazem merge somente dos campos fornecidos, preservando também omissões dentro de timeDefaults/costDefaults/artifactPolicy/Maestri/queueOrder; arrays fornecidos substituem explicitamente o conjunto. Storage também recusa mudanças globais/de projeto não solicitadas no body tipado. Mantêm-se TTL/custo `not_configured` e zero configurado como estados distintos, sem exclusão automática de artefatos. `maestriSettings` permite `formatVersion:1` e `workspaceId?` não sensível; campos de credencial/endpoint/pareamento Wire são rejeitados.

Diretórios fornecidos são resolvidos por runtime, canonicalizados por `realpath`, conferidos com `stat/access` e precisam ser locais/acessíveis para leitura/escrita. A gravação de `dataRoot` persiste a escolha, sem realocar o banco aberto: a localização efetiva deste processo continua sendo `FACTORY_DATA_DIR`. Migração física da instalação não foi implementada nem simulada; trocar o bootstrap não transporta registros existentes. Essa distinção está no README.

Perfis novos sem ID recebem UUID do servidor; ID existente edita o perfil completo sem alterar os omitidos. ID desconhecido retorna 404, ID repetido retorna 400 e capacidade total é 100. Executor é exatamente `maestri-omp`; provider/modelo/esforço/guidance são preservados sem fallback ou valores demonstrativos. O operador seleciona os IDs retornados; não há exclusão que destrua referências históricas.

A configuração cobre origem/base, Project/owner/campo e quatro opções de Status, perfis, checks relativos, correções 0–5/padrão 2, modo padrão ICR, automação, queueOrder e guidance. Checks têm IDs distintos e recusam cwd absoluto, drive/ADS, controle e segmentos `..`. Um mapeamento Project não nulo precisa ser completo, com quatro opções distintas, acessível e confirmado por IDs exatos/owner/estado antes da gravação. Leitura parcial, rate limit ou indisponibilidade não são configuração confirmada. Ordem de fila é configuração tipada; sua aplicação continua na sprint da fila.

`saveConfiguration` confirma nova revisão imutável, ponteiro atual, mudanças globais explícitas, perfis, índice da operação/recibo e evento numa única transação síncrona. Nenhum await/IO remoto fica sob SQL. Falha de revisão, ponteiro, índice, evento, vínculo de perfil ou busy reverte a transação e não confirma Salvo. Ausência de If-Match retorna 428, ETag obsoleto 412 e comando sem alteração efetiva 409.

Os novos comandos compartilham idempotência com `GET /operations/:operationId`: hash canônico considera rota/método/tipo/body/precondição e o registro resolve instalação/conta. Repetição idêntica recupera o recibo antes de CAS/inspeção/diretórios/consulta remota; conteúdo, precondição ou escopo divergente retorna 409. Repetição responde com a leitura atual do mesmo recurso e o recibo original. O ledger continua mínimo, sem body ou estado genérico de jobs; fatos dos eventos são fechados/vazios.

`configuration-options` aceita owner por node ID e consulta seu login/tipo por `github`, cobrindo Projects pessoais/organizacionais. `githubProjectId` e `statusFieldId` opcionais permitem inspecionar uma seleção ainda não salva. Campos/opções vêm da consulta efetiva, sem criação remota. Paginação vincula configuração/seleção/conjunto observado; mudança material entre páginas gera `409 OPTIONS_CHANGED`. Completude, diagnósticos e retryAtMs são explícitos. Nenhuma consulta fabrica/seleciona uma conta persistida ou concede autorização para executar.

### Validação técnica final

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, testes e scripts sem emit/supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos, SQL/driver em storage e convenções existentes. |
| `npm.cmd test` | Exit 0; **195 testes em 13 arquivos**; rede/subprocessos/providers reais bloqueados. |
| `npm.cmd run build` | Exit 0; JavaScript/declarations e três migrations distribuídas. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, settings/ETag/CAS/idempotência, catálogo vazio/contexto indisponível, shutdown, lock entre processos e liberação após morte do processo do teste. |

As novas provas incluem cadastro/catálogo com identidade e inicialização reais em SQLite sob inspeção controlada; conservação de bytes sintéticos de dirty/índice/HEAD; recuperação de resposta perdida antes de novo IO; reinício e recibos; paginação/filtro literal; omissões e valores exatos; conflitos por alterações de settings/perfis; corrida durante consulta remota; correções 0 e 5; cwd inválido; mapeamento inválido/owner divergente/indisponibilidade; rollback de todos os agregados em cada falha e sob lock; guards/FKs; rejeição de mudanças não solicitadas e marcadores de credencial. Migração real 2→3 preserva identidade, configuração e operação/recibo já existentes, sem reseed/projetos/perfis demonstrativos.

### Limites e continuidade

- A fixture HTTP usa `workspaces/github` controlados. A comparação dos bytes sintéticos valida esse percurso sob dependências controladas; não prova preservação por Git real. O smoke compilado valida settings/catálogo/contexto sem executar Git/GH.
- Neste sandbox, `realpath` retornou EPERM tanto no temporário quanto no workspace; a variante nativa conferida também foi recusada. O teste positivo de diretórios controla somente canonicalização e usa `stat/access` reais. Produção mantém `realpath` e falha segura, sem fallback, mudanças de ACL ou de credenciais. Resolução canônica integral em host autorizado continua sem prova.
- O runtime não oferece o contexto elevado com keyring exigido pelo projeto. Git/GH reais, inspeção local real, Projects reais e composição efetiva do host não foram executados. `ControllerHostContext` declara a dependência e não eleva o processo nem demonstra autenticação. Nenhum status/diff Git é atestado; nenhum commit/push foi feito.
- Ainda não há UI, captura da configuração efetiva na tentativa, clone, worker/fila, integração Maestri/OMP, revisão de entrega ou publicação. Persistir escolhas não comprova esses percursos. AC-01/04/05 integrais, INT, aceite visual e revisão independente da entrega permanecem pendentes. Não se declara aprovação/mudança de fase ou Design Lock.

## Sprint 004 - Cadastro e configuração persistida de projetos [CONCLUIDA]
- Cadastro e catálogo: rotas persistentes, identidade independente da pasta, resumos paginados e pré-requisitos explícitos.
- Configuração global e perfis: GET/PUT atômicos, valores exatos, omissões preservadas e ETag composto.
- Configuração por projeto: revisões imutáveis, ponteiro protegido, configuração/opções reais e recibos idempotentes; provas locais com os limites documentados acima.

## Sprint 004 - Cadastro e configuração persistida de projetos [CONCLUIDA]
- Cadastro e catálogo reais: Implementar GET/POST /projects e GET /projects/:projectId.
- Configuração global e perfis exatos: Implementar GET/PUT /settings com os campos globais e perfis previstos.
- Revisões imutáveis de configuração: Implementar GET/PUT configuration e GET configuration-options por projeto.

## Sprint 005 — Principal e acesso técnico no design aprovado

Data: 2026-10-16. Implementação do shell React e do cliente HTTP protegido no repositório canônico. Não houve ações Git/GH, chamadas de providers, publicação ou início do pipeline.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§8 e 10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` e SPEC derivada §§4.2–4.5 e 5.1.
- Design aprovado conferido antes da implementação: `docs/Docs20261016_073031/design/artifact.html` e `design-contract.json`. IDs preservados: telas `principal` e `login` (esta somente para retirada); componente `app-shell`. A composição conserva fundo claro, acento laranja, navegação grafite, densidade balanced e breakpoints 950/650 px. O CSS final de override grafite foi refletido na barra lateral.
- Context7: documentação oficial React consultada para `useSyncExternalStore` e limpeza de subscriptions/effects; Fastify Static para servir assets construídos na origem do controlador. React fixado em 18.3.1; `@fastify/static` 8.3.0, compatível com Fastify 5.
- Escopo implementado nesta sprint: C-02; RF-86/87; RNF-17–19 para entrada/hash, shell, leituras, sessão técnica e modal acessível. As features futuras de cadastro/criação, edição de configuração, fila, tentativas, mutações, rascunhos e canal SSE não foram antecipadas.

### Entregáveis e interfaces

| Superfície | Arquivos/interface |
| --- | --- |
| Entrada e rotas | `apps/web/src/main.tsx`, `app/hash-route.ts`, `app/useHashRoute.ts`: `PrincipalTab`, `DialogId`, `parseHash`, `buildHash`, `labelForTab`, `useHashRoute`. Seis abas fechadas; rota vazia, `#principal` e `#login` normalizam para dashboard. Rota/param/contexto inválidos apresentam erro na Principal. Histórico usa hash e `useSyncExternalStore`. |
| Shell/modal | `app/AppShell.tsx`, `app/PrincipalScreen.tsx`: `AppShell` tem somente as seis entradas com `aria-current`; diálogo único com rótulo, foco inicial, Tab contido, fundo `inert`, Escape e retorno do foco. O conteúdo da ação não inicia comando. |
| Cliente HTTP | `api/http.ts`: `HttpError`, `requestJson<T>`; URL sempre `/api/v1`, credenciais same-origin, `no-store`, bootstrap `{}` serializado por interface, `X-Factory-Client:web`, CSRF apenas na memória do módulo. `401` de leitura permite bootstrap e retry de leitura uma vez; para 401 após mutação, renova tecnicamente sem reenviar o comando. `403` não faz bootstrap adicional e é mostrado como diagnóstico recuperável. |
| Dados observados | `PrincipalScreen` consome GET `/projects`, `/settings` e `/events` com schemas/tipos de `#contracts`; leitura obsoleta é descartada no cleanup do efeito. Fila e tentativas mostram disponibilidade ausente, sem fixtures. Não foi adicionado endpoint ou POST de negócio. |
| Estilo/servidor | `app/styles/tokens.css`, `artifact.css`, `apps/web/index.html`, `vite.config.ts`; build gera `dist/web`. `http/app.ts` serve somente o diretório de assets construído, em mesma origem, por `@fastify/static`; se assets não estão construídos, API continua sem rota estática. `package.json`/lockfile incluem React, tipos, plugin Vite e plugin static com versões fixas; `npm run build` inclui Vite. |
| Documentação | README registra rotas, limites de superfície e comando de build; este histórico mantém provas e pendências sem sobrescrever as sprints anteriores. |

### Comportamento e limites

As URLs internas aceitam apenas os nomes de contexto previstos (`projectId`, `attemptId`, `deliveryId`, `creationId`, `questionId`, `dialog`, `search`, `filter`); não há campo de email/senha, guard, indicador de demonstração ou Sair. Busca usa URL e rascunho da busca fica em memória; não existe armazenamento de token/body/resposta. O estado de leitura distingue loading, erro e vazio; erro não é convertido em lista vazia. Fila e tentativas ainda não têm contrato HTTP, portanto não são simuladas. O modal dá a base de acessibilidade ao diálogo existente e somente um overlay pode estar aberto.

O frontend ainda não tem mutações de negócio ou IDs de operação incerta; por isso não foi criado uso de `sessionStorage`. O cliente HTTP já evita repetir uma mutação após 401. Polling/SSE, formulários completos e preservação de rascunhos por projeto/pergunta são de sprints consumidoras.

### Validação observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; backend, contracts, scripts e TSX React incluídos, strict e sem supressões. |
| `npm.cmd run lint` | Exit 0; limites e convenções estáticas. |
| `npm.cmd run build` | Exit 0; JavaScript/declarations do controlador, recursos SQL e bundle em `dist/web`. Vite imprimiu aviso de depreciação do `esbuild` option do plugin React; build concluiu. |

Não foi feita validação visual por Playwright MCP/Chrome nesta execução. A navegação solicitada ao MCP foi recusada com “MCP tool call requires approval, but approval policy is never”; o navegador não foi aberto. Build/typecheck não comprovam foco, responsividade visual, contraste observado ou comportamento real no browser. Também não foi executado Git/GH. C-02/hash/API e shell foram conferidos no código e na compilação, sem declarar aceite integral AC/INT, integração real Maestri/OMP ou revisão independente da entrega. Nenhuma fase ou aprovação do pipeline foi simulada.

## Sprint 005 - Principal e acesso técnico no design aprovado [IMPLEMENTADA]
- Shell React e seis abas por hash: Principal direta, histórico de leitura navegável e sem tela/login humano.
- Cliente protegido: bootstrap técnico serializado, CSRF em memória, recuperação 401 sem retry de mutação e diagnóstico 403.
- Modal acessível e estados de leitura: conteúdo compartilhado com foco/teclado/inert e consultas dos endpoints existentes; áreas sem endpoint continuam explicitamente indisponíveis.

## Sprint 005 - Principal e acesso técnico no design aprovado [CONCLUIDA]
- Entrada direta e cliente protegido: Conectar a montagem da Principal ao bootstrap técnico e aos contratos HTTP existentes.
- Shell visual e navegação por hash: Implementar a composição aprovada e as seis abas internas.
- Estado local e modal compartilhado: Disponibilizar as bases de interação e feedback para os formulários seguintes.

## Sprint 006 — Projetos e configuração na Principal [IMPLEMENTADA]

Data: 2026-10-16. Cadastro, catálogo e configuração foram conectados às APIs persistentes existentes. Alterações somente no workspace canônico; nenhum comando Git/GH, provider, scaffold, clone, publicação ou início de pipeline foi executado.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §§8 e 10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` §§1–3; SPEC derivada §§3.2, 4.2–4.6; histórias US-01/04/05, F-01/F-02 e AC-01/04.
- Artefato visual obrigatório `docs/Docs20261016_073031/design/artifact.html`: componente oficial `project-form`, estados idle/error/success, ação de cadastro na Principal e agrupamentos de Configuração. Layout preserva o shell, fundo claro, acento laranja, navegação grafite, cartões e breakpoints 950/650 px.
- Reutilizados os contratos e serviços da Sprint 004; não foram criados endpoints, tabelas ou dependências.

### Entregáveis e comportamento

| Superfície | Arquivos/interface |
| --- | --- |
| Catálogo | `apps/web/src/features/projects/useProjects.ts`: GET paginado `/projects` com filtro e cursor; cancelamento/identidade da consulta impede resultados atrasados de trocar o catálogo atual. `PrincipalScreen.tsx` distingue catálogo vazio, filtro sem correspondência e falha, com retry e carregamento de próxima página. Selecionar projeto atualiza `projectId` na URL e abre sua configuração, sem iniciar trabalho. |
| Cadastro | `features/projects/ProjectForm.tsx`, no diálogo compartilhado do `AppShell.tsx`: nome, tipo de origem, localização e branch-base enviados a POST `/projects`; exibe sucesso apenas após resposta 201 confirmada, operação e pré-requisitos. Erros da API são associados aos campos; chave de idempotência permanece no rascunho após resposta incerta. Cadastro local não exige remoto e informa a verificação posterior do histórico commitado e pré-requisitos. |
| Configuração global/perfis | `features/projects/useConfiguration.ts` e `ProjectForm.tsx`: editor lê settings e ETag; permite host designado, raízes locais, workspace Maestri ID não sensível, tempos, TTL, custo, automação e conjunto completo de perfis. Conta vinculada é identificada pelo ID persistido ou como indisponível; host observado é explicitamente indisponível nesta superfície. Não há campos de credencial/Wire. |
| Configuração do projeto | Leitura por `projectId` inclui revisão, settings, perfis e pré-requisitos. Campos incluem origem/base, papéis, checks e cwd relativo, correções 0–5, modo de entrega, automação, ordenação, guidance e IDs de Project/campo/quatro opções de Status. Selecionar outro Project limpa campo/opções; trocar Status limpa as quatro opções. IDs salvos que não aparecem na leitura permanecem informados com diagnóstico e não são substituídos. |
| Gravação e conflitos | PUT `/settings` ou `/projects/:projectId/configuration` envia somente campos que diferem da revisão atual, com If-Match e Idempotency-Key. Salvo exige resposta com novo ETag e recibo. 412 recarrega dados atuais separadamente, mantém e rebasa somente os caminhos editados e permite nova gravação; respostas tardias preservam edições feitas durante a gravação. Campos e chave de operação incerta permanecem em memória ao trocar de aba/fechar e reabrir na mesma identidade. |
| Transporte e estilo | `apps/web/src/api/http.ts` acrescenta leitura de ETag e erros por campo via `requestJsonWithMetadata`, preservando `requestJson`. `apps/web/src/app/styles/artifact.css` acrescenta grids/formulários responsivos e foco/feedback conforme os tokens aprovados. |

### Validação observada

- `npm.cmd run typecheck`: exit 0; strict TypeScript da aplicação, controlador, contracts e scripts.
- `npm.cmd run lint`: exit 0; `Module boundaries and TypeScript conventions: OK`.
- `npm.cmd run build`: exit 0; bundle de produção gerado em `dist/web`. Permanecem avisos de depreciação do plugin React/esbuild e opções de optimizeDeps, sem falha do build.
- Não foram executados testes automatizados nem validação visual em navegador nesta sprint; a compilação não prova o percurso HTTP real, foco, teclado, responsividade renderizada ou contraste observado. AC-01/04 e os critérios de integração permanecem sem aceite integral até as provas pertinentes.

### Limites e continuidade

- Cadastro real e gravações exigem configuração/autorização do host conforme o ambiente; nenhuma conta, sessão, perfil ou origem demonstrativa foi criada.
- A API de options oferece leituras GitHub por IDs exatos. Conta sem contexto, parcialidade, rate limit e IDs inacessíveis continuam explicitamente distinguíveis; não há criação remota de campos/opções.
- Configuração global e de projeto foi conectada, mas não se iniciou preparação, fila, clone ou tentativa. Integração Maestri/OMP real, validação de paths no host autorizado, aceite visual Playwright e revisão independente da entrega permanecem pendentes.
- Nenhuma fase, Design Lock, aprovação do pipeline, commit ou push foi simulada.

## Sprint 006 - Projetos e configuração na Principal [IMPLEMENTADA]
- Catálogo e cadastro de origens: filtro, paginação, seleção por URL e POST persistente com pré-requisitos/recibo da resposta.
- Formulários globais e por projeto: perfis, host, diretórios, tempos, checks, correções e mapeamento GitHub por IDs.
- Gravação com revisão: ETag/CAS, recibo, conflito 412 e rascunhos em memória preservados por identidade.

### Complemento de implementação e validação

- A configuração exibe uma opção de fallback com o ID quando o projeto selecionado não está na primeira página do catálogo; a URL continua sendo a fonte da seleção.
- Os avisos de origem local agora deixam explícito que alterações não commitadas ficam fora da execução. O perfil informa que Maestri/OMP está fixo como executor da primeira entrega.
- Validação complementar observada: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` concluíram com exit 0. O build mantém avisos de depreciação do plugin React/esbuild e da configuração `optimizeDeps` do Vite.
- Esta rodada não executou testes automatizados nem inspeção visual em navegador. A validação visual, os percursos HTTP reais e o aceite integral AC-01/04 seguem pendentes; compilação e checks estáticos não os comprovam.

## Sprint 006 - Projetos e configuração na Principal [CONCLUIDA]
- Catálogo e cadastro: Disponibilizar seleção, filtro e cadastro de origem no project-form existente.
- Formulários completos de projeto e host: Disponibilizar todos os campos F-02 nos agrupamentos existentes da Configuração.
- Gravação e conflito preservando edição: Apresentar recibos reais e permitir reaplicar edição após conflito.

## Sprint 007 — Preparação de issue e ambiente independente [IMPLEMENTADA]

Data: 2026-10-16. Implementação backend no repositório canônico. Nenhuma dependência foi instalada; nenhum comando Git/GH, provider, terminal Maestri, clone real, publicação ou início do pipeline foi executado. O histórico anterior foi preservado. Este registro não declara aprovação nem mudança de fase.

### Fontes e critérios

- `AGENTS.md`; `SPEC.md` §§2, 5.1–5.2, 8 e 10.2; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md` §§1–3.
- SPEC derivada `docs/Docs20261016_073031/SPEC20261016_073031.md` §§2.1, 3.2 e 3.4; stories RF-22–26/48 e AC-01/05/17. Cobertura desta sprint: preparação editável, interpretação/captura candidata, resumo revalidável e adapter de ambiente independente. A captura durável na tentativa e o início real pertencem à sprint 009, conforme o escopo recebido.
- Provas definidas: SQLite/HTTP inject reais para CAS, idempotência, histórico, vínculos e rollback; decisões puras para critérios; Git/GitHub/canonicalização controlados para observações, argumentos, isolamento de destino e falhas parciais. Essas provas não equivalem a Git/GH reais.
- Skill Context7 utilizada para documentação atual de Git, Fastify/type provider e better-sqlite3. Consultadas opções de [clone independente](https://git-scm.com/docs/git-clone), [checkout de branch/base](https://git-scm.com/docs/git-checkout), [schemas de rotas](https://github.com/fastify/fastify/blob/main/docs/Reference/Type-Providers.md) e [transações síncronas/IMMEDIATE/rollback](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md). Mantidas as versões do lockfile.

### Entregáveis e operações públicas reais

| Superfície | Arquivos e interface |
| --- | --- |
| Schemas | `packages/contracts/src/preparations.ts`, reexportado em `index.ts`: `PreparationChoices`, `PreparationOverrides`, `PreparationUpdate`, `PreparationRecord`, `Preparation`, `PreparationView`, `PreparationCreated`, `EffectiveConfiguration`, `CriteriaPreview`, `Criterion`, `IssueOptions`, `WorkspacePreparation`, `PreparedWorkspace`. `PreparationChoiceSnapshot` valida o envelope persistido `formatVersion:1`. |
| Interpretação | `modules/pipeline/index.ts` exporta `interpretIssue({title,body})` e `preparationDigest`. O parser preexistente em `pipeline/criteria.ts` foi consolidado, mantendo `id` e `occurrenceIndex` dos critérios e acrescentando indicação de ID explícito. Não há segundo parser em projetos. |
| Serviço | `modules/projects/index.ts` exporta `createPreparations({storage,github,workspaces})`, `PreparationDependencies`, `Preparations` e `interpretIssue`. Métodos: `listIssues(projectId,query)`, `createPreparation(projectId,body,commandContext)`, `getPreparation(id)`, `updatePreparation(id,body,commandContext)`, `revalidateSummary({preparationId,preparationRevision,authorizedSummaryHash})`. Implementação em `projects/preparations.ts`. |
| Rotas | `http/routes/preparations.ts`, composto em `http/app.ts`: GET `/api/v1/projects/:projectId/issues`; POST `/api/v1/projects/:projectId/preparations`; GET/PUT `/api/v1/preparations/:preparationId`. Todas usam schemas explícitos e proteção HTTP comum. Não há POST `/attempts`. |
| Storage | `storage/index.ts` exporta `PreparationCommand`, `SavePreparation`, `StoredPreparation`. Métodos: `getPreparation(id)`, `recoverPreparationCommand(command)`, `savePreparation({command,configurationETag})`. `storage/preparations.ts` mantém SQL/transações privados. `operations.ts` projeta `preparation.create/update` pela existência da revisão histórica, evento e recibo correspondentes. |
| Persistência | Migration nova `004_preparations.sql`: `preparations` e `preparation_revisions` STRICT, índice por projeto/data/ID, FK composta de projeto/revisão e ponteiro de revisão obrigatório/diferido. Guards preservam identidade, sequência e histórico. Ledger conhecido passa a 4; migrations 001–003 preservadas. |
| GitHub | `github.getIssueContextById(id)` resolve node ID de Issue para referência, lê o contexto completo e confere novamente o mesmo ID. Query estática em `queries.ts`; todas as páginas compartilham o orçamento da mesma operação. PR/draft/node ausente e identidade divergente são recusados. |
| Ambiente | `workspaces.createWorkspaces({github,context?,dataDirectory?})` acrescenta `prepareAttempt({attemptId,issueNumber,source,baseSha})`. Implementação em `workspaces/prepare.ts`; `WorkspacePreparationError` é exportado para input/raiz inválidos. `main.ts` fornece diretório efetivo e os adapters à composição, sem obter autoridade de body/ambiente/PATH. |
| Provas | `pipeline/criteria.test.ts`, `storage/preparations.test.ts`, `workspaces/prepare.test.ts`, `tests/integration/preparations.test.ts`; extensão de `github/github.test.ts` e `github/commands.test.ts`; expectativas históricas de versão/tabelas atualizadas. README documenta contratos e continuidade. |

### Preparação e resumo

POST valida o node ID e seu repositório antes de gravar; não fabrica identidade nem altera defaults. O histórico conserva escolhas revisáveis: issue, modo, orientação e overrides tipados de base, perfis por valor/referência exata, checks, correções e defaults completos de tempo/custo/artefatos. GET materializa configuração e perfis por valor, com origem `project/global/preparation`; combina orientação do projeto com a da preparação. Overrides explícitos substituem o conjunto anterior; `{}` os remove. Omissão de campos de `changes` preserva a edição existente. Zero configurado e `not_configured` permanecem distintos.

PUT exige ETag da preparação: 428 ausente, 412 obsoleto. Storage repete CAS e verifica a revisão composta de configuração/settings/perfis dentro da transação, após IO remoto. Cada gravação incrementa a revisão, inclusive uma edição sem mudança de valor, invalidando o resumo anterior. Mudança na configuração do projeto gera pré-requisito e exige salvar novamente para vincular sua revisão atual. Leituras que terminam após outra edição/configuração retornam 412; não substituem a revisão atual por um preview atrasado.

Preparação/revisão, operação/recibo e evento são confirmados na mesma transação IMMEDIATE. Hash semântico inclui método, rota, body e precondição, no escopo da instalação/conta; mesmo comando recupera o recibo original antes de CAS/validação de nova escrita. A resposta inclui o recurso atual e remonta o preview por consultas; se essa consulta falhar depois do commit, GET `/operations/:operationId` continua recuperando o recibo durável. Chave divergente gera 409, sem nova revisão/evento. Falha de revisão, índice da operação, evento ou busy reverte o conjunto.

GET e as respostas de gravação apresentam issue, critérios, base SHA, perfis/configuração efetiva, origem das escolhas, efeitos por modo, diagnósticos e pré-requisitos atuais. Verificações abrangem completude, conta, issue aberta, repositório, assignee exclusivo, Project/owner/vínculo/Status por IDs, bloqueadores e base/remoto confirmados. Comentário de entrega é previsto somente nos modos sem PR; push/PR somente no modo PR. Esses efeitos são previews, sem execução nesta sprint.

O parser aceita listas em `Critérios de aceite`/`Acceptance criteria`, headings ATX/Setext, checkboxes opcionais e IDs `ac-N`. Reserva todos os IDs explícitos antes de gerar os ausentes por ocorrência. Duplicidade explícita, ID inválido, título/objetivo/lista ausentes ou limites excedidos recusam o conjunto executável; textos repetidos conservam identidades distintas. Comentários da issue, fences e comentários HTML não criam critérios. A captura candidata inclui contexto/identidade/corpo/referências/comentários/dependências e digest, sem gravar arquivos do projeto ou índice.

`summaryHash` vincula revisão da preparação, identidade/objetivo/critérios/referências/dependências da issue, observação de conta, base, configuração efetiva, modo, efeitos e pré-requisitos. `revalidateSummary` refaz a consulta e gera `409 SUMMARY_CHANGED` quando o hash ou a revisão autorizada divergem. Comentário editorial livre sem mudança material de referências não altera os critérios/resumo. Essa função somente revalida o preview; não concede autoridade nem aceita início. `canStart:false` e `EXECUTOR_REVALIDATION_REQUIRED` são explícitos até existir executor. `previousAttemptId` retorna 404 enquanto não houver tentativa verificável; vínculo fictício não é persistido.

### Ambiente independente

`prepareAttempt` recebe uma identidade UUID do chamador e uma SHA completa fixa. O destino é exclusivamente `<data>/work/<attemptId>/implementation`, com branch `factory/<issueNumber>/<attemptId>`. Raiz/caminhos são resolvidos em runtime, com canonicalização, contenção e recusa de symlink/junction na raiz gerenciada. A pasta da tentativa é reservada exclusivamente; pasta existente não é reutilizada, resetada ou removida.

Origem local recebe apenas leitura de raiz/commit. O clone usa argv/cwd explícitos, `--no-local --no-hardlinks --no-checkout --no-recurse-submodules`, sem shared/reference. Gitdir e worktree do checkout/verificação apontam explicitamente para o recurso próprio. Hooks usam diretório próprio vazio; templates e atributos globais de usuário não são aplicados ao checkout. Seletores/configurações Git herdados que redirecionam o alvo são removidos; objetos replace ficam desabilitados. HEAD/branch/estado limpo são conferidos após checkout da SHA fornecida, sem atualizar a base silenciosamente.

Alternates, gitdir/commondir indireto, shallow, submodule, filtro de conteúdo e symlink não suportado no Windows geram diagnóstico. Falha retorna caminho do recurso, ownership, tentativa, branch/base e código sanitizado; recurso parcial é preservado. Uma pasta preexistente retorna `owned:false`. A API não faz limpeza, retry cego ou adoção de outro ambiente. O chamador futuro deverá registrar tentativa/intenção/recurso antes desses efeitos; nenhuma rota de preparação chama `prepareAttempt` nesta sprint.

### Validação técnica final

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, testes e scripts em TypeScript strict, sem supressões ou `any` explícito. |
| `npm.cmd run lint` | Exit 0; limites de módulos, SQL privado, contratos sem IO e convenções existentes. |
| `npm.cmd test` | Exit 0; **259 testes em 19 arquivos**. Rede e subprocessos reais bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador/declarations, quatro migrations e bundle web distribuídos. Permanecem avisos existentes de React/esbuild e optimizeDeps no Vite. |
| `npm.cmd run test:compiled` | Exit 0; smoke histórico HTTP/SSE/SQLite reais, settings/CAS/idempotência, diagnóstico de contexto, shutdown e lock entre processos, usando a distribuição com migration 004. Não executa clone/Git/GH. |

Provas novas: defaults/ETags preservados; overrides e perfis exatos; critérios com mesmo texto e IDs distintos; duplicidade explícita e listas inválidas; comentários fora de escopo; efeito por modo; CAS/recuperação após resposta perdida e restart; configuração alterada durante IO; resposta atrasada recusada; SUMMARY_CHANGED por base/critérios/conta/configuração/modo; issue/repositório/perfil/tentativa anterior inválidos; paginação e completude; rollback de criação/edição e todos os componentes, inclusive busy; FKs/guards; migração real SQLite 3→4 preservando instalação e recibo histórico. Fixtures de ambiente verificam argv/cwd, caminhos com espaços/Unicode, destino separado por tentativa, origem sintética preservada byte a byte, alternates/LFS/submodules recusados e recurso identificado/preservado após falhas parciais.

### Limites e continuidade

- O clone foi implementado e exercitado com Git controlado. Não foi executado Git real; os testes demonstram argumentos, seleção do destino e comportamento sob as dependências controladas, sem provar hard links, objetos Git reais, checkout real ou preservação por um binário Git real.
- Canonicalização positiva permanece controlada nas fixtures, conforme a limitação EPERM observada anteriormente neste runtime; produção mantém `realpath` e falha segura. Caminhos com espaços/Unicode foram exercitados com filesystem real e canonicalizador/Git controlados.
- O runtime não disponibiliza `require_escalated`/keyring exigido pelo projeto. Não houve login alternativo, alteração de credenciais/ACL, status/diff Git, commit ou push. Consulta GitHub/Projects real e integração Maestri/OMP continuam sem prova.
- Sprint 009 deverá revalidar resumo/autoridade/base, criar tentativa e capturar configuração/issue/critérios por valor na mesma transação da intenção, antes do clone/processo. Deverá acrescentar journal de recursos, retry por tentativa anterior e os gates de unicidade/execução. A função de preview não substitui essas operações.
- RF-22/24 têm captura candidata pronta, sem captura persistida em tentativa inexistente. RF-23/25/26 têm preparação e motivos atuais, sem despacho; RF-48 tem adapter e prova controlada. AC-01/05/17 integrais, início real, aceite visual da preparação, revisão independente e critérios INT permanecem pendentes. Nenhuma aprovação ou fase do pipeline foi simulada.

## Sprint 007 - Preparação de issue e ambiente independente [CONCLUIDA]
- Preparação persistente: Implementar seleção de issues e GET/POST/PUT de preparações.
- Critérios por identidade e resumo autorizável: Disponibilizar interpretação da issue executável e o resumo material do início.
- Clone próprio de base fixa: Disponibilizar em workspaces a preparação do ambiente de uma tentativa identificada.

## Sprint 008 — Passagem OMP real no Maestri [IMPLEMENTADA NO ADAPTER]

Data: 2026-10-16. Implementação no repositório canônico. Histórico anterior preservado. Não houve instalação de dependências, comandos Git/GH, provider, recrutamento, Wire, publicação ou início do pipeline. A execução real autorizada permanece para a sprint 018; este registro não representa aprovação nem mudança de fase.

### Fontes, APIs e critérios

- `AGENTS.md`; `SPEC.md` §§8.2–8.4/10.2 e AC-15/23/24/25; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md` integral, especialmente INT-01–05/09/10/12–14.
- SPEC derivada §§2.1/2.4/3 e stories US-10, RF-43–47 e RNF-21/22/24/25. Provas definidas antes da implementação: contratos/coordenação sem efeitos na suíte padrão; recursos compilados; socket loopback real; argv/cwd Windows com processo Node de fixture. Não são provas de TUI/MCP/provider reais.
- Skill Context7 aplicada para OMP e Node 24. Maestri não foi encontrado corretamente no Context7; consultadas as instruções locais distribuídas da CLI, opções embutidas e metadados da instalação. API da versão OMP conferida nas fontes primárias de v18.11.1. Referências e decisão do canal mínimo estão em `docs/integration/maestri-omp-adapter.md`.
- Consulta local suportada `omp --version`: **omp/18.11.1**. `omp --help` foi tentado e falhou carregando addon nativo por EPERM; não foi contornado com instalação/ACL global. Maestri instalado observado: **0.24.1**, build **94**, SHA `655f48da28c44196f90bb63ae220fc96b83b1bc5`. A CLI Maestri recusou `--help` por ausência de `MAESTRI_PIPE`, confirmando que este executor não herdou contexto de terminal-âncora. Não se fabricou contexto para continuar.

### Interfaces e arquivos

| Superfície | Arquivos/interface |
| --- | --- |
| Interface pública | `apps/controller/src/modules/execution/index.ts`: `createExecution`, tipos `Execution`, `ExecutionOptions`, `ExecutionHost`, `ExecutionPersistence`, `PassageHandle`, `PassageRecord`, recibos/eventos e `ExecutionError`. Métodos `roleResources`, `preflight`, `startPassage`, `observe`, `getResult`, `answerQuestion`, `cancelAttempt`, `interactionSurface`, `close`. |
| Adapter exclusivo | `execution/adapters/maestri-omp/adapter.ts`, `native.ts`, `bootstrap.ts`, `channel.ts`, `wire.ts`, `extension.ts`; `execution/errors.ts` e `roles.ts`. Sem import de HTTP/pipeline, SQL ou outro runtime OMP. |
| Contratos | `packages/contracts/src/execution.ts`, reexportado no index: `PassageRole`, `PassageBinding`, `RoleResourceReference`, `PassageRequest`, `ExecutionQuestion`, `CriterionOutcome`, `ImplementerResult`, `ReviewerResult` e tipos derivados. Schemas fechados, sem identidade privada escolhida pelo modelo. |
| Recursos | `resources/roles/implementer.v1.json` e `reviewer.v1.json`: instruções e schemas completos de resultado/pergunta. `scripts/copy-resources.mjs` distribui ambos em `dist/resources/roles`; resolução relativa à instalação, sem skills pessoais. |
| Provas | `execution/execution.test.ts`, `adapters/maestri-omp/extension.test.ts`, novo `scripts/smoke-execution.mjs` e script configurado `test:execution-compiled`. `scripts/check-boundaries.mjs`/`tests/boundaries.test.ts` impedem imports OMP e chamadas literais Maestri/OMP fora de execution. |
| Documentação | `docs/integration/maestri-omp-adapter.md`, `README.md` e este progresso. Sem migration, tabela demonstrativa ou endpoint de impersonação. |

### Recursos disponíveis antes da primeira passagem — S1/RF-22

O loader exige ambos os papéis antes de criar o adapter, confere identidade/versão e igualdade exata dos schemas distribuídos com os contratos. `roleResources()` retorna os paths relativos e o SHA-256 dos bytes. A solicitação precisa trazer a mesma referência; divergência recusa o lançamento. O handshake repete a conferência de digest. A sprint 009 deve capturar essas referências por tentativa; a sprint 012 deve consumir o recurso do Revisor já entregue.

| Papel | Identidade | Versão | Path distribuído relativo | SHA-256 dos bytes fonte/distribuição |
| --- | --- | --- | --- | --- |
| Implementador | `factory.implementer` | 1 | `resources/roles/implementer.v1.json` | `b06524cadca361f3e21c909f3e0332b01b8446c4dcd7bd5b72ba1591e9b6004d` |
| Revisor | `factory.reviewer` | 1 | `resources/roles/reviewer.v1.json` | `4d65bb3af40ebbf4935afbc94f7fbfd94c6525650cd05bcabd5c6ffb1be407bb` |

### Comportamento implementado

`preflight` não chama provider: exige ambiente realmente herdado, paths absolutos de executáveis nativos, consulta `maestri list`, confere ajuda `recruit --help` e versão OMP. Contexto ausente/stale/incompatível recebe código sanitizado, sem mudar configuração/ACL global. O adapter aceita OMP 18.11.1 conferido; versão diferente, wrapper CMD/BAT/PS1 ou seletores de perfil incompatíveis são recusados sem fallback.

`startPassage` pede reserva durável da identidade/hash/nome próprio antes de qualquer recurso. Criação parcial conserva `factory-<passageId>` consultável pelo registro. A mesma passagem não recruta novamente após timeout/resposta perdida; conteúdo divergente conflita. Listener próprio, bootstrap exclusivo e uma única chamada recruit precedem handshake de sessão/terminal/workspace/cwd/TTY, perfil exato e digest. `confirmReady` precisa gravar perfil/version observados, ready e evento após submissão da tarefa. Falha nunca produz ready por mera criação do terminal.

A extensão está na TUI OMP que executa o trabalho, usando a API suportada e os stdin/stdout nativos. A tarefa fica no bootstrap UTF-8 e é enviada somente por `sendUserMessage` depois do handshake. A linha de comando contém apenas referência ao arquivo privado, com PowerShell EncodedCommand e array de argumentos. A DACL restringe somente o novo diretório próprio de bootstrap no Windows, antes da capacidade efêmera ser escrita; sua falha impede lançamento. O arquivo é removido antes da autorização `run`. Não há credencial de publicação/provider no bootstrap, prompt grande em argv ou segunda tarefa por CLI/stdin.

`interactionSurface` retorna referência sanitizada ao nome próprio. A capacidade de abertura chama somente `openExistingTerminal` do host com o terminal do handshake; sem suporte, orienta abrir a mesma sessão no Maestri do host executor. A CLI conferida não trouxe verbo documentado para focar terminal; não foi inventado comando/URI. A integração concreta desse hook de abertura ainda requer prova no host.

Não há flags que retirem ferramentas, skills, regras ou LSP, gerenciador MCP paralelo, reativação de servidor disabled ou launcher sanitizador. GitNexus requerido recebe orientação explícita de analisar e consultar a raiz exata do clone e conferir o resultado pelos parâmetros normais. Disponibilidade/chamada útil reais e recuperação de argumento MCP são provas pendentes da sprint 018; instrução/configuração presente não as comprova.

Os canais oficiais recebem somente conteúdo. O adapter injeta tentativa/passagem/papel/rodada/versão da solicitação capturada e valida schema e critérios exatos, unicidade, achados/resoluções e coerência do Revisor. Payload inválido retorna erro corrigível; resultado repetido usa hash/recibo do consumidor. ACK só ocorre depois do retorno de commit do port de persistência. Conversa e tools posteriores permanecem livres sem iniciar nova implementação. A tool de pergunta grava/retorna imediatamente, sem bloquear a TUI esperando resposta. Resposta é gravada antes do follow-up na mesma sessão e confirmada por recibo; timeout/EOF permanece delivery_unknown, sem replay cego.

O canal local exige capacidade por passagem e não publica rota HTTP. Framing precede decodificação UTF-8 fatal; português e emoji fragmentados são preservados. Malformed/oversize/EOF fecham o canal e liberam esperas. Limites centrais: frame 1 MiB; buffer 2 MiB; 16 frames/lote; 4 peers/passagem; handshake 30 s; chamada/CLI 15 s; stdout CLI 1 MiB; 8 chamadas pendentes; 128 passagens/instância e 128 respostas deduplicadas na extensão. Não são SLAs. Stderr/transcript/segredos não são retidos.

Perda de canal, sessão ou perfil observada revoga coordenação, com resultado/trabalho preservados. Registro histórico sem handle vivo não é adotado. Cancelar grava revogação antes da parada, inclui recruit pendente e pede parada quando ele retorna. Dismiss aceito permanece **uncertain** quanto à parada física; não há alegação de zero processos globais, varredura por nome, reset ou exclusão de clone. Shutdown do adapter interrompe coordenação e esperas, sem restaurar autoridade.

### Validação técnica

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção/testes/scripts strict, sem `any` ou supressões. |
| `npm.cmd run lint` | Exit 0; limites antigos e novos de execution respeitados. |
| `npm.cmd test` | Exit 0; **288 testes em 21 arquivos**, sendo 28 novos testes de execution e uma nova regressão de fronteiras. Rede/subprocessos/providers reais continuam bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; JavaScript/declarations, migrations históricas, ambos os recursos e bundle web distribuídos. Avisos existentes de React/esbuild e optimizeDeps no Vite permanecem. |
| `npm.cmd run test:compiled` | Exit 0; smoke histórico HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock. Não exercita Maestri/OMP. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos distribuídos carregados com cwd alheio à instalação; socket loopback real e UTF-8/EOF; PowerShell real preservou argv/cwd com espaços, apóstrofo e Unicode usando Node como processo de fixture. Saída declara `maestriOmpIntegration:not_executed`. |

Os testes controlados cobrem pedido único, perfil/digest/ambiente divergentes, recusa de identidade privada nos payloads, conjunto exato de critérios, revisão incoerente, erro corrigível na mesma extensão, falha de persistência sem ACK, pergunta/resposta/recibo, EOF, handshake com prazo finito, criação parcial, cancelamento pendente/retorno tardio, abort de inicialização, abertura sem substituta e recusa de restauração por histórico. A fixture do port demonstra ordem/contratos de chamadas; não é prova de durabilidade SQL de tentativa/resultados.

### Continuidade e limites de aceite

- `ExecutionPersistence` é dependência obrigatória, sem implementação volátil de produção. A transação concreta de tentativa/passagem/recursos e sua composição com storage/controller continuam na sprint 009; aceitação de resultados/perguntas/revisão usa suas sprints consumidoras. O adapter não inicia sozinho uma preparação nem fabrica tentativa ou autoridade. Registrar intenção antes de chamar `startPassage`, capturar os dois recursos e mapear os métodos para transações reais é obrigatório antes do primeiro uso de produto.
- Não houve contexto herdado Maestri, TUI/provider real, abertura nativa real, ferramenta MCP/GitNexus útil ou preservação por terminal Maestri real. O smoke PowerShell usa Node como fixture e não comprova o parser/terminal Maestri. A ausência de contexto e a falha de addon foram preservadas como diagnósticos, sem contorno. Critérios AC-15/23/24/25 e INT-01–05/09/10/12–14 integrais permanecem para a prova opt-in da sprint 018; não são declarados aceitos pelos testes locais.
- Nenhum Git/GH foi executado: contexto elevado/keyring não está disponível e as restrições de versionamento do usuário foram mantidas. Sem commit/push, instalação, mudança de fase, Design Lock ou aprovação do pipeline.

## Sprint 008 - Passagem OMP real no Maestri [IMPLEMENTADA NO ADAPTER]
- Contexto e lançamento: consulta nativa prevista no preflight, identidade reservada, handshake exato e criação parcial consultável.
- Sessão operacional: extensão na TUI única, lifecycle/MCPs nativos preservados e abertura da mesma sessão condicionada à capacidade real do host.
- Canais e recursos: resultado/pergunta privados correlacionados, UTF-8/limites/EOF, recursos completos de ambos os papéis distribuídos; composição durável e prova integrada conforme continuidade acima.

## Sprint 008 - Passagem OMP real no Maestri [CONCLUIDA]
- Contexto herdado e lançamento identificável: Disponibilizar início de passagem no terminal Maestri com handshake e perfil efetivo.
- TUI e MCPs nativos preservados: Manter uma sessão operacional real por papel/passagem e a superfície de interação correspondente.
- Transporte privado de resultado e pergunta: Disponibilizar os canais correlacionados execution_complete e execution_question.

## Sprint 009 — Início manual e resultado oficial durável [IMPLEMENTADA]

Data: 2026-10-16. Implementação no repositório canônico, preservando o histórico anterior e completando a composição parcial existente no workspace. Nenhuma dependência instalada, ação Git/GH, consulta externa real, provider, recrutamento, clone real ou publicação. Não representa aprovação, mudança de fase ou Design Lock.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §§4/5/8/10, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, especialmente INT-06; SPEC derivada §§2.1/2.3/3.2/3.4.
- Cobertura backend: RF-22–28/44/51/52, com captura/intenção anterior aos efeitos, unicidade ativa por conta/repositório/issue, resultado vinculado/idempotente e recursos diagnosticáveis. AC-05/06/20 e INT-06 recebem as provas locais abaixo; seus percursos reais integrais não são declarados aceitos.
- Context7: documentação primária de better-sqlite3 sobre transações síncronas, IMMEDIATE, rollback e savepoints. Nenhum IO externo dentro das transações; versões do lockfile preservadas.
- Validação definida por superfície: HTTP inject/SQLite reais para sessão, CAS, deduplicação, rollback, histórico e operação; dependências GitHub/ambiente controladas para autorização e ordem dos efeitos; adapter real com native/channel/bootstrap controlados para ACK após commit. Smokes compilados preservam as provas históricas de loopback/processos próprios, sem recrutamento.

### Entregáveis e interfaces

| Superfície | Arquivos e contrato |
| --- | --- |
| Contratos | `packages/contracts/src/attempts.ts`, reexportado em `index.ts`: `StartAttempt`, `AttemptCapture`, `ToolObservation`, `AttemptStatus`, `AttemptParams`. Schemas fechados, sem IO. |
| Pipeline | `modules/pipeline/index.ts` expõe `createPipeline`, `Pipeline`, `PipelineDependencies`; `start.ts` implementa `startAttempt`, despacho posterior ao commit, revalidação após clone e shutdown idempotente. `drain` permite aguardar somente os despachos próprios nas provas. |
| HTTP | `http/routes/attempts.ts`, composto em `http/app.ts`: POST `/api/v1/attempts`, GET `/api/v1/attempts/:attemptId`. POST usa sessão/Origin/CSRF, Idempotency-Key e If-Match da preparação; GET oferece resumo leve/ETag. `http/errors.ts` conserva referência de conflito somente no escopo autorizado. |
| Tentativas | `storage/attempts.ts` e API pública de `storage/index.ts`: `createAttempt`, `recoverAttempt`, `getAttempt`, `getAttemptCapture`, `recordWorkspace`, `recordDispatchFailure`, `interruptAttempts`; tipos `AttemptCommand`, `CreateAttempt` e `AttemptConflict`. SQL permanece privado. |
| Executor durável | `storage/execution.ts`: implementação concreta de `ExecutionPersistence`, obtida por `storage.executionPersistence()`. Reserva, perfil observado, eventos, resultado/recibo, pergunta/resposta, tracking e recursos têm operações transacionais. Leituras usam snapshot sem adquirir lock de escrita. |
| Persistência | `005_attempts.sql`: nove novas tabelas STRICT, vínculo de tentativa em events, índices, FKs compostas e guards. Ledger conhecido passa a 5; migrations 001–004 preservadas. |
| Composição/versões | `main.ts` aceita `ControllerHostContext.execution` e compõe pipeline/executor/storage; `github.observeVersion`, `workspaces.observeVersion`, `execution.observeVersions` fornecem observações locais sem provider. `ExecutionHost` continua exclusivo da composição confiável. Erros de startup do executor mantêm código sanitizado. |
| Provas | `tests/fixtures/attempt.ts`; `tests/integration/attempts.test.ts`, `attempt-results.test.ts`, `attempt-transactions.test.ts`; novas provas de versões em `github/commands.test.ts`; expectativas históricas de migration/rota atualizadas. `README.md` e documentação do adapter refletem a composição atual. |

### Captura histórica real — RF-22/S1

`AttemptCapture`, `formatVersion:1`, persiste `preparationId`, `preparationRevision`, `summaryHash`, `accountId`, `issue` por valor, `baseSha`, `criteria`, `criteriaDigest` e `configuration`. Esta última inclui configuração efetiva, revisão do projeto/settings, ambos os perfis por valor, guidance, limites de tempo/custo/artefatos e `origins` para cada escolha. Modo é o `configuration.configuration.defaultDeliveryMode` efetivo da preparação.

`roleResources` contém exatamente Implementador e Revisor: `id`, `role`, `version`, `path` relativo e `sha256` dos bytes distribuídos. São consumidos os recursos v1 da sprint 008, sem substituí-los por relatório de integração. `tools` contém exatamente uma observação de `node`, `git`, `gh`, `maestri`, `omp`, cada uma com `state`, `version`, `cause`, `affectedRequirements`, `observedAtMs`. Valor indisponível é null com causa/requisito pendente; não recebe versão demonstrativa. Contrato obrigatório ausente/ inválido impede despacho. Ferramenta não observável conserva a tentativa/intenção suspensa por `TOOL_VERSION_UNAVAILABLE` antes de clone/processo, sem preflight pago.

Capturas anteriores não são reescritas por mudança de defaults, recursos ou versões. Passagem guarda separadamente `effective_profile_json` e `executor_version` OMP confirmados no handshake; compara os valores exatos capturados. Guards impedem alterar novamente a observação confirmada. Não há arquivos do checkout, índice Git, caches ou transcript na captura/resultados oficiais.

### Início e recursos

`startAttempt` recupera primeiro a operação idêntica; caso novo, exige If-Match, revisão/hash autorizados, host designado e observação atual completa. Revalida conta, issue aberta, assignee exclusivo, Ready do primeiro início, repositório, Project/owner/vínculo/Status, dependências, remoto e base em todos os modos. Mudança material gera `SUMMARY_CHANGED`, precondição ausente 428, CAS obsoleto 412; ausência de pré-requisito impede efeitos.

Uma transação IMMEDIATE repete CAS de preparação/configuração/settings/perfis e confirma operação/recibo, tentativa/captura, critérios por identidade, rodada 1, passagem implementadora e recursos planejados de ambiente/terminal. A unicidade ativa atravessa cadastros duplicados da mesma conta/repositório/issue. Concorrência retorna `409 ATTEMPT_ACTIVE` com referência à tentativa existente quando visível; não há segundo lançamento. Uma issue manual já consumida não reinicia após interrupção com uma chave nova: requer a futura ação explícita de nova tentativa.

POST retorna `202 OperationAccepted`, `resource:{type:'attempt',id}`, recibo e Location da operação antes de aguardar clone/handshake. Clone usa identidade/SHA fixas da captura, com início/ownership/falha no journal; revalidação de autoridade ocorre novamente antes do executor. Cancelamento enquanto clone está pendente não apaga seu retorno tardio: registra ownership/estado sem avançar nem lançar agente. Falha preserva recursos parciais e diagnóstico. Reinício interrompe o acompanhamento, preserva captura/resultado e não restaura autoridade/sessão ou agenda outro lançamento.

### Resultado oficial

O port valida schema do papel, tentativa/passagem/papel/rodada/versão, hash canônico e conjunto exato de criterionIds sem duplicatas, com evidência/veredito. Valida campos próprios dos schemas v1 e coerência do Revisor; resoluções de achados anteriores não existem na rodada inicial. Primeiro válido grava hash, recibo UUID, resumo, critérios, fase e eventos antes do retorno/ACK. Mesmo hash recupera o mesmo recibo, inclusive após reopen; outro hash gera `RESULT_CONFLICT`. Payload inválido, SQL busy ou falha em qualquer escrita não ocupa resultado/recibo. Texto, scrollback e fim de turno não concluem a passagem.

Resultado implementador move fase para `verifying`, sem declarar entrega nem checks comprovados. Resultado final, fase, suspensão e tracking continuam distintos; perda de tracking preserva resultado aceito e não vira sucesso. Pergunta formal pendente impede resultado, mantém fase e só libera sua suspensão após recibo de resposta. Tabelas/guards preservam capturas, identidades e resultados; FKs compostas impedem recurso/rodada/passagem/resultado por critério de outra tentativa. Atualizações legítimas de fase/tracking/recibos/recursos continuam possíveis.

### Validação técnica final

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; código, testes e scripts strict, sem supressões/any explícito. |
| `npm.cmd run lint` | Exit 0; limites de módulos/SQL/contratos e convenções estáticas. |
| `npm.cmd test` | Exit 0; **343 testes em 24 arquivos**. Rede, subprocessos/providers reais continuam bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador/declarations, cinco migrations, recursos v1 e bundle web. Permanecem avisos anteriores do Vite/plugin React sobre esbuild/optimizeDeps. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, settings/CAS/idempotência, catálogo/contexto, shutdown e lock de processo. Não exercita Git/Maestri reais. |
| `npm.cmd run test:execution-compiled` | Exit 0; distribuição com cwd distinto, socket UTF-8/EOF e PowerShell com Node como fixture. `maestriOmpIntegration:not_executed`. |

As novas provas cobrem intenção anterior ao clone/processo; POST não bloqueado por clone pendente; resposta perdida; concorrência entre projetos duplicados; todos os modos e gates de autoridade; corrida de configuração durante observação; revalidação após clone; recursos/versões distintos e capturas próprias; recurso parcial/tardio; rollback em sete componentes do início e quatro do resultado; SQL busy; replay/reopen/restart; critérios repetidos por texto com IDs distintos; vínculo/schema/evidência/hash inválidos corrigíveis; guardas e FKs com duas tentativas existentes; Revisor; perguntas; e migração SQLite real 4→5 conservando identidade/settings/recibos.

### Limites e continuidade

- Git/GH/clone e canonicalização positivos são controlados. Adapter usa persistência SQL real com dependências de lançamento/canal controladas; não é prova de TUI/provider, MCP útil, keyring ou Maestri real. O runtime não disponibiliza o contexto elevado exigido; não houve Git/GH, login alternativo ou alteração de credenciais/ACL. Prova integrada opt-in permanece para a sprint 018.
- Captura Git imutável da entrega, checks executados pelo controlador, revisão independente real, publicação, retry explícito e UI de início/detalhe pertencem às sprints consumidoras. O port preparado para o Revisor não comprova independência nem despacho de revisão. AC-05/06/20 e INT-06 integrais dependem dessas provas pertinentes; nenhum aceite visual/revisão independente foi presumido.
- Durante a validação, uma asserção falha imprimiu o ambiente herdado, incluindo valores sensíveis. As comparações foram corrigidas para projetar somente argumentos/opções não sensíveis antes de qualquer diff; os valores não são reproduzidos neste registro. Recomendada rotação das credenciais expostas naquela saída.
- A revisão automática bloqueou a leitura opcional da memória/skill fora do repositório como conteúdo privado externo; o trabalho prosseguiu pelas fontes locais. GitNexus foi consultado, mas não contém índice deste repositório; nenhum grafo do legado foi usado. Nenhum segredo foi copiado para código/documentação. Nenhum commit/push foi feito.

## Sprint 009 - Início manual e resultado oficial durável [IMPLEMENTADA]
- Tentativa anterior ao despacho: POST protegido, revalidações, captura imutável, operação recuperável e unicidade por conta/repositório/issue.
- Resultado oficial durável: port SQL real, schema/vínculo/critério exatos, transação antes do ACK e recibo idempotente.
- Estado e autoria dos recursos: vínculos compostos, histórico protegido, journal de criação parcial/tardia e tracking separado do resultado; integração real permanece explicitamente pendente.

## Sprint 009 - Início manual e resultado oficial durável [CONCLUIDA]
- Tentativa criada antes do despacho: Implementar POST /attempts e a composição inicial de pipeline.
- Resultado vinculado e idempotente: Implementar acceptResult para a passagem implementadora e preparar a extensão do mesmo contrato ao Revisor.
- Estado operacional e autoria dos recursos: Persistir o vínculo das passagens e recursos próprios necessários ao acompanhamento.

## Sprint 010 — Versão Git imutável e repetição de captura [IMPLEMENTADA]

Data: 2026-10-16. Implementação backend no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada, comando Git/GH real, provider, recrutamento, clone real, publicação, commit ou push executado nesta sprint. A implementação contém as operações Git do produto, restritas ao contexto autorizado e aos recursos gerenciados; essas operações não foram disparadas neste runtime. Este registro não é aprovação ou mudança de fase.

### Fontes, critérios e documentação

- `AGENTS.md`; `SPEC.md` §5.2, §§8/10 e AC-09/13/29; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md` §3 e INT-18. SPEC derivada §§2.1/3.2/3.4, especialmente endpoint de repetição e representação Git mínima em §3.4, itens 6–7. Cobertura RF-49/53/84; S2 dos avisos para o detalhe da sprint 017.
- Critérios definidos antes da edição: aceitar resultado e concluir escritas antes da captura; índice separado inicializado da base; retenção por ref exclusiva; transações curtas e recibos antes dos efeitos; repetição elegível sem novo Implementador; diff sob demanda e persistência oficial sem bytes de projeto/ignorados.
- Skill Context7 aplicada: Git resolvido antes das consultas sobre índice alternativo, `read-tree`, `update-index -z --index-info`, `write-tree/commit-tree/update-ref`, refs criadas com precondição e nomes NUL. Fontes primárias: [índice](https://git-scm.com/docs/git-update-index), [refs](https://git-scm.com/docs/git-update-ref) e [diff](https://git-scm.com/docs/git-diff). OMP resolvido no Context7 e eventos conferidos na [API de extensões v18.11.1](https://github.com/can1357/oh-my-pi/blob/v18.11.1/packages/coding-agent/src/extensibility/extensions/types.ts), incluindo `tool_execution_start/end`. Nenhuma atualização de pacote foi necessária.

### Entregáveis e contratos

| Superfície | Arquivos e interfaces |
| --- | --- |
| Contratos | `packages/contracts/src/deliveries.ts`, reexportado em `index.ts`: `Delivery`, `DeliveryView`, `CaptureWarning`, `CaptureRetry`, params/query e diff paginado. `AttemptStatus` acrescenta `deliveryId` nullable. `ImplementerResult` v1 aceita `declaredFiles` opcional, com até 1000 caminhos relativos declarados; não contém os bytes desses arquivos. |
| Workspaces | `workspaces/capture.ts`: `createCapturer`, `CaptureInput`, `CapturedContent`, `CaptureError`, `captureLimits`; `diff.ts`: leitura/verificação/paginação da versão retida. Interface pública `createWorkspaces()` acrescenta `captureDelivery` e `getDeliveryDiff`. `git.ts` aceita stdin binário e índice temporário explícito, sem shell, com stdout UTF-8 fatal e falhas sanitizadas. |
| Storage | `storage/deliveries.ts` e `storage/index.ts`: entrega/view, claim inicial, recuperação/repetição e conclusão transacional; `CaptureClaim`, `RetryCaptureCommand`. `onResultAccepted` agenda IO somente após o commit. `storage/execution.ts` grava entrega pendente na mesma transação do resultado e impede reserva/ready do Revisor sem captura. `operations.ts` projeta cada operação de repetição pelo seu próprio registro de execução técnica. |
| Persistência | Migration **006**, sem editar 001–005: `deliveries`, `capture_runs`, `capture_warnings` STRICT; FKs compostas, índices e guards. Histórico de tentativas de captura é preservado; identidade/conteúdo capturados não são sobrescritos. Resultados históricos da v5 permanecem consultáveis com versão identificável e continuidade revogada. |
| Pipeline/HTTP | `pipeline/start.ts`, `http/routes/deliveries.ts` e composição em `http/app.ts`: captura automática após resultado; GET `/deliveries/:deliveryId`, GET `/deliveries/:deliveryId/diff`, POST `/attempts/:attemptId/deliveries/:deliveryId/capture/retry`. Sessão/Origin/CSRF, schemas fechados, ETag, idempotência e `OperationAccepted` existentes são reutilizados. |
| Executor/recurso | Extensão observa ferramentas ativas e recusa resultado enquanto outra ferramenta não terminou, sem desativar tools/MCPs. Recurso do Implementador orienta declarar caminhos, terminar escritas/processos e manter a entrega estável. Schema v1 foi estendido de forma opcional; SHA-256 atual dos bytes fonte é `b3529f0117898895659112e43537c9a6595a1c4fa58f65235a3a4eb72789bb5a`. Capturas anteriores e seus digests não são reescritos. |
| Provas | `workspaces/capture.test.ts`, `tests/fixtures/capture.ts`, `tests/integration/deliveries.test.ts`, prova de ferramentas pendentes na extensão e atualização das expectativas históricas de schema/guard do Revisor. README documenta interfaces, limites e continuidade. |

### Captura, retenção e avisos

Resultado oficial, recibo, critérios, entrega `pending` e evento são atômicos. Captura passa por claim `running` antes do IO. Escritas próprias são encerradas pelo contrato `writesStopped:true` e pelo término das ferramentas observado na extensão; processos próprios em background também precisam ter sido encerrados pelo Implementador. Não foi criado supervisor de processos ou bloqueio de filesystem. A fase `verifying` pode existir enquanto captura está pendente; ela não comprova checks executados. Revisor só pode ser reservado/confirmado após `captured`; checks do controlador serão implementados pela sprint consumidora com o mesmo gate.

São enumerados nomes por NUL; tracking atual, novas inclusões não ignoradas, remoções em relação à base, renomes por conteúdo e modos entram no cálculo. Arquivo removido do índice e passado a ignorado permanece excluído, mesmo que existisse na base; a regressão confere o aviso e a ausência dos novos bytes. Cada leitura é limitada e confere identidade/metadados do arquivo. Uma observação inicial e outra final comparam conteúdo, modos, HEAD, índice e seleção; os bytes usados para objetos também precisam coincidir. Lock/conflito de índice, sparse checkout, arquivo especial/symlink, submodule, LFS, filtros e alterações concorrentes geram diagnóstico, sem hash aprovável. Nomes com espaços/Unicode foram usados no filesystem; quebras de linha foram exercitadas no parsing NUL. Não se parseiam linhas de nomes nem `old -> new`.

Índice temporário próprio é inicializado da base no repositório Git gerenciado, recebe as entradas observadas via stdin NUL e é descartado ao concluir ou tratar a falha. Nenhum índice da implementação é copiado/persistido ou atualizado. Seus bytes foram comparados antes/depois nas fixtures. Limites: 100.000 arquivos, 16 MiB/arquivo, 128 MiB de conteúdo total; stdout Git continua limitado a 4 MiB e cada chamada a 15 s. Excesso recusa a captura sem truncar sucesso.

Retenção usa `<data>/git/<attemptId>.git`, sem alternates/dependência do checkout. A base é transferida para esse armazenamento; a tree capturada é ancorada por commit técnico privado com exatamente a base como parent. A ref exclusiva `refs/factory/deliveries/<deliveryId>` é criada com precondição de ausência. `contentIdentity` é o ID Git da tree. Ref direta, commit/tree/base e integridade dos objetos são conferidos antes da confirmação e ao consultar diff. Git recebe fsync habilitado para os componentes. O commit técnico não é commit de entrega ou autorização de publicação.

Ignorados não são percorridos para coleta. Novos arquivos com nomes conhecidos de segredo são excluídos; se já tracked, a captura recusa. Essa regra por nomes não é um scanner universal de credenciais. `declaredFiles` produz avisos vinculados a tentativa/passagem/delivery com caminho e razão `DECLARED_NEW_FILE_IGNORED` ou `KNOWN_SECRET_EXCLUDED`. Não armazena bytes ignorados, não os autoriza para inclusão e não solicita consentimento por arquivo. O caso controlado `cache/declared.txt` comprova aviso consultável e ausência do marcador de bytes na árvore/objetos simulados, no banco oficial e nos payloads de histórico. A UI desse aviso continua na sprint 017.

Banco guarda refs/hashes/metadados/avisos e execuções técnicas; nunca checkout, índice, arquivos ou diff completo. Leituras de tentativa, entrega e eventos não consultam worktree/Git ou carregam conteúdo de arquivo. Diff lê somente a ref retida sob demanda, retorna paths/status/modos e patches escapáveis, e explicita binários, encoding não suportado e patches grandes. Usa 25 entradas por padrão/máximo 100; cursor vincula identidade da versão/conjunto observado, e `nextCursor/hasMore` impedem truncamento silencioso. Blobs somados acima de 64 KiB recebem indicação de patch grande; patches textuais têm orçamento de 256 KiB por página.

### Repetição e recuperação

POST recebe `{producerPassageId}`, `If-Match` **da tentativa** e chave UUID. Repetição exige falha técnica, mesma passagem concluída/acompanhada, escritas encerradas, fase elegível, nenhuma pergunta impeditiva e revisão atual. Estado/revisão alterados, captura concorrente, versão capturada ou continuidade revogada geram `CAPTURE_RETRY_NOT_ALLOWED`. Operação/recibo/evento e novo claim são confirmados juntos antes do IO; replay recupera o mesmo recibo antes de CAS e não inicia outro efeito. Chave com conteúdo/precondição divergente conflita. Não recruta Implementador nem repete clone.

Falha preserva trabalho e registra diagnóstico. Se a ref já existir após falha de commit dos metadados, a repetição só a recupera quando tree/base coincidirem; nunca sobrescreve a ref. Conteúdo divergente exige outra versão e permanece diagnosticado. Cancelamento/troca de escopo/perda de continuidade durante o IO impedem avanço e preservam recurso retido parcial; restart não readota passagem nem refaz captura automaticamente. Execuções técnicas anteriores não são sobrescritas.

### Validação técnica observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, testes e scripts strict, sem supressões/any explícito. |
| `npm.cmd run lint` | Exit 0; limites de módulos/SQL/contratos e convenções estáticas. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **378 testes em 26 arquivos**, 35 testes adicionais sobre os 343 anteriores. Rede/subprocessos/providers reais continuam bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador/declarations, seis migrations, recursos e bundle web distribuídos. Avisos anteriores do Vite/plugin React sobre esbuild/optimizeDeps permanecem. |
| `npm.cmd run test:compiled` | Exit 0; smoke histórico HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock. Não executa Git/Maestri. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos distribuídos, socket UTF-8/EOF e PowerShell com Node como fixture; `maestriOmpIntegration:not_executed`. |

Provas incluem captura posterior ao commit; nenhuma captura antes do resultado; ferramentas pendentes; entrega pendente atômica ao resultado; recuperação de resposta/ref; concorrência/revisões/perda de tracking/cancelamento antes e durante captura; uma passagem/clone no retry; rollback dos componentes e SQLite busy sem recibo; migração SQLite **5→6** preservando identidade e resultado/recibo; guards/FKs; exclusão e avisos de ignorados/segredos conhecidos; bytes do índice preservados; modo executável; LFS/filtros/submodule/conflito/lock recusados; ref divergente e cursor de outra versão; binários/texto não UTF-8; e diff consultável após remoção do ambiente sob Git controlado.

Medição AC-29 da rodada local final: filesystem/SQLite reais, Git e canonicalização controlados, cache ignorado aumentado para **16.777.216 bytes**, 20 consultas por superfície. Valores são observações locais, sem SLA:

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Banco SQLite | 4.096 bytes | 4.096 bytes |
| WAL | 1.124.792 bytes | 1.124.792 bytes |
| Metadados auxiliares de retenção da fixture | 36 bytes | 36 bytes |
| Payload agregado das consultas | 5.249 bytes | 5.249 bytes |
| Catálogo, 20 consultas | 12,79 ms | 11,94 ms |
| Polling de tentativa, 20 consultas | 8,97 ms | 6,07 ms |
| Histórico de eventos, 20 consultas | 10,65 ms | 8,90 ms |
| Metadados da entrega, 20 consultas | 14,91 ms | 14,85 ms |

Os payloads foram comparados integralmente e permaneceram iguais, sem bytes de arquivos. Os 36 bytes são o marcador de ownership da fixture, que mantém o grafo de objetos controlado em memória; **não são medição de pack/objetos de um Git real**. A ausência de conteúdo excluído também foi verificada no grafo controlado. Não extrapolar os tempos ou o tamanho simulado para o Git real.

### Limites e continuidade

- Git real não foi executado: este runtime não oferece o contexto elevado/keyring exigido pelo projeto, e a restrição de não executar mutações Git foi mantida. Canonicalização positiva permanece controlada devido à limitação EPERM já documentada. Nenhum login alternativo, mudança de credencial/ACL, status/diff Git ou instalação foi realizado.
- Retenção em objetos/ref Git reais, recuperação após morte de runtime real, GC real, preservação de índice/working tree por binário Git real e captura integrada ao término de uma TUI Maestri/OMP continuam para o host autorizado. SQLite/reopen e remoção física da implementação foram exercitados com Git controlado; isso não comprova durabilidade de objetos Git reais.
- Consumidores de checks/revisão/publicação devem materializar da ref retida e conferir ref/tree/base. Não devem recapturar o clone para publicar. Checks do controlador, revisão independente, publicação, novas rodadas e UI de detalhe permanecem nas sprints próprias. A presença do gate não comprova execução desses consumidores.
- RF-49/53/84 estão implementados nas superfícies backend descritas. AC-09/13/29 e INT-18 **não são declarados integralmente aceitos** por fixtures/compilação. Sem aceite visual, revisão independente da entrega ou mudança de fase presumidos.

## Sprint 010 - Versão Git imutável e repetição de captura [CONCLUIDA]
- Captura fiel de conteúdo: Disponibilizar captura da entrega sem alterar o índice de implementação.
- Retenção independente da versão: Preservar base e conteúdo capturado no armazenamento Git gerenciado.
- Recuperação técnica da captura: Implementar capture/retry e disponibilizar diff paginado por versão.

## Sprint 011 — Checks reais e evidências íntegras [IMPLEMENTADA]

Data: 2026-10-16. Implementação backend no repositório canônico; histórico anterior preservado. Nenhuma dependência instalada, comando Git/GH executado, provider, terminal Maestri, publicação, commit ou push. As operações Git implementadas pertencem ao produto e aos seus ambientes gerenciados; não foram executadas neste runtime. Não representa aprovação, mudança de fase ou Design Lock.

### Fontes, critérios e prova definida

- `AGENTS.md`, `SPEC.md` §§5.2/8.2/8.4/10.2 e AC-06/13; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md`, especialmente INT-18 e o contrato da versão capturada. SPEC derivada §§2.1/3.2/3.4/5.2; cobertura desta sprint RF-18/50/84 e RNF-11/16.
- Antes da edição foram definidos: materialização exclusivamente da ref capturada por check; definições capturadas por valor; intenção durável antes do processo; histórico sem sobrescrita; gravação externa concluída antes dos metadados; consulta por ID com vínculo, raiz, tamanho e checksum; falha técnica diferente de reprovação e sem avanço/aprovação falsa.
- Skill Context7 aplicada com resolução antes das consultas: Node.js 24 (spawn/close/kill, pipes, FileHandle.sync/rename), better-sqlite3 (transações síncronas/IMMEDIATE/rollback) e Git (clone independente e namespace de refs). Fontes primárias: [Node child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Node fs](https://nodejs.org/docs/latest-v24.x/api/fs.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) e [git-clone](https://git-scm.com/docs/git-clone). Nenhuma atualização de pacote.
- Provas por superfície: decisões/runner controlados na suíte padrão; Fastify inject, SQLite e filesystem reais para consulta, rollback e integridade; Git/canonicalização controlados para materialização; processo Node real no smoke compilado. Esses níveis não comprovam o percurso Maestri/OMP/Git real.

### Interfaces e arquivos

| Superfície | Arquivos e contrato |
| --- | --- |
| Contratos | `packages/contracts/src/verification.ts`, reexportado no index: `CheckState`, `CheckRun`, `VerificationSummary`, `CheckHistory`, `CheckHistoryQuery`, `Artifact`, `ArtifactParams`. `DeliveryView` recebe `verification` nullable com o resumo mais recente. |
| Verificação | `modules/verification/index.ts`: `createVerification({storage,workspaces,dataDirectory,logFailure})`, `verifyDelivery(deliveryId,signal)`, `getArtifact(id)`. `runner.ts` encapsula subprocesso/limites/redação; `artifacts.ts` encapsula gravação/leitura externa e `VerificationError`. Sem SQL, HTTP ou runtime OMP internos. |
| Ambiente | `workspaces/materialize.ts`; interface pública `workspaces.materializeCheck(delivery,checkId)`. Ref/commit/tree/base e ownership são conferidos antes/depois da materialização; clone privado e fetch explícito da ref técnica, checkout detached exato, tree e estado limpo. |
| Persistência | `storage/verification.ts`; API pública `beginVerification`, `startCheck`, `finishCheck`, `finishVerification`, `getCheckHistory`, `getArtifact`, tipos `VerificationPlan` e `CheckCompletion`. SQL e transações permanecem privados. `deliveries.ts` projeta somente o resumo. `interruptAttempts` diagnostica runs/checks não concluídos. |
| Migration | `007_verification.sql`: `verification_runs`, `checks`, `artifacts` STRICT, índices para versão/histórico/artefatos, unicidade de execução ativa e FKs compostas por tentativa/entrega/tree/run. Guards preservam definições, identidades, resultados concluídos e artefatos. Migrations 001–006 preservadas. |
| Pipeline/composição | `pipeline/start.ts`, `main.ts`, `http/app.ts`: produção fornece verification, executado depois do commit da captura. `pipeline.verifyDelivery` permite reexecução interna, acompanhada por drain/shutdown; `getArtifact` traduz falhas sanitizadas. Sem endpoint de comando de check livre. |
| HTTP | `http/routes/deliveries.ts`: GET `/api/v1/deliveries/:deliveryId/checks`, GET `/api/v1/artifacts/:artifactId`; GET da entrega inclui resumo. Schemas fechados e proteção HTTP existentes. |
| Provas/documentação | `tests/integration/verification.test.ts`, `verification/runner.test.ts`, `verification/artifacts.test.ts`, `workspaces/materialize.test.ts`, extensão de fixtures/expectativas históricas, `scripts/smoke-verification.mjs`, script `test:verification-compiled`, README e este registro. |

### Comportamento entregue

O pipeline confirma resultado oficial e captura antes de iniciar verificação. `beginVerification` confere versão capturada, tentativa atual/fase/tracking/conta/pergunta e cria execução e todos os checks pendentes em transação IMMEDIATE. Obtém as definições da configuração capturada na tentativa, nunca da configuração editável atual nem dos checks declarados pelo agente. Uma segunda execução concorrente é recusada antes do IO; reexecuções posteriores recebem outro runNumber sobre a mesma tree. Configuração alterada depois do início não altera comando/cwd/timeout históricos.

Cada check reserva exclusivamente `<data>/work/<attemptId>/checks/<checkId>/checkout`, a partir de `<data>/git/<attemptId>.git`. Não usa a implementação como fonte. Clone normal não transfere necessariamente `refs/factory`; o adapter busca explicitamente a ref retida e confere FETCH_HEAD com o commit capturado. Não usa shared/reference/hardlinks/alternates. Hooks/templates próprios vazios e configuração de checkout sem conversão automática; ref/base/commit/tree/objetos são revalidados. Ambiente existente/parcial não é readotado, resetado ou removido. Cada check recebe materialização própria, inclusive dentro da mesma execução.

O cwd configurado é relativo, existente e contido; drive/ADS, absoluto, `..`, `.git`, controles e redirecionamento por symlink/junction/canonicalização são recusados. O runner executa a expressão de shell capturada, com cwd explícito, stdin fechado e variáveis operacionais de paths/usuário/locale, `CI=true` e `NO_COLOR=1`. Não injeta credenciais de provider/Wire/Git. Não é sandbox geral; comandos/configuração continuam na fronteira confiável. Falha nativa de lançamento do shell é `CHECK_LAUNCH_FAILED`; erro interpretado pelo shell conserva o exit code observado.

Cada check registra versão/IDs, comando/cwd/timeout, runNumber, estado, exit code, início/fim e duração de processo, diagnóstico geral e `executionDiagnostic`. Este último e o exit code permanecem mesmo se a evidência externa também falhar. Zero com evidência confirmada produz passed; não zero produz failed. Timeout/sinal/lançamento/output excedido/cancelamento/materialização/evidência são erros técnicos. Ausência de checks produz not_applicable com CHECKS_NOT_CONFIGURED, sem aprovação inventada. A verificação mantém fase verifying, sem declarar entrega nem despachar Revisor antecipadamente.

Limites: timeout padrão 300.000 ms, substituível pelo valor capturado (1–2.147.483.647 ms); 1 MiB agregado de stdout/stderr; grace de parada 1.000 ms. São limites de recursos, não SLAs. Pipes são consumidos e buffers limitados. Timeout, overflow ou cancelamento pedem parada do shell próprio, mas não inferem morte de seus descendentes; conservam STOP_UNCONFIRMED e impedem checks posteriores. Recursos e arquivos permanecem para diagnóstico, sem limpeza automática.

Somente logs pertinentes de checks são coletados, após redação de valores sensíveis conhecidos, headers/URLs com credencial e formatos conhecidos de token/chave. Não há coleta de arquivos de projeto, índice, caches, transcript ou diff completos; a redação não é detector universal de segredo arbitrário. Logs ficam em `<data>/artifacts/<attemptId>/<checkId>/<artifactId>.log`. O diretório do check permite identificar arquivos órfãos se a transação de metadados falhar.

Arquivo temporário exclusivo é escrito, sincronizado, renomeado e relido/conferido antes de confirmar metadados e resultado em SQL. A transação inclui artefato, check, revisão/evento; falha reverte o conjunto, preserva o arquivo externo e finaliza o run como erro quando ainda há capacidade de escrita. Se nem o diagnóstico puder ser persistido, a intenção durável permanece incompleta, o log registra código sanitizado e restart a marca interrompida. Nenhum desses caminhos aprova a entrega. IO de arquivo/processo/Git fica fora das transações.

Consulta de artefato confere escopo e FKs, path gerado por IDs, raiz/diretórios canônicos sem reparse, arquivo regular, identidade estável durante leitura, tamanho e SHA-256. Reconfere escopo após IO. Ausência retorna 404 ARTIFACT_MISSING; corrupção retorna 409 ARTIFACT_INTEGRITY_FAILED, sem conteúdo vazio presumido. Conteúdo é text/plain, nosniff, attachment, CSP restritiva e no-store; HTML/JS no log não é servido como documento ativo. Não existe path arbitrário nem upload. Histórico pagina 25/máximo 100 com teto observado e identidade da versão; metadados de entrega/histórico não leem bytes de logs ou checkout.

### Validação técnica final

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, testes, contratos e scripts strict, sem any/supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos, SQL privado, contratos e convenções estáticas. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **412 testes em 30 arquivos**, 34 adicionais sobre os 378 anteriores. Rede/subprocessos/providers reais permanecem bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador/declarations, sete migrations, recursos e bundle web distribuídos. Permanecem avisos anteriores de React/esbuild e optimizeDeps do Vite. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock históricos, distribuição atual. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos/socket/PowerShell com Node como fixture, maestriOmpIntegration:not_executed. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node reais passed/failed, exit codes 0/7, cwd com espaços/Unicode e UTF-8, gravação/sync/rename/checksum reais, corrupção/ausência diagnosticadas. canonicalization:controlled_after_EPERM; Git e Maestri não executados. |

Provas novas abrangem execução após commit; ausência de execução por mera declaração do agente; versão e ambientes por check; comandos capturados após edição posterior; histórico/runNumber/paginação; timeout/lançamento/exit não zero/overflow/cancelamento; cwd inválido/ausente/redirecionado; perda de tracking durante execução; concorrência/busy antes do IO; rollback por falha no artefato e no evento; órfão identificável e reexecução recuperável; exit/diagnóstico do processo conservados quando evidência falha; nenhuma passagem posterior sob parada incerta; restart sem replay; checksum/tamanho/vínculo/escopo; texto ativo inerte; e migration SQLite real 6→7 preservando instalação, refs e resultado/recibo, sem fabricar checks.

### Limites e continuidade

- Canonicalização real permanece recusada com EPERM neste sandbox. Fixtures positivas e o smoke compilado controlam explicitamente essa resolução; produção mantém realpath e recusa segura. Rename falhou no temporário externo do sandbox, mas passou com filesystem real em `.cache` no workspace; os testes positivos usam esse diretório. Não foram alteradas ACLs/credenciais nem introduzido fallback de produção.
- Git real/materialização real não foram executados: o runtime não fornece require_escalated/keyring exigido e as restrições Git do usuário foram respeitadas. A prova controlada verifica seleção/argv/ref/tree e conteúdo independente da implementação, sem equivaler a um checkout feito por Git real. O smoke nativo executa somente Node e não elimina esse limite.
- Maestri/OMP/provider/MCP real e o percurso completo do agente até checks permanecem para o host autorizado/sprint 018. AC-06/13 e INT-18 integrais não são declarados aceitos por fixtures. Revisão independente, novas rodadas de correção, aprovação/publicação e UI do detalhe continuam nas sprints consumidoras, usando esta versão e seus checks/artifacts.
- A revisão automática bloqueou a leitura opcional da memória externa como conteúdo privado não autorizado pela tarefa. O trabalho prosseguiu pelas fontes locais; a memória bloqueada não foi usada. Nenhum Git/GH, commit/push ou aprovação/mudança de fase foi executado.

## Sprint 011 - Checks reais e evidências íntegras [IMPLEMENTADA]
- Verificação da versão capturada: serviço e consumo pelo pipeline, materialização própria por check e estados/tempos/diagnósticos do controlador.
- Evidência externa com integridade: gravação anterior à confirmação de metadados e GET protegido com vínculo, raiz, tamanho, checksum e tratamento inerte.
- Histórico sem falso sucesso: runNumber, resultados preservados, rollback/diagnóstico/restart e consultas leves por versão.

## Sprint 011 - Checks reais e evidências íntegras [CONCLUIDA]
- Verificação da versão capturada: Disponibilizar verification e seu consumo pelo pipeline.
- Evidência externa com integridade: Persistir apenas arquivos pertinentes de evidência e implementar GET /artifacts/:artifactId.
- Histórico de checks e falhas sem falso sucesso: Manter execuções anteriores e integrar os resultados às consultas de entrega.

## Sprint 012 — Revisão independente e correções limitadas [IMPLEMENTADA]

Data: 2026-10-16. Implementação backend no repositório canônico, preservando o histórico acima. Sem novas dependências, comandos Git/GH, provider, recrutamento Maestri, clone real, publicação, commit ou push nesta execução. Operações Git e recrutamento presentes no código pertencem ao percurso do produto no host autorizado; não foram disparados por esta validação. Este registro não é aprovação ou mudança de fase.

### Fontes, critérios e validação definida

- `AGENTS.md`, incluindo as instruções atualizadas fornecidas durante a execução; `SPEC.md` §§5.2–5.4/8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`; SPEC derivada §§2.1/2.3/3.4. Cobertura: US-12, RF-54–57, AC-07/08/13 e INT-03/06/18 nas superfícies descritas abaixo, sem declarar aceite integrado integral.
- Antes da edição: revisão somente da entrega capturada/checks, sessão/clone próprios, critérios/achados por identidade, resultado e recibo atômicos, limite capturado de rodadas, continuação na sessão implementadora acompanhada e preservação integral de resultados anteriores.
- Context7: resolução e consulta de better-sqlite3 para transações síncronas/IMMEDIATE/rollback; Git para ls-tree/NUL e hash-object por stdin sem filtros/escrita. O follow-up da extensão mantém a API `sendUserMessage(...,{deliverAs:'followUp'})` já usada no adapter suportado. Versões do lockfile preservadas.
- Provas: SQLite/Fastify inject/filesystem reais para contratos, transações, histórico, escopo e bytes; Git/canonicalização/materialização/lançamento controlados; adapter/extensão reais com canal/native controlados para continuação/ACK/perda. Esses níveis não são prova de Git, TUI, provider ou MCP reais.
- GitNexus consultado por `list_repos`: não há índice deste repositório; o código atual foi a referência, sem consultar o grafo do legado.

### Entregáveis e interfaces

| Superfície | Arquivos e contrato |
| --- | --- |
| Contratos | `packages/contracts/src/reviews.ts`: `Finding`, `Review`, `RoundHistory`, `ProducerResult`; exports em `index.ts`. `AttemptStatus.round` aceita 1–6. `PassageRequest.previousBlockingFindingKeys?` diferencia impedimentos anteriores; resultado Implementador v1 recebe `findingResponses?`. |
| Pipeline | `pipeline/start.ts`: captura → checks → revisão; revisão rejeitada → próxima rodada/continuação ou esgotamento. Tarefas estruturadas usam captura original, perfis/recursos por valor, critérios, versão, checks e achados. Não há conversa do Implementador no contexto revisor. |
| Ambiente | `workspaces/materialize.ts` compartilha a materialização existente por finalidade `checks/reviews`; `review.ts` implementa `validateReview`. API pública `materializeReview(delivery,reviewId)` e `validateReview(delivery,reviewId)` em `workspaces/index.ts`. |
| Persistência | `storage/reviews.ts`: `beginReview`, `readReview`, `recordReviewWorkspace`, `recordReviewIntegrity`, `beginCorrection`, `openFindings`, `readRounds`; expostos pela API de negócio do storage. `execution.ts` aceita parecer/achados/resoluções dentro da transação do resultado. `attempts.ts` consulta a rodada atual. |
| Migration | `008_reviews.sql`: `reviews`, `findings`, `finding_resolutions` STRICT; índices, FKs compostas, guards de papel/vínculo/aprovação/histórico e `passages.session_source_id` imutável. Migrations 001–007 preservadas. |
| Executor | `execution/index.ts` acrescenta `continuePassage(source,request)` e a dependência de composição `validateReviewerResult`. Adapter/extensão Maestri/OMP enviam contexto e confirmam `continuation-receipt` na mesma sessão. Handshake rejeita sessão/terminal já observados em outra passagem viva. |
| Composição e HTTP | `main.ts` fornece a conferência do checkout antes de aceitar resultado revisor; GET `/attempts/:attemptId/rounds`, `/deliveries/:deliveryId/review` e `/deliveries/:deliveryId/producer-result`, com schemas fechados e proteção HTTP/escopo existentes. Sem endpoint público de resultado/agente/shell. |
| Provas e documentação | `tests/integration/reviews.test.ts`, `workspaces/review.test.ts`, testes de continuação no adapter/extensão e adaptações das fixtures históricas; `tests/fixtures/review-schema.ts` reconstrói somente bancos temporários anteriores para provar migrations. README, documentação do adapter e este registro atualizados. |

### Revisão e independência

`beginReview` exige entrega capturada atual, mesma tree dos checks, execução de checks concluída, continuidade acompanhada e nenhuma pergunta/cancelamento/suspensão incompatível. Erro técnico ou parada incerta impede revisão. Checks failed podem receber diagnóstico do Revisor, mas impedem aprovação; `not_applicable` sem checks conserva essa distinção. Revisão/passagem/terminal são registrados antes do IO e nunca relançados por leitura/replay.

O clone próprio é `<data>/work/<attemptId>/reviews/<reviewId>/checkout`, derivado exclusivamente da ref/commit/tree/base retidos. Usa reserva exclusiva, clone independente, fetch explícito da ref privada, hooks/templates próprios e conferência de identidade; não usa implementação como fonte. Diretório parcial não é readotado, resetado ou apagado. Estado planejado/pronto/parcial e identidade da revisão permitem diagnosticar o recurso. O Revisor usa sessão nova com perfil e digest exatos capturados.

Antes do primeiro resultado, a composição confere novamente ref/objetos retidos, HEAD/status NUL e bytes de cada blob tracked, sem filtros ou escrita de objetos/índice. Flags assume-unchanged/skip-worktree não dispensam leitura dos bytes. Confere identidade/estabilidade de arquivo e modos onde suportados; remoção, conteúdo/commit/staging ou inclusão não ignorada divergentes invalidam o parecer. Caches ignored gerados permanecem fora do produto. Falha de Git/leitura impede aceitação; invalidez observada não é recuperada por reparar o clone e reenviar aprovação. Não há bloqueio de filesystem ou vigilância contínua; alteração e restauração integral antes da conferência não são uma observação de mudança que este mecanismo prometa detectar.

### Parecer, achados e recibo

`acceptResult` continua validando schema, vínculo de tentativa/passagem/papel/rodada/versão, hash e conjunto exato de criterionIds com evidência. A revisão grava na mesma transação IMMEDIATE resultado, recibo, critérios, parecer, achados/resoluções, fase e evento antes do ACK. Repetição idêntica recupera o recibo antes de avançar; conflito/payload inválido/falha SQL não substituem o resultado nem ocupam recibo.

Cada achado preserva UUID próprio, chave declarada, critérios/categoria, problema/evidência/resultado esperado e blocking. Categoria técnica explícita permite `criterionIds:[]`; IDs estrangeiros, duplicados ou resoluções de outra tentativa/rodada são recusados. Próxima revisão recebe os UUIDs como findingKey e responde exatamente uma vez por achado pendente. O Implementador responde pelos mesmos IDs em `findingResponses`, sem resolver achados. Pareceres, achados, resoluções e resultados concluídos são imutáveis.

Aprovação exige critérios passed, independência válida, checks compatíveis, nenhum novo achado impeditivo e resolução independente de todos os impedimentos anteriores. Pendência não impeditiva pode permanecer explicitamente unresolved. `declaredVerdict` preserva o veredito do agente separado do estado efetivo: produto alterado produz revisão rejected mesmo se declarado approved. Aprovação histórica move a fase a publishing, mantendo resultado final nulo. Publicação e seu gate de autoridade atual continuam para a sprint consumidora; não se declara delivered nem se reutiliza aprovação de outra versão.

### Correções e encerramento

Limite vem da configuração capturada: rodada inicial 1 e máximo `1 + correctionLimit`, padrão 2 correções, aceitando 0–5. Reprovação confirma outra rodada/passagem/identidade de entrega e o vínculo à sessão implementadora anterior antes do follow-up. Cada correção entrega nova captura, checks e revisão em sessão própria. A última correção permitida também é revisada; só depois de reprovada o esgotamento termina finished/rejected. Pergunta humana não consome correção.

`continuePassage` usa somente o handle vivo da sessão anterior, com cwd, perfil e recurso originais. A passagem lógica nova recebe resultado próprio; o terminal físico é resolvido pela cadeia `session_source_id`. Não há recruit nessa operação. A extensão confirma o enfileiramento pela API nativa de follow-up; isso não afirma que o modelo já executou a correção. Timeout/EOF/perda conserva intenção e diagnóstico, sem retry cego ou substituta oculta. Recibos de parada continuam ligados ao recurso físico original. Desconexão de Revisor já concluído não revoga rodada posterior; perda da sessão implementadora atual impede continuidade. Restart preserva histórico e interrompe trabalho incompleto, sem restauração automática.

Histórico de rodadas retorna no máximo seis resumos leves; resultados/revisões completos são carregados sob demanda por deliveryId. Consultas conferem conta atual, não executam Git e não leem checkout/logs. Contexto suporta até 1000 achados pendentes e os limites existentes de tarefa/frame; excesso recebe diagnóstico, sem despacho ou truncamento aprovável. Nenhum arquivo do produto/índice/cache/transcript é persistido em SQL ou eventos.

### Recursos versionados e compatibilidade

Os recursos v1 evoluíram com instruções de continuação, UUIDs de achados e `findingResponses` opcional no schema implementador; na correção, storage exige as respostas exatas quando há achados. Capturas anteriores mantêm referências/digests originais, sem reescrita. A captura não arquiva os bytes antigos dos recursos; distribuição divergente recusa despacho, sem substituir silenciosamente o contrato ativo.

| Papel | SHA-256 atual dos bytes fonte/distribuição |
| --- | --- |
| Implementador v1 | `b1fd89ace768faa6e63cb17d3966342af02275732ce04530f6b110789b5fa627` |
| Revisor v1 | `b684069c5bea0052d6ef12d65882d244d3edc80208490c943eebdc1bf51f48c0` |

### Validação técnica observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, testes/scripts strict, sem any ou supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos, SQL privado e convenções existentes. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **449 testes em 32 arquivos**, 37 adicionais sobre os 412 da sprint anterior; rede/subprocessos/providers reais bloqueados. |
| `npm.cmd run build` | Exit 0; controlador/declarations, oito migrations, recursos e bundle web; avisos anteriores React/esbuild/optimizeDeps permanecem. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock reais do smoke histórico. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos distribuídos, socket UTF-8/EOF e PowerShell com Node como fixture; Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node reais passed/failed, filesystem/sync/rename/checksum reais; canonicalização controlada após EPERM; Git/Maestri não executados. |

Provas novas incluem limites 0–5 e revisão final, perfil/tree/cwd/contexto estruturado, critérios e IDs exatos, categoria geral, invalidação de approved, respostas implementadoras sem resolução por declaração, resolução bloqueante independente e pendência não impeditiva, árvores/refs/recibos distintos, imutabilidade, replay/reopen, perda/timeout/ACK na continuação, nenhuma substituta, ausência/erro/unfinished dos checks, cancelamento com materialização tardia, SQLite busy antes do efeito, rollback em achados/resoluções/revisão/evento, escopo HTTP/histórico sob demanda e migração real SQLite 7→8 preservando identidade/refs/resultados sem fabricar revisões.

### Limites e continuidade

- Materialização Git, leitura Git e canonicalização positiva foram controladas nas novas provas; bytes e SQLite/HTTP inject são reais. Isso não prova clone/ref/índice por um Git real, sessão/provider/TUI reais, independência observada no host ou integração Maestri/OMP completa. A prova opt-in continua para o host autorizado/sprint 018.
- Nenhum comando Git/GH executado: o runtime não oferece o contexto elevado/keyring requerido e as restrições do usuário foram respeitadas. Nenhuma autenticação alternativa, alteração de ACL/credencial ou instalação foi realizada.
- Não houve validação de acesso Wire nesta sprint. Ausência de MAESTRI_PIPE no shell externo não comprova indisponibilidade do Wire. Uma validação futura desse acesso deve usar `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` e helpers existentes, sem confundi-la com a conexão nativa do produto.
- AC-07/08/13 e INT-03/06/18 integrais permanecem sem aceite real nesta execução; publicação/gate atual, UI de detalhe e integração real continuam nas sprints consumidoras. Nenhum Design Lock, aprovação ou mudança de fase foi simulado.

## Sprint 012 - Revisão independente e correções limitadas [CONCLUIDA]
- Passagem revisora independente: Executar o Revisor em sessão e clone próprios da entrega capturada.
- Parecer e achados completos: Estender acceptResult para registrar a revisão e a resolução independente dos achados.
- Rodadas de correção preservando histórico: Conduzir correções na mesma tentativa até aprovação ou esgotamento.

## Sprint 013 — Decisão humana, tempos e limites [IMPLEMENTADA NO BACKEND]

Data: 2026-10-16. Implementação no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada, ação Git/GH, provider, recrutamento Maestri, atualização remota de issue ou publicação. Não representa aprovação, mudança de fase ou Design Lock.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §§5.3–5.5/8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` §§3/8; SPEC derivada §§2.1/3.2/3.4 e stories RF-29/58–62. AC-14/15 e INT-05/07 recebem as provas locais descritas; o aceite integrado real permanece pendente.
- Provas definidas para schema/vínculo, continuidade de fase/rodada, persistência antes do envio, CAS/idempotência/recuperação, comparação dos critérios capturados e clocks/expiração independentes. SQLite/HTTP inject reais; GitHub, lançamento/TUI e relógios controlados, sem efeitos externos implícitos.
- Skill Context7 aplicada: resolução e consulta de better-sqlite3 para transações síncronas/IMMEDIATE/rollback e Fastify para TypeBox/type provider e schemas de rota. Versões do lockfile mantidas. Não há nova dependência nem serviço genérico de classificação/telemetria.

### Entregáveis e interfaces

| Superfície | Arquivos e contrato |
| --- | --- |
| Schemas | `packages/contracts/src/questions.ts`, reexportado no index: `Question`, `QuestionParams`, `AnswerQuestion`, `ScopeChange`, `AttemptMeasurements`, `PassageMeasurements`. `AttemptStatus` acrescenta `pendingQuestionId` opcional para polling leve. |
| Storage | `storage/questions.ts`, `measurements.ts`, composição em `storage/index.ts` e ajustes em `execution.ts`, `operations.ts`, `attempts.ts`: `getQuestion`, `recordAnswer`, `recoverAnswer`, `markAnswerUnknown`, `getMeasurements`, `expireLimits`, `getScopeCandidates`. Port privado acrescenta `claimAnswer`; conexão e SQL continuam privados. |
| Persistência | Migration `009_questions_limits.sql`: perguntas com revisão, resposta/hash/operação, TTL/expiração, recibo e contexto de escopo; `passage_measurements` STRICT com checkpoints. Índices, vínculos compostos via passagem e guards preservam identidade, resposta e estados terminais. Migrations 001–008 preservadas. |
| Coordenação | `pipeline/start.ts`: `answerQuestion`, `revalidateScope`, `tick`; comparação pertinente no polling existente e antes do primeiro resultado oficial por passagem em `main.ts`/`http/app.ts`. Fechamento aguarda observações próprias, sem restaurar autoridade após restart. |
| HTTP | `http/routes/attempts.ts`: GET `/attempts/:attemptId/questions/:questionId`, POST da mesma rota com `/answer`, GET `/attempts/:attemptId/measurements`. Schemas fechados, sessão/Origin/CSRF, ETag da pergunta e operação consultável. `sendOperationAccepted` reconhece a aceitação durável de resposta cuja entrega ficou unknown. |
| Executor | Adapter/extensão Maestri/OMP mantêm follow-up nativo e correlacionam o ACK à passagem lógica atual, inclusive na correção da mesma sessão. Claim anterior ao canal; sem segundo recruit, parser de conversa ou reenvio cego. Decisão de manter escopo inclui orientação explícita e digest capturado no follow-up. |
| Provas e documentação | `tests/integration/questions.test.ts`, regressões do adapter/extensão, fixture de reconstrução de schema anterior e atualização das expectativas históricas de migrations. README registra os novos contratos e limites. |

### Pergunta, decisão de escopo e resposta

`execution_question` conserva decisão/contexto/alternativas e vínculo exato de tentativa/passagem/papel/rodada/versão. Não há classificador semântico de manutenção. A suspensão `HUMAN_DECISION` mantém fase, rodada, TUI e ferramentas; resultado pendente recebe `RESULT_INVALID` corrigível. Conversa livre não resolve pergunta e resposta não abre outra rodada.

A coordenação usa `interpretIssue` existente para comparar IDs/textos dos critérios atuais do corpo com o digest da captura. Edição editorial fora desse conjunto e comentário livre mantêm continuidade; alteração relevante gera pergunta com os critérios/digests atuais e capturados. Leitura parcial/inacessível não comprova igualdade. `keep_captured` explícito permite continuar somente com os IDs/textos/digest históricos; decisão entregue não reabre a mesma alteração, mas outra alteração gera nova decisão. `adopt_new` retorna `NEW_ATTEMPT_REQUIRED`, orientando atualizar GitHub e preparar outra tentativa. Nenhuma captura é substituída nem há mutação remota implícita.

`recordAnswer` confirma resposta/hash/operação/revisão/evento numa transação IMMEDIATE antes do canal. If-Match ausente retorna 428, revisão obsoleta 412; estado/continuidade incompatíveis são recusados. Replay idêntico recupera a operação antes de CAS, sem envio; divergência de texto/precondição/escopo é 409. O ledger guarda hash e recibo mínimos, sem duplicar o texto da resposta. Eventos/logs não carregam a resposta.

O claim `sending` é persistido antes do follow-up na passagem original acompanhada. Somente ACK correlacionado confirma `delivered` e remove a suspensão humana pertinente. Timeout/EOF/falha de entrega ficam `delivery_unknown`; consulta/replay não reenviam. ACK tardio válido reconcilia o estado, sem outro envio; expirado/cancelado não reabre a pergunta. Outra suspensão permanece intacta. Restart preserva registros e revoga continuidade incompleta, sem replay. A migração preserva perguntas/respostas v8, cancela sua coordenação incompleta e não inventa recibos/medições históricos.

### Tempos, expiração e indisponibilidade

Tempo ativo mede duração da passagem acompanhada desde ready, separado de espera humana até o recibo, inclusive entrega incerta. Limite ativo é por passagem; a consulta oferece também agregados e até 12 passagens. Checkpoints operacionais de 1 s não geram transcript/evento a cada tick. Perda de acompanhamento/restart informa medição incompleta; downtime não vira execução.

TTL usa inteiro seguro em ms; zero não concede janela válida de resposta e `not_configured` não expira. Sua expiração registra timestamp/estado e mantém `QUESTION_EXPIRED`, impedindo avanço sem afirmar parada física. Expiração ativa é registrada antes do cancelamento e permanece descobrível mesmo quando detectada na borda de resultado antes do scheduler. Cancelamento usa o executor existente; recibo físico do recurso continua independente, inclusive uncertain. Silêncio do terminal não é classificado como falha.

Zero medido, limite não configurado, indisponível e não aplicável são distintos. Custo não observado é `EXECUTOR_COST_NOT_OBSERVED`, com causa, RF-61 e pendência de obtenção de custo/moeda autoritativos. Limite configurado não é declarado cumprido/excedido sem medição. Não foi acrescentado dashboard financeiro, estimador ou telemetria; a verificação RF-61 de custo real continua pendente no host executor.

### Validação técnica observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, cliente e testes strict, sem any/supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos/SQL e convenções estáticas. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **476 testes em 33 arquivos**, 27 adicionais sobre os 449 anteriores. Suíte padrão sem rede, subprocessos/providers reais. |
| Testes focados de perguntas/adapter/extensão | Exit 0; CAS, rollback/busy, clocks/escopo, timeout/ACK tardio e passagem lógica da correção. |
| `npm.cmd run build` | Exit 0; controlador/declarations, nove migrations, recursos e web. Avisos anteriores do plugin React/esbuild e optimizeDeps do Vite permanecem. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock históricos, com migration 009. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos distribuídos, socket UTF-8/EOF e PowerShell com Node como fixture; Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node reais, rename/sync/checksum e **canonicalização real nesta rodada**; Git/Maestri não executados. |

As provas novas cobrem schema/vínculo sem classificar manutenção, fase/rodada/captura preservadas, recusa corrigível de resultado, persistência anterior ao envio, claim único, CAS/428/412/409, resposta incerta e consulta sem replay, ACK tardio/correção na mesma sessão, suspensão alheia preservada, rollback dos três componentes de resposta, SQL busy, reopen, conta/escopo HTTP, comparação editorial/critérios/comentários, preservação dos IDs/textos/digest, TTL 0/1000, espera excluída do limite ativo, cancelamento depois da expiração com parada uncertain, custo 0 configurado distinto de medição ausente, migração real 8→9 e regressões das migrations anteriores.

### Continuidade e limites de prova

- TUI/provider/MCP reais, entrega humana real na sessão Maestri/OMP e parada física no host não foram exercitados. Adapter/extensão/clock/GitHub são controlados; SQLite e HTTP inject são reais. Essas provas não encerram integralmente AC-14/15 ou INT-05/07.
- UI da decisão e apresentação dos tempos/TTL/recibos permanecem na sprint 033, antes da prova real autorizada da sprint 018. O futuro serviço de publicação deve manter o gate de pergunta/suspensão e revalidar autoridade atual; esta sprint não implementa publicação.
- Custo real e seus limites não receberam valores inventados: continuam indisponíveis com pendência RF-61 quando o executor não fornece observação autoritativa. Medição de duração acompanhada não é medição de CPU/faturamento.
- Nenhum Git/GH foi executado; o runtime não disponibiliza o contexto elevado/keyring exigido, e as restrições do usuário foram mantidas. Sem instalação, commit/push, alteração de credenciais/ACL, aprovação ou mudança de fase.

## Sprint 013 - Decisão humana, tempos e limites [CONCLUIDA]
- Pergunta formal e suspensão vinculada: Aceitar execution_question e controlar somente a suspensão pertinente.
- Resposta durável na mesma passagem: Implementar consulta da pergunta e POST de resposta com operação consultável.
- Tempos e limites sem valores fictícios: Disponibilizar medições e expirações pertinentes à tentativa e à pergunta.

## Sprint 014 — Cancelamento, interrupção e nova tentativa [IMPLEMENTADA NO BACKEND]

Data: 2026-10-17. Alterações no repositório canônico; histórico anterior preservado. Nenhuma dependência instalada, comando Git/GH, provider, recrutamento Maestri real, publicação, commit ou push. Exclusões durante a validação atingiram somente diretórios exclusivos de teste identificados dentro de `.cache`; nenhum ambiente real foi apagado. Este registro não concede aprovação, mudança de fase ou Design Lock.

### Fontes, critérios e prova definida

- `AGENTS.md`, `SPEC.md` §7 e §§4/5/8/10, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` §§5–6 e critérios INT; SPEC derivada §3.2/F-03 e stories RF-63–68. Cobertura backend de revogação/limpeza, interrupção, retry e operações delimitadas de recursos; AC-16–18/26 e INT-08/15–17 integrais dependem das provas reais abaixo.
- Antes da edição: revogar transacionalmente antes de efeitos, acompanhar lançamento tardio, impedir autoridade antiga, manter captura/resultados, criar identidade e ambiente novos, confirmar remoção por plano/revisão e provar parada/retenção, nunca aceitar path/PID/comando do cliente.
- Skill Context7 usada com resolução anterior às consultas de Node.js 24 (lstat/realpath/remoção), better-sqlite3 (transações síncronas/IMMEDIATE/rollback) e Git (ls-files/NUL/seleção de tracked/untracked). Versões do lockfile preservadas. Fontes: [Node fs](https://nodejs.org/docs/latest-v24.x/api/fs.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md), [git-ls-files](https://git-scm.com/docs/git-ls-files).
- Provas definidas por superfície: SQLite/Fastify inject reais para operações/CAS/rollback/escopo; filesystem real para exclusão somente de fixture; Git/canonicalização/lançamento/capacidades nativas controlados. GitNexus `list_repos` não contém este repositório; o código atual foi a fonte, sem consultar o grafo do legado.

### Entregáveis e interfaces

| Superfície | Arquivos e contrato |
| --- | --- |
| Contratos | `packages/contracts/src/recovery.ts`, exportado no index: cancelamento, recursos, plano/confirmação de remoção, interação e pasta/capacidades. Schemas fechados; IDs UUID, sem paths/PIDs/comandos de entrada. |
| Rotas | `http/routes/recovery.ts`, composto em `routes/attempts.ts`: cancel, resources, removal-plan/remove, interaction/open e folder/open com proteção HTTP existente. Leituras apresentam capacidade atual; mutações retornam operação durável/Location. |
| Pipeline | `pipeline/recovery.ts`, composto em `start.ts`; tipo público `RecoveryContext`. Cancelamento revoga antes de abortar sinal próprio e agendar parada. Verificação recebe sinal por tentativa. Remoção/abertura confirmam intenção antes do IO e revalidam no efeito. |
| Storage | `storage/recovery.ts`, exportado pela API de storage: `getResources`, `getResourceSnapshot`, `getPassageForAttempt`, `validatePreviousAttempt`, `recoverRecovery`, `acceptRecovery`, `finishRecovery`, tipos `RecoveryCommand/ResourceSnapshot`. SQL privado, transações síncronas; projeções específicas em `operations.ts`. |
| Persistência | Migration `010_recovery.sql`: revisão/removed em resources; `cancellation_requests`, `resource_removals`, `native_open_requests` STRICT, índices e guards de identidade/histórico/estados terminais. Migrations 001–009 intactas; ledger passa a 10. |
| Executor | `execution.ts`/adapter: handles de terminais físicos próprios, parada compartilhada/idempotente, recibo monotônico e diagnóstico STOP_REQUESTED/STOP_UNCONFIRMED; perda de canal fecha coordenação. `ExecutionHost.confirmStoppedTerminal` permite confirmação física somente por capacidade confiável do host, com prazo finito. |
| Workspaces | `workspaces/recovery.ts`: `inspectEnvironment`, `removeEnvironment`, `folderCapability`, `openEnvironment`. Destino fixo por ID, inventário/hash transitórios, conferência de conteúdo/retenção e exclusão sem seguir links. `ControllerHostContext.openFolder` compõe capacidade nativa opcional. |
| Provas e documentação | `tests/integration/recovery.test.ts`, `workspaces/recovery.test.ts`, novas regressões do adapter; helper `tests/fixtures/recovery-schema.ts` e ajustes das expectativas históricas de migration/interrupção. README e este progresso atualizados. |

### Cancelamento, interrupção e retry

POST cancel aceita `{reason?}` e Idempotency-Key, dispensando If-Match para revogar o estado atual. Guarda somente hash/recibo, sem texto do motivo. Confirma revogação, operação, índice e evento na mesma transação antes de abort/stop. Replay idêntico recupera o recibo; conteúdo/escopo divergentes conflitam; outra chave não repete parada já solicitada. `attempt.cancel/succeeded` significa revogação confirmada; 202 continua sendo Cancelamento solicitado, e recursos/cleanup informam parada física separadamente.

O adapter usa somente os terminais próprios registrados, inclusive recruit pendente. Retorno tardio recebe parada; não há segundo recruit. Solicitações concorrentes compartilham o mesmo stop; recibo confirmado não regride por repetição. Ausência de handle vivo após lançamento conhecido mantém uncertain. Recurso planejado que não chegou a lançar pode ser confirmado sem chamar native. Não há busca por executável, PID arbitrário, reset de equipe ou limpeza ao cancelar. Clone tardio registra ownership/estado, conserva os arquivos e não dispara terminal.

Perda relevante do vínculo encerra a tentativa como interrupted, revoga passagens correspondentes e fecha o canal afetado; resultado já aceito permanece consultável. Revisor antigo já concluído não revoga rodada posterior. Restart interrompe trabalho não terminado, marca parada não comprovada como incerta e intenções de remoção/abertura incompletas unknown. Não restaura provider, conversa, tokens ou efeitos por replay. Histórico e recursos não são apagados.

Preparação aceita `previousAttemptId` somente da mesma conta/projeto/issue com tentativa anterior encerrada; storage repete o gate dentro da transação da preparação e do início. Escolhas são revisáveis; issue, base e configuração são observadas novamente. Retry dispensa somente Ready: preserva observação completa, conta, assignee exclusivo, issue aberta, Project/vínculo/campo/opção válidos, dependências, origem/base e ausência de tentativa ativa. Cria UUID/captura/clone/processo novos e não importa alterações/sessão antigas. Residual permanece separado e não impede toda a instalação.

### Remoção e abertura delimitadas

Plano informa perdas, preservações, capacidade/motivo, planHash e ETag. Remover exige `confirmed:true`, plano/revisão atuais, tentativa encerrada, todos os terminais próprios confirmados parados e ausência de lançamento/captura/check pendente ou parada incerta de check. Revalida essas condições antes de cada exclusão. Plano alterado, recurso de outra tentativa/conta, ownership ausente, operação de remoção incerta ou conteúdo sem retenção impedem o efeito.

Verifica ownership do armazenamento Git, todas as refs/commits/trees/bases e integridade dos objetos necessários. Compara bytes/modos do produto atual à última versão retida e recusa inclusões não ignoradas sem retenção. Inventário também percebe mudanças em arquivos ignorados; plano avisa explicitamente sua perda. Sem versão retida suficiente, não exclui ICR/trabalho não exportado. Banco/operation guardam somente hashes, referências e estados; não serializam inventário, checkout, índice, caches ou bytes de arquivos.

Somente `<data>/work/<attemptId>/implementation` pode ser removido por este endpoint; raiz da tentativa, Git retido, checks/revisões e evidências ficam fora do alvo. Canonicalização/identidade são conferidas por segmento. Percurso explícito recusa symlink/junction/arquivo especial, sem force ou remoção recursiva cega. Limites: 100.000 entradas, profundidade 64; comparação de produto até 16 MiB por arquivo/128 MiB agregados. Falha parcial mantém removed=false e operação unknown, sem repetir exclusão automaticamente. Não há bloqueio de filesystem contra mudanças externas.

Abertura usa exclusivamente a sessão ou pasta registrada e existente, com capacidade conferida antes da aceitação e no efeito. Consulta de pasta removida conserva a referência e informa capacidade indisponível com RESOURCE_REMOVED; passagem ausente/estrangeira retorna 404. Contexto sem suporte retorna `409 NATIVE_OPEN_UNAVAILABLE`; não recruta substituto. Recibo significa pedido nativo aceito, sem afirmar janela visível. `openExistingTerminal` e `openFolder` são capacidades da composição confiável, não body/ambiente. `confirmStoppedTerminal` é a capacidade mínima para observar término físico do terminal e escritores próprios conhecidos, limitada a 15 s; sem prova, dismiss permanece uncertain e a remoção é recusada. Não foi acrescentado supervisor geral nem promessa sobre brokers/daemons.

### Validação técnica observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, cliente e testes strict, sem any/supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos/SQL/contratos e convenções existentes. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **511 testes em 35 arquivos**, 35 adicionais sobre os 476 anteriores. Rede/subprocessos/providers reais bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador/declarations, dez migrations, recursos e web. Permanecem avisos anteriores do plugin React/esbuild/optimizeDeps. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock históricos, distribuição com migration 010. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos/socket/UTF-8/EOF e PowerShell com Node como fixture; Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node reais passed/failed, rename/sync/checksum e canonicalização real nesta rodada; Git/Maestri não executados. |

Provas novas: revogação anterior ao stop; If-Match obsoleto aceito para cancel; replay/conflitos/escopo; rollback dos componentes e busy sem efeitos; clone tardio preservado sem terminal; stop concorrente único; canal perdido sem nova autoridade; retry fora de Ready com issue/base atuais, identidade/clone/processo próprios sob adapters controlados e captura antiga intacta; demais gates ainda impeditivos; recibos/reopen e migração SQLite real 9→10; intenções incompletas unknown no restart; plano/CAS/risco/retenção/ownership/limites e capability revalidada; remoção real somente da fixture com preservação de vizinhos, evidência e marcador de retenção; nenhuma repetição de exclusão/abertura e ausência de terminal substituto.

### Limites e continuidade

- Cancelamento real no Maestri durante inicialização e trabalho com filho, nova tentativa com Git/OMP reais, confirmação física e abertura nativa real permanecem sem prova. As capacidades confiáveis foram exercitadas com callbacks controlados; não representam integração pronta do host. Não se declara contenção geral ou zero processos globais. AC-16–18/26 e INT-08/15–17 integrais não são declarados aceitos por fixtures/build.
- A criação de junction na fixture foi recusada com EPERM. A prova de redirecionamento foi feita por canonicalizador controlado sobre diretórios reais; produção mantém realpath/lstat e recusa segura, sem fallback ou alteração de ACL. Git/retenção usados pela remoção são controlados; a exclusão e preservação dos vizinhos/evidências são de filesystem real em `.cache`.
- UI permanece para a sprint consumidora. Publicação ainda não existe: RF-64 recebe aqui a separação de revogação/limpeza; registro de efeitos remotos concluídos após cancelamento deverá usar o journal da futura publicação, sem rollback fictício nem completar novos efeitos automaticamente.
- Runtime sem contexto elevado/keyring exigido: nenhum Git/GH real, login alternativo, alteração de credenciais/ACL ou instalação. Nenhum commit/push, revisão independente da entrega, aceite visual ou aprovação/mudança de fase presumidos.

## Sprint 014 - Cancelamento, interrupção e nova tentativa [CONCLUIDA]
- Revogação e parada acompanhada: Implementar cancelamento idempotente e acompanhamento de lançamentos tardios.
- Perda de acompanhamento e retry explícito: Interromper coordenação antiga e disponibilizar outra tentativa independente.
- Remoção delimitada e abertura nativa: Implementar removal-plan/remove, interação/open e folder/open pelos IDs registrados.

## Sprint 015 — ICR consultável e efeitos de acompanhamento [IMPLEMENTADA NO BACKEND]

Data: 2026-10-17. Continuidade da implementação parcial de publication/queries/journal encontrada no workspace canônico. Foram conferidas as superfícies existentes, completados os bloqueios locais de conclusão/capacidades e acrescentadas regressões e documentação. Histórico anterior preservado. Nenhuma dependência instalada, comando Git/GH, mutação GitHub real, provider, recrutamento, commit ou push executado. Não representa aprovação, mudança de fase ou Design Lock.

### Fontes, critérios e prova definida

- `AGENTS.md`, `SPEC.md` §§4.3–4.4/6/8.2/8.4/10.2; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md` §§1/3/8. SPEC derivada §§2.1/3.2/3.4 e contratos de segurança de §5. Cobertura backend: RF-38–42/69/73/77–79/82–84; AC-09/12/22 e INT-18 recebem provas locais, sem aceite integrado integral.
- Antes da edição: gate atual e versão aprovada antes do comentário, intenção/claim duráveis antes do envio, unknown sem replay, SQL antes do efeito seguinte, confirmação tardia sem restaurar autoridade, páginas vinculadas à conta/tentativa/versão e GET sem efeitos. Validação: SQLite/HTTP inject reais; GitHub/Git/TUI controlados e smokes compilados sem publicação.
- Context7 consultado após resolução de IDs: better-sqlite3 para transações síncronas/IMMEDIATE/rollback e GitHub GraphQL para AddCommentInput, clientMutationId, commentEdge e atualização single-select do Project. Fontes primárias: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md), [Issues](https://docs.github.com/en/graphql/reference/issues), [Projects](https://docs.github.com/en/graphql/reference/projects). Versões do lockfile mantidas. A leitura do arquivo externo da skill e da memória opcional foi bloqueada pela revisão automática; nenhuma foi usada. As instruções Context7 locais do AGENTS e as ferramentas MCP disponíveis foram seguidas diretamente.

### Interfaces e composição

| Superfície | Arquivos e interface pública |
| --- | --- |
| Contratos | `packages/contracts/src/publication.ts` e `queries.ts`, reexportados no index: EffectIdentity/Receipt/View, CompletePublication, ReconcilePublication, PublicationSummary, GitHubMutationResult, AttemptSummary/Page/Detail, DeliveryDetail, queries e páginas/seções tipadas. |
| Publicação | `modules/publication/index.ts`: createPublication, Publication, PublicationDependencies; observeAuthority, observeControllerAccount, projectStage, publishApproved, complete, reconcile e revalidate. Recebe github/workspaces/verification/storage e callbacks de coordenação, sem SQL, GH ou Git internos. |
| Journal e gates | `storage/effects.ts` e `publication.ts`, via `storage/index.ts`: recordEffectIntent/getEffect/claimEffect/finishEffect/getEffects, getPublicationSnapshot/Summary, assertPublicationEligible, recordAuthority/recordControllerAccount, recoverPublication/acceptPublication/finishPublicationRequest/finalizeICR. Transações privadas e síncronas. |
| Persistência | `011_publication_queries.sql`: effects, publication_requests, attempt_authority e controller_authority STRICT, índices por vínculo/estado/ordem, FKs compostas e guards de identidade/estados finais/histórico. Ledger conhecido 11, migrations 001–010 preservadas. |
| GitHub | `github/effects.ts`, exposto somente pelo index: GitHubEffectRequest, GitHubMutationAuthorization e mutateEffect. Queries/mutações estáticas por JSON em stdin, transporte e cooldown existentes compartilhados. |
| Retenção/composição | `workspaces/retention.ts`: verifyRetainedDelivery confere ownership/ref/commit/tree/base/objetos. `main.ts` compõe publication no pipeline e recebe githubMutationAuthorization somente do host confiável. |
| Consultas | `queries/index.ts`: createQueries, Queries.listAttempts/getAttempt/getDelivery. `storage/queries.ts` realiza projeções e paginação em snapshot consistente. Não carrega worktree/diff/logs nem altera autoridade. |
| HTTP | `routes/publication.ts`, `attempts.ts`, `deliveries.ts`: GET /attempts, detalhe por attemptId/deliveryId e POST publication/complete, publication/reconcile e revalidate. Schemas fechados, sessão/Origin/CSRF, ETag e operação/Location existentes. |
| Provas | `tests/integration/publication.test.ts`, `queries.test.ts`, fixtures publication/publication-schema e `github/effects.test.ts`; regressões históricas e expectativas de migration. README registra o contrato atual. |

### Gate, projeções e conclusão ICR

O gate exige entrega corrente capturada, parecer approved/independência válida na mesma tree, resultados oficiais de produção/revisão, writesStopped e verificação vinculada compatível. Exige modo capturado icr, continuidade pertinente, nenhuma pergunta/cancelamento/suspensão impeditiva e ambiente implementation próprio, pronto e preservado. O serviço confere os objetos retidos, acesso ao ambiente e integridade dos artifacts antes do comentário; repete autoridade depois desse IO e antes dos efeitos. Nenhum conteúdo é recapturado para publicação.

Autoridade atual confere conta por ID, issue/repositório abertos/acessíveis, bloqueadores, assignee exclusivo, Project/owner/vínculo/item/campo/opções exatos e configuração compatível com a captura. Conta divergente pausa novos despachos; assignee alterado revoga publicação e solicita cancelamento. Status incompatível gera KANBAN_DIVERGENCE e orientação. Revalidar limpa somente a suspensão que pertence à observação resolvida e preserva impedimentos de outras origens. Não há atribuição, takeover, reconstrução de transições offline ou CAS remoto presumido.

O pipeline projeta In progress na implementação/checks/correção e In review na revisão. Após aprovação, ICR valida a versão e registra resultado/evidências em comentário com marcador exclusivo instalação/tentativa/delivery, hash do corpo e referências a base/tree/review/checks/artifacts. Confirma o resultado local somente com comentário conhecido; Delivered é projeção posterior ao modo concluído. Falha dessa projeção conserva result=delivered e pendência por efeito. Done, corpo e checkboxes não são alterados; não existe commit de entrega/push no percurso ICR.

Cada efeito guarda origem tentativa/criação, operationId próprio, autorização, identidade esperada, estado, revisão e recibo. Intenção/índice/evento e claim precedem o IO; resultado é gravado antes do efeito seguinte. Falha SQL não confirma nem avança. Timeout após envio é unknown; reconciliação de comentário exige leitura completa, marcador único, autor/corpo/hash/alvo exatos. Status é confirmado pela releitura do item/campo/opção. Ausência, duplicidade, conteúdo forjado ou leitura parcial mantêm incerteza, sem novo envio. Falha conhecida pode ser tratada por outra ação autorizada, preservando efeitos já confirmados e o histórico de eventos.

Reconcile consulta fatos conhecidos e persiste recibos, sem nova mutação ou autorização de modo. Complete recupera operação idêntica antes de CAS e só trata pendências autorizadas depois do gate/reconciliação. Falha de comentário/Status preserva parecer, versão, diff, evidências e ambiente; não lança Implementador nem rearma consumo. Confirmação remota que chega após cancelamento continua registrada e não autoriza os próximos efeitos. Restart marca envios incompletos unknown e interrompe continuidade; concluir snapshot aprovado exige ação explícita e parada comprovada dos recursos antigos, sem restaurar sessão de agente.

### Consultas leves por identidade

Listagem filtra projectId/result, ordena por criação/UUID e usa teto observado para impedir inclusão de novos cadastros na continuação. Detalhes têm seções independentes rounds/passages/criteria/checks/reviews/findings/questions/effects/resources, limite padrão 25/máximo 100. Cursor vincula instalação/conta, tentativa, seleção, seção, filtro e ordem; outra seleção invalida a continuação. Versão rejeitada continua com seu parecer/critérios, mesmo quando a tentativa avança; resoluções conservam a versão/revisão que as produziu. Rodada planejada é consultável antes da primeira captura.

Fase, suspensão, resultado final, revisão por versão, publicação por efeito, parada, limpeza, medições/limites e capacidades permanecem campos distintos. Perguntas retornam metadados/recibos; conteúdo e resposta são carregados no endpoint específico. Resumos contam efeitos em SQL e avaliam elegibilidade com projeções escalares, sem deserializar captura ou documentos de identidade dos efeitos. A capacidade de concluir recusa efeitos unknown/running, recursos não reconciliados ou ambiente removido, e informa MODE_COMPLETED quando já não há pendência; disponibilidade ainda exige gate atual no POST. Nenhum GET altera autoridade ou produz IO Git/GitHub. Diff/artifacts continuam sob demanda pelas rotas próprias.

### Validação técnica observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, cliente/testes strict, sem any/supressões. |
| `npm.cmd run lint` | Exit 0; limites de módulos/SQL/contratos e convenções existentes. |
| Testes focados publication/queries | Exit 0; **47 testes em 2 arquivos**. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **567 testes em 38 arquivos**; sem rede/subprocessos/providers reais. |
| `npm.cmd run build` | Exit 0; controlador/declarations, migrations, recursos e web. Avisos anteriores React/esbuild/optimizeDeps permanecem. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência/shutdown/lock reais, distribuição atual. |
| `npm.cmd run test:execution-compiled` | Exit 0; recursos/socket/UTF-8/EOF e PowerShell com Node como fixture; Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node reais, artifacts/sync/rename/checksum e canonicalização real; Git/Maestri não executados. |

Provas cobrem conclusão por versão aprovada; estágios/correção; conta/responsável/Status/vínculos divergentes; preservação de suspensão alheia; retomada de continuação ainda não despachada; gates de integridade/ambiente; unknown/recibo/marcador exato/ausente/forjado/duplicado/parcial; CAS/replay/HTTP protegido; cancelamento com confirmação tardia; rollback/busy antes e depois do envio sem próximo efeito; consulta/reopen; migração SQLite real 10→11 preservando aprovação/ref/recibo/identidade sem inventar efeitos; seções/cursors/seleção histórica; e ambiente removido/recursos não reconciliados/capacidades. Cache de 16 MiB na fixture não altera payload dos resumos nem tamanho de banco/WAL; Git retido continua controlado nessa medição.

### Limites e continuidade

- Mutações reais requerem GitHubMutationAuthorization do host com conta/repositórios/Projects conhecidos e contexto autorizado com keyring. Não vêm de HTTP/ambiente. Sem autorização, o adapter recusa antes do IO; nenhuma foi concedida ou exercitada nesta sprint. Git/GH reais não foram executados, pois este runtime não fornece o contexto elevado exigido e a sessão proíbe mutações Git.
- Retenção/materialização Git, GitHub/Status/comentário e TUI são controlados nas provas de ICR. SQLite/HTTP inject/reopen são reais. Smokes provam somente suas superfícies declaradas. AC-09/12/22 e INT-18 integrais, comentário/Status em alvo real e revisão independente da entrega continuam pendentes do percurso autorizado; não são declarados aceitos por fixtures/build.
- Modos Commit/PR, aumento de modo, fila automática e UI de detalhe permanecem nas sprints consumidoras. O journal aceita origem creation mediante operação durável existente; não fabrica scaffold. Nenhum requisito de harness, engine distribuída ou armazenamento de arquivos do projeto foi acrescentado.
- Durante a rodada, arquivos de fila fora desta sprint foram alterados por trabalho concorrente no workspace. Houve falhas transitórias de import e nullability nessa área; após as correções concorrentes, a rodada final acima passou. As alterações de fila foram preservadas e não são declaradas entregáveis desta sprint.

## Sprint 015 - ICR consultável e efeitos de acompanhamento [IMPLEMENTADA NO BACKEND]

- Gate atual e journal de efeitos: versão/autoridade revalidadas, intenção/claim/recibo duráveis e estado incerto reconciliável.
- Conclusão ICR e projeções: comentário identificado da versão aprovada, fases do quadro e falhas preservadas sem nova implementação.
- Consultas leves e detalhe por versão: listagem e seções paginadas, identidade histórica, capacidades e evidências sob demanda.

## Sprint 015 - ICR consultável e efeitos de acompanhamento [CONCLUIDA]
- Gate atual e journal de efeitos: Disponibilizar publication e efeitos duráveis para conclusão ICR e projeção de etapas.
- Conclusão ICR e projeções reconciliáveis: Concluir ICR sem commit de entrega e registrar acompanhamento GitHub autorizado.
- Consultas leves e detalhe por versão: Implementar GET /attempts, detalhe da tentativa e GET /deliveries/:deliveryId.

## Sprint 016 — Preparação e início manual pela interface [IMPLEMENTADA]

Data: 2026-10-17. Implementação da preparação e do início manual na Principal, usando contratos e rotas existentes. Nenhuma dependência foi instalada, teste automatizado ou validação visual de navegador foi executado, e nenhum efeito GitHub/Maestri/OMP foi iniciado. Não representa aprovação ou mudança de fase.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§5.1, 8 e 10.2, SPEC derivada §§3.2/4.2–4.6, critérios recebidos US-06/15, F-02, RF-20/23/28/67 e artefato visual `docs/Docs20261016_073031/design/artifact.html`.
- O fluxo permanece na Principal e no diálogo aprovado, com fundo claro, navegação grafite, acento laranja, cartões e responsividade existentes. O `attempt-detail` usa o modal compartilhado, sem criar uma nova tela.

### Entregáveis e comportamento

| Superfície | Arquivos e interface |
| --- | --- |
| Preparação | `apps/web/src/features/preparations/PreparationDialog.tsx`: consulta configuração/issues reais; cria e edita preparação, seleciona modo/orientação/base/correções/perfis; mostra issue/responsáveis, critérios, configuração, limites, origens, efeitos e pré-requisitos. Nova tentativa envia `previousAttemptId` e informa uso de issue/base atuais sem importar sessão ou alterações. |
| Autosave e autorização | Uma gravação PUT em voo agrega edições posteriores e Iniciar aguarda o loop serial de confirmação. ETag 412 conserva o rascunho e mostra leitura atual separada. Mudança invalida o hash autorizado; `SUMMARY_CHANGED` consulta o resumo atual antes de nova autorização. Revisão numérica não é instrução ao operador. |
| Início e recuperação | `operationId`/Idempotency-Key são gerados antes do POST. Timeout mantém a identidade e consulta GET `/operations/:operationId`, sem reenviar. `sessionStorage` conserva somente operação, tipo e timestamp; payload permanece em memória. Ao recarregar/fechar com operação incerta, a Principal reabre a consulta. Conflito `ATTEMPT_ACTIVE` oferece o detalhe da tentativa existente. |
| Histórico e detalhe | `AttemptListPanel.tsx` consulta GET `/attempts`; `AttemptDetailDialog.tsx` consulta o detalhe real e permite preparar retry somente para tentativas encerradas com resultado. Entrada pela Principal e catálogo abre preparação no modal existente. |
| Contratos e suporte | `api/http.ts` preserva `resource`, `operationId` e `facts` do envelope de erro para resolver conflitos. Commit e Pull request continuam visíveis, mas início fica bloqueado enquanto essas modalidades não têm suporte completo nesta versão. |
| Ajustes para compilação | `packages/contracts/src/queries.ts` corrige a construção do schema de `expectedAccountId`; `storage/errors.ts` declara `ATTEMPT_DATA_INVALID`; `pipeline/start.ts` renomeia a variável da preparação criada para não colidir com a observação da fila. Este último ajuste foi necessário após o typecheck apontar erro no arquivo existente. |

### Validação observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do workspace. |
| `npm.cmd run lint` | Exit 0; limites de módulos e convenções TypeScript. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web. Avisos existentes de depreciação do plugin React/esbuild e `optimizeDeps` permanecem. |

Não foram executados testes automatizados nem Playwright/Chrome. Portanto, typecheck/lint/build não comprovam foco/teclado/contraste renderizados, comportamento HTTP real, autosave em concorrência real ou aceitação visual. Nenhum aceite integral AC/INT, aprovação ou mudança de fase é declarado.

## Sprint 017 — Fila e divergência na Principal [IMPLEMENTADA COM ACEITES PENDENTES]

Data: 2026-10-17. A fatia conecta a Principal a leituras HTTP da fila, gravação de pausa/habilitação, observação de autoridade e consumo automático pelo pipeline. Sem instalação de dependências, comandos Git/GH, publicação, execução Maestri/OMP ou efeito remoto nesta rodada.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§4/5/8/10, `GLOSSARY.md`, SPEC derivada §§3.2 e 4.3–4.7; US-07–09, F-04, RF-30–40 e AC-19–22/27. O contrato visual foi lido em `docs/Docs20261016_073031/design/artifact.html`; a Principal mantém a composição/shell e os componentes `app-shell` e `attempt-detail`.
- A implementação usa consultas e contratos reais do repositório. Resposta parcial, conta/host divergentes e motivos de elegibilidade continuam distintos de uma fila vazia. Nenhum fixture é considerado prova GitHub/Maestri real.

### Entregáveis e comportamento

| Superfície | Arquivos/interface |
| --- | --- |
| Contratos e API | `packages/contracts/src/queue.ts`; `GET/PUT /api/v1/queue` em `http/routes/queue.ts`; leitura de Projects/Issues em `modules/projects/queue.ts`. A observação inclui candidatos, elegibilidade/motivos, responsabilidade, Status, ordem, consumo, página/total, modos, conta, host, completude, validade, diagnóstico, ETag e hash do resumo. Cursor se vincula ao resumo observado; total não é derivado só da página visível. |
| Consumo automático | `pipeline/start.ts` revalida a leitura completa, cria preparação pela configuração do projeto e usa o fluxo `startAttempt` existente. A migration `012_queue_cycles.sql` registra ciclos por conta/projeto/issue; saída de Ready e retorno elegível rearmam ciclo, e a criação de tentativa consome o ciclo na mesma transação SQLite. Pause bloqueia novos inícios e conserva tentativa ativa/histórico. |
| Principal e diálogos | `apps/web/src/features/queue/QueuePanel.tsx`, `useQueue.ts`, `QueueEnableDialog.tsx` e `QueueAuthorityDialog.tsx`, integrados em `PrincipalScreen.tsx`/`AppShell.tsx`. Estados de leitura degradada/erro não viram vazio. Habilitação apresenta resumo e exige confirmação; `QUEUE_SUMMARY_CHANGED` atualiza o resumo no mesmo diálogo. Pause depende de ETag e recibo. Autoridade mostra IDs esperados/observados, assignees/Status atuais e as orientações GitHub; Revalidar e Cancelar usam operações existentes. |
| Regressões | `queue-cycles.test.ts`; consultas HTTP de fila e pausa, Projects/Issues, múltiplos assignees, draft/PR e paginação em `tests/integration/projects.test.ts`; `attempt-transactions.test.ts` verifica que tentativa ativa e rate limit não despacham candidato; fixtures de migração histórica removem a migration 012 ao reconstruírem versões antigas. |

### Validação local

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Reexecutado após o feedback do evaluator; exit 0, strict TypeScript do workspace, incluindo `QuestionSummary`. |
| `npm.cmd run lint` | Reexecutado; exit 0, limites de módulos e convenções TypeScript. |
| `npm.cmd test -- --reporter=dot` | Reexecutado; exit 0; **575 testes em 39 arquivos**. Inclui consumo automático único, rearmamento, projeção/paginação, pausa, fixtures e migrations. |
| `npm.cmd run build` | Reexecutado; exit 0, controlador, recursos e bundle web. Permanecem avisos de depreciação do React/esbuild e `optimizeDeps`, além do aviso de chunk acima de 500 kB. |
| `npm.cmd run test:compiled` | Reexecutado; exit 0; HTTP/SSE/SQLite, CAS/idempotência, shutdown/lock e diagnóstico de contexto. Não chama GitHub real ou Maestri/OMP. |

Os resultados acima registram a validação técnica desta rodada. A suíte continua isolada de providers e efeitos remotos; seus resultados não substituem a prova real autorizada.

### Limites de aceite e continuidade

- Não foi feita prova integrada real de consumo/revalidação/restart em GitHub/Maestri/OMP. A instrução desta sprint limita mutações aos alvos expressamente autorizados para a prova, mas nenhum projeto/conta/host alvo foi identificado; cenários reais AC-19–22 permanecem pendentes até esse alvo ser indicado. Os 575 testes locais não substituem essa evidência.
- Não houve aceite visual Playwright/Chrome: a sessão não expõe navegador e o `package.json` não tem script `dev` para servir a tela neste workspace. Foco, responsividade renderizada e contraste permanecem sem inspeção visual.
- A Principal oferece habilitação/pausa em escopo **account**. O endpoint aceita também escopo project para exatamente um projeto e grava `automationEnabled` na revisão desse projeto; a UI ainda não oferece seleção de escopo project. Valores de prioridade não são consultados por ID: a observação apresenta fallback por posição/número/ID e diagnóstico quando há campo de prioridade configurado.
- A prova real e o aceite visual permanecem pendentes. Nenhuma mutação externa, commit/push, instalação, aprovação ou mudança de fase foi feita.

## Sprint 016 - Preparação e início manual pela interface [CONCLUIDA]
- Preparação com escolhas efetivas: Disponibilizar preparação e Nova tentativa nos diálogos existentes.
- Autosave e autorização do resumo atual: Vincular Iniciar à última revisão confirmada.
- Início consultável sem duplicação: Apresentar os estados reais do comando de início.

## Sprint — Histórico paginado e detalhe da tentativa [IMPLEMENTADA]

Data: 2026-10-17. Implementação da consulta histórica e da inspeção por rodada/versão nas superfícies Principal e `attempt-detail`. Nenhum comando Git/GH, provider, efeito Maestri/OMP, publicação, commit ou push foi executado. Não representa aprovação nem mudança de fase.

### Fontes e cobertura

- `AGENTS.md`; `SPEC.md` §§8 e 10.2; `GLOSSARY.md`; `INTEGRACAO-MAESTRI-OMP.md`; SPEC derivada §§3.2/4.2–4.6; US-11/12/19, RF-82–84/86/87 e F-05.
- `docs/Docs20261016_073031/design/artifact.html`: IDs oficiais `principal`, `app-shell` e `attempt-detail`. Mantidos modal/shell, fundo claro, acento laranja, navegação grafite, contêineres e breakpoints existentes.
- Consultas leves de `GET /attempts`, `GET /attempts/:attemptId`, seções paginadas, `GET /deliveries/:deliveryId`, `/diff` e `/artifacts/:artifactId`; sem mudança de contratos/API ou novas dependências.

### Arquivos e comportamento

| Superfície | Implementação |
| --- | --- |
| Histórico | `apps/web/src/features/attempts/AttemptListPanel.tsx`: paginação por cursor sem acumular todo o histórico, filtros suportados de projeto/resultado, estados separados, retry mantendo a página atual e abertura por `attemptId` + `projectId`. |
| Leitura de tentativa/versão | `features/attempts/useAttempt.ts` e `useDelivery.ts`: consultas abortáveis e identificadas; detalhe selecionado não segue a tentativa ativa. A seleção de rodada/versão fica em `roundId`/`deliveryId` na URL. |
| Detalhe | `features/attempts/AttemptDetailDialog.tsx`: eixos separados para etapa/resultado/suspensão, publicação, limpeza, tempos/limites/TTL; nove seções carregadas sob demanda com continuação independente; estados distintos para versão não capturada, revisão ausente e revisão sem achados. `useAttempt.ts` atualiza o mesmo ID a cada 15 s sem remontar o diálogo nem mover foco/scroll. |
| Versão e evidência | Diff é buscado somente por ação e exibido em `<pre>` escapado pelo React. Logs são lidos sob demanda como texto; ausência/integridade inválida têm mensagens próprias. Avisos da captura mostram somente caminho e motivo, sem bytes. |
| Navegação e estilo | `PrincipalScreen.tsx`, `AppShell.tsx` e `app/hash-route.ts` preservam projeto/tentativa/rodada/versão na URL e no diálogo existente; `app/styles/artifact.css` amplia a composição responsiva e estados de lista/detalhe. `api/http.ts` acrescenta leitura autenticada de texto para evidências. |
| Compatibilidade | `apps/controller/src/modules/pipeline/start.ts` passa o `accountId` observado à leitura/identidade de ciclos da fila e tipa o vínculo completo, correção necessária para o typecheck atual. |

### Validação observada e limites

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do workspace, após a extração dos hooks. |
| `npm.cmd run lint` | Exit 0; limites de módulos e convenções TypeScript. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web. Avisos existentes do plugin React/esbuild e opções Vite permanecem. |

Não foram executados testes automatizados nem Playwright/Chrome. O build não comprova a interação HTTP em browser, navegação por teclado/foco, contraste renderizado ou aceite visual. Consultas e evidências foram ligadas pelo código e compilação; AC/INT integrais e integração real permanecem fora desta prova. Nenhuma ação de recuperação/decisão humana foi antecipada; essas superfícies continuam para as sprints 033/034. Nenhuma fase ou Design Lock foi simulada.

## Sprint 017 - Histórico paginado e detalhe da tentativa [CONCLUIDA]
- Listagem paginada do histórico na aba Tentativas: Conectar a lista de tentativas às consultas existentes e à abertura do detalhe por identidade na URL.
- Detalhe por rodada e versão: Implementar AttemptDetailDialog e inspeção sob demanda.

## Sprint — Decisão humana e resposta na mesma passagem [IMPLEMENTADA]

Data: 2026-10-17. Conexão da leitura e resposta de perguntas formais no detalhe existente da tentativa. Nenhuma dependência foi instalada ou ação Git/GH, provider, recrutamento Maestri/OMP ou publicação foi executada.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §§5.3–5.5/8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` INT-07 e SPEC derivada §§3.2/4.3/4.5–4.6, RF-29/58–62, AC-14/15 e US-13.
- Leitura obrigatória de `docs/Docs20261016_073031/design/artifact.html`: IDs existentes `principal`, `app-shell` e `attempt-detail`; mantidos o modal compartilhado, fundo claro, grafite, acento laranja, cartões e breakpoints.
- Reutilizados `GET /attempts/:attemptId/questions/:questionId`, `POST .../answer`, `GET /operations/:operationId`, schemas existentes e `requestJsonWithMetadata`; nenhuma alteração de backend/contrato/dependência.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Perguntas no detalhe | `features/attempts/QuestionDecisionCard.tsx` carrega cada pergunta consultável pela seção existente, apresenta decisão, contexto, alternativas, IDs/textos dos critérios capturados e atuais, motivos da divergência e escolhas de escopo. Manter usa `keep_captured`; adotar atuais informa atualização da issue e preparação de nova tentativa, sem substituir a captura. |
| Resposta e recibo | `features/attempts/useDecision.ts` mantém o rascunho em estado React por ID da pergunta, envia uma vez com ETag e Idempotency-Key, consulta questão/operação por GET e não repete POST automaticamente. Erro/estado concorrente preserva e mostra o rascunho como não enviado. Estado persistido e rascunho local aparecem separados. |
| Estados e tempo | UI distingue pendente, resposta gravada, envio, entregue, entrega incerta, expirada e cancelada. Espera observada, TTL, resposta gravada e expiração são exibidos em campos separados. Apenas `delivered` com recibo é apresentado como resolução da suspensão. |
| Composição visual | `AttemptDetailDialog.tsx` encaminha os itens da seção questions ao cartão; `app/styles/artifact.css` acrescenta comparação responsiva e formulário/feedback acessíveis dentro dos tokens existentes. |

### Validação observada e limites

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do workspace. |
| `npm.cmd run lint` | Exit 0; limites de módulos e convenções TypeScript. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web. Persistem avisos do plugin React/esbuild, opção Vite depreciada e chunk web acima de 500 kB minificado. |

Testes automatizados e Playwright/Chrome não foram executados. A compilação não comprova foco/teclado/contraste renderizados nem execução integrada na TUI Maestri/OMP. AC-14/15 e INT-07 integrais continuam sem prova real nesta rodada; nenhuma resposta externa foi enviada. Nenhuma aprovação, Design Lock ou mudança de fase foi simulada.

## Sprint 018 - Decisão humana e resposta na mesma passagem [CONCLUIDA]
- Decisão e resposta com recibo: Conectar os estados de pergunta e resposta aos dados reais.

## Sprint — Recuperação e ações nativas da tentativa [IMPLEMENTADA]

Data: 2026-10-17. Conectadas as ações de recuperação no `attempt-detail`, preservando o shell e o diálogo aprovados. Nenhuma dependência, ação Git/GH, provider, recrutamento, publicação, commit ou push foi executado. Esta entrega não representa aprovação ou mudança de fase.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §§7–8 e 10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`; SPEC derivada §§3.2/F-03, 4.3/4.5–4.6 e 5; US-10/14/15/19, AC-16–18/26.
- Leitura de `docs/Docs20261016_073031/design/artifact.html`: IDs `principal`, `app-shell` e `attempt-detail`. Mantidos modal existente, cartões, tokens, shell grafite, acento laranja e breakpoints. As skills de design nomeadas pelo pedido não estavam carregadas nem disponíveis em `.agents/skills`; não foram substituídas por protótipo.
- Consumidos os contratos e rotas existentes de cancelamento, recursos, retry de captura, plano/remoção, interação e abertura de pasta/terminal, além de consulta de operações. Sem alterações backend ou dependências.

### Arquivos e comportamento

| Arquivo | Implementação |
| --- | --- |
| `apps/web/src/features/attempts/useAttemptActions.ts` | Hook `useAttemptActions`: atualiza recursos e capacidades a cada 10 s enquanto o diálogo está aberto; consulta planos/superfícies por IDs registrados; envia uma operação com Idempotency-Key e consulta `GET /operations/:operationId`, sem replay de POST após incerteza. Clipboard informa sucesso somente após `writeText` resolver. |
| `apps/web/src/features/attempts/useAttempt.ts` | Retorna ETag da tentativa para o retry de captura, junto da projeção atualizada. |
| `apps/web/src/features/attempts/AttemptDetailDialog.tsx` | Cancelamento expõe pedido aceito, estado da operação, parada física comprovada e limpeza/parada incerta separadamente; fechar o modal não envia cancelamento. Retry aparece somente com falha elegível, resultado `writesStopped`, passagem/versão correspondentes e gates observáveis atuais. Nova tentativa reusa o formulário existente. Planos exibem perdas/preservações e confirmação ligada ao `planHash` atual. Aberturas nativas exigem capacidade disponível; copiar referência/local é ação separada. |
| `apps/web/src/app/styles/artifact.css` | Estados e recursos responsivos, feedback de risco e controles de ação dentro da composição aprovada. |

### Validação e limites

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do workspace. |
| `npm.cmd run lint` | Exit 0; limites de módulos e convenções TypeScript. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web. Permanecem avisos configurados de depreciação Vite/plugin React e chunk acima de 500 kB. |

Não foram executados testes automatizados nem Playwright/Chrome. Typecheck, lint e build não comprovam parada física, execução nativa do host, comportamento no navegador, clipboard em browser, teclado/foco, responsividade renderizada ou contraste observado. Integração real Maestri/OMP e aceites AC/INT integrais permanecem sem prova. Nenhuma aprovação, Design Lock ou fase foi simulada.

### Complemento de validação

- Nesta rodada, `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` foram executados. A primeira tentativa de typecheck/build encontrou um erro no tipo de `engineeringSummary` em `apps/controller/src/modules/projects/scaffold-resources.ts`: `ScaffoldEngineering` era importado como tipo, embora fosse schema em runtime e usado como tipo diretamente.
- A correção importa o schema e deriva o retorno por `Static<typeof ScaffoldEngineering>`, mantendo o contrato como fonte de verdade. Após a correção, typecheck e lint concluíram com exit 0; build concluiu com exit 0 e bundle web. Permanecem avisos de depreciação do plugin React/esbuild e `optimizeDeps`, além do chunk acima de 500 kB.
- `useAttemptActions` também invalida respostas de refresh sobrepostas ou iniciadas antes da troca/fechamento do diálogo. Assim, uma consulta antiga não substitui capacidades mais recentes enquanto o detalhe permanece aberto.
- A validação não incluiu testes automatizados nem browser. As skills de design citadas no pedido não estavam disponíveis para carregamento nesta sessão; a implementação existente foi conferida contra `design/artifact.html` e seus tokens/IDs aprovados, sem alterar a composição.

## Sprint 019 - Recuperação e ações nativas da tentativa [CONCLUIDA]
- Parada e ações nativas por capacidade: Conectar Cancelar, Repetir captura, Nova tentativa, Remover ambiente, Abrir terminal e Abrir pasta.

## Sprint — Plano de scaffold e criação somente local [IMPLEMENTADA NO BACKEND]

Data: 2026-10-17. Implementação no repositório canônico, preservando alterações concorrentes e o histórico acima. Sem dependências novas, comandos Git/GH reais, setup neste workspace, provider, agente, remoto, publicação, commit ou push executados. As operações Git do produto foram implementadas somente para um novo destino autorizado e exercitadas com Git controlado.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §3.2 integral e §§8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`; SPEC derivada §3.2, contratos scaffold options/plans/creations e tabela `project_creations`. Cobertura backend RF-05–08/11/12; AC-02/05 somente nas superfícies locais descritas, sem declarar as três modalidades ou início integrado aceitos.
- Referência `.agents/skills/setup-matt-pocock-skills/SKILL.md`, recursos tracker GitHub/domain/triage-labels e referências locais domain-modeling/triage; skill writing-for-agents para os apontadores gerados. Aplicadas as adaptações normativas: sempre AGENTS.md, formulário/plano e confirmação única, nenhuma instalação de skills ou criação implícita de labels. Setup não executado.
- Context7: resolução e consultas atuais para Node 24 (criação exclusiva, lstat/realpath e arquivos wx), Git (init/branch/hooks/baseline), better-sqlite3 (transações síncronas/IMMEDIATE/rollback) e Fastify (schemas/type provider e shutdown). Mantidas as versões fixadas do projeto.
- Provas definidas antes da implementação: plano sem efeitos; digest e revalidação; intenção/etapas anteriores ao IO; CAS/idempotência/concorrência; preservação de parcial; cadastro/configuração no mesmo branch; migração sem reseed e recursos distribuídos.

### Entregáveis e comportamento

| Superfície | Arquivos/interface |
| --- | --- |
| Contratos | `packages/contracts/src/scaffold.ts`, reexportado no index: CreationMode, ScaffoldInput/Plan/Planned/Options, CreateScaffold, ProjectCreation e CreationView; schemas fechados. |
| Recursos | `resources/templates/catalog.v1.json` e `engineering/{issue-tracker,domain,triage-labels}.md`; loader/renderização em `projects/scaffold-resources.ts`. Identidade/digests incluem os recursos de engenharia; metadados usam tamanho UTF-8 e SHA-256. Build distribui por `scripts/copy-resources.mjs`. |
| Serviço/rotas | `projects.createScaffold({storage,github,workspaces,logFailure})`, `projects/scaffold.ts`, `http/routes/scaffold.ts`; GET options, POST plans, POST creations e GET creations/:creationId compostos no app/main. Sessão/Origin/CSRF, Idempotency-Key, OperationAccepted/Location, erros sanitizados e ETag existentes. |
| Filesystem/Git | `workspaces/scaffold.ts`, via interface pública: scaffoldCapability, inspectScaffoldDestination e createLocalScaffold. Destino exclusivo sob raiz configurada, ancestrais/segmentos canônicos sem links, identidade revalidada, arquivos wx/sync, Git e baseline convencional no branch escolhido, SHA/ref/parent/estado limpo conferidos. Git recebe argv/cwd explícitos, sem shell, hooks/templates vazios e configuração global/sistema isolada nesta operação. |
| Persistência | `storage/creations.ts`, API pública de storage e projeção em operations; migration nova `013_scaffold.sql`, sem editar migrations anteriores. `project_creations` e `creation_steps` STRICT, vínculos/índices/guards. Intenção/recibo/evento atômicos; etapas anteriores/posteriores ao IO; cadastro e conclusão na mesma transação. |
| Provas | `tests/integration/scaffold.test.ts`, ajustes das expectativas de schema e helper histórico `publication-schema.ts`. README registra contratos, limites e uso. |

O plano não grava banco, não cria pasta e não chama Git. Inclui destino canônico/identidade do pai, template/digest, metadados dos arquivos, engenharia, conta observada, modalidade/branch e efeitos. Antes da intenção e novamente antes dos arquivos, o serviço refaz o plano; divergência inicial recusa sem escrita no destino. Templates ausentes/inválidos, recursos obrigatórios ausentes, paths proibidos, destino existente e redirecionamentos são recusados.

AGENTS.md conserva texto, seções e apontadores existentes sem duplicar Agent skills ou suas subseções. CLAUDE.md do template é preservado. Triagem é configuração explícita para quando a skill já estiver disponível no ambiente dos agentes; gera vocabulário e apontador somente quando habilitada. A distribuição contém configuração, nunca código de skills. Exemplos versionáveis são conservados; credenciais conhecidas e arquivos gerados são ignorados. Não há criação de labels, repositório remoto ou Project.

POST retorna criação/recibo duráveis antes de aguardar Git. Directory/files/git/baseline registram intenção e confirmação; etapas futuras aparecem not_started. Baseline usa `chore: initialize project` e identidade técnica Factory. Cadastro começa com a mesma baseBranch, origem local, remoto/Project/perfis ausentes e automação desligada; continua configurável, sem iniciar issue/agente. Leituras retornam pasta/baseline/branch/projectId e pré-requisitos reais, sem ler conteúdo do projeto.

Falha parcial preserva arquivos e confirmações anteriores; resultado incerto não é sucesso. Replay idêntico, inclusive concorrente, recupera recibo sem novo lançamento; chave divergente conflita. Reinício revoga continuidade da criação incompleta, sem replay. Oito criações simultâneas por processo; subprocessos mantêm os limites Git existentes. Não há exclusão, adoção de destino ou rollback destrutivo. SQLite guarda somente plano por metadados, refs/hashes e estado; efeitos locais usam creation_steps, sem ampliar os tipos do journal remoto nesta sprint.

### Validação e limites

- Typecheck, lint e build passaram; resultados finais da suíte e da distribuição são registrados no complemento abaixo.
- Testes novos usam SQLite/filesystem/HTTP inject reais com Git e resolução canônica controlados; cobrem plano determinístico sem IO de escrita, paths/branch/conta/template/configuração alterados, schema/segurança HTTP, intenção anterior ao efeito, deduplicação concorrente, falhas de evento/baseline/cadastro, histórico/guards, interrupção e migração SQLite real 12→13 preservando identidade/settings/recibo.
- Não houve execução Git real ou acesso ao keyring: o runtime não oferece o contexto elevado exigido e o usuário proíbe mutações Git nesta sessão. Não houve login, alteração de credencial/ACL ou contorno. Baseline/refs reais, junction real e percurso no host autorizado permanecem sem prova; fixtures não concedem aceite integral AC-02/05. Nenhuma UI foi modificada ou validada nesta fatia.
- A revisão automática bloqueou a leitura opcional da memória privada externa como fora do escopo autorizado. Essa memória não foi usada; fontes locais sustentaram a implementação. Alterações concorrentes de UI/progresso foram preservadas. Nenhuma aprovação, mudança de fase ou Design Lock foi simulado.

### Complemento de validação final desta fatia

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na rodada final, incluindo arquivos concorrentes novos. |
| `npm.cmd run lint` | Exit 0; limites de módulos e convenções TypeScript. |
| `npm.cmd test -- tests/integration/scaffold.test.ts --reporter=dot` | Exit 0; 27 testes focados. |
| `npm.cmd test -- --reporter=dot` | Exit 0; 635 testes em 42 arquivos na rodada final, incluindo testes de aceitação controlados acrescentados concorrentemente. |
| `npm.cmd run build` | Exit 0; controlador, migration 013, recursos de templates/engenharia e web distribuídos. Permanecem avisos existentes de React/esbuild, optimizeDeps e chunk web acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/shutdown/lock históricos e consulta HTTP real do catálogo distribuído com cwd distinto da instalação, sem Git/GH/providers. |
| Integridade da distribuição | Catálogo e os três documentos de engenharia comparados byte a byte entre fonte e dist: todos iguais. |

O typecheck detectou durante trabalho concorrente uma nulidade em `scripts/first-slice-evidence.mjs`; a correção local captura os limites temporais em constantes antes do callback, sem mudar o contrato. As fixtures históricas foram atualizadas para esperar schema 13 e remover as tabelas novas somente ao reconstruir bancos temporários antigos. O smoke ganhou uma leitura protegida de scaffold/options. Esses ajustes e os testes locais não comprovam baseline por Git real, contexto/keyring ou aceite integrado AC-02/05; as restrições e pendências acima permanecem.

## Sprint-018 do plano — Prova integrada da primeira fatia [PREPARADA; ACEITE REAL PENDENTE]

Data: 2026-10-17. Esta seção usa o ID do plano aprovado, distinto da numeração histórica da sprint de UI de decisão. Repositório canônico; histórico e alterações concorrentes preservados. Nenhuma dependência instalada, Git/GH, provider, recrutamento Maestri/OMP, publicação ou parada/restart real executados. Nenhuma UI alterada.

### Fontes e validação definida

- `AGENTS.md`, `SPEC.md` §§5–8/10.2–10.3, `INTEGRACAO-MAESTRI-OMP.md` integral, `GLOSSARY.md`, SPEC/plano/validação derivados em `docs/Docs20261016_073031`. Pré-requisitos do marco: sprint-017 (histórico), sprint-033 (decisão), sprint-034 (recuperação). Não confundir presença de código com aceite visual.
- Cobertura planejada: AC-01/05–09/13–18/20/23–26, INT-01–10/12–18, incluindo inspeção UI INT-11. S1–S4 recebem testes contratuais e roteiro de evidência real. Capturas oficiais de contratos/versões por tentativa são distintas das versões globais da prova.
- Antes da edição: validar consistência/integridade dos anexos sem autorizar efeitos, atravessar serviços/SQLite sob adapters controlados e executar smokes compilados pertinentes. Roteiro real exige alvo/perfil/custo/efeitos prévios e observação direta; indisponibilidade mantém pendência.
- Skill Context7 aplicada para APIs de filesystem/hashing Node 24. Nenhuma dependência ou contrato de produto novo.

### Entregáveis

| Arquivo/superfície | Resultado |
| --- | --- |
| `docs/integration/first-slice/README.md` | Pré-voo e roteiro de dez cenários: cadastro→ICR, correção, TUI/MCP, transporte, pergunta, resposta incerta, cancelamento na inicialização/com filho, restart/retry e UI. Matriz de AC/INT em `scenarioRequirements` do verificador; S1–S4 mapeados no roteiro. |
| `docs/integration/first-slice/20261017-01/{manifest.json,report.md}` | Identidade da preparação, Node observado 24.22.0, demais versões não presumidas, cenários pendentes, bloqueios concretos e resultados atuais sanitizados. Não contém captura de checkout, DB, índice, cache, transcript ou credenciais. |
| `scripts/first-slice-evidence.mjs` | Verificador offline com schema fechado, IDs/tipos/tempos/autorizações/versões/pré-requisitos/correlação e tamanho/SHA-256 dos anexos. IO limitado a arquivos relativos sem links/escape, erros sanitizados. Exit 0: apto a revisão, 1: inválido/falha, 2: pendente. Nunca concede aceite ou efeitos. |
| `tests/acceptance/first-slice-{evidence,contracts}.test.ts` | 33 testes: recusa de prova incompleta/fixture, integridade/paths e percurso entre serviços/SQLite com decisão de escopo, entrega incerta/recibo, duas rodadas/versões, aviso ignored, ICR, paginação, revogação/reopen e retry fora de Ready. Git/GitHub/runtime/checks são controlados. |
| `scripts/smoke-execution.mjs` | Socket autenticado real para JSON/UTF-8 inválido, oversize e EOF incompleto; diagnóstico/fechamento e envio posterior recusado com deadline. Conserva cwd/argv Windows com espaços/Unicode usando Node como fixture. |
| `package.json`, `README.md` | Comandos `test:acceptance` e `acceptance:check`, links/limites da prova. Sem execução externa implícita. |

### Validação observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; strict, testes e verificador incluídos. |
| `npm.cmd run lint` | Exit 0; fronteiras/convenções existentes. |
| `npm.cmd run test:acceptance` | Exit 0; 33 testes em 2 arquivos. |
| `npm.cmd test -- --reporter=dot` | Exit 0; 635 testes em 42 arquivos no workspace atual, incluindo trabalho concorrente de scaffold. |
| `npm.cmd run build` | Exit 0; controlador/recursos/web. Avisos existentes de React/esbuild/optimizeDeps/chunk acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/CAS/idempotência/catálogo/shutdown/lock. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket/diagnósticos reais e PowerShell/Node fixture; Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node/filesystem/canonicalização reais; Git/Maestri não executados. |
| Verificador direto do manifesto atual | Exit 2; pending e readyForReview:false. Pendência esperada, sem aceite presumido. |

### Bloqueios e continuidade

- Sem alvo GitHub/perfis/orçamento/efeitos autorizados nem contexto elevado/keyring; nenhum Git/GH ou efeito real tentado por contexto alternativo. Dados solicitados ao usuário; silêncio não é autorização.
- Contexto Maestri ausente neste shell e composição confiável não fornecida. `npm start` chama `startController()` sem hostContext; não prova acesso nativo pelo adapter. Não se inferiu disponibilidade Wire dessa ausência.
- Achado backend PF-06: não foi localizada operação pública de vínculo inicial de conta observada; `recordControllerAccount` somente grava observação/pausa. Fixtures fazem seed SQL, insuficiente para provar instalação nova. PF-05 registra também a composição do host pendente. Resolver esses bloqueios no produto antes do percurso real, sem criar infraestrutura genérica.
- Sem inspeção visual Playwright MCP/Chrome das sprints 017/033/034 ou TUI/MCP/GitNexus reais no clone. Testes locais e smokes não comprovam AC/INT integrais. Fixture de ICR sem checks mantém not_applicable; não é check executado por agente real.
- Preparação entregue, **fatia sem aprovação integrada**. Execução futura deve criar novo registro e preservar este resultado. Nenhum Design Lock, aprovação, revisão independente da entrega, commit/push ou mudança de fase foi simulado.

## Sprint-018 do plano — Revalidação da prova integrada [VALIDADA LOCALMENTE; ACEITE REAL PENDENTE]

Data: 2026-10-17. Continuação no repositório canônico; preparação 20261017-01 e histórico preservados. Fontes: AGENTS, SPEC §§5–8/10.2–10.3, INTEGRACAO-MAESTRI-OMP, GLOSSARY, SPEC/plano derivados e roteiro first-slice. Prova definida antes da edição: recusar inconsistência de pré-voo/integridade no verificador offline, conservar pendências reais e executar os comandos configurados. Skill Context7 aplicada com resolução e consulta de filesystem Node 24; nenhuma dependência instalada.

### Alterações e evidências

- `scripts/first-slice-evidence.mjs`: anexo ilegível/corrompido, duplicidade e cronologia inválida agora retornam invalid/exit 1. Ausência de execução permanece pending/exit 2. Produto/autorização documentados após o início e captura oficial fora da janela são recusados; nomes herdados de Object não viram cenários. O verificador não autentica relatos/timestamps nem autoriza execução ou aceite.
- `tests/acceptance/first-slice-evidence.test.ts`: sete regressões adicionais para pré-voo, captura temporal, execução ausente, nome herdado e códigos de saída. Os testes continuam determinísticos e isolados de providers/efeitos externos.
- `docs/integration/first-slice/20261017-02/`: novo manifesto, relatório, resultados locais sanitizados e inventário de **420 arquivos selecionados**, somente paths relativos/tamanho/SHA-256. Digest agregado `d77b631d0be2a3f196213f604d16b7adf070d80393feeacdb55534f9780c7d4c`; inclui produção/configuração/recursos/scripts e dist, com limites de seleção explícitos. Não é ref Git nem captura oficial de tentativa; mudanças posteriores exigem outro inventário. README aponta para esta rodada, mantendo a anterior.

### Validação observada nesta rodada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, inclusive verificador. |
| `npm.cmd run lint` | Exit 0; fronteiras/convenções. |
| `npm.cmd run test:acceptance` | Exit 0; **40 testes em 2 arquivos**. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **642 testes em 42 arquivos**. |
| `npm.cmd run build` | Exit 0; controlador/recursos/web. Avisos existentes de React/esbuild e optimizeDeps; JS web 610,26 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/CAS/idempotência/catálogo/shutdown/lock. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket/UTF-8/malformed/oversize/EOF reais e PowerShell/Node fixture. Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node, filesystem/checksum e canonicalização reais; Git/Maestri não executados. |
| Verificador direto dos manifestos 01 e 02 | Exit 2 preservado no PowerShell; pending/readyForReview:false. Anexos atuais íntegros; sem aceite real. |

### Limites atuais

PF-05/PF-06 foram reconferidos no código atual: entrypoint ainda sem composição confiável do host, e não foi localizada operação pública de vínculo inicial da conta observada. São bloqueios backend de configuração/composição; seed SQL ou launcher alternativo não foram usados. O catálogo GitNexus não inclui este repositório e não comprova MCP útil no clone. MAESTRI_PIPE ausente somente neste shell; nenhum diagnóstico global de Wire é inferido.

Alvo GitHub, perfis, orçamento e efeitos delimitados foram solicitados e não fornecidos nesta rodada. Runtime sem contexto elevado/keyring e proibição de mutações Git impedem clone/ref/commit técnico reais. Nenhum Git/GH, provider, recrutamento, comentário/Status, cancelamento/restart real ou inspeção Playwright MCP/Chrome foi executado. Sem alteração de UI, credenciais/ACL, commit/push, aprovação ou mudança de fase. Os dez cenários reais e os aceites visuais das sprints 017/033/034 permanecem pendentes; esta rodada não declara todos os critérios AC/INT atendidos.

## Sprint-018 do plano — Repetição após o Evaluator [BLOQUEADA; ACEITE REAL PENDENTE]

Data: 2026-10-17. [Relatório 20261017-03](docs/integration/first-slice/20261017-03/report.md) e [resultados técnicos](docs/integration/first-slice/20261017-03/technical-validation.json) preservam os registros anteriores. Typecheck/lint, 40 testes de aceitação local, 642 testes totais, três etapas do build e smoke compilado de checks passaram novamente por chamadas diretas Node sem shell. Smokes HTTP e transporte falharam com `connect EACCES 127.0.0.1`; não foram declarados comprovados nesta rodada. O gate do manifesto 02 retornou pending/exit 2 antes e depois da validação.

PF-05/PF-06 continuam confirmados e sem correção: entrypoint sem composição confiável e ausência de vínculo inicial da conta observada. A prova ainda depende de contexto autorizado, autorização compatível com os efeitos Git gerenciados, alvo GitHub, perfis e orçamento. As informações foram solicitadas. Nenhuma evidência de fixture foi promovida. Houve uma consulta inicial `git status --short` somente leitura, sem elevação; ela não atesta keyring. Nenhum código de produção/UI foi editado e nenhuma mutação Git/GH, chamada de provider ou mudança de fase foi executada. A distribuição ignorada foi reconstruída e diverge do inventário 02; a futura prova real precisa de inventário novo antes dos efeitos. A solicitação de fazer todos os critérios passarem permanece incompleta.

## Sprint — Publicação privada e commit local [IMPLEMENTADA; ACEITE REAL PENDENTE]

Data: 2026-10-17. Implementação no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada ou comando Git/GH real executado. Nenhum commit/push, provider, terminal Maestri ou efeito remoto real iniciado. As operações Git descritas abaixo são código do produto e foram exercitadas somente com um port Git controlado. Não representa aprovação, mudança de fase ou Design Lock.

### Fontes e critérios

- AGENTS.md; SPEC.md §6 e §§5.2/8/10.2; GLOSSARY.md; INTEGRACAO-MAESTRI-OMP.md, especialmente INT-18; SPEC derivada em docs/Docs20261016_073031, §§3.2/3.4. Cobertura solicitada: RF-70/74/76/77, AC-10/13 e INT-18.
- Prova definida antes da edição: publicar exclusivamente tree/base/ref retidas; intenção/claim SQL anteriores ao Git; confirmação do commit anterior ao comentário; reconciliação por tree/parent/operationId; no-op revisado sem commit vazio; rollback, cancelamento tardio, restart e preservação após remoção da implementação.
- Skill Context7 aplicada com resolução antes das consultas: Git commit-tree/update-ref/CAS e better-sqlite3 para transações síncronas/IMMEDIATE/rollback. Sem alteração de versões/dependências. GitNexus consultado: este repositório não está indexado; nenhum grafo do legado foi usado.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Publicação privada | workspaces/publication.ts exporta createLocalPublisher; API pública de workspaces acrescenta materializePublication, createLocalCommit e reconcileLocalCommit. Materialização reutiliza o percurso de checks/revisões com finalidade publication e configuração Git isolada. |
| Ambiente | Destino exclusivo <data>/work/<attemptId>/publication/<effectOperationId>/checkout, derivado somente de <data>/git/<attemptId>.git. Confere ownership, ausência de alternates, ref direta, commit técnico/tree/base/objetos e checkout da versão retida. Nenhuma leitura da implementação para formar publicação. Recurso existente/parcial não é adotado/resetado/apagado. |
| Commit de entrega | commit-tree usa a tree aprovada e um único parent/base; mensagem Conventional Commit feat: deliver issue #N com Factory-Attempt, Factory-Delivery e Factory-Operation. Datas UTC da intenção e identidade técnica não dependem da configuração global. A branch refs/heads/factory/<issueNumber>/<attemptId> é criada por CAS de ausência no Git gerenciado retido. É diferente da ref técnica da captura e do baseline de scaffold. |
| Journal | EffectView aceita local_commit; EffectIdentity inclui tree/base/branch/issue/data, e o recibo confirma SHA/tree/parent/ref/operationId. Storage valida modo capturado, versão, autorização durável e vínculos, com intenção/claim/eventos antes do efeito. O adapter GitHub recusa local_commit. |
| Persistência | Migration 014_local_publication.sql amplia effects/publication_requests por substituição transacional sem FKs de entrada, preservando dados/ordem/recibos, índices, FKs e guards. Migrations 001–013 permanecem intactas. Expectativas históricas de schema foram atualizadas para 14. |
| Coordenação | publication completa ICR ou Commit conforme captura, revalida autoridade depois de IO e antes do commit, confere artifacts e só comenta após commit confirmado/não aplicável. Falha conserva aprovação/efeitos anteriores e não relança Implementador. Confirmação tardia após cancelamento registra o fato, sem executar o próximo efeito. |
| Consulta e preparação | publication.commit oferece estado/SHA/motivo/operationId, separado de revisão, resultado final e limpeza. Complete exige o modo capturado; PR continua indisponível. A preparação deixa de bloquear Commit no guard existente; não foi alterado layout. |
| Documentação/provas | README atualizado; novos workspaces/publication.test.ts e tests/integration/local-publication.test.ts; regressão de datas/configuração no port Git controlado. Fixtures anteriores foram ampliadas por parâmetros opcionais, conservando os defaults ICR. |

### Reconciliação e entrega sem delta

Perda de resposta após criação da branch permanece unknown até uma consulta conferir ref direta, tree, parent único, mensagem/operationId e objetos. A consulta não cria commit/ref nem faz push. Confirmação recupera o mesmo efeito; complete com outra operação trata somente pendências após reconciliação. Ref ausente/divergente ou leitura indisponível mantém unknown, sem sobrescrever branch ou repetir commit. Objeto criado sem ref confirmável continua incerto e requer diagnóstico; materialização parcial é preservada.

No-op exige a aprovação/evidências oficiais existentes e comparação real pelo port Git entre tree da base e contentIdentity, coerente com hasDelta:false. O efeito recebe not_applicable/APPROVED_NO_DELTA, sem commit vazio. Comentário identificado contém SHA/branch ou motivo de ausência de delta, critérios/checks e referências às evidências. Comentário confirmado precede resultado delivered; projeção Delivered posterior permanece um efeito separado. Não há push, PR, auto-close, edição de checkboxes/corpo ou Done.

Commit usa a retenção independente, inclusive após remoção da implementação. ICR continua exigindo ambiente acessível. Após restart, a ação explícita mantém os gates de recursos antigos reconciliados e autoridade atual; não restaura sessão.

### Validação técnica observada

| Comando equivalente configurado | Resultado final |
| --- | --- |
| node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit | Exit 0; strict, produção/cliente/testes. |
| node scripts/check-boundaries.mjs | Exit 0; limites de módulos/SQL e convenções TypeScript. |
| node node_modules/vitest/vitest.mjs run --reporter=dot | Exit 0; **661 testes em 44 arquivos**, 19 adicionais sobre os 642 anteriores. Rede/subprocessos/providers reais bloqueados pela suíte padrão. |
| node node_modules/typescript/bin/tsc -p tsconfig.json | Exit 0; controlador/declarations compilados. |
| node scripts/copy-resources.mjs | Exit 0; migrations, recursos e templates distribuídos. |
| node node_modules/vite/bin/vite.js build | Exit 0; bundle web gerado. Avisos existentes de React/esbuild, optimizeDeps e chunk acima de 500 kB; JS observado 610,66 kB minificado. |

As três etapas finais acima equivalem ao npm run build configurado. Nenhuma dependência foi instalada. A primeira rodada final encontrou um erro na nova fixture HTTP: createApp interrompe coordenação antiga, e faltava a observação controlada de parada dos terminais antes da conclusão explícita. A fixture foi corrigida, o teste focado passou e a suíte completa foi repetida com sucesso; não se contornou o gate de produção.

Provas novas: bytes da tree aprovada materializados depois de alteração/remoção física da implementação, cache ausente da publicação, base/ref divergentes recusadas, Conventional Commit e parent/tree exatos sob Git controlado, data fixa no ambiente do processo falso, resposta perdida e ausência de replay, branch/mensagem estrangeira recusadas, no-op sem clone/commit, intenção/recibo/evento e bloqueios de SQL, falha de persistência depois do Git sem próximo efeito, confirmação tardia após cancelamento, reopen com ambiente removido/recursos reconciliados e consulta HTTP protegida de Commit. Migração SQLite real 13→14 usa as definições originais v13 e preserva registros/recibos/ordem/guards/identidade/FKs.

### Limites e continuidade

- SQLite, HTTP inject e filesystem de fixtures são reais; Git, canonicalização positiva, GitHub e executor são controlados. Não foram executados Git temporário real, clone/ref/commit reais, comentário/Status reais, TUI Maestri/OMP ou inspeção visual em navegador. Não foram executados smokes compilados nesta sprint. Compilação e fixtures não encerram AC-10/13 ou INT-18 integrais.
- Runtime sem contexto elevado/keyring exigido pelo projeto; a sessão proíbe mutações Git. Nenhum Git/GH foi disparado por contexto alternativo, login refeito ou credencial/ACL alterada. A prova real deve usar host autorizado e efeitos/alvos correspondentes. Os bloqueios de composição/conta documentados na prova integrada anterior não foram ampliados nem resolvidos por esta fatia.
- Commit local fica retido na branch do Git gerenciado; o checkout privado é materialização operacional separada. Falhas incertas e recursos parciais são preservados, sem limpeza/readopção automática. Aprovação técnica, conclusão do modo e limpeza continuam independentes.
- Nenhuma aprovação integrada, revisão independente da implementação desta sprint ou mudança de fase foi declarada.


## Sprint 021 - Publicação privada e commit local [CONCLUIDA]
- Materialização privada da versão aprovada: Disponibilizar ambiente de publicação independente do clone mutável.
- Conventional Commit local reconciliável: Concluir o efeito de commit no modo autorizado.
- Entrega sem delta e conclusão Commit: Tratar ausência de alterações e completar os efeitos pertinentes ao modo.

## Sprint — PR, reconciliação e aumento de modo [IMPLEMENTADA NO BACKEND; ACEITE REAL PENDENTE]

Data: 2026-10-17. Implementação no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada e nenhum comando Git/GH real, provider, terminal Maestri, commit, push ou PR real executado. Os comandos Git do produto foram exercitados por um port controlado; não foram disparados neste runtime. Sem aprovação, mudança de fase ou Design Lock.

### Fontes, critérios e prova definida

- `AGENTS.md`, `SPEC.md` §6/6.1 e §§7/8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` INT-18 e SPEC derivada §§3.2/3.4/F-03. Cobertura solicitada RF-71/72/75/78–80; AC-11/12/18/22; INT-18, nas superfícies backend abaixo. Não são declarados aceites reais integrais.
- Antes da edição: journal/claim anteriores a cada mutação, recibo anterior ao efeito seguinte, confirmação por identidade exata, unknown sem replay, gate atual após IO, autorização adicional imutável/CAS/hash, preservação da captura e efeitos confirmados e restart sem conclusão automática.
- Skill Context7 aplicada, com resolução anterior às consultas de Git e GitHub GraphQL. Conferidos refspec explícito sem força, leitura de refs remotas, CreatePullRequestInput, head/base/repositórios e paginação. Referências primárias: [git-push](https://git-scm.com/docs/git-push), [git-ls-remote](https://git-scm.com/docs/git-ls-remote), [GitHub pulls](https://docs.github.com/en/graphql/reference/pulls) e [paginação GraphQL](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api). Versões/dependências preservadas. GitNexus consultado: não há índice deste repositório; nenhum grafo do legado foi usado.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Contratos | `packages/contracts/src/publication.ts`: efeitos `push`/`pull_request`, identidades/recibos remotos, `AuthorizeUpgrade`, `ModeUpgradeSummary` e projeções `publication.push/pullRequest/upgrades`. CapturedMode e authorizedMode são distintos nas consultas. |
| Push | `workspaces/remote-publication.ts`, composto pelo index/main: `pushApproved`, `reconcilePush`, autorização de conta/repositório somente do host confiável. Confere ownership/ref/tree/base/commit/mensagem/operação, usa HTTPS explícito e único refspec SHA→branch própria, sem força/tags. Conserva credential helper normal e recusa redirecionamentos/transportes não previstos. Confirma ref/SHA com ls-remote. Não lê o clone mutável nem modifica seu índice. |
| PR | `github/pull-requests.ts`, `effects.ts` e index: mutation estática createPullRequest, consulta paginada e `reconcilePullRequest`. Confere refs atuais, repositório head/base, head SHA, branch/base, marcador único, hash do corpo, título, autor, URL e estado aberto. Recurso semelhante, duplicado, ausente ou leitura parcial não é adotado. |
| Coordenação | `publication/index.ts`: conclusão dos três modos, sequência commit→push→PR, verificação de artifacts/checks paginados e nova checagem de autorização imediatamente antes da mutação GitHub. PR contém escopo/base/versão/checks/parecer/pendências não impeditivas, inclusive herdadas de rodadas anteriores, e attemptId. Sem comentário de resultado no modo PR; comentários confirmados de modos anteriores são preservados no aumento. |
| Autorização adicional | `POST /api/v1/attempts/:attemptId/publication/authorize-upgrade`, composto pelo pipeline. Recebe deliveryId/currentMode/targetMode/authorizedAdditionalEffectsHash/authorized:true, If-Match e Idempotency-Key. Resumo vem do GET da entrega, somente para tentativa encerrada e versão corrente aprovada; oferece ICR→Commit/PR e Commit→PR. Retenção/evidências, gate atual, revisão e hash são conferidos antes da autorização e CAS/hash são repetidos em SQL. |
| Persistência | Migration `015_pr_upgrades.sql`, sem editar 001–014: journals ampliados e `publication_upgrades` STRICT, imutável, com FK composta para operação/tentativa/versão/modo. Autorização, revisão, operação/recibo e evento são atômicos. `storage/publication-modes.ts` mantém leitura do modo autorizado e resumo por referências; conexão/SQL/transações continuam privados. |
| Provas/documentação | `tests/integration/pr-publication.test.ts`, `github/pull-requests.test.ts`, `workspaces/remote-publication.test.ts`; fixtures históricas atualizadas para schema 15 e a nova tabela. README registra API, autorização, limites e a superfície frontend pendente. |

Ausência de delta é confirmada pelo percurso do commit existente e registra commit/push/PR como not_applicable/APPROVED_NO_DELTA, sem push ou PR vazia. Falha na confirmação SQL desse estado também é reconciliável, sem IO remoto. O conteúdo permanece a mesma tree aprovada; não há recaptura, nova implementação ou nova sessão para aumentar modo.

Cada mutação exige intenção e claim duráveis. Timeout após envio mantém unknown até observação confirmável. Complete reconcilia antes de agir e trata somente pendências autorizadas; uma autorização adicional já confirmada não é pedida novamente, inclusive após falha conhecida. Replay de authorize-upgrade recupera o recibo original antes de CAS/IO e não agenda outro efeito. Resumo obsoleto/modo inválido/gate bloqueado recebem conflito diagnosticável. Falha de SQL não libera o próximo efeito; fatos remotos confirmados depois do cancelamento são preservados sem restaurar autoridade.

Restart mantém as autorizações e os fatos históricos, marca envios incompletos unknown e não publica automaticamente. Conclusão explícita exige gate atual e recursos antigos reconciliados, inclusive quando o resultado original já era delivered e um aumento ficou pendente. Resultado original, conclusão do modo, efeitos, revisão e limpeza permanecem eixos distintos. Cancelamento durante consultas prévias impede o envio seguinte; requisição já enviada pode terminar e ter seu recibo registrado. Releituras não são CAS remoto nem impedem alterações externas entre observações; divergência permanece diagnosticável, sem adotar PR ou sobrescrever branch.

### Validação técnica observada

| Comando configurado equivalente | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit` | Exit 0; strict, produção/cliente/testes, sem any/supressões. |
| `node scripts/check-boundaries.mjs` | Exit 0; limites de módulos/SQL e convenções TypeScript. |
| `node node_modules/vitest/vitest.mjs run --reporter=dot` | Exit 0; **714 testes em 47 arquivos**, 53 adicionais sobre os 661 anteriores. Rede/subprocessos/providers reais bloqueados na suíte padrão. |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | Exit 0; controlador/declarations compilados. |
| `node scripts/copy-resources.mjs` | Exit 0; migrations, recursos e templates distribuídos, incluindo migration 015. |
| `node node_modules/vite/bin/vite.js build` | Exit 0; bundle web, JS 611,55 kB minificado. Permanecem avisos existentes de React/esbuild, optimizeDeps e chunk acima de 500 kB. |

Provas novas: SQLite/Fastify inject/filesystem reais; intenção/claim anteriores ao push/PR, rollback de intenção/recibo/autorização, recibos estrangeiros recusados, no-op e falha de ACK local sem replay, dois caminhos de resposta perdida, consulta sem mutação, ausência/duplicidade/body/autor/head/base/SHA/repositório divergentes, paginação completa, gate após consultas prévias, cancelamento com confirmação tardia, aumento direto/sequencial e recuperação de resposta perdida, captura/confirmados imutáveis, gate de integridade antes da autorização, CAS/hash/configuração/modo inválidos, continuidade explícita após reopen/restart, HTTP protegido/Location e migração SQLite real 14→15 preservando identidade/recibos/ordem/FKs/guards sem fabricar upgrades.

As três etapas de build acima equivalem ao `npm run build` configurado. Após o último ajuste de mensagens de conflito, typecheck/lint/build passaram novamente e os 26 testes focados de publicação PR passaram; a suíte completa anterior registrou os 714 testes acima.

O teste histórico de comentário tardio passou a cancelar depois da chamada controlada que representa o envio, distinguindo-o do novo caso de cancelamento antes do envio. O gate de produção não foi relaxado. A regressão AC-29 permanece com cache ignorado de 16 MiB: banco/WAL e payloads iguais antes/depois na fixture, com Git controlado; não é medição de pack/objetos Git reais.

### Limites e continuidade

- Git/GH e mutações remotas não foram executados: o runtime não disponibiliza o contexto elevado/keyring exigido e esta sessão proíbe mutações Git. Sem login alternativo, mudança de credencial/ACL, instalação ou ação Git de versionamento. Os adapters exigem autorização do host para os alvos reais; o body HTTP não a concede.
- Git, canonicalização positiva, GitHub e executor foram controlados. SQLite, HTTP inject, reopen/migrations e filesystem de fixtures são reais. Não foram executados smokes compilados, Git temporário real, push/PR/Status/comentário reais, TUI Maestri/OMP ou browser nesta sprint. AC-11/12/18/22 e INT-18 integrais continuam dependentes da prova real autorizada.
- A implementação desta sprint é backend. O bloqueio explícito de início PR na preparação web e os controles visuais de publicação/aumento de modo continuam para a fatia de interface; nenhum layout ou aceite visual foi alterado/presumido. Bloqueios de composição inicial do host/conta registrados anteriormente permanecem fora desta fatia.
- Nenhuma revisão independente desta implementação, aprovação integrada, Design Lock, mudança de fase, commit ou push foi declarado.

## Sprint 022 - PR, reconciliação e aumento de modo [CONCLUIDA]
- Push e PR do conteúdo aprovado: Concluir o modo PR com efeitos autorizados e confirmados.
- Reconciliação e conclusão de pendências: Implementar publication/reconcile e publication/complete.
- Autorização adicional de modo superior: Implementar resumo de acréscimos e publication/authorize-upgrade.

## Sprint — Entrega e publicação na interface [IMPLEMENTADA; PROVAS PENDENTES]

Data: 2026-10-17. Interface conectada às leituras e operações de publicação existentes no `attempt-detail`, usando sempre a tentativa e a versão selecionadas. Nenhuma publicação real, chamada Git/GH, provider ou operação externa foi iniciada. Nenhuma ação Git de versionamento foi executada.

### Entregáveis

- `apps/web/src/features/attempts/PublicationDialog.tsx`: apresenta versão/conteúdo, modo capturado e autorizado, parecer por versão, estado de conclusão, totais de efeitos e recibos/motivos de commit, push, PR, comentário e Status consultados. Aprovação do Revisor permanece separada da confirmação de PR/publicação.
- `AttemptDetailDialog.tsx` liga a publicação ao `deliveryId` efetivo da URL/rodada e às capacidades recebidas. A reconciliação e conclusão só enviam POST após ação explícita; leituras e polling consultam apenas a operação já identificada. O conteúdo não inclui `creationId`.
- A autorização de aumento apresenta apenas modos superiores retornados pela API, exige confirmação ligada ao `summaryHash` atual, envia If-Match e uma chave única e invalida a confirmação quando o resumo recebido muda. Conclusão posterior permanece uma ação separada.
- Operação incerta conserva `operationId` em `sessionStorage` e na consulta visual; não há replay de POST. `useDelivery` agora tipa a projeção completa `DeliveryDetail` necessária à interface.
- A preparação oferece ICR, Commit local e Pull request, remove o bloqueio fixo anterior de PR e continua condicionando o início aos pré-requisitos correntes retornados pelo serviço. `effectsPreview` mostra os efeitos do modo antes da autorização do resumo/início.

### Validação e limites

- Não foram executados typecheck, lint, build, testes automatizados ou Playwright/Chrome nesta rodada: as instruções de terminal recebidas autorizam comandos Git somente de leitura e proíbem expressamente qualquer comando que não comece com `git`, o que impede executar os scripts npm configurados. Nenhum aceite de compilação ou visual foi presumido.
- Os contratos e rotas de publication consultados são os existentes em `packages/contracts/src/publication.ts`, `queries.ts` e `http/routes/publication.ts`. A publicação real autorizada e a observação Playwright MCP/Chrome continuam pendentes; os critérios afetados permanecem sem aceite até essas provas.

## Sprint — Observação completa da fila Ready [IMPLEMENTADA; PROVA GITHUB REAL PENDENTE]

Data: 2026-10-17. Implementação no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada, comando Git/GH, provider, recrutamento, tentativa real ou efeito remoto executado. Sem commit/push, aprovação ou mudança de fase.

### Fontes e cobertura

- `AGENTS.md`, `SPEC.md` §4 e §§8/10.2, `GLOSSARY.md`, SPEC derivada §§3.2/3.4 e stories RF-30–33/35; AC-19/22 nas superfícies de observação. Ready é conjunto atual, sem exigir evento temporal de atribuição/transição.
- Antes da edição, definidos testes determinísticos para elegibilidade/ordem, consultas HTTP e SQLite reais para paginação/ausência de gravação, e GraphQL controlado para paginação de campos/valores/posição e backoff. Nenhum ensaio é tratado como consulta GitHub real.
- Skill Context7 aplicada com resolução e consultas de GitHub GraphQL; confirmado `ProjectV2ItemFieldNumberValue` e conferida a ordenação documentada `ProjectV2ItemOrderField.POSITION` na [referência primária](https://docs.github.com/en/graphql/reference/projects). GitNexus consultado: catálogo não contém este repositório; arquivos atuais foram a referência, sem usar o grafo do legado.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Elegibilidade | `apps/controller/src/modules/projects/queue.ts`: issue aberta, repositório/Project/owner/campo/opções por IDs, vínculo ao item exato, Ready, assignee único da conta e bloqueadores. Motivos específicos para responsável ausente/alheio/múltiplo, draft, PR e item arquivado. Bloqueador afeta somente sua issue; consumo/ocupação existentes são apenas consultados. |
| Consulta completa | Todas as páginas pertinentes são consultadas antes do total e da página HTTP. `eligibleTotal` é independente do limite exibido. Leitura parcial, auth inválida, rate limit, configuração/conta/catalogo alterados durante IO impedem observação autorizável; total incompleto é null e candidatos não recebem elegibilidade executável. |
| Ordem | `github/client.ts` materializa definições numéricas, valores por ID de campo e posição da conexão explicitamente ordenada. Prioridade asc/desc, valores ausentes por último, posição documentada quando disponível, número/ID para desempate e fallback explícito. Projetos são agrupados por ID; não se presume a ordem de uma view visual do GitHub. |
| Resumo | Identidade/instante/completude/validade/escopo/modos/ordem/quantidade, conta/host e hash material. Hash/cursor vinculam configuração observada e candidatos; mudança de escopo, quantidade, modos, prioridade ou conta invalida o resumo anterior. Escopo account acima de 100 projetos recebe erro explícito, sem truncamento válido. |
| Polling | Resposta inclui intervalo/máximo de backoff configuráveis, retryAtMs e próximo polling. Falhas usam progressão exponencial limitada; Retry-After/reset prevalece acima desse teto. Durante cooldown não há nova chamada GitHub nem autoridade obtida de cache. Somente prazos/contadores ficam em memória. |
| Composição e cliente | `http/app.ts` desconecta a fila do timer de consumo padrão; o entrypoint nativo já não fornecia essa conexão. Mecanismos anteriores permanecem para conexão explícita na sprint-023. `useQueue.ts` agenda leituras pelo contrato e aplica backoff em erro de transporte; `QueuePanel.tsx` apresenta os motivos existentes no schema. Nenhum layout foi alterado. |
| Compatibilidade | `PublicationDialog.tsx`: anotação do path como `/api/v1/${string}`, necessária para corrigir erro de typecheck encontrado no código anterior. Sem alteração de comportamento da publicação. |
| Documentação | README registra contrato de consulta, prioridade, fallback, backoff, limite de escopo e separação do consumo. Sem dependência, migration ou cópia persistida do quadro. |

### Validação técnica final

| Comando configurado equivalente | Resultado observado |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit` | Exit 0; TypeScript strict de produção, cliente e testes. |
| `node scripts/check-boundaries.mjs` | Exit 0; limites de módulos/SQL e convenções. |
| `node node_modules/vitest/vitest.mjs run --reporter=dot` | Exit 0; **730 testes em 47 arquivos** na rodada final. Rede/subprocessos/providers reais continuam bloqueados pela suíte padrão. |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | Exit 0; controlador/declarations compilados. |
| `node scripts/copy-resources.mjs` | Exit 0; recursos/migrations distribuídos. |
| `node node_modules/vite/bin/vite.js build` | Exit 0; bundle web gerado. Avisos existentes de React/esbuild, optimizeDeps e chunk acima de 500 kB; JS observado 631,39 kB minificado. |

As três últimas etapas equivalem ao build configurado. Provas novas em `tests/integration/projects.test.ts` e `github/github.test.ts`: total além da página, cursor vinculado ao resumo, responsável/Ready em ordens temporais distintas, bloqueador local, issue fechada/estrangeira/arquivada, vínculo exato, prioridade 0/asc/desc/ausente, posição e fallback, campos/valores em páginas posteriores, parcial/auth/rate limit, hash por modo/escopo/conta/quantidade, mudança durante IO, cooldown sem chamadas, reset remoto superior ao teto, backoff exponencial limitado e limpo após sucesso. A ausência de gravação pelo GET é conferida por `PRAGMA data_version` em outra conexão, além de tentativas/ciclos ausentes. Com automação configurada e após tick real do timer, a composição HTTP não registra consumo nem inicia tentativa.

Uma rodada encontrou falta de `projectsRoot` na nova fixture de automação; a fixture foi corrigida para satisfazer o gate de produção, sem relaxá-lo. Os 58 testes focados do arquivo e a suíte completa final passaram depois da correção.

### Limites e continuidade

- GitHub/GraphQL são controlados nos testes; HTTP inject/SQLite são reais. Consulta GitHub real, host/keyring, polling contra rate limit real e aceites AC-19/22 integrais permanecem sem prova. Não foram executados smokes compilados ou inspeção visual Playwright/Chrome nesta sprint; build não prova interação visual.
- Habilitação e consumo não foram ampliados nesta fatia. A sprint-023 deverá conectar explicitamente o consumo ao fluxo existente de início e revalidar o resumo/autoridade antes de qualquer efeito. Esta consulta não concede autoridade durável nem garante snapshot remoto transacional.
- Nenhum Git/GH foi executado, pois o runtime não fornece o contexto elevado/keyring exigido e as restrições de versionamento foram preservadas. Sem instalação, login alternativo, alteração de credenciais/ACL, publicação ou revisão independente presumida.

## Sprint 024 - Observação completa da fila Ready [CONCLUIDA]
- Elegibilidade por conta e vínculos: Implementar GET /queue e regras determinísticas dos candidatos.
- Leitura completa e ordem explícita: Consultar todos os itens necessários antes de produzir observação autorizável.
- Observação e resumo de habilitação: Disponibilizar escopo, modos e hash do resumo da fila.

## Sprint — Scheduler e consumo durável da fila [IMPLEMENTADA NO BACKEND; ACEITE REAL PENDENTE]

Data: 2026-10-17. Implementação no repositório canônico, preservando o histórico anterior. Nenhuma dependência instalada, comando Git/GH, provider, recrutamento Maestri/OMP ou mutação GitHub real. Nenhum commit/push, aprovação, Design Lock ou mudança de fase.

### Fontes, critérios e prova definida

- `AGENTS.md`; `SPEC.md` §§4–5.1/8/10.2, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` e SPEC derivada §§2.1/3.4. Cobertura backend RF-27/34/36–42 e AC-19–22: autorização da fila, ciclo observado, unicidade e governança atual.
- Antes da edição: comprovar CAS/resumo/escopo e idempotência, consumo e tentativa na mesma transação antes de efeitos, rollback, Ready residual/rearmamento observado, pausa em corrida e governança do worker. SQLite e HTTP inject reais; GitHub/executor controlados. O lock recebeu prova adicional entre processos Node reais, sem rede.
- Context7 consultado com resolução e consulta de better-sqlite3 para transações síncronas IMMEDIATE, rollback e savepoints. Mantidas as dependências fixadas. GitNexus não possui índice deste repositório; nenhum grafo do legado foi usado. A leitura opcional da memória externa foi rejeitada pela revisão automática como fora do escopo; o trabalho usou as fontes locais.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Habilitação/pausa | `projects/queue.ts`, `storage/queue.ts`, `http/routes/queue.ts` e `contracts/queue.ts`: PUT com operação própria `queue.update`, ETag composto de settings/perfis e projetos do escopo, hash do comando completo e recibo/evento atômicos. Habilitação reconsulta quantidade, conta/host, escopo, modos e candidatos; conflito retorna `QUEUE_SUMMARY_CHANGED`, resumo atual em `queue` e ETag. Pausa conserva tentativa ativa, ciclos e histórico. |
| Vários projetos | GET aceita `projectIds` com IDs separados por vírgulas, sem combinar com `projectId`. Scope project altera de 1 a 100 projetos distintos em uma transação e exige chave global ligada para habilitar; scope account controla a chave global. Preview de projetos selecionados conta candidatos mesmo com a automação desses projetos desligada. A UI existente continua usando scope account; nenhum layout foi alterado. |
| Persistência | Migration `016_queue_scheduler.sql`, preservando 001–015: `queue_consumptions` STRICT/imutável com conta/projeto/repositório/issue/ciclo/timestamps/attempt, FKs/guards/índices, timestamps observados em `queue_cycles` e origem de novas tentativas `manual/automatic/retry`. Origem histórica ausente permanece NULL; transições e ciclos antigos não são inventados. Vínculos consumidos efetivamente presentes na v15 são conservados na migração. |
| Concorrência | Índice parcial único por conta para tentativa automática ativa; índice único de issue ativa preservado. O início automático também recusa ocupação por qualquer tentativa ativa da conta, repetindo esse gate na transação. Cadastros duplicados da mesma issue/repositório compartilham o consumo dos ciclos Ready já observados, evitando execução pelo cadastro vizinho. |
| Scheduler | `pipeline/start.ts`, `main.ts`, `http/app.ts`: composição no controlador, sem worker criado por interface. Polling/backoff respeitados; observações completas/válidas registram ciclos, nova observação precede seleção e o início usa `startAttempt` existente. Configuração e pausa são repetidas no commit. Consumo, tentativa, captura, operação/recibo e intenções são confirmados juntos antes de clone/processo. |
| Governança | Reutiliza observação de conta e autoridade da publicação: conta divergente pausa despacho, assignee alterado solicita cancelamento e Status divergente suspende avanço, preservando efeitos e versão. Falha de projeção não repete consumo. Sem takeover, escrita forçada, retry automático por falha/cancelamento ou reconstrução de transições offline. |
| Provas/documentação | `tests/integration/queue-scheduler.test.ts` acrescenta 20 cenários; testes de ciclos e reconstrução de bancos temporários históricos atualizados para schema 16. README registra API, CAS, consumo e handoff entre contas/instalações. |

### Validação técnica observada

| Comando/prova | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit` | Exit 0; produção/cliente/testes strict, sem any/supressões. |
| `node scripts/check-boundaries.mjs` | Exit 0; limites de módulos, SQL privado e convenções. |
| `node node_modules/vitest/vitest.mjs run --reporter=dot --no-color` | Exit 0; **750 testes em 48 arquivos**, incluindo 20 cenários novos do scheduler. Rede/subprocessos/providers de produto bloqueados na suíte padrão. |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | Exit 0; controlador/declarations compilados. |
| `node scripts/copy-resources.mjs` | Exit 0; recursos e migration 016 distribuídos. |
| `node node_modules/vite/bin/vite.js build --clearScreen false` | Exit 0; bundle web gerado. Avisos existentes de React/esbuild e optimizeDeps permanecem. |
| `node scripts/smoke-compiled.mjs` | Exit 1; `connect EACCES 127.0.0.1` no ambiente. HTTP loopback/SSE do smoke não foram comprovados nesta rodada. Nenhum fallback de produção ou alteração de ACL/credenciais. |
| Lock compilado em processos próprios | Exit 0; primeiro processo Node mantém o lock SQLite, segundo é recusado e outro adquire após morte do proprietário. Sem rede ou dependência de porta/projeto, usando diretório exclusivo em `.cache`. |

As três etapas de compilação/distribuição/Vite equivalem ao build configurado; execução direta Node, sem shell. As provas novas incluem autorização sem precondição/hash, resumo alterado por quantidade/modo/conta/responsável, resposta HTTP com resumo atual/CSRF, escrita atômica em vários projetos, rollback no evento/consumo/rodada, pausa concorrente, consumo anterior ao clone, ticks concorrentes, restrição SQLite entre issues diferentes, cadastros duplicados, backoff com segunda leitura degradada, cancelamento/reopen/Ready residual, retorno inelegível sem rearmamento, governança de conta/responsável/Status, projeção falha sem repetição e migração SQLite real 15→16 preservando identidade/recibos/histórico. As regressões anteriores de rearmamento e consumo único permanecem verdes. Cache ignorado de 16 MiB continua sem alterar banco/WAL/payloads na fixture histórica AC-29; Git é controlado nessa medição.

### Limites de prova

- GitHub, Git, executor e projeções remotas são controlados nos testes. Não houve consumo integrado real no GitHub/Maestri/OMP, consulta ao keyring, publicação ou inspeção visual. AC-19–22 integrais continuam dependentes da prova real autorizada; os resultados locais não a substituem.
- O smoke HTTP compilado permanece bloqueado por EACCES no loopback. A prova separada de lock comprova exclusão local e liberação entre processos, sem comprovar transporte HTTP. Instalações independentes não compartilham o lock: handoff exige cancelar/encerrar a tentativa anterior antes de atribuir a outra conta e rearmar Ready.
- Os bloqueios preexistentes de composição confiável do host e vínculo inicial da conta não foram substituídos por seed ou credencial de demonstração. Sem contexto autorizado, a composição continua recusando despacho. Nenhuma nova infraestrutura distribuída foi acrescentada.

## Sprint 025 - Scheduler e consumo durável da fila [CONCLUIDA]
- Habilitação e pausa autorizadas: Implementar PUT /queue para escopo de conta ou projetos.
- Consumo atômico por ciclo observado: Persistir queue_consumptions e integrar o scheduler a startAttempt.
- Concorrência e autoridade do worker: Aplicar os limites de execução e mudanças externas no caminho automático.

## Sprint — Fila e divergência na Principal [IMPLEMENTADA; VALIDAÇÃO PENDENTE]

Data: 2026-10-17. Continuidade da fatia frontend da fila no repositório canônico. Artefato visual obrigatório `docs/Docs20261016_073031/design/artifact.html` consultado antes das alterações; preservados os IDs `principal`, `app-shell` e `attempt-detail`, a paleta aprovada, o shell existente e os breakpoints 950/650 px. Não houve alteração de contratos/backend nem efeitos GitHub/Maestri/OMP.

### Entregáveis

- `features/queue/useQueue.ts`: invalidação de cursor 409 reinicia a consulta na primeira página e informa a mudança, sem projetar leitura inválida como fila vazia. Atualização manual retorna à primeira página; polling conserva a página da observação corrente enquanto válida.
- `features/queue/QueuePanel.tsx`, `app/PrincipalScreen.tsx` e `api/uncertain-operations.ts`: estado da observação e mensagem de reordenação visíveis; valor numérico de ordenação `0` é apresentado. Botão de pausa sinaliza envio e aguarda confirmação; após recibo ou rejeição conhecida, a lista volta a ser lida do início. Resposta incerta preserva o ID em `sessionStorage`, é restaurada após recarga, troca o estado para “sem recibo” e oferece consulta GET, sem repetir a mutação. Erro da leitura paginada não remove a possibilidade de pausar quando observação/ETag da própria ação continuam disponíveis.
- `features/queue/QueueEnableDialog.tsx`: autorização fica vinculada ao `summaryHash` atualmente exibido e é invalidada quando a observação muda. Exige quantidade completa, `observationId`, hash e ETag antes do comando. Resposta incerta preserva o `operationId`, oferece consulta de operação e bloqueia novo envio até estado terminal; não há replay cego.
- `features/queue/QueueAuthorityDialog.tsx`: observação atual de responsáveis/Status é distinguida de erro ou ausência, e leitura parcial não é tratada como autoridade confirmada. A orientação existente continua a apontar a correção no GitHub e as ações permanecem condicionadas às capacidades reais da tentativa.
- `app/styles/artifact.css`: estados e paginação ajustados para telas estreitas dentro dos tokens/composição existentes.

### Validação e limites

- Não foram executados typecheck, lint, testes, build ou navegador. As instruções de terminal desta sessão permitem apenas comandos `git` de leitura; por isso os comandos de validação solicitados não puderam ser executados. A revisão do diff é permitida e será registrada separadamente.
- Não houve prova GitHub/Maestri/OMP real nem aceite visual. A integração e a prova real autorizada da fila seguem pendentes; nenhum cenário de fixture é promovido a evidência externa.

## Sprint — Plano de scaffold e criação somente local [REVALIDADA; PROVA GIT REAL PENDENTE]

Data: 2026-10-17. Continuidade da implementação existente no repositório canônico. Fontes consultadas: AGENTS.md, SPEC.md §3.2 integral e §§8/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, SPEC derivada, referência setup-matt-pocock-skills com tracker/domínio/triagem e writing-for-agents. Cobertura RF-05–08/11/12; AC-02/05 limitada à fatia local e às superfícies comprovadas abaixo. O setup não foi executado neste workspace.

### Alterações e provas

- `projects/scaffold-resources.ts`: valida os caminhos finais após acrescentar AGENTS.md, .gitignore e documentos de engenharia, nas variantes com/sem triagem. Colisões de arquivos/diretórios e de nomes no Windows agora recusam o catálogo antes da intenção ou escrita no destino. Recursos obrigatórios continuam exigidos e alterações invalidam o plano anterior.
- A atualização de AGENTS.md reconhece títulos ATX com indentação/hashes finais e Setext, ignora títulos em fences e respeita o término da seção por títulos de nível 1 ou 2. Preserva texto, exemplos e CLAUDE.md; subseções reconhecidas duplicadas são recusadas. Não instala skills nem cria labels.
- As regras obrigatórias de .gitignore ficam depois das exceções do template, incluindo credenciais conhecidas e diretórios gerados. Exemplos .env.example/.env.*.example permanecem versionáveis. A renderização repetida conserva o resultado, sem acumular blocos.
- `tests/integration/scaffold.test.ts`: 13 regressões adicionais para colisões geradas, alteração/ausência de recurso após autorização, títulos Markdown, preservação e precedência das exclusões. Permanecem os testes de intenção anterior ao IO, baseline/cadastro na mesma branch, idempotência/CAS, falhas parciais, rollback SQL, restart e HTTP protegido. `README.md` registra as regras adicionais.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit` | Exit 0; TypeScript strict. |
| `node scripts/check-boundaries.mjs` | Exit 0; fronteiras e convenções. |
| `node node_modules/vitest/vitest.mjs run tests/integration/scaffold.test.ts --reporter=dot --no-color` | Exit 0; 40 testes focados. |
| `node node_modules/vitest/vitest.mjs run --reporter=dot --no-color` | Exit 0; 763 testes em 48 arquivos. |
| Build configurado: tsc de produção → copy-resources → Vite | Três exits 0; recursos e web distribuídos. Permanecem avisos existentes de React/esbuild e optimizeDeps. |
| Recursos de templates: fonte × distribuição | Catálogo e três documentos idênticos byte a byte. |
| Loader/renderizador compilados em processo Node nativo com cwd em .cache | Exit 0; catálogo factory.engineering v1 e seis arquivos renderizados com triagem, resolvidos pela instalação. |

Execução dos scripts por processos Node sem shell, conforme os equivalentes configurados. A primeira rodada focada recusou corretamente dois comandos de teste com um campo extra; as fixtures passaram a enviar somente o DTO autorizado e a suíte foi repetida. Uma tentativa de importar o módulo compilado diretamente no REPL falhou pela resolução de #contracts daquele ambiente; a prova em processo Node nativo passou, sem alteração do produto.

### Limites

SQLite, filesystem e HTTP inject são reais; Git e canonicalização positiva são controlados nas fixtures. Nenhum Git/GH real foi executado: contexto elevado/keyring não está disponível, e mutações Git são proibidas nesta sessão. Baseline/ref/branch por Git real e percurso completo AC-02/05 no host autorizado permanecem sem prova; testes locais não concedem esse aceite. Não foram executados smokes HTTP/Maestri ou browser nesta rodada.

Nenhuma dependência instalada, setup no workspace, provider, recrutamento, remoto, commit ou push real. Nenhuma aprovação, Design Lock ou mudança de fase. A revisão automática rejeitou a leitura opcional da memória privada externa como fora do escopo; seu conteúdo não foi usado e o trabalho prosseguiu pelas fontes locais.

## Sprint 027 - Plano de scaffold e criação somente local [CONCLUIDA]
- Catálogo versionado e configuração de engenharia: Disponibilizar templates e os apontadores previstos pela referência de scaffold.
- Plano sem efeitos e revalidação do destino: Implementar POST /scaffold/plans e os gates anteriores à criação.
- Criação local com baseline e cadastro: Implementar intenção, execução e consulta de criação somente local.

## Sprint — Scaffold remoto e criação parcial reconciliável [IMPLEMENTADA; VALIDAÇÃO TÉCNICA LOCAL CONCLUÍDA; INTEGRAÇÃO REAL PENDENTE]

Data: 2026-10-17. Continuidade no repositório canônico, completando a base parcial de contratos, journal e migration 017 encontrada no workspace. Alterações existentes preservadas. Nenhuma dependência instalada, comando Git/GH, remoto, baseline/push real, provider ou agente executado. Nenhum commit, aprovação ou mudança de fase.

### Fontes e critérios

- `AGENTS.md`, `SPEC.md` §§3.2/6.1/8/10.2–10.3, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` §§1–3/5 e SPEC derivada §§2.1/3.2. Cobertura pretendida RF-09/10/13/77/78 e AC-02/03/12; sem aceite presumido pela presença do código.
- Referência local `setup-matt-pocock-skills/SKILL.md` e seus documentos GitHub/domain/triage consultados para manter o scaffold normativo existente. Setup não executado e instruções geradas não foram redesenhadas.
- Context7: resolução e consultas de GitHub GraphQL (`CreateRepositoryInput`, owner/visibilidade/clientMutationId), Git (refspec explícito e leitura remota) e better-sqlite3 (transações síncronas/IMMEDIATE/rollback). Nenhuma atualização de pacote. Catálogo GitNexus consultado: não inclui este repositório; nenhum grafo do legado foi usado.
- Prova definida antes da edição: adapters Git/GitHub controlados; SQLite/HTTP/filesystem locais para journal, CAS/idempotência/recuperação e migração; typecheck/lint/build configurados. Essas provas permanecem sem execução nesta rodada, conforme bloqueio abaixo.

### Alterações

| Superfície | Implementação em código |
| --- | --- |
| Plano e execução | `projects/scaffold.ts` aceita as três modalidades, inclui owner/nome/visibilidade/efeitos no hash e revalida conta/configuração/recursos antes dos efeitos. A criação local existente precede remoto → origin → push opcional → cadastro. |
| Repositório GitHub | `github/scaffold.ts` consulta todas as páginas pertinentes do owner, recusa nome existente e cria somente o alvo autorizado. Confirma ID, owner, nome, visibilidade, URL, data e marcador de criação/operação; resposta perdida ou inesperada permanece unknown. Não cria Project/issue/agente. |
| Origin e baseline | `workspaces/remote-scaffold.ts` confere ownership, diretórios/Git próprios e SHA/ref/root commit. Somente remote_push envia um refspec SHA→branch-base, sem força/tags; confirmação depende da ref/SHA remota. Reconciliação só consulta. |
| Composição confiável | `ScaffoldAuthorization` delimita conta e targets por ownerId/nome/visibilidade/allowPush. `main.ts` a fornece aos dois adapters; não vem de HTTP/ambiente e não eleva o contexto de execução. |
| Journal e recuperação | API pública do storage compõe as operações parciais existentes de criação/reconciliação, projeção `scaffold.reconcile` e recibo/Location. Intenção e claim precedem mutação; confirmação SQL precede próximo efeito. Efeitos running interrompidos ficam unknown, sem reenvio. |
| Consulta/HTTP | GET creation acrescenta `remoteEffects` para efeitos confirmados, falhos, desconhecidos, não iniciados e não solicitados, com identidade/motivo. POST `/scaffold/creations/:creationId/reconcile` recebe `{}`, ETag e Idempotency-Key, com sessão/Origin/CSRF; contexto exclusivamente creation. |
| Migração e histórico | Integrada a migration 017 existente, com FK real de criação em effects e exatamente uma origem criação/tentativa. Fixtures históricas e expectativas foram ajustadas para schema 17; migrations 001–016 preservadas. |
| Documentação e regressões | README atualizado; novos testes em `github/scaffold.test.ts`, `workspaces/remote-scaffold.test.ts` e `tests/integration/remote-scaffold.test.ts`, além de fixture de schema histórico. |

O marcador local usa hash canônico do plano, independente da ordem de chaves JSON. A associação de origin e a reconciliação do push exigem nova observação da identidade do remoto criado. Efeitos conhecidos e arquivos permanecem após falha; reconciliação não cria remoto, não associa origin nem envia push. Se todos os efeitos já ocorreram e a configuração permanece compatível, pode concluir somente o cadastro SQL. Etapas ainda não executadas permanecem pendentes, sem sucesso integral.

### Validação e bloqueios

- A revisão automática **rejeitou** a tentativa de executar `node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit` via processo Node sem shell. Motivo informado: a regra explícita da sessão permite somente comandos que começam com `git`; a revisão considerou que o pedido de validação não supera essa proibição.
- Foi solicitada ao usuário uma exceção para typecheck, lint, testes locais e build. Até este registro, não houve resposta. Nenhum desses comandos foi executado ou declarado aprovado; não se tentou outro executor para contornar a rejeição. Os testes foram escritos e revisados manualmente, mas seus resultados e a compilação permanecem desconhecidos.
- A leitura opcional da memória externa também foi rejeitada pela revisão automática como conteúdo privado fora do escopo; ela não foi usada. As fontes locais sustentaram as alterações.
- Nenhum Git/GH real foi executado: o runtime não fornece o contexto elevado/keyring exigido e a sessão proíbe mutações Git. Não houve login alternativo, mudança de credenciais/ACL, inspeção visual ou alteração de UI.
- Integração real das três modalidades, criação e push em alvo autorizado, preservação por Git real, revisão independente e AC-02/03/12 integrais permanecem sem prova. A sprint não está declarada validada/concluída enquanto faltarem as checagens técnicas e as evidências pertinentes.

### Revalidação técnica desta rodada

Os bloqueios acima registram a rodada anterior à implementação da interface. Nesta revalidação, typecheck, lint, build e a suíte completa passaram; os resultados e a prova autorizada local desta rodada estão registrados na seção seguinte. Git/GitHub reais, agente, browser e efeitos externos continuam sem execução e pendentes.

## Sprint 028 - Scaffold remoto e criação parcial reconciliável [CONCLUIDA]
- Remoto sem push: Criar o remoto escolhido e associar origin sem publicar o baseline.
- Remoto com push do baseline: Publicar somente o baseline escolhido na branch-base do plano.
- Consulta e reconciliação de criação parcial: Completar GET creation e POST creation/reconcile.

## Sprint — Criação, plano e parcial na interface [IMPLEMENTADA; VALIDAÇÃO TÉCNICA LOCAL CONCLUÍDA]

Data: 2026-10-17. A criação local/remota foi conectada ao diálogo de criação existente na aba Projetos, preservando `app-shell` e `project-form` da referência. Nenhuma criação, efeito Git/GitHub, agente ou sessão foi iniciada durante a implementação.

### Implementação

- `apps/web/src/features/projects/ProjectCreationDialog.tsx` carrega opções reais, oferece exatamente as três modalidades, template, destino relativo, branch e triagem. Os campos de owner, nome remoto e visibilidade aparecem apenas nas modalidades remotas; sugestões derivadas do nome/conta não substituem campos editados. O payload local omite `remote`.
- O plano é consultado pelo endpoint existente e mostra destino, template/digest, arquivos/hashes/tamanhos, instruções de engenharia, branch, conta, modalidade e efeitos antes da confirmação única. Toda edição incrementa a identidade local da consulta e invalida plano e autorização; respostas de plano atrasadas são descartadas.
- A criação envia uma chave única e, após aceite, acompanha `GET /scaffold/creations/:creationId`. Timeout conserva somente o ID da operação em `sessionStorage`, oferece consulta de operação e não repete POST. Conclusão e estado parcial usam o diálogo existente; Abrir configuração navega ao projeto cadastrado e não inicia issue/sessão.
- Estados de criação exibem etapas locais e efeitos remotos com estado, identidade, recibo, falha/diagnóstico e pré-requisitos. Reconciliação envia o mesmo `creationId`, ETag atual e chave de operação; incerteza é consultada por `operationId`, sem replay.
- `packages/contracts/src/scaffold.ts` descreve identidades de efeitos de criação sem exigir IDs de issue, para a leitura parcial antes da confirmação remota.

### Evidência e limites

- Registro da prova local autorizada: baseline do repositório sob avaliação `3ab6c5b53752bf67c55f89f87ac83c522d74ac41`, branch `main`, ref `refs/heads/main`, sem remoto `origin` configurado. A árvore estava modificada antes desta validação; esse SHA identifica somente o baseline Git, não incorpora as alterações desta entrega.
- Nos contratos controlados de `tests/integration/remote-scaffold.test.ts`, o baseline produzido pela fixture é `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, ref `refs/heads/release/base`, e o origin esperado pelo adaptador falso é `https://github.com/test-org/different-name`. O teste consulta `attempts = 0`. Esses valores são evidência de contrato em fixture, não origin/ref/SHA de uma criação real.
- Nenhum agente, sessão Maestri/OMP ou provider foi iniciado nesta prova; nenhuma tentativa de execução foi criada. Não houve efeitos externos, criação de remoto ou push. O escopo autorizado e disponível foi validação técnica local; não há host, conta e alvos remotos configurados para executar as três modalidades com Git/GitHub reais.
- A observação visual Playwright/Chrome não foi executada nesta rodada. Renderização, teclado, contraste e responsividade permanecem pendentes. A referência `artifact.html` foi lida antes das alterações; IDs, shell, paleta e estrutura de diálogos foram mantidos, o que não substitui prova visual.
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run lint`: exit 0; fronteiras e convenções TypeScript aprovadas.
- `npm.cmd test -- --reporter=dot --no-color`: exit 0; 51 arquivos e 802 testes aprovados. A suíte usa adapters controlados para efeitos Git/GitHub e não inicia agentes/providers.
- `npm.cmd run build`: exit 0; compilação, cópia dos recursos e build Vite concluídos. Vite reportou avisos de depreciação existentes para opções do plugin React/optimizeDeps.
- `git diff --check`: sem erros.

Validação técnica local concluída; não equivale a execução de Git/GitHub reais. A execução das três modalidades no host/conta autorizados e a observação visual Playwright/Chrome permanecem pendentes. AC-02/03/27 não são declarados aceitos integralmente sem essas provas.

## Sprint 029 - Criação, plano e parcial na interface [CONCLUIDA]
- Escolhas reais de criação: Disponibilizar template, destino, branch e três modalidades.
- Plano autorizado e conclusão consultável: Conectar revisão do plano, confirmação única e acompanhamento da criação.
- Criação parcial e prova das modalidades: Apresentar recuperação contextual e registrar evidências da quarta fatia.

## Sprint — Operação, eventos e diagnóstico contextual [IMPLEMENTADA NO BACKEND; VALIDADA LOCALMENTE]

Data: 2026-10-17. Implementação no repositório canônico, preservando o histórico e as alterações existentes. Sem dependências novas, comandos Git/GH, providers, recrutamento, publicação ou mudanças de credenciais/ACLs. Não representa aprovação, Design Lock ou mudança de fase.

### Fontes e cobertura

- AGENTS.md; SPEC.md §§8/10.2, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md §§2–5; SPEC derivada `docs/Docs20261016_073031/SPEC20261016_073031.md` §§3.2–3.3 e contrato HTTP. Cobertura RF-81/82/86–88; US-18/20 nas superfícies backend desta tarefa.
- Provas definidas antes das edições: snapshots/cursores SQLite consistentes; HTTP protegido; replay sem lacuna/duplicação; filtros/vínculos; intenção e recibo anteriores ao IO; CAS de contexto, idempotência, rollback/busy, restart e ausência de efeitos pagos/remotos. Integração externa e browser não são inferidos dessas provas.
- Skill Context7 aplicada com resolução e consultas de better-sqlite3 (transações síncronas/snapshot/IMMEDIATE), Fastify (streams/preClose) e Node 24 (Readable/AbortSignal/backpressure). Mantidas as versões do lockfile. Catálogo GitNexus consultado: este repositório não está indexado; nenhum grafo do legado foi usado.

### Entregáveis e comportamento

| Superfície | Implementação |
| --- | --- |
| Contratos | `packages/contracts/src/operation.ts` e exports públicos: resumo, contextos discriminados, checks fechados, relatórios e diagnóstico com code/cause/affectedRequirements/facts/recovery/timestamp. `base.ts` amplia eventos/filtros sem payload de conteúdo. |
| Resumo | `storage/operation-summary.ts`, `queries/index.ts`, `http/routes/operation.ts`: GET `/api/v1/operation?projectId?` com conta/host/automação/pausa, tentativa ativa/contagem, cinco candidatos observados, cinco resultados recentes, impedimentos e observação da integração nativa. Projeções e eventCursor na mesma transação de leitura, sem IO remoto ou documentos completos. |
| Próximos candidatos | `storage/queue-cycles.ts` registra somente elegibilidade e ordem efetivamente observadas pelo scheduler. Campos históricos começam NULL, sem inferir autoridade de Ready antigo. O resumo informa observação anterior/revalidação obrigatória; configuração/consumo continuam pertencendo aos serviços existentes da fila. |
| Registros | `storage/events.ts` e `http/routes/events.ts`: filtros combinados projectId/attemptId/operationId com validação de vínculos e escopo de conta. Cursor opaco vincula filtros/ordem/teto observado; novos eventos não entram na continuação antiga. Seleção explícita de colunas leves, facts vazio sanitizado. |
| Stream | SSE mantém sequência durável e Last-Event-ID prevalente; cursor inválido/desconhecido recebe resync. Replay estritamente após a sequência evita duplicatas. Preservados limites de 8 streams/processo, 2/sessão, buffer 16 KiB, polling 1 s e duração 60 s, com aborto/liberação em revogação/desconexão/shutdown. Nenhum desses eventos cancela negócio, repete POST ou restaura autoridade. |
| Verificação contextual | `modules/diagnostics/index.ts`: GET existente somente de leitura; POST com contexto na query e `{checks:[...]}`. Host/project suportam configuration/github_identity/maestri_context; creation suporta configuration/github_identity/resources; attempt suporta os quatro. Usa serviços públicos existentes, sem port de shell/mutação/recrutamento. Até oito verificações/processo e uma pendente/contexto. |
| Durabilidade | `storage/diagnostics.ts`, projeção em `operations.ts` e migration nova `018_context_diagnostics.sql`: intenção/vínculos/recibo/evento atômicos antes do IO; resultado/evento atômicos ao concluir. FKs/guards/índices, idempotência antes de novo IO, mudança de contexto recusada e restart unknown/DIAGNOSTIC_INTERRUPTED sem replay. Migrations 001–017 preservadas. |
| Composição | `http/app.ts` e `main.ts` fornecem o mesmo executor confiável ao diagnóstico. Contexto ausente recebe diagnóstico; não há discovery de credenciais, adoção de terminal ou alteração de autoridade. |

`succeeded` na operação de diagnóstico confirma consulta terminada/persistida, inclusive quando seu relatório informa blocked/unavailable. Configuration diferencia aviso de dirty de impedimento; Resources consulta ownership/etapas/acompanhamento registrados e explicita que isso não comprova parada física, integridade de arquivos ou acesso remoto. Maestri_context executa somente preflight não pago; sua observação não prova trabalho de provider/MCP. GET mantém relatórios anteriores separados dos fatos locais atuais.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, produção/contratos/testes/scripts, sem any/supressões. |
| `npm.cmd run lint` | Exit 0; fronteiras, SQL privado e convenções. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **819 testes em 52 arquivos**. Suíte sem rede/providers/subprocessos de produto reais. |
| Testes focados finais | Exit 0; **17 testes** de operação/diagnóstico após reutilizar a projeção corrente de tracking da tentativa. A rodada anterior focada de diagnóstico/scheduler/ciclos passou em 39 testes. |
| `npm.cmd run build` | Exit 0; controlador/declarations, migration 018, recursos e web distribuídos. Permanecem avisos existentes React/esbuild/optimizeDeps e chunk acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, bootstrap/CAS/idempotência, catálogo distribuído, resumo/diagnóstico, replay após snapshot com Last-Event-ID prevalente, shutdown e lock entre processos. Contexto externo ausente permanece diagnosticado. |

Testes novos cobrem instalação sem dados demonstrativos, GET sem escrita/IO externo, intenção anterior à observação, comando repetido inclusive com ordem diferente de checks, contexto/conta alterados, checks/IDs/CSRF inválidos, vínculos host/projeto/criação/tentativa, SQL busy/rollback de intenção/conclusão, recibo sem replay, histórico protegido, restart, snapshot/replay/deduplicação, teto estável com eventos novos, candidatos somente por elegibilidade/ordem registradas e migração SQLite real 17→18 sem reseed/observações inventadas. Testes históricos foram adaptados à versão nova; sua reconstrução remove somente o schema novo em bancos temporários.

A primeira suíte completa expôs encerramento após storage já fechado em fixtures históricas; `interruptDiagnostics` passou a respeitar fechamento idempotente, seguindo o padrão existente. Uma fixture de ciclos precisou declarar as duas colunas novas. Após as correções, a suíte completa passou; nenhum gate de produção foi relaxado. A comparação histórica AC-29 com cache ignored de 16 MiB conservou banco/WAL/payloads iguais antes/depois sob Git controlado.

### Limites de prova

- GitHub, Maestri/OMP e executor são controlados na suíte. O smoke compilado comprova transporte HTTP/SSE/SQLite e diagnóstico real de contexto indisponível; não comprova consulta autenticada GitHub, TUI, provider, MCP ou parada física no host autorizado.
- Nenhuma interface foi alterada ou inspecionada visualmente. Consumo web de `/operation`, registros, stream e diagnóstico permanece na fatia frontend; abrir SSE não implica aceite visual ou atualização da UI já existente.
- Nenhum Git/GH foi executado: o contexto elevado/keyring exigido não está disponível. Sem status/diff Git atestado, commit/push, login alternativo ou alteração de credencial/ACL. As pendências preexistentes de composição/vínculo inicial de conta não foram contornadas por dados demonstrativos.

## Sprint 030 - Operação, eventos e diagnóstico contextual [CONCLUIDA]
- Resumo operacional e eventos paginados: Implementar GET /operation e GET /events com projeções leves.
- SSE com recuperação sem efeitos: Implementar GET /events/stream e recuperação por sequência.
- Diagnóstico e verificações delimitadas: Implementar GET/POST /diagnostics por contexto discriminado.

## Sprint — Dashboard, registros e atualização estável [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PASSOU; VISUAL PENDENTE]

Data: 2026-10-17. Frontend conectado às projeções e operações existentes. Preservados o shell, `principal`, `app-shell`, `attempt-detail` e `project-form` de `docs/Docs20261016_073031/design/artifact.html`. Sem mudanças em contratos de domínio ou dependências.

### Entregáveis e consumidores

| Arquivo/superfície | Resultado |
| --- | --- |
| `apps/web/src/features/operations/useOperation.ts`, `useActiveAttempt.ts` | Leituras independentes de `/operation` e `/attempts?result=active`; polling/SSE, estados de carga/atualização/erro/vazio e dados anteriores marcados até confirmação da leitura nova. |
| `apps/web/src/features/operations/DashboardPanel.tsx` | Conta, login/ID, host designado/observado, automação, status Maestri nativo, tentativa ativa, candidatos elegíveis, resultados, impedimentos e projetos recentes. A fila tem estado/read independente da tentativa; atalhos abrem fila, preparação, histórico ou detalhe existente. Nenhum valor demonstrativo/Wire é mostrado como observação. |
| `apps/web/src/features/records/useRecords.ts`, `RecordsPanel.tsx` | `GET /events` com filtros persistidos na rota por projeto/tentativa/operação, paginação e retry. Consulta sem eventos, filtro sem correspondência, resultado indeterminado por falha da consulta-base e erro de página são estados distintos; continuação falha mantém página e eventos anteriores. |
| `apps/web/src/features/records/useDiagnostics.ts` | Leitura e POST de diagnóstico com contexto `host/project/creation/attempt`, enum de checks suportados, polling apenas por GET da operação aceita e sem replay de POST. Relatórios mostram causa/estado, requisitos, fatos, operationId/recibo, horários e recuperação. Diagnóstico anterior fica explicitamente anterior durante execução/erro. |
| `apps/web/src/app/useControllerEvents.ts`, `apps/controller/src/http/routes/events.ts` | Uma assinatura por `AppShell`, iniciada a partir do cursor atual; deduplica pelo `seq`, deixa `EventSource` gerir reconexão e atualiza leituras pertinentes em evento/resync. O servidor preserva eventos nomeados existentes e acrescenta o alias genérico `controller-event` com `eventType` no payload, evitando catálogo fechado no cliente. SSE não anuncia evento por evento e não repete mutações. |
| `apps/web/src/app/useDialogs.ts`, `AppShell.tsx`, `hash-route.ts`, `PrincipalScreen.tsx` | `useDialogs` concentra sincronização por hash; filtro `operationId` passa a ser contexto permitido. Dashboard/Registros substituem amostras/consulta local por projeções e rotas existentes. Rodapé abre Registros e diagnóstico. |
| `apps/web/src/features/attempts/AttemptDetailDialog.tsx`, `features/queue/useQueue.ts`, `features/queue/QueuePanel.tsx` | Eventos/resync atualizam tentativa e fila sem mudar seleção. Páginas de detalhe permanecem visíveis durante polling e falha; última falha da fila fica visível durante nova consulta. Atalho abre Registros no contexto da tentativa. |
| `apps/web/src/features/projects/useConfiguration.ts`, `features/projects/ProjectForm.tsx` | SSE atualiza somente settings ou projeto selecionado. Rascunho, foco e tela permanecem montados; falha da atualização fica no formulário até leitura bem-sucedida/dispensa, sem limpar estado de gravação. Incluído atalho de diagnóstico do projeto. |
| `apps/web/src/app/styles/artifact.css` | Grades e estados responsivos seguindo tokens, tipografia, paleta, cards, breakpoints 950/650 px e controles já aprovados. Conta/host permanecem disponíveis no layout estreito. |

### Validação e limites

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd run build` | Exit 0 na validação final; controlador/declarations, recursos e bundle web. Permanecem avisos do plugin React/esbuild e optimizeDeps e aviso de chunk acima de 500 kB; JS 717,83 kB minificado. |
| Inspeção de navegador | Pendente: inventário CUA não ofereceu browser e criação da aba IAB respondeu `Browser is not available: iab`. O servidor local foi encerrado após a tentativa; não houve inspeção visual/teclado/mobile. |

Não foram executados testes automatizados. Os três checks técnicos passaram após as alterações finais; eles não comprovam comportamento renderizado, teclado/scroll, fetch/SSE no navegador nem integração GitHub/Maestri/OMP. A skill local `codebase-design` foi lida; os nomes de skills de design solicitados não estavam carregados/disponíveis nesta sessão. Design Lock, aceite visual e critérios AC/INT integrais não são declarados concluídos por compilação. Nenhuma chamada GitHub/Maestri, provider, mutação remota, commit/push, aprovação ou mudança de fase ocorreu.

## Sprint — Prova de persistência e manutenção modular [IMPLEMENTADA; VALIDAÇÃO E GIT REAL PENDENTES]

Data: 2026-10-17. Trabalho no repositório canônico, preservando os ensaios e alterações existentes. Fontes: AGENTS.md, SPEC §§8/10 e AC-28/29, SPEC derivada §§2.1/3.1, RNF-01/11/15/16/24, GLOSSARY e contrato de retenção/INT-18 da integração. Context7 consultado com resolução anterior às consultas de Node 24 (spawn/close/pipes) e TypeScript (AST). Não houve instalação de dependências ou alteração de código de produção, migrations, lifecycle ou UI.

### Alterações

- Reutilizados os ensaios existentes `persistence-maintenance.test.ts`, `persistence-audit.test.ts`, `execution-composition.test.ts`, helper de medição e `maintenance.proof.ts`. Eles ainda não foram executados nesta rodada; sua presença não é resultado de validação.
- A medição de 0/16/64 MiB agora inclui uma seção paginada de checks, confere crescimento operacional igual à massa gerada, recusa auxiliares inesperados e calcula a mediana par pela média dos valores centrais. O relatório inclui tentativa/delivery/ref/tree/base. A recuperação fecha também a conexão SQLite de inspeção antes de reabrir storage; permanece close/reopen no mesmo processo.
- `scripts/check-boundaries.mjs` acrescenta detecção de exec/execSync, aliases, acesso por colchetes, wrappers literais e módulos Node sem prefixo na UI. Regressões em `tests/boundaries.test.ts`. A regra continua estática, sem prometer análise arbitrária de shell/fluxo de dados ou sandbox.
- Novo comando `proof:persistence`, em `scripts/persistence-proof.mjs`: executa sequencialmente os arquivos de `test:persistence` e a prova nativa local. Só depois de sucesso produz JSON/Markdown em `.cache/persistence-proof-<id>`, com tamanho/payload/latência/identidades/diagnósticos e hashes selecionados. Saída limitada, prazo finito, sem shell/Git/GH/provider; não arquiva ambiente ou logs brutos. `persistence-report.test.ts` cobre observação ausente, inválida e duplicada. O comando ainda não foi executado, portanto não há medições novas ou relatório gerado nesta rodada.
- README e `docs/integration/persistence-maintenance/README.md` registram reprodução, metodologia, limites da auditoria por fingerprints e roteiro real pendente. Banco/WAL/SHM/evidências/auxiliares ficam separados de work e Git operacional. Eventos legítimos da remoção ficam fora da comparação de caches; não foi inventado SLA nem requisito geral de variação zero do SQLite.

### Validação e limites

| Validação | Resultado desta rodada |
| --- | --- |
| Typecheck, lint, testes e build | Não executados; aguardando exceção explícita à regra da sessão que proíbe comandos que não comecem com git |
| `proof:persistence` / prova nativa | Não executados; mesmas restrições |
| Recuperação com Git/objetos reais após encerramento de processos | Pendente; mutações Git proibidas sem exceção e contexto elevado/keyring indisponível |

Foi solicitada ao usuário autorização específica para os comandos locais de validação, pois o pedido exige esses checks e simultaneamente proíbe comandos diferentes de git. Não houve resposta até este registro. Não se tentou compilação/teste por outro executor para contornar a restrição. Nenhum resultado histórico foi apresentado como resultado desta rodada.

O ensaio disponível usa SQLite/filesystem/HTTP inject reais, mas Git/GitHub/executor/runner/canonicalização controlados. O teste nativo implementado usa dois processos Node e materialização controlada; não foi executado nesta rodada. Recibos de parada no ensaio de recuperação são de terminais simulados. Assim, AC-29 integral, encerramento físico/restart de controlador e recuperação por objetos Git reais não estão comprovados. Não há anúncio de outro executor de produção, backup/restore ou suporte novo a provider.

A revisão automática rejeitou a leitura opcional da memória externa por considerá-la privada e fora do escopo; seu conteúdo não foi usado. O trabalho prosseguiu pelas fontes locais. Nenhum Git/GH, efeito remoto, provider, agente, commit/push, aprovação ou mudança de fase foi executado.

## Sprint 032 - Prova de persistência e manutenção modular [CONCLUIDA]
- Medição antes e depois de caches volumosos: Disponibilizar ensaio reproduzível AC-29 sobre o produto implementado.
- Recuperação Git e integridade após remoção: Comprovar retenção da versão e de evidências pertinentes sem snapshots auxiliares.
- Fronteiras e extensibilidade verificáveis: Conferir a arquitetura implementada contra AC-28.

## Sprint — Inicialização distribuível e operação documentada [IMPLEMENTADA; VALIDAÇÃO PENDENTE]

Data: 2026-10-17. Alterações no repositório canônico, sem instalar dependências, executar Git/GH, providers, recrutamento, publicação ou efeitos remotos. Histórico preservado; nenhuma aprovação, Design Lock ou fase foi simulada.

### Fontes e prova definida antes das alterações

- AGENTS.md; SPEC.md §§8–11 e AC-18/21/24/25; INTEGRACAO-MAESTRI-OMP.md §§1–6; GLOSSARY.md; SPEC derivada §§3.3/3.5/5.1/5.3. Escopo RNF-14/16/21–23, sem novo executor, instalador de infraestrutura, túnel ou serviço distribuído.
- Context7 consultado após resolução para Node 24 (recursos ESM e package imports) e Fastify (preClose/onClose e fechamento de conexões). O grafo GitNexus não contém este repositório; os arquivos atuais foram a referência.
- Provas preparadas: testes SQLite/inject para ordem do startup, ausência de worker/HTTP antes do pré-voo, lock durante observação, diagnóstico, falha de bind e sessões/recibos após restart; testes de encerramento de espera e limpeza após falha; smoke nativo da distribuição com pré-voo controlado, sem Maestri/Git/GitHub. Nenhuma dessas provas foi executada nesta rodada.

### Implementação

| Superfície | Alteração |
| --- | --- |
| Composição | `scripts/start-host.mjs`, selecionado por `npm start`: recebe cinco paths EXE absolutos (Git/GH/Maestri/OMP/PowerShell) do operador e usa somente ambiente realmente herdado. Não procura PATH, não eleva processo e não fornece autorização remota irrestrita. Paths não são credenciais nem autoridade proveniente da API. |
| Startup | `main.ts`: configuração → lock → migrations/configuração → papéis → pré-voo nativo não pago → validação de templates → scheduler/HTTP. Contexto ausente/stale falha antes de worker/listen. Falha de composição fecha executor/pipeline, storage e lock. Sinais registrados antes de listen. `startController` preserva composição confiável por código; seam de fábrica de executor é exclusiva de composição de testes, sem flag CLI/ambiente. |
| Shutdown | `http/app.ts` revoga os coordenadores em conjunto antes de aguardar IO; registra falha sanitizada/status de processo e permite concluir cleanup. Pipeline fecha canais/esperas antes de aguardar pendências. Adapter compartilha promessa de close, trata todas as passagens e remove bootstrap mesmo se canal falhar. Mantidos histórico, diagnóstico e distinção de parada física. |
| Pacote | `package:local` faz build + `package-distribution.mjs`, que gera pasta exclusiva em build com dist, bundle, SQL, papéis/templates, contratos compilados, launcher, dependências de produção do lockfile e documentos/exemplo selecionados. Recusa links/recursos especiais e dependência obrigatória ausente. Não inclui .env, dados, caches, fontes do workspace ou skills pessoais. `distribution.json` identifica SO/arquitetura/ABI; Node 24 e ferramentas nativas são pré-requisitos externos. O pacote ainda não foi gerado/exercitado. |
| Portabilidade | `test:distribution`/`smoke-distribution.mjs`: preparado para importar exclusivamente o pacote em raiz com espaços/Unicode e cwd alheio, servir assets/API loopback, usar SQLite nativo e testar restart/sessão/identidade. Pré-voo explicitamente controlado; não é prova de Maestri real. Arquivos parciais/de teste são preservados para diagnóstico. |
| Regressões | `tests/integration/startup.test.ts` e novos casos em `execution.test.ts`; `tests/native/controller-fixture.mjs` torna explícito o pré-voo controlado do smoke HTTP histórico. O smoke não pode mais chamar o entrypoint sem contexto e presumir inicialização de produção válida. |
| Manual | `docs/operation/README.md`, README raiz e roteiro first-slice: instalação/atualização/shutdown, bootstrap/host/perfis, comandos existentes, opt-in externo/visual e recuperação de conflitos, resposta incerta, captura, parada, retry, publicação, scaffold parcial e handoff. `.env.example` foi conferido e conserva exatamente as seis opções não sensíveis normativas. |

### Validação e limites

Typecheck, lint, testes, build e smokes **não executados** nesta rodada. A instrução da sessão proíbe qualquer comando que não comece com git, embora também solicite esses checks. Foi solicitada exceção explícita para leitura e validação local; até este registro não houve resposta. Leituras pertinentes foram feitas pelo filesystem do REPL, edições por apply_patch; não houve tentativa de compilar/testar por executor alternativo para contornar a restrição. Não há resultado técnico novo, pacote produzido ou aceite de portabilidade declarado.

Pré-voo/TUI/ownership/UTF-8 com Maestri real, Git/GitHub/keyring e aceite visual permanecem sem prova. Testes escritos e comandos registrados não comprovam AC/INT integrais. O launcher declara contexto confiável sem elevar/provar keyring; autorizações de publicação/scaffold e callbacks de abertura/parada dependem da composição confiável delimitada. Vínculo inicial da conta (PF-06) continua bloqueio preexistente: nenhuma conta demonstrativa ou seed SQL foi acrescentada. O manual explicita esse limite e não anuncia instalação nova apta a despachar antes de resolvê-lo.

A revisão automática bloqueou leituras opcionais da memória e da skill Context7 fora do repositório como conteúdo privado externo. Esses arquivos não foram usados; foram seguidas as fontes locais e as instruções Context7 do AGENTS com consultas MCP. Nenhuma credencial/ACL foi alterada, nenhuma dependência foi instalada e nenhum commit/push foi executado.

## Correção — Assets públicos na distribuição [VALIDAÇÃO TÉCNICA PASSOU]

Data: 2026-10-17. Correção do `401 SESSION_REQUIRED` na página inicial apontado pelo Evaluator. Fontes: SPEC §§8.5/10.2 e AC-02/18/21/24/25, integração Maestri/OMP, GLOSSARY e manual de operação. Context7 consultado para Fastify e `@fastify/static`, após resolução dos IDs. Nenhuma dependência instalada ou comando Git/GH executado.

### Causa e correção

O hook global exigia sessão antes de entregar HTML/JS/CSS, impedindo o próprio cliente de iniciar o bootstrap. `http/assets.ts` concentra o registro estático, enumera somente arquivos presentes no cliente compilado (`wildcard: false`) e marca suas rotas por configuração interna do servidor. `security/index.ts` dispensa sessão somente para GET/HEAD dessas rotas; mantém Host/Origin exatos, limites de requisições, proteção de API/SSE e JSON/Origin/CSRF nas mutações. Navegação direta com `Sec-Fetch-Site: none` é permitida somente para arquivos públicos. Headers finais de cache são aplicados no contexto estático: HTML `no-store`, assets imutáveis, erros sem cache público.

`tests/integration/static-assets.test.ts` reproduziu o defeito antes da correção (cinco falhas com 401 no lugar de 200). Os onze casos finais cobrem HTML/JS/CSS por GET/HEAD antes da sessão, ausência de bootstrap implícito/CORS, navegação direta, Host/Origin/Fetch-Site inválidos, API/SSE e rotas desconhecidas protegidas, mutação sem sessão recusada, bootstrap seguido de consulta autenticada e arquivo oculto inacessível. `test:distribution` agora verifica também CSS, HEAD, cache, navegação inicial e API protegida antes do bootstrap, usando HTTP e SQLite nativos no pacote relocado. O manual documenta essa fronteira.

### Evidência desta rodada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 58 arquivos, 872 testes passaram |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle gerados |
| `npm.cmd run test:distribution` | Exit 0; pacote `build/Fábrica distribuição-Byo7Cd`, cwd independente, assets/API na mesma origem loopback, SQLite nativo, identidade preservada e sessão anterior recusada após restart |

Os avisos existentes de depreciação do plugin React/Vite e chunk acima de 500 kB permanecem. As fontes de empacotamento, exemplo de ambiente e manual foram conferidas: migrations/contratos/papéis/templates são resolvidos pela instalação, as seis opções de `.env.example` não contêm segredos, e os procedimentos/limites operacionais solicitados permanecem documentados. A suíte inclui as regressões de startup antes de scheduler, lock/migrations/configuração, shutdown de canais/esperas e restart sem retomada de agentes.

O pré-voo do smoke é **controlado**, sem flag de produção para contorná-lo. Esta rodada não prova integração real Maestri/OMP/GitHub, TUI, keyring ou aceite visual. Não altera o gate preexistente de vínculo inicial de conta (PF-06), nem declara aprovação do pipeline ou aceite integral AC/INT. A revisão automática bloqueou a leitura opcional da memória externa como acesso privado desnecessário; seu conteúdo não foi usado e o trabalho prosseguiu pelas fontes do repositório.

## Sprint 033 - Inicialização distribuível e operação documentada [CONCLUIDA]
- Pacote autocontido e configuração de bootstrap: Disponibilizar a aplicação compilada com bundle, migrations e recursos distribuídos.
- Inicialização e encerramento coerentes: Completar o ciclo de vida de produção pelo terminal-âncora.
- Manual de operação e recuperação: Documentar os procedimentos reais e limites da primeira entrega.

## Sprint — Aceite transversal e revisão da versão entregue [IMPLEMENTADA; ACEITES VISUAL/EXTERNO PENDENTES]

Data: 2026-10-17. Fontes: `AGENTS.md`, `SPEC.md` §§4.1, 4.7, 9, 10.2–10.3; `INTEGRACAO-MAESTRI-OMP.md` §8; `GLOSSARY.md`; SPEC derivada §§4.5/4.7/5.2; matriz de stories; `docs/Docs20261016_073031/design/artifact.html` lido antes de avaliar UI. C-02 continua sendo o contrato para remover Login/Sair e abrir a Principal.

### Evidência e estado

- `docs/integration/acceptance-transversal/coverage-matrix.md` relaciona as famílias US-01–20, RF-01–88, RNF-01–25 e cada AC-01–29/INT-01–18 a código, testes e evidências atuais, distinguindo prova local de integração externa pendente. `visual-evidence.md` e `independent-review.md` preservam bloqueios desta rodada sem sobrescrever resultados anteriores.
- Typecheck (`npm.cmd run typecheck`), lint (`npm.cmd run lint`), suíte completa (`npm.cmd test -- --reporter=dot --no-color`: 872 testes/58 arquivos) e build (`npm.cmd run build`) concluíram com exit 0. A suíte usa adapters controlados para serviços externos; o build manteve avisos existentes de depreciação React/Vite e bundle acima de 500 kB.
- A chamada Playwright MCP para listar abas foi recusada pelo gate automático (`MCP tool call requires approval, but approval policy is never`). O inventário CUA retornou `browsers: []`. Nenhum navegador foi iniciado, perfil pessoal usado ou screenshot histórico promovido. AC-27, INT-11 e RNF-17–19 seguem pendentes; foco, teclado, nomes acessíveis, contraste, zoom, viewports e jornadas visuais não foram medidos.
- A inspeção estática não encontrou controles/telas Login/Sair no cliente; `#login` é somente alias de rota normalizado para Principal. Essa observação não comprova ausência de corte/sobreposição no browser.
- A matriz de segurança referencia os testes HTTP de sessão/Origin/CSRF/SSE, idempotência/CAS, restart, marcadores sintéticos, resposta incerta, conflito, capacidades, pergunta expirada/concorrente e paginação por seção. As provas locais passaram nesta rodada; interações visuais entre abas e efeitos Maestri/GitHub reais continuam pendentes.
- A revisão final vinculada a uma referência Git imutável permanece pendente. `AGENTS.md` exige contexto elevado com keyring para Git; o runtime não o disponibiliza. Nenhum Git/GH foi executado, não foi identificado SHA imutável desta versão e não foi alterado o estado Git.

Não há aceite integral, aprovação de pipeline, Design Lock ou mudança de fase declarados. Nenhuma regressão de produto foi reproduzida; por isso esta rodada não alterou código de UI nem contratos. Os próximos aceites exigem ferramenta Playwright MCP/Chrome liberada e contexto Git autorizado para identificar/revisar a versão entregue, além das provas reais explicitadas na matriz.

## Pacote Configuração inicial — Posição 1, sprint-001 — Fundação de persistência e compatibilidade [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: posição exibida 1, índice 0, ID `sprint-001`, título **Fundação de persistência e compatibilidade**. Trabalho no repositório canônico, preservando o histórico e as alterações existentes.

### Fontes, escopo e acesso efetivo

- Contrato dos deltas: `docs/Docs20261017_233303/SPEC20261017_233303.md` §2.1/2.3/2.4; features feat-001/002/003, US-04/06/10/18 e RNF-02/12/17/18. Consultados AGENTS.md, SPEC.md §8.4/8.5, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e FEEDBACK-PROXIMO-PACOTE.md. A sprint prepara fatos privados e identidade de operação; wizard, comandos bind/switch, remoção de campos legados e evolução de perfis pertencem às próximas fatias.
- Antes da edição, este Implementador leu efetivamente AGENTS.md, a SPEC da feature, package.json, runner, seed e operações pelo filesystem do Node REPL em UTF-8. Executou no mesmo contexto um check de contagem/sequência das 18 migrations e capturou seus SHA-256: passou em 2026-10-18T05:08:25.651Z. Esse check de fontes não foi apresentado como compilação ou execução SQLite. Após a implementação, os checks configurados abaixo foram realmente executados e aguardados.
- Runtime dos checks: Node v24.22.0, better-sqlite3 **13.0.3**, SQLite **3.53.4**, cwd `C:\Users\jeffe\Documents\Apps\nova-fabrica-software`; observação nativa às 2026-10-18T05:11:29.606Z. Context7 consultado com resolução e consulta de better-sqlite3 para DDL/transações síncronas IMMEDIATE/rollback; versões efetivas conferidas na dependência instalada, sem atualização ou instalação.
- A avaliação independente futura deve registrar sua própria leitura/check e versão avaliada; este registro não atesta o contexto de outro responsável. Repo-graph não está exposto entre as ferramentas desta sessão; arquivos atuais foram a fonte de navegação. Nenhuma chamada Git/GH foi executada: contexto elevado/keyring indisponível. Não há SHA/ref imutável desta entrega atestado.

### Alterações e interfaces

| Superfície | Resultado |
| --- | --- |
| Migration nova | `storage/migrations/019_initial_configuration_facts.sql`, schema final desta sprint **19**. Os bytes e checksums das migrations 001–018 permanecem iguais ao check anterior à edição e estão cobertos por regressão com os 18 digests explícitos. |
| Singleton | Acrescentados onboarding_suppressed NOT NULL DEFAULT 0, onboarding_completed_at_ms nullable >=0, projects_root_confirmed_at_ms nullable condicionado à raiz não nula e timestamp >=0, gh_executable_path nullable com trim não vazio. Sem tabela de onboarding ou fatos de etapa/contagem/prontidão. |
| Conclusão | `onboarding_completion_immutable` recusa substituir ou anular conclusão não nula, inclusive timestamp zero; permite repetir o mesmo valor. `onboarding_completion_delete_immutable` também recusa apagar o singleton concluído. Supressão continua independente. |
| Operações | result_account_id nullable com FK RESTRICT para accounts e CHECK de bind/switch/settings/local; demais tipos exigem destino nulo. O trigger operation_identity_immutable conserva os oito campos anteriores e acrescenta o destino. Origem nula permanece nula. Nenhuma exceção de consulta entre contas ou endpoint de vínculo foi antecipado. |
| Runner | `loadMigrations` conhece a sequência até 019, registrando nome/SHA-256/timestamp reais. `inspectHistory` valida configuração existente e foreign_key_check ainda na sondagem readonly e repete sob a transação IMMEDIATE, antes dos deltas. Erro não abre a instalação como vazia. `applyMigrations` mantém rollback integral. |
| Seed e APIs | `seedSettings` conserva o seed existente; defaults SQL aplicam supressão falsa e os três fatos nulos. Conta/raiz ausentes, automação desligada e nenhum perfil/projeto/tentativa semeado. Interfaces públicas `Storage`, `StoredOperation`, `getSettings` e contratos HTTP permanecem iguais: os novos fatos são privados nesta fatia. |
| Testes históricos | Expectativas de versão passaram a 19. `tests/fixtures/initial-configuration-schema.ts`, chamado na cadeia histórica de fixtures, retira somente o delta 019 dos bancos temporários para reconstruir versões anteriores; não é código de produção/downgrade da instalação. |

A migration usa apenas ALTER TABLE ADD COLUMN e criação/substituição delimitada de triggers suportados pela dependência fixada. Não edita sqlite_schema, não recria tabelas nem inventa classificação/backfill para perfis antigos. O SHA-256 da migration 019 é `d31378c42e9234389d5ec50accc073f42ed0e211003174869fdd84293d93a1bd`; os bytes fonte e distribuição foram comparados e são idênticos.

### Validação executada

| Comando/check | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, produção/cliente/testes. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd test -- apps/controller/src/modules/storage/initial-configuration.test.ts apps/controller/src/modules/storage/storage.test.ts --reporter=dot --no-color` | Exit 0; **48 testes em 2 arquivos**, duração 13,28 s. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **899 testes em 61 arquivos**, duração 50,59 s. |
| `npm.cmd run build` | Exit 0; controlador/declarations, migrations/recursos e bundle web. Aviso existente de chunk acima de 500 kB; JS 722,30 kB minificado. |
| Observação da dependência em processo Node | Exit 0; better-sqlite3 13.0.3 carregado e SQLite 3.53.4 consultado em memória. |
| Integridade das migrations | Check posterior confirmou os 18 SHA-256 históricos inalterados; migration 019 fonte/distribuição idêntica, exit 0. |

Os 25 testes novos em `storage/initial-configuration.test.ts` cobrem seed limpo, defaults/nulabilidade/CHECKs, conclusão/supressão/root/path, persistência após reopen, bind/switch/origem/destino/recurso inválidos, FK/imutabilidade de todos os campos de identidade e migração SQLite real 18→19 com identidade, perfil sem classificação inventada, recibo, operação e ledger anterior preservados. Configuração semanticamente inválida é recusada antes de escrita, preservando o arquivo byte a byte; operação antiga incompatível causa rollback de todas as colunas/triggers/ledger da nova migration. A suíte histórica mantém os casos de ledger divergente, banco desconhecido/corrompido, versão superior e recusa sem substituição silenciosa, além das demais regressões do produto.

### Limites locais e continuidade

SQLite, filesystem, migrations e reopen dos testes são reais e temporários; adapters externos da suíte continuam controlados. Não foi aberta, migrada, apagada ou resetada a instalação operacional existente. A fixture 18→19 demonstra somente os dados nela exercitados; não declara suporte geral de upgrade dos dados atuais para o schema final de todo o pacote. Não houve Git/GH, provider, recrutamento, tracker, publicação, criação de referência Git ou nova dependência.

Não foram executados smokes externos ou inspeção de UI nesta sprint de persistência, que não altera UI. Wizard, validação nativa de EXE/pasta, bind/switch transacionais e consulta excepcional do recibo pelo destino continuam nas sprints consumidoras. Aceite integrado real e revisão independente da versão imutável permanecem separados; não há aprovação, Design Lock ou mudança de fase presumidos.

A revisão automática rejeitou a leitura opcional de memória externa por considerá-la conteúdo privado fora do escopo autorizado. Esse conteúdo não foi usado; o trabalho e os checks prosseguiram pelas fontes do repositório. A restrição de comandos foi levantada como dúvida, mas as chamadas diretas aos checks locais solicitados foram aceitas e concluídas neste contexto; não houve rejeição desses checks nem execução por ferramenta alternativa para contorná-la.

## Sprint 001 - Fundação de persistência e compatibilidade [CONCLUIDA]
- Compatibilidade não destrutiva do schema: Estender o runner para os deltas do pacote sem modificar as 18 migrations históricas ou tratar banco incompatível como instalação vazia.
- Fatos persistidos da configuração inicial: Acrescentar os fatos privados necessários à supressão, conclusão, confirmação da pasta e localização do GitHub CLI.
- Identidade de destino das operações de vínculo: Preparar a persistência para identificar a conta de destino de bind e switch sem alterar a conta de origem da operação.

## Pacote Configuração inicial — Posição 2, sprint-002 — Instalação fixa e executor local automático [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: posição exibida 2, índice 1, ID `sprint-002`. Trabalho no repositório canônico, preservando o histórico. Escopo US-09/10, RF-48–54 e RNF-15/17; aceite externo permanece uma etapa separada.

### Fontes e comprovação

- Consultados AGENTS.md, SPEC.md §§8/10, INTEGRACAO-MAESTRI-OMP.md, GLOSSARY.md, FEEDBACK-PROXIMO-PACOTE.md e os deltas da SPEC da feature, especialmente US-09/10 e §2.1. As decisões novas substituem somente os campos e gates antigos pertinentes a esta sprint.
- Leituras efetivas em UTF-8 e checks executados neste contexto. Context7 consultado com resolução seguida de consultas sobre transações síncronas/DDL/rollback em better-sqlite3 e resolução de caminhos/hostname em Node 24. Nenhuma dependência instalada ou versão alterada.
- Prova definida por superfície: SQLite temporário para schema, rollback e recibos; HTTP inject para rejeição dos campos; startup controlado para hostname, lock e várias sessões; processos Node nativos e pacote relocado para caminho independente do cwd e exclusão local. A suíte padrão continua sem providers ou efeitos externos.

### Implementação e interfaces

| Superfície | Resultado |
| --- | --- |
| Bootstrap | `loadConfiguration` resolve exclusivamente `<raiz da instalação>/var/factory`; `FACTORY_DATA_DIR` é ignorada, inclusive valores vazios/inválidos. Banco, lock, workspaces, Git retido e artifacts recebem a mesma raiz operacional da composição. `ControllerDependencies.dataDirectory` é seam interna de testes, sem flag CLI, opção HTTP ou variável distribuída para selecioná-la. |
| Persistência | Migration nova `020_local_installation.sql` remove `data_root` e `maestri_settings_json` com ALTER TABLE DROP COLUMN, sem tabelas/colunas substitutas. Schema corrente **20**. Migrations 001–019 não foram editadas; testes preservam os 18 checksums explícitos e o SHA-256 da 019. |
| Leitura e seed | `FactorySettings` e leitores deixam de retornar os dois campos removidos. Seed recebe somente a conexão e usa hostname real. Compatibilidade valida os campos legados apenas em bancos históricos antes de aplicar o delta; valores incompatíveis são recusados, sem usar seu path nem recriar banco vazio. Fixtures históricas usam `seedLegacySettings` e reconstrução exclusiva dos bancos temporários. |
| Identidade local | `Storage.captureLocalHost()` captura o hostname real sob transação curta, com incremento de revisão somente se mudar. `startController` chama essa operação sob o lock e antes do executor, preparação, pipeline, fila e HTTP. Host legado/manual não é exigido nem aceito em saves. |
| Gates e autoridade | Preparação, início, habilitação de automação/fila e diagnóstico não exigem designação manual. A observação da fila usa identidade local automática; revalidação de conta, resumo/CAS, consumo durável, unicidade de tentativa e worker permanecem. A API de suporte conserva identidade técnica; telas comuns deixam de apresentar cadastro, seleção e rótulo de host executor. |
| Contratos e UI | `GlobalChanges`, `GlobalConfiguration`, settings/configuration saves e `ProjectForm` removem host editável, diretório de dados e Workspace Maestri ID. Rotas e storage recusam essas propriedades. Dashboard e resumos da fila deixam de exibir host designado. Contexto Maestri herdado, preflight, workspace/terminal/pipe nativos não foram substituídos por nova identidade ou credencial. |
| Distribuição e manual | `.env.example` contém cinco opções não sensíveis; launcher, README e manual descrevem armazenamento fixo, atualização preservando `var/factory`, contexto herdado e ausência de seleção de máquina. `distribution.json` registra `databasePath: var/factory/factory.sqlite`. Smokes usam a seam interna ou uma instalação empacotada própria. |

SHA-256 da migration 020: `80660c78a09810e5873e7301fc6c695cbab6454865e1f60ccbd0df8323eb4651`; bytes fonte/distribuição comparados e idênticos. Os testes novos cobrem ausência das colunas, hostname real/idempotência, preservação de identidade/fatos de onboarding/ledger/recibos em banco temporário 19→20, rollback integral quando a segunda remoção de coluna falha e recusa de configuração histórica incompatível preservando os bytes do arquivo.

### Validação executada

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na rodada final; produção, cliente, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **912 testes em 62 arquivos**, duração 46,30 s na rodada final. |
| `npm.cmd run build` | Exit 0; controlador, migration 020, recursos e cliente. Aviso existente de chunk acima de 500 kB; JS 719,67 kB minificado. |
| Testes focados finais de instalação/startup | Exit 0; 11 testes em 2 arquivos. |
| `npm.cmd run test:distribution` | Exit 0; pacote próprio `build/Fábrica distribuição-9lY6nt`, SQLite nativo, dois processos com cwd distintos resolvem o mesmo `var/factory/factory.sqlite`, override ignorado, hostname real, segundo controlador recusado, assets/API e restart com identidade preservada/sessão revogada. Pré-voo Maestri controlado. |
| `npm.cmd run test:compiled` | Exit 0 na rodada corrigida, cerca de 5 s; HTTP/SSE/SQLite nativos, CAS/idempotência, diagnóstico, shutdown, recusa de segundo processo em outra porta e liberação do lock após morte do processo de teste. Pré-voo controlado. |

O teste de startup verifica captura do hostname antes do preflight, duas sessões técnicas distintas usando exatamente uma composição de pipeline e recusa do controlador concorrente antes de outro executor/worker. Os testes da fila e publicação continuam verificando divergência de conta e pausa de novos despachos. Campos retirados são recusados nas duas rotas agregadas, inclusive grafias snake_case, e no storage, sem evento ou edição parcial.

### Falhas corrigidas e limites

- A primeira rodada focada encontrou uma sobra de `mockResolvedValueOnce` na fixture de diretórios: com um campo a menos, a resposta extra contaminava o caso seguinte. A fixture passou a simular uma única validação; regressões e suíte completa passaram.
- O smoke HTTP/SSE reproduziu `TypeError: terminated / UND_ERR_SOCKET`. Aplicada a skill local `diagnosing-bugs`: foi identificado que o smoke aguardava o evento antigo `diagnostic.completed`, enquanto servidor, cliente e contrato SSE da feature usam `controller-event` com `eventType` no JSON. A espera terminava somente com o fechamento por prazo. O smoke passou a conferir o frame e o tipo efetivos, com deadline de leitura de 5 s; a execução integral passou. Nenhum erro genérico de socket foi suprimido e o servidor SSE não foi alterado. Isso não diagnostica nem comprova o comportamento do navegador da futura etapa externa.
- Uma execução do smoke foi interrompida durante a conferência de suas seams; a chamada de restart foi também ajustada para o diretório temporário. A execução posterior completa passou. Metadados consultados da instalação operacional antecedem esta rodada; ela não foi usada como alvo dos testes, migrada, limpa ou resetada.
- SQLite, filesystem, HTTP loopback e processos dos smokes são reais e locais. O preflight de teste é controlado; não houve Git/GH, keyring, provider, recrutamento Maestri/OMP, publicação ou tracker. Não há ref Git imutável desta entrega atestada: o runtime não fornece o contexto elevado exigido e nenhum comando Git foi executado.
- Não houve inspeção visual Playwright/Chrome ou aceite nativo Maestri/OMP/GitHub. Esses aceites e a revisão independente da versão entregue permanecem para a etapa externa coordenada pelo chat principal. Não se declara aprovação, Design Lock ou mudança de fase. Vínculo inicial da conta e demais deltas do pacote permanecem nas sprints consumidoras.
- A revisão automática bloqueou a consulta opcional à memória privada externa como fora do escopo. Esse conteúdo não foi usado; fontes e skill locais sustentaram o trabalho. Os checks locais solicitados foram aceitos e concluídos sem contorno por outro executor.

## Sprint 002 - Instalação fixa e executor local automático [CONCLUIDA]
- Armazenamento derivado da instalação: Fixar o banco e os caminhos operacionais na raiz resolvida da instalação.
- Retirada dos campos internos editáveis: Remover diretório de dados e Workspace Maestri ID das superfícies editáveis e do schema final.
- Identidade automática e exclusividade local: Usar o hostname real internamente, eliminando a designação manual de executor.

## Pacote Configuração inicial — Posição 3, sprint-003 — Retirada dos tetos e precisão interna dos tempos [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: posição exibida 3, índice 2, ID `sprint-003`, título **Retirada dos tetos e precisão interna dos tempos**. Trabalho no repositório canônico, preservando o histórico anterior. Sem dependências novas ou comandos Git/GH.

### Fontes e prova definida

- AGENTS.md, SPEC.md §§5.3/8.4/8.5, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md §§5–6, FEEDBACK-PROXIMO-PACOTE.md itens 8–10 e SPEC da feature `docs/Docs20261017_233303/SPEC20261017_233303.md`, US-11/12. Cobertura feat-007/008/009, RF-56–62 e RNF-06/14 desta sprint. A conversão visual para minutos pertence à próxima fatia e não foi antecipada.
- Leituras efetivas em UTF-8 pelo filesystem do Node REPL. Antes das edições foram definidos os checks configurados, provas HTTP/SQLite dos limites, início controlado sem tetos, migração temporária 20→21 e comparação dos documentos históricos. A avaliação independente deve executar suas próprias leituras/checks sobre a versão entregue.
- Context7 consultado com resolução de better-sqlite3 seguida de consulta às transações síncronas/IMMEDIATE e rollback. Dependência fixada preservada; SQL permanece privado em storage, sem IO externo dentro das transações.

### Alterações e interfaces

| Superfície | Resultado |
| --- | --- |
| Contratos | Removidos `CostDefaults`, `FactorySettings.costDefaults`, mudanças globais, overrides, configuração efetiva e origem correspondente. `AttemptCapture` usa a configuração sem tetos. `AttemptMeasurements` deixa de ter `costLimit` e `costLimitState`; mantém observação de custo, atividade, espera e TTL. |
| Configuração e captura | Seed, leitores, merge e UPDATE de settings não carregam nem gravam tetos. Preparações e novos JSONs de captura não incluem tetos financeiros ou de tokens de inferência. Início com os demais pré-requisitos válidos chega a passagem acompanhada sem exigir essas propriedades. |
| Persistência | Migration nova `021_inference_limits.sql` remove exclusivamente `factory_settings.cost_defaults_json` com ALTER TABLE DROP COLUMN. Schema final **21**, sem coluna ou tabela equivalente. Migrations 001–020 preservadas. Runner continua validando dados históricos antes de migrar e recusa incompatibilidade sem recriação vazia. |
| Histórico | `storage/historical-configuration.ts` valida explicitamente os formatos históricos e fornece projeções operacionais sem os campos retirados. Não executa UPDATE de capturas/revisões. Documentos originais, pareceres, resultados, recibos, guards e ledger histórico mantêm seus bytes. A migration não reescreve histórico para eliminar tetos. |
| Medições | A leitura depende somente dos tempos capturados, sem validação ou estado de aplicação de teto financeiro. Custo não observado continua indisponível com causa; não há gasto inventado nem enforcement financeiro. Espera humana até o recibo continua separada da atividade; TTL continua independente. |
| Tempos | Um schema comum interno define o domínio inteiro 1..2.147.483.647 ms para consulta, backoff opcional e tempo ativo. Defaults permanecem 15.000 e 1.800.000 ms. Servidor recusa zero, negativos, frações, excesso, strings e null nos caminhos pertinentes. |
| Consumidores e documentação | Retirados campo de custo de ProjectForm, preview de PreparationDialog e limite/estado financeiro de AttemptDetailDialog. Custo observado permanece separado. Unidade visual e composição existentes preservadas. README, manual operacional e roteiro first-slice passam a distinguir autorização externa de qualquer teto de produto. |

SHA-256 da migration 021: `3b16ed8b6b5b0d03f53c3ac50f3c1368b9d796a1e78c22c044d96dafdef12cc2`. Fonte e distribuição comparadas byte a byte: iguais.

### Validação executada

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, cliente, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; fronteiras de módulos e convenções TypeScript. |
| `npm.cmd test -- tests/integration/inference-limits.test.ts --reporter=dot --no-color` | Exit 0; 10 testes novos, antes da rodada completa final. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **922 testes em 63 arquivos**, duração 46,62 s na rodada final. |
| `npm.cmd run build` | Exit 0; controlador/declarations, migration 021, recursos e cliente distribuídos. Aviso existente de chunk acima de 500 kB; JS 718,08 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão/CAS/idempotência, catálogo distribuído, diagnóstico, shutdown e lock entre processos. Pré-voo Maestri controlado; Maestri/OMP não executados. |

`tests/integration/inference-limits.test.ts` cobre os dois tempos nas rotas de settings, configuração agregada e criação/edição de preparação; rejeição sem escrita e limites 1/3/2.147.483.647 exatos; edição de outro campo preservando valores; gravação interna de tempos; propriedades financeiras/tokenizadas recusadas; CSRF preservado; defaults e início controlado; migração SQLite real 20→21 com captura/preparação/parecer/resultados/recibos/ledger preservados; guardas históricos; rollback de DDL por dependência incompatível e recusa de dados inválidos preservando o arquivo. Fixtures históricas foram ajustadas somente para reconstruir bancos temporários anteriores.

Os testes de perguntas mantêm a prova de espera de 60 s sem acúmulo ativo, inclusive durante entrega incerta, e agora também comparam atividade antes/depois da expiração de TTL 0/1.000 ms. A suíte completa inclui as regressões históricas de sessão, autenticação técnica, payloads, CSRF e demais proteções, que não foram removidas.

A primeira compilação identificou blocos novos posicionados fora do escopo; foram corrigidos. A primeira rodada dos testes novos encontrou dependências GitHub ausentes na fixture HTTP e consulta por uma conexão já fechada; as fixtures foram corrigidas sem relaxar gates de produção. A primeira suíte completa detectou uma expectativa histórica ainda em schema 20; foi atualizada para 21, e a suíte completa final passou.

### Limites e continuidade

SQLite, arquivos temporários, migrations e HTTP inject são reais; Git/GitHub/executor são controlados nas provas de preparação/início/revisão. O smoke usa HTTP loopback e processos locais reais com pré-voo controlado. Esses resultados não comprovam TUI/provider, keyring, Maestri/OMP/GitHub reais ou aceite visual. Browser e revisão independente da referência imutável permanecem na etapa externa coordenada pelo chat principal.

Nenhuma instalação operacional foi aberta, migrada, limpa ou resetada. Sem Git/GH, login alternativo, alteração de credencial/ACL, provider, recrutamento, publicação ou tracker. O runtime não disponibiliza o contexto elevado exigido para Git/GH; nenhuma ref imutável desta entrega é atestada. Sem aprovação, Design Lock ou mudança de fase presumidos.

A revisão automática rejeitou a leitura opcional da memória privada externa como fora do escopo. Esse conteúdo não foi usado; o trabalho prosseguiu pelas fontes locais. Os comandos locais de validação solicitados foram aceitos e concluídos.

## Sprint 003 - Retirada dos tetos e precisão interna dos tempos [CONCLUIDA LOCALMENTE]

- Configuração sem tetos de inferência: contratos, defaults, saves e formulários sem teto; coluna removida pelo delta 021.
- Execução sem bloqueadores financeiros residuais: preparação e início controlados sem tetos, medições atualizadas e histórico imutável preservado.
- Tempos internos exatos e controles separados: faixa inteira, defaults conservados e provas de atividade/espera/TTL independentes; minutos ficam para a próxima fatia.

## Sprint 003 - Retirada dos tetos e precisão interna dos tempos [CONCLUIDA]
- Configuração sem tetos de inferência: Retirar configurações, defaults e campos públicos de teto financeiro ou de tokens.
- Execução sem bloqueadores financeiros residuais: Retirar a exigência de tetos da captura, início, runtime e detalhe das tentativas.
- Tempos internos exatos e controles separados: Garantir o domínio inteiro dos tempos e preservar a distinção entre atividade, espera e TTL.

## Pacote Configuração inicial — Posição 4, sprint-025 — Contratos públicos compartilhados antes das famílias consumidoras [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: índice 3, posição exibida 4, ID `sprint-025`, feat-015. Esta identidade pertence ao pacote Configuração inicial e não substitui a sprint histórica de fila com o mesmo número. Repositório canônico; histórico e alterações anteriores preservados.

### Fontes, escopo e prova definida

- AGENTS.md; SPEC.md §§8.2/8.4/8.5/10.2; GLOSSARY.md; INTEGRACAO-MAESTRI-OMP.md §§1–6; SPEC da feature `docs/Docs20261017_233303/SPEC20261017_233303.md`, convenções e §3.2. Cobertura: contratos comuns, US-18, RNF-04/18. As famílias específicas de configuração, execução e observação continuam nas sprints-004/005/006; nenhuma funcionalidade, fase ou autorização externa foi acrescentada.
- Antes das edições: definidas validação estática, regressões TypeBox de objetos fechados/constraints, HTTP inject de sessão/Origin/Host/JSON/CSRF e recibos, teste do cliente com fetch controlado e comparação dos documentos privados antes/depois de leituras/reopen. Leituras efetivas em UTF-8; nenhuma dependência instalada. Context7 consultado por resolução seguida de consulta sobre schemas TypeBox fechados, Partial/Optional e validação; versão fixada 0.34.52 preservada.
- Repo-graph não está exposto nesta sessão; navegação pelos arquivos atuais. Nenhum Git/GH foi executado: o runtime não fornece o contexto elevado com keyring exigido. Nenhuma referência Git imutável desta entrega é atestada.

### Contratos e consumidores concluídos

| Fronteira | Resultado |
| --- | --- |
| Sessão e erros | `base.ts`: SessionResponse usa csrf_token/instance_id; ErrorResponse usa request_id/field_errors/operation_id/affected_requirements. operation_id de erro é UUID. Bootstrap, erros de parsing nativo, handlers e erro aninhado de GET operations produzem o mesmo formato. Cookie, geração/comparação dos segredos, rate limits e controles de segurança permanecem os existentes. |
| Operações e recibos | OperationAccepted/OperationView usam operation_id/request_id e status_url quando aplicável; OperationReceipt usa event_cursor. Storage, rotas de comando, consultas, relatórios com recibos e ações React consomem esses objetos conjuntamente. OperationParams continua com operationId no path. Recibos não recebem payload arbitrário. |
| Auxiliares | Page usa next_cursor/has_more/event_cursor; Capability usa reason_code; MeasuredValue indisponível usa affected_requirements. ConfiguredLimit conserva suas variantes e constraints. FactorySettings, TimeDefaults e ArtifactPolicy usam snake_case, inclusive os campos herdados pelos patches globais e seus consumidores diretos. HealthResponse, OperationId/Resource, DeliveryMode, EmptyBody/Query preservam seus contratos. CostDefaults/MaestriSettings não foram reintroduzidos. |
| Composição | Atualizados produtores e consumidores de configurações, preparações, capturas operacionais, medições, páginas de projetos/issues/tentativas/eventos, fila, scaffold, diagnóstico e publicação que usam os tipos comuns. Campos próprios dessas famílias continuam na representação anterior até suas fatias; por exemplo, PreparationOverrides.timeDefaults contém polling_interval_ms. Eventos/SSE mantêm os campos próprios existentes; somente a página comum mudou. |
| Cliente | `api/http.ts` lê csrf_token somente para a variável em memória. A classe interna HttpError conserva requestId/fieldErrors/resource/operationId/facts e agora também affectedRequirements/recovery recebidos no envelope público. Mantidos bootstrap serializado, same-origin e ausência de replay de mutação após 401. Hooks, formulários, polling e renderização usam as propriedades comuns atualizadas. |
| Histórico privado | Novo `storage/common-json.ts` contém schemas/codecs explícitos de TimeDefaults, ArtifactPolicy e recibos privados. `historical-configuration.ts` compõe as projeções de captura/preparação, inclusive o histórico com custo retirado. Escritas preservam os formatos privados versionados e leituras não executam UPDATE. Chaves de fatos, conteúdo do operador, resultados/pareceres e paths JSON históricos não passam por conversor genérico. Schema continua 21, sem migration nova. |
| Provas e documentação | `common-public.test.ts`, `api/http.test.ts`, `common-history.test.ts` e casos em http-security; expectativas e smokes existentes atualizados. Vitest passa a coletar também testes TS do cliente. README registra a fronteira comum e a distinção das famílias ainda não normalizadas. |

### Validação executada

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na rodada final; produção, cliente, contratos, scripts e testes strict. |
| `npm.cmd run lint` | Exit 0 na rodada final; fronteiras de módulos e convenções TypeScript. |
| Testes focados de contratos/segurança/storage/scaffold/publicação/diagnóstico | Exit 0; 158 testes em 8 arquivos após as correções. |
| Testes focados adicionais do cliente e histórico comum | Exit 0; 3 testes em 2 arquivos. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0 na rodada final; **940 testes em 66 arquivos**, duração 51,92 s. Inclui 18 regressões novas e a suíte anterior. |
| `npm.cmd run build` | Exit 0; controlador/declarations, migrations/recursos e cliente distribuídos; bundle JS observado 718,32 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão, settings/CAS/idempotência, operação, diagnóstico, catálogo distribuído, shutdown e lock entre processos. Pré-voo Maestri controlado. |

As regressões novas recusam aliases mesmo junto às chaves canônicas, exercitam schemas parciais compostos, limites internos dos tempos, UUID/path/objetos vazios, medidas e TTL zero. HTTP confirma recibo/Location/consulta/replay e objetos normalizados na mesma entrega, recusa aliases sem escrita e preserva as proteções existentes. O teste do cliente conserva metadados/orientação/fatos e confere CSRF em memória, same-origin e um único POST de negócio após 401. O histórico compara bytes de captura, escolhas e recibos antes/depois de projeções e reopen, com texto do operador contendo nomes camelCase preservado literalmente. A regressão de migração 20→21 também compara novamente o histórico após consultar suas projeções.

A primeira rodada encontrou 15 falhas: expectativas antigas de campos, um nome de variável de teste alterado e dois problemas de fronteira corrigidos — recibo de reconciliação de criação fora do codec privado e propagação de OPERATION_DATA_INVALID no lugar de SETTINGS_INVALID. Não foram relaxados os schemas, gates ou critérios para passar a suíte. Typecheck, testes focados e suíte completa foram repetidos depois das correções; o teste novo do cliente foi incluído explicitamente na coleta padrão.

### Limites e continuidade

SQLite, arquivos temporários, HTTP inject e o transporte/processos próprios do smoke são reais. Fetch e adapters externos da suíte são controlados; não houve Git/GH, provider, recrutamento, publicação, tracker ou inspeção visual. O smoke não comprova TUI, keyring, Maestri/OMP/GitHub reais, nem aceite de navegador. Nenhuma instalação operacional foi migrada, limpa ou resetada; nenhum commit/push, aprovação, Design Lock ou mudança de fase foi executado. A revisão independente da referência imutável e os aceites externos continuam separados desta validação local.

A revisão automática rejeitou a leitura opcional da memória externa como conteúdo privado fora do escopo. Esse conteúdo não foi usado. Os comandos locais expressamente solicitados de validação foram aceitos e concluídos neste runtime; nenhuma rejeição de execução foi contornada.

## Pacote Configuração inicial — sprint-025 — Contratos públicos compartilhados [CONCLUIDA LOCALMENTE]

- Representação pública comum em snake_case, schemas fechados e consumidores diretos coerentes.
- Sessão, metadados de erro, recibos e constraints preservados com provas HTTP/cliente.
- JSONs privados históricos consultáveis e imutáveis por mapeamentos explícitos; famílias específicas seguem para as sprints consumidoras.

### Complemento — consumidores diretos e preservação dos erros [VALIDADO LOCALMENTE]

Data: 2026-10-18. Conferida novamente a identidade do pacote Configuração inicial: posição 4, índice 3, `sprint-025`, **Contratos públicos compartilhados antes das famílias consumidoras**, feat-015. Fontes efetivamente lidas nesta rodada: AGENTS.md, SPEC.md §§8/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md, SPEC da feature §3.2, contratos comuns, produtores HTTP, codecs privados e consumidores web. Cobertura permanece US-18/RNF-04/RNF-18, sem antecipar a normalização das famílias seguintes.

- `PrincipalScreen.tsx`: o reconhecimento de páginas ainda exigia `nextCursor/eventCursor`, descartando páginas atuais do Dashboard. Agora valida diretamente o schema compartilhado `ProjectPage`, com `next_cursor/has_more/event_cursor`, incluindo catálogo vazio e recusa de aliases ou itens inválidos. Os dois comportamentos incorretos foram reproduzidos por testes antes da correção.
- `ProjectForm.tsx`: removida a cópia local do recibo com `eventCursor`; as respostas de gravação usam `OperationReceipt` de `#contracts`.
- `api/http.ts`: um erro durante a renovação técnica após 401 de mutação substituía o erro original. Os clientes JSON e texto agora preservam status, request_id, field_errors, resource, operation_id, facts, affected_requirements e recovery na mesma `HttpError`; a falha de renovação permanece em `cause`. A sessão continua em memória e a mutação não é reenviada. Ambos os caminhos foram reproduzidos antes da correção.
- Acrescentadas cinco regressões: três em `PrincipalScreen.test.ts` e duas em `api/http.test.ts`. O schema permanece 21; não houve migration, conversor genérico, reescrita de JSON histórico ou nova dependência. Context7 consultado por resolução seguida de consulta sobre validação TypeBox e objetos fechados; mantida a API e a versão instaladas.

| Comando/prova desta rodada | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 após as correções; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| Testes focados de Principal, cliente, contratos comuns, histórico e segurança HTTP | Exit 0; 45 testes em 5 arquivos. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **945 testes em 67 arquivos**, duração 48,24 s. |
| `npm.cmd run build` | Exit 0; controlador, recursos e cliente distribuídos; JS 727,85 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão/CAS/idempotência, catálogo, diagnóstico, shutdown e lock entre processos; pré-voo Maestri controlado. |

As regressões existentes de sessão, Host, Origin, JSON, CSRF, recibos, schemas compostos e histórico privado/reopen passaram novamente. A classificação da página foi validada em teste de consumidor, sem inspeção visual de navegador. Fetch e integrações externas da suíte são controlados; não houve Git/GH, keyring, provider, recrutamento Maestri/OMP, publicação, tracker, commit/push ou aprovação/mudança de fase. O runtime não oferece o contexto elevado exigido para Git/GH; nenhuma referência Git imutável desta rodada é atestada. Nenhuma instalação operacional foi usada como alvo de migração ou limpeza.

A revisão automática rejeitou leituras opcionais da memória e da skill Context7 externas ao repositório, por considerá-las conteúdo privado fora do escopo. Esses arquivos não foram usados; o trabalho prosseguiu pelas fontes locais e pelas ferramentas Context7, conforme AGENTS.md. Os comandos locais expressamente solicitados de validação foram aceitos e concluídos.

## Sprint 004 - Contratos públicos compartilhados antes das famílias consumidoras [CONCLUIDA]
- Sessão, erros, recibos e tipos auxiliares compartilhados: Concluir a representação pública dos contratos comuns, incluindo os auxiliares de páginas, capacidades, medidas e configuração, com produtores e consumidores diretos atualizados na mesma entrega.

## Pacote Configuração inicial — Posição 5, sprint-004 — Contratos públicos de configuração em snake_case [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: índice 4, posição exibida 5, ID `sprint-004`, título **Contratos públicos de configuração em snake_case**. Esta identidade é distinta das sprints históricas com o mesmo número. Trabalho no repositório canônico, preservando o histórico anterior.

### Fontes e comprovação definida

- AGENTS.md; SPEC.md §§8/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e convenções da SPEC da feature `docs/Docs20261017_233303/SPEC20261017_233303.md`. Cobertura: US-18/RNF-18 e normalização da família de configuração. Comandos funcionais novos de vínculo, onboarding e evolução dos perfis continuam em suas sprints consumidoras.
- Leituras efetivas em UTF-8. Antes das alterações foram definidos testes de schemas fechados, HTTP/SQLite, montagem dos requests web, CAS/idempotência, formatos privados e consultas/reopen sem UPDATE histórico. Context7 consultado por resolução seguida de consulta sobre TypeBox, objetos fechados e Partial; mantidas a API instalada e a versão fixada 0.34.52, sem instalação de dependências.
- Repo-graph não está exposto nesta sessão; navegação pelos arquivos atuais. Nenhum Git/GH executado: o runtime não oferece o contexto elevado/keyring exigido pelo projeto. Nenhuma referência Git imutável desta entrega é atestada.

### Fronteiras convertidas e leitores preservados

| Superfície | Resultado |
| --- | --- |
| Settings e perfis existentes | `SettingsUpdate/SettingsSaved/SettingsView` compartilham `profile_changes`, `operation_id`, `event_cursor` e timestamps `created_at_ms/updated_at_ms` dos perfis. Os campos comuns completos da sprint-025 são consumidos nesta entrega. Não foram acrescentados campos funcionais de perfil ou onboarding. |
| Projetos | Cadastro, resumo, revisão, configuração e opções usam `base_branch`, `repository_id/repository_url`, `account_id`, `current_revision_id`, `project_id`, `github_project`, papéis de perfil, checks, correções, automação e ordenação em snake_case. Requests agregados usam `project_changes/global_changes/profile_changes`; Status usa `in_progress/in_review`; checks usam `cwd_relative/timeout_ms`. |
| Queries e paths | `configuration-options` recebe `owner_id/owner_kind/github_project_id/status_field_id`. `ProjectParams`, `PreparationParams`, os paths `:projectId/:preparationId` e os parâmetros de navegação continuam preservados. Busca, limite e cursor mantêm seus nomes já normalizados. |
| Preparações | GET/POST/PUT, escolhas, overrides, configuração efetiva, origens, critérios, efeitos, base e resumo usam os schemas normalizados. Tempos permanecem inteiros em ms; TTL e limites existentes conservam suas variantes/constraints. A identidade de tentativa anterior não é editável pelo PUT. |
| Dados GitHub aninhados | `ConfigurationIssueContext/ConfigurationIssueOption` projetam explicitamente repositório, comentários, memberships, valores de campo e `content_id`. `http/configuration-views.ts` forma a resposta da preparação sem alterar os modelos do adapter, respostas GraphQL, textos ou mapas externos. |
| Consumidores | `ProjectForm`, `PreparationDialog`, consultas de opções, Dashboard/Principal e os consumidores backend de configuração foram atualizados conjuntamente. Recibos de gravação/cadastro usam tipos compartilhados, sem cópias locais com `operationId`. `configuration-requests.ts` e `preparation-requests.ts` concentram a montagem tipada dos comandos e queries web. Layout e navegação existentes foram mantidos. |
| JSON privado | `storage/configuration-json.ts` define schemas e mapeamentos explícitos para configuração, perfis capturados, checks, opções, ordem, escolhas, origens e critérios. `historical-configuration.ts` conserva os leitores dos formatos anteriores, inclusive documentos com tetos retirados. Revisões SQL continuam gravando seus JSONs privados originais. Capturas, preparações e perguntas de escopo mantêm `occurrenceIndex` em disco e recebem `occurrence_index` na projeção operacional. |
| Identidade dos comandos | `configuration-command-json.ts` preserva a representação semântica anterior usada no hash das operações de cadastro/settings/configuração/preparação. Campos comuns que já eram snake_case continuam assim nesse hash. Isso mantém compatibilidade com operações anteriores sem aceitar aliases públicos, alterar recibos ou reescrever o ledger. |

Schema permanece **21**, sem migration ou alteração de arquivos SQL históricos. Contratos continuam sem IO, com limites e `additionalProperties:false`. Não há conversor genérico de chaves: os mapeamentos visitam somente campos conhecidos. Omissão conserva valores; null continua restrito aos campos previstos; listas e overrides explícitos mantêm a semântica existente.

### Validação executada nesta rodada

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na rodada final; produção, contratos, web, testes e scripts em TypeScript strict. |
| `npm.cmd run lint` | Exit 0 na rodada final; fronteiras de módulos e convenções TypeScript. |
| Testes focados finais de HTTP e histórico | Exit 0; 5 testes em 2 arquivos, incluindo hashes semânticos anteriores e pergunta histórica/reopen. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0 na rodada final; **956 testes em 70 arquivos**, duração 49,59 s. |
| `npm.cmd run build` | Exit 0 na rodada final; controlador/declarations, recursos e web distribuídos. Bundle JS observado: 729,16 kB minificado; permanece o aviso de chunk acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão, settings/CAS/idempotência, catálogo, diagnóstico, shutdown e lock entre processos. Pré-voo Maestri controlado. |

As 11 regressões novas cobrem os schemas recursivos da família, aliases isolados e junto às chaves canônicas, parciais aninhados, null/omissão/limites, queries e paths, requests efetivamente montados pelo cliente, GET/POST/PUT de preparação, dados GitHub aninhados e recusa HTTP sem operação/evento/escrita parcial. A prova histórica existente foi ampliada com duas revisões de preparação, JSONs esperados literalmente nas chaves antigas, checks, mapeamento, perfis, origens e critérios; compara registros completos e `total_changes()` durante leitura, além dos bytes após reopen. A nova regressão de pergunta conserva o JSON privado dos critérios após reopen. Texto do operador contendo nomes camelCase permanece literal.

Durante a validação foram corrigidas projeções inferidas com cursores/chaves antigos, seletores calculados dos formulários, tipos locais de recibos e consumidores indiretos de critérios. Fixtures HTTP e expectativas foram atualizadas para a fronteira nova; chamadas internas e famílias ainda não normalizadas conservam seus contratos próprios. Nenhum schema foi relaxado para aceitar os dois formatos e nenhum gate de segurança ou execução foi removido. A suíte completa e os checks finais passaram após essas correções.

### Limites de prova

SQLite, filesystem temporário, HTTP inject e os processos/transportes locais do smoke são reais. Fetch e adapters externos da suíte são controlados; o smoke não executa Maestri/OMP. Não houve Git/GH, keyring, provider, recrutamento, publicação, tracker, commit/push ou inspeção visual Playwright/Chrome. Testes do cliente comprovam montagem/consumo dos contratos, sem declarar aceite visual ou integração externa. Nenhuma instalação operacional foi aberta, migrada, limpa ou resetada. Revisão independente da referência imutável e aceites externos permanecem separados; nenhuma aprovação, Design Lock ou mudança de fase foi simulada.

A revisão automática rejeitou a consulta opcional à memória externa como conteúdo privado fora do escopo. Esse conteúdo não foi usado; o trabalho prosseguiu pelas fontes locais. Os comandos locais de validação solicitados foram aceitos e concluídos.

## Sprint 005 - Contratos públicos de configuração em snake_case [CONCLUIDA]
- Configuração e projetos com representação única: Aplicar snake_case aos campos públicos existentes de settings, configuração, cadastro e opções de projetos.
- Preparação normalizada sem reescrever histórico: Normalizar os DTOs de preparação, configuração efetiva e suas escolhas públicas.

## Pacote Configuração inicial — Posição 6, sprint-005 — Contratos públicos de execução e entrega em snake_case [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: índice 5, posição exibida 6, ID `sprint-005`, features feat-012/013/014. Esta identidade não substitui as sprints históricas com o mesmo número. Trabalho no repositório canônico, preservando o histórico anterior.

### Fontes, escopo e prova definida

- Fontes efetivamente consultadas: AGENTS.md, SPEC.md §§5–8/10.2, INTEGRACAO-MAESTRI-OMP.md §§2–3 e critérios INT, GLOSSARY.md, convenções e dicionário HTTP da SPEC da feature em `docs/Docs20261017_233303/SPEC20261017_233303.md` §3.2. Cobertura desta fatia: US-18/23/24 e RNF-14/18 nas fronteiras de representação; integração e revisão real continuam com suas próprias evidências.
- Antes das edições foram definidos: schemas fechados/constraints, recusa de aliases isolados e junto às chaves canônicas, HTTP/SQLite para CAS/idempotência/correlação, cliente para montagem dos requests/queries, duas versões históricas e comparação dos registros privados durante leitura/reopen. Smokes de execução/verificação somente após build, sem provider/recrutamento real.
- Context7 consultado com resolução de TypeBox seguida de consulta sobre objetos fechados, Optional e validação; versões fixadas e dependências preservadas. Repo-graph não está exposto nesta sessão; arquivos atuais foram usados para navegação. Não foi usado GitNexus.

### Implementação e fronteiras

| Superfície | Resultado |
| --- | --- |
| Schemas HTTP | `packages/contracts/src/http-execution/` contém DTOs explícitos por família, reexportados como `Http*` em `#contracts`. As rotas e o cliente usam esses tipos/schemas. Os contratos sem prefixo continuam modelos internos e protocolos privados existentes; não são aliases aceitos no HTTP. Testes de equivalência conferem todas as constraints, variantes, campos opcionais, limites e objetos fechados. |
| Tentativas e consultas | Início usa preparation_id/preparation_revision/authorized_summary_hash; listagem filtra project_id; detalhe seleciona round_id/delivery_id. Resumos, passagens, critérios, seções e medições têm propriedades públicas normalizadas. Os seis grupos de params de path e os parâmetros de navegação por hash conservam os nomes existentes. |
| Perguntas e recuperação | Question normaliza o envelope, scope_change, question.format_version, answer_operation_id e delivery_receipt correlacionado. Resposta usa scope_choice; recursos/planos/superfícies usam passage_id, launch_state, stop_state, plan_hash, location_display, session_reference e open_capability. Cancelamento continua aceitação durável separada de parada/limpeza. |
| Entrega, checks e revisão | Metadados, diff e paginação usam git_ref/content_identity/base_sha/producer_passage_id, old_path/old_mode/new_mode e next_cursor/has_more. Checks/artefatos/revisões/achados/resultados públicos seguem o dicionário, inclusive criterion_id/criterion_ids, declared_verdict, independence_state, receipt_id e binding.delivery_version. Download de artefato permanece texto inerte com os headers existentes. |
| Publicação | Requests complete/reconcile/authorize-upgrade e projeções de efeitos/recibos/modos/capacidades usam snake_case. Captured_mode e authorized_mode continuam separados. Reconcile consulta fatos; complete preserva versão/gates existentes. Nenhum endpoint de início, CRUD, executor ou reexecução da implementação foi acrescentado. |
| Projeções | `apps/controller/src/http/execution-views.ts` mapeia somente campos conhecidos, com tipos derivados dos schemas e preservação de omissão/null. Requests normalizados são decodificados para os modelos internos antes dos serviços, conservando os hashes semânticos anteriores, CAS, Idempotency-Key, recibos/Location e 202 como aceitação. Não há conversor genérico de chaves em produção. |
| Consumidores web | AttemptDetailDialog, PublicationDialog, QuestionDecisionCard, hooks de tentativa/versão/decisão/recuperação, listagem, preparação, Dashboard, AppShell e diálogo de autoridade consomem os DTOs correspondentes. `execution-requests.ts` monta comandos e queries tipados usados pelos componentes. Layout e navegação existentes foram preservados. |
| Histórico e executor | Nenhuma migration: schema permanece 21. Capturas, JSONs de resultados/perguntas, avaliações, recibos privados e índices históricos conservam seus formatos; nenhum UPDATE para renomear chaves. PassageRequest/PassageBinding e canais/extensão/recursos OMP continuam no protocolo privado suportado. Suas projeções HTTP são independentes. |

### Validação executada

[Registro das saídas e códigos de término](docs/integration/execution-public/20261018/technical-validation.json).

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, contratos, cliente, testes e scripts em TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript, sem any explícito ou supressões. |
| Testes focados de HTTP/execução/publicação | Exit 0; 185 testes em 9 arquivos após atualizar as fixtures HTTP. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0 na rodada final; **1.033 testes em 73 arquivos**, duração 52,86 s. São 77 regressões adicionais sobre a base anterior de 956. |
| `npm.cmd run build` | Exit 0; controlador/declarations, recursos e cliente distribuídos. JS web observado: 746,10 kB minificado. |
| `npm.cmd run test:execution-compiled` | Exit 0; papéis distribuídos com cwd alheio, loopback UTF-8, malformed/invalid UTF-8 FRAME_INVALID, oversize FRAME_OVERSIZE, EOF incompleto CHANNEL_EOF e lançamento Windows com Node como fixture. Saída: maestriOmpIntegration=not_executed. |
| `npm.cmd run test:verification-compiled` | Exit 0; nativeChecks=[passed,failed], unicodeCwd=true, artifactRenameSyncChecksum=real, canonicalization=real. Saída: gitMaterialization=not_executed e maestriOmpIntegration=not_executed. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão/settings/CAS/idempotência, catálogo distribuído, diagnóstico, shutdown e lock entre processos. Pré-voo de terminal-âncora controlado. |

As novas provas HTTP conferem rejeição de aliases sem operação/escrita aceita; request_hash anterior no início; mesmos recibos após replay; vínculo exato de tentativa/pergunta/passagem/versão; delivery_unknown mantendo suspensão até ACK tardio; consulta de pergunta estrangeira recusada; duas rodadas e versões com pareceres distintos; todas as seções normalizadas; producer-result, checks e recursos. Comparam registros completos de captura, preparações, resultados, critérios, reviews e operações, além de total_changes durante leituras, e repetem as consultas após reopen. Conteúdo do operador com nomes camelCase e emoji permanece literal. As regressões históricas de CSRF/sessão/Origin/CAS/rollback/unknown/reconciliação continuam passando.

A primeira suíte encontrou nove expectativas HTTP no formato anterior; foram atualizadas sem alterar contratos privados ou relaxar schemas. Uma asserção nova de critérios esperava somente um item, embora a fixture tenha dois; foi corrigida para conferir ambos. A auditoria dos consumidores também identificou e corrigiu o filtro de projeto da listagem para project_id. A suíte completa e os checks finais passaram depois dessas correções.

### Limites de prova

SQLite, filesystem temporário, HTTP inject e os processos/transportes locais dos smokes são reais. Git/GitHub/executor são controlados na suíte; os smokes não chamam provider nem recrutam Maestri/OMP. Não houve Git/GH, keyring, publicação, tracker, commit/push ou inspeção visual Playwright/Chrome. O runtime não disponibiliza o contexto elevado exigido para Git/GH; nenhuma referência Git imutável desta entrega é atestada. Nenhuma instalação operacional foi aberta, migrada, limpa ou resetada. Aceite visual, integração externa real e revisão independente da versão imutável permanecem separados desta validação; nenhuma aprovação, Design Lock ou mudança de fase foi simulada.

A revisão automática rejeitou a leitura opcional da memória externa como conteúdo privado fora do escopo autorizado. Esse conteúdo não foi usado; fontes locais e documentação Context7 sustentaram o trabalho. Os comandos locais expressamente solicitados de validação foram aceitos e concluídos.

## Pacote Configuração inicial — sprint-005 — Contratos públicos de execução e entrega [CONCLUIDA LOCALMENTE]

- Tentativas, perguntas e recuperação: requests, responses e queries normalizados, correlação/recibos preservados e params de path mantidos.
- Entregas, checks, revisão e publicação: representação única por versão, consumidores atualizados e histórico privado preservado.
- Fronteira do executor: projeções explícitas e protocolos privados intactos; smokes compilados passaram sem provider ou recrutamento real.

## Sprint 006 - Contratos públicos de execução e entrega em snake_case [CONCLUIDA]
- Tentativas, perguntas e recuperação normalizadas: Atualizar contratos e consumidores do início, detalhe, perguntas, recursos e ações de recuperação.
- Entregas, checks, revisão e publicação normalizados: Atualizar as fronteiras públicas de consulta e ação da versão entregue.
- Fronteiras explícitas com o executor: Manter distintas a representação HTTP normalizada e os protocolos privados ou externos efetivamente suportados.

## Pacote Configuração inicial — Posição 7, sprint-006 — Contratos de observação, fila e transporte em snake_case [IMPLEMENTADA; VALIDAÇÃO PENDENTE]

Data: 2026-10-18. Identidade conferida em `docs/Docs20261017_233303/sprints20261017_233303.json`: índice 6, posição 7, `sprint-006`, feat-016/017. Repositório canônico; histórico e alterações existentes preservados.

### Fontes e prova definida

- Consultados AGENTS.md, SPEC.md, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e convenções/dicionário HTTP da SPEC da feature, especialmente §3.2 e o frame SSE de §4. Cobertura de representação US-01/18/19/23, RNF-04/18. A investigação da falha de socket permanece separada; nenhuma causa foi atribuída à normalização.
- Provas preparadas antes de validar: equivalência recursiva das constraints TypeBox, aliases isolados/combinados, requests montados pelo cliente, HTTP/SQLite para escopo/CAS/recibos/replay, frame SSE próprio, histórico privado de diagnóstico/scaffold e consultas após reopen. Context7 consultado com resolução seguida de consulta sobre TypeBox, objetos fechados e propriedades opcionais; API fixada preservada, sem instalação.

### Implementação

- `packages/contracts/src/http-observation/`: DTOs `Http*` explícitos para resumo operacional, diagnósticos, eventos/páginas/queries, fila e scaffold. Reutilizam contratos comuns e as projeções de execução já normalizadas. Campos opcionais, null, limites, variantes, objetos fechados e params de path são preservados.
- `http/observation-views.ts` e rotas operation/events/queue/scaffold: serialização por campos conhecidos e decodificação dos requests para os serviços existentes. O escopo/hash dos cursores conserva a mesma tupla de instalação/conta/filtros/ordem; hashes semânticos dos comandos e planos continuam usando os modelos privados anteriores. Não há conversor genérico em produção, migration ou reescrita dos documentos históricos.
- O evento paginado contém `seq/entity_type/entity_id/entity_revision/occurred_at_ms/operation_id/event_type`. O JSON do frame `controller-event` usa `{entity:{type,id},revision,operation_id,event_type,project_id?,attempt_id?,facts}`, com sequência em `id:`. `resync`, Last-Event-ID, limites e encerramento existentes permanecem. O cliente valida o frame pelo schema compartilhado e conserva deduplicação/reconexão sem mutações.
- Dashboard, Registros, diagnóstico, fila, habilitação/pausa e criação de projetos usam os DTOs correspondentes. `api/observation-requests.ts` monta queries e comandos tipados usados pelos consumidores. Assinantes de atualização de configuração/tentativa consomem os nomes do frame novo; seleção e navegação conservam seus identificadores. Layout e CSS não foram alterados.
- Testes novos em `observation-public.test.ts`, `observation-requests.test.ts` e nos arquivos HTTP de diagnóstico/scaffold. Asserções e smoke compilado foram atualizados para a representação pública. As regressões de serviços mantêm os contratos internos; Ready/assignee/consumo único, gates por modo e reconciliação não foram modificados.

### Validação e limites desta rodada

Typecheck, lint, testes, build e smoke **não foram executados**. A instrução da sessão exige esses checks e também proíbe qualquer comando que não comece com `git`. Foi solicitada uma exceção explícita para leituras e checks locais; até este registro, a resposta permanece pendente. Leituras UTF-8 foram feitas pelo filesystem do REPL, edições por apply_patch. Não se executou processo por outro mecanismo para contornar a restrição. Testes escritos e revisão de código não são resultados de validação; a sprint não está declarada validada ou concluída.

Nenhum Git/GH foi executado: o contexto elevado/keyring exigido não está disponível. Sem dependências novas, provider, recrutamento, publicação, tracker, browser, commit/push ou instalação operacional como alvo de migração/limpeza. Aceite visual, integração externa e revisão da referência imutável continuam separados. Nenhuma aprovação, Design Lock ou mudança de fase foi simulada.

A revisão automática rejeitou leituras opcionais da memória e da skill Context7 externas ao repositório por considerá-las conteúdo privado fora do escopo autorizado. Esses conteúdos não foram usados; fontes locais e as ferramentas Context7 sustentaram o trabalho.

## Sprint 007 - Contratos de observação, fila e transporte em snake_case [CONCLUIDA]
- Observações e eventos normalizados: Normalizar operações, diagnósticos, páginas de eventos e frames SSE sem alterar o significado de cursores.
- Fila e scaffold normalizados: Concluir a normalização das superfícies de fila, planos e criações existentes.

## Sprint — Saves atômicos e recuperação idempotente no servidor [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Trabalho no repositório canônico, sem alterações de contrato público, schema ou dependências.

### Fontes e critérios

- `AGENTS.md`; `SPEC.md` §§8.4–8.5; `GLOSSARY.md`; SPEC da feature `docs/Docs20261017_233303/SPEC20261017_233303.md`, US-18, E02, RF-94/95/97 e RNF-02/12/14. A fatia cobre os saves de settings e configuração de projeto; vínculo/onboarding/perfis continuam consumidores posteriores.
- Context7 resolvido e consultado para better-sqlite3 sobre transações síncronas `IMMEDIATE`, rollback por exceção e exclusão de IO externo do callback. Versão/dependências preservadas.
- Repo-graph não está disponível nesta sessão. Nenhuma operação Git de escrita foi executada.

### Implementação

- `configuration-writes.ts`: recovery confere hash do request original, instalação/conta, tipo do comando e identidade do recurso persistido. Divergência retorna 409 antes de usar o recibo. A transação continua revalidando a operação depois do IO de validação e antes do CAS/escrita, cobrindo duas solicitações concorrentes que passaram pela leitura inicial.
- `projects/index.ts`: mantém a ordem pública de `saveSettings` e `saveConfiguration`: valida acesso HTTP pela camada de segurança, recupera a operação correspondente antes de ETag antigo e validação de diretório/GitHub; sem registro aceito, segue validação e storage reconfere revisão/contexto no commit.
- `saveSettings` e `saveConfiguration` mantêm dados, revisão, perfis/revisão de projeto, operação/recibo e evento na transação síncrona única. `ConfigurationUpdate` grava somente `project_changes`, `global_changes` e `profile_changes` explicitamente enviados; valores omitidos vêm do estado persistido, nunca de rascunho oculto.
- `tests/integration/projects.test.ts`: rollback de settings/perfil com falha injetada em operation/event; duas requisições concorrentes com a mesma chave produzem uma revisão, uma operação e um evento; recovery de settings após reopen ocorre antes de repetir realpath e antes de CAS; recovery de configuração de projeto após reopen não consulta GitHub novamente; divergência de recurso ou conta recebe 409 sem novo evento.
- `scripts/smoke-compiled.mjs`: alinhadas as asserções de `/operation` ao DTO público atual (`active_attempt` e `next_candidates`), sem alterar a projeção do produto.

### Validação observada

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; produção, cliente, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd test -- tests/integration/projects.test.ts --reporter=dot --no-color` | Exit 0; 69 testes em 1 arquivo. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 1.090 testes em 75 arquivos. |
| `npm.cmd run build` | Exit 0; controlador/declarations, recursos e bundle web compilados. |
| `npm.cmd run test:compiled` | Primeira execução reproduziu assertion do smoke com chave camelCase desatualizada; após atualizar o smoke para snake_case, exit 0. HTTP/SSE/SQLite e lock de processo compilados passaram; preflight Maestri/OMP controlado e integração real não executada. |

SQLite, HTTP inject e processos locais do smoke foram exercitados; validação GitHub é controlada na suíte. Nenhum provider, recrutamento, Git/GH, publicação, alteração de credenciais, commit/push, instalação ou migração operacional ocorreu. A falha inicial do smoke era incompatibilidade da asserção com o contrato público vigente, não defeito na projeção compilada; a repetição integral passou depois da correção.

## Sprint 008 - Saves atômicos e recuperação idempotente no servidor [CONCLUIDA]
- Commit, revisão e recibo indivisíveis: Garantir atomicidade dos saves simples e agregados de configuração.
- Recuperação anterior a IO e CAS: Recuperar uma operação aceita antes de repetir validações ou efeitos de negócio.
- Reapresentação restrita de configuração: Suportar a reapresentação explícita da mesma operação de configuração nas condições de E02.

## Sprint 009 - Seleção nativa e validação da pasta [CONCLUIDA]
- Capacidades confiáveis de seleção: Expor seleção assistida de pasta e gh.exe pelas capacidades fixas do host.
- Exclusividade e prazo do seletor: Manter uma única seleção entre tipos, sessões e abas, inclusive após timeout ou desconexão.
- Confirmação real da raiz dos projetos: Validar e persistir acesso e gravação na pasta sem afetar projetos cadastrados.

## Pacote Configuração inicial — sprint-009 — Descoberta do GitHub CLI e contas elegíveis [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-18. Entrega E03, cobertura US-05/06, RF-28–36 e RNF-05/06 da SPEC `docs/Docs20261017_233303/SPEC20261017_233303.md`. A vinculação/troca de conta por operação continua na sprint-010; esta consulta não a antecipa. Sem dependências novas, migration ou alteração do schema 21.

### Fontes e decisões

- Consultados `AGENTS.md`, `SPEC.md`, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` e a SPEC/deltas e critérios da feature. Mantidas as fronteiras: GitHub observado não é conta vinculada; executável descoberto não cria autoridade/keyring; seleção nativa continua sendo capacidade do host.
- Context7 resolvido para GitHub CLI (`/websites/cli_github_manual`). As consultas cobriram `gh auth status`, `--hostname`, `--json hosts`, estado por conta e variáveis do ambiente; Context7 não encontrou a referência específica de `gh --version`. Conforme a regra local, usada documentação oficial como complemento: [manual `gh`](https://cli.github.com/manual/gh), [auth status](https://cli.github.com/manual/gh_auth_status), [environment](https://cli.github.com/manual/gh_help_environment) e [implementação de auth status](https://github.com/cli/cli/blob/trunk/pkg/cmd/auth/status/status.go). Não foram executados comandos GH reais.
- Repo-graph não está disponível nas ferramentas desta sessão. GitNexus não foi usado. Nenhum comando Git/GH real, login, troca de conta, mutação externa, alteração de credenciais ou instalação foi executado.

### Implementação

- `packages/contracts/src/github-setup.ts` define `GitHubExecutableObservation`, `GitHubSetupAccount` e `GitHubSetupOptions`, com objetos fechados e diagnósticos estáticos. `SettingsUpdate.gh_executable_path` é opcional, mas só pode ser usado isoladamente; `SettingsView` continua sem esse detalhe.
- `GET /api/v1/settings/github-options` consulta executável, vínculo armazenado, conta ativa pelo `getIdentity()` existente e status das contas de `github.com`. `gh auth status --hostname github.com --json hosts` usa somente campos allowlisted de `state/host/login/active`; não usa `--show-token`, não serializa `token`, `error`, scopes ou stderr, não chama login/switch e não grava conta. `valid` deriva do estado autenticado do CLI; `eligible` exige conta ativa válida e correspondência da identidade GraphQL. Inativas, inválidas e divergentes recebem orientação fixa.
- `GitHubExecutableResolver` procura `gh.exe` em `PATH`, `GH_PATH`, caminho salvo e caminho explicitamente selecionado/salvo. Cada candidato passa por verificação de arquivo e `gh --version`; falhas permitem continuar e diagnósticos não incluem paths recusados. A varredura possui teto de 256 candidatos e orçamento de 12 s; o resultado fica `unavailable` e declara busca incompleta se ultrapassar esses limites. GH_TOKEN/GITHUB_TOKEN não participam da descoberta. A interface pública devolve somente a observação; `GitHubContext` permanece privado no resolver e exige a capacidade fornecida pelo host.
- Salvar o EXE usa `PUT /api/v1/settings` com `changes:{}` e `gh_executable_path`, ETag e Idempotency-Key já existentes. O serviço recupera primeiro operações idênticas, revalida o arquivo/versão antes do commit e atualiza a referência compartilhada somente após sucesso do storage. O path é consultável por `github-options`; recibo e replay por `/operations/:operationId`. Nenhuma migration foi necessária porque `gh_executable_path` já existe na migration 019.
- `scripts/start-host.mjs` exige agora quatro executáveis (Git, Maestri, OMP e PowerShell), sem GH prévio. O preflight Maestri/OMP permanece antes do scheduler/HTTP. A composição fornece acesso GH separadamente do path; com ausência dessa capacidade, descoberta/auth retornam indisponibilidade sem formar `GitHubContext`.
- A aplicação cria uma única instância GitHub dinâmica e a passa a Configuração, Diagnósticos, fila, Preparações, pipeline e workspaces de verificação/publicação/scaffold. Clientes existentes consultam o resolver em cada chamada, então caminho salvo substituído não deixa closure presa ao EXE anterior. O callback de “envio possível” da consulta GraphQL agora ocorre no evento spawn do processo nativo, depois de resolver contexto; ausência de contexto continua falha conhecida, e perda após início continua desconhecida.
- Atualizados `docs/operation/README.md`, `README.md` e o roteiro da primeira fatia. Nenhum componente de interface foi criado nesta sprint.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; código, web, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; limites e convenções. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0 na versão final; **1.115 testes em 77 arquivos**. Suíte externa permanece controlada; nenhum provider ou auth-status real. |
| Testes focados de executor/auth/settings/startup | Exit 0; resolução ordenada, candidato inválido→seguinte, GH_PATH→salvo, path salvo após reopen, save isolado/idempotente, conta ativa/inativa/inválida, identidade/vínculo separados, resposta sanitizada, cliente existente após troca e startup sem GH. |
| Revalidação focada após manter GitHubContext interno ao resolver | Exit 0; **100 testes em 4 arquivos relevantes**, incluindo replay/reopen do path. |
| `npm.cmd run build` | Exit 0; controlador, migrations/recursos e cliente compilados. Vite mantém o aviso do bundle acima de 500 kB (758,49 kB minificados). |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, sessão/CAS/idempotência, catálogo, diagnóstico, shutdown e lock; preflight Maestri/OMP controlado. |
| `npm.cmd run test:distribution` | Exit 0; pacote relocado, assets/API, SQLite, processos/cwd distintos, restart e identidade persistente; Maestri/OMP controlados. |
| `hostContext` compilado com quatro paths EXE fictícios | Exit 0; compõe Git, Maestri, OMP e PowerShell sem path GH. Não inicia o controlador nem executa GH. |

SQLite, HTTP inject, processos e pacote local foram exercitados; candidatos GH, auth status e identidade são controlados nas provas. GitHub/Windows keyring real, contas reais e execução Maestri/OMP integrada permanecem sem prova. Nenhuma conta foi vinculada ou alterada; descoberta e observação não concedem autoridade, e os critérios de integração externa não são declarados aceitos por fixtures.

## Sprint 010 - Descoberta do GitHub CLI e contas elegíveis [CONCLUIDA]
- Descoberta ordenada e caminho salvo: Resolver candidatos GH válidos na ordem aprovada e permitir persistência do caminho selecionado.
- Observação sanitizada de contas: Consultar contas somente de github.com e distinguir observação de vínculo.
- Bootstrap sem GH prévio e dependência compartilhada: Permitir carregar a aplicação incompleta e propagar o GH resolvido aos módulos consumidores.

## Sprint — Vínculo explícito e troca segura de conta [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PENDENTE]

Data: 2026-10-18. Continuidade no repositório canônico, preservando as alterações existentes. Escopo US-06/07/18, RF-37–42 e RNF-08/12. Nenhuma dependência, operação Git/GH, login, mutação externa, alteração de credenciais ou migração adicional.

### Fontes e comportamento

- Reutilizados `result_account_id` e seus guards da migration 019, o ETag composto de settings e a recuperação anterior a IO/CAS. `AccountBinding` e `SettingsUpdate.account_binding` aceitam somente ação `bind`/`switch` e `account_id`; o comando exige `changes: {}` sem perfil, caminho GH ou outras alterações.
- `PUT /api/v1/settings` reconsulta o executável, o status de autenticação do GitHub CLI para `github.com` e a identidade GraphQL. O destino precisa ser a única identidade ativa, válida e elegível observada. A operação retorna conflito quando não há vínculo para switch, já existe vínculo para bind ou o destino é o atual.
- Storage confirma conta, revisão, operação de tipo `settings.account.bind/switch`, recibo e evento numa transação IMMEDIATE. Switch consulta qualquer tentativa da conta de origem com `result IS NULL`, sem filtrar fase ou suspensão. Limpeza incerta de tentativa encerrada não bloqueia a troca; permanece na origem e pode gerar o aviso `PRIOR_ACCOUNT_CLEANUP_UNCERTAIN`.
- O início valida novamente a conta vinculada e a observação corrente; divergência persiste pausa e impede criação. A troca não edita automação nem `controller_authority`.
- Consulta/recuperação da operação aceita uma exceção limitada ao mesmo `operation_id`, instalação e conta de destino ainda vinculada, com tipo, recurso settings/local, evento e recibo conferidos. Operações comuns, eventos, listagens e dados da conta de origem continuam fora do contexto de destino. Terceira conta não recebe a exceção anterior. Settings revision/ETag e cursores permanecem escopados por conta.

### Provas acrescentadas e validação

- `tests/integration/account-binding.test.ts` cobre PUT protegido e schemas, conta inativa, combinação indevida de alterações, replay após reopen antes de nova observação externa, vínculo/troca, terceira conta, tentativa sem resultado, corrida entre início e switch e aviso de limpeza incerta.
- Typecheck, lint, suíte e build ainda não foram executados nesta rodada. A instrução de terminal desta sessão limita comandos a Git somente-leitura, o que conflita com os comandos de validação solicitados; nenhum executor alternativo foi usado. A implementação e as novas provas permanecem sem validação técnica até que esses comandos possam ser executados.
- Nenhuma operação Git foi executada. Revisão independente, integração GitHub real e aprovação do pipeline não são declaradas.

## Sprint 011 - Vínculo explícito e troca segura de conta [CONCLUIDA]
- Vínculo exclusivo e revalidado: Persistir a seleção explícita da conta elegível sem acumular outras alterações.
- Impedimento de troca durante tentativa sem resultado: Serializar troca de conta com novos inícios e preservar pendências residuais.
- Recibo recuperável após bind ou switch: Aplicar a exceção estrita de consulta do recibo no contexto de destino.

## Sprint — Catálogo OMP suportado e compatibilidade por capacidade [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA; INTEGRAÇÃO REAL PENDENTE]

Data: 2026-10-18. Cobertura US-13–15, RF-66/69/70/74/81 e RNF-03, conforme E04 e a SPEC da configuração inicial. Nenhuma dependência foi instalada. Nenhum provider, terminal Maestri ou OMP real foi iniciado; nenhum comando Git/GH, efeito externo ou publicação ocorreu.

### Fontes e alcance

- Consultados `AGENTS.md`, `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md`, `GLOSSARY.md`, `docs/Docs20261017_233303/PRD20261017_233303.md` e a seção E04 de `docs/Docs20261017_233303/SPEC20261017_233303.md`.
- Context7 resolveu `/can1357/oh-my-pi`; os documentos oficiais atuais e a referência versionada v18.11.1 confirmam `omp models --json`, o escopo de modelos chat disponíveis e os campos do catálogo. A integração usa essa interface da distribuição OMP já configurada; não instala/importa outra distribuição e não chama `omp models refresh`. `provider_name` espelha o ID, pois a resposta JSON documentada não inclui rótulo de provider separado.
- O comando local `omp models --json` não foi executado nesta rodada. A versão `18.11.1` registrada anteriormente em `docs/integration/maestri-omp-adapter.md` é observação histórica, não versão atual revalidada nem requisito de compatibilidade.

### Implementação

| Superfície | Resultado |
| --- | --- |
| Catálogo e contratos | `Execution.getCatalog()` consulta `omp --version` apenas para metadado e usa `omp models --json` no executável, cwd e ambiente do host. O parser exige resposta completa, lista não vazia de modelos `chat`, identificadores/selectores consistentes, nomes e esforços válidos e identidades únicas. `ExecutionCatalog` é uma união fechada em snake_case. Falha, código de saída diferente de zero, vazio, JSON inválido, linha parcial ou incompatibilidade retornam `unavailable` com diagnóstico fixo; nenhum subconjunto é publicado como carregado. |
| Projetos e HTTP | `Projects.getExecutionOptions()` injeta a interface pública de execution e consulta novamente em cada chamada. `GET /api/v1/settings/execution-options` usa sessão/segurança HTTP existentes e retorna 200 para observação `loaded` ou `unavailable`. Ausência do contexto e erro interno são convertidos em diagnóstico sanitizado. O endpoint não é consultado no bootstrap e não grava perfil. |
| Esforço ausente | `CatalogModel.efforts=[]` é produzido quando a CLI retorna `thinking:null` ou lista vazia. `ExecutionProfile.effort` aceita `string | null`; a migration **022** reconstrói somente `execution_profiles`, preserva os registros e os FKs de projeto, e permite `NULL` sem aceitar string vazia. A captura por valor e a persistência do perfil efetivo conservam null. |
| Lançamento e compatibilidade | O bootstrap só acrescenta `--thinking <effort>` quando o valor capturado não é null. Extensão e canal aceitam esforço null, normalizando apenas `getThinkingLevel() === undefined` para null. Handshake compara provider, modelo e esforço efetivos exatamente; fallback/clamping divergente não confirma ready. Bootstrap, extensão, canal e preflight deixaram a comparação/faixa `18.11.1`; versão observada segue como metadado. Maestri continua validado por suas opções concretas `list` e `recruit --help`. |
| Distribuição e documentação | `loadMigrations` inclui a migration 022. Para upgrade existente, o runner aplica migrações anteriores com FKs habilitadas e executa a reconstrução da 022 numa transação imediata com FKs temporariamente desabilitadas, validando `foreign_key_check` antes do commit e restaurando o pragma. Nova instalação mantém a transação/seed único. `README.md` e `docs/integration/maestri-omp-adapter.md` registram superfície, escopo e limites. SHA-256 da migration fonte/distribuída: `3eb7b7d469cdff9f9b1b0e3feda0a0cf8c3300e7ba1179d41520a7c9b1fd7d16d`; ambos com 950 bytes e idênticos. |

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na rodada final; produção, web, contratos, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.138 testes em 79 arquivos**. A suíte usa adapters controlados, sem execução de provider/OMP/Maestri real. |
| `npm.cmd run build` | Exit 0; controlador, migration 022, recursos e web distribuídos; bundle web 759,17 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, migration distribuída, shutdown e lock entre processos; preflight do terminal-âncora controlado, Maestri/OMP não executados. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket, framing e launcher Windows com Node como fixture; `maestriOmpIntegration=not_executed`. |
| Testes focados | Exit 0; **136 testes em 4 arquivos** de execução, extensão, projetos/HTTP e perfil/migration. |

As provas conferem catálogo exato com e sem esforço, lista vazia/JSON inválido/linha incompleta/duplicidade/CLI incompatível, consulta HTTP nova por chamada sem escrita, OMP 17.x e 20.0.0-rc.1 com capacidades válidas, omissão de `--thinking`, handshake de esforço nulo e recusa de esforço efetivo divergente. SQLite temporário migra 21→22 com revisão de projeto vinculada, conserva effort histórico, persiste null como SQL NULL, passa `foreign_key_check` e reabre sem alteração.

### Limites

- O catálogo real depende da versão instalada expor o formato documentado `omp models --json`; o adapter valida a capacidade em cada consulta. Não foi observado o catálogo do host nesta rodada. As provas de catálogo e handshake são controladas e não encerram a integração real Maestri/OMP/provider nem critérios INT de execução.
- `getCatalog` não executa inferência nem recrutamento. O OMP conserva seu gerenciamento normal de configuração, autenticação e descoberta de modelos; a fábrica não mantém catálogo paralelo nem usa a ação explícita `refresh`.
- Nenhum Git/GH foi executado; o contexto elevado com keyring continua indisponível. Não houve commit/push, revisão independente da referência imutável, aprovação de pipeline ou mudança de fase.

## Sprint — Catálogo OMP suportado e compatibilidade por capacidade [CONCLUÍDA LOCALMENTE]
- Consulta tipada do catálogo local: Expor a superfície documentada do OMP através de `Execution` e `GET /settings/execution-options`, recusando resultados vazios/incompletos/incompatíveis.
- Esforço ausente e confirmação efetiva: Persistir ausência como null, omitir a flag e conferir a configuração efetivamente aplicada pela TUI.
- Compatibilidade por capacidade: Remover travas numéricas de OMP mantendo validações concretas, protocolo e metadados da versão observada.

## Sprint 012 - Catálogo OMP suportado e compatibilidade por capacidade [CONCLUIDA]
- Consulta real do catálogo local suportado: Acrescentar getCatalog à interface pública de execution e expor a observação por projects.
- Esforço ausente e configuração efetiva exata: Representar ausência de esforço e conferir as escolhas efetivamente usadas pelo executor.
- Compatibilidade sem trava de versão OMP: Retirar rejeições por versão fixa preservando validações concretas de protocolo e capacidade.

## Sprint — Perfis tipados e comandos explícitos de manutenção [EM IMPLEMENTAÇÃO; DECISÃO DE MIGRATION PENDENTE]

Data: 2026-10-18. Trabalho no repositório canônico, preservando as alterações existentes. Nenhuma dependência foi instalada e nenhuma operação Git/GH foi executada.

### Fontes e estado

- Consultados AGENTS.md, SPEC.md, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e a SPEC do pacote em `docs/Docs20261017_233303/SPEC20261017_233303.md`, especialmente US-13/14/16, RF-63/67/69–76 e RNF-13.
- A SPEC define `profile_type` como obrigatório sem default e `name_key` como `name.trim().toLowerCase()`, com unicidade global entre perfis vivos. Também proíbe recriação de tabelas e backfill inventado de perfis antigos. A migration ainda não foi escrita; foi solicitada uma decisão sobre essa incompatibilidade.
- A documentação oficial do SQLite informa que `ALTER TABLE ADD COLUMN` com `NOT NULL` exige default não nulo. A pergunta ao usuário oferece recriar somente a tabela vazia, preservar a tabela com restrições por triggers ou ajustar a SPEC. Nenhuma escolha foi recebida ainda.

### Implementação parcial

- Contratos de perfil global incluem `profile_type`, `ProfileChanges` com comandos fechados de create/update/delete, patch de update não vazio validado pelo serviço, e `profile_counts` com `all`, `implementer` e `reviewer`.
- `ExecutionProfileValue` mantém o formato sem tipo utilizado pelas capturas históricas e pelo protocolo privado do executor. As consultas globais projetam apenas perfis vivos e não expõem `name_key` ou `deleted_at_ms`.
- `settings` e o save agregado aplicam comandos de perfil na transação existente. Criação gera UUID no servidor e normaliza orientação omitida para vazio. Atualização combina somente o patch recebido com a linha atual do banco. Mudança de tipo e exclusão retornam conflito nesta fatia.
- O serviço valida criação e alterações de provider/modelo/esforço contra o catálogo OMP atual; indisponibilidade permite somente edição de nome/orientação sem consulta de catálogo. Esforço nulo só passa quando o modelo não oferece esforço.
- O consumidor existente da configuração envia os comandos de perfil e oferece tipo inicial na criação, sem ação de exclusão ou edição de tipo.
- Foram acrescentadas provas de contratos, catálogo, contagens, patches, indisponibilidade, combinações, nomes e concorrência em `tests/integration/projects.test.ts`; a migration e as provas de compatibilidade ainda dependem da decisão acima.

### Validação e pendências

Typecheck, lint, testes e build não foram executados. A regra de terminal desta solicitação permite somente comandos Git de leitura e proíbe os comandos npm necessários à validação. A migration schema 23, a recusa preservadora de bancos com perfis antigos, as adaptações das fixtures históricas e a validação técnica permanecem pendentes; não se declara a sprint concluída.

## Sprint 013 - Perfis tipados e comandos explícitos de manutenção [CONCLUIDA]
- Schema de perfis tipados e exclusão lógica: Introduzir os campos finais de perfil sem provisionamento automático ou classificação inventada de dados antigos.
- Criação e edição por comandos de perfil: Aplicar ProfileChanges em settings e nos saves agregados explícitos de configuração.
- Edição preservada sem substituições de catálogo: Permitir manutenção de nome/orientação quando as opções de execução não podem ser substituídas.

## Sprint 014 - Integridade dos perfis e validação de início [CONCLUIDA]
- Exclusão e mudança de tipo com impedimentos atuais: Manter referências de projetos e tentativas consistentes no momento da gravação.
- Serialização de referências e captura imutável: Revalidar padrões, preparação e início contra exclusão ou mudança de tipo concorrente.
- Pré-requisitos de perfis no início: Distinguir ausência de perfis, modelo comprovadamente ausente e indisponibilidade da consulta.

## Sprint — Progresso e conclusão do onboarding no servidor [IMPLEMENTADA NO WORKSPACE; VALIDAÇÃO PENDENTE]
- Visão compartilhada de configuração: Incluir onboarding derivado, `profile_counts`, `selection_capabilities` e `event_cursor` em SettingsView/ConfigurationView, sem chamadas externas nos GETs.
- Supressão e conclusão independentes: Persistir `suppressed` e `complete: true` pelo save existente, com validação reexecutada e conclusão imutável.
- Conclusão sem efeitos e pendências posteriores: Preservar o marco, recuperar recibos sem novo IO e expor falhas atuais nos diagnósticos de configuração.

## Sprint 015 - Progresso e conclusão do onboarding no servidor [CONCLUIDA]
- Visão compartilhada de configuração: Retornar os fatos necessários ao wizard e às telas posteriores sem consultas externas implícitas.
- Supressão e conclusão independentes: Persistir preferência de abertura e marco histórico por comandos explícitos.
- Conclusão sem efeitos e pendências posteriores: Preservar o marco histórico e orientar problemas futuros sem reiniciar configuração inicial.

## Sprint 016 - Ciclo de save, rascunhos e operações incertas na web [CONCLUIDA]
- Rascunhos e contexto de edição preservados: Separar leitura, erro de leitura, save, conflito e incerteza por contexto.
- Consulta e reapresentação da mesma operação: Recuperar resultados perdidos preservando a identidade original e as restrições de contexto.
- Limite conjunto de save e rebootstrap seguro: Preservar atomicidade dos saves e recuperar a sessão técnica sem repetir efeitos.

## Sprint — Formulário compartilhado de perfis [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PENDENTE]

Data: 2026-10-18. Editor reutilizável conectado ao diálogo existente da aplicação. Sem dependências novas ou operações Git de escrita.

### Implementação

- `ProfileForm` atende criação e edição no mesmo formulário, dentro do único modal do `AppShell`; título, ação principal, fundo, X, foco e rodapé seguem o shell/modal existente. Campos acessíveis aparecem em ordem: Nome, Tipo, Executor, Provider, Modelo, Esforço e Orientações. A grade mantém Provider/Modelo lado a lado e empilha os campos em telas estreitas.
- Provider, modelo e esforço são derivados do catálogo OMP. Esforço sem opções usa `null` e “Não se aplica”. A opção “Não se aplica” fica indisponível quando o modelo oferece esforços; a combinação inválida continua visível até o operador escolher um valor compatível.
- Mudanças explícitas preservam modelo e esforço compatíveis; dependências incompatíveis são limpas. Valores removidos por atualização do catálogo permanecem no rascunho com aviso e não são enviados como escolha válida.
- Cada gravação usa um único comando `profile_changes`, construído apenas com a intenção deste formulário. Combinações inválidas ou catálogo indisponível permitem salvar somente nome/orientação, sem transmitir a seleção do rascunho. Conflito, duplicidade, 413, falha e operação incerta mantêm o editor aberto e os valores; consulta/reapresentação conserva a identidade original do comando.
- Respostas de catálogo são protegidas por número de solicitação e cancelamento. A atualização do catálogo não limpa erro de gravação. O desmontar do formulário agora libera o bloqueio de save do shell para evitar modal preso após troca de contexto enquanto há request em voo.
- `profile-editor.test.ts` acrescenta regressões para `null` inválido quando o modelo oferece esforço, patch único com somente campos alterados e preservação da combinação persistida quando o catálogo atualizado remove o provider.

### Validação e limites

- Typecheck, lint, testes e build não foram executados nesta rodada. A regra de terminal da solicitação permite somente comandos `git`; ela conflita com os comandos necessários que a tarefa também pede para validação. Nenhum executor alternativo foi usado.
- `git diff --check` passou. Sem execução de navegador; o código e os padrões visuais aprovados foram conferidos estaticamente, sem declarar aceite Chrome.

## Sprint 017 - Formulário compartilhado de perfis [CONCLUIDA]
- Editor único com campos e ações aprovados: Criar ProfileForm/ProfileDialog reutilizáveis no host modal existente.
- Escolhas dependentes e refresh sem perda: Aplicar as regras de catálogo ao rascunho sem substituição silenciosa.
- Save isolado e preservação da combinação: Enviar somente a intenção do modal e permitir manutenção de texto sem persistir escolhas inválidas.

## Sprint — Tela Perfis Globais e manutenção contextual [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PENDENTE]

Data: 2026-10-18. Implementação da coleção global e manutenção contextual dos perfis na Principal, reutilizando ProfileForm, a API de settings e os gates de integridade existentes. Nenhuma dependência nova ou operação Git de escrita.

### Implementação

- `hash-route.ts`, `AppShell.tsx` e `PrincipalScreen.tsx`: adicionam a rota `#principal/perfis`, item Perfis acessível imediatamente abaixo de Vincular existente, `aria-current`, título, descrição e ação Novo perfil dentro da coleção.
- Novo `ProfilesPanel.tsx`: lê somente perfis vivos e `profile_counts` de settings; apresenta cartões com ícones distintos da navegação, provider/modelo/orientação/tipo/esforço, busca por substring sem caixa/acentos e par provider/modelo derivado exclusivamente da coleção. Busca, modelo e papel combinam; contagens permanecem da resposta do servidor. Save confirmado espera o cursor do evento observado antes de declarar lista/contagens atualizadas. Sem resultado, Limpar filtros restaura os três filtros sem consultar OMP.
- Exclusão pede o nome exato, mostra o aviso quando é o último perfil vivo do papel e continua habilitada. Comandos usam ETag e Idempotency-Key; recibo/resultado incerto são consultados sem replay cego. `PROFILE_ACTIVE_ATTEMPT_BLOCKED` apresenta a quantidade e espera do resultado; `PROFILE_DELETE_BLOCKED` fornece links para configurações dos projetos relacionados e a orientação de substituição.
- `ProfileForm.tsx` permite mudança de tipo. `profile-editor.ts` envia somente o campo alterado no comando existente; ao mover o último perfil de um papel, o formulário mostra antes do save o aviso de que novos inícios podem ficar bloqueados. Não adiciona confirmação extra ou bloqueio por tentativa ativa. Se o servidor recusar a mudança por referências atuais, o formulário apresenta links de substituição para os projetos informados.
- `ProjectForm.tsx` remove o CRUD duplicado da configuração global; as seleções de projeto mostram exclusivamente perfis do papel correspondente e oferecem acesso a Perfis Globais quando uma seleção está ausente/incompatível. `PreparationDialog.tsx` aplica o mesmo filtro por papel, preserva a escolha histórica não compatível como diagnóstico e liga à coleção quando falta um papel.
- `profile-collection.ts` e seus testes cobrem busca com acentos, espaços internos preservados, combinações de filtros, pares homônimos por provider, tipos de papel, último perfil e confirmação digitada. `web-state.test.ts` cobre a rota. CSS segue os tokens/shell existentes e empilha filtros/cartões em telas estreitas.

### Validação e limites

- A sessão permite somente comandos Git de leitura e proíbe comandos de terminal não Git; por isso typecheck, lint, testes e build não foram executados. `git diff --check` passou após a inspeção final.
- Skills de design pedidas não aparecem no catálogo acessível e não há ferramenta `load_skill` nesta sessão. A composição segue o shell e os tokens existentes. O inventário CUA retornou `apps: []` e `browsers: []`; aceite visual Playwright/Chrome continua sem prova.

## Sprint 018 - Tela Perfis Globais e manutenção contextual [CONCLUIDA]
- Navegação e coleção real de perfis: Criar a área Perfis Globais no shell existente.
- Busca, pares de modelo e abas combinados: Filtrar a coleção cadastrada conforme a semântica exata da SPEC.
- Confirmações e acesso aos perfis corretos: Expor exclusão, impedimentos e alertas do último perfil sem alterar as regras do servidor.

## Sprint — Configuração guiada de GitHub e pasta [IMPLEMENTADA; VALIDAÇÃO PENDENTE]

Data: 2026-10-18. Componentes e hooks reutilizáveis adicionados à Configuração global, preparados para uso posterior no wizard. Contratos e endpoints E03/E05 existentes foram reutilizados; nenhum efeito GitHub, login, troca global ou IO nativo foi executado nesta implementação.

### Componentes e hooks

- `GitHubSetupPanel.tsx` recebe `SettingsView`, ETag, observação e seleção nativa compartilhadas. Exibe logins vinculados/observados, distinção de contas ativas, inválidas e elegíveis, e ações separadas para verificar status e vincular/trocar. A UI não solicita IDs nem dispara login/troca do GitHub CLI.
- `useGitHubSetup.ts` consulta `GET /settings/github-options` somente por ação explícita; salva `account_binding` isolado com ETag/Idempotency-Key e exige recibo antes de mostrar confirmação. Divergência de conta não altera o vínculo. Resposta incerta conserva a operação original e oferece somente consulta; falha da consulta não apaga erro ou recibo do save. Um bloqueio `ACCOUNT_SWITCH_ATTEMPT_ACTIVE` consulta tentativas ativas no contexto de origem para abrir a tentativa pertinente. Avisos de limpeza residual aparecem como informação, sem confirmação adicional.
- `ProjectsFolderField.tsx` distingue pasta persistida, edição e candidato do seletor. Cancelamento não altera a edição; usar candidato somente a coloca no rascunho. O save existente revalida acesso/gravação e exige recibo; a ação explícita de revalidação envia somente `projects_root`, inclusive quando o valor coincide com a raiz já persistida. Falha mantém rascunho e valor persistido, oferecendo nova tentativa de validação ou outra pasta. A explicação informa que a raiz nova vale somente para novos projetos.
- `useNativeSelection.ts` centraliza `POST /settings/selections` para pasta e `gh.exe`, aplicando timeout de 125 segundos à seleção, distinguindo espera, cancelamento, concorrência, expiração e fechamento não confirmado. O hook não reabre seletor automaticamente. O seletor de `gh.exe` só aparece após a observação indicar ausência de executável válido; caminho selecionado permanece candidato até save isolado, validação do controlador e recibo.
- `ProjectConfigurationForm` fornece a mesma observação de settings/ETag e uma instância compartilhada do seletor aos dois módulos. A rota global mostra GitHub; a raiz continua disponível na configuração global e por projeto. CSS segue os tokens e breakpoints existentes.
- `github-setup-model.test.ts` cobre seleção de contas elegíveis, vínculo/troca e revisão de contexto; `native-selection.test.ts` cobre prazo e mensagens de cancelamento, candidato, expiração e capacidade ausente.

### Validação e limites

- Typecheck, lint, testes e build não foram executados: a restrição de terminal desta solicitação permite somente comandos `git` de leitura. Os testes foram escritos, mas não são apresentados como aprovados.
- Não houve aceite visual Playwright/Chrome nem acesso GitHub/host real. A verificação real do CLI, as janelas nativas e a revalidação da pasta só ocorrem mediante ação do operador no host configurado.

## Sprint 019 - Configuração guiada de GitHub e pasta [CONCLUIDA]
- Painel GitHub por login: Apresentar descoberta, contas e vínculo com ações distintas e recuperáveis.
- Seleção assistida de pasta e executável: Conectar a UI às capacidades nativas sem tratar candidato como configuração salva.
- Configuração posterior sem efeitos retroativos: Reutilizar os componentes na gestão posterior e explicar os limites de cada alteração.

## Sprint — Wizard inicial com retomada e conclusão [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PENDENTE]

Data: 2026-10-18. Composição do fluxo inicial no modal compartilhado, usando os componentes existentes de GitHub, seleção da pasta e perfil. Nenhuma dependência, operação Git/GH, login, alteração externa, recrutamento ou início de trabalho foi executado.

### Implementação

- `features/onboarding/useOnboarding.ts` consulta a visão persistida de settings, atualiza por eventos/polling e salva a pasta, a supressão e a conclusão por comandos settings separados com ETag, Idempotency-Key, recibo e consulta/reapresentação segura da mesma operação.
- `InitialSetupDialog.tsx` deriva a primeira etapa incompleta dos fatos do servidor, permite voltar e abrir etapas já confirmadas e bloqueia avanço até que o estado reconsultado confirme conta, pasta e ambos os tipos de perfil. O formulário de perfil reutilizado fixa o papel solicitado e mantém o retry do catálogo OMP.
- `AppShell.tsx` abre o wizard uma vez por entrada na Principal somente quando pendente e não suprimido; polling não substitui outros diálogos nem reabre o fluxo na mesma entrada. X, Escape, fundo, navegação entre etapas e volta do navegador preservam a edição ou oferecem continuar/descartar. O conteúdo permanece montado durante a confirmação; descarte limpa somente candidatos e formulário não salvos.
- `DashboardPanel.tsx` mostra o acesso ao wizard enquanto pendente e encaminha pendências posteriores à Configuração ou Perfis após conclusão. A ação de reabertura some quando o marco persistido é confirmado.
- `hash-route.test.ts` cobre o identificador do diálogo inicial. CSS novo conserva tokens, shell e modal únicos, com composição responsiva para etapas, progresso, confirmação e estados de erro.

### Validação e limites

- Typecheck, lint, testes, build e navegador não foram executados. A restrição desta tarefa permite somente comandos Git e proíbe comandos de terminal não Git, em conflito com os checks solicitados. Nenhum executor alternativo foi usado.
- `git diff --check` passou. A leitura estática não comprova compilação, comportamento HTTP/browser, foco renderizado ou integração externa. A validação técnica e visual permanecem pendentes.

## Sprint - Wizard inicial com retomada e conclusão [IMPLEMENTADA]
- Etapas confirmadas por recibo: Conduzir GitHub, pasta e dois perfis com retomada derivada dos fatos persistidos.
- Fechamento seguro e supressão: Preservar ou descartar somente rascunhos locais e salvar a preferência de não reabrir separadamente.
- Conclusão e pendências atuais: Mostrar sucesso após confirmação do servidor e manter problemas posteriores nas telas correspondentes.

## Sprint 020 - Wizard inicial com retomada e conclusão [CONCLUIDA]
- Etapas com avanço confirmado: Conduzir GitHub, pasta e perfis sem permitir saltar saves pendentes.
- Fechamento, descarte e supressão: Permitir interromper a configuração sem perder fatos persistidos ou fechar edição silenciosamente.
- Conclusão e pendências posteriores: Apresentar a conclusão confirmada e encaminhar problemas futuros às telas pertinentes.

## Sprint 021 - Minutos exatos e preservação do valor salvo [CONCLUIDA]
- Entrada decimal exata em minutos: Editar intervalo de consulta e tempo ativo em minutos sem arredondamento silencioso.
- Round-trip da apresentação aproximada: Conservar os inteiros originais quando a exibição limitada não representa o valor exatamente.

## Sprint — Orientação dos campos e linguagem do operador [IMPLEMENTADA; VALIDAÇÃO TÉCNICA PENDENTE]

Data: 2026-10-18. Continuidade no repositório canônico, preservando as alterações de configuração inicial e sprints anteriores. Cobertura transferida integralmente de feat-059/060, US-01/02 e RF-01–08/RF-59; fontes consultadas: `AGENTS.md`, `SPEC.md`, `GLOSSARY.md`, contratos comuns da sprint-025, edição em minutos da sprint-021, ciclo de save da sprint-016 e os componentes indicados nesta tarefa.

### Implementação

- Ajuda associada aos campos: `FieldHelp` fornece textos por campo com propósito, obrigatoriedade, momento de uso, formato/exemplo e consequência. Os formulários de cadastro/configuração, perfis, preparação e onboarding reaproveitam as mesmas descrições. A configuração separa dados necessários para começar de controles que podem permanecer no padrão. O TTL explica a expiração de perguntas e sua independência dos dois tempos em minutos.
- Estados e suporte: `operator-language.ts` traduz estados, erros, eventos e fatos; `OperatorSupport.tsx` reúne códigos, referências de operação/solicitação, ETags, cursores e fatos em detalhes técnicos recolhidos. A camada mantém valores de recibos/CAS no cliente e não altera os contratos ou os comandos enviados.
- Superfícies: Dashboard e Registros usam rótulos humanos e projetam diagnósticos com título, causa e próxima ação; o detalhe da tentativa, perguntas e publicação oculta IDs e estados internos na visão comum. Campos técnicos de eventos e filtros ficam recolhidos. A conta sem vínculo aparece como pendência de vínculo, sem expor `ACCOUNT_UNOBSERVED` como explicação principal.
- Segurança e privacidade da apresentação: códigos de estado não reconhecidos mostram explicação e acesso a suporte; fatos como `expected_account_id`, `observed_host` e `profile_count` têm rótulos em português. O leitor de suporte filtra nomes de chaves indicativos de segredo e o detalhe genérico do registro limita-se a fatos técnicos allowlisted.
- Arquivos novos: `apps/web/src/app/operator-language.ts`, `OperatorSupport.tsx`, `operator-language.test.ts` e `apps/web/src/features/projects/FieldHelp.tsx`. Componentes afetados incluem `ProjectForm.tsx`, `PreparationDialog.tsx`, `ProfileForm.tsx`, `DashboardPanel.tsx`, `RecordsPanel.tsx`, `AttemptDetailDialog.tsx`, `QuestionDecisionCard.tsx`, `PublicationDialog.tsx`, `GitHubSetupPanel.tsx` e `ProjectsFolderField.tsx`. `artifact.css` contém os estilos de ajuda e detalhes recolhidos; `http/errors.ts` traduz as mensagens genéricas de erro do controlador.

### Validação e limites

- `git diff --check` passou. A suíte de validação solicitada ainda não foi executada. A mesma instrução desta tarefa permite somente comandos `git` de leitura e proíbe comandos de terminal que não comecem com `git`; isso impede executar typecheck, lint, testes e build sem uma exceção. Nenhum executor alternativo foi usado.
- Foram acrescentados testes unitários de localização de erros/estados/fatos e de cobertura da ajuda de TTL e dos campos em minutos. A presença dos testes não representa aprovação.
- As skills de design nomeadas no pedido e a ferramenta `load_skill` não estavam disponíveis no catálogo desta sessão. A composição existente e os tokens aprovados foram preservados; esta implementação não declara aceite visual Playwright/Chrome.
- Nenhum provider, GitHub, Maestri/OMP, alteração de credenciais, publicação, commit, push, aprovação ou mudança de fase foi executado.

## Sprint 022 - Orientação dos campos e linguagem do operador [CONCLUIDA]
- Orientação associada aos campos: Explicar o preenchimento e distinguir requisitos iniciais dos padrões mantidos.
- Mensagens humanas e suporte recolhido: Apresentar estados, bloqueios e fatos em português sem perder metadados de operação.

## Sprint — Diagnóstico e recuperação HTTP/SSE [CORREÇÃO IMPLEMENTADA; VALIDAÇÃO PARCIAL]

Data: 2026-10-18. Registro detalhado em `docs/integration/http-sse-recovery/report.md`. A falha histórica conhecida é `TypeError: terminated` com causa `UND_ERR_SOCKET` após uma conexão local; o artefato não identifica request/etapa nem preserva stack. `EACCES` pertence a uma execução anterior e não explica o erro posterior.

- `events.ts` separa o abort do polling da destruição de `Readable.from`, para permitir EOF normal no prazo delimitado. A documentação Node 24 confirma que o signal associado ao Readable o destrói com AbortError; o relatório registra esse mecanismo concreto no handler, mas deixa a reprodução local e a atribuição do incidente histórico pendentes.
- `event-stream-timeout.test.ts` acrescenta regressões de EOF no transporte HTTP real, erro de leitura com `resync` e precedência de `Last-Event-ID`. `controller-events.ts` concentra reconexão/resync, deduplicação, retry terminal e descarte de resposta após cleanup. Testes web cobrem UTF-8 fragmentado e comprovam o contrato GET-only da seam; contadores dos quatro fluxos de negócio ainda não foram instrumentados diretamente.
- `EventConnectionStatus` apresenta conectando, conectado, reconectando e falha com nomes acessíveis em português. O smoke compilado relata etapa, sequência concluída e causa sanitizada sem converter erro em sucesso.
- Typecheck executado pela TypeScript Compiler API com `tsconfig.check.json`: exit 0 e zero diagnósticos. Lint e testes não foram executados. O emissor TypeScript e a cópia de recursos concluíram; Vite foi bloqueado pelo executor Node da sessão ao importar `node:process`. `npm.cmd run test:compiled` também não foi executado: o terminal está restrito a comandos Git de leitura e o executor alternativo bloqueia o Vite e HTTP loopback. A validação restante está registrada para o orquestrador; nenhum bloqueio foi convertido em aprovação.
- Playwright MCP/Chrome não foi executado. O `ERR_INCOMPLETE_CHUNKED_ENCODING` do browser continua sem associação causal ao fechamento do handler e seu aceite permanece separado.

## Sprint 023 - Diagnóstico e recuperação HTTP/SSE [CONCLUIDA]
- Reprodução e causa comprovada: Localizar a etapa do fechamento antes de decidir se a correção pertence ao produto ou ao smoke.
- Fechamento, cursor e resync sem comandos repetidos: Concluir esperas de transporte e retomar somente observações do contexto pertinente.
- Smoke compilado integral e estados legíveis: Concluir test:compiled e apresentar estados de conexão em português.

## Sprint — Contraste, diálogo acessível e favicon protegido [IMPLEMENTADA; VALIDAÇÃO TÉCNICA E VISUAL PENDENTES]

Data: 2026-10-18. Alterações no repositório canônico, preservando o trabalho existente. Cobertura US-20/21, RF-101/102 e RNF-04/09/10. Nenhuma dependência nova ou operação Git de escrita.

### Implementação

- `tokens.css` altera o acento para `#b94e00`; links, navegação ativa e marca lateral usam esse mesmo tom. A espessura e composição de foco receberam contorno opaco visível para botões, links, campos, seletores e elementos programaticamente focados. Geometria, escala e composição do design permanecem.
- `docs/integration/acceptance-transversal/visual-evidence.md` registra cores, tamanhos de 14 px/13 px e cálculo de 2,91:1 para 5,06:1 nas duas combinações. A medição é local e não declara limiar ou conformidade WCAG; a coleta Chrome da versão atual continua separada.
- `AppShell` conserva um modal React por vez, filtra controles ocultos/inertes, contém Tab/Shift+Tab e recupera foco para o acionador ou navegação ativa. Fechar editor com rascunho pede confirmação; Escape retorna à edição se a confirmação estiver aberta. Etapas, formulário de perfil e confirmações do wizard atualizam o título acessível e o foco sem criar outro diálogo. `dialog-focus.ts` e o teste focado cobrem os limites de foco por teclado.
- A confirmação de exclusão de `ProfilesPanel` usa o elemento `<dialog>` modal, com nome/título e descrição associados, foco no campo, fechamento por Escape sem enviar a mutação, retorno ao acionador ou cabeçalho da coleção e confirmação por nome. Mensagens de erro mantêm associação/role e texto além da cor; o diálogo preserva rolagem em viewports estreitas.
- `resources/favicon.v1.json` define a marca. `copy-resources.mjs`, executado após Vite, gera `dist/web/favicon.ico` como ICO binário 32×32. `index.html` referencia o mesmo caminho; o empacotador exige e copia o arquivo distribuído.
- `installAssets` marca somente rotas estáticas existentes como `publicAsset`; o ICO recebe `image/vnd.microsoft.icon`. A política de `Host`, `Origin`, contexto Fetch, `nosniff`, cache e a sessão/CSRF das APIs permanece. Testes de asset e o smoke do pacote cobrem GET/HEAD, bytes/Content-Type, rotas operacionais anônimas e mutação sem CSRF.

### Validação e limites

- Typecheck, lint, testes, build e smoke do pacote não foram executados nesta rodada. A restrição explícita de terminal permite apenas comandos Git de leitura; por isso não rodei os comandos Node/npm pedidos nem usei outro executor para contornar a regra. Os testes adicionados não são apresentados como aprovados.
- `git diff --check`: exit 0. Inspeção de código e medições calculadas não comprovam o comportamento renderizado. Playwright/Chrome com screenshots atuais, conteúdo, teclado, viewports estreitos e zoom nativo permanecem pendentes e separados das evidências históricas.
- As skills de design solicitadas e `load_skill` não estavam disponíveis entre as ferramentas carregadas. A alteração seguiu tokens e composição aprovados; nenhuma inspeção Chrome ou aceite visual foi presumido.

## Sprint 024 - Contraste, diálogo acessível e favicon protegido [CONCLUIDA]
- Correção medida das combinações de contraste: Corrigir os links e a navegação observados sem redesenhar a aplicação.
- Operação do diálogo único e responsividade: Concluir foco, teclado e acesso às ações nos novos diálogos e na tela Perfis.
- Favicon público específico: Servir o ícone distribuído sem sessão técnica sem ampliar acesso aos dados operacionais.

## Sprint — Consolidação local, segurança e persistência leve [VALIDAÇÃO LOCAL CONCLUÍDA; INTEGRAÇÕES EXTERNAS PENDENTES]

Data: 2026-10-18 (execuções locais concluídas em 2026-10-18, horário de Brasília). Fontes consultadas: `AGENTS.md`, `SPEC.md` §§8/10.2–10.3, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, a SPEC do pacote Configuração inicial e as superfícies listadas abaixo. Os seams exercitados foram endpoints Fastify, persistência SQLite, processo compilado, loopback HTTP/SSE, distribuição e recuperação Git em fixture exclusiva.

### Alteração desta rodada

- `tests/integration/account-binding.test.ts` cobre vínculo desde `account_id` nulo, concorrência CAS entre duas sessões ao salvar pasta, criação separada dos perfis, restart/retomada, conclusão e replay do mesmo recibo sem nova validação externa, manutenção posterior e ausência de projetos/tentativas ou automação implícita. Os corpos passados a `saveSettings` foram anotados como `SettingsUpdate`, corrigindo o widening de `executor` e `complete` que fazia o typecheck falhar.
- Instrumentos controlados: Fastify inject, SQLite e diretórios temporários reais; identidade/autenticação GitHub e catálogo OMP são fixtures. A suíte completa também percorre regressões de segurança HTTP, CAS, isolamento, segredos, operações incertas, histórico, fila e persistência. `test:http` exercita loopback HTTP/SSE; os smokes compilados/distribuídos exercitam processos locais e fixtures, sem provider.
- `npm run typecheck`: exit 0. `npm run lint`: exit 0, “Module boundaries and TypeScript conventions: OK”. `npm test`: exit 0, 91 arquivos e 1.235 testes passaram. `npx vitest run tests/integration/account-binding.test.ts`: exit 0, 8 testes passaram; `npm run test:http`: exit 0, 1 arquivo e 2 testes passaram.
- `npm run build`: exit 0, 356 módulos Vite compilados. Aviso observado: chunk JS de 958,77 kB após minificação excede o limite configurado de 500 kB. `npm run test:compiled`: exit 0; controller, health/session, idempotência/CAS, replay SSE, limite de streams, lock, shutdown, cleanup e restart passaram; HTTP/SSE/SQLite reais no smoke, Maestri/OMP não executado.
- `npm run test:execution-compiled`: exit 0; UTF-8, EOF e diagnósticos de frames passaram com fixture Node, sem Maestri/OMP. `npm run test:verification-compiled`: exit 0; checks nativo aprovado/reprovado, cwd Unicode, rename/sync/checksum e canonicalização passaram; Git materialization e Maestri/OMP não executados.
- `npm run package:local`: exit 0; distribuição criada em `build/Fábrica distribuição-Noc4rW`. `npm run test:distribution`: exit 0; banco fixo `var/factory/factory.sqlite`, duas instâncias em cwd distintos, recusa do segundo controlador, restart e revogação de sessões passaram; Maestri/OMP não executado.
- `npm run test:maintenance-native`: exit 0, 2 arquivos e 2 provas passaram. A saída `AC28_NATIVE_REPORT` registrou dois checks Node aprovados no lifecycle existente, sem mudança de lifecycle/SQL/UI; `AC29_RECOVERY_REPORT` registrou três processos distintos do controlador, paradas físicas observadas, recuperação de ref/tree/base e diff após remoção, com Git CLI somente de leitura na fixture.
- `npm run proof:persistence`: exit 0, `local_persistence_and_process_recovery_passed`. Relatório: `.cache/persistence-proof-5Hgrrr/report.json`. A medição comparou caches de 0, 16 e 64 MiB: tamanhos dos payloads de listagens (335 B), histórico (6.872 B) e polling (3.137 B) permaneceram constantes; database/WAL, evidências e auxiliares também ficaram estáveis durante a fase de cache. O relatório traz latências p95, tamanho do banco/artefatos, recuperação, diff sob demanda e diagnósticos `ARTIFACT_MISSING`, `ARTIFACT_INTEGRITY_FAILED` e `DELIVERY_GIT_UNAVAILABLE`; após remoção elegível, o conteúdo operacional de trabalho ficou em 0 B. Não estabelece SLA de latência.

### Validação e pendências

- `git diff --check`: exit 0 após as alterações desta rodada.
- Permanecem fora da validação: GitHub/keyring real, Maestri/OMP/provider real, aceite visual Playwright/Chrome e publicação externa. Fixtures, `inject`, Git controlado e smokes locais não comprovam essas integrações nem substituem evidência de ambiente real.

O resultado acima comprova os checks locais executados nesta revisão de trabalho. Não representa revisão independente de uma referência Git imutável, aceite externo, aprovação ou mudança de fase.

## Sprint 025 - Consolidação local, segurança e persistência leve [CONCLUIDA]
- Regressões locais dos percursos completos: Verificar os fluxos combinados e suas corridas após todas as fatias funcionais.
- Isolamento, segredos e limites preservados: Consolidar a verificação das fronteiras HTTP, nativas, de conta e persistência.
- Persistência leve e evidência final local: Medir o efeito de caches volumosos e registrar os checks reais da implementação.

## Etapa B — Preparação e encaminhamento do aceite real [ARTEFATOS PREPARADOS; PROVAS B PENDENTES]

Data: 2026-10-18. Escopo US-22–24, RF-103–109 e RNF-19. Esta entrega documental prepara a execução futura; não inicia o pipeline nem autoriza provider, Git/GitHub, Maestri/OMP, navegador ou publicação.

### Fontes e limites

- Consultados `AGENTS.md`, `SPEC.md`, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, a SPEC de configuração inicial e os roteiros/relatórios existentes de primeira fatia, aceite transversal e manutenção.
- Reutilizada como referência, sem reexecução ou reclassificação, a validação local consolidada em `SPEC_PROGRESS.md`, seção “Consolidação local, segurança e persistência leve”. Seus checks locais e a medição 0/16/64 MiB não comprovam integração externa, browser ou revisão imutável desta versão.
- O workspace tem alterações locais; não foi identificada uma ref imutável desta entrega. `HEAD` anterior, inventário ou hashes avulsos não substituem a referência exigida por US-24. Nenhuma operação Git de escrita ou chamada externa ocorreu.
- Conflito documental registrado: o roteiro histórico S20 menciona GitNexus útil; o `AGENTS.md` vigente proíbe GitNexus e orienta `repo-graph`/`graph-search`. Esta preparação segue o AGENTS e mantém o ponto pendente sem alterar a SPEC. As ferramentas de grafo não estavam no inventário desta sessão.

### Artefatos entregues

- `docs/integration/acceptance-b/README.md` e `20261018-01/record.md`: índice, identidade documental, estado local/visual/integração/revisão separado, pré-requisitos, autorização por efeito/provider, classificação de ferramentas e pendências atuais.
- Roteiros `runbook-first-slice.md`, `runbook-publication-ui.md`, `runbook-queue.md`, `runbook-transversal-ui.md` e `runbook-immutable-review.md`: versão, runtime, responsável, raiz/cwd, ferramentas, chamadas seguras, alvo, autorização, horários, resultado, limites e evidências a preencher antes de executar.
- `first-slice/README.md`, `acceptance-transversal/README.md`, `coverage-matrix.md`, `independent-review.md` e `visual-evidence.md` apontam para a preparação nova. Relatórios históricos não foram substituídos; o roteiro visual inclui expressamente o ícone e todos os campos/ações exigidos por US-16 CA3.
- Os roteiros cobrem cadastro desde origem dirty, clone/resultado/checks/revisão/ICR, TUI/MCP/Grafo, pergunta/entrega incerta, cancelamentos/restart/retry; os três modos na mesma versão e reconciliação; consumo/autoridade/pausa da fila; e UI desktop/celular, zoom nativo, teclado/foco, dados/paginação, falhas isoladas, conflito entre abas, capacidade mutável, perguntas concorrentes e reconexão/resync.

### Validação e estado

- `git diff --check`: exit 0 para os arquivos rastreados modificados; os arquivos novos foram verificados com `git diff --no-index --check` sem apontamentos de whitespace (exit 1 esperado porque o conteúdo difere de `NUL`).
- Typecheck, lint, testes e build não foram executados: a restrição desta tarefa permite somente comandos Git de leitura. Nenhum executor alternativo foi usado.
- Nenhum screenshot novo, acesso Wire, preflight Maestri/OMP, chamada GH, provider, efeito Git gerenciado ou mutação remota foi executado. Ausências permanecem `pending`; ferramentas listadas, fixtures e acesso Wire não são declarados integração nativa.
- Esta sprint prepara a revisão e o aceite; não declara resultado integral, aprovação, Design Lock ou mudança de fase.

## Sprint 026 - Etapa B: preparação e encaminhamento do aceite real [CONCLUIDA]
- Roteiros por versão, contexto e autorização: Preparar a execução responsável das provas sem dispará-las pelo harness ou pela suíte padrão.
- Cobertura dos percursos reais e da UI: Preparar os quatro roteiros históricos com os cenários ainda exigidos para a versão entregue.
- Entrega imutável e fechamento sem aprovação implícita: Preparar a revisão independente por referência Git e manter os resultados de cada superfície separados.

## Sprint 001 - Fundação persistente e contratos de exclusão [CONCLUIDA]
- Persistência de autorização, alvos e recibo mínimo: Adicionar as três tabelas normativas e suas proteções de identidade, preservando a base existente.
- Contratos públicos fechados: Definir os tipos wire de exclusão e preparar sua integração tipada com operações existentes.

## Sprint 002 - Pertencimento integral e exceção SQL restrita [CONCLUIDA]
- Inventário relacional exclusivo: Disponibilizar a seleção completa dos registros pertencentes ao cadastro e os bloqueios de propriedade compartilhada ou ambígua.
- Guardas de finalização e prova do ciclo: Permitir DELETE exclusivamente no contexto transacional autorizado e comprovar a remoção dos ciclos da base.

## Sprint 003 - Conferência de alvos e segurança de caminhos [CONCLUIDA]
- Alvos atuais e conferência determinística: Determinar o conjunto completo autorizado a partir da configuração salva e do inventário versionado.
- Proteção lexical, efetiva e de identidade: Identificar caminhos protegidos, sobreposições, links e situações em que a plataforma não oferece garantia suficiente.

## Sprint 004 - Aceite durável e barreiras concorrentes [CONCLUIDA]
- Aceitação idempotente e atômica: Aceitar somente a conferência atual e estabelecer operação, pendência e alvos de forma indivisível.
- Barreira de trabalho e sobreposição de vínculos: Integrar a pendência aos autorizadores existentes e às gravações que possam comprometer exclusividade.

## Correção feat-009 — remoção por referência [PENDENTE; CAPACIDADE NATIVA NÃO LIBERADA]

- Fonte de verdade: `docs/Docs20261020_114742/SPEC20261020_114742.md`, §3.2, protocolo de filesystem, itens 4–9. Não alterar as identidades originalmente aceitas nem procurar pastas movidas.
- `workspaces.removeProjectDeletion` revalida todo o conjunto antes de cada alvo, mantém as identidades originais, interrompe novos efeitos na primeira falha e reconcilia ausência ao terminar. Erros têm motivo/ação sanitizados; substituição conserva a orientação normativa de retirada externa da substituta.
- Candidato Windows/NTFS: `resources/deletion/windows-reference.cs` e `workspaces/windows-reference.ts`. Abre ancestrais e objetos sem seguir reparse points e sem compartilhar escrita/delete; conserva os handles até os efeitos, confere IDs/volume/resolução e usa `SetFileInformationByHandle` no objeto aberto. Não há fallback para remoção recursiva por string. Volumes, caminhos ou recursos não comprováveis bloqueiam. Não coleta conteúdo nem persiste inventário de arquivos.
- Provas nativas ficam em `tests/native/project-deletion.proof.ts`, executadas explicitamente por `npm.cmd run test:deletion-native`, sem os mocks de processos da suíte padrão. A prova anteriormente misturada à suíte padrão para ancestral junction/symlink foi transferida e ampliada, não considerada aprovada por omissão.
- Provas positivas locais: remoção integral de `.git`, ignorados, arquivos pessoais, trabalho não publicado e acréscimos posteriores ao aceite; proteção de raiz/ancestrais/descendentes junto aos efeitos; troca de descendente por symlink após enumeração; arquivo em uso e retomada; preservação de destinos de symlinks, irmãos e dados compartilhados; preservação da substituta/original movida, ausência segura e reaparecimento; operação real de workspaces sob composição exclusiva de qualificação.
- Impedimento: três provas de junction (raiz, descendente e ancestral) falham com `EPERM` ao criar a fixture, antes da verificação do produto. Isso NÃO comprova remoção de junctions. O adaptador padrão continua sem anunciar capacidade destrutiva; o candidato também declara `safeReferenceRemoval=false`. Não concluir feat-009-c1/c2 nem a entrega afetada enquanto essas provas não passarem e a composição nativa não for qualificada/liberada. A prova de conteúdo c3 é positiva para o candidato, não aceite do percurso completo.
- Referências das primitivas: [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew), [SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle) e [disposição de arquivos](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/ns-ntddk-_file_disposition_information_ex). Verificações de build/typecheck/lint não substituem as provas nativas pendentes.
- Validação técnica desta correção: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build`: exit 0; seis arquivos direcionados de contratos/storage/workspaces: 111 testes aprovados. `npm.cmd run test:deletion-native`: exit 1, 14 aprovados e três falhas de criação de junction por `EPERM`. Recurso C# fonte/distribuição com SHA-256 idêntico; `git diff --check`: exit 0. Build mantém o aviso de tamanho do bundle web. Não foi executada a suíte integral nem houve validação de UI ou efeitos externos.

## Sprint 006 - Coordenador durável e recuperação de execução [CONCLUIDA]
- Execução exclusiva e progresso interrompível: Coordenar accepted, running, pending e reconfirmation_required sem depender da conexão HTTP.
- Retomada manual e recuperação no startup: Recuperar a mesma autorização persistida e expor capacidades corretas de acompanhamento.

## Sprint 007 - Finalização integral e recuperação mínima [CONCLUIDA]
- Conclusão física e relacional comprovada: Integrar a finalização SQL autorizada ao coordenador, impedindo sucesso parcial.
- Replay após remoção do cadastro: Resolver a chave original depois da conclusão sem reconstruir ou reter contexto excluído.

## Sprint 008 - API integrada e proteções HTTP [CONCLUIDA]
- Rotas públicas do ciclo de exclusão: Disponibilizar os quatro endpoints normativos com respostas e semântica idempotente completas.
- Extensões compatíveis de consultas e comandos: Integrar resumos de pendência, capacidades negativas e recibo mínimo aos contratos existentes.

## Sprint 009 - Transporte frontend e operações incertas [CONCLUIDA]
- Hooks e adaptadores da API de exclusão: Consumir os contratos compartilhados pelo wrapper existente com polling e isolamento de contexto.
- Recuperação de envio incerto: Integrar project.delete ao mecanismo de operações incertas sem persistir conteúdo do projeto.

## Sprint 010 - Confirmação acessível na configuração [CONCLUIDA]
- Ação e conferência vinculadas ao cadastro salvo: Apresentar projeto, todos os caminhos, perdas e preservações antes do clique autorizador.
- Acessibilidade e estados iniciais: Aplicar diálogo e linguagem operacional existentes a confirmação, bloqueio e envio incerto.

## Sprint 011 - Acompanhamento persistente e conclusão no frontend [CONCLUIDA]
- Pendência reabrível e retomada segura: Completar os estados de acompanhamento e os avisos na configuração e listagem.
- Sucesso, seleção e rascunhos isolados: Atualizar o contexto visual somente após succeeded e preservar trabalho não pertencente ao cadastro removido.

## Sprint 013 - Medição de persistência e volume [CONCLUIDA]
- Prova comparativa de volume e latência: Medir persistência, payloads e consultas com ampliação de caches e ignorados sem criar SLA novo.

## Sprint — Fundação reproduzível do ensaio de observação [IMPLEMENTADA; PROMOÇÃO EXTERNA D4 PENDENTE]

Data: 2026-10-21. Fontes: AGENTS.md; SPEC.md §§8.4/8.5/10.2; GLOSSARY.md; INTEGRACAO-MAESTRI-OMP.md; manifesto e documents.specMd/decisionsMd/diagnosisMd do run architecture-review `20261021_150214-1ec379`. C4 permanece escolhido por Decisions; D4 foi lido na seção Tests da SPEC, conforme instrução explícita recebida na tarefa atual. Nenhuma fase foi aprovada ou avançada.

- Revisão inicial consultada por `git log -1`: `eb81a888289193e6bb658728990c36a28ab47d01`. Não incorpora alterações locais desta sprint. Estado inicial: alteração existente em `scripts/package-distribution.mjs`; `.lionclaw/`, `.sprint-validation-report.md` e `discovery-notes.md` não rastreados. Tudo preservado, sem Git de escrita.
- Runtime observado: Node 24.22.0, better-sqlite3 13.0.3, SQLite 3.53.4; TypeScript 5.9.3 e Vitest 5.0.5 fixados. Context7 aplicado para fechamento síncrono da conexão SQLite. CodeGraph usado para orientação de createQueue/QueueGitHub antes de editar; código e fontes normativas prevalecem.
- `tests/fixtures/observation-baseline.ts`: `observationFixture`, `withObservationFixture`, `ObservationScenario`, `ObservationSample`, finalidades e gatilhos privados. Compõe Storage e createQueue reais com dependências sintéticas; dois projetos, 10 issues/projeto, 1/3 memberships, 1/2 páginas simuladas e cenário maior de 100 issues/projeto. Relógio virtual inicial 1800000000000, latência 5 ms/página; sequência, mudança de conta e falha reproduzíveis. Wrapper encerra pipeline/conexões e restaura relógio em finally. Nenhum timer novo.
- `tests/integration/observation-baseline.test.ts`: cinco testes confirmam reprodução em novas instâncias SQLite, cardinalidades, cache aquecido, observações independentes por finalidade, IDs físicos simulados únicos, mudança de conta, falha e cleanup. `tests/fixtures/observation-baseline.md` registra reprodução, normalização dos IDs aleatórios e limites das medições. Páginas no seam QueueGitHub são sintéticas; não equivalem a envios GraphQL/GH. Nenhuma duração é apresentada como latência real ou tempo até renderização útil. F2–F5 e seleção da otimização continuam posteriores.
- Nenhum endpoint, header, configuração pública, migration, tabela ou adapter de produção foi introduzido. Registros projetam somente categorias/contagens/durações/cardinalidades e identidades sintéticas; sem corpo, query, argv, ambiente ou checkout. Banco do operador, GitHub real, providers e terminais Maestri/OMP não foram acessados.
- Contexto atual observável: Codex, Default, PowerShell, workspace-write no repositório canônico. A tarefa recebida exige leitura de D4 e autoriza explicitamente comandos/checks; a leitura efetiva ocorreu antes de implementar. Isso não comprova promoção automática a outros executores. Perfil cadastrado e provider/modelo/esforço resolvidos do LionClaw não estão expostos. Não há conector LionClaw entre as ferramentas disponíveis; `Get-Command lionclaw` também não encontrou CLI. Artefatos locais não contêm handler implementado. Localização e promoção pelo mecanismo suportado permanecem dependência externa da camada LionClaw: disponibilizar consulta/atualização de composição/perfil e evidência sanitizada do contexto resultante, aplicando D4 a nova execução ou atualização suportada de sessão. Nenhum seed/reinício foi tratado como promoção; não houve edição de internals externos ou gate extra de capacidade.
- Autorizações D4 lidas: comandos/checks e baseline, Playwright MCP, Maestri pelo manual/helpers Wire, gestão somente de servidor próprio em 127.0.0.1:4310 com preservação de terceiros/segredos e sem efeitos indiscriminados. Não houve tarefa encaminhada a outro executor nesta sessão, nem alegação de disponibilidade técnica baseada apenas no texto.

Validação desta rodada: cinco testes novos passaram; `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram. Build conserva aviso de bundle web acima de 500 kB. A suíte completa foi iniciada e seu resultado será registrado no complemento abaixo. Não houve UI alterada, Playwright, Wire ou integração externa executados; esta entrega não declara baseline completo C4, ganho, aceite externo ou revisão independente.

### Complemento de validação da fundação C4

- Suíte completa: **1.493 passaram e seis falharam, em 117 arquivos**, exit 1. As seis falhas foram reproduzidas executando somente os cinco arquivos antigos, sem coletar o novo teste: duas em profile-lifecycle, uma em queries e uma em verification por escrita de configuração durante tentativa/publicação ativa; uma em queue-scheduler por texto esperado anterior; uma em deletion-absence por ENOENT no cleanup de junction. Resultado isolado: 62 passaram/seis falharam. Os gates e esses arquivos não foram alterados por esta sprint. Suíte integral permanece sem aprovação; não se converte a repetição das falhas em sucesso.
- Após acrescentar correlação explícita physicalExecutionIds entre consumidor frio e cache aquecido, os cinco testes da fundação passaram novamente. O mesmo envio sintético não é contabilizado novamente por consumidor. Sem validação de latência externa ou tempo de browser.

### Retomada após rejeição do Evaluator — rastreamento D4 e revalidação

Data: 2026-10-21. Revisão inicial consultada nesta retomada: `eb81a888289193e6bb658728990c36a28ab47d01`. Preservadas as alterações existentes em SPEC_PROGRESS.md, scripts/package-distribution.mjs e os artefatos/fixtures não rastreados. Nesta retomada foram alterados somente este registro e `tests/fixtures/observation-baseline.md`; nenhum arquivo de produção, perfil externo ou artefato de aprovação foi modificado.

- Fontes conferidas: SPEC do run `20261021_150214-1ec379`, Tests/D4 e C4-11; manifesto e plano da sprint; SPEC de produto §10.2 e GLOSSARY. A seção “Rastreamento após rejeição do Evaluator” da fixture registra os paths, funções e linhas do código externo consultado em modo somente leitura.
- Localizados `HarnessEngine.spawnCoder` e `spawnEvaluator` em `electron/main/harness-engine.ts`, os builders em `harness-prompts.ts` e `harness-evaluator.ts`, a resolução em `agent-config-resolver.ts` e o despacho em `agent-runtime/execute.ts`. O caminho de correção usa `buildCoderFeedbackPrompt`, sem receber specPath; o briefing é prefixado somente na primeira rodada. Portanto, promover D4 apenas ao briefing inicial deixa correções descobertas. Esta conclusão é estática, não uma inspeção do contexto final de runtime.
- Mecanismo suportado localizado: renderer Electron `window.lionclaw.agents.get/update`, exposto em `electron/preload/index.ts:133–137`, handlers IPC `agents:get/update` em `electron/main/ipc/agents.ts:63–74`. A seleção usa os IDs da sprint e consulta o perfil cadastrado; o plano local indica backend-developer/harness-evaluator, sem comprovar seleção ou configuração resolvida em execução. Provider/modelo/esforço não foram inferidos de seeds, plano ou nome do agente.
- Bloqueio técnico: esta sessão não expõe ferramenta LionClaw/IPC nem CLI lionclaw. O README externo informa ausência de API HTTP de produção. Acesso a arquivos de código não habilita o renderer Electron ou o resolvedor no processo do aplicativo. Não foram editados internals externos por shell, banco, seeds ou credenciais; não foram usados CUA, preflight, certificação autônoma nem avanço de fase.
- Encaminhamento necessário pela camada LionClaw: incluir D4/leituras obrigatórias na composição inicial, de correção e de validação; atualizar perfis selecionados pelo mecanismo suportado se necessário; usar execução normal com contexto corrigido ou atualização suportada. Capturar por executor run/sprint/rodada, agentId, instrução D4/SPEC efetivamente enviada e projeção sanitizada da configuração final após resolução/overrides/transforms. O procedimento está localizado, mas não foi aplicado nesta sessão por falta dessa interface. **Os dois critérios de encaminhamento permanecem não atendidos.** Nenhum registro documental foi promovido a prova de envio.

Validação técnica repetida nesta retomada:

- `npm.cmd test -- tests/integration/observation-baseline.test.ts --reporter=dot`: cinco testes aprovados, um arquivo, exit 0.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: concluídos com sucesso. Mantido o aviso de bundle web maior que 500 kB.
- `npm.cmd test -- --reporter=dot`: 1.493 aprovados, seis falhas, 117 arquivos (112 aprovados/cinco com falha), duração 84,15 s. Vitest falhou; o wrapper PowerShell que exibiu o final do log retornou 0, o que não altera o resultado do Vitest. Falhas: duas em profile-lifecycle, uma em queries e uma em verification pelo bloqueio de configuração durante tentativa/publicação; uma em queue-scheduler por expectativa de texto; uma em deletion-absence no cleanup de junction (ENOENT). Não foram alterados esses gates ou testes para mascarar o resultado.

Entrega continua incompleta quanto a C4-11 e sem aprovação da suíte integral. Nenhuma prova de encaminhamento LionClaw, UI, Wire ou integração externa foi produzida nesta retomada.

### Nova conferência após a segunda rejeição — 2026-10-21

- A descoberta das ferramentas desta sessão confirmou ausência de conector LionClaw/IPC. CodeGraph consultou novamente o código externo: `spawnCoder` resolve `sprint.coderAgentId` com `getAgent` e entrega `prompt` em `executeAgentWithSubagentControl`; `spawnEvaluator` faz o mesmo com `sprint.evaluatorAgentId`. Isso confirma o código em disco, não o cadastro nem o processo em execução. Nenhum perfil efetivo ou contexto encaminhado foi obtido.
- A habilitação necessária pertence à integração do LionClaw com esta sessão: expor acesso suportado ao renderer/IPC para consultar os IDs selecionados e `agents.get/update`, além da projeção sanitizada da configuração resolvida e do contexto despachado. Acesso somente aos arquivos externos não fornece essa interface. Não substituir essa dependência por uma nova fixture, leitura de seed, execução isolada de builder ou declaração de recebimento do implementador.
- Permanecem não atendidos os três itens da rejeição: prova de encaminhamento D4/configuração efetiva; consulta do perfil cadastrado/configuração resolvida; envio das autorizações completas a implementação e validação. Nenhuma fase foi aprovada/avançada nem foi criado ensaio de certificação. A correção externa não foi aplicada; este complemento registra o bloqueio e os checks atuais, sem apresentá-los como solução de C4-11.
- Validação técnica atual: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- tests/integration/observation-baseline.test.ts --reporter=dot` (cinco testes) e `npm.cmd run build`: todos exit 0. Build mantém aviso de bundle acima de 500 kB. Suíte integral não repetida nesta conferência; as seis falhas registradas acima continuam sem resolução/aceite. Fixture e código de produção não foram alterados nesta conferência.

## Continuação direta - Sprint 001 corrigida de observação [CONCLUÍDA LOCALMENTE] - 2026-10-21

Fonte vigente: Decisions, SPEC e `sprints-20261021_150214-1ec379.json` em `.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/revisao-escopo-20261021/`. Lidos D4, F1 e os critérios feat-001/002/003; confrontados AGENTS.md, SPEC.md §§8.4/8.5/10.2, GLOSSARY.md e o contrato de integração. O usuário autorizou somente a primeira sprint, diretamente, sem pipeline, alterações no LionClaw, commits ou push. A sprint-002 aguarda autorização. Os bloqueios históricos de encaminhamento/perfis acima foram retirados pela revisão de escopo e não se aplicam a esta continuação.

- Referência inicial lida de `.git/HEAD` e `.git/refs/heads/main`: `eb81a888289193e6bb658728990c36a28ab47d01`. Node 24.22.0; dependências fixadas no package/lockfile existente. Preservados os artefatos anteriores, o registro histórico, a fixture de observação e os seams adicionais já presentes em `backend-measurement.ts` e `observation-wire.ts`. Estes últimos não foram ampliados nem usados para iniciar a segunda sprint. Sem comandos Git: o contexto elevado exigido pelas regras globais não está disponível; não se atesta inventário completo do working tree por Git.
- Reaproveitada a fixture real SQLite/queue: dois projetos, 10 issues por projeto, cenários de 1/3 memberships e 1/2 páginas simuladas, cenário maior com 100 issues por projeto, relógio virtual e respostas reproduzíveis. Cinco testes confirmam sequência reproduzível, separação de finalidades, correlação de IDs físicos, conta alterada, falha e encerramento do banco temporário. Não houve mudança de produção para medição, contrato público, migration ou banco do operador. Latências são virtuais; não comprovam latência externa ou baseline completo.
- Reprodução inicial integral: 1.506 testes passaram e cinco falharam. Quatro falhas vieram de preparação de testes que gravava configuração depois de criar tentativa ativa; a barreira atual `project-configuration-lock` tem regressões próprias e foi preservada. A quinta veio de duas expectativas de texto antigas no mesmo teste da fila. A sexta falha histórica, cleanup de junction, não se reproduziu nesta rodada nem na execução direcionada; o teste foi preservado sem skip e sem alteração.
- `profile-lifecycle.test.ts`: remove defaults antes do início e captura referências explícitas dos dois perfis na preparação, mantendo as verificações de bloqueio por ID e imutabilidade do histórico. `queries.test.ts`: encerra a tentativa sintética anterior e confirma a parada dos terminais antes de salvar a configuração para a próxima. `verification.test.ts`: executa as duas verificações ainda na tentativa ativa, encerra a fixture antes de alterar defaults e confirma que histórico/comandos permanecem e nova verificação encerrada é recusada. Nenhuma barreira de produção foi removida. `queue-scheduler.test.ts`: expectativas alinhadas aos textos atuais, preservando teste da pausa, candidatos confirmados e habilitação.
- Atualizada a referência normativa em `tests/fixtures/observation-baseline.md`, identificando os registros de encaminhamento anteriores como históricos. Nenhuma nova documentação de produto foi criada.
- Validação direcionada: 77 testes passaram em sete arquivos, incluindo a fixture F1, os cinco arquivos com falhas históricas e a barreira de configuração. Typecheck, lint e build passaram; build conserva aviso de bundle web acima de 500 kB.
- Repetição integral final: `npm.cmd test -- --reporter=json --outputFile=.cache/sprint001-tests-final.json`, exit 0; **1.511 testes aprovados, zero falhas, zero pendentes, 118 arquivos**. Relatório local de teste em `.cache`, sem dados do operador. Conferência de espaços finais nos seis arquivos alterados não apontou ocorrências. Critérios feat-001/002/003 atendidos no escopo controlado desta sprint; nenhum resultado equivale a aprovação de fase.

Nenhum browser, GitHub real, Maestri/OMP ou provider foi acionado: a primeira sprint exige aparato sintético sem esses efeitos. Não se declara baseline completo, ganho de desempenho, aceite externo, aprovação de fase ou início da sprint-002.

## Continuação direta - Sprint 002 corrigida de observação [CONCLUÍDA LOCALMENTE] - 2026-10-21

Fonte vigente: sprint-002, feat-004/005/006 do plano em `.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/revisao-escopo-20261021/`, com SPEC/Decisions da mesma revisão e autorização explícita do usuário para executar a segunda sprint. Trabalho anterior preservado. Nenhum pipeline, alteração no LionClaw, commit ou push; a sprint-003 aguarda autorização.

- Instrumentação privada em `tests/fixtures/backend-measurement.ts`, `observation-wire.ts` e composição opcional de `observation-baseline.ts`. Somente testes: AsyncLocalStorage atribui observação/finalidade; HTTP por rota, chamadas lógicas, páginas GraphQL no callback onSend e execuções SQL all/get/run/exec são séries distintas. Hooks temporários restaurados; setup/teardown excluídos. Sem alteração de produção, política de cache, orçamento, throttle, três workers ou contratos públicos. Sem conteúdo SQL/GraphQL, bindings, headers, argumentos ou credenciais nos registros.
- `tests/integration/observation-backend.test.ts` atravessa a rota Fastify real via inject, createQueue e cliente GraphQL reais com runner sintético, sem socket ou GitHub externo. Nos cenários base/expanded com 20 issues, a leitura fria enviou respectivamente 108/272 páginas; a aquecida não acrescentou envios. Cada leitura fria executou 108 run, 94 all e 141 get; aquecida: dois run, três all e três get. Scheduler voltou a enviar 108/272 páginas. Esses valores são trabalho controlado do cliente, não consumo medido no GitHub real.
- HTTP inclusivo, janela das dependências e soma de trabalho são separados. Controle de concorrência prova 10 ms de request/janela e 20 ms de trabalho acumulado. Cenários sobrepostos mantêm três workers por observação e seis agregados. Contagens distinguem sucesso, falha, timeout, cancelamento e pendência; respostas HTTP remotas semanticamente inválidas permanecem erros públicos mesmo quando o runner retorna normalmente.
- Cobertura de memberships/páginas extras, IDs repetidos, cursor inconsistente, acesso negado, throttling, limites de queries/bytes e falha intermediária. Falhas antes de onSend e releituras bloqueadas não incrementam envios. Abort controlado do consumidor conserva IDs e custos anteriores, registra três envios drenados e novos envios posteriores; não comprova cancelamento remoto ou fechamento TCP.
- `tests/fixtures/observation-oracle.ts` compara DTOs públicos em bancos independentes sem consultar cache: três páginas de sete/sete/seis itens, ordem e unicidade preservadas; resultados incompletos de cinco falhas também repetidos. Normalizações enumeradas em `backend-measurement.md`: projetos sintéticos, identidade da observação, hash, continuação, sequência local e dois instantes. Relações verificam presença/tipo, formato de hash/cursores, tempo, estabilidade aquecida e invalidação por configuração/conta; continuação é usada integralmente na própria execução, com QUEUE_CURSOR_INVALID e QUEUE_CHANGED preservados. Ausência e null permanecem distintos.
- Validação direcionada: 23 testes aprovados em dois arquivos. Suíte integral salva em `.cache/sprint002-tests-final.json`: success=true, **1.529 aprovados, zero falhas, zero pendentes**. Medições em `.cache/sprint002-backend-metrics.log`. Fechamento retomado após interrupção: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build`, todos exit 0; build mantém aviso de bundle acima de 500 kB. Após esses checks, somente a documentação de evidências foi corrigida.

Critérios feat-004/005/006 atendidos no ensaio controlado. Sem browser, GH nativo, GitHub real, Maestri/OMP, provider ou banco do operador. Não se declara baseline completo C4, ganho de desempenho, latência externa, aprovação de fase ou início da terceira sprint.

## Continuação direta - Sprint 003 corrigida de observação [CONCLUÍDA LOCALMENTE] - 2026-10-21

Fonte vigente: sprint-003, feat-007/008/009, F4 e matriz/condições de corrida da SPEC na revisão `revisao-escopo-20261021` do run `20261021_150214-1ec379`. Autorização explícita para a terceira sprint, Maestri e Shell #5; sem pipeline, alterações no LionClaw, commits ou push. A sprint-004 não foi iniciada.

- Novo `apps/web/src/features/operations/observation-baseline.test.ts`: 16 cenários com happy-dom somente neste arquivo, React act/createRoot, PrincipalScreen, DashboardPanel, QueuePanel, AttemptListPanel, hooks e wrapper HTTP reais. Fetch sintético controlado, sessão técnica estabelecida fora da jornada, relógio inicial 1800000000000, 10 ms por resposta automática e polling de 15 segundos. Setup e cleanup fora das contagens; root/timers/globals restaurados. Context7 consultado para avanço assíncrono dos timers. Nenhuma dependência, configuração global de DOM, texto, layout, ID técnico na UI ou política de produção foi alterada.
- Estes totais delimitam PrincipalScreen e descendentes. Onboarding é recebido como prop estável; AppShell/useControllerEvents/useOnboarding e a conexão SSE não integram o contador. Os eventos entram pelo mesmo sinal DOM produzido pelo controller-events, não pela rede SSE. Transporte web não é automaticamente vinculado a um envio GraphQL real; a atribuição remota permanece no aparato backend da sprint-002.
- Dashboard ocioso por 120.000 ms simulados: duas leituras operation, duas attempts(active), oito queue e uma projects. Fila no mesmo período: oito queue. Atualização manual aquecida: quatro leituras no Dashboard e uma na Fila. useOperation/useActiveAttempt não foram tratados como intervalos recorrentes garantidos: as respostas estáveis não mudam event_cursor/revision para rearmá-los. Avanços de 200 ms fazem flush do React entre passos; esses totais pertencem a esse protocolo, sem inferir frequência de uso real.
- Dashboard → Fila → Tentativas → Dashboard: três queue, duas operation, três attempts e três projects, aguardando conteúdo útil em cada tela. Dez eventos do projeto A e dez do B, espaçados em 200 ms: Dashboard global faz 60 leituras, Fila global 20, histórico filtrado em A com página vazia faz dez attempts. Eventos de B continuam pertinentes às telas globais. Resync e settings.updated são exercitados separadamente; histórico não atualiza por settings.updated sem tentativa associada. Gatilhos coincidentes evento/resync e timer/evento/resync ficam registrados por rota, tela, origem e instante.
- Amostras privadas distinguem bloco, gatilho, cold/warm, início, DOM renderizado e resultado valid/empty/partial/error/previous. Aguardam texto real e término do estado de carga até o primeiro passo útil de 1 ms, após commit via act; não terminam no fetch. Abertura e atualização automáticas desta fixture produzem 10 ms simulados, não tempo de pintura/GPU, percepção humana, latência GitHub ou benchmark de produção. Estado anterior é registrado sem ser promovido a conteúdo atualizado. Parciais preservam candidatos e total desconhecido; falha permanece visível durante refresh; vazio só é confirmado pela resposta completa no cenário exercitado.
- Corridas reproduzíveis: A pendente → evento/resync → B → B concluída → sucesso/falha tardia de A; fila, operação e tentativa ativa preservam B. Evento/resync imediatamente antes de A terminar também invalida A. Abort solicitado, abort com pedido ainda pendente e conclusão posterior são campos distintos; requisições já iniciadas continuam contadas mesmo quando descartadas pela web. Não se alega cancelamento remoto. Saída da tela e troca A/B descartam respostas antigas. A seleção Preparar conserva project_id/issue_id do item clicado; histórico conserva attemptId/projectId. Paginação da fila usa a continuação emitida e reinicia após 409; histórico mantém a página anterior durante consulta/falha e recupera a continuação pelo botão de nova tentativa.
- Correção de teste anterior: a primeira suíte integral desta sprint teve 1.544 aprovados e uma falha determinística em `tests/integration/backend-measurement.test.ts:95`. Reprodução isolada: 11/12 aprovados, esperado drainedAfterAbort=2 e recebido 1. Apenas a primeira de duas observações recebe abort; a métrica vigente conta somente GraphQL. A expectativa antiga ainda incluía HTTP. Corrigida para um envio físico e reforçada com primeira=1/segunda=0; sem alteração da implementação da métrica. O relatório integral verde da sprint-002 foi obtido antes do último ajuste de classificação daquela rodada e não cobria esse descompasso final. Este registro corrige a limitação do fechamento anterior.
- Validação direcionada após a correção: 28 testes aprovados (12 backend-measurement e 16 web); os três ensaios web/backend/base também passaram juntos antes da correção. Resultados em `.cache/sprint003-targeted-final.json` e saída das medições em `.cache/sprint003-web.log`. Typecheck e lint finais passaram. Build passou, preservando bundle 979,36 kB / gzip 246,77 kB e aviso acima de 500 kB. Repetição integral final: `npm.cmd test -- --reporter=json --outputFile=.cache/sprint003-tests-final.json`, exit 0, **1.545 testes aprovados, zero falhas, zero pendentes**. O relatório verde final substitui o resultado com falha para a versão corrigida, preservando o relato histórico acima.
- Prova complementar Chrome/Playwright MCP: manual Wire lido; GET autenticado confirmou protocolVersion=1/owner. Shell #5 inspecionado e encontrado no prompt, terminal `8a5661ce-d7fe-4efb-aace-e5e1a644a1d3`, preservado. Servidor estático próprio dos assets compilados em 127.0.0.1:4310, PID 41044, iniciado nesse shell e encerrado após conferir sua command line. Assets servidos: `index-BtiFmtR1.js`, SHA-256 `8e52c138f26f42b2c3bfa68a0545dc8e6e0b1f299d947053074bf2a8581a7350`. API integralmente interceptada com respostas sintéticas; nenhum banco do operador, GitHub ou provider acessado. Dashboard, refresh, Fila, refresh, Tentativas vazias e retorno ao Dashboard renderizaram; capturas `.cache/sprint003-browser-{dashboard,queue,attempts}.png`. Dashboard conferido visualmente. A fixture inicial de settings incompleta gerou erro e foi corrigida antes da jornada final; não foi falha do produto. SSE sintético encerra e mostra reconexão, sem prova de stream real. Interceptações removidas e página deixada em about:blank.

Nenhuma otimização foi aplicada. Prova Chrome sintética não substitui a matriz visual desktop/mobile/teclado nem integração real previstas na sprint final. Consolidação estatística e seleção da fatia continuam na sprint-004; não há ganho de desempenho ou aceite de fase declarado.

## Continuação direta - Sprint 004 corrigida de observação [CONCLUÍDA LOCALMENTE] - 2026-10-21

Fonte vigente: sprint-004, feat-010/011/012, D1–D4 e F5 da revisão `revisao-escopo-20261021`. Usuário autorizou prosseguir para esta sprint, sem pipeline, alterações no LionClaw, commits ou push. Revisão Git identificável por HEAD/ref: `eb81a888289193e6bb658728990c36a28ab47d01`, acrescida de trabalho local preservado e hashes dos arquivos medidos. Não há inventário Git completo declarado.

- Relatório executado: `.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/observation-baseline.md`. Registra condições, versões, cardinalidades, sequência, estatísticas, limitações, ranking e handoff da quinta sprint. Não foi criado relatório de comparação antes/depois nem aplicado código de otimização.
- Reprodução: `scripts/run-observation-baseline.mjs` executa cinco processos independentes por modo de automação; `scripts/summarize-observation-baseline.mjs` confere os hashes dos arquivos medidos e gera tabelas a partir dos resultados. Dez execuções aprovadas, com `.cache/observation-baseline-runs/results.json`, logs e registros por modo/repetição. O primeiro piloto encontrou gravação no-op de automation=false; corrigida somente a preparação para salvar quando necessário. A captura final repetiu todos os cenários após ajustar a contagem individual dos dois HTTP sobrepostos.
- `tests/integration/observation-matrix.test.ts`: base/expanded/large (20/20/200 issues, 1/3/3 memberships, 1/2/2 páginas), frio/aquecido, sobreposição de chaves iguais, scheduler/scope/authorization e consumidores com limites diferentes. Automação ligada/desligada muda somente a configuração sintética; não inicia despacho. Ensaios web foram ampliados apenas com variação sintética de automação e relatório privado por janela, incluindo bytes e pendências antes do teardown. Sem configuração pública nova, instrumento de produção, mudança de layout ou política.
- Envios frios reproduzidos em todos os totais: 108/272/2612; aquecidos zero. Dois HTTP de chave idêntica compartilham esses mesmos 108/272/2612, com pico físico três. Limites diferentes 7/25 geram 544 envios expanded e pico seis, mantendo três workers por observação. Scheduler/scope/authorization continuam observações novas; não serão coalescidos com display. First-page ItemValues foi atribuído por operação: 20/120/1200 páginas totais dessa conexão. Custos HTTP, janela de dependências e trabalho acumulado estão separados; latências backend são locais instrumentadas, com runner sem atraso remoto.
- Web repete cinco vezes por modo os 16 cenários da sprint-003, sem substituir fetch resolvido por renderização útil. Mantém 120 segundos simulados, navegação, vinte eventos em 200 ms, resync, settings.updated, coincidência, falhas, paginação e corridas. Tempos úteis automáticos de 10 ms pertencem ao DOM simulado; casos manuais com zero ms não integram percentis. Pedidos pendentes na janela e conclusões posteriores ao abort permanecem nos registros. Timeout/AbortError e limites remotos continuam exercitados pelos testes backend em todas as dez execuções.
- AC-29: cinco execuções independentes de persistence-maintenance, cada uma com 0/16/64 MiB densos de cache ignorado e 20 leituras por superfície após warm-up. Resumos, histórico e polling preservam payload e dados lógicos dentro de cada execução, não leem/serializam work/git/artifacts (controle positivo dos spies), não persistem marcadores de conteúdo e não criam auxiliares. Na primeira repetição: SQLite 4096 B, WAL 2443192 B, SHM 32768 B, artefatos 50 B e auxiliares zero em todos os volumes; apenas o arquivo operacional cresce. Referências Git permanecem identificáveis no close/reopen/remoção controlados. Não comprova Git externo, reinício de processo físico ou SLA.
- Estatística: cada cenário/modo tem cinco totais; relatório fornece mínimo/mediana/máximo/amplitude, unidades e n. AC-29 apresenta as cinco medianas de 20 leituras por superfície/volume, sem agrupar como cinco totais representativos de p95. Ordem não randomizada, efeito de JIT/SO e frequência real desconhecida estão explícitos. Não inferir causa do bloqueio GitHub, latência real ou ganho de rate-limit points a partir desses números.
- **Handoff concreto da sprint-005: alvo backend único.** Reduzir envios das primeiras páginas de fieldValues por composição de até três memberships da mesma issue no caminho `getIssueContextById(..., { purpose: 'queue' })`. Não omitir memberships/campos nem suas falhas. Arquivos de produção previstos: github/client.ts e queries.ts; transport.ts somente se necessário para incorporar primeira página já recebida ao coletor sem novo envio. Testes/runner sintéticos e github.test.ts acompanham o caminho. Queue/cache, UI/eventos, Storage, scheduler, início e publicação permanecem fora da fatia selecionada.
- Metas derivadas, ainda não ganhos: base <=108, expanded <=232 (272 menos duas primeiras páginas por 20 issues), large <=2212 (2612 menos duas por 200 issues). Preservar todas as continuações, resultados públicos, parcialidade/diagnósticos, limites de bytes/queries/resposta/timeout, throttle/backoff, pico de três workers e revalidações. Dados não equivalentes não compartilham autorização; nenhuma ampliação de TTL ou redução de atualidade. Menos envios não prova menor custo primário GraphQL. Context7 consultou referências oficiais de fieldValues, paginação e limites; consulta agrupada deve ser validada contra schema antes da implementação.
- Reavaliado o orçamento da sprint-005: estimativa de três rounds para uma única fatia: implementação/coletor e equivalência; adversariais de node/paginação/falha/budgets; repetição da matriz/checks e correções locais. Não incluir batching de continuações, infraestrutura GraphQL genérica, nova coalescência, otimizações UI ou refatoração Storage. Se a preservação de semântica/limites exigir ampliar escopo ou mudar risco/atualidade, registrar impedimento antes dessa adoção, sem otimização alternativa arbitrária. Não há subdivisão antecipada nem execução da sprint-005 nesta entrega.
- Checks: typecheck, lint e build passaram. Suíte completa em `.cache/sprint004-tests-final.json`: **1.549 testes aprovados, zero falhas, zero pendentes**; a execução do teste matrix começou depois da última alteração de sua instrumentação. Os scripts de reprodução e consolidação foram executados com sucesso, além dos checks de tipos/convenções. Build mantém o aviso anterior de bundle acima de 500 kB. Após esses checks, somente documentação de evidências foi atualizada.

Critérios feat-010/011/012 atendidos no baseline controlado e seleção. Sem browser novo, Maestri/OMP, provider, banco do operador ou GitHub real nesta sprint; a prova Chrome sintética da terceira sprint não foi promovida a integração externa. A quinta sprint aguarda autorização do usuário. Nenhum ganho, aprovação de fase ou avanço de pipeline declarado.

## Continuação direta - Sprint 005 [PENDENTE: fronteira do limite de resposta] - 2026-10-21

Autorização recebida para executar somente sprint-005 diretamente, preservando o trabalho existente, sem pipeline, alterações no LionClaw, commits ou push. Consultados SPEC_PROGRESS, observation-baseline.md, sprint-005/feat-013/014/015, Decisions D1-D4, SPEC da revisão e trechos pertinentes da SPEC de produto/GLOSSARY. O grafo orientou a leitura de github/client.ts; confirmado o transporte atual e seu seam de processos simulados em commands.test.ts.

- Context7 confirmou no schema oficial GitHub: `nodes(ids: [ID!]!): [Node]!` e `ProjectV2Item.fieldValues(first, after)` com conexão e pageInfo (https://docs.github.com/en/graphql/reference/meta e https://docs.github.com/en/graphql/reference/projects). Viabilidade sintática não comprova equivalência de limites.
- Antes de adotar o agrupamento, acrescentado um teste de fronteira em `apps/controller/src/modules/github/commands.test.ts`, reutilizando FakeChild, createGhRunner, GraphQLReader.scope e collect reais. Cem valores por conexão, nomes/campos/options válidos no DTO; IDs brutos dos valores com 15.000 caracteres, aceitos pelo coletor atual, que exige string não vazia mas não impõe tamanho máximo nesses IDs. Os IDs de valores não integram o DTO final. É um contraexemplo sintético do comportamento aceito, sem afirmar que IDs desse tamanho ocorram no GitHub real.
- Resultado reproduzido: cada resposta individual mede **1.512.342 bytes**; as três são completas e decodificam cem valores cada, dentro do orçamento total de **16.777.216 bytes**. A composição com os mesmos campos mede **4.537.010 bytes**, excedendo **4.194.304 bytes** por resposta. O runner interrompe o processo simulado e GraphQLReader retorna unavailable/CLI_UNAVAILABLE. Portanto, compor três primeiras páginas sob o mesmo teto pode transformar entrada antes aceita em falha. Não se trata de falha de paginação nem de redução de trabalho comprovada.
- O baseline exige demonstrar a fronteira e interromper a adoção se ela exigir mudança de limite/semântica. Não foram alterados produção, limites, timeout, budgets, retries, cache, scheduler, publicação ou UI. Não foi adicionado fallback que repetiria envios. A implementação agrupada e a matriz comparativa permanecem pendentes; metas 108/232/2212 não foram atingidas nem medidas nesta sprint. A sprint-006 não foi iniciada.
- Próxima decisão concreta: permitir ou não um teto específico para a resposta agrupada, com orçamento total de operação preservado e limites explícitos por conexão. Isso altera o teto atual por envio e precisa de decisão antes da adoção, conforme o baseline. Não há justificativa para substituir silenciosamente o candidato ou restringir IDs antes aceitos.
- Validação: `npm.cmd test -- apps/controller/src/modules/github/commands.test.ts apps/controller/src/modules/github/github.test.ts --reporter=json --outputFile=.cache/sprint005-boundary-tests.json`: **55 testes aprovados, zero falhas**, exit 0. Typecheck e lint passaram. Suíte integral, build, matriz e integração externa não repetidos, pois nenhuma alteração de produção foi adotada. Último resultado integral permanece o da sprint-004, não uma validação integral desta rodada.

Sprint-005 não concluída: impedimento técnico reproduzido dentro da regra de parada aprovada. Nenhum ganho ou aprovação de fase declarado.

### Retomada da sprint-005 após autorização do limite - 2026-10-21

O usuário autorizou aumentar o teto de resposta para otimizar as consultas GitHub. A decisão posterior resolve o impedimento acima: somente as primeiras páginas agrupadas recebem 8 MiB (duas memberships) ou 12 MiB (três). Consultas individuais continuam com 4 MiB; o orçamento total permanece 16 MiB por operação, com 250 envios, timeout de 15 segundos e throttle/backoff existentes. O teto agrupado permite maior concentração de memória e processamento por resposta. Não implica que uma conexão individual continue limitada a 4 MiB dentro do grupo, nem elimina o orçamento agregado.

- Produção: `github/queries.ts` compõe primeiras páginas via nodes(ids), schema reconfirmado pelo Context7; `client.ts` agrupa até três memberships exclusivamente no contexto queue, associa por ID e tipo, preserva ordem de saída e marca resposta incompleta em caso de ausência, duplicação ou tipo inválido. Cada continuação segue sua consulta individual/cursor. Nenhum retry ou fallback adicional. `transport.ts` recebe explicitamente o teto por envio e permite ao coletor consumir uma primeira página sem novo envio ou dupla contagem no orçamento.
- Testes: fronteira nativa comprova aceitação dos 4.537.010 bytes com teto agrupado, rejeição pelo teto individual e interrupção acima de 12 MiB. Cobertura de identidade fora de ordem, nodes ausentes/duplicados/tipo incorreto, valores numéricos, três cursores independentes, erro GraphQL parcial e acesso negado na continuação. Os testes anteriores de orçamento, paginação e cooldown seguem ativos.
- Referência controlada preservada no seam de teste `observation-wire.ts`: modo legacyValues executa separadamente as primeiras páginas no mesmo leitor e contabiliza cada envio físico. Não é uma opção de produção. A matriz compara resultados públicos com o oráculo existente e exige contagens exatas antes/depois: base 108/108, expanded 272/232 e large 2612/2212. Reduções de 40 e 400 envios (aproximadamente 14,7% e 15,3% do total nesses cenários); não são economia comprovada de pontos primários GraphQL. A matriz também exercita frio/aquecido, sobreposição, finalidades e consumidores distintos. A instrumentação repassa o teto ao runner.
- Checks: suíte integral `.cache/sprint005-full.json`: **1.554 aprovados, zero falhas, zero pendentes**. Typecheck final e lint passaram; build passou com o aviso anterior de bundle acima de 500 kB. O primeiro typecheck identificou acesso opcional no novo teste, corrigido antes do typecheck final; nenhum erro de produção. A suíte integral abrange a mesma implementação final, com apenas esse ajuste de tipagem no teste durante sua execução.
- Limites da prova: runners e respostas sintéticos, sem medição de latência ou consumo real no GitHub; não comprova redução de rate-limit points, desempenho remoto ou integração externa. Sem nova prova de navegador nesta fatia backend. As provas finais e a sprint-006 continuam dependendo da autorização correspondente; não foram iniciadas. Sem pipeline, alterações no LionClaw, commits ou push.

Implementação e comparação controlada da sprint-005 entregues localmente. Aprovação de fase e prova externa não declaradas.

Repetição final da matriz: cinco processos por modo de automação disabled/enabled, dez execuções com sete testes aprovados cada e zero falhas, em `.cache/sprint005-matrix-{modo}-{1..5}.json`. Todas repetem a comparação por oráculo e as contagens 108/108, 272/232 e 2612/2212. Estes relatórios comprovam estabilidade de contagem e resultado, sem estatística de latência por modo antes/depois. `git diff --check` passou.

## Continuação direta - Sprint 006: regressões de autoridade e equivalência - 2026-10-21

Autorização do usuário para prosseguir somente à próxima sprint. Fonte: sprint-006, feat-016/017/018 do plano corrigido, SPEC 8.5/10.2, GLOSSARY e garantias do baseline. Escopo desta rodada: testes e fixtures privados e este registro; nenhuma nova alteração de produção. Preservadas as modificações locais anteriores. Sem pipeline, mudança no LionClaw, commits, push ou execução da sprint-007.

### Evidências por critério

- **feat-016, equivalência pública:** `tests/integration/observation-regressions.test.ts` executa bancos temporários independentes e as mesmas jornadas com legacyValues/agrupado, usando GraphQLReader, cliente, fila, adapter público e oráculo reais. Compara itens/ordem, elegibilidade, totais completos e null em parciais, validade/completude e diagnósticos; exige presença de eligible_total, sem transformar ausência em null. Percorre todas as páginas do cenário íntegro, verifica unicidade dos IDs e relações estáveis de ETag/summary_hash no aquecido. Mudança de configuração invalida a continuação com QUEUE_CHANGED; reinício pela primeira página preserva os IDs selecionáveis. O oráculo normaliza os tokens opacos conforme protocolo anterior, não afirma identidade literal entre bancos distintos.
- Falhas de duplicação, cursor repetido, acesso negado e segunda página com erro ficam restritas ao primeiro projeto sintético. O segundo preserva seus três candidatos elegíveis; a observação global permanece parcial e o total desconhecido. O seam ganhou faultProjectId para essa prova, incluindo o ponto de injeção de duplicação/cursor. Continuações que deixam de representar o conjunto atual são rejeitadas; não são promovidas artificialmente a páginas válidas. Identidade, catálogo ou configuração mudando durante GroupedValues invalidam a observação e retiram elegibilidade.
- **feat-017, autoridade antes dos efeitos:** `queue-scheduler.test.ts`, caso parametrizado de duas observações após display agrupado, exige ordem observe → recordQueueObservations → observe e exatamente duas observações novas no tick. O controle íntegro consome um ciclo e executa um preparo/uma passagem simulados. Mudanças de conta, responsável, Status, critérios ou configuração após getPreparation e antes de startAttempt impedem tentativa, consumo e efeitos. Permanecem os testes anteriores de consumo atômico, concorrência, segunda observação parcial e rollback transacional. O início posterior ao clone mantém sua revalidação existente; não foi removida nem substituída pela leitura da tela.
- `publication.test.ts` aquece um cache de fila com três memberships e comprova uso de uma consulta agrupada antes de cada cenário de autoridade. Depois, conta/responsável/Status, issue fechada, vínculo ausente, proprietário/opção/remoto divergente ou leitura parcial bloqueiam novas mutações e comentário; retirada do responsável produz o cancelamento previsto pela governança, preservando a revisão aprovada. A alteração pública de configuração durante tentativa ativa é recusada por PROJECT_CONFIGURATION_LOCKED e preserva ETag e efeitos, sem forçar uma mutação impossível pela API. Os testes existentes de snapshot/stamp, releitura única após stale, stale repetido, PR/ICR, resultado incerto e prevenção de replay foram executados junto à regressão. Nenhum terminal/provider/recurso remoto real foi chamado.
- **Sessão/CSRF sobre a interface afetada:** o teste HTTP usa createApp, rotas e segurança de produção com respostas GitHub sintéticas. Duas sessões válidas reutilizam o cache aquecido e compartilham a leitura pendente após expiração. Sessão ausente/inválida retorna 401; CSRF ausente/incorreto/de outra sessão retorna 403 para PUT, sem consultas GitHub adicionais. O PUT válido retorna 200 e faz leituras novas, demonstrando que o cache de display não autoriza save. GETs não criam tentativas.
- **feat-018, falha e conclusões antigas:** rejeição de GroupedValues produz parcialidade; depois do backoff a consulta recupera completude. Na corrida A pendente → configuração alterada → B concluída → A liberada, A fica inválida e não sobrescreve B no cache atual; a leitura subsequente conserva a ETag de B sem novos envios.
- **Reinicialização normal controlada, distinta do rollback:** o teste HTTP fecha createApp, reabre o mesmo SQLite e cria nova instância. Cookie antigo retorna 401, CSRF antigo com cookie novo retorna 403; sessão nova consegue consulta completa, com novos envios físicos. installation_id é preservado, tentativas e preparos continuam em zero. O teste de ciclo Ready em `queue-scheduler.test.ts` foi reforçado com agrupamento real do cliente e um controle positivo: antes da parada há uma tentativa consumida, um prepareAttempt e um startPassage simulados. Após cancelamento confirmado na fixture, close/reopen do banco e nova fila/pipeline, há novas leituras mas os contadores continuam em um e a tabela de consumos em um. Só saída elegível/retorno observado rearma o ciclo. As provas anteriores de publicação após reopen conservam recibos e não restauram sessão do agente nem repetem publicação automaticamente. É reinicialização de instâncias no mesmo processo de teste, não reinício físico de Electron/Maestri/SO.

### Rollback delimitado, somente plano

Se necessário e autorizado, encerrar normalmente a instância própria do controlador, parar novos ingressos e aguardar as leituras em andamento antes de descartar suas instâncias. A fila mantém cache por instância, portanto não reutilizar a instância antiga após trocar a política. Aplicar um patch inverso apenas dos trechos da sprint-005: groupedValuesQuery em github/queries.ts, coleta de firstPages em github/client.ts e parâmetros de teto/primeira página em github/transport.ts. Restaurar consultas individuais e teto padrão de 4 MiB. Não executar checkout/reset de arquivos inteiros, pois eles e o working tree podem conter trabalho anterior; inspecionar cada hunk e preservar as evidências desta rodada, limites restantes, configuração e histórico. A retirada devolveria ao laço existente a busca individual de cada primeira página; continuariam no coletor as regras de cursor/diagnósticos, e no transporte os budgets/throttle/timeout. Não há schema, migration, flag pública, credencial ou efeito externo a desfazer. Reiniciar uma única instância e repetir testes direcionados antes de retomar uso normal. O rollback não foi executado; o teste de reinicialização acima é evidência separada e não prova execução desse patch inverso.

### Validação desta rodada

Direcionada final: `.cache/sprint006-authority-final.json`, **138 testes aprovados, zero falhas**, incluindo equivalência/falhas/HTTP/restart, scheduler, preparação e publicação ICR/PR. Ensaios iniciais com falha permanecem em `.cache/sprint006-{first,second,third,authority}.json`: corrigidas expectativas dos novos testes (escopo da falha, cursor sujeito a backoff, instante de mudança de autoridade, cancelamento do responsável e bloqueio de configuração) e a contagem física HTTP, que agora usa o callback de envio independentemente do contexto assíncrono do Fastify. Não foi identificado defeito de produção que exigisse ampliar a fatia.

Sem navegador novo, GitHub real, Maestri/OMP ou provider nesta sprint de regressão controlada; não há alegação nova de desempenho remoto. A sprint-007 e sua comparação final/prova visual continuam pendentes de autorização.

Fechamento local da sprint-006: suíte integral `.cache/sprint006-full.json` com **1.574 testes aprovados, zero falhas e zero pendentes**, executada após o último ajuste dos testes. Typecheck, lint, build e `git diff --check` passaram. Build preserva o aviso anterior do bundle de 979,36 kB (gzip 246,77 kB), acima de 500 kB. Critérios feat-016/017/018 cobertos nas interfaces e condições controladas descritas acima; sprint-006 concluída localmente, sem aprovação de fase ou prova externa implícita. Nenhuma nova alteração de produção nesta rodada.

## Continuação direta - Sprint 007: comparação e checkpoint final - 2026-10-21

O usuário autorizou a próxima sprint, somente sprint-007 do plano corrigido. Mantidos repositório canônico, fatia única e trabalho anterior; sem pipeline, alteração do LionClaw, commit, push, tracker ou publicação. Fontes: feat-019/020/021/022 e C4-01 a C4-11 da SPEC corrigida, SPEC do produto 8.5/10.2, INTEGRACAO-MAESTRI-OMP, baseline e retomadas 005/006. Não há nova alteração de produção nesta sprint.

### Comparação e rastreabilidade

`scripts/run-observation-baseline.mjs` aceita pasta de saída para preservar o baseline histórico. `scripts/summarize-observation-comparison.mjs` gera `observation-comparison.md` no diretório do run, valida dez execuções e hashes atuais, compara fases frias/aquecidas/overlap/autoridade, custo acumulado/janela, picos, bytes, banco/artefatos e AC-29. A matriz pareada também registra duração, stdout HTTP recebido e payload público, sem armazenar corpos novos no relatório de medição. Coleta permanece em scripts/testes privados, sem instrumento novo em produção.

Captura inicial: `.cache/observation-comparison-runs`; captura final após correção da fixture: `.cache/observation-comparison-final-runs`. Cada captura contém cinco processos por modo enabled/disabled. O oráculo continua exigindo equivalência pública e contagens 108/108, 272/232 e 2612/2212. Expanded reduz 40 envios (14,7%); large 400 (15,3%). O teto agrupado e IDs/tipos adicionais custam bytes: 79818/80304 e 778428/783780 no cenário pareado, aumento de aproximadamente 0,61%/0,69%. Base mantém 39126 bytes. Não há omissão de memberships nem economia comprovada de pontos primários GraphQL.

Os tempos locais têm distribuição e amplitude no relatório. A referência pareada individual roda primeiro, portanto aquecimento/JIT e carga afetam a comparação; as capturas históricas também não foram randomizadas nem isoladas de carga. Nenhuma amostra lenta foi excluída. Há redução sustentada de chamadas controladas; latência geral permanece inconclusiva e não recebe aceite de desempenho remoto. O controle base, sem redução de chamadas, também apresenta variação de tempo. Web mantém os 16 cenários por modo, atualidade e conteúdo útil no DOM simulado. AC-29 repete 0/16/64 MiB densos ignorados e 20 leituras por superfície em cada um de cinco processos, com invariância de leitura/payload e controle positivo dos acessos a conteúdo. Não é prova de IO Git nativo, GPU, rede ou reinício físico.

### Playwright MCP/Chrome, UI real com API sintética

- Manual Wire lido; GET autenticado `/api/info` respondeu protocolVersion=1/role=owner. Shell #5 foi consultado pelo feed e helper de captura; não recebeu comando novo, pois não era necessário reutilizar esse terminal. Sua captura privada está em `.cache/sprint007-shell5.ansi`; não é prova de executor nativo do produto.
- Porta 4310 estava livre. Servidor próprio `node .cache/sprint007-static.cjs`, PID 43808, sessão exec 44065, vinculou apenas 127.0.0.1:4310 e serviu `dist/web`. Log de propriedade/ciclo de vida: `.cache/sprint007-server.log`. APIs foram integralmente interceptadas pelo Playwright; servidor rejeita `/api` com 503 se escapar da interceptação. Nenhum banco do operador foi usado.
- Chrome **155.0.8059.86**, Playwright MCP real. Versão efetivamente recebida pelo browser: `http://127.0.0.1:4310/assets/index-BtiFmtR1.js`, SHA-256 `8e52c138f26f42b2c3bfa68a0545dc8e6e0b1f299d947053074bf2a8581a7350`, calculado sobre o fetch no Chrome e conferido no disco. Bundle identifica a UI; a versão backend medida é identificada pelos hashes do relatório, não por esse bundle.
- Desktop 1440×1000: Dashboard, atualização manual e resync com nova leitura; Preparar abre projectId correto e `#preparation-issue=issue-a`. Escape fecha e devolve foco a Preparar. Fila cobre refresh, falha com conteúdo anterior, vazio completo, parcial com diagnóstico, próxima e anterior. Tentativas cobre vazio filtrado, falha na próxima página preservando #1, recuperação para #2 e retorno para #1. Não houve autorização nem execução de tentativa real.
- Mobile 390×844: Dashboard, Fila e Tentativas renderizaram; a largura global permaneceu 390 px. A tabela de Tentativas usa rolagem local: foco em Consultar trouxe a ação para dentro da viewport (x=146,34; largura=82,39). Paginação mobile foi exercitada. Navegação por Enter, Tab no diálogo e Escape/foco de retorno foram exercitados; não se afirma auditoria integral de acessibilidade.
- Capturas `.cache/sprint007-{dashboard-desktop,dashboard-mobile,queue-desktop,queue-mobile,queue-failure,attempts-desktop,attempts-mobile,attempts-mobile-actions,attempts-failure}.png`. Dashboard desktop e as três telas mobile foram inspecionados visualmente; screenshots restantes acompanham as asserções do navegador. Metadados: `.cache/sprint007-browser-evidence.json`.
- Falhas do ensaio preservadas: a primeira fixture de IssueOptions omitia completeness/prerequisites e provocou exceção React. Corrigida apenas a resposta sintética, com reload completo; desde a correção, zero pageerrors na jornada final. Esperas iniciais por resync ocorreram antes de o hook estar pronto; repetição após estado carregado observou nova resposta. Preparação foi intencionalmente recusada com 503 sintético, mantendo seleção sem salvar; falhas de fila/histórico também foram injetadas. Console registra esses HTTP 503 esperados e a tentativa inicial defeituosa; não são apresentados como execução integrada bem-sucedida.
- SSE recebeu stream sintético finito e exibiu Reconectando atualizações. Resync foi disparado no browser; não há prova de reconexão/replay em SSE remoto real. Ao terminar, página foi para about:blank, interceptações foram removidas e somente PID 43808 foi encerrado, depois de conferir a command line. Sem CUA, Desktop Commander, encerramento de processo alheio ou alteração de porta.

### Correção de fixture descoberta na validação final

A primeira suíte integral desta sprint (`.cache/sprint007-full.json`) terminou com 1.573 aprovados e uma falha: PUT válido esperado 200 recebeu 409 no novo teste de sessão/CSRF. createApp estava criando seu pipeline padrão, que contém timer de um segundo, apesar de a fixture de observação ter encerrado o pipeline original. A prova HTTP exigia scheduler controlado. A fixture agora expõe seu pipeline já fechado e o fornece às duas instâncias HTTP, evitando iniciar um scheduler incidental. O teste direcionado passou em `.cache/sprint007-http-fixture.json`; a suíte integral e a matriz foram repetidas após a correção. Não se alterou o scheduler de produção nem se removeu o teste separado que exercita tick/reinício/consumo real controlado. O resultado verde da sprint-006 foi uma execução válida, mas não provava ausência dessa interferência intermitente na fixture.

### Critérios C4 e limites do checkpoint

| Critério | Evidência e estado |
|---|---|
| C4-01 | Baseline histórico, versões/configuração/cardinalidades e comparação reproduzível com hashes; frequência real desconhecida. |
| C4-02 | Matriz separa HTTP, leituras lógicas, GraphQL, SQL, fases/finalidades, janela e trabalho; web mede conteúdo útil em relógio simulado. |
| C4-03 | Alvo e metas anteriores à implementação registrados no baseline; teto ampliado depois de decisão explícita do usuário. |
| C4-04 | Redução controlada de envios sustentada e conteúdo equivalente. Latência variável/inconclusiva; sem aceite geral de desempenho ou ganho externo. |
| C4-05 | Matriz, observation-regressions e queue-scheduler: cache isolado, invalidação, duas observações atuais e consumo atômico preservados. |
| C4-06 | Preparação/start, publicação/PR: mudança de autoridade, stale e parcialidade bloqueiam efeitos e replay; provas da sprint-006 e regressões finais. |
| C4-07 | Chrome real desktop/mobile/teclado, refresh/resync, seleção, falha/vazio e paginação executados. API/SSE sintéticos; não equivale a integração real. |
| C4-08 | AC-29 antes/depois com 0/16/64 MiB, payload/banco/artefatos e ausência de leitura/cópia do checkout nos resumos. Git da prova é controlado. |
| C4-09 | Regras da fatia em client/collect/transporte: associar primeiras páginas e preservar cursores/diagnósticos/budgets. Nenhuma infra pública nova; boundaries conferidos pelo lint. |
| C4-10 | Checks, benchmark, browser e integração separados; falhas/limitações e bytes maiores explícitos; checkpoint permanece com o usuário. |
| C4-11 | D4 respeitado: execução canônica autorizada, Wire por helper com pin/credencial protegida, servidor próprio e Playwright MCP. Sem inspeção ou mudança dos internals do LionClaw, tracker, publicação ou consumo pago. |

Rollback permanece o plano delimitado da sprint-006: drenar/descartar instância própria e aplicar inverso somente dos hunks da fatia, preservando demais alterações e evidências; nenhuma mudança de schema ou credencial. Não foi executado. A integração afetada é leitura GitHub de contexto, validada por transporte/contratos controlados; contratos de terminal/cancelamento/resultado Maestri/OMP não foram alterados, e nenhum INT foi declarado aceito por essas provas. Acesso Wire não comprova conexão nativa do produto. Medição no GitHub real e aceitação de desempenho externo continuam ausentes; não são convertidas em sucesso por documentação.

### Checks finais e entrega ao checkpoint

- `npm.cmd run typecheck`: passou após a correção da fixture HTTP.
- `npm.cmd run lint`: passou; boundaries e convenções TypeScript conformes.
- `npm.cmd run test:persistence`: **51 testes aprovados**, cinco arquivos; executado nesta sprint com AC-29 e limites controlados registrados acima.
- Direcionados exigidos: `.cache/sprint007-targeted.json`, **260 aprovados**, cobrindo os dois baselines, regressões, scheduler, módulo GitHub, publicação, PR e controller-events. A fixture HTTP foi corrigida depois dessa execução e está coberta pela suíte integral final.
- Suíte completa final `.cache/sprint007-tests-final.json`: **1.574 aprovados, zero falhas e zero pendentes**, após a última alteração de teste/fixture. Mantida a execução anterior com falha em `.cache/sprint007-full.json`.
- `npm.cmd run build`: passou, mesmos assets da prova Chrome; aviso conhecido de bundle 979,36 kB / gzip 246,77 kB, acima de 500 kB. `git diff --check` passou.
- Medições finais: dez processos aprovados em `.cache/observation-comparison-final-runs/results.json`, com cinco amostras por modo/cenário e cinco provas AC-29. `node scripts/summarize-observation-comparison.mjs` executado com sucesso, conferindo hashes antes de gerar o relatório. A saída anterior hardcoded do runner foi ajustada para informar a pasta efetivamente usada; os dados anteriores não foram sobrescritos.

Sprint-007 executada e pacote entregue ao checkpoint do usuário. Provas controladas e UI real com API sintética concluídas nos limites descritos; C4-04 não recebe aceite geral de latência/desempenho, e integração GitHub real não foi medida. Não simula aprovação, Design Lock, avanço de fase ou revisão independente final. Nenhum commit/push/publicação foi realizado.

## Sprint 001 - Consolidar inventário e contrato de comportamento [CONCLUIDA]
- Inventário das verificações existentes: Registrar fontes, superfícies, gatilhos, checks suportados, bloqueios, ações e limites das verificações existentes.
- Mapa de destinos e rastreabilidade: Consolidar o comportamento atual e esperado, incluindo E1 a E4 e as provas necessárias para cada superfície.

## Sprint 002 - Preservar contexto, observações e consulta da operação original [CONCLUIDA]
- Isolamento de contexto e estado anterior: Garantir que leituras e conclusões pertençam ao objeto, conta, revisão e ciclo de vida originais, com distinção entre leitura atual e relatório anterior.
- Continuidade da correlação sem reenvio: Preservar a consulta da operação aceita ou incerta durante o ciclo de vida da página, incluindo fechamento e reabertura.
- Composição de avisos atuais e históricos: Entregar apresentação consistente de condições equivalentes, com linguagem operacional e preservação das restrições independentes.

## Sprint 003 - Localizar prontidão na Configuração global [CONCLUIDA]
- Condições globais junto dos controles: Localizar GitHub/conta, pasta, perfis e observação Maestri/OMP nas respectivas seções de Configuração.
- Ações globais únicas e preservação do formulário: Disponibilizar verificar, atualizar leitura e consultar resultado original nos destinos globais aprovados.

## Sprint 004 - Localizar condições do projeto e da preparação [CONCLUIDA]
- Condições e ações próprias do projeto: Apresentar origem/remoto, quadro/Status e associação de papéis junto dos campos correspondentes.
- Condições para iniciar junto da preparação: Localizar falhas de consulta, critérios e divergências no seletor ou resumo apropriado, sem criar diagnóstico de preparação.
- Preservação da definição de checks e da captura: Manter a configuração funcional dos checks e a imutabilidade da configuração capturada por tentativas em andamento.

## Sprint 005 - Separar autoridade, recursos e versão na tentativa [CONCLUIDA]
- Condições operacionais da tentativa: Localizar autoridade e recursos junto do estado, Parada, ambiente e ações nativas pertinentes.
- Resultados e artefatos da versão selecionada: Preservar associação dos checks, revisão, artefatos e publicação à rodada e entrega selecionadas.

## Sprint 006 - Localizar condições e consolidar efeitos da criação [CONCLUIDA]
- Pré-requisitos e ações no contexto da criação: Apresentar condições de scaffold, destino, Git, identidade e modalidade remota no formulário/plano ou resultado correspondente.
- Efeitos únicos e conclusão independente da prontidão posterior: Consolidar a apresentação de efeitos equivalentes e distinguir resultado da criação das pendências para iniciar issue.

## Sprint 007 - Concluir histórico e resumos com provas por superfície [CONCLUIDA]
- Registros exclusivamente como histórico: Retirar controles operacionais de diagnóstico e preservar histórico, eventos e navegação existentes.
- Dashboard com resumo e destino responsável: Consolidar pendências equivalentes de onboarding, impedimentos e fila em resumos com navegação apropriada.

## Sprint 008 - Consolidar evidências e pendências da versão entregue [CONCLUIDA]
- Comprovação final e registro dos limites: Consolidar evidências produzidas por superfície e conferir completude e limites, sem acumular novamente suas execuções.

## Sprint — Fundação incremental, compatibilidade e continuidade dos Coders [DOCUMENTAÇÃO E BASE VALIDADA LOCALMENTE; ATIVAÇÃO V3 PENDENTE]

Data: 2026-10-23. Trabalho documental no repositório canônico. Nenhuma migration, contrato HTTP, comportamento de sessão, caminho operacional ou schema foi alterado; não houve movimentação de diretórios, início de pipeline, provider ou efeito externo.

### Fontes atuais, precedência e conflitos registrados

- Referência técnica desta execução: `docs/Docs20261023_014848/SPEC20261023_014848.md`, também presente como `SPEC.md` na raiz. As fontes de produto aprovadas identificadas pela SPEC são `docs/Docs20261023_014848/PRD20261023_014848.md` e `docs/Docs20261023_014848/stories-requisitos20261023_014848.md`. Conforme a precedência expressa na SPEC e as instruções desta sprint, PRD governa produto/escopo e stories governam comportamento/aceite. `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, `AGENTS.md` e o código/configuração atuais definem termos, contrato vigente e limites de implementação. `FEEDBACK-PROXIMO-PACOTE-V3.md` não é fonte concorrente.
- Conflito de existência: o preâmbulo das stories e a seção 1 da SPEC datada dizem que `SPEC.md` não existe/que sua ausência continua explícita, mas agora há um `SPEC.md` na raiz e ele contém a SPEC V3. O conflito foi registrado, sem escolher especificação histórica substituta ou reconstruir AC ausentes. A raiz e o artefato datado têm conteúdo correspondente; o artefato datado é a referência indicada para esta sprint.
- Conflito de precedência: a seção 1 da SPEC estabelece PRD → produto/escopo e stories → comportamento/aceite; o preâmbulo das stories ainda chama o discovery de fonte canônica e lhe dá precedência sobre o feedback. Para esta execução vale a precedência explícita da SPEC, conforme instrução recebida. A confirmação do discovery continua pendente segundo os documentos e não é declarada por este registro.
- Conflito de sessão: `INTEGRACAO-MAESTRI-OMP.md` §2 e INT-03/06 preservam sessão e resultados por papel/passagem; US-09/US-10 e RF-41–47 do V3 pedem sessão contínua por papel/tentativa e sessões novas entre tentativas. A proposta rastreável está na seção 10 do contrato de integração. Decisão documental explícita ainda pendente; não ativar nem inferir aprovação a partir deste plano.
- Referências históricas de seções de SPEC em registros anteriores apontam a várias SPECs datadas e a estruturas que não necessariamente existem nesta SPEC. Permanecem como histórico das respectivas rodadas e não são usadas como contrato atual. Nenhum AC/INT é criado a partir dessas referências.

### Base executável observada

`package.json` configura estes scripts: `typecheck`, `lint`, `test`, `build`, `test:compiled`, `test:http`, `test:execution-compiled`, `test:verification-compiled`, `test:acceptance`, `test:persistence`, `proof:persistence`, `test:maintenance-native`, `test:deletion-persistence`, `test:deletion-native`, `acceptance:check`, `package:local`, `test:distribution`, `test:browser:deletion` e `start`. Os quatro checks-base executados correspondem a `npm.cmd run typecheck` (`tsc -p tsconfig.check.json --noEmit`), `npm.cmd run lint` (`node scripts/check-boundaries.mjs`), `npm.cmd test` (`vitest run`) e `npm.cmd run build` (`tsc -p tsconfig.json && vite build && node scripts/copy-resources.mjs`). A presença dos demais scripts não significa que foram executados nesta sprint. A última migration numerada em `apps/controller/src/modules/storage/migrations.ts` é `027_event_context.sql`, versão 27; não foi criada migration V3 nesta fundação.

| Validação desta sprint | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript aprovadas. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 1.663 testes aprovados, zero falhas, em 131 arquivos. |
| `npm.cmd run build` | Exit 0; TypeScript, Vite e cópia dos recursos concluídos. Bundle JS: 1.016,68 kB (gzip 255,84 kB), acima do aviso configurado de 500 kB; sem mudança de escopo para otimização. |

Esses checks cobrem a base executável controlada do checkout; não comprovam integração real Maestri/OMP/GitHub, migração futura, UI renderizada ou aceite integral AC/INT. Não havia falha preexistente reproduzível nesses quatro comandos nesta execução. Falhas históricas descritas em seções anteriores permanecem preservadas como evidência de suas versões e não foram reclassificadas.

### Proposta de sessões e transição de diretórios

- `INTEGRACAO-MAESTRI-OMP.md` seção 10 registra a proposta compatível de `attempt_session` por `(attempt_id, role)`, vínculo das passagens, continuidade nas correções/revisões, separação do terminal físico, leitura cautelosa de legados, migration aditiva futura e retomada sem restauração de conversa. Preserva INT atuais e vincula rastreabilidade a US-09/10 e RF-41–47. Nenhuma decisão foi simulada e nenhuma ativação ocorreu.
- A mesma seção documenta transição antes de movimento: identidade por `project_id`/chave de localização/layout; banco e recursos compartilhados globais; pasta original preservada; leitores legados; bloqueio de ambientes/efeitos em uso ou incertos; plano/diário persistente anterior ao IO; verificação de origem/destino; recuperação pelos dois caminhos; referências de retenção/publicação; exclusão separada e inventário atualizado por sprint que introduza dados exclusivos. Não houve criação de tabela, plano operacional, cópia ou movimento.
- Compatibilidade e evolução futuras devem manter API pública dos módulos (`Storage`, `Execution`, `Workspaces`, contratos `#contracts`), SQL privado em storage e fronteiras atuais. Persistência nova usa migrations numeradas aditivas; não editar migrations aplicadas, backfill inventado ou alterar JSON/resultados/recibos históricos. Toda família de dados exclusiva acrescentada por sprint deve ser incorporada ao inventário, às barreiras e à finalização de exclusão de projeto naquela sprint.

### Contrato transversal para os próximos Coders

1. Trabalhar no repositório canônico e preservar alterações preexistentes; consultar fontes atuais pertinentes antes de editar. Não criar checkout/floor concorrente.
2. Git permanece somente leitura, salvo autorização explícita aplicável. Não executar commit, push, stage, reset, rebase, merge, force ou limpeza. Não iniciar pipeline, provider ou efeito externo sem autorização e alvo correspondentes.
3. Respeitar interfaces públicas (`Storage`, `Execution`, `Workspaces`, `OperationAccepted`, `OperationView` e contratos compartilhados); manter SQL em storage e integrações em seus módulos donos. Implementação strict em TypeScript, sem `any` ou supressões.
4. Persistência nova exige migration numerada aditiva, teste de upgrade preservador e leitura dos formatos históricos necessários. Nunca reescrever migrations aplicadas nem converter silenciosamente capturas, decisões, resultados, recibos ou identidades imutáveis.
5. Identificar propriedade e referências dos dados exclusivos antes de introduzir persistência; atualizar inventário, bloqueios e finalização de exclusão na mesma sprint. Recursos compartilhados e pasta original permanecem preservados.
6. Validar pelos comandos efetivamente configurados e registrar resultado/código de saída. Separar testes controlados, UI observada, Windows/Git local e integrações reais. Falha, interrupção, suite parcial ou build não equivalem a sucesso das outras superfícies.
7. `use_playwright=false` significa que a prova visual não foi executada automaticamente; não dispensa INT-11 nem substitui o registro do aceite visual quando pertinente. Se Playwright/Chrome não estiver disponível ou autorizado, marcar a prova pendente.
8. Registrar cada sprint com caminhos e interfaces realmente entregues, critérios atendidos, evidência por superfície e pendências. Atualizar este inventário de continuidade nas sprints seguintes sem sobrescrever resultados anteriores.

Esta sprint não alterou frontend e não executou Playwright/Chrome, GitHub real, Maestri/OMP, provider, scaffold ou publicação. Sessões V3, transição física, migrations e aceites externos continuam pendentes. A sprint documental está concluída localmente; aprovação de pipeline, Design Lock ou mudança de fase não são declarados.

### Critérios desta sprint

- **Compatibilidade normativa/técnica:** fontes atuais, precedência, inconsistências, scripts realmente configurados e migration 027 registrados; referências antigas de seções são mantidas como histórico, sem tratá-las como contrato atual.
- **Compatibilidade de sessão:** proposta por papel/tentativa rastreada a US-09/US-10 e RF-41–47 em `INTEGRACAO-MAESTRI-OMP.md` §10; ativação aguarda decisão documental explícita.
- **Transição dos diretórios:** estratégia pré-movimento documentada para resolução legada, identidade, ambientes ativos/incertos, recuperação, retenção, publicação, exclusão e migrations futuras; nenhum dado foi movido.
- **Contrato dos Coders/base:** regras transversais e limites de prova registrados nesta seção; typecheck, lint, suite completa e build executados. A prova visual segue pendente quando não executada; `use_playwright=false` não dispensa INT-11.

## Sprint 001 - Fundação incremental, compatibilidade e continuidade dos Coders [CONCLUIDA]
- Compatibilidade normativa e técnica da evolução: Conferir a base atual e registrar as condições documentais e técnicas obrigatórias antes da ativação dos fluxos V3.
- Contrato transversal de implementação e passagem de contexto: Disponibilizar o registro consumido pelos Coders seguintes e a validação da fundação existente.

## Sprint — Identidade e leitura das localizações gerenciadas [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA]

Data: 2026-10-23. Fontes: `AGENTS.md`; SPEC V3 `docs/Docs20261023_014848/SPEC20261023_014848.md` (espelho `SPEC.md`), PRD, stories, `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md`, incluindo a estratégia de transição pré-movimento. Escopo restrito à identidade, registro/leitura compatível e proteção da propriedade da nova família de dados. Não houve alocação integrada de novos recursos, adaptação transversal dos consumidores ou movimento de diretórios; esses itens pertencem à sprint-003 indicada no plano.

### Entregáveis

- Migration aditiva `028_project_storage_locations.sql`; schema passa a 28. `project_storage_locations` armazena projeto, chave estável, versão do layout, raiz relativa à instalação, identidade JSON v1 de volume/objeto/ancestrais, revisão, estado corrente e timestamps verificados. Índices garantem uma localização corrente por projeto/chave, caminho corrente exclusivo e identidade física corrente exclusiva. Triggers mantêm identidade histórica, monotonicidade da revisão e exclusão somente pela finalização autorizada do projeto.
- Não há backfill: migration 27→28 cria a tabela vazia. Referências históricas não fabricam localização observada nem alteram `deliveries.repository_relative` ou capturas existentes.
- `Storage` expõe `recordProjectStorageLocation`, `getProjectStorageLocations` e `getProjectStorageView`. O registro exige observação tipada, caminho canônico `var/factory/projects/<project_id>/v<layout>/<location_key>`, chave estável e identidade verificada; recusa identidade/caminho compartilhados e substituição corrente sem transição verificada. A raiz é derivada do ID do projeto, não do nome.
- `Workspaces`/`createWorkspaces` expõe `projectStorageRootRelative`, inspeção de uma raiz existente e resolutores separados para referências novas relativas ao projeto e o `repository_relative` legado (`git/<attempt_id>.git`). A inspeção não cria, move ou adota diretórios; rejeita path/identidade inválidos e mudanças durante a observação. Leitura legada resolve sob a raiz operacional atual sem registrar uma localização.
- `ProjectStorageLocation` e `ProjectStorageView` foram acrescentados a `#contracts`. Sem wiring HTTP/UI nesta fatia. O estado `legacy` retorna `managed_root:null` e lista vazia quando nenhuma raiz verificada existe.
- A nova tabela foi incluída no inventário relacional, nos alvos/proteções de caminhos gerenciados e na ordem de finalização da exclusão de projeto. As barreiras mantêm raízes de outros projetos protegidas; o projeto dono elimina os registros somente após a conferência e autorização existentes.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do controlador, contratos, web, testes e scripts. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript aprovadas. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.668 testes aprovados em 132 arquivos**. |
| Testes direcionados de localizações/exclusão | Exit 0; **11 testes em 2 arquivos**, incluindo migration 27→28, mesmo nome, rename, escape/identidade compartilhada, transição, leitura legado e inventário de exclusão. |
| `npm.cmd run build` | Exit 0; controlador, migration 028, recursos e web compilados/distribuídos. Bundle JS 1.018,13 kB (gzip 256,14 kB), acima do aviso configurado de 500 kB. |
| `git diff --check` | Exit 0, sem erros de whitespace. |

As provas de nome igual e rename usam SQLite/filesystem temporários e demonstram resolução determinística pelo `project_id`; não equivalem a alocação de consumidor em produção. A prova do formato `HttpDelivery` confirma que a referência histórica repository-relative continua aceita; a migração não reescreve entregas. A cobertura não declara Git real, transição física, aceite visual, integração Maestri/OMP/GitHub, nem conclusão total de RF-64–66. Nenhuma aprovação, mudança de fase, commit ou push foi realizado.

Após incluir as localizações verificadas e suas proteções na identidade do plano de exclusão, `typecheck`, `lint` e `build` passaram novamente; os três arquivos direcionados de localização/caminhos/finalização passaram com **20 testes**. A suíte integral de **1.668 testes/132 arquivos** passou imediatamente antes desse ajuste final.

## Sprint 002 - Identidade e leitura das localizações gerenciadas [CONCLUIDA]
- Identidade e leitura das localizações: Disponibilizar localizações de projeto compatíveis com referências novas e legadas.

## Sprint 003 - Alocação gerenciada e adaptação dos consumidores [CONCLUÍDA LOCALMENTE]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD, stories, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` e o registro de transição pré-movimento. O escopo foi US-15.C1–C3/RF-64–66: alocar recursos exclusivos de novas tentativas e adaptar seus consumidores. Nenhum dado legado foi movido; sessão V3, migration de transição e aceites externos continuam nas fases próprias.

### Implementação

- `Storage` agora fornece a relação tentativa→projeto e a referência original do ambiente, consulta da localização corrente e verificação somente leitura da identidade física já registrada. Saves de nova tentativa persistem, junto da intenção durável, a referência relativa `projects/<project_id>/v1/managed/work/<attempt_id>/implementation`.
- `Workspaces.resolveAttemptRoot` distingue a referência nova da referência histórica `work/<attempt_id>/implementation`. Para uma referência nova, cria e inspeciona `var/factory/projects/<project_id>/v1/managed`, registra sua identidade na tabela 028 e a confere ao reutilizá-la. A criação ocorre após a intenção SQLite da tentativa e antes do clone; falhas mantêm a tentativa consultável. Nome do projeto não participa do caminho.
- Git interno retido, implementação, checks, revisão e publicação são alocados sob a raiz do projeto, mantendo separação por tentativa/ID de check ou revisão/operation ID de publicação. Bootstrap Maestri/OMP, logs de check e abertura/recuperação da implementação usam o mesmo resolvedor. Retenção, diff, validação do Revisor, publicação local/remota e consulta/abertura de recursos resolvem pelo ID da tentativa.
- `repository_relative` mantém a representação histórica validada pelas entregas; `resolveRepositoryReference` resolve esse identificador para o armazenamento efetivo da tentativa, global para legado e sob a localização corrente para tentativas novas. Referências de recursos também aceitam os dois formatos em leitura e exclusão.
- Inventário e exclusão incluem as raízes gerenciadas do projeto e protegem raízes de outros projetos, recursos legados e referências globais antigas. Bootstrap dentro da raiz gerenciada é coberto pelo destino da raiz. A pasta original, banco SQLite, papéis, templates e demais recursos compartilhados permanecem nos destinos globais/originais.
- Nenhuma migration foi acrescentada nesta sprint; schema permanece 28. Nenhum checkout, índice, cache, conteúdo de projeto ou arquivo legado foi copiado para SQLite/JSON auxiliar ou movido. Teste novo em `project-storage-locations.test.ts` comprova alocação, persistência da identidade e resolução independente de referência nova e legada.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções. |
| Testes direcionados de localizações, exclusão e consumidores de workspace | Exit 0; 69 testes em 8 arquivos; a regressão final de exclusão/localizações passou com 29 testes em 2 arquivos. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.669 testes em 132 arquivos**, após a correção de compatibilidade das referências de exclusão. |
| `npm.cmd run build` | Exit 0; controlador, recursos e web compilados/distribuídos. Bundle JS 1.018,06 kB (gzip 256,12 kB), acima do aviso configurado de 500 kB. |
| `git diff --check` | Exit 0 no fechamento, incluindo a última proteção de caminho e este registro. |

A suíte executa Git/OMP por adapters controlados e SQLite/filesystem locais; não houve Git/GitHub real, provider, TUI Maestri/OMP ou navegador. Esses limites não são promovidos como prova integrada. Nenhuma publicação externa, movimento legado, instalação operacional, commit/push, aprovação ou mudança de fase foi realizada.

## Sprint 003 - Alocação gerenciada e adaptação dos consumidores [CONCLUÍDA]
- Alocação pós-intenção e isolamento por projeto: Registrar a localização estável antes do primeiro checkout e organizar recursos exclusivos sob ela.
- Consumidores novos e legados: Resolver por tentativa criação, leitura, captura, checks, revisão, recuperação, retenção, publicação, abertura e exclusão sem mover dados anteriores.
- Persistência limitada e recursos compartilhados: Manter banco/recursos globais, pasta original e conteúdo Git sem cópias auxiliares.

## Sprint 003 - Alocação gerenciada e adaptação dos consumidores [CONCLUIDA]
- Alocação integrada sob a raiz do projeto: Agrupar os novos recursos gerenciados exclusivos mantendo suas identidades de execução.

## Sprint — Transição retomável dos diretórios legados [IMPLEMENTADA; PROVA GIT ESPECÍFICA PENDENTE]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD, stories, `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md` §10. Escopo: US-15.C4, RF-67–68 e RNF-18. Trabalho no repositório canônico; migrations anteriores preservadas. Nenhum comando Git de escrita, provider, Maestri/OMP, publicação ou dado operacional foi usado.

### Implementação

- Migration aditiva `029_project_storage_transitions.sql`; schema atual 29. `project_storage_transitions` guarda vínculo da operação, projeto/chave, origem e destino relativos autorizados, identidade v1 da origem, identidade verificada do destino, hash do plano, etapa, estado, revisão, geração e causa sanitizada. Índice parcial impede duas transições ativas por projeto. Migrations 001–028 não foram editadas e não há backfill ou IO de filesystem na migration.
- `Storage` expõe leitura, aceitação, avanço, claim de geração, conclusão e interrupção do diário. Intenção, recibo e evento são gravados antes do movimento. O source/destination e a revisão são revalidados na aceitação; a conclusão troca o ponteiro corrente e insere a localização verificada na mesma transação, somente depois da conferência física do destino. `GET /operations/:operationId` projeta `progress.step/state/generation/revision`, além do estado/recibo comum.
- `ConfigurationView.storage` retorna localizações, estado atual/incerto e `transition_plan` com destino derivado do layout corrente, hash e capacidade. `POST /api/v1/projects/:projectId/storage-transition` (`V08`) aceita exclusivamente `location_key`, `source_location_id`, `plan_hash` e `authorized:true`, com sessão/CSRF, Idempotency-Key e If-Match. Destino e identidade nunca vêm do cliente. A mesma chave retoma a operação; corpo divergente conflita.
- `Workspaces` move a raiz gerenciada para o próximo layout da mesma instalação por rename do diretório, sem percorrer seu conteúdo nem seguir links internos. Valida a identidade da raiz e ancestrais, cria/conferencia o pai de destino e reconfere a origem imediatamente antes do rename. Resume examina os estados origem-presente/destino-ausente e origem-ausente/destino-presente; ambos presentes, ambos ausentes, acesso negado ou identidade divergente ficam incertos e preservam os caminhos existentes. Sem cópia recursiva de fallback.
- Claims incrementam geração; somente a geração corrente pode atualizar etapa ou publicar a localização. Startup muda operações `planned/running` para `uncertain` e incrementa a geração. Barreiras SQL e `assertProjectAvailable` bloqueiam novos inícios, saves de configuração/preparação, fila, publicação e exclusão enquanto a transição estiver ativa/incerta/bloqueada. A exclusão inventaria as localizações históricas e os alvos de origem/destino, sem duplicar caminhos já registrados; a alteração de inventário invalida previews anteriores.
- Leitores mantêm referências históricas de tentativa e resolvem a raiz pelo `project_id` e localização corrente, portanto o layout atualizado segue sendo usado por recuperação, retenção, artifacts, checks/revisão e publicação. A pasta original do operador e recursos compartilhados globais não são movidos.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.675 testes em 133 arquivos**, sem falhas. |
| Testes focados de transição/localizações/finalização | Exit 0; 24 testes em 3 arquivos; repetição final após a última proteção de identidade: 5 testes de transição aprovados. |
| `npm.cmd run build` | Exit 0; controlador, migration 029, recursos e web compilados/distribuídos. O bundle JS tem 1.018,50 kB gzip 256,16 kB e mantém o aviso Vite acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; smoke HTTP/SSE/SQLite, shutdown e lock entre processos; preflight Maestri/OMP controlado. |
| `git diff --check` | Exit 0, sem erros de whitespace. |

Os testes de transição usam filesystem Windows real no `.cache` do workspace: rename e conteúdo da raiz foram conferidos, resposta perdida após o rename retomada depois de reabrir Storage, ausência de localização corrente até verificação, conflito com as duas cópias preservando ambas, substituição de identidade recusada, bloqueio de projeto em uso, progresso/geração, atualização do inventário de exclusão e migration 28→29 sem inventar transições. A suíte controlada não contém um repositório Git operacional submetido à transição; nenhum Git real foi executado por causa da restrição de somente leitura. Também não houve UI/Playwright, GitHub ou Maestri/OMP real. Esses pontos permanecem sem prova e não são declarados como integração externa aceita. Nenhum commit/push, aprovação ou mudança de fase foi realizado.

## Sprint — Transição retomável dos diretórios legados [CONCLUÍDA LOCALMENTE]
- Plano e comando V08: Expor o plano vigente e aceitar somente sua localização/origem/hash confirmados.
- Reconciliação e fencing: Preservar origens/destinos incertos, retomar após reopen e impedir publicação por geração antiga.
- Continuidade e exclusão: Resolver localizações atuais/históricas e incorporar ambos os destinos ao inventário de exclusão.

## Sprint 004 - Transição retomável dos diretórios legados [CONCLUIDA]
- Plano e operação de transição: Disponibilizar plano verificável e comando de transição por projeto.
- Reconciliação e continuidade após interrupção: Preservar a operação e o único exemplar válido durante falhas e reinícios.

## Sprint — Inicialização acessível e detecção de ferramentas [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD, stories US-01/RF-01–06, RNF-15, `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md`. Implementação no repositório canônico, preservando o trabalho preexistente. Sem instalação de dependências, Git/GH, provider, login, publicação ou alteração de credenciais/ACL.

### Implementação

- `scripts/start-host.mjs` inicia sem argumentos EXE obrigatórios; as quatro paths antigas continuam opcionais por compatibilidade. A composição Windows fornece o seletor nativo e o contexto de host separado da descoberta. O controlador detecta ferramentas no host atual com argumentos fixos e `shell:false`; caminhos com espaços/Unicode são preservados.
- `modules/tools/index.ts` valida candidatos Git, Maestri, OMP, PowerShell e GH CLI por existência, tipo, leitura e comando de versão. PATH/GH_PATH e preferências são limitados e deduplicados; candidato único é selecionado automaticamente, caminho preferido válido resolve ambiguidade e múltiplas opções sem preferência ficam `ambiguous`. Saídas do processo são limitadas à primeira linha de versão; erros/diagnósticos não incluem stderr, ambiente ou credenciais.
- A inicialização não aguarda conexão Maestri/OMP para servir configuração. Um host context de execução é composto somente quando há executáveis selecionados; a disponibilidade é verificada separadamente por `GET /api/v1/settings/tool-options`. Ações dependentes continuam condicionadas a seus adapters/preflight. Encontrar `maestri.exe` não confirma conexão; capacidades de host/keyring não são produzidas por HTTP.
- `GET /api/v1/settings/tool-options` retorna candidatos revalidados, estado disponível/indisponível/ambíguo e conexão Maestri em campo separado. O caminho GH usa somente `gh_executable_path`; autenticação/contas continuam no endpoint GitHub existente.
- Migration aditiva `030_tool_preferences.sql`; schema passa a 30. `factory_settings.tool_preferences_json` guarda versão, caminhos preferidos e timestamps de validação de Git/Maestri/OMP/PowerShell, sem credenciais e sem duplicar GH. A gravação usa o comando isolado de settings, revalida somente caminhos alterados e gera timestamps no servidor. Hash idempotente omite timestamps de observação, e o replay não revalida nem repete IO. No startup, um timestamp só é atualizado quando o caminho salvo coincide com o candidato revalidado; a observação não muda caminho, revisão ou capacidade. Projeções antigas antes da migration 030 leem preferências vazias sem backfill.
- `NativeSelectionRequest/Result` aceitam os sete kinds (`projects_root`, `project_directory`, `gh_executable`, `git_executable`, `maestri_executable`, `omp_executable`, `powershell_executable`). `cancelled` e `unavailable` preservam o kind e não incluem path; somente `selected` inclui caminho. O picker nativo Windows agora oferece pasta, seletor específico de GH e seleção genérica de EXE com validação do executável correspondente.
- A resolução GH revalida primeiro o `gh_executable_path` salvo e só depois recorre a PATH/GH_PATH. A mesma preferência persiste para reinícios sem converter ausência ou ambiguidade em capacidade.
- README/manual documentam inicialização degradada, revalidação, seleção, fonte GH e a separação da conexão nativa.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; código, contratos, cliente, testes e scripts TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções. |
| `npm.cmd test -- --reporter=json` | Exit 0; **1.687 testes aprovados, zero falhas ou pendências**, em 135 arquivos. |
| Testes direcionados | Exit 0; **123 testes** de ferramentas, migrations/preferências, seleção nativa, GH resolver, settings, startup e options. |
| `npm.cmd run build` | Exit 0; controlador, schema 30, recursos, seletor Windows compilado e web. Bundle JS 1.019,45 kB (gzip 256,42 kB), acima do aviso Vite configurado de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, sessão, CAS/idempotência, shutdown e lock. Preflight de ensaio controlado. |
| `npm.cmd run test:distribution` | Exit 0; launcher sem paths obrigatórios em pasta distribuída com acentos/espaços, HTTP/assets/SQLite, cwd distintos, lock exclusivo e restart preservando identidade e revogando sessão. Preflight Maestri/OMP controlado. |
| `git diff --check` | Exit 0, sem erros de whitespace. |

A migration 29→30 preserva instalação, configuração, `gh_executable_path` e ledger; preferências têm defaults nulos e não classificam executáveis antigos. Provas de candidatos usam processos/filesystem controlados; o smoke da distribuição comprova inicialização e API locais, mas não conexão Maestri/OMP real, keyring/GitHub autenticado, execução de provider ou seleção manual interativa. A interface visual do wizard não foi alterada/inspecionada nesta fatia; aceite visual e integração nativa permanecem pendentes. Nenhum commit, push, aprovação ou mudança de fase foi executado.

## Sprint — Inicialização acessível e detecção de ferramentas [CONCLUÍDA LOCALMENTE]
- Inicialização sem caminhos obrigatórios: Abrir API/configuração e wizard sem exigir executáveis ou conexão Maestri.
- Observação e preferência revalidável: Detectar/validar cinco ferramentas, persistir preferências sem autoridade e revalidar no reinício.
- Seleção nativa fechada e estável: Aceitar os sete kinds com `path` somente no resultado `selected`.

## Sprint 005 - Inicialização acessível e detecção de ferramentas [CONCLUIDA]
- Inicialização sem caminhos obrigatórios: Permitir acessar o controlador e sua configuração em uma instalação limpa ou incompleta.
- Observação, seleção e revalidação das ferramentas: Detectar as cinco ferramentas e persistir escolhas sem converter preferência em capacidade.

## Sprint — Wizard de ferramentas e correção da instalação [IMPLEMENTADA; VALIDADA LOCALMENTE; ACEITE CHROME REGISTRADO ABAIXO]

Data: 2026-10-23. Fontes: AGENTS.md, SPEC V3/PRD/stories em `docs/Docs20261023_014848`, US-01.C1–C4/RF-01–06, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md. Preservados os trabalhos anteriores, o schema 30, os contratos e os endpoints da sprint-005. Nenhuma dependência, migration, escrita Git, chamada de provider ou efeito externo acrescentado.

- `ToolsSetupPanel.tsx` apresenta as cinco ferramentas no wizard e na Configuração global. Valida a observação pelo schema compartilhado, mostra caminhos/versões válidos em resumo e oferece CustomSelect, seletor nativo ou entrada de caminho somente para ausência, ambiguidade ou preferência anterior não confirmada. Uma nova detecção preserva edição, candidatos e falhas de gravação. Maestri localizado, conexão observada e execução OMP são fatos distintos.
- `useOnboarding.saveTool` usa comandos isolados de settings, ETag, Idempotency-Key e recibo existentes. GH continua exclusivamente em `gh_executable_path`; as outras ferramentas usam `tool_preferences`. Nenhuma outra edição do wizard é incluída. Escolha de candidato não grava e cancelamento/indisponibilidade não apagam caminhos anteriores. Preferências de execução passam a valer na próxima inicialização da composição do host.
- `InitialSetupDialog` incorpora rascunhos/seleção de ferramentas ao fechamento e descarte já existentes, sem outro modal ou mudança dos passos persistidos. `ProjectForm` reutiliza o painel na Configuração global. Erro mantém o wizard aberto, com causa e ação no painel responsável; ferramenta ausente não impede editar as outras configurações.
- Nova categoria `tool-preference-save` conserva somente os metadados mínimos da operação incerta em sessionStorage. Request original continua exclusivamente em memória pelo mecanismo existente. Consulta é GET; reapresentação explícita mantém a identidade original e suas restrições. Respostas são descartadas após troca de instalação/conta, revisão de settings, nova consulta ou desmontagem. O hook de save também confere contexto/ciclo de vida antes de aplicar confirmação tardia.
- `tools-setup.test.ts`: seis provas com React real/happy-dom, hooks e painel/wizard reais; HTTP, detecção, persistência e seletor controlados. Cobrem instalação incompleta, seleção e save com recibo, desmontagem/reabertura com caminho anteriormente válido ausente, cancelamento, seletor indisponível, save recusado sem fechar wizard, ambiguidade, edição durante detecção, conclusão de outro contexto e consulta após resposta perdida sem repetir PUT. Remontagem de React não é reinício físico do controlador.

| Validação | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na versão final. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções preservadas. |
| Suíte completa, `.cache/tools-wizard-tests-final.json` | Exit 0; **1.694 aprovados, zero falhas/pendentes, 136 arquivos**. |
| Última prova direcionada de ferramentas e captura de eventos | Exit 0; oito testes em dois arquivos, incluindo a entrada manual final. |
| `npm.cmd run build` | Exit 0 na versão final; JS 1.031,57 kB / gzip 258,75 kB. Mantido aviso de bundle acima de 500 kB. |
| `npm.cmd run test:distribution` | Exit 0; pacote próprio `build/Fábrica distribuição-jD1qNm`, assets/API/SQLite locais, processos com cwd distintos, lock exclusivo e restart com identidade preservada/sessão revogada. Âncora/preflight controlados. |
| `git diff --check` | Exit 0 antes do registro; reconferido no fechamento. |

A primeira suíte integral registrou 1.693 aprovados/uma falha na regra de captura de eventos: o novo CustomSelect lia o evento dentro do updater. Corrigido capturando o valor primitivo antes do callback; regressão e suíte integral repetidas com sucesso. A prova inicial da Configuração também encontrou uma fixture retornando diagnóstico no lugar de ToolOptions; a validação de schema agora apresenta falha recuperável sem derrubar o formulário. Nenhum gate foi relaxado.

Context7 consultado para cleanup e respostas obsoletas no React. As skills de design nomeadas e `load_skill` não foram encontradas; mantidos componentes, tokens, layout e modal existentes. Conforme INTEGRACAO-MAESTRI-OMP.md §4, o Implementador não executou auditoria visual de navegador: encaminhar ao Revisor a prova Chrome da instalação limpa, correção, teclado/mobile e reinício. A prova React controlada e o restart do smoke distribuído são superfícies separadas; não comprovam esse percurso integrado no navegador. Conexão Maestri/OMP real permanece **não executada**, separada da observação sintética; nenhum Wire, GitHub/keyring, provider, instalação operacional, aprovação ou mudança de fase foi acionado.

## Correção feat-010-c3 — prova renderizada independente na distribuição

Data: 2026-10-23. O registro histórico anterior de aceite Chrome pendente e ausência do percurso integrado no navegador foi superado, para o percurso desktop descrito aqui, por esta revisão independente conforme INTEGRACAO-MAESTRI-OMP.md §4. Nenhuma alteração de produto foi necessária nesta rodada.

- Playwright MCP/Chrome de teste acessou a distribuição real `build/Fábrica distribuição-F1dAkt`, empacotada após build, em `http://127.0.0.1:4310`: assets compilados, HTTP e SQLite reais, sem interceptação ou mock. O pacote usa sua própria instalação/SQLite, sem tocar a instalação operacional. PATH vazio somente no subprocesso reproduziu instalação incompleta; contexto Maestri/OMP e GH_PATH foram retirados somente desse processo.
- A instalação limpa abriu o wizard e apresentou cinco ausências com correção manual. Um caminho Git inválido foi recusado pela API, mantendo wizard e rascunho; um Git Windows real copiado com DLLs para uma pasta de teste foi validado por `--version` (2.55.0.windows.2), salvo pela UI com recibo e apresentado como resumo válido sem exigir seleção manual. Fechar e reabrir o wizard conservou a escolha. Isso comprova versão/processo/filesystem locais, não conexão nativa do produto.
- O primeiro controlador foi fisicamente encerrado (sessão 7638, conexão health recusada), e somente o executável Git isolado foi temporariamente renomeado. O segundo processo (sessão 72937) iniciou o mesmo pacote/banco. Reload do navegador confirmou o mesmo installation_id, preferência anterior preservada e caminho ausente com causa/próxima ação renderizadas. Nova detecção manteve o rascunho digitado por teclado. Ao restaurar o binário isolado, a preferência voltou a ser validada automaticamente. Navegador e ambos os controladores próprios foram encerrados; executável isolado restaurado.
- Evidência persistida: `tests/browser/evidence/tools-wizard-20261023/result.json` contém assertions, reprodução, identidade, hashes SHA-256 do controlador/assets e PNGs, limites e cleanup. PNGs 07/08 mostram o reinício/caminho ausente; 09/10 mostram o caminho novamente validado. Esses screenshots desktop foram abertos e inspecionados visualmente. PNGs 01–05 de elemento longo foram recortados pelo viewport do modal e são apenas suplementares às assertions executadas no Chrome.

**Resultado feat-010-c3:** passou o percurso renderizado desktop de instalação incompleta, falha/correção manual, salvar/reabrir e reinício físico com revalidação de caminho anteriormente válido ausente. A prova determinística anterior de respostas tardias/cancelamento continua distinta desta prova nativa; seletor de arquivo interativo não foi exercitado nesta rodada.

**Limite visual adicional:** viewport 390×844 foi exercitado por teclado, mas não recebeu aceite responsivo: há overflow horizontal/conteúdo cortado no modal, registrado no PNG 06. Não se declara aprovação visual integral/mobile. O escopo desta rodada fecha a prova desktop faltante, sem alterar layout aprovado.

**Integração real separada:** conexão Maestri/OMP **NÃO EXECUTADA**; nenhum provider, Wire, publicação, Git/GH autenticado ou pipeline acionado. Localizar/validar Git por versão não comprova conexão Maestri nem execução OMP.

Validação técnica repetida pelo Implementador nesta rodada: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, 43 testes direcionados em cinco arquivos e `npm.cmd run test:distribution`: todos exit 0. O smoke de distribuição permanece separado da prova Chrome e usa seu preflight controlado, sem conexão real.

## Sprint 006 - Wizard de ferramentas e correção da instalação [CONCLUIDA]
- Resumo compacto e correção contextual: Apresentar observações e ações de configuração por ferramenta.
- Retomada do onboarding distribuído: Conservar escolhas e permitir correção após reinício.

## Sprint — Mapeamento V3 e capacidades reais do Kanban [IMPLEMENTADA; PROVA GITHUB REAL PENDENTE]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD/stories `docs/Docs20261023_014848`, critérios RF-09–11 e tabelas `project_revisions`/`creation_board_operations`. Implementação no repositório canônico; migrations históricas preservadas.

### Mapeamentos e compatibilidade

- `ProjectMapping` exige o formato V3 com os cinco IDs de opção (Backlog, Ready, In progress, In review e Done/Delivered). `ProjectChanges.github_project` aceita somente V3 ou `null`; a validação semântica do serviço e do storage recusa IDs repetidos.
- `ReadProjectMapping` aceita somente V3 ou o objeto legado fechado com quatro propriedades. Leitores da configuração, preparação e projeção histórica preservam os quatro valores sem adicionar Backlog. Os conversores privados mantêm `ready`, `inProgress`, `inReview` e `delivered`; `backlog` é serializado somente se existir no documento.
- Uma leitura legada continua disponível para consulta e produz o impedimento `STATUS_MAPPING_LEGACY`. Edição de outro campo não converte nem reapresenta o mapeamento legado; para adequá-lo, a configuração precisa selecionar os cinco valores e salvar uma nova revisão.

### Diário e capacidades GitHub Projects

- Migration aditiva `031_creation_board_operations.sql`; schema atual 31. A tabela registra os efeitos `create_board`, `configure_status`, `link_repository`, `configure_view` e `verify_board`, com escopo único, hash, autorização, identidade esperada, estado e recibo observado. Os enums fechados de `effects` e `creation_steps` não foram ampliados.
- Storage cria a intenção antes do IO, registra envio/resultado e mantém `unknown` consultável após resposta perdida/reinício. A reconciliação é somente leitura; o mesmo efeito incerto não é reenviado. Exclusão de projeto inclui as linhas do diário e preserva a guarda de finalização autorizada.
- O adapter GitHub cria o Project, cria/atualiza o campo de seleção simples com exatamente as cinco opções na ordem, vincula o repositório e cria uma view `BOARD_LAYOUT` com Status visível. A verificação final relê owner, título, campo/opções em ordem, vínculo ao repositório, layout da view e Status como agrupamento. Só então registra o recibo final e a configuração inicial do projeto recebe o mapeamento V3.
- A API oficial atual permite criar views, selecionar `BOARD_LAYOUT`, configurar a lista ordenada de campos visíveis e observar `groupByFields`; o input documentado de configuração da view só expõe `visibleFieldIds`. O adapter não presume que possa definir agrupamento por API: se a view lida de volta não estiver agrupada pelo Status, mantém a criação parcial com impedimento. [Referência GraphQL de Projects](https://docs.github.com/en/graphql/reference/projects) e [mutação de vínculo Project–repository](https://docs.github.com/en/graphql/reference/projects#linkProjectV2ToRepository).
- Nenhum quadro local é criado. Uma nova criação remota não chega a `completed` sem os cinco tipos confirmados e os efeitos de repositório exigidos; criações históricas concluídas não são alteradas nem recebem recibos retroativos.

### Validação e limites

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções aprovadas. |
| Testes direcionados de mapeamento, codecs, contratos HTTP e adapter GitHub | Exit 0; 82 testes em 6 arquivos, incluindo identidades cruzadas de repositório, Status e view. |
| Testes de exclusão/transição afetados | Exit 0; 80 testes em 7 arquivos. |
| `npm.cmd run build` | Exit 0; controlador, migration 031, recursos e cliente distribuídos; bundle JS 1.036,95 kB gzip 260,30 kB, acima do aviso Vite configurado. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 1.711 testes em 140 arquivos. |
| `git diff --check` | Exit 0. |

As provas controladas cobrem ordem errada, opção extra, vínculo ausente, agrupamento Kanban não observado, IDs duplicados, compatibilidade dos quatro campos históricos e resposta perdida nos cinco efeitos sem repetição do mesmo efeito. GitHub real, criação remota e inspeção visual do quadro não foram executados; fixtures não comprovam permissões, a renderização ou a configuração real da conta. Não houve commit, push, publicação, aprovação ou mudança de fase.

## Sprint 007 - Mapeamento V3 e capacidades reais do Kanban [CONCLUIDA]
- Mapeamentos novos e históricos: Distinguir o mapeamento V3 de cinco opções do mapeamento legado de quatro.
- Quadro e diário de efeitos específicos: Disponibilizar criação, configuração, vínculo e verificação do quadro por capacidades comprovadas.

## Sprint — Criação completa e retomada sem duplicação [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA; GITHUB REAL PENDENTE]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD e stories de `docs/Docs20261023_014848`, US-02, RF-07–13, critérios E53–E57 e o registro da sprint anterior de quadro. Trabalho no repositório canônico, preservando alterações preexistentes. Sem nova migration, dependência, execução Git/GitHub real, provider, commit ou push.

### Implementação

- `GET /scaffold/options` publica somente `remote_push`. Os schemas de `POST /scaffold/plans` exigem repositório remoto, modalidade `remote_push` e `board_name`; `POST /scaffold/creations` aceita exclusivamente o mesmo plano V3 estrito. A rota e o serviço recusam a forma antiga antes de qualquer escrita ou mutação.
- `ScaffoldPlanV3` é compartilhado pelas respostas de planejamento e comandos de criação. A leitura de `ProjectCreation.plan` mantém a união fechada V3/legado. O plano completo, incluindo `board_name`, entra no hash e na intenção idempotente. O mapeador de leitura conserva o input do V3; documentos históricos sem nome de quadro continuam válidos e seus hashes são recalculados sobre o conteúdo original sem backfill.
- A criação percorre diretório/arquivos/Git/baseline, criação do remoto, origin, push inicial e operações específicas do quadro. A configuração do Project recebe o nome editável do plano e as cinco opções Status na ordem normativa. Cadastro só conclui após confirmar remoto, origin, push, criação/configuração/vínculo/view e a releitura que confirma layout, coluna visível e agrupamento por Status.
- E57 consulta e reconcilia operações incertas antes de continuar; efeitos confirmados são reutilizados. O caminho impede iniciar operações do quadro enquanto remoto, origin ou push estão incertos. Planos divergentes são recusados por hash; conta divergente é recusada antes do adapter remoto. A projeção E56 informa nome/URL comprovados do quadro e uma próxima ação. Leituras legadas não inferem o nome do projeto como nome de quadro; exibem somente o nome guardado no plano V3 ou em recibo confirmado.
- `ProjectCreationDialog` apresenta a modalidade obrigatória, sugere o nome do quadro a partir do nome inicial do projeto e preserva edição manual. O resultado mostra quadro, URL quando observada e próxima ação; a ação de reconciliação considera estados incertos/falhos do diário do quadro.
- `README.md` descreve os contratos V3, compatibilidade de leitura, a sequência e os limites de retomada.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict do controlador, contracts, cliente e testes. |
| `npm.cmd run lint` | Exit 0; fronteiras de módulos e convenções. |
| Testes direcionados de scaffold/HTTP, contratos e projeção do resultado | Exit 0; 83 testes em 4 arquivos. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.712 testes aprovados em 140 arquivos**. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web compilados. Bundle JS 1.039,75 kB (gzip 260,90 kB); permanece o aviso Vite acima de 500 kB. |

Os testes cobrem rejeição de modos locais/sem push, campos remotos e quadro obrigatórios, separação estrutural V3/legado, preservação de plano histórico, hash com o nome editado, rejeição de conta/plano antes dos efeitos, conclusão após todos os cinco efeitos de quadro, ordenação Status, display somente com prova, resposta perdida em cada efeito, E57 via HTTP após reopen e replay sem duplicação de repositório/push/quadro. O ensaio de quadro usa adapters controlados e SQLite/HTTP locais reais.

Criação remota, push inicial, Project real, permissões da conta e configuração renderizada no GitHub não foram executados. Testes e documentação não são prova de integração GitHub real. Nenhum efeito externo, commit, push, aprovação ou mudança de fase foi realizado.

### Complemento Playwright local

- Chrome/Playwright carregou o bundle Vite compilado em `127.0.0.1:4310` com respostas HTTP sintéticas. O formulário mostrou somente repositório GitHub com push inicial, o campo obrigatório `Nome do quadro Kanban` e a sugestão inicial derivada do nome do projeto. Alterar o nome do projeto atualizou a sugestão enquanto o quadro seguia a edição manual independente.
- A leitura visual mostrou o modal de criação e as ações dentro do viewport desktop. Nenhum plano, criação, provider ou efeito remoto foi enviado. O mock deliberadamente não implementou todos os endpoints; a faixa de atualizações/events e erros 404 exibidos pertencem à fixture incompleta, não são prova da conexão SSE. O servidor próprio foi encerrado e a porta 4310 ficou livre.

## Sprint 008 - Criação completa e retomada sem duplicação [CONCLUIDA]
- Plano estrito de criação V3: Restringir novas criações ao plano completo autorizado.
- Orquestração parcial e conclusão verificável: Coordenar os efeitos locais, remotos e de quadro conservando seus recibos.

## Sprint — Cadastro incompleto e prontidão efetiva [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA]

Data: 2026-10-23. Fontes: `AGENTS.md`, `SPEC.md` V3, PRD e stories de `docs/Docs20261023_014848`, US-03 e RF-14–17, contrato de mapeamento V3/legado e as interfaces existentes de projetos, preparações, fila e início. Trabalho no repositório canônico, preservando alterações anteriores. Sem migration, dependência ou efeito externo.

### Implementação

- Cadastro de pasta local sem remoto, commit publicado ou quadro continua permitido. O projeto permanece com automação desabilitada e a projeção retorna causas separadas para remoto GitHub não confirmado, branch-base não publicada, quadro ausente e mapeamento histórico de quatro valores. Cada causa tem ação correspondente.
- Preparação revalida a origem atual. Exige repositório remoto confirmado pela identidade configurada e commit da branch-base com SHA correspondente na origem e no GitHub; verifica também o quadro/mapeamento V3 e mantém as demais validações de conta, issue, responsável, vínculo, Status e bloqueadores.
- Início manual continua usando a revalidação do resumo e recusa esses requisitos antes de criar tentativa, preparar clone ou lançar papel. O serviço também recusa ligar a automação do projeto por uma gravação direta de configuração enquanto faltar qualquer requisito.
- A observação da fila aplica as mesmas verificações antes de consultar candidatos Ready. A habilitação por projeto conflita com o resumo atual se estiver incompleto; uma fila global pode continuar atendendo outros projetos prontos. Ready, por si só, não liga a automação e não altera os bloqueios existentes de conta, assignee, consumo ou tentativa ativa.
- Mapeamentos legados de quatro opções continuam consultáveis. Uma edição que não altera Status conserva o formato legado, não cria Backlog implicitamente e não modifica a captura histórica. Projetos novos e adequações continuam exigindo cinco IDs distintos.
- `QueueReason`, DTO público da fila e rótulos de causa foram atualizados. Nenhum dado novo foi persistido; SQL e interfaces de domínio existentes foram reutilizados.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções aprovadas. |
| Testes focados de projetos, preparações, início, fila, contratos e exclusão | Exit 0; 256 testes em 6 arquivos antes da última regressão de mapeamento legado; o teste atualizado de início legado passou isoladamente (26 testes no arquivo). |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.728 testes aprovados em 140 arquivos** na rodada final. |
| `npm.cmd run build` | Exit 0; TypeScript, Vite e cópia de recursos concluídos. Bundle JS 1.040,57 kB (gzip 261,21 kB), acima do aviso Vite de 500 kB. |
| `git diff --check` | Exit 0 antes deste registro; repetição final registrada após a atualização. |

As regressões confirmam cadastro incompleto com recibo e automação desligada; causas distintas no projeto/preparação; rejeição de início manual sem clone/passagem; recusa da automação direta e da habilitação da fila por projeto; ausência de despacho automático com os três requisitos incompletos mesmo quando as duas automações já estão ligadas; seleção Ready normal quando os requisitos são observados; preservação do mapeamento legado e da captura histórica. As fixtures usam SQLite/HTTP locais e respostas de GitHub/origem controladas. Não houve GitHub real, Git, provider, Maestri/OMP ou execução de tentativa de produto; essas integrações não são declaradas aceitas nesta sprint.

## Sprint — Cadastro incompleto e prontidão efetiva [CONCLUÍDA LOCALMENTE]
- Cadastro sem prontidão presumida: Aceitar projetos existentes incompletos e mostrar causas e ações específicas.
- Barreiras comuns nos inícios: Exigir remoto GitHub, commit-base publicado e quadro V3 tanto no início manual quanto na fila.
- Ready e automação explícita: Manter Ready como elegibilidade e preservar as regras existentes da fila e do mapeamento legado.

## Sprint 009 - Cadastro incompleto e prontidão efetiva [CONCLUIDA]
- Cadastro sem prontidão presumida: Permitir cadastrar existente incompleto e projetar pendências específicas.
- Mesmas barreiras nos dois inícios: Aplicar prontidão nos serviços chamados por início manual e seleção automática.

## Sprint 010 — Criação completa e cadastro na interface [IMPLEMENTADA; VALIDADA LOCALMENTE; ACEITE VISUAL PENDENTE]

Data: 2026-10-23. Fontes: AGENTS.md, SPEC V3/PRD/stories em `docs/Docs20261023_014848`, US-02/US-03, RF-07–17, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md §4. Preservadas as alterações preexistentes no repositório canônico. A área gerenciada e o comando V08 não foram alterados nesta sprint.

- `ProjectCreationDialog.tsx` conserva o formulário exclusivo `remote_push`, quadro obrigatório e sugestão inicial independente da edição manual. Plano e resultado apresentam os cinco efeitos do quadro com rótulos humanos, além de destino e etapas locais/remotas; estado parcial e efeito unknown continuam distintos de conclusão confirmada pelo servidor.
- A identidade mínima de criação/reconciliação é registrada antes do POST. Fechar durante o envio preserva a consulta original; resposta tardia não navega após desmontagem. Reabrir oferece GET da mesma operação, inclusive quando ela ainda está pendente. Um 404 não apaga a identidade nem libera uma segunda criação. Voltar ao formulário fica bloqueado durante envio ou incerteza. Reconciliação aceita bloqueia outro envio enquanto sua operação é acompanhada; reabertura consulta o registro original sem repetir POST. Refresh e navegação não criam recursos.
- `ProjectForm.tsx` informa que o cadastro existente pode permanecer incompleto, apresenta as causas independentes e aponta para a configuração do projeto cadastrado. Ready é explicado como elegibilidade, sem habilitação implícita de automação. Recusa de prontidão ao salvar automação preserva a edição e apresenta causa/próxima ação no componente compartilhado.
- `ProjectReadiness.tsx` localiza `CODE_NOT_PUBLISHED` junto da origem, inclusive no resumo da preparação. O mapeamento legado permanece consultável; salvar orientação não envia `github_project` nem sintetiza Backlog. A prova React revelou uma falha real ao abrir esse editor: faltava a ajuda de `Status Backlog`. `FieldHelp.tsx` corrige a falha e atualiza a explicação da troca de campo para cinco valores.
- `creation-v3.test.ts` e as regressões de `project-readiness.test.ts` exercitam React/DOM e transporte controlado: sugestão/editabilidade do quadro, plano obrigatório, fechamento durante envio, recuperação de operação pendente, 404, reconciliação original, efeitos do quadro, cadastro incompleto, recusa de automação, preparação bloqueada e save preservando mapeamento histórico.

Validação: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram na rodada final. Suíte integral em `.cache/creation-interface-tests.json`: **1.738 aprovados, zero falhas/pendentes, 141 arquivos**, exit 0. Após o ajuste final dos links do cadastro e o reforço das asserções, os quatro arquivos direcionados passaram novamente com **37 testes**, e typecheck/lint/build foram repetidos. `git diff --check` e a conferência do arquivo novo não apontaram whitespace. Build mantém o aviso de bundle acima de 500 kB: JS 1.043,63 kB, gzip 261,87 kB.

As primeiras execuções dos testes novos identificaram expectativas incorretas de texto, estado de rascunho compartilhado entre testes e seleção de um alerta não relacionado; as fixtures/assertions foram corrigidas sem relaxar gates do produto. A falha de ajuda do Backlog foi corrigida no produto. Context7 foi consultado para cleanup e descarte de respostas obsoletas no React; CodeGraph orientou a leitura. As skills de design nomeadas e `load_skill` não estavam disponíveis; composição, CSS e componentes compartilhados foram preservados.

**Visual: not_verified.** React/happy-dom com HTTP controlado não comprova Chrome, teclado/foco real ou responsividade. Conforme INTEGRACAO-MAESTRI-OMP.md §4, encaminhar ao Revisor independente a prova Playwright MCP/Chrome dos dois percursos sobre versão fixa. Playwright MCP não está exposto nesta sessão; não foi usado CUA/Portal como alternativa. Não houve GitHub real, criação remota, push, provider, Maestri/OMP, alteração de banco operacional, dependência nova, commit/push de versionamento, aprovação ou mudança de fase. Os testes não são aceite integrado externo.

## Sprint 010 - Criação completa e cadastro na interface [CONCLUIDA]
- Formulário de criação e retomada: Apresentar a única criação completa e acompanhar sua operação.
- Cadastro incompleto com ações pertinentes: Permitir salvar cadastro e explicar os bloqueios operacionais.

## Sprint — Localizações e transição gerenciada na interface [IMPLEMENTADA; VALIDAÇÃO LOCAL CONCLUÍDA; VISUAL PENDENTE]

Data: 2026-10-23. Fontes: AGENTS.md, SPEC V3 §§US-15.C1–C4/RF-64–68/V08, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md §4, contratos ProjectStorageView/StorageTransitionCommand/OperationProgress e rota V08 existente. Alterações anteriores preservadas no repositório canônico. Nenhuma dependência, migration, movimento de diretório operacional, Git de escrita ou efeito externo.

- `apps/web/src/features/projects/ProjectConfigurationDialog.tsx` é o conteúdo de localizações hospedado no diálogo de configuração existente, integrado por `ProjectForm.tsx`; não abre um segundo modal. Separa pasta original, raiz gerenciada e localizações históricas, preserva os caminhos sem truncamento e oferece cópia após confirmação do clipboard. O backend atual retorna a raiz gerenciada relativa à instalação; o cliente a identifica como tal sem inventar caminho absoluto. Abertura nativa por projeto não existe no contrato: o link encaminha às tentativas e às suas ações existentes por recurso/capacidade, sem URL file:// ou chamada de shell.
- `apps/web/src/features/projects/useProjectStorage.ts` acompanha a operação no escopo instalação/conta/projeto. Antes do POST guarda somente ID/tipo/instante em sessionStorage; corpo e ETag originais permanecem exclusivamente em memória. Fechamento/reabertura recuperam a consulta GET; retorno tardio de outro contexto é descartado. GET, polling e refresh nunca enviam movimento. 404 conserva a identidade e impede um segundo comando. Reload conserva consulta; sem request original em memória, a interface não reconstrói uma autorização para retomada.
- A confirmação fica vinculada ao plano e ETag exibidos, envia somente location_key/source_location_id/plan_hash/authorized com If-Match e Idempotency-Key. Guarda síncrona impede duplo envio. 202 anuncia somente aceite; sucesso exige OperationView succeeded com tipo/recurso/ID correspondentes. Progresso, incerteza, bloqueio e resultado final são distintos. Retomada é ação explícita disponível somente com operação unknown/failed e request original em memória; preserva body, revisão e chave. Recusa conhecida exige nova observação e confirmação do plano, sem substituir os rascunhos da configuração.
- `artifact.css` acrescenta quebra integral dos caminhos, grade adaptativa e ações que podem quebrar linha, dentro dos tokens e do modal existentes. Nenhuma alteração de contrato HTTP/backend ou layout do shell. Causas codificadas de transição recebem linguagem humana; próxima ação permanece a orientação recebida do backend.
- `project-storage.test.ts`: nove testes React/happy-dom com transporte controlado, cobrindo caminhos, autorização/revisão, request exato, resposta perdida/reabertura/404/sucesso, incerteza e retomada da mesma operação, recusa de plano, capacidade indisponível, resposta de conta/objeto divergente e duplo clique/fechamento com envio pendente. Os testes direcionados de prontidão e backend de transição também passaram (36 testes em três arquivos antes dos dois testes adicionais; nove testes web repetidos depois).

Validação: typecheck, lint e build passaram; suíte completa `.cache/storage-interface-tests.json`: **1.752 aprovados, zero falhas ou pendências**, exit 0. A suíte integral precede somente o ajuste final de tradução das causas; os nove testes direcionados passaram novamente após esse ajuste e os checks-base foram repetidos. Build mantém aviso Vite de bundle acima de 500 kB. `git diff --check` passou. Uma regressão nova encontrou uma consulta iniciada após recusa conhecida substituindo sua mensagem; corrigida a guarda de consulta para exigir identidade ainda persistida/ativa. A primeira checagem também encontrou indexação de labels sem assinatura e variável de teste não usada; ambas corrigidas.

**Visual: not_verified.** Playwright MCP não está exposto nesta sessão. As skills de design nomeadas e load_skill também não estão disponíveis; mantidos os componentes e tokens existentes. Conforme INTEGRACAO-MAESTRI-OMP.md §4, encaminhar ao Revisor independente a prova renderizada de rascunhos, aceite V08, resposta perdida/reabertura, resultado confirmado, parcial/incerto/bloqueado e plano vencido, além de teclado, janela baixa, largura estreita e zoom. React/happy-dom não comprova esses critérios. Não foi usado CUA ou Portal como alternativa. Portanto a sprint não declara todos os aceites renderizados concluídos.

Sem navegador, integração Git/Windows de movimento, GitHub, Maestri/OMP, provider, banco operacional, publicação, commit/push, aprovação ou mudança de fase nesta rodada. As provas backend anteriores e os testes controlados não substituem o aceite renderizado ou integração nativa.

### Correção após avaliação — prova complementar em Chrome (2026-10-23)

A ausência de evidência renderizada foi parcialmente resolvida por `node scripts/prove-storage-browser.mjs`. O runner serve exclusivamente `dist/web` em `127.0.0.1:4310`, inicia Chrome isolado e intercepta todas as APIs com respostas controladas. Não inicia o controller operacional nem movimenta pastas. Fecha o navegador e o servidor ao terminar. O registro anterior descreve a rodada anterior; esta rodada acrescenta navegador real, sem representar aceite independente via MCP.

Evidências em `tests/browser/evidence/storage-transition/result.json`: Chrome 155.0.8059.86, oito grupos de verificações aprovados, 15 capturas PNG, snapshots ARIA correspondentes, três comandos V08 controlados e hashes SHA-256 do JS/CSS servidos. Capturas de aceite, plano vencido, parcial/incerto, mobile e reflow foram abertas e inspecionadas. Cobertura: caminhos completos separados; rascunho de orientação; 202 sem conclusão presumida; identidade, plano e revisão enviados; parcial/incerto e bloqueado com causa/próxima ação do HTTP controlado; conclusão somente após GET; resposta perdida e fechamento/reabertura mantendo identidade e rascunho; recusa por plano vencido exigindo nova revisão; legado e capacidade indisponível sem comando. Consultas e refresh por teclado não repetem V08.

A inspeção renderizada encontrou dois defeitos reais: o checkbox herdava `width: 100%` dos campos, afastando-o da autorização; no mobile, o footer combinava direção de coluna com bases flex de 180/130 px e ocupava grande parte do modal. Corrigidos somente o tamanho flex do checkbox em `artifact.css` e a direção/base do footer da configuração em `dialogs.css`. O runner agora exige checkbox de até 24 px, footer menor que um terço da janela e ações alcançáveis por foco/rolagem dentro do viewport. Foram conferidos 1280×480, 375×667 e 720×500, sem overflow horizontal da página. Layout aprovado e alterações preexistentes preservados.

Validação final após os ajustes: `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint`, os 38 testes de `project-storage.test.ts`, `project-readiness.test.ts` e `storage-transition.test.ts`, execução Chrome e `git diff --check` passaram. Build conserva o aviso de bundle acima de 500 kB. Nenhuma dependência instalada. Skills de design nomeadas/load_skill e Playwright MCP não foram encontrados; Context7 consultado sobre viewport e screenshots.

**Aceite visual independente via Playwright MCP: pendente. Zoom real do navegador: not_verified.** O caso de 720×500 comprova reflow equivalente a uma janela 1440×1000 em 200%; não altera nem mede zoom real do Chrome. Portanto esta prova complementar não declara c3 integralmente aprovado, nem substitui a revisão independente exigida por INTEGRACAO-MAESTRI-OMP.md §4. O fluxo renderizado de c7 foi exercitado com HTTP controlado, sem comprovar movimento nativo ou integração com backend operacional. Não houve Git de escrita, efeito externo, aprovação ou mudança de fase.

### Correção de c3 — zoom nativo medido (2026-10-23)

O registro acima descreve a execução anterior. Nesta rodada, `scripts/prove-storage-browser.mjs` substitui o caso de reflow simulado por zoom nativo selecionado em `chrome://settings/appearance`, controle `#zoomLevel`, valor 2. Usa perfil temporário exclusivo, descartado pelo Playwright ao fechar, sem modificar o perfil pessoal. Não usa CSS zoom, pinch zoom ou alteração de deviceScaleFactor. O viewport configurado permanece 1440×1000: a medição passa de DPR 1/área CSS 1440×1000 para DPR 2/área CSS 720×500, com visualViewport.scale 1. As asserções exigem essas mudanças e validam limites das ações contra a área CSS medida. Capturas usam viewport visível, evitando o recorte da captura fullPage em zoom nativo.

`tests/browser/evidence/storage-transition/result.json` registra `ok: true`, oito grupos aprovados, medições antes/depois e hashes dos assets reconstruídos. `12-browser-zoom-setting.png`, `12-browser-zoom-200.png` e `12-browser-zoom-200-paths.png` documentam o ajuste e o conteúdo; a captura das ações foi aberta e inspecionada. Janela baixa, largura estreita, teclado, caminhos, estados parciais, rascunho, aceite, resposta perdida/reabertura e recusa de plano foram novamente exercitados. No zoom real, foco/rolagem alcançam atualizar, salvar e fechar dentro do viewport, sem overflow horizontal; o rascunho permanece intacto e refresh não repete V08. A lacuna específica de c3 tem agora prova renderizada reproduzível.

Validação repetida: build, typecheck, lint, 38 testes direcionados em três arquivos e `git diff --check` passaram. Runner Chrome passou duas vezes, incluindo a repetição após ajustar a captura de tela. Permanece o aviso de bundle acima de 500 kB. Nenhuma UI ou dependência foi alterada nesta rodada. A prova usa Chrome/Playwright local com HTTP controlado; não equivale a movimento nativo nem a aceite independente. O MCP foi encontrado nesta sessão, mas sua tentativa de leitura do resultado falhou por restrição de import dinâmico; não se atribui esta execução ao MCP. Sem Git de escrita ou mudança de fase.

## Sprint 011 - Localizações e transição gerenciada na interface [CONCLUIDA]
- Localização gerenciada consultável: Expor as localizações e o acompanhamento da transição no contexto do projeto.

## Sprint — Instruções efetivas versionadas no backend [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-23. Fontes: `AGENTS.md`, SPEC V3 `docs/Docs20261023_014848/SPEC20261023_014848.md`, PRD/stories da mesma revisão (US-08 e RF-36–40), `GLOSSARY.md`, contratos existentes de perfis/capturas e `INTEGRACAO-MAESTRI-OMP.md`. Escopo restrito à composição efetiva dos perfis, captura por tentativa, consulta sob demanda e isolamento do contrato técnico. Nenhuma migration histórica foi editada.

### Implementação

- Migration aditiva `032_profile_composition.sql`; schema passa a 32. `execution_profiles.composition_version` aceita a versão suportada 1 ou NULL para composição ainda incompatível. O runner migra perfis ativos dentro da transação da migration, lê as instruções comportamentais v1 dos recursos distribuídos por papel e as compõe uma única vez com a `guidance` existente. Migração promovida atualiza revisão e timestamp do perfil; texto que já contém integralmente o bloco comportamental não é duplicado.
- Se o resultado exceder o limite vigente de 8.192 caracteres ou a revisão não puder avançar, `guidance` permanece intacta e `composition_version` continua NULL. Preparação indica `PROFILE_COMPOSITION_REQUIRED`; início recusa antes do clone/passagem. Uma edição explícita das instruções pode regularizar o perfil sem ampliar o limite. Criação e alteração regular pelo storage gravam composition_version 1. ETags de configuração incluem versão de composição além da revisão.
- Novas tentativas persistem na captura o perfil por valor, ID/revisão quando existentes, guidance efetiva e composition_version. A preparação redige padrões conhecidos de credencial na cópia efetiva antes do hash/resumo; a captura e as passagens usam essa mesma cópia. As alterações posteriores do perfil não modificam captura nem continuação de correção. Campos de composição ausentes em capturas antigas continuam ausentes nos codecs e são projetados como versão desconhecida (`null`), sem backfill/rewrite.
- A extensão OMP não prefixa mais `role.instructions` fixas como comportamento adicional; o bootstrap contém só referência e schemas técnicos e o prompt usa guidance do perfil capturado, separada do contexto da tarefa. O recurso v1 e seu digest permanecem íntegros para migration/referência histórica. Os schemas de resultado/pergunta continuam versionados e fechados, e o controlador mantém a autoridade sobre binding, papel, critérios, isolamento, recursos e limites.
- A seção de detalhe sob demanda `profiles` em `GET /attempts/:attemptId?section=profiles` expõe até os dois perfis efetivos com revisão, versão, instruções, contexto de issue/critério e resumo do contrato técnico. A resposta redige padrões conhecidos de tokens, headers, URLs com credenciais e chaves privadas; não entra na projeção resumida/polling.
- O editor de perfis explica que a guidance é comportamental e não altera papel, critérios, permissões, schemas nem limites. Nenhuma alteração de layout ou nova dependência foi necessária.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict em produção, cliente, testes e scripts. |
| `npm.cmd run lint` | Exit 0; fronteiras de módulos e convenções. |
| `npm.cmd test -- --reporter=json --outputFile=.cache/profile-composition-tests-delivery.json --no-color` | Exit 0; **1.759 testes aprovados, zero falhas/pendências, 255 suítes**. |
| Testes focados de storage/captura/preparação/revisão/OMP/UI help | Exit 0; migration idempotente, ambas as roles, deduplicação do texto legado, over-limit sem perda, captura estável após save, correção com guidance capturada, redaction da consulta, schemas OMP fixos e resposta HTTP sob demanda. |
| `npm.cmd run build` | Exit 0; migration 032, controlador, recursos e web distribuídos. Bundle JS 1.059,80 kB (gzip 265,58 kB), acima do aviso configurado de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, sessão, CAS/idempotência, shutdown e lock; preflight controlado, Maestri/OMP não executado. |
| `npm.cmd run test:distribution` | Exit 0; pacote relocável, SQLite nativo, múltiplos cwd/processos e restart; preflight controlado, Maestri/OMP não executado. |
| `git diff --check` | Exit 0; sem whitespace inválido. |

A suíte usa SQLite/filesystem/HTTP locais e adapters controlados. A distribuição exercitada usa recursos compilados, sem conta operacional. Nenhum OMP/TUI/provider real, Git/GitHub, navegador, publicação, instalação operacional, credencial, migration de banco do operador, commit ou push foi executado. A prova local confirma a composição e os limites do backend, sem declarar integração real, aceite visual, aprovação ou mudança de fase.

## Sprint 012 - Instruções efetivas versionadas no backend [CONCLUIDA]
- Composição migrada sem perda: Tornar guidance a fonte comportamental efetiva dos perfis existentes e novos.
- Captura e consulta da composição histórica: Vincular a execução às instruções efetivas capturadas no início.

## Sprint — Editor de instruções e perfil histórico [IMPLEMENTADA; VALIDAÇÃO TÉCNICA CONCLUÍDA]

Data: 2026-10-23. Fontes: AGENTS.md, SPEC V3 e stories US-08/RF-36–40 em `docs/Docs20261023_014848`, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md §4. Preservadas as alterações anteriores no repositório canônico e a composição backend da sprint-012. Sem migration, dependência nova ou armazenamento paralelo de instruções.

- `ProfileForm.tsx` edita a guidance efetiva de Implementador e Revisor pelo comando de perfil existente, junto das escolhas de execução. Explica que alterações valem para novas tentativas e não alteram papel, critérios, permissões, schemas ou limites técnicos. Contagem Unicode e medição do JSON UTF-8 distinguem 8.192 caracteres de 16.384 bytes; texto excessivo permanece integralmente no rascunho. Erros de campo são associados à edição. Conflito mantém texto e ETag originais até reaplicação explícita; a guarda do submit também impede um novo envio durante o conflito. Atualizações da configuração não substituem a edição nem confirmam save sem recibo correspondente.
- `HistoricalProfile.tsx`, integrado ao detalhe existente da tentativa, consulta `section=profiles` somente por ação explícita. Valida identidade, seção, papéis únicos e schema compartilhado de composição redigida antes de renderizar. Mostra instruções, contexto, papel, executor/modelo/esforço, revisão e versão históricas; ausências legadas ficam indisponíveis. Não consulta perfis atuais nem acompanha seus eventos para substituir o histórico. Cleanup descarta respostas após troca de tentativa/desmontagem. Textos longos têm quebra e rolagem local acessível por teclado.
- `profile-instructions.test.ts` e `historical-profile.test.ts`: nove regressões React/DOM controladas cobrem ambos os papéis, recibo posterior ao envio, conflito/erro de campo/413 com rascunho preservado, reaplicação com ETag atual, limites Unicode/UTF-8, histórico sob demanda, dados legados, resposta inválida e conclusão tardia. A documentação React foi consultada via Context7 para cleanup e campos controlados. As skills de design nomeadas/load_skill não estão disponíveis; mantidos componentes, tokens e modal existentes.

Validação técnica: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build`: exit 0. Suíte integral `.cache/profile-editor-sprint-tests.json`: **1.768 aprovados, zero falhas/pendências, 145 arquivos**, exit 0, após a guarda final de conflito. Build distribuiu `index-CixlEkfD.js` (1.066,67 kB; gzip 266,96 kB), preservando o tamanho acima do aviso de 500 kB. `git diff --check` passou antes deste registro.

A prova renderizada está sendo executada pelo Revisor independente conforme §4; seu resultado será acrescentado sem promover testes DOM a aceite Chrome. HTTP/SQLite/adapters da suíte são controlados nas integrações externas. Nenhuma instalação operacional, Git de escrita, GitHub real, provider, Maestri/OMP, publicação, aprovação ou mudança de fase foi acionada.

Correção encontrada pelo Revisor em Chrome/MCP: ao consultar o histórico, a remoção do botão enviava o foco ao BODY. O controle agora permanece montado durante carga, erro e sucesso, com bloqueio de novo envio enquanto carrega e atualização explícita posterior. O teste de histórico passou a exigir a identidade e o foco do mesmo botão. Após esse ajuste, typecheck, lint, nove testes direcionados e build passaram novamente; `git diff --check` também passou. A suíte integral acima antecede somente essa correção de foco. Bundle corrigido: `index--lUkqOGn.js`, SHA-256 `2a759efc6e3881f74e0d96a65c50ec506673694b39160de2d5166acdd28f2690`, 1.066,70 kB (gzip 267,00 kB). A repetição renderizada está pendente neste ponto do registro.

### Revisão renderizada independente — concluída nos limites controlados

O Revisor repetiu a jornada sobre o bundle corrigido em Playwright MCP/Chrome 155.0.8059.86, com servidor estático próprio em 127.0.0.1:4310 e APIs integralmente interceptadas. Resultado e reprodução em `tests/browser/evidence/profile-instructions/result.json`, `proof.mcp.js` e `static-server.mjs`; a lista `captures` identifica 14 PNGs desta jornada final, com hashes dos assets e evidências. Imagens de texto longo, limite UTF-8, ações mobile e histórico foram abertas e inspecionadas independentemente.

Passaram: editor dos dois papéis e patch isolado de guidance; 412/reaplicação com revisão atual, erros de campo e 413 mantendo rascunho; limites de caracteres e UTF-8 bloqueando PUT; save pendente sem fechamento/sucesso antecipado; consulta histórica sob demanda com papel/revisão/composição/contexto; edição atual e resync sem substituir captura; campos legados indisponíveis; resposta sem confirmação de redação recusada antes de renderizar. Desktop e mobile 390×844 foram exercitados por teclado, com ações alcançáveis e sem overflow horizontal da página. Após Enter na consulta histórica, o foco permaneceu no BUTTON dentro do diálogo. Zero pageerrors na execução final. Browser MCP fechado e servidor próprio encerrado ao terminar.

Esta é prova da UI compilada e do transporte frontend com HTTP sintético, separada da integração e persistência reais. Não comprova redação universal de credenciais pelo backend, SSE real ou execução Maestri/OMP/GitHub. Os testes backend anteriores mantêm suas evidências próprias. Nenhuma instalação operacional, provider ou efeito externo foi utilizado; sem Git de escrita, aprovação ou mudança de fase.

## Sprint 013 - Editor de instruções e perfil histórico [CONCLUÍDA LOCALMENTE]
- Instruções efetivas editáveis: editor existente dos dois papéis com limites, erros e conflitos preservando rascunho.
- Consulta histórica: composição capturada sob demanda, sem substituição pelo perfil atual, com revisão independente renderizada nas condições acima.

## Sprint 013 - Editor de instruções e perfil histórico [CONCLUIDA]
- Instruções editáveis dos dois papéis: Integrar guidance efetivo ao editor existente de perfis.
- Consulta histórica da composição: Apresentar o perfil capturado da tentativa sem substituí-lo pelo perfil atual.

## Sprint — Terminais próprios e ocupação segura [IMPLEMENTADA; VALIDADA LOCALMENTE]

Data: 2026-10-23. Escopo RF-45–49/US-10, com a compatibilização de sessão por tentativa/papel registrada em `INTEGRACAO-MAESTRI-OMP.md` §10 para respeitar a entrada das sprints de base. Preservadas as alterações preexistentes; nenhuma dependência, operação Git, provider, recrutamento Maestri real ou publicação executada.

### Implementação

- Migration aditiva `033_managed_terminals.sql`; schema 33. Cria `managed_terminals`, `attempt_sessions` e `terminal_occupancies`, com propriedade Factory, instalação/host/papel, geração monotônica, sessão única por `(attempt_id,role)`, vínculo da passagem à sessão e índices únicos para ocupação física/lógica ativa. Migrations 001–032 permanecem inalteradas; históricos anteriores ficam sem sessão inferida.
- `createAttempt` persiste as duas identidades de sessão antes da ocupação e do clone, em transação com a intenção/recibo já existente. Diretórios de sessão são relativos à raiz gerenciada do projeto/tentativa. Cada tentativa usa `--session-dir` próprio; OMP retorna identidade nova. Revisões seguintes do Revisor usam `--continue`; correções do Implementador mantêm `followUp` na sessão acompanhada.
- `ExecutionPersistence.reserve` grava ocupação e generation fence antes do efeito Maestri. Handshake vincula workspace/terminal/session observados à sessão persistida e rejeita substituição ou IDs OMP duplicados. Resultado oficial libera somente a ocupação lógica. Falhas, perda de tracking, cancelamento sem prova de parada e restart preservam `uncertain`; não há lease nem timeout que libere a reserva.
- Terminais próprios ficam compartilhados por instalação/host/papel, fora da propriedade removível do projeto. Uma nova tentativa pode escolher terminal próprio anteriormente liberado; a composição exige `confirmStoppedTerminal` com identidade física atual duas vezes, incluindo imediatamente antes de `maestri recruit --replace`, e o handshake exige os mesmos IDs. Sem a capacidade, ou diante de ocupação/incerteza/substituição, o terminal anterior não é tocado: a sessão é reatribuída antes da ocupação a um terminal Factory novo. Terminais manuais não são procurados nem adotados. Inícios concorrentes também criam outro terminal próprio quando o anterior segue ocupado/incerto.
- `project-configuration-lock.ts` bloqueia por ocupação `occupied/uncertain` e mantém os gates de tentativa ativa, publicação pendente e efeitos `running/unknown`. Terminal disponível após tentativa concluída não bloqueia sozinho. A barreira de exclusão também considera ocupações; a finalização remove sessões/ocupações de tentativas do projeto e preserva os registros compartilhados de `managed_terminals`. A parada continua necessária para remoção do ambiente.
- `INTEGRACAO-MAESTRI-OMP.md`, §10, e `GLOSSARY.md` registram a compatibilização; README e `docs/integration/maestri-omp-adapter.md` descrevem sessão física/lógica e a necessidade de observação atual. Não houve alteração de API HTTP ou UI.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; controlador, contratos, cliente, testes e scripts strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.773 testes em 146 arquivos**, zero falhas/pendências. |
| `npm.cmd run build` | Exit 0; controlador, migration 033, recursos e cliente compilados/distribuídos. O bundle de 1.066,70 kB mantém o aviso Vite existente de chunk acima de 500 kB. |
| `git diff --check` | Exit 0, sem whitespace inválido. |

As regressões novas exercitam CAS/geração/identidade, ocupação exclusiva, sessão única por papel/tentativa, `--session-dir`/`--continue`, reuso controlado do terminal com sessionId OMP distinto, recusa sem observação física, falhas de parada, restart sem restauração, desbloqueio de configuração após entrega e bloqueio por ocupação incerta. Testes relacionais/HTTP de exclusão confirmam que sessões/ocupações pertencem ao projeto e que `managed_terminals` permanece compartilhado depois da exclusão.

### Provas e limites

- Testes adicionados/estendidos cobrem schema/migration 32→33 sem seed/backfill, sessão por papel, ocupação prévia, exclusividade, reuso com sessionId OMP distinto, recusa quando identidade/disponibilidade não é confirmada, isolamento de terminal incerto, reinício sem restauração, configuration lock após entrega e preservação de terminal compartilhado na exclusão.
- A documentação oficial OMP consultada confirma `--session-dir`, `--continue` e sessão nova em diretório próprio. A documentação oficial Maestri consultada documenta `maestri recruit --replace` como reinício de teammate existente preservando a identidade do terminal. Essas referências sustentam os argv; não comprovam estado real do host. Sem callback de disponibilidade, o terminal anterior não é tocado e a tentativa recebe um terminal Factory novo.
- A suíte usa SQLite/processos/adapters controlados e confirma somente o comportamento sob essas capacidades. Reuso real requer que a composição confiável do host forneça `ExecutionHost.confirmStoppedTerminal`; sem ela, um terminal anteriormente disponível é preservado e uma TUI própria nova é criada. Maestri/OMP/Windows real, substituição concorrente externa e parada física continuam sem prova nesta entrega. O sistema não declara sessão ou autoridade restauradas no restart.
- Nenhum Git/GH, provider, TUI Maestri/OMP real, operação de commit/push, credencial, instalação operacional, alteração de fase ou commit foi executado.

## Sprint 014 - Terminais próprios e ocupação segura [CONCLUIDA]
- Identidade, reserva e disponibilidade dos terminais: Localizar ou criar terminal próprio por papel sem adotar recursos manuais.
- Nova tentativa e recuperação conservadora: Reutilizar recurso físico sem transferir conversa, resultados ou autoridade.

## Sprint — Sessões contínuas por papel na tentativa [CONCLUÍDA LOCALMENTE; CONVERSAS REAIS PENDENTES]

Data: 2026-10-23. Fontes: AGENTS.md, SPEC V3/PRD/stories em `docs/Docs20261023_014848`, US-09/RF-41–44/RF-47, GLOSSARY.md e decisão aplicada de INTEGRACAO-MAESTRI-OMP.md §10. A pré-condição documental está satisfeita pelo contrato atual; não foi simulada aprovação. Preservadas as alterações preexistentes no repositório canônico e as identidades da migration 033.

### Implementação

- Migration aditiva `034_session_continuity.sql`, schema 34: amplia a guarda de origem da passagem aos dois papéis, exigindo a mesma sessão/tentativa/papel, rodada anterior acompanhada e resultado aceito. Estado incerto/interrompido da sessão não pode ser reativado. A geração física não pode avançar sobre conversa de tentativa ainda sem resultado final. Não cria tabela, backfill, JSON de conversa ou alteração de migration histórica.
- `Execution.prepareReviewContinuation` exige handle vivo, resultado oficial e confirmação de ociosidade pela extensão OMP (`isIdle`, mensagens, chamadas e ferramentas pendentes). A espera tem prazo e não bloqueia a recepção dos ACKs que precisam drená-la. Depois exige parada física confirmada pelo adapter/capacidade confiável; aceite do dismiss não basta. Falha impede materialização/retomada e conserva trabalho.
- `continuePassage` valida papel, tentativa, sessão, perfil, recurso e geração. O Implementador mantém follow-up no cwd acompanhado. Para o Revisor, após parada confirmada, o pipeline cria um checkout novo por reviewId exclusivamente da referência retida; a conversa é retomada com `--continue` no diretório persistido, cwd novo e o mesmo ID OMP exigido pelo handshake. Não há substituição por sessão nova nem readopção por histórico. Sem capacidade física de parada, a continuidade revisora fica bloqueada.
- Cada nova revisão recebe versão atual, diff completo paginado contra a versão imediatamente anterior, respostas oficiais do Implementador, achados pendentes e checks vinculados à verificação atual. As duas refs são conferidas antes/depois do diff. Contexto acima do limite de 512 KiB para diff ou dos limites existentes de request/frame recusa despacho, sem truncamento silencioso. Checkouts/evidências anteriores permanecem intactos; não se usam remanescentes como versão nova.
- Novas sessões usam `sessions/<attempt_id>/<role>` sob a raiz gerenciada, corrigindo a colisão entre tentativas do mesmo projeto. Diretórios históricos imutáveis não são reescritos. Terminais liberados logicamente ficam indisponíveis para outra tentativa enquanto a conversa pertence a tentativa sem resultado final. Recibos de parada são restritos à sessão e às passagens até a rodada correspondente: parar o processo anterior não confirma parada da passagem futura.
- Perda da conversa revisora entre rodadas agora interrompe a coordenação, preservando seu parecer. Reinício não restaura canais nem autoridade. SQL continua privado em storage; interfaces de Execution/Workspaces foram estendidas sem endpoint HTTP novo. A conferência do schema da exclusão foi atualizada para 34; sessões/ocupações seguem o inventário existente e terminais permanecem compartilhados.

### Provas locais e limites

Testes controlados cobrem duas correções/três versões, duas sessões lógicas e resultados próprios, ordem ociosidade/parada/materialização, recusa de atualização com Revisor ocupado, perfil e ID OMP exatos, recusa de conversa substituta, vínculos estrangeiros/adulterados, perda e restart sem restauração, fencing/geração, respostas/achados/checks/diff por versão, ACK pendente durante drenagem, diretórios distintos entre tentativas e recibo de parada sem alcançar passagem futura. Upgrade SQLite temporário 33→34 compara integralmente identidades, capturas/resultados/pareceres e ledger anterior sem reseed ou reescrita. Fixtures históricas foram adaptadas ao schema novo sem relaxar as guardas.

Rodadas iniciais expuseram asserções/fixtures ainda baseadas em lançamento por revisão, schema 33 e diretório compartilhado. Foram ajustadas; também foram corrigidas a consulta da geração reservada antes do primeiro reuso e a delimitação dos recibos de parada. Uma falha isolada de consulta não se reproduziu na execução direcionada; a confirmação da suíte final fica registrada abaixo, sem converter o resultado anterior em sucesso.

**Gate real Maestri/OMP: não executado.** Não foram autorizados alvo, perfis/provider e efeitos para ensaio das duas conversas. A documentação do adapter registra o roteiro conjunto com a sprint-014: observar duas correções, perfil/cwd/versão e IDs estáveis por papel, nova sessão em outra tentativa, perda, cancelamento e reinício. A sprint final de composição não substitui este gate. Testes SQL/DOM/adapters e smokes locais não comprovam TUI, conversa real, parada física Maestri ou integração GitHub. Não houve provider, Git/GH real, publicação, alteração de credenciais, instalação operacional, commit/push ou mudança de fase. Nenhuma UI foi alterada.

### Fechamento técnico da versão entregue

| Comando/prova | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 na versão final; TypeScript strict, produção/testes/scripts. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções preservadas. |
| `npm.cmd test -- --reporter=json --outputFile=.cache/session-continuity-validated.json --no-color` | Exit 0; **1.787 aprovados, zero falhas/pendências, 146 arquivos**, após o último ajuste de drenagem. |
| `npm.cmd run build` | Exit 0; controlador, migration 034, recursos e web distribuídos. Bundle web existente 1.066,70 kB / gzip 267,00 kB; permanece aviso Vite acima de 500 kB. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket/framing/UTF-8/EOF e launcher Windows com Node como fixture. `maestriOmpIntegration=not_executed`. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite reais, sessão/CAS/idempotência, shutdown, lock e restart. Preflight controlado; Maestri/OMP não executados. |
| Migration fonte/distribuição | Bytes idênticos; SHA-256 `ec6ba788586f82f8af18e17cac69c2f8b76ed2a68f06a69683c7593b956ed215`. |
| `git diff --check` | Exit 0 antes do complemento; reconferido no fechamento. |

A execução integral anterior `.cache/session-continuity-delivery.json` passou com 1.786 testes; a execução final acima acrescenta a regressão de ACKs durante espera de ociosidade. Relatórios anteriores com falhas permanecem em `.cache/session-{full-first,full-second,continuity-final}.json`, sem serem apresentados como aprovações. A consulta que falhou uma vez passou isoladamente e na suíte final. Testes novos de drenagem/retomada também passaram direcionados antes da repetição integral.

RF-41–44/RF-47 e US-09 têm implementação e provas controladas nas condições descritas. **Aceite integrado das duas conversas permanece pendente**, condicionado à autorização e composição física do host. Sem essa prova, não se declara continuidade real observada de provider/TUI, aprovação de fase ou aceite externo integral.

### Revisão local da sprint 015 - parada preservando identidade

A revisão do launcher e do adapter identificou que `scripts/start-host.mjs` e a descoberta em `main.ts` não fornecem observação física de parada. Também identificou que `maestri dismiss` remove o terminal, contrariando a reutilização da mesma identidade pelo `recruit --replace`. A documentação oficial Maestri de Maestro Mode confirma a remoção; Context7 não retornou a biblioteca correspondente. A presença de operações internas no binário instalado não constitui contrato público suportado.

`ExecutionHost.stopTerminal` separa o pedido de parada que preserva a identidade da observação `confirmStoppedTerminal`. `native.stop` não usa mais `dismiss` e só confirma após ambas as capacidades, dentro do prazo existente. Capacidades ausentes, alvo estrangeiro, falha ou confirmação negativa mantêm estado incerto. A regressão verifica que nenhuma CLI de remoção é chamada. Não há alteração de migrations, autoridade, credenciais ou integrações operacionais.

Validação direcionada: 104 testes passaram em execution, managed-terminals, reviews e attempt-results; lint e diff check passaram. O primeiro typecheck encontrou inferência `Promise<never>` na fixture que simula falha de parada; a fixture recebeu a assinatura explícita do port, sem mudança de comportamento.

**Lacuna operacional ainda aberta:** os dois ports não estão compostos no launcher de produção. A escolha entre bridge Windows mínima e integração Wire própria do produto foi encaminhada ao usuário; credenciais/helpers Wire do ensaio não foram usados como integração do produto. Não se declara a sprint funcionalmente fechada nem prova real Maestri/OMP.

### Bridge composta e ensaio real autorizado - resultado parcial

O usuário autorizou prosseguir com a bridge mínima e executar teste real. `resources/execution/terminal-job.cs` é compilado em `scripts/copy-resources.mjs`; `execution/terminal-jobs.ts` implementa contenção por Job Object, parada, observação e proteção contra attach tardio. `main.ts` compõe a bridge tanto para descoberta normal quanto para executáveis explícitos. Os ports existentes fornecidos por host confiável não são sobrescritos. O Wire existente somente conduz o ensaio e não fornece credenciais ao produto.

A revisão independente identificou e a correção tratou cancelamento antes do hello e rejeição indevida de geração física posterior por uma entrada histórica do runtime. A proteção contra sessão OMP duplicada e contra ocupação da mesma geração permanece. `scripts/prove-terminal-jobs.mjs` comprovou duas rodadas com shell, processo e filho encerrados, identidade divergente recusada, parada anterior ao bind e attach tardio recusado sem executar o comando. Evidência: `.cache/terminal-jobs-1792790021996/result.json`.

O ensaio opt-in `vitest.sessions.config.ts` / `tests/native/session-continuity.proof.ts` usa OMP 18.12.5 com openai-codex/gpt-6-luna/high, TUI Maestri, SQLite e diretórios reais. GitHub, captura/diff Git e observação de integridade são controlados. A primeira rodada falhou antes de inferência por autoload do módulo Set-Acl no Windows PowerShell herdado pelo Node; o bootstrap agora usa DirectoryInfo.SetAccessControl, sem relaxar ACL.

As rodadas seguintes alcançaram a primeira correção. `.cache/session-real-1792790100811/bridge-trace.json` comprova parada física confirmada e novo hello com os mesmos IDs OMP/terminal, porém cwd antigo. O adapter interrompeu a tentativa com TRACKING_LOST. Probe sem inferência `.cache/s15-cwd-observed.json` confirmou cwd antigo mesmo com --cwd explícito; essa tentativa de flag foi removida. Logs de falha preservados em `.cache/s15-real-run{2,3,4}.log`. **Prova real executada e reprovada neste ponto, não concluída.**

Permanece necessária decisão sobre materialização em diretório fixo do Revisor, com retenção de versões/evidências, para compatibilizar conversa contínua com o runtime observado. Nenhuma credencial foi impressa ou persistida em evidências; não houve Git de escrita no repositório canônico, publicação, mudança de fase ou aprovação presumida.

Fechamento desta rodada: a geração acompanha também pedidos/observações de parada, impedindo que um cancelamento histórico alcance a árvore nova do mesmo terminal. A prova nativa final `.cache/terminal-jobs-1792790582942/result.json` passou com recusa de stop histórico e preservação da árvore atual, além dos cenários anteriores. Os 106 testes direcionados de execution/managed-terminals/reviews/attempt-results, build, lint e diff check passaram. Typecheck final conferido separadamente. A revisão independente foi somente leitura e seus achados foram tratados sem apagar registros anteriores. O bloqueio real de cwd permanece, sem nova inferência depois do probe sem provider.

A rechecagem independente encontrou também cancelamento antes de hello em terminal reutilizado que já tinha identidade física histórica. `native.stop` agora tenta primeiro o Job pendente da geração exata, inclusive nesse caso; um alvo de workspace divergente é recusado antes. Os 55 testes de execution passaram novamente e `.cache/terminal-jobs-1792790671403/result.json` comprovou cancelamento antes do bind na terceira geração do mesmo terminal, além de stop histórico recusado, árvore de processos encerrada e attach tardio selado. Build e diff check passaram. O feed confirmou todos os terminais factory criados no ensaio sem processo ativo e, depois, o terminal âncora próprio também parado. Nenhum nó do canvas foi removido.

### Decisão aplicada: um checkout por tentativa - 2026-10-23, 18:37

O usuário substituiu expressamente a arquitetura de cópias por papel/rodada por um checkout próprio por tentativa. SPEC raiz, cópia documental e INTEGRACAO-MAESTRI-OMP.md registram a precedência dessa decisão. Repositório original e ambientes históricos são preservados. A decisão não autoriza remover arquivos existentes ou iniciar a sprint seguinte.

`Execution.preparePassageHandoff` confirma ociosidade e parada de ambos os papéis. O pipeline faz o handoff do Implementador antes de reivindicar a captura (eventos de parada mudam a revisão operacional e não podem invalidar uma claim já aberta) e o do Revisor antes de retomar a correção. Ambos retomam via --continue com seu próprio ID OMP e o mesmo cwd. Perda ou parada incerta bloqueia o próximo papel.

Workspaces usa `createAttemptMaterializer` para checks e revisão: retorna o checkout de implementação após verificação da versão, sem clone adicional. `createCapturer(input, expectedDelivery)` compara nomes, bytes binários e modos contra a tree retida, verifica refs antes/depois e estabilidade da observação; esse caminho não grava objetos, índice ou refs. Checks conferem antes/depois; a aceitação do parecer confere novamente. Evidências usam `.factory-evidence/<reviewId>/`, sem sobrescrever rodadas anteriores. A exclusão Git dessa pasta é criada exclusivamente no clone novo da preparação, antes dos agentes; a materialização/validação não escreve metadados fornecidos pelo agente. Esta última correção atende ao achado independente sobre links em `.git/info/exclude`.

Os 119 testes direcionados passaram; regressões de captura, recuperação e composição passaram após isolar quatro testes de transação SQL da emissão concorrente do evento controlado de handoff. Os 19 testes de deliveries passaram novamente; os 25 testes de preparação/shared-attempt também passaram. Typecheck e lint foram conferidos durante a rodada. Resultados anteriores de falha permanecem em `.cache/shared-attempt-*.json`.

O ensaio real foi ampliado para clone/captura/diff/conferência Git reais, além de SQLite, Job Object e duas TUI OMP. A primeira execução recusou corretamente um cache MCP/npm não ignorado maior que o limite; a fixture passou a ignorar seus caches, sem relaxar a captura. A segunda execução retomou os dois papéis no checkout comum e aprovou a versão 2; a asserção que exigia três versões falhou porque o exemplo foi corrigido antecipadamente. O roteiro foi tornado explicitamente escalonado para exigir duas trocas de correção. O ensaio final permanece em execução neste ponto do registro; não há aceite antecipado.

### Resultado final do percurso compartilhado

O percurso real de `.cache/session-real-1792792216498` chegou a publishing na terceira versão, com seis resultados oficiais e três revisões, a última aprovada. Os seis hellos mostram um único cwd e um ID OMP estável por papel. Clone, captura, diff e conferência de conteúdo Git, SQLite, Maestri/TUI, perfil Luna/high e parada Windows foram reais. GitHub/autoridade e checks configurados da fixture continuam controlados; não houve publicação externa ou alteração na issue operacional.

A execução inicial do runner concluiu o percurso, mas falhou depois ao extrair `terminal_id` de attempt_sessions em vez de managed_terminals. A consulta foi corrigida com JOIN. `FACTORY_REAL_SESSION_RECHECK` revalidou em modo somente leitura o progresso datado, seis resultados, duas sessões, três rodadas, IDs/cwd e conteúdo final do mesmo ensaio; exit 0, sem inferência adicional. `result.json` foi produzido pela revalidação e não por uma nova execução de agentes. O log inicial `.cache/s15-shared-real-run3.log` permanece com sua falha de extração, sem ser reclassificado como comando aprovado.

Validação local: 119 testes direcionados passaram; a suíte completa executou 1.792 testes, com 1.790 aprovados e duas expectativas legadas falhando (quantidade de conferências antes/depois dos checks e hash de blob na fixture Git). As duas foram corrigidas e seus arquivos completos passaram em `.cache/shared-attempt-final-fixes.json`. A suíte completa não foi repetida após essas correções restritas aos testes. Build, typecheck, lint, diff check e smoke de execução compilada passaram; este último usa Node como fixture e não é contado como prova Maestri/OMP.

A revisão independente confirmou a alternância e a validação da tree; o achado sobre escrita em exclude foi corrigido e reconferido. A limitação de cwd que bloqueava a sprint 015 foi resolvida pelo checkout único autorizado. O aceite aqui é do percurso delimitado, não de GitHub real, UI ou do pacote V3 inteiro. Nenhuma sprint seguinte, aprovação de pipeline, staging, commit ou push do repositório canônico foi executado.

## Sprint 016 - Sessões, recursos e recuperação na interface [CONCLUÍDA LOCALMENTE]

Data: 2026-10-23. Retomada após interrupção por limite de tokens. Fontes: SPEC V3, US-09/US-10 e feat-028/feat-029 do plano `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores preservadas no repositório canônico.

- A consulta de passagens projeta sessão, origem da continuidade, terminal atual e ocupação histórica. `PassageFacts` diferencia papel/rodada, sessão, terminal, acompanhamento e parada, com ausências legadas explícitas. Perda de acompanhamento informa interrupção, preservação do trabalho e próxima ação, sem inferir parada física ou autoridade recuperada.
- Recursos usam a superfície de interação existente da passagem; indisponibilidade possui descrição acessível. O detalhe diferencia recursos atuais da tentativa e histórico da versão. Respostas de consulta, recursos e comandos ficam vinculadas à seleção, descartando retornos tardios após trocar tentativa, rodada ou versão. Nenhum comando é repetido pela consulta ou reabertura.
- Validação nesta retomada: 65 testes em sete arquivos passaram (`session-resources`, `observation-requests`, `attempt-results`, `project-configuration-lock`, `project-readiness`, `historical-profile`, `queries`); build, typecheck, lint e diff check passaram. Inclui bloqueio por ocupação incerta e configuração liberada para terminal ocioso pelo contrato atual do backend.
- Playwright MCP executou `tests/browser/session-resources.playwright.js` com APIs controladas, Vite local e código atual: ativo, ocioso, incerto, perdido e legado; quatro ações indisponíveis descritas; fechamento/reabertura; nenhuma mutação operacional nem erro JavaScript. Capturas em `tests/browser/evidence/sprint016-desktop.png` (1440×1000) e `sprint016-mobile.png` (390×844), sem overflow horizontal. Inspeção visual confirmou leitura e rodapé acessível no mobile.
- As primeiras tentativas do roteiro falharam por fixture sem data, seletor incorreto de fechar, seletor ambíguo após reabertura e classificação da criação de sessão HTTP como mutação operacional. Foram corrigidas no roteiro. O stream controlado recebeu MIME SSE correto. Essas falhas não foram atribuídas ao produto.
- Limites: prova de UI controlada, sem controlador real, provider, abertura nativa de terminal ou publicação externa nesta sprint. A suíte completa não foi repetida. O build conserva aviso de tamanho do bundle. Nenhum pipeline, staging, commit, push ou sprint seguinte foi iniciado.

## Sprint 017 - Pacote verificável de correção [CONCLUÍDA LOCALMENTE]

Data: 2026-10-23. Execução direta autorizada pelo usuário após a sprint 016, sobre a base `76907bf`. Fontes: SPEC V3, US-11/RF-50–52 e feat-030/feat-031 do plano `docs/Docs20261023_014848/sprints20261023_014848.json`. Sem início de pipeline ou avanço para a sprint 018.

- Achados novos exigem prioridade explícita. A migration 035 acrescenta prioridade e origem sem alterar envelopes aceitos ou inventar prioridade para legado: a leitura histórica mantém `null`. O controlador atribui os IDs privados e projeta versão e identidade de conteúdo da revisão correspondente. A origem só pode apontar para um achado raiz anterior, pendente, da mesma tentativa, categoria e critérios, com resolução explicitamente não concluída; referências incompatíveis, origens intermediárias e duplicações na mesma revisão são recusadas. A ordem de rodadas e a imutabilidade impedem ciclos. Não há associação por semelhança textual.
- Os schemas enviados às ferramentas OMP exigem prioridade/origem nullable e justificativa nullable do Implementador, mantendo `execution_complete`/`execution_question` e o envelope privado v1. Schemas históricos continuam legíveis sem mudar hashes. A reconstrução TypeBox na extensão passa a aceitar `null`; a API foi consultada via Context7. As correções exigem respostas a todos os achados e justificativa explícita, ou `null` quando não houve alteração adicional. A projeção HTTP de resultados legados apresenta justificativa ausente como `null`.
- Revisão e correção recebem checks da verificação vinculada e trechos dos logs, com metadados de escopo, tamanho e SHA-256 conferidos. Limite de 16 KiB de origem por log e 128 KiB no conjunto, dividido entre os artefatos; truncamento explícito preserva a referência para consulta integral. Bytes divergentes bloqueiam o despacho. Logs não são copiados para resumos, polling ou novas tabelas. Falha técnica de execução não cria achado nem inicia correção automaticamente; check reprovado permanece evidência a investigar.
- A política de exclusão foi conferida e atualizada para o schema 35: não há nova tabela ou caminho físico, e a origem fica restrita à mesma tentativa. Fixtures de upgrade removem a extensão somente em bancos temporários. As expectativas de versão do schema foram atualizadas sem alterar checksums anteriores.
- Validação final: 198 testes em seis arquivos de contratos, extensão, execução, composição, resultados e revisão passaram (`.cache/sprint017-final.json`). Os seis arquivos de regressão das correções passaram em 93 testes (`.cache/sprint017-fixes.json`), incluindo exclusão HTTP/worker e persistência com caches volumosos. A suíte completa anterior executou 1.801 testes: 1.755 passaram e 46 falharam em cinco arquivos, por política de inventário ainda limitada ao schema 34 e fixtures sem justificativa ou leitura dos logs. Esses cinco arquivos passaram integralmente na rodada de correção; o relatório inicial permanece em `.cache/sprint017-tests.json`. A suíte completa não foi repetida depois dessas correções.
- Build, typecheck, lint e diff check passaram. O smoke compilado de execução confirmou schemas distribuídos fora do cwd do repositório, transporte UTF-8 e lançamento Windows com fixture Node. O build mantém o aviso de bundle maior que 500 kB.
- Limites: provas determinísticas e controladas; sem nova inferência, integração real Maestri/OMP, GitHub ou publicação externa. Não houve alteração de layout ou nova prova de navegador, revisão por outro agente, staging, commit ou push. O aceite local desta sprint não declara o pacote V3 inteiro concluído.

## Sprint 018 - Revisão focada e aprovação completa por versão [CONCLUÍDA LOCALMENTE]

Data: 2026-10-23. Execução direta autorizada pelo usuário após a sprint 017. Fontes: SPEC V3, US-12/RF-53–56, RNF-03/RNF-09 e feat-032/feat-033 de `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores preservadas no repositório canônico.

- O despacho distingue revisão inicial completa de revisão focada em diff, pendências e regressões, permitindo ampliar a conferência. Todos os critérios continuam obrigatórios em cada parecer, com prova independente da versão atual. O perfil explicita que compilação, typecheck, conversa e aprovação histórica não substituem a prova visual exigida. O contexto fornece os checks e logs pertinentes da versão, sem transportar aprovação anterior.
- `ReviewCommandRepetition` registra comando, referência opcional ao check, evidência anterior e motivo concreto no resultado estruturado. A referência ao check é conferida contra a verificação, versão, conteúdo e comando do parecer. O schema distribuído ao OMP exige a lista, inclusive vazia; envelopes históricos continuam legíveis sem reescrever hashes. O detalhe HTTP projeta `command_repetitions`; resumos e polling não carregam a lista. Duração e consumo disponíveis continuam nas medições existentes, sem inventar consumo ausente.
- A migration 036 acrescenta `checks.repeat_reason`, obrigatório ao repetir comando com check aprovado e artefato da mesma versão, e preserva os registros históricos. Reexecução explícita de verificação válida exige motivo. Após falha parcial ou interrupção, a repetição do conjunto completo registra a causa operacional e a referência ao check anterior. Cada correção continua executando todos os checks em uma nova versão; evidência da versão anterior não atende à atual. A política de exclusão reconhece schema 36, sem nova tabela ou caminho físico.
- A guarda SQL complementa as validações transacionais existentes: aprovação exige resultado oficial aprovado, cobertura dos critérios atuais e ausência de bloqueantes anteriores sem resolução independente. Permanecem as guardas de independência e checks. Testes exercitam omissão, `not_verified`, bloqueante não resolvido, referência de repetição de outra versão, aprovação SQL direta, recibo idempotente e preservação de pareceres e checks anteriores.
- Validação: relatórios `.cache/sprint018-directed3.json`, `.cache/sprint018-regressions.json` e `.cache/sprint018-retry.json` passaram. A última suíte completa executou 1.806 testes: 1.801 passaram e cinco endpoints falharam pela projeção indevida da lista no resumo; a projeção foi corrigida e os cinco arquivos completos passaram no relatório de regressões, junto com revisão. O teste adicional de repetição após falha parcial passou depois na suíte completa de verificação. A suíte global não foi repetida após essas correções. Falhas anteriores permanecem em `.cache/sprint018-directed.json`, `.cache/sprint018-directed2.json` e `.cache/sprint018-full.json`.
- Build, typecheck, lint, diff check e smoke compilado passaram. O smoke usa fixture Node para o lançamento Windows e não comprova Maestri/OMP; o build mantém o aviso de bundle acima de 500 kB. Não houve alteração de layout, prova de navegador, provider real, GitHub real, revisão por outro agente, staging, commit, push, pipeline ou avanço para a sprint 019.
- Limite da evidência: a fábrica valida vínculos e cobertura estrutural, preservando evidências e motivos declarados pelo Revisor. Não classifica semanticamente texto livre para decidir se uma prova visual é suficiente, nem observa automaticamente comandos nativos omitidos do resultado. A exigência de validação independente permanece no contrato do papel; esta rodada não constitui novo aceite integrado real.
## Sprint 019 - Progresso verificável e bloqueio de recorrência [CONCLUÍDA LOCALMENTE]

Data: 2026-10-23. Implementação direta somente da sprint-019, conforme RF-57–60, US-13.C1/C2/C4 e feat-034/feat-035 do plano `docs/Docs20261023_014848/sprints20261023_014848.json`. Working tree anterior das sprints 017/018 preservado.

- Migration 037 aditiva: `finding_assessments` imutável, com origem canônica, tentativa e revisão vinculadas por FKs; rodada, versão e conteúdo derivados da revisão. Guardas rejeitam origem intermediária, revisão selada/incompatível e progresso sem referência verificável. `attempt_blocks` preserva a primeira causa, identidade, revisão, versão, evidências e limite capturado. Exclusão dessas tabelas só pelo finalizador já autorizado e suas chaves exatas; nenhum projeto foi excluído nesta implementação.
- O resultado do Revisor recebe avaliações por ID canônico explícito; o schema distribuído exige a lista, mantendo envelopes antigos legíveis. `proven`/`partial` exigem referência `artifact:<id>` a artefato não vazio de check aprovado da verificação e conteúdo atuais. A aceitação confere metadata e vínculos estruturais, sem reler ou recalcular o hash dos bytes nessa transação. A verificação de tamanho e SHA-256 no contexto antes do despacho é uma etapa distinta e não comprova integridade atual dos bytes na aceitação. Declaração, edição, referência inexistente ou de outra versão não estabelece progresso. Ausência de avaliação persiste `not_assessable`; `none` e `not_assessable` não zeram a sequência. Não há inferência por texto.
- Após duas correções concluídas sem progresso no mesmo bloqueante ainda pendente, o controlador persiste o bloqueio na transação do resultado e impede nova passagem antes do recrutamento. Achados novos não apagam histórico. Revisão pendente/inválida não conta como correção concluída nem permite continuidade automática. O limite total inclui zero; em empate na mesma revisão, o limite total tem precedência determinística. Bloqueios existentes nunca são substituídos por outra causa.
- GET do detalhe projeta `block` e a página sob demanda `v3_details` para `section=finding_assessments`, com paginação, escopo de tentativa/rodada/versão e nomes HTTP snake_case. Consultas não repetem efeitos. As ações de decisão humana permanecem indisponíveis neste recorte; sua implementação pertence às sprints posteriores. Cancelamento e interrupção por perda de acompanhamento continuam separados do registro imutável do bloqueio.
- Validação: recorte de 248 testes em 11 arquivos de revisão, consultas, verificação, terminais, contratos, executor/extensão, storage, finalização e composição/persistência. Nove arquivos passaram; os dois arquivos afetados por uma ambiguidade SQL foram corrigidos e repetidos integralmente, com 58/58 testes passando. Inclui progresso parcial/comprovado, ausência de prova, novas origens, rollback de recibo/avaliação/bloqueio, limite zero, HTTP autenticado, paginação e migração v36 sem reescrever históricos. A suíte global posterior executou 1.817 testes: 1.771 passaram e 46 falharam em quatro arquivos de exclusão. A política de conferência foi atualizada para schema 37 e a expectativa da fixture histórica foi corrigida para as tabelas novas sem dados legados; os quatro arquivos completos passaram em 66 testes (`.cache/sprint019-deletion-final.json`). O relatório global com falhas permanece em `.cache/sprint019-final-full.json`; a suíte global não foi repetida após essas correções. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check` e `npm.cmd run test:execution-compiled` passaram. O smoke usa fixture Node, sem prova Maestri/OMP; permanece o aviso de tamanho do bundle web.
- Complemento conferido: `reviews.test.ts` passou com 50/50 testes (`.cache/sprint019-clean-reviews.json`), incluindo limites 0–5 e recorrência. `Capability.reason` e `recovery` são opcionais; os bloqueios mantêm motivos explícitos para capacidades indisponíveis. Avaliações são projetadas somente em `v3_details` no HTTP e `v3Details` internamente, com `details=null`, coberto por regressões. `npm.cmd run test:compiled` também passou, com HTTP/SSE/SQLite, shutdown e reinício locais, sem Maestri/OMP. Relatórios anteriores com falhas permanecem preservados.
- Limites: evidência determinística/controlada, sem nova inferência de provider, integração real Maestri/OMP, navegador ou publicação externa. Sem nova dependência, alteração de layout, pipeline, aprovação de fase, Git de escrita ou implementação de outra sprint.

## Sprint 020 - Contestações e divergência encaminhada [IMPLEMENTADA LOCALMENTE; ACHADO CORRIGIDO; SUÍTE INTEGRAL SEM FALHAS]

Data: 2026-10-23. Execução direta da sprint-020, conforme US-14/RF-61–63 e feat-036/feat-037 de `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores das sprints 017–019 preservadas.

- Migration 038 acrescenta `finding_disputes`, com vínculo composto ao achado, tentativa, passagem do Implementador, versão e conteúdo. Guardas SQL validam resposta `disputed` contra o resultado aceito, preservam os campos originais e permitem uma única resposta completa do Revisor ligada à revisão/versão correspondente. O descarte segue a autorização do finalizador existente.
- O controlador grava a contestação na mesma transação do resultado idempotente do Implementador; ela não resolve o achado. O Revisor recebe disputas pendentes e precisa responder todas, sem duplicação, com resolução compatível em `finding_resolutions`. A aceitação sela resposta, resolução, parecer e bloqueio na mesma transação.
- Quando uma revisão independente rejeitada mantém a contestação, o bloqueio `dispute_maintained` impede uma nova correção antes do recrutamento e preserva a primeira causa. O limite total mantém precedência em empate. O detalhe do bloqueio registra justificativas de ambas as partes, evidências e alternativas para decisão posterior; a interface de escolha segue nas sprints previstas.
- O histórico de contestações é consultado sob demanda em página própria e expõe a identidade original e a versão da resposta. A comparação de schemas de papel normaliza a ordem irrelevante do array JSON Schema `required`, mantendo os JSON versionados sem regravação nesta sprint.
- Validação focada original: 267 testes em oito arquivos diretamente afetados passaram; `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` e `git diff --check` passaram. A build mantém o aviso de bundle web acima de 500 kB. A primeira rodada encontrou comparação de schema e fixtures de migration desatualizados; as causas foram corrigidas antes da rodada final focada.
- Naquela etapa, a revisão read-only independente foi solicitada duas vezes ao agente Revisor de Código e expirou em ambas após 60 segundos; o timeout não foi tratado como aprovação. A revisão foi concluída posteriormente, conforme a atualização abaixo.
- Limites: validação determinística/controlada, sem prova real Maestri/OMP, provider, navegador ou UI. A escolha humana e a tela consolidada permanecem nas sprints posteriores. Sem pipeline, aprovação de fase, staging, commit, push ou efeito externo.
- Atualização de revisão independente (2026-10-23; comparação com HEAD `76907bf2bcc69fb1868047fe0efdd884d5f7bbbf`): o eixo Standards não encontrou violação documentada; registrou como observações de manutenção a concentração de responsabilidades em `blockCorrection` e as buscas lineares limitadas a 1.000 itens em `respondToDisputes`. O eixo Spec encontrou que `recordDisputes` rejeita `findingResponses` sem `responseType` (`apps/controller/src/modules/storage/disputes.ts:9-11`), embora o contrato mantenha o campo opcional (`packages/contracts/src/execution.ts:35-37`) e feat-036 exija justificativa/evidência somente para `disputed`. Isso quebra o fluxo de correção compatível com envelopes arquivados; a omissão deve ser tratada como resposta corrigida e a contestação registrada somente para `disputed`.
- Suíte integral posterior no working tree das sprints 017-020: `npm.cmd test` executou 1.823 testes em 148 arquivos; 1.814 passaram e 9 falharam em 7 arquivos. Cinco fluxos de aceitação/integração falharam pelo `RESULT_INVALID` acima; três comparações de schema HTTP falharam para `ImplementerResult`, `Review` e `ProducerResult`; um teste de storage espera a lista de tabelas sem `finding_disputes`. `npm.cmd run typecheck` e `npm.cmd run lint` passaram. Esta rodada mais ampla complementa, sem substituir, a validação focada anterior de 267 testes.
- Correções autorizadas em 2026-10-23: `recordDisputes` aceita a omissão histórica de `responseType` e registra contestação somente para `disputed`, preservando o resultado original e sua idempotência. Uma regressão cobre aceitação/repetição sem criar contestação nem reescrever o envelope; tipos inválidos continuam recusados. As expectativas de schema reconhecem explicitamente `response_type` nullable na projeção HTTP e `dispute_details_url` apenas no parecer completo, sem acrescentá-lo aos resumos. O inventário esperado de storage inclui `finding_disputes`.
- Validação das correções: a primeira rodada integral passou em 1.817 de 1.824 testes, com sete falhas restritas ao comparador de schema do teste (`.cache/sprint020-corrections-full.json`); a detecção de parecer completo e a ordem esperada dos campos obrigatórios foram corrigidas, e os 72 testes de contratos passaram. A rodada integral final passou em **1.824/1.824 testes, nos 148 arquivos, sem falhas ou pendências** (`.cache/sprint020-corrections-final-full.json`). Typecheck, lint, build e `git diff --check` passaram; `test:compiled` e `test:execution-compiled` também passaram. Permanece o aviso de bundle web acima de 500 kB. Os smokes usam integração HTTP/SSE/SQLite local e fixture Node de execução, sem nova prova Maestri/OMP, provider ou navegador. Nenhum staging, commit, push, pipeline ou avanço de sprint foi executado.

## Sprint 021 - Decisões humanas e preparação sucessora [IMPLEMENTADA LOCALMENTE; SUÍTE INTEGRAL SEM FALHAS]

Data: 2026-10-23. Escopo: US-08.C3, US-13.C3 e RF-38/RF-59–60, conforme feat-038/feat-039 de `docs/Docs20261023_014848/sprints20261023_014848.json`. Execução direta no repositório canônico; UI permanece na sprint 022.

- V02 (`POST /api/v1/attempts/:attemptId/decisions`) aceita orientação, troca de perfil ou encerramento com sessão/CSRF, Idempotency-Key e If-Match do detalhe atual. Replay idêntico recupera o recibo antes do CAS; uso divergente da chave conflita. Migration 039 acrescenta `attempt_decisions` append-only, com autorização vinculada à tentativa, bloqueio, versão e operação; o histórico paginado é consultado em `section=decisions` sob demanda.
- `guidance` é registrado fora da captura e do perfil. Ele retoma a mesma tentativa/sessão, preserva critérios e perfil capturados e não contorna o limite total. Progresso verificado permite o fluxo normal; recorrência ou limite alcançado volta a bloquear. `change_profile` confere papel e revisão atuais, cria preparação sucessora vinculada ao mesmo projeto/issue e conserva o limite capturado, sem iniciar nem encerrar a tentativa anterior. O início ainda exige autorização explícita e a exclusividade da issue. `end` grava a decisão e o cancelamento lógico na transação; a parada física usa o executor existente e a limpeza continua consultável separadamente.
- Adicionados testes de aceite/replay, conflito de Idempotency-Key, CAS vencido, autorização por papel/revisão, sucessora sem início, histórico autenticado, cancelamento com limpeza pendente, imutabilidade e migração sem reescrita dos dados anteriores.
- A primeira execução integral encontrou 44 falhas nos testes de exclusão porque o gate do inventário aceitava apenas schema 38. A política foi atualizada para schema 39; as três superfícies focadas de exclusão passaram em 52 testes. A execução integral final passou em **1.831/1.831 testes, em 148 arquivos, sem falhas ou pendências** (`.cache/sprint021-final-rerun.json`). `typecheck`, lint, build, `git diff --check`, `test:compiled` e `test:execution-compiled` passaram. Build conserva aviso de bundle web acima de 500 kB.
- Limites: prova determinística/controlada e HTTP local; sem prova real Maestri/OMP, provider ou navegador. Sem mudança de layout, início de pipeline, staging, commit, push ou efeito externo.

## Sprint 022 - Achados, progresso, contestações e decisões na UI [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-23. Execução direta pelo assistente principal, conforme autorização do usuário para somente a sprint-022. Fontes: feat-040/feat-041 de `docs/Docs20261023_014848/sprints20261023_014848.json`, US-11 a US-14 e contratos entregues nas sprints 017 a 021. Preservado o repositório canônico e o trabalho anterior.

- O detalhe existente apresenta prioridade, problema, esperado, critérios, evidências, identidade/versão e resoluções do achado. Ausências legadas são explícitas. Checks diferenciam reprovação a investigar, erro técnico e estado não verificado; motivos de repetição ficam acessíveis sem carregar logs no resumo.
- `CorrectionHistory` consulta páginas de progresso, contestações e decisões somente por ação explícita, com paginação e seleção de tentativa/rodada/versão. Exibe progresso parcial/comprovado, as justificativas e evidências de ambas as partes, resposta na mesma versão ou posterior e decisões datadas. Justificativas adicionais do Implementador e comandos repetidos pelo Revisor usam as consultas existentes da entrega. A troca da seleção desmonta as consultas anteriores e descarta seus retornos tardios; detalhes novos não entram no polling de resumos.
- `AttemptBlockDecision` apresenta causa, evidências do primeiro bloqueio, consumo atual do limite e capacidades atuais, sem opção pré-selecionada. Orientação, troca de perfil por papel/revisão e encerramento usam V02, com If-Match, autorização e Idempotency-Key. A troca informa preparação sem início e exige encerramento explícito da anterior; encerramento não afirma parada física. A confirmação usa o rodapé existente e o seletor compartilhado mantém o padrão aprovado.
- Rascunhos e correlação permanecem apenas em memória da sessão, separados por conta/tentativa/bloqueio. Revisão vencida preserva o texto e exige revisão explícita da ação. Envio concorrente é bloqueado sincronamente; resposta perdida e reabertura consultam a mesma operação sem reenviar. Uma decisão posterior exige operação anterior confirmada, revisão mais recente e nova escolha explícita. Quando o primeiro bloqueio reaparece em outra entrega, o comando vincula a entrega atual, preservando a causa original e os limites.
- Validação final: **330/330 testes em 42 arquivos**, cobrindo todo o frontend e integrações de consultas/revisões (`.cache/sprint022-final-tests.json`). Build, lint e typecheck passaram; permanece o aviso já existente de bundle web acima de 500 kB. A suíte global não foi repetida nesta sprint, cujo código de produção é restrito ao frontend.
- Playwright MCP/Chrome executou `tests/browser/correction-cycle.playwright.js` sobre Vite atual na porta 4310, com APIs controladas: recorrência, parcial comprovado, desacordo, limite total, ação indisponível, rascunho após reabertura, revisão vencida, resposta perdida sem duplo envio, troca de perfil e encerramento. Achados, resoluções, motivos de repetição e ausência de prioridade legada foram conferidos renderizados. Desktop 1440x1000 e mobile 390x844, sem overflow horizontal; inspeção das capturas levou à correção do alinhamento dos rádios e à confirmação no rodapé. Evidências: `tests/browser/evidence/sprint022-result.json`, `sprint022-desktop.png`, `sprint022-mobile.png` e `sprint022-history-mobile.png`. Nenhum erro JavaScript na execução final; as respostas 412 e a falha de rede são intencionais do cenário.
- A primeira execução de navegador falhou por fixture incompleta de `DeliveryDetail.authorizations`, corrigida no roteiro sem alterar o produto. O carregamento do roteiro por filename também foi recusado pelas raízes permitidas do MCP; a execução final recebeu o código do arquivo, sem cópia do repositório. Limites: prova de UI controlada, sem nova prova de controlador real, Maestri/OMP, provider, publicação externa ou revisão por outro agente. Sem início de pipeline, staging, commit, push ou implementação da sprint seguinte.

## Sprint 023 - Intenção de destino na preparação e captura [IMPLEMENTADA LOCALMENTE]

Data: 2026-10-23. Execução direta no repositório canônico, conforme autorização do usuário para a próxima sprint. Escopo: feat-042/feat-043, E2-a, US-05 e RF-23/24/28 do plano V3. Sem operação de clone nesta sprint.

- `PublicationTargetIntent` e `PublicationTargetChoice` usam envelope fechado v1, repositório e seleção `existing_clone/path` ou `clone/destination`, com caminhos absolutos limitados a 32.768 caracteres. A gravação privada mantém `formatVersion=1` e acrescenta `choices.publication_target` no JSON de revisão, sem migração nem reescrita do legado. Preparação nova omitida é salva como null; omissão em atualização preserva e null explícito limpa.
- O serviço verifica a associação ao repositório do projeto e o formato local absoluto em seleção, reconsulta e início. Alteração ou limpeza entra na nova revisão; resumo e hash incluem intenção, hash determinístico da seleção, repositório e efeito local previsto. Obter e salvar preparação não cria checkout, clone, tentativa, entrega ou autorização de clone.
- `HttpStartAttempt` permanece inalterado. Início manual por URL em Commit local/Pull request é recusado sem intenção válida, com causa e recuperação. A fila não cria preparações recorrentes nem tenta iniciar esses casos. ICR não exige destino; origem local continua dependendo do clone cadastrado.
- O início copia a escolha em `capture_json.v3_delivery`, junto do hash e do ID da operação autorizado pelo controlador. O envelope da captura permanece v1. Capturas históricas sem o complemento continuam válidas e são projetadas com destino/hash nulos; GET da tentativa não observa checkout. Preparações sucessoras do fluxo de decisão humana preservam a intenção anterior.
- A preparação usa a seleção nativa de pasta. O operador escolhe clone existente ou pasta pai/nomeia o destino futuro, pode limpar a escolha e vê a intenção e o efeito no resumo autorizador. A tela e o detalhe da tentativa distinguem intenção capturada de clone confirmado; ICR informa que destino guardado não autoriza clonagem.
- Validação de código: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram. O build mantém o aviso do bundle web acima de 500 kB. Nenhuma suíte de testes, prova Playwright, Maestri/OMP, provider ou publicação externa foi executada nesta sprint. A seleção nativa e as barreiras de início têm prova de compilação, sem verificação funcional controlada nesta rodada.
- A identidade real do clone existente e a ocupação do destino são conferidas pela operação V01, quando houver tentativa e entrega reais; o campo salvo nesta sprint é apenas intenção. Sem alterar checkout, pastas do usuário, staging, commit, push, GitHub, fila externa ou avançar a sprint 024.

## Sprint 024 - Seleção e clonagem autorizada do destino [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-23. Execução direta pelo assistente principal, restrita a feat-044/feat-045, V01, US-05, E2-a e RF-23/24/28 do plano V3. Working tree anterior preservado no repositório canônico.

- V01 usa tentativa, entrega atual e repositório capturado reais, sessão/CSRF, If-Match e Idempotency-Key. Migration 040 cria `publication_target_selections` STRICT, com FKs, autorização específica, hash, identidades, revisão e estados. Intenção/autorização são duráveis antes de escrever no destino. O diário permanece separado de `publication_requests` e não concede commit, push ou PR.
- A origem derivada confere operação de início, recibo, revisão histórica da preparação, hash autorizado, captura, modo, repositório e seleção exata. Commit/PR com intenção capturada agenda seleção posteriormente, após existir entrega aprovada, sem segundo clique. ICR não concede essa autorização. A ação direta posterior registra origem própria, inclusive para legado sem intenção capturada.
- O workspace usa o GitContext autorizado existente. Clone existente exige raiz, identidade física e repositório remoto observados, sem alterar trabalho local. Clone novo exige destino ausente e pai canônico com identidade estável; reserva exclusiva da pasta, gravação da identidade e reconferência precedem `git clone`. Pasta ocupada ou substituída é preservada. A confirmação exige observação correspondente. A documentação do Git consultada via Context7 confirma que clone em diretório existente exige diretório vazio.
- Replay recupera a operação antes do CAS. Seleções pendentes são serializadas por tentativa e caminho. Após interrupção, `running` vira `unknown`; retomada observa a mesma pasta reservada e não repete clone. Uma interrupção sem identidade de reserva permanece incerta. GET de operação e a seção paginada `target_selections` consultam o diário; resumos mantêm apenas barreiras escalares. Reconciliação usa buscas específicas sem limite arbitrário de páginas históricas.
- O inventário e a finalização reconhecem a nova tabela. Seleção aceita, em execução ou incerta bloqueia exclusão, mudança de configuração e transição da área gerenciada. Caminhos de outras seleções são protegidos na conferência de exclusão; seleção/execução respeitam caminhos já em exclusão e a guarda vigente de transição. Fixtures históricas removem a migration nova apenas em bancos temporários. Ajustados testes anteriores à captura da sprint 023 e uma leitura de evento dentro de callback do seletor de perfil, identificada pelo check existente.
- Validação: a suíte integral passou em **1.851/1.851 testes, em 151 arquivos**, sem falhas ou pendências (`.cache/sprint024-final-full.json`). Após os últimos ajustes de busca, identidade remota e projeção de progresso, **95/95 testes em sete arquivos** passaram (`.cache/sprint024-final-directed.json`). Inclui V01 HTTP autenticado, autorização derivada sem segundo clique, rejeições antes da inspeção, replay, concorrência, resposta perdida, reinício, troca de diretório/pai, preservação de arquivos, consultas, publicação local e finalização da exclusão. A primeira suíte integral teve sete testes falhos e seis arquivos que não carregaram; seu relatório permanece em `.cache/sprint024-full.json`. O ciclo de imports responsável pelo carregamento foi removido.
- Typecheck, lint, build, diff check, `test:compiled` e `test:execution-compiled` passaram. O build conserva o aviso de bundle web acima de 500 kB. Smokes usam HTTP/SSE/SQLite locais e fixture Node para lançamento Windows. As provas de clonagem usam Git/GitHub controlados com filesystem real; **não houve clone GitHub real, Maestri/OMP, provider, nova prova de navegador ou revisão por outro agente**. Não houve staging, commit, push, início de pipeline ou avanço para a sprint 025.

## Sprint 025 - Integração local e identidade descritiva da entrega [CONCLUÍDA LOCALMENTE]

Data: 2026-10-24. Execução direta autorizada pelo usuário conforme feat-046/047/048, US-04.C2/C3/C5, US-07 e RF-19–21/RF-32–35 do plano `docs/Docs20261023_014848/sprints20261023_014848.json`. Versão aprovada segue isolada do checkout do operador; sem staging, commit ou push no repositório de trabalho.

- A entrega sela destino e identidade descritiva antes do efeito. O commit usa a árvore da versão aprovada no clone local cadastrado e a branch de entrega é criada condicionalmente, com identidade estável e sem sobrescrever refs preexistentes. Retomada reconcilia a operação e a ausência confirmada da branch permite uma nova ação explícita com compare-and-swap.
- A integração preserva o checkout do operador. Prova com Git real e clone temporário confirmou que `HEAD`, branch aberta, índice e conteúdo staged, unstaged e untracked permaneceram iguais, enquanto a branch de entrega recebeu a árvore aprovada. Push e PR usam a branch registrada; não houve efeito em remotos nesta validação.
- Validação final: suíte integral em **1.853/1.853 testes, sem falhas** (`.cache/sprint025-final-verified.json`). Typecheck, lint, build e `git diff --check` passaram. O build mantém o aviso de bundle web acima de 500 kB.
- Limites: prova Git local com clone temporário, sem clone ou push GitHub real, PR externo, provider, Maestri/OMP, nova prova de navegador ou revisão independente. Não houve staging, commit ou push no repositório do operador.

## Sprint 026 - Integração adaptada com nova avaliação [IMPLEMENTADA LOCALMENTE]

Data: 2026-10-24. Execução direta pelo assistente principal, restrita a feat-049/050, RF-29, US-06.C4 e RNF-09 do plano V3. Fontes: SPEC vigente, GLOSSARY e contrato de checkout único de INTEGRACAO-MAESTRI-OMP. Sem iniciar pipeline ou delegar implementação.

- Integração direta conserva a referência aprovada e não recruta novos papéis. Base local avançada, confirmada no mesmo repositório remoto e descendente da base anterior, abre adaptação no checkout da tentativa. Destino divergente, indisponível ou substituído permanece bloqueado. Quando já existe destino selado, a reconciliação precisa provar a ausência do commit antes de adaptar.
- Migration 043 acrescenta metadados mínimos e imutáveis à rodada existente, sem tabela de conteúdo: operação autorizadora única, versão/ref/árvore anteriores, nova base, identidade do destino e resultado/modo anteriores. O planejamento e a nova passagem são transacionais. A captura usa a nova base, inclusive nas correções seguintes, sem alterar referências, pareceres ou evidências anteriores. Históricos conservam o ICR concluído enquanto a nova versão está pendente.
- Implementador e Revisor continuam nas respectivas sessões, com parada física e conferência da versão anterior antes da importação de objetos. A orientação de adaptação limita mudanças ao escopo capturado e exige preservar a nova base e justificar alterações. Checks e revisão independente pertencem à nova versão, com os critérios visuais capturados. Aprovação anterior não autoriza commit, push ou PR do conteúdo adaptado. Limite total, inclusive zero, e bloqueios existentes permanecem válidos.
- O clone confirmado é reconferido e reutilizado sem outra clonagem. A versão adaptada tem destino selado próprio e branch descritiva por rodada; o modo autorizado na continuação permanece válido sem modificar o modo original. Replay não abre outra rodada; reinício interrompe a execução sem publicar nem relançar agentes. Falha de importação, checks ou revisão preserva a versão anterior e impede commit da versão pendente.
- Validação: **1.864/1.864 testes em 152 arquivos** na suíte integral (`.cache/sprint026-verified-full.json`). Após o ajuste final da projeção histórica, **84/84 testes em três arquivos** de adaptação/publicação/PR passaram (`.cache/sprint026-history-tests.json`). A primeira suíte integral registrou uma falha na preservação do diagnóstico de importação; a causa foi corrigida e os relatórios anteriores foram preservados. A prova nativa `tests/native/delivery-target.proof.ts` passou com Git real: detecção da base avançada, importação do objeto exato, recusa de identidade substituída e preservação de HEAD, índice e arquivos staged/unstaged/untracked durante a importação. A resolução da adaptação pelo agente foi testada com executor controlado.
- Typecheck, lint, build, diff check, `test:compiled` e `test:execution-compiled` passaram durante a implementação; o build conserva o aviso de bundle web acima de 500 kB. Sem nova prova real Maestri/OMP, provider, GitHub/PR externo, navegador ou revisão por outro agente. Nenhum staging, commit ou push no repositório do operador; nenhuma implementação da sprint seguinte.

## Sprint 027 - Continuação autorizada, push e PR reconciliáveis [IMPLEMENTADA LOCALMENTE; PROVA EXTERNA PENDENTE]

Data: 2026-10-24. Execução direta do assistente principal, restrita a feat-051/052, RF-18/22/25–31 e US-04/06 do plano V3. Fontes conferidas: SPEC vigente, GLOSSARY e INTEGRACAO-MAESTRI-OMP. Working tree das sprints anteriores preservado no repositório canônico.

- A continuação usa os caminhos existentes de authorize-upgrade, complete e reconcile. O resumo agora exige os efeitos confirmados ou não aplicáveis do modo atual antes de oferecer modo superior. Corrigido o caso em que ICR concluído, seguido de autorização para Commit local e falha conhecida do commit, ainda oferecia PR. A recuperação usa complete no modo já autorizado; não exige outra autorização de upgrade nem altera o modo capturado.
- O hash da ação inclui a revisão das configurações globais, as seleções de destino e os metadados do destino selado da versão, além das identidades de versão, revisão, configuração e efeitos já incluídas. Nenhum conteúdo de checkout, índice ou cache é acrescentado à persistência. Reconferência física do destino e da versão retida continua nos caminhos existentes antes dos efeitos.
- Antes da criação do PR, a leitura completa do GitHub confere também o SHA atual da base contra o parentSha aprovado quando presente. Base alterada bloqueia a criação. A reconciliação de um PR já criado continua conferindo a identidade completa do PR e a branch aprovada sem exigir que a base permaneça parada depois da publicação. A validação usa transporte GraphQL controlado; não constitui prova GitHub real.
- Novos testes fecham/reabrem SQLite após perda da resposta de commit, push e PR, confirmam ausência de despacho automático, reconciliam o efeito pela identidade e completam somente os restantes. Conferem contagem dos efeitos, versão, modo capturado e integridade referencial. O teste de regressão da continuação falhou antes da correção, oferecendo PR com commit pendente, e passou depois. Os testes existentes de recibos, autoridade, HTTP/CSRF/CAS, adaptação, preservação de histórico e retenção permanecem na suíte integral.
- Validação final: **1.869/1.869 testes em 152 arquivos**, sem falhas (`.cache/sprint027-full.json`). Recorte anterior de publicação/PR: 51 testes em dois arquivos. Typecheck, lint, build, diff check, test:compiled e test:execution-compiled passaram. Smokes usam HTTP/SSE/SQLite locais e fixture Node para o lançamento Windows.
- Limites: nenhuma nova prova Git nativa, Maestri/OMP, provider, navegador ou revisão independente. A prova externa autorizada de push/PR e reconciliação prevista nesta sprint permanece pendente por ausência de alvo e autorização específicos nesta conversa; não há aceite integrado final. Nenhum staging, commit ou push no repositório do operador, alteração de recursos GitHub, início de pipeline ou avanço para a sprint 028.

## Sprint 028 - Contrato e projeção do resumo consolidado [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-24. Implementação direta de feat-086, US-17.C1–C4, RF-74/75 e RNF-12 do plano V3. Somente contrato e leitura no backend, preservando o working tree anterior. Fontes: catálogo DeliverySummaryView e endpoints E07/E12 da SPEC vigente, GLOSSARY e contrato de referências imutáveis de INTEGRACAO-MAESTRI-OMP.

- Contrato efetivo: `packages/contracts/src/delivery-summary.ts`, exportado pelo index público, define `DeliverySummaryView` fechado em snake_case conforme o catálogo da SPEC. `packages/contracts/src/queries.ts` acrescenta `deliverySummary` aos detalhes internos. `packages/contracts/src/http-execution/queries.ts` expõe `delivery_summary` em HttpAttemptDetail, anulável antes da criação da entrega, e obrigatório em HttpDeliveryDetail. A projeção HTTP explícita fica em `apps/controller/src/http/execution-views.ts`, funções toHttpAttemptDetail e toHttpDeliveryDetail. Estes são os caminhos de consumo da sprint 029; nenhuma UI nova foi implementada.
- Projeção efetiva: `apps/controller/src/modules/storage/delivery-summary.ts`, função readDeliverySummary, chamada por readAttemptDetail/readDeliveryDetail em `apps/controller/src/modules/storage/queries.ts`. Usa consultas escalares de critérios, revisão independente e sua identidade, verificação da versão, checks, resoluções, recursos e recibos pertinentes. Não lê arquivos do checkout, logs, patches ou bytes de artefatos; não acrescenta tabelas, snapshots, migrações ou autoridade. Detalhes extensos continuam nos endpoints e seções sob demanda existentes.
- O resumo diferencia pending, blocked, icr_approved, partial, complete e unavailable. Aprovação textual do Implementador não concede aprovação independente. Referência aprovada exige revisão e verificação compatíveis; commit, branch, destino local e URL de PR dependem dos respectivos fatos confirmados. `checkout_updated` permanece false. Destino ausente em recibo legado não é inventado; limitações distinguem falta de comprovação, checks não configurados, efeitos incertos, observações não bloqueantes e adaptação posterior pendente.
- Seleção respeita tentativa, rodada e versão. Histórico ICR anterior à adaptação conserva modo, referência e resultado próprios, sem receber recibos ou resoluções da versão posterior. Uma rodada planejada ainda sem entrega retorna resumo nulo. Continuação atualiza o resumo da mesma versão sem alterar o modo original. Publicação parcial ou status final incerto não aparece como entrega completa; falha de projeção antiga substituída por status posterior confirmado permanece no histórico, sem tornar a entrega atual permanentemente parcial.
- Testes novos: `tests/integration/delivery-summary.test.ts`, com 11 casos incluindo os três modos, falta de revisão, perda de resposta, status final incerto, continuação, adaptação, seleção histórica, resoluções por versão, recibo legado sem destino e GET autenticado repetido sem novos eventos ou efeitos. Contratos E07/E12 são validados contra os schemas públicos; resumos HTTP controlados permanecem abaixo de 4 KiB. A fixture web existente foi atualizada para o campo obrigatório, sem mudança visual.
- Validação: **1.880/1.880 testes em 153 arquivos**, sem falhas (`.cache/sprint028-final-full.json`), e recorte final de resumo/adaptação aprovado (`.cache/sprint028-summary-final.json`). O primeiro relatório integral contém uma falha no novo teste de status final, cuja fixture comparava o ID em minúsculas em vez do ID real DELIVERED; a fixture foi corrigida e o relatório anterior permanece em `.cache/sprint028-full.json`. Typecheck, lint, build, diff check, test:compiled e test:execution-compiled passaram. O build conserva o aviso de bundle acima de 500 kB.
- Limites: testes de backend/HTTP/SQLite com adaptadores de Git/GitHub e executor controlados; smokes compilados usam fixture Node para lançamento Windows. Sem nova prova real GitHub, Maestri/OMP, provider, Git nativo, navegador ou revisão independente. A pendência de prova externa da sprint 027 continua registrada. Nenhum staging, commit, push, recurso externo, pipeline ou implementação da sprint 029.

## Sprint 029 - Destino, modos e resumo consolidado da entrega [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-24. Execução direta de feat-053/054/055, US-04–07/17 e RF-74/75 do plano V3. Consumida a projeção da sprint 028 sem acrescentar publicação ou autoridade no backend. Mantidos layout, tokens, seletores e rodapés dos diálogos existentes.

- `apps/web/src/app/delivery-modes.ts` centraliza ICR, ICR + commit e ICR + commit + PR com descrições curtas. Preparação e configuração usam os mesmos rótulos. Preparação distingue clone existente de clonagem futura, incluindo destino opcional no ICR para continuação posterior; salvar continua apenas persistindo a intenção, sem emitir V01 ou clonar. O resumo de início mantém destino e efeitos previstos. Erros preservam o rascunho e a revisão salva separadamente.
- A interface mantém em localStorage somente a referência da preparação persistida, por instalação, conta, projeto, tentativa anterior e issue inicial. Após recarga, consulta novamente o controlador e confere o contexto antes de instalar os dados. A referência é removida ao confirmar aceitação do início. Não são persistidos rascunhos, configurações, conteúdo ou autoridade nesse registro adicional. A restauração por ID não inicia tentativa nem executa seleção/clonagem.
- `DeliverySummary.tsx` consome exclusivamente delivery_summary: resultado, modo original/autorizado, critérios, checks, revisão, resoluções, referência fixa e recibos confirmados, com pendências e limitações explícitas. Commit aparece com branch própria e sem implicar atualização do checkout do operador. Referência pode ser copiada; Ver PR depende da URL confirmada. Removidos o resultado inferido do protocolo de publicação e os recibos duplicados nessa área; o histórico de efeitos continua na seção existente sob demanda.
- `PublicationDialog.tsx` oferece ações atuais em Continuar entrega, sem checkbox ou segunda confirmação. O clique envia o hash e CAS vigentes; uma trava síncrona impede duplicatas. HTTP 202 mostra aceitação, não entrega concluída. Operações incertas preservam ID, tentativa e versão no registro existente de operações; reabrir consulta a operação original e não repete o comando. Erro conhecido bloqueia novo envio até atualização; ações também ficam bloqueadas durante consulta ou dados desatualizados. `useDelivery.ts` preserva o último resultado da mesma versão em falha de refresh, descarta-o na troca de seleção e distingue a geração da consulta imediatamente.
- `PublicationTargetFacts.tsx` separa intenção capturada, clone confirmado nos registros consultados e destino selado derivado dos metadados da publicação. Consulta de seleções ocorre sob demanda com paginação e atualização explícita. Ausência de registro, pendência e erro não viram confirmação inventada.
- Validação final: **1.885/1.885 testes em 154 arquivos** (`.cache/sprint029-final-full.json`). Cinco testes novos de interface verificam clique único, duplicata síncrona, aceitação, resposta perdida/reabertura sem reenvio, versão diferente, resumo autoritativo e falha de refresh preservando a mesma seleção. Fixtures anteriores foram alinhadas ao contrato consolidado e à remoção dos recibos redundantes. Typecheck, lint, build, diff check, test:compiled e test:execution-compiled passaram; permanece o aviso de bundle acima de 500 kB.
- Prova renderizada: `tests/browser/delivery-flow.playwright.js`, executado pelo Playwright MCP com Chrome 155 e os assets finais compilados. `tests/browser/evidence/sprint029/result.json` registra os 14 PNGs, asset carregado, chamadas controladas, ausência de erros de página e geometria de acessibilidade. Cobertura: salvar/reler/limpar destino, clone existente/futuro, recarga, erro de campo, ICR, commit, PR, continuação, intenção/clone/destino selado, adaptação pendente, legado, refresh falho e resposta perdida/reabertura sem duplicação. Em 390×640 e 1100×480, ações de continuação ficaram acima do rodapé e o rodapé permaneceu visível; não houve overflow horizontal observado. A fixture foi corrigida durante o ensaio para incluir timestamps reais do contrato e o endpoint de seleção correto; essas falhas não foram tratadas como sucesso.
- Limites: prova visual com HTTP e seleção de pasta controlados, sem janela nativa real, reinício real do controlador, publicação GitHub/PR, Maestri/OMP, provider ou revisão por outro agente. A recarga comprova a releitura da preparação pelo ID preservado, não um novo ensaio integrado. A prova externa da sprint 027 continua pendente. Servidor estático próprio usado somente para os assets da prova, sem iniciar o controlador operacional. Nenhum staging, commit, push, pipeline ou implementação da sprint 030.

## Sprint 030 - Baseline e meta verificável da exclusão [MEDIÇÕES E META REGISTRADAS; CORREÇÃO GERENCIADA PENDENTE]

Data: 2026-10-24. Escopo: feat-056/057, US-16.C5, RF-73 e RNF-01. Retomada dos artefatos existentes, sem repetir remoções nem iniciar a sprint 031. Relatório consolidado: `tests/native/deletion-baseline.md`; dados e meta: `.cache/deletion-baseline/evidence/run-sYmpeZ/{baseline,target}.json`.

- Cenários nativos Windows legado e gerenciado com 8 tentativas, 24 rodadas, 40 passagens e 512 MiB de caches cada. Medições distinguem inventário/SQL, conferências, remoção, finalização, aceitação HTTP e resposta DOM/rAF da UI compilada. Uma execução por organização, carga do host não controlada, sem alegação estatística. A duração negativa de rede da UI gerenciada foi descartada da análise; evidência original preservada.
- Legado concluiu: 64 destinos ausentes, 10 sentinelas preservadas, SQL vizinho inalterado, inventário exclusivo vazio, foreign keys limpas e um recibo mínimo. Total servidor de 537.771,26 ms, incluindo aceitação; conferências nativas consumiram 501.993,28 ms.
- Gerenciado removeu 25 destinos e preservou as 10 sentinelas e o SQL vizinho, mas falhou na finalização com CONFIGURATION_STORAGE_FAILED. Operação pendente, inventário restante e nenhum recibo. Os 144.336,55 ms após aceitação medem parada pendente, não conclusão. A falha conhecida foi reproduzida por teste esperado como falha; sua correção e confirmação da causa pertencem à sprint 031.
- Meta gravada antes da otimização por `scripts/deletion-baseline-target.mjs`, sem sobrescrita: conferências nativas até 461.928,85 ms no legado e 145.673,26 ms no gerenciado, derivadas do menor custo por chamada observado multiplicado pela quantidade atual. Total legado até 497.706,83 ms; total gerenciado exige correção e baseline concluído antes da otimização. Feedback rAF até 29,10/26,50 ms, admitindo um frame observado adicional. Procedimento equivalente e oráculos independentes registrados no relatório e target.json. Apenas medir não conclui RF-73/RNF-01.
- Nesta retomada, o gerador foi tornado importável para testes sem subprocessos, preservando a CLI. Validação: três testes do gerador passaram e um teste reproduziu a falha esperada da finalização gerenciada; typecheck e lint passaram. A primeira rodada dos três testes falhou por uso de subprocessos proibidos pela suíte, corrigido sem relaxar a política global. Não houve nova prova nativa/browser, build, suíte global, revisão independente, staging, commit, push ou pipeline. Os ensaios anteriores são a fonte das medições, não foram repetidos nesta consolidação.

## Sprint 031 - Otimização efetiva e exclusão recuperável [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-24. Execução direta autorizada de feat-058/059, US-16.C3–C5 e RF-71–73. Fontes: SPEC.md, plano V3 e baseline/meta da sprint 030. Relatório detalhado e procedimento: `tests/native/deletion-baseline.md`, seção Sprint 031. Preservados o checkout canônico, o trabalho anterior e os mecanismos de aprovação do pipeline.

- A migration aditiva 044 corrige a autoridade dos triggers de exclusão de `project_storage_locations` e `project_storage_transitions`: passam o JSON vivo de operação, projeto, geração, token e estado à capacidade transacional existente, em vez de passar somente o ID. Migrations anteriores, UPDATE/identidade, chaves congeladas, ordem de finalização, barreiras, reconciliação e recibo mínimo foram preservados. Gate do inventário e fixtures de migração passam a schema 44. O teste que antes esperava falha agora exige sucesso, recibo e inventário vazio; cobre transição verificada, token/geração incorretos, DELETE direto recusado e terminais compartilhados preservados. Upgrade 43→44 não reescreve dados nem o ledger anterior.
- Antes de otimizar, o baseline gerenciado corrigido concluiu com todos os oráculos: total de 149.759,84 ms incluindo aceitação. Evidência: `.cache/deletion-baseline/evidence/run-bf6NTX/baseline.json`. A meta total faltante foi gravada às 16:33:14 UTC, antes da otimização, em `target.json`: até 134.493,88 ms; conferências até 136.051,08 ms. Metas anteriores do legado foram mantidas. A falha pendente da sprint 030 permanece registrada historicamente e não é usada como baseline de conclusão.
- `windows-reference.ts` e o helper C# observam até 100 caminhos por processo, amortizando startup/Add-Type. Cada observação abre handles novos. Todas as conferências e a remoção segura por referência permanecem. O limite de resposta de 1 MiB foi mantido; apenas `RESPONSE_TOO_LARGE` subdivide uma leitura em lotes menores e novos. Erros de acesso, identidade e protocolo continuam bloqueando; quantidade e ordem são validadas. Não há cache de identidades, processo persistente adicional ou armazenamento permanente de medições de produto.
- Comparação final no código após a correção de volume: `.cache/deletion-baseline/evidence/run-jtSdjS/{baseline,comparison,source-manifest}.json`, com capturas preservadas no mesmo diretório. Legado: conferências de 501.993,28 para 140.522,06 ms, total de 537.771,26 para **178.484,47 ms**, abaixo da meta de 497.706,83 ms. Gerenciado: conferências de 151.317,03 para 54.222,82 ms, total de 149.759,84 para **56.101,43 ms**, abaixo da meta de 134.493,88 ms. Feedback rAF final de 11,80/1,60 ms, abaixo dos orçamentos; aceitação DOM de 1.508,30/1.158,10 ms, relatada separadamente. A comparação intermediária de `run-3Pimgb` foi preservada e não substitui a final.
- Mesmas 8 tentativas, 24 rodadas, 40 passagens, 512 MiB de cache denso e 2.149/2.086 arquivos por organização; 64/25 destinos ausentes, dez sentinelas intactas por cenário, SQL vizinho inalterado, inventário exclusivo vazio, foreign keys limpas e um recibo mínimo. Chamadas lógicas de observação continuam em 270/114. O volume total da fixture, que inclui SQLite e arquivos operacionais, variou em 4.144/12.360 bytes; bytes de cache e contagem de arquivos foram conferidos separadamente. Host, adaptador, Node, SQLite e configuração comparados; carga do host não controlada, sem limpeza de caches, SLA ou significância estatística. Build, testes e smokes também rodaram na sessão. Os ganhos relatados são os destes ensaios, não promessa geral de latência.
- Validação final: **1.893/1.893 testes em 157 arquivos** (`.cache/sprint031-final-full.json`) e **26/26 provas nativas Windows** (`.cache/sprint031-native-complete.json`), sem falhas ou pendências. As provas nativas cobrem links/junctions sem seguir destinos, identidade e ancestrais, substituição, bloqueio de arquivos, acesso negado real, lote com resto e resposta acima de 1 MiB. A prova de rollback/reabertura real do storage SQLite recupera a mesma autorização e conclui sem repetir a remoção já confirmada, preservando outro projeto e terminais compartilhados. Os testes do worker mantêm fencing por geração, recuperação, falha parcial e barreiras, incluindo ampliação do inventário antes de qualquer efeito. Build, typecheck, lint, diff check, test:compiled e test:execution-compiled passaram. Permanece o aviso de bundle web acima de 500 kB.
- Revisão independente focada pelo `code-reviewer` identificou o risco do limite de resposta e confirmou a correção sem novos achados nessa mudança; registro em `.cache/sprint031-review.json`. A primeira chamada expirou sem parecer. Revisão estática, sem reexecução independente dos ensaios ou aprovação global do produto. Houve falhas intermediárias de fixture SQL/ACL, corrigidas e preservadas nos relatórios; uma suposta alteração de revisão foi barrada pelos triggers já existentes e a checagem redundante proposta foi retirada. Não foi necessário alterar o worker de produção.
- Limites: UI compilada, HTTP/SQLite e adaptador Windows reais sobre fixtures sintéticas, sem redesenho ou nova prova mobile. O console registrou 404 de operações de fixtures anteriores e conexões recusadas após os servidores de ensaio encerrarem, sem alegação de console limpo. Sem nova integração Maestri/OMP, provider, GitHub ou publicação externa. RF-73/RNF-01 receberam otimização e comparação local frente às metas, sem aceite global do V3 ou avanço de gate. Nenhum staging, commit, push, pipeline ou implementação da sprint 032.

## Sprint 032 - Confirmação compacta e acompanhamento da exclusão [IMPLEMENTADA; VALIDAÇÃO LOCAL]

Data: 2026-10-24. Escopo: feat-060/061, US-16.C1/C2 e RF-69/70 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`; contrato em `SPEC.md` §§2.3, 3.2 e 4.2/4.3. Esta entrega não implementa a retirada geral de compatibilidades registrada para um pacote futuro em FEEDBACK-PROXIMO-PACOTE-V4.md.

- A confirmação separa a raiz gerenciada e a pasta original dos demais destinos autorizados. Os outros caminhos e estados ficam sob uma lista recolhida, com contagem total; a ação primária e as ações de retorno permanecem no rodapé. Em larguras até 340 px, as ações secundárias usam rótulos curtos visuais e preservam nomes acessíveis completos.
- O diálogo conserva os destinos conferidos durante envio incerto e usa o mesmo identificador ao reabrir uma operação. Os estados aceita, em andamento, pendente, reconferência necessária e concluída permanecem distintos; causas e próximas ações duplicadas são consolidadas. Registros abre o status e o inventário da mesma operação enquanto ela ainda está ativa.
- Após sucesso, o contrato atual expõe somente o recibo mínimo e não mantém os destinos detalhados. Por isso, a lista em Registros existe durante o acompanhamento da operação; o inventário não é preservado após a finalização.
- Validação final: **38/38 testes em 8 arquivos**, typecheck pelo `npm run build`, lint e build passaram. O bundle web continua acima do aviso configurado de 500 kB. A suíte completa não foi repetida nesta sprint.
- Prova visual controlada com componentes React compilados, CSS de produção e 82 destinos sintéticos, sem API, banco de produto ou envio de exclusão. Playwright MCP verificou 390×640, 390×480, 260×480 e 260×320; o rodapé permaneceu visível, os detalhes começaram recolhidos, o foco inicial ficou no título e não houve rolagem horizontal. O viewport 260×320 representa a largura/altura CSS equivalente a 150% sobre 390×480; o runtime Playwright não permitiu alterar o zoom nativo do navegador. Capturas: `.playwright-mcp/page-2026-10-24T18-01-27-352Z.png` e `.playwright-mcp/page-2026-10-24T18-01-58-218Z.png`.
- Limites: prova de layout com SSR/HTML controlado, sem percurso da aplicação pelo HTTP real. Nenhuma exclusão foi enviada e o banco local do produto não foi acessado ou alterado. A evidência não equivale a prova nativa de zoom nem a aceite global da integração. Sem staging, commit, push ou pipeline.

## Sprint 033 V3 - Busca global paginada de tentativas [IMPLEMENTADA; VALIDAÇÃO LOCAL]

Data: 2026-10-24. Escopo implementado: feat-062/063/064, US-21, RF-84/85 e RNF-02 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`.

- A migration 045 adiciona `issue_number` e `issue_title` imutáveis. O backfill usa `readCapturedConfiguration` em lotes; capturas inválidas mantêm ambos os campos nulos. Novas tentativas gravam os cabeçalhos validados da captura. A listagem lê os cabeçalhos, sem extrair a captura completa. O gate do inventário de exclusão e os fixtures relacionais aceitam schema 45 e preservam exercícios de upgrade 43/44.
- O endpoint aplica número exato, substring literal normalizada em NFC e comparação sem distinção de caixa, projeto, resultado e período antes de paginar. A busca por título percorre resumos em lotes de 100. O cursor vincula conta, filtros normalizados, fuso, fronteiras, limite, ordem, teto de inserção e desempate por início/ID.
- Datas usam início civil no fuso IANA solicitado e o dia seguinte do limite final como fronteira exclusiva. Datas impossíveis, fuso inválido ou intervalo invertido são recusados com orientação.
- O histórico oferece campos separados para número, título e período, mostra o fuso local, preserva critérios na URL e reinicia o recorte em Atualizar. Ausência histórica de cabeçalho é mostrada explicitamente.
- Validação final: **1.908/1.908 testes em 160 arquivos**, além de **17/17 testes direcionados** para busca, migração, contrato HTTP e navegação do hash. A cobertura inclui título fora da página inicial, percent/underscore literais, texto de injeção, Unicode/NFC, acentos distintos, múltiplos filtros em AND, cursor e teto de inserção, datas impossíveis/invertidas, fuso inválido, fronteiras DST de 23/25 horas, backfill em dois lotes e cabeçalho imutável.
- `npm.cmd run typecheck`, lint, `git diff --check` e build passaram. Para destravar o typecheck geral, o mock de botão em `apps/web/src/features/projects/project-deletion-dialog.test.ts` passou a declarar `aria-label`; a suíte direcionada do diálogo passou 8/8. O build mantém o aviso do bundle web acima de 500 kB.
- Prova Playwright MCP controlada com APIs simuladas e build de produção: submeteu os quatro filtros, confirmou sua persistência na URL e os parâmetros HTTP snake_case, restaurou os campos após reload, recusou intervalo invertido e limpou a busca. Não houve erros JS; em viewport CSS de 390 px, `scrollWidth` ficou igual à largura do viewport. Captura: `.playwright-mcp/sprint033-search-390.png`.
- Medição SQLite em memória com 10.000 tentativas sintéticas, dois escopos de conta/projeto e captura de 4.110 bytes por linha. Medianas após aquecimento: primeira página 0,922 ms; seguinte 0,881 ms; busca vazia por título 16,626 ms; número exato 0,854 ms; filtros combinados 1,734 ms; título Unicode/literal 4,850 ms. `EXPLAIN QUERY PLAN` usou `attempts_account_created` para páginas e títulos, `attempts_account_issue_number_created` para número exato e `attempts_project_created` para filtros por projeto/data. Nenhuma consulta selecionou `capture_json` ou usou `LIKE`. Evidência: `.cache/sprint033/attempt-search-measurement.json`; os números são desta fixture local e não prometem latência geral.
- Limites: a prova visual usou API simulada; as provas HTTP/SQLite e medições foram locais e sintéticas, sem provider ou banco de usuário. A medição não representa um SLA nem substitui carga real de produção.

## Sprint 034 V3 - Comparação histórica da mesma issue [IMPLEMENTADA; VALIDAÇÃO LOCAL]

Data: 2026-10-24. Escopo: sprint-034, feat-065/066, US-22 e RF-86/87 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Fontes: V03 e contratos AttemptComparison da SPEC vigente, GLOSSARY e referências imutáveis por tentativa de INTEGRACAO-MAESTRI-OMP.

- V03 implementado como `GET /api/v1/attempt-comparisons`, com query e resposta TypeBox fechadas, tradução explícita snake_case e projeção HTTP sob demanda. A consulta seleciona ambas as tentativas na conta ativa; IDs ausentes ou inacessíveis recebem a mesma resposta 404. Pares de projetos, repositórios ou issues diferentes recebem 409; comparar uma tentativa consigo mesma recebe 400.
- Cada lado usa somente sua captura e suas referências seladas. Captura, preparação e revisão do projeto são verificadas contra as identidades persistidas antes de comparar campos. Resultado, motivo da falha, rodada, ID da entrega, identidade de conteúdo e revisões mantêm as identidades próprias de cada tentativa. Mudanças na configuração atual não alteram a resposta.
- Diferenças cobrem revisão do projeto e da preparação, branch, perfis, checks, limites, modo de entrega, tempos, política de artefatos e orientações capturadas. Comandos e caminhos de destino não são devolvidos: checks são resumidos por hash e o destino mostra somente repositório, tipo de seleção e hash autorizado. Textos de perfil, orientação e motivo de revisão passam por redação de credenciais. Campos históricos ausentes ou não comparáveis retornam `unavailable`/`not_comparable` com motivo; não são preenchidos pela configuração atual.
- A rota é somente leitura e não chama pipeline, provider, GitHub ou filesystem. O teste de integração confirma a comparação após editar perfis/configuração, repetição idêntica, ausência de eventos/operações novos, par inelegível, ID inacessível, par duplicado e redação de credenciais.
- Validação final: **1.911/1.911 testes em 161 arquivos**, typecheck, lint, build e `git diff --check` aprovados. O build mantém o aviso existente de bundle web acima de 500 kB.
- Limites: UI de seleção e comparação sob demanda pertence à sprint-035, sem iniciar nesta entrega. Sem prova real de provider, GitHub, Maestri/OMP ou navegador; nenhuma operação externa foi executada.

### Sprint 035 - Busca e comparação no histórico da interface

Data: 2026-10-24. Implementação direta de feat-067/068, US-21.C1-C3, US-22.C1-C3 e RF-84-87 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores do working tree preservadas.

- A busca mantém campos independentes de número, título, projeto, resultado e datas, com fuso IANA explícito. Buscar, limpar busca e atualizar reiniciam a paginação. O intervalo invertido preserva o rascunho e associa a orientação aos dois campos de data. Filtros e trilha de cursores ficam no hash, sem capturas ou instruções, conservando o recorte na navegação e ao abrir o detalhe. A abertura global do detalhe não passa a filtrar pelo projeto da linha.
- Seleção em páginas diferentes permite comparar duas tentativas da mesma issue e projeto. A interface explica que conta e repositório também são conferidos pelo servidor. O endpoint V03 é consultado somente ao abrir o diálogo; recusa de elegibilidade e falha de leitura têm orientação e nova consulta explícita. Respostas de consultas encerradas são descartadas, tanto na busca quanto na comparação. Falha de atualização identifica os dados anteriores.
- A comparação usa exclusivamente a projeção histórica da sprint 034 e mantém os IDs de cada tentativa, rodada, entrega, revisão e conteúdo. Ausência é explícita. Campos aparecem em pares alinhados em tela larga e empilhados com identificação dos lados em tela estreita. O diálogo mantém a ação de fechar visível, suporta Escape, contém o foco nativamente e o devolve ao acionador. O texto não atribui causalidade às diferenças.
- Prova reproduzível: `node tests/browser/attempt-history.mjs`, UI compilada no Chrome headless em 1440 x 1000 e 390 x 640, com HTTP simulado. Cobriu tentativa 26 fora da página inicial, busca global, seleção entre páginas, consulta sob demanda, captura histórica, indisponibilidade, vazio, erro, resposta tardia, ausência de overflow, rodapé e devolução de foco. Capturas e resultado: `.playwright-mcp/sprint035/{wide.png,narrow.png,read-error.png,result.json}`. As imagens foram inspecionadas. Playwright MCP não estava disponível nesta sessão; foi usada a biblioteca Playwright local com Chrome.
- Limites: prova visual controlada, sem consulta a providers, GitHub ou Maestri/OMP reais. Imutabilidade após edição da configuração atual e elegibilidade entre contas/repositórios permanecem cobertas pelos testes reais de storage/HTTP da sprint 034. Nenhum commit, push ou avanço para a sprint 036.
- Validação final: **1.919/1.919 testes em 162 arquivos** na suíte completa; **29/29 testes direcionados** de busca/comparação, navegação e baseline de observação. Typecheck, lint, build e `git diff --check` passaram. A primeira execução integral identificou a perda do contexto de projeto ao abrir detalhes; a correção preserva o projeto já filtrado, mantendo também a busca global, e a suíte integral foi repetida com sucesso. O build mantém o aviso preexistente do bundle web acima de 500 kB.

### Sprint 036 - Etapas, espera e atividade observada

Data: 2026-10-24. Implementação direta de feat-069/070, US-18, RF-76/77 e RNF-10 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores preservadas.

- A migration 046 cria `attempt_stage_intervals`, com identidade UUID, evento de origem único, vínculo com tentativa/rodada/versão, ordem temporal, intervalo aberto único e proteção dos registros fechados. O evento e o intervalo são gravados na mesma transação por trigger, incluindo os eventos dos fluxos de decisão e publicação. Eventos de outra rodada e timestamps anteriores à fronteira conhecida não reescrevem a etapa corrente. Não há backfill de duração histórica.
- A última atividade avança somente para tipos explícitos de observação confirmada: passagem pronta, resultado aceito, check concluído, captura concluída, pergunta formal, recibo de resposta e publicação concluída. Consulta, heartbeat genérico, observação de autoridade, limpeza e silêncio não produzem atividade. `passage_measurements` continua sendo a fonte dos contadores de passagem, sem duplicação por soma dos intervalos de etapa.
- `StageActivity` apresenta etapa, início/tempo decorrido, última atividade, horário da consulta, disponibilidade e tracking. Prazos vêm do limite ativo capturado ou do TTL configurado da pergunta; ausência fica nula e prazo atingido tem restante zero. Espera por decisão e perda de acompanhamento são distintas. A projeção não afirma parada física, percentual ou previsão de conclusão. O estado terminal usa o instante de fechamento, sem um contador que continue avançando após o encerramento.
- As consultas protegidas E01 (`GET /api/v1/operation`), detalhe de tentativa e medições expõem `stage_activity`; detalhes de entrega a incluem nas medições. O resumo de operação consulta somente a tentativa ativa e campos escalares dos intervalos. Não lê checkout, artefatos ou capturas extensas para produzir a atividade. Leituras não criam eventos ou atualizações. A implementação visual de tempo permanece na sprint seguinte.
- O inventário e a ordem de finalização de exclusão reconhecem a tabela nova. Testes de exclusão exercitam intervalos preenchidos para dois projetos, remoção somente do projeto autorizado, preservação do outro e guardas de imutabilidade. Fixtures de upgrade removem o schema 46 apenas em bancos descartáveis; os testes de migração de busca continuam apontando explicitamente para a migration 045. Verificações de payload estável normalizam o horário de observação da consulta, preservando a conferência dos demais dados e dos bytes persistidos.
- Provas específicas: `tests/integration/stage-activity.test.ts`, com SQLite real e Fastify HTTP injetado, executor/GitHub/workspace controlados. Dez testes cobrem transições, vínculos, intervalo aberto, replay, atividade inválida, polling/silêncio, espera/perda, consultas sem mutação, legado insuficiente, reinício, TTL ausente/zero/1000 e serialização autenticada. Nenhum provider, terminal Maestri ou recurso externo real foi acionado; o banco pessoal da instalação não foi aberto nem migrado. Sem commit, push ou início da sprint 037.
- Validação final: **1.929/1.929 testes em 163 arquivos**, typecheck, lint, build e `git diff --check` passaram. Os testes de payload com caches de 0/16/64 MiB também passaram. O build mantém o aviso existente de bundle web acima de 500 kB. Não houve mudança visual de produto nesta sprint; não foi declarada nova prova de navegador ou integração nativa Maestri/OMP.

### Sprint 037 - Acompanhamento visual e conexão coerente

Data: 2026-10-24. Implementação direta de feat-071/072, US-18/23, RF-76/77/88 e RNF-14 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Working tree anterior preservado.

- `AttemptStageSummary` mostra a etapa da tentativa, tempo decorrido e última atividade confirmada no dashboard e no detalhe. O dashboard só combina o resumo de atividade e a tentativa ativa quando os IDs coincidem. Prazo restante aparece somente quando a projeção histórica/operacional fornece prazo; ausências continuam indisponíveis. Espera por decisão e acompanhamento perdido têm textos próprios. O relógio local atualiza apenas a apresentação, não a última atividade, não persiste dados, não produz percentual/previsão e não usa região live por tick. Dados anteriores são identificados e o relógio não avança durante sua indisponibilidade.
- As consultas de operação, tentativa ativa, histórico, detalhe, entrega, comparação, projetos, painel principal, fila e registros participam de um registro transitório de observações montadas. Cada leitura confirma seu estado após o commit da renderização React. Falha em consulta pertinente mantém o indicador indisponível; nova leitura pendente conserva estado intermediário. O registro não armazena conteúdo ou segredos e descarta entradas ao desmontar/desabilitar a superfície.
- A abertura/reabertura do SSE invalida as observações montadas e pede consultas novas de leitura. SSE aberto sozinho não declara recuperação aplicada. O indicador só fica saudável com stream aberto e leituras pertinentes aplicadas sem falha. Erro de stream, inclusive durante retry automático do EventSource, é indisponibilidade; cursor inválido também é recusado. `/health` não recupera o indicador nem comprova Maestri/OMP. Nenhuma mutação é reenviada na reconexão.
- A prova da aplicação compilada identificou que `.pill` sobrepunha as cores dos estados. A especificidade foi corrigida para o indicador inteiro, preservando texto e ponto: saudável verde `rgb(35,75,53)`, reconexão âmbar `rgb(117,68,0)` e falha com ponto vermelho `rgb(180,35,24)`. Isso foi conferido pela classe aplicada, estilo calculado, conteúdo e capturas da aplicação servida, não apenas pela declaração CSS.
- Prova reproduzível: `node tests/browser/stage-connection.mjs`. Chrome headless, HTTP controlado e SSE nativo mantido pelo servidor local, em 1440 x 1000 e 390 x 640. Cobriu estado saudável, falha de leitura preservando dados anteriores, health isolado sem recuperação, leitura pendente, recuperação aplicada, queda e retorno do SSE, espera com prazo no detalhe e acompanhamento perdido no mobile sem overflow. Também confirmou última atividade inalterada, ausência de anúncios por tick, ausência de erros JS e somente POST de sessão técnica, sem efeitos de produto. Capturas e resultado em `.playwright-mcp/sprint037/`; imagens inspecionadas. Playwright MCP não estava disponível; foi usada a biblioteca Playwright local com Chrome.
- Limites: os dados e as falhas de backend desta prova visual são controlados. Não houve nova execução real de provider ou Maestri/OMP; a cor de conexão representa atualizações do controlador, e a observação Maestri permanece separada. Banco pessoal não foi aberto/migrado. Sem commit, push ou início da sprint 038.
- Validação: **1.932/1.932 testes em 165 arquivos** na rodada integral. Após o ajuste final das cores/textos e o teste adicional de cursor inválido, **45/45 testes direcionados em 7 arquivos** e a prova Chrome foram repetidos com sucesso. Typecheck, lint, build e `git diff --check` passaram. O build mantém o aviso existente de bundle web acima de 500 kB.

### Sprint 038 - Reservas duráveis de notificação local

Data: 2026-10-24. Implementação direta de feat-073/074, V06/V07, RF-78-80, RNF-11 e backend de US-19 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores preservadas.

- A migration 047 cria `notification_dispatches`, com reserva única por instalação/consumidor/superfície/evento, UUID do despacho, revisão, timestamps e estados `reserved`, `confirmed`, `uncertain` e `unavailable`. A elegibilidade vem de eventos explícitos de pergunta pendente, falha ou conclusão da tentativa, no escopo da instalação/conta do evento e da tentativa. Perguntas exigem a rodada e o papel do evento mais recente correspondente, estado pendente e TTL ainda válido. Evento técnico, pergunta expirada/inativa, sequência inacessível e evento fora do escopo não geram reserva.
- `POST /api/v1/notifications/claims` entrega `send_allowed=true` somente após a inserção exclusiva e seu journal terem sido confirmados na mesma transação IMMEDIATE. Replay do comando, nova operação para a mesma chave e consulta genérica de operação não renovam o direito. O resultado de `GET /operations/:id` confirma somente o registro do comando, sem payload ou autorização de envio. Consumidor é identidade de deduplicação, sem autoridade de acesso.
- `POST /api/v1/notifications/receipts` exige sessão técnica, CSRF/Origin, Idempotency-Key, If-Match do despacho e revisão correspondente no corpo. Transições permitidas: `reserved` para resultado observado; `uncertain` para confirmação tardia ou indisponibilidade. Estados confirmados/indisponíveis não reabrem envio. Replay do recibo recupera a revisão aceita sem reaplicar a transição. Reinício transforma reservas sem resultado em `uncertain`, sem envio automático ou prazo de renovação.
- A projeção contém apenas título fixo da fábrica, tipo do evento e hash local construído com UUID validado da tentativa e rota fixa de detalhe. Não inclui nome de projeto, título de issue, caminho, orientação ou log. Motivo livre do host entra apenas no hash do comando; a tabela guarda código fixo de resultado, sem replicar conteúdo/credenciais. Recibos não modificam pergunta, resultado ou falha originais.
- Reservas e operações de notificação integram o inventário e a finalização exclusiva da exclusão. A remoção autorizada apaga o despacho e o evento correspondente; replay da sequência removida é recusado, sem virar evento novo. Sem pruning automático. Fixtures de upgrade reconhecem schema 47 somente em bancos descartáveis, preservando a ausência de notificações históricas inventadas.
- Provas em `tests/integration/notifications.test.ts`: nove testes com SQLite real, duas conexões SQL e Fastify HTTP injetado. Cobrem exclusividade, replay/resposta perdida, escritor ocupado e rollback do journal, CAS/transições, redação de motivo, estado indisponível, reinício, evento inelegível, escopo de conta, falha/conclusão distintas e autenticação HTTP. O teste HTTP lança oito reservas simultâneas para a mesma chave e confirma um único vencedor. Testes de finalização exercitam reservas preenchidas em dois projetos, preservação do outro projeto e recusa do replay removido, com e sem upgrade.
- Limites: backend concluído, sem emitir notificação nativa ou pedir permissão do navegador. Consumidor visual e prova de suporte/permissão/apresentação no host pertencem à sprint 039. Executor/GitHub/workspace usados nos testes são controlados; nenhum provider, terminal Maestri, publicação externa ou banco pessoal foi acionado. Sem commit, push ou avanço de sprint.
- Validação: **1.942/1.942 testes em 166 arquivos**, typecheck, lint, build e `git diff --check` passaram. O build mantém o aviso existente de bundle web acima de 500 kB.

### Sprint 039 - Notificações locais e acesso à tentativa [IMPLEMENTADA; GATE NATIVO PARCIAL]

Data: 2026-10-24. Escopo: feat-075/076, US-19.C1-C3, RF-78-80, RNF-04/10/11 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Fontes: SPEC V06/V07, contratos NotificationClaim/NotificationReceipt, canal de eventos da sprint 037 e reservas da sprint 038. Alterações anteriores preservadas.

- AppShell mantém um consumidor global e consulta a identidade da instalação inclusive nas rotas internas. Configuração oferece ativação/desativação explícita, verifica contexto seguro, suporte e permissão; somente o clique solicita permissão. Negação ou indisponibilidade não modifica perguntas, resultados ou falhas. A preferência local guarda apenas ativação por instalação, sem cookie, CSRF, conteúdo ou direito de envio. A identidade UUID v8 deriva de SHA-256 de instalação/origem/superfície, sem corrida de inicialização entre abas e sem mudar em reconexões ou limpeza da preferência.
- Eventos elegíveis de pergunta, falha e conclusão solicitam reserva autenticada com correlação própria. Somente uma resposta válida da operação atual, com `send_allowed=true`, permite uma apresentação. Desmontagem, desativação e ressincronização invalidam respostas em andamento. Replay e perda de recibo não autorizam reenvio. A leitura inicial cobre os 100 eventos recentes; ressincronizações seguintes percorrem páginas até o cursor já observado. Não há promessa de recuperar notificações após fechar a aplicação.
- O recibo é `confirmed` somente após `show`; erro ou exceção produz `unavailable`. Ausência de confirmação em 10 segundos, fechamento antes de `show` ou reserva recebida após invalidação produz `uncertain`. Falha ao registrar recibo permanece sem confirmação, sem repetição automática. Esse prazo apenas registra incerteza e não renova envio. Mensagens usam título/corpo fixos, sem conteúdo do projeto ou credenciais. Clique aceita exclusivamente hash local de detalhe com UUID válido e altera apenas a navegação.
- Validação: suíte completa **1.949/1.949 testes em 167 arquivos** antes de dois casos adicionais de suporte/permissão. Typecheck, lint, build e `git diff --check` passaram; build conserva o aviso existente de bundle acima de 500 kB. Testes direcionados cobrem identidade, origem/instalação, destino, confirmação por show, reserva tardia, replay, timeout, erro, recibo perdido e preferência compartilhada. Os testes HTTP/SQLite reais da sprint 038 permaneceram aprovados.
- Prova Playwright MCP com build de produção e servidor HTTP controlado: duas abas com uma apresentação, replay SSE, resync, reload, evento diferente, clique simulado com destino local validado, permissão negada e viewport 390 px sem overflow horizontal. Nenhum erro JavaScript nas páginas do cenário final. Capturas `wide.png` e `narrow.png`, inspecionadas, e resumo em `.playwright-mcp/sprint039/`. Reprodução: iniciar `node tests/browser/local-notifications-server.mjs` na porta 4310 e executar `tests/browser/local-notifications.playwright.js` pelo Playwright MCP. Outros endpoints dessa fixture devolvem indisponibilidade explícita e não representam regressão do produto.
- Prova parcial da API nativa no Chrome do host: suporte presente, permissão concedida via `context.grantPermissions`, construtor nativo preservado, evento real `show` e recibo `confirmed`. **Gate pendente:** prompt humano, inspeção do aviso no Windows e clique físico no aviso nativo não foram comprovados. O clique da prova controlada invoca o handler da superfície simulada. Não declarar aceite nativo integral ou encerrar esse gate com essa simulação. Sem provider, Maestri/OMP, publicação externa, banco pessoal, commit, push ou avanço para a sprint 040.

### Sprint 040 - Pausa durável e drenagem do controlador [IMPLEMENTADA; VALIDAÇÃO LOCAL E NATIVA DO CONTROLADOR]

Data: 2026-10-24. Escopo: feat-077/078, backend V04/V05, US-20.C1-C4 e RF-81-83 do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Fontes: SPEC, GLOSSARY e distinção entre cancelamento, parada física e limpeza de INTEGRACAO-MAESTRI-OMP. Alterações anteriores e gate nativo pendente da sprint 039 preservados.

- GET `/api/v1/shutdown` retorna revisão, geração, pausa, automação, estado, capacidades e inventário paginado com contagem global. Cursor vinculado ao resumo e estado de controle recusa continuação após mudança. Página vazia e `has_more` não determinam ociosidade. POST aceita `pause_starts` e `close_when_idle` com autorização explícita, sessão técnica, Origin/CSRF, Idempotency-Key e If-Match; retorna 202/Location e recibo público mínimo. Replay recupera a operação anterior antes do CAS, sem repetir ações.
- A aceitação desliga a automação e avança a revisão da configuração na mesma transação curta que grava operação, evento e diário privado versionado em `operation_requests.receipt_json`. O diário contém somente ação, geração, revisão de controle, pausa, instância, operação de drenagem e compromisso de fechamento. Não há tabela de shutdown. Migration 048 adiciona índice de consulta e guardas imutáveis: início não pode ser inserido depois da pausa e operações novas não podem ser aceitas após o compromisso final.
- A guarda é consultada antes da preparação assíncrona e novamente na aceitação transacional do início manual ou da fila. Habilitação da automação pela fila/configuração também respeita a pausa; automação normalmente desligada continua distinta dessa barreira. Novo pedido de pausa não revoga silenciosamente uma drenagem vigente. Inicialização recompõe o controle antes da composição HTTP, registra geração da nova instância quando há histórico e conserva a pausa, sem repetir fechamento autorizado ao processo anterior. GET e renovação de sessão não liberam novos inícios.
- Inventário cobre tentativas, recursos, sessões/ocupações de terminais, checks, captura/verificação, publicação/efeitos/destinos, criação e operações de board/reconciliação, exclusão, transição de armazenamento, diagnósticos e outras operações aceitas/incertas pertinentes. Não filtra pela conta ou projeto selecionados. Não carrega capturas, logs ou caminhos. Terminal liberado e sessão concluída não bloqueiam a drenagem; estado ativo ou incerto permanece identificado e preservado.
- O coordenador começa a seguir a operação após o envio de 202, mantém acompanhamento enquanto houver trabalho e revalida operação, geração e instância. A conferência final usa o conjunto inteiro na transação que registra o compromisso durável; somente depois chama o fechamento real do servidor. Não cancela tentativas nem solicita remoção de ambientes. Recibos históricos permanecem intactos e a operação de drenagem de outra instância aparece como revogada. Nenhuma transação permanece aberta durante espera ou IO.
- Testes direcionados em `tests/integration/shutdown.test.ts`: **14/14**, cobrindo CAS/idempotência, rollback do diário, reinício, resposta histórica, duas conexões SQLite, corrida nas duas ordens e durante preparação assíncrona, 105 trabalhos/paginação, inventário de outra conta, recursos incertos, terminais liberados, controles HTTP e compromisso anterior ao callback de fechamento. A política de exclusão foi atualizada explicitamente para o schema 48, mantendo a recusa de versões desconhecidas; os **63 testes** direcionados de exclusão/encerramento passaram após a atualização.
- Prova nativa reproduzível: `npm.cmd run build` e `node scripts/proof-shutdown.mjs`. Controlador compilado, HTTP real em 4310 e SQLite em diretório temporário próprio: pausa manteve listener aberto; reinício conservou pausa e trocou identidade da instância; 202 de `close_when_idle` foi recebido; compromisso ficou gravado; listener fechou; novo reinício permaneceu aberto e pausado, sem repetir fechamento antigo. Nenhum cancelamento implícito. Evidência: `.cache/sprint040/native-shutdown.json`. O servidor de prova foi encerrado e o banco descartável removido.
- Limites de escopo: `resume_starts` está declarado no contrato fechado, mas sua capacidade permanece indisponível e a ação retorna 409 até a sprint 041. A interface de encerramento pertence à sprint 042; não houve nova UI ou prova de navegador nesta entrega. A prova nativa não chama Maestri/OMP ou providers, não usa banco pessoal e não comprova parada de executores externos. Sem commit, push ou avanço para a sprint 041.
- Validação final: **1.965/1.965 testes em 168 arquivos**, **14/14 testes direcionados de encerramento**, typecheck, lint, build e `git diff --check` aprovados. Prova nativa repetida com o build final e aprovada. Build conserva o aviso preexistente do bundle web acima de 500 kB. Logs locais: `.cache/sprint040-tests-final.log`, `.cache/sprint040-diff-check.log` e `.cache/sprint040/native-shutdown.json`.

### Sprint 041 - Retomada de novos inícios e revogação do fechamento [IMPLEMENTADA; VALIDAÇÃO LOCAL E NATIVA DO CONTROLADOR]

Data: 2026-10-24. Escopo: feat-079/080, complemento E1-a de US-20 e RF-81-83 no plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Fontes: SPEC V04/V05 e E1-a, controle da sprint 040 e distinção de cancelamento/parada/limpeza de GLOSSARY/INTEGRACAO-MAESTRI-OMP. Alterações anteriores e gate nativo pendente da sprint 039 preservados.

- POST `/api/v1/shutdown` aceita `resume_starts` somente com pausa da instância corrente, antes do compromisso final. A mesma transação curta libera novos inícios, conserva automação desligada, avança geração e revisão e registra a referência à operação/geração de drenagem revogada, quando existente. Não cancela, reinicia ou publica tentativas, não habilita projetos/fila e não restaura a automação anterior. Início manual posterior continua exigindo preparação atual e demais guardas.
- `ShutdownView` oferece capacidade de retomada conforme pausa, instância e compromisso. Revisão vencida recebe 412; chave divergente recebe 409. Se o fechamento venceu, a nova retomada recebe 409 com causa/próxima ação antes de qualquer aceitação, inclusive quando traz o ETag anterior ao compromisso. Replay recupera recibo original antes do CAS e não reaplica a retirada de pausa nem revoga drenagem posterior. O progresso da drenagem retirada apresenta `revoked`; recibos anteriores permanecem intactos.
- Migration 049 amplia o índice e os triggers de controle para incluir `shutdown.resume_starts`, sem editar a migration 048 nem criar tabela. A guarda SQL de início passa a reconhecer a retirada mais recente; a barreira final continua recusando novos trabalhos após compromisso. A política de inventário da exclusão reconhece explicitamente o schema 49 e preserva a recusa de versões desconhecidas. O leitor mantém recibos da 040 e valida as combinações de ação/pausa/compromisso/referências de revogação.
- Cada timer conserva o token de operação/instância/geração que o agendou. Callback antigo não assume um token novo nem apaga seu timer. Após espera, o worker verifica estado corrente e a transação final reconfere token e inventário completo imediatamente antes de comprometer fechamento. Se retomada vence depois da leitura do worker, a conferência transacional recusa seu commit. Resposta HTTP antiga de drenagem também não rearma fechamento revogado.
- Reinício abre geração nova da instância, preservando pausa ou retirada já aceita e automação desligada. Não recupera autoridade de fechamento do processo anterior nem ressuscita drenagem revogada. Upgrade de banco descartável no schema 48 preservou literalmente o recibo aceito e ofereceu retomada na instância restaurada.
- Validação: **1.975/1.975 testes em 168 arquivos**, **24/24 testes direcionados de encerramento**, typecheck, lint, build e `git diff --check` aprovados. Cobertura adicional inclui retomada com automação anteriormente habilitada, novo início manual explícito, preservação integral de tentativa/recursos/rodadas/publicação, rollback da retirada, replay após drenagem nova, reinício, upgrade, duas conexões SQLite e as duas ordens da corrida. Timers e callbacks atrasados foram invocados deterministicamente; outro teste aceita retomada entre a leitura do worker e o commit. HTTP injetado comprovou 202 da retomada, replay histórico e 409 após compromisso, sem operação nova aceita.
- Prova nativa: `npm.cmd run build` e `node scripts/proof-shutdown-resume.mjs`, com controlador compilado, HTTP real em 4310, SQLite e trabalho de inventário controlado em banco temporário. Retomada respondeu 202, liberou inícios com automação desligada, preservou recibos e projetou revogação. Após liberar o trabalho simulado, servidor permaneceu aberto, sem commit antigo; replay de drenagem não o fechou e replay de retomada não alterou uma drenagem nova. Reinício preservou a retirada. Evidência: `.cache/sprint041/native-resume.json`; suíte: `.cache/sprint041-tests.log`. A prova `node scripts/proof-shutdown.mjs` da 040 também foi repetida e passou no schema 49. Servidores de prova encerrados e bancos descartáveis removidos.
- Limites: esta entrega cobre backend e ciclo de vida do controlador. A interface de retomada/encerramento pertence à sprint 042; não houve nova UI ou prova de navegador. O trabalho da prova nativa é uma fixture de diário, sem executor real; não comprova Maestri/OMP, parada física externa ou provider. Sem banco pessoal, publicação externa, commit, push ou avanço para a sprint 042.

### Sprint 042 - Encerramento guiado e retomada na interface

Data: 2026-10-24. Implementação direta de feat-081/082, US-20, RF-81–83 e E1-a, conforme plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. Alterações anteriores preservadas.

- `ShutdownDialog` acessível pela navegação apresenta pausa, drenagem, fechamento comprometido, contagem global e páginas de trabalhos, identidades, causa, próxima ação e acesso ao detalhe da tentativa para cancelamento/recursos. A ausência de itens em uma página não autoriza fechamento; as ações dependem das capacidades do controlador e da revisão HTTP atual. Abrir ou fechar diálogo não envia comando nem desfaz pausa. O texto distingue fechamento da interface, controlador, cancelamento, parada física e preservação dos ambientes.
- Pausar, fechar quando ocioso e retomar são comandos explícitos com `authorized=true`, If-Match e UUID próprio, sem segundo diálogo. Trava síncrona impede duplo envio. A correlação é registrada antes do POST no mecanismo existente de operações incertas da sessão; resposta perdida, recarga ou reabertura permitem consultar o mesmo UUID sem replay automático. A retomada só apresenta `Novos inícios liberados. Automação permanece desligada.` após leitura atual confirmada, sem pendência. Operação revogada tem mensagem própria; recusa por revisão/capacidade exige consulta atualizada. Nenhuma ação cancela ou publica tentativa implicitamente.
- A consulta integra observações aplicadas de conexão, ressincronização/SSE e intervalo configurado. Leituras antigas são cercadas por sequência e desmontagem; erro preserva dados anteriores e impede comandos. O catálogo compartilhado de diálogos passou a orientar também a abertura pelo botão, evitando divergência entre rota e navegação. Conteúdo rola separadamente das ações, com rodapé fixo ao diálogo e duas colunas em tela estreita.
- Testes determinísticos em `apps/web/src/features/shutdown/shutdown-dialog.test.ts`: transporte pendente e clique duplo, UUID/If-Match/autorização, resposta perdida e consulta sem novo POST, lista parcial/cursor e correlação após reabertura. Suíte integral: **1.978/1.978 testes em 169 arquivos**. Após ajustes finais de apresentação e atualização por eventos, **33/33 testes direcionados em 3 arquivos**, typecheck, lint, build e `git diff --check` passaram. Permanece o aviso anterior de bundle acima de 500 kB.
- Prova renderizada reproduzível: `node tests/browser/shutdown.mjs`, Chrome headless com assets compilados servidos em 4310 e HTTP controlado. Cobriu pausa, segunda página com contagem de 21 trabalhos, fechar/reabrir, Escape e restauração do foco, retomada com resposta truncada após aceite, nova instância simulada e recarga preservando correlação, consulta do mesmo UUID sem reenvio, corrida recusada e operação revogada. Conferidos desktop 1440 x 1000, mobile 390 x 640 e viewport efetivo 312 x 512, sem overflow horizontal e com todos os botões do rodapé dentro da tela. Capturas inspecionadas e resultado em `.playwright-mcp/sprint042/`. Playwright MCP não está disponível nesta sessão; usada biblioteca Playwright local com Chrome.
- Limites: backend e reinício desta prova de UI são controlados; não houve nova prova de fechamento físico do controlador/execução Maestri/OMP, provider ou acesso ao banco pessoal. Viewport reduzido verifica reflow, não zoom nativo do Chrome/Windows, que permanece sem validação. Sem commit, push, publicação externa ou início da sprint 043.

### Sprint 043 - Conferência dos gates operacionais e composição real [CONCLUÍDA EM 25/10/2026]

Data inicial: 2026-10-24. Execução direta autorizada de feat-084. As entradas abaixo preservam os estados históricos e seus limites; o fechamento de 25/10 consta ao final. Matriz por requisito, cenário, versão, superfície e limite em `docs/operation/sprint043-gates.md`. A sprint 044 não foi iniciada.

- Identidade: HEAD `e7cfab89ceeb06581c4ed1d414813621cdd03ba3` com working tree preservado. Manifesto SHA-256 de 599 arquivos em `.cache/sprint043/source-manifest.json`; identidade final `08e1eeedf5739ce31d570c7921f5c2b755004e4f5127699de9abbebbe06641ae`. Manifestos intermediários preservados. Não houve staging ou commit; hashes não são cópia do checkout. Após as primeiras provas, somente o driver de medição mudou, com produção e bundle inalterados.
- Distribuição nova Unicode passou em `npm.cmd run test:distribution`, com HTTP/assets/SQLite reais, lock entre processos, cwd distinto, reinício e revogação de sessão. Log `.cache/sprint043/distribution.log`. Pré-voo/âncora são controlados, não prova nativa Maestri/OMP. Inicialização pelo terminal-âncora e correção manual na distribuição continuam pendentes.
- Provas locais: 3/3 de manutenção/recuperação/Git, 26/26 de exclusão Windows e 6/6 de transição física de localização passaram. Logs `.cache/sprint043/maintenance-fixed.log`, `deletion.log` e `storage-transition.log`. Git preservou HEAD/índice/status e bytes tracked/staged/untracked em clone descartável; recuperação preservou refs/tree/base, diff e artefatos após parada dos próprios processos, reinícios e limpeza elegível. Transição moveu diretório real e reconciliou perda após movimento/reabertura, preservando ambas as cópias em conflito. HTTP das provas de domínio usa inject e adapters externos continuam controlados.
- As falhas iniciais de duas provas nativas foram preservadas e corrigidas nas fixtures: materialização posterior ao check não pode recriar `probe.mjs` com `wx`; o pipeline precisa receber o `getArtifact` da verificação real para compor o contexto do Revisor. A omissão causava `DISPATCH_FAILED` apesar do check aprovado. Não houve relaxamento de contratos ou mudança de produção. Typecheck, lint e diff-check passaram. A suíte integral da sprint 042 não foi repetida nesta rodada; os testes alterados são provas nativas fora da suíte padrão.
- Prova nova pelo Playwright MCP, disponível nesta sessão: bundle atual em 4310, controlador/HTTP/SQLite reais e banco descartável. Pausa, fechar/reabrir e retomada confirmada com automação desligada passaram. Desktop/mobile, imagens inspecionadas, sem overflow horizontal e rodapé acessível em 390 x 640. Controlador próprio fechado pela ação explícita, sem cancelamento implícito. `node scripts/proof-shutdown.mjs` repetido e aprovado, log `.cache/sprint043/shutdown.log`; confirmou pausa/reinício, 202, compromisso durável, listener fechado e ausência de replay do fechamento no reinício. Sem executor real nessa prova.
- Exclusão: fontes atuais diferiam de duas entradas do manifesto anterior; repetidos legado/gerenciado com 8 tentativas, 256 arquivos e cache denso de 64 MiB por tentativa. Primeiro ensaio em `.cache/deletion-baseline/evidence/run-NdqFMe`; servidor concluiu ambos com oráculos aprovados, mas o rAF gerenciado foi negativo e a comparação permaneceu pendente. Corrigido o relógio de observação do callback, preservando timestamp bruto e meta anterior; repetido somente gerenciado em `run-VQQ1Ex`, reutilizando o legado desta rodada. Comparação final `.cache/sprint043/deletion-comparison-recheck.json`: passou, total incluindo aceitação de 184.375,78 ms legado e 60.090,31 ms gerenciado, abaixo das metas 497.706,83/134.493,88 ms; feedback 12,90/11,20 ms. Nenhum SLA, equivalência de viewport ou significância estatística declarados. O driver inclui a pasta principal na guarda de destinos; 25 caminhos conferidos pelo MCP dentro da fixture.
- Gates pendentes: provas Maestri/OMP da composição atual, nova tentativa e recusas/perda/cancelamento; GitHub real com destino/autorização/contexto autenticado; distribuição por âncora e correção manual; cobertura visual completa das superfícies alteradas; zoom nativo; permissão/aviso/clique físico de notificação no Windows. O helper Wire respondeu em consulta de leitura, sem credenciais expostas, mas não comprova conexão nativa. Histórico sem identidade suficiente não foi promovido a prova atual. Sem provider, escrita no GitHub, banco pessoal ou início da sprint 044.

#### Complemento de 24/10, 20:24 - Prova Maestri/OMP autorizada

- Usuário autorizou às 20:20 o recorte concreto de dois papéis e seis passagens `openai-codex/gpt-6-luna/high`, até nove minutos, sem push/PR. O comando configurado em `vitest.sessions.config.ts` foi conduzido pelo Shell #5 observado ocioso, usando Wire apenas para entregar o comando à âncora. A execução nativa da fábrica herdou esse contexto e usou Maestri CLI, OMP, Git local, SQLite e Windows jobs reais. Não é promoção de uma consulta Wire a prova do produto.
- `tests/native/session-continuity.proof.ts` passou em 103.824 ms, comando em aproximadamente 105,5 s, código 0. Exatamente seis resultados foram aceitos, com três rodadas por papel, duas sessões OMP contínuas distintas, perfil confirmado nas seis conexões e um único checkout. Revisão final aprovada; `value.txt` terminou em 3. Rejeições anteriores são deliberadas pela fixture de transporte, não revisão autônoma do produto inteiro. Autoridade GitHub e checks permanecem controlados.
- Trava explícita impede sétima passagem; watchdog fecha somente a prova ao esgotar nove minutos. Typecheck, lint e diff-check passaram, sem alterações de produção/build. Manifesto de fontes atual em `.cache/sprint043/session-source-manifest.json`: `a227d4f36761721599c17a2a7068de55eb76597c74b493406724394161df0154`; runtime/configuração/runner em `session-runtime-manifest.json`: `b1909aa9d06aa8cb478c1e2bcb9544b5e85d164ebc295d90412c4582ccf229ff`. A única mudança desde o manifesto anterior é o limite no teste nativo. A suíte padrão não foi repetida e nenhum provider adicional foi iniciado.
- Evidências novas, sem sobrescrever ensaios anteriores: `.cache/session-real-1792884160456/result.json`, `progress.json`, `bridge-trace.json`, e `.cache/sprint043/session-authorized.log`, `session-authorized-exit.json`, `session-audit.json`. Auditoria SQLite somente leitura confirmou seis recibos, uma revisão aprovada, foreign keys íntegras e 13 observações de parada confirmada sem falha nativa. Feed confirmou os dois terminais de prova sem processo/atividade e Shell #5 ocioso; itens do canvas preservados.
- Matriz `docs/operation/sprint043-gates.md` atualizada para prova parcial atual de continuidade/perfil/checkout/parada. Permanecem obrigatórios os demais cenários Maestri/OMP (nova tentativa, recusa de ativo/incerto, perda e cancelamento representativo), GitHub real, distribuição por âncora/correção manual e gates visuais/nativos listados acima. Sprint 043 segue pendente. Sem staging, commit, push, PR ou avanço para 044.

#### Complemento de 24/10, 20:41 - Distribuição limpa na âncora e layout mobile

- Continuação do próximo gate da sprint 043; a 044 não foi iniciada enquanto os gates obrigatórios permanecem pendentes. Pacotes novos Unicode `build/Fábrica distribuição-nlq2Pc` e, após correção visual, `build/Fábrica distribuição-1HJUyn`. Antes do primeiro início de cada pacote, assertivas conferiram ausência de banco/dados pessoais, `.env`, Git, fontes, documentação e dependências de desenvolvimento. Runtime distribuído conferido contra o build, sem copiar o checkout para persistência.
- `npm.cmd start` foi executado dentro de cada pacote pelo Shell #5, previamente observado ocioso, herdando a âncora Maestri real. Acesso HTTP/UI em 4310 mesmo com Git/PowerShell ambíguos. Pela interface, caminho inexistente de Git foi recusado sem salvar e preservou rascunho; caminhos válidos de Git/PowerShell foram salvos com recibo e reconsultados. Após fechamento guiado e novo início, identidade da instalação e preferências persistiram e a conexão nativa Maestri foi confirmada. Não foi feita inferência no pacote. Leituras automáticas de identidade/status GitHub são reais, sem vínculo ou efeito externo.
- A primeira inspeção mobile encontrou overflow interno que a checagem da página inteira não detectava: clientWidth 339, scrollWidth 628 e uma ação fora dos limites. O grid implícito de `.initial-setup` herdava a largura mínima da faixa de etapas. Uma linha CSS em `apps/web/src/app/styles/artifact.css` fixa o track em `minmax(0, 1fr)`, preservando o conteúdo e a rolagem própria da faixa. Roteiro novo `tests/browser/onboarding-layout.playwright.js` reproduziu a falha após reload e passou no pacote final em 1440 x 900, 390 x 640 e 312 x 512, com Tab/foco, todos os botões do rodapé acessíveis e nenhuma mutação de produto. Capturas finais inspecionadas, sem injeção de CSS de diagnóstico.
- Evidências anteriores preservadas em `.cache/sprint043/distribution-anchor-20261024-2028/`; finais em `.cache/sprint043/distribution-anchor-final-20261024-2037/result.json` e `.cache/sprint043/onboarding-layout-1792885111091/`. No pacote final, dois processos distintos iniciaram/encerraram com código 0 e mantiveram a instalação. Auditoria read-only do banco exclusivo: schema 49, foreign keys íntegras e zero projetos, tentativas, passagens, sessões e publicações. Servidores próprios encerrados; Shell #5 preservado e ocioso.
- Identidade corrente de fontes: `de24e901f0c4e916327edf11a55d8fa98dd1187dd6b17f308f1c567385e3e8d9`, 601 arquivos em `.cache/sprint043/distribution-source-manifest.json`. Bundle `index-B40-ucCW.js` / `index-DGF32-gp.css`. Apenas a regra CSS do assistente mudou em produção desde a prova de seis passagens. JS/SQL/contratos do controlador continuam idênticos; dois helpers C# recompilados diferiram em hash, com fontes iguais. A comparação inicial recusou esses bytes e não foi convertida em equivalência automática: repetida a prova local `scripts/prove-terminal-jobs.mjs`, com parada de pai/filho, identidade/geração estrangeiras, parada antes de handshake e lançamento tardio; passou em `.cache/terminal-jobs-1792885104831/result.json`. O seletor nativo não foi exercitado. Não houve nova prova paga para os helpers recompilados.
- Build, typecheck, lint, checagem sintática do roteiro e 6/6 testes de ferramentas passaram; sem nova suíte integral. Permanece o aviso anterior do bundle acima de 500 kB. A recusa esperada do caminho inválido e o fechamento dos servidores aparecem como erros HTTP/conexão; não foi declarado console global limpo. Matriz atualizada: distribuição por âncora/correção manual atendida no recorte, enquanto nova tentativa/recusas/perda/cancelamento Maestri, GitHub com efeitos, notificações nativas, zoom nativo e demais superfícies continuam pendentes. Sem staging, commit, push, PR ou avanço para 044.

#### Complemento de 24/10, 21:00 - Preparação dos cenários nativos restantes [ESTADO HISTÓRICO; EXECUÇÕES ABAIXO]

- Novo roteiro `tests/native/session-recovery.proof.ts`, configuração opt-in `vitest.session-recovery.config.ts`: duas tentativas completas para sessões novas e reutilização de terminais parados, uma tentativa com trabalho nativo ativo cancelado e uma com perda de acompanhamento induzida antes de parada explícita. Orçamento máximo preparado: seis passagens novas, perfil `openai-codex/gpt-6-luna/high`, nove minutos; início e continuação passam pela mesma trava. Sem provider executado nesta preparação e sem renovação implícita da autorização anterior já consumida.
- Runner exige parâmetro explícito de autorização e manifesto compatível antes de iniciar. Identidade `0396cb51a931d94512ed0cf909eb869ce1903e28104e5ab866299ab6bc45b2af`, 603 arquivos em `.cache/sprint043/recovery-preparation-20261024-2051/source-manifest.json`. Produção e os 601 arquivos anteriores permanecem inalterados. GitHub/autoridade/checks do ensaio são portas controladas; nenhuma escrita remota está autorizada por esse roteiro. A falha de canal será injetada e os limites de alocação constam da matriz, sem equivalência a uma falha espontânea de rede/provider.
- Preparação validada com typecheck, lint e 82/82 testes determinísticos de execução/recuperação. Sem opt-in, a própria prova recusou com `REAL_RECOVERY_PROOF_NOT_AUTHORIZED`, antes de criar fixture ou recrutar terminal. Isso comprova somente a barreira de execução, não os cenários nativos futuros. Logs de preparação preservados; gate e sprint seguem pendentes, sem avanço para 044.

#### Complemento de 24/10, 22:54 - Reconciliação e cancelamento/perda nativos

- Continuação autorizada pelo usuário às 22:51. Reconciliação encontrou duas execuções anteriores: `.cache/session-recovery-1792886630928` consumiu duas passagens e falhou na publicação por capacidade de pasta inválida da fixture; `.cache/session-recovery-1792887010015` consumiu outras duas, entregou a primeira tentativa e falhou ao iniciar outra sem `previous_attempt_id` (`EXPLICIT_RETRY_REQUIRED`). Não houve repetição silenciosa nem promoção dessas falhas a sucesso. Os seis terminais de fábrica existentes estavam sem processo e sem atividade no feed inicial.
- Corrigido somente o roteiro `tests/native/session-recovery.proof.ts`: preparação explícita da sucessora e recorte `stops_only` com trava máxima de duas passagens. Produção/build preservados. Typecheck, lint e diff-check passaram; sem nova suíte integral. Runner e manifesto atuais em `.cache/sprint043/recovery-stops-20261024-2251/`, com opt-in, conferência de hashes, nova janela de nove minutos e restauração do ambiente.
- Pelo Shell #5 observado ocioso, o teste nativo passou em 30.552 ms (comando 32,54 s, exit 0), exatamente duas passagens `openai-codex/gpt-6-luna/high`, completando seis no orçamento deste ensaio. Cancelamento pelo pipeline encerrou Node pai/filho e registrou `cancelled`. Perda `CHANNEL_EOF` injetada na fronteira do canal manteve pai/filho ativos e recusou confirmação de parada; ocupação não ficou disponível. Após parada explícita, ambos encerraram e a tentativa permaneceu `interrupted`, sem sucesso inventado.
- Dois handshakes comprovaram sessões OMP distintas em tentativas distintas, reutilizando o mesmo terminal físico de Implementador após parada confirmada. Isso não cobre duas tentativas completas com os dois papéis, reutilização do Revisor ou todas as recusas/corridas de alocação. Autoridade/GitHub/checks permanecem controlados, sem push/PR. A falha de acompanhamento foi induzida, sem alegação de queda espontânea do provider.
- Evidência: `.cache/session-recovery-1792893200267/result.json`, `handshakes.json`, `budget.json`, `progress.jsonl`; runner, log, recibo, manifesto e `audit.json` na pasta acima. Auditoria SQLite read-only confirmou duas paradas de terminal, resultados `cancelled`/`interrupted`, foreign keys íntegras e quatro PIDs ausentes. Feed posterior mostrou terminal sem processo, mas `isActive=true`, sinal que não foi usado como autoridade física; Shell #5 estava ocioso. Canvas preservado. Sprint 043 segue pendente, sem início da 044 ou novo consumo autorizado implicitamente.

#### Complemento de 24/10, 23:31 - Novas tentativas, GitHub real e conferência visual

- Usuário autorizou às 23:14 quatro passagens adicionais por até nove minutos, recursos privados descartáveis no GitHub (repositório/Project/issue/comentários/commit/push/PR) e participação humana em zoom/notificação. Sem autorização de commit/push do repositório canônico ou avanço para 044.
- Duas tentativas ICR completas passaram: quatro passagens, quatro sessões OMP distintas, mesmos dois terminais físicos por papel, perfil `openai-codex/gpt-6-luna/high`, teste 75.717 ms e comando 76,61 s, exit 0. Nenhuma quinta passagem. Evidências `.cache/session-recovery-1792894515251/` e `.cache/sprint043/recovery-sessions-20261024-2314/`. Auditoria read-only: duas tentativas `delivered`, quatro resultados, foreign keys íntegras. As três primeiras paradas de recurso constam confirmadas; a última do Revisor ficou `uncertain/TRACKING_LOST` no encerramento do roteiro, apesar dos terminais gerenciados disponíveis. Isso não foi convertido em confirmação física nem apaga a prova de reutilização entre as tentativas. A prova atual de sessões não fecha toda corrida/recusa de alocação nativa ou a última parada incerta.
- GitHub real no contexto herdado do Shell #5, sem relogin ou alteração de credenciais: conta `vonderheidon`, repositório privado `validacao-fabrica-s043-20261024-2314`, Project privado 13. Repositório, origem e push inicial confirmados pelos adapters do produto. A criação preservou estado parcial após erro real de consulta; recuperou o mesmo Project, sem duplicá-lo. Configure Status executou mutação real, perdeu resposta por injeção controlada e foi reconciliado em leitura, preservando os mesmos cinco IDs e ordem. Evidências e runners em `.cache/sprint043/github-20261024-2314/`.
- Dois defeitos reais corrigidos em `modules/github/board.ts`: campos `id` da união `ProjectV2FieldConfiguration` passaram ao fragmento `ProjectV2FieldCommon`; payload de `linkProjectV2ToRepository` consulta `repository`, conforme schema real. Context7 consultado; introspecção autenticada resolveu divergência dos exemplos de documentação. Fixtures agora recusam as duas seleções GraphQL inválidas. O vínculo pendente foi corrigido explicitamente no recurso descartável com o adapter e a mesma identidade, seguido de recibo/readback; esse reparo operacional não foi apresentado como recuperação automática de qualquer efeito incerto.
- Entrega real por adapters Git/GitHub, com conteúdo aprovado preparado por fixture (sem nova inferência): commit `79d80a6d8b43c2ef2fe54075b7f2eb97965af343`, push confirmado, PR `https://github.com/vonderheidon/validacao-fabrica-s043-20261024-2314/pull/2`, comentário e issue #1 em Done após leitura completa. Repetição da publicação identificou o mesmo PR; reconciliação do push também confirmou o mesmo SHA. HEAD/status do destino local foram preservados. `publication-result.json`, exit 0. Recursos remotos preservados; sem merge, remoção, staging, commit ou push no canônico.
- Impedimento real restante no Kanban: view `Kanban` em BOARD_LAYOUT e Status visível, mas `groupByFields` vazio no schema real. A fábrica mantém a criação parcial com `BOARD_VIEW_NOT_OBSERVED`. Introspecção de Create/UpdateProjectV2ViewInput e ProjectV2ViewConfigurationInput expõe seleção de campos visíveis, sem configuração de agrupamento. Solicitado ajuste humano por Status no Project privado, a ser reconsultado antes de reconciliar. Não foi relaxado o oráculo nem declarado o gate de cinco colunas concluído.
- Playwright MCP, bundle corrente e APIs controladas: sessões/recursos passaram (ativo, ocioso, incerto, perdido, ausência histórica, reabertura sem mutação); entrega passou (preparação/destino, erro de gravação, ICR/commit/PR, adaptação, perda de resposta sem replay, 390x640 e 1100x480 com ações acessíveis); ciclo de correção passou (recorrência, evidência parcial, contestação, limite, ação indisponível, rascunho preservado, revisão vencida e consulta do mesmo UUID). Roteiro antigo de correção inicialmente gerou página vazia por omitir `delivery_summary`/campos de publicação da fixture; atualizado para o contrato vigente, sem mudança da UI de produção. Falha original preservada. Capturas e resultados em `.cache/sprint043/browser-20261024-2325/`; diálogos mobile de entrega/sessões inspecionados. Essas provas não validam os dados simulados do catálogo ao fundo nem substituem cobertura de todas as superfícies.
- Notificação: Chrome confirmou permissão `granted`, ativação na UI e recibo nativo `confirmed` após evento da fixture. Sem `grantPermissions` ou Notification simulado nessa etapa; backend de notificações é controlado. Clique físico/destino e presença visual humana continuam pendentes; não foi chamado handler de clique. Zoom nativo não comprovado (DPR 1); perguntas humanas seguem pendentes. Servidor exclusivo da fixture em 4310 preservado para essa participação.
- Validação: build, typecheck, lint, smoke compilado HTTP/SSE/SQLite e diff-check passaram. Suíte integral final **1.978/1.978 em 169 arquivos**, 118,58 s (`final-full-tests.log`); após ajustar apenas o payload da fixture ao schema observado, 10/10 testes do board passaram novamente. Windows jobs repetido após rebuild, sem provider: `.cache/terminal-jobs-1792895393547/result.json`, duas árvores paradas, identidade/geração estrangeiras e lançamento tardio recusados. Bundle web inalterado e aviso anterior de tamanho mantido. Manifesto final 603 arquivos: `aa5b069ea8998e93639f5802dbe8e117256fb62ea133b1db6e3bf8f1cc20fd2a`, em `final-source-manifest.json`; provas pagas conservam seus runtimes anteriores, sem alegar igualdade binária dos helpers recompilados.
- Sprint 043 continua pendente: agrupamento Kanban observado, interação nativa de notificação/zoom, cobertura visual remanescente e fechamento das recusas/parada nativas ainda exigem evidência suficiente. Nenhuma autorização de consumo adicional foi presumida.

#### Complemento de 24/10, 23:34 - Recusa física de substituição ativa

- `scripts/prove-terminal-jobs.mjs` agora tenta substituir explicitamente cada árvore ativa antes da parada e exige recusa, preservando os processos originais. Prova sem provider passou: `.cache/terminal-jobs-1792895615969/result.json`, `activeReplacementRejected=true`, duas rodadas e guardas anteriores preservadas. A suíte direcionada de ocupação/execução passou 85/85 em dois arquivos, com recusa de terminal incerto em armazenamento controlado (`occupation-controlled.log`). Isso distingue prova física de processo da composição controlada de ocupação; não resolve a última parada incerta do roteiro OMP nem equivale a todas as corridas de alocação nativa.
- Feed final `.cache/sprint043/recovery-sessions-20261024-2314/terminal-after.json`: ambos os terminais dessa rodada sem processo e sem atividade, Shell #5 ocioso. A última parada incerta no diário foi preservada. Manifesto de encerramento, sem apagar o anterior: `.cache/sprint043/github-20261024-2314/closure-source-manifest.json`, 603 arquivos, `cf22c7eba2b6fc3affd3d9715906b88c88ecc7b4e16fca316dd411b06fe67516`. A única alteração posterior à suíte integral foi a nova asserção na prova opt-in e os ajustes finais de fixture de navegador já exercitados; produção permanece a mesma.
- Estado humano às 23:32 preservado em `.cache/sprint043/browser-20261024-2325/native-notification-state.txt`: permissão concedida, recibo nativo confirmado, sem navegação de clique observada e DPR 1. Nenhuma confirmação humana de zoom/clique ou agrupamento do Kanban havia sido recebida. Servidor exclusivo em 4310 mantido para essa interação. Sprint 043 continua pendente.

#### Complemento de 24/10, 23:36 - Retorno humano e precisão do zoom

- Usuário confirmou que a notificação apareceu e que clicou nela. Apresentação e clique ficam comprovados por relato humano, junto ao recibo nativo já registrado; o destino após o clique ainda não foi identificado no relato ou capturado pela automação.
- SPEC 3483/3504 e feat-084 exigem teste sob zoom, sem fixar 200%. O percentual de 200% foi escolha do agente para o ensaio, não pedido literal do usuário. RNF-14 trata indicação de conexão; sua associação anterior a todo o gate de zoom era imprecisa. Não introduzir requisito contratual novo a partir dessa escolha de teste.
- Usuário viu o quadro no GitHub; ainda sem confirmação das cinco colunas na ordem aprovada ou do agrupamento salvo. `groupByFields` vazio comprova ausência de confirmação pela consulta, não demonstra sozinho que o quadro visual está errado. A última parada incerta do Revisor é pendência técnica do encerramento do ensaio, com causa ainda não determinada entre roteiro e produto, separada do parecer aprovado e dos terminais posteriormente observados sem processo.

#### Complemento de 24/10, 23:39 - Quadro visual e nova notificação

- Imagem/transcrição fornecida pelo usuário mostra a aba Kanban do Project `Validacao fabrica S043 20261024 2314` com cinco colunas na ordem Backlog, Ready, In progress, In review e Done, e issue #1 `fix: Conferir entrega real S043` em Done. Isso comprova a apresentação visual atual por evidência humana fornecida, sem atribuir ajuste manual ao usuário nem afirmar que o recibo/API de agrupamento foi reconciliado. A divergência entre `groupByFields` vazio e colunas visíveis exige diagnóstico da consulta; não orientar mudar um quadro visualmente correto para satisfazer o teste.
- Usuário não recorda o destino do clique anterior e autorizou outra notificação. Reaberta a UI de prova, permissão `granted` e preferência ativa confirmadas; disparado evento novo `attempt.icr-completed`. Observador apenas de hash preparado para registrar o destino do clique físico, sem chamar handler ou simular Notification. Backend da fixture continua controlado.

#### Complemento de 24/10, 23:40 - Destino da notificação não aprovado

- Usuário informou que o clique no novo aviso abriu o dashboard. O destino esperado era o detalhe da tentativa. A aba observada pelo MCP permaneceu em `#principal/configuracao`; o observador de hash não registrou navegação, embora o evento 2 tenha reserva e recibo `confirmed`. Apresentação permanece comprovada; destino do clique não passou. Ainda falta identificar o endereço/janela que o usuário viu para distinguir o clique no aviso da origem de prova de abertura em outra instância. Nenhuma causa foi atribuída a código, navegador ou usuário sem essa identificação; sem correção especulativa.

#### Complemento de 24/10, 23:46 - Diagnóstico do clique e separação de perfis

- Usuário identificou Chrome abrindo `http://127.0.0.1:4310/#principal/dashboard`. Eventos 3/4 instrumentados com Notification nativo (subclasses de observação, sem simular clique) registraram apresentação e nenhum evento click/hashchange na aba de origem. Duas subclasses ficaram encadeadas por navegação no mesmo hash; os registros duplicados de constructed/show são dois observadores do mesmo tag, não evidência de duas notificações. Evidência `.cache/sprint043/notification-click-20261024-2343/automated-profile-probe.txt`.
- Inspeção read-only identificou duas instâncias principais Chrome: uma com perfil separado `ms-playwright-mcp/mcp-chrome-1d35c72`, outra sem user-data-dir explícito; ambas com janela Nova Fábrica. CDP da automação enumera somente a aba em Configuração. Abertura na instância normal e perda do callback é hipótese de ambiente, ainda não causa confirmada nem defeito atribuído ao produto. Notification base nativo confirmado e sem service worker controlador.
- Para comparação controlada, notificações foram desativadas pela UI apenas no perfil de automação; perfil pessoal não foi manipulado. Próximo passo exige ativar notificações pela Configuração da janela normal do usuário e depois disparar um evento novo na mesma fixture, sem competir com o perfil automatizado ou promover testes sintéticos a prova nativa.

#### Complemento de 24/10, 23:47 - Clique físico confirmado no Chrome normal

- Usuário ativou notificações no Chrome normal às 23:46. Evento novo 5 (`attempt.icr-completed`) teve reserva e recibo nativo `confirmed`. Perfil automatizado continuou com preferência desativada e sem construção de notificação desse tag; sem simulação do clique ou chamada direta de handler.
- Às 23:47, imagem/transcrição fornecida após clique físico mostra o modal `Detalhe da tentativa`, `Falha ao consultar esta tentativa` e `Detalhe controlado indisponível`, com ações de consultar/atualizar. É o destino esperado: a fixture intencionalmente responde 404 ao detalhe. Apresentação nativa, clique e abertura do detalhe ficam confirmados nesse recorte; leitura de uma tentativa real não foi testada por essa fixture. Evidência `.cache/sprint043/notification-click-20261024-2343/normal-profile-click.json`, relato/imagem no chat e recibo do evento 5.
- Resultado diferencia a execução no perfil normal da falha anterior do perfil separado do MCP. O contraste sustenta hipótese de limitação da ativação entre instâncias/perfis no ambiente de ensaio, sem fechar causa interna do Chrome. Não foi necessário alterar o código de notificações do produto. Gate nativo de permissão/apresentação/clique/destino atendido no recorte de host com backend controlado. Demais pendências da sprint 043 permanecem, incluindo zoom, divergência da consulta de agrupamento Kanban, última parada incerta e cobertura visual remanescente.

#### Fechamento de 25/10, 00:09 - Gates consolidados

- Sprint 043 concluída nos cenários e superfícies registrados em `docs/operation/sprint043-gates.md`, feat-084.C1–C5. Não iniciou 044, novo pipeline, staging, commit ou push no repositório canônico. Nenhuma nova passagem de provider nesta continuação. Evidências anteriores, inclusive falhas, recibos incertos e limites, foram preservadas.
- Kanban: consulta autenticada dos dois eixos mostrou `groupByFields=[]` e `verticalGroupByFields=[Status]` na mesma view BOARD_LAYOUT que a imagem humana mostrava correta. Corrigido `github/board.ts` para consultar o agrupamento vertical das colunas; campo interno passou a `columnFields`, mantendo contrato de recibo. Teste específico cobre agrupamento horizontal vazio com colunas corretas. Reconciliada a mesma criação pelo adapter/orquestrador real: estado `completed`, cinco operações do board confirmadas, IDs de repositório/Project/Status/view preservados e cadastro final `5e04b329-4e40-4159-94b3-68768ca94eee`. Nenhum ajuste manual de colunas, criação duplicada ou novo push/PR. Evidências `closure-20261024-2348/board-axes.json` e `github-20261024-2314/board-final-resume.log`, `board-final-resume-exit.json`, `result.json`.
- Última parada incerta: o roteiro encerrava o controlador logo após a segunda entrega, sem o handoff físico final do Revisor que havia feito explicitamente na primeira tentativa. `Execution.close()` interrompe o acompanhamento não transferido, preservando o resultado aprovado; isso é distinto de uma parada confirmada e está de acordo com US-20.C3/RNF-10. Dois testes determinísticos novos reproduziram as alternativas: close sem handoff conserva o parecer e registra TRACKING_LOST; handoff com confirmação seguido de close preserva estado pronto e recibo de parada. Ajustado apenas o roteiro nativo para exigir handoff de todas as passagens da segunda tentativa e zero recursos sem parada confirmada antes de emitir sucesso. O roteiro pago corrigido não foi repetido e o recibo incerto anterior não foi reescrito. A prova paga anterior comprova sessões/reutilização; cancelamento/perda e guardas físicas têm seus próprios ensaios reais. A classificação do encerramento da fixture foi resolvida sem atribuir falha ao parecer ou presumir parada.
- Zoom nativo: configurações reais do Chrome do perfil MCP alteradas de 100% para 200% pela UI. DPR 2 e `Page.getLayoutMetrics` com zoom 2 confirmaram ampliação real, não apenas viewport menor. Playwright MCP executou UI compilada e HTTP controlado para entrega/preparação/adaptação, sessões/recursos, correção/decisões, busca/comparação/histórico, perfis/capturas, candidatos e encerramento. Assistente inicial passou com viewports físicos 1440x1000, 1280x900 e 1100x800, com ações do rodapé acessíveis e foco contido; nenhuma mutação nesse roteiro. As variantes de zoom usam áreas físicas maiores que as provas mobile a 100%; rótulos desktop/mobile herdados dos roteiros não mudam essa medição.
- Captura visual: algumas imagens produzidas por `page.screenshot` sob zoom ficaram vazias ou cortadas apesar de DOM/geometria válidos; preservadas como evidência insuficiente. A captura direta CDP `Page.captureScreenshot`, sem clip e com `fromSurface=false`, mostrou os diálogos completos e foi inspecionada: `zoom-paint/comparison-native.png` (área CSS 640x360, DPR 2, diálogo/rodapé contidos) e `delivery-native.png` (720x500, DPR 2, rodapé entre y=405 e 474). Capturas de perfis, encerramento e assistente também inspecionadas. Não foi alterado CSS de produção para contornar a captura. `zoom/` contém resultados/roteiros; metadados herdados do script original, como headless ou reviewer independente, não descrevem o executor atual: esta rodada foi main-chat via Playwright MCP com fixtures controladas.
- Compatibilidade: `source-compatibility.json` compara hashes com os manifestos da própria sprint. Todos os 153 arquivos web permanecem idênticos ao manifesto da distribuição final de 24/10; contra o primeiro manifesto da 043, só difere `artifact.css`, pela regra do assistente já comprovada novamente. Os 46 arquivos relacionados à exclusão não mudaram, preservando validade das provas físicas/baseline anteriores; contratos não mudaram. As fontes de execução e recursos de papéis não mudaram, exceto testes. Reutilizadas as provas de conexão/SSE/atividade (`.playwright-mcp/sprint037/result.json`), armazenamento/localização e exclusão em suas superfícies e limites originais, sem promover backend controlado a prova real. Nova cobertura renderizada e de zoom complementa essas provas de domínio.
- Validação final: **1.981/1.981 testes em 169 arquivos**, 115,31 s (`full-suite.log`); 68/68 direcionados de board/execução (`targeted-final.log`); build, typecheck, lint e diff-check aprovados. Distribuição atual novamente aprovada em `distribution.log`, pacote `build/Fábrica distribuição-t5bKAg`, HTTP/assets/SQLite/lock/reinício reais e âncora controlada. A âncora nativa/correção manual tem a prova separada já registrada. Helper Windows atual passou em `.cache/terminal-jobs-1792897379932/result.json`: duas árvores paradas, substituição ativa e identidades/gerações incorretas recusadas. Aviso anterior de bundle acima de 500 kB mantido.
- Identidade final: HEAD `e7cfab89ceeb06581c4ed1d414813621cdd03ba3`, working tree de 603 arquivos `fd35d82d4d60f39c599d58c110fd1ac3cdda930469b87e10556483a2b4814d13`, em `.cache/sprint043/closure-20261024-2348/source-manifest.json`. `summary.json` vincula resultado e limites. Provas pagas mantêm seus próprios manifestos e runtimes; helpers recompilados foram verificados separadamente, sem alegação de igualdade binária.
- Limpeza operacional: zoom do perfil de automação restaurado para 100%/DPR 1, aba de configurações própria fechada, servidor simulado encerrado após conferir identidade do processo e zero listeners em 4310 (`cleanup.json`). Perfil normal do usuário não foi manipulado; recursos privados remotos e itens Maestri preservados. Não há nova chamada de provider autorizada implicitamente por este fechamento.

### Sprint 044 - Regressão integrada e fechamento das evidências

Data: 2026-10-25. Execução direta de `feat-083` e `feat-085` do plano V3 `docs/Docs20261023_014848/sprints20261023_014848.json`. O working tree das sprints anteriores foi preservado. A Sprint 043 e sua matriz de gates são a entrada operacional desta etapa; esta rodada não repetiu efeitos externos nem alterou produção.

Versão avaliada: HEAD `e7cfab89ceeb06581c4ed1d414813621cdd03ba3`, working tree identificado pelo SHA-256 `b913ad2c8f02ca759006705eec839922a7b837a1d7ef9452ab9c26b394025ff6`, manifesto `.cache/sprint044/source-manifest.json` com 958 arquivos não ignorados. O manifesto registra caminhos e hashes, não conteúdo; `SPEC_PROGRESS.md` foi omitido para evitar autorreferência e está identificado pelo hash no recibo `.cache/sprint044/validation.json`.

#### Rastreabilidade consolidada

A SPEC permanece a fonte dos critérios originais. A tabela conecta cada grupo explícito de `US-nn.Cn` às sprints que registram implementação, arquivos, comandos, evidências e limites. Os RF agrupados são os vínculos literais da matriz de stories da SPEC. Para os RNF, a coluna RF preserva a relação definida na SPEC; os registros listados apontam para as evidências específicas. O índice não altera o status de nenhum critério: estados parciais, limites e gates pendentes permanecem conforme registrados nas sprints de origem.

| Story e critérios | RF vinculados | Registros de implementação/evidência |
| --- | --- | --- |
| US-01.C1-C4 - Inicialização e ferramentas | RF-01-06 | Sprints 005-006 e 043 |
| US-02.C1-C4 - Criação com GitHub e Kanban | RF-07-13 | Sprints 007-008, 010 e 043 |
| US-03.C1-C4 - Cadastro incompleto e prontidão | RF-14-17 | Sprints 009-010 e 043 |
| US-04.C1-C5 - Entrega por modo | RF-18-22, 29-31 | Sprints 025-029 e 043 |
| US-05.C1-C4 - Destino local | RF-21, 23-24, 28 | Sprints 023-024 e 043 |
| US-06.C1-C5 - Continuação da entrega | RF-25-31 | Sprints 026-027 e 043 |
| US-07.C1-C4 - Nome de branch e commit | RF-32-35 | Sprint 025 e 043 |
| US-08.C1-C4 - Instruções efetivas | RF-36-40 | Sprints 012-013, 021 e 043 |
| US-09.C1-C4 - Continuidade entre correções | RF-41-44, 47 | Sprints 015-016 e 043 |
| US-10.C1-C4 - Reutilização segura de terminais | RF-45-49 | Sprints 014, 016 e 043 |
| US-11.C1-C3 - Pacote verificável de correção | RF-50-52 | Sprints 017, 022 e 043 |
| US-12.C1-C4 - Revisão por versão | RF-53-56 | Sprints 018 e 043 |
| US-13.C1-C4 - Falta de progresso | RF-57-60 | Sprints 019, 021-022 e 043 |
| US-14.C1-C3 - Contestação rastreável | RF-60-63 | Sprints 020-022 e 043 |
| US-15.C1-C4 - Área gerenciada | RF-64-68 | Sprints 002-004, 011 e 043 |
| US-16.C1-C5 - Exclusão recuperável | RF-69-73 | Sprints 030-032 e 043; `docs/operation/sprint043-gates.md` |
| US-17.C1-C4 - Resumo da entrega | RF-74-75 | Sprints 028-029 e 043 |
| US-18.C1-C3 - Tempo e atividade | RF-76-77 | Sprints 036-037 e 043 |
| US-19.C1-C3 - Notificações locais | RF-78-80 | Sprints 038-039 e 043 |
| US-20.C1-C4 - Encerramento guiado | RF-81-83 | Sprints 040-042 e 043 |
| US-21.C1-C3 - Busca de tentativas | RF-84-85 | Sprints 033, 035 e 043 |
| US-22.C1-C3 - Comparação histórica | RF-86-87 | Sprints 034-035 e 043 |
| US-23.C1-C3 - Indicador de conexão | RF-88 | Sprints 037 e 043 |

Os registros anteriores contêm os caminhos de produção/contratos, os arquivos de teste e prova, e a localização dos resultados por sprint. A evidência operacional transversal está em `docs/operation/sprint043-gates.md`; ela preserva os limites por cenário e não promove ensaios controlados a prova nativa ou externa.

Conferência mecânica do índice contra a SPEC: 23 stories, **88/88** critérios `US-nn.Cn`, **88/88** requisitos RF e **18/18** RNF, sem IDs ausentes ou extras. Resultado em `.cache/sprint044/traceability-check.json`.

| RNF | RF vinculados na SPEC | Registros correlatos |
| --- | --- | --- |
| RNF-01 | RF-73 | Sprints 030-032 e 043 |
| RNF-02 | RF-84-85 | Sprints 033, 035 e 043 |
| RNF-03 | RF-54-55 | Sprints 018 e 043 |
| RNF-04 | RF-02, 39, 78 | Sprints 005-006, 012-013, 021, 038-039 e 043 |
| RNF-05 | RF-26, 36, 81 | Sprints 013, 021, 027, 040-042 e 043 |
| RNF-06 | RF-20-21, 24 | Sprints 023-027 e 043 |
| RNF-07 | RF-69-72 | Sprints 030-032 e 043 |
| RNF-08 | RF-13, 30, 72 | Sprints 007-008, 025-027, 030-032 e 043 |
| RNF-09 | RF-29, 44, 54, 56 | Sprints 015-018, 026 e 043 |
| RNF-10 | RF-13, 47, 77, 80, 83 | Sprints 007-008, 014-016, 036, 038-043 |
| RNF-11 | RF-79-80 | Sprints 038-039 e 043 |
| RNF-12 | RF-06, 16, 70, 74-75 | Sprints 005-010, 028-032 e 043 |
| RNF-13 | RF-69-70 | Sprints 030-032 e 043 |
| RNF-14 | RF-88 | Sprints 037 e 043 |
| RNF-15 | RF-01-05 | Sprints 005-006 e 043 |
| RNF-16 | RF-31, 64-68 | Sprints 002-004, 011, 023-027 e 043 |
| RNF-17 | Todos os domínios | Sprints 001-043; checks integrados desta Sprint 044 |
| RNF-18 | RF-67-68 | Sprints 002-004, 011 e 043 |

#### Regressão integrada e limites

- A suíte integral passou: `npm.cmd test -- --reporter=dot --no-color`, **1.981/1.981 testes em 169 arquivos**. Fronteiras negativas pertinentes estão distribuídas em `tests/integration/http-security.test.ts`, `tests/integration/inference-limits.test.ts`, `tests/integration/attempt-results.test.ts`, `tests/integration/publication.test.ts`, `tests/integration/local-publication.test.ts`, `tests/integration/pr-publication.test.ts`, `tests/integration/project-deletion-http.test.ts`, `tests/integration/notifications.test.ts` e `tests/acceptance/persistence-maintenance.test.ts`. Os casos Windows de link, identidade e caminho permanecem na prova nativa registrada pela Sprint 043.
- `npm.cmd run typecheck` e `npm.cmd run lint` passaram. `npm.cmd run test:http` passou com 4 testes em 2 arquivos. `npm.cmd run test:acceptance` passou com 63 testes em 8 arquivos.
- `npm.cmd run build`, `npm.cmd run test:compiled`, `npm.cmd run test:execution-compiled` e `npm.cmd run test:verification-compiled` passaram. O build conserva o aviso de bundle acima de 500 kB; os smokes usam processos, SQLite e adapters locais e não executam Maestri/OMP.
- `npm.cmd run test:distribution` passou com pacote limpo em `build/Fábrica distribuição-9m27mZ`: assets/API na mesma origem loopback, SQLite nativo, banco no diretório fixo, segundo controlador recusado, dois processos com cwd distintos e reinício com sessão revogada/identidade preservada. O pré-voo da âncora foi controlado; nenhuma sessão Maestri/OMP foi recrutada.
- Atualizados `README.md` e `docs/operation/README.md`: comandos locais configurados, formulários de configuração existentes, modos atuais, permissão explícita e limites das notificações locais, recuperação e encerramento. Foram corrigidas afirmações antigas sobre a indisponibilidade dos formulários e bloqueio de PR; evidências históricas foram mantidas com o limite correspondente.
- A produção não mudou nesta sprint. A identidade do código avaliado permanece compatível com as provas de produção da Sprint 043. Nenhum Git/GitHub externo, provider, terminal Maestri/OMP, staging, commit, push ou publicação foi iniciado.
- `feat-083` e `feat-085` implementados e validados localmente. As conclusões externas continuam limitadas aos cenários explicitamente registrados na Sprint 043; este fechamento não aprova critérios fora dessas evidências.

## Sprint — Gate atual por resultados e vínculo produtor obrigatório [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-28. Escopo: vínculo produtor da revisão, início de revisão sem gate manual, aprovação por evidência completa da versão e progresso estruturado por avaliação independente. Fontes: AGENTS.md, SPEC vigente §§2.1/5/8/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md e documentos da SPEC/PRD/stories em `docs/Docs20261027_205916/`. Mantidos banco e checkout reais sem limpeza ou mutação externa; nenhuma alteração Git de escrita, provider, terminal Maestri/OMP, publicação ou avanço de fase.

- Migration 052 torna `reviews.implementer_passage_id` obrigatório e o vincula por FK composta ao produtor da entrega e ao resultado persistido. Guards validam produtor/revisor, tentativa, rodada, versão, entrega capturada, resultado aceito, passagem viva e conjunto de critérios. O resultado do Implementador também é exigido no resumo interno, DTO HTTP, conversores e consultas. Não há `verification_id` nem ramo alternativo de revisão em contratos ou projeções atuais.
- `beginReview` agora inicia após captura durável e resultado estruturado válido, inclusive com critérios `not_verified`, evidência insuficiente ou erro técnico declarado pelo produtor. Não agenda verificação manual nem exige `verification_runs`, checks aprovados ou artefato. Permanecem os bloqueios estruturais de captura, identidade, tentativa/passagens vivas, critérios e contexto.
- A aprovação exige independência confirmada, resultado Revisor aprovado para a passagem/versão corrente, cada critério atual exatamente uma vez com evidência textual válida e pertinente, e ausência de bloqueantes não resolvidos. A guarda SQL repete os invariantes relevantes; listas de checks ausentes/vazias não constituem reprovação ou aprovação por si só.
- Avaliações de achados são persistidas somente quando correspondem exatamente à avaliação do resultado Revisor aceito e à versão atual. `proven`/`partial` exigem evidência não vazia que corresponda à evidência de critério pertinente do Revisor; `none`/`not_assessable` exigem justificativa sem fabricar progresso. Nenhuma avaliação é sintetizada para completar um resultado; a guarda impede encerrar revisão independente com avaliação raiz pendente. Recorrência, prioridade, bloqueios, resoluções, contestações e imutabilidade continuam cobertos.
- E1 é aplicada sem conversão nem limpeza: migration 052 recusa antes de alterar o schema quando encontra revisões persistidas; o banco permanece intacto. Instalações com tabela de revisões vazia aplicam o schema novo normalmente. Nenhum banco pessoal foi aberto ou migrado. Atualizados inventário de exclusão, fixtures, manutenção/medição e consumidores de consultas/publicação para o novo vínculo.
- Validação: suíte integral **2.061/2.061 testes em 174 arquivos**; typecheck, lint, build e `git diff --check` passaram. `test:compiled` passou com HTTP/SSE/SQLite, lock, encerramento e reinício; sua readiness passou a consultar o health endpoint do processo filho. `test:execution-compiled` passou com fixture Node, declarando `maestriOmpIntegration:not_executed`. O build conserva o aviso conhecido do bundle web acima de 500 kB.
- Limites: não houve prova real Maestri/OMP, GitHub, provider, navegador ou publicação externa; o smoke de execução usa fixture Node e não valida integração nativa. A recusa da migration para bancos com revisões antigas é deliberada por E1. Nenhum staging, commit, push ou próxima sprint.

## Sprint 001 - Gate atual por resultados e vínculo produtor obrigatório [CONCLUIDA]
- Resultado produtor obrigatório na identidade da revisão: Tornar consultável e obrigatório o vínculo persistente entre revisão, entrega capturada e resultado estruturado do Implementador.
- Início da revisão com lacunas ou falhas técnicas: Permitir que a revisão independente avalie resultados formalmente válidos contendo lacunas ou validações inconclusivas.
- Aprovação completa da versão sem gate manual: Exigir evidência pertinente e revisão independente para aprovação, removendo os vínculos exclusivos de verificações antigas da revisão atual.
- Progresso comprovado por avaliação independente da versão: Adaptar finding_assessments às evidências estruturadas aceitas, preservando recorrência, bloqueios e imutabilidade.

## Sprint — Percurso integrado sem executor manual [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-28. Implementação no workspace canônico, consumindo o vínculo obrigatório do produtor da Sprint anterior. Nenhuma dependência foi instalada; não houve provider, terminal Maestri/OMP, GitHub externo, publicação, mudança de fase ou escrita Git.

- O pipeline agora avança do resultado estruturado e da captura Git durável diretamente para a revisão independente. Não agenda nem espera `verification_runs`, não exige `CHECKS_NOT_CONFIGURED` e mantém a etapa histórica `verifying` no contrato. A revisão recebe o `ProducerResult` completo e a identidade da versão, sem conversa do Implementador. O Revisor passa a usar a identidade de evidência do produtor em `ReviewCommandRepetition`; o contrato e as gravações não têm `check_id`. Correções seguem produzindo nova rodada, entrega e revisão próprias, sem herdar aprovação ou inventar checks.
- O contexto do Implementador orienta build, typecheck, lint e testes pertinentes. `ImplementerResult.checks` registra comando em `id`, resultado observado em `outcome` e evidência junto das limitações em `evidence`; causas concretas são registradas quando algo não pôde ser executado. Os checks são resultado da passagem, não comandos de configuração. O detalhe existente consulta esse resultado para a passagem/versão selecionada sob demanda.
- Removidos o módulo e a composição de verificação, leitores de resultado/log, contratos/rotas de histórico e artifacts, adaptadores de materialização exclusivos, smoke compilado exclusivo e estados/textos de verificação manual. Resumo da entrega, histórico, detalhes e publicação deixaram de depender de tabelas ou artifacts manuais. O Revisor permanece vinculado ao resultado do produtor, à captura e à versão; os gates de autoridade e publicação com `git_ref`/`content_identity` aprovados permanecem vigentes. A transição de diretório gerenciado também não consulta mais a tabela `checks` retirada.
- Migration 053 aplica E1: antes de qualquer delta, recusa com erro técnico existente se encontrar linhas em `verification_runs`, `checks`, `artifacts` ou destinos `exclusive_artifact`; a recusa preserva schema, ledger e bytes do banco. Em instalação vazia, remove as três tabelas, o trigger legado de aprovação, o tipo de destino e os eventos de verificação da projeção/intervalos. Preserva `diagnostic_runs.checks_json`, prioridade dos achados, resultados/evidências dos agentes e referências imutáveis. Bancos descartáveis de testes recriam o schema histórico vazio somente para exercitar upgrades anteriores; isso não é leitura ou compatibilidade de produção.
- A configuração e a preparação ainda podem conter definições históricas de checks, mas o percurso atual não as despacha. A retirada desses campos e de `checks_json` da configuração pertence à Sprint 003 conforme o recorte fornecido; diagnósticos operacionais continuam separados.
- Validação final: suíte completa **2.014/2.014 testes em 170 arquivos**, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:compiled` e `npm.cmd run test:execution-compiled` passaram. O smoke compilado do controlador confirmou HTTP/SSE/SQLite, lock, shutdown e reinício; o smoke de execução validou recursos/schema e transporte com fixture Node. Ambos declaram Maestri/OMP real como não executado.
- Prova visual Playwright MCP/Chrome com bundle construído e API controlada: detalhe da tentativa sem a seção “Checks e logs”, evidência do Implementador visível na passagem da versão selecionada e nenhuma requisição a rotas `/checks` ou `/artifacts`; sem `pageerror` observado. O fixture não simula a conexão saudável do stream de eventos, então a prova não cobre o indicador de conexão. Evidência mantida em `.cache/automated-visual/sprint-integrated-no-manual-20261028/`.
- Nota documental: `SPEC20261027_205916.md` §5.1 item 7 ainda descreve leitura de `/checks`, `/artifacts` e vínculo `artifacts.check_id`, em conflito com §3.4/§4.6 E1 e com os critérios explícitos desta sprint, que retiram esses mecanismos. A implementação seguiu o recorte explícito da sprint; a SPEC normativa não foi alterada. Nenhuma integração real ou aceite de provider é inferido pelos testes controlados.

## Sprint 002 - Percurso integrado sem executor manual [CONCLUIDA]
- Progressão da captura para revisão independente: Retirar o acionamento do executor de definições manuais do percurso coordenado e fornecer os resultados produtores ao Revisor.
- Correções e repetições vinculadas à nova versão: Manter o ciclo de correção com validação pertinente, avaliação independente e justificativa de comandos repetidos.
- Entrega aprovada e efeitos sem duplicação: Conservar a publicação da referência aprovada e os bloqueios de autoridade após a mudança do gate técnico.
- Ausência do executor e dos leitores exclusivamente manuais: Retirar os resíduos exclusivos do executor e seus consumidores junto à mudança funcional, sem camada de compatibilidade.

## Sprint 003 - Retirar checks da configuração, preparação, captura e detalhe [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-28. Fontes: `AGENTS.md`, decisão explícita de 28/10 no topo de `SPEC.md` e seção E1 da SPEC em `docs/Docs20261027_205916/`, contratos atuais e progressos das sprints 001–002. Preservadas as alterações preexistentes. Nenhuma dependência, migração de banco operacional, execução Git, provider, terminal Maestri/OMP, publicação ou avanço de fase.

- `ProjectConfiguration`, `ProjectChanges` e `ConfigurationUpdate` deixaram de expor `CheckDefinition`; os codecs privados de configuração e preparação, `ChoiceOrigins`, `PreparationOverrides`, `PreparationChoices` e `EffectiveConfiguration` não carregam mais definições nem origem `checks`. Saves novos persistem apenas os campos restantes. `project_revisions.checks_json` já é removido pelo delta 053; removido o escritor condicional que voltava a inserir `[]` em schemas antigos. Nenhuma conversão ou leitor histórico de definições foi adicionado.
- Preparações, novas capturas e sua configuração efetiva permanecem sem definições manuais. O início controlado confirma hash/revisão atuais e chega ao despacho sem campo de checks. A restauração de rascunho ignora o caminho retirado e regrava os outros campos editados, sem conservar o valor obsoleto.
- `DeliverySummaryView` e sua projeção SQL não consultam verificações manuais nem expõem `checks_succeeded`/`checks_total`. `DeliverySummary` não mostra “Checks aprovados”. O `ProjectForm` não oferece editor/controles manuais ou estilos exclusivos, e o `PreparationDialog` não mostra uma seção vazia. A comparação histórica não rotula checks. Resultados, evidências e justificativas de repetição declarados pelo agente permanecem vinculados à tentativa/versão e consultáveis sob demanda.
- Rotas reais de `createApp` rejeitam propriedades retiradas diretas, aninhadas, combinadas e tipos numéricos coercíveis antes de qualquer revisão/operação/evento/execução. Testes também conferem save/reopen da configuração restante, JSON atual de preparação/captura, schema sem a coluna, sumário sem contadores, descarte de draft antigo e ausência de controles renderizados.
- Fixtures de testes que dependiam de escrever configurações antes do delta 053 foram ajustadas para o schema corrente; os casos sem projeto que verificam recusa de migração com dados de verificação permanecem. Nenhum banco real foi limpo, convertido ou migrado.

### Validação desta sprint

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, inclusive contratos, armazenamento, React e testes. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| Testes direcionados de configuração, preparação, tentativa, sumário e React | Exit 0; 198 testes em 7 arquivos. |
| Testes direcionados de reabertura, exclusão, filas, captura e scaffold afetados por fixtures E1 | Exit 0; 159 testes em 8 arquivos. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **2.010 testes em 170 arquivos**, sem falhas ou pendências. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web compilados. Bundle JS 1.172,44 kB (gzip 292,91 kB). |
| Playwright MCP/Chrome, bundle de produção | Passou com APIs sintéticas: preparação sem seção/controles manuais; resumo preserva critérios, revisão independente e referência aprovada, sem contagem de checks. `pageerror` vazio. Capturas em `.cache/sprint-checks-retirement/`. Uma execução exploratória do roteiro amplo parou numa asserção de texto de erro de preparação desatualizada; a prova final ficou limitada às superfícies desta sprint e não confirma esse estado de erro. |
| `git diff --check` | Exit 0; avisos de normalização CRLF do Git, sem erros de whitespace. |

A primeira execução integral reprovou oito casos de migração que criavam projetos em schemas anteriores à retirada de `checks_json`; após adaptar/remover esses fixtures incompatíveis com E1, a repetição integral passou. A validação no Chrome usa a aplicação compilada e endpoints inteiramente interceptados; não equivale a integração real de Maestri/OMP, GitHub ou publicação. O servidor estático próprio foi encerrado e a porta 4310 ficou livre. Nenhuma revisão de referência imutável, aprovação ou mudança de fase foi presumida.

## Sprint 003 - Retirar checks da configuração, preparação, captura e detalhe [CONCLUIDA LOCALMENTE]
- Configuração sem definições: Remover tipos, codecs, escrita compatível e superfície de edição, mantendo a rejeição estrita dos campos retirados.
- Preparação e captura sem checks manuais: Preservar escolhas restantes, revalidação/hash e resultados por valor.
- Resumo sem contadores manuais: Remover os contadores e a linha da UI preservando critérios, parecer, referência e evidências do agente.

## Sprint 003 - Retirar checks da configuração, preparação, captura e detalhe [CONCLUIDA]
- Configuração ativa sem definições manuais: Eliminar definições manuais dos contratos, gravações e projeções de configuração, com rejeição explícita de propriedades retiradas.
- Preparação e captura sem cadastro de checks: Retirar definições, overrides e origens de checks das preparações e novas capturas de tentativa.
- Formulário e resumo sem superfícies do mecanismo removido: Eliminar os editores manuais e os contadores de checks do resumo de entrega, preservando o acesso às evidências dos agentes.

## Sprint — Retirar prioridade numérica da fila de ponta a ponta [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-28. Fontes: `AGENTS.md`, SPEC da configuração inicial em `docs/Docs20261027_205916/SPEC20261027_205916.md` (US-04, RF-22–28/32, RNF-03–06), contratos correntes, GLOSSARY e as superfícies indicadas na tarefa. E1 aplicado sem migração, conversão, leitor de compatibilidade ou abertura/limpeza de banco operacional. Sem dependências novas, escrita Git ou efeitos externos.

- `QueueOrder` ativo, revisões novas, JSON de configuração, hash do comando e capturas contêm somente `use_board_position`. `queue_order_json` permanece para essa opção. A decodificação é fechada; documentos antigos com escolhas numéricas não são convertidos nem projetados. Saves e reopen atuais preservam apenas a opção; a captura de tentativa também sela somente esse booleano.
- `projects/queue.ts` ordena projetos por ID. Para cada projeto, usa posição ascendente somente quando a opção está ligada e a lista completa contém posição documentada para todos os itens, inclusive inelegíveis e além da página visível. Caso contrário, todo o projeto usa número crescente, nulos por último e ID de issue/item para desempate. Valores de campo numérico não entram na consulta do resumo, critério, valor do item ou `summary_hash`. O hash inclui os candidatos na sequência efetiva e uma mudança de sequência retorna o conflito atual antes de gravar ou consumir.
- GitHub não carrega mais definições numéricas de Project nem valores numéricos de campo; `numberFields`/`numberValues` foram retirados dos modelos e da projeção HTTP de opções. O fragmento de valor numérico pede somente o ID opaco para deduplicar a paginação da conexão `fieldValues`; não solicita o número ou o campo. A consulta preserva campos single-select, cursores e diagnósticos. Prioridade dos achados e diagnósticos operacionais não foram alterados. A forma da conexão foi conferida na [referência GraphQL de Projects](https://docs.github.com/en/graphql/reference/projects) via Context7.
- `ProjectForm` conserva somente “Usar posição do quadro”. Rascunhos antigos descartam os dois caminhos retirados durante restauração/rebase e a montagem de PUT projeta somente o booleano. `QueuePanel` e `QueueEnableSummary` exibem a descrição de ordem recebida; os controles numéricos e textos antigos de prioridade foram removidos sem nova explicação de fallback ou confirmação.
- Regressões cobrem projetos múltiplos, posição completa/parcial/ausente/desabilitada, item arquivado sem posição fora da página, posições empatadas, itens sem número/issue, alteração numérica sem mudança de projeção, alteração da sequência com rejeição da autorização anterior, GET sem consumo, rejeição HTTP de campos diretos/aninhados isolados/combinados, gravação/reopen, captura e rascunho obsoleto.

### Validação desta sprint

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| Testes direcionados iniciais | Exit 0; 221 testes em 7 arquivos. A regressão final de `QueueEnableSummary` passou também em 5/5 testes direcionados. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **2.014 testes em 170 arquivos**, sem falhas ou pendências. |
| `npm.cmd run build` | Exit 0; controlador, recursos e web compilados. Bundle JS 1.172,17 kB (gzip 292,95 kB); permanece o aviso de chunk acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, lock, shutdown e restart do controlador compilado; preflight Maestri/OMP controlado. |
| Playwright MCP/Chrome | Build final com APIs sintéticas: configuração mostra o checkbox de posição sem controles numéricos; Fila e diálogo de habilitação exibem a descrição do servidor sem menção à prioridade. Nenhum PUT da fila foi enviado. A fixture SSE é finita e o indicador de conexão não foi avaliado nesta prova. A primeira fixture omitiu `source`/ETag e gerou estado de erro; outra usou prazo de polling já vencido. Após corrigir a fixture e reiniciar a página, as verificações finais passaram; esses erros não foram atribuídos ao produto. |
| `git diff --check` | Exit 0; somente avisos existentes de normalização CRLF, sem erros de whitespace. |

A suíte não executa GitHub real, provider ou Maestri/OMP; a prova visual usou respostas API controladas. Não houve alteração de banco operacional, migration, conversão de dados antigos, staging, commit, push, aprovação ou mudança de fase. O preview estático próprio foi encerrado e a porta 4310 ficou livre.

## Sprint 004 - Retirar prioridade numérica da fila de ponta a ponta [CONCLUIDA]
- Sequência determinística pelos critérios preservados: Aplicar exclusivamente ID de projeto, posição condicional completa, número e identidade da issue/item.
- Hash atual e consumo protegido: Preservar autorização da sequência efetiva e as barreiras contra inícios ou efeitos duplicados.
- Contratos e gravações somente com use_board_position: Eliminar escolhas numéricas de prioridade da configuração e de todos os documentos ativos pertinentes.
- Formulário e apresentação da fila simplificados: Retirar os controles numéricos e conservar a operação da fila pelos critérios recebidos do servidor.

## Sprint — Retirar comparação preservando consulta individual [IMPLEMENTADA E VALIDADA LOCALMENTE]

Data: 2026-10-28. Implementação no checkout canônico, preservando as alterações anteriores das sprints 001–003. Sem migration, dependência nova, execução de provider, alteração Git de versionamento ou efeito externo.

- Removidos o endpoint `/api/v1/attempt-comparisons`, contratos internos/HTTP, conversores, método público de Storage/Queries, projeção SQL e módulos de storage e UI exclusivos. O GET autenticado da rota retirada recebe o 404 global, sem redirecionamento. A seleção em par, diálogo, textos e estilos foram removidos; `Consultar` e `Nova tentativa` permanecem.
- Busca e histórico individuais permanecem. Filtros combinados de projeto, resultado, número, título literal e período incluem caso cuja correspondência está fora da primeira página; paginação e cursor são aplicados depois dos filtros. A navegação mantém o filtro aplicado separado do rascunho, e Buscar/Limpar/Atualizar reiniciam a continuação. Datas de fronteira e DST, validação de fusos/períodos e aliases continuam recusados nos contratos existentes.
- Detalhe e rodadas seguem consultáveis. A regressão de retry confirma `previous_attempt_id`, nova identidade, captura e clone, sessões lógicas/diretórios distintos e preservação do resultado/captura anteriores. Não há conversão ou compatibilidade para os dados exclusivos de comparação.

### Validação observada

| Check | Resultado |
| --- | --- |
| Typecheck | `npm.cmd run typecheck`: exit 0. |
| Lint | `npm.cmd run lint`: exit 0; fronteiras e convenções aprovadas. |
| Testes direcionados | 52 aprovados em cinco arquivos de busca HTTP/SQLite, rota hash, ações da lista e retry. |
| Suíte completa | `npm.cmd test -- --reporter=dot --no-color`: **2.012 testes em 169 arquivos**, sem falhas ou pendências. |
| Build | `npm.cmd run build`: exit 0; controlador, recursos e bundle web compilados. Bundle JS 1.161,57 kB (gzip 290,31 kB), acima do aviso configurado de 500 kB. |
| Playwright MCP/Chrome | Assets finais e API sintética: controles comparativos ausentes, ações individuais presentes, página 2 e retorno, busca de título, URL de comparação recusada, zero requisições à rota removida e zero `pageerror`. A primeira repetição usou seletor ambíguo para os 25 títulos iguais; corrigido no roteiro, o percurso final passou. Servidor estático próprio encerrado; porta 4310 livre. |
| `git diff --check` | Exit 0; somente avisos de normalização CRLF já existentes. |

O teste da rota compara o envelope `NOT_FOUND` do handler global e ausência de `Location`; consultas individuais de tentativa e rodadas retornam 200. O navegador usa API controlada e não substitui integração de produto. Nenhuma aprovação, mudança de fase, staging, commit ou push foi simulada.

## Sprint 005 - Retirar comparação preservando consulta individual [CONCLUIDA]
- API e consultas sem projeção comparativa: Retirar rota, contratos, conversores, exports e consultas usados exclusivamente para comparar tentativas.
- Lista sem seleção ou diálogo comparativo: Eliminar controles, estado, navegação, requisições e estilos exclusivos da comparação.
- Regressão da busca e da continuidade individual: Comprovar os percursos preservados após a retirada dos consumidores comparativos.

## Sprint — Regressão local única e conferência do schema final [VALIDADA LOCALMENTE; UMA PROVA NATIVA AMPLA FALHOU]

Data: 2026-10-28. Fontes: `AGENTS.md`; SPEC da configuração inicial `docs/Docs20261027_205916/SPEC20261027_205916.md` (RF-09/15/19/20/26–33, RNF-01–09 e E1); GLOSSARY; INTEGRACAO-MAESTRI-OMP; contratos e políticas vigentes. HEAD observado por `git log -1`: `4710d59c1b342c59f43fdc3074b5897ec5c8e340`; o working tree já continha alterações das sprints anteriores, todas preservadas. Não foi feito commit ou push do checkout canônico, migração do banco operacional, chamada externa ou início de outra sprint.

- `tests/native/persistence-references.mjs` projeta, sem imprimir conteúdo, referências e hashes de configurações globais/de projeto, perfis, revisões, preparação, captura, tentativa, rodadas, passagens, resultados/evidências, refs Git, pareceres/achados/resoluções/avaliações e recibos originais. `persistence-recovery.proof.ts` usa o armazenamento temporário criado pelo caminho normal, rejeita mudanças no conjunto estável e compara o manifesto antes/depois de três controladores compilados em PIDs distintos, encerrados por SIGKILL. O cenário tem duas rodadas (parecer inicial rejeitado e segunda versão aprovada), duas capturas e quatro resultados oficiais; o diff continua ligado à versão aprovada depois do reinício.
- A prova registra schema 53, `integrity_check=ok`, zero violações de FK e ausência de `verification_runs`, `checks`, `artifacts` e `exclusive_artifact` na inicialização e nas três reaberturas. O hash de referências permaneceu idêntico nos três processos; foram preservados IDs e conteúdo de duas versões, oito conjuntos de evidência de critérios, dois pareceres, um achado/resolução/avaliação e os cinco recibos de operação originais. A fixture remove somente a implementação temporária após o gate existente; nenhuma exclusão de projeto/dado operacional foi executada.
- `storage.test.ts` acrescenta recusa pelo `openStorage` do schema 52 com dados retirados e compara os bytes do banco antes/depois. A barreira `inspectHistory` já fazia essa sondagem na conexão somente leitura e `applyMigrations` a repete transacionalmente; a implementação de produção foi preservada. O inventário relacional final continua conferindo todas as tabelas STRICT, ausência de `checks_json`, ausência de `exclusive_artifact` e ausência de triggers que consultem as tabelas retiradas.
- `persistence-maintenance.test.ts` amplia a medição existente de cache 0/16/64 MiB para primeira página, página seguinte, busca sem resultado e detalhe sob demanda. Lista e polling continuam sem captura/resultados/pareceres completos; páginas e payloads permaneceram estáveis, sem IO em `work/` ou `git/`, banco/WAL/SHM proporcional ao cache ou auxiliares inesperados. SQLite de 4.096 bytes, WAL de 3.036.472 bytes, payloads fixos por superfície e latências observadas constam em `.cache/persistence-proof-mWAMmU/report.json`; são medições locais, sem novo limite de latência ou SLA.
- `scripts/persistence-proof.mjs` valida os relatórios de inicialização, integridade, identidades e recuperação e executa apenas os dois relatórios nativos exigidos por esta prova. `scripts/prove-storage-browser.mjs` foi alinhado ao `queue_order` atual, sem propriedades numéricas retiradas. Não foram adicionadas migrations, dependências, serviços, benchmarks ou leitores de comparação/verificação manual.

### Validação observada

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, cliente, testes e scripts. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **2.014 testes em 169 arquivos**, sem falhas ou pendências. |
| `npm.cmd run build` | Exit 0; controlador, recursos e bundle web. Bundle JS 1.161,57 kB/gzip 290,31 kB, acima do aviso de 500 kB. |
| `npm.cmd run proof:persistence` | Exit 0; `local_persistence_and_process_recovery_passed`, relatório `.cache/persistence-proof-mWAMmU/report.json`; 52 testes do recorte de persistência/fronteiras e as provas nativas de composição e reinício passaram. |
| `npm.cmd run test:persistence` | Exit 0; 52 testes em cinco arquivos, incluindo cache, integridade, rejeição de schema e relatórios. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite, sessão, CAS/idempotência, lock, shutdown e restart; preflight Maestri/OMP controlado. |
| `npm.cmd run test:http` | Exit 0; quatro testes em dois arquivos. |
| `npm.cmd run test:execution-compiled` | Exit 0; framing/UTF-8/EOF e launcher com Node de fixture; Maestri/OMP real não executado. |
| `npm.cmd run test:acceptance` | Exit 0; 64 testes em oito arquivos. |
| `npm.cmd run test:distribution` | Exit 0; pacote relocado, assets/API/SQLite, exclusividade do controlador e reinício preservando identidade. Âncora Maestri/OMP controlada. |
| `git diff --check` | Exit 0; somente avisos de normalização CRLF existentes. |

**Limitação de ensaio nativo amplo:** `npm.cmd run test:maintenance-native` compilou, e `maintenance.proof.ts` e a nova recuperação de persistência passaram; quatro casos preexistentes de `delivery-target.proof.ts` falharam quando a fixture tentou `git push` para um bare repo temporário (`exit 128`). O teste não produziu diagnóstico além de `fixture git failed: push`. Esse comando não alterou o checkout canônico nem usou remoto; a fixture temporária foi removida pelo `afterEach`. A mesma fixture foi repetida duas vezes para diagnóstico e continuou falhando. Não será executada novamente sob a restrição de Git somente leitura. A suíte ampla não foi repetida; `proof:persistence` conserva os dois relatórios nativos pertinentes, passou integralmente e não inclui essa fixture de entrega por Git.

As regressões HTTP/SQLite da suíte cobrem Host/Origin/sessão/CSRF, campos retirados isolados/aninhados/combinados antes de escrita ou adapters, CAS/ETag/idempotência, resultados tardios, logs sem secrets, busca/listagem/resumo leves, notificações, prioridade de achados, pausa/retomada da fila e deduplicação de publicação. As verificações de comparação/verificação manual/prioridade antigas que permanecem em migrations e testes são guardas/assertivas de remoção; `ProjectForm` apenas descarta strings de caminhos obsoletos ao restaurar/rebasear rascunhos e não carrega nem reenvia seus valores. Não há rota, import de módulo ou produtor ativo dessas superfícies. Não houve Playwright, GitHub real, provider Maestri/OMP ou alteração de configuração operacional. Remoções ocorreram somente em diretórios SQLite/filesystem temporários das fixtures; nenhuma exclusão em instalação ou pasta de projeto do operador foi executada. Sem staging, commit, push remoto, aprovação ou mudança de fase.

## Sprint 006 - Regressão local única e conferência do schema final [CONCLUIDA]
- Perímetro HTTP e rejeição sem efeitos: Consolidar casos positivos e negativos nas superfícies alteradas sem ampliar autoridade.
- Persistência atual e custo limitado das consultas: Verificar continuidade após reinício e ausência de cópia de caches para persistência ou respostas comuns.
- Regressão integrada e comandos finais executáveis: Validar o checkout resultante com os checks configurados e preservar funções compartilhadas sensíveis.

## Sprint — Gate de UI existente após as remoções [CONCLUÍDA LOCALMENTE; APIs CONTROLADAS]

Data: 2026-10-28. Fontes: `AGENTS.md`, decisão E1 no topo de `SPEC.md`, `docs/Docs20261027_205916/SPEC20261027_205916.md`, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md` §4, contratos correntes e instruções desta sprint. Alterações anteriores preservadas; sem instalação, migração operacional, Git/GitHub, provider, Maestri/OMP, publicação ou mudança de fase.

- `ProjectForm.tsx` não reconhece mais nomes de caminhos retirados ao restaurar ou rebasear rascunhos. A rebase aceita somente campos atualmente editáveis, e `configurationCommand` projeta explicitamente os campos ativos. Saves correntes continuam preservando os rascunhos ao receber conflito ou falha; a regressão exercita caminho não suportado sem ler/converter os mecanismos retirados. `project-readiness.test.ts` e `configuration-requests.test.ts` cobrem essa fronteira.
- `QueuePanel.tsx` recebeu somente a separação textual `·` entre a descrição de ordem retornada pelo servidor e a frase existente sobre projetos bloqueados, para evitar que fossem exibidas como uma frase concatenada.
- `tests/browser/ui-removal-gate.playwright.js` é a prova executada pelo Playwright MCP/Chrome. A distribuição foi compilada e servida em `127.0.0.1:4310` por Vite Preview; a página requisitou `index-CgQwicAS.js` e `index-CK1Sh9xa.css`, ambos com HTTP 200. SHA-256 observado no Chrome: JS `065a6bd7a60869897fee0e6b11368ecfbfdc19dc970837b1a0d3b25aa83452ae` (1.162.345 bytes); CSS `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7` (103.595 bytes).
- Com APIs inteiramente controladas, passaram: ausência de editor manual, comparação e controles numéricos de prioridade; save/reopen da configuração, conflito com rebase e falha mantendo rascunho; preparação; busca por título e paginação; consulta do detalhe reprovado e aprovado com estado distinto; consulta sob demanda do `producer-result` da versão e exibição da evidência do Implementador; resumo sem “Checks aprovados”; Nova tentativa com vínculo da tentativa anterior; ausência de requisições a comparison/check/artifact manuais e de campos retirados nos bodies; posição completa, fallback por número e invalidação da autorização antiga após conflito de hash. Foram sete mutações de produto interceptadas (quatro PUTs de configuração, dois POSTs de preparação e um PUT da fila); nenhum efeito chegou ao controlador.
- Teclado conferiu foco inicial, percurso por Tab, Escape e retorno ao acionador. Viewports: 1440×1000, 1100×480 e 390×640, todos em DPR 1/zoom 100%; as dez medições mantiveram `documentWidth <= innerWidth`. As oito ações conferidas ficaram dentro da viewport. Catorze capturas finais estão em `.cache/ui-removal-gate-20261028/`; o resultado completo, com geometria, foco, assets, requests e limites, está em `result-final.json`.
- Validação: `npm.cmd run typecheck` e `npm.cmd run lint` passaram; **91 testes em 7 arquivos** de projeto/readiness, serialização, busca, detalhe, hash, fila e scheduler passaram; `npm.cmd run build` passou. Bundle JS 1.162,34 kB (gzip 290,46 kB), mantendo o aviso existente acima de 500 kB. `node --check tests/browser/ui-removal-gate.playwright.js` passou.

Limites: Vite Preview serviu a UI compilada; sessões, projetos, tentativas, resultados, evidências, ordem da fila e conflitos foram sintéticos. Isso comprova DOM, teclado, navegação, serialização e a projeção visual das duas ordens; não comprova o cálculo backend da fila, controller/SQLite real, GitHub, Windows nativo, OMP/Maestri, provider ou publicação. O EventSource foi estabilizado por fixture; seu estado de conexão não é parte deste aceite. O navegador de teste e o preview próprio foram encerrados após a prova; a porta 4310 foi conferida livre. Nenhuma tela, componente ou estado visual novo foi criado.

## Sprint 007 - Gate de UI existente após as remoções [CONCLUIDA]
- Prova funcional das remoções e percursos preservados: Verificar DOM, foco, rede e operação real das telas alteradas na versão compilada entregue.
- Prova de teclado, dimensões e estabilidade visual: Conferir as condições de usabilidade normativas nas superfícies efetivamente alteradas.

## Sprint 008 V4 — Matriz final e gates [REGISTRO PREPARADO; APROVAÇÃO E GATES EXTERNOS PENDENTES]

Data: 2026-10-28. Reabertura final do plano V4 após o feedback do Evaluator. Referência de código: `git log -1` = `4710d59c1b342c59f43fdc3074b5897ec5c8e340`; validações executadas sobre esse HEAD mais o working tree não commitado. Alterações desta reabertura foram documentais; mudanças de implementação já presentes no working tree foram preservadas.

- `SPEC.md` registra precedência V4/E1, a retirada de US-22/RF-86/87, a preservação da busca US-21/RF-84/85, validação pertinente e resultado próprio do Implementador por versão corrigida. `DeliverySummaryView` não tem `checks_succeeded`/`checks_total`; `QueueOrder` e `ProjectChanges` usam somente `use_board_position`, com cálculo/fallback residual descrito por projeto e sem pedir mensagens, rótulos, estados visuais ou explicação nova na UI.
- `INTEGRACAO-MAESTRI-OMP.md` e `GLOSSARY.md` descrevem validações técnicas pertinentes, evidências do resultado estruturado, revisão independente e entrega pela referência aprovada sem cadastro ou executor manual. E1 permite banco limpo sem exigir readers/check_id/branches antigos; registros atuais são conservados. Documentos/provas históricos não foram reescritos.
- `docs/Docs20261027_205916/v4-final-acceptance-matrix.md` mapeia cada um dos 25 critérios US, 33 RF, 9 RNF e os 12 critérios de feat-024/025/026, com implementação, prova ou pendência. Separa testes locais, suíte, build, browser controlado, Windows nativo, Maestri/OMP e publicação.

### Revalidação técnica local

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 2.014 testes em 169 arquivos, sem falhas; duração observada 110,83 s. |
| `npm.cmd run build` | Exit 0; 409 módulos web transformados. JS 1.162.345 bytes (1.162,34 kB; gzip 290,46 kB), CSS 103.595 bytes (gzip 18,44 kB). O bundle JS supera 500 kB; sem falha de build. |
| `npm.cmd run test:compiled` | Exit 0; controller compilado com HTTP/SSE/SQLite reais locais, CAS/idempotência, shutdown, process lock e restart; âncora Maestri/OMP controlada; integração real não executada. |
| `npm.cmd run test:execution-compiled` | Exit 0 em Windows; transporte UTF-8/EOF/diagnósticos e lançamento PowerShell passaram com fixture Node. Saída declara `windowsLaunch=passed_with_node_fixture` e `maestriOmpIntegration=not_executed`. |
| Browser controlado | Evidência anterior da Sprint 007 reutilizada porque os assets permanecem idênticos; APIs foram controladas e browser não foi reaberto nesta revalidação documental. JS `index-CgQwicAS.js`, SHA-256 `065a6bd7a60869897fee0e6b11368ecfbfdc19dc970837b1a0d3b25aa83452ae`; CSS `index-CK1Sh9xa.css`, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`. Não prova Maestri/OMP nem publicação. |
| `git diff --check` | Exit 0; warnings de normalização CRLF existentes, sem erros de whitespace. |

### Gates ainda pendentes

- Maestri/OMP real: não executado. Requer autorização de alvo, perfil/modelo e limite de custo; smoke local/controlado não substitui o ciclo real, nem a correção com nova rodada, revisão própria, sessões e consultas do produto.
- Publicação real: não executada. Requer autorização específica, destino e referência aprovada. Nenhum efeito externo ou substituto por mock/202 foi usado.
- Aprovação da validação do plano: reaberta em `docs/Docs20261027_205916/sprint-validation20261027_205916.md` e permanece pendente. Aprovação é pré-condição; este registro não avança gate nem atribui status completo à Sprint 008.

Sprint 008 permanece sem status completo até aprovação e decisão/prova dos gates exigidos. Não houve staging, commit, push, publicação, abertura/limpeza de banco real, exclusão de dados reais, cópia concorrente ou pipeline de auditoria arquitetural.

### Revalidação técnica adicional após o feedback do Evaluator

Data: 2026-10-28. HEAD mantido em `4710d59c1b342c59f43fdc3074b5897ec5c8e340`, mais o working tree existente. Rodada executada a pedido do usuário; esta nota acrescenta a evidência mais recente sem substituir os registros anteriores.

| Comando/prova | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript aprovadas. |
| `npm.cmd run build` | Exit 0; Vite 8.3.4, 409 módulos transformados; mesmos assets e tamanhos registrados acima. |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; 2.014/2.014 testes em 169 arquivos; 114,96 s. |
| `git diff --check` | Exit 0; avisos de normalização CRLF existentes, sem erro de whitespace. |

Esta rodada comprova somente validação técnica local. Maestri/OMP real e o cenário real de correção continuam sem autorização de alvo, perfil/modelo e custo; a aprovação da validação do plano continua pendente no mecanismo próprio. Nenhum gate externo foi promovido e Sprint 008 permanece sem status completo.

### Ciclo real autorizado no chat — 2026-10-28, 13:34–13:39

Após autorização explícita do usuário, executado `npm.cmd exec -- vitest run --config vitest.sessions.config.ts --reporter=verbose` pelo Shell #5 do Maestri, com a build atual concluída. Resultado: exit 0, 1/1 teste, 314,99 s. Evidências em `.cache/session-real-1793205251471/result.json`, `progress.json`, `bridge-trace.json` e banco/sessões do diretório `factory-attempt-vrAXOW`; log em `.cache/v4-real-cycle.log`.

- OMP/provider reais `openai-codex/gpt-6-luna/high`: seis passagens, duas conversas separadas preservadas ao longo de três versões no mesmo checkout. Implementação inicial, duas correções, duas rejeições e aprovação independente final; conteúdo observado de `value.txt`: 1, 2 e 3. Captura Git, SQLite, integridade e parada por Windows Jobs reais. Ambos os terminais próprios foram observados parados no feed Wire após o teste.
- Houve intervenção operacional na segunda revisão: o agente repetia payloads recusados porque a evidência de assessment `proven` não estava reproduzida literalmente na evidência de um critério relacionado, exigência de `recordAssessments`. A orientação foi enviada na mesma sessão; o agente reenviou suas observações e o contrato aceitou. Nenhum resultado foi inserido diretamente nem validação relaxada. A execução não foi totalmente autônoma.
- Limites: tarefa mínima e rejeições deliberadamente roteirizadas para exercitar as correções; autoridade/efeitos GitHub controlados pelo fixture. O roteiro usa `ImplementerResult.checks=[]`, portanto não comprova produção real de registros de comandos de validação nem justificação de repetição pelo Revisor. O encerramento observado é `publishing` após aprovação, sem publicação real. UI/HTTP completos, retry como outra tentativa, publicação externa e aprovação formal do plano não foram comprovados por este ciclo. A Sprint 008 permanece sem aceite completo.
