# Architecture Diagnosis: Nova fábrica de software
**Data:** 2026-10-21
**Run:** 20261021_150214-1ec379
**Candidato escolhido:** C4 — Reduzir consultas de observação por tela, fila e etapa, com baseline

## Causa raiz
A política de observação tem Locality dividida: os hooks decidem pertinência e agendamento, a fila decide escopo/cache, o client decide expansão remota e pipeline/publicação decidem frescor para autoridade. As Interfaces existentes não encapsulam conjuntamente essas decisões por finalidade, de modo que avaliar ou reduzir repetição exige coordenar vários Modules e preservar manualmente diferenças semânticas. A fricção estrutural está comprovada; gargalo, redundância efetiva em runtime e ganho de desempenho permanecem sem baseline.

## Evidencias por arquivo
### apps/web/src/features/queue/useQueue.ts:22-68
- **Finding (E1):** O hook coordena pedido, cancelamento, versão, eventos gerais, resync e timer; onUpdated ignora o conteúdo e o projeto do evento.
- **Impact:** A pertinência da atualização não fica encapsulada numa política por finalidade/escopo; eventos distintos podem iniciar novas leituras. AbortController web não prova cancelamento remoto.

### apps/web/src/features/operations/useOperation.ts:22-52
- **Finding (E2):** Pedido /operation e listeners gerais possuem coordenação própria; timeout depende de event_cursor.
- **Impact:** Alterar atualização exige manter política própria. Timeout é rearmado por dependências, não intervalo recorrente garantido.

### apps/web/src/features/operations/useActiveAttempt.ts:23-53
- **Finding (E3):** Pedido de tentativa ativa repete coordenação de carregamento, listeners e timeout, dependendo de revision.
- **Impact:** As mesmas famílias de eventos acionam outra leitura com regra temporal diferente; testes de atualização precisam considerar ambas.

### apps/web/src/features/operations/DashboardPanel.tsx:32-45
- **Finding (E4):** Dashboard monta três hooks ativos e a ação manual coordena refresh dos três e do catálogo.
- **Impact:** O call site conhece a composição de atualização; um evento geral é recebido por três observadores, embora isso não prove três consultas remotas.

### apps/web/src/features/attempts/AttemptListPanel.tsx:36-70
- **Finding (E5):** Lista já filtra eventos por tentativa/projeto ou presença na página e mantém outro efeito para consulta.
- **Impact:** Há uma política concreta de pertinência separada dos hooks gerais; não se pode unificar gatilhos ignorando diferenças de escopo.

### apps/controller/src/modules/projects/queue.ts:30-49
- **Finding (E6):** observe carrega catálogo/configuração por projeto, identidade remota e tentativa ativa antes de produzir a fila.
- **Impact:** A observação envolve custos locais e remotos; contagem HTTP isolada não atribui custo por dependência.

### apps/controller/src/modules/projects/queue.ts:92-128
- **Finding (E7):** Por projeto, lê itens e detalhes; percorre issues em até três workers e consulta ciclo/tentativa por item.
- **Impact:** O custo cresce com projetos e itens. A concorrência limita simultaneidade, não volume; a leitura local também participa do percurso.

### apps/controller/src/modules/projects/queue.ts:320-357
- **Finding (E8):** save usa observe para revalidação; read coalesce por settings.etag, event_cursor e consulta, com até oito entradas e validade de até dez segundos para resultado completo.
- **Impact:** Já existe cache de exibição. Cursor diferente impede compartilhar a entrada anterior; deduplicar autoridade com esse cache mudaria a garantia atual.

### apps/controller/src/modules/github/client.ts:134-191
- **Finding (E9):** purpose queue reutiliza header e omite comentários/body, mas expande assignees, blockers, memberships e campos de cada membership sequencialmente.
- **Impact:** Uma chamada lógica queue pode gerar 4+M queries com uma página por conexão e M memberships, em percurso válido completo. Otimização exige preservar completude; contexto completo não tem custo idêntico.

