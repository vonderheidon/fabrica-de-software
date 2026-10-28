# Stories e requisitos: V4, remoções funcionais

## 1. Origem, objetivo e limites

Fonte de escopo: `docs/Docs20261027_205916/discovery20261027_205916.md`. Análise do repositório existente realizada em 27/10/2026, com leitura de `CLAUDE.md`, trechos pertinentes de `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md`, `GLOSSARY.md`, configuração executável e código atual.

Objetivo: simplificar a operação retirando checks cadastrados manualmente, comparação entre tentativas e prioridade numérica configurável da fila. Preservar validação técnica pelos agentes, revisão independente, evidências, histórico, consulta individual, filtros, Nova tentativa e segurança de consumo da fila.

Este documento especifica comportamento futuro. Não registra implementação, aprovação de gates ou execução de testes. Os IDs US, RF e RNF abaixo pertencem a este documento; referências à SPEC são identificadas expressamente.

Ficam fora do escopo: auditoria transversal de código sem uso, retirada geral do legado pré-V3, novo mecanismo configurável de checks, novo algoritmo de fila, limpeza de instalações, descarte de dados, reescrita de capturas e novas tecnologias. O discovery delimita a abrangência maior de `FEEDBACK-PROXIMO-PACOTE-V4.md`.

## 2. Arquitetura e pontos de integração observados

Os caminhos desta seção são relativos à raiz canônica do projeto.

| Superfície | Código existente e implicação |
| :--- | :--- |
| Configuração | `apps/web/src/features/projects/ProjectForm.tsx:664` contém direção, campo numérico e opção de posição do quadro; em `:677` começa o editor de checks com comando, diretório e timeout. A retirada alcança o rascunho e o transporte, além do JSX. |
| Preparação e captura | `apps/web/src/features/preparations/PreparationDialog.tsx` mantém rascunho, ETag, revisão e autorização por hash. `apps/controller/src/modules/pipeline/start.ts` e storage produzem a configuração capturada. Devem deixar de produzir definições manuais sem alterar capturas anteriores. |
| Contratos e configuração persistida | `packages/contracts/src/projects.ts`, `preparations.ts` e leitores/escritores em `apps/controller/src/modules/storage/configuration-reads.ts`, `configuration-writes.ts`, `configuration-json.ts` e `configuration-command-json.ts` conectam configuração, revisões, preparação e persistência. |
| Validação | `apps/controller/src/modules/storage/verification.ts:34` lê checks da captura; `:102` produz `CHECKS_NOT_CONFIGURED`. `:79`, `:112` e `:135` mostram vínculos entre artifacts e check_id. O módulo `verification` e seus consumidores precisam preservar a finalidade das evidências. |
| Resultado dos papéis | `packages/contracts/src/execution.ts` já possui `PassageBinding`, com tentativa, passagem, rodada e versão, `CriterionOutcome`, com passed/failed/not_verified, e `ImplementerResult.checks`, com resultado e evidência. Esses registros têm finalidade distinta das definições manuais. |
| Comparação | `apps/web/src/features/attempts/AttemptListPanel.tsx:47` mantém seleção e estado de comparação; importa `AttemptComparisonDialog.tsx`. `apps/controller/src/http/routes/attempts.ts:22` instala GET `/api/v1/attempt-comparisons`. A cadeia passa por `http/execution-views.ts`, `modules/queries/index.ts`, `modules/storage/index.ts`, `storage/attempt-comparison.ts`, `packages/contracts/src/queries.ts` e `http-execution/queries.ts`. |
| Consultas preservadas | A mesma instalação de rotas mantém listagem, detalhe, rodadas e comandos de tentativa. O painel mantém filtros de projeto, resultado, número, título e datas, além de paginação. Compartilhar arquivos com comparação não torna esses recursos removíveis. |
| Fila | `apps/controller/src/modules/projects/queue.ts:137` resolve prioridade; `:227` explica o critério; `:279` ordena por projeto, prioridade, posição, número e ID; `:298` inclui candidatos e ordem no summaryHash. Elegibilidade, consumo anterior e leitura incompleta são avaliados separadamente. |
| Persistência e exclusão | `apps/controller/src/modules/storage/migrations/`, `project-deletion-inventory.ts` e `tests/fixtures/project-deletion-schema.ts` são pontos de consistência caso estruturas sejam alteradas. A evolução deve preservar registros e vínculos existentes. |

