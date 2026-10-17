# Registro de aceite visual

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
