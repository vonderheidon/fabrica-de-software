# Validação do plano de sprints — Configuração inicial e operação da fábrica

Data: 18/10/2026. Rodada: 2 — retomada e aplicação de S1–S4.

**Status geral: AJUSTES AUTORIZADOS APLICADOS — AGUARDA APROVAÇÃO DO USUÁRIO NO GATE.**

O usuário autorizou aplicar S1–S4, atualizar o JSON e este relatório e refazer as conferências, sem ampliar requisitos. Essa autorização não aprova o gate final. SPEC e plano foram relidos integralmente na retomada antes da alteração; o relatório persistente foi consultado primeiro. Esta validação avalia o plano e não certifica implementação, integração ou entrega nem autoriza efeitos externos.

## 1. Fontes, método e conferências

- Fonte principal preservada: SPEC20261017_233303.md, neste diretório, com 3.545 linhas; F01–F19, US-01–US-24, RF-01–RF-109 e RNF-01–RNF-19.
- Plano atualizado diretamente: sprints20261017_233303.json, neste diretório, com **26 sprints, 72 features, 287 critérios, 307 relações de dependência e 77 rounds estimados**. Antes: 24 sprints, 72 features, 282 critérios, 259 dependências e 71 rounds.
- Contexto da retomada: AGENTS.md, estrutura existente de apps/packages/scripts/tests, package.json, contratos compartilhados base.ts e imports públicos de projects/preparations/operation. Os demais documentos normativos citados nas evidências históricas foram consultados na rodada 1; não foram alterados nesta rodada.
- JSON relido após gravação; IDs de sprint e feature únicos, índices sequenciais, totais corretos, dependências existentes e anteriores às consumidoras, sem ciclos. Todos os caminhos de hints.existing_files existem na raiz canônica.
- Os 72 IDs de features anteriores e todos os IDs antigos de sprint foram preservados. As duas novas sprints usam sprint-025 e sprint-026; a ordem de execução é dada por index, não pelo número do ID.
- Os 16 critérios de feat-057/058/059/060 permaneceram idênticos. Os demais critérios foram preservados; cinco explicitações de fronteira foram acrescentadas em feat-015/034/037, além de detalhamento de três critérios existentes em feat-015/048/071. Não há nova feature de produto.
- O teto global continua em 3 rounds: 25 sprints com 3 rounds e a etapa de preparação externa com 2. As estimativas expressam o alcance final, sem garantia de capacidade por contagem de features.
- Comprovação documental: parse do JSON, integridade do grafo, ordem, preservação dos critérios, existência dos hints e matrizes de cobertura. Checks de código não foram executados nesta alteração de plano.

Convenção atual: **P01–P26** indicam posições exibidas; sprint-xxx é ID estável. **S1–S4** são achados. **Somente as evidências/propostas históricas da seção 3 conservam posições e linhas da rodada 1**; cada resolução informa as posições atuais. As referências históricas S20/S23/S26/S34 dos roteiros pertencem a outro plano e permanecem preservadas como a SPEC exige.

## 2. Resultado por dimensão

| Dimensão | Status | Resultado |
| --- | --- | --- |
| Cobertura funcional | COBERTA NO PLANO | US-01–US-21 e seus detalhes têm responsabilidade; ícone dos cartões explicitado em S4. Nenhuma feature aprovada ficou sem entrega planejada. |
| Provas externas e entrega | PREPARAÇÃO COBERTA; EXECUÇÃO PENDENTE | US-22–US-24 encaminhadas por P26 / sprint-024, com execução posterior autorizada e evidência própria. Preparação não é aceite externo. |
| Dependências | AJUSTADAS E CONFERIDAS | Contratos comuns em P04 precedem suas famílias; tipo/exclusão são liberados em P14 após integridade completa. Grafo sem ciclos ou consumidores anteriores. |
| Sizing | REDISTRIBUÍDO | Contratos comuns separados da sprint-006; minutos separados da orientação/linguagem. Estimativas e totais recalculados, sem elevar teto. |
| Critérios de aceite | VERIFICÁVEIS NO ESCOPO DECLARADO | Fronteiras intermediárias e ícone agora explícitos; critérios locais e preparação documental não exigem aprovação externa fictícia. |
| Hints e contexto | ATUALIZADOS | Tipos comuns enumerados, fornecedores identificados por IDs estáveis e caminhos existentes conferidos; novos caminhos futuros seguem o registro previsto no SPEC_PROGRESS. |
| Escopo adicional | SEM AMPLIAÇÃO | Redistribuição e explicitação de obrigações já aprovadas; nenhum novo comportamento de produto. |

