# Medição backend anterior à otimização

Reprodução: `npm.cmd test -- tests/integration/observation-backend.test.ts tests/integration/observation-baseline.test.ts --reporter=dot`.

Fontes: SPEC de produto §§8.4/8.5/10.2 e SPEC C4 do run `20261021_150214-1ec379`, F2, Tests/D4. Não altera política de cache, orçamento, throttle, três workers, transações ou interfaces de produção.

## Pontos medidos

`BackendMeasurement` é exclusivamente de teste. AsyncLocalStorage atribui spans à observação/finalidade mesmo quando as promises se sobrepõem. Retém somente identificadores sintéticos, categoria, nome fixo da operação, instantes monotônicos, término e contagens. Não retém queries SQL/GraphQL, bindings, bodies, headers, argv ou ambiente.

- HTTP: Fastify inject atravessa `installQueueRoutes`, query e serializador públicos reais. O port Projects encaminha ao createQueue real da fixture. Esta prova não exercita socket, sessão técnica ou browser.
- GitHub lógico: os quatro métodos da dependência QueueGitHub têm spans próprios, por finalidade. As páginas dessa fixture continuam identificadas como sintéticas, conforme o protocolo anterior.
- GraphQL físico: o percurso HTTP usa createQueue, cliente GitHub, GraphQLReader.scope/query e collect reais com GhRunner controlado (`wire: true`). `runner()` inicia o contador somente no callback onSend existente. Recusa do contexto antes desse callback não é envio. As contagens correspondem às páginas enviadas ao runner sintético, sem execução de GH nativo ou rede GitHub.
- SQL: hooks temporários no prototype de Statement contam all/get/run em cada execução, incluindo statements preparados anteriormente e reutilizados, sucesso e falha. Database.exec é uma categoria separada: uma chamada pode conter várias instruções SQL. Preparação que falha antes de executar não incrementa execução. Setup, migration, seed e teardown ficam fora do contexto medido. Primitives internas de transação do driver não são inferidas como chamadas JavaScript adicionais.

Hooks são restaurados em finally. Não há dependência, callback ou overhead acrescentado ao produto. A medição acrescenta relógio, registro em memória e contexto assíncrono ao ensaio: os tempos instrumentados não são benchmark do runtime sem instrumentação.

## Duração e pressão

O relatório separa duração inclusiva de cada request HTTP, janela entre primeira dependência e último término e soma do trabalho das dependências físicas. A janela contém eventuais lacunas e não pretende reconstruir um grafo causal completo. O caminho crítico observado da request é seu intervalo inclusivo; nunca a soma dos workers. Uma prova com relógio controlado produz duas requests de 10 ms sobrepostas, janela de 10 ms e trabalho de 20 ms. São valores de controle, não latência externa.

Pico por layer/operação pode ser consultado por observação ou agregado. Duas observações independentes confirmam três leituras de issue por observação e seis agregadas, sem aumentar o limite do produto. Contagens success/failure/timeout/cancelled/pending são distintas; pending é consultável enquanto o gate permanece fechado. Sucesso do transporte significa retorno do runner; HTTP 403 e resposta parcial continuam falhas semânticas no resultado público de GraphQLReader/collect, sem convertê-las em sucesso da observação.

Abort web é um sinal explícito da seam de teste, separado do trabalho remoto. A conclusão posterior permanece contada e marcada afterAbort. Não se alega interrupção remota. O teste do callback onSend também confirma drenagem depois desse sinal. Não foi exercitado fechamento TCP de navegador real.

## Oráculo e repetição independente

Cada execução cria SQLite novo usando a mesma fixture e fecha banco/app ao terminar. O oráculo compara respostas serializadas públicas em três páginas de sete itens (20 itens no total), mantendo ordem, campos, elegibilidade, completude, validade, totais, nulls, diagnósticos e fronteiras. Não consulta cache para decidir equivalência.

Normalizações enumeradas:

1. UUIDs dos dois projetos: mapeamento bijetivo por ordem real dos UUIDs. A fixture associa identidades sintéticas nessa mesma ordem antes de montar issues, preservando o desempate usado pelo produto; nunca ordena a resposta para esconder divergências.
2. observation_id: presença e tipo string conferidos em toda página; substituído somente por marcador de comparação entre bancos.
3. summary_hash: formato hexadecimal de 64 caracteres conferido em toda página; estabilidade na releitura aquecida e invalidação após mudança de configuração e conta verificadas na própria execução.
4. next_cursor não nulo: usado integralmente na próxima request da própria execução; relação has_more/next_cursor e três fronteiras conferidas antes da normalização. Não transportado entre bancos distintos.

5. event_cursor: sequência local de cada banco; formato decimal conferido antes da normalização.
6. observed_at_ms e polling.next_poll_at_ms: instantes normalizados, com presença positiva do primeiro e relação next_poll_at_ms >= observed_at_ms verificadas na jornada.

ETag precisa permanecer estável na releitura aquecida e mudar após alteração de configuração; não é artificialmente igualado entre instalações independentes. Cursor inválido produz QUEUE_CURSOR_INVALID; continuação anterior à alteração produz QUEUE_CHANGED. collect preserva resultados de páginas extras, IDs repetidos, cursor repetido, acesso negado e falha intermediária; contexto ausente, throttle compartilhado e orçamento têm provas separadas de ausência de envio adicional.

## Limites

Este conjunto fornece o percurso HTTP → cliente GitHub → runner sintético e verificações backend controladas. Não constitui prova externa de latência, cancelamento web/TCP ou funcionamento GitHub. O oráculo usa DTO público, percorrendo três páginas em bancos independentes; compara também os resultados públicos incompletos de cinco falhas através do adapter HTTP. Não declara baseline C4 completo, ganho da otimização ou aceite externo.
