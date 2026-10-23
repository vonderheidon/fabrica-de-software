# Validação de sprints — Pacote V3 - entrega, agentes e operação

Data: 23/10/2026. Revisão 1. Status: **ajustes propostos; aguardando discussão e concordância**.

O relatório não aprova fase nem autoriza execução. O plano de sprints permanece inalterado. Os IDs S1–S6 identificam achados deste relatório; `sprint-NNN` identifica itens do plano.

## Fontes e método

- Fonte principal: `SPEC20261023_014848.md`, lida integralmente, incluindo histórias, RF/RNF, dicionário de dados, guardas, endpoints, catálogo de schemas, complementos E1-a/E2-a, interface e segurança.
- Plano: `sprints20261023_014848.json`, lido integralmente, incluindo configuração, descrições, features, critérios, hints e dependências.
- A SPEC na raiz foi comparada por conteúdo e coincide com o documento desta execução.
- Estrutura existente conferida: controlador com os dez domínios previstos, aplicação web organizada por features, contratos compartilhados, recursos e testes. Todos os caminhos de `hints.existing_files` existem atualmente. Existência de caminho não comprova que uma interface futura já esteja entregue.
- Orientação pelo CodeGraph MCP; a alternativa CLI instalada não reconheceu `explore`. Nenhum índice foi criado ou alterado. Não foi realizada auditoria da implementação.
- Conferência estrutural do JSON: 40 sprints, 85 features, 286 critérios e 96 rounds estimados; metadados de quantidade corretos; IDs de features sem duplicação; todas as dependências referenciam sprints existentes e anteriores. Isso também exclui ciclos no grafo declarado.
- Comandos de validação citados na SPEC foram confrontados com `package.json`; estão configurados. Não foram executados testes, servidor, providers ou efeitos externos nesta validação documental.

SHA-256 das entradas:

```text
SPEC20261023_014848.md
8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91
sprints20261023_014848.json
5ec5d758c53c37441ffefe4115c65a70fc6d8ea6ec19b108cbe691e923803b0d
```

## Resultado de cobertura

As 23 histórias e os 88 RF possuem correspondência temática no plano. **Não foi encontrada uma história inteira esquecida.** Isso não basta para declarar cobertura integral: há duas entregas com responsabilidade ou aceite insuficientemente explícitos, descritas em S1 e S3. S2 trata de uma dependência implícita entre persistências; S4 trata de conclusão com prova pendente. Não foi identificada feature inequívoca fora do escopo da SPEC.

“Coberto no plano” significa que há trabalho e aceite previstos; não significa implementado, testado ou aprovado.

| História e critérios | RF | Sprints responsáveis | Situação do plano |
| --- | --- | --- | --- |
| US-01.C1–C4 — inicialização/ferramentas | 01–06 | 004, 005; prova integrada 040 | Coberto |
| US-02.C1–C4 — criação completa/Kanban | 07–13 | 006, 007, 009; prova real 040 | Coberto; capacidade real é gate explícito |
| US-03.C1–C4 — cadastro/prontidão/fila | 14–17 | 006, 008, 009 | Coberto |
| US-04.C1–C5 — modos/destino/preservação | 18–22, 29–31 | 023, 024, 025, 026 | Coberto |
| US-05.C1–C4 e E2-a — destino local/intenção | 21, 23–24, 28 | 021, 022, 023, 026 | Coberto, inclusive captura e ausência de clone por salvar/GET |
| US-06.C1–C5 — continuação/reconciliação | 25–31 | 022, 023, 024, 025, 026 | Coberto |
| US-07.C1–C4 — nomes/colisão/legado | 32–35 | 023; apresentação 026 | Coberto |
| US-08.C1–C4 — instruções/captura | 36–40 | 010, 011, 019; prova efetiva 040 | Coberto |
| US-09.C1–C4 — continuidade dos papéis | 41–44, 47 | 012, 013, 014, 019 | Coberto funcionalmente; dependência implícita S2 |
| US-10.C1–C4 — terminais/recuperação | 45–49 | 012, 013, 014 | Coberto funcionalmente; dependência implícita S2 |
| US-11.C1–C3 — pacote de correção | 50–52 | 015, 020 | Coberto |
| US-12.C1–C4 — checks/aprovação por versão | 53–56 | 013, 015, 016, 020 | Coberto |
| US-13.C1–C4 — progresso/bloqueio/decisão | 57–60 | 017, 019, 020 | Coberto |
| US-14.C1–C3 — contestação | 60–63 | 018, 019, 020 | Coberto |
| US-15.C1–C4 — área gerenciada/transição | 64–68 | 001, 002, 003, 009 | **Parcial na ação de interface — S3** |
| US-16.C1–C5 — exclusão e otimização medida | 69–73 | 027, 028, 029 | Coberto; baseline, meta, alteração efetiva e comparação estão separados |
| US-17.C1–C4 — resumo consolidado | 74–75 | 026; fatos em 016, 023–025 | **Parcial na projeção backend — S1** |
| US-18.C1–C3 — tempo/atividade | 76–77 | 033, 034 | Coberto |
| US-19.C1–C3 — notificações | 78–80 | 035, 036 | Coberto, inclusive reserva durável e host real |
| US-20.C1–C4 e E1-a — encerramento/retomada | 81–83 | 037, 038, 039 | Coberto, inclusive revogação e corridas nas duas ordens |
| US-21.C1–C3 — busca global | 84–85 | 030, 032 | Coberto |
| US-22.C1–C3 — comparação histórica | 86–87 | 031, 032 | Coberto |
| US-23.C1–C3 — conexão renderizada | 88 | 034 | Coberto; CSS isolado expressamente insuficiente |

### Requisitos não funcionais

