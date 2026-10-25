# Feedback para o próximo pacote - V4

## Correção urgente: reencontro e reutilização de terminais após reinício

Prioridade urgente registrada em 25/10/2026. Corrigir o cumprimento do requisito já aprovado na V3: FEEDBACK-PROXIMO-PACOTE-V3.md, seção “Reutilização dos terminais Maestri entre tentativas”, e SPEC US-10.C1/C3, RF-45, RF-47 e RF-48. Registro documental, sem iniciar implementação ou pipeline.

### Problema observado

Após falha e reinício do controlador, o terminal próprio do Implementador permaneceu registrado como incerto. A consulta atual ao Maestri mostrou esse terminal parado, mas a fábrica iniciou outra tentativa em um terminal novo. A implementação preserva a identidade e bloqueia a ocupação incerta, porém o caminho atual de recuperação não recompõe a disponibilidade após o reinício. Isso impede a reutilização prevista e acumula terminais no canvas.

### Correção requerida

- Ao preparar o despacho de um papel, reencontrar seus terminais próprios registrados e conferir a identidade e a disponibilidade atuais no Maestri, inclusive quando o registro persistido estiver incerto após falha ou reinício.
- Reconciliar os registros de terminal, sessão e ocupação com a observação física confirmada. A ausência de vínculos em memória do controlador não pode, por si só, impedir essa conferência nem motivar a criação de outro terminal.
- Reutilizar o terminal próprio cuja disponibilidade foi confirmada, com sessão OMP nova e ambiente da nova tentativa. Criar terminal quando o correspondente estiver ausente. Se a disponibilidade continuar incerta ou houver trabalho ativo, preservar o recurso e apresentar o impedimento concreto.
- Recuperar a identificação e a disponibilidade para trabalhos futuros sem retomar a execução interrompida, restaurar sua conversa ou autoridade, nem transferir seu contexto ou resultados à nova tentativa.
- Preservar posse, host, instalação, identidade física e geração; não adotar terminais manuais nem interpretar ausência de atividade visual como prova suficiente de parada.
- Integrar essa recuperação ao fluxo normal da fábrica, sem exigir edição de banco, comandos de manutenção ou uma ação manual de reconciliação como condição para cumprir o reencontro previsto na V3. Distinguir disponibilidade para reutilização da confirmação de parada exigida para limpar ambientes.

### Validação e aceite

- Provar no Maestri/OMP real: criação inicial, conclusão e outra tentativa reutilizando o mesmo terminal com sessão nova; falha e reinício seguidos de reencontro, conferência e reutilização do terminal próprio disponível.
- Exercitar terminal ausente, ativo, parado, incerto e manual, além de falha de consulta e identidade divergente. Conferência inconclusiva mantém bloqueio; não cria disponibilidade fictícia nem ocupa outro recurso como substituto silencioso.
- Conferir a consistência dos registros e das gerações após reconciliação, sem alterar resultados, evidências ou histórico das tentativas anteriores, duplicar despachos ou acumular terminais a cada reinício.
- Distinguir testes determinísticos da prova real de integração. Compilação, identidade persistida e terminal listado no Maestri não comprovam isoladamente disponibilidade nem encerram o aceite.

## Retirada de todo o código legado e das compatibilidades anteriores ao V3

Decisão registrada em 24/10/2026. Registro documental para o próximo pacote, sem iniciar implementação ou pipeline.

### Decisão e motivo

Manter somente a implementação e os formatos atuais do V3, retirando todo o código legado e todas as camadas de compatibilidade com versões anteriores. A decisão abrange o produto inteiro, não apenas o layout antigo de pastas.

O usuário informou que não possui projetos reais cadastrados que dependam dessas compatibilidades e determinou a retirada completa do legado. O objetivo é reduzir código, formatos alternativos, fallbacks e manutenção destinados exclusivamente às versões anteriores, mantendo um único comportamento atual.

Esta decisão substitui a delimitação inicial deste documento, que restringia a retirada às pastas antigas.

### Escopo da retirada

