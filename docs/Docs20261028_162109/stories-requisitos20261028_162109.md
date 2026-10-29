# Stories e requisitos: V4 - Retirada do legado anterior ao V3

## 1. Objetivo e fontes

Retirar de todo o produto as implementações cuja finalidade exclusiva seja compatibilidade anterior ao V3, mantendo os contratos atuais e as funcionalidades vigentes. Esta entrega é documental e não executa alterações no produto, migrations ou efeitos externos.

Fonte de escopo: `discovery20261028_162109.md`, neste diretório, confirmado como discovery canônico. A primeira seção de `FEEDBACK-PROXIMO-PACOTE-V4.md` fundamenta a abrangência. `SPEC.md`, `INTEGRACAO-MAESTRI-OMP.md` e `GLOSSARY.md` orientam os contratos preservados; `CLAUDE.md` registra arquitetura e convenções observadas. IDs US/RF/RNF deste documento são locais à feature e não substituem os IDs homônimos da SPEC.

Há exigências históricas ainda presentes na SPEC, especialmente nas seções de dados/migrations e nos complementos dos contratos de criação e mapeamento. Elas determinam leitura de quatro estados, planos antigos e transição física. Conforme o discovery, devem ser alinhadas à retirada já decidida. Isso não autoriza remover proteções atuais nem alterar os documentos normativos nesta execução.

Fora do escopo: novas funcionalidades, conversores substitutos, percursos de adequação, limpeza ou movimentação de dados existentes, mudanças de layout e qualquer acréscimo de texto ou elemento de interface. As demais seções do feedback V4 não originam novas funcionalidades nesta feature.

## 2. Arquitetura e superfícies observadas

Os caminhos abaixo são relativos à raiz canônica do projeto. São referências para implementação posterior, não uma lista automática de arquivos a excluir.

| Domínio | Código existente | Evidência e consequência para os requisitos |
| --- | --- | --- |
| Contratos do quadro | `packages/contracts/src/projects.ts`; `project-mapping.test.ts` no mesmo diretório | `ReadProjectMapping` une `ProjectMapping` e `LegacyProjectMapping`. `StatusOptionIds` reaproveita propriedades de `LegacyStatusOptionIds`. A retirada exige preservar as cinco opções e sua validação de distinção, inclusive ao desfazer esse reaproveitamento. |
| Criação | `packages/contracts/src/scaffold.ts`; `apps/controller/src/modules/projects/scaffold.ts`; `apps/controller/src/http/observation-views.ts` | `ScaffoldPlan` aceita `ScaffoldPlanV3` e `LegacyScaffoldPlan`; DTOs de observação e criação precisam continuar concordando sobre o plano atual e seus recibos. |
| Persistência e bootstrap | `apps/controller/src/modules/storage/migrations.ts`; `migrations/`; `configuration-json.ts`; `configuration-reads.ts`; `configuration-command-json.ts` | Inicializador carrega 53 migrations e verifica identidade, sequência, checksums e integridade. Há tratamentos de perfis, configurações antigas e `migrateLegacyProfileComposition`. Inicialização limpa depende hoje da cadeia histórica. |
| Pastas e referências | `apps/controller/src/main.ts`; `apps/controller/src/modules/workspaces/project-storage.ts`; `prepare.ts`; `capture.ts`; `diff.ts`; `materialize.ts`; `recovery.ts`; `retention.ts` | `resolveAttemptRoot` contém retornos para `dataDirectory`; há `resolveLegacyRepositoryReference`. A raiz atual usa `var/factory/projects/<projectId>/v<layoutVersion>/<locationKey>`. Inspeção atual verifica objeto, volume e ancestrais. |
| Publicação e destinos | `apps/controller/src/modules/workspaces/publication.ts`; `remote-publication.ts`; `delivery-target.ts`; `apps/controller/src/modules/publication/` | Consumidores de referências devem manter versão aprovada, identidade e autorização ao abandonar caminhos antigos. |
| Localizações e exclusão | `apps/controller/src/modules/storage/project-storage-locations.ts`; `project-storage-transitions.ts`; `project-deletion-inventory.ts`; `project-deletion-paths.ts`; `project-deletion-worker.ts`; `apps/controller/src/modules/workspaces/project-storage-transition.ts` | Classificar transições e destinos por finalidade. Versões de localização e mecanismos de identidade atuais não são obsoletos apenas por coexistirem com transições antigas. |
| Execução e recuperação | `apps/controller/src/modules/execution/index.ts`; `adapters/maestri-omp/adapter.ts`; `bootstrap.ts`; `apps/controller/src/modules/pipeline/start.ts` | `PassageRecord` tem identidades opcionais; `AttemptSessionIdentity` permite IDs nulos em estados atuais. Captura só é concluída após verificação de referências Git e metadados. |
| Interface | `apps/web/src/features/projects/ProjectForm.tsx`; `project-readiness.test.ts`; `apps/web/src/features/queue/QueuePanel.tsx`; `apps/web/src/app/` | Existem tratamentos de `STATUS_MAPPING_LEGACY` e testes de leitura de mapeamento antigo. A remoção não pode introduzir avisos de substituição. |

