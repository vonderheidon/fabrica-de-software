# Sugestões de enriquecimento — Configuração inicial e operação da fábrica

Data: 18/10/2026.

## Continuidade e fontes

Este arquivo registra todas as sugestões desta análise e seus estados. Consultá-lo antes de responder em qualquer turno. Nenhuma sugestão equivale a decisão aprovada. Alterar a SPEC somente após aprovação explícita do item e atualizar imediatamente seu estado para APLICADO; rejeições recebem REJEITADO. Não renumerar itens resolvidos.

Fontes: SPEC20261017_233303.md, PRD20261017_233303.md e stories-requisitos20261017_233303.md, nesta pasta; AGENTS.md, CLAUDE.md, seções pertinentes da SPEC da raiz, INTEGRACAO-MAESTRI-OMP.md e GLOSSARY.md; contratos, configuração, rotas de eventos, persistência, recuperação de operações, preparação, formulário e estilos atuais do repositório canônico.

A SPEC foi lida integralmente antes da análise por funcionalidade. A comparação textual confirmou que as 128 linhas de RF/RNF do PRD e das stories estão reproduzidas na SPEC, desconsiderando apenas o nível dos títulos na comparação dos blocos. Os critérios das 24 histórias também estão reproduzidos. Não foi identificada feature inteira ausente. O grafo consultado não possui índice deste repositório; a conferência arquitetural usou os arquivos locais. Não houve execução de testes do produto ou integrações externas.

Total: **8 sugestões** — **0 PENDENTES**, 8 APLICADAS, 0 REJEITADAS.

SHA-256 da SPEC antes de qualquer edição desta análise: `60eea68dca147965d4c326318e8452f2d19993f5549c797cde5742222fa0dbf9`.

## Mapa de cobertura das funcionalidades

O mapa e os enunciados abaixo conservam a análise que originou os oito itens. Todos os pontos identificados foram aprovados na opção a e aplicados nesta retomada; propostas descritas nos itens devem ser lidas junto ao registro final de incorporação e à SPEC atualizada.

Para cada feature foram verificados: caminho feliz, alternativas, limites/casos de borda, erros; componentes, tokens e estados de carregamento/vazio/erro/skeleton quando pertinentes; limites e paginação; acesso; textos; responsividade. Não aplicabilidade não gera requisito novo. A aplicação é local, sem contas humanas, uploads ou acesso remoto; não propor essas funcionalidades.

| Feature | Cobertura encontrada e pontos pendentes |
| --- | --- |
| F01 — Linguagem dos bloqueios | US-01; título, causa, ação e suporte sanitizado definidos. Nenhuma pergunta adicional identificada. |
| F02 — Configuração inicial | US-03/04; ordem, save, retorno, descarte, supressão, conclusão e pendências futuras definidos. E2 afeta a escolha nativa e E8 os saves incertos. |
| F03 — Registros legíveis | US-01; tradução, metadados recolhidos e recibos preservados definidos. Nenhuma pergunta adicional identificada. |
| F04 — Computador local | US-09; hostname automático, lock e worker único definidos. Nenhuma pergunta adicional identificada. |
| F05 — Ajuda dos campos | US-02; propósito, obrigatoriedade, momento, exemplo e efeito definidos. E1 esclarece o limite efetivo de envio. |
| F06 — Pasta dos projetos | US-08; candidato, cancelamento, escrita real e aplicação futura definidos. E2 detalha o prazo ainda não quantificado. |
| F07 — Armazenamento fixo | US-10; caminho independente de cwd, ausência de override e diagnóstico não destrutivo definidos. Nenhuma pergunta adicional identificada. |
| F08 — Tempos em minutos | US-11; faixa, conversão exata e preservação do inteiro definidos. E3 trata a apresentação dos valores periódicos. |
| F09 — TTL e espera | US-02/11; controle distinto e semântica anterior preservados. Não reabrir a decisão de unidade do TTL. |
| F10 — Retirada de tetos | US-12; retirada transversal de tetos e preservação das proteções definidas. Não confundir limites de inferência com limites HTTP. |
| F11 — Catálogo e perfis | US-13/14/15; estados, listas dependentes, unicidade, esforço nulo e perfil efetivo definidos. E1 e E4 tratam bordas ainda abertas. |
| F12 — Metadados de suporte | US-01/18; IDs internos e consulta de recibo definidos. E8 trata a consulta sem registro recuperável. |
| F13 — Formulário modal | US-13; hierarquia, ações, diálogo único e foco definidos. E1 e E4 afetam validação e rascunhos. |
| F14 — Perfis Globais | US-15/16/17; cartões, contagens, vazio, exclusão lógica e impedimentos definidos. E5, E6 e E7 detalham filtro, busca e alteração do último tipo. |
| F15 — GitHub | US-05/06/07; descoberta ordenada, vínculo, autoridade e troca definidos. E2 afeta o seletor de EXE e E8 a recuperação do save. |
| F16 — HTTP/SSE | US-19; investigação sem causa presumida, encerramento, reconexão e idempotência definidos. E8 é sobre recuperação de configuração, não sobre repetir comandos após reconexão. |
| F17 — Contraste e favicon | US-20/21; tokens existentes, correção medida, teclado, mobile/zoom e asset público específico definidos. Não inventar limiar visual expressamente excluído pelo PRD. |
| F18 — Percursos integrados | US-22/23; pré-requisitos, alvos, contexto e evidências separados definidos. Nenhuma pergunta adicional identificada. |
| F19 — Entrega imutável | US-24; identidade Git, leitura sem edição, nova avaliação após correção e histórico definidos. Nenhuma pergunta adicional identificada. |

