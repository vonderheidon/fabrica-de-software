# Feedback para próximo pacote de features

Registro incremental de problemas de produto observados durante a exploração. Estas notas orientam um pacote futuro e não alteram, por si só, os critérios normativos da `SPEC.md`.

## 2026-10-17

### 1. Bloqueios do dashboard precisam ser claros e em português

**Problema observado:** o dashboard apresenta códigos internos como `ACCOUNT_UNOBSERVED` e `DESIGNATED_HOST_REQUIRED`, sem explicar claramente o que está faltando ou por que isso impede o uso.

**Comportamento esperado:** apresentar mensagens em português simples, explicar o motivo do bloqueio sem termos técnicos e indicar a próxima ação necessária.

### 2. Configuração inicial deve conduzir o usuário

**Problema observado:** quando o ambiente está incompleto, o usuário precisa explorar as telas para descobrir o que configurar.

**Comportamento esperado:** detectar a configuração inicial incompleta e abrir um wizard curto, simples e objetivo, que conduza o usuário pelas etapas necessárias e mostre o que falta fazer.

### 3. Registros e diagnósticos precisam de linguagem compreensível

**Problema observado:** a interface expõe códigos e campos internos em inglês, por exemplo `MAESTRI_CONTEXT_CONFIRMED`, `Verificação · succeeded`, `passed`, `expectedAccountId`, `observedHost` e `profileCount`. Sem contexto, não fica claro o significado desses dados.

**Comportamento esperado:** traduzir estados, códigos e rótulos para português claro, explicando o significado dos dados apresentados e evitando expor nomes internos de campos ao usuário.

### 4. O campo de host executor precisa explicar o valor esperado

**Problema observado:** o campo “Host executor designado” não explica que valor deve ser preenchido. A configuração também mostra “Host observado · Indisponível nesta superfície”, embora o diagnóstico do host tenha observado `Jefferson`.

**Comportamento esperado:** mostrar o nome do computador observado, explicar que esse é o valor esperado e permitir designá-lo com uma ação clara, sem exigir que o usuário entenda o termo “host executor”.

### 5. A configuração global precisa explicar o propósito e o uso dos campos

**Problema observado:** vários campos da configuração global não explicam para que servem, se são obrigatórios ou se podem ficar vazios. O usuário precisa pedir explicações campo a campo para saber o que preencher.

**Comportamento esperado:** cada campo deve informar seu propósito, quando precisa ser preenchido, o formato ou exemplo esperado e o efeito de alterar seu valor. A tela também deve destacar o que é obrigatório para começar e o que pode permanecer no padrão.

### 6. Seleção da raiz dos projetos deve abrir o Explorador de Arquivos

**Problema observado:** a raiz dos projetos exige que o usuário digite um caminho local.

**Comportamento esperado:** oferecer um botão para abrir o Explorador de Arquivos do Windows e selecionar a pasta, sem digitação manual do caminho.

### 7. Remover campos globais que o operador não precisa configurar

**Problema observado:** “Diretório de dados da instalação” aparece como editável, embora alterá-lo não mova o banco aberto. “Workspace Maestri ID” também aparece mesmo sem ser necessário para o fluxo atual.

**Comportamento esperado:** remover esses campos da configuração do operador. O diretório interno deve ser gerenciado pelo produto, e a referência de workspace só deve aparecer se houver uma necessidade operacional clara.

### 8. Exibir configurações de tempo em minutos

**Problema observado:** “Intervalo de consulta” e “Tempo ativo por passagem” são editados em milissegundos, unidade pouco prática para configuração humana.

**Comportamento esperado:** permitir preencher ambos em minutos e fazer a conversão internamente.

### 9. Explicar o TTL de pergunta no próprio campo

**Problema observado:** o rótulo “TTL de pergunta” não explica seu efeito.

**Comportamento esperado:** informar que este valor define por quanto tempo uma pergunta do agente aguarda uma resposta antes de expirar.

### 10. Esclarecer o significado e o efeito do limite de custo

**Problema observado:** não está claro que custos o limite mede, a que período ou unidade se aplica, nem o que acontece quando é atingido. A implementação atual também não dispõe de medição autoritativa de custo do executor para aplicar esse limite.

