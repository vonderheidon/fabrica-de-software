# Nova fábrica de software — User stories e requisitos

Data: 16/10/2026. Fase: elaboração de requisitos a partir do discovery. Situação: documento para validação, sem aprovação presumida, início de execução ou Design Lock.

## 1. Fontes, alcance e convenções

Fonte de entrada: [discovery20261016_073031.md](discovery20261016_073031.md), incluindo suas decisões, limites e referência a [stories.md](stories.md). Detalhamentos e critérios de comprovação foram conferidos na [SPEC](../../SPEC.md), na [integração Maestri/OMP](../../INTEGRACAO-MAESTRI-OMP.md) e no [glossário](../../GLOSSARY.md). Os documentos da raiz permanecem normativos. Este arquivo não altera seus contratos nem declara critérios satisfeitos.

Os IDs US, RF e RNF são internos a este documento. AC e INT identificam os critérios normativos existentes. Os critérios de aceite abaixo são verificações futuras; não representam resultados obtidos nesta execução.

**Persona principal:** operador técnico que conduz issues executáveis do GitHub, configura projetos e acompanha a esteira local com Maestri/OMP no Windows. A conta GitHub autenticada do controlador determina a responsabilidade pela execução.

**Vocabulário:** projeto cadastrado não é GitHub Project; tentativa tem ambiente e configuração próprios; rodada é um ciclo de implementação, checks e revisão dentro da tentativa; passagem é a atuação de um papel na rodada. ICR significa implementação, verificações e revisão independente, sem commit de entrega. Versão de entrega identifica conteúdo imutável no Git, não apenas o HEAD do clone de trabalho.

As indicações de interface descrevem padrões funcionais e estados necessários. Não definem layout, cores, tipografia, composição visual nem aprovação de design. A TUI é a interação nativa do OMP no terminal Maestri; não há requisito de criar chat ou terminal web próprios.

## 2. User stories por domínio

### 2.1 Projetos e criação

#### US-01 — Cadastrar e consultar projetos existentes

Como operador técnico, quero cadastrar uma origem Git e consultar os projetos cadastrados, para preparar trabalho sem alterar minha pasta de desenvolvimento.

**Interface necessária:** lista de projetos, formulário Conectar e detalhe do projeto com estado dos pré-requisitos.

**Critérios de aceite:**

1. O formulário aceita nome, origem local ou remoto GitHub e branch-base; a identidade GitHub é obtida por URL/IDs, não pelo nome da pasta.
2. Cadastrar uma origem local com alterações não commitadas preserva bytes, índice e HEAD dessa origem, sem stash, reset, commit ou limpeza.
3. O cadastro local sem remoto é permitido e informa que apenas o histórico commitado pode entrar na tentativa.
4. Projeto sem remoto GitHub confirmado, GitHub Project configurado ou vínculo da issue permanece configurável, mas não inicia nem conclui entrega em nenhum dos três modos.
5. O catálogo permite abrir a configuração do projeto e distingue o projeto cadastrado do GitHub Project associado.

**Rastreabilidade:** AC-01, AC-05; SPEC §§3.1 e 9.

#### US-02 — Criar projeto com efeitos escolhidos

Como operador técnico, quero escolher a modalidade de criação e revisar seu plano, para obter um projeto com exatamente os efeitos locais e remotos autorizados.

**Interface necessária:** formulário de criação, plano de efeitos e estado de conclusão com acesso ao projeto.

**Critérios de aceite:**

1. O formulário oferece somente local, remoto sem push e remoto com push; contém nome, template, destino editável dentro da raiz de projetos configurada e branch-base efetiva, revisável antes de Criar.
2. Owner, nome remoto e visibilidade são solicitados nas modalidades remotas; a sugestão de owner não sobrescreve edição manual.
3. Antes de Criar, o plano apresenta destino canônico, template identificado, arquivos, configuração de engenharia, branch-base, conta/owner e efeitos previstos. Consultar o plano não produz efeitos.
4. Criar autoriza uma única vez o plano apresentado. A revalidação recusa destino existente, escape por junction/symlink, recurso obrigatório ausente, template inválido ou mudança inicial de conta/plano antes de escrever.
5. As três modalidades geram arquivos, Git e baseline Conventional Commit na branch-base escolhida, usada também no cadastro do projeto; somente as modalidades remotas criam remoto/origin, e somente remoto com push publica o baseline nessa branch.
6. O scaffold gera configuração de engenharia conforme a referência setup-matt-pocock-skills, com tracker GitHub, orientação de domínio, seção Agent skills e triagem quando aplicável. Usa AGENTS.md preservando instruções existentes, sem duplicar seções, copiar/instalar skills ou criar labels remotas implicitamente.
7. A conclusão mostra pasta, baseline, branch-base resultante e remoto/publicação efetivos e permite abrir o projeto; não inicia issue ou sessão operacional.

**Rastreabilidade:** AC-02, AC-05; SPEC §3.2. A referência à skill é requisito do scaffold, não instrução para executar seu setup nesta fase.

#### US-03 — Inspecionar criação parcial

Como operador técnico, quero consultar os efeitos confirmados e pendentes de uma criação que falhou, para decidir sua recuperação preservando os arquivos existentes.

**Interface necessária:** detalhe da criação parcial, lista de efeitos e diagnóstico.

**Critérios de aceite:**

1. Falha após um efeito exibe o que foi criado, o que falhou e o que continua desconhecido, sem informar sucesso integral.
2. Arquivos e efeitos confirmados são preservados; não há rollback destrutivo, adoção automática de remoto existente ou repetição cega.
3. Resposta perdida ou estado remoto incerto exige consulta/reconciliação antes de repetir o efeito correspondente.

**Rastreabilidade:** AC-03, AC-12; SPEC §§3.2 e 6.1.

### 2.2 Configuração

#### US-04 — Configurar um projeto

Como operador técnico, quero editar as escolhas de execução do projeto, para reutilizá-las nas próximas tentativas sem alterar tentativas em andamento.

**Interface necessária:** formulário de configuração do projeto, estados de gravação e conflito de edição.

**Critérios de aceite:**

1. É possível configurar origem/base, GitHub Project e Status, perfis de Implementador/Revisor, checks com diretório relativo, limite de correções, modo padrão, automação e ordem na fila.
2. Projects pessoais e organizacionais acessíveis pela conta podem ser associados; campos/opções são mapeados por IDs, sem criação remota implícita.
3. O limite de correções tem padrão 2 e aceita valores de 0 a 5; a rodada inicial é 1 e não consome uma correção.
4. A interface distingue salvando, salvo e erro; salvo só aparece após confirmação da persistência.
5. Em conflito entre duas abas, o formulário preserva o rascunho local e permite recarregar os dados atuais, reaplicar as alterações desejadas e salvar com o controle de versão existente. Novo conflito preserva novamente o rascunho; Salvo só aparece após persistência confirmada. Não se exige comparador ou merge campo a campo nem manipulação de revisão numérica pelo operador.
6. Alterar defaults não modifica a configuração capturada por tentativa ativa.

**Rastreabilidade:** AC-04, AC-08; SPEC §§3.3, 4.4 e 5.3.

#### US-05 — Configurar host e perfis reutilizáveis

Como operador técnico, quero configurar o host executor e perfis exatos dos papéis, para executar as tentativas com as escolhas informadas.

**Interface necessária:** configuração global, formulário de perfil e identificação da conta/host em uso.

**Critérios de aceite:**

1. A configuração global permite informar host designado, diretórios, integração Maestri, perfis, defaults de tempo e política de artefatos previstos no contrato; os limites efetivos de tempo ativo, TTL da pergunta e custo são apresentados separadamente no detalhe da tentativa, conforme RF-61.
2. Cada perfil registra executor, provider, modelo, esforço e orientação; a primeira entrega usa maestri-omp.
3. A execução confere o perfil efetivo e informa incompatibilidade sem fallback silencioso ou imposição do perfil usado nos ensaios.
4. A interface informa que há um host executor designado por conta e que clientes adicionais acessam a mesma instância; não promete eleição distribuída.

