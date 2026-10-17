# Preparação first-slice-20261017-01

Data: 2026-10-17. Produto declarado: `nova-fabrica-software` 0.1.0. **Execução real não iniciada; fatia sem aceite integrado.** O [manifesto](manifest.json) registra cada cenário como pendente, com versões desconhecidas nulas. Resultados anteriores do progresso não foram reutilizados como observações desta prova.

## Observações atuais e bloqueios

| ID | Evidência direta / limite | Consequência |
| --- | --- | --- |
| PF-01 | Runtime disponibiliza Node **24.22.0**, Windows. Consulta local projetou somente versão/plataforma e um booleano de presença de contexto Maestri. | Diverge do Node 24.20.0 histórico; versões devem ser observadas novamente no host da prova. |
| PF-02 | `MAESTRI_PIPE` ausente neste shell; nenhum `ExecutionHost` confiável foi fornecido à execução. | Sem preflight/recruit real. Isso não diagnostica acesso Wire do LionClaw nem prova indisponibilidade global do Maestri. |
| PF-03 | Runtime proíbe elevação; AGENTS exige contexto autorizado com keyring para Git/GH. Sessão também proíbe mutações Git. | Nenhum Git/GH, clone/captura/ref real ou status/diff executado. Não usar outro contexto/login para contornar. |
| PF-04 | Não foram indicados conta/repositório/Project/issues, perfis, orçamento e efeitos autorizados. | Nenhum provider, comentário, Status, cancelamento/restart real iniciado. Solicitação de dados enviada ao usuário; silêncio não é autorização. |
| PF-05 | `apps/controller/src/main.ts` compõe os adapters a partir de `ControllerHostContext`; o entrypoint chama `startController()` sem argumentos. | `npm start` isolado não disponibiliza os contextos necessários ao percurso. O host precisa de composição confiável implementada e validada antes da prova. Não se declara lançamento de produto pronto por presença do adapter. |
| PF-06 | `storage/settings.ts` devolve `accountId` persistido; `configuration-reads.ts` apresenta ACCOUNT_UNOBSERVED. Na implementação inspecionada, `recordControllerAccount` grava apenas observação/pausa em controller_authority, e as gravações de settings não vinculam conta. Fixtures inserem accounts/account_id diretamente. | Não foi localizada superfície pública de vínculo inicial da conta observada. Cadastro→início de instalação nova está impedido até existir esse percurso real. Seed SQL de fixture não é solução de produto. Escopo do achado: composição/configuração backend; nenhuma UI alterada nesta sprint. |
| PF-07 | Código das três entregas existe em `AttemptListPanel`/`AttemptDetailDialog`, `QuestionDecisionCard`/`useDecision` e `useAttemptActions`. | IDs de plano 017/033/034 são pré-requisitos; presença de arquivo não é aceite visual. Playwright MCP/Chrome e screenshots do produto continuam pendentes. |

## Entregáveis desta preparação

- Roteiro de pré-voo, alvo/custo/efeitos, cadastro→ICR, correção, TUI/MCP/GitNexus, transporte, pergunta/recibo/incerteza, cancelamento representativo, restart/retry e UI existente.
- Verificador offline com schema fechado, hashes/tamanhos, correlação por IDs e recusa de fixtures como prova real. Não executa efeitos nem aprova a fatia.
- Cenários contratuais que atravessam serviços e SQLite reais sob Git/GitHub/runtime controlados; S1–S4 permanecem separados do aceite real e visual.

## Validação desta rodada

Node 24.22.0/Windows; dependências existentes, sem instalação. Resultados atuais, sem extrapolação para Maestri/Git reais:

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0, strict, incluindo o verificador com `@ts-check` e os novos testes. |
| `npm.cmd run lint` | Exit 0; fronteiras/convenções existentes. |
| `npm.cmd run test:acceptance` | Exit 0; 33 testes em 2 arquivos. |
| `npm.cmd test -- --reporter=dot` | Exit 0; 635 testes em 42 arquivos, incluindo scaffold presente por trabalho concorrente. Total observado, sem atribuir essa implementação à sprint da prova. |
| `npm.cmd run build` | Exit 0; controlador, recursos e web. Permanecem avisos de React/esbuild/optimizeDeps e chunk web acima de 500 kB. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência, catálogo distribuído, diagnóstico de contexto, shutdown/lock. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket loopback UTF-8/EOF, JSON/UTF-8 inválidos, oversize, fechamento/recusa após perda e Windows cwd/argv Unicode com Node como fixture. Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node passed/failed, cwd Unicode, rename/sync/checksum e canonicalização reais; Git/Maestri não executados. |
| `node scripts/first-slice-evidence.mjs docs/integration/first-slice/20261017-01/manifest.json` | Exit 2 preservado no PowerShell; `pending`, `readyForReview:false`, autorização/execução/versões/pré-requisitos e 10 cenários pendentes. |

Falhas iniciais nas asserções dos novos testes foram corrigidas: DTO de recibo, `Page.items`, mudança de settings permitida e fixture de duplicidade dentro do limite do schema. Um ajuste concorrente capturou os limites temporais em constantes para o narrowing do callback no verificador; foi preservado. Não foram falhas observadas no host real nem resultados de aceite.

Os testes integrados novos usam serviços/SQLite reais com Git/GitHub/runtime/checks controlados; a verificação sem checks configurados nessa fixture continua `not_applicable`, sem ser declarada check real. O smoke de verification executa Node real separadamente. Nenhuma dessas provas cobre agente real→captura Git real→check→revisão independente real→ICR remoto.

**Conclusão desta rodada: preparação e validação local concluídas; aceite real pendente.** PF-03–PF-06 impedem o percurso real; sprints 017/033/034 ainda precisam da inspeção visual no produto. Não há aprovação integral dos AC/INT da fatia.

## Continuidade

Resolver PF-05/PF-06 no percurso do produto; fornecer alvo/perfis/orçamento/autorização e contexto exigido; executar o roteiro em novo registro e revisar evidências. Preservar este relatório como preparação sem aceite. Não há mudança de fase, aprovação, Design Lock ou aprovação visual implícita.
