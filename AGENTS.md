# Nova fábrica de software

## Objetivo

Construir uma esteira local que coordena implementação, checks, revisão, correção e entrega de software, usando Maestri, OMP, Git e MCPs existentes. A fábrica coordena desenvolvimento; não é um novo harness, sandbox ou sistema de backup.

## Fontes de verdade

Antes de planejar ou alterar código, leia as seções pertinentes e identifique os critérios de aceite da tarefa:

| Fonte | Quando consultar |
| --- | --- |
| `README.md` e `docs/operation/README.md` | Instalação, execução, operação e validação |
| `package.json`, `apps/`, `packages/contracts/`, `resources/` e `tests/` | Comandos, comportamento implementado, contratos atuais e cobertura |
| `GLOSSARY.md` | Termos de domínio, estados e significado de Ready |
| `.agents/skills/` | Instruções da skill pertinente à tarefa; leia seu `SKILL.md` antes de aplicar |

Evidências de ensaio não comprovam o produto implementado. Confirme o escopo e os critérios da tarefa com as instruções atuais do usuário; registre conflitos antes de mudar o contrato e não restaure requisitos de estudos descartados.

## Trabalho no workspace e pipeline dev 2.0

- Trabalhe neste repositório canônico. Preserve alterações existentes; não crie cópias, worktrees ou floors concorrentes para desenvolver esta fábrica. Os clones por tentativa previstos no produto são outro contexto.
- Use os artefatos aprovados da tarefa como entrada quando houver pipeline. Preserve decisões consolidadas; pergunte somente por lacunas que afetem produto ou escopo e não possam ser respondidas pelas fontes disponíveis.
- Siga a tarefa e os artefatos aprovados da fase atual. Mudança de fase, aprovação e Design Lock pertencem aos mecanismos do pipeline; não simule esses eventos nem trate esta instrução como aprovação.
- O Design Lock do dev 2.0 é decisão do usuário. Mantenha o layout aprovado ao implementar a UI e registre conflitos com requisitos funcionais.
- Resolva manutenção operacional reversível autonomamente. Não amplie escopo para construir infraestrutura sem um impedimento concreto da implementação.
- Diferencie requisitos do produto de restrições de ensaios; perfis usados em validações anteriores não fixam os perfis configuráveis da fábrica.

## Implementação

- Preserve as fronteiras dos módulos e implemente por fatias funcionais verificáveis; cada fatia deve produzir comportamento real.
- Stack definida: TypeScript strict, Node.js 24.x, Fastify, React/Vite e SQLite, com dependências fixadas em lockfile. Consulte package.json para versões e comandos de build e teste.
- Implemente os módulos do zero. Não analise, copie, importe ou encapsule o legado Aula-IA como base. Avalie um workaround somente quando um problema concreto exigir e documente a decisão pertinente.
- Use OMP, ferramentas nativas e gerenciamento MCP normais. Preserve a TUI e a interação previstas no contrato. Integrações próprias só com necessidade concreta e escopo mínimo.
- Para o scaffold do produto, confira os templates em `resources/templates/` e os testes pertinentes. Não execute setup de scaffold neste workspace por mera leitura destas instruções.
- Use caminhos relativos ou configuração resolvida em runtime. O produto será distribuído em aula e não pode depender de diretórios pessoais ou recursos desta máquina.

## Persistência

- Git é a fonte do conteúdo versionado. O workflow persiste configuração, critérios, resultados, evidências pertinentes, estado operacional e referências Git/hashes estritamente necessários.
- Não copie checkout, índice Git, ignorados ou caches para SQLite, JSON, Base64 ou snapshots auxiliares. Compressão, deduplicação e armazenamento externo não justificam preservar esse excesso.
- Histórico, listagens e polling consultam resumos leves; detalhes são carregados sob demanda. Valide tamanho persistido e latência com caches volumosos, conforme AC-29.
- Identifique a versão aprovada por referências Git imutáveis. Publicação deve usar essa versão; correções geram outra rodada e outra referência.

## Validação e entrega

