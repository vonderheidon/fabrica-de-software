# Validação persistente do plano de sprints

Data: 16/10/2026. Fase: validação de sprints do Development Pipeline 2.0, modo semi.

**Resultado atual: PASS DOCUMENTAL após as correções S1–S5. Aprovação final do plano pendente do usuário.** O usuário confirmou “sim” às propostas e autorizou sua aplicação e revalidação. Os cinco achados foram tratados no plano, com cobertura planejada integral dos percursos e obrigações mapeados. O JSON foi atualizado para versão 2: 34 sprints, 97 features e 84 rounds estimados. Nenhum gate foi acionado e nenhum comportamento do produto foi declarado comprovado por esta validação.

## 1. Continuidade, fontes e método

O relatório indicado não existia na retomada inicial. Este arquivo iniciou o registro persistente desta validação; não reconstrói uma aprovação anterior. Na análise inicial, o plano principal e `sprints.v1.json` tinham os mesmos bytes. Após a concordância com S1–S5, somente o plano principal foi ajustado; a versão v1 foi preservada. As decisões anteriores foram recuperadas dos documentos atuais e preservadas.

Leitura integral concluída antes da comparação:

- `SPEC20261016_073031.md`: 799 linhas.
- `sprints20261016_073031.json`: 2.879 linhas, incluindo projeto, configuração, features, critérios, hints, dependências e metadados.
- `../../SPEC.md`: 494 linhas.
- `../../INTEGRACAO-MAESTRI-OMP.md`: 130 linhas.
- `../../GLOSSARY.md`: 90 linhas.
- `stories-requisitos20261016_073031.md`: 639 linhas; critérios integrais US/RF/RNF incorporados pela SPEC.
- `../../AGENTS.md`: regras do repositório.

Consultas complementares: IDs de telas/componentes e ações do `design/design-contract.json`; manifest e relatório do lock; passagens pertinentes do PRD, em especial C-02, F-01–F-05 e encerramento de P7/F-06; registros das validações anteriores para orientação das decisões consolidadas. Não se presume leitura integral do PRD nesta validação.

A estrutura atual contém documentação, design, skills e ensaios históricos. Não existem `apps`, `packages`, `resources`, `tests` ou `package.json` na raiz. Portanto, os paths de aplicação nos hints são entregáveis futuros, não código já disponível. As referências condicionadas às sprints anteriores foram consideradas nesse contexto. Há diretório `.codegraph`, mas não foi disponibilizada ferramenta consultável de grafo nesta sessão; os arquivos atuais sustentam a análise.

Método: comparação documental de comportamentos, rastreabilidade por feature e conferência programática do JSON, unicidade, ordem das dependências e metadados de UI. Menção genérica à SPEC ou à matriz final não substitui atribuição verificável de uma obrigação específica. Cobertura planejada não significa comportamento implementado ou comprovado.

### 1.1 Identidade dos inputs da análise inicial

| Arquivo | SHA-256 observado |
| --- | --- |
| `SPEC20261016_073031.md` | `832afb91fe74b83a69f34e688decc72614da04ea904613a0e02b923481ac2588` |
| `sprints20261016_073031.json` | `15b3aaff4f151414c86cc2a3a34b1ab6a3b1a1f74d5a8af442be1fbbd66350c7` |
| `sprints.v1.json` | `15b3aaff4f151414c86cc2a3a34b1ab6a3b1a1f74d5a8af442be1fbbd66350c7` |
| `design/design-contract.json` | `2836f3616da76694c556f52006adcbe3ca9faa148a5f375b1049476ed66eca9c` |
| `design/artifact.html` | `d1a9292c070002fba41dee4741a0868c33dcad4c833253ba036910c0e1fb4c45` |

Os hashes identificam os inputs anteriores às correções. A identidade atual do plano está em §11. Não certificam identidade com o lock original e não atualizam o manifest. As contagens de linhas e citações de linhas do JSON nos achados abaixo também se referem à versão inicial preservada em `sprints.v1.json`.

### 1.2 Decisões preservadas

- C-02: retirar Login/Sair demonstrativos e abrir diretamente a Principal. `login` em metadados da sprint-005 representa retirada, não uma tela a construir.
- F-01–F-05: campos, controles e estados mínimos nas mesmas superfícies já autorizadas. Não criar tela, menu ou direção visual adicional.
- P7/F-06: encerrado o detalhamento quantitativo adicional; manter medições e verificações existentes, sem reabrir entrevista ou inventar limiares.
- Caminho real do design: `design/artifact.html`, conforme SPEC §4.1/§4.8. A referência genérica `artifact/index.html` não existe neste pacote. O nome diferente não é falha do plano nem autoriza copiar/renomear o artefato.
- Divergência histórica dos hashes: ressalva conhecida, sem bloqueio novo ou simulação de outro lock.
- Git conserva conteúdo; persistência oficial conserva metadados e evidências pertinentes. Ensaios históricos não comprovam produto.
- Sequência das fatias: manual até ICR; publicação; fila; scaffold; jornadas finais/diagnóstico/distribuição. Aprovação desta fase continua sendo decisão do usuário.

