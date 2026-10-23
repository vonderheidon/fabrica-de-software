# Stories e requisitos: Pacote V3

Data: 23/10/2026. Projeto existente: Nova fábrica de software.

## 1. Base, escopo e limites

Fonte canônica de produto desta execução: `docs/Docs20261023_014848/discovery20261023_014848.md`, incluindo suas decisões complementares. O discovery incorpora integralmente `FEEDBACK-PROXIMO-PACOTE-V3.md`; quando o feedback ainda registra uma dúvida já resolvida no discovery, prevalece a decisão do discovery. Foram consultados `CLAUDE.md`, `GLOSSARY.md`, `INTEGRACAO-MAESTRI-OMP.md`, contratos, código e configuração de validação atuais.

`SPEC.md` não existe na raiz no momento da análise. Não foi escolhida especificação histórica substituta e não são atribuídos números AC não verificáveis. O contrato de integração ainda descreve sessão por papel/passagem; o V3 requer continuidade por papel/tentativa e sessões novas entre tentativas. Essa evolução precisa ser refletida nos contratos antes da implementação. Este documento descreve o resultado aprovado no discovery, sem declarar resolvida a divergência documental por alteração do contrato antigo.

O escopo compreende todos os eixos do V3, inclusive prioridades médias e ajustes menores. Não inclui novas tecnologias, merge automático, force-push, restauração automática de conversas, estimativas de entrega, limites WIP ou novas responsabilidades de execução. A geração deste documento não aprova fechamento do discovery, PRD, Design Lock, implementação ou efeitos externos. A confirmação final do discovery permanece pendente conforme sua fonte.

Os caminhos de código abaixo são relativos à raiz do repositório. Referências a módulos existentes indicam pontos de integração, não afirmam que os novos comportamentos já estejam implementados.

## 2. Arquitetura relevante observada

| Domínio | Fontes existentes e comportamento observado | Evolução necessária |
| --- | --- | --- |
| Inicialização | `scripts/start-host.mjs`, `apps/controller/src/config.ts`, `apps/web/src/features/onboarding/InitialSetupDialog.tsx`. O inicializador exige quatro caminhos absolutos para executáveis. | Permitir abrir o wizard, detectar ferramentas, corrigir e revalidar sem esses quatro argumentos obrigatórios. |
| Cadastro e criação | `apps/controller/src/modules/projects/scaffold.ts`, `scaffold-resources.ts`, `preparations.ts`, `queue.ts`; `apps/controller/src/modules/github/scaffold.ts`; `packages/contracts/src/scaffold.ts`, `projects.ts`; `ProjectCreationDialog.tsx`, `ProjectForm.tsx`, `ProjectReadiness.tsx` em `apps/web/src/features/projects/`. O contrato aceita `local`, `remote_no_push` e `remote_push`; Status possui quatro destinos. | Criação exclusivamente completa no GitHub, quadro obrigatório com cinco colunas; cadastro incompleto de existente separado de prontidão operacional. |
| Entrega | `apps/controller/src/modules/publication/index.ts`, `apps/controller/src/modules/workspaces/publication.ts`, `remote-publication.ts`, `apps/controller/src/modules/storage/publication-modes.ts`, `publication.ts`; `packages/contracts/src/publication.ts`; `apps/web/src/features/attempts/PublicationDialog.tsx`, `useDelivery.ts`. Já existem `authorizeUpgrade`, referências fixas e reconciliação. A branch atual usa `factory/<issue>/<tentativa>`; o commit local é construído no Git interno. | Reaproveitar o controle de efeitos e evolução do modo, acrescentando integração no repositório cadastrado e nomes descritivos. |
| Perfis e execução | `apps/web/src/features/projects/ProfileForm.tsx`; `packages/contracts/src/projects.ts` já contém `guidance`; `apps/controller/src/modules/execution/roles.ts` carrega instruções fixas de `resources/roles/*.v1.json`; `adapters/maestri-omp/adapter.ts` cria terminal por passagem e restringe continuação ao Implementador. | Tornar instruções comportamentais efetivas editáveis, continuar também o Revisor e reutilizar terminais próprios com sessões novas entre tentativas. |
| Revisão | `apps/controller/src/modules/pipeline/start.ts`, `modules/verification/runner.ts`, `modules/storage/reviews.ts`; `packages/contracts/src/reviews.ts`, `execution.ts`; `modules/workspaces/review.ts`. Há achados, resoluções, checks e histórico por versão; o pipeline inicia uma passagem de revisão. | Pacote de correção completo, revisão incremental com cobertura final consolidada, contestações e bloqueio após recorrência sem progresso. |
| Arquivos e exclusão | `apps/controller/src/modules/workspaces/prepare.ts`, `capture.ts`, `materialize.ts`, `retention.ts`, `deletion.ts`; `modules/execution/adapters/maestri-omp/bootstrap.ts`; `modules/verification/artifacts.ts`; `modules/storage/project-deletion-*.ts`, `project-deletions.ts`; `apps/web/src/features/projects/ProjectDeletionDialog.tsx`. | Organização por projeto, transição de referências e apresentação compacta sem enfraquecer autorização, inventário e recuperação. |
| Operação e consultas | `apps/controller/src/main.ts`, `modules/queries/index.ts`, `modules/storage/queries.ts`, `historical-configuration.ts`, `events.ts`, `measurements.ts`; `packages/contracts/src/queries.ts`; `apps/web/src/features/attempts/AttemptListPanel.tsx`, `AttemptDetailDialog.tsx`, `features/operations/DashboardPanel.tsx`, `app/controller-events.ts`, `app/EventConnectionStatus.tsx`. A lista de tentativas aceita projeto, resultado e paginação; `features/records/useRecords.ts` consulta eventos, não é a busca de tentativas. | Busca global paginada por issue/período, comparação histórica, tempos, notificações e encerramento guiado. |