| RNF | Responsabilidade no plano | Situação |
| --- | --- | --- |
| 01 — desempenho da exclusão | 027, 028, 029, 040 | Coberto |
| 02 — busca/listas leves | 030, 031, 032 | Coberto |
| 03 — repetição/custo de checks | 016, 020 | Coberto |
| 04 — proteção de credenciais | 001, 010, 011, 035, 040 | Coberto transversalmente |
| 05 — perímetro/sessão/CSRF | 001, 040 e comandos dos respectivos domínios | Coberto transversalmente |
| 06 — trabalho local preservado | 022, 023, 024, 040 | Coberto |
| 07 — exclusão segura | 003, 028, 040 | Coberto |
| 08 — retomada sem duplicação | 006, 007, 022–025, 028, 040 | Coberto |
| 09 — evidência por versão | 013, 015, 016, 024 | Coberto |
| 10 — reinício/perda/indisponibilidade | 007, 012–014, 024, 033, 036–039 | Coberto |
| 11 — notificação deduplicada | 035, 036 | Coberto |
| 12 — causa/próxima ação/resumo único | 005, 009, 014, 020, 026, 029, 039 | Parcial no contrato de resumo — S1 |
| 13 — confirmação compacta | 029 | Coberto |
| 14 — conexão com texto e prova visual | 034 | Coberto |
| 15 — distribuição portátil | 004, 005, 040 | Coberto |
| 16 — Git/persistência limitada | 001, 002, 023, 025, 040 | Coberto |
| 17 — contratos/fronteiras/migrations | 001, sprints de domínio, 040 | Coberto transversalmente |
| 18 — transição e consumidores | 001–003, 009, 040 | Coberto no backend; ação de UI precisa de aceite S3 |

As rotas E01–E60 incluem comportamento preexistente a preservar, e não sessenta features novas. Os deltas de domínio estão distribuídos na matriz acima. V01 está em 022; V02 em 019; V03 em 031; V04/V05 em 037–039; V06/V07 em 035/036; V08 em 003, com lacuna de aceite da sua ação de UI em 009. Os gates INT pertinentes são preservados pelo contrato transversal e por 012–016/040, sem presumir atualização do contrato de sessões.

## Achados e ajustes propostos

### S1 — Responsável backend do resumo consolidado não está explícito

**Status:** aberto, aguardando concordância. **Prioridade:** alta. **Categoria:** cobertura e hints.

**Fonte:** SPEC §3.2, E07/E12; schemas `HttpAttemptDetail`, `HttpDeliveryDetail` e `DeliverySummaryView`; §4.2/4.3; US-17.C1–C4 e RF-74/75.

**Evidência no plano:** `sprint-026/feat-055` cobre a apresentação do resultado, mas é trabalho de frontend. `DeliverySummaryView` aparece como interface em hints de 023/026/040; as features backend 046–052 cobrem destino, integração, adaptação, efeitos e retenção, sem atribuir expressamente a entrega da projeção consolidada de leitura exigida por E07/E12. A busca atual por `DeliverySummaryView`/`delivery_summary` em contratos e controlador não encontrou declaração existente que pudesse ser tomada como pré-requisito pronto.

**Impacto:** há cobertura dos fatos e da tela, mas a interface consumida pela tela pode ficar sem sprint responsável. Referenciar o nome em hints não define seu aceite.

**Ajuste de plano proposto:** atribuir a uma sprint backend anterior à 026 a entrega dos contratos e projeções do resumo em E07/E12, com aceite por versão/critério/recibo, estados parcial e legado e detalhes sob demanda. Fazer 026 depender explicitamente dessa entrega e referenciar seus caminhos efetivamente entregues. A escolha de acomodar em 025 ou separar deve considerar S6. Não se propõe desenho de implementação.

**Resolução verificável:** existe responsável backend explícito, aceite observável da resposta e dependência do frontend; não basta adicionar o nome da interface aos hints.

### S2 — Identidade de sessão é pré-requisito implícito da ocupação

**Status:** aberto, aguardando concordância. **Prioridade:** média. **Categoria:** dependências e contexto.

**Fonte:** SPEC §2.1, `attempt_sessions` e `terminal_occupancies`; a segunda referencia obrigatoriamente a primeira.

**Evidência no plano:** 012/feat-024 entrega ocupações; 012/feat-025 exige sessão nova por tentativa. A responsabilidade nominal por `attempt_sessions` surge em 013/feat-026, e 013 depende de 012. Seus hints ainda dizem usar as sessões entregues na 012. O grafo declarado não tem ciclo; a ambiguidade está no conteúdo necessário para concluir 012.

**Ajuste de plano proposto:** esclarecer que 012 entrega também a identidade persistida mínima da sessão exigida por suas ocupações; deixar em 013 a continuidade entre passagens/versões. Atualizar os hints das duas sprints e os aceites correspondentes sem duplicar a responsabilidade pela mesma persistência.

**Resolução verificável:** 012 pode cumprir suas FKs e validar nova tentativa sem aguardar uma entrega atribuída apenas a 013.

### S3 — Ação de transição na interface não possui aceite completo

**Status:** aberto, aguardando concordância. **Prioridade:** alta. **Categoria:** cobertura e dependências.

**Fonte:** SPEC §3.2/V08, §4.2 `ProjectConfigurationDialog`, §4.3 `useProjectStorage` e §4.6; US-15.C4, RF-67/68.

**Evidência no plano:** 003 entrega plano, operação e recuperação backend. Em 009/feat-019, a UI identifica localizações, apresenta estados e condiciona a disponibilidade do comando à existência do backend; não há aceite explícito para o operador executar o plano vigente e acompanhar sua operação até resultado, parcial ou incerteza. A descrição fala em acompanhamento, mas os critérios não fecham esse percurso. A sprint 009 deliberadamente não depende de 003.

**Ajuste de plano proposto:** incluir aceite da ação e do acompanhamento de V08 na sprint de UI responsável e declarar sua dependência da 003. A consulta de localizações pode continuar independente; o percurso de comando precisa de responsabilidade explícita antes do aceite final.

**Resolução verificável:** o plano contém cenário de ação autorizada, operação aceita/incerta, fechar/reabrir, resultado confirmado e recusa por plano/revisão vencidos, preservando rascunho e identidade da operação.

