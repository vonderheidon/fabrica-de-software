# Integração externa Maestri + OMP — contrato de implementação

Parte normativa da [spec da nova fábrica](SPEC.md). Este anexo descreve o que implementar do zero em TypeScript/Node e no helper Windows; os fontes antigos são referências de problemas, não bibliotecas reutilizáveis. Não precisa desenvolver dentro de Maestri, mas o runtime inicial precisa de Maestri aberto e uma conexão explicitamente vinculada ao terminal de controle.

## 1. Papéis dos processos

| Processo | Responsabilidade | Não significa |
| --- | --- | --- |
| Controlador Node/Fastify | Tentativas, dados oficiais, checks, publicação, diagnóstico | Shell com poderes de qualquer terminal do operador |
| Terminal-âncora Maestri | Contexto de conexão e capacidade Maestro para criar os terminais próprios | Agente que implementa a issue ou conversa de resultado |
| Launcher/supervisor Windows | Ambiente local, criação suspensa, Job, recibo físico e parada | Worker de negócio, prova de isolamento de rede |
| OMP Implementador | TUI normal e ferramentas de trabalho, resultado estruturado | Dono de commit/push/PR da fábrica |
| OMP Revisor | Sessão independente e avaliação do snapshot de revisão | Implementador que corrige para aprovar |
| Servidor MCP próprio | Ferramentas do papel, artefatos e operações configuradas | Servidor compartilhado do operador |

Não iniciar outro OMP print/headless para produzir o resultado enquanto um OMP decorativo permanece na TUI. Um papel tem um runtime operacional identificado por passagem; checks do controlador são processos separados e relatados como tais.

## 2. Desenvolvimento fora do Maestri

### 2.1 O que o executável não resolve

Ter `maestri.exe` no PATH e obter `maestri --version` não comprova conexão. A CLI depende do daemon e da identidade de um terminal no canvas. Recrutamento é Maestro-only e autoconecta ao terminal que originou a chamada; dismiss exige alcance conectado. Uma aplicação aberta pelo IDE não herda necessariamente esse contexto.

Na instalação observada, variáveis relevantes são:

- `MAESTRI_CLI`: caminho do executável vivo, preferível a uma cópia antiga encontrada no PATH.
- `MAESTRI_PIPE`: pipe do daemon atual, por exemplo `\\.\pipe\maestri-<token>`; muda entre execuções do daemon.
- `MAESTRI_TERMINAL_ID`: identidade do terminal de origem/âncora; não inventar nem usar a de um terminal manual arbitrário.

Essas variáveis são detalhes do adapter e não do módulo pipeline. Seus valores não devem aparecer em logs públicos, URL, comandos ao modelo ou configuração global do operador.

### 2.2 Caminho suportado de vínculo externo

A primeira implementação deve oferecer um entrypoint de vínculo (nome de comando **proposto**, não CLI existente): `factory attach-maestri`. Executado pelo operador em um terminal Shell dedicado no Maestri, com capacidade Maestro, ele entrega ao controlador local um registro efêmero autenticado da conexão.

Percurso:

1. Desenvolvedor trabalha no IDE/pasta de sua preferência. Controlador inicia sem conexão Maestri; UI permite configurar/consultar, mas não executar agentes.
2. Operador abre terminal-âncora dedicado no workspace Maestri desejado e habilita capacidade Maestro pela configuração normal do app/preset.
3. UI/controlador cria challenge de vínculo de uso único, com expiração e endpoint loopback autenticado. Não pôr o segredo em query string ou log.
4. Entry point attach, executado no terminal-âncora, valida CLI/pipe/terminal e confirma o challenge. Entrega contexto apenas ao adapter e marca vínculo com host/conta/daemon/âncora.
5. Controlador usa esse contexto em `env` explícito de subprocessos CLI, sem escrever `process.env` global nem copiar arquivos do usuário.
6. Readiness de vínculo exige `maestri debug` e `maestri list` funcionando nesse ambiente e identificação da âncora com Maestro. Teste de recruit real é feito no ensaio autorizado, não a cada GET da UI.
7. Daemon/âncora desligados invalidam vínculo. Reconectar é ação curta de integração, não liberar reserva/resetar todas as tentativas. Recursos conhecidos ficam em diagnóstico e publicação automática é suspensa.

Alternativa suportada para início simples: lançar controlador diretamente do terminal-âncora, herdando o contexto confirmado. Desenvolvimento continua externo; isso não exige que o código esteja na pasta do workspace Maestri. Ambas as formas usam o mesmo adapter, não duas implementações.

Não fornecer endereço de pipe constante nem autorizar adotar qualquer terminal que `list` encontrar. Não há prova nesta elaboração de daemon externo sem identidade de terminal: o contrato é vínculo explícito à âncora. Antes do aceite, exercitar controlador iniciado por IDE + attach real.

### 2.3 Diagnóstico de conexão

Em erro de CLI/pipe, executar `maestri debug` antes de presumir erro do provider. Distinguir:

- binário ausente ou desatualizado;
- pipe stale ou daemon ausente;
- terminal de origem desconhecido;
- capacidade Maestro indisponível;
- Windows integrity/elevation/RestrictedToken incompatíveis;
- conta diferente entre controlador, launcher e terminal;
- bootstrap não legível.

`debug` mostra PATH, dados de token Windows e pipe: guardar versão sanitizada, não despejar output bruto em log público. Não alterar ACLs da instalação Maestri ou do pipe para contornar erro. Reabrir âncora na mesma conta/nível normal e vincular novamente quando esse for o diagnóstico. Uma nova tentativa não precisa de vínculo novo se o atual continua válido.

### 2.4 Comandos existentes observados