**Comportamento esperado:** explicar escopo, moeda, origem da medição e efeito do limite. Se ele ainda não puder ser aplicado, a interface deve deixar isso explícito e não sugerir que protege contra gastos.

### 11. Criar perfis em um modal e carregar opções do OMP

**Problema observado:** “Adicionar perfil” não apresenta um fluxo guiado, e Provider, Modelo e Esforço exigem que o operador saiba quais valores digitar.

**Comportamento esperado:** abrir um modal com os campos necessários para criar o perfil. Provider, Modelo e Esforço devem oferecer listas preenchidas com as opções descobertas no OMP.

### 12. Ocultar identificadores e metadados técnicos da interface do operador

**Problema observado:** telas comuns exibem detalhes internos como `Operação 1fd784e4-e6b6-41cc-9c75-9c1c041aa21b` e `ETag atual: f60c3a4d248725917fdac66bae6e33bad087ae1ce7d6b04564bf168e2bb48c4e`, que não ajudam o usuário a concluir sua tarefa.

**Comportamento esperado:** ocultar IDs de operação, ETags e metadados equivalentes da interface normal. Disponibilizá-los apenas em detalhes técnicos ou suporte quando forem necessários para diagnóstico.

### 13. Modal único para criar e editar perfis

**Comportamento esperado:** usar um modal centralizado, com fundo da tela escurecido, fundo claro, cantos arredondados, título à esquerda e botão de fechar no canto superior direito. O mesmo formulário atende criação e edição, ajustando título e texto do botão principal ao contexto.

O formulário contém, nesta ordem:

1. **Nome do perfil**, em largura total.
2. **Tipo do perfil**, em largura total.
3. **Executor**, em largura total.
4. **Provider** e **Modelo**, lado a lado.
5. **Esforço**, abaixo, alinhado à esquerda.
6. A ação **Consultar catálogo novamente**, associada às opções carregadas para Provider, Modelo e Esforço.
7. **Orientação**, em uma área de texto ampla.

O rodapé tem uma divisória e ações alinhadas à direita: **Cancelar** e o botão principal, **Criar perfil** ou **Salvar alterações**. Não incluir os blocos de informação técnica excluídos pelo usuário da referência visual.

### 14. Tela de Perfis Globais com busca, filtros e cartões

**Comportamento esperado:** criar uma tela “Perfis Globais” no contexto de Workspace, com título e uma descrição breve de que os perfis são compartilhados entre projetos. Exibir um painel central claro com botão **Novo perfil**.

No painel, incluir:

- Busca por nome ou orientação.
- Filtro de modelo, inicialmente em “Todos os modelos”.
- Abas de contagem **Todos**, **Implementador** e **Revisor**, com a aba selecionada destacada.
- Uma confirmação discreta quando a configuração for salva.
- Cartões de perfil em grade, com ícone, nome, provider, modelo, orientação, tipo, esforço e ações **Editar** e **Excluir**.

Os exemplos da referência mostram cartões para Implementador e Revisor, mas a lista deve refletir os perfis configurados. Não incluir os avisos informativos excluídos pelo usuário da referência visual.

### 15. Oferecer uma ação clara para vincular a conta GitHub

**Severidade:** bloqueador grave de implementação. Sem vincular a conta, não é possível configurar e operar o fluxo GitHub da fábrica.

**Problema observado:** o dashboard pede para vincular a conta GitHub observada e exibe `ACCOUNT_UNOBSERVED`, mas a Configuração global não oferece um campo ou ação para selecioná-la. Ao executar a checagem de identidade, o controller encontrou a conta autenticada no GitHub CLI, mas marcou o resultado como divergente porque a conta esperada continua ausente. A interface expôs apenas o ID interno da conta, sem o login legível. O diagnóstico apenas compara a identidade observada com a já configurada; não faz o vínculo. O fluxo atual deixa o operador sem um caminho visível para resolver o bloqueio.

**Comportamento esperado:** oferecer uma ação inicial que consulte a identidade autenticada pelo GitHub CLI, mostre o login legível da conta encontrada e permita vinculá-la à fábrica sem exigir que o operador copie IDs internos. Manter a revalidação como ação distinta para confirmar posteriormente que a identidade continua correspondente.
