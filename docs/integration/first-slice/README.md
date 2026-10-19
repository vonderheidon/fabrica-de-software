# Prova integrada da primeira fatia

Preparação atual da Etapa B (sem executar cenários): [roteiro S20 da rodada 20261018-01](../acceptance-b/20261018-01/runbook-first-slice.md) e [registro separado de resultados/pendências](../acceptance-b/20261018-01/record.md). Os relatórios 20261017-01 a 20261017-04 permanecem históricos e não são substituídos.

Fonte: `SPEC.md` §§5–8/10.2–10.3, `INTEGRACAO-MAESTRI-OMP.md` e plano aprovado em `docs/Docs20261016_073031/sprints20261016_073031.json`, sprint-018. S1–S4 são achados do relatório `sprint-validation20261016_073031.md`. O histórico de progresso usa também numerações sequenciais diferentes; este roteiro usa os IDs do plano para evitar confundir a prova com a UI de decisão.

**Estado atual: preparada; execução e aceite reais pendentes.** Revalidação atual: [20261017-02/report.md](20261017-02/report.md). A [preparação anterior](20261017-01/report.md) foi preservada. Este roteiro não inicia providers, Git/GH, terminais ou mutações. Não há autorização de execução inferida do pedido de implementação.

Última repetição técnica após o Evaluator: [20261017-04/report.md](20261017-04/report.md), preservando a [rodada 03](20261017-03/report.md). Typecheck, lint, 40 testes de aceitação local, 642 testes totais, build e smoke de checks passaram novamente. Os smokes HTTP e transporte retornaram `EACCES` no loopback neste runtime. O manifesto 02 continua pendente; nenhum cenário real foi promovido. A autorização delimitada e os dados de execução foram solicitados; os impedimentos de composição do host e vínculo inicial da conta continuam abertos.

## 1. Pré-voo obrigatório

Antes de executar, criar um novo diretório de prova e preservar os registros anteriores. Usar o [manifesto inicial](20261017-01/manifest.json) como modelo, atribuindo outro `proofId`; preencher somente observações efetivas. Não transformar `null` em versão presumida.

| Registro | Conteúdo necessário antes dos efeitos |
| --- | --- |
| Produto | Versão de `package.json`, revisão Git quando disponível em contexto autorizado e digest dos arquivos efetivamente construídos. Se há alterações locais, identificar também essa árvore por manifesto de paths/hashes de fontes/configuração/lockfile/recursos e dos assets `dist`; não copiar seus bytes. Um SHA de HEAD sozinho não identifica um build dirty. |
| Ferramentas da prova | Node/Git/GH/Maestri (versão/build)/OMP, GitNexus, Playwright MCP/Chrome e demais MCPs usados, com versão, origem da observação e horário. Ajuda/configuração não comprova chamada útil. Conferir suporte do adapter à versão efetiva de OMP, sem atualizar pacotes implicitamente. |
| Alvo | Conta observada por ID, repositório ID/URL, Project/owner/item/campo/quatro opções de Status, issues de teste abertas e atribuídas exclusivamente à conta. Primeiro início exige Ready. Reservar issues/cenários para evitar que o ICR anterior impeça a preparação do cenário seguinte. |
| Host | Início dentro do terminal-âncora Maestri e contexto nativo herdado conferido por preflight real. Composição confiável de `ControllerHostContext`, contexto Git/GH com keyring e autorização GitHub restrita ao alvo. Nunca por body HTTP, identidade inventada ou seed de fixture. |
| Perfis e autorização externa | Perfis exatos de ambos os papéis: provider/modelo/esforço/guidance, duração/TTL escolhidos, número de passagens e modo ICR. Delimitar efeitos e custo autorizado do ensaio com o responsável; isso não é configuração nem bloqueador financeiro do produto. Registrar gasto observado ou indisponibilidade com causa. |
| Efeitos | Referência da instrução explícita do usuário com alvos/validade: provider, clones/capturas/refs técnicas em recursos gerenciados, comentário ICR e projeções Status, cancelamento e restart dos recursos próprios. A proibição de mutações Git nesta sessão impede executar também o percurso do produto; precisa de autorização compatível para uma execução futura. Commit de entrega, push, PR, merge e mudança para Done não integram esta prova. |
| UI prévia | Sprint-017: lista/detalhe; sprint-033: decisão/resposta; sprint-034: recuperação. Verificar conteúdo e screenshots atuais por Playwright MCP/Chrome de teste. Código compilado apenas permite iniciar a inspeção. |

