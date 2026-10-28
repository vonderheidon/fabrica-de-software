# Sugestões de enriquecimento — V4, remoções funcionais

## Estado da retomada

- Leitura integral e análise de cobertura concluídas nesta retomada, conforme registro abaixo.
- Total de sugestões formalizadas: 1; pendentes: 0; aplicadas: 1; rejeitadas: 0. E1 ajustada aprovada explicitamente e aplicada.
- O arquivo de sugestões indicado não existia no início desta retomada. A busca em docs encontrou arquivos de outras execuções, que não foram usados como decisões desta execução.
- A SPEC possui 537.080 bytes e 3.604 linhas. As leituras iniciais da SPEC e a leitura conjunta de PRD/histórias sofreram truncamento de saída. Não considerar esses comandos prova de leitura integral.
- A pendência anterior de leitura completa da SPEC, comparação integral com PRD/histórias e orientação de arquitetura foi concluída nesta retomada; os intervalos e limites estão registrados abaixo.

## Fontes desta execução

- SPEC20261027_205916.md
- PRD20261027_205916.md
- stories-requisitos20261027_205916.md

## Escopo e autorização

- Preservar as três remoções aprovadas: cadastro manual de checks, comparação entre tentativas e prioridade numérica configurável da fila.
- Preservar validação técnica dos papéis, revisão independente, correlação com a versão, histórico, capturas imutáveis, evidências, diagnósticos operacionais, prioridade dos achados e proteções da fila.
- A autorização para retomar não aprova sugestões nem a conclusão do documento.
- Nenhuma alteração foi feita na SPEC, no PRD, nas histórias, em código, schema ou dados do produto nesta retomada.

## Próxima ação obrigatória

No próximo turno, ler este registro antes de responder. E1 ajustada já aplicada; aguardar avaliação do usuário sobre o documento. Nenhuma nova proposta ou conclusão foi aprovada automaticamente.

## Sugestões por feature

### Validação por versão e resumo da entrega — US-02

- **E1** [APLICADO] [RESUMO DE VALIDAÇÃO] Definir o significado de `checks_succeeded` e `checks_total` no percurso `agent_result`. O schema `DeliverySummaryView` ainda exige inteiros para ambos, mas a fonte atual é `verification_runs/checks`, cujo produtor é retirado. `ImplementerResult.checks[].outcome` é texto livre; não há regra aprovada de conversão para contagem de sucesso. A SPEC exige resumo compacto e proíbe inferir aprovação por zero checks, mas não resolve se esses contadores devem desaparecer ou representar ausência de medição. Sem decisão, o desenvolvedor precisa inventar a semântica ou apresentar `0 de 0` para validações efetivamente realizadas.
  Opcoes: a) Retirar os dois contadores do contrato de resumo e a linha correspondente da UI; resultados atuais e checks históricos continuam no detalhe sob demanda. b) Manter os campos, permitindo `null` no percurso novo e preservando as contagens históricas existentes; ocultar a linha quando não houver contagem estruturada, sem interpretar texto livre como aprovação.
  Sugestao: opcao b - preserva o resumo histórico com mudança mínima, distingue ausência de contagem de zero execuções e mantém as evidências atuais no detalhe existente. Não cria cadastro, executor, painel ou enum novo.
  Referências: SPEC §3.2, `DeliverySummaryView`, linha 3167; `HttpImplementerResult`, linha 3247; §3.4, linha 3399; §4.2, linha 3476; §4.6, linhas 3518 em diante. PRD Frontend, linha 349. Histórias US-02.C1/C3, linhas 48/50; preservação US-05.C3, linha 88.
  Evidência no código atual: `apps/controller/src/modules/storage/delivery-summary.ts:18–21` conta somente `verification_runs/checks` e usa zero na ausência; `:77` transporta os contadores; `apps/web/src/features/attempts/DeliverySummary.tsx:25` apresenta “Checks aprovados”. Esses arquivos não foram alterados.
  Aplicação se aprovada: ajustar apenas o schema de resumo em §3.2 e acrescentar a regra de apresentação/aceite em §4.6, conservando critérios, parecer, referência aprovada e acesso às evidências. Teste futuro: histórico mantém contagens; `agent_result` não deriva sucesso de texto nem exibe falso `0 de 0`; lista vazia não aprova a versão. Esta análise não executa testes do produto.

## Progresso de leitura nesta retomada

- SPEC: intervalo de caracteres UTF-16 [0, 267000) lido em sequência; aproximadamente 2217 linhas alcançadas. Total: 530833 caracteres.
- Blocos completos: [0,30000), [30000,60000), [60000,100000), [100000,128000), [128000,155000), [155000,183000), [183000,211000), [211000,239000), [239000,267000).
- O bloco [60000,100000) teve truncamento central; o trecho [78000,85000) foi relido integralmente, cobrindo a parte omitida.
- Checkpoint intermediário, já superado: próximo offset era 267000 (base zero, slice de string UTF-8 decodificada por Node); naquele momento não havia análise individual nem sugestão formalizada e PRD/histórias/arquitetura estavam pendentes. Vale a conclusão registrada a seguir.

### Conclusão da leitura e comparação nesta retomada

