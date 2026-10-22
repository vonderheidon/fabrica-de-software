# Comparação final da observação

Capturas: baseline 2026-10-21T20:55:28.072Z; depois 2026-10-21T23:06:57.975Z. Ambiente v24.22.0, win32/x64. Referência Git HEAD/ref: eb81a888289193e6bb658728990c36a28ab47d01, acrescida do trabalho local identificado pelos hashes. Sem commit criado pelo agente.

## Condições e interpretação

Fatia única: primeiras páginas de fieldValues de até três memberships da mesma issue, somente no contexto queue. Continuações individuais, diagnósticos, ordem, revalidações e política da fila preservados. Teto autorizado: 4 MiB individual, 8/12 MiB por grupo de duas/três páginas; orçamento agregado de 16 MiB, 250 envios, timeout de 15 s e três workers por observação.

Reprodução: `node scripts/run-observation-baseline.mjs .cache/observation-comparison-final-runs`, depois `node scripts/summarize-observation-comparison.mjs`. O baseline histórico em `.cache/observation-baseline-runs` e observation-baseline.md foi preservado. Fonte completa das tabelas: results.json e arquivos {disabled,enabled}-{1..5}.{json,log} nas duas pastas. A captura inicial desta sprint permanece em observation-comparison-runs; a final reflete a correção da fixture HTTP.

Dois projetos, base 10 issues/projeto × 1 membership × 1 página; expanded 10 × 3 × 2; large 100 × 3 × 2. Relógio de domínio 1800000000000; sem atraso remoto no runner. Cinco processos independentes por modo, dez por captura; cada linha informa cinco amostras. Frio, warm imediato, expiração virtual em 11 s, dois HTTP iguais sobrepostos, scheduler/scope/authorization independentes. Automação ligada/desligada apenas configura fixture, sem despacho real.

Estatísticas em ms: mínimo / mediana / máximo / amplitude. Não há descarte de amostras lentas, p95 inferencial, randomização ou isolamento de carga/JIT/SO. O runner de referência legacyValues restaura envios individuais das primeiras páginas no seam de teste, não é opção de produção nem execução de checkout histórico completo. A sequência de requisições públicas e os dados são iguais; a organização interna das páginas agrupadas é diferente. Não extrapolar milissegundos de SQLite/serialização/instrumentação para GitHub.

Redução de trabalho físico foi sustentada nas amostras e no oráculo. Latência local é variável e inconclusiva como ganho geral: inclusive o controle base sem economia de chamadas varia entre capturas. Não declarar aceite de desempenho remoto, economia de pontos primários GraphQL, causa de rate limit ou frequência de uso real.

## Matriz HTTP histórica antes/depois