**Rastreabilidade:** AC-04, AC-21; INT-04; SPEC §§3.3 e 4.3.

### 2.3 Preparação e fila

#### US-06 — Preparar e iniciar manualmente uma issue

Como operador técnico, quero selecionar uma issue e revisar seus parâmetros, para iniciar uma tentativa com escopo e efeitos explícitos.

**Interface necessária:** formulário de preparação com projeto, issue, modo, orientação opcional e diagnóstico de pré-requisitos.

**Critérios de aceite:**

1. A issue tem título, objetivo/escopo e critérios em lista Markdown sob Critérios de aceite ou Acceptance criteria; IDs ausentes são atribuídos por ocorrência, inclusive para textos repetidos.
2. O primeiro início exige issue aberta, Ready, pertencente ao repositório/Project configurados, exatamente um responsável igual à conta autenticada e ausência de bloqueadores abertos.
3. Ausência de remoto confirmado, Project, vínculo da issue, base, configuração ou ferramenta indispensável impede o despacho e indica a correção necessária, sem preflight pago de providers.
4. Iniciar aguarda gravação confirmada da preparação e captura issue, critérios, base e escolhas efetivas da tentativa.
5. Uma ação de início cria uma tentativa identificável antes do lançamento; após resposta perdida, consultar a mesma requisição informa o resultado sem criar outro clone/processo.
6. Comentário livre não altera o escopo capturado. Diante de mudança semântica dos critérios, a decisão humana pode manter o escopo original e permitir continuidade dentro dele; adotar os novos critérios exige atualização no GitHub e outra tentativa, sem substituir os critérios capturados na tentativa atual.

**Rastreabilidade:** AC-05, AC-20; SPEC §§2 e 5.1.

#### US-07 — Consultar elegibilidade da fila Ready

Como operador técnico, quero visualizar as issues elegíveis e seus impedimentos, para compreender qual trabalho pode ser selecionado automaticamente.

**Interface necessária:** lista de próximas issues, motivos de inelegibilidade e estado da consulta GitHub.

**Critérios de aceite:**

1. Só são elegíveis issues abertas no repositório/Project configurados, Ready, com exatamente um assignee igual ao ID da conta autenticada e sem bloqueador aberto.
2. Issues sem responsável ou com outro responsável não são selecionadas; múltiplos responsáveis exibem motivo de inelegibilidade. Polling não atribui responsáveis.
3. Drafts e cards de PR não são tratados como issues de implementação; bloqueador de uma issue não torna todo o Project indisponível.
4. Todos os itens pertinentes são paginados; consulta parcial, autenticação incorreta ou rate limit não autorizam despacho e têm diagnóstico visível.
5. Ready observado antes ou depois da atribuição resulta na mesma elegibilidade quando a condição completa é observada.

**Rastreabilidade:** AC-19, AC-22; SPEC §4.1.

#### US-08 — Habilitar, pausar e acompanhar a fila

Como operador técnico, quero habilitar ou pausar a fila e conhecer sua ordenação, para controlar novos inícios sem repetir issues já consumidas.

**Interface necessária:** controle da automação, resumo da quantidade elegível e lista ordenada com o critério utilizado.

**Critérios de aceite:**

1. Antes de habilitar, a interface apresenta a quantidade atual de issues elegíveis e informa que a ativação autoriza seu enfileiramento.
2. Pausar impede novos inícios e mantém a tentativa vigente; retomar preserva consumo e histórico. Há no máximo um trabalho automático ativo inicialmente.
3. A ordenação usa prioridade configurada quando disponível, posição do quadro quando documentada e desempate por número/ID; sem ordem disponibilizada pela API, usa número crescente e informa esse critério.
4. Polling, restart, resposta perdida, falha de projeção ou permanência em Ready não criam outra tentativa de um ciclo já consumido.
5. Falha/cancelamento não dispara retry automático. Novo ciclo automático exige observar saída de Ready e posterior retorno elegível; transições offline não são reconstruídas.
6. Alterar prioridade afeta somente trabalho ainda não iniciado; candidatos aguardando por ocupação ou indisponibilidade de leitura são reconsiderados em consulta válida posterior.

**Rastreabilidade:** AC-19–AC-21; SPEC §§4.1–4.3.

#### US-09 — Acompanhar responsabilidade e divergência do Kanban

Como operador técnico, quero identificar mudanças externas de responsável ou Status, para evitar que a fábrica prossiga com autoridade desatualizada.

**Interface necessária:** indicador de conta, aviso de divergência e detalhe do impedimento com ação requerida.

**Critérios de aceite:**

1. Conta, responsável, Project, issue aberta e Status são revalidados antes do despacho e da publicação conforme a etapa.
2. Troca da conta autenticada pausa novos despachos; mudança de responsável em tentativa ativa revoga publicação e solicita cancelamento, preservando trabalho.
3. Mudança de coluna incompatível suspende avanço e mostra Divergência do Kanban com Status observado, Status esperado para a etapa e orientação para corrigir no GitHub. A ação Revalidar reutiliza as verificações existentes de conta, responsável, Project, issue e Status; só libera continuidade se a divergência estiver resolvida e a autoridade válida, sem outra suspensão impeditiva. Cancelar permanece disponível; mudança de responsável segue o cancelamento do critério 2. Não sobrescrever o quadro à força nem assumir card In progress de outra máquina.
4. In progress representa implementação/checks/correção; In review representa revisão; Delivered só é projetado após concluir o modo de entrega. Done não é movido automaticamente.
5. Reprovação não devolve automaticamente a Ready; falha ao atualizar o Project preserva o resultado e não reexecuta a tentativa.
6. A orientação de transferência entre contas exige encerrar/cancelar a tentativa anterior antes de atribuir e rearmar Ready, explicitando a ausência de lock atômico entre instalações.

**Rastreabilidade:** AC-12, AC-19–AC-22; SPEC §§4.3–4.4.

### 2.4 Execução, verificação e revisão

#### US-10 — Interagir na sessão operacional real

Como operador técnico, quero abrir a sessão real do papel no Maestri, para conversar e usar a TUI do OMP durante o trabalho e após o resultado.

**Interface necessária:** ação Abrir terminal e estado de conexão; interação pela TUI nativa, sem terminal ou chat web próprio.

**Critérios de aceite:**

1. O controlador inicia pelo terminal-âncora dentro do Maestri e confirma uma consulta real com o contexto herdado; contexto ausente ou inválido recebe diagnóstico.
2. Cada papel/passagem usa sessão operacional real, no ambiente correto e com o perfil escolhido, sem execução escondida em paralelo a uma TUI decorativa.
3. Conversa, comandos, ferramentas nativas, regras, skills, LSP e MCPs normais continuam utilizáveis durante trabalho, pergunta e após resultado.
4. A ferramenta MCP necessária realiza uma chamada útil no runtime; erro de argumento corrigível não encerra automaticamente a tentativa. Servidor desabilitado não é reativado silenciosamente.
5. GitNexus, quando requerido, usa raiz/índice do clone pertinente; índice da pasta do operador não é aceito como substituto.
6. Abrir terminal só fica disponível no contexto que suporte a abertura da sessão nativa no host executor. Nos demais contextos, a interface informa o motivo e orienta usar o Maestri no host executor, sem criar acesso remoto. A mesma regra vale para Abrir pasta na US-19.

**Rastreabilidade:** AC-15, AC-23, AC-25; INT-01–INT-05, INT-09, INT-10, INT-12, INT-14.

#### US-11 — Obter uma versão verificável da implementação

Como operador técnico, quero acompanhar a implementação e sua versão de entrega, para identificar exatamente o conteúdo submetido aos checks e à revisão.

**Interface necessária:** detalhe da tentativa com versão, arquivos/diff, checks, evidências e ação Repetir captura em caso de falha técnica.

**Critérios de aceite:**

