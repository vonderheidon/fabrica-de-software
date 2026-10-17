# Operação local da primeira entrega

O contrato é [SPEC §§8–11](../../SPEC.md) e [integração Maestri/OMP](../../INTEGRACAO-MAESTRI-OMP.md). Resultados observados e pendências ficam em [SPEC_PROGRESS.md](../../SPEC_PROGRESS.md). O pacote não transporta configuração pessoal, projetos, credenciais ou skills do autor.

## Preparar e distribuir

No repositório canônico, com Node **24.x**, dependências do lockfile já instaladas e autorização para os comandos locais:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --reporter=dot --no-color
npm.cmd run package:local
npm.cmd run test:distribution
```

`package:local` executa o build configurado e gera uma pasta nova `build/Fábrica distribuição-<id>`. Ela contém `dist/` (controlador, contratos compilados, cliente, migrations, papéis e templates), `scripts/start-host.mjs`, manifesto/lockfile, dependências **de produção** instaladas, exemplo de ambiente e este manual. Não inclui `.env`, banco, WAL/SHM, `work`, armazenamento Git operacional, caches, skills ou fontes do workspace. Uma falha conserva o pacote parcial; não o distribua. O smoke cria outra pasta de teste e dados próprios em `.cache`, sem alterar a instalação operacional.

Transfira a pasta completa para a instalação de destino. Node, Git, GH, Maestri e OMP são pré-requisitos externos normais. As dependências nativas empacotadas correspondem ao SO, arquitetura e ABI indicados em `distribution.json`; use Windows/arquitetura compatíveis e Node 24. Não anunciar um binário universal ou executar instalação global de ferramentas. Um pacote para outra plataforma precisa ser preparado e validado nessa plataforma. Não é necessário compilar TypeScript ou instalar skills no destino.

O smoke portátil usa HTTP e SQLite nativos em uma raiz com espaços/Unicode e cwd independente. Seu pré-voo Maestri é **controlado** por composição de teste; isso não prova acesso ao Maestri, TUI, provider, MCP, Git ou GitHub reais. Não existe flag de produção para selecionar essa composição.

## Terminal-âncora e bootstrap

Abra um terminal normal **dentro do Maestri** no contexto autorizado do Windows com acesso ao keyring existente. Não importe variáveis de outro terminal nem invente `MAESTRI_PIPE`, terminal ou workspace. Informe cinco caminhos absolutos de executáveis EXE instalados, nesta ordem: Git, GH, Maestri, OMP e PowerShell. CMD/BAT/PS1 não substituem os executáveis nativos esperados pelo adapter. OMP suportado pelo adapter atual: **18.11.1**; outra versão exige conferência e adaptação explícita, sem fallback de modelo/perfil.

Exemplo a adaptar aos executáveis do host, sem caminhos pessoais fixados pelo produto:

```powershell
$installationDirectory = 'D:\Aplicações\Fábrica local'
$env:FACTORY_DATA_DIR = 'D:\Dados\Fábrica'
Set-Location -LiteralPath $installationDirectory
npm.cmd start -- 'D:\Ferramentas\Git\cmd\git.exe' 'D:\Ferramentas\GitHub CLI\gh.exe' 'D:\Ferramentas\Maestri\maestri.exe' 'D:\Ferramentas\OMP\omp.exe' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
```

Alternativamente, após criar um `.env` **local** contendo somente as seis opções de `.env.example`, use o carregamento nativo do Node:

```powershell
node --env-file=.env scripts/start-host.mjs 'D:\Ferramentas\Git\cmd\git.exe' 'D:\Ferramentas\GitHub CLI\gh.exe' 'D:\Ferramentas\Maestri\maestri.exe' 'D:\Ferramentas\OMP\omp.exe' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
```

O loader não procura executáveis no PATH e não lê credenciais de argumentos ou arquivos de bootstrap. A composição declara contexto `windows_keyring`; **não eleva** o processo nem comprova autenticação por si. GH consulta a identidade efetiva pelos mecanismos normais. Não refazer login ou alterar ACLs para contornar erro de contexto. O entrypoint `dist/apps/controller/src/main.js` sem composição também falha com `CONTEXT_MISSING`, sem iniciar scheduler/HTTP.

Ordem: validar bootstrap → adquirir lock → abrir/conferir migrations e configuração persistida → carregar papéis → consultar contexto real Maestri e versão OMP → validar templates distribuídos → compor scheduler/HTTP → listen loopback. O pré-voo não recruta agente nem chama provider. Lock ocupado, banco desconhecido/mais novo/corrompido, checksum incompatível, recurso inválido ou contexto ausente/stale impedem avanço. Diagnósticos são códigos sanitizados; não registrar ambiente, argv, pipe, tokens ou stderr nativo.

As únicas variáveis de bootstrap são `NODE_ENV`, `FACTORY_BIND_HOST`, `FACTORY_PORT`, `FACTORY_BROWSER_ORIGIN`, `FACTORY_DATA_DIR` e `FACTORY_LOG_LEVEL`. Defaults/validação estão no README raiz. Diretório relativo de dados resolve pela instalação, não pelo cwd. Use diretório absoluto estável para atualização entre versões. Não inserir senha humana, token, Wire, segredos de provider ou variáveis `VITE_*` no exemplo/bundle.

## Configurar e iniciar trabalho

Navegue à origem configurada, por padrão `http://127.0.0.1:4310`. Produção serve assets e API `/api/v1` na mesma origem. Health é somente técnico; não prova execução de agente. Host/Origin são exatos, sem CORS global, wildcard ou confiança genérica em headers de proxy. Para desenvolver a UI, use build + controlador na mesma origem; não há script `dev` configurado. Não abrir Vite em outra origem para contornar a proteção.

