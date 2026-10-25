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
