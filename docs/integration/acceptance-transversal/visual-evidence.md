# Registro de aceite visual

O roteiro novo da Etapa B está em [`acceptance-b/20261018-01/runbook-transversal-ui.md`](../acceptance-b/20261018-01/runbook-transversal-ui.md). Ele exige capturas atuais de desktop/celular, zoom nativo Chrome, jornadas com dados e o inventário completo de cada cartão de perfil da US-16 CA3; as seções históricas abaixo não são reutilizadas como evidência da versão nova.

Data: 2026-10-17. Referência examinada antes da avaliação: `docs/Docs20261016_073031/design/artifact.html`. Escopo de telas/componentes: Principal, `app-shell`, `attempt-detail` e `project-form`; conciliação C-02 mantém entrada direta na Principal e remove a interface Login/Sair.

## Execução

| Item | Resultado |
| --- | --- |
| Inventário CUA | `apps: []`, `browsers: []`; nenhum perfil pessoal selecionado ou usado. |
| Playwright MCP | `browser_tabs(action: list)` recusado pelo gate automático: `MCP tool call requires approval, but approval policy is never`. A ferramenta foi listada, mas não foi possível obter uma aba/perfil de teste. |
| Navegador iniciado nesta rodada | Nenhum. Portanto não havia aba de teste para fechar. |
| Viewports/screenshot | Nenhuma viewport ou screenshot foi capturada. Screenshots históricos não foram reutilizados. |
| Jornadas Projetos, Operação, Tentativa e Configuração | Não executadas no browser. Os três modos, conflito, paginação, atualização e leitura histórica continuam sem prova visual. |
| Teclado, foco, nomes acessíveis, modal, contraste e zoom | Não medidos nesta rodada. Não se inventa limiar de contraste ou zoom; RNF-17/18 permanecem pendentes. |
| Conteúdo Login/Sair | Inspeção do código fonte do cliente: não há controle/tela renderizada de Login/Sair. A rota antiga `#login` somente normaliza para Principal conforme C-02. |

## Estado

AC-27, INT-11 e RNF-17–RNF-19 permanecem pendentes de execução com Playwright MCP/Chrome de teste. Build, inspeção estática do código e resultados anteriores não substituem screenshots e medições atuais. A chamada foi interrompida antes de abrir navegador; nenhuma ferramenta alternativa foi usada para contornar a recusa.

## Nova tentativa de coleta — 2026-10-17

`browser_tabs(action: list)` foi novamente recusado pelo gate automático (`MCP tool call requires approval, but approval policy is never`). Nenhuma aba, screenshot, viewport ou jornada foi obtida nesta tentativa. Permanecem pendentes os modos de projeto, conflito entre abas, paginação, atualização, leitura histórica, teclado, nomes acessíveis, foco, modal, contraste, zoom, sobreposição e corte impeditivo. O inventário visual anterior permanece preservado; esta tentativa não o substitui nem converte ausência de execução em aprovação.

## Retomada do avaliador — 2026-10-17

Repeti `browser_tabs(action: list)` pela ferramenta Playwright MCP disponível no runtime. A chamada retornou `MCP tool call requires approval, but approval policy is never`; não houve aba aberta, viewport, screenshot ou jornada. Nenhum perfil pessoal foi selecionado e não há navegador desta tentativa para fechar. Permanecem pendentes todos os percursos e medições acima, inclusive os três modos, conflito, paginação, atualização, histórico, teclado, nomes acessíveis, foco, modal, contraste, zoom, sobreposição e corte. Não foi usada ferramenta alternativa como substituta da prova Playwright MCP/Chrome.

## Verificação com acesso restabelecido - 2026-10-17, 23:10 a 23:12

Esta rodada corresponde à S34 exibida, ID interno `sprint-032`. Não substitui os resultados anteriores nem aprova o pipeline.

Playwright MCP executou em Chrome 155 no Windows, usando o navegador de teste. O servidor antigo foi interrompido pelo usuário. A inicialização pelo shell externo falhou com `CONTEXT_MISSING`; o servidor foi então iniciado no terminal próprio `Fabrica S34 - servidor`, no Maestri, por meio dos helpers Wire existentes. Nenhum provider foi recrutado, publicação iniciada ou configuração salva pela verificação.