Stack observada: TypeScript strict/ESM, Node.js 24, Fastify, React/Vite, TypeBox e SQLite via better-sqlite3. Não há necessidade identificada de acrescentar tecnologia. Interfaces de módulo ficam em `index.ts`, contratos compartilhados usam `#contracts`, imports relativos usam `.js`, SQL pertence a storage, Git a workspaces, GitHub a github e Maestri/OMP a execution. Testes usam Vitest em `tests/` e junto dos módulos. Configuração usa idempotência e concorrência por revisão/ETag.

## 3. User stories

### Domínio A: configuração e validação técnica

#### US-01: configurar projetos sem cadastro de checks

Como operador, quero configurar projetos e preparar tentativas sem cadastrar comandos de checks, para iniciar o trabalho sem manter uma lista manual de validações.

- **US-01.C1:** `ProjectForm` não apresenta Adicionar check nem editores de comando, diretório ou timeout de checks manuais.
- **US-01.C2:** salvar e reabrir uma configuração nova não produz definições manuais nos contratos ativos, persistência ativa ou resumo de preparação.
- **US-01.C3:** criar preparação e iniciar tentativa não exigem cadastro manual nem copiam essas definições para novas capturas.
- **US-01.C4:** abrir projeto já existente com checks históricos permite operar os campos preservados sem executar nem reativar aquelas definições.

#### US-02: acompanhar validação comprovada da versão

Como operador, quero consultar as validações técnicas realizadas pelos papéis da tentativa, para verificar as evidências da versão submetida à revisão e entrega.

- **US-02.C1:** o Implementador continua executando build, typecheck, lint e testes pertinentes disponíveis e registrando resultados e evidências pelo fluxo estruturado existente.
- **US-02.C2:** resultados consultáveis identificam tentativa, passagem, rodada e versão correspondente; evidência de outra versão não aprova a atual.
- **US-02.C3:** ausência de checks cadastrados não gera `CHECKS_NOT_CONFIGURED` no novo percurso nem é utilizada como prova de aprovação; critérios não verificados permanecem distinguíveis de critérios aprovados.
- **US-02.C4:** correção produz nova rodada/versão, com validação técnica pertinente e revisão independente; entrega utiliza a referência aprovada.
- **US-02.C5:** repetição de comando com evidência válida da mesma versão conserva motivo concreto registrado, conforme o contrato existente de revisão.
- **US-02.C6:** o gate existente é adaptado para considerar as evidências dos agentes e o parecer independente vinculados à versão, sem depender da verificação derivada das definições manuais e sem criar cadastro configurável equivalente. Falhas ou lacunas de evidência não impedem, por si só, iniciar a revisão para avaliá-las; aprovação final exige comprovação suficiente de todos os critérios e ausência de bloqueantes.
- **US-02.C7:** ausência de evidência indica critério não comprovado; falha técnica que impede uma validação indica resultado inconclusivo, sem comprovar por si só defeito do produto; defeito de produto exige evidência do comportamento incorreto. Essas situações permanecem distinguíveis na revisão e nenhuma equivale a aprovação.

### Domínio B: acompanhamento de tentativas

#### US-03: consultar tentativas sem comparação

Como operador, quero localizar e consultar cada tentativa individualmente, para acompanhar resultado, histórico e evidências pelo fluxo preservado.

- **US-03.C1:** `AttemptListPanel` não apresenta seleção ou ação exclusiva de comparação e não abre `AttemptComparisonDialog`.
- **US-03.C2:** GET `/api/v1/attempt-comparisons` deixa de estar registrado e não retorna a projeção comparativa.
- **US-03.C3:** filtros existentes de projeto, resultado, número/título da issue e período, com fuso e paginação, continuam retornando as tentativas correspondentes.
- **US-03.C4:** detalhe individual, rodadas, histórico e evidências de tentativas existentes continuam acessíveis.
- **US-03.C5:** Nova tentativa continua vinculando a tentativa anterior conforme o comportamento existente, sem alterar seus registros ou reutilizar sua sessão lógica.

### Domínio C: fila

#### US-04: consumir a fila pelos critérios padrão existentes

Como operador, quero acompanhar a fila sem configurar prioridade numérica, para compreender a ordem de consumo pelos critérios padrão já implementados.

