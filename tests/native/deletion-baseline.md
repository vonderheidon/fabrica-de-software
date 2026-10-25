# Baseline de exclusão e meta da sprint 030

Registro consolidado em 2026-10-24, antes de qualquer otimização da sprint 031. Fontes normativas: SPEC.md, US-16.C5, RF-73 e RNF-01; feat-056/057 do plano V3.

## Cenário e evidências

Evidências locais: `.cache/deletion-baseline/evidence/run-sYmpeZ/baseline.json` e `target.json`. O legado foi medido em `run-aYrq20/legacy-baseline.json` e incorporado ao relatório consolidado com sua referência original. Preservar os JSONs e manifestos de ambiente/fonte antes de limpar caches. São evidências de ensaio, sem telemetria permanente nem conteúdo do checkout.

Windows 10.0.26200 x64, Node 24.22.0, Ryzen 5 5600X, 12 processadores lógicos, aproximadamente 16 GiB de RAM; SQLite WAL/FULL. Execução serial, carga do host não controlada, sem alegação de cache frio. Adaptador Windows de produção com referências nativas, UI compilada em Chrome 155 e HTTP/SQLite reais sobre dados sintéticos descartáveis.

Cada organização contém 8 tentativas, 24 rodadas, 40 passagens, 256 arquivos por tentativa e 64 MiB de cache denso por tentativa, totalizando 512 MiB de cache. Legado: 2.149 arquivos, 542.395.833 bytes, 64 destinos. Gerenciado: 2.086 arquivos, 542.394.573 bytes, 25 destinos. Dez sentinelas protegidas por cenário e inventário SQL de outro projeto conferidos independentemente.

## Medições

Valores em milissegundos, arredondados apenas nesta apresentação. Os JSONs preservam a precisão original.

| Medida | Legado | Gerenciado |
| --- | ---: | ---: |
| SQL/inventário, 10 amostras, mediana | 46,66 | 45,06 |
| SQL/inventário de caminhos, 10 amostras, mediana | 50,57 | 48,07 |
| Conferências nativas, acumulado | 501.993,28 (270 chamadas) | 148.463,85 (114 chamadas) |
| Remoção nativa, acumulado | 28.973,30 | 721,19 |
| SQL/finalização | 108,24, sucesso | 49,53, falha |
| Aceitação HTTP | 3.781,87 | 2.824,32 |
| Aceitação até conclusão | 533.989,39 | indisponível |
| Aceitação até parada pendente | não aplicável | 144.336,55 |
| Total servidor, incluindo aceitação | 537.771,26 | sem conclusão |
| Clique até DOM de envio | 1,60 | 1,10 |
| Clique até rAF de envio | 12,30 | 9,70 |
| Clique até DOM de aceitação | 3.790,60 | 2.837,50 |

Intervalos inclusivos de inspeção, reconferência e orquestração se sobrepõem às etapas nativas/SQL: não somá-los. DOM e rAF são aproximações de resposta visual, não timestamps exatos de pintura. `click_to_response_end_ms` do gerenciado é negativo e inválido; não participa de metas ou conclusões. Há uma remoção por organização, não uma distribuição de tempos totais nem prova de significância estatística.

## Correção observada

Legado: 64/64 destinos ausentes, 10/10 sentinelas preservadas, SQL do outro projeto inalterado, inventário exclusivo vazio, foreign keys limpas e um recibo mínimo.

Gerenciado: 25/25 destinos ausentes, 10/10 sentinelas preservadas, SQL do outro projeto inalterado e foreign keys limpas. A finalização lançou `StorageError: CONFIGURATION_STORAGE_FAILED`, conservou inventário e operação pendente, sem recibo de sucesso. Portanto não houve exclusão concluída. `project-deletion-managed-baseline.test.ts` reproduz a falha como `it.fails`; passar esse teste significa reproduzir o defeito conhecido, não corrigi-lo. A relação com a autoridade da migration 028 deve ser confirmada na correção da sprint 031.

## Meta anterior à otimização