## 3. Achados, evidências históricas e resolução

As evidências e propostas da rodada 1 são mantidas abaixo para rastreabilidade. Seus números de posição e linha identificam o plano anterior. Os status e os parágrafos de resolução registram a decisão autorizada e o resultado atual.

### S1 — Contratos compartilhados são concluídos depois das famílias que os consomem

**Status: RESOLVIDO NO PLANO — autorizado e aplicado na rodada 2. Prioridade: alta. Dimensões: dependências, sizing e contexto.**

**Evidência:** P04 / `sprint-004` / Contratos públicos de configuração em snake_case, feat-010/011, exige a representação pública normalizada de configuração/projetos/preparação (plano linhas 247–315). P05 / `sprint-005` / Contratos públicos de execução e entrega em snake_case exige a normalização de execução/entrega (318–399). Entretanto, `SessionResponse`, `ErrorResponse`, `OperationReceipt`, `OperationAccepted` e `OperationView` só são explicitamente normalizados em P06 / `sprint-006`, feat-015 (402–424).

Os arquivos atuais confirmam a dependência: `projects.ts` e `preparations.ts` importam `OperationReceipt`, `Page`, `TimeDefaults` e outros tipos de `base.ts`; consultas de tentativa e publicação também usam `Capability`, `Page` e tipos compartilhados. `base.ts` ainda contém campos como `eventCursor`, `requestId`, `reasonCode` e `affectedRequirements`. `Page`, `Capability` e `MeasuredValue` tampouco estão nomeados na lista de contratos comuns de feat-015.

**Implicação para o plano:** para cumprir P04/P05 por inteiro, a pessoa que executa terá de antecipar mudanças e consumidores atribuídos a P06; se obedecer literalmente à divisão, haverá respostas parcialmente normalizadas no aceite intermediário. O grafo não expressa essa decisão, embora exija famílias concluídas e checks verdes por sprint. A SPEC §1/Convenções e §3.2 exige atualização conjunta de schemas, serialização e consumidores, sem aliases públicos silenciosos e sem alterar formatos históricos.

**Ajuste proposto:** colocar a entrega dos contratos comuns antes das famílias P04/P05 e explicitar seu conjunto completo, incluindo os tipos auxiliares compartilhados. Repartir a P06 para preservar a ordem do restante de observação/fila/scaffold e recalcular dependências e posições. Preservar IDs estáveis sempre que possível. Não criar um ciclo fazendo P04 depender da P06 atual, que já depende de P04/P05.

**Como encerrar S1:** o plano revisado identifica a entrega que fornece cada contrato comum e suas consumidoras; nenhuma sprint exige antecipar trabalho futuro para cumprir sua própria normalização pública.

**Resolução na rodada 2 (posições atuais):** P04 / sprint-025 recebe feat-015 e fornece os contratos comuns antes de P05 / sprint-004, P06 / sprint-005 e P07 / sprint-006. Page, Capability, MeasuredValue e os demais tipos auxiliares estão explícitos no aceite e nos hints. Produtores e consumidores diretos devem ser coerentes nessa entrega; a sprint-006 conserva somente as famílias específicas de observação, eventos/SSE, fila e scaffold. Todas as consumidoras posteriores têm dependência de sprint-025.

### S2 — P12 libera edição antes dos impedimentos de mudança de tipo de P13

**Status: RESOLVIDO NO PLANO — autorizado e aplicado na rodada 2. Prioridade: alta. Dimensões: dependências e critérios.**