Padrões a manter: TypeScript strict/ESM; símbolos em inglês; componentes PascalCase; funções camelCase; imports relativos com `.js`; contratos compartilhados por `#contracts`; schemas TypeBox sem IO; interfaces públicas em `index.ts`. SQL pertence a storage, Git a workspaces, GitHub a github e Maestri/OMP a execution, conforme `scripts/check-boundaries.mjs`. Testes unitários ficam também junto aos módulos; `tests/integration`, `tests/acceptance`, `tests/native` e `tests/browser` cobrem superfícies distintas. A feature não demanda nova tecnologia.

## 3. User stories por domínio

### 3.1. Inicialização e suporte de dados

#### US-01: Iniciar uma instalação atual

Como operador da fábrica, quero iniciar uma instalação limpa com o schema e os recursos atuais, para configurar projetos sem depender de conversões anteriores ao V3.

Critérios de aceite:

1. Em diretório de teste vazio, a inicialização pelo bootstrap existente cria o schema atual, seus índices, constraints e configurações iniciais necessárias.
2. A inicialização não chama leitores ou conversores classificados como exclusivos de versões anteriores ao V3.
3. Reiniciar essa instalação conserva configurações e referências existentes, sem recriar registros ou recursos já confirmados.
4. A aplicação compilada e distribuída contém os recursos necessários ao percurso, sem dependência de diretório pessoal.

Referências: `main.ts`, `storage/migrations.ts`, `storage/migrations/`, `scripts/copy-resources.mjs`; RF-01 a RF-03.

#### US-02: Recusar bases fora do suporte

Como operador da fábrica, quero que uma base incompatível seja recusada pelos mecanismos existentes, para evitar interpretar dados antigos como dados atuais.

Critérios de aceite:

1. Uma base identificada como incompatível não chega ao estado operacional nem é convertida silenciosamente.
2. A recusa não apaga, move ou reescreve dados, capturas e evidências da base ou suas pastas.
3. Identidade desconhecida, histórico inválido, checksum divergente e integridade inválida continuam recusados pelas verificações pertinentes.
4. A recusa não acrescenta mensagem, tela, opção ou percurso de recuperação à interface.

Referências: `storage/migrations.ts`, `storage/storage.test.ts`, `storage/local-installation.test.ts`; RF-04 e RF-05.

### 3.2. Projetos, quadro e criação

#### US-03: Usar somente o quadro atual

Como operador da fábrica, quero configurar e consultar o quadro no contrato atual de cinco estados, para preparar e executar issues sem variantes antigas de mapeamento.

Critérios de aceite:

1. Produtores e consumidores suportados utilizam `backlog`, `ready`, `in_progress`, `in_review` e `delivered`, com cinco IDs distintos.
2. O formato de quatro estados não é aceito como variante de leitura ou escrita do mapeamento atual.
3. Configuração, preparação e fila funcionam com o mapeamento atual; Ready mantém a semântica de elegibilidade do glossário.
4. Não há preenchimento inventado de Backlog nem interface de conversão do mapeamento antigo.

