# Stories e requisitos: reestruturação das verificações da fábrica

## 1. Contexto e limites

Fonte de escopo: `docs/Docs20261022_160728/discovery20261022_160728.md`. Este documento especifica a reorganização das verificações existentes no produto, sem iniciar implementação. Os IDs US, RF e RNF são locais a esta feature e não substituem os identificadores da SPEC.

O operador deve encontrar a causa e a próxima ação junto da configuração ou do objeto correspondente. Configuração concentra prontidão global; projeto, preparação, tentativa e criação apresentam condições próprias; Registros conserva histórico, filtros e paginação.

Não estão incluídos novos diagnósticos, tecnologias, comandos, automações, monitoramento, recuperação, infraestrutura, fluxos de autorização ou reformulação dos controles existentes. Não se exige preflight manual antes de cada rodada. A realocação da UI não implica remover endpoints, tabelas, contratos ou histórico.

Fontes normativas consultadas: `CLAUDE.md`, `SPEC.md`, `GLOSSARY.md` e `INTEGRACAO-MAESTRI-OMP.md`. Aplicam-se especialmente SPEC 1.3, 3.3, 5.1, 5.4, 8.2, 9 e 10.2. Regressões prioritárias: AC-03, AC-04, AC-05, AC-21, AC-22 e AC-27. AC-13, AC-25 e INT-18 delimitam os invariantes de versão e integração. Não foi identificado conflito que demande alteração do contrato.

## 2. Arquitetura existente e pontos de integração

Os caminhos desta seção são relativos à raiz do repositório e representam arquivos existentes consultados no levantamento.

| Responsabilidade | Arquivos ou módulos existentes | Integração esperada |
| --- | --- | --- |
| Composição das superfícies | `apps/web/src/app/PrincipalScreen.tsx`; `apps/web/src/features/projects/ProjectForm.tsx` | Configuração global usa `ProjectConfigurationForm` com `projectId` nulo; configuração de projeto usa o ID do objeto. Preservar essa distinção. |
| Configuração global | `apps/web/src/features/projects/GitHubSetupPanel.tsx`; `apps/web/src/features/projects/ProjectsFolderField.tsx`; `ProjectForm.tsx` | Reutilizar apresentação e ações existentes de GitHub, pasta e acesso a Perfis. Contexto executor pertence à prontidão global. |
| Diagnóstico operacional | `apps/controller/src/modules/diagnostics/index.ts`; `apps/controller/src/modules/storage/diagnostics.ts` | `createDiagnostics` observa configuração, identidade, contexto nativo e recursos. `supportedChecks` limita os checks por escopo. Não executa despacho nem criação. |
| Ciclo de consulta | `apps/web/src/features/records/useDiagnostics.ts` | Já separa leitura, resultado anterior, envio, operação aceita, incerteza e consulta de recibo; a identidade atual usa escopo/objeto e há cancelamento de leitura. Essas proteções são parciais para mudanças de conta/revisão; seu reaproveitamento deve satisfazer US-09 e os cenários de concorrência, sem reformular o mecanismo de diagnósticos ou criar outro protocolo. |
| Histórico atual | `apps/web/src/features/records/RecordsPanel.tsx`; `apps/web/src/features/records/DiagnosticContextPicker.tsx`; `apps/web/src/features/records/useRecords.ts` | Retirar o painel operacional e o seletor de diagnóstico, preservando o histórico independente e seus filtros. |
| Resumo operacional | `apps/web/src/features/operations/DashboardPanel.tsx`; `apps/controller/src/modules/storage/operation-summary.ts` | Substituir repetição de relatório por resumo e acesso ao destino responsável. |
| Projeto e preparação | `apps/controller/src/modules/storage/configuration-reads.ts`; `apps/controller/src/modules/projects/preparations.ts`; `apps/web/src/features/preparations/PreparationDialog.tsx`; `apps/web/src/features/preparations/IssueOptionsNotice.tsx` | Manter pré-requisitos e elegibilidade na origem atual. `IssueOptionsNotice` já agrupa falhas de acesso e exclui revalidação informativa dos bloqueios. |
| Tentativa e recursos | `apps/web/src/features/attempts/AttemptDetailDialog.tsx`; `apps/controller/src/modules/pipeline/start.ts` | Consolidar avisos equivalentes no detalhe, preservando autoridade, recursos, capacidades e revalidação de início. |
| Criação | `apps/controller/src/modules/projects/scaffold.ts`; `apps/web/src/features/projects/ProjectCreationDialog.tsx` | Manter plano, autorização e execução existentes; `CreationResult` já consolida efeitos em `visibleEffects`. |
| Checks da entrega | `apps/controller/src/modules/verification/index.ts`; `apps/controller/src/modules/storage/verification.ts`; `AttemptDetailDialog.tsx` | Comandos definidos no projeto e resultados por rodada/versão continuam separados de diagnóstico operacional. |
| Linguagem do operador | `apps/web/src/app/OperatorSupport.tsx`; `apps/web/src/app/operator-language.ts` | Reutilizar tradução de estados, causas e próximas ações sem exibir conteúdo técnico bruto. |

