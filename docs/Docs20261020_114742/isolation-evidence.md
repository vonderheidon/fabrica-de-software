# Sprint 012 — Recadastro e prova integrada de isolamento

Data: 2026-10-20. Escopo backend da SPEC deste pacote, §§2.4/3.2 e plano obrigatório de validação. Fontes: AGENTS.md, SPEC.md §§8.4/10.2, GLOSSARY.md, INTEGRACAO-MAESTRI-OMP.md (INT-16), SPEC20261020_114742.md e acompanhamento deste pacote. Não constitui aprovação ou mudança de fase.

## Entrega e método

Na validação inicial foram reutilizadas as fixtures de histórico completo, tentativa, publicação, HTTP e filesystem entregues nas sprints anteriores. Não houve nova dependência, migration, alteração de produção ou liberação de capacidade destrutiva. O registro inicial de arquivos/interfaces ficou neste relatório e no SPEC_PROGRESS.md deste pacote; o acompanhamento da raiz não foi editado.

- `project-deletion-finalization.test.ts`: dois casos novos (banco novo e upgrade) partem de cadastro com automação **ligada**, histórico completo e outro cadastro do mesmo repositório. Finalização real SQLite remove exclusivamente o selecionado. Novo registro recebe UUID diferente, automação desligada, papéis/Project não herdados e nenhuma chave em todas as tabelas operacionais do inventário. Linhas completas do vizinho, inclusive ciclos/consumos/deduplicação, são comparadas antes/depois e após reopen. Conta, perfis, settings, autoridade e migrations permanecem iguais. Ausência física nessa fixture é controlada.
- `project-deletion-history.ts`: parâmetro opcional de automação, falso por padrão, conserva os consumidores anteriores. Os novos casos o ativam explicitamente para evitar provar apenas false→false.
- `project-deletion-http.test.ts`: cinco casos novos. Um percorre sessão → prévia → aceite HTTP → coordenador → succeeded → POST de cadastro do mesmo repositório → replay do comando antigo. Outro cadastro conserva configuração/ETag; tentativas e ciclos novos ficam vazios e nenhum agente é iniciado/cancelado. O cursor global de eventos pode avançar legitimamente e não representa alteração da configuração alheia.
- Os quatro casos restantes reabrem SQLite em accepted/running/pending/finalizing, injetam falha na inserção do recibo final, comprovam rollback do projeto e ausência de recibo/sucesso, retiram a falha e retomam a **mesma** autorização até recibo mínimo. O vizinho permanece íntegro. São reopen de conexão e recuperação do coordenador, sem alegar encerramento físico de controlador.

## Matriz de interleavings e evidências reutilizadas

Todos os caminhos abaixo são relativos à raiz. A suíte completa executa novamente os testes indicados; a suíte nativa permanece separada e foi executada explicitamente.