### S4 — Critério final permite checks com falha como alternativa de aceite

**Status:** aberto, aguardando concordância. **Prioridade:** alta. **Categoria:** critérios de aceite.

**Fonte:** SPEC §1, validação e riscos; §4.6; §5.2. Prova parcial ou gate pendente não representa conclusão.

**Evidência no plano:** 040/feat-083, primeiro critério: comandos pertinentes “passam ou têm falha reproduzível explicitamente pendente”. A segunda alternativa é útil para registrar progresso, mas, como critério de aceite, pode ser marcada satisfeita mesmo com uma verificação obrigatória falhando. feat-085 impede declarar concluído o requisito com gate pendente, sem resolver explicitamente essa ambiguidade da conclusão da própria sprint.

**Ajuste de plano proposto:** separar registro de falha de condição de conclusão: checks obrigatórios pertinentes precisam passar; falha ou gate obrigatório sem prova mantém o respectivo aceite e o fechamento integrado pendentes. Falha preexistente deve ter relação com o escopo e decisão de tratamento registradas, sem equivalência automática a sucesso.

`use_playwright=false` não foi tratado como ausência de cobertura: 001 e as sprints de UI exigem expressamente prova própria, e 040 a consolida. O plano deve preservar essa obrigação; a configuração não dispensa a prova. Ausência de autorização para integrações reais também permanece pendência, sem execução presumida.

**Resolução verificável:** o texto não permite satisfazer um aceite obrigatório somente documentando sua falha.

### S5 — Descrição do projeto mantém precedência documental antiga

**Status:** aberto, aguardando concordância. **Prioridade:** média. **Categoria:** hints e contexto.

**Fonte:** SPEC §1: fontes aprovadas desta execução são PRD e stories; o discovery não é entrada e não foi consultado. A precedência está expressa no documento.

**Evidência no plano:** `project.description` chama `FEEDBACK-PROXIMO-PACOTE-V3.md` de “fonte de verdade do escopo aprovado” e orienta resolver lacunas “no discovery”. As sprints, por outro lado, já incorporam decisões detalhadas de E1-a/E2-a e compatibilidade aprovadas nesta execução. A coincidência atual entre SPEC da raiz e documento datado foi confirmada e não é problema presente.

**Ajuste de plano proposto:** alinhar a descrição às fontes e decisões da execução atual; incluir o caminho da SPEC datada nos hints iniciais, mantendo feedback como contexto subordinado. Remover a orientação de reabrir discovery como etapa implícita. Não alterar o escopo aprovado.

**Resolução verificável:** a entrada geral do plano e os hints não estabelecem precedência concorrente nem mandam refazer decisões já incorporadas à SPEC.

### S6 — Dimensionamento precisa considerar percursos, não apenas features

**Status:** aberto para discussão; recomendação de planejamento. **Prioridade:** média. **Categoria:** sizing.

Nenhuma sprint tem dez features nominais: todas têm duas ou três. Nenhuma foi identificada como uma única alteração trivial que claramente devesse ser fundida. As estimativas estão entre dois e três rounds, respeitando o máximo configurado de três. Não há histórico de capacidade que permita afirmar duração ou garantir suficiência desses números.

**Riscos principais:** 002 concentra novos caminhos e adaptação de muitos consumidores em três rounds; 009 reúne criação, cadastro e área gerenciada em dois; 026 reúne preparação, continuação e resumo em dois; 040 concentra regressão integrada, distribuição, provas Windows/Git, Maestri/OMP, GitHub, todas as superfícies visuais e documentação em três. Dependências externas tornam 040 especialmente pouco previsível. Acrescentar S1/S3 aumenta os recortes envolvidos.

**Ajuste de plano proposto:** reavaliar os recortes 002/009/026/040; preferir separar entregas com aceites próprios quando não couberem no limite atual. Para 040, distinguir a consolidação determinística das provas reais/visuais e do fechamento de evidências, preservando a aprovação integrada somente após todos os gates obrigatórios. Não aumentar limites automaticamente nem converter falta de autorização em aceite satisfeito. Atualizar IDs, índices, dependências e metadados caso a divisão seja aprovada.

**Resolução verificável:** registrar a decisão sobre manter ou dividir esses recortes e alinhar estimativas ao escopo resultante; esse achado, isoladamente, não afirma inviabilidade comprovada.

## Dependências, contexto e escopo: pontos preservados

- As sprints de frontend estão depois dos serviços que consomem, ressalvadas a responsabilidade ausente S1 e a ação condicional S3.
- Integração adaptada vem depois de execução, checks, aprovação e integração local; publicação vem depois de adaptação. Baseline precede otimização. Retomada do encerramento sucede pausa/drenagem.
- A pré-condição documental de sessão por papel/tentativa está em 001 e é reiterada em 012/013. É gate real, não aprovação implícita deste relatório.
- Hints posteriores referenciam arquivos existentes, interfaces e entregas anteriores, usando `SPEC_PROGRESS.md` como passagem de contexto. A matriz completa de critérios/evidências, porém, não deve ser adiada exclusivamente ao fechamento: 001 já exige atualização por sprint e isso precisa ser mantido.
- Os diários específicos, E1-a/E2-a, Backlog e compatibilidade legada estão na SPEC; não foram classificados como expansão de escopo.
- Não há proposta de alterar código, ampliar permissões, executar pipeline, modificar configuração visual automaticamente ou realizar publicação externa.

## Registro de decisões e próxima ação

| ID | Decisão do usuário | Alteração no plano | Estado |
| --- | --- | --- | --- |
| S1 | Pendente | Nenhuma | Aberto |
| S2 | Pendente | Nenhuma | Aberto |
| S3 | Pendente | Nenhuma | Aberto |
| S4 | Pendente | Nenhuma | Aberto |
| S5 | Pendente | Nenhuma | Aberto |
| S6 | Pendente | Nenhuma | Em discussão |

