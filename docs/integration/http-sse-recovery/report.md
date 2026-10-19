# Diagnóstico e recuperação HTTP/SSE

**Estado:** typecheck, lint, build, suíte padrão, prova HTTP opt-in e smoke compilado passaram nesta revisão. A correção de produção termina o stream dentro do prazo e deixa falhas inesperadas visíveis. O aceite visual Playwright MCP/Chrome continua separado.

## Registro da ocorrência e reprodução

| Campo | Evidência registrada |
| --- | --- |
| Comando histórico | `npm.cmd run test:compiled`, conforme o relato da avaliação. O log original completo não foi preservado. |
| Contexto | Smoke local do controlador compilado em Windows, com HTTP/SSE e SQLite. O registro histórico não contém versão exata do Node, URL ou captura completa. |
| Saída/erro histórico | O relatório anterior registrava exit code 1, `TypeError: terminated` e `cause.code === UND_ERR_SOCKET`. |
| Etapa histórica | A avaliação reteve `reader.read()`, mas não reteve qual leitor nem a stack. Não atribuo esse registro a replay, stream ativo ou shutdown sem evidência. |
| Reprodução controlada | `npm.cmd run test:http -- --reporter=verbose --silent=false` executa um controle com o mecanismo antigo (`Readable.from(..., { signal })`) e a rota corrigida por HTTP real em loopback. |
| Saída do controle antigo | `{"reproduction":"legacy-readable-abort","stage":"legacy-events-reader.read","error_name":"TypeError","error_message":"terminated","cause_code":"UND_ERR_SOCKET"}`. O teste exige exatamente esse erro e código de causa. |
| Saída da rota corrigida | `{"reproduction":"bounded-production-stream","stage":"events-reader.read","status":200,"termination":"eof","heartbeat":true,"resync":false,"handler_errors":[]}`. |

O código anterior passava o sinal do prazo de vida a `Readable.from`. O controle reproduzível acima aborta esse mesmo sinal enquanto o gerador espera e observa no leitor HTTP o par `TypeError: terminated` / `UND_ERR_SOCKET` registrado na ocorrência. Isso evidencia o mecanismo de destruição prematura responsável por essa assinatura no handler histórico. Como o log original perdeu URL e identidade do leitor, permanece indeterminado qual leitor recebeu o erro naquela execução.

O smoke compilado atualizado executou `npm.cmd run test:compiled` depois do build. Saiu com código 0, registrou 14 etapas concluídas e identificou `sse-shutdown-reader-1` e `sse-shutdown-reader-2` com término `eof`. Esse resultado atual é encerramento esperado no shutdown; não foi usado para afirmar que o erro histórico ocorreu no shutdown.

O `ERR_INCOMPLETE_CHUNKED_ENCODING` do Chrome permanece uma observação separada. Não há reprodução Playwright MCP/Chrome nesta revisão e nenhum resultado local é apresentado como explicação desse erro de navegador.

## Correção e regressões

Em `apps/controller/src/http/routes/events.ts`, o sinal continua cancelando a espera delimitada de polling, mas deixa de ser entregue a `Readable.from`, que destruiria o corpo no abort antes do EOF normal. Erros de leitura sem cancelamento continuam registrados e geram `resync`; erros inesperados após cancelamento continuam registrados. Não há supressão genérica de `UND_ERR_SOCKET` ou `TypeError: terminated`.

`tests/integration/event-stream-http.proof.ts` registra tanto o controle negativo do mecanismo antigo quanto o EOF normal da rota de produção usando HTTP real. Ele roda apenas pelo comando opt-in `npm.cmd run test:http`; a configuração padrão de testes continua proibindo sockets. A prova termina em EOF e dentro do limite, sem `resync` ou erro do handler. O teste de falha de leitura em `tests/integration/event-stream-timeout.test.ts` continua exigindo `resync`, e o teste de cursor verifica que `Last-Event-ID` prevalece sobre o cursor da query.

`apps/web/src/app/controller-events.test.ts` cobre UTF-8 fragmentado, deduplicação por sequência, cursor, reconnect, resync, fechamento terminal e descarte de resposta atrasada após cleanup. A seam observa apenas leituras. Contadores instrumentados para save, início, resposta e publicação permanecem em zero durante reconnect/resync; todas as requisições observadas nesses percursos são `GET`.

`EventConnectionStatus` expõe Conectando, conectado, reconectando e falha em português com `role="status"`, nome acessível e `aria-live`. As proteções de identidade da consulta e do componente permanecem verificadas pela suíte padrão, sem alterar estado de edição ou seleção histórica durante resposta obsoleta.

## Validação desta revisão

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Passou após as alterações de código e da prova opt-in. |
| `npm.cmd run lint` | Passou: limites de módulos e convenções TypeScript. |
| `npm.cmd run build` | Passou; Vite compilou 355 módulos. |
| `npm.cmd run test:compiled` após build | Passou com `exit_code: 0`; registrou etapas, readers e evidências de HTTP/SSE/SQLite. |
| `npm.cmd run test:http -- --reporter=verbose --silent=false` | 2 testes passaram: reprodução do fechamento antigo e EOF HTTP normal da rota corrigida. |
| `npm.cmd test` | 90 arquivos e 1.229 testes passaram. |
| Playwright MCP/Chrome | Não executado. O erro `ERR_INCOMPLETE_CHUNKED_ENCODING` continua sem confirmação visual real. |

A suíte padrão não foi tratada como prova do transporte: ela proíbe sockets em `tests/setup.ts`. A prova real foi executada separadamente e explicitamente por `test:http`; não houve indisponibilidade instrumental nessa execução nem repetição de correção sem falha reproduzida.
