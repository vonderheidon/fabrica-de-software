# Validação de sprints — V4 - Remoções funcionais

> **Estado vigente — reabertura final em 28/10/2026:** a SPEC raiz e a matriz final foram alinhadas às remoções V4. A validação documental do plano permanece aberta até decisão do usuário; Sprint 008 não recebe status completo enquanto aprovação e gates externos exigidos estiverem pendentes. Os registros anteriores abaixo permanecem históricos.

> **Rodada 2 — auditoria crítica de escopo:** o plano NÃO foi aprovado. A conclusão inicial de S1 sobre ausência de expansão e a recomendação de manter as 12 sprints ficam revistas pelos achados S6–S15 abaixo. A matriz de cobertura continua útil, mas cobertura da SPEC não comprova aderência à intenção de remoção. Nesta rodada somente este relatório foi alterado; plano, SPEC e código permanecem intactos. Gate sem avanço.

## Registro da rodada

- Data: 28/10/2026 UTC; sessão iniciada em 27/10/2026 no fuso local.
- SPEC: `SPEC20261027_205916.md`, leitura integral, inclusive catálogos de dados, triggers, rotas, schemas e frontend/security.
- Plano: `sprints20261027_205916.json`, leitura integral; versão 1, 12 sprints e 33 features.
- Relatório inexistente no início; criado nesta rodada.
- Situação: comparação concluída; aguardando discussão das observações e decisão do usuário. Plano sem alterações.
- Resultado de cobertura: nenhum RF, RNF ou critério US vigente identificado sem sprint correspondente, aplicada a precedência E1.
- Limite: validação do plano. Não comprova implementação nem execução dos gates do produto.

## Precedência utilizada

A decisão E1 da SPEC, seção 1, substitui as obrigações de compatibilidade das três remoções, inclusive os trechos posteriores dos catálogos que ainda descrevem checks/check_id, verification_id nullable, dois ramos de revisão, checks_json vazio e upgrade legado. Sua ausência no plano não é lacuna.

Continuam obrigatórios: inicialização limpa, integridade transacional, FKs/guardas pertinentes, persistência dos registros produzidos no comportamento atual após reinício, evidências vinculadas à versão, independência, diagnósticos, prioridade de achados e proteções da fila. Banco limpo permitido não autoriza apagar o banco real.

## S1 — Cobertura e escopo

**Status: CONFORME.** Nenhuma lacuna funcional crítica identificada. Nenhuma feature adicional de produto fora da SPEC identificada. Regressões, retirada de resíduos exclusivos, documentação e gates pertencem ao escopo especificado.

### Matriz dos requisitos funcionais

As referências abaixo indicam compromisso do plano, não entrega realizada. Números de sprint usam os IDs `sprint-001` a `sprint-012`.

| Requisito | Comportamento | Sprint / feature principal |
| --- | --- | --- |
| RF-01 | Retirar cadastro manual na UI | 004 / feat-011 |
| RF-02 | Retirar definições dos contratos ativos | 004 / feat-009 |
| RF-03 | Novas gravações sem definições | 004 / feat-009 |
| RF-04 | Preparações sem definições, overrides e origens | 004 / feat-010 |
| RF-05 | Capturas novas sem definições | 004 / feat-010 |
| RF-06 | Configurar, preparar e iniciar sem cadastro | 004 / feat-009–010 |
| RF-07 | Retirar produtores e executor exclusivos | 003 / feat-006; 008 / feat-020 |
| RF-08 | Preservar validações estruturadas do produtor | 003 / feat-006; 009 / feat-023 |
| RF-09 | Correlação tentativa/passagem/rodada/versão | 001 / feat-001; 009 / feat-023 |
| RF-10 | Ausência de CHECKS_NOT_CONFIGURED no novo fluxo | 003 / feat-006; 004 / feat-010 |
| RF-11 | Gate por evidências; ausência não aprova | 002 / feat-003–005; 009 / feat-024 |
| RF-12 | Correção com validação da nova versão | 003 / feat-007 |
| RF-13 | Revisão de lacunas e aprovação completa | 002 / feat-003–004 |
| RF-14 | Motivo concreto de repetição na mesma versão | 003 / feat-007; 009 / feat-023 |
| RF-15 | Entrega da referência aprovada | 003 / feat-008; 012 / feat-032 |
| RF-16 | Retirar seleção, diálogo e navegação comparativos | 007 / feat-018 |
| RF-17 | Retirar rota comparativa | 007 / feat-017 |
| RF-18 | Retirar contratos/conversores/queries exclusivos | 007 / feat-017 |
| RF-19 | Preservar filtros, fuso e paginação | 007 / feat-019; 010 / feat-027 |
| RF-20 | Detalhe, rodadas e evidências atuais | 007 / feat-019; 009 / feat-023 |
| RF-21 | Nova tentativa com vínculo e sessão própria | 007 / feat-019; 012 / feat-032 |
| RF-22 | Retirar prioridade numérica e direção | 006 / feat-015–016 |
| RF-23 | Retirar persistência/captura/transporte exclusivos | 006 / feat-015 |
| RF-24 | Ordem residual com posição completa por projeto | 005 / feat-012 |
| RF-25 | Sem número de prioridade no cálculo/apresentação | 005 / feat-012/014; 006 / feat-016 |
| RF-26 | Resumo autoriza candidatos e sequência atuais | 005 / feat-013 |
| RF-27 | Elegibilidade, ocupação, autorização e pausa | 005 / feat-013; 010 / feat-028 |
| RF-28 | Deduplicação e reconciliação do consumo | 005 / feat-013 |
| RF-29, com E1 | Persistir registros atuais sem regravação | 001 / feat-002; 008 / feat-022; 010 / feat-027 |
| RF-30, com E1 | Evidências atuais preservadas, sem check_id legado obrigatório | 008 / feat-020/022; 009 / feat-023 |
| RF-31 | Diagnósticos e prioridade de achados preservados | 002 / feat-005; 008 / feat-020; 010 / feat-028 |
| RF-32 | Retirar somente código que perdeu finalidade | 004, 006, 007 e 008 / feat-009–022 |
| RF-33 | Schema e inventário de exclusão coerentes | 001 / feat-002; 008 / feat-021 |

### Matriz dos requisitos não funcionais