Discutir os ajustes pelo ID e editar o JSON somente após concordância. Depois da edição, conferir sintaxe, contagens, unicidade, dependências e cobertura novamente, registrar as alterações aqui e solicitar a aprovação final. Não encerrar a validação enquanto as lacunas obrigatórias permanecerem abertas.

Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.

---

## Revisão 2 — retomada e avaliação da divisão em 40 sprints

Data: 23/10/2026. **Status: avaliação documental concluída; plano não aprovado; ajustes aguardando concordância.** Esta revisão complementa a revisão 1 e prevalece sobre sua recomendação de dimensionamento quando houver diferença. Os achados e decisões anteriores foram preservados.

### Continuidade e verificação das entradas

O relatório persistente foi lido antes desta retomada. Os SHA-256 atuais da SPEC e do JSON coincidem exatamente com os registrados na revisão 1; portanto, a leitura integral e a matriz da avaliação anterior continuam referentes às mesmas entradas. A retomada conferiu novamente descrições, features, critérios, hints, estimativas e grafo do plano, com atenção aos recortes e às responsabilidades já apontadas. A estrutura da raiz permanece a do produto existente. Não houve alteração do JSON, implementação, teste operacional ou efeito externo.

### Conclusão de cobertura e aceite

Mantida a matriz das 23 histórias, dos 88 RF e dos 18 RNF da revisão 1. Não há história inteira sem correspondência, nem feature inequivocamente externa à SPEC. Há cobertura incompleta de entregas obrigatórias, impedindo aprovação:

- **S1, aberto:** explicitar responsabilidade backend e aceite da projeção consolidada de US-17/RF-74–75 em E07/E12, antes de seu consumo na 026.
- **S2, aberto:** esclarecer a entrega da identidade persistida de sessão necessária às ocupações da 012; a continuidade entre passagens permanece responsabilidade distinta da 013.
- **S3, aberto:** fechar o aceite da ação de transição e seu acompanhamento na UI, incluindo dependência da 003. A disponibilidade condicional da ação na 009 não garante entrega posterior do percurso.
- **S4, aberto:** retirar a equivalência entre checks passando e falha documentada no aceite final. Gate obrigatório pendente impede conclusão; evidência externa indisponível não é sucesso.
- **S5, aberto:** alinhar descrição e hints à precedência documental da SPEC desta execução, sem reabrir decisões aprovadas como discovery implícito.

Os critérios em geral são observáveis: há recusas diretas, identidade, versões, replay, reinício e provas renderizadas. As provas externas exigem autorização/capacidade e devem conservar status pendente enquanto ausentes. O plano não deve prometer que fixtures comprovam host, Windows, Maestri/OMP ou GitHub. O teto de rounds não elimina essas condições.

### S6 — Dimensionamento: parcialmente justificado, sem evidência para fixar quarenta

**Status:** aberto para decisão. **Prioridade:** média. Esta análise amplia e ajusta S6 da revisão 1: dividir mais sprints não é a recomendação geral; primeiro consolidar recortes pequenos elegíveis e reequilibrar os maiores.

Contagens reconferidas: **40 sprints, 85 features, 286 critérios, 96 rounds estimados**. São 35 sprints com duas features e cinco com três; 24 estimadas em dois rounds e 16 em três. Médias: 1,74 sprint e 3,70 features por história, 2,13 features por sprint. Essas razões são descritivas; não medem capacidade nem demonstram excesso por si mesmas. Uma história pode exigir várias superfícies e uma sprint pode atender várias histórias.

As 85 features são unidades de decomposição do trabalho, não 85 funcionalidades de produto independentes. Predomina a separação entre contrato/estado e recuperação/prova ou entre serviço e tela. Não foi demonstrada duplicação funcional que autorize apagar features em bloco. Entretanto, uniformidade em duas ou três features e dois ou três rounds não constitui justificativa de esforço: há recortes de amplitude bastante desigual.

#### Oportunidades concretas de consolidação

| Sprints atuais | Percurso comum | Recomendação de planejamento | Condição para consolidar |
| --- | --- | --- | --- |
| 004 + 005 | US-01, detecção/correção e wizard | Primeira candidata a uma entrega vertical de inicialização | Preservar as quatro features atuais e todos os seus critérios; ordem interna backend antes da UI; nova estimativa compatível com o teto |
| 010 + 011 | US-08, instruções efetivas e edição/histórico | Candidata a uma entrega vertical de perfis | Manter migração, captura imutável, proteção do contrato e prova renderizada; não somar UI sem reestimar |
| 035 + 036 | US-19, reserva/recibo e notificação local | Candidata a um percurso completo de notificação | Manter concorrência, replay, abas e prova no host como aceites separados; disponibilidade externa não pode ser presumida |

Cada par soma atualmente quatro rounds, acima do máximo configurado de três. **Nenhuma fusão está validada para execução ainda.** A consolidação só deve entrar no JSON após reestimativa justificável, preservando critérios; caso contrário, manter o par e explicitar o motivo. Se os três pares forem viáveis, o cenário aritmético seria 37 sprints mantendo as 85 features atuais, antes de acomodar S1/S3 e reequilibrar os recortes grandes. Isso é cenário de discussão, não estimativa final ou meta obrigatória. Não há base para prometer economia de rounds.

#### Separações que possuem justificativa própria

| Sprints | Justificativa para manter aceites distintos |
| --- | --- |
| 002 / 003 | Novas localizações com leitura compatível versus movimento legado retomável; riscos e condições de conclusão diferentes |
| 006 / 007 / 008 | Capacidade/mapeamento do quadro, criação com efeitos e cadastro/prontidão não são o mesmo comportamento |
| 012 / 013 | Posse/ocupação física e continuidade lógica; ajustar S2 sem confundir as duas responsabilidades |
| 015 / 016 / 017 / 018 / 019 | Pacote de correção, aprovação por versão, recorrência, contestação e decisão humana possuem regras de aceite próprias |
| 021 / 022 / 023 / 024 / 025 | Guardar intenção sem efeito, clonar com autorização, integrar, revalidar adaptação e publicar efeitos restantes são etapas semanticamente diferentes |
| 027 / 028 | Baseline e meta precisam anteceder otimização e comparação; medição sozinha não entrega RF-73 |
| 030 / 031 | Busca global e comparação histórica são capacidades distintas, ainda que compartilhem contexto e tela |
| 037 / 038 | Pausa/drenagem e retirada da pausa com revogação exigem corridas e recuperação próprias; ambas já estão estimadas em três rounds |