Padrões a preservar: TypeScript strict/ESM; Node.js 24; Fastify 5; React 18/Vite; TypeBox para contratos e validação em runtime; SQLite com migrations numeradas; nomes de código em inglês e componentes PascalCase; imports relativos com `.js`; interfaces públicas em `index.ts`. SQL pertence a storage, Git a workspaces, GitHub a github e Maestri/OMP a execution. Comandos usam identidade de operação, recibos, idempotência e revisão/ETag. A sessão HTTP local não concede autoridade GitHub.

Validação existente: Vitest, testes próximos dos módulos, `tests/acceptance`, testes HTTP, provas compiladas e scripts específicos de distribuição e exclusão em `package.json`. Os comandos existentes incluem `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:http`, `npm.cmd run test:acceptance`, `npm.cmd run test:distribution` e `npm.cmd run test:browser:deletion`. Estes são meios disponíveis, não evidência de execução nesta fase.

## 3. User stories e critérios de aceite

### 3.1 Configuração e projetos

#### US-01: Inicialização e correção das ferramentas

Como operador, quero iniciar a fábrica e configurar as ferramentas detectadas, para preparar a instalação mesmo quando uma dependência estiver indisponível.

Integração: inicializador, configuração do controlador e `InitialSetupDialog.tsx`.

Critérios de aceite:

1. Em uma extração limpa, o inicializador abre o wizard sem exigir quatro caminhos absolutos na linha de comando.
2. Git, Maestri, OMP, PowerShell e GitHub CLI são procurados e validados; opções válidas aparecem em resumo compacto. Falta ou ambiguidade não resolvida permite seleção manual.
3. Ausência de executável ou conexão permite corrigir configuração e identifica causa e próxima ação na etapa responsável, mantendo bloqueadas as operações dependentes.
4. Reiniciar reaproveita caminhos validados, revalida disponibilidade e permite corrigir os inválidos. Encontrar Maestri não marca sua conexão como confirmada.

#### US-02: Criação com GitHub e Kanban completos

Como operador, quero criar um projeto com código publicado e quadro vinculado, para começar a usar a fila sem preparar esses recursos manualmente.

Integração: `projects/scaffold.ts`, `github/scaffold.ts`, `scaffold.ts` dos contratos e `ProjectCreationDialog.tsx`.

Critérios de aceite:

1. O fluxo não oferece criação somente local, remoto sem push ou desativação do quadro; o nome do quadro inicia com o nome do projeto e pode ser editado.
2. Conclusão exige remoto configurado, push inicial confirmado e GitHub Projects configurado/vinculado com visualização Kanban.
3. O quadro tem exatamente cinco colunas visíveis nesta ordem: Backlog, Ready, In progress, In review, Done.
4. Falha após criação do repositório ou do quadro mantém o estado parcial e oferece retomada, sem duplicar recursos confirmados nem declarar conclusão antecipada.

#### US-03: Cadastro incompleto com prontidão explícita

Como operador, quero cadastrar um projeto existente ainda incompleto, para concluir sua preparação sem liberar execução antes da hora.

Integração: `projects/index.ts`, `projects/preparations.ts`, `projects/queue.ts`, `pipeline/start.ts`, `ProjectForm.tsx` e `ProjectReadiness.tsx`.

Critérios de aceite:

1. Uma pasta local sem remoto GitHub, código publicado ou quadro vinculado pode ser cadastrada em Adicionar existente.
2. Enquanto faltar qualquer um desses três requisitos, automação e início manual são recusados também no backend; a interface apresenta o que falta e a ação correspondente.
3. Ready representa elegibilidade para fila. Mover um item para Ready não habilita automação nem ignora bloqueios.
4. Com os requisitos atendidos e automação habilitada, a fila pode selecionar itens Ready conforme as regras existentes, sem exigir início manual por issue.

### 3.2 Entrega e rastreabilidade Git

#### US-04: Destino da versão aprovada por modo

Como operador, quero escolher o destino da entrega, para obter resultado separado, commit local ou PR conforme minha necessidade.

Integração: publication, workspaces, contratos de publicação e seleção em `features/preparations/PreparationDialog.tsx`.

Critérios de aceite:

1. Os nomes apresentados são ICR, ICR + commit e ICR + commit + PR, acompanhados por descrição curta do efeito.
2. ICR preserva código original e mantém resultado aprovado separado e inspecionável, sem commit de entrega.
3. ICR + commit integra via Git em branch própria da tarefa no repositório local cadastrado e cria commit local da versão aprovada.
4. ICR + commit + PR também publica a branch e abre PR para a branch de destino, sem merge automático.
5. A integração não inclui alterações do operador, não sobrescreve o checkout nem troca sua branch de forma prejudicial; a apresentação distingue existência de branch/commit da atualização dos arquivos do checkout aberto.

#### US-05: Destino local para cadastro por URL

Como operador de projeto cadastrado por URL, quero definir um repositório local quando escolher commit, para integrar a entrega em um destino conferido.

Integração: cadastro, preparação, seleção nativa existente e workspaces.

Critérios de aceite:

1. Escolher modo com commit sem pasta local solicita selecionar clone existente ou criar clone no destino escolhido.
2. A correspondência com o repositório cadastrado é conferida antes de integrar; destino incompatível bloqueia o efeito e informa a correção necessária.
3. A mesma regra vale ao continuar uma entrega ICR que passe a exigir commit local.
4. Trabalho local preexistente permanece preservado na escolha e na integração.

#### US-06: Continuação da entrega na mesma tentativa

Como operador, quero continuar uma entrega aprovada, para realizar os efeitos restantes sem refazer trabalho já válido.

Integração: `publication/index.ts`, `storage/publication-modes.ts`, `PublicationDialog.tsx` e `useDelivery.ts`.

Critérios de aceite:

1. ICR concluído oferece integrar e criar commit ou integrar, criar commit e abrir PR; commit local concluído oferece publicar e abrir PR; PR aberto oferece Ver PR.
2. A seção Continuar entrega é compacta. O clique autoriza os efeitos descritos pela ação, sem outra confirmação redundante.
3. A continuação preserva tentativa, modo original, resultado ICR, referência imutável e histórico de efeitos, executando somente o que falta.
4. Repositório, destino e trabalho local são reconferidos. Integração direta reaproveita aprovação; adaptações ou conflitos resolvidos produzem nova versão com checks e revisão antes da entrega.
5. Falha e retomada reaproveitam recibos confirmados e reconciliam efeitos incertos antes de repeti-los, sem duplicar commit, push ou PR. A versão aprovada permanece disponível quando a integração é impedida.