| Requisito | Sprint / feature | Situação no plano |
| --- | --- | --- |
| RNF-01, com E1 | 001 / feat-002; 008 / feat-022; 010 / feat-027 | Conservação dos registros atuais e reinício |
| RNF-02 | 001 / feat-001; 002 / feat-004; 003 / feat-007–008 | Identidade da versão e negativos de aprovação |
| RNF-03 | 005 / feat-013; 010 / feat-026/028 | Replay, pausa e resumo desatualizado |
| RNF-04 | 004 / feat-009; 006 / feat-015; 010 / feat-026 | HTTP real, sessão, CSRF, concorrência e rejeição sem efeitos |
| RNF-05 | 004 / feat-011; 006 / feat-016; 007 / feat-018; 009 / feat-025; 011 / feat-029–030 | DOM, teclado, foco, dimensões, zoom e ações acessíveis |
| RNF-06 | 005 / feat-014; 006 / feat-016; 011 / feat-029 | Critério efetivo e fallback por projeto |
| RNF-07 | 007 / feat-019; 009 / feat-023; 010 / feat-027 | Resumos leves, detalhes sob demanda e caches volumosos |
| RNF-08, com E1 | 001 / feat-002; 008 / feat-021–022 | Banco limpo, integridade, inventário e continuidade atual |
| RNF-09 | 001–009 nos contratos/fronteiras; 010 / feat-028 | Comandos configurados e fronteiras preservadas |

### Matriz dos critérios das stories

| Critério | Cobertura principal |
| --- | --- |
| US-01.C1 | 004 / feat-011; 011 / feat-029 |
| US-01.C2 | 004 / feat-009 |
| US-01.C3 | 004 / feat-010 |
| US-01.C4, com E1 | 004 / feat-009; 008 / feat-022 |
| US-02.C1 | 003 / feat-006; 012 / feat-032 |
| US-02.C2 | 001 / feat-001; 009 / feat-023 |
| US-02.C3 | 002 / feat-004; 003 / feat-006; 009 / feat-024 |
| US-02.C4 | 003 / feat-007–008; 012 / feat-032 |
| US-02.C5 | 003 / feat-007; 009 / feat-023 |
| US-02.C6 | 002 / feat-003–004 |
| US-02.C7 | 002 / feat-003–005; 009 / feat-024 |
| US-03.C1 | 007 / feat-018 |
| US-03.C2 | 007 / feat-017 |
| US-03.C3 | 007 / feat-019 |
| US-03.C4 | 007 / feat-019; 009 / feat-023 |
| US-03.C5 | 007 / feat-019; 012 / feat-032 |
| US-04.C1 | 006 / feat-015–016 |
| US-04.C2 | 005 / feat-012 |
| US-04.C3, com E1 | 005 / feat-012/014; 006 / feat-015–016 |
| US-04.C4 | 005 / feat-013 |
| US-04.C5 | 005 / feat-013 |
| US-05.C1, com E1 | 001 / feat-002; 008 / feat-022 |
| US-05.C2, com E1 | 008 / feat-022; 010 / feat-027 |
| US-05.C3, com E1 | 008 / feat-020/022; 009 / feat-023 |
| US-05.C4 | 008 / feat-020; 010 / feat-028 |

### Obrigações técnicas detalhadas e gates

- SPEC §2.1–2.3: vínculo produtor obrigatório, INSERT/UPDATE negativos, resultados selados, aprovação completa e assessment_evidence: 001–002 e 008. A adaptação ao resultado atual não exige conservar o ramo legado descrito no catálogo.
- SPEC §3.2: schemas fechados e rejeição direta/aninhada/combinada sem efeitos: 004, 006 e 010; fila sobre todos os itens retornados, inclusive inelegível sem posição: 005; busca literal, DST e cursor: 007.
- SPEC §3.4: captura antes da revisão, produtor ocioso, resultados tardios, correção, repetição, base alterada e referência fixa: 002–003.
- SPEC §4.1–4.6: componentes existentes, resumo compacto, retirada dos dois contadores, três estados de evidência e proteção contra resposta tardia: 004, 006–009; prova renderizada: 011.
- SPEC §5: perímetro e autoridade preservados, sem login humano/RLS/webhook/upload novos: 010 e critérios das superfícies afetadas.
- INT-06/08/11/15–18 pertinentes: coordenação controlada em 003; prova real autorizada em 012 / feat-032. Browser controlado e build não substituem esses gates.
- Adequação normativa dos documentos afetados: 012 / feat-031. Catálogo de funções existentes não vira backlog para reconstruir o produto.

## S2 — Dependências

**Status: CONFORME.** Todos os IDs de dependência existem e apontam para índices anteriores; não há ciclos nem referências futuras. A cadeia conservadora é 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012.

A ordem estabelece vínculo persistente antes do gate, gate antes da coordenação, coordenação antes de retirar cadastro, cálculo residual antes de retirar configuração numérica, consumidores antes da retirada final de estruturas e validação integrada antes do browser. As sprints com UI e backend no mesmo escopo são entregas integradas; não há sprint frontend isolada dependente de backend ainda planejado para depois.

Há dependências transitivas redundantes, mas elas não tornam o plano inválido. Não proponho removê-las sem necessidade operacional.

## S3 — Sizing e estimativa

**Status: ATENÇÃO — observação, sem lacuna de cobertura.** Todas as sprints possuem duas ou três features; nenhuma possui dez ou mais, e nenhuma é uma tarefa trivial isolada. As estimativas são de dois ou três rounds, dentro do máximo configurado de três. Total: 31 rounds estimados, sem representar prazo garantido.

| Sprint | Features | Rounds | Avaliação |
| --- | --- | --- | --- |
| 001 | 2 | 3 | Alta: persistência e vínculos, com limite funcional definido |
| 002 | 3 | 3 | Alta: três garantias relacionadas do gate |
| 003 | 3 | 3 | Alta: percurso integrado e provas controladas |
| 004 | 3 | 3 | Mais ampla: configuração, preparação/captura, UI e resumo |
| 005 | 3 | 2 | Média: ordenação, hash e descrição do mesmo domínio |
| 006 | 2 | 2 | Média: contratos/gravações e UI da prioridade |
| 007 | 3 | 2 | Média: remoção comparativa com regressões de busca |
| 008 | 3 | 3 | Alta: depende da remoção prévia dos consumidores |
| 009 | 3 | 2 | Média: consultas e estados existentes |
| 010 | 3 | 3 | Alta: regressão final, sem reconstrução de funcionalidades |
| 011 | 2 | 2 | Prova externa ao teste local; disponibilidade separada do esforço |
| 012 | 3 | 3 | Mistura documentação, provas reais condicionadas e fechamento |

**Sugestão para discussão:** manter o recorte funcional atual ou separar a sprint 004 entre configuração/preparação e resumo/UI, caso se queira menor unidade de execução. A separação exige revisar IDs, dependências e metadados; não é necessária para preencher feature ausente. Para 012, a espera por autorização/disponibilidade não deve consumir a estimativa como se fosse trabalho de código concluído. Seu texto já exige manter gates pendentes.