| Automação | Cenário | Fase | n por versão | Antes ms mín/med/máx/amplitude | Depois ms mín/med/máx/amplitude | Envios antes/depois | Pico antes/depois |
|---|---|---|---:|---|---|---|---|
| disabled | base | cold | 5 | 109.699 / 116.808 / 176.509 / 66.810 | 183.408 / 219.965 / 420.719 / 237.311 | 108/108 | 3/3 |
| disabled | base | warm | 5 | 1.732 / 2.130 / 2.713 / 0.981 | 2.223 / 2.297 / 4.084 / 1.861 | 0/0 | 0/0 |
| disabled | base | overlap | 5 | 29.524 / 30.164 / 37.681 / 8.157 | 29.124 / 48.418 / 67.682 / 38.558 | 108/108 | 3/3 |
| disabled | base | scheduler | 5 | 26.411 / 34.280 / 44.968 / 18.557 | 35.650 / 40.219 / 51.926 / 16.276 | 108/108 | 3/3 |
| disabled | base | scope | 5 | 25.144 / 35.944 / 48.842 / 23.698 | 29.056 / 35.330 / 38.977 / 9.921 | 108/108 | 3/3 |
| disabled | base | authorization | 5 | 23.611 / 27.236 / 50.134 / 26.523 | 30.204 / 37.711 / 41.136 / 10.932 | 108/108 | 3/3 |
| disabled | expanded | cold | 5 | 63.189 / 67.321 / 132.104 / 68.915 | 113.978 / 157.275 / 200.068 / 86.090 | 272/232 | 3/3 |
| disabled | expanded | warm | 5 | 1.270 / 1.701 / 1.866 / 0.596 | 1.874 / 2.278 / 3.243 / 1.369 | 0/0 | 0/0 |
| disabled | expanded | overlap | 5 | 21.342 / 26.114 / 53.880 / 32.537 | 48.923 / 49.901 / 66.109 / 17.186 | 272/232 | 3/3 |
| disabled | expanded | scheduler | 5 | 24.032 / 28.428 / 52.061 / 28.029 | 35.891 / 43.773 / 62.778 / 26.888 | 272/232 | 3/3 |
| disabled | expanded | scope | 5 | 25.285 / 30.834 / 62.797 / 37.512 | 34.760 / 41.894 / 45.153 / 10.393 | 272/232 | 3/3 |
| disabled | expanded | authorization | 5 | 24.448 / 27.064 / 39.216 / 14.768 | 34.298 / 59.106 / 72.429 / 38.131 | 272/232 | 3/3 |
| disabled | large | cold | 5 | 139.152 / 153.682 / 281.676 / 142.524 | 248.120 / 264.895 / 393.302 / 145.181 | 2612/2212 | 3/3 |
| disabled | large | warm | 5 | 1.854 / 2.175 / 3.880 / 2.027 | 3.545 / 4.016 / 13.105 / 9.560 | 0/0 | 0/0 |
| disabled | large | overlap | 5 | 96.298 / 100.300 / 228.549 / 132.250 | 193.660 / 240.805 / 342.135 / 148.475 | 2612/2212 | 3/3 |
| disabled | large | scheduler | 5 | 104.873 / 107.879 / 226.058 / 121.185 | 180.084 / 272.731 / 359.970 / 179.886 | 2612/2212 | 3/3 |
| disabled | large | scope | 5 | 108.184 / 126.608 / 244.324 / 136.139 | 126.905 / 244.612 / 379.532 / 252.627 | 2612/2212 | 3/3 |
| disabled | large | authorization | 5 | 105.301 / 115.955 / 197.163 / 91.861 | 134.121 / 206.422 / 231.295 / 97.174 | 2612/2212 | 3/3 |
| enabled | base | cold | 5 | 77.378 / 98.427 / 105.078 / 27.700 | 61.119 / 73.614 / 77.654 / 16.535 | 108/108 | 3/3 |
| enabled | base | warm | 5 | 1.425 / 2.049 / 2.322 / 0.896 | 1.261 / 1.361 / 2.253 / 0.992 | 0/0 | 0/0 |
| enabled | base | overlap | 5 | 23.229 / 27.126 / 28.854 / 5.625 | 16.974 / 19.649 / 29.778 / 12.805 | 108/108 | 3/3 |
| enabled | base | scheduler | 5 | 26.728 / 32.677 / 36.204 / 9.476 | 21.931 / 23.815 / 26.183 / 4.253 | 108/108 | 3/3 |
| enabled | base | scope | 5 | 21.045 / 28.912 / 50.137 / 29.092 | 15.528 / 18.503 / 31.870 / 16.341 | 108/108 | 3/3 |
| enabled | base | authorization | 5 | 17.318 / 19.863 / 28.347 / 11.029 | 16.415 / 21.337 / 23.646 / 7.231 | 108/108 | 3/3 |
| enabled | expanded | cold | 5 | 52.482 / 55.061 / 65.246 / 12.764 | 50.547 / 53.783 / 65.196 / 14.648 | 272/232 | 3/3 |
| enabled | expanded | warm | 5 | 1.113 / 1.168 / 1.544 / 0.431 | 1.129 / 1.183 / 1.268 / 0.139 | 0/0 | 0/0 |
| enabled | expanded | overlap | 5 | 19.268 / 19.956 / 22.797 / 3.529 | 18.521 / 19.059 / 24.199 / 5.678 | 272/232 | 3/3 |
| enabled | expanded | scheduler | 5 | 17.786 / 19.926 / 21.579 / 3.793 | 16.755 / 19.807 / 24.454 / 7.699 | 272/232 | 3/3 |
| enabled | expanded | scope | 5 | 20.156 / 21.729 / 24.257 / 4.101 | 17.290 / 17.794 / 19.843 / 2.553 | 272/232 | 3/3 |
| enabled | expanded | authorization | 5 | 17.311 / 18.795 / 20.159 / 2.848 | 17.070 / 21.786 / 30.442 / 13.372 | 272/232 | 3/3 |
| enabled | large | cold | 5 | 118.822 / 121.409 / 145.216 / 26.395 | 155.860 / 169.573 / 179.782 / 23.922 | 2612/2212 | 3/3 |
| enabled | large | warm | 5 | 1.815 / 1.870 / 2.458 / 0.643 | 1.779 / 2.015 / 3.147 / 1.368 | 0/0 | 0/0 |
| enabled | large | overlap | 5 | 86.736 / 92.240 / 93.069 / 6.334 | 111.237 / 126.140 / 138.506 / 27.268 | 2612/2212 | 3/3 |
| enabled | large | scheduler | 5 | 88.817 / 91.672 / 107.331 / 18.514 | 103.889 / 121.872 / 136.762 / 32.873 | 2612/2212 | 3/3 |
| enabled | large | scope | 5 | 87.721 / 91.576 / 102.268 / 14.547 | 120.221 / 132.489 / 138.140 / 17.919 | 2612/2212 | 3/3 |
| enabled | large | authorization | 5 | 82.136 / 84.063 / 91.413 / 9.276 | 123.179 / 140.671 / 143.342 / 20.163 | 2612/2212 | 3/3 |

