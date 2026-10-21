# Exclusão definitiva de projetos: histórias e requisitos

## 1. Base e limites

Fonte de escopo: `docs/Docs20261020_114742/discovery20261020_114742.md`. Análise realizada em 20/10/2026 sobre o repositório existente, com leitura de `CLAUDE.md`, fontes pertinentes de `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md`, `GLOSSARY.md` e código abaixo. Os caminhos de referência deste documento são relativos à raiz canônica do projeto.

Este documento especifica comportamento futuro. Não comprova implementação, não aprova control gates e não autoriza exclusão real. Cadastro, pasta de origem e GitHub Project continuam entidades distintas. A exclusão é uma operação explícita separada do cadastro, preparação, cancelamento e limpeza automática.

Inclui cadastro escolhido, histórico, evidências, pasta original inteira e ambientes locais exclusivos. Exclui mutações no GitHub, remoção de recursos compartilhados, backup automático, cancelamento após confirmação e busca por pastas movidas. Não se propõe tecnologia nova.

## 2. Arquitetura existente e pontos de integração

| Superfície observada | Arquivos e responsabilidade para a feature |
| --- | --- |
| Configuração e seleção na UI | `apps/web/src/features/projects/ProjectForm.tsx`, `useConfiguration.ts`, `ProjectPicker.tsx` e `useProjects.ts`: entrada da ação no cadastro escolhido, revisão de configuração e atualização da seleção/listagem. Ainda é necessário acrescentar o fluxo de exclusão. |
| Comandos e respostas incertas na UI | `apps/web/src/features/projects/save-lifecycle.ts`, `configuration-requests.ts` e `apps/web/src/api/uncertain-operations.ts`: padrões de contexto, operação pendente e recuperação. A lista atual de tipos de operação incerta não contempla exclusão de projeto; armazenamento da sessão do navegador não substitui estado durável no servidor. |
| API e contratos | `apps/controller/src/http/routes/projects.ts` oferece cadastro, consulta e configuração, sem rota de exclusão. Usa `commandHeaders`, schemas TypeBox, ETag e contratos de `packages/contracts/src/projects.ts`. Novos contratos devem seguir essas fronteiras, sem fixar neste documento nomes de endpoints futuros. |
| Coordenação de projeto e fila | `apps/controller/src/modules/projects/index.ts`, `projects/queue.ts`, `projects/preparations.ts`, `pipeline/start.ts` e `main.ts`: integrar bloqueio de novos trabalhos e exclusão das oportunidades de despacho. |
| Publicação e recuperação | `apps/controller/src/modules/publication/index.ts`, `storage/publication.ts`, `storage/effects.ts`, `storage/recovery.ts` e `pipeline/recovery.ts`: consultar atividade, efeitos incertos e recursos antes de remover. `storage/recovery.ts` já distingue lançamento em início, parada incerta e limpeza pendente. |
| Persistência | `apps/controller/src/modules/storage/`: SQL, operações, eventos, configurações, preparações, tentativas, entregas, diagnósticos e fila. A migration `003_projects_configuration.sql` contém referências restritivas, referência circular entre projeto e revisão e trigger de imutabilidade que impede excluir revisão. As migrations posteriores também protegem histórico, efeitos e consumos da fila. |
| Arquivos e entregas retidas | `apps/controller/src/modules/workspaces/index.ts`, `inspect.ts`, `capture.ts`, `retention.ts` e `recovery.ts`: limites de filesystem e Git. `retention.ts` verifica identidade de repositório gerenciado de entrega; isso não constitui implementação da exclusão do cadastro. |
| Integrações preservadas | `modules/github/index.ts` e `modules/execution/index.ts`: respeitar isolamento de GitHub e execução. Recuperar exclusão não concede autoridade de publicação nem restaura sessão de execução. |

Padrões observados: TypeScript strict e ESM, React/Vite, Fastify, TypeBox, SQLite via better-sqlite3 e Vitest. Código em inglês, componentes PascalCase, funções camelCase, imports relativos com `.js` e alias `#contracts`. Interfaces públicas ficam em `index.ts`; SQL pertence a storage, filesystem/Git a workspaces, GitHub a github e Maestri/OMP a execution. Não inserir IO de filesystem em transações SQLite síncronas.

