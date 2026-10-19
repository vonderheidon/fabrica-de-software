# Matriz de cobertura transversal

## Encaminhamento da Etapa B — preparado em 2026-10-18

Os registros executáveis por versão/contexto estão em [`acceptance-b/20261018-01`](../acceptance-b/20261018-01/record.md). A preparação cobre US-22/RF-103–104, os quatro percursos de US-23/RF-105–106 e a revisão US-24/RF-107–109/RNF-19. Os estados desta matriz são históricos; a nova rodada mantém execução externa, aceite visual atual e revisão imutável pendentes até evidência própria.

| Identificação | Roteiro preparado | Estado da prova desta versão |
| --- | --- | --- |
| S20 / sprint-018 — Primeira fatia | [`runbook-first-slice.md`](../acceptance-b/20261018-01/runbook-first-slice.md) | Pendente: versão, alvo, perfis, contexto e autorizações |
| S23 / sprint-021 — Publicação na interface | [`runbook-publication-ui.md`](../acceptance-b/20261018-01/runbook-publication-ui.md) | Pendente: mesma versão aprovada em ICR/Commit/PR e reconciliações |
| S26 / sprint-024 — Fila | [`runbook-queue.md`](../acceptance-b/20261018-01/runbook-queue.md) | Pendente: alvo Ready e autorização de consumo/projeção |
| S34 / sprint-032 — Aceite transversal | [`runbook-transversal-ui.md`](../acceptance-b/20261018-01/runbook-transversal-ui.md) | Pendente: browser atual, conteúdo, teclado, screenshots e zoom nativo |
| US-24 — Revisão imutável | [`runbook-immutable-review.md`](../acceptance-b/20261018-01/runbook-immutable-review.md) | Pendente: ref autorizada e checks/revisão independentes na mesma tree |

Data de corte: 2026-10-17. A matriz cobre todos os IDs US-01–US-20, RF-01–RF-88, RNF-01–RNF-25, AC-01–AC-29 e INT-01–INT-18. As famílias US/RF/RNF estão agrupadas por áreas contíguas; os critérios AC/INT têm linhas próprias ou intervalos contíguos explícitos. A matriz aponta as fontes de implementação e evidência encontradas no workspace e executadas nesta rodada. A tabela normativa integral dos textos e relações entre IDs permanece em `docs/Docs20261016_073031/stories-requisitos20261016_073031.md` (seções 2–7) e os cenários AC/INT permanecem em `SPEC.md` §10.3 e `INTEGRACAO-MAESTRI-OMP.md` §8. Um estado local nunca equivale à execução real prescrita.