HTML, JS e CSS são entregues por GET/HEAD antes da sessão, permitindo a navegação inicial. Somente arquivos presentes no cliente compilado recebem essa permissão; leituras operacionais e SSE exigem sessão, e mutações preservam Origin/JSON/CSRF. A navegação direta (`Sec-Fetch-Site: none`) é permitida somente para esses arquivos; Host/Origin continuam validados. HTML usa `no-store`; assets do build usam cache imutável.

Em Configuração, confira host executor designado (comparado ao hostname observado), raiz local de projetos e perfis `maestri-omp` com provider/modelo/esforço exatos. Selecione Implementador e Revisor, checks relativos, branch-base, Project/owner/campo/quatro opções de Status por ID. Limites/TTL/custos/polling são configuração persistida, não ambiente do bundle. Revise o resumo de início; automação exige habilitação explícita e resumo atual. Várias UIs compartilham o worker do controlador.

**Limite de instalação nova:** a superfície atual ainda não oferece vínculo inicial da conta observada ao singleton; observação de conta não faz esse vínculo. Se a conta persistida estiver ausente, mantenha execução bloqueada e registre `PF-06` conforme o roteiro first-slice. Não usar seed SQL, conta demonstrativa ou edição manual do banco como procedimento de operação. Este pacote não resolve esse gate preexistente.

O launcher básico fornece os contextos de consulta/execução, sem autorização remota irrestrita. Publicação e scaffold remoto exigem composição confiável explícita via `startController({githubMutationAuthorization, scaffoldAuthorization, ...})`, limitada aos IDs de conta/repositório/Project ou owner/nome/visibilidade/allowPush já autorizados. Consulte os tipos públicos compilados; não obter essas capacidades de body HTTP, flags de ambiente ou credencial no bundle. Abertura nativa/confirmar parada também depende dos callbacks confiáveis do host. Sem capacidade, a UI informa indisponibilidade/incerteza e não cria substituto.

## Encerrar, reiniciar e atualizar

1. Pause novos inícios da fila e confira o recibo. Fechar aba/modal não cancela trabalho.
2. Quando quiser parar a tentativa, use Cancelar e acompanhe separadamente revogação, pedido de parada, confirmação física e limpeza. Preserve ambientes quando a parada for incerta.
3. Ctrl+C no terminal-âncora solicita shutdown. O controlador revoga sessões/SSE, coordenadores e canais, encerra esperas com diagnóstico, aguarda IO próprio e fecha banco/lock. Encerrar o controlador não é prova de parada de todos os processos de agentes/filhos; confira recursos no Maestri.
4. Reinicie pelo novo terminal-âncora válido e pelo **mesmo** diretório de dados. Sessões/CSRF anteriores são recusados; registros/resultados/efeitos ficam preservados. Trabalho incompleto fica interrupted/unknown, sem restaurar conversa, adotar terminal ou reenviar publicação/pergunta.
5. Para atualizar, encerre o proprietário anterior, prepare/verifique outro pacote e aponte-o para o mesmo diretório estável. Migrations são transacionais, ordenadas e verificadas por checksum. Um pacote antigo pode recusar banco atualizado; não há downgrade automático. Mantenha o pacote anterior para diagnóstico, sem presumir reversibilidade do schema.

Não apagar WAL/SHM, substituir banco incompatível por vazio, editar ledger/checksum, copiar somente `factory.sqlite` em uso ou compartilhar o SQLite por rede. Alterar `settings.dataRoot` não move o banco aberto nem o armazenamento Git/evidências; o bootstrap define o diretório efetivo. Export/restore e migração física são procedimentos futuros separados. O produto não é backup de projeto.

## Recuperação por situação