- **US-04.C1:** configuração não exibe campo numérico de prioridade nem direção crescente/decrescente; contratos ativos e novas gravações não transportam essas escolhas.
- **US-04.C2:** a ordem usa ID do projeto; dentro dele, preserva a opção `use_board_position` e aplica posição documentada somente quando a opção está habilitada e todos os itens retornados daquele projeto têm posição. Em seguida, usa número crescente da issue e ID da issue/item. Com a opção desligada ou posição ausente em qualquer item, usa número/ID naquele projeto.
- **US-04.C3:** valores numéricos GitHub e configurações antigas de prioridade não alteram a ordem; resumo e mensagens explicam apenas os critérios restantes.
- **US-04.C4:** reobservação, autorização por resumo atual, elegibilidade, deduplicação, ocupação e pausas de novos inícios mantêm os bloqueios existentes.
- **US-04.C5:** alteração dos candidatos ou de sua ordem invalida a autorização baseada no resumo anterior, conforme a proteção atual por summaryHash.

### Domínio D: continuidade e histórico

#### US-05: preservar instalações e evidências existentes

Como operador, quero continuar consultando meus projetos e tentativas após a simplificação, para conservar o histórico e as evidências já produzidos.

- **US-05.C1:** inicialização e evolução de schema não apagam bancos, pastas, registros antigos ou evidências por causa destas remoções.
- **US-05.C2:** capturas imutáveis anteriores conservam conteúdo e identidade; leitores históricos necessários continuam funcionando.
- **US-05.C3:** artefatos históricos vinculados por check_id continuam acessíveis com as mesmas identidades e vínculos.
- **US-05.C4:** diagnósticos operacionais, inclusive `diagnostic_runs.checks_json`, e prioridade de achados de revisão conservam suas funções.

## 4. Requisitos funcionais

Cada linha define uma obrigação verificável. A coluna de integração identifica superfícies existentes, sem fixar antecipadamente uma solução de migration.

### A. Configuração e preparação

| ID | Requisito | Stories | Integração existente |
| :--- | :--- | :--- | :--- |
| RF-01 | Retirar os controles de cadastro, edição e exclusão de checks manuais da configuração de projetos. | US-01 | `ProjectForm.tsx`, estado do formulário e mensagens exclusivas. |
| RF-02 | Remover definições de checks manuais dos contratos de escrita e das projeções ativas de configuração. | US-01 | `projects.ts`, schemas compartilhados e tradução HTTP correspondente. |
| RF-03 | Deixar de gravar definições manuais em novas configurações e revisões ativas. | US-01, US-05 | `configuration-writes.ts`, serialização e comandos de configuração. |
| RF-04 | Retirar definições manuais de escolhas, overrides e resumos de novas preparações. | US-01 | `preparations.ts`, `PreparationDialog.tsx` e módulo projects/preparations. |
| RF-05 | Deixar de incluir definições manuais nas novas capturas de tentativa. | US-01, US-05 | `pipeline/start.ts`, captura e serialização de configuração efetiva. |
| RF-06 | Permitir configuração, preparação e início pelo fluxo vigente sem exigir checks cadastrados. | US-01 | Validações de configuração e prontidão, preservando seus demais impedimentos. |

### B. Validação e entrega

| ID | Requisito | Stories | Integração existente |
| :--- | :--- | :--- | :--- |
| RF-07 | Remover efetivamente os produtores e executores exclusivos das verificações derivadas das definições manuais, inclusive seu acionamento por configurações antigas, preservando leitores e vínculos necessários ao histórico, às evidências e às funções mantidas. | US-01, US-02, US-05 | `storage/verification.ts`, módulo verification e despacho pelo pipeline; preservação conforme RF-30/RF-32. |
| RF-08 | Manter a produção de resultados e evidências das validações técnicas pertinentes executadas pelo Implementador. | US-02 | `ImplementerResult` em `execution.ts` e persistência do resultado estruturado. |
| RF-09 | Manter a consulta das evidências de validação correlacionadas à tentativa, passagem, rodada e versão pertinente. | US-02 | `PassageBinding`, consultas de tentativa e armazenamento de resultados/evidências. |
| RF-10 | Retirar `CHECKS_NOT_CONFIGURED` como impedimento do percurso novo decorrente da ausência do cadastro removido. | US-02 | `storage/verification.ts` e consumidores de diagnóstico/resumo. |
| RF-11 | Adaptar o gate existente para evidências dos agentes e parecer independente vinculados à versão, sem novo cadastro configurável equivalente. Ausência de definições manuais, lista vazia ou estado not_applicable com zero checks não constituem prova de aprovação. Distinguir ausência de evidência, falha técnica inconclusiva e defeito de produto comprovado, conforme US-02.C7. | US-02 | Estados de verificação, `CriterionOutcome` e gates de revisão/publicação. |
| RF-12 | Exigir validação técnica pertinente após correção, vinculada à nova versão. | US-02 | Ciclo de rodadas, pipeline e contexto dos papéis; reformulação da SPEC RF-54. |
| RF-13 | Preservar revisão independente de todos os critérios atuais, permitindo iniciá-la para avaliar falhas ou lacunas de evidência, sem exigir aprovação prévia dessas validações. Aprovação final exige comprovação suficiente de todos os critérios da versão e ausência de bloqueantes; evidência ausente, inválida ou de outra versão não comprova o critério atual. | US-02 | Revisões e aprovação existentes; SPEC RF-53/56; preservados os demais impedimentos existentes de início da revisão. |
| RF-14 | Preservar o motivo registrado para repetição de comandos com evidência válida da mesma versão. | US-02 | `ReviewCommandRepetition` e evidências de revisão; SPEC RF-55. |
| RF-15 | Manter entrega/publicação vinculada à versão validada e aprovada. | US-02 | Referências imutáveis de entrega, reviews e publication; INT-18. |

