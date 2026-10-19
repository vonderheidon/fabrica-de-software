# Roteiro real — Publicação na interface

Identificação do plano: **S23 exibida / `sprint-021` / Publicação na interface**. Cobertura: US-23, critério 3; referência e pendências anteriores em [`acceptance-transversal/README.md`](../../acceptance-transversal/README.md) e [`coverage-matrix.md`](../../acceptance-transversal/coverage-matrix.md).

## Ficha da execução

| Campo | Valor observado/fornecido |
| --- | --- |
| Versão entregue | Pendente: referência imutável, commit/tree e distribuição do produto |
| Runtime / raiz / cwd | Pendente: Windows, Node, controlador, instalação fixa e cwd observado |
| Responsável/papel | Pendente: operador de publicação e observador independente |
| Ferramentas | Pendente: Git/GH, runtime nativo, Playwright/Chrome se usado; classificação e versões |
| Alvo | Pendente: conta, repo ID/owner/name, issue, attempt, delivery, branch e base |
| Perfis | Pendente: snapshots exatos de Implementador e Revisor e recursos/digests |
| Autorização por efeito | Pendente em separado: comentário ICR, Status, commit privado, push, PR e provider |
| Chamadas/resultado/horários | `pending`; registrar chamada segura, IDs, começo/fim e saída sanitizada |
| Limites/evidências | Pendente; sem tokens, transcript, DB, índice ou conteúdo integral do repo |

## Pré-voo e chamada segura

1. Usar conta de teste vinculada, repositório e issue autorizados, com revisor independente e versão aprovada. Conferir `attempt_id`, `delivery_id`, `git_ref`, `content_identity`, `base_sha`, review e checks no detalhe antes de qualquer comando.
2. Consulta segura inicial: ler `GET /api/v1/deliveries/:deliveryId`, `/review` e `/checks`, além do resumo de publicação da tentativa. Registrar somente IDs/estados/códigos e hashes de referência, sem carregar patch/log quando não necessário. Revalidar leitura GitHub no contexto autorizado do host.
3. Confirmar no fluxo de publicação que o modo capturado é aquele aprovado. Cada aumento de modo recebe autorização adicional por `summary_hash`/ETag e alvo. Não iniciar nova implementação nem recapturar checkout mutável para publicar.

## Percurso na mesma versão aprovada

1. Concluir **ICR** e registrar comentário/Status somente nos alvos autorizados; conferir recibo, marcador e estado remoto observados. Revisão aprovada não equivale a resultado `delivered`.
2. Autorizar **Commit local** pela ação existente e conferir branch/ref/SHA/parent/tree exatos no Git gerenciado, mantendo a mesma `delivery_id` e `content_identity`. Nenhum push está implícito nessa etapa.
3. Autorizar **Pull request** como efeito próprio, mantendo mesma entrega/tree/base; conferir head SHA, branch/base, ID/URL/estado e marcador únicos no repo autorizado. Não concluir PR, mesclar, editar corpo de issue ou marcar Done.
4. Em pontos de resposta perdida previamente escolhidos e autorizados, não repetir POST. Consultar `publication/reconcile` e o efeito correspondente até haver confirmação inequívoca ou estado `unknown`. Se a confirmação não puder ser estabelecida, parar e preservar a incerteza.
5. Verificar que reconciliação não criou outro commit, PR ou comentário; que nenhum Implementador foi iniciado; e que resultado, aprovação por versão, modo autorizado, efeitos e limpeza continuam campos separados.

## Autorização e resultado

| Efeito/provider | Alvo e escopo que devem constar da autorização |
| --- | --- |
| Provider | Não necessário para reconciliação; se outra execução o exigir, registrar provider/modelo/papel e limite antes do uso |
| GitHub leitura | Conta/repo/issue/Project e campos de leitura permitidos |
| Comentário ICR | Uma issue/repositório, corpo/hash e marcador da entrega autorizados |
| Status | Project/item/campo e opção origem/destino autorizados |
| Commit privado | Instalação/attempt/delivery/tree/base/branch gerenciada; sem push implícito |
| Push | Repo remoto e ref própria SHA→branch exata, sem força/tags |
| PR | Repo/head/base e criação única da PR desta entrega |

Tudo permanece `pending` até haver referência da versão, confirmação humana por efeito, chamada real no runtime designado e evidência própria. Esta preparação não publicou, comentou, mudou Status, fez commit, push ou criou PR.