1. Cada tentativa usa clone próprio e base SHA fixa, sem adotar a pasta do operador, importar suas alterações não commitadas ou atualizar silenciosamente a base.
2. O resultado oficial da implementação cobre todos os IDs de critérios capturados; texto de conversa ou fim de turno não equivale a resultado.
3. A captura ocorre após terminar escritas/processos próprios da passagem e antes de checks/revisão, preservando alterações pertinentes, inclusões não ignoradas, exclusões, renomes e modos de arquivo.
4. A versão é imutável no Git e não depende do índice mutável da implementação; caches, ignorados e segredos conhecidos não são coletados automaticamente como entrega.
5. Checks configurados são executados pela fábrica sobre essa versão, com resultados e evidências consultáveis; a declaração do papel não os substitui.
6. Falha técnica de captura preserva o trabalho e permite repetir a captura sem reiniciar a implementação. Conteúdo incompatível recebe diagnóstico antes de ser considerado revisável.

**Rastreabilidade:** AC-06, AC-09, AC-13, AC-29; INT-06, INT-18; SPEC §§5.2 e 5.4.

#### US-12 — Receber revisão independente e correções limitadas

Como operador técnico, quero revisão independente da versão entregue e correções dentro do limite configurado, para obter um resultado sustentado por critérios e achados verificáveis.

**Interface necessária:** detalhe da revisão, lista de achados, resultados por critério e histórico de rodadas.

**Critérios de aceite:**

1. O Revisor usa sessão e clone independentes da versão capturada, sem receber a conversa do Implementador; alteração do produto pelo Revisor invalida o parecer.
2. A revisão cobre exatamente os criterionIds capturados, sem IDs duplicados, e apresenta veredito/evidência por critério e achados com problema, evidência e resultado esperado.
3. Aprovação exige todos os critérios aprovados, nenhum achado novo impeditivo e resolução independente dos impedimentos anteriores; reprovação informa problema concreto.
4. A rodada inicial é 1; reprovação abre correção na mesma tentativa enquanto houver limite disponível, com nova versão, checks e outra revisão independente após cada correção.
5. Pergunta humana não consome correção. Ao esgotar o limite, pendências e resultados anteriores permanecem consultáveis, sem declarar entrega aprovada.
6. Aprovação técnica permanece distinta da conclusão da publicação e da limpeza dos recursos.

**Rastreabilidade:** AC-07–AC-09, AC-13; INT-03, INT-06, INT-18.

### 2.5 Decisões e recuperação

#### US-13 — Responder uma decisão pendente

Como operador técnico, quero responder perguntas vinculadas à passagem em andamento, para resolver decisões sem perder o trabalho ou reiniciar a sessão.

**Interface necessária:** estado Aguardando resposta, detalhe da pergunta, formulário de resposta e recibo de entrega.

**Critérios de aceite:**

1. A pergunta formal apresenta decisão, contexto e alternativas, vinculada à tentativa/passagem; a validação verifica formato/vínculo sem classificador semântico de manutenção.
2. A espera pausa avanço automático e publicação, mantém a fase e não bloqueia TUI, ferramentas ou conversa.
3. A resposta segue à mesma passagem acompanhada e possui recibo. Se a entrega for incerta, mantém-se a pausa e consulta-se o recibo antes de outro envio.
4. Conversa livre no terminal não resolve implicitamente a pergunta; resultado oficial durante pergunta pendente recebe diagnóstico corrigível.
5. Tempo de espera humana é separado do tempo ativo; pergunta não consome correção. O detalhe apresenta os tempos, TTL da pergunta e limites efetivos de tempo/custo conforme RF-61, com expiração registrada e solicitação de parada distinta de parada confirmada. Orientação que mantém o escopo capturado pode continuar; adotar novo escopo exige atualização no GitHub e outra tentativa.
6. Dificuldade operacional recuperável é tratada dentro do escopo; impossibilidade técnica informa causa, ações tentadas e requisito afetado, preservando trabalho, sem pedido genérico de permissão para bloquear.

**Rastreabilidade:** AC-14–AC-15; INT-05, INT-07, INT-10; SPEC §5.5.

#### US-14 — Cancelar e conhecer a situação da parada

Como operador técnico, quero cancelar a tentativa e consultar seus efeitos e recursos pendentes, para interromper a continuidade sem confundir solicitação com parada confirmada.

**Interface necessária:** ação Cancelar, estado Cancelamento solicitado, resultado e estado de limpeza.

**Critérios de aceite:**

1. Cancelar impede novos avanços e efeitos de publicação da fábrica e solicita parada dos recursos próprios conhecidos.
2. Lançamento conhecido que retorna após o cancelamento é registrado e recebe solicitação de parada, sem nova criação para compensar resposta perdida.
3. A interface distingue pedido aceito, parada confirmada e limpeza incerta; ausência de confirmação não apaga o clone nem anuncia parada global.
4. Recursos manuais não são alvos de parada por nome de executável ou varredura.
5. Efeito remoto já enviado pode concluir; o resultado confirmado é registrado e exibido, e os efeitos seguintes permanecem impedidos. Cancelamento não promete rollback.
6. A comprovação futura contempla cancelamento durante inicialização e durante trabalho com processo filho, registrando o que efetivamente parou e os limites observados.

**Rastreabilidade:** AC-16, AC-26; INT-15–INT-16; SPEC §7.

#### US-15 — Iniciar outra tentativa após falha ou interrupção

Como operador técnico, quero revisar parâmetros e iniciar outra tentativa em ambiente separado, para continuar o trabalho preservando o histórico anterior.

**Interface necessária:** estado Interrompida/Falhou/Cancelada, ação Nova tentativa e formulário com parâmetros revisáveis.

**Critérios de aceite:**

1. Perda de acompanhamento interrompe a coordenação automática correspondente e preserva arquivos/resultados; reinício do controlador torna trabalho não terminado interrupted.
2. Reinício não restaura conversa, provider ou autoridade anterior; resultados antigos não aprovam outra tentativa e abrir a UI não recruta sessões.
3. Nova tentativa explícita usa issue e base atuais, parâmetros revisáveis, outro clone/processo e nenhum reaproveitamento das alterações ou da sessão anteriores.
4. A nova tentativa verifica origem, vínculos, responsabilidade e ausência de tentativa ativa da issue; não exige retorno a Ready nem reset de equipe/liberação de reserva.
5. Ambiente residual não bloqueia toda a fábrica quando a separação dos efeitos próprios estiver comprovada. Limpeza incerta não autoriza exclusão automática.
6. Remoção explícita de ambiente requer confirmação de parada dos recursos próprios e indicação do que será perdido; histórico/resultados não são apagados junto por acidente.

**Rastreabilidade:** AC-17–AC-18, AC-26; INT-08, INT-16–INT-17; SPEC §7.

### 2.6 Entrega e publicação

#### US-16 — Entregar no modo autorizado

Como operador técnico, quero escolher o modo de entrega e consultar seus resultados, para obter ICR, commit local ou PR com os efeitos correspondentes à minha escolha.

**Interface necessária:** seletor de modo na preparação, resumo de efeitos e detalhe de entrega com commit/PR quando aplicáveis.

**Critérios de aceite:**

1. ICR disponibiliza versão aprovada, diff, evidências e ambiente sem commit de entrega; ICR + Commit acrescenta Conventional Commit local sem push; ICR + Commit + PR acrescenta push e PR aberta.
2. O modo é capturado no início; escolher PR autoriza o push necessário sem confirmação duplicada. No detalhe de entrega aprovada de tentativa encerrada, Aumentar modo permite escolher um modo superior, apresenta os efeitos adicionais e os autoriza em uma única confirmação, reutilizando o fluxo de publicação e suas revalidações. Usa a mesma versão aprovada e preserva efeitos confirmados; impedimentos são informados. Concluir publicação permanece a ação para efeitos pendentes já autorizados, sem wizard adicional.
3. Commit/publicação materializam somente a versão imutável aprovada em ambiente privado; alterações posteriores do clone de implementação não entram na entrega.
4. PR aponta à branch-base e apresenta escopo, base/versão, checks, parecer, pendências não impeditivas e identificação da tentativa; não há force-push, merge, auto-close ou movimentação automática para Done.
5. Nos modos sem PR, resultado/evidências são registrados em comentário identificado da fábrica, sem editar checkboxes do corpo da issue. Código permanece local nesses modos.
6. Entrega sem delta exige evidência e revisão; commit/PR vazios não são fabricados e os efeitos correspondentes aparecem como não aplicáveis, com motivo.
7. Remoto GitHub confirmado, Project e vínculo da issue são exigidos e revalidados em todos os modos; aprovação técnica isolada não conclui modo PR com efeitos pendentes.