O projeto usa TypeScript strict, ESM/NodeNext, React/Vite, Fastify, TypeBox e SQLite via better-sqlite3. `package.json` define Vitest e os scripts executáveis. Nomes de código são em inglês, componentes em PascalCase, funções em camelCase, imports relativos com `.js` e contratos pelo alias `#contracts`. SQL permanece em storage e integrações usam interfaces públicas dos módulos. Não há necessidade de introduzir dependências nesta especificação.

Há duas famílias distintas: prontidão operacional observa condições de configuração e ação; checks da entrega executam comandos contra conteúdo identificado. Nenhum resultado da primeira família aprova a segunda ou concede autoridade.

## 3. User stories e critérios de aceite

### 3.1 Configuração global

#### US-01: consultar prontidão junto da configuração

Como operador da fábrica, quero consultar as condições globais junto das configurações correspondentes, para corrigir o pré-requisito no local responsável.

Critérios de aceite:

1. Configuração apresenta condições de GitHub/conta, pasta dos projetos, perfis ativos e contexto Maestri/OMP nas seções correspondentes, sem seletor técnico de contexto.
2. Conta não vinculada, necessidade de novo vínculo, divergência de identidade e leitura indisponível permanecem distinguíveis. Conferir identidade não vincula nem troca conta.
3. Pasta ausente, não confirmada, inacessível ou alterada aparece junto de `ProjectsFolderField`, preservando a confirmação existente.
4. Ausência total de perfis não produz três avisos equivalentes de ausência total, Implementador e Revisor; o aviso mantém acesso ao gerenciamento existente de Perfis.
5. Um resultado Maestri/OMP é apresentado como observação pontual do contexto nativo, sem afirmar execução de provider ou disponibilidade de MCP.
6. A verificação consulta configuração persistida e não apresenta um rascunho não salvo como validado.
7. Configuração preserva as ações manuais existentes de verificar condições globais, atualizar sua leitura e consultar o resultado da operação original nas seções responsáveis: GitHub/conta junto de GitHub, configuração junto de pasta/perfis e contexto Maestri/OMP junto da integração. Reutiliza Verificar status do GitHub e a confirmação da pasta, sem duplicar ações nem vincular/trocar conta implicitamente.

Referências: `ProjectConfigurationForm`, `GitHubSetupPanel`, `ProjectsFolderField`, `createDiagnostics` e `storage/diagnostics.ts`.

### 3.2 Configuração do projeto e preparação

#### US-02: localizar pendências do projeto

Como operador da fábrica, quero encontrar as condições específicas junto dos campos do projeto, para corrigir origem, quadro, Status ou papéis sem procurar um diagnóstico separado.

Critérios de aceite:

1. Origem/remoto não confirmado aparece junto da origem; quadro ausente ou inacessível e mapeamento inválido aparecem junto do quadro/Status; associação ausente ou incompatível de perfis aparece junto dos papéis.
2. Existência global de perfis e associação válida no projeto continuam sendo condições distintas.
3. Alterações locais excluídas e necessidade de revalidação posterior são informações contextuais, sem novo cartão de bloqueio.
4. Catálogo mantém resumo e acesso à configuração; não reproduz o relatório completo.
5. Exclusão pendente e bloqueio de edição por tentativa/publicação mantêm as capacidades e os avisos atuais.
6. Consultar prontidão não descarta rascunhos nem elimina conflito de revisão entre abas.
7. A configuração do projeto preserva verificar as condições próprias de configuração, atualizar sua leitura e consultar o resultado da operação original junto de origem, quadro/Status e papéis, com o projeto aberto como contexto. Condições globais mantêm seu destino em Configuração; preparação conserva somente suas consultas e pré-requisitos existentes, sem novo diagnóstico de preparação.

Referências: `ProjectForm.tsx`, `storage/configuration-reads.ts` e `ProjectDeletionPendingNotice.tsx`.

#### US-03: entender impedimentos antes de iniciar

Como operador da fábrica, quero ver na preparação as condições que afetam a issue selecionada, para saber o que corrigir antes de iniciar uma tentativa.