Exemplos de leitura, não autorização de efeitos. Executar pela resolução do binário vivo:

```powershell
& $env:MAESTRI_CLI --version
& $env:MAESTRI_CLI debug
& $env:MAESTRI_CLI list
& $env:MAESTRI_CLI preset list
& $env:MAESTRI_CLI recruit --help
omp --help
```

No host observado, recruit aceita `Name`, `--preset`, `--role`, `--floor`, `--workspace`, `--command`, `--dir` e `--account`. Consultar ajuda da versão instalada; não adivinhar flags `--json`, IDs ou opções. `--account` documentado é para contas CLI Claude/Codex do Maestri, não escolha provider OMP; não usar como mecanismo de autenticação OMP.

Esqueleto do recrutamento, sem segredos/prompt longo:

```text
maestri recruit <nome-único> --preset <Shell-confirmado> --dir <clone-da-passagem> --command <launcher-curto>
```

`--dir` precisa existir. `--workspace`/`--floor` só se explicitamente configurados; início com apenas diretório não deve criar workspace/floor por conta própria. Primeiro adapter usa terminais no workspace da âncora e clones independentes da fábrica; não depende de floors para isolar Git.

## 3. Maestri: identidade, recrutamento e desmobilização

### 3.1 Não confundir saída CLI com runtime pronto

`recruit` retorna criação do terminal, não provider pronto. Antes de lançar, `list` confere colisão e `preset list` confirma Shell disponível. Não usar preset default que copia o agente do terminal-âncora; passar Shell explicitamente. Perfis de produto são despachados ao OMP, não exigem cadastrar papéis Maestri globais com `role write`.

Nome único inclui attemptId/passageId/papel, com comprimento razoável. Em revisão de correção, outra passagem tem outro nome; não sobrescrever mapa de terminais por papel. Maestri pode sufixar nomes colidentes: rejeitar identidade inesperada ou capturar a retornada com evidência, nunca assumir o nome solicitado por substring de stdout.

Fonte forte de identidade é handshake do supervisor lançado com token único, seu `MAESTRI_TERMINAL_ID`, cwd canônico, nonce de lançamento e recibo PID/criação confirmado pelo kernel. A confirmação CLI e list/check são dados complementares. Não adotar processos encontrados pelo nome.

Se a CLI não oferece JSON nessa versão, encapsular parsing em adapter versionado e testar com saídas reais preservadas/sanitizadas; não espalhar regex pela fábrica. Fonte inconclusiva resulta `creation_unknown`, conservando launch/resource record, sem segundo recruit cego.

### 3.2 Lifecycle de lançamento

Estados privados de recurso: `planned`, `preparing`, `recruiting`, `bootstrapping`, `ready`, `stopping`, `stopped`, `unknown`. Registrar resourceId e intenção antes de compilar/recrutar. Mesmo uma criação parcial pertence à tentativa.

Cancelamento precisa acompanhar todas as Promises de lançamento. Verificar sinal antes/depois de cada await; cancelar enquanto recruit está em voo não autoriza declarar cleanup antes de seu retorno. Se retornar terminal após cancelamento, registrar e encerrar pelo mesmo percurso. Se retorno continuar desconhecido, conservar diagnóstico, impedir resultados daquele token e não apagar launcher/recibos necessários.

Uma passagem operacional por papel/rodada; não permitir start simultâneo sobrescrever contexto de socket ou activePassage. Scheduler serializa transições; adapter protege lançamento/stop concorrentes. A UI pode continuar conversando livremente, mas não iniciar duas passagens sob o mesmo handle.

### 3.3 O papel de ask/check

- `check <nome-exato>`: observação do terminal/scrollback, não resultado oficial nem prova de parada.
- `ask <nome-exato> <texto>`: interação CLI complementar; não usar como canal oficial de tarefa/resultado se a extensão permite entrega correlacionada.
- `ask --raw`: interação sintética autorizada para smoke de TUI; Enter/Esc/menus não comprovam input de hardware físico.
- Timeout de ask não permite reenviar prompt: agente pode continuar. Consultar check/estado, não duplicar tarefa.
- Retorno de ask pode ser última tela/turno, não transcript inteiro. Não extrair aprovação por palavras ou procurar sentinela como resultado de negócio.

Operador usa a TUI diretamente; não precisa responder via ask ou navegar pelo painel para falar. Integração não sobrescreve o compositor ao enviar tarefa. Se versão do OMP não suportar mensagem estruturada sem substituir texto pendente, registrar incompatibilidade e aguardar, não apagar input.

### 3.4 Dismiss

Cancelar primeiro revoga efeitos da fábrica e encerra Jobs; dismiss remove somente terminais próprios confirmados e conectados à âncora. Dismiss também remove nó/conexões: não usar como troca de agente de recursos manuais.

Exit code/ausência em list não comprovam fim físico do processo. Kernel prova processo/job, CLI confirma estado do nó. Erro de dismiss mantém `terminal_cleanup_pending`, não apaga registro. Nenhum `taskkill /IM`, parada por nome ou cleanup de todos os Shells.

Terminais permanecem interativos após resultado enquanto aquela tentativa estiver aberta para interação; liberar worker de negócio não obriga apagar a superfície. Retenção é explícita: terminar interação/cancelar fecha recursos próprios; não terminar compositor imediatamente por ACK. Ambientes/review snapshots ficam independentemente do terminal. Recursos interativos retidos têm custo visível e dono definido, sem quantidade ilimitada silenciosa.

## 4. OMP normal e configuração efetiva

### 4.1 Lançamento

Resolver `omp.exe` nativo por caminho absoluto no host Windows. Prova identificou falha ao supor `omp.cmd` e usar shell string com quoting de prompt. Preferir argv para EXE; não `shell:true` universal.

