# Sugestões de enriquecimento — V4 - Retirada do legado anterior ao V3

Fontes: SPEC20261028_162109.md, PRD20261028_162109.md e stories-requisitos20261028_162109.md, neste diretório. Conferência pontual da arquitetura e dos produtores atuais no repositório canônico. E1 incorporado por decisão de suporte do usuário; E2/E3 consolidados como detalhamento técnico dentro das restrições aprovadas, conforme instrução recebida. Não houve implementação nem teste de produto.

Total: 3 sugestões, todas APLICADAS; nenhuma pendente. Este arquivo controla a continuidade; reler antes de responder e atualizar cada decisão individualmente. A confirmação de completude do documento continua pertencendo ao usuário.

## Inicialização, contratos e histórico — US-02, US-03, US-04 e US-09

- **E1** [APLICADO] [FRONTEIRA DE RECUSA DE BASES] A seção 2.1 exige reconhecer estrutura e contratos atuais antes de escrita, mas não explicita o alcance da inspeção de conteúdo: uma base de schema atual pode conter projetos atuais ao lado de revisões antigas com quatro estados ou planos antigos em criações concluídas. A retirada dos leitores e a preservação de históricos atuais estão definidas; falta explicitar se a presença desses registros antigos não ativos recusa a instalação inteira ou somente sua leitura/operação. Não se trata da idade do registro nem de texto antigo dentro de evidências opacas.
  Opções: a) Recusar integralmente a base antes de escrita quando qualquer registro de domínio dependente de leitor retirado for identificado, incluindo revisões e criações concluídas; registros integralmente atuais continuam válidos independentemente da data. b) Admitir a base e recusar somente o recurso ou a operação dependente do formato retirado, usando os erros existentes e sem conversão ou UI nova.
  Sugestão: opção a - torna explícita a interpretação mais restritiva da recusa antes de estado operacional prevista no PRD, sem criar funcionamento parcial implícito. A aprovação precisa delimitar os registros inspecionados e preservar a exigência de consultas leves; não implica varrer o histórico em cada GET.
  Referências: SPEC 2.1, itens 3–4 e invariantes de dados; PRD Database, reconhecimento e prova negativa; US-02.C1, US-03.C2, US-04.C2 e US-09.C3.
  Resolução: opção a incorporada em SPEC 2.1, parágrafo E1. Decisão do usuário: “só tem um projeto cadastrado e é de testes, então não precisamos de compatibilidade”. A instrução subsequente delimitou recusa integral antes de escrita, sem conversão, abertura parcial ou limpeza automática; não autoriza apagar dados ou recursos. Contratos atuais permanecem válidos independentemente da data.

## Localizações de recursos — US-07

- **E2** [APLICADO] [PROJETO ATUAL SEM LOCALIZAÇÃO ALOCADA] O catálogo JSON mantém ProjectStorageView.state=legacy, embora a retirada elimine a finalidade exclusivamente antiga. O produtor atual createProjectStorageLocations.view retorna legacy sempre que não há localização corrente, sem distinguir projeto atual ainda sem recursos de projeto do layout antigo. Remover esse estado pelo nome pode quebrar um cadastro atual; preservá-lo sem explicar sua finalidade pode conservar o contrato que se pretende retirar. Falta definir a representação suportada desse caso legítimo.
  Opções: a) Para projeto atual que ainda não precisou alocar recursos, usar o estado existente current com managed_root=null e locations vazia; referência obrigatória ausente numa operação continua recusada pelos mecanismos existentes. Retirar legacy se o inventário comprovar que os usos restantes são exclusivamente antigos. b) Usar o estado existente blocked enquanto não houver localização corrente, preservando a alocação pelos mecanismos já existentes. c) Conservar legacy para esse caso atual, documentando sua semântica técnica e comprovando que não mantém leitura, fallback ou transição do layout antigo.
  Sugestão: opção a - distingue ausência legítima antes da alocação de referência inválida durante uma operação, sem acrescentar estado, texto, controle ou percurso. A representação deve ser coerente em contrato, produtor e consumidor; não alterar o tratamento visual além do escopo aprovado.
  Referências: SPEC 2.1, localizações e transições atuais; catálogo 3.2, ProjectStorageView; PRD RF-18 a RF-20. Evidência de código: apps/controller/src/modules/storage/project-storage-locations.ts, função view; packages/contracts/src/workspaces.ts, ProjectStorageView.
  Resolução: recomendação técnica a consolidada em SPEC 2.1, parágrafo E2, e no catálogo 3.2, removendo legacy de ProjectStorageView.state. current com localização nula/lista vazia antes da alocação preserva ações atuais; referência obrigatória inválida continua recusada. Detalhamento técnico dentro das restrições aprovadas, conforme instrução recebida, sem atribuir ao usuário escolha explícita entre alternativas.

## Preservação da interface e desempenho — US-09 e US-10

