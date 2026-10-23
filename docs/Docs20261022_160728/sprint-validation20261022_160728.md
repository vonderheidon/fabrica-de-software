# Validação de sprints — Reestruturação das verificações da fábrica

Data: 2026-10-22.
Estado atual: AJUSTES S1–S4 APLICADOS AO PLANEJAMENTO; aguardando aprovação do usuário. O conteúdo abaixo até o registro da retomada preserva a análise e as decisões pendentes da versão inicial como histórico, não como estado atual.

## Fontes e método

- Fonte de verdade desta comparação: SPEC20261022_160728.md, neste diretório, seções 1 a 5, incluindo os aceites integrais da seção 4.6.
- Plano: sprints20261022_160728.json, versão 1, sete sprints, 17 features e 18 rounds estimados; limite configurado de três rounds por sprint.
- A leitura inicial conjunta excedeu o limite de saída. Foram feitas leituras complementares da SPEC, incluindo seu inventário extenso de persistência/HTTP; linhas literalmente repetidas desse inventário foram consultadas sem repetição. O plano foi relido integralmente em saída separada.
- Estrutura existente conferida: apps/controller, apps/web, packages/contracts, tests, scripts e .codegraph. CodeGraph consultado para orientação de useDiagnostics, OperatorDiagnosticCard e ProjectConfigurationForm. package.json e configurações de testes conferidos; todos os caminhos de hints.existing_files existem.
- SPEC.md não existe na raiz nesta consulta. Isso já está explicitado pela SPEC fornecida e não é tratado como feature a reconstruir. GLOSSARY.md e trechos pertinentes de INTEGRACAO-MAESTRI-OMP.md foram consultados para domínio, versão e limites da prova.
- Seções 2 e 3 são inventário AS-IS: não exigem reconstruir tabelas, triggers, endpoints ou módulos. Sua ausência como trabalho novo nas sprints está correta.
- Esta validação avalia o plano. Não executa implementação, testes do produto, prova visual, integrações externas ou avanço de fase.

## Resultado

As dez histórias e os 39 RF possuem destinação no plano, com duas obrigações de apresentação ainda pouco explícitas nos aceites (S2). Não foi encontrada uma história funcional inteira sem sprint. A lacuna principal é de comprovação: RNF-06 está reconhecido, mas sua execução fica indefinidamente pendente por use_playwright=false (S1). Há também rastreabilidade incompleta das regressões de segurança (S3).

Não há dependência circular, referência de dependência inexistente ou dependência posterior à consumidora. Não foi identificado scope creep funcional: o inventário documental, a continuidade em memória e as regressões de versão são exigidos pela SPEC. Não há proposta de código neste relatório.

## Achados e ajustes para discussão

### S1 — Prova de interface sem etapa executável

Status: ABERTO — prioridade alta — lacuna de validação.

Fonte: SPEC 4.5, RNF-06 e plano futuro de comprovação, linhas 16499, 16784, 16805 e 16826. Plano: project.config.use_playwright=false; sprint-007/feat-017, último critério e architecture_notes.

A SPEC exige teclado, foco visível, foco dos diálogos e desktop/mobile nas superfícies afetadas. O plano aceita como entrega da última sprint registrar essa prova como pendente. A ressalva impede alegar sucesso indevido, mas não entrega a prova exigida nem estabelece uma etapa futura que a conclua. Registrar pendência é diferente de cobrir sua execução.

Ajuste proposto no plano: prever uma etapa explícita de prova de UI, com as superfícies mínimas da SPEC, assets atuais e critérios de teclado/foco/desktop/mobile; alinhar a configuração de Playwright com essa etapa. Se a ferramenta permanecer desabilitada, manter a conclusão integral bloqueada e registrar o encaminhamento concreto. Uma eventual dispensa exige decisão humana e tratamento do requisito normativo; esta validação não concede dispensa.

Decisão do usuário: pendente. Alteração no JSON: nenhuma.

### S2 — Obrigações de apresentação cobertas apenas por referência ampla

Status: ABERTO — prioridade média — cobertura parcial dos aceites.

Fontes: US-03 CA 6/RF-15 (linhas 16576 e 16732) e RF-18 (linha 16740). Plano: sprint-004/feat-009 e sprint-005/feat-011.

- Preparação: feat-009 preserva revalidação e regras de início, mas não exige expressamente o resumo do impedimento global com acesso ao destino de correção. A nota cita RF-06 a RF-17, portanto existe destinação nominal, mas falta um resultado observável específico para US-03 CA 6.
- Tentativa: feat-011 exige autoridade e recursos, mas não cita expressamente a apresentação da suspensão no estado operacional ou ação pertinente. A nota cita RF-18 a RF-22, portanto não se trata de ausência total de destinação.

