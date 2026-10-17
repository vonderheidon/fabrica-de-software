# Stories — Nova fábrica de software

Estado: consolidação de Discovery para validação; não é PRD aprovada, backlog publicado ou comprovação de implementação. Fontes: [SPEC](../../SPEC.md), [integração](../../INTEGRACAO-MAESTRI-OMP.md) e [glossário](../../GLOSSARY.md), lidos nesta execução. Os critérios normativos prevalecem sobre as descrições abaixo.

As stories seguem as fatias da SPEC §10.1. Um critério pode atravessar várias stories; a associação não reduz seu alcance. A comprovação indicada é trabalho futuro, sem execução real nesta fase.

## Fatia 1 — Percurso integrado manual até ICR

### US-01 — Cadastrar repositório e preparar uma issue

Como operador, quero cadastrar uma origem Git e revisar os parâmetros de início para executar uma issue sem alterar minha pasta de trabalho.

- Cadastro aceita origem local dirty ou remoto GitHub e branch-base; identidade vem de URL/IDs. Origem local fornece apenas histórico commitado, sem stash/reset/commit/limpeza na pasta indicada.
- Cadastro local sem remoto é permitido; todos os modos de execução/entrega exigem remoto GitHub, Project acessível pessoal/organizacional e issue vinculada.
- Primeiro início exige Ready, issue aberta e assignee exclusivo da conta; dependências e pré-requisitos são verificados sem chamadas de provider de preflight.
- Preparação aguarda save confirmado. Tentativa/consumo nascem atomicamente antes dos efeitos; resposta perdida é consultável por request ID sem outro lançamento.

Critérios: AC-01, AC-05; SPEC §§2, 3.1, 5.1.

### US-02 — Configurar projeto e perfis reutilizáveis

Como operador, quero editar configurações pela UI para iniciar tentativas com escolhas explícitas e estáveis.

- Origem/base, Project/Status, perfis, checks com cwd relativo, limite de correções, modo e automação são configuráveis.
- Perfis preservam provider/modelo/esforço e orientação exatos, sem impor Luna/high de ensaio a todos os projetos.
- Defaults e contratos são capturados por tentativa; edição posterior não muda tentativa ativa. Conflito entre abas preserva campos e não exige lidar com revisão numérica.

Critérios: AC-04; INT-04; SPEC §3.3.

### US-03 — Executar no Maestri com interação normal

Como operador, quero iniciar a fábrica dentro do Maestri e conversar na TUI real do OMP para acompanhar o trabalho sem selecionar terminais a cada rodada.

- Controlador herda contexto do terminal-âncora e verifica conexão real; erro ausente/stale recebe diagnóstico, sem alterar ACL/configuração global.
- Cada passagem usa sessão operacional real por papel, cwd/argv corretos no Windows, espaços/Unicode e perfil efetivo; não há TUI decorativa nem fallback silencioso.
- Ferramentas nativas, regras, skills, LSP, mensagens e MCPs normais permanecem disponíveis durante trabalho, pergunta e após resultado.
- Ferramenta MCP necessária é comprovada por chamada útil; argumento inválido é corrigível. GitNexus, quando requerido, usa a raiz/índice do clone pertinente.
- Transporte preserva UTF-8 e encerra esperas com diagnóstico em malformed/oversize/EOF; não cria plataforma genérica ou resolver MCP paralelo.

Critérios: AC-23, AC-24, AC-25; INT-01–INT-05, INT-09, INT-10, INT-12–INT-14.

### US-04 — Implementar e capturar uma entrega verificável

Como operador, quero uma entrega identificada por conteúdo para saber exatamente o que foi verificado e revisado.

- Clone independente por tentativa, base SHA fixa, sem dirty da origem, hard links/alternates dependentes do operador ou atualização silenciosa de base.
- Implementador termina escritas/processos próprios antes do resultado; captura imutável no Git inclui conteúdo pertinente tracked/untracked não ignorado, exclusões, renames e modos, sem alterar o índice da implementação.
- Captura precede checks e revisão. Ignored/caches e segredos conhecidos não são coletados automaticamente; incompatibilidades de arquivos especiais/submodules/LFS têm diagnóstico concreto.
- Evidências cobrem todos os criterionIds; checks configurados também são executados pela fábrica sobre a versão capturada. Falha técnica de captura permite repetição preservando trabalho.
- Resultado execution_complete tem vínculo privado definido pelo transporte e persistência antes do ACK; inválido pode ser corrigido, repetição não duplica e conversa não substitui resultado.