### C. Tentativas e consultas

| ID | Requisito | Stories | Integração existente |
| :--- | :--- | :--- | :--- |
| RF-16 | Remover seleção, ação, diálogo e navegação exclusivos da comparação entre tentativas. | US-03 | `AttemptListPanel.tsx`, `AttemptComparisonDialog.tsx` e seus consumidores. |
| RF-17 | Remover o registro da rota GET `/api/v1/attempt-comparisons`. | US-03 | `http/routes/attempts.ts`. |
| RF-18 | Retirar contratos, conversores e consultas usados exclusivamente pela projeção comparativa. | US-03, US-05 | `queries.ts`, `http-execution/queries.ts`, `execution-views.ts`, queries/storage e `attempt-comparison.ts`. |
| RF-19 | Preservar os filtros e a paginação existentes da listagem de tentativas. | US-03 | `AttemptListPanel.tsx`, listAttempts e contratos de busca; SPEC RF-84/85. |
| RF-20 | Preservar consulta individual, rodadas, histórico e evidências das tentativas. | US-03, US-05 | Rotas de detalhe/rodadas e leitores compartilhados de capturas/revisões. |
| RF-21 | Preservar Nova tentativa e seu vínculo histórico sem transportar trabalho ou sessões da tentativa anterior. | US-03 | `onPrepareRetry`, preparação com previous_attempt_id e fluxo existente de início. |

### D. Ordenação e consumo da fila

| ID | Requisito | Stories | Integração existente |
| :--- | :--- | :--- | :--- |
| RF-22 | Retirar campo numérico de prioridade e direção de ordenação da UI e dos contratos ativos de configuração. | US-04 | `ProjectForm.tsx`, QueueOrder e DTOs relacionados. |
| RF-23 | Deixar de produzir persistência ativa, capturas e transporte exclusivos da prioridade numérica. | US-04, US-05 | `queue_order_json`, serializadores, revisões e capturas novas. |
| RF-24 | Ordenar a fila somente pela sequência residual existente: ID de projeto; dentro dele, posição documentada apenas quando `use_board_position` está habilitado e todos os itens retornados daquele projeto têm posição; depois, número crescente e ID de issue/item. Com a opção desligada ou posição ausente em qualquer item, usar número/ID naquele projeto. | US-04 | Comparador de `projects/queue.ts`; preservar a opção e a condição existente de uso da posição. |
| RF-25 | Excluir valores numéricos de prioridade do cálculo e da apresentação da ordem. | US-04 | Leitura de numberValues para esta finalidade, sortValues, critério, descrição e diagnóstico exclusivo de prioridade. |
| RF-26 | Calcular o resumo autorizável com os candidatos e a ordem resultantes, exigindo nova autorização quando o resumo mudar. | US-04 | summaryHash e reobservação do consumo. |
| RF-27 | Preservar as regras existentes de elegibilidade e bloqueio, inclusive conta, Ready, atribuição exclusiva, consumo anterior, leitura incompleta, ocupação, autorização e pausa de novos inícios. | US-04 | Readiness, queue, scheduler e estado operacional persistido. |
| RF-28 | Preservar a deduplicação do consumo e de seus efeitos ao repetir ou reconciliar operações. | US-04 | Ciclos de fila, operações idempotentes e início de tentativa. |

### E. Preservação e alcance da retirada