**Rastreabilidade:** AC-09–AC-11, AC-13; INT-18; SPEC §§2 e 6.

#### US-17 — Reconciliar e concluir publicação pendente

Como operador técnico, quero consultar efeitos incertos e concluir apenas os pendentes autorizados, para recuperar a entrega sem duplicar recursos ou reimplementar o código.

**Interface necessária:** lista de efeitos por estado, diagnóstico e ação Concluir publicação quando elegível.

**Critérios de aceite:**

1. Cada efeito possui intenção durável e identificador antes de execução; timeout após mutação permanece desconhecido até consulta, sem retry cego.
2. A reconciliação verifica identidade do commit, ref/SHA remoto, PR por repositório/head/base/marcador e comentários identificados; recurso apenas semelhante não é adotado.
3. Falha de publicação conserva aprovação, diff e efeitos confirmados, sem reiniciar implementação; Concluir publicação executa somente o restante após reconciliação.
4. O avanço exige versão aprovada, passagem de produção concluída, modo autorizado, responsabilidade/vínculos atuais e ausência de pergunta, cancelamento, interrupção não reconciliada ou efeito desconhecido incompatível.
5. Após restart, a conclusão requer ação explícita e revalidação; não restaura autoridade da sessão nem conclui automaticamente publicação cancelada.
6. Falha ao persistir intenção impede o próximo efeito; Delivered só é projetado quando o modo realmente estiver concluído.

**Rastreabilidade:** AC-10–AC-12, AC-18, AC-22; INT-18; SPEC §6.1.

### 2.7 Operação, histórico e diagnóstico

#### US-18 — Consultar a operação atual

Como operador técnico, quero consultar conta, host, fila e tentativa ativa, para identificar o andamento e a próxima ação necessária.

**Interface necessária:** painel de operação com resumo da esteira, lista de próximas issues e resultados/impedimentos recentes.

**Critérios de aceite:**

1. O painel mostra conta/host, automação ligada ou pausada, tentativa ativa, issues elegíveis e resultados/impedimentos recentes.
2. Iniciar, Pausar/Retomar e Abrir tentativa ficam disponíveis conforme o estado; pausar a fila não é apresentado como cancelamento da tentativa.
3. A fila é projeção do GitHub, sem editor paralelo de prioridades ou necessidade de selecionar terminais, PIDs, reservas ou gerações.
4. Loading, falha e ausência de dados são estados distintos com ação pertinente; falha de consulta não apaga erro de gravação nem indica criação concluída.

**Rastreabilidade:** AC-19, AC-21, AC-27; SPEC §9.

#### US-19 — Inspecionar tentativas e entregas anteriores

Como operador técnico, quero consultar o histórico e os detalhes de cada tentativa, para verificar critérios, decisões e conteúdo entregue mesmo após o término dos processos.

**Interface necessária:** lista de histórico, detalhe da tentativa, diff, checks, revisão, evidências e estados de efeitos/limpeza.

**Critérios de aceite:**

1. O detalhe mostra issue, modo, etapa, rodada, progresso, resultado, versão, diff, checks, parecer, achados, pergunta, commit/PR e efeitos aplicáveis.
2. Etapa, resultado final, revisão, publicação por efeito e limpeza são distinguíveis; limpeza incerta não apaga aprovação histórica.
3. Abrir terminal/pasta, Responder, Cancelar, Nova tentativa, Repetir captura, Revalidar divergência, Concluir publicação e Aumentar modo aparecem conforme a condição correspondente, sem exigir reset operacional. Abertura de terminal/pasta segue o contexto suportado da US-10; quando indisponível, informar o motivo e orientar usar o Maestri no host executor. Aumentar modo segue a US-16 e reutiliza publicação.
4. Histórico de rodadas, perguntas, resultados e efeitos permanece após encerramento ou restart; diff/evidências são obtidos sob demanda e continuam disponíveis após o término do runtime.
5. Artefato ausente ou com integridade inválida recebe diagnóstico em vez de conteúdo vazio ou evidência presumida.
6. Contexto de projeto/tentativa permanece na URL; polling/save não muda seleção nem interrompe a leitura de detalhe histórico, e reload não repete ações com efeitos.
7. O detalhe apresenta tempo ativo, espera humana, limites efetivos de tempo/custo e TTL da pergunta separadamente, além de expiração e estado de parada quando aplicáveis, conforme RF-61; não presume medições ausentes.

**Rastreabilidade:** AC-09, AC-18, AC-27, AC-29; INT-06, INT-18; SPEC §§5.3, 8.4 e 9.

#### US-20 — Consultar diagnóstico acionável

Como operador técnico, quero consultar a causa e os limites de uma falha de integração, para corrigir o pré-requisito ou escolher a recuperação permitida.

**Interface necessária:** seção de diagnóstico contextual com fatos, requisito afetado, recibos sanitizados e próxima ação pertinente.

**Critérios de aceite:**

1. Contexto Maestri ausente/inválido, perfil incompatível, ferramenta obrigatória indisponível, credencial ausente e perda de acompanhamento recebem diagnóstico concreto, sem alterar ACL/configuração global para contornar a falha.
2. Diagnóstico preserva o trabalho e distingue erro corrigível, decisão humana, impossibilidade técnica e efeito desconhecido; não oferece permissão genérica para bloquear.
3. Recibos e identificadores apresentados não expõem segredos nem permitem controlar processos por PID.
4. A interface apresenta somente ações compatíveis com o estado, sem afirmar sucesso, parada ou publicação que ainda não tenham confirmação.

**Rastreabilidade:** AC-14–AC-15, AC-24–AC-27; INT-02, INT-08, INT-13, INT-16; SPEC §§5.5 e 9.

## 3. Requisitos funcionais por domínio

Cada linha define uma obrigação verificável. Requisitos transversais de qualidade estão na seção 4. As referências US identificam as histórias relacionadas.

### 3.1 Projetos e scaffold

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-01 | Cadastrar projeto com nome, origem Git local ou GitHub e branch-base, identificando remoto por URL/IDs. | US-01 |
| RF-02 | Listar projetos cadastrados e permitir abrir sua configuração. | US-01 |
| RF-03 | Permitir cadastro local sem remoto, mantendo explícita a ausência dos pré-requisitos de execução. | US-01 |
| RF-04 | Obter apenas histórico commitado da origem local para o clone da tentativa, informando que alterações não commitadas ficam fora. | US-01, US-11 |
| RF-05 | Receber nome, template, destino, modalidade e branch-base efetiva revisável antes de Criar no formulário de criação, com campos remotos somente quando pertinentes. | US-02 |
| RF-06 | Gerar plano sem efeitos com destino canônico, identidade do template, arquivos, configuração de engenharia, branch-base, conta e efeitos previstos. | US-02 |
| RF-07 | Revalidar plano e destino antes da criação, recusando destino existente, escape de raiz, template inválido ou recurso obrigatório ausente. | US-02 |
| RF-08 | Gerar scaffold local com Git e baseline Conventional Commit na branch-base escolhida, mantendo a mesma escolha no cadastro do projeto. | US-02 |
| RF-09 | Criar remoto GitHub e associar origin somente nas modalidades remotas autorizadas. | US-02 |
| RF-10 | Publicar baseline na branch-base escolhida somente na modalidade remoto com push. | US-02 |
| RF-11 | Gerar a configuração de engenharia e apontadores previstos na referência do scaffold em AGENTS.md, preservando conteúdo e sem duplicar seções. | US-02 |
| RF-12 | Exibir a conclusão da criação com pasta, baseline, branch-base resultante e efeitos remotos confirmados, permitindo abrir o projeto. | US-02 |
| RF-13 | Apresentar efeitos confirmados, falhos e desconhecidos de uma criação parcial, preservando arquivos para inspeção. | US-03 |

