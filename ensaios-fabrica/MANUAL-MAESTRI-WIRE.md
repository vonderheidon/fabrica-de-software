# Maestri Wire: conexão e uso

Procedimento conferido em 15/10/2026 neste ambiente, com PowerShell 7, `curl.exe` e OMP 18.10.3. O acesso é direto por HTTPS/WSS; não depende de ferramenta MCP nem de `MAESTRI_PIPE` no shell do LionClaw.

## Direção vigente dos ensaios - 2026-10-16

O roteiro em `casos/validacoes.json` comprova acesso LionClaw ao Maestri, pequena alteração com OMP normal e teste real cujo resultado volta ao LionClaw. Encerrar ao registrar essa evidência.

`controle/new-run.ps1 -CaseId ALL` prepara somente o caso atual ACCESS-01; não inicia agente ou teste. Use uma pasta de tarefa em `casos/<runId>/`. Requisitos completos da fábrica serão validados durante sua implementação.

Helpers antigos de isolamento, snapshots, revisão de estudos e supervisão foram removidos do controle ativo. O relatório lista somente as evidências preservadas de acesso, alteração e execução, seus limites e resíduos pendentes. Este manual não autoriza chamadas pagas nem efeitos externos.

## 1. Conexão já pareada

A credencial está em:

```text
%LOCALAPPDATA%\NovaFabricaSoftware\validation\maestri-wire.xml
```

O XML contém `endpoint`, `pinnedPublicKey` e `token` como `SecureString` protegido pelo Windows. Use a mesma conta Windows e máquina que salvaram a credencial. Não copie esse arquivo para o repositório nem imprima seu conteúdo.

Os helpers existentes leem a credencial na memória:

- `controle/wire-request.ps1`: requisições HTTPS GET/POST.
- `controle/wire-terminal.ps1`: captura ANSI e entrada de teclado pelo WSS.

O helper HTTPS usa `insecure` para o certificado autoassinado **junto com** `pinnedpubkey`: o pin continua obrigatório e verifica a identidade do host.

## 2. Preparar e confirmar acesso

Execute no PowerShell 7:

```powershell
$root = (Resolve-Path './ensaios-fabrica').Path # executar a partir da raiz do workspace canonico
$request = Join-Path $root 'controle\wire-request.ps1'
$stream = Join-Path $root 'controle\wire-terminal.ps1'
$credential = Join-Path $env:LOCALAPPDATA 'NovaFabricaSoftware\validation\maestri-wire.xml'
$auth = @{ CredentialPath = $credential }
$evidence = Join-Path $root 'evidencias\manual-wire'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

$info = & $request @auth -Route '/api/info' | ConvertFrom-Json
$info | Select-Object protocolVersion, role, activeWorkspaceId
```

Neste ambiente, a conexão respondeu `protocolVersion: 1` e `role: owner`. Verifique também `capabilities` antes de usar recursos opcionais. Porta acessível ou dispositivo listado como pareado, isoladamente, não comprovam uma chamada autenticada.

## 3. Localizar workspace e terminal

```powershell
$workspaces = (& $request @auth -Route '/api/workspaces' | ConvertFrom-Json).workspaces
$workspaces | Select-Object id, name
$workspaceId = ($workspaces | Where-Object name -eq 'aula-ia').id

$feed = & $request @auth -Route "/api/workspaces/$workspaceId/feed" | ConvertFrom-Json
$terminals = @($feed.items | Where-Object kind -eq 'terminal' | ForEach-Object terminal)
$terminals | Select-Object id, name, isRunning, isActive, needsAttention
$terminalId = ($terminals | Where-Object name -eq 'Ensaio Fabrica').id
```

Confira o terminal escolhido antes de qualquer escrita. `preview` contém as últimas linhas; `isRunning` indica processo existente, `isActive` indica atividade e `needsAttention` sinaliza atenção humana. Atualize o feed a cada nova observação.

## 4. Enviar texto ou abrir um terminal próprio

Padrão definido pelo usuário em 15/10/2026 para os novos testes e validações: provedor OpenAI Codex (`openai-codex`), modelo GPT-6-Luna (`gpt-6-luna`), esforço `high`. Ao iniciar o OMP, passe `--model openai-codex/gpt-6-luna --thinking high`; no SDK, fixe os valores equivalentes. Desative fallback de modelo no overlay (`retry.modelFallback: false`) e confirme a seleção efetiva na sessão. Não herde o último modelo do operador. O catálogo local do OMP 18.10.3 confirmou esse seletor e o suporte a `high`; isso não comprova uma chamada ao provider. Evidências anteriores preservam sua configuração histórica.

