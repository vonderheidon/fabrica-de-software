# Adapter Maestri/OMP — Sprint 008

Atualização da sprint 012: o produto compõe revisão independente e correções com persistência SQL. `createExecution` recebe `validateReviewerResult` da composição confiável; o primeiro resultado revisor exige conferência do checkout próprio por workspaces antes do commit. Recibos idênticos já aceitos permanecem recuperáveis sem repetir IO. O handshake também recusa IDs de sessão/terminal já observados em outra passagem viva. Essa implementação local não é prova de Maestri/OMP/provider real ou de acesso Wire.

`continuePassage(source,request)` só aceita uma sessão implementadora viva/acompanhada, com resultado anterior e perfil/recurso/ambiente preservados. A nova passagem é persistida e ligada por `session_source_id` antes de enviar contexto estruturado no mesmo canal. A extensão confirma `continuation-receipt` e usa `sendUserMessage` com `deliverAs:'followUp'`; nenhum recruit ou restauração de sessão ocorre. Timeout/EOF mantém diagnóstico, sem novo envio automático. O modelo continua enviando somente conteúdo; identidades da nova rodada são injetadas pelo adapter. Cada revisão seguinte recruta sessão própria. As provas de canal/ACK/perda são controladas; comportamento efetivo da TUI permanece para a integração autorizada.

Fontes: SPEC §§8.2–8.4/10.2; INTEGRACAO-MAESTRI-OMP.md integral; RF-43–47, RNF-21/22/24/25. Implementação em `apps/controller/src/modules/execution/index.ts`; detalhes exclusivos em `execution/adapters/maestri-omp`. Esta entrega disponibiliza o adapter para a composição do pipeline. Não acrescenta uma rota pública de resultado, início de tentativa ou shell.

## Decisão e documentação conferida

Escolhido o executável nativo OMP com uma extensão suportada. A TUI que recebe o trabalho registra `execution_complete` e `execution_question`, observa a sessão e recebe respostas por `sendUserMessage`. OMP mantém ferramentas, MCPs, autenticação, configuração, comandos, regras, skills e LSP normais. A fábrica não cria outro agente SDK, gerenciador MCP, launcher MCP ou resolver de repositórios.

A separação entre o stdout da TUI e o resultado oficial cria a necessidade concreta do pequeno canal local: callbacks da extensão precisam entregar payloads ao controlador e aguardar o commit do consumidor, enquanto stdin/stdout permanecem no terminal. O canal não transporta transcript nem implementa ferramentas de filesystem/shell. Somente bootstrap, handshake, recibos, resultados e perguntas usam JSON Lines em loopback com capacidade efêmera. Wire dos ensaios não é usado pelo produto.

Context7 consultado para OMP e Node 24. A resolução de Maestri encontrou outro produto; para Maestri foram consultadas as instruções locais de CLI distribuídas, opções embutidas na CLI e metadados da instalação. Referências primárias da versão OMP:

