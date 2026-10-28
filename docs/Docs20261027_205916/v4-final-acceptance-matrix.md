# Matriz final de cobertura V4

Data de corte: 2026-10-28. Versão da validação: HEAD `4710d59c1b342c59f43fdc3074b5897ec5c8e340` mais working tree não commitado; a build atual gerou os assets com hashes registrados abaixo. Esta matriz cobre os critérios da feature V4 em [stories-requisitos20261027_205916.md](stories-requisitos20261027_205916.md) e suas implementações no checkout canônico. As evidências históricas permanecem nos registros originais de [SPEC_PROGRESS.md](../../SPEC_PROGRESS.md); esta consolidação não as reescreve nem converte provas controladas em aceitação real.

Os itens US-05.C1–C3, RF-29/30 e RNF-01/08 estão marcados como substituídos por E1 somente no requisito de compatibilidade antiga. A obrigação vigente é inicializar banco limpo e conservar identidade/conteúdo dos registros produzidos pelo comportamento atual. Não se declara leitura de `check_id` antigo, conversão de instalação ou limpeza de banco operacional.

## Critérios US

| Critério | Referência de implementação | Prova registrada ou pendência |
| --- | --- | --- |
| US-01.C1 | `ProjectForm.tsx`; configuração de projetos no controller | Sprint 003 e gate Playwright controlado da Sprint 007; sem cadastro ou controles manuais. |
| US-01.C2 | `configuration-views.ts`, `configuration-writes.ts`, contratos de projeto | Sprint 003: contratos fechados, gravação e reabertura sem definições; UI controlada na Sprint 007. |
| US-01.C3 | `modules/projects/preparations.ts`, `modules/pipeline/start.ts` | Sprint 003: preparação/captura sem definições e início sem exigir cadastro; execução Maestri/OMP real permanece pendente. |
| US-01.C4 | `migrations.ts`, `storage` e contratos atuais | Substituído por E1: não há obrigação de abrir ou executar definições históricas; inicialização limpa e conservação do estado atual estão na prova de persistência da Sprint 006. |
| US-02.C1 | `ImplementerResult` em `modules/execution`; persistência de resultados | Sprints 001–003: contratos e regressões locais. Pendência: resultado produzido por agente em Maestri/OMP real. |
| US-02.C2 | `PassageBinding`, consultas de tentativa e armazenamento de resultados/evidências | Sprints 001, 002 e 006: vínculo de passagem/rodada/versão e persistência local. Maestri/OMP real pendente. |
| US-02.C3 | `modules/storage/reviews`, `modules/pipeline/start.ts` | Sprints 001–003: ausência de cadastro não reprova nem aprova; `CHECKS_NOT_CONFIGURED` removido do percurso novo. |
| US-02.C4 | Correção em `modules/pipeline/start.ts`; captura e revisão por versão | Regressão local de retry na Sprint 005 confirma nova identidade e preservação anterior. Cenário real de correção/revisão Maestri/OMP pendente. |
| US-02.C5 | `ReviewCommandRepetition` e evidências da revisão | Sprints 001–003: motivo concreto e vínculo à evidência válida da mesma versão cobertos localmente. |
| US-02.C6 | `beginReview`, aprovação em `modules/storage/reviews.ts` | Sprint 001: revisão aceita lacunas para avaliação e só aprova com critérios comprovados, independência e sem bloqueantes. Revisor real Maestri/OMP pendente. |
| US-02.C7 | `CriterionOutcome`, resultados do produtor e do Revisor | Sprint 001: ausente, inconclusivo e defeito comprovado permanecem distintos nos resultados. Aceite integrado real pendente. |
| US-03.C1 | `AttemptListPanel.tsx` e estado de navegação | Sprint 005 e Playwright controlado da Sprint 007: seleção/ação comparativa removidas. |
| US-03.C2 | `http/routes/attempts.ts`, `modules/queries/index.ts` | Sprint 005: rota removida e resposta autenticada 404 comprovada por regressão local. |
| US-03.C3 | Busca de tentativas em `modules/storage/attempt-search` e `AttemptListPanel.tsx` | Sprint 005 e Sprint 007: filtros, paginação, navegação e busca individual preservados localmente e no browser controlado. |
| US-03.C4 | `execution-views.ts`, consultas individuais de tentativa/rodadas/resultados | Sprints 005 e 007: detalhe e evidências consultáveis sob demanda; browser usou APIs controladas. |
| US-03.C5 | `preparations.ts`, `previous_attempt_id`, criação de sessões/diretórios | Sprint 005: retry local preserva captura e registros anteriores e cria identidade própria. Sessões numa execução real OMP pendentes. |
| US-04.C1 | `QueueOrder`, `ProjectForm.tsx`, DTOs de configuração | Sprint 004 e Sprint 007: somente `use_board_position` é editável e transportado. |
| US-04.C2 | `modules/projects/queue.ts` | Sprint 004: ordenação por projeto e fallback local ao projeto sem posição completa cobertos por regressões. |
| US-04.C3 | Consultas GitHub, `QueuePanel.tsx`, `QueueEnableDialog.tsx` | Sprint 004 e Sprint 007: valores numéricos não ordenam; apresentação mantém texto existente sem nova explicação de fallback. Browser usou API controlada. |
| US-04.C4 | `readiness`, queue scheduler e estado operacional | Sprint 004 e suite local: elegibilidade, atribuição, consumo, ocupação e pausa preservados. |
| US-04.C5 | `summaryHash` e consumo da fila | Sprint 004: mudança de sequência invalida autorização anterior; regressões locais cobrem conflito e reobservação. |
| US-05.C1 | `migrations.ts`, `storage` e inventário | Substituído por E1: banco limpo permitido; não há migração destrutiva de instalação real. Rejeição e persistência foram provadas em bases temporárias. |
| US-05.C2 | Capturas, referências Git e persistência atual | Substituído por E1 somente para leitores legados; Sprint 006 compara IDs, hashes e conteúdo dos registros atuais após reinícios temporários. |
| US-05.C3 | `ImplementerResult`, evidências por versão e consultas existentes | Substituído por E1 quanto a `check_id` e artifacts antigos; novas evidências continuam vinculadas e consultáveis. Nenhum leitor antigo foi alegado. |
| US-05.C4 | `diagnostic_runs.checks_json`, diagnósticos e prioridade de findings | Sprints 001–006: estruturas compartilhadas preservadas e exercitadas pelas regressões locais. |

