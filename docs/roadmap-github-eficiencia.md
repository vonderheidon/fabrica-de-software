# Roadmap: GitHub com menos consultas e atualização mais rápida

Última atualização: 2026-10-30.

## Objetivo

Reduzir as consultas ao GitHub e o tempo de atualização da Fila Ready, mantendo a seleção correta das tarefas e a segurança antes de iniciar trabalho. Funcionar no computador do usuário, sem endereço público, servidor externo ou webhook obrigatório.

Este documento é a fonte de acompanhamento desta melhoria. O estudo de apoio está em [estudo-github-eficiencia-20261030.md](estudo-github-eficiencia-20261030.md). Os contratos atuais, o código e as regras de `AGENTS.md` continuam prevalecendo. Esta preparação documental não inicia implementação nem pipeline.

## Como o progresso será atualizado

O assistente deve atualizar este documento na mesma entrega em que implementar ou validar uma etapa, sem o usuário precisar pedir novamente. Antes de continuar este trabalho, deve ler este roadmap e conferir o estado real do repositório.

- Marcar um critério com `[x]` somente quando houver evidência correspondente.
- Manter `[ ]` quando houver apenas proposta, implementação incompleta ou validação faltante.
- Usar os estados: Pendente, Em andamento, Implementado com validação pendente e Concluído.
- Registrar data, arquivos alterados, comandos executados, resultado e limitações em cada entrega.
- Separar teste controlado, teste com GitHub real, verificação visual e aceite do usuário.
- Se uma alteração invalidar uma prova anterior, reabrir o critério e registrar o motivo, preservando o histórico.
- Não marcar aceite do usuário automaticamente. Registrar somente uma manifestação explícita.

Essa atualização é feita pelo assistente durante o trabalho. Não há monitoramento em segundo plano nem atualização automática pelo aplicativo.

## Como retomar em outra sessão

Abra a nova sessão no repositório canônico da Nova Fábrica e envie o texto abaixo. O arquivo precisa estar disponível no mesmo workspace; o histórico do chat anterior não é necessário.

```text
Continue o trabalho de docs/roadmap-github-eficiencia.md.
Leia as instruções atuais de AGENTS.md, o roadmap e o estudo vinculado.
Confira o código, os testes e as alterações locais antes de editar.
Retome a primeira etapa pendente cujas dependências estejam concluídas.
Atualize o roadmap na mesma entrega, marcando somente critérios comprovados
e registrando evidências, limitações e o próximo passo.
Preserve o trabalho existente. Não faça commits, push ou publicação.
O servidor foi iniciado para esta validação e encerrado ao final. Confira o
health antes de reutilizá-lo. Em novas sessões, mantenha-o desligado durante
testes controlados e só consulte GitHub real com autorização explícita atual.
```

Orientações para o assistente que retomar:

1. Leia a visão das etapas, os critérios e o histórico de entregas. Use o estado atual do arquivo, não uma lembrança de outra sessão.
2. Consulte `git status` e os diffs locais. As entregas podem estar sem commit; preserve arquivos novos, alterações e remoções feitas pelo usuário. Não restaure `SPEC_PROGRESS.md` caso continue removido. Se estiver ausente, use as evidências registradas aqui e confira o código atual.
3. No último registro, as etapas 0 a 5 estão concluídas localmente; a etapa 4 passou por validação visual Playwright e a etapa 5 por testes controlados. A primeira pendente é a etapa 6, que exige comparação antes/depois e prova real do conjunto. A leitura anterior de 19 itens em 13,9 s não é comparação antes/depois.
4. Para a próxima etapa, consulte os critérios atuais, o estudo e os módulos/testes citados pela própria etapa. Confira o código atual antes de selecionar a alteração; as referências detalhadas das etapas anteriores não substituem essa inspeção.
5. Reexecute somente as verificações pertinentes à mudança com os comandos de `package.json`. Os 193 testes focados, typecheck, lint e build registrados para a etapa 5, assim como as evidências Playwright da etapa 4, pertencem às entregas anteriores, não a uma execução futura.
6. Preserve os valores históricos da tabela de medições. Ao otimizar, ajuste explicitamente as expectativas dos testes e acrescente a comparação depois da mudança, sem apagar a referência anterior.
7. Mantenha testes com respostas simuladas separados de GitHub real e validação visual. Testes controlados não autorizam iniciar tentativas, chamar providers, recrutar agentes ou publicar recursos.
8. Antes de retomar o servidor ou realizar um ensaio no GitHub real, confira a instrução mais recente do usuário e a autorização correspondente. Não considere o horário antigo de fim da pausa como prova de cota disponível.
9. Ao encerrar a entrega, atualize estados, critérios, medições, histórico e próximo passo neste arquivo. Se parar no meio de uma etapa, registre o que foi alterado, o que passou, o que falhou e o ponto exato de continuação.

Não é necessário recriar o roadmap, repetir o estudo inteiro ou iniciar um pipeline para retomar o trabalho.

## Estado atual

| Item | Situação em 2026-10-30 | Base da informação |
| --- | --- | --- |
| Estudo das consultas e proposta de melhoria | Concluído como estudo | Documento de apoio |
| Controle de concorrência e pausa após rate limit | Já implementado no pacote C12 | Código inspecionado no estudo e `SPEC_PROGRESS.md` |
| Leituras diferentes conforme a finalidade | C12 preservado; etapa 2 acrescenta projeção tipada da fila e primeiras páginas combinadas | `github/client.ts`, `github/queries.ts` e testes controlados |
| Compartilhamento das atualizações | Implementado para observações simultâneas do mesmo escopo; paginação local e reutilização de quadros comuns na mesma busca | Etapa 1, módulo `projects/queue.ts` e testes controlados |
| Leitura de detalhes de todas as issues e possível varredura duplicada | Etapa 3 revalida só o prefixo ordenado até a candidata e repete essa checagem após preparar a tarefa | `projects/queue.ts`, `pipeline/start.ts` e testes controlados |
| Redução adicional de consultas proposta neste roadmap | Etapas 0 a 5 concluídas localmente; etapa 6 em andamento | Comparação controlada e histórico abaixo |
| Ganho real em velocidade e consumo | Amostra atual: 19 itens, 45 envios, 17,2 s; releitura/página sem envios. Mesmo escopo simultâneo compartilha 45; conta/projeto distintos custam 90. Primeira carga continua lenta; sem comparação real pareada | Ensaios delimitados da etapa 6 |
| Novo episódio de rate limit | Relatado pelo usuário | Captura com próxima consulta prevista para 30/10/2026, 14:37:59; não é garantia de liberação nesse horário |
| Servidor local | Desligado intencionalmente pelo usuário | Esclarecimento do usuário; não usar essa parada como causa da lentidão anterior |
| “Reconectando atualizações” na tela durante a execução | Sintoma relatado, causa não determinada | Captura do usuário |
| Mensagem de ausência de conta durante a pausa | Sintoma a investigar | Captura mostra conta vinculada e consulta temporariamente adiada |

O C12 tem conclusão local registrada, com aceite formal pendente. Isso não significa que esta nova evolução esteja concluída. Os 50 testes mencionados no estudo são resultados daquela rodada, não testes executados novamente para este roadmap.

## Visão das etapas

| Ordem | Etapa | Resultado esperado | Estado |
| --- | --- | --- | --- |
| 0 | Medir o problema | Saber onde o tempo e as consultas são gastos | Concluído no escopo controlado |
| 1 | Compartilhar atualizações | Tela e fila automática aproveitam a mesma busca | Concluído localmente; prova real na etapa 6 |
| 2 | Carregar menos informações | A lista não depende da leitura completa de todas as tarefas | Concluído localmente; prova real na etapa 6 |
| 3 | Evitar a segunda varredura completa | Conferir a escolha sem reconstruir todo o quadro | Concluído localmente; prova real na etapa 6 |
| 4 | Melhorar a atualização da tela | Lista anterior continua visível e o estado é claro | Concluída no escopo visual local; rate limit testado com resposta controlada |
| 5 | Regular o consumo e os disparos | Menos repetição e respeito integral à pausa | Concluída localmente; prova comparativa e real na etapa 6 |
| 6 | Validar o conjunto | Comprovar ganhos e preservar o comportamento | Em andamento; comparação controlada pareada, UI e leituras reais delimitadas comprovadas; percurso integral, cooldown real e aceite pendentes |

## Etapa 0: medir antes de mudar

Estado: Concluído no escopo controlado em 2026-10-30. Medição real e verificação visual permanecem na etapa 6.

Criar uma comparação repetível com dados controlados, sem consumir a conta GitHub. Incluir abertura da tela, atualização automática, troca de página e seleção automática simultânea. Usar quadros pequenos e maiores, com carga idêntica antes e depois.

