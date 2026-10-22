# Baseline C4 anterior à otimização

Captura: 2026-10-21T20:55:28.072Z. Referência Git lida de HEAD/ref: `eb81a888289193e6bb658728990c36a28ab47d01`; contém trabalho local adicional identificado pelos hashes abaixo.
Ambiente: v24.22.0, win32/x64; dependências do package-lock existente. Cinco processos independentes por modo, dez execuções ao todo.
Versões fixadas: better-sqlite3 13.0.3, Fastify 5.12.7, React 18.3.1, Vitest 5.0.5, TypeScript 5.9.3, happy-dom 20.8.4.
Fontes vigentes: Decisions/SPEC/plano em `revisao-escopo-20261021/`, D1–D4, F1–F5; SPEC de produto §§8.4/8.5/10.2 e AC-29; GLOSSARY e contrato Maestri/OMP. Não representa aprovação ou avanço do pipeline.

Reprodução na raiz canônica: `node scripts/run-observation-baseline.mjs`, depois `node scripts/summarize-observation-baseline.mjs`. Não altera código de produção. Logs e registros privados: `.cache/observation-baseline-runs/{disabled,enabled}-{1..5}.{log,json}` e `results.json`. O relatório não depende da retenção de checkout, índice ou caches.

## Condições, amostragem e limites

- Dois projetos; base: 10 issues por projeto, uma membership e uma página. Expanded: 10 issues/projeto, três memberships e duas páginas. Large: 100 issues/projeto, três memberships e duas páginas. Conta sintética ACCOUNT_test/synthetic-user; nenhum GitHub, GH nativo, provider ou terminal real.
- Relógio de domínio inicial 1800000000000. Runner GraphQL sintético sem atraso injetado; tempos backend são performance.now da execução instrumentada local, incluindo SQLite e serialização HTTP. Os 5 ms/página virtuais da fixture sem wire não são somados a essas latências.
- Automação global desligada/ligada separadamente; os dois projetos estão habilitados. Pipeline da fixture é fechado antes das medições; scheduler/scope/authorization chamam observe sem despachar tentativa. Não simula execução física de etapas nem efeitos externos.
- Por fixture: cold HTTP limit=25; warm imediato; avanço virtual de 11 s para expirar cache; dois HTTP idênticos sobrepostos; scheduler, scope e authorization independentes. Cada HTTP tem seu span; elapsed do overlap é o término do par, não a soma das durações.
- Cinco totais por cenário/modo: mínimo / mediana / máximo / amplitude (máximo menos mínimo). Sem média como conclusão e sem p95 inferencial com cinco observações. Não há randomização de ordem; JIT, cache do SO, instrumentação e carga concorrente afetam os milissegundos. Não comparar enabled/disabled como efeito causal da automação.
- Web: PrincipalScreen e descendentes reais, happy-dom restrito ao arquivo, fetch sintético de 10 ms, sessão preparada fora da jornada, polling de 15 s, passos de 200 ms e resolução de conteúdo útil de 1 ms após commit via act. AppShell/onboarding/SSE não integram suas contagens. O DOM não mede pintura ou latência de rede.
- Frequência real de abertura, eventos, navegação, projetos/memberships e uso diário: desconhecida. Cenários e prioridades são condicionais ao uso representado. Não há afirmação de causa do bloqueio GitHub relatado nem redução de rate-limit points medida.

## HTTP backend e custo atribuído

