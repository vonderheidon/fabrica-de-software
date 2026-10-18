# Stories e requisitos: configuração inicial e operação da fábrica

## 1. Escopo, fontes e critérios de leitura

Este documento especifica a evolução da fábrica existente para que o operador local no Windows configure GitHub, pasta e perfis sem interpretar IDs ou digitar identificadores de modelos. Abrange F01 a F19 do [discovery](discovery20261017_233303.md), incluindo correções de apresentação, bootstrap, contratos, persistência, investigação HTTP/SSE e preparação do aceite da entrega.

Fontes conferidas nesta análise: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), [SPEC.md](../../SPEC.md), [INTEGRACAO-MAESTRI-OMP.md](../../INTEGRACAO-MAESTRI-OMP.md), [GLOSSARY.md](../../GLOSSARY.md), código e configuração atuais. O discovery registra os deltas aprovados em relação ao contrato anterior. Este documento explicita esses deltas, sem editar as fontes normativas ou declarar aprovação de fase ou de design.

Os identificadores US, RF e RNF são exclusivos deste documento. F01 a F19 apontam para o discovery; AC e INT apontam para as fontes normativas. Esses identificadores não são conteúdo da interface comum.

Persona principal: operador da fábrica local. Nas histórias de validação, a persona é o responsável pelo aceite da entrega. Implementador e Revisor, quando citados, são os papéis de execução do produto.

Não há autorização nesta atividade documental para executar providers, recrutar terminais, alterar credenciais, resetar a instalação, criar referências Git, publicar recursos, alterar trackers ou aprovar gates. Não foram executados testes nem ensaios de integração para produzir este documento. Os resultados históricos mencionados no discovery não foram medidos novamente.

## 2. Arquitetura existente e pontos de evolução

### 2.1 Mapa técnico verificado

As referências B01 a B12 abaixo agrupam arquivos existentes para tornar explícita a integração de cada requisito. Interfaces e telas novas são descritas como alterações a implementar, sem atribuir nomes de arquivos ou endpoints ainda inexistentes.

| Referência | Arquivos e comportamento atual | Evolução necessária no pacote |
| --- | --- | --- |
| B01: composição e instalação | `apps/controller/src/main.ts`, `apps/controller/src/config.ts`, `scripts/start-host.mjs`, `.env.example`, `docs/operation/README.md`. O loader aceita `FACTORY_DATA_DIR`; o launcher exige cinco EXEs, incluindo GH, antes de iniciar. | Armazenamento fixo e descoberta GH anterior ao vínculo. Preservar terminal-âncora e composição confiável das demais ferramentas. |
| B02: contratos de configuração | `packages/contracts/src/base.ts` e `projects.ts`. `FactorySettings` inclui `accountId`, `designatedHost`, `dataRoot`, `maestriSettings` e `costDefaults`; `GlobalChanges` não inclui vínculo de conta. `ExecutionProfile` exige provider/model/effort e não tem tipo de papel. | Formalizar onboarding, vínculo, perfis tipados e esforço não aplicável; retirar opções e tetos removidos. Contratos continuam sem IO. |
| B03: configuração persistida | `apps/controller/src/modules/storage/settings.ts`, `configuration-reads.ts`, `configuration-writes.ts`, `operations.ts` e `migrations/`. O seed deixa conta, host e raiz dos projetos nulos; perfis são lidos de `execution_profiles`. Há revisões, ETag composto, transações síncronas, recibos e recuperação por operação. | Persistir os novos fatos e regras. `writeGlobals` não grava `account_id` e atualmente exige host designado para automação. Não resolver vínculo por seed SQL. |
| B04: serviços e HTTP de configuração | `apps/controller/src/modules/projects/index.ts`, `apps/controller/src/http/routes/projects.ts`. `createProjects` normaliza diretórios; rotas `/api/v1/settings` e `/api/v1/projects/:projectId/configuration` usam schemas, ETag e comandos idempotentes. A validação atual usa realpath/stat/access. | Evoluir as operações de negócio para seletores, validação de pasta, onboarding e gestão de perfis, mantendo regras fora do React e SQL fora do HTTP. |
| B05: GitHub e autoridade | `apps/controller/src/modules/github/index.ts`, `client.ts`, `transport.ts`; `apps/controller/src/modules/projects/queue.ts` e `apps/controller/src/modules/storage/queue.ts`. Existem `getIdentity`, observação de versão e comparação da conta observada com a configurada. O runner depende do contexto Windows/keyring fornecido. | Descobrir GH, consultar contas elegíveis e vincular explicitamente. `recordControllerAccount` registra observação; não constitui vínculo inicial. |
| B06: configuração na UI | `apps/web/src/features/projects/ProjectForm.tsx`, `useConfiguration.ts`, `save-lifecycle.ts`, `apps/web/src/app/drafts.ts`, `apps/web/src/api/http.ts` e `uncertain-operations.ts`. O formulário agrega configurações e perfis, usa campos livres para provider/model/effort e expõe recibos/ETag. Há rascunhos por contexto e proteção contra respostas tardias. | Separar a gestão visual dos perfis, reutilizar edição e preservar as garantias de save, conflito e consulta de operação incerta. |
| B07: navegação e modais | `apps/web/src/app/AppShell.tsx`, `PrincipalScreen.tsx`, `hash-route.ts`, `useDialogs.ts`, `features/operations/DashboardPanel.tsx`. As seis abas atuais não incluem Perfis. O shell já controla foco, Tab, Escape, fundo inerte e retorno ao acionador. | Acrescentar wizard e tela Perfis, adaptando a guarda de fechamento para não descartar edição silenciosamente. |
| B08: preparação e início | `packages/contracts/src/preparations.ts`, `apps/controller/src/modules/projects/preparations.ts`, `apps/controller/src/modules/pipeline/start.ts`, `apps/controller/src/modules/storage/attempts.ts`, `apps/web/src/features/preparations/PreparationDialog.tsx`. Há resolução de perfis, captura de configuração e revalidação antes do início. O início compara hostname com host designado. | Aplicar tipos e catálogo aos perfis, remover designação manual e custo, conservar captura e revalidação de autoridade. |
| B09: execução e tempos | `apps/controller/src/modules/execution/index.ts`, `adapters/maestri-omp/adapter.ts`, `bootstrap.ts`, `apps/controller/src/modules/storage/measurements.ts`, `apps/web/src/features/attempts/AttemptDetailDialog.tsx`. Há confirmação do perfil efetivo, medição separada de tempo ativo/espera e expiração. Medições ainda leem `CostDefaults`. | Implementar ou integrar catálogo suportado no módulo execution; propagar ausência de esforço e retirar tetos financeiros. A interface pública atual não oferece consulta de catálogo. |
| B10: registros e diagnóstico | `apps/web/src/features/records/RecordsPanel.tsx`, `useRecords.ts`, `useDiagnostics.ts`, `apps/controller/src/modules/diagnostics/index.ts`. Há apresentação direta de códigos, estados, chaves de fatos, IDs e requisitos afetados. | Apresentar causa e ação em português, reservando os metadados para suporte. |
| B11: HTTP/SSE | `apps/controller/src/http/routes/events.ts`, `http/app.ts`, `http/security/index.ts`, `apps/web/src/app/useControllerEvents.ts`, `scripts/smoke-compiled.mjs`. Há cursor, `Last-Event-ID`, eventos `controller-event`, resync, vida limitada do stream e shutdown. | Investigar o fechamento observado e validar o contrato completo, incluindo as expectativas do smoke. A leitura do código não isola a causa da falha. |
| B12: assets, estilo e provas | `apps/controller/src/http/assets.ts`, `apps/web/src/app/styles/tokens.css`, `artifact.css`, `tests/integration/`, `tests/acceptance/`, `scripts/first-slice-evidence.mjs`, `docs/integration/`. Assets distribuídos usam marcação `publicAsset`; API conserva proteção própria. | Corrigir favicon e combinações de contraste observadas; registrar provas locais e aceite posterior por versão. |

### 2.2 Padrões a preservar

- TypeScript strict, ESM/NodeNext, imports relativos com `.js` e contratos via `#contracts`. Componentes React usam PascalCase e símbolos de código usam inglês.
- Stack existente: Node 24, Fastify 5, React 18/Vite, TypeBox, better-sqlite3 e Vitest, com versões fixadas no `package.json` e no lockfile. O pacote não requer nova tecnologia.
- Interfaces públicas dos módulos em `index.ts`; SQL em storage, GH em github, Git em workspaces e Maestri/OMP em execution. Seletores nativos dependem da composição confiável do host, não de IO no navegador.
- Mutações confirmadas após commit, operação identificável e revisão concorrente. Uma resposta perdida exige consulta; não autoriza repetição cega do efeito.
- Testes de seam interna junto ao módulo; contratos em `tests/integration` com Fastify inject e SQLite/ambientes temporários; estados web em `tests/web-state.test.ts`. Essas provas não substituem observação de UI em Chrome nem execução real Maestri/OMP/GitHub.

O GitNexus foi consultado para a raiz canônica e retornou repositório não indexado. O mapa acima se apoia nos arquivos atuais, sem indexação ou exploração de outro projeto.

## 3. User stories

### 3.1 Linguagem, orientação e suporte

#### US-01: compreender bloqueios e registros

Como operador da fábrica, quero ler estados, bloqueios e registros em português brasileiro, para identificar a causa e a próxima ação sem interpretar códigos internos.

Origem: F01, F03, F12. Integração: B06, B07 e B10.