Não recomendo fundir sprints apenas para reduzir sua quantidade: gates de dados, coordenação, remoção residual, browser e integração real têm finalidades distintas.

## S4 — Critérios de aceite e posição dos gates

**Status: AJUSTE DE REDAÇÃO PROPOSTO — aguardando concordância.** Os critérios de produto são concretos: presença/ausência em contratos/DOM, 404 autenticado, integridade/FKs, casos positivos e negativos, identidade de versão, igualdade após reinício, hash invalidado e ausência de efeitos duplicados. Não identifiquei critério que autorize aprovação pela lista vazia ou que contrarie E1.

Gates reais dependem de autorização, ambiente e acesso externos. O plano reconhece essas condições e proíbe convertê-las em sucesso por mocks, 202 ou evidência antiga. `use_playwright=false` está explicitamente tratado pela sprint 011 como condição de condução do gate, sem dispensa ou alteração silenciosa; não é feature sem cobertura.

**Ponto a esclarecer:** na sprint 012 / feat-033, terceiro critério, linha 1040 do JSON, a redação inclui “Gates de validação de sprints e aceite”. A validação deste plano pertence à fase atual, antes da execução das sprints. Sua inclusão no fechamento pode sugerir que esse gate foi adiado ou que deverá ser executado novamente ao final.

**Texto proposto para substituir somente esse critério:**

> A aprovação da validação deste plano é pré-condição para iniciar sua execução. No fechamento, os gates de aceite e as pendências de prova são apresentados ao usuário pelo mecanismo vigente; status completo não é atribuído a gate exigido que permaneça sem prova ou decisão correspondente.

Este ajuste não altera produto, autorização ou critérios técnicos; esclarece a sequência das fases. Não aplicado ainda.

## S5 — Hints, contexto e estrutura existente

**Status: CONFORME.** Os hints identificam arquivos, interfaces e notas de arquitetura. As sprints posteriores remetem explicitamente às entregas anteriores; os alvos já existem, portanto não é necessário inventar nomes de arquivos futuros.

Verificações de planejamento executadas por leitura UTF-8 e parse JSON:

- Estrutura presente: `apps/controller`, `apps/web`, `packages/contracts`, `tests/integration`, `tests/acceptance`, `tests/browser`, `tests/native` e fixtures.
- Todos os caminhos de `hints.existing_files` das 12 sprints existem neste checkout.
- IDs de sprint/feature, quantidade de sprints/features e dependências conferidos.
- `package.json` contém os comandos typecheck, lint, test, build e os scripts compilados/HTTP/aceitação/distribuição citados no plano.
- O script exclusivamente manual `test:verification-compiled` existe na base e sua retirada ou adequação está prevista em 008 / feat-021.

Não foi necessário examinar implementação de funções para validar esses pontos. Não foram executados testes do produto, browser, providers, terminais reais ou publicação. Nenhum código, configuração, SPEC ou plano foi modificado nesta rodada.

## Decisões pendentes e continuidade

1. S3: decidir se mantém o sizing atual; divisão da sprint 004 é opcional, não correção de cobertura.
2. S4: concordar ou não com a substituição pontual do terceiro critério de feat-033.
3. Após a decisão, editar diretamente o JSON apenas no escopo acordado, validar sua estrutura/metadados/dependências e registrar aqui cada alteração.
4. A aprovação final da fase pertence ao usuário. Nenhuma execução de sprint foi iniciada.

Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.

## Rodada 2 — intenção de remoção e proibição de mensagens novas

**Situação: AJUSTES PROPOSTOS; NÃO APROVADO.** Diretriz expressa desta rodada: não acrescentar mensagens à interface; manter apresentação compacta e não explicar funções retiradas por avisos. Essa diretriz prevalece também sobre detalhamentos expansivos já escritos na SPEC.

Fontes conferidas pontualmente, sem repetir leitura integral: plano atual, trechos pertinentes da SPEC, decisões de remoção em `FEEDBACK-PROXIMO-PACOTE-V4.md:52–89` e superfícies atuais de fila/detalhe/resumo. A parte de auditoria geral de legado desse feedback não integra este pacote de três remoções. E1 da SPEC, linha 20, dispensa compatibilidade desses mecanismos e não autoriza apagar dados reais.

Convenção de referências desta rodada: **P** = `C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261027_205916/sprints20261027_205916.json`; **E** = `C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261027_205916/SPEC20261027_205916.md`; **R** = `C:/Users/jeffe/Documents/Apps/nova-fabrica-software/`. Linhas referem-se aos arquivos atuais, não a uma proposta editada. Aspas indicam trechos literais.

### S6 — Novos textos e estados visuais na sprint 009, repetidos na 011

**Status: CORTAR A EXPANSÃO VISUAL. Classificação: acréscimo dispensável na apresentação; distinção semântica preservada.**

- Sprint 009 / feat-024, **P:752**: “Apresentar a situação da evidência com causa e próxima ação no contexto da versão correspondente.”
- Mesmo item, **P:754**: “Três fixtures independentes apresentam ausência de prova como Não comprovado, impedimento técnico como Inconclusivo e comportamento incorreto demonstrado como defeito comprovado.”
- Mesmo item, **P:757**: “Textos e ações preservam a distinção entre resultado técnico, parecer independente e autorização de publicação, sem depender somente de cor.”
- Sprint 011 / feat-029, **P:936**: “Detalhe mostra evidências atuais da versão e os estados Não comprovado, Inconclusivo e defeito comprovado sem aprovação indevida; resumo não mostra Checks aprovados.”

**Origem:** E:3458 exige “Indicar ausência/inconclusão/defeito por texto, mantendo causa e próxima ação”; E:3511–3513 prescreve os três estados e explicações. US-02.C7 exige distinguir lacuna, impedimento técnico e defeito, mas essa distinção de resultado não exige criar três rótulos visuais, avisos ou ações novas.

**Confronto com o existente:** `R/apps/web/src/app/operator-language.ts:3–16` tem rótulos genéricos como “Falhou”, “Sem confirmação”, “Aprovada” e “Reprovada”; o trio prescrito não é simples reprodução desse mapa. `R/apps/web/src/features/attempts/CorrectionHistory.tsx:10–11` já apresenta evidências sob demanda; `R/apps/web/src/features/attempts/DeliverySummary.tsx:24–26` já apresenta critérios e parecer. Não há base para tratar toda a nova apresentação exigida como manutenção comprovada.

**Corte proposto:** retirar a obrigação de criar rótulos, explicações, mensagens, ações e estados visuais novos em feat-024 e sua repetição em feat-029. Preservar distinção dos resultados no contrato/gate e acesso às evidências no detalhe atual. A UI não pode afirmar aprovação indevida; corrigir somente eventual apresentação que se torne incorreta com a remoção. Isso também exige adequação futura dos trechos expansivos da SPEC, mediante concordância; não os considerar autorização automática.