| Automação | Cenário | Fase | n | ms: mín / med / máx / amplitude | Envios GraphQL por observação | Pico físico |
|---|---|---|---:|---|---:|---:|
| disabled | base | cold | 5 | 109.699 / 116.808 / 176.509 / 66.810 | 108 | 3 |
| disabled | base | warm | 5 | 1.732 / 2.130 / 2.713 / 0.981 | 0 | 0 |
| disabled | base | overlap | 5 | 29.524 / 30.164 / 37.681 / 8.157 | 108 | 3 |
| disabled | base | scheduler | 5 | 26.411 / 34.280 / 44.968 / 18.557 | 108 | 3 |
| disabled | base | scope | 5 | 25.144 / 35.944 / 48.842 / 23.698 | 108 | 3 |
| disabled | base | authorization | 5 | 23.611 / 27.236 / 50.134 / 26.523 | 108 | 3 |
| disabled | expanded | cold | 5 | 63.189 / 67.321 / 132.104 / 68.915 | 272 | 3 |
| disabled | expanded | warm | 5 | 1.270 / 1.701 / 1.866 / 0.596 | 0 | 0 |
| disabled | expanded | overlap | 5 | 21.342 / 26.114 / 53.880 / 32.537 | 272 | 3 |
| disabled | expanded | scheduler | 5 | 24.032 / 28.428 / 52.061 / 28.029 | 272 | 3 |
| disabled | expanded | scope | 5 | 25.285 / 30.834 / 62.797 / 37.512 | 272 | 3 |
| disabled | expanded | authorization | 5 | 24.448 / 27.064 / 39.216 / 14.768 | 272 | 3 |
| disabled | large | cold | 5 | 139.152 / 153.682 / 281.676 / 142.524 | 2612 | 3 |
| disabled | large | warm | 5 | 1.854 / 2.175 / 3.880 / 2.027 | 0 | 0 |
| disabled | large | overlap | 5 | 96.298 / 100.300 / 228.549 / 132.250 | 2612 | 3 |
| disabled | large | scheduler | 5 | 104.873 / 107.879 / 226.058 / 121.185 | 2612 | 3 |
| disabled | large | scope | 5 | 108.184 / 126.608 / 244.324 / 136.139 | 2612 | 3 |
| disabled | large | authorization | 5 | 105.301 / 115.955 / 197.163 / 91.861 | 2612 | 3 |
| enabled | base | cold | 5 | 77.378 / 98.427 / 105.078 / 27.700 | 108 | 3 |
| enabled | base | warm | 5 | 1.425 / 2.049 / 2.322 / 0.896 | 0 | 0 |
| enabled | base | overlap | 5 | 23.229 / 27.126 / 28.854 / 5.625 | 108 | 3 |
| enabled | base | scheduler | 5 | 26.728 / 32.677 / 36.204 / 9.476 | 108 | 3 |
| enabled | base | scope | 5 | 21.045 / 28.912 / 50.137 / 29.092 | 108 | 3 |
| enabled | base | authorization | 5 | 17.318 / 19.863 / 28.347 / 11.029 | 108 | 3 |
| enabled | expanded | cold | 5 | 52.482 / 55.061 / 65.246 / 12.764 | 272 | 3 |
| enabled | expanded | warm | 5 | 1.113 / 1.168 / 1.544 / 0.431 | 0 | 0 |
| enabled | expanded | overlap | 5 | 19.268 / 19.956 / 22.797 / 3.529 | 272 | 3 |
| enabled | expanded | scheduler | 5 | 17.786 / 19.926 / 21.579 / 3.793 | 272 | 3 |
| enabled | expanded | scope | 5 | 20.156 / 21.729 / 24.257 / 4.101 | 272 | 3 |
| enabled | expanded | authorization | 5 | 17.311 / 18.795 / 20.159 / 2.848 | 272 | 3 |
| enabled | large | cold | 5 | 118.822 / 121.409 / 145.216 / 26.395 | 2612 | 3 |
| enabled | large | warm | 5 | 1.815 / 1.870 / 2.458 / 0.643 | 0 | 0 |
| enabled | large | overlap | 5 | 86.736 / 92.240 / 93.069 / 6.334 | 2612 | 3 |
| enabled | large | scheduler | 5 | 88.817 / 91.672 / 107.331 / 18.514 | 2612 | 3 |
| enabled | large | scope | 5 | 87.721 / 91.576 / 102.268 / 14.547 | 2612 | 3 |
| enabled | large | authorization | 5 | 82.136 / 84.063 / 91.413 / 9.276 | 2612 | 3 |

Frio e overlap idêntico usam 108/272/2612 envios para base/expanded/large; warm não envia. Compartilhamento de chave idêntica já existe e não é oportunidade nova. Scope/scheduler/authorization continuam com leituras atuais e não serão fundidos ao cache de exibição.