Critérios: AC-06, AC-09, AC-13; INT-06, INT-18; SPEC §§5.2–5.4.

### US-05 — Obter revisão independente e correções limitadas

Como operador, quero revisão da versão entregue por outro runtime para receber aprovação sustentada por critérios e achados concretos.

- Revisor usa clone da versão capturada e sessão independente, sem conversa do Implementador; alteração de produto pelo Revisor invalida parecer.
- Resultado cobre exatamente os IDs e achados estruturados; aprovação exige critérios aprovados e resolução independente dos impedimentos anteriores.
- Reprovação abre correção dentro do limite, na tentativa; rodada inicial 1, padrão de duas correções editável de 0 a 5. Toda correção termina com nova captura, checks e nova revisão independente.
- Achados/resultados anteriores permanecem no histórico. Esgotamento preserva pendências; ICR disponibiliza diff/evidências/ambiente após processo terminar, sem commit de entrega.

Critérios: AC-07, AC-08, AC-09, AC-13; INT-03, INT-06, INT-18.

### US-06 — Responder decisões sem reset operacional

Como operador, quero responder perguntas vinculadas à passagem para decidir escopo ou efeitos sem perder o trabalho em andamento.

- execution_question apresenta decisão/contexto/alternativas; controlador valida schema/vínculo, sem classificador semântico de manutenção.
- Agente resolve dificuldades operacionais recuperáveis dentro do escopo; impossibilidade técnica recebe diagnóstico e preservação, sem permissão genérica de bloqueio.
- Pergunta pausa avanço/publicação, preserva TUI e ferramentas, não consome correção e separa espera humana do tempo ativo.
- Resposta vai à mesma passagem com recibo; entrega incerta mantém pausa para consulta, sem retry cego. Conversa livre não resolve pergunta formal implicitamente.
- Mudança de escopo vai para GitHub e nova tentativa; resultado durante pergunta recebe diagnóstico corrigível.

Critérios: AC-14, AC-15; INT-05, INT-07, INT-10; SPEC §5.5.

### US-07 — Cancelar com informação sobre o que realmente parou

Como operador, quero cancelar a continuidade e conhecer efeitos/recursos pendentes para preservar meu trabalho sem supor limpeza concluída.

- Cancelamento impede novos avanços/publicação e solicita parada apenas dos recursos próprios conhecidos, inclusive lançamento pendente que retorne depois.
- Pedido aceito e parada confirmada são distintos; ausência de confirmação mostra limpeza incerta e não apaga clone.
- Requisição remota enviada pode concluir; registrar o fato e impedir efeitos seguintes, sem prometer rollback.
- Recursos manuais não são alvos de varredura/kill por nome. Não prometer contenção global de daemons/brokers.

Critérios: AC-16, AC-26; INT-15, INT-16. Prova futura: cancelar na inicialização e durante trabalho com processo filho, observando os limites reais.

### US-08 — Recuperar após interrupção e iniciar outra tentativa

Como operador, quero preservar resultados e iniciar em outro ambiente após uma interrupção para continuar sem reset de equipe ou manipulação de Ready.

- Perda de vínculo interrompe coordenação daquele handle e preserva arquivos/resultados; resultado antigo não aprova nova tentativa.
- Restart torna trabalho não terminado interrupted, revoga autoridade antiga e não restaura conversa/provider; abrir UI não recruta agentes.
- Nova tentativa explícita usa parâmetros revisáveis, issue/base atuais e outro clone/processo, sem reaproveitar alterações/sessão anteriores nem exigir Ready novamente; verifica origem e ausência de tentativa ativa.
- Ambiente residual não bloqueia toda a fábrica quando a separação dos efeitos está comprovada; limpeza incerta não autoriza exclusão automática.

Critérios: AC-17, AC-18, AC-26; INT-08, INT-16, INT-17; SPEC §7.