## Requisitos funcionais

| Critério | Referência de implementação | Prova registrada ou pendência |
| --- | --- | --- |
| RF-01 | `ProjectForm.tsx` | Sprint 003 e Sprint 007: controles manuais ausentes; teclado/UI controlada. |
| RF-02 | `projects.ts`, schemas e `configuration-views.ts` | Sprint 003: contratos rejeitam campos removidos antes de efeitos. |
| RF-03 | `configuration-writes.ts`, codecs de configuração | Sprint 003: saves e reabertura sem definições. |
| RF-04 | `modules/projects/preparations.ts`, `PreparationDialog.tsx` | Sprint 003 e Sprint 007: preparação sem campos, seção vazia ou controle manual. |
| RF-05 | `modules/pipeline/start.ts`, captura de configuração efetiva | Sprint 003: captura nova não transporta definições. |
| RF-06 | prontidão, configuração, preparação e início | Sprint 003: caminho local não exige cadastro manual; Maestri/OMP real pendente. |
| RF-07 | remoção do módulo de verificação, `migrations/053_retire_manual_verification.sql` | Sprint 002 e prova de schema limpo na Sprint 006; instalação real não foi aberta. |
| RF-08 | `ImplementerResult` em `modules/execution` | Sprints 001–003: resultado estruturado local. Produção real por agente pendente. |
| RF-09 | `PassageBinding`, resultados e consultas de tentativa | Sprints 001, 002 e 006: vínculos e persistência local; prova Maestri/OMP pendente. |
| RF-10 | diagnóstico/resumo do pipeline | Sprints 002–003: ausência de cadastro não produz `CHECKS_NOT_CONFIGURED`. |
| RF-11 | `modules/storage/reviews`, `CriterionOutcome`, gates de revisão/publicação | Sprint 001: negativos e aprovação completa cobertos localmente; ciclo real pendente. |
| RF-12 | pipeline de correção, captura e resultado do Implementador | Sprint 002 e retry local da Sprint 005; cenário Maestri/OMP real pendente. |
| RF-13 | revisão independente e aprovação de critérios | Sprint 001 e testes de revisão locais; revisor OMP real pendente. |
| RF-14 | `ReviewCommandRepetition` | Sprints 001–003: repetição justificada por versão coberta localmente. |
| RF-15 | referências imutáveis, `reviews` e `modules/publication` | Testes locais cobrem vínculo e autoridade; publicação externa real pendente de alvo/autorização. |
| RF-16 | `AttemptListPanel.tsx` e consumidores de comparação | Sprint 005 e Sprint 007: controles, navegação e diálogo removidos. |
| RF-17 | `http/routes/attempts.ts` | Sprint 005: ausência de rota e 404 autenticado comprovados localmente. |
| RF-18 | `queries`, `execution-views.ts`, storage de tentativas | Sprint 005: contratos, conversores e consultas exclusivamente comparativos retirados. |
| RF-19 | busca de tentativas, filtros e cursor | Sprint 005 e Sprint 007: filtros combinados, paginação e consulta individual preservados. |
| RF-20 | detalhe, rodadas, resultados e evidências sob demanda | Sprints 005 e 007: regressão local e browser com APIs controladas. |
| RF-21 | `preparations.ts`, `previous_attempt_id`, sessões da tentativa | Sprint 005: retry e registros anteriores testados localmente; sessões em OMP real pendentes. |
| RF-22 | `QueueOrder`, `ProjectForm.tsx`, contratos de configuração | Sprint 004 e Sprint 007: campo e direção numéricos ausentes. |
| RF-23 | `queue_order_json`, codecs, revisões e capturas | Sprint 004 e Sprint 006: somente booleano atual e schema final em instalação temporária. |
| RF-24 | `modules/projects/queue.ts` | Sprint 004: posição condicional completa e fallback por projeto testados. |
| RF-25 | `modules/github/queries.ts`, fila e resumo da ordem | Sprint 004 e Sprint 007: números não participam da ordem ou apresentação. |
| RF-26 | cálculo `summaryHash` e scheduler | Sprint 004: alterações de candidato/ordem invalidam autorização localmente. |
| RF-27 | readiness, fila, ocupação e pausa | Sprint 004 e suite de regressões: guardas existentes preservadas. |
| RF-28 | consumo da fila e operações idempotentes | Sprint 004 e suite de regressões: replay/reconciliação sem duplicação local. |
| RF-29 | inicialização e persistência SQLite | Substituído por E1: prova de banco limpo e conservação dos registros atuais após reinício temporário, Sprint 006. |
| RF-30 | resultados/evidências atuais e vínculos de versão | Substituído por E1 quanto a `check_id` legado; evidências atuais e identidade foram preservadas na prova da Sprint 006. |
| RF-31 | `diagnostic_runs.checks_json`, diagnósticos e `findings.priority` | Sprints 001–006: funções atuais mantidas e cobertas localmente. |
| RF-32 | mudanças restritas às três remoções e consumidores diretamente afetados | Sprints 002–007: remoções e regressões dirigidas registradas; nenhuma auditoria geral de legado executada. |
| RF-33 | `project-deletion-inventory.ts`, migrations e fixtures de schema | Sprint 006: inventário/schema e FKs conferidos em instalação temporária; nenhuma exclusão operacional. |