| Automação | Cenário frio | n | HTTP ms: mín / med / máx / amplitude | Janela das dependências ms: mín / med / máx / amplitude | Trabalho acumulado ms: mín / med / máx / amplitude |
|---|---|---:|---|---|---|
| disabled | base | 5 | 109.546 / 116.633 / 176.312 / 66.767 | 39.513 / 41.530 / 57.985 / 18.472 | 13.188 / 13.919 / 16.048 / 2.860 |
| disabled | expanded | 5 | 63.133 / 67.259 / 132.037 / 68.904 | 25.909 / 27.103 / 42.161 / 16.251 | 11.721 / 12.076 / 24.145 / 12.424 |
| disabled | large | 5 | 139.140 / 153.665 / 281.659 / 142.518 | 110.063 / 123.454 / 222.813 / 112.749 | 113.592 / 132.456 / 231.092 / 117.500 |
| enabled | base | 5 | 77.249 / 98.285 / 104.895 / 27.646 | 25.843 / 33.612 / 34.516 / 8.673 | 8.693 / 10.972 / 11.968 / 3.276 |
| enabled | expanded | 5 | 52.376 / 55.010 / 65.193 / 12.817 | 20.962 / 22.651 / 28.147 / 7.185 | 9.633 / 10.183 / 14.265 / 4.632 |
| enabled | large | 5 | 118.807 / 121.397 / 145.204 / 26.397 | 92.218 / 96.834 / 117.033 / 24.815 | 87.169 / 96.989 / 118.117 / 30.949 |

HTTP é o intervalo inclusivo até resposta serializada; a janela de dependências contém lacunas e não reconstrói o grafo causal completo. Trabalho acumulado soma execuções e pode sobrepor concorrência; não equivale à latência percebida. Nenhuma duração é extrapolada para GitHub.

| Cenário frio | Identity | ProjectItems | Project | ProjectFields | QueueIssue | Assignees | Blockers | Memberships | ItemValues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| base | 2 | 2 | 2 | 2 | 20 | 20 | 20 | 20 | 20 |
| expanded | 2 | 4 | 2 | 4 | 20 | 40 | 40 | 40 | 120 |
| large | 2 | 4 | 2 | 4 | 200 | 400 | 400 | 400 | 1200 |

| Automação | Cenário | HTTP frio/aquecido (bytes) | Itens na página / total | SQLite / WAL / SHM (bytes) | SQL frio run/all/get | SQL warm run/all/get |
|---|---|---:|---|---|---|---|
| disabled | base | 11662/11662 | 20/20 | 4096/1347272/32768 | 108/94/141 | 2/3/3 |
| disabled | expanded | 11662/11662 | 20/20 | 4096/1347272/32768 | 108/94/141 | 2/3/3 |
| disabled | large | 14409/14409 | 25/200 | 4096/1347272/32768 | 828/274/501 | 2/3/3 |
| enabled | base | 11441/11441 | 20/20 | 4096/1388472/32768 | 108/94/141 | 2/3/3 |
| enabled | expanded | 11441/11441 | 20/20 | 4096/1388472/32768 | 108/94/141 | 2/3/3 |
| enabled | large | 14188/14188 | 25/200 | 4096/1388472/32768 | 828/274/501 | 2/3/3 |

Entre consumidores de limit=7 e limit=25, duas observações expanded enviam 544 páginas e atingem pico agregado 6 (três workers em cada). São parâmetros públicos diferentes: não se declara equivalência de páginas nem se amplia cache para mascarar a diferença.

## Conteúdo útil e gatilhos web