### 3.2 Configuração e preparação

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-14 | Persistir a configuração global de host, diretórios, integração, perfis, defaults de tempo e política de artefatos. | US-05 |
| RF-15 | Persistir por projeto origem/base, Project/Status, perfis, checks, limite de correções, modo, automação e ordem na fila. | US-04 |
| RF-16 | Cadastrar perfis reutilizáveis com executor, provider, modelo, esforço e orientação exatos. | US-05 |
| RF-17 | Permitir associar Projects pessoais ou organizacionais acessíveis, mapeando opções de Status por ID. | US-04 |
| RF-18 | Configurar checks com diretório de execução relativo ao ambiente da tentativa. | US-04 |
| RF-19 | Configurar limite de correções entre 0 e 5, com padrão 2. | US-04, US-12 |
| RF-20 | Exibir estados salvando, salvo e erro de gravação, confirmando salvo apenas após persistência. | US-04, US-06 |
| RF-21 | Detectar conflito entre edições concorrentes, preservar o rascunho local e permitir recarregar dados atuais, reaplicar alterações desejadas e salvar com o controle de versão existente; novo conflito preserva novamente o rascunho e não informa Salvo. Não exigir comparador ou merge campo a campo. | US-04 |
| RF-22 | Capturar configuração efetiva, contratos, versões de ferramentas e origem das escolhas ao criar a tentativa. | US-04–US-06 |
| RF-23 | Preparar início manual por seleção de projeto, issue, modo e orientação opcional, aguardando save confirmado. | US-06 |
| RF-24 | Capturar identidade, corpo, referências, comentários pertinentes, dependências e critérios da issue, atribuindo IDs por ocorrência quando ausentes. | US-06 |
| RF-25 | Impedir início/entrega sem remoto GitHub confirmado, Project configurado e vínculo da issue, indicando o pré-requisito ausente. | US-01, US-06, US-16 |
| RF-26 | Validar issue aberta, responsabilidade exclusiva da conta, Ready no primeiro início e dependências antes do despacho. | US-06, US-07 |
| RF-27 | Registrar tentativa e consumo/intenção de despacho atomicamente antes de lançar clone ou processo. | US-06, US-08 |
| RF-28 | Permitir consultar o resultado de início pelo identificador da requisição após resposta perdida, sem novo despacho. | US-06 |
| RF-29 | Detectar mudança semântica dos critérios capturados; decisão humana de manter o escopo original permite continuar dentro dele. Adotar novos critérios exige atualização no GitHub e outra tentativa, sem substituir o escopo capturado nem incorporar escopo de comentário livre. | US-06, US-13 |

### 3.3 Fila e responsabilidade

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-30 | Selecionar automaticamente somente issues abertas, Ready, do repositório/Project configurados, com assignee único da conta e sem bloqueador aberto. | US-07 |
| RF-31 | Excluir drafts e cards de PR da seleção e informar a inelegibilidade por múltiplos responsáveis. | US-07 |
| RF-32 | Consultar os itens pertinentes com paginação completa e suspender despacho quando a leitura estiver parcial, degradada ou sem autenticação válida. | US-07 |
| RF-33 | Mostrar a quantidade elegível atual e o alcance da autorização antes de habilitar a automação. | US-08 |
| RF-34 | Pausar/retomar novos inícios sem cancelar a tentativa ativa nem apagar consumo. | US-08 |
| RF-35 | Ordenar candidatos pela prioridade configurada e ordem documentada disponível, com desempate por número/ID e fallback explícito para número crescente. | US-08 |
| RF-36 | Deduplicar consumo por projeto/issue/ciclo observado, sem novo despacho por polling, restart ou Ready residual. | US-08 |
| RF-37 | Rearmar ciclo automático somente após observar saída e retorno elegível a Ready, sem retry automático de falha/cancelamento. | US-08 |
| RF-38 | Revalidar conta, responsável, Project, issue e Status antes de despacho e publicação. | US-09, US-17 |
| RF-39 | Pausar despachos ao mudar conta autenticada e solicitar cancelamento com revogação de publicação ao mudar o responsável ativo. | US-09 |
| RF-40 | Suspender avanço por Status incompatível, mostrar Status observado/esperado e orientar correção no GitHub; oferecer Revalidar usando as verificações existentes de autoridade e Status, liberando continuidade só após resolver a divergência, sem outro impedimento. Manter Cancelar; mudança de responsável segue RF-39, sem tomar posse de trabalho de outra máquina. | US-09 |
| RF-41 | Projetar etapas nas opções configuradas de In progress, In review e Delivered conforme o modo efetivamente concluído. | US-09 |
| RF-42 | Registrar/reconciliar falha de projeção sem apagar resultado ou reiniciar o trabalho. | US-09, US-17 |

### 3.4 Execução e revisão

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-43 | Validar por consulta real o contexto herdado do terminal-âncora Maestri na inicialização. | US-10, US-20 |
| RF-44 | Iniciar sessão operacional OMP por papel/passagem no ambiente correto, conferindo o perfil efetivo sem fallback silencioso. | US-05, US-10 |
| RF-45 | Disponibilizar abertura da superfície nativa de interação da passagem somente em contexto suportado; quando indisponível, informar o motivo e orientar usar o Maestri no host executor, sem novo acesso remoto. | US-10, US-19 |
| RF-46 | Usar configuração/gerenciamento MCP normais do OMP e verificar ferramenta requerida por chamada útil no runtime. | US-10 |
| RF-47 | Usar a raiz e o índice do clone pertinente quando GitNexus for requerido. | US-10 |
| RF-48 | Criar clone independente por tentativa com branch gerenciada e base SHA fixa. | US-11 |
| RF-49 | Capturar versão imutável no Git após concluir escritas próprias e antes de checks/revisão, preservando conteúdo pertinente e sem alterar o índice da implementação. | US-11 |
| RF-50 | Executar checks configurados sobre a versão capturada e registrar resultados/evidências. | US-11 |
| RF-51 | Aceitar execution_complete somente com schema e vínculo válidos e cobertura exata dos critérios da passagem. | US-11, US-12 |
| RF-52 | Persistir resultado válido antes do recibo, devolver o mesmo recibo para repetição idêntica e diagnosticar conflito ou payload inválido corrigível. | US-11, US-12 |
| RF-53 | Repetir captura com falha técnica preservando trabalho, sem reiniciar a implementação. | US-11 |
| RF-54 | Executar revisão em clone/sessão independentes sobre a versão capturada, sem conversa do Implementador e invalidando parecer se o Revisor alterar o produto. | US-12 |
| RF-55 | Registrar parecer, evidência por critério e achados estruturados com identidade, problema, evidência e resultado esperado. | US-12 |
| RF-56 | Aprovar somente com todos os critérios aprovados, sem novos impedimentos e com achados impeditivos anteriores resolvidos independentemente. | US-12 |
| RF-57 | Abrir correção dentro do limite, produzindo nova rodada/versão, checks e revisão independente; preservar pendências quando esgotado. | US-12 |