Os limites de paginação, perfis vivos, textos, conexões, requests, SSE e sessões já estão documentados. Os estados principais e os padrões responsivos herdados estão definidos; não exigir um novo desenho, skeleton universal ou permissões humanas para completar uma lista de verificação.

## Formulários e limites de envio

- **E1** [APLICADO] [FORMULÁRIOS E PERFIS] Como apresentar o limite efetivo quando os campos respeitam seus máximos individuais, mas o JSON excede o teto HTTP? A SPEC §3.2 permite orientação de até 8.192 caracteres e saves agregados; §3.3 mantém corpo de 16.384 bytes. Um comando sintético de criação com 8.192 caracteres acentuados resultou em 16.595 bytes. Não está definida a orientação preventiva da UI para essa combinação válida por campo e recusada no transporte.
  Opções: a) Manter 16.384 bytes como limite total prevalente, medir o JSON UTF-8 completo antes do envio e apresentar erro acionável sem truncar o rascunho. b) Aprovar aumento finito do limite nas rotas de configuração, com valor a definir, mantendo um teto total explícito.
  Sugestão: opção a - preserva o limite de segurança aprovado e torna a restrição visível antes da requisição. Texto proposto: “O conjunto das alterações excede o tamanho permitido. Reduza os textos antes de salvar.” Em comandos agregados, não dividir automaticamente a gravação atômica.
  Aplicação proposta: complementar §3.2, §4.3 e §4.6. Comprovação posterior: textos com acentos/Unicode e escapes JSON, corpo no limite/acima dele e rascunho preservado; nenhuma gravação parcial.

## Seleção de pasta e GitHub CLI

- **E2** [APLICADO] [SELETOR NATIVO] Quanto tempo o operador tem para concluir a seleção e como esse prazo se relaciona com os 15 segundos do handler HTTP? E05 exige deadline/cancelamento próprios e impede outra janela enquanto a primeira estiver aberta, mas não fornece a duração nem explicita um timeout específico da rota. Uma escolha humana pode ultrapassar o prazo global sem que a janela tenha encerrado.
  Opções: a) Prazo de 120 segundos para a seleção, com timeout HTTP específico e finito de 125 segundos somente nessa rota; ao vencer, solicitar fechamento e conservar o bloqueio até o encerramento nativo confirmado. b) Manter a rota em 15 segundos e informar previamente esse prazo ao operador; solicitar fechamento ao vencer e conservar o mesmo bloqueio de janela.
  Sugestão: opção a - dá tempo para navegar pelas pastas e mantém a espera delimitada. Os números são proposta para aprovação, não requisito já aprovado. Desconexão solicita encerramento; incapacidade de confirmar fechamento mantém diagnóstico e impede nova abertura, sem save ou reabertura automática.
  Aplicação proposta: detalhar E05 e harmonizar §3.3/§4.6. Comprovação posterior: seleção além de 15 segundos, expiração, desconexão, fechamento não confirmado e concorrência entre abas/pasta/EXE.

## Tempos em minutos

- **E3** [APLICADO] [TEMPOS] Como exibir um tempo salvo cuja representação em minutos é periódica, como 1 ms? A SPEC garante conservar o inteiro original quando o campo não muda, mas não define o texto exibido, sua precisão nem se digitar e depois restaurar o texto inicial conta como alteração. Uma aproximação decimal editada pode ser recusada pela regra de conversão exata.
  Opções: a) Exibir até 10 casas decimais, identificar discretamente a aproximação quando necessária e preservar o inteiro original sempre que o texto final voltar ao texto inicialmente apresentado; validar exatamente apenas texto efetivamente diferente. b) Exibir representação fracionária exata em minutos e ampliar o formato de entrada para aceitá-la.
  Sugestão: opção a - mantém o preenchimento decimal já aprovado e evita alterar um tempo porque o operador entrou no campo ou desfez sua edição. Não há arredondamento do valor persistido; somente a apresentação pode ser aproximada.
  Aplicação proposta: complementar Conversão dos tempos e os estados dos campos. Comprovação posterior: 1 e 2.147.483.647 ms, foco/blur, edição desfeita, alteração de outro campo e texto novo não representável.