**Evidência:** P12 / `sprint-012` / Perfis tipados e comandos explícitos de manutenção entrega criação/edição funcional e `ProfileChanges` com patch do perfil. Seus hints dizem que os impedimentos de exclusão/tipo serão consolidados em P13 e restringem expressamente apenas a exposição de exclusão (plano linhas 900–980, especialmente 925–942 e 967). P13 / `sprint-013` entrega o impedimento de alteração de tipo por padrões correntes de projeto e a serialização com padrões/preparação/início (983–1065).

**Implicação para o plano:** não está delimitado se a alteração de `profile_type` já fica disponível ao final de P12. Se ficar, a fatia intermediária pode romper um padrão de projeto antes da proteção exigida em RF-91/RF-93, US-17 CA4/CA6 e SPEC §2.1/Regras transacionais. A restrição que já existe para exclusão não resolve expressamente a mudança de tipo.

**Ajuste proposto:** declarar no escopo e no aceite de P12 que mudança de tipo e exclusão só são liberadas com seus impedimentos e concorrência completos. A entrega de P13 passa a marcar explicitamente essa liberação. Alternativamente, antecipar para P12 os respectivos critérios de integridade, revendo seu tamanho. Não acrescentar bloqueio por tentativa ativa à mudança de tipo, pois a SPEC o exclui.

**Como encerrar S2:** nenhum aceite intermediário permite edição de tipo sem validar os padrões correntes; as proteções não dependem de um modal estar visível.

**Resolução na rodada 2 (posições atuais):** P13 / sprint-012 libera criação com tipo inicial e edição dos demais campos; mudança de tipo e exclusão ficam reservadas e indisponíveis também no servidor, em settings e no save agregado. P14 / sprint-013 marca a liberação conjunta com os respectivos impedimentos e serialização. Mudança de tipo verifica padrões correntes de projeto, sem novo bloqueio por tentativa ativa. Exclusão conserva padrões correntes e captura nos dois papéis de tentativas sem resultado final.

### S3 — Estimativas uniformes escondem concentração de escopo

**Status: RESOLVIDO NO PLANO — autorizado e aplicado na rodada 2. Prioridade: média. Dimensão: sizing.**

**Evidência:** todas as 23 sprints de código estão classificadas como high e estimadas exatamente no teto de 3 rounds. A contagem de 2–4 features por sprint é pequena, mas alguns títulos agrupam várias famílias independentes. P05 normaliza tentativas, perguntas, recursos, recuperação, entregas, diff, artefatos, checks, revisão, publicação e fronteiras do executor. P06 reúne contratos comuns, observação/SSE, fila e scaffold. P20 / `sprint-020` / Minutos exatos, orientação e linguagem do operador tem 4 features e 16 critérios, combinando conversão/round-trip numérico, ajuda de todos os campos afetados e linguagem em UI/erros/diagnósticos.

**Avaliação:** isso é risco de dimensionamento, não prova de que 3 rounds sejam impossíveis. O plano não fornece histórico de capacidade que justifique a mesma estimativa para todos esses escopos; uma estimativa no teto também não representa reserva para correções. Não há motivo para fundir uma sprint trivial: nenhuma foi identificada.

**Ajuste proposto:** aproveitar S1 para separar contratos comuns da normalização operacional e dividir P20 em duas entregas: tempos em minutos com round-trip; orientação e linguagem do operador. Manter todos os critérios, revisar dependências e atualizar totais/estimativas. Reavaliar P05 depois dessa redistribuição, sem aumentar arbitrariamente o teto global nem acrescentar funcionalidades.

**Como encerrar S3:** concordância sobre a divisão ou justificativa explícita para conservar a concentração; estimativas coerentes com o escopo final, sem prometer garantia de execução por contagem de features.

**Resolução na rodada 2 (posições atuais):** A antiga sprint-020 foi dividida em P21 / sprint-020, feat-057/058, e P22 / sprint-026, feat-059/060. Todos os 16 critérios dessas quatro features foram transferidos sem alterar seu conteúdo. A separação dos contratos comuns também reduz a sprint-006. Ambas as divisões preservam o teto de 3 rounds; as novas entregas têm estimativa de 3 rounds e o total passa de 71 para 77. A sprint-005 permanece com 3 features e 3 rounds, agora consumindo os tipos comuns prontos; seu alcance continua amplo, mas não há dependência oculta desses tipos. A estimativa é planejamento, não garantia de execução.