Critérios de aceite:

1. Consulta parcial ou indisponível aparece junto do seletor de issue e mantém a ação existente de consultar novamente.
2. Falhas equivalentes de acesso já agrupadas por `IssueOptionsNotice` geram uma causa acionável, sem mensagem genérica redundante para a mesma indisponibilidade.
3. Condições para iniciar mantêm os critérios existentes sobre fechamento, tipo, repositório, assignee, vínculo ao quadro, Status, bloqueadores e leitura incompleta, incluindo a exceção existente de nova tentativa fora de Ready.
4. Divergência de remoto/base, repositório arquivado, revisão de configuração ou referência de perfil alterada aparece no resumo/configuração efetiva, sem adoção silenciosa da base ou do rascunho.
5. Critérios não executáveis e configuração efetiva incompleta aparecem junto dos critérios/resumo e preservam a habilitação atual de Iniciar.
6. Revalidação de issue e executor permanece informativa. Impedimento global aparece como resumo contextual e acesso à correção, sem relatório global completo.
7. Iniciar continua revalidando no pipeline, mesmo após uma observação global bem-sucedida; nenhum diagnóstico manual passa a ser obrigatório.

Referências: `PreparationDialog`, `IssueOptionsNotice`, `projects/preparations.ts`, `github/client.ts:assessIssueReadiness` e `pipeline/start.ts`.

### 3.3 Tentativa e versão entregue

#### US-04: distinguir problemas da tentativa

Como operador da fábrica, quero consultar os impedimentos no detalhe da tentativa, para distinguir restrições de autoridade, recursos e versão antes de agir.

Critérios de aceite:

1. Diagnóstico geral e razão de autoridade que representem a mesma causa, contexto e próxima ação geram um único aviso detalhado na superfície.
2. Restrições de autoridade, problemas de recursos e falhas da versão com ações diferentes continuam visíveis separadamente.
3. Acompanhamento perdido, recurso incerto, ownership não confirmado e ausência de observação aparecem junto de Parada, ambiente e ações nativas pertinentes.
4. Consulta de recursos registrados não é apresentada como confirmação de parada física ou de acesso ao conteúdo.
5. O detalhe usa a tentativa aberta como contexto e não solicita escolha de outro contexto para diagnosticar.
6. O detalhe preserva as ações manuais existentes de verificar recursos registrados, atualizar sua leitura e consultar o resultado da operação original junto de Parada, ambiente e ações nativas pertinentes. Condições específicas da tentativa permanecem nesse detalhe; verificações globais têm destino em Configuração. Não se acrescenta capacidade de parada, recuperação ou acesso a conteúdo.

Referências: `AttemptDetailDialog`, `storage/operation-summary.ts` e ramo de recursos em `diagnostics/index.ts`.

#### US-05: manter checks associados à versão

Como operador da fábrica, quero consultar checks na rodada e versão selecionadas, para avaliar os resultados relativos à entrega correspondente.

Critérios de aceite:

1. Comando, diretório relativo e timeout continuam definidos na seção Checks do projeto.
2. Resultados e artefatos continuam no detalhe da tentativa, associados à rodada/versão selecionada, separados de prontidão operacional.
3. Mudar a seleção não apresenta resultado de outra versão como pertencente à atual.
4. Reorganizar diagnósticos não altera a exigência de mesma versão para checks, revisão e publicação; correção exige nova rodada/versão.

Referências: `ProjectForm.tsx:checks-editor`, `AttemptDetailDialog`, `verification/index.ts` e `storage/verification.ts`.

### 3.4 Criação de projeto

#### US-06: consultar condições e efeitos da criação

Como operador da fábrica, quero consultar pré-requisitos e efeitos no fluxo de criação aberto, para distinguir impedimentos, resultados parciais e prontidão posterior do projeto.

Critérios de aceite:

1. Pré-requisitos de scaffold, pasta/destino, capacidade Git, conta e autorização da modalidade remota aparecem no formulário/plano antes da execução, preservando as ações atuais.
2. Diagnóstico de criação não exige nem solicita `maestri_context`, que não é suportado nesse escopo.
3. Criação parcial, falha ou efeito incerto aparece junto das etapas e efeitos preservados, com as ações existentes de consulta/conferência.
4. O mesmo efeito presente nas fontes local e remota não é repetido na apresentação nem na lista de etapas pendentes; estados e proveniência permanecem no backend.
5. Criação concluída com pré-requisitos pendentes para iniciar issue permanece concluída e oferece acesso à configuração do projeto.
6. Consultar uma criação não cria recursos, repete efeitos nem executa reconciliação implicitamente.
7. O resultado da criação preserva as ações manuais existentes de verificar recursos registrados, atualizar sua leitura e consultar o resultado da operação original junto das etapas e efeitos. Condições específicas de configuração/identidade permanecem no formulário/plano ou resultado correspondente, respeitando os checks já suportados; condições globais apontam para Configuração. Não se acrescenta ação ou capacidade de criação/conferência.