## Fatia 2 — Publicação autorizada

### US-09 — Escolher o modo e publicar os bytes aprovados

Como operador, quero escolher ICR, ICR + Commit ou ICR + Commit + PR para obter exatamente os efeitos autorizados.

- ICR mantém entrega local sem commit de entrega; Commit acrescenta Conventional Commit local sem push; PR acrescenta push e PR, sem merge, auto-close ou Done.
- Modo é capturado no início; escolher PR autoriza o push necessário sem confirmação duplicada. Aumentar modo encerrado é ação explícita de publicação com resumo/revalidações.
- Publicação materializa a referência imutável aprovada em clone privado, nunca recolhe novamente o checkout mutável; não inclui caches ou artefatos como código nem usa force-push.
- No-op exige evidência/revisão; não fabrica commit/PR vazios e registra efeitos not_applicable.
- PR inclui versão/base/escopo/checks/verdict/pendências/attemptId; sem PR, resultado/evidências seguem em comentário identificado da fábrica. Não editar checkboxes da issue.

Critérios: AC-09–AC-11, AC-13; INT-18; SPEC §§2, 6.

### US-10 — Reconciliar publicação e efeitos incertos

Como operador, quero consultar e concluir apenas efeitos pendentes para recuperar publicação sem duplicar PR ou reimplementar código.

- Cada efeito tem intenção durável e operationId antes da execução; timeout após mutação é unknown até consulta, sem retry cego.
- Reconciliação confere commit/tree/parent, ref/SHA e PR por head/base/repositório/marcador; não adota PR por semelhança de nome.
- Publicação exige versão aprovada, passagem concluída, autorização atual, conta/assignee/Project corretos e ausência de pergunta/cancelamento/interrupção não reconciliada ou efeito incompatível incerto.
- Falha conserva aprovação e efeitos confirmados. Após restart, Concluir publicação exige ação explícita/revalidação; não restaura autoridade da sessão nem completa automaticamente publicação cancelada.

Critérios: AC-10–AC-12, AC-18, AC-22; INT-18; SPEC §6.1.

## Fatia 3 — Fila Ready

### US-11 — Habilitar fila elegível sem repetir trabalho

Como operador, quero habilitar as issues Ready da minha conta para processar trabalho disponível sem disparos repetidos.

- Seleção exige issue aberta no repositório/Project configurados, Ready, um assignee igual ao node ID da conta e bloqueadores resolvidos; ignora drafts/PR cards e não autoatribui.
- Consulta pagina todos os itens pertinentes; auth errada, API parcial ou rate limit não autorizam despacho. Backoff/consulta degradada são visíveis.
- Habilitar mostra quantidade atual e autoriza essas issues; pausar só impede novos inícios. Um trabalho automático ativo inicialmente.
- Consumo durável por projeto/issue/ciclo observado resiste a polling/restart/resposta perdida/Ready residual. Falha/cancelamento não gera retry automático.
- Novo ciclo automático exige observar saída e retorno a Ready; transições offline não são reconstruídas. Nova tentativa explícita resolve a repetição desejada.
- Ordena por prioridade configurada, posição documentada disponível e desempate número/ID; sem posição disponibilizada usa número crescente e mostra o critério.

Critérios: AC-19, AC-20; SPEC §§4.1–4.2.

### US-12 — Manter responsabilidade e instância executora claras

Como operador, quero uma esteira por conta no host designado para que várias interfaces não iniciem workers concorrentes.

- Lock por instalação/conta recusa segundo processo no mesmo host. Outra máquina é cliente; não há eleição distribuída nem garantia entre instalações independentes.
- Conta/assignee/Project/issue/Status são revalidados no despacho/publicação. Troca de conta pausa despacho; mudança de responsável revoga publicação e solicita cancelamento.
- Handoff exige encerrar/cancelar a tentativa anterior antes de atribuir/rearmar; não adota In progress de outra máquina.

Critérios: AC-21, AC-22; SPEC §4.3.

### US-13 — Projetar acompanhamento sem tomar posse do Kanban

Como operador, quero acompanhar as etapas no Project configurado para enxergar progresso sem um editor paralelo do quadro.