## 2. Resultado consolidado

| Dimensão | Resultado |
| --- | --- |
| Cobertura dos grandes percursos | PASS documental: 20 histórias e obrigações mapeadas; S1–S4 receberam critérios e responsabilidade explícitos. |
| Scope creep de produto | Nenhuma funcionalidade de produto fora da SPEC identificada. O registro de progresso é apoio documental, não um subsistema novo. |
| Dependências declaradas | PASS: 34 IDs únicos; nenhuma dependência inexistente, futura ou circular; índices correspondem à ordem do array. |
| Dependências semânticas e contexto | Contratos dos dois papéis disponíveis na 008 antes da captura na 009; 012 integra a revisão com esses recursos. UI consome entregas anteriores. |
| Dimensionamento | 017 dividida em histórico/detalhe (017), decisão (033) e recuperação (034); 021/024/027 reestimadas para high/3. |
| Critérios de aceite | S1–S4 agora têm condições observáveis e casos de comprovação explícitos. |
| Hints | Todas as 33 sprints após a primeira referenciam `SPEC_PROGRESS.md`; novas entregas apontam para detalhe, contratos e módulos anteriores. |
| Metadados UI | PASS nas 11 sprints com `touchesUI=true`; nenhum screenId vazio, ID inválido ou caminho de design ausente. |

Plano atual: **34 sprints, 97 features, 84 rounds estimados**, máximo de 3 rounds por sprint. Os 96 IDs de feature originais foram preservados; `feat-097` atribui explicitamente a lista histórica. As novas 033/034 têm uma feature cada, com fluxos substanciais: decisão em medium/2 e recuperação em high/3. A 017 tem duas features, high/3. Não são entregas triviais a reunir novamente. Não há duração observada ou histórico de produtividade que permita tratar estimativas como garantia. A versão inicial tinha 32 sprints, 96 features e 76 rounds.

## 3. Achados e propostas para decisão

IDs S1–S5 identificam achados deste relatório, não sprints. Evidências e propostas originais são preservadas abaixo como histórico; as decisões e localizações de aplicação registram a resolução atual. IDs antigos foram mantidos; 033/034 e feat-097 foram acrescentados.

### S1 — [APLICADO E REVALIDADO] [ALTA] Captura por tentativa de contratos e versões

**Requisito:** RF-22; SPEC normativa §3.3, linha 137; SPEC derivada §3.4, linha 411. A tentativa deve capturar configuração efetiva, identidade/versão dos contratos dos papéis, versões das ferramentas e origem das escolhas. Alterar defaults ou recursos depois não muda essa captura.

**Cobertura encontrada:** sprint-007/feat-019 prepara escolhas; sprint-009/feat-025 captura critérios/configuração/base. Os critérios desta última, linhas 648–650 do JSON, não incluem contratos dos papéis ou versões das ferramentas. sprint-018/feat-052 registra versões no roteiro de uma prova, o que não assegura captura em cada tentativa do produto. Os recursos versionados de papéis aparecem como entregável em hints da sprint-012, linha 926, depois da primeira passagem prevista na sprint-008.

**Lacuna:** cobertura parcial de RF-22 e ambiguidade de sequência dos recursos. Não se conclui que a captura geral esteja ausente, mas o plano permite concluí-la sem esses dados obrigatórios.

**Ajuste proposto no plano:** complementar os critérios de sprint-009/feat-025 com captura durável e identificável dos contratos e versões efetivamente usados, vinculada à tentativa e preservada após mudanças. Ajustar os hints da sprint-008 para que os recursos exigidos por sua primeira passagem estejam disponíveis nessa entrega; a sprint-012 pode completar os recursos pertinentes à revisão. Registrar os paths/identidades resultantes no progresso, sem depender de recurso pessoal.

**Comprovação a constar do aceite:** duas tentativas com escolhas/recursos diferentes preservam suas próprias capturas; mudanças posteriores não alteram a primeira. Ausência de informação obrigatória recebe diagnóstico/pendência, sem versão fictícia ou sucesso presumido.

**Decisão e aplicação:** “sim” recebido. Sprint-008/feat-024 exige recursos versionados dos dois papéis antes da primeira passagem; seus hints registram origem e identidades. Sprint-009/feat-025 exige captura durável por tentativa de contratos/versões/digests, ferramentas e origem das escolhas, com caso de duas tentativas e preservação após mudança. Ausência de contrato obrigatório impede despacho; versão não observável mantém diagnóstico e pendência. Hints de 009/012 consomem os recursos da 008, sem recriá-los somente depois do primeiro uso. Revalidado documentalmente.

### S2 — [APLICADO E REVALIDADO] [MÉDIA] Aviso de arquivo declarado ignorado

**Requisito:** SPEC normativa §5.2, linha 200: mostrar arquivos novos ignorados quando forem declarados como alterados. A SPEC derivada preserva esse contrato normativo em §1 e §4.7.

**Cobertura encontrada:** sprint-010/feat-028 exclui ignorados/segredos da coleta automática, linhas 726–728. sprint-017/feat-049 apresenta detalhe/diff/evidências. Nenhuma das duas atribui a indicação da divergência entre arquivo declarado e arquivo ignorado não incluído na versão.

