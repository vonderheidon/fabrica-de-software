# Architecture Candidates: Otimização das consultas e desempenho da fábrica
**Data:** 2026-10-21
**Run:** 20261021_150214-1ec379
**Source:** C:/Users/jeffe/Documents/Apps/nova-fabrica-software/.lionclaw/pipelines/architecture-review/20261021_150214-1ec379/ArchitectureMap-20261021_150214-1ec379.md

## Candidato 1 — Leitura de checks e artefatos em um Module deep
- **Files:** `apps/controller/src/modules/storage/queries.ts`, `apps/controller/src/modules/storage/verification.ts`, `apps/controller/src/modules/storage/index.ts`, `apps/controller/src/modules/pipeline/start.ts`.
- **Problema:** A expansão de checks em artefatos está em dois caminhos: readDetailPage (queries.ts:98) consulta IDs por check e chama readArtifact por artefato; readCheckHistory (verification.ts:125-128) repete esse percurso. readArtifact ainda lê a entrega e confere o vínculo com o check (101-108). A quantidade de consultas cresce com checks e artefatos e a regra de montagem tem Locality dividida. Isso é evidência estrutural de trabalho repetido, sem latência medida.
- **Solução:** Aprofundar o Module de leitura de checks para concentrar seleção, expansão em lote e validação dos vínculos dentro do snapshot existente. Reutilizar essa Implementation no detalhe e no histórico, preservando ordenação, paginação, erros e metadados; conteúdo dos arquivos continua sob demanda. Não definir uma Interface final nesta fase.
- **Benefícios (locality/leverage/testes):** **Locality:** Montagem e invariantes de checks/artefatos passam a ter um único lugar de manutenção. **Leverage:** Detalhe, histórico e chamadores do pipeline recebem leituras completas sem coordenar expansão por item. **Testes:** Usar a Interface como superfície de teste para igualdade dos resultados, vínculos inválidos, páginas e crescimento do número de consultas com muitos artefatos.
- **Deletion test:** Se esse Module fosse deletado, montagem, validação de vínculos e estratégia de expansão reapareceriam no detalhe e no histórico. Há comportamento real a concentrar, não um pass-through.
- **Payoff:** high
- **Risco:** low
- **Por que agora:** Há dois percursos concretos com a mesma expansão, e a mudança pode ser delimitada a leituras. AC-29 exige medir histórico e persistência, sem guardar conteúdo do projeto.

## Candidato 2 — Projeções de operação e histórico com custo concentrado
- **Files:** `apps/controller/src/modules/storage/operation-summary.ts`, `apps/controller/src/modules/storage/queries.ts`, `apps/controller/src/modules/storage/diagnostics.ts`, `apps/controller/src/modules/storage/index.ts`.
- **Problema:** readOperationSummary compõe tentativa ativa, contagem, últimos resultados por issue, candidatos e diagnósticos (operation-summary.ts:27-49). A seleção dos últimos resultados usa NOT EXISTS e desempate; lista e resumo extraem número de issue de capture_json. readAttemptPage combina filtros opcionais e chave calculada printf para continuação (queries.ts:32-45). As políticas de projeção e seus custos estão repartidos entre leituras, embora Storage já assegure snapshots. Não foi comprovado que JSON ou os planos atuais sejam gargalos.
- **Solução:** Aprofundar o Module de projeções persistidas para concentrar seleção de resumos e sua estratégia de consulta, mantendo capturas históricas e invariantes. Investigar planos e volumes antes de escolher ajustes de SQL, índices ou projeções escalares; evitar cache com invalidação nova sem evidência. Não definir Interface final.
- **Benefícios (locality/leverage/testes):** **Locality:** Regras de escopo, desempate e seleção de resumos ficam próximas da estratégia que controla seu custo. **Leverage:** Dashboard e listagens mantêm leituras leves sem conhecer capturas, filtros SQL ou planos. **Testes:** Pela Interface, preservar último resultado por issue, conta/projeto, empates, continuidade e event_cursor; medir latência e tamanho com histórico crescente e caches volumosos, conforme AC-29.
- **Deletion test:** Sem o Module de projeções, escopo, ordenação, desempate e consistência com o cursor reapareceriam nos chamadores do resumo e das listagens. O alvo é aprofundar essas regras existentes, não embrulhar Storage em delegação.
- **Payoff:** high
- **Risco:** medium
- **Por que agora:** É o percurso direto de listagens e resumo operacional citado no mapa. O ganho depende de medição e análise de planos antes de qualquer mudança de persistência.