Os testes existentes usam `describe`, `it`, fixtures temporárias, mocks de dependências e injeção HTTP, como em `tests/integration/projects.test.ts`. Há testes de lifecycle em `tests/project-save-lifecycle.test.ts`, operações em `storage/operations.test.ts` e recuperação em `workspaces/recovery.test.ts`. Esses padrões são referência de validação, sem presumir cobertura atual da feature.

## 3. User stories

### Domínio A: decisão e confirmação

**US-01. Como operador, quero iniciar a exclusão pela configuração do cadastro escolhido, para remover o contexto local correto.**

Critérios de aceite:
1. A ação na configuração identifica o cadastro selecionado e apresenta seus caminhos atingidos antes de qualquer remoção.
2. Trocar a seleção enquanto uma resposta anterior está pendente não faz a confirmação atuar no novo cadastro.
3. Abrir a confirmação ou sair dela antes de confirmar não remove arquivos nem dados.

Integração: `ProjectForm.tsx`, `useConfiguration.ts`, `ProjectPicker.tsx` e rotas de projetos.

**US-02. Como operador, quero confirmar por clique as perdas apresentadas, para autorizar conscientemente a exclusão definitiva.**

Critérios de aceite:
1. Antes do clique, a confirmação informa remoção do cadastro, histórico, evidências, pasta original inteira e ambientes exclusivos, incluindo `.git`, ignorados, arquivos pessoais e trabalho não publicado.
2. Informa ausência de backup automático, ausência de cancelamento após confirmar e necessidade de retirar previamente o que se deseja preservar.
3. Informa que recursos GitHub e compartilhados serão preservados e que conteúdo acrescentado aos caminhos autorizados até concluir também será removido.
4. O clique autoriza apenas o cadastro e os caminhos apresentados; repetição da mesma solicitação não cria outra exclusão.

Integração: contratos de projetos, `commandHeaders`, operações persistidas e lifecycle da UI.

### Domínio B: bloqueios e isolamento

**US-03. Como operador, quero receber bloqueios quando houver trabalho ativo ou incerto, para não remover recursos ainda em uso.**

Critérios de aceite:
1. Tentativa ativa, publicação em andamento, lançamento pendente ou efeito incerto impedem o início dos efeitos destrutivos.
2. Pedido de cancelamento sem confirmação de encerramento continua bloqueando a exclusão.
3. O bloqueio mostra motivo e próxima ação em PT-BR, sem oferecer parada forçada como parte desta feature.
4. Em disputa com despacho automático, início manual ou publicação, não coexistem exclusão aceita e novo trabalho autorizado para o cadastro.

Integração: `projects/queue.ts`, `pipeline/start.ts`, `publication/index.ts` e `storage/recovery.ts`.

**US-04. Como operador, quero preservar outros cadastros e recursos compartilhados, para excluir somente o contexto escolhido.**

Critérios de aceite:
1. Dois cadastros do mesmo repositório mantêm dados, histórico e recursos do cadastro não selecionado.
2. Se remover um alvo prejudicar outro cadastro ou recurso compartilhado, a exclusão é bloqueada.
3. Repositórios, issues, PRs, branches e Projects do GitHub não recebem mutações causadas pela exclusão.
4. Contas, perfis e configurações compartilhadas não são eliminados junto com as referências exclusivas do cadastro.

Integração: relações de storage, `github/index.ts` e verificação de ambientes em workspaces.

**US-05. Como operador, quero que os caminhos sejam conferidos efetivamente, para impedir remoção fora da área autorizada.**

Critérios de aceite:
1. Raízes, caminhos compartilhados, sobreposições perigosas e pastas contendo instalação, banco ou dados compartilhados da fábrica bloqueiam a remoção.
2. A conferência considera resolução efetiva, identidade e ancestralidade, inclusive diferenças de caixa no Windows.
3. Links simbólicos e junctions são removidos como links, inclusive quando forem o próprio alvo autorizado ou estiverem dentro dele, sem percorrer seus destinos. As proteções de caminhos efetivos continuam aplicáveis.
4. Mudança de identidade, resolução ou sobreposição depois da confirmação interrompe o avanço até reconferência, sem substituir ou ampliar silenciosamente os alvos.
5. Artefatos exclusivos autorizados dentro dos dados gerenciados podem ser removidos de forma delimitada, sem remover seu contêiner compartilhado.

Integração: `workspaces/inspect.ts`, `capture.ts`, `retention.ts` e configuração de diretórios do controlador.

### Domínio C: remoção e recuperação