| ID | Requisito | Stories | Integração existente |
| :--- | :--- | :--- | :--- |
| RF-29 | Manter registros anteriores e capturas imutáveis sem descarte ou regravação causada pelas remoções. | US-05 | Migrations, inicialização e leitores históricos. |
| RF-30 | Preservar identidade, acesso e vínculo dos artefatos históricos associados a check_id. | US-02, US-05 | `storage/verification.ts`, checks e artifacts. |
| RF-31 | Conservar diagnósticos operacionais e prioridade de achados de revisão. | US-05 | `diagnostic_runs.checks_json`, diagnósticos de ferramentas e contratos de findings. |
| RF-32 | Retirar código e compatibilidades que perderem finalidade diretamente pelas três remoções, conservando leitores compartilhados necessários às funções preservadas. | US-01 a US-05 | Interfaces públicas, contratos, UI, consultas e fixtures afetados; sem auditoria geral de legado. |
| RF-33 | Manter o inventário de exclusão e seus vínculos coerentes com o schema resultante quando houver alteração de estruturas. | US-05 | `project-deletion-inventory.ts`, migrations e `tests/fixtures/project-deletion-schema.ts`; não autoriza executar exclusões. |

## 5. Requisitos não funcionais

| ID | Categoria | Requisito e medida de aceite | Relações |
| :--- | :--- | :--- | :--- |
| RNF-01 | Confiabilidade | Em fixtures de instalações anteriores, 100% das capturas e evidências de referência conservam identidade e conteúdo após inicialização/evolução pertinente e reinício. Nenhum arquivo histórico é apagado pela retirada. | RF-29/30 |
| RNF-02 | Confiabilidade | Todos os resultados utilizados na aprovação identificam a versão correspondente. Teste com evidência de outra versão deve impedir aprovação indevida; correção deve conservar registros da versão anterior. | RF-09/11/12/15 |
| RNF-03 | Confiabilidade | Repetir a mesma operação autorizada não cria segunda tentativa ou segundo consumo. Pausa vigente e resumo desatualizado impedem novos inícios nos casos de regressão pertinentes. | RF-26/27/28 |
| RNF-04 | Segurança | Preservar Host/Origin exatos, sessão técnica HttpOnly e CSRF nas mutações afetadas. Casos existentes de origem, sessão ou CSRF inválidos continuam rejeitados; nenhuma mudança de contrato amplia autoridade GitHub. | RF-02/04/22/26 |
| RNF-05 | Usabilidade | Não restam controles focáveis ou ações de comparação, cadastro manual de checks ou prioridade numérica nas superfícies alteradas. Configuração, preparação, filtros, detalhe, Nova tentativa e evidências continuam operáveis por teclado, sem ações cortadas em tela estreita/baixa e com zoom na prova de UI. | US-01/03/04 |
| RNF-06 | Usabilidade | O resumo da fila informa o critério efetivamente aplicado e o fallback por número/ID quando não há posição utilizável; não apresenta prioridade numérica ou recuperação de campo removido. | RF-24/25 |
| RNF-07 | Performance | Preservar resumos leves e detalhes sob demanda: listagem e polling não passam a carregar capturas, artefatos ou histórico detalhado. Verificar payloads e consultas pertinentes em cenário com caches volumosos conforme a referência AC-29 do discovery; não criar cópias desses caches em SQLite ou JSON. Não se estabelece novo limite numérico de latência sem base no escopo. | RF-19/20/29 |
| RNF-08 | Compatibilidade | Instalações novas e existentes suportam os percursos preservados sem reconstrução geral do banco ou edição de capturas antigas. Testes de schema/inventário devem permanecer coerentes com as estruturas retidas. | RF-03/05/23/29/33 |
| RNF-09 | Manutenibilidade | Alterações mantêm TypeScript strict e fronteiras atuais: contratos sem IO, SQL em storage, acesso Git/GitHub/execução nos módulos próprios. Typecheck, lint de fronteiras e build configurados devem concluir sem erros. | RF-01 a RF-33 |

## 6. Rastreabilidade normativa