## Candidato 3 — Contexto local da fila lido como conjunto
- **Files:** `apps/controller/src/modules/projects/queue.ts`, `apps/controller/src/modules/storage/queue-cycles.ts`, `apps/controller/src/modules/storage/index.ts`, `apps/controller/src/modules/pipeline/start.ts`.
- **Problema:** queue.observe carrega configurações por projeto (queue.ts:30-40) e, para cada item, combina getQueueCycle, getAttempt ou getLatestIssueAttempt (126-128). Os métodos de Storage são leituras separadas; latestIssueAttempt também lê settings (queue-cycles.ts:7-11). O chamador conhece a composição entre ciclo consumido, tentativa ativa e fallback histórico. dispatchQueueCandidate faz duas observações deliberadas (start.ts:156-164); eliminá-las indiscriminadamente mudaria a revalidação.
- **Solução:** Aprofundar o Module de leitura do contexto local da fila para reunir ciclos e referências de tentativas por conjunto observado, concentrando a regra de fallback e seu custo. Preservar observação remota atual, isolamento por projeto, backoff e consumo atômico; não transformar observação de exibição em autoridade. Não definir Interface final nem adicionar Adapter sem variação real.
- **Benefícios (locality/leverage/testes):** **Locality:** A composição do histórico local da fila sai do laço de itens e fica junto das regras persistidas de ciclo. **Leverage:** O chamador avalia elegibilidade sem coordenar consultas locais por item. **Testes:** Pela Interface, comparar fila anterior e nova com ciclos consumidos, retorno a Ready, contas e projetos distintos; medir consultas por conjunto e preservar provas de revalidação do início.
- **Deletion test:** Sem o Module de contexto local, a composição ciclo/tentativa/fallback reapareceria nos percursos de observação da fila. A leitura em conjunto deve absorver essa regra real; um mero wrapper sobre chamadas individuais não passa no deletion test.
- **Payoff:** medium
- **Risco:** medium
- **Por que agora:** Há crescimento explícito de consultas locais por item em um percurso de polling. A latência remota pode dominar; medir parcelas local e remota antes de priorizar implementação.

## Candidato 4 — Reduzir consultas de observação por tela, fila e etapa, com baseline
- **Files:** `apps/web/src/features/queue/useQueue.ts`, `apps/web/src/features/operations/DashboardPanel.tsx`, `apps/web/src/features/operations/useOperation.ts`, `apps/web/src/features/operations/useActiveAttempt.ts`, `apps/web/src/features/attempts/AttemptListPanel.tsx`, `apps/controller/src/modules/projects/queue.ts`, `apps/controller/src/modules/github/client.ts`, `apps/controller/src/modules/github/transport.ts`, `apps/controller/src/modules/pipeline/start.ts`, `apps/controller/src/modules/publication/index.ts`, `apps/controller/src/http/routes/queue.ts`.
- **Problema:** Gatilhos de observação e custo das leituras estão distribuídos. useQueue reage a qualquer evento do controlador, resync e timer (52-68); Dashboard ativa operação, tentativa ativa e fila (32-35). useOperation e useActiveAttempt escutam todos os eventos e possuem timeouts de 15 segundos com dependências diferentes (41-53), sem serem intervalos recorrentes simples. queue.observe consulta cada issue com concorrência de até três (115-122). client.readIssueContext expande responsáveis, blockers, memberships e campos por membership (134-173); o modo queue já evita comentários e reutiliza o header. Cache de exibição já existe e sua chave inclui event_cursor (queue.ts:340-355). Pipeline observa fila e autoridade/escopo por caminhos próprios (start.ts:149-207). Isso revela oportunidades de investigar repetição e custo por finalidade, não comprova um gargalo.
- **Solução:** Aprofundar os Modules de observação existentes para reduzir chamadas redundantes e tempo de resposta comprovados por cenário. Primeiro atribuir cada leitura ao gatilho e à finalidade (exibição, polling, revalidação de escopo, autorização de execução/publicação); depois aplicar apenas ajustes sustentados pelo baseline, como filtrar eventos pertinentes, reunir atualizações coincidentes ou reduzir expansão remota desnecessária para a finalidade. Concentrar regras de atualização e completude nos Modules que as possuem. Não remover revalidações obrigatórias nem reutilizar cache de exibição como autorização; não definir Interface final ou criar Seam/Adapter hipotético.
- **Benefícios (locality/leverage/testes):** **Locality:** Política de atualização, escopo, completude e repetição ficam explícitos nos Modules donos das leituras, reduzindo conhecimento espalhado entre telas, fila e etapas. **Leverage:** Chamadores obtêm observação adequada à finalidade sem repetir coordenação de atualizações ou pedir contexto remoto além do necessário. **Testes:** A Interface é a superfície de teste: contagem de chamadas por finalidade, latência por cenário, atualização após evento pertinente, ausência de refresh desnecessário e rejeição de autorização após mudanças remotas.
- **Deletion test:** Se os Modules donos da observação fossem deletados, agendamento, deduplicação, escopo e completude reapareceriam nos chamadores de tela, fila e etapa. O aprofundamento só se justifica se absorver essas regras e reduzir custo medido; um Module que apenas repasse chamadas é descartado. A proposta não é substituir todos os fluxos por um Module genérico.
- **Payoff:** high
- **Risco:** medium
- **Por que agora:** É o candidato diretamente alinhado à intenção de reduzir quantidade de consultas e tempo de resposta incluindo GitHub, telas e etapas. O baseline decide a primeira fatia; não é uma autorização de refatoração geral.

