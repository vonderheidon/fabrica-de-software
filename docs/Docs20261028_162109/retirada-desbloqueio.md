# Proposta de desbloqueio da Sprint 001

## Decisão superveniente de 29/10/2026, 14h20

O usuário aprovou a consolidação do formato v54/digest já apresentado e aceitou a referência visual atual. A alternativa de tabela `schema_installation` descrita abaixo não é a escolhida: mantêm-se 57 tabelas, ledger vazio na instalação direta e ledger real intacto nas bases correntes v53 conformes. Os backfills do executor histórico deixam de ser requisito desse bootstrap, sem classificar os helpers V3 como pré-V3 nem retirar a produção atual de composição/cabeçalhos. Não foi necessário resetar o banco existente. A autorização de reset, se necessária, é local e não cria comportamento automático de produto.

D-002 passa a usar captura atual do chat principal, com limitação histórica expressa e sem atribuição a Revisor independente: `.cache/sprint001-reference-20261029-1420/result.json`, 21 imagens de sete páginas em três viewports. SPEC da feature, plano consolidado e normas da raiz recebem alinhamento explícito dessa continuação direta. As seções seguintes e seus hashes descrevem a proposta anterior preservada; não são o contrato corrente nem autorização para criar a tabela adicional. Nenhuma alteração de estado interno ou gate do LionClaw é simulada.

Preparada em 2026-10-29 a pedido do usuário no chat principal. Estado: proposta concreta para decisão e retomada pelo pipeline. Não é aprovação de gate, emenda normativa vigente, implementação nem aceite.

## Referências imutáveis

- SPEC: `SPEC20261028_162109.md`, SHA-256 `28792af89689ca324e6c725ddccdf15721503bb72821a90ea6898f864ad934ab`.
- Plano: `sprints20261028_162109.json`, SHA-256 `77b381621d919af8896777870b029be48055a0eeca65c3b26ac87492f87ccf9d`.
- Conferidos no filesystem nesta sessão. Ambos coincidem com B5 de `sprint-validation20261028_162109.md`.
- Preservar esses arquivos. Este documento não substitui silenciosamente seus contratos nem deve ser consumido como autorização pelo Coder.

## D-001: solução recomendada para decisão

Submeter ao mecanismo de aprovação uma representação explícita de instalação direta:

1. Manter `schema_migrations` como registro exclusivo de migrations realmente executadas. Bases atuais reconhecidas mantêm todas as linhas e timestamps, sem escrita de adaptação.
2. Distribuir um catálogo estático dos nomes, versões e SHA-256 históricos necessários ao reconhecimento. O catálogo contém metadados, sem SQL histórico executável. Sua geração deve ser verificável contra as fontes antes da retirada.
3. Para uma instalação comprovadamente vazia, criar o schema final e os seeds atuais numa transação. Preservar `application_id` e `user_version` atuais; não preencher o ledger com 53 execuções fictícias.
4. Propor uma tabela STRICT exclusiva das instalações diretas, `schema_installation`, com uma única linha: `id INTEGER PRIMARY KEY CHECK(id = 1)`, `kind TEXT NOT NULL CHECK(kind = 'direct')`, `schema_version INTEGER NOT NULL`, `catalog_sha256 TEXT NOT NULL` e `created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)`. Ela identifica a criação direta, sem guardar SQL ou conteúdo de projeto. `schema_version` corresponde ao `user_version` técnico existente; não cria versão de negócio.
5. Reconhecer dois caminhos explícitos: base atual com ledger histórico válido e sem marcador direto; ou base direta com marcador válido e ledger vazio. Recusar combinações ambíguas, catálogo divergente, estrutura parcial/desconhecida/futura e dados incompatíveis antes de escrita. Conferir a estrutura final e os contratos pertinentes nos dois caminhos; o marcador isolado não prova compatibilidade.
6. Não acrescentar essa tabela a bases existentes. A diferença física de uma tabela entre instalações diretas e históricas faz parte da decisão solicitada, inclusive o ajuste da expectativa de contagem de tabelas. Não mascarar a diferença para satisfazer testes.
7. Provar instalação direta sem leitura de SQL histórico em runtime, reabertura sem DDL/seeds, preservação integral do ledger histórico e recusa sem mutação de bases inválidas. Usar fixtures temporárias; não abrir banco operacional como atalho.

Esta proposta resolve a escolha de formato pendente no registro de aceite, mas só pode ser implementada após a decisão específica exigida por SPEC 2.1.5. A aprovação deve mencionar expressamente o marcador adicional e os dois formatos físicos reconhecidos. Se o pipeline exigir incorporar a decisão à SPEC, gerar uma revisão formal e atualizar os vínculos/hashes dependentes pelo fluxo suportado; não editar arquivos internos do LionClaw nem conservar hashes antigos como se o conteúdo fosse o mesmo.

## D-002: baseline visual

Manter feat-002.AC2 pendente até captura real atribuída ao Revisor. Não dispensar autoria nem reatribuir as imagens de 28/10.

Antes de reenviar a sprint para correção, disponibilizar o controller na porta 4310 pelo contexto Maestri autorizado, seguindo `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` e os helpers existentes quando o acesso partir do LionClaw. Ausência de `MAESTRI_PIPE` no shell externo não encerra a investigação. Não abrir a base operacional nem recrutar recursos ou chamar providers implicitamente para obter uma captura.

Na execução própria do Revisor, capturar pelo Playwright MCP/Chrome antes de qualquer retirada de produção. Registrar identidade do executor/papel, horário, revisão e hashes dos arquivos locais pertinentes, bundle efetivamente servido, cenário/fixtures, viewport, dimensão externa da janela, DPR e zoom. Repetir os mesmos cenários depois da retirada. Caso a revisão já não represente o estado anterior, registrar a limitação e obter decisão em vez de fabricar um baseline retroativo.

## Retomada suportada

O chat principal está com condução de pipeline desligada. Nenhuma chamada de aprovação, resposta de fase, drive ou alteração de estado foi feita nesta sessão. A retomada exige habilitar o chip Pipeline e solicitar inspeção do estado real antes de qualquer avanço.

Texto de entrada preparado para a retomada:

> Inspecione o pipeline existente desta feature e o gate atual. Use docs/Docs20261028_162109/retirada-desbloqueio.md como proposta vinculada à SPEC e ao plano pelos hashes, sem tratá-la como aprovação. Apresente D-001 no checkpoint próprio para decisão específica; depois de aprovada, incorpore-a pelo mecanismo suportado, revisando artefatos e hashes dependentes se necessário. Resolva o acesso ao controller pelo manual/helpers Wire e faça o Revisor produzir D-002 antes da retirada. Retome a Sprint 001 no ponto suportado pelo pipeline, sem mensagens avulsas ao Coder/Evaluator, sem simular gates e sem repetir correções que não atendem às duas dependências. Preserve os oito critérios já comprovados e reavalie os impactos e critérios restantes. Não faça commit, push, publicação ou alterações nos internos do LionClaw.

## Limites desta preparação

Somente este arquivo foi criado nesta sessão. SPEC, plano, registros anteriores, código, banco e configuração do LionClaw foram preservados. Não foram executados testes de produto, build, browser ou integração real; a proposta ainda não foi implementada nem validada em execução.