**US-06. Como operador, quero remover todos os dados e arquivos exclusivos autorizados, para concluir a exclusão do cadastro.**

Critérios de aceite:
1. Cadastro sem histórico e cadastro com preparações, tentativas, entregas, eventos e evidências têm seus dados exclusivos removidos.
2. A pasta local original inteira é removida, incluindo conteúdo ignorado, `.git` e arquivos acrescentados após confirmar, sem backup automático.
3. Pasta já ausente é considerada removida, sem procurar outra pasta que possa ter sido movida.
4. Cadastro somente por URL remove dados e ambientes exclusivos criados pela fábrica, sem localizar pastas externas.
5. Sucesso só é informado após verificar a remoção dos alvos e dos dados exclusivos.

Integração: storage e workspaces, incluindo repositórios de entrega verificados por `retention.ts`.

**US-07. Como operador, quero acompanhar e retomar uma exclusão parcialmente executada, para concluir a operação após falha ou reinício.**

Critérios de aceite:
1. Falha de permissão, arquivo bloqueado ou interrupção mantém estado pendente acessível, com motivo e próxima ação.
2. Remoções concluídas não são restauradas e falha parcial não aparece como sucesso.
3. Enquanto pendente, o cadastro não participa da fila nem inicia trabalhos manuais ou novas publicações.
4. Retry, resposta perdida e reinício recuperam a mesma autorização durável, revalidam os alvos e não repetem cegamente efeitos.
5. A retomada não restaura sessão, provider ou autoridade de publicação.
6. O estado necessário à recuperação permanece até a verificação de conclusão. Depois disso, permanece somente a comprovação mínima da conclusão da própria exclusão, para recuperar o resultado diante de repetição ou resposta perdida, sem conservar conteúdo, histórico ou evidências do projeto nem deduplicação de issues.

Integração: operações e recuperação em storage, composição em `main.ts`, consultas e `uncertain-operations.ts`.

### Domínio D: recadastro

**US-08. Como operador, quero recadastrar o repositório como um projeto novo, para reiniciar seu uso sem herdar o contexto excluído.**

Critérios de aceite:
1. Após exclusão concluída, recadastro não recupera histórico, consumo de fila ou deduplicação do cadastro anterior.
2. A automação do novo cadastro inicia desligada.
3. Ao habilitá-la, a interface avisa que issues que continuam em Ready podem ser executadas novamente.

Integração: cadastro em `projects/index.ts`, `ProjectForm.tsx`, configuração e consumos de fila de storage.

## 4. Requisitos funcionais

Cada linha expressa uma obrigação verificável. As referências de integração remetem aos arquivos e módulos descritos na seção 2.

### A. Entrada e autorização

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-01 | Disponibilizar a ação de exclusão na configuração do cadastro escolhido. | US-01 | ProjectForm |
| RF-02 | Vincular apresentação e confirmação ao mesmo cadastro, descartando respostas de contextos anteriores na UI. | US-01 | useConfiguration e lifecycle |
| RF-03 | Apresentar todos os caminhos atingidos antes da confirmação. | US-01, US-02 | Contratos e workspaces |
| RF-04 | Apresentar todas as perdas e orientações de preservação descritas em US-02 antes do clique. | US-02 | UI de configuração |
| RF-05 | Exigir confirmação por clique antes de aceitar a exclusão. | US-02 | API e UI |
| RF-06 | Persistir autorização limitada ao cadastro e aos caminhos confirmados, incluindo conteúdo acrescentado dentro deles até concluir. | US-02, US-07 | storage/operations |
| RF-07 | Não oferecer cancelamento da exclusão depois da confirmação. | US-02 | Estado e UI |
| RF-08 | Não criar backup automático dos dados ou arquivos removidos. | US-02, US-06 | storage e workspaces |

