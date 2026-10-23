# Revalidação documental dos ajustes E1-a e E2-a

Data: 23/10/2026. Resultado: **ajustes documentais aplicados e verificações documentais aprovadas**. Não constitui aprovação da SPEC completa ou do checkpoint, implementação ou prova funcional.

## Autorização e versão

A instrução de retomada registra o ok explícito do usuário para E1-a e E2-a, limitado aos ajustes documentais. O arquivo persistente foi lido antes de editar; os dois itens foram marcados APROVADO e, após aplicação individual, APLICADO. Não houve nova decisão de produto além das opções aprovadas.

- SPEC antes: `d4f74246a070f926e94cb9160cdd2765c237e3f2d46074bfcbf277e12f81611b`.
- SPEC depois: `8ccb667647525d0666673dcf1620d39ad9f4cb25701c4c6bf684f632efbc6f91`.
- [Metadados e verificações individuais](enrich-revalidation20261023_014848-metadata.json).
- [Registro de sugestões e aplicações](enrich-suggestions20261023_014848.md).

## Aplicações e rastreabilidade

| Item | Contratos, persistência e UI | Critérios correlatos |
| --- | --- | --- |
| E1-a | RF-81, V05, ShutdownCommand/ShutdownView (linhas 3110–3111), complemento E1-a da seção 3.2 (linha 3258), regra de domínio 14, ShutdownDialog (linha 3426), useShutdown, estados e checklist de segurança. | Aceite adicional US-20 (linha 3267): pausa/retomada/reinício, automação desligada, revisão/idempotência, corrida nas duas ordens e ausência de fechamento tardio/efeitos em tentativas. |
| E2-a | RF-23, preparation_revisions (linha 924), E21–E23/V01, PublicationTargetIntent/CapturedPublicationTarget (linhas 3046–3047), PreparationChoices/PreparationChanges (linhas 3048/3163), Preparation/HttpAttemptDetail, SetPublicationTarget (linha 3106), PublicationTargetSelection e complemento E2-a (linha 3269). PreparationDialog (linha 3415), DeliveryTargetFields/usePreparation, estados e checklist. | Aceite adicional US-05/06 (linha 3280): escolha persistida, hash/captura, leitura/salvamento sem clone, autorização posterior exata, identidades reais, resposta perdida/reconciliação, modos/legado preservados. |

Referências de linha pertencem à SPEC com o hash final acima; os títulos e nomes dos contratos são as âncoras estáveis.

E1-a define resume_starts com autorização explícita e revisão, mantendo automation_enabled=false. A geração/instância durável e a barreira final serializam retomada, fechamento e aceitação de trabalho dependente. Retomada aceita invalida trabalhadores/callbacks antigos; fechamento já comprometido recusa retomada antes de aceitação. Reinício preserva a pausa ou sua retirada aceita, mas não repete fechamento da instância anterior. Recibo histórico não é projetado como estado corrente nem sobrescrito para simular fechamento.

E2-a define intenção versionada sem autoridade ao salvar/ler. Ela entra na revisão/resumo/hash e na captura imutável; a operação posterior conserva FKs de tentativa/entrega reais. A referência à autorização de início só vale quando o resumo descreveu exatamente o clone do destino; origem/hash/escopo são reconferidos. Não há segundo clique redundante nesse caso, ampliação de modo, clone por GET/salvar, caminho alternativo no pedido de início ou migração silenciosa de capturas antigas.

## Verificações executadas

Foram aprovadas **961 verificações documentais/de schema**, registradas individualmente nos metadados:

- Catálogo JSON legível, 242 definições compiladas com AJV draft 2020-12 instalado e 625 referências locais resolvidas.
- ShutdownCommand aceita as três ações fechadas e recusa ação desconhecida, autorização falsa e ativação de automação por propriedade extra. ShutdownView representa retomada e fechamento comprometido e recusa geração inválida.
- Intenções de clone existente/novo, formato e campos fechados; gravação/alteração/limpeza e omissão compatível da preparação; captura com nulabilidade coerente de intenção/hash; V01 direto/derivado com par origem/hash e entrega obrigatória.
- Encadeamento das respostas de preparação, projeção de intenção no detalhe e manutenção do contrato de início pelo resumo/hash, sem caminho alternativo no pedido.
- Rechecados os três conflitos documentais anteriores: sete tipos de seleção nos três estados; plano V3 íntegro na escrita/leitura, planos históricos legíveis e recusados na nova criação; mapeamento histórico legível e recusado na escrita V3, Backlog null recusado.
- Mantidos os conjuntos de 23 IDs US, 88 RF e 18 RNF. Critérios originais não foram removidos/renumerados; os aceites E1/E2 são complementos explícitos.
- PRD, histórias e relatórios anteriores conferidos pelos hashes conhecidos, sem alteração. Os arquivos anteriores não foram sobrescritos para declarar validação da nova versão.
- Conferidos documentalmente os vínculos entre contrato HTTP, persistência, autorização, UI e cenários futuros, incluindo retomada após reinício e preservação do legado.

As 961 verificações incluem resolução de referências e compilação; **não são 961 testes funcionais do produto**. A validação de formatos do AJV permaneceu desabilitada, como na revisão documental anterior; datas/fuso não foram testados neste procedimento. Hash calculado da intenção, caminho absoluto/repositório, autorização de origem, CAS/geração/instância e interleavings dependem das guardas semânticas especificadas e de testes futuros de serviços/runtime. Compilar schemas não comprova essas garantias operacionais.

## Preservação e limites

Os hashes originais de PRD/histórias e dos relatórios `spec-validation20261023_014848.md` e `validation-report.md` coincidem com os valores anteriores nos metadados. A revisão 2 e seus anexos foram preservados. Seu resultado anterior descreve sua própria versão; este documento registra separadamente a versão enriquecida e o alcance da nova conferência.

Nenhum código de produto, migration, configuração operacional, provider ou recurso Git/GitHub foi alterado/executado. Somente a SPEC, o registro de sugestões e os novos artefatos desta revalidação documental foram gravados.

E1 e E2 não têm pendências documentais identificadas após esta conferência. Permanecem os limites já conhecidos: compatibilização do contrato anterior de sessão antes da implementação pertinente, aprovação da SPEC/checkpoint pelo usuário e comprovações futuras de UI, integrações reais e comportamento concorrente. Não foi inferida aprovação completa a partir do ok dos dois ajustes.
