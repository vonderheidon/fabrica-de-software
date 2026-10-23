# Sugestões de enriquecimento — Pacote V3

## Estado da análise

Análise documental concluída em 23/10/2026. O usuário aprovou explicitamente **E1-a e E2-a**, exclusivamente para ajustes documentais, conforme instrução desta retomada. Total: **2 sugestões APLICADAS; 0 pendentes**. A revalidação documental está registrada separadamente, sem aprovação da SPEC completa, do checkpoint, implementação ou efeitos externos.

## Fontes e comprovação da leitura

Os caminhos relativos dos links deste documento são resolvidos exclusivamente nesta pasta de documentação.

- [SPEC20261023_014848.md](SPEC20261023_014848.md): leitura integral dos 504.377 caracteres, do início ao fim, em intervalos contíguos [0,30000), [30000,60000), [60000,90000), [90000,120000), [120000,150000), [150000,180000), [180000,210000), [210000,240000), [240000,270000), [270000,300000), [300000,330000), [330000,360000), [360000,390000), [390000,420000), [420000,450000), [450000,480000), [480000,504377). Schemas de linha longa foram divididos por caracteres. Nenhum desses retornos foi truncado.
- [PRD20261023_014848.md](PRD20261023_014848.md): leitura integral dos 148.787 caracteres em [0,30000), [30000,60000), [60000,90000), [90000,120000), [120000,148787), sem truncamento.
- [stories-requisitos20261023_014848.md](stories-requisitos20261023_014848.md): leitura integral dos 54.365 caracteres em [0,28000) e [28000,54365), sem truncamento.
- Conferidos [spec-revalidation20261023_014848-r2.md](spec-revalidation20261023_014848-r2.md), [validation-report.md](validation-report.md), relatório anterior e metadados da revisão 2. O resultado documental atual é PASS; as contagens de verificações de schemas não são testes funcionais.
- Conferido [prd-validation20261023_014848.md](prd-validation20261023_014848.md), incluindo aplicação explícita de P1/P2/P3. Discovery consultado para conferir decisões, sem substituir a precedência PRD/stories.
- Projeto consultado pelo CodeGraph e pelas fontes atuais AGENTS.md, CLAUDE.md, package.json, GLOSSARY.md e INTEGRACAO-MAESTRI-OMP.md. Contratos atuais de preparação e fluxo de início confirmam a separação preparação → tentativa → entrega; não foi tratado comportamento ainda não implementado como defeito da base.

Hashes SHA-256 da versão analisada antes da aplicação, conferidos e iguais aos metadados da revisão 2:

| Fonte | SHA-256 |
| --- | --- |
| SPEC | d4f74246a070f926e94cb9160cdd2765c237e3f2d46074bfcbf277e12f81611b |
| PRD | 0d5542d974ef8b3c4f8669672f9b1dd045490157f87309ce14581574e156abbd |
| Histórias | f05c3e126156c8fe6e00f38ae5ec14af9c71a16ac5d534db621d46f7b72d562e |

As saídas truncadas da primeira tentativa de leitura não foram usadas como prova de leitura integral. A retomada acima substitui aquela pendência.

## Itens resolvidos que não serão reabertos

- Seleção nativa: NativeSelectionKind compartilhado pelo pedido e pelos três resultados, incluindo os sete tipos; SPEC, seção 3.2, correções de compatibilidade, linhas 3253–3258.
- Plano de criação: HttpScaffoldPlanV3 integral na escrita/leitura e variante histórica separada, sem fabricar board_name ou alterar hash histórico; mesma seção.
- Mapeamento histórico: ReadProjectMapping aceita quatro/cinco opções; ProjectChanges continua estrito para novas escritas; mesma seção. Adequação exige nova revisão observada, sem backfill de Backlog.
- P1: orientação contextual preserva captura/perfil/sessão/limites; troca de perfil prepara sucessora sem início ou encerramento implícitos. Não propor troca de perfil na tentativa atual nem reabrir essa decisão.
- P2: exclusão exige baseline, meta posterior, otimização efetiva e comparação; não pedir percentual arbitrário nem impor remoção da raiz como técnica.
- P3: período usa início da tentativa e dias inclusivos no fuso local exibido, com recusa de intervalo invertido; não reabrir data/fuso.

## Cobertura por funcionalidade