Manter aceites distintos não obriga sempre a manter sprints distintas; significa que qualquer consolidação precisa conservar sua ordem, cobertura e prova. Não se recomenda juntar os recortes complexos apenas para alcançar 23 sprints.

#### Concentração e repetição de validação

- **002:** adaptação transversal de consumidores e alocação de novos recursos em três rounds merece justificativa de capacidade.
- **009:** três percursos de projeto em dois rounds; acomodar S3 exige reestimar e decidir a responsabilidade da transição, sem fundir mais trabalho automaticamente.
- **026:** preparação, continuação e resumo de entrega em dois rounds; corrigir S1 antes do consumo e reavaliar o recorte.
- **040:** mistura regressão integrada, distribuição, várias provas reais, todas as superfícies visuais e documentação em três rounds. Tratar provas de domínio nas sprints responsáveis e deixar aqui apenas prova adicional de composição e fechamento. Caso o trabalho remanescente ainda exceda a capacidade, separar seus aceites em recortes estimáveis, sem dispensar os gates.

Há repetição intencional de preservação histórica, resposta perdida, contexto, segurança e prova visual. São garantias transversais, não necessariamente trabalho duplicado. A 001 já prevê contrato comum. Na revisão do plano, manter nesse contrato o que é comum e deixar em cada sprint o cenário específico e sua evidência. A 040 já orienta não repetir gates válidos sem mudança ou dúvida; reforçar a fronteira entre evidência reutilizável de domínio e regressão da composição final. Não remover provas específicas sob o argumento de eliminar repetição.

**Recomendação:** corrigir S1–S5; avaliar os três pares de consolidação; reequilibrar 002/009/026/040; somente então fixar a quantidade e os rounds finais. A divisão atual em quarenta é plausível como decomposição técnica, mas não está suficientemente justificada como agenda de execução. A quantidade de histórias não fornece uma quantidade ideal de sprints.

### S7 — Dependências transitivas repetidas dificultam avaliar o plano

**Status:** aberto, aguardando concordância. **Prioridade:** baixa. **Categoria:** dependências e legibilidade.

O grafo declarado contém **367 arestas**. Em **306**, a mesma sprint dependida já é alcançável por outra dependência declarada da sprint consumidora. Restam 61 arestas na redução transitiva do grafo atual. Exemplo: 040 lista todas as 39 anteriores, embora várias já sejam pré-requisitos de outras listadas.

Isso não representa 306 dependências inválidas, ciclos ou 306 features duplicadas. Representa repetição estrutural no JSON. A ordem atual referencia apenas sprints existentes e anteriores, sem ciclos; as pendências semânticas S1/S2/S3 continuam existindo independentemente dessa propriedade.

**Ajuste de plano proposto:** se o consumidor de dependencies usa o fechamento transitivo usual, manter pré-requisitos imediatos suficientes e preservar referências de contexto nos hints. Confirmar essa semântica antes de editar; o cálculo de alcançabilidade não demonstra como o executor interpreta a lista. Após qualquer consolidação, recalcular dependências e conferir a ordem novamente. Não eliminar dependências pelo simples fato de parecerem numerosas.

**Resolução verificável:** grafo sem ciclos ou referências ausentes, mesma precedência obrigatória, dependências funcionais de S1–S3 explícitas e sem serialização adicional desnecessária.

### Decisões solicitadas e estado final desta avaliação

| ID | Decisão necessária | Situação |
| --- | --- | --- |
| S1 | Atribuir entrega backend e dependência do resumo consolidado | Pendente; JSON intacto |
| S2 | Esclarecer responsabilidade da identidade de sessão na 012 | Pendente; JSON intacto |
| S3 | Fechar ação/acompanhamento da transição na UI e dependência | Pendente; JSON intacto |
| S4 | Exigir sucesso dos checks e gates obrigatórios para concluir | Pendente; JSON intacto |
| S5 | Corrigir precedência documental da descrição/hints | Pendente; JSON intacto |
| S6 | Reestimar pares candidatos e recortes concentrados antes de fixar quantidade | Pendente; JSON intacto |
| S7 | Simplificar dependências somente após conferir semântica do consumidor | Pendente; JSON intacto |

**Recomendação para decisão:** concordar com S1–S5 e com a revisão de dimensionamento de S6; tratar S7 como ajuste de legibilidade condicionado. Não aprovar o plano atual. Após concordância, editar somente o plano autorizado, preservar a rastreabilidade e conferir JSON, contagens, IDs, dependências e cobertura antes de solicitar aprovação final.

Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.

---

## Revisão 3 — ajustes autorizados e revalidação do plano

Data: 23/10/2026. **Estado vigente: plano revisado, aguardando aceite final do usuário.** A autorização recebida cobre ajustes e nova validação; não aprova fase nem inicia implementação. As revisões 1 e 2 acima são histórico, incluindo seus estados anteriores. Esta revisão registra a resolução vigente.

### Alterações e resolução dos achados

