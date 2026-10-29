# Nova fábrica de software

## Fontes de verdade

Leia `AGENTS.md` antes de trabalhar. Consulte `README.md` e `docs/operation/README.md` para execução e operação; `GLOSSARY.md` para termos e estados. Use o código, os contratos e os testes atuais para conferir o comportamento implementado. Requisitos novos dependem do escopo aprovado pelo usuário.

## Stack e estrutura observadas

- TypeScript strict, módulos ESM e resolução NodeNext; Node.js 24.x.
- Backend Fastify 5, schemas e DTOs TypeBox, SQLite via better-sqlite3.
- Frontend React 18 com Vite; testes Vitest. Versões exatas e comandos executáveis estão em `package.json` e `package-lock.json`.
- `apps/controller/src/main.ts`: composição e ciclo de vida do controlador; `config.ts`: configuração de bootstrap.
- `apps/controller/src/http/`: rotas, segurança HTTP, assets e tradução de erros.
- `apps/controller/src/modules/`: projects, github, pipeline, workspaces, execution, verification, publication, storage, queries e diagnostics.
- `resources/storage/`: schema inicial e reconhecimento de bases; persistência e revisões de configuração pertencem ao módulo storage.
- `apps/web/src/app/`: estrutura da aplicação; `api/`: cliente HTTP; `features/`: projects, preparations, attempts, queue, operations e records.
- `packages/contracts/src/`: schemas e tipos compartilhados, sem IO.
- `resources/`: recursos distribuídos; `scripts/`: build, empacotamento e verificações; `tests/`: testes integrados, de aceitação e fixtures.
- `docs/operation/README.md`: instalação, terminal-âncora, configuração e recuperação.

## Convenções do código

- Símbolos de código em inglês; componentes React em PascalCase, funções e variáveis em camelCase; arquivos auxiliares também usam kebab-case.
- Imports relativos TypeScript usam extensão `.js`; contratos compartilhados entram pelo alias `#contracts`.
- Interfaces públicas dos módulos ficam em `index.ts`. Confirme fronteiras em `scripts/check-boundaries.mjs`: chamadas entre módulos usam a interface pública; SQL fica em storage, GH em github, Git em workspaces e Maestri/OMP em execution.
- Schemas TypeBox fornecem validação em runtime e tipos estáticos. Preserve as opções strict de `config/tsconfig.base.json` e as verificações contra `any` explícito e supressões TypeScript.
- Comandos de configuração usam operações idempotentes, recibos persistidos e controle de concorrência com ETag/revisão. A UI preserva rascunhos e trata respostas assíncronas por contexto/ciclo de vida.

## Identidade e operação

- API local com Host/Origin exatos, cookie HttpOnly de sessão técnica e CSRF nas mutações. Essa sessão não identifica uma pessoa nem concede autoridade GitHub.
- A identidade GitHub é observada pelo adapter autorizado. O banco distingue a conta configurada da conta observada; observar uma conta não constitui vínculo inicial.
- O controlador inicia em terminal-âncora dentro do Maestri e usa OMP como executor. Consulte o manual de operação antes de alterar bootstrap ou capacidades confiáveis do host.

## Validação

Use os scripts reais de `package.json`. A base de validação local é `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`; selecione os checks adicionais conforme a superfície alterada. A suíte padrão usa provas controladas. Integração real Maestri/OMP/GitHub e aceite de UI exigem as evidências próprias definidas nos documentos normativos.