Cada funcionalidade foi confrontada com fluxos felizes/alternativos, limites e erros, UI/carga/vazio/skeleton, permissões, textos e responsividade. Os contratos comuns das seções 3.2/3.3/5, a composição da seção 4.2 e os estados das seções 4.3–4.6 também se aplicam: ausência de repetição em cada feature não constitui lacuna. Onde não há upload, login humano ou paginação de coleção, não foram inventadas essas superfícies.

| Feature | Cobertura verificada / conclusão |
| --- | --- |
| US-01 Ferramentas | Detecção, ambiguidade, correção, reinício, configuração acessível e conexão separada; limites HTTP e capacidades do host. Seleção nativa corrigida. Sem nova decisão identificada. |
| US-02 Criação | Cinco colunas e ordem, nome editável, plano/hash, efeitos parciais, reconciliação e leitura legada. Plano corrigido. Capacidade do fornecedor exige prova futura, não nova regra de produto. |
| US-03 Cadastro/prontidão | Cadastro incompleto, bloqueio nos dois inícios e Ready sem ativação implícita. Legado legível e adequação observada. Sem nova decisão identificada. |
| US-04 Modos | Efeitos por modo, versão fixa, preservação do checkout/índice/não rastreados, adaptação revisada e ausência de merge/force-push. Sem nova decisão identificada. |
| US-05 Destino por URL | Obrigação aprovada de escolher clone na preparação e continuação; lacuna de transporte tratada por E2-a, APLICADO. |
| US-06 Continuação | Clique autorizador, hash/revisão, recibos, destino reconferido, falha/incerteza e resumo preservado. E2 alcança a entrada inicial pela preparação; a seleção posterior com entrega existente já tem contrato. |
| US-07 Nomes Git | Tipos permitidos, português, normalização, referência válida, colisão estável e legado. Algoritmo interno de slug/sufixo não exige decisão adicional de produto. |
| US-08 Instruções | guidance efetiva, composição/migração idempotente, captura histórica, limite de campo/corpo e separação do contrato técnico. P1 resolvido. |
| US-09 Sessões | Continuidade por papel/tentativa, ambiente independente atualizado fora de uso, pacote de retomada e perda de acompanhamento. Compatibilização documental anterior à implementação já registrada. |
| US-10 Terminais | Posse/host/instalação, ocupação concorrente, manual/ativo/incerto recusados e terminal ocioso sem bloqueio indevido. Sem nova decisão identificada. |
| US-11 Correção | Identidade/origem, prioridade, evidências limitadas, checks/logs e justificativa de alterações adicionais; falha técnica distinta de defeito. Sem nova decisão identificada. |
| US-12 Revisão | Cobertura inicial/final, foco incremental, versão, independência, zero bloqueantes e motivos de repetição. Sem nova decisão identificada. |
| US-13 Falta de progresso | Duas correções, progresso parcial comprovado, origem do achado, primeiro bloqueio e limite capturado; orientação/troca conforme P1. Não reabrir limiar ou captura. |
| US-14 Contestação | Fundamento, resposta selada, versão da resposta explícita e encaminhamento humano se mantida. Sem nova decisão identificada. |
| US-15 Organização | Identidade estável, recursos exclusivos/globais/original, leitores legados, diário/geração e movimento fora de uso. Plano técnico já determinado. |
| US-16 Exclusão | Destinos completos e compactos, inventário, autorização, links/identidade, parcial/retomada e prova de ganho separada de correção/UI. P2 resolvido. |
| US-17 Resumo | Versão, aprovação, recibos, destinos confirmados, parcial distinto de completo e detalhes sob demanda. Sem nova decisão identificada. |
| US-18 Tempos | Intervalos/atividade observados, espera/perda separados, prazo somente configurado e legado indisponível. Sem estimativa inventada. |
| US-19 Notificações | Permissão explícita, conteúdo externo mínimo, reserva durável compartilhada entre abas, incerto sem reenvio e pendência preservada. Suporte no host é prova futura. |
| US-20 Encerramento | Pausa durável, drenagem e cancelamento separado; retirada explícita da pausa/revogação de drenagem tratadas por E1-a, APLICADO. |
| US-21 Busca | AND, número/título separados, substring/Unicode, fuso/fronteiras, cursor/teto de inserção, filtros na URL, vazio/falha e resposta tardia. P3 resolvido. |
| US-22 Comparação | Par elegível, capturas históricas, dados ausentes, sem causalidade e empilhamento em telas estreitas. Sem nova decisão identificada. |
| US-23 Conexão | Texto/cor, reconexão intermediária e saúde confirmada distinta de health HTTP; prova renderizada prevista. Sem nova decisão identificada. |