**Lacuna:** excluir ignorados está coberto; informar essa condição específica ainda está implícito. Um arquivo declarado pode desaparecer da entrega sem explicação no detalhe.

**Ajuste proposto no plano:** explicitar essa condição no aceite da captura e sua apresentação no detalhe existente. Não acrescentar autorização por arquivo, vigilância contínua, coleta automática de ignorados ou novo fluxo visual.

**Comprovação a constar do aceite:** declarar um arquivo novo ignorado produz informação consultável na tentativa/versão; o conteúdo continua excluído da captura automática e da persistência oficial. A indicação aparece no detalhe da identidade correta.

**Decisão e aplicação:** “sim” recebido. Sprint-010/feat-028 exige aviso vinculado à tentativa/passagem/versão quando um arquivo novo declarado estiver ignorado e fora da captura, com caso controlado que verifica aviso e exclusão dos bytes. Sprint-017/feat-049 exige apresentar o aviso no detalhe correto. O aceite mantém exclusão de conteúdo ignorado e segredos e as mesmas superfícies de UI. Revalidado documentalmente.

### S3 — [APLICADO E REVALIDADO] [ALTA] Listagem paginada de tentativas na interface

**Requisito:** US-19, RF-82/86, F-05; SPEC derivada §4.2, linha 505; §4.5, linhas 613/630; §4.6, linha 659. O histórico precisa de lista navegável na aba Tentativas, com páginas e acesso ao detalhe. PRD F-05, linha 1323, explicita Anterior/Próxima para Projetos, Fila, Tentativas e Registros.

**Cobertura encontrada:** sprint-015/feat-045 entrega a listagem no backend, linhas 1149–1154; sprint-005 cria a navegação. sprint-017/feat-049 entrega o detalhe, seleção de rodada/versão e páginas das seções. sprint-029 cuida de dashboard/registros/SSE. Não há feature atribuindo a ligação da lista da aba Tentativas à consulta paginada e à seleção do detalhe. O aceite transversal da sprint-032 verifica histórico/paginação, mas não substitui a entrega dessa funcionalidade.

**Lacuna:** cobertura parcial de US-19/RF-82: API e detalhe previstos, lista de acesso na UI sem responsabilidade explícita.

**Ajuste proposto no plano:** atribuir a listagem da aba Tentativas à entrega de histórico/detalhe, antes da prova da primeira fatia. Incluir filtros disponíveis, paginação, estados de carga/vazio/erro e abertura do detalhe por identidade preservada na URL. Usar `principal`, `app-shell` e `attempt-detail`, sem outro ID de tela ou componente oficial.

**Comprovação a constar do aceite:** com mais de uma página de tentativas, navegar e abrir uma tentativa anterior mantém a seleção após atualização da ativa; erro da próxima página conserva a corrente; reload recupera contexto sem repetir mutações.

**Decisão e aplicação:** “sim” recebido. Nova feat-097 na sprint-017 atribui consumo da lista histórica, filtros de projeto/resultado suportados pela API, Anterior/Próxima, continuidade, carga/atualização/vazio/erro e abertura do detalhe na URL. O aceite usa mais de uma página e verifica erro de continuação, atualização da ativa e reload sem mutações. Nenhuma nova tela ou ID de componente oficial. Revalidado documentalmente.

### S4 — [APLICADO E REVALIDADO] [MÉDIA] Detecção de mudança relevante dos critérios

**Requisito:** RF-29; SPEC normativa §§2/5.5; SPEC derivada §3.4, linha 411. É preciso detectar mudança relevante sem substituir os critérios capturados. Alteração editorial fora dos critérios não deve encerrar trabalho.

**Cobertura encontrada:** sprint-013/feat-037, linha 968, descreve a decisão de manter escopo e a exigência de outra tentativa para adotar novos critérios. sprint-007 interpreta os critérios e sprint-009 os captura. O plano não atribui explicitamente a observação/comparação que leva ao caso de mudança nem sua distinção de edição editorial; não se exige detector semântico genérico ou outro serviço.

**Lacuna:** cobertura parcial de RF-29 e critério de aceite incompleto. É possível satisfazer a redação atual oferecendo a decisão apenas quando já existe pergunta, sem cobrir a mudança do conteúdo de entrada.

**Ajuste proposto no plano:** completar o aceite da capacidade de escopo/pergunta na sprint-013, atribuindo a identificação da mudança pertinente e o encaminhamento da decisão, preservando os critérios originais. Não alterar a regra de validação por schema/vínculo das perguntas nem acrescentar classificação de manutenção.

**Comprovação a constar do aceite:** edição editorial fora dos critérios conserva continuidade; alteração relevante dos critérios é apresentada para decisão; manter o escopo conserva IDs/textos capturados; optar pelo novo escopo não reescreve a tentativa existente e requer o percurso já definido de outra tentativa.