### apps/controller/src/modules/github/transport.ts:177-198
- **Finding (E10):** GraphQLReader injeta runner/relógio, compartilha throttle e cria orçamento por scope; query pode retornar antes de enviar.
- **Impact:** Contar chamadas lógicas ou entradas em query superestima envios quando há bloqueio; baseline deve observar runner/onSend e distinguir custo acumulado de caminho crítico.

### apps/controller/src/modules/github/transport.ts:244-277
- **Finding (E11):** collect chama query por página, deduplica IDs e recusa paginação inconsistente ou limite excedido.
- **Impact:** Cardinalidade de páginas muda custo e completude; remover expansão sem preservar estados parciais altera a semântica.

### apps/controller/src/modules/pipeline/start.ts:149-207
- **Finding (E12):** Despacho tem relógio/trava próprios e duas observações separadas por recordQueueObservations; tick também observa autoridade e escopo.
- **Impact:** A finalidade e a ordem são relevantes. Suprimir a segunda leitura ou fundir polling indiscriminadamente pode autorizar com observação anterior à mudança local/remota.

### apps/controller/src/modules/publication/index.ts:30-83
- **Finding (E13):** Autoridade lê snapshot, conta, issue completa, Project e repositório, registra com stamp e repete uma vez se a observação ficou stale.
- **Impact:** A política de autoridade é distinta da exibição. Reduções precisam manter rejeição de mudança de responsável, conta, Status e configuração.

### apps/controller/src/http/routes/queue.ts:12-22
- **Finding (E14):** GET delega a getQueue e retorna ETag; PUT segue saveQueue e trata conflito com resumo atualizado.
- **Impact:** A Interface HTTP já separa consulta e comando. O ETag da resposta não demonstra que custo remoto foi evitado nem autoriza reutilizar leitura em comando.

### apps/controller/src/modules/github/github.test.ts:15-25
- **Finding (E15):** Fixture fornece GhRunner em memória e registra query/variables antes de devolver respostas controladas.
- **Impact:** Existe Seam real para contabilizar queries sem rede; não é necessário introduzir outro port para esse baseline.

### tests/integration/queue-scheduler.test.ts:65-100
- **Finding (E16):** Testes distinguem read compartilhado de observe, validade do cache/configuração e pico de três leituras de issue.
- **Impact:** A fronteira de autoridade e a limitação de concorrência já têm verificações explícitas; aprofundamento deve preservá-las. Leitura estática não comprova que passam hoje.

### apps/web/src/features/operations/DashboardPanel.test.ts:12-27
- **Finding (E17):** Testes lidos cobrem upcomingCandidates por elegibilidade, ordem e limite.
- **Impact:** Esse arquivo não prova comportamento dos hooks, timers ou contagem de pedidos do Dashboard; isso requer cenário de UI distinto.

## Call sites afetados
- DashboardPanel.tsx:32-45 monta useOperation/useActiveAttempt/useQueue e coordena atualização manual.
- useQueue.ts:29-30 lê /api/v1/queue; useOperation.ts:27 lê /api/v1/operation; useActiveAttempt.ts:28 e AttemptListPanel.tsx:63 leem /api/v1/attempts com finalidades diferentes.
- http/routes/queue.ts:12-22 encaminha consulta/comando; projects/queue.ts:323-336 reobserva ao salvar.
- projects/queue.ts:92-128 expande Projects/issues e compõe estado local.
- github/client.ts:175-191 chama readIssueContext; transport.ts:251 expande cada página.
- pipeline/start.ts:155-178 observa conta/fila, registra ciclos e inicia preparação; 195-201 observa autoridade/escopo.
- publication/index.ts:49-80 observa conta/issue/Project/repositório e persiste autoridade.
Os caminhos abreviados acima correspondem aos caminhos completos das evidências; a lista é dirigida, não grafo exaustivo.

