# Nova fábrica de software

Vocabulário exclusivo do produto novo especificado nesta pasta. Não altera o domínio nem a operação do Aula IA atual; em particular, Ready aqui representa fila, não o gatilho por transição do glossário da raiz.

## Language

**Fábrica**:
Produto que prepara projetos e conduz implementação, verificação, revisão e entrega de issues produzidas por um sistema externo de descoberta e planejamento.
_Avoid_: Sistema de descoberta, gerador de especificações

**Esteira**:
Execução coordenada do trabalho de uma conta responsável, com projetos habilitados, fila e tentativas acompanhadas.
_Avoid_: Quadro Kanban, equipe permanente

**Projeto**:
Unidade cadastrada que associa um repositório, sua origem de trabalho e configurações reutilizáveis. Sua identidade não depende do nome ou da existência de remoto.
_Avoid_: Pasta como identidade, GitHub Project como sinônimo

**Kanban monitorado**:
GitHub Project explicitamente associado a um projeto para selecionar e acompanhar issues.
_Avoid_: Projeto cadastrado

**Fila Ready**:
Conjunto de issues prontas e atribuídas exclusivamente à conta responsável pela esteira, ainda não consumidas por uma tentativa automática.
_Avoid_: Evento de transição Ready, qualquer card em Ready

**Ordem da fila**:
Sequência por ID de projeto. Dentro de cada projeto, usa a posição do quadro quando `use_board_position` está ativa e todos os itens retornados têm posição; caso contrário, usa número crescente da issue (nulos por último) e ID da issue/item.

**Tentativa**:
Execução identificada de uma issue, com configuração de partida, resultados, sessões e evidências próprios. Ela mantém vínculo explícito ao ambiente da issue e não substitui o histórico de tentativas anteriores.
_Avoid_: Rodada, reinício do agente

**Rodada**:
Ciclo de implementação, verificação e revisão dentro de uma tentativa. Uma correção abre outra rodada, numerada a partir de 1.
_Avoid_: Nova tentativa

**Passagem**:
Trabalho de um papel em uma rodada, com resultado e vínculo próprios, associado à sessão lógica desse papel na tentativa.
_Avoid_: Terminal, conversa

**Resultado do Implementador**:
Resultado estruturado da passagem com as validações técnicas pertinentes realizadas pelo agente e evidências vinculadas à identidade imutável da versão. Cada correção exige novo resultado para a nova versão.
A fábrica não cadastra comandos de validação nem inicia executor manual.

**Sessão lógica OMP**:
Conversa própria de um papel dentro de uma tentativa, compartilhada pelas passagens daquele papel nas rodadas. Outra tentativa recebe uma sessão nova, mesmo quando usa o mesmo terminal físico.
_Avoid_: Terminal Maestri, sessão restaurada após reinício

**Terminal gerenciado**:
Terminal físico Maestri cuja identidade e posse foram registradas pela fábrica. Pode ser reutilizado após uma observação atual confirmar identidade e disponibilidade; incerteza ou ocupação não é liberada por tempo.
_Avoid_: Terminal manual, sessão lógica

**Papel**:
Responsabilidade de Implementador ou Revisor no ciclo, distinta do executor, modelo e especialização.
_Avoid_: Provider, especialização

**Perfil de execução**:
Escolhas reutilizáveis de executor, modelo, esforço e orientação para um papel; não substituem seus critérios ou permissões.
_Avoid_: Sessão, terminal

**Preparação**:
Escolhas editáveis para uma tentativa ainda não iniciada, sem autoridade de execução.
_Avoid_: Execução, versão guardada como ação operacional

**Ambiente da issue**:
Área de trabalho identificada pelo projeto, repositório e ID estável da issue. O vínculo de cada tentativa registra o ambiente físico, a origem e a base de comparação. Ambientes históricos ambíguos permanecem como candidatos até sua identidade e elegibilidade serem verificadas.
_Avoid_: Pasta como identidade, clone automaticamente escolhido

**Vínculo da tentativa ao ambiente**:
Registro persistido que associa uma tentativa ao ambiente da issue, identifica a origem do conteúdo inicial e conserva a base usada para comparar sua entrega. O caminho físico sozinho não estabelece a identidade da issue.
_Avoid_: Associação inferida pelo nome ou caminho da pasta

**Entrega**:
Conjunto identificado de alterações e evidências produzido pela tentativa, independente da conversa do agente.
_Avoid_: Resposta textual, qualquer diff presente

**Versão de entrega**:
Identidade do conteúdo associado aos resultados e evidências das validações técnicas pertinentes e à revisão independente. Aprovação de uma versão não aprova alterações posteriores.
_Avoid_: HEAD como único identificador, sessão aprovada

**Modo de entrega**:
Percurso escolhido entre ICR, ICR + Commit e ICR + Commit + PR.
_Avoid_: Permissão permanente de publicação

**ICR**:
Implement -> Code-review: Implementação, validações técnicas pertinentes registradas pelo Implementador e revisão independente, com resultado e alterações disponíveis sem commit de entrega.
_Avoid_: Código integrado, PR criada

**Publicação**:
Efeitos de entrega executados pelo controlador conforme o modo escolhido, separados da aprovação técnica.
_Avoid_: Aprovação, merge

**Decisão humana**:
Resposta necessária para resolver uma escolha de escopo ou alternativas, sem implicar falha nem cancelamento da tentativa.
_Avoid_: Bloqueio por qualquer erro de ferramenta

**Interrupção**:
Perda do acompanhamento necessário para continuar automaticamente, sem presumir encerramento físico dos recursos.
_Avoid_: Recursos parados, retomada automática

**Cancelamento**:
Revogação da continuidade e publicação da tentativa pelo operador ou por uma condição terminal, distinta da conclusão da limpeza.
_Avoid_: Teardown concluído, exclusão de trabalho

**Superfície de interação**:
Meio em que o operador conversa com o agente; inicialmente um terminal comum Maestri com TUI OMP.
_Avoid_: Canal de resultados, requisito de terminal para qualquer executor futuro
