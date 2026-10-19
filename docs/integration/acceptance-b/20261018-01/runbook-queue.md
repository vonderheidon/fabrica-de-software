# Roteiro real — Fila Ready

Identificação do plano: **S26 exibida / `sprint-024` / Fila**. Cobertura: US-23, critério 4; a matriz histórica está em [`acceptance-transversal/coverage-matrix.md`](../../acceptance-transversal/coverage-matrix.md).

## Ficha da execução

| Campo | Valor observado/fornecido |
| --- | --- |
| Versão entregue | Pendente: referência imutável, commit/tree e distribuição |
| Runtime / raiz / cwd | Pendente: host Windows, Node, instalação, controlador e cwd |
| Responsável/papel | Pendente: responsável pela conta, observador e eventual Revisor |
| Ferramentas | Pendente: Git/GH, Maestri/OMP/provider, runtime e classificação de cada chamada |
| Alvo | Pendente: conta vinculada, projetos, repo IDs, Projects/fields/options e issues Ready |
| Perfis | Pendente: perfis exatos dos dois papéis e configuração capturada |
| Autorização | Pendente por leitura GH, habilitação local, provider, clone/ref, Status, pausa e restart |
| Chamadas/resultado/horários | `pending`; incluir IDs de observação/ciclo/attempt/operation/event |
| Limites/evidências | Pendente; anexos sanitizados, nenhuma credencial ou dump de quadro |

## Pré-voo e consulta sem consumo

1. Escolher conta e projetos de teste autorizados. Enumerar repo/Project/owner/item/campo/quatro opções de Status e issues abertas. Confirmar assignee exclusivo, bloqueadores e Ready efetivos no momento da prova.
2. Conferir os perfis exatos de Implementador/Revisor e a observação de host. Revalidar a identidade GitHub no mesmo runtime responsável, sem `gh auth login`, `gh auth switch` ou troca global de conta.
3. Chamada segura antes de habilitar: ler `GET /api/v1/queue` com o escopo exato. Isso consulta dados GH; exige autorização de leitura do alvo e não autoriza consumo. Registrar completude, validade, resumo/hash, candidatos, total, ordem, motivos, conta e host. Não chamar `PUT /queue` durante o preflight.
4. Verificar que a leitura não iniciou tentativa, criou projeto, consumiu ciclo nem chamou provider. Se a observação estiver parcial, inválida, em cooldown ou com conta/host divergentes, parar.

## Consumo, governança e restart

1. Obter autorização do responsável para habilitar o escopo exato, provedor/modelo, issue(s) permitidas, janelas e limite externo de uso. Anotar o `summary_hash` mostrado e confirmar uma única vez pela UI.
2. Esperar o scheduler observar novamente a fila e iniciar no máximo uma tentativa autorizada. Correlacionar observação, ciclo Ready, consumo, operation/receipt, attempt/capture e primeiro efeito. Não reenviar nem forçar candidato por endpoint.
3. Mudar a autoridade somente com mudança real autorizada no alvo: conta, assignee ou Status. Conferir pausa/bloqueio antes do próximo efeito, reconciliação da observação e ausência de outro consumo. Não atribuir, mover ou assumir issues para criar o cenário.
4. Pausar pela ação existente; verificar que novos inícios param e a tentativa/histórico continuam. Reiniciar somente o controlador da instalação de teste, sem restaurar agente; consultar operação, tentativa e consumo pela UI. Confirmar que não há replay automático e que Ready só rearma após observação corrente conforme o ciclo documentado.
5. Se necessário, repetir em outra issue autorizada após rearmamento observado. O resultado é `failed` somente para contradição observada; bloqueio, cooldown ou alvo indisponível ficam `pending`/`unknown` com causa.

## Autorização e resultado

| Escopo | Alvo obrigatório na autorização | Estado agora |
| --- | --- | --- |
| GitHub leitura | Conta, repos, Projects, campos e issues | Pendente |
| Habilitação/pausa | Instalação, escopo account/project, `project_ids`, janela | Pendente |
| Provider | Provider, modelo, papel, chamadas e limite externo de uso | Pendente |
| Git gerenciado | Clone, retenção/ref e materialização de cada attempt | Pendente |
| Projeção remota | Project/item/campo/opções de Status, se o cenário exigir | Pendente |
| Cancelar/restart | Somente controller/terminals/attempts iniciados por esta execução | Pendente |

Esta preparação não consultou GitHub, habilitou fila, despachou candidato, chamou provider, criou tentativa ou alterou Status.
