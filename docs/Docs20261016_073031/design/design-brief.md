# Design Brief

## Direcao Visual

**Direcao:** Software utilitário claro, tipografia sans-serif, acento laranja e navegação grafite e composição assimétrica
**Densidade:** balanced

## Tokens

### Cores

| Token | Valor |
|-------|-------|
| bg | #f8f9fa |
| surface | #ffffff |
| fg | #202122 |
| muted | #687078 |
| border | #e9eaec |
| accent | #fb6b00 |

### Tipografia

| Token | Valor |
|-------|-------|
| display | Segoe UI, system-ui, sans-serif |
| body | Segoe UI, system-ui, sans-serif |
| mono | Consolas, monospace |

### Espacamento

| Token | Valor |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 38px |

### Radii

| Token | Valor |
|-------|-------|
| sm | 5px |
| md | 9px |
| lg | 12px |

## Mapa de Telas

- **Login** (`login`) — rota: `#login` — stories: US-01
- **Principal** (`principal`) — rota: `#principal/dashboard` — stories: US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-08, US-09, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-18, US-19, US-20

## Navegacao Principal

- **Principal** (`nav-principal`) -> tela `principal` — stories: US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-08, US-09, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-18, US-19, US-20

## Componentes Principais

- **Navegação e contexto do host** (`app-shell`) — tipo: `navigation`
- **Detalhe da tentativa** (`attempt-detail`) — tipo: `dialog`
- **Cadastro e plano de criação** (`project-form`) — tipo: `form`

## Deltas

- **unclear** (`delta-mock`) — impacto: low
  Todos os projetos, contas, SHAs, resultados, horários e recursos apresentados são amostras fictícias. Operações externas são simuladas; apenas configuração não sensível persiste em localStorage.
- **unclear** (`delta-api`) — impacto: medium
  Expectativas descrevem as três submissões locais já existentes no protótipo. Endpoints e formatos HTTP não foram definidos; nenhuma chamada externa é realizada e nenhum contrato de backend é introduzido.
- **unclear** (`delta-compact`) — impacto: high
  Critérios completos foram truncados no briefing. Cobertura representa os objetivos resumidos das 20 stories e requer conferência com SPEC e critérios integrais antes do Design Lock.
- **unclear** (`delta-states`) — impacto: low
  Abas e diálogos são estados internos da Principal, preservando o plano aprovado de duas telas. Referência de sessão Maestri pode ser copiada; abertura nativa depende da integração futura.