| IDs cobertos | Implementação principal | Provas locais pertinentes | Estado / limite |
| --- | --- | --- | --- |
| US-01–US-05 | `apps/controller/src/modules/projects/`; `apps/web/src/features/projects/`; `ProjectCreationDialog.tsx`; `ProjectForm.tsx` | `tests/integration/projects.test.ts`, `scaffold.test.ts`, `remote-scaffold.test.ts`, `static-assets.test.ts` | Parcial. HTTP/SQLite/filesystem e Git/GitHub controlados; origem dirty, baseline/remoto reais e navegador pendentes. |
| US-06 | `features/preparations/PreparationDialog.tsx`; módulos `projects` e `pipeline` | `tests/integration/preparations.test.ts`, `attempts.test.ts`, `attempt-transactions.test.ts` | Parcial. CAS/idempotência/gates locais; execução real depende de GitHub/host/Maestri. |
| US-07–US-09 | `modules/projects/queue.ts`; `modules/pipeline/start.ts`; `features/queue/` | `tests/integration/queue-scheduler.test.ts`, `apps/controller/src/modules/storage/queue-cycles.test.ts`, `tests/integration/projects.test.ts` | Parcial. Observação/scheduler em adapters controlados; GitHub real e UI visual pendentes. |
| US-10–US-12 | `modules/execution/`, `pipeline/start.ts`, `workspaces/{prepare,capture,materialize,review}.ts` | `execution.test.ts`, `attempts.test.ts`, `deliveries.test.ts`, `verification.test.ts`, `reviews.test.ts` | Parcial. Persistência/contratos locais; TUI, MCP, Git real e independência observada no host pendentes. |
| US-13–US-15 | `pipeline/{start,questions,recovery}.ts`; `features/attempts/QuestionDecisionCard.tsx`, `AttemptDetailDialog.tsx` | `tests/integration/questions.test.ts`, `recovery.test.ts`, `attempt-results.test.ts` | Parcial. Expiração, recibos, cancelamento e restart controlados/local; entrega e parada física Maestri reais pendentes. |
| US-16–US-17 | `modules/publication/`; `workspaces/{publication,remote-publication}.ts`; `PublicationDialog.tsx` | `local-publication.test.ts`, `pr-publication.test.ts`, `publication.test.ts`, `remote-publication.test.ts` | Parcial. Git/GitHub controlados; commit/push/PR/comentário reais não executados. |
| US-18–US-20 | `features/{operations,records,queue}/`; `useControllerEvents.ts`; `modules/diagnostics/` | `operation-diagnostics.test.ts`, `queries.test.ts`, `http-security.test.ts` | Parcial. Projeções/SSE/inject locais; comportamento de browser e host integrado pendente. |
| RF-01–RF-22 | `modules/{github,workspaces,projects}/`; `routes/{projects,scaffold}.ts`; telas `ProjectForm.tsx`, `ProjectCreationDialog.tsx` | `projects.test.ts`, `scaffold.test.ts`, `remote-scaffold.test.ts`, `github.test.ts` | Parcial por requisito. Cadastro/configuração/plano e contratos locais cobertos; Git/GitHub reais e AC-02/03 ainda pendentes. |
| RF-23–RF-28 | `projects/preparations.ts`; `pipeline/start.ts`; `features/preparations/PreparationDialog.tsx` | `preparations.test.ts`, `attempts.test.ts`, `attempt-transactions.test.ts` | Parcial. Preparação e intenção duráveis locais; despacho real e prova de resposta perdida no host pendentes. |
| RF-29–RF-42 | `projects/queue.ts`, `storage/queue.ts`, `pipeline/start.ts`, `features/queue/` | `queue-scheduler.test.ts`, `queue-cycles.test.ts`, `projects.test.ts` | Parcial. Contratos, ordem, ciclos, CAS e pausa locais; GitHub/worker real pendentes. |
| RF-43–RF-53 | `modules/{execution,workspaces,verification}/`; `pipeline/start.ts` | `execution.test.ts`, `commands.test.ts`, `attempts.test.ts`, `deliveries.test.ts`, `verification.test.ts` | Parcial. Adapter, captura e execução de check com provas locais/controlled; runtime Maestri/OMP e Git real pendentes. |
| RF-54–RF-57 | `modules/execution/`, `workspaces/review.ts`, `storage/reviews.ts`; `AttemptDetailDialog.tsx` | `reviews.test.ts`, `review.test.ts`, `extension.test.ts` | Parcial. Regras/histórico e sessão simulada cobertos; revisão realmente independente e visual pendentes. |
| RF-58–RF-62 | `pipeline/start.ts`; `routes/attempts.ts`; `QuestionDecisionCard.tsx`, `useDecision.ts` | `questions.test.ts`, `http-security.test.ts` | Parcial. Pergunta/TTL/CAS/recibo/unknown local; entrega real na sessão e conflito em browser entre abas pendentes. |
| RF-63–RF-68 | `pipeline/recovery.ts`, `workspaces/recovery.ts`, `storage/recovery.ts`; `AttemptDetailDialog.tsx` | `recovery.test.ts`, `workspaces/recovery.test.ts`, `execution.test.ts` | Parcial. Revogação/ownership e filesystem de fixture; terminal filho, confirmação física e abertura nativa reais pendentes. |
| RF-69–RF-80 | `modules/publication/`, `workspaces/{publication,remote-publication}.ts`, `github/pull-requests.ts`; `PublicationDialog.tsx` | `publication.test.ts`, `local-publication.test.ts`, `pr-publication.test.ts`, `github/pull-requests.test.ts` | Parcial. Gates, journals, reconciliação e modos sob adapters; efeitos Git/GitHub reais pendentes. |
| RF-81–RF-88 | `modules/queries/`, `modules/diagnostics/`; `DashboardPanel.tsx`, `RecordsPanel.tsx`, `AttemptDetailDialog.tsx` | `queries.test.ts`, `operation-diagnostics.test.ts`, `http-security.test.ts` | Parcial. DTOs/cursores/seções e segurança por inject local; apresentação, teclado, foco e browser pendentes. |
| RNF-01 | `storage/queries.ts`; `tests/acceptance/persistence-maintenance.test.ts` | AC-29 executado dentro da suíte: 0/16/64 MiB, 20 amostras por consulta, payloads estáveis; Git controlado | Comprovado localmente no nível descrito; tempos sem SLA e objetos Git reais pendentes. |
| RNF-02–RNF-04 | `pipeline/start.ts`, `storage/queue.ts`, `modules/github/` | `attempts.test.ts`, `queue-scheduler.test.ts`, `github.test.ts` | Parcial local; integração externa real pendente. |
| RNF-05–RNF-09 | `http/security/`, `execution/`, `publication/`, `recovery/` | `http-security.test.ts`, `security.test.ts`, `publication.test.ts`, `recovery.test.ts` | Parcial local. Sessão/CSRF/Origin/restart e marcadores sintéticos têm prova; binding/host e efeitos externos reais pendentes. |
| RNF-10–RNF-16 | `workspaces/`, `storage/`, `verification/`, `pipeline/` | `workspaces.test.ts`, `deliveries.test.ts`, `verification.test.ts`, `storage.test.ts`, ensaios de manutenção | Parcial local; Git real e execução integrada pendentes. RNF-01 medido separadamente acima. |
| RNF-17–RNF-19 | `apps/web/src/app/`, `features/`, `artifact.css` | Build e tipos; `tests/web-state.test.ts`; nenhum teste browser executado | Pendente aceite visual. Sem dimensões, screenshots, ações, foco, nomes AX, contraste/zoom medidos ou prova de duas abas nesta rodada. |
| RNF-20–RNF-25 | `execution/`, `scripts/start-host.mjs`, fronteiras verificadas em `scripts/check-boundaries.mjs` | `startup.test.ts`, `execution.test.ts`, `offline.test.ts`, lint/build e suíte completa | Parcial local. TUI/OMP real, MCP útil, chamada GitNexus no clone e navegador de teste pendentes. |

