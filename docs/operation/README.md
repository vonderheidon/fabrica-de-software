# Operação local

Este manual cobre instalação, configuração, execução e recuperação. Consulte o [README](../../README.md) para os comandos principais. O pacote não transporta configuração pessoal, projetos, credenciais ou skills do autor.

## Preparar e distribuir

No repositório canônico, com Node **24.x**, dependências do lockfile já instaladas e autorização para os comandos locais:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --reporter=dot --no-color
npm.cmd run package:local
npm.cmd run test:distribution
```

`package:local` executa o build configurado e gera uma pasta nova `build/Fábrica distribuição-<id>`. Ela contém `dist/` (controlador, contratos compilados, cliente, migrations, papéis e templates), `scripts/start-host.mjs`, manifesto/lockfile, dependências **de produção** instaladas, exemplo de ambiente e este manual. Não inclui `.env`, banco, WAL/SHM, `work`, armazenamento Git operacional, caches, skills ou fontes do workspace. Uma falha conserva o pacote parcial; não o distribua. O smoke cria outra instalação de teste em `build` com dados próprios em `var/factory` e cwd em `.cache`, sem alterar a instalação operacional.

Transfira a pasta completa para a instalação de destino. Node, Git, GH, Maestri e OMP são pré-requisitos externos normais. As dependências nativas empacotadas correspondem ao SO, arquitetura e ABI indicados em `distribution.json`; use Windows/arquitetura compatíveis e Node 24. Não anunciar um binário universal ou executar instalação global de ferramentas. Um pacote para outra plataforma precisa ser preparado e validado nessa plataforma. Não é necessário compilar TypeScript ou instalar skills no destino.

O smoke portátil usa HTTP e SQLite nativos em uma raiz com espaços/Unicode e cwd independente. Seu pré-voo Maestri é **controlado** por composição de teste; isso não prova acesso ao Maestri, TUI, provider, MCP, Git ou GitHub reais. Não existe flag de produção para selecionar essa composição.

## Terminal-âncora e bootstrap

Abra um terminal normal **dentro do Maestri** no contexto autorizado do Windows. Não importe variáveis de outro terminal nem invente `MAESTRI_PIPE`, terminal ou workspace. O launcher não exige caminhos absolutos: ele pesquisa Git, Maestri, OMP, PowerShell e GitHub CLI no host atual e revalida os candidatos. Versões encontradas não provam conexão Maestri nem acesso ao keyring. Se houver mais de um candidato válido sem preferência salva, Configuração apresenta a ambiguidade e permite localizar o executável. CMD/BAT/PS1 não substituem os executáveis nativos esperados pelo adapter.

Exemplo a adaptar aos executáveis do host, sem caminhos pessoais fixados pelo produto:

```powershell
$installationDirectory = 'D:\Aplicações\Fábrica local'
Set-Location -LiteralPath $installationDirectory
npm.cmd start
```

Alternativamente, após criar um `.env` **local** contendo somente as cinco opções de `.env.example`, use o carregamento nativo do Node:

```powershell
node --env-file=.env scripts/start-host.mjs
```

`GET /api/v1/settings/tool-options` revalida candidatos locais para as cinco ferramentas. Git, Maestri, OMP e PowerShell guardam caminho preferido e instante da validação em `tool_preferences_json`; o GitHub CLI continua usando somente `gh_executable_path`. Preferências não são capacidades: a conexão Maestri aparece separada, e a leitura não cria acesso ao keyring nem eleva o processo. A fábrica abre a UI mesmo quando uma ferramenta falta; início, Git local e outras ações dependentes seguem bloqueados até a ferramenta necessária estar disponível. Salvar uma escolha de executável valida novamente seu caminho; no próximo início o launcher revalida a preferência e usa a máquina atual.

A validação usa comandos de versão fixos, sem shell, e guarda somente caminho, versão e código diagnóstico. A descoberta do GH CLI considera o caminho salvo antes dos demais candidatos, `PATH` e `GH_PATH`, e exige sucesso de `gh --version`; `GH_TOKEN`/`GITHUB_TOKEN` não contam como instalação. O endpoint de opções GitHub consulta autenticação somente mediante ação de leitura explícita, usa `github.com`, não inclui tokens e não vincula nem troca a conta ativa. Não refazer login ou alterar ACLs para contornar erro de contexto.

O Git precisa oferecer `--no-lazy-fetch` (Git **2.45 ou posterior**). A validação confere essa capacidade antes de aceitar o executável: versões anteriores recebem `GIT_VERSION_UNSUPPORTED`, sem serem confundidas com falta de `user.name`/`user.email`. Atualize o Git e valide novamente em Configuração; não remova a proteção contra downloads implícitos para contornar o bloqueio.

`GET /api/v1/settings/github-options` retorna o executável observado, conta vinculada, identidade ativa observada e contas do CLI com `active`, `valid` e `eligible`. Só conta ativa com autenticação validada e identidade GraphQL correspondente fica elegível. Inativas e inválidas recebem orientação para regularização externa. A consulta é somente leitura. Para salvar um caminho localizado, use `PUT /api/v1/settings` como comando isolado (`changes: {}` e `gh_executable_path`), com a revisão e a chave de idempotência atuais; o servidor revalida o EXE e o recibo pode ser consultado por `/api/v1/operations/:operationId`.

Ordem: validar bootstrap → adquirir lock → abrir/conferir migrations e configuração persistida → revalidar ferramentas configuradas → carregar papéis → validar templates distribuídos → compor scheduler/HTTP → listen loopback. O pré-voo de conexão não é executado antes da UI abrir; a leitura explícita de ferramentas o consulta sem recrutar agente ou chamar provider. Lock ocupado, banco desconhecido/mais novo/corrompido, checksum incompatível ou recurso inválido impedem avanço. Diagnósticos são sanitizados; não registrar ambiente, argv, pipe, tokens ou stderr nativo.

As únicas variáveis de bootstrap são `NODE_ENV`, `FACTORY_BIND_HOST`, `FACTORY_PORT`, `FACTORY_BROWSER_ORIGIN` e `FACTORY_LOG_LEVEL`. Defaults/validação estão no README raiz. O banco é fixo em `<raiz da instalação>/var/factory/factory.sqlite`, independentemente do cwd. `FACTORY_DATA_DIR` é ignorada; HTTP e configuração persistida não substituem esse caminho. Git retido, ambientes, evidências e lock usam a mesma raiz operacional `var/factory`. Não inserir senha humana, token, Wire, segredos de provider ou variáveis `VITE_*` no exemplo/bundle.

Comandos npm iniciados pelo OMP usam o cache compartilhado da instalação em `var/factory/runtime/npm-cache`. Ele fica fora dos workspaces por issue e dos repositórios Git retidos; `npm_config_cache` é configurada somente no processo OMP e seus filhos. `node_modules` continua dentro do workspace da issue.

Screenshots e relatórios de revisão ficam em `var/factory/projects/<project-id>/v1/managed/issues/<issue-number>/attempts/<attempt-id>/evidence/<delivery-id>`, fora do workspace mutável e do Git retido. Evidências antigas em `.factory-evidence` não são movidas automaticamente; a exclusão autorizada do projeto remove a raiz gerenciada que contém as evidências novas.

Antes de validar uma mudança que depende de pacotes, o Implementador reutiliza a árvore instalada quando ela está coerente. Se precisar reconciliar, escolhe npm, Yarn ou pnpm pelo campo `packageManager` e pelo lockfile do package root, e usa a instalação normal do gerenciador. Gerenciadores conflitantes, ausentes ou sem suporte bloqueiam a instalação e são registrados como impedimento. Não usa instalação limpa nem apaga `node_modules`; depois da instalação, confere mudanças rastreadas e só mantém alterações de lockfile necessárias à tarefa.

O arquivo de conexão temporário do OMP fica em `var/factory/runtime/bootstrap/<passage-id>/launch.json`, com ACL restrita no Windows. Após o handshake, o controlador revoga o arquivo e tenta remover somente a pasta vazia. Uma pasta existente só pode ser reutilizada se estiver vazia ou, quando contém o arquivo de conexão, após confirmar que o terminal anterior parou; conteúdo inesperado bloqueia a reconciliação. A exclusão autorizada do projeto confere e remove resíduos ligados às suas passagens, protegendo os demais projetos. Pastas sem vínculo registrado não são adotadas nem removidas automaticamente.

## Configurar e iniciar trabalho

Navegue à origem configurada, por padrão `http://127.0.0.1:4310`. Produção serve assets e API `/api/v1` na mesma origem. Health é somente técnico; não prova execução de agente. Host/Origin são exatos, sem CORS global, wildcard ou confiança genérica em headers de proxy. Para desenvolver a UI, use build + controlador na mesma origem; não há script `dev` configurado. Não abrir Vite em outra origem para contornar a proteção.

