# Feedback para próximo pacote de features

Registro incremental de problemas de produto observados durante a exploração. Estas notas orientam um pacote futuro e não alteram, por si só, os critérios normativos da `SPEC.md`.

## 2026-10-17

### 1. Mensagens da interface e bloqueios devem ser claros e em português brasileiro

**Problema observado:** telas de bloqueios e diagnósticos exibem códigos internos como `ACCOUNT_UNOBSERVED`, estados em inglês como `blocked` e linhas “Requisitos: RF-81, RF-88”, sem explicar claramente o problema ao operador.

**Comportamento esperado:** todas as mensagens da interface devem estar em português brasileiro, mantendo em outro idioma somente nomes técnicos necessários. Apresentar um título claro, por exemplo **Conta GitHub não vinculada**, uma descrição simples do que falta e a próxima ação necessária. Não exibir códigos internos, estados em inglês nem identificadores de requisitos `RF-*` na interface do operador.

### 2. Configuração inicial deve conduzir o usuário

**Problema observado:** quando o ambiente está incompleto, o usuário precisa explorar as telas para descobrir o que configurar.

**Comportamento esperado:** exibir no Dashboard um wizard curto, simples e objetivo em um modal enquanto houver configurações iniciais pendentes. Como visão de configuração inicial, mostrar o que falta fazer e oferecer a ação **Verificar status do GitHub**, que executa as verificações do GitHub CLI e da conta autenticada descritas no item 15. Deve também permitir configurar a localização dos projetos por um botão que abre o Explorador de Arquivos do Windows, sem exigir que o usuário digite o caminho. O operador pode fechar o modal; ao retornar à tela Principal, o wizard reaparece enquanto houver pendências, salvo se **Não exibir novamente** estiver marcado. Essa opção suprime exibições futuras mesmo que ainda existam configurações pendentes.

**Fluxo aprovado do wizard:** três etapas curtas, nesta ordem:

1. **Conectar GitHub:** oferecer **Verificar status do GitHub**, mostrar a conta ativa pelo login e permitir **Vincular conta**, conforme o item 15. Quando faltar instalação ou autenticação, explicar como resolver e permitir verificar novamente.
2. **Escolher a pasta dos projetos:** oferecer **Selecionar pasta** pelo seletor do Windows, mostrar o caminho escolhido e confirmar que a fábrica consegue acessar e gravar na pasta.
3. **Configurar os perfis:** consultar o catálogo do OMP e apresentar as pendências **Criar perfil Implementador** e **Criar perfil Revisor**. Reutilizar o formulário de perfis dentro desta etapa, sem exigir saída do wizard. Se o OMP estiver indisponível, oferecer **Tentar novamente**.

**Navegação entre etapas:** cada etapa deve ser resolvida e salva antes de permitir avançar para a seguinte. Não permitir pular etapas pendentes, inclusive pela navegação direta entre etapas. Permitir voltar às etapas anteriores.

**Conclusão e retomada:** salvar cada etapa, permitir voltar e retomar nas pendências. Ao concluir, mostrar **Configuração inicial concluída** e **Ir para Projetos**. Enquanto a configuração inicial estiver pendente, exibir um botão **Configuração inicial** no Dashboard para reabrir o wizard caso o usuário tenha fechado o modal, inclusive após marcar **Não exibir novamente**. Após concluir a configuração inicial, o botão não deve mais ser exibido. Fechar o modal segue a regra de reapresentação descrita acima.

**Fechamento com alterações pendentes:** preservar as etapas já salvas. Ao tentar fechar o wizard com alterações ainda não salvas, como um perfil parcialmente preenchido, pedir confirmação com as ações **Continuar configurando** e **Descartar alterações**. Ao reabrir, retomar a primeira etapa incompleta.

**Critérios de conclusão:** considerar a configuração inicial concluída somente quando houver conta GitHub vinculada e validada, pasta dos projetos selecionada com acesso e gravação confirmados e pelo menos um perfil Implementador e um Revisor cadastrados. Persistir esse marco de conclusão. Se alguma configuração apresentar problemas posteriormente, mostrar a pendência no Dashboard, sem reabrir o wizard nem voltar a exibir o botão **Configuração inicial**.

**Falha ao salvar:** se falhar o salvamento de uma etapa ou perfil, manter os campos preenchidos, explicar a falha e permitir tentar novamente. A etapa só avança após salvar.