### S7 — Descrição e explicação de fallback da fila podem virar entrega nova

**Status: REDUZIR A ADAPTAÇÃO AO ESPAÇO EXISTENTE. Classificação: adaptação indispensável do texto incorreto; explicações adicionais por projeto são dispensáveis.**

- Sprint 005 / feat-014, **P:414**: “Apresentar somente os critérios residuais e o fallback efetivo por projeto.”
- Mesmo item, **P:417**: “Projetos com posição utilizável e projetos em fallback são descritos corretamente na mesma observação, sem afirmar que um critério global se aplica indistintamente a todos.”
- Mesmo item, **P:418**: “Ausência de posição não torna um item inelegível; o motivo de fallback permanece distinguível dos bloqueios de prontidão e leitura incompleta.”
- Sprint 006 / feat-016, **P:492**: “QueuePanel e QueueEnableDialog apresentam a ordem recebida e o fallback pertinente, sem recalcular ordenação no cliente nem duplicar avisos sobre a remoção.”

**Origem:** E:167/RNF-06 pede explicação do fallback; E:3498 pede “fallback por projeto só onde necessário, sem avisos duplicados entre painel e confirmação”. Já há ampliação editorial na própria SPEC em relação à decisão original: `R/FEEDBACK-PROXIMO-PACOTE-V4.md:83–87` pede retirada dos campos/orientações e uso da ordem existente, sem pedir nova explicação por projeto.

**Existente comprovado:** `R/apps/web/src/features/queue/QueuePanel.tsx:49` contém “Ordem por prioridade, posição no quadro e número da issue.”; linha 89 contém “Prioridade configurada, posição disponível no quadro e número da issue.”. Esses dois locais ficarão incorretos e precisam ser retirados ou ajustados. Isso não autoriza novos parágrafos, motivos por linha, banners ou tooltips de fallback.

**Corte proposto:** absorver feat-014 na remoção da prioridade, sem feature editorial separada. Corrigir apenas os locais atuais que mencionam prioridade. Manter ordem e fallback no cálculo e seus testes; não adicionar explicação visual por projeto, aviso de posição ausente ou recuperação de campo removido. Rever RNF-06 e E:3498 no recorte que imponha texto adicional.

### S8 — Preservar conflitos e autorizações não autoriza novos avisos ou confirmações

**Status: PRESERVAR O EXISTENTE; VEDAR ACRÉSCIMOS. Classificação: comportamento atual preservado.**

- Sprint 006 / feat-016, **P:493**: “Revalidar, autorizar e pausar conservam o mecanismo atual; observação desatualizada ou conflito de resumo impede autorização e não acrescenta uma confirmação nova.”
- Sprint 009 / feat-025, **P:766**: “Refresh com erro preserva o dado anterior identificado como desatualizado e impede autorização baseada em observação antiga.”
- SPEC, **E:3521**: “Mensagem própria de causa e recuperação; nenhum novo início, mesmo com hash antigo conhecido.”

**Origem:** RF-26–28 protegem o consumo; E:3486 e §4.6 descrevem recuperação. O imperativo de “mensagem própria” na SPEC pode ser interpretado como criação de aviso adicional, embora o plano não peça explicitamente um banner novo.

**Existente comprovado:** `R/apps/web/src/features/queue/QueueEnableDialog.tsx:39–43` já trata resumo mudado com mensagem e reobservação; linhas 83–92 já contêm explicações, avisos e checkbox de autorização. `R/apps/web/src/features/queue/QueuePanel.tsx:60–61` já mostra falha de atualização; `R/apps/web/src/features/attempts/DeliverySummary.tsx:21` já mostra desatualização. São itens existentes, não adições desta V4.

**Corte proposto:** retirar formulações que possam exigir nova mensagem/causa/ação; exigir somente que o bloqueio atual e sua apresentação existente sejam preservados. Nenhuma confirmação adicional, aviso sobre a remoção, banner de desatualização duplicado ou expansão geral de diagnósticos. Não transformar esta auditoria em limpeza indiscriminada dos avisos atuais de segurança.

### S9 — Diagnóstico de banco incompatível pode ampliar E1

**Status: LIMITAR AO TRATAMENTO EXISTENTE. Classificação: proteção indispensável contra perda de dados; diagnóstico novo dispensável.**

- Sprint 008 / feat-022, **P:675**: “Banco incompatível não é interpretado silenciosamente como atual nem apagado; a falha preserva o arquivo e fornece diagnóstico pelo tratamento técnico pertinente.”
- Sprint 008 / feat-020, **P:654**: “Helpers compartilhados, resultados/evidências dos agentes, diagnostic_runs.checks_json, diagnósticos operacionais e findings.priority continuam funcionando por suas finalidades atuais.”

**Origem:** E:20 permite instalação limpa e veda limpeza real; RF-31 exige preservar diagnósticos operacionais. `R/FEEDBACK-PROXIMO-PACOTE-V4.md:42` também veda interpretar base incompatível como atual. Nenhum desses trechos exige novo assistente de migração, diagnóstico de compatibilidade em UI ou fluxo de recuperação.

**Corte proposto:** manter recusa segura e erro técnico já disponível, sem novo código/matriz de diagnósticos, tela, aviso ou guia de atualização. E1 dispensa conversão, leitores e testes de dados legados dos três mecanismos. A exigência não deve reaparecer sob o nome de diagnóstico.

### S10 — Fundação e schema final espalhados; provas de persistência repetidas

**Status: CONSOLIDAR. Classificação: garantias necessárias, repetição de entrega dispensável.**

- Sprint 001 / feat-002, **P:47**: “Uma instalação temporária limpa inicializa pelo caminho normal do produto, registra somente migrations efetivamente aplicadas e apresenta integrity_check válido e foreign_key_check sem violações.”
- Sprint 008 / feat-021, **P:662**: “Inicialização temporária limpa produz o schema final com FKs e guardas pertinentes, sem depender de tabelas ou código retirados; integrity_check e foreign_key_check passam.”
- Sprint 001, **P:48**: “Resultado produtor, critérios, captura e revisão finalizada conservam identidade, conteúdo, hash e recibo após fechar e reabrir o armazenamento.”
- Sprint 008, **P:673**: “Registros atuais de configuração, preparação, tentativa, rodadas, resultados, revisões e evidências conservam 100% das identidades e conteúdos de referência após reinício.”
- Sprint 010, **P:850**: “Um cenário atual com múltiplas rodadas conserva capturas, resultados, referências, pareceres e evidências de referência após reinício, com identidades e hashes iguais.”