Critérios de aceite:

1. Um bloqueio de conta sem vínculo apresenta título compreensível, causa e ação para vincular a conta, sem mostrar `ACCOUNT_UNOBSERVED` como explicação principal.
2. Registros, diagnósticos e detalhes operacionais traduzem estados e rótulos como `expectedAccountId`, `observedHost` e `profileCount`; nomes GitHub CLI e OMP podem permanecer.
3. A visão comum não apresenta seção Requisitos com RF, IDs de operação, ETags ou chaves internas equivalentes. Quando necessários, esses dados podem ser consultados em detalhes técnicos/suporte.
4. Ocultar metadados não remove o identificador usado em recibos, controle de revisão ou consulta de uma operação com resposta perdida.

#### US-02: entender o preenchimento dos campos

Como operador da fábrica, quero encontrar orientação junto aos campos mantidos, para saber o que preencher, o que pode ficar no padrão e o efeito da alteração.

Origem: F05, F09. Integração: B06, B08 e B09.

Critérios de aceite:

1. Cada campo mantido informa propósito, obrigatoriedade, momento de preenchimento, formato ou exemplo e efeito da alteração.
2. A configuração distingue os dados necessários para começar dos controles que podem permanecer no padrão.
3. O campo TTL de pergunta explica que define por quanto tempo uma pergunta aguarda resposta antes de expirar.
4. A apresentação não reúne TTL e tempo ativo em um único controle nem altera a medição separada de espera humana.

### 3.2 Configuração inicial

#### US-03: concluir a configuração em etapas

Como operador da fábrica, quero configurar GitHub, pasta e perfis em um wizard, para preparar a instalação seguindo uma sequência verificável.

Origem: F02. Integração: B02, B03, B04 e B07; usa US-05, US-06, US-08 e US-13.

Critérios de aceite:

1. Enquanto a configuração inicial estiver pendente e a abertura automática não estiver suprimida, acessar a Principal apresenta o modal com a ordem Conectar GitHub, Escolher a pasta dos projetos e Configurar os perfis.
2. A etapa GitHub permite verificar status e vincular uma conta exibida pelo login; a de pasta permite seleção nativa e confirmação de acesso/gravação.
3. A etapa Perfis permite consultar o catálogo e criar Implementador e Revisor dentro do wizard usando o mesmo formulário da tela Perfis. OMP indisponível oferece Tentar novamente.
4. Avançar, inclusive por navegação direta para uma etapa posterior, depende da resolução e do save confirmado da etapa atual. Falha mantém os campos e a etapa.
5. Voltar a uma etapa anterior é permitido e conserva os dados já salvos.
6. Tempos, orientações avançadas de projeto/tentativa, modos de entrega e criação/vínculo de projeto ficam fora desse percurso inicial. A Orientação opcional do próprio perfil permanece no formulário compartilhado do wizard, sem exigir preenchimento para concluir a configuração inicial.

#### US-04: retomar, dispensar e concluir o wizard

Como operador da fábrica, quero controlar a reabertura do wizard sem perder etapas salvas, para concluir a configuração no meu ritmo e tratar pendências futuras nas telas correspondentes.

Origem: F02. Integração: B03, B06 e B07.

Critérios de aceite:

1. Fechar e reabrir retoma a primeira etapa incompleta e preserva as etapas salvas.
2. Fechamento com edição não salva, inclusive pelo X, Escape ou fundo quando permitido pelo modal, solicita Continuar configurando ou Descartar alterações. Continuar mantém campos e modal; descartar não desfaz etapas persistidas.
3. Fechar permite usar a interface. Retornar à Principal reapresenta o wizard pendente, salvo se Não exibir novamente tiver sido marcado.
4. A supressão persiste entre reaberturas e não remove Configuração inicial do Dashboard enquanto a conclusão estiver pendente.
5. Concluir exige conta vinculada e validada, pasta com acesso/gravação confirmados e pelo menos um perfil de cada tipo; persiste um marco distinto da supressão.
6. Após confirmação, exibe Configuração inicial concluída e Ir para Projetos, retira o botão de reabertura e não inicia tentativa, criação de projeto ou automação.
7. Falhas posteriores de conta/pasta ou exclusão do último perfil não desfazem o marco nem reabrem o wizard; o Dashboard apresenta a pendência com ação para a configuração pertinente.

### 3.3 GitHub e identidade da instalação

#### US-05: localizar o GitHub CLI

Como operador da fábrica, quero que a instalação detecte o GitHub CLI e permita localizá-lo quando necessário, para abrir a configuração sem conhecer previamente o caminho de gh.exe.

Origem: F15. Integração: B01, B04 e B05.

Critérios de aceite:

1. A fábrica procura `gh.exe` nesta ordem: PATH efetivo, `GH_PATH`, caminho salvo pelo seletor e nova seleção manual. Cada candidato deve apontar para executável existente; `GH_TOKEN` e `GITHUB_TOKEN` não são usados como evidência de instalação.
2. Cada candidato só é aceito após execução bem-sucedida de `gh --version` no contexto autorizado. Candidato inválido permite seguir a busca na ordem definida, sem aceitação silenciosa.
3. Se não localizar o CLI, informa a ausência, orienta instalação e, em PATH desatualizado após instalação, reinício da fábrica e nova detecção.
4. Sem candidato válido, explicar a situação e oferecer Localizar gh.exe pelo seletor do Windows como último recurso. Persistir o caminho validado e reutilizá-lo nas verificações futuras depois de PATH e GH_PATH; caminho salvo que deixe de funcionar permite nova seleção.
5. A falta de um caminho GH prévio não impede abrir o wizard; o ajuste não redesenha o bootstrap das outras ferramentas nem cria autoridade Windows por descoberta de EXE.

#### US-06: vincular explicitamente uma conta

Como operador da fábrica, quero selecionar e vincular uma conta GitHub elegível pelo login, para estabelecer a identidade usada pela fábrica sem copiar IDs.

Origem: F15. Integração: B02 a B05.

Critérios de aceite:

1. Verificar status consulta somente `github.com`, reaproveita a identidade observada e apresenta contas reportadas pelo CLI com login, sem exigir ID interno.
2. Somente contas autenticadas válidas e ativas podem ser selecionadas. Contas inativas/inválidas recebem orientação de ativação no CLI e nova consulta.
3. Sem conta válida/ativa, a interface orienta autenticação no CLI e permite nova verificação, sem realizar login ou alterar credenciais automaticamente.
4. Vincular conta revalida e persiste o vínculo em uma operação de produto com revisão e recibo. Uma observação de identidade isolada não grava o vínculo.
5. O vínculo não habilita automação, retoma despacho, autoriza publicação nem configura Project/issues.

#### US-07: corrigir divergência de conta

Como operador da fábrica, quero visualizar divergências entre conta vinculada e ativa, para regularizar a identidade antes de novos inícios dependentes de GitHub.

Origem: F15. Integração: B03, B05, B08 e DashboardPanel em B07.

Critérios de aceite:

1. Se a conta ativa divergir da vinculada, são apresentados ambos os logins e os novos inícios dependentes de GitHub são bloqueados.
2. Nova consulta não substitui automaticamente a conta vinculada nem troca globalmente a conta ativa do CLI.
3. Trocar vínculo é recusado também no servidor enquanto houver tentativa da conta vinculada sem resultado final, inclusive em preparação, implementação, suspensão/pergunta pendente, checks, revisão ou publicação. Essa é a definição de execução ativa para este impedimento; o operador é orientado a encerrá-la antes da troca. Tentativa encerrada com limpeza incerta não é ativa apenas por essa limpeza, que continua registrada separadamente.
4. Revalidar correspondência é uma ação distinta de vincular/trocar conta. A regularização não retoma despacho ou amplia autoridade implicitamente.

### 3.4 Pastas, execução local e instalação

#### US-08: escolher e validar a pasta dos projetos

Como operador da fábrica, quero selecionar uma pasta pelo Windows e confirmar acesso e gravação, para definir onde criar novos projetos sem digitar caminhos.

Origem: F06. Integração: B01, B03, B04 e B06.

Critérios de aceite:

1. Selecionar pasta abre o seletor nativo e apresenta o caminho escolhido; a escolha por esse percurso não exige digitação.
2. Cancelar conserva a pasta anterior. Sem pasta anterior, o cancelamento mantém a etapa pendente.
3. Acesso e gravação são confirmados antes de concluir a etapa; falha impede avanço, explica a causa e oferece outra pasta ou nova verificação.
4. Mudar a raiz posteriormente afeta apenas novos projetos. Caminhos de projetos cadastrados e seus arquivos permanecem no lugar.
5. A interface distingue pasta dos projetos do armazenamento fixo da instalação.

#### US-09: executar no computador local

Como operador da fábrica, quero que o executor use automaticamente este computador, para operar a instalação sem cadastrar ou selecionar outra máquina.

Origem: F04. Integração: B01, B03, B05 e B08.

Critérios de aceite:

1. O controlador captura o nome real do computador local para identificação interna.
2. Configuração e telas comuns não pedem designação de host, seleção de outra máquina ou campo/rótulo de host executor.
3. Início, preparação e habilitação da fila deixam de exigir o preenchimento manual de `designatedHost`.
4. Um segundo controlador da mesma instalação continua recusado pelo lock local; múltiplas abas continuam usando um worker. A revalidação de conta permanece ativa.

#### US-10: usar armazenamento fixo da instalação

Como operador da fábrica, quero que os dados operacionais usem um local definido pela instalação, para não configurar diretórios internos ou um Workspace Maestri ID.

