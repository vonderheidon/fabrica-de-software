# Sugestões de enriquecimento — Reestruturação das verificações da fábrica

## Controle da análise

- SPEC: `C:/Users/jeffe/Documents/Apps/nova-fabrica-software/docs/Docs20261022_160728/SPEC20261022_160728.md`.
- Referências: PRD e stories-requisitos do mesmo diretório e sufixo `20261022_160728`.
- Total: **4 sugestões**, todas APLICADAS. As alternativas E1-a, E2-a, E3-a e E4-a foram explicitamente aprovadas pelo usuário e inseridas na SPEC.
- As 39 linhas RF e 12 linhas RNF do PRD estão presentes literalmente na SPEC. Os pontos abaixo são ambiguidades de apresentação e continuidade, não requisitos omitidos dessas tabelas.
- Contratos, persistência e componentes existentes são referências de reutilização. Não se propõe nova capacidade, dependência, endpoint, armazenamento ou execução automática.

## Cobertura por funcionalidade

| Funcionalidade | Cobertura encontrada e pontos a discutir |
| --- | --- |
| US-01 — Configuração global | Conta, pasta, perfis, integração, erros e ações estão definidos. E1 esclarece a granularidade dos controles realocados. |
| US-02 — Configuração do projeto | Origem, quadro/Status, papéis, locks, rascunhos e conflitos definidos. E1 esclarece um check compartilhado por várias seções; E3 delimita dados técnicos legítimos. |
| US-03 — Preparação | Elegibilidade, exceção fora de Ready, consulta parcial, divergências e revalidação informativa preservadas. Não foi identificada pergunta adicional específica. |
| US-04 — Tentativa | Autoridade, recursos, limites de observação e ações definidos. E2 trata convivência temporal de avisos; E4 trata consulta da operação ao reabrir. |
| US-05 — Checks por versão | Comandos/cwd/timeout e associação rodada/versão/artefatos definidos. E3 esclarece o alcance da vedação de conteúdo técnico. |
| US-06 — Criação | Pré-requisitos, modalidades, parcialidade, efeitos, consulta sem reconciliação e sucesso com pendências definidos. E1, E3 e E4 são transversais. |
| US-07 — Registros | Retirada dos controles operacionais, filtros, eventos técnicos, cursores e paginação preservados. E3 esclarece o alcance da vedação de conteúdo técnico. |
| US-08 — Dashboard | Resumos, destinos e distinção de causas independentes definidos. Não foi identificada pergunta adicional específica. |
| US-09 — Consistência | Estados anterior/incerto, falhas independentes, correlação, revisões e isolamento definidos. E2 e E4 detalham os cenários de apresentação e reabertura. |
| US-10 — Linguagem e agrupamento | Causa/contexto/próxima ação e teclado/foco definidos. E2 esclarece agrupamento entre momentos distintos; E3 delimita a linguagem operacional. |

Os estados de loading, vazio, erro, atualização e ausência de observação estão em 4.6. Skeleton é herdado, sem obrigação de novo componente. Tokens e hierarquia estão em 4.1–4.5. Responsividade e foco preservam o layout e os controles existentes; não há justificativa identificada para propor novos breakpoints ou redesenho. Sessão, acesso e recusas estão em 3.2, 4.4 e 5. Limites de inputs, paginação e transporte estão nos contratos e em 3.3; uploads não se aplicam. Não se propõem novos limites ou TTL por ausência de números novos no PRD.

## Configuração global e do projeto

