# SPEC_PROGRESS - Otimização da comunicação com o GitHub

## Status: 10/10 sprints concluidas (aceite formal pendente)
Ultima atualizacao: 2026-10-30T08:07:05.543Z

---

## Sprint 001 - Baseline reproduzível e fronteiras de medição [CONCLUIDA]
- Identificação da versão de entrada: Identificar as fontes efetivamente usadas e as alterações locais relevantes para permitir comparação e preservação do trabalho existente.
- Cargas sintéticas e oráculos anteriores à mudança: Disponibilizar cargas repetíveis de contexto completo, fila, autoridade, confirmação e falhas, mantendo o comportamento de produção original nesta sprint.
- Relatório inicial de custo sanitizado: Registrar a baseline executada e ampliar somente a instrumentação de teste necessária à comparação de C12.

## Sprint 002 - Composição do runner e encerramento físico observável [CONCLUIDA]
- Tetos de resposta: `createGitHub` encaminha `responseBytes`; testes compostos cobrem respostas agrupadas de 2 e 3 memberships acima de 4 MiB dentro dos tetos de 8/12 MiB, respostas simples acima de 4 MiB e respostas agrupadas excessivas. O envelope sintético inclui UTF-8 não ASCII e confirma contagem única por resposta.
- Ciclo de vida do subprocesso: falha lógica, pedido de kill e `close` têm estados internos separados. A medição mantém encerramento desconhecido após falha e atualiza o estado quando o `close` tardio chega; `CommandResponse` e a assinatura pública `GhRunner` permanecem inalteradas. Não foi introduzida espera de admissão.
- Observação: erro de `observeQuery` não substitui sucesso nem classificação de falha do runner. O log de `main.ts` continua medindo duração do wrapper, sem alegar espera de admissão ou encerramento físico.
- Validação em Node.js v24.22.0: testes GitHub (136), medição integrada (26) e suíte completa (2033 em 171 arquivos) passaram; typecheck, lint e build passaram. O build reportou somente aviso de chunk acima de 500 kB. Provas usam runners simulados e `FakeChild`; não executam subprocesso GitHub real nem rede externa.

## Sprint 002 - Composição do runner e encerramento físico observável [CONCLUIDA]
- Tetos de resposta preservados pela API composta: Garantir que a composição pública encaminhe o teto solicitado ao runner concreto.
- Distinção entre falha lógica e término do processo: Preservar informação interna suficiente para que o controle posterior retenha capacidade enquanto um subprocesso enviado não tiver encerramento conhecido.
- Instrumentação sem influência no resultado: Impedir que observeQuery altere o resultado ou a classificação do transporte.

## Sprint 003 - Orçamentos seguros sob concorrência e cooldown [CONCLUIDA]
- Reservas por operação: `GraphQLReader` reserva consulta e bytes de resposta de forma síncrona antes de iniciar o runner. O teto de cada envio é o menor entre 4/8/12 MiB e o saldo livre depois das demais reservas; scopes distintos têm budgets independentes.
- Liquidação: Resposta concluída troca a reserva pelo tamanho UTF-8 observado. Falha anterior ao envio devolve consulta e bytes; falha pós-envio mantém a reserva conservadora. Recusa por saldo não inicia runner nem consome orçamento.
- Operações compostas: paginação, collect, scaffold e board reutilizam o scope da operação; a primeira página fornecida a collect não é debitada outra vez. Cooldown continua compartilhado pela instância e passa a preservar o maior retryAtMs ainda ativo entre respostas concorrentes.
- Cobertura nova em `apps/controller/src/modules/github/admission.test.ts`: concorrência no saldo final, limites agrupados e independência de scopes, 250 consultas, consumo exato de 16 MiB, falhas antes/depois do envio, reuse da primeira página e cooldown compartilhado. Cobertura existente mantém os limites de paginação, cursores, IDs, nós e continuações por membership.
- Validação em Node.js v24.22.0: testes GitHub e medição integrada (169/169 em 10 arquivos), suíte completa (2040/2040 em 172 arquivos), typecheck, lint e build passaram. O build manteve somente o aviso de chunk web acima de 500 kB. Evidências usam runners simulados; não houve consulta ao GitHub real.

## Sprint 003 - Orçamentos seguros sob concorrência e cooldown [CONCLUIDA]
- Reservas concorrentes por operação: Impedir ultrapassagem dos limites de consultas e bytes quando envios disputam o mesmo saldo.
- Paginação e agrupamento sem débito duplicado: Preservar as garantias de collect e dos scopes ao aplicar a contabilização concorrente.
- Cooldown compartilhado e classificações existentes: Manter bloqueio de novos envios por rate limit em todos os scopes da instância.

