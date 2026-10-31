# Backlog V5

## Registro do problema: aviso de impedimento na configuração do projeto

Data do registro: 2026-10-31.

### Relato

Logo após criar um projeto e clicar em **Configurar este projeto**, a tela de configuração mostra o aviso **Impedida**. A orientação manda abrir a configuração do projeto, embora o usuário já esteja nessa tela. Segundo o relato, o aviso desaparece depois de salvar a configuração.

O fluxo e a mensagem estão confusos: a próxima ação deve apontar para o que falta fazer na tela atual, em vez de encaminhar o usuário para a própria tela em que já está. O estado também precisa acompanhar claramente o resultado do salvamento.

### Texto observado na tela

```text
Selecione os perfis do projeto
Impedida

Falta associar um perfil de Implementador e um de Revisor ao projeto.

Próxima ação: Abra a configuração do projeto e selecione um perfil ativo para cada papel. Se necessário, crie-os em Perfis.

Configurar este projeto
```

### Ajuste desejado

- Explicar quais associações estão faltando e indicar os seletores de Implementador e Revisor já presentes nesta tela.
- Evitar uma ação que apenas reabra ou encaminhe para a configuração do projeto atual.
- Se for necessário criar um perfil, direcionar para **Perfis** como ação distinta e específica.
- Atualizar o aviso após a confirmação do salvamento. Se o salvamento falhar, manter o impedimento e apresentar uma orientação compatível com a falha.

### Critérios de aceite propostos

1. Depois de criar um projeto e abrir sua configuração, nenhum aviso manda o usuário abrir a mesma tela novamente.
2. Quando faltarem perfis, a mensagem identifica cada papel sem associação e aponta aos controles correspondentes na tela atual.
3. A ação para criar ou escolher perfis leva ao destino correto, sem ser confundida com a abertura da configuração do projeto.
4. O estado só muda após o resultado do salvamento ser confirmado; uma falha de salvamento não remove o impedimento.

Estes critérios registram o problema e o resultado esperado. O layout e a solução de interação permanecem para detalhamento antes da implementação.

### Transcrição integral do texto visível

```text
NOVA FÁBRICA

Define como a origem será consultada nas próximas preparações.

Pasta local ou URL GitHub do projeto. A troca vale para novas preparações.

Branch de origem
main

Branch de destino
Nova branch com nome automático

Atualizar branches

Escolha uma nova branch ou uma existente para receber a entrega aprovada.

Perfil implementador
Implementador

Perfil revisor
Revisor

Perfil que implementa a issue. Sem escolha específica, usa o perfil efetivo do projeto.

Perfil responsável pela revisão independente. Sem escolha específica, usa o perfil efetivo do projeto.

Selecione os perfis do projeto
• Impedida

Falta associar um perfil de Implementador e um de Revisor ao projeto.

Próxima ação: Abra a configuração do projeto e selecione um perfil ativo para cada papel. Se necessário, crie-os em Perfis.

Configurar este projeto

Limite de correções
2

Modo de entrega padrão
ICR (Implementação e Revisão de Código)

De 0 a 5 rodadas após a primeira revisão. Vale para novas tentativas; preserva as rodadas anteriores.

Define o percurso padrão para novas preparações: ICR, ICR + commit ou ICR + commit + PR. Alterar o padrão não reescreve tentativas existentes.

Automação deste projeto habilitada

Usar posição do quadro

Permite início automático deste projeto. Revise sua configuração e a fila antes de habilitar.

Usa a posição no quadro no desempate da fila.

Salvar configuração
```

### Descrição visual transcrita

- Janela branca com cantos arredondados sobre fundo cinza escurecido, título **NOVA FÁBRICA** em laranja e controle de fechar no topo direito.
- Formulário em duas colunas: branches de origem e destino; perfis Implementador e Revisor; limite de correções e modo padrão de entrega.
- O aviso **Selecione os perfis do projeto** ocupa toda a largura entre os campos de perfil e as opções inferiores. Mostra **Impedida**, a mensagem de falta de associação, a orientação para abrir a configuração e o botão **Configurar este projeto**.
- Na parte inferior, **Automação deste projeto habilitada** está desmarcada e **Usar posição do quadro** está marcada. Seus textos explicativos ficam parcialmente encobertos pelo rodapé.
- Há rolagem vertical. O rodapé contém o botão **Salvar configuração**, alinhado à direita.

## Histórico

| Data | Registro | Estado |
| --- | --- | --- |
| 2026-10-31 | Relato de orientação autorreferente e estado confuso do aviso de perfis na configuração do projeto | Backlog; sem implementação |
