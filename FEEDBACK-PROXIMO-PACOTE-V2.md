# Feedback para o próximo pacote V2

## Recuperação de criação parcial de projeto

Registrado em 19/10/2026. Pendência de produto, sem autorização para implementação ou início de pipeline.

### Problema observado

A criação remota de `teste667` parou ao preparar o baseline Git local, com `SCAFFOLD_GIT_FAILED`. A pasta, os arquivos e o registro da criação ficaram preservados, mas o projeto não apareceu no catálogo porque o cadastro não foi concluído. Nenhum efeito remoto foi iniciado nessa tentativa.

A causa técnica foi corrigida: a proteção dos diretórios no Windows impedia a gravação do índice Git. Essa correção não conclui criações parciais anteriores.

### Lacuna atual

A reconciliação existente confere efeitos já realizados, mas não executa as etapas restantes. O operador não consegue retomar uma criação parcial pela interface, e a reserva do destino permanece no banco mesmo após a falha. Neste caso, foi necessária limpeza manual solicitada pelo usuário.

### Pendência para definição do próximo pacote

- Tornar criações parciais localizáveis pela interface, com motivo da falha, caminho preservado, etapas concluídas e etapas pendentes.
- Oferecer retomada explícita e segura das etapas restantes, após revalidar conta, configuração, plano e propriedade dos arquivos.
- Conferir efeitos incertos antes de continuar, sem repetir criação de repositório, push ou adotar remoto existente indevidamente.
- Definir uma ação explícita para descartar a criação parcial e liberar sua reserva, explicando o tratamento dos arquivos locais e dos recursos remotos. Não apagar trabalho automaticamente.

### Validação esperada

Cobrir falha antes do baseline, falha após criação do remoto, resposta remota incerta e reinício do controlador. A recuperação deve preservar alterações do usuário, impedir duplicação de efeitos e concluir o cadastro somente quando todas as etapas exigidas estiverem confirmadas. Referências: SPEC 3, AC-02 e AC-03.

## Experiência de criação expõe linguagem e dados internos

Registrado em 19/10/2026, após o usuário concluir uma nova criação de `teste667`. Este relato é distinto da tentativa parcial anterior. Registro documental, sem implementação ou alteração do repositório remoto.

### Problemas observados

- O usuário relatou um percurso confuso na fábrica, com mensagens em inglês, IDs e informações técnicas desnecessárias, contrariando a experiência já exigida na SPEC.
- A imagem do repositório criado mostra a descrição visível em About ocupada por marcadores `Factory-Creation` e `Factory-Operation`, com identificadores e hash internos, em vez de uma descrição útil do projeto.
- O README gerado tem o título genérico `Project` e instruções em inglês. Solicita configurar um remoto GitHub mesmo quando a modalidade escolhida já criou e associou esse remoto.
- O commit inicial aparece como `chore: initialize project`, atribuído a `Factory`. Esses textos gerados também devem ser avaliados na revisão do conteúdo apresentado ao operador.
- No fluxo acompanhado nesta conversa, a fábrica apresentou UUID de operação e termos de persistência, recibo, POST e reconciliação como orientação principal de recuperação.

O relato sobre a fábrica e o conteúdo gerado por ela não atribui à aplicação os rótulos em inglês da interface nativa do GitHub.

### Resultado esperado

- Orientação ao operador em português claro, com resultado, motivo compreensível de eventual falha e próxima ação disponível na tela.
- IDs, hashes e estados internos fora da apresentação principal; diagnósticos técnicos somente sob demanda, quando necessários.
- Descrição do repositório e README úteis ao projeto, coerentes com as escolhas e com as etapas efetivamente concluídas. Não pedir novamente uma configuração já realizada.
- Metadados necessários à identidade e à reconciliação não devem ocupar a descrição visível do repositório. Definir uma solução que preserve a confirmação segura dos efeitos, sem simplesmente remover as garantias existentes.

### Lacuna de validação

Testes automatizados, typecheck, lint e build aprovados não comprovaram conformidade com os requisitos de experiência. A verificação anterior da disponibilidade das modalidades remotas também não cobriu o percurso completo e o conteúdo final publicado.

Validar a jornada completa nas três modalidades, incluindo plano, progresso, conclusão e recuperação de falhas, usando Playwright MCP/Chrome para a interface. Conferir também os artefatos gerados e, em execução remota autorizada, a descrição e o conteúdo efetivamente publicados. A conclusão deve deixar claro o que foi criado, o que falta configurar e a próxima ação, sem exigir interpretação de identificadores técnicos. Referências: SPEC 3, 9 e 10.2; AC-02, AC-03 e AC-27.

## Auditoria prática da interface em 19/10/2026

### Escopo e evidência

