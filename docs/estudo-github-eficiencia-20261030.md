# Estudo: redução sustentável de consultas ao GitHub

Data: 2026-10-30. Base inspecionada: HEAD `d036f9dd590188c72dd38eb300b73a378377a9b5`, working tree inicialmente limpo. Escopo: estudo, sem implementação, alteração de contrato ou início de pipeline.

## Conclusão

Recomendo evoluir o C12 com sincronização compartilhada e leve da fila, seguida de revalidação específica antes de ações. A admissão atual limita concorrência e contém falhas, mas o custo recorrente ainda cresce com todas as issues do quadro. A prioridade é reduzir trabalho remoto repetido; depois, regular preventivamente o consumo restante. Não há garantia absoluta de ausência de rate limit, pois outros clientes da conta também consomem cota e o GitHub aplica limites secundários dinâmicos.

## Fontes de verdade e decisões preservadas

- `AGENTS.md`, `README.md`, `docs/operation/README.md`, `GLOSSARY.md` e comandos de `package.json`.
- `SPEC_PROGRESS.md` registra C12 concluído localmente com aceite formal pendente. Seus resultados anteriores não são novos resultados deste estudo.
- `.lionclaw/pipelines/architecture-review/20261029_211418-4de31f/SPEC-20261029_211418-4de31f.md`, especialmente D1-D3, preservação do contexto completo de preparação/início e leituras frescas de autoridade.
- Código atual nos caminhos abaixo prevalece sobre memória e grafo.

C12 não autorizava cache ou prioridades novos. As propostas deste estudo são evolução de escopo a decidir, não requisitos retroativos nem correções obrigatórias daquele pacote. Não remover as observações que delimitam conta/configuração nem as guardas anteriores aos efeitos.

## Diagnóstico confirmado no código

| Local | Comportamento atual | Consequência |
| --- | --- | --- |
| `github/transport.ts`, `GraphQLAdmission` | Até três permits por reader raiz; scopes compartilham admissão e cooldown; instâncias distintas são independentes | Contém concorrência local, mas não representa orçamento temporal da conta nem coordena programas externos |
| `github/transport.ts`, tratamento de resposta | Usa Retry-After/reset para cooldown após rate limit | Proteção reativa; não foi encontrado regulador preventivo baseado no saldo de respostas bem-sucedidas |
| `projects/queue.ts`, `observe` | Identidade no início e no fim; origem, quadro, campos e itens por projeto | Custo de metadados se repete por observação |
| `projects/queue.ts`, `issueItems` | Busca contexto `queue` para todas as issues listadas, com até três workers | Fan-out proporcional ao quadro, inclusive itens que podem ser descartados por fatos já conhecidos |
| `github/client.ts`, `readIssueContext` | Queue evita comentários, mas lê cabeçalho, assignees, blockers, memberships e valores; body continua presente | C12 reduz payload em outras finalidades, mas não elimina o fan-out da fila |
| `projects/queue.ts`, `read` | Compartilha promise e resultado por chave por até 10 s, máximo oito entradas; chave inclui cursor/limite/escopo | Já existe deduplicação de exibição; páginas e escopos distintos podem provocar novas varreduras |
| `pipeline/start.ts`, `dispatchQueueCandidate` | Faz `queue.observe` para scan e outra vez quando habilitada e válida, antes de escolher candidato | Um ciclo pode reconstruir o quadro duas vezes; não usa o cache de exibição |
| `web/features/queue/useQueue.ts` | Polling e eventos locais provocam refresh | Consumidores podem aumentar demanda; eventos locais não significam necessariamente mudança remota |

Os caminhos de módulos acima são relativos a `apps/controller/src/modules/`, exceto o frontend, relativo a `apps/`.

Modelo analítico, não benchmark: supondo uma página por conexão e uma membership por issue, o caminho queue faz cinco envios por issue: cabeçalho, assignees, blockers, memberships e valores. O cabeçalho queue é reutilizado sem envio adicional. Portanto use `Q ≈ 2 + Σ(origem + páginas de itens + cabeçalho do projeto + páginas de campos + 5N)` por observação simples. Outras memberships/páginas aumentam o custo. Duas varreduras podem aproximar `2Q`, antes de preparação e autoridade. Chamadas físicas, pontos GraphQL e bytes são métricas distintas.

## O que a documentação oficial sustenta