#### US-07: Identificação descritiva de branches e commits

Como operador, quero reconhecer a tarefa nos nomes Git, para localizar e auditar a entrega sem depender de identificadores opacos.

Integração: identidade de efeitos em publication, criação Git em `workspaces/publication.ts` e publicação remota.

Critérios de aceite:

1. Novas branches seguem `<tipo>/<numero-da-issue>-<descricao-em-kebab-case>`; commits seguem `<tipo>: <descricao> (#<numero-da-issue>)`, com mesmo tipo e descrição da tarefa.
2. Tipo corresponde à alteração entregue, incluindo casos de funcionalidade e correção; descrição é curta, específica e em português. A branch é normalizada em minúsculas, sem acentos e com referência Git válida.
3. Colisão entre tentativas preserva a branch anterior e acrescenta sufixo curto e estável à nova. Retomada usa a branch registrada mesmo após mudança no título da issue.
4. O padrão vale também na continuação da entrega; branches antigas não são renomeadas e commits existentes não são reescritos.

### 3.3 Perfis, sessões e terminais

#### US-08: Instruções efetivas editáveis

Como operador, quero editar as instruções de cada perfil, para ajustar o comportamento usado nas novas tentativas sem alterar código.

Integração: `ProfileForm.tsx`, `projects.ts` dos contratos, revisões de configuração, captura da tentativa e `execution/roles.ts`.

Critérios de aceite:

1. O editor de Implementador e Revisor permite consultar e salvar instruções comportamentais efetivamente usadas junto às escolhas de executor, modelo e esforço.
2. A transição preserva as orientações existentes e usa as instruções atuais como conteúdo inicial, sem perda, duplicação ou texto comportamental fixo oculto que anule a edição.
3. Uma tentativa captura a versão efetiva; alteração posterior afeta novas tentativas, preservando execução, correções e histórico da tentativa iniciada. Orientação contextual autorizada após bloqueio é registrada separadamente e pode continuar na tentativa atual, sem modificar o perfil capturado. Trocar perfil prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico anterior.
4. É possível consultar a composição com contexto da tarefa sem expor credenciais. O editor informa que instruções não alteram permissões nem schemas técnicos.

#### US-09: Continuidade durante correções

Como operador, quero que cada papel mantenha sua sessão durante a tentativa, para corrigir e revisar usando o contexto já construído.

Integração: pipeline, execution, adapter Maestri/OMP e `workspaces/review.ts`.

Critérios de aceite:

1. Correções usam a mesma sessão e ambiente do Implementador; revisões seguintes retomam a sessão separada do Revisor, sem permitir que ele altere o produto. Orientação contextual registrada preserva essa continuidade e o perfil capturado; troca de perfil prepara outra tentativa com nova captura e sessão, sem retomar a conversa ou transferir autoridade da anterior.
2. Antes de revisar outra versão, o ambiente separado do Revisor é atualizado e conferido contra a referência fixa correspondente, somente após deixar de estar em uso na revisão anterior.
3. A retomada recebe versão atual, diff para a versão anterior, respostas, achados pendentes e checks atualizados; resultados permanecem ligados a passagem, rodada e versão.
4. Perda de sessão ou acompanhamento interrompe coordenação automática e preserva trabalho, sem apresentar conversa ou autoridade como restauradas após reinício.

#### US-10: Reutilização segura de terminais

Como operador, quero reutilizar os terminais próprios da fábrica entre tentativas, para evitar acúmulo sem misturar conversas ou autoridade.

Integração: `execution/adapters/maestri-omp/adapter.ts`, `native.ts`, persistência de execução e bloqueios de configuração.

Critérios de aceite:

1. Cada papel procura e confere seu terminal próprio; cria se ausente e reutiliza se disponível, sem adotar terminal manual.
2. Outra tentativa recebe sessão OMP nova e ambiente próprio; resultados e autoridade anteriores não são transferidos.
3. Após reinício, reencontrar a identidade do terminal exige nova conferência de disponibilidade; terminal ativo ou incerto não é ocupado ou reiniciado.
4. Terminal aberto e ocioso após entrega não bloqueia configuração por si só. Execução ativa, publicação pendente e efeitos incertos continuam bloqueantes; disponibilidade não substitui confirmação de parada para remover ambientes.

### 3.4 Correção, revisão e decisão

#### US-11: Pacote verificável de correção

Como Implementador, quero receber achados e evidências completos, para corrigir o problema identificado sem reconstruir o diagnóstico.

Integração: `pipeline/start.ts`, `storage/reviews.ts`, `verification/runner.ts`, contratos de revisão e execução.

Critérios de aceite:

1. Cada achado contém identidade estável, problema, evidência, resultado esperado, prioridade e vínculos a critérios e versão revisada.
2. O pacote inclui resultados e logs pertinentes de checks, distinguindo falha técnica de execução de defeito comprovado no produto.
3. A orientação concentra correções nos achados e consequências; mudanças adicionais exigem justificativa consultável pelo Revisor, sem incorporar requisitos novos silenciosamente.

#### US-12: Revisão focada com aprovação completa

Como Revisor, quero comparar alterações e reaproveitar evidências válidas, para verificar a versão atual sem repetir comandos sem motivo.

Integração: pipeline, verification, histórico de checks e reviews.

Critérios de aceite:

1. A revisão inicial cobre todos os critérios; as seguintes se concentram em diff, achados pendentes e possíveis regressões, ampliando conferência quando necessário.
2. Checks configurados são executados após cada correção; o Revisor recebe evidências dessa versão e valida critérios independentemente, incluindo prova visual quando exigida.
3. Repetição de comando com evidência válida da mesma versão registra motivo concreto, como reprodução, insuficiência ou condições diferentes relevantes.
4. Aprovação final cobre todos os critérios atuais e exige zero achados bloqueantes pendentes; aprovação afetada por alterações não é transportada automaticamente. Evidência de outra versão, compilação ou typecheck não substitui prova visual exigida.