Metas derivadas atingidas no cenário controlado: base 108 → 108; expanded 272 → 232 (-40, 14,7%); large 2612 → 2212 (-400, 15,3%). Warm continua sem envio. Overlap de mesma chave compartilha a observação; consumidores com limites diferentes continuam independentes e as observações de autoridade continuam novas.

## Referência pareada atual e bytes físicos

| Automação | Cenário | n | Referência ms mín/med/máx/amplitude | Agrupado ms mín/med/máx/amplitude | Wire bytes referência/agrupado | Payload público bytes referência/agrupado |
|---|---|---:|---|---|---|---|
| disabled | base | 5 | 49.450 / 58.195 / 108.623 / 59.173 | 30.910 / 35.088 / 71.147 / 40.237 | 39126-39126/39126-39126 | 11662-11662/11662-11662 |
| disabled | expanded | 5 | 36.478 / 46.187 / 66.370 / 29.892 | 35.142 / 50.762 / 70.411 / 35.269 | 79818-79818/80304-80304 | 11662-11662/11662-11662 |
| disabled | large | 5 | 264.125 / 325.791 / 373.748 / 109.623 | 227.664 / 239.837 / 329.869 / 102.206 | 778428-778428/783780-783780 | 14409-14409/14409-14409 |
| enabled | base | 5 | 33.662 / 36.961 / 42.163 / 8.501 | 23.727 / 24.206 / 32.203 / 8.476 | 39126-39126/39126-39126 | 11662-11662/11662-11662 |
| enabled | expanded | 5 | 20.313 / 25.955 / 31.438 / 11.125 | 20.403 / 20.687 / 28.206 / 7.803 | 79818-79818/80304-80304 | 11662-11662/11662-11662 |
| enabled | large | 5 | 106.082 / 116.387 / 124.280 / 18.198 | 95.710 / 111.046 / 135.403 / 39.694 | 778428-778428/783780-783780 | 14409-14409/14409-14409 |

Wire bytes incluem o stdout HTTP sintético completo recebido pelo transporte, não compressão/rede real. A identidade e o tipo de cada membership acrescentam bytes: expanded 79818 → 80304 (+486; 0,61%); large 778428 → 783780 (+5352; 0,69%). O payload público permanece equivalente. A referência pareada roda antes do agrupado em cada processo; aquecimento e ordem impedem atribuição causal da diferença de tempo.

## Custo, picos e armazenamento