| Requisito/cenário | Fixtures e asserções | Limite |
| --- | --- | --- |
| RNF-01 | `tests/integration/project-deletion-http.test.ts`: Host/Origin/Fetch-Site/sessão/CSRF/mídia/body/chave/CAS/digest inválidos, nenhuma autorização/remoção, rate limit e erro sanitizado | Fastify inject real; filesystem controlado |
| RNF-02 / recadastro | `storage/project-deletion-finalization.test.ts` (sob `apps/controller/src/modules/`): todas as tabelas exclusivas, linhas completas do vizinho/global, novo UUID, automação false, histórico/deduplicação sem herança; `tests/integration/project-deletion-http.test.ts`: recadastro via HTTP e replay antigo | SQL real; GitHub controlado |
| RNF-03 / antes do aceite | `storage/project-deletion-acceptance.test.ts`: falha em operação/autorização/alvos/evento reverte todo o aceite | SQLite real |
| RNF-03 / efeito→progresso | `storage/project-deletion-worker.test.ts`: falha de progresso após remoção, estado removing reconciliado e uma única remoção | Efeito controlado |
| RNF-03 / finalização | `storage/project-deletion-finalization.test.ts`: ABORT/ROLLBACK/recibo após DELETE, escopo SQL fechado; novos testes HTTP: reopen e mesma autorização nos quatro estados | SQLite real, ausência controlada |
| RNF-03 / commit→resposta perdida | `tests/integration/project-deletion-http.test.ts`: replay/status/operations/resume devolvem só recibo mínimo, cadastro ausente; `apps/web/src/api/project-deletion.test.ts`: consulta e reapresentação restrita | Fetch controlado no cliente |
| RNF-04 / manual e scheduler | `storage/project-deletion-acceptance.test.ts`: barreira antes/depois de observação assíncrona, zero tentativa/clone/passagem após aceite | Adapters externos controlados |
| RNF-04 / publicação | Mesmo arquivo: publicação vence e impede aceite; exclusão vence e impede autorização/commit/mutação, sem force stop | Adapters externos controlados |
| RNF-04 / dois aceites e resumes | Acceptance: um recibo/evento e rejeição da segunda autorização; worker/HTTP: uma execução, geração não roubada, duas retomadas não duplicam efeito | Agendamento determinístico |
| RNF-06 | `storage/project-deletions.test.ts` e `project-deletion-finalization.test.ts`: banco novo/upgrade completo, ledger/schema/índices/FKs/guards, ciclos removidos, `foreign_key_check`, guardas também no vizinho | SQLite real |
| RNF-08 / E3 | `workspaces/deletion.test.ts`: substituição, aliases, caixa, espaços/Unicode, ausência versus acesso negado, ancestral alterado e substituta preservada | Parte controlada; observações físicas temporárias específicas |
| RNF-08 nativo — primeira execução | `tests/native/project-deletion.proof.ts`: objetos/handles, arquivos em uso, substituição próxima ao efeito, links, irmãos e dados externos | **14 passaram; 3 junctions falharam na criação com EPERM** |
| RNF-09 | Contratos fechados em `packages/contracts/src/project-deletions.test.ts`, `npm.cmd run lint` e typecheck | Regra estática não é sandbox |
| RNF-10 / INT-16 | Acceptance: tentativa ativa/parada incerta continuam impedindo aceite, sem cancelamento forçado. Teste HTTP novo confere zero `startPassage`/`cancelAttempt` | Não prova parada Maestri real |
| E1 | `storage/project-deletion-paths.test.ts`: A→B→URL seleciona somente origem salva e preserva A, sem escrita na conferência | Inventário real, observação controlada |
| E2 | Acceptance: vínculos sobrepostos antes invalidam prévia; depois recebem 409; mesmo repositório em caminho independente é permitido | Transação real |
| E4 | Worker: recuperação dos quatro estados, reconfirmation manual, fencing, falha sem retry periódico; novos HTTP: reopen SQLite e falha final | Não equivale a morte de processo |
| E5 pertinente | Prévia lê apenas configuração salva; `project-deletion-completion.test.ts`/`deletion-selection.test.ts` e transporte: limpeza exclusiva, globais/perfis/outro projeto preservados | React/DOM/fetch controlados; browser pertence ao aceite visual |
| E6 | `workspaces/deletion.test.ts`: falha no primeiro de vários alvos impede demais efeitos; worker: progresso confirmado não é repetido na retomada | Primitiva controlada; não promete rollback físico |

## Validação e impedimentos

Os resultados finais e comandos desta rodada estão no SPEC_PROGRESS.md deste pacote. A primeira execução de `test:http`, simultânea à suíte completa, falhou com corpo vazio no caso de heartbeat/EOF (janela de stream 35 ms e margem de handler 10 ms). A execução isolada posterior passou (4 testes/2 arquivos). A concorrência é uma hipótese de sensibilidade temporal, **não causa comprovada**; não se alterou o servidor nem se suprimiu a asserção. A falha inicial permanece registrada.