**Origem:** E:20/214, RF-33 e RNF-01/08 sob E1. São garantias válidas, mas o plano as apresenta como entregas amplas em três pontos. Reexecutar um teste relevante após alteração é normal; recriar cenários, relatórios e estruturas de prova em cada sprint não é necessário.

**Corte proposto:** uma prova de persistência atual reutilizável, concluída sobre o schema final; nas mudanças intermediárias, somente verificações dirigidas aos vínculos alterados. Inventário/fixture acompanham cada alteração pertinente sem se tornarem uma funcionalidade ou três entregas de compatibilidade. Não impor transporte da cadeia antiga ou migrations de dados legados. Não recomendo reconstrução geral do storage.

### S11 — Sprint 009 reapresenta entregas já exigidas em 001 e 004

**Status: ABSORVER E ELIMINAR COMO SPRINT AUTÔNOMA. Classificação: adaptação indispensável localizada; consolidação visual geral dispensável.**

- Sprint 001 / feat-001, **P:38**: “Contratos internos, DTOs HTTP, conversores e consultas individuais apresentam o mesmo vínculo obrigatório, sem depender de casts para ocultar divergências.”
- Sprint 004 / feat-011, **P:319**: “Resumo continua apresentando critérios, parecer, resultado e referência aprovada; resultados e evidências dos agentes permanecem consultáveis no detalhe existente, sem aprovação implícita pela ausência dos contadores.”
- Sprint 009 / feat-023, **P:745**: “Resumo compacto conserva critérios, parecer, resultado e referência aprovada, sem contadores manuais, segundo painel persistente de evidências ou aprovação por ausência de verificação.”
- Sprint 009 / feat-025, **P:768**: “Não restam controles, imports, requisições ou áreas exclusivas de checks cadastráveis, comparação ou prioridade numérica nas superfícies alteradas.”

**Origem:** E:3445/3502 exige adaptação dos componentes existentes. A ausência final de resíduos pertence também às sprints 004, 006, 007 e 008. Não justifica uma nova rodada geral de interface.

**Corte proposto:** consumidores do vínculo na entrega que altera o vínculo; retirada da linha “Checks aprovados” e adaptação do detalhe junto à retirada de checks; proteção contra respostas tardias como regressão existente, não reconstrução de hooks. Excluir a apresentação nova de S6. A sprint 009 não precisa permanecer independente.

### S12 — Escopo amplo de regressão não deve virar reconstrução de busca, segurança e infraestrutura de performance

**Status: REDUZIR AO DELTA E REUTILIZAR PROVAS. Classificação: funções atuais preservadas; ampliação de infraestrutura dispensável.**

- Sprint 007 / feat-019, **P:582**: “date_from/date_to são inclusivos no fuso IANA informado, incluindo transição de DST; datas inválidas, fuso inválido, intervalo invertido e aliases não previstos são recusados.”
- Sprint 010 / feat-027, **P:852**: “Cenário temporário com caches volumosos registra tamanho de SQLite/WAL/JSON, payloads e latência, demonstrando que o aumento do cache não causa cópia proporcional na persistência.”
- Sprint 010 / feat-028, **P:863**: “Regressões pertinentes comprovam diagnósticos operacionais, prioridade de achados, pausa/retomada de novos inícios e deduplicação de publicação e notificações.”

**Origem:** RF-19 e RNF-03/04/07; E:3531–3533. A SPEC exige regressões pertinentes, não um subsistema novo de benchmark, paginação, segurança ou observabilidade.

**Corte proposto:** reutilizar a busca e seus testes; não reimplementar fuso/cursor/DST para retirar comparação. Rodar a suíte configurada e as verificações afetadas, sem recriar cobertura já executável ou repetir matrizes completas por sprint. Prova de caches permanece pela exigência normativa, usando o mecanismo existente e somente as consultas afetadas; não criar dashboard, serviço ou ferramenta de medição. Manter os negativos de aprovação, rejeição dos campos retirados e hash/replay: são pertinentes à mudança, não excesso a eliminar.

### S13 — Sprints 011 e 012: prova não é feature de produto, e gates não são trabalho novo de UI

**Status: RETER PROVAS PERTINENTES, ENXUGAR O EMPACOTAMENTO. Classificação: validação necessária; repetição e abrangência genérica dispensáveis.**

- Sprint 011, **P:934**: “Na aplicação identificada da porta 4310, DOM e sequência de foco não apresentam cadastro manual, comparação ou prioridade numérica; a rede não solicita a rota comparativa nem envia propriedades retiradas.”
- Sprint 011, **P:936** repete os novos estados visuais identificados em S6.
- Sprint 012, **P:1029**: “Perda de acompanhamento, cancelamento e recursos conhecidos recebem regressão real pertinente às superfícies alteradas, com limites observados e sem confundir encerramento lógico com parada física.”
- Sprint 012, **P:1038**: “Cada critério US, RF e RNF da feature possui referência de implementação e prova ou pendência explícita; critérios substituídos por E1 apontam para inicialização limpa e conservação dos registros atuais.”
- Sprint 012, **P:1040**: “Gates de validação de sprints e aceite são apresentados ao usuário pelo mecanismo vigente; status completo não é atribuído a gate exigido que permaneça sem prova ou decisão correspondente.”

**Origem:** E:3534–3535 exige browser e integração real pertinente, com autorização própria. Esses gates não podem ser eliminados para aparentar redução do trabalho.

**Corte proposto:** browser comprova remoções e operação preservada, sem construir os estados de S6. Integração real cobre o caminho alterado e regressões justificadas pela superfície tocada; não abre campanha geral de recursos/cancelamento/publicação. Publicação real continua condicionada à autorização específica. Documentação e matriz final integram o fechamento, sem nova feature de interface ou repetição de gate de planejamento. Se uma prova exigida não puder ocorrer, registrar pendência, não dispensá-la nem declarar aprovação.

### S14 — Infraestrutura, abstrações e compatibilidade: ausência de adição explícita não elimina ambiguidade

**Status: SEM NOVA INFRAESTRUTURA EXPLICITAMENTE PEDIDA; LIMITES A REFORÇAR.**

- Sprint 004, **P:365** (hints): “Manter componentes/hooks existentes e o layout aprovado; esta sprint não cria páginas, stores ou componentes novos.”
- Sprint 006, **P:527**: “Não criar componentes, hooks, páginas ou store novos.”
- Sprint 008, **P:676**: “Testes não exigem dados antigos de checks manuais, check_id ou revisões com ramo verification para comprovar a continuidade do comportamento atual.”
- Sprint 002, **P:129** exclui “verification_id, ramo verification ou evidence_source exclusivamente para acomodar o mecanismo retirado”.

