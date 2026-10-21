# Enriquecimento da SPEC — Exclusão definitiva de projetos

SPEC: SPEC20261020_114742.md
Referências: PRD20261020_114742.md e stories-requisitos20261020_114742.md.
Análise documental em 20/10/2026. Total: 6 sugestões, todas APLICADAS mediante aprovação explícita: E1 a, E2 a, E3 a, E4 b, E5 a, E6 a.

## Cobertura examinada

Leitura integral da SPEC e comparação com PRD e histórias. Conferência pontual dos contratos, configuração de origem, formulário com rascunhos agregados, diálogos, tokens e scripts atuais do repositório. Critérios de análise: US-01 a US-08, RF-01 a RF-44 e RNF-01 a RNF-10.

| Feature | Resultado da análise |
| --- | --- |
| US-01 — entrada pelo cadastro | Contexto iniciador e respostas obsoletas definidos; rascunhos não salvos exigem E5. |
| US-02 — confirmação | Clique, perdas, ausência de backup/cancelamento e idempotência definidos; alcance da origem após edição exige E1. |
| US-03 — atividade e concorrência | Tentativas, publicação, incerteza e barreiras definidos; novos vínculos de outros cadastros exigem E2. |
| US-04 — preservação | Isolamento por pertencimento e preservação de compartilhados definidos; concorrência de novos vínculos em E2. |
| US-05 — caminhos | Identidade, ancestralidade, caixa e links definidos; saída operacional de divergência persistente exige E3. |
| US-06 — remoção integral | Ausência, URL, fecho relacional e conclusão definidos; origem em E1 e política de avanço parcial em E6. |
| US-07 — recuperação | Autorização durável, consulta, reinício, recibo e resposta perdida definidos; E3, E4 e E6 complementam recuperação. |
| US-08 — recadastro | Identidade nova, automação desligada e aviso Ready definidos; recadastro durante pendência em E2. |

Interface: componentes, hierarquia, tokens existentes, acessibilidade, loading, vazio, erro, skeleton por áreas e legibilidade mobile já possuem diretrizes. Não propor paleta, limites de duração/volume ou papéis novos: não há lacuna de produto que os justifique. Upload não se aplica. Paginação do catálogo permanece existente e lista de alvos não pode ser truncada. Copy principal e segurança HTTP estão definidos. Detalhes de implementação sem efeito de produto não são perguntas ao usuário.

## Alcance dos arquivos removidos

- **E1** [APLICADO] [ORIGEM DO PROJETO] A origem pode ser editada no produto atual: ProjectChanges aceita source e saveConfiguration reinspeciona a nova origem. A SPEC fala em pasta original inteira e inventaria revisões, mas não determina quais pastas locais entram nos alvos quando o cadastro mudou de A para B, ou de pasta local para URL. Referências: SPEC 1, 2.1 e 3.2; PRD RF-23/RF-27 e US-06. A escolha altera o alcance destrutivo e precisa ficar explícita.
  Opcoes: a) considerar apenas a origem da configuração atualmente salva; pastas locais de revisões antigas ficam preservadas, sem prejuízo da remoção dos ambientes gerenciados exclusivos b) incluir todas as origens locais históricas conhecidas, apresentadas e comprovadamente exclusivas — amplia o alcance e requer ajustar a regra de origem somente URL c) bloquear quando houver troca histórica de origem até o usuário definir o alcance em uma revisão da especificação.
  Sugestao: opcao a - vincula a exclusão ao cadastro atual e evita transformar referências históricas em autorização para apagar outras pastas. Deve explicar na confirmação quando uma origem antiga fica preservada.
  Decisao aprovada e aplicada: opcao a - Somente origem atualmente salva e ambientes gerenciados exclusivos; origens históricas preservadas. Seções 1, 3.2 e 4.5.

## Preservação e concorrência

- **E2** [APLICADO] [NOVOS VÍNCULOS DURANTE A EXCLUSÃO] A barreira impede trabalho e configuração no cadastro excluído, mas não explicita o resultado de cadastrar outro projeto, mudar a origem de outro cadastro ou mudar diretórios compartilhados para um alvo de exclusão já aceita. Revalidar compartilhamento protege os arquivos, porém pode prender uma exclusão irreversível depois de remover parte deles. Referências: SPEC 3.2, protocolo passos 2/4/5; PRD RF-14/RF-17/RF-31.
  Opcoes: a) rejeitar somente novos vínculos/configurações que se sobreponham aos alvos pendentes, até concluir, preservando operações sem sobreposição b) permitir o novo vínculo e interromper a exclusão quando o compartilhamento for detectado, mantendo pendência até desfazer o conflito.
  Sugestao: opcao a - evita criar um novo impedimento depois da autorização. Aplicar também a recadastro no mesmo caminho ainda pendente; repositório igual com caminho independente não é bloqueado só pela identidade remota.
  Decisao aprovada e aplicada: opcao a - Rejeitar novos vínculos sobrepostos durante toda a pendência, inclusive recadastro e alterações de diretórios compartilhados; caminhos independentes permitidos. Seção 3.2.

## Recuperação e avanço da remoção