Referências: `contracts/src/projects.ts`, `projects/queue.ts`, `projects/preparations.ts`, `ProjectForm.tsx`; RF-06 a RF-08.

#### US-04: Criar projetos com o plano atual

Como operador da fábrica, quero planejar, criar e acompanhar projetos usando apenas o contrato atual, para manter os dados do quadro e os efeitos autorizados coerentes.

Critérios de aceite:

1. Planejamento, solicitação de criação, persistência e consulta conservam os campos atuais do plano, incluindo `board_name`, remoto e modo `remote_push`.
2. Planos anteriores sem campos atuais do quadro e modos substituídos não são aceitos como planos atuais.
3. O nome do quadro não é inferido do nome do projeto para tornar um plano antigo aparentemente válido.
4. Resposta perdida ou retomada de criação atual reconcilia os recibos existentes sem duplicar recursos confirmados ou fabricar autorização.

Referências: `contracts/src/scaffold.ts`, `projects/scaffold.ts`, `http/observation-views.ts`, `tests/integration/scaffold.test.ts`, `remote-scaffold.test.ts`; RF-09 a RF-11.

### 3.3. Contratos operacionais

#### US-05: Manter configuração e preparação atuais

Como operador da fábrica, quero reutilizar configurações, preparações e perfis atuais sem adaptações históricas, para iniciar o trabalho com as escolhas efetivamente registradas.

Critérios de aceite:

1. Novas gravações e leituras suportadas usam os contratos atuais em HTTP, persistência e executor, sem fallback para variantes exclusivamente anteriores ao V3.
2. Composição atual de instruções, provider, modelo, esforço e orientação permanecem coerentes entre a configuração salva e a passagem iniciada.
3. Salvar ou consultar preparação não executa, clona ou publica recursos.
4. Campos opcionais legítimos e valores nulos atuais continuam aceitos; nenhuma classificação como legado depende apenas da ausência de um campo.

Referências: `storage/configuration-json.ts`, `configuration-command-json.ts`, `configuration-reads.ts`, `preparations.ts`, `profile-composition.test.ts`, `pipeline/start.ts`; RF-12 a RF-14.

#### US-06: Executar e recuperar o percurso atual

Como operador da fábrica, quero executar e retomar tentativas atuais com suas identidades e evidências preservadas, para continuar implementação, revisão e correção após interrupções sem duplicar efeitos.

Critérios de aceite:

1. Sessão atual reservada ou ainda não iniciada continua válida sem IDs de terminal ou OMP que ainda não foram observados.
2. Após confirmação, retomada conserva os vínculos de tentativa, papel, sessão e passagem pertinentes; outra tentativa não reaproveita a conversa da anterior.
3. Resultado estruturado, captura Git e revisão independente permanecem vinculados à rodada e à versão correspondentes; correção produz novo resultado e nova revisão da versão.
4. Interrupção ou restart não transforma estado incerto em confirmação de parada, disponibilidade ou conclusão.
5. Recuperação de dados atuais não recorre a leitores ou caminhos exclusivamente anteriores ao V3.

Referências: `execution/index.ts`, `execution/adapters/maestri-omp/`, `pipeline/start.ts`, `workspaces/recovery.ts`, `tests/integration/recovery.test.ts`, `tests/native/session-recovery.proof.ts`; RF-15 a RF-17.

### 3.4. Recursos, entrega e exclusão

#### US-07: Usar somente localizações atuais de recursos exclusivos

Como operador da fábrica, quero que os recursos exclusivos dos projetos sejam resolvidos pelo layout atual, para operar sem ramos de compatibilidade do layout global antigo.

Critérios de aceite:

1. Bootstrap, preparação, execução, captura, diff, revisão, publicação, abertura, recuperação e retenção usam as referências atuais pertinentes.
2. Referência ausente ou inválida não provoca fallback para uma pasta global antiga de recurso exclusivo.
3. Leitores e mecanismos de transição exclusivamente ligados ao layout global antigo são removidos do código.
4. Banco e recursos compartilhados globais continuam válidos; a retirada não altera pastas ou dados preexistentes.
5. Localizações e identidades ainda necessárias ao funcionamento atual permanecem verificadas.

Referências: `workspaces/project-storage.ts`, `prepare.ts`, `capture.ts`, `diff.ts`, `materialize.ts`, `retention.ts`, `storage/project-storage-locations.ts`; RF-18 a RF-20.

#### US-08: Publicar e excluir com as garantias atuais

Como operador da fábrica, quero manter as autorizações e proteções atuais na publicação e exclusão, para que a retirada do legado não afete recursos de terceiros nem publique outra versão.

Critérios de aceite:

1. Publicação usa a referência imutável aprovada e o destino autorizado; alteração posterior não herda aprovação.
2. O inventário de exclusão deixa de incluir destinos adicionais exclusivos do layout antigo, mantendo os destinos atuais pertinentes.
3. Pasta original e destinos de entrega conservam o tratamento definido por propriedade e autorização atuais.
4. Substituição de caminho/objeto, recurso compartilhado e link/junction não permitem exclusão fora das identidades e autorizações verificadas.
5. Reinício ou retomada parcial preserva o mecanismo atual de controle de posse e geração do worker, invalidando a posse anterior e adquirindo nova posse e geração conforme o comportamento existente; o recibo final só indica conclusão após verificação dos alvos pertinentes.
6. Instalar ou iniciar a versão resultante não dispara exclusão, limpeza ou movimentação dos recursos antigos.

Referências: `workspaces/publication.ts`, `remote-publication.ts`, `delivery-target.ts`, `storage/project-deletion-inventory.ts`, `project-deletion-paths.ts`, `project-deletion-worker.ts`; RF-21 a RF-24.

### 3.5. Consulta e interface

#### US-09: Consultar registros atuais sem reescrita

Como operador da fábrica, quero consultar resultados, entregas e histórico produzidos pelos contratos atuais, para manter a rastreabilidade do trabalho após a retirada das compatibilidades antigas.

Critérios de aceite:

1. Registros atuais conservam identificadores, referências, hashes, resultados, evidências e vínculos de revisão nas consultas pertinentes.
2. Leitura não reescreve capturas nem uniformiza chaves privadas apenas por diferença de grafia em relação ao HTTP.
3. Idade do registro e opcionais legítimos não bastam para rejeitar um histórico atual.
4. Listagens e polling continuam usando resumos; detalhes e evidências extensas permanecem sob demanda.

Referências: `storage/configuration-reads.ts`, `http/observation-views.ts`, `modules/queries/`, `apps/web/src/features/records/`; RF-25 e RF-26.

#### US-10: Preservar a interface vigente

Como operador da fábrica, quero continuar usando a interface atual com os elementos exclusivamente antigos retirados, para realizar as mesmas operações sem novas informações ou etapas.

Critérios de aceite:

1. Elementos exclusivamente destinados à compatibilidade anterior ao V3 são removidos, junto com seus ramos de renderização sem finalidade atual.
2. A comparação da UI antes/depois evidencia zero acréscimos de textos, avisos, banners, tooltips, indicadores, estados visuais, botões, opções e telas.
3. Somente textos existentes tornados objetivamente incorretos pela retirada podem ser corrigidos, sem explicações novas.
4. Layout e ações atuais de configuração, criação, preparação, acompanhamento, publicação e exclusão permanecem operáveis.

Referências: `ProjectForm.tsx`, `QueuePanel.tsx`, `apps/web/src/app/`, `apps/web/src/features/`; RF-27 e RF-28.

## 4. Requisitos funcionais

Cada linha representa uma obrigação verificável. As referências de módulos usam a estrutura da seção 2.

### 4.1. Persistência e inicialização

