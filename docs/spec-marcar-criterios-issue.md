# SPEC: marcar critérios aprovados no corpo da issue

Status: implementado (2026-11-14), sem commit. Schema v58 (migration 057).

## Problema

O Revisor registra um veredito por critério (`criterion_results`), mas a fábrica só publica esse resultado no comentário de entrega. Os checkboxes `- [ ]` da seção de critérios no corpo da issue nunca mudam, porque o único caminho de escrita no GitHub é `addComment`, `updateProjectV2ItemFieldValue` e criação de PR (`apps/controller/src/modules/github/effects.ts`). Não é regressão: a proibição de `updateIssue` existe desde `c7c3f22`.

## Decisões aprovadas

- D1. Marcar somente na entrega aprovada, em todos os modos (ICR, commit, PR). Rodadas intermediárias do Revisor não tocam a issue.
- D2. Marcar somente critérios com veredito `passed`. `failed` e `not_verified` permanecem como estão.
- D3. Nunca desmarcar. A fábrica só troca `[ ]` por `[x]`; um `[x]` existente nunca é alterado.
- D4. Critério cujo texto ou ID atual difere da captura não é marcado; o comentário de entrega lista esses critérios como não marcados.

## Decisões técnicas (conduzidas, sem mudança de comportamento além do pedido)

- T1. Só trocar checkboxes já existentes. Item de critério sem `[ ]` não ganha checkbox (não reescrevemos a formatação do usuário).
- T2. A edição do corpo não bloqueia a entrega. `failed_known` fica registrado e a entrega finaliza; `unknown` segue a reconciliação normal antes de qualquer novo efeito, como os demais efeitos.
- T3. Ordem: comentário de entrega, depois edição do corpo, depois status `delivered` no Project. O plano de marcação (quais IDs marcar e quais pular) é calculado antes do comentário, para que o comentário cite os pulados.
- T4. `revalidateScope` não precisa mudar: o digest de critérios ignora o estado do checkbox (`criteria.test.ts`, teste "ignoring free comments and checkbox state").

## Desenho

### 1. Localizar checkboxes (`apps/controller/src/modules/pipeline/criteria.ts`)

Nova função pura `locateCriteriaCheckboxes(body)` que percorre o corpo com as mesmas regras de `interpretIssue` (fences, comentários HTML, cabeçalhos, seção de critérios, IDs explícitos e gerados) e devolve, por critério, `{ id, text, line, checkbox: 'open' | 'checked' | null }`. Extrair o laço comum para não duplicar o parser; `interpretIssue` passa a consumir o mesmo resultado.

Nova função pura `markCriteria(body, ids)` que devolve `{ body, marked, alreadyChecked, missing }`, alterando apenas o `[ ]` da linha inicial de cada item, preservando quebras de linha (`\r\n` ou `\n`) e todo o resto do texto byte a byte.

### 2. Novo efeito `issue_body` (contratos, storage e schema)

- `packages/contracts/src/publication.ts` e `http-execution/publication.ts`: incluir `'issue_body'` no kind de `EffectView`; em `EffectIdentity` adicionar `criterionIds` (lista ordenada dos IDs a marcar) e reaproveitar `issueId`, `repositoryId`, `contentIdentity`.
- Migration `057_issue_body_effect.sql` + `resources/storage/initial-schema.v58.sql`: incluir `issue_body` nos dois `CHECK` de `kind` da tabela de efeitos (linhas 447 e 461 do v57), seguindo o padrão de reconstrução de tabela das migrations anteriores. Atualizar `migrations.ts:153` e `local-installation.test.ts:170` para v58.
- Revisar os demais pontos que enumeram kinds (`storage/effects.ts`, `storage/publication.ts`, `storage/delivery-summary.ts`, `projects/preparations.ts`, fixtures de exclusão de projeto) para aceitar o novo kind sem mudar textos de tela.

### 3. Escrita no GitHub (`apps/controller/src/modules/github/effects.ts`)