**Decisão e aplicação:** “sim” recebido. Sprint-013/feat-037 atribui identificação de mudança pertinente entre critérios atuais e capturados e encaminhamento da decisão. Inclui casos de edição editorial fora dos critérios, alteração relevante, manutenção da captura e nova tentativa para novo escopo. Sprint-033/feat-050 apresenta a decisão no conteúdo existente e mantém a captura original. Hints indicam os contratos/contextos consumidos. Sem classificador de manutenção ou serviço semântico genérico. Revalidado documentalmente.

### S5 — [APLICADO E REVALIDADO] [ALTA] Divisão da sprint-017 e reestimativas

**Evidência:** sprint-017, linhas 1292–1384, tem 3 rounds e três features nominais. feat-049 inclui detalhe por versão, páginas de múltiplas seções, diff, evidências e estados de falha; feat-050 inclui todos os estados de pergunta/resposta e concorrência; feat-051 reúne Cancelar, Repetir captura, Nova tentativa, Remover ambiente, Abrir terminal, Abrir pasta e confirmação de clipboard. S3 ainda precisa atribuir a lista histórica.

**Risco:** a contagem de três features mascara mais de dez responsabilidades verificáveis. Acrescentar apenas critérios mantém uma unidade grande no teto atual de rounds. Os backends já estarão disponíveis; o risco é a quantidade de fluxos e estados de UI concentrados em uma entrega.

**Ajuste proposto no plano:** separar essa unidade em três entregas consecutivas, todas antes da prova da primeira fatia:

1. Lista histórica e detalhe por rodada/versão, com leitura paginada, diff e evidências.
2. Decisão humana e resposta com recibo, estados concorrentes e preservação de texto.
3. Cancelamento, captura/retry, nova tentativa, remoção e aberturas nativas por capacidade.

Preservar IDs atuais quando possível; atribuir IDs novos e únicos às entregas adicionais, atualizar índices/dependências/contagens e transportar os mesmos metadados de UI. A sprint-018 deve depender das três entregas, mantendo o fechamento da primeira fatia antes da publicação. A decisão sobre essa divisão antecede qualquer alteração estrutural do JSON.

**Outros tamanhos a calibrar:** sprint-014, sprint-015 e sprint-020 já estão em high/3 e concentram contratos relevantes; seus limites precisam permanecer explícitos. sprint-021, sprint-024 e sprint-027 misturam UI e prova real da respectiva fatia em medium/2, enquanto a prova da primeira fatia ocupa high/3 sozinha. Recomenda-se reestimar essas três para high/3, considerando que a prova é uma entrega obrigatória, e não contar espera por autorização como round de trabalho.

**Comprovação do ajuste do plano:** cada entrega tem objetivo próprio, dependências anteriores suficientes, critérios observáveis e metadados coerentes; a soma declarada é recalculada. Estimativa continua sendo previsão, sem promessa de prazo.

**Decisão e aplicação:** “sim” recebido. Sprint-017 mantém histórico/detalhe (feat-097/049, high/3); sprint-033 recebe decisão (feat-050, medium/2); sprint-034 recebe recuperação (feat-051, high/3). Ordem no array: 017 → 033 → 034 → 018. IDs originais preservados, índices recalculados e dependências das etapas posteriores ampliadas para incluir 033/034. A prova da 018 continua antes da publicação da 019. Sprints 021/024/027 agora são high/3. Total: 34 sprints, 97 features, 84 rounds, sem exceder o limite de 3 por sprint. Revalidado documentalmente.

## 4. Matriz de cobertura das histórias

Matriz atualizada após S1–S5. `Coberta no plano` significa responsabilidade e critérios atribuídos; a comprovação do produto continua futura. Números de sprint são IDs, não posições cronológicas: 033/034 estão entre 017 e 018.

| História / capacidade | Sprints de entrega | Features principais | Situação |
| --- | --- | --- | --- |
| US-01 Cadastro e catálogo | 003, 004, 006 | 007–010, 016 | Coberta no plano |
| US-02 Scaffold nas três modalidades | 025–027 | 073–077, 079–081 | Coberta no plano |
| US-03 Criação parcial | 026, 027 | 078, 081 | Coberta no plano |
| US-04 Configuração, conflito e captura | 004, 006–009 | 011–012, 017–019, 024–025 | Coberta no plano; S1 aplicado |
| US-05 Host e perfis exatos | 004, 006, 008–009, 013 | 011, 017, 022, 024–025, 039 | Coberta no plano |
| US-06 Preparação e início | 007, 009, 013, 016, 033 | 019–020, 025, 037, 046–048, 050 | Coberta no plano; S1/S4 aplicados |
| US-07 Elegibilidade | 022, 024 | 064–066, 070 | Coberta no plano |
| US-08 Habilitação, pausa e consumo | 023, 024 | 067–072 | Coberta no plano |
| US-09 Autoridade e Kanban | 015, 023, 024, 031 | 043–044, 069, 071, 093 | Coberta no plano |
| US-10 TUI e interação nativa | 008, 014, 018, 034 | 022–024, 042, 051, 053 | Coberta no plano |
| US-11 Versão/checks/captura | 007, 009–011, 017, 030, 034 | 021, 025–033, 049, 051, 088–089 | Coberta no plano; S2 aplicado |
| US-12 Revisão/correção | 012, 017, 018 | 034–036, 049, 052 | Coberta no plano |
| US-13 Pergunta/resposta | 013, 018, 033 | 037–039, 050, 054 | Coberta no plano; S4 aplicado |
| US-14 Cancelamento/parada | 014, 018, 034 | 040, 051, 054 | Coberta no plano |
| US-15 Nova tentativa/remoção | 014, 016, 018, 034 | 041–042, 046, 051, 054 | Coberta no plano |
| US-16 ICR/Commit/PR/aumento | 015, 019–021 | 043–044, 055–063 | Coberta no plano |
| US-17 Reconciliação/conclusão | 015, 020, 021 | 043–044, 059–060, 062–063 | Coberta no plano |
| US-18 Operação atual | 028, 029 | 082–083, 085–087 | Coberta no plano |
| US-19 Histórico/detalhe | 015, 017, 021, 028–030, 033–034 | 045, 049–051, 061–062, 082–089, 097 | Coberta no plano; S2/S3 aplicados |
| US-20 Diagnóstico | 002, 008, 014, 028, 029 | 006, 022, 040–042, 084, 086 | Coberta no plano |