#### US-13: Interrupção por falta de progresso

Como operador, quero receber casos que repetem o mesmo bloqueante sem progresso, para decidir a próxima ação antes de consumir mais rodadas.

Integração: planejamento de correção no pipeline, histórico de achados, limites capturados e mecanismo de decisão humana.

Critérios de aceite:

1. Duas rodadas consecutivas de correção sem progresso verificável no mesmo problema bloqueante interrompem repetição automática e apresentam evidências ao usuário.
2. Correção parcial comprovada conta como progresso; mera edição ou declaração não conta. Novo achado não apaga a recorrência anterior do mesmo problema.
3. O usuário recebe opções para ajustar orientação, trocar perfil ou encerrar; nenhuma opção é aplicada automaticamente. Orientação contextual autorizada é registrada e pode continuar na tentativa atual mantendo o perfil capturado e os limites existentes. Troca de perfil mantém interrompida a continuidade automática da tentativa anterior e prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico anterior.
4. O limite total configurado permanece válido e prevalece o primeiro bloqueio atingido entre recorrência, divergência encaminhada e limite total, sem ampliar limites automaticamente.

#### US-14: Contestação com decisão rastreável

Como Implementador, quero contestar um achado com evidências, para obter reavaliação e encaminhar desacordos ao operador.

Integração: resultados de execução, findings, resoluções e decisões humanas existentes.

Critérios de aceite:

1. A contestação registra justificativa e evidências para o achado, sem resolvê-lo automaticamente.
2. O Revisor explica por que mantém ou resolve o achado, preservando registros anteriores.
3. Se mantiver o achado após contestação fundamentada, o fluxo interrompe a repetição automática e apresenta ao usuário desacordo, evidências, justificativa e alternativas.

### 3.5 Arquivos e exclusão

#### US-15: Área gerenciada por projeto

Como operador, quero encontrar os arquivos exclusivos de cada projeto agrupados, para identificar e administrar seus ambientes sem misturá-los aos de outros projetos.

Integração: workspaces, bootstrap de execução, artefatos de verificação, storage, recuperação, retenção e publicação.

Critérios de aceite:

1. Bootstraps, Git interno, ambientes de implementação, checks, revisão, publicação e artefatos exclusivos ficam sob pasta gerenciada do projeto, identificável por nome e identidade estável.
2. Nomes iguais não colidem; renomear projeto não rompe referências. A separação por tentativa e passagem preserva rodada e versão.
3. Banco e recursos compartilhados permanecem globais; a pasta original do usuário mantém sua localização.
4. Antes da implementação, existe estratégia documentada para dados anteriores; transição não move ambientes em uso nem perde referências, entregas ou evidências. Recuperação, retenção, publicação e exclusão reconhecem a organização resultante.

#### US-16: Exclusão compacta e recuperável

Como operador, quero confirmar a exclusão pelos destinos principais e acompanhar impedimentos, para remover o projeto sem percorrer uma lista extensa de subpastas.

Integração: `ProjectDeletionDialog.tsx`, contratos de exclusão, inventário, worker e proteções de caminhos existentes.

Critérios de aceite:

1. A confirmação mostra a pasta gerenciada e informa remoção integral; se a pasta original também for removida, mostra seu caminho separadamente. Nenhum outro destino autorizado fica oculto.
2. A ação de confirmação não exige percorrer uma lista extensa de subpastas; bloqueios mostram causa e próxima ação sem repetição. O inventário detalhado permanece nos registros.
3. Autorização durável, bloqueios, proteção de caminhos compartilhados/substituídos, links sem seguir destinos e retomada parcial permanecem válidos.
4. Somente a conferência da remoção de todos os destinos e dados previstos permite sucesso; falha ou remoção parcial permanece explícita.
5. Medir o baseline por etapa, definir a meta de desempenho a partir dessa medição e aplicar otimização efetiva orientada ao custo observado. Validar comparativamente o resultado frente à meta, com muitas tentativas e caches volumosos e condições comparáveis, separando tempo total, resposta da UI e correção da remoção. Apenas medir não atende o V3; ganho só é declarado com prova e meta não atingida permanece pendente. Avaliar a remoção da pasta como unidade quando segura, sem impor essa técnica nem reduzir qualquer garantia de exclusão.

### 3.6 Acompanhamento e operação

#### US-17: Resumo consolidado da entrega

Como operador, quero consultar um resultado único da tentativa, para saber o que foi entregue, onde está e o que ainda falta.

Integração: projeções de publicação, `AttemptDetailDialog.tsx`, `PublicationDialog.tsx` e dashboard.

Critérios de aceite:

1. O resumo mostra resultado, localização do código, branch, commit e PR conforme efeitos confirmados, com acesso aos destinos disponíveis e indicação de pendências.
2. Inclui critérios atendidos, checks, achados resolvidos, limitações e referência imutável, distinguindo comprovado, não verificado e observações não bloqueantes.
3. Aprovação e conclusão dependem de versão, critérios e recibos, nunca apenas da declaração textual do executor. Entrega parcial não aparece como sucesso completo.
4. A continuação atualiza o mesmo resultado visível e preserva o histórico, sem avisos duplicados por etapa ou diagnósticos brutos na interface principal.

#### US-18: Tempo e atividade por etapa

Como operador, quero acompanhar etapa, duração e atividade confirmada, para distinguir trabalho demorado, espera por decisão e perda de acompanhamento.

Integração: projeções de consultas, eventos, medições, dashboard e detalhe da tentativa.

Critérios de aceite:

1. A interface mostra etapa atual, tempo decorrido, última atividade confirmada e prazo restante somente se houver prazo definido.
2. Espera por decisão e perda de acompanhamento aparecem distintas de execução demorada. Inatividade recente não prova parada física.
3. Não aparecem percentuais fictícios nem previsão de conclusão sem base observada.

