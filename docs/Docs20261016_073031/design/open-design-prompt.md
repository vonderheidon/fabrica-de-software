# Briefing inicial — Nova fábrica de software

Voce esta iniciando uma sessao no LionDesign embarcada no LionClaw (pipeline Development V2).

## Hierarquia de prioridade

Siga esta ordem quando houver conflito:

1. **Schema do `lionclaw-design-contract` e Design Lock** — campos obrigatorios, JSON valido e rastreabilidade vencem tudo.
2. **Cobertura das user stories aprovadas** — nenhuma tela, menu, entidade, permissao ou acao pode existir sem userStoryIds ou delta explicito.
3. **Briefing de produto e mapa de telas** — organize o produto em telas reais e estados funcionais.
4. **Skill de Frontend de Alto Nivel** — melhora a qualidade visual, mas nao pode ampliar escopo nem quebrar contrato.

## Exigencias obrigatorias

- Gerar design **high-fidelity**, nao wireframe.
- Nao inventar telas, fluxos, permissoes ou entidades fora das user stories listadas abaixo.
- Gerar artifact HTML standalone (single file ou exportavel por este OD), clicavel localmente.
- Embutir o bloco `<script type="application/json" id="lionclaw-design-contract">{...}</script>` no artifact final.
- Responda e nomeie artefatos em portugues brasileiro (locale=pt-BR), salvo se o projeto configurar outro idioma.
- **Use `save_artifact` APENAS para HTML.** Markdown, prose, racional de design, decisoes ou explicacoes vao no chat — nao tente salvar como artifact (sera rejeitado pelo validator do OD).
- **NAO abra questionario, formulario de briefing, question-form ou discovery form.** Voce ja tem material suficiente. Se algo visual faltar, assuma defaults coerentes e continue.

## Defaults quando o briefing visual estiver incompleto

- Superficie principal: desktop web responsivo.
- Avaliador do prototipo: fundador tecnico / dev solo que precisa validar se o produto e implementavel.
- Tom visual: modern minimal + tech utilitario, com acabamento refinado e sem cara de landing page.
- Contexto de marca: escolha uma direcao propria, coerente com o produto e com a skill; nao peça brand spec, referencia visual ou screenshot.
- Escopo desejado: cobrir as user stories aprovadas no menor conjunto de telas funcionais.
- Restricoes adicionais: se algo estiver incerto, registre em `deltas[]` no contract e siga. So pare para perguntar se for impossivel gerar HTML valido.

## Formato OBRIGATORIO do artifact: SPA multi-tela navegavel

**Este e o ponto mais importante do briefing. Leia duas vezes.**

O artifact entregue NAO eh uma "gallery de telas", showcase, landing page, case-study, pitch deck, scroll-narrative, "design portfolio" ou pagina unica com sections empilhadas mostrando como cada tela ficaria. Esses formatos sao **proibidos**.

O artifact eh uma **Single Page Application clicavel** onde:

1. **Cada tela do contract (`screens[]`) = uma `<section>` HTML separada** com `id` igual ao `screens[].id` e atributo `hidden` por padrao.
2. **Apenas uma tela fica visivel por vez.** A troca de tela acontece por mudanca de `location.hash` (router minimo em JS inline) ou toggling de `hidden` em resposta a eventos reais (submit de `<form>`, click em botao de nav, etc.).
3. **Login com `<form>` real** (`<input type="password">`, etc.) que ao submit muda pra tela principal. Nada de "mockup decorativo" de login na mesma viewport da tela principal.
4. **Estados visuais** (idle / escutando / processando / falando, ou equivalente) sao **estados da mesma tela** alternados por interacao real (click no botao do microfone, etc.) — NAO sao 5 cards lado-a-lado mostrando "como ficaria cada estado".
5. **`navigation.primary[]` do contract precisa estar funcional**: os items listados ali precisam existir como elementos clicaveis no DOM que mudam de tela quando clicados.
6. Copy editorial / parrafos descritivos / "pitch" do produto / explicacoes sobre o design **NAO entram no HTML** — vao na resposta do chat.

