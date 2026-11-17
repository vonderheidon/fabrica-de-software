# Nova Fábrica de Software

Esteira local que coordena implementação, revisão, correção e entrega de software com Maestri, OMP e GitHub. Oferece os modos ICR, ICR + commit e ICR + commit + PR.

## Executar a partir do repositório

Use Node.js 24.x e npm. Instale as dependências e compile na raiz do repositório:

```powershell
npm.cmd ci --cache .cache/npm --no-audit --no-fund
npm.cmd run build
```

Em um terminal dentro do Maestri, entre na pasta do repositório e execute:

```powershell
npm.cmd start
```

Acesse http://127.0.0.1:4310. O launcher procura Git, Maestri, OMP, PowerShell e GitHub CLI; configure as ferramentas e a conta pela interface. Git deve ser 2.45 ou posterior. O servidor usa o bundle compilado em `dist/`: alterações de fonte exigem novo build e reinicialização.

O endpoint http://127.0.0.1:4310/api/v1/health verifica a disponibilidade HTTP e SQLite. Ele não comprova integração com Maestri, OMP ou providers.

Consulte o [manual de operação](docs/operation/README.md) para configuração, modos de entrega, revisão web, recuperação e encerramento.

## Validar alterações

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:http
npm.cmd run test:acceptance
```

Depois do build, as verificações do código compilado são:

```powershell
npm.cmd run test:compiled
npm.cmd run test:execution-compiled
```

Os comandos disponíveis estão em [package.json](package.json). Testes locais não substituem provas reais de Maestri/OMP, interface, publicação ou aceite do usuário.

## Gerar distribuição local

```powershell
npm.cmd run package:local
npm.cmd run test:distribution
```

`package:local` compila e cria uma pasta nova em `build/Fábrica distribuição-<id>`, com runtime e dependências de produção. O pacote depende do sistema operacional, arquitetura e ABI nativa registrados em `distribution.json`. Não inclui dados operacionais nem configuração pessoal.

## Organização

| Caminho | Finalidade |
| --- | --- |
| `apps/controller/` | Servidor e coordenação da esteira |
| `apps/web/` | Interface |
| `packages/contracts/` | Contratos compartilhados |
| `resources/` | Recursos usados no build e na execução |
| `scripts/`, `tests/` | Build, empacotamento e validações |
| `docs/` | Manual de operação, manutenção do Maestri e roadmap |
| `var/` | Dados locais da instalação; não tratar como cache descartável |
| `dist/`, `build/` | Compilação e distribuições geradas |

## Referências de desenvolvimento

- [GLOSSARY.md](GLOSSARY.md): termos e estados.
- [AGENTS.md](AGENTS.md): regras de trabalho no repositório.
