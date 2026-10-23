# Feedback para o próximo pacote - V3

## Detecção automática das ferramentas na configuração inicial

Decisão registrada em 22/10/2026. Ajuste documental para o próximo pacote, sem iniciar implementação ou alterar o pipeline em execução.

- O wizard de primeira execução deve detectar automaticamente Git, Maestri, OMP e PowerShell, assim como verificar o GitHub CLI necessário à configuração. Não exigir que o usuário informe os quatro caminhos absolutos no comando de inicialização.
- Disponibilizar um inicializador simples que permita acessar o wizard mesmo quando alguma ferramenta ou a conexão com o Maestri estiver indisponível. Apresentar o impedimento na etapa responsável, com causa e próxima ação claras.
- Validar os executáveis encontrados e apresentar um resumo compacto. Solicitar seleção manual apenas quando a detecção não encontrar uma opção válida ou houver ambiguidade que não possa ser resolvida automaticamente.
- Reaproveitar a configuração validada nas próximas inicializações, revalidando sua disponibilidade e permitindo corrigir caminhos que deixaram de funcionar. Resolver caminhos na máquina em uso, sem caminhos pessoais fixos no produto distribuído.
- Distinguir a localização do executável Maestri da conexão com a sessão: detectar o executável não comprova acesso ao terminal. Verificar a conexão separadamente e orientar iniciar pelo terminal do Maestri quando necessário.
- Preservar os bloqueios antes de operações que dependam das ferramentas ou da conexão. A indisponibilidade deve permitir configuração e correção pelo wizard, sem aparentar prontidão para executar.
- Validar o percurso em uma extração limpa do pacote, incluindo detecção automática, correção manual e retomada após reiniciar, além de comprovar separadamente a integração real Maestri/OMP.

## Criação de projetos com GitHub completo obrigatório

Decisão registrada em 22/10/2026. Este registro é apenas documental e não autoriza implementação nem alteração do pipeline em execução.

Todo projeto criado pela fábrica deve ter repositório remoto no GitHub, código inicial publicado por push e um GitHub Projects vinculado, com visualização Kanban, colunas padrão e mapeamento dos status já configurados na fábrica.

- O único fluxo de criação permitido é com remoto e com push. Remover as opções Somente local e remoto sem push.
- A criação deve entregar o repositório GitHub configurado, o código inicial publicado e o quadro pronto para uso pela fábrica.
- Essa regra trata da criação do projeto e não altera os três modos de entrega de tarefas descritos abaixo.
- A criação do quadro é obrigatória, sem opção de desabilitar.
- O usuário pode digitar o nome do quadro. O campo deve vir preenchido com o nome do projeto e permitir edição.
- A fábrica deve criar e vincular o quadro como parte da criação do projeto, evitando configuração manual posterior.
- A criação só é considerada concluída quando o remoto estiver configurado, o push inicial estiver concluído e o quadro estiver configurado e vinculado.
- Em caso de falha parcial, deve ser possível retomar a configuração aproveitando os recursos já criados, sem duplicar repositório ou quadro.

### Pontos ainda não definidos

- Os nomes e a ordem exatos das colunas padrão, compatíveis com o fluxo e o significado de Ready na fábrica.
- A aplicação dessa obrigatoriedade ao fluxo Adicionar existente. A decisão acima abrange o fluxo de criação de projetos pela fábrica.

## Entrega dos modos ICR e integração no repositório local

Decisão registrada em 22/10/2026. Registro para o próximo pacote, sem autorização para iniciar implementação ou alterar o pipeline em execução.

Os três modos devem controlar o destino do resultado aprovado:

| Modo | Comportamento esperado |
| --- | --- |
| ICR | Implementar, checar e revisar em ambiente separado, preservando o código original. Manter o resultado disponível para inspeção e integração posterior. |
| ICR + commit | Executar o mesmo percurso separado, integrar a versão aprovada em uma branch própria da tarefa no repositório local cadastrado e criar o commit local. |
| ICR + commit + PR | Executar o segundo modo, publicar a branch no GitHub e abrir o PR para a branch de destino. Não realizar merge automático. |

### Continuação da entrega após a conclusão

Decisão registrada em 22/10/2026: o modo escolhido define a entrega inicial, mas o usuário pode avançar a entrega posteriormente na própria tentativa, aproveitando o resultado aprovado.

| Situação atual | Ações disponíveis |
| --- | --- |
| ICR concluído | Integrar e criar commit; ou integrar, criar commit e abrir PR. |
| Commit local concluído | Publicar branch e abrir PR. |
| PR aberto | Ver PR. |

