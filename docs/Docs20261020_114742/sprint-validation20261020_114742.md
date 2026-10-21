# Validação de sprints — Exclusão definitiva de projetos

Status geral: VALIDAÇÃO DOCUMENTAL CONCLUÍDA. S1–S4 aplicados após concordância expressa do usuário. Aprovação de avanço pertence ao botão Aprovar do pipeline.

## Fontes e método

Leitura integral de SPEC20261020_114742.md (2.899 linhas) e sprints20261020_114742.json (833 linhas), neste diretório, antes da comparação. O relatório ainda não existia na primeira consulta; foi criado nesta revisão.

Exploração somente de leitura da estrutura canônica, package.json, localização dos componentes e migration 024. Nenhum teste de implementação, browser ou exclusão foi executado. Esta é validação documental do plano contra a SPEC fornecida, sem declarar compatibilidade integral com outros documentos normativos não lidos nesta revisão.

Plano revisado: 14 sprints, 27 features, 39 rounds estimados; limite configurado de 3 rounds por sprint. JSON válido. IDs e dependências anteriores conferidos: nenhuma referência faltante, futura ou circular. As sprints mantêm duas features, exceto a sprint-013, dedicada à prova de volume. A quantidade de features não representa sozinha o esforço.

## Cobertura

| Feature/jornada da SPEC | Sprints / features | Resultado |
| --- | --- | --- |
| US-01: entrada na configuração, contexto fixo, prévia sem efeitos | 003/005–006, 008/015, 009/017, 010/019 | Coberta |
| US-02: perdas completas, clique, autorização e idempotência | 001/001–002, 004/007, 008/015, 009/018, 010/019–020 | Coberta |
| US-03: atividade impeditiva, bloqueio durável e concorrência | 004/008, 006/011–012, 008/016, 011/021, 012/024 | Coberta |
| US-04: pertencimento, outros cadastros, compartilhados e GitHub | 002/003–004, 003/006, 004/008, 007/013, 012/023–024 | Coberta |
| US-05: caminhos, identidade, ancestrais, links e substituição | 003/005–006, 005/009–010, 006/011, 007/013 | Coberta; garantia segura é gate obrigatório |
| US-06: remoção integral, origem atual/URL e ausência comprovada | 002/003–004, 003/005, 005/009–010, 007/013–014 | Coberta |
| US-07: pendência, recuperação, retry, resposta perdida e recibo | 004/007, 006/011–012, 007/013–014, 008/015–016, 009/018, 011/021–022 | Coberta |
| US-08: recadastro sem herança, automação false e aviso Ready | 012/023, 014/026 | Coberta |
| RF-01–08 | 001, 004, 008–010 | Cobertos |
| RF-09–16 | 004, 006, 008, 011–012 | Cobertos |
| RF-17–26 | 002–005, 007, 012 | Cobertos |
| RF-27–33 | 001–002, 005–007 | Cobertos |
| RF-34–39 | 006–009, 011 | Cobertos |
| RF-40–41 | 008, 010–011, 014 | Cobertos, incluindo anúncios acessíveis |
| RF-42–44 | 012, 014 | Cobertos |
| Schema, políticas por tabela, triggers, ciclo e recibo mínimo (§2) | 001–002, 004, 007, 012 | Cobertos |
| Endpoints, segurança e fronteiras (§3 e §5) | 001, 004, 006–009, 012 | Cobertos |
| RNF-01: segurança HTTP | 008/015, 012/024 | Coberto |
| RNF-02: isolamento | 002–005, 012/023–024 | Coberto |
| RNF-03: falhas e recuperação | 004, 006–007, 009, 012 | Coberto |
| RNF-04: interleavings | 004/008, 006/011, 012/024 | Coberto |
| RNF-05/AC-29: persistência e volume | 013/025 | Coberto em sprint própria |
| RNF-06: migration, guards e integridade | 001–002, 007, 012 | Coberto |
| RNF-07/AC-27/INT-11: browser e acessibilidade | 010–011, 014/027 | Coberto, com critérios explícitos de status/alerta e polling |
| RNF-08: filesystem adversarial | 003/006, 005/009–010, 012/024 | Coberto |
| RNF-09: contratos/fronteiras | 001/002, 008–009, 012 | Coberto |
| RNF-10/INT-16: sem force stop e propriedade incerta | 004/008, 006/011, 012/024 | Coberto |
| E1: origem atual e histórica | 003/005, 010/019, 012/024 | Coberto |
| E2: novos vínculos sobrepostos | 004/008, 008/016, 012/023–024 | Coberto |
| E3: substituta preservada e ausência segura | 005/010, 006/012, 011/021 | Coberto |
| E4: startup, can_retry e polling sem execução | 006/011–012, 008/015, 011/021, 012/024 | Coberto |
| E5: configuração salva e rascunhos isolados | 010/019, 011/022, 014/027 | Coberto |
| E6: interromper novos efeitos na primeira falha | 006/011, 012/024 | Coberto |

