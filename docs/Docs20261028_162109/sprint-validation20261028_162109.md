# Validação integral de sprints — V4 — Retirada do legado anterior ao V3

## Emenda da continuação direta — 29/10/2026, 14h20

O usuário aprovou consolidar v54/digest e aceitou a referência visual atual após apresentação das alternativas; informou ausência de projeto real e autorizou reset local caso necessário. Continua a implementação direta autorizada às 14h10. Não simular gate nem alterar estado interno do LionClaw.

Atualizados os critérios feat-001.AC2 (exceção específica de bootstrap, sem reclassificar origem V3), feat-002.AC2 (referência atual em vez da captura anterior ausente) e feat-003.AC3 (alinhamento da continuação direta). Mantidos IDs, cinco sprints, 13 grupos, 41 origens e dependências. Hashes de B5 abaixo identificam a versão anterior.

SHA-256 atuais: SPEC da feature `f012b0e170479819fd7b5adbba6af268e0278f924b6f7334398282774cf23691`; plano `d63090c82a540c9ec04f14eb02d0d816c22e5fd15582d2bd62f1d7240242f2a7`; SPEC.md `d6c7ef61b21a264b42aa0aad802d2e2a1c2adcda570d3cba1ca21792500b1882`; INTEGRACAO-MAESTRI-OMP.md `c6be1bf822e1b9a8c3cf9e38141d4f2c52e98cd56f8ca59f6addaf4a5e08f886`.

Reavaliação de capacidade: sprint-002 tem candidato e provas técnicas reaproveitáveis, mas precisa de revisão própria; sprint-003 tem mapping/scaffold adiantados e ainda exige classificação de leitores/capturas; sprint-004 precisa fechar resolvedores, consumidores e exclusão juntos; sprint-005 mantém a comprovação final, inclusive provas reais condicionadas à autorização. O teto de três rounds é configuração, não garantia de suficiência. Nenhuma divisão ou plano concorrente foi criado; nenhuma dessas sprints recebe conclusão pela 001.

> **Registro histórico da auditoria anterior (superado pela aplicação B1–B5 ao final):** a auditoria A1–A7 ao final deste arquivo revisa criticamente o dimensionamento e o escopo da conclusão anterior. P1–P5 não foram aprovadas nem aplicadas. A proposta atual é consolidar o trabalho em cinco sprints por fronteira de retirada, sujeita à discussão; não aprova o plano nem altera a SPEC ou o JSON.

## Resultado e autoridade

**Revisão integral concluída. Plano requer ajustes antes da aprovação do control gate.**

As dez stories, os 44 critérios US, os 28 RF e os dez RNF têm responsáveis identificáveis no plano. Não encontrei feature de produto da SPEC inteiramente sem sprint correspondente. Essa cobertura funcional não elimina as lacunas de planejamento da comprovação e das entregas intermediárias descritas abaixo.

O catálogo de 57 tabelas, 67 rotas e 231 definições JSON descreve contratos existentes a preservar. Não é backlog para reconstruir o produto. Nenhuma nova funcionalidade, informação/texto/aviso/tooltip/indicador/estado visual/controle/tela, redesign, conversor, infraestrutura ou fluxo substituto de migração está autorizado.

**O JSON permanece intacto.** As correções são propostas para discussão. A decisão final do gate pertence ao usuário no modo semi. Este relatório não aprova fase, Design Lock, implementação ou efeito externo.

| ID | Dimensão | Conclusão |
| --- | --- | --- |
| S1 | Cobertura e escopo | Cobertura funcional atendida; delimitação do trabalho a ajustar. Todos os grupos têm responsáveis. Preservação não deve virar reconstrução do catálogo. |
| S2 | Dependências | A ajustar. Grafo sem ciclos, mas faltam fechamento verificável de cada fatia e baseline mensurado anterior. |
| S3 | Dimensionamento | Reestimativa necessária após inventário. Três features podem concentrar trabalho excessivo, especialmente em 002 e 014. |
| S4 | Critérios de aceite | A ajustar. Maioria objetiva; complementar baseline e recorte observável das provas finais. |
| S5 | Hints e contexto | Orientação geral atendida; complementar referências de provas e regra de entrega integrada. |

## Fontes e registro da leitura integral

Raiz canônica: C:/Users/jeffe/Documents/Apps/nova-fabrica-software.

Referências abreviadas deste relatório:

- SPEC: C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261028_162109/SPEC20261028_162109.md.
- Plano: C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261028_162109/sprints20261028_162109.json.
- Integração: C:/Users/jeffe/Documents/Apps/nova-fabrica-software/INTEGRACAO-MAESTRI-OMP.md.
- Normativa raiz: C:/Users/jeffe/Documents/Apps/nova-fabrica-software/SPEC.md.
- L indica linha do arquivo; ACn indica a posição, começando em 1, em acceptance_criteria da feature. O prefixo feat- foi abreviado nas matrizes.

O relatório persistente foi lido antes desta resposta. O estado anterior de revisão incompleta está superado por esta validação.

Leitura da SPEC: 754.448 caracteres, 19.230 linhas. L1–3290 lidas em blocos; trechos truncados L107–139 e L1779–1868 recuperados em blocos menores. O catálogo JSON L3291–19002 foi integralmente analisado sintaticamente e todas as 231 definições foram lidas em nove blocos compactos, de AccountBinding a EmptyQuery. A compactação removeu somente espaços de formatação; não houve amostragem de campos, enums ou definições. L19003–19230 foram concluídas, incluindo integrações, frontend e segurança.

Leitura do plano: todas as 1.226 linhas, em seis blocos contíguos, incluindo descrição global, configuração, 14 sprints, 41 features, 128 critérios, hints, dependências e metadados. A comparação começou somente após concluir ambas as entradas.

Estrutura existente explorada em apps/controller/src/modules, apps/web/src/features e tests. CodeGraph consultado para orientação; detalhes usados como evidência conferidos nos arquivos atuais. Consultados AGENTS.md, GLOSSARY.md, seções pertinentes da normativa raiz e da Integração, configurações e scripts de teste. Nenhum teste de produto foi executado.

Identidade das entradas, SHA-256 dos bytes:

- SPEC: 28792af89689ca324e6c725ddccdf15721503bb72821a90ea6898f864ad934ab.
- Plano: 90353f8e1440a18d5c513fa9fe115c4c633b71b4e0e12c047e1c90bb84501535.

Esses hashes identificam os documentos avaliados; não constituem o baseline de implementação E3.

## S1 — Cobertura e controle de escopo

### Matriz completa dos critérios US

Fonte: SPEC L41–84. IDs locais desta feature não se confundem com os de documentos históricos.