## Catálogo e rascunhos de perfil

- **E4** [APLICADO] [CATÁLOGO] O que acontece se Consultar catálogo novamente remover uma opção escolhida em um perfil ainda não salvo? As regras protegem valores já persistidos ausentes do catálogo e seleções ainda válidas, mas não determinam se um rascunho novo/inválido deve ser limpo ou continuar visível.
  Opções: a) Conservar os valores do rascunho, marcá-los como indisponíveis no catálogo atual e bloquear a criação/alteração da combinação até escolha válida. b) Limpar apenas as escolhas do rascunho que desapareceram e avisar quais precisam ser preenchidas novamente.
  Sugestão: opção a - preserva a edição e deixa explícita a causa do impedimento, sem fallback. A regra de limpar dependências incompatíveis após troca explícita de provider/modelo continua distinta da atualização do catálogo. Se o perfil já existe, permanece a possibilidade aprovada de salvar somente nome/orientação sem alterar sua combinação persistida.
  Aplicação proposta: complementar E04 e §4.6. Comprovação posterior: modelo/esforço removido após consulta, perfil novo versus existente e consulta tardia de contexto anterior.

## Busca e filtro de Perfis Globais

- **E5** [APLICADO] [FILTRO DE MODELO] O filtro distingue providers quando dois perfis usam o mesmo identificador de modelo em providers diferentes? A execução identifica a combinação provider/modelo, mas a tela define apenas filtro de modelo derivado dos perfis cadastrados, sem a identidade e o rótulo de opções homônimas.
  Opções: a) Cada opção representa o par provider/modelo e apresenta ambos quando necessário para distinguir; filtra somente esse par. b) Cada opção representa apenas o identificador de modelo e reúne todos os providers que o utilizam.
  Sugestão: opção a - evita que modelos homônimos de providers diferentes sejam tratados como a mesma configuração. As opções continuam derivadas apenas dos perfis vivos, inclusive modelos ausentes do catálogo, sem consulta extra ao OMP.
  Aplicação proposta: complementar ProfilesPanel/§4.6. Comprovação posterior: mesmo modelo em dois providers, combinação com aba/busca e Limpar filtros.

- **E6** [APLICADO] [BUSCA DE PERFIS] Qual é a regra de correspondência da busca por nome/orientação? Não está definido se a consulta é substring ou palavras, nem se distingue caixa e acentos. Buscar “revisao” pode ou não encontrar “Revisão”, dependendo da escolha de implementação.
  Opções: a) Substring da consulta completa, ignorando caixa e acentos e removendo apenas espaços das pontas, em nome OU orientação. b) Substring da consulta completa, ignorando caixa e preservando diferenças de acentuação, em nome OU orientação.
  Sugestão: opção a - facilita localizar textos em português sem exigir acentuação exata. A normalização é somente para busca; não altera texto salvo nem a unicidade de nomes, que continua conservando acentos e espaços internos.
  Aplicação proposta: complementar ProfilesPanel/§4.6. Comprovação posterior: caixa, acentos, consulta vazia/espaços, nome versus orientação e combinação com os demais filtros.

## Alteração do tipo de perfil

- **E7** [APLICADO] [ÚLTIMO PERFIL DO TIPO] Mudar o tipo do último Implementador para Revisor deve avisar que os próximos inícios ficarão bloqueados? A SPEC exige esse aviso ao excluir o último perfil, mas permite alterar seu tipo quando não houver padrão de projeto e não define aviso para a mesma perda de cobertura dos papéis.
  Opções: a) Avisar no próprio formulário antes de salvar, sem confirmação adicional e sem proibir a alteração permitida. b) Não avisar na edição; mostrar a pendência apenas depois do save no Dashboard/preparação.
  Sugestão: opção a - torna visível a consequência antes do save, conservando as regras de mudança de tipo, o snapshot das tentativas e o marco histórico da configuração inicial.
  Aplicação proposta: complementar os estados de edição em §4.6. Comprovação posterior: alteração do último tipo versus tipo com outros perfis e ausência de novo bloqueio por tentativa ativa.

## Recuperação de gravação incerta