## Critérios AC

| Critério | Implementação/provas atuais | Estado nesta rodada |
| --- | --- | --- |
| AC-01 | cadastro/ambiente: `projects.test.ts`, `workspaces.test.ts` | Parcial; Git real e comparação da origem dirty pendentes. |
| AC-02 | `scaffold.test.ts`, `remote-scaffold.test.ts`, `ProjectCreationDialog.tsx` | Parcial; fixtures para três modalidades, criação remota real pendente. |
| AC-03 | `remote-scaffold.test.ts`, `recovery.test.ts` | Parcial; efeitos remotos reais e reconciliação no alvo pendentes. |
| AC-04 | `projects.test.ts`, `preparations.test.ts`, `project-save-lifecycle.test.ts` | Parcial; conflito/save entre duas abas no browser pendente. |
| AC-05 | `preparations.test.ts`, `attempts.test.ts`, `attempt-transactions.test.ts` | Parcial; dispatch real e resposta perdida com Maestri pendentes. |
| AC-06 | `attempt-results.test.ts`, `verification.test.ts` | Parcial; agente, artefato e check no runtime real pendentes. |
| AC-07 | `reviews.test.ts`, `review.test.ts` | Parcial; independência de sessão/clone real pendente. |
| AC-08 | `reviews.test.ts` | Parcial; rodadas controladas; execução OMP real pendente. |
| AC-09 | `deliveries.test.ts`, `queries.test.ts` | Parcial; objetos/ref Git reais pendentes. |
| AC-10 | `local-publication.test.ts`, `publication.test.ts` | Parcial; commit Git real pendente. |
| AC-11 | `pr-publication.test.ts`, `remote-publication.test.ts` | Parcial; push/PR reais pendentes. |
| AC-12 | `publication.test.ts`, `pr-publication.test.ts` | Parcial; reconciliação controlada, endpoint real não exercitado. |
| AC-13 | `deliveries.test.ts`, `verification.test.ts`, `reviews.test.ts`, publication tests | Parcial; identidade de snapshot provada sob Git controlado. |
| AC-14 | `questions.test.ts`, `execution.test.ts` | Parcial; pergunta/resposta real na TUI pendente. |
| AC-15 | `execution.test.ts`, `extension.test.ts` | Parcial; chamada útil real e recuperação de tool pendentes. |
| AC-16 | `recovery.test.ts`, `execution.test.ts` | Parcial; cancelamento real na inicialização e com filho pendente. |
| AC-17 | `recovery.test.ts`, `preparations.test.ts` | Parcial; nova tentativa Git/OMP real pendente. |
| AC-18 | `http-security.test.ts`, `startup.test.ts`, `recovery.test.ts` | Parcial; restart local; host Maestri e sessão real pendentes. |
| AC-19 | `queue-scheduler.test.ts`, `queue-cycles.test.ts` | Parcial; GitHub Ready real pendente. |
| AC-20 | `attempt-transactions.test.ts`, `queue-scheduler.test.ts`, `http-security.test.ts` | Parcial; resposta perdida/restart testados localmente, percurso externo pendente. |
| AC-21 | `startup.test.ts`, lock compilado histórico | Parcial; host/conta autenticados reais pendentes. |
| AC-22 | `publication.test.ts`, `queue-scheduler.test.ts` | Parcial; autoridade remota e handoff reais pendentes. |
| AC-23 | `execution.test.ts` | Parcial; MCP descoberto e chamada útil real pendentes. |
| AC-24 | `extension.test.ts`, `smoke-execution.mjs` | Parcial; transporte local UTF-8/EOF; TUI real pendente. |
| AC-25 | `startup.test.ts`, `execution.test.ts` | Parcial; contexto herdado e ownership Maestri reais pendentes. |
| AC-26 | `recovery.test.ts`, `workspaces/recovery.test.ts` | Parcial; somente capacidades simuladas; prova física real pendente. |
| AC-27 | `artifact.html`; telas Principal, app-shell, attempt-detail, project-form | Pendente: navegador de teste recusado; evidência detalhada em `visual-evidence.md`. |
| AC-28 | `scripts/check-boundaries.mjs`, suíte | Comprovado localmente pelos checks executados; revisão de arquitetura independente desta versão pendente. |
| AC-29 | `tests/acceptance/persistence-maintenance.test.ts`, `deliveries.test.ts` | Comprovado localmente com SQLite/filesystem/HTTP e Git controlado, sem SLA; recuperação Git real pendente. |

