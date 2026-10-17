# Revalidação first-slice-20261017-02

Data: 2026-10-17. Produto 0.1.0; Node 24.22.0/Windows observados nesta rodada. **Prova real não iniciada; aceite integrado pendente.** A [preparação anterior](../20261017-01/report.md) permanece intacta. O [manifesto atual](manifest.json) mantém os dez cenários e os pré-requisitos visuais pendentes.

## Correções e evidência atual

O verificador `scripts/first-slice-evidence.mjs` agora diferencia evidência inválida de prova ainda não executada. Anexo ilegível/corrompido, IDs/paths duplicados e cronologia contraditória produzem `invalid`/exit 1. Autorização sem execução continua `pending`/exit 2. A identificação do produto e o anexo de autorização precisam anteceder os efeitos; capturas por tentativa precisam pertencer à janela da prova. Cenários com nomes herdados de Object, como `toString`, são recusados. O gate continua documental e não autentica relatos nem autoriza efeitos.

[local-validation.json](local-validation.json) registra os comandos e diagnósticos sanitizados desta execução. [product-inventory.json](product-inventory.json) identifica por paths relativos, tamanho e SHA-256 os arquivos selecionados de produção/configuração/recursos, scripts e distribuição construída. O digest agregado usa a lista ordenada desses metadados; não é SHA de commit Git, captura oficial de tentativa nem prova de que esse build foi executado pelo Maestri. Não contém bytes dos arquivos, índices, bancos, caches, ambiente ou credenciais. O inventário registra seus limites de seleção e deve ser recriado antes de uma execução real se qualquer arquivo selecionado mudar.

## Validação técnica desta rodada

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; TypeScript strict, incluindo o verificador. |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções existentes. |
| `npm.cmd run test:acceptance` | Exit 0; **40 testes em 2 arquivos**, sete regressões adicionais. |
| `npm.cmd test -- --reporter=dot` | Exit 0; **642 testes em 42 arquivos**. Providers/rede/subprocessos reais continuam bloqueados na suíte padrão. |
| `npm.cmd run build` | Exit 0; controlador, recursos e web. Vite informou as depreciações existentes de React/esbuild e optimizeDeps; bundle web de 610,26 kB minificado. |
| `npm.cmd run test:compiled` | Exit 0; HTTP/SSE/SQLite/settings/CAS/idempotência, catálogo distribuído, diagnóstico de contexto, shutdown e lock de processos próprios. |
| `npm.cmd run test:execution-compiled` | Exit 0; socket real, português/emoji, JSON/UTF-8 inválidos, oversize e EOF; cwd/argv Windows com Node como fixture. Maestri/OMP não executados. |
| `npm.cmd run test:verification-compiled` | Exit 0; checks Node passed/failed, rename/sync/checksum e canonicalização reais. Git/Maestri não executados. |
| Verificador direto dos manifestos 01 e 02 | Ambos `pending`, `readyForReview:false`, exit **2**, preservado com `exit $LASTEXITCODE` após `node scripts/first-slice-evidence.mjs <manifest.json>`. Os anexos da rodada 02 passaram na conferência de tamanho/hash. |

O wrapper PowerShell retornou exit 1 nas invocações via `npm.cmd run acceptance:check`, embora o JSON já informasse `pending`. A chamada direta acima confirmou o código nativo 2. Essa pendência é esperada e não é falha de typecheck, lint, testes ou build.

As novas regressões cobrem autorização/build registrados após o início, captura antiga ou posterior, fim sem início, nome de cenário herdado, autorização aguardando execução e códigos de saída por integridade/falha/pendência. Evidência controlada e smokes locais permanecem separados de aceite integrado.

## Bloqueios atuais e escopo

| ID | Conferência nesta rodada | Escopo / consequência |
| --- | --- | --- |
| PF-02 | A consulta projetou somente `maestriContextPresent:false`; nenhum contexto confiável de execução foi fornecido. | Sem preflight/recruit real. Não foi validado acesso Wire; a ausência no shell não determina sua disponibilidade. |
| PF-03 | Runtime não permite elevação; AGENTS exige contexto autorizado/keyring. O usuário proíbe mutações Git, inclusive commits técnicos. | Nenhum Git/GH executado. Clone, retenção e refs reais não podem ser exercitados neste contexto; não houve login ou alteração de credenciais/ACL. |
| PF-04 | Sem alvo GitHub, perfis, orçamento e efeitos delimitados na solicitação. Foi solicitada informação ao usuário nesta rodada. | Nenhum provider, comentário, Status ou cancelamento/restart de controlador real. Silêncio não concede autorização. |
| PF-05 | `apps/controller/src/main.ts` ainda chama `startController()` sem argumentos no entrypoint; os adapters dependem de `ControllerHostContext`. | Bloqueio de composição backend para o percurso real. Não foi criado launcher alternativo nem alterada autoridade por variável HTTP/ambiente. |
| PF-06 | `storage/publication.ts` grava observação/pausa em `controller_authority`; `configuration-writes.ts` usa o accountId já configurado, sem vínculo inicial de conta observada. | Não foi localizada superfície de produto para instalar esse vínculo. O percurso de instalação nova continua pendente; seed SQL de fixture não comprova nem resolve esse bloqueio. Correção pertence à configuração/composição backend. |
| PF-07 | GitNexus `list_repos` não lista este repositório; não existe clone real da prova. As sprints 017/033/034 não receberam inspeção visual nesta rodada. | Catálogo não comprova chamada MCP útil no runtime do clone. TUI/MCP/GitNexus e Playwright MCP/Chrome com conteúdo/screenshots continuam pendentes. Nenhuma UI foi alterada. |

A rodada entrega correções do verificador e evidência local atual. Não comprova cadastro→ICR, revisão independente no host, resposta real na mesma passagem, parada física de filhos ou restart/retry reais. Os testes não resolvem PF-05/PF-06 e não encerram os AC/INT correspondentes. A execução futura deve usar outro registro e preservar este resultado. Não houve dependência nova, commit/push, aprovação, Design Lock ou mudança de fase.