## Requisitos não funcionais

| Critério | Referência de implementação | Prova registrada ou pendência |
| --- | --- | --- |
| RNF-01 | inicialização/persistência e `tests/native/persistence-recovery.proof.ts` | Substituído por E1: integridade da instalação limpa e conservação dos registros atuais após reinício temporário, Sprint 006. |
| RNF-02 | vínculo resultado/evidência/revisão à referência Git | Sprints 001–006: regressões locais rejeitam versão divergente e preservam versões anteriores. Maestri/OMP real pendente. |
| RNF-03 | scheduler, idempotência e resumo da fila | Sprint 004 e regressões locais de replay, pausa e hash desatualizado. |
| RNF-04 | hooks HTTP de Host/Origin, sessão e CSRF | Testes de integração HTTP e suíte atual; nenhum aumento de autoridade GitHub. |
| RNF-05 | telas alteradas e fluxo de teclado | Sprint 007, Playwright MCP/Chrome com APIs interceptadas; não é aceite nativo Windows nem integração de produto. |
| RNF-06 | `QueuePanel.tsx` e descrição do servidor | Redação ajustada pela decisão V4: sem prioridade numérica e sem explicação de fallback por projeto. Sprint 004 local e Sprint 007 controlada. |
| RNF-07 | consultas resumidas e detalhes sob demanda | Sprint 006: prova local com caches volumosos, tamanhos/payloads/latência registrados; sem novo SLA. |
| RNF-08 | migrations, schema e inventário | Substituído por E1: instalação limpa e registros atuais; compatibilidade com mecanismos antigos não é exigida. |
| RNF-09 | TypeScript strict, fronteiras, build e testes configurados | Resultado da revalidação desta entrega consta em [SPEC_PROGRESS.md](../../SPEC_PROGRESS.md), no registro final da Sprint 008. |

