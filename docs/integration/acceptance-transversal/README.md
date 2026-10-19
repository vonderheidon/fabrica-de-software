# Aceite transversal e revisão da versão entregue

Preparação atual da Etapa B: [roteiro S34](../acceptance-b/20261018-01/runbook-transversal-ui.md), [revisão imutável US-24](../acceptance-b/20261018-01/runbook-immutable-review.md) e [registro de resultados separados](../acceptance-b/20261018-01/record.md). As avaliações anteriores abaixo permanecem históricas.

Data da avaliação: 2026-10-17. Fonte normativa: `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md`, `GLOSSARY.md`, `docs/Docs20261016_073031/SPEC20261016_073031.md`, `docs/Docs20261016_073031/stories-requisitos20261016_073031.md` e o artefato obrigatório `docs/Docs20261016_073031/design/artifact.html`.

Esta avaliação separa implementação, prova local e aceite externo. `COMPROVADO LOCALMENTE` significa que a superfície indicada teve prova técnica local nesta rodada; não transfere essa prova para Git/GitHub, Maestri/OMP, navegador ou host real. `PARCIAL` significa código e/ou testes locais cobrem parte do requisito, mas há prova obrigatória ausente. `PENDENTE` significa que a prova prescrita não foi executada ou a versão não tem referência imutável independente. `FALHOU` é reservado a falha observada; uma execução bloqueada não é falha do produto.

## Resultado desta rodada

| Superfície | Resultado observado | Estado de aceite |
| --- | --- | --- |
| TypeScript strict | `npm.cmd run typecheck`, exit 0 | Comprovado localmente |
| Fronteiras e convenções | `npm.cmd run lint`, exit 0 | Comprovado localmente |
| Suíte configurada | `npm.cmd test -- --reporter=dot --no-color`, 58 arquivos e 872 testes, exit 0 | Comprovado localmente; adapters externos controlados |
| Build configurado | `npm.cmd run build`, exit 0; bundle React/Vite emitido | Comprovado localmente |
| Git imutável da versão avaliada | Contexto elevado/keyring exigido por `AGENTS.md` não está disponível; nenhuma referência Git foi consultada nesta rodada | Pendente |
| Revisão independente da referência entregue | Sem referência imutável identificada; resultados históricos preservados | Pendente |
| Navegador de teste Playwright MCP/Chrome | A chamada `browser_tabs(list)` foi recusada: `MCP tool call requires approval, but approval policy is never`. Inventário CUA desta sessão retornou `browsers: []` | Pendente; ferramenta prescrita bloqueada |
| Git/GitHub/Maestri/OMP reais | Sem autorização/alvo/contexto exigidos; nenhuma mutação ou recrutamento foi executado | Pendente conforme critérios INT/AC |

Não foi iniciada uma aplicação de produção sem composição confiável do host e vínculo inicial da conta. Não foram criadas fixtures de navegador apresentadas como prova visual, nem usados screenshots históricos. A única ocorrência de `#login` no código cliente normaliza a rota antiga para Principal por C-02; não há interface de Login/Sair renderizada no bundle da aplicação.

## Artefatos

- [Matriz de cobertura](coverage-matrix.md) relaciona as famílias US/RF/RNF e cada AC/INT ao código e às provas existentes, com limites explícitos.
- [Aceite visual](visual-evidence.md) registra as tentativas, a recusa automática e o que continua sem medição.
- [Revisão independente](independent-review.md) registra a ausência da referência Git desta versão e preserva a fronteira de revisão.

Resultados anteriores de validação e aceite não foram substituídos. Esta rodada não declara produto integralmente aceito, não simula Design Lock/aprovação e não muda a fase do pipeline.

## Retomada após o feedback do evaluator — 2026-10-17

Validação técnica reexecutada no workspace atual: `npm.cmd run typecheck` passou; `npm.cmd run lint` passou; `npm.cmd test -- --reporter=dot --no-color` passou com 58 arquivos e 872 testes; `npm.cmd run build` passou. O build ainda reporta opções Vite depreciadas e bundle JavaScript de 721,46 kB. `git diff --check` passou para os arquivos versionados modificados.

O Playwright MCP continua bloqueado pelo gate automático (`MCP tool call requires approval, but approval policy is never`), portanto screenshots, jornadas, medições de acessibilidade e inspeção de sobreposição/corte permanecem pendentes. O workspace contém alterações locais e não há referência Git imutável correspondente; as restrições vigentes impedem criar uma referência nova. Logo, browser/aceite visual e revisão independente da versão correspondente continuam pendentes, sem declarar aceite integral. O detalhe da tentativa está em `visual-evidence.md`; a limitação da referência está em `independent-review.md`.
