# Matriz verificável — sprint-001 documental

Estado final de conferência: [matriz-final-sprint008.md](matriz-final-sprint008.md), com casos executados, versão, anexos e pendências. As expressões “futuro” e “localizado” abaixo descrevem a baseline histórica da sprint-001 e não substituem essa consolidação.

Data: 2026-10-22. Complementa [SPEC_PROGRESS.md](SPEC_PROGRESS.md). Todos os caminhos são relativos à raiz canônica. Requisitos transcritos das stories atuais; referência de fonte inclui linha. **Localizado não significa executado.** Executados seis arquivos de teste preexistentes, com resultado e casos no relatório validacao-sprint001.json; demais testes são somente localizados. Nenhum browser foi executado; typecheck/lint/build constam do progresso. Baseline é inspeção do código atual; não é aceite funcional nem aprovação humana. Toda implementação abaixo é futura, condicionada à autorização. s008 consolida cada linha, sem substituir a prova da sprint proprietária.

## Cenários e fontes por superfície

### G — s003

Fonte atual: apps/web/src/features/projects/ProjectForm.tsx:ProjectConfigurationForm; GitHubSetupPanel / ProjectsFolderField.

Cenário futuro: Conta sem vínculo/divergente/indisponível, pasta ausente/não confirmada/inacessível, nenhum perfil versus papel ausente; um controle configuration compartilhado e status GitHub único; preflight pontual; rascunho não validado pela consulta.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### P — s004

Fonte atual: apps/web/src/features/projects/ProjectForm.tsx:ProjectConfigurationForm; apps/controller/src/modules/storage/configuration-reads.ts.

Cenário futuro: Origem, remoto, quadro/Status e papéis junto dos campos; dirty/revalidação informativos; exclusão pendente e configuração bloqueada; preservar rascunho/ETag e resumo do catálogo.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### I — s004

Fonte atual: apps/web/src/features/preparations/PreparationDialog.tsx:PreparationDialog; IssueOptionsNotice; apps/controller/src/modules/projects/preparations.ts:createPreparations.

Cenário futuro: Issue parcial/inacessível com retry, agrupamento equivalente, critérios inválidos e configuração incompleta; Ready e exceção retry; Iniciar mantém revalidação real; nenhum diagnostics preparation.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### T — s005

Fonte atual: apps/web/src/features/attempts/AttemptDetailDialog.tsx:AttemptDetailDialog; useAttemptActions.

Cenário futuro: Autoridade, suspensão e recursos distintos; equivalentes agrupados por contexto/ação; observar registro não comprova parada; verificar/atualizar/consultar original junto dos recursos.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### V — s004/005

Fonte atual: apps/web/src/features/attempts/useDelivery.ts:useDelivery; apps/controller/src/modules/verification/index.ts:createVerification.

Cenário futuro: Selecionar duas rodadas/versões e inverter respostas; conservar comando/cwd/timeout no projeto, artefatos e resultado na entrega selecionada, tree comum a checks/revisão/publicação.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### C — s006

Fonte atual: apps/web/src/features/projects/ProjectCreationDialog.tsx:CreationResult; apps/controller/src/modules/projects/scaffold.ts:createScaffold.

Cenário futuro: Plano/autorização e condições locais/remotas; criação parcial/unknown com consulta original sem reconciliação implícita; efeito equivalente uma vez e conclusão separada de prontidão posterior; sem maestri_context.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### R — s007

Fonte atual: apps/web/src/features/records/RecordsPanel.tsx:RecordsPanel; useRecords; DiagnosticContextPicker.

Cenário futuro: Remover painel e useDiagnostics só após destinos; filtros, eventos técnicos, cursores e navegação preservados; zero POST diagnostics ao consultar histórico; realocar teste de recibo.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### D — s007

Fonte atual: apps/web/src/features/operations/DashboardPanel.tsx:DashboardPanel; apps/controller/src/modules/storage/operation-summary.ts:readOperationSummary.

Cenário futuro: Mesma causa onboarding/impediments/fila resumida uma vez; diferentes causas preservadas; links globais/projeto/tentativa; integração anterior explicitada; nenhuma execução centralizada.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

### X — s002; aplicação 003–007

Fonte atual: apps/web/src/features/records/useDiagnostics.ts:useDiagnostics; apps/web/src/app/OperatorSupport.tsx:OperatorDiagnosticCard.

Cenário futuro: Perda de resposta e falha do GET original sem segundo POST; fechar/reabrir na mesma sessão mantém correlação; reload limita recuperação às leituras existentes; trocar objeto/conta/revisão e inverter respostas; corrigir bloqueio e preservar histórico anterior; preservar erro de ação e rascunho. Medir zero diagnóstico novo por navegação, zero efeitos protegidos, linguagem/teclado/foco.

Prova disponível: inspeção estática e casos localizados no catálogo abaixo. Lacuna: execução após reorganização, contadores RNF-01/02, renderização e Chrome desktop/mobile/teclado/foco com assets da versão. Reutilizar casos pertinentes; ampliar somente lacunas concretas.

## RF-01 a RF-39