Ajuste proposto no plano: explicitar esses dois resultados nos aceites das features responsáveis, preservando a distinção entre resumo global e relatório completo e entre suspensão, autoridade e recursos. Não adicionar nova feature ou regra de domínio.

Decisão do usuário: pendente. Alteração no JSON: nenhuma.

### S3 — Regressões de segurança sem rastreabilidade de conclusão

Status: ABERTO — prioridade média — contexto e verificabilidade.

Fonte: SPEC 3.3, 4.4 e 5.1–5.2, especialmente linhas 16493, 16838 e 16861. Plano: sprint-002/feat-004, sprint-005/feat-012 e sprint-007/feat-017.

O plano cobre ausência de replay por perda de resposta, correlação, autoridade e preservação de contratos. Entretanto, não atribui explicitamente os cenários restantes do checklist de segurança: sessão ausente/revogada, renovação de leitura uma vez versus mutação sem replay em 401, ausência de replay em 403, Host/Origin/CSRF, limites, logs protegidos e proteções do download de artefatos. A matriz final prometida enumera US/RF/RNF/E, mas não o checklist da seção 5.

O comando npm.cmd test inclui testes de integração *.test.ts; portanto este achado NÃO afirma que as proteções ou seus testes sejam inexistentes. O problema é não distinguir, no plano, quais evidências existentes satisfazem cada obrigação da seção 5 e quais faltam.

Ajuste proposto no plano: incluir o checklist da seção 5 na matriz e no aceite de regressão final, identificando evidências existentes pertinentes e eventuais pendências. Preservar as proteções atuais; não criar novos controles de segurança ou exigir provas externas para isso.

Decisão do usuário: pendente. Alteração no JSON: nenhuma.

### S4 — Concentração de trabalho na sprint final

Status: RECOMENDAÇÃO — prioridade baixa — sizing.

Fonte: sprint-007, três features e três rounds, no máximo configurado. A sprint reúne retirada do diagnóstico de Registros, Dashboard, regressões de histórico, contadores, matriz completa, revisão de escopo e prova de interface pendente.

Não há sprint com dez ou mais features, nem feature trivial isolada que obrigue fusão. Ainda assim, quantidade de features não representa toda a carga: sprint-002 reúne concorrência, correlação e composição; sprint-004 reúne projeto e preparação; sprint-007 acumula fechamento de todas as superfícies.

Ajuste proposto no plano: ao resolver S1, separar o fechamento de evidências da reorganização de Registros/Dashboard, ou distribuir comprovação por superfície nas sprints responsáveis e reservar uma etapa final de consolidação. Recalcular estimativas e dependências somente após escolher essa organização. Não há dados de produtividade que permitam garantir um número exato de rounds.

Decisão do usuário: pendente. Alteração no JSON: nenhuma.

## Matriz de cobertura das histórias e aceites

Coberto significa previsto no plano, não comprovado no produto. O requisito transversal de UI permanece parcial por S1.

| História e critérios | Sprint / feature responsável | Situação |
| --- | --- | --- |
| US-01 CA 1–7 | 003 / feat-006 e feat-007; 002 / feat-003 e feat-004 para estado/continuidade | Previsto |
| US-02 CA 1–7 | 004 / feat-008; 002 para rascunho/consulta | Previsto |
| US-03 CA 1–7 | 004 / feat-009 | Parcialmente explícito: CA 6, S2 |
| US-04 CA 1–6 | 005 / feat-011 | Previsto; explicitar suspensão de RF-18, S2 |
| US-05 CA 1 | 004 / feat-010 | Previsto |
| US-05 CA 2–4 | 005 / feat-012 | Previsto |
| US-06 CA 1–7 | 006 / feat-013 e feat-014 | Previsto |
| US-07 CA 1–4 | 007 / feat-015 | Previsto |
| US-08 CA 1–4 | 007 / feat-016 | Previsto |
| US-09 CA 1–8 | 002 / feat-003 e feat-004; aplicação 003–006; consolidação 007 | Previsto |
| US-10 CA 1–4 | 002 / feat-005; composição 003–007 | Previsto |
| US-10 CA 5 | 002 / feat-005 para linguagem; 007 / feat-017 para interface | Parcial: execução de teclado/foco pendente, S1 |

## Matriz de requisitos funcionais