## 5. Rastreabilidade dos requisitos funcionais

Cada grupo abaixo enumera requisitos com responsabilidades relacionadas. S1–S4 foram atribuídos nas entregas específicas; a cobertura planejada dos 88 RF não depende somente da menção à matriz na sprint final.

| RF | Responsabilidade | Sprints / features do plano atual |
| --- | --- | --- |
| 01–04 | Cadastro/origem/local sem remoto | 003/007–009; 004/010; 006/016; 007/021 |
| 05–08 | Opções/plano/destino/baseline | 025/073–075; 027/079–080 |
| 09–10 | Remoto e publicação do baseline | 026/076–077; 027/079–081 |
| 11–12 | Engenharia em AGENTS e conclusão | 025/073,075; 027/080 |
| 13 | Criação parcial | 026/078; 027/081 |
| 14–19 | Settings/perfis/Project/checks/correções | 003/009; 004/011–012; 006/017 |
| 20–21 | Save e conflito preservando edição | 002/005; 006/018; 016/047 |
| 22 | Captura de configuração/contratos/versões | 007/019; 008/024; 009/025 — S1 aplicado |
| 23–24 | Preparação/issue/critérios | 003/009; 007/019–020; 009/025; 016/046–048 |
| 25–28 | Pré-requisitos/início/atomicidade/consulta | 002/005; 009/025; 016/048; 023/068 |
| 29 | Mudança semântica e escopo | 013/037; 033/050 — S4 aplicado |
| 30–32 | Elegibilidade/itens/paginação | 003/007,009; 022/064–065; 024/070 |
| 33–35 | Habilitação/pausa/ordem | 022/065–066; 023/067; 024/070–071 |
| 36–37 | Consumo e novo ciclo | 023/068; 024/072 |
| 38–40 | Autoridade/divergência/revalidação | 009/025; 015/043; 023/069; 024/071 |
| 41–42 | Projeção de etapas e falhas | 015/043–044; 023/069; 024/072 |
| 43–47 | Contexto/TUI/perfil/MCP/GitNexus | 008/022–024; 014/042; 034/051; 018/053 |
| 48–49 | Clone/base/captura fiel | 007/021; 010/028–029; 018/052; refinamento normativo de ignorados em S2 |
| 50 | Checks reais | 011/031–033 |
| 51–52 | Resultado exato/durável/idempotente | 009/026–027; 012/035; 018/052 |
| 53 | Captura técnica repetível | 010/030; 034/051 |
| 54–57 | Independência/parecer/achados/correções | 012/034–036; 017/049; 018/052 |
| 58–62 | Pergunta/resposta/tempos/expiração | 013/037–039; 033/050; 018/054; S4 aplicado |
| 63–64 | Revogação/parada/efeito tardio | 014/040; 034/051; 018/054; 020/059 |
| 65–68 | Interrupção/restart/retry/remoção | 014/041–042; 016/046; 034/051; 018/054 |
| 69 | ICR | 015/043–044; 018/052; 021/061,063 |
| 70 | Commit local | 019/055–057; 021/063 |
| 71–72 | Push/PR/corpo | 020/058; 021/063 |
| 73–74 | Comentário/no-op | 015/044; 019/057; 020/058; 021/063 |
| 75–76 | Aumento/materialização aprovada | 019/055; 020/060; 021/062 |
| 77–80 | Journal/reconciliação/gate/restart | 015/043–044; 019/056; 020/059–060; 026/078 |
| 81 | Dashboard | 028/082; 029/085 |
| 82 | Lista histórica e detalhe | Backend 015/045; detalhe 017/049; lista UI 017/097 — S3 aplicado |
| 83–84 | Detalhe/diff/evidências | 010/030; 011/032; 015/045; 017/049; refinamento S2 |
| 85 | Ações condicionadas | 014/042; 033/050; 034/051; 021/062; 024/071 |
| 86–87 | URL/seleção/estados de leitura | 005/014–015; 006/018; 017/049; 024/070; 028/083; 029/085–087 |
| 88 | Diagnóstico acionável | 002/006; 008/022–024; 028/084; 029/086 |

