> Revisão de escopo preparada em 2026-10-21 para continuação. Não aprova nem inicia pipeline. Os documentos originais do run encerrado permanecem como histórico.

# Architecture Decisions: nova-fabrica-software/20261021_150214-1ec379

## Context
- **Selected candidate:** C4
- **Source files:**
  - C:\Users\jeffe\Documents\Apps\nova-fabrica-software\.lionclaw\pipelines\architecture-review\20261021_150214-1ec379\ArchitectureMap-20261021_150214-1ec379.md
  - C:\Users\jeffe\Documents\Apps\nova-fabrica-software\.lionclaw\pipelines\architecture-review\20261021_150214-1ec379\ArchitectureCandidates-20261021_150214-1ec379.md
  - C:\Users\jeffe\Documents\Apps\nova-fabrica-software\.lionclaw\pipelines\architecture-review\20261021_150214-1ec379\ArchitectureDiagnosis-20261021_150214-1ec379.md

---

## D1 - Priorizar carregamento por custo observado
- **Pergunta:** Você prefere que a primeira fatia seja escolhida pelo maior custo comprovado no baseline, como recomendo, ou quer priorizar uma experiência específica, mesmo que outro percurso custe mais?
- **Opcoes consideradas:** Escolher a primeira fatia pelo baseline do percurso completo; priorizar previamente uma tela ou experiência específica.
- **Decisao:** Adotar o baseline do percurso completo para escolher a primeira fatia do C4, priorizando tempo até conteúdo útil aparecer e frequência de uso, além da quantidade de chamadas e do custo total. Não há preferência por uma tela específica. Priorizar eliminação de trabalho duplicado e consultas desnecessárias.
- **Razao:** O usuário aceitou a recomendação e reafirmou o objetivo: otimizar processos e consultas para obter carregamentos mais rápidos. Delegou os detalhes técnicos dentro dessa direção, reservando escolhas reais de comportamento, escopo ou risco e a aprovação final do checkpoint no modo semi.
- **Implica:** Comparar cenários reproduzíveis antes/depois de abertura das telas, atualização da fila e observações durante etapas. Contar requisições locais, chamadas GitHub/GraphQL e consultas SQLite pertinentes e medir latência até conteúdo útil aparecer. Definir critérios mensuráveis a partir do baseline, sem inventar metas ou ganhos comprovados. Aprofundar os Modules donos das leituras conforme evidência de custo, buscando Depth, Leverage e Locality; não definir Interface final nesta entrevista nem aprovar refatoração geral. Preservar correção, falhas visíveis e revalidações atuais antes de execução/publicação; observação de exibição não passa a autorizar efeitos. Reduzir atualidade dos dados ou mudar comportamento perceptível exige explicitar a consequência e obter decisão do usuário. Esta decisão não autoriza execução externa, implementação ou avanço de fase; o checkpoint final continua pertencendo ao usuário.

### Critérios técnicos complementares da D1
- Comparar separadamente o primeiro carregamento e as atualizações subsequentes, registrando as condições de cada cenário para repetir a comparação antes/depois.
- Medir tempo até conteúdo útil e distribuição das latências, incluindo mediana e percentis com amostra suficiente para sustentá-los. Registrar quantidade de amostras e variação; a média isolada não comprova melhoria.
- Observar como latência e quantidade de consultas variam com o crescimento de projetos e issues, mantendo cardinalidades e condições registradas e comparáveis.
- Investigar como hipóteses do baseline: leituras simultâneas equivalentes que possam ser deduplicadas, atualizações causadas por eventos sem relação com os dados exibidos e consultas de detalhes dispensáveis para resumos. Nenhuma dessas hipóteses determina antecipadamente a Implementation.
- Qualquer compartilhamento de resultados deve respeitar projeto, conta, parâmetros e finalidade, preservando isolamento, invalidação, completude e as revalidações de autorização. Semelhança de consultas não comprova equivalência de finalidade ou autoridade.
- Manter instrumentação enxuta, com contadores, categorias e durações suficientes para atribuir custo; não registrar segredos nem persistir conteúdo pesado. Infraestrutura de observabilidade adicional depende de necessidade concreta demonstrada.
- Cache com dados mais antigos, menor frequência de atualização percebida ou pausa em segundo plano não estão autorizados automaticamente. Se uma proposta exigir essas mudanças, explicitar a consequência e obter decisão do usuário antes de adotá-la.
- Estes refinamentos operacionalizam a D1 e não constituem nova escolha de produto ou risco, aprovação de implementação, encerramento da entrevista ou aprovação do gate.