## Critérios INT

| Critério | Código / provas | Estado nesta rodada |
| --- | --- | --- |
| INT-01–INT-02 | `main.ts`, `startup.test.ts`, `execution.test.ts` | Parcial; Maestri com contexto herdado ausente. |
| INT-03–INT-05 | `execution/`, adapter/extensão, `execution.test.ts` | Parcial; TUI/provider/MCP real pendente. |
| INT-06 | `attempt-results.test.ts`, `attempt-transactions.test.ts` | Parcial local; resultado real do agente pendente. |
| INT-07 | `questions.test.ts`, `QuestionDecisionCard.tsx` | Parcial local; entrega na passagem real e aceite browser pendentes. |
| INT-08 | `recovery.test.ts`, `execution.test.ts` | Parcial local; observação real de perda de acompanhamento pendente. |
| INT-09–INT-10 | `execution.test.ts`, `extension.test.ts` | Pendente de MCP real/chamada útil e correção real. |
| INT-11 | Ferramenta prescrita Playwright MCP/Chrome | Pendente; bloqueio automático documentado em `visual-evidence.md`. |
| INT-12 | `execution` orienta GitNexus; nenhum índice deste repo disponível em provas anteriores | Pendente; chamada útil no clone não comprovada. |
| INT-13–INT-14 | adapter OMP, `smoke-execution.mjs`, testes de comandos | Parcial; fixtures de processo/UTF-8; Maestri/OMP real pendente. |
| INT-15–INT-16 | `recovery.test.ts`, `workspaces/recovery.test.ts` | Parcial local; parada física/filhos reais pendentes. |
| INT-17 | `recovery.test.ts`, `preparations.test.ts` | Parcial; Git/OMP real pendente. |
| INT-18 | `deliveries.test.ts`, `verification.test.ts`, `reviews.test.ts`, publication tests | Parcial; fluxo usa IDs/trees controlados; Git real pendente. |