Para um terminal escolhido e em execução:

```powershell
$body = @{ text = 'Informe o diretório atual e aguarde.' } | ConvertTo-Json -Compress
& $request @auth -Method POST -Route "/api/terminals/$terminalId/prompt" -Body $body
```

O texto vai ao processo atual: no shell é um comando; no OMP é um prompt ou comando da interface.

Para criar um terminal exclusivo do ensaio no workspace existente:

```powershell
$body = @{
    name = 'Ensaio Manual'
    command = "pwsh -NoLogo -NoExit -File $root\controle\start-anchor.ps1"
    monitorActivity = $true
    maestroMode = $false
} | ConvertTo-Json -Compress
$created = & $request @auth -Method POST -Route "/api/workspaces/$workspaceId/terminals" -Body $body | ConvertFrom-Json
$terminalId = $created.terminalId
$created | ConvertTo-Json | Set-Content (Join-Path $evidence 'terminal-criado.json') -Encoding utf8
```

O script âncora posiciona o shell na pasta do ensaio e executa o preflight; não inicia o OMP. Para iniciá-lo, envie `omp --model openai-codex/gpt-6-luna --thinking high` pelo endpoint de prompt. Após timeout na criação, consulte o feed antes de repetir: não presuma que nada foi criado.

## 5. Acompanhar a tela e responder perguntas

```powershell
& $stream @auth -TerminalId $terminalId -Seconds 3 -OutputPath (Join-Path $evidence 'tela.ansi')
```

O arquivo contém saída de terminal com sequências ANSI, não uma imagem. O helper verifica o pin do certificado e mantém o token fora da linha de comando.

Quando a tela mostrar uma pergunta interativa, use o stream para transmitir as teclas correspondentes à resposta autorizada. Exemplo para selecionar a segunda opção quando a primeira estiver selecionada:

```powershell
$keys = [string][char]27 + '[B' + [char]13  # seta para baixo e Enter
& $stream @auth -TerminalId $terminalId -InputText $keys -Seconds 3 -OutputPath (Join-Path $evidence 'resposta.ansi')
```

Nos ensaios, a ferramenta `ask` do OMP pausou a tarefa e a resposta pelo WSS retomou a mesma sessão.

## 6. Encerrar e recuperar

Para interromper somente um terminal pertencente ao ensaio:

```powershell
& $request @auth -Method POST -Route "/api/terminals/$terminalId/kill"
```

Consulte novamente o feed até `isRunning` ficar falso. Nos testes, o ACK chegou antes do encerramento efetivo; quando necessário, confira também os PIDs próprios e seus filhos.

`POST /api/terminals/{id}/restart` reinicia o comando salvo no mesmo terminal. Isso não equivale automaticamente a retomar uma sessão OMP. Para continuar uma sessão interrompida, execute `omp --restore <caminho-da-sessao.jsonl>` dentro do terminal Maestri. No OMP 18.10.3, `--restore` exige modo interativo e não aceita `--print`.

Essa é uma capacidade nativa do OMP. O restart do controlador da fábrica segue a SPEC: marcar trabalho interrompido e reconciliar recursos, sem restaurar automaticamente a conversa do agente.

## 7. Novo pareamento e diagnóstico

Em outra máquina, ative **Configurações > Wire** e confira a chave na aba **Manual** ou no QR de **Pareamento**. A chave SPKI identifica o certificado; o token do dispositivo autoriza chamadas. O cliente faz `POST /pair` com nome do dispositivo e código temporário **ou** senha, e guarda o token retornado de forma protegida. Este procedimento inicial ainda não está automatizado pelos helpers deste diretório. [Protocolo oficial](https://www.themaestri.app/en/docs/wire)

| Sintoma | Ação |
|---|---|
| `MAESTRI_PIPE not set` | A CLI foi chamada fora do terminal Maestri. Use o helper Wire para alcançar o terminal existente. |
| Sem ferramenta MCP Wire | Use os helpers HTTPS/WSS e a credencial local já pareada. |
| `401` | Interrompa as tentativas; confira revogação/expiração do token e refaça o pareamento se necessário. |
| `403` | Confira a permissão do dispositivo e as restrições de acesso do host. |
| Erro de pin/certificado | Compare a chave com a aba Manual; não remova a verificação de pin. |
| Token funciona, mas terminal não responde | Confira ID, `isRunning`, `needsAttention` e a tela pelo stream. |

Tokens não devem aparecer em prompts, comandos, transcrições ou evidências. Os exemplos usam apenas o caminho da credencial. Evidências da execução real: [relatório dos ensaios](evidencias/relatorio-validacao.md).