| Achado | Alteração no plano (IDs finais) | Resultado |
| --- | --- | --- |
| S1 | sprint-028/feat-086 entrega DeliverySummaryView e E07/E12; sprint-029 depende dela | Resolvido no plano; cinco aceites explícitos para contrato, versão, recibos, parcial/legado e leitura sem efeito |
| S2 | sprint-014 entrega identidade mínima de attempt_sessions antes de ocupação; sprint-015 consome e estende continuidade | Resolvido; responsabilidades e ordem explícitas |
| S3 | feat-019 transferida para sprint-011, dependente de sprint-004 | Resolvido; ação V08, 202, resposta perdida, reabertura, parcial/incerteza e plano vencido com prova renderizada |
| S4 | sprint-044/feat-083 exige checks obrigatórios passando; feat-085 impede fechamento com gate pendente | Resolvido; falha registrada não equivale a aceite |
| S5 | Descrição geral e hints iniciais apontam a SPEC datada e precedência PRD/stories; feedback subordinado | Resolvido; orientação de reabrir discovery removida |
| S6 | Recortes e rounds descritos abaixo; três pares mantidos com justificativa | Resolvido como decisão de planejamento; estimativas não constituem prova de capacidade |
| S7 | Nenhuma dependência original removida | Avaliação concluída conservadoramente; semântica do executor não confirmada, simplificação não realizada |

### Dimensionamento decidido

Resultado: **44 sprints, 86 features, 298 critérios e 106 rounds estimados**, com máximo de três rounds por sprint. Não se adotou 37 nem 23 como meta. O aumento decorre de quatro responsabilidades antes concentradas ou implícitas, não de funcionalidades adicionais de produto. As 85 features originais permanecem; feat-086 explicita cobertura obrigatória já existente na SPEC.

| Recorte original | Decisão e esforço ativo estimado | Justificativa |
| --- | --- | --- |
| 002 | sprint-002: 2 rounds; sprint-003: 3 rounds | Separar identidade/leitura de localizações da alocação e adaptação transversal de consumidores; três rounds para ambos juntos não estava justificado |
| 009 | sprint-010: 2 rounds; sprint-011: 2 rounds | Criação/cadastro conservam dois percursos; transição com ação e recuperação ganha aceite e responsabilidade próprios |
| 026 | Backend sprint-028: 2 rounds; UI sprint-029: 3 rounds, antes 2 | Backend antes ausente fica explícito; UI tem preparação, continuação e resumo, um grupo por round previsto, com prova integrada |
| 040 | Gates operacionais sprint-043: 3 rounds; fechamento sprint-044: 3 rounds | Separar disponibilidade/prova real da regressão determinística e documentação; provas de domínio ficam nas sprints responsáveis, reutilizadas somente com validade demonstrada |

Os pares originais **004+005, 010+011 e 035+036 foram mantidos separados**. Cada par conserva quatro rounds somados: respectivamente host/detecção e wizard; migração/captura e editor/histórico; reserva/recibo e consumidor/prova no host. Não há histórico de capacidade ou redução demonstrável que sustente comprimir esses trabalhos em três rounds sem retirar aceites. A fundamentação específica consta também dos hints de cada sprint. Não se eleva o teto nem se presume economia por eliminar uma passagem de contexto.

O incremento líquido é de 10 rounds previstos. As sprints novas com uma feature possuem vários cenários e fronteiras de validação; não são ajustes triviais. Os rounds são previsão de esforço ativo, não duração de calendário nem garantia; autorização, fornecedor e host podem impedir aceite por tempo indeterminado. Ao esgotar o teto, registrar pendência e replanejar, sem marcar conclusão automática.

### S7 — limite da verificação do executor

Orientação por CodeGraph e busca dirigida nos diretórios apps, packages, scripts e .lionclaw não localizaram o consumidor de sprints.json, max_rounds_per_sprint ou dependências de sprint. Os pipelines versionados em .lionclaw contêm artefatos; a coordenação de tentativas da fábrica não comprova a semântica do executor deste plano. A busca ficou restrita à raiz autorizada e não se inspecionou instalação externa. Portanto não foi confirmada a hipótese de que dependências transitivas podem ser removidas sem mudar execução/contexto. **Todas as 367 arestas originais foram preservadas por mapeamento**, acrescentando somente pré-requisitos das responsabilidades separadas. S7 não bloqueia cobertura do plano; permanece uma oportunidade opcional de legibilidade, sem alegação de semântica confirmada.

### Revalidação realizada

- JSON válido; mesmos campos estruturais do plano original; configuração e identificadores de execução preservados. Metadados de quantidade e versão atualizados.
- 44 IDs de sprint e 86 IDs de feature únicos; índices contíguos e IDs na ordem do array. Todas as referências textuais sprint-NNN nos hints/descrições foram renumeradas junto das dependências.
- 454 dependências finais, todas existentes e anteriores; sem repetição na lista de cada sprint, sem ciclos. Nenhuma aresta original removida; pré-requisitos de alocação, ação de transição, resumo backend e gates finais precedem seus consumidores.
- 285 dos 286 critérios originais preservados textualmente, salvo renumeração de referências; o critério restante foi fortalecido em S4. Novos critérios fecham as lacunas sem retirar aceites existentes.
- Todos os caminhos de hints.existing_files existem; nomes de interfaces futuras são entregas previstas, não alegação de código pronto. Caminhos efetivos futuros devem ser registrados durante as entregas.
- Cobertura temática das 23 histórias/88 RF/18 RNF preservada; US-15, US-17, RNF-12 e RNF-18 agora têm responsáveis e aceites antes faltantes. E1-a/E2-a e guardas originais preservados. Provas reais, visuais, nativas e determinísticas continuam distintas.
- Nenhum código de produto alterado, teste de produto executado, pipeline iniciado ou efeito externo autorizado por esta revisão. Verificações estruturais não comprovam comportamento implementado.

### Matriz de cobertura vigente — IDs finais

