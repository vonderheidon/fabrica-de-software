# Relatório persistente de validação de user stories

Data: 16/10/2026. Projeto: Nova fábrica de software. Validação anterior ao design.

Documento em revisão: `stories-requisitos20261016_073031.md`, neste diretório.

## Continuidade e situação

- Este relatório registra os problemas analisados, propostas e decisões desta validação. Deve ser lido antes de cada resposta de continuidade.
- Leitura completa realizada: `discovery20261016_073031.md`, documento em revisão e `stories.md`; conferência integral de `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md` e `GLOSSARY.md` da raiz.
- Não existia relatório de validação neste diretório e o pedido não indicou um nome para ele; este arquivo foi adotado como relatório persistente.
- Situação inicial preservada: na primeira análise, nenhuma alteração no documento de requisitos estava aprovada ou aplicada; os oito pontos aguardavam discussão.
- Situação atual após a decisão superveniente de 16/10/2026: P1–P6 e P8 foram aplicados; P7/F-06 está encerrado quanto ao detalhamento quantitativo adicional, pois o usuário declarou “não preciso de mais detalhes de acessibilidade”. Mantidas as verificações originais, sem testes ou conformidade comprovados. Não exigir nova entrevista ou valores de viewport/contraste/zoom ou nível formal de conformidade. A aprovação pelo mecanismo do pipeline cabe ao orquestrador com a decisão recebida.
- As 20 stories contêm ator, ação, benefício e critérios. A revisão encontrou principalmente ambiguidades de fluxo e critérios de interface insuficientemente verificáveis; não identificou necessidade de acrescentar monetização ou novos serviços.
- Referência visual, Design Lock e aprovação de fase continuam sujeitos aos mecanismos próprios. A criação deste relatório não representa aprovação.

## Problemas e propostas

- **P1** [APLICADO] [Ambiguidades] A mudança semântica de critérios admitia duas interpretações sobre continuar a tentativa atual.
  - Evidência: US-06, critério 6, e RF-29 permitem “decisão humana ou nova tentativa”; US-13, critério 5, exige GitHub e outra tentativa quando há mudança de escopo. Uma resposta humana pode ser interpretada como autorização para substituir os critérios da tentativa em andamento.
  - Base: discovery, Governança e limites preservados; SPEC §§2 e 5.5. O escopo capturado não muda implicitamente e mudança de escopo exige GitHub e nova tentativa.
  - Proposta: distinguir a decisão de manter o escopo capturado da decisão de adotar o novo escopo. No segundo caso, atualizar o GitHub e iniciar outra tentativa; a resposta não substitui os critérios da tentativa atual. Explicitar esse resultado na US-06, na US-13 e no RF-29, sem alterar o contrato da raiz.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado expressamente na retomada; aplicado em US-06.6, US-13.5 e RF-29. Manter escopo capturado permite continuidade dentro dele; adotar novos critérios exige GitHub e outra tentativa.

- **P2** [APLICADO] [Lacunas] O aviso de divergência do Kanban não definia como o operador resolve a suspensão.
  - Evidência: US-09, critérios 3 e 6, RF-40 e seção 5 exigem suspensão e “ação requerida”, mas não descrevem a decisão apresentada nem a condição de saída. A interface pode acabar exibindo apenas um aviso sem percurso de recuperação.
  - Base: discovery e stories de origem sobre divergência externa; SPEC §§4.3–4.4 e 5.3.
  - Proposta: mostrar Status observado, Status esperado para a etapa e motivo da suspensão; orientar a correção no GitHub e permitir nova consulta/revalidação. Somente liberar continuidade após resolver a divergência e revalidar a autoridade; manter Cancelar disponível. Mudança de responsável segue o cancelamento já previsto, sem ser resolvida por simples retomada. Discutir essa forma de recuperação antes de incluí-la na US-09/RF-40 e na matriz de estados.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; aplicado em US-09.3, US-19.3, RF-40, RF-85 e seção 5. Mensagem com Status observado/esperado, correção no GitHub e Revalidar pelas verificações existentes; Cancelar mantido, sem workflow adicional. Mudança de responsável continua exigindo cancelamento.