### 3.5 Perguntas, cancelamento e recuperação

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-58 | Registrar execution_question com decisão, contexto, alternativas e vínculo à tentativa/passagem, validando schema e correlação. | US-13 |
| RF-59 | Pausar avanço/publicação enquanto houver pergunta pendente, sem bloquear TUI/ferramentas nem consumir correção. | US-13 |
| RF-60 | Entregar resposta formal à mesma passagem com recibo e manter pausa quando a entrega da resposta for incerta. | US-13 |
| RF-61 | Mostrar no detalhe tempo ativo e espera humana separados, limites efetivos de tempo/custo e TTL da pergunta, usando os dados disponíveis no runtime/estado existente. Distinguir limite não configurado de medição indisponível; registrar e mostrar expiração quando ocorrer e distinguir solicitação de parada de parada confirmada/limpeza incerta conforme US-14. Silêncio do terminal não prova falha. Indisponibilidade não dispensa medição ou verificação obrigatória: registrar causa, requisito afetado e pendência, sem declarar cumprimento. Não acrescentar dashboard financeiro, estimador, cobrança ou sistema de telemetria. | US-05, US-13, US-14, US-19 |
| RF-62 | Diagnosticar resultado enviado com pergunta pendente, permitindo correção sem encerrar automaticamente o runtime. | US-13 |
| RF-63 | Cancelar novos avanços/publicação e solicitar parada apenas dos recursos próprios conhecidos, incluindo lançamentos pendentes que retornem depois. | US-14 |
| RF-64 | Exibir pedido de cancelamento e estado de limpeza separadamente, registrando efeitos remotos que terminem após a solicitação. | US-14 |
| RF-65 | Interromper coordenação automática ao perder acompanhamento, preservando trabalho e resultados. | US-15 |
| RF-66 | Marcar trabalho não terminado como interrupted após restart, revogando autoridade antiga sem restaurar sessão/provider. | US-15 |
| RF-67 | Criar nova tentativa explícita com parâmetros revisáveis, issue/base atuais e outro ambiente, sem exigir Ready novamente nem tentativa ativa concorrente da issue. | US-15 |
| RF-68 | Permitir remoção explícita de ambiente somente após comprovar parada dos recursos próprios e informar perdas, preservando histórico/resultados. | US-15 |

### 3.6 Entrega e efeitos

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-69 | Concluir ICR disponibilizando versão aprovada, diff, evidências e ambiente, sem commit de entrega. | US-16 |
| RF-70 | Criar Conventional Commit local da versão aprovada no modo Commit, sem push. | US-16 |
| RF-71 | Fazer push da branch e abrir PR para a base configurada somente no modo PR autorizado. | US-16 |
| RF-72 | Incluir no corpo da PR escopo, base/versão, checks, parecer, pendências não impeditivas e identificação da tentativa. | US-16 |
| RF-73 | Registrar resultado/evidências dos modos sem PR em comentário identificado da fábrica, reconciliável por marcador da tentativa. | US-16, US-17 |
| RF-74 | Registrar commit/PR como não aplicáveis quando não houver delta aprovado, sem fabricar recursos vazios. | US-16 |
| RF-75 | Oferecer Aumentar modo no detalhe de entrega aprovada de tentativa encerrada: escolher modo superior, resumir efeitos adicionais e obter autorização única, reutilizando publicação e revalidações existentes. Usar a mesma versão aprovada, preservar efeitos confirmados e informar impedimentos; Concluir publicação trata os efeitos já autorizados. | US-16, US-19 |
| RF-76 | Materializar publicação exclusivamente da referência imutável aprovada em ambiente privado, sem recapturar o clone mutável. | US-16, US-17 |
| RF-77 | Registrar intenção e operationId antes de cada efeito, com estados distinguindo não solicitado, não iniciado, em andamento, confirmado, falha conhecida, desconhecido e não aplicável. | US-03, US-17 |
| RF-78 | Reconciliar efeitos desconhecidos por identidade de commit, ref/SHA, PR e marcador de comentário antes de repetir mutação. | US-03, US-17 |
| RF-79 | Concluir somente efeitos pendentes após checar aprovação, conclusão da passagem, autorização atual, vínculos e ausência de suspensão/efeito incompatível. | US-17 |
| RF-80 | Exigir ação explícita para concluir publicação após restart, conservando aprovação e efeitos confirmados sem reimplementar código. | US-17 |

### 3.7 Consulta e diagnóstico

| ID | Requisito | Histórias relacionadas |
| --- | --- | --- |
| RF-81 | Exibir no painel conta/host, automação, tentativa ativa, próximos candidatos e resultados/impedimentos recentes. | US-18 |
| RF-82 | Listar histórico de tentativas e permitir abrir seu detalhe sem substituir a consulta histórica pelo resumo da tentativa atual. | US-19 |
| RF-83 | Exibir no detalhe issue, modo, etapa/rodada, resultado, versão, checks, review, achados, pergunta, efeitos e limpeza, além de tempos, limites, TTL e expiração conforme RF-61. | US-19 |
| RF-84 | Carregar diff e evidências sob demanda, verificando integridade e diagnosticando artefato ausente/inválido. | US-19 |
| RF-85 | Disponibilizar ações da tentativa conforme seu estado: abrir terminal/pasta em contexto suportado (com motivo e orientação para usar Maestri no host quando indisponível), responder, cancelar, repetir captura, nova tentativa, revalidar divergência, concluir publicação e aumentar modo conforme RF-75. | US-19 |
| RF-86 | Preservar projeto/tentativa na URL e seleção de leitura durante polling/save. | US-18, US-19 |
| RF-87 | Apresentar estados carregando, vazio e erro com ação pertinente, distinguindo falha de leitura, gravação e criação. | US-18–US-20 |
| RF-88 | Exibir diagnóstico contextual com causa, requisito afetado, fatos/recibos sanitizados e recuperação pertinente. | US-20 |

## 4. Requisitos não funcionais

### 4.1 Desempenho e capacidade

| ID | Requisito e forma de verificação | Relacionado a |
| --- | --- | --- |
| RNF-01 | Listagens, histórico e polling devem ler resumos sem carregar/serializar conteúdo do projeto. No ensaio AC-29, registrar tamanho do banco e artefatos auxiliares, payloads e latência antes/depois de aumentar caches/ignorados volumosos; o aumento desses arquivos não deve aumentar conteúdo persistido nem payloads dessas consultas. Verificar também recuperação da entrega pelo Git. Não há teto de latência definido. | US-11, US-19; AC-29 |
| RNF-02 | O controlador não deve manter transação SQLite durante espera de provider/GitHub nem manter requisição HTTP aberta pela duração da tentativa. Verificar conclusão da requisição de início e consulta posterior do trabalho assíncrono. Prazo numérico de resposta não foi definido. | US-06, US-18; SPEC §§8.1 e 8.4 |
| RNF-03 | A primeira entrega deve limitar a um trabalho automático ativo e impedir segundo processo executor da mesma instalação/conta no mesmo host, independentemente de porta/projeto. Várias interfaces devem consultar a mesma instância, sem criar workers. Não há garantia distribuída entre instalações independentes. | US-05, US-08, US-18; AC-21 |
| RNF-04 | Polling deve ser configurável e aplicar backoff respeitando Retry-After/reset; despacho exige leitura válida e completa. A referência inicial de 15 s é recomendação da SPEC, não SLA. Verificar rate limit e consulta degradada sem novo despacho. | US-07–US-08; SPEC §4.1 |

### 4.2 Segurança e autorização

| ID | Requisito e forma de verificação | Relacionado a |
| --- | --- | --- |
| RNF-05 | O controlador HTTP deve escutar em loopback; mutações exigem JSON, sessão local/token CSRF e Origin local quando feitas pelo browser, com CORS fechado. Verificar rejeição das mutações sem os controles exigidos e ausência de despacho em GET. | US-04–US-06, US-18; SPEC §8.5 |
| RNF-06 | Tokens, credenciais, bootstrap e segredos de publicação não devem aparecer em URLs, prompts, argumentos de processo, logs ou artefatos, nem ser adicionados ao ambiente do agente pela fábrica. Verificar com marcadores sintéticos, sem utilizar segredos reais. Sessões/caches normais do OMP não são registros oficiais da fábrica. | US-05, US-10, US-20; SPEC §§8.4–8.5; integração §§1–3 |
| RNF-07 | Uma interface em outra máquina só pode usar conexão autenticada explicitamente provida; clientes não recebem bootstrap Maestri/provider. Binding externo sem autenticação/TLS próprios não é suportado; não provisionar túnel ou deployment remoto. Verificar que a instalação padrão não expõe porta pública. | US-05, US-18; SPEC §8.5 |
| RNF-08 | Efeitos devem respeitar plano/modo/ação autorizados, sem ampliar autoridade por acesso às ferramentas. Não executar merge, auto-close, force-push, Done automático ou edição de checkboxes da issue. Verificar ausência desses efeitos nos três modos e nas falhas de recuperação. | US-02, US-09, US-16–US-17; AC-02, AC-10–AC-12, AC-22 |
| RNF-09 | Cancelamento deve atingir somente recursos próprios conhecidos e preservar ambientes com parada incerta. Verificar os dois cenários representativos sem encerrar recursos manuais nem declarar contenção global de daemons/brokers. | US-14–US-15; AC-16, AC-26; INT-15–INT-16 |