- **E1** [APLICADO] [AÇÕES POR SEÇÃO] RF-39 e US-01/02 mandam colocar ações junto das seções responsáveis, mas `configuration` é um único check que pode produzir condições de várias seções. A SPEC não fixa se haverá um comando compartilhado ou controles repetidos que executam esse mesmo check. Também exige reutilizar Verificar status do GitHub sem duplicação. Qual distribuição de controles deve ser considerada correta?
  Opcoes: a) Um controle por check/ação existente no contexto: `configuration` compartilhado entre pasta/perfis no global e entre origem/quadro/papéis no projeto; `maestri_context` na integração global; recursos junto do objeto; Verificar status do GitHub permanece único, com seu fluxo atual. Os resultados são distribuídos por seção, e o texto do controle compartilhado deixa claro seu alcance. b) Controles junto de cada seção, explicitando quando executam o mesmo check completo e bloqueando envios simultâneos equivalentes. c) O usuário fornece outra distribuição explícita dos controles existentes.
  Sugestao: opcao a - reduz repetição de ações sem fingir que o backend oferece checks independentes por campo; não altera o fluxo de identidade nem cria subchecks.
  Referências: SPEC 3.2, semântica obrigatória; 4.2–4.3; US-01.7, US-02.7 e RF-39. Código: `apps/controller/src/modules/diagnostics/index.ts`, `apps/controller/src/modules/storage/diagnostics.ts`, `apps/web/src/features/projects/GitHubSetupPanel.tsx`.
  Aplicação proposta após aprovação: acrescentar uma matriz curta de controle, alcance e seção em 4.2/4.3; preservar os contratos e ações de vínculo/conta/pasta.

## Apresentação de resultados e histórico

- **E2** [APLICADO] [AVISOS ATUAIS E ANTERIORES] A SPEC exige preservar observações anteriores e limitar avisos detalhados equivalentes a um por superfície. Não explicita como renderizar a mesma causa na leitura persistida atual e em vários relatórios anteriores, nem como evitar que um bloqueio antigo pareça ainda vigente após uma correção. O componente atual de Registros renderiza separadamente a leitura e cada relatório. Qual apresentação deve substituir essa repetição nos destinos?
  Opcoes: a) Um aviso detalhado para a condição da leitura atual; ocorrências históricas equivalentes ficam como resumos identificados como anteriores, com data e estado. Se só houver resultado anterior, identificá-lo como tal; nunca usá-lo para declarar bloqueio ou prontidão atuais. Causas históricas independentes continuam distinguíveis. b) Avisos detalhados separados para cada momento, todos identificados por data e caráter anterior, explicitando uma exceção à contagem de duplicação. c) Mostrar somente a última observação na superfície e manter as demais acessíveis pelo histórico existente.
  Sugestao: opcao a - concilia preservação do histórico, limite de repetição e distinção temporal sem excluir dados ou atribuir validade atual a um relatório anterior.
  Referências: SPEC 4.5–4.6; US-09.1/6, US-10.1, RF-32/33 e RNF-04/09/12. Código: `apps/web/src/features/records/RecordsPanel.tsx` e `useDiagnostics.ts`.
  Aplicação proposta após aprovação: acrescentar regra de composição temporal e um cenário de teste em 4.6: bloqueio registrado, configuração corrigida, leitura sem esse impedimento e relatório antigo preservado sem apresentar bloqueio atual.

## Conteúdo operacional e conteúdo técnico necessário

- **E3** [APLICADO] [ALCANCE DA LINGUAGEM DO OPERADOR] RNF-05 e a métrica correspondente exigem zero fatos técnicos brutos nas superfícies afetadas, enquanto RF-20/21 e RF-29 preservam edição de comandos/cwd/timeout, artefatos de checks e eventos técnicos. A redação literal não delimita o que é diagnóstico bruto indesejado e o que é conteúdo necessário dessas funções. Qual interpretação deve orientar o aceite?
  Opcoes: a) A vedação aplica-se aos avisos, resumos e mensagens operacionais: não exibir códigos, IDs internos, recibos, payloads ou erros brutos como explicação. Preservar campos de configuração, caminhos pertinentes, comandos e acesso autorizado a artefatos/eventos nas funções existentes, com as proteções atuais e sem exposição de segredos. b) Estender a vedação também a esses campos e detalhes, identificando explicitamente quais funções existentes poderão deixar de mostrar esse conteúdo. c) O usuário fornece uma lista mais restrita de exceções permitidas.
  Sugestao: opcao a - esclarece a fronteira de apresentação sem remover funções exigidas no próprio PRD nem permitir dumps técnicos nos avisos.
  Referências: SPEC 4.2/4.5/4.6 e 5.2; RF-20/21/29/38, RNF-05 e métrica de conteúdo técnico. Código: `GitHubSetupPanel.tsx` apresenta caminho do executável; `CreationResult` apresenta pasta e branch; checks mantêm conteúdo técnico por finalidade.
  Aplicação proposta após aprovação: adicionar uma nota de interpretação junto de 4.5 e referenciá-la na medida de RNF-05, sem reescrever o requisito nem ampliar acesso a dados.