| Verificação | Evidência e limite |
| --- | --- |
| Navegação atual | Dashboard, Projetos, Fila Ready, Tentativas, Registros e Configuração renderizaram em 1440x900 e 390x900. Não houve overflow horizontal da página nessas amostras. Screenshots: `.playwright-mcp/s34-{1440,390}-{dashboard,projetos,fila,tentativas,registros,configuracao}.png`. |
| Cadastro de origem | Modal em 390x900 com largura 350 px, de x=20 a x=370. Nove avanços por Tab mantiveram foco dentro do modal; Escape fechou e devolveu foco a Cadastrar origem. Screenshot: `.playwright-mcp/s34-390-register-modal.png`. Campos e botão fechar têm nomes na árvore acessível; não foi feito cadastro. |
| Criação | Modal medido com largura 680 px em desktop e 350 px em celular, dentro das respectivas viewports. `aria-labelledby` aponta para Criar projeto. Screenshots `.playwright-mcp/s34-{1440,390}-create-modal.png`. Não foi submetido plano nem criação. |
| Recibos | Registros exibiu revisão 1 e cursores 6 e 1 dos diagnósticos históricos, além dos IDs das operações. Confirma visualmente a correção local dos recibos após o reinício. |
| Contraste amostrado | Links laranja `rgb(251,107,0)` em branco: 2,91:1, texto de 14 px. Navegação ativa com texto branco sobre esse laranja: 2,91:1, texto de 13 px. Texto secundário `rgb(104,112,120)` sobre `rgb(248,249,250)`: 4,77:1. Medições de cores computadas opacas, não auditoria integral de conformidade. Não foi alterado o Design Lock. |
| Zoom | Control++ não alterou DPR, largura ou escala visual. Zoom nativo permanece não comprovado. Simulação CSS `zoom:2` em quatro abas não produziu overflow horizontal; screenshots `.playwright-mcp/s34-css-zoom-200-{dashboard,projetos,registros,configuracao}.png`. Essa simulação não equivale a prova do zoom nativo. |
| Console | Requisições automáticas a `/favicon.ico` retornaram 401. Houve uma ocorrência de `ERR_INCOMPLETE_CHUNKED_ENCODING` no SSE durante a sessão; depois foi observado Eventos conectados. Causa e impacto dessa ocorrência não foram isolados. Não houve erro JavaScript de execução listado. |

A instalação não contém projetos nem tentativas; a conta permanece sem vínculo, a automação está desabilitada e o despacho pausado. Por isso, esta rodada não comprova os três modos de entrega, detalhe de tentativa existente, pergunta, conflito entre abas, capacidades mudando com diálogo aberto ou paginação com múltiplas páginas. Não foram injetadas fixtures no navegador para apresentar esses estados como reais.

O impedimento de acesso ao Playwright foi resolvido. AC-27/INT-11 têm agora evidência parcial atual, mas o aceite completo da S34 continua pendente dos cenários acima, do zoom nativo e da revisão independente vinculada à referência Git imutável. As medições de contraste e os eventos do console ficam registrados para tratamento; não se declara conformidade integral.

## Medição local de contraste — contraste e favicon protegidos

Data: 2026-10-18. Esta medição combina os valores de CSS da versão em edição e o cálculo local de luminância relativa sRGB. Ela registra as duas combinações solicitadas; não substitui a observação Chrome da versão final.

| Combinação | Antes | Depois | Texto |
| --- | --- | --- | --- |
| Link em superfície branca | `#fb6b00` (`rgb(251, 107, 0)`) sobre `#ffffff`: **2,91:1** | `#b94e00` (`rgb(185, 78, 0)`) sobre `#ffffff`: **5,06:1** | 14 px, herdado de `body` |
| Navegação ativa | Branco `#ffffff` sobre `#fb6b00` (`rgb(251, 107, 0)`): **2,91:1** | Branco `#ffffff` sobre `#b94e00` (`rgb(185, 78, 0)`): **5,06:1** | 13 px, `.nav-link` |

O valor `--accent` passou a `#b94e00`; o item ativo e a marca lateral usam o mesmo token. As medições mostram melhora nas duas combinações e mantêm o acento laranja e as geometrias aprovadas. Não se estabelece limiar WCAG, SLA visual ou nível de conformidade.

Inspeção de código registra a intenção de foco, guarda de edição, um diálogo do shell, confirmação nativa da coleção, semântica, rolagem, distribuição do ICO e proteção das rotas anônimas. Testes locais foram acrescentados para a navegação de foco e os assets; seus comandos ainda não foram executados. Essas provas não medem foco/Tab, aparência ou corte renderizados. Screenshots e conteúdo da versão atual, teclado, viewports e zoom nativo ainda precisam ser registrados no Chrome; screenshots históricos não contam para essa prova.