| RF | Sprint / feature | Cobertura |
| --- | --- | --- |
| RF-01 | 003 / feat-006 | Condições GitHub/conta |
| RF-02 | 003 / feat-006 e feat-007 | Pasta e confirmação |
| RF-03 | 003 / feat-006 | Perfis globais e acesso |
| RF-04 | 003 / feat-006 e feat-007 | Observação nativa e limites |
| RF-05 | 003 / feat-007 | Identidade versus vínculo/troca |
| RF-06 | 004 / feat-008 | Origem/remoto |
| RF-07 | 004 / feat-008 | Quadro/Status |
| RF-08 | 004 / feat-008 | Associação dos papéis |
| RF-09 | 004 / feat-008 e feat-009 | Informativos sem bloqueio novo |
| RF-10 | 004 / feat-008 | Catálogo com resumo |
| RF-11 | 004 / feat-009 | Consulta de issues |
| RF-12 | 004 / feat-009 | Elegibilidade e exceção Ready |
| RF-13 | 004 / feat-009 | Divergências de configuração efetiva |
| RF-14 | 004 / feat-009 | Critérios/configuração incompleta |
| RF-15 | 004 / feat-008 e feat-009; 006 / feat-013 | Explicitar preparação, S2 |
| RF-16 | 004 / feat-009 | Habilitação e revalidação real |
| RF-17 | 004 / feat-008 | Exclusão pendente e locks |
| RF-18 | 005 / feat-011 | Explicitar suspensão, S2 |
| RF-19 | 005 / feat-011 | Recursos/Parada/ações nativas |
| RF-20 | 004 / feat-010 | Editor dos checks |
| RF-21 | 005 / feat-012 | Resultados/artefatos da seleção |
| RF-22 | 005 / feat-012 | Identidade e nova rodada |
| RF-23 | 006 / feat-013 | Pré-requisitos antes da criação |
| RF-24 | 006 / feat-013 | Checks suportados, sem Maestri |
| RF-25 | 006 / feat-014 | Falha/parcialidade/incerteza |
| RF-26 | 006 / feat-014 | Efeitos equivalentes sem repetição |
| RF-27 | 006 / feat-014 | Conclusão versus prontidão posterior |
| RF-28 | 007 / feat-015 | Retirada do painel operacional |
| RF-29 | 007 / feat-015 | Histórico/filtros/paginação |
| RF-30 | 007 / feat-016 | Dashboard com resumo/destino |
| RF-31 | 003–006 / feat-007, feat-008, feat-009, feat-011 e feat-013 | Contexto implícito |
| RF-32 | 002 / feat-005; 004–007 | Equivalência sem perder causas |
| RF-33 | 002 / feat-003 | Atual/anterior/parcial/ausente |
| RF-34 | 002 / feat-004; 003–006 | Consulta versus ação/save |
| RF-35 | 002 / feat-004; 003–006 | Operação original sem reenvio |
| RF-36 | 002 / feat-003; 005 / feat-012 | Respostas atrasadas e seleção |
| RF-37 | 003 / feat-006 e feat-007; 004 / feat-008 e feat-010 | Rascunhos e conflitos |
| RF-38 | 002 / feat-005; 003–007 | Linguagem operacional |
| RF-39 | 003 / feat-007; 004 / feat-008; 005 / feat-011; 006 / feat-013 | Ações nos quatro destinos |

## Matriz de RNF e esclarecimentos

| Requisito | Sprint / feature | Situação |
| --- | --- | --- |
| RNF-01 | 003/feat-007, 007/feat-015–017; restrições 002–006 | Contadores/rastros previstos |
| RNF-02 | 003/feat-007, 006/feat-013, 007/feat-017 | Contadores de efeitos previstos |
| RNF-03 | 004/feat-009, 005/feat-012 | Recusas após observação favorável |
| RNF-04 | 002/feat-005, 005/feat-011, 006/feat-014, 007/feat-016 | Equivalentes e independentes |
| RNF-05 | 002/feat-005, 007/feat-017 | Zero conteúdo bruto nos avisos |
| RNF-06 | 007/feat-017 | Lacuna de execução, S1 |
| RNF-07 | 002/feat-003, 005/feat-012 | Inversão e reabertura |
| RNF-08 | 002/feat-004, 007/feat-017 | Uma intenção e mesma correlação |
| RNF-09 | 002/feat-003 e feat-004 | Resultado anterior e erro preservados |
| RNF-10 | 004/feat-008 e feat-010; 003/feat-007 | Captura e rascunho preservados |
| RNF-11 | Notas 001–007, 002/feat-005, 007/feat-017 | Interfaces/regras/checks configurados |
| RNF-12 | 007/feat-015 | Histórico preservado |
| E1 | 003/feat-007, 004/feat-008, 005/feat-011, 006/feat-013 | Um controle por ação/check |
| E2 | 002/feat-003 e feat-005 | Histórico anterior versus impedimento atual |
| E3 | 004/feat-010, 005/feat-012, 007/feat-015 e feat-017 | Campos funcionais/artefatos/eventos preservados |
| E4 | 002/feat-004; aplicação 003–006 | Reabrir, recarregar e limite de recuperação |
| SPEC 5.2 | 002, 005 e 007 parcialmente | Completar rastreabilidade, S3 |