OMP operacional herda stdin/stdout/stderr do terminal/ConPTY. Controlador não pipe-a seu stdin, não captura transcript como saída oficial e não substitui TUI por print ou rpc-ui. CLI observada aceita modo interativo com argumento mensagem; `-p` é print não interativo, `--no-ui` pertence a rpc/rpc-ui, não combinar para "TUI headless".

Prompt grande entregue em arquivo UTF-8 de tarefa em área privada da tentativa e referenciado por `@arquivo` quando suportado/comprovado, ou via `pi.sendUserMessage` após readiness. Escolher uma via canônica e provar que prompt completo foi consumido; não mandar multipart no terminal esperando colagem funcionar. Nunca incluir segredo do canal no prompt. Inicialização não inicia tarefa duas vezes por argumento + mensagem pós-ready.

Comando ilustrativo (executar somente na prova autorizada):

```text
<omp.exe> --cwd <clone> --model <provider/model-id-exato> --thinking <effort-ou-off> --no-prewalk --no-extensions --config <overlay> -e <extensão-da-fábrica> @<tarefa>
```

Args devem ser consultados na ajuda instalada. `--no-extensions` desabilita descoberta externa, mas explicit `-e` funciona na versão observada. **Não usar --no-tools, --no-lsp, --no-skills ou --no-rules como padrão restritivo para contornar integração.** Ferramentas normais de leitura/escrita/edição/shell continuam habilitadas; instruções legítimas de projeto continuam disponíveis. Browser nativo OMP, se presente, não é superfície de aceite UI: critérios visuais usam Playwright MCP/Chrome.

### 4.2 Política mínima, sem copiar o overlay antigo

Overlay por passagem é arquivo privado, sem modificar `~/.omp`, projeto ou `process.env` global. Deve:

- impedir auto-resume inicial para não herdar conversa de outra tentativa;
- fixar escolha inicial provider/modelo/esforço, sem model fallback ou troca automática prewalk;
- resolver MCPs conforme contrato explícito abaixo;
- carregar somente extensão de coordenação e extensões adicionais explicitamente aprovadas no projeto;
- não desativar compositor, comandos, anexos ou novas mensagens;
- não impor a lista inteira antiga de disabledProviders/retries/cache/memória/advisor como requisito da fábrica.

Opções internas de config devem ser obtidas do schema/SDK da versão instalada e testadas por efeito. `--no-tools` e `--no-extensions` isoladamente não impediram MCP do checkout no código atual. `mcp.enableProjectConfig=false` foi workaround comprovado, não desculpa para remover `.omp/mcp.json` do produto. Configurar somente o que a fábrica de fato governa.

Credenciais provider já existentes são utilizadas pelo contexto autorizado; não login automático, export/import de tokens ou `--api-key` na linha de comando. Sessões podem continuar com comportamento nativo de histórico; a fábrica não promete que OMP não persiste conversas/cache. Nova passagem deve começar sessão independente quando exigido, mesmo que o runtime global tenha auto-resume. Conversa não é fonte durável do resultado da fábrica.

### 4.3 Provider/modelo/esforço

`provider`, `modelId` e `effort` são campos explícitos; produzir identificador `provider/modelId` sem fuzzy match abreviado. O provider do perfil não pode ser ignorado como aconteceu no protótipo. Modelo sem reasoning usa off e valida estado efetivo compatível. Não inventar modelos/esforços quando catálogo indisponível nem substituir papel por modelo padrão.

Readiness contém contexto OMP efetivo: provider/id/esforço, session identity, cwd, extensão/schemaVersion e tools necessárias. Conferir antes do primeiro prompt e quando runtime informa troca. `configurationDelivered:true` ou argv correto não prova configuração efetiva; resposta do provider sozinha não prova qual modelo foi usado.

Catálogo local não comprova autenticação nem suporte end-to-end. Falha provider tem diagnóstico separado de tools, pipe ou bootstrap. Não executar provider só para ler catálogo. APIs efetivas de runtime precisam ser consultadas no SDK OMP disponível; a spec não presume que `get_state` RPC exista igual na extensão TUI.

### 4.4 Interação livre e acompanhamento

Registrar eventos suportados como input/tool/session/shutdown sem devolver handlers que bloqueiem o comportamento normal. Usuário pode conversar durante tools, após resultado e pergunta humana. Não portar `resultPending` como bloqueio de input; não descartar mensagem nova para aprovar resultado antigo. Snapshot de entrega e publicação privada resolvem a disputa de conteúdo.

Troca `/new`, resume, modelo, contexto ou fechamento do processo pode romper vínculo. Observar evento suportado ou perda do processo/canal; marcar tracking-lost e suspender coordenação daquele handle, sem recusar comando ao usuário. Eventos antigos não aprovam passagem nova. Se versão não expõe determinado evento, listar limite da capacidade e usar prova efetiva de estado quando disponível; não alegar observar tudo.

Aprovação histórica continua ligada ao snapshot imutável. Após tracking-lost, histórico permanece, mas autorização automática de publicar agora exige revalidação explícita. Outro runtime/terminal não herda o token/session daquela passagem. Perguntas pendentes conservam opção Cancelar/nova tentativa; não ficam sem saída se terminal foi fechado.

## 5. Extensão, protocolo e durabilidade

### 5.1 Código e seam

Uma implementação da extensão TypeScript compilada para JS, usada pelo OMP e importada pelos testes de contrato; sem JS runtime paralelo divergente de TS. Extensão adapter-specific não contém SQL, GH ou regras da esteira. Bridge externa encaminha decisões de negócio ao pipeline/storage.