**Pendências posteriores à conclusão:** mostrar no Dashboard a causa e uma ação para a tela correspondente: GitHub, pasta dos projetos ou Perfis.

**Limites do wizard:** criar ou vincular projetos ocorre depois, com as escolhas próprias de repositório, GitHub Project e execução. Tempos, orientações avançadas e modos de entrega ficam fora do wizard. Concluir a configuração inicial não inicia execução nem liga a automação.

### 3. Registros e diagnósticos precisam de linguagem compreensível

**Problema observado:** a interface de registros e diagnósticos expõe códigos e campos internos em inglês, por exemplo `MAESTRI_CONTEXT_CONFIRMED`, `Verificação · succeeded`, `passed`, `expectedAccountId`, `observedHost` e `profileCount`. Também mostra identificadores `RF-*` sob “Requisitos”. Sem contexto, não fica claro o significado desses dados.

**Comportamento esperado:** apresentar estados, descrições e orientações em português brasileiro; evitar nomes internos de campos e não mostrar a seção “Requisitos” com códigos `RF-*` ao operador. Explicar o significado e a próxima ação sem alterar nomes técnicos necessários para identificar ferramentas, como GitHub CLI ou OMP.

### 4. A fábrica deve usar automaticamente a máquina local como executora

**Problema observado:** a configuração expõe “Host executor designado” e pede que o operador escolha uma máquina, embora a fábrica seja local e execute somente no computador em que está rodando.

**Comportamento esperado:** capturar automaticamente o nome do computador local e usá-lo internamente como identidade do executor. Não exigir cadastro ou designação manual, não oferecer seleção de outra máquina e não exibir ao operador campos ou rótulos de host executor. A fábrica roda localmente e não coordena execução em outras máquinas.

### 5. A configuração global precisa explicar o propósito e o uso dos campos

**Problema observado:** vários campos da configuração global não explicam para que servem, se são obrigatórios ou se podem ficar vazios. O usuário precisa pedir explicações campo a campo para saber o que preencher.

**Comportamento esperado:** cada campo deve informar seu propósito, quando precisa ser preenchido, o formato ou exemplo esperado e o efeito de alterar seu valor. A tela também deve destacar o que é obrigatório para começar e o que pode permanecer no padrão.

### 6. Seleção da raiz dos projetos deve abrir o Explorador de Arquivos

**Problema observado:** a raiz dos projetos exige que o usuário digite um caminho local.

**Comportamento esperado:** oferecer um botão para abrir o Explorador de Arquivos do Windows e selecionar a pasta, sem digitação manual do caminho.

**Alteração posterior:** ao alterar a pasta dos projetos depois da configuração inicial, usar a nova pasta somente para novos projetos. Projetos já cadastrados mantêm seus caminhos. Não mover arquivos automaticamente.

**Cancelamento da seleção:** manter a pasta anterior ao cancelar o seletor. Se não houver pasta configurada, a etapa continua pendente.

**Validação da pasta:** se a pasta não permitir gravação, explicar o problema e permitir selecionar outra pasta ou repetir a verificação. Não avançar até confirmar acesso e gravação.

### 7. Remover campos globais que o operador não precisa configurar

**Problema observado:** “Diretório de dados da instalação” aparece como editável, embora alterá-lo não mova o banco aberto. “Workspace Maestri ID” também aparece mesmo sem ser necessário para o fluxo atual.

**Uso atual verificado:** o valor editável de `maestriSettings.workspaceId` é persistido e devolvido pela configuração, mas não é consumido pelo fluxo de execução. O executor valida o contexto usando `MAESTRI_WORKSPACE_ID`, `MAESTRI_TERMINAL_ID` e `MAESTRI_PIPE` herdados do contexto local do Maestri.

**Comportamento esperado:** remover esses campos da configuração do operador. O banco deve ficar em `<raiz da instalação>/var/factory/factory.sqlite`, com o caminho resolvido a partir da raiz da instalação, independentemente do diretório de trabalho do processo. Esse caminho é fixo e não pode ser alterado por interface, configuração ou variável de ambiente; remover a possibilidade de substituição por `FACTORY_DATA_DIR`. Remover o campo editável “Workspace Maestri ID”; o contexto necessário para execução é herdado do Maestri local.