| Item / fonte stories | Obrigação exata | Sprint / cenário | Evidência disponível e lacuna |
| --- | --- | --- | --- |
| RF-01 / L206 | Apresentar condições globais de conta/GitHub na seção GitHub de Configuração. | s003 / G | Fonte atual e testes localizados do cenário G; prova funcional/visual futura, não executada |
| RF-02 / L207 | Apresentar condições da pasta junto do campo e confirmação existentes. | s003 / G | Fonte atual e testes localizados do cenário G; prova funcional/visual futura, não executada |
| RF-03 / L208 | Apresentar ausência de perfis ativos com acesso a Perfis e sem avisos equivalentes por papel quando todos estão ausentes. | s003 / G | Fonte atual e testes localizados do cenário G; prova funcional/visual futura, não executada |
| RF-04 / L209 | Apresentar a observação nativa Maestri/OMP na prontidão global com seu limite de observação pontual. | s003 / G | Fonte atual e testes localizados do cenário G; prova funcional/visual futura, não executada |
| RF-05 / L210 | Preservar a separação entre verificar identidade, vincular conta e trocar conta. | s003 / G | Fonte atual e testes localizados do cenário G; prova funcional/visual futura, não executada |
| RF-06 / L216 | Posicionar pendências de origem/remoto junto da origem do projeto. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-07 / L217 | Posicionar pendências de quadro e mapeamento junto do quadro/Status. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-08 / L218 | Posicionar ausência ou incompatibilidade dos perfis associados junto dos papéis do projeto. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-09 / L219 | Preservar caráter informativo de alterações locais excluídas e revalidação posterior. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-10 / L220 | Manter resumo e acesso ao projeto no catálogo, sem relatório completo de prontidão. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-11 / L221 | Apresentar falhas da consulta de issues junto da seleção, preservando agrupamento de acesso e nova consulta. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-12 / L222 | Preservar as regras atuais de elegibilidade de issue e a exceção de nova tentativa fora de Ready. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-13 / L223 | Apresentar divergências de base, origem, repositório, revisão e perfil junto do resumo/configuração efetiva sem adoção silenciosa. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-14 / L224 | Apresentar critérios não executáveis e configuração efetiva incompleta junto dos critérios/resumo. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-15 / L225 | Manter nas ações afetadas o resumo de impedimentos globais e acesso à correção pertinente. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-16 / L226 | Preservar habilitação de Iniciar e revalidação real antes do despacho sem exigir verificação manual anterior. | s004 / I | Fonte atual e testes localizados do cenário I; prova funcional/visual futura, não executada |
| RF-17 / L227 | Preservar restrições de exclusão pendente e bloqueio de configuração por tentativa/publicação. | s004 / P | Fonte atual e testes localizados do cenário P; prova funcional/visual futura, não executada |
| RF-18 / L233 | Apresentar suspensão e autoridade no estado operacional ou ação pertinente da tentativa. | s005 / T | Fonte atual e testes localizados do cenário T; prova funcional/visual futura, não executada |
| RF-19 / L234 | Apresentar condições de recursos junto das ações de Parada, ambiente e ações nativas, sem inferir parada física da leitura de registros. | s005 / T | Fonte atual e testes localizados do cenário T; prova funcional/visual futura, não executada |
| RF-20 / L235 | Manter a edição de comandos, cwd relativo e timeout na configuração de checks do projeto. | s004/005 / V | Fonte atual e testes localizados do cenário V; prova funcional/visual futura, não executada |
| RF-21 / L236 | Manter resultados e artefatos de checks associados à rodada/versão selecionada no detalhe da tentativa. | s004/005 / V | Fonte atual e testes localizados do cenário V; prova funcional/visual futura, não executada |
| RF-22 / L237 | Preservar a identidade da versão exigida por checks, revisão e publicação, gerando outra rodada/versão para correções. | s004/005 / V | Fonte atual e testes localizados do cenário V; prova funcional/visual futura, não executada |
| RF-23 / L243 | Apresentar pré-requisitos existentes de criação no formulário/plano antes da autorização/execução. | s006 / C | Fonte atual e testes localizados do cenário C; prova funcional/visual futura, não executada |
| RF-24 / L244 | Limitar diagnóstico de criação aos checks suportados, sem exigir contexto Maestri. | s006 / C | Fonte atual e testes localizados do cenário C; prova funcional/visual futura, não executada |
| RF-25 / L245 | Apresentar falha, parcialidade e incerteza no resultado com etapas e efeitos preservados. | s006 / C | Fonte atual e testes localizados do cenário C; prova funcional/visual futura, não executada |
| RF-26 / L246 | Exibir cada efeito equivalente uma vez nas listas da criação, preservando estado e proveniência nas fontes persistidas. | s006 / C | Fonte atual e testes localizados do cenário C; prova funcional/visual futura, não executada |
| RF-27 / L247 | Separar sucesso da criação de pendências para iniciar issue, oferecendo acesso ao projeto. | s006 / C | Fonte atual e testes localizados do cenário C; prova funcional/visual futura, não executada |
| RF-28 / L253 | Remover de Registros o seletor de diagnóstico, escolha de checks e comandos de consultar/executar diagnóstico operacional. | s007 / R | Fonte atual e testes localizados do cenário R; prova funcional/visual futura, não executada |
| RF-29 / L254 | Preservar histórico, filtros, paginação e eventos existentes de verificação em Registros. | s007 / R | Fonte atual e testes localizados do cenário R; prova funcional/visual futura, não executada |
| RF-30 / L255 | Limitar Dashboard a resumos operacionais e acessos aos destinos, retirando relatórios completos equivalentes. | s007 / D | Fonte atual e testes localizados do cenário D; prova funcional/visual futura, não executada |
| RF-31 / L256 | Derivar contexto do objeto aberto nas superfícies proprietárias, sem seletor equivalente ao removido. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-32 / L257 | Consolidar avisos apenas quando causa, contexto e próxima ação forem equivalentes, sem deduplicação indiscriminada por texto ou código. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-33 / L258 | Identificar explicitamente resultados anteriores, leituras parciais e ausência de observação sem apresentá-los como pronto. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-34 / L259 | Preservar distinção entre falha de consulta, falha de gravação/ação e operação aceita ou incerta. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-35 / L260 | Consultar operações aceitas ou incertas pela correlação original sem reenviar a operação automaticamente. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-36 / L261 | Impedir apresentação de respostas atrasadas como atuais após troca de objeto, conta ou revisão. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-37 / L262 | Preservar rascunhos e conflitos entre abas; leitura persistida não pode confirmar salvamento nem validar edição não salva. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-38 / L263 | Apresentar causa e próxima ação em linguagem do operador e omitir códigos, IDs internos, recibos e fatos técnicos brutos. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |
| RF-39 / L264 | Preservar nas superfícies responsáveis as ações manuais existentes de verificar, atualizar a leitura e consultar resultado/recibo da operação original: condições globais em Configuração, condições próprias na configuração do projeto e recursos/condições específicas no detalhe da tentativa ou fluxo/resultado da criação. Usar contexto implícito, checks já suportados e ações existentes, sem duplicação, novas capacidades, diagnóstico de preparação, execução ao navegar ou pré-etapa obrigatória. | s002; aplicação 003–007 / X | Fonte atual e testes localizados do cenário X; prova funcional/visual futura, não executada |

## RNF-01 a RNF-12

| Item / fonte stories | Obrigação exata | Sprint / cenário | Evidência e lacuna |
| --- | --- | --- | --- |
| RNF-01 / L272 | A reorganização deve acrescentar zero execuções de verificações e zero chamadas externas de diagnóstico motivadas apenas pela navegação. Comparar rastros controlados de abertura das superfícies; não introduzir polling ou monitoramento novos. Leituras necessárias à apresentação e consulta de recibos já existentes preservam sua semântica. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-02 / L273 | Consultar ou navegar deve gerar zero vínculos/trocas de conta, despachos, criações, publicações ou repetições de efeitos. Comprovar com contadores dos adapters controlados. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-03 / L274 | Observação global não deve conceder autoridade. Cenários de identidade divergente e autoridade revogada devem manter a mesma recusa de início/publicação já prevista, inclusive após diagnóstico anterior favorável. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-04 / L275 | Para cada conjunto equivalente de causa/contexto/próxima ação, deve existir no máximo um aviso detalhado por superfície; todos os conjuntos independentes devem permanecer representados. Validar fixtures de mesma causa, causa distinta e mesmo código em objetos distintos. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-05 / L276 | Nas superfícies afetadas, a quantidade de códigos, IDs internos, recibos e fatos técnicos brutos visíveis deve ser zero. Verificar renderização de sucesso, bloqueio, erro e incerteza. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-06 / L277 | Todos os controles e acessos preservados ou realocados devem ser operáveis por teclado, com foco visível e manutenção do comportamento de foco dos diálogos. A prova visual deve cobrir desktop e mobile, mantendo o layout aprovado. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-07 / L278 | Em troca de contexto durante resposta pendente, nenhuma resposta antiga pode aparecer como atual no novo objeto/conta/revisão. Validar inversão controlada da ordem de respostas e fechamento/reabertura das superfícies. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-08 / L279 | Resposta perdida e falha de consulta do recibo não devem causar segundo envio da verificação original. Comprovar uma intenção persistida e correlação preservada ao consultar novamente. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-09 / L280 | Falha de leitura com resultado anterior deve preservar esse resultado identificado como anterior; não pode apagar falha da ação original nem produzir indicação de prontidão atual. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-10 / L281 | Alteração de configuração deve manter intacta a captura de tentativas em andamento. Conflito entre abas deve preservar a edição local até resolução pelo fluxo existente. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-11 / L282 | A UI deve consumir decisões dos módulos responsáveis, com zero regras paralelas novas de elegibilidade/autorização e zero SQL fora de storage. Preservar interfaces públicas, TypeScript strict e contratos existentes; validar com typecheck e lint configurados. | s002–008 / X; checks técnicos atuais passaram | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |
| RNF-12 / L283 | A retirada do painel de diagnóstico deve excluir zero eventos, relatórios ou recibos persistidos por causa da realocação. Os eventos de verificação devem continuar acessíveis pelos filtros e paginação existentes. | s002; aplicação s003–007; consolidação s008 / X e cenário da superfície | Testes localizados abaixo; contadores, renderização, corridas e prova pós-mudança pendentes |