**Origem:** E1/E:20/210/212 e E:3445. Não há no plano comando explícito para criar serviço, tela, cadastro equivalente, infraestrutura ou camada de compatibilidade nova. Não encontrei pedido explícito de novo tooltip, banner ou aviso permanente sobre funções retiradas. O risco concreto vem dos textos/estados exigidos em S6, explicações de S7 e diagnóstico ambíguo de S9, não de afirmar que todo aviso citado é novo.

Os vínculos produtor/versão, guardas e adaptação de assessment_evidence são indispensáveis para retirar o executor manual com segurança; não são abstrações supérfluas apenas por exigirem alteração de backend. Cortar compatibilidade não significa cortar essas garantias.

### S15 — Auditoria de cada sprint e proposta de consolidação

**Status: PROPOSTA PARA DISCUSSÃO; NÃO APLICADA.** A recomendação anterior de dividir a sprint 004 sem considerar o excesso global fica retirada. Primeiro cortar entregas extras/repetidas; depois estimar o esforço restante.

| Sprint atual | Entrega auditada e evidência | Classificação / proposta |
| --- | --- | --- |
| 001 | Vínculo produtor e integridade; P:36–50 | Adaptação necessária. Consolidar com 002; evitar uma fundação provisória de compatibilidade. |
| 002 | Início/aprovação/progresso sem verificação manual; P:115–140 | Adaptação necessária do gate atual. Não criar sistema paralelo nem estado visual. |
| 003 | Coordenação, correção e referência aprovada; P:202–227 | Adaptação necessária e funções atuais preservadas. Retirar executor e consumidores pertinentes aqui, em vez de só desativar para nova entrega. |
| 004 | Contratos/configuração/preparação/UI sem checks; P:294–319 | Remoção necessária. Absorver somente ajustes indispensáveis da 009; sem nova apresentação. |
| 005 | Ordem/hash e descrição; P:394–418 | Cálculo e segurança necessários; feature editorial separada é excesso. Unir a 006 após corte S7. |
| 006 | Retirar prioridade/direção; P:479–493 | Remoção necessária. Preservar use_board_position e confirmação atual; não criar aviso. |
| 007 | Retirar comparação e preservar busca; P:560–584 | Remoção necessária. Regressão da busca atual, sem reconstruir filtros/navegação. |
| 008 | Resíduos/schema/inventário/persistência; P:651–676 | Limpeza necessária, mas excessivamente adiada e com provas repetidas. Distribuir resíduos exclusivos às remoções; manter conferência final única. |
| 009 | Detalhe, trio visual e recuperação; P:743–768 | Mistura manutenção repetida e acréscimo visual dispensável. Eliminar como sprint autônoma. |
| 010 | Segurança/persistência/performance/suíte; P:839–864 | Validação pertinente. Reutilizar testes e prova de persistência, não criar infraestrutura ou auditoria geral. |
| 011 | Browser/teclado/zoom; P:934–948 | Gate de prova necessário. Cortar exigência do trio visual; nenhuma feature nova para satisfazer screenshot. |
| 012 | Documentos/prova real/matriz; P:1016–1041 | Atualização e gates necessários; fechamento pode compartilhar entrega, sem recriar gate atual ou campanha ampla. |

**Proposta enxuta: oito unidades no lugar das doze atuais.**

1. **Gate atual por resultados:** consolidar 001+002, com vínculo, independência e progresso, sem compatibilidade substituta.
2. **Percurso sem executor manual:** 003 e retirada dos resíduos diretamente dependentes dessa coordenação hoje adiados para 008.
3. **Remover checks da configuração até o detalhe:** 004, ajustes indispensáveis da 009 e schema exclusivo correspondente da 008; sem textos/estados novos.
4. **Remover prioridade da fila:** 005+006, sem feature editorial; preservar algoritmo residual e bloqueios atuais.
5. **Remover comparação:** 007, mantendo busca, detalhe e Nova tentativa existentes.
6. **Regressão final local e schema final:** 010 e conferência residual única da 008, com uma prova de persistência atual e inventário coerente.
7. **Prova da UI existente simplificada:** 011 enxugada; gate separado, sem novo desenvolvimento visual.
8. **Documentos e integração real pertinente:** 012 enxugada; matriz apenas consolida resultados e pendências, sem nova aprovação de planejamento.

A redução decorre de absorver 009, unir 001/002 e 005/006 e distribuir 008 às remoções/conferência final. Não é promessa de redução proporcional de esforço nem estimativa aprovada. As unidades consolidadas precisam ser reestimadas antes de editar o plano; não somar escopos e manter automaticamente dois/três rounds. Se excederem o limite operacional, preservar subetapas técnicas sob a mesma entrega, sem restaurar features extras.

**Regra transversal proposta para o plano:** nenhuma mensagem, banner, aviso, tooltip, explicação de remoção, estado visual, controle, tela, confirmação ou diagnóstico de UI novo. Somente retirar superfícies e adaptar o conteúdo atual que ficaria objetivamente incorreto, mantendo layout compacto, evidências sob demanda e proteções atuais. Erros técnicos e segurança continuam tratados pelo mecanismo já existente.

**Decisões pendentes desta rodada:** concordância com cortes S6–S14 e com a estrutura de oito unidades. Qualquer adequação da SPEC será pontual para retirar exigências visuais extras; não foi feita agora. O usuário não aprovou o plano. Não orientar avanço de fase enquanto esses ajustes estiverem pendentes.

### Verificação e limites desta rodada

- Releitura inicial do relatório persistente realizada.
- Conferência seletiva com linhas atuais dos artefatos e código por CodeGraph, complementada somente nos trechos não exibidos.
- Nenhuma execução de produto, prova de browser, migração, provider ou publicação.
- Somente este relatório foi atualizado. A conclusão inicial sobre ausência de expansão foi explicitamente revista, sem apagar o registro da primeira rodada.


## Rodada 3 — S16: cortes aplicados e SPEC alinhada

**Status: REVISÃO DOCUMENTAL APLICADA; CONFERÊNCIA FINAL PENDENTE.** O usuário autorizou os cortes e o alinhamento da SPEC, inclusive consolidação em oito unidades. Isso não equivale à aprovação final do plano, execução de sprint ou avanço de gate. As rodadas 1/2 acima são registros anteriores: suas linhas/IDs referem-se à versão 1, anterior à consolidação, e não localizam o texto atual.

### Alterações concretas