### Regra anti-tela-empilhada [CRITICO]

Um `index.html` unico esta correto. O que e proibido e renderizar as telas uma abaixo da outra como uma pagina longa.

- Inclua CSS obrigatorio: `[hidden] { display: none !important; }`.
- No DOM inicial, as `section` de telas podem existir, mas **somente uma** pode estar visivel.
- A tela de login nao pode ficar acima do app shell nem aparecer junto com telas internas ao rolar a pagina.
- Telas internas como dashboard, crons, integracoes, runs, logs, cobranca e auditoria devem iniciar com `hidden`.
- O submit do login deve esconder `#login` e mostrar a primeira tela interna via JS real.
- Cliques na navegacao devem alternar `hidden` entre as sections, nao apenas rolar para anchors empilhadas.
- Se uma pessoa conseguir rolar e ver login + outra tela sem submeter login ou clicar na navegacao, o artifact esta invalido. Corrija antes de usar `save_artifact`.

Teste mental antes de salvar: "Um usuario abre o HTML, ve a tela 1 sozinha (login). Submete o form. Some a tela 1, aparece a tela 2 (principal). Clica no botao do mic. A orb muda de estado. Para de aparecer a tela 1 mesmo se rolar a pagina." Se qualquer parte desse teste falha (ex: ver login e main ao mesmo tempo ao rolar), o artifact esta errado.

## Briefing de produto e cobertura

Use o mapa abaixo para planejar telas antes de desenhar. Ele existe para evitar que o HTML vire uma copia literal das user stories.

### Mapa compacto de user stories

- US-01: Cadastrar e consultar projetos existentes | Comooperador técnico, quero cadastrar uma origem Git e consultar os projetos cadastrados, para preparar trabalho sem alterar minha pasta de desenvolvimento. | 5 criterios de aceite
- US-02: Criar projeto com efeitos escolhidos | Comooperador técnico, quero escolher a modalidade de criação e revisar seu plano, para obter um projeto com exatamente os efeitos locais e remotos autorizados. | 7 criterios de aceite
- US-03: Inspecionar criação parcial | Comooperador técnico, quero consultar os efeitos confirmados e pendentes de uma criação que falhou, para decidir sua recuperação preservando os arquivos existentes. | 3 criterios de aceite
- US-04: Configurar um projeto | Comooperador técnico, quero editar as escolhas de execução do projeto, para reutilizálas nas próximas tentativas sem alterar tentativas em andamento. | 6 criterios de aceite
- US-05: Configurar host e perfis reutilizáveis | Comooperador técnico, quero configurar o host executor e perfis exatos dos papéis, para executar as tentativas com as escolhas informadas. | 4 criterios de aceite
- US-06: Preparar e iniciar manualmente uma issue | Comooperador técnico, quero selecionar uma issue e revisar seus parâmetros, para iniciar uma tentativa com escopo e efeitos explícitos. | 6 criterios de aceite
- US-07: Consultar elegibilidade da fila Ready | Comooperador técnico, quero visualizar as issues elegíveis e seus impedimentos, para compreender qual trabalho pode ser selecionado automaticamente. | 5 criterios de aceite
- US-08: Habilitar, pausar e acompanhar a fila | Comooperador técnico, quero habilitar ou pausar a fila e conhecer sua ordenação, para controlar novos inícios sem repetir issues já consumidas. | 6 criterios de aceite
- US-09: Acompanhar responsabilidade e divergência do Kanban | Comooperador técnico, quero identificar mudanças externas de responsável ou Status, para evitar que a fábrica prossiga com autoridade desatualizada. | 6 criterios de aceite
- US-10: Interagir na sessão operacional real | Comooperador técnico, quero abrir a sessão real do papel no Maestri, para conversar e usar a TUI do OMP durante o trabalho e após o resultado. | 6 criterios de aceite
- US-11: Obter uma versão verificável da implementação | Comooperador técnico, quero acompanhar a implementação e sua versão de entrega, para identificar exatamente o conteúdo submetido aos checks e à revisão. | 6 criterios de aceite
- US-12: Receber revisão independente e correções limitadas | Comooperador técnico, quero revisão independente da versão entregue e correções dentro do limite configurado, para obter um resultado sustentado por critérios e achados verificáveis. | 6 criterios de aceite
- US-13: Responder uma decisão pendente | Comooperador técnico, quero responder perguntas vinculadas à passagem em andamento, para resolver decisões sem perder o trabalho ou reiniciar a sessão. | 6 criterios de aceite
- US-14: Cancelar e conhecer a situação da parada | Comooperador técnico, quero cancelar a tentativa e consultar seus efeitos e recursos pendentes, para interromper a continuidade sem confundir solicitação com parada confirmada. | 6 criterios de aceite
- US-15: Iniciar outra tentativa após falha ou interrupção | Comooperador técnico, quero revisar parâmetros e iniciar outra tentativa em ambiente separado, para continuar o trabalho preservando o histórico anterior. | 6 criterios de aceite
- US-16: Entregar no modo autorizado | Comooperador técnico, quero escolher o modo de entrega e consultar seus resultados, para obter ICR, commit local ou PR com os efeitos correspondentes à minha escolha. | 7 criterios de aceite
- US-17: Reconciliar e concluir publicação pendente | Comooperador técnico, quero consultar efeitos incertos e concluir apenas os pendentes autorizados, para recuperar a entrega sem duplicar recursos ou reimplementar o código. | 6 criterios de aceite
- US-18: Consultar a operação atual | Comooperador técnico, quero consultar conta, host, fila e tentativa ativa, para identificar o andamento e a próxima ação necessária. | 4 criterios de aceite
- US-19: Inspecionar tentativas e entregas anteriores | Comooperador técnico, quero consultar o histórico e os detalhes de cada tentativa, para verificar critérios, decisões e conteúdo entregue mesmo após o término dos processos. | 7 criterios de aceite
- US-20: Consultar diagnóstico acionável | Comooperador técnico, quero consultar a causa e os limites de uma falha de integração, para corrigir o prérequisito ou escolher a recuperação permitida. | 4 criterios de aceite