Handshake local por passagem, com segredo aleatório forte e token de uso único para bootstrap; listener loopback, nunca público. Autenticar nonce, attempt/passage/role e identidade do processo/sessão como dado privado. Segredo é diferente por passagem, não reutilizado globalmente entre Implementador e Revisor. Socket autenticado fica vinculado àquele contexto; comparar frame com contexto não basta se um socket antigo puder anunciar o passageId novo. Broadcast deve ser para socket do handle, não todos os autenticados.

`execution_complete` e `execution_question` são registradas por extensão com schemas versionados. IDs privados não entram nos argumentos públicos do modelo; a extensão os acrescenta. Agente corrige payload recusado na mesma passagem; não transformar schema inválido em falha terminal. Botão/pergunta do operador usa a mesma interface de resposta, sem parser de conversa.

### 5.2 Envelopes propostos

```text
{ protocolVersion, type, attemptId, passageId, sequence, operationId?, payload }
```

- auth/ready: handshake e estado efetivo; auth segredo só no canal privado.
- result: resultado estruturado específico do papel.
- result-ack: accepted, receiptId, operationId e erro tipado quando negativo.
- question/question-ack: pergunta e ID registrado.
- human-answer/human-answer-ack: decisão à mesma passagem, recibo de entrega.
- progress/tracking-lost/cleanup: fatos observáveis, sem autoridade por texto.

Storage aceita resultado atomicamente antes do ACK. Dedupe por operationId+passage; repetição igual retorna o mesmo recibo. Consulta de recibo é suportada: ACK perdido não leva agente/controlador a gerar outra entrega. Conflito, stale, waiting-for-human e invalid-schema são diferentes. Resultado que chegou antes do consumidor deve permanecer recuperável; timeout remove listeners/timers, não esquece resultado durável.

Pergunta humana registrada antes de ACK; resposta registrada como intenção e depois como entrega confirmada. `pi.sendUserMessage` observado na prova permite encaminhamento, mas resolved Promise é no máximo aceitação/enfileiramento do runtime, não prova de leitura/compreensão humana pelo modelo. Controller libera pausa após ACK correspondente; agente deve consumir decisão antes de resultado. Entrega conhecida como não iniciada permite nova ação; efeito desconhecido exige consulta/reconciliação, sem reenviar automaticamente.

### 5.3 Framing obrigatório

TCP e pipes são streams de bytes, não mensagens. Usar decodificação UTF-8 incremental (`StringDecoder`/decoder streaming) ou acumular bytes até newline antes de decodificar. Não executar `chunk.toString('utf8')` por chunk: a revisão reproduziu `ação` como `a��ão` quando ç cruzou a fronteira.

Protocolos separados:

- Controle privado JSONL da fábrica: envelopes acima, não CLI RPC OMP nem JSON-RPC MCP.
- MCP STDIO: JSON-RPC do protocolo MCP negociado.
- Terminal: input/output nativos, nunca parser de resultado de negócio.

Limites iniciais recomendados: frame de controle 1 MiB, fila bounded por 256 mensagens; payload maior usa artifact reference, sem truncamento silencioso. MCP pode admitir limite maior documentado (16 MiB inicialmente) para imagens, com backpressure e arquivos externos. Limites são medidos em bytes. Se fragmentação for necessária, definir versionamento/índices/tamanho/hash; não portar framing de 64 MiB como pretexto para enviar prompt inteiro pelo socket.

Malformed, oversize, correlação errada, EOF parcial e erro JSON devem resolver/rejeitar esperas com diagnóstico, não ser ignorados para sempre. `error` de listener bind deve rejeitar start e fechar recursos. Socket close rejeita pending operations. Timers são removidos em sucesso/erro/cancel e start repetido não deixa listeners duplicados. Não usar timeout de um estágio como prazo de vida da fixture inteira.

## 6. MCPs: resolução conectada ao runtime

### 6.1 Fontes por nome

Resolver server name em ordem:

1. configuração do projeto no clone da tentativa (`.omp/mcp.json` quando formato OMP);
2. configurações adicionais do projeto explicitamente registradas, não parent traversal acidental no diretório de clones;
3. configuração OMP do operador (`~/.omp/agent/mcp.json` ou caminho selecionado);
4. configuração da fábrica.

Arquivo sem aquele servidor não encerra busca. Primeiro cadastro, inclusive disabled=true/enabled=false, prevalece; inválido não vira fallback silencioso. JSON malformado na fonte consultada exige diagnóstico com arquivo/origem, não ignorar como se estivesse vazio. Campo OMP é `mcpServers`, com type/command/args/env; não inventar formato `servers` e provar só helper com objeto simulado.

Configuração executável mantém valores originais em memória/área privada. Representação para UI/logs é sanitizada separadamente; nunca lançar subprocesso com `***REDACTED***` no lugar de token. Não gravar segredos resolvidos em attempt snapshots. Armazenar nome/origem/schema e hashes de configuração sem conteúdo secreto.

Incluir executável absoluto, argv e env explícitos. Não passar env da fábrica com tokens GH a todo MCP por conveniência. Servidor que precisa de segredo recebe somente os valores configurados/autorizados. Ambiente do OMP de provider é escolha separada do ambiente de servidor MCP.

### 6.2 Como chegar às tools do agente

Usar **um** caminho de integração por tool/server:

- MCP nativo OMP quando versão permitir configurar fontes explícitas, controlar lifecycle e provar ownership; ou
- bridge hospedada pela extensão/fábrica, que expõe tools e conteúdos MCP ao agente quando o caminho nativo não satisfizer esses requisitos.