- [x] Registrar quantidade de consultas enviadas, volume recebido e duração da atualização completa.
- [x] Separar as janelas de espera de admissão, execução do transporte simulado e tempo restante local, sem duplicar intervalos sobrepostos; registrar CPU do processo separadamente e seus limites.
- [x] Medir primeira abertura e atualizações seguintes sem mudanças.
- [x] Reproduzir o excesso de leituras com tela e observação usada pela seleção automática juntas, sem acionar início de tentativa.
- [x] Investigar separadamente a reconexão da tela e a mensagem de conta, sem atribuir a causa apenas pela captura.
- [x] Registrar cenário, versão e resultados da referência inicial na tabela de medições.

## Etapa 1: uma busca compartilhada

Estado: Concluído localmente em 2026-10-30. Depende da etapa 0. Prova com GitHub real e browser permanece na etapa 6.

Uma atualização do mesmo quadro deve atender os consumidores compatíveis. Trocar a página da lista não deve refazer a leitura remota do conjunto ainda válido.

- [x] Tela e seleção automática simultâneas compartilham uma sincronização compatível, preservadas as verificações próprias de cada ação.
- [x] Troca de página usa o conjunto já recebido, sem nova varredura remota enquanto ele estiver válido.
- [x] Projetos que compartilham um quadro reutilizam as leituras remotas comuns sem misturar suas configurações e regras.
- [x] Troca de conta ou configuração impede reaproveitamento incorreto de resultados anteriores nas leituras frescas e nas mudanças locais conhecidas.
- [x] Resposta atrasada de uma consulta antiga não substitui o estado da conta/configuração atual.
- [x] Reaproveitamento tem limites de duração e memória e não persiste cópias desnecessárias.

Implementação da etapa 1: observações simultâneas compartilham uma promise por escopo normalizado, configuração e cursor local de eventos. Cursor de página e tamanho da página não criam outra sincronização. Observações sequenciais continuam frescas; habilitar a fila usa uma leitura independente. Quadros e issues repetidos são reutilizados somente durante a construção de uma observação. As verificações de conta que delimitam a busca, configuração, origem e elegibilidade permanecem.

O cache de exibição mantém até oito entradas e validade de até dez segundos, limitada pelo intervalo configurado; resultados incompletos não ficam válidos no cache. O mapa de observações em andamento mantém até oito chaves; quadros/issues auxiliares existem apenas durante a busca e são descartados com ela. Não há nova persistência. Escopos diferentes ainda podem realizar buscas independentes. Troca externa de conta só pode ser detectada em uma nova observação: a tela pode mostrar a leitura anterior dentro dessa validade curta, mas ela não autoriza ações.

Testes específicos cobrem compartilhamento tela/scheduler, tamanhos distintos de página, avanço real de cursor, independência das cópias retornadas, leitura posterior fresca, troca de conta e quadro comum com mapeamento divergente por projeto. Regressões existentes cobrem troca de identidade/configuração/catálogo durante IO, resultado antigo atrasado, falhas parciais, autenticação HTTP/CSRF e as duas observações sequenciais do scheduler antes dos efeitos. A remoção da segunda varredura continua reservada à etapa 3.

## Etapa 2: lista leve e detalhes quando necessários

Estado: Concluído localmente em 2026-10-30. Depende da etapa 1. Prova real permanece na etapa 6.

Buscar primeiro os dados necessários para montar a fila. Carregar informações completas quando a preparação ou o início realmente precisar delas. Agrupar leituras compatíveis em lotes limitados quando isso reduzir o custo medido.

- [x] Listagem deixa de buscar o contexto completo de todas as issues como procedimento padrão.
- [x] Informações usadas para decidir elegibilidade continuam disponíveis; dado não consultado nunca significa tarefa ausente ou inelegível.
- [x] Ordem, motivos de bloqueio e resultados da fila permanecem equivalentes nos cenários de referência.
- [x] Paginação do GitHub é respeitada, inclusive em quadros grandes e listas relacionadas.
- [x] Detalhes necessários são carregados antes da ação correspondente.
- [x] Comparação comprova redução de consultas e/ou volume, discriminando os dois ganhos.

Implementação da etapa 2: `purpose: 'queue'` retorna `IssueQueueContext`, sem campos `comments` e `references`, em vez de se apresentar como contexto completo. O texto e o título permanecem porque o contrato exige diagnosticar objetivo e critérios inválidos na própria fila. Responsáveis, bloqueios, vínculos e valores de Status continuam completos; não foi aplicado filtro que esconda tarefas ou elimine motivos de bloqueio.

A primeira consulta de cada issue reúne cabeçalho e primeiras páginas de responsáveis, bloqueios e vínculos. As continuações seguem independentes, com os cursores de cada conexão; os valores dos vínculos mantêm os lotes limitados existentes. No caso simples, isso troca cinco chamadas por issue por duas. Preparação e início continuam usando o contexto completo, com comentários e referências quando necessários; autoridade e confirmações específicas permanecem separadas.

Documentação consultada via Context7: [paginação GraphQL](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api) e [limites de consultas](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api). O agrupamento não aumenta o teto de resposta nem cria uma consulta gigante do quadro com todas as conexões de todas as issues.

Testes novos comparam a projeção com os mesmos fatos do contexto completo, incluindo issue fechada, bloqueio aberto, múltiplos responsáveis, responsável ausente, vínculo ausente e critérios inválidos. Testes de contrato verificam que comentários/referências não estão na projeção. Conexões ausentes e falha de continuação de cada lista mantêm a leitura incompleta. As regressões de agrupamento, paginação, equivalência pública e início automático continuam exigidas.

Medição da etapa 2, mesmo cenário simples de duas fontes: 20 tarefas exigem 48 envios em vez de 108 (55,6% menos); 200 exigem 408 em vez de 1.008 (59,5% menos). Amostras atuais de abertura: 0,36 s e 2,26 s respectivamente. Tela e observação simultâneas continuam compartilhadas: 48 ou 408 envios, contra 216 ou 2.016 antes das etapas 1 e 2. Primeira leitura ainda cresce com o número de tarefas e cada atualização após expirar o cache continua uma leitura completa da fila.

Volumes sintéticos atuais: 30.780 bytes para 20 tarefas e 292.162 bytes para 200. A fixture antiga devolvia propriedades extras no cabeçalho sintético por espalhar o objeto inteiro da issue; nesta etapa ela foi corrigida para devolver apenas a seleção solicitada e conexões paginadas. Portanto a diferença de bytes com a tabela histórica inclui essa correção da fixture e não comprova isoladamente economia de bytes em produção. A redução de envios foi comprovada; consumo em pontos, bytes reais e latência real continuam pendentes da etapa 6.

## Etapa 3: conferir a tarefa sem percorrer tudo de novo

Estado: Concluída localmente. Dependências das etapas 1 e 2 satisfeitas.

Substituir a segunda varredura completa por verificações suficientes para iniciar a tarefa correta. A redução só pode ser entregue se preservar a ordem e as regras atuais.

- [x] Ciclo normal de seleção deixa de fazer duas varreduras completas do mesmo quadro.
- [x] Antes de iniciar, confirmar conta, configuração e condições atuais da tarefa escolhida.
- [x] Alteração de posição, Status, responsável ou bloqueios entre consulta e início é tratada sem escolha indevida.
- [x] Se a candidata deixar de ser válida, o próximo passo segue uma regra testada que preserva a ordem exigida.
- [x] Concorrência, cancelamento e alteração de configuração não provocam início duplicado.
- [x] Lista reaproveitada para exibição nunca funciona, sozinha, como autorização de início ou publicação.

O scheduler faz uma observação completa para atualizar os ciclos Ready. Sem candidata válida, encerra a rodada sem repetir leituras. Com candidata, relê a conta e os projetos anteriores, além dos itens até a posição atual da candidata. Depois de preparar a tarefa e concluir as revalidações de início, repete essa leitura curta imediatamente antes da aceitação local. Só inicia se a mesma tarefa continuar sendo a primeira elegível. Mudança de ordem ou perda de validade encerra a rodada; o próximo polling reavalia a fila atual. O pipeline criado em `http/app.ts` também usa a observação fresca, separada do cache de exibição.

O GitHub não oferece uma transação para congelar todos os itens entre uma leitura e a seguinte. A decisão usa o último estado observado; uma mudança remota posterior a essa leitura não pode ser serializada com a aceitação local.

## Etapa 4: tela útil enquanto atualiza

Estado: Concluída no escopo visual local em 2026-10-30 com Playwright MCP/Chrome. Rate limit foi validado por resposta controlada no navegador; não houve rate limit real confirmado nesta rodada.

- [x] Após uma leitura válida, atualizar não apaga a última lista para mostrar uma tela vazia.
- [x] Exibir horário da última leitura e distinguir atualização em andamento, informação antiga e falha.
- [x] Na primeira abertura sem leitura válida, manter estado de espera explícito, sem inventar itens ou contagens.
- [x] Durante rate limit, informar a pausa e a previsão de nova consulta; não prometer sucesso no horário previsto.
- [x] Distinguir conta vinculada de confirmação temporariamente indisponível, preservando bloqueios de segurança.
- [x] Investigar e corrigir a reconexão se reproduzida; se não reproduzida, registrar a limitação sem declarar correção.
- [x] Validar com Playwright MCP os estados renderizados de atualização, falha, recuperação e aviso de rate limit.