### 4.3 Integridade, durabilidade e recuperação

| ID | Requisito e forma de verificação | Relacionado a |
| --- | --- | --- |
| RNF-10 | Cadastro e execução devem preservar bytes, índice e HEAD da origem do operador; clones não podem depender dessa pasta por hard links/alternates. Comparar a origem antes/depois do cadastro e percurso de execução com alterações não commitadas. | US-01, US-11; AC-01 |
| RNF-11 | Checks, revisão e publicação devem usar a mesma versão identificada por conteúdo; aprovação de uma versão não vale para outra. Verificar alteração posterior do clone mutável sem alteração dos bytes publicados e correção com nova versão/revisão. | US-11–US-12, US-16; AC-13; INT-18 |
| RNF-12 | Resultado, decisão, consumo e intenção de efeito devem ser duráveis antes da confirmação correspondente; falha de escrita não pode produzir ACK/sucesso falso nem autorizar próximo efeito. Verificar falhas de persistência e leitura posterior dos registros aceitos. | US-06, US-08, US-11, US-13, US-17; INT-06 |
| RNF-13 | Repetição da mesma operação e recuperação de resposta perdida não devem duplicar tentativa, resultado, commit, PR ou comentário. Verificar idempotência/recibo e reconciliação por identidade antes de repetir efeitos desconhecidos, dentro da instância suportada. | US-03, US-06, US-08, US-17; AC-05, AC-12, AC-20 |
| RNF-14 | Histórico, configurações capturadas, versões Git, resultados e efeitos confirmados devem sobreviver ao restart; sessão e autoridade antigas não devem ser restauradas. Verificar trabalho interrupted, recusa de vínculo antigo e nova tentativa independente. | US-15, US-17, US-19; AC-17–AC-18; INT-08, INT-17 |
| RNF-15 | Git deve guardar conteúdo versionado; persistência oficial deve guardar somente configuração, critérios, resultados, evidências pertinentes, estado e referências/hashes necessários. É vedado serializar checkout, índice, ignorados ou caches em banco, JSON, Base64 ou arquivos auxiliares, inclusive comprimidos/externos. Inspecionar armazenamento no ensaio AC-29. | US-11, US-19; AC-29 |
| RNF-16 | Evidências externas devem ter referência, checksum e tamanho; ausência/corrupção deve gerar diagnóstico. Migrations devem recusar banco desconhecido/mais novo sem substituí-lo por vazio. Verificar ambos os tipos de falha preservando os dados existentes. | US-19–US-20; SPEC §8.4 |

### 4.4 Usabilidade e acessibilidade

| ID | Requisito e forma de verificação | Relacionado a |
| --- | --- | --- |
| RNF-17 | As jornadas Projetos, Operação, Tentativa e Configuração devem ser utilizáveis em desktop e celular e cobrir os três modos. Na validação de UI pelo navegador de teste, registrar dimensões da viewport, conteúdo, ações, estados e screenshots; verificar acesso às ações pertinentes e legibilidade do conteúdo sem sobreposição ou corte que impeça seu uso. Por decisão superveniente do usuário, P7/F-06 está encerrado sem exigir definição adicional de larguras/resoluções de referência; não há aceite quantitativo ou visual declarado. | US-01–US-20; AC-27; INT-11 |
| RNF-18 | Ações e formulários devem ser operáveis por teclado, com foco visível e nomes acessíveis computados; verificar acionamento pelo teclado e registrar foco e nomes. Medir e registrar razões de contraste e percentuais de zoom utilizados, verificando acesso ao conteúdo e às ações nessas condições. Por decisão superveniente do usuário, P7/F-06 está encerrado sem exigir definição adicional de nível de conformidade, razões mínimas de contraste ou percentuais de zoom de referência. Medição indisponível registra causa e requisito pendente, sem dispensar a verificação obrigatória ou declarar aceite visual. Não acrescentar funcionalidades de produto para essas verificações. | US-01–US-20; AC-27; SPEC §9 |
| RNF-19 | Polling/save não devem mudar seleção ou interromper consulta histórica; conflito deve preservar rascunho e permitir recarregar dados atuais, reaplicar e salvar conforme RF-21; reload não deve repetir POST. Verificar esses estados em duas abas, inclusive novo conflito e Salvo somente após persistência, e durante leitura de tentativa anterior. | US-04, US-18–US-19; AC-04, AC-27 |
| RNF-20 | A operação normal não deve exigir seleção manual de terminais por rodada, preflight manual recorrente, ação para guardar versão, reset de equipe, liberação de reserva ou retorno a Ready para retry explícito. Verificar percurso integrado até entrega e outra tentativa. | US-06, US-10–US-19; SPEC §1.3; AC-17 |

### 4.5 Compatibilidade, portabilidade e manutenção

| ID | Requisito e forma de verificação | Relacionado a |
| --- | --- | --- |
| RNF-21 | O lançamento real no Windows deve preservar cwd/argv com espaços e Unicode e manter a TUI operacional; transporte de resultados deve preservar UTF-8, português e emoji fragmentados, encerrando esperas com diagnóstico em malformed/oversize/EOF. Verificar sem expor prompts grandes ou segredos em argumentos. | US-10, US-20; AC-24–AC-25; INT-13–INT-14 |
| RNF-22 | Recursos distribuídos, templates e configuração devem ser autocontidos/versionados e resolvidos por caminhos relativos ou runtime, sem dependência de diretórios pessoais ou deste workspace. Verificar scaffold em raiz distinta e falha anterior à criação se faltar recurso obrigatório. | US-02, US-05; AC-02 |
| RNF-23 | Preservar a stack já definida: TypeScript strict, Node.js 24 LTS inicialmente, Fastify, React/Vite e SQLite transacional com migrations; dependências fixadas em lockfile e produção compilada. A documentação não escolhe novas versões, frameworks ou serviços. | US-04–US-05, US-18–US-19; SPEC §8.1 |
| RNF-24 | O monólito modular deve manter SQL em storage, Maestri/OMP em execution, GH em github e representação Git em workspaces; contracts compartilhados não têm IO e UI não importa runtime interno. Verificar limites de imports e que novo check não exige alterar lifecycle; troca de executor/MCP não deve exigir SQL/UI internos. | US-10–US-12, US-19–US-20; AC-28 |
| RNF-25 | A suíte padrão deve ser determinística e não recrutar terminais, chamar providers ou provocar efeitos externos implicitamente. Aceite real requer autorização/custo conhecidos; UI usa Playwright MCP/Chrome de teste com inspeção de conteúdo, screenshot e fechamento. Compilação, catálogo de ferramentas e provas históricas não substituem comportamento real. | US-10–US-20; SPEC §10.2; INT-10–INT-11 |

## 5. Estados e padrões de interface exigidos

Esta relação orienta a identificação dos estados de produto sem impor composição visual.

| Jornada | Padrões funcionais | Estados indispensáveis |
| --- | --- | --- |
| Projetos | Lista, formulário Conectar, criação com plano, detalhe/configuração | Carregando, vazio, erro de consulta, local sem pré-requisitos, criação em andamento, parcial e concluída |
| Configuração | Formulários globais, perfis e projeto | Editando, salvando, salvo, erro, conflito com rascunho preservado e recarga dos dados atuais para reaplicar/salvar |
| Preparação | Seleção de issue, formulário e resumo de efeitos | Pronto para iniciar, pré-requisito ausente, aguardando save, início registrado/consultável |
| Operação | Painel, lista de elegíveis e resultados recentes | Automação ligada/pausada, consulta degradada, inelegibilidade, tentativa ativa; divergência com Status observado/esperado, correção no GitHub, Revalidar e Cancelar |
| Tentativa | Detalhe, diff, checks, revisão/achados, pergunta/resposta, efeitos, tempos e limites conforme RF-61 | Etapas preparing/implementing/verifying/reviewing/publishing/finished; suspensão com motivo/ação; revisão pending/approved/rejected; limite não configurado, medição indisponível e expiração quando aplicáveis |
| Recuperação | Diagnóstico, recibos, nova tentativa, conclusão de publicação e Aumentar modo no detalhe da entrega aprovada encerrada | Cancelamento solicitado distinto de parada confirmada; resultado delivered/rejected/failed/cancelled/interrupted; limpeza pending/complete/uncertain; publicação por efeito; modo superior com resumo de efeitos adicionais, autorização única e impedimentos |
| Interação operacional | Abertura da TUI nativa no Maestri e da pasta somente em contexto suportado | Disponível ou indisponível com motivo e orientação para usar Maestri no host executor; pergunta formal pendente com TUI livre, acompanhamento perdido; conversa após resultado sem nova implementação implícita |