Escolha recomendada inicial: bridge hospedada para Playwright/GitNexus, com servidores próprios e schema discovery; preservar tools nativas de edição/shell OMP. Não instalar os mesmos servidores também via descoberta automática no runtime: ferramentas duplicadas criam destinos/capacidades diferentes.

Controlador gera overlay coerente para impedir somente descoberta MCP paralela não governada (`mcp.enableProjectConfig=false` onde comprovado) e manter o resto do OMP normal. Se precisar excluir global MCP, consultar schema/SDK efetivo: desligar discovery do projeto não prova ausência de servidores globais. Readiness lista tools efetivas/namespaces para detectar duplicação.

A bridge deve descobrir schemas, registrar tools no runtime e devolver conteúdos de texto/imagem/resource sem reempacotar como sucesso vazio. Nomes com namespace estável; modelo chama schema real. Um registro fixo `mcp_call({name,argumentsJson})` é alternativa apenas se limitação do SDK/provider impedir schema dinâmico: validar JSON como objeto e explicar descoberta antes de uso. Não exigir string JSON por hábito do adapter antigo.

Falta de servidor obrigatório aparece antes de gastar implementação, quando possível. Tool opcional ausente não falha todo o projeto; as capacidades exigidas pelos critérios/checks determinam necessidade. Configuração presente, tools/list e uma chamada real são evidências diferentes. Não declarar MCP integrado porque helper retorna configuração.

### 6.3 Sessão MCP e encerramento

Protocolo: `initialize` com capacidades/versão suportada, conferir versão retornada, `notifications/initialized`, `tools/list` paginado quando aplicável e chamadas correlacionadas. Não congelar protocolVersion='2024-11-05' como único suporte de qualquer servidor futuro. Cliente anuncia capacidades reais; métodos client-side não suportados recebem erro específico.

Reconhecer erro JSON-RPC e `isError` em `tools/call`. Objeto `result` presente não significa consulta GitNexus válida. Argumentos errados retornam diagnóstico recuperável; ferramenta com efeitos desconhecidos não é reenviada por timeout. Um servidor encerrou antes do initialize/tools/list? Rejeitar Promise imediatamente; não limpar timer e deixar Promise pendente como na revisão do protótipo.

Prazo de startup, chamada e teardown separados; cancel sinalizado a todas as esperas. Stderr sanitizado e bounded separado de stdout protocolo, não DEVNULL que esconde a causa nem stdout misturado com logs. Não executar `shell:true` genérico; EXE via argv, CMD/BAT via tratamento Windows abaixo. Todos os servidores do adapter e descendentes têm ownership do passage resource group.

Preferir cliente MCP consolidado compatível na nova stack em vez de vários loops JSON-RPC duplicados, sem delegar prova de cleanup ao cliente. SDK não garante Job containment. Registrar versão do cliente/servidor, origin config, capabilities e erro por operationId.

### 6.4 Playwright MCP/Chrome

- Somente servidor Playwright MCP configurado para Google Chrome. Sem Portal Maestri, browser nativo OMP, Python Playwright, CDP/extension do navegador do operador ou perfil compartilhado como prova de UI.
- `--browser=chrome`, `--headless`, `--isolated` e capacidades necessárias são conferidos na ajuda do servidor instalado.
- Artifacts externos ao clone por `--output-dir` quando suportado; não inventar `--artifacts-dir` a partir de helper não exercitado. Perfil dedicado quando isolated não for suportado; não user-data-dir do operador.
- `file://` somente autorizado quando necessário, flag suportada conferida; unrestricted file access não é sandbox de arquivos.
- Ferramentas variam por versão: `browser_run_code_unsafe` observado não equivale a `browser_run_code`; consultar schema, não adivinhar `ref` versus `target`.
- Imagens/ações reais: navegar em página local autorizada, verificar conteúdo esperado, viewport desktop/mobile, foco/teclado, screenshot e fechamento. Non-empty screenshot pode ser tela de erro: conferir URL/conteúdo e resultado `isError`.
- Close browser e Job antes de remover perfil/artefatos temporários. Screenshot de fixture não comprova PR/provider/GitHub. Sem revalidar o novo supervisor, imagens históricas não certificam seu lifecycle.
- Não usar `@latest` sem lock/version manifest no produto: baseline observado na prova é referência; atualizar version deliberadamente com compatibilidade/regressão.

### 6.5 GitNexus

Preparar índice do clone pertinente, conferindo raiz exata registrada. Dois índices `aula-ia` de checkouts diferentes já causaram ambiguidade; nome não é identidade. Ler list_repos paginado e siblings quando disponíveis; escolher por path canônico, respeitando case sensitivity do SO. Não lowercase incondicional em qualquer plataforma.

Adapter injeta repo pela raiz pertinente e worktree em detect_changes; agentes não escolhem outra raiz por prompt. Resource URIs codificam caminho/nome conforme schema servido. Consulta de impacto antes de editar segue contratos do projeto quando exigido; falta de índice gera diagnóstico/preparo explícito, não fallback ao checkout operacional.

Índice fica em artefatos locais/ignored e não entra no snapshot de produto. Não registrar index da pasta do operador para fingir o sucesso do clone. `analyze` pode injetar arquivos de contexto: usar modo `--index-only` se disponível e comprovado, ou configurar indexação externa sem escrita no produto. `--repair-fts` é reparo a um erro específico, não retry automático padrão. Nunca presumir `.gitnexus/run.cjs` no clone; usar runner da instalação novo produto, não caminho `C:/Users/jeffe/...`.

Ferramentas/recursos reais e erro MCP são conferidos. Consultar target existente e observar caller/processo esperado no fixture, não apenas verificar que há campo result. Se rename for habilitado ao Implementador, sua mutação pertence ao clone e entra no snapshot novo; Revisor não deve corrigir produto para aprovar. Não copiar restrição preview-only como necessidade universal do terminal livre; decisão depende do papel, não do transporte antigo.