## Ranking payoff/risco
| # | Título | Payoff | Risco |
|---|---|---|---|
| 4 | Observação por tela, fila e etapa — maior aderência ao objetivo | high | medium |
| 1 | Checks e artefatos — fatia local delimitada | high | low |
| 2 | Projeções de operação e histórico — consultas locais | high | medium |
| 3 | Contexto local da fila — consultas locais por item | medium | medium |

## Recomendação
Candidato 4 — Reduzir consultas de observação por tela, fila e etapa, com baseline. É o alvo mais aderente ao objetivo completo porque investiga chamadas GitHub, gatilhos de tela e polling por etapa antes de escolher uma redução concreta. O trabalho começa por um cenário medido e preserva revalidações de execução/publicação; os candidatos 1–3 continuam como fatias locais opcionais, sem equivaler à cobertura total.

## Evidências, descartes e limites
- Fontes: Architecture Map, SPEC.md:400 e AC-29 (481), código atual inspecionado por leitura UTF-8 e CodeGraph. Os caminhos de Files são relativos à raiz canônica. Nenhuma Interface final foi proposta. Payoff e risco são estimativas qualitativas.
- O Module queries/index.ts:5-11 apenas delega. Sua remoção elimina essa delegação; não foi listado como alvo independente porque não concentra comportamento suficiente no deletion test.
- Coordenação: start.ts, recovery.ts e publication/index.ts mostram ordenação entre persistência, autoridade e IO. Existem regras reais, mas uma reorganização ampla não tem ganho de desempenho demonstrado para este projeto.
- Execução: execution/index.ts, maestri-omp/adapter.ts e storage/execution.ts mostram estado vivo, parada incerta e recibos duráveis. Não se propõe um Seam adicional ou outro Adapter: não foi identificada variação de produção que o justifique.
- Exclusão: projects/deletion.ts, storage/project-deletions.ts, storage/project-deletion-worker.ts e workspaces/deletion.ts foram inspecionados em trechos. Reconferências preservam identidade e progresso; não se recomenda suprimi-las por custo presumido. Não houve prova nativa Windows.
- events.ts foi inspecionado: já concentra escopo, validação de cursor e snapshot. Sem medição, não há justificativa suficiente para um candidato próprio de cache ou multiplexação.
- Testes existentes foram lidos em trechos de operations.test.ts e queue-cycles.test.ts; isso não constitui auditoria de cobertura. Não foram executados testes, benchmarks, EXPLAIN, navegador, integrações externas ou operações Git.
- Não foram medidos latência, cardinalidades, planos de execução, tamanho persistido nem bloqueio do processo. Expansão por item é observada no código; impacto percebido e ganhos permanecem hipóteses. A leitura foi dirigida, não integral em todos os hotspots.
- Para o candidato escolhido, a Interface será a superfície de teste. A validação deverá preservar comportamento e medir antes/depois conforme AC-29; nenhum aceite AC/INT é declarado nesta triagem.
- Somente estes artefatos foram escritos no runDir; selectedCandidateId permanece null para a escolha pela UI.

## Refinamento da intenção e cobertura (2026-10-21)
A recomendação inicial de C1 era estreita demais para o objetivo informado. Este refinamento a substitui por C4, sem selecionar candidato ou avançar a fase.

| Candidato | Cobre | Deixa de fora |
|---|---|---|
| C1 | Consultas locais para checks/artefatos no detalhe e histórico | GitHub, gatilhos das telas, polling de fila/etapas |
| C2 | SQL de resumo operacional e histórico de tentativas | Redução de chamadas GitHub e coordenação dos gatilhos web/etapas |
| C3 | Consultas locais por item da fila e composição ciclo/tentativa | Expansão remota GitHub e política completa de atualização das telas |
| C4 | Atribuição e redução medida de leituras repetidas entre telas, fila, GitHub e etapas | Não inclui automaticamente toda otimização SQL, checks/artefatos, alteração da máquina de estados ou reescrita geral |