**Instalação limpa:** a instalação atual será descartada e a configuração começará do zero. Este pacote não precisa migrar os dados ou configurações da instalação atual. Esta decisão registra o escopo futuro e não executa o reset.

### 8. Exibir configurações de tempo em minutos

**Problema observado:** “Intervalo de consulta” e “Tempo ativo por passagem” são editados em milissegundos, unidade pouco prática para configuração humana.

**Comportamento esperado:** permitir preencher ambos em minutos e fazer a conversão internamente. Aceitar valores positivos, inclusive decimais, e mostrar a unidade junto ao campo.

### 9. Explicar o TTL de pergunta no próprio campo

**Problema observado:** o rótulo “TTL de pergunta” não explica seu efeito.

**Comportamento esperado:** informar que este valor define por quanto tempo uma pergunta do agente aguarda uma resposta antes de expirar.

### 10. Remover limites de custo e de tokens

**Problema observado:** existe uma configuração de limite de custo sem medição autoritativa para aplicá-la, e o operador não se recorda de ter solicitado limites financeiros ou de tokens.

**Comportamento esperado:** remover do produto a configuração e a lógica de qualquer teto de dinheiro ou tokens. Não mostrar limites financeiros/tokenizados em configurações, preparações ou detalhes de tentativas. Limites de tempo, como tempo ativo e TTL de perguntas, continuam sendo controles separados.

### 11. Criar perfis em um modal e carregar opções do OMP

**Problema observado:** “Adicionar perfil” não apresenta um fluxo guiado, e Provider, Modelo e Esforço exigem que o operador saiba quais valores digitar.

**Comportamento esperado:** abrir um modal com os campos necessários para criar o perfil. Provider, Modelo e Esforço devem oferecer listas preenchidas com as opções descobertas no OMP.

**Perfis iniciais:** não provisionar automaticamente perfis globais de **Implementador** e **Revisor**. A lista começa vazia e exibe somente os perfis cadastrados pelo operador.

**Perfis necessários para execução:** antes de executar, exigir pelo menos um perfil **Implementador** e um **Revisor**. Se o operador tentar executar sem ambos, mostrar um modal de erro com um botão que leva à tela **Perfis**.

**OMP indisponível:** se o catálogo estiver vazio ou não puder ser consultado, informar claramente **OMP indisponível**. Bloquear a criação de perfis e alterações de provider, modelo e esforço até carregar as opções. Em perfis existentes, permitir editar nome e orientação, preservando a configuração salva.

**Modelo ausente do catálogo:** ao editar um perfil cujo modelo salvo deixou de aparecer no catálogo carregado do OMP, preservar e mostrar o valor salvo com um aviso. Permitir editar nome e orientação sem substituir esse modelo. Ao trocar provider, modelo ou esforço, exigir uma combinação disponível no catálogo atual.

**Início com modelo ausente:** se o catálogo consultado não contiver o modelo do perfil, bloquear o início da execução, explicar qual perfil precisa de atualização e oferecer acesso à edição e **Consultar catálogo novamente**.

**Início sem consulta disponível:** quando a consulta ao catálogo estiver indisponível, permitir tentar iniciar com a configuração salva do perfil. A indisponibilidade da consulta não comprova ausência do modelo. Se o OMP recusar a execução, mostrar a causa.

**Opções dependentes:** ao trocar provider ou modelo, preservar as escolhas compatíveis e limpar as que deixarem de ser válidas. Exigir o preenchimento das escolhas obrigatórias antes de salvar. Se o modelo não oferecer opção de esforço, mostrar **Não se aplica**, sem exigir seleção.

**Nomes únicos:** exigir nomes únicos entre os perfis globais, ignorando diferenças entre maiúsculas e minúsculas e espaços nas pontas.

### 12. Ocultar identificadores e metadados técnicos da interface do operador

**Problema observado:** telas comuns exibem detalhes internos como `Operação 1fd784e4-e6b6-41cc-9c75-9c1c041aa21b` e `ETag atual: f60c3a4d248725917fdac66bae6e33bad087ae1ce7d6b04564bf168e2bb48c4e`, que não ajudam o usuário a concluir sua tarefa.

**Comportamento esperado:** ocultar IDs de operação, ETags e metadados equivalentes da interface normal. Disponibilizá-los apenas em detalhes técnicos ou suporte quando forem necessários para diagnóstico.