### 6.6 GH CLI e tools Maestri necessárias

Acesso GitHub do agente é leitura hospedada no controlador, com URL vinculada à tentativa. Fornecer issue/body/comments/criteria através do contexto e tool read-only; não comandos GH livres com token do publisher. Tools Maestri operacionais da fábrica não são capabilities de negócio do agente: criação/dismiss ficam no adapter. Caso critérios exijam uso Maestri em um produto, configurar capacidade específica e escopo explicitamente, não distribuir contexto Maestro global a toda task.

Na implementação antiga, `gh issue view` dentro de cópia isolada retornava código 4 apesar de auth no supervisor. Não repetir login naquele ambiente nem mover credenciais ao prompt; diagnóstico tem de nomear processo/identidade/ambiente que possui acesso. CLI `gh` do publisher roda como operador com autenticação confirmada (`gh api user`), stdin fechado quando não usado e output estruturado. Não `gh auth token` para log. Consultas/mutações são separadas; agentes não autoatribuem issues nem movem cards.

Terminal comum pode ainda acessar credenciais em arquivos do operador ou credential helper Git: retirar GH_TOKEN do env não é sandbox. Documentar esse limite; não tentar revogar configuração global do usuário para fazer teste passar. A fábrica não adiciona credenciais de publicação ao runtime, e seu publisher não aceita resultado antigo, mas não controla toda ação manual externa.

## 7. Windows: quoting, stdio, Jobs e diagnóstico

### 7.1 Três linguagens diferentes de comando

1. EXE nativo: `spawn/execFile(executable,args)` com shell false; quoting CRT tratado pela biblioteca/helper nativo.
2. CMD/BAT (npx.cmd/npm.cmd): `cmd.exe /d /s /c` com gramática CMD, não simples concatenação de argv nem CRT escaping reutilizado cegamente.
3. Shell inicial Maestri: command string entregue a shell do preset confirmado. Launcher PowerShell curto pode usar `-EncodedCommand` UTF-16LE para quoting, não criptografia nem proteção de segredo.

Prova encontrou `%~dp0` resolvido para workdir em vez da instalação ao quote-ar wrapper incorretamente; npx procurou npm-prefix.js/npx-cli.js no clone. Regressão exige caminho de instalação com espaços, cwd distinto, argumentos com espaços/aspas/Unicode e preservação de `%~dp0`. Metacaracteres de entrada devem ser argumentos validados, nunca interpolados em exec shell. Nome/projeto/caminho não são scripts.

Payload grande/segredo em arquivo privado; linha de comando carrega só path/ID não sensível. Não depender de limite da linha Windows para contrato e contexto da issue.

### 7.2 Stdin e TUI

TUI: herdar handles válidos do terminal. Diagnostic/CLI sem interação: stdin DEVNULL/ignore ou fechar pipe após enviar o payload previsto. OMP aguardou EOF de piped input no protótipo: nunca manter stdin pipe aberto por acidente e chamar isso de provider timeout. MCP: stdin permanece aberto como canal JSON-RPC; não aplicar EOF de print a ele.

Stdout/stderr protocolados separados, tamanho/prios limitados, cancel próprio. Comando checks pertence ao clone/snapshot e cwd relativo explícito. Não copiar a estratégia antiga de duplicar worktree para todo bash: já existe clone de tentativa. Isso não autoriza comandos externos/destrutivos ou publicação pelo agente.

### 7.3 Supervisor Windows

Construir helper mínimo versionado com protocolo estável, privado ao módulo execution. Compilar/packagear de modo reproduzível na instalação/CI; não compilar C# a cada passagem em produção. A prova usou PowerShell/.NET Framework Add-Type/System.Web.Extensions: isso é baseline útil, não dependência obrigatória se helper empacotado evita esse custo.

Responsabilidades comprováveis:

- criação do processo suspenso;
- associação a Job Object próprio com KILL_ON_JOB_CLOSE, sem breakaway;
- registrar handle/PID/criação do processo pelo kernel antes de retomar;
- herdar console/ConPTY corretamente;
- admitir stdin/argv/env/cwd previstos;
- parar pelo handle de Job, esperar active process count zero;
- recibo com resourceId, creationTime, job identity, callback/reader shutdown e diagnóstico.

Supervisor é dono do handle, não o controlador por PID. IPC stop autenticado usa o supervisor vivo; após crash, KILL_ON_JOB_CLOSE é contenção útil, mas não basta como recibo de cleanup sem observar os fatos. Não abrir Job pelo nome e presumir ownership exclusivo: nomes podem ser reutilizados. Identidade/names são para observação; toda parada exige vínculo ao recurso criado/handle confirmado, nunca o nome arbitrário recebido da UI.

Helper da prova usa OpenJobObject em stop e job name aleatório: no produto, não promover isso a garantia contra reutilização ou processos do mesmo usuário. Preferir canal de supervisor que mantém handle; se recovery precisar reabrir identidade, estabelecer comprovação e recusar ambiguidade. Manter processos próprios antigos contidos e publicação revogada; não tornar recuperação bloqueante para checkout novo isolado.

Contém filhos comuns CreateProcess, inclusive detached e órfãos. Não contém criação delegada a WMI/serviços/brokers, nem dá filesystem/network sandbox. OMP pode lançar ferramentas em brokers/daemons externos; listar essas capacidades e não declarar zero recursos globais a partir de Job count zero. Evitar runtime que delegue efeitos de trabalho não acompanháveis sem explicitar esse limite.