## D2 - Critérios de medição do percurso
- **Pergunta:** Quais critérios devem orientar a medição e a comparação antes/depois do C4, conforme os termos já aprovados?
- **Opcoes consideradas:** Medir primeira abertura e atualizações separadamente, conteúdo útil, distribuição das lentidões, escala e consultas repetidas ou desnecessárias, conforme os critérios complementares da D1.
- **Decisao:** Formalizar os critérios já aprovados: comparar primeira abertura e atualizações subsequentes; medir tempo até conteúdo útil, quantidade e custo das chamadas e consultas, distribuição das latências com mediana e percentis sustentados por amostra suficiente; registrar amostras, variação, condições e cardinalidades de projetos e issues. Investigar leituras simultâneas equivalentes, atualizações sem relação com os dados exibidos e detalhes dispensáveis para resumos como hipóteses, sem antecipar a Implementation.
- **Razao:** O usuário confirmou expressamente que estes são os mesmos critérios já aprovados e solicitou seu registro como D2 para organizar o arquivo e atender ao mínimo estrutural do gate, sem nova escolha ou ampliação de escopo.
- **Implica:** A SPEC deve usar comparações reproduzíveis antes/depois e metas derivadas do baseline, sem inventar ganhos ou limites numéricos. A investigação orienta a primeira fatia por impacto medido e frequência, conforme D1; não fixa Interface final nem autoriza refatoração geral.

## D3 - Preservar correção e autoridade das leituras
- **Pergunta:** Quais garantias devem ser preservadas ao otimizar as leituras do C4, conforme os termos já aprovados?
- **Opcoes consideradas:** Preservar atualidade, correção, isolamento e invalidação, revalidações antes de execução/publicação e instrumentação enxuta, conforme a D1 e seus critérios complementares.
- **Decisao:** Preservar atualidade, correção, completude e falhas visíveis. Qualquer compartilhamento de resultados deve respeitar projeto, conta, parâmetros e finalidade, com isolamento e invalidação. Manter revalidações de autorização antes de execução/publicação: observação para exibição não autoriza efeitos. Usar instrumentação enxuta com contadores, categorias e durações suficientes para atribuir custo, sem segredos nem persistência de conteúdo pesado.
- **Razao:** O usuário confirmou expressamente estas garantias como termos já aprovados e solicitou seu registro como D3, sem inventar escolhas ou ampliar escopo, reafirmando o encerramento da entrevista nesses termos.
- **Implica:** Semelhança de consultas não prova equivalência de finalidade ou autoridade. Dados mais antigos, menor frequência percebida de atualização ou pausa em segundo plano exigem explicitar a consequência e obter decisão do usuário antes da adoção. Infraestrutura adicional de observabilidade depende de necessidade concreta. Este registro apenas formaliza garantias existentes; não autoriza implementação, execução externa ou avanço de fase. O fechamento pelo botão da UI permanece com o usuário.

## D4 - Autorização operacional para implementação e validação
- **Fonte:** Correção de escopo esclarecida pelo usuário em 2026-10-21: o pedido de instruções para trabalhar e validar não autoriza incluir mudanças no LionClaw como entregável.
- **Decisao:** Os executores estão autorizados, dentro do escopo aprovado, a ler e editar código no repositório canônico, executar comandos, testes e medições, gerenciar somente servidores e recursos próprios, usar Playwright MCP e interagir com Maestri pelos helpers do manual Wire. Resolver manutenção operacional reversível autonomamente, preservando terceiros, segredos e limites de efeitos. Esta orientação não exige consultar ou alterar handlers, perfis, seeds, configuração ou internals do LionClaw, nem comprovar a composição de prompts ou configuração resolvida. Limitações técnicas concretas devem ser relatadas quando encontradas, sem criar certificação ou gate de capacidade. A validação normal da implementação permanece obrigatória.
- **Limites:** Reutilizar o servidor adequado em 127.0.0.1:4310; iniciar e encerrar apenas recursos próprios quando necessário. Ler ensaios-fabrica/MANUAL-MAESTRI-WIRE.md antes de usar os helpers. Publicação, ações destrutivas e consumo pago indiscriminado exigem autorização correspondente. Preservar os checkpoints do modo vigente.
- **Correção histórica:** Substitui, somente nesta revisão para continuação, a exigência anterior de promoção ao handler/perfil e de evidência do contexto efetivo. Não reclassifica a avaliação do run encerrado nem elimina falhas de testes.