- Apresentar as ações pertinentes em uma seção compacta “Continuar entrega”. O clique autoriza os efeitos descritos pela ação, sem nova confirmação redundante.
- Executar apenas os efeitos restantes, aproveitando a versão aprovada sem repetir implementação e revisão quando ela puder ser integrada diretamente.
- Preservar a referência Git imutável e o conteúdo versionado necessário à entrega posterior, respeitando os contratos de persistência e retenção. Não criar snapshots auxiliares do checkout.
- Antes de continuar, conferir novamente o repositório local, a branch de destino e o trabalho existente, pois podem ter mudado desde a conclusão. Preservar o trabalho do usuário.
- Se a integração exigir adaptações ou resolução de conflitos, submeter o resultado alterado a checks e revisão antes de concluir a entrega.
- Em falhas ou retomadas, aproveitar os efeitos confirmados e reconciliar os incertos, sem duplicar commits, publicação de branch ou PR.
- Preservar a escolha original e o resultado do ICR no histórico, registrando separadamente a continuação e seus efeitos. Mostrar um único resultado atualizado na interface, sem apresentar entrega parcial como concluída.
- Validar as transições ICR para commit, ICR para commit com PR e commit para PR, incluindo mudanças no destino, conflitos e retomada sem duplicação. Distinguir testes controlados de comprovação real dos efeitos Git/GitHub.

### Integração e preservação do trabalho

- A integração local ocorre em branch própria da tarefa, sem integrar automaticamente na branch atual do usuário ou na branch principal.
- Preservar alterações locais existentes e não incluí-las no commit da tarefa. Não sobrescrever arquivos nem trocar a branch do diretório em uso de forma que comprometa o trabalho do usuário.
- Transportar a versão aprovada pelo fluxo Git, sem copiar arquivos por cima do checkout original.
- A presença da branch e do commit no repositório local não implica atualizar os arquivos do checkout atualmente aberto. Não prometer essa atualização automática.
- Se a integração exigir resolução de conflitos ou adaptações, revalidar o resultado integrado antes de concluir a entrega.
- Se houver impedimento, preservar a implementação aprovada e permitir retomar a integração. Não apresentar uma entrega parcialmente concluída como sucesso completo.
- A retomada deve aproveitar os efeitos já concluídos, evitando duplicar commits, publicação da branch ou PR.

### Interface enxuta

- Manter os nomes dos três modos, com uma descrição curta do efeito na seleção: resultado separado; integrar e commitar localmente; integrar, commitar e abrir PR.
- Apresentar um único resultado final consolidado, sem multiplicar avisos, confirmações ou mensagens por etapa.
- Exibir mensagens adicionais apenas quando houver impedimento que exija ação do usuário, com causa e próxima ação claras.
- Manter detalhes técnicos nos registros, sem diagnósticos brutos ou avisos repetidos na interface principal.

### Ponto ainda não definido

- Como definir o repositório local de destino nos projetos cadastrados somente por URL. Os modos com integração local precisam desse destino, sem presumir uma pasta do usuário.

## Arquivos gerenciados agrupados por projeto

Decisão registrada em 22/10/2026. Registro para o próximo pacote, sem iniciar implementação ou mover arquivos durante o pipeline em execução.

A fábrica deve criar uma pasta por projeto dentro de sua área de dados, agrupando nela todos os arquivos gerenciados exclusivos daquele projeto. As execuções de projetos diferentes não devem permanecer misturadas nas pastas globais execution-bootstrap, git e work.

- Agrupar os bootstraps de execução, repositórios Git internos, ambientes de implementação, checks, revisões, publicação e artefatos exclusivos sob a pasta do respectivo projeto.
- Manter a separação interna por tentativa e passagem, preservando os vínculos com rodada e versão.
- Tornar o projeto identificável pelo nome na organização das pastas, usando também sua identidade estável para evitar colisões entre nomes iguais. Renomear o projeto não pode romper referências existentes.
- Banco e recursos globais compartilhados continuam na área global. A pasta original cadastrada pelo usuário mantém sua localização; esse agrupamento trata dos arquivos gerenciados pela fábrica.
- Atualizar de forma consistente criação, leitura, execução, recuperação, retenção, publicação e exclusão para a nova organização, preservando isolamento e proteção de caminhos.
- Prever o tratamento dos arquivos existentes e das referências persistidas, sem mover ambientes em uso nem perder entregas ou evidências. A estratégia de transição deve ser definida antes da implementação.

Exemplo de organização proposta, com os nomes internos finais a definir:

```text
var/factory/
  factory.sqlite
  projects/
    nome-do-projeto--id-estavel/
      execution-bootstrap/
      git/
      work/
      artifacts/
```

## Exclusão compacta e mais rápida

Decisão registrada em 22/10/2026. Ajuste documental para o próximo pacote, sem alterar a implementação ou o pipeline em execução.

- Na confirmação de exclusão, apresentar a pasta gerenciada do projeto, como `var/factory/projects/nome-do-projeto--id/`, em vez de listar individualmente todas as pastas de tentativas, bootstraps, repositórios internos e artefatos. Informar de forma curta que todo o conteúdo dessa pasta será removido.
- Quando a exclusão também abranger a pasta original cadastrada, mostrar esse caminho separadamente, deixando explícita sua remoção integral. A apresentação compacta não pode ocultar outro destino autorizado para exclusão.
- Manter causa e próxima ação dos impedimentos visíveis, sem repetição, e a ação de confirmação acessível sem percorrer uma lista extensa de caminhos. O inventário detalhado permanece disponível nos registros pertinentes.
- Otimizar a duração da exclusão, relatada como demorada pelo usuário. Medir o tempo por etapa para identificar o custo real antes de escolher a solução e comparar o resultado com o comportamento anterior em projetos com muitas tentativas e caches volumosos.
- Aproveitar a pasta exclusiva por projeto para remover seu conteúdo como uma unidade quando seguro, evitando percursos, consultas e conferências redundantes por subpasta. A estratégia técnica deve seguir a medição e os contratos de exclusão existentes.
- Preservar autorização durável, bloqueios por atividade ou efeitos incertos, proteção de caminhos compartilhados e substituídos, tratamento de links sem seguir destinos e recuperação de falhas parciais. Não acelerar a exclusão desabilitando essas garantias.
- Manter o progresso apresentado de forma compacta e responsiva. Declarar conclusão somente após conferir a remoção dos destinos autorizados e dos dados previstos; falha ou exclusão parcial continuam explícitas.
- Validar separadamente tempo total, resposta da interface e correção da exclusão. Definir a meta de desempenho a partir da medição inicial, sem prometer um ganho ainda não comprovado.

## Instruções dos agentes editáveis no perfil

Decisão registrada em 22/10/2026: as instruções dos agentes devem ser editáveis no respectivo perfil, sem depender de alteração no código. Registro para o próximo pacote, sem iniciar implementação ou alterar o pipeline em execução.

- Disponibilizar um campo de instruções no editor de cada perfil de Implementador e Revisor, junto às escolhas de executor, modelo e esforço. Permitir consultar e editar as instruções efetivamente usadas pelo perfil.
- As instruções comportamentais hoje fornecidas pelos recursos de papel devem passar a ser configuráveis no perfil; não manter um prompt comportamental oculto e fixo que anule essa edição.

### Proposta técnica para implementação

- Usar as instruções atuais como conteúdo inicial dos perfis, preservando as orientações já configuradas. Definir a migração e a composição com os campos existentes antes de implementar, evitando duplicação ou perda de instruções.
- Persistir as instruções nas revisões do perfil e capturar a versão efetiva no início de cada tentativa. Edições posteriores valem para novas tentativas, sem modificar agentes em execução, rodadas de correção da mesma tentativa ou histórico.
- Compor a entrada do agente com as instruções capturadas do perfil e o contexto da tarefa: issue, critérios, checks, versão da entrega e achados pertinentes. Permitir consultar essa composição, preservando dados privados e sem expor credenciais.
- Manter os schemas de resultados e perguntas e os controles de autorização, isolamento e vínculo de versão como contratos técnicos do executor. Editar instruções não concede novas permissões nem altera esses contratos; apresentar essa distinção de forma curta no editor.
- Preservar a separação entre Implementador e Revisor e suas responsabilidades no fluxo. Alterar o texto de um perfil não cria novas etapas ou papéis automaticamente.
- Validar edição, gravação, uso real das instruções pelo OMP, migração dos perfis existentes e preservação da versão capturada após alterações posteriores, distinguindo testes controlados de prova real.

## Continuidade das sessões de implementação e revisão

Decisão registrada em 22/10/2026. Otimizar as rodadas preservando uma sessão de Implementador e uma sessão de Revisor por tentativa. Registro para o próximo pacote, sem iniciar implementação ou alterar execuções em andamento.