## Design Plan aprovado antes do LionDesign

Este e o blueprint de produto para o artifact visual. O schema do design-contract e o Design Lock continuam tendo prioridade maxima.
Plano deterministico gerado pelo LionClaw; validacao deterministica: aprovada.


Telas planejadas:
- login (Login) — Autenticar usuario antes de acessar dados protegidos. — stories: US-01
- principal (Principal) — Executar as principais tarefas do produto usando dados das stories aprovadas. — stories: US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-08, US-09, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-18, US-19, US-20

Navegacao planejada:
- Principal -> principal — stories: US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-08, US-09, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-18, US-19, US-20

Vocabulario obrigatorio de dominio:
- dashboard
- registros
- configuracao

Copy proibida ou arriscada:
- acesse seu ambiente
- painel operacional
- eleve sua produtividade

Dados fake recomendados:
(nao declarado)

Instrucoes especificas para LionDesign:
- Gere uma SPA operacional, nao uma landing page.
- Use entidades concretas das user stories e evite copy generica.
- Nao escreva regras de negocio na tela; mostre apenas dados, estados, formularios e acoes.
- Gere os fluxos de todas as telas necessarias com navegacao clicavel.
- Arquivo unico index.html e permitido, mas telas empilhadas no scroll sao proibidas. Use [hidden] e JS real para mostrar apenas uma section por vez.