#### US-19: Notificações locais de atenção

Como operador, quero receber notificações de pergunta, falha e conclusão, para acessar a tentativa que exige atenção.

Integração: eventos do controlador, perguntas e navegação para tentativa; a superfície local específica será detalhada sem acrescentar serviço externo.

Critérios de aceite:

1. Pergunta pendente, falha e conclusão oferecem notificação local com identificação mínima do trabalho e acesso direto à tentativa.
2. Atualizações e reconexões do mesmo evento não geram notificações duplicadas.
3. Disponibilidade e permissões da superfície são verificadas; indisponibilidade mantém a pendência acessível na interface.

#### US-20: Encerramento guiado

Como operador, quero orientar o encerramento da fábrica, para impedir novos inícios e decidir o destino dos trabalhos ativos.

Integração: ciclo de vida em `main.ts`, fila, pipeline, execução e interface operacional.

Critérios de aceite:

1. A ação pausa novos inícios e mostra trabalhos ativos e providências necessárias antes de fechar o controlador.
2. O pedido não cancela tentativas implicitamente; escolhas sobre trabalhos em andamento são explícitas.
3. Encerramento do controlador, cancelamento, parada física e limpeza são distinguidos; recursos ativos ou incertos e seus ambientes permanecem identificados e preservados.
4. Fechar a interface não é apresentado como prova de encerramento do controlador ou dos executores.

#### US-21: Busca completa de tentativas

Como operador, quero buscar tentativas por issue e período, para localizar execuções anteriores entre todas as páginas do histórico.

Integração: `AttemptListPanel.tsx`, `queries.ts` dos contratos, queries e storage; não limitar a implementação ao painel de eventos.

Critérios de aceite:

1. Busca por título ou número da issue e filtro por período combinam-se com projeto e resultado. O período usa a data de início da tentativa, com dias inicial e final inclusivos no fuso local explicitado na interface. Intervalo invertido é recusado com orientação para correção.
2. Uma tentativa correspondente fora da página visível é encontrada; paginação e resumos leves são preservados.
3. Navegar entre páginas mantém critérios; ausência de resultados e falha de consulta têm estados distintos.

#### US-22: Comparação de tentativas da mesma issue

Como operador, quero comparar tentativas da mesma issue, para consultar falhas, resultados e diferenças históricas sem misturar execuções.

Integração: queries, `storage/historical-configuration.ts`, capturas e detalhe de tentativas.

Critérios de aceite:

1. A comparação mostra motivo da falha anterior, resultado posterior e diferenças relevantes de configuração e versão de tentativas da mesma issue.
2. Valores vêm das capturas históricas de cada tentativa, preservando identidades de rodada e versão; edição da configuração atual não modifica a comparação.
3. Dado ausente ou não comparável aparece como indisponível. A interface não atribui causalidade ao resultado posterior nem transfere trabalho entre tentativas.

#### US-23: Indicador coerente de conexão

Como operador, quero que cor e texto indiquem a conexão observada, para reconhecer falha e recuperação sem ambiguidade.

Integração: `app/EventConnectionStatus.tsx`, `app/controller-events.ts` e `app/styles/event-connection-status.css`.

Critérios de aceite:

1. Falha de conexão ou atualização exibe ponto vermelho; verde fica reservado ao estado saudável confirmado.
2. O texto continua identificando o estado, sem depender apenas da cor.
3. A transição saudável, falha e recuperação é validada visualmente; tentativa de reconexão não é apresentada como recuperação confirmada. O CSS atual já declara estilo vermelho para indisponibilidade, portanto o problema visual relatado exige verificação do estado aplicado e da renderização completa.

## 4. Requisitos funcionais

Cada linha define uma obrigação verificável. A coluna de integração indica a fronteira existente responsável; não prescreve novo serviço ou tecnologia.

### 4.1 Configuração e projetos

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

### 4.2 Entrega

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-18 | Apresentar os três modos com nomes e descrições de efeitos definidos no V3. | US-04 | preparação e publicação |
| RF-19 | Manter resultado ICR aprovado separado, inspecionável e sem commit de entrega. | US-04 | capture, retenção e publication |
| RF-20 | Integrar a versão aprovada via Git em branch própria no repositório local cadastrado e criar o commit no modo correspondente. | US-04 | workspaces, substituindo suficiência do commit apenas interno |
| RF-21 | Preservar alterações locais do operador fora do commit da tarefa e impedir sobrescrita ou troca prejudicial de branch do checkout. | US-04, US-05, US-06 | inspeção e integração workspaces |
| RF-22 | Publicar branch e abrir PR para destino conferido no modo PR, sem merge automático ou force-push. | US-04 | remote-publication e github |
| RF-23 | Solicitar clone existente ou criação de clone em destino escolhido quando projeto por URL exigir commit local. | US-05 | cadastro, preparação, continuação e workspaces |
| RF-24 | Validar correspondência do clone com o repositório cadastrado antes de integrar. | US-05 | workspaces e identidade do projeto |
| RF-25 | Oferecer somente as ações de continuação correspondentes ao estado confirmado da entrega. | US-06 | summary de publication e UI |
| RF-26 | Autorizar pelo clique os efeitos restantes descritos, sem confirmação redundante. | US-06 | `authorizeUpgrade`, idempotência e revisão |
| RF-27 | Preservar modo original e registrar continuação e efeitos na mesma tentativa. | US-06 | publication-modes e histórico |
| RF-28 | Reconferir repositório local, destino e trabalho existente antes de continuar. | US-06 | workspaces e publication |
| RF-29 | Reaproveitar aprovação da integração direta; exigir checks e revisão de nova versão quando houver adaptação ou conflito resolvido. | US-04, US-06 | capture, verification e reviews |
| RF-30 | Reconciliar efeitos incertos e reutilizar recibos para evitar duplicação de commit, push e PR. | US-04, US-06 | effects e publication |
| RF-31 | Preservar referência Git imutável e conteúdo necessário à entrega posterior conforme retenção, sem snapshot auxiliar de checkout. | US-06 | capture e retention |
| RF-32 | Gerar branches e mensagens de commit com padrões, tipo e descrição em português definidos em US-07. | US-07 | identidade de publicação e Git |
| RF-33 | Normalizar descrição da branch para referência Git válida, minúscula, sem acentos e em kebab-case. | US-07 | workspaces |
| RF-34 | Resolver colisão entre tentativas com sufixo curto estável e reutilizar branch registrada nas retomadas. | US-07 | efeitos e referências Git |
| RF-35 | Preservar nomes de branches e histórico de commits existentes. | US-07 | publicação e compatibilidade |