- **P3** [APLICADO] [Ambiguidades] Preservar campos em conflito não definia o fluxo para concluir a edição concorrente.
  - Evidência: US-04, critério 5, RF-21 e RNF-19 exigem preservar os campos locais, mas não dizem como o operador conhece o valor persistido e resolve a divergência.
  - Base: discovery e stories de origem sobre conflito entre abas; SPEC §§3.3 e 9, AC-04.
  - Proposta: apresentar os valores locais e os persistidos nos campos conflitantes, permitir escolha explícita dos valores e nova gravação com revalidação. Se houver outro conflito, preservar a edição novamente; mostrar Salvo somente após persistência. Acrescentar esse fluxo à US-04/RF-21, sem escolher composição visual.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; a proposta inicial de comparador/escolha campo a campo foi substituída pela preservação do rascunho, recarga dos dados atuais, reaplicação e gravação com controle de versão existente. Aplicado em US-04.5, RF-21, RNF-19 e seção 5. Não exigir comparador ou merge campo a campo.

- **P4** [APLICADO] [Lacunas] Aumentar o modo após o encerramento era uma capacidade prevista sem ação de interface suficientemente descrita.
  - Evidência: US-16, critério 2, e RF-75 exigem aumento explícito de modo; US-19, RF-85 e seção 5 listam ações sem identificar esse percurso. Concluir publicação pendente pode ser confundido com autorizar novos efeitos de um modo maior.
  - Base: discovery e stories de origem sobre publicação após encerramento; SPEC §§6 e 6.1.
  - Proposta: no detalhe de uma entrega aprovada, prever ação para aumentar o modo, com escolha do modo superior, resumo dos efeitos adicionais e confirmação única dessa nova autorização. Reusar a versão aprovada e os efeitos já confirmados; explicar impedimentos de elegibilidade. Manter distinta a ação de concluir efeitos já autorizados. Refletir em US-16, US-19, RF-75/RF-85 e seção 5.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; aplicado em US-16.2, US-19.3, RF-75, RF-85 e seção 5. Ação simples no detalhe, escolha de modo superior, resumo dos efeitos adicionais e autorização única reutilizam publicação e revalidações, sem novo wizard. Mesma versão aprovada e efeitos confirmados preservados.

- **P5** [APLICADO] [Lacunas] Os limites de tempo e custo apareciam como configuração genérica, sem estados visíveis suficientes na tentativa.
  - Evidência: US-05 menciona defaults de tempo; US-13 separa espera humana de tempo ativo; RF-61 exige limites de tempo/custo visíveis. US-19 e seção 5 não identificam sua apresentação nem o estado de expiração.
  - Base: discovery sobre configuração e perguntas; SPEC §§3.3 e 5.3: tempo ativo, TTL da pergunta e limite de custo separados e visíveis, expiração registrada e parada sem confirmação não presumida.
  - Proposta: explicitar no detalhe da tentativa o tempo ativo, a espera humana e os limites efetivamente configurados; distinguir limite não configurado de medição indisponível. Mostrar expiração registrada e eventual cancelamento/limpeza conforme confirmação real, sem tratar silêncio como falha. Não fixar novos valores ou políticas; discutir os campos e estados na US-05/US-13/US-19 e RF-61.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; aplicado em US-05.1, US-13.5, US-19.7, RF-61, RF-83 e seção 5. Exibir tempos, limites, TTL, expiração e estado de parada a partir dos dados existentes, distinguindo limite não configurado de medição indisponível e solicitação de parada de confirmação. Indisponibilidade não dispensa requisito obrigatório. Sem dashboard financeiro, estimador, cobrança ou novo sistema de telemetria.