## Critérios de encerramento da Sprint 008

| Critério | Estado | Evidência ou pendência |
| --- | --- | --- |
| feat-024.AC1 | Documentado | SPEC, INTEGRACAO-MAESTRI-OMP e GLOSSARY descrevem validações técnicas e evidências do agente, revisão independente e entrega por versão sem executor manual. |
| feat-024.AC2 | Documentado | SPEC registra retirada de US-22/RF-86/87, mantém US-21/RF-84/85 e atualiza RF-54 para validação pertinente da nova versão. |
| feat-024.AC3 | Documentado | QueueOrder limita-se a `use_board_position`; cálculo residual/fallback por projeto está definido; contadores foram removidos sem pedir novas mensagens, rótulos, estados visuais ou explicações. |
| feat-024.AC4 | Documentado | E1 tem precedência; instalação limpa é permitida, compatibilidade antiga não é exigida e registros atuais/históricos não foram reescritos para parecer V4. |
| feat-025.AC1 | Pendente | Falta autorização de alvo, perfil/modelo e custo para executar o produto em Maestri/OMP real e comprovar resultado estruturado, validações, captura e revisão. |
| feat-025.AC2 | Pendente | Retry local preserva identidade e registros, mas falta cenário autorizado Maestri/OMP real com nova rodada/versão, revisão própria, consultas e sessões. |
| feat-025.AC3 | Parcial local | Suíte integral atual e regressões existentes passaram; não foi iniciada campanha geral. A prova do percurso real Maestri/OMP continua pendente. |
| feat-025.AC4 | Pendente | Publicação real requer autorização específica, destino e referência aprovada; nenhuma fixture, mock ou resposta 202 foi usada como substituto. |
| feat-026.AC1 | Documentado | Esta matriz cobre 25 critérios US, 33 RF, 9 RNF e também cada um dos 12 critérios das três features finais, com implementação e prova/pendência. |
| feat-026.AC2 | Documentado | SPEC_PROGRESS separa testes locais, suite integral, build, browser controlado, Windows nativo, Maestri/OMP real e publicação, com versão e limites. |
| feat-026.AC3 | Pendente de decisão | Validação do plano reaberta; aprovação é pré-condição e não foi simulada. Pendências foram registradas e Sprint 008 continua sem status completo. |
| feat-026.AC4 | Conforme | Nenhum staging, commit, push, publicação, exclusão de dados reais, cópia concorrente ou pipeline de auditoria arquitetural foi iniciado. |