### 4.3 Perfis e execução

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

### 4.4 Correção e revisão

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-50 | Entregar achado com identidade estável, problema, evidência, resultado esperado, prioridade, critérios e versão. | US-11 | reviews, execution e pipeline |
| RF-51 | Incluir resultados e logs pertinentes de checks no pacote de correção, separando falha técnica de defeito comprovado. | US-11 | verification e artefatos |
| RF-52 | Exigir justificativa de alterações adicionais às correções e disponibilizá-la ao Revisor. | US-11 | resultado do Implementador e contexto de revisão |
| RF-53 | Executar revisão inicial completa e revisões seguintes focadas em alterações, pendências e regressões com ampliação quando necessária. | US-12 | pipeline e perfil do Revisor |
| RF-54 | Executar checks obrigatórios configurados após cada correção e vinculá-los à nova versão. | US-12 | verification |
| RF-55 | Reutilizar evidências válidas da mesma versão e registrar motivo concreto para comandos repetidos. | US-12 | checks, contexto e evidências da revisão |
| RF-56 | Exigir validação independente de todos os critérios atuais e ausência de bloqueantes para aprovação final. | US-12 | storage/reviews e publicação |
| RF-57 | Registrar progresso verificável do mesmo problema entre rodadas, distinguindo parcial comprovado, mera edição e novo achado. | US-13 | histórico estável de findings |
| RF-58 | Interromper repetição automática após duas correções consecutivas sem progresso no mesmo bloqueante. | US-13 | planejamento de correção |
| RF-59 | Encaminhar evidências e opções de ajustar orientação, trocar perfil ou encerrar para decisão humana. Orientação contextual registrada pode continuar na tentativa atual mantendo perfil capturado e limites; troca de perfil mantém interrompida a continuidade automática anterior e prepara nova tentativa com nova captura e sessão, sem início automático e preservando o histórico. | US-13 | decisões e interface da tentativa |
| RF-60 | Preservar limite total configurado e aplicar o primeiro bloqueio atingido sem troca automática de perfil ou ampliação de limite. | US-13, US-14 | configuração capturada e pipeline |
| RF-61 | Registrar contestação fundamentada do Implementador com evidências sem resolver automaticamente o achado. | US-14 | respostas de findings |
| RF-62 | Registrar justificativa do Revisor para manter ou resolver contestação, preservando registros anteriores. | US-14 | reviews e resoluções |
| RF-63 | Encaminhar ao usuário achado mantido após contestação fundamentada, com desacordo, evidências e alternativas. | US-14 | bloqueio de correção e decisão |

### 4.5 Organização e exclusão

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-64 | Agrupar todos os arquivos gerenciados exclusivos sob pasta do projeto, identificada por nome e identidade estável. | US-15 | workspaces, bootstrap e artifacts |
| RF-65 | Preservar separação por tentativa/passagem e vínculos de rodada/versão após agrupamento ou renomeação. | US-15 | referências persistidas |
| RF-66 | Manter banco/recursos compartilhados globais e pasta original em sua localização. | US-15 | configuração de diretórios |
| RF-67 | Definir estratégia de transição antes da implementação e preservar ambientes em uso, entregas e evidências existentes. | US-15 | migrations, recovery e retention |
| RF-68 | Adaptar criação, leitura, execução, recuperação, retenção, publicação e exclusão à organização por projeto. | US-15 | interfaces públicas dos módulos |
| RF-69 | Mostrar confirmação compacta da pasta gerenciada e informar remoção integral, expondo separadamente original e outros destinos autorizados. | US-16 | preview de exclusão e dialog |
| RF-70 | Manter inventário detalhado nos registros e causa/próxima ação de bloqueios na confirmação. | US-16 | deletion inventory e UI |
| RF-71 | Preservar autorização durável e barreiras contra atividade, efeitos incertos, caminhos compartilhados/substituídos e links. | US-16 | acceptance, barrier e paths |
| RF-72 | Retomar exclusão parcial e declarar sucesso somente após conferir todos os destinos e dados previstos. | US-16 | worker e finalization |
| RF-73 | Medir baseline por etapa, definir meta após a medição, aplicar otimização efetiva orientada ao custo observado e validar comparativamente o resultado frente à meta em carga representativa. Apenas medir não atende o V3; preservar todas as garantias de exclusão e não declarar ganho sem prova. | US-16 | measurements e provas de exclusão |