### S4 — Ícone dos cartões não aparece no aceite específico da tela Perfis

**Status: RESOLVIDO NO PLANO — autorizado e aplicado na rodada 2. Prioridade: baixa. Dimensão: cobertura detalhada e critérios.**

**Evidência:** US-16 CA3 (SPEC linha 295), RF-85 e a descrição de ProfileCard em §4.2 exigem ícone no cartão, além de nome/provider/modelo/orientação/tipo/esforço/ações. P17 / `sprint-017` / Tela Perfis Globais e manutenção contextual, feat-048, lista os dados e ações do cartão, mas omite o ícone (plano linhas 1344–1351). O ícone do item de navegação está coberto e é outra obrigação.

**Implicação para o plano:** a tela e os cartões têm sprint correspondente; não é uma história inteira esquecida. O detalhe visual pode escapar se o aceite se limitar à enumeração atual da feature.

**Ajuste proposto:** acrescentar o ícone do cartão ao critério de feat-048 e incluí-lo na conferência visual já prevista, sem nova sprint ou novo design.

**Como encerrar S4:** critério dos cartões reproduz todos os elementos obrigatórios de US-16 CA3.

**Resolução na rodada 2 (posições atuais):** P18 / sprint-017, feat-048, exige explicitamente o ícone de cada cartão. P26 / sprint-024, feat-071, inclui esse elemento na conferência visual posterior já prevista. O ícone de navegação continua obrigação distinta; não há nova sprint visual nem novo design.

## 4. Matriz de cobertura por história e requisitos funcionais

Esta matriz indica responsabilidade no plano, não comportamento já comprovado. A classificação de cobertura considera conjuntamente descrições, features, critérios e hints.

| História | Requisitos | Sprints responsáveis no plano atual | Avaliação |
| --- | --- | --- | --- |
| US-01 — linguagem e bloqueios | RF-01–RF-05 | P22 `sprint-026`, feat-060; P07, P16 | Coberta. Metadados técnicos preservados e recolhidos. |
| US-02 — ajuda dos campos | RF-06–RF-08, RF-59 | P22 `sprint-026`, feat-059; P03, feat-009 | Coberta. TTL e espera separados. |
| US-03 — configuração em etapas | RF-09–RF-16, RF-19, RF-26 | P15, P17, P19, P20 | Coberta. Avanço direto exige save; orientação opcional do perfil mantida. |
| US-04 — retomada, supressão e conclusão | RF-17–RF-25, RF-27, RF-90 | P01, P15, P18, P20 | Coberta. Marco histórico independente e sem efeitos implícitos. |
| US-05 — descoberta GH | RF-28–RF-32 | P09, P10, P19 | Coberta. Ordem dos candidatos e bootstrap sem GH prévio. |
| US-06 — vínculo explícito | RF-33–RF-37, RF-41–RF-42 | P01, P10, P11, P16, P19 | Coberta. Observação não vincula; recibo restrito no destino. |
| US-07 — divergência e troca | RF-38–RF-41 | P11, P19 | Coberta. result IS NULL e limpeza residual tratados separadamente. |
| US-08 — pasta validada | RF-43–RF-47 | P09, P19 | Coberta. Escrita real, cancelamento e raiz somente para futuros projetos. |
| US-09 — computador local automático | RF-48–RF-49 | P02 | Coberta. Lock/worker e conta preservados. |
| US-10 — armazenamento fixo | RF-50–RF-54 | P01, P02, P25 | Coberta. Independência de cwd e recusa não destrutiva. |
| US-11 — minutos precisos | RF-55–RF-59 | P03, P21, feat-057/058 | Coberta. Limites, aproximação e edição desfeita incluídos. |
| US-12 — retirada dos tetos | RF-60–RF-62 | P03, P26 e descrição geral do projeto | Coberta. Roteiros preservam autorização sem reintroduzir teto de produto. |
| US-13 — formulário e catálogo | RF-63–RF-69, RF-74–RF-75 | P12, P13, P17, P20 | Coberta. Nomes concorrentes, esforço nulo e formulário compartilhado. |
| US-14 — indisponibilidade/ausência | RF-70–RF-74 | P12, P13, P17 | Coberta. Refresh conserva rascunho e patch de texto preserva combinação salva. |
| US-15 — perfis no início | RF-76–RF-81 | P12–P14, P18 | Coberta. Loaded inválido bloqueia; unavailable admite perfil salvo. |
| US-16 — Perfis Globais | RF-82–RF-87 | P13, P17, P18 | Coberta; ícone explícito em feat-048 e na conferência posterior de feat-071 (S4 resolvido). Busca exata e par provider/modelo previstos. |
| US-17 — integridade de perfis | RF-88–RF-93 | P13, P14, P18 | Coberta; liberação de tipo/exclusão reservada a P14, após todos os respectivos impedimentos (S2 resolvido). |
| US-18 — saves e concorrência | RF-94–RF-97 | P08, P11, P16–P20, P25 | Coberta. Reapresentação original restrita, limite UTF-8 e proteção de rascunhos. |
| US-19 — HTTP/SSE | RF-98–RF-100, RF-109 | P07, P23, P25, P26 | Coberta no plano local e no encaminhamento Chrome. Causa não presumida. |
| US-20 — apresentação e operação | RF-101, RF-106 | P17–P20, P24, P26 | Correção local e roteiro posterior previstos; aceite Chrome continua pendente. |
| US-21 — favicon | RF-102 | P24, feat-066; P26 | GET/HEAD, distribuição e API protegida cobertos. |
| US-22 — contexto das provas | RF-103–RF-104, RF-109 | P26, feat-070/072 | Preparação coberta; acesso efetivo não é presumido. |
| US-23 — percursos reais | RF-105–RF-106, RF-109 | P26, feat-071; P25 para regressões locais | Roteiros e encaminhamento cobertos; execução externa posterior sob autorização. |
| US-24 — entrega imutável | RF-107–RF-109 | P26, feat-072; P06/P14 preservam identidades | Preparação coberta; referência e avaliação real posteriores sob autorização. |