| Automação | Cenário | n | HTTP: mín / med / máx / amplitude | Bytes totais respondidos: mín / med / máx / amplitude | Estados por janela (sucesso/falha/pendente) | Abort em pendência / conclusão posterior |
|---|---|---:|---|---|---|---|
| disabled | records dashboard idle for 120 simulated seconds and manual refresh | 5 | 17.000 / 17.000 / 17.000 / 0.000 | 13865.000 / 13865.000 / 13865.000 / 0.000 | 17/0/0 | 0/0 |
| disabled | records fila idle for 120 simulated seconds and manual refresh | 5 | 9.000 / 9.000 / 9.000 / 0.000 | 10530.000 / 10530.000 / 10530.000 / 0.000 | 9/0/0 | 0/0 |
| disabled | measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle | 5 | 11.000 / 11.000 / 11.000 / 0.000 | 6807.000 / 6807.000 / 6807.000 / 0.000 | 11/0/0 | 0/0 |
| disabled | attributes spaced events, resync and coincident triggers on dashboard | 5 | 73.000 / 73.000 / 73.000 / 0.000 | 45700.000 / 45700.000 / 45700.000 / 0.000 | 73/0/0 | 0/0 |
| disabled | attributes spaced events, resync and coincident triggers on fila | 5 | 24.000 / 24.000 / 24.000 / 0.000 | 28080.000 / 28080.000 / 28080.000 / 0.000 | 24/0/0 | 0/0 |
| disabled | attributes spaced events, resync and coincident triggers on tentativas | 5 | 20.000 / 20.000 / 20.000 / 0.000 | 4019.000 / 4019.000 / 4019.000 / 0.000 | 20/0/0 | 0/0 |
| disabled | measures rendered partial, error, retained content and confirmed empty as different outcomes | 5 | 3.000 / 3.000 / 3.000 / 0.000 | 2036.000 / 2036.000 / 2036.000 / 0.000 | 2/1/0 | 0/0 |
| disabled | discards A after invalidation and B completion, late A failure=false | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4804.000 / 4804.000 / 4804.000 / 0.000 | 6/0/4 | 3/1 |
| disabled | discards A after invalidation and B completion, late A failure=true | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 3727.000 / 3727.000 / 3727.000 / 0.000 | 5/1/4 | 3/1 |
| disabled | records coincident timer, event and resync without assuming recurring operation timers | 5 | 8.000 / 8.000 / 8.000 / 0.000 | 4429.000 / 4429.000 / 4429.000 / 0.000 | 8/0/0 | 1/1 |
| disabled | discards stale operation and active-attempt results and errors after their replacements render | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4180.000 / 4180.000 / 4180.000 / 0.000 | 7/1/2 | 3/2 |
| disabled | renders attempt continuation and visible failure while retaining the current page | 5 | 5.000 / 5.000 / 5.000 / 0.000 | 1701.000 / 1701.000 / 1701.000 / 0.000 | 4/1/0 | 0/0 |
| disabled | invalidates immediately before completion on attempt and preserves selection by IDs | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4819.000 / 4819.000 / 4819.000 / 0.000 | 6/0/4 | 3/1 |
| disabled | invalidates immediately before completion on resync and preserves selection by IDs | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4819.000 / 4819.000 / 4819.000 / 0.000 | 6/0/4 | 3/1 |
| disabled | continues queue pagination and restarts on conflict without accepting an old continuation | 5 | 5.000 / 5.000 / 5.000 / 0.000 | 4735.000 / 4735.000 / 4735.000 / 0.000 | 4/1/0 | 0/0 |
| disabled | preserves attempt page and ID actions, then discards pending work on project change and unmount | 5 | 11.000 / 11.000 / 11.000 / 0.000 | 2233.000 / 2233.000 / 2233.000 / 0.000 | 6/0/5 | 6/2 |
| enabled | records dashboard idle for 120 simulated seconds and manual refresh | 5 | 17.000 / 17.000 / 17.000 / 0.000 | 13853.000 / 13853.000 / 13853.000 / 0.000 | 17/0/0 | 0/0 |
| enabled | records fila idle for 120 simulated seconds and manual refresh | 5 | 9.000 / 9.000 / 9.000 / 0.000 | 10521.000 / 10521.000 / 10521.000 / 0.000 | 9/0/0 | 0/0 |
| enabled | measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle | 5 | 11.000 / 11.000 / 11.000 / 0.000 | 6802.000 / 6802.000 / 6802.000 / 0.000 | 11/0/0 | 0/0 |
| enabled | attributes spaced events, resync and coincident triggers on dashboard | 5 | 73.000 / 73.000 / 73.000 / 0.000 | 45652.000 / 45652.000 / 45652.000 / 0.000 | 73/0/0 | 0/0 |
| enabled | attributes spaced events, resync and coincident triggers on fila | 5 | 24.000 / 24.000 / 24.000 / 0.000 | 28056.000 / 28056.000 / 28056.000 / 0.000 | 24/0/0 | 0/0 |
| enabled | attributes spaced events, resync and coincident triggers on tentativas | 5 | 20.000 / 20.000 / 20.000 / 0.000 | 4019.000 / 4019.000 / 4019.000 / 0.000 | 20/0/0 | 0/0 |
| enabled | measures rendered partial, error, retained content and confirmed empty as different outcomes | 5 | 3.000 / 3.000 / 3.000 / 0.000 | 2034.000 / 2034.000 / 2034.000 / 0.000 | 2/1/0 | 0/0 |
| enabled | discards A after invalidation and B completion, late A failure=false | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4800.000 / 4800.000 / 4800.000 / 0.000 | 6/0/4 | 3/1 |
| enabled | discards A after invalidation and B completion, late A failure=true | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 3724.000 / 3724.000 / 3724.000 / 0.000 | 5/1/4 | 3/1 |
| enabled | records coincident timer, event and resync without assuming recurring operation timers | 5 | 8.000 / 8.000 / 8.000 / 0.000 | 4425.000 / 4425.000 / 4425.000 / 0.000 | 8/0/0 | 1/1 |
| enabled | discards stale operation and active-attempt results and errors after their replacements render | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4176.000 / 4176.000 / 4176.000 / 0.000 | 7/1/2 | 3/2 |
| enabled | renders attempt continuation and visible failure while retaining the current page | 5 | 5.000 / 5.000 / 5.000 / 0.000 | 1701.000 / 1701.000 / 1701.000 / 0.000 | 4/1/0 | 0/0 |
| enabled | invalidates immediately before completion on attempt and preserves selection by IDs | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4815.000 / 4815.000 / 4815.000 / 0.000 | 6/0/4 | 3/1 |
| enabled | invalidates immediately before completion on resync and preserves selection by IDs | 5 | 10.000 / 10.000 / 10.000 / 0.000 | 4815.000 / 4815.000 / 4815.000 / 0.000 | 6/0/4 | 3/1 |
| enabled | continues queue pagination and restarts on conflict without accepting an old continuation | 5 | 5.000 / 5.000 / 5.000 / 0.000 | 4731.000 / 4731.000 / 4731.000 / 0.000 | 4/1/0 | 0/0 |
| enabled | preserves attempt page and ID actions, then discards pending work on project change and unmount | 5 | 11.000 / 11.000 / 11.000 / 0.000 | 2233.000 / 2233.000 / 2233.000 / 0.000 | 6/0/5 | 6/2 |