## Cobertura de segurança e casos alternativos

| Grupo | Evidência local encontrada | Limite nesta rodada |
| --- | --- | --- |
| Leituras/SSE protegidos; mutações com sessão/Origin/CSRF/JSON | `tests/integration/http-security.test.ts`, `apps/controller/src/http/security/security.test.ts`, `static-assets.test.ts` | Contratos HTTP/inject locais; browser real pendente. |
| Idempotência, CAS e recuperação de resposta incerta | `attempts.test.ts`, `attempt-transactions.test.ts`, `questions.test.ts`, `publication.test.ts`, `pr-publication.test.ts`, `scaffold.test.ts` | Efeitos externos são adapters controlados. |
| Revogação após restart e ausência de replay | `http-security.test.ts`, `recovery.test.ts`, `publication.test.ts`, `operation-diagnostics.test.ts` | Testes de reopen/restart local não substituem host Maestri. |
| Segredos com marcadores sintéticos | `http-security.test.ts` usa `SYNTHETIC_SECRET_HANDLE` e verifica logs/respostas/events; os testes de módulos também verificam descarte de stderr/valores brutos | Marcadores sintéticos apenas; nenhum segredo real usado. |
| Conflito/save/polling entre abas | `project-save-lifecycle.test.ts`, lógicas de CAS em `projects.test.ts` | Requisito de duas abas e foco durante conflito sem browser nesta rodada. |
| Capacidades que mudam com diálogo aberto | refresh/identidade de resposta em `useAttemptActions.ts`; cobertura de serviço em `recovery.test.ts` | Sem exercício visual do diálogo aberto no navegador. |
| Pergunta expirada/respondida por outra aba | `questions.test.ts` prova estado expirado, recibo desconhecido e consulta sem replay; `QuestionDecisionCard.tsx` separa estado registrado do rascunho | Concorrência de duas abas e preservação visível do texto local não exercitadas em browser. |
| Falha isolada de seção/continuação | `queries.test.ts` prova cursores por seção/versão e continuação inválida; `useAttempt.ts` mantém identidade por seção | Falha de UI em seção enquanto outras continuam renderizadas não observada em browser. |
| Login/Sair antigo, sobreposição e corte impeditivo | Busca no cliente não encontrou UI Login/Sair; `#login` é alias histórico redirecionado a Principal; `AppShell.tsx` possui um único diálogo compartilhado | Sobreposição/corte visual não pôde ser observada; ver AC-27. |

## Reexecução técnica — 2026-10-17

`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build` foram executados nesta rodada. Todos passaram; a suíte totalizou 58 arquivos e 872 testes. O build emitiu avisos de opções Vite depreciadas e de bundle JavaScript acima de 500 kB. Essa execução atualiza a prova técnica local, mas não altera os estados visuais pendentes de AC-27/INT-11/RNF-17–RNF-19 nem os limites de integração real descritos nas linhas acima. A tentativa Playwright MCP foi recusada e está registrada em `visual-evidence.md`.