| ID | Requisito | Stories | Integração existente e verificação |
| --- | --- | --- | --- |
| RF-01 | Criar o schema atual em instalação limpa sem executar conversores exclusivamente anteriores ao V3. | US-01 | `storage/migrations.ts` e recursos SQL; inicialização em diretório temporário vazio. |
| RF-02 | Manter no schema inicial os índices, constraints, vínculos e defaults necessários aos contratos atuais. | US-01 | Verificar schema e gravações/leitura atuais com `storage/storage.test.ts` e testes pertinentes. |
| RF-03 | Preservar a idempotência de inicialização e reinício da base atual. | US-01 | Comparar registros e referências antes/depois de reinício e conferir distribuição compilada. |
| RF-04 | Recusar bases incompatíveis sem conversão, aceitação silenciosa ou reescrita de seus dados. | US-02 | Validação de abertura em storage; fixtures incompatíveis isoladas e comparação de conteúdo antes/depois. |
| RF-05 | Manter verificações de identidade, histórico, checksums e integridade pertinentes ao schema suportado. | US-02 | Exercitar recusa de identidade desconhecida, sequência inválida, checksum divergente e violação de integridade. Não fixar número de migration como fronteira de V3. |

### 4.2. Projetos e criação

| ID | Requisito | Stories | Integração existente e verificação |
| --- | --- | --- | --- |
| RF-06 | Restringir os contratos suportados de mapeamento aos cinco estados atuais com IDs distintos. | US-03 | `projects.ts`, `project-mapping.test.ts`; testar leitura/escrita atuais e rejeição de quatro estados e duplicidade. |
| RF-07 | Retirar a variante de leitura de mapeamento anterior ao V3 e seus consumidores exclusivos. | US-03 | `ReadProjectMapping`, `LegacyProjectMapping`, conversão HTTP e UI; inspeção de referências após retirada. |
| RF-08 | Preservar a seleção e elegibilidade Ready atuais na preparação e fila. | US-03 | `projects/queue.ts`, `preparations.ts`; testar status, atribuição, consumo e ocupação pertinentes ao contrato vigente. |
| RF-09 | Usar o plano atual integral no planejamento, criação, persistência e observação de projetos. | US-04 | `scaffold.ts`, `observation-views.ts`; comparar campos e identidade/hash do plano entre superfícies. |
| RF-10 | Retirar formatos de plano e modos de criação exclusivamente anteriores ao V3. | US-04 | Eliminar variantes `LegacyScaffoldPlan` e correspondentes DTOs quando confirmadas; testar rejeição sem preencher campos ausentes. |
| RF-11 | Preservar reconciliação idempotente dos efeitos e recibos de criações atuais. | US-04 | `projects/scaffold.ts`, testes `scaffold` e `remote-scaffold`; simular resposta perdida sem repetir efeito confirmado. |

### 4.3. Configuração, execução e recuperação

| ID | Requisito | Stories | Integração existente e verificação |
| --- | --- | --- | --- |
| RF-12 | Retirar leitores, conversores e fallbacks de configuração, preparação e perfil cuja única finalidade seja suporte anterior ao V3. | US-05 | `configuration-json.ts`, `configuration-command-json.ts`, `configuration-reads.ts`, `preparations.ts`; rastrear produtor e consumidor antes da retirada. |
| RF-13 | Produzir e consumir a composição atual de instruções sem composição histórica substituta. | US-05 | `migrations.ts`, perfis e bootstrap do executor; comparar orientação persistida e perfil efetivo atual. |
| RF-14 | Preservar opcionalidade e nulabilidade dos estados atuais legítimos nas fronteiras HTTP, persistência, executor e UI. | US-05, US-06 | Testes de schemas e contratos atravessando as quatro superfícies; não promover campos a obrigatórios apenas por serem opcionais. |
| RF-15 | Retirar variantes exclusivamente antigas de sessões, capturas e resultados. | US-06 | `execution/index.ts`, adapter, storage e `pipeline/start.ts`; comprovar contrato atual de ponta a ponta. |
| RF-16 | Manter resultado e revisão independente vinculados à identidade imutável de cada versão e rodada atual. | US-06 | Captura, resultado do Implementador e revisão; testar correção sem transportar aprovação da versão anterior. |
| RF-17 | Preservar retomada atual e reconciliação após interrupção ou reinício sem fabricar IDs ou confirmações. | US-06 | Adapter Maestri/OMP e recuperação; testar sessão reservada, sessão confirmada e estado incerto separadamente. |