Referências: `projects/scaffold.ts`, `ProjectCreationDialog` e `CreationResult`.

### 3.5 Histórico e resumo operacional

#### US-07: consultar histórico em Registros

Como operador da fábrica, quero usar Registros para consultar eventos e histórico, para acompanhar o que ocorreu com os filtros e a paginação existentes.

Critérios de aceite:

1. Registros não apresenta seletor de contexto de diagnóstico, seleção de checks operacionais, Atualizar diagnóstico ou Verificar selecionados.
2. Filtros existentes de projeto, tentativa e operação, opção de incluir eventos técnicos, navegação entre páginas e acesso aos objetos continuam funcionando.
3. Eventos de verificações já persistidos continuam consultáveis no histórico, sem exigir migração ou exclusão por causa da realocação.
4. Consultar histórico não dispara verificação operacional.

Referências: `RecordsPanel`, `DiagnosticContextPicker` e `useRecords`.

#### US-08: acessar a correção pelo resumo

Como operador da fábrica, quero receber no Dashboard um resumo do impedimento e acesso ao local responsável, para prosseguir até a correção sem percorrer relatórios repetidos.

Critérios de aceite:

1. Pendências equivalentes originadas de onboarding, impedimentos e fila não repetem o mesmo cartão detalhado no Dashboard.
2. Resumo global aponta para Configuração ou Perfis; condição do projeto aponta para esse projeto; condição da tentativa aponta para essa tentativa, conforme o caso existente.
3. Causas independentes permanecem distinguíveis e observação antiga de integração não é anunciada como garantia atual.
4. Dashboard não recebe seletor de contexto nem execução centralizada de diagnóstico.

Referências: `DashboardPanel` e `storage/operation-summary.ts`.

### 3.6 Consulta e consistência da apresentação

#### US-09: distinguir resultado atual, anterior e incerto

Como operador da fábrica, quero distinguir falha de consulta, resultado anterior e operação incerta, para consultar o estado correto sem repetir uma ação já aceita.

Critérios de aceite:

1. Resultado anterior preservado durante atualização ou falha de leitura é identificado como anterior; ausência de observação ou leitura parcial não recebe indicação de pronto.
2. Operação aceita, em andamento, resultado incerto e consulta indisponível têm apresentação distinguível e não provocam reenvio automático.
3. Consultar resultado usa a operação original e mantém a correlação e idempotência existentes.
4. Trocar objeto, conta ou revisão impede que resposta atrasada seja apresentada como atual no novo contexto.
5. Falha de consulta não apaga falha de gravação ou da ação original; consultar dados não equivale a salvar.
6. Relatórios persistidos representam observações anteriores e não certificam prontidão atual. Ao concluir uma verificação, fechar a superfície, alterar a revisão e reabrir o mesmo objeto, o resultado original permanece preservado e identificado como observação anterior, distinto da leitura atual de configuração.
7. Respostas de leitura ou ação pendentes de um contexto anterior não aparecem como atuais após mudança de conta ou revisão, inclusive ao fechar/reabrir a superfície ou inverter a ordem de chegada das respostas. Preservar a correlação e o resultado original não autoriza atribuí-los ao novo contexto.
8. Esses critérios protegem a reorganização da apresentação existente; não exigem certificação automática de atualidade, invalidação persistida retroativa, TTL, novo polling, reexecução automática ou infraestrutura, nem reformulação do mecanismo de diagnósticos. A consulta e o acompanhamento de recibos já existentes mantêm sua semântica.

Referências: `useDiagnostics`, operações persistidas em storage e tratamento de revisão/rascunho em `ProjectForm.tsx`.

#### US-10: receber uma causa acionável sem duplicação

Como operador da fábrica, quero receber uma causa e próxima ação por problema equivalente, para identificar a ação necessária sem perder restrições diferentes.

Critérios de aceite:

1. Na mesma superfície, ocorrências com mesma causa, contexto e próxima ação geram um único aviso detalhado.
2. Código igual em projetos ou recursos diferentes não basta para agrupar; causas diferentes com textos parecidos continuam distintas.
3. Pré-requisito e falha de consulta equivalentes produzem uma explicação acionável, mantendo os estados distintos na origem.
4. Toda causa acionável contém próxima ação; superfícies secundárias usam resumo e acesso ao responsável quando isso substitui avisos atuais.
5. Textos visíveis não expõem códigos, IDs internos, recibos ou fatos técnicos brutos. As ações continuam utilizáveis por teclado, com foco preservado.