## Gates separados e limites

| Gate | Estado | Evidência e limite |
| --- | --- | --- |
| Typecheck e lint | Passaram nesta revalidação | `npm.cmd run typecheck` e `npm.cmd run lint`, HEAD `4710d59c1b342c59f43fdc3074b5897ec5c8e340` + working tree; não comprovam Maestri/OMP ou UI. |
| Suíte integral | Passou: 2.014 testes em 169 arquivos | `npm.cmd test -- --reporter=dot --no-color`; execução local determinística, sem provider ou publicação externa. |
| Build | Passou | `npm.cmd run build`, exit 0; Vite 8.3.4; JS 1.162.345 bytes (gzip 290,46 kB), CSS 103.595 bytes (gzip 18,44 kB). O bundle excede 500 kB; build não provou integração externa. |
| Smoke compilado local | Passou em Windows | `npm.cmd run test:compiled`: HTTP/SSE/SQLite locais, CAS/idempotência, shutdown, lock e restart; preflight Maestri/OMP controlado, sem chamada externa. |
| Browser controlado | Evidência Sprint 007, mesmo conteúdo compilado | Playwright MCP/Chrome com APIs controladas. JS `index-CgQwicAS.js`, SHA-256 `065a6bd7a60869897fee0e6b11368ecfbfdc19dc970837b1a0d3b25aa83452ae`; CSS `index-CK1Sh9xa.css`, SHA-256 `03ac198283ef1328be93d0aaed623d8095827c43877f259be5d3d724b29a1da7`. Não prova controller real, Windows nativo ou OMP. |
| Windows nativo | Smoke passou com fixture | `npm.cmd run test:execution-compiled`: `windowsLaunch=passed_with_node_fixture`, UTF-8/EOF/diagnósticos passaram. `maestriOmpIntegration=not_executed`; não prova sessão OMP real. |
| Maestri/OMP real | Pendente | Requer alvo, perfil/modelo e limite de custo autorizados; fixtures não substituem essa prova. |
| Publicação real | Pendente | Requer autorização específica, destino e referência aprovada; nenhum efeito externo foi executado. |
| Aprovação da validação do plano | Pendente | A validação foi reaberta no relatório vigente; aprovação do usuário é pré-condição e não foi simulada. Sprint 008 não recebe status completo. |

Os critérios dos ciclos reais e das escritas externas não recebem status completo enquanto os gates correspondentes permanecerem pendentes.

## Complemento de evidência real — 2026-10-28, 13:39

A autorização posterior do usuário permitiu executar o roteiro existente `tests/native/session-continuity.proof.ts` em Maestri/OMP real. Passou (exit 0, 1/1 teste, 314,99 s), com seis passagens GPT-6-Luna/high, três versões, duas correções, sessões separadas preservadas e aprovação final. Git/captura/integridade, SQLite, checkout único e parada nativa foram reais. Evidência: `.cache/session-real-1793205251471/result.json`; detalhamento e intervenção operacional no registro posterior de `SPEC_PROGRESS.md`.

Este complemento supera a afirmação anterior de ausência total de execução Maestri/OMP somente nesse percurso mínimo. Não completa feat-025.AC1–AC4: rejeições roteirizadas, GitHub controlado, `checks=[]`, sem publicação real ou retry como outra tentativa. O Revisor precisou de orientação operacional para alinhar literalmente a evidência do assessment à de um critério relacionado; o payload foi reenviado pelo próprio agente e aceito pelo contrato. Aprovação formal do plano e aceite completo continuam pendentes.