Origem: F07. Integração: B01 a B04 e B09.

Critérios de aceite:

1. O banco é aberto em `<raiz da instalação>/var/factory/factory.sqlite`, inclusive quando o processo parte de outro cwd.
2. UI, configuração persistida e `FACTORY_DATA_DIR` não alteram esse caminho na distribuição.
3. Diretório de dados da instalação e Workspace Maestri ID deixam de ser campos editáveis; execução usa o contexto Maestri local herdado.
4. Exemplos e instruções operacionais refletem o armazenamento fixo, sem caminho pessoal desta máquina.
5. A futura instalação limpa não exige migração dos dados atuais; banco incompatível continua gerando diagnóstico, sem recriação vazia silenciosa. Esta história não executa limpeza ou reset da instalação atual.

### 3.5 Tempos e retirada de tetos

#### US-11: configurar tempos sem conversões manuais

Como operador da fábrica, quero editar intervalo de consulta e tempo ativo em minutos, para compreender os valores e conservar sua precisão ao salvar.

Origem: F08, F09. Integração: B02, B03, B06, B08 e B09.

Critérios de aceite:

1. Os dois campos recebem e apresentam minutos junto ao valor, com exemplos simples como 2, 5 e 30; aceitam números positivos, incluindo decimais como 0,5 e 2,5. Precisão é detalhe técnico, sem configuração adicional para o operador; milissegundos não são unidade de preenchimento.
2. O intervalo atual de 15.000 ms é apresentado como 0,25 minuto, sem impor mínimo de um minuto.
3. Salvar 0,5 minuto produz 30.000 ms no contrato/runtime; 2,5 minutos produzem 150.000 ms. Internamente, os dois tempos permanecem milissegundos inteiros entre 1 e 2.147.483.647, inclusive. A conversão decimal preserva valores representáveis sem recusa espúria por ponto flutuante; abrir, editar outro campo e salvar conserva o valor efetivo já salvo, inclusive nos limites internos.
4. Zero, negativos, entradas inválidas, valores fora da faixa interna ou que exijam fração de milissegundo são recusados com mensagem clara junto ao campo, em termos de minutos. Por exemplo, 0,000001 minuto é recusado e 0,00005 minuto corresponde a 3 ms. Não há arredondamento silencioso para minutos inteiros nem para milissegundos inteiros.
5. TTL permanece um controle distinto; uma pergunta aguardando resposta não passa a acumular tempo ativo por mudança da unidade visual.

#### US-12: operar sem teto financeiro ou de tokens

Como operador da fábrica, quero configurar e iniciar trabalho sem tetos financeiros ou de tokens de inferência, para usar os controles de tempo e TTL aprovados para o produto.

Origem: F10. Integração: B02, B03, B06, B08 e B09.

Critérios de aceite:

1. Configuração, preparação e detalhe da tentativa deixam de oferecer limite financeiro, limite de tokens ou estado de aplicação desses tetos.
2. Contratos, defaults, capturas e runtime deixam de exigir esses tetos ou bloquear início pela ausência deles.
3. Controles de tempo ativo, TTL e proteções de tokens de autenticação/sessão/CSRF permanecem funcionando.
4. Roteiros de prova não reintroduzem teto financeiro como requisito de produto; execução externa continua dependendo da autorização delimitada correspondente.

### 3.6 Perfis globais e catálogo OMP

#### US-13: criar ou editar um perfil pelo catálogo

Como operador da fábrica, quero selecionar opções do OMP em um modal de perfil, para cadastrar configurações exatas sem digitar provider, modelo ou esforço.

Origem: F11, F13. Integração: B02, B03, B06, B07 e B09.

Critérios de aceite:

1. Novo perfil e Editar reutilizam o mesmo formulário, também dentro do wizard, com título e ação Criar perfil ou Salvar alterações conforme o contexto.
2. Nome, Tipo e Executor ocupam largura total nessa ordem; Provider e Modelo ficam lado a lado; Esforço fica abaixo à esquerda; Consultar catálogo novamente acompanha as opções; Orientação opcional do perfil ocupa área ampla e permanece disponível também no wizard. Essa orientação não incorpora as orientações avançadas de projeto/tentativa nem exige preenchimento para concluir a configuração inicial.
3. O modal é centralizado, tem fundo claro, página escurecida, cantos arredondados, título à esquerda e fechamento no alto à direita; o rodapé tem divisória e ações Cancelar e principal à direita, sem blocos técnicos excluídos pelo discovery.
4. Tipo permite Implementador e Revisor. Provider/modelo/esforço são listas da superfície suportada do OMP; combinações obrigatórias incompletas impedem save.
5. Trocar provider/modelo preserva escolhas compatíveis e limpa somente as incompatíveis. Resposta tardia de uma consulta anterior não substitui a seleção atual.
6. Modelo sem esforço apresenta Não se aplica e salva uma representação explícita de ausência, sem inventar valor de esforço.
7. Nome global é único após desconsiderar caixa e espaços nas pontas; `Perfil A` e ` perfil a ` não podem coexistir, inclusive em saves concorrentes.

#### US-14: preservar um perfil quando o catálogo não permite substituições

Como operador da fábrica, quero distinguir catálogo indisponível de modelo salvo ausente, para editar nome e orientação sem perder configurações existentes.

Origem: F11. Integração: B03, B06 e B09.

Critérios de aceite:

1. Consulta que falha ou retorna catálogo vazio apresenta OMP indisponível e bloqueia criação e alteração de provider/modelo/esforço até carregar opções.
2. Nessa condição, um perfil existente permite salvar nome e orientação conservando exatamente provider/modelo/esforço salvos.
3. Com catálogo carregado e modelo salvo ausente, o valor existente continua visível com aviso e pode ser preservado ao editar nome/orientação.
4. Alterar provider/modelo/esforço nessa situação exige combinação válida do catálogo atual, sem substituição automática.
5. Consultar catálogo novamente não dispara inferência paga apenas para testar acesso nem usa lista paralela inventada.

#### US-15: iniciar com perfis válidos para cada papel

Como operador da fábrica, quero receber uma orientação verificável sobre os perfis antes de iniciar, para executar cada papel com a configuração selecionada.

Origem: F11, F14. Integração: B02, B08 e B09.

Critérios de aceite:

1. A instalação começa sem perfis provisionados automaticamente. Ausência de pelo menos um Implementador ou um Revisor bloqueia início e apresenta modal com acesso a Perfis.
2. Seleções de padrão do projeto e de preparação aceitam somente perfis do tipo correspondente ao papel, com validação no servidor.
3. Catálogo consultado com sucesso que não contenha o modelo selecionado bloqueia início, identifica o perfil e oferece edição e Consultar catálogo novamente.
4. Indisponibilidade de consulta não é tratada como ausência do modelo: permite tentar a configuração salva quando os demais pré-requisitos estiverem atendidos. Se o OMP recusar, a causa é apresentada.
5. A configuração capturada e o perfil efetivo conservam provider/modelo/esforço exatos, inclusive ausência de esforço, sem fallback silencioso.

#### US-16: encontrar e manter os perfis globais

Como operador da fábrica, quero uma tela dedicada com busca e filtros dos perfis cadastrados, para localizar e manter configurações compartilhadas entre projetos.

Origem: F14. Integração: B03, B06 e B07.

Critérios de aceite:

1. O menu Workspace tem item independente Perfis, com ícone e nome acessível, imediatamente abaixo de Vincular existente. A tela usa título Perfis Globais e descrição de compartilhamento entre projetos.
2. O painel central claro oferece Novo perfil, busca por nome/orientação, filtro de modelo iniciado em Todos os modelos e abas Todos, Implementador e Revisor com contagens e seleção destacada.
3. A grade contém apenas perfis cadastrados. Cada cartão apresenta ícone, nome, provider, modelo, orientação, tipo, esforço e ações Editar e Excluir, sem avisos excluídos da referência.
4. Combinação de busca/filtros sem resultado apresenta Nenhum perfil encontrado e Limpar filtros; limpar restaura a consulta sem filtro.
5. Save confirmado gera confirmação discreta e atualiza a lista e as contagens.

#### US-17: alterar ou excluir perfis com integridade

Como operador da fábrica, quero conhecer os vínculos que impedem excluir ou mudar o tipo de um perfil, para manter os padrões dos projetos e as execuções ativas consistentes.

Origem: F14. Integração: B03, B06, B08 e B09.

Critérios de aceite:

1. Excluir é recusado se houver tentativa sem resultado final que tenha capturado o perfil como Implementador ou Revisor, inclusive em preparação, implementação, suspensão/pergunta pendente, checks, revisão ou publicação, ou projeto que o tenha como padrão. Essa é a definição de execução ativa para a exclusão. Tentativa encerrada com limpeza incerta não mantém esse impedimento apenas pela limpeza; o vínculo como padrão de projeto conserva seu impedimento independente. A apresentação identifica o uso ativo ou lista os projetos e orienta substituição, conforme a causa.
2. Sem impedimentos, a confirmação identifica o perfil pelo nome; confirmar remove o perfil da lista e atualiza contagens.
3. Excluir o último perfil de um tipo é permitido após aviso de que novos inícios ficarão bloqueados; não reabre onboarding concluído.
4. Mudar tipo é recusado enquanto houver vínculo como padrão de projeto, com identificação dos projetos. Nome/orientação e demais campos continuam editáveis conforme o catálogo.
5. Editar um perfil em uso afeta apenas próximas execuções; a configuração capturada da ativa e a identidade do conteúdo em revisão permanecem inalteradas.
6. Exclusão e mudança de tipo revalidam seus respectivos impedimentos no servidor no momento da gravação; para exclusão, verificar a configuração capturada nos dois papéis das tentativas sem resultado final e os padrões de projeto. Informação antiga de um modal não autoriza romper um vínculo criado em outra aba.