| Automação | Cenário frio | n | Janela dependências antes/depois ms | Trabalho acumulado antes/depois ms | HTTP bytes antes/depois | SQLite/WAL/SHM antes → depois bytes |
|---|---|---:|---|---|---|---|
| disabled | base | 5 | 39.513 / 41.530 / 57.985 / 18.472 → 39.445 / 46.039 / 81.495 / 42.050 | 13.188 / 13.919 / 16.048 / 2.860 → 15.553 / 16.880 / 123.955 / 108.402 | 11662/11662 | 4096/1347272/32768 → 4096/1347272/32768 |
| disabled | expanded | 5 | 25.909 / 27.103 / 42.161 / 16.251 → 49.740 / 54.550 / 125.194 / 75.454 | 11.721 / 12.076 / 24.145 / 12.424 → 15.615 / 29.889 / 129.459 / 113.844 | 11662/11662 | 4096/1347272/32768 → 4096/1347272/32768 |
| disabled | large | 5 | 110.063 / 123.454 / 222.813 / 112.749 → 198.568 / 212.014 / 310.466 / 111.899 | 113.592 / 132.456 / 231.092 / 117.500 → 176.133 / 198.794 / 310.003 / 133.870 | 14409/14409 | 4096/1347272/32768 → 4096/1347272/32768 |
| enabled | base | 5 | 25.843 / 33.612 / 34.516 / 8.673 → 16.816 / 17.097 / 17.347 / 0.531 | 8.693 / 10.972 / 11.968 / 3.276 → 6.255 / 6.373 / 6.709 / 0.454 | 11441/11441 | 4096/1388472/32768 → 4096/1388472/32768 |
| enabled | expanded | 5 | 20.962 / 22.651 / 28.147 / 7.185 → 17.323 / 18.771 / 24.688 / 7.365 | 9.633 / 10.183 / 14.265 / 4.632 → 7.972 / 8.284 / 10.613 / 2.641 | 11441/11441 | 4096/1388472/32768 → 4096/1388472/32768 |
| enabled | large | 5 | 92.218 / 96.834 / 117.033 / 24.815 → 124.133 / 142.505 / 146.416 / 22.283 | 87.169 / 96.989 / 118.117 / 30.949 → 125.898 / 145.931 / 158.848 / 32.950 | 14188/14188 | 4096/1388472/32768 → 4096/1388472/32768 |

Janela de dependências não reconstrói causalidade completa; trabalho acumulado soma durações concorrentes e não é tempo percebido. Pico por observação permanece três; observações independentes podem chegar a seis. Os testes backend preservam timeout/AbortError, falha antes/depois de envio, query/byte budgets, pendências e drenagem posterior ao abort. Cada uma das dez execuções inclui esses testes; não se apagam envios já iniciados nem se trata abort solicitado como cancelamento físico.

### AC-29, caches densos ignorados