### 7.4 Receipts e cleanup

Resultado de cancel tem estados de continuidade e cleanup distintos. Sucesso físico exige root/descendentes próprios encerrados e callbacks/readers sem pendência. EOF, isSettled, retorno de CLI, list vazio ou timeout não são prova. Dismiss do canvas é outra confirmação.

Preservar launch/resource record quando parada/consulta/removal falham; nenhum receipt synthetic success. Arquivo launcher/config só removido quando não será necessário para diagnóstico e recursos encerraram; secret pode ser revogado imediatamente. Não remover clone em finally se writer ainda está vivo. Cleanup failure tem saída de erro independente de task success.

Novo attempt pode usar outro ambiente após revogação e isolamento conhecido, sem exigir operador olhar PIDs. Recursos antigos aparecem em diagnóstico da própria tentativa, com ação de encerramento autenticada quando possível. Não matar recursos manuais conhecidos apenas pelo mesmo nome/programa.

## 8. Taxonomia de falhas e efeitos

Contrato tipado recomendado:

```text
OperationOutcome =
  completed(receipt)
  notStarted(code, nextAction)
  failedKnown(code, knownEffects, recoverable, nextAction)
  unknown(code, operationId, reconciliation)
```

Separar domínio: invalid-arguments, missing-capability, authentication, connectivity, execution-failure, cancelled, tracking-lost, storage-failure e effect-unknown. Mensagens humanizadas são apresentação, não switch pelo texto da exception. Não copiar whitelist gigante de códigos que classifica tudo fora dela como escrita incerta.

| Ocorrência | Consequência |
| --- | --- |
| Args/schema inválidos antes de execução | NotStarted, corrigível pelo agente |
| GH leitura negada/código 4 | Falha de auth/acesso conhecida, sem alegar mutação |
| MCP encerrou antes de initialize | Falha de startup com cleanup do processo próprio |
| Read-only query timeout | Consulta não confirmada, não escrita de produto presumida |
| Escritura/push/PR enviados sem confirmação | Unknown, consultar recibo/efeito antes de repetir |
| Provider erro depois de files escritos | FailedKnown/Unknown conforme evidência; arquivos preservados |
| Banco falhou antes de intenção | Não iniciar efeito |
| Banco falhou após efeito | Efeito conservado/unknown, sem ACK falso |
| Cancel durante recruit | Revogação imediata, cleanup inclui retorno tardio |
| UTF-8/frame inválido | Erro de transporte explícito, sem continuar com texto adulterado |

Retry automático só para leituras sem efeito e com limite/backoff declarado. Não fallback de modelo/browser/checkout, login ou correção global de permissões. Uma falha conhecida não cancela todas as tentativas; ação depende do módulo/efeito.

## 9. Workarounds: rastreabilidade e decisão de portar

| ID | Evidência no produto/prova | Decisão nova |
| --- | --- | --- |
| W-01 | CLI disponível mas pipe/contexto ausente | Attach explícito à âncora, debug primeiro |
| W-02 | Bootstrap de outra conta não lido pelo Shell | Mesma conta/nível, ACL privada confirmada; sem ampliar ACL global |
| W-03 | Shell: true/omp.cmd e stdin pipe geraram travas | EXE direto, TUI inherit, EOF apenas nos modos pertinentes |
| W-04 | CMD wrapper npx com prefixo incorreto | Quoting CMD distinto de CRT, regressão por %~dp0 |
| W-05 | Flags no-tools/no-extensions não suprimem todos MCPs | Resolver por nome, overlay específico e tools efetivas |
| W-06 | Arquivo local sem Playwright oculta configuração posterior | Busca por servidor, não primeiro arquivo existente |
| W-07 | Sanitização altera env executável | DTO de log separado da configuração privada |
| W-08 | Provider selecionado ignorado/fuzzy model | ID provider/model e confirmação efetiva |
| W-09 | Schemas/ref/target variam | Tools/list real e schema validation; sem parâmetros presumidos |
| W-10 | GH disponível em supervisor e não no shell | Leitura hospedada, publisher separado |
| W-11 | Índices GitNexus homônimos/FTS stale | Raiz exata, prep índice isolated, reparo só específico |
| W-12 | ACK falso/resultado chega antes do consumidor | Persistência antes do ACK, consulta por receipt e resultado durável |
| W-13 | Mensagens durante conclusão/apos result foram bloqueadas | Terminal livre; snapshot e publisher privado substituem bloqueio |
| W-14 | Mudança posterior/rename/índice escapam HEAD hash | Manifesto completo e snapshot imutável; Git -z |
| W-15 | Close MCP limpa timer mas Promise pendente | Terminal transitions rejeitam todas as esperas |
| W-16 | TCP chunks quebram ç/emoji | Decodificação streaming em ambos os sentidos |
| W-17 | Cancel termina antes de recruit registrar resource | Ownership planejado + cancel de lançamentos pendentes |
| W-18 | PID/nome/TUI ociosa não provam parada | Job/handles/creationTime/recibos físicos; não taskkill por descoberta |
| W-19 | Scripts curtos morrem no meio da UI/teardown duplicado | Readiness e prazos separados; lifecycle único de fixture |
| W-20 | Server novo na mesma raiz/porta diferente usa mesmo banco | Data dir explícito de teste e identidade independente de porta |

A solução antiga para proteger checkout dirty por consentimento de cada arquivo não será portada: ambientes separados eliminam essa classe do percurso principal. A política antiga de `execution_block` com autorização também não será portada: pergunta estruturada e classificação de erro substituem a saída genérica, preservando liberdade de conversa.

## 10. Critérios de integração real