As contagens de estado acima descrevem a janela antes do unmount: pedidos intencionalmente retidos continuam pendentes e não são excluídos como lentidão. Abort solicitado não significa cancelamento remoto. Timeout/AbortError do runner são exercitados nos testes backend em todas as dez execuções, com contagens separadas e sem apagar custo iniciado; não se mede timeout real de 15 s.

Conteúdo útil é verificado no DOM e separado de parcial, erro, conteúdo anterior e vazio completo. Nas leituras automáticas desta fixture, abertura fria e refresh aquecido dão 10 ms simulados (cinco amostras por modo/tela, mínimo=mediana=máximo=10, amplitude=0). Não é uma meta de produção. Casos de liberação manual podem ter duração virtual zero porque o protocolo não injeta espera; não participam de percentis de latência.

Dashboard ocioso por 120 s: operation=2, active=2, queue=8, projects=1; Fila=8 queue. Refresh manual acrescenta quatro/uma leituras. Navegação Dashboard → Fila → Tentativas → Dashboard: queue=3, operation=2, attempts=3, projects=3. Vinte eventos em 200 ms: Dashboard=60, Fila=20, histórico filtrado vazio=10. Eventos de outro projeto são pertinentes ao escopo global. Coincidência, resync, settings.updated, erro tardio, paginação e seleção por IDs conservam as verificações da sprint-003.

## AC-29: volume, persistência e acesso a conteúdo

Cinco execuções independentes da prova existente persistence-maintenance. Cada execução usa 0/16/64 MiB de cache denso ignorado, um warm-up por superfície e 20 leituras HTTP por superfície/volume. Estatísticas abaixo são mínimo/mediana/máximo/amplitude das cinco medianas locais, não de amostras agrupadas nem p95 inferencial. A automação não é variável desse ensaio de armazenamento; ele não despacha trabalho.

