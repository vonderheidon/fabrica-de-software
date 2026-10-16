# Ponte LionClaw e Maestri

Pesquisa em 2026-10-15. Proposta para ensaios locais, sem alterar o escopo da fábrica.

## Situação após a decisão de escopo de 2026-10-16

Pesquisa histórica preservada. Prevalecem a SPEC e o anexo revisados: Wire continua como meio de conduzir/observar os ensaios, não como justificativa para desenvolver runner, broker ou MCP de controle próprios. O próximo trabalho é o percurso vertical FLOW-01 e cancelamento representativo/nova tentativa, não a expansão de mecanismos de contenção. Recomendações exploratórias abaixo não são backlog obrigatório. OMP e MCPs configurados pelo operador são confiáveis e usam o gerenciamento normal; nenhuma nova garantia de isolamento foi acrescentada.


## Evidências

- O [Maestri Wire](https://www.themaestri.app/en/docs/wire) é uma API pública beta para integrações, inclusive scripts, em Windows e Mac. Usa HTTPS/WSS, pareamento, token e pinagem da chave do certificado. Recursos opcionais dependem de capabilities anunciadas por `/api/info`.
- Wire documenta leitura de workspaces, feed, terminal e chat, envio de prompt, criação de terminal e encerramento de processo. Acesso de escrita exige papel owner. O feed contém estado e prévia, não um resultado durável de tarefa. `approve/reject` responde Y/n do terminal, não o contrato de pergunta da fábrica.
- [Environments](https://www.themaestri.app/en/docs/environments) descreve a CLI no contexto de terminais e um bridge de ambientes, distinto do Wire. Não tratar esse bridge como API externa genérica.
- Nesta sessão, o controlador verificou que `maestri --help` recusa o shell LionClaw por ausência de `MAESTRI_PIPE`; `MAESTRI_CLI` e `MAESTRI_TERMINAL_ID` também não estavam definidos. Não foram registrados valores de credenciais.
- O controlador também confirmou um listener TCP na porta 7434 pertencente ao processo Maestri neste computador. Isso não comprova autenticação, capabilities ou funcionamento das rotas.
- Context7 não encontrou Maestri: retornou produtos homônimos Maestro. Nenhuma documentação desses produtos foi usada.

## Estratégia recomendada

As opções abaixo são avaliação de arquitetura, não capacidades comprovadas na instalação do usuário.

| Opção | Papel recomendado | Limite |
|---|---|---|
| Cliente Wire local | Primeira opção para observar o Maestri e comandar um terminal dedicado a ensaios | Confirmar versão instalada, disponibilidade, pareamento e capabilities |
| Runner iniciado no terminal Maestri | Alternativa quando Wire não estiver disponível; recebe jobs e executa a CLI com o contexto herdado | Introduz processo próprio e protocolo de jobs |
| MCP adaptador | Interface opcional para expor operações limitadas ao LionClaw | Não substitui Wire ou runner; não cria conexão por si só |
| Fila de arquivos | Transporte simples para um primeiro runner no mesmo computador | Exige posse de job, escrita atômica e estado explícito para cancelamento |

Começar por Wire evita manter um servidor próprio quando o produto já oferece transporte suportado. A fábrica continua iniciada no Maestri: o LionClaw aciona o ensaio, observa e recolhe evidências. Isso não exige adicionar attach externo ao produto.

Se necessário, usar runner com operações finitas, como iniciar ensaio, consultar resultado, responder pergunta e cancelar ensaio. Preferir argumentos estruturados a shell arbitrário. Em loopback, autenticar cada chamada e restringir a interface local; em arquivos, usar diretório do projeto dedicado aos jobs. Não copiar credenciais internas do Maestri para fora do terminal.

## Primeiro ensaio e critérios de evidência

1. Conferir Wire na instalação e parear explicitamente, preservando o segredo fora de logs e arquivos versionados.
2. Consultar identidade, capabilities e terminal dedicado antes de qualquer escrita.
3. Acionar um ensaio pelo mesmo caminho que a fábrica usará. Identificar cada execução e salvar eventos e resultado estruturado.
4. Validar chamada MCP com resultado real e pergunta/resposta com correlação e confirmação da própria fábrica.
5. Cancelar durante criação do worker e verificar ausência de processo tardio. Encerrar um terminal ou obter resposta HTTP não comprova sozinho esse critério.

Para comprovar a fábrica, enviar respostas e cancelamentos pela API ou contrato da própria fábrica. Wire serve para iniciar e observar o harness dentro do Maestri. Usar apenas `kill` ou aprovação Y/n contornaria justamente os fluxos que precisam ser avaliados.

Scrollback, prévia, inatividade e texto de conclusão são observação auxiliar. O resultado oficial deve vir do contrato da execução. Após timeout de criação, consultar o estado antes de repetir para evitar workers duplicados.

Nenhum pareamento, recruit, chamada de provider, alteração de configuração ou ensaio com agente foi executado nesta pesquisa. As interfaces específicas de recruit/check/ask/debug devem ser confirmadas na CLI instalada dentro do Maestri; a documentação Wire não equivale a essas operações.