### 13. Modal único para criar e editar perfis

**Comportamento esperado:** usar um modal centralizado, com fundo da tela escurecido, fundo claro, cantos arredondados, título à esquerda e botão de fechar no canto superior direito. O mesmo formulário atende criação e edição, ajustando título e texto do botão principal ao contexto.

O formulário contém, nesta ordem:

1. **Nome do perfil**, em largura total.
2. **Tipo do perfil**, em largura total.
3. **Executor**, em largura total.
4. **Provider** e **Modelo**, lado a lado.
5. **Esforço**, abaixo, alinhado à esquerda.
6. A ação **Consultar catálogo novamente**, associada às opções carregadas para Provider, Modelo e Esforço.
7. **Orientação**, em uma área de texto ampla.

O rodapé tem uma divisória e ações alinhadas à direita: **Cancelar** e o botão principal, **Criar perfil** ou **Salvar alterações**. Não incluir os blocos de informação técnica excluídos pelo usuário da referência visual.

### 14. Tela própria de Perfis Globais com busca, filtros e cartões

**Comportamento esperado:** mover a gestão de perfis para uma tela própria “Perfis Globais” no contexto de Workspace, com título e uma descrição breve de que os perfis são compartilhados entre projetos. A tela deve ter um item independente no menu, com ícone acessível e rótulo **Perfis** no padrão visual **ícone + texto**. Posicionar esse item imediatamente abaixo de **Vincular existente**. Exibir um painel central claro com botão **Novo perfil**.

No painel, incluir:

- Busca por nome ou orientação.
- Filtro de modelo, inicialmente em “Todos os modelos”.
- Abas de contagem **Todos**, **Implementador** e **Revisor**, com a aba selecionada destacada.
- Uma confirmação discreta quando a configuração for salva.
- Cartões de perfil em grade, com ícone, nome, provider, modelo, orientação, tipo, esforço e ações **Editar** e **Excluir**.

Os exemplos da referência mostram cartões para Implementador e Revisor, mas a lista deve refletir os perfis configurados. Não incluir os avisos informativos excluídos pelo usuário da referência visual.

**Exclusão:** impedir a remoção de um perfil enquanto uma execução ativa estiver usando-o ou enquanto estiver vinculado como padrão a algum projeto, mesmo sem execução ativa. Mostrar quais projetos usam o perfil como padrão e orientar a substituição nesses projetos antes de excluir.

**Confirmação de exclusão:** quando não houver impedimentos, pedir confirmação identificando o perfil pelo nome. Após excluir, atualizar a lista e as contagens. Permitir excluir o último Implementador ou Revisor, avisando na confirmação que novas execuções ficarão bloqueadas até cadastrar outro perfil desse tipo. Essa exclusão não reativa o wizard nem desfaz seu marco de conclusão.

**Sem resultados:** quando busca e filtros não encontrarem perfis, mostrar **Nenhum perfil encontrado** e oferecer **Limpar filtros**.

**Edição durante execução:** permitir editar um perfil enquanto uma execução o utiliza. As alterações valem somente para próximas execuções; a execução em andamento mantém a configuração com que começou.

**Mudança de tipo:** bloquear a alteração do tipo de um perfil enquanto estiver vinculado como padrão a algum projeto. Mostrar quais projetos precisam ter o perfil substituído antes da mudança de tipo. Os demais campos continuam editáveis, respeitando a regra de edição durante execução.

### 15. Oferecer uma ação clara para vincular a conta GitHub

**Severidade:** bloqueador grave de implementação. Sem vincular a conta, não é possível configurar e operar o fluxo GitHub da fábrica.

**Problema observado:** o dashboard pede para vincular a conta GitHub observada e exibe `ACCOUNT_UNOBSERVED`, mas a Configuração global não oferece um campo ou ação para selecioná-la. Ao executar a checagem de identidade, o controller encontrou a conta autenticada no GitHub CLI, mas marcou o resultado como divergente porque a conta esperada continua ausente. A interface expôs apenas o ID interno da conta, sem o login legível. O diagnóstico apenas compara a identidade observada com a já configurada; não faz o vínculo. O fluxo atual deixa o operador sem um caminho visível para resolver o bloqueio.

