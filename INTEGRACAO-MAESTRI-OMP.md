# Integração Maestri + OMP — contrato de implementação

Parte normativa da [SPEC](SPEC.md). Revisão de escopo aprovada em 2026-10-16: a fábrica coordena desenvolvimento, não contém nem gerencia integralmente o runtime dos agentes. Este contrato substitui as exigências anteriores de exclusividade MCP, ambiente mínimo por servidor, supervisão física exaustiva e auditoria de cada estudo. As evidências anteriores continuam válidas somente no escopo observado.

## 1. Responsabilidades e confiança

| Componente | Responsabilidade |
| --- | --- |
| Fábrica | Tentativas, despacho, checks, entrega/revisão estruturadas, histórico e seus próprios efeitos Git/GitHub |
| Maestri | Terminais e interação normal do operador |
| OMP | Sessão do agente, ferramentas nativas, instruções, configuração e gerenciamento normal de MCPs |
| Implementador | Implementar, verificar e entregar sem assumir publicação da fábrica |
| Revisor | Avaliar independentemente o conteúdo entregue, sem corrigi-lo para aprovar |

OMP, ferramentas e MCPs configurados pelo operador são componentes confiáveis. Não há sandbox de filesystem, rede ou credenciais do usuário. A fábrica não acrescenta seus segredos de publicação ao ambiente do agente nem altera configurações globais para restringi-lo. Retirar GH_TOKEN do ambiente não impede acesso a credenciais já existentes no host; esse limite é explícito, não uma garantia de contenção.

Não criar ferramentas próprias de leitura/edição/shell para substituir as nativas, gerenciador MCP paralelo ou supervisor geral como pré-requisito do produto. Uma bridge só se justifica por necessidade concreta não atendida pela integração suportada, com escopo mínimo e decisão registrada.

Governança do Kanban, modos de entrega, revisão por versão e reconciliação dos efeitos próprios da fábrica permanecem conforme a SPEC. Esta simplificação não autoriza efeitos externos do agente nem enfraquece a proteção contra publicar bytes diferentes dos aprovados ou duplicar publicação incerta.

## 2. Inicialização e terminal normal

A primeira versão inicia pelo terminal-âncora dentro do Maestri. Usar o contexto herdado de CLI/pipe/terminal, sem inventar identidades ou adotar terminal manual. A CLI no PATH não comprova conexão: conferir uma consulta real e diagnosticar contexto ausente ou stale. Não modificar ACLs globais para contornar falhas.

Resolver o executável OMP instalado e usar argv/cwd explícitos. Consultar a ajuda da versão; EXE, CMD/BAT e shell PowerShell têm regras de quoting distintas. Não passar segredos ou prompts grandes pela linha de comando: usar arquivo de tarefa ou API suportada, sem enviar a mesma tarefa duas vezes.

Uma sessão operacional por papel/passagem. Não usar OMP headless para fazer o trabalho enquanto outra TUI é decorativa. Preservar stdin/stdout do terminal, ferramentas nativas, regras, skills, LSP, comandos e mensagens. Não adotar --no-tools, --no-lsp, --no-skills ou --no-rules como política da fábrica.

Selecionar provider/modelo/esforço exatos e conferir estado efetivo; não substituir silenciosamente o perfil. Usar autenticação normal existente, sem copiar tokens para prompts ou artefatos. Não executar chamadas de provider apenas para aprovar ambiente antes de cada tarefa.

CLI ou bootstrap SDK suportado são opções de implementação, não obrigações de construir outra distribuição OMP. Preferir o caminho mais simples que preserve TUI e coordenação. O bootstrap estudado é evidência de viabilidade, não código de produção obrigatório.

## 3. Resultados e perguntas

A extensão mínima registra execution_complete e execution_question; não há execution_accept nem autorização para execution_block genérico. Vincular resultados à tentativa, passagem, papel e versão; o modelo não escolhe identidades privadas. Persistir resultado válido antes de confirmar, permitir correção de payload inválido e impedir que repetição/confusão entre passagens gere outra entrega.

Fim de turno, texto approved, feed e scrollback não substituem resultado estruturado. Não exigir transcript completo para acompanhar a tentativa.

Pergunta contém decisão, contexto e alternativas. Validar schema e vínculo, sem classificador semântico de manutenção ou justificativas obrigatórias extensas. As instruções orientam autonomia para dificuldades operacionais. Resposta retorna à passagem correta; pergunta não bloqueia TUI, comandos ou conversa. Credencial ausente ou falha impossível de resolver recebe diagnóstico concreto e preservação do trabalho.

A integração usa transporte local suportado e correlação suficiente para não misturar sessões. Se houver canal próprio, restringi-lo a loopback, proteger o bootstrap, não expor segredos e usar framing/decodificação UTF-8 corretos ou biblioteca consolidada. Fechamento deve encerrar esperas com diagnóstico. Isso não exige construir uma plataforma genérica de protocolos.