| Cache (bytes) | Superfície | n processos × leituras | Medianas ms: mín / med / máx / amplitude | Payload mínimo–máximo (bytes) |
|---:|---|---|---|---:|
| 0 | catalog | 5 × 20 | 0.822 / 0.915 / 1.311 / 0.489 | 653–653 |
| 0 | listings | 5 × 20 | 0.605 / 0.673 / 1.175 / 0.570 | 335–335 |
| 0 | history | 5 × 20 | 0.943 / 1.034 / 2.071 / 1.128 | 6872–6872 |
| 0 | polling | 5 × 20 | 2.494 / 3.281 / 7.267 / 4.773 | 3137–3137 |
| 0 | delivery | 5 × 20 | 4.316 / 4.944 / 10.238 / 5.922 | 4528–4528 |
| 0 | checks | 5 × 20 | 1.543 / 1.613 / 3.028 / 1.485 | 1963–1963 |
| 0 | rounds | 5 × 20 | 0.528 / 0.641 / 0.959 / 0.430 | 339–339 |
| 0 | dashboard | 5 × 20 | 1.794 / 1.967 / 3.250 / 1.456 | 883–883 |
| 0 | pagedHistory | 5 × 20 | 4.190 / 4.829 / 7.981 / 3.791 | 4332–4334 |
| 16777216 | catalog | 5 × 20 | 0.603 / 0.837 / 1.301 / 0.698 | 653–653 |
| 16777216 | listings | 5 × 20 | 0.621 / 0.707 / 1.107 / 0.486 | 335–335 |
| 16777216 | history | 5 × 20 | 0.928 / 1.274 / 2.305 / 1.377 | 6872–6872 |
| 16777216 | polling | 5 × 20 | 2.368 / 3.472 / 5.357 / 2.989 | 3137–3137 |
| 16777216 | delivery | 5 × 20 | 4.296 / 5.905 / 11.927 / 7.631 | 4528–4528 |
| 16777216 | checks | 5 × 20 | 2.090 / 2.321 / 4.013 / 1.923 | 1963–1963 |
| 16777216 | rounds | 5 × 20 | 0.678 / 0.754 / 0.961 / 0.283 | 339–339 |
| 16777216 | dashboard | 5 × 20 | 1.284 / 1.831 / 3.216 / 1.933 | 883–883 |
| 16777216 | pagedHistory | 5 × 20 | 4.761 / 4.859 / 8.839 / 4.079 | 4332–4334 |
| 67108864 | catalog | 5 × 20 | 0.619 / 0.800 / 1.165 / 0.546 | 653–653 |
| 67108864 | listings | 5 × 20 | 0.473 / 0.703 / 1.002 / 0.529 | 335–335 |
| 67108864 | history | 5 × 20 | 0.794 / 1.166 / 1.714 / 0.920 | 6872–6872 |
| 67108864 | polling | 5 × 20 | 2.280 / 2.470 / 6.426 / 4.146 | 3137–3137 |
| 67108864 | delivery | 5 × 20 | 3.836 / 5.024 / 9.802 / 5.966 | 4528–4528 |
| 67108864 | checks | 5 × 20 | 1.418 / 2.267 / 3.302 / 1.884 | 1963–1963 |
| 67108864 | rounds | 5 × 20 | 0.652 / 0.754 / 1.205 / 0.553 | 339–339 |
| 67108864 | dashboard | 5 × 20 | 1.294 / 1.816 / 3.672 / 2.378 | 883–883 |
| 67108864 | pagedHistory | 5 × 20 | 4.478 / 4.829 / 7.962 / 3.484 | 4332–4334 |

| Cache (bytes) | DB | WAL | SHM | Artefatos | Git de fixture | Trabalho operacional | Auxiliares |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 4096 | 2443192 | 32768 | 50 | 36 | 164 | 0 |
| 16777216 | 4096 | 2443192 | 32768 | 50 | 36 | 16777380 | 0 |
| 67108864 | 4096 | 2443192 | 32768 | 50 | 36 | 67109028 | 0 |

Tabela de tamanhos: primeira repetição; as cinco confirmam invariância na fase de leitura por data_version/eventos/auditoria e igualdade de payload por superfície dentro de cada banco. O único crescimento proporcional é o próprio arquivo ignorado operacional. Instrumentação fs com controle positivo prova ausência de leitura/enumeração de work/git/artifacts pelos resumos; auditoria SQLite e inspeção de auxiliares não encontram marcadores de conteúdo. A inspeção da fixture fora da janela lê arquivos para auditoria e não é custo da consulta.

