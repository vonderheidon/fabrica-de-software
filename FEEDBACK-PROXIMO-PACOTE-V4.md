# Feedback para o próximo pacote - V4

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

## Remoção da comparação entre tentativas

Decisão registrada em 25/10/2026. Registro documental para o próximo pacote, sem iniciar implementação ou pipeline.

Remover a funcionalidade de comparação entre tentativas. O usuário informou que não solicitou esse recurso e determinou sua retirada no V4.

- Remover as ações “Selecionar para comparar” e “Comparar tentativas”, o estado de seleção e o diálogo de comparação.
- Remover a rota de comparação, os contratos, as consultas, os parâmetros de navegação e o código exclusivo dessa funcionalidade; adequar os testes e documentos pertinentes.
- Preservar a listagem, os filtros, a consulta individual, o histórico e as evidências das tentativas, além da ação “Nova tentativa”.

Este registro não altera a implementação agora nem autoriza apagar dados ou histórico das tentativas.

## Remoção da prioridade configurável da fila

Decisão registrada em 27/10/2026. Registro documental para o próximo pacote, sem iniciar implementação ou pipeline.

Remover os campos “Ordem de prioridade” e “Campo de prioridade (ID)” da configuração do projeto, incluindo as orientações desses campos e o mecanismo de ordenação por campo numérico do quadro GitHub.

- Remover as definições de campo de prioridade e sentido crescente ou decrescente dos contratos, persistência, capturas e consumidores, além do código exclusivo dessa configuração.
- A fila passa a usar os critérios padrão de ordenação existentes. Preservar as regras de elegibilidade e os bloqueios para novos inícios.
- Adequar os documentos normativos e os testes afetados, comprovando a seleção dos próximos candidatos pelos critérios padrão após a retirada.

Este registro não altera a implementação agora nem autoriza apagar dados ou histórico existentes.
