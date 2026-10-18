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
