# Persistência e manutenção modular — AC-28/29

Fontes: SPEC §§8/10, AC-28/29; SPEC derivada §§2.1/3.1; RNF-01/11/15/16/24. Os comandos abaixo usam as dependências fixadas. A prova opt-in executa Git somente leitura em ambientes exclusivos de teste. Não instala pacotes, executa GH, chama providers ou publica recursos.

## Reprodução local

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --reporter=dot --no-color
npm.cmd run build
npm.cmd run proof:persistence
```

`proof:persistence` executa os mesmos arquivos de `test:persistence`, compila o controlador e executa a configuração de `test:maintenance-native`, por Node sem shell. A segunda etapa confere resultados estruturados do produtor e recuperação com processos físicos. `test:maintenance-native` também compila antes de iniciar os filhos. A suíte padrão conserva o bloqueio de rede/subprocessos. A solicitação de validação autoriza esses ensaios locais; não concede publicação ou mutação Git.

Somente depois do sucesso das duas etapas e da presença do relatório de recuperação física, o comando cria `.cache/persistence-proof-<id>/report.json` e `report.md`, com status `local_persistence_and_process_recovery_passed`. Falha, timeout, saída excessiva, relatório ausente/duplicado/inválido não emitem relatório de sucesso. A saída de testes fica em memória e não é arquivada; diagnósticos brutos e ambiente herdado não entram no relatório. Para investigar falha, execute o comando configurado da etapa pertinente. O relatório não concede autorização nem aceite integrado.

## Massa, medições e auditoria

O ensaio usa Fastify inject, SQLite e filesystem reais com Git/GitHub/executor/canonicalização/runner controlados. Gera um arquivo denso ignorado em `node_modules/.cache`, em etapas de **0, 16 e 64 MiB**. A massa pertence exclusivamente ao temporário identificado da fixture; a limpeza do teste remove somente esse temporário.

São registradas separadamente as seguintes classes:

| Classe | Interpretação |
| --- | --- |
| `databaseBytes`, `walBytes`, `sharedMemoryBytes` | Persistência SQLite e arquivos do driver |
| `otherAuxiliaryBytes` | Outros auxiliares fora de work/Git; o cenário recusa arquivo não previsto |
| `operationalWorkBytes` | Checkout, índice e caches operacionais, que podem crescer |
| `retainedGitDiskBytes` | Ownership na medição de caches; objetos loose, refs e metadados Git reais na prova complementar de processos |
| `controlledObjectBytes` | Bytes dos blobs do grafo Git controlado em memória; não são persistência oficial |

Catálogo, listagem de tentativas, eventos, polling da tentativa, entrega, resultado produtor, rodadas, dashboard e seção paginada de passagens recebem um aquecimento e 20 amostras por etapa. O tempo inclui handler e serialização inject, sem rede/browser. Mediana é a média dos valores centrais; p95 usa nearest rank. Registram-se bytes mínimos/máximos, máximo temporal e hash do payload comparado. O timestamp observacional dos impedimentos do dashboard é normalizado somente na comparação; bytes medidos são da resposta original.

Spies de IO síncrono/assíncrono, com controle positivo, recusam acesso a work/Git durante as consultas. O número de chamadas ao Git controlado não pode crescer nessa fase. A comparação dos payloads é integral, e não apenas de tamanho. A auditoria lê todas as células TEXT/BLOB do banco e procura fingerprints sintéticos em representação direta, JSON e Base64; os mesmos fingerprints são procurados nos arquivos oficiais. A lista de auxiliares é explícita. Isso detecta regressões do cenário, sem prometer detectar qualquer conteúdo arbitrário/comprimido ou fazer varredura universal de segredos.

Não há meta de latência ou exigência geral de SQLite com crescimento zero. A fase de consultas confere `data_version`, sequência de eventos e auditoria lógica; tamanho de banco/WAL pode variar legitimamente por checkpoint. A operação explícita de remoção acrescenta eventos/recibo/estado de recurso e suas diferenças ficam registradas separadamente da comparação dos caches.

## Recuperação e falhas

A medição de caches mantém seu fechamento/reabertura de storage no mesmo processo, com Git e terminais simulados. Esse resultado tem escopo explícito em `persistence` e não comprova restart físico. A prova complementar `tests/native/persistence-recovery.proof.ts` registra `processRecovery`:

1. Gera objetos Git loose válidos em disco, com base, commit, árvore e ref da entrega, usando filesystem da fixture. Nenhum comando Git de escrita é executado. Aprovação, captura e produtor de evidência usam entradas controladas pelo teste e o lifecycle real.
2. Fecha todas as conexões do processo de preparação e inicia um controlador filho com módulos de produção compilados, SQLite e lock de controlador reais. A composição de teste usa Git CLI somente leitura no temporário, sem atestar contexto de keyring do produto.
3. Inicia dois processos Node físicos associados às passagens da fixture. A remoção fica bloqueada por `RESOURCE_NOT_STOPPED`. Solicita a parada de cada handle, observa `close`, confere a saída do PID e só então persiste o recibo confirmado. Os probes não são terminais Maestri/OMP.
4. Encerra o primeiro controlador com `SIGKILL`, observa sua saída e inicia outro PID com apenas diretório e IDs. Confere a mesma entrega, aprovação, ref/tree/base e resultado produtor estruturado; o lock é readquirido após a morte do primeiro processo.
5. Remove o ambiente elegível pelo plano/ETag/confirmação do pipeline real. Confere ausência física do ambiente e preservação dos resultados e evidências textuais do produtor/revisor. Encerra esse controlador e inicia um terceiro PID, já sem implementação, que valida os objetos Git e recupera diff.
6. Remove um blob Git realmente necessário. Confere `DELIVERY_GIT_UNAVAILABLE`, mantendo a identidade, os resultados e a aprovação oficiais, sem fallback vazio ou reconstrução.

O JSON registra identidade de tentativa/delivery/ref/tree/base, PIDs e saídas, ordem temporal de restart, recibos e tamanhos antes/depois de shutdown/restart/remoção. `controller-lock.sqlite` é discriminado como auxiliar operacional; eventos de parada/remoção, sessões do controlador e checkpoints explicam diferenças legítimas de metadados. Não contém payloads de projeto, índice, cache, diff completo ou dump do banco. Seus hashes de fontes cobrem apenas os arquivos selecionados e lockfile; não são uma ref Git ou inventário completo da implementação.

HTTP usa as rotas reais por inject dentro dos processos filhos. A prova não cobre listener de rede, captura Git de produção, keyring, provider, terminais Maestri/OMP ou publicação. Se `realpath` retornar EPERM, a composição exclusiva da fixture registra canonicalização controlada; produção não recebe fallback. As medições não inventam SLA nem representam backup/restore ou mudança de fase.

## Fronteiras e extensão

`scripts/check-boundaries.mjs` percorre TS/TSX e SQL de produção. Detecta SQL fora de storage, driver SQLite externo, imports internos entre módulos, imports/reexports/import type/dynamic import conhecidos, IO nos contracts, runtime do controlador/Node na UI e executáveis literais Git/GH/Maestri/OMP fora dos módulos respectivos. Inclui aliases de imports, namespaces, constantes literais, acesso por colchetes e `exec`/`execSync` com executável inicial literal. Imports computados são recusados. Não é analisador de shell, fluxo arbitrário de dados ou sandbox.

`execution-composition.test.ts` compõe uma implementação local de `Execution` com pipeline/storage reais, sem editar SQL/UI. Exercita ready, observação, pergunta/recibo, resultado idempotente e cancelamento conservando o resultado. Não lança terminal, não implementa continuação e não anuncia outro executor de produção.

`maintenance.proof.ts` confere que os registros `ImplementerResult.checks` permanecem ligados ao produtor e à versão entregue, e que o Revisor recebe o resultado produtor ao iniciar a revisão. Esses valores são controlados pela fixture e não simulam comandos executados. A materialização Git permanece controlada; se realpath for recusado com EPERM, somente a fixture usa canonicalização controlada e o relatório explicita isso. Produção não recebe fallback.