- **E3** [APLICADO] [RECONFERÊNCIA DE ALVO SUBSTITUÍDO] A SPEC proíbe autorizar outra identidade e mantém reconfirmation_required se a identidade original não puder ser comprovada, mas também manda considerar ausência como remoção. Falta explicitar a saída quando uma pasta foi substituída e a original não pode voltar, além da mensagem/próxima ação correspondente. Referências: SPEC 3.2 Retomada e protocolo passos 7–9; PRD RF-20/RF-22/RF-35/RF-40.
  Opcoes: a) permitir seguir quando a reconferência comprovar segurança da identidade originalmente autorizada OU ausência do caminho autorizado com ancestrais seguros; enquanto houver substituto, preservá-lo e orientar sua retirada pelo operador, sem buscar a pasta original movida b) exigir sempre recuperar a identidade original após divergência, mesmo se o caminho ficar ausente — restringe a regra geral de ausência e pode manter pendência permanente.
  Sugestao: opcao a - torna a recuperação executável sem autorizar remoção de substitutos. A aplicação só confere; não move nem apaga a pasta substituta para resolver o bloqueio.
  Decisao aprovada e aplicada: opcao a - Reconferência permite identidade original segura ou ausência do caminho com ancestrais seguros; nunca remove substituta nem procura pasta movida. Seções 3.2 e 4.6.

- **E4** [APLICADO] [RETOMADA AUTOMÁTICA OU MANUAL] O PRD prevê recuperação automática após reinício e tentativa manual; a SPEC não distingue quais estados serão executados automaticamente nem se falhas de permissão/arquivo bloqueado serão tentadas de novo periodicamente. can_retry também não tem regra completa por estado. Referências: SPEC 3.2 Retomada, 3.4 e 4.6; PRD Backend/Recuperação e RF-34–39.
  Opcoes: a) recuperar automaticamente execuções interrompidas em accepted/running/finalizing; manter falhas já registradas em pending/reconfirmation_required aguardando “Tentar novamente”, que reconfere a mesma autorização b) recuperar também pending automaticamente ao reiniciar, mantendo reconfirmation_required para ação manual e sem repetição periódica c) além da recuperação no reinício, repetir automaticamente falhas transitórias com política de espera e limite a definir.
  Sugestao: opcao a - distingue interrupção de falha conhecida, evita repetição inesperada e preserva retomada automática do trabalho interrompido. Consultar andamento nunca deve por si só disparar execução.
  Decisao aprovada e aplicada: opcao b - Retomar accepted/running/pending/finalizing no reinício, com autorização durável e revalidação; reconfirmation_required exige reconferência manual; sem repetição periódica. Seções 3.2, 3.4 e 4.6.

- **E5** [APLICADO] [CONFIGURAÇÃO COM ALTERAÇÕES NÃO SALVAS] A exclusão começa em um formulário que agrega alterações de projeto, configuração global e perfis. Não está definido se rascunhos não salvos impedem a abertura, são ignorados na prévia ou são descartados; a limpeza final também não distingue esses rascunhos compartilhados dos dados exclusivos. Referências: SPEC 4.2/4.3/4.6; PRD Frontend/Conclusão; ProjectForm.tsx, EditorDraft.
  Opcoes: a) permitir abrir usando apenas a configuração salva, informar isso se houver rascunho e não salvar implicitamente; após concluir limpar somente rascunhos exclusivos do cadastro removido, preservando alterações globais/perfis b) bloquear a abertura enquanto houver alterações não salvas, pedindo salvar ou descartar pelo fluxo existente.
  Sugestao: opcao a - evita salvar mudanças como efeito colateral da exclusão e protege rascunhos compartilhados. Não acrescenta uma confirmação obrigatória à exclusão.
  Decisao aprovada e aplicada: opcao a - Usar configuração salva com aviso de rascunho, sem salvamento implícito; limpar apenas rascunhos exclusivos do cadastro, preservando globais/perfis. Seções 4.2 e 4.3.

- **E6** [APLICADO] [FALHA EM UM DOS VÁRIOS ALVOS] A SPEC determina pendência após falha parcial, mas não diz se um arquivo bloqueado em um alvo interrompe todos os alvos restantes ou se o serviço continua removendo os independentes. Isso muda a quantidade de perdas após detectar um problema. Referências: SPEC 2.1 ordem normativa e 3.2 protocolo passos 4/7/8; PRD RF-34/RF-38.
  Opcoes: a) interromper novos efeitos na primeira falha ou divergência, registrar pendência e revalidar tudo na retomada b) em falha local de acesso, continuar alvos independentes e seguros; divergência de segurança sempre interrompe o conjunto; registrar as falhas para retomada.
  Sugestao: opcao a - dá significado previsível à pendência e evita continuar perdas depois de um impedimento detectado. Não promete desfazer remoções já realizadas nem interromper uma primitiva do sistema já em curso.
  Decisao aprovada e aplicada: opcao a - Parar novos efeitos na primeira falha ou divergência, sem rollback ou interrupção prometida de primitiva já em curso; revalidar na retomada. Seção 3.2 e critérios de validação.

## Aplicação e verificação após decisões

Aplicar cada decisão aprovada cirurgicamente na SPEC e atualizar seu item para APLICADO imediatamente; rejeições tornam-se REJEITADO. Ajustar contratos/estados/copy e cenários de aceite afetados pelo mesmo item. Mudança que contrarie PRD ou histórias deve ser identificada antes da edição. Não houve implementação, teste funcional ou exclusão real nesta análise.

## Encerramento documental

As seis decisões aprovadas foram incorporadas cirurgicamente à SPEC, incluindo contratos, estados, textos e cenários de aceite afetados. E4 foi aplicada com a opção b, substituindo a recomendação original a. Conferência documental de consistência com o PRD realizada; demais regras e escopo preservados. Nenhuma implementação, teste funcional ou exclusão real foi executada.