| Versão | Cache bytes | Superfície | n processos × leituras | Medianas ms mín/med/máx/amplitude | Payload bytes min-max |
|---|---:|---|---|---|---|
| antes | 0 | catalog | 5 × 20 | 0.822 / 0.915 / 1.311 / 0.489 | 653-653 |
| antes | 0 | listings | 5 × 20 | 0.605 / 0.673 / 1.175 / 0.570 | 335-335 |
| antes | 0 | history | 5 × 20 | 0.943 / 1.034 / 2.071 / 1.128 | 6872-6872 |
| antes | 0 | polling | 5 × 20 | 2.494 / 3.281 / 7.267 / 4.773 | 3137-3137 |
| antes | 0 | delivery | 5 × 20 | 4.316 / 4.944 / 10.238 / 5.922 | 4528-4528 |
| antes | 0 | checks | 5 × 20 | 1.543 / 1.613 / 3.028 / 1.485 | 1963-1963 |
| antes | 0 | rounds | 5 × 20 | 0.528 / 0.641 / 0.959 / 0.430 | 339-339 |
| antes | 0 | dashboard | 5 × 20 | 1.794 / 1.967 / 3.250 / 1.456 | 883-883 |
| antes | 0 | pagedHistory | 5 × 20 | 4.190 / 4.829 / 7.981 / 3.791 | 4332-4334 |
| antes | 16777216 | catalog | 5 × 20 | 0.603 / 0.837 / 1.301 / 0.698 | 653-653 |
| antes | 16777216 | listings | 5 × 20 | 0.621 / 0.707 / 1.107 / 0.486 | 335-335 |
| antes | 16777216 | history | 5 × 20 | 0.928 / 1.274 / 2.305 / 1.377 | 6872-6872 |
| antes | 16777216 | polling | 5 × 20 | 2.368 / 3.472 / 5.357 / 2.989 | 3137-3137 |
| antes | 16777216 | delivery | 5 × 20 | 4.296 / 5.905 / 11.927 / 7.631 | 4528-4528 |
| antes | 16777216 | checks | 5 × 20 | 2.090 / 2.321 / 4.013 / 1.923 | 1963-1963 |
| antes | 16777216 | rounds | 5 × 20 | 0.678 / 0.754 / 0.961 / 0.283 | 339-339 |
| antes | 16777216 | dashboard | 5 × 20 | 1.284 / 1.831 / 3.216 / 1.933 | 883-883 |
| antes | 16777216 | pagedHistory | 5 × 20 | 4.761 / 4.859 / 8.839 / 4.079 | 4332-4334 |
| antes | 67108864 | catalog | 5 × 20 | 0.619 / 0.800 / 1.165 / 0.546 | 653-653 |
| antes | 67108864 | listings | 5 × 20 | 0.473 / 0.703 / 1.002 / 0.529 | 335-335 |
| antes | 67108864 | history | 5 × 20 | 0.794 / 1.166 / 1.714 / 0.920 | 6872-6872 |
| antes | 67108864 | polling | 5 × 20 | 2.280 / 2.470 / 6.426 / 4.146 | 3137-3137 |
| antes | 67108864 | delivery | 5 × 20 | 3.836 / 5.024 / 9.802 / 5.966 | 4528-4528 |
| antes | 67108864 | checks | 5 × 20 | 1.418 / 2.267 / 3.302 / 1.884 | 1963-1963 |
| antes | 67108864 | rounds | 5 × 20 | 0.652 / 0.754 / 1.205 / 0.553 | 339-339 |
| antes | 67108864 | dashboard | 5 × 20 | 1.294 / 1.816 / 3.672 / 2.378 | 883-883 |
| antes | 67108864 | pagedHistory | 5 × 20 | 4.478 / 4.829 / 7.962 / 3.484 | 4332-4334 |
| depois | 0 | catalog | 5 × 20 | 1.296 / 1.423 / 1.745 / 0.449 | 653-653 |
| depois | 0 | listings | 5 × 20 | 0.989 / 1.096 / 1.158 / 0.169 | 335-335 |
| depois | 0 | history | 5 × 20 | 1.798 / 1.896 / 2.068 / 0.270 | 6872-6872 |
| depois | 0 | polling | 5 × 20 | 5.451 / 5.811 / 8.461 / 3.010 | 3137-3137 |
| depois | 0 | delivery | 5 × 20 | 9.441 / 10.327 / 12.386 / 2.945 | 4528-4528 |
| depois | 0 | checks | 5 × 20 | 3.157 / 3.524 / 3.726 / 0.568 | 1963-1963 |
| depois | 0 | rounds | 5 × 20 | 0.904 / 1.024 / 1.148 / 0.244 | 339-339 |
| depois | 0 | dashboard | 5 × 20 | 2.460 / 2.776 / 3.526 / 1.066 | 883-883 |
| depois | 0 | pagedHistory | 5 × 20 | 7.123 / 7.875 / 8.465 / 1.342 | 4332-4334 |
| depois | 16777216 | catalog | 5 × 20 | 0.979 / 1.063 / 1.223 / 0.244 | 653-653 |
| depois | 16777216 | listings | 5 × 20 | 0.777 / 0.871 / 0.938 / 0.160 | 335-335 |
| depois | 16777216 | history | 5 × 20 | 1.467 / 1.551 / 1.870 / 0.403 | 6872-6872 |
| depois | 16777216 | polling | 5 × 20 | 3.155 / 5.065 / 5.112 / 1.957 | 3137-3137 |
| depois | 16777216 | delivery | 5 × 20 | 6.428 / 8.048 / 10.355 / 3.927 | 4528-4528 |
| depois | 16777216 | checks | 5 × 20 | 2.370 / 3.040 / 3.289 / 0.919 | 1963-1963 |
| depois | 16777216 | rounds | 5 × 20 | 0.786 / 0.930 / 0.956 / 0.169 | 339-339 |
| depois | 16777216 | dashboard | 5 × 20 | 2.054 / 2.442 / 2.924 / 0.870 | 883-883 |
| depois | 16777216 | pagedHistory | 5 × 20 | 5.106 / 7.291 / 7.712 / 2.606 | 4332-4334 |
| depois | 67108864 | catalog | 5 × 20 | 0.836 / 1.093 / 1.135 / 0.299 | 653-653 |
| depois | 67108864 | listings | 5 × 20 | 0.657 / 0.825 / 0.901 / 0.244 | 335-335 |
| depois | 67108864 | history | 5 × 20 | 1.219 / 1.472 / 1.727 / 0.508 | 6872-6872 |
| depois | 67108864 | polling | 5 × 20 | 3.372 / 4.591 / 4.966 / 1.594 | 3137-3137 |
| depois | 67108864 | delivery | 5 × 20 | 6.353 / 8.433 / 9.808 / 3.455 | 4528-4528 |
| depois | 67108864 | checks | 5 × 20 | 2.164 / 3.041 / 3.876 / 1.712 | 1963-1963 |
| depois | 67108864 | rounds | 5 × 20 | 0.714 / 0.870 / 0.970 / 0.256 | 339-339 |
| depois | 67108864 | dashboard | 5 × 20 | 1.570 / 2.388 / 2.514 / 0.944 | 883-883 |
| depois | 67108864 | pagedHistory | 5 × 20 | 5.088 / 7.441 / 7.890 / 2.802 | 4332-4334 |