Na sprint de inicialização distribuível, `npm start` passou a usar `scripts/start-host.mjs` com executáveis explícitos e ambiente herdado do terminal-âncora. A composição atual exige quatro caminhos EXE (Git, Maestri, OMP e PowerShell); GitHub é descoberto após a aplicação abrir. `startController` mantém o pré-voo nativo Maestri/OMP antes do scheduler/HTTP. Consulte o [manual](../../operation/README.md). Essa alteração de código não comprova funcionamento no host real e não reescreve os relatórios históricos de PF-05. Usar somente contexto autorizado já conferido no host. Conta nula/configuração ausente também deve ser resolvida por superfície de produto: não editar SQL para tornar o cenário artificialmente executável. PF-06 permanece pendente; os bloqueios observados nas preparações estão nos respectivos relatórios.

Se a tarefa futura for validar acesso do LionClaw pelo Wire, ler `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` e usar seus helpers. Esse acesso não substitui a conexão nativa do produto. Ausência de `MAESTRI_PIPE` no shell externo é somente uma observação desse shell.

## 2. Validação local anterior à prova

Comandos já configurados, executados da raiz pelo contexto autorizado de terminal:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:acceptance
npm.cmd test -- --reporter=dot
npm.cmd run build
npm.cmd run test:compiled
npm.cmd run test:execution-compiled
npm.cmd run test:verification-compiled
npm.cmd run acceptance:check -- docs/integration/first-slice/20261017-02/manifest.json
```

`test:acceptance` verifica o gate de evidência e contratos entre módulos com SQLite real e adapters controlados, sem providers/rede/subprocessos reais. Os smokes compilados exercitam HTTP/SQLite/processos Node e sockets próprios; nenhum recruta OMP ou chama Git/GH. A suíte padrão continua com os bloqueios de `tests/setup.ts`.

O verificador offline lê apenas o manifesto e evidências locais referenciadas. Exit **0** significa documentação íntegra apta a revisão independente; **1** significa manifesto inválido/falha declarada; **2** significa pendência. Nunca concede aceite, autorização de efeitos ou aprovação de fase. Ele valida schema, IDs únicos, conjunto de cenários, pré-requisitos, janela de autorização, efeitos permitidos, versões presentes, correlação de tentativas, classificação de evidência, tamanho e SHA-256. Não prova autenticidade de um relato, semântica de um screenshot ou funcionamento externo. A revisão deve conferir os fatos abaixo nos arquivos referenciados. Não promover fixture a `kind:real`.

Anexo ilegível, checksum/tamanho divergente, IDs/paths duplicados ou cronologia contraditória tornam o registro inválido (exit 1). Ausência de execução/autorização continua pendente (exit 2). Os anexos que identificam produto e autorização devem ter sido registrados até o início dos efeitos; capturas oficiais por tentativa precisam estar dentro da janela da prova. Um relato posterior não substitui o pré-voo. A validação compara metadados declarados e bytes, sem autenticar timestamps ou a origem de um anexo.

No PowerShell que encapsula um comando nativo, preservar o código ao reportar ao caller: `exit $LASTEXITCODE`. O registro atual foi conferido também por chamada direta a `node scripts/first-slice-evidence.mjs ...`, com exit 2. Pendência esperada não é falha de typecheck/lint/build.

| Achado | Prova determinística atual | Limite |
| --- | --- | --- |
| S1 | `first-slice-contracts.test.ts`: captura de papéis/ferramentas/configuração preservada; `attempts.test.ts`: capturas próprias sob mudanças de recursos/versões. | Recursos/versões efetivos do host ainda precisam de captura oficial real por tentativa. |
| S2 | `first-slice-contracts.test.ts`: aviso na versão rejeitada e na aprovada; `deliveries.test.ts`/`capture.test.ts`: exclusão de bytes ignorados sob Git controlado. | Apresentação renderizada e objetos Git reais ainda pendentes. |
| S3 | `first-slice-contracts.test.ts`/`queries.test.ts`: paginação e seleção histórica separadas da ativa. | Navegação/erro de próxima página/reload na UI precisam de Playwright MCP/Chrome. |
| S4 | `first-slice-contracts.test.ts`/`questions.test.ts`: edição editorial, mudança de critério, keep_captured, entrega incerta/recibo e exigência de nova tentativa. | Interação na TUI e nos formulários reais ainda pendente. |

O smoke compilado de execução agora autentica sockets loopback próprios e confirma `FRAME_INVALID` para JSON/UTF-8 inválidos, `FRAME_OVERSIZE` e `CHANNEL_EOF`, fechamento e recusa de envio posterior, sempre com deadline. É prova local do canal compilado, sem OMP/provider/Maestri.

## 3. Cenários reais e evidências mínimas

Cada cenário recebe ID, horário, versão do produto, IDs de tentativa/passagem/rodada/entrega, recurso e operação/recibo pertinentes. Registrar requisições apenas por método/rota normalizada/códigos/IDs; omitir Cookie, CSRF, Authorization, capacidades privadas e ambiente herdado. Os valores reais de sessão podem ser substituídos por aliases estáveis nos anexos, preservando igualdade/diferença observada.

### registration-icr — cadastro até ICR

1. Na origem de teste já commitada, preparar alteração dirty conhecida, inclusão não ignorada e arquivo ignored declarado pelo Implementador. Anotar hashes/contagens da alteração/índice/HEAD antes do cadastro e depois do clone. Usar cwd com espaços/Unicode, por exemplo `Prova ação 😀`, e um argumento literal Unicode na tarefa/check; não colocar prompt ou segredo em argv. Não copiar o índice para evidências.
2. Cadastrar pela Principal (`POST /projects`), configurar perfis/check executável/Project e preparar a issue pelos formulários existentes. Ausência de remoto/Project/vínculo precisa bloquear início. Confirmar resumo atual e salvar os IDs/ETag/hash sem tokens. Automação fica desabilitada para a prova manual.
3. Iniciar uma vez (`POST /attempts`, `202`, `OperationAccepted`). Simular perda apenas da resposta HTTP na superfície de teste do browser, sem perder o resultado no servidor; consultar `GET /operations/:operationId`. Verificar uma tentativa, um clone e um despacho. Não repetir POST para descobrir resultado.
4. Observar o clone próprio e a branch/base fixas, sem dirty da origem, alternates/hardlinks. Correlacionar resourceId/path/ownership/baseSha com a tentativa. Confirmar a comparação de hashes de origem.
5. Implementador cria artefato pequeno verificável e check, termina ferramentas/escritores próprios e envia `execution_complete` em português/emoji. Antes, enviar um payload inválido corrigível e conferir ausência de recibo; depois, conferir recibo durável. Repetição idêntica recupera o recibo e conflito não substitui resultado. Não usar conversa como resultado.
6. Conferir captura após resultado: deliveryId/ref/base/tree/commit técnico retido. Conferir o índice da implementação preservado. O aviso do arquivo declared ignored deve estar na versão correta e seus bytes ausentes da tree, SQL e payloads oficiais (S2).
7. Conferir check do controlador com comando capturado, exit code, tree, runNumber, artifactId, SHA-256 e conteúdo sob demanda. Executar pelo menos um check real; `not_applicable` não comprova esse passo.
8. Conferir Revisor em outro clone/runtime/sessão, perfil efetivo exato, sem conversa do Implementador; revisão vinculada à mesma tree/checks. Registrar teste de alteração de produto no clone revisor em versão descartável: aprovação declarada deve ser invalidada. Não reparar e reutilizar parecer invalidado.
9. Conferir ICR com comentário/Status nos alvos autorizados, journal/recibos e `result:delivered`. Diff/artifacts continuam consultáveis após terminar processos. Conferir ausência de commit de entrega/push; o commit técnico privado de retenção é outro recurso e deve ser identificado explicitamente.

### correction — revisão e correção limitada

Produzir uma reprovação concreta, confirmar achado por UUID e nova rodada na mesma sessão implementadora acompanhada. Correção gera outra entrega/tree/checks e outro runtime revisor. Consultar a versão rejeitada e a aprovada separadamente. Exercitar limite capturado, inclusive última correção revisada/esgotamento, sem reescrever resultados anteriores. O limite 0–5 tem cobertura determinística; a prova real precisa de ciclo representativo e de um esgotamento com limite curto explicitamente escolhido, sem repetir toda a matriz de perfis.

### tui-mcp — runtime e ferramenta útil

Conferir handshake/versão/perfil e TTY do runtime que faz o trabalho. Conversar e usar ferramenta durante trabalho, durante pergunta e após resultado sem nova implementação. Observar a mesma sessão por capacidade nativa ou diretamente no Maestri; abrir nunca recruta substituta. Registrar cwd/argv sanitizados com espaços/Unicode no lançamento real.

Dentro do OMP real, chamar MCP necessário com argumento inválido, observar diagnóstico, corrigir e obter informação útil sem encerrar tentativa. GitNexus deve analisar e consultar a raiz exata do clone pertinente, registrando parâmetro de repo/raiz e um resultado específico verificável no arquivo atual. Catálogo, índice do operador, ajuda ou fixture não bastam. Registrar configuração disabled respeitada se observada, sem criar matriz histórica adicional. Preflight sem contexto válido deve retornar diagnóstico sem mudar ACL/configuração global (INT-02); esse caso negativo pode ser local e deve ser identificado como tal no anexo.

### transport — bytes e encerramento de esperas

Resultado real deve preservar português/emoji. Reproduzir fragmentação, JSON/UTF-8 inválido (`FRAME_INVALID`), frame acima de 1 MiB (`FRAME_OVERSIZE`) e EOF incompleto (`CHANNEL_EOF`) com testes locais atuais; conferir encerramento das esperas no canal pelo teste do adapter/smoke. Não enviar frames arbitrários nem capacidades privadas por HTTP. Vincular o diagnóstico local à versão do canal usado pela tentativa real. Este é o único cenário que aceita evidência `local` no gate; testes com mocks permanecem `controlled`, insuficientes para o gate real.

### question e answer-unknown — mesma passagem

Em questão de produto prevista na issue, emitir `execution_question`, manter fase/rodada e TUI utilizável. Responder pelo detalhe da sprint-033: resposta gravada/operação antes do follow-up, mesma passagem e recibo correlacionado. Conferir suspensão retirada somente após `delivered`, com espera humana/TTL separados.

Para S4, fazer edição editorial fora dos critérios, depois mudança de texto/ID de critério no alvo autorizado. Conferir comparação e decisão, manter captura original com `keep_captured`; `adopt_new` deve indicar outra tentativa. Mudança no GitHub exige a autorização específica do alvo e pode ser feita pelo operador.

No cenário de resposta incerta, interromper de forma delimitada a confirmação entre sessão própria e controlador após gravar a resposta, ou usar falha observável de transporte no host. Registrar ponto de falha e limites: perda definitiva pode interromper a tentativa e não permite fingir reconexão. Conferir `delivery_unknown`, suspensão e GET de questão/operação sem segundo envio; ACK tardio somente se o mesmo canal ainda estiver acompanhado. Não criar endpoint público de injeção, replay cego ou outra sessão para produzir recibo. Se não houver mecanismo confiável de observar essa condição real, deixar o cenário pendente e manter os testes contratuais separados.

### cancel-startup — inicialização

Iniciar tentativa própria e cancelar quando a intenção de lançamento estiver persistida e o recruit ainda não tiver concluído. Registrar sequência de intenção/cancelamento/retorno tardio/parada e recursos. `202` comprova revogação, não parada física. Conferir que retorno tardio não avança/publica nem provoca outro recruit. Se o host não permite observar essa janela, registrar pendência em vez de simular a corrida como prova real.

### cancel-child — trabalho com filho

Usar tarefa de teste que inicia um filho escritor próprio identificável e deixa um marcador de progresso no ambiente gerenciado. Manter em paralelo um recurso manual controlado pelo operador, identificado antes. Cancelar pela sprint-034 e observar o que parou, último marcador e recibos. Conferir ausência de novos avanços/publicação, recurso manual preservado e ambiente/evidência conservados. Dismiss aceito, exit zero ou silêncio não comprovam fim dos escritores; sem capacidade confiável do host, registrar parada/limpeza `uncertain` e recusa de remoção. Não varrer processos por nome, não matar alvo manual nem apagar recurso incerto.

### restart-retry — histórico e novo ambiente

Com tentativa incompleta e registros/resultado já existentes, fechar/reiniciar somente o controlador da prova pelo terminal-âncora, usando os mesmos dados. Consultar histórico por browser novo: sessão HTTP antiga e vínculo/capacidade antigos não recuperam autoridade, coordenação antiga fica interrupted, sem recruit automático. Registro de resultado/efeito confirmado continua disponível; só reconciliação de fatos é admitida.

Na ação Nova tentativa, usar a issue fora de Ready, mas ainda aberta/atribuída/vinculada/elegível. Confirmar base/issue atuais, outro attemptId/clone/processo/sessão e ausência de restore/reset global. Guardar a tentativa antiga para comparação e diagnóstico, sem exclusão. Consultar operação perdida antes de qualquer outro início.

### ui-prerequisites — sprints 017/033/034

Usar Playwright MCP/Chrome com perfil de teste, conteúdo e screenshot para cada observação. Registrar versões e fechar somente o browser iniciado pela prova.

| Entrega | Conferência pela UI já existente |
| --- | --- |
| sprint-017 / S2/S3 | Mais de uma página na aba Tentativas; filtros, Anterior/Próxima; falha da próxima página preserva a atual. Abrir tentativa antiga, selecionar rodada/versão, atualizar ativa/recarregar e conservar seleção/URL. Aviso ignored na versão correta; diff/logs sob demanda; ausente/corrompido sem falso conteúdo vazio. |
| sprint-033 / S4 | Pergunta/comparação de critérios, rascunho preservado, TTL e estados answer_recorded/sending/delivered/delivery_unknown/expired/cancelled. Recibo entrega à mesma passagem; reload/consulta sem reenviar. |
| sprint-034 | Cancelar, Nova tentativa e capacidades de terminal/pasta correspondem aos IDs; falta de capacidade explícita. Repetir captura somente quando elegível e sem outro Implementador. Plano de remoção mostra perda/preservação; recurso incerto bloqueia exclusão. Não executar remoção sem autorização correspondente. |

Conferir teclado/foco, conteúdo, responsividade e feedback no modal aprovado; fechar modal não cancela negócio. Não alterar UI nesta sprint. Falha encontrada recebe ID/escopo/versão/evidência e bloqueia somente os critérios afetados; correção futura conserva o achado e acrescenta reexecução.

## 4. Evidência e decisão de aceite

Anexos ficam no diretório do novo `proofId`, com paths relativos, tamanho e SHA-256. Usar JSON/Markdown sanitizado e PNGs revisados. Não arquivar DB integral, checkout, índice, cache, bootstrap, transcript ou ambiente. Não anexar token de transporte nem cookie/CSRF. Redação deve ocorrer antes de salvar; checksum identifica os bytes sanitizados publicados.

Para cada tentativa, exportar projeção sanitizada da captura oficial: attemptId, preparação/revisão/summaryHash, conta/issue/base, criteriaDigest e critérios, perfis/configuração/origins por valor, `roleResources` com id/role/version/path/sha256 e `tools` observados. Vincular por `attempts[].captureEvidenceId`; registros globais da prova não substituem S1. Resultados/revisões/checks/recibos devem indicar seus IDs e a mesma tree. Captura é consultada pelo storage/API de negócio em ferramenta confiável local, sem SQL ou endpoint de impersonação.

Cada cenário deve explicar ação, observação, IDs correlacionados, resultado, limite e AC/INT cobertos. `passed` exige esses fatos conferidos; falta de recurso/autorização é `pending`; execução que contradiz o contrato é `failed`. Guardar custo observado e eventual indisponibilidade separadamente da autorização externa; não exigir tetos financeiros ou de tokens de inferência na configuração do produto. Revisão independente confere anexos/conteúdo/screenshot e versão atual antes do aceite da fatia. O gate offline verifica apenas consistência documental; o usuário decide o aceite pelos mecanismos do pipeline.

Referências das APIs de filesystem conferidas no Context7 para Node 24: [fs](https://nodejs.org/docs/latest-v24.x/api/fs.html) e [crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html). Nenhuma dependência nova foi necessária.
