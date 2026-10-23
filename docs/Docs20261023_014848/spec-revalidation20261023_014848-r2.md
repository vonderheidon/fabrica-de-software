# Revalidação documental — revisão 2

Data UTC: 2026-10-23T10:35:28.193Z. Resultado: [PASS](validation-report.md). Antecedente: [FAIL de três conflitos](spec-validation20261023_014848.md), preservado byte a byte (SHA-256 abaixo).

## Fontes e escopo

Conferência de cobertura do discovery, PRD e stories; contratos backend/frontend; schema/persistência, migração, isolamento, índices, seed e leitura histórica. Fontes aprovadas de produto/aceite permanecem PRD e stories. O discovery foi consultado como checklist nesta revisão; a frase da abertura da SPEC descreve a geração original. Nenhuma decisão normativa aprovada foi alterada.

A SPEC mantém aplicação web local na porta 4310, stack existente, percurso integrado Maestri/OMP, três modos de entrega, sessões por papel/tentativa, revisão independente, decisões humanas, organização/exclusão, histórico e operação. As matrizes ligam os 23 fluxos a API, UI, dados e prova. Não há monetização, upload multipart, webhook ou login humano decidido para este pacote; não foram inventadas essas superfícies.

## Resolução dos conflitos anteriores

| Conflito | Correção e referência estável na SPEC | Resultado |
| --- | --- | --- |
| E35, seleção nativa | NativeSelectionKind compartilhado por request e pelas três variantes do result; seção 3.2, compatibilidade de leitura e escrita; seção 4.3/useNativeSelection | Sete kinds × três estados aceitos; kind desconhecido recusado. Cancelled/unavailable continuam sem caminho. |
| E54–E56, plano incompleto na leitura | HttpScaffoldPlanV3 compartilhado na escrita/planejamento e incluído em HttpScaffoldPlan de leitura; LegacyHttpScaffoldPlan preserva contrato histórico; HttpProjectCreation/HttpCreationView e useProjects documentados | board_name obrigatório no V3, integral na leitura; legado sem board_name legível nos três modos, recusado em nova escrita. Sem preencher nome nem alterar hash histórico. |
| E22/E36, quatro opções históricas | ProjectMapping estrito na escrita de ProjectChanges; ReadProjectMapping na leitura de ProjectRevision/ProjectConfiguration/EffectiveConfiguration; seção 2.1 e plano de migração permanecem normativos | Quatro/cinco opções legíveis; escrita recusa quatro, backlog vazio/null. Nova revisão V3 exige cinco IDs distintos e observação de nomes/ordem/vínculo. |

## Validação completa das três dimensões

- Completude: 88 RF, 18 RNF e 23 US encontrados nas matrizes da SPEC para PRD e stories; os textos dos 88 critérios numerados das stories estão integralmente presentes. Conferidos stack/plataforma, ferramentas/seleção, criação/retomada, cadastro incompleto, entregas/continuação, perfis/sessões, revisão/progresso/contestação, storage/exclusão, resumos/tempos/notificações/encerramento/busca/comparação/conexão e limites de segurança.
- Backend/frontend: 68 fichas E01–E60/V01–V08 identificam consumidor e contratos; hooks da seção 4.3, bootstrap/proteção da 4.4, estados/erros/paginação da 4.6 e SSE/reconexão conferidos. Nomes HTTP permanecem snake_case até conversão explícita.
- Database/backend: 59 tabelas têm consulta/consumidor descritos no dicionário; passage_events é consultada por GET attempts/:id?section=passages (seção 2.1), embora a ficha E07 agrupe detalhes sob demanda. FKs/escopos, imutabilidade, migração, ausência de RLS nativa, índices e seed foram confrontados com os percursos. Ausência de Backlog histórico não é corrigida por backfill.
- Schemas: 239 definições compiladas com AJV draft 2020-12 instalado; 614 referências resolvidas. Total de 904 verificações automáticas aprovadas, incluindo referências/compilação/cobertura e casos positivos/negativos dos contratos corrigidos. Contagens não equivalem a 904 testes funcionais do produto. Validação de formatos foi desabilitada nessa compilação; semânticas de datas/fuso, cinco IDs distintos e conferência do Kanban foram revisadas documentalmente, sem alegação de teste runtime.

## Pontos fortes e ressalvas

A rastreabilidade por critério e a separação entre intenção, autorização, observação e recibo sustentam os fluxos de recuperação. O FAIL anterior era específico e verificável; os três achados foram corrigidos sem eliminar as garantias históricas. PASS indica ausência de problemas documentais verificáveis nesta revisão; não aprova a SPEC, Design Lock ou implementação. Permanecem as ressalvas já registradas: compatibilizar o contrato de sessão anterior antes de implementar o fluxo; comprovar Kanban/notificações no host, desempenho por medição e integrações reais separadamente. Nenhum código de produto, migration, provider ou efeito externo foi executado.

## Rastreabilidade

[Metadados e verificações individuais](spec-revalidation20261023_014848-r2-metadata.json). [Matriz extraída de critérios, rotas e tabelas](spec-revalidation20261023_014848-r2-traceability.json).

- SPEC anterior: b1acd89776fd795d81b758b245ac0e5ba5f8f3b414af27a2a01ee8af2b53ebd7
- SPEC corrigida: d4f74246a070f926e94cb9160cdd2765c237e3f2d46074bfcbf277e12f81611b
- FAIL preservado: e255fce709d9d9deb735d51915bab2da79f955fc047c0a55cc90ad02767d0394

- SPEC20261023_014848.md: d4f74246a070f926e94cb9160cdd2765c237e3f2d46074bfcbf277e12f81611b
- PRD20261023_014848.md: 0d5542d974ef8b3c4f8669672f9b1dd045490157f87309ce14581574e156abbd
- stories-requisitos20261023_014848.md: f05c3e126156c8fe6e00f38ae5ec14af9c71a16ac5d534db621d46f7b72d562e
- discovery20261023_014848.md: 70844561bfc54ab3e2fb2acabd98659fd400ed793b88d4f957c9bf5074d82445