## 6. Requisitos não funcionais e critérios AC/INT

### 6.1 RNF

| RNF | Sprints principais | Observação |
| --- | --- | --- |
| 01 | 015, 028, 030 | Resumos leves e medições AC-29 |
| 02–03 | 002, 009, 023 | HTTP desacoplado/SQL curto/lock e limite automático |
| 04 | 003, 022–024 | Polling/backoff e leitura completa |
| 05–07 | 002, 005, 031, 032 | Sessão/CSRF/origem/loopback e limite do cliente remoto |
| 08–09 | 014–015, 018–021, 025–027 | Modos/autorização/recursos próprios e cancelamento |
| 10 | 003–004, 007, 018 | Origem dirty preservada e clone independente |
| 11 | 010–012, 019–021, 030 | Identidade da versão em checks/revisão/publicação |
| 12–13 | 002, 009, 013, 015, 020, 023, 026 | Durabilidade/recibo/idempotência/reconciliação |
| 14–16 | 001, 010–011, 014, 018, 030–031 | Restart, retenção Git, migrations e artefatos íntegros |
| 17–19 | 005–006, 016–017, 021, 024, 027, 029, 032–034 | UI/acessibilidade/estabilidade; lista histórica atribuída em 017/097 |
| 20 | 007–018, 031–034 | Percurso sem manutenção manual rotineira obrigatória |
| 21 | 008, 018, 031 | Windows/UTF-8/argv/cwd |
| 22–23 | 001, 025, 031 | Stack/lockfile/compilação/recursos distribuídos |
| 24 | 001, 030 | Fronteiras/imports e troca pelo contrato público |
| 25 | 001, 018, 021, 024, 027, 031–032 | Suíte isolada e provas reais explicitamente autorizadas; 018 sucede 017/033/034 |

### 6.2 AC

| AC | Sprints de entrega/prova | Situação de planejamento |
| --- | --- | --- |
| 01 | 003–004, 007, 018 | Coberto |
| 02–03 | 025–027 | Cobertos |
| 04 | 004, 006–009, 032 | Coberto; S1 aplicado |
| 05 | 007, 009, 016, 018 | Coberto; S1 aplicado |
| 06 | 008–011, 018 | Coberto |
| 07–08 | 004, 012, 018 | Cobertos |
| 09 | 010–011, 015, 017–018 | Coberto; S2/S3 aplicados |
| 10–12 | 015, 019–021, 026–027 | Cobertos |
| 13 | 010–012, 019–021 | Coberto; S2 aplicado |
| 14–15 | 008, 013, 018, 033 | Cobertos; S4 aplicado |
| 16–18 | 014, 018, 020, 030–032, 034 | Cobertos |
| 19–22 | 003, 009, 015, 022–024, 031 | Cobertos |
| 23–26 | 008, 014, 018, 031 | Cobertos |
| 27 | Sprints UI e 032 | Coberto; S3/S5 aplicados |
| 28–29 | 001, 010–011, 015, 028, 030 | Cobertos; prova específica prevista em 030 |

### 6.3 INT

| INT | Sprints de entrega/prova |
| --- | --- |
| 01–02 | 008/022; 018/052–053; 031/092 |
| 03–04 | 008/022–023; 012/034; 018/052–053 |
| 05 | 008/023; 013/037; 018/053–054 |
| 06 | 009/026; 012/035; 018/052; 032/096 |
| 07 | 013/037–038; 033/050; 018/054 |
| 08 | 014/041; 018/054; 031/092 |
| 09–10 | 008/023; 018/053 |
| 11 | 021/063; 024/072; 027/081; 032/094 |
| 12–14 | 008/023–024; 018/053; 031/091 |
| 15–17 | 014/040–042; 018/054 |
| 18 | 010–012; 018/052; 019–021; 030/089 |

Todos os INT têm prova planejada. Isso não significa prova executada nesta fase.

## 7. Dependências e ordem de execução

Ordem dos marcos atuais:

1. 001–004: fundação, proteção, consultas e projetos.
2. 005–006: shell/cadastro/configuração consumindo APIs anteriores.
3. 007–015: preparação, execução, resultado, captura, checks, revisão, pergunta, recuperação e ICR consultável.
4. 016 → 017 → 033 → 034 → 018: início, histórico/detalhe, decisão, recuperação e prova da primeira fatia.
5. 019–021: publicação e sua interface/prova.
6. 022–024: fila e sua interface/prova.
7. 025–027: scaffold e sua interface/prova.
8. 028–032: operação/SSE/diagnóstico, medições, distribuição e aceite final.

Essa sequência respeita as cinco fatias normativas. As telas de cadastro/configuração já entregam comportamento real; a existência das seis entradas do shell não significa que todos os painéis estejam funcionais na sprint-005. Dashboard e SSE completos pertencem à fatia final e não são tratados como dependências ausentes do primeiro ICR consultável por tentativa.