## Dependências, sizing, aceites e hints

| Sprint | Features / rounds | Avaliação |
| --- | --- | --- |
| 001 | 2 / 2 | Documental; sem autorização implícita de implementação. Não exige backend novo. |
| 002 | 3 / 3 | Alta complexidade coerente; concorrência/continuidade concentram risco. Depende de 001. |
| 003 | 2 / 2 | Consome o contrato de comportamento e garantias de 002. |
| 004 | 3 / 3 | Projeto/preparação/checks; escopo amplo, com fontes existentes identificadas. |
| 005 | 2 / 3 | Autoridade, recursos e versão; dependências válidas. Dependência de 004 é conservadora, não um erro. |
| 006 | 2 / 2 | Criação e efeitos; usa destinos de 003/004. Estimativa só pode ser confirmada na execução. |
| 007 | 3 / 3 | Ordem correta após todos os destinos; concentração de fechamento, S4. |

Aceites são majoritariamente observáveis: contagem de POSTs, ausência de controles, versões identificadas, respostas invertidas, eventos/filtros e estados. Referências amplas como “US-02 CA 1 a 7” são resolvíveis na SPEC e não são, por si só, critérios vagos. “Preservar comportamentos existentes” precisa ser ancorado na baseline e nos cenários específicos; sprint-001 já prevê essa baseline.

Não se exige estado externo incontrolável para os testes padrão. O plano separa observação nativa, provider/MCP e parada física, e veda efeitos externos implícitos. A pendência visual deve ser resolvida conforme S1.

Hints posteriores referenciam SPEC_PROGRESS.md e o inventário de 001, e fornecem interfaces, rotas e testes. Os arquivos listados existem. Há contexto suficiente para orientação; recomenda-se incluir nos hints finais os caminhos diretos dos componentes/hooks das superfícies correspondentes e o caminho explícito da SPEC desta execução, evitando depender exclusivamente do inventário futuro. Isso é melhoria de contexto, não feature ausente. Documentos produzidos nesta execução devem permanecer no diretório documental indicado pelo usuário.

## Registro de decisões e alterações

- S1: aguardando decisão sobre a etapa de prova de UI e sua configuração.
- S2: aguardando concordância para explicitar dois aceites já normativos.
- S3: aguardando concordância para incluir o checklist de segurança na rastreabilidade final.
- S4: recomendação de reorganização do fechamento; pode ser discutida junto de S1.
- JSON de sprints preservado. Nenhum código alterado. Nenhuma aprovação ou mudança de fase registrada.
- Próxima ação: discutir os ajustes; editar o plano somente após concordância e registrar cada alteração neste relatório.

## Retomada — ajustes autorizados S1–S4 (2026-10-22)

O usuário concordou com a proposta completa e autorizou somente a alteração do plano e deste relatório. O histórico acima permanece preservado. Nenhuma implementação, aprovação de fase ou prova do produto foi executada nesta retomada. A leitura completa registrada na sessão anterior foi mantida como base; nesta retomada foram relidos o relatório, o plano e os requisitos pertinentes, com conferência da estrutura existente.

| ID | Estado atual | Alteração aplicada no plano |
| --- | --- | --- |
| S1 | RESOLVIDO NO PLANO; prova futura | use_playwright=true. Prova executável Playwright MCP/Chrome nas sprints 003–007, com assets reconstruídos/recarregados, versão identificada, desktop/mobile, teclado, foco visível, atualização e retorno ao disparador dos diálogos. Falta da ferramenta ou da evidência mantém prova e entrega pendentes; sem dispensa implícita nem alteração do LionClaw. |
| S2 | RESOLVIDO NO PLANO | feat-009 exige resumo contextual dos impedimentos globais e acesso à correção, sem relatório completo; feat-011 exige suspensão junto do estado operacional/ação pertinente, preservando causas distintas. |
| S3 | RESOLVIDO NO PLANO; rastreabilidade futura | feat-002 inventaria cada item/cenário da seção 5 com fonte/caso, evidência disponível, lacuna e responsável. feat-004 explicita sessão/401/403 sem replay indevido; feat-012 inclui proteções do download; feat-017 consolida o checklist integral com N/A justificado, sem novos controles ou testes redundantes. |
| S4 | RESOLVIDO NO PLANO | Provas de comportamento, renderização, linguagem, contadores e UI distribuídas nas superfícies responsáveis. Sprint-007 mantém Registros/Dashboard e suas provas; feat-017 foi movida para sprint-008, consolidação menor de um round, dependente de 001–007. |