- Plano versão 2: 12 → 8 sprints, 33 → 26 features; IDs sequenciais, índices 0–7, dependência imediata anterior, sem ciclo ou referência às sprints antigas. Todos os hints foram unidos por finalidade e os textos de arquitetura reescritos para a nova ordem. Alvos já retirados não devem ser recriados.
- S6: eliminada a antiga feat-024 e a exigência do trio visual na prova de UI. As distinções semânticas de US-02.C7/RF-11 permanecem nos resultados/evidências e na revisão atuais.
- S7: eliminada a antiga feat-014 editorial; somente ajuste dos textos atuais incorretos da fila. RNF-06 e US-04.C3 não exigem explicação de fallback por projeto; o cálculo residual permanece integralmente obrigatório.
- S8/S9: sem mensagens, rótulos/estados visuais, causas/próximas ações, banners, tooltips, controles, confirmações ou diagnósticos de UI novos. Banco incompatível limitado à recusa/erro técnico existentes, sem conversão ou recuperação nova.
- S10/S11: antigas feat-002/021/022/023/025 absorvidas nas entregas pertinentes ou na única prova integrada final; antiga sprint 009 deixa de existir como entrega autônoma. Resíduos exclusivos da antiga 008 acompanham as remoções, e a conferência final não refaz desenvolvimento.
- S12/S13: regressões da busca/segurança e prova de caches reaproveitam mecanismos existentes, limitadas ao delta; não criam infraestrutura nem campanha geral. Browser e integração real mantêm gates e limites próprios.
- S4: aprovação do plano é pré-condição de início; o fechamento apresenta aceite/pendências e não repete a validação do plano.
- E1 preservada: instalação limpa permitida, sem compatibilidade dos mecanismos retirados nem limpeza de banco real. FKs, guardas, imutabilidade, diagnóstico operacional atual, prioridade de achados e proteções da fila permanecem.

### SPEC: requisitos e referências ajustados

US-02.C7 e US-04.C3; RNF-06; matriz dos critérios US-01.C2/C4, US-02.C3/C5/C6/C7, US-03.C4, US-04.C3 e US-05.C1–C3; persistência §2.1; tratamento existente de erros §3.3; apresentação compacta §4.2; design §4.5; jornadas/estados e provas §4.6. As seções/catálogos históricos permanecem sujeitos a E1, sem criar obrigação de reter estruturas legadas. A nova decisão tem precedência explícita sobre os textos anteriores de UI. IDs RF/RNF/US não foram renumerados nem novos requisitos de produto criados.

### PRD e histórias: divergências anteriores e precedência

PRD: US-04.C3, RNF-06 e decisão Frontend (trechos que exigem indicação textual dos resultados, causa/próxima ação e explicação de fallback por projeto); histórias: US-04.C3/RNF-06 e compatibilidades superadas por E1. A decisão posterior do usuário, registrada no início da SPEC versão alinhada, prevalece estritamente nesses pontos. Os arquivos PRD e histórias não foram modificados; demais decisões continuam vigentes. Não usar esses trechos anteriores para restaurar as exigências cortadas.

### Correspondência de features entre versões

| Feature da versão 1 | Local na versão 2 |
| --- | --- |
| feat-001 | sprint-001 / feat-001 |
| feat-003 | sprint-001 / feat-002 |
| feat-004 | sprint-001 / feat-003 |
| feat-005 | sprint-001 / feat-004 |
| feat-006 | sprint-002 / feat-005 |
| feat-007 | sprint-002 / feat-006 |
| feat-008 | sprint-002 / feat-007 |
| feat-020 | sprint-002 / feat-008 |
| feat-009 | sprint-003 / feat-009 |
| feat-010 | sprint-003 / feat-010 |
| feat-011 | sprint-003 / feat-011 |
| feat-012 | sprint-004 / feat-012 |
| feat-013 | sprint-004 / feat-013 |
| feat-015 | sprint-004 / feat-014 |
| feat-016 | sprint-004 / feat-015 |
| feat-017 | sprint-005 / feat-016 |
| feat-018 | sprint-005 / feat-017 |
| feat-019 | sprint-005 / feat-018 |
| feat-026 | sprint-006 / feat-019 |
| feat-027 | sprint-006 / feat-020 |
| feat-028 | sprint-006 / feat-021 |
| feat-029 | sprint-007 / feat-022 |
| feat-030 | sprint-007 / feat-023 |
| feat-031 | sprint-008 / feat-024 |
| feat-032 | sprint-008 / feat-025 |
| feat-033 | sprint-008 / feat-026 |

Features antigas sem ID próprio na versão 2: feat-002/021/022 → prova integrada e guardas dirigidas; feat-014 → retirada de prioridade com ajuste somente dos textos incorretos; feat-023 → consumidores atuais nas novas 001–003; feat-025 → regressões dirigidas e browser existentes; feat-024 → apresentação nova cortada, semântica mantida nas novas 001/003.

### Rastreabilidade efetiva após consolidação

| Critérios/requisitos | Sprint(s) vigente(s) |
| --- | --- |
| US-01.C1–C4 sob E1; RF-01–06 | 003; prova UI 007 |
| US-02.C1; RF-08 | 002/003; prova real 008 |
| US-02.C2/C3/C6/C7; RF-09/10/11/13 | 001/002/003; consulta/UI existente 007 |
| US-02.C4/C5; RF-12/14/15 | 002; prova real 008 |
| US-03.C1–C5; RF-16–21 | 005; consulta atual 003; provas 007/008 |
| US-04.C1–C5; RF-22–28 | 004; provas 006/007 |
| US-05.C1–C3 sob E1; RF-29/30 sob E1 | 003/006 |
| US-05.C4; RF-31 | 001/002/006 |
| RF-07/32 | 002/003/004/005; conferência 006 |
| RF-33 | 001–005 nas alterações pertinentes; conferência 006 |
| RNF-01/08 sob E1 | 006, com guardas dirigidas nas entregas |
| RNF-02 | 001/002/003 |
| RNF-03 | 002/004/006 |
| RNF-04 | 003/004/006 |
| RNF-05/06 ajustado | 003/004/005; browser 007 |
| RNF-07 | 003/005/006 |
| RNF-09 | 001–006; comandos finais 006 |
| INT-06/08/11/15–18 pertinentes | 002 controlado; 008 real autorizado |
| Alinhamento normativo/aceite | 008; aprovação do plano antecede execução |

### Sizing reavaliado

- sprint-001: 4 features, 3 rounds, complexidade high.
- sprint-002: 4 features, 3 rounds, complexidade high.
- sprint-003: 3 features, 3 rounds, complexidade high.
- sprint-004: 4 features, 3 rounds, complexidade high.
- sprint-005: 3 features, 2 rounds, complexidade medium.
- sprint-006: 3 features, 3 rounds, complexidade high.
- sprint-007: 2 features, 2 rounds, complexidade medium.
- sprint-008: 3 features, 3 rounds, complexidade high.