Referências: `OperatorDiagnosticCard`, `operator-language.ts` e features proprietárias dos avisos.

## 4. Requisitos funcionais

Cada linha define uma obrigação verificável. Os exemplos de códigos pertencem à rastreabilidade técnica, não ao texto do operador.

### 4.1 Prontidão global

| ID | Requisito | Stories | Integração existente |
| --- | --- | --- | --- |
| RF-01 | Apresentar condições globais de conta/GitHub na seção GitHub de Configuração. | US-01 | Reutilizar `GitHubSetupPanel` e observação de identidade de diagnostics. |
| RF-02 | Apresentar condições da pasta junto do campo e confirmação existentes. | US-01 | `ProjectsFolderField`; condições `PROJECTS_ROOT_*` e onboarding em storage. |
| RF-03 | Apresentar ausência de perfis ativos com acesso a Perfis e sem avisos equivalentes por papel quando todos estão ausentes. | US-01 | Pré-requisitos globais de storage e acesso existente em `ProjectForm`. |
| RF-04 | Apresentar a observação nativa Maestri/OMP na prontidão global com seu limite de observação pontual. | US-01 | `diagnostics/index.ts:maestri_context` e `execution.preflight`. |
| RF-05 | Preservar a separação entre verificar identidade, vincular conta e trocar conta. | US-01 | Ações existentes de `GitHubSetupPanel`; conta configurada versus observada. |

### 4.2 Projeto e preparação

| ID | Requisito | Stories | Integração existente |
| --- | --- | --- | --- |
| RF-06 | Posicionar pendências de origem/remoto junto da origem do projeto. | US-02 | `ProjectForm`; `configuration-reads.ts:prerequisites`. |
| RF-07 | Posicionar pendências de quadro e mapeamento junto do quadro/Status. | US-02 | Editor de mapeamento em `ProjectForm`; diagnósticos da consulta. |
| RF-08 | Posicionar ausência ou incompatibilidade dos perfis associados junto dos papéis do projeto. | US-02 | Configuração por projeto e `projects/preparations.ts`. |
| RF-09 | Preservar caráter informativo de alterações locais excluídas e revalidação posterior. | US-02, US-03 | `LOCAL_CHANGES_EXCLUDED`, `EXECUTION_REVALIDATION_REQUIRED`, `ISSUE_REVALIDATION_REQUIRED` e `EXECUTOR_REVALIDATION_REQUIRED`. |
| RF-10 | Manter resumo e acesso ao projeto no catálogo, sem relatório completo de prontidão. | US-02 | Pré-requisitos do catálogo provenientes de `configuration-reads.ts`. |
| RF-11 | Apresentar falhas da consulta de issues junto da seleção, preservando agrupamento de acesso e nova consulta. | US-03 | `IssueOptionsNotice` e `projects/preparations.ts:issueOptions`. |
| RF-12 | Preservar as regras atuais de elegibilidade de issue e a exceção de nova tentativa fora de Ready. | US-03 | `github/client.ts:assessIssueReadiness`; preparação. |
| RF-13 | Apresentar divergências de base, origem, repositório, revisão e perfil junto do resumo/configuração efetiva sem adoção silenciosa. | US-03 | `projects/preparations.ts:observe`; `PreparationDialog`. |
| RF-14 | Apresentar critérios não executáveis e configuração efetiva incompleta junto dos critérios/resumo. | US-03 | `interpretIssue`, `resolve` e estado bloqueado da preparação. |
| RF-15 | Manter nas ações afetadas o resumo de impedimentos globais e acesso à correção pertinente. | US-02, US-03, US-06 | Pré-requisitos atuais e navegação para Configuração, Perfis ou projeto. |
| RF-16 | Preservar habilitação de Iniciar e revalidação real antes do despacho sem exigir verificação manual anterior. | US-03 | `pipeline/start.ts` e preparação atual. |
| RF-17 | Preservar restrições de exclusão pendente e bloqueio de configuração por tentativa/publicação. | US-02 | `ProjectDeletionPendingNotice`, `configurationLock` e storage. |

### 4.3 Tentativa, recursos e checks