## 4. MCPs e ferramentas

Usar a configuração e o gerenciamento normal suportado do OMP. A fábrica não impõe exclusividade de servidores, precedência própria entre várias fontes, interceptação de reload, sentinelas contra descoberta ou allowlist de ambiente por servidor. Não criar launcher MCP sanitizador como requisito de produção.

Conferir se a ferramenta necessária está disponível e realizar uma chamada útil no runtime real. Configuração presente ou tools/list, isoladamente, não provam funcionamento. Respeitar configuração disabled pelo mecanismo nativo; não reabilitar servidor silenciosamente. Erro corrigível de argumento não encerra a tentativa.

O Implementador executa os checks pertinentes disponíveis: build, typecheck, lint e testes automatizados relacionados à alteração. A validação visual completa dos critérios de aceite cabe ao Revisor independente sobre a versão fixa; o Implementador não realiza auditoria visual no navegador e registra como not_verified os critérios visuais que não verificou, indicando o encaminhamento ao Revisor.

Playwright MCP/Google Chrome continua sendo a superfície de aceite web do Revisor. Usar navegador/perfil de teste, não o browser pessoal do operador; verificar conteúdo e screenshot, não apenas arquivo não vazio. Fechar o browser iniciado pelo teste. O uso do Portal Maestri, suas ferramentas de navegador e skills é proibido para Implementador e Revisor, inclusive para observação, testes ou alternativa ao Playwright. Instruções do projeto ou de skills não substituem essa proibição.

GitNexus, quando requerido, deve analisar o clone pertinente. Confirmar a raiz exata, preparar índice nesse ambiente e não usar índice do checkout do operador como substituto. Não exigir resolver ou proxy próprio para injetar repo: usar os parâmetros suportados e instruções do projeto. Preparar índice é manutenção autônoma, não pergunta humana.

Critérios que exigem escrita externa precisam de autorização e alvo específicos. O acesso normal às ferramentas não autoriza publicar por conta própria nem transferir ao agente o token do publisher da fábrica.

## 5. Entrega e perda de acompanhamento

Implementador encerra escritas próprias antes de entregar. A fábrica captura conteúdo identificado; checks e sessão independente do Revisor usam essa versão. Correção cria nova rodada/versão. Publicação usa o conteúdo aprovado, nunca recolhe novamente um clone mutável para montar a entrega.

A versão capturada é mantida no Git por referência imutável, sem publicação remota implícita. Persistência da fábrica guarda referências Git e hashes/metadados necessários, configuração, critérios, resultados, evidências pertinentes e estado operacional. Não serializar checkout, índice, arquivos ignorados ou caches em banco ou snapshots auxiliares, nem contornar essa regra por compressão, deduplicação ou armazenamento externo. Listagens, histórico e polling usam resumos sem carregar conteúdo do projeto. Validar tamanho persistido e latência com caches volumosos conforme AC-29 da SPEC.

Conversa pode continuar após resultado; isso não inicia nova implementação. Não impor vigilância contínua de arquivos ou consentimento por arquivo. Se a captura falhar, preservar trabalho e permitir repetir a captura.

Se processo/canal fechar ou a integração detectar perda de vínculo, interromper coordenação automática daquele handle, preservar arquivos/resultados e oferecer nova tentativa em ambiente separado. Resultado antigo não aprova tentativa nova. Não bloquear comandos nativos para impedir troca de sessão/modelo nem prometer observar toda mudança interna do OMP.

No restart, trabalho não terminado fica interrupted; não restaurar automaticamente conversa ou autoridade anterior. Testar esse comportamento no percurso implementado. Não exigir matriz exaustiva de trocas de contexto, eventos tardios e revogação em cada etapa antes de desenvolver o produto.

## 6. Cancelamento e recursos conhecidos

Registrar os recursos que a fábrica inicia e usar os mecanismos normais de parada do runtime/OS. Cancelar impede novos avanços/publicação e solicita encerramento dos recursos próprios conhecidos. Acompanhar lançamentos pendentes conhecidos: se retornarem depois do cancelamento, registrar e solicitar sua parada, sem repetir criação por resposta perdida.

Não encerrar processos por nome de executável nem alvos manuais descobertos por varredura. Distinguir pedido aceito de parada confirmada. Quando não houver confirmação suficiente, mostrar limpeza incerta e preservar ambiente/evidências; não declarar zero processos globais nem apagar clone por mera resposta de kill.

Job Object pode ser um detalhe interno de Cancelar, reutilizando o mecanismo comprovado quando adequado. Não é obrigatório implementar observador externo da morte do supervisor, inventário individual de handles/PID/creationTime, recibo físico de cada descendente, IPC stop próprio autenticado ou supervisor nativo completo. Se uma solução escolhida criar canal de controle, deve protegê-lo; isso não obriga criar tal canal.

Processos delegados a brokers/serviços e ferramentas do operador ficam fora da garantia de contenção. Nova tentativa usa outro ambiente e não exige reset global ou liberação de reserva. Remoção de ambiente com parada incerta não é automática.

