# Revalidação após nova rejeição do Evaluator — 20261017-04

**Solicitação incompleta: os critérios reais continuam pendentes.** Esta rodada repetiu os comandos técnicos existentes e conferiu os impedimentos no código atual. Não iniciou uma prova integrada nem criou outra tentativa ou manifesto. Os registros 01, 02 e 03 foram preservados.

## Validação executada

[technical-validation.json](technical-validation.json) contém argumentos, horários, códigos e saídas pertinentes observados nesta rodada. Os corpos dos scripts de `package.json` foram executados diretamente por Node, com `execFile` e `shell:false`. Nenhum comando Git/GH foi executado.

| Validação | Resultado atual |
| --- | --- |
| Typecheck | Exit 0. |
| Lint | Exit 0. |
| Aceitação local | Exit 0; 40 testes, 2 arquivos. |
| Suíte completa | Exit 0; 642 testes, 42 arquivos. |
| Build | TypeScript, cópia dos recursos e Vite: exit 0. Avisos existentes de depreciação de esbuild/optimizeDeps e recomendação de plugin foram preservados no registro. |
| Smoke HTTP/SSE | Exit 1; `connect EACCES 127.0.0.1:63959`. Não comprovado. |
| Smoke execução/transporte | Exit 1; `connect EACCES 127.0.0.1:59743`. Não alcançou os cenários de frames nem o lançamento com Unicode. |
| Smoke checks | Exit 0; checks Node passed/failed, cwd Unicode e integridade dos artefatos. Não materializa Git nem executa Maestri/OMP. |
| Gate do manifesto 02 | Exit 2 antes e depois: `pending`, `readyForReview:false`. |

As falhas de loopback foram observadas novamente; esta rodada não determinou sua causa. Nenhuma política de segurança, ACL ou firewall foi alterada. Os testes locais usam os bloqueios de rede/subprocessos de `tests/setup.ts`; seus resultados não atestam integração externa.

## Impedimentos conferidos

1. A solicitação proíbe mutações Git. A prova exige clone por tentativa e referências imutáveis gerenciadas, conforme `SPEC.md` §§5.2/8.4/10.2 e `INTEGRACAO-MAESTRI-OMP.md` §§5/8. Executar essas mutações indiretamente pelo produto também violaria a restrição atual. Foi solicitada uma autorização delimitada para esses efeitos, mantendo commit de entrega e push proibidos; não houve resposta até este registro.
2. O runtime não disponibiliza o contexto elevado exigido por `AGENTS.md` para Git/GH. Não foi feita chamada Git/GH sem esse contexto, alteração de credenciais ou declaração artificial de acesso ao keyring.
3. Não foram fornecidos alvo GitHub/Project/issues, perfis exatos dos dois papéis, teto de custo e autorização dos efeitos remotos. Esses dados foram solicitados junto com a delimitação dos efeitos Git. Nenhum provider, comentário ICR ou alteração de Status foi executado.
4. **PF-05:** `apps/controller/src/main.ts` ainda inicia `startController()` sem `ControllerHostContext`. Os adapters só recebem contexto Git/GH/execução quando fornecido por composição confiável. Descobrir um executável ou preencher `kind:windows_keyring` não comprova essa autoridade. Não foi criada composição presumida para contornar esse pré-requisito.
5. **PF-06:** `storage/settings.ts` inicializa `account_id` nulo. `projects/index.ts:saveSettings` e `storage/configuration-writes.ts` não oferecem operação de vínculo inicial da identidade observada. O schema `GlobalChanges` também não aceita `accountId`. Não foi usado seed SQL ou ID inventado como substituto de operação de produto.
6. A consulta atual `GitNexus.list_repos` retornou quatro índices, sem a fábrica ou clone desta prova. Essa observação de catálogo não satisfaz INT-12. Nenhum clone foi criado para uma chamada útil.

## Critérios reais

### Atualização de diagnóstico - 2026-10-17, após 23:14

Este adendo preserva a avaliação histórica abaixo. A composição atual `scripts/start-host.mjs` iniciou o controlador no terminal próprio Maestri. A consulta HTTP atual retornou `host.matches=true` e `MAESTRI_CONTEXT_CONFIRMED`. A falta de contexto do shell externo não significa falta de acesso Wire. PF-05 deixa de ser o impedimento observado para iniciar o servidor neste host; isso não comprova execução de provider ou todos os adapters Git/GitHub.

As consultas reais retornaram conta observada presente, conta vinculada ausente, zero projetos, zero tentativas, automação desabilitada e despacho pausado. PF-06 continua sendo uma lacuna de implementação: `GlobalChanges` não oferece vínculo da conta e `writeGlobals` não atualiza `account_id`. Não foi alterado SQL para contornar a lacuna.

Reexecuções locais sobre o build atual:

- `npm.cmd run test:execution-compiled`: exit 0; loopback UTF-8, diagnósticos de frames/EOF e lançamento Windows com fixture Node passaram. Não executou Maestri/OMP/provider.
- `npm.cmd run test:verification-compiled`: exit 0; checks nativos, cwd Unicode, checksum e canonicalização reais passaram. Sem materialização Git ou Maestri/OMP.
- `npm.cmd run test:compiled`: exit 1; conexão local alcançada, mas a execução terminou com `TypeError: terminated`, causa `UND_ERR_SOCKET`, outro lado fechou a conexão. Causa não isolada. Não declarar o smoke HTTP/SSE aprovado nem manter EACCES como único diagnóstico atual.

O acesso ao Playwright foi restabelecido; a prova visual parcial atual está em `../../acceptance-transversal/visual-evidence.md`. Permanecem sem prova os percursos de agentes/publicação/fila, concorrência entre abas e recuperação com tentativas reais. Alvo, autorização dos efeitos e limites de custo precisam estar definidos antes dessas ações. Revisão independente da versão imutável também permanece pendente. Este adendo não altera os cenários do manifesto nem concede aceite.

Continuam sem evidência desta rodada: cadastro preservando origem dirty até ICR; capturas por tentativa e consumo visual das sprints 017/033/034; perfil efetivo/TUI/MCP útil e recuperação de argumento; cwd/argv/resultados Unicode no percurso real; pergunta/resposta e recibo na mesma passagem; resposta incerta suspensa; cancelamentos com recursos próprios/filho/recurso manual; restart e retry com outro clone/processo.

O manifesto 02 mantém os dez cenários e os três pré-requisitos pendentes. Não recebeu horários de início, autorização, tentativas ou anexos de execução inventados. PF-05/PF-06 continuam abertos; este relatório não é correção desses fluxos nem aceite da fatia. Nenhum código de produção, teste ou UI foi alterado, e nenhuma dependência foi instalada. Somente esta revalidação e sua referência no roteiro foram acrescentadas; `dist` foi reconstruído pelo build existente.