- **E8** [APLICADO] [OPERAÇÃO NÃO LOCALIZADA] Como sair do impedimento quando um save perde a resposta antes de haver registro durável e Consultar resultado retorna 404? A SPEC exige preservar o ID e impedir outro envio equivalente enquanto houver incerteza, mas não define o caminho para esse caso. Além disso, um 404 pode representar recurso fora do escopo após troca de conta; não é prova isolada de que o comando nunca foi aceito.
  Opções: a) Para saves de configuração, permitir ação explícita de reapresentar a mesma operação somente enquanto o cliente ainda conserva em memória o payload e If-Match originais e o contexto corresponde ao original; reutilizar exatamente o mesmo ID e conteúdo, com recuperação idempotente antes de qualquer IO/commit. Após reload sem esse conteúdo, manter consulta/suporte, sem reconstrução ou novo ID automático. b) Manter todo 404 como pendência de suporte, sem ação de reapresentação no cliente.
  Sugestão: opção a - permite recuperar a perda anterior ao commit sem inventar outra operação ou tratar 404 como autorização. Nunca aplicar a regra genericamente a início, publicação ou efeitos externos. Se o contexto mudou, não reapresentar; orientar restabelecimento explícito do contexto pertinente. Se a decisão preferida for outra, registrar a regra antes de implementar.
  Aplicação proposta: complementar §4.3/§4.6 e recuperação E02/GET operations. Comprovação posterior: perda antes/depois do commit, duas requisições concorrentes com o mesmo ID, payload divergente, troca de conta e reload sem payload original.

## Estado da discussão

O usuário aprovou explicitamente E1a, E2a, E3a, E4a, E5a, E6a, E7a e E8a nesta retomada. Os oito itens foram incorporados individualmente à SPEC e marcados como APLICADO após cada edição. Não há sugestão pendente ou rejeitada nesta análise. A aprovação abrange esses enriquecimentos e não equivale à aprovação final da SPEC, que permanece pendente de decisão do usuário.

## Registro da incorporação aprovada — 18/10/2026

| Item | Escolha e resultado na SPEC | Localização |
| --- | --- | --- |
| E1 | Opção a: medir o JSON completo em UTF-8 antes do envio; comunicar limite conjunto de 16.384 bytes; preservar rascunho e save atômico, com validação independente no servidor. | §3.2 Regras comuns de contrato; §4.3 Camada de API |
| E2 | Opção a: seleção em 120 segundos e timeout HTTP exclusivo de 125 segundos, cliente/servidor; solicitar fechamento em expiração/desconexão e bloquear nova janela até encerramento confirmado. | E05; §3.3 Middleware; §4.3 Camada de API |
| E3 | Opção a: até 10 casas decimais com sinalização de aproximação; preservar inteiro original quando o texto final coincidir com o inicial, inclusive edição desfeita; conversão exata para texto diferente. | Conversão dos tempos; §4.6 Estados de UI |
| E4 | Opção a: preservar escolhas desaparecidas no rascunho com aviso e bloquear combinação inválida; conservar exceção de save somente de nome/orientação de perfil existente. | E04; §4.6 Estados de UI |
| E5 | Opção a: filtro identifica provider/modelo, distingue homônimos e deriva dos perfis vivos sem consulta adicional ao catálogo. | §4.6 Estados de UI |
| E6 | Opção a: substring da consulta completa em nome OU orientação, ignorando caixa/acentos e apenas espaços das pontas; unicidade e texto salvo preservados. | §4.6 Estados de UI |
| E7 | Opção a: aviso no formulário antes de salvar mudança do último perfil de um tipo; sem confirmação adicional ou novo impedimento. | §4.6 Estados de UI |
| E8 | Opção a: reapresentação somente explícita de save de configuração, com ID/conteúdo/If-Match originais em memória e contexto revalidado; recuperar operação durável antes de nova ação; 404 não prova ausência de efeito; sem retry automático, reconstrução após reload ou extensão a início/publicação/efeitos externos. | E02; GET operations/:operationId; §4.3 Camada de API; §4.6 Estados de UI |

### Conferência documental

- Conferidos os oito estados APLICADO e a ausência de pendências no totalizador.
- Verificação reversa das 20 regiões editadas reconstruiu em memória a SPEC anterior com SHA-256 idêntico ao registrado antes das edições. Isso comprova preservação do conteúdo fora das alterações aprovadas, sem restaurar ou sobrescrever o documento.
- SHA-256 da SPEC após incorporação: `394c4e0e3a32d015887fad869456c725072d81e9c1cce109b01dc136d940e63b`.
- Preservada expressamente a decisão OMP: compatibilidade por capacidades efetivas, sem trava exata ou faixa arbitrária de versão.
- Alterações exclusivamente documentais; nenhum teste do produto, aceite de interface ou integração externa foi executado ou declarado comprovado.
- Aprovação final da SPEC permanece pendente. Nenhuma ação de aprovação ou avanço foi acionada.