- **E3** [APLICADO] [REFERÊNCIA REPRODUZÍVEL DE COMPARAÇÃO] A SPEC exige preservar comportamento atual, comparar schema/UI antes e depois e medir desempenho frente a baseline, mas não fixa como identificar a versão de referência nem como tornar reproduzíveis dimensões/zoom, dados e condições da medição. Sem esse registro, duas avaliações podem comparar versões ou cenários diferentes. Não falta um novo layout, copy, skeleton, permissão ou teto de desempenho.
  Opções: a) Antes de implementar, registrar em evidência a revisão Git e, havendo alterações locais, hashes dos arquivos pertinentes, além da identificação do bundle, fixtures, ambiente, dimensões/zoom e parâmetros das medições. Repetir os mesmos cenários após a retirada; qualquer tolerância quantitativa não existente depende de decisão explícita. b) Fixar somente a revisão de referência e selecionar/documentar os cenários de comparação durante a execução das provas.
  Sugestão: opção a - torna verificáveis as obrigações já existentes sem nova meta numérica, nova UI ou cópia de checkout/banco operacional. Esses registros são evidências da comparação, não um mecanismo de backup ou uma reclassificação de provas anteriores.
  Referências: SPEC, plano de comprovação, RNF-06/RNF-10, prova de schema em 2.1 e seções 4.5–4.6; PRD RNF-05/06/10 e indicadores de sucesso.
  Resolução: recomendação técnica a consolidada na seção 1 da SPEC, junto ao plano de comprovação, parágrafo E3. Procedimento reproduzível por revisão/hashes, bundle, fixtures, ambiente, dimensões/zoom e parâmetros, sem novas metas, segredos, cópia de banco operacional ou snapshots de checkout. Não é declaração de escolha explícita do usuário entre alternativas.

## Mapa de cobertura

| Feature | Resultado da análise de cobertura |
| --- | --- |
| US-01 — Instalação atual | Bootstrap direto, seeds, recursos distribuídos, reinício e condição de coerência dos metadados já definidos. A representação técnica de schema_migrations está explicitamente condicionada a demonstração e decisão se houver impedimento; não é uma nova decisão presumida. |
| US-02 — Recusa de bases | Recusa sem escrita, integridade e ausência de UI adicional definidos; E1 delimita bases com registros mistos. |
| US-03 — Quadro atual | Cinco IDs distintos, recusa de quatro estados e semântica Ready definidos; E1 inclui revisões persistidas não ativas. |
| US-04 — Criação | Plano integral, campos, hash, autorização, recibos, resposta perdida e retomada definidos; E1 inclui planos antigos persistidos em criações concluídas. |
| US-05 — Configuração e preparação | Composição, escolhas, opcionais/nulos, concorrência e ausência de efeitos ao salvar/consultar definidos. Não propor tornar IDs internos ou observados obrigatórios fora do estágio pertinente. |
| US-06 — Execução e recuperação | Reserva, confirmação, incerteza, vínculos de resultado/revisão e outra tentativa definidos. managed_terminal_id é FK interna; terminal_id/workspace_id observados e omp_session_id têm nulabilidade própria no dicionário. Não registrar essa distinção já presente como lacuna nova. |
| US-07 — Localizações | Layout, identidade, transição atual e recusa de fallback definidos; E2 esclarece ausência legítima de alocação. |
| US-08 — Publicação e exclusão | Versão/destino/autorização, reconciliação, posse/geração, retomada automática, substituição e recibos definidos. |
| US-09 — Registros | Leitura sem reescrita, resumos/detalhes e nulos legítimos definidos; E1 e E3 delimitam suporte e referência de comparação. |
| US-10 — Interface | Tokens, hierarquia, loading/vazio/erro atuais, foco e navegação preservados; zero acréscimos. E3 torna a comparação reproduzível, incluindo dimensões e zoom, sem propor responsividade ou copy novos. |

Limites de inputs, paginação, timeouts e capacidade constam do catálogo 3.2 e de 3.3. Não há upload multipart novo. Acesso conserva sessão técnica, perímetro, CSRF e autorização de domínio; não há usuários/roles novos. Cores e componentes constam de 4.2/4.5; estados existentes de 4.6. Não transformar itens não aplicáveis desta feature de retirada em requisitos novos.

## Histórico de decisões

Em 28/10/2026, incorporada a decisão “só tem um projeto cadastrado e é de testes, então não precisamos de compatibilidade”, com os limites expressos na instrução subsequente. E1 aplicado primeiro; E2/E3 consolidados individualmente como detalhamentos técnicos autorizados pelas restrições, sem atribuir escolhas explícitas de alternativa ao usuário. SPEC alterada pontualmente; código do produto, banco, projeto, pastas e evidências operacionais não foram alterados. Não foram executados testes, exclusões ou efeitos externos. Todos os itens resolvidos; aguardar confirmação de completude pelo usuário.

## Conflitos e alinhamentos documentais

- A seção 1 da SPEC desta execução já identifica exigências históricas na SPEC.md da raiz, em INTEGRACAO-MAESTRI-OMP.md e no plano: quatro estados, planos antigos, composição retroativa, backfills e resolução/transição exclusivamente antiga. Alinhar esses trechos antes do aceite da implementação, preservando garantias atuais e registros históricos; esses documentos não foram alterados nesta execução. A referência é o conflito previamente registrado no PRD/SPEC, sem alegar nova auditoria integral desses documentos.
- A inconsistência interna de ProjectStorageView.state admitir legacy foi resolvida no catálogo desta SPEC. O produtor e os consumidores atuais ainda precisam ser alinhados na implementação; a edição documental não comprova mudança do produto.
- PRD e stories exigem recusa de incompatíveis sem escrita e preservação dos contratos atuais; E1 explicita o alcance integral, incluindo registros mistos, sem criar exceção para o projeto de testes. E2/E3 detalham sua execução e comprovação sem ampliar a interface. Não foi identificada necessidade de alterar o escopo desses documentos de referência por essas decisões.
- A condição técnica já registrada em SPEC 2.1 sobre representação coerente de schema_migrations continua exigindo demonstração na implementação e decisão específica se houver impedimento. A dispensa de compatibilidade não autoriza inventar execução de migrations, modificar checksums existentes ou dispensar a integridade.