Todos os RF-01–RF-109 possuem responsabilidade identificada acima. S1–S4 foram resolvidos no plano; US-22–US-24 continuam com execução externa posterior e pendente. P04 / sprint-025 fornece adicionalmente os contratos compartilhados de todas as famílias consumidoras.

## 5. Matriz dos requisitos não funcionais

| Requisito | Sprints responsáveis | Observação de validação do plano |
| --- | --- | --- |
| RNF-01 — resumos e volume | P25, feat-069 | Medições antes/depois, payload/latência e ausência de conteúdo de caches explícitos; sem SLA inventado. |
| RNF-02 — transações/IO | P01, P08, P11, P14, P15 | Atomicidade e IO fora da transação previstos. |
| RNF-03 — consultas sem efeitos | P10, P12, P15, P25 | Contagem zero de efeitos e de inferência de teste prevista. |
| RNF-04 — segurança HTTP | P04, P07, P09, P24, P25 | Favicon específico não libera API. |
| RNF-05 — contexto Windows | P10, P11, P26 | Descoberta não equivale a keyring; sem login alternativo. |
| RNF-06 — segredos | P03, P10, P25 | Marcadores sintéticos e preservação das proteções previstos; aplicar a todas as saídas exigidas pela SPEC. |
| RNF-07 — seleção confiável | P09, P19, P25 | Composição, cancelamento, prazos e bloqueio após término incerto explícitos. |
| RNF-08 — autoridade/Ready | P07, P11, P14, P15, P25, P26 | Sem ampliação implícita por vínculo ou conclusão. |
| RNF-09 — teclado/foco | P17, P18, P20, P24, P26 | Contratos locais e prova Chrome distinguidos. |
| RNF-10 — telas/zoom/contraste | P24, P26 | Medição local e aceite posterior com zoom nativo; sem limiar novo. |
| RNF-11 — rascunho e leitura | P16, P20, P23, P26 | Respostas antigas, histórico e contexto preservados no plano. |
| RNF-12 — operação recuperável | P01, P08, P11, P15, P16, P25 | Inclui mudança de conta, restart e mesmo recibo. |
| RNF-13 — unicidade/concorrência | P13, P14, P18, P25 | Coberta; sequência de liberação ajustada em S2. |
| RNF-14 — capturas e versão | P03, P06, P08, P14, P25, P26 | Histórico imutável e nova versão após correções previstos. |
| RNF-15 — lock e worker | P02, P25, P26 | Local e roteiro de pausa/restart previstos. |
| RNF-16 — transporte | P07, P23, P25, P26 | UTF-8/cursor/resync/EOF e Chrome separado. |
| RNF-17 — caminho da instalação | P01, P02, P25 | Dois cwd, override e banco incompatível cobertos. |
| RNF-18 — arquitetura/checks | P01–P25, especialmente P05–P07/P25 | Comandos reais configurados; tipos comuns antecipados a P04 / sprint-025. |
| RNF-19 — evidências por superfície | P23, P25, P26 | Resultado local, visual, integração e versão imutável distintos. |