### 3.7 Confiabilidade de edição e transporte

#### US-18: salvar sem perder rascunhos ou duplicar efeitos

Como operador da fábrica, quero resolver falhas de save e conflitos mantendo minha edição, para continuar a configuração sem perder dados ou repetir uma operação já aceita.

Origem: contratos preservados em F02, F11 a F15 e F16. Integração: B03, B04 e B06.

Critérios de aceite:

1. Falha de save conserva os campos editados e oferece nova ação, sem confirmação de sucesso ou avanço do wizard.
2. Revisão desatualizada resulta em conflito com os valores atuais consultáveis e rascunho preservado; não há sobrescrita silenciosa.
3. Resposta de contexto anterior ou de modal desmontado não altera o contexto atual; erro de catálogo não apaga erro de save.
4. Resposta perdida mantém uma operação consultável; consultar seu resultado recupera o mesmo recibo sem recriar vínculo, perfil ou outro efeito.
5. Salvar perfil/defaults não altera snapshots de tentativas existentes.

#### US-19: acompanhar eventos após fechamento ou reconexão

Como operador da fábrica, quero que o acompanhamento recupere o estado após uma conexão de eventos encerrar, para continuar consultando a operação sem reenviar comandos.

Origem: F16. Integração: B11 e B06.

Critérios de aceite:

1. A investigação registra etapa, reprodução e causa comprovada do fechamento do smoke, distinguindo encerramento esperado de falha. Não atribui a mesma causa ao erro do navegador sem evidência.
2. A correção altera o componente responsável conforme a reprodução, seja produto ou smoke, e a execução integral de `test:compiled` termina com evidência e código de saída registrados.
3. Regressão controlada cobre fechamento, reconexão/resync, cursor, contexto da consulta e ausência de duplicação dos comandos/efeitos.
4. `UND_ERR_SOCKET`/`TypeError: terminated` não é suprimido genericamente para produzir aprovação; encerramentos esperados são delimitados ao cenário que os comprova.
5. Confirmação em Playwright MCP/Chrome permanece uma prova própria posterior. Um smoke local aprovado não atesta esse percurso no navegador.

### 3.8 Apresentação e assets

#### US-20: ler e operar as telas afetadas

Como operador da fábrica, quero ler os textos e usar os novos formulários por teclado e em diferentes tamanhos de tela, para concluir a configuração sem corte ou sobreposição de ações.

Origem: F13, F14, F17. Integração: B07 e B12.

Critérios de aceite:

1. A correção trata as duas combinações observadas de 2,91:1: links laranja sobre branco e texto branco sobre navegação laranja em 13 a 14 px. Registra cores e razões antes/depois, com conciliação ao design aprovado, sem redesenho geral.
2. Wizard e modal de perfil têm nomes acessíveis, foco visível, navegação Tab/Shift+Tab contida no modal e retorno de foco ao acionador ao fechar; Escape respeita a confirmação de descarte quando aplicável.
3. Aceite posterior verifica telas afetadas em desktop e celular, com conteúdo real pertinente, sem corte ou sobreposição que impeça acesso a campos e ações.
4. Evidência registra zoom nativo Chrome e acesso às ações nesse zoom; CSS zoom não substitui essa verificação. Não se declara nível quantitativo de conformidade não definido no discovery.

#### US-21: carregar o ícone sem liberar a API

Como operador da fábrica, quero que o navegador carregue o favicon da aplicação, para identificar a aba sem erro de autenticação desse recurso estático.

Origem: F17. Integração: B12 e segurança HTTP de B11.

Critérios de aceite:

1. A requisição ao favicon distribuído recebe o recurso estático válido sem depender da sessão técnica e deixa de retornar o 401 observado.
2. Essa abertura não concede acesso anônimo a settings, eventos, diagnósticos ou outras leituras operacionais.
3. Host/Origin e proteções contra exposição de arquivos privados continuam aplicados conforme a política existente.

### 3.9 Aceite e entrega por versão

As histórias seguintes especificam requisitos de validação e entrega. Elas não acrescentam botões de prova integrada nem automações externas à aplicação.

#### US-22: conhecer os pré-requisitos das provas

Como responsável pelo aceite, quero roteiros vinculados à versão e ao contexto de quem executa cada prova, para distinguir correções locais concluídas de aceite integrado ainda pendente.

Origem: F18, F19. Integração: B12, contratos de B08/B09 e relatórios em `docs/integration/`.

Critérios de aceite:

1. Cada roteiro registra versão entregue, runtime, papel do responsável, raiz/cwd, ferramentas, chamada segura exercida, resultado/horário, limites de acesso e evidência.
2. As provas externas exigem F15 resolvido, alvos de projeto/repositório/Project/issues definidos, perfis exatos de Implementador e Revisor, acesso efetivo e autorização delimitada para provider e efeitos Git/GitHub.
3. Configuração de ferramenta, acesso de outro runtime, inicialização pelo Wire e sucesso de fixture não são registrados como execução real da prova.
4. Preflight não recruta terminal ou chama provider apenas para testar acesso. A falta de contexto Git/GH autorizado é registrada sem login alternativo.
5. Resultados locais e pendências externas têm registros separados; ausência de ferramenta externa não é convertida em defeito fictício, aprovação externa ou repetição da mesma implementação.

#### US-23: comprovar os percursos integrados da versão entregue

Como responsável pelo aceite, quero executar os roteiros reais de operação, publicação, fila e UI com os alvos autorizados, para avaliar o produto além dos testes controlados.

Origem: F16 a F18. Integração: B05, B08 a B12 e módulos existentes workspaces, verification e publication.

Critérios de aceite:

1. Primeira fatia comprova cadastro preservando origem dirty, clone próprio, implementação/resultado durável, checks, revisão independente, ICR, perfil efetivo, TUI/MCP e uso útil de GitNexus quando requerido.
2. O percurso inclui pergunta/resposta na mesma passagem, entrega incerta sem reenvio cego, cancelamento na inicialização e com processo filho, restart e nova tentativa em outro ambiente.
3. Publicação exercita ICR, Commit e PR sobre a mesma versão aprovada; reconciliação após resposta perdida não duplica commit, PR ou comentário nem reimplementa a entrega.
4. Fila comprova consumo único, revalidação de autoridade, projeção e preservação de tentativa/histórico após pausa e restart.
5. UI real cobre zoom nativo, contraste dos estados pertinentes, dados e múltiplas páginas, falha isolada de seção/continuação, conflito entre abas, capacidade alterada com diálogo aberto e pergunta expirada/respondida em outra aba com rascunho preservado; inclui reconexão/resync de US-19.
6. Evidências registram alvo, versão, resultados e limitações. As provas não são disparadas pela conclusão do wizard, pela geração deste documento ou pela suíte padrão.

#### US-24: revisar a entrega imutável

Como responsável pelo aceite, quero checks e revisão independente ligados à referência imutável da entrega, para saber quais bytes foram avaliados e quais achados continuam aplicáveis.

Origem: F19. Integração: módulos existentes workspaces, verification, storage e publication; B12.

Critérios de aceite:

1. A referência Git imutável é preparada somente no fluxo autorizado e identifica o conteúdo efetivamente submetido a checks e revisão.
2. O responsável pela revisão lê os fontes e executa os checks pertinentes sem alterar os fontes para corrigir ou aprovar. Os resultados identificam a versão avaliada.
3. HEAD anterior acompanhado de alterações posteriores, hashes avulsos ou inventários não substituem a referência exigida.
4. Correções posteriores exigem nova versão e avaliação correspondente; achados e avaliações anteriores são preservados.
5. Se faltar autorização/contexto para preparar a referência, entrega/revisão ficam pendentes separadamente dos resultados locais já obtidos, sem criação implícita de commit/tag/ref/push.

## 4. Requisitos funcionais

Cada linha define uma obrigação verificável. A coluna Integração remete aos arquivos atuais da seção 2. B02/B03 também se aplicam aos novos dados ou comandos que precisem de contrato e persistência.

### 4.1 Linguagem e orientação

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-01 | Apresentar em português brasileiro as mensagens, estados e orientações da interface, preservando nomes técnicos necessários. | US-01 | F01, F03 | B06, B07, B10 |
| RF-02 | Apresentar cada bloqueio com título compreensível, causa e próxima ação. | US-01 | F01 | B07, B08, B10 |
| RF-03 | Converter nomes internos de fatos em rótulos legíveis na visão do operador. | US-01 | F03 | B10 |
| RF-04 | Retirar a seção Requisitos com RF da visão comum dos diagnósticos. | US-01 | F03 | B10 |
| RF-05 | Reservar IDs de operação, ETags e metadados equivalentes a detalhes técnicos/suporte quando necessários, mantendo seu uso interno. | US-01, US-18 | F12 | B06, B10 |
| RF-06 | Disponibilizar junto a cada campo mantido orientação de propósito, obrigatoriedade, momento, formato/exemplo e efeito. | US-02 | F05 | B06, B08 |
| RF-07 | Identificar os campos necessários para começar e os que podem permanecer com o padrão. | US-02 | F05 | B06, B07 |
| RF-08 | Explicar no campo TTL que a pergunta aguarda resposta até expirar pelo tempo configurado. | US-02, US-11 | F09 | B06, B09 |