Primeira execução de `npm.cmd run test:deletion-native`: exit 1, 14 passaram/3 falharam. Os três erros são EPERM ao criar junction no alvo raiz, descendente e ancestral, antes de verificar o comportamento do produto. Casos com symlink dir/file e preservação dos destinos passaram; não substituem junction. Toda remoção atingiu somente fixtures exclusivas em `.cache/reference-proof-*`. Nenhum projeto operacional foi alvo.

**Situação ao final da validação inicial:** RNF-08 e a composição destrutiva Windows ainda não estavam qualificados; `safeReferenceRemoval=false` permaneceu. A aprovação das suítes controladas não liberou o candidato nativo. Nenhum provider, recrutamento Maestri/OMP, force stop ou mutação GitHub foi executado. Preservação GitHub nas fixtures era asserção controlada, não observação remota real. RNF-05/AC-29 específico da exclusão continua obrigatório na sprint-013; os relatórios históricos executados pela suíte não o dispensam. Browser e revisão imutável permanecem gates próprios.

## Revalidação após feedback do evaluator

Data: 2026-10-20. A revalidação preservou os resultados anteriores e adicionou evidência nova, sem declarar aceite integral.

- `windows-reference.ts` agora observa caminhos em lotes de até 25 dentro de uma execução PowerShell. Cada caminho continua usando `WindowsReferenceDeletion.Observe`, com a mesma identidade e cadeia de ancestrais; a segunda observação adjacente também usa o lote. Isso removeu o timeout de 15 s da prévia HTTP com o histórico completo sem mudar os efeitos de remoção.
- `project-deletion-history.ts` mantém o histórico completo e permite criar o mesmo par de cadastros sem pré-semeiar uma exclusão. A fixture usa caminhos de evidência e recursos válidos para o inventário de produção.
- `tests/native/project-deletion.integration.proof.ts` percorre sessão, prévia, aceite HTTP, coordenador, remoção Win32 e finalização SQLite. Os dois cadastros usam a mesma origem GitHub; arquivos binários e aninhados de `work`, `git`, `artifacts` e `execution-bootstrap` do cadastro vizinho e todas as linhas do seu inventário, incluindo ciclos/consumos de deduplicação, são comparados antes/depois. Os alvos selecionados ficam ausentes; `startPassage` e `cancelAttempt` não são chamados. O teste usa `safeReferenceRemoval=true` somente no adapter da fixture descartável; o candidato de produção permanece indisponível.

| Comando de revalidação | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0; fronteiras e convenções TypeScript aprovadas |
| `npm.cmd test -- --reporter=dot --no-color` | Exit 0; **1.467 testes/109 arquivos**, 76,38 s |
| `npm.cmd run test:http` | Exit 0; **4 testes/2 arquivos**, 2,33 s |
| `npm.cmd run build` | Exit 0; aviso existente de bundle JavaScript de 971,94 kB acima de 500 kB |
| `npm.cmd run test:deletion-native` | **Exit 1; 15 passaram/3 falharam**, 57,03 s. A prova integrada passou em 55,78 s; os três casos de junction falharam com EPERM na criação da fixture, antes das asserções de produto. |

As três falhas nativas persistem nesta sessão. `mklink /J` retornou acesso negado tanto no workspace quanto no diretório temporário do sistema; `New-Item -ItemType Junction` e `FSCTL_SET_REPARSE_POINT` retornaram acesso negado no workspace. Não foram substituídas por symlinks nem por mocks. `safeReferenceRemoval=false` permanece, portanto a composição destrutiva ainda não está liberada e a sprint continua sem aceite integral RNF-08. As suítes padrão, HTTP e a composição integrada são evidências aprovadas, mas não suprem esses três casos.

Não foi feita medição de volume específica da exclusão; ela permanece obrigatória na sprint-013. `repo-graph` e `graph-search` não estavam expostos no inventário de ferramentas desta sessão; GitNexus não foi usado. Nenhum dado operacional, provider, GitHub, Maestri/OMP, force stop, publicação ou operação Git de escrita foi alvo.