| Story | Critério → feature responsável | Sprint(s) | Conclusão |
| --- | --- | --- | --- |
| US-01 | C1→004; C2→004/005; C3→004/006; C4→006 | 002 | Instalação direta, ausência de conversão, idempotência e distribuição cobertas. |
| US-02 | C1→005; C2→005/032; C3→005; C4→005/036 | 002/011/013 | Recusa antes de escrita e estado operacional, integridade e ausência de recuperação visual cobertas. |
| US-03 | C1→007; C2→007/009; C3→008; C4→007/009 | 003 | Cinco IDs distintos e Ready, sem Backlog inventado ou conversão. |
| US-04 | C1→010; C2→010/011; C3→010; C4→012 | 004 | Plano integral, remoto/board_name, modos e reconciliação cobertos; prova real separada em 014/040. |
| US-05 | C1→013/014; C2→014/015; C3→015; C4→013/014/016/019 | 005–007 | Contratos atuais, composição e opcionais/nulos legítimos cobertos. |
| US-06 | C1→016; C2→017; C3→020/021; C4→018; C5→016/018/019 | 006/007 | Reserva, observação, isolamento, versão e incerteza cobertos; prova real em 014/040. |
| US-07 | C1→023/025; C2→023/025; C3→023/026; C4→023/024; C5→024/026/027 | 008/009 | Referências atuais, retirada global antiga e transição atual cobertas; ressalva S2.1. |
| US-08 | C1→028/029; C2→030; C3→028/030; C4→024/027/032; C5→031/032; C6→023/032 | 008–011 | Versão/destino autorizados, inventário, proteção, worker e ausência de limpeza implícita cobertos; prova real em 014/040. |
| US-09 | C1→033; C2→034; C3→013/033; C4→035 | 005/012 | Histórico atual, imutabilidade e resumos leves cobertos. |
| US-10 | C1→009/011/022/033/036; C2→036/038; C3→009/036; C4→037/038 | 003/004/008/012/013 | Retirada efetiva, zero acréscimos e comparação renderizada cobertos. |

### Matriz completa dos RF

Fonte: SPEC L94–141.

| RF | Features | Sprints |
| --- | --- | --- |
| RF-01 | 004/006 | 002 |
| RF-02 | 004 | 002 |
| RF-03 | 004/006 | 002 |
| RF-04 | 005 | 002 |
| RF-05 | 003/005 | 001/002 |
| RF-06 | 007 | 003 |
| RF-07 | 007/009 | 003 |
| RF-08 | 008 | 003 |
| RF-09 | 010 | 004 |
| RF-10 | 010/011 | 004 |
| RF-11 | 012 | 004 |
| RF-12 | 013/015 | 005 |
| RF-13 | 004/014 | 002/005 |
| RF-14 | 013/014/016/019/033 | 005/006/007/012 |
| RF-15 | 016/018/019 | 006/007 |
| RF-16 | 020/021 | 007 |
| RF-17 | 017/018 | 006 |
| RF-18 | 023/025 | 008/009 |
| RF-19 | 023/025/026 | 008/009 |
| RF-20 | 023/024/026/027 | 008/009 |
| RF-21 | 028/029 | 010 |
| RF-22 | 030 | 011 |
| RF-23 | 024/027/028/030/032 | 008–011 |
| RF-24 | 031/032 | 011 |
| RF-25 | 013/019/033 | 005/007/012 |
| RF-26 | 034/035 | 012 |
| RF-27 | 009/011/022/033/036 | 003/004/008/012/013 |
| RF-28 | 009/036/038 | 003/013 |

### Matriz completa dos RNF e detalhamentos

Fonte dos RNF: SPEC L147–156.

| Obrigação | Features responsáveis | Cobertura e ressalva |
| --- | --- | --- |
| RNF-01 | 005/023/024/032/034 | Recusa sem DDL/journal/reescrita e hashes de recursos preservados. |
| RNF-02 | 039/041 | Segurança HTTP no fechamento/suítes; casos negativos e referências específicas devem ser explicitados em S4.1. |
| RNF-03 | 016/018/024/026/027/028/029/031/032 | Identidade, autorização, incerteza e geração obsoleta. |
| RNF-04 | 004/012/017/020/029/031 | Restart/replay/resposta perdida sem duplicação. |
| RNF-05 | 002/009/036/037/038 | Baseline visual anterior, diff/DOM/ações posteriores e zero acréscimos. |
| RNF-06 | 002/035 | Resumos e desempenho; resultados mensurados anteriores não estão explícitos, S2.2. |
| RNF-07 | 001/039 | Finalidade comprovada, inventário e zero caminho executável exclusivamente antigo. |
| RNF-08 | 039 e notas globais | Typecheck/lint, fronteiras e ausência de nova dependência/tecnologia. |
| RNF-09 | 006/039 | Compilado/distribuição portáveis. |
| RNF-10 | 002/038/040/041 | Provas históricas preservadas e superfícies separadas. |
| E1 | 005/011 | Recusa integral de base incompatível ou mista, incluindo revisão inativa/criação concluída; sem varredura integral por GET. |
| E2 | 022/023 | current + managed_root=null + locations=[] antes da alocação; referência obrigatória ausente/inválida recusada sem fallback. |
| E3 | 002/035/038/041 | Metadados/ambiente/viewport/fixtures previstos; complementar resultados anteriores conforme S2.2. |
| Metadados da instalação direta | 003 antes de 004–006 | Impedimento explícito se exigir novo formato sem decisão; não fabricar execução de migrations/checksums. |

**Conclusão:** não há feature funcional integralmente descoberta. As insuficiências são de delimitação do trabalho e especificação da comprovação.

### S1.1 — Catálogo existente pode virar trabalho de produção desnecessário

Status: ajuste proposto; relevância média.

Há bons limites globais no Plano L5/L87. Contudo, feat-017/018, 020/021, 024, 026, 028/029, 031, 033 e 037 enumeram comportamentos existentes sem identificar ainda a remoção que exigiria alteração naquele domínio. Feat-034/035/038 são predominantemente comprovação. Feat-039 admite corrigir desvios no escopo, sem distinguir explicitamente regressão da retirada de defeito anterior.

A SPEC exige preservação sem reconstrução do catálogo: L6/L14/L158–171/L239/L1798/L2124/L19058/L19112. Exemplo conferido: a transição atual já tem autorização/diário/publicação de localização em C:/Users/jeffe/Documents/Apps/nova-fabrica-software/apps/controller/src/modules/storage/project-storage-transitions.ts L90–140/L179–196. Preservá-la é obrigatório; refazê-la como funcionalidade nova não está autorizado.

Correção proposta: marcar essas features como preservação/comprovação. Alteração de produção só quando vinculada a item do inventário que demonstre retirada exclusivamente anterior ao V3, consumidor diretamente afetado ou regressão causada pela retirada. Se o comportamento existente satisfizer o critério, comprovar sem reimplementar. Defeito anterior sem relação necessária deve ficar registrado fora do escopo. Manter todas as obrigações de preservação na matriz.

Não identifiquei feature que explicitamente autorize produto novo. Instalação direta, inspeção mínima para recusa e documentação da retirada são exigências da SPEC, não infraestrutura indevida por si mesmas.

## S2 — Dependências e estados intermediários

### Grafo conferido

IDs únicos e índices 0–13 coerentes. Todas as dependências existem e apontam para sprints anteriores; nenhum ciclo ou pré-requisito futuro. Não há frontend planejado antes da existência do backend: o produto já existe, 003/004 incluem consumidores mínimos e 013 fecha a comparação visual.

Ordem principal coerente: inventário/baseline/metadados→bootstrap; mapeamento→criação; configuração→sessões→resultados; localização→consumidores/transição→publicação→exclusão; histórico→visual→fechamento. A ausência de dependência entre 004 e 005 não constitui erro. Dependências transitivas redundantes não prejudicam execução e não justificam limpeza de escopo.