Os nomes técnicos de estado representam o contrato existente, não textos finais de interface. Suspensão não é resultado final; pausar a fila não pausa a tentativa; aprovação não é publicação concluída; pedido de parada não é limpeza confirmada.

## 6. Cobertura normativa

### 6.1 Critérios de produto

| Critério | Histórias principais | Requisitos principais |
| --- | --- | --- |
| AC-01 | US-01, US-11 | RF-01, RF-04, RF-48; RNF-10 |
| AC-02 | US-02 | RF-05–RF-12; RNF-08, RNF-22 |
| AC-03 | US-03 | RF-07, RF-13, RF-77–RF-78 |
| AC-04 | US-04–US-05 | RF-14–RF-22; RNF-19 |
| AC-05 | US-01, US-06 | RF-03, RF-23–RF-28; RNF-13 |
| AC-06 | US-10–US-11 | RF-43–RF-52 |
| AC-07 | US-12 | RF-54–RF-56; RNF-11 |
| AC-08 | US-04, US-12 | RF-19, RF-57 |
| AC-09 | US-11–US-12, US-16, US-19 | RF-69, RF-82–RF-84 |
| AC-10 | US-16–US-17 | RF-70, RF-76–RF-80; RNF-11 |
| AC-11 | US-16–US-17 | RF-71–RF-72, RF-78; RNF-08 |
| AC-12 | US-03, US-09, US-17 | RF-13, RF-42, RF-73, RF-77–RF-80; RNF-13 |
| AC-13 | US-11–US-12, US-16 | RF-49–RF-50, RF-54, RF-57, RF-76; RNF-11 |
| AC-14 | US-13, US-20 | RF-58–RF-62, RF-88 |
| AC-15 | US-10, US-13, US-20 | RF-46, RF-88 |
| AC-16 | US-14 | RF-63–RF-64; RNF-09 |
| AC-17 | US-15 | RF-65–RF-67; RNF-14, RNF-20 |
| AC-18 | US-15, US-17, US-19 | RF-66, RF-80, RF-82–RF-84; RNF-14 |
| AC-19 | US-07–US-09 | RF-30–RF-35, RF-38–RF-41 |
| AC-20 | US-06, US-08 | RF-27–RF-28, RF-36–RF-37; RNF-13 |
| AC-21 | US-05, US-08–US-09, US-18 | RF-14, RF-38–RF-39; RNF-03 |
| AC-22 | US-09, US-17 | RF-38–RF-42, RF-79 |
| AC-23 | US-10 | RF-46; RNF-25 |
| AC-24 | US-20 | RNF-21 |
| AC-25 | US-10 | RF-43–RF-45; RNF-21 |
| AC-26 | US-14–US-15 | RF-63–RF-68; RNF-09 |
| AC-27 | US-01–US-20 | RF-20–RF-21, RF-81–RF-88; RNF-17–RNF-19, RNF-25 |
| AC-28 | US-10–US-12, US-19–US-20 | RNF-24 |
| AC-29 | US-11, US-19 | RF-49, RF-84; RNF-01, RNF-15–RNF-16 |

### 6.2 Critérios de integração

| Critérios | Histórias principais | Requisitos principais |
| --- | --- | --- |
| INT-01–INT-02 | US-10, US-20 | RF-43, RF-88 |
| INT-03–INT-05 | US-05, US-10, US-12–US-13 | RF-16, RF-44–RF-45, RF-54, RF-59 |
| INT-06 | US-11–US-12, US-19 | RF-51–RF-52; RNF-12 |
| INT-07 | US-13 | RF-58–RF-62 |
| INT-08 | US-15, US-20 | RF-65–RF-66, RF-88; RNF-14 |
| INT-09–INT-10 | US-10, US-13, US-20 | RF-46, RF-88; RNF-25 |
| INT-11 | US-01–US-20 | RNF-17, RNF-25 |
| INT-12 | US-10 | RF-47 |
| INT-13–INT-14 | US-10, US-20 | RNF-21 |
| INT-15–INT-16 | US-14–US-15 | RF-63–RF-68; RNF-09 |
| INT-17 | US-15 | RF-67; RNF-14 |
| INT-18 | US-11–US-12, US-16–US-17 | RF-49–RF-57, RF-76; RNF-11 |

## 7. Limites de escopo e pendências

### Limites preservados

- A primeira entrega coordena desenvolvimento local; não inclui merge/deploy automáticos, decisão automática de produto, migração do legado, múltiplos workers/máquinas executoras da mesma conta, editor completo de Kanban, attach externo ou adapter Eve/Vercel.
- O produto não é harness, sandbox geral, backup de projeto, supervisor integral do runtime ou gerenciador MCP paralelo. OMP/Maestri/MCPs configurados são componentes confiáveis usados normalmente.
- Não há cobrança, assinatura, planos, créditos ou funcionalidades de monetização definidos; não são requisitos autorizados por este documento.
- Desenvolvimento novo não utiliza implementação do legado Aula-IA. Não há instalação/execução de setup, provider, alteração de tracker ou publicação autorizada por esta elaboração documental.

### Pendências sem requisito inventado

| Pendência | Consequência para a documentação |
| --- | --- |
| Monetização da primeira versão não respondida | Não especificar billing, assinatura ou planos. |
| Pitch e resumo ainda aguardam validação | Não apresentar discovery ou este derivado como aprovados. |
| Referências visuais e Design Lock pendentes | Registrar padrões e estados funcionais; decisões visuais dependem do mecanismo próprio. |
| Limiares numéricos de latência, throughput, disponibilidade e recuperação não definidos | Não prometer SLA, RTO/RPO ou metas de capacidade. Manter as medições e comportamentos de recuperação já exigidos. |
| P7/F-06: detalhamento quantitativo adicional encerrado por decisão superveniente | Em 16/10/2026, o usuário declarou: “não preciso de mais detalhes de acessibilidade”. Seguir com a SPEC sem nova entrevista ou definição adicional de viewport, contraste, zoom ou nível formal de conformidade. Manter desktop/celular, teclado, foco visível, nomes acessíveis, legibilidade, contraste/zoom medidos, conteúdo e screenshots via Playwright MCP/Chrome; registrar resultados, falhas e indisponibilidades. O histórico da pendência permanece no relatório de stories; esta decisão não comprova testes, conformidade, aceite visual ou Design Lock. |

## 8. Comprovação prevista

O aceite futuro segue SPEC §10.2: decisões determinísticas, contratos HTTP/SQLite/Git, percurso real Maestri/OMP e interface observada por Playwright MCP/Google Chrome de teste. As ferramentas de teste já definidas são preservadas; este documento não inventa comandos nem afirma que foram executados.

A sequência vigente é: percurso integrado manual até ICR com pergunta/cancelamento/nova tentativa; publicação autorizada e reconciliação; fila Ready; scaffold; jornadas finais, diagnóstico e inicialização/documentação. Todas as capacidades continuam exigidas na entrega final.

Nesta fase, a validação é documental: leitura UTF-8, integridade dos IDs, referências entre histórias e requisitos, cobertura AC/INT e consistência com o discovery e seus contratos. Não comprova integração, uso de provider, funcionamento de UI ou aprovação visual.