- Manter a retomada do Implementador na mesma sessão e ambiente de implementação para corrigir os achados.
- Após a primeira revisão, retomar também a sessão do Revisor nas rodadas seguintes, aproveitando seu contexto anterior em vez de iniciar uma nova execução a cada rodada.
- Preservar a separação entre os papéis: o Revisor continua separado do Implementador e não altera o código do produto. A continuidade da sessão não elimina essa independência.
- Fazer a revisão completa dos critérios na primeira rodada. Nas seguintes, concentrar a revisão nas alterações, nos achados pendentes e nas possíveis regressões das áreas afetadas, ampliando a conferência quando a correção exigir.
- Antes de cada nova revisão, atualizar e conferir o ambiente separado do Revisor para a nova versão fixa. Não revisar arquivos remanescentes da versão anterior nem atualizar o ambiente enquanto o Revisor ainda estiver usando a versão anterior.
- Fornecer na retomada a referência da nova versão, o diff em relação à versão revisada anteriormente, as respostas do Implementador, os achados pendentes e os resultados atualizados dos checks.
- Continuar capturando uma referência Git imutável por entrega e executando os checks configurados após cada correção. Preservar os pareceres e as evidências anteriores, vinculando cada nova avaliação à respectiva rodada e versão.
- A aprovação final deve abranger todos os critérios na versão atual e exigir ausência de achados bloqueantes pendentes. A revisão concentrada nas mudanças não autoriza transportar automaticamente uma aprovação anterior quando as alterações afetarem sua validade.
- Essa continuidade vale durante a tentativa ativa; não implica restaurar automaticamente conversas após reinício. Se a sessão ou seu acompanhamento se perder, explicitar a interrupção e seguir os mecanismos de recuperação autorizados, sem aparentar retomada confirmada.
- Validar a retomada real das duas sessões no Maestri/OMP, a atualização correta do ambiente de revisão e os vínculos de rodada e versão, incluindo correções sucessivas e perda de acompanhamento. Distinguir essas provas dos testes controlados.

## Melhorias no ciclo de implementação e revisão

Decisões registradas em 22/10/2026. Registro para o próximo pacote, sem iniciar implementação ou alterar o pipeline em execução. Priorizar pacote claro de correção, detecção de falta de progresso e redução de checks duplicados.

### Pacote claro de correção - prioridade alta

- Entregar ao Implementador cada achado com identidade estável, problema, evidência, resultado esperado e prioridade, mantendo o vínculo com critérios e versão revisada.
- Incluir os resultados e logs pertinentes das falhas dos checks, para evitar reconstrução desnecessária do diagnóstico. Preservar a distinção entre falha técnica de execução e problema comprovado no produto.

### Detecção de rodadas sem progresso - prioridade alta

- Identificar a recorrência do mesmo problema sem resolução efetiva e interromper a repetição automática, apresentando o impedimento e as evidências ao usuário.
- Permitir ao usuário decidir entre ajustar a orientação, trocar o perfil ou encerrar. Não trocar perfis nem ampliar limites automaticamente; preservar o histórico e as versões já avaliadas.
- Definir antes de implementar os critérios de recorrência e o limite de rodadas sem progresso, distinguindo achados persistentes de novos problemas e de correções parciais verificáveis.

### Correções focadas nos achados

- Orientar o Implementador a corrigir os achados e suas consequências, evitando alterações sem relação com a correção. Exigir justificativa para mudanças adicionais e disponibilizá-la ao Revisor.
- Não impedir ajustes necessários à solução; mudanças de escopo continuam sujeitas à decisão correspondente, sem incorporar novos requisitos silenciosamente.

### Redução de verificações duplicadas - prioridade alta

- Fornecer ao Revisor os resultados e logs dos checks executados pela fábrica sobre a versão em revisão. Reaproveitar evidências válidas dessa versão e executar verificações complementares quando necessário.
- Repetir o mesmo comando quando houver motivo concreto, como evidência insuficiente, necessidade de reprodução ou condições diferentes relevantes, registrando a justificativa.
- Preservar os checks configurados após cada correção e a validação independente dos critérios pelo Revisor. Não reutilizar resultados de outra versão como prova da versão atual nem substituir a validação visual exigida por compilação ou typecheck.

### Tratamento de divergências entre os agentes

- Permitir ao Implementador contestar um achado com justificativa e evidências. O Revisor deve avaliar a resposta e explicar por que mantém ou resolve o achado, preservando os registros anteriores.
- Encaminhar divergências persistentes ao usuário como decisão clara, com o ponto de desacordo, as evidências e as alternativas. Não considerar um achado resolvido apenas pela contestação do Implementador.
- Definir os critérios de persistência antes de implementar, articulados com a detecção de falta de progresso e o limite de correções.

### Aprovação final consolidada