Cobertura planejada:
- US-01: principal — Cobertura deterministica.
- US-02: principal — Cobertura deterministica.
- US-03: principal — Cobertura deterministica.
- US-04: principal — Cobertura deterministica.
- US-05: principal — Cobertura deterministica.
- US-06: principal — Cobertura deterministica.
- US-07: principal — Cobertura deterministica.
- US-08: principal — Cobertura deterministica.
- US-09: principal — Cobertura deterministica.
- US-10: principal — Cobertura deterministica.
- US-11: principal — Cobertura deterministica.
- US-12: principal — Cobertura deterministica.
- US-13: principal — Cobertura deterministica.
- US-14: principal — Cobertura deterministica.
- US-15: principal — Cobertura deterministica.
- US-16: principal — Cobertura deterministica.
- US-17: principal — Cobertura deterministica.
- US-18: principal — Cobertura deterministica.
- US-19: principal — Cobertura deterministica.
- US-20: principal — Cobertura deterministica.

Regras para usar este plano:
- Use este plano como mapa operacional, nao como copy literal.
- Nao mostre este plano, JSON, criterios internos ou racional no HTML.
- O HTML final deve mostrar apenas a SPA funcional do produto.
- Nao gere landing page, hero, pitch comercial, galeria de telas ou secoes explicativas.
- Um index.html unico e permitido; telas empilhadas no scroll sao proibidas.
- Inclua CSS `[hidden] { display: none !important; }` e JS real para alternar qual `section` esta visivel.
- Login e app shell nunca podem coexistir visualmente. Ao submeter login, esconda login e mostre a primeira tela interna.
- Gere os fluxos de todas as telas necessarias com navegacao clicavel.
- Nao escreva regra de negocio, criterio de aceite ou contrato como texto visivel na UI.



### Como transformar stories em telas

- Agrupe stories por tarefa do usuario, entidade de dados e momento do fluxo.
- Crie o menor conjunto de telas necessario para cobrir as stories, mas inclua estados internos ricos dentro de cada tela.
- Para cada tela planejada, defina antes de codar: objetivo, stories cobertas, acoes primarias, estados, dados exibidos/editados e destino de navegacao.
- Telas comuns esperadas quando fizer sentido: autenticacao, dashboard/listagem principal, detalhe/edicao, criacao/configuracao, revisao/resultado, estado vazio/erro.
- Nao transforme cada user story em uma tela separada se elas pertencem ao mesmo fluxo.
- Nao esconda fluxos importantes em texto estatico. Use botoes, formularios, filtros, tabs ou navegacao real.
- Antes de salvar, faça uma autocritica severa: se a tela principal pudesse servir para qualquer SaaS trocando palavras, esta ruim. Reescreva para o dominio do projeto.

## Skill aplicada: Frontend de Alto Nivel (adaptada para LionDesign)

Esta skill e uma camada de craft visual. Ela NUNCA substitui escopo, contrato ou rastreabilidade por user stories.

Baseline ativo:
- DESIGN_VARIANCE: 8 — layouts assimetricos e memoraveis em desktop; mobile sempre colapsa para coluna unica sem scroll horizontal.
- MOTION_INTENSITY: 6 — microinteracoes e movimento fluido, mas sem comprometer performance.
- VISUAL_DENSITY: 4 — app web claro, arejado e usavel no dia a dia.

Regras de hierarquia:
1. Contract + Design Lock vencem qualquer decisao estetica.
2. Cobertura de user stories vence qualquer ideia visual.
3. Cada tela, navegacao, acao, dado e API precisa declarar userStoryIds reais.
4. Elementos sem rastreio entram em deltas[]; nao viram escopo final escondido.

Direcao de frontend:
- Evite UI generica de IA: nada de roxo/azul neon, blobs decorativos, H1 central gigante, 3 cards iguais, nomes falsos tipo Joao da Silva/Maria Santos, numeros redondos tipo 99,99%.
- Para software/dashboard, use sans-serif premium e limpa; nao use serif; nao use preto puro; use off-black/zinc ou base clara refinada.
- Maximo 1 cor de acento, dessaturada e consistente.
- Priorize telas funcionais sobre landing page. O produto deve parecer utilizavel, nao uma peca de marketing.
- Formulario: label acima, helper text na marcacao, erro abaixo do input, estados loading/empty/error/success/disabled quando aplicavel.
- Use grid e agrupamento logico; cards so quando comunicam hierarquia real.
- Motion apenas com transform/opacity; nada de animar top/left/width/height; loops ou efeitos pesados devem ser isolados.