## Seams atuais
- **Seam existente:** QueueGitHub injetado em createQueue (projects/queue.ts:9-19), exercitado por mocks no scheduler (tests/integration/queue-scheduler.test.ts:20-34): separa observação remota da montagem local.
- **Seam existente:** GhRunner e relógio em GraphQLReader (github/transport.ts:177-191): adapter de produção executa GH por spawn (105-135), adapter de teste responde em memória (github/github.test.ts:15-25). Dois adapters observados: Seam real.
- **Seam existente:** read/observe/save (projects/queue.ts:320-357): separa cache/coalescência de exibição da observação atual usada por autoridade; é separação semântica, não proposta de novo port.
- **Seam existente:** purpose queue (github/client.ts:175-189): variação existente de completude/expansão dentro do mesmo adapter, não segundo adapter.
- **Seam existente:** PublicationDependencies (publication/index.ts:11-19) injeta GitHub, Storage e coordenação; sua observação preserva stamp e diagnóstico (30-83).

## Seams ausentes
- **Lacuna:** Política interna de pertinência e agendamento por finalidade/escopo para observadores web: hooks ignoram evento e lista já aplica filtro (evidências 1-5). Uma Interface interna testável poderia absorver seleção de gatilhos e coordenação; não exige port nem adapter novo.
- **Lacuna:** Atribuição de observações por finalidade/gatilho até o envio remoto: hooks, observe, polling e autoridade têm coordenação própria (evidências 1-13). Nos trechos lidos não há contexto comum que permita comparar toda a cadeia. É lacuna diagnóstica localizada, não afirmação de ausência global de telemetria.
- **Lacuna:** Contrato interno mais localizado de expansão necessária por finalidade: queue solicita purpose, client escolhe omissões e ainda expande todas as memberships (evidências 7-9). A necessidade de restringir a um Project é hipótese a medir e validar, não Seam obrigatório já aprovado.

Um adapter = Seam hipotético; dois adapters = Seam real. O runner tem os dois observados. As demais lacunas não autorizam novos ports nem um Module genérico de observação. O aprofundamento deve absorver políticas reais e demonstrar Leverage; só repassar chamadas não aumenta Depth. Não foi medida uma razão numérica entre Interface e Implementation.

## Categoria de dependencias
| Dep | Categoria | Estrategia de teste recomendada |
|---|---|---|
| Seleção de eventos, montagem/ordenação e políticas em memória | In-process | Testar pela Interface com eventos e tempo controlados; comparar gatilhos pertinentes, resync e atualizações coincidentes. Mesclar computação pura quando aumentar Locality; sem adapter. |
| Storage/SQLite e configuração local | Local-substituível | Usar banco temporário real e fixtures isoladas; preservar revisões, cursor, consumo e snapshots; contar execuções SQL e latência. Não foi verificado adapter em memória de Storage nem se recomenda criá-lo. |
| Controlador próprio acessado pela web em HTTP/SSE | Remoto mas próprio (Ports & Adapters) | Interface de transporte web existente com adapter HTTP; cenário controlado pode fornecer adapter em memória e depois validar navegador/controlador real. Segundo adapter aqui é recomendação futura, não evidência de implementação. |
| GitHub por GH CLI/GraphQL | Verdadeiramente externo (Mock) | Manter porta injetada existente QueueGitHub/GhRunner e mock; registrar envios por página, respostas parciais, throttling e mudanças entre observação e autorização. Prova externa separada apenas com autorização. |
| Relógio e timers do host/navegador | Local-substituível | Controlar relógio/timers no teste; GraphQLReader já injeta now e scheduler usa spy de Date.now (queue-scheduler.test.ts:75-87). Não criar adapter de produção extra apenas para simular tempo. |

GitHub é verdadeiramente externo mesmo sendo acessado por um adapter mantido neste projeto. O HTTP/SSE do controlador é remoto mas próprio em relação à web, embora opere no mesmo host. SQLite não deve ser confundido com computação in-process sem I/O.