### Distribuição atual de provas e sizing

| Sprint | Responsabilidade de comprovação | Features / rounds |
| --- | --- | --- |
| 001 | Baseline e matriz de cobertura incluindo seção 5; sem execução funcional | 2 / 2 |
| 002 | Contexto/continuidade/linguagem e evidências existentes de sessão e replay | 3 / 3 |
| 003 | Configuração global, Perfis, ações e prova UI | 2 / 3 |
| 004 | Projeto, checks, preparação bloqueada e prova UI | 3 / 3 |
| 005 | Tentativa/suspensão/recursos, versão/artefatos e prova UI | 2 / 3 |
| 006 | Criação, parcialidade, efeitos e prova UI | 2 / 3 |
| 007 | Histórico, Dashboard, contadores e prova UI próprios | 2 / 3 |
| 008 | Conferência final da versão e completude das evidências, sem nova feature funcional | 1 / 1 |

Total: oito sprints, mesmas 17 features, 21 rounds estimados (antes sete sprints e 18 rounds). Aumento de um round em 003 e 006 para prova local; 007 mantém três rounds para suas duas superfícies; fechamento 008 recebe um round. Limite de três rounds por sprint preservado. Estimativas continuam hipóteses de planejamento, a conferir na execução. Dependências anteriores foram preservadas; 008 depende de todas as anteriores. Não há dependência circular, ausente ou posterior à consumidora.

### Rastreabilidade de segurança planejada

A matriz detalhada será produzida em 001 e atualizada na sprint responsável; fonte localizada não equivale a caso suficiente ou resultado aprovado. tests/integration/http-security.test.ts foi localizado como fonte candidata adicional para sessão, Host/Origin/CSRF, limites e logs; sua suficiência deverá ser conferida por caso. As fontes de testes de diagnostics, preparations, verification e renderização já identificadas continuam candidatas para autoridade, efeitos, versão, histórico e linguagem. Wrapper e download requerem identificação dos casos pertinentes na baseline. Evidências faltantes ficam explícitas, sem pressupor ausência de proteção ou exigir testes duplicados.

| Itens da seção 5 | Responsabilidade |
| --- | --- |
| Sessão/cookie/revogação, 401 leitura uma vez, mutação sem replay, 403 sem replay; Host/Origin/CSRF; limites/Retry-After, schemas/revisão e logs protegidos | Baseline 001; continuidade 002; conferência 008 |
| Autorização/escopo, identidade divergente e autoridade revogada; segredos/fontes seguras sem variável nova | Baseline 001; projeto/preparação 004; tentativa/versão 005; conferência 008 |
| Zero efeitos por consulta, integridade de dados/proveniência, contexto/rascunhos, correlação, linguagem e histórico | 002 e provas locais 003–007; consolidação 008 |
| Mesma versão e download text/plain, CSP sandbox, attachment e nosniff | 005; conferência 008 |
| RLS SQLite, webhook e upload N/A; configuração local existente de 5.3 sem variável nova | Justificativa normativa 001; conferência 008 |

### Validação desta edição e pendências concretas

JSON relido por JSON.parse; oito IDs de sprint e 17 IDs de feature únicos; índices sequenciais; arrays de aceites não vazios; rounds inteiros dentro do limite; dependências existentes e anteriores, sem ciclos; feat-017 somente em 008; use_playwright=true. Os hints apontam explicitamente para a SPEC desta execução e para docs/Docs20261022_160728/SPEC_PROGRESS.md a produzir em 001, mantendo documentos no diretório autorizado.

Não resta lacuna de cobertura de planejamento identificada em S1–S4. Permanecem futuras as provas de produto, o inventário detalhado de suficiência das evidências de segurança e a disponibilidade do Playwright MCP/Chrome na execução. Nada disso foi declarado comprovado. O plano não foi aprovado e nenhuma implementação foi iniciada. Próximo passo: decisão do usuário sobre o plano ajustado.