## Sprint 004 - Autorização revogável e limitada dos efeitos de publicação [CONCLUIDA]
- Prazo único no reader: O quinto argumento interno de `GraphQLReader.query` aceita `beforeSend`, `signal` e `deadlineMonotonicMs`. O estágio fixa o menor valor entre 60.000 ms após sua aquisição, o prazo externo e o prazo herdado; leituras dependentes e páginas compartilham sinal e prazo via contexto assíncrono. A guarda monotônica também verifica `now >= deadline` imediatamente antes do runner. Não foi ativada fila FIFO.
- Cancelamento e encerramento: Expiração retorna `unavailable/QUERY_LIMIT`; cancelamento retorna `unavailable/QUERY_FAILED`. A reserva é devolvida somente quando não houve envio. O sinal atravessa a resolução tardia do contexto e o subprocesso; processo enviado continua distinguível até seu evento físico de fechamento. Callbacks que não terminam não mantêm a resposta lógica aberta nem podem despachar quando resolvem depois.
- Efeitos de publicação: Comentário, Status e PR executam autorização em `beforeSend`. Inspeção inicial, mutação e leitura própria de PR compartilham o deadline. Identidade, claim, revisão, `sourceOperationId`, `assertEffectAuthorized`, recibos e readback de Status continuam ativos; nenhuma mutação é repetida automaticamente. Continuação revogada de Publication verifica o sinal após cada leitura antes de consultar novamente, gravar autoridade ou cancelar domínio.
- Cobertura: `apps/controller/src/modules/github/authorization.test.ts` usa relógio controlado para 60.000 ms, 7.000 ms, prazo externo maior, deadline vencido, igualdade com timer pendente, três leituras de 14.000 ms, paginação, segunda observação por stamp, aborto durante autorização e corrida entre cancelamento e resposta após envio. Testes de efeitos e PR mantêm unknown, negação, cooldown, contexto, identidade e ausência de replay; a integração Publication cobre revogação durante uma leitura pendente.
- Validação em Node.js v24.22.0: testes GitHub e `publication.test.ts` (199/199 em 11 arquivos), typecheck, lint e build passaram. O build manteve o aviso de chunk web acima de 500 kB (1.166,65 kB). As provas usam runners e fixtures controlados; não houve consulta ao GitHub real nem publicação externa.

## Sprint 004 - Autorização revogável e limitada dos efeitos de publicação [CONCLUIDA]
- Contrato temporal único da autorização: Acrescentar ao reader o estágio anterior ao envio, com cancelamento e deadline internos, preservando os argumentos existentes.
- Encerramento lógico e descarte de continuações tardias: Garantir resposta finita mesmo quando a autorização não coopera, sem conceder autoridade por conclusão posterior.
- Autorização junto ao envio de todos os efeitos: Aplicar beforeSend às mutações de comentário, Status e PR sem alterar suas identidades ou reconciliação.
- Provas determinísticas do prazo total: Comprovar o estágio temporal nos efeitos e em Publication antes da introdução da fila agregada.