- **P6** [APLICADO] [Ambiguidades] Abrir terminal/pasta não possuía comportamento definido para uma interface em celular ou em outra máquina.
  - Evidência: US-10, US-19/RF-85 e RNF-17 exigem interação nativa e uso em celular; RNF-07 admite cliente remoto por conexão já provida. Não está definido quando essas ações conseguem operar o recurso no host executor.
  - Base: discovery, Plataforma e Referências visuais; SPEC §§8.5 e 9 e integração §§2 e 4. A interação pertence ao Maestri; não há terminal web próprio nem provisionamento de acesso remoto.
  - Proposta: definir a disponibilidade das ações conforme o contexto suportado de abertura no host; quando indisponíveis, mostrar o motivo e orientar o acesso pelo Maestri no host executor. A resposta a perguntas e as demais ações web continuam seguindo seus contratos. Confirmar esse comportamento antes de editar US-10/US-19 e a matriz de estados; não presumir controle remoto de aplicativos.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; aplicado em US-10.6, US-19.3, RF-45, RF-85 e seção 5. Abrir somente em contexto suportado; nos demais casos, motivo e orientação para usar Maestri no host executor. Sem novo acesso remoto.

- **P7** [ENCERRADO] por decisão superveniente de não acrescentar detalhamento quantitativo. Evidência, proposta e resultado anteriores são preservados abaixo como histórico; não representam exigência vigente de novos parâmetros.
  - Decisão superveniente em 16/10/2026: “não preciso de mais detalhes de acessibilidade”. Encerrado P7/F-06; manter desktop/celular, teclado, foco visível, nomes acessíveis, legibilidade, contraste/zoom medidos, conteúdo e screenshots via Playwright MCP/Chrome. Seguir com a SPEC sem nova confirmação desses parâmetros. Nenhum teste ou conformidade comprovado por esta decisão.
  - Achado histórico [Criterios fracos]: responsividade, contraste e zoom são medidos, mas não possuem condição objetiva de aprovação.
  - Evidência: RNF-17/RNF-18 e seção 7 reconhecem ausência de resoluções, limiares e nível de acessibilidade. Medir sem um resultado mínimo permite aprovar interfaces com comportamentos muito diferentes.
  - Base: discovery, Plataforma; SPEC §9 e AC-27. O objetivo de uso em desktop/celular e por teclado já existe; os valores não foram definidos.
  - Proposta: obter decisão do usuário sobre larguras de referência para celular/desktop, percentual de zoom, razões mínimas de contraste e comportamento aceitável de navegação/conteúdo nessas condições; então transformar RNF-17/RNF-18 em verificações com resultado de aprovação/reprovação. Não escolher valores nem declarar conformidade por conta própria. Registrar a decisão antes do aceite visual, sem presumir Design Lock.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão na retomada anterior (histórica, superada quanto à pendência quantitativa): aprovada e aplicada somente a parte documental do pacote mínimo em RNF-17, RNF-18 e seção 7, com verificações de UI e registro das medições obrigatórias. P7 permanece [PENDENTE] quanto a larguras/resoluções de referência, razões mínimas de contraste, percentuais de zoom e nível de acessibilidade; nenhum número foi escolhido ou aprovado nesta retomada. A pendência impede concluir o aceite quantitativo correspondente, sem dispensar verificações ou declarar aceite visual. Sem funcionalidades adicionais.

- **P8** [APLICADO] [Lacunas] O scaffold não deixava explícita a branch-base que receberá o baseline.
  - Evidência: US-02 e RF-05–RF-12 descrevem nome, template, destino, modalidade e campos remotos, mas não a origem/edição da branch-base nem sua presença no plano e na conclusão. É possível implementar o formulário usando um default oculto.
  - Base: discovery incorpora SPEC §3.2; essa seção define remoto com push como publicação do baseline na branch-base escolhida. SPEC §3.3 exige branch-base configurável.
  - Proposta: explicitar a branch-base efetiva na preparação do scaffold e no plano; permitir revisá-la antes de Criar e mostrar a branch resultante na conclusão. Usar a mesma escolha no Git local, no push quando autorizado e no cadastro do projeto. Ajustar US-02/RF-05–RF-12 sem criar nova modalidade.
  - Registro inicial: aprovação não recebida; edição nenhuma. Decisão atual: pacote mínimo aprovado; aplicado em US-02.1/.3/.5/.7 e RF-05, RF-06, RF-08, RF-10 e RF-12. Branch-base efetiva revisável antes de Criar, presente no plano e conclusão e consistente com baseline local, push autorizado e cadastro.

