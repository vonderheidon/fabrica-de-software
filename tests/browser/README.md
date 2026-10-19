# Regressões do primeiro acesso

Execute `npm.cmd run build`, reinicie o controller pelo host autorizado e abra a aplicação no Playwright MCP. Com a página no endereço da fábrica, execute `browser_run_code_unsafe` com `filename: 'tests/browser/onboarding-regressions.playwright.js'` (ou o caminho absoluto do arquivo).

O script usa a configuração consultada como base para respostas controladas no navegador. Não grava perfis, pasta ou vínculo de conta. O catálogo é fictício e não chama providers. Os dez minutos de espera são simulados pelo relógio do navegador.

| Caso | Ação | Resultado exigido |
| --- | --- | --- |
| REG-01 | Com GitHub já confirmado, voltar à primeira etapa e clicar em Continuar para a pasta sem verificar GitHub novamente | Etapa da pasta abre sem uma nova consulta ao GitHub |
| REG-02 | Abrir a seleção da pasta e avançar dez minutos no relógio | Uma única requisição continua pendente, sem aborto ou reabertura; botão de seleção permanece bloqueado |
| REG-03 | Cancelar a seleção após a espera | Mensagem de cancelamento aparece e a pasta anteriormente salva é preservada |
| REG-04 | Com pasta confirmada, clicar em Continuar para os perfis | Formulário de Implementador abre |
| REG-05 | Digitar Nome em várias alterações; selecionar Provider, Modelo e Esforço; digitar Orientações em várias alterações | Formulário permanece visível, valores são preservados e não há exceção JavaScript |
| REG-06 | Trocar para provider incompatível e escolher modelo sem esforço | Modelo incompatível é limpo, esforço fica vazio e Nome/Orientações são preservados |

REG-01 a REG-06 são verificados pelo script. O teste HTTP `tests/integration/native-selection-http.proof.ts` complementa REG-02/03 com o POST real e a desconexão do cliente. O teste `keeps the picker open without a deadline` em `tests/integration/projects.test.ts` cobre o prazo no controlador e a exclusividade entre tipos; `removes the handler deadline only from native selection` preserva os limites das demais rotas.

## Conferência nativa no Windows

Estes casos exigem a janela real do Windows e não são comprovados pelo catálogo ou seletor simulado do teste de navegador:

| Caso | Ação | Resultado exigido |
| --- | --- | --- |
| REG-07 | Clicar em Selecionar pasta | Abre o diálogo moderno do Explorer, com navegação por pastas e barra de endereço, sem a antiga árvore de diretórios |
| REG-08 | Deixar o diálogo real aberto por mais de três minutos; depois escolher uma pasta local | Janela permanece aberta e retorna o caminho escolhido como candidato; nada é salvo automaticamente |
| REG-09 | Abrir o diálogo e fechar a tela de configuração ou desconectar o navegador | A janela nativa é encerrada; outra seleção só é permitida após a confirmação do encerramento |

REG-07 a REG-09 permanecem como validação manual. A aceitação visual do seletor não é substituída por testes HTTP.