O hook já mantinha a última observação durante a atualização e após uma falha HTTP. Agora a tela sinaliza “Atualizando”, identifica como anteriores os dados mantidos durante falha, conserva a hora da última leitura e impede ações de fila enquanto a observação está carregando ou indisponível. Uma resposta de rate limit mostra quando a próxima tentativa está prevista e esclarece que o horário não garante uma resposta. A conta salva é exibida separadamente da identidade observada. O estado “Aplicando atualizações” substitui “Reconectando” quando a conexão está aberta e apenas aguarda a leitura ser aplicada; o estado de reconexão real do EventSource continua separado.

O comportamento do painel e do hook foi exercitado com observações sintéticas e happy-dom. A causa visual do falso “Reconectando atualizações” foi reproduzida no teste de aplicação pendente e corrigida. Em 30/10, Playwright MCP/Chrome abriu `http://127.0.0.1:4310/#principal/fila`: a observação real mostrou 19 itens, conta `@vonderheidon` confirmada e eventos conectados. Durante uma revalidação real, o DOM mostrou `aria-busy=true`, “Atualizando”, 19 linhas preservadas e os controles de revalidar/pausar desabilitados; após a resposta, voltou a “Ligada” com novo horário. Uma resposta HTTP 503 foi simulada somente no `fetch` da aba: o erro manteve as 19 linhas e a hora anterior; a consulta real seguinte retornou à tela estável e limpou o erro. Para conferir a apresentação de rate limit, uma resposta 200 foi anotada na aba com diagnóstico `RATE_LIMITED` e previsão futura; o painel mostrou a pausa e esclareceu que o horário não garante sucesso. A validação não forçou desconexão do EventSource nem esgotou a cota; portanto, não comprova reconexão após queda real nem tratamento de rate limit recebido do GitHub. Na abertura normal, “Aplicando atualizações” avançou para “Atualizações conectadas”. Não houve erros ou avisos no console do browser.

## Etapa 5: menos disparos e proteção antes do limite

Estado: Concluída localmente em 2026-10-30. A verificação de cota usa cabeçalhos existentes; comparação real de consumo e latência continua na etapa 6.

- [x] Eventos próximos são agrupados em uma janela de 250 ms e geram uma leitura compartilhada, sem uma busca por evento.
- [x] Enquanto há uma leitura em andamento, os eventos acumulam no máximo uma leitura de acompanhamento.
- [x] Botões e eventos de fila respeitam a janela local de retry; consultas de conta compartilham o cooldown global do GitHub e a seleção automática respeita `next_poll_at_ms`.
- [x] Os cabeçalhos `x-ratelimit-remaining`, `x-ratelimit-limit` e `x-ratelimit-reset` ajustam o polling da fila quando disponíveis.
- [x] Leituras de exibição usam até dois trabalhadores de issue por observação; observações de ação mantêm até três e compartilham trabalho pendente compatível.
- [x] Nenhuma consulta periódica de saldo foi adicionada; a decisão usa os cabeçalhos das respostas já recebidas.
- [x] Intervalo normal vem de `polling_interval_ms`. A partir de 25% de cota restante, o polling sobe gradualmente até `min(max(polling_backoff_max_ms, intervalo normal), 4 × intervalo normal)`, atingido a 10%. A janela de eventos é 250 ms. Falhas usam backoff exponencial `intervalo × 2^falhas`, limitado por `polling_backoff_max_ms` e seis incrementos.
- [x] Falhas repetidas espaçam novas tentativas; vinte eventos durante a falha não antecipam retry nem criam rajada após recuperação.
- [x] O caminho automático continua fazendo somente leituras; nenhuma mutação GitHub é repetida para recuperar uma falha de leitura.

O controlador conserva a admissão FIFO global de até três consultas simultâneas e o cooldown retornado pelo GitHub. Cada observação de exibição limita os trabalhadores a dois; uma observação isolada não ocupa os três permits, mas isso não reserva capacidade nem garante prioridade para ações. Exibições de escopos diferentes podem ocupar conjuntamente os três permits e ações aguardam os pedidos anteriores na FIFO. Observações de ação podem usar três workers. Quando exibição e ação pedem o mesmo conjunto simultaneamente, compartilham a busca iniciada primeiro, inclusive seu limite de workers. O indicador de cota é mantido em memória por janela de reset e escolhe conservadoramente o menor `remaining` observado nessa janela. A adaptação do polling é local e controlada por fixtures; a redução real de consumo ainda precisa ser medida na etapa 6.

## Etapa 6: comprovar a entrega

Estado: Em andamento. Etapas 0 a 5 preservadas; provas controladas adicionais registradas em 2026-10-30, sem aceite formal.

- [x] Executar testes determinísticos de consultas, conta, fila, concorrência, pausa, invalidação e recuperação. Base anterior: 193 testes da etapa 5. Nesta sessão: 18 testes focados adicionais/reexecutados, discriminados abaixo; nenhuma prova real inferida.
- [x] Executar os checks pertinentes configurados em `package.json`: testes, typecheck, lint e build. Nesta sessão: testes focados, typecheck e lint após adicionar teste; build da etapa 5 permanece evidência anterior, sem alteração de produção nesta sessão.
- [x] Comparar antes/depois com os mesmos dados, duração e sequência de ações no recorte controlado de fila/cliente/transporte: cinco pares, três ciclos nos mesmos offsets virtuais, mesma fixture e sequência. Não é comparação integral de frontend + tick do scheduler nem comparação pareada em rede real; esses limites permanecem abertos.
- [x] Demonstrar zero sincronizações duplicadas simultâneas para o mesmo conjunto compatível. Provas controladas e ensaio real readonly atual: três consumidores do mesmo escopo compartilham `observationId` e 45 envios, inclusive com limites de página diferentes. O tick integral continua fora desse ensaio.
- [x] Demonstrar zero varreduras adicionais por simples troca de página dentro do conjunto válido. Provas controladas e amostra real atual: zero envios na próxima página. A prova real anterior continua separada.
- [ ] Demonstrar zero envios antes do fim da pausa comunicada pelo GitHub, dentro do contexto protegido.
- [x] Avaliar a meta proposta de pelo menos 80% menos envios no cenário repetido e sem mudanças com tela e seleção automática. Na sequência controlada completa, incluindo paginação, 85,19% e 86,51%; no recorte sem paginação, 77,78% e 79,76%. Meta preservada, sem extrapolar para o tick completo ou operação real contínua.
- [x] Definir uma meta numérica de tempo após a medição inicial e comprovar o resultado no cenário controlado: redução mínima de 20% da mediana em cinco pares; resultado de 65,97% e 69,12% para o tempo acumulado até as observações completas. Ganho real de tempo continua não comprovado.
- [x] Validar visualmente lista anterior, carregamento inicial, pausa, conta, reconexão e recuperação. Playwright MCP nesta continuação; 503 e cooldown simulados somente na aba; queda e recuperação do SSE com parada/reinício reais do servidor. Sem rate limit real.
- [x] Executar uma sessão curta e delimitada de leitura no GitHub real após autorização correspondente, registrando consultas e tempos sem segredos.
- [x] Registrar separadamente as limitações do ensaio real: ausência de rate limit em um ensaio não garante ausência futura.
- [ ] Registrar aceite explícito do usuário, sem inferi-lo dos testes.

### Entrega parcial da etapa 6 em 2026-10-30

Escopo desta sessão: somente testes e acompanhamento; nenhum arquivo de produção alterado. `git status --short`, `git diff --stat`, `git diff --numstat` e diffs dos mecanismos pertinentes foram consultados. Alterações locais, arquivos não rastreados e exclusões, inclusive `SPEC_PROGRESS.md`, foram preservados. Nenhuma operação Git de escrita, issue iniciada, agente recrutado ou escrita externa.

Comandos e evidências desta sessão:

- `npm.cmd test -- --run tests/integration/queue-efficiency-baseline.test.ts --disableConsoleIntercept`: 4/4, 15,70 s. Reexecutado para medir a implementação atual com a sequência histórica: carga fria, releitura imediata, próxima página, expiração em 11 s, tela e observação do scheduler sobrepostas, alteração de uma tarefa; cenários de 20 e 200 itens, dois projetos, uma membership/página, atraso sintético de 5 ms por envio. Também verifica bloqueio durante cooldown simulado.
- `npm.cmd test -- --run tests/integration/queue-efficiency-final.test.ts --disableConsoleIntercept`: 3/3, 12,00 s. Novo teste: três ciclos sem mudanças nos offsets virtuais 0/11.000/22.000 ms; em cada ciclo, tela e observação do scheduler sobrepostas, releitura imediata e próxima página. A composição de fila/cliente é de produção com transporte sintético. Não executa tick, preparação, início ou efeitos do scheduler. Log sanitizado local em `.cache/queue-efficiency-final-20261030.log`; resultados essenciais preservados abaixo.
- `npm.cmd test -- --run apps/controller/src/modules/github/admission.test.ts tests/integration/queue-shared-observation.test.ts tests/integration/queue-scheduler.test.ts -t 'FIFO|cooldown|shares pending work|reuses a shared board|workers|invalidates'`: 11 passaram e 66 não selecionados, em três arquivos. Verifica FIFO compartilhada, cooldown após espera, compartilhamento de quadro/mapeamentos, invalidação e limites de workers. Não é execução dos 77 testes desses arquivos.
- `npm.cmd run typecheck` e `npm.cmd run lint`: passaram após adicionar o teste. Build não repetido: não houve mudança de produção; o build aprovado da etapa 5 permanece evidência anterior. Os 193 testes e a validação Playwright da etapa 4 não foram reexecutados nem atribuídos a esta sessão.