- Inventariar e remover em todos os módulos as implementações antigas, adaptadores, leitores, conversores, contratos, campos, caminhos alternativos e fallbacks cuja única finalidade seja atender a versões anteriores ao V3.
- Remover leitores, resoluções alternativas e fallbacks que buscam recursos exclusivos de projetos na organização global antiga, fora da pasta gerenciada do projeto.
- Remover os ramos específicos desse layout em execução, bootstrap, captura, checks, revisão, publicação, abertura de recursos, recuperação, retenção e exclusão.
- Retirar da exclusão os destinos adicionais incluídos apenas para cobrir o layout antigo. A exclusão continua conferindo todos os destinos pertinentes à organização nova e à pasta original, quando aplicável.
- Remover comandos, apresentação e mecanismos de transição que existam exclusivamente para atender ao layout antigo. Preservar a gestão de localizações e identidades necessária à organização atual.
- Remover a leitura de mapeamentos antigos de Kanban com quatro estados; manter o contrato atual de cinco estados, incluindo Backlog.
- Remover formatos antigos de planos e criação de projetos, incluindo compatibilidade com planos sem os campos atuais do quadro e com modos de criação substituídos pelo V3.
- Remover compatibilidades de configurações, preparações, perfis e composição de instruções, sessões, capturas, resultados, entregas e históricos gravados em formatos anteriores. Os fluxos passam a produzir e consumir somente os contratos atuais.
- Revisar a persistência, a inicialização e a cadeia de migrations para retirar estruturas, tratamentos especiais e conversões exigidos exclusivamente pelo legado. Definir uma forma coerente de criar o schema atual em instalação limpa, sem deixar dependências de código removido.
- Remover da interface opções, avisos, estados e tratamentos destinados exclusivamente à compatibilidade antiga.
- Adequar contratos, fixtures, testes, smokes e ensaios ao suporte exclusivo do V3. Remover os casos cuja única finalidade era garantir compatibilidade descartada e manter cobertura das funcionalidades atuais. Preservar os registros históricos dos baselines e das provas já realizadas, identificando o escopo em que foram obtidos.
- Remover efetivamente o código que perder sua finalidade, em vez de ocultá-lo na interface ou deixá-lo desativado.

### Funcionalidades e garantias que permanecem

- Código continua necessário quando implementa um requisito atual do V3, mesmo que tenha sido escrito antes dele. O critério de retirada é sua finalidade obsoleta, não apenas a data, o nome do arquivo ou a presença da palavra legacy.
- Recursos exclusivos ficam na área gerenciada por projeto, com identidade estável e separação por tentativa, rodada e passagem conforme os contratos atuais.
- Banco e recursos compartilhados permanecem globais. Sua localização global não os caracteriza como legado a retirar.
- A pasta original do usuário e os destinos locais de entrega continuam sujeitos às regras atuais de propriedade, autorização e preservação.
- Permanecem as garantias de identidade de objeto, volume e ancestrais, proteção de caminhos compartilhados ou substituídos, tratamento seguro de links/junctions, autorização durável, posse e geração do worker, retomada parcial e recibo final verificado.

### Instalações e dados anteriores

O produto resultante não terá obrigação de abrir, converter ou continuar bases e formatos anteriores ao V3. Não construir uma nova camada de migração de dados legados para substituir a compatibilidade retirada.

Este pedido registra a retirada de código para implementação futura. Não autoriza executar agora limpeza ou exclusão de bancos, pastas ou dados existentes. Na implementação, instalações limpas devem criar o schema e os recursos atuais corretamente; bases incompatíveis não podem ser interpretadas silenciosamente como atuais.

### Alinhamento e validação na implementação futura

- Atualizar os trechos pertinentes dos documentos normativos, contratos e plano que hoje exigem compatibilidade com versões anteriores. Este documento registra a nova direção; os artefatos anteriores não foram alterados nesta tarefa.
- Mapear os produtores e consumidores antes da remoção, incluindo superfícies HTTP, persistência, executor e UI, para que nenhum fluxo atual dependa de contratos ou código antigos.
- Validar a inicialização limpa e o percurso integrado atual: configuração, criação e cadastro, preparação, execução, checks, revisão, correções, entrega, publicação, recuperação, retenção e exclusão, com preservação dos projetos e recursos compartilhados pertinentes.
- Reexecutar as provas pertinentes de segurança e desempenho sobre o código resultante. As medições das sprints 030/031 permanecem evidências históricas; não comprovam automaticamente o comportamento após essa retirada.
- Distinguir a remoção implementada e validada de decisões apenas documentadas. Este registro não declara a retirada concluída nem concede aceite global do V3.

## Remoção dos checks configuráveis dos projetos

Decisão registrada em 25/10/2026. Registro documental para o próximo pacote, sem iniciar implementação ou pipeline.

### Decisão e escopo

Remover do produto o mecanismo de checks cadastrados manualmente na configuração do projeto. A decisão abrange o botão “Adicionar check”, o editor de comando, diretório relativo e timeout, e o código que persiste, transporta e executa essas definições.

- Remover a seção “Checks” da configuração e as superfícies correspondentes na preparação e nos resumos.
- Mapear e adequar contratos, persistência, capturas, execução, resultados e testes que dependem dessas definições, retirando efetivamente o código sem finalidade após a mudança.
- Preservar a validação técnica do software pelos agentes, incluindo build, typecheck, lint e testes pertinentes. A retirada do cadastro manual não dispensa evidências, revisão independente nem os demais critérios de aceite.
- Atualizar os documentos normativos e os critérios afetados na implementação futura, deixando explícito como a esteira obtém e registra as validações após a retirada desse mecanismo.

Este registro não remove funcionalidades agora nem autoriza apagar dados, evidências ou histórico existentes.