**Uso atual verificado:** a Fila Ready já consulta a identidade autenticada pelo GitHub CLI e exibe o login observado. Essa observação não grava a conta como vinculada: a fábrica mantém um `accountId` configurado separado e exige que ele corresponda ao ID observado. A Fila Ready também avalia separadamente host correspondente, modos autorizados, pausa da automação e issues elegíveis. Na tela observada, o host correspondia, mas não havia modos autorizados, a fila estava pausada e havia zero itens elegíveis; vincular a conta não resolve esses outros estados.

**Comportamento esperado:** reutilizar a identidade já observada pela Fila Ready, exibir o login legível e oferecer uma ação explícita para selecioná-la e salvá-la como conta vinculada à fábrica, sem exigir que o operador copie IDs internos. Manter a revalidação como ação distinta para confirmar posteriormente que a identidade continua correspondente.

**Detecção do GitHub CLI:** procurar `gh.exe` no `PATH` efetivo da fábrica; se não encontrar, verificar se `GH_PATH` aponta para um executável existente. Se a instalação tiver ocorrido enquanto a fábrica estava aberta e o `PATH` ainda não refletir a mudança, orientar o reinício da fábrica e repetir a detecção. Como último recurso, oferecer **Localizar `gh.exe`** pelo Explorador de Arquivos e guardar o caminho para verificações futuras. Confirmar que o executável pode rodar com `gh --version`. Se não for possível localizá-lo, informar claramente que a fábrica não conseguiu identificar o GitHub CLI. Variáveis de autenticação como `GH_TOKEN` e `GITHUB_TOKEN` não identificam a instalação do executável.

**Seleção da conta:** considerar somente contas autenticadas no `github.com`. Consultar as contas reportadas pelo GitHub CLI e exibir uma lista mostrando somente o login. Permitir selecionar somente contas com autenticação válida e ativa. Contas inativas ou com falha de autenticação não podem ser selecionadas. Para usar uma conta guardada, mas inativa, orientar o usuário a ativá-la no GitHub CLI e repetir a consulta; a fábrica não deve trocar a conta ativa global do CLI. Se o CLI estiver instalado, mas não houver conta válida e ativa, informar que o usuário precisa entrar no GitHub CLI para continuar e permitir repetir a verificação após o login.

**Divergência de conta:** se a conta ativa do GitHub CLI diferir da vinculada, mostrar ambas e bloquear novas execuções que dependam do GitHub até regularizar. Não substituir o vínculo automaticamente.

**Troca durante execução:** bloquear a troca da conta vinculada enquanto houver execução ativa, até seu encerramento.

**Revalidação em 17/10/2026, após 23:14:** o controlador em execução retornou conta observada presente e conta vinculada ausente. O contrato `GlobalChanges` não oferece o vínculo e `writeGlobals` não atualiza `account_id`. O item permanece um bloqueador de implementação, mesmo com Maestri e GitHub CLI acessíveis. Não contornar por edição direta do banco.

### 16. Investigar o encerramento de conexões HTTP/SSE

**Problema observado:** `npm.cmd run test:compiled` alcançou o loopback, mas terminou com exit 1 e `TypeError: terminated`, causado por `UND_ERR_SOCKET` e fechamento da conexão pelo outro lado. Na exploração Playwright também ocorreu `ERR_INCOMPLETE_CHUNKED_ENCODING` no stream; posteriormente a interface mostrou eventos conectados. Ainda não foi demonstrado que as duas ocorrências têm a mesma causa nem se o defeito está no produto ou no smoke.

**Trabalho pendente:** isolar a etapa e a causa do fechamento, distinguir término esperado de falha e corrigir o componente responsável. Reexecutar o smoke completo e verificar reconexão/resync no navegador, sem duplicar mutações nem perder o contexto de leitura. Não suprimir o erro apenas para obter PASS.

**Evidência:** `docs/integration/first-slice/20261017-04/report.md`, adendo após 23:14; `docs/integration/acceptance-transversal/visual-evidence.md`.

### 17. Completar a verificação visual e tratar os achados observados

**Achados observados:** links laranja sobre branco e texto branco sobre a navegação laranja tiveram contraste amostrado de **2,91:1**, em textos de 13–14 px. Requisições automáticas a `/favicon.ico` retornaram `401`. Tratar a legibilidade conforme os requisitos normativos e conciliar eventual mudança visual com o design aprovado; resolver a requisição do ícone sem liberar leituras da API.