## Decisões e alterações

### Histórico preservado

1. Análise inicial: nenhum ponto aprovado, aplicado ou rejeitado; propostas originais preservadas acima como histórico.
2. Pedido de redução de complexidade: foi uma solicitação de recomendação, sem autorização para editar. Recomendado o pacote mínimo, sem comparador obrigatório, workflow de recuperação adicional, wizard de publicação, acesso remoto novo ou sistema financeiro/telemetria.
3. Retomada de 16/10/2026: a mensagem do usuário registra o “ok” e autoriza explicitamente aplicar P1–P8 na versão mínima, mantendo números de P7 pendentes. Essa autorização substitui as propostas iniciais somente no que foi simplificado; não aprova números visuais, Design Lock ou transição de fase.
4. Aplicação: alterado somente o documento de requisitos desta fase e atualizado este relatório. P1–P6 e P8 [APLICADO]; P7 [PENDENTE] apenas na decisão dos parâmetros, com ajustes documentais aplicados. Nenhum ponto rejeitado.
5. Decisão superveniente em 16/10/2026: o usuário encerrou o detalhamento adicional de P7/F-06 com “não preciso de mais detalhes de acessibilidade”. A pendência quantitativa dos registros anteriores fica superada. Conciliação mínima em PRD, SPEC gerada, stories e relatórios, preservando C-02 e as verificações originais. Sem novos números, entrevista, testes ou conformidade declarados; encaminhar ao mecanismo do pipeline sem pedir novamente o mesmo OK.

### Conferência documental e limites

- Base de conferência: discovery e stories de origem lidos integralmente; documento em revisão lido integralmente, com conferência dos trechos pertinentes da SPEC §§2, 3.2–3.3, 4.3–4.4, 5.3, 5.5, 6–7, 8.5 e 9 e AC-04/AC-27; integração Maestri/OMP e glossário lidos integralmente.
- P1 explicita conjuntamente SPEC §2 (decisão humana ou outra tentativa) e §5.5 (novo escopo exige GitHub e nova tentativa); não muda critérios capturados por resposta humana.
- P2 preserva cancelamento por troca de responsável; P4 preserva versão aprovada, autorização atual, reconciliação e efeitos confirmados; P5 preserva medições/verificações obrigatórias e os limites de parada do contrato de integração. P6 preserva interação nativa e restrições de acesso remoto.
- Releitura dos trechos alterados e suas referências para conferir consistência, IDs e estados. Nenhuma mudança nos documentos normativos, mecanismos, telas ou serviços adicionais; nenhuma execução de integração, provider, publicação ou teste de UI. Esta validação documental não comprova implementação ou aceite visual.
- Registro histórico da revisão anterior: parâmetros de P7 exigiam decisão antes do aceite quantitativo. Esse impedimento documental foi superado pela decisão de encerrar o detalhamento adicional; verificações de implementação/UI permanecem futuras e a aprovação segue pelo mecanismo do pipeline.

### Trechos aplicados

Os excertos abaixo reproduzem a redação histórica gravada na revisão anterior do documento de requisitos; as localizações completas estão registradas em cada ponto acima. As referências de P7 a parâmetros pendentes foram superadas pela decisão posterior de encerrar esse detalhamento; os excertos são preservados como evidência anterior.

**P1**

> **RF-29**: Detectar mudança semântica dos critérios capturados; decisão humana de manter o escopo original permite continuar dentro dele. Adotar novos critérios exige atualização no GitHub e outra tentativa, sem substituir o escopo capturado nem incorporar escopo de comentário livre.

**P2**

> **RF-40**: Suspender avanço por Status incompatível, mostrar Status observado/esperado e orientar correção no GitHub; oferecer Revalidar usando as verificações existentes de autoridade e Status, liberando continuidade só após resolver a divergência, sem outro impedimento. Manter Cancelar; mudança de responsável segue RF-39, sem tomar posse de trabalho de outra máquina.

**P3**