### 4.6 Operação e histórico

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-74 | Consolidar resumo de entrega com resultado, localização, branch, commit, PR, pendências e acesso a destinos confirmados. | US-17 | projeções e detalhe |
| RF-75 | Integrar critérios, checks, achados resolvidos, limitações e referência fixa ao resultado sem duplicar avisos. | US-17 | reviews e publication |
| RF-76 | Exibir etapa, tempo decorrido, última atividade confirmada e prazo restante somente quando definido. | US-18 | queries, eventos e dashboard |
| RF-77 | Diferenciar execução demorada, espera por decisão e perda de acompanhamento sem inferir parada por inatividade. | US-18 | estados observados de execution |
| RF-78 | Notificar localmente pergunta pendente, falha e conclusão com acesso direto à tentativa. | US-19 | eventos e navegação existentes |
| RF-79 | Deduplicar notificações do mesmo evento durante atualização e reconexão. | US-19 | identidade de eventos |
| RF-80 | Verificar disponibilidade/permissão da notificação e manter pendência na UI quando indisponível. | US-19 | superfície local a detalhar |
| RF-81 | Pausar novos inícios na ação de encerramento guiado. | US-20 | fila e ciclo de vida |
| RF-82 | Apresentar trabalhos ativos e escolhas explícitas sem cancelamento implícito. | US-20 | pipeline e interface |
| RF-83 | Distinguir fechamento, cancelamento, parada física e limpeza, preservando ambientes ativos ou incertos. | US-20 | execution, recovery e workspaces |
| RF-84 | Aplicar busca por título/número e período no histórico completo combinada a projeto/resultado. Usar a data de início da tentativa, com dias inicial e final inclusivos no fuso local explicitado na interface; recusar intervalo invertido. | US-21 | AttemptListQuery, queries e storage |
| RF-85 | Preservar paginação, critérios de busca na navegação e estados distintos de vazio e falha. | US-21 | cliente de consultas e lista |
| RF-86 | Comparar tentativas da mesma issue usando falha anterior, resultado posterior e diferenças históricas de configuração/versão. | US-22 | historical-configuration e captures |
| RF-87 | Sinalizar dados ausentes ou não comparáveis sem inferir causalidade ou transportar trabalho. | US-22 | projeção de comparação |
| RF-88 | Mostrar vermelho na falha e verde somente na conexão saudável confirmada, mantendo texto de estado. | US-23 | EventConnectionStatus e CSS |

## 5. Requisitos não funcionais

Não são fixadas metas numéricas de latência ou ganho sem baseline, pois o discovery exige medição anterior. Os limites já configurados permanecem válidos; novas metas dependerão das medições registradas.

| ID | Categoria | Requisito e verificação mensurável | Vínculo |
| --- | --- | --- | --- |
| RNF-01 | Performance | Registrar baseline por etapa, tempo total e resposta da interface na exclusão; definir meta a partir da medição, aplicar otimização efetiva e validar antes/depois frente à meta em projetos com muitas tentativas e caches volumosos, com cenário e condições comparáveis. Comprovar separadamente correção da remoção e preservação de todas as garantias. Apenas medir não atende o V3; meta não atingida permanece pendente e nenhum ganho é declarado sem prova comparativa. | RF-73 |
| RNF-02 | Performance | Busca e paginação retornam resumos leves e carregam detalhes sob demanda. Verificar que listar ou pesquisar não lê checkouts/caches nem carrega artefatos completos por tentativa. | RF-84, RF-85 |
| RNF-03 | Performance | Medir comandos repetidos, duração e consumo quando disponível no ciclo de correções; toda repetição de check válido da mesma versão deve possuir motivo registrado. Nenhum check obrigatório pode ser eliminado pela otimização. | RF-54, RF-55 |
| RNF-04 | Segurança | Nenhum comando, prompt consultável, log, notificação ou arquivo gerado pode expor credenciais. Validar redação das superfícies alteradas e uso dos mecanismos existentes de acesso. | RF-02, RF-39, RF-78 |
| RNF-05 | Segurança | Preservar Host/Origin locais, cookie HttpOnly/SameSite strict e CSRF nas novas mutações HTTP. Requisição sem os controles pertinentes deve ser recusada; sessão local não autoriza GitHub. | RF-26, RF-36, RF-81 |
| RNF-06 | Segurança | Zero alterações preexistentes do operador incorporadas ou sobrescritas pela integração. Comparar conteúdo e estado Git local antes/depois em cenário com alterações rastreadas e arquivos não rastreados. | RF-20, RF-21, RF-24 |
| RNF-07 | Segurança | Nenhuma exclusão pode atingir caminho compartilhado, substituído ou destino de link não autorizado; testar links, troca de identidade e inventário alterado preservando confirmação/autorização vigente. | RF-69 a RF-72 |
| RNF-08 | Confiabilidade | Reapresentar a mesma operação e reiniciar após efeito confirmado ou resposta perdida não cria recursos ou efeitos duplicados. Validar criação remota, quadro, commit, push, PR e exclusão por recibos e reconciliação. | RF-13, RF-30, RF-72 |
| RNF-09 | Confiabilidade | Todo check, parecer e aprovação utilizado na entrega identifica a versão correspondente. Validar rejeição de evidência de outra versão e preservação de todos os registros anteriores após correção. | RF-29, RF-44, RF-54, RF-56 |
| RNF-10 | Confiabilidade | Reinício, perda de acompanhamento e indisponibilidade de notificação não podem apagar trabalho nem converter incerteza em parada ou sucesso. Exercitar interrupção em criação, revisão, integração e encerramento. | RF-13, RF-47, RF-77, RF-80, RF-83 |
| RNF-11 | Confiabilidade | Notificação do mesmo evento aparece no máximo uma vez durante atualização/reconexão; evento diferente continua elegível. Validar replay de eventos e permanência de pendências indisponíveis na UI. | RF-79, RF-80 |
| RNF-12 | Usabilidade | Impedimento visível contém causa e próxima ação; resumo tem um resultado consolidado. Detalhes técnicos permanecem nos registros. Conferir estados parcial, bloqueado, concluído e continuação sem mensagens duplicadas. | RF-06, RF-16, RF-70, RF-74, RF-75 |
| RNF-13 | Usabilidade | Confirmação de exclusão não exige rolar lista de subpastas para alcançar a ação; destinos principais e bloqueios continuam identificáveis. Validar UI com projeto contendo muitas tentativas. | RF-69, RF-70 |
| RNF-14 | Usabilidade | Identificação de conexão usa texto além de cor; verde só após confirmação saudável. Validar visualmente saudável, falha, reconexão e recuperação no componente renderizado na aplicação. | RF-88 |
| RNF-15 | Portabilidade | Inicialização distribuída resolve caminhos na máquina em uso sem diretórios pessoais fixos. Validar extração limpa, correção manual, reinício e caminhos com espaços/Unicode. | RF-01 a RF-05 |
| RNF-16 | Persistência | Conteúdo versionado permanece no Git; SQLite mantém configuração, critérios, resultados, evidências pertinentes e referências necessárias, sem copiar checkout, índice, ignorados ou caches. Verificar tamanho persistido com caches volumosos e retenção da versão necessária à continuação. | RF-31, RF-64 a RF-68 |
| RNF-17 | Manutenibilidade | Mudanças preservam TypeScript strict, contratos TypeBox, fronteiras e interfaces públicas existentes; novas persistências usam migrations numeradas. Verificar com typecheck, lint de fronteiras e testes pertinentes. | Todos os domínios |
| RNF-18 | Confiabilidade | Transição de diretórios conserva referências e evidências de projetos existentes e não move ambiente em uso. Validar leitura, retomada, publicação, retenção e exclusão após reinício e transição parcial. | RF-67, RF-68 |