HTML, JS e CSS são entregues por GET/HEAD antes da sessão, permitindo a navegação inicial. Somente arquivos presentes no cliente compilado recebem essa permissão; leituras operacionais e SSE exigem sessão, e mutações preservam Origin/JSON/CSRF. A navegação direta (`Sec-Fetch-Site: none`) é permitida somente para esses arquivos; Host/Origin continuam validados. HTML usa `no-store`; assets do build usam cache imutável.

O hostname real é capturado automaticamente antes da preparação, do início e do controle da fila; não há seleção de outra máquina. Maestri usa o contexto herdado do terminal-âncora, sem Workspace ID editável. Em Configuração, confira a raiz local de projetos e perfis `maestri-omp` com provider/modelo/esforço exatos. Selecione Implementador e Revisor, branch-base e Project/owner/campo/quatro opções de Status por ID. Tempo ativo, TTL e polling são configuração persistida, não ambiente do bundle. Intervalo de consulta e tempo ativo usam inteiros de 1 a 2.147.483.647 ms, com defaults de 15.000 e 1.800.000 ms. A espera humana não acumula atividade e o TTL permanece independente. Não há configuração de teto financeiro ou de tokens de inferência. Revise o resumo de início; automação exige habilitação explícita e resumo atual. Várias UIs compartilham o worker do controlador.