| Cenário atual, três ciclos | Itens por observação | Chamadas lógicas por ciclo | Envios por ciclo / total | Bytes por ciclo / total | Duração por ciclo, ms | Pico físico | Pontos |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Tela + observação do scheduler simultâneas, releitura e página | 20 | 26 | 48 / 144 | 30.780 / 92.340 | 415,608; 431,287; 391,608 | 2 | Indisponíveis, transporte sintético |
| Mesma sequência, conjunto maior | 200 | 206 | 408 / 1.224 | 292.162 / 876.486 | 3.272,803; 3.246,517; 3.246,040 | 2 | Indisponíveis, transporte sintético |

Cada ciclo confirmou uma única observação compatível e zero envios adicionais na releitura e na troca de página. Totais de duração das operações medidas: 1.238,503 ms e 9.765,360 ms, respectivamente; não incluem setup/teardown nem representam duração de rede real. A janela virtual usa os mesmos offsets nos dois tamanhos, mas as operações consomem tempo de parede diferente. Bytes incluem a resposta HTTP sintética, não tráfego comprimido real. As chamadas lógicas são instrumentadas no adaptador de domínio; envios físicos são contados no callback do runner.

Comparação disponível, com limites explícitos: a referência histórica de duas observações simultâneas é 216 envios/81.524 bytes para 20 itens e 2.016/784.292 para 200. Hoje, cada ciclo compartilhado faz 48 e 408 envios: redução de **77,78% e 79,76%**, abaixo de 80%, sem arredondar para aprovação. Multiplicar a contagem histórica por três dá referências modeladas de 648 e 6.048 envios, não execuções antigas desta sessão. A referência histórica não mediu esta janela repetida inteira; a sequência atual acrescenta releitura/página depois da sobreposição. Portanto o requisito de antes/depois com os mesmos dados, duração e sequência continua aberto. A correção histórica da fixture de seleção de campos também impede atribuir toda a diferença de bytes à produção.

A meta de 80% fica preservada e pendente, sem revisão silenciosa: neste cenário, após expiração, o custo atual é `2N + 8`, contra `2 × (5N + 8)` na referência simultânea. O custo fixo impede atingir 80% nesses tamanhos. Compartilhamento exige sobreposição: uma observação de ação iniciada após a conclusão da tela permanece fresca e pode reler o conjunto. A prova focada de compartilhamento confirma essa distinção; os resultados não garantem economia igual em sequências desalinhadas ou em operação contínua.

Meta numérica de tempo para a próxima comparação pareada: **reduzir em pelo menos 20% a mediana do tempo até a observação completa**, em pelo menos cinco repetições por versão, mantendo dados, duração, sequência e atraso de transporte iguais. A amostra histórica de aproximadamente 970 ms para 20 itens simultâneos daria 776 ms como referência provisória; a mediana atual de 415,608 ms fica abaixo disso, mas o baseline antigo não tem cinco repetições pareadas. Logo não comprova essa meta. Não estabelecer SLA real a partir de fixture. A amostra antiga real de 19 itens, 45 envios e 13.884 ms permanece somente linha de base anterior, sem depois equivalente.

Cooldown: novo teste recebe 429/`Retry-After: 3` no transporte simulado, verifica zero novos envios em três escopos em `retryAtMs - 1` e recuperação exatamente em `retryAtMs`. Os testes focados também cobrem a rechecagem depois da espera FIFO. Isso comprova o mecanismo controlado; nenhum rate limit real foi provocado ou observado nesta sessão, e o critério real permanece aberto.

Servidor e UI: health em `127.0.0.1:4310` indisponível. Consulta SQLite somente leitura confirmou `factory_settings.automation_enabled = 1`. O bootstrap padrão compõe o pipeline com scheduler; iniciar o servidor não é garantia de somente leitura. Pelo Wire, workspace `aula-ia` confirmado e Shell #5 (`8a5661ce-d7fe-4efb-aace-e5e1a644a1d3`) livre no prompt do repositório canônico. Nenhum comando foi enviado ao terminal. Para preservar a proibição atual de iniciar issues, o servidor permanece parado e a validação visual final não foi executada nesta sessão. A possibilidade de pausar a automação para o ensaio foi apresentada ao usuário; sem autorização e procedimento seguro, não alterar configuração nem iniciar. Permanecem pendentes carregamento inicial, lista anterior, pausa/conta, queda/reconexão real do EventSource e recuperação no bundle final. As capturas Playwright da etapa 4 continuam evidência anterior.

Próximo passo naquela entrega parcial: comparação pareada controlada, pré-requisito de pausa e matriz visual. A continuação abaixo registra o avanço posterior, sem substituir as evidências anteriores.

### Continuação após “prossiga”, 2026-10-30 às 16:54

**Estado final desta continuação: servidor desligado e automação global pausada.** Nenhuma issue iniciada, nenhum agente recrutado, nenhuma publicação, escrita em recursos externos ou operação Git de escrita. O banco continua com cinco tentativas finalizadas e zero ativas. Trabalho local anterior e exclusões preservados. O estado pausado impede novos inícios quando o usuário voltar a ligar o servidor; a fila não foi reabilitada automaticamente.

#### Comparação pareada executada, sem checkout adicional

Adicionados `tests/native/github-efficiency.proof.ts` e `config/vitest.github-efficiency.config.ts`. A prova opt-in lê somente os blobs fixos de `queue.ts`, `client.ts`, `queries.ts` e `transport.ts` em `d036f9dd590188c72dd38eb300b73a378377a9b5`, transpila e avalia em memória. Não há arquivo de fonte histórica, checkout, cópia do repositório, worktree ou opção de produção nova. Armazenamento, contratos e auxiliares atuais são compartilhados pelas duas versões. A referência é desse recorte, não um produto histórico inteiro em execução.

As fixtures expõem o mapa sintético de itens e permitem injetar o cliente/reader de referência. O cabeçalho `QueueIssue` agora devolve conexões somente quando a query as seleciona, para não inventar bytes na referência antiga. A resposta da implementação atual continua igual: sua query seleciona essas conexões. Nenhum comportamento de produção foi alterado.

Cada par usa a mesma instância de dados e SQLite temporário; dois projetos, uma membership e uma página remota por conexão. Cinco pares por tamanho, alternando qual versão roda primeiro. Cada versão executa três ciclos sem mudanças nos offsets virtuais 0/11.000/22.000 ms: leitura da tela com limite sete e observação do scheduler com limite cem simultâneas; releitura imediata; próxima página pelo cursor recebido. Mesmo atraso solicitado de 1 ms por envio nas duas versões. São offsets e duração de domínio iguais, não uma janela de polling contínuo em tempo de parede. Os timers reais têm atraso de agendamento variável, registrado nas durações. A sequência chama `queue.observe`, sem executar tick, preparação, início ou publicação. Comparação de todas as linhas e das páginas passou.

| Itens por observação | Pares × ciclos por versão | Envios antes → depois por ciclo | Envios por janela de três ciclos | Bytes por janela antes → depois | Mediana do tempo acumulado até as três observações completas, ms | Redução de envios |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 5 × 3 | 324 → 48 | 972 → 144 | 318.060 → 92.340 | 3.085,549 → 1.050,153 | 85,19% |
| 200 | 5 × 3 | 3.024 → 408 | 9.072 → 1.224 | 3.039.858 → 876.486 | 29.213,803 → 9.020,348 | 86,51% |

Contagens e bytes foram idênticos nas cinco amostras de cada versão/tamanho. O tempo até a observação completa mede a conclusão da dupla tela/scheduler antes da releitura e da paginação, somado nos três ciclos. Reduções de mediana de 65,97% e 69,12% superam a meta controlada de 20%, definida na entrega parcial. Faixas mín./mediana/máx. desse tempo acumulado: 20 itens antes 2.574,168 / 3.085,549 / 3.293,608 ms, depois 902,707 / 1.050,153 / 1.195,945 ms; 200 itens antes 26.708,040 / 29.213,803 / 29.825,498 ms, depois 8.851,033 / 9.020,348 / 9.166,581 ms.

Tempo da sequência inteira, incluindo releitura/página, mín./mediana/máx.: 20 itens antes 4.399,719 / 5.106,169 / 5.348,320 ms, depois 907,684 / 1.057,134 / 1.200,867 ms; 200 itens antes 39.697,660 / 44.914,140 / 45.272,498 ms, depois 8.872,862 / 9.036,035 / 9.192,762 ms. Valores são amostras locais, sem p95 ou garantia remota.