> **RF-21**: Detectar conflito entre edições concorrentes, preservar o rascunho local e permitir recarregar dados atuais, reaplicar alterações desejadas e salvar com o controle de versão existente; novo conflito preserva novamente o rascunho e não informa Salvo. Não exigir comparador ou merge campo a campo.

**P4**

> **RF-75**: Oferecer Aumentar modo no detalhe de entrega aprovada de tentativa encerrada: escolher modo superior, resumir efeitos adicionais e obter autorização única, reutilizando publicação e revalidações existentes. Usar a mesma versão aprovada, preservar efeitos confirmados e informar impedimentos; Concluir publicação trata os efeitos já autorizados.

**P5**

> **RF-61**: Mostrar no detalhe tempo ativo e espera humana separados, limites efetivos de tempo/custo e TTL da pergunta, usando os dados disponíveis no runtime/estado existente. Distinguir limite não configurado de medição indisponível; registrar e mostrar expiração quando ocorrer e distinguir solicitação de parada de parada confirmada/limpeza incerta conforme US-14. Silêncio do terminal não prova falha. Indisponibilidade não dispensa medição ou verificação obrigatória: registrar causa, requisito afetado e pendência, sem declarar cumprimento. Não acrescentar dashboard financeiro, estimador, cobrança ou sistema de telemetria.

**P6**

> **RF-45**: Disponibilizar abertura da superfície nativa de interação da passagem somente em contexto suportado; quando indisponível, informar o motivo e orientar usar o Maestri no host executor, sem novo acesso remoto.

**P7**

> **RNF-17**: As jornadas Projetos, Operação, Tentativa e Configuração devem ser utilizáveis em desktop e celular e cobrir os três modos. Na validação de UI pelo navegador de teste, registrar dimensões da viewport, conteúdo, ações, estados e screenshots; verificar acesso às ações pertinentes e legibilidade do conteúdo sem sobreposição ou corte que impeça seu uso. Larguras/resoluções de referência ainda dependem de decisão explícita do usuário; não há aceite quantitativo ou visual declarado.

> **RNF-18**: Ações e formulários devem ser operáveis por teclado, com foco visível e nomes acessíveis computados; verificar acionamento pelo teclado e registrar foco e nomes. Medir e registrar razões de contraste e percentuais de zoom utilizados, verificando acesso ao conteúdo e às ações nessas condições. Nível de conformidade, razões mínimas de contraste e percentuais de zoom de referência dependem de decisão explícita do usuário antes do aceite quantitativo. Medição indisponível registra causa e requisito pendente, sem dispensar a verificação obrigatória ou declarar aceite visual. Não acrescentar funcionalidades de produto para essas verificações.

**P8**

> **RF-05**: Receber nome, template, destino, modalidade e branch-base efetiva revisável antes de Criar no formulário de criação, com campos remotos somente quando pertinentes.

> **RF-06**: Gerar plano sem efeitos com destino canônico, identidade do template, arquivos, configuração de engenharia, branch-base, conta e efeitos previstos.

> **RF-08**: Gerar scaffold local com Git e baseline Conventional Commit na branch-base escolhida, mantendo a mesma escolha no cadastro do projeto.

> **RF-10**: Publicar baseline na branch-base escolhida somente na modalidade remoto com push.

> **RF-12**: Exibir a conclusão da criação com pasta, baseline, branch-base resultante e efeitos remotos confirmados, permitindo abrir o projeto.

## Próximo passo

P7/F-06 encerrado por decisão explícita do usuário de não acrescentar detalhamento quantitativo de acessibilidade. Encaminhar os ajustes ao orquestrador para concluir a aprovação da SPEC pelo mecanismo do pipeline com a resposta já recebida, sem nova entrevista ou repetição do mesmo OK. Preservar verificações de desktop/celular, teclado, foco visível, nomes acessíveis, legibilidade, contraste/zoom medidos, conteúdo e screenshots via Playwright MCP/Chrome. Não declarar testes, conformidade ou aceite visual comprovados nem simular a transição de fase. Ler este relatório antes de toda resposta de continuidade.
