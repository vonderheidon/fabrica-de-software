# Revalidação da qualificação de junctions

Estado: **bloqueado; feat-009-c1 e feat-009-c2 não aprovados**.

Fonte normativa: SPEC20261020_114742.md §3.2, protocolo de coordenação e efeitos, itens 5–9. A ausência de prova obrigatória não libera a remoção.

Em 2026-10-20, no repositório canônico, `npm.cmd run test:deletion-native` reproduziu o resultado do Evaluator: 14 testes aprovados e três falhas por EPERM na criação de junctions, nas linhas 144, 155 e 164 de `tests/native/project-deletion.proof.ts`. As falhas antecedem a chamada à primitiva de remoção. Permanecem sem prova os casos de junction no descendente, no alvo e em ancestral de alvo ausente.

Um diagnóstico mínimo criou diretórios exclusivos sob `.cache` e tentou `fs.symlinkSync` com tipo `junction`, usando destino absoluto, relativo e com namespace Windows estendido. As três variantes retornaram EPERM. Os diretórios do diagnóstico foram removidos após conferir a contenção no workspace. Não foi identificada uma correção de formato de caminho que libere a criação da fixture neste contexto. A causa específica da negativa de acesso não foi determinada; não se atribui a falha à primitiva de exclusão.

Validações executadas:

- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado, com aviso de bundle web acima de 500 kB.
- `npm.cmd test -- apps/controller/src/modules/workspaces --reporter=dot`: 131 testes aprovados em dez arquivos.
- `npm.cmd run test:http -- --reporter=dot`: quatro testes aprovados em dois arquivos.
- `npm.cmd run test:deletion-native`: 14 aprovados, três falhas; exit 1.
- `npm.cmd test -- --reporter=dot`: 1.404 aprovados e cinco falhas em três arquivos; exit 1. Uma falha em `tests/diagnostic-receipt-rendering.test.ts` espera ID/revisão/cursor no HTML; três em `tests/github-diagnostics-rendering.test.ts` esperam suporte técnico/códigos no HTML; uma em `apps/web/src/api/configuration-save.test.ts` espera a expressão “dados originais”, divergente da mensagem atual. São superfícies sem alteração nesta rodada; não foi estabelecida sua origem histórica e não foram corrigidas dentro do escopo de qualificação de junctions.

As provas de symlinks e substituições adjacentes aos efeitos passaram. Não houve mudança em código de produção, ACLs, credenciais, privilégios ou capacidade anunciada. Nenhum teste foi ignorado ou substituído por mock. A sessão não permite execução elevada. A capacidade permanece indisponível conforme `windowsReferenceDeletionCandidate()`.

Próximo passo necessário: executar a suíte nativa num contexto Windows autorizado que permita criar junctions reais nestas fixtures e avaliar os três resultados antes de qualquer liberação. Este registro documenta a execução e o impedimento; não conclui a capacidade, não aprova a sprint e não autoriza exclusão operacional.