Dois cenários representativos de aceite: cancelar durante inicialização e durante trabalho com processo filho. Observar o que parou e registrar limites. Não há obrigação de injetar cancelamento em cada instante de compile/recruit/ready/tool/check. Falha concreta que comprometa entrega ou cancelamento deve ser corrigida, não escondida como limite.

## 7. Plano atual dos ensaios

Fonte do roteiro executável: `ensaios-fabrica/casos/validacoes.json`. A pergunta é: o LionClaw consegue acessar o Maestri para implementar e testar a fábrica?

1. Confirmar acesso autenticado pelo Wire e identificar terminal próprio no workspace existente.
2. Conduzir OMP normal nesse terminal, com o perfil definido para o ensaio, para uma pequena alteração local verificável.
3. Executar um teste real da alteração pelo mesmo terminal.
4. Consultar pelo LionClaw a alteração e o resultado do teste, registrando comando, saída, identificador do terminal e limites.

Encerrar quando essa prova estiver registrada. Resultados anteriores podem comprovar partes do roteiro quando contêm evidência direta; não repetir estudos apenas por recomendações históricas.

Os critérios INT abaixo são aceite da fábrica futura. O ensaio de acesso não exige implementar controlador, revisão independente, ciclo de correção, entrega formal, cancelamento injetado ou nova tentativa. MCP de produto só entra se necessário à tarefa escolhida. Semântica de publicação, persistência e restart será validada no produto implementado.

Helpers de isolamento, snapshots e supervisão foram retirados do diretório de controle ativo. O relatório dos ensaios lista somente as evidências pertinentes preservadas e os resíduos cuja exclusão foi bloqueada.

## 8. Critérios INT revisados

IDs são preservados para rastreabilidade; descrições abaixo substituem os contratos anteriores.

| ID | Aceite atual |
| --- | --- |
| INT-01 | Inicialização dentro do Maestri com contexto válido e terminal próprio |
| INT-02 | Falha de conexão recebe diagnóstico, sem modificar configuração/ACL global |
| INT-03 | Uma sessão real por papel, no ambiente correto; sem runtime decorativo |
| INT-04 | Provider/modelo/esforço escolhidos usados sem fallback silencioso |
| INT-05 | Conversa e ferramentas normais funcionam durante trabalho e após resultado |
| INT-06 | Resultado estruturado durável associado à passagem; inválido corrigível, sem duplicar entrega |
| INT-07 | Pergunta/resposta vinculadas; autonomia por orientação, sem classificação semântica pelo controlador |
| INT-08 | Perda de acompanhamento interrompe coordenação automática e preserva trabalho; comportamento implementado testado sem matriz exaustiva |
| INT-09 | MCP necessário usa configuração/gerenciamento normais do OMP; sem garantia de exclusividade ou ambiente sanitizado |
| INT-10 | Chamada útil real e recuperação de argumento inválido sem falha terminal automática |
| INT-11 | UI pertinente observada em Playwright MCP/Chrome de teste, com conteúdo/screenshot e fechamento |
| INT-12 | GitNexus, quando requerido, usa a raiz do clone pertinente e retorna informação útil |
| INT-13 | Transporte escolhido preserva UTF-8 e não deixa espera sem saída após falha; usar mecanismo suportado, sem plataforma genérica |
| INT-14 | Lançamento real no Windows preserva cwd/argv com espaços e Unicode e interação normal |
| INT-15 | Cancelamento representativo na inicialização e no trabalho com filho; coordenação/publicação interrompidas |
| INT-16 | Parada limitada aos recursos próprios conhecidos; incerteza explícita, arquivos e recursos manuais preservados |
| INT-17 | Nova tentativa real em outro ambiente sem reset/liberação global |
| INT-18 | Checks/revisão e publicação usam a mesma versão aprovada; correção cria nova versão |

MCP de fixture, resultado simulado e screenshots históricos não comprovam o produto completo. Publicação GitHub e governança do Kanban mantêm as provas específicas da SPEC. Suíte padrão não faz chamadas pagas ou operações externas implicitamente.

## 9. Referências e limites históricos

- [OMP](https://github.com/can1357/oh-my-pi): CLI, SDK e gerenciamento MCP da versão instalada.
- [Maestri Wire](https://www.themaestri.app/en/docs/wire): meio de condução dos ensaios; não muda o início do produto dentro do Maestri.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp): configuração e ferramentas da versão escolhida.
- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects): opção interna de cancelamento, não obrigação de plataforma de supervisão.
- [GH CLI](https://cli.github.com/manual/): consultas e efeitos do adapter GitHub.

Os estudos de SDK, isolamento MCP e supervisão Windows foram retirados do plano e da documentação ativa dos ensaios. Usar as evidências mínimas listadas no relatório atual, com seus limites; não portar mecanismos de estudo para produção sem necessidade concreta.