- Registro anterior de offset 267000 foi superado: SPEC integralmente lida até o EOF, 530833 caracteres UTF-16 e 3604 linhas, incluindo dicionário SQL, todos os triggers, 69 fichas de endpoints, catálogo integral de schemas, frontend e segurança.
- Blocos adicionais da SPEC, sem truncamento: [267000,295000), [295000,323000), [323000,343000), [343000,363000), [363000,383000), [383000,403000), [403000,423000), [423000,443000), [443000,463000), [463000,483000), [483000,503000), [503000,530833).
- PRD integralmente lido em [0,25000), [25000,45000), [45000,63187), incluindo decisões finais Database, Backend, Frontend e Security; 389 linhas.
- Histórias integralmente lidas em um bloco de 26109 caracteres, 199 linhas, sem truncamento.
- Orientação de arquitetura: CLAUDE.md integral; CodeGraph consultado antes da busca de código, com contratos e trecho atual de pipeline/start. A segunda resposta do grafo limitou sua fonte: não foi tratada como leitura integral dos arquivos omitidos. Leituras diretas adicionais de storage/delivery-summary.ts e DeliverySummary.tsx confirmaram a fonte e a UI dos contadores. Consultados os trechos pertinentes de SPEC raiz, INTEGRACAO-MAESTRI-OMP e GLOSSARY sobre evidência, correção, versão, sessão e reinício.
- Nenhuma edição na SPEC, PRD, histórias, código, banco ou configuração. Somente este registro foi atualizado. Nenhum teste, build, browser, integração real ou efeito externo executado.

## Cobertura por feature após leitura integral

| Feature | Cobertura confirmada e conclusão |
| --- | --- |
| US-01 — configuração sem cadastro manual | Happy path, configuração antiga, novas escritas/capturas, rejeição direta/aninhada sem efeitos, rascunhos/conflitos, loading, campos preservados e ausência no DOM/foco definidos em §1, §2.1, §3.2 e §4.2–4.6. Nenhuma lacuna adicional confirmada. |
| US-02 — validação por versão | Produção estruturada, correção, revisão de lacunas/falhas, gates separados, vínculos/imutabilidade, independência, repetição e três estados de evidência definidos em §2.1/2.3, §3.2/3.4 e §4.6. E1 limita-se à semântica dos contadores do resumo. |
| US-03 — consulta sem comparação | Retirada de UI/rota/contratos exclusivos, 404, filtros/datas/fuso/cursor, busca vazia/erro, navegação, respostas tardias, detalhe histórico e Nova tentativa definidos em §3.2 e §4.1–4.6. Nenhuma lacuna adicional confirmada. |
| US-04 — fila sem prioridade numérica | Ordem por projeto, opção de posição, condição sobre todos os itens, fallback, empate, prioridade antiga sem efeito, hash, elegibilidade, pausas, leitura incompleta, replay e apresentação definidos em §3.2 e §4.2/4.6. Nenhuma lacuna adicional confirmada. |
| US-05 — continuidade e histórico | Migration incremental/rollback/runtime, FKs/triggers, capturas imutáveis, artefatos por check_id, leituras e inventário de exclusão definidos em §2 e nos aceites. Reinício preserva as proteções existentes; não se propôs retomada automática nova. Nenhuma lacuna adicional confirmada. |

Revisados transversalmente: tokens/hierarquia existentes, loading/vazio/erro e skeleton herdado, limites HTTP/textos/artefatos/timeouts/rate limits/paginação, sessão/escopo/permissões, copy operacional e teclado/tela estreita/baixa/zoom. As três remoções não justificam criar uploads, papéis de autenticação, novos breakpoints, redesign ou catálogo de copy para superfícies preservadas. Não foram convertidas essas não aplicabilidades em sugestões.

## Decisão e aplicação de E1 ajustada — 27/10/2026

- Decisão explícita: “o banco pode ser limpo, não preciso manter compatibilidade com código legado”. A opção aprovada substitui a recomendação original; não há campos nullable nem preservação de contagens/checks legados.
- Aplicado somente na SPEC: retirada dos dois contadores do schema DeliverySummaryView; regra de UI e aceite; premissa de instalação limpa; substituição das obrigações de compatibilidade das três remoções e do delta de reviews destinado ao legado por vínculos obrigatórios com resultados atuais. Catálogo da base e transcrições anteriores ficam expressamente subordinados à decisão, sem impor retenção dos mecanismos retirados.
- Preservados: resultados/evidências de validação dos agentes, histórico produzido no comportamento atual, capturas e resultados imutáveis, revisão independente, correlação de versão, diagnósticos, prioridade de achados e proteções da fila.
- Conflitos documentais conhecidos: PRD §§Database/Backend e US-05/RF-29/30/RNF-01/08; stories US-05/RF-29/30/RNF-01/08 exigiam conservação do legado e migration incremental. A decisão posterior prevalece explicitamente na SPEC; PRD/stories não foram reescritos. Referências normativas da raiz ainda precisam ser adequadas no escopo competente conforme a própria SPEC; não são autorização de edição fora destes documentos.
- Somente SPEC e este registro alterados. Nenhuma limpeza de banco, edição de código/schema executável, teste do produto ou efeito externo. O texto anterior deste registro conserva a análise e a proposta originais como histórico, superadas por esta decisão.