Não identifiquei jornada inteira ausente nem feature adicional fora da SPEC. A lacuna específica de anúncios acessíveis registrada em S1 foi coberta pelos critérios acrescentados. As faixas RF seguem a rastreabilidade apresentada pela própria SPEC; este relatório não atribui textos individuais de RF ausentes desse documento.

## Achados originais e tratamento aprovado

Os diagnósticos e propostas abaixo preservam o registro da revisão inicial; o tratamento efetivamente aplicado está consolidado ao final. A alternativa de manter 13 sprints foi descartada pela escolha aprovada. Referências a feat-025/026 no diagnóstico original correspondem às antigas IDs, agora feat-026/027 na sprint-014.

### S1 — Cobertura parcial dos anúncios acessíveis

Status: RESOLVIDO — ajuste aprovado e aplicado. Prioridade: média.

Fonte: SPEC §4.5 exige região de status para progresso, alerta para bloqueios/falhas e ausência de anúncios invasivos a cada consulta. feat-020 aborda foco, teclado e identificação além de cor; feat-026 verifica acessibilidade genericamente. Nenhum critério explicita as três exigências de anúncio.

Ajuste no plano: acrescentar critérios verificáveis a feat-020 e feat-026 para semântica de status/alerta e para polling sem anúncios repetitivos quando nada relevante mudou. Não criar nova jornada ou alterar layout.

### S2 — Sprint 012 concentra validações heterogêneas no teto de rounds

Status: RESOLVIDO — ajuste aprovado e aplicado. Prioridade: média; risco de execução, não lacuna funcional.

feat-024 reúne falhas/reinícios, interleavings, filesystem adversarial, medições de persistência/payload/latência e cinco checks gerais. Com feat-023, há várias frentes independentes em apenas três rounds. Muitas provas já são entregas obrigatórias das sprints anteriores; a redação não distingue claramente consolidação de evidência de novos cenários a produzir.

Ajuste proposto: separar a medição de volume/AC-29 em uma sprint de validação própria, dependente do backend completo; manter na atual 012 recadastro e consolidação dos cenários integrados, explicitando reaproveitamento das evidências anteriores. Atualizar IDs, índices, dependências, totais e referências nos hints. Alternativamente, manter 13 sprints apenas se o plano distribuir explicitamente as medições em uma entrega anterior e limitar a 012 à consolidação. Não elevar rounds acima do máximo configurado.

As sprints 002, 004 e 005 também são de alto risco, mas possuem fronteiras coerentes e provas correspondentes; não há evidência suficiente para exigir sua divisão agora. Nenhuma sprint é apenas uma feature trivial que justifique fusão obrigatória.

### S3 — Hints adiam caminhos já disponíveis e não fixam a SPEC da feature

Status: RESOLVIDO — ajuste aprovado e aplicado. Prioridade: baixa.

Os hints fazem bom uso de interfaces e passagem de contexto entre sprints. Entretanto, a sprint 001 lista SPEC.md canônica sem listar o caminho exato da SPEC desta feature; as demais dependem bastante de um SPEC_PROGRESS.md genérico. As sprints frontend adiam a localização de arquivos existentes, embora os seguintes caminhos tenham sido encontrados nesta revisão:

- apps/web/src/features/projects/ProjectForm.tsx
- apps/web/src/features/projects/configuration-requests.ts
- apps/web/src/features/projects/save-lifecycle.ts
- apps/web/src/api/uncertain-operations.ts
- apps/web/src/features/queue/QueueEnableDialog.tsx

Ajuste no plano: incluir a SPEC e os artefatos de entrada com seus caminhos exatos em docs/Docs20261020_114742, acrescentar os caminhos existentes pertinentes aos hints e distinguir arquivos existentes dos previstos. Fixar o caminho do acompanhamento documental desta execução dentro do diretório da proposta, respeitando a regra de escrita recebida, sem sobrescrever o SPEC_PROGRESS.md canônico. Nomes de novas interfaces continuam sendo registrados ao serem definidos, sem inventar contratos nesta validação.