**Limite de instalação nova:** a superfície atual ainda não oferece vínculo inicial da conta observada ao singleton; observação de conta não faz esse vínculo. Se a conta persistida estiver ausente, mantenha execução bloqueada e registre o impedimento. Não usar seed SQL, conta demonstrativa ou edição manual do banco como procedimento de operação. Este pacote não resolve esse gate preexistente.

O launcher básico habilita scaffold pela política de plano confirmado: consultar ou revisar não cria recursos; a criação exige confirmação explícita dos efeitos do plano. Publicação conserva suas autorizações próprias. Hosts restritos podem compor `startController({githubMutationAuthorization, scaffoldAuthorization, ...})` com alvos previamente autorizados. Consulte os tipos públicos compilados; não obter essas capacidades de body HTTP, flags de ambiente ou credencial no bundle. Abertura nativa/confirmar parada também depende dos callbacks confiáveis do host. Sem capacidade, a UI informa indisponibilidade/incerteza e não cria substituto.

## Notificações locais

Na área **Notificações locais**, clique **Ativar notificações** para habilitar este navegador e solicitar a permissão do site. A escolha de ativação é por navegador e instalação; a permissão pertence ao navegador. Se estiver negada, altere-a nas configurações do site e volte à aplicação. Navegador sem suporte ou permissão negada mantém o controle desativado.

Os avisos usam mensagens genéricas e o clique abre o detalhe local da tentativa relacionada. Não executam publicação nem outra ação de negócio. Perguntas e pendências continuam acessíveis na interface quando os avisos estão desativados, indisponíveis ou incertos. Com a aplicação fechada não há garantia de entrega posterior; um recibo ausente ou incerto não provoca reenvio automático do mesmo evento.

## Encerrar, reiniciar e atualizar