| Situação | Procedimento |
| --- | --- |
| Conflito 412 de configuração | Conservar rascunho, carregar revisão atual e reaplicar somente campos pretendidos. Conferir novo resumo/ETag antes de salvar/iniciar. |
| Resposta de comando incerta | Consultar `GET /api/v1/operations/:operationId` usando o ID preservado pela interface; não criar outra chave para repetir o efeito. 202/recibo confirma intenção, não conclusão física/remota. |
| Pergunta com `delivery_unknown` | Consultar pergunta/operação e o recibo correlacionado na passagem original. Não reenviar resposta automaticamente, recrutar substituto ou tratar texto da conversa como resolução. Após perda de tracking, usar nova tentativa quando elegível. |
| Captura falha | Preservar clone e resultado; encerrar escritas próprias. Usar Repetir captura somente quando a versão/passagem/revisão continuarem elegíveis. Não editar ref capturada, índice da implementação ou iniciar outro Implementador para mera falha técnica. |
| Parada incerta | Conferir os terminais próprios no host; dismiss aceito não comprova término físico. Sem capacidade confiável, manter uncertain e ambiente preservado. Não matar processos por nome nem apagar clone. |
| Retry | Preparar Nova tentativa com `previousAttemptId` após encerramento da anterior. Revalidar issue/base/conta/assignee/Project; identidade/clone/processo são novos. Dispensa apenas Ready, sem importar alterações/sessão anteriores. |
| Publicação pendente/unknown | No detalhe da versão aprovada, Reconciliar primeiro; conferir SHA/ref/PR/comentário/Status por identidade. Concluir somente pendências autorizadas e elegíveis; não repetir mutação desconhecida. Aumento de modo exige confirmação do resumo adicional e mesma versão aprovada. |
| Criação parcial | Abrir pelo `creationId`, conferir etapas/efeitos conhecidos e Reconciliar. Não adotar destino existente, apagar parcial ou criar outro remoto para contornar unknown. Etapas não iniciadas continuam pendentes. |
| Artefato ausente/corrompido | Conservar diagnóstico/checksum/metadados; não substituir por conteúdo vazio nem promover aprovação. Conferir recurso por ID e evidências pertinentes. |
| Lock ocupado | Usar a UI do controlador existente ou encerrar seu proprietário de forma normal. Outro processo/porta/projeto não ganha autoridade. O SO libera a trava ao morrer o proprietário; não apagar o arquivo do lock para forçar acesso. |
| Handoff entre contas/instalações | Pausar fila, cancelar/encerrar tentativa anterior e conferir recursos/efeitos. Só então alterar assignee no GitHub e permitir rearmamento observado de Ready na conta nova. A outra instalação tem lock independente; não há lease distribuído nem takeover de In progress. |

## Provas locais e opt-in real

No repositório de desenvolvimento, executar os comandos efetivamente configurados: `typecheck`, `lint`, `test`, `build`, `test:compiled`, `test:execution-compiled`, `test:verification-compiled`, `test:distribution`, `test:acceptance`, `test:persistence` e `proof:persistence`. `test:maintenance-native` faz build e processos Node de prova local. Comandos de smoke são opt-in **locais**, usam loopback/processos próprios e não provam Maestri/GitHub. A suíte padrão bloqueia rede/subprocessos de produto. O pacote de operação inclui somente `start`; esses checks exigem o repositório, devDependencies e autorização de execução correspondentes.

Prova Maestri/OMP/Git/GitHub real segue [first-slice](../integration/first-slice/README.md), com alvo, conta, host, perfis, orçamento e efeitos previamente autorizados. Não executar providers, recrutar ou publicar como efeito de build/instalação/health. Preflight Maestri é não pago, mas é consulta nativa real. `acceptance:check` verifica consistência de evidência; exit 2 é pendência, não aceite. Para AC-24, `test:execution-compiled` exercita frames/UTF-8/malformed/oversize/EOF com transporte local; TUI/MCP real exige observação separada.

Aceite visual usa Playwright MCP/Chrome de teste: conteúdo, screenshots conferidas, teclado/foco, desktop/mobile e as jornadas previstas. Build não o substitui. Não usar browser pessoal nem alegar inspeção por screenshots não observadas.

## Fronteiras da primeira entrega

Loopback não oferece cliente remoto pronto. Conexão remota autenticada precisa ser provida explicitamente pelo operador; esta entrega não provisiona túnel, proxy, TLS ou deployment. Sessão técnica não autentica pessoa. Credenciais normais do host e ferramentas/MCPs OMP são confiáveis, sem sandbox geral. O lock protege apenas a instalação local. A fábrica acompanha recursos próprios, preserva incerteza e não garante contenção de brokers/daemons/descendentes globais. O único executor de produção é Maestri/OMP; Wire pertence aos ensaios LionClaw e não ao bootstrap do produto.