Aplicação em execução em `http://127.0.0.1:4310`, examinada com Playwright MCP. Percorridos Principal, Projetos, configuração do projeto, Perfis, Fila Ready, Tentativas, Registros, Adicionar existente, Preparar issue, formulário de criação, plano sem efeitos e detalhe da criação concluída de `teste667`. Viewports de 1440 × 1000 e 390 × 844.

O plano de auditoria foi apenas consultado; a ação final Criar não foi executada. Não foram salvas configurações, habilitada automação, iniciadas tentativas ou feitas publicações. A criação concluída inspecionada já existia. Não se presume que uma deficiência observada em uma tela comprove falha de execução do provider.

Referências normativas: SPEC 3 e 9, AC-02, AC-03 e AC-27. Prioridades abaixo são recomendações de correção, sem início de implementação ou pipeline.

### Achados confirmados

| Item | Prioridade | Problema e impacto | Evidência / reprodução |
| --- | --- | --- | --- |
| V2-01 | Alta | Seletor de GitHub Project permanece vazio apesar de haver quadros disponíveis. Impede completar o mapeamento pela tela. | Abrir a configuração de `teste667` e recarregar. A tela carrega a configuração, mas não solicita `configuration-options`; só mostra “Selecione…”. Consulta manual somente leitura ao mesmo endpoint retorna HTTP 200, `completeness: complete`, três quadros e nenhum diagnóstico. |
| V2-02 | Alta | “Criar projeto” pode reabrir a criação anterior em vez de permitir uma nova. | Abrir o detalhe da criação concluída, fechar e clicar Criar projeto. O parâmetro `creationId` continua na URL e o diálogo apresenta o resultado anterior sob o título Criar projeto. Sem esse parâmetro, o formulário aparece normalmente. |
| V2-03 | Média | Criação concluída aparece dentro de um diálogo chamado “Criação parcial”. | Detalhe da criação de `teste667`: título externo Criação parcial e resultado interno Criação concluída, com estado `completed`. A rota pós-aceite usa o diálogo `partial` independentemente do resultado. |
| V2-04 | Alta | Efeitos remotos aparecem duas vezes e geram chaves React duplicadas. | Na criação concluída, criar repositório, associar origin e publicar baseline aparecem em duas séries. Console registra três avisos de chave duplicada, um por operação. Não é evidência de que o efeito remoto foi executado duas vezes. |
| V2-05 | Alta | Textos de pré-requisitos em inglês chegam diretamente à experiência principal. | Catálogo e resultado da criação mostram “GitHub Project and Status mapping are missing.”, “Both execution roles require profiles.” e “Registration and configuration do not authorize execution.”, inclusive orientações para configurar IDs exatos. |
| V2-06 | Alta | Plano e conclusão priorizam hashes, IDs e estados internos, sem recolhimento técnico. | Plano mostra digest do template, identidade do diretório pai e SHA-256 de cada arquivo. Conclusão mostra UUID, `confirmed`, `refs/heads/main`, SHA do commit e IDs GitHub. Formulário mostra nome e resumo do template em inglês e ID da conta. |
| V2-07 | Alta | Preparação sem opções omite a causa conhecida e não oferece recuperação. | Preparar `teste667`: lista de issues vazia e aviso apenas “Opções indisponíveis”. Resposta HTTP 200 informa `completeness: unavailable` e um pré-requisito `PROJECT_REQUIRED`; o aviso renderiza diagnósticos, mas ignora os pré-requisitos da resposta. Não há ação contextual para abrir o mapeamento necessário. |
| V2-08 | Média | Preparação não identifica o projeto pelo nome. | Campo Projeto apresenta o texto fixo “Projeto associado à preparação”, embora `teste667` esteja selecionado. O identificador fica no suporte técnico, sem substituir a identificação legível que falta. |
| V2-09 | Alta | Ajuda da configuração contradiz os requisitos de início manual. | Texto “Controles opcionais” permite deixar o quadro quando o fluxo não precisar dele; a ajuda do seletor menciona apenas fila e projeções. A preparação real está bloqueada pela falta do quadro. SPEC AC-05 exige Project e vínculo da issue para início em todos os modos. |
| V2-10 | Alta | Registros e diagnóstico não transformam situações conhecidas em orientação útil. | Evento da criação aparece como “Atualização técnica registrada” e estado não reconhecido. Diagnóstico mostra dois cartões genéricos “Atenção necessária” cuja próxima ação é abrir Registros e diagnóstico, embora o usuário já esteja nessa tela. |
| V2-11 | Média | A fila exige interpretação de IDs e de critérios internos. | Mostra texto extenso de ordenação por ID/fallback e orienta “Configure os IDs do Project e do repositório”. Conta aparece Indisponível enquanto o Principal mostra a conta vinculada; não explica a diferença entre essas observações. Não foi comprovada falha de autenticação. |
| V2-12 | Média | Histórico e diagnóstico exigem referências técnicas em vez de seleção por nome. | Tentativas usa campo Projeto com placeholder ID e botão Aplicar projeto. Diagnóstico usa ID do contexto para escolher projeto/criação/tentativa. O operador precisa descobrir referências que o próprio produto já conhece. |
| V2-13 | Média | Catálogo no celular perde legibilidade e esconde ações na rolagem horizontal. | Em 390 × 844, pré-requisitos quebram em colunas de poucas letras, o caminho fica fragmentado e as ações ultrapassam a área visível. A tabela permite rolagem horizontal, mas não oferece uma apresentação adequada ao tamanho disponível. |