### B. Elegibilidade e concorrência

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-09 | Bloquear efeitos destrutivos quando houver tentativa ativa. | US-03 | storage/attempts e pipeline |
| RF-10 | Bloquear efeitos destrutivos durante publicação em andamento. | US-03 | publication e storage/publication |
| RF-11 | Bloquear efeitos destrutivos com lançamento pendente ou efeitos/encerramento incertos. | US-03 | storage/recovery e effects |
| RF-12 | Manter o bloqueio após solicitação de cancelamento enquanto não houver confirmação suficiente de encerramento. | US-03 | execution e recovery |
| RF-13 | Persistir a aceitação e a autorização da exclusão antes de qualquer efeito destrutivo, mantendo a pendência durável para recuperação. | US-07 | storage |
| RF-14 | Coordenar aceitação da exclusão e verificação de atividade com scheduler, início manual e publicação, impedindo aceitação concorrente de novo trabalho para o cadastro. | US-03, US-07 | projects, pipeline, publication e storage |
| RF-15 | Retirar o cadastro pendente das oportunidades de fila até a conclusão da exclusão. | US-07 | projects/queue e consultas |
| RF-16 | Rejeitar novos trabalhos manuais e novas publicações do cadastro pendente. | US-07 | pipeline/start e publication |

### C. Caminhos e preservação

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-17 | Bloquear caminhos cuja remoção prejudique outro cadastro ou recurso compartilhado. | US-04, US-05 | storage e workspaces |
| RF-18 | Bloquear raízes e pastas contendo instalação, banco ou dados compartilhados da fábrica. | US-05 | Configuração e workspaces |
| RF-19 | Avaliar proteção por identidade, resolução efetiva e ancestralidade, incluindo equivalência de caixa no Windows. | US-05 | workspaces |
| RF-20 | Revalidar identidade, resolução e sobreposição dos caminhos antes de prosseguir e em cada retomada; divergência exige reconferência sem ampliar a autorização. | US-05, US-07 | workspaces e estado durável |
| RF-21 | Remover links simbólicos e junctions como links, inclusive quando forem o próprio alvo autorizado ou estiverem dentro dele, sem percorrer destinos e sem contornar as proteções de caminhos efetivos. | US-05 | workspaces |
| RF-22 | Tratar alvo ausente como removido, sem buscar pastas movidas nem substituir sua localização. | US-06 | workspaces |
| RF-23 | Restringir cadastro somente por URL aos dados e ambientes exclusivos conhecidos pela fábrica. | US-06 | projects e workspaces |
| RF-24 | Remover artefatos gerenciados exclusivos de forma delimitada, preservando diretórios contêineres compartilhados. | US-05, US-06 | capture e retention |
| RF-25 | Preservar integralmente recursos GitHub, sem mutações decorrentes da exclusão. | US-04 | github e publication |
| RF-26 | Selecionar dados por pertencimento ao cadastro, sem apagar por identidade comum de repositório. | US-04 | storage |

### D. Remoção de dados e conclusão

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-27 | Remover a pasta original inteira autorizada, inclusive `.git`, ignorados, conteúdo pessoal, trabalho não publicado e acréscimos até concluir. | US-06 | workspaces |
| RF-28 | Remover ambientes locais exclusivos, inclusive repositórios gerenciados de entregas pertencentes ao cadastro. | US-06 | workspaces/retention |
| RF-29 | Remover cadastro, revisões, histórico e evidências exclusivos, incluindo relações de preparações, tentativas, entregas, eventos, operações, fila e diagnósticos aplicáveis. Após a conclusão, reter exclusivamente a comprovação mínima da própria exclusão prevista em RF-37, sem conteúdo, histórico ou evidências do projeto. | US-06 | storage e migrations |
| RF-30 | Adaptar referências e proteções de imutabilidade somente para permitir o fluxo autorizado, mantendo as garantias dos demais fluxos. | US-04, US-06 | Migrations e comandos de storage |
| RF-31 | Preservar contas, perfis, configurações e demais dados compartilhados ao remover suas referências exclusivas. | US-04 | storage |
| RF-32 | Executar efeitos de filesystem fora de transações SQLite síncronas. | US-06, US-07 | workspaces e storage |
| RF-33 | Confirmar ausência dos alvos e remoção dos dados exclusivos antes de informar sucesso e eliminar o estado de recuperação da execução; preservar somente a comprovação mínima de conclusão prevista em RF-37. | US-06, US-07 | Coordenação e finalização transacional |