| Versão | Cache bytes | DB/WAL/SHM | Artefatos | Git fixture | Trabalho operacional | Auxiliares |
|---|---:|---|---:|---:|---:|---:|
| antes | 0 | 4096/2443192/32768 | 50 | 36 | 164 | 0 |
| antes | 16777216 | 4096/2443192/32768 | 50 | 36 | 16777380 | 0 |
| antes | 67108864 | 4096/2443192/32768 | 50 | 36 | 67109028 | 0 |
| depois | 0 | 4096/2443192/32768 | 50 | 36 | 164 | 0 |
| depois | 16777216 | 4096/2443192/32768 | 50 | 36 | 16777380 | 0 |
| depois | 67108864 | 4096/2443192/32768 | 50 | 36 | 67109028 | 0 |

Tamanhos acima: primeira repetição, sem ocultar que WAL varia com eventos legítimos. As cinco execuções de cada captura comprovam invariância durante a leitura em 0/16/64 MiB, payloads por superfície, ausência de acesso a work/git/artifacts nos resumos e de marcadores de conteúdo/auxiliares persistidos. Há controle positivo dos spies. Só o cache operacional cresce proporcionalmente. Referências Git são controladas em memória; a prova não certifica IO Git nativo ou recuperação de processo físico.

## Web simulada, atualidade e conteúdo útil