Referência, árvore e base Git aprovadas permanecem identificáveis após close/reopen e remoção elegível controlada; não são snapshots de checkout ou índice. O Git e o executor dessa prova são controlados; não constitui recuperação de processo físico ou prova de Git externo. Alterações posteriores de WAL por operações legítimas não são crescimento atribuído a cache.

## Ranking e primeira fatia

| Prioridade | Candidato | Evidência e frequência | Decisão |
|---:|---|---|---|
| 1 | Primeiras páginas de fieldValues dos memberships no contexto de fila | ItemValues=20/120/1200 envios, antes do resultado útil; três memberships materializadas em expanded/large. Frequência real de memberships múltiplas desconhecida. | Selecionado: composição das primeiras páginas, sem omitir memberships/campos. |
| 2 | Gatilhos web e sobreposição | 60 GETs para vinte eventos globais; cache já compartilha chaves iguais. A pertinência precisa ser comprovada por tipo, e os eventos de outro projeto não são irrelevantes na visão global. | Não filtrar nem reduzir atualidade nesta fatia. |
| 3 | Paginação/limites com observação repetida | 544 envios em dois limites diferentes. Ampliar reutilização entre páginas pode mudar a atualidade da continuação. | Não incluir. |
| 4 | SQL/resumos/persistência | 343 execuções no cold base e 1603 no large; oito no warm. Payload e armazenamento não crescem com 64 MiB de cache. Tempos locais não representam IO remoto. | Sem refatoração Storage ou nova infraestrutura. |

Fatia única selecionada: backend, dentro de `getIssueContextById(id, { purpose: queue })` e `readIssueContext`. Compor em um envio as primeiras páginas de fieldValues de até três memberships da mesma issue. Continuar todas as páginas seguintes de cada conexão pelo seu cursor, preservando todas as memberships, campos select/number, ordem, diagnósticos e parcialidade. Para uma membership, manter o custo e caminho equivalente. Isto é alvo e orçamento para implementação futura, não mudança já aplicada nem redução comprovada.

Superfícies previstas: `apps/controller/src/modules/github/client.ts`, `queries.ts`; `transport.ts` somente se necessário para reutilizar uma primeira página já recebida no coletor sem reenviá-la. Não alterar contrato público, createQueue.read/observe/save, TTL, chave de cache, filtros de eventos, pipeline/start ou publication. O seam de transporte de teste e github.test recebem as respostas e regressões pertinentes; os ensaios precisam continuar capazes de executar a referência anterior e a nova versão com as mesmas condições.

Metas derivadas do baseline para grupos de três: base permanece no máximo 108 envios; expanded 272 → no máximo 232; large 2612 → no máximo 2212. Conta: economizar duas primeiras páginas por issue com três memberships, 20×2=40 e 200×2=400. ItemValues 120→80 e 1200→800; páginas de continuação não são cortadas. Não impor percentual de latência sem rede real. O resultado só pode ser aceito após o oráculo e a matriz antes/depois comprovarem menor trabalho, sem regressão sustentada de tempo/conteúdo útil no alvo.

Garantias: conta/projeto/finalidade permanecem isolados, sem compartilhar autorização. Mesma observação de conta antes/depois, três workers por observação, nenhuma nova simultaneidade de issues ou retry. Query e byte budgets continuam contando envios/bytes efetivos; timeout/throttle/backoff e limites de resposta continuam ativos. Não remover erros de memberships que antes contribuíam para partial. Node ausente/duplicado/tipo inválido, erro parcial GraphQL, acesso negado, budget/bytes, segunda página falha ou cursor repetido devem manter incompletude e diagnóstico, nunca elegibilidade falsa. Batching não pode transformar payload antes aceito em falha por um limite menor efetivo: demonstrar limites do grupo e cobertura de fronteira antes de concluir a implementação.

Viabilidade sprint-005, limite de três rounds: (1) implementação restrita de consulta/adaptação da primeira página e testes de equivalência; (2) provas adversariais de paginação, node ausente/fora de ordem/duplicado, falhas e budgets; (3) repetir matriz, typecheck/lint/build e corrigir achados da mesma fatia. O recorte não inclui batching de continuações, GraphQL genérico, scheduler, coalescência nova nem UI. Cabe no orçamento configurado pelo tamanho do recorte e seams existentes; isso é estimativa, não garantia. Se uma falha exigir alterar semântica pública, atualidade, erro ou limite, parar essa adoção e registrar o impedimento; não migrar automaticamente a outro candidato nem ampliar escopo.