Por que a meta passou nesta sequência: o baseline revarre o conjunto também na próxima página. Assim, cada ciclo antigo custa três observações, contra uma hoje. O recorte anterior que comparava somente duas observações sobrepostas continua em 77,78%/79,76%, abaixo de 80%; não houve nova otimização para alterar esse resultado. Não atribuir a diferença entre esses percentuais a uma melhora adicional de produção. Observações de ação posteriores à conclusão da tela continuam frescas. Escopos diferentes compartilham a FIFO global, sem prioridade nem reserva exclusiva; não foi feita uma prova real de múltiplos escopos/telas.

Bytes são respostas HTTP sintéticas, com a mesma fixture corrigida nas duas versões. Não são compressão/tráfego real; pontos indisponíveis. O runner mede envios físicos. Nesta prova, `logical_calls=0` significa ausência da instrumentação de chamadas de domínio usada na fixture anterior, não ausência de chamadas lógicas. Os envios da tabela são medidos, não estimados. Os logs preservam cada ciclo e amostra em `.cache/queue-paired-20261030.log`; as tabelas acima conservam os resultados sem depender do cache.

Identidade: os quatro hashes antes/depois registrados no log formam o fingerprint SHA-256 `7b0c807c4aa7f840337c8598e191b9208733730da04db9b46c3385125fd2decd`; os arquivos de produção medidos foram conferidos sem mudanças após a execução. O carregador não inclui a composição `createGitHub` nem o hook React no antes/depois; seus testes e a matriz visual são evidências separadas.

Comandos desta continuação:

- `npm.cmd test -- --config config/vitest.github-efficiency.config.ts --disableConsoleIntercept`: 2/2 provas, cinco pares por tamanho, 300,31 s. Apenas leitura de blobs Git e transporte sintético, sem rede GH.
- Typecheck inicialmente identificou a propriedade `repetition` duplicada somente na impressão do novo log; corrigida sem mudar medições, assertivas ou fontes de produção. A anotação de ausência de instrumentação lógica foi acrescentada ao log futuro. O benchmark não foi repetido por essas alterações somente de impressão.
- `npm.cmd run typecheck` e `npm.cmd run lint`: passaram após a correção.
- `npm.cmd test -- --run tests/integration/queue-projection.test.ts tests/integration/queue-shared-observation.test.ts tests/integration/queue-efficiency-final.test.ts`: 13/13 em três arquivos, 12,24 s, para verificar as fixtures alteradas e a fronteira do cooldown. Não foi repetida a rodada anterior de 193 testes, nem o build da etapa 5.

#### UI atual pelo Playwright MCP/Chrome

Para permitir a validação sem iniciar issues, foi aplicada a pausa local por `saveQueueChange`, com ETag atual, lock exclusivo do controlador e transação de domínio, antes do startup. Recibo da operação `4274df89-3283-451d-ba0f-0ab925793ee2`: revisão 14, cursor 133. Não foi usado UPDATE SQL avulso nem `openStorage` para essa pausa. Antes dela, a inspeção readonly confirmou ausência de tentativas ativas, exclusões e publicações pendentes.

Health conferido antes de iniciar; workspace e Shell #5 livres e no diretório canônico confirmados pelo Wire. Executado `npm.cmd start` no terminal, usando o build da etapa 5. Health respondeu `{"status":"ok"}`. Servidor iniciado duas vezes, somente para a matriz visual e a queda/recuperação; foi encerrado com Ctrl+C, resposta ao prompt de término do batch e confirmação do health indisponível. O Shell #5 retornou ao prompt. Não foram encerrados processos alheios.

Resultados visuais desta continuação:

- Carregamento inicial: zero linhas, `aria-busy=true`, “Consultando fila” e total não confirmado; resposta retida na aba para captura.
- Leitura real completa: 19 linhas, conta `@vonderheidon confirmada`, fila “Pausada”, zero elegíveis. Não foi acionado Habilitar fila.
- Atualização retida na aba: 19 linhas preservadas, “Atualizando”, última conta observada, controles de atualização/habilitação bloqueados.
- 503 injetado na resposta da aba: 19 linhas mantidas, “Dados desatualizados”, erro e instante de retry. Não é falha real do GitHub.
- Parada real do servidor: “Falha nas atualizações” com linhas preservadas. Após reinício real, transições capturadas no DOM: “Falha nas atualizações” → “Conectando atualizações” → “Aplicando atualizações” → “Atualizações conectadas”. A desconexão real não precisa usar literalmente o rótulo “Reconectando”, que também pertence ao fluxo de resync.
- `RATE_LIMITED` simulado na resposta da aba com janela de 10 s: aviso com horário e ressalva de que não garante sucesso; conta continuou confirmada, 19 linhas e botão Revalidar bloqueado. Vinte eventos locais não geraram nova consulta nos primeiros cinco segundos. Houve uma consulta ao terminar a janela, com recuperação das linhas e conexão. O teste determinístico anterior é a prova exata de `retryAtMs - 1`/fronteira; a captura visual não mede esse último milissegundo.

Capturas em `.playwright-mcp/`: `stage6-initial-final-20261030.png`, `stage6-ready-20261030.png`, `stage6-updating-20261030.png`, `stage6-failure-20261030.png`, `stage6-offline-20261030.png`, `stage6-reconnected-20261030.png`, `stage6-cooldown-20261030.png` e `stage6-recovered-20261030.png`. Captura de cooldown inspecionada visualmente, além das verificações de DOM. Console registrou erros de recurso esperados do 503 e do servidor desligado; não declarar console sem erros. Nenhum erro fora dessa categoria foi encontrado no log consultado.

Limites: depois da leitura inicial encaminhada, as respostas de fila foram reaproveitadas em memória na aba para limitar novas consultas. O harness final contou oito GETs locais de fila e um encaminhamento real; navegações preliminares também fizeram leituras, logo esse contador não é o total GitHub da sessão. O scheduler do servidor continua lendo mesmo com automação pausada; seus envios e os das navegações não foram medidos integralmente. A matriz visual não prova orçamento total de operação. A aba foi retirada do produto ao final para não continuar consultando.

#### Amostra real delimitada após desligar o servidor

Pelo Shell #5 confirmado novamente livre, às 17:06:28 BRT, executado probe de leitura via fila/cliente/runner compilados, com banco readonly, teto de 60 envios, 90 s e interrupção preventiva com saldo abaixo de 1.000. Sem servidor, scheduler, bootstrap ou mutação GH. O relatório antigo não foi sobrescrito; artefatos desta rodada: `.cache/github-stage6-read-probe.mjs` e `.cache/github-stage6-read-probe-result.json`.

| Fase atual real | Itens | Envios | Bytes de resposta GH, incluindo headers | Duração |
| --- | ---: | ---: | ---: | ---: |
| Carga fria | 19, completos e válidos; página de sete | 45 | 126.979 | 17.207 ms |
| Releitura imediata | Mesmos 19 | 0 | 0 | 1 ms |
| Próxima página | Mesmos 19, sete na página | 0 | 0 | 1 ms |

Duração total do probe: 17.214 ms. Operações físicas: duas identidades, uma consulta de repositório, branch, projeto, campos e itens do quadro; 19 `FactoryQueueIssue` e 19 `FactoryItemValues`. Sem retry ou rate limit; automação permaneceu pausada, zero elegíveis e apenas diagnóstico `GLOBAL_AUTOMATION_PAUSED`. Headers na mesma janela: primeiro `remaining=4999, used=1`, último `remaining=4985, used=15`, limite 5.000, reset epoch 1793394391. A diferença observada entre primeira e última resposta é 14 pontos; não inclui o custo anterior à primeira resposta nem exclui outros consumidores da conta. Não converter 45 envios em 45 pontos.

**A primeira carga real continua lenta.** A referência antiga permanece 19 itens/45 envios/126.984 bytes/13.884 ms; a nova amostra é 19/45/126.979/17.207 ms. Foram realizadas em horários e estados operacionais diferentes, sem snapshot remoto ou condições de rede equivalentes, e a pausa global mudou o estado local. Não há base para declarar melhora real, regressão causal ou cumprimento da meta real de tempo. Não houve redução de envios da carga fria nesse recorte; o ganho de paginação/releitura foi confirmado novamente.

#### Compartilhamento e escopos, ensaio real readonly adicional

Às 17:10:40 BRT, com servidor desligado e Shell #5 confirmado livre, executado `.cache/github-stage6-shared-probe.mjs`, com o mesmo cliente/runner compilado e banco readonly. Teto de 200 envios, 120 s e saldo mínimo de 1.000; nenhum tick, início ou mutação GH. Usa um reader raiz compartilhado pelas instâncias da fila. Resultado sanitizado em `.cache/github-stage6-shared-probe-result.json`.

