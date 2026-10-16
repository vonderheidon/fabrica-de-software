# Ensaio de acesso LionClaw ao Maestri

## Objetivo e conclusão

Provar que o LionClaw acessa o Maestri para implementar e testar a fábrica. Siga `casos/validacoes.json`: acesso autenticado, pequena alteração pelo OMP no Maestri, teste real e resultado consultado pelo LionClaw. Encerre ao registrar essa prova.

Requisitos da fábrica estão em `../SPEC.md` e `../INTEGRACAO-MAESTRI-OMP.md`. O aceite completo do produto será validado durante sua implementação. Evidências preservadas e limites estão em `evidencias/relatorio-validacao.md`. Resíduos binários dos estudos antigos não compõem o plano ativo.

## Operação

- Para conectar ou recuperar acesso, leia `MANUAL-MAESTRI-WIRE.md`. Use os helpers HTTPS/WSS e a credencial protegida existente. Ausência de `MAESTRI_PIPE` no shell externo não demonstra perda do Wire.
- Use OMP normal com provedor `openai-codex`, modelo `gpt-6-luna` e esforço `high`, sem fallback. Registre a seleção efetiva.
- Trabalhe neste diretório, com a tarefa pequena em `casos/<runId>/` e evidências em `evidencias/<runId>/`.
- Use o workspace Maestri existente e terminais próprios com prefixo `Ensaio`. Preserve a issue ativa e o checkout operacional. Não crie workspace ou floor.
- Controle terminais pelo Wire. Não use Desktop Commander. Consulte o feed antes de repetir criação após timeout.
- Registre os recursos próprios e encerre os concluídos. Diferencie solicitação de parada e confirmação; preserve arquivos quando houver incerteza.
- Mantenha credenciais fora do workspace, prompts e saídas. Publicação externa, push e alterações na issue exigem autorização específica.

## Evidência proporcional

Registre tarefa, terminal, alteração produzida, comando e resultado real do teste, caminhos e limites. Prévia ou texto de conclusão isolado não comprovam a alteração nem o teste. Git mantém o código; não copie checkout, índice ou caches para snapshots auxiliares.

Reaproveite evidências anteriores diretamente pertinentes. Novo estudo só cabe se um impedimento bloquear acesso, alteração ou teste. Revisão independente, correção em rodadas, cancelamento injetado e supervisão do runtime não são etapas deste ensaio.
