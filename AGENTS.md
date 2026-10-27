# Nova fábrica de software

## Objetivo

Construir uma esteira local que coordena implementação, checks, revisão, correção e entrega de software, usando Maestri, OMP, Git e MCPs existentes. A fábrica coordena desenvolvimento; não é um novo harness, sandbox ou sistema de backup.

## Fontes de verdade

Antes de planejar ou alterar código, leia as seções pertinentes e identifique os critérios de aceite da tarefa:

| Fonte | Quando consultar |
| --- | --- |
| `SPEC.md` | Produto, stack, arquitetura, dados, jornadas e critérios AC; contrato principal |
| `INTEGRACAO-MAESTRI-OMP.md` | Executor, terminal Maestri, resultados, MCPs, cancelamento e critérios INT |
| `GLOSSARY.md` | Termos de domínio, estados e significado de Ready |
| `.agents/skills/` | Instruções da skill pertinente à tarefa; leia seu `SKILL.md` antes de aplicar |
| `ensaios-fabrica/MANUAL-MAESTRI-WIRE.md` | Acesso do LionClaw ao Maestri para ensaios, usando os helpers existentes |
| `ensaios-fabrica/casos/validacoes.json` e `ensaios-fabrica/evidencias/relatorio-validacao.md` | Prova mínima de acesso e limites efetivamente observados |

`PESQUISA-PONTE-LIONCLAW-MAESTRI.md` é pesquisa exploratória, não backlog. Evidências de ensaio não comprovam o produto implementado. Havendo conflito entre documentos normativos, registre o ponto e peça decisão antes de mudar o contrato; não restaure requisitos de estudos descartados.

## Trabalho no workspace e pipeline dev 2.0

- Trabalhe neste repositório canônico. Preserve alterações existentes; não crie cópias, worktrees ou floors concorrentes para desenvolver esta fábrica. Os clones por tentativa previstos no produto são outro contexto.
- Use a SPEC existente como entrada do pipeline. Preserve decisões consolidadas; pergunte somente por lacunas que afetem produto ou escopo e não possam ser respondidas pelas fontes disponíveis.
- Siga a tarefa e os artefatos aprovados da fase atual. Mudança de fase, aprovação e Design Lock pertencem aos mecanismos do pipeline; não simule esses eventos nem trate esta instrução como aprovação.
- O Design Lock do dev 2.0 é decisão do usuário. Mantenha o layout aprovado ao implementar a UI e registre conflitos com requisitos funcionais.
- Resolva manutenção operacional reversível autonomamente. Não amplie escopo para construir infraestrutura sem um impedimento concreto da implementação.
- Diferencie requisitos do produto de restrições dos ensaios. O perfil Luna/high em `ensaios-fabrica/AGENTS.md` vale para esses ensaios, não fixa todos os perfis configuráveis da fábrica.

## Implementação

- Siga a arquitetura e a sequência de fatias funcionais da SPEC, seções 8 e 10. Comece pelo percurso integrado verificável; cada fatia deve produzir comportamento real.
- Stack definida: TypeScript strict, Node.js LTS, Fastify, React/Vite e SQLite, com dependências fixadas em lockfile. Consulte a SPEC para versões e organização. Não invente comandos de build ou teste antes de existir configuração executável.
- Implemente os módulos do zero. Não analise, copie, importe ou encapsule o legado Aula-IA como base. Avalie um workaround somente quando um problema concreto exigir e documente a decisão pertinente.
- Use OMP, ferramentas nativas e gerenciamento MCP normais. Preserve a TUI e a interação previstas no contrato. Integrações próprias só com necessidade concreta e escopo mínimo.
- Para o scaffold, consulte `.agents/skills/setup-matt-pocock-skills/SKILL.md` e os recursos referenciados, conforme SPEC 3.2. Essa referência orienta o produto; não execute seu setup neste workspace por mera leitura destas instruções.
- Use caminhos relativos ou configuração resolvida em runtime. O produto será distribuído em aula e não pode depender de diretórios pessoais ou recursos desta máquina.

## Persistência

- Git é a fonte do conteúdo versionado. O workflow persiste configuração, critérios, resultados, evidências pertinentes, estado operacional e referências Git/hashes estritamente necessários.
- Não copie checkout, índice Git, ignorados ou caches para SQLite, JSON, Base64 ou snapshots auxiliares. Compressão, deduplicação e armazenamento externo não justificam preservar esse excesso.
- Histórico, listagens e polling consultam resumos leves; detalhes são carregados sob demanda. Valide tamanho persistido e latência com caches volumosos, conforme AC-29.
- Identifique a versão aprovada por referências Git imutáveis. Publicação deve usar essa versão; correções geram outra rodada e outra referência.

## Validação e entrega

- Antes de editar, defina como comprovar o comportamento e quais critérios AC/INT são pertinentes. Use os comandos efetivamente configurados no repositório.
- Siga SPEC 10.2: testes determinísticos e de contratos nas superfícies pertinentes; integração real Maestri/OMP para o percurso; Playwright MCP/Chrome para a UI. Compilação e typecheck não comprovam funcionamento da integração ou da interface.
- Suíte padrão não chama providers, recruta terminais nem publica recursos externos implicitamente. Execuções reais exigem autorização correspondente, com custo e efeitos conhecidos.
- Revisão independente avalia a versão entregue. Registre achados e correções sem sobrescrever os resultados anteriores; não exija revisão de outro agente para cada ajuste documental.
- Informe o que mudou, o que foi comprovado e o que permanece sem validação. Falha, interrupção ou evidência parcial não são sucesso.

## Ferramentas e segurança

- Para documentação atual de bibliotecas, frameworks, SDKs, APIs e CLIs, use Context7: primeiro `resolve-library-id`, depois `query-docs` por conceito. Se indisponível, use a documentação oficial e informe a limitação.
- Se o CodeGraph estiver disponível, use-o para orientação; confirme detalhes no arquivo atual quando estiver desatualizado. Fontes normativas e arquivos prevalecem sobre o grafo.
- Comandos Git locais de consulta, como `git status`, `git diff`, `git log` e `git show`, podem usar o contexto disponível, sem elevação nem acesso ao keyring. Para operações que dependam de autenticação Git/GH, use o contexto autorizado com acesso ao keyring do Windows. Se esse contexto estiver indisponível, relate a limitação; não refaça login nem altere credenciais para contorná-la.
- Nunca exponha segredos em comandos, prompts, logs ou arquivos. Credenciais Wire ficam fora do repositório; utilize os helpers existentes.
- Push, publicação externa, alterações no tracker e ações destrutivas exigem autorização correspondente. A preparação do workspace não autoriza esses efeitos nem inicia o pipeline.