## Todos os critérios de US-01 a US-10

Cada CA conserva o texto da fonte, inclusive limites negativos. O cenário indicado se aplica ao CA individual; catálogo abaixo identifica casos existentes candidatos, sem presumir cobertura integral.

| Critério / linha stories | Texto normativo | Sprint / cenário / lacuna |
| --- | --- | --- |
| US-01.1 / L45 | Configuração apresenta condições de GitHub/conta, pasta dos projetos, perfis ativos e contexto Maestri/OMP nas seções correspondentes, sem seletor técnico de contexto. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.2 / L46 | Conta não vinculada, necessidade de novo vínculo, divergência de identidade e leitura indisponível permanecem distinguíveis. Conferir identidade não vincula nem troca conta. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.3 / L47 | Pasta ausente, não confirmada, inacessível ou alterada aparece junto de `ProjectsFolderField`, preservando a confirmação existente. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.4 / L48 | Ausência total de perfis não produz três avisos equivalentes de ausência total, Implementador e Revisor; o aviso mantém acesso ao gerenciamento existente de Perfis. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.5 / L49 | Um resultado Maestri/OMP é apresentado como observação pontual do contexto nativo, sem afirmar execução de provider ou disponibilidade de MCP. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.6 / L50 | A verificação consulta configuração persistida e não apresenta um rascunho não salvo como validado. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-01.7 / L51 | Configuração preserva as ações manuais existentes de verificar condições globais, atualizar sua leitura e consultar o resultado da operação original nas seções responsáveis: GitHub/conta junto de GitHub, configuração junto de pasta/perfis e contexto Maestri/OMP junto da integração. Reutiliza Verificar status do GitHub e a confirmação da pasta, sem duplicar ações nem vincular/trocar conta implicitamente. | s003 / G; inspeção atual, prova individual pós-mudança pendente |
| US-02.1 / L63 | Origem/remoto não confirmado aparece junto da origem; quadro ausente ou inacessível e mapeamento inválido aparecem junto do quadro/Status; associação ausente ou incompatível de perfis aparece junto dos papéis. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.2 / L64 | Existência global de perfis e associação válida no projeto continuam sendo condições distintas. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.3 / L65 | Alterações locais excluídas e necessidade de revalidação posterior são informações contextuais, sem novo cartão de bloqueio. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.4 / L66 | Catálogo mantém resumo e acesso à configuração; não reproduz o relatório completo. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.5 / L67 | Exclusão pendente e bloqueio de edição por tentativa/publicação mantêm as capacidades e os avisos atuais. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.6 / L68 | Consultar prontidão não descarta rascunhos nem elimina conflito de revisão entre abas. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-02.7 / L69 | A configuração do projeto preserva verificar as condições próprias de configuração, atualizar sua leitura e consultar o resultado da operação original junto de origem, quadro/Status e papéis, com o projeto aberto como contexto. Condições globais mantêm seu destino em Configuração; preparação conserva somente suas consultas e pré-requisitos existentes, sem novo diagnóstico de preparação. | s004 / P; inspeção atual, prova individual pós-mudança pendente |
| US-03.1 / L79 | Consulta parcial ou indisponível aparece junto do seletor de issue e mantém a ação existente de consultar novamente. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.2 / L80 | Falhas equivalentes de acesso já agrupadas por `IssueOptionsNotice` geram uma causa acionável, sem mensagem genérica redundante para a mesma indisponibilidade. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.3 / L81 | Condições para iniciar mantêm os critérios existentes sobre fechamento, tipo, repositório, assignee, vínculo ao quadro, Status, bloqueadores e leitura incompleta, incluindo a exceção existente de nova tentativa fora de Ready. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.4 / L82 | Divergência de remoto/base, repositório arquivado, revisão de configuração ou referência de perfil alterada aparece no resumo/configuração efetiva, sem adoção silenciosa da base ou do rascunho. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.5 / L83 | Critérios não executáveis e configuração efetiva incompleta aparecem junto dos critérios/resumo e preservam a habilitação atual de Iniciar. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.6 / L84 | Revalidação de issue e executor permanece informativa. Impedimento global aparece como resumo contextual e acesso à correção, sem relatório global completo. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-03.7 / L85 | Iniciar continua revalidando no pipeline, mesmo após uma observação global bem-sucedida; nenhum diagnóstico manual passa a ser obrigatório. | s004 / I; inspeção atual, prova individual pós-mudança pendente |
| US-04.1 / L97 | Diagnóstico geral e razão de autoridade que representem a mesma causa, contexto e próxima ação geram um único aviso detalhado na superfície. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-04.2 / L98 | Restrições de autoridade, problemas de recursos e falhas da versão com ações diferentes continuam visíveis separadamente. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-04.3 / L99 | Acompanhamento perdido, recurso incerto, ownership não confirmado e ausência de observação aparecem junto de Parada, ambiente e ações nativas pertinentes. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-04.4 / L100 | Consulta de recursos registrados não é apresentada como confirmação de parada física ou de acesso ao conteúdo. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-04.5 / L101 | O detalhe usa a tentativa aberta como contexto e não solicita escolha de outro contexto para diagnosticar. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-04.6 / L102 | O detalhe preserva as ações manuais existentes de verificar recursos registrados, atualizar sua leitura e consultar o resultado da operação original junto de Parada, ambiente e ações nativas pertinentes. Condições específicas da tentativa permanecem nesse detalhe; verificações globais têm destino em Configuração. Não se acrescenta capacidade de parada, recuperação ou acesso a conteúdo. | s005 / T; inspeção atual, prova individual pós-mudança pendente |
| US-05.1 / L112 | Comando, diretório relativo e timeout continuam definidos na seção Checks do projeto. | s004/005 / V; inspeção atual, prova individual pós-mudança pendente |
| US-05.2 / L113 | Resultados e artefatos continuam no detalhe da tentativa, associados à rodada/versão selecionada, separados de prontidão operacional. | s004/005 / V; inspeção atual, prova individual pós-mudança pendente |
| US-05.3 / L114 | Mudar a seleção não apresenta resultado de outra versão como pertencente à atual. | s004/005 / V; inspeção atual, prova individual pós-mudança pendente |
| US-05.4 / L115 | Reorganizar diagnósticos não altera a exigência de mesma versão para checks, revisão e publicação; correção exige nova rodada/versão. | s004/005 / V; inspeção atual, prova individual pós-mudança pendente |
| US-06.1 / L127 | Pré-requisitos de scaffold, pasta/destino, capacidade Git, conta e autorização da modalidade remota aparecem no formulário/plano antes da execução, preservando as ações atuais. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.2 / L128 | Diagnóstico de criação não exige nem solicita `maestri_context`, que não é suportado nesse escopo. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.3 / L129 | Criação parcial, falha ou efeito incerto aparece junto das etapas e efeitos preservados, com as ações existentes de consulta/conferência. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.4 / L130 | O mesmo efeito presente nas fontes local e remota não é repetido na apresentação nem na lista de etapas pendentes; estados e proveniência permanecem no backend. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.5 / L131 | Criação concluída com pré-requisitos pendentes para iniciar issue permanece concluída e oferece acesso à configuração do projeto. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.6 / L132 | Consultar uma criação não cria recursos, repete efeitos nem executa reconciliação implicitamente. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-06.7 / L133 | O resultado da criação preserva as ações manuais existentes de verificar recursos registrados, atualizar sua leitura e consultar o resultado da operação original junto das etapas e efeitos. Condições específicas de configuração/identidade permanecem no formulário/plano ou resultado correspondente, respeitando os checks já suportados; condições globais apontam para Configuração. Não se acrescenta ação ou capacidade de criação/conferência. | s006 / C; inspeção atual, prova individual pós-mudança pendente |
| US-07.1 / L145 | Registros não apresenta seletor de contexto de diagnóstico, seleção de checks operacionais, Atualizar diagnóstico ou Verificar selecionados. | s007 / R; inspeção atual, prova individual pós-mudança pendente |
| US-07.2 / L146 | Filtros existentes de projeto, tentativa e operação, opção de incluir eventos técnicos, navegação entre páginas e acesso aos objetos continuam funcionando. | s007 / R; inspeção atual, prova individual pós-mudança pendente |
| US-07.3 / L147 | Eventos de verificações já persistidos continuam consultáveis no histórico, sem exigir migração ou exclusão por causa da realocação. | s007 / R; inspeção atual, prova individual pós-mudança pendente |
| US-07.4 / L148 | Consultar histórico não dispara verificação operacional. | s007 / R; inspeção atual, prova individual pós-mudança pendente |
| US-08.1 / L158 | Pendências equivalentes originadas de onboarding, impedimentos e fila não repetem o mesmo cartão detalhado no Dashboard. | s007 / D; inspeção atual, prova individual pós-mudança pendente |
| US-08.2 / L159 | Resumo global aponta para Configuração ou Perfis; condição do projeto aponta para esse projeto; condição da tentativa aponta para essa tentativa, conforme o caso existente. | s007 / D; inspeção atual, prova individual pós-mudança pendente |
| US-08.3 / L160 | Causas independentes permanecem distinguíveis e observação antiga de integração não é anunciada como garantia atual. | s007 / D; inspeção atual, prova individual pós-mudança pendente |
| US-08.4 / L161 | Dashboard não recebe seletor de contexto nem execução centralizada de diagnóstico. | s007 / D; inspeção atual, prova individual pós-mudança pendente |
| US-09.1 / L173 | Resultado anterior preservado durante atualização ou falha de leitura é identificado como anterior; ausência de observação ou leitura parcial não recebe indicação de pronto. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.2 / L174 | Operação aceita, em andamento, resultado incerto e consulta indisponível têm apresentação distinguível e não provocam reenvio automático. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.3 / L175 | Consultar resultado usa a operação original e mantém a correlação e idempotência existentes. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.4 / L176 | Trocar objeto, conta ou revisão impede que resposta atrasada seja apresentada como atual no novo contexto. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.5 / L177 | Falha de consulta não apaga falha de gravação ou da ação original; consultar dados não equivale a salvar. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.6 / L178 | Relatórios persistidos representam observações anteriores e não certificam prontidão atual. Ao concluir uma verificação, fechar a superfície, alterar a revisão e reabrir o mesmo objeto, o resultado original permanece preservado e identificado como observação anterior, distinto da leitura atual de configuração. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.7 / L179 | Respostas de leitura ou ação pendentes de um contexto anterior não aparecem como atuais após mudança de conta ou revisão, inclusive ao fechar/reabrir a superfície ou inverter a ordem de chegada das respostas. Preservar a correlação e o resultado original não autoriza atribuí-los ao novo contexto. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-09.8 / L180 | Esses critérios protegem a reorganização da apresentação existente; não exigem certificação automática de atualidade, invalidação persistida retroativa, TTL, novo polling, reexecução automática ou infraestrutura, nem reformulação do mecanismo de diagnósticos. A consulta e o acompanhamento de recibos já existentes mantêm sua semântica. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-10.1 / L190 | Na mesma superfície, ocorrências com mesma causa, contexto e próxima ação geram um único aviso detalhado. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-10.2 / L191 | Código igual em projetos ou recursos diferentes não basta para agrupar; causas diferentes com textos parecidos continuam distintas. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-10.3 / L192 | Pré-requisito e falha de consulta equivalentes produzem uma explicação acionável, mantendo os estados distintos na origem. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-10.4 / L193 | Toda causa acionável contém próxima ação; superfícies secundárias usam resumo e acesso ao responsável quando isso substitui avisos atuais. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |
| US-10.5 / L194 | Textos visíveis não expõem códigos, IDs internos, recibos ou fatos técnicos brutos. As ações continuam utilizáveis por teclado, com foco preservado. | s002; aplicação 003–007 / X; inspeção atual, prova individual pós-mudança pendente |