### Causas localizadas nos arquivos atuais

- **V2-01:** `apps/web/src/features/projects/ProjectForm.tsx`: o efeito de consulta retorna enquanto `draft.project` ainda não existe. Quando o carregamento termina com mapeamento vazio, as dependências usadas pelo efeito continuam iguais; a disponibilidade do draft não é uma dependência. O endpoint funciona, mas a consulta inicial não acontece.
- **V2-02 e V2-03:** `apps/web/src/app/AppShell.tsx` e navegação dos diálogos: contexto de criação anterior chega novamente a `ProjectCreationDialog`; o aceite seleciona `dialog=partial`, cujo título é fixo.
- **V2-04:** `apps/web/src/features/projects/ProjectCreationDialog.tsx`, componente do resultado: concatena `effects` com `remoteEffects`, usando o mesmo ID de operação como chave nas duas projeções.
- **V2-05 e V2-06:** `apps/web/src/app/PrincipalScreen.tsx` e `apps/web/src/features/projects/ProjectCreationDialog.tsx` apresentam mensagens e dados internos diretamente. A existência de `OperatorSupport` e de um catálogo de traduções em outras telas não protege essas superfícies.
- **V2-07 e V2-08:** `apps/web/src/features/preparations/PreparationDialog.tsx`: aviso de consulta incompleta usa `issues.diagnostics`, sem apresentar `issues.prerequisites`; nome do projeto é uma string fixa.
- **V2-09:** `apps/web/src/features/projects/ProjectForm.tsx` e `FieldHelp.tsx`: revisar a orientação contra AC-05, sem relaxar o requisito funcional apenas para fazer a tela parecer disponível.
- **V2-10:** `apps/web/src/app/operator-language.ts` reconhece eventos `scaffold.created`/`scaffold.reconciled`, enquanto a persistência em `apps/controller/src/modules/storage/creations.ts` emite `creation.accepted`, `creation.completed` e eventos por etapa. As respostas genéricas de diagnóstico também escondem a causa e não conduzem à configuração correspondente.

### Evidências visuais locais

- `.playwright-mcp/audit-v2-preparation.png`: preparação sem opções e sem próxima ação.
- `.playwright-mcp/audit-v2-creation-completed.png`: título contraditório, dados internos e efeitos duplicados.
- `.playwright-mcp/audit-v2-creation-plan.png`: plano com hashes e identidade do diretório na apresentação principal.
- `.playwright-mcp/audit-v2-project-config.png`: configuração com seletor vazio e orientações técnicas.
- `.playwright-mcp/audit-v2-mobile-projects.png`: catálogo em viewport móvel.
- `.playwright-mcp/audit-v2-mobile-register.png`: formulário existente no viewport móvel.

### Sequência recomendada para o próximo pacote

1. Destravar a seleção do quadro e tornar os impedimentos da preparação acionáveis, com ajuda coerente com o contrato.
2. Corrigir identidade e navegação dos fluxos de criação, eliminar duplicação de efeitos e validar os estados de sucesso, falha e recuperação.
3. Revisar todas as mensagens, seletores, diagnósticos e artefatos gerados. A apresentação principal deve usar nomes e ações compreensíveis; dados técnicos ficam sob demanda.
4. Validar novamente o percurso completo em desktop e celular, com os mesmos dados observados, em vez de encerrar o aceite após conferir botões ou compilar.

### Limites desta auditoria

Não foram executadas criação remota adicional, execução de agente/provider, correção automática, revisão, cancelamento ou publicação. Telas de tentativa ativa, diff, entrega e perguntas durante execução não foram verificadas com dados reais porque não havia tentativa cadastrada. Não foram testados todos os conflitos de edição, falhas de rede, acessibilidade por teclado, contraste e zoom; esses itens permanecem parte do aceite, não presumidamente aprovados.

A falta de seleção dos perfis e do quadro em `teste667` é um estado de configuração observado. Ter perfis globais cadastrados não comprova que estejam associados ao projeto. O defeito confirmado é impedir ou explicar mal a configuração, não exigir pré-requisitos previstos na SPEC.