| Fase real | Consumidores/escopos | Itens por consumidor | Envios | Tempo |
| --- | --- | --- | ---: | ---: |
| Mesmo escopo simultâneo | Tela limite 7 + tela limite 25 + observação de ação limite 100 | 19 / 19 / 19 | 45 | 17.366 ms |
| Escopos distintos simultâneos | Conta + projeto, ambos com limite 7 | 19 / 19 | 90 | 21.361 ms |
| Ação após concluir a tela | Nova observação de ação, limite 100 | 19 | 45 | 13.400 ms |

Os três consumidores compatíveis receberam exatamente o mesmo `observationId`; escopos conta/projeto receberam IDs diferentes, e a observação de ação posterior também teve ID novo. Todas completas e válidas, com automação desabilitada. Total de 180 envios, 508.050 bytes de respostas GH incluindo headers, 52.132 ms e pico de três chamadas simultâneas ao runner, sob a admissão global compartilhada. As durações entre fases não são benchmark causal de dois versus três workers: há condições de rede e ordem diferentes.

Headers inicial/final: `remaining=4969/4939`, `used=31/61`, limite 5.000, resets epoch `1793394392/1793394391`. Os resets diferem em um segundo; registrar os valores sem assumir uma única janela exata ou atribuir a diferença de 30 pontos exclusivamente ao ensaio. Não houve rate limit. O teto do probe não inclui as consultas do servidor/browser anteriores, que foram registradas como não medidas integralmente.

Esse ensaio confirma em rede real o compartilhamento pendente do mesmo escopo e o teto global de três, mas também o limite: conta/projeto distintos reobservam o conjunto mesmo quando há apenas um projeto, e ações fora da sobreposição não reutilizam autoridade concluída. A implementação continua com até dois workers por exibição e três por ação, com fila FIFO compartilhada; os testes controlados verificam esses limites por observação e a ausência de prioridade para ações. Não houve simulação de mudanças no quadro remoto, múltiplos projetos reais ou medição de justiça/latência da FIFO entre vários projetos.

Próximo passo atual: medir a janela integral de frontend + tick do scheduler, incluindo consumidores sem sobreposição e múltiplos projetos, com automação pausada e orçamento explícito; preservar a primeira carga lenta como lacuna, sem ampliar a implementação dentro desta etapa. Se ocorrer naturalmente um rate limit real, capturar a janela e os envios para comprovar o critério real sem provocar esgotamento da cota. Comparação pareada real de tempo/consumo, cooldown real e aceite explícito permanecem pendentes. Etapa 6 continua em andamento, sem aceite formal. Ao final, health indisponível, Shell #5 livre, cinco tentativas finalizadas e zero ativas; automação global permanece pausada.

### Correção da mensagem do dashboard após relato às 17:24

Reproduzido no Playwright MCP com o servidor já ativo, reutilizado sem reiniciar: resposta completa e válida às 17:25:16 continha as issues #24 e #25 com `status=Ready` e `ready=true`, mas zero elegíveis. #24 tinha `ALREADY_CONSUMED` e #25 `OPEN_BLOCKERS`. A página não tinha continuação. Portanto a leitura reconhecia o Status; o texto “Nenhuma issue pronta nesta página da fila” confundia presença em Ready com disponibilidade como próximo candidato.

Corrigido somente o texto no cartão existente de `apps/web/src/features/operations/DashboardPanel.tsx`, sem alterar filtro, elegibilidade, consumo, ordenação ou ações. Quando há Ready na página mas nenhum próximo candidato, a mensagem informa a quantidade e orienta consultar os motivos na fila. Não foram iniciadas ou reexecutadas issues nem removidos bloqueadores.

Regressão em `DashboardPanel.rendering.test.ts`: renderiza o componente com duas issues Ready, uma consumida e outra bloqueada; verifica a distinção e ausência de ação Preparar. O teste falhou com a mensagem antiga e passou após a correção. Rodada final com `DashboardPanel.test.ts`: 11/11; typecheck, lint, build e diff check passaram. Build necessário pela alteração da UI; mantém o aviso de chunk acima de 500 kB. Não foram repetidas as provas de desempenho anteriores, pois o carregamento e os leitores não mudaram.

Playwright após recarregar o bundle `/assets/index-B7A0atxm.js`: às 17:28:25 mostrou “2 issues em Ready nesta página, mas nenhum próximo candidato disponível. Abra a fila para consultar os motivos.”, zero elegíveis e nenhuma ocorrência da mensagem antiga. Captura `.playwright-mcp/dashboard-ready-candidates-fixed-20261030.png`. Essa prova visual atual complementa as capturas anteriores, que pertencem ao bundle anterior. Não resolve a carga fria lenta nem representa aceite formal.

O servidor encontrado ativo foi preservado; automação global foi consultada e estava pausada, sem tentativas ativas. A aba usada no diagnóstico foi retirada do produto ao terminar para não manter polling adicional. Não houve escrita Git ou externa.

## Medições

### Ensaio real autorizado pelo Shell #5

Em 2026-10-30, às 15:05:51 no horário de Brasília, o usuário autorizou testar leitura real pelo Shell #5. O terminal foi confirmado livre no repositório canônico pelo feed Wire; o comando foi enviado somente a esse terminal. O servidor permaneceu desligado. Foi usado o cliente compilado atual com `GraphQLReader` e `createGhRunner` reais, no contexto Windows do terminal, com teto de oito envios e sem repetição automática.

Resultado: conta `vonderheidon` confirmada; descoberta da issue #35 de `vonderheidon/fabrica-de-software`; nova projeção `queue` retornou `complete`, sem diagnósticos, comentários ou referências. A observação encontrou zero responsáveis, um bloqueio e um vínculo de quadro; isso não declara a issue elegível para execução.

| Operação real | Envios | Tempo do runner | Bytes de resposta, incluindo headers |
| --- | --- | --- | --- |
| Identidade | 1 | 672 ms | 1.266 |
| Descoberta de uma issue | 1 | 733 ms | 1.294 |
| Cabeçalho da fila com conexões iniciais | 1 | 737 ms | 3.972 |
| Valores do vínculo | 1 | 715 ms | 1.624 |
| Total do ensaio | 4 | Duração total: 2.864 ms | 8.156 |

O último header informou `remaining=4998`, `limit=5000`, `used=2`, recurso `graphql`; não houve rate limit nessa rodada. São leituras pontuais dos headers, não prova de que o ensaio foi o único consumidor da conta ou de que cada envio custou um ponto. A leitura específica da issue precisou de dois envios; os outros dois serviram para confirmar conta e escolher o alvo.

Limites: uma issue, uma membership, sem continuação adicional nessa amostra; não percorreu a Fila Ready inteira, scheduler, HTTP/UI, preparação, início ou publicação. Não compara a versão anterior com a nova em rede real, não comprova a redução percentual real, não garante ausência de bloqueios futuros e não substitui a validação visual. Não houve mutação no GitHub. O relatório local sanitizado está em `.cache/github-read-probe-result.json`; esta seção conserva o resumo caso o cache seja removido. Credenciais e conteúdo de issues não foram persistidos no relatório.

### Fila completa com dados reais pelo Shell #5

Em 2026-10-30, às 15:12:46 no horário de Brasília, após autorização explícita do usuário, foi executada uma leitura completa pelo `createQueue` e cliente/runner compilados atuais. Os leitores reais de configuração, histórico, ciclos e tentativas acessaram o banco operacional em modo SQLite `readonly`; a inspeção de origem e o Git também foram reais. Não foi usado `openStorage`, que executa manutenção no startup. Não houve bootstrap do servidor, scheduler, início de tentativa ou alteração de configuração.

| Fase real | Resultado | Envios GitHub | Tempo |
| --- | --- | --- | --- |
| Carga inicial da fila completa | Um projeto no escopo, 19 itens observados; completa e válida, zero elegíveis e nenhum diagnóstico de leitura | 45 | 13.884 ms |
| Releitura imediata do mesmo conjunto | Completa e válida, mesmo total | 0 | 1 ms |
| Próxima página | Sete itens da página seguinte; mesma observação completa | 0 | 1 ms |

Os 19 itens foram efetivamente observados na primeira carga; a página de sete itens não limitou a leitura remota aos primeiros sete. O total de respostas do ensaio foi 126.984 bytes, incluindo headers. Foram 19 consultas `FactoryQueueIssue`, 19 `FactoryItemValues`, duas de identidade e uma de cada: repositório, branch, projeto, campos e itens do quadro. Saldo final observado: 4.961 pontos restantes. Não houve rate limit ou retry. O Shell #5 retornou ao prompt.

Conclusão operacional: a primeira carga real ainda demora aproximadamente 14 segundos e continua fazendo duas chamadas por issue. O ganho de paginação e releitura imediata foi confirmado na carga real, mas isso não torna a atualização completa rápida. A etapa 3 evita repetir essa varredura no scheduler; será necessário reavaliar agrupamento entre issues para reduzir ainda mais a primeira carga, com medição e preservação da paginação. Não declarar o problema de lentidão resolvido com este ensaio.