| ID | Exercício | Evidência obrigatória |
| --- | --- | --- |
| INT-01 | Controlador iniciado fora do Maestri + attach | Ambiente confirmado, âncora/Maestro e CLI no contexto real; nenhum terminal manual adotado |
| INT-02 | Pipe stale/elevation/conta errada | Diagnóstico correto antes de provider; sem mudança ACL/segredo global |
| INT-03 | Recruit de Implementador/Revisor | ID/cwd/supervisor confirmados, runtime único por passagem, readiness efetiva |
| INT-04 | Provider/model/esforço exatos | Escolha preservada e divergência observada, sem fallback |
| INT-05 | TUI livre | Mensagens durante tool, pergunta, confirmação e após resultado chegam; comandos nativos não bloqueados pela fábrica |
| INT-06 | Resultado | ACK só após banco; inválido corrigível, conflito/stale recusados, resultado precoce recuperável |
| INT-07 | Pergunta e resposta | Decisão correlacionada à mesma sessão; entrega incerta não duplica; conversa livre |
| INT-08 | Troca/fechamento manual | Tracking lost real no meio do trabalho; eventos tardios não aprovam nova passagem |
| INT-09 | MCP config real | Fonte posterior sem ocultação, disabled prevalece, segredos funcionam sem log, runtime usa resolução |
| INT-10 | MCP erro recuperável | Agente usa schema real, chamada inválida é corrigida e operação real conclui |
| INT-11 | Chrome | Navegação/conteúdo/screenshot/foco reais com MCP/Chrome próprio; teardown do browser e servidor |
| INT-12 | GitNexus | Índice do clone exato, query/impact com caller esperado, homônimo recusado por caminho |
| INT-13 | Transportes | UTF-8 split, mensagens concatenadas/parciais, oversize, EOF/bind error e correlação, sem hangs |
| INT-14 | Windows wrappers | EXE/paths com espaços, CRT/CMD, %~dp0, argv/prompt grande, TUI inherit e stdin diagnóstico |
| INT-15 | Cancelamento | Durante compile/recruit/ready/tool/check; late resource encerrado, zero workers quando alegado |
| INT-16 | Orphans/resources manuais | Descendentes comuns contidos, externo intacto, failure receipt sem apagar clone |
| INT-17 | Nova tentativa após falha real | Novo clone/runtime/resultados, sem reset global ou segundo ciclo só simulado |
| INT-18 | Publisher | Snapshot revisado publicado com chats livres, modificação posterior não incorporada |

Suíte local não executa native runner de forma implícita em `npm test`: opt-ins separados e autorização de custo/terminais. Scripts e schemas reais versionados; cada smoke tem own-resource inventory, readiness e cleanup, artefatos externos. Relatório informa modalidade/versões/efeitos/limites. Readiness e tools/list não substituem chamada provider/browser/index.

## 11. Referências e evidência desta elaboração

Fontes locais de referência:

- [team_runtime.py](../../../painel/team_runtime.py) e [team_worker.py](../../../painel/team_worker.py): bootstrap, identidade e canal de controle separado.
- [omp_tui.py](../../../painel/omp_tui.py) e [omp_rpc.py](../../../painel/omp_rpc.py): TUI/diagnóstico e efeito dos overlays.
- [mcp_stdio.py](../../../painel/mcp_stdio.py), [playwright_mcp.py](../../../painel/playwright_mcp.py), [gitnexus_mcp.py](../../../painel/gitnexus_mcp.py): configuração/transporte/escopo.
- [github_issue_read.py](../../../painel/github_issue_read.py), [owned_processes.py](../../../painel/owned_processes.py): leitura hospedada e comprovação OS.
- [Spec da prova #96](../prova-tecnica-maestri-omp.md) e [issue #96](https://github.com/vonderheidon/aula-ia/issues/96): contrato e relatos nativos; fontes do protótipo revisadas no diretório informado pelo operador, sem depender de sua localização na implementação nova.

Referências primárias para quem implementar, conferir contra versões instaladas:

- Maestri: ajuda de `maestri --help`, `maestri recruit --help` e `maestri debug` da instalação vinculada. Não há endpoint externo público confirmado nesta elaboração; não inventar uma API de daemon.
- [OMP upstream](https://github.com/can1357/oh-my-pi): CLI, schema MCP/config e API de extensões da versão escolhida.
- [MCP lifecycle 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle): baseline STDIO observado; [specification atual](https://modelcontextprotocol.io/specification) pode definir contratos diferentes. Pin cliente/servidor/protocolo compatíveis; não misturar o handshake stateful de uma versão com requisitos de outra.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp): flags/capabilities/schemas efetivos.
- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw): contenção/criação/handles.
- [Node 24 child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Node 24 StringDecoder](https://nodejs.org/docs/latest-v24.x/api/string_decoder.html): subprocessos e UTF-8 incremental. Decoder incremental conserva caracteres fragmentados, mas UTF-8 inválido deve ser detectado/rejeitado pelo framing, não aceito como texto com substituições.
- [GH CLI](https://cli.github.com/manual/): comandos, autenticação e operações de Project/issue/PR.

Nesta elaboração foram executadas ajudas OMP/Maestri, preset list, list e debug no contexto atual, além de smoke Node 24 de UTF-8 fragmentado byte a byte e argv nativo com português/emoji, ambos preservados. Links locais, code fences e IDs das matrizes foram verificados. O debug confirmou CLI viva/pipe acessível/conta normal; não prova attach externo, provider novo, MCP real nesta revisão ou publicação. Valores privados daquele diagnóstico não foram copiados para esta spec. Regressões locais identificadas na análise anterior do protótipo são exigências de prevenção; não alegar que o protótipo foi corrigido por este documento.