### 4.2 Wizard inicial

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-09 | Abrir automaticamente o wizard na Principal enquanto pendente, exceto após supressão explícita. | US-03, US-04 | F02 | B07, B03 |
| RF-10 | Ordenar as etapas em Conectar GitHub, Escolher a pasta dos projetos e Configurar os perfis. | US-03 | F02 | B07 |
| RF-11 | Oferecer verificação e vínculo da conta pelo login na primeira etapa. | US-03, US-06 | F02, F15 | B05, B07 |
| RF-12 | Oferecer seleção nativa e confirmação de acesso/gravação da pasta na segunda etapa. | US-03, US-08 | F02, F06 | B01, B04, B07 |
| RF-13 | Permitir criar ambos os tipos de perfil dentro da terceira etapa com o mesmo formulário da tela Perfis. | US-03, US-13 | F02, F13 | B06, B07, B09 |
| RF-14 | Oferecer Tentar novamente quando a consulta OMP da etapa Perfis estiver indisponível. | US-03, US-14 | F02, F11 | B07, B09 |
| RF-15 | Gravar cada etapa antes de autorizar avanço, inclusive pela navegação direta para uma etapa posterior. | US-03 | F02 | B03, B04, B07 |
| RF-16 | Permitir voltar às etapas anteriores conservando os dados já salvos. | US-03 | F02 | B07 |
| RF-17 | Retomar a primeira etapa incompleta ao reabrir, a partir dos fatos persistidos. | US-04 | F02 | B03, B07 |
| RF-18 | Exigir escolha entre Continuar configurando e Descartar alterações antes de fechar o wizard com edição não salva. | US-04 | F02 | B06, B07 |
| RF-19 | Manter campos e etapa após falha de save, exibindo erro e permitindo nova ação. | US-03, US-18 | F02 | B06, B07 |
| RF-20 | Permitir uso da interface após fechar o wizard. | US-04 | F02 | B07 |
| RF-21 | Persistir Não exibir novamente como supressão de futuras aberturas automáticas, separada da conclusão. | US-04 | F02 | B02, B03, B07 |
| RF-22 | Manter Configuração inicial no Dashboard enquanto não concluída, mesmo após supressão. | US-04 | F02 | B07 |
| RF-23 | Concluir somente com conta vinculada/validada, pasta confirmada para acesso/gravação e ao menos um perfil de cada tipo. | US-04 | F02 | B03, B04, B05, B09 |
| RF-24 | Persistir a conclusão, apresentar Configuração inicial concluída e Ir para Projetos e retirar a reabertura do wizard concluído. | US-04 | F02 | B03, B07 |
| RF-25 | Apresentar pendências posteriores no Dashboard com ação para GitHub, pasta ou Perfis, sem desfazer conclusão. | US-04, US-17 | F02 | B07, B10 |
| RF-26 | Manter criação/vínculo de projetos, tempos, orientações avançadas de projeto/tentativa e modos de entrega fora do wizard inicial; conservar a Orientação opcional do perfil no formulário compartilhado, sem exigir seu preenchimento para concluir. | US-03 | F02, F13 | B07 |
| RF-27 | Concluir onboarding sem criar projeto/tentativa, habilitar automação ou dispensar revalidação de início. | US-04 | F02 | B03, B07, B08 |

### 4.3 GitHub e vínculo

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-28 | Descobrir `gh.exe` na ordem PATH efetivo, GH_PATH, caminho salvo pelo seletor e nova seleção manual; validar existência e execução de cada candidato, seguindo a busca se inválido. | US-05 | F15 | B01, B05 |
| RF-29 | Validar o executável candidato por `gh --version`, sem usar variáveis de token como prova de instalação. | US-05 | F15 | B05 |
| RF-30 | Explicar ausência do CLI e orientar reinício/nova detecção quando o PATH estiver desatualizado após instalação. | US-05 | F15 | B05, B07 |
| RF-31 | Sem candidato válido, explicar a situação e oferecer seletor Windows para localizar `gh.exe` como último recurso; persistir o caminho validado para reutilização após PATH/GH_PATH e permitir nova seleção se deixar de funcionar. | US-05 | F15 | B01, B03, B05 |
| RF-32 | Permitir abrir o wizard sem caminho GH prévio, ajustando apenas essa dependência do launcher. | US-05 | F15 | B01 |
| RF-33 | Consultar contas reportadas pelo CLI somente para `github.com` e apresentá-las pelo login. | US-06 | F15 | B05 |
| RF-34 | Permitir seleção somente de conta autenticada válida e ativa. | US-06 | F15 | B05, B07 |
| RF-35 | Orientar autenticação/ativação fora da fábrica e permitir nova verificação quando não houver conta elegível. | US-06 | F15 | B05, B07 |
| RF-36 | Reutilizar a identidade observada sem transformar observação em vínculo automático. | US-06 | F15 | B03, B05 |
| RF-37 | Persistir vínculo explícito por operação de produto revalidada, concorrente e consultável, sem SQL manual. | US-06, US-18 | F15 | B02 a B05 |
| RF-38 | Manter revalidação de correspondência como ação distinta de vincular/trocar conta. | US-07 | F15 | B04, B05 |
| RF-39 | Mostrar conta vinculada e ativa divergentes e bloquear novos inícios dependentes de GitHub. | US-07 | F15 | B05, B07, B08 |
| RF-40 | Recusar troca de vínculo também na persistência enquanto houver tentativa da conta vinculada sem resultado final, incluindo suspensão/pergunta, checks, revisão e publicação; limpeza incerta de tentativa encerrada é separada e não cria esse impedimento por si só. | US-07 | F15 | B03, B08 |
| RF-41 | Preservar a conta ativa global do CLI e o vínculo salvo até ação explícita permitida. | US-06, US-07 | F15 | B05, B03 |
| RF-42 | Vincular sem habilitar publicação/automação, retomar despacho ou configurar Project/issues. | US-06 | F15 | B03, B05, B08 |

### 4.4 Pastas e instalação local

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-43 | Oferecer Selecionar pasta por seletor Windows e mostrar o caminho escolhido sem exigir digitação. | US-08 | F06 | B01, B04, B06 |
| RF-44 | Conservar a pasta anterior ao cancelar o seletor, mantendo pendência se não havia seleção. | US-08 | F06 | B06, B07 |
| RF-45 | Confirmar acesso e gravação antes de concluir a etapa da pasta. | US-08 | F06 | B04 |
| RF-46 | Impedir avanço quando a pasta não puder ser usada e oferecer outra escolha ou nova verificação. | US-08 | F06 | B04, B07 |
| RF-47 | Aplicar uma nova raiz somente a projetos futuros, conservando caminhos e arquivos dos cadastrados. | US-08 | F06 | B03, B04 |
| RF-48 | Capturar automaticamente o nome do computador como identidade interna local. | US-09 | F04 | B01, B03 |
| RF-49 | Retirar cadastro, seleção e exigência de designação manual de host em UI, preparação, início e fila. | US-09 | F04 | B02, B03, B05, B06, B08 |
| RF-50 | Resolver o banco obrigatoriamente em `<raiz da instalação>/var/factory/factory.sqlite`, independentemente do cwd. | US-10 | F07 | B01, B03 |
| RF-51 | Remover a substituição do armazenamento por `FACTORY_DATA_DIR`, UI ou configuração persistida. | US-10 | F07 | B01 a B04, B06 |
| RF-52 | Retirar Workspace Maestri ID da edição e usar o contexto local herdado na execução. | US-10 | F07 | B01, B02, B06, B09 |
| RF-53 | Atualizar bootstrap, exemplos e documentação operacional para o caminho fixo e contexto herdado. | US-10 | F07 | B01 |
| RF-54 | Preservar integridade do schema/ledger e recusar banco incompatível sem substituição silenciosa por vazio. | US-10 | F07 | B03 |

### 4.5 Tempos e limites retirados

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-55 | Apresentar Intervalo de consulta e Tempo ativo por passagem em minutos com unidade visível. | US-11 | F08 | B06, B08 |
| RF-56 | Aceitar minutos positivos inteiros ou decimais representáveis como milissegundos inteiros entre 1 e 2.147.483.647, inclusive; recusar zero, negativos, entradas inválidas, valores fora da faixa ou que exijam fração de milissegundo, com mensagem clara no campo em termos de minutos. Não impor minutos inteiros ou mínimo de um minuto. | US-11 | F08 | B02, B06 |
| RF-57 | Receber/apresentar minutos e converter para milissegundos inteiros sem erro espúrio de ponto flutuante ou arredondamento silencioso; preservar o valor efetivo em leitura/edição/save, inclusive nos limites internos. Precisão é detalhe técnico, sem nova configuração nem preenchimento em milissegundos. | US-11 | F08 | B02, B03, B06 |
| RF-58 | Preservar intervalo de 15.000 ms como 0,25 minuto, sem mínimo de um minuto derivado da UI. | US-11 | F08 | B03, B06 |
| RF-59 | Manter TTL e tempo ativo distintos, excluindo espera humana da contagem de tempo ativo. | US-02, US-11 | F09 | B09 |
| RF-60 | Remover configurações, contratos e defaults de teto financeiro ou de tokens de inferência. | US-12 | F10 | B02, B03, B06 |
| RF-61 | Remover dependências desses tetos da preparação, captura, início, runtime e detalhes da tentativa, sem bloqueadores residuais. | US-12 | F10 | B08, B09 |
| RF-62 | Retirar exigências históricas de teto financeiro dos roteiros do pacote sem retirar autorização de efeitos externos. | US-12, US-22 | F10 | B12 |