1. O GitHub recomenda webhooks, polling somente na frequência necessária, requests condicionais REST e redução de concorrência. Respeitar Retry-After/reset e backoff em falhas repetidas. [Boas práticas REST](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
2. GraphQL tem orçamento primário em pontos, separado de REST, além de limites secundários e de recursos. Consolidar queries pode reduzir envios sem necessariamente reduzir pontos; é preciso medir ambos. Preferir headers existentes à consulta extra de rateLimit. [Limites GraphQL](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api).
3. Conexões exigem paginação própria; agrupar cabeçalhos não autoriza ignorar continuações aninhadas. [Paginação GraphQL](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api).
4. ETag/304 autenticado pode poupar cota primária em REST. Não se deve transpor essa garantia para POST GraphQL nem confundir ETag HTTP local da fila com validação remota. [Boas práticas REST](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
5. Eventos Projects V2 têm disponibilidade específica por tipo de webhook/proprietário e condições de preview. Não presumir cobertura universal de quadros pessoais. [Eventos e payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads#projects_v2_item).

Pesquisa documental por agente GPT-6 Luna, esforço high, via Context7; fontes centrais também abertas pelo agente principal. Nenhum acesso autenticado ao GitHub foi necessário.

## Arquitetura recomendada

### 1. Uma sincronização por escopo, múltiplos consumidores

Introduzir um coordenador em memória no controlador, associado ao runtime GitHub existente. Uma atualização por quadro/conta/contexto/configuração alimenta uma observação de exibição; páginas locais são recortes do mesmo conjunto. Requisições simultâneas compartilham uma execução, sem tornar cancelamento de um consumidor cancelamento de todos.

Chaves devem incluir host, geração do contexto de autenticação, conta observada, IDs remotos e revisão da configuração. Mudança de conta/contexto/configuração invalida resultados e execuções antigas. Limitar entradas, tamanho e duração; não armazenar tokens, consultas brutas ou checkout. Preferir memória a nova persistência nesta primeira evolução.

Separar sincronização de exibição de autorização: snapshot compartilhado pode apontar candidato, mas não concede início ou publicação. Revalidar fatos exigidos pelo domínio, configuração, conta, origem e conteúdo/critérios no ponto da ação. Se a primeira escolha deixar de ser válida, selecionar novamente sob regra explícita. Retirar a segunda varredura completa exige demonstrar preservação da ordem, ciclos Ready e concorrência de alterações; a API remota não fornece transação entre essas leituras.

### 2. Uma projeção própria de descoberta da fila

Não reutilizar um `IssueContext` completo como formato interno universal. Criar projeção de descoberta contendo os fatos necessários para montar as linhas e motivos atuais; carregar conteúdo integral quando preparação/início realmente o exigir. Antes disso, auditar dependência de body/interpretIssue e o contrato público: não retirar motivos ou alterar elegibilidade silenciosamente.

Buscar em páginas do quadro os campos escalares necessários das issues e o Status já disponível. Agrupar cabeçalhos restantes em lotes limitados. Conexões de assignees, blockers e memberships devem ter continuação por nó e falha parcial explícita. Evitar query gigante com múltiplas conexões de 100 elementos por item.

Filtrar antes de hidratar somente quando os fatos conhecidos bastarem e a linha resultante preservar os motivos e a completude exigidos pelo contrato. Não usar ausência de dados como prova de inelegibilidade. Reutilizar metadados dentro de uma sincronização; TTL entre sincronizações é aceitável para exibição, sujeito a orçamento de defasagem aprovado. Autoridade continua fresca.

### 3. Agendamento adaptativo e controle preventivo

Preservar permits, prazo, encerramento físico e `beforeSend` do C12. Acrescentar orçamento temporal por contexto/conta, atualizado pelos headers de sucesso, com reserva conservadora para leituras obrigatórias e efeitos autorizados. Não criar consultas periódicas de rate limit só para alimentar o regulador. Amostras concorrentes/atrasadas não podem aumentar artificialmente o saldo disponível.

Aplicar espaçamento de envios, jitter entre escopos e backoff exponencial limitado para falhas repetidas sem indicação temporal. Retry-After/reset são pisos de espera; não permitir que refresh manual ou evento local os ignore. Priorizar trabalho necessário para concluir ações sobre refresh de exibição, com justiça para evitar starvation. Não repetir mutações automaticamente.

Polling sem mudanças pode desacelerar dentro de limites definidos; mudanças locais pertinentes podem antecipar uma sincronização, respeitando cooldown e orçamento. Intervalos de 30-60 s ou mais são hipóteses de ensaio, não alteração aprovada: a tolerância de atraso da fila precisa ser definida antes da implementação. Mesmo com automação pausada, a tela pode precisar mostrar a fila.

### 4. Webhooks como evolução opcional

Para instalação local portátil, webhook exige receptor alcançável pelo GitHub, permissões e gestão de disponibilidade. Não introduzir relay/cloud/GitHub App obrigatório agora. Se o modo organizacional justificar, evento apenas invalida/agende a leitura do recurso; validar assinatura, deduplicar entrega e reconciliar periodicamente perdas. Eventos não autorizam efeitos e não substituem leitura atual. A modalidade por polling eficiente deve continuar suportada.

## Comparação das alternativas

| Alternativa | Ganho esperado | Limite | Recomendação |
| --- | --- | --- | --- |
| Apenas aumentar intervalo | Menos ciclos | Cada ciclo continua caro e a fila demora mais | Complemento |
| Apenas reduzir concorrência | Menos rajadas | Mantém o volume total | Preservar e regular |
| Cache genérico de tudo | Muitas respostas reaproveitadas | Pode reutilizar autoridade ou cruzar conta/contexto | Evitar |
| Sincronização compartilhada + projeção leve + autoridade fresca | Reduz duplicação e fan-out preservando ação segura | Exige testes de equivalência e invalidação | Prioridade |
| Webhooks obrigatórios | Menos polling | Infraestrutura/permissões e cobertura de Projects | Adiar |
| Trocar token/aumentar cota | Mais margem em alguns cenários | Não remove excesso nem limites secundários | Não usar como solução principal |

## Plano de comprovação e ordem de execução futura

1. Medir primeiro o percurso atual completo: scheduler + UI, páginas, eventos e projetos que compartilham quadro. Reaproveitar `tests/integration/backend-measurement.test.ts` e fixtures existentes. Registrar envios físicos, bytes, espera, duração, acertos/compartilhamentos e, em ensaio real posterior, pontos e headers sanitizados.
2. Implementar compartilhamento em memória e paginação local; comprovar que dois consumidores simultâneos e troca de página não causam duas sincronizações do mesmo conjunto.
3. Introduzir descoberta leve e hidratação seletiva; comparar todos os DTOs/motivos/ordem/ciclos com o comportamento de referência. Separar ganho em bytes de ganho em envios e pontos.
4. Substituir a segunda varredura apenas após prova de revalidação do candidato e regras de ordem. Exercitar troca de conta, alteração do mapeamento/branch, cancelamento, remoção de projeto e resposta atrasada.
5. Acrescentar orçamento preventivo e polling adaptativo. Testar consumo externo simulado, headers fora de ordem, saldo esgotado, 403 de permissão versus rate limit, 429, falhas sucessivas, cooldown e ausência de replay de efeitos.
6. Validar com testes determinísticos, suíte pertinente, typecheck/lint/build; depois ensaio autenticado de leitura com duração/carga delimitadas e UI, sem publicar. Só essa etapa poderá sustentar ganho real.

Metas propostas para pactuar: zero sincronizações duplicadas por mesmo escopo/generation simultâneo; nenhuma nova varredura remota por simples troca de página no conjunto vigente; nenhuma chamada antes do cooldown; nenhum uso de cache como autoridade; redução de pelo menos 80% dos envios em cenário repetido e inalterado com UI + scheduler, comparado à mesma carga atual. A última é meta de projeto, não resultado obtido nem expectativa universal para cold start.

## Limites deste estudo

Inspeção estática e consulta documental confirmam os mecanismos descritos. Nesta rodada, `npm.cmd test -- --run apps/controller/src/modules/github/admission.test.ts tests/integration/backend-measurement.test.ts` passou: 50 testes em dois arquivos, com runners controlados. Isso confirma a regressão focada existente, sem provar a proposta. Não medimos tráfego real, consumo da conta, aplicação distribuída em execução ou equivalência de uma solução ainda não implementada. Não foi determinado qual processo ou consulta causou um episódio específico de rate limit. Nenhuma implantação, alteração de credenciais, publicação ou aceite formal ocorreu.