| História | Sprints responsáveis principais | Situação |
| --- | --- | --- |
| US-01 — todos os critérios da matriz original | sprint-005, sprint-006 | Coberto no plano |
| US-02 — todos os critérios da matriz original | sprint-007, sprint-008, sprint-010 | Coberto no plano |
| US-03 — todos os critérios da matriz original | sprint-007, sprint-009, sprint-010 | Coberto no plano |
| US-04 — todos os critérios da matriz original | sprint-025, sprint-026, sprint-027, sprint-029 | Coberto no plano |
| US-05 — todos os critérios da matriz original | sprint-023, sprint-024, sprint-025, sprint-029 | Coberto no plano |
| US-06 — todos os critérios da matriz original | sprint-024, sprint-025, sprint-026, sprint-027, sprint-029 | Coberto no plano |
| US-07 — todos os critérios da matriz original | sprint-025, sprint-029 | Coberto no plano |
| US-08 — todos os critérios da matriz original | sprint-012, sprint-013, sprint-021 | Coberto no plano |
| US-09 — todos os critérios da matriz original | sprint-014, sprint-015, sprint-016, sprint-021 | Coberto no plano |
| US-10 — todos os critérios da matriz original | sprint-014, sprint-015, sprint-016 | Coberto no plano |
| US-11 — todos os critérios da matriz original | sprint-017, sprint-022 | Coberto no plano |
| US-12 — todos os critérios da matriz original | sprint-015, sprint-017, sprint-018, sprint-022 | Coberto no plano |
| US-13 — todos os critérios da matriz original | sprint-019, sprint-021, sprint-022 | Coberto no plano |
| US-14 — todos os critérios da matriz original | sprint-020, sprint-021, sprint-022 | Coberto no plano |
| US-15 — todos os critérios da matriz original | sprint-001, sprint-002, sprint-004, sprint-003, sprint-011 | Coberto no plano |
| US-16 — todos os critérios da matriz original | sprint-030, sprint-031, sprint-032 | Coberto no plano |
| US-17 — todos os critérios da matriz original | sprint-028, sprint-029 | Coberto no plano |
| US-18 — todos os critérios da matriz original | sprint-036, sprint-037 | Coberto no plano |
| US-19 — todos os critérios da matriz original | sprint-038, sprint-039 | Coberto no plano |
| US-20 — todos os critérios da matriz original | sprint-040, sprint-041, sprint-042 | Coberto no plano |
| US-21 — todos os critérios da matriz original | sprint-033, sprint-035 | Coberto no plano |
| US-22 — todos os critérios da matriz original | sprint-034, sprint-035 | Coberto no plano |
| US-23 — todos os critérios da matriz original | sprint-037 | Coberto no plano |

As provas de composição real terminam em sprint-043; a regressão integrada e a rastreabilidade final em sprint-044. A matriz RF/RNF da revisão 1 continua aplicável usando o mapeamento abaixo, acrescida das quatro entregas explicitadas nesta revisão.

### Mapeamento dos quarenta IDs anteriores

| ID na revisão 2 | ID final | Nome vigente |
| --- | --- | --- |
| sprint-001 | sprint-001 | Fundação incremental, compatibilidade e continuidade dos Coders |
| sprint-002 | sprint-002 | Identidade e leitura das localizações gerenciadas |
| sprint-003 | sprint-004 | Transição retomável dos diretórios legados |
| sprint-004 | sprint-005 | Inicialização acessível e detecção de ferramentas |
| sprint-005 | sprint-006 | Wizard de ferramentas e correção da instalação |
| sprint-006 | sprint-007 | Mapeamento V3 e capacidades reais do Kanban |
| sprint-007 | sprint-008 | Criação completa e retomada sem duplicação |
| sprint-008 | sprint-009 | Cadastro incompleto e prontidão efetiva |
| sprint-009 | sprint-010 | Criação completa e cadastro na interface |
| sprint-010 | sprint-012 | Instruções efetivas versionadas no backend |
| sprint-011 | sprint-013 | Editor de instruções e perfil histórico |
| sprint-012 | sprint-014 | Terminais próprios e ocupação segura |
| sprint-013 | sprint-015 | Sessões contínuas por papel na tentativa |
| sprint-014 | sprint-016 | Sessões, recursos e recuperação na interface |
| sprint-015 | sprint-017 | Pacote verificável de correção |
| sprint-016 | sprint-018 | Revisão focada e aprovação completa por versão |
| sprint-017 | sprint-019 | Progresso verificável e bloqueio de recorrência |
| sprint-018 | sprint-020 | Contestações e divergência encaminhada |
| sprint-019 | sprint-021 | Decisões humanas e preparação sucessora |
| sprint-020 | sprint-022 | Achados, progresso, contestações e decisões na UI |
| sprint-021 | sprint-023 | Intenção de destino na preparação e captura |
| sprint-022 | sprint-024 | Seleção e clonagem autorizada do destino |
| sprint-023 | sprint-025 | Integração local e identidade descritiva da entrega |
| sprint-024 | sprint-026 | Adaptação de integração com nova revisão |
| sprint-025 | sprint-027 | Continuação autorizada, push e PR reconciliáveis |
| sprint-026 | sprint-029 | Destino, modos e resumo consolidado da entrega |
| sprint-027 | sprint-030 | Baseline e meta verificável da exclusão |
| sprint-028 | sprint-031 | Otimização efetiva e exclusão recuperável |
| sprint-029 | sprint-032 | Confirmação compacta e acompanhamento da exclusão |
| sprint-030 | sprint-033 | Busca global paginada de tentativas |
| sprint-031 | sprint-034 | Comparação histórica da mesma issue |
| sprint-032 | sprint-035 | Busca e comparação no histórico da interface |
| sprint-033 | sprint-036 | Etapas, espera e atividade observada |
| sprint-034 | sprint-037 | Acompanhamento visual e conexão coerente |
| sprint-035 | sprint-038 | Reservas duráveis de notificação local |
| sprint-036 | sprint-039 | Notificações locais e acesso à tentativa |
| sprint-037 | sprint-040 | Pausa durável e drenagem do controlador |
| sprint-038 | sprint-041 | Retomada de novos inícios e revogação do fechamento |
| sprint-039 | sprint-042 | Encerramento guiado e retomada na interface |
| sprint-040 | sprint-044 | Regressão integrada e fechamento das evidências |

Novas responsabilidades: sprint-003 (feat-004 transferida), sprint-011 (feat-019 transferida), sprint-028 (feat-086 nova, cobertura obrigatória do resumo), sprint-043 (feat-084 transferida).