Adaptacao ao artifact HTML do LionDesign:
- Gere HTML standalone clicavel. Nao importe React/Next/Tailwind/Framer a menos que o runtime do OD ja esteja explicitamente usando isso.
- Se precisar de icones, use SVG limpo inline. Emojis sao proibidos no HTML, labels e alt text.
- Aplique o espirito da skill no HTML/CSS/JS final: assimetria controlada, composicao premium, estados completos e interacoes reais.

## Fontes originais para conferencia

As fontes abaixo sao referencia de escopo. Nao copie blocos inteiros para a UI; extraia telas, estados, dados e acoes.

### Discovery

# Discovery Notes

## Visao

### Problema
Transformar uma issue pronta em software implementado, verificado e revisado exige hoje coordenar agentes e terminais manualmente a cada rodada. A fábrica prepara o ambiente, conduz implementação e revisão independentes, executa checks e entrega conforme o modo autorizado, preservando trabalho e tornando explícitos perguntas, interrupções e efeitos incertos.

Fonte: resposta do usuário e SPEC §§1–2. Este registro consolida decisões existentes; não comprova implementação.

### Usuario principal
Operador técnico que conduz desenvolvimento a partir de issues executáveis no GitHub e usa Maestri/OMP no Windows. Cadastra ou cria projetos, configura perfis e checks, inicia uma issue ou habilita a fila Ready, acompanha resultados e responde decisões reais. A fila exige exatamente um responsável, igual à conta GitHub autenticada do controlador. A distribuição em aula exige recursos portáveis, sem diretórios pessoais.

Fonte: SPEC §§1–5 e AGENTS.md.

### Referencia
As referências funcionais são Maestri para terminais/interação, OMP para execução normal dos agentes e GitHub Issues/Projects/Git/PRs para planejamento e entrega. O sistema anterior é contexto dos problemas operacionais; Wayfinder, to-spec e to-tickets permanecem antes da fábrica na cadeia. Não há produto concorrente nem referência visual aprovada especificados. O legado Aula-IA não é base de código para esta implementação.

Fonte: SPEC §§1–3 e INTEGRACAO-MAESTRI-OMP.md §§1–4.

### Pitch
A Nova fábrica de software transforma issues executáveis do GitHub em entregas implementadas, verificadas e revisadas independentemente, usando OMP normal em terminais Maestri. O operador configura o projeto e escolhe uma issue ou habilita a fila Ready; a fábrica conduz rodadas e entrega ICR, commit local ou commit com push e PR conforme autorizaçã

... (discovery compactado — 7180 chars omitidos; use como fonte de conferencia, nao como copy literal) ...

Vercel.

#### Sequência e comprovação

Preservada a ordem da SPEC §10.1: (1) percurso integrado manual até ICR com pergunta/cancelamento/nova tentativa; (2) publicação autorizada e reconciliação; (3) fila Ready; (4) scaffold; (5) jornadas finais, diagnóstico e inicialização/documentação. Nenhuma fatia autoriza omitir requisitos da entrega final.

Aceite futuro: AC-01–AC-29 e INT-01–INT-18, nos termos vigentes dos documentos normativos. As stories apresentam a rastreabilidade; não alteram os critérios nem os declaram satisfeitos. Compilação, tools/list, texto de conversa e evidência histórica não comprovam integração/UI. Suíte padrão sem providers ou efeitos externos implícitos; ensaios reais exigem autorização e custos conhecidos.

#### Pendências do Discovery

1. Resposta sobre monetização da primeira versão; planos somente se assinatura for escolhida.
2. Validação pelo usuário do pitch e do resumo consolidado.
3. Referências visuais e Design Lock pelo mecanismo próprio do pipeline, sem aprovação presumida.

### User Stories e Requisitos aprovados

# Nova fábrica de software — User stories e requisitos

Data: 16/10/2026. Fase: elaboração de requisitos a partir do discovery. Situação: documento para validação, sem aprovação presumida, início de execução ou Design Lock.