`scripts/deletion-baseline-target.mjs` gravou `target.json` em 2026-10-24T16:24:02.423Z. O arquivo usa criação exclusiva para impedir sobrescrita. Meta primária: reduzir o acumulado dominante `native_observe_many` até o número atual de chamadas multiplicado pelo menor custo por chamada observado. É um orçamento de engenharia derivado do ensaio, sem garantia estatística ou imposição de técnica.

| Orçamento máximo | Legado | Gerenciado |
| --- | ---: | ---: |
| Conferências nativas | 461.928,85 ms | 145.673,26 ms |
| Total servidor concluído | 497.706,83 ms | pendente de baseline bem-sucedido |
| Clique até rAF de envio | 29,10 ms | 26,50 ms |

A meta da UI admite um frame p95 observado adicional. O total legado subtrai somente o excesso medido na etapa dominante. No gerenciado, corrigir a finalização e capturar um baseline concluído antes de otimizar e definir a meta total faltante. Não reinterpretar o intervalo até falha como conclusão ou ganho, nem ajustar a meta existente após conhecer resultados otimizados.

## Reexecução e limites

Executar `npm.cmd run proof:deletion-baseline` com 4310 livre. Para cada cenário pronto, consultar `.cache/deletion-baseline/current.json`, abrir a origem com o projeto/layout indicados e executar `tests/browser/deletion-baseline.playwright.js` via Playwright MCP. Salvar o JSON retornado em `ui_response_file` e aguardar o coordenador antes do cenário seguinte. Usar a mesma quantidade de tentativas, rodadas, arquivos e bytes de cache, organização, adaptador, SQLite e host; registrar diferenças de carga e ambiente.

Comparar etapas, total concluído e UI separadamente, exigindo todos os destinos ausentes, sentinelas e SQL vizinho preservados, inventário exclusivo vazio, foreign keys limpas e exatamente um recibo mínimo. Falha de correção invalida aceite de desempenho. As provas adversariais de caminhos, retomada, tabelas V3 e comparação otimizada pertencem à sprint 031. No fechamento da sprint 030, RF-73 e RNF-01 permaneciam pendentes de implementação e comparação; apenas medir não os concluía. Nenhuma nova execução nativa ou de navegador foi feita naquela consolidação. Os resultados posteriores estão registrados abaixo.

## Sprint 031: correção e comparação efetiva

Em 2026-10-24, a migration aditiva `044_storage_deletion_authority.sql` corrigiu os triggers de exclusão de localizações e transições. Eles enviavam o ID da operação para uma função que exige autoridade JSON viva. Os novos guards consultam operação, projeto, geração, token e estado atuais; a capacidade continua restrita à conexão, transação e chaves capturadas. As migrations 028/029 foram preservadas. A reprodução deixou de ser falha esperada e passou a exigir finalização e recibo reais.

Antes da otimização, o gerenciado foi novamente medido com finalização corrigida: `.cache/deletion-baseline/evidence/run-bf6NTX/baseline.json`. Concluiu em 149.759,84 ms incluindo aceitação, com todos os oráculos aprovados. O `target.json` desse diretório foi criado às 16:33:14 UTC, antes da otimização: conferências gerenciadas até 136.051,08 ms e total até 134.493,88 ms. O legado conserva exatamente a meta anterior. O orçamento de UI gerenciado derivado desta nova medição é 29,60 ms; o resultado final também respeita o orçamento anterior de 26,50 ms. Não se compara o tempo pendente da sprint 030 com uma exclusão concluída.

A otimização aumenta de 25 para 100 os caminhos observados por processo PowerShell, amortizando inicialização e Add-Type. Cada caminho continua recebendo handles novos e todas as inspeções, reconferências, barreiras e remoções por referência permanecem. Respostas continuam limitadas a 1 MiB. Apenas excesso de volume subdivide a leitura em lotes menores e novos; erros de acesso, identidade e protocolo não acionam essa subdivisão. Quantidade e ordem das observações são verificadas antes de incorporar resultados. Não há cache de identidades nem processo persistente adicional.