1. Pause novos inícios da fila e confira o recibo. Fechar aba/modal não cancela trabalho.
2. Quando quiser parar a tentativa, use Cancelar e acompanhe separadamente revogação, pedido de parada, confirmação física e limpeza. Preserve ambientes quando a parada for incerta.
3. Ctrl+C no terminal-âncora solicita shutdown. O controlador revoga sessões/SSE, coordenadores e canais, encerra esperas com diagnóstico, aguarda IO próprio e fecha banco/lock. Encerrar o controlador não é prova de parada de todos os processos de agentes/filhos; confira recursos no Maestri.
4. Reinicie pelo novo terminal-âncora válido e pela **mesma raiz de instalação**. Sessões/CSRF anteriores são recusados; registros/resultados/efeitos ficam preservados. Trabalho incompleto fica interrupted/unknown, sem restaurar conversa, adotar terminal ou reenviar publicação/pergunta.
5. Para atualizar, encerre o proprietário anterior, prepare/verifique o pacote e atualize os arquivos da mesma instalação preservando `var/factory` integralmente. Uma pasta de instalação diferente representa outra instalação; apontar uma variável para os dados antigos não faz migração. Migrations são transacionais, ordenadas e verificadas por checksum. Um pacote antigo pode recusar banco atualizado; não há downgrade automático. Mantenha o pacote anterior para diagnóstico, sem presumir reversibilidade do schema.

Não apagar WAL/SHM, substituir banco incompatível por vazio, editar ledger/checksum, copiar somente `factory.sqlite` em uso ou compartilhar o SQLite por rede. Diretório de dados e Workspace Maestri ID não pertencem à configuração editável. Banco incompatível produz diagnóstico e é preservado; esta atualização não executa limpeza ou reset da instalação atual. Export/restore e migração física são procedimentos futuros separados. O produto não é backup de projeto.

## Recuperação por situação

| Situação | Procedimento |
| --- | --- |
| Conflito 412 de configuração | Conservar rascunho, carregar revisão atual e reaplicar somente campos pretendidos. Conferir novo resumo/ETag antes de salvar/iniciar. |
| Resposta de comando incerta | Consultar `GET /api/v1/operations/:operationId` usando o ID preservado pela interface; não criar outra chave para repetir o efeito. 202/recibo confirma intenção, não conclusão física/remota. |
| Criação falha antes de qualquer efeito | Corrigir a causa indicada, voltar ao formulário, revisar um novo plano para o mesmo destino e confirmar novamente. A nova criação preserva o registro e o diagnóstico anteriores. A liberação só vale para falha sem etapas, efeitos remotos ou operações de quadro iniciados; estado ativo, interrompido/incerto ou qualquer efeito iniciado continua reservando o destino. |
| Pergunta com `delivery_unknown` | Consultar pergunta/operação e o recibo correlacionado na passagem original. Não reenviar resposta automaticamente, recrutar substituto ou tratar texto da conversa como resolução. Após perda de tracking, usar nova tentativa quando elegível. |
| Captura falha | Preservar clone e resultado; encerrar escritas próprias. Usar Repetir captura somente quando a versão/passagem/revisão continuarem elegíveis. Não editar ref capturada, índice da implementação ou iniciar outro Implementador para mera falha técnica. |
| Parada incerta | Conferir os terminais próprios no host; dismiss aceito não comprova término físico. Sem capacidade confiável, manter uncertain e ambiente preservado. Não matar processos por nome nem apagar clone. |
| Retry | Preparar Nova tentativa com `previousAttemptId` após encerramento da anterior. Revalidar issue/base/conta/assignee/Project; identidade/clone/processo são novos. Dispensa apenas Ready, sem importar alterações/sessão anteriores. |
| Publicação pendente/unknown | No detalhe da versão aprovada, Reconciliar primeiro; conferir SHA/ref/PR/comentário/Status por identidade. Concluir somente pendências autorizadas e elegíveis; não repetir mutação desconhecida. Aumento de modo exige confirmação do resumo adicional e mesma versão aprovada. |
| Criação parcial | Abrir pelo `creationId`, conferir etapas/efeitos conhecidos e Reconciliar. Não adotar destino existente, apagar parcial ou criar outro remoto para contornar unknown. Etapas não iniciadas continuam pendentes. |
| Lock ocupado | Usar a UI do controlador existente ou encerrar seu proprietário de forma normal. Outro processo/porta/projeto não ganha autoridade. O SO libera a trava ao morrer o proprietário; não apagar o arquivo do lock para forçar acesso. |
| Handoff entre contas/instalações | Pausar fila, cancelar/encerrar tentativa anterior e conferir recursos/efeitos. Só então alterar assignee no GitHub e permitir rearmamento observado de Ready na conta nova. A outra instalação tem lock independente; não há lease distribuído nem takeover de In progress. |

## Provas locais e opt-in real