### 4.6 Perfis e catálogo

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-63 | Representar Implementador/Revisor como tipo explícito do perfil em contrato e persistência. | US-13, US-15 | F11, F14 | B02, B03 |
| RF-64 | Usar um único formulário modal de criação/edição também na etapa Perfis do wizard. | US-03, US-13 | F13 | B06, B07 |
| RF-65 | Aplicar ao modal a ordem de campos, distribuição, fundo, fechamento e rodapé definidos em US-13, preservando a Orientação opcional do perfil também no wizard. | US-13 | F13 | B07, B12 |
| RF-66 | Consultar catálogo pela superfície suportada do OMP em execution, sem lista paralela inventada nem chamada paga só para testar acesso. | US-13, US-14 | F11 | B09 |
| RF-67 | Usar listas descobertas para provider/modelo/esforço e exigir combinação obrigatória completa ao salvar essas escolhas. | US-13 | F11 | B02, B04, B06, B09 |
| RF-68 | Preservar escolhas compatíveis e limpar somente as incompatíveis ao trocar provider/modelo. | US-13 | F11 | B06 |
| RF-69 | Mostrar Não se aplica para modelo sem esforço e representar sua ausência no contrato e no perfil efetivo. | US-13, US-15 | F11 | B02, B03, B08, B09 |
| RF-70 | Tratar falha ou catálogo vazio como OMP indisponível, bloqueando criação e alterações de provider/modelo/esforço até obter opções. | US-14 | F11 | B04, B06, B09 |
| RF-71 | Permitir editar nome/orientação de perfil existente com catálogo indisponível, sem alterar suas escolhas de execução salvas. | US-14 | F11 | B03, B04, B06 |
| RF-72 | Mostrar valor salvo ausente de catálogo carregado com aviso e permitir preservá-lo em edição de nome/orientação. | US-14 | F11 | B04, B06, B09 |
| RF-73 | Exigir combinação válida do catálogo atual ao alterar provider/modelo/esforço, inclusive se o modelo salvo estiver ausente. | US-14 | F11 | B04, B09 |
| RF-74 | Disponibilizar Consultar catálogo novamente junto às opções sem substituir automaticamente valores salvos. | US-13, US-14 | F11, F13 | B06, B09 |
| RF-75 | Garantir nomes globais únicos desconsiderando caixa e espaços nas pontas, inclusive sob concorrência. | US-13 | F11 | B03, B04, B06 |
| RF-76 | Iniciar a instalação sem perfis globais provisionados automaticamente. | US-15, US-16 | F11 | B03 |
| RF-77 | Bloquear início se faltar perfil de algum tipo e apresentar modal com acesso a Perfis. | US-15 | F11 | B07, B08 |
| RF-78 | Validar tipo correspondente ao papel nas escolhas do projeto e da preparação, também no servidor. | US-15 | F14 | B02, B03, B08 |
| RF-79 | Bloquear início para modelo comprovadamente ausente do catálogo consultado, identificando perfil e oferecendo edição/nova consulta. | US-15 | F11 | B08, B09 |
| RF-80 | Permitir tentativa com perfil salvo quando a consulta de catálogo estiver indisponível e os demais pré-requisitos passarem; apresentar eventual recusa do OMP. | US-15 | F11 | B08, B09 |
| RF-81 | Preservar seleção exata do perfil e conferir configuração efetiva, sem fallback silencioso. | US-15 | F11 | B08, B09 |

### 4.7 Tela e integridade dos perfis globais

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-82 | Criar navegação Perfis independente no Workspace, abaixo de Vincular existente, com ícone e texto acessível. | US-16 | F14 | B07 |
| RF-83 | Apresentar título Perfis Globais, compartilhamento entre projetos, painel central claro e Novo perfil. | US-16 | F14 | B07, B12 |
| RF-84 | Oferecer busca por nome/orientação, filtro de modelo iniciado em Todos os modelos e abas por tipo com contagens. | US-16 | F14 | B06, B07 |
| RF-85 | Exibir cartões apenas dos perfis cadastrados com os dados e ações definidos em US-16. | US-16 | F14 | B06, B07 |
| RF-86 | Apresentar Nenhum perfil encontrado e Limpar filtros quando a consulta filtrada não tiver resultados. | US-16 | F14 | B06 |
| RF-87 | Confirmar save discretamente e atualizar lista/contagens após confirmação durável. | US-16, US-18 | F14 | B03, B06 |
| RF-88 | Impedir exclusão de perfil capturado em qualquer dos dois papéis de tentativa sem resultado final, incluindo suspensão/pergunta, checks, revisão e publicação, ou usado como padrão de projeto; indicar a causa e os projetos pertinentes. Limpeza incerta de tentativa encerrada não impede por si só, preservado o impedimento independente dos padrões de projeto. | US-17 | F14 | B03, B08 |
| RF-89 | Confirmar exclusão permitida pelo nome e atualizar a lista após gravação. | US-17 | F14 | B03, B06 |
| RF-90 | Permitir excluir o último perfil de um tipo com aviso sobre bloqueio de novos inícios, sem desfazer onboarding concluído. | US-04, US-17 | F14 | B03, B06, B07 |
| RF-91 | Bloquear mudança de tipo se o perfil for padrão de projeto, identificando projetos e orientando substituição. | US-17 | F14 | B03, B06 |
| RF-92 | Permitir edição de perfil em uso sem alterar o snapshot da execução ativa. | US-17, US-18 | F14 | B03, B08, B09 |
| RF-93 | Revalidar os respectivos impedimentos de exclusão/tipo no servidor no momento da gravação; na exclusão, verificar a configuração capturada nos dois papéis das tentativas sem resultado final e os padrões de projeto. | US-17, US-18 | F14 | B03 |

### 4.8 Edição concorrente e acompanhamento

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-94 | Confirmar mutações de configuração somente após commit e recibo, com revisão/ETag e operação identificável. | US-18 | Contratos preservados | B03, B04, B06 |
| RF-95 | Preservar campos em falha ou conflito e disponibilizar consulta dos valores atuais sem sobrescrever o rascunho. | US-18 | F02 e contratos preservados | B06 |
| RF-96 | Ignorar respostas tardias de outro contexto/ciclo de edição e manter erro de save independente de erro de catálogo. | US-13, US-18 | Contratos preservados | B06 |
| RF-97 | Consultar operação incerta para recuperar o resultado, mantendo o mesmo efeito e recibo sem reenvio cego. | US-18, US-19 | F12, F16 | B03, B06 |
| RF-98 | Registrar reprodução, etapa e causa comprovada da falha HTTP/SSE antes de atribuir a correção a produto ou smoke. | US-19 | F16 | B11 |
| RF-99 | Corrigir a causa comprovada e executar `test:compiled` integralmente, sem mascarar erro inesperado de socket. | US-19 | F16 | B11 |
| RF-100 | Cobrir fechamento, reconexão/resync e cursor preservando contexto e idempotência em regressão controlada. | US-19 | F16 | B11, B06 |

### 4.9 Correções visuais e validação da entrega

| ID | Requisito | Stories | Origem | Integração |
| --- | --- | --- | --- | --- |
| RF-101 | Corrigir as combinações de contraste observadas e registrar medições antes/depois conciliadas com o design aprovado. | US-20 | F17 | B12 |
| RF-102 | Servir favicon como asset estático válido sem exigir sessão técnica, preservando proteção das leituras operacionais. | US-21 | F17 | B12, B11 |
| RF-103 | Manter roteiros externos com versão, pré-requisitos, contexto efetivo do responsável e autorização delimitada por alvo/efeito. | US-22 | F18, F19 | B12 |
| RF-104 | Registrar disponibilidade por chamada segura realmente exercida no runtime responsável, sem substituir pelo acesso de outro contexto. | US-22 | F18 | B12 |
| RF-105 | Preservar e executar posteriormente os roteiros reais da primeira fatia, publicação e fila definidos em US-23. | US-23 | F18 | B05, B08, B09, B12; workspaces, verification, publication |
| RF-106 | Executar aceite visual posterior de zoom nativo, contraste, dados/paginação, falhas isoladas, conflitos, mudanças de capacidade e perguntas concorrentes. | US-20, US-23 | F17, F18 | B07, B11, B12 |
| RF-107 | Vincular checks e revisão independente a referência Git imutável do conteúdo avaliado, preparada no fluxo autorizado. | US-24 | F19 | workspaces, verification, storage; B12 |
| RF-108 | Preservar avaliações anteriores e exigir nova versão/avaliação após correções. | US-24 | F19 | storage; B12 |
| RF-109 | Separar resultados locais de pendências externas de aceite, entrega e revisão sem fabricar aprovação ou defeito local. | US-19, US-22 a US-24 | F16 a F19 | B12 |

## 5. Requisitos não funcionais

Não são acrescentados SLAs, nível WCAG, razão mínima de contraste ou percentual obrigatório de zoom que o discovery não definiu. Quando o contrato pede medição, o aceite registra o valor e as condições reais. As duas combinações de 2,91:1 continuam achados a corrigir; a ausência de limiar adicional não equivale a conformidade visual.

### 5.1 Performance e persistência

