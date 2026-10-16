# Ensaios da fábrica

Este workspace contém fixtures e evidências de integração Maestri/OMP. Resultados locais não equivalem à aprovação do controlador completo da fábrica.

## Antes de executar

- Para conectar, enviar comandos, responder perguntas ou recuperar acesso ao Maestri, leia [MANUAL-MAESTRI-WIRE.md](MANUAL-MAESTRI-WIRE.md). Use os helpers HTTPS/WSS existentes e a credencial protegida indicada no manual.
- Confirme autenticação com `/api/info` e localize o terminal pelo feed. A ausência de ferramenta MCP ou de `MAESTRI_PIPE` no shell externo não demonstra perda do acesso Wire.
- Consulte `casos/validacoes.json` para o plano e `evidencias/relatorio-validacao.md` para resultados e pendências. Para requisitos do produto, leia `../SPEC.md` e `../INTEGRACAO-MAESTRI-OMP.md`.
- Ao retomar, leia a seção **Direção vigente aprovada em 2026-10-16 — percurso vertical** no início do relatório e `pendingValidationPlan` no plano. Execute FLOW-01 e depois CANCEL-RETRY-01 quando autorizados. Campos `historicalStudyProgress20261016`, `historicalFixtureEvidence` e casos antigos são histórico, não backlog.
- `controle/new-run.ps1 -CaseId ALL` seleciona os casos históricos, não o plano vertical. Prepare a nova rodada a partir de `pendingValidationPlan.priorities`; não use esse helper como atalho para o percurso atual.

## Escopo e operação

- Para todos os novos testes e validações com agente, use provedor `openai-codex`, modelo `gpt-6-luna` e esforço `high`: `--model openai-codex/gpt-6-luna --thinking high`. Fixe a mesma seleção no bootstrap SDK; não use o modelo padrão do operador nem fallback para outro modelo. Registre a seleção efetiva na evidência. Esta decisão foi definida pelo usuário em 15/10/2026; resultados históricos mantêm os modelos que realmente usaram.
- Trabalhe neste diretório, com fixtures em `casos/`, helpers em `controle/` e evidências em `evidencias/<runId>/<caseId>/`.
- Use o workspace Maestri existente e terminais próprios com prefixo `Ensaio`. Preserve a issue ativa; ambientes separados de fixture são permitidos dentro de `casos/`, sem criar workspace/floor ou alterar o checkout operacional do usuário.
- Controle os terminais pelo Wire. Não use Desktop Commander. Resolva problemas operacionais rotineiros autonomamente; pergunte quando houver decisão dependente do usuário.
- Registre os IDs dos recursos criados. Antes de repetir uma criação após timeout, consulte o feed para evitar duplicação.
- Cancele somente recursos próprios conhecidos. Diferencie pedido aceito de parada confirmada; se não houver confirmação, registre limpeza incerta e preserve os arquivos. O ACK de `/kill` pode anteceder a saída.
- Mantenha credenciais fora do workspace e das saídas. Entregas externas, push e alterações na issue exigem autorização específica.

## Evidências e revisão

- Atualize o relatório durante a execução com resultado observado, comandos, IDs, caminhos de evidência e limites da prova. Identifique falhas injetadas e respostas humanas simuladas.
- Encerre as escritas antes de capturar a entrega; revisão independente avalia essa versão. Use hashes para identidade do conteúdo, sem exigir outro agente e auditoria de todos os hashes para cada pequeno estudo ou ajuste documental.
- Correções geram nova rodada e nova captura. Preserve capturas, pareceres e tentativas anteriores, inclusive as descartadas.
- Diferencie comportamento verificado, teste parcial e requisito ainda não exercitado. Ao encerrar, pare os processos próprios concluídos e preserve os artefatos para inspeção.

## Limite do estudo

- Use ferramentas e configuração MCP normais do OMP, com Luna/high conforme acima. OMP e MCPs configurados pelo operador são confiáveis; não há garantia de contenção de rede, arquivos ou credenciais.
- A direção normativa e os cortes estão em `../INTEGRACAO-MAESTRI-OMP.md`. Helpers anteriores de isolamento/supervisão são evidências, não componentes obrigatórios de produção.
- Novo probe só se justifica por impedimento observado no percurso ou risco concreto à entrega. A governança do Kanban e as proteções de publicação permanecem mantidas.