Limites: usa a fila de produção e dados reais através de uma composição de leitura, sem passar por HTTP ou browser. Não mede o tempo de renderização da tela, eventos ou o ciclo inteiro do scheduler; não compara a versão antiga em rede real. A automação consta habilitada na configuração, mas não foi executada por este teste. Relatório sanitizado: `.cache/github-queue-probe-result.json`; este resumo conserva os resultados sem depender da permanência do cache.

### Comparação controlada antes/depois

| Cenário | Antes: consultas / volume / tempo | Depois: consultas / volume / tempo | Evidência |
| --- | --- | --- | --- |
| Primeira abertura, 20 tarefas | 108 / 40.762 bytes / aproximadamente 0,56 s | Etapa 1: 108 / 40.762 bytes / aproximadamente 0,69 s; etapa 2: 48 / 30.780 bytes / aproximadamente 0,36 s | Teste `queue-efficiency-baseline`, cenário `20-issues:cold`; ressalva de bytes abaixo |
| Atualização sem mudanças, 20 tarefas | Dentro do cache: 0 / 0 bytes / menos de 1 ms; após expirar: 108 / 40.762 bytes | Etapa 1: dentro do cache, zero envios; após expirar, 108 / 40.762 bytes / aproximadamente 0,72 s | `warm-cache` e `refresh-expired` |
| Tela e observação do scheduler simultâneas, 20 tarefas | 216 / 81.524 bytes / aproximadamente 0,97 s | Etapa 1: 108 / 40.762 bytes / aproximadamente 0,70 s; etapa 2: 48 / 30.780 bytes / aproximadamente 0,33 s | `screen-and-scheduler-observation`; não executa o tick completo nem o início |
| Troca de página, 20 tarefas | 108 / 40.762 bytes / aproximadamente 0,65 s | Etapa 1: zero envios / zero bytes remotos / aproximadamente 0,63 ms | `next-page`, cursor real da página anterior |
| Uma tarefa alterada, 20 tarefas | 108 / 40.774 bytes / aproximadamente 0,64 s | Etapa 1: 108 / 40.774 bytes / aproximadamente 0,70 s | `one-issue-changed` |
| Primeira abertura, 200 tarefas | 1.008 / 392.146 bytes / aproximadamente 4,96 s | Etapa 1: 1.008 / 392.146 bytes; etapa 2: 408 / 292.162 bytes / aproximadamente 2,26 s | `200-issues:cold`; ressalva de bytes abaixo |
| Troca de página, 200 tarefas | 1.008 / 392.146 bytes / aproximadamente 4,77 s | Etapa 1: zero envios / zero bytes remotos | `200-issues:next-page` |
| Tela e observação do scheduler simultâneas, 200 tarefas | 2.016 / 784.292 bytes | Etapa 1: 1.008 / 392.146 bytes; etapa 2: 408 / 292.162 bytes / aproximadamente 2,20 s | `200-issues:screen-and-scheduler-observation` |
| Rate limit e recuperação | Resposta de bloqueio: 3 envios / 491 bytes; nova observação durante pausa: zero envios. Recuperação após pausa ainda não medida | Não implementado | `throttle` e `during-cooldown` |
| Dois projetos usando o mesmo quadro com 10 tarefas | Sem amostra anterior específica; havia leitura por projeto na implementação anterior | Etapa 1: 55 envios; etapa 2: 25 envios. Uma listagem do quadro e dez leituras de issue | `queue-shared-observation.test.ts`, com mapeamentos iguais e divergentes |

Quando houver GraphQL real, registrar também os pontos consumidos, se disponíveis. Menos chamadas não significa necessariamente menos pontos. Separar resultados simulados de resultados reais.

Ressalva dos bytes na etapa 2: a fixture de cabeçalho foi corrigida para respeitar a seleção de campos; não atribuir toda a diferença de volume histórico à otimização de produção. Detalhes e limites na seção da etapa 2. Tempos são amostras locais, não uma garantia de latência real.

### Condições e limites da referência inicial

Base de produção: HEAD `d036f9dd590188c72dd38eb300b73a378377a9b5`, com estudo, roadmap e novo teste locais ainda sem commit. Composição pública GitHub, fila e SQLite reais; transporte substituído por respostas sintéticas, sem rede ou subprocesso GH. Dois projetos com 10 ou 100 tarefas cada, uma membership por tarefa, uma página remota por conexão, páginas de exibição de sete itens e atraso configurado de 5 ms por envio. Intervalo simulado de 11 segundos para expirar o cache. Tempos são amostras de execução local sujeitas à carga da máquina, não previsão de velocidade do GitHub real nem percentis estatísticos.

Instrumentação informa separadamente espera acumulada na admissão, tempo acumulado do provedor simulado e duração total. Esses tempos se sobrepõem sob concorrência e não podem ser somados ou subtraídos para afirmar tempo exclusivo de CPU. Exemplo de 20 tarefas simultâneas: cerca de 2.083 ms de espera acumulada, 1.080 ms de provedor acumulado e 967 ms de duração total.

Complemento de medição: `BackendMeasurement.timingBreakdown` calcula a união dos intervalos, contando sobreposições uma vez. Em uma abertura com 200 tarefas: total de 5.261,14 ms; janela de transporte de 5.206,05 ms; janela de admissão de 2,82 ms; união de esperas/transporte de 5.206,18 ms; restante fora dessas janelas de 54,96 ms. CPU do processo na amostra: 266 ms em usuário e 78 ms em sistema. Em duas observações simultâneas: total de 10.122,77 ms; união de esperas/transporte de 10.107,62 ms; restante de 15,15 ms. Isso demonstra que não se pode usar os 29.237,81 ms de espera acumulada como duração da atualização.

O restante inclui processamento local e agendamento. CPU mede o processo de teste inteiro, incluindo geração das respostas sintéticas e instrumentação; pode ocorrer durante as janelas das outras consultas. A janela de transporte inclui a construção da resposta simulada. Esses números separam operacionalmente as etapas, mas não são um perfil exclusivo de CPU por função nem latência do GitHub real. Há um teste de relógio controlado que verifica sobreposição e tempo restante com valores exatos.

O novo teste confirma excesso em leituras simultâneas, mas não executa o scheduler completo, preparação ou início de tentativa. A segunda varredura do scheduler continua comprovada por inspeção em `pipeline/start.ts:210-217`, não por esse percurso integrado.

Reconexão: `useControllerEvents.ts` também mostra “Reconectando” quando o canal está conectado, mas a leitura da tela ainda não foi aplicada. Os testes existentes de `applied-observations.test.ts` exercitam esse comportamento. Portanto o texto, isoladamente, não prova perda de conexão. O episódio da captura não foi reproduzido.

Conta: `GitHubSetupPanel.tsx` exibe a mensagem de nenhuma conta elegível quando a verificação retornou e a lista está vazia, mesmo havendo `retry_at_ms`. Essa combinação explica como as duas mensagens podem coexistir; não prova que o vínculo foi removido. Correção visual permanece na etapa 4.

Reprodução: `npm.cmd test -- --run tests/integration/queue-efficiency-baseline.test.ts --disableConsoleIntercept`. As linhas `QUEUE_BASELINE` contêm contagens, bytes, duração e esperas sanitizadas. As expectativas de custo são a referência anterior à otimização e deverão ser revistas explicitamente quando o comportamento melhorar, preservando esta tabela histórica.

## Limites e decisões preservadas

- Sem webhook obrigatório, endereço público ou serviço externo novo.
- Sem alterar credenciais, fazer login novamente, trocar tokens ou ampliar permissões para contornar rate limit.
- Sem retirar verificações de segurança para ganhar velocidade.
- Sem mudar a definição de Ready, a ordem da fila ou os modos de entrega silenciosamente.
- Sem novas cópias de workspace, commits, push, publicações ou alterações no tracker por causa deste roadmap.
- O servidor foi reativado temporariamente em 2026-10-30 para a validação Playwright e as leituras reais descritas no histórico; depois foi encerrado. Health ficou indisponível, não havia listener em 4310 e o PID do controlador não existia.
- Não prometer eliminar todos os limites do GitHub: outros programas e limites dinâmicos também podem afetar a conta.

## Histórico de entregas e evidências