- [ExtensionAPI e eventos em v18.11.1](https://github.com/can1357/oh-my-pi/blob/v18.11.1/packages/coding-agent/src/extensibility/extensions/types.ts): sessão, modelo, esforço, schemas, registro de tools e envio de mensagens.
- [Parsing da CLI em v18.11.1](https://github.com/can1357/oh-my-pi/blob/v18.11.1/packages/coding-agent/src/cli/args.ts): provider/modelo/esforço e extensão.
- [Documentação de extensões](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md) e [Node 24 net](https://nodejs.org/docs/latest-v24.x/api/net.html).

Conferência local, sem provider: `omp --version` retornou **omp/18.11.1**. `omp --help` falhou ao carregar addon nativo por EPERM neste sandbox. Maestri instalado: **0.24.1**, build **94**, SHA de build `655f48da28c44196f90bb63ae220fc96b83b1bc5`. `maestri --help` retornou ausência de `MAESTRI_PIPE`. Isso não foi corrigido com ACL global ou contexto inventado. A integração real não foi executada.

O preflight do adapter exige contexto herdado, faz `maestri list` no servidor e confere a resposta do próprio chamador, consulta `recruit --help` e obtém a versão local de OMP. Hoje aceita exatamente OMP 18.11.1; outra versão recebe `CLI_UNSUPPORTED` e exige conferir a API antes de ampliar suporte. Não faz chamada paga para verificar ambiente. Em runtime com contexto ausente/stale ou CLI incompatível, não recruta terminal.

## Composição e persistência

`createExecution({dataDirectory,persistence,host?,roleDirectory?})` exige `ExecutionPersistence`. Não existe store em memória de produção, SQL no executor ou restauração automática de sessão. A sprint 009 implementa esse port em `storage/execution.ts` e compõe `main.ts` → `pipeline.startAttempt` → ambiente próprio → `execution.startPassage`. O host fornece contexto confiável na composição; HTTP não recebe executáveis, ambiente ou capacidade privada.

O caller fornece identidades já registradas da tentativa/passagem/rodada/versão, perfil capturado, ambiente gerenciado, IDs exatos de critérios, achados anteriores, tarefa e referência do papel capturado. Deve registrar intenção/ambiente antes do lançamento e fornecer `host` apenas na composição confiável do processo iniciado no terminal-âncora. `inheritedEnvironment` representa o ambiente realmente herdado; não é configurável por HTTP. Caminhos de executáveis são absolutos e resolvidos no host. CMD/BAT/PS1 recebem diagnóstico de incompatibilidade, sem adivinhar regras de quoting ou trocar executável.

Operações obrigatórias do port de persistência:

| Operação | Contrato de implementação pelo storage consumidor |
| --- | --- |
| `reserve` | Intenção/identidade/hash antes de qualquer criação; mesmo hash recupera a identidade, conflito recusa. A transação também deve recusar passagem de tentativa cancelada. |
| `confirmReady` | Perfil efetivo, versão, estado ready e evento atômicos após handshake/submissão. |
| `record`, `observe` | Estado/evento atômicos; sequência crescente durável, cursor exclusivo e página limitada a 100. |
| `acceptResult` | Resultado/hash/recibo/evento atômicos e únicos por passagem; mesmo hash retorna mesmo recibo, diferente conflita; vínculo com tentativa/versão obrigatório. |
| `raiseQuestion` | Pergunta e vínculo duráveis antes do recibo; repetição idêntica recupera a pergunta. |
| `recordAnswer`, `confirmAnswer` | Chave/operação/conteúdo vinculados; gravação antes do envio; entregue só após recibo, sem regressão de delivered para delivery_unknown. |
| `recordCancellation`, `recordStop` | Revogação antes da parada; incluir lançamentos conhecidos pendentes, guardar recibos e preservar histórico. |
| `getPassage`, `getResult` | Leituras do registro oficial; ausência/falha não se converte em sucesso ou resultado vazio. |

A fixture volátil histórica demonstra a ordem dessas chamadas. A sprint 009 acrescenta testes do adapter com SQLite real e native/channel/bootstrap controlados: invalidade/falha SQL sem ACK de sucesso, commit do resultado e evidências antes do envio e replay com recibo original. Produção usa somente `storage.executionPersistence()`. Isso comprova o contrato/durabilidade sob dependências controladas; não comprova execução Maestri/OMP/provider reais.

## Sessão e lançamento

`startPassage` reserva o nome próprio `factory-<passageId>` antes de recrutar. A consulta do registro preserva esse identificador mesmo em criação parcial. Não repete recruit por timeout/resposta perdida ou ao reenviar a mesma passagem. Conteúdo diferente para a mesma passagem conflita. Registro histórico sem handle vivo vira interrupted; nunca autoriza restaurar a sessão.

O bootstrap privado fica em `<data>/execution-bootstrap/<passageId>/launch.json`, criado exclusivamente. No Windows o adapter restringe a DACL **somente do novo diretório próprio**, antes de escrever a capacidade; não modifica a raiz de dados, ACL global ou configuração do usuário. Falha impede lançamento. Em outros hosts os arquivos usam modo 0600/diretório 0700; a implementação inicial e sua seleção de executáveis são Windows. A raiz de dados deve estar protegida para a instalação. Nenhuma credencial de provider/publicação entra no bootstrap. A capacidade é segredo efêmero do transporte e não é persistida como evidência, evento ou recurso público.

A linha Maestri contém PowerShell com `EncodedCommand` que referencia somente o caminho privado. O script lê UTF-8, define cwd por `LiteralPath` e invoca o executável com array de argumentos. A tarefa não é argv nem stdin. A extensão lê o bootstrap e a fábrica o remove antes de enviar `run`. Só então a extensão envia a única tarefa por `sendUserMessage`. Não há resume, prompt duplicado, processo OMP headless ou TUI auxiliar.

Handshake confere protocolo, capacidade, sessão, terminal próprio diferente da âncora, workspace, cwd exato, TTY real, digest do papel e provider/modelo/esforço. Divergência não envia `run`. Depois de `task-submitted`, `confirmReady` precisa concluir para retornar ready. Perfil/version observados são consultáveis no recibo. O perfil não recebe fallback. Caracteres de controle/quoting em seletores de perfil são recusados antes de lançar; espaços/Unicode em diretórios permanecem suportados.

`interactionSurface(handle)` consulta o nome próprio e a capacidade `open`. O host pode fornecer `openExistingTerminal` pelo mecanismo nativo suportado para os IDs obtidos no handshake. Sem essa capacidade, o retorno explica que a sessão existente deve ser aberta no Maestri do host executor. A CLI conferida não ofereceu um verbo documentado para focar terminal; o adapter não inventa URI/comando. Abrir nunca recruta ou troca a sessão. O hook de abertura nativa ainda precisa de prova no host da sprint 018.

Troca de sessão/branch/tree e shutdown observados revogam coordenação. Mudança de perfil é conferida na borda de turno e nas tools oficiais, sem filtrar comandos nativos ou prometer observar toda alteração interna. `close` encerra transporte/esperas e marca interrupção, preservando TUI e trabalho; não cancela negócio nem restaura autoridade. `cancelAttempt` revoga pelo store e pede dismiss exclusivamente dos nomes próprios. Retorno tardio de recruit depois do cancelamento recebe parada. Aceitação da CLI gera parada **uncertain**, sem alegar ausência de descendentes ou apagar clone.

## Resultados, perguntas e limites

O modelo recebe apenas os schemas de conteúdo. Tentativa, passagem, papel, rodada e versão são injetados pelo adapter a partir da solicitação capturada. Campos privados extras são recusados. `execution_complete` valida schema do papel e conjunto exato de critérios sem duplicatas. Revisor valida IDs/keys únicos, achados pertinentes, resoluções exatas e coerência de approved com critérios/achados bloqueantes/resoluções. As provas de independência/conteúdo imutável são dos serviços de revisão/captura, não do texto do agente.

Payload inválido retorna erro corrigível sem fechar a TUI. O recibo só é enviado depois de `acceptResult`/`raiseQuestion` retornarem do commit. Conversa posterior não inicia implementação nem outra entrega. `getResult` consulta a persistência mesmo se o resultado chegou antes do consumidor. A pergunta é gravada sem esperar decisão dentro da tool, mantendo TUI/conversa livres. Resposta formal é gravada antes de mensagem follow-up na mesma sessão; timeout/EOF vira delivery_unknown, sem reenvio automático. Recibo significa que OMP enfileirou a resposta naquela passagem, não que o modelo já a processou.

O transporte usa listener IPv4 `127.0.0.1`, porta efêmera e autenticação por passagem com comparação em tempo constante. Peer sem capacidade não toma posse da passagem. UTF-8 é decodificado fatalmente depois do framing por bytes; caracteres multibyte fragmentados são preservados. EOF incompleto, malformed e excesso encerram canal e esperas com código sanitizado. Backpressure e deadlines limitam escrita; não se mantém transcript.

| Recurso | Limite efetivo |
| --- | --- |
| Frame / buffer de escrita | 1 MiB / 2 MiB |
| Frames por lote de leitura / peers por passagem | 16 / 4 |
| Handshake / chamada de canal ou CLI | 30 s / 15 s |
| Saída de CLI retida | 1 MiB; stderr descartado |
| Chamadas pendentes / respostas deduplicadas na extensão | 8 / 128 |
| Passagens por instância do adapter | 128; não há expulsão de handle vivo |
| Catálogo por papel / bootstrap na extensão | 128 KiB / 4 MiB |

Esses tetos são limites técnicos, não SLAs. O ciclo de vida da instância deve acompanhar o processo controlador; capacidade esgotada exige diagnóstico sem repetir trabalho. MCPs seguem lifecycle/disabled nativos. Orientação de GitNexus exige analisar o clone atribuído e conferir a raiz exata com os parâmetros suportados. Descoberta e chamada útil de MCP/GitNexus, ferramentas após resultado e TUI real exigem a prova autorizada da sprint 018.

## Provas e próximos consumidores

Suíte Vitest padrão sem rede/provider/subprocessos reais: schemas distribuídos; byte framing; diagnóstico/contexto/versão/argv sob runner controlado; handshake/perfil/correlação; retry de payload; ACK após retorno de persistência; pergunta/resposta/EOF; criação parcial; cancelamento pendente/retorno tardio; restart sem adoção; extensão no mesmo contexto com uma única tarefa e recuperação de erro.

`npm run test:execution-compiled` exercita recursos de `dist/resources/roles` com cwd distinto, socket loopback real e UTF-8/EOF. No Windows executa PowerShell com Node como fixture para conferir argv, cwd, espaços, apóstrofo e Unicode. Não executa o parser/terminal Maestri nem OMP, portanto não conclui INT-14. `npm run test:compiled` conserva o smoke HTTP/SSE/SQLite histórico.

Sprint 009 implementada: transações de tentativa/passagem/recursos/resultados, captura por valor e composição com `ExecutionPersistence`. `AttemptCapture.roleResources` guarda `id/role/version/path/sha256` de ambos os papéis. `tools` guarda observações próprias de Node/Git/GH/Maestri/OMP com versão ou causa/requisito pendente, sem valor fictício. Perfil/versão OMP efetivamente observados ficam na passagem; não substituem a configuração histórica. A ausência de contrato impede despacho; versão indisponível conserva tentativa suspensa antes de efeitos. Sprints seguintes completam captura Git/checks, perguntas na UI e revisão independente por versão. Sprint 018 mantém a prova real opt-in em terminal-âncora com OMP 18.11.1, MCP útil/disabled/argumento inválido, GitNexus no clone, interação durante/pergunta/após resultado, abertura da mesma sessão e Windows real. As provas controladas não são aceite integral AC-15/23/24/25 ou INT-01–05/09/10/12–14.
