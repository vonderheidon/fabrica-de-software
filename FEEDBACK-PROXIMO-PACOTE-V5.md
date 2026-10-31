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

## Registro do problema: issues bloqueadas aparecem como elegíveis na preparação

Data do registro: 2026-10-31.

### Relato

No modal **Preparar issue**, issues bloqueadas estão aparecendo no seletor apresentado como **Selecione uma issue elegível**. A listagem não mostra indicação de bloqueio, passando a impressão de que essas issues podem ser iniciadas.

O bloqueio foi informado pelo usuário. A imagem transcrita comprova a apresentação das opções sem indicação visível de bloqueio; ela não comprova o estado remoto das dependências nem que o início de uma tentativa bloqueada foi autorizado.

### Evidência fornecida

- Projeto selecionado: **fabrica-software-eve**.
- Seletor aberto com o texto **Selecione uma issue elegível** e campo **Buscar opção**.
- Opções visíveis: **Configurar instalação local e perfis Eve por papel** e **Iniciar uma tentativa Eve e conversar pelo painel B**.
- Nenhuma das duas opções apresenta indicação textual visível de bloqueio.
- Rodapé: **Selecione uma issue elegível para revisar a tentativa.** e botão **Revisar e autorizar**.

### Ajuste desejado

A seleção deve refletir os impedimentos atuais: issues com dependências bloqueadoras abertas não podem ser apresentadas como elegíveis. Se forem exibidas para consulta, devem indicar o motivo e não permitir seleção para início enquanto o bloqueio persistir. A revisão e o início devem revalidar a elegibilidade, pois o estado pode mudar após a listagem.

### Critérios de aceite propostos

1. Uma issue com dependência bloqueadora aberta não aparece como opção elegível para iniciar uma tentativa.
2. Caso uma issue bloqueada seja exibida, a interface identifica o bloqueio e impede sua seleção para início.
3. Após a resolução das dependências e uma nova consulta, a issue pode aparecer como elegível se os demais requisitos estiverem atendidos.
4. Se surgir um bloqueio após a listagem, a revisão ou o início recusa a execução e informa o impedimento atual.

Registro de backlog, sem implementação ou diagnóstico confirmado da causa. A escolha entre omitir issues bloqueadas ou exibi-las indisponíveis permanece para detalhamento.

## Histórico

| Data | Registro | Estado |
| --- | --- | --- |
| 2026-10-31 | Relato de orientação autorreferente e estado confuso do aviso de perfis na configuração do projeto | Backlog; sem implementação |
| 2026-10-31 | Issues bloqueadas apresentadas como elegíveis no modal Preparar issue | Backlog; sem implementação |