## Impacto em testes/manutencao/performance
- A Interface deve ser a superfície de teste do futuro Module aprofundado. Há substituições reais para GitHub e testes de cache/autoridade/concorrência, mas provar atualização por evento exige cenário que exercite hooks, HTTP, fila e runner com tempo/cardinalidades fixos; testes de upcomingCandidates não cobrem isso. Manutenção atravessa políticas de frescor diferentes. O crescimento de consultas por issue/membership/página é estrutural; nenhuma latência ou regressão de performance foi medida.
- **Locality:** pertinência, cache, completude e autoridade estão em Modules distintos; não implica mover toda a observação para um único Module.
- **Leverage/Depth:** objetivo futuro é esconder coordenação pertinente atrás de Interfaces pequenas, mantendo regras de cada finalidade. O deletion test exige que sua remoção faça essas políticas reaparecerem nos call sites.
- **Contagem estática condicional:** queue com I issues e M_i memberships por issue exige soma de (4 + M_i) queries somente para contexto das issues, se todas as conexões tiverem uma página e respostas completas. Não inclui identidade, Project, itens, SQL, retries ou outras finalidades. Workers concorrentes não reduzem esse total.
- **Timers:** useOperation depende de event_cursor e useActiveAttempt de revision; não são intervalos recorrentes simples de 15 segundos.
- **Cancelamento:** os hooks abortam fetch e descartam respostas antigas. Não foi demonstrada propagação desse abort até GH; a rota lida não encaminha AbortSignal explicitamente.

## Riscos se nada for feito
- Novas telas/eventos/finalidades podem multiplicar leituras e tornar a política de atualização mais difícil de manter; expansão remota crescente pode pressionar latência, orçamento de queries e rate limit. A consequência mais sensível de otimização sem diagnóstico é compartilhar observação de exibição com autoridade ou perder completude, aceitando estado antigo. São riscos derivados da estrutura, sem frequência de bugs, degradação real ou ganho quantificados.

## Baseline recomendado e critérios de preservação
1. Fixar revisão, configuração, conta sintética, relógio e cardinalidades. Comparar dois projetos com dez issues cada; variar memberships (uma/três) e páginas (uma/duas), com cache frio/aquecido.
2. Exercitar Dashboard/Fila ociosos por 120 segundos e navegação entre Dashboard, Fila e Tentativas; repetir cinco vezes. Injetar mesma sequência de eventos pertinentes/de outro projeto e resync, com intervalo controlado, antes/depois.
3. Contar HTTP por rota/tela/gatilho; chamadas lógicas GitHub por finalidade; envios efetivos no runner/onSend por query/página; SQL por execução all/get/run. Separar exibição, scheduler, escopo e autorização. Não registrar tokens, argumentos privados ou corpos.
4. Medir caminho crítico HTTP e tempo até atualização visível; durações acumuladas de dependências não equivalem à latência por serem concorrentes. Registrar cardinalidades, bytes, min/mediana/max por cenário e p50/p95 apenas com amostragem suficiente.
5. Preservar cache separado de autoridade, completude, paginação, backoff, isolamento e consumo atômico. Simular mudança de conta/responsável/Status/configuração entre exibição e início/publicação; observação antiga não deve autorizar nem repetir efeitos.
6. SPEC.md:400,402,404 exige resumos leves, transações curtas e histórico sem autoridade; AC-22 (475), AC-27 (480), AC-29 (481) e AC-28 (482) delimitam preservação. AC-29 requer tamanho persistido e latência antes/depois com caches/ignorados volumosos. Integração real e UI não são provadas por fixtures.

## Fontes, limites e pendências
- Map e Candidates fornecidos foram lidos; C4 é o candidato selecionado. Fontes normativas desta análise: trechos atuais da SPEC citados acima.
- Leitura do código atual via CodeGraph e filesystem UTF-8; trechos extensos inicialmente truncados foram retomados para cache, client e transport. A análise não constitui auditoria integral de todos os arquivos, SQLs, regras de publicação ou documentação INT.
- Testes citados foram apenas lidos. Não foram executados testes, benchmarks, EXPLAIN, navegador, GitHub, Maestri/OMP, providers ou operações Git. Nenhum aceite AC/INT é declarado.
- Não se comprovou ausência global de métricas ou cobertura; não se mediu latência, bloqueio do processo, número real de refreshes/envios, taxa de cache ou pressão de rate limit. Possível invalidação por eventos sem pertinência exige cenário medido.
- Nenhum bug foi declarado corrigido. Nenhuma Interface final, reorganização geral, novo adapter ou supressão de revalidação está aprovada por este diagnóstico.
- Somente os dois artefatos de diagnóstico deste run foram escritos; código do projeto não foi alterado.

