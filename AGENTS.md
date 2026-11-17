# Nova fábrica de software

Esteira local que coordena implementação, checks, revisão, correção e entrega de software usando Maestri, OMP, Git e GitHub. A fábrica coordena desenvolvimento; não é um novo harness, sandbox ou sistema de backup.

## Fontes de verdade

| Fonte | Quando consultar |
| --- | --- |
| `README.md` e `docs/operation/README.md` | Instalação, execução, operação e validação |
| `GLOSSARY.md` | Termos de domínio, estados e significado de Ready |
| `package.json`, código, contratos e testes | Comandos e comportamento implementado |
| `docs/manutencao-maestri.md` | Acesso de manutenção ao Maestri por shell externo |

Requisitos novos dependem do escopo aprovado pelo usuário. Registre conflitos antes de mudar um contrato.

## Stack e estrutura

- TypeScript strict, ESM e resolução NodeNext; Node.js 24.x; dependências fixadas no lockfile.
- Backend Fastify 5 com schemas TypeBox e SQLite via better-sqlite3. Frontend React 18 com Vite. Testes Vitest.
- `apps/controller/src/`: `main.ts` (composição e ciclo de vida), `config.ts` (bootstrap), `http/` (rotas, segurança, assets) e `modules/` (projects, github, pipeline, workspaces, execution, verification, publication, storage, queries, diagnostics).
- `apps/web/src/`: `app/` (estrutura), `api/` (cliente HTTP) e `features/`.
- `packages/contracts/src/`: schemas e tipos compartilhados, sem IO.
- `resources/`: recursos distribuídos. Em `storage/` ficam o schema inicial, as migrações e o reconhecimento de bases antigas; preserve as versões históricas.
- `scripts/`: build, empacotamento e verificações. `tests/`: integração, aceitação, provas nativas e fixtures.

## Convenções

- Símbolos de código em inglês. Componentes React em PascalCase, funções e variáveis em camelCase, arquivos auxiliares em kebab-case.
- Imports relativos usam extensão `.js`; contratos entram pelo alias `#contracts`.
- A interface pública de cada módulo fica em `index.ts`. Chamadas entre módulos usam essa interface; SQL fica em storage, GH em github, Git em workspaces e Maestri/OMP em execution. `scripts/check-boundaries.mjs` (`npm.cmd run lint`) verifica essas fronteiras.
- Preserve as opções strict de `config/tsconfig.base.json`, sem `any` explícito nem supressões TypeScript.
- Comandos de configuração usam operações idempotentes, recibos persistidos e controle de concorrência por ETag/revisão. A UI preserva rascunhos e trata respostas assíncronas pelo contexto de origem.
- Use caminhos relativos ou resolvidos em runtime. O produto é distribuído e não pode depender de diretórios pessoais ou recursos de uma máquina específica.
- Implemente por fatias funcionais verificáveis. Integrações próprias só com necessidade concreta e escopo mínimo.

## Identidade e segurança

- A API local exige Host/Origin exatos, cookie HttpOnly de sessão técnica e CSRF nas mutações. Essa sessão não identifica uma pessoa nem concede autoridade GitHub.
- A identidade GitHub é observada pelo adapter autorizado; o banco distingue a conta configurada da observada.
- O controlador inicia em um terminal-âncora dentro do Maestri e usa o OMP como executor. Consulte o manual de operação antes de alterar bootstrap ou capacidades confiáveis do host.
- Nunca exponha segredos em código, comandos, logs ou arquivos.

## Persistência

- Git é a fonte do conteúdo versionado. O workflow persiste configuração, critérios, resultados, evidências pertinentes, estado operacional e as referências Git estritamente necessárias.
- Não copie checkout, índice Git, ignorados ou caches para SQLite, JSON, Base64 ou snapshots auxiliares.
- Histórico, listagens e polling consultam resumos leves; detalhes são carregados sob demanda.
- A versão aprovada é identificada por referências Git imutáveis. Correções geram outra rodada e outra referência.

## Validação

- Base local: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`. Selecione os demais scripts do `package.json` conforme a superfície alterada.
- `npm.cmd start` usa o bundle de `dist/`: depois de alterar o código, rode o build antes de iniciar.
- A suíte padrão não chama providers, não recruta terminais e não publica recursos externos. Execuções reais com Maestri/OMP/GitHub exigem autorização, com custo e efeitos conhecidos.
- Compilação e typecheck não comprovam integração nem interface; valide a UI no navegador.
- Informe o que mudou, o que foi comprovado e o que ficou sem validação. Falha ou evidência parcial não é sucesso.
- Push, publicação externa, alterações no tracker e ações destrutivas exigem autorização correspondente.