No repositório de desenvolvimento, executar os comandos efetivamente configurados: `typecheck`, `lint`, `test`, `test:http`, `test:acceptance`, `build`, `test:compiled`, `test:execution-compiled`, `test:distribution`, `test:persistence` e `proof:persistence`. `test:maintenance-native` faz build e processos Node de prova local. Comandos de smoke são opt-in **locais**, usam loopback/processos próprios e não provam Maestri/GitHub. A suíte padrão bloqueia rede/subprocessos de produto. O pacote de operação inclui somente `start`; esses checks exigem o repositório, devDependencies e autorização de execução correspondentes.

Prova Maestri/OMP/Git/GitHub real exige alvo, conta, host, perfis, orçamento e efeitos previamente autorizados; o acesso Wire pelo LionClaw está descrito em [AGENTS.md](../../AGENTS.md). Não executar providers, recrutar ou publicar como efeito de build/instalação/health. Preflight Maestri é não pago, mas é consulta nativa real. `npm run acceptance:check -- <manifest.json>` verifica consistência de evidência; exit 2 é pendência, não aceite. Para AC-24, `test:execution-compiled` exercita frames/UTF-8/malformed/oversize/EOF com transporte local; TUI/MCP real exige observação separada.

Aceite visual usa Playwright MCP/Chrome de teste: conteúdo, screenshots conferidas, teclado/foco, desktop/mobile e as jornadas previstas. Build não o substitui. Não usar browser pessoal nem alegar inspeção por screenshots não observadas.

## Playwright MCP no OMP para revisão web

Revisões com critérios de interface exigem Playwright MCP e Google Chrome instalado no host executor. Ter Playwright disponível no chat do operador não o disponibiliza automaticamente às sessões OMP da fábrica.

Na configuração de usuário do OMP, `~/.omp/agent/mcp.json`, acrescente a entrada abaixo ao objeto `mcpServers`, preservando os demais servidores e configurações:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.83",
        "--browser",
        "chrome",
        "--isolated",
        "--allow-unrestricted-file-access"
      ]
    }
  }
}
```

Node.js/npm devem estar acessíveis ao OMP para executar `npx`. A versão acima foi validada em 19/10/2026. `--isolated` usa um perfil de teste separado do navegador pessoal; `--allow-unrestricted-file-access` permite abrir páginas por `file://`, necessário para critérios que exigem HTML local sem servidor, e também permite acesso a arquivos fora das raízes do workspace.

Em `~/.omp/agent/config.yml`, configure:

```yaml
browser:
  enabled: false
```

O OMP 18.11.1 suprime servidores de automação como Playwright MCP quando o navegador nativo está habilitado. Desabilitá-lo permite carregar o MCP exigido pelo Revisor. Se houver perfil OMP nomeado ou diretório de configuração personalizado, aplique as entradas na configuração efetivamente usada pelo executor; não apenas na do chat do operador.

Novas sessões carregam a configuração. Em sessões existentes, execute `/mcp reload` e confira `/mcp list`: `playwright` deve aparecer conectado. Antes de uma revisão real, confirme abertura de HTML, inspeção do conteúdo renderizado e screenshot pelo MCP, fechando o navegador de teste ao terminar. A configuração foi validada com 25 ferramentas descobertas no OMP e abertura de HTML local no Chrome isolado; isso comprova o ambiente, não aprova entregas anteriores nem inicia outra tentativa.

Referências de configuração: [OMP MCP](https://github.com/can1357/oh-my-pi/blob/main/docs/mcp-config.md) e [Playwright MCP](https://github.com/microsoft/playwright-mcp).

## Fronteiras da operação

Loopback não oferece cliente remoto pronto. Conexão remota autenticada precisa ser provida explicitamente pelo operador; esta entrega não provisiona túnel, proxy, TLS ou deployment. Sessão técnica não autentica pessoa. Credenciais normais do host e ferramentas/MCPs OMP são confiáveis, sem sandbox geral. O lock protege apenas a instalação local. A fábrica acompanha recursos próprios, preserva incerteza e não garante contenção de brokers/daemons/descendentes globais. O único executor de produção é Maestri/OMP; Wire pertence aos ensaios LionClaw e não ao bootstrap do produto.