## 6. Cobertura do discovery e limites

| Origem | Sprints principais |
| --- | --- |
| F01/F03/F05/F09/F12 | P03, P08, P16, P21, P22 |
| F02 | P01, P15–P17, P19–P20 |
| F04/F07 | P01–P02 |
| F06 | P09, P19 |
| F08/F10 | P03, P21, P26 |
| F11 | P12–P14, P17–P18 |
| F13 | P17, P20, P24 |
| F14 | P13–P14, P17–P18 |
| F15 | P09–P11, P19 |
| F16 | P07, P23, P25–P26 |
| F17 | P24, P26 |
| F18/F19 | P25–P26 |

A separação entre resultados locais e aceite externo é uma decisão já expressa nas fontes e no plano. `use_playwright=false` não é defeito de cobertura por si só: P26 mantém Playwright MCP/Chrome como obrigação posterior. Não se propõe ativar provas no ciclo automático nem exigir acesso externo para aprovar os critérios estritamente locais. Ao executar futuramente, cada roteiro deverá registrar resultado e evidência próprios; documentação preparada não substitui execução.

As referências históricas Primeira fatia / Publicação na interface / Fila / Aceite transversal estão preservadas em P26. A revisão desta validação não prepara referência Git, não chama provider, não abre seletor ou navegador, não altera tracker e não inicia a esteira.

## 7. Decisões e retorno ao gate

| Achado | Decisão do usuário | Alteração aplicada | Status |
| --- | --- | --- | --- |
| S1 | AUTORIZADO | P04 / sprint-025 / feat-015 antes de P05–P07; conjunto comum completo e dependências explícitas | RESOLVIDO NO PLANO |
| S2 | AUTORIZADO | P13 reserva tipo/exclusão; P14 libera com impedimentos e serialização completos no servidor | RESOLVIDO NO PLANO |
| S3 | AUTORIZADO | P21 / sprint-020 contém feat-057/058; P22 / sprint-026 contém feat-059/060; 16 critérios preservados | RESOLVIDO NO PLANO |
| S4 | AUTORIZADO | Ícone do cartão explícito em feat-048 e na conferência visual posterior de feat-071 | RESOLVIDO NO PLANO |

Não restam ajustes obrigatórios abertos entre S1–S4. A cobertura foi reconferida nas matrizes atualizadas das seções 4–6: 24 histórias, 109 RF, 19 RNF e 19 origens F possuem responsabilidade no plano. As execuções externas, o aceite da entrega e a aprovação humana do gate permanecem pendentes nos respectivos mecanismos.

## 8. Conferência final e ordem revisada

Conferência automática documental concluída sem falhas: 26 IDs de sprint únicos, 72 IDs de feature únicos, índices 0–25, 307 dependências existentes e anteriores, busca de ciclos sem ocorrência, metadados corretos, critérios das features divididas idênticos, campos de project/config preservados e nenhum hint apontando para arquivo ausente. Cada família posterior depende de sprint-025; sprint-026 depende de sprint-020; apresentação final, consolidação e encaminhamento dependem das duas partes da divisão.