### Plano resultante completo

| Sprint | Entrega | Features | Rounds |
| --- | --- | --- | --- |
| sprint-001 | Fundação incremental, compatibilidade e continuidade dos Coders | feat-001, feat-002 | 2 |
| sprint-002 | Identidade e leitura das localizações gerenciadas | feat-003 | 2 |
| sprint-003 | Alocação gerenciada e adaptação dos consumidores | feat-004 | 3 |
| sprint-004 | Transição retomável dos diretórios legados | feat-005, feat-006 | 3 |
| sprint-005 | Inicialização acessível e detecção de ferramentas | feat-007, feat-008 | 2 |
| sprint-006 | Wizard de ferramentas e correção da instalação | feat-009, feat-010 | 2 |
| sprint-007 | Mapeamento V3 e capacidades reais do Kanban | feat-011, feat-012 | 3 |
| sprint-008 | Criação completa e retomada sem duplicação | feat-013, feat-014 | 3 |
| sprint-009 | Cadastro incompleto e prontidão efetiva | feat-015, feat-016 | 2 |
| sprint-010 | Criação completa e cadastro na interface | feat-017, feat-018 | 2 |
| sprint-011 | Localizações e transição gerenciada na interface | feat-019 | 2 |
| sprint-012 | Instruções efetivas versionadas no backend | feat-020, feat-021 | 2 |
| sprint-013 | Editor de instruções e perfil histórico | feat-022, feat-023 | 2 |
| sprint-014 | Terminais próprios e ocupação segura | feat-024, feat-025 | 3 |
| sprint-015 | Sessões contínuas por papel na tentativa | feat-026, feat-027 | 3 |
| sprint-016 | Sessões, recursos e recuperação na interface | feat-028, feat-029 | 2 |
| sprint-017 | Pacote verificável de correção | feat-030, feat-031 | 2 |
| sprint-018 | Revisão focada e aprovação completa por versão | feat-032, feat-033 | 3 |
| sprint-019 | Progresso verificável e bloqueio de recorrência | feat-034, feat-035 | 2 |
| sprint-020 | Contestações e divergência encaminhada | feat-036, feat-037 | 2 |
| sprint-021 | Decisões humanas e preparação sucessora | feat-038, feat-039 | 2 |
| sprint-022 | Achados, progresso, contestações e decisões na UI | feat-040, feat-041 | 2 |
| sprint-023 | Intenção de destino na preparação e captura | feat-042, feat-043 | 2 |
| sprint-024 | Seleção e clonagem autorizada do destino | feat-044, feat-045 | 3 |
| sprint-025 | Integração local e identidade descritiva da entrega | feat-046, feat-047, feat-048 | 3 |
| sprint-026 | Adaptação de integração com nova revisão | feat-049, feat-050 | 3 |
| sprint-027 | Continuação autorizada, push e PR reconciliáveis | feat-051, feat-052 | 3 |
| sprint-028 | Contrato e projeção do resumo consolidado | feat-086 | 2 |
| sprint-029 | Destino, modos e resumo consolidado da entrega | feat-053, feat-054, feat-055 | 3 |
| sprint-030 | Baseline e meta verificável da exclusão | feat-056, feat-057 | 2 |
| sprint-031 | Otimização efetiva e exclusão recuperável | feat-058, feat-059 | 3 |
| sprint-032 | Confirmação compacta e acompanhamento da exclusão | feat-060, feat-061 | 2 |
| sprint-033 | Busca global paginada de tentativas | feat-062, feat-063, feat-064 | 3 |
| sprint-034 | Comparação histórica da mesma issue | feat-065, feat-066 | 2 |
| sprint-035 | Busca e comparação no histórico da interface | feat-067, feat-068 | 2 |
| sprint-036 | Etapas, espera e atividade observada | feat-069, feat-070 | 2 |
| sprint-037 | Acompanhamento visual e conexão coerente | feat-071, feat-072 | 2 |
| sprint-038 | Reservas duráveis de notificação local | feat-073, feat-074 | 2 |
| sprint-039 | Notificações locais e acesso à tentativa | feat-075, feat-076 | 2 |
| sprint-040 | Pausa durável e drenagem do controlador | feat-077, feat-078 | 3 |
| sprint-041 | Retomada de novos inícios e revogação do fechamento | feat-079, feat-080 | 3 |
| sprint-042 | Encerramento guiado e retomada na interface | feat-081, feat-082 | 2 |
| sprint-043 | Conferência dos gates operacionais e composição real | feat-084 | 3 |
| sprint-044 | Regressão integrada e fechamento das evidências | feat-083, feat-085 | 3 |

### Identidade dos artefatos e aceite final

SHA-256 da SPEC inalterada: 8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91.

SHA-256 do plano revisado: c9faebe1e1908cc487c8595dbcec437e8c80fd7540c50f70f4e92b4a3c9fdaac.

A edição e as verificações documentais estão registradas em revise-sprints-v2.cjs nesta pasta, com guarda contra reexecução sobre outra versão. Esta é uma revisão do plano, não implementação. **Não permanecem lacunas de cobertura identificadas abertas no plano; a aprovação final continua pertencendo ao usuário.** Permanecem como condições futuras: compatibilização documental das sessões prevista na primeira sprint e provas obrigatórias com autorização/capacidade pertinentes. A semântica externa do executor não foi verificada; por isso S7 não resultou em remoção de dependências.

Se nao ha mais nada para ajustar, clique no botao Aprovar para avancar para a proxima fase.


### Conferência final de referências após renumeração

Corrigidas também as referências com prefixo plural `sprints-NNN` nos hints e explicitada a lista de pré-requisitos do resumo, evitando intervalos ambíguos. Contagens, critérios e dependências não mudaram. O hash acima identifica a versão intermediária da revisão 3; **SHA-256 final vigente do plano: 36fc9b6e6388646002da1c9fb4e38508ffe4b01b0e6b816ad838de7b8e718e0a**. O script da revisão recebeu a mesma correção de renumeração.