Comparação final sobre o código após essa correção: `.cache/deletion-baseline/evidence/run-jtSdjS/{baseline,comparison,source-manifest}.json`, com PNGs `ui-legacy.png` e `ui-managed.png` no mesmo diretório. `scripts/deletion-baseline-compare.mjs` aprovou todos os checks de ambiente, carga sintética, correção e orçamentos. Valores em milissegundos:

| Medida | Baseline legado | Final legado | Meta legado | Baseline gerenciado corrigido | Final gerenciado | Meta gerenciado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Conferências nativas | 501.993,28 | 140.522,06 | 461.928,85 | 151.317,03 | 54.222,82 | 136.051,08 |
| Total servidor concluído | 537.771,26 | 178.484,47 | 497.706,83 | 149.759,84 | 56.101,43 | 134.493,88 |
| Clique até rAF de envio | 12,30 | 11,80 | 29,10 | 12,80 | 1,60 | 29,60 |
| Clique até DOM de aceitação | 3.790,60 | 1.508,30 | relato separado | 2.658,30 | 1.158,10 | relato separado |

As chamadas lógicas de observação continuam em 270/114; diminuiu a quantidade de processos internos para atendê-las. Os tempos totais finais foram 66,81% e 62,54% menores nesses ensaios. Isso não estabelece significância estatística ou SLA: há uma execução por organização em cada rodada, sem controle de carga do host ou limpeza de caches. Houve uma comparação intermediária também aprovada, em `run-3Pimgb/comparison.json`, antes da correção do limite de resposta; ela não substitui a rodada final.

Condições finais: mesmas 8 tentativas, 24 rodadas, 40 passagens, 512 MiB de cache denso, 2.149/2.086 arquivos, 64/25 destinos e dez sentinelas por organização. O volume total da fixture variou de 542.395.833 para 542.391.689 bytes no legado e de 542.398.669 para 542.386.309 no gerenciado. A fixture inclui SQLite e seus arquivos operacionais; não se afirma identidade byte a byte desses volumes totais. Quantidade de arquivos e bytes de cache são conferidos separadamente. Build, testes e smokes também rodaram nesta sessão, sem isolamento da carga do host.

Ambos os cenários finais comprovaram todos os destinos ausentes, dez sentinelas intactas, SQL vizinho inalterado, inventário exclusivo vazio, foreign keys limpas e exatamente um recibo mínimo. As 26 provas nativas finais incluem links/junctions de raiz e descendentes sem seguir destino, proteção/substituição de ancestrais e objetos, arquivos bloqueados, lote completo e resto, resposta acima de 1 MiB e acesso negado real, que não vira ausência. Outra prova fecha e reabre o storage SQLite após rollback da finalização, recupera a mesma autorização e conclui sem chamar novamente a remoção do destino já confirmado, preservando outro projeto e terminais compartilhados.

Validação: `.cache/sprint031-final-full.json` registra 1.893 testes aprovados em 157 arquivos; `.cache/sprint031-native-complete.json` registra 26 provas aprovadas, sem falhas ou pendências. Build, typecheck, lint, diff check e smokes compilados passaram. O teste de ACL precisou ser corrigido: o módulo Get-Acl não carregou no processo Windows PowerShell; a versão final usa APIs .NET e nega ListDirectory em um ancestral descartável, restaurando a regra no finally. A primeira tentativa de negar apenas ReadAttributes não produziu EACCES e não foi aceita como prova. Relatórios anteriores permanecem preservados.

A revisão estática independente encontrou o risco de 1 MiB e depois confirmou sua resolução, sem novos achados nessa correção focada (`.cache/sprint031-review.json`). A primeira chamada expirou sem parecer e não foi contada. O revisor não reexecutou as medições nem aprovou o produto inteiro. O navegador registrou 404 ao consultar operações de fixtures anteriores e conexões recusadas após os servidores descartáveis encerrarem; não há alegação de console limpo. Foram comprovados envio e resposta visual com UI compilada e HTTP/SQLite/Windows reais sobre fixtures, sem redesenho de UI, ensaio Maestri/OMP, provider, GitHub ou publicação externa. RF-73/RNF-01 receberam implementação e comparação local frente às metas neste escopo; isso não constitui aceite global do V3 nem avanço de gate.