| ID | Requisito e verificação | Stories e fontes |
| --- | --- | --- |
| RNF-01 | Listagens, histórico e polling devem consultar resumos, sem ler/serializar conteúdo do projeto. Medir tamanho persistido, payloads e latência antes/depois de adicionar caches/ignorados volumosos; esse aumento não deve acrescentar conteúdo do projeto ao banco/artefatos de histórico nem aos payloads dessas consultas. Não definir SLA de latência não acordado. | US-16, US-18, US-23; AC-29; B03, B12 |
| RNF-02 | SQL e transações permanecem em storage; transações síncronas e curtas não esperam GH, seletor nativo ou OMP. Verificar que IO externo ocorre fora da transação e que falha de commit não retorna sucesso. | US-03, US-06, US-17, US-18; SPEC §8.4; B03, B04 |
| RNF-03 | Uma consulta de catálogo, status ou eventos não deve despachar trabalho, criar projeto nem consumir provider para testar acesso. Testes de chamadas controladas devem registrar zero desses efeitos em consultas e conclusão do onboarding. | US-03, US-04, US-14, US-22; F02, F11, F18 |

### 5.2 Segurança e autoridade

| ID | Requisito e verificação | Stories e fontes |
| --- | --- | --- |
| RNF-04 | Preservar loopback, Host/Origin exatos, cookie HttpOnly, CSRF e sessão técnica nas operações alteradas. Testes HTTP devem recusar leituras operacionais anônimas e mutações sem proteções exigidas, mesmo após liberar o favicon. A sessão não constitui identidade humana/GitHub. | US-06, US-18, US-21; SPEC §8.5; B11, B12 |
| RNF-05 | Descoberta de executável não concede acesso ao keyring. GH/Git devem usar o contexto Windows autorizado; falta de contexto recebe diagnóstico, sem novo login, alteração de credenciais ou troca global da conta para contornar a falha. | US-05 a US-07, US-22; F15, F18; B01, B05 |
| RNF-06 | Credenciais GitHub/provider, bootstrap Maestri e tokens de sessão/CSRF não podem aparecer em prompts, URLs, logs, relatórios, banco ou detalhes de suporte. Verificar saídas e DTOs com marcadores sintéticos de segredo. Retirar tetos de tokens não altera essa proteção. | US-01, US-05, US-12, US-22; F10; SPEC §8.5; B02, B05, B11 |
| RNF-07 | Seletores de pasta e EXE devem ser capacidades da composição confiável do host. React e contratos não executam IO nativo nem recebem credenciais; operações aceitam somente os dados necessários e continuam sujeitas à segurança HTTP. Verificar fronteiras e fluxos de cancelamento. | US-05, US-08; F06, F15; B01, B02, B04 |
| RNF-08 | Vínculo, onboarding e perfis não ampliam modos de publicação ou elegibilidade Ready. Preservar revalidação de conta, assignee exclusivo, Project e issue antes dos efeitos pertinentes; suíte padrão não publica recursos externos. | US-04, US-06, US-15, US-23; F18; AC-05, AC-21 |

### 5.3 Usabilidade e acessibilidade

| ID | Requisito e verificação | Stories e fontes |
| --- | --- | --- |
| RNF-09 | Toda ação e campo do wizard/modal/tela Perfis deve possuir nome acessível computado e operação por teclado. Registrar foco inicial, Tab/Shift+Tab, Escape, confirmação de descarte e retorno ao acionador no Chrome de teste. | US-03, US-04, US-13, US-16, US-20; AC-27, INT-11; B07 |
| RNF-10 | Registrar viewport, conteúdo e screenshots das telas afetadas em desktop/celular e em zoom nativo Chrome, verificando acesso aos campos e ações sem corte/sobreposição impeditiva. Medir contraste das combinações corrigidas e dos estados pertinentes; CSS zoom ou amostra vazia não substitui a prova. | US-20, US-23; F17; AC-27, INT-11; B12 |
| RNF-11 | Save, polling e reconexão não devem trocar seleção histórica, interromper a leitura ou substituir campos locais. Validar com edição aberta, falha de seção/continuação e resposta tardia de outro contexto. | US-18, US-19, US-23; SPEC §9; B06, B11 |

### 5.4 Confiabilidade e integridade

| ID | Requisito e verificação | Stories e fontes |
| --- | --- | --- |
| RNF-12 | Mutação aceita deve permanecer consultável após resposta perdida e reabertura do controlador, sem segundo efeito. Testar recibo recuperado e conflito de revisão com duas abas; aplicar também ao vínculo que muda o escopo de conta de nulo para vinculado. | US-06, US-18; F12, F15; B03, B06 |
| RNF-13 | Nome normalizado de perfil deve ser único sob duas gravações concorrentes; exclusão/tipo não pode romper referência inserida durante um modal aberto. Testes transacionais devem confirmar exatamente um nome aceito e recusa dos impedimentos atuais. | US-13, US-17; F11, F14; B03 |
| RNF-14 | Configuração capturada por tentativa deve permanecer inalterada após edição/exclusão permitida de perfis ou mudança de defaults. Checks/revisão/publicação usam a versão de entrega pertinente, sem recapturar clone mutável. | US-15, US-17, US-18, US-24; AC-04; SPEC §5.2; B08, B09 |
| RNF-15 | Lock local e worker único devem sobreviver à retirada de host manual. Testar recusa de segundo processo da mesma instalação, múltiplas UIs sem worker adicional e preservação de histórico após pausa/restart. Não prometer coordenação distribuída. | US-09, US-23; F04; AC-21; B01, B03 |
| RNF-16 | Fechamento de transporte deve finalizar a espera com diagnóstico ou encerramento esperado comprovado. Regressões devem preservar cursor, UTF-8, resync e idempotência, sem esperas indefinidas ou supressão genérica de erro. O aceite Chrome é separado do smoke local. | US-19, US-23; F16; AC-24, INT-13; B11 |
| RNF-17 | Caminho do banco deve ser derivado da instalação, sem depender do cwd, diretório pessoal ou override distribuído. Testar dois cwd e tentativa de override; fixtures podem usar seam interna temporária sem expô-la à distribuição. Não apagar a instalação atual nem esvaziar banco desconhecido. | US-10; F07; B01, B03 |

### 5.5 Manutenção e evidências

| ID | Requisito e verificação | Stories e fontes |
| --- | --- | --- |
| RNF-18 | Preservar TypeScript strict, contratos TypeBox sem IO e interfaces públicas por módulo. `typecheck`, `lint`, testes e build devem passar para a implementação; não introduzir `any`, supressões, catálogo paralelo, framework novo ou infraestrutura sem necessidade do pacote. | Todas as histórias de código; SPEC §8; B01 a B12 |
| RNF-19 | Evidência deve identificar comando, contexto, versão, saída, resultado e limites. Fixture, smoke e fonte lida não são prova de provider/GitHub/browser. Revisão da versão é independente e não altera os fontes avaliados; correções requerem outra versão. | US-19, US-22 a US-24; F16, F18, F19 |

## 6. Deltas explícitos e invariantes

| Discovery | Contrato/base atual afetada | Delta a formalizar sem reescrita silenciosa |
| --- | --- | --- |
| F01, F03, F05, F12 | SPEC §§1.3/9, AC-27; B06/B10 | Linguagem humana, ajuda de campos e suporte recolhido; conservar códigos e recibos internamente. |
| F02 | SPEC §§3.3/9, AC-04/27 | Wizard inicial persistido em três etapas, supressão e marco de conclusão distinto de problemas futuros. Não é o wizard de scaffold. |
| F04 | SPEC §§3.3/4.3/8.4/9, AC-21 | Identidade local automática substitui host manual; conservar lock, worker e revalidação de conta. |
| F06, F07 | SPEC §§3.2/3.3/8.4; B01/B04 | Pasta selecionável de projetos e banco fixo têm finalidades distintas; contexto Maestri herdado e futura instalação limpa. |
| F08, F09, F10 | SPEC §§3.3/4.1/5.3, AC-04 | Dois tempos em minutos positivos/decimais, TTL explicado e separado, retirada dos tetos financeiros/tokens. |
| F11, F13, F14 | SPEC §§3.3/5.1/9, GLOSSARY Perfil/Papel, INT-04 | Tipo de perfil, catálogo suportado, ausência de esforço, modal/tela, unicidade e regras de integridade. Catálogo indisponível difere de modelo ausente. |
| F15 | SPEC §§3.3/4.1/4.3/5.1, AC-05/21; B01/B05 | Descoberta de GH anterior ao wizard e vínculo explícito da conta observada, sem alterar conta global ou conceder autoridade extra. |
| F16, F17 | SPEC §§8.5/9/10.2, AC-24/27, INT-11/13 | Diagnóstico/correção comprovados do smoke; favicon/contraste; reconexão e demais percursos reais em aceite posterior. |
| F18, F19 | SPEC §§5.2/10.2/10.3, anexo §§5/8 | Roteiros integrados com alvos autorizados e revisão por referência imutável; resultados locais e aceite integral separados. |

Permanecem os três modos de entrega, elegibilidade Ready/assignee/Project, reconciliação de efeitos incertos, revisão independente e publicação dos bytes aprovados. A retirada de tetos de inferência não remove limites de segurança HTTP, tamanho de payload, paginação, rate limit ou backoff. A instalação limpa não autoriza persistir checkout, índice, caches ou ignorados como backup em SQLite/JSON/artefatos auxiliares.

## 7. Dependências e plano de comprovação

### 7.1 Dependências funcionais