- Para validar a UI, iniciar o servidor local é manutenção operacional autorizada e independe da aprovação de implementação ou do gate da sprint. Confira primeiro `http://127.0.0.1:4310/api/v1/health`; se responder, reutilize o processo existente.
- Se estiver parado, use o procedimento Wire abaixo para encontrar o terminal-âncora. Neste workspace, use `Shell #5` quando estiver no prompt PowerShell livre; confirme nome, diretório e atividade antes de enviar comandos.
- No terminal confirmado, entre no repositório canônico e execute `npm.cmd start`; confira o feed e o health na porta 4310. O caminho foi testado com sucesso no Shell #5 em 2026-10-29. Isso inicia o bundle já compilado em `dist/`; se precisar validar alterações de fonte, faça o build pertinente antes. Preserve processos ocupados e relate falhas concretas de acesso ou inicialização.
- Essa autorização cobre disponibilizar o servidor para validação; chamadas pagas, recrutamento de agentes, publicação e captura atribuída ao Revisor mantêm seus requisitos próprios.
- Antes de editar, defina como comprovar o comportamento e quais critérios AC/INT são pertinentes. Use os comandos efetivamente configurados no repositório.
- Use testes determinísticos e de contratos nas superfícies pertinentes; integração real Maestri/OMP para o percurso; Playwright MCP/Chrome para a UI. Compilação e typecheck não comprovam funcionamento da integração ou da interface.
- Suíte padrão não chama providers, recruta terminais nem publica recursos externos implicitamente. Execuções reais exigem autorização correspondente, com custo e efeitos conhecidos.
- Revisão independente avalia a versão entregue. Registre achados e correções sem sobrescrever os resultados anteriores; não exija revisão de outro agente para cada ajuste documental.
- Informe o que mudou, o que foi comprovado e o que permanece sem validação. Falha, interrupção ou evidência parcial não são sucesso.

## Acesso ao Maestri pelo LionClaw

Use PowerShell 7 e os helpers `scripts/wire-request.ps1` (HTTPS GET/POST, requer `curl.exe`) e `scripts/wire-terminal.ps1` (WSS, captura ANSI e teclas). Ambos leem a credencial protegida pelo Windows na memória e verificam o pin do certificado. Execute com a mesma conta e máquina do pareamento; mantenha credencial e token fora do repositório, comandos, logs e evidências. Ausência de `MAESTRI_PIPE` no shell externo não comprova indisponibilidade do Wire. Esse acesso de manutenção não comprova a conexão nativa do produto.

Na raiz do repositório:

```powershell
$request = (Resolve-Path './scripts/wire-request.ps1').Path
$stream = (Resolve-Path './scripts/wire-terminal.ps1').Path
$auth = @{ CredentialPath = (Join-Path $env:LOCALAPPDATA 'NovaFabricaSoftware\validation\maestri-wire.xml') }
$info = & $request @auth -Route '/api/info' | ConvertFrom-Json
$workspaces = (& $request @auth -Route '/api/workspaces' | ConvertFrom-Json).workspaces
$workspaces | Select-Object id, name
# Selecione o workspace confirmado, sem presumir o primeiro da lista.
$feed = & $request @auth -Route "/api/workspaces/$workspaceId/feed" | ConvertFrom-Json
$terminals = @($feed.items | Where-Object kind -eq 'terminal' | ForEach-Object terminal)
$terminals | Select-Object id, name, isRunning, isActive, needsAttention, preview
```

Confirme o ID do terminal e o prompt livre no feed atualizado; se necessário, capture a tela com `& $stream @auth -TerminalId $terminalId -Seconds 3 -OutputPath <arquivo.ansi>`. Para enviar comando/prompt, use `& $request @auth -Method POST -Route "/api/terminals/$terminalId/prompt" -Body (@{ text = $texto } | ConvertTo-Json -Compress)`: o texto vai ao processo atual, shell ou OMP. O stream aceita `-InputText` para teclas de uma resposta autorizada. Preserve terminais ocupados; após timeout, consulte feed/tela antes de repetir efeitos. ACK de parada não comprova término físico.

Em erro 401/403, confira autorização do dispositivo; em falha de pin, confira a chave nas configurações Wire do Maestri, sem desabilitar a verificação. Se não houver credencial válida, solicite pareamento pela interface do Maestri. Não recrute agentes, faça chamadas pagas ou publique recursos sem autorização correspondente.

## Ferramentas e segurança

- Para documentação atual de bibliotecas, frameworks, SDKs, APIs e CLIs, use Context7: primeiro `resolve-library-id`, depois `query-docs` por conceito. Se indisponível, use a documentação oficial e informe a limitação.
- Se o CodeGraph estiver disponível, use-o para orientação; confirme detalhes no arquivo atual quando estiver desatualizado. Fontes normativas e arquivos prevalecem sobre o grafo.
- Comandos Git locais de consulta, como `git status`, `git diff`, `git log` e `git show`, podem usar o contexto disponível, sem elevação nem acesso ao keyring. Para operações que dependam de autenticação Git/GH, use o contexto autorizado com acesso ao keyring do Windows. Se esse contexto estiver indisponível, relate a limitação; não refaça login nem altere credenciais para contorná-la.
- Nunca exponha segredos em comandos, prompts, logs ou arquivos. Credenciais Wire ficam fora do repositório; utilize os helpers existentes.
- Push, publicação externa, alterações no tracker e ações destrutivas exigem autorização correspondente. A preparação do workspace não autoriza esses efeitos nem inicia o pipeline.