### 4.4. Localizações, publicação e exclusão

| ID | Requisito | Stories | Integração existente e verificação |
| --- | --- | --- | --- |
| RF-18 | Resolver recursos exclusivos de projetos somente pelas referências atuais em todos os consumidores operacionais. | US-07 | `main.ts`, execution, workspaces e publication; cobrir bootstrap, execução, captura, diff, revisão, abertura, recuperação e retenção. |
| RF-19 | Retirar fallbacks e transições exclusivamente destinados ao layout global antigo de recursos exclusivos. | US-07 | `project-storage.ts`, `project-storage-transition.ts`, `storage/project-storage-transitions.ts`; ausência de resolução antiga em casos positivos e negativos. |
| RF-20 | Manter banco e recursos compartilhados globais, bem como localizações e identidades necessárias ao layout atual. | US-07 | `project-storage-locations.ts` e inspetor; comprovar classificação por finalidade e verificações de objeto/volume/ancestrais. |
| RF-21 | Publicar exclusivamente a referência aprovada no destino autorizado pelos mecanismos atuais. | US-08 | `modules/publication/`, materialização e destinos; divergência de versão/identidade impede o efeito. |
| RF-22 | Retirar do inventário de exclusão somente os destinos adicionais exclusivos do layout antigo. | US-08 | `project-deletion-inventory.ts`, `project-deletion-paths.ts`; comparar alvos atuais e antigos em fixtures isoladas. |
| RF-23 | Preservar as verificações atuais de propriedade e autorização para pasta original, destinos de entrega, compartilhados e caminhos substituídos. | US-08 | Testes de exclusão e publicação com identidade trocada, compartilhamento e links/junctions. |
| RF-24 | Preservar posse, geração, retomada parcial e verificação final do worker de exclusão. | US-08 | `project-deletion-worker.ts` e testes associados; impedir worker obsoleto e conclusão sem recibo verificado. |

### 4.5. Histórico e interface

| ID | Requisito | Stories | Integração existente e verificação |
| --- | --- | --- | --- |
| RF-25 | Retirar formatos de entrega e histórico exclusivamente anteriores ao V3 sem invalidar registros dos contratos atuais. | US-09 | Consultas storage/queries e `features/records`; fixtures atuais, inclusive com opcionais e registros antigos em data. |
| RF-26 | Manter consultas de registros atuais sem mutação de capturas, evidências ou referências. | US-09 | Comparar hashes e vínculos antes/depois da leitura e do reinício; detalhes carregados sob demanda. |
| RF-27 | Remover efetivamente componentes e ramos de interface cuja finalidade exclusiva seja a compatibilidade retirada. | US-10 | `ProjectForm.tsx`, `QueuePanel.tsx` e demais consumidores identificados; código e DOM sem elementos exclusivos antigos. |
| RF-28 | Limitar ajustes de texto à correção de conteúdo existente tornado objetivamente incorreto pela retirada. | US-10 | Revisar diff textual e comparação visual; zero texto explicativo novo e zero novo percurso. |

## 5. Requisitos não funcionais