## Continuidade de consulta

- **E4** [APLICADO] [OPERAÇÃO PENDENTE AO REABRIR] A SPEC define isolamento ao fechar/reabrir e consulta pela correlação original, mas não define se o controle Consultar resultado deve reaparecer para uma operação ainda aceita/incerta ao retornar à mesma superfície. `useDiagnostics` mantém a correlação da ação em estado local; desmontar o hook a perde. GET diagnostics retorna no máximo quatro relatórios e não garante recuperar uma intenção cuja aceitação nem sequer foi confirmada. Qual continuidade é exigida?
  Opcoes: a) Na mesma sessão da página, preservar em memória a correlação conhecida ao fechar/reabrir, mantendo-a ligada ao contexto original. Após recarregar a página, usar somente operações recuperáveis pelas leituras existentes; se a correlação não puder ser recuperada, explicar a limitação sem afirmar conclusão e sem reenviar automaticamente. b) Limitar a consulta direta à superfície enquanto aberta; depois de fechar, usar apenas os relatórios e o histórico já recuperáveis, deixando esse limite explícito. c) Exigir recuperação garantida inclusive após recarregar a página; registrar que essa exigência precisa de avaliação de compatibilidade com o escopo antes de aprovar qualquer novo mecanismo.
  Sugestao: opcao a - mantém uma consulta utilizável ao retornar durante a sessão, sem prometer recuperação durável ausente nos contratos nem introduzir novo armazenamento ou reenvio.
  Referências: SPEC 4.3 e 4.6; US-09.2/3/6/7, RF-35/36 e RNF-07/08. Código: `apps/web/src/features/records/useDiagnostics.ts`, estados `verification`/`actionError` e `retryReceipt`; contrato `HttpDiagnosticsView.reports` em 3.2.
  Aplicação proposta após aprovação: acrescentar comportamento de reabertura e limite após recarga em 4.6, com teste que fecha/reabre durante uma operação e comprova consulta do mesmo identificador sem segundo POST. A correlação nunca é transferida para outro objeto/conta/revisão.

## Continuidade entre turnos

Ler este arquivo antes de responder. Aplicar cada decisão explicitamente aprovada de forma cirúrgica na SPEC e só então marcar seu item como APLICADO. Marcar recusas como REJEITADO. Não inferir aprovação por silêncio, recomendação ou criação deste arquivo.

## Decisões aplicadas nesta retomada

- E1-a: matriz de distribuição e alcance das ações em 4.2, preservando controle compartilhado e Verificar status do GitHub único.
- E2-a: composição atual/histórico e cenário de correção sem falso bloqueio vigente em 4.6.
- E3-a: delimitação dos avisos operacionais e preservação do conteúdo funcional necessário, com proteção de segredos, em 4.5; aplica-se também a RNF-05 e à métrica correspondente.
- E4-a: correlação em memória na mesma sessão, consulta após reabertura e recuperação após recarga limitada às leituras existentes, com cenários de aceite em 4.6. Sem armazenamento novo nem reenvio automático.
- Nenhuma outra lacuna concreta registrada. Nenhum código alterado.