As dependências transitivas são frequentemente enumeradas integralmente. Isso alonga o JSON, mas não configura ciclo ou erro de ordem e não exige reorganização por si só. S1 resolveu a disponibilidade dos recursos exigidos pela primeira passagem. A divisão S5 atualizou a cadeia, mantendo publicação/fila/scaffold depois de seus marcos. Índices do array são sequenciais de 0 a 33; IDs originais não foram renumerados.

## 8. Conferência obrigatória de UI

Fontes: SPEC §4.8 e IDs do contrato atual. Telas existentes no JSON do design: `login`, `principal`; componentes: `app-shell`, `attempt-detail`, `project-form`.

| Sprint | affectedScreenIds | affectedComponentIds | designArtifactPath |
| --- | --- | --- | --- |
| 005 | principal, login | app-shell | Presente, arquivo real |
| 006 | principal | app-shell, project-form | Presente, arquivo real |
| 016 | principal | app-shell, attempt-detail | Presente, arquivo real |
| 017 | principal | app-shell, attempt-detail | Presente, arquivo real |
| 033 (após 017) | principal | app-shell, attempt-detail | Presente, arquivo real |
| 034 (após 033) | principal | app-shell, attempt-detail | Presente, arquivo real |
| 021 | principal | app-shell, attempt-detail | Presente, arquivo real |
| 024 | principal | app-shell, attempt-detail | Presente, arquivo real |
| 027 | principal | app-shell, project-form | Presente, arquivo real |
| 029 | principal | app-shell, attempt-detail, project-form | Presente, arquivo real |
| 032 | principal | app-shell, attempt-detail, project-form | Presente, arquivo real |

As 11 apontam para `C:\Users\jeffe\Documents\Apps\nova-fabrica-software\docs\Docs20261016_073031\design\artifact.html`. As outras 23 declaram backend/provas sem alteração do cliente, `touchesUI=false` e arrays vazios. Não foi encontrada alteração frontend escondida nesses escopos declarados.

**Resultado: PASS.** Zero ocorrências da condição `touchesUI=true` com `affectedScreenIds` vazio. Nenhum ID inventado e nenhum `designArtifactPath` ausente. `login` na sprint-005 tem justificativa explícita de retirada C-02 em descrição, critérios e hints. A ressalva de integridade histórica do lock permanece preservada.

`use_playwright=false` existe na configuração do projeto, mas os critérios/hints de 005, 021, 024, 027 e 032 preservam expressamente a prova Playwright MCP/Chrome. Não foi tratado como dispensa nem alterado silenciosamente. A execução futura deve registrar pendência quando a ferramenta não estiver disponível; isso não autoriza aceitar o produto integralmente.

## 9. Critérios e contexto de execução

Os critérios, em geral, possuem resultados observáveis: HTTP/erros, recibos, estados, identidade Git, integridade, conflitos e preservação de dados. Não foi identificado um critério isolado de sucesso baseado apenas em “funcionar corretamente” ou “boa UX”. Os aceites integrais de US/RF/RNF continuam obrigatórios.

Efeitos GitHub e provas Maestri/OMP dependem de autorização, alvos, perfis e custos conhecidos. O plano explicita essa dependência e mantém provas não executadas como pendentes; não se exige estado externo imutável para fingir um teste determinístico. Não é necessário obter essas autorizações para esta validação documental.

Os hints fornecem referências das entregas anteriores e nomes de interfaces. A primeira entrega ainda deve registrar seus caminhos reais; módulos citados nas etapas posteriores são expectativas contratuais, não alegação de existência atual. A atualização do progresso ajuda a evitar referências desatualizadas. S1–S4 agora possuem critérios específicos nas capacidades responsáveis.

## 10. Ponto de decisão e histórico de alterações

### Registro histórico da retomada inicial

1. Relatório persistente ausente na leitura inicial.
2. Inputs completos lidos e estrutura documental explorada.
3. Plano e versão v1 confirmados idênticos; metadados/dependências conferidos.
4. Relatório criado com S1–S5 abertos e matrizes de cobertura.
5. JSON de sprints, SPEC, stories, design e manifest preservados.
6. Nenhuma implementação, teste de produto, provider, sessão Maestri/OMP, publicação ou transição de fase executada.

### Propostas apresentadas e concordância posterior

- **S1–S4:** concordância para explicitar as quatro obrigações nos critérios/hints das entregas indicadas, sem ampliar o produto.
- **S5:** concordância para dividir a sprint-017 em histórico/detalhe, decisão e recuperação, mantendo todas antes da prova da primeira fatia; e reestimar 021/024/027 para high/3.

O usuário respondeu “sim” e autorizou explicitamente aplicar S1–S5, preservar decisões/design e revalidar o plano. Essa concordância foi aplicada diretamente em `sprints20261016_073031.json`, com contagens/dependências/metadados atualizados. `sprints.v1.json` permanece como referência anterior. A resposta autoriza as correções; não constitui aprovação final do plano ajustado nem avanço de gate.