| ID | Categoria | Requisito e critério mensurável | Rastreabilidade |
| --- | --- | --- | --- |
| RNF-01 | Segurança de dados | Zero exclusões, movimentos ou reescritas de bancos, pastas, capturas e evidências preexistentes como consequência implícita da retirada ou da recusa de base. Verificar conteúdo/hashes em fixtures isoladas; a exclusão atual explicitamente autorizada conserva seu contrato próprio. | US-01, US-02, US-07, US-08, US-09 |
| RNF-02 | Segurança HTTP | Preservar Host/Origin exatos, cookie HttpOnly/SameSite strict, CSRF nas mutações e separação entre sessão técnica e autoridade GitHub. Testes HTTP negativos devem continuar recusando origens e mutações não autorizadas. | US-03 a US-10 |
| RNF-03 | Segurança operacional | Zero efeitos de publicação ou exclusão sem autorização e identidade pertinentes. Incerteza não confirma parada nem posse; testar substituição de caminho, links/junctions e geração obsoleta em superfícies afetadas. | US-06, US-07, US-08 |
| RNF-04 | Confiabilidade | Reinício, replay e resposta perdida não duplicam recursos, resultados aceitos ou efeitos já confirmados dos contratos atuais. Comparar IDs, contagens e recibos antes/depois dos cenários pertinentes. | US-01, US-04, US-06, US-08 |
| RNF-05 | Usabilidade | Zero acréscimos de textos, informações, avisos, banners, tooltips, indicadores, estados visuais, botões, opções ou telas. Manter layout e ações atuais, comprovando por diff e UI renderizada. | US-10 |
| RNF-06 | Performance e persistência | Listagens, histórico e polling mantêm resumos leves e detalhes sob demanda. O aumento de caches/ignorados do checkout não pode gerar cópia proporcional em SQLite, WAL, JSON ou snapshots auxiliares. Medir tamanho persistido, resposta e latência nos cenários pertinentes da SPEC, sem adotar metas numéricas novas sem baseline. | US-07, US-09; SPEC, prova de persistência/performance |
| RNF-07 | Manutenibilidade | Zero caminhos executáveis cuja finalidade confirmada seja exclusivamente compatibilidade anterior ao V3 no código entregue. Inventariar finalidades, produtores, consumidores e dependências; busca textual é apoio, não critério único. Não aceitar apenas ocultação ou desativação. | US-01 a US-10 |
| RNF-08 | Arquitetura | Preservar TypeScript strict, contratos sem IO e fronteiras públicas dos módulos; `npm.cmd run typecheck` e `npm.cmd run lint` devem passar na implementação resultante. Não adicionar tecnologia ou dependência para substituir compatibilidades removidas. | Todas as stories |
| RNF-09 | Distribuição | Build e distribuição mantêm os recursos atuais resolvidos em runtime, com caminhos relativos/configuração, sem diretórios pessoais. Validar inicialização do artefato compilado e distribuição isolada. | US-01, US-07 |
| RNF-10 | Rastreabilidade | Preservar registros históricos de provas e baselines com seus limites originais. Zero reclassificações de prova antiga como validação da retirada; registrar separadamente testes locais, UI, Windows nativo e integração real. | Todas as stories |

## 6. Estratégia de comprovação e limites

### 6.1. Inventário por finalidade

Antes da implementação, relacionar cada candidato à retirada ao formato anterior suportado, produtor, consumidores, persistência e testes. Classificar cada item como exclusivamente obsoleto ou necessário ao comportamento atual. Nome `legacy`, número da migration, idade ou presença de campo opcional não demonstram obsolescência.

O inventário deve atravessar contratos, HTTP, storage, executor e UI. Em particular, não tratar toda conversão snake_case/camelCase, todo `format_version=1`, toda transição de localização ou todo campo nulo como compatibilidade anterior ao V3. A forma técnica de criar o schema e a fronteira de recusa de bases devem resultar dessa análise, sem inventar um número de versão ou um novo mecanismo de migração.

### 6.2. Cobertura existente a adequar

