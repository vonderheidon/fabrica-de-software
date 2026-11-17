# Acesso de manutenção ao Maestri (Wire)

Ferramenta de desenvolvimento para consultar o Maestri e enviar comandos a terminais a partir de um shell externo. Não faz parte do produto e não comprova a conexão nativa da fábrica.

Requer PowerShell 7, `curl.exe` e um dispositivo pareado no Maestri. Os helpers `scripts/wire-request.ps1` (HTTPS GET/POST) e `scripts/wire-terminal.ps1` (WSS, captura ANSI e teclas) leem a credencial protegida pelo Windows e verificam o pin do certificado. Execute com a mesma conta e máquina do pareamento e mantenha credencial e token fora do repositório, comandos, logs e evidências.

Na raiz do repositório:

```powershell
$request = (Resolve-Path './scripts/wire-request.ps1').Path
$stream = (Resolve-Path './scripts/wire-terminal.ps1').Path
$auth = @{ CredentialPath = (Join-Path $env:LOCALAPPDATA 'NovaFabricaSoftware\validation\maestri-wire.xml') }
$workspaces = (& $request @auth -Route '/api/workspaces' | ConvertFrom-Json).workspaces
$workspaces | Select-Object id, name
# Selecione o workspace confirmado, sem presumir o primeiro da lista.
$feed = & $request @auth -Route "/api/workspaces/$workspaceId/feed" | ConvertFrom-Json
$terminals = @($feed.items | Where-Object kind -eq 'terminal' | ForEach-Object terminal)
$terminals | Select-Object id, name, isRunning, isActive, needsAttention, preview
```

- Capturar a tela: `& $stream @auth -TerminalId $terminalId -Seconds 3 -OutputPath <arquivo.ansi>`.
- Enviar texto ao processo atual (shell ou OMP): `& $request @auth -Method POST -Route "/api/terminals/$terminalId/prompt" -Body (@{ text = $texto } | ConvertTo-Json -Compress)`.
- O stream aceita `-InputText` para teclas de uma resposta autorizada.

Confirme o terminal e o prompt livre no feed antes de enviar comandos e preserve terminais ocupados. Após timeout, consulte feed e tela antes de repetir efeitos; ACK de parada não comprova término físico. Ausência de `MAESTRI_PIPE` no shell externo não indica que o Wire esteja indisponível.

Em erro 401/403, confira a autorização do dispositivo. Em falha de pin, confira a chave nas configurações Wire do Maestri, sem desabilitar a verificação. Sem credencial válida, refaça o pareamento pela interface do Maestri.