### S2.1 — Saída verificável dos consumidores não está garantida em todas as fatias

Status: ajuste necessário; relevância alta.

Plano: 007 altera resultados/recursos (L520–546), enquanto consultas são fechadas em 012 (L943–959). A 008 retira retornos antigos do resolvedor e altera produtor/catálogo E2 (L605–631); consumidores/transição são concluídos em 009 (L688–714), publicação em 010 e exclusão em 011. A regra explícita de atualizar consumidores juntos aparece em 003 L244 e em 013 L1095, mas não é critério geral de saída.

Evidência atual, sob a raiz canônica:

- apps/controller/src/modules/workspaces/project-storage.ts L141–169: retornos globais e recuperação vigente após movimento estão no mesmo resolvedor.
- apps/controller/src/modules/workspaces/index.ts L48–62: o resolvedor é injetado em preparação, captura, diff, materialização, recuperação, retenção e publicação.
- apps/controller/src/main.ts L65: referência passada ao bootstrap.
- apps/controller/src/modules/workspaces/capture.ts L71–81 e execution/adapters/maestri-omp/bootstrap.ts L16–28: consumidores também têm construção sem resolvedor.

Retirar o retorno central e adiar indiscriminadamente consumidores/testes não garante fatia operável. Trata-se de risco concreto de planejamento; não foi executado teste nem afirmada falha do código.

Correção proposta: cada sprint que altera contrato/produtor deve encerrar com consumidores diretamente afetados coerentes, typecheck/lint e regressões pertinentes passando, incluindo caso atual positivo e recusa sem efeito. Atualizações indispensáveis de queries, UI, publicação e inventário/finalizador acompanham a fatia; sprints posteriores ampliam prova específica, sem receber conserto essencial adiado. Em 008, preservar já na saída recuperação/transição atual após movimento. Não usar leitor temporário, cast ou compatibilidade substituta.

Não é obrigatório fundir todas essas sprints. Se o inventário demonstrar uma fronteira inseparável maior, redistribuir o plano antes da alteração, preservando o conjunto produtor/consumidores.

### S2.2 — Baseline anterior pode conter só parâmetros, sem resultados

Status: ajuste necessário; relevância alta.

SPEC L217 (E3), L1794 (prova de schema) e L152 (RNF-06) exigem comparação reproduzível. Feat-002 AC1, Plano L44, exige revisão/hashes/bundle/ambiente/fixtures/parâmetros; AC2 exige captura visual anterior. Não exige explicitamente os resultados anteriores de schema, tamanho persistido, resposta/latência e plano de consulta. Feat-035 AC2/AC3, L968–969, exige medições/comparação posteriores. Parâmetros de cenário sem resultados anteriores não sustentam essa comparação.

Correção proposta: completar feat-002 com referência validada de schema e resultados anteriores dos cenários pertinentes de tamanho persistido/payload/latência/plano de consulta. Usar fixtures e mecanismos existentes, sem banco operacional, cópia de checkout ou infraestrutura nova. Referência já produzida pode ser usada se versão, condições e aplicabilidade estiverem identificadas; continua histórica, sem virar prova da retirada. Feat-035/038 compara os mesmos cenários ou mantém explícita a limitação que impeça conclusão. Baseline deve anteceder as alterações correspondentes. Não criar SLA, tolerância ou coleta permanente.

## S3 — Dimensionamento

Plano: 14 sprints, 41 features, 128 critérios, 40 rounds. Doze sprints high/3; duas medium/2. Não há sprint com dez features nem uma única tarefa trivial.

| Sprint | Escopo efetivo | Avaliação |
| --- | --- | --- |
| 001 | Inventário transversal, baseline, metadados e alinhamento | Alto; contém condição técnica e coleta de referência, não só documentação simples. |
| 002 | 57 tabelas/objetos finais, reconhecimento de domínios, negativas sem escrita e distribuição | Maior concentração; três rounds sem fundamentação por inventário. |
| 003 | Cinco estados + preparação/fila + UI afetada | Médio coerente se corte integrado/localizado. |
| 004 | Plano em quatro superfícies e reconciliação | Alto; preservar efeitos/recibos, sem reconstruir criação. |
| 005 | Codecs/captura, composição e preparação | Alto; não duplicar bootstrap de 002. |
| 006 | Sessões, continuidade, perguntas/cancelamento e recuperação | Alto; grande parte é regressão existente. |
| 007 | Resultados, captura e revisão por versão | Alto; esforço depende das variantes comprovadas. |
| 008 | E2, resolvedor, identidade e alocação | Alto; incorporar consumidores inseparáveis de S2.1. |
| 009 | Consumo transversal, transição e Windows | Alto; não absorver correções essenciais adiadas de 008. |
| 010 | Publicação/destino e recibos | Médio plausível como preservação afetada. |
| 011 | Inventário, worker e Windows | Alto; prova nativa separada da controlada. |
| 012 | Histórico, imutabilidade e medições | Alto; não duplicar codecs de 005. |
| 013 | UI restante, interação e comparação renderizada | Alto; não adiar funcionamento básico até aqui. |
| 014 | Suítes finais, normativa, percurso real e matriz | Alto e condicionado a autorização externa. |

### S3.1 — Estimativas no teto precisam de revisão após inventário

Status: reestimativa proposta; relevância média.

O limite global é três rounds (Plano L9), repetido nas doze sprints high. Isso não comprova inexequibilidade, mas não fundamenta capacidade para 002/014. A nota L1199 corretamente não transforma espera de autorização em round de código.

Correção proposta: ao fechar feat-001/003, revisar tamanho das fatias conforme itens/superfícies realmente afetados. Distinguir fechamento técnico local, provas externas autorizadas e consolidação na 014. Se a fatia não couber no teto, propor redistribuição antes de iniciá-la; não aumentar configuração silenciosamente nem marcar parcial como completo. Não proponho número arbitrário de novas sprints sem inventário.

## S4 — Critérios de aceite e limites das provas

### Obrigações já concretas

- Instalação/recusa: feat-004–006, Plano L108–135, inclui schema/seeds/restart, bases incompatíveis/mistas, identidade/histórico/checksum/integridade, hashes de banco/WAL/SHM/recursos e mudança concorrente. Condição dos metadados está na 003 antes de 002. Nenhuma conversão/limpeza/exclusão autorizada.
- E2: feat-022/023 L605–621 exige literalmente current, managed_root=null, locations=[], alocação vigente e recusa de referência obrigatória ausente/inválida. Ausência legítima não é erro ou confirmação. Fonte: SPEC L1790 e ProjectStorageView L17066.
- Contratos: cinco IDs distintos, plano integral, opcionais legítimos, identidade/hash/recibos entre superfícies. Emissão por um produtor novo não torna opcional obrigatório.
- Segurança operacional: feat-026–032 preserva transição após movimento, worker obsoleto, posse/geração, retomada automática autorizada, original/compartilhados/destinos e links/junctions. Retirar alvos do inventário não significa apagar pastas.
- UI: feat-036–038 L1036–1062 exige diff de strings/código/DOM, zero acréscimos, layout/ações/foco/rascunhos/resposta tardia e Playwright MCP/Chrome no bundle identificado em 4310. use_playwright=false, L10, não dispensa prova: L1095 a mantém pendente sem ferramenta/evidência.
- Real: feat-040/041 L1145–1163 exige alvo/perfil/custo/efeitos autorizados e pendência para ausência/interrupção. Mocks/202/health/build não viram confirmação externa.