| Automação | Cenário web | n por versão | Leituras antes/depois | Bytes antes/depois | Tempo de conteúdo útil |
|---|---|---:|---|---|---|
| disabled | records dashboard idle for 120 simulated seconds and manual refresh | 5 | 17/17 | 13865-13865/13865-13865 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| disabled | records fila idle for 120 simulated seconds and manual refresh | 5 | 9/9 | 10530-10530/10530-10530 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| disabled | measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle | 5 | 11/11 | 6807-6807/6807-6807 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| disabled | attributes spaced events, resync and coincident triggers on dashboard | 5 | 73/73 | 45700-45700/45700-45700 | sem amostra → sem amostra |
| disabled | attributes spaced events, resync and coincident triggers on fila | 5 | 24/24 | 28080-28080/28080-28080 | sem amostra → sem amostra |
| disabled | attributes spaced events, resync and coincident triggers on tentativas | 5 | 20/20 | 4019-4019/4019-4019 | sem amostra → sem amostra |
| disabled | measures rendered partial, error, retained content and confirmed empty as different outcomes | 5 | 3/3 | 2036-2036/2036-2036 | 0.000 / 0.000 / 0.000 / 0.000 → 0.000 / 0.000 / 0.000 / 0.000 |
| disabled | discards A after invalidation and B completion, late A failure=false | 5 | 10/10 | 4804-4804/4804-4804 | sem amostra → sem amostra |
| disabled | discards A after invalidation and B completion, late A failure=true | 5 | 10/10 | 3727-3727/3727-3727 | sem amostra → sem amostra |
| disabled | records coincident timer, event and resync without assuming recurring operation timers | 5 | 8/8 | 4429-4429/4429-4429 | sem amostra → sem amostra |
| disabled | discards stale operation and active-attempt results and errors after their replacements render | 5 | 10/10 | 4180-4180/4180-4180 | sem amostra → sem amostra |
| disabled | renders attempt continuation and visible failure while retaining the current page | 5 | 5/5 | 1701-1701/1701-1701 | sem amostra → sem amostra |
| disabled | invalidates immediately before completion on attempt and preserves selection by IDs | 5 | 10/10 | 4819-4819/4819-4819 | sem amostra → sem amostra |
| disabled | invalidates immediately before completion on resync and preserves selection by IDs | 5 | 10/10 | 4819-4819/4819-4819 | sem amostra → sem amostra |
| disabled | continues queue pagination and restarts on conflict without accepting an old continuation | 5 | 5/5 | 4735-4735/4735-4735 | sem amostra → sem amostra |
| disabled | preserves attempt page and ID actions, then discards pending work on project change and unmount | 5 | 11/11 | 2233-2233/2233-2233 | sem amostra → sem amostra |
| enabled | records dashboard idle for 120 simulated seconds and manual refresh | 5 | 17/17 | 13853-13853/13853-13853 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| enabled | records fila idle for 120 simulated seconds and manual refresh | 5 | 9/9 | 10521-10521/10521-10521 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| enabled | measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle | 5 | 11/11 | 6802-6802/6802-6802 | 10.000 / 10.000 / 10.000 / 0.000 → 10.000 / 10.000 / 10.000 / 0.000 |
| enabled | attributes spaced events, resync and coincident triggers on dashboard | 5 | 73/73 | 45652-45652/45652-45652 | sem amostra → sem amostra |
| enabled | attributes spaced events, resync and coincident triggers on fila | 5 | 24/24 | 28056-28056/28056-28056 | sem amostra → sem amostra |
| enabled | attributes spaced events, resync and coincident triggers on tentativas | 5 | 20/20 | 4019-4019/4019-4019 | sem amostra → sem amostra |
| enabled | measures rendered partial, error, retained content and confirmed empty as different outcomes | 5 | 3/3 | 2034-2034/2034-2034 | 0.000 / 0.000 / 0.000 / 0.000 → 0.000 / 0.000 / 0.000 / 0.000 |
| enabled | discards A after invalidation and B completion, late A failure=false | 5 | 10/10 | 4800-4800/4800-4800 | sem amostra → sem amostra |
| enabled | discards A after invalidation and B completion, late A failure=true | 5 | 10/10 | 3724-3724/3724-3724 | sem amostra → sem amostra |
| enabled | records coincident timer, event and resync without assuming recurring operation timers | 5 | 8/8 | 4425-4425/4425-4425 | sem amostra → sem amostra |
| enabled | discards stale operation and active-attempt results and errors after their replacements render | 5 | 10/10 | 4176-4176/4176-4176 | sem amostra → sem amostra |
| enabled | renders attempt continuation and visible failure while retaining the current page | 5 | 5/5 | 1701-1701/1701-1701 | sem amostra → sem amostra |
| enabled | invalidates immediately before completion on attempt and preserves selection by IDs | 5 | 10/10 | 4815-4815/4815-4815 | sem amostra → sem amostra |
| enabled | invalidates immediately before completion on resync and preserves selection by IDs | 5 | 10/10 | 4815-4815/4815-4815 | sem amostra → sem amostra |
| enabled | continues queue pagination and restarts on conflict without accepting an old continuation | 5 | 5/5 | 4731-4731/4731-4731 | sem amostra → sem amostra |
| enabled | preserves attempt page and ID actions, then discards pending work on project change and unmount | 5 | 11/11 | 2233-2233/2233-2233 | sem amostra → sem amostra |