### E. Recuperação e interface

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-34 | Manter exclusão pendente após falha parcial, sem restaurar conteúdo já removido. | US-07 | storage e workspaces |
| RF-35 | Permitir consultar pendência e tentar novamente após falha ou reinício. | US-07 | Consultas e UI |
| RF-36 | Reutilizar a autorização persistida na mesma exclusão em retry e retomada, sem exigir autorização por arquivo novo dentro do alvo. | US-02, US-07 | Operações e recovery |
| RF-37 | Recuperar o resultado da mesma operação diante de repetição ou resposta perdida, inclusive após remover o cadastro, sem criar efeitos duplicados. Após a conclusão, usar somente comprovação mínima da própria exclusão, sem conservar conteúdo, histórico ou evidências do projeto nem deduplicação de issues. | US-02, US-07 | Idempotência e cliente HTTP |
| RF-38 | Reconciliar progresso com estado observado antes de repetir efeitos de remoção. | US-07 | recovery e workspaces |
| RF-39 | Não restaurar sessão, provider ou autoridade de publicação ao retomar exclusão. | US-07 | recovery e execution |
| RF-40 | Mostrar motivo e próxima ação em todo bloqueio e falha, em PT-BR, sem IDs internos, recibos, hashes, códigos ou diagnósticos brutos; mostrar os caminhos necessários à decisão. | US-03, US-05, US-07 | UI e tradução de erros |
| RF-41 | Atualizar seleção e listagem após conclusão, sem apresentar o cadastro removido como disponível para novos trabalhos. | US-01, US-06 | ProjectPicker e useProjects |

### F. Recadastro

| ID | Requisito | Stories | Integração |
| --- | --- | --- | --- |
| RF-42 | Criar recadastro com identidade nova, sem restaurar histórico ou deduplicação do cadastro excluído. | US-08 | projects e storage/queue |
| RF-43 | Inicializar a automação desligada no recadastro. | US-08 | Configuração de projetos |
| RF-44 | Avisar sobre possível reexecução de issues ainda em Ready ao habilitar automação do novo cadastro. | US-08 | UI de configuração e fila |

## 5. Requisitos não funcionais

| ID | Categoria | Obrigação e comprovação | Rastreabilidade |
| --- | --- | --- | --- |
| RNF-01 | Segurança HTTP | Toda mutação do fluxo respeita validação de Host/Origin, sessão técnica HttpOnly e CSRF existentes. Testes devem rejeitar requisições sem essas condições antes de qualquer efeito. Sessão técnica não equivale a autoridade GitHub. | RF-05, RF-25 |
| RNF-02 | Segurança e isolamento | Nos testes de mesmo repositório, compartilhamento, ancestralidade, links e substituição de alvo, nenhuma remoção pode atingir alvos não autorizados ou destinos de links. Comparar estado dos recursos preservados antes/depois. | RF-17 a RF-26 |
| RNF-03 | Confiabilidade | Injetar falha antes e depois da aceitação durável, durante remoção e antes da conclusão transacional. Antes da aceitação durável, não pode haver efeito destrutivo nem exclusão aceita. Depois dela, reinício deve conservar pendência recuperável ou conclusão comprovada, sem sucesso falso. Resposta perdida deve ser reconciliada para distinguir esses resultados. | RF-13, RF-33 a RF-38 |
| RNF-04 | Concorrência | Testes determinísticos de interleaving entre exclusão, scheduler, início manual e publicação não podem produzir trabalho novo aceito após o bloqueio durável nem remoção concorrente com atividade impeditiva. | RF-09 a RF-16 |
| RNF-05 | Persistência e desempenho | Conforme AC-29, ampliar caches e ignorados não aumenta conteúdo de projeto persistido ou payloads de listagens, histórico e polling. Medir tamanho do banco/artefatos e latência antes/depois; essas consultas não leem nem serializam conteúdo do checkout. A remoção pode percorrer os alvos para excluí-los. | RF-08, RF-29, RF-35 |
| RNF-06 | Integridade | Migrations funcionam em banco novo e existente, preservam integridade referencial e bloqueios de imutabilidade fora da exclusão autorizada. Verificar relações exclusivas removidas e relações compartilhadas preservadas em fixtures de histórico completo. | RF-29 a RF-31 |
| RNF-07 | Usabilidade e acessibilidade | Conforme AC-27 e INT-11, validar em navegador desktop/mobile e por teclado a confirmação, caminhos, perdas, bloqueios, pendência e retry. Todos os bloqueios/falhas observados exibem motivo e próxima ação; nenhuma dessas telas mostra os identificadores técnicos proibidos. | US-01 a US-07, RF-40 |
| RNF-08 | Compatibilidade de caminhos | Validar espaços, Unicode, caixa no Windows, raízes, links/junctions, ausência, perda de acesso e arquivos bloqueados. Cada caso mantém a autorização limitada ao alvo efetivo e produz resultado confirmado ou pendência explícita. | RF-17 a RF-24, RF-34 |
| RNF-09 | Arquitetura | Preservar módulos, contratos tipados e fronteiras atuais. Validar com scripts existentes de typecheck, lint, testes e build; SQL e efeitos externos permanecem nas responsabilidades da seção 2. | Todos os RF |
| RNF-10 | Limites de execução | Conforme INT-16, exclusão não força parada nem remove recursos manuais ou de propriedade incerta. Provar ausência de chamadas de parada forçada e manutenção do bloqueio com encerramento não confirmado. | RF-09 a RF-12, RF-39 |