| Superfície | Pontos de partida verificados | Evidência exigida |
| --- | --- | --- |
| Quadro e contratos | `packages/contracts/src/project-mapping.test.ts`; `observation-public.test.ts`; `apps/controller/src/modules/projects/project-mapping.test.ts` | Contrato atual aceito, variante antiga recusada e consumidores atuais alinhados. |
| Inicialização/configuração | `storage/storage.test.ts`; `local-installation.test.ts`; `configuration-json.test.ts`; `profile-composition.test.ts` | Instalação limpa, restart, integridade, configurações atuais e recusa sem reescrita. |
| Criação e publicação | `tests/integration/scaffold.test.ts`; `remote-scaffold.test.ts`; `publication.test.ts`; `publication-targets.test.ts`; `local-publication.test.ts` | Plano integral, recibos, reconciliação e referência aprovada preservados. |
| Recursos e exclusão | `storage/project-storage-locations.test.ts`; `project-deletion-worker.test.ts`; `tests/integration/project-deletion-http.test.ts`; `tests/native/project-deletion.integration.proof.ts` | Ausência de alvos antigos, proteção de identidades e recuperação parcial. Prova nativa separada dos testes controlados. |
| Sessões e recuperação | `tests/integration/recovery.test.ts`; `tests/native/session-continuity.proof.ts`; `session-recovery.proof.ts` | Opcionais atuais, identidade confirmada, reinício e incerteza sem confirmações fabricadas. |
| Interface | `apps/web/src/features/projects/project-readiness.test.ts`; `tests/browser/` | Remoção dos tratamentos antigos e zero acréscimos visuais/textuais, com Playwright MCP/Chrome no produto servido. |
| Persistência | `tests/acceptance/persistence-maintenance.test.ts`; `persistence-audit.test.ts`; `persistence-report.test.ts` | Metadados/referências atuais preservados e ausência de cópia de checkout/cache. |

Retirar casos cuja única obrigação seja aceitar compatibilidade descartada. Preservar testes negativos que comprovem a recusa do formato antigo e testes de garantias atuais, mesmo se seus nomes ou fixtures mencionarem legado. Adequar fixtures, smokes e ensaios sem apagar as evidências históricas já produzidas.

### 6.3. Comandos e níveis de prova

Comandos existentes pertinentes: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:http`, `npm.cmd run test:acceptance`, `npm.cmd run test:compiled`, `npm.cmd run test:distribution` e `npm.cmd run test:persistence`. Selecionar checks adicionais conforme a superfície efetivamente alterada; não executar providers, recrutar terminais ou publicar recursos externos implicitamente.

Rastreabilidade normativa a preservar: SPEC, seções 8 e 10.2, prova de persistência/performance e AC-29 referenciado no discovery e na integração; INT-01/02 para bootstrap/conexão, INT-03/04/05 para sessão e escolhas efetivas, INT-06/07 para resultados/perguntas, INT-08 para perda de acompanhamento, INT-11 para UI, INT-13/14 para UTF-8/Windows, INT-15/16 para cancelamento/recursos, INT-17 para outra tentativa e INT-18 para versão aprovada. Esses critérios verificam o percurso preservado, sem ampliar a feature.

Testes determinísticos e de contratos comprovam as superfícies locais. UI exige evidência própria com o bundle atual servido na porta 4310. Integração real Maestri/OMP e efeitos GitHub exigem execução autorizada e evidências próprias; sucesso de build, mocks, health HTTP ou registros históricos não os substitui.

### 6.4. Alinhamento documental antes do aceite

Na fase pertinente, antes do aceite da implementação, mapear e alinhar na `SPEC.md`, em `INTEGRACAO-MAESTRI-OMP.md` e no plano as exigências cuja finalidade exclusiva seja compatibilidade anterior ao V3. Comprovar esse alinhamento por referências aos trechos ajustados e pela verificação de ausência de exigências contraditórias nos documentos vigentes, preservando as garantias atuais e os registros históricos com seus limites originais.

Esta obrigação não autoriza alterar esses documentos normativos nesta revisão, criar funcionalidades, acrescentar textos ou elementos à interface ou realizar redesign.

## 7. Estado desta entrega

Documento produzido a partir do discovery e da inspeção do código existente. Não houve implementação, alteração de banco, execução de testes de produto, validação de UI ou integração real nesta tarefa. A geração deste documento não representa aprovação de PRD, SPEC, Design Lock ou implementação.