Tempos da tabela web são amostras de blocos dentro dos cinco processos, não cinco totais homogêneos; inclui conclusão manual sem atraso injetado. Logs WEB_WINDOW_REPORT preservam os 16 cenários, blocos, gatilhos, resultados valid/empty/partial/error/previous, requests/responseBytes, completions, abortedPending/drained e pendências. Cinco repetições por modo. Fetch sintético de 10 ms; passos de 200 ms e verificação de DOM em 1 ms. Não mede pintura, GPU ou rede. Atualidade/polling, vinte eventos globais, resync e corridas são os mesmos testes do baseline, sem mudança de UI ou frequência.

## Identidade dos arquivos medidos

| Arquivo | SHA-256 atual |
|---|---|
| apps/controller/src/modules/projects/queue.ts | db339d8d22f58fcf518e1e5709fa4d921154a1f7c5a9ebda37178f5f0bd5f8dc |
| apps/controller/src/modules/github/client.ts | 4340746803675ac27ac7f3243119aae19e2ea52ae95410f99b712d21b880dac4 |
| apps/controller/src/modules/github/transport.ts | 691053604735e81129c7e850963302d4b3077f8db8cfa76d44fd59fcdf5716f5 |
| apps/web/src/features/queue/useQueue.ts | ce08fd24e1146b699691a26b6383bcb24127be95996a5feb360a667237ca9405 |
| apps/controller/src/modules/github/queries.ts | d867739c59dcc3b15931b658717dc91b8a8bac6bc6b7eb110e7e6da45d6d3304 |
| apps/controller/src/modules/storage/index.ts | 65dbd5f2f7856c0f6ff64042fe8cf356e8ef7951df82e22a30742345ffe6484e |
| tests/fixtures/observation-baseline.ts | 77d50e397bf0411cfa9cf98ead4a85513ed9774b7a51a672654347f3bb3b8bab |
| tests/fixtures/backend-measurement.ts | 95a4c602ff9b1b914d20c18fe709c8a4291071bd43c6107faf3145294b11ac6c |
| tests/fixtures/observation-wire.ts | 9b7c4be87aeea968665b5363ccccfe909ec7c7dcdb6d074f05f92bc08a896d38 |
| tests/acceptance/persistence-maintenance.test.ts | 8340a2bbeb19cd6e770833671627889a3de0e4bdd596736619c5fc7908fe42b6 |
| apps/web/src/features/operations/useOperation.ts | 8246ddd28a060712bdd5587c178675be5aa5da4a1b7f331e764a244a3e01a7ee |
| apps/web/src/features/operations/useActiveAttempt.ts | 02b151e0c271bf897ee064d96bf2c0c46f88521d2ff0d4b3fef0deeb7dcb01a3 |
| apps/web/src/features/operations/observation-baseline.test.ts | b99417b7acd42fca8e17f9388152bb78c2ee3cf489a31546fd9e18c83ad295ca |
| tests/integration/observation-matrix.test.ts | 9e61b2e5fa89f6b5f66e6468069d5bae7093265d872bc0c9ad6da75b399e3200 |
| tests/integration/observation-regressions.test.ts | 7eef6fbb5744391725a009c520327b224740fec7ddd0dbb0a6d199c2f262958c |
| tests/integration/queue-scheduler.test.ts | f969054afe10c7a3165084ad16675204f0fbdf125ad8e0acbda6753f983bf77b |
| tests/integration/publication.test.ts | 0f8beeef10705ab3a0c4aaf2eb67fdf97358b3d602c884fbb26e159d9597d2d7 |

As evidências visuais, checks, rollback e o mapa C4-01 a C4-11 constam no fechamento da sprint-007 em SPEC_PROGRESS.md. Este documento registra comparação controlada; aprovação final pertence ao usuário nos mecanismos existentes, sem avanço de pipeline.