## 1. Fontes, alcance e convenções

Fonte de entrada: [discovery20261016_073031.md](discovery20261016_073031.md), incluindo suas decisões, limites e referência a [stories.md](stories.md). Detalhamentos e critérios de comprovação foram conferidos na [SPEC](../../SPEC.md), na [integração Maestri/OMP](../../INTEGRACAO-MAESTRI-OMP.md) e no [glossário](../../GLOSSARY.md). Os documentos da raiz permanecem normativos. Este arquivo não altera seus contratos nem declara critérios satisfeitos.

Os IDs US, RF e RNF são internos a este documento. AC e INT identificam os critérios normativos existentes. Os critérios de aceite abaixo são verificações futuras; não representam resultados obtidos nesta execução.

**Persona principal:** operador técnico que conduz issues executáveis do GitHub, configura projetos e acompanha a esteira local com Maestri/OMP no Windows. A conta GitHub autenticada do controlador determina a responsabilidade pela execução.

**Vocabulário:** projeto cadastrado não é GitHub Project; tentativa tem ambiente e configuração próprios; rodada é um ciclo de implementação, checks e revisão dentro da tentativa; passagem é a atuação de um papel na rodada. ICR significa implementação, verificações e revisão independente, sem commit de entrega. Versão de entrega identifica conteúdo imutável no Git, não apenas o HEAD do clone de trabalho.

As indicações de interface descrevem padrões funcionais e estados necessários. Não definem layout, cores, tipografia, composição visual nem aprovação de design. A TUI é a interação nativa do OMP no terminal Maestri; não há requisito de criar chat ou terminal web próprios.

... (stories-requisitos compactado — 59121 chars omitidos; use como fonte de conferencia, nao como copy literal) ...

has e indisponibilidades. A pendência impede concluir o aceite quantitativo correspondente; esta revisão não declara aceite visual nem Design Lock. |

## 8. Comprovação prevista

O aceite futuro segue SPEC §10.2: decisões determinísticas, contratos HTTP/SQLite/Git, percurso real Maestri/OMP e interface observada por Playwright MCP/Google Chrome de teste. As ferramentas de teste já definidas são preservadas; este documento não inventa comandos nem afirma que foram executados.

A sequência vigente é: percurso integrado manual até ICR com pergunta/cancelamento/nova tentativa; publicação autorizada e reconciliação; fila Ready; scaffold; jornadas finais, diagnóstico e inicialização/documentação. Todas as capacidades continuam exigidas na entrega final.

Nesta fase, a validação é documental: leitura UTF-8, integridade dos IDs, referências entre histórias e requisitos, cobertura AC/INT e consistência com o discovery e seus contratos. Não comprova integração, uso de provider, funcionamento de UI ou aprovação visual.

## Notas adicionais do PRD Validator

(prd-validator ausente)

## Design System

- (nenhum design system selecionado — usar default coerente com o briefing)

## Configuracao da sessao (somente metadados — nao contem credenciais)

```json
{
  "agentId": "configured-in-open-design-studio",
  "model": "configured-in-open-design-studio",
  "reasoning": null,
  "designSystemId": null,
  "memoryEnabled": false,
  "mcpServerIds": [],
  "locale": "pt-BR"
}
```

## Entrega esperada

- **SPA multi-tela** seguindo o "Formato OBRIGATORIO" acima — um `<section>` por screen, um visivel por vez, transicoes por interacao real.
- `index.html` standalone unico e permitido; telas empilhadas no scroll sao proibidas.
- Bloco `lionclaw-design-contract` embutido no HTML EXATAMENTE no shape definido abaixo.
- Texto e copy em pt-BR **dentro das telas funcionais** — sem prose marketing, sem hero copy editorial, sem "## Sobre o produto", sem pitch.

Se uma user story exigir interpretacao, use o contexto disponivel, registre a decisao em `deltas[]` quando necessario e continue. Nao bloqueie a entrega com perguntas de briefing visual.

## Schema OBRIGATORIO do bloco `lionclaw-design-contract`