1. Contratos, persistência e composição de instalação/identidade/perfis sustentam os fluxos visuais: US-05 a US-10 e US-13 a US-17.
2. Wizard depende de vínculo GitHub, pasta validada e criação dos dois tipos de perfil; conclusão e supressão têm persistência própria. Gestão posterior continua nas telas correspondentes.
3. Tempos e retirada de tetos atravessam contratos, preparação, medições, início e detalhes; esconder campo isoladamente não atende US-12.
4. US-18 é transversal a todos os novos saves. A mudança de escopo de conta no vínculo exige atenção à consulta do recibo aceito e aos ETags/cursors antigos.
5. US-19 depende de reprodução da falha, sem causa pré-atribuída. Favicon/contraste têm correções locais próprias, sem depender de executar providers.
6. Provas integradas e revisão imutável dependem da versão entregue, alvos/contexto e autorizações próprios. Prepará-las não as dispara.

### 7.2 Validação local prevista

A avaliação local independente lê os fontes e executa os checks pertinentes aos critérios locais fornecidos, sem editar os fontes para corrigir ou aprovar. Artefatos próprios gerados pelos checks são permitidos e não autorizam alteração dos fontes avaliados. Falta de permissão de edição dos fontes não é impedimento dessa avaliação; indisponibilidade técnica concreta para leitura ou execução dos checks deve ser registrada com seus limites. Essa avaliação local permanece distinta da revisão posterior da entrega imutável de US-24.

| Superfície | Comprovação necessária | Base existente a evoluir |
| --- | --- | --- |
| Configuração, onboarding e vínculo | Passagem por etapa, conclusão/supressão independentes, transação/recibo/CAS, conta observada distinta de vinculada, resposta perdida após vínculo e troca recusada com tentativa sem resultado final, inclusive suspensa/em pergunta, em checks, revisão ou publicação; tentativa encerrada com limpeza incerta não impede a troca apenas pela limpeza. | `tests/integration/projects.test.ts`, `operation-diagnostics.test.ts`, testes de storage e GitHub. Novos testes seguem a organização existente. |
| Bootstrap e instalação | Precedência GH: PATH, GH_PATH, caminho salvo e seleção manual; validar cada candidato e seguir a busca se inválido; reabertura reutiliza caminho salvo, caminho salvo inválido permite nova seleção; versionamento observado, seletor controlado, ausência de caminho GH prévio, banco fixo com outro cwd e sem override, lock preservado, schema incompatível diagnosticado. | `tests/config.test.ts`, `tests/integration/startup.test.ts`, `scripts/start-host.mjs`, `scripts/smoke-distribution.mjs`. |
| Pasta | Cancelamento, escolha válida, falta de acesso/gravação, nova verificação e alteração da raiz sem mover projeto existente. | Seam de host controlada, contratos de projects e storage. Seletor Windows real permanece confirmação nativa própria. |
| Perfis | Catálogo carregado/indisponível/vazio, modelo salvo ausente, esforço não aplicável, combinações dependentes, nome normalizado concorrente, vínculos de projeto, exclusão/tipo e snapshot ativo preservado; exclusão recusada por perfil capturado em qualquer papel de tentativa sem resultado final, inclusive suspensa/em pergunta, checks, revisão ou publicação; encerrada com limpeza incerta permite exclusão se não houver outro impedimento; padrão de projeto bloqueia independentemente. Formulário compartilhado conserva Orientação opcional no wizard sem exigir preenchimento para concluir. | Testes de execution/storage; `tests/integration/projects.test.ts`, `preparations.test.ts`, `attempts.test.ts`. |
| Estados web | Rascunhos por contexto, falha de save distinta de catálogo, resposta tardia, conflito de duas abas, filtros/contagens e confirmação durável. | `tests/web-state.test.ts`, `save-lifecycle.ts` e testes determinísticos pertinentes. Não declarar aceite visual por esses testes. |
| Tempos e remoção de tetos | Preenchimento/apresentação em minutos, incluindo 2, 5 e 30; 15.000 ms para 0,25 minuto; 0,5 minuto para 30.000 ms; 2,5 minutos para 150.000 ms; 0,00005 minuto para 3 ms sem recusa espúria por ponto flutuante; recusa de 0,000001 minuto e 35.792 minutos sem arredondar, com mensagem no campo em minutos; round-trip sem perda dos valores salvos, inclusive 1 e 2.147.483.647 ms, e recusa de valores abaixo/acima da faixa; TTL/espera separados e inalterados; contratos/runtime sem exigência de tetos. | `tests/integration/preparations.test.ts`, `questions.test.ts`, `storage/measurements.ts` e contratos compartilhados. |
| HTTP/SSE | Reprodução da falha e causa, smoke completo, fechamento esperado/inesperado, cursor, resync e comandos não repetidos. | `tests/integration/event-stream-timeout.test.ts`, `controller.test.ts`, `scripts/smoke-compiled.mjs`, `useControllerEvents.ts`. |
| Favicon e segurança | Recurso estático válido sem sessão, API operacional ainda recusando anônimo, sem exposição de arquivo privado. | `tests/integration/static-assets.test.ts`, `http-security.test.ts`. |
| Persistência | Medições antes/depois com caches volumosos, payloads leves, ausência de conteúdo de projeto no histórico. | `tests/acceptance/persistence-audit.test.ts`, `persistence-report.test.ts` e scripts de prova existentes. |

Comandos configurados para a implementação: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`. Para F16, acrescentar `npm.cmd run test:compiled` depois do build. Conforme a superfície afetada, usar os scripts existentes `test:execution-compiled`, `test:verification-compiled`, `test:distribution` e `test:persistence`. Aguardar cada conclusão e registrar saídas reais. Nenhum desses comandos foi executado nesta geração documental.

### 7.3 Aceite posterior e identificação dos roteiros

| Posição histórica | Identificador interno | Título obrigatório no registro | Cobertura |
| --- | --- | --- | --- |
| S20 | sprint-018 | Primeira fatia | US-23, critérios 1 e 2. |
| S23 | sprint-021 | Publicação na interface | US-23, critério 3. |
| S26 | sprint-024 | Fila | US-23, critério 4. |
| S34 | sprint-032 | Aceite transversal | US-20, US-21, US-23, critério 5, e US-24. |

Cada prova exige contexto efetivo próprio. UI usa Playwright MCP/Google Chrome e perfil de teste, com conteúdo e screenshots observados e fechamento apenas dos recursos iniciados pelo teste. O percurso Maestri/OMP usa integração nativa; quando o acesso de ensaio partir do LionClaw, segue `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` e os helpers existentes. A ausência de `MAESTRI_PIPE` no shell externo não comprova indisponibilidade. O Wire não substitui a conexão nativa do produto.

Registrar separadamente: resultado local, aceite visual, aceite Maestri/OMP/Git/GitHub e revisão da referência imutável. Falha local reproduzida exige correção local; falta de acesso externo mantém a respectiva prova pendente. Se o mecanismo de avaliação aceitar apenas PASS/FAIL, o veredito deve declarar seu escopo local e a pendência externa deve ficar fora dele, sem simular um estado não suportado ou criar infraestrutura para isso.

### 7.4 Matriz de cobertura do discovery

| Origem | Stories | Requisitos principais |
| --- | --- | --- |
| F01 | US-01 | RF-01, RF-02 |
| F02 | US-03, US-04, US-18 | RF-09 a RF-27; RNF-03, RNF-12 |
| F03 | US-01 | RF-01, RF-03, RF-04 |
| F04 | US-09 | RF-48, RF-49; RNF-15 |
| F05 | US-02 | RF-06, RF-07 |
| F06 | US-08 | RF-12, RF-43 a RF-47; RNF-07 |
| F07 | US-10 | RF-50 a RF-54; RNF-17 |
| F08 | US-11 | RF-55 a RF-58 |
| F09 | US-02, US-11 | RF-08, RF-59 |
| F10 | US-12 | RF-60 a RF-62; RNF-06 |
| F11 | US-13 a US-15 | RF-63, RF-66 a RF-81; RNF-13, RNF-14 |
| F12 | US-01, US-18 | RF-05, RF-97; RNF-12 |
| F13 | US-13, US-03 | RF-13, RF-64, RF-65; RNF-09 |
| F14 | US-15 a US-17 | RF-63, RF-78, RF-82 a RF-93; RNF-13, RNF-14 |
| F15 | US-05 a US-07 | RF-28 a RF-42; RNF-05, RNF-08, RNF-12 |
| F16 | US-19 | RF-98 a RF-100, RF-109; RNF-16 |
| F17 | US-20, US-21, US-23 | RF-101, RF-102, RF-106; RNF-04, RNF-09, RNF-10 |
| F18 | US-22, US-23 | RF-103 a RF-106, RF-109; RNF-08, RNF-19 |
| F19 | US-24 | RF-107 a RF-109; RNF-14, RNF-19 |

## 8. Limites desta especificação

A superfície exata de catálogo OMP ainda precisa ser confirmada pela implementação nos mecanismos suportados. O documento exige o comportamento de F11 sem inventar comando, endpoint, SDK ou capacidade já comprovada. Também não predetermina a causa da falha HTTP/SSE.

O pacote preserva o design aprovado com os deltas explícitos de wizard, modal e tela Perfis. As correções de contraste devem ser conciliadas nesse contrato visual; não se acrescenta redesenho geral, autenticação humana, execução em máquinas remotas, migração da instalação atual, infraestrutura distribuída ou nova ferramenta de configuração de MCP.

Esta entrega é documental. Não declara implementação, correção do smoke, aceite de navegador, integração real ou revisão imutável concluídos.