| Posição | ID estável | Título | Features | Rounds |
| --- | --- | --- | --- | --- |
| P01 | `sprint-001` | Fundação de persistência e compatibilidade | `feat-001`, `feat-002`, `feat-003` | 3 |
| P02 | `sprint-002` | Instalação fixa e executor local automático | `feat-004`, `feat-005`, `feat-006` | 3 |
| P03 | `sprint-003` | Retirada dos tetos e precisão interna dos tempos | `feat-007`, `feat-008`, `feat-009` | 3 |
| P04 | `sprint-025` | Contratos públicos compartilhados antes das famílias consumidoras | `feat-015` | 3 |
| P05 | `sprint-004` | Contratos públicos de configuração em snake_case | `feat-010`, `feat-011` | 3 |
| P06 | `sprint-005` | Contratos públicos de execução e entrega em snake_case | `feat-012`, `feat-013`, `feat-014` | 3 |
| P07 | `sprint-006` | Contratos de observação, fila e transporte em snake_case | `feat-016`, `feat-017` | 3 |
| P08 | `sprint-007` | Saves atômicos e recuperação idempotente no servidor | `feat-018`, `feat-019`, `feat-020` | 3 |
| P09 | `sprint-008` | Seleção nativa e validação da pasta | `feat-021`, `feat-022`, `feat-023` | 3 |
| P10 | `sprint-009` | Descoberta do GitHub CLI e contas elegíveis | `feat-024`, `feat-025`, `feat-026` | 3 |
| P11 | `sprint-010` | Vínculo explícito e troca segura de conta | `feat-027`, `feat-028`, `feat-029` | 3 |
| P12 | `sprint-011` | Catálogo OMP suportado e compatibilidade por capacidade | `feat-030`, `feat-031`, `feat-032` | 3 |
| P13 | `sprint-012` | Perfis tipados e comandos explícitos de manutenção | `feat-033`, `feat-034`, `feat-035` | 3 |
| P14 | `sprint-013` | Integridade dos perfis e validação de início | `feat-036`, `feat-037`, `feat-038` | 3 |
| P15 | `sprint-014` | Progresso e conclusão do onboarding no servidor | `feat-039`, `feat-040`, `feat-041` | 3 |
| P16 | `sprint-015` | Ciclo de save, rascunhos e operações incertas na web | `feat-042`, `feat-043`, `feat-044` | 3 |
| P17 | `sprint-016` | Formulário compartilhado de perfis | `feat-045`, `feat-046`, `feat-047` | 3 |
| P18 | `sprint-017` | Tela Perfis Globais e manutenção contextual | `feat-048`, `feat-049`, `feat-050` | 3 |
| P19 | `sprint-018` | Configuração guiada de GitHub e pasta | `feat-051`, `feat-052`, `feat-053` | 3 |
| P20 | `sprint-019` | Wizard inicial com retomada e conclusão | `feat-054`, `feat-055`, `feat-056` | 3 |
| P21 | `sprint-020` | Minutos exatos e preservação do valor salvo | `feat-057`, `feat-058` | 3 |
| P22 | `sprint-026` | Orientação dos campos e linguagem do operador | `feat-059`, `feat-060` | 3 |
| P23 | `sprint-021` | Diagnóstico e recuperação HTTP/SSE | `feat-061`, `feat-062`, `feat-063` | 3 |
| P24 | `sprint-022` | Contraste, diálogo acessível e favicon protegido | `feat-064`, `feat-065`, `feat-066` | 3 |
| P25 | `sprint-023` | Consolidação local, segurança e persistência leve | `feat-067`, `feat-068`, `feat-069` | 3 |
| P26 | `sprint-024` | Etapa B: preparação e encaminhamento do aceite real | `feat-070`, `feat-071`, `feat-072` | 2 |

Identidade dos documentos (SHA-256):

- SPEC preservada: 394c4e0e3a32d015887fad869456c725072d81e9c1cce109b01dc136d940e63b.
- Plano anterior: 18df0157d96bbe4be622c396f6fa50e304872d49fc6e1247874c0e38d6691f8e.
- Plano revisado: 26aa0367e30830b1c9a5c3880e598a1a9f1df679c71ac5858661ec6f10a16851.

Essa conferência comprova a estrutura e a preservação documental do plano, sem executar produto, provider, browser, seletor, Git/GitHub ou preparar referência Git.

Se não há mais nada para ajustar, clique no botão Aprovar para avançar para a próxima fase.