Este JSON eh consumido pelo validator do LionClaw. **Qualquer campo extra eh permitido, mas TODOS os campos abaixo sao obrigatorios** — sem isso o Design Lock rejeita.

```html
<script type="application/json" id="lionclaw-design-contract">
{
  "version": "1.0",
  "visual": {
    "direction": "string descritiva da direcao visual (ex: 'software dark utilitario com acento amber')",
    "density": "dense | balanced | editorial | mobile-first | unknown",
    "tokens": {
      "colors": { "bg": "#09090b", "accent": "#d97706", "...": "..." },
      "typography": { "display": "Geist", "body": "Satoshi", "...": "..." },
      "spacing": { "xs": "4px", "sm": "8px", "...": "..." },
      "radii": { "sm": "4px", "md": "8px", "...": "..." }
    }
  },
  "navigation": {
    "primary": [
      { "id": "nav-play", "label": "Jogar", "targetScreenId": "play", "userStoryIds": ["US-02"] }
    ],
    "secondary": []
  },
  "screens": [
    {
      "id": "login",
      "userStoryIds": ["US-01"],
      "title": "Login",
      "route": "#login",
      "purpose": "Autenticar usuario",
      "states": ["loading", "error", "success"],
      "actions": [
        { "id": "action-login", "label": "Entrar", "type": "submit", "userStoryIds": ["US-01"], "apiExpectationIds": ["api-login"] }
      ],
      "dataRequirementIds": ["data-user-login"]
    }
  ],
  "components": [
    { "id": "btn-primary", "name": "Botao primario", "type": "form", "usedInScreenIds": ["login"], "props": {}, "states": [] }
  ],
  "dataRequirements": [
    {
      "id": "data-user-login",
      "name": "Credenciais de login",
      "description": "Dados informados pelo usuario para autenticacao",
      "fields": [
        { "name": "email", "typeHint": "string", "required": true },
        { "name": "password", "typeHint": "string", "required": true }
      ],
      "sourceScreenIds": ["login"],
      "userStoryIds": ["US-01"]
    }
  ],
  "apiExpectations": [
    {
      "id": "api-login",
      "operation": "POST /auth/login",
      "screenIds": ["login"],
      "actionIds": ["action-login"],
      "methodHint": "POST",
      "requestShape": { "email": "string", "password": "string" },
      "responseShape": { "token": "string" },
      "userStoryIds": ["US-01"]
    }
  ],
  "deltas": [
    {
      "id": "delta-001",
      "type": "unclear",
      "description": "explicacao do delta",
      "impact": "low",
      "relatedUserStoryIds": [],
      "requiresRequirementsChange": false
    }
  ]
}
</script>
```

**Regras criticas:**
- `version` deve ser literalmente `"1.0"`.
- Cada `screens[]`, `navigation.primary[]` e `dataRequirements[]`/`apiExpectations[]` referencia user stories por `userStoryIds: string[]` (use os IDs reais do briefing, ex: `"US-01"`).
- Cada `apiExpectations[]` precisa declarar `screenIds: string[]`, `actionIds: string[]` e `userStoryIds: string[]`, mesmo que algum deles seja `[]`.
- Cada `dataRequirements[]` precisa declarar `fields[]`, `sourceScreenIds: string[]` e `userStoryIds: string[]`.
- Telas/componentes/dados/APIs SEM user story listada → registrar como `deltas[]` com `description` explicando por que existe.
- `components[]`, `apiExpectations[]`, `dataRequirements[]` e `deltas[]` exigem `id: string` unico.
- `deltas[]` exige `type`, `description`, `impact`, `relatedUserStoryIds` e `requiresRequirementsChange`.
- Use os 4 grupos de tokens (`colors`, `typography`, `spacing`, `radii`) mesmo que parcialmente vazios — eles sao obrigatorios na estrutura.

Campos adicionais ao schema (ex: `project`, `design_system`, `acceptance_criteria_visualized`) sao tolerados, mas os campos acima nao podem faltar.