### S4.1 — Recorte final de provas ainda genérico

Status: ajuste necessário; relevância alta.

A cobertura geral existe, mas faltam casos explicitamente atribuídos para concluir sem interpretação posterior:

1. RNF-02, SPEC L148 e L19013–19017/L19195–19199, requer negativas de Host/Origin, sessão/CSRF e preservação de limites. Feat-039 AC2/AC4, Plano L1139–1141, manda executar suítes/examinar segurança, sem listar essas verificações e ausência de efeito. Testes existentes não estão nos hints específicos.
2. SPEC L215 preserva explicitamente INT-13/14. A 006 os cita em notas L493; feat-040 usa INT pertinentes e recuperação/cancelamento representativos, L1150–1152. Nenhum AC explicita lançamento real Windows com cwd/argv contendo espaços/Unicode, nem UTF-8 e encerramento de espera após falha de transporte. Prova filesystem de feat-027 L712 ou smoke com fixture não cobre lançamento OMP real.
3. Criação/publicação reais são condicionadas ao recorte de comprovação, feat-040 AC3. Esse recorte precisa indicar critério, cenário, efeito autorizado e pendências. Uma única passagem real não fecha automaticamente todo US-04/06/08.

Correção proposta: complementar feat-039/040/041 com matriz curta de caso, critério, superfície, versão, evidência e resultado/pendência. Incluir negativas HTTP pertinentes e INT-13/14; relacionar os demais INT da SPEC L215 aos cenários existentes. Não exigir matriz exaustiva/campanha nova. Evidência da própria versão pode ser reutilizada quando diretamente aplicável. Ausência de autorização mantém o gate correspondente pendente e não autoriza executar chamadas para preencher matriz.

### Histórico conferido

C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261027_205916/v4-final-acceptance-matrix.md L122–126 registra complemento real de 28/10: seis passagens, três versões e duas correções, com GitHub controlado, checks vazios, sem publicação real ou retry como outra tentativa. Feat-002 AC3 trata corretamente essa referência. Aqui foi conferido o registro documental; não foram reexecutados os artefatos, nem promovida essa prova à validação da retirada atual.

## S5 — Hints, contexto e preservação do trabalho

### Conferências

- Todas as sprints posteriores apontam SPEC_PROGRESS.md e retirada-inventario.md; a 001 define seus produtores. Baselines são referenciados nas sprints de comparação.
- Todos os caminhos de existing_files existem, exceto retirada-inventario.md e retirada-baseline.md, previstos como saídas da 001. Não são omissões de arquivos existentes. Key_interfaces orientam; os contratos efetivos devem ser atualizados no inventário.
- Plano L87 preserva checkout canônico/trabalho existente e proíbe Git writes implícitos; L5 proíbe cópias/worktrees/floors. Feat-028 AC2 preserva checkout, índice e alterações do operador. Nada autoriza stage/commit/push no repositório desta tarefa.
- Scripts citados existem em package.json L16–33: build/typecheck/lint, HTTP, compilado/execution-compiled/distribuição, aceitação/persistência e exclusão. Não foram executados.
- tests/setup.ts L4–11 bloqueia rede/subprocessos na suíte padrão. test:http usa vitest.http.config.ts L11 e apenas *-http.proof.ts; não significa toda segurança HTTP nem toda prova nativa.
- vitest.maintenance.config.ts L9 inclui maintenance/persistence-recovery/delivery-target; vitest.deletion.config.ts L4–8 inclui exclusão nativa sem providers.
- session-continuity.proof.ts L37–47 e session-recovery.proof.ts L25–29, em tests/native, têm guardas de autorização próprias e podem executar OMP real. Não são cobertos automaticamente pelos comandos locais.
- Metadados têm condição explícita; Plano L162 também proíbe transformar erros de transcrição do dicionário em colunas/FKs novas.

### S5.1 — Complementar referências existentes de prova e alinhamento

Status: complemento proposto; relevância média.

Adicionar aos hints da 014 os testes/configurações pertinentes já existentes, sem criar scripts ou infraestrutura:

- C:/Users/jeffe/Documents/Apps/nova-fabrica-software/tests/integration/http-security.test.ts.
- C:/Users/jeffe/Documents/Apps/nova-fabrica-software/apps/controller/src/http/security/security.test.ts.
- C:/Users/jeffe/Documents/Apps/nova-fabrica-software/vitest.sessions.config.ts.
- C:/Users/jeffe/Documents/Apps/nova-fabrica-software/vitest.session-recovery.config.ts.

Seleção/configuração de roteiro não significa execução ou autorização. O comando exato depende do cenário e da autorização correspondente.

Alinhamento normativo já tem responsáveis em feat-003/039 (Plano L56/L1140). Foram localizados conflitos atuais da normativa raiz L3153–3158/L3162/L3182 e Integração L151–167: uniões de leitura, conversores/backfill e layout global. Vincular esses trechos ao inventário de alinhamento; preservar transição atual e garantias de dados/identidade/versão. Não foram alterados nesta revisão. Histórico ou nome legacy não bastam para apagar exigência.

## Correções propostas para decisão

Nenhuma proposta foi aplicada ao JSON.

| Proposta | Achados | Alteração pretendida no plano |
| --- | --- | --- |
| P1 | S1.1 | Limitar features de preservação a retirada comprovada/consumidor afetado/regressão causada; demais obrigações são comprovação de comportamento existente. |
| P2 | S2.1 | Critério comum de saída verificável por fatia; atualização conjunta dos consumidores e checks pertinentes; explicitar fronteiras 007/012 e 008/009/010/011 sem ponte temporária. |
| P3 | S2.2 | Resultados anteriores aplicáveis de schema/persistência/desempenho em feat-002 e vínculo das comparações feat-035/038. |
| P4 | S3.1 | Reestimativa após inventário/metadados e gates externos distintos na 014, sem aumento automático de teto ou novas sprints presumidas. |
| P5 | S4.1/S5.1 | Negativas HTTP, INT-13/14, matriz de provas e hints existentes; trechos normativos conflitantes rastreados. |

P1–P5 ajustam planejamento/comprovação. Não sugerem implementação nem adicionam produto/interface/infraestrutura/efeito externo. Concordância com esses ajustes não equivale à aprovação final do gate. Se acordados, o JSON será editado diretamente e conferido; não há mudança presumida de quantidade de sprints/rounds.

## Pendências e conclusão

1. Discutir P1–P5 e registrar decisão do usuário.
2. Aplicar somente ajustes acordados e conferir novamente cobertura, dependências e metadados.
3. Manter a demonstração técnica dos metadados como pré-requisito de execução da 002, a resolver na 001. A validação do plano não afirma que essa demonstração já existe.
4. Após ajustes, decisão final do control gate pelo usuário no modo semi.

**Estado final: análise concluída; ajustes do plano pendentes de concordância; gate não aprovado.**