- Apresentar um resumo único com critérios atendidos, resultados dos checks, achados resolvidos, limitações e referência imutável da versão aprovada.
- Distinguir o que foi comprovado, o que não foi verificado e eventuais observações não bloqueantes. O resumo não pode aparentar aprovação quando os critérios ou achados bloqueantes ainda impedirem sua concessão.
- Integrar esse resumo ao resultado da entrega, evitando avisos e informações duplicadas na interface.

### Validação das melhorias

- Comprovar o conteúdo do pacote de correção, a interrupção por recorrência, o tratamento de contestações e a preservação dos vínculos entre evidências e versões.
- Conferir que a redução de comandos repetidos preserva os checks obrigatórios e as verificações necessárias; medir repetições, duração e consumo quando disponíveis, sem prometer ganho não observado.
- Distinguir testes controlados de prova real do ciclo no Maestri/OMP.

## Melhorias de acompanhamento e operação

Decisões registradas em 22/10/2026. Registro para o próximo pacote, sem autorização para iniciar implementação ou alterar o pipeline em execução.

### Resumo claro da entrega - prioridade alta

- Ao encerrar uma tentativa, apresentar um resumo compacto com resultado, localização do código, branch, commit e PR, conforme os efeitos efetivamente concluídos no modo escolhido.
- Mostrar o que falta fazer e oferecer acesso direto aos destinos disponíveis. Distinguir resultado separado, integração local e publicação, sem apresentar entrega parcial como concluída.
- Usar as referências da versão entregue e os recibos existentes; não inferir sucesso pela resposta textual do agente.

### Tempo por etapa - prioridade alta

- Mostrar a etapa atual, tempo decorrido, última atividade confirmada e prazo restante quando houver prazo definido.
- Distinguir execução demorada, espera por decisão e perda de acompanhamento. Ausência de atividade recente não comprova que o processo parou.
- Não inventar percentual de progresso ou previsão de conclusão. Preservar a distinção entre fatos observados e estado ainda incerto.

### Avisos de atenção - prioridade alta

- Oferecer notificações locais para pergunta pendente, falha e conclusão, com acesso direto à tentativa correspondente.
- Evitar notificações duplicadas do mesmo evento durante atualizações e reconexões. Exibir apenas a informação necessária para identificar o trabalho e a ação esperada.
- Validar a disponibilidade e as permissões da superfície de notificação escolhida; manter a pendência acessível na interface quando a notificação não puder ser entregue.

### Encerramento guiado da fábrica - prioridade alta

- Oferecer uma ação para orientar o encerramento seguro, pausando novos inícios e mostrando os trabalhos ativos e as providências necessárias antes de fechar o controlador.
- Manter explícita a escolha sobre trabalhos em andamento; solicitar encerramento da fábrica não deve cancelar tentativas implicitamente.
- Distinguir encerramento do controlador, cancelamento da tentativa, parada física dos recursos e limpeza. Informar recursos ainda ativos ou com parada incerta e preservar seus ambientes.
- Validar o percurso real no Maestri, além dos testes controlados; fechar a interface não comprova encerramento do controlador ou dos agentes.

### Busca no histórico - prioridade média

- Permitir buscar tentativas por título ou número da issue e filtrar por período, combinando esses critérios com os filtros existentes de projeto e resultado.
- Aplicar busca e filtros ao histórico consultável completo, preservando paginação e resumos leves, sem limitar a busca aos itens da página visível.
- Manter os critérios de busca durante a navegação e apresentar claramente ausência de resultados e falhas de consulta.

### Comparação entre tentativas da mesma issue - prioridade média

- Permitir comparar tentativas da mesma issue, mostrando o motivo da falha anterior, o resultado posterior e as diferenças relevantes de configuração e versão.
- Preservar a identidade de cada tentativa, rodada e versão, usando os dados históricos capturados sem substituí-los pela configuração atual.
- Apresentar dados ausentes ou não comparáveis como indisponíveis, sem presumir que repetir a execução resolveu a causa anterior ou importar trabalho entre tentativas.

### Cor do indicador de conexão - ajuste menor

- Problema relatado pelo usuário: o selo “Falha nas atualizações” mantém um ponto verde mesmo com falha de conexão, conforme captura apresentada em 22/10/2026.
- Em estado de falha de conexão ou atualização, exibir o ponto em vermelho, coerente com a mensagem. Reservar o verde para o estado saudável confirmado e manter o texto para que a identificação não dependa apenas da cor.
- Validar a transição visual entre conexão saudável, falha e recuperação, sem indicar recuperação antes de sua confirmação.