## SPEC 5.1–5.3 e cenários transversais

### Correção de correlação e avisos — 2026-10-22

Recorte técnico executado: **79 testes aprovados em 7 arquivos** (useDiagnostics.test.ts, diagnostic-notices-rendering.test.ts, diagnostic-receipt-rendering.test.ts, api/http.test.ts, integration/operation-diagnostics.test.ts, integration/http-security.test.ts e github-diagnostics-rendering.test.ts). Typecheck, lint e build aprovados. Evidência controlada; não comprova integração nativa nem provider real.

| Caso da seção 5 | Evidência executada | Resultado / limite |
| --- | --- | --- |
| Sessão ausente e revogada | integration/http-security.test.ts: GETs never bootstrap; rejects absent/wrong/cross-session CSRF; revokes previous-instance cookies | Aprovado contra aplicação HTTP com armazenamento descartável; sem alterar sessão operacional. |
| Renovação de leitura em 401 | api/http.test.ts: renews and retries a json/text read only once after 401 | Aprovado: duas leituras no máximo, mesmo quando a segunda recebe 401. |
| Mutação em 401 e renovação indisponível | api/http.test.ts: never replays a mutation; preserves the original json/text mutation error | Aprovado: mantém erro/correlação original, sem replay do comando. |
| 403 sem replay | api/http.test.ts: never renews or replays a GET/POST request after 403 | Aprovado: nenhuma renovação ou segunda chamada ao recurso. |
| Conta, revisão, objeto e ciclo de vida | useDiagnostics.test.ts: inverted reads; late action after closing; closed lifecycle | Aprovado com respostas controladas invertidas e fechamento/reabertura; observação antiga não aparece como atual. |
| Resposta perdida e consulta original | useDiagnostics.test.ts: accepted/uncertain submission across closing; recovered operation after reload; missing correlation | Aprovado: somente um POST, GET da operação original; limitação explícita quando não recuperável. Correlação da sessão apenas em memória; recarga recupera somente pelos relatórios existentes. |
| Erros independentes | useDiagnostics.test.ts: retains action uncertainty independently of query failures and retries; preserves earlier observation | Aprovado: consulta não apaga incerteza original, falha anterior nem observação preservada. |
| Composição e histórico | diagnostic-notices-rendering.test.ts; diagnostic-receipt-rendering.test.ts | Aprovado: equivalentes atuais agrupados; contextos/causas diferentes separados; bloqueio corrigido somente no histórico identificado, com data e estado. |
| UI controlada | Playwright MCP, componentes reais servidos pelo Vite atualizado, respostas HTTP sintéticas | Desktop 1365×1100 e mobile 390×844 sem overflow; um aviso detalhado e um grupo para duas ocorrências; Consultar resultado disponível e focável. Recarga real da página recuperou a operação original: GET correspondente e zero POSTs de verificação. Capturas: `.playwright-mcp/diagnostics-correction-desktop.png` e `diagnostics-correction-mobile.png`. Não é prova do controlador nativo. |

Nenhum DTO, protocolo, schema persistido, TTL, polling de prontidão ou regra de autorização/elegibilidade foi acrescentado. O acompanhamento periódico existente continua restrito à operação aceita/em andamento; consulta manual não reenvia a ação.

### Execução atual da sprint-002 — 2026-10-22