- Mapear IDs e opções existentes: Ready, In progress, In review, Delivered; Done continua humano. Não criar campos/colunas sem ação explícita.
- Delivered significa modo concluído; aprovação sem publicação completa em PR não chega a Delivered.
- Divergência externa suspende avanço e pede decisão, sem reescrever à força. Reprovação não devolve automaticamente a Ready; falha de projeção não reexecuta trabalho nem apaga resultado.
- Efeitos de Status/comentários têm journal/reconciliação; não há CAS remoto nem promessa de publicação exatamente uma vez entre instalações independentes.

Critérios: AC-12, AC-19, AC-20, AC-22; SPEC §§2, 4.4, 6.1.

## Fatia 4 — Scaffold

### US-14 — Criar projeto com plano e autorização única

Como operador, quero revisar o plano de criação para obter projeto local, remoto sem push ou remoto com push conforme minha escolha.

- Formulário contém nome/template/destino/modalidade; owner/nome remoto/visibilidade aparecem nas modalidades remotas. Sugestões não sobrescrevem edição.
- Plano contém destino canônico, template/digest, arquivos, configuração de engenharia, efeitos e conta; Criar autoriza o resumo escolhido uma única vez.
- Revalida antes de escrever, recusa destino existente e escapes por junction/symlink; recurso obrigatório ausente falha antes de criar destino.
- Scaffold segue a referência setup-matt-pocock-skills: tracker GitHub, domínio, Agent skills e triagem quando aplicável; gera configuração/apontadores em AGENTS.md preservado, sem instalar/copiar skills, sem setup interativo e sem labels remotas implícitas.
- Recursos autocontidos/versionados, caminhos portáveis e ignored adequados. Sucesso informa baseline Conventional Commit/remoto/publicação; não inicia agentes ou issue.

Critérios: AC-02, AC-05; SPEC §3.2. A consulta à skill e recursos é necessária ao implementar o scaffold; este Discovery não executa seu setup.

### US-15 — Inspecionar criação parcial sem perder arquivos

Como operador, quero saber o que foi criado quando houver falha para recuperar a operação sem rollback destrutivo ou remoto adotado indevidamente.

- Efeitos têm intenção/resultado; mudança inicial de conta/plano recusa antes de efeitos.
- Parcial preserva arquivos e permite inspecionar fatos, sem repetição cega, limpeza destrutiva ou adoção de remoto existente por resposta inesperada.

Critérios: AC-03, AC-12; SPEC §§3.2, 6.1.

## Fatia 5 — Jornadas finais, diagnóstico e critérios cruzados

### US-16 — Consultar operação e histórico acessíveis

Como operador, quero ver a próxima ação e inspecionar entregas para acompanhar projetos sem lidar com reservas, PIDs ou reset de equipe.

- Projetos oferece catálogo/Criar/Conectar/configuração; Operação mostra conta/host, pausa, tentativa ativa, elegíveis e resultados; Tentativa mostra issue/modo/etapa/rodada/diff/checks/review/commit/PR/pergunta; configuração é editável.
- Ações dependem do estado: Abrir terminal/pasta, Responder, Cancelar, Nova tentativa, Repetir captura e Concluir publicação.
- Desktop/mobile, teclado, foco, nomes acessíveis, contraste/zoom; loading/falha/vazio com ação clara. Contexto na URL, histórico preservado durante polling/save, conflito preserva edição e reload não repete POST.
- Visual depende do Design Lock do usuário. Aceite usa Playwright MCP/Chrome de teste com conteúdo e screenshot e fechamento do browser; Portal não substitui essa prova.

Critérios: AC-04, AC-09, AC-27; INT-05, INT-11; SPEC §9.

### US-17 — Preservar histórico leve e entrega recuperável pelo Git

Como operador, quero histórico confiável que não copie meu projeto para o banco para consultar tentativas sem custo proporcional a caches.