| Data | Entrega | Evidência | Limitações |
| --- | --- | --- | --- |
| 2026-10-30 | Estudo prévio concluído | `docs/estudo-github-eficiencia-20261030.md`; registra inspeção e 50 testes controlados aprovados naquela rodada | Sem benchmark real e sem implementação da proposta |
| 2026-10-30 | Roadmap criado | Este documento, confrontado com estudo, `SPEC_PROGRESS.md`, regras e comandos atuais do repositório | Apenas documentação; nenhum teste de produto reexecutado, servidor não iniciado |
| 2026-10-30 | Referência inicial controlada da etapa 0 | Novo `tests/integration/queue-efficiency-baseline.test.ts`; execução conjunta com `applied-observations.test.ts` e `admission.test.ts`: 27/27 testes passaram. `npm.cmd run typecheck` e `npm.cmd run lint` passaram | Sem rede, servidor, browser ou GitHub real; falta isolar processamento local. Uma execução intermediária do cenário grande excedeu 30 s; limite do teste ajustado para 60 s e rodada final aprovada em 38,48 s no total |
| 2026-10-30 | Etapa 0 concluída: atribuição das janelas de tempo | Alterados `tests/fixtures/backend-measurement.ts` e o novo teste de referência. Medição + regressões do medidor: 31 testes passaram; teste exato de sobreposição adicional: 1 passou. Typecheck, lint e `git diff --check` passaram | Somente instrumentação de testes e roadmap; nenhuma alteração de produção, rede ou servidor. Limites da atribuição e amostras registrados acima |
| 2026-10-30 | Etapa 1 concluída localmente | Alterado `apps/controller/src/modules/projects/queue.ts`; adicionado `tests/integration/queue-shared-observation.test.ts`; ajustadas expectativas em `queue-efficiency-baseline.test.ts`, `backend-measurement.test.ts` e `observation-backend.test.ts`. Rodadas focadas: 66 testes de regressão; 24 testes de medição/backend/compartilhamento; 82 testes de medição/regressão/scheduler. Após ampliar o cenário de mapeamento divergente: 3 testes específicos passaram. Typecheck, lint, build e diff check passaram | Suíte completa: 2.111 passaram e 2 excederam 10 s em `current-storage-open.test.ts`; repetição isolada desse arquivo passou 4/4 sem alteração. Não declarar suíte completa integralmente aprovada. Sem GitHub real, UI renderizada ou servidor ativo. Build manteve aviso de chunk acima de 500 kB |
| 2026-10-30 | Etapa 2 concluída localmente | Alterados `github/client.ts`, `github/queries.ts`, `github/index.ts` e o tipo consumido por `projects/queue.ts`. Adicionado `tests/integration/queue-projection.test.ts`; atualizados contratos, fixtures e expectativas de custo nos testes. Primeira rodada focada: 109 testes; GitHub + medição/projeção/compartilhamento: 211 testes. Rodada final `npm.cmd test -- --testTimeout=30000`: 2.126 testes passaram em 176 arquivos. Typecheck, lint, build e diff check passaram | Limite por teste da rodada completa elevado de 10 para 30 s somente no comando, sem mudar a configuração do repositório, devido aos timeouts registrados na etapa 1. Build manteve aviso de chunk acima de 500 kB. Nenhuma consulta real, ativação de servidor ou prova visual; limites de bytes sintéticos registrados acima |
| 2026-10-30 | Etapa 3 concluída localmente | Alterados `pipeline/start.ts`, `projects/queue.ts`, `projects/index.ts` e `http/app.ts`; testes em `queue-scheduler.test.ts` e `attempt-transactions.test.ts`. Rodada final em seis arquivos: 181 testes passaram. Em 20 tarefas com a primeira candidata na primeira posição, a prova controlada contou 20 chamadas iniciais e duas chamadas adicionais lógicas à projeção de fila, total 22; uma segunda varredura completa repetiria as 20 chamadas. Sem candidata, não ocorre leitura adicional. Typecheck, lint, build e diff check passaram | Provas só com fixtures locais; sem GitHub real, servidor, interface ou scheduler contra dados do operador. A API remota não oferece snapshot transacional. O build manteve o aviso do bundle JavaScript acima de 500 kB. A primeira carga real de 19 itens e 13,9 s continua sem comparação antes/depois |
| 2026-10-30 | Consulta real autorizada pelo Shell #5 | Probe temporário `.cache/github-read-probe.mjs`, usando cliente compilado e runner reais; quatro envios, 2.864 ms, projeção da issue #35 completa e sem diagnósticos; saldo final observado de 4.998/5.000 | Leitura pontual, sem servidor ou escrita externa; não é benchmark real antes/depois, percurso completo da fila ou aceite formal |
| 2026-10-30 | Fila inteira em leitura real pelo Shell #5 | `.cache/github-queue-probe.mjs`; fila, origem/Git, leitores reais e banco operacional readonly. 19 itens, 45 envios, 13.884 ms; releitura e próxima página: zero envios, 1 ms cada. Sem rate limit | Primeira carga ainda lenta; sem HTTP/browser, scheduler ou comparação antiga/nova em rede. Nenhuma tarefa iniciada ou configuração alterada |
| 2026-10-30 | Etapa 4 implementada localmente | Alterados `QueuePanel.tsx`, `queue.css`, `PrincipalScreen.tsx`, `useControllerEvents.ts`, `controller-events.ts` e `EventConnectionStatus.tsx`. Adicionado teste de hook `useQueue.test.ts`; atualizados os testes renderizados do painel e do estado de observações. Rodada final focada em seis arquivos: 68 testes passaram; typecheck, lint e build passaram | Happy-dom e renderização React, sem servidor. O servidor foi mantido desligado; o requisito Playwright MCP da etapa permanece pendente. Build manteve aviso de bundle JavaScript acima de 500 kB |
| 2026-10-30 | Etapa 4 validada no Playwright MCP/Chrome | Health local `{"status":"ok"}`; fila real exibiu 19 itens e conta `@vonderheidon`. Durante atualização: `aria-busy=true`, “Atualizando”, 19 linhas preservadas e botões de fila desabilitados. 503 simulado no navegador exibiu falha com observação anterior mantida; resposta real seguinte recuperou estado “Ligada”. Diagnóstico de rate limit simulado na resposta da aba mostrou previsão e aviso de que o horário não garante sucesso. Capturas: `.playwright-mcp/page-2026-10-30T19-05-50-192Z.png` (fila estável) e `.playwright-mcp/page-2026-10-30T19-08-06-843Z.png` (aviso de rate limit) | Teste real fez somente leituras, sem mutações GitHub nem início de issue. 503 e `RATE_LIMITED` foram injetados somente na aba; sem rate limit real confirmado ou desconexão forçada do EventSource. Console sem erros/avisos. O bundle manteve o aviso de chunk acima de 500 kB |
| 2026-10-30 | Etapa 5 concluída localmente | `transport.ts`, `client.ts`, `github/index.ts`, `projects/queue.ts`, `useQueue.ts`, `QueuePanel.tsx`, `PrincipalScreen.tsx` e fixtures/testes. `npm.cmd test -- apps/controller/src/modules/github/admission.test.ts apps/controller/src/modules/github/github.test.ts tests/integration/queue-scheduler.test.ts tests/integration/queue-projection.test.ts tests/integration/queue-shared-observation.test.ts tests/integration/attempt-transactions.test.ts tests/integration/observation-backend.test.ts apps/web/src/features/queue/useQueue.test.ts tests/queue-panel-rendering.test.ts`: 193/193 em 9 arquivos; typecheck, lint e build passaram | Validação só com fixtures locais, sem GitHub real ou Playwright nesta etapa; não há comparação real de consumo. Leituras de exibição limitadas a dois workers por observação; escopos distintos ainda compartilham a admissão FIFO global. Build mantém aviso de chunk acima de 500 kB |

| Data | Entrega nesta sessão | Evidência | Limitações |
| --- | --- | --- | --- |
| 2026-10-30 | Etapa 6 avançou nas provas controladas | 4 testes de baseline, 3 novos testes de janela repetida/fronteira de cooldown e 11 testes focados de FIFO/compartilhamento/workers/invalidação passaram. Typecheck e lint passaram; build anterior preservado. Três ciclos: 48 envios/30.780 bytes por ciclo para 20 itens; 408/292.162 para 200. Compartilhamento e paginação sem envios adicionais confirmados nas fixtures | Meta de 80% não atingida contra as contagens históricas: 77,78% e 79,76%. Antes/depois pareado, pontos reais e UI final pendentes. Servidor não iniciado: automação operacional habilitada, sem autorização para iniciar issues. Detalhes e próximo passo na entrega parcial da etapa 6 |
| 2026-10-30, continuação após 16:54 | Etapa 6: comparação pareada controlada, Playwright e leitura real | Duas provas opt-in, cinco pares por tamanho, mais 13 testes de regressão; typecheck e lint passaram. Redução controlada de 85,19%/86,51% na sequência com paginação. Matriz visual e queda/recuperação real do SSE registradas. Amostra real fria: 19 itens/45 envios/126.979 bytes/17.207 ms. Ensaio real de compartilhamento/escopos: 180 envios/508.050 bytes/52.132 ms, pico global três | Sem ganho real pareado de tempo/consumo, sem cooldown real, sem tick integral ou aceite. Carga fria continua lenta. Servidor desligado e automação global pausada; detalhes na continuação acima |

Próxima etapa documentada: continuar a etapa 6 pela janela integral de frontend + tick do scheduler/múltiplos projetos e pela comparação real pareada, preservando orçamento e proibição de novos inícios. A comparação controlada, a matriz visual, os ensaios reais delimitados e a correção posterior da mensagem do dashboard estão documentados acima; não repetir esses checks sem causa concreta. Cooldown real e aceite explícito permanecem abertos. Na última verificação, o servidor estava ativo e foi preservado; a automação salva estava pausada.