Total 22 rounds estimados (antes 31). Consolidações 001 e 004 passam a alta complexidade; não foram mantidas automaticamente como médias de dois rounds. Unidades maiores exigem recorte por garantias dentro da entrega, sem modelo intermediário de compatibilidade nem adição visual. Estimativas não garantem conclusão; autorizações/indisponibilidade dos gates reais são pendências, não rounds de código nem sucesso presumido. O máximo configurado continua três; se insuficiente na execução futura, registrar impedimento para decisão, sem ampliar escopo ou iniciar trabalho agora.

### Validação documental e pendências

Parse JSON, IDs/índices, quantidade de features, metadados, dependências anteriores e existência dos hints conferidos pelo script documental. Rastreabilidade acima cobre 25 critérios US, 33 RF e 9 RNF sob decisões posteriores. Somente SPEC da execução, plano e este relatório foram alterados. PRD/histórias preservados; nenhum código/banco/produto executado ou validado.

Pendente somente a conferência final do usuário sobre os documentos alinhados e a aprovação de fase pelo mecanismo próprio. Não há declaração de aceite do produto ou avanço de gate.

## S17 — Retomada: conferência documental concluída

**Status: CONFERIDO; APROVAÇÃO FINAL PENDENTE.** A retomada leu o relatório e confirmou o estado real da versão 2 antes de qualquer edição. A consolidação não foi reaplicada; não houve nova renumeração nem duplicação de sprints/features.

### Complementos pontuais realizados

- SPEC §3.2: corrigidos os deltas ativos de revisão/detalhe para não exigirem verification_id nullable, evidence_source ou projeção manual de compatibilidade; rotas/leitores exclusivos de checks/check_log ficam sujeitos à retirada sob E1, preservando consulta atual de evidências.
- SPEC §3.2, introdução de schemas: explicitado que o catálogo inspecionado não impõe os campos, ramos ou rotas exclusivos dispensados por E1. Não houve reescrita indiscriminada do catálogo ou criação de protocolo substituto.
- SPEC §3.4: repetição conserva comando, evidência pertinente e motivo; removida a exigência ativa de check_id nullable e leitor histórico de compatibilidade.
- SPEC §4.6: prova de configuração exige dados atuais, sem configuração antiga/fixtures/leitores legados dos mecanismos retirados.
- Removido o script temporário de revisão documental, evitando reaplicação acidental. Nenhum código de produto foi alterado.

### Verificações efetivamente concluídas

| Verificação documental | Resultado |
| --- | --- |
| Parse do JSON e metadados | Válidos; versão 2, 8 sprints, 26 features |
| IDs e índices | Únicos e sequenciais: sprint-001–008, índices 0–7, feat-001–026 |
| Dependências | Todas existentes e anteriores; sem ciclos ou referência às antigas sprints 009–012 |
| Hints | Todos os caminhos existentes; notas usam a sequência consolidada |
| Rounds | Total 22; cada estimativa respeita o máximo configurado de 3 |
| Configuração do gate de browser | use_playwright=false preservado; gate continua separado e não dispensado |
| S4 | Aprovação do plano explicitamente anterior à execução; fechamento não repete esse gate |
| Cortes de UI | Precedência explícita; sem obrigação remanescente dos novos rótulos/explicações auditados nas jornadas e provas ativas |
| E1 | Mantida; complementadas referências ativas que ainda sugeriam compatibilidade |
| Cobertura | Matriz da rodada 3 reconferida contra entregas vigentes: 25 critérios US, 33 RF e 9 RNF sob as decisões posteriores |
| Provas preservadas | Segurança/vínculos, persistência atual única, busca/fila e consultas leves; browser e integração real com limites próprios |
| PRD/histórias | Sem edição; divergências e precedência da decisão posterior registradas na SPEC e na rodada 3 |

Os achados S6–S15 foram tratados documentalmente pelos cortes/consolidações; S4 foi esclarecido. A matriz antiga e os trechos citados nas rodadas 1/2 permanecem como evidência da versão anterior, sem prevalecer sobre a matriz vigente da rodada 3. Isso não declara implementação ou prova do comportamento do produto.

**Arquivos finais da revisão:** SPEC20261027_205916.md, sprints20261027_205916.json e este relatório. Nesta retomada somente a SPEC e este relatório precisaram de complemento; o plano consolidado já estava salvo e foi preservado. Nenhum banco, código de produto, sprint, provider, browser ou publicação foi executado. Gate sem avanço. Pendente somente a conferência final e a decisão de aprovação do usuário pelo mecanismo próprio.


## Reabertura final da validação do plano V4 — 2026-10-28

Esta reabertura foi solicitada pelo resultado do Evaluator. O escopo é a versão 2 do plano V4 (8 sprints/26 features), com foco nas três features finais e nos gates de aceite. O plano JSON não foi alterado. Foram conferidos os critérios de feat-024/025/026 e os documentos normativos relacionados, sem sobrescrever o PRD, as stories ou as provas anteriores.

| Feature | Resultado documental/execução | Gate atual |
| --- | --- | --- |
| feat-024 — documentos normativos | SPEC raiz registra retirada da comparação, RF-54 exige validação pertinente da nova versão, QueueOrder contém somente `use_board_position`, contadores manuais foram removidos e E1 tem precedência. INTEGRACAO-MAESTRI-OMP e GLOSSARY descrevem validações/evidências do Implementador, revisão independente e entrega por versão. | Evidência documental disponível; aprovação formal do plano continua pendente. |
| feat-025 — ciclo Maestri/OMP real | Smoke local e testes controlados não são prova real. Nenhuma sessão real de implementação/correção/revisão ou publicação externa foi executada nesta reabertura. | Maestri/OMP aguarda alvo, perfil/modelo e limite de custo autorizados; publicação aguarda autorização e destino específicos. |
| feat-026 — matriz e fechamento | [Matriz final V4](v4-final-acceptance-matrix.md) cobre 25 critérios US, 33 RF e 9 RNF, com implementação e prova/pendência por linha. Revalidação local do checkout passou conforme SPEC_PROGRESS.md. | Não atribuir completo enquanto a aprovação e os gates reais estiverem pendentes. |

A aprovação da validação do plano continua sendo pré-condição formal para execução/fechamento da Sprint 008. Este registro documenta a reabertura e apresenta as pendências; não registra aprovação nem avanço de fase. Não há ferramenta de aprovação de pipeline conectada nesta sessão, portanto a decisão permanece com o usuário no mecanismo vigente.

Nenhum staging, commit, push, publicação, exclusão de dados reais, cópia concorrente ou pipeline de auditoria arquitetural foi iniciado. Os registros históricos de validação e as provas locais anteriores permanecem intactos.