Somente este relatório foi gravado. SPEC, plano, código e fontes normativas permanecem sem alterações. Consulta Git somente leitura retornou a pasta documental desta execução como não rastreada; não houve stage/commit/push/stash ou outra escrita Git. Não houve build, teste de produto, browser, abertura do banco operacional, prova Windows, execução Maestri/OMP, publicação, recrutamento ou exclusão.


## Auditoria crítica de escopo A1–A7 — retomada após orientação do usuário

### Autoridade, método e correção da conclusão anterior

O usuário não aprovou P1–P5 e questionou a quantidade de sprints e a inclusão de funções/textos/avisos. Esta auditoria usa o limite aprovado como filtro anterior à cobertura: retirar exclusivamente compatibilidade anterior ao V3, preservando o produto e a interface atuais. Cobrir uma SPEC extensa não justifica reconstruir o que ela cataloga.

O relatório foi lido integralmente antes da resposta. A leitura integral anterior da SPEC/plano está registrada acima; nesta rodada foram relidos os 41 títulos, descrições e todos os critérios, além das regras globais do plano, SPEC L6–84/L147–239/L1786–1794/L19052–19070 e FEEDBACK-PROXIMO-PACOTE-V4.md L9–50. A extração inicial do JSON teve saída truncada; foi substituída por extração estruturada completa dos 41 itens e critérios. Não se inferiu conteúdo a partir do trecho truncado.

Referências abaixo usam as linhas do JSON original intacto; ACn é a posição do critério na feature. Os hashes das entradas permanecem os registrados na revisão. Não houve análise de funcionamento por execução nesta rodada. A existência das capacidades é declarada pelas fontes e apoiada pela exploração anterior; isto não prova que todas estejam funcionando hoje.

**Conclusão corrigida:** 14 sprints não estão justificadas por 14 mudanças independentes. O plano mistura retiradas concretas, regressões de capacidades existentes e fechamento documental como se fossem entregas equivalentes. O problema demonstrado é excesso de unidades de execução e fronteiras artificiais; não há pedido literal de novos banners, tooltips, telas ou diagnósticos no JSON. Não atribuir ao plano acréscimos que ele proíbe.

### A1 — Acréscimos de produto/interface: resultado concreto

**Status: nenhuma adição explícita encontrada; risco de reimplementação confirmado no planejamento.**

- Plano L5 proíbe novas funções, informações, textos, avisos, banners, tooltips, indicadores, estados visuais, botões, opções e telas. SPEC L14/L48/L81–84/L151/L160–170 e L19058–19070 repete esse limite.
- feat-009 AC2/3 (L206–214), feat-011 AC2 (L279–286), feat-022 AC2 (L605–612) e feat-036 AC3 (L1036–1043) exigem retirada sem aviso/fluxo substituto. Não são pedidos de novos avisos.
- feat-037 AC2/3 (L1046–1053) cita ETag, refresh, polling, resposta perdida e renovação de sessão como mecanismos atuais. Não autoriza novos textos de erro, estados de carregamento ou diagnósticos. Torná-los trabalho de desenvolvimento sem remoção afetando esses mecanismos seria expansão.
- feat-038 AC2 cita modais longos e exclusão parcial como cenários existentes de prova, não telas a criar. feat-041 é documento de evidências; não é dashboard/indicador do produto.
- feat-022 e SPEC E2 L1790 retiram o literal técnico legacy e representam ausência por current/null/lista vazia. Há alteração explícita de contrato de dados, não novo estado visual. É ajuste ligado à retirada; qualquer nova ação, bloqueio, alocação antecipada ou mensagem derivada dele viola o limite. A SPEC admite que essa alternativa técnica não foi escolha explícita do usuário: não apresentá-la como decisão pessoal já tomada.
- Não há feature solicitando nova dependência, telemetria, backup, servidor, rota ou infraestrutura. feat-003 AC2 é uma condição para decisão caso os metadados não bastem; não autoriza construir mecanismo hipotético.

### A2 — Reconstrução e fragmentação identificadas

**Status: ajustes necessários.**

1. **Sessões como sprint de capacidades existentes:** sprint-006, feat-016–018, Plano L420–463. Continuidade, isolamento, perguntas e cancelamento já devem existir; feat-017/018 não apontam uma variante antiga concreta a retirar. A retirada deve vir do inventário; estes critérios são regressões da mudança de contratos/executor, não autorização para refazer sessão, recuperação ou cancelamento.
2. **Captura e avaliação como novas entregas:** sprint-007, feat-020/021, L530–546, preserva durabilidade, Git, rodadas e versões. A retirada concreta está em feat-019. Separar as garantias do contrato alterado cria sprint de recomprovação/reconstrução sem corte próprio demonstrado.
3. **Resolvedor separado dos consumidores:** sprint-008 feat-023 (L615–621) retira os retornos antigos; sprint-009 feat-025 (L688–694) só depois conclui bootstrap/preparação/captura/diff/publicação/recuperação/retenção. Isso é um mesmo corte transversal. As garantias feat-024/026 são preservação; não justificam reconstrução da gestão de localização.
4. **Publicação sem remoção independente delimitada:** sprint-010 feat-028/029, L763–794. O corte concreto é não usar resolução antiga (028 AC3); versão aprovada, autorização, recibos e reconciliação são regressões do consumidor. Não há justificativa para sprint própria de publicação além do corte do resolvedor.
5. **Worker como feature de entrega:** sprint-011 feat-031 (L864–871) só conserva posse/geração/retomada/recibo atuais. A retirada concreta é feat-030. Não desenvolver worker, retentativa ou controles de retomada novos.
6. **Histórico separado dos codecs:** sprint-005 feat-013 (L352–359) retira leitores de captura/configuração; sprint-012 feat-033/034 (L943–960) volta a contratos, opcionais e não reescrita. Agrupar os consumidores com o contrato retirado; preservar busca e detalhes por regressão.
7. **UI retirada várias vezes:** feat-009, 011 AC2 e 022 AC2 já retiram consumidores visuais; feat-033 AC3 alcança histórico; feat-036 AC1 (L1039) repete mapeamento/plano/localizações/histórico. O corte visual acompanha cada domínio; comparação final única não é uma nova implementação de UI.
8. **Provas duplicadas se lidas como execuções integrais:** feat-006 e 039 AC2 repetem build/compilado/distribuição; feat-027 e 032 compartilham cenários de objeto/caminho/links/Windows; feat-034 repete hashes/GET/restart de 013/014/020; feat-002/035/038/041 têm papéis antes/depois/registro distintos, mas não devem criar quatro campanhas ou quatro coleções divergentes. Prova local da fatia e prova final da versão são justificáveis; repetição sem alteração de versão/superfície não é entrega nova.
9. **Defeitos anteriores:** feat-039, L1136, permite corrigir desvios dentro do escopo. Deve limitar-se à retirada e às regressões por ela causadas; bugs preexistentes e melhorias de UX ficam registrados, sem virar conserto geral do produto.

### A3 — Auditoria das 41 features e das 14 sprints

Legenda: **manter** = corte necessário ou preparação/comprovação necessária; **consolidar** = absorver na fatia pertinente, frequentemente como regressão; **remover como feature** = eliminar unidade autônoma do backlog, conservando a obrigação de preservação. Nenhum destes verbos autoriza apagar funcionalidade atual. N1–N5 são as cinco sprints propostas em A5.