- Git retém versão imutável aprovada; banco guarda configuração, critérios, vínculos, resultados, evidências pertinentes, efeitos e referências Git/hashes necessários.
- Não serializar checkout, índice, ignored ou caches em banco/JSON/Base64/snapshots auxiliares, inclusive comprimidos ou externos.
- Evidências externas têm referência/checksum/tamanho; ausência gera diagnóstico. Listagens/histórico/polling leem resumos, detalhes sob demanda.
- Durabilidade antes de ACK e migrations que recusam banco desconhecido/mais novo sem substituir por vazio. Restart preserva histórico sem restaurar autoridade.

Critérios: AC-09, AC-18, AC-29; INT-06, INT-18; SPEC §8.4. Prova futura AC-29: comparar tamanho persistido e latência antes/depois de caches volumosos, confirmar que consultas/payloads não leem/serializam conteúdo e recuperar versão via Git.

### US-18 — Evoluir integrações com limites de módulo preservados

Como mantenedor, quero interfaces de negócio pequenas para trocar executor/MCP ou adicionar checks sem modificar SQL/UI internos nem lifecycle.

- Monólito modular da SPEC §8; só storage escreve SQL, execution conhece Maestri/OMP, github executa GH e workspaces representa os ambientes Git. Contracts não têm IO; UI não importa runtime interno.
- Execution expõe início/observação/resultado/resposta/cancelamento/superfície de interação; detalhes de sessões/PIDs/bootstraps são privados.
- HTTP loopback, rotas /api/v1 e schemas compartilhados; mutações JSON com sessão/CSRF e Origin local, CORS fechado, sem segredos em URLs/logs. GET sem despacho, request ID/ETag e SSE/resync conforme contrato.
- Não criar adapter Eve, broker, microserviços, event sourcing, repository genérico ou plataforma de supervisão como requisito.

Critérios: AC-28; INT-02, INT-09, INT-13; SPEC §§8.1–8.5. Esta story registra o contrato existente e não abre decisões técnicas das fases seguintes.

## Índice de cobertura normativa

| Critérios | Stories principais |
| --- | --- |
| AC-01 | US-01 |
| AC-02–AC-03 | US-14–US-15 |
| AC-04 | US-02, US-16 |
| AC-05 | US-01, US-14 |
| AC-06 | US-04 |
| AC-07–AC-08 | US-05 |
| AC-09 | US-04–US-05, US-09, US-16–US-17 |
| AC-10–AC-12 | US-09–US-10; US-13/US-15 para efeitos |
| AC-13 | US-04–US-05, US-09 |
| AC-14–AC-15 | US-06 |
| AC-16 | US-07 |
| AC-17–AC-18 | US-08, US-10, US-17 |
| AC-19–AC-20 | US-11, US-13 |
| AC-21–AC-22 | US-12; US-10/US-13 para publicação/Status |
| AC-23–AC-25 | US-03 |
| AC-26 | US-07–US-08 |
| AC-27 | US-16 |
| AC-28 | US-18 |
| AC-29 | US-17 |
| INT-01–INT-05 | US-03; US-02 para perfil |
| INT-06 | US-04–US-05, US-17 |
| INT-07 | US-06 |
| INT-08 | US-08 |
| INT-09–INT-10 | US-03, US-06, US-18 |
| INT-11 | US-16 |
| INT-12–INT-14 | US-03, US-18 |
| INT-15–INT-16 | US-07–US-08 |
| INT-17 | US-08 |
| INT-18 | US-04–US-05, US-09–US-10, US-17 |

## Plano de comprovação e limites desta fase

Validação desta documentação: leitura UTF-8 dos arquivos gravados e conferência de consistência/rastreabilidade com as fontes, preservando as seções técnicas futuras e as decisões pendentes. Não há aceite de implementação nesta fase.

Implementação futura segue SPEC §10.2: Vitest determinístico; contratos HTTP/SQLite/Git; percurso real Maestri/OMP/provider com autorização; aceite UI com Playwright MCP/Chrome. Publicação/Status/comentários reais exigem alvos e autorização correspondentes. Compilação, configuração, tools/list, transcript e evidência histórica isolados não substituem essas provas.

Pendências de produto: monetização da primeira versão e validação do Discovery/pitch. Referência visual permanece sem aprovação e será decidida no Design Lock próprio do pipeline. Não foram criados PRD, schema, endpoints novos ou decisões visuais nesta fase.
