# SPEC - Pacote V3 - entrega, agentes e operação
> Gerado automaticamente pelos pipelines do LionClaw. Fonte de verdade para implementacao.

**Precedência V4: retirada de compatibilidades e decisão de 29/10/2026, 14h20.** Para a feature `docs/Docs20261028_162109/SPEC20261028_162109.md`, os contratos atuais abaixo substituem as exigências conflitantes de compatibilidade nesta SPEC, sem reclassificar comportamentos V3 como pré-V3:

- Leituras e escritas operacionais de mapeamento aceitam somente cinco IDs distintos (`backlog`, `ready`, `in_progress`, `in_review`, `delivered`), ou null onde cadastro incompleto é permitido. A união com quatro estados e STATUS_MAPPING_LEGACY deixam de ser requisitos. Não fabricar Backlog nem converter o registro antigo.
- Planejamento, autorização, persistência e consulta de criação compartilham o plano atual integral, com board_name, remote e remote_push. LegacyHttpScaffoldPlan, planos locais/sem push e inferência do nome do quadro deixam de ser variantes operacionais. Recibos e evidências opacas continuam preservados; leitura não converte nem reautoriza plano.
- Instalação vazia cria diretamente o schema final com application_id=0x4e465331 e user_version=54, digest estrutural verificado e schema_migrations vazio. Bases correntes v53 conformes conservam suas 53 linhas, nomes, checksums e timestamps reais, conferidos contra catálogo estático sem SQL histórico executável. Não há tabela schema_installation adicional. Bases parciais, futuras, desconhecidas ou com contratos retirados são recusadas antes de escrita. A retirada do executor histórico de migrations e dos seus backfills/composição é uma consequência específica desse bootstrap aprovado, não evidência de origem pré-V3 dos helpers. Novos perfis e tentativas continuam produzindo composição e cabeçalhos atuais; dados conformes existentes não são preenchidos retroativamente nem alterados ao consultar/reiniciar.
- Recursos exclusivos usam referências atuais de localização versionada por projeto, sem fallback para work/git/execution-bootstrap globais antigos. Banco e recursos compartilhados permanecem globais; preservar original, identidade, propriedade, links, volume/ancestrais, geração, autorização, retenção e transição atual vN→v(N+1). As exigências antigas de backfill de localização e transporte do layout global não autorizam conversão, movimento ou limpeza implícita.

O usuário informou não possuir projeto real salvo e autorizou reset local caso necessário; isso não introduz reset automático no produto nem autoriza excluir pastas de projetos ou recursos externos. Também aceitou substituir a captura visual anterior ausente por uma referência do estado atual, produzida no chat principal, com autoria, bundle e medidas explícitos. Essa referência não é baseline retroativo nem revisão independente. A decisão autoriza a continuação direta desta implementação; não simula status, aprovação ou Design Lock nos mecanismos internos do LionClaw.

**Decisão do usuário em 23/10/2026, 18:37: um checkout de código por tentativa.** Esta decisão substitui as exigências anteriores de checkout separado do Revisor e de nova cópia por rodada/check. Implementador, checks e Revisor usam alternadamente a pasta própria da tentativa, preservando o repositório original. As conversas OMP dos dois papéis permanecem separadas e contínuas nessa pasta. A troca de papel exige resultado oficial, ociosidade e parada física confirmada dos processos próprios anteriores. Código é conferido contra a referência Git imutável antes/depois dos checks e da revisão; alteração invalida a aprovação, sem restaurar arquivos automaticamente. Pareceres e evidências são separados por rodada/versão, sem cópias auxiliares do checkout. Outra tentativa recebe um checkout novo. Pastas e registros históricos não são movidos, apagados nem retomados automaticamente por esta mudança.

**Decisão do usuário em 28/10/2026: retirar a verificação manual configurável.** Projetos e preparações não aceitam definições de comandos, diretórios ou timeouts; a fábrica não cria executor, histórico HTTP ou artifacts de `check_log` para esse mecanismo. Cada rodada continua exigindo um `ImplementerResult` próprio, cuja lista `checks` registra evidências declaradas pelo agente; o Revisor recebe esse resultado e a identidade fixa da versão, sem exigir execução manual nem artefatos de checks. Repetições de comando conservam referências de evidência válida da mesma versão e uma justificativa concreta, sem `check_id`. Removem-se `verification_runs`, a tabela `checks`, artifacts de `check_log`, seus vínculos e `project_revisions.checks_json`. Permanecem `diagnostic_runs.checks_json`, findings, resultados/evidências dos agentes e enums históricos de etapa. Esta decisão substitui as referências antigas a definições, execução e histórico de checks manuais nesta SPEC.
**Precedência V4/E1 (28/10/2026).** As três remoções aprovadas para V4 prevalecem sobre os contratos V3 conflitantes nesta SPEC: banco limpo é permitido; leitores, ramos de revisão e vínculos `check_id` dos mecanismos retirados não são requisitos. Preservam-se os registros atuais, capturas, resultados e evidências produzidos pelo comportamento vigente; não se apagam nem se reescrevem dados reais ou documentos históricos para aparentar aceite V4. A validação após correção é pertinente à nova versão, a revisão independente permanece obrigatória e a entrega usa a referência aprovada. A busca e a consulta individual de tentativas permanecem; a comparação entre tentativas é retirada. QueueOrder contém apenas `use_board_position` e aplica a sequência residual por projeto descrita junto ao contrato da fila.

## 1. Resumo do Produto

**Fontes aprovadas desta execução:** [PRD20261023_014848.md](PRD20261023_014848.md) e [stories-requisitos20261023_014848.md](stories-requisitos20261023_014848.md). Data: 23/10/2026. Esta SPEC especifica a evolução integrada da Nova fábrica de software existente; não descreve um produto independente nem reconstrói uma especificação histórica ausente. O discovery não é entrada desta execução e não foi consultado.

**Problema, público e pitch — conteúdo do PRD:**

O Pacote V3 evolui a fábrica de software existente para simplificar a preparação de projetos, tornar o ciclo de implementação e revisão mais consistente e permitir entregar a versão aprovada no destino escolhido. Resolve dificuldades de configuração, preparação incompleta, continuidade das correções, localização dos arquivos gerenciados e compreensão do resultado e das pendências. Seu escopo inclui integralmente os eixos do V3, inclusive prioridades médias e ajustes menores.

A feature se integra aos módulos atuais de projetos, GitHub, pipeline, execução, workspaces, revisão, publicação, persistência e consultas. A criação passa a exigir repositório GitHub, push inicial e Kanban completo; o cadastro de existente pode permanecer incompleto, com execução bloqueada até a prontidão. Os modos ICR, ICR + commit e ICR + commit + PR preservam a versão aprovada e permitem continuar os efeitos restantes na mesma tentativa. Perfis editáveis, sessões contínuas por papel na tentativa, revisão verificável e decisões humanas nos bloqueios preservam isolamento, histórico e autoridade.

Público: operador que configura projetos, acompanha tentativas e decide efeitos/bloqueios; Implementador que implementa/corrige; Revisor independente que valida a versão fixa. Os dois últimos são papéis de execução, não usuários administrativos. O operador precisa de causa e próxima ação; os agentes precisam de evidências, contexto contínuo e isolamento.

**Stack escolhida — copiada do PRD:** TypeScript strict e ESM com resolução NodeNext, Node.js 24, Fastify 5, React 18/Vite, contratos TypeBox e SQLite via better-sqlite3. Dependências fixadas em lockfile. React 18.3.1, CSS puro e tokens existentes; Vitest nos testes. Git mantém conteúdo versionado; SQLite guarda configurações, estado operacional, resultados, evidências pertinentes e referências. O controlador local coordena Maestri/OMP, mantendo terminal real e TUI normal.

Plataforma: aplicação web local, servida pelo controlador em loopback na porta 4310, com integrações nativas Windows/Git/Maestri/OMP e GitHub. Não acrescentar aplicativo desktop, backend remoto, ORM, serviço de notificações, infraestrutura de fila ou framework de UI.

**Precedência e limites normativos.** PRD prevalece em produto/escopo; stories em comportamento/aceite. Os checkpoints técnicos do PRD detalham as lacunas técnicas anteriores das stories: Backlog é quinto mapeamento versionado; instruções usam `guidance`; diretórios têm localização/diário de transição; notificações usam capacidade local já disponível com reserva durável. Não há terceira via de produto. A ausência da SPEC principal continua explícita. A compatibilização registrada em INTEGRACAO-MAESTRI-OMP.md §10 adota sessão lógica por papel/tentativa e preserva os demais critérios INT. A validação real Maestri/OMP permanece separada e pendente. A confirmação final do discovery permanece pendente segundo as entradas; gerar esta SPEC não aprova fase, Design Lock, implementação, providers ou efeitos externos.

**Vocabulário.** Projeto é identidade estável, distinta de nome/pasta/GitHub Project. Ready significa elegibilidade à fila, não gatilho de execução nem habilitação de automação. Tentativa tem captura e ambiente próprios; rodada é ciclo de implementação/checks/revisão; passagem é trabalho de um papel em uma rodada. Terminal é recurso físico; sessão é conversa lógica de um papel na tentativa. Versão é referência Git imutável do conteúdo. Aprovação técnica, autorização de efeitos, cancelamento, parada física e limpeza são fatos distintos.

**Stories, rastreabilidade e aceite.** A matriz abaixo preserva cada critério original, identificado como `US-nn.Cn`. As referências de API apontam para a seção 3.2; componentes para a seção 4; tabelas para a seção 2. A implementação só atende uma linha quando backend, UI e evidência indicada estiverem comprovados, inclusive recusas diretas na API.

| Story e título | RF | API (prefixo /api/v1) | Tela/componente | Dados | Prova |
| --- | --- | --- | --- | --- | --- |
| US-01: Inicialização e correção das ferramentas | RF-01–06 | settings, settings/execution-options, diagnostics, settings/selections | InitialSetupDialog | factory_settings, diagnostic_runs, operation_requests | Extração limpa, detecção/correção/reinício e conexão real separada |
| US-02: Criação com GitHub e Kanban completos | RF-07–13 | scaffold/options, scaffold/plans, scaffold/creations, creations/:id/reconcile | ProjectCreationDialog | project_creations, creation_steps, effects, creation_board_operations, project_revisions | Recibos/retomada em cada efeito e observação real das cinco colunas |
| US-03: Cadastro incompleto com prontidão explícita | RF-14–17 | projects, projects/:id/configuration, preparations, attempts, queue | ProjectForm / ProjectReadiness / QueuePanel | projects, project_revisions, preparations, attempts, queue_cycles | Cadastro incompleto e recusa direta dos dois inícios; Ready não habilita automação |
| US-04: Destino da versão aprovada por modo | RF-18–22,29–31 | preparations, attempts, deliveries/:id, publication/complete | PreparationDialog / DeliverySummary | deliveries, publication_requests, effects, delivery_targets, reviews | Três modos; Git antes/depois preserva tracked/staged/untracked e checkout |
| US-05: Destino local para cadastro por URL | RF-21,23–24,28 | settings/selections, publication/target, publication/complete | DeliveryTargetFields | delivery_targets, publication_requests, effects | Clone existente/novo, incompatível/ocupado, continuação e trabalho local; E2-a: intenção antes do início em revisão/hash/captura, sem clone por salvar/GET |
| US-06: Continuação da entrega na mesma tentativa | RF-25–31 | publication/authorize-upgrade, publication/complete, publication/reconcile, deliveries/:id | DeliveryContinuation / PublicationDialog | publication_upgrades, publication_requests, delivery_targets, effects, deliveries | Mesma tentativa, clique autorizador, versão adaptada revisada, resposta perdida/reinício sem duplicar |
| US-07: Identificação descritiva de branches e commits | RF-32–35 | deliveries/:id, publication/complete | DeliverySummary | delivery_targets, effects | feat/fix, português/Unicode, ref válida, colisão, retomada com título alterado e legado |
| US-08: Instruções efetivas editáveis | RF-36–40 | settings, projects/:id/configuration, attempts/:id?section=passages, deliveries/:id/producer-result | ProfileForm / HistoricalProfile | execution_profiles, project_revisions, attempts.capture_json, passages.effective_profile_json, attempt_decisions | Composição migrada, edição/captura e uso efetivo no OMP; orientação separada/troca sem início |
| US-09: Continuidade durante correções | RF-41–44,47 | attempts/:id, rounds, resources, interaction, deliveries/:id/review | AttemptDetailDialog / AttemptStageSummary | attempt_sessions, terminal_occupancies, passages, reviews, rounds | Duas sessões contínuas reais, nova versão fora de uso, perda/reinício sem restauração presumida |
| US-10: Reutilização segura de terminais | RF-45–49 | resources, interaction, diagnostics, projects/:id/configuration | AttemptDetailDialog / ProjectReadiness | managed_terminals, attempt_sessions, terminal_occupancies, resources | Próprio/ausente/ocioso/manual/ativo/incerto, reinício e configuração desbloqueada só se ocioso |
| US-11: Pacote verificável de correção | RF-50–52 | deliveries/:id/review, producer-result, attempts/:id?section=findings | FindingDetail / CriteriaSummary | findings, finding_resolutions, criterion_results, passage_results | Resultado declarado pelo Implementador, evidências da versão, falha técnica distinta e justificativa adicional |
| US-12: Revisão focada com aprovação completa | RF-53–56 | deliveries/:id/review, producer-result, attempts/:id/rounds | CriteriaSummary | reviews, criterion_results, findings, passage_results | Resultado próprio por versão, revisão independente completa/incremental, repetição justificada, zero bloqueantes e prova visual |
| US-13: Interrupção por falta de progresso | RF-57–60 | attempts/:id, attempts/:id/decisions, attempts, preparations | AttemptBlockDecision / ProgressHistory | finding_assessments, findings.origin_finding_id, attempt_decisions, preparation_revisions, attempts | Duas correções, parcial comprovado, novo achado e precedência; guidance/troca sem ampliar limites |
| US-14: Contestação com decisão rastreável | RF-60–63 | deliveries/:id/review, attempts/:id?section=findings, attempts/:id/decisions | DisputeHistory / AttemptBlockDecision | finding_disputes, finding_resolutions, finding_assessments, attempt_decisions | Contestação fundamentada, resposta selada e bloqueio com alternativas |
| US-15: Área gerenciada por projeto | RF-64–68 | projects/:id/configuration, projects/:id/storage-transition, resources, operations/:id | ProjectConfigurationDialog / AttemptDetailDialog | project_storage_locations, project_storage_transitions, resources, deliveries | Novo/legado/nomes iguais/renomeação/transição parcial e reinício em todos consumidores |
| US-16: Exclusão compacta e recuperável | RF-69–73 | projects/:id/deletion-preview, projects/:id/deletion, project-deletions/:id, resume | ProjectDeletionDialog / Registros | project_deletions, project_deletion_targets, project_deletion_receipts e vínculos novos no inventário | Windows nativo/links/identidade, parcial/retomada, baseline/meta/otimização e comparação separada de correção/UI/total |
| US-17: Resumo consolidado da entrega | RF-74–75 | attempts/:id, deliveries/:id, review, producer-result | DeliverySummary | deliveries, reviews, criterion_results, finding_resolutions, effects | Resumo único por fatos/versão/recibos e resultado do agente, parcial não vira completo e continuação preserva histórico |
| US-18: Tempo e atividade por etapa | RF-76–77 | attempts/:id, measurements, operation, events/stream | AttemptStageSummary / DashboardPanel | attempt_stage_intervals, passage_measurements, events | Execução/espera/perdido, prazo configurado/ausente, duração legada e silêncio sem parada inferida |
| US-19: Notificações locais de atenção | RF-78–80 | events, events/stream, notifications/claims, notifications/receipts | useLocalNotifications / AppShell / QuestionDecisionCard | notification_dispatches, events, execution_questions | Permissão/suporte/link no host, abas/replay/resposta perdida sem duplicação, pendência preservada |
| US-20: Encerramento guiado | RF-81–83 | shutdown, attempts/:id/cancel, resources | ShutdownDialog | factory_settings.automation_enabled, operation_requests, attempts, resources | Corrida de início, pausa durável/drenagem/reinício, fechar aba distinto de cancelamento/parada/limpeza; E1-a: retirada explícita da pausa sem automação e revogação contra fechamento tardio |
| US-21: Busca completa de tentativas | RF-84–85 | GET attempts com filtros globais | AttemptListPanel / useAttemptSearch | attempts.issue_number, attempts.issue_title, attempts.created_at_ms e índices | Fora da página, AND, fuso/dias inclusivos/offset, intervalo invertido, navegação e vazio/falha |
| US-22: Comparação entre tentativas (retirada na V4) | RF-86/87 retirados | — | — | — | Rota comparativa ausente (404); busca US-21/RF-84/85 e consultas individuais preservadas |
| US-23: Indicador coerente de conexão | RF-88 | events/stream, events, operation, health (somente disponibilidade HTTP) | EventConnectionStatus | Sem tabela de saúde; eventos/observação runtime | Prova visual de estado aplicado e renderizado saudável/falha/reconexão/recuperação |

| Critério | Comportamento obrigatório preservado integralmente | Rastreabilidade e validação |
| --- | --- | --- |
| US-01.C1 | Em uma extração limpa, o inicializador abre o wizard sem exigir quatro caminhos absolutos na linha de comando. | Aplicar backend, frontend, dados e prova da linha US-01 acima; seções 2–5. |
| US-01.C2 | Git, Maestri, OMP, PowerShell e GitHub CLI são procurados e validados; opções válidas aparecem em resumo compacto. Falta ou ambiguidade não resolvida permite seleção manual. | Aplicar backend, frontend, dados e prova da linha US-01 acima; seções 2–5. |
| US-01.C3 | Ausência de executável ou conexão permite corrigir configuração e identifica causa e próxima ação na etapa responsável, mantendo bloqueadas as operações dependentes. | Aplicar backend, frontend, dados e prova da linha US-01 acima; seções 2–5. |
| US-01.C4 | Reiniciar reaproveita caminhos validados, revalida disponibilidade e permite corrigir os inválidos. Encontrar Maestri não marca sua conexão como confirmada. | Aplicar backend, frontend, dados e prova da linha US-01 acima; seções 2–5. |
| US-02.C1 | O fluxo não oferece criação somente local, remoto sem push ou desativação do quadro; o nome do quadro inicia com o nome do projeto e pode ser editado. | Aplicar backend, frontend, dados e prova da linha US-02 acima; seções 2–5. |
| US-02.C2 | Conclusão exige remoto configurado, push inicial confirmado e GitHub Projects configurado/vinculado com visualização Kanban. | Aplicar backend, frontend, dados e prova da linha US-02 acima; seções 2–5. |
| US-02.C3 | O quadro tem exatamente cinco colunas visíveis nesta ordem: Backlog, Ready, In progress, In review, Done. | Aplicar backend, frontend, dados e prova da linha US-02 acima; seções 2–5. |
| US-02.C4 | Falha após criação do repositório ou do quadro mantém o estado parcial e oferece retomada, sem duplicar recursos confirmados nem declarar conclusão antecipada. | Aplicar backend, frontend, dados e prova da linha US-02 acima; seções 2–5. |
| US-03.C1 | Uma pasta local sem remoto GitHub, código publicado ou quadro vinculado pode ser cadastrada em Adicionar existente. | Aplicar backend, frontend, dados e prova da linha US-03 acima; seções 2–5. |
| US-03.C2 | Enquanto faltar qualquer um desses três requisitos, automação e início manual são recusados também no backend; a interface apresenta o que falta e a ação correspondente. | Aplicar backend, frontend, dados e prova da linha US-03 acima; seções 2–5. |
| US-03.C3 | Ready representa elegibilidade para fila. Mover um item para Ready não habilita automação nem ignora bloqueios. | Aplicar backend, frontend, dados e prova da linha US-03 acima; seções 2–5. |
| US-03.C4 | Com os requisitos atendidos e automação habilitada, a fila pode selecionar itens Ready conforme as regras existentes, sem exigir início manual por issue. | Aplicar backend, frontend, dados e prova da linha US-03 acima; seções 2–5. |
| US-04.C1 | Os nomes apresentados são ICR, ICR + commit e ICR + commit + PR, acompanhados por descrição curta do efeito. | Aplicar backend, frontend, dados e prova da linha US-04 acima; seções 2–5. |
| US-04.C2 | ICR preserva código original e mantém resultado aprovado separado e inspecionável, sem commit de entrega. | Aplicar backend, frontend, dados e prova da linha US-04 acima; seções 2–5. |
| US-04.C3 | ICR + commit integra via Git em branch própria da tarefa no repositório local cadastrado e cria commit local da versão aprovada. | Aplicar backend, frontend, dados e prova da linha US-04 acima; seções 2–5. |
| US-04.C4 | ICR + commit + PR também publica a branch e abre PR para a branch de destino, sem merge automático. | Aplicar backend, frontend, dados e prova da linha US-04 acima; seções 2–5. |
| US-04.C5 | A integração não inclui alterações do operador, não sobrescreve o checkout nem troca sua branch de forma prejudicial; a apresentação distingue existência de branch/commit da atualização dos arquivos do checkout aberto. | Aplicar backend, frontend, dados e prova da linha US-04 acima; seções 2–5. |
| US-05.C1 | Escolher modo com commit sem pasta local solicita selecionar clone existente ou criar clone no destino escolhido. | Aplicar backend, frontend, dados e prova da linha US-05 acima; seções 2–5. |
| US-05.C2 | A correspondência com o repositório cadastrado é conferida antes de integrar; destino incompatível bloqueia o efeito e informa a correção necessária. | Aplicar backend, frontend, dados e prova da linha US-05 acima; seções 2–5. |
| US-05.C3 | A mesma regra vale ao continuar uma entrega ICR que passe a exigir commit local. | Aplicar backend, frontend, dados e prova da linha US-05 acima; seções 2–5. |
| US-05.C4 | Trabalho local preexistente permanece preservado na escolha e na integração. | Aplicar backend, frontend, dados e prova da linha US-05 acima; seções 2–5. |
| US-06.C1 | ICR concluído oferece integrar e criar commit ou integrar, criar commit e abrir PR; commit local concluído oferece publicar e abrir PR; PR aberto oferece Ver PR. | Aplicar backend, frontend, dados e prova da linha US-06 acima; seções 2–5. |
| US-06.C2 | A seção Continuar entrega é compacta. O clique autoriza os efeitos descritos pela ação, sem outra confirmação redundante. | Aplicar backend, frontend, dados e prova da linha US-06 acima; seções 2–5. |
| US-06.C3 | A continuação preserva tentativa, modo original, resultado ICR, referência imutável e histórico de efeitos, executando somente o que falta. | Aplicar backend, frontend, dados e prova da linha US-06 acima; seções 2–5. |
| US-06.C4 | Repositório, destino e trabalho local são reconferidos. Integração direta reaproveita aprovação; adaptações ou conflitos resolvidos produzem nova versão com checks e revisão antes da entrega. | Aplicar backend, frontend, dados e prova da linha US-06 acima; seções 2–5. |
| US-06.C5 | Falha e retomada reaproveitam recibos confirmados e reconciliam efeitos incertos antes de repeti-los, sem duplicar commit, push ou PR. A versão aprovada permanece disponível quando a integração é impedida. | Aplicar backend, frontend, dados e prova da linha US-06 acima; seções 2–5. |
| US-07.C1 | Novas branches seguem `<tipo>/<numero-da-issue>-<descricao-em-kebab-case>`; commits seguem `<tipo>: <descricao> (#<numero-da-issue>)`, com mesmo tipo e descrição da tarefa. | Aplicar backend, frontend, dados e prova da linha US-07 acima; seções 2–5. |
| US-07.C2 | Tipo corresponde à alteração entregue, incluindo casos de funcionalidade e correção; descrição é curta, específica e em português. A branch é normalizada em minúsculas, sem acentos e com referência Git válida. | Aplicar backend, frontend, dados e prova da linha US-07 acima; seções 2–5. |
| US-07.C3 | Colisão entre tentativas preserva a branch anterior e acrescenta sufixo curto e estável à nova. Retomada usa a branch registrada mesmo após mudança no título da issue. | Aplicar backend, frontend, dados e prova da linha US-07 acima; seções 2–5. |
| US-07.C4 | O padrão vale também na continuação da entrega; branches antigas não são renomeadas e commits existentes não são reescritos. | Aplicar backend, frontend, dados e prova da linha US-07 acima; seções 2–5. |
| US-08.C1 | O editor de Implementador e Revisor permite consultar e salvar instruções comportamentais efetivamente usadas junto às escolhas de executor, modelo e esforço. | Aplicar backend, frontend, dados e prova da linha US-08 acima; seções 2–5. |
| US-08.C2 | A transição preserva as orientações existentes e usa as instruções atuais como conteúdo inicial, sem perda, duplicação ou texto comportamental fixo oculto que anule a edição. | Aplicar backend, frontend, dados e prova da linha US-08 acima; seções 2–5. |
| US-08.C3 | Uma tentativa captura a versão efetiva; alteração posterior afeta novas tentativas, preservando execução, correções e histórico da tentativa iniciada. Orientação contextual autorizada após bloqueio é registrada separadamente e pode continuar na tentativa atual, sem modificar o perfil capturado. Trocar perfil prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico anterior. | Aplicar backend, frontend, dados e prova da linha US-08 acima; seções 2–5. |
| US-08.C4 | É possível consultar a composição com contexto da tarefa sem expor credenciais. O editor informa que instruções não alteram permissões nem schemas técnicos. | Aplicar backend, frontend, dados e prova da linha US-08 acima; seções 2–5. |
| US-09.C1 | Correções usam a mesma sessão e ambiente do Implementador; revisões seguintes retomam a sessão separada do Revisor, sem permitir que ele altere o produto. Orientação contextual registrada preserva essa continuidade e o perfil capturado; troca de perfil prepara outra tentativa com nova captura e sessão, sem retomar a conversa ou transferir autoridade da anterior. | Aplicar backend, frontend, dados e prova da linha US-09 acima; seções 2–5. |
| US-09.C2 | Antes de revisar outra versão, o ambiente separado do Revisor é atualizado e conferido contra a referência fixa correspondente, somente após deixar de estar em uso na revisão anterior. | Aplicar backend, frontend, dados e prova da linha US-09 acima; seções 2–5. |
| US-09.C3 | A retomada recebe versão atual, diff para a versão anterior, respostas, achados pendentes e checks atualizados; resultados permanecem ligados a passagem, rodada e versão. | Aplicar backend, frontend, dados e prova da linha US-09 acima; seções 2–5. |
| US-09.C4 | Perda de sessão ou acompanhamento interrompe coordenação automática e preserva trabalho, sem apresentar conversa ou autoridade como restauradas após reinício. | Aplicar backend, frontend, dados e prova da linha US-09 acima; seções 2–5. |
| US-10.C1 | Cada papel procura e confere seu terminal próprio; cria se ausente e reutiliza se disponível, sem adotar terminal manual. | Aplicar backend, frontend, dados e prova da linha US-10 acima; seções 2–5. |
| US-10.C2 | Outra tentativa recebe sessão OMP nova e ambiente próprio; resultados e autoridade anteriores não são transferidos. | Aplicar backend, frontend, dados e prova da linha US-10 acima; seções 2–5. |
| US-10.C3 | Após reinício, reencontrar a identidade do terminal exige nova conferência de disponibilidade; terminal ativo ou incerto não é ocupado ou reiniciado. | Aplicar backend, frontend, dados e prova da linha US-10 acima; seções 2–5. |
| US-10.C4 | Terminal aberto e ocioso após entrega não bloqueia configuração por si só. Execução ativa, publicação pendente e efeitos incertos continuam bloqueantes; disponibilidade não substitui confirmação de parada para remover ambientes. | Aplicar backend, frontend, dados e prova da linha US-10 acima; seções 2–5. |
| US-11.C1 | Cada achado contém identidade estável, problema, evidência, resultado esperado, prioridade e vínculos a critérios e versão revisada. | Aplicar backend, frontend, dados e prova da linha US-11 acima; seções 2–5. |
| US-11.C2 | O pacote inclui o resultado do Implementador e evidências pertinentes da versão, distinguindo falha técnica relatada de defeito comprovado no produto. | Aplicar backend, frontend, dados e prova da linha US-11 acima; seções 2–5. |
| US-11.C3 | A orientação concentra correções nos achados e consequências; mudanças adicionais exigem justificativa consultável pelo Revisor, sem incorporar requisitos novos silenciosamente. | Aplicar backend, frontend, dados e prova da linha US-11 acima; seções 2–5. |
| US-12.C1 | A revisão inicial cobre todos os critérios; as seguintes se concentram em diff, achados pendentes e possíveis regressões, ampliando conferência quando necessário. | Aplicar backend, frontend, dados e prova da linha US-12 acima; seções 2–5. |
| US-12.C2 | Cada correção exige resultado próprio do Implementador para a nova versão; o Revisor recebe esse resultado e valida critérios independentemente, incluindo prova visual quando exigida. | Aplicar backend, frontend, dados e prova da linha US-12 acima; seções 2–5. |
| US-12.C3 | Repetição de comando com evidência válida da mesma versão registra motivo concreto, como reprodução, insuficiência ou condições diferentes relevantes. | Aplicar backend, frontend, dados e prova da linha US-12 acima; seções 2–5. |
| US-12.C4 | Aprovação final cobre todos os critérios atuais e exige zero achados bloqueantes pendentes; aprovação afetada por alterações não é transportada automaticamente. Evidência de outra versão, compilação ou typecheck não substitui prova visual exigida. | Aplicar backend, frontend, dados e prova da linha US-12 acima; seções 2–5. |
| US-13.C1 | Duas rodadas consecutivas de correção sem progresso verificável no mesmo problema bloqueante interrompem repetição automática e apresentam evidências ao usuário. | Aplicar backend, frontend, dados e prova da linha US-13 acima; seções 2–5. |
| US-13.C2 | Correção parcial comprovada conta como progresso; mera edição ou declaração não conta. Novo achado não apaga a recorrência anterior do mesmo problema. | Aplicar backend, frontend, dados e prova da linha US-13 acima; seções 2–5. |
| US-13.C3 | O usuário recebe opções para ajustar orientação, trocar perfil ou encerrar; nenhuma opção é aplicada automaticamente. Orientação contextual autorizada é registrada e pode continuar na tentativa atual mantendo o perfil capturado e os limites existentes. Troca de perfil mantém interrompida a continuidade automática da tentativa anterior e prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico anterior. | Aplicar backend, frontend, dados e prova da linha US-13 acima; seções 2–5. |
| US-13.C4 | O limite total configurado permanece válido e prevalece o primeiro bloqueio atingido entre recorrência, divergência encaminhada e limite total, sem ampliar limites automaticamente. | Aplicar backend, frontend, dados e prova da linha US-13 acima; seções 2–5. |
| US-14.C1 | A contestação registra justificativa e evidências para o achado, sem resolvê-lo automaticamente. | Aplicar backend, frontend, dados e prova da linha US-14 acima; seções 2–5. |
| US-14.C2 | O Revisor explica por que mantém ou resolve o achado, preservando registros anteriores. | Aplicar backend, frontend, dados e prova da linha US-14 acima; seções 2–5. |
| US-14.C3 | Se mantiver o achado após contestação fundamentada, o fluxo interrompe a repetição automática e apresenta ao usuário desacordo, evidências, justificativa e alternativas. | Aplicar backend, frontend, dados e prova da linha US-14 acima; seções 2–5. |
| US-15.C1 | Bootstraps, Git interno, ambientes de implementação, revisão, publicação e artefatos de domínio ficam sob pasta gerenciada do projeto, identificável por nome e identidade estável. | Aplicar backend, frontend, dados e prova da linha US-15 acima; seções 2–5. |
| US-15.C2 | Nomes iguais não colidem; renomear projeto não rompe referências. A separação por tentativa e passagem preserva rodada e versão. | Aplicar backend, frontend, dados e prova da linha US-15 acima; seções 2–5. |
| US-15.C3 | Banco e recursos compartilhados permanecem globais; a pasta original do usuário mantém sua localização. | Aplicar backend, frontend, dados e prova da linha US-15 acima; seções 2–5. |
| US-15.C4 | Antes da implementação, existe estratégia documentada para dados anteriores; transição não move ambientes em uso nem perde referências, entregas ou evidências. Recuperação, retenção, publicação e exclusão reconhecem a organização resultante. | Aplicar backend, frontend, dados e prova da linha US-15 acima; seções 2–5. |
| US-16.C1 | A confirmação mostra a pasta gerenciada e informa remoção integral; se a pasta original também for removida, mostra seu caminho separadamente. Nenhum outro destino autorizado fica oculto. | Aplicar backend, frontend, dados e prova da linha US-16 acima; seções 2–5. |
| US-16.C2 | A ação de confirmação não exige percorrer uma lista extensa de subpastas; bloqueios mostram causa e próxima ação sem repetição. O inventário detalhado permanece nos registros. | Aplicar backend, frontend, dados e prova da linha US-16 acima; seções 2–5. |
| US-16.C3 | Autorização durável, bloqueios, proteção de caminhos compartilhados/substituídos, links sem seguir destinos e retomada parcial permanecem válidos. | Aplicar backend, frontend, dados e prova da linha US-16 acima; seções 2–5. |
| US-16.C4 | Somente a conferência da remoção de todos os destinos e dados previstos permite sucesso; falha ou remoção parcial permanece explícita. | Aplicar backend, frontend, dados e prova da linha US-16 acima; seções 2–5. |
| US-16.C5 | Medir o baseline por etapa, definir a meta de desempenho a partir dessa medição e aplicar otimização efetiva orientada ao custo observado. Validar comparativamente o resultado frente à meta, com muitas tentativas e caches volumosos e condições comparáveis, separando tempo total, resposta da UI e correção da remoção. Apenas medir não atende o V3; ganho só é declarado com prova e meta não atingida permanece pendente. Avaliar a remoção da pasta como unidade quando segura, sem impor essa técnica nem reduzir qualquer garantia de exclusão. | Aplicar backend, frontend, dados e prova da linha US-16 acima; seções 2–5. |
| US-17.C1 | O resumo mostra resultado, localização do código, branch, commit e PR conforme efeitos confirmados, com acesso aos destinos disponíveis e indicação de pendências. | Aplicar backend, frontend, dados e prova da linha US-17 acima; seções 2–5. |
| US-17.C2 | Inclui critérios atendidos, resultado declarado pelo agente, achados resolvidos, limitações e referência imutável, distinguindo comprovado, não verificado e observações não bloqueantes. | Aplicar backend, frontend, dados e prova da linha US-17 acima; seções 2–5. |
| US-17.C3 | Aprovação e conclusão dependem de versão, critérios e recibos, nunca apenas da declaração textual do executor. Entrega parcial não aparece como sucesso completo. | Aplicar backend, frontend, dados e prova da linha US-17 acima; seções 2–5. |
| US-17.C4 | A continuação atualiza o mesmo resultado visível e preserva o histórico, sem avisos duplicados por etapa ou diagnósticos brutos na interface principal. | Aplicar backend, frontend, dados e prova da linha US-17 acima; seções 2–5. |
| US-18.C1 | A interface mostra etapa atual, tempo decorrido, última atividade confirmada e prazo restante somente se houver prazo definido. | Aplicar backend, frontend, dados e prova da linha US-18 acima; seções 2–5. |
| US-18.C2 | Espera por decisão e perda de acompanhamento aparecem distintas de execução demorada. Inatividade recente não prova parada física. | Aplicar backend, frontend, dados e prova da linha US-18 acima; seções 2–5. |
| US-18.C3 | Não aparecem percentuais fictícios nem previsão de conclusão sem base observada. | Aplicar backend, frontend, dados e prova da linha US-18 acima; seções 2–5. |
| US-19.C1 | Pergunta pendente, falha e conclusão oferecem notificação local com identificação mínima do trabalho e acesso direto à tentativa. | Aplicar backend, frontend, dados e prova da linha US-19 acima; seções 2–5. |
| US-19.C2 | Atualizações e reconexões do mesmo evento não geram notificações duplicadas. | Aplicar backend, frontend, dados e prova da linha US-19 acima; seções 2–5. |
| US-19.C3 | Disponibilidade e permissões da superfície são verificadas; indisponibilidade mantém a pendência acessível na interface. | Aplicar backend, frontend, dados e prova da linha US-19 acima; seções 2–5. |
| US-20.C1 | A ação pausa novos inícios e mostra trabalhos ativos e providências necessárias antes de fechar o controlador. | Aplicar backend, frontend, dados e prova da linha US-20 acima; seções 2–5. |
| US-20.C2 | O pedido não cancela tentativas implicitamente; escolhas sobre trabalhos em andamento são explícitas. | Aplicar backend, frontend, dados e prova da linha US-20 acima; seções 2–5. |
| US-20.C3 | Encerramento do controlador, cancelamento, parada física e limpeza são distinguidos; recursos ativos ou incertos e seus ambientes permanecem identificados e preservados. | Aplicar backend, frontend, dados e prova da linha US-20 acima; seções 2–5. |
| US-20.C4 | Fechar a interface não é apresentado como prova de encerramento do controlador ou dos executores. | Aplicar backend, frontend, dados e prova da linha US-20 acima; seções 2–5. |
| US-21.C1 | Busca por título ou número da issue e filtro por período combinam-se com projeto e resultado. O período usa a data de início da tentativa, com dias inicial e final inclusivos no fuso local explicitado na interface. Intervalo invertido é recusado com orientação para correção. | Aplicar backend, frontend, dados e prova da linha US-21 acima; seções 2–5. |
| US-21.C2 | Uma tentativa correspondente fora da página visível é encontrada; paginação e resumos leves são preservados. | Aplicar backend, frontend, dados e prova da linha US-21 acima; seções 2–5. |
| US-21.C3 | Navegar entre páginas mantém critérios; ausência de resultados e falha de consulta têm estados distintos. | Aplicar backend, frontend, dados e prova da linha US-21 acima; seções 2–5. |
| US-22.C1 | Retirado na V4 por decisão de 28/10/2026; não é critério ativo de produto. | Evidência de remoção: rota comparativa retorna 404; US-21.C1–C3 permanecem ativos. |
| US-22.C2 | Retirado na V4 por decisão de 28/10/2026; não é critério ativo de produto. | Capturas, rodadas, versões e detalhes seguem consultáveis individualmente. |
| US-22.C3 | Retirado na V4 por decisão de 28/10/2026; não é critério ativo de produto. | Não há projeção comparativa nem ação de comparação. |
| US-23.C1 | Falha de conexão ou atualização exibe ponto vermelho; verde fica reservado ao estado saudável confirmado. | Aplicar backend, frontend, dados e prova da linha US-23 acima; seções 2–5. |
| US-23.C2 | O texto continua identificando o estado, sem depender apenas da cor. | Aplicar backend, frontend, dados e prova da linha US-23 acima; seções 2–5. |
| US-23.C3 | A transição saudável, falha e recuperação é validada visualmente; tentativa de reconexão não é apresentada como recuperação confirmada. O CSS atual já declara estilo vermelho para indisponibilidade, portanto o problema visual relatado exige verificação do estado aplicado e da renderização completa. | Aplicar backend, frontend, dados e prova da linha US-23 acima; seções 2–5. |

**Requisitos funcionais e não funcionais integrais.** Os RF/RNF abaixo são obrigações adicionais à leitura da matriz; não são metas já medidas nem evidência de implementação.

**RF-01 a RF-88.**

Cada linha define uma obrigação verificável. A coluna de integração indica a fronteira existente responsável; não prescreve novo serviço ou tecnologia.

**4.1 Configuração e projetos**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-01 | Abrir o wizard pelo inicializador sem exigir quatro caminhos absolutos. | US-01 | `scripts/start-host.mjs`, onboarding |
| RF-02 | Detectar e validar Git, Maestri, OMP, PowerShell e GitHub CLI na máquina em uso. | US-01 | config, execution, github, diagnostics |
| RF-03 | Permitir seleção manual quando não houver opção válida ou houver ambiguidade não resolvida. | US-01 | onboarding e seleção nativa existente |
| RF-04 | Reutilizar configuração validada e revalidar disponibilidade em novas inicializações. | US-01 | storage/settings e bootstrap |
| RF-05 | Conferir conexão Maestri separadamente da localização do executável. | US-01 | execution |
| RF-06 | Manter configuráveis ferramentas indisponíveis, bloqueando apenas as operações dependentes e mostrando causa/próxima ação. | US-01 | prontidão e onboarding |
| RF-07 | Restringir Criar projeto à criação com remoto GitHub e push inicial. | US-02 | contratos scaffold, projects e UI |
| RF-08 | Solicitar nome editável de quadro, preenchido inicialmente com o nome do projeto. | US-02 | `ProjectCreationDialog.tsx` e plano scaffold |
| RF-09 | Criar e vincular GitHub Projects obrigatório com visualização Kanban. | US-02 | projects orquestra; github executa efeitos |
| RF-10 | Configurar exatamente Backlog, Ready, In progress, In review e Done, nessa ordem visível. | US-02 | github e contratos de configuração |
| RF-11 | Mapear `ready`, `in_progress`, `in_review` e `delivered` para Ready, In progress, In review e Done, respectivamente. | US-02, US-03 | `projects.ts`; representação técnica de Backlog a detalhar |
| RF-12 | Marcar criação como concluída somente após confirmar remoto, push e quadro configurado/vinculado. | US-02 | recibos e estado de criação |
| RF-13 | Retomar criação parcial reutilizando recursos confirmados e reconciliando efeitos incertos antes de repeti-los. | US-02 | creations, scaffold e github |
| RF-14 | Aceitar cadastro de existente incompleto sem conceder prontidão operacional. | US-03 | projects e `ProjectForm.tsx` |
| RF-15 | Recusar automação e início manual enquanto faltar remoto GitHub, código publicado ou quadro vinculado. | US-03 | queue, preparations e pipeline |
| RF-16 | Mostrar requisitos faltantes e próxima ação para preparar o projeto. | US-03 | `ProjectReadiness.tsx` |
| RF-17 | Selecionar Ready pela fila somente com automação habilitada e demais requisitos existentes atendidos. | US-03 | queue e pipeline |

**4.2 Entrega**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-18 | Apresentar os três modos com nomes e descrições de efeitos definidos no V3. | US-04 | preparação e publicação |
| RF-19 | Manter resultado ICR aprovado separado, inspecionável e sem commit de entrega. | US-04 | capture, retenção e publication |
| RF-20 | Integrar a versão aprovada via Git em branch própria no repositório local cadastrado e criar o commit no modo correspondente. | US-04 | workspaces, substituindo suficiência do commit apenas interno |
| RF-21 | Preservar alterações locais do operador fora do commit da tarefa e impedir sobrescrita ou troca prejudicial de branch do checkout. | US-04, US-05, US-06 | inspeção e integração workspaces |
| RF-22 | Publicar branch e abrir PR para destino conferido no modo PR, sem merge automático ou force-push. | US-04 | remote-publication e github |
| RF-23 | Solicitar clone existente ou criação de clone em destino escolhido quando projeto por URL exigir commit local. Complemento E2-a aprovado: guardar intenção na revisão da preparação, resumo/hash e captura de início, sem clonar ao salvar/ler; clonagem posterior por operação autorizada e reconciliável, sem confirmação redundante quando já coberta pela ação explícita apresentada. | US-05 | cadastro, preparação, continuação e workspaces |
| RF-24 | Validar correspondência do clone com o repositório cadastrado antes de integrar. | US-05 | workspaces e identidade do projeto |
| RF-25 | Oferecer somente as ações de continuação correspondentes ao estado confirmado da entrega. | US-06 | summary de publication e UI |
| RF-26 | Autorizar pelo clique os efeitos restantes descritos, sem confirmação redundante. | US-06 | `authorizeUpgrade`, idempotência e revisão |
| RF-27 | Preservar modo original e registrar continuação e efeitos na mesma tentativa. | US-06 | publication-modes e histórico |
| RF-28 | Reconferir repositório local, destino e trabalho existente antes de continuar. | US-06 | workspaces e publication |
| RF-29 | Reaproveitar aprovação da integração direta; exigir resultado próprio do Implementador e revisão de nova versão quando houver adaptação ou conflito resolvido. | US-04, US-06 | capture e reviews |
| RF-30 | Reconciliar efeitos incertos e reutilizar recibos para evitar duplicação de commit, push e PR. | US-04, US-06 | effects e publication |
| RF-31 | Preservar referência Git imutável e conteúdo necessário à entrega posterior conforme retenção, sem snapshot auxiliar de checkout. | US-06 | capture e retention |
| RF-32 | Gerar branches e mensagens de commit com padrões, tipo e descrição em português definidos em US-07. | US-07 | identidade de publicação e Git |
| RF-33 | Normalizar descrição da branch para referência Git válida, minúscula, sem acentos e em kebab-case. | US-07 | workspaces |
| RF-34 | Resolver colisão entre tentativas com sufixo curto estável e reutilizar branch registrada nas retomadas. | US-07 | efeitos e referências Git |
| RF-35 | Preservar nomes de branches e histórico de commits existentes. | US-07 | publicação e compatibilidade |

**4.3 Perfis e execução**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-36 | Expor instruções comportamentais efetivas editáveis nos perfis dos dois papéis. | US-08 | ProfileForm, contratos e roles |
| RF-37 | Migrar composição de instruções atuais e orientações existentes sem perda, duplicação ou anulação por prompt comportamental oculto. | US-08 | resources/roles, guidance e migrations |
| RF-38 | Persistir revisões de instruções e capturar conteúdo efetivo no início da tentativa para todas as suas correções. Registrar orientação contextual autorizada separadamente, sem alterar o perfil capturado; troca de perfil prepara nova tentativa com nova captura e sessão, preservando o histórico anterior. | US-08, US-13 | configuration e attempt capture |
| RF-39 | Permitir consultar composição de perfil e contexto preservando dados privados e credenciais. | US-08 | entrada de execution e detalhe pertinente |
| RF-40 | Manter schemas, autorização, isolamento e vínculos de versão independentes do texto editável. | US-08 | contratos técnicos de execution |
| RF-41 | Continuar sessão e ambiente do Implementador dentro da tentativa. | US-09 | continuação existente no adapter |
| RF-42 | Continuar sessão separada do Revisor nas revisões seguintes da tentativa. | US-09 | adapter e pipeline |
| RF-43 | Atualizar e conferir ambiente do Revisor contra a nova versão fixa somente quando não estiver em uso anterior. | US-09 | workspaces/review e execution |
| RF-44 | Fornecer na retomada versão, diff, respostas, achados pendentes e checks atualizados. | US-09 | pipeline e entrada de execução |
| RF-45 | Identificar terminal próprio por papel, criar quando ausente e reutilizar somente após disponibilidade conferida. | US-10 | adapter e native |
| RF-46 | Iniciar sessões OMP novas e ambientes próprios em outra tentativa sem transportar conversa ou autoridade. | US-10 | execution e prepareAttempt |
| RF-47 | Reencontrar terminais após reinício sem inferir recuperação de sessão, acompanhamento ou autoridade. | US-09, US-10 | persistência de execução e recovery |
| RF-48 | Impedir ocupação ou reinício de terminal ativo ou incerto e preservar terminais manuais. | US-10 | native e recursos conhecidos |
| RF-49 | Liberar configuração quando só restar terminal ocioso após entrega, preservando bloqueios por atividade, publicação pendente ou efeitos incertos. | US-10 | project-configuration-lock |

**4.4 Correção e revisão**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-50 | Entregar achado com identidade estável, problema, evidência, resultado esperado, prioridade, critérios e versão. | US-11 | reviews, execution e pipeline |
| RF-51 | Incluir o resultado do Implementador e evidências pertinentes no pacote de correção, separando falha técnica relatada de defeito comprovado. | US-11 | passage_results e reviews |
| RF-52 | Exigir justificativa de alterações adicionais às correções e disponibilizá-la ao Revisor. | US-11 | resultado do Implementador e contexto de revisão |
| RF-53 | Executar revisão inicial completa e revisões seguintes focadas em alterações, pendências e regressões com ampliação quando necessária. | US-12 | pipeline e perfil do Revisor |
| RF-54 | Exigir resultado próprio do Implementador e as validações técnicas pertinentes após cada correção, vinculando resultado e evidências à nova versão antes de sua revisão independente. | US-12 | passage_results, deliveries e pipeline |
| RF-55 | Reutilizar referências de evidência válidas da mesma versão e registrar motivo concreto para comandos repetidos. | US-12 | repetição declarada pelo Revisor e resultado do Implementador |
| RF-56 | Exigir validação independente de todos os critérios atuais e ausência de bloqueantes para aprovação final. | US-12 | storage/reviews e publicação |
| RF-57 | Registrar progresso verificável do mesmo problema entre rodadas, distinguindo parcial comprovado, mera edição e novo achado. | US-13 | histórico estável de findings |
| RF-58 | Interromper repetição automática após duas correções consecutivas sem progresso no mesmo bloqueante. | US-13 | planejamento de correção |
| RF-59 | Encaminhar evidências e opções de ajustar orientação, trocar perfil ou encerrar para decisão humana. Orientação contextual registrada pode continuar na tentativa atual mantendo perfil capturado e limites; troca de perfil mantém interrompida a continuidade automática anterior e prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico. | US-13 | decisões e interface da tentativa |
| RF-60 | Preservar limite total configurado e aplicar o primeiro bloqueio atingido sem troca automática de perfil ou ampliação de limite. | US-13, US-14 | configuração capturada e pipeline |
| RF-61 | Registrar contestação fundamentada do Implementador com evidências sem resolver automaticamente o achado. | US-14 | respostas de findings |
| RF-62 | Registrar justificativa do Revisor para manter ou resolver contestação, preservando registros anteriores. | US-14 | reviews e resoluções |
| RF-63 | Encaminhar ao usuário achado mantido após contestação fundamentada, com desacordo, evidências e alternativas. | US-14 | bloqueio de correção e decisão |

**4.5 Organização e exclusão**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-64 | Agrupar todos os arquivos gerenciados exclusivos sob pasta do projeto, identificada por nome e identidade estável. | US-15 | workspaces, bootstrap e recursos |
| RF-65 | Preservar separação por tentativa/passagem e vínculos de rodada/versão após agrupamento ou renomeação. | US-15 | referências persistidas |
| RF-66 | Manter banco/recursos compartilhados globais e pasta original em sua localização. | US-15 | configuração de diretórios |
| RF-67 | Definir estratégia de transição antes da implementação e preservar ambientes em uso, entregas e evidências existentes. | US-15 | migrations, recovery e retention |
| RF-68 | Adaptar criação, leitura, execução, recuperação, retenção, publicação e exclusão à organização por projeto. | US-15 | interfaces públicas dos módulos |
| RF-69 | Mostrar confirmação compacta da pasta gerenciada e informar remoção integral, expondo separadamente original e outros destinos autorizados. | US-16 | preview de exclusão e dialog |
| RF-70 | Manter inventário detalhado nos registros e causa/próxima ação de bloqueios na confirmação. | US-16 | deletion inventory e UI |
| RF-71 | Aceitar a confirmação de exclusão com pendências operacionais e resolvê-las automaticamente após persistir a autorização: revogar novos trabalhos, encerrar processos próprios e conferir a parada antes de remover pastas. Recursos somente planejados não exigem posse física. Preservar as barreiras contra efeitos incertos e caminhos compartilhados/substituídos e links na fronteira da remoção. Falha mantém progresso e permite Tentar novamente. | US-16 | acceptance, barrier e paths |
| RF-72 | Retomar exclusão parcial e declarar sucesso somente após conferir todos os destinos e dados previstos. | US-16 | worker e finalization |
| RF-73 | Medir baseline por etapa, definir meta após a medição, aplicar otimização efetiva orientada ao custo observado e validar comparativamente o resultado frente à meta em carga representativa. Apenas medir não atende o V3; preservar todas as garantias de exclusão e não declarar ganho sem prova. | US-16 | measurements e provas de exclusão |

**4.6 Operação e histórico**

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-74 | Consolidar resumo de entrega com resultado, localização, branch, commit, PR, pendências e acesso a destinos confirmados. | US-17 | projeções e detalhe |
| RF-75 | Integrar critérios, resultado declarado pelo agente, achados resolvidos, limitações e referência fixa ao resultado sem duplicar avisos. | US-17 | reviews e publication |
| RF-76 | Exibir etapa, tempo decorrido, última atividade confirmada e prazo restante somente quando definido. | US-18 | queries, eventos e dashboard |
| RF-77 | Diferenciar execução demorada, espera por decisão e perda de acompanhamento sem inferir parada por inatividade. | US-18 | estados observados de execution |
| RF-78 | Notificar localmente pergunta pendente, falha e conclusão com acesso direto à tentativa. | US-19 | eventos e navegação existentes |
| RF-79 | Deduplicar notificações do mesmo evento durante atualização e reconexão. | US-19 | identidade de eventos |
| RF-80 | Verificar disponibilidade/permissão da notificação e manter pendência na UI quando indisponível. | US-19 | superfície local a detalhar |
| RF-81 | Pausar novos inícios na ação de encerramento guiado. Complemento E1-a aprovado: Retomar novos inícios retira a pausa durável e revoga drenagem/fechamento ainda pendente, mantém automação desligada e não cancela/reinicia/publica tentativas. | US-20 | fila e ciclo de vida |
| RF-82 | Apresentar trabalhos ativos e escolhas explícitas sem cancelamento implícito. | US-20 | pipeline e interface |
| RF-83 | Distinguir fechamento, cancelamento, parada física e limpeza, preservando ambientes ativos ou incertos. | US-20 | execution, recovery e workspaces |
| RF-84 | Aplicar busca por título/número e período no histórico completo combinada a projeto/resultado. Usar a data de início da tentativa, com dias inicial e final inclusivos no fuso local explicitado na interface; recusar intervalo invertido. | US-21 | AttemptListQuery, queries e storage |
| RF-85 | Preservar paginação, critérios de busca na navegação e estados distintos de vazio e falha. | US-21 | cliente de consultas e lista |
| RF-86 | Retirado na V4 por decisão de 28/10/2026; comparação entre tentativas não integra o contrato ativo. | — |
| RF-87 | Retirado na V4 por decisão de 28/10/2026; projeção comparativa não integra o contrato ativo. | — |
| RF-88 | Mostrar vermelho na falha e verde somente na conexão saudável confirmada, mantendo texto de estado. | US-23 | EventConnectionStatus e CSS |

**RNF-01 a RNF-18.**

Não são fixadas metas numéricas de latência ou ganho sem baseline, pois o discovery exige medição anterior. Os limites já configurados permanecem válidos; novas metas dependerão das medições registradas.

| ID | Categoria | Requisito e verificação mensurável | Vínculo |
| --- | --- | --- | --- |
| RNF-01 | Performance | Registrar baseline por etapa, tempo total e resposta da interface na exclusão; definir meta a partir da medição, aplicar otimização efetiva e validar antes/depois frente à meta em projetos com muitas tentativas e caches volumosos, com cenário e condições comparáveis. Comprovar separadamente correção da remoção e preservação de todas as garantias. Apenas medir não atende o V3; meta não atingida permanece pendente e nenhum ganho é declarado sem prova comparativa. | RF-73 |
| RNF-02 | Performance | Busca e paginação retornam resumos leves e carregam detalhes sob demanda. Verificar que listar ou pesquisar não lê checkouts/caches nem carrega artefatos completos por tentativa. | RF-84, RF-85 |
| RNF-03 | Performance | Medir comandos repetidos, duração e consumo quando disponíveis no ciclo de correções; toda repetição de comando com evidência válida da mesma versão registra motivo concreto. Otimização não remove validações técnicas pertinentes à versão. | RF-54, RF-55 |
| RNF-04 | Segurança | Nenhum comando, prompt consultável, log, notificação ou arquivo gerado pode expor credenciais. Validar redação das superfícies alteradas e uso dos mecanismos existentes de acesso. | RF-02, RF-39, RF-78 |
| RNF-05 | Segurança | Preservar Host/Origin locais, cookie HttpOnly/SameSite strict e CSRF nas novas mutações HTTP. Requisição sem os controles pertinentes deve ser recusada; sessão local não autoriza GitHub. | RF-26, RF-36, RF-81 |
| RNF-06 | Segurança | Zero alterações preexistentes do operador incorporadas ou sobrescritas pela integração. Comparar conteúdo e estado Git local antes/depois em cenário com alterações rastreadas e arquivos não rastreados. | RF-20, RF-21, RF-24 |
| RNF-07 | Segurança | Nenhuma exclusão pode atingir caminho compartilhado, substituído ou destino de link não autorizado; testar links, troca de identidade e inventário alterado preservando confirmação/autorização vigente. | RF-69 a RF-72 |
| RNF-08 | Confiabilidade | Reapresentar a mesma operação e reiniciar após efeito confirmado ou resposta perdida não cria recursos ou efeitos duplicados. Validar criação remota, quadro, commit, push, PR e exclusão por recibos e reconciliação. | RF-13, RF-30, RF-72 |
| RNF-09 | Confiabilidade | Cada resultado e evidência técnica, parecer e aprovação utilizados na entrega identificam a versão correspondente. Rejeitar evidência de outra versão e preservar os registros anteriores após correção. | RF-29, RF-44, RF-54, RF-56 |
| RNF-10 | Confiabilidade | Reinício, perda de acompanhamento e indisponibilidade de notificação não podem apagar trabalho nem converter incerteza em parada ou sucesso. Exercitar interrupção em criação, revisão, integração e encerramento. | RF-13, RF-47, RF-77, RF-80, RF-83 |
| RNF-11 | Confiabilidade | Notificação do mesmo evento aparece no máximo uma vez durante atualização/reconexão; evento diferente continua elegível. Validar replay de eventos e permanência de pendências indisponíveis na UI. | RF-79, RF-80 |
| RNF-12 | Usabilidade | Impedimento visível contém causa e próxima ação; resumo tem um resultado consolidado. Detalhes técnicos permanecem nos registros. Conferir estados parcial, bloqueado, concluído e continuação sem mensagens duplicadas. | RF-06, RF-16, RF-70, RF-74, RF-75 |
| RNF-13 | Usabilidade | Confirmação de exclusão não exige rolar lista de subpastas para alcançar a ação; destinos principais e bloqueios continuam identificáveis. Validar UI com projeto contendo muitas tentativas. | RF-69, RF-70 |
| RNF-14 | Usabilidade | Identificação de conexão usa texto além de cor; verde só após confirmação saudável. Validar visualmente saudável, falha, reconexão e recuperação no componente renderizado na aplicação. | RF-88 |
| RNF-15 | Portabilidade | Inicialização distribuída resolve caminhos na máquina em uso sem diretórios pessoais fixos. Validar extração limpa, correção manual, reinício e caminhos com espaços/Unicode. | RF-01 a RF-05 |
| RNF-16 | Persistência | Conteúdo versionado permanece no Git; SQLite mantém configuração, critérios, resultados, evidências pertinentes e referências necessárias, sem copiar checkout, índice, ignorados ou caches. Verificar tamanho persistido com caches volumosos e retenção da versão necessária à continuação. | RF-31, RF-64 a RF-68 |
| RNF-17 | Manutenibilidade | Mudanças preservam TypeScript strict, contratos TypeBox, fronteiras e interfaces públicas existentes; novas persistências usam migrations numeradas. Verificar com typecheck, lint de fronteiras e testes pertinentes. | Todos os domínios |
| RNF-18 | Confiabilidade | Transição de diretórios conserva referências e evidências de projetos existentes e não move ambiente em uso. Validar leitura, retomada, publicação, retenção e exclusão após reinício e transição parcial. | RF-67, RF-68 |

**Métricas de sucesso.** Validar instalação limpa/Unicode, zero inícios de projeto incompleto, cinco colunas exatas, zero duplicações na retomada, zero alterações locais incorporadas/sobrescritas, aprovação de todos os critérios atuais sem bloqueantes e por versão, interrupção após duas correções sem progresso e primeiro bloqueio atingido, continuidade isolada dos dois papéis, nenhuma ocupação manual/ativa/incerta, notificação no máximo uma vez por evento/consumidor, histórico completo e capturas históricas estáveis. Exclusão exige baseline, meta posterior, otimização aplicada e comparação frente à meta; medir apenas não atende. Nenhum percentual de ganho, previsão ou meta numérica nova é aprovado aqui.

**Fora do escopo.** Não substituir a stack, criar produto separado, oferecer criação local/sem push/quadro opcional, fazer merge automático/force-push, renomear branches antigas ou reescrever commits, sobrescrever checkout do operador, restaurar conversa/autoridade automaticamente, adotar terminal manual/ativo/incerto, alterar permissões via instruções, trocar perfil/ampliar limites automaticamente, acrescentar requisitos em correções, eliminar checks ou substituir prova visual, inventar estimativas/WIP/Estimate, persistir checkout/índice/ignorados/caches auxiliares, mover pasta original ou ambiente em uso, introduzir notificações externas, transportar trabalho entre tentativas ou inferir causalidade na comparação.

**Validação e riscos.** As matrizes das seções 4.6 e 5.2 completam a prova prevista. Configuração/verificação efetiva do Kanban e suporte da notificação no host exigem prova, sem redução dos requisitos. Baseline de exclusão e planos de busca determinam metas posteriores. Build/typecheck, provas controladas, UI renderizada, Git local/Windows nativo, Maestri/OMP real e GitHub real são gates separados. Nenhuma integração ou efeito real é iniciado por esta documentação ou pela suíte padrão. Comandos efetivamente configurados: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:http`, `npm.cmd run test:acceptance`, `npm.cmd run test:distribution`, `npm.cmd run test:browser:deletion`; selecionar os pertinentes na implementação. Critérios INT pertinentes: INT-01/02 contexto/conexão; INT-03/04/05 sessão e escolhas efetivas; INT-06/07 resultado/pergunta; INT-08 perda de acompanhamento; INT-11 UI; INT-13/14 UTF-8/Windows; INT-15/16 cancelamento/recursos; INT-17 outra tentativa; INT-18 versão aprovada. Shell #5/porta 4310 citados pelas entradas não iniciam execução nesta fase.

## 2. Database Schema

### 2.1 Tabelas

**Regras comuns.** SQLite `factory.sqlite` resolvido pela instalação; `foreign_keys=ON`, WAL, `synchronous=FULL`, tabelas STRICT. Inteiros temporais representam milissegundos UTC; booleanos relacionais são INTEGER 0/1. Identificadores e referências têm escopo de instalação/conta/projeto/tentativa/papel/versão conforme vínculo. `NULL` significa desconhecido/ausente, não confirmação. JSON contém somente configuração/resultados/evidências pertinentes, versionados, validados e limitados. Não guardar cópia de checkout, índice, ignorados ou caches, mesmo comprimida. SQL pertence exclusivamente a storage.

O dicionário da base existente foi conferido contra as migrations atuais e o tratamento especial do inicializador para perfis. Não representa inspeção de banco operacional. Campos persistidos e documentos privados legados preservam seu formato, inclusive chaves históricas camelCase; a borda HTTP e todo JSON novo usam snake_case com conversores explícitos. Não reescrever capturas para uniformizar grafia. Schemas abaixo são contratos de dados, não migrations executadas.

`Não` em Nullable inclui chave primária; `—` em Default significa valor obrigatório fornecido pela aplicação quando não anulável. Constraints e índices SQL reproduzidos como expressões identificam invariantes existentes; não constituem código de implementação novo.

#### `accounts`

Identidade GitHub observada/configurada. Consulta: GET /settings; GET /operation; consumidor: Configuração / DashboardPanel.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| github_account_id | TEXT | Não | — | `PRIMARY KEY` |
| login | TEXT | Não | — | `NOT NULL CHECK(length(login) > 0)` |
| observed_at_ms | INTEGER | Não | — | `NOT NULL CHECK(observed_at_ms >= 0)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= created_at_ms)` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision >= 1)` |

Foreign keys: nenhuma declarada na base; guardas adicionais podem validar escopo.

Índices: `sqlite_autoindex_accounts_1` (github_account_id) UNIQUE.

#### `attempt_authority`

Observação de autoridade da tentativa. Consulta: GET /attempts/:id; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| attempt_id | TEXT | Não | — | `PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT` |
| reason | TEXT | Sim | — | — |
| expected_status_id | TEXT | Sim | — | — |
| observed_status_id | TEXT | Sim | — | — |
| observed_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_attempt_authority_1` (attempt_id) UNIQUE.

#### `attempt_criteria`

Critérios capturados da tentativa. Consulta: GET /attempts/:id?section=criteria; consumidor: CriteriaSummary.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| criterion_id | TEXT | Não | — | `NOT NULL` |
| occurrence_index | INTEGER | Não | — | `NOT NULL CHECK(occurrence_index >= 1)` |
| text | TEXT | Não | — | `NOT NULL` |

Constraints de tabela: `PRIMARY KEY(attempt_id,criterion_id)`; `UNIQUE(attempt_id,occurrence_index)`.

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_attempt_criteria_2` (attempt_id, occurrence_index) UNIQUE; `sqlite_autoindex_attempt_criteria_1` (attempt_id, criterion_id) UNIQUE.

#### `attempts`

Tentativa, captura e cabeçalho histórico. Consulta: GET /attempts; GET /attempts/:id; consumidor: AttemptListPanel / AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| operation_id | TEXT | Não | — | `NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| project_id | TEXT | Não | — | `NOT NULL REFERENCES projects(id) ON DELETE RESTRICT` |
| project_revision_id | TEXT | Não | — | `NOT NULL` |
| preparation_id | TEXT | Não | — | `NOT NULL` |
| preparation_revision | INTEGER | Não | — | `NOT NULL` |
| account_id | TEXT | Não | — | `NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| repository_id | TEXT | Não | — | `NOT NULL` |
| issue_id | TEXT | Não | — | `NOT NULL` |
| issue_number | INTEGER | Sim | — | Cabeçalho capturado e imutável; positivo quando disponível |
| issue_title | TEXT | Sim | — | Cabeçalho capturado e imutável; até 65536 caracteres quando disponível |
| capture_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(capture_json) AND json_extract(capture_json,'$.formatVersion') = 1)` |
| phase | TEXT | Não | — | `NOT NULL CHECK(phase IN ('preparing','implementing','verifying','reviewing','publishing','finished'))` |
| result | TEXT | Sim | — | `CHECK(result IS NULL OR result IN ('delivered','rejected','failed','cancelled','interrupted'))` |
| suspension | TEXT | Sim | — | — |
| diagnostic | TEXT | Sim | — | — |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision >= 1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL` |
| source | TEXT | Sim | — | `CHECK(source IN ('manual','automatic','retry'))` |

Constraints de tabela: `CHECK((phase = 'finished') = (result IS NOT NULL))`; `UNIQUE(id, project_id)`; `FOREIGN KEY(project_revision_id,project_id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT`; `FOREIGN KEY(preparation_id,preparation_revision) REFERENCES preparation_revisions(preparation_id,revision) ON DELETE RESTRICT`.

Foreign keys: (preparation_id, preparation_revision) → preparation_revisions(preparation_id, revision); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_revision_id, project_id) → project_revisions(id, project_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX attempts_active_reviewer_profile ON attempts(json_extract(capture_json, '$.configuration.reviewerProfile.id')) WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1`; `CREATE INDEX attempts_active_implementer_profile ON attempts(json_extract(capture_json, '$.configuration.implementerProfile.id')) WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1`; `CREATE INDEX attempts_recent_results ON attempts(account_id,updated_at_ms DESC,id DESC) WHERE result IS NOT NULL`; `CREATE INDEX attempts_issue_history ON attempts(account_id,repository_id,issue_id,created_at_ms DESC,id DESC)`; `CREATE UNIQUE INDEX attempts_active_automatic_account ON attempts(account_id) WHERE source='automatic' AND result IS NULL`; `CREATE INDEX attempts_account_created ON attempts(account_id,created_at_ms,id)`; `CREATE INDEX attempts_project_created ON attempts(project_id,created_at_ms,id)`; `CREATE INDEX attempts_account_issue_number_created ON attempts(account_id,issue_number,created_at_ms DESC,id DESC)`; `CREATE UNIQUE INDEX attempts_active_issue ON attempts(account_id,repository_id,issue_id) WHERE result IS NULL`; `sqlite_autoindex_attempts_3` (id, project_id) UNIQUE; `sqlite_autoindex_attempts_2` (operation_id) UNIQUE; `sqlite_autoindex_attempts_1` (id) UNIQUE.

Complemento da busca histórica (US-21): `attempts_account_issue_number_created` restringe o número no escopo da conta e mantém a ordem por início/ID. A busca por título compara o cabeçalho em lotes ordenados, sem ler captura completa, checkout ou cache; curingas são caracteres literais.

#### `cancellation_requests`

Pedido explícito de cancelamento. Consulta: POST /attempts/:id/cancel; GET /operations/:operationId; consumidor: AttemptDetailDialog / ShutdownDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX cancellation_attempt ON cancellation_requests(attempt_id)`; `sqlite_autoindex_cancellation_requests_1` (operation_id) UNIQUE.

#### `capture_runs`

Histórico de captura e repetição autorizada. Consulta: GET /deliveries/:id; POST /attempts/:id/deliveries/:deliveryId/capture/retry; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| delivery_id | TEXT | Não | — | `NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT` |
| operation_id | TEXT | Sim | — | `UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('running','captured','failed'))` |
| diagnostic | TEXT | Sim | — | — |
| started_at_ms | INTEGER | Não | — | `NOT NULL` |
| ended_at_ms | INTEGER | Sim | — | — |

Foreign keys: (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (delivery_id) → deliveries(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_capture_runs_2` (operation_id) UNIQUE; `sqlite_autoindex_capture_runs_1` (id) UNIQUE.

#### `capture_warnings`

Limitações de captura pertinentes. Consulta: GET /deliveries/:id; consumidor: DeliverySummary / detalhes.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| delivery_id | TEXT | Não | — | `NOT NULL` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| passage_id | TEXT | Não | — | `NOT NULL` |
| path | TEXT | Não | — | `NOT NULL CHECK(length(path) BETWEEN 1 AND 4096)` |
| reason | TEXT | Não | — | `NOT NULL CHECK(reason IN ('DECLARED_NEW_FILE_IGNORED','KNOWN_SECRET_EXCLUDED'))` |

Constraints de tabela: `PRIMARY KEY(delivery_id,path)`; `FOREIGN KEY(delivery_id,attempt_id,passage_id) REFERENCES deliveries(id,attempt_id,producer_passage_id) ON DELETE RESTRICT`.

Foreign keys: (delivery_id, attempt_id, passage_id) → deliveries(id, attempt_id, producer_passage_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_capture_warnings_1` (delivery_id, path) UNIQUE.

#### `controller_authority`

Conta observada e pausa operacional. Consulta: GET /operation; consumidor: DashboardPanel.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY CHECK(id='local')` |
| configured_account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| observed_account_id | TEXT | Sim | — | — |
| dispatch_paused | INTEGER | Não | — | `NOT NULL CHECK(dispatch_paused IN (0,1))` |
| observed_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (configured_account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_controller_authority_1` (id) UNIQUE.

#### `creation_reconciliations`

Reconciliação idempotente de criação. Consulta: GET /operations/:operationId; GET /scaffold/creations/:creationId; consumidor: PartialCreation.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| creation_id | TEXT | Não | — | `NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','succeeded','unknown'))` |
| diagnostic | TEXT | Sim | — | — |

Foreign keys: (creation_id) → project_creations(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE UNIQUE INDEX creation_reconciliation_active ON creation_reconciliations(creation_id) WHERE state='accepted'`; `sqlite_autoindex_creation_reconciliations_1` (operation_id) UNIQUE.

#### `creation_steps`

Etapas locais da criação. Consulta: GET /scaffold/creations/:creationId; consumidor: ProjectCreationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| creation_id | TEXT | Não | — | `NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT` |
| step | TEXT | Não | — | `NOT NULL CHECK(step IN ('directory','files','git','baseline','registration'))` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('running','confirmed','unknown'))` |

Constraints de tabela: `PRIMARY KEY(creation_id,step)`.

Foreign keys: (creation_id) → project_creations(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_creation_steps_1` (creation_id, step) UNIQUE.

#### `criterion_results`

Parecer por critério e passagem. Consulta: GET /attempts/:id?section=criteria; GET /deliveries/:id/review; consumidor: CriteriaSummary.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| passage_id | TEXT | Não | — | `NOT NULL` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| criterion_id | TEXT | Não | — | `NOT NULL` |
| verdict | TEXT | Não | — | `NOT NULL CHECK(verdict IN ('passed','failed','not_verified'))` |
| evidence_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json) >= 1)` |

Constraints de tabela: `PRIMARY KEY(passage_id,criterion_id)`; `FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT`; `FOREIGN KEY(passage_id) REFERENCES passage_results(passage_id) ON DELETE RESTRICT`; `FOREIGN KEY(attempt_id,criterion_id) REFERENCES attempt_criteria(attempt_id,criterion_id) ON DELETE RESTRICT`.

Foreign keys: (attempt_id, criterion_id) → attempt_criteria(attempt_id, criterion_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (passage_id) → passage_results(passage_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (passage_id, attempt_id) → passages(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_criterion_results_1` (passage_id, criterion_id) UNIQUE.

#### `deliveries`

Versão fixa capturada no Git. Consulta: GET /deliveries/:id; consumidor: DeliverySummary.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| round_number | INTEGER | Não | — | `NOT NULL` |
| producer_passage_id | TEXT | Não | — | `NOT NULL UNIQUE` |
| base_sha | TEXT | Não | — | `NOT NULL CHECK(length(base_sha) IN (40,64))` |
| repository_relative | TEXT | Não | — | `NOT NULL` |
| capture_state | TEXT | Não | — | `NOT NULL CHECK(capture_state IN ('pending','running','captured','failed'))` |
| git_ref | TEXT | Sim | — | `UNIQUE` |
| content_identity | TEXT | Sim | — | `CHECK(content_identity IS NULL OR length(content_identity) IN (40,64))` |
| commit_sha | TEXT | Sim | — | `CHECK(commit_sha IS NULL OR length(commit_sha) IN (40,64))` |
| has_delta | INTEGER | Sim | — | `CHECK(has_delta IS NULL OR has_delta IN (0,1))` |
| diagnostic | TEXT | Sim | — | — |
| captured_at_ms | INTEGER | Sim | — | — |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| claim_id | TEXT | Sim | — | — |
| claim_attempt_revision | INTEGER | Sim | — | — |

Constraints de tabela: `CHECK((capture_state='captured') = (git_ref IS NOT NULL AND content_identity IS NOT NULL AND commit_sha IS NOT NULL AND has_delta IS NOT NULL AND captured_at_ms IS NOT NULL))`; `CHECK(repository_relative = 'git/' \|\| attempt_id \|\| '.git')`; `CHECK(git_ref IS NULL OR git_ref = 'refs/factory/deliveries/' \|\| id)`; `UNIQUE(id,attempt_id,producer_passage_id)`; `FOREIGN KEY(producer_passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT`; `FOREIGN KEY(attempt_id,round_number,id) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT`.

Foreign keys: (attempt_id, round_number, id) → rounds(attempt_id, round_number, delivery_version); ON UPDATE NO ACTION, ON DELETE RESTRICT; (producer_passage_id, attempt_id) → passages(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE UNIQUE INDEX deliveries_effect_binding ON deliveries(id,attempt_id)`; `CREATE UNIQUE INDEX delivery_attempt_version ON deliveries(id,attempt_id,content_identity)`; `CREATE INDEX deliveries_attempt_round ON deliveries(attempt_id,round_number)`; `sqlite_autoindex_deliveries_4` (id, attempt_id, producer_passage_id) UNIQUE; `sqlite_autoindex_deliveries_3` (git_ref) UNIQUE; `sqlite_autoindex_deliveries_2` (producer_passage_id) UNIQUE; `sqlite_autoindex_deliveries_1` (id) UNIQUE.

#### `diagnostic_runs`

Diagnósticos do contexto. Consulta: GET /diagnostics; consumidor: InitialSetupDialog / diagnóstico.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| installation_id | TEXT | Não | — | `NOT NULL` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| scope | TEXT | Não | — | `NOT NULL CHECK(scope IN ('host','project','creation','attempt'))` |
| context_id | TEXT | Não | — | `NOT NULL` |
| project_id | TEXT | Sim | — | `REFERENCES projects(id) ON DELETE RESTRICT` |
| creation_id | TEXT | Sim | — | `REFERENCES project_creations(id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Sim | — | `REFERENCES attempts(id) ON DELETE RESTRICT` |
| context_stamp | TEXT | Não | — | `NOT NULL CHECK(length(context_stamp)=64)` |
| checks_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json)='array' AND json_array_length(checks_json) BETWEEN 1 AND 4)` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','succeeded','failed','unknown'))` |
| diagnostics_json | TEXT | Não | '[]' | `NOT NULL DEFAULT '[]' CHECK(json_valid(diagnostics_json) AND json_type(diagnostics_json)='array' AND json_array_length(diagnostics_json)<=104)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms>=0)` |
| completed_at_ms | INTEGER | Sim | — | `CHECK(completed_at_ms IS NULL OR completed_at_ms>=created_at_ms)` |

Constraints de tabela: `checks_json TEXT NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json)='array' AND json_array_length(checks_json) BETWEEN 1 AND 4)`; `CHECK((state='accepted')=(completed_at_ms IS NULL))`; `CHECK((scope='host' AND context_id='local' AND project_id IS NULL AND creation_id IS NULL AND attempt_id IS NULL) OR (scope='project' AND context_id=project_id AND creation_id IS NULL AND attempt_id IS NULL) OR (scope='creation' AND context_id=creation_id AND attempt_id IS NULL) OR (scope='attempt' AND context_id=attempt_id AND project_id IS NOT NULL AND creation_id IS NULL))`.

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (creation_id) → project_creations(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX diagnostic_runs_host_maestri ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC) WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"maestri_context"')>0`; `CREATE INDEX diagnostic_runs_host_identity ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC) WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"github_identity"')>0`; `CREATE INDEX diagnostic_runs_project ON diagnostic_runs(project_id,created_at_ms DESC)`; `CREATE INDEX diagnostic_runs_context ON diagnostic_runs(installation_id,account_id,scope,context_id,created_at_ms DESC,operation_id DESC)`; `sqlite_autoindex_diagnostic_runs_1` (operation_id) UNIQUE.

#### `effects`

Intenções e recibos Git/GitHub. Consulta: GET /deliveries/:id; GET /scaffold/creations/:creationId; consumidor: DeliverySummary / ProjectCreationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| creation_id | TEXT | Sim | — | `REFERENCES project_creations(id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Sim | — | `REFERENCES attempts(id) ON DELETE RESTRICT` |
| delivery_id | TEXT | Sim | — | — |
| kind | TEXT | Não | — | `NOT NULL CHECK(kind IN ('issue_comment','project_status','local_commit','push','pull_request','create_repository','associate_origin','baseline_push'))` |
| scope_key | TEXT | Não | — | `NOT NULL` |
| authorization_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(authorization_json))` |
| expected_identity_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(expected_identity_json))` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('not_requested','not_started','running','confirmed','failed_known','unknown','not_applicable'))` |
| receipt_json | TEXT | Sim | — | `CHECK(receipt_json IS NULL OR json_valid(receipt_json))` |
| reason | TEXT | Sim | — | — |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| sent_at_ms | INTEGER | Sim | — | — |
| confirmed_at_ms | INTEGER | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Constraints de tabela: `CHECK((creation_id IS NULL) <> (attempt_id IS NULL))`; `CHECK(delivery_id IS NULL OR attempt_id IS NOT NULL)`; `CHECK((creation_id IS NOT NULL AND delivery_id IS NULL AND kind IN ('create_repository','associate_origin','baseline_push')) OR (attempt_id IS NOT NULL AND kind IN ('issue_comment','project_status','local_commit','push','pull_request')))`; `CHECK(kind NOT IN ('local_commit','push','pull_request') OR delivery_id IS NOT NULL)`; `CHECK((state='confirmed') = (receipt_json IS NOT NULL))`; `CHECK(state<>'confirmed' OR confirmed_at_ms IS NOT NULL)`; `FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (delivery_id, attempt_id) → deliveries(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (creation_id) → project_creations(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX effects_delivery ON effects(delivery_id,created_at_ms,operation_id)`; `CREATE INDEX effects_creation_state ON effects(creation_id,state,created_at_ms,operation_id)`; `CREATE INDEX effects_attempt_state ON effects(attempt_id,state,created_at_ms,operation_id)`; `CREATE UNIQUE INDEX effects_creation_scope ON effects(creation_id,kind,scope_key) WHERE creation_id IS NOT NULL`; `CREATE UNIQUE INDEX effects_attempt_scope ON effects(attempt_id,kind,scope_key) WHERE attempt_id IS NOT NULL`; `sqlite_autoindex_effects_1` (operation_id) UNIQUE.

#### `events`

Eventos operacionais leves. Consulta: GET /events; GET /events/stream; consumidor: RecordsPanel / useControllerEvents.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| seq | INTEGER | Não | — | `PRIMARY KEY AUTOINCREMENT` |
| entity_type | TEXT | Não | — | `NOT NULL` |
| entity_id | TEXT | Não | — | `NOT NULL` |
| operation_id | TEXT | Não | — | `NOT NULL REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| event_type | TEXT | Não | — | `NOT NULL` |
| entity_revision | INTEGER | Não | — | `NOT NULL CHECK(entity_revision >= 1)` |
| facts_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(facts_json) AND facts_json = '{}')` |
| occurred_at_ms | INTEGER | Não | — | `NOT NULL CHECK(occurred_at_ms >= 0)` |
| project_id | TEXT | Sim | — | `REFERENCES projects(id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Sim | — | `REFERENCES attempts(id) ON DELETE RESTRICT` |
| context_round | INTEGER | Sim | — | `CHECK (context_round IS NULL OR context_round BETWEEN 1 AND 6)` |
| context_role | TEXT | Sim | — | `CHECK (context_role IS NULL OR context_role IN ('implementer','reviewer'))` |

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX events_attempt_seq ON events(attempt_id,seq)`; `CREATE INDEX events_project_seq ON events(project_id, seq)`; `CREATE UNIQUE INDEX events_operation_revision ON events(operation_id, entity_revision)`; `CREATE INDEX events_entity_seq ON events(entity_type, entity_id, seq)`.

#### `execution_profiles`

Perfis editáveis e lifecycle. Consulta: GET /settings; GET /projects/:id/configuration; consumidor: ProfilesPanel / ProfileForm.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| name | TEXT | Não | — | `NOT NULL CHECK(length(trim(name))>0)` |
| profile_type | TEXT | Não | — | `NOT NULL CHECK(profile_type IN ('implementer','reviewer'))` |
| name_key | TEXT | Não | — | `NOT NULL CHECK(length(trim(name_key))>0)` |
| executor | TEXT | Não | — | `NOT NULL CHECK(executor='maestri-omp')` |
| provider | TEXT | Não | — | `NOT NULL CHECK(length(trim(provider))>0)` |
| model | TEXT | Não | — | `NOT NULL CHECK(length(trim(model))>0)` |
| effort | TEXT | Sim | — | `CHECK(effort IS NULL OR length(trim(effort))>0)` |
| guidance | TEXT | Não | — | `NOT NULL` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms>=0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms>=created_at_ms)` |
| deleted_at_ms | INTEGER | Sim | — | `CHECK(deleted_at_ms IS NULL OR deleted_at_ms>=created_at_ms)` |

Foreign keys: nenhuma declarada na base; guardas adicionais podem validar escopo.

Índices: `CREATE UNIQUE INDEX execution_profiles_live_name ON execution_profiles(name_key) WHERE deleted_at_ms IS NULL`; `sqlite_autoindex_execution_profiles_1` (id) UNIQUE.

#### `execution_questions`

Perguntas e respostas da passagem. Consulta: GET /attempts/:id/questions/:questionId; consumidor: QuestionDecisionCard.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| passage_id | TEXT | Não | — | `NOT NULL` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| question_hash | TEXT | Não | — | `NOT NULL CHECK(length(question_hash)=64)` |
| question_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(question_json))` |
| answer_operation_id | TEXT | Sim | — | `UNIQUE` |
| answer | TEXT | Sim | — | — |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('pending','recorded','sending','delivered','delivery_unknown','expired','cancelled'))` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| answer_hash | TEXT | Sim | — | `CHECK(answer_hash IS NULL OR length(answer_hash)=64)` |
| answered_at_ms | INTEGER | Sim | — | — |
| ttl_ms | INTEGER | Sim | — | `CHECK(ttl_ms IS NULL OR ttl_ms>=0)` |
| expired_at_ms | INTEGER | Sim | — | — |
| receipt_json | TEXT | Sim | — | `CHECK(receipt_json IS NULL OR json_valid(receipt_json))` |
| scope_json | TEXT | Sim | — | `CHECK(scope_json IS NULL OR json_valid(scope_json))` |

Constraints de tabela: `FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT`; `UNIQUE(passage_id,question_hash)`.

Foreign keys: (passage_id, attempt_id) → passages(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX questions_attempt_created ON execution_questions(attempt_id,created_at_ms,id)`; `CREATE INDEX questions_attempt ON execution_questions(attempt_id,created_at_ms,id)`; `CREATE UNIQUE INDEX execution_question_pending ON execution_questions(passage_id) WHERE state IN ('pending','recorded','sending','delivery_unknown','expired')`; `sqlite_autoindex_execution_questions_3` (passage_id, question_hash) UNIQUE; `sqlite_autoindex_execution_questions_2` (answer_operation_id) UNIQUE; `sqlite_autoindex_execution_questions_1` (id) UNIQUE.

#### `factory_settings`

Configuração local da instalação. Consulta: GET /settings; consumidor: ConfigurationPanel / InitialSetupDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY CHECK(id = 'local')` |
| installation_id | TEXT | Não | — | `NOT NULL UNIQUE CHECK(length(installation_id) > 0)` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| designated_host | TEXT | Sim | — | `CHECK(designated_host IS NULL OR length(designated_host) > 0)` |
| projects_root | TEXT | Sim | — | `CHECK(projects_root IS NULL OR length(projects_root) > 0)` |
| automation_enabled | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1))` |
| time_defaults_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(time_defaults_json))` |
| artifact_policy_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(artifact_policy_json))` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= created_at_ms)` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision >= 1)` |
| onboarding_suppressed | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(onboarding_suppressed IN (0,1))` |
| onboarding_completed_at_ms | INTEGER | Sim | — | `CHECK(onboarding_completed_at_ms IS NULL OR onboarding_completed_at_ms >= 0)` |
| projects_root_confirmed_at_ms | INTEGER | Sim | — | `CHECK(projects_root_confirmed_at_ms IS NULL OR (projects_root IS NOT NULL AND projects_root_confirmed_at_ms >= 0))` |
| gh_executable_path | TEXT | Sim | — | `CHECK(gh_executable_path IS NULL OR length(trim(gh_executable_path)) > 0)` |

Constraints de tabela: `CHECK(automation_enabled = 0 OR (account_id IS NOT NULL AND designated_host IS NOT NULL))`.

Foreign keys: (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_factory_settings_2` (installation_id) UNIQUE; `sqlite_autoindex_factory_settings_1` (id) UNIQUE.

#### `finding_resolutions`

Resolução histórica por revisão. Consulta: GET /deliveries/:id/review; GET /attempts/:id?section=findings; consumidor: FindingDetail.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| finding_id | TEXT | Não | — | `NOT NULL` |
| review_id | TEXT | Não | — | `NOT NULL` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| verdict | TEXT | Não | — | `NOT NULL CHECK(verdict IN ('resolved','unresolved'))` |
| evidence_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0)` |

Constraints de tabela: `PRIMARY KEY(finding_id,review_id)`; `FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT`; `FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (review_id, attempt_id) → reviews(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (finding_id, attempt_id) → findings(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_finding_resolutions_1` (finding_id, review_id) UNIQUE.

#### `findings`

Achados estáveis e critérios vinculados. Consulta: GET /deliveries/:id/review; GET /attempts/:id?section=findings; consumidor: FindingDetail.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| review_id | TEXT | Não | — | `NOT NULL` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| finding_key | TEXT | Não | — | `NOT NULL` |
| criterion_ids_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(criterion_ids_json) AND json_type(criterion_ids_json)='array')` |
| category | TEXT | Não | — | `NOT NULL CHECK(length(trim(category))>0)` |
| problem | TEXT | Não | — | `NOT NULL CHECK(length(trim(problem))>0)` |
| evidence_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0)` |
| expected_result | TEXT | Não | — | `NOT NULL CHECK(length(trim(expected_result))>0)` |
| blocking | INTEGER | Não | — | `NOT NULL CHECK(blocking IN (0,1))` |

Constraints de tabela: `UNIQUE(review_id,finding_key)`; `UNIQUE(id,attempt_id)`; `FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (review_id, attempt_id) → reviews(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX findings_attempt ON findings(attempt_id,review_id)`; `sqlite_autoindex_findings_3` (id, attempt_id) UNIQUE; `sqlite_autoindex_findings_2` (review_id, finding_key) UNIQUE; `sqlite_autoindex_findings_1` (id) UNIQUE.

#### `native_open_requests`

Abertura nativa idempotente. Consulta: POST /attempts/:id/resources/:resourceId/folder/open; POST /attempts/:id/passages/:passageId/interaction/open; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| resource_id | TEXT | Não | — | `NOT NULL REFERENCES resources(id) ON DELETE RESTRICT` |
| kind | TEXT | Não | — | `NOT NULL CHECK(kind IN ('folder.open','interaction.open'))` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','requested','unknown'))` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (resource_id) → resources(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_native_open_requests_1` (operation_id) UNIQUE.

#### `operation_requests`

Identidade idempotente e recibos de comandos. Consulta: GET /operations/:operationId; consumidor: useOperation em diálogos.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY` |
| installation_id | TEXT | Não | — | `NOT NULL` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| operation_kind | TEXT | Não | — | `NOT NULL` |
| resource_type | TEXT | Não | — | `NOT NULL` |
| resource_id | TEXT | Não | — | `NOT NULL` |
| request_hash | TEXT | Não | — | `NOT NULL CHECK(length(request_hash) = 64)` |
| expected_revision_json | TEXT | Sim | — | `CHECK(expected_revision_json IS NULL OR json_valid(expected_revision_json))` |
| receipt_json | TEXT | Sim | — | `CHECK(receipt_json IS NULL OR json_valid(receipt_json))` |
| result_account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT CHECK( (operation_kind = 'settings.account.bind' AND resource_type = 'settings' AND resource_id = 'local' AND account_id IS NULL AND result_account_id IS NOT NULL) OR (operation_kind = 'settings.account.switch' AND resource_type = 'settings' AND resource_id = 'local' AND account_id IS NOT NULL AND result_account_id IS NOT NULL AND account_id <> result_account_id) OR (operation_kind NOT IN ('settings.account.bind','settings.account.switch') AND result_account_id IS NULL) )` |

Foreign keys: (result_account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX operation_requests_scope ON operation_requests(installation_id, account_id, resource_type, resource_id)`; `sqlite_autoindex_operation_requests_1` (operation_id) UNIQUE.

#### `passage_events`

Eventos técnicos da passagem. Consulta: GET /attempts/:id?section=passages; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| seq | INTEGER | Não | — | `PRIMARY KEY AUTOINCREMENT` |
| passage_id | TEXT | Não | — | `NOT NULL REFERENCES passages(id) ON DELETE RESTRICT` |
| event_type | TEXT | Não | — | `NOT NULL` |
| code | TEXT | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (passage_id) → passages(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX passage_events_page ON passage_events(passage_id,seq)`.

#### `passage_measurements`

Medição observada de atividade/espera. Consulta: GET /attempts/:id/measurements; consumidor: AttemptStageSummary.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| passage_id | TEXT | Não | — | `PRIMARY KEY REFERENCES passages(id) ON DELETE RESTRICT` |
| active_ms | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(active_ms>=0)` |
| wait_ms | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(wait_ms>=0)` |
| checkpoint_ms | INTEGER | Não | — | `NOT NULL` |
| mode | TEXT | Não | — | `NOT NULL CHECK(mode IN ('active','human','stopped'))` |
| expired_at_ms | INTEGER | Sim | — | — |
| observed | INTEGER | Não | — | `NOT NULL CHECK(observed IN (0,1))` |

Constraints de tabela: `checkpoint_ms INTEGER NOT NULL`.

Foreign keys: (passage_id) → passages(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_passage_measurements_1` (passage_id) UNIQUE.

#### `passage_results`

Resultados estruturados e recibos. Consulta: GET /deliveries/:id/producer-result; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| passage_id | TEXT | Não | — | `PRIMARY KEY` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| result_hash | TEXT | Não | — | `NOT NULL CHECK(length(result_hash) = 64)` |
| receipt_id | TEXT | Não | — | `NOT NULL UNIQUE` |
| summary_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(summary_json))` |
| accepted_at_ms | INTEGER | Não | — | `NOT NULL` |

Constraints de tabela: `FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (passage_id, attempt_id) → passages(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_passage_results_2` (receipt_id) UNIQUE; `sqlite_autoindex_passage_results_1` (passage_id) UNIQUE.

#### `passages`

Trabalho de um papel por rodada/versão. Consulta: GET /attempts/:id?section=passages; consumidor: AttemptDetailDialog / HistoricalProfile.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| round_number | INTEGER | Não | — | `NOT NULL` |
| delivery_version | TEXT | Não | — | `NOT NULL` |
| role | TEXT | Não | — | `NOT NULL CHECK(role IN ('implementer','reviewer'))` |
| role_resource_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(role_resource_json))` |
| request_hash | TEXT | Sim | — | `CHECK(request_hash IS NULL OR length(request_hash) = 64)` |
| terminal_name | TEXT | Não | — | `NOT NULL UNIQUE` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('starting','ready','partial','interrupted','cancelled'))` |
| tracking_state | TEXT | Não | — | `NOT NULL CHECK(tracking_state IN ('pending','tracked','lost'))` |
| diagnostic | TEXT | Sim | — | — |
| effective_profile_json | TEXT | Sim | — | `CHECK(effective_profile_json IS NULL OR json_valid(effective_profile_json))` |
| executor_version | TEXT | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |
| session_source_id | TEXT | Sim | — | `REFERENCES passages(id) ON DELETE RESTRICT` |

Constraints de tabela: `UNIQUE(id,attempt_id)`; `UNIQUE(attempt_id,round_number,role)`; `FOREIGN KEY(attempt_id,round_number,delivery_version) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT`.

Foreign keys: (attempt_id, round_number, delivery_version) → rounds(attempt_id, round_number, delivery_version); ON UPDATE NO ACTION, ON DELETE RESTRICT; (session_source_id) → passages(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE UNIQUE INDEX passages_review_binding ON passages(id,attempt_id,delivery_version)`; `sqlite_autoindex_passages_4` (attempt_id, round_number, role) UNIQUE; `sqlite_autoindex_passages_3` (id, attempt_id) UNIQUE; `sqlite_autoindex_passages_2` (terminal_name) UNIQUE; `sqlite_autoindex_passages_1` (id) UNIQUE.

#### `preparation_revisions`

Escolhas históricas da preparação. Consulta: GET /preparations/:id; consumidor: PreparationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| preparation_id | TEXT | Não | — | `NOT NULL` |
| revision | INTEGER | Não | — | `NOT NULL CHECK(revision >= 1)` |
| project_id | TEXT | Não | — | `NOT NULL` |
| project_revision_id | TEXT | Não | — | `NOT NULL` |
| choices_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(choices_json) AND json_type(choices_json) = 'object' AND coalesce(json_extract(choices_json, '$.formatVersion') = 1 AND json_type(choices_json, '$.choices') = 'object', 0))` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |

Constraints de tabela: `PRIMARY KEY(preparation_id, revision)`; `FOREIGN KEY(preparation_id, project_id) REFERENCES preparations(id, project_id) ON DELETE RESTRICT`; `FOREIGN KEY(project_revision_id, project_id) REFERENCES project_revisions(id, project_id) ON DELETE RESTRICT`.

Foreign keys: (project_revision_id, project_id) → project_revisions(id, project_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (preparation_id, project_id) → preparations(id, project_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_preparation_revisions_1` (preparation_id, revision) UNIQUE.

**Complemento E2-a.** `choices_json` conserva o envelope privado `formatVersion=1` e recebe `choices.publication_target` como intenção versionada descrita na seção 3.2. Criar nova revisão ao alterar/limpar a escolha; não reescrever revisões antigas nem executar clone na gravação/leitura. A tentativa copia a intenção/hash e sua origem autorizadora em `capture_json.v3_delivery`, mantendo o envelope histórico e a imutabilidade da captura. Não criar tabela de conteúdo, clone ou operação com identidades futuras para guardar essa escolha.

#### `preparations`

Preparação editável sem execução. Consulta: GET /preparations/:id; consumidor: PreparationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| project_id | TEXT | Não | — | `NOT NULL REFERENCES projects(id) ON DELETE RESTRICT` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| revision | INTEGER | Não | — | `NOT NULL CHECK(revision >= 1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= created_at_ms)` |

Constraints de tabela: `UNIQUE(id, project_id)`; `FOREIGN KEY(id, revision) REFERENCES preparation_revisions(preparation_id, revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.

Foreign keys: (id, revision) → preparation_revisions(preparation_id, revision); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX preparations_project ON preparations(project_id, updated_at_ms, id)`; `sqlite_autoindex_preparations_2` (id, project_id) UNIQUE; `sqlite_autoindex_preparations_1` (id) UNIQUE.

#### `project_creations`

Criação parcial e plano autorizado. Consulta: GET /scaffold/creations/:creationId; consumidor: ProjectCreationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| operation_id | TEXT | Não | — | `NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| installation_id | TEXT | Não | — | `NOT NULL` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| project_id | TEXT | Sim | — | `REFERENCES projects(id) ON DELETE RESTRICT` |
| plan_hash | TEXT | Não | — | `NOT NULL CHECK(length(plan_hash)=64)` |
| plan_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(plan_json))` |
| destination | TEXT | Não | — | `NOT NULL COLLATE NOCASE UNIQUE` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('pending','running','completed','partial','failed'))` |
| baseline_sha | TEXT | Sim | — | — |
| baseline_ref | TEXT | Sim | — | — |
| diagnostic | TEXT | Sim | — | — |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms>=0)` |

Constraints de tabela: `CHECK((baseline_sha IS NULL)=(baseline_ref IS NULL))`; `CHECK(state<>'completed' OR (project_id IS NOT NULL AND baseline_sha IS NOT NULL AND diagnostic IS NULL))`.

Foreign keys: (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX project_creations_scope ON project_creations(installation_id,account_id,created_at_ms,id)`; `sqlite_autoindex_project_creations_3` (destination) UNIQUE; `sqlite_autoindex_project_creations_2` (operation_id) UNIQUE; `sqlite_autoindex_project_creations_1` (id) UNIQUE.

#### `project_deletion_receipts`

Recibo terminal de exclusão. Consulta: GET /project-deletions/:operation_id; GET /operations/:operationId; consumidor: ProjectDeletionDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `NOT NULL PRIMARY KEY` |
| request_fingerprint | TEXT | Não | — | `NOT NULL CHECK(length(request_fingerprint) = 64)` |
| result | TEXT | Não | — | `NOT NULL CHECK(result = 'succeeded')` |

Foreign keys: nenhuma declarada na base; guardas adicionais podem validar escopo.

Índices: `sqlite_autoindex_project_deletion_receipts_1` (operation_id) UNIQUE.

#### `project_deletion_targets`

Destinos e inventário autorizado. Consulta: GET /projects/:id/deletion-preview; GET /project-deletions/:operation_id; consumidor: ProjectDeletionDialog / RecordsPanel.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `NOT NULL REFERENCES project_deletions(operation_id) ON DELETE RESTRICT` |
| target_key | TEXT | Não | — | `NOT NULL` |
| target_kind | TEXT | Não | — | `NOT NULL CHECK(target_kind IN ('original_directory','exclusive_workspace','exclusive_artifact'))` |
| authorized_path | TEXT | Não | — | `NOT NULL` |
| normalized_path | TEXT | Não | — | `NOT NULL` |
| resolved_path | TEXT | Sim | — | — |
| object_kind | TEXT | Não | — | `NOT NULL CHECK(object_kind IN ('directory','file','symlink','junction','absent'))` |
| identity_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(identity_json))` |
| owner_kind | TEXT | Não | — | `NOT NULL CHECK(owner_kind IN ('project','attempt','delivery','creation'))` |
| owner_id | TEXT | Não | — | `NOT NULL` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('pending','removing','removed','blocked'))` |
| verified_at_ms | INTEGER | Sim | — | `CHECK(verified_at_ms IS NULL OR verified_at_ms >= 0)` |
| reason_code | TEXT | Sim | — | — |

Constraints de tabela: `PRIMARY KEY(operation_id,target_key)`; `UNIQUE(operation_id,normalized_path)`; `CHECK(resolved_path IS NOT NULL OR object_kind = 'absent')`.

Foreign keys: (operation_id) → project_deletions(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_project_deletion_targets_2` (operation_id, normalized_path) UNIQUE; `sqlite_autoindex_project_deletion_targets_1` (operation_id, target_key) UNIQUE.

#### `project_deletions`

Exclusão autorizada e geração do worker. Consulta: GET /project-deletions/:operation_id; consumidor: ProjectDeletionDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `NOT NULL PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| project_id | TEXT | Não | — | `NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT` |
| expected_revision | INTEGER | Não | — | `NOT NULL CHECK(expected_revision >= 1)` |
| authorization_digest | TEXT | Não | — | `NOT NULL CHECK(length(authorization_digest) = 64)` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','running','pending','reconfirmation_required','finalizing'))` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision >= 1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= created_at_ms)` |
| reason_code | TEXT | Sim | — | — |
| reason | TEXT | Sim | — | — |
| recovery | TEXT | Sim | — | — |
| worker_token | TEXT | Sim | — | — |
| worker_generation | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(worker_generation >= 0)` |

Constraints de tabela: `CHECK(state NOT IN ('pending','reconfirmation_required') OR (reason IS NOT NULL AND recovery IS NOT NULL))`.

Foreign keys: (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX project_deletions_recovery ON project_deletions(state, updated_at_ms)`; `sqlite_autoindex_project_deletions_2` (project_id) UNIQUE; `sqlite_autoindex_project_deletions_1` (operation_id) UNIQUE.

#### `project_revisions`

Revisões imutáveis de configuração. Consulta: GET /projects/:id/configuration; consumidor: ProjectConfigurationDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| project_id | TEXT | Não | — | `NOT NULL REFERENCES projects(id) ON DELETE RESTRICT` |
| revision_number | INTEGER | Não | — | `NOT NULL CHECK(revision_number >= 1)` |
| source_kind | TEXT | Não | — | `NOT NULL CHECK(source_kind IN ('local', 'github'))` |
| source_location | TEXT | Não | — | `NOT NULL` |
| repository_id | TEXT | Sim | — | — |
| repository_url | TEXT | Sim | — | — |
| base_branch | TEXT | Não | — | `NOT NULL` |
| github_project_id | TEXT | Sim | — | — |
| github_project_owner_id | TEXT | Sim | — | — |
| status_field_id | TEXT | Sim | — | — |
| status_options_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(status_options_json))` |
| implementer_profile_id | TEXT | Sim | — | `REFERENCES execution_profiles(id) ON DELETE RESTRICT` |
| reviewer_profile_id | TEXT | Sim | — | `REFERENCES execution_profiles(id) ON DELETE RESTRICT` |
| correction_limit | INTEGER | Não | 2 | `NOT NULL DEFAULT 2 CHECK(correction_limit BETWEEN 0 AND 5)` |
| default_delivery_mode | TEXT | Não | 'icr' | `NOT NULL DEFAULT 'icr' CHECK(default_delivery_mode IN ('icr', 'commit', 'pr'))` |
| automation_enabled | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1))` |
| queue_order_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(queue_order_json))` |
| guidance | TEXT | Não | — | `NOT NULL` |
| origin_notes_json | TEXT | Não | — | `NOT NULL CHECK(json_valid(origin_notes_json) AND json_type(origin_notes_json) = 'array')` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |

Constraints de tabela: `UNIQUE(project_id, revision_number)`; `UNIQUE(id, project_id)`; `UNIQUE(id, project_id, revision_number)`; `CHECK((repository_id IS NULL) = (repository_url IS NULL))`; `CHECK(coalesce((github_project_id IS NULL AND github_project_owner_id IS NULL AND status_field_id IS NULL AND status_options_json = '{}') OR (github_project_id IS NOT NULL AND github_project_owner_id IS NOT NULL AND status_field_id IS NOT NULL AND json_type(status_options_json, '$.ready') = 'text' AND json_type(status_options_json, '$.inProgress') = 'text' AND json_type(status_options_json, '$.inReview') = 'text' AND json_type(status_options_json, '$.delivered') = 'text'), 0))`.

Foreign keys: (reviewer_profile_id) → execution_profiles(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (implementer_profile_id) → execution_profiles(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX project_revisions_project ON project_revisions(project_id, revision_number)`; `sqlite_autoindex_project_revisions_4` (id, project_id, revision_number) UNIQUE; `sqlite_autoindex_project_revisions_3` (id, project_id) UNIQUE; `sqlite_autoindex_project_revisions_2` (project_id, revision_number) UNIQUE; `sqlite_autoindex_project_revisions_1` (id) UNIQUE.

#### `projects`

Cadastro estável de projeto. Consulta: GET /projects; GET /projects/:id; consumidor: ProjectsPanel.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| account_id | TEXT | Sim | — | `REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| name | TEXT | Não | — | `NOT NULL CHECK(length(trim(name)) > 0)` |
| current_revision_id | TEXT | Não | — | `NOT NULL` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision >= 1)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL CHECK(created_at_ms >= 0)` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= created_at_ms)` |

Constraints de tabela: `FOREIGN KEY(current_revision_id, id, revision) REFERENCES project_revisions(id, project_id, revision_number) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.

Foreign keys: (current_revision_id, id, revision) → project_revisions(id, project_id, revision_number); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX projects_catalog ON projects(account_id, name COLLATE NOCASE, id)`; `sqlite_autoindex_projects_1` (id) UNIQUE.

#### `publication_requests`

Comandos de publicação/reconciliação. Consulta: GET /operations/:operationId; GET /deliveries/:id; consumidor: useDelivery / useOperation.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| delivery_id | TEXT | Sim | — | — |
| kind | TEXT | Não | — | `NOT NULL CHECK(kind IN ('publication.complete','publication.reconcile','publication.authorize-upgrade','attempt.revalidate'))` |
| authorized_mode | TEXT | Sim | — | `CHECK(authorized_mode IS NULL OR authorized_mode IN ('icr','commit','pr'))` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','running','succeeded','failed','unknown'))` |
| diagnostic | TEXT | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Constraints de tabela: `FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (delivery_id, attempt_id) → deliveries(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE UNIQUE INDEX publication_request_upgrade_binding ON publication_requests(operation_id,attempt_id,delivery_id,authorized_mode)`; `CREATE UNIQUE INDEX publication_request_active ON publication_requests(attempt_id) WHERE state IN ('accepted','running')`; `sqlite_autoindex_publication_requests_1` (operation_id) UNIQUE.

#### `publication_upgrades`

Autorização de efeitos adicionais. Consulta: GET /deliveries/:id; POST /attempts/:id/publication/authorize-upgrade; consumidor: DeliveryContinuation.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES publication_requests(operation_id) ON DELETE RESTRICT` |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| delivery_id | TEXT | Não | — | `NOT NULL` |
| current_mode | TEXT | Não | — | `NOT NULL CHECK(current_mode IN ('icr','commit'))` |
| target_mode | TEXT | Não | — | `NOT NULL CHECK(target_mode IN ('commit','pr'))` |
| summary_hash | TEXT | Não | — | `NOT NULL CHECK(length(summary_hash)=64)` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Constraints de tabela: `CHECK((current_mode='icr' AND target_mode IN ('commit','pr')) OR (current_mode='commit' AND target_mode='pr'))`; `UNIQUE(attempt_id,target_mode)`; `FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT`; `FOREIGN KEY(operation_id,attempt_id,delivery_id,target_mode) REFERENCES publication_requests(operation_id,attempt_id,delivery_id,authorized_mode) ON DELETE RESTRICT`.

Foreign keys: (operation_id, attempt_id, delivery_id, target_mode) → publication_requests(operation_id, attempt_id, delivery_id, authorized_mode); ON UPDATE NO ACTION, ON DELETE RESTRICT; (delivery_id, attempt_id) → deliveries(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → publication_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX publication_upgrades_attempt ON publication_upgrades(attempt_id,created_at_ms)`; `sqlite_autoindex_publication_upgrades_2` (attempt_id, target_mode) UNIQUE; `sqlite_autoindex_publication_upgrades_1` (operation_id) UNIQUE.

#### `queue_consumptions`

Consumo histórico da fila sem duplicação. Consulta: GET /queue; GET /attempts/:id; consumidor: QueuePanel / AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| account_id | TEXT | Não | — | `NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| project_id | TEXT | Não | — | `NOT NULL REFERENCES projects(id) ON DELETE RESTRICT` |
| repository_id | TEXT | Não | — | `NOT NULL` |
| issue_id | TEXT | Não | — | `NOT NULL` |
| observed_cycle | INTEGER | Não | — | `NOT NULL CHECK(observed_cycle>=1)` |
| ready_exit_observed_at_ms | INTEGER | Sim | — | `CHECK(ready_exit_observed_at_ms IS NULL OR ready_exit_observed_at_ms>=0)` |
| ready_return_observed_at_ms | INTEGER | Sim | — | `CHECK(ready_return_observed_at_ms IS NULL OR ready_return_observed_at_ms>=0)` |
| consumed_at_ms | INTEGER | Não | — | `NOT NULL CHECK(consumed_at_ms>=0)` |
| attempt_id | TEXT | Não | — | `NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE RESTRICT` |

Constraints de tabela: `UNIQUE(account_id,project_id,issue_id,observed_cycle)`.

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX queue_consumptions_issue ON queue_consumptions(account_id,repository_id,issue_id)`; `sqlite_autoindex_queue_consumptions_3` (account_id, project_id, issue_id, observed_cycle) UNIQUE; `sqlite_autoindex_queue_consumptions_2` (attempt_id) UNIQUE; `sqlite_autoindex_queue_consumptions_1` (id) UNIQUE.

#### `queue_cycles`

Observações e consumo elegível Ready. Consulta: GET /queue; consumidor: QueuePanel.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| account_id | TEXT | Não | — | `NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT` |
| project_id | TEXT | Não | — | `NOT NULL REFERENCES projects(id) ON DELETE RESTRICT` |
| issue_id | TEXT | Não | — | `NOT NULL CHECK(length(issue_id) > 0)` |
| cycle_number | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(cycle_number >= 1)` |
| last_ready | INTEGER | Não | — | `NOT NULL CHECK(last_ready IN (0,1))` |
| consumed_attempt_id | TEXT | Sim | — | `REFERENCES attempts(id) ON DELETE RESTRICT` |
| updated_at_ms | INTEGER | Não | — | `NOT NULL CHECK(updated_at_ms >= 0)` |
| ready_exit_observed_at_ms | INTEGER | Sim | — | `CHECK(ready_exit_observed_at_ms IS NULL OR ready_exit_observed_at_ms>=0)` |
| ready_return_observed_at_ms | INTEGER | Sim | — | `CHECK(ready_return_observed_at_ms IS NULL OR ready_return_observed_at_ms>=0)` |
| last_eligible | INTEGER | Sim | — | `CHECK(last_eligible IS NULL OR last_eligible IN (0,1))` |
| observed_ordinal | INTEGER | Sim | — | `CHECK(observed_ordinal IS NULL OR observed_ordinal>=0)` |

Constraints de tabela: `PRIMARY KEY(account_id, project_id, issue_id)`.

Foreign keys: (consumed_attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (project_id) → projects(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (account_id) → accounts(github_account_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX queue_cycles_summary ON queue_cycles(account_id,last_eligible,last_ready,updated_at_ms DESC,observed_ordinal) WHERE consumed_attempt_id IS NULL`; `CREATE INDEX queue_cycles_consumed ON queue_cycles(consumed_attempt_id) WHERE consumed_attempt_id IS NOT NULL`; `sqlite_autoindex_queue_cycles_1` (account_id, project_id, issue_id) UNIQUE.

#### `resource_removals`

Remoção autorizada de recurso. Consulta: POST /attempts/:id/resources/:resourceId/remove; GET /operations/:operationId; consumidor: Recuperação de recursos.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| operation_id | TEXT | Não | — | `PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT` |
| resource_id | TEXT | Não | — | `NOT NULL REFERENCES resources(id) ON DELETE RESTRICT` |
| plan_hash | TEXT | Não | — | `NOT NULL CHECK(length(plan_hash)=64)` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('accepted','removed','failed','unknown'))` |
| diagnostic | TEXT | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Foreign keys: (resource_id) → resources(id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (operation_id) → operation_requests(operation_id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE UNIQUE INDEX removal_active ON resource_removals(resource_id) WHERE state IN ('accepted','unknown')`; `sqlite_autoindex_resource_removals_1` (operation_id) UNIQUE.

#### `resources`

Recursos próprios e parada observada. Consulta: GET /attempts/:id/resources; consumidor: AttemptDetailDialog / recuperação.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| passage_id | TEXT | Não | — | `NOT NULL` |
| kind | TEXT | Não | — | `NOT NULL CHECK(kind IN ('implementation','terminal'))` |
| reference | TEXT | Não | — | `NOT NULL` |
| owned | INTEGER | Não | — | `NOT NULL CHECK(owned IN (0,1))` |
| launch_state | TEXT | Não | — | `NOT NULL CHECK(launch_state IN ('planned','starting','ready','partial','failed'))` |
| stop_state | TEXT | Não | 'not_requested' | `NOT NULL DEFAULT 'not_requested' CHECK(stop_state IN ('not_requested','requested','confirmed','uncertain'))` |
| diagnostic | TEXT | Sim | — | — |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |
| revision | INTEGER | Não | 1 | `NOT NULL DEFAULT 1 CHECK(revision>=1)` |
| removed | INTEGER | Não | 0 | `NOT NULL DEFAULT 0 CHECK(removed IN (0,1))` |

Constraints de tabela: `UNIQUE(attempt_id,kind,reference)`; `FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT`.

Foreign keys: (passage_id, attempt_id) → passages(id, attempt_id); ON UPDATE NO ACTION, ON DELETE RESTRICT; (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_resources_2` (attempt_id, kind, reference) UNIQUE; `sqlite_autoindex_resources_1` (id) UNIQUE.

#### `reviews`

Parecer independente por versão. Consulta: GET /deliveries/:id/review; consumidor: CriteriaSummary / FindingDetail.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| id | TEXT | Não | — | `PRIMARY KEY` |
| delivery_id | TEXT | Não | — | `NOT NULL UNIQUE` |
| attempt_id | TEXT | Não | — | `NOT NULL` |
| passage_id | TEXT | Não | — | `NOT NULL UNIQUE` |
| content_identity | TEXT | Não | — | `NOT NULL` |
| state | TEXT | Não | — | `NOT NULL CHECK(state IN ('pending','approved','rejected'))` |
| reason | TEXT | Sim | — | — |
| independence_state | TEXT | Não | — | `NOT NULL CHECK(independence_state IN ('pending','valid','invalid'))` |
| diagnostic | TEXT | Sim | — | — |
| workspace_state | TEXT | Não | — | `NOT NULL CHECK(workspace_state IN ('planned','ready','partial'))` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |
| completed_at_ms | INTEGER | Sim | — | — |

Constraints de tabela: `UNIQUE(id,attempt_id)`; `FOREIGN KEY(passage_id,attempt_id,delivery_id) REFERENCES passages(id,attempt_id,delivery_version) ON DELETE RESTRICT`.

Foreign keys: (passage_id, attempt_id, delivery_id) → passages(id, attempt_id, delivery_version); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `CREATE INDEX reviews_attempt ON reviews(attempt_id,created_at_ms,id)`; `sqlite_autoindex_reviews_4` (id, attempt_id) UNIQUE; `sqlite_autoindex_reviews_3` (passage_id) UNIQUE; `sqlite_autoindex_reviews_2` (delivery_id) UNIQUE; `sqlite_autoindex_reviews_1` (id) UNIQUE.

#### `rounds`

Rodadas e identidades de versão. Consulta: GET /attempts/:id/rounds; consumidor: AttemptDetailDialog.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| attempt_id | TEXT | Não | — | `NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT` |
| round_number | INTEGER | Não | — | `NOT NULL CHECK(round_number BETWEEN 1 AND 6)` |
| delivery_version | TEXT | Não | — | `NOT NULL UNIQUE` |
| created_at_ms | INTEGER | Não | — | `NOT NULL` |

Constraints de tabela: `PRIMARY KEY(attempt_id,round_number)`; `UNIQUE(attempt_id,round_number,delivery_version)`.

Foreign keys: (attempt_id) → attempts(id); ON UPDATE NO ACTION, ON DELETE RESTRICT.

Índices: `sqlite_autoindex_rounds_3` (attempt_id, round_number, delivery_version) UNIQUE; `sqlite_autoindex_rounds_2` (attempt_id, round_number) UNIQUE; `sqlite_autoindex_rounds_1` (delivery_version) UNIQUE.

#### `schema_migrations`

Versão/checksum técnico de schema. Consulta: GET /health (consulta indireta checkHealth); consumidor: AppShell / disponibilidade do controlador.

| Campo | Tipo | Nullable | Default | Constraints da coluna |
| --- | --- | --- | --- | --- |
| version | INTEGER | Não | — | `PRIMARY KEY CHECK(version>=1)` |
| name | TEXT | Não | — | `NOT NULL UNIQUE` |
| checksum | TEXT | Não | — | `NOT NULL CHECK(length(checksum)=64)` |
| applied_at_ms | INTEGER | Não | — | `NOT NULL CHECK(applied_at_ms>=0)` |

Constraints de tabela: `checksum TEXT NOT NULL CHECK(length(checksum)=64)`.

Foreign keys: nenhuma declarada na base; guardas adicionais podem validar escopo.

Índices: `sqlite_autoindex_schema_migrations_1` (name) UNIQUE.

**Alterações aditivas V3 nas tabelas existentes.**

| Tabela/campo | Tipo / Nullable / Default | Constraint, uso e compatibilidade |
| --- | --- | --- |
| `factory_settings.tool_preferences_json` | TEXT / Não / objeto v1 com caminhos NULL | Preferências de executáveis git/maestri/omp/powershell, sem credenciais ou capacidade de host. Cada entrada contém preferred_path e last_validated_at_ms anuláveis; gh continua em gh_executable_path. São escolhas revalidáveis, não restauração de data_root/maestri_settings_json removidos pela migration 020. |
| `attempts.issue_number` | INTEGER / Sim / NULL | Positivo quando conhecido; novas tentativas usam a captura validada. Abertura preserva o valor existente sem backfill. Busca usa número histórico. |
| `attempts.issue_title` | TEXT / Sim / NULL | Título histórico da captura; máximo 65536 caracteres no DTO existente. Pesquisa de entrada limitada a 256. Não buscar título remoto atual. |
| `execution_profiles.composition_version` | INTEGER / Sim / NULL | Positivo quando presente; versão da composição determinística de `guidance`. Perfis atuais com NULL permanecem inalterados na abertura; novos perfis gravam versão 1. |
| `passages.attempt_session_id` | TEXT / Sim / NULL | FK `attempt_sessions.id`; mesma tentativa e papel; legado mantém NULL e vínculos originais. |
| `findings.priority` | TEXT / Sim / NULL | `critical`, `high`, `medium`, `low`; prioridade de achado, distinta do booleano blocking e da prioridade da fila. Legado desconhecido permanece NULL. |
| `findings.origin_finding_id` | TEXT / Sim / NULL | FK `findings.id`; origem estável da mesma tentativa, sem ciclo; original aponta NULL. Não inferir recorrência por similaridade textual. |
| `ReviewCommandRepetition.reason` | TEXT / Não / — | Justificativa concreta para repetir comando usando referências de evidência válida da mesma versão; sem vínculo artificial a um check. |
| `project_revisions.status_options_json` | TEXT / Não / preservado | Nova revisão V3 contém backlog, ready, inProgress, inReview, delivered; HTTP converte para backlog, ready, in_progress, in_review, delivered. Cinco IDs distintos correspondem a Backlog, Ready, In progress, In review, Done. Não reescrever revisões antigas de quatro opções. |

**Novas tabelas V3.** Todos os campos abaixo têm default ausente, exceto quando explicitado; campos opcionais usam NULL. TEXT de identidade interna usa UUID quando referenciar OperationId; IDs GitHub são strings opacas até 256. Revisões começam em 1. FKs novas usam ON DELETE RESTRICT/ON UPDATE RESTRICT; a finalização autorizada exclui dependentes em ordem, sem cascata que contorne inventário.

#### `creation_board_operations`

Diário específico dos efeitos de quadro, sem ampliar `effects.kind` ou `creation_steps.step` fechados.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| operation_id | TEXT | Não | PK, FK operation_requests.operation_id |
| creation_id | TEXT | Não | FK project_creations.id |
| kind | TEXT | Não | create_board, configure_status, link_repository, configure_view, verify_board |
| scope_key | TEXT | Não | 1–512 caracteres; UNIQUE(creation_id, kind, scope_key) |
| state | TEXT | Não | not_started, running, confirmed, failed_known, unknown |
| revision | INTEGER | Não | 1; >=1 |
| request_hash | TEXT | Não | SHA-256 hexadecimal, 64 caracteres |
| authorization_json | TEXT | Não | Objeto v1: operação autorizadora, plan_hash, conta, criação e ações autorizadas |
| expected_identity_json | TEXT | Não | Objeto v1: owner_id, nome/marcador, project_id/field_id quando conhecidos; cinco opções e visualização esperadas |
| receipt_json | TEXT | Sim | Objeto v1 com identidades observadas, IDs/nomes/ordem de opções, vínculo, visualização e instante; obrigatório se confirmed |
| reason | TEXT | Sim | Causa redigida, até 2048 caracteres |
| created_at_ms | INTEGER | Não | >=0 |
| sent_at_ms | INTEGER | Sim | >=created_at_ms |
| confirmed_at_ms | INTEGER | Sim | >=created_at_ms, obrigatório se confirmed |

Índices: UNIQUE de escopo; (creation_id, state); FK operation_id já coberta pela PK. Repositório/origin/push continuam em effects. Toda nova criação exige confirmação dos efeitos obrigatórios, inclusive verificação do quadro; legado concluído não recebe recibo fictício.

#### `delivery_targets`

Destino selado da operação de publicação, escolhido antes do efeito.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| operation_id | TEXT | Não | PK/FK publication_requests.operation_id |
| selection_operation_id | TEXT | Sim | FK publication_target_selections.operation_id quando houver seleção de destino; clone local original dispensa seleção separada |
| delivery_id | TEXT | Não | FK composta (delivery_id, attempt_id) → deliveries(id, attempt_id) |
| attempt_id | TEXT | Não | FK attempts.id |
| repository_id | TEXT | Não | Mesmo repositório capturado da tentativa |
| local_path | TEXT | Não | Caminho absoluto conferido, até 32768 caracteres |
| local_identity_json | TEXT | Não | Objeto v1 com identidade de objeto/volume/repositório/remote observada; sem credenciais |
| branch_ref | TEXT | Não | Referência Git válida, até 1024; nome já resolvido contra colisões |
| task_type | TEXT | Não | feat, fix, docs, refactor, test, chore, perf, build, ci ou revert, conforme alteração |
| task_description | TEXT | Não | Português, 1–256 caracteres, sem controles/quebras de linha |
| issue_number | INTEGER | Não | >0; mesma issue capturada |
| base_branch | TEXT | Não | Referência Git válida, até 1024 |
| base_sha | TEXT | Não | Hash Git de 40 ou 64 hexadecimais |
| approved_ref | TEXT | Não | Referência imutável preservada no Git interno |
| content_identity | TEXT | Não | Hash Git aprovado de 40 ou 64 hexadecimais |
| format_version | INTEGER | Não | 1 |
| created_at_ms | INTEGER | Não | >=0 |

Índices (attempt_id, delivery_id), (repository_id, branch_ref). Registro imutável; novo destino exige nova operação/autorização e reconciliação anterior. Commit/push/PR permanecem em effects. Não copiar conteúdo do repositório para a tabela.

#### `publication_target_selections`

Detalhamento relacional da categoria de destino aprovada no PRD: seleção/clonagem precisa de intenção e reconciliação antes de existir uma operação de commit. O CHECK fechado de publication_requests.kind não admite publication.target, e delivery_targets exige FK de publication_requests e branch/versão seladas. Portanto, o diário de seleção é separado do destino final, sem adulterar kind existente, autorizar commit ou criar mecanismo genérico concorrente. É suporte do endpoint /publication/target já aprovado, não feature adicional.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| operation_id | TEXT | Não | PK/FK operation_requests.operation_id |
| attempt_id | TEXT | Não | FK attempts.id |
| delivery_id | TEXT | Não | FK composta(delivery_id, attempt_id) → deliveries(id, attempt_id) |
| repository_id | TEXT | Não | Mesmo repositório capturado |
| selection_kind | TEXT | Não | existing_clone ou clone |
| local_path | TEXT | Não | Destino absoluto escolhido, até 32768, sem sobrescrever pasta ocupada |
| expected_identity_json | TEXT | Não | Objeto v1 de repositório e identidade de destino/parent conferidas antes do efeito |
| confirmed_identity_json | TEXT | Sim | Identidade local conferida; obrigatória quando confirmed |
| authorization_json | TEXT | Não | Objeto v1 da ação específica; seleção não concede commit/push/PR |
| request_hash | TEXT | Não | SHA-256 do pedido |
| state | TEXT | Não | accepted, running, confirmed, failed_known, unknown |
| revision | INTEGER | Não | 1; >=1 |
| reason | TEXT | Sim | Até 2048, causa redigida |
| created_at_ms | INTEGER | Não | >=0 |
| updated_at_ms | INTEGER | Não | >=created_at_ms |

Índice(attempt_id, delivery_id, created_at_ms); UNIQUE parcial(attempt_id) WHERE state IN ('accepted','running','unknown') serializa seleção incerta. Recibo de clone/verificação permanece neste diário específico; retomada observa identidade/destino antes de repetir. Complete recebe selection_operation_id quando pertinente e sela o destino em delivery_targets; mudança posterior exige nova ação/plano. Incluir tabela no inventário/finalização, isolamento, consulta de detalhe e guarda de geração.

#### `managed_terminals`

Identidade física de terminal próprio, compartilhável entre tentativas após liberação comprovada.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| installation_id | TEXT | Não | Mesma instalação; até 128 |
| host_id | TEXT | Não | Host observado; até 256 |
| role | TEXT | Não | implementer ou reviewer |
| external_terminal_id | TEXT | Não | Identidade observada no Maestri; até 256 |
| terminal_name | TEXT | Não | Nome próprio conferido; até 256 |
| ownership_identity_json | TEXT | Não | Objeto v1 de posse/identidade, sem segredo |
| revision | INTEGER | Não | 1; >=1 |
| created_at_ms | INTEGER | Não | >=0 |
| last_observed_at_ms | INTEGER | Sim | >=created_at_ms; observação, não disponibilidade durável |

UNIQUE(installation_id, host_id, role), UNIQUE(installation_id, host_id, external_terminal_id). Terminal substituído exige revalidação/geração, nunca adoção de terminal manual. Não excluir registro compartilhado ao excluir projeto.

#### `attempt_sessions`

Sessão lógica contínua do mesmo papel na tentativa.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| attempt_id | TEXT | Não | FK attempts.id |
| role | TEXT | Não | implementer ou reviewer; UNIQUE(attempt_id, role) |
| external_session_id | TEXT | Sim | Identidade observada OMP; até 256 |
| generation | INTEGER | Não | 1; >=1; fence de coordenação, não nova conversa disfarçada |
| tracking_state | TEXT | Não | pending, tracked, lost |
| revision | INTEGER | Não | 1; >=1 |
| created_at_ms | INTEGER | Não | >=0 |
| last_observed_at_ms | INTEGER | Sim | >=created_at_ms |

UNIQUE(id, attempt_id, role) suporta FK composta de passagens. Nova tentativa ganha outra sessão; perda de conversa não é reparada pelo incremento de generation. Legado não recebe sessão inventada.

#### `terminal_occupancies`

Histórico de reserva/ocupação física da sessão.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| terminal_id | TEXT | Não | FK managed_terminals.id |
| attempt_session_id | TEXT | Não | FK attempt_sessions.id |
| generation | INTEGER | Não | >=1 |
| coordinator_token | TEXT | Não | UUID interno de fencing, nunca credencial de provider |
| state | TEXT | Não | reserved, active, uncertain, released |
| revision | INTEGER | Não | 1; >=1 |
| started_at_ms | INTEGER | Não | >=0 |
| ended_at_ms | INTEGER | Sim | >=started_at_ms; obrigatório apenas quando released |
| last_observed_at_ms | INTEGER | Sim | >=started_at_ms |

UNIQUE parcial(terminal_id) e UNIQUE parcial(attempt_session_id) WHERE state <> 'released'; índice(attempt_session_id, started_at_ms). Conferir instalação/host/papel/posse e disponibilidade antes de reservar. Timeout/lease vencido não libera ocupação.

#### `finding_assessments`

Histórico imutável do progresso do mesmo problema por revisão.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| attempt_id | TEXT | Não | FK attempts.id |
| finding_id | TEXT | Não | FK composta(finding_id, attempt_id) → findings(id, attempt_id); origem canônica |
| review_id | TEXT | Não | FK composta(review_id, attempt_id) → reviews(id, attempt_id) |
| progress | TEXT | Não | proven, partial, none, not_assessable |
| evidence_json | TEXT | Não | Array v1 de referências limitadas, mesmo contrato de evidência da revisão |
| justification | TEXT | Não | 1–8192 caracteres; progresso exige evidência verificável |
| created_at_ms | INTEGER | Não | >=0 |

UNIQUE(finding_id, review_id); índice(attempt_id, created_at_ms). Revisão deve avaliar rodada/versão atual posterior pertinente; avaliação não resolve achado. Duas correções consecutivas concluídas sem progresso verificável sobre o mesmo bloqueante interrompem repetição; `partial` comprovado conta como progresso. `none` e `not_assessable` não zeram a sequência: ausência de prova não é progresso. Execução/revisão ainda sem resultado válido não é contada como rodada concluída nem autoriza continuidade cega.

#### `finding_disputes`

Contestação do Implementador com resposta selada do Revisor, preservando ambos.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| attempt_id | TEXT | Não | FK attempts.id |
| finding_id | TEXT | Não | FK composta para findings da mesma tentativa |
| passage_id | TEXT | Não | FK para passagem do Implementador na mesma tentativa |
| delivery_id | TEXT | Não | FK composta para deliveries da mesma tentativa |
| content_identity | TEXT | Não | Hash da versão contestada |
| justification | TEXT | Não | 1–8192 caracteres |
| evidence_json | TEXT | Não | Evidências fundamentadas limitadas, formato v1 |
| response_review_id | TEXT | Sim | FK para reviews da mesma tentativa; versão da resposta derivada da revisão, podendo ser posterior à contestada quando houver nova rodada |
| response_verdict | TEXT | Sim | maintained ou resolved |
| response_justification | TEXT | Sim | 1–8192 caracteres quando respondida |
| response_evidence_json | TEXT | Sim | Evidências do parecer, formato v1 |
| created_at_ms | INTEGER | Não | >=0 |
| responded_at_ms | INTEGER | Sim | >=created_at_ms |

UNIQUE(finding_id, passage_id, delivery_id); índice(attempt_id, created_at_ms). Campos da contestação são imutáveis; conjunto de resposta transita de NULL para completo uma vez, depois sela. Resolução usa finding_resolutions. Contestação mantida após fundamento bloqueia e encaminha ao operador.

#### `attempt_decisions`

Diário imutável de escolha humana sobre bloqueio vigente.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| operation_id | TEXT | Não | UNIQUE/FK operation_requests.operation_id |
| attempt_id | TEXT | Não | FK attempts.id |
| delivery_id | TEXT | Não | FK composta para deliveries da mesma tentativa |
| block_id | TEXT | Não | Identidade estável do bloqueio apresentado |
| block_revision | INTEGER | Não | >=1; CAS do bloqueio |
| block_reason | TEXT | Não | no_progress, dispute_maintained ou correction_limit |
| action | TEXT | Não | guidance, change_profile ou end |
| authorization_json | TEXT | Não | Objeto v1 com escopo/ação/versão/hash autorizados; sem simular identidade humana pela sessão técnica |
| guidance_json | TEXT | Sim | Obrigatório para guidance: format_version=1, text de 1–8192 caracteres |
| successor_preparation_id | TEXT | Sim | FK preparations.id; obrigatório em change_profile após aceitação atômica |
| successor_preparation_revision | INTEGER | Sim | FK composta com preparation_revisions; mesmo projeto/issue |
| created_at_ms | INTEGER | Não | >=0 |

Índice(attempt_id, created_at_ms). Orientação não altera captura/perfil/limites; troca de perfil só prepara sucessora, sem iniciar/encerrar tentativa por inferência. Decisão não pode contornar bloqueio de limite total; prevalece o primeiro bloqueio atingido.

#### `project_storage_locations`

Histórico de localização lógica, sem reescrever referências históricas.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| project_id | TEXT | Não | FK projects.id |
| location_key | TEXT | Não | Chave estável, 1–256; raiz gerenciada ou raiz legada classificada |
| layout_version | INTEGER | Não | >=1 |
| root_relative | TEXT | Não | Relativa à instalação, 1–32768; sem escape, identidade exclusiva conferida |
| object_identity_json | TEXT | Não | Objeto v1 com identidade de objeto/volume/ancestrais |
| is_current | INTEGER | Não | 0/1 |
| revision | INTEGER | Não | 1; >=1 |
| created_at_ms | INTEGER | Não | >=0 |
| verified_at_ms | INTEGER | Não | >=created_at_ms |

UNIQUE parcial(project_id, location_key) WHERE is_current=1; UNIQUE(id, project_id); índice(project_id, layout_version). Recursos novos resolvem referências relativas à raiz do projeto; leitores legados reconhecem caminhos antigos até transição verificada.

#### `project_storage_transitions`

Diário retomável do movimento físico; uma transação SQLite não torna filesystem atômico.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| operation_id | TEXT | Não | PK/FK operation_requests.operation_id |
| project_id | TEXT | Não | FK projects.id |
| location_key | TEXT | Não | Mesma chave das localizações |
| source_location_id | TEXT | Não | FK composta(source_location_id, project_id) → project_storage_locations(id, project_id) |
| source_relative | TEXT | Não | Origem autorizada relativa à instalação |
| destination_relative | TEXT | Não | Destino autorizado relativo à instalação; diferente da origem |
| source_identity_json | TEXT | Não | Objeto v1 de identidade antes do movimento |
| destination_identity_json | TEXT | Sim | Observação posterior, exigida se verified |
| plan_hash | TEXT | Não | SHA-256 do plano autorizado |
| step | TEXT | Não | planned, quiescence_checked, moving, verifying, publishing_location |
| state | TEXT | Não | planned, running, verified, uncertain, blocked |
| revision | INTEGER | Não | 1; >=1 |
| generation | INTEGER | Não | >=1 |
| reason | TEXT | Sim | Até 2048 caracteres |
| created_at_ms | INTEGER | Não | >=0 |
| updated_at_ms | INTEGER | Não | >=created_at_ms |

Índice(project_id, state); UNIQUE parcial(project_id) WHERE state IN ('planned','running','uncertain','blocked') impede transições concorrentes. Nenhum conteúdo de arquivos é armazenado. Verificação precede publicação da nova localização; falha reconcilia origem/destino sem apagar único exemplar válido.

#### `attempt_stage_intervals`

Intervalos de etapa e espera, sem duplicar contadores de passage_measurements.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| id | TEXT | Não | PK UUID |
| attempt_id | TEXT | Não | FK attempts.id |
| round_number | INTEGER | Sim | FK composta com rounds quando preenchido |
| delivery_version | TEXT | Sim | Igual à versão da rodada referenciada |
| stage | TEXT | Não | preparing, implementing, verifying, reviewing, publishing, waiting_decision, tracking_lost |
| source_event_seq | INTEGER | Não | UNIQUE/FK events.seq; evento da mesma tentativa |
| started_at_ms | INTEGER | Não | >=0 |
| ended_at_ms | INTEGER | Sim | >=started_at_ms |
| last_activity_at_ms | INTEGER | Sim | >=started_at_ms e <=ended_at_ms quando fechado |
| deadline_at_ms | INTEGER | Sim | Somente prazo efetivamente configurado, >=started_at_ms |
| revision | INTEGER | Não | 1; >=1 |

UNIQUE parcial(attempt_id) WHERE ended_at_ms IS NULL; índice(attempt_id, started_at_ms). Replay não duplica intervalo; relógio da UI não registra atividade. Legado sem eventos suficientes mostra duração indisponível.

#### `notification_dispatches`

Reserva exclusiva e recibo do despacho local, sem duplicar texto do evento.

| Campo | Tipo | Nullable | Default / constraints |
| --- | --- | --- | --- |
| installation_id | TEXT | Não | PK composta; mesma instalação |
| consumer_id | TEXT | Não | PK composta; identidade local estável do consumidor, UUID, sem autoridade |
| surface | TEXT | Não | PK composta; browser_host |
| event_seq | INTEGER | Não | PK composta/FK events.seq |
| dispatch_id | TEXT | Não | UNIQUE UUID |
| state | TEXT | Não | reserved, confirmed, uncertain, unavailable |
| revision | INTEGER | Não | 1; >=1 |
| created_at_ms | INTEGER | Não | >=0 |
| updated_at_ms | INTEGER | Não | >=created_at_ms |
| dispatched_at_ms | INTEGER | Sim | Somente observação conhecida, >=created_at_ms |
| reason | TEXT | Sim | Até 2048, sem conteúdo do evento/segredo |

Índice(event_seq, consumer_id). Reserva precede envio; somente o vencedor da inserção recebe direito de envio. Replay de reserved/confirmed/uncertain não reenvia. Perda entre envio/recibo fica uncertain, nunca entrega externa exatamente uma vez. Pendência operacional vem da pergunta/falha/conclusão original.

**Índices novos e escopo composto.** Garantir UNIQUE complementares `deliveries(id,attempt_id)`, `reviews(id,attempt_id)`, `findings(id,attempt_id)`, `passages(id,attempt_id,role)` quando necessários a FKs; confirmar redundância com índices atuais. Comparar tentativa+versão, sessão+tentativa+papel e achado+tentativa em FKs/triggers, não confiar em FK simples. Candidatos de busca: attempts(account_id,created_at_ms DESC,id DESC), (account_id,project_id,result,created_at_ms DESC,id DESC), (account_id,repository_id,issue_id,created_at_ms DESC,id DESC), (account_id,issue_number,created_at_ms DESC,id DESC); criar só os necessários após EXPLAIN QUERY PLAN e medição de redundância. Índice parcial result IS NULL somente se justificado. B-tree não promete acelerar substring; não introduzir FTS sem necessidade medida.

**Inicialização e transição, alinhamento V4 autorizado em 29/10/2026.**

1. Instalação comprovadamente vazia cria diretamente o schema final v54, com application_id=0x4e465331 e schema_migrations vazio. Bases correntes v53 conformes conservam ledger real, nomes, checksums e timestamps. Reconhecer estrutura, identidade, contratos atuais, quick_check e foreign_key_check antes de escrita; não executar a cadeia histórica nem fazer downgrade ou conversão.
2. Manter o envelope privado atual de capture_json e as conversões explícitas na borda HTTP; bytes de capturas e revisões atuais ficam intactos. Leitura não migra documentos nem uniformiza grafia silenciosamente. Formatos retirados são recusados, inclusive em revisões não ativas.
3. Novas tentativas produzem cabeçalhos de busca e referências atuais. Abertura não executa backfill de cabeçalhos, referências ou recibos. Não fabricar Backlog, prioridade, sessões, duração, disponibilidade ou autorização; mapeamentos de quatro opções são recusados sem fluxo substituto.
4. Compor instruções nas gravações atuais, de forma determinística e versionada, preservando orientação sem duplicação e separação do contrato técnico. Não recompor perfis existentes na abertura, inclusive quando composition_version for NULL. Não alterar captura de tentativa iniciada; respeitar revisão e bloqueio do perfil.
5. Recursos exclusivos usam var/factory/projects/<projectId>/v<layoutVersion>/<locationKey>, com Git interno, bootstraps e ambientes separados por tentativa/passagem/rodada/versão. Nome igual não colide; renomear não exige mover raiz. Banco e recursos compartilhados continuam globais; pasta original não muda de local.
6. Transição atual vN→v(N+1) exige ausência confirmada de execução/revisão/efeitos pendentes ou incertos e exclusão concorrente, com geração/revisão por projeto. Registrar intenção, verificar identidade origem/destino e só depois publicar localização corrente. Reconciliação examina ambos os caminhos sem seguir links nem apagar o único exemplar válido. Não resolver referências ausentes no layout global antigo, mover seus recursos ou criar backfill de localizações.
7. Adaptar criação/leitura/execução/recuperação/retenção/publicação/exclusão à resolução. Reter versões aprovadas e evidências referenciadas, inclusive continuação, revisão e exclusão pendentes. Não limpar antecipadamente para terminar migração.
8. Incluir todas as tabelas exclusivas novas no inventário, barreira, ordem por FK e capacidade restrita de finalização da migration 026. Preservar terminais compartilhados. Mudança de layout/destino invalida preview/autorização incompatível. Recibo final somente após conferir todos os destinos e dados previstos.

Baseline/meta/duração por etapa/volume/comparação de exclusão pertencem às evidências de validação, sem tabela permanente de telemetria de ensaio. Medir SQL/finalização/verificações/remoção física e resposta da UI; aplicar otimização do custo observado e comparar com meta posterior, com muitas tentativas/caches volumosos e condições comparáveis. Remover raiz como unidade só se todas as proteções continuarem demonstradas; não é técnica imposta. Meta não atingida permanece pendente.

### 2.2 RLS Policies

**Não aplicável no SQLite desta stack:** não há RLS nativa, login humano ou RBAC novo. Não instalar Supabase/PostgreSQL nem simular policies SQL. A tabela abaixo especifica condições equivalentes obrigatórias na aplicação para SELECT/INSERT/UPDATE/DELETE; acesso direto ao banco fica restrito ao controlador local e à finalização autorizada. `S` = mesmo escopo instalação/conta/projeto/tentativa, `C` = comando/resultado técnico validado e autorizado, `R` = revisão/geração corrente e transição permitida, `F` = finalização restrita/inventariada. Sessão HTTP é necessária na borda, insuficiente para autoridade de domínio. Nenhuma tabela tem CRUD público genérico.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| accounts | S; GET /settings; GET /operation | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | Somente limpeza explícita autorizada, sem apagar escopo compartilhado |
| attempt_authority | S; GET /attempts/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| attempt_criteria | S; GET /attempts/:id?section=criteria | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| attempts | S; GET /attempts; GET /attempts/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| cancellation_requests | S; POST /attempts/:id/cancel; GET /operations/:operationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| capture_runs | S; GET /deliveries/:id; POST /attempts/:id/deliveries/:deliveryId/capture/retry | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| capture_warnings | S; GET /deliveries/:id | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| controller_authority | S; GET /operation | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | Somente limpeza explícita autorizada, sem apagar escopo compartilhado |
| creation_reconciliations | S; GET /operations/:operationId; GET /scaffold/creations/:creationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| creation_steps | S; GET /scaffold/creations/:creationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| criterion_results | S; GET /attempts/:id?section=criteria; GET /deliveries/:id/review | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| deliveries | S; GET /deliveries/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| diagnostic_runs | S; GET /diagnostics | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| effects | S; GET /deliveries/:id; GET /scaffold/creations/:creationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| events | S; GET /events; GET /events/stream | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| execution_profiles | S; GET /settings; GET /projects/:id/configuration | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | Vedado fisicamente; lifecycle tombstone autorizado |
| execution_questions | S; GET /attempts/:id/questions/:questionId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| factory_settings | S; GET /settings | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | Vedado (singleton) |
| finding_resolutions | S; GET /deliveries/:id/review; GET /attempts/:id?section=findings | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| findings | S; GET /deliveries/:id/review; GET /attempts/:id?section=findings | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| native_open_requests | S; POST /attempts/:id/resources/:resourceId/folder/open; POST /attempts/:id/passages/:passageId/interaction/open | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| operation_requests | S; GET /operations/:operationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| passage_events | S; GET /attempts/:id?section=passages | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| passage_measurements | S; GET /attempts/:id/measurements | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| passage_results | S; GET /deliveries/:id/producer-result | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| passages | S; GET /attempts/:id?section=passages | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| preparation_revisions | S; GET /preparations/:id | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| preparations | S; GET /preparations/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| project_creations | S; GET /scaffold/creations/:creationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| project_deletion_receipts | S; GET /project-deletions/:operation_id; GET /operations/:operationId | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| project_deletion_targets | S; GET /projects/:id/deletion-preview; GET /project-deletions/:operation_id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| project_deletions | S; GET /project-deletions/:operation_id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| project_revisions | S; GET /projects/:id/configuration | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| projects | S; GET /projects; GET /projects/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| publication_requests | S; GET /operations/:operationId; GET /deliveries/:id | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| publication_upgrades | S; GET /deliveries/:id; POST /attempts/:id/publication/authorize-upgrade | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| queue_consumptions | S; GET /queue; GET /attempts/:id | S + C; vínculo e formato válidos | Vedado; preservar registro selado | S + F quando exclusivo; guardas atuais preservadas |
| queue_cycles | S; GET /queue | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| resource_removals | S; POST /attempts/:id/resources/:resourceId/remove; GET /operations/:operationId | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| resources | S; GET /attempts/:id/resources | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| reviews | S; GET /deliveries/:id/review | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| rounds | S; GET /attempts/:id/rounds | S + C; vínculo e formato válidos | S + C + R; não alterar fatos selados | S + F quando exclusivo; guardas atuais preservadas |
| schema_migrations | S; GET /health (consulta indireta checkHealth) | Inicializador com versão/checksum válidos | Vedado para versões aplicadas | Vedado |
| creation_board_operations | S; GET /scaffold/creations/:creationId | S+C; formato, escopo e unicidade | S+C+R, transição e recibo | S+F; ordem por FK e inventário vigente |
| delivery_targets | S; GET /deliveries/:id | S+C; formato, escopo e unicidade | Vedado; imutável | S+F; ordem por FK e inventário vigente |
| managed_terminals | S; GET /attempts/:id/resources | S+C; formato, escopo e unicidade | C+R, observação runtime sem autoridade persistida | Limpeza técnica explícita com ausência de vínculos; nunca por exclusão de projeto |
| attempt_sessions | S; GET /attempts/:id?section=passages | S+C; formato, escopo e unicidade | S+C+R; identidade da conversa preservada | S+F; ordem por FK e inventário vigente |
| terminal_occupancies | S; GET /attempts/:id/resources | S+C; formato, escopo e unicidade | S+C+R; liberação comprovada | S+F; ordem por FK e inventário vigente |
| finding_assessments | S; GET /attempts/:id?section=findings | S+C; formato, escopo e unicidade | Vedado; append-only | S+F; ordem por FK e inventário vigente |
| finding_disputes | S; GET /attempts/:id?section=findings | S+C; formato, escopo e unicidade | Somente selar resposta correspondente uma vez | S+F; ordem por FK e inventário vigente |
| attempt_decisions | S; GET /attempts/:id?section=decisions | S+C; formato, escopo e unicidade | Vedado; append-only | S+F; ordem por FK e inventário vigente |
| project_storage_locations | S; GET /projects/:id/configuration | S+C; formato, escopo e unicidade | S+C+R; trocar corrente só após verificação | S+F; ordem por FK e inventário vigente |
| project_storage_transitions | S; GET /operations/:operationId; GET /projects/:id/configuration | S+C; formato, escopo e unicidade | S+C+R; diário e geração | S+F; ordem por FK e inventário vigente |
| attempt_stage_intervals | S; GET /attempts/:id/measurements | S+C; formato, escopo e unicidade | S+C+R; ordem temporal e atividade observada | S+F; ordem por FK e inventário vigente |
| notification_dispatches | S; POST /notifications/claims (consulta deduplicada); POST /notifications/receipts | S+C; formato, escopo e unicidade | S+C+R; sem renovar direito de envio | Somente retenção/finalização elegível, sem permitir replay como evento novo |
| publication_target_selections | S; GET /attempts/:id?section=target_selections; GET /operations/:operationId | S+C; intenção/autorização da seleção ou clone e hash do pedido | S+C+R; confirmar identidade ou manter incerteza antes de repetir | S+F; incluir no inventário e preservar referência de delivery_targets até exclusão autorizada |

### 2.3 Triggers

Preservar as guardas existentes listadas abaixo; elas complementam validação TypeBox e invariantes dos serviços. Atualizações de projeção/recibo/evento são atômicas em transações curtas. Identidades, captura/revisões, evidências seladas, referências aprovadas e recibos confirmados não podem ser sobrescritos. SQL não fica aberto durante IO Git/GitHub/Maestri/filesystem.

| Trigger existente | Tabela / evento | Ação / recusa preservada |
| --- | --- | --- |
| attempt_authority_project_deletion_guard | attempt_authority / BEFORE DELETE | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_row_allowed('attempt_authority',json_array(OLD.attempt_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| attempt_criteria_delete_immutable | attempt_criteria / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('attempt_criteria',json_array(OLD.attempt_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| attempt_criteria_insert_sealed | attempt_criteria / BEFORE INSERT | Recusa: `IMMUTABLE_RECORD`; condição: ` EXISTS ( SELECT 1 FROM rounds WHERE attempt_id=NEW.attempt_id ) `. |
| attempt_criteria_update_immutable | attempt_criteria / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| attempt_capture_immutable | attempts / BEFORE UPDATE OF id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,capture_json,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| attempt_preparation_binding | attempts / BEFORE INSERT | Recusa: `ATTEMPT_PREPARATION_MISMATCH`; condição: ` NOT EXISTS ( SELECT 1 FROM preparation_revisions r WHERE r.preparation_id=NEW.preparation_id AND r.revision=NEW.preparation_revision AND r.project_id=NEW.project_id AND r.project_revision_id=NEW.project_revision_id ) `. |
| attempts_delete_immutable | attempts / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('attempts',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| attempts_source_immutable | attempts / BEFORE UPDATE OF source | Recusa: `attempt source is immutable`; condição: ` NEW.source IS NOT OLD.source `. |
| attempts_source_required | attempts / BEFORE INSERT | Recusa: `new attempts require execution source`; condição: ` NEW.source IS NULL `. |
| cancellation_delete | cancellation_requests / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('cancellation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| cancellation_immutable | cancellation_requests / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| capture_run_delete | capture_runs / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('capture_runs',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| capture_run_history | capture_runs / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state<>'running' `. |
| capture_run_identity | capture_runs / BEFORE UPDATE OF id,delivery_id,operation_id,started_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| capture_warning_delete_immutable | capture_warnings / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('capture_warnings',json_array(OLD.delivery_id,OLD.path),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| capture_warning_update_immutable | capture_warnings / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| captured_warning_sealed | capture_warnings / BEFORE INSERT | Recusa: `IMMUTABLE_RECORD`; condição: ` EXISTS ( SELECT 1 FROM deliveries d WHERE d.id=NEW.delivery_id AND d.capture_state='captured' ) `. |
| creation_reconciliation_delete | creation_reconciliations / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('creation_reconciliations',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| creation_reconciliation_identity | creation_reconciliations / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` NEW.operation_id<>OLD.operation_id OR NEW.creation_id<>OLD.creation_id OR OLD.state<>'accepted' `. |
| creation_step_delete | creation_steps / BEFORE DELETE | Recusa: `IMMUTABLE_CREATION_STEP`; condição: ` factory_project_deletion_row_allowed('creation_steps',json_array(OLD.creation_id,OLD.step),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| creation_step_identity | creation_steps / BEFORE UPDATE | Recusa: `IMMUTABLE_CREATION_STEP`; condição: ` NEW.creation_id<>OLD.creation_id OR NEW.step<>OLD.step OR OLD.state<>'running' OR NEW.state NOT IN ('confirmed','unknown') `. |
| criterion_results_delete_immutable | criterion_results / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('criterion_results',json_array(OLD.passage_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| criterion_results_update_immutable | criterion_results / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| delivery_content_immutable | deliveries / BEFORE UPDATE OF capture_state,git_ref,content_identity,commit_sha,has_delta,captured_at_ms | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.capture_state='captured' `. |
| delivery_delete_immutable | deliveries / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('deliveries',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| delivery_identity_immutable | deliveries / BEFORE UPDATE OF id,attempt_id,round_number,producer_passage_id,base_sha,repository_relative | Recusa: `IMMUTABLE_RECORD`. |
| delivery_producer_binding | deliveries / BEFORE INSERT | Recusa: `DELIVERY_PRODUCER_INVALID`; condição: ` NOT EXISTS ( SELECT 1 FROM passages p JOIN passage_results r ON r.passage_id=p.id WHERE p.id=NEW.producer_passage_id AND p.attempt_id=NEW.attempt_id AND p.round_number=NEW.round_number AND p.delivery_version=NEW.id AND p.role='implementer' ) `. |
| diagnostic_run_delete | diagnostic_runs / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('diagnostic_runs',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| diagnostic_run_identity | diagnostic_runs / BEFORE UPDATE OF operation_id,installation_id,account_id,scope,context_id,project_id,creation_id,attempt_id,context_stamp,checks_json,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| diagnostic_run_scope | diagnostic_runs / BEFORE INSERT | Recusa: `diagnostic context mismatch`; condição: ` NOT EXISTS (SELECT 1 FROM operation_requests o WHERE o.operation_id=NEW.operation_id AND o.operation_kind='diagnostics.check' AND o.resource_type='diagnostic' AND o.resource_id=NEW.operation_id AND o.installation_id=NEW.installation_id AND o.account_id IS NEW.account_id) OR (NEW.scope='attempt' AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id IS NEW.account_id AND a.project_id=NEW.project_id)) OR (NEW.scope='creation' AND NOT EXISTS (SELECT 1 FROM project_creations c WHERE c.id=NEW.creation_id AND c.installation_id=NEW.installation_id AND c.account_id IS NEW.account_id AND c.project_id IS NEW.project_id)) OR (NEW.scope='project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND (p.account_id IS NULL OR p.account_id IS NEW.account_id))) `. |
| diagnostic_run_terminal | diagnostic_runs / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state<>'accepted' `. |
| effect_delete | effects / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('effects',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| effect_identity | effects / BEFORE UPDATE OF operation_id,creation_id,attempt_id,delivery_id,kind,scope_key,authorization_json,expected_identity_json,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| effect_terminal | effects / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state IN ('confirmed','not_applicable') `. |
| effect_transition | effects / BEFORE UPDATE OF state | Recusa: `EFFECT_TRANSITION_INVALID`; condição: ` NOT ( (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR (OLD.state='unknown' AND NEW.state IN ('confirmed','not_applicable')) OR (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable')) ) `. |
| event_delete_immutable | events / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| event_update_immutable | events / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| execution_profiles_lifecycle_insert_valid | execution_profiles / BEFORE INSERT | Recusa: `PROFILE_DATA_INVALID`; condição: ` NEW.profile_type IS NULL OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0 OR NEW.deleted_at_ms IS NOT NULL `. |
| execution_profiles_lifecycle_update_valid | execution_profiles / BEFORE UPDATE | Recusa: `PROFILE_DATA_INVALID`; condição: ` NEW.id <> OLD.id OR NEW.created_at_ms <> OLD.created_at_ms OR NEW.profile_type IS NULL OR NEW.profile_type NOT IN ('implementer', 'reviewer') OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0 OR NEW.updated_at_ms < OLD.updated_at_ms OR NEW.revision <> OLD.revision + 1 OR (OLD.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms IS NOT OLD.deleted_at_ms) OR (OLD.deleted_at_ms IS NULL AND NEW.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms < OLD.created_at_ms) `. |
| execution_profiles_physical_delete_forbidden | execution_profiles / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`. |
| execution_questions_delete_immutable | execution_questions / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('execution_questions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| question_answer_binding | execution_questions / BEFORE UPDATE OF answer_operation_id | Recusa: `QUESTION_OPERATION_MISMATCH`; condição: ` NEW.answer_operation_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM operation_requests WHERE operation_id=NEW.answer_operation_id AND resource_type='question' AND resource_id=NEW.id AND operation_kind='question.answer' ) `. |
| question_answer_immutable | execution_questions / BEFORE UPDATE OF answer_operation_id,answer,answer_hash,answered_at_ms | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.answer_operation_id IS NOT NULL `. |
| question_identity_immutable | execution_questions / BEFORE UPDATE OF id,passage_id,attempt_id,question_hash,question_json,created_at_ms,ttl_ms,scope_json | Recusa: `IMMUTABLE_RECORD`. |
| question_terminal_immutable | execution_questions / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state IN ('delivered','expired','cancelled') `. |
| onboarding_completion_delete_immutable | factory_settings / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.onboarding_completed_at_ms IS NOT NULL `. |
| onboarding_completion_immutable | factory_settings / BEFORE UPDATE OF onboarding_completed_at_ms | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.onboarding_completed_at_ms IS NOT NULL AND NEW.onboarding_completed_at_ms IS NOT OLD.onboarding_completed_at_ms `. |
| resolution_delete | finding_resolutions / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('finding_resolutions',json_array(OLD.finding_id,OLD.review_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| resolution_prior | finding_resolutions / BEFORE INSERT | Recusa: `RESOLUTION_BINDING_INVALID`; condição: ` NOT EXISTS ( SELECT 1 FROM findings f JOIN reviews old ON old.id=f.review_id JOIN reviews new ON new.id=NEW.review_id JOIN deliveries od ON od.id=old.delivery_id JOIN deliveries nd ON nd.id=new.delivery_id WHERE f.id=NEW.finding_id AND od.round_number<nd.round_number AND old.state<>'pending' ) `. |
| resolution_sealed | finding_resolutions / BEFORE INSERT | Recusa: `IMMUTABLE_RECORD`; condição: ` (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending' `. |
| resolution_update | finding_resolutions / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| finding_delete | findings / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('findings',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| finding_sealed | findings / BEFORE INSERT | Recusa: `IMMUTABLE_RECORD`; condição: ` (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending' `. |
| finding_update | findings / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| findings_criteria | findings / BEFORE INSERT | Recusa: `FINDING_CRITERION_INVALID`; condição: ` EXISTS ( SELECT 1 FROM json_each(NEW.criterion_ids_json) j WHERE NOT EXISTS ( SELECT 1 FROM attempt_criteria c WHERE c.attempt_id=NEW.attempt_id AND c.criterion_id=j.value ) ) `. |
| native_delete | native_open_requests / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('native_open_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| native_identity | native_open_requests / BEFORE UPDATE OF operation_id,resource_id,kind,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| native_terminal | native_open_requests / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state<>'accepted' `. |
| operation_delete_immutable | operation_requests / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('operation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| operation_identity_immutable | operation_requests / BEFORE UPDATE OF operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, result_account_id | Recusa: `IMMUTABLE_RECORD`. |
| passage_events_delete_immutable | passage_events / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('passage_events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| passage_events_update_immutable | passage_events / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| measurement_delete_immutable | passage_measurements / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('passage_measurements',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| measurement_identity_immutable | passage_measurements / BEFORE UPDATE OF passage_id,observed | Recusa: `IMMUTABLE_RECORD`. |
| passage_results_delete_immutable | passage_results / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('passage_results',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| passage_results_update_immutable | passage_results / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| passage_identity_immutable | passages / BEFORE UPDATE OF id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| passage_observation_immutable | passages / BEFORE UPDATE OF effective_profile_json,executor_version | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.effective_profile_json IS NOT NULL `. |
| passage_request_immutable | passages / BEFORE UPDATE OF request_hash | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.request_hash IS NOT NULL `. |
| passage_source_binding | passages / BEFORE INSERT | Recusa: `CONTINUATION_BINDING_INVALID`; condição: ` NEW.session_source_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM passages p WHERE p.id=NEW.session_source_id AND p.attempt_id=NEW.attempt_id AND p.role='implementer' AND NEW.role='implementer' AND p.round_number=NEW.round_number-1 ) `. |
| passage_source_immutable | passages / BEFORE UPDATE OF session_source_id | Recusa: `IMMUTABLE_RECORD`. |
| passages_delete_immutable | passages / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('passages',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| preparation_revision_delete_immutable | preparation_revisions / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('preparation_revisions',json_array(OLD.preparation_id,OLD.revision),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| preparation_revision_update_immutable | preparation_revisions / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| preparation_identity_immutable | preparations / BEFORE UPDATE OF id, project_id, account_id, created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| preparation_pointer_revision | preparations / BEFORE UPDATE OF revision | Recusa: `PREPARATION_REVISION_MISMATCH`; condição: ` NEW.revision <> OLD.revision + 1 OR NOT EXISTS ( SELECT 1 FROM preparation_revisions r WHERE r.preparation_id = NEW.id AND r.revision = NEW.revision AND r.project_id = NEW.project_id ) `. |
| preparations_project_deletion_guard | preparations / BEFORE DELETE | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_row_allowed('preparations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| creation_delete | project_creations / BEFORE DELETE | Recusa: `IMMUTABLE_CREATION`; condição: ` factory_project_deletion_row_allowed('project_creations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| creation_identity | project_creations / BEFORE UPDATE | Recusa: `IMMUTABLE_CREATION`; condição: ` NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id OR NEW.account_id IS NOT OLD.account_id OR NEW.plan_hash<>OLD.plan_hash OR NEW.plan_json<>OLD.plan_json OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms OR OLD.state='completed' OR NEW.revision<>OLD.revision+1 OR (OLD.state IN ('partial','failed') AND NEW.state NOT IN ('partial','failed','completed')) OR (OLD.baseline_sha IS NOT NULL AND (NEW.baseline_sha IS NOT OLD.baseline_sha OR NEW.baseline_ref IS NOT OLD.baseline_ref)) `. |
| project_deletion_receipts_delete_immutable | project_deletion_receipts / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`. |
| project_deletion_receipts_immutable | project_deletion_receipts / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| project_deletion_receipts_insert | project_deletion_receipts / BEFORE INSERT | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_finalization_allowed(NEW.operation_id) IS NOT 1 `. |
| project_deletion_targets_identity | project_deletion_targets / BEFORE UPDATE OF operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id | Recusa: `IMMUTABLE_RECORD`. |
| project_deletion_targets_project_deletion_guard | project_deletion_targets / BEFORE DELETE | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_row_allowed('project_deletion_targets',json_array(OLD.operation_id,OLD.target_key),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| project_deletions_identity | project_deletions / BEFORE UPDATE OF operation_id,project_id,expected_revision,authorization_digest,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| project_deletions_project_deletion_guard | project_deletions / BEFORE DELETE | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_row_allowed('project_deletions',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| project_revision_delete_immutable | project_revisions / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('project_revisions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| project_revision_update_immutable | project_revisions / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| project_pointer_revision | projects / BEFORE UPDATE OF current_revision_id, revision | Recusa: `PROJECT_REVISION_MISMATCH`; condição: ` NOT EXISTS (SELECT 1 FROM project_revisions r WHERE r.id = NEW.current_revision_id AND r.project_id = NEW.id AND r.revision_number = NEW.revision) `. |
| projects_project_deletion_guard | projects / BEFORE DELETE | Recusa: `PROJECT_DELETION_FINALIZATION_REQUIRED`; condição: ` factory_project_deletion_row_allowed('projects',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| publication_delete | publication_requests / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('publication_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| publication_identity | publication_requests / BEFORE UPDATE OF operation_id,attempt_id,delivery_id,kind,authorized_mode,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| publication_terminal | publication_requests / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state IN ('succeeded','failed','unknown') `. |
| upgrade_delete | publication_upgrades / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('publication_upgrades',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| upgrade_identity | publication_upgrades / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |
| queue_consumptions_no_delete | queue_consumptions / BEFORE DELETE | Recusa: `queue consumption is immutable`; condição: ` factory_project_deletion_row_allowed('queue_consumptions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| queue_consumptions_no_update | queue_consumptions / BEFORE UPDATE | Recusa: `queue consumption is immutable`. |
| queue_consumptions_scope | queue_consumptions / BEFORE INSERT | Recusa: `queue consumption scope mismatch`; condição: ` NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id=NEW.account_id AND a.project_id=NEW.project_id AND a.repository_id=NEW.repository_id AND a.issue_id=NEW.issue_id) `. |
| queue_cycles_attempt_scope_insert | queue_cycles / BEFORE INSERT | Recusa: `queue cycle attempt scope mismatch`; condição: ` NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM attempts a JOIN projects p ON p.id=NEW.project_id JOIN project_revisions r ON r.id=p.current_revision_id WHERE a.id=NEW.consumed_attempt_id AND a.account_id=NEW.account_id AND a.issue_id=NEW.issue_id AND a.repository_id=r.repository_id) `. |
| queue_cycles_attempt_scope_update | queue_cycles / BEFORE UPDATE OF consumed_attempt_id | Recusa: `queue cycle attempt scope mismatch`; condição: ` NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM attempts a JOIN projects p ON p.id=NEW.project_id JOIN project_revisions r ON r.id=p.current_revision_id WHERE a.id=NEW.consumed_attempt_id AND a.account_id=NEW.account_id AND a.issue_id=NEW.issue_id AND a.repository_id=r.repository_id) `. |
| queue_cycles_monotonic | queue_cycles / BEFORE UPDATE | Recusa: `queue cycle identity and sequence are immutable`; condição: ` NEW.account_id<>OLD.account_id OR NEW.project_id<>OLD.project_id OR NEW.issue_id<>OLD.issue_id OR NEW.cycle_number<OLD.cycle_number `. |
| queue_cycles_no_delete | queue_cycles / BEFORE DELETE | Recusa: `queue cycle history is immutable`; condição: ` factory_project_deletion_row_allowed('queue_cycles',json_array(OLD.account_id,OLD.project_id,OLD.issue_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| removal_delete | resource_removals / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('resource_removals',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| removal_identity | resource_removals / BEFORE UPDATE OF operation_id,resource_id,plan_hash,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| removal_terminal | resource_removals / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state<>'accepted' `. |
| resource_identity_immutable | resources / BEFORE UPDATE OF id,attempt_id,passage_id,kind,reference,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| resource_removal_terminal | resources / BEFORE UPDATE OF removed | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.removed=1 AND NEW.removed<>1 `. |
| resource_revision | resources / AFTER UPDATE OF owned,launch_state,stop_state,diagnostic,removed | Mantém vínculos e projeções derivados da transição. |
| resources_delete_immutable | resources / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('resources',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| review_approval_guard | reviews / BEFORE UPDATE OF state | Recusa: `REVIEW_APPROVAL_INVALID`; exige revisão independente válida, resultado próprio do Revisor, critérios atuais aprovados com evidência e ausência de achados bloqueantes ou pendências herdadas. |
| review_delete | reviews / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('reviews',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| review_history | reviews / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`; condição: ` OLD.state<>'pending' `. |
| review_identity | reviews / BEFORE UPDATE OF id,delivery_id,attempt_id,passage_id,content_identity,created_at_ms | Recusa: `IMMUTABLE_RECORD`. |
| review_role_binding | reviews / BEFORE INSERT | Recusa: `REVIEW_BINDING_INVALID`; vincula a passagem do Revisor à entrega capturada, ao resultado do Implementador e à identidade de conteúdo da rodada. |
| rounds_delete_immutable | rounds / BEFORE DELETE | Recusa: `IMMUTABLE_RECORD`; condição: ` factory_project_deletion_row_allowed('rounds',json_array(OLD.attempt_id,OLD.round_number),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1 `. |
| rounds_update_immutable | rounds / BEFORE UPDATE | Recusa: `IMMUTABLE_RECORD`. |

| Guarda nova/evoluída | Tabela / evento | Ação obrigatória |
| --- | --- | --- |
| Cabeçalho capturado | attempts / INSERT dos campos atuais | Igualdade com capture_json validado; imutabilidade e ausência de backfill na abertura. |
| Composição efetiva | execution_profiles / INSERT e UPDATE | Versão positiva e orientação completa sem duplicação; CAS. Tentativas iniciadas não são atualizadas. |
| Quadro completo | creation_board_operations, project_creations / INSERT e UPDATE de conclusão | Escopo/hash/recibo e ordem das cinco opções verificados; nova criação só conclui com todos os efeitos confirmados. Não reescrever conclusão legada. |
| Destino selado | delivery_targets / INSERT, UPDATE e DELETE | Mesmo repositório/tentativa/versão aprovada; nome/base/destino selados; UPDATE vedado, DELETE só F. |
| Seleção de destino | publication_target_selections / INSERT e UPDATE | Mesma tentativa/entrega/repositório, autorização específica e revisão; destino/identidade esperada não mudam após aceitação; confirmação exige observação correspondente. |
| Intenção de destino E2-a | preparation_revisions / INSERT; attempts / INSERT | Intenção validada e revisão/hash coerentes; captura por valor, origem autorizadora atribuída pelo controlador e ausência de efeito por salvar/ler. Captura/revisão seladas não mudam. |
| Controle de encerramento E1-a | operação/configuração / transação de controle | Serializar revisão/geração/instância, pausa ou retirada explícita e ponto final de fechamento; replay recupera recibo, geração revogada não fecha. Não executar IO por trigger. |
| Sessão e continuidade | passages, attempt_sessions / INSERT e UPDATE | Mesma tentativa/papel/sessão; evoluir session_source_id para Revisor também, preservando histórico terminal_name e sem transferir autoridade. |
| Ocupação | terminal_occupancies / INSERT e UPDATE | Papel/instalação/host coerentes, geração válida; unicidade parcial; liberação exige observação de parada/ociosidade pertinente. |
| Origem de achado | findings / INSERT e UPDATE de origem | Mesma tentativa, origem estável, sem ciclos; não fundir texto semelhante. |
| Progresso | finding_assessments / INSERT, UPDATE e DELETE | Revisão/rodada/versão e tentativa coerentes; evidência exigida para progresso; append-only, DELETE só F. |
| Contestação | finding_disputes / INSERT e UPDATE | Implementador contesta, Revisor responde na versão correspondente; resposta preenchida uma vez, selada; histórico preservado. |
| Decisão | attempt_decisions / INSERT, UPDATE e DELETE | Operação/bloqueio/revisão/versão atuais; guidance separada da captura; sucessora do mesmo projeto/issue; append-only, DELETE só F. |
| Localização | project_storage_locations, project_storage_transitions / INSERT e UPDATE | Uma corrente por chave, geração e identidade válidas, destino verificado antes da troca; sem efeito de filesystem por trigger. |
| Intervalo | attempt_stage_intervals / INSERT e UPDATE | Evento/rodada/versão da tentativa, ordem temporal, único aberto, idempotência de replay; silêncio não fecha intervalo. |
| Notificação | notification_dispatches / INSERT e UPDATE | Evento elegível do escopo; reserva exclusiva, transição por CAS, sem reassinar direito de envio em replay. |
| Exclusão V3 | todas as novas tabelas exclusivas / DELETE | Exigir capacidade F vigente; incluir vínculos exclusivos e preservar terminais compartilhados. |

### 2.4 Seed Data

Uma única `factory_settings.id='local'`: installation_id UUID gerado, host observado em runtime, conta e projects_root NULL, automation_enabled=false, revision=1 e timestamps do momento. Defaults existentes: polling_interval_ms=15000; passage_active_time_ms=1800000; question_ttl.state='not_configured'; artifact_policy.format_version=1 e automatic_deletion=false. Persistência privada legada usa seus conversores/versionamento. Não restaurar os campos globais removidos pela migration 020.

Perfis efetivos de Implementador/Revisor recebem o conteúdo comportamental dos recursos distribuídos e as orientações existentes pela migração idempotente, não uma segunda tabela ou perfil paralelo. Modelos/providers/esforços vêm do catálogo real e das escolhas existentes, sem provider/effort novo fixado pela SPEC. Não criar conta GitHub, projeto, quadro, issue, recibo, autorização, sessão ou dado demonstrativo como seed. Sem planos comerciais/roles administrativas novos. `schema_migrations` recebe somente versões/checksums efetivamente aplicados. Recursos de scaffold permanecem os distribuídos.

### 2.5 Diagrama ER

```text
factory_settings -> accounts <- projects -> project_revisions -> execution_profiles
projects -> preparations -> preparation_revisions -> attempts -> attempt_criteria
operation_requests -> attempts -> rounds -> passages -> passage_results / criterion_results
                                     |       | -> passage_events / passage_measurements
                                     |       | -> execution_questions / resources
                                     |       + -> attempt_sessions <- terminal_occupancies -> managed_terminals
                                     + -> deliveries -> capture_runs / capture_warnings
                                              | -> producer_result -> reviews
                                              | -> reviews -> findings -> finding_resolutions
                                              |                 | -> finding_assessments
                                              |                 + -> finding_disputes
                                              | -> publication_requests -> delivery_targets
                                              | -> publication_target_selections <- delivery_targets
                                              | -> publication_upgrades / effects
attempts -> attempt_authority / attempt_decisions / attempt_stage_intervals
projects -> queue_cycles / queue_consumptions
projects -> project_creations -> creation_steps / creation_reconciliations / creation_board_operations
projects -> project_storage_locations <- project_storage_transitions
projects -> project_deletions -> project_deletion_targets / project_deletion_receipts
resources -> resource_removals / native_open_requests
operation_requests -> events -> notification_dispatches / attempt_stage_intervals
operation_requests -> diagnostic_runs
controller_authority, schema_migrations: escopo técnico da instalação
```

As setas resumem vínculos; FKs e escopos compostos normativos estão no dicionário. Autoridade observada e receipt não são identidade de pessoa. `events.operation_id` preserva seu contrato de correlação, sem presumir FK onde ela não existe.

## 3. Backend

### 3.1 Estrutura de Pastas

```text
apps/controller/src/
  config.ts, main.ts                 configuração e ciclo de vida
  http/
    app.ts, errors.ts, assets.ts     composição, erros e aplicação servida
    security/index.ts               sessão técnica e perímetro HTTP
    routes/                         settings/projects, scaffold, preparations, queue,
                                    attempts, deliveries, publication, recovery,
                                    project-deletions, operation, events;
                                    extensões V3 nos mesmos domínios
    configuration-views.ts          conversão explícita HTTP snake_case
    execution-views.ts, observation-views.ts
  modules/
    projects/                       cadastro, preparação, scaffold, fila, prontidão
    pipeline/                       início, rodadas, correções, decisões
    execution/                      sessões, terminais e adapter maestri-omp
    resultado_do_agente/          evidências e revisão
    publication/                    autorização, continuação, efeitos e recibos
    workspaces/                     Git, ambientes, referências, transição, exclusão
    github/                         conta, repositório, Projects, push/PR por adapters
    storage/migrations/             SQL e migrations numeradas
    queries/                        projeções leves e comparação histórica
    diagnostics/                    diagnóstico e revalidação
packages/contracts/src/             TypeBox e tipos compartilhados sem IO
  http-execution/, http-observation/ DTOs HTTP com snake_case
resources/roles/                    contratos técnicos e origem da migração comportamental
scripts/                            inicialização/distribuição e verificações existentes
tests/                              contratos, HTTP, aceitação, provas controladas/nativas
```

Cada domínio expõe `index.ts`; imports relativos usam `.js`, contratos usam `#contracts`. Não criar controllers paralelos, barramento/servidor/fila externa. SQL pertence a storage, Git/filesystem a workspaces, GitHub a github, Maestri/OMP a execution.

### 3.2 Endpoints

**Contrato comum.** Prefixo `/api/v1`. Corpos e respostas JSON usam snake_case; código interno camelCase e tipos/componentes PascalCase. Schemas fechados recusam propriedades extras. O catálogo JSON Schema nesta seção define todos os campos, enums, nullable e limites dos DTOs referenciados nas fichas. `$ref` referencia definição do mesmo catálogo. Um DTO transportado conserva suas chaves até o conversor explícito do cliente; não esperar `title` quando vier `name` nem `createdAt` no JSON.

Todas as fichas têm Auth=Sim para sessão técnica, salvo bootstrap/health. GET/HEAD não produzem efeito de domínio; plano/preview/observação não concedem autoridade. `If-Match` é obrigatório para comando sobre recurso existente, salvo exceções atuais de plano/criação sem recurso; comandos duráveis usam `Idempotency-Key` UUID. Recuperar operação por escopo/hash antes de reaplicar CAS: mesma chave/conteúdo retorna recibo original, conteúdo divergente recebe 409. Configuração e preparação preservam respostas síncronas existentes. Comando longo só retorna 202 OperationAccepted após aceitação durável, com Location/status_url; 202 não é conclusão. Exclusão conserva seu contrato específico 200/202 DeletionStatus.

Erros comuns `E`: 400 entrada inválida; 401 sessão ausente/invalidada; 403 perímetro/autoridade negada; 404 inexistente/inacessível no escopo; 409 conflito de estado/identidade/hash; 412 revisão divergente; 428 precondição ausente; 413 corpo excessivo; 415 JSON exigido; 429 limite com Retry-After; 431 cabeçalhos excessivos; 503 indisponibilidade/aceitação não comprovada. Todos retornam ErrorResponse: code, message em português, request_id e opcionais field_errors/resource/operation_id/facts/affected_requirements/recovery. A UI mostra causa e próxima ação; códigos/diagnóstico extenso ficam em Registros. Efeito durável desconhecido pode constar da operação como unknown; não convertê-lo em falha definitiva por timeout.

**Catálogo das rotas existentes, com deltas V3 incorporados nos schemas de escrita/leitura afetados.** As fichas também identificam o consumidor e as tabelas consultadas. Rotas sem alteração funcional são incluídas para fechar o percurso e não autorizam features novas.

#### E01 — GET /api/v1/attempts/:attemptId/measurements

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/measurements` |
| Descricao | Mede atividade/espera observadas por passagem e etapa, com prazo somente configurado; dados insuficientes permanecem indisponíveis. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 200: `HttpAttemptMeasurements` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptStageSummary / useAttempt |
| Tabelas consultadas | passage_measurements, attempt_stage_intervals, passages |

#### E02 — GET /api/v1/attempts/:attemptId/questions/:questionId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/questions/:questionId` |
| Descricao | Consulta pergunta e estado de resposta da passagem/tentativa correta, com ETag para resposta concorrente. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `QuestionParams`; query `EmptyQuery` |
| Response Body | 200: `HttpQuestion` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | QuestionDecisionCard / useDecision |
| Tabelas consultadas | execution_questions, passages, operation_requests |

#### E03 — POST /api/v1/attempts/:attemptId/questions/:questionId/answer

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/questions/:questionId/answer` |
| Descricao | Registra resposta explícita à pergunta e entrega somente à passagem vinculada. Com `action=end_attempt`, registra a resposta e cancela a tentativa atomicamente, impede novas etapas e solicita parada dos recursos, sem reenviar a resposta como instrução de continuação. Recibo de encerramento lógico não comprova parada física. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpAnswerQuestion` (JSON Schema abaixo) |
| Params / Query | Params `QuestionParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | QuestionDecisionCard / useDecision |
| Tabelas consultadas | execution_questions, passages, operation_requests |

#### E04 — GET /api/v1/attempts/:attemptId/rounds

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/rounds` |
| Descricao | Lista rodadas, entregas/referências, passagens produtoras e revisões históricas da tentativa. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 200: `HttpRoundHistory` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttempt |
| Tabelas consultadas | attempts, attempt_criteria, rounds, passages, passage_results, criterion_results e projeções de detalhe sob demanda |

#### E05 — POST /api/v1/attempts

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts` |
| Descricao | Inicia tentativa explicitamente autorizada a partir de preparação/revisão/hash atuais; reconfere prontidão e barreira de encerramento também fora da UI. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpStartAttempt` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptListPanel / useAttemptSearch (GET); PreparationDialog / useAttemptActions (POST) |
| Tabelas consultadas | attempts, attempt_criteria, rounds, passages, passage_results, criterion_results e projeções de detalhe sob demanda |

#### E06 — GET /api/v1/attempts

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts` |
| Descricao | Pesquisa histórico completo com filtros AND antes da paginação; título/número capturados e período de início no fuso informado. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpAttemptListQuery` |
| Response Body | 200: `HttpAttemptPage` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptListPanel / useAttemptSearch (GET); PreparationDialog / useAttemptActions (POST) |
| Tabelas consultadas | attempts, attempt_criteria, rounds, passages, passage_results, criterion_results e projeções de detalhe sob demanda |

#### E07 — GET /api/v1/attempts/:attemptId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId` |
| Descricao | Consulta resumo da tentativa, bloqueio/resultado/etapa e página de detalhes da seção selecionada; não lê capturas/logs completos por linha da lista. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `AttemptParams`; query `HttpAttemptDetailQuery` |
| Response Body | 200: `HttpAttemptDetail` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttempt |
| Tabelas consultadas | attempts, attempt_criteria, rounds, passages, passage_results, criterion_results e projeções de detalhe sob demanda |

#### E08 — GET /api/v1/deliveries/:deliveryId/review

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/deliveries/:deliveryId/review` |
| Descricao | Consulta parecer independente da versão, critérios, achados/resoluções e referências de progresso/contestação; null quando ainda não há revisão. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `DeliveryParams`; query `EmptyQuery` |
| Response Body | 200: `Route08Response200` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / DeliverySummary / useDelivery |
| Tabelas consultadas | reviews, findings, finding_resolutions, finding_assessments, finding_disputes, criterion_results |

#### E09 — GET /api/v1/deliveries/:deliveryId/producer-result

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/deliveries/:deliveryId/producer-result` |
| Descricao | Consulta resultado estruturado aceito do Implementador, justificativas de alterações adicionais e respostas/contestações vinculadas; texto não é aprovação. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `DeliveryParams`; query `EmptyQuery` |
| Response Body | 200: `HttpProducerResult` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / DeliverySummary / useDelivery |
| Tabelas consultadas | deliveries, capture_runs, capture_warnings, passage_results, reviews, effects |

#### E12 — GET /api/v1/deliveries/:deliveryId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/deliveries/:deliveryId` |
| Descricao | Consulta entrega fixa e resumo único com aprovação, efeitos/recibos, destino e pendências; detalhes por seção sob demanda. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `DeliveryParams`; query `HttpDeliveryDetailQuery` |
| Response Body | 200: `HttpDeliveryDetail` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / DeliverySummary / useDelivery |
| Tabelas consultadas | deliveries, capture_runs, capture_warnings, passage_results, reviews, effects |

#### E13 — GET /api/v1/deliveries/:deliveryId/diff

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/deliveries/:deliveryId/diff` |
| Descricao | Consulta diff da referência imutável da entrega contra a base autorizada, limitado/paginado conforme query; não recaptura checkout mutável. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `DeliveryParams`; query `HttpDeliveryDiffQuery` |
| Response Body | 200: `HttpDeliveryDiff` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / DeliverySummary / useDelivery |
| Tabelas consultadas | deliveries, capture_runs, capture_warnings, passage_results, reviews, effects |

#### E14 — POST /api/v1/attempts/:attemptId/deliveries/:deliveryId/capture/retry

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/deliveries/:deliveryId/capture/retry` |
| Descricao | Repete captura explicitamente autorizada do resultado produtor existente, preservando identidade da operação e evitando outra entrega duplicada. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpCaptureRetry` (JSON Schema abaixo) |
| Params / Query | Params `CaptureRetryParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / DeliverySummary / useDelivery |
| Tabelas consultadas | deliveries, capture_runs, capture_warnings, passage_results, reviews, effects |

#### E15 — GET /api/v1/events

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/events` |
| Descricao | Consulta eventos paginados por contexto/cursor; conteúdo técnico somente quando solicitado, sem substituir busca de tentativas. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpEventListQuery` |
| Response Body | 200: `HttpEventPage` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | RecordsPanel / useRecords |
| Tabelas consultadas | events e projeções escalares de contexto |

#### E16 — GET /api/v1/events/stream

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/events/stream` |
| Descricao | Abre SSE autenticado; retoma cursor/Last-Event-ID, emite controller-event e sinaliza resync; heartbeat não comprova trabalho de executor. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpEventStreamQuery` |
| Response Body | 200: `SSE HttpControllerEventFrame` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AppShell / EventConnectionStatus / useControllerEvents / useLocalNotifications |
| Tabelas consultadas | events e projeções escalares de contexto |

#### E17 — GET /api/v1/operation

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/operation` |
| Descricao | Consulta resumo operacional leve: conta/host, automação, tentativa ativa, candidatos, resultados recentes, impedimentos e observação da integração. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpOperationSummaryQuery` |
| Response Body | 200: `HttpOperationSummary` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | DashboardPanel / useActiveAttempt |
| Tabelas consultadas | controller_authority, factory_settings, attempts, queue_cycles, events |

#### E18 — GET /api/v1/diagnostics

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/diagnostics` |
| Descricao | Consulta diagnósticos/reports do contexto e observações de ferramentas sem produzir validação/efeito de domínio por GET. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpDiagnosticContext` |
| Response Body | 200: `HttpDiagnosticsView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | InitialSetupDialog / diagnóstico / useOnboarding |
| Tabelas consultadas | factory_settings, diagnostic_runs, operation_requests e projeções do contexto |

#### E19 — POST /api/v1/diagnostics

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/diagnostics` |
| Descricao | Aceita diagnóstico explícito por checks/contexto/ferramentas e registra observação/instante/causa/próxima ação; localizar executável não confirma conexão. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpDiagnosticChecks` (JSON Schema abaixo) |
| Params / Query | query `HttpDiagnosticContext` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | InitialSetupDialog / diagnóstico / useOnboarding |
| Tabelas consultadas | factory_settings, diagnostic_runs, operation_requests e projeções do contexto |

#### E20 — GET /api/v1/projects/:projectId/issues

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects/:projectId/issues` |
| Descricao | Consulta opções paginadas de issues do repositório do projeto para preparar trabalho; não inicia nem move Status por leitura. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ProjectParams`; query `CatalogQuery` |
| Response Body | 200: `IssueOptions` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | PreparationDialog / usePreparation |
| Tabelas consultadas | projects, project_revisions, accounts e configurações |

#### E21 — POST /api/v1/projects/:projectId/preparations

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/projects/:projectId/preparations` |
| Descricao | Cria preparação editável com issue, escolhas, intenção publication_target e revisão de configuração; salva intenção sem clonar/iniciar ou conceder autoridade operacional. O resumo/hash inclui a intenção e os efeitos apresentados para futuro início explícito. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `PreparationChoices` (JSON Schema abaixo) |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 201: `PreparationCreated` |
| Status Codes | 201; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | PreparationDialog / usePreparation |
| Tabelas consultadas | preparations, preparation_revisions, projects, project_revisions |

#### E22 — GET /api/v1/preparations/:preparationId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/preparations/:preparationId` |
| Descricao | Consulta preparação e revisão/validações vigentes, incluindo publication_target e hash do resumo apresentado para futuro início; legado sem intenção retorna null, sem alteração persistida ou clonagem por leitura. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `PreparationParams`; query `EmptyQuery` |
| Response Body | 200: `PreparationView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | PreparationDialog / usePreparation |
| Tabelas consultadas | preparations, preparation_revisions, projects, project_revisions |

#### E23 — PUT /api/v1/preparations/:preparationId

| Campo | Valor |
| --- | --- |
| Metodo | PUT |
| Path | `/api/v1/preparations/:preparationId` |
| Descricao | Atualiza escolhas e intenção publication_target da preparação por ETag/operação idempotente; mudança/limpeza cria revisão e invalida hash anterior, preserva histórico/rascunho e não clona. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `PreparationUpdate` (JSON Schema abaixo) |
| Params / Query | Params `PreparationParams`; query `EmptyQuery` |
| Response Body | 200: `PreparationCreated` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | PreparationDialog / usePreparation |
| Tabelas consultadas | preparations, preparation_revisions, projects, project_revisions |

#### E24 — GET /api/v1/projects/:projectId/deletion-preview

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects/:projectId/deletion-preview` |
| Descricao | Produz preview dos destinos principais, digest do inventário, identidades, bloqueios e capacidade de confirmar; não exclui arquivos. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 200: `DeletionPreview` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectDeletionDialog / useProjectDeletion |
| Tabelas consultadas | projects, project_revisions, project_deletions, project_deletion_targets, project_deletion_receipts, operation_requests; inventário de todos os vínculos exclusivos |

#### E25 — POST /api/v1/projects/:projectId/deletion

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/projects/:projectId/deletion` |
| Descricao | Aceita exclusão explicitamente confirmada do inventário/digest/revisão apresentados, inclusive com trabalho pendente. A autorização durável precede o encerramento automático dos recursos próprios; as barreiras de parada e segurança são verificadas pelo worker antes da remoção. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `DeletionConfirmation` (JSON Schema abaixo) |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 200: `DeletionStatus`; 202: `DeletionStatus` |
| Status Codes | 200, 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectDeletionDialog / useProjectDeletion |
| Tabelas consultadas | projects, project_revisions, project_deletions, project_deletion_targets, project_deletion_receipts, operation_requests; inventário de todos os vínculos exclusivos |

#### E26 — GET /api/v1/project-deletions/:operation_id

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/project-deletions/:operation_id` |
| Descricao | Consulta exclusão, destinos/impedimentos e recibo terminal, inclusive após remoção dos dados do projeto; parcial não é sucesso. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `Route26Params`; query `EmptyQuery` |
| Response Body | 200: `DeletionStatus` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectDeletionDialog / useProjectDeletion |
| Tabelas consultadas | projects, project_revisions, project_deletions, project_deletion_targets, project_deletion_receipts, operation_requests; inventário de todos os vínculos exclusivos |

#### E27 — POST /api/v1/project-deletions/:operation_id/resume

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/project-deletions/:operation_id/resume` |
| Descricao | Retoma exclusão parcial com autorização/identidades/geração atuais, reconciliando destinos antes de remover novamente. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `DeletionResume` (JSON Schema abaixo) |
| Params / Query | Params `Route27Params`; query `EmptyQuery` |
| Response Body | 200: `DeletionStatus`; 202: `DeletionStatus` |
| Status Codes | 200, 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectDeletionDialog / useProjectDeletion |
| Tabelas consultadas | projects, project_revisions, project_deletions, project_deletion_targets, project_deletion_receipts, operation_requests; inventário de todos os vínculos exclusivos |

#### E28 — GET /api/v1/projects

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects` |
| Descricao | Lista projetos cadastrados em página leve no escopo atual, sem confundir cadastro com prontidão. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `CatalogQuery` |
| Response Body | 200: `ProjectPage` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectsPanel / ProjectForm / ProjectReadiness / useProjects |
| Tabelas consultadas | projects, project_revisions, accounts e configurações |

#### E29 — POST /api/v1/projects

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/projects` |
| Descricao | Cadastra existente local ou por URL, inclusive incompleto, sem criar remoto/quadro nem habilitar execução por esse ato. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `ProjectRegistration` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 201: `ProjectRegistered` |
| Status Codes | 201; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectsPanel / ProjectForm / ProjectReadiness / useProjects |
| Tabelas consultadas | projects, project_revisions, accounts e configurações |

#### E30 — GET /api/v1/projects/:projectId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects/:projectId` |
| Descricao | Consulta identidade/cadastro e prontidão do projeto, revisão e ações pertinentes aos requisitos ausentes. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 200: `ProjectDetail` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectsPanel / ProjectForm / ProjectReadiness / useProjects |
| Tabelas consultadas | projects, project_revisions, accounts e configurações |

#### E31 — GET /api/v1/settings

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/settings` |
| Descricao | Consulta configuração global, perfis, onboarding e preferências revalidáveis de ferramentas, sem devolver segredos. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `SettingsView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ConfigurationPanel / ProfilesPanel / useConfiguration |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E32 — GET /api/v1/settings/github-options

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/settings/github-options` |
| Descricao | Consulta conta GitHub observada e opções/capacidades de configuração da integração; observação não cria vínculo inicial. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `GitHubSetupOptions` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | GitHubSetupPanel / useGitHubSetup |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E33 — GET /api/v1/settings/execution-options

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/settings/execution-options` |
| Descricao | Consulta catálogo efetivo do executor/provider/modelo/esforço para seleção dos perfis, sem fallback silencioso. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `ExecutionCatalog` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | InitialSetupDialog / ProfileForm / useOnboarding |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E34 — PUT /api/v1/settings

| Campo | Valor |
| --- | --- |
| Metodo | PUT |
| Path | `/api/v1/settings` |
| Descricao | Salva configuração/perfis/instruções e preferências de ferramentas por revisão/idempotência; novas tentativas usam nova composição, histórico permanece capturado. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `SettingsUpdate` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `SettingsSaved` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ConfigurationPanel / ProfilesPanel / useConfiguration |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E35 — POST /api/v1/settings/selections

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/settings/selections` |
| Descricao | Abre seleção nativa por tipo permitido e retorna caminho absoluto/cancelamento; seleção não autoriza clone, execução ou publicação. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `NativeSelectionRequest` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `NativeSelectionResult` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | InitialSetupDialog / DeliveryTargetFields / useNativeSelection |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E36 — GET /api/v1/projects/:projectId/configuration

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects/:projectId/configuration` |
| Descricao | Consulta revisão atual do projeto, perfis/configuração global, prontidão e localizações/plano de transição; revisão histórica fica preservada. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 200: `ConfigurationView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectsPanel / ProjectForm / ProjectReadiness / useProjects |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E37 — PUT /api/v1/projects/:projectId/configuration

| Campo | Valor |
| --- | --- |
| Metodo | PUT |
| Path | `/api/v1/projects/:projectId/configuration` |
| Descricao | Salva nova revisão de configuração do projeto e alterações autorizadas correlatas; mapeamento V3 exige cinco opções distintas, sem reescrever revisão legada. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `ConfigurationUpdate` (JSON Schema abaixo) |
| Params / Query | Params `ProjectParams`; query `EmptyQuery` |
| Response Body | 200: `ConfigurationSaved` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectsPanel / ProjectForm / ProjectReadiness / useProjects |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E38 — GET /api/v1/projects/:projectId/configuration-options

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/projects/:projectId/configuration-options` |
| Descricao | Consulta repositórios/Projects/campos/opções/perfis pertinentes ao projeto com contexto e paginação; não infere Kanban válido só pela existência do Project. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ProjectParams`; query `ConfigurationOptionsQuery` |
| Response Body | 200: `ConfigurationOptions` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | GitHubSetupPanel / useGitHubSetup |
| Tabelas consultadas | factory_settings, accounts, execution_profiles, projects, project_revisions, diagnostic_runs; localizações no detalhe de projeto |

#### E39 — POST /api/v1/attempts/:attemptId/publication/authorize-upgrade

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/publication/authorize-upgrade` |
| Descricao | Registra autorização pelo clique dos efeitos restantes do hash atual, vinculada à entrega/destino/versão; preserva modo original e dispensa confirmação redundante. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpAuthorizeUpgrade` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | PublicationDialog / DeliveryContinuation / useDelivery |
| Tabelas consultadas | publication_requests, publication_upgrades, effects, delivery_targets, publication_target_selections, deliveries, reviews, attempt_authority, attempts |

#### E40 — POST /api/v1/attempts/:attemptId/publication/complete

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/publication/complete` |
| Descricao | Executa somente efeitos autorizados e restantes da versão aprovada; revalida Git/autoridade/destino, preserva checkout e retorna operação durável. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpCompletePublication` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | PublicationDialog / DeliveryContinuation / useDelivery |
| Tabelas consultadas | publication_requests, publication_upgrades, effects, delivery_targets, publication_target_selections, deliveries, reviews, attempt_authority, attempts |

#### E41 — POST /api/v1/attempts/:attemptId/publication/reconcile

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/publication/reconcile` |
| Descricao | Reconcilia identidades e recibos dos efeitos incertos antes de repetir; não presume ausência por timeout. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpReconcilePublication` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | PublicationDialog / DeliveryContinuation / useDelivery |
| Tabelas consultadas | publication_requests, publication_upgrades, effects, delivery_targets, publication_target_selections, deliveries, reviews, attempt_authority, attempts |

#### E42 — POST /api/v1/attempts/:attemptId/revalidate

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/revalidate` |
| Descricao | Revalida autoridade/contexto atuais da tentativa suspensa; reencontro não restaura conversa nem concede novo efeito automaticamente. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `EmptyBody` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | publication_requests, publication_upgrades, effects, delivery_targets, publication_target_selections, deliveries, reviews, attempt_authority, attempts |

#### E43 — GET /api/v1/queue

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/queue` |
| Descricao | Consulta fila Ready observada, elegibilidade/impedimentos e revisões; não habilita automação nem inicia issue por mover coluna. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `HttpQueueQuery` |
| Response Body | 200: `HttpQueueObservation` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | QueuePanel / useQueue |
| Tabelas consultadas | queue_cycles, queue_consumptions, projects, project_revisions, attempts, factory_settings |

#### E44 — PUT /api/v1/queue

| Campo | Valor |
| --- | --- |
| Metodo | PUT |
| Path | `/api/v1/queue` |
| Descricao | Altera explicitamente habilitação/ordenação de fila conforme comando existente e revisão; recusa configuração incompatível e mantém prontidão no backend. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpQueueCommand` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `HttpQueueSaved` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | QueuePanel / useQueue |
| Tabelas consultadas | queue_cycles, queue_consumptions, projects, project_revisions, attempts, factory_settings |

**Ordem residual da fila na V4.** `QueueOrder` contém somente `use_board_position`. Projetos são ordenados por ID. Dentro de cada projeto, posição do quadro crescente é usada somente quando a opção está ligada e todos os itens retornados daquele projeto têm posição documentada; em empate, número crescente e ID da issue/item desempata. Se a opção estiver desligada ou faltar posição em qualquer item, o fallback a número crescente (nulos por último) e ID aplica-se somente àquele projeto. A sequência efetiva continua compondo `summaryHash`, preservando elegibilidade, Ready, atribuição, consumo, ocupação e pausa. A interface conserva o texto existente da ordem e retira controles e referências numéricas; não acrescenta mensagens, rótulos, estados visuais ou explicações do fallback por projeto.

#### E45 — POST /api/v1/attempts/:attemptId/cancel

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/cancel` |
| Descricao | Registra cancelamento explícito, revoga coordenação/publicação e solicita parada pertinente sem declarar limpeza/parada física por inferência. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpCancelAttempt` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E46 — GET /api/v1/attempts/:attemptId/resources

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/resources` |
| Descricao | Consulta recursos próprios, sessão/terminal/ocupação observados e estados de parada/limpeza, mantendo incerteza após perda de vínculo. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `AttemptParams`; query `EmptyQuery` |
| Response Body | 200: `HttpAttemptResources` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E47 — GET /api/v1/attempts/:attemptId/resources/:resourceId/removal-plan

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/resources/:resourceId/removal-plan` |
| Descricao | Produz plano/hash de remoção de recurso próprio após conferir identidade/posse/parada e destinos; preview não remove. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ResourceParams`; query `EmptyQuery` |
| Response Body | 200: `HttpRemovalPlan` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E48 — POST /api/v1/attempts/:attemptId/resources/:resourceId/remove

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/resources/:resourceId/remove` |
| Descricao | Remove recurso explicitamente confirmado no plano vigente, com geração e parada comprovadas; preserva recursos ativos/incertos/manuais. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpRemoveResource` (JSON Schema abaixo) |
| Params / Query | Params `ResourceParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E49 — GET /api/v1/attempts/:attemptId/passages/:passageId/interaction

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/passages/:passageId/interaction` |
| Descricao | Consulta superfície real de interação vinculada à passagem e sessão do papel na tentativa, incluindo capacidade de abrir e continuidade observada. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `InteractionParams`; query `EmptyQuery` |
| Response Body | 200: `HttpPassageInteraction` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E50 — POST /api/v1/attempts/:attemptId/passages/:passageId/interaction/open

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/passages/:passageId/interaction/open` |
| Descricao | Abre superfície de interação existente pela identidade validada; não cria conversa apresentada como retomada nem transfere autoridade. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `EmptyBody` (JSON Schema abaixo) |
| Params / Query | Params `InteractionParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E51 — GET /api/v1/attempts/:attemptId/resources/:resourceId/folder

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/attempts/:attemptId/resources/:resourceId/folder` |
| Descricao | Consulta pasta/superfície de recurso próprio validado e capacidade de abertura nativa; não aceita caminho arbitrário. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `ResourceParams`; query `EmptyQuery` |
| Response Body | 200: `HttpFolderSurface` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E52 — POST /api/v1/attempts/:attemptId/resources/:resourceId/folder/open

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/resources/:resourceId/folder/open` |
| Descricao | Abre pasta validada pela superfície nativa com operação idempotente; abertura não equivale a integração de código. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `EmptyBody` (JSON Schema abaixo) |
| Params / Query | Params `ResourceParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptDetailDialog / useAttemptActions / recuperação |
| Tabelas consultadas | resources, passages, attempt_sessions, managed_terminals, terminal_occupancies, cancellation_requests, resource_removals, native_open_requests |

#### E53 — GET /api/v1/scaffold/options

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/scaffold/options` |
| Descricao | Consulta templates/conta/capacidades e única opção de nova criação completa remote_push, preservando catálogo distribuído. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `HttpScaffoldOptions` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectCreationDialog / useProjects |
| Tabelas consultadas | factory_settings, project_creations, creation_steps, creation_board_operations, creation_reconciliations, effects, projects, project_revisions, operation_requests |

#### E54 — POST /api/v1/scaffold/plans

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/scaffold/plans` |
| Descricao | Calcula plano obrigatório remoto/origin/push inicial/quadro/visualização e nome editável, sem executar seus efeitos; hash sela dados apresentados. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpScaffoldInput` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `HttpScaffoldPlanned` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectCreationDialog / useProjects |
| Tabelas consultadas | factory_settings, project_creations, creation_steps, creation_board_operations, creation_reconciliations, effects, projects, project_revisions, operation_requests |

#### E55 — POST /api/v1/scaffold/creations

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/scaffold/creations` |
| Descricao | Aceita execução do plano completo explicitamente autorizado; preserva criação parcial e recibos para retomada. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `HttpCreateScaffold` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectCreationDialog / useProjects |
| Tabelas consultadas | factory_settings, project_creations, creation_steps, creation_board_operations, creation_reconciliations, effects, projects, project_revisions, operation_requests |

#### E56 — GET /api/v1/scaffold/creations/:creationId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/scaffold/creations/:creationId` |
| Descricao | Consulta criação, etapas locais/remotas/quadro, identidades, revisão e próxima ação; conclusão só com efeitos obrigatórios verificados. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `CreationParams`; query `EmptyQuery` |
| Response Body | 200: `HttpCreationView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ProjectCreationDialog / useProjects |
| Tabelas consultadas | factory_settings, project_creations, creation_steps, creation_board_operations, creation_reconciliations, effects, projects, project_revisions, operation_requests |

#### E57 — POST /api/v1/scaffold/creations/:creationId/reconcile

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/scaffold/creations/:creationId/reconcile` |
| Descricao | Reconcilia criação parcial pela mesma identidade/recibos antes de repetir efeitos incertos; não duplica repositório/quadro/push. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `EmptyBody` (JSON Schema abaixo) |
| Params / Query | Params `CreationParams`; query `EmptyQuery` |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectCreationDialog / useProjects |
| Tabelas consultadas | factory_settings, project_creations, creation_steps, creation_board_operations, creation_reconciliations, effects, projects, project_revisions, operation_requests |

#### E58 — GET /api/v1/operations/:operationId

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/operations/:operationId` |
| Descricao | Consulta aceitação/resultado da operação idempotente original, com recibo/erro/progresso e estado unknown explícito; não reaplica comando. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | Params `OperationParams`; query `EmptyQuery` |
| Response Body | 200: `OperationViewWithDeletion` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | useOperation em todos os diálogos de comandos |
| Tabelas consultadas | operation_requests e diário específico da operação |

#### E59 — GET /api/v1/health

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/health` |
| Descricao | Consulta saúde técnica do controlador/storage e compatibilidade de schema; não comprova conexão Maestri/OMP, execução real ou efeito GitHub. |
| Auth | Não; exceção restrita com perímetro e limites |
| Request Body | Sem corpo |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `HealthResponse` |
| Status Codes | 200; E conforme condições comuns (dispensa sessão) |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | AppShell / useSession / EventConnectionStatus |
| Tabelas consultadas | schema_migrations e integridade técnica (consulta indireta storage.checkHealth) |

#### E60 — POST /api/v1/session

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/session` |
| Descricao | Cria/reutiliza sessão técnica local, entrega cookie HttpOnly e CSRF em memória; não identifica pessoa nem concede autoridade GitHub. |
| Auth | Não; exceção restrita com perímetro e limites |
| Request Body | `EmptyBody` (JSON Schema abaixo) |
| Params / Query | query `EmptyQuery` |
| Response Body | 200: `SessionResponse` |
| Status Codes | 200; E conforme condições comuns (dispensa 401/CSRF) |
| Headers | Origin, JSON, X-Factory-Client:web; Location/status_url em 202 |
| Consumidor frontend | AppShell / useSession / EventConnectionStatus |
| Tabelas consultadas | attempts, attempt_criteria, rounds, passages, passage_results, criterion_results e projeções de detalhe sob demanda |

**Rotas novas V3.** Fichas e schemas abaixo integram os mesmos módulos; não criam protocolo concorrente. As rotas de agente continuam exclusivamente no canal estruturado Maestri/OMP, nunca como endpoint HTTP que se passe por decisão humana.

#### V01 — POST /api/v1/attempts/:attemptId/publication/target

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/publication/target` |
| Descricao | Com tentativa/entrega existentes, seleciona/verifica clone correspondente ou executa clone explicitamente autorizado no destino escolhido. Pode referenciar a autorização de início capturada quando ela já descreveu exatamente esse clone, sem novo clique; não autoriza commit/push/PR. Resposta perdida exige consultar/reconciliar a mesma seleção. Não é chamado para salvar intenção antes da tentativa/entrega. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `SetPublicationTarget` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query vazia |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | DeliveryTargetFields / useDelivery |
| Tabelas consultadas | publication_target_selections, operation_requests, attempts, deliveries |

#### V02 — POST /api/v1/attempts/:attemptId/decisions

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/attempts/:attemptId/decisions` |
| Descricao | Escolha humana sobre bloqueio/revisão/versão atuais: orientação contextual, preparação sucessora com outro perfil ou encerramento explícito. Não inicia sucessora nem amplia limites. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `MakeAttemptDecision` (JSON Schema abaixo) |
| Params / Query | Params `AttemptParams`; query vazia |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AttemptBlockDecision / useDecision |
| Tabelas consultadas | attempt_decisions, finding_assessments, finding_disputes, attempts, preparations, preparation_revisions |

#### V03 — Comparação entre tentativas (retirada na V4)

GET autenticado `/api/v1/attempt-comparisons` não está registrado e recebe 404 pelo handler global, sem projeção ou redirecionamento. Busca US-21/RF-84/85, detalhe individual, rodadas, histórico, evidências e Nova tentativa permanecem.
#### V04 — GET /api/v1/shutdown

| Campo | Valor |
| --- | --- |
| Metodo | GET |
| Path | `/api/v1/shutdown` |
| Descricao | Consulta pausa/drenagem e trabalhos que impedem fechar; ETag da revisão. Se mais de 100, has_more/contagem mantêm bloqueio e detalhes são consultados pelas operações, sem inferir ausência. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | Sem corpo |
| Params / Query | query `ShutdownQuery` |
| Response Body | 200: `ShutdownView` |
| Status Codes | 200; E conforme condições comuns |
| Headers | ETag nas projeções mutáveis; no-store/nosniff; Location/status_url em 202 |
| Consumidor frontend | ShutdownDialog / useShutdown |
| Tabelas consultadas | factory_settings, operation_requests, attempts, resources e diários ativos/incertos |

#### V05 — POST /api/v1/shutdown

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/shutdown` |
| Descricao | Persiste pausa, drena para fechar quando ocioso ou aceita resume_starts (Retomar novos inícios): retira a pausa e revoga drenagem/fechamento ainda pendente, mantendo automação desligada. Não cancela, reinicia, publica ou remove tentativas/recursos; fechamento já comprometido recusa retomada antes de aceitar a operação. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `ShutdownCommand` (JSON Schema abaixo) |
| Params / Query | query vazia |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ShutdownDialog / useShutdown |
| Tabelas consultadas | factory_settings.automation_enabled, operation_requests, events e diários de trabalho |

#### V06 — POST /api/v1/notifications/claims

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/notifications/claims` |
| Descricao | Reserva evento elegível. send_allowed=true só para vencedor da inserção exclusiva; replay/concorrente/reservado/incerto nunca recebe novo direito de envio. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `ClaimNotification` (JSON Schema abaixo) |
| Params / Query | query vazia |
| Response Body | 200: `NotificationClaim` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AppShell / useLocalNotifications |
| Tabelas consultadas | notification_dispatches, events, execution_questions, operation_requests |

#### V07 — POST /api/v1/notifications/receipts

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/notifications/receipts` |
| Descricao | Registra resultado observado por revisão. Sem prova fica uncertain/unavailable, mantendo a pendência operacional original. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `RecordNotificationReceipt` (JSON Schema abaixo) |
| Params / Query | query vazia |
| Response Body | 200: `NotificationReceipt` |
| Status Codes | 200; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | AppShell / useLocalNotifications |
| Tabelas consultadas | notification_dispatches, operation_requests |

#### V08 — POST /api/v1/projects/:projectId/storage-transition

| Campo | Valor |
| --- | --- |
| Metodo | POST |
| Path | `/api/v1/projects/:projectId/storage-transition` |
| Descricao | Executa plano obtido na configuração, com hash/revisão/identidade e barreiras de atividade/efeitos/exclusão. Não aceita destino arbitrário do cliente. |
| Auth | Sim; sessão técnica + guardas do domínio |
| Request Body | `StorageTransitionCommand` (JSON Schema abaixo) |
| Params / Query | Params `ProjectParams`; query vazia |
| Response Body | 202: `OperationAccepted` |
| Status Codes | 202; E conforme condições comuns |
| Headers | Origin, JSON, X-CSRF-Token; Idempotency-Key nos comandos duráveis; If-Match sobre recurso existente; Location/status_url em 202 |
| Consumidor frontend | ProjectConfigurationDialog / useProjectStorage |
| Tabelas consultadas | project_storage_locations, project_storage_transitions, projects, resources, operation_requests |

**Catálogo completo dos schemas de entrada/saída.** JSON Schema expressa contrato, sem código de implementação. Definições `Http...` são a borda pública; formato privado capturado não é migrado por conversão HTTP. Schemas de leitura legada de criação podem conter os três modos históricos; somente novas entradas aceitam remote_push. Novas revisões de mapeamento exigem Backlog; leitura legada permanece distinguível e bloqueada para início V3 até adequação observada.

Definições locais `$defs`: required define campos obrigatórios, anyOf com null define nulabilidade, e limits/patterns são parte do contrato. Parâmetros de path mantêm os identificadores das rotas, distintos de campos de payload. Todos os schemas de fichas estão definidos abaixo.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "HttpAttemptMeasurements": {"additionalProperties":false,"type":"object","required":["active_time","human_wait","cost","active_limit","question_ttl","active_limit_state","active_expired_at_ms","passages","pending_requirements","stage_activity"],"properties":{"active_time":{"$ref":"#/$defs/MeasuredValue"},"human_wait":{"$ref":"#/$defs/MeasuredValue"},"cost":{"$ref":"#/$defs/MeasuredValue"},"active_limit":{"$ref":"#/$defs/ConfiguredLimit"},"question_ttl":{"$ref":"#/$defs/ConfiguredLimit"},"active_limit_state":{"anyOf":[{"const":"within_limit","type":"string"},{"const":"expired","type":"string"},{"const":"unavailable","type":"string"},{"const":"not_applicable","type":"string"}]},"active_expired_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"passages":{"maxItems":12,"type":"array","items":{"$ref":"#/$defs/HttpPassageMeasurements"}},"pending_requirements":{"maxItems":10,"type":"array","items":{"additionalProperties":false,"type":"object","required":["cause","affected_requirements","pending"],"properties":{"cause":{"type":"string"},"affected_requirements":{"type":"array","items":{"type":"string"}},"pending":{"type":"string"}}}},"stage_activity":{"$ref":"#/$defs/StageActivity"}}},
    "ErrorResponse": {"additionalProperties":false,"type":"object","required":["code","message","request_id"],"properties":{"code":{"minLength":1,"maxLength":128,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"},"request_id":{"minLength":1,"maxLength":128,"type":"string"},"field_errors":{"maxItems":100,"type":"array","items":{"additionalProperties":false,"type":"object","required":["field","message"],"properties":{"field":{"minLength":1,"maxLength":256,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"}}}},"resource":{"$ref":"#/$defs/OperationResource"},"operation_id":{"$ref":"#/$defs/OperationId"},"facts":{"type":"object","patternProperties":{"^(.*)$":{"anyOf":[{"maxLength":2048,"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}},"affected_requirements":{"maxItems":100,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}},"recovery":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "EmptyQuery": {"additionalProperties":false,"type":"object","properties":{}},
    "AttemptParams": {"additionalProperties":false,"type":"object","required":["attemptId"],"properties":{"attemptId":{"$ref":"#/$defs/OperationId"}}},
    "HttpQuestion": {"additionalProperties":false,"type":"object","required":["id","attempt_id","passage_id","delivery_id","question","scope_change","state","revision","raised_at_ms","answered_at_ms","ttl","expired_at_ms","answer","answer_operation_id","delivery_receipt"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"question":{"$ref":"#/$defs/HttpExecutionQuestion"},"scope_change":{"anyOf":[{"$ref":"#/$defs/HttpScopeChange"},{"type":"null"}]},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"answer_recorded","type":"string"},{"const":"sending","type":"string"},{"const":"delivered","type":"string"},{"const":"delivery_unknown","type":"string"},{"const":"expired","type":"string"},{"const":"cancelled","type":"string"}]},"revision":{"minimum":1,"type":"integer"},"raised_at_ms":{"minimum":0,"type":"integer"},"answered_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"ttl":{"$ref":"#/$defs/ConfiguredLimit"},"expired_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"answer":{"anyOf":[{"maxLength":8192,"type":"string"},{"type":"null"}]},"answer_operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"delivery_receipt":{"anyOf":[{"additionalProperties":false,"type":"object","required":["operation_id","question_id","passage_id","received_at_ms"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"question_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"received_at_ms":{"minimum":0,"type":"integer"}}},{"type":"null"}]}}},
    "QuestionParams": {"additionalProperties":false,"type":"object","required":["attemptId","questionId"],"properties":{"attemptId":{"$ref":"#/$defs/OperationId"},"questionId":{"$ref":"#/$defs/OperationId"}}},
    "OperationAccepted": {"additionalProperties":false,"type":"object","required":["operation_id","resource","status_url","request_id"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"resource":{"$ref":"#/$defs/OperationResource"},"status_url":{"minLength":1,"maxLength":512,"type":"string"},"receipt":{"$ref":"#/$defs/OperationReceipt"},"request_id":{"minLength":1,"maxLength":128,"type":"string"}}},
    "HttpAnswerQuestion": {"additionalProperties":false,"type":"object","required":["answer"],"properties":{"action":{"const":"end_attempt","type":"string"},"answer":{"minLength":1,"maxLength":8192,"pattern":".*\\S.*","type":"string"},"scope_choice":{"anyOf":[{"const":"keep_captured","type":"string"},{"const":"adopt_new","type":"string"}]}}},
    "HttpRoundHistory": {"additionalProperties":false,"type":"object","required":["entries"],"properties":{"entries":{"maxItems":6,"type":"array","items":{"additionalProperties":false,"type":"object","required":["round","delivery_id","producer_passage_id","producer_receipt_id","review_id","review_state","content_identity"],"properties":{"round":{"minimum":1,"maximum":6,"type":"integer"},"delivery_id":{"$ref":"#/$defs/OperationId"},"producer_passage_id":{"$ref":"#/$defs/OperationId"},"producer_receipt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"review_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"review_state":{"anyOf":[{"type":"null"},{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"content_identity":{"anyOf":[{"type":"null"},{"type":"string"}]}}}}}},
    "HttpStartAttempt": {"additionalProperties":false,"type":"object","required":["preparation_id","preparation_revision","authorized_summary_hash","authorized"],"properties":{"preparation_id":{"$ref":"#/$defs/OperationId"},"preparation_revision":{"minimum":1,"type":"integer"},"authorized_summary_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"authorized":{"const":true,"type":"boolean"}}},
    "HttpAttemptPage": {"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor","search_context"],"properties":{"items":{"maxItems":100,"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","project_id","issue_id","issue_number","phase","result","suspension","revision","created_at_ms","updated_at_ms","issue_title"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"issue_id":{"type":"string"},"issue_number":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"issue_title":{"anyOf":[{"type":"string","maxLength":65536},{"type":"null"}]},"phase":{"anyOf":[{"const":"preparing","type":"string"},{"const":"implementing","type":"string"},{"const":"verifying","type":"string"},{"const":"reviewing","type":"string"},{"const":"publishing","type":"string"},{"const":"finished","type":"string"}]},"result":{"anyOf":[{"type":"null"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},"suspension":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"revision":{"type":"integer"},"created_at_ms":{"type":"integer"},"updated_at_ms":{"type":"integer"}}}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"search_context":{"$ref":"#/$defs/AttemptSearchContext"}}},
    "HttpAttemptListQuery": {"additionalProperties":false,"type":"object","properties":{"cursor":{"minLength":1,"maxLength":2048,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"},"project_id":{"$ref":"#/$defs/OperationId"},"result":{"anyOf":[{"const":"active","type":"string"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},"issue_number":{"type":"string","pattern":"^[1-9][0-9]*$","maxLength":16},"issue_title":{"type":"string","minLength":1,"maxLength":256},"start_date":{"type":"string","format":"date"},"end_date":{"type":"string","format":"date"},"time_zone":{"type":"string","minLength":1,"maxLength":128}},"required":[]},
    "HttpAttemptDetail": {"additionalProperties":false,"type":"object","required":["id","project_id","operation_id","passage_id","round","phase","result","suspension","tracking","diagnostic","result_receipt_id","delivery_id","revision","event_cursor","expected_account_id","issue","selected_delivery_id","selected_round","publication","measurements","cleanup","authority","capabilities","details","stage_activity","delivery_summary","block","v3_details","publication_target","publication_target_hash"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"operation_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"round":{"minimum":1,"maximum":6,"type":"integer"},"phase":{"anyOf":[{"const":"preparing","type":"string"},{"const":"implementing","type":"string"},{"const":"verifying","type":"string"},{"const":"reviewing","type":"string"},{"const":"publishing","type":"string"},{"const":"finished","type":"string"}]},"result":{"anyOf":[{"type":"null"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},"suspension":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"tracking":{"anyOf":[{"const":"pending","type":"string"},{"const":"tracked","type":"string"},{"const":"lost","type":"string"}]},"diagnostic":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"result_receipt_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"delivery_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"pending_question_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"revision":{"minimum":1,"type":"integer"},"event_cursor":{"pattern":"^[0-9]+$","type":"string"},"expected_account_id":{"maxLength":256,"type":"string"},"issue":{"$ref":"#/$defs/HttpIssueHeader"},"selected_delivery_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"selected_round":{"minimum":1,"maximum":6,"type":"integer"},"publication":{"$ref":"#/$defs/HttpPublicationSummary"},"measurements":{"additionalProperties":false,"type":"object","required":["active_time","human_wait","cost","active_limit","question_ttl","active_limit_state","active_expired_at_ms","passages","pending_requirements"],"properties":{"active_time":{"$ref":"#/$defs/MeasuredValue"},"human_wait":{"$ref":"#/$defs/MeasuredValue"},"cost":{"$ref":"#/$defs/MeasuredValue"},"active_limit":{"$ref":"#/$defs/ConfiguredLimit"},"question_ttl":{"$ref":"#/$defs/ConfiguredLimit"},"active_limit_state":{"anyOf":[{"const":"within_limit","type":"string"},{"const":"expired","type":"string"},{"const":"unavailable","type":"string"},{"const":"not_applicable","type":"string"}]},"active_expired_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"passages":{"maxItems":12,"type":"array","items":{"$ref":"#/$defs/HttpPassageMeasurements"}},"pending_requirements":{"maxItems":10,"type":"array","items":{"additionalProperties":false,"type":"object","required":["cause","affected_requirements","pending"],"properties":{"cause":{"type":"string"},"affected_requirements":{"type":"array","items":{"type":"string"}},"pending":{"type":"string"}}}}}},"cleanup":{"anyOf":[{"const":"pending","type":"string"},{"const":"complete","type":"string"},{"const":"uncertain","type":"string"}]},"authority":{"anyOf":[{"additionalProperties":false,"type":"object","required":["reason","expected_status_id","observed_status_id","observed_at_ms","recovery"],"properties":{"reason":{"anyOf":[{"maxLength":4096,"type":"string"},{"type":"null"}]},"expected_status_id":{"anyOf":[{"maxLength":4096,"type":"string"},{"type":"null"}]},"observed_status_id":{"anyOf":[{"maxLength":4096,"type":"string"},{"type":"null"}]},"observed_at_ms":{"type":"integer"},"recovery":{"maxLength":4096,"type":"string"}}},{"type":"null"}]},"capabilities":{"additionalProperties":false,"type":"object","required":["cancel","complete_publication","reconcile_publication","revalidate"],"properties":{"cancel":{"$ref":"#/$defs/Capability"},"complete_publication":{"$ref":"#/$defs/Capability"},"reconcile_publication":{"$ref":"#/$defs/Capability"},"revalidate":{"$ref":"#/$defs/Capability"}}},"details":{"anyOf":[{"$ref":"#/$defs/HttpDetailPage"},{"type":"null"}]},"stage_activity":{"$ref":"#/$defs/StageActivity"},"delivery_summary":{"anyOf":[{"$ref":"#/$defs/DeliverySummaryView"},{"type":"null"}]},"block":{"$ref":"#/$defs/AttemptBlock"},"v3_details":{"anyOf":[{"$ref":"#/$defs/AttemptV3DetailPage"},{"type":"null"}]},"publication_target":{"anyOf":[{"$ref":"#/$defs/PublicationTargetIntent"},{"type":"null"}]},"publication_target_hash":{"anyOf":[{"type":"string","pattern":"^[a-f0-9]{64}$"},{"type":"null"}]}}},
    "HttpAttemptDetailQuery": {"additionalProperties":false,"type":"object","properties":{"cursor":{"minLength":1,"maxLength":2048,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"},"round_id":{"pattern":"^[1-6]$","type":"string"},"delivery_id":{"$ref":"#/$defs/OperationId"},"section":{"anyOf":[{"const":"rounds","type":"string"},{"const":"passages","type":"string"},{"const":"criteria","type":"string"},{"const":"reviews","type":"string"},{"const":"findings","type":"string"},{"const":"questions","type":"string"},{"const":"effects","type":"string"},{"const":"resources","type":"string"},{"type":"string","const":"decisions"},{"type":"string","const":"profiles"},{"type":"string","const":"finding_assessments"},{"type":"string","const":"finding_disputes"},{"type":"string","const":"target_selections"}]}}},
    "Route08Response200": {"anyOf":[{"$ref":"#/$defs/HttpReview"},{"type":"null"}]},
    "DeliveryParams": {"additionalProperties":false,"type":"object","required":["deliveryId"],"properties":{"deliveryId":{"$ref":"#/$defs/OperationId"}}},
    "HttpProducerResult": {"anyOf":[{"type":"null"},{"additionalProperties":false,"type":"object","required":["binding","result","sha256","receipt_id"],"properties":{"binding":{"$ref":"#/$defs/HttpPassageBinding"},"result":{"$ref":"#/$defs/HttpImplementerResult"},"sha256":{"pattern":"^[a-f0-9]{64}$","type":"string"},"receipt_id":{"$ref":"#/$defs/OperationId"}}}]},
    "HttpDeliveryDetail": {"additionalProperties":false,"type":"object","required":["delivery","event_cursor","issue","attempt","measurements","cleanup","authorizations","review","publication","capabilities","details","delivery_summary","v3_details"],"properties":{"delivery":{"$ref":"#/$defs/HttpDelivery"},"event_cursor":{"type":"string"},"issue":{"$ref":"#/$defs/HttpIssueHeader"},"attempt":{"$ref":"#/$defs/HttpAttemptStatus"},"measurements":{"additionalProperties":false,"type":"object","required":["active_time","human_wait","cost","active_limit","question_ttl","active_limit_state","active_expired_at_ms","passages","pending_requirements"],"properties":{"active_time":{"$ref":"#/$defs/MeasuredValue"},"human_wait":{"$ref":"#/$defs/MeasuredValue"},"cost":{"$ref":"#/$defs/MeasuredValue"},"active_limit":{"$ref":"#/$defs/ConfiguredLimit"},"question_ttl":{"$ref":"#/$defs/ConfiguredLimit"},"active_limit_state":{"anyOf":[{"const":"within_limit","type":"string"},{"const":"expired","type":"string"},{"const":"unavailable","type":"string"},{"const":"not_applicable","type":"string"}]},"active_expired_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"passages":{"maxItems":12,"type":"array","items":{"$ref":"#/$defs/HttpPassageMeasurements"}},"pending_requirements":{"maxItems":10,"type":"array","items":{"additionalProperties":false,"type":"object","required":["cause","affected_requirements","pending"],"properties":{"cause":{"type":"string"},"affected_requirements":{"type":"array","items":{"type":"string"}},"pending":{"type":"string"}}}}}},"cleanup":{"anyOf":[{"const":"pending","type":"string"},{"const":"complete","type":"string"},{"const":"uncertain","type":"string"}]},"authorizations":{"additionalProperties":false,"type":"object","required":["captured_mode","authorized_mode","requires_current_gate"],"properties":{"captured_mode":{"$ref":"#/$defs/DeliveryMode"},"authorized_mode":{"$ref":"#/$defs/DeliveryMode"},"requires_current_gate":{"const":true,"type":"boolean"}}},"review":{"anyOf":[{"$ref":"#/$defs/HttpReviewSummary"},{"type":"null"}]},"publication":{"$ref":"#/$defs/HttpPublicationSummary"},"capabilities":{"additionalProperties":false,"type":"object","required":["diff","complete_publication","reconcile_publication"],"properties":{"diff":{"$ref":"#/$defs/Capability"},"complete_publication":{"$ref":"#/$defs/Capability"},"reconcile_publication":{"$ref":"#/$defs/Capability"}}},"details":{"anyOf":[{"$ref":"#/$defs/HttpDetailPage"},{"type":"null"}]},"delivery_summary":{"$ref":"#/$defs/DeliverySummaryView"},"v3_details":{"anyOf":[{"$ref":"#/$defs/AttemptV3DetailPage"},{"type":"null"}]}}},
    "HttpDeliveryDetailQuery": {"additionalProperties":false,"type":"object","properties":{"cursor":{"minLength":1,"maxLength":2048,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"},"section":{"$ref":"#/$defs/HttpDetailSection"}}},
    "HttpDeliveryDiff": {"additionalProperties":false,"type":"object","required":["delivery_id","base_sha","content_identity","entries","next_cursor","has_more"],"properties":{"delivery_id":{"$ref":"#/$defs/OperationId"},"base_sha":{"$ref":"#/$defs/HttpGitObjectId"},"content_identity":{"$ref":"#/$defs/HttpGitObjectId"},"entries":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpDiffEntry"}},"next_cursor":{"anyOf":[{"type":"null"},{"type":"string"}]},"has_more":{"type":"boolean"}}},
    "HttpDeliveryDiffQuery": {"additionalProperties":false,"type":"object","properties":{"cursor":{"minLength":1,"maxLength":1024,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"}}},
    "HttpCaptureRetry": {"additionalProperties":false,"type":"object","required":["producer_passage_id"],"properties":{"producer_passage_id":{"$ref":"#/$defs/OperationId"}}},
    "CaptureRetryParams": {"additionalProperties":false,"type":"object","required":["attemptId","deliveryId"],"properties":{"attemptId":{"$ref":"#/$defs/OperationId"},"deliveryId":{"$ref":"#/$defs/OperationId"}}},
    "HttpEventPage": {"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor"],"properties":{"items":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpControllerEvent"}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "HttpEventListQuery": {"additionalProperties":false,"type":"object","properties":{"include_technical":{"anyOf":[{"const":"true","type":"string"},{"const":"false","type":"string"}]},"cursor":{"pattern":"^[A-Za-z0-9_-]+$","minLength":1,"maxLength":256,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpEventStreamQuery": {"additionalProperties":false,"type":"object","properties":{"cursor":{"maxLength":256,"type":"string"},"project_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"operation_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpOperationSummary": {"additionalProperties":false,"type":"object","required":["account","host","automation","active_attempt","active_attempt_count","next_candidates","candidate_observation","recent_results","impediments","integration_status","event_cursor"],"properties":{"account":{"additionalProperties":false,"type":"object","required":["id","login","observed_id","observed_at_ms"],"properties":{"id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"login":{"anyOf":[{"minLength":1,"maxLength":100,"type":"string"},{"type":"null"}]},"observed_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"observed_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]}}},"host":{"additionalProperties":false,"type":"object","required":["designated","current","matches"],"properties":{"designated":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"current":{"minLength":1,"maxLength":256,"type":"string"},"matches":{"type":"boolean"}}},"automation":{"additionalProperties":false,"type":"object","required":["enabled","dispatch_paused","project_enabled"],"properties":{"enabled":{"type":"boolean"},"dispatch_paused":{"type":"boolean"},"project_enabled":{"anyOf":[{"type":"boolean"},{"type":"null"}]}}},"active_attempt":{"anyOf":[{"$ref":"#/$defs/HttpAttemptSummary"},{"type":"null"}]},"active_attempt_count":{"minimum":0,"type":"integer"},"next_candidates":{"maxItems":5,"type":"array","items":{"additionalProperties":false,"type":"object","required":["project_id","issue_id","observed_at_ms"],"properties":{"project_id":{"$ref":"#/$defs/OperationId"},"issue_id":{"minLength":1,"maxLength":256,"type":"string"},"observed_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}}},"candidate_observation":{"additionalProperties":false,"type":"object","required":["state","requires_revalidation","order","has_more"],"properties":{"state":{"anyOf":[{"const":"recorded","type":"string"},{"const":"not_observed","type":"string"}]},"requires_revalidation":{"const":true,"type":"boolean"},"order":{"const":"observed_queue_order","type":"string"},"has_more":{"type":"boolean"}}},"recent_results":{"maxItems":5,"type":"array","items":{"$ref":"#/$defs/HttpAttemptSummary"}},"impediments":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpContextDiagnostic"}},"integration_status":{"additionalProperties":false,"type":"object","required":["kind","observation","state","proves_provider_execution"],"properties":{"kind":{"const":"maestri_native","type":"string"},"observation":{"anyOf":[{"$ref":"#/$defs/HttpContextDiagnostic"},{"type":"null"}]},"state":{"anyOf":[{"const":"not_checked","type":"string"},{"const":"observed","type":"string"}]},"proves_provider_execution":{"const":false,"type":"boolean"}}},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "HttpOperationSummaryQuery": {"additionalProperties":false,"type":"object","properties":{"project_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpDiagnosticsView": {"additionalProperties":false,"type":"object","required":["context","supported_checks","diagnostics","reports","event_cursor","tools"],"properties":{"context":{"$ref":"#/$defs/HttpDiagnosticContext"},"supported_checks":{"maxItems":4,"type":"array","items":{"$ref":"#/$defs/HttpDiagnosticCheck"}},"diagnostics":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpContextDiagnostic"}},"reports":{"maxItems":4,"type":"array","items":{"$ref":"#/$defs/HttpDiagnosticReport"}},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"tools":{"type":"array","items":{"$ref":"#/$defs/ToolObservation"},"maxItems":5,"minItems":0}}},
    "HttpDiagnosticContext": {"anyOf":[{"additionalProperties":false,"type":"object","required":["scope"],"properties":{"scope":{"const":"host","type":"string"}}},{"additionalProperties":false,"type":"object","required":["scope","id"],"properties":{"scope":{"const":"project","type":"string"},"id":{"$ref":"#/$defs/OperationId"}}},{"additionalProperties":false,"type":"object","required":["scope","id"],"properties":{"scope":{"const":"creation","type":"string"},"id":{"$ref":"#/$defs/OperationId"}}},{"additionalProperties":false,"type":"object","required":["scope","id"],"properties":{"scope":{"const":"attempt","type":"string"},"id":{"$ref":"#/$defs/OperationId"}}}]},
    "HttpDiagnosticChecks": {"additionalProperties":false,"type":"object","required":["checks"],"properties":{"checks":{"minItems":1,"maxItems":4,"uniqueItems":true,"type":"array","items":{"$ref":"#/$defs/HttpDiagnosticCheck"}},"tools":{"type":"array","items":{"anyOf":[{"const":"git","type":"string"},{"const":"maestri","type":"string"},{"const":"omp","type":"string"},{"const":"powershell","type":"string"},{"const":"github_cli","type":"string"}]},"maxItems":5,"minItems":1}}},
    "IssueOptions": {"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor","completeness","diagnostics","retry_at_ms","prerequisites"],"properties":{"items":{"maxItems":100,"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","archived","kind","title","url","executable","content_id","reasons"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"archived":{"type":"boolean"},"kind":{"anyOf":[{"const":"issue","type":"string"},{"const":"pull_request","type":"string"},{"const":"draft","type":"string"},{"const":"inaccessible","type":"string"}]},"title":{"anyOf":[{"minLength":1,"maxLength":65536,"type":"string"},{"type":"null"}]},"url":{"anyOf":[{"minLength":1,"maxLength":1024,"type":"string"},{"type":"null"}]},"executable":{"type":"boolean"},"position":{"minimum":1,"type":"integer"},"content_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"reasons":{"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}}}}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"completeness":{"anyOf":[{"const":"complete","type":"string"},{"const":"partial","type":"string"},{"const":"unavailable","type":"string"}]},"diagnostics":{"type":"array","items":{"$ref":"#/$defs/GitHubDiagnostic"}},"retry_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}},
    "CatalogQuery": {"additionalProperties":false,"type":"object","properties":{"search":{"maxLength":256,"type":"string"},"cursor":{"minLength":1,"maxLength":512,"pattern":".*\\S.*","type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"}}},
    "ProjectParams": {"additionalProperties":false,"type":"object","required":["projectId"],"properties":{"projectId":{"$ref":"#/$defs/OperationId"}}},
    "PreparationCreated": {"additionalProperties":false,"type":"object","required":["preparation","event_cursor","operation_id","receipt"],"properties":{"preparation":{"$ref":"#/$defs/Preparation"},"event_cursor":{"pattern":"^[0-9]+$","type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"},"receipt":{"$ref":"#/$defs/OperationReceipt"}}},
    "PublicationTargetChoice": {"anyOf":[{"type":"object","additionalProperties":false,"properties":{"kind":{"anyOf":[{"const":"existing_clone","type":"string"}]},"path":{"type":"string","minLength":1,"maxLength":32768}},"required":["kind","path"]},{"type":"object","additionalProperties":false,"properties":{"kind":{"anyOf":[{"const":"clone","type":"string"}]},"destination":{"type":"string","minLength":1,"maxLength":32768}},"required":["kind","destination"]}]},
    "PublicationTargetIntent": {"type":"object","additionalProperties":false,"required":["format_version","repository_id","selection"],"properties":{"format_version":{"const":1,"type":"integer"},"repository_id":{"type":"string","minLength":1,"maxLength":256},"selection":{"$ref":"#/$defs/PublicationTargetChoice"}}},
    "CapturedPublicationTarget": {"type":"object","additionalProperties":false,"required":["format_version","publication_target","publication_target_hash","authorization_operation_id"],"properties":{"format_version":{"const":1,"type":"integer"},"publication_target":{"anyOf":[{"$ref":"#/$defs/PublicationTargetIntent"},{"type":"null"}]},"publication_target_hash":{"anyOf":[{"type":"string","pattern":"^[a-f0-9]{64}$"},{"type":"null"}]},"authorization_operation_id":{"$ref":"#/$defs/OperationId"}},"allOf":[{"if":{"properties":{"publication_target":{"type":"null"}},"required":["publication_target"]},"then":{"properties":{"publication_target_hash":{"type":"null"}}},"else":{"properties":{"publication_target_hash":{"type":"string","pattern":"^[a-f0-9]{64}$"}}}}]},
    "PreparationChoices": {"additionalProperties":false,"type":"object","required":["issue_id","delivery_mode","guidance","overrides"],"properties":{"issue_id":{"minLength":1,"maxLength":256,"type":"string"},"delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"guidance":{"maxLength":8192,"type":"string"},"overrides":{"$ref":"#/$defs/PreparationOverrides"},"previous_attempt_id":{"$ref":"#/$defs/OperationId"},"publication_target":{"anyOf":[{"$ref":"#/$defs/PublicationTargetIntent"},{"type":"null"}]}}},
    "PreparationView": {"additionalProperties":false,"type":"object","required":["preparation","event_cursor"],"properties":{"preparation":{"$ref":"#/$defs/Preparation"},"event_cursor":{"pattern":"^[0-9]+$","type":"string"}}},
    "PreparationParams": {"additionalProperties":false,"type":"object","required":["preparationId"],"properties":{"preparationId":{"$ref":"#/$defs/OperationId"}}},
    "PreparationUpdate": {"additionalProperties":false,"type":"object","required":["changes"],"properties":{"changes":{"$ref":"#/$defs/PreparationChanges"}}},
    "DeletionPreview": {"additionalProperties":false,"type":"object","required":["project_id","project_name","project_revision","authorization_digest","source_kind","targets","blockers","can_confirm"],"properties":{"project_id":{"$ref":"#/$defs/OperationId"},"project_name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"project_revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"authorization_digest":{"pattern":"^[a-f0-9]{64}$","minLength":64,"maxLength":64,"type":"string"},"source_kind":{"anyOf":[{"const":"local","type":"string"},{"const":"github","type":"string"}]},"targets":{"type":"array","items":{"$ref":"#/$defs/DeletionTarget"}},"blockers":{"type":"array","items":{"$ref":"#/$defs/DeletionBlocker"}},"can_confirm":{"type":"boolean"}}},
    "DeletionStatus": {"anyOf":[{"$ref":"#/$defs/DeletionPending"},{"$ref":"#/$defs/DeletionCompleted"}]},
    "DeletionConfirmation": {"additionalProperties":false,"type":"object","required":["confirmed","authorization_digest"],"properties":{"confirmed":{"const":true,"type":"boolean"},"authorization_digest":{"pattern":"^[a-f0-9]{64}$","minLength":64,"maxLength":64,"type":"string"}}},
    "Route26Params": {"additionalProperties":false,"type":"object","required":["operation_id"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"}}},
    "DeletionResume": {"additionalProperties":false,"type":"object","properties":{}},
    "Route27Params": {"additionalProperties":false,"type":"object","required":["operation_id"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"}}},
    "ProjectPage": {"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor"],"properties":{"items":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/ProjectSummary"}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "ProjectRegistered": {"additionalProperties":false,"type":"object","required":["deletion","project","prerequisites","event_cursor","operation_id"],"properties":{"deletion":{"anyOf":[{"$ref":"#/$defs/DeletionSummary"},{"type":"null"}]},"project":{"$ref":"#/$defs/ProjectSummary"},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"}}},
    "ProjectRegistration": {"additionalProperties":false,"type":"object","required":["name","source","base_branch"],"properties":{"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"source":{"$ref":"#/$defs/OriginSource"},"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"}}},
    "ProjectDetail": {"additionalProperties":false,"type":"object","required":["deletion","project","prerequisites","event_cursor"],"properties":{"deletion":{"anyOf":[{"$ref":"#/$defs/DeletionSummary"},{"type":"null"}]},"project":{"$ref":"#/$defs/ProjectSummary"},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "SettingsView": {"additionalProperties":false,"type":"object","required":["settings","profiles","profile_counts","onboarding","selection_capabilities","event_cursor","tool_preferences"],"properties":{"settings":{"$ref":"#/$defs/FactorySettings"},"profiles":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/StoredExecutionProfile"}},"profile_counts":{"$ref":"#/$defs/ProfileCounts"},"onboarding":{"$ref":"#/$defs/OnboardingView"},"selection_capabilities":{"$ref":"#/$defs/SelectionCapabilities"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"tool_preferences":{"$ref":"#/$defs/ToolPreferences"}}},
    "GitHubSetupOptions": {"additionalProperties":false,"type":"object","required":["executable","linked_account","observed_account","accounts","diagnostics","retry_at_ms"],"properties":{"executable":{"$ref":"#/$defs/GitHubExecutableObservation"},"linked_account":{"anyOf":[{"$ref":"#/$defs/GitHubAccount"},{"type":"null"}]},"observed_account":{"anyOf":[{"$ref":"#/$defs/GitHubAccount"},{"type":"null"}]},"accounts":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/GitHubSetupAccount"}},"diagnostics":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"retry_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]}}},
    "ExecutionCatalog": {"anyOf":[{"additionalProperties":false,"type":"object","required":["state","executor","executor_version","observed_at_ms","models"],"properties":{"state":{"const":"loaded","type":"string"},"executor":{"const":"maestri-omp","type":"string"},"executor_version":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"observed_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"models":{"minItems":1,"maxItems":10000,"type":"array","items":{"$ref":"#/$defs/CatalogModel"}}}},{"additionalProperties":false,"type":"object","required":["state","observed_at_ms","diagnostics"],"properties":{"state":{"const":"unavailable","type":"string"},"observed_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"diagnostics":{"minItems":1,"maxItems":10,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}}]},
    "SettingsSaved": {"additionalProperties":false,"type":"object","required":["settings","profiles","profile_counts","onboarding","selection_capabilities","event_cursor","operation_id","receipt","tool_preferences"],"properties":{"settings":{"$ref":"#/$defs/FactorySettings"},"profiles":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/StoredExecutionProfile"}},"profile_counts":{"$ref":"#/$defs/ProfileCounts"},"onboarding":{"$ref":"#/$defs/OnboardingView"},"selection_capabilities":{"$ref":"#/$defs/SelectionCapabilities"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"},"receipt":{"$ref":"#/$defs/OperationReceipt"},"warnings":{"maxItems":10,"type":"array","items":{"$ref":"#/$defs/OperationWarning"}},"tool_preferences":{"$ref":"#/$defs/ToolPreferences"}}},
    "SettingsUpdate": {"additionalProperties":false,"type":"object","required":["changes"],"properties":{"changes":{"$ref":"#/$defs/GlobalChanges"},"onboarding_changes":{"$ref":"#/$defs/OnboardingChanges"},"profile_changes":{"$ref":"#/$defs/ProfileChanges"},"gh_executable_path":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"account_binding":{"$ref":"#/$defs/AccountBinding"},"tool_preferences":{"$ref":"#/$defs/ToolPreferences"}}},
    "NativeSelectionKind": {"anyOf":[{"const":"projects_root","type":"string"},{"const":"project_directory","type":"string"},{"const":"gh_executable","type":"string"},{"const":"git_executable","type":"string"},{"const":"maestri_executable","type":"string"},{"const":"omp_executable","type":"string"},{"const":"powershell_executable","type":"string"}]},
    "LegacyProjectMapping": {"additionalProperties":false,"type":"object","required":["id","owner_id","status_field_id","status_option_ids"],"properties":{"id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"owner_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"status_field_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"status_option_ids":{"additionalProperties":false,"type":"object","required":["ready","in_progress","in_review","delivered"],"properties":{"ready":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"in_progress":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"in_review":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"delivered":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"}}}}},
    "ReadProjectMapping": {"anyOf":[{"$ref":"#/$defs/ProjectMapping"},{"$ref":"#/$defs/LegacyProjectMapping"}]},
    "LegacyHttpScaffoldPlan": {"additionalProperties":false,"type":"object","required":["format_version","input","installation_id","settings_e_tag","projects_root","destination","parent_identity","template_digest","files","engineering","account","owner_id","effects"],"properties":{"format_version":{"const":1,"type":"number"},"input":{"additionalProperties":false,"type":"object","required":["name","template_id","template_digest","destination_relative","creation_mode","base_branch","triage_enabled"],"properties":{"name":{"minLength":1,"maxLength":256,"type":"string"},"template_id":{"minLength":1,"maxLength":128,"type":"string"},"template_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"destination_relative":{"minLength":1,"maxLength":1024,"type":"string"},"creation_mode":{"$ref":"#/$defs/HttpCreationMode"},"base_branch":{"minLength":1,"maxLength":256,"type":"string"},"triage_enabled":{"type":"boolean"},"remote":{"additionalProperties":false,"type":"object","required":["owner_id","name","visibility"],"properties":{"owner_id":{"minLength":1,"maxLength":256,"type":"string"},"name":{"minLength":1,"maxLength":100,"type":"string"},"visibility":{"anyOf":[{"const":"private","type":"string"},{"const":"public","type":"string"}]}}}}},"installation_id":{"$ref":"#/$defs/OperationId"},"settings_e_tag":{"minLength":1,"maxLength":256,"type":"string"},"projects_root":{"minLength":1,"maxLength":4096,"type":"string"},"destination":{"minLength":1,"maxLength":4096,"type":"string"},"parent_identity":{"pattern":"^[a-f0-9]{64}$","type":"string"},"template_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"files":{"minItems":1,"maxItems":50,"type":"array","items":{"$ref":"#/$defs/HttpScaffoldFile"}},"engineering":{"$ref":"#/$defs/HttpScaffoldEngineering"},"account":{"$ref":"#/$defs/HttpScaffoldAccount"},"owner_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"owner_login":{"minLength":1,"maxLength":100,"type":"string"},"effects":{"maxItems":10,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}}}},
    "HttpScaffoldPlanV3": {"additionalProperties":false,"type":"object","required":["format_version","input","installation_id","settings_e_tag","projects_root","destination","parent_identity","template_digest","files","engineering","account","owner_id","effects"],"properties":{"format_version":{"const":1,"type":"number"},"input":{"$ref":"#/$defs/HttpScaffoldInput"},"installation_id":{"$ref":"#/$defs/OperationId"},"settings_e_tag":{"minLength":1,"maxLength":256,"type":"string"},"projects_root":{"minLength":1,"maxLength":4096,"type":"string"},"destination":{"minLength":1,"maxLength":4096,"type":"string"},"parent_identity":{"pattern":"^[a-f0-9]{64}$","type":"string"},"template_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"files":{"minItems":1,"maxItems":50,"type":"array","items":{"$ref":"#/$defs/HttpScaffoldFile"}},"engineering":{"$ref":"#/$defs/HttpScaffoldEngineering"},"account":{"$ref":"#/$defs/HttpScaffoldAccount"},"owner_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"owner_login":{"minLength":1,"maxLength":100,"type":"string"},"effects":{"maxItems":10,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}}}},
    "NativeSelectionResult": {"anyOf":[{"additionalProperties":false,"type":"object","required":["state","kind","path","observed_at_ms"],"properties":{"state":{"const":"selected","type":"string"},"kind":{"$ref":"#/$defs/NativeSelectionKind"},"path":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"observed_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}},{"additionalProperties":false,"type":"object","required":["state","kind","path"],"properties":{"state":{"const":"cancelled","type":"string"},"kind":{"$ref":"#/$defs/NativeSelectionKind"},"path":{"type":"null"}}},{"additionalProperties":false,"type":"object","required":["state","kind","path","diagnostic"],"properties":{"state":{"const":"unavailable","type":"string"},"kind":{"$ref":"#/$defs/NativeSelectionKind"},"path":{"type":"null"},"diagnostic":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"}}}]},
    "NativeSelectionRequest": {"additionalProperties":false,"type":"object","required":["kind"],"properties":{"kind":{"$ref":"#/$defs/NativeSelectionKind"}}},
    "ConfigurationView": {"additionalProperties":false,"type":"object","required":["deletion","configuration","settings","profiles","profile_counts","onboarding","selection_capabilities","event_cursor","prerequisites","tool_preferences","storage"],"properties":{"deletion":{"anyOf":[{"$ref":"#/$defs/DeletionSummary"},{"type":"null"}]},"configuration_lock":{"anyOf":[{"additionalProperties":false,"type":"object","required":["attempt_id"],"properties":{"attempt_id":{"type":"string"}}},{"type":"null"}]},"configuration":{"$ref":"#/$defs/ProjectRevision"},"settings":{"$ref":"#/$defs/FactorySettings"},"profiles":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/StoredExecutionProfile"}},"profile_counts":{"$ref":"#/$defs/ProfileCounts"},"onboarding":{"$ref":"#/$defs/OnboardingView"},"selection_capabilities":{"$ref":"#/$defs/SelectionCapabilities"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"tool_preferences":{"$ref":"#/$defs/ToolPreferences"},"storage":{"$ref":"#/$defs/ProjectStorageView"}}},
    "ConfigurationSaved": {"additionalProperties":false,"type":"object","required":["deletion","configuration","settings","profiles","profile_counts","onboarding","selection_capabilities","event_cursor","prerequisites","operation_id","receipt","tool_preferences","storage"],"properties":{"deletion":{"anyOf":[{"$ref":"#/$defs/DeletionSummary"},{"type":"null"}]},"configuration_lock":{"anyOf":[{"additionalProperties":false,"type":"object","required":["attempt_id"],"properties":{"attempt_id":{"type":"string"}}},{"type":"null"}]},"configuration":{"$ref":"#/$defs/ProjectRevision"},"settings":{"$ref":"#/$defs/FactorySettings"},"profiles":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/StoredExecutionProfile"}},"profile_counts":{"$ref":"#/$defs/ProfileCounts"},"onboarding":{"$ref":"#/$defs/OnboardingView"},"selection_capabilities":{"$ref":"#/$defs/SelectionCapabilities"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"operation_id":{"$ref":"#/$defs/OperationId"},"receipt":{"$ref":"#/$defs/OperationReceipt"},"tool_preferences":{"$ref":"#/$defs/ToolPreferences"},"storage":{"$ref":"#/$defs/ProjectStorageView"}}},
    "ConfigurationUpdate": {"additionalProperties":false,"type":"object","required":["project_changes"],"properties":{"project_changes":{"$ref":"#/$defs/ProjectChanges"},"global_changes":{"$ref":"#/$defs/GlobalChanges"},"profile_changes":{"$ref":"#/$defs/ProfileChanges"}}},
    "ConfigurationOptions": {"additionalProperties":false,"type":"object","required":["projects","status_fields","status_options","profiles","completeness","diagnostics","retry_at_ms"],"properties":{"projects":{"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor"],"properties":{"items":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/GitHubProject"}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},"status_fields":{"type":"array","items":{"$ref":"#/$defs/StatusField"}},"status_options":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","name"],"properties":{"id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"name":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"}}}},"profiles":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/StoredExecutionProfile"}},"completeness":{"anyOf":[{"const":"complete","type":"string"},{"const":"partial","type":"string"},{"const":"unavailable","type":"string"}]},"diagnostics":{"type":"array","items":{"$ref":"#/$defs/GitHubDiagnostic"}},"retry_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]}}},
    "ConfigurationOptionsQuery": {"additionalProperties":false,"type":"object","properties":{"owner_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"owner_kind":{"anyOf":[{"const":"user","type":"string"},{"const":"organization","type":"string"}]},"github_project_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"status_field_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"cursor":{"minLength":1,"maxLength":512,"pattern":".*\\S.*","type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"}}},
    "HttpAuthorizeUpgrade": {"additionalProperties":false,"type":"object","required":["delivery_id","current_mode","target_mode","authorized_additional_effects_hash","authorized"],"properties":{"delivery_id":{"$ref":"#/$defs/OperationId"},"current_mode":{"$ref":"#/$defs/DeliveryMode"},"target_mode":{"$ref":"#/$defs/DeliveryMode"},"authorized_additional_effects_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"authorized":{"const":true,"type":"boolean"},"selection_operation_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpCompletePublication": {"additionalProperties":false,"type":"object","required":["delivery_id","authorized_mode","authorized"],"properties":{"delivery_id":{"$ref":"#/$defs/OperationId"},"authorized_mode":{"$ref":"#/$defs/DeliveryMode"},"authorized":{"const":true,"type":"boolean"},"selection_operation_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpReconcilePublication": {"additionalProperties":false,"type":"object","required":["delivery_id"],"properties":{"delivery_id":{"$ref":"#/$defs/OperationId"}}},
    "EmptyBody": {"additionalProperties":false,"type":"object","properties":{}},
    "HttpQueueObservation": {"additionalProperties":false,"type":"object","required":["scope","enabled","valid","complete","observation_id","summary_hash","observed_at_ms","eligible_total","modes_by_project","account","host","order","page","diagnostics","event_cursor","polling"],"properties":{"scope":{"$ref":"#/$defs/HttpQueueScope"},"enabled":{"type":"boolean"},"valid":{"type":"boolean"},"complete":{"type":"boolean"},"observation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"summary_hash":{"anyOf":[{"minLength":1,"maxLength":128,"type":"string"},{"type":"null"}]},"observed_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]},"eligible_total":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"modes_by_project":{"maxItems":100,"type":"array","items":{"additionalProperties":false,"type":"object","required":["project_id","mode"],"properties":{"project_id":{"$ref":"#/$defs/OperationId"},"mode":{"$ref":"#/$defs/DeliveryMode"}}}},"account":{"additionalProperties":false,"type":"object","required":["id","login"],"properties":{"id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"login":{"anyOf":[{"minLength":1,"maxLength":100,"type":"string"},{"type":"null"}]}}},"host":{"additionalProperties":false,"type":"object","required":["expected","observed","matches"],"properties":{"expected":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"observed":{"minLength":1,"maxLength":256,"type":"string"},"matches":{"type":"boolean"}}},"order":{"additionalProperties":false,"type":"object","required":["criterion","description"],"properties":{"criterion":{"minLength":1,"maxLength":256,"type":"string"},"description":{"minLength":1,"maxLength":1024,"type":"string"}}},"page":{"additionalProperties":false,"type":"object","required":["items","next_cursor","has_more","event_cursor"],"properties":{"items":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpQueueItem"}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},"diagnostics":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpQueueDiagnostic"}},"event_cursor":{"pattern":"^(0|[1-9][0-9]{0,15})$","type":"string"},"polling":{"additionalProperties":false,"type":"object","required":["interval_ms","backoff_max_ms","retry_at_ms","next_poll_at_ms"],"properties":{"interval_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"backoff_max_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"retry_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]},"next_poll_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}}}},
    "HttpQueueQuery": {"additionalProperties":false,"type":"object","properties":{"project_id":{"$ref":"#/$defs/OperationId"},"project_ids":{"minLength":36,"maxLength":3699,"pattern":"^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$","type":"string"},"cursor":{"minLength":1,"maxLength":512,"type":"string"},"limit":{"pattern":"^(?:[1-9]|[1-9][0-9]|100)$","type":"string"}}},
    "HttpQueueSaved": {"additionalProperties":false,"type":"object","required":["queue","operation_id","receipt"],"properties":{"queue":{"$ref":"#/$defs/HttpQueueObservation"},"operation_id":{"$ref":"#/$defs/OperationId"},"receipt":{"$ref":"#/$defs/OperationReceipt"}}},
    "Route44Response409": {"anyOf":[{"$ref":"#/$defs/HttpQueueConflict"},{"$ref":"#/$defs/ErrorResponse"}]},
    "HttpQueueCommand": {"additionalProperties":false,"type":"object","required":["enabled","scope"],"properties":{"enabled":{"type":"boolean"},"scope":{"$ref":"#/$defs/HttpQueueScope"},"observation_id":{"$ref":"#/$defs/OperationId"},"authorized_summary_hash":{"minLength":1,"maxLength":128,"type":"string"}}},
    "HttpCancelAttempt": {"additionalProperties":false,"type":"object","properties":{"reason":{"minLength":1,"maxLength":1000,"type":"string"}}},
    "HttpAttemptResources": {"additionalProperties":false,"type":"object","required":["entries","cleanup","event_cursor"],"properties":{"entries":{"maxItems":13,"type":"array","items":{"$ref":"#/$defs/HttpAttemptResource"}},"cleanup":{"anyOf":[{"const":"pending","type":"string"},{"const":"complete","type":"string"},{"const":"uncertain","type":"string"}]},"event_cursor":{"type":"string"}}},
    "HttpRemovalPlan": {"additionalProperties":false,"type":"object","required":["resource_id","location_display","losses","preserved_references","plan_hash","capability"],"properties":{"resource_id":{"$ref":"#/$defs/OperationId"},"location_display":{"minLength":1,"maxLength":4096,"type":"string"},"losses":{"type":"array","items":{"minLength":1,"maxLength":4096,"type":"string"}},"preserved_references":{"type":"array","items":{"minLength":1,"maxLength":4096,"type":"string"}},"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"capability":{"$ref":"#/$defs/HttpRecoveryCapability"}}},
    "ResourceParams": {"additionalProperties":false,"type":"object","required":["attemptId","resourceId"],"properties":{"attemptId":{"$ref":"#/$defs/OperationId"},"resourceId":{"$ref":"#/$defs/OperationId"}}},
    "HttpRemoveResource": {"additionalProperties":false,"type":"object","required":["plan_hash","confirmed"],"properties":{"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"confirmed":{"const":true,"type":"boolean"}}},
    "HttpPassageInteraction": {"additionalProperties":false,"type":"object","required":["session_reference","open_capability","event_cursor","attempt_session_id","continuity_state"],"properties":{"session_reference":{"minLength":1,"maxLength":4096,"type":"string"},"open_capability":{"$ref":"#/$defs/HttpRecoveryCapability"},"event_cursor":{"type":"string"},"attempt_session_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"continuity_state":{"anyOf":[{"type":"string","const":"confirmed"},{"type":"string","const":"unavailable"},{"type":"string","const":"lost"}]}}},
    "InteractionParams": {"additionalProperties":false,"type":"object","required":["attemptId","passageId"],"properties":{"attemptId":{"$ref":"#/$defs/OperationId"},"passageId":{"$ref":"#/$defs/OperationId"}}},
    "HttpFolderSurface": {"additionalProperties":false,"type":"object","required":["resource_id","location_display","open_capability","event_cursor"],"properties":{"resource_id":{"$ref":"#/$defs/OperationId"},"location_display":{"minLength":1,"maxLength":4096,"type":"string"},"open_capability":{"$ref":"#/$defs/HttpRecoveryCapability"},"event_cursor":{"type":"string"}}},
    "HttpScaffoldOptions": {"additionalProperties":false,"type":"object","required":["catalog","templates","projects_root","creation_modes","account","prerequisites","event_cursor"],"properties":{"catalog":{"additionalProperties":false,"type":"object","required":["id","version","digest"],"properties":{"id":{"minLength":1,"maxLength":128,"type":"string"},"version":{"const":1,"type":"number"},"digest":{"pattern":"^[a-f0-9]{64}$","type":"string"}}},"templates":{"maxItems":20,"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","digest","label","engineering_summary"],"properties":{"id":{"minLength":1,"maxLength":128,"type":"string"},"digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"label":{"minLength":1,"maxLength":256,"type":"string"},"engineering_summary":{"minLength":1,"maxLength":4096,"type":"string"}}}},"projects_root":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"creation_modes":{"maxItems":1,"type":"array","items":{"additionalProperties":false,"type":"object","required":["mode","capability"],"properties":{"mode":{"anyOf":[{"const":"remote_push","type":"string"}]},"capability":{"$ref":"#/$defs/Capability"}}}},"account":{"$ref":"#/$defs/HttpScaffoldAccount"},"prerequisites":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"event_cursor":{"pattern":"^[0-9]+$","type":"string"}}},
    "HttpScaffoldPlanned": {"additionalProperties":false,"type":"object","required":["plan_hash","plan","prerequisites"],"properties":{"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"plan":{"$ref":"#/$defs/HttpScaffoldPlanV3"},"prerequisites":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}},
    "HttpScaffoldInput": {"additionalProperties":false,"type":"object","required":["name","template_id","template_digest","destination_relative","creation_mode","base_branch","triage_enabled","remote","board_name"],"properties":{"name":{"minLength":1,"maxLength":256,"type":"string"},"template_id":{"minLength":1,"maxLength":128,"type":"string"},"template_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"destination_relative":{"minLength":1,"maxLength":1024,"type":"string"},"creation_mode":{"anyOf":[{"const":"remote_push","type":"string"}]},"base_branch":{"minLength":1,"maxLength":256,"type":"string"},"triage_enabled":{"type":"boolean"},"remote":{"additionalProperties":false,"type":"object","required":["owner_id","name","visibility"],"properties":{"owner_id":{"minLength":1,"maxLength":256,"type":"string"},"name":{"minLength":1,"maxLength":100,"type":"string"},"visibility":{"anyOf":[{"const":"private","type":"string"},{"const":"public","type":"string"}]}}},"board_name":{"type":"string","minLength":1,"maxLength":256}}},
    "HttpCreateScaffold": {"additionalProperties":false,"type":"object","required":["plan_hash","plan","authorized"],"properties":{"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"plan":{"$ref":"#/$defs/HttpScaffoldPlanV3"},"authorized":{"const":true,"type":"boolean"}}},
    "HttpCreationView": {"additionalProperties":false,"type":"object","required":["creation","confirmed_effects","pending_effects","effects","remote_effects","prerequisites","diagnostics","event_cursor","board_operations","board_name","board_url"],"properties":{"creation":{"$ref":"#/$defs/HttpProjectCreation"},"confirmed_effects":{"type":"array","items":{"$ref":"#/$defs/HttpCreationStep"}},"pending_effects":{"type":"array","items":{"$ref":"#/$defs/HttpCreationStep"}},"effects":{"maxItems":3,"type":"array","items":{"$ref":"#/$defs/HttpCreationEffect"}},"remote_effects":{"maxItems":3,"type":"array","items":{"additionalProperties":false,"type":"object","required":["kind","state","operation_id","identity","reason"],"properties":{"kind":{"anyOf":[{"const":"create_repository","type":"string"},{"const":"associate_origin","type":"string"},{"const":"baseline_push","type":"string"}]},"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"identity":{"$ref":"#/$defs/HttpCreationEffectIdentity"},"reason":{"anyOf":[{"minLength":1,"maxLength":128,"type":"string"},{"type":"null"}]}}}},"prerequisites":{"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"diagnostics":{"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}},"event_cursor":{"pattern":"^[0-9]+$","type":"string"},"board_operations":{"type":"array","items":{"$ref":"#/$defs/CreationBoardOperation"},"maxItems":20,"minItems":0},"board_name":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"board_url":{"anyOf":[{"type":"string","minLength":1,"maxLength":4096},{"type":"null"}]}}},
    "CreationParams": {"additionalProperties":false,"type":"object","required":["creationId"],"properties":{"creationId":{"$ref":"#/$defs/OperationId"}}},
    "OperationViewWithDeletion": {"anyOf":[{"additionalProperties":false,"type":"object","required":["operation_id","kind","resource","state","request_id"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"kind":{"minLength":1,"maxLength":128,"type":"string"},"resource":{"$ref":"#/$defs/OperationResource"},"state":{"anyOf":[{"const":"accepted","type":"string"},{"const":"running","type":"string"},{"const":"succeeded","type":"string"},{"const":"failed","type":"string"},{"const":"unknown","type":"string"}]},"receipt":{"$ref":"#/$defs/OperationReceipt"},"warnings":{"maxItems":10,"type":"array","items":{"$ref":"#/$defs/OperationWarning"}},"error":{"$ref":"#/$defs/ErrorResponse"},"request_id":{"minLength":1,"maxLength":128,"type":"string"},"progress":{"$ref":"#/$defs/OperationProgress"}}},{"$ref":"#/$defs/DeletionCompleted"}]},
    "OperationParams": {"additionalProperties":false,"type":"object","required":["operationId"],"properties":{"operationId":{"$ref":"#/$defs/OperationId"}}},
    "HealthResponse": {"additionalProperties":false,"type":"object","required":["status"],"properties":{"status":{"const":"ok","type":"string"}}},
    "SessionResponse": {"additionalProperties":false,"type":"object","required":["csrf_token","instance_id"],"properties":{"csrf_token":{"pattern":"^[A-Za-z0-9_-]{43}$","type":"string"},"instance_id":{"$ref":"#/$defs/OperationId"}}},
    "SetPublicationTarget": {"type":"object","additionalProperties":false,"properties":{"delivery_id":{"$ref":"#/$defs/OperationId"},"repository_id":{"type":"string","minLength":1,"maxLength":256},"selection":{"$ref":"#/$defs/PublicationTargetChoice"},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]},"authorization_operation_id":{"$ref":"#/$defs/OperationId"},"target_intent_hash":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["delivery_id","repository_id","selection","authorized"],"dependentRequired":{"authorization_operation_id":["target_intent_hash"],"target_intent_hash":["authorization_operation_id"]}},
    "MakeAttemptDecision": {"anyOf":[{"type":"object","additionalProperties":false,"properties":{"block_id":{"$ref":"#/$defs/OperationId"},"block_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"delivery_id":{"$ref":"#/$defs/OperationId"},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]},"action":{"anyOf":[{"const":"guidance","type":"string"}]},"guidance":{"type":"string","minLength":1,"maxLength":8192}},"required":["block_id","block_revision","delivery_id","authorized","action","guidance"]},{"type":"object","additionalProperties":false,"properties":{"block_id":{"$ref":"#/$defs/OperationId"},"block_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"delivery_id":{"$ref":"#/$defs/OperationId"},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]},"action":{"anyOf":[{"const":"change_profile","type":"string"}]},"profile_id":{"$ref":"#/$defs/OperationId"},"profile_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"role":{"$ref":"#/$defs/PassageRole"}},"required":["block_id","block_revision","delivery_id","authorized","action","profile_id","profile_revision","role"]},{"type":"object","additionalProperties":false,"properties":{"block_id":{"$ref":"#/$defs/OperationId"},"block_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"delivery_id":{"$ref":"#/$defs/OperationId"},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]},"action":{"anyOf":[{"const":"end","type":"string"}]}},"required":["block_id","block_revision","delivery_id","authorized","action"]}]},
    "ShutdownView": {"type":"object","additionalProperties":false,"properties":{"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"starts_paused":{"type":"boolean"},"state":{"anyOf":[{"const":"running","type":"string"},{"const":"paused","type":"string"},{"const":"draining","type":"string"},{"const":"ready_to_close","type":"string"},{"const":"blocked","type":"string"},{"const":"closing","type":"string"}]},"active_work":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"type":{"anyOf":[{"const":"attempt","type":"string"},{"const":"execution","type":"string"},{"const":"publication","type":"string"},{"const":"creation","type":"string"},{"const":"deletion","type":"string"},{"const":"storage_transition","type":"string"},{"const":"accepted_operation","type":"string"}]},"id":{"type":"string","minLength":1,"maxLength":256},"attempt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"project_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"state":{"type":"string","minLength":1,"maxLength":128},"cause":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]}},"required":["type","id","attempt_id","project_id","state","cause","recovery"]},"maxItems":100,"minItems":0},"has_more":{"type":"boolean"},"remaining_work_count":{"type":"integer","minimum":0,"maximum":9007199254740991},"operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"pause_capability":{"$ref":"#/$defs/Capability"},"close_when_idle_capability":{"$ref":"#/$defs/Capability"},"event_cursor":{"type":"string","pattern":"^[0-9]+$","maxLength":20},"next_cursor":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"generation":{"type":"integer","minimum":1,"maximum":9007199254740991},"automation_enabled":{"type":"boolean"},"closing_committed":{"type":"boolean"},"resume_starts_capability":{"$ref":"#/$defs/Capability"}},"required":["revision","starts_paused","state","active_work","has_more","remaining_work_count","operation_id","pause_capability","close_when_idle_capability","event_cursor","next_cursor","generation","automation_enabled","closing_committed","resume_starts_capability"]},
    "ShutdownCommand": {"type":"object","additionalProperties":false,"properties":{"action":{"anyOf":[{"const":"pause_starts","type":"string"},{"const":"close_when_idle","type":"string"},{"const":"resume_starts","type":"string"}]},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]}},"required":["action","authorized"]},
    "ClaimNotification": {"type":"object","additionalProperties":false,"properties":{"consumer_id":{"$ref":"#/$defs/OperationId"},"surface":{"anyOf":[{"const":"browser_host","type":"string"}]},"event_seq":{"type":"string","pattern":"^[1-9][0-9]*$","maxLength":20}},"required":["consumer_id","surface","event_seq"]},
    "NotificationClaim": {"type":"object","additionalProperties":false,"properties":{"dispatch_id":{"$ref":"#/$defs/OperationId"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"consumer_id":{"$ref":"#/$defs/OperationId"},"surface":{"anyOf":[{"const":"browser_host","type":"string"}]},"event_seq":{"type":"string","pattern":"^[1-9][0-9]*$","maxLength":20},"state":{"anyOf":[{"const":"reserved","type":"string"},{"const":"confirmed","type":"string"},{"const":"uncertain","type":"string"},{"const":"unavailable","type":"string"}]},"send_allowed":{"type":"boolean"},"notification":{"type":"object","additionalProperties":false,"properties":{"title":{"anyOf":[{"const":"Nova fábrica de software","type":"string"}]},"event_kind":{"anyOf":[{"const":"question_pending","type":"string"},{"const":"failure","type":"string"},{"const":"completion","type":"string"}]},"target_hash":{"type":"string","minLength":1,"maxLength":1024}},"required":["title","event_kind","target_hash"]},"operation_id":{"$ref":"#/$defs/OperationId"}},"required":["dispatch_id","revision","consumer_id","surface","event_seq","state","send_allowed","notification","operation_id"]},
    "RecordNotificationReceipt": {"type":"object","additionalProperties":false,"properties":{"dispatch_id":{"$ref":"#/$defs/OperationId"},"dispatch_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"state":{"anyOf":[{"const":"confirmed","type":"string"},{"const":"uncertain","type":"string"},{"const":"unavailable","type":"string"}]},"reason":{"type":"string","minLength":1,"maxLength":2048}},"required":["dispatch_id","dispatch_revision","state"]},
    "NotificationReceipt": {"type":"object","additionalProperties":false,"properties":{"dispatch_id":{"$ref":"#/$defs/OperationId"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"state":{"anyOf":[{"const":"confirmed","type":"string"},{"const":"uncertain","type":"string"},{"const":"unavailable","type":"string"}]},"operation_id":{"$ref":"#/$defs/OperationId"}},"required":["dispatch_id","revision","state","operation_id"]},
    "StorageTransitionCommand": {"type":"object","additionalProperties":false,"properties":{"location_key":{"type":"string","minLength":1,"maxLength":256},"source_location_id":{"$ref":"#/$defs/OperationId"},"plan_hash":{"type":"string","pattern":"^[a-f0-9]{64}$"},"authorized":{"anyOf":[{"const":true,"type":"boolean"}]}},"required":["location_key","source_location_id","plan_hash","authorized"]},
    "HttpControllerEventFrame": {"additionalProperties":false,"type":"object","required":["entity","revision","operation_id","event_type","facts"],"properties":{"entity":{"$ref":"#/$defs/OperationResource"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"operation_id":{"$ref":"#/$defs/OperationId"},"event_type":{"minLength":1,"maxLength":128,"type":"string"},"project_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"facts":{"$ref":"#/$defs/EmptyBody"}}},
    "OperationProgress": {"type":"object","additionalProperties":false,"properties":{"kind":{"anyOf":[{"const":"publication_target","type":"string"},{"const":"attempt_decision","type":"string"},{"const":"storage_transition","type":"string"},{"const":"shutdown","type":"string"},{"const":"notification_claim","type":"string"},{"const":"notification_receipt","type":"string"}]},"state":{"type":"string","minLength":1,"maxLength":128},"cause":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"target_selection":{"anyOf":[{"$ref":"#/$defs/PublicationTargetSelection"},{"type":"null"}]},"decision":{"anyOf":[{"$ref":"#/$defs/AttemptDecisionView"},{"type":"null"}]},"shutdown":{"anyOf":[{"$ref":"#/$defs/ShutdownView"},{"type":"null"}]},"transition_step":{"anyOf":[{"anyOf":[{"const":"planned","type":"string"},{"const":"quiescence_checked","type":"string"},{"const":"moving","type":"string"},{"const":"verifying","type":"string"},{"const":"publishing_location","type":"string"}]},{"type":"null"}]}},"required":["kind","state","cause","recovery","target_selection","decision","shutdown","transition_step"]},
    "FindingAssessment": {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"finding_id":{"$ref":"#/$defs/OperationId"},"review_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"round":{"type":"integer","minimum":1,"maximum":6},"content_identity":{"$ref":"#/$defs/HttpGitObjectId"},"progress":{"anyOf":[{"const":"proven","type":"string"},{"const":"partial","type":"string"},{"const":"none","type":"string"},{"const":"not_assessable","type":"string"}]},"evidence":{"type":"array","items":{"type":"string","minLength":1,"maxLength":4096},"maxItems":20,"minItems":0},"justification":{"type":"string","minLength":1,"maxLength":8192},"created_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["id","attempt_id","finding_id","review_id","delivery_id","round","content_identity","progress","evidence","justification","created_at_ms"]},
    "FindingDispute": {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"finding_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"content_identity":{"$ref":"#/$defs/HttpGitObjectId"},"justification":{"type":"string","minLength":1,"maxLength":8192},"evidence":{"type":"array","items":{"type":"string","minLength":1,"maxLength":4096},"maxItems":20,"minItems":1},"response_review_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"response_verdict":{"anyOf":[{"anyOf":[{"const":"maintained","type":"string"},{"const":"resolved","type":"string"}]},{"type":"null"}]},"response_justification":{"anyOf":[{"type":"string","minLength":1,"maxLength":8192},{"type":"null"}]},"response_evidence":{"anyOf":[{"type":"array","items":{"type":"string","minLength":1,"maxLength":4096},"maxItems":20,"minItems":0},{"type":"null"}]},"created_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991},"responded_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"response_delivery_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"response_content_identity":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]}},"required":["id","attempt_id","finding_id","passage_id","delivery_id","content_identity","justification","evidence","response_review_id","response_verdict","response_justification","response_evidence","created_at_ms","responded_at_ms","response_delivery_id","response_content_identity"]},
    "AttemptDecisionView": {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/$defs/OperationId"},"operation_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"block_id":{"$ref":"#/$defs/OperationId"},"block_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"block_reason":{"anyOf":[{"const":"no_progress","type":"string"},{"const":"dispute_maintained","type":"string"},{"const":"correction_limit","type":"string"}]},"action":{"anyOf":[{"const":"guidance","type":"string"},{"const":"change_profile","type":"string"},{"const":"end","type":"string"}]},"guidance":{"anyOf":[{"type":"string","minLength":1,"maxLength":8192},{"type":"null"}]},"successor_preparation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"successor_preparation_revision":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"created_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["id","operation_id","attempt_id","delivery_id","block_id","block_revision","block_reason","action","guidance","successor_preparation_id","successor_preparation_revision","created_at_ms"]},
    "HistoricalEffectiveProfile": {"type":"object","additionalProperties":false,"properties":{"role":{"$ref":"#/$defs/PassageRole"},"profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"profile_revision":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"executor":{"type":"string","minLength":1,"maxLength":256},"provider":{"type":"string","minLength":1,"maxLength":256},"model":{"type":"string","minLength":1,"maxLength":256},"effort":{"anyOf":[{"type":"string","minLength":1,"maxLength":128},{"type":"null"}]},"guidance":{"type":"string","minLength":0,"maxLength":8192},"composition_version":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"context_summary":{"type":"string","minLength":0,"maxLength":8192},"technical_contract_summary":{"type":"string","minLength":1,"maxLength":4096},"credentials_redacted":{"anyOf":[{"const":true,"type":"boolean"}]}},"required":["role","profile_id","profile_revision","executor","provider","model","effort","guidance","composition_version","context_summary","technical_contract_summary","credentials_redacted"]},
    "PublicationTargetSelection": {"type":"object","additionalProperties":false,"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"repository_id":{"type":"string","minLength":1,"maxLength":256},"selection_kind":{"anyOf":[{"const":"existing_clone","type":"string"},{"const":"clone","type":"string"}]},"local_path":{"type":"string","minLength":1,"maxLength":32768},"state":{"anyOf":[{"const":"accepted","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"}]},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"identity_verified":{"type":"boolean"},"checked_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"reason":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"authorization_operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"target_intent_hash":{"anyOf":[{"type":"string","pattern":"^[a-f0-9]{64}$"},{"type":"null"}]}},"required":["operation_id","attempt_id","delivery_id","repository_id","selection_kind","local_path","state","revision","identity_verified","checked_at_ms","reason","recovery","authorization_operation_id","target_intent_hash"]},
    "MeasuredValue": {"anyOf":[{"additionalProperties":false,"type":"object","required":["state","value","unit"],"properties":{"state":{"const":"measured","type":"string"},"value":{"minimum":0,"type":"number"},"unit":{"minLength":1,"maxLength":64,"type":"string"}}},{"additionalProperties":false,"type":"object","required":["state","reason","affected_requirements"],"properties":{"state":{"const":"unavailable","type":"string"},"reason":{"minLength":1,"maxLength":2048,"type":"string"},"affected_requirements":{"minItems":1,"maxItems":100,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}}}},{"additionalProperties":false,"type":"object","required":["state","reason"],"properties":{"state":{"const":"not_applicable","type":"string"},"reason":{"minLength":1,"maxLength":2048,"type":"string"}}}]},
    "ConfiguredLimit": {"anyOf":[{"additionalProperties":false,"type":"object","required":["state","value","unit"],"properties":{"state":{"const":"configured","type":"string"},"value":{"minimum":0,"type":"number"},"unit":{"minLength":1,"maxLength":64,"type":"string"}}},{"additionalProperties":false,"type":"object","required":["state"],"properties":{"state":{"const":"not_configured","type":"string"}}}]},
    "HttpPassageMeasurements": {"additionalProperties":false,"type":"object","required":["passage_id","role","round","active_time","human_wait","active_limit_state","active_expired_at_ms"],"properties":{"passage_id":{"$ref":"#/$defs/OperationId"},"role":{"$ref":"#/$defs/PassageRole"},"round":{"minimum":1,"maximum":6,"type":"integer"},"active_time":{"$ref":"#/$defs/MeasuredValue"},"human_wait":{"$ref":"#/$defs/MeasuredValue"},"active_limit_state":{"anyOf":[{"const":"within_limit","type":"string"},{"const":"expired","type":"string"},{"const":"unavailable","type":"string"},{"const":"not_applicable","type":"string"}]},"active_expired_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]}}},
    "StageActivity": {"type":"object","additionalProperties":false,"properties":{"stage":{"anyOf":[{"const":"preparing","type":"string"},{"const":"implementing","type":"string"},{"const":"verifying","type":"string"},{"const":"reviewing","type":"string"},{"const":"publishing","type":"string"},{"const":"waiting_decision","type":"string"},{"const":"tracking_lost","type":"string"},{"const":"finished","type":"string"}]},"started_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"elapsed_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"last_activity_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"observed_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991},"deadline_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"remaining_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"tracking_state":{"anyOf":[{"const":"pending","type":"string"},{"const":"tracked","type":"string"},{"const":"lost","type":"string"}]},"availability":{"anyOf":[{"const":"known","type":"string"},{"const":"unavailable","type":"string"}]},"reason":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]}},"required":["stage","started_at_ms","elapsed_ms","last_activity_at_ms","observed_at_ms","deadline_at_ms","remaining_ms","tracking_state","availability","reason"]},
    "OperationResource": {"additionalProperties":false,"type":"object","required":["type","id"],"properties":{"type":{"minLength":1,"maxLength":128,"type":"string"},"id":{"minLength":1,"maxLength":256,"type":"string"}}},
    "OperationId": {"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","type":"string"},
    "HttpExecutionQuestion": {"additionalProperties":false,"type":"object","required":["format_version","decision","context","alternatives"],"properties":{"format_version":{"const":1,"type":"number"},"decision":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"},"context":{"minLength":1,"maxLength":8192,"pattern":".*\\S.*","type":"string"},"alternatives":{"minItems":2,"maxItems":10,"uniqueItems":true,"type":"array","items":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"}}}},
    "HttpScopeChange": {"additionalProperties":false,"type":"object","required":["captured_criteria","current_criteria","captured_digest","current_digest","reasons","observed_at_ms"],"properties":{"captured_criteria":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/Criterion"}},"current_criteria":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/Criterion"}},"captured_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"current_digest":{"pattern":"^[a-f0-9]{64}$","type":"string"},"reasons":{"maxItems":20,"type":"array","items":{"maxLength":128,"type":"string"}},"observed_at_ms":{"minimum":0,"type":"integer"}}},
    "OperationReceipt": {"additionalProperties":false,"type":"object","properties":{"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "AttemptSearchContext": {"type":"object","additionalProperties":false,"properties":{"project_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"result":{"anyOf":[{"anyOf":[{"const":"active","type":"string"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},{"type":"null"}]},"issue_number":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"issue_title":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"start_date":{"anyOf":[{"type":"string","format":"date"},{"type":"null"}]},"end_date":{"anyOf":[{"type":"string","format":"date"},{"type":"null"}]},"time_zone":{"anyOf":[{"type":"string","minLength":1,"maxLength":128},{"type":"null"}]},"start_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"end_before_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]},"insertion_ceiling_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["project_id","result","issue_number","issue_title","start_date","end_date","time_zone","start_at_ms","end_before_ms","insertion_ceiling_at_ms"]},
    "HttpIssueHeader": {"additionalProperties":false,"type":"object","required":["id","number","title","url"],"properties":{"id":{"maxLength":256,"type":"string"},"number":{"minimum":1,"type":"integer"},"title":{"maxLength":65536,"type":"string"},"url":{"maxLength":4096,"type":"string"}}},
    "HttpPublicationSummary": {"additionalProperties":false,"type":"object","required":["mode","review_state","local_state","confirmed_effects","pending_effects","unknown_effects","complete_capability","reconcile_capability"],"properties":{"mode":{"$ref":"#/$defs/DeliveryMode"},"review_state":{"anyOf":[{"anyOf":[{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},{"type":"null"}]},"local_state":{"anyOf":[{"const":"pending","type":"string"},{"const":"completed","type":"string"}]},"commit":{"additionalProperties":false,"type":"object","required":["state","sha","reason","operation_id"],"properties":{"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"sha":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"reason":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]}}},"upgrades":{"maxItems":2,"type":"array","items":{"$ref":"#/$defs/HttpModeUpgradeSummary"}},"push":{"additionalProperties":false,"type":"object","required":["state","receipt","reason"],"properties":{"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"receipt":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"reason":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]}}},"pull_request":{"additionalProperties":false,"type":"object","required":["state","receipt","reason"],"properties":{"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"receipt":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"reason":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]}}},"confirmed_effects":{"minimum":0,"type":"integer"},"pending_effects":{"minimum":0,"type":"integer"},"unknown_effects":{"minimum":0,"type":"integer"},"complete_capability":{"$ref":"#/$defs/Capability"},"reconcile_capability":{"$ref":"#/$defs/Capability"}}},
    "Capability": {"additionalProperties":false,"type":"object","required":["available"],"properties":{"available":{"type":"boolean"},"reason_code":{"minLength":1,"maxLength":128,"type":"string"},"reason":{"minLength":1,"maxLength":2048,"type":"string"},"recovery":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "HttpDetailPage": {"additionalProperties":false,"type":"object","required":["section","items","next_cursor","has_more","event_cursor"],"properties":{"section":{"$ref":"#/$defs/HttpDetailSection"},"items":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/HttpDetailItem"}},"next_cursor":{"anyOf":[{"minLength":1,"maxLength":512,"type":"string"},{"type":"null"}]},"has_more":{"type":"boolean"},"event_cursor":{"pattern":"^[0-9]+$","maxLength":20,"type":"string"}}},
    "DeliverySummaryView": {"type":"object","additionalProperties":false,"properties":{"attempt_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"original_mode":{"$ref":"#/$defs/DeliveryMode"},"authorized_mode":{"$ref":"#/$defs/DeliveryMode"},"review_state":{"anyOf":[{"anyOf":[{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},{"type":"null"}]},"outcome":{"anyOf":[{"const":"pending","type":"string"},{"const":"blocked","type":"string"},{"const":"icr_approved","type":"string"},{"const":"partial","type":"string"},{"const":"complete","type":"string"},{"const":"unavailable","type":"string"}]},"content_identity":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]},"approved_ref":{"anyOf":[{"type":"string","minLength":1,"maxLength":4096},{"type":"null"}]},"code_location":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"local_repository":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"branch_ref":{"anyOf":[{"type":"string","minLength":1,"maxLength":1024},{"type":"null"}]},"commit_sha":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]},"pull_request_url":{"anyOf":[{"type":"string","minLength":1,"maxLength":4096},{"type":"null"}]},"checkout_updated":{"anyOf":[{"const":false,"type":"boolean"}]},"pending_effects":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128},"maxItems":10,"minItems":0},"limitations":{"type":"array","items":{"type":"string","minLength":1,"maxLength":2048},"maxItems":10,"minItems":0},"criteria_satisfied":{"type":"integer","minimum":0,"maximum":9007199254740991},"criteria_total":{"type":"integer","minimum":0,"maximum":9007199254740991},"resolved_findings":{"type":"integer","minimum":0,"maximum":9007199254740991},"details_url":{"type":"string","minLength":1,"maxLength":512}},"required":["attempt_id","delivery_id","original_mode","authorized_mode","review_state","outcome","content_identity","approved_ref","code_location","local_repository","branch_ref","commit_sha","pull_request_url","checkout_updated","pending_effects","limitations","criteria_satisfied","criteria_total","resolved_findings","details_url"]},
    "AttemptBlock": {"anyOf":[{"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/$defs/OperationId"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"reason":{"anyOf":[{"const":"no_progress","type":"string"},{"const":"dispute_maintained","type":"string"},{"const":"correction_limit","type":"string"}]},"delivery_id":{"$ref":"#/$defs/OperationId"},"content_identity":{"$ref":"#/$defs/HttpGitObjectId"},"finding_ids":{"type":"array","items":{"$ref":"#/$defs/OperationId"},"maxItems":1000,"minItems":0},"cause":{"type":"string","minLength":1,"maxLength":2048},"recovery":{"type":"string","minLength":1,"maxLength":2048},"consecutive_no_progress":{"type":"integer","minimum":0,"maximum":6},"corrections_used":{"type":"integer","minimum":0,"maximum":5},"correction_limit":{"type":"integer","minimum":0,"maximum":5},"guidance_capability":{"$ref":"#/$defs/Capability"},"change_profile_capability":{"$ref":"#/$defs/Capability"},"end_capability":{"$ref":"#/$defs/Capability"},"evidence":{"type":"array","items":{"type":"string","minLength":1,"maxLength":4096},"maxItems":20,"minItems":0}},"required":["id","revision","reason","delivery_id","content_identity","finding_ids","cause","recovery","consecutive_no_progress","corrections_used","correction_limit","guidance_capability","change_profile_capability","end_capability","evidence"]},{"type":"null"}]},
    "AttemptV3DetailPage": {"type":"object","additionalProperties":false,"properties":{"section":{"anyOf":[{"const":"decisions","type":"string"},{"const":"profiles","type":"string"},{"const":"finding_assessments","type":"string"},{"const":"finding_disputes","type":"string"},{"const":"target_selections","type":"string"}]},"items":{"type":"array","items":{"anyOf":[{"$ref":"#/$defs/AttemptDecisionView"},{"$ref":"#/$defs/HistoricalEffectiveProfile"},{"$ref":"#/$defs/FindingAssessment"},{"$ref":"#/$defs/FindingDispute"},{"$ref":"#/$defs/PublicationTargetSelection"}]},"maxItems":100,"minItems":0},"next_cursor":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"has_more":{"type":"boolean"}},"required":["section","items","next_cursor","has_more"]},
    "HttpReview": {"additionalProperties":false,"type":"object","required":["id","delivery_id","attempt_id","passage_id","content_identity","state","declared_verdict","reason","independence_state","diagnostic","created_at_ms","completed_at_ms","criteria","findings","resolutions","command_repetitions","assessment_details_url","dispute_details_url"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"content_identity":{"type":"string"},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"declared_verdict":{"anyOf":[{"type":"null"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"reason":{"anyOf":[{"type":"null"},{"type":"string"}]},"independence_state":{"anyOf":[{"const":"pending","type":"string"},{"const":"valid","type":"string"},{"const":"invalid","type":"string"}]},"diagnostic":{"anyOf":[{"type":"null"},{"type":"string"}]},"created_at_ms":{"type":"integer"},"completed_at_ms":{"anyOf":[{"type":"null"},{"type":"integer"}]},"criteria":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/HttpCriterionOutcome"}},"findings":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/HttpFinding"}},"resolutions":{"maxItems":1000,"type":"array","items":{"additionalProperties":false,"type":"object","required":["finding_id","verdict","evidence"],"properties":{"finding_id":{"$ref":"#/$defs/OperationId"},"verdict":{"anyOf":[{"const":"resolved","type":"string"},{"const":"unresolved","type":"string"}]},"evidence":{"type":"array","items":{"type":"string"}}}}},"command_repetitions":{"type":"array","items":{"$ref":"#/$defs/ReviewCommandRepetition"},"maxItems":100},"assessment_details_url":{"type":"string","minLength":1,"maxLength":512},"dispute_details_url":{"type":"string","minLength":1,"maxLength":512}}},
    "HttpPassageBinding": {"additionalProperties":false,"type":"object","required":["attempt_id","passage_id","role","round","delivery_version"],"properties":{"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"role":{"$ref":"#/$defs/PassageRole"},"round":{"minimum":1,"maximum":6,"type":"integer"},"delivery_version":{"$ref":"#/$defs/OperationId"}}},
    "HttpImplementerResult": {"additionalProperties":false,"type":"object","required":["format_version","summary","writes_stopped","criteria","checks","additional_changes_justification"],"properties":{"format_version":{"const":1,"type":"number"},"summary":{"minLength":1,"maxLength":8192,"pattern":".*\\S.*","type":"string"},"writes_stopped":{"const":true,"type":"boolean"},"declared_files":{"maxItems":1000,"uniqueItems":true,"type":"array","items":{"minLength":1,"maxLength":4096,"type":"string"}},"finding_responses":{"maxItems":1000,"type":"array","items":{"additionalProperties":false,"type":"object","required":["finding_id","response","evidence","response_type"],"properties":{"finding_id":{"$ref":"#/$defs/OperationId"},"response":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}},"response_type":{"anyOf":[{"type":"string","const":"corrected"},{"type":"string","const":"disputed"}]}}}},"criteria":{"minItems":1,"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/HttpCriterionOutcome"}},"checks":{"maxItems":50,"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","outcome","evidence"],"properties":{"id":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"outcome":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"evidence":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}}},"additional_changes_justification":{"anyOf":[{"type":"string","minLength":1,"maxLength":8192},{"type":"null"}]}}},
    "HttpDelivery": {"additionalProperties":false,"type":"object","required":["id","attempt_id","producer_passage_id","round","base_sha","capture_state","git_ref","repository_relative","content_identity","commit_sha","has_delta","diagnostic","captured_at_ms","revision","warnings"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"producer_passage_id":{"$ref":"#/$defs/OperationId"},"round":{"minimum":1,"maximum":6,"type":"integer"},"base_sha":{"$ref":"#/$defs/HttpGitObjectId"},"capture_state":{"anyOf":[{"const":"pending","type":"string"},{"const":"running","type":"string"},{"const":"captured","type":"string"},{"const":"failed","type":"string"}]},"git_ref":{"anyOf":[{"type":"null"},{"pattern":"^refs/factory/deliveries/[a-f0-9-]{36}$","type":"string"}]},"repository_relative":{"pattern":"^git/[a-f0-9-]{36}\\.git$","type":"string"},"content_identity":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/HttpGitObjectId"}]},"commit_sha":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/HttpGitObjectId"}]},"has_delta":{"anyOf":[{"type":"null"},{"type":"boolean"}]},"diagnostic":{"anyOf":[{"type":"null"},{"maxLength":128,"type":"string"}]},"captured_at_ms":{"anyOf":[{"type":"null"},{"minimum":0,"type":"integer"}]},"revision":{"minimum":1,"type":"integer"},"warnings":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/HttpCaptureWarning"}}}},
    "HttpAttemptStatus": {"additionalProperties":false,"type":"object","required":["id","project_id","operation_id","passage_id","round","phase","result","suspension","tracking","diagnostic","result_receipt_id","delivery_id","revision","event_cursor"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"operation_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"round":{"minimum":1,"maximum":6,"type":"integer"},"phase":{"anyOf":[{"const":"preparing","type":"string"},{"const":"implementing","type":"string"},{"const":"verifying","type":"string"},{"const":"reviewing","type":"string"},{"const":"publishing","type":"string"},{"const":"finished","type":"string"}]},"result":{"anyOf":[{"type":"null"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},"suspension":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"tracking":{"anyOf":[{"const":"pending","type":"string"},{"const":"tracked","type":"string"},{"const":"lost","type":"string"}]},"diagnostic":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"result_receipt_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"delivery_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"pending_question_id":{"anyOf":[{"type":"null"},{"$ref":"#/$defs/OperationId"}]},"revision":{"minimum":1,"type":"integer"},"event_cursor":{"pattern":"^[0-9]+$","type":"string"}}},
    "DeliveryMode": {"anyOf":[{"const":"icr","type":"string"},{"const":"commit","type":"string"},{"const":"pr","type":"string"}]},
    "HttpReviewSummary": {"additionalProperties":false,"type":"object","required":["id","delivery_id","attempt_id","passage_id","content_identity","state","declared_verdict","reason","independence_state","diagnostic","created_at_ms","completed_at_ms"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"content_identity":{"type":"string"},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"declared_verdict":{"anyOf":[{"type":"null"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"reason":{"anyOf":[{"type":"null"},{"type":"string"}]},"independence_state":{"anyOf":[{"const":"pending","type":"string"},{"const":"valid","type":"string"},{"const":"invalid","type":"string"}]},"diagnostic":{"anyOf":[{"type":"null"},{"type":"string"}]},"created_at_ms":{"type":"integer"},"completed_at_ms":{"anyOf":[{"type":"null"},{"type":"integer"}]}}},
    "HttpDetailSection": {"anyOf":[{"const":"rounds","type":"string"},{"const":"passages","type":"string"},{"const":"criteria","type":"string"},{"const":"reviews","type":"string"},{"const":"findings","type":"string"},{"const":"questions","type":"string"},{"const":"effects","type":"string"},{"const":"resources","type":"string"}]},
    "HttpGitObjectId": {"pattern":"^(?:[a-f0-9]{40}|[a-f0-9]{64})$","type":"string"},
    "HttpDiffEntry": {"additionalProperties":false,"type":"object","required":["path","old_path","status","old_mode","new_mode","binary","unsupported","patch"],"properties":{"path":{"minLength":1,"maxLength":4096,"type":"string"},"old_path":{"anyOf":[{"type":"null"},{"maxLength":4096,"type":"string"}]},"status":{"pattern":"^[ACDMRTUXB][0-9]*$","type":"string"},"old_mode":{"type":"string"},"new_mode":{"type":"string"},"binary":{"type":"boolean"},"unsupported":{"anyOf":[{"type":"null"},{"type":"string"}]},"patch":{"anyOf":[{"type":"null"},{"maxLength":262144,"type":"string"}]}}},
    "HttpControllerEvent": {"additionalProperties":false,"type":"object","required":["seq","entity_type","entity_id","operation_id","event_type","entity_revision","occurred_at_ms","facts"],"properties":{"context":{"additionalProperties":false,"type":"object","properties":{"project_name":{"minLength":1,"maxLength":1024,"type":"string"},"issue_number":{"minimum":1,"type":"integer"},"issue_title":{"minLength":1,"maxLength":16384,"type":"string"},"attempt_created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"round":{"minimum":1,"type":"integer"},"role":{"$ref":"#/$defs/PassageRole"}}},"seq":{"pattern":"^[1-9][0-9]*$","maxLength":20,"type":"string"},"entity_type":{"minLength":1,"maxLength":128,"type":"string"},"entity_id":{"minLength":1,"maxLength":256,"type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"},"event_type":{"minLength":1,"maxLength":128,"type":"string"},"entity_revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"occurred_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"facts":{"$ref":"#/$defs/EmptyBody"},"project_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"}}},
    "HttpAttemptSummary": {"additionalProperties":false,"type":"object","required":["id","project_id","issue_id","issue_number","phase","result","suspension","revision","created_at_ms","updated_at_ms","issue_title"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"issue_id":{"type":"string"},"issue_number":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]},"issue_title":{"anyOf":[{"type":"string","maxLength":65536},{"type":"null"}]},"phase":{"anyOf":[{"const":"preparing","type":"string"},{"const":"implementing","type":"string"},{"const":"verifying","type":"string"},{"const":"reviewing","type":"string"},{"const":"publishing","type":"string"},{"const":"finished","type":"string"}]},"result":{"anyOf":[{"type":"null"},{"const":"delivered","type":"string"},{"const":"rejected","type":"string"},{"const":"failed","type":"string"},{"const":"cancelled","type":"string"},{"const":"interrupted","type":"string"}]},"suspension":{"anyOf":[{"type":"null"},{"minLength":1,"maxLength":256,"type":"string"}]},"revision":{"type":"integer"},"created_at_ms":{"type":"integer"},"updated_at_ms":{"type":"integer"}}},
    "HttpContextDiagnostic": {"additionalProperties":false,"type":"object","required":["check","state","code","cause","affected_requirements","facts","recovery","observed_at_ms"],"properties":{"check":{"$ref":"#/$defs/HttpDiagnosticCheck"},"state":{"anyOf":[{"const":"passed","type":"string"},{"const":"blocked","type":"string"},{"const":"unavailable","type":"string"}]},"code":{"pattern":"^[A-Z][A-Z0-9_]{0,127}$","type":"string"},"cause":{"minLength":1,"maxLength":2048,"type":"string"},"affected_requirements":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}},"facts":{"additionalProperties":false,"type":"object","properties":{"expected_account_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"observed_account_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"expected_host":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"observed_host":{"minLength":1,"maxLength":256,"type":"string"},"project_id":{"$ref":"#/$defs/OperationId"},"creation_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"resource_count":{"minimum":0,"type":"integer"},"uncertain_count":{"minimum":0,"type":"integer"},"profile_count":{"minimum":0,"type":"integer"},"implementer_profile_count":{"minimum":0,"type":"integer"},"reviewer_profile_count":{"minimum":0,"type":"integer"},"onboarding_completed_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]},"projects_root_configured":{"type":"boolean"},"projects_root_confirmed":{"type":"boolean"},"retry_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]}}},"recovery":{"minLength":1,"maxLength":2048,"type":"string"},"observed_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}},
    "HttpDiagnosticCheck": {"anyOf":[{"const":"configuration","type":"string"},{"const":"github_identity","type":"string"},{"const":"maestri_context","type":"string"},{"const":"resources","type":"string"}]},
    "HttpDiagnosticReport": {"additionalProperties":false,"type":"object","required":["receipt","operation_id","state","created_at_ms","completed_at_ms","checks","diagnostics"],"properties":{"receipt":{"$ref":"#/$defs/OperationReceipt"},"operation_id":{"$ref":"#/$defs/OperationId"},"state":{"anyOf":[{"const":"accepted","type":"string"},{"const":"succeeded","type":"string"},{"const":"failed","type":"string"},{"const":"unknown","type":"string"}]},"created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"completed_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]},"checks":{"minItems":1,"maxItems":4,"uniqueItems":true,"type":"array","items":{"$ref":"#/$defs/HttpDiagnosticCheck"}},"diagnostics":{"maxItems":104,"type":"array","items":{"$ref":"#/$defs/HttpContextDiagnostic"}}}},
    "ToolObservation": {"type":"object","additionalProperties":false,"properties":{"tool":{"anyOf":[{"const":"git","type":"string"},{"const":"maestri","type":"string"},{"const":"omp","type":"string"},{"const":"powershell","type":"string"},{"const":"github_cli","type":"string"}]},"candidates":{"type":"array","items":{"$ref":"#/$defs/ToolCandidate"},"maxItems":20,"minItems":0},"selected_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"executable_state":{"anyOf":[{"const":"valid","type":"string"},{"const":"invalid","type":"string"},{"const":"missing","type":"string"},{"const":"ambiguous","type":"string"},{"const":"not_checked","type":"string"}]},"connection_state":{"anyOf":[{"const":"confirmed","type":"string"},{"const":"unavailable","type":"string"},{"const":"not_checked","type":"string"},{"const":"not_applicable","type":"string"}]},"observed_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991},"cause":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]}},"required":["tool","candidates","selected_path","executable_state","connection_state","observed_at_ms","cause","recovery"]},
    "GitHubDiagnostic": {"additionalProperties":false,"type":"object","required":["code","message","recovery"],"properties":{"code":{"anyOf":[{"const":"CONTEXT_UNAVAILABLE","type":"string"},{"const":"AUTHENTICATION_INVALID","type":"string"},{"const":"RATE_LIMITED","type":"string"},{"const":"ACCESS_DENIED","type":"string"},{"const":"NOT_FOUND_OR_INACCESSIBLE","type":"string"},{"const":"RESPONSE_INVALID","type":"string"},{"const":"CLI_UNAVAILABLE","type":"string"},{"const":"QUERY_FAILED","type":"string"},{"const":"QUERY_LIMIT","type":"string"},{"const":"PAGINATION_INVALID","type":"string"},{"const":"REFERENCE_INACCESSIBLE","type":"string"},{"const":"STATUS_FIELD_INACCESSIBLE","type":"string"},{"const":"STATUS_OPTION_INACCESSIBLE","type":"string"},{"const":"INPUT_INVALID","type":"string"},{"const":"BRANCH_NOT_FOUND","type":"string"}]},"message":{"minLength":1,"maxLength":2048,"type":"string"},"recovery":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "Prerequisite": {"additionalProperties":false,"type":"object","required":["code","message","recovery"],"properties":{"code":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"message":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"},"recovery":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"}}},
    "Preparation": {"additionalProperties":false,"type":"object","required":["issue_id","delivery_mode","guidance","overrides","id","project_id","project_revision_id","revision","prerequisites","effective_configuration","criteria_preview","effects_preview","issue","base_sha","summary_hash","diagnostics","retry_at_ms","can_start","publication_target"],"properties":{"issue_id":{"minLength":1,"maxLength":256,"type":"string"},"delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"guidance":{"maxLength":8192,"type":"string"},"overrides":{"$ref":"#/$defs/PreparationOverrides"},"previous_attempt_id":{"$ref":"#/$defs/OperationId"},"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"project_revision_id":{"$ref":"#/$defs/OperationId"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"prerequisites":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}},"effective_configuration":{"$ref":"#/$defs/EffectiveConfiguration"},"criteria_preview":{"$ref":"#/$defs/CriteriaPreview"},"effects_preview":{"type":"array","items":{"$ref":"#/$defs/PreparationEffect"}},"issue":{"anyOf":[{"$ref":"#/$defs/ConfigurationIssueContext"},{"type":"null"}]},"base_sha":{"anyOf":[{"pattern":"^(?:[0-9a-f]{40}|[0-9a-f]{64})$","type":"string"},{"type":"null"}]},"summary_hash":{"pattern":"^[0-9a-f]{64}$","type":"string"},"diagnostics":{"type":"array","items":{"$ref":"#/$defs/GitHubDiagnostic"}},"retry_at_ms":{"anyOf":[{"minimum":0,"type":"integer"},{"type":"null"}]},"can_start":{"const":false,"type":"boolean"},"publication_target":{"anyOf":[{"$ref":"#/$defs/PublicationTargetIntent"},{"type":"null"}]}}},
    "PreparationOverrides": {"additionalProperties":false,"type":"object","properties":{"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"implementer_profile":{"anyOf":[{"additionalProperties":false,"type":"object","required":["kind","id","revision"],"properties":{"kind":{"const":"reference","type":"string"},"id":{"$ref":"#/$defs/OperationId"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"}}},{"additionalProperties":false,"type":"object","required":["kind","profile"],"properties":{"kind":{"const":"value","type":"string"},"profile":{"$ref":"#/$defs/ExecutionProfileValue"}}}]},"reviewer_profile":{"anyOf":[{"additionalProperties":false,"type":"object","required":["kind","id","revision"],"properties":{"kind":{"const":"reference","type":"string"},"id":{"$ref":"#/$defs/OperationId"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"}}},{"additionalProperties":false,"type":"object","required":["kind","profile"],"properties":{"kind":{"const":"value","type":"string"},"profile":{"$ref":"#/$defs/ExecutionProfileValue"}}}]},"correction_limit":{"minimum":0,"maximum":5,"type":"integer"},"time_defaults":{"$ref":"#/$defs/TimeDefaults"},"artifact_policy":{"$ref":"#/$defs/ArtifactPolicy"}}},
    "PreparationChanges": {"additionalProperties":false,"type":"object","properties":{"issue_id":{"minLength":1,"maxLength":256,"type":"string"},"delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"guidance":{"maxLength":8192,"type":"string"},"overrides":{"$ref":"#/$defs/PreparationOverrides"},"publication_target":{"anyOf":[{"$ref":"#/$defs/PublicationTargetIntent"},{"type":"null"}]}}},
    "DeletionTarget": {"additionalProperties":false,"type":"object","required":["target_key","target_kind","path","state"],"properties":{"target_key":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"target_kind":{"anyOf":[{"const":"original_directory","type":"string"},{"const":"exclusive_workspace","type":"string"},{"const":"exclusive_artifact","type":"string"}]},"path":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"removing","type":"string"},{"const":"removed","type":"string"},{"const":"blocked","type":"string"}]}}},
    "DeletionBlocker": {"additionalProperties":false,"type":"object","required":["reason","recovery"],"properties":{"reason":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"},"recovery":{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"}}},
    "DeletionPending": {"additionalProperties":false,"type":"object","required":["operation_id","project_id","project_name","state","revision","targets","blockers","can_retry"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"project_name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"state":{"anyOf":[{"const":"accepted","type":"string"},{"const":"running","type":"string"},{"const":"pending","type":"string"},{"const":"reconfirmation_required","type":"string"},{"const":"finalizing","type":"string"}]},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"targets":{"type":"array","items":{"$ref":"#/$defs/DeletionTarget"}},"blockers":{"type":"array","items":{"$ref":"#/$defs/DeletionBlocker"}},"can_retry":{"type":"boolean"}}},
    "DeletionCompleted": {"additionalProperties":false,"type":"object","required":["operation_id","state"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"state":{"const":"succeeded","type":"string"}}},
    "ProjectSummary": {"additionalProperties":false,"type":"object","required":["deletion","id","name","account_id","source","base_branch","revision","current_revision_id","prerequisites"],"properties":{"deletion":{"anyOf":[{"$ref":"#/$defs/DeletionSummary"},{"type":"null"}]},"id":{"$ref":"#/$defs/OperationId"},"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"account_id":{"anyOf":[{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"source":{"additionalProperties":false,"type":"object","required":["kind","location"],"properties":{"kind":{"anyOf":[{"const":"local","type":"string"},{"const":"github","type":"string"}]},"location":{"minLength":1,"maxLength":32768,"type":"string"},"repository_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"repository_url":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}},"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"current_revision_id":{"$ref":"#/$defs/OperationId"},"prerequisites":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}},
    "DeletionSummary": {"additionalProperties":false,"type":"object","required":["operation_id","state","reason","recovery"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"state":{"anyOf":[{"const":"accepted","type":"string"},{"const":"running","type":"string"},{"const":"pending","type":"string"},{"const":"reconfirmation_required","type":"string"},{"const":"finalizing","type":"string"}]},"reason":{"anyOf":[{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"recovery":{"anyOf":[{"minLength":1,"maxLength":2048,"pattern":".*\\S.*","type":"string"},{"type":"null"}]}}},
    "OriginSource": {"additionalProperties":false,"type":"object","required":["kind","location"],"properties":{"kind":{"anyOf":[{"const":"local","type":"string"},{"const":"github","type":"string"}]},"location":{"minLength":1,"maxLength":32768,"type":"string"}}},
    "FactorySettings": {"additionalProperties":false,"type":"object","required":["id","installation_id","account_id","designated_host","projects_root","automation_enabled","time_defaults","artifact_policy","revision","created_at_ms","updated_at_ms"],"properties":{"id":{"const":"local","type":"string"},"installation_id":{"minLength":1,"maxLength":128,"type":"string"},"account_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"designated_host":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"projects_root":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"automation_enabled":{"type":"boolean"},"time_defaults":{"$ref":"#/$defs/TimeDefaults"},"artifact_policy":{"$ref":"#/$defs/ArtifactPolicy"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"updated_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}},
    "StoredExecutionProfile": {"additionalProperties":false,"type":"object","required":["name","profile_type","executor","provider","model","effort","guidance","id","revision","created_at_ms","updated_at_ms","composition_version"],"properties":{"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"profile_type":{"$ref":"#/$defs/PassageRole"},"executor":{"const":"maestri-omp","type":"string"},"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"effort":{"anyOf":[{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"guidance":{"maxLength":8192,"type":"string"},"id":{"$ref":"#/$defs/OperationId"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"updated_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"composition_version":{"anyOf":[{"type":"integer","minimum":1,"maximum":9007199254740991},{"type":"null"}]}}},
    "ProfileCounts": {"additionalProperties":false,"type":"object","required":["all","implementer","reviewer"],"properties":{"all":{"minimum":0,"maximum":100,"type":"integer"},"implementer":{"minimum":0,"maximum":100,"type":"integer"},"reviewer":{"minimum":0,"maximum":100,"type":"integer"}}},
    "OnboardingView": {"additionalProperties":false,"type":"object","required":["suppressed","completed_at_ms","first_incomplete_step","prerequisites"],"properties":{"suppressed":{"type":"boolean"},"completed_at_ms":{"anyOf":[{"minimum":0,"maximum":9007199254740991,"type":"integer"},{"type":"null"}]},"first_incomplete_step":{"anyOf":[{"$ref":"#/$defs/OnboardingStep"},{"type":"null"}]},"prerequisites":{"maxItems":4,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}},
    "SelectionCapabilities": {"additionalProperties":false,"type":"object","required":["projects_root","gh_executable"],"properties":{"projects_root":{"$ref":"#/$defs/Capability"},"gh_executable":{"$ref":"#/$defs/Capability"}}},
    "ToolPreferences": {"type":"object","additionalProperties":false,"properties":{"format_version":{"anyOf":[{"const":1,"type":"number"}]},"git":{"type":"object","additionalProperties":false,"properties":{"preferred_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"last_validated_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}},"required":["preferred_path","last_validated_at_ms"]},"maestri":{"type":"object","additionalProperties":false,"properties":{"preferred_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"last_validated_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}},"required":["preferred_path","last_validated_at_ms"]},"omp":{"type":"object","additionalProperties":false,"properties":{"preferred_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"last_validated_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}},"required":["preferred_path","last_validated_at_ms"]},"powershell":{"type":"object","additionalProperties":false,"properties":{"preferred_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"last_validated_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}},"required":["preferred_path","last_validated_at_ms"]}},"required":["format_version","git","maestri","omp","powershell"]},
    "GitHubExecutableObservation": {"anyOf":[{"additionalProperties":false,"type":"object","required":["state","path","version","diagnostics"],"properties":{"state":{"const":"observed","type":"string"},"path":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"version":{"minLength":1,"maxLength":64,"pattern":".*\\S.*","type":"string"},"diagnostics":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}},{"additionalProperties":false,"type":"object","required":["state","path","version","diagnostics"],"properties":{"state":{"anyOf":[{"const":"not_found","type":"string"},{"const":"unavailable","type":"string"}]},"path":{"type":"null"},"version":{"type":"null"},"diagnostics":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/Prerequisite"}}}}]},
    "GitHubAccount": {"additionalProperties":false,"type":"object","required":["id","login"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"login":{"minLength":1,"maxLength":100,"type":"string"}}},
    "GitHubSetupAccount": {"additionalProperties":false,"type":"object","required":["id","login","active","valid","eligible"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"login":{"minLength":1,"maxLength":100,"type":"string"},"active":{"type":"boolean"},"valid":{"type":"boolean"},"eligible":{"type":"boolean"}}},
    "CatalogModel": {"additionalProperties":false,"type":"object","required":["provider","provider_name","model","model_name","efforts"],"properties":{"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"provider_name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model_name":{"minLength":1,"maxLength":512,"pattern":".*\\S.*","type":"string"},"efforts":{"maxItems":64,"type":"array","items":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"}}}},
    "OperationWarning": {"additionalProperties":false,"type":"object","required":["code","message"],"properties":{"code":{"minLength":1,"maxLength":128,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "GlobalChanges": {"additionalProperties":false,"type":"object","properties":{"projects_root":{"anyOf":[{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"automation_enabled":{"type":"boolean"},"time_defaults":{"additionalProperties":false,"type":"object","properties":{"format_version":{"const":1,"type":"number"},"polling_interval_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"polling_backoff_max_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"passage_active_time_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"question_ttl":{"$ref":"#/$defs/ConfiguredLimit"}}},"artifact_policy":{"additionalProperties":false,"type":"object","properties":{"format_version":{"const":1,"type":"number"},"automatic_deletion":{"const":false,"type":"boolean"}}}}},
    "OnboardingChanges": {"additionalProperties":false,"minProperties":1,"type":"object","properties":{"suppressed":{"type":"boolean"},"complete":{"const":true,"type":"boolean"}}},
    "ProfileChanges": {"maxItems":100,"type":"array","items":{"anyOf":[{"additionalProperties":false,"type":"object","required":["action","profile"],"properties":{"action":{"const":"create","type":"string"},"profile":{"$ref":"#/$defs/ProfileCreate"}}},{"additionalProperties":false,"type":"object","required":["action","id","changes"],"properties":{"action":{"const":"update","type":"string"},"id":{"$ref":"#/$defs/OperationId"},"changes":{"$ref":"#/$defs/ProfilePatch"}}},{"additionalProperties":false,"type":"object","required":["action","id"],"properties":{"action":{"const":"delete","type":"string"},"id":{"$ref":"#/$defs/OperationId"}}}]}},
    "AccountBinding": {"additionalProperties":false,"type":"object","required":["action","account_id"],"properties":{"action":{"anyOf":[{"const":"bind","type":"string"},{"const":"switch","type":"string"}]},"account_id":{"minLength":1,"maxLength":256,"type":"string"}}},
    "ProjectRevision": {"additionalProperties":false,"type":"object","required":["source","base_branch","github_project","implementer_profile_id","reviewer_profile_id","correction_limit","default_delivery_mode","automation_enabled","queue_order","guidance","id","project_id","revision","created_at_ms"],"properties":{"source":{"additionalProperties":false,"type":"object","required":["kind","location"],"properties":{"kind":{"anyOf":[{"const":"local","type":"string"},{"const":"github","type":"string"}]},"location":{"minLength":1,"maxLength":32768,"type":"string"},"repository_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"repository_url":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}},"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"github_project":{"anyOf":[{"$ref":"#/$defs/ReadProjectMapping"},{"type":"null"}]},"implementer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"reviewer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"correction_limit":{"minimum":0,"maximum":5,"type":"integer"},"default_delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"automation_enabled":{"type":"boolean"},"queue_order":{"$ref":"#/$defs/QueueOrder"},"guidance":{"maxLength":8192,"type":"string"},"id":{"$ref":"#/$defs/OperationId"},"project_id":{"$ref":"#/$defs/OperationId"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}},
    "ProjectStorageView": {"type":"object","additionalProperties":false,"properties":{"managed_root":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"original_path":{"anyOf":[{"type":"string","minLength":1,"maxLength":32768},{"type":"null"}]},"locations":{"type":"array","items":{"$ref":"#/$defs/ProjectStorageLocation"},"maxItems":100,"minItems":0},"transition_plan":{"anyOf":[{"$ref":"#/$defs/StorageTransitionPlan"},{"type":"null"}]},"active_transition_operation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"state":{"anyOf":[{"const":"current","type":"string"},{"const":"legacy","type":"string"},{"const":"transitioning","type":"string"},{"const":"uncertain","type":"string"},{"const":"blocked","type":"string"}]},"cause":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]}},"required":["managed_root","original_path","locations","transition_plan","active_transition_operation_id","state","cause","recovery"]},
    "ProjectChanges": {"additionalProperties":false,"type":"object","properties":{"source":{"$ref":"#/$defs/OriginSource"},"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"github_project":{"anyOf":[{"$ref":"#/$defs/ProjectMapping"},{"type":"null"}]},"implementer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"reviewer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"correction_limit":{"minimum":0,"maximum":5,"type":"integer"},"default_delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"automation_enabled":{"type":"boolean"},"queue_order":{"$ref":"#/$defs/QueueOrder"},"guidance":{"maxLength":8192,"type":"string"}}},
    "GitHubProject": {"additionalProperties":false,"type":"object","required":["id","number","title","url","owner","closed"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"number":{"minimum":1,"type":"integer"},"title":{"minLength":1,"maxLength":4096,"type":"string"},"url":{"minLength":1,"maxLength":1024,"type":"string"},"owner":{"additionalProperties":false,"type":"object","required":["id","login","kind"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"login":{"minLength":1,"maxLength":100,"type":"string"},"kind":{"anyOf":[{"const":"user","type":"string"},{"const":"organization","type":"string"}]}}},"closed":{"type":"boolean"}}},
    "StatusField": {"additionalProperties":false,"type":"object","required":["id","name","options"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"name":{"minLength":1,"maxLength":1024,"type":"string"},"options":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","name"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"name":{"minLength":1,"maxLength":1024,"type":"string"}}}}}},
    "HttpQueueScope": {"additionalProperties":false,"type":"object","required":["kind","project_ids"],"properties":{"kind":{"anyOf":[{"const":"account","type":"string"},{"const":"project","type":"string"}]},"project_ids":{"maxItems":100,"uniqueItems":true,"type":"array","items":{"$ref":"#/$defs/OperationId"}}}},
    "HttpQueueItem": {"additionalProperties":false,"type":"object","required":["project_id","project_name","item_id","kind","issue_id","number","title","url","assignees","status","ready","ready_eligible","eligible","reasons","consumption","attempt_id","order"],"properties":{"project_id":{"$ref":"#/$defs/OperationId"},"project_name":{"minLength":1,"maxLength":256,"type":"string"},"item_id":{"minLength":1,"maxLength":256,"type":"string"},"kind":{"anyOf":[{"const":"issue","type":"string"},{"const":"draft","type":"string"},{"const":"pull_request","type":"string"},{"const":"inaccessible","type":"string"}]},"issue_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"number":{"anyOf":[{"minimum":1,"type":"integer"},{"type":"null"}]},"title":{"anyOf":[{"minLength":1,"maxLength":65536,"type":"string"},{"type":"null"}]},"url":{"anyOf":[{"minLength":1,"maxLength":2048,"type":"string"},{"type":"null"}]},"assignees":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/GitHubAccount"}},"status":{"anyOf":[{"minLength":1,"maxLength":1024,"type":"string"},{"type":"null"}]},"ready":{"type":"boolean"},"ready_eligible":{"type":"boolean"},"eligible":{"type":"boolean"},"reasons":{"maxItems":20,"type":"array","items":{"$ref":"#/$defs/HttpQueueReason"}},"consumption":{"anyOf":[{"const":"available","type":"string"},{"const":"consumed","type":"string"},{"const":"active","type":"string"},{"const":"unknown","type":"string"}]},"attempt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"order":{"additionalProperties":false,"type":"object","required":["position","criterion","value"],"properties":{"position":{"minimum":1,"type":"integer"},"criterion":{"minLength":1,"maxLength":256,"type":"string"},"value":{"anyOf":[{"minLength":1,"maxLength":1024,"type":"string"},{"type":"null"}]}}}}},
    "HttpQueueDiagnostic": {"additionalProperties":false,"type":"object","required":["code","message","recovery"],"properties":{"code":{"minLength":1,"maxLength":128,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"},"recovery":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "HttpQueueConflict": {"additionalProperties":false,"type":"object","required":["code","message","request_id","queue"],"properties":{"code":{"minLength":1,"maxLength":128,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"},"request_id":{"minLength":1,"maxLength":128,"type":"string"},"field_errors":{"maxItems":100,"type":"array","items":{"additionalProperties":false,"type":"object","required":["field","message"],"properties":{"field":{"minLength":1,"maxLength":256,"type":"string"},"message":{"minLength":1,"maxLength":2048,"type":"string"}}}},"resource":{"$ref":"#/$defs/OperationResource"},"operation_id":{"$ref":"#/$defs/OperationId"},"facts":{"type":"object","patternProperties":{"^(.*)$":{"anyOf":[{"maxLength":2048,"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}},"affected_requirements":{"maxItems":100,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}},"recovery":{"minLength":1,"maxLength":2048,"type":"string"},"queue":{"$ref":"#/$defs/HttpQueueObservation"}}},
    "HttpAttemptResource": {"additionalProperties":false,"type":"object","required":["id","attempt_id","passage_id","kind","reference","owned","launch_state","stop_state","diagnostic","revision","removed","attempt_session_id","managed_terminal_id","occupancy_state","session_tracking_state","observed_at_ms"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"kind":{"anyOf":[{"const":"implementation","type":"string"},{"const":"terminal","type":"string"}]},"reference":{"minLength":1,"maxLength":4096,"type":"string"},"owned":{"type":"boolean"},"launch_state":{"anyOf":[{"const":"planned","type":"string"},{"const":"starting","type":"string"},{"const":"ready","type":"string"},{"const":"partial","type":"string"},{"const":"failed","type":"string"}]},"stop_state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"requested","type":"string"},{"const":"confirmed","type":"string"},{"const":"uncertain","type":"string"}]},"diagnostic":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"revision":{"minimum":1,"type":"integer"},"removed":{"type":"boolean"},"attempt_session_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"managed_terminal_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"occupancy_state":{"anyOf":[{"anyOf":[{"type":"string","const":"reserved"},{"type":"string","const":"active"},{"type":"string","const":"uncertain"},{"type":"string","const":"released"}]},{"type":"null"}]},"session_tracking_state":{"anyOf":[{"anyOf":[{"type":"string","const":"pending"},{"type":"string","const":"tracked"},{"type":"string","const":"lost"}]},{"type":"null"}]},"observed_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}}},
    "HttpRecoveryCapability": {"additionalProperties":false,"type":"object","required":["available","reason"],"properties":{"available":{"type":"boolean"},"reason":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]}}},
    "HttpScaffoldAccount": {"additionalProperties":false,"type":"object","required":["state","id","login"],"properties":{"state":{"minLength":1,"maxLength":128,"type":"string"},"id":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"login":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]}}},
    "HttpScaffoldFile": {"additionalProperties":false,"type":"object","required":["path","bytes","sha256"],"properties":{"path":{"minLength":1,"maxLength":1024,"type":"string"},"bytes":{"minimum":0,"maximum":65536,"type":"integer"},"sha256":{"pattern":"^[a-f0-9]{64}$","type":"string"}}},
    "HttpScaffoldEngineering": {"additionalProperties":false,"type":"object","required":["tracker","domain","instruction_file","triage_enabled","installs_skills","creates_labels"],"properties":{"tracker":{"const":"github","type":"string"},"domain":{"const":"single-context","type":"string"},"instruction_file":{"const":"AGENTS.md","type":"string"},"triage_enabled":{"type":"boolean"},"installs_skills":{"const":false,"type":"boolean"},"creates_labels":{"const":false,"type":"boolean"}}},
    "HttpProjectCreation": {"additionalProperties":false,"type":"object","required":["id","operation_id","project_id","plan_hash","plan","state","revision","baseline_sha","baseline_ref","diagnostic","created_at_ms"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"operation_id":{"$ref":"#/$defs/OperationId"},"project_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"plan":{"$ref":"#/$defs/HttpScaffoldPlan"},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"running","type":"string"},{"const":"completed","type":"string"},{"const":"partial","type":"string"},{"const":"failed","type":"string"}]},"revision":{"minimum":1,"type":"integer"},"baseline_sha":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]},"baseline_ref":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"diagnostic":{"anyOf":[{"minLength":1,"maxLength":4096,"type":"string"},{"type":"null"}]},"created_at_ms":{"minimum":0,"type":"integer"}}},
    "HttpCreationStep": {"additionalProperties":false,"type":"object","required":["step","state"],"properties":{"step":{"anyOf":[{"const":"directory","type":"string"},{"const":"files","type":"string"},{"const":"git","type":"string"},{"const":"baseline","type":"string"},{"const":"registration","type":"string"}]},"state":{"anyOf":[{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"unknown","type":"string"}]}}},
    "HttpCreationEffect": {"additionalProperties":false,"type":"object","required":["operation_id","attempt_id","creation_id","delivery_id","kind","scope_key","state","expected_identity","confirmed_identity","receipt","reason","authorized","revision","sent_at_ms","confirmed_at_ms"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"type":"null"},"creation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"delivery_id":{"type":"null"},"kind":{"anyOf":[{"const":"create_repository","type":"string"},{"const":"associate_origin","type":"string"},{"const":"baseline_push","type":"string"}]},"scope_key":{"minLength":1,"maxLength":256,"type":"string"},"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"expected_identity":{"$ref":"#/$defs/HttpCreationEffectIdentity"},"confirmed_identity":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"receipt":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"reason":{"anyOf":[{"minLength":1,"maxLength":128,"type":"string"},{"type":"null"}]},"authorized":{"type":"boolean"},"revision":{"minimum":1,"type":"integer"},"sent_at_ms":{"anyOf":[{"type":"integer"},{"type":"null"}]},"confirmed_at_ms":{"anyOf":[{"type":"integer"},{"type":"null"}]}}},
    "HttpCreationEffectIdentity": {"additionalProperties":false,"type":"object","properties":{"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"owner_id":{"minLength":1,"maxLength":256,"type":"string"},"repository_owner":{"minLength":1,"maxLength":256,"type":"string"},"repository_name":{"minLength":1,"maxLength":100,"type":"string"},"visibility":{"anyOf":[{"const":"private","type":"string"},{"const":"public","type":"string"}]},"marker":{"minLength":1,"maxLength":512,"type":"string"},"repository_id":{"minLength":1,"maxLength":256,"type":"string"},"commit_sha":{"$ref":"#/$defs/HttpGitObjectId"},"branch_ref":{"minLength":1,"maxLength":1024,"type":"string"}}},
    "CreationBoardOperation": {"type":"object","additionalProperties":false,"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"creation_id":{"$ref":"#/$defs/OperationId"},"kind":{"anyOf":[{"const":"create_board","type":"string"},{"const":"configure_status","type":"string"},{"const":"link_repository","type":"string"},{"const":"configure_view","type":"string"},{"const":"verify_board","type":"string"}]},"scope_key":{"type":"string","minLength":1,"maxLength":512},"state":{"anyOf":[{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"}]},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"project_id":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"project_url":{"anyOf":[{"type":"string","minLength":1,"maxLength":4096},{"type":"null"}]},"status_field_id":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"options":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"key":{"anyOf":[{"const":"backlog","type":"string"},{"const":"ready","type":"string"},{"const":"in_progress","type":"string"},{"const":"in_review","type":"string"},{"const":"delivered","type":"string"}]},"id":{"type":"string","minLength":1,"maxLength":256},"name":{"type":"string","minLength":1,"maxLength":256},"position":{"type":"integer","minimum":0,"maximum":4}},"required":["key","id","name","position"]},"maxItems":5,"minItems":0},"kanban_verified":{"type":"boolean"},"repository_link_verified":{"type":"boolean"},"reason":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"observed_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}},"required":["operation_id","creation_id","kind","scope_key","state","revision","project_id","project_url","status_field_id","options","kanban_verified","repository_link_verified","reason","recovery","observed_at_ms"]},
    "PassageRole": {"anyOf":[{"const":"implementer","type":"string"},{"const":"reviewer","type":"string"}]},
    "Criterion": {"additionalProperties":false,"type":"object","required":["id","text","occurrence_index","explicit"],"properties":{"id":{"pattern":"^ac-[1-9][0-9]*$","maxLength":128,"type":"string"},"text":{"minLength":1,"maxLength":65536,"type":"string"},"occurrence_index":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"explicit":{"type":"boolean"}}},
    "HttpModeUpgradeSummary": {"additionalProperties":false,"type":"object","required":["target_mode","additional_effects","summary_hash","capability"],"properties":{"target_mode":{"$ref":"#/$defs/DeliveryMode"},"additional_effects":{"type":"array","items":{"anyOf":[{"const":"issue_comment","type":"string"},{"const":"project_status","type":"string"},{"const":"local_commit","type":"string"},{"const":"push","type":"string"},{"const":"pull_request","type":"string"},{"const":"create_repository","type":"string"},{"const":"associate_origin","type":"string"},{"const":"baseline_push","type":"string"}]}},"summary_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"capability":{"$ref":"#/$defs/Capability"}}},
    "HttpEffectReceipt": {"additionalProperties":false,"type":"object","required":["id"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"url":{"minLength":1,"maxLength":4096,"type":"string"},"option_id":{"minLength":1,"maxLength":256,"type":"string"},"content_identity":{"minLength":1,"maxLength":4096,"type":"string"},"parent_sha":{"minLength":1,"maxLength":4096,"type":"string"},"branch_ref":{"minLength":1,"maxLength":4096,"type":"string"},"operation_id":{"$ref":"#/$defs/OperationId"},"commit_sha":{"minLength":1,"maxLength":4096,"type":"string"},"repository_id":{"minLength":1,"maxLength":256,"type":"string"},"base_branch":{"minLength":1,"maxLength":4096,"type":"string"},"owner_id":{"minLength":1,"maxLength":256,"type":"string"},"repository_name":{"minLength":1,"maxLength":4096,"type":"string"},"visibility":{"anyOf":[{"const":"private","type":"string"},{"const":"public","type":"string"}]}}},
    "HttpDetailItem": {"anyOf":[{"additionalProperties":false,"type":"object","required":["round","delivery_id","producer_passage_id","producer_receipt_id","review_id","review_state","content_identity"],"properties":{"round":{"minimum":1,"maximum":6,"type":"integer"},"delivery_id":{"$ref":"#/$defs/OperationId"},"producer_passage_id":{"$ref":"#/$defs/OperationId"},"producer_receipt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"review_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"review_state":{"anyOf":[{"type":"null"},{"const":"pending","type":"string"},{"const":"approved","type":"string"},{"const":"rejected","type":"string"}]},"content_identity":{"anyOf":[{"type":"null"},{"type":"string"}]}}},{"$ref":"#/$defs/HttpPassageSummary"},{"$ref":"#/$defs/HttpCriterionDetail"},{"$ref":"#/$defs/HttpReviewSummary"},{"$ref":"#/$defs/HttpFindingDetail"},{"$ref":"#/$defs/HttpQuestionSummary"},{"$ref":"#/$defs/HttpEffectView"},{"$ref":"#/$defs/HttpAttemptResource"}]},
    "HttpCriterionOutcome": {"additionalProperties":false,"type":"object","required":["criterion_id","verdict","evidence"],"properties":{"criterion_id":{"pattern":"^ac-[1-9][0-9]*$","maxLength":128,"type":"string"},"verdict":{"anyOf":[{"const":"passed","type":"string"},{"const":"failed","type":"string"},{"const":"not_verified","type":"string"}]},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}}},
    "HttpFinding": {"additionalProperties":false,"type":"object","required":["key","criterion_ids","category","problem","evidence","expected_result","blocking","id","review_id","attempt_id","priority","origin_finding_id","delivery_id","content_identity"],"properties":{"key":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"criterion_ids":{"maxItems":1000,"uniqueItems":true,"type":"array","items":{"pattern":"^ac-[1-9][0-9]*$","maxLength":128,"type":"string"}},"category":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"problem":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}},"expected_result":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"blocking":{"type":"boolean"},"id":{"$ref":"#/$defs/OperationId"},"review_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"priority":{"anyOf":[{"anyOf":[{"type":"string","const":"critical"},{"type":"string","const":"high"},{"type":"string","const":"medium"},{"type":"string","const":"low"}]},{"type":"null"}]},"origin_finding_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"delivery_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"content_identity":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]}}},
    "HttpCaptureWarning": {"additionalProperties":false,"type":"object","required":["attempt_id","passage_id","delivery_id","path","reason"],"properties":{"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"path":{"minLength":1,"maxLength":4096,"type":"string"},"reason":{"anyOf":[{"const":"DECLARED_NEW_FILE_IGNORED","type":"string"},{"const":"KNOWN_SECRET_EXCLUDED","type":"string"}]}}},
    "ToolCandidate": {"type":"object","additionalProperties":false,"properties":{"path":{"type":"string","minLength":1,"maxLength":32768},"state":{"anyOf":[{"const":"valid","type":"string"},{"const":"invalid","type":"string"},{"const":"not_checked","type":"string"}]},"cause":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]},"recovery":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048},{"type":"null"}]}},"required":["path","state","cause","recovery"]},
    "EffectiveConfiguration": {"additionalProperties":false,"type":"object","required":["configuration","project_revision_id","settings_revision","implementer_profile","reviewer_profile","time_defaults","artifact_policy","guidance","origins"],"properties":{"configuration":{"$ref":"#/$defs/ProjectConfiguration"},"project_revision_id":{"$ref":"#/$defs/OperationId"},"settings_revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"implementer_profile":{"anyOf":[{"$ref":"#/$defs/ExecutionProfileValue"},{"$ref":"#/$defs/StoredExecutionProfileValue"},{"type":"null"}]},"reviewer_profile":{"anyOf":[{"$ref":"#/$defs/ExecutionProfileValue"},{"$ref":"#/$defs/StoredExecutionProfileValue"},{"type":"null"}]},"time_defaults":{"$ref":"#/$defs/TimeDefaults"},"artifact_policy":{"$ref":"#/$defs/ArtifactPolicy"},"guidance":{"maxLength":16385,"type":"string"},"origins":{"$ref":"#/$defs/ChoiceOrigins"}}},
    "CriteriaPreview": {"additionalProperties":false,"type":"object","required":["executable","objective","criteria","digest","reasons"],"properties":{"executable":{"type":"boolean"},"objective":{"maxLength":1000000,"type":"string"},"criteria":{"maxItems":1000,"type":"array","items":{"$ref":"#/$defs/Criterion"}},"digest":{"pattern":"^[0-9a-f]{64}$","type":"string"},"reasons":{"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":128,"type":"string"}}}},
    "PreparationEffect": {"additionalProperties":false,"type":"object","required":["kind","requested","description"],"properties":{"kind":{"anyOf":[{"const":"clone","type":"string"},{"const":"execute","type":"string"},{"const":"local_commit","type":"string"},{"const":"push","type":"string"},{"const":"pull_request","type":"string"},{"const":"issue_comment","type":"string"},{"const":"project_status","type":"string"}]},"requested":{"type":"boolean"},"description":{"minLength":1,"maxLength":2048,"type":"string"}}},
    "ConfigurationIssueContext": {"additionalProperties":false,"type":"object","required":["id","number","url","title","body","state","assignees","blockers","references","repository","comments","memberships"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"number":{"minimum":1,"type":"integer"},"url":{"minLength":1,"maxLength":1024,"type":"string"},"title":{"minLength":1,"maxLength":65536,"type":"string"},"body":{"maxLength":1000000,"type":"string"},"state":{"anyOf":[{"const":"OPEN","type":"string"},{"const":"CLOSED","type":"string"}]},"assignees":{"type":"array","items":{"$ref":"#/$defs/GitHubAccount"}},"blockers":{"type":"array","items":{"$ref":"#/$defs/IssueBlocker"}},"references":{"type":"array","items":{"minLength":1,"maxLength":4096,"type":"string"}},"repository":{"additionalProperties":false,"type":"object","required":["id","owner","name","url","default_branch","is_archived","is_private"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"owner":{"$ref":"#/$defs/GitHubAccount"},"name":{"minLength":1,"maxLength":100,"type":"string"},"url":{"minLength":1,"maxLength":1024,"type":"string"},"default_branch":{"anyOf":[{"minLength":1,"maxLength":1024,"type":"string"},{"type":"null"}]},"is_archived":{"type":"boolean"},"is_private":{"type":"boolean"}}},"comments":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["id","url","body","author","updated_at"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"url":{"minLength":1,"maxLength":1024,"type":"string"},"body":{"maxLength":1000000,"type":"string"},"author":{"anyOf":[{"additionalProperties":false,"type":"object","required":["login"],"properties":{"login":{"minLength":1,"maxLength":100,"type":"string"},"id":{"minLength":1,"maxLength":256,"type":"string"}}},{"type":"null"}]},"updated_at":{"minLength":1,"maxLength":64,"type":"string"}}}},"memberships":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["archived","item_id","project_id","status_values"],"properties":{"archived":{"type":"boolean"},"item_id":{"minLength":1,"maxLength":256,"type":"string"},"project_id":{"minLength":1,"maxLength":256,"type":"string"},"status_values":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["field_id","option_id","name"],"properties":{"field_id":{"minLength":1,"maxLength":256,"type":"string"},"option_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]},"name":{"anyOf":[{"minLength":1,"maxLength":1024,"type":"string"},{"type":"null"}]}}}},"number_values":{"type":"array","items":{"additionalProperties":false,"type":"object","required":["field_id","value"],"properties":{"field_id":{"minLength":1,"maxLength":256,"type":"string"},"value":{"anyOf":[{"type":"number"},{"type":"null"}]}}}}}}}}},
    "ExecutionProfileValue": {"additionalProperties":false,"type":"object","required":["name","executor","provider","model","effort","guidance"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"executor":{"const":"maestri-omp","type":"string"},"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"effort":{"anyOf":[{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"guidance":{"maxLength":8192,"type":"string"}}},
    "TimeDefaults": {"additionalProperties":false,"type":"object","required":["format_version","polling_interval_ms","passage_active_time_ms","question_ttl"],"properties":{"format_version":{"const":1,"type":"number"},"polling_interval_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"polling_backoff_max_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"passage_active_time_ms":{"minimum":1,"maximum":2147483647,"type":"integer"},"question_ttl":{"$ref":"#/$defs/ConfiguredLimit"}}},
    "ArtifactPolicy": {"additionalProperties":false,"type":"object","required":["format_version","automatic_deletion"],"properties":{"format_version":{"const":1,"type":"number"},"automatic_deletion":{"const":false,"type":"boolean"}}},
    "OnboardingStep": {"anyOf":[{"const":"github","type":"string"},{"const":"projects_root","type":"string"},{"const":"profiles","type":"string"}]},
    "ProfileCreate": {"additionalProperties":false,"type":"object","required":["name","profile_type","executor","provider","model","effort"],"properties":{"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"profile_type":{"$ref":"#/$defs/PassageRole"},"executor":{"const":"maestri-omp","type":"string"},"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"effort":{"anyOf":[{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"guidance":{"maxLength":8192,"type":"string"}}},
    "ProfilePatch": {"additionalProperties":false,"type":"object","properties":{"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"profile_type":{"$ref":"#/$defs/PassageRole"},"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"effort":{"anyOf":[{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"guidance":{"maxLength":8192,"type":"string"}}},
    "ProjectMapping": {"additionalProperties":false,"type":"object","required":["id","owner_id","status_field_id","status_option_ids"],"properties":{"id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"owner_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"status_field_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"status_option_ids":{"additionalProperties":false,"type":"object","required":["ready","in_progress","in_review","delivered","backlog"],"properties":{"ready":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"in_progress":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"in_review":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"delivered":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"backlog":{"type":"string","minLength":1,"maxLength":256}}}}},
    "QueueOrder": {"additionalProperties":false,"type":"object","required":["use_board_position"],"properties":{"use_board_position":{"type":"boolean"}}},
    "ProjectStorageLocation": {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/$defs/OperationId"},"location_key":{"type":"string","minLength":1,"maxLength":256},"layout_version":{"type":"integer","minimum":1,"maximum":9007199254740991},"path":{"type":"string","minLength":1,"maxLength":32768},"current":{"type":"boolean"},"verified_at_ms":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["id","location_key","layout_version","path","current","verified_at_ms"]},
    "StorageTransitionPlan": {"type":"object","additionalProperties":false,"properties":{"location_key":{"type":"string","minLength":1,"maxLength":256},"source_location_id":{"$ref":"#/$defs/OperationId"},"destination_relative":{"type":"string","minLength":1,"maxLength":32768},"plan_hash":{"type":"string","pattern":"^[a-f0-9]{64}$"},"capability":{"$ref":"#/$defs/Capability"}},"required":["location_key","source_location_id","destination_relative","plan_hash","capability"]},
    "HttpQueueReason": {"anyOf":[{"const":"READ_INCOMPLETE","type":"string"},{"const":"ACCOUNT_CHANGED","type":"string"},{"const":"NOT_AN_ISSUE","type":"string"},{"const":"ISSUE_CLOSED","type":"string"},{"const":"REPOSITORY_MISMATCH","type":"string"},{"const":"ASSIGNEE_MISMATCH","type":"string"},{"const":"PROJECT_MEMBERSHIP_MISSING","type":"string"},{"const":"STATUS_MISMATCH","type":"string"},{"const":"OPEN_BLOCKERS","type":"string"},{"const":"DRAFT_ITEM","type":"string"},{"const":"PULL_REQUEST","type":"string"},{"const":"ARCHIVED_ITEM","type":"string"},{"const":"ALREADY_CONSUMED","type":"string"},{"const":"ATTEMPT_ACTIVE","type":"string"},{"const":"PROJECT_UNAVAILABLE","type":"string"},{"const":"AUTOMATION_DISABLED","type":"string"},{"const":"ASSIGNEE_MISSING","type":"string"},{"const":"ASSIGNEE_OTHER","type":"string"},{"const":"MULTIPLE_ASSIGNEES","type":"string"}]},
    "HttpScaffoldPlan": {"anyOf":[{"$ref":"#/$defs/HttpScaffoldPlanV3"},{"$ref":"#/$defs/LegacyHttpScaffoldPlan"}]},
    "HttpPassageSummary": {"additionalProperties":false,"type":"object","required":["id","attempt_id","delivery_id","round","role","state","tracking","diagnostic","result_receipt_id","created_at_ms","attempt_session_id","managed_terminal_id","occupancy_state","session_tracking_state","observed_at_ms"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"round":{"type":"integer"},"role":{"$ref":"#/$defs/PassageRole"},"state":{"maxLength":4096,"type":"string"},"tracking":{"maxLength":4096,"type":"string"},"diagnostic":{"anyOf":[{"maxLength":4096,"type":"string"},{"type":"null"}]},"result_receipt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"created_at_ms":{"type":"integer"},"attempt_session_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"managed_terminal_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"occupancy_state":{"anyOf":[{"anyOf":[{"type":"string","const":"reserved"},{"type":"string","const":"active"},{"type":"string","const":"uncertain"},{"type":"string","const":"released"}]},{"type":"null"}]},"session_tracking_state":{"anyOf":[{"anyOf":[{"type":"string","const":"pending"},{"type":"string","const":"tracked"},{"type":"string","const":"lost"}]},{"type":"null"}]},"observed_at_ms":{"anyOf":[{"type":"integer","minimum":0,"maximum":9007199254740991},{"type":"null"}]}}},
    "HttpCriterionDetail": {"additionalProperties":false,"type":"object","required":["id","text","occurrence_index","explicit","producer","reviewer"],"properties":{"id":{"pattern":"^ac-[1-9][0-9]*$","maxLength":128,"type":"string"},"text":{"minLength":1,"maxLength":65536,"type":"string"},"occurrence_index":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"explicit":{"type":"boolean"},"producer":{"anyOf":[{"additionalProperties":false,"type":"object","required":["verdict","evidence"],"properties":{"verdict":{"anyOf":[{"const":"passed","type":"string"},{"const":"failed","type":"string"},{"const":"not_verified","type":"string"}]},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}}},{"type":"null"}]},"reviewer":{"anyOf":[{"additionalProperties":false,"type":"object","required":["verdict","evidence"],"properties":{"verdict":{"anyOf":[{"const":"passed","type":"string"},{"const":"failed","type":"string"},{"const":"not_verified","type":"string"}]},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}}},{"type":"null"}]}}},
    "HttpFindingDetail": {"additionalProperties":false,"type":"object","required":["key","criterion_ids","category","problem","evidence","expected_result","blocking","id","review_id","attempt_id","resolutions","priority","origin_finding_id","delivery_id","content_identity","assessments_url","disputes_url"],"properties":{"key":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"criterion_ids":{"maxItems":1000,"uniqueItems":true,"type":"array","items":{"pattern":"^ac-[1-9][0-9]*$","maxLength":128,"type":"string"}},"category":{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},"problem":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}},"expected_result":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"},"blocking":{"type":"boolean"},"id":{"$ref":"#/$defs/OperationId"},"review_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"resolutions":{"maxItems":6,"type":"array","items":{"additionalProperties":false,"type":"object","required":["review_id","delivery_id","verdict","evidence"],"properties":{"review_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"verdict":{"anyOf":[{"const":"resolved","type":"string"},{"const":"unresolved","type":"string"}]},"evidence":{"minItems":1,"maxItems":20,"type":"array","items":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}}}},"priority":{"anyOf":[{"anyOf":[{"type":"string","const":"critical"},{"type":"string","const":"high"},{"type":"string","const":"medium"},{"type":"string","const":"low"}]},{"type":"null"}]},"origin_finding_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"delivery_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"content_identity":{"anyOf":[{"$ref":"#/$defs/HttpGitObjectId"},{"type":"null"}]},"assessments_url":{"type":"string","minLength":1,"maxLength":512},"disputes_url":{"type":"string","minLength":1,"maxLength":512}}},
    "HttpQuestionSummary": {"additionalProperties":false,"type":"object","required":["id","attempt_id","passage_id","delivery_id","state","revision","created_at_ms","expires_at_ms","delivery_receipt"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"delivery_id":{"$ref":"#/$defs/OperationId"},"state":{"anyOf":[{"const":"pending","type":"string"},{"const":"answer_recorded","type":"string"},{"const":"sending","type":"string"},{"const":"delivered","type":"string"},{"const":"delivery_unknown","type":"string"},{"const":"expired","type":"string"},{"const":"cancelled","type":"string"}]},"revision":{"type":"integer"},"created_at_ms":{"type":"integer"},"expires_at_ms":{"anyOf":[{"type":"integer"},{"type":"null"}]},"delivery_receipt":{"anyOf":[{"additionalProperties":false,"type":"object","required":["operation_id","question_id","passage_id","received_at_ms"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"question_id":{"$ref":"#/$defs/OperationId"},"passage_id":{"$ref":"#/$defs/OperationId"},"received_at_ms":{"minimum":0,"type":"integer"}}},{"type":"null"}]}}},
    "HttpEffectView": {"additionalProperties":false,"type":"object","required":["operation_id","attempt_id","creation_id","delivery_id","kind","scope_key","state","expected_identity","confirmed_identity","receipt","reason","authorized","revision","sent_at_ms","confirmed_at_ms"],"properties":{"operation_id":{"$ref":"#/$defs/OperationId"},"attempt_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"creation_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"delivery_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"kind":{"anyOf":[{"const":"issue_comment","type":"string"},{"const":"project_status","type":"string"},{"const":"local_commit","type":"string"},{"const":"push","type":"string"},{"const":"pull_request","type":"string"},{"const":"create_repository","type":"string"},{"const":"associate_origin","type":"string"},{"const":"baseline_push","type":"string"}]},"scope_key":{"minLength":1,"maxLength":4096,"type":"string"},"state":{"anyOf":[{"const":"not_requested","type":"string"},{"const":"not_started","type":"string"},{"const":"running","type":"string"},{"const":"confirmed","type":"string"},{"const":"failed_known","type":"string"},{"const":"unknown","type":"string"},{"const":"not_applicable","type":"string"}]},"expected_identity":{"$ref":"#/$defs/HttpEffectIdentity"},"confirmed_identity":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"receipt":{"anyOf":[{"$ref":"#/$defs/HttpEffectReceipt"},{"type":"null"}]},"reason":{"anyOf":[{"maxLength":128,"type":"string"},{"type":"null"}]},"authorized":{"type":"boolean"},"revision":{"minimum":1,"type":"integer"},"sent_at_ms":{"anyOf":[{"type":"integer"},{"type":"null"}]},"confirmed_at_ms":{"anyOf":[{"type":"integer"},{"type":"null"}]}}},
    "ProjectConfiguration": {"additionalProperties":false,"type":"object","required":["source","base_branch","github_project","implementer_profile_id","reviewer_profile_id","correction_limit","default_delivery_mode","automation_enabled","queue_order","guidance"],"properties":{"source":{"additionalProperties":false,"type":"object","required":["kind","location"],"properties":{"kind":{"anyOf":[{"const":"local","type":"string"},{"const":"github","type":"string"}]},"location":{"minLength":1,"maxLength":32768,"type":"string"},"repository_id":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"repository_url":{"minLength":1,"maxLength":4096,"pattern":".*\\S.*","type":"string"}}},"base_branch":{"minLength":1,"maxLength":1024,"pattern":".*\\S.*","type":"string"},"github_project":{"anyOf":[{"$ref":"#/$defs/ReadProjectMapping"},{"type":"null"}]},"implementer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"reviewer_profile_id":{"anyOf":[{"$ref":"#/$defs/OperationId"},{"type":"null"}]},"correction_limit":{"minimum":0,"maximum":5,"type":"integer"},"default_delivery_mode":{"$ref":"#/$defs/DeliveryMode"},"automation_enabled":{"type":"boolean"},"queue_order":{"$ref":"#/$defs/QueueOrder"},"guidance":{"maxLength":8192,"type":"string"}}},
    "StoredExecutionProfileValue": {"additionalProperties":false,"type":"object","required":["id","name","executor","provider","model","effort","guidance","revision","created_at_ms","updated_at_ms"],"properties":{"id":{"$ref":"#/$defs/OperationId"},"name":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"executor":{"const":"maestri-omp","type":"string"},"provider":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"model":{"minLength":1,"maxLength":256,"pattern":".*\\S.*","type":"string"},"effort":{"anyOf":[{"minLength":1,"maxLength":128,"pattern":".*\\S.*","type":"string"},{"type":"null"}]},"guidance":{"maxLength":8192,"type":"string"},"revision":{"minimum":1,"maximum":9007199254740991,"type":"integer"},"created_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"},"updated_at_ms":{"minimum":0,"maximum":9007199254740991,"type":"integer"}}},
    "ChoiceOrigins": {"additionalProperties":false,"type":"object","required":["base_branch","implementer_profile","reviewer_profile","correction_limit","time_defaults","artifact_policy","guidance","delivery_mode"],"properties":{"base_branch":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"implementer_profile":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"reviewer_profile":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"correction_limit":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"time_defaults":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"artifact_policy":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"guidance":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]},"delivery_mode":{"anyOf":[{"const":"project","type":"string"},{"const":"global","type":"string"},{"const":"preparation","type":"string"}]}}},
    "IssueBlocker": {"additionalProperties":false,"type":"object","required":["id","number","url","title","state"],"properties":{"id":{"minLength":1,"maxLength":256,"type":"string"},"number":{"minimum":1,"type":"integer"},"url":{"minLength":1,"maxLength":1024,"type":"string"},"title":{"minLength":1,"maxLength":65536,"type":"string"},"state":{"anyOf":[{"const":"OPEN","type":"string"},{"const":"CLOSED","type":"string"}]}}},
    "HttpCreationMode": {"anyOf":[{"const":"local","type":"string"},{"const":"remote_no_push","type":"string"},{"const":"remote_push","type":"string"}]},
    "HttpEffectIdentity": {"additionalProperties":false,"type":"object","properties":{"repository_id":{"minLength":1,"maxLength":256,"type":"string"},"issue_id":{"minLength":1,"maxLength":256,"type":"string"},"owner_id":{"minLength":1,"maxLength":256,"type":"string"},"visibility":{"anyOf":[{"const":"private","type":"string"},{"const":"public","type":"string"}]},"plan_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"content_identity":{"$ref":"#/$defs/HttpGitObjectId"},"parent_sha":{"$ref":"#/$defs/HttpGitObjectId"},"branch_ref":{"minLength":1,"maxLength":4096,"type":"string"},"issue_number":{"minimum":1,"type":"integer"},"commit_sha":{"$ref":"#/$defs/HttpGitObjectId"},"commit_operation_id":{"$ref":"#/$defs/OperationId"},"repository_owner":{"minLength":1,"maxLength":4096,"type":"string"},"repository_name":{"minLength":1,"maxLength":4096,"type":"string"},"base_branch":{"minLength":1,"maxLength":4096,"type":"string"},"title":{"minLength":1,"maxLength":256,"type":"string"},"commit_time":{"minimum":1,"maximum":253402300799,"type":"integer"},"marker":{"minLength":1,"maxLength":4096,"type":"string"},"body_hash":{"pattern":"^[a-f0-9]{64}$","type":"string"},"project_id":{"minLength":1,"maxLength":256,"type":"string"},"item_id":{"minLength":1,"maxLength":256,"type":"string"},"field_id":{"minLength":1,"maxLength":256,"type":"string"},"option_id":{"minLength":1,"maxLength":256,"type":"string"},"previous_option_id":{"anyOf":[{"minLength":1,"maxLength":256,"type":"string"},{"type":"null"}]}}},
    "ReviewCommandRepetition": {"type":"object","additionalProperties":false,"properties":{"command":{"type":"string","minLength":1,"maxLength":4096},"prior_evidence":{"type":"array","items":{"type":"string","minLength":1,"maxLength":4096},"maxItems":20},"reason":{"type":"string","minLength":1,"maxLength":8192}},"required":["command","prior_evidence","reason"]},
    "ShutdownQuery": {"type":"object","additionalProperties":false,"properties":{"cursor":{"type":"string","minLength":1,"maxLength":2048},"limit":{"type":"string","pattern":"^(?:[1-9]|[1-9][0-9]|100)$"}}}
  }
}
```

SSE: text/event-stream, id=seq; event:controller-event, data=HttpControllerEventFrame; comentários connected/heartbeat não são eventos funcionais. event:resync leva `{ "code": "EVENT_RESYNC_REQUIRED" }`, exige reconsultar e não reaplica comandos. Artefatos são texto UTF-8, sem HTML executável.

Validações semânticas adicionais: time_zone IANA obrigatório com qualquer limite de data; datas impossíveis/intervalo invertido/cursor incompatível recusados; versão/aprovação/referência devem coincidir; resposta de disputa exige justificativa/versão correspondentes. section determina tipo elegível e paginação; não misturar seções em items. Dados ausentes mantêm null/unavailable; checkout_updated=false registra que o fluxo não atualiza o checkout aberto. HistoricalEffectiveProfile é composição consultável redigida, sem credenciais.

**Contratos complementares e persistência das projeções V3.**

**E1-a — Retomar novos inícios (ajuste documental aprovado em 23/10/2026).** Complementa US-20 e RF-81–83 por autorização explícita do usuário; não aprova a SPEC completa nem o checkpoint.

- V05 aceita a terceira ação fechada `resume_starts`, com `authorized=true`, Idempotency-Key e If-Match da revisão de ShutdownView apresentada. O rótulo é **Retomar novos inícios**. A aceitação durável remove somente a barreira de novos inícios imposta pelo encerramento e revoga drenagem/fechamento ainda pendente. Mantém `factory_settings.automation_enabled=false`; não restaura seu valor anterior, não habilita projetos/fila e não cancela, reinicia, retoma execução ou publica tentativas. Início manual posterior continua sujeito à prontidão e demais bloqueios; automação exige sua habilitação própria, já existente.
- Reutilizar o diário específico de shutdown em `operation_requests.receipt_json`: registro privado versionado com ação, geração monotônica por instalação, revisão de controle, pausa vigente, controller_instance_id, referência à operação/geração de drenagem revogada quando houver e marcador de fechamento comprometido. Cada comando novo aceito avança geração e revisão na mesma transação curta que grava configuração, operação e evento. A geração corrente deriva da ordem de controle serializada e persistida, nunca de timestamp, timer ou estado do navegador. O singleton de configuração e seu CAS serializam transições; não criar tabela ou infraestrutura concorrente. Recibos anteriores permanecem íntegros; a consulta de progresso da drenagem substituída mostra `revoked`, derivado da operação sucessora, e não fechamento concluído.
- ShutdownView projeta `generation`, `automation_enabled`, `closing_committed` e `resume_starts_capability`. A capacidade de retomada só é disponível com pausa/drenagem pendente da instância corrente e antes do comprometimento do fechamento; pedido novo fora desse estado recebe 409. Após retomada confirmada: `starts_paused=false`, estado `running` e automação false; running não significa fila habilitada. Fechar/reabrir diálogo não muda esses fatos. GET e renovação da sessão não retiram pausa. Reinício recompõe o último estado de controle válido antes de aceitar novos comandos/inícios; ambiguidade mantém bloqueio, sem ressuscitar drenagem revogada. O marcador de fechamento pertence à instância que o comprometeu: na inicialização de outro processo, abrir geração de controle nova de forma durável, preservando a pausa ainda vigente e a automação desligada, mas sem repetir o fechamento antigo. Drenagem anterior não autoriza fechar a instância nova; revalidar pendências e oferecer retomada explícita quando permitido. Uma retirada de pausa já aceita também é preservada, sem nova ativação automática da fila.
- Trabalhador/callback de `close_when_idle` conserva operação, instância e geração de origem. Após cada espera/IO e imediatamente antes de comprometer o fechamento, exige que continuem correntes, sem revogação, e reconfere ausência de trabalho dependente no conjunto inteiro. A última verificação e a transição durável para `state=closing`/`closing_committed=true` usam a mesma barreira serializada de aceitação de resume_starts e de novo trabalho dependente; depois desse ponto retomada e novo trabalho não são aceitos (capability indisponível, conflito 409 com causa/próxima ação para retomada), em vez de responder 202 e fechar em seguida. Não manter transação SQL durante IO ou espera.
- Na corrida, se resume_starts for aceito primeiro, sua nova geração invalida o trabalhador antigo, seus timers e callbacks: nenhum deles pode fechar o controlador ou restabelecer pausa. Se o fechamento já tiver sido comprometido primeiro, a retomada é recusada antes da aceitação durável; a UI não anuncia retomada. Idempotência recupera a operação original antes do CAS: replay nunca revoga uma drenagem nova, não avança geração novamente e não reaplica ação. A mesma chave com outro pedido recebe 409; revisão vencida recebe 412. Reconsultar ShutdownView distingue recibo histórico de estado corrente.
- ShutdownDialog/useShutdown apresenta ação e efeito descritos sem segundo diálogo redundante; bloqueia duplo envio e mantém estado solicitado/aceito/incerto até consultar a mesma operação. Sucesso informa **Novos inícios liberados. Automação permanece desligada.**; nenhum sucesso otimista em perda de resposta. Capacidade vencida ou fechamento já comprometido mostra causa e próxima ação, preservando o acompanhamento. Cancelamento de tentativa continua separado.

**Aceite documental adicional de US-20 (E1-a).** Cobrir pausa → fechar diálogo → Retomar novos inícios → início manual permitido quando os demais requisitos estiverem atendidos e automação ainda desligada; pausa/revogação preservadas no reinício; resposta perdida e replay sem reaplicar; conflito de revisão; corrida nas duas ordens entre retomada e comprometimento do fechamento; trabalhador/timer/callback antigo incapaz de fechar após retomada aceita. Conferir separadamente ausência de cancelamento/reinício/publicação de tentativas e ativação da fila. São critérios de implementação a comprovar, não testes executados nesta edição.

**E2-a — Intenção de destino na preparação (ajuste documental aprovado em 23/10/2026).** Completa US-05.C1–C4 e RF-23/24/28, preservando os três modos e sua autorização; não altera o projeto cadastrado por URL nem cria clonagem anterior à tentativa.

- O campo HTTP `publication_target` usa `PublicationTargetIntent`: `format_version=1`, `repository_id` e `selection` discriminada por `existing_clone`/`path` ou `clone`/`destination`, com caminhos absolutos limitados. `PublicationTargetChoice` é compartilhado com SetPublicationTarget, sem `authorized` dentro da intenção. PreparationChoices admite o campo opcional; omissão na criação equivale a null. PreparationChanges admite alteração ou null para limpar; omissão na atualização mantém a escolha existente. Preparation/PreparationView/PreparationCreated devolvem o campo, inclusive null. Schemas fechados recusam tipos/propriedades extras; identidade de repositório e caminho são revalidados nos serviços, não tomados como comprovação de clone disponível.
- Persistir em `preparation_revisions.choices_json.choices.publication_target`, com conversor explícito entre envelope privado legado e DTO HTTP, mantendo `formatVersion=1` do envelope. Não alterar outra chave histórica para uniformizar grafia. O resumo e `summary_hash` abrangem a intenção normalizada inteira, o repositório e os efeitos solicitados, incluindo **Clonar destino local de entrega** quando pertinente; hash determinístico SHA-256 da intenção identifica a escolha exata. Mudar/limpar destino cria nova revisão e invalida o resumo/hash anterior. Salvar, selecionar no formulário ou consultar preparação não cria diretório/clone, tentativa, entrega ou autorização de efeito.
- HttpStartAttempt mantém o contrato existente: preparação, revisão, hash autorizado e `authorized=true`; não acrescentar caminho alternativo ao pedido de início que possa divergir do resumo. Antes da aceitação, conferir a revisão/hash e o repositório atuais e capturar a intenção por valor em `capture_json.v3_delivery`, no formato CapturedPublicationTarget: `format_version=1`, `publication_target`, `publication_target_hash` e `authorization_operation_id` da operação de início atribuída pelo controlador. O envelope `capture_json.formatVersion=1` permanece; acrescentar apenas o complemento versionado aos schemas privados, sem reescrever capturas/revisões antigas. Intenção null exige hash null; intenção presente exige hash correspondente. `HttpAttemptDetail.publication_target` e `publication_target_hash` são projeções limitadas desse complemento imutável, sem observação de disponibilidade nem leitura de checkout por GET.
- Cadastro incompleto e preparações incompletas continuam salváveis. Para origem somente por URL e modo commit/pr que ainda exija destino local, o início manual e a fila recusam intenção ausente/inválida com causa e próxima ação para escolher destino; nenhum caminho é inferido da máquina ou de outra tentativa. ICR não exige destino local de entrega nem autoriza cloná-lo por haver uma intenção guardada. Origem local pode usar o clone cadastrado conferido, sem inventar seleção adicional. Legado sem campo/complemento é projetado como null, sem backfill de destino ou autorização; publicação histórica continua usando seus recibos comprovados e capacidades pertinentes.
- A clonagem do destino de entrega só ocorre posteriormente, com tentativa e entrega reais, pelo serviço de V01 e `publication_target_selections`, mantendo suas FKs obrigatórias e sua reconciliação. O comando traz `delivery_id`, repositório, seleção e autorização. Quando o clique de início já descreveu e autorizou exatamente a clonagem do destino no resumo, `authorization_operation_id` e `target_intent_hash` referenciam essa autorização capturada: o controlador agenda a operação durável derivada, sem outro clique/modal. Ambos os campos são enviados juntos; validar operação de origem, captura/revisão/hash, modo e efeito específico descrito antes de aceitar. Não basta a autorização genérica para clonar o ambiente de implementação. A sessão técnica ou uma referência arbitrária de operação não concede esse direito.
- Na ação de destino posterior feita diretamente pelo operador, o clique explícito do próprio V01 conserva sua autorização específica, sem exigir referência a início inexistente no legado. A autorização/identidade esperada do diário registra a origem pertinente, referências de preparação/captura e hash quando usados, e a vincula à tentativa/entrega reais. PublicationTargetSelection projeta origem/hash como null quando não existem. Intenção não confirma clone e não autoriza commit/push/PR: estes conservam os modos, versão aprovada, clique e hashes já definidos. Na continuação de ICR, cumprir a autorização própria correspondente, sem reaproveitar o início ICR para clone de entrega ou novos efeitos.
- Mudança de destino/repositório/plano ou efeito não coberto exige apresentação e ação atualizadas; não alterar a captura nem ampliar o clique antigo. Falha/resposta perdida conserva identidade da operação derivada; consultar/reconciliar antes de repetir, sem nova chave para duplicar clone. Clone incompatível/ocupado/substituído bloqueia e preserva trabalho e versão aprovada. A seleção confirmada é usada em delivery_targets pelo vínculo já existente; recibos confirmados não são recalculados da preparação atual.
- PreparationDialog/usePreparation/useNativeSelection mostra **Destino de entrega**, a escolha persistida e a ajuda **Salvar guarda o destino; não cria o clone.**; o resumo de início distingue clone existente de clonagem futura e explicita o efeito quando solicitado. Salvar/reabrir/reiniciar conserva a intenção; erro de campo/revisão preserva rascunho. useAttempt/useDelivery apresenta intenção separada de clone confirmado e consulta a mesma operação. Não usar armazenamento somente do diálogo como fonte durável nem emitir V01 com IDs inventados durante preparação. O clique já autorizador de início/entrega conserva seus efeitos descritos, sem confirmação redundante.

**Aceite documental adicional de US-05/06 (E2-a).** Cobrir seleção → salvar → reabrir/reiniciar com mesma intenção; limpar/mudar destino cria revisão/hash novos e recusa início com hash antigo; captura independente de edições posteriores; zero clone/criação de diretório por GET/salvar; API/fila recusam início dependente sem destino; ICR não clona destino só por intenção. Após entrega real, operação derivada autorizada pelo resumo exato de início não pede confirmação duplicada; origem/hash/repositório/seleção adulterados são recusados sem efeito; início que não autorizou esse clone exige ação pertinente. Resposta perdida/reinício reconciliam mesma operação sem duplicação. Preservar checkout/trabalho local e modos/recibos. Legado ausente permanece legível/null sem migração silenciosa. Estes são critérios futuros, não prova funcional desta edição.

**Compatibilidade de leitura e escrita — correção documental de 23/10/2026.** Base: PRD, Database (alterações de project_revisions e plano de migração, item 3), Backend (criação e prontidão do quadro), Frontend (configuração/criação); stories US-01.C2, US-02.C1–C4 e US-03.C1–C4. Estes contratos corrigem representação, sem alterar decisões aprovadas.

- E35: NativeSelectionKind é o conjunto único de kinds de NativeSelectionRequest e das três variantes de NativeSelectionResult (selected, cancelled, unavailable). A resposta conserva o kind solicitado. useNativeSelection/InitialSetupDialog validam caminho somente em selected; cancelamento e indisponibilidade não produzem caminho nem confirmam ferramenta/conexão. A seleção continua sujeita às capacidades observadas do host.
- E54/E55/E56, alinhamento V4 de 29/10/2026: HttpScaffoldPlanV3 é o contrato único compartilhado por planejamento, escrita, persistência e consulta. Seu input conserva board_name e remote obrigatórios e creation_mode=remote_push. O formato externo format_version=1 permanece. Planos sem esses campos ou com modos retirados são recusados, inclusive em criações concluídas, antes de escrita; não existe união de leitura antiga.
- E56/useProjects/ProjectCreationDialog: creation.plan.input mantém integralmente os dados autorizados. HttpCreationView.board_name repete o nome explícito do plano; board_url permanece null antes da confirmação. O campo separado não altera plano ou hash. Preservar plan_json/plan_hash e recibos atuais, sem reescrita por consulta. Retomada reconcilia os efeitos da autorização original sem duplicar recursos confirmados; não inferir nome do quadro a partir de name ou de recibo para aceitar plano incompatível.
- E22/E36/E37: ProjectMapping é o contrato único de leitura e escrita, com backlog, ready, in_progress, in_review e delivered não vazios e distintos. ProjectChanges.github_project aceita ProjectMapping ou null no cadastro incompleto. ProjectRevision, ProjectConfiguration, ConfigurationView/ConfigurationSaved e EffectiveConfiguration/PreparationView conservam esse contrato. O conversor privado mantém explicitamente backlog/ready/inProgress/inReview/delivered → backlog/ready/in_progress/in_review/delivered, sem inventar Backlog.
- O mapeamento de quatro estados não é aceito nem convertido e não possui fluxo de adequação na UI. Revisões e capturas atuais conservam seus bytes e hashes; idade, nulabilidade e grafia privada não determinam incompatibilidade. A validação semântica dos cinco IDs distintos continua obrigatória no backend, além dos schemas.

**Comprovação documental destes contratos.** Conferir os sete kinds em cada um dos três estados; igualdade estrutural do plano atual entre planejamento/escrita/leitura; recusa de planos sem board_name e de revisões com quatro opções, inclusive não ativas, antes de escrita; cinco IDs distintos e ausência de conversão/UI substituta. Validar referências do catálogo e rastreabilidade de RF/RNF/stories. Essa conferência não comprova implementação, UI nem integração real.


- `tool_preferences_json` → `SettingsView.tool_preferences` → `toolPreferences` no modelo da UI; JSON privado novo mantém snake_case e format_version. Preferência de caminho não cria capability de host/keyring: o bootstrap confiável valida/recompõe o adapter pelas ferramentas disponíveis e mantém configuração acessível enquanto indisponível. Não restaurar data_root/maestri_settings_json nem permitir elevação por HTTP. `gh_executable_path` mantém sua fonte existente, sem duplicação.
- `attempts.issue_title` → `issue_title` → `issueTitle`; `created_at_ms` representa início em todos os filtros. `guidance` → `guidance` → `guidance`; composition_version acompanha a composição. Documentos privados legados mantêm seus conversores e não são reescritos.
- `attempt_decisions.guidance_json.text` projeta `AttemptDecisionView.guidance`; a orientação é separada de capture_json. `finding_disputes` e `finding_assessments` projetam páginas próprias, sem copiar históricos completos para cada resumo. Encontrar `priority=null` é legado indisponível, não prioridade baixa; achados novos exigem prioridade explícita e versão vinculada.
`HttpImplementerResult.additional_changes_justification` é NULL quando não houve alteração adicional e obrigatório com justificativa quando houver; `finding_responses.response_type=disputed` requer fundamento/evidências e não resolve achado. O resultado do Revisor deve incluir avaliações por finding_id/origem, versão, progress/evidence/justification e resposta de contestação por dispute_id, verdict, justification/evidence. A contestação conserva a versão original do achado; response_review_id identifica a versão reavaliada, projetada como response_delivery_id/response_content_identity, sem sobrescrever a referência contestada nem transportar aprovação. Esses campos usam os mesmos valores dos DTOs FindingAssessment/FindingDispute; o controlador atribui IDs/vínculos e registra a resposta uma vez. A extensão versionada do protocolo técnico preserva o envelope privado legado e rejeita identidade escolhida pelo modelo. `HttpReview.command_repetitions` e `ReviewCommandRepetition.reason` tornam os motivos consultáveis sem check artificial nem duplicação de logs.
- GET de tentativa/entrega sem seção retorna somente projeções resumidas e `v3_details=null`; perfis efetivos/composição, decisões, avaliações, contestações e seleções são carregados pela seção paginada correspondente. Selecionar seção não lê todas as demais. A versão de um achado é derivada do vínculo review/delivery, não da versão atual remota. Detalhes/históricos não entram no polling de resumos.
- A pausa de encerramento não é confundida com automação normalmente desabilitada: a mesma transação desabilita automation_enabled e aceita a operação shutdown com registro privado versionado do estado de pausa/drenagem em operation_requests.receipt_json. A guarda de início manual também consulta essa pausa durável; `automation_enabled=false` sozinho não bloqueia início manual em instalação normalmente configurada. O recibo privado contém apenas estado operacional e referências necessárias, sem mensagens/capturas; o recibo público genérico conserva revision/event_cursor e o progresso é projetado em OperationProgress/ShutdownView. Incrementar a revisão de configuração na mesma transação impede corrida com início já preparado. Reinício recupera a pausa antes de aceitar novos inícios. Ampliações de nomes de operação e aceitação durável devem ser explícitas nos contratos TypeBox, sem alterar enums SQL fechados de publication_requests/effects/creation_steps.
- A consulta GET shutdown é paginada com cursor/limit no mesmo recorte; a UI mantém contagem total e percorre trabalhos quando necessário. `has_more=true` nunca habilita encerramento por lista parcial. A ausência de trabalho é conferida no servidor sobre o conjunto inteiro antes de fechar, não inferida da primeira página.
- `consumer_id` é identidade não secreta estável por instalação/origem/superfície, compartilhada entre abas pelo mecanismo local do cliente; sua única função é deduplicação. Não gerar um consumidor novo a cada reconexão. `send_allowed` é direito transitório somente da reserva recém-adquirida: resposta/retry de uma operação anterior sempre devolve false, mesmo se o recibo original se perdeu. Não persistir/reutilizar esse direito como autorização de reenvio. Reserva sem resultado após interrupção permanece incerta, sem envio automático; o evento funcional continua acessível na UI.

**Regras de domínio por percurso.**

1. Inicialização abre wizard sem quatro argumentos obrigatórios. Detectar/validar Git, Maestri, OMP, PowerShell e GH CLI, com candidatos, escolha manual e diagnóstico por capacidade. Reutilizar escolhas e revalidar no reinício. Encontrar Maestri não confirma conexão. Configuração continua acessível se faltar ferramenta. Não confundir validação Wire de ensaio com conexão nativa do produto.
2. Criar projeto exige plano de remoto GitHub/origin/push inicial/quadro obrigatório e nome do quadro editável, sugerido pelo projeto. Observar cinco IDs distintos e exatamente Backlog, Ready, In progress, In review, Done, nesta ordem visível; delivered mapeia Done. Conferir campo Status, visualização Kanban, ordem e vínculo, não só existência do Project. Adapter incapaz de configurar/verificar deixa etapa parcial/bloqueada com próxima ação. Retomar por recibos/identidades; reconciliar incertos antes de repetir. Cadastro existente local/URL aceita ausência dos três pré-requisitos; ambos os inícios, manual e fila, recusam enquanto incompleto. Ready não habilita automação. Fila continua exigindo atribuição exclusiva/consumo/regras atuais.
3. ICR mantém versão aprovada inspecionável separada, sem commit de entrega; efeitos de Status/comentário preservam autorização própria existente. `commit` integra referência aprovada em branch própria no clone local cadastrado; `pr` acrescenta push/PR para base autorizada. Não usar índice/checkout do operador como montagem, copiar arquivos sobre ele, limpar não rastreados ou mudar sua branch. Transferir objetos/referências via Git. Conferir estado rastreado/staged/não rastreado antes/depois. Commit/branch não significam checkout aberto atualizado. Adaptação/conflito gera outra rodada/versão, validações técnicas pertinentes e revisão independente e mantém a anterior disponível.
4. Continuação autoriza no clique os efeitos restantes do hash vigente. Preservar tentativa, modo original, ICR, referência e histórico; authorize-upgrade e complete formam o protocolo existente, com operações idempotentes relacionadas, sem novo clique de confirmação. Destino por URL requer clone conferido; selecionar pasta não autoriza clonar nem push/PR. Clone explícito nunca sobrescreve destino ocupado. Reconferir conta/repositório/base/destino/trabalho local imediatamente antes do efeito, inclusive após IO. Autoridade vencida mantém continuação pendente para revalidação; efeito incerto exige reconciliação por identidade. Novo plano/destino/versão exige nova apresentação/ação, não reaproveitar clique antigo.
5. Nome novo: `<tipo>/<numero>-<descricao-em-kebab-case>`; mensagem: `<tipo>: <descricao> (#<numero>)`. Tipo reflete alteração; descrição curta/específica em português; normalizar branch em minúsculas/sem acentos, validar referência Git. Colisão usa sufixo curto estável derivado da tentativa e selado antes do efeito; confirmar disponibilidade sem sobrescrever ref alheia. Retomada usa delivery_targets, mesmo com issue renomeada. Não alterar branches/commits antigos. Nomes entram como argv/dados, nunca interpolação shell.
6. Instruções efetivas usam guidance, capturada por tentativa e composta com contexto/schemas técnicos sem orientação comportamental oculta. Perfil editado afeta próximas tentativas; orientação contextual após bloqueio é diário separado, preserva sessão/captura/limites. Troca de perfil prepara sucessora; início explícito futuro exige nova captura/sessão e exclusividade da issue, sem encerrar anterior por inferência.
7. Reservar terminal próprio do papel após conferir host/instalação/posse/ociosidade; criar se ausente. Outra tentativa recebe nova sessão e ambiente. Sessão por papel contínua nas correções, com passagens/versionamento separados. Revisor não altera produto; atualizar seu ambiente somente fora de uso, conferindo referência fixa. Retomada recebe versão/diff anterior/respostas/achados/checks. Registro persistido, lease vencido ou terminal reencontrado não restaura conversa/autoridade nem prova parada. Perda de vínculo interrompe coordenação automática e preserva trabalho. Terminal ocioso após entrega não bloqueia configuração; atividade/publicação pendente/incerto continuam bloqueantes.
8. Revisão inicial cobre todos os critérios; seguintes focam diff/pendências/regressões e ampliam quando necessário. Após cada correção, o Implementador registra as validações técnicas pertinentes e as evidências da nova versão; o Revisor a avalia independentemente. Repetir evidência válida da mesma versão exige motivo concreto (reprodução, insuficiência ou condições relevantes diferentes). Parecer final independente cobre todos os critérios atuais, com zero bloqueantes. Versão antiga, build ou typecheck não substituem prova visual requerida. Achado traz identidade/origem, problema/evidência/esperado/prioridade/critérios/versão; logs pertinentes limitados distinguem falha técnica de defeito comprovado. Alteração adicional requer justificativa disponível ao Revisor.
9. Avaliar progresso do mesmo problema entre correções, sem fusão textual. Parcial comprovado conta, mera edição/declaração não; novo achado não zera recorrência. Duas correções consecutivas sem progresso no mesmo bloqueante, contestação fundamentada mantida ou limite total capturado interrompem repetição; primeiro bloqueio atingido prevalece. Contestação não resolve achado; Revisor justifica manter/resolver e preserva ambos. Operador escolhe orientação, perfil ou encerrar segundo capacidade atual; nenhuma escolha/limite muda automaticamente. Dados insuficientes não viram prova de progresso.
10. Busca no banco sobre conjunto completo antes de paginar. Número positivo e título substring literal, normalização NFC e comparação Unicode sem distinção de caixa, acentos distintos; escapar curingas e parametrizar. LIKE/NOCASE padrão não são prova dessa semântica; medir implementação/plano com volume realista, sem FTS presumido. Período usa attempts.created_at_ms, não término/update: início inclusivo do primeiro dia e início exclusivo do dia seguinte ao último no fuso IANA exibido. Converter pelo calendário/fuso, sem soma fixa de 24h, inclusive um único limite. Cursor opaco vincula conta/filtros/fuso/limites/ordem/teto de inserção e desempate created_at_ms/id. Mudança de filtro invalida cursor; refresh explícito inicia outro recorte. Não percorrer caches/checkout/captura completa para cada linha.
Complemento ao item 10, alinhamento V4 de 29/10/2026: `issue_number` e `issue_title` são preenchidos para novas tentativas a partir da captura validada. O bootstrap direto não executa upgrade ou backfill; bases correntes reconhecidas conservam os cabeçalhos já persistidos e sua ausência legítima, sem inferência ou reescrita.

11. A comparação entre tentativas foi retirada na V4. Busca global da US-21/RF-84/85 e consulta individual de tentativa, rodadas, histórico, evidências e Nova tentativa permanecem; a rota retirada responde 404.
12. Resumo único deriva versão, critérios, resultados e evidências do Implementador, achados, limitações e recibos; efeitos parciais não são sucesso total. Intervalos distinguem execução/espera/perda de acompanhamento, com atividade confirmada e prazo somente configurado; legado insuficiente não ganha duração inventada. Saúde de conexão é runtime; health HTTP isolado não comprova acompanhamento Maestri/OMP.
13. Notificações elegíveis de pergunta pendente/falha/conclusão: consumidor verifica suporte/permissão por ação explícita; reserva única precede apresentação. Conteúdo externo só identificação da fábrica, tipo e acesso validado à tentativa; sem título/projeto/log/caminho/prompt. Replay/abas concorrentes/unknown não ganham direito novo; sem recibo não declarar entrega confirmada. Pendências continuam nas consultas mesmo com notificação negada/indisponível.
14. Encerramento primeiro persiste pausa, bloqueando fila e início manual inclusive corridas. Apresentar aceitos/ativos/incertos por identidade. `close_when_idle` drena mantendo controlador/acompanhamento até ausência confirmada de trabalho dependente, grava recibo antes de fechar. Cancelamento usa comando separado explícito. Fechar aba/diálogo não encerra controlador/executor nem limpa ambiente. Reinício recompõe a pausa ou sua retirada explicitamente aceita e revalida pendências; Retomar novos inícios revoga somente drenagem ainda pendente, mantém automação desligada e impede fechamento por geração revogada, conforme E1-a.

### 3.3 Middleware

Usar hooks existentes de Host/Origin exatos, Sec-Fetch-Site, Content-Type JSON, sessão/cookie/CSRF e error handler central. Corpo máximo 16384 bytes, cabeçalhos 8192 bytes/64 entradas, 128 conexões/sessões, 600 requisições/minuto por instância, bootstrap 60/minuto, 8 streams/2 por sessão, buffer SSE 16384 bytes e vida de stream 60000 ms; Retry-After em 429. Timeouts existentes: conexão/cabeçalhos 10000 ms, request/handler 15000 ms, keep-alive 5000 ms, 100 requisições/socket, espera SQLite 5000 ms. Não elevar limites globalmente para contornar um payload sem decisão técnica concreta; JSON de instruções/composição tem também limite total do corpo. Detalhes extensos/logs são sob demanda.

Logging correlaciona request_id/operation_id/escopo/revisão e tempos, com redação de Authorization, Cookie, Set-Cookie, CSRF e segredos de provider/host. No-store/nosniff nas respostas. Não criar middleware global adicional por pressuposição. Autorização, prontidão e barreiras são verificadas nos serviços também para fila/comandos internos. ETag/capability vista na UI não substitui revalidação no efeito. Atualizar recibo/projeção/evento atomicamente, sem transação SQL aberta durante IO. Resultado externo incerto exige reconciliação, não repetição por timeout.

### 3.4 Agent Graph (se aplicavel)

Não introduzir framework de agentes. A máquina de coordenação existente obedece ao seguinte fluxo lógico:

```text
preparação -> prontidão + autorização + captura -> ambiente/sessão Implementador
  -> implementar -> resultado próprio do Implementador -> captura Git imutável
  -> ambiente/sessão Revisor separado -> parecer independente
      -> aprovado completo -> ICR preservado -> efeitos autorizados -> resumo
      -> corrigível -> pacote de achados -> mesma sessão Implementador -> nova rodada/versão
      -> recorrência / desacordo / limite -> decisão humana
           guidance: diário separado -> continuidade permitida na tentativa atual
           change_profile: preparação sucessora -> aguardar início explícito novo
           end: comando explícito de encerramento/cancelamento pertinente
qualquer etapa -> perda de acompanhamento: interromper coordenação, preservar recursos
publicação incerta -> reconciliar identidades/recibos antes de continuar
```

Estado lógico: instalação/conta/projeto/repositório/issue, tentativa/captura/revisão, rodada/versão fixa, papel/passagem/sessão/ocupação/geração, critérios/achados/avaliações/contestações, checks/evidências, bloqueio/decisão/limites, modo capturado/autorizado, destino/hash, efeitos/recibos e observações de autoridade/acompanhamento. Estado de conversa não é identidade de conteúdo.

Tools: OMP e ferramentas nativas/MCPs normais conforme configuração; preservar TUI/stdin/stdout/regras/skills/LSP, sem runtime headless decorativo nem política global --no-tools/--no-lsp/--no-skills/--no-rules. Contrato estruturado existente `execution_complete` e `execution_question`, com vínculo atribuído pelo controlador, persistência antes do recibo, payload inválido corrigível e deduplicação. Contestações/justificativas são extensão do resultado estruturado, não nova ferramenta autorizadora. Revisor isolado não escreve produto/publica. Pergunta não bloqueia interação normal da TUI; resposta é entregue somente à passagem correta. Não prometer observar toda mudança interna do OMP.

### 3.5 Integracoes Externas

| Integração | Backend e persistência | API/consumidor frontend | Validação e falha |
| --- | --- | --- | --- |
| Git e clone local | workspaces; referências aprovadas, delivery_targets, effects | preparação/publicação/recursos/diff; useDelivery, useAttempt, useAttemptActions | Git local com tracked/staged/untracked, colisão, URL incompatível, adaptação; não alterar checkout. |
| GitHub CLI/conta/repositório | github + diagnostics; conta configurada distinta de observada | settings/github-options, diagnostics, configuration-options; useGitHubSetup/useConfiguration | Usar autenticação existente/keyring autorizado; sem novo login/credenciais no banco; revalidar autoridade após IO. |
| GitHub Projects | scaffold/configuration/queue; creation_board_operations e revisões | scaffold/options/plans/creations, configuration-options, queue; ProjectCreationDialog/GitHubSetupPanel/useProjects | Cinco colunas exatas, vínculo/ordem/visualização observados; incapacidade fica parcial. Sem board local. |
| GitHub Status/comentário/branch/PR | publication coordena; effects/recibos/upgrades | authorize-upgrade/complete/reconcile e detalhe; useDelivery/DeliverySummary | Autorização de cada efeito, referência fixa e reconciliação de resposta perdida; sem merge/force-push. |
| Maestri/OMP | execution; sessões/terminais/ocupações/passagens/resultados | diagnostics, execution-options, interação/perguntas/recursos/detalhe; useOnboarding/useAttempt/useDecision | Integração real com terminal/TUI, UTF-8/cwd/argv Unicode e dois papéis; reencontro não restaura autoridade. |
| Seletor nativo existente | projects/workspaces via host | POST settings/selections; useNativeSelection | Caminho absoluto real validado; navegador não fornece clone pelo nome parcial de arquivo. Seleção não autoriza clone. |
| Notificação local navegador/host | events + claims/receipts; notification_dispatches | useControllerEvents/useLocalNotifications | Suporte/permissão/link provados no host; sem serviço externo nem pressupor execução após fechar app. |

Não há webhook externo novo, Stripe, autenticação OAuth própria ou upload multipart nesta feature. Ausência desses elementos não autoriza adicioná-los para preencher o template. APIs/CLIs de fornecedor devem usar capacidades existentes e documentação atual via Context7 quando necessária à implementação, sem presumir endpoint de fornecedor para configurar visualização não comprovada.

## 4. Frontend

### 4.1 Mapa de Paginas

Preservar AppShell/PrincipalScreen, navegação por hash e useHashRoute/useDialogs; não adicionar página Entregas ou Kanban local. Todas as superfícies de domínio exigem bootstrap de sessão técnica; não há rota de login humano. Assets/shell podem abrir antes da sessão para apresentar configuração/indisponibilidade.

| Rota | Descrição/componentes | Auth required |
| --- | --- | --- |
| `#principal/dashboard` | DashboardPanel, tentativa ativa, DeliverySummary, AttemptStageSummary, pendências | Sim, sessão técnica |
| `#principal/projetos` | Lista, cadastro existente, criação e prontidão, configuração/área gerenciada/exclusão | Sim |
| `#principal/perfis` | ProfilesPanel/ProfileForm dos papéis | Sim |
| `#principal/fila` | QueuePanel: Ready, automação e impedimentos | Sim |
| `#principal/tentativas` | AttemptListPanel, filtros globais, detalhe e comparação | Sim |
| `#principal/registros` | Registros paginados, inventário/diagnóstico/evidência pertinente sob demanda | Sim |
| `#principal/configuracao` | Ferramentas, conta, defaults, disponibilidade de notificações e configuração | Sim |

Contextos existentes: projectId, issueId, attemptId, deliveryId, roundId, creationId, questionId, operationId e profileId na URL de navegação, distintos do JSON HTTP snake_case. `dialog` mantém register/create/creation-plan/partial/preparation/start-confirmation/enable-queue/authority/detail/decision/stop/delivery/publication/diagnostic/interaction/profile/initial-setup/project-configuration/shutdown e contexto de exclusão pelo mecanismo existente. Filtros públicos do histórico: project_id, result, issue_number, issue_title, start_date, end_date, time_zone, cursor. Abrir/fechar detalhe conserva filtros; payload, instruções e segredos não entram na URL.

### 4.2 Arvore de Componentes

```text
AppShell
  EventConnectionStatus
  PrincipalScreen
    DashboardPanel -> AttemptStageSummary, DeliverySummary, QuestionDecisionCard
    ProjectsPanel -> ProjectReadiness, GitHubSetupPanel
    ProfilesPanel -> ProfileForm
    QueuePanel
    AttemptListPanel -> AttemptSearchFields, AttemptRow
    RecordsPanel
    ConfigurationPanel
  DialogHost (useDialogs)
    InitialSetupDialog
    ProjectForm / ProjectCreationDialog / CreationPlan / PartialCreation
    ProjectConfigurationDialog / PreparationDialog
    AttemptDetailDialog
      DeliverySummary -> DeliveryContinuation, DeliveryTargetFields
      AttemptStageSummary / AttemptBlockDecision
      FindingDetail -> ProgressHistory, DisputeHistory
      CriteriaSummary / HistoricalProfile
    PublicationDialog -> mesmas seções de entrega, uma ocorrência por contexto
    ProjectDeletionDialog
    ShutdownDialog
    QuestionDecisionCard / Interaction / ResourceStopAndRemoval
```

Nomes novos são extrações possíveis nos domínios atuais, não obrigam abstração quando seção local bastar. Props/estado mínimos:

| Componente | Props/dados | Estado local e ações |
| --- | --- | --- |
| InitialSetupDialog | settings, executionOptions, diagnostics, onSaved/onClose | rascunhos por ferramenta, candidatos/seleção/revalidação; Maestri localizado separado de conectado; falha não fecha wizard |
| ProjectCreationDialog | options, settingsRevision, onCreated | nome/destino/template/remote/boardName e indicador de edição manual; plano/hash/operationId; remote_push fixo e quadro obrigatório; sugestão não sobrescreve nome editado |
| ProjectForm / ProjectReadiness | projectId, ProjectDetail/ConfigurationView, ETag | origem local/URL e pendências individuais; salvar incompleto permitido; iniciar/automação impedidos com causa |
| PreparationDialog | projectId, preparationId?, PreparationView.publication_target, revisão/hash | modos icr/commit/pr, perfis/limites e intenção de destino; salvar não clona; resumo de início descreve eventual clone posterior explicitamente autorizado |
| ProfileForm | StoredExecutionProfile, ETag, onSave | executor/provider/model/effort/guidance efetivo, dirty/saving/fieldErrors; explicar novas tentativas e limites técnicos; consulta de composição redigida |
| DeliverySummary | deliverySummary, publication, historical details references | resultado/local/branch/commit/PR/pendências comprovados; detalhes expandidos sob demanda; um resumo por contexto |
| DeliveryContinuation | attemptId, deliveryId, ETag, upgrades/hash/capabilities | comando pendente/operationId, duplo clique bloqueado; clique autoriza efeitos descritos sem confirmação redundante |
| DeliveryTargetFields | repository identity, publication_target/intenção capturada, target capability | existing_clone/clone, caminho guardado distinto de clone confirmado; validação/operação posterior; seleção/salvamento não clonam |
| AttemptStageSummary | stageActivity/measurements | relógio visual derivado de timestamp observado; não altera last_activity nem estima entrega |
| AttemptBlockDecision | blockId/revision/version, evidence, permitted actions | guidance contextual ou perfil/revisão sucessora; envio com bloqueio atual; refresh preserva rascunho e exige rever ação se mudou |
| FindingDetail | finding, assessments, disputes, producer evidence, version | abrir evidências/logs pertinentes; não resolver por UI nem confundir falha técnica com defeito |
| AttemptListPanel | filtros aplicados/AttemptPage/search_context | rascunho/aplicado, cursor por recorte, loading/error, consulta individual; Buscar reinicia cursor, detalhes não entram no polling |
| ProjectDeletionDialog | DeletionPreview, ETag, operationId? | destinos principais separados, bloqueios/estado parcial, ação no rodapé; inventário nos registros; observar mesma operação |
| ShutdownDialog | ShutdownView/revision/generation, operationId? | pausa pendente/confirmada/incerta, drenagem e Retomar novos inícios por capability; retomada mantém automação desligada; fechar diálogo não desfaz pausa; cancelamento separado |
| EventConnectionStatus | estado observado do canal e última atualização válida | verde somente saudável confirmado, vermelho em falha, intermediário explícito em reconexão; texto sempre presente |

### 4.3 Camada de API

Reutilizar fetch wrapper atual e tipos TypeBox compartilhados. Base relativa `/api/v1`, credentials same-origin, JSON e CSRF em mutações; bootstrap envia X-Factory-Client:web. Ler ETag/Location/request_id/operation_id. Traduzir HTTP snake_case para modelos camelCase somente em conversores explícitos; todos os campos retornados nos schemas têm o mesmo tipo no contrato importado pelo hook. Nunca fazer cast para mascarar divergência. Estado padrão de consulta: idle/loading/loaded/refreshing/error com dados anteriores identificados; comando: idle/submitting/accepted/unknown/succeeded/failed. Hook retorna data tipado, loading/error, ETag, refresh e ações pertinentes; não devolve sucesso de efeito só porque recebeu 202.

| Hook/cliente | Endpoints consumidos e params | Return type / consumidor |
| --- | --- | --- |
| useSession / API bootstrap | POST session {}; GET health | SessionResponse/HealthResponse; AppShell/EventConnectionStatus; CSRF só memória |
| useConfiguration | GET/PUT settings; GET/PUT projects/:id/configuration; GET configuration-options com query | SettingsView/SettingsSaved/ConfigurationView/ConfigurationSaved/ConfigurationOptions; configuração/ProfileForm; revisões/rascunhos preservados |
| useOnboarding | settings, execution-options, GET/POST diagnostics com contexto/ferramentas | ExecutionCatalog/HttpDiagnosticsView/OperationAccepted; InitialSetupDialog |
| useNativeSelection | POST settings/selections {kind} | NativeSelectionResult; wizard/projeto/entrega; retorno cancelado não é erro nem caminho autorizado |
| useGitHubSetup | GET settings/github-options, configuration-options, diagnostics | GitHubSetupOptions/ConfigurationOptions/HttpDiagnosticsView; conta/quadro/prontidão |
| useProjects | GET/POST projects, GET projects/:id; scaffold/options/plans/creations/:id e POST creations/reconcile | ProjectPage/ProjectRegistered/ProjectDetail/HttpScaffoldOptions/HttpScaffoldPlanned/HttpCreationView/OperationAccepted; catálogo/criação/retomada |
| usePreparation / useAttemptActions | GET projects/:id/issues, POST projects/:id/preparations, GET/PUT preparations/:id com publication_target, POST attempts pelo resumo/hash | IssueOptions/PreparationView/PreparationCreated/OperationAccepted; intenção persistida por revisão/capturada no início; nenhum clone por salvar/ler |
| useQueue | GET/PUT queue com contexto/alterações | HttpQueueObservation/HttpQueueSaved ou HttpQueueConflict; QueuePanel; não habilita por Status |
| useAttemptSearch | GET attempts com filtros/cursor/limit | HttpAttemptPage com search_context; AttemptListPanel; resultados do servidor, sem filtro local parcial |
| useAttempt / useActiveAttempt | GET attempts/:id, rounds, measurements; GET operation | HttpAttemptDetail/HttpRoundHistory/HttpAttemptMeasurements/HttpOperationSummary; dashboard/detalhe |
| useDelivery | GET deliveries/:id, diff, review, producer-result; POST publication/target, authorize-upgrade, complete, reconcile; POST capture/retry | HttpDeliveryDetail/HttpDeliveryDiff/HttpReview ou null/HttpProducerResult/OperationAccepted; resumo/continuação/destino |
| useDecision | GET question, POST answer; POST attempts/:id/decisions | HttpQuestion/OperationAccepted com decisão consultável; QuestionDecisionCard/AttemptBlockDecision; decisão humana não usa canal do agente |
| useOperation | GET operations/:operationId | OperationViewWithDeletion e extensões V3; todos os comandos aceitos/incertos; consulta mesma chave |
| useRecords | GET events com filtros/cursor | HttpEventPage; Registros e detalhes; não substitui busca de tentativas |
| useControllerEvents | GET events/stream com cursor e Last-Event-ID; fallback eventos/consultas pertinentes | SSE HttpControllerEventFrame + tipos de controle existentes; invalidar somente contexto afetado |
| useLocalNotifications | POST notifications/claims e receipts com consumer_id/surface/event_seq e recibo | NotificationClaim/NotificationReceipt; AppShell/configuração; vencedor único envia, replay não envia |
| useShutdown | GET shutdown com cursor/limit; POST shutdown com pause_starts/close_when_idle/resume_starts | ShutdownView/OperationAccepted; ShutdownDialog; revisão/geração/capabilities e consulta da mesma operação resolvem pausa/retomada incertas, sem reenvio automático |
| useProjectDeletion | GET deletion-preview, POST deletion, GET project-deletions/:id, POST resume | DeletionPreview/DeletionStatus; ProjectDeletionDialog, mesmo observador existente |
| useProjectStorage | GET projects/:id/configuration com plano/localizações; POST storage-transition | ConfigurationView.storage/OperationAccepted; configuração de projeto e Registros; progresso pela operação |
| useAttemptResources / useAttemptActions | GET resources/removal-plan/interaction/folder; POST cancel/remove/interaction/open/folder/open/revalidate | HttpAttemptResources/HttpRemovalPlan/HttpPassageInteraction/HttpFolderSurface/OperationAccepted; detalhe/recuperação/encerramento explícito |

Cada ficha de endpoint da seção 3.2 identifica o consumidor concreto; não criar endpoint sem superfície de uso. Schemas completos definem params/request/response dos hooks. `Http` nos nomes distingue DTO público de documento privado.

**Concorrência e recuperação.** AbortController/identidade de contexto descartam respostas tardias ao trocar filtro/projeto/diálogo. Polling não sobrescreve rascunho. Resposta perdida conserva operation_id e consulta/reconcilia antes de repetir; renovar sessão nunca reenvia mutação automaticamente. Erro de refresh não transforma dado antigo em observação atual. Sem sucesso otimista de Git/GitHub/Maestri/filesystem. SSE retoma pelo cursor, mantém pending UI, deduplica por evento e faz refresh do contexto sem carregar logs/capturas completos por linha. Uma observação de health HTTP não comprova saúde de execução.

**Busca.** Campos separados de número e título, sem heurística de texto numérico; período da data de início e fuso IANA local visível. Validar datas reais/intervalo junto aos campos, preservando entrada; servidor devolve fronteiras normalizadas. Não calcular UTC por soma fixa de 24h no cliente. URL conserva filtros aplicados ao paginar/voltar. Buscar/limpar/atualizar inicia recorte previsível; inserções durante paginação não alteram silenciosamente teto capturado.

### 4.4 Auth Flow no Frontend

Não existem registro/login/logout humanos novos. Na abertura, bootstrap técnico POST session com `{}`, Origin, JSON, X-Factory-Client:web; navegador recebe cookie HttpOnly e cliente guarda csrf_token/instance_id em memória. GETs autenticados usam cookie; mutações também enviam X-CSRF-Token e headers de revisão/idempotência pertinentes. Sessão não identifica pessoa nem autoriza GitHub. Rotas de domínio aguardam bootstrap e exibem indisponibilidade recuperável sem bloquear wizard por ferramenta ausente.

401/invalidação por reinício: suspender comando pendente, renovar bootstrap, reconsultar estado/mesma operação e solicitar ação atualizada quando necessário; não reenviar mutação automaticamente. Cookies/CSRF nunca vão para URL/localStorage/log. Sem JWT/Bearer/refresh token paralelo. Fechar interface não é logout de GitHub, revogação automática de tentativa ou encerramento físico. Expiração/encerramento completos são descritos na seção 5.1 com o mesmo mecanismo.

### 4.5 Design System

Reutilizar CSS puro e tokens existentes: bg #f8f9fa, surface #ffffff, fg #202122, muted #687078, border #e9eaec, accent #b94e00; fonte Segoe UI, system-ui, sans-serif; spacing xs=4, sm=8, md=16, lg=24, xl=38 px; raios sm=5, md=9, lg=12 px. Não substituir paleta/tipografia por framework novo. Falha de conexão usa vermelho e saúde confirmada verde conforme estilos semânticos existentes; conectar/revalidar tem estado intermediário explícito, sempre acompanhado de texto.

Controles compartilhados: Button, campos/labels/ajuda/erros, CustomSelect, Dialog, estado vazio/carga, badges/links de acesso, seções e rodapé. CustomSelect substitui select HTML nativo onde pertinente e preserva teclado/foco/posicionamento sob zoom. Seleção de pasta/executável usa mecanismo nativo existente. Manter layout aprovado e Design Lock sob decisão do usuário; não produzir layout novo por esta SPEC.

Modais: título/objetivo claro, seções organizadas, campos consistentes, corpo rolável e cabeçalho/rodapé acessíveis. Ação principal alcançável sem rolar lista extensa de subpastas; destinos principais completos e original separada. Caminhos/textos longos quebram sem cortar controles/causar rolagem horizontal da aplicação. Testar janela baixa/estreita/zoom. Foco inicial pertinente, trap Tab/Shift+Tab, retorno ao acionador, nome acessível, Escape respeitando rascunho/operação. Fechar visualmente não cancela operação aceita. Erro associado ao campo e foco no primeiro erro; anúncios moderados, relógio não narrado continuamente. Ação indisponível explica causa de forma acessível, sem depender só de tooltip.

Referência visual do Kanban determina apenas cinco colunas no GitHub, não board local, Estimate/WIP ou novo design. Textos operacionais em português: uma causa principal e próxima ação, sem IDs opacos como título/códigos brutos/avisos repetidos. Comparação usa lado a lado em telas largas e pares de campos empilhados em estreitas.

### 4.6 Estados de UI

| Superfície | Loading/empty | Falha/parcial/bloqueio | Confirmação e prova exigida |
| --- | --- | --- | --- |
| Ferramentas | resumo compacto em detecção/revalidação; ausência abre seleção | ambiguidade/falta/conexão indisponível mantêm wizard e rascunho | extração limpa, escolha manual, reinício e Unicode; Maestri localizado sem conexão não fica saudável |
| Criação/projeto | plano em cálculo; etapas sem percentual; cadastro sem histórico | parcial/incerto com operação/recibos preservados; próximo passo na etapa responsável | nome editado preservado; três efeitos completos e cinco colunas observadas; retomada não duplica; backend bloqueia projeto incompleto |
| Entrega | resumo carregando por estrutura estável, skeleton somente de conteúdo ainda desconhecido; intenção de destino preservada ao reabrir preparação | intenção não é clone confirmado; ICR aprovado separado de commit/push/PR pendentes, destino incompatível, adaptação/revisão pendente, autoridade vencida | três rótulos/efeitos, salvar/GET sem clonar, revisão/hash e captura do destino; operação posterior com identidades reais e autorização sem segundo modal redundante; resposta perdida reconciliada; link só de PR confirmado; prova Git separada da UI |
| Perfis/bloqueios | histórico sob demanda, edição/salvamento explícitos | conflito preserva dirty; perda de acompanhamento distinta de espera; causa principal com evidências | captura histórica íntegra; guidance contextual mantém sessão/limites; perfil prepara sucessora sem iniciar; duas correções/progresso parcial/contestação e decisão vencida |
| Arquivos/exclusão | destinos principais visíveis; operação aceita não é removido | atividade/incerteza/caminho substituído/links, remoção parcial e retomada explícitos | rodapé disponível com muitos destinos; original separada; recibo final verificado; baseline/meta/otimização e comparação de tempo total/UI/correção separados |
| Histórico | loading inicial, refreshing com dados anteriores; nenhum histórico distinto de nenhuma correspondência | falha inicial vs atualização; intervalo inválido junto ao campo; resposta tardia descartada | correspondência fora da primeira página; filtros combinados/preservados; limites inclusivos/fuso/offset/um limite e término fora do período; payload leve |
| Comparação | carga só ao abrir; sem seleção de par elegível explica condição | outra issue recusada; dado ausente/não comparável explícito | falha anterior/resultado posterior/configuração e versões históricas não mudam após editar perfil atual; sem causalidade |
| Tempo/conexão | etapa e última observação; prazo ausente não cria estimativa | executando/esperando/perdido distintos; falha vermelha, reconexão intermediária | verde apenas saudável confirmado; visualizar saudável/falha/recuperação completa; CSS isolado não prova estado renderizado |
| Notificação | disponibilidade e permissão verificadas por ação | negada/ausente mantém pendência na UI; incerto não reenvia | conteúdo externo mínimo, múltiplas abas/replay/reconexão/queda após reserva/envio e link no host alvo; não pressupor funcionamento após fechar |
| Encerramento | pausa/retomada solicitadas ou aceitas, drenagem explícita | trabalho aceito/ativo/incerto mantém acompanhamento; resposta perdida consulta operação; fechamento comprometido recusa retomada | novos inícios recusados durante pausa; Retomar novos inícios libera somente essa barreira, automação desligada; revogação/geração impedem fechamento tardio; reinício recompõe estado; cancelamento separado; parada real provada à parte |

Skeletons nunca mostram commit/PR/saúde/progresso fictícios. Empty states têm ação pertinente; dados ausentes permanecem indisponíveis. Mostrar comprovado, não verificado e observação não bloqueante separadamente nos detalhes. Continuação atualiza o mesmo resumo sem duplicar aviso por etapa/painel/rodapé.

Na implementação, usar Playwright MCP/Chrome na aplicação servida com assets atuais, porta 4310, registrando conteúdo/screenshot e resultado funcional por superfície, incluindo teclado/foco/tela baixa/estreita/zoom. Executar testes determinísticos de lógica significativa de lifecycle/filtros/recibos/decisões; build/typecheck não são prova renderizada. Integrações reais Maestri/OMP, filesystem Windows, Git/GitHub e encerramento do controlador têm evidência própria e autorização pertinente. Esta execução documental não executou esses testes.

## 5. Security

### 5.1 Auth Flow Completo

1. **Bootstrap local, substituindo registro/login de pessoa:** controlador escuta somente 127.0.0.1 ou ::1 e origens exatas da instalação/porta. Assets GET/HEAD e GET/HEAD health mantêm exceções restritas. POST `/api/v1/session` exige Origin exato, JSON e X-Factory-Client:web, com corpo vazio. Não há conta/senha, signup, RBAC ou OAuth novo.
2. **Sessão técnica:** cookie `factory_<sha256(installation_id)[0:16]>_<port>`, ID aleatório 32 bytes base64url (43 caracteres), HttpOnly=true, SameSite=strict, Path=/api/v1, Secure=false no HTTP loopback atual. Sem Domain, Max-Age ou Expires: cookie de sessão do navegador. Mapa ID→CSRF existe só em memória; instance_id muda no reinício. Não inventar TTL/JWT/refresh token que o produto não tem.
3. **Requisição autenticada:** cookie conhecido validado com comparação segura; Host exato e Origin, quando presente, exato. Sec-Fetch-Site deve ser same-origin, com exceção restrita de navegação none para asset público. Mutações exigem Origin/Content-Type JSON/CSRF, além de identidade idempotente/revisão onde pertinente. GET/HEAD jamais executam efeitos. Bootstrap repetido com cookie válido devolve a sessão técnica atual.
4. **Autorização de domínio:** conta configurada ≠ conta observada ≠ autorização de efeito. Revalidar escopo, prontidão, captura/referência aprovada, bloqueios, revisão/geração, destino/plano/hash e autoridade de GitHub nos serviços antes de agir, inclusive após IO. Sessão/capability/consumer_id/instrução não concedem autoridade. Registro de clique humano representa ação explícita no escopo, sem atribuir identidade pessoal à sessão técnica.
5. **Invalidação/expiração:** o protocolo atual não possui TTL cronológico novo; encerramento/reinício/revogação do mapa ou cookie não reconhecido recebe 401. Cliente suspende comando, refaz bootstrap e consulta operação original. Não reaplicar mutação automaticamente. Reconectar SSE ou reencontrar terminal não restaura sessão OMP, conversa ou autoridade.
6. **Logout/fechamento:** não criar logout humano/GitHub por esta feature. Fechar aba não revoga tentativa nem encerra executor. Encerramento guiado pausa novos inícios, drena e grava recibo; fechamento do controlador encerra streams e limpa mapa de sessões. Cancelamento e parada física/limpeza exigem ações próprias, com recursos ativos/incertos preservados.
7. **Origem e CORS:** cliente usa mesma origem; rejeitar Host/Origin divergentes, sem wildcard/Access-Control-Allow-Origin amplo. FACTORY_BROWSER_ORIGIN, se fornecida, deve ser exatamente origem calculada. Não presumir exposição remota/TLS/proxy por esta SPEC.
8. **Confiança no conteúdo:** issue/instrução/achado/log/resultado/anexo são dados não confiáveis. Renderizar texto sem HTML executável, validar protocolo/destino de links e argv/referências Git. Texto não amplia ferramentas/limites, homologa entrega ou prova parada. Credenciais são resolvidas por mecanismos existentes fora de capturas/prompts/banco; logs e notificações são redigidos.

### 5.2 Checklist de Seguranca

Os itens são critérios de implementação **a comprovar**, não um checklist de testes já aprovados.

- [ ] Session config conferida com os flags/escopo/invalidade em memória acima; Secure=false apenas no perímetro HTTP loopback existente, sem TTL ou login humano inventado.
- [ ] RLS ativo em todas as tabelas: **não aplicável tecnicamente no SQLite**. Comprovar, em substituição, guardas SELECT/INSERT/UPDATE/DELETE de todas as tabelas na seção 2.2 e isolamento nos serviços/HTTP.
- [ ] CORS/perímetro: Host/Origin exatos, Sec-Fetch-Site e nenhuma origem ampla; GET/HEAD sem efeitos, incluindo links de notificação.
- [ ] Rate limiting, limites de corpo/cabeçalhos/sessões/streams e Retry-After aplicados a todas as novas rotas.
- [ ] Input validation fechado em todos os endpoints; mesmos schemas/types no cliente; datas reais/fuso/cursor; IDs cruzados recusados; SQL parametrizado/coringas escapados e sem interpolação shell.
- [ ] Webhook signature verification: **não aplicável**, nenhum webhook novo. Não criar rota externa sem contrato/necessidade autorizada.
- [ ] Secrets em env vars ou mecanismos externos existentes, nunca hardcoded; esta feature não exige novas credenciais em .env. Redigir Authorization/Cookie/Set-Cookie/CSRF/saída de host/provider em logs, prompts consultáveis, evidências, erros e notificações.
- [ ] File upload validation: **não aplicável a multipart**, nenhum upload novo. Validar seleção nativa, caminho/tipo/tamanho/hash de artefatos existentes e acesso sob demanda; recusar path traversal, links e abertura arbitrária.
- [ ] Idempotência/CAS: mesma chave recupera recibo antes de CAS; payload divergente/revisão vencida não gera efeito; resposta perdida conserva operação original; intenção não é confirmação.
- [ ] Autoridade vencida/conta ou destino alterados bloqueiam efeito e preservam continuação; revalidar ou reconciliar antes de repetir. ICR não autoriza commit/push/PR; commit não autoriza push/PR; plano antigo não cobre mudança.
- [ ] E2-a: intenção de destino na preparação/revisão/hash/captura não é autorização por salvar/ler. Clonagem posterior usa identidades reais e ação explícita que descreveu o efeito/destino; referência à autorização capturada só vale com origem/hash/escopo conferidos. Sem IDs futuros, migração silenciosa de legado, efeito fora do modo ou confirmação redundante.
- [ ] Git local preservado integralmente: tracked/staged/untracked, índice, branch aberta e refs antigas. Clone incompatível/ocupado/substituído bloqueia; adaptação gera versão/checks/revisão. Sem merge/force-push/reescrita.
- [ ] Sessões/terminais: mesma tentativa/papel, versão fixa, posse/host/instalação e geração conferidos; outro papel/tentativa/manual/ativo/incerto/worker antigo recusados. Não atualizar ambiente do Revisor ocupado; lease vencido/silêncio não provam parada.
- [ ] Perfil/instrução/resultado malicioso não concede publicação/ferramentas, não remove bloqueante, não amplia limite e não declara aprovação/parada por texto. Orientação é decisão separada; troca de perfil não inicia tentativa.
- [ ] Caminhos/transição/exclusão: identidade de objeto/volume/ancestrais e propriedade exclusiva revalidadas na fronteira do efeito; links/junctions sem seguir destino não autorizado; inventário/identidade/política/destino mudados invalidam autorização. Worker sem geração/posse atual não remove/finaliza; acesso negado não é ausência.
- [ ] Finalização restrita abrange tabelas novas e destinos autorizados; original sempre separada, terminal compartilhado preservado; recibo final só depois da remoção conferida. Otimização não reduz garantia.
- [ ] Notificações externas só identificação da fábrica, tipo e acesso local validado à tentativa; proibir título de issue/nome do projeto/prompt/log/caminho. Permissão por ação explícita; múltiplas abas/replay/unknown não reenvia; pendência preservada.
- [ ] Histórico/comparação/artefatos respeitam conta/projeto/issue/tentativa/versão; dado ausente explícito e nenhuma transferência de aprovação/trabalho/autoridade.
- [ ] Encerramento preserva estado durável após reinício; pausa bloqueia novos inícios, resume_starts revoga drenagem pendente com automação desligada; CAS/idempotência/geração e barreira final impedem fechamento tardio após retomada aceita. Não cancela, reinicia, publica ou limpa tentativas por retomada/fechamento de diálogo/aba.

**Provas negativas mínimas.** Para cada recusa acima, verificar ausência de chamadas/efeitos no adapter, não apenas status HTTP. Cobrir fixtures de segredos fictícios, injeção de HTML/script/URL executável/metacaracteres, IDs válidos de outro contexto, alteração de conta/plano/destino/referência após apresentar ação, autoridade vencida após IO, cookie/CSRF/Origin inválidos, corpo/cabeçalho excessivos, evento concorrente, operação com resposta perdida e revisão vencida. Repetir fronteiras de interrupção antes/depois de remoto/push/quadro/commit/PR/decisão/transição/finalização, preservando recibos/capturas. Validar proteção de filesystem Windows, suporte/link da notificação no host e integração Maestri/OMP/GitHub separadamente dos testes controlados.

**Prova de persistência/performance.** Instalação limpa e upgrade suportado, constraints compostas/ocupação concorrente, hashes/contagens/capturas antes/depois, P1 sem mutação de captura, revisão por versão e progressão dos bloqueios. Medir EXPLAIN QUERY PLAN, ordenações/linhas examinadas quando disponíveis, latência/tamanho de resposta em primeira página/páginas seguintes/sem resultado/polling, com contas/projetos/resultados/filtros representativos. Consultas especializadas podem evitar predicados opcionais que inutilizem índices. Medir SQLite/WAL/JSON/respostas e latência com caches volumosos antes/depois/retenção; aumentar cache não pode causar cópia proporcional na persistência. Exclusão exige baseline, meta posterior, otimização real e comparação frente à meta, com tempo total/UI/correção independentes. Falha ou evidência parcial permanece pendente.

### 5.3 .env.example

Variáveis existentes necessárias à configuração do controlador, com defaults portáveis; este bloco documenta um exemplo, sem criar arquivo adicional nesta execução:

```dotenv
NODE_ENV=production
FACTORY_BIND_HOST=127.0.0.1
FACTORY_PORT=4310
FACTORY_LOG_LEVEL=info
# Opcional; se fornecida, deve coincidir exatamente com host/porta calculados.
# FACTORY_BROWSER_ORIGIN=http://127.0.0.1:4310
```

NODE_ENV aceita production/development/test; bind aceita somente 127.0.0.1/::1; porta 1–65535; log aceita fatal/error/warn/info/debug/trace/silent. Raiz da instalação é resolvida em runtime e dados ficam sob `var/factory`; nenhum diretório pessoal fixo. Ferramentas são detectadas/corrigidas pelo wizard e configuração existente, sem quatro argumentos obrigatórios. A implementação deve permitir guardar escolhas portáveis necessárias sem restaurar campos globais removidos pela migration 020 nem presumir disponibilidade durável. Não são exigidos DATABASE_URL, JWT_SECRET, chaves de Stripe, SMTP, webhook ou serviço de notificações. Credenciais GitHub/provider/Wire ficam nos mecanismos externos existentes; nunca preencher exemplo, banco ou documento com segredos. Não confundir credenciais de ensaio Wire com conexão nativa do produto.