| Sprint atual / decisão | Feature / referência no JSON | Decisão e motivo | Destino |
| --- | --- | --- | --- |
| 001 — manter preparação delimitada | feat-001 L30, AC1–3 | Manter inventário por finalidade; não catalogar implementação nova de todo domínio. | N1 |
| 001 | feat-002 L40, AC1–3 | Consolidar baseline nos mesmos registros; preservar evidência histórica por referência, sem campanha histórica nova. | N1 |
| 001 | feat-003 L50, AC1–4 | Consolidar condição de metadados com preparação do bootstrap; alinhamento final em N5, sem mecanismo novo presumido. | N1/N2/N5 |
| 002 — manter corte de bootstrap | feat-004 L108, AC1–3 | Manter instalação direta; 57 tabelas são equivalência do schema existente, não 57 features a desenvolver. | N2 |
| 002 | feat-005 L118, AC1–4 | Manter recusa sem escrita; reutilizar verificações atuais, sem diagnóstico/recuperação novo. | N2 |
| 002 | feat-006 L129, AC1–3 | Consolidar distribuição como aceite do bootstrap, sem novo empacotador. | N2 |
| 003 — consolidar contratos | feat-007 L186, AC1–3 | Manter retirada de variante de quatro estados; cinco estados já existem. | N3 |
| 003 | feat-008 L196, AC1–3 | Remover como feature autônoma; Ready/fila/ordenação são regressão do mapeamento, não nova implementação. | N3 |
| 003 | feat-009 L206, AC1–3 | Consolidar remoção de STATUS_MAPPING_LEGACY e UI com 007; mesmo corte. | N3 |
| 004 — consolidar contratos | feat-010 L269, AC1–3 | Consolidar integridade do plano como contrato/aceite da retirada 011. | N3 |
| 004 | feat-011 L279, AC1–3 | Manter retirada concreta de LegacyScaffoldPlan/Input e tratamento exclusivo. | N3 |
| 004 | feat-012 L289, AC1–3 | Remover como feature autônoma; replay/recibos são regressões de criação existente. | N3 |
| 005 — consolidar contratos e histórico | feat-013 L352, AC1–3 | Manter retirada de historicalCapture/Snapshot/costDefaults comprovadamente antigos, junto às consultas. | N3 |
| 005 | feat-014 L362, AC1–3 | Manter retirada de composição retroativa; bootstrap em N2 deve já ficar independente dela. Orientação/composição atual só regressão. | N2/N3 |
| 005 | feat-015 L372, AC1–3 | Remover como feature autônoma; preparação sem efeitos, revisões e ETag são regressões. | N3 |
| 006 — remover sprint autônoma | feat-016 L435, AC1–3 | Consolidar somente contratos de sessão comprovadamente afetados; nulabilidade/estágio são casos positivos. | N3 |
| 006 | feat-017 L445, AC1–3 | Remover como feature autônoma; continuidade/isolamento/replay não são capacidades a recriar. Associação antiga só se comprovada. | N3/N5 |
| 006 | feat-018 L455, AC1–3 | Remover como feature autônoma; perguntas/cancelamento/recuperação são regressões pertinentes. | N3/N5 |
| 007 — consolidar contratos/resultados | feat-019 L520, AC1–3 | Manter classificação e retirada real de variantes de resultado; não tornar todo campo emitido obrigatório. | N3 |
| 007 | feat-020 L530, AC1–3 | Remover como feature autônoma; resultado durável/captura Git/consulta fixa são regressões do contrato. | N3/N4/N5 |
| 007 | feat-021 L540, AC1–3 | Remover como feature autônoma; preservar rodadas/versões/pareceres sem reconstruir avaliação. | N3/N5 |
| 008 — unir com consumidores | feat-022 L605, AC1–3 | Consolidar retirada do literal antigo e ausência legítima; sem UI/alocação/estado novos. | N4 |
| 008 | feat-023 L615, AC1–3 | Manter retirada central de referências/fallbacks antigos. | N4 |
| 008 | feat-024 L625, AC1–3 | Remover como feature autônoma; identidade/alocação/concorrência são regressões do resolvedor. | N4 |
| 009 — unir a 008 | feat-025 L688, AC1–3 | Consolidar consumidores com 023; não deixar contrato alterado esperando próxima sprint. | N4 |
| 009 | feat-026 L698, AC1–3 | Consolidar retirada de transição exclusivamente global antiga; vN→v(N+1) é preservação, não reconstrução. | N4 |
| 009 | feat-027 L708, AC1–3 | Consolidar prova Windows de localizações e exclusão, compartilhando cenários pertinentes sem confundir resultados. | N4/N5 |
| 010 — remover sprint autônoma | feat-028 L778, AC1–3 | Consolidar consumidor de publicação no corte 023/025; versão/destino/autorização são regressões existentes. | N4 |
| 010 | feat-029 L788, AC1–3 | Remover como feature autônoma; recibos/reconciliação não têm remoção própria identificada. | N4/N5 |
| 011 — unir a localizações | feat-030 L854, AC1–3 | Manter retirada dos alvos globais antigos no mesmo corte de propriedade/resolução. | N4 |
| 011 | feat-031 L864, AC1–3 | Remover como feature autônoma; worker/geração/retomada atuais só regressão. | N4 |
| 011 | feat-032 L874, AC1–3 | Consolidar negativas Windows e ausência de limpeza com 027 e aceite do bootstrap. | N2/N4/N5 |
| 012 — remover sprint autônoma | feat-033 L943, AC1–3 | Consolidar remoção de leitores/projeções com 013/019 e consumidores respectivos; consulta atual é preservação. | N3 |
| 012 | feat-034 L953, AC1–3 | Consolidar hashes/GET/restart como aceite dos contratos, sem segundo projeto de imutabilidade. | N3/N5 |
| 012 | feat-035 L963, AC1–3 | Consolidar regressão de persistência/performance no fechamento, sem otimização/SLA novo. | N5 |
| 013 — remover sprint de implementação separada | feat-036 L1036, AC1–3 | Distribuir cortes visuais por domínio; remover unidade que repete mapeamento/plano/localizações/histórico. | N3/N4 |
| 013 | feat-037 L1046, AC1–3 | Remover como feature autônoma; contexto/drafts/ETag/respostas tardias são regressões dos consumidores afetados. | N3/N4/N5 |
| 013 | feat-038 L1056, AC1–3 | Consolidar comparação renderizada final única contra baseline. Não desenvolver UI nesta etapa. | N5 |
| 014 — manter fechamento delimitado | feat-039 L1134, AC1–4 | Manter fechamento da versão, sem correção geral de defeitos e sem repetir provas imutadas desnecessariamente. | N5 |
| 014 | feat-040 L1145, AC1–4 | Consolidar integração real como comprovação autorizada, não desenvolvimento/publicação presumida. Escopo de prova é ponto de decisão A4. | N5 |
| 014 | feat-041 L1156, AC1–4 | Consolidar matriz com inventário/registro de execução; não criar feature de aprovação nem simular gate. | N5 |

### A4 — A expansão vem também da SPEC? Conflitos e limites

**Status: tensões identificadas; nenhum contrato alterado.**