| Fonte atual | Adequação requerida na etapa documental correspondente |
| :--- | :--- |
| SPEC US-22.C1 a C3, RF-86/87 | Retirar comparação e referências exclusivas, conforme US-03 e RF-16 a RF-18 deste documento. |
| SPEC US-21.C1 a C3, RF-84/85 | Preservar busca, filtros e paginação, conforme RF-19. |
| SPEC US-12.C2 e RF-54 | Reformular a dependência de checks configurados para validação técnica pertinente após correções, conforme US-02. |
| SPEC US-11.C2/RF-51 e US-12.C1/C3/C4, RF-53/55/56 | Preservar evidências, repetição justificada, independência e aprovação completa da versão. |
| SPEC ProjectConfiguration, ProjectChanges, PreparationOverrides, capturas e QueueOrder | Alinhar contratos ativos e exemplos às remoções, preservando leitura histórica necessária. |
| INTEGRACAO-MAESTRI-OMP INT-06, INT-11 e INT-18 | Preservar resultado estruturado durável, prova de UI e identidade da versão validada/revisada/publicada; alinhar responsabilidades da validação. |
| INTEGRACAO-MAESTRI-OMP INT-08 e INT-15 a INT-17 | Manter regressão de acompanhamento, cancelamento, recursos próprios e Nova tentativa. |
| GLOSSARY.md | Atualizar somente termos afetados; manter distinções entre tentativa, rodada, passagem, entrega e versão. |

Não se altera o contrato normativo nesta execução. As adequações acima registram o impacto requerido pelo discovery para a etapa competente.

## 7. Evidências de aceite previstas

| Superfície | Verificação necessária | Base existente |
| :--- | :--- | :--- |
| Contratos/configuração | Ausência de campos removidos em contratos ativos e novas gravações; salvar/reabrir projetos existentes; nova preparação e captura sem definições manuais. | `tests/integration/projects.test.ts`, `preparations.test.ts`, testes de contratos, `storage/preparations.test.ts` e `configuration-json.test.ts`. |
| Validação/revisão | Sem produzir verificações das definições manuais, alcançar revisão independente com resultados/evidências dos agentes vinculados à versão. Exercitar início da revisão para avaliar falhas ou lacunas, preservados os demais impedimentos existentes; aprovação final somente com comprovação suficiente dos critérios e ausência de bloqueantes. Distinguir ausência de evidência, falha técnica inconclusiva e defeito comprovado; evidência ausente, inválida ou de outra versão não comprova o critério atual. Cobrir not_applicable com zero checks e lista vazia sem tratá-los como prova de aprovação; correção e repetição justificadas. | `tests/integration/verification.test.ts` e `reviews.test.ts`, fixtures e contratos de execução. |
| Tentativas | Rota comparativa ausente; filtros/paginação, detalhe, histórico, evidências e Nova tentativa preservados. Separar testes exclusivos da comparação dos compartilhados antes de retirar casos. | `tests/integration/attempt-comparison.test.ts`, `attempt-search-http.test.ts` e `apps/web/src/features/attempts/attempt-history-search.test.ts`. |
| Fila | Ordem residual com múltiplos projetos e empates; posição aplicada com opção habilitada e posição em todos os itens do projeto; fallback por número/ID com opção desligada, posição totalmente ausente ou disponibilidade parcial. Valores antigos de prioridade sem efeito; hash atualizado; elegibilidade, autorização, pausa e deduplicação preservadas. | `tests/integration/queue-scheduler.test.ts` e testes de projects. |
| Persistência | Inicialização/reinício de banco anterior sem perda de capturas, checks históricos ou artifacts; integridade dos vínculos e inventário de exclusão quando afetados. | Migrations, testes de persistência e fixture de schema de exclusão. |
| UI | Playwright MCP/Chrome na porta 4310: ausência dos controles retirados e operação dos percursos preservados; teclado, tela estreita/baixa, zoom e acesso às evidências. Registrar dimensões e zoom utilizados. | Aplicação renderizada; não confundir build ou teste de componente com esta prova. |
| Integração real | Maestri/OMP executa validações pertinentes, entrega resultado durável, revisão usa versão fixa e correção gera nova versão. Publicação, quando autorizada, usa referência aprovada. | INT-06/11/18 e regressões INT-08/15 a INT-17; depende de autorização correspondente para custo e efeitos reais. |

Comandos configurados para validação local futura: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`, com seleção de testes pertinentes durante o trabalho. A suíte padrão deve permanecer sem chamadas implícitas a providers, recrutamento de terminais ou publicação externa.

## 8. Estado desta entrega

Documento produzido por análise estática de discovery, fontes normativas e código existente. Nenhum código de produto, banco ou documento normativo foi alterado. Não foram executados testes, build, browser, integração nativa ou efeitos externos. O inventário de arquivos orienta o detalhamento posterior e não constitui auditoria exaustiva de código removível.