**S1–S5 resolvidos no plano. Próximo ponto de decisão: aprovação final pelo usuário.** O plano ajustado pode ser apresentado ao mecanismo de aprovação. O marcador de encerramento da fase só cabe depois da confirmação de aprovação final; não foi emitido nesta revalidação.

Ler este relatório antes de toda resposta de continuidade. Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.

## 11. Resultado da aplicação e revalidação após o “sim”

**Situação: PASS DOCUMENTAL; zero achados S1–S5 em aberto. Aprovação final do plano ajustado pendente do usuário.**

Arquivos entregues nesta correção: `sprints20261016_073031.json` e este relatório. A execução usou leitura/gravação UTF-8. Nenhuma SPEC, story, recurso de design, manifest, configuração do projeto ou versão v1 foi alterada. O auxiliar temporário usado para aplicar as mudanças foi removido ao concluir o trabalho.

### 11.1 Identidade e contagens atuais

| Item | Antes | Depois |
| --- | --- | --- |
| metadata.version | 1 | 2 |
| Sprints | 32 | 34 |
| Features | 96 | 97 |
| Rounds estimados totais | 76 | 84 |
| Sprints de UI | 9 | 11 |
| Teto de rounds por sprint | 3 | 3 |
| SHA-256 do plano | `15b3aaff4f151414c86cc2a3a34b1ab6a3b1a1f74d5a8af442be1fbbd66350c7` | `53980a5265dfcba27010f0ed662a18885e925fc86b61ce8821e6fb89205a2ee1` |

As duas entregas adicionais somam 5 rounds (033: 2; 034: 3). As reestimativas 021/024/027 somam mais 3. A 017 mantém seus 3 rounds para lista/detalhe. Total: 76 + 5 + 3 = 84, sem elevar o limite individual.

### 11.2 Conferências executadas sobre o documento resultante

A conferência programática independente da aplicação retornou **83/83 verificações satisfeitas e zero erros**. Esse número se refere a verificações documentais; não é contagem de testes do produto.

- JSON válido; 34 IDs únicos de sprint e 97 IDs únicos de feature; contagens de metadata coerentes.
- Todos os 32 IDs de sprint e todos os 96 IDs de feature anteriores preservados. Todos os critérios de aceite originais continuam presentes nas respectivas features, inclusive as duas que mudaram de sprint. Acrescentada somente a feature 097 de lista histórica, além dos critérios acordados.
- Ordem relativa das sprints originais preservada; índices consecutivos 0–33. Ordem de execução da divisão: 017 → 033 → 034 → 018 → 019. IDs não devem ser interpretados como posições cronológicas.
- Nenhuma dependência inexistente, duplicada, futura ou circular. Todas as dependências anteriores foram mantidas. As novas 033/034 são pré-requisitos explícitos da 018 e das etapas posteriores, preservando o marco da primeira fatia antes da publicação.
- Features 050/051 aparecem exatamente uma vez, nas novas 033/034; feat-049 permanece na 017, junto à nova feat-097. Responsabilidades, hints e referências das consumidoras foram conciliados com essa distribuição.
- Todas as estimativas são inteiras positivas e respeitam o teto de 3. Sprints 021/024/027 estão em high/3, como acordado.
- As 11 sprints de UI têm `touchesUI=true`, listas de telas não vazias, IDs existentes no contrato, componentes pertinentes e `designArtifactPath` apontando para o arquivo real `design/artifact.html`. Não houve ocorrência da mensagem obrigatória de falha por tela vazia.
- Os metadados de UI das 32 sprints originais são idênticos aos anteriores; as duas novas herdaram os IDs/caminho pertinentes à área da tentativa. `login` continua restrito à retirada C-02 na 005.
- Recursos de papéis prévios e captura por tentativa (S1), aviso na captura/detalhe (S2), lista paginada/URL (S3), detecção/decisão de mudança de critérios (S4) e divisão/estimativas (S5) possuem critérios explícitos e responsáveis.
- Configuração/descrição do projeto preservadas, incluindo o teto de rounds e a exigência de provas autorizadas; nenhum campo de aprovação ou execução foi criado.
- Hashes de `sprints.v1.json`, SPEC derivada, contrato de design, HTML e manifest conferidos contra os inputs da análise inicial: todos preservados.

### 11.3 Limites e decisão restante

A revisão documental confirma a resolução dos cinco achados e a consistência do plano alterado com o escopo aprovado. As matrizes de §§4–6 foram atualizadas para as referências novas, mantendo as 20 histórias, RF-01–88, RNF-01–25, AC-01–29 e INT-01–18 planejados. Não foi identificada nova lacuna de cobertura ou ampliação de produto nas correções.

Os casos de comprovação inseridos são requisitos das entregas futuras. Não houve implementação, execução de suíte do produto, validação visual, uso de provider, sessão Maestri/OMP, Git/GH, publicação ou mudança de gate nesta correção. Estimativas permanecem previsões; indisponibilidade futura de uma prova obrigatória mantém o critério pertinente pendente.

**Ponto de decisão:** o plano corrigido está pronto para a aprovação final do usuário. O “sim” registrado nesta etapa autorizou aplicar S1–S5; a aprovação final ainda não foi recebida nem simulada. Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.