1. **Catálogo versus backlog:** SPEC L239 declara expressamente que 57 tabelas são estruturas existentes; L1798 proíbe inventar RLS/CRUD e L19058 proíbe novas páginas/componentes/hooks. As 67 rotas e 231 definições não geram unidades de implementação. O plano perde essa distinção ao enumerar capacidades completas nas features de preservação. Correção proposta de redação: marcar catálogos como referência e garantias como regressões dos cortes; isso não remove critério funcional.
2. **Instalação direta não é infraestrutura hipotética:** SPEC L231–237/L1794 e Feedback L25/L42 exigem schema atual sem conversores. feat-004/005 permanecem necessários. Não cortar bootstrap só para reduzir número. A representação dos metadados continua condição real, sem protocolo novo autorizado.
3. **E1 é escopo de recusa, não leitor substituto:** SPEC L237 manda inspecionar inclusive revisão inativa e criação concluída. O plano 005 segue essa exigência; não é desvio isolado do Planner. Se essa inspeção demandar novo framework de validação, migração ou duplicação de codecs, haverá conflito com SPEC L162–164 e limite do usuário. Proposta: explicitar que a inspeção usa contratos/verificações atuais estritamente para reconhecer/recusar, nunca interpretar ou converter legado. Necessidade maior volta à decisão; não fabricar solução no plano.
4. **E2 é alteração técnica de contrato, não produto novo:** SPEC L1790 já estabelece current/null/[] para eliminar legacy. Preservar ausência legítima é necessário; redefinir o ciclo de alocação ou apresentar bloqueio/diagnóstico seria expansão. Não remover nem trocar E2 unilateralmente. Registrar separadamente se o usuário desejar revisar essa escolha técnica da SPEC.
5. **Campanha de comprovação versus preservação pertinente:** SPEC L208–217 e Feedback L48–49 exigem percurso integrado e provas pertinentes. Plano 040 AC2 concretiza uma campanha ampla com correção, outra tentativa, recuperação e cancelamento, mesmo sem demonstrar impacto em cada caso. É expansão de trabalho de validação, não função nova. Proposta de correção a discutir: conservar percurso integrado e selecionar cenários adicionais por impacto demonstrado, reutilizando prova aplicável da mesma versão. Se isso reduzir obrigação integral atualmente lida em US-06/INT, ajustar expressamente a SPEC/plano após concordância; até lá o requisito permanece, não é dispensado.
6. **Publicação real:** Plano 040 AC3 condiciona criação/publicação ao recorte; SPEC L212 exige GitHub apenas no escopo autorizado. Não interpretar como obrigação de construir novo fluxo nem como autorização externa. Remover a necessidade de qualquer prova exigida só por economia seria alteração de aceite, e não consolidação. O plano enxuto mantém evidências pendentes quando não autorizadas.
7. **Medições e UI são obrigações de preservação:** SPEC RNF-06/E3 e RNF-05 não autorizam otimização, telemetria ou redesign. Usar testes/roteiros existentes sobre superfícies afetadas e uma comparação final; não abrir sprints novas de performance/UX. Não proponho eliminar essas provas.

Não foi encontrada contradição literal que ordene acrescentar aviso/banner/tela. O conflito concreto de interpretação é transformar o catálogo e os critérios de preservação em programa de reconstrução. A amplitude das provas finais merece decisão explícita, sem atribuir à aprovação original autorização para uma campanha externa ilimitada.

### A5 — Plano enxuto proposto: cinco sprints por dependência real

Esta é proposta, não edição do JSON. Os rótulos N1–N5 não substituem os IDs atuais até concordância. Features abaixo são grupos de retirada; testes e garantias ficam como critérios desses grupos, não como desenvolvimento separado.

| Nova sprint | Entrega delimitada | Origem | Dependência real e saída |
| --- | --- | --- | --- |
| N1 — Inventário e referência | Identificar retiradas comprovadas, consumidores e provas antes/depois; resolver classificação e demonstrar condição dos metadados. | 001 | Antecede alterações. Não criar arquitetura, infraestrutura nem catálogo novo de funções. Se faltar evidência, registrar impedimento do ramo. |
| N2 — Bootstrap sem conversões históricas | Instalação direta, abertura atual e recusa incompatível sem escrita; retirar composição retroativa do bootstrap e preservar compilado/distribuição. | 002 + parte de 005/014 | Depende da demonstração N1. Usa contratos atuais existentes para recusa; não depende de novas capacidades de sessão/publicação. |
| N3 — Contratos e leitores sem variantes antigas | Quatro cortes: mapeamento; planos de criação; configuração/preparação/perfis/histórico; resultados/sessões quando a variante antiga estiver comprovada. Cada um inclui HTTP/storage/executor/queries/UI diretamente afetados e regressões. | 003–007 + 012 + UI correspondente de 013 | Depende do inventário; ordem após N2 protege o suporte de abertura e evita duplicar remoção da composição. Não há dependência funcional obrigando quatro sprints de garantias. Fechar corte a corte, sem adiar consumidor essencial. |
| N4 — Referências e alvos antigos | Retirar resolvedor/fallbacks globais, consumidores, estado técnico antigo e alvos adicionais da exclusão; preservar transição atual, publicação e worker por regressão. | 008–011 + UI correspondente de 013 | Resolvedor e consumidores são uma fronteira integrada. Apoia-se no suporte atual de N2 e contratos já estabilizados de N3; não exige criar publicação/exclusão novamente. |
| N5 — Comprovação final da versão | Fechar inventário/normas, suítes pertinentes, persistência, comparação renderizada, Windows e percurso real autorizado; matriz única de evidências/pendências. | 013/038 + 014 + provas consolidadas | Depende da versão resultante de N2–N4. Gates externos/humanos permanecem distintos e não viram trabalho de implementação nem aprovação automática. |

**Por que cinco:** há uma preparação anterior, três fronteiras de alteração distintas (abertura da base; contratos/documentos; recursos e seus consumidores) e um fechamento sobre a versão completa. Separar cada garantia existente produz as 14 sprints atuais sem novas dependências. Fundir bootstrap, contratos e filesystem numa única sprint ocultaria riscos distintos e dificultaria verificar recusa sem escrita e segurança de recursos. A quantidade deriva dessas fronteiras, não de uma meta estética.

N3 e N4 são transversais, mas não representam a soma de todas as capacidades descritas nos títulos antigos: grande parte vira regressão existente. Não foi medida capacidade em rounds; não manter automaticamente 3 rounds para um agrupamento maior nem estimar novo total sem inventário. Se N1 provar volume de remoções independentes incompatível com execução de uma fatia, apresentar divisão concreta e justificada antes de alterar o plano; não ressuscitar automaticamente as 14 sprints nem marcar parcial como completo.

N2 e N3 têm acoplamento em composição e reconhecimento de domínio: retirar a chamada de composição retroativa acompanha N2; contratos e consultas de perfis acompanham N3. A recusa de N2 já usa a definição atual de contrato e não espera N3 para ficar correta. N3/N4 atualizam a inspeção se a retirada comprovada exigir, sem deixar base incompatível operar entre fatias.

### A6 — Antes/depois e decisão recomendada