## 6. Matriz de comprovação prevista

Esta seção define a prova necessária à futura implementação. Nenhum teste, integração, servidor ou efeito Git/GitHub foi executado para gerar este documento.

| Superfície | Cenários mínimos | Tipo de evidência |
| --- | --- | --- |
| Inicialização | Extração limpa; detecção; ausência/ambiguidade; correção manual; configuração reaproveitada/inválida; Maestri encontrado sem conexão. | Distribuição e UI, além de integração real separada. |
| Projetos | Criação obrigatória completa; nome do quadro; cinco colunas ordenadas; falha após cada efeito; retomada sem duplicação; cadastro incompleto com início manual/automático bloqueado. | Contratos e integração controlada; efeitos GitHub reais separados. |
| Entrega | Três modos; ICR para commit; ICR para PR; commit para PR; destino local por URL; alterações locais; destino alterado; conflitos/adaptações; efeito incerto e reinício. | Provas Git locais e GitHub reais pertinentes, separadas de testes controlados e UI. |
| Nomes Git | Tipos diferentes; português com acentos; caracteres inválidos; colisão entre tentativas; título alterado na retomada; referência antiga preservada. | Testes determinísticos e integração Git. |
| Perfis | Migração/composição sem perda; edição; captura histórica; correção após edição posterior; orientação contextual registrada sem mudar perfil capturado; troca de perfil prepara nova tentativa com nova captura e sessão, sem início automático e com histórico anterior preservado; uso efetivo das instruções. | Contratos/persistência e uso real no OMP. |
| Sessões e terminais | Duas sessões contínuas na tentativa; revisão de nova versão sem ambiente anterior em uso; outra tentativa com sessões novas; reencontro após reinício; terminal ativo/incerto/manual; liberação da configuração com terminal ocioso. | Testes controlados e ensaio real Maestri/OMP distintos. |
| Correção e revisão | Pacote completo; parcial comprovado; duas rodadas sem progresso; novo achado sem apagar recorrência; contestação mantida; precedência de bloqueios; orientação contextual autorizada na sessão atual com perfil e limites preservados; troca de perfil sem continuidade automática anterior ou início automático da nova tentativa; checks obrigatórios e justificativa de repetição. | Testes determinísticos/contratuais e ciclo real separado. |
| Organização e exclusão | Projeto novo/antigo; nomes iguais; renomeação; transição parcial; ambiente em uso; links e caminhos substituídos; original separado; retomada; caches volumosos; baseline, meta posterior e otimização aplicada; comparação frente à meta com provas separadas de tempo total, resposta da UI e correção, preservando garantias; meta não atingida permanece pendente. | Persistência, provas nativas pertinentes, UI e medições comparáveis por etapa. |
| Operação | Resumo parcial/final; tempos e atividade; notificação negada/duplicada; encerramento com trabalho ativo/incerto; busca fora da página atual; filtro pela data de início nos limites dos dias inicial/final inclusivos no fuso local exibido, inclusive tentativa concluída fora do período; intervalo invertido; comparação histórica com dados ausentes; conexão saudável/falha/recuperação. | Contratos, UI via Playwright MCP/Chrome e prova real de encerramento no Maestri. |

Critérios INT pertinentes do contrato consultado: INT-01/02 para contexto e conexão; INT-03/04/05 para sessão real e escolhas efetivas; INT-06/07 para resultados e perguntas; INT-08 para perda de acompanhamento; INT-11 para UI; INT-13/14 para transporte UTF-8 e execução Windows; INT-15/16 para cancelamento e recursos; INT-17 para outra tentativa; INT-18 para versão aprovada. A redação de sessão por passagem precisa ser compatibilizada com US-09/10, sem reduzir as demais garantias.

Provas controladas, validação visual, integração real Maestri/OMP e efeitos Git/GitHub são registros distintos. Build/typecheck não comprovam funcionamento de UI ou integração. A suíte padrão não deve chamar providers nem publicar recursos externos implicitamente; os efeitos reais dependem da autorização correspondente. A autorização de Shell #5/porta 4310 registrada no discovery vale quando a implementação for iniciada, não inicia execução nesta fase.

## 7. Detalhamento técnico posterior, sem novas decisões de produto

- Definir representação técnica de Backlog e a criação/configuração do quadro mantendo as cinco colunas e o mapeamento aprovados.
- Definir composição/migração de `guidance` e instruções dos recursos antes de implementar, preservando orientações existentes e separação entre comportamento editável e contrato técnico.
- Definir transição de diretórios e referências persistidas antes de implementar; os nomes internos do exemplo do feedback não são contrato de layout de disco.
- Escolher superfície técnica de notificações locais e validar disponibilidade/permissões sem introduzir serviço externo por pressuposição.
- Registrar baseline da exclusão, estabelecer metas mensuráveis após a medição e aplicar e validar otimização efetiva; não há percentual de ganho aprovado e apenas medir não atende o V3.
- Detalhar tecnicamente as escolhas humanas já definidas: orientação contextual autorizada é registrada e pode continuar na tentativa atual mantendo perfil capturado e limites; troca de perfil prepara nova tentativa com nova captura e sessão, sem início automático, preservando o histórico e a interrupção da continuidade automática anterior. Respeitar autorização e recuperação. Os limiares de falta de progresso e divergência já estão decididos no discovery e não devem ser reabertos.
- Compatibilizar documentos normativos com as evoluções aprovadas do V3 e manter explícita a ausência do `SPEC.md` principal, sem reconstrução arbitrária de contratos históricos.