### S4 — Gates pendentes precisam impedir encerramento das entregas correspondentes

Status: RESOLVIDO — ajuste aprovado e aplicado. Prioridade: média; clareza de aceite.

O plano corretamente permite registrar impedimento quando não houver navegador ou primitiva segura e proíbe apresentar evidência parcial como aprovação. Entretanto, feat-026 admite registrar gate pendente sem dizer expressamente que sua entrega não pode ser aceita como completa. O mesmo cuidado vale para o percurso seguro de feat-009. Registrar o impedimento é necessário, mas não satisfaz a prova positiva exigida pela SPEC.

Ajuste no plano: explicitar que o registro de indisponibilidade mantém o critério e a entrega afetados pendentes, impedindo a conclusão integral da feature. A integração externa pertinente continua condicionada à autorização correspondente, sem execução implícita. use_playwright=false não precisa ser alterado: a SPEC aceita Chrome como alternativa.

## Dependências e critérios

Ordem backend → API → cliente → UI respeitada. Integrações dependem dos módulos consumidos. A sequência é conservadora e serializa todas as sprints anteriores; isso reduz paralelismo, mas não é erro funcional. Não há dependência circular ou ausente detectada.

Os critérios são majoritariamente objetivos: estados, respostas HTTP, integridade SQL, ausência física, mesma operação, isolamento e evidências de browser. Não exigem novo SLA numérico ou estado remoto mutável para sucesso. Os scripts citados existem em package.json. Provas controladas e integração externa são distinguidas corretamente. S1 e S4 tornam os critérios restantes mais precisos.

## Tratamento aplicado e conferência final

- S1: feat-020 exige região de status, alerta para bloqueios/falhas e polling sem anúncios repetitivos; feat-021 mantém essas garantias no acompanhamento. feat-027, na sprint-014, exige prova correspondente em navegador real.
- S2: o critério original de medição foi transferido integralmente de feat-024 para feat-025, na nova sprint-013, com comparação antes/depois de persistência, payloads e latências, sem SLA novo. A sprint-012 mantém recadastro, falhas, interleavings e checks gerais, consolidando provas anteriores. A sprint-014 depende da nova sprint-013 e consolida seus resultados. Estimativa total: 39 rounds, nenhum acima do limite de 3 por sprint.
- S3: todos os hints incluem caminhos exatos relativos à raiz para SPEC, PRD e stories da proposta; arquivos atuais pertinentes do frontend foram acrescentados e sua existência foi conferida. O acompanhamento futuro foi fixado em docs/Docs20261020_114742/SPEC_PROGRESS.md, distinguido de arquivo existente e sem modificar o acompanhamento canônico. Esse arquivo futuro não foi criado nesta fase.
- S4: feat-009, feat-025 e feat-027 explicitam que ausência de prova obrigatória mantém critérios e entregas afetadas pendentes. Registro de impedimento e checks controlados não equivalem a prova real. Integração externa pertinente conserva autorização própria.

Renumeração: sprint-013 anterior → sprint-014; feat-025 anterior → feat-026; feat-026 anterior → feat-027. Nova sprint-013/feat-025 dedicada a volume. Índices contínuos de 0 a 13; IDs de sprint e feature únicos e contínuos; 14 sprints e 27 features nos metadados, versão 2. Referências futuras à prova de navegador apontam para sprint-014.

Conferência documental: oito jornadas US-01–US-08 preservadas, sem retirada de critérios anteriores; o critério de volume foi realocado, não eliminado. Cobertura de RFs, RNFs e E1–E6 preservada conforme a matriz atualizada. Dependências resolvem para sprints anteriores, sem ciclos, autorreferências ou referências ausentes. Backend antecede API/cliente/UI; a consolidação final inclui a prova de volume. Nenhuma ampliação de produto ou redução de validações.

Pendências reais desta fase: nenhum achado de plano aberto. A aprovação de avanço continua no mecanismo do pipeline. Provas de implementação, segurança de filesystem, medições, browser e integração externa pertinente são obrigações futuras, não evidências obtidas nesta validação. Não houve implementação, execução de testes do produto, exclusão real ou publicação.
