# Roteiro real — Aceite transversal e Perfis Globais

Identificação do plano: **S34 exibida / `sprint-032` / Aceite transversal**. Cobertura: US-23, critério 5; US-20/21 e US-16 CA3; AC-27, INT-11 e RNF-10. O registro visual anterior está em [`acceptance-transversal/visual-evidence.md`](../../acceptance-transversal/visual-evidence.md) e permanece histórico.

## Ficha da execução

| Campo | Valor observado/fornecido |
| --- | --- |
| Versão entregue | Pendente: referência imutável, commit/tree e assets distribuídos |
| Runtime | Pendente: Windows/build, Playwright MCP, Chrome, Node e distribuição |
| Responsável/papel | Pendente: operador visual/aceite e alias seguro |
| Raiz/cwd | Pendente: instalação servida no terminal-âncora e cwd; origem local observada |
| Ferramentas | Pendente: versão/listagem/chamada por runtime; browser/profile de teste; nenhum perfil pessoal |
| Alvo/conteúdo | Pendente: conta de teste vinculada, projetos/tentativas/páginas/perguntas autorizados |
| Autorização | Pendente para leitura, save de teste, pergunta/resposta, publicação e outras ações que forem exercitadas |
| Resultado/horários | `pending`; viewport, escala nativa e hora de cada screenshot a registrar |
| Limites/evidências | Pendente: screenshots atuais, conteúdo visível, medidas, IDs e limites sanitizados |

## Setup e segurança

1. Usar Playwright MCP e Chrome com perfil descartável de teste. Registrar versão do browser, viewport CSS, DPR e escala de zoom; não usar perfil pessoal. Abrir servidor apenas pelo contexto de host autorizado. Fechar somente browser/servidor iniciados pela prova.
2. Conectar a versão imutável do registro e dados reais de teste autorizados. Não criar fixture/DOM injetado e descrever como dado do produto. A autorização deve delimitar saves, resposta humana, reconciliação ou publicação antes de clicar nesses efeitos.
3. Fotografar conteúdo real e estados visíveis. Guardar screenshots atuais com path relativo/tamanho/SHA-256 após revisão de privacidade. Screenshots de 2026-10-17 e screenshots de CSS `zoom` não substituem captura atual nem zoom nativo.

## Jornadas e observações

1. **Desktop e celular:** capturar Dashboard, Projetos, Fila Ready, Tentativas, Registros, Configuração e Perfis em 1440×900 e 390×900 (ou dimensões reais do dispositivo, anotadas). Registrar cortes, sobreposição, rolagem, erros e conteúdo. Repetir no **zoom nativo Chrome** (por exemplo, 200% via menu/atalho; sem CSS `zoom`) e registrar `innerWidth`, DPR, escala do Chrome e screenshots.
2. **Teclado e acessibilidade:** árvore acessível, nomes/roles, foco inicial, Tab/Shift+Tab, Escape, retorno do foco, botão de fechar, validação de campos e foco visível. Conferir diálogos sobre rascunho sem enviar mutação por fechamento.
3. **Perfis — US-16 CA3:** usar somente perfis vivos existentes. Em cada cartão observar explicitamente **ícone, nome, provider, modelo, orientação, tipo/papel, esforço e ações Editar e Excluir**. Confirmar que não há aviso ou linha de perfil excluído misturado à coleção. Capturar pelo menos cartões de Implementador e Revisor, sem inventar perfis para preencher a tela.
4. **Paginação e seleção histórica:** abrir mais de uma página de Tentativas/Registros com dados reais; avançar/voltar e falhar uma continuação delimitada. A falha de uma seção não deve limpar as demais. Abrir tentativa antiga, escolher round/delivery, atualizar a ativa e recarregar; URL/seleção histórica e avisos da versão correta devem permanecer.
5. **Conflito entre abas:** abrir duas abas de teste no mesmo contexto; editar e salvar um recurso concorrente em uma delas. Verificar ETag/conflito, leitura atual separada e preservação do rascunho/foco na outra. Cada save efetivo exige autorização e recibo.
6. **Capacidade alterada:** com uma ação nativa aberta, atualizar a capacidade do recurso pela leitura real do produto; observar se ação habilita/desabilita e se a resposta tardia do contexto anterior é descartada. Não fingir terminal/folder capability por fixture.
7. **Pergunta concorrente:** numa pergunta de teste real autorizada, manter texto rascunhado nesta aba; responder ou expirar a mesma pergunta por ação autorizada em outra aba. Confirmar que o estado persistido atualiza sem perder o texto local, e separar TTL, espera, `delivery_unknown` e recibo. Não reenviar POST.
8. **Reconexão/resync:** interromper somente a observação do browser em cenário delimitado e observar reconexão, deduplicação, cursor e `resync`; nenhuma mutação deve ser repetida. Para falha isolada de seção, declarar se foi interrupção real do serviço ou fault injection controlada e não promovê-la a evidência de integração externa.
9. **Contraste:** medir as cores computadas das combinações em uso (links, navegação ativa, estados e erro) e registrar texto/tamanho/fundo/razão. Não inferir conformidade WCAG a partir de uma amostra. Comparar com o cálculo local histórico e documentar divergências.

## Chamadas seguras, evidências e estado

Chamadas seguras iniciais são GETs existentes, autenticados pela sessão técnica da aplicação: `GET /api/v1/settings`, `GET /api/v1/projects`, `GET /api/v1/attempts?project_id=<project_id>` e as páginas/seções do contexto autorizado. Qualquer POST/PUT, resposta, conclusão ou publicação fica fora do preflight e exige autorização por efeito. A navegação e captura são `browser real`; resultado de DOM/HTML injetado é `controlled` e deve ser descrito como tal.

Esta preparação não abriu navegador, não criou screenshots e não executou jornada. As medições e capturas históricas permanecem em seus relatórios, sem reaproveitamento para a versão ainda não identificada.