**Já verificado:** as seis abas renderizaram em desktop (1440×900) e celular (390×900), sem overflow horizontal da página nas amostras. No modal de cadastro, Tab manteve o foco dentro do modal, Escape fechou e o foco voltou ao botão de origem. Os recibos históricos exibiram revisão e cursor. Isso é prova parcial, não aceite integral das jornadas.

**Validações pendentes:** zoom nativo do Chrome; acessibilidade e contraste dos demais estados; sobreposição/corte nas jornadas com dados; paginação com múltiplas páginas; falha isolada de seção/continuação; conflitos entre abas; capacidades alteradas com diálogo aberto; pergunta expirada ou respondida por outra aba com preservação do rascunho. A simulação CSS a 200% já executada não substitui zoom nativo. Não usar fixtures ou ausência de dados como prova desses cenários reais.

**Evidência:** `docs/integration/acceptance-transversal/visual-evidence.md`, rodada de 23:10–23:12 e screenshots referenciados em `.playwright-mcp/`.

### 18. Executar as provas integradas ainda pendentes do pipeline

**Referências corretas:** S20 exibida = `sprint-018` (primeira fatia); S23 = `sprint-021` (publicação na interface); S26 = `sprint-024` (fila); S34 = `sprint-032` (aceite transversal). Identificar os registros também pelo título, sem presumir igualdade entre posição na interface e ID interno.

**Provas pendentes:**

- **Primeira fatia:** cadastro preservando origem dirty, clone próprio, implementação e resultado durável, checks, revisão independente e ICR; perfil efetivo, TUI e chamada MCP/GitNexus útil; pergunta/resposta na mesma passagem, entrega incerta sem reenvio cego, cancelamentos representativos e restart/nova tentativa em outro ambiente.
- **Publicação:** modos ICR, Commit e PR com a mesma versão aprovada; reconciliação e resposta perdida sem duplicar commit, PR ou comentário nem reexecutar implementação.
- **Fila:** consumo único, revalidação de autoridade, projeção e preservação de tentativa/histórico após pausa e restart.

**Pré-requisitos:** resolver o vínculo da conta do item 15, definir projeto/repositório/Project/issues de teste, perfis dos dois papéis e autorização delimitada dos efeitos externos e uso de provider. Nesta revisão havia zero projetos e zero tentativas, automação desabilitada e despacho pausado. O registro destas provas não autoriza sua execução. A autorização dos ensaios não reintroduz limites financeiros ou de tokens no produto, cuja remoção está aprovada no item 10.

**Impedimentos superados:** o acesso Wire e a inicialização nativa do controlador no Maestri foram observados neste host; Playwright/Chrome está acessível. Os smokes locais de transporte UTF-8/frames/EOF/lançamento Windows e checks/integridade passaram. Esses resultados não substituem execução real do OMP/provider, materialização Git nem publicação GitHub. O antigo `EACCES` de loopback não descreve a falha atual de HTTP/SSE do item 16.

### 19. Revisar a versão entregue por referência Git imutável

**Pendência de entrega:** a revisão independente precisa identificar uma referência Git imutável que represente o conteúdo efetivamente avaliado. Um HEAD anterior não identifica alterações locais posteriores; hashes de arquivos e relatórios históricos não substituem essa referência.

**Trabalho pendente:** preparar a versão pelo fluxo Git autorizado, executar os checks e revisar independentemente essa referência. Preservar achados anteriores e vincular correções a outra versão e avaliação. Não criar commit, tag, push ou aprovação de gate por efeito deste registro.

**Evidência:** `docs/integration/acceptance-transversal/independent-review.md`. A disponibilidade do Maestri e do navegador não resolve por si só essa pendência.

## 2026-10-18

### 20. Não bloquear o uso por versão do OMP

**Decisão explícita do usuário:** não impor travas de versão do OMP. Não exigir igualdade com uma versão fixa nem rejeitar a instalação apenas por sua versão diferir da usada no desenvolvimento.

**Comportamento esperado:** verificar as capacidades e os contratos necessários à operação solicitada. Se faltar uma capacidade ou houver incompatibilidade concreta, explicar a causa e a ação pertinente. A versão observada pode constar de diagnóstico e evidência, sem se tornar uma trava por número. Não ampliar esta decisão para as demais dependências nem remover a validação do perfil efetivo ou dos contratos de resultados.