| ID | Requisito | Stories | Integração existente |
| --- | --- | --- | --- |
| RF-18 | Apresentar suspensão e autoridade no estado operacional ou ação pertinente da tentativa. | US-04 | `AttemptDetailDialog`, `storage/diagnostics.ts:reason` e autoridade. |
| RF-19 | Apresentar condições de recursos junto das ações de Parada, ambiente e ações nativas, sem inferir parada física da leitura de registros. | US-04 | Recursos/capacidades da tentativa e `diagnostics/index.ts:resources`. |
| RF-20 | Manter a edição de comandos, cwd relativo e timeout na configuração de checks do projeto. | US-05 | `ProjectForm.tsx:checks-editor`; configuração existente. |
| RF-21 | Manter resultados e artefatos de checks associados à rodada/versão selecionada no detalhe da tentativa. | US-05 | `verification`, `storage/verification.ts` e seleção de entrega. |
| RF-22 | Preservar a identidade da versão exigida por checks, revisão e publicação, gerando outra rodada/versão para correções. | US-05 | Contrato existente de verification/pipeline; AC-13 e INT-18. |

### 4.4 Criação

| ID | Requisito | Stories | Integração existente |
| --- | --- | --- | --- |
| RF-23 | Apresentar pré-requisitos existentes de criação no formulário/plano antes da autorização/execução. | US-06 | `scaffold.ts:prerequisites/options/plan/revalidate`; `ProjectCreationDialog`. |
| RF-24 | Limitar diagnóstico de criação aos checks suportados, sem exigir contexto Maestri. | US-06 | `supportedChecks('creation')`: configuration, github_identity e resources. |
| RF-25 | Apresentar falha, parcialidade e incerteza no resultado com etapas e efeitos preservados. | US-06 | `CreationResult` e diagnóstico da criação. |
| RF-26 | Exibir cada efeito equivalente uma vez nas listas da criação, preservando estado e proveniência nas fontes persistidas. | US-06 | `visibleEffects`, `effects`, `remote_effects` e etapas pendentes. |
| RF-27 | Separar sucesso da criação de pendências para iniciar issue, oferecendo acesso ao projeto. | US-06 | `CreationResult.prerequisites` e `onOpenProject`. |

### 4.5 Histórico, resumo e consistência

| ID | Requisito | Stories | Integração existente |
| --- | --- | --- | --- |
| RF-28 | Remover de Registros o seletor de diagnóstico, escolha de checks e comandos de consultar/executar diagnóstico operacional. | US-07 | Painel diagnostics de `RecordsPanel`; `DiagnosticContextPicker`. |
| RF-29 | Preservar histórico, filtros, paginação e eventos existentes de verificação em Registros. | US-07 | `useRecords` e renderização de eventos em `RecordsPanel`. |
| RF-30 | Limitar Dashboard a resumos operacionais e acessos aos destinos, retirando relatórios completos equivalentes. | US-08 | `DashboardPanel`; onboarding, impediments e diagnósticos da fila. |
| RF-31 | Derivar contexto do objeto aberto nas superfícies proprietárias, sem seletor equivalente ao removido. | US-01, US-03, US-04, US-06 | Escopos existentes de diagnostics; preparação continua usando seus próprios pré-requisitos. |
| RF-32 | Consolidar avisos apenas quando causa, contexto e próxima ação forem equivalentes, sem deduplicação indiscriminada por texto ou código. | US-04, US-06, US-08, US-10 | Apresentação das features; preservar informação distinta nas fontes. |
| RF-33 | Identificar explicitamente resultados anteriores, leituras parciais e ausência de observação sem apresentá-los como pronto. | US-09 | Estados de leitura e relatórios de `useDiagnostics`; completude das consultas. |
| RF-34 | Preservar distinção entre falha de consulta, falha de gravação/ação e operação aceita ou incerta. | US-09 | `load`, `actionError`, `verification` e estados de save existentes. |
| RF-35 | Consultar operações aceitas ou incertas pela correlação original sem reenviar a operação automaticamente. | US-09 | Idempotency-Key, recibo persistido e `retryReceipt` existentes. |
| RF-36 | Impedir apresentação de respostas atrasadas como atuais após troca de objeto, conta ou revisão. | US-05, US-09 | Identidade de contexto, revisão, cancelamento e ciclo de vida das consultas. |
| RF-37 | Preservar rascunhos e conflitos entre abas; leitura persistida não pode confirmar salvamento nem validar edição não salva. | US-01, US-02, US-09 | ETag/revisão, persistência de campos editados e recuperação de save em `ProjectForm`. |
| RF-38 | Apresentar causa e próxima ação em linguagem do operador e omitir códigos, IDs internos, recibos e fatos técnicos brutos. | US-10 | `OperatorSupport.tsx` e `operator-language.ts`; AC-27. |
| RF-39 | Preservar nas superfícies responsáveis as ações manuais existentes de verificar, atualizar a leitura e consultar resultado/recibo da operação original: condições globais em Configuração, condições próprias na configuração do projeto e recursos/condições específicas no detalhe da tentativa ou fluxo/resultado da criação. Usar contexto implícito, checks já suportados e ações existentes, sem duplicação, novas capacidades, diagnóstico de preparação, execução ao navegar ou pré-etapa obrigatória. | US-01, US-02, US-04, US-06, US-07, US-09 | Mapa do discovery; `useDiagnostics.refresh/verify/retryReceipt`, `supportedChecks` e controles existentes das superfícies. |