## Sprint 005 - Autorização limitada de criação e quadro [CONCLUIDA]
- Criação e descrição sob autoridade fresca: `createScaffoldRepository` e `describeScaffoldRepository` autorizam em `beforeSend`; leituras de preparação, mutação e confirmação compartilham o menor prazo entre 60.000 ms e qualquer prazo herdado. Revogação preserva `CREATION_AUTHORITY_CHANGED`, e descrição não confirmada permanece `unknown`.
- Mutações de quadro e callbacks: Todos os ramos mutantes passam por `beforeSend`; `markSent`, motivos existentes e confirmações por identidade foram preservados. Callbacks de `projects/scaffold.ts` verificam a etapa após identidade, catálogo e reconciliação antes de iniciar outra leitura ou gravar estado local. FIFO permanece desativada.
- Cobertura temporal: T05/T09/T10 nos writers de scaffold e A05/A06 no board cobrem prazo padrão e herdado, igualdade com o deadline, autorização pendente, retorno/rejeição tardios e cancelamento durante leitura/contexto. `tests/integration/remote-scaffold.test.ts` cobre revogação durante a confirmação do repositório.
- Auditoria e validação: envios mutantes de `effects.ts`, `scaffold.ts` e `board.ts` auditados; suíte `apps/controller/src/modules/github` mais `tests/integration/scaffold.test.ts` e `tests/integration/remote-scaffold.test.ts` passou (251/251 em 12 arquivos). `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram; o build mantém apenas o aviso de chunk web acima de 500 kB. Provas usam runners controlados; não houve acesso ao GitHub real ou mutação externa.

## Sprint 005 - Autorização limitada de criação e quadro [CONCLUIDA]
- Criação e descrição sob autoridade fresca: Vincular a autorização atual de criação e atualização de descrição ao estágio anterior ao envio.
- Mutações do quadro e callbacks revogáveis: Adaptar os envios de board e as continuações dos callbacks de criação ao contrato temporal.
- Regressão temporal dos writers de criação: Comprovar expiração, cancelamento e ausência de efeitos tardios nos percursos de criação e quadro.

## Sprint 006 - Admissão FIFO compartilhada e isolamento dos turnos [CONCLUIDA]
- Fila agregada: Cada reader raiz possui três permits compartilhados por seus scopes e chamadas repetidas de `runnerFactory`. A admissão é FIFO, expira em no máximo 15.000 ms ou no deadline herdado/externo e remove entradas canceladas ou vencidas. Readers de instâncias diferentes mantêm filas independentes.
- Leituras de autorização: Um callback `beforeSend` adquire o permit antes de executar. Leituras da mesma instância usam o turno em uma fila serial própria, preservam orçamento e cooldown, e compartilham sinal/deadline. Operações aninhadas que não são leituras são recusadas; callbacks tardios não reutilizam permits encerrados. A autorização final ocorre depois da admissão e a mutação usa o permit já adquirido.
- Capacidade física: Permits de processos iniciados permanecem ocupados até o `close`, mesmo depois de a resposta lógica terminar por falha. Entradas seguintes vencem sem criar outro processo quando o fechamento não chega; resposta acima do teto reservado esgota o saldo de bytes da operação.
- Cobertura: `admission.test.ts` cobre FIFO, limite três, factories repetidas e instâncias distintas em `createGitHub`, fronteira de 15 segundos, deadline externo, aborto, cooldown durante espera, `close` tardio/ausente, leituras dependentes concorrentes, recusa de mutação aninhada e bloqueio de continuações tardias. `effects.test.ts`, `scaffold.test.ts` e `board.test.ts` comprovam admissão sob saturação e uma única mutação. Medições integradas agora esperam pico físico três.
- Validação em Node.js v24.22.0: testes GitHub (178/178 em 10 arquivos), suíte completa (2.077/2.077 em 173 arquivos, quatro workers), typecheck, lint e build passaram. O build manteve somente o aviso do chunk web acima de 500 kB (1.166,65 kB). As provas usam runners/fixtures controlados; não houve tráfego ou mutação real no GitHub.

## Sprint 006 - Admissão FIFO compartilhada e isolamento dos turnos [CONCLUIDA]
- Fila agregada por instância: Concentrar admissão dos envios GraphQL no reader composto e compartilhá-la entre seus scopes.
- Leituras dependentes sem deadlock ou bypass: Permitir que a autorização consulte a mesma instância sob o turno adquirido, preservando limites e isolamento.
- Capacidade física e limpeza nas corridas: Vincular liberação de capacidade ao encerramento conhecido sem bloquear indefinidamente a resposta lógica.

## Sprint 007 - Projeções tipadas de issue por finalidade [CONCLUIDA]
- Autoridade: `IssueAuthorityContext` seleciona ID, estado, repositório, assignees, blockers e memberships com Status; título, body, comentários e referências ficam fora da consulta.
- Confirmações: `IssueCommentConfirmationContext` carrega todas as páginas de comentários; `IssueStatusConfirmationContext` carrega memberships e páginas individuais de valores. Ambas selecionam somente ID e `repository.id` na issue, sem agrupamento obrigatório.
- Integridade: todas as projeções por ID validam input textual, `__typename === 'Issue'` e igualdade do ID; conexões ausentes, parciais, inválidas ou inacessíveis não completam a leitura, preservando diagnósticos e o maior `retryAtMs`.
- Compatibilidade: chamadas padrão e `queue` preservam `IssueContext | ProjectItem`, conteúdo, paginação e agrupamento de primeiras páginas de até três memberships. Publication não foi migrada.
- Assinaturas em `GitHubClient['getIssueContextById']`:
  - `(id: string) => Promise<GitHubQueryResult<IssueContext | ProjectItem>>`
  - `(id: string, options: { purpose: 'queue' }) => Promise<GitHubQueryResult<IssueContext | ProjectItem>>`
  - `(id: string, options: { purpose: 'authority' }) => Promise<GitHubQueryResult<IssueAuthorityContext>>`
  - `(id: string, options: { purpose: 'comment_confirmation' }) => Promise<GitHubQueryResult<IssueCommentConfirmationContext>>`
  - `(id: string, options: { purpose: 'status_confirmation' }) => Promise<GitHubQueryResult<IssueStatusConfirmationContext>>`
- O alias `GitHub` mantém a superfície padrão/`queue` dos consumidores existentes; a superfície completa de finalidade é `GitHubClient` e a inferida por `createGitHub`.
- Cobertura T07/T08 e A07/A10 em `apps/controller/src/modules/github/github.test.ts`; suíte completa: 2.096/2.096 em 173 arquivos. Typecheck, lint e build passaram; o build mantém o aviso do chunk web acima de 500 kB (1.166,65 kB). Provas usam fixtures controladas; não houve consulta ao GitHub real.

## Sprint 007 - Projeções tipadas de issue por finalidade [CONCLUIDA]
- Interface especializada e identidade exata: Disponibilizar retornos inferidos pela finalidade sem enfraquecer IssueContext.
- Seleção e completude de autoridade: Ler somente os dados obrigatórios à decisão de autoridade.
- Seleção e completude de confirmação: Disponibilizar projeções específicas para a prova de comentário e Status.
- Compatibilidade dos contextos completo e queue: Preservar conteúdo, paginação e agrupamento dos consumidores existentes.

## Sprint 008 - Publication por finalidade e regressão de despacho [CONCLUIDA]
- Autoridade pertinente: Publication usa `purpose: 'authority'`, não depende de `body` e mantém as leituras frescas de identidade, projeto e repositório, além dos bloqueios e da persistência de autoridade existentes.
- Reconciliação exata: comentário e Status usam suas projeções; resultados de mutação ficam `unknown` até a confirmação por identidade, completude, autor/hash/marcador/URL ou membership/campo/opção exatos. Divergência, duplicação e páginas parciais não liberam o próximo efeito.
- Compatibilidade de despacho: fila continua em `purpose: 'queue'`, com três workers, elegibilidade, ordenação, cache e backoff atuais; preparação e início seguem com contexto completo e duas observações frescas.
- Ponto adicional de composição (D3): `apps/controller/src/http/app.ts` precisou reter o tipo completo de `createGitHub` no `githubRuntime` para encaminhar as sobrecargas por finalidade ao Publication. O alias `GitHub` e os contratos externos permaneceram sem ampliação.
- T03: PASS — teste integrado de medição percorreu client direto e `createGitHub` composto; as observações simultâneas preservaram o limite físico e os workers lógicos previstos. Fonte: `backend-measurement.test.ts`.
- T07: PASS — suíte GitHub validou projeções e compatibilidade dos contextos completo/queue: 197 testes em 10 arquivos.
- T08: PASS — confirmação usa leituras completas por finalidade; regressões de autor ausente, URL inválida, marcador divergente, duplicata, página parcial e resposta de mutação isolada permaneceram sem confirmação indevida.
- T09: PASS — regressões integradas preservaram autorização revogável, stamp, recibos, ausência de repetição e bloqueio de efeitos seguintes: cadeia integrada 130/130.
- T10: PASS — testes GitHub de autorização/admissão e os efeitos integrados passaram sem deadlock ou reenvio.
- T12: PASS — nenhuma alteração em schema, DTO/rota, UI ou autenticação; tipagem da fila e checks de fronteira passaram.
- A07–A10: PASS — projeções e completude por finalidade (197 testes GitHub); reconciliação exata, autorização e despacho (130 testes integrados); escopo conferido no diff.
- Validação local: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, suíte GitHub e a cadeia de `backend-measurement`, `observation-baseline`, `queue-scheduler` e `publication` passaram. Build mantém o aviso já conhecido do bundle web acima de 500 kB.
- Evidência usa SQLite e respostas/efeitos controlados. Não houve chamadas ao GitHub real, publicação externa ou aceite formal do pipeline.

## Sprint 008 - Publication por finalidade e regressão de despacho [CONCLUIDA]
- Autoridade com projeção pertinente: Usar authority em observeCurrentAuthority e preservar todas as regras existentes de autorização.
- Reconciliação exata de comentário e Status: Selecionar as projeções de confirmação mantendo a prova e a decisão dentro de Publication.
- Fila, preparação e duas observações frescas: Integrar a tipagem e as fixtures novas sem mudar semântica de exibição ou despacho.

## Sprint 009 - Comparação final das duas frentes de C12 [CONCLUIDA]
- Baseline sprint-001 preservada sem preenchimento retroativo; a medição final registra 89 amostras sanitizadas, hashes das fontes e as mesmas cargas, atrasos e sequências reproduzidas em três repetições por percurso.
- Frente A: client direto e `createGitHub` medem envios, bytes conhecidos, reserva conservadora desconhecida, pico físico/lógico, espera de admissão, cooldown, tempo sintético e duração total. Duas observações mantêm pico físico 3 e pico lógico agregado 6; instâncias distintas têm controles independentes.
- Frente B: authority, confirmação de comentário e confirmação de Status verificam seleções dispensadas e oráculos completos. Os registros demonstram redução de envios/bytes por finalidade e explicitam o ajuste de seis bytes do envelope UTF-8 e a correção D1 no agrupamento composto.
- Matriz: T01–T11 e A01–A09/A11 PASS, com regressões de orçamento, deadline/aborto, dependências concorrentes, leituras independentes, tarefas tardias, cooldown, resultado incerto e os três writers sob saturação.
- Validação: 329 testes passaram em 14 arquivos GitHub e quatro integrações; `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build` passaram. O build manteve o aviso conhecido de chunk web acima de 500 kB.
- Evidência exclusivamente sintética; não houve chamadas ao GitHub real, provider ou publicação externa. A sprint de integração/aceite formal permanece separada.
- Relatório e JSONL: `.lionclaw/pipelines/architecture-review/20261029_211418-4de31f/C12-measurement-20261030-final.md` e `C12-measurement-20261030-final.jsonl`.

## Sprint 009 - Comparação final das duas frentes de C12 [CONCLUIDA]
- Comparação controlada de custo e concorrência: Medir a versão final com os mesmos dados, relógios, atrasos e ordem da baseline.
- Redução comprovada por finalidade e equivalência: Demonstrar o efeito das projeções sobre seleções, envios e bytes preservando decisões de domínio.
- Matriz adversarial consolidada: Conferir cobertura executada de limites, isolamento, prazo total e efeitos incertos no percurso final.

## Sprint 010 - Compatibilidade, checks finais e evidência de entrega [CONCLUÍDA — ACEITE FORMAL PENDENTE]
- A01–A12: PASS com referências individuais no relatório final do run; T12 confirma contratos HTTP/fila e ausência de mudança pública em schema, auth, DTOs, dependências e configuração.
- Cadeia final após correção: GitHub 197/197; quatro integrações 132/132; typecheck, lint, suíte completa 2.106/2.106, HTTP 5/5, acceptance 64/64, build e dois smokes compilados — todos com exit code 0.
- A suíte inicial identificou um cenário de teste que mockava o wrapper sobrecarregado em vez do `issueReader`; o teste foi corrigido no seam certo, passou isolado 11/11 e a cadeia completa foi repetida.
- Fingerprint estável da versão testada: 737 arquivos, SHA-256 `01eca24bf4016610d7d0891357396c662e5ccd357825b8beb57020e44a1abb56`, HEAD `3c211a7892622405bae65eb83219742dcc2bc283`.
- Provas sintéticas e locais. UI renderizada, GitHub/keyring real, Maestri/OMP, publicação e aceite formal não foram executados.
- Rollback documentado sem execução: manter juntos admissão/writers e projeções/consumidores; preservar intenções, recibos e efeitos `running/unknown`; não inferir término por reinício/kill.
- Relatório e logs: `.lionclaw/pipelines/architecture-review/20261029_211418-4de31f/compatibility-final-validation-20261030.md` e diretório `final-checks-20261030/`.

## Sprint 010 - Compatibilidade, checks finais e evidência de entrega [CONCLUIDA]
- Contratos públicos e escopo preservados: Comprovar compatibilidade HTTP, frontend, persistência e capacidades externas.
- Cadeia final vinculada à versão entregue: Executar os checks configurados na ordem da SPEC e registrar sua evidência sobre a fonte final.
- Matriz de aceite e limites operacionais: Consolidar a rastreabilidade final e as condições de reversão sem executar rollback ou efeitos externos.