Paleta/tokens, componentes compartilhados, hierarquia dos modais, foco/teclado/zoom, caminhos longos, telas estreitas/baixas, mensagens com causa/próxima ação e skeleton sem fatos fictícios já estão definidos nas seções 4.5/4.6. Não exigir novos breakpoints, catálogo literal de todas as mensagens ou outro layout como se fossem decisões ausentes do produto aprovado.

## Sugestões e aplicações

As evidências e alternativas abaixo preservam os achados anteriores à edição. As aplicações registram o resultado aprovado; não interpretar a descrição histórica da lacuna como pendência atual.

### US-20 — Encerramento guiado

- **E1** [APLICADO] [ENCERRAMENTO GUIADO] Definir como o operador desiste do encerramento e retoma novos inícios após a pausa persistida, inclusive depois de reiniciar o controlador.
  Referências: SPEC, seção 3.2, V04/V05 e ShutdownCommand (linhas 2914–2944 e 3104); regra de pausa durável (linha 3267); regra de domínio 14 (linha 3286); ShutdownDialog (seção 4.2). PRD, Frontend, parágrafo de encerramento (linha 780); US-20.C1–C4 e RF-81–83.
  Evidência: o comando fechado só aceita pause_starts e close_when_idle; fechar o diálogo não desfaz a pausa, o reinício a conserva e a guarda manual consulta essa pausa separadamente de automation_enabled. Nenhum contrato atribui a PUT settings/queue a retirada dessa barreira ou a desistência da drenagem.
  Consequência concreta: quem abre o encerramento e muda de ideia pode permanecer sem início manual nem automático mesmo após reiniciar. O desenvolvedor precisaria escolher qual ação libera a pausa e se ela também religa automação; durante drenagem, precisaria escolher se ainda pode fechar o controlador depois dessa ação.
  Opcoes: a) ação explícita Retomar novos inícios retira a pausa e revoga a drenagem ainda não concluída, mantendo automação desabilitada até habilitação própria; b) a ação existente de habilitar automação também retira explicitamente a pausa/revoga a drenagem, com esses efeitos descritos antes do clique.
  Sugestao: opcao a - permite voltar a operar manualmente sem ligar a fila por consequência; mantém separado o controle de novos inícios e a habilitação automática. Nenhuma tentativa é cancelada, reiniciada ou publicada por essa ação. A mutação deve usar as mesmas garantias de revisão/idempotência e impedir que uma drenagem revogada encerre o controlador depois.
  Aplicação: opção a aprovada na retomada de 23/10/2026 e incorporada à SPEC em RF-81, V05, ShutdownCommand, ShutdownView, complemento E1-a da seção 3.2, regra de domínio 14, ShutdownDialog/useShutdown, estados de UI e checklist de segurança. Acrescentados revisão/geração durável, recuperação antes de CAS, revogação derivada sem sobrescrever recibos, ponto serializado de fechamento comprometido e critérios contra fechamento tardio. A aprovação é exclusivamente documental.
  Validação prevista: pausar → fechar diálogo → retomar → início manual permitido com automação ainda desligada; reinício recompõe estado; disputa com close_when_idle/replay/resposta perdida não causa fechamento tardio nem duplicação. Esses cenários são critérios a comprovar na implementação, não testes funcionais executados nesta edição.

### US-05 — Destino local na preparação