| Aspecto | Plano atual | Proposta |
| --- | --- | --- |
| Sprints | 14 | 5, sujeitas ao inventário e à concordância |
| Features | 41 unidades misturando retirada, capacidade vigente e prova | Retiradas agrupadas por fronteira; garantias existentes como critérios de regressão, sem número artificial de features |
| Rounds | 40 previstos | Não estimados; consolidação não comprova redução proporcional de esforço |
| Sessão/captura/avaliação/worker | Features próprias, mesmo sem corte antigo específico | Preservação por testes; alteração só com vínculo comprovado à retirada |
| Resolvedor e consumidores | Espalhados em 008–011 | Mesmo corte integrado N4 |
| UI | Cortes de domínio e sprint separada repetindo-os | Cortes junto ao domínio + comparação final N5 |
| Histórico | Sprint própria após codecs/resultados | Leitores e consultas junto aos contratos N3 |
| Provas | Distribuídas com sobreposição e fechamento amplo | Evidências únicas por versão/cenário, localizadas na fatia e consolidadas no final |
| Funcionalidades/textos/avisos novos | Proibidos, mas risco de desenvolvimento implícito | Continuam proibidos; nenhuma nova capacidade como tarefa de entrega |
| SPEC | Catálogo e preservação extensos | Mantidos como referência; redação do alcance da comprovação a discutir, sem alteração unilateral |

Recomendação: não aprovar as 14 sprints na forma atual. Discutir primeiro a consolidação N1–N5 e o alcance de comprovação em A4. Só depois editar o plano, com conferência de cobertura e nenhuma obrigação atual silenciosamente perdida. P1–P5 anteriores não estão aprovadas e não são aplicadas por esta auditoria.

### A7 — Estado persistente e limites

- Auditoria das 14 sprints e 41 features concluída e registrada neste relatório.
- Somente este relatório foi alterado; JSON, SPEC, código e normas continuam intactos.
- Nenhum teste de produto, browser, prova nativa, provider, publicação ou implementação iniciado.
- Não há aprovação do plano ou gate. Nenhum marcador de conclusão de fase é devido.
- Próxima decisão: concordar ou ajustar N1–N5 e delimitar o alcance das provas finais. A concordância com a consolidação permite preparar a edição acordada; não equivale ao aceite do gate.

## B — Consolidação autorizada e conferida

### B1 — Autoridade e arquivos

O usuário autorizou aplicar N1–N5. Consolidação aplicada somente ao JSON do plano e registrada neste relatório. A SPEC permanece intacta. O OK não aprova o gate, não autoriza implementação nem efeitos externos. As seções anteriores conservam a análise e as referências de linhas da versão antiga; declarações de JSON intacto/proposta pendente nelas são históricas e estão superadas por esta seção. P1–P5 não foram aplicadas como pacote independente.

### B2 — Antes/depois e rastreabilidade

14 sprints / 41 features / 128 critérios passaram a 5 sprints / 13 grupos de retirada e comprovação / os mesmos 128 critérios. Cada critério conserva prefixo [feat-NNN.ACn], inclusive critérios absorvidos como regressões. Nenhuma obrigação foi dispensada. A descrição de cada grupo lista todas as features de origem; IDs eliminados como unidades autônomas continuam pesquisáveis nesses prefixos. A matriz S1 é lida pelo ID de origem e pela tabela abaixo, não pela antiga numeração de sprint.

| Sprint atual | Grupos atuais e features de origem | Dependência |
| --- | --- | --- |
| sprint-001 — Inventário e baseline | feat-001 ← feat-001; feat-002 ← feat-002; feat-003 ← feat-003 | nenhuma |
| sprint-002 — Bootstrap sem conversões históricas | feat-004 ← feat-004/feat-005/feat-006/feat-014 | sprint-001 |
| sprint-003 — Contratos e leitores sem variantes antigas | feat-007 ← feat-007/feat-008/feat-009; feat-010 ← feat-010/feat-011/feat-012; feat-013 ← feat-013/feat-015/feat-033/feat-034; feat-016 ← feat-016/feat-017/feat-018/feat-019/feat-020/feat-021/feat-036/feat-037 | sprint-002 |
| sprint-004 — Referências antigas com todos os consumidores afetados | feat-022 ← feat-022/feat-023/feat-024/feat-025/feat-026/feat-028/feat-029; feat-027 ← feat-027/feat-030/feat-031/feat-032 | sprint-003 |
| sprint-005 — Comprovação final da versão | feat-035 ← feat-035/feat-038; feat-039 ← feat-039; feat-040 ← feat-040/feat-041 | sprint-004 |

### B3 — Conferência S1–S5

- **S1 — Cobertura preservada:** conferência automática de igualdade dos 128 critérios por origem, com apenas atualização de referências de sprint. As 41 origens aparecem exatamente uma vez no agrupamento; as matrizes US/RF/RNF e E1/E2/E3 anteriores continuam rastreáveis. Não há autorização para reconstruir catálogo; garantias vigentes são regressões.
- **S2 — Dependências coerentes:** IDs e índices únicos 001–005; cadeia 001→002→003→004→005 sem ciclo, dependência ausente ou futura. Baseline anterior e condição de metadados precedem bootstrap. Contratos e consumidores fecham cada corte juntos; resolvedor, transição, publicação e exclusão não esperam sprint posterior para operar.
- **S3 — Dimensionamento provisório:** 13 grupos substituem 41 unidades, sem eliminar critérios. Três rounds por sprint permanecem apenas estimativa provisória compatível com o teto configurado, total nominal 15, sem comprovação de redução proporcional dos 40 anteriores. Inventário deve reavaliar capacidade antes da execução de 002–005; eventual divisão requer justificativa e decisão, sem sucesso parcial.
- **S4 — Aceite preservado:** instalação direta, recusa integral antes de escrita, current/null/[], referências obrigatórias inválidas recusadas, diff UI/strings e provas distintas continuam exigidos. Campanha real integral mantida, condicionada à autorização. Nenhum teste de produto foi executado nesta edição documental.
- **S5 — Contexto preservado:** hints de arquivos/interfaces das origens foram reunidos, referências de sprint atualizadas e fronteiras integradas explicitadas. Documentos de inventário/baseline/aceite e SPEC_PROGRESS mantêm os vínculos entre saídas.

### B4 — Conflitos e condições concretas

A4 permanece registrado. Não há ordem literal de acrescentar UI; catálogo é referência e preservação é regressão. A amplitude de comprovação real não foi reduzida: eventual redução continua dependendo de decisão específica e alinhamento normativo. A condição de schema_migrations continua pré-requisito da 001 para 002; necessidade de formato/mecanismo novo é impedimento para decisão, não infraestrutura autorizada. Não se afirmou conflito técnico já demonstrado nessa condição. SPEC não alterada unilateralmente.

### B5 — Verificação documental e estado do gate

JSON parseável; 5 sprints, 13 grupos, 41 origens e 128 critérios preservados; metadados conferidos; dependências válidas e acíclicas; SPEC SHA-256 inalterado: 28792af89689ca324e6c725ddccdf15721503bb72821a90ea6898f864ad934ab. Plano consolidado SHA-256: 77b381621d919af8896777870b029be48055a0eeca65c3b26ac87492f87ccf9d.

Validação desta edição limitada ao plano: sem implementação, testes de produto, browser, Windows nativo, Maestri/OMP real, publicação ou operações Git. Gate aguarda decisão final do usuário; não há aprovação automática nem conclusão de fase.
