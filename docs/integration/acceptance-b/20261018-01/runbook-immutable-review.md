# Roteiro — Revisão independente da versão imutável

Identificação: US-24, critérios 1–5; RF-107–109 e RNF-19. A revisão deve ocorrer sobre a versão entregue fornecida pelo fluxo autorizado, separada dos registros de validação local e de aceite externo.

## Ficha da revisão

| Campo | Valor observado/fornecido |
| --- | --- |
| Versão entregue | Pendente: ref imutável autorizada, repo, commit e tree conferidos |
| Alvo | Pendente: repositório e referência exata fornecida pelo fluxo autorizado |
| Runtime e workspace | Pendente: sistema, ferramentas/checks, raiz/cwd e modo somente leitura |
| Responsável | Pendente: revisor independente, diferente do autor da alteração avaliada |
| Artefatos de produto | Pendente: identificação da distribuição/arquivos oriundos da referência |
| Autorização | Pendente: leitura da referência e execução dos checks; nenhum provider ou efeito externo |
| Chamada segura | Pendente: inspeção read-only da referência; comando e horário ainda não observados |
| Checks | Pendente: comandos configurados, início/fim, exit code e versão alvo para cada saída |
| Resultado/achados | Pendente; conservar os IDs e decisões anteriores |
| Evidências/limites | Pendente; anexos relativos, sanitizados, tamanho/hash, sem cópia de fontes ou caches |

## Gate da referência

1. Receber do fluxo autorizado a ref Git imutável preparada para esta entrega e registrar seu nome, repo, commit e tree. O coordenador deve confirmar que a versão entregue, a distribuição examinada, os checks e a revisão apontam para o mesmo conteúdo.
2. Abrir a referência no ambiente de revisão disponibilizado/autorizado. Não usar o `HEAD` anterior, branch móvel, inventário, lista de SHA de arquivos ou hashes avulsos no lugar da ref. Não criar commit, tag, branch ou ref neste roteiro.
3. Se a origem do revisor estiver dirty, divergente ou não for possível demonstrar a ref exata, não iniciar checks de aceite; registrar `pending` e pedir nova preparação autorizada.

Depois que a referência for fornecida, a inspeção pode usar leituras Git como `git show <approved-ref> --no-patch --format=fuller` e `git show <approved-ref>:package.json`. Registrar a saída sanitizada e o horário no contexto do revisor. Não executar esses exemplos antes de existir a referência autorizada.

## Revisão sem correção

1. O revisor lê as fontes pertinentes, critérios e documentação. Registra leitura e achados sem alterar as fontes para fazer uma checagem passar ou preparar aprovação.
2. Executa os comandos configurados pertinentes (typecheck, lint, testes e build) dentro do workspace isolado da referência. Captura comando exato, runtime, horário, saída/código e commit/tree verificados.
3. Em falha, preservar saída e declarar `failed` para o check observado; não corrigir fontes e não reexecutar para aprovar. Achados de revisão são registrados com localização e efeito, sem sobrescrever avaliações anteriores.
4. Se houver correção, ela gera nova versão/ref pelo fluxo autorizado e nova avaliação independente correspondente. A versão/achados anteriores permanecem consultáveis.

## Estado nesta preparação

Não foi identificada nem criada uma referência imutável desta entrega. A restrição vigente proíbe mutações Git; nenhum commit, tag, ref ou push foi executado. Revisão e checks vinculados à versão entregue permanecem **PENDENTES**. A revisão histórica e o registro local consolidado não foram substituídos.