- Nova mutação `updateIssue(input:{ id, body, clientMutationId })` retornando `issue { id body repository { id } }`.
- Aceitar `issue_body` no filtro de kinds. Antes de enviar: ler o corpo atual da issue, aplicar `markCriteria` e enviar o resultado. Se `marked` vier vazio (tudo já marcado), retornar `confirmed` sem mutação.
- Resposta da mutação nunca confirma sozinha: devolver `unknown` com `ISSUE_BODY_READBACK_REQUIRED`, como faz o status.
- Ajustar `effects.test.ts:71`: o comentário e o status continuam sem `updateIssue`; o novo teste cobre o efeito `issue_body`.

### 4. Publicação (`apps/controller/src/modules/publication/index.ts`)

- `commentBody`: antes da lista "Critérios verificados", calcular o plano a partir de uma leitura completa da issue. Critérios `passed` com ID e texto iguais à captura entram em `criterionIds`; os demais `passed` aparecem numa linha "Não marcados na issue (critério alterado desde a captura): ac-N, ...". O plano faz parte do corpo do comentário, então entra no `bodyHash` e fica estável nas retomadas.
- Após o comentário confirmado (linha 463, modo local) e no ponto equivalente de `completeRemote` (modo PR): `send(id, 'issue_body', deliveryId, identity, operationId)`. Resultado diferente de `confirmed` não chama `blocked`; apenas registra (T2).
- `reconcileEffect` para `issue_body`: ler a issue; confirmar quando todo ID de `criterionIds` estiver como `checked` no corpo atual (a edição humana concorrente em outras partes do texto não impede a confirmação). Caso contrário (algum continua `open`, sumiu ou mudou), encerrar como `not_applicable` com `CRITERIA_NOT_MARKED`, sem reenviar. Motivo: o schema só permite `unknown` → `confirmed`/`not_applicable`, e manter `unknown` travaria o status `delivered`. Se a leitura falhar, o efeito fica `unknown` e segue a reconciliação normal, como o comentário.
- Limitação aceita: se o registro do plano falhar antes do comentário, nenhum critério é marcado nessa entrega e o comentário lista todos os aprovados como não marcados; as retomadas mantêm esse plano para não alterar o comentário.
- Modo PR: não há comentário de entrega, então os critérios pulados não são listados; a marcação ocorre normalmente.

### 5. Corrida com edição humana

`updateIssue` sobrescreve o corpo inteiro e não tem condição de versão. Mitigação: ler, transformar e enviar dentro do mesmo `authorize`/`beforeSend`, minimizando a janela, e confirmar por readback (passo 4). Uma edição humana feita exatamente nessa janela pode ser sobrescrita; o risco é aceito e documentado, porque a janela é de uma única requisição.

## Critérios de aceite

- AC-1: entrega aprovada com critérios `passed` deixa `[x]` exatamente nesses itens; o restante do corpo fica byte a byte igual.
- AC-2: critérios `failed` e `not_verified` não são alterados; um `[x]` marcado por uma pessoa nunca vira `[ ]`.
- AC-3: critério com texto alterado após a captura não é marcado e aparece no comentário de entrega como não marcado.
- AC-4: rodadas de revisão sem entrega não alteram a issue.
- AC-5: falha conhecida ao editar o corpo não impede a finalização da entrega; resultado incerto é reconciliado por leitura e não gera edição duplicada.
- AC-6: retomada após reinício com o efeito `running` ou `unknown` reconcilia sem reenviar quando os checkboxes já estão marcados.
- AC-7: marcar `[x]` não dispara a pergunta de mudança de escopo de `revalidateScope`.
- AC-8: fences, comentários HTML, listas fora da seção de critérios e itens sem checkbox não são alterados.
- AC-9: os três modos (ICR, commit, PR) marcam os critérios.
- AC-10: a migration aplica sobre banco v57 existente preservando os efeitos já gravados.

## Testes

- Unitários: `criteria.test.ts` para `locateCriteriaCheckboxes`/`markCriteria` (CRLF, IDs explícitos e gerados, fences, comentários, continuação de item, já marcado, sem checkbox).
- `effects.test.ts`: mutação `updateIssue` só para `issue_body`, com `clientMutationId`, sem confirmação pela resposta.
- Integração: `publication.test.ts`, `local-publication.test.ts`, `pr-publication.test.ts` para AC-1 a AC-6 e AC-9; `recovery.test.ts` para AC-6; teste de migration para AC-10.

## Fora de escopo

Fechar a issue, editar outras seções do corpo, marcar critérios durante as rodadas, mudanças de interface.
