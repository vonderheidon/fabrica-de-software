# Roteiro real — Primeira fatia

Identificação do plano: **S20 exibida / `sprint-018` / Primeira fatia**. Cobertura: US-23, critérios 1–2, junto dos AC/INT mapeados no roteiro histórico [`first-slice/README.md`](../../first-slice/README.md). Este roteiro complementa, não substitui, relatórios 20261017-01 a 20261017-04.

## Ficha da execução

Preencher antes dos efeitos; um novo diretório/registro por execução. Campo ausente mantém a execução pendente.

| Campo | Valor observado/fornecido |
| --- | --- |
| Versão entregue | Pendente: referência imutável, commit/tree e digest da distribuição fornecidos pelo fluxo autorizado |
| Runtime e sistema | Pendente: Windows/build, Node, PowerShell, Maestri/build, OMP, Git, GH, MCPs e Chrome/Playwright quando usados |
| Responsável/papel | Pendente: alias seguro e papel (responsável, Implementador, Revisor ou observador) |
| Raiz da instalação / cwd do controlador | Pendente; caminho literal resolvido no runtime responsável |
| Origem / raiz do projeto | Pendente; repositório de teste escolhido e identificado antes da execução |
| Ferramentas | Pendente: listada, chamada no runtime responsável, outro runtime, fixture, Wire ou produto nativo; versão e horário |
| Alvo | Pendente: conta vinculada, repo/ID, Project/owner/item/campo/opções, issue(s) e estado/assignee atuais |
| Autorização | Pendente por provider/modelo, clone/ref/retention, comentário, Status, recrutamento, cancelamento, restart/retry e navegador |
| Resultado/horários | `pending`; preencher início/fim, cada cenário e resultado observado |
| Limites/evidências | Pendente; paths relativos, hashes e redação antes da gravação |

## Pré-voo sem efeitos

1. Confirmar no fluxo autorizado a versão entregue e conferir que a origem de teste tem a alteração dirty conhecida. O produto deve clonar para ambiente próprio; não limpar, resetar nem restaurar a origem do operador.
2. Revalidar no runtime responsável o vínculo GitHub por ID, repo, Project e issue(s) exatos, assignee exclusivo, Status e branch/base. Confirmar perfis capturados do Implementador e Revisor, incluindo provider/modelo/esforço e recursos de papel por digest.
3. Conferir o contexto nativo do host pelo preflight normal do produto. Preflight não deve recrutar, iniciar passagem, chamar provider ou mudar configuração/ACL. Catálogo OMP é uma observação sem inferência; registrar `omp --version` e `omp models --json` se chamados. Usar a [referência de CLI e modelos OMP](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md); não executar `omp models refresh`.
4. Para uma observação GH de status, usar somente `gh auth status --active --hostname github.com --json hosts` no runtime responsável, sem `--show-token`; registrar campos allowlisted e redigidos. O código de saída JSON não substitui a observação autenticada do produto. Referência: [manual gh auth status](https://cli.github.com/manual/gh_auth_status).
5. Se o observador LionClaw precisar do Wire, seguir o manual e helpers apontados no [`record.md`](record.md), registrar `wire` e não atribuir essa chamada à conexão nativa. O Wire não autoriza provider, mutação GitHub ou recrutamento.
6. Se a aplicação ou alvo não satisfizer todos os pré-requisitos, parar no preflight e registrar `pending` com causa e evidência sanitizada.

## Cenários

1. **Cadastro e origem dirty até ICR:** registrar hashes/contagens observáveis da origem sem anexar índice; cadastrar pelo fluxo da Principal; confirmar clone/branch/base próprios e bytes da origem preservados. Iniciar uma issue uma vez; após qualquer resposta HTTP incerta, consultar a operação pelo ID original sem repetir o POST.
2. **Resultado, captura e checks:** fazer o Implementador produzir alteração pequena autorizada, parar suas escritas, enviar resultado oficial em português/emoji e conferir recibo durável. Comparar `attempt_id`, `passage_id`, `delivery_id`, `git_ref`, `content_identity`, base e `runNumber`. Executar pelo menos um check do controlador na versão capturada e conferir artefato sob demanda.
3. **Revisão e correção:** Revisor em runtime, sessão e clone separados, com o perfil exato e sem conversa do Implementador. Gerar uma reprovação útil autorizada, corrigir na mesma passagem implementadora acompanhada, obter outra tree/checks/review e manter a versão rejeitada consultável. Se houver autorização para esgotamento, escolher limite curto antes de iniciar; a última correção também deve ser revisada.
4. **TUI/MCP útil:** usar ferramenta MCP do ambiente nativo com argumento inválido, observar retorno corrigível, ajustar argumento e obter resultado útil sem encerrar tentativa. Registrar se cada ferramenta estava listada, foi chamada no runtime responsável, era fixture ou veio por Wire. Conferir a mesma sessão durante trabalho, pergunta e após resultado. Sem troca de sessão/recruit substituto.
5. **Grafo do clone:** usar `repo-graph` e `graph-search` sobre a raiz exata do clone atribuída, guardar parâmetros e um achado específico conferido no arquivo atual. Se essas ferramentas não existirem no runtime, registrar pendência. A divergência com a menção histórica a GitNexus está em `record.md`; não usar GitNexus.
6. **Pergunta e resposta:** produzir pergunta prevista pelo cenário autorizado, manter fase/rodada e usar a UI para responder na mesma passagem. Conferir `answer_operation_id`, recibo, estado `delivered`, e que só a suspensão pertinente foi retirada; separar espera humana e TTL.
7. **Entrega incerta:** somente se houver mecanismo confiável e autorizado para perder a confirmação após o envio, consultar pergunta/operação e comprovar `delivery_unknown` sem novo POST. Se não houver janela observável, deixar pendente; não fabricar ACK nem enviar outra mensagem.
8. **Cancelamentos:** cancelar uma passagem durante inicialização e outra com processo filho escritor próprio identificável. Registrar intenção, retorno tardio, último marcador e parada confirmada. Manter recurso manual preexistente preservado; ausência de prova física fica `uncertain` e bloqueia remoção. Não varrer processos por nome.
9. **Restart e nova tentativa:** reiniciar somente o controlador próprio pelo terminal-âncora. Confirmar sessão antiga revogada/interrupção registrada sem recruit automático. Preparar nova tentativa com a issue ainda elegível (Ready não exigido no retry), nova identidade/ambiente/processo e sem importar sessão ou alteração antiga.
10. **UI ligada aos fatos:** seguir a conferência de Tentativas, pergunta e recuperação do [roteiro transversal](runbook-transversal-ui.md), mantendo seleção histórica, rascunhos e URLs.

## Chamadas seguras e efeitos

Antes de mutação, consultas permitidas são as leituras existentes de status/configuração, operação, tentativa, entrega, review, checks e recursos no produto; o alvo e escopo de leitura devem estar autorizados. Não usar endpoint de teste, SQL direto ou prompt via API pública para injetar resultado. Provider, clone/captura/ref Git, comentário ICR, transição de Status, recruit e parada precisam de autorização individual. Registrar `execution_question`/`execution_complete` como produto nativo, não como fixture.

## Resultado desta preparação

Nenhum cenário foi executado nesta rodada. Versão, alvo, runtime, responsável, autorizações, horários e evidências permanecem pendentes. O relatório histórico e seus resultados continuam em [`first-slice/20261017-04/report.md`](../../first-slice/20261017-04/report.md).