Não são definidos limites numéricos de duração ou volume não fornecidos pelo discovery. A avaliação de desempenho segue AC-29, sem inventar um SLA de exclusão.

## 6. Matriz mínima de validação da implementação

| Grupo | Cenários e resultado exigido |
| --- | --- |
| Confirmação e contratos | Sem confirmação não há efeito; repetição, revisão obsoleta e resposta perdida preservam cadastro e autorização corretos; sessão/CSRF inválidos são rejeitados. |
| Exclusão completa | Sem histórico e com histórico completo; origem local e somente URL; `.git`, ignorados, pessoais, não publicados e novos arquivos removidos nos alvos autorizados; sem backup. |
| Preservação | Outro cadastro do mesmo repositório, recurso compartilhado, contas/perfis, recursos GitHub e destinos de links permanecem intactos. |
| Caminhos | Espaços/Unicode, caixa no Windows, raiz, ancestralidade, dados da fábrica, junctions/symlinks no próprio alvo e dentro dele, e substituição entre confirmação e execução; destinos de links permanecem intactos e remoção fora dos alvos nunca ocorre. |
| Atividade | Tentativa ativa, publicação, lançamento pendente, cancelamento não confirmado e efeitos incertos bloqueiam; corridas com scheduler e comandos manuais não escapam ao bloqueio. |
| Recuperação | Ausência de pasta, perda de acesso, arquivo bloqueado, falha parcial, resposta perdida, retry e reinício; mesma autorização, progresso reconciliado e pendência acessível enquanto não concluída; resposta perdida após conclusão recupera o resultado somente pela comprovação mínima da exclusão, sem histórico ou conteúdo do projeto. |
| Banco | Banco novo e upgrade, inventário de FKs/triggers, histórico exclusivo removido, proteções fora do fluxo mantidas e dados compartilhados preservados. |
| Recadastro | Identidade nova, sem histórico/deduplicação anterior, automação desligada e aviso ao habilitar para issues ainda em Ready. |
| UI real | Confirmação, bloqueios, falhas, reinício e retry observados em Playwright MCP/Chrome, com evidência de conteúdo e screenshot conforme SPEC 10.2 e INT-11. |

Comandos disponíveis em `package.json`: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:http` e `npm.cmd run build`. Checks controlados não substituem navegador real nem prova de integração Maestri/OMP quando pertinente. Suíte padrão não deve chamar providers, recrutar terminais ou publicar recursos externos implicitamente.

## 7. Delimitações para elaboração técnica

Antes de definir a ordem de remoção, inventariar todas as relações e proteções das migrations atuais, incluindo efeitos, operações, eventos, diagnósticos, publicações, ciclos/consumos de fila e vínculos de criação. Não basta remover a proteção de `003_projects_configuration.sql`; não desabilitar genericamente integridade referencial ou imutabilidade.

A reconferência de caminhos alterados deve preservar a autorização original; este documento não inventa uma ação para ampliar alvos ou procurar pastas movidas. Também não fixa endpoint, formato de recibo, schema de estado ou mecanismo de exclusão ainda inexistentes. Esses detalhes devem satisfazer os requisitos sem alterar o alcance aprovado.

Mantêm-se os limites normativos registrados no discovery: preservação da origem nos fluxos normais (SPEC 3.1), proteção contra perda acidental de histórico e limpeza automática destrutiva (SPEC 7), recuperação sem restaurar autoridade e bloqueio por incerteza de limpeza (INTEGRACAO-MAESTRI-OMP, seção 6). A exceção é exclusivamente a exclusão explícita e autorizada aqui descrita. Incompatibilidade normativa adicional deve ser registrada com trecho e impacto antes de alterar contrato.

Esta entrega contém análise e documentação. Não foram alterados código, migrations ou recursos, nem executados testes de implementação ou exclusões reais.