## 5. Requisitos não funcionais

Os critérios abaixo usam contagens e invariantes observáveis. O discovery não define novos limites numéricos de latência, TTL, volume ou disponibilidade; esses valores não são inventados aqui.

| ID | Categoria | Requisito e medida de aceite | Stories |
| --- | --- | --- | --- |
| RNF-01 | Performance | A reorganização deve acrescentar zero execuções de verificações e zero chamadas externas de diagnóstico motivadas apenas pela navegação. Comparar rastros controlados de abertura das superfícies; não introduzir polling ou monitoramento novos. Leituras necessárias à apresentação e consulta de recibos já existentes preservam sua semântica. | US-01, US-07, US-09 |
| RNF-02 | Segurança | Consultar ou navegar deve gerar zero vínculos/trocas de conta, despachos, criações, publicações ou repetições de efeitos. Comprovar com contadores dos adapters controlados. | US-01, US-03, US-06, US-09 |
| RNF-03 | Segurança | Observação global não deve conceder autoridade. Cenários de identidade divergente e autoridade revogada devem manter a mesma recusa de início/publicação já prevista, inclusive após diagnóstico anterior favorável. | US-01, US-03, US-04 |
| RNF-04 | Usabilidade | Para cada conjunto equivalente de causa/contexto/próxima ação, deve existir no máximo um aviso detalhado por superfície; todos os conjuntos independentes devem permanecer representados. Validar fixtures de mesma causa, causa distinta e mesmo código em objetos distintos. | US-04, US-06, US-08, US-10 |
| RNF-05 | Usabilidade | Nas superfícies afetadas, a quantidade de códigos, IDs internos, recibos e fatos técnicos brutos visíveis deve ser zero. Verificar renderização de sucesso, bloqueio, erro e incerteza. | US-10 |
| RNF-06 | Usabilidade e acessibilidade | Todos os controles e acessos preservados ou realocados devem ser operáveis por teclado, com foco visível e manutenção do comportamento de foco dos diálogos. A prova visual deve cobrir desktop e mobile, mantendo o layout aprovado. | US-01 a US-10 |
| RNF-07 | Confiabilidade | Em troca de contexto durante resposta pendente, nenhuma resposta antiga pode aparecer como atual no novo objeto/conta/revisão. Validar inversão controlada da ordem de respostas e fechamento/reabertura das superfícies. | US-05, US-09 |
| RNF-08 | Confiabilidade | Resposta perdida e falha de consulta do recibo não devem causar segundo envio da verificação original. Comprovar uma intenção persistida e correlação preservada ao consultar novamente. | US-09 |
| RNF-09 | Confiabilidade | Falha de leitura com resultado anterior deve preservar esse resultado identificado como anterior; não pode apagar falha da ação original nem produzir indicação de prontidão atual. | US-09 |
| RNF-10 | Confiabilidade | Alteração de configuração deve manter intacta a captura de tentativas em andamento. Conflito entre abas deve preservar a edição local até resolução pelo fluxo existente. | US-02, US-05, US-09 |
| RNF-11 | Arquitetura e manutenção | A UI deve consumir decisões dos módulos responsáveis, com zero regras paralelas novas de elegibilidade/autorização e zero SQL fora de storage. Preservar interfaces públicas, TypeScript strict e contratos existentes; validar com typecheck e lint configurados. | US-01 a US-10 |
| RNF-12 | Integridade histórica | A retirada do painel de diagnóstico deve excluir zero eventos, relatórios ou recibos persistidos por causa da realocação. Os eventos de verificação devem continuar acessíveis pelos filtros e paginação existentes. | US-07, US-09 |

## 6. Validação prevista para implementação

Esta entrega é documental. Os cenários abaixo são critérios futuros de prova, não resultados já obtidos.