A consulta agrupada precisa ser validada contra o schema oficial antes de implementar. Context7 confirmou fieldValues como conexão com first/after e paginação de 1–100. Menos envios não equivale automaticamente a menor pontuação GraphQL, pois custo primário é calculado por conexões. Referências oficiais: [Projects](https://docs.github.com/en/graphql/reference/projects), [paginação](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api), [limites](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api). Sem benchmark de rede nem chamada GitHub real nesta sprint.

Não foi identificada necessidade de mudar atualidade, layout, contrato, escopo de autorização ou risco de efeito externo. Uma alteração assim não está autorizada pela seleção. A sprint-005 aguarda autorização do usuário; não foi iniciada.

## Identidade dos arquivos medidos

Nota posterior, 2026-10-21: o baseline acima permanece histórico. Após o impedimento de tamanho da sprint-005, o usuário autorizou elevar somente o teto das respostas agrupadas para 8/12 MiB (duas/três memberships), mantendo 4 MiB individual e 16 MiB por operação. A implementação e os resultados controlados 108/108, 272/232 e 2612/2212 estão registrados na retomada da sprint-005 em SPEC_PROGRESS.md. Isso substitui a regra de parada apenas quanto ao teto por resposta autorizado, sem iniciar sprint-006 nem comprovar latência remota ou pontos GraphQL.

Alterações locais desta sprint: ensaio observation-matrix.test.ts, variação de automação/relatórios privados no ensaio web e scripts de reprodução/consolidação. Fixtures e implementação anterior preservadas. Não se atesta inventário Git completo: usaram-se HEAD/ref e hashes, sem comandos Git autenticados ou mutáveis.

| Arquivo | SHA-256 |
|---|---|
| apps/controller/src/modules/projects/queue.ts | db339d8d22f58fcf518e1e5709fa4d921154a1f7c5a9ebda37178f5f0bd5f8dc |
| apps/controller/src/modules/github/client.ts | e1b89603a843a8c3ac23746bd763bc06575d40a36c60aa6e177375c2a2f0d67e |
| apps/controller/src/modules/github/transport.ts | c0ad13ef77d86f744b1abc3fcd7d2109ca25a86bb8643bbddc853afa10395add |
| apps/web/src/features/queue/useQueue.ts | ce08fd24e1146b699691a26b6383bcb24127be95996a5feb360a667237ca9405 |
| apps/controller/src/modules/github/queries.ts | 68dfe25ba5ca6a92695c40c155ec4c9de605d0047fddbb1f6ddaaeadb09cfb49 |
| apps/controller/src/modules/storage/index.ts | 65dbd5f2f7856c0f6ff64042fe8cf356e8ef7951df82e22a30742345ffe6484e |
| tests/fixtures/observation-baseline.ts | 2f5052baf0d669894fcb93202e3b25f6629c00e67629e621b0b145036669c291 |
| tests/fixtures/backend-measurement.ts | 8a0df231adf2f867a845ac4037524fcd17d16dac45f6d92fb5a605a36129bdbc |
| tests/fixtures/observation-wire.ts | 3066a32464b5ff37ffe795a26f620b46a947d07db8a8949f2153467ad6b36cf6 |
| tests/acceptance/persistence-maintenance.test.ts | 8340a2bbeb19cd6e770833671627889a3de0e4bdd596736619c5fc7908fe42b6 |
| apps/web/src/features/operations/useOperation.ts | 8246ddd28a060712bdd5587c178675be5aa5da4a1b7f331e764a244a3e01a7ee |
| apps/web/src/features/operations/useActiveAttempt.ts | 02b151e0c271bf897ee064d96bf2c0c46f88521d2ff0d4b3fef0deeb7dcb01a3 |
| apps/web/src/features/operations/observation-baseline.test.ts | b99417b7acd42fca8e17f9388152bb78c2ee3cf489a31546fd9e18c83ad295ca |
| tests/integration/observation-matrix.test.ts | 37a26d4dba09bef03c5fc5ce8e556fa7bb61ac57822761d1feba45c2ce972a10 |