Autorização de implementação: pedido explícito desta tarefa. A tabela anterior é registro preexistente; esta execução não repetiu suas alegações de browser. Evidência desta rodada: [validacao-sprint002-final.json](validacao-sprint002-final.json), 84 testes aprovados em sete arquivos, exit 0. Typecheck, lint e build passaram. [Progresso e limites atuais](SPEC_PROGRESS.md#sprint-002--preservar-contexto-observações-e-consulta-da-operação-original).

| Critério / caso da seção 5 | Evidência desta execução | Resultado / limite |
| --- | --- | --- |
| 5.1.3/5.2 sessão ausente ou revogada | integration/http-security.test.ts | Aprovado com Fastify/SQLite descartáveis; não se consultou sessão operacional |
| 5.1.6 renovação de leitura em 401 | api/http.test.ts: renews and retries a json/text read only once after 401 | Aprovado: no máximo uma renovação e uma releitura |
| 5.1.6/5.2 resposta perdida e identidade original em 401 | api/http.test.ts: keeps the CSRF token in memory and never replays a mutation after a 401; preserves the original json/text mutation error when session renewal fails | Aprovado: preserva metadados/erro original, sem novo comando |
| 5.2 transversal 403 | api/http.test.ts: never renews or replays a GET/POST request after 403 | Aprovado: sem renovação nem replay |
| US-09.1/6/7 e RF-33/36 | useDiagnostics.test.ts: inverted reads; late action after closing; closed lifecycle; response spanning account/revision change; completed verification as previous | Aprovado com respostas invertidas e fechamento/reabertura; identidade original não é transferida |
| RNF-09/US-09.1, mudança de revisão e falha de leitura | keeps the earlier view identified as stale if the new revision cannot be read | Reproduziu falha antes da correção; aprovado após preservar a leitura anterior do mesmo objeto |
| E4/RF-35 | accepted/uncertain submission across closing; recovered operation after reload; missing correlation | Aprovado: um POST e GET da operação original; recarga simulada por memória sem correlação e relatórios existentes, sem prova de reload real no browser |
| RF-34, recibo indisponível | preserves accepted state when its receipt is unavailable and only retries consultation explicitly; retains action uncertainty independently of query failures and retries | Reproduziu perda do estado aceito; aprovado após separar queryError. Mantém erro original e aguarda consulta explícita, sem replay |
| E2/RF-32 | diagnostic-notices-rendering.test.ts: equivalent current conditions; different checks/accounts/next actions; different resources/causes | Aprovado: uma apresentação por condição equivalente, sem ocultar restrição reportada nem juntar contextos distintos |
| E2/RF-33/38 | corrected blocker retaining previous report; incomplete observation; diagnostic-receipt-rendering.test.ts; github-diagnostics-rendering.test.ts | Aprovado: anterior com data/estado, ausência de pronto inferido, sem códigos/IDs/recibos/fatos brutos na explicação operacional |
| RNF-06/aceite visual e integração externa | Não executados nesta rodada | not_verified; componentes/DOM controlados e renderização estática não substituem Chrome, Revisor ou integração nativa |

Os recortes preservam as proteções e os serviços existentes, sem novo DTO, persistência, TTL, polling de prontidão ou autorização paralela. A aplicação destas garantias nas superfícies proprietárias permanece nas próximas sprints, sem avanço implícito. A suíte integral e a manutenção de fixtures constam no progresso, com os relatórios anteriores de falha preservados.

Não se altera mecanismo de segurança. N/A se refere somente ao mecanismo ausente, não dispensa autorização, download ou os cenários adjacentes. Prefixo de backend abreviado: apps/controller/src/. Cada termo de caso abaixo é um localizador; os títulos completos efetivamente encontrados estão no catálogo.

| Item | Fonte/mecanismo atual | Teste/caso candidato | Sprint responsável / evidência / lacuna |
| --- | --- | --- | --- |
| 5.1.1 | config.ts:loadConfiguration; http/assets.ts; security/index.ts | tests/config.test.ts: configuração; tests/integration/http-security.test.ts: requires exact Host | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.2 | security/index.ts:installSecurity; http/security/index.ts | tests/integration/http-security.test.ts: independent 32-byte | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.3 | security/index.ts:installSecurity | tests/integration/http-security.test.ts: revokes previous-instance | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.4 | security/index.ts; http/errors.ts; http/app.ts | tests/integration/http-security.test.ts: absent/wrong/cross-session | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.5 | storage/diagnostics.ts:acceptDiagnostic; pipeline/start.ts; publication/index.ts | tests/integration/operation-diagnostics.test.ts: commits intent | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.6 | apps/web/src/api/http.ts:requestJson; useDiagnostics.ts:retryReceipt | apps/web/src/api/http.test.ts: never replays | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.1.7 | security/index.ts; projects/index.ts; useGitHubSetup.ts | tests/integration/account-binding.test.ts: binding | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Session config | security/index.ts | tests/integration/http-security.test.ts: session-only | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 RLS | services/storage, escopo instalação/conta/contexto | tests/integration/operation-diagnostics.test.ts: current account | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. N/A policies RLS porque SQLite; comprovar escopo nos serviços/storage. |
| 5.2 CORS | security/index.ts | tests/integration/http-security.test.ts: preflight remains closed | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Rate limiting | security/index.ts:httpLimits | tests/integration/http-security.test.ts: bounds bootstrap rate | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Input validation | http/routes/operation.ts; contratos http-observation/operation.ts | tests/integration/operation-diagnostics.test.ts: unsupported checks | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Webhook signature | N/A: nenhum webhook; SSE local | tests/integration/operation-diagnostics.test.ts: replays events | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. N/A assinatura porque não há webhook; SSE não é webhook. |
| 5.2 Secrets | http/app.ts; http/errors.ts; security/index.ts | tests/integration/http-security.test.ts: secrets never enter | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 File upload / artefatos | N/A upload; verification/artifacts.ts e http/routes/deliveries.ts para download existente | tests/integration/verification.test.ts: protected inert evidence | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. N/A validação upload porque não há upload; download mantém text/plain, CSP sandbox, attachment e nosniff. |
| 5.2 Identidade/autoridade | pipeline/start.ts; publication/index.ts | tests/integration/publication.test.ts: authority | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Zero efeitos por consulta | diagnostics/index.ts; routes/operation.ts; scaffold.ts | tests/integration/operation-diagnostics.test.ts: no GET effects | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Dados/proveniência/histórico | storage/diagnostics.ts; RecordsPanel; useRecords | tests/integration/operation-diagnostics.test.ts: without rewriting | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Respostas/rascunhos | useDiagnostics.ts; ProjectForm.tsx; useConfiguration.ts | tests/configuration-save-web.test.ts: context | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Resposta perdida/intenção única | useDiagnostics.ts; storage/diagnostics.ts | tests/integration/operation-diagnostics.test.ts: never replays checks | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Linguagem/segredos/duplicação | app/OperatorSupport.tsx:OperatorDiagnosticCard; operator-language.ts | tests/diagnostic-receipt-rendering.test.ts: keeping receipt | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 Versão/correção | verification/index.ts; storage/verification.ts; pipeline/start.ts | tests/integration/reviews.test.ts: round | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 transversal 403 sem replay | api/http.ts; security/index.ts | tests/integration/http-security.test.ts: CSRF | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 transversal inversão/fechamento/reabertura | useDiagnostics.ts; useDelivery.ts | apps/web/src/features/operations/observation-baseline.test.ts: late | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.2 transversal limites/Retry-After/logs | security/index.ts; http/errors.ts | tests/integration/http-security.test.ts: sanitized errors | s002 regressões pertinentes, aplicação s003–007, conferência s008; localizado; execução AS-IS somente quando o arquivo consta no relatório desta sprint. Prova pós-reorganização pendente; não atribuir cobertura integral a caso candidato. |
| 5.3 NODE_ENV | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 FACTORY_BIND_HOST | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 FACTORY_PORT | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 FACTORY_LOG_LEVEL | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 FACTORY_BROWSER_ORIGIN | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 installationRoot/var/factory | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |
| 5.3 ausência de novos segredos/GITHUB_TOKEN/MAESTRI_PIPE | .env.example e apps/controller/src/config.ts:loadConfiguration | tests/config.test.ts; apps/controller/src/modules/storage/local-installation.test.ts | s008: exemplo/config inspecionados; zero variável nova; validação de configuração da reorganização futura. Não ler valores do ambiente ou banco operacional |

## Catálogo de testes existentes consultados

Títulos coletados diretamente dos arquivos atuais. Vitest executou somente os seis arquivos listados em SPEC_PROGRESS.md, com resultado no JSON. Um teste pode cobrir só parte do cenário; a prova da reorganização futura continua pendente. Arquivo ausente é lacuna explícita, não caso inventado.


### tests/github-diagnostics-rendering.test.ts

- L20: keeps discarded candidates private when discovery succeeds
- L28: shows the blocker once while keeping search diagnostics private
- L37: keeps authentication failures prominent even when executable discovery succeeds
- L47: renders nothing when no diagnostics were reported

### tests/integration/projects.test.ts

- L55: refuses automatic work when the default controller account context is unavailable, even with configured automation
- L68: counts the full result independently of HTTP pages, with no durable writes or consumption
- L84: explains missing, other and multiple assignees without changing them
- L97: keeps a blocker local to its issue and treats Ready as an observed set
- L114: rejects closed, foreign, archived and mismatched membership issues individually
- L126: uses numeric priority in either direction, documented position, then number/ID
- L144: makes unavailable priority and undocumented position fallbacks explicit
- L153: does not authorize or count %s reads
- L161: honors remote reset beyond configured backoff and issues no calls during cooldown
- L179: bounds exponential read backoff using the configured maximum and resets it after success
- L200: invalidates hashes and cursors on quantity, mode, scope and observed account changes
- L217: rejects configuration or account changes during IO instead of authorizing mixed observations
- L317: returns sanitized active-account observations without binding or writing settings
- L347: keeps the linked account separate from the active account reported by GitHub CLI
- L367: persists a validated executable as an isolated settings operation and exposes it on the next query
- L397: rejects invalid or mixed executable saves without changing the stored path
- L444: returns sanitized validation errors keyed to project registration fields
- L452: registers a dirty local origin without remote, persists its initial revision and preserves origin bytes
- L468: recovers lost registration responses before inspecting again, including after reopen
- L480: never invents a local identity when the authorized Git context is missing
- L485: stores canonical GitHub identity from inspection rather than trusting caller IDs or folder names
- L492: uses a bounded cursor tied to filters, account, installation and stable name/ID order
- L506: rejects invalid schemas, IDs, missing keys, session and CSRF without writes
- L520: rejects retired editable field %s on both aggregate routes without side effects
- L534: starts with empty profiles and preserves exact profiles and omitted nested defaults
- L545: returns 428/412 for missing/stale ETag and recovers the original accepted receipt before CAS
- L556: rolls back settings, profile, operation and receipt when %s persistence fails
- L568: commits one settings operation and event for concurrent requests with the same ID
- L583: recovers the original settings receipt after reopen before path validation and stale CAS
- L603: includes profile revisions and new profiles in the compound ETag of every project editor
- L613: atomically commits all project fields, explicit globals, profiles, pointer, receipt and event
- L633: rejects a saved operation ID when the project resource or account context changes
- L651: rolls back every aggregate when %s persistence fails
- L662: rolls back settings on unknown/duplicate profiles and invalid project profile links
- L670: rejects unsafe check cwd %s
- L674: rejects invalid correction limit %s
- L678: rejects invalid, duplicate, incomplete, inaccessible or wrong-owner Status mappings
- L689: prevents rewriting history, deleting it, null/missing pointers or linking another project revision
- L698: returns real owner/Project fields for an unsaved selection and paginates without silently truncating
- L710: reports unavailable option reads explicitly with the production adapter
- L719: exposes only fixed native selections, validates the candidates and never saves them implicitly
- L749: reports unavailable and cancelled selections without changing the saved root
- L764: rejects a selected root replaced by a junction or symlink before save writes into its target
- L782: opens only one selector across kinds and sessions while the first native window is unresolved
- L798: removes the handler deadline only from native selection
- L811: keeps the picker open without a deadline and preserves exclusivity until user cancellation
- L835: requests native closure on client cancellation and ignores the late path
- L857: persists validated directories and separate time and artifact choices
- L875: changes only the future projects root and clears its confirmation when removed
- L896: rejects unavailable or nonlocal directory %s without partial save
- L901: rechecks composite revisions after asynchronous mapping validation and refuses all requested writes
- L913: does not keep confirmed repository IDs when a changed source is inspected without a remote
- L925: preserves configuration and receipts when upgrading an actual version-two database
- L946: returns a sanitized unavailable response under a finite SQLite write lock
- L957: rejects secret-shaped Maestri settings and credential-bearing origin URLs without retaining the input
- L966: enforces explicit aggregate changes in the public storage contract as well as HTTP
- L976: excludes disabled incomplete projects globally but reports their prerequisites in a scoped observation
- L987: pauses new queue starts through the durable settings receipt while preserving incomplete candidates
- L1002: projects live issues, excludes drafts and pull requests, and pages candidates without turning multiples into assignments
- L1046: returns a fresh exact catalog through the protected settings route without persisting it
- L1067: reports missing or failed execution context as unavailable without exposing runtime errors
- L1081: creates typed profiles from exact catalog choices, defaults omitted guidance, and returns live counts
- L1096: allows name and guidance patches while the catalog is unavailable, but blocks choice edits
- L1119: preserves a saved combination absent from a loaded catalog on a name patch
- L1131: rejects invalid catalog combinations and old replacement-list requests without writes
- L1142: serializes equivalent live names under concurrent creates and preserves accents and internal spaces
- L1161: blocks profile type changes and deletion while a current project default still references the profile
- L1212: derives the first incomplete step and host selection capabilities without GitHub or OMP reads
- L1244: persists suppression independently and rejects client supplied completion facts
- L1267: revalidates account and writable root, completes atomically, and recovers the original receipt without another validation
- L1322: keeps a failed completion uncommitted when account or folder validation fails
- L1339: rejects completion when the shared settings revision changes during external validation
- L1353: rolls back the completion marker and receipt when the event cannot be committed
- L1368: keeps completion historical and reports later account, folder, and profile pendencies

### tests/integration/account-binding.test.ts

- L83: binds only an active eligible account through PUT settings and recovers the exact receipt after restart
- L139: does not bind an inactive or invalid account and does not run other settings commands with account_binding
- L164: commits only the account, revision, operation receipt and event, then recovers after reopen in the destination scope
- L214: rejects bind/switch shape and origin violations without changing settings
- L236: serializes switch with a concurrent start and refuses a switch while any result is null
- L264: blocks a start under active/linked account divergence without changing the link or dispatch pause on revalidation
- L280: allows switching after completion despite uncertain cleanup and exposes only an informational warning fact
- L310: resumes the first setup from an unbound installation and keeps later maintenance separate from completion
- apps/controller/src/modules/storage/project-configuration-lock.test.ts:L18: rejects a save prepared before dispatch, including suspended attempts, without changing configuration
- apps/controller/src/modules/storage/project-configuration-lock.test.ts:L30: recovers an already saved command before the lock and keeps other projects editable
- apps/controller/src/modules/storage/project-configuration-lock.test.ts:L41: keeps cancellation locked until terminal stop is confirmed, then releases configuration
- apps/controller/src/modules/storage/project-configuration-lock.test.ts:L51: blocks pending publication after the attempt ends without treating historical receipts as active work

### tests/integration/preparations.test.ts

- L81: passes the closed origin inspection contract for a configured repository
- L89: captures typed choices, effective values, occurrence criteria, effects and origins without changing defaults
- L108: requires session, CSRF, closed DTOs and typed overrides
- L118: uses CAS and a durable receipt; every save invalidates the previous summary
- L133: recovers a lost create response and never adds another preparation or event
- L142: rejects a stale authorized summary after material %s changes
- L152: does not introduce criteria from comments or invalidate scope for unrelated editorial comments
- L158: rejects an invalid %s link without persisting it
- L165: reports partial readings, blockers and invalid criteria as prerequisites instead of granting readiness
- L175: never returns a delayed observation as the saved current revision
- L185: rechecks configuration under the write transaction after remote IO
- L194: rolls back the preparation, history and operation when the durable event fails
- L202: uses immutable preparation history and a project-scoped revision FK
- L209: paginates issue choices with bounded cursors and excludes PRs from executability

### tests/issue-options-notice.test.ts

- L18: groups inaccessible references and presents revalidation as information
- L30: preserves distinct prerequisites and deduplicates repeated codes
- L39: identifies partial results without claiming the consultation is complete
- L45: does not show an issue consultation warning after a successful response

### tests/integration/recovery.test.ts

- L41: revokes before stop, accepts an obsolete If-Match, deduplicates retries and distinguishes uncertain cleanup
- L58: rolls back cancellation completely when %s fails
- L66: records a late workspace without launching a terminal after cancellation during clone
- L77: starts a fresh retry outside Ready with current criteria/base, separate clone and no old authority
- L96: does not waive %s eligibility for explicit retry
- L107: migrates v9 without replacing captures/results; restart revokes active coordination and marks native intentions unknown
- L117: refuses busy cancellation before any effect and preserves its receipt after reopening
- L130: requires confirmation/ETag and unchanged plan, commits before removal, preserves history and never repeats deletion
- L146: prevents deletion when %s
- L155: preserves uncertain/partial deletion and makes response-loss replay consultable without another removal
- L166: opens only the registered folder; revalidates availability and deduplicates accepted requests
- L176: opens the same current native passage or reports unsupported context without recruiting
- L184: does not remove if acceptance fails in %s
- L190: rechecks native capability after durable acceptance and records uncertainty without calling the native hook
- L197: marks accepted native/removal intentions unknown on restart without deleting or opening again
- L211: protects recovery endpoints, validates closed bodies, returns durable cancellation and enforces account scope

### tests/integration/operation-diagnostics.test.ts

- L45: returns real empty-installation facts and no GET effects
- L60: commits intent before observation and deduplicates accepted or completed commands without new IO
- L80: supports scope discriminators and rejects unsupported checks and foreign IDs before IO
- L91: protects diagnostic commands and exposes a durable Location/receipt without changing settings
- L114: rejects changed context and never records credentials or raw exceptions
- L129: rolls back failed intent at %s before observation
- L135: persists restart interruption, recovers the original receipt and never replays checks
- L146: binds project and attempt events and diagnostics to the current account
- L167: filters technical events before pagination and binds the cursor to that choice
- L179: keeps a stable event-page ceiling when new events arrive and binds cursors to filters
- L198: replays events created after a snapshot and gives Last-Event-ID precedence without duplicates
- L219: keeps failed completion atomic, records a sanitized failure and does not repeat verification
- L229: refuses SQL busy or concurrent checks before another observation
- L241: keeps creation context separate, rejects unsupported execution checks and omits its full plan
- L259: projects only recorded eligible candidates in observed order and preserves current results
- L275: migrates actual v17 without reseeding or inventing observations
- L286: refuses camelCase query and command aliases without any accepted operation or partial write
- L305: projects stored diagnostic reports without rewriting their private JSON or receipts, including reopen

### tests/integration/verification.test.ts

- L49: runs captured definitions automatically only after result and capture commit, with a new checkout for every check
- L66: keeps historical runs on the same tree with bounded pagination and captured commands despite later project changes
- L97: does not turn absence of checks into passed
- L102: keeps a technical failure when artifact IO fails even after process exit zero
- L108: preserves timeout diagnosis and stops subsequent checks even when evidence IO also fails
- L118: does not confirm exit zero as passed after cancellation and does not launch the next check
- L126: rolls back success with %s failure and preserves the orphan for diagnosis
- L137: does not launch checks before a durable claim, under contention or on a concurrent request
- L145: revokes success when attempt continuity is lost while a check is running
- L154: preserves completed checks/artifacts and interrupts unfinished intent across restart
- L166: migrates a real version-six database preserving captured refs and official result without fabricating check success
- L180: serves protected inert evidence and diagnoses missing/corrupt bytes without accepting arbitrary paths

### tests/integration/reviews.test.ts

- L59: dispatches review after durable capture/checks, with exact profile/tree and no implementer conversation
- L78: never sends invalid review integrity back to the implementer even with corrections available
- L87: exhausts correctionLimit=%i only after reviewing the last allowed version
- L102: approves a corrected new version only after independently resolving exact previous finding ids
- L119: refuses an unproven review and rejects empty/cross-criterion/duplicate findings without occupying a receipt
- L136: rolls back result/receipt/review state when %s persistence fails
- L148: preserves historical results/findings/resolutions and rejects inserts into sealed reviews
- L157: preserves a rejection when implementer continuation is lost, without recruiting a substitute
- L165: keeps rejected review and durable receipt across reopen without replaying review or correction
- L176: migrates real SQLite v7 without reseeding, changing captured refs or fabricating reviews
- L189: exposes scoped lightweight round history and on-demand review/producer details over protected HTTP
- L212: does not allocate review intent after a technical check error or an unfinished check
- L222: preserves cancellation while a review workspace materialization returns late
- L230: rolls back review intent under SQLite busy before any reviewer materialization
- L240: does not revoke a correction when the completed previous reviewer disconnects
- L249: requires Implementer responses for the exact prior finding IDs without letting them resolve the findings
- L260: permits an explicit nonblocking pending finding while independently resolving every blocker

### tests/integration/publication.test.ts

- L24: requires explicit current authorization and reconciled resources after restart without restoring an agent session
- L48: completes ICR from the approved version with durable comment/status intentions and no delivery commit or push
- L68: orders projected transitions by their durable insertion even when all timestamps are equal
- L74: reserves global receipt sequences even when another account has more recent events
- L85: blocks completion before approval and rejects an unauthorized delivery mode or missing/stale CAS
- L95: preserves publication authority after grouped display for %s
- L129: preserves approved content and prevents a comment if %s integrity is unavailable
- L136: allows correction and a new review to project their stages without adopting an earlier version approval
- L145: does not replay an unknown Status when readback is partial, and does not send the following comment
- L160: preserves approval on an unknown comment, reconciles its exact marker/hash/author and never sends it twice
- L188: refuses ICR completion when the owned implementation environment has been removed
- L203: keeps an absent, partial, forged or duplicate marker unknown without blind retry
- L219: rechecks current authority when the attempt changes during a remote read
- L232: honors revoked authority on the fresh read without sending another effect
- L247: bounds repeated stale observations without sending an effect
- L262: pauses on account change and preserves a different suspension when authority is revalidated
- L275: pauses new dispatches for a changed account and clears the pause only after observing the configured account
- L287: continues the pending verification after resolving authority without another implementation or clone
- L297: preserves a materialized review while authority is corrected before its first launch
- L308: preserves an earlier projection failure in history and supersedes it only after a later stage is confirmed
- L320: revokes publication and requests cancellation when the exclusive assignee changes
- L329: suspends an incompatible external Status, never forces the board, and removes only resolved authority suspension
- L339: prevents the remote mutation when %s intention persistence fails
- L348: blocks the next effect after a confirmation write fails and reconciles the already sent comment
- L359: confirms no new acceptance or remote mutation when SQLite is busy
- L369: rolls back publication acceptance if %s fails before scheduling
- L379: records a late sent comment after cancellation without advancing to Delivered
- L391: preserves local delivery and approval when Delivered projection fails, and retries only the known pending effect
- L402: keeps historical metadata and effects after reopen without GET mutations or automatic publication
- L415: migrates v10 without changing approved content, receipts or identity, and without inventing effects
- L433: exposes protected summary/detail/section/publication routes with CAS and idempotent receipts
- L452: returns the durable 202 receipt for a replay whose remote outcome is unknown and exposes a sanitized operation error

### tests/integration/scaffold.test.ts

- L84: requires a configured Git identity before creating any files
- L91: renders a Portuguese README consistent with %s
- L100: returns versioned options and a deterministic plan with no destination or Git effects
- L110: persists intent before files/Git, finishes with baseline and a configurable project on the same branch
- L137: rejects unsafe destination %s before writing
- L140: refuses existing destination, changed account/configuration, changed branch and stale template without effects
- L152: refuses canonical redirection and missing parent before writes
- L158: rejects a junction or symlink redirected project root after authorization and before writes
- L170: rejects generated file collision %s before accepting intent or creating the destination
- L178: invalidates authorization when a distributed %s changes before creation
- L188: preserves partial files and uncertain baseline, with no blind replay or registration
- L196: refuses an unavailable path guard before any filesystem or Git effects
- L204: revalidates the authorized destination while holding the guard and releases it on refusal
- L212: preserves the created directory and stops writes when the path guard is lost
- L222: rolls back acceptance when its event cannot be persisted, before filesystem work
- L228: preserves baseline when registration fails and rolls back the entire project aggregate
- L235: marks unfinished intentions interrupted on restart and recovers receipts without launching
- L240: deduplicates concurrent identical commands and conflicts with changed content
- L247: rejects invalid branch %s before any write
- L250: commits metadata only after each durable step and preserves files when the next step cannot be recorded
- L259: upgrades real SQLite v12 preserving settings and receipts without manufacturing projects or creations
- L271: serves authenticated options/plans/creation resources with durable operation lookup
- L289: updates an existing Markdown section %j while preserving code examples and surrounding instructions
- L302: rejects duplicate recognized instruction sections instead of creating ambiguous pointers
- L308: places mandatory ignores after template exceptions, keeps examples versionable and remains stable on a second render
- L319: preserves surrounding AGENTS and CLAUDE instructions without duplicate sections; triage is conditional
- L329: refuses missing mandatory resources, unsafe template files and duplicate Agent skills blocks
- L342: preserves historical private plans and receipts while replaying the normalized HTTP command after reopen

### tests/integration/remote-scaffold.test.ts

- L89: preserves all %s effects when description confirmation is lost and finishes by reconciliation
- L99: accepts creation when the event sequence exceeds retained events
- L109: offers remote modes for the configured account and plans without sending effects
- L122: completes only the effects authorized by %s and registers the same branch
- L135: refuses an existing remote and changed account before destination effects
- L141: preserves a confirmed repository when %s changes before origin
- L146: reconciles %s response loss without resending any effect
- L158: keeps an unobserved remote unknown and requires CAS before reconciliation
- L181: a SQL failure in %s blocks the following effect
- L188: requires exact scope, confirmed repository and remote_push in the journal
- L194: serves protected creation reconciliation with creation scope and original Location
- L205: migrates actual v16 preserving completed local creation, baseline, identity and original receipt

### tests/diagnostic-receipt-rendering.test.ts

- L26: shows completion while keeping receipt and operation diagnostics private

### apps/web/src/features/operations/observation-baseline.test.ts

- L147: records %s idle for 120 simulated seconds and manual refresh
- L170: measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle
- L183: attributes spaced events, resync and coincident triggers on %s
- L204: measures rendered partial, error, retained content and confirmed empty as different outcomes
- L220: discards A after invalidation and B completion, late A failure=%s
- L233: records coincident timer, event and resync without assuming recurring operation timers
- L249: discards stale operation and active-attempt results and errors after their replacements render
- L262: renders attempt continuation and visible failure while retaining the current page
- L275: invalidates immediately before completion on %s and preserves selection by IDs
- L285: continues queue pagination and restarts on conflict without accepting an old continuation
- L299: preserves attempt page and ID actions, then discards pending work on project change and unmount

### apps/web/src/api/http.test.ts

- L7: reads snake_case errors and preserves correlation, field errors, facts and recovery
- L21: keeps the CSRF token in memory and never replays a mutation after a 401
- L36: preserves the original %s mutation error when session renewal fails

### tests/config.test.ts

- L6: resolves portable defaults against the installation root
- L11: ignores the retired data directory override %s

### tests/integration/http-security.test.ts

- L57: serializes common objects together while preserving private JSON bytes and event fields
- L90: rejects aliases in closed common objects and aggregate partials without writes
- L105: rejects Origin %s
- L114: rejects Fetch-Site %s
- L118: requires exact Host, web header, JSON and empty object, without issuing cookie for invalid requests
- L133: generates independent 32-byte secrets, session-only host-only cookie and reuses the same session
- L151: GETs never bootstrap; operational reads and SSE require session; preflight remains closed
- L164: rejects absent/wrong/cross-session CSRF, Origin, JSON and missing session for mutations
- L179: revokes previous-instance cookies and CSRF at restart
- L193: bounds bootstrap rate and documents finite server limits
- L204: bounds session memory without evicting valid sessions, and limits total requests
- L225: returns 413 and sanitized errors; secrets never enter logs, receipts or events
- L243: ends a handler wait with a sanitized 503 envelope
- L255: recovers a lost response with the client UUID, replays before new CAS checks and scopes queries
- L291: never ACKs or continues after event write failure; restores resource and operation index
- L309: rejects a receipt response for an operation without a durable domain record
- L318: returns ETags, rejects malformed operation IDs, and keeps GET read-only
- L334: pages durable events with stable order, no duplicated replay events, scoped queries and resync

### tests/configuration-save-web.test.ts

- L10: measures the complete serialized UTF-8 body including Unicode and escapes
- L19: isolates drafts by account, resource, wizard step and profile
- L31: never persists extra properties from a structurally compatible metadata object
- L43: invalidates old work even when effect cleanup is followed by activation
- apps/controller/src/modules/storage/local-installation.test.ts:L26: removes retired columns without equivalent storage and seeds the real local identity
- apps/controller/src/modules/storage/local-installation.test.ts:L39: upgrades disposable v19 in place preserving identity, setup facts, historical ledger and receipts
- apps/controller/src/modules/storage/local-installation.test.ts:L64: rejects incompatible historical settings without changing the existing file
- apps/controller/src/modules/storage/local-installation.test.ts:L73: rolls back the complete removal delta when a historical dependency prevents the second drop

## Resultado local desta execução

Os seis arquivos do relatório [validacao-sprint001.json](validacao-sprint001.json) passaram: 69 testes, zero falhas. Isso comprova apenas a baseline AS-IS dos casos executados, sem implementar ou comprovar a reorganização futura, E1–E4, nova distribuição visual ou contadores por navegação. Os demais títulos permanecem localizados, não executados. Não houve teste novo nem alteração de teste existente.