| Grupo de prova | Cenários mínimos | Referências existentes |
| --- | --- | --- |
| Decisão e contrato | Mesma causa/contexto/ação agrupada; mesmo código em objetos distintos separado; falha independente preservada; informativos não bloqueiam; início e autoridade revalidados. | `tests/integration/operation-diagnostics.test.ts`; `tests/integration/preparations.test.ts` |
| Renderização e linguagem | Um aviso detalhado por equivalência; causa e próxima ação; ausência de conteúdo técnico bruto; estados anterior/incerto e falha de consulta. | `tests/github-diagnostics-rendering.test.ts`; `tests/diagnostic-receipt-rendering.test.ts` |
| Regressão de histórico | Ausência de controles operacionais de diagnóstico em Registros; filtros, eventos técnicos, navegação e paginação mantidos. | `RecordsPanel`, `useRecords` e testes pertinentes à feature |
| Ações realocadas | Verificar, atualizar leitura e consultar resultado original disponíveis nos destinos de RF-39; contexto implícito; checks suportados; nenhuma execução ao navegar, nova capacidade ou duplicação de Verificar status do GitHub. | US-01, US-02, US-04 e US-06; `useDiagnostics` e controles existentes |
| Versão entregue | Configuração dos comandos mantida; resultados por rodada/versão; nenhuma aprovação transferida a outra versão. | `tests/integration/verification.test.ts` |
| Criação | Efeito equivalente sem repetição; parcialidade e incerteza preservadas; criação concluída separada de prontidão da issue; nenhuma execução por consulta. | `ProjectCreationDialog`, `CreationResult` e contratos de scaffold |
| Concorrência | Concluir verificação, fechar a superfície, alterar revisão e reabrir o mesmo objeto: preservar o resultado original como observação anterior, sem certificar prontidão atual. Mudar conta/revisão com leitura ou ação pendente e inverter a ordem das respostas, incluindo fechamento/reabertura: nenhuma resposta antiga aparece como atual no novo contexto. Preservar rascunho não salvo, conflito entre abas e consulta do recibo original sem reenvio. São proteções da reorganização, sem certificação automática de atualidade, TTL, novo polling ou infraestrutura. | US-09; `useDiagnostics`, `ProjectForm` e operações persistidas |
| UI | Configuração, projeto, preparação bloqueada, tentativa, criação parcial e Registros; navegação por teclado, foco e layouts desktop/mobile com assets atuais. | Playwright MCP/Chrome, conforme SPEC 10.2 e AC-27 |

O teste atual `tests/diagnostic-receipt-rendering.test.ts` monta `RecordsPanel` com relatório de diagnóstico e espera a conclusão nesse painel. Na implementação, essa expectativa deverá acompanhar a superfície proprietária do relatório; Registros deverá ter prova específica da retirada dos controles. A proteção contra exposição de recibos e IDs continua obrigatória.

Comandos já configurados para a fase de implementação: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`. A seleção de testes deve seguir as superfícies alteradas. Compilação, teste controlado, prova visual e prova real de integração são evidências distintas.

Não ampliar ensaios reais para validar esta reorganização visual. Testes padrão e prova de UI não devem chamar providers, recrutar terminais ou publicar recursos implicitamente. Nenhum resultado controlado comprova provider, MCP ou parada física.

## 7. Cobertura do escopo aprovado

| Critério do discovery | Cobertura neste documento |
| --- | --- |
| 1. Prontidão global por seção | US-01; RF-01 a RF-05 |
| 2. Condições no contexto aberto sem seletor | US-02, US-03, US-04 e US-06; RF-06 a RF-19, RF-23 a RF-27 e RF-31 |
| 3. Registros somente histórico e filtros | US-07; RF-28 e RF-29 |
| 4. Impacto global explicado na ação | US-03 e US-08; RF-15 e RF-30 |
| 5. Informativos e bloqueios preservados | US-02 e US-03; RF-09, RF-12 e RF-16 |
| 6. Consulta sem efeitos implícitos | US-01, US-06 e US-09; RF-05 e RF-35; RNF-01 a RNF-03 |
| 7. Incerteza, histórico e contexto | US-09; RF-33 a RF-37; RNF-07 a RNF-10 |
| 8. Checks por projeto/rodada/versão | US-05; RF-20 a RF-22 |
| 9. Linguagem, teclado, foco e layout | US-10; RF-38; RNF-04 a RNF-06 |

Não foram acrescentadas funcionalidades para preencher dúvidas. Este documento não fixa novo TTL de prontidão, algoritmo de equivalência por texto, componente compartilhado obrigatório ou remoção de API. A implementação deve resolver localização de hooks e reaproveitamento mínimo de componentes dentro das responsabilidades existentes e do mapa de destinos do discovery.