### Evidências adicionais de C4
- `useQueue.ts:52-68`: evento geral, resync e timeout convergem em refresh, sem filtragem do evento por projeto neste trecho. AbortController cancela o pedido web anterior; não foi verificado se isso interrompe trabalho remoto já iniciado.
- `DashboardPanel.tsx:32-45`: três leituras ativas, além do catálogo recebido. `useOperation.ts:41-52` e `useActiveAttempt.ts:42-53`: cada hook reage a eventos e arma um timeout; as dependências são event_cursor e revision, respectivamente. Não afirmar polling recorrente a cada 15 segundos quando o valor não muda.
- `AttemptListPanel.tsx:44-53`: já existe filtragem por projeto; não tratar todas as telas como idênticas.
- `queue.ts:340-355`: cache/coalescência existente por chave, até oito entradas, prazo de leitura completa limitado a 10 segundos; evento alterando cursor muda a chave. Investigar se eventos não pertinentes causam novas leituras, sem pressupor cache ausente.
- `github/client.ts:134-190`: modo queue já omite comentários e body e reutiliza header. Com uma página por conexão e M memberships, o percurso queue executa 4+M chamadas GraphQL por issue; isso é contagem estática condicional, não baseline observado. Páginas adicionais ou falhas mudam a contagem.
- `pipeline/start.ts:149-207`: duas observações da fila no despacho, polling de autoridade e escopo, com relógios/travas próprios; `publication/index.ts:38-83`: observação de conta, issue, Project e repositório com persistência por stamp. A semântica de autoridade atual prevalece sobre redução de chamadas.
- `github/transport.ts:177-240`: GraphQLReader permite contar cada query efetivamente enviada, separadamente da chamada lógica getIssueContextById; `collect:244-277` pagina conexões. Não confundir pedidos HTTP locais, chamadas lógicas, processos GH e páginas GraphQL.

### Baseline e comparação propostos — ainda não executados
1. Fixar mesma revisão, configuração de intervalos, conta e catálogo. Usar fixture controlada de 2 projetos com 10 issues cada, uma membership por issue e uma página por conexão; repetir com 3 memberships e conexão de 2 páginas. Registrar essas cardinalidades, sem dados privados. Separar preparação fria de estado aquecido.
2. Reproduzir em uma aba: Dashboard ocioso por 120 segundos; Fila por 120 segundos; navegar Dashboard → Fila → Tentativas → Dashboard, aguardando conclusão das leituras; emitir na fixture uma sequência fixa de 10 eventos do projeto observado e 10 de outro projeto, espaçados em 200 ms. Repetir cada cenário 5 vezes e conservar a mesma sequência e tempos antes/depois. Executar também automação desligada e ligada na fixture, sem despachar recursos reais.
3. Na fixture de etapa, percorrer início, implementação, checks, revisão e publicação simulada, com relógio e respostas controlados; repetir mudança de responsável, critérios, Status e conta entre exibição e autorização. Esperado: observação antiga não autoriza, falhas e leituras parciais continuam bloqueando, efeitos não se repetem. Capturar separadamente cada revalidação obrigatória.
4. Contar pedidos HTTP por rota/tela/gatilho (montagem, evento, timer, ação manual), chamadas lógicas GitHub, queries GraphQL realmente enviadas por operação/página, consultas SQLite executadas por leitura e repetição simultânea com mesma finalidade/escopo. Instrumentação futura deve registrar apenas categorias, durações e contadores, sem tokens, headers, argumentos GH ou corpos de issues. SQL deve ser contado no nível de execução, incluindo cada all/get/run, não só prepare. Não mudar código durante esta triagem.
5. Medir duração HTTP, duração GitHub acumulada e caminho crítico, duração SQLite e tempo até a tela apresentar estado atualizado; publicar contagens por cenário, p50/p95 de amostras suficientes e min/mediana/max dos 5 totais de cenário. Não somar durações concorrentes como tempo de resposta. Registrar bytes e atraso de atualização percebido para evitar reduzir chamadas às custas de estado excessivamente antigo.
6. Comparar a mesma matriz antes/depois. Considerar êxito apenas redução demonstrada de chamadas redundantes e/ou latência no cenário alvo, sem regressão de completude, isolamento, paginação, backoff ou frescor necessário. Orçamento numérico deve ser definido após baseline; nenhuma porcentagem de ganho é prometida. Aplicar AC-29 ao tamanho persistido e às leituras locais com caches ignorados volumosos.
7. Uma prova no host real com Playwright e GitHub pode confirmar representatividade depois, mediante autorização correspondente para leituras externas/custo e efeitos conhecidos. Tentativa/publicação real não integra o baseline automaticamente. Fixtures provam comparação controlada, não latência real do GitHub.

CodeGraph foi tentado neste refinamento e retornou Transport closed; foram usadas leituras atuais UTF-8. Nenhum benchmark, teste ou integração foi executado. A revisão altera apenas MD/JSON no runDir e mantém selectedCandidateId=null.