- **E2** [APLICADO] [DESTINO LOCAL NA PREPARAÇÃO] Completar o transporte e a persistência da escolha de clone feita antes de existir tentativa/entrega. É lacuna técnica para cumprir a regra já aprovada, sem rediscutir a exigência de clone, os modos ou a proteção do trabalho local.
  Referências: SPEC, US-05.C1 (linha 71); PreparationDialog (linha 3384); E21–E23 e schemas PreparationChoices/PreparationChanges/PreparationOverrides (linhas 3041, 3155–3156); V01/SetPublicationTarget (linhas 2866–2880 e 3099); publication_target_selections (linhas 1374–1390). PRD, Frontend, parágrafo Se faltar pasta local; stories US-05.C1–C4. Projeto atual: packages/contracts/src/preparations.ts:22–32 e apps/controller/src/modules/pipeline/start.ts:151–155.
  Evidência: a UI deve solicitar clone existente ou destino de clone ao escolher modo com commit na preparação. Os schemas fechados dessa preparação não possuem campo para a escolha. A única operação de destino exige attemptId e delivery_id, e o diário exige FKs para tentativa/entrega; essas identidades ainda não existem na preparação.
  Consequência concreta: o cliente não consegue salvar a escolha por API nem incluí-la no resumo/hash de início; usar V01 exige inventar identidades futuras. Guardar somente no estado do diálogo perde a escolha ao reabrir/reiniciar e não fornece autorização durável ao efeito posterior.
  Opcoes: a) registrar a intenção de destino na revisão da preparação, incluí-la no resumo/hash e captura de início, sem efeito ao salvar; eventual clonagem ocorre depois por operação explícita/reconciliável quando houver as identidades necessárias; b) permitir clonagem anterior ao início com operação específica vinculada à preparação e correspondente evolução do diário, preservando autorização e retomada.
  Sugestao: opcao a - completa o percurso com os mecanismos existentes de revisão/captura e conserva o diário atual para a execução posterior; evita um segundo fluxo de clonagem anterior à tentativa. A apresentação deve distinguir escolher destino de autorizar clone; o efeito precisa continuar coberto por ação explícita que o descreva. Detalhar DTO/conversores/validação/referências e momento do efeito sem alterar fonte do projeto por URL nem conceder commit/push/PR pela seleção.
  Aplicação: opção a aprovada na retomada de 23/10/2026 e incorporada à SPEC em RF-23, preparation_revisions, E21–E23/V01, PublicationTargetChoice/PublicationTargetIntent/CapturedPublicationTarget, PreparationChoices/PreparationChanges/Preparation, HttpAttemptDetail, SetPublicationTarget/PublicationTargetSelection, complemento E2-a da seção 3.2, PreparationDialog/DeliveryTargetFields/usePreparation, estados de UI e checklist de segurança. A intenção entra na revisão/resumo/hash/captura; operação de clone permanece posterior, com FKs reais e autorização explícita correspondente. Referência à autorização capturada evita novo clique quando o início já descreveu exatamente esse clone; não amplia modos/efeitos.
  Classificação: ajuste técnico dentro do comportamento aprovado, aplicado somente à documentação. Nenhuma implementação ou aprovação do checkpoint.
  Validação prevista: escolher destino na preparação → salvar/reabrir conserva seleção; mudar destino invalida resumo/hash anterior; início captura a escolha correta; nenhuma clonagem por GET/salvamento; ação explícita posterior e resposta perdida usam operação/recibo sem duplicação; clone incompatível/ocupado preserva trabalho e entrega; legado ausente permanece legível/null sem reescrita. São critérios futuros, não testes funcionais executados nesta edição.

## Limites e continuidade

Nenhuma nova escolha foi exigida sobre stack, Backlog, composição de guidance, layout de disco, superfície inicial de notificação, metas anteriores ao baseline, login/RBAC, uploads ou serviços externos: as fontes já determinam essas direções ou deixam expressamente a prova técnica para a implementação. A ausência da SPEC principal e a compatibilização do contrato de sessão permanecem ressalvas conhecidas, sem virar perguntas repetidas.

Na análise inicial, somente este registro havia sido gravado. Após o ok explícito, E1-a e E2-a foram aplicados à SPEC, com contratos, persistência, UI e critérios correlatos. PRD/histórias/código e relatórios anteriores foram preservados. Não houve execução do produto, teste funcional, chamada de provider ou efeito Git/GitHub.

SPEC final: SHA-256 `8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91`. Aplicações: seção 3.2, títulos **E1-a — Retomar novos inícios** (linha 3258) e **E2-a — Intenção de destino na preparação** (linha 3269), com referências completas no [relatório de revalidação](enrich-revalidation20261023_014848.md) e [metadados](enrich-revalidation20261023_014848-metadata.json). Foram aprovadas 961 verificações documentais/de schema, incluindo 242 definições compiladas, 625 referências resolvidas e rechecagem dos três conflitos anteriores; não são testes funcionais.

Na próxima resposta, ler este arquivo antes de agir e conferir a versão antes de futura edição. E1/E2 estão APLICADOS; ajustes adicionais precisam de autorização pertinente. A aprovação da SPEC completa/checkpoint permanece pendente com o usuário. Não emitir marcador de conclusão integral sem a confirmação expressa de que a SPEC está completa.
