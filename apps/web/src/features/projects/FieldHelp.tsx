const guidance: Readonly<Record<string, string>> = {
  'definir prazo para perguntas': 'Tempo para responder ao agente antes de a pergunta expirar. Desativado usa o padrão.',
  'duracao': 'Prazo em minutos. Exemplo: 0,5 equivale a 30 segundos.',
  'unidade': 'Unidade do prazo. Exemplo: ms = milissegundos.',
  'nome': 'Nome usado para identificar e escolher o perfil.',
  'nome do projeto': 'Nome exibido no catálogo. Renomear preserva a origem cadastrada.',
  'tipo de origem': 'Escolha uma pasta local ou um repositório GitHub existente.',
  'tipo da origem': 'Define como a origem será consultada nas próximas preparações.',
  'origem': 'Pasta local ou URL GitHub sem credenciais. A troca muda a origem de novas preparações.',
  'pasta local existente': 'Pasta que contém o repositório Git. O cadastro preserva seus arquivos.',
  'url do repositorio github': 'URL HTTPS ou SSH do repositório, sem credenciais embutidas.',
  'localizacao': 'Caminho local ou URL GitHub sem credenciais.',
  'localizacao da origem': 'Pasta local ou URL GitHub do projeto. A troca vale para novas preparações.',
  'raiz dos projetos': 'Pasta usada para criar novos projetos. Alterá-la não move os existentes.',
  'branch-base': 'Branch de referência das próximas preparações, como “main”.',
  'intervalo de consulta': 'Frequência do acompanhamento, em minutos. Aceita decimais: 0,25 equivale a 15 segundos.',
  'tempo ativo por passagem': 'Limite de atividade de cada passagem, em minutos. A espera por resposta humana é contada separadamente.',
  'ttl da pergunta configurado': 'Define um prazo para responder ao agente. Ao ativar, informe a duração e a unidade.',
  'ttl da pergunta valor': 'Tempo até uma pergunta sem resposta expirar. Preencha junto com a unidade.',
  'ttl da pergunta unidade': 'Unidade da duração da pergunta. Não altera o intervalo de consulta nem o tempo ativo.',
  'ttl de pergunta configurado': 'Define por quanto tempo uma pergunta aguarda resposta antes de expirar. Desativado mantém o padrão; ao ativar, informe duração e unidade.',
  'ttl de pergunta valor': 'Tempo até uma pergunta sem resposta expirar. Preencha junto com a unidade.',
  'ttl de pergunta unidade': 'Unidade da duração da pergunta. Não altera o intervalo de consulta nem o tempo ativo.',
  'perfil implementador': 'Perfil que implementa a issue. Sem escolha específica, usa o perfil efetivo do projeto.',
  'perfil revisor': 'Perfil responsável pela revisão independente. Sem escolha específica, usa o perfil efetivo do projeto.',
  'limite de correcoes': 'De 0 a 5 rodadas após a primeira revisão. Vale para novas tentativas; preserva as rodadas anteriores.',
  'modo de entrega': 'Escolha ICR, Commit local ou Pull request. A troca altera os efeitos e exige nova autorização.',
  'modo de entrega padrao': 'Define o percurso padrão para novas preparações. Pode permanecer no valor atual. Escolha ICR, Commit local ou Pull request. Alterar o padrão muda as novas preparações e não reescreve tentativas existentes.',
  'modo': 'Escolhe o percurso de entrega usado nas próximas tentativas. Pode permanecer no modo padrão do projeto. Selecione ICR, Commit local ou Pull request. Alterar o modo modifica os efeitos previstos e exige revisar novamente o resumo.',
  'issue': 'Escolha uma issue elegível. Conteúdo e responsabilidade serão conferidos antes do início.',
  'projeto': 'Projeto desta preparação. Para mudar, abra a preparação pelo outro projeto.',
  'orientacao': 'Instruções desta preparação. Até 8.192 caracteres; não inclua credenciais. Editar exige revisar o resumo.',
  'orientacoes opcionais': 'Acrescenta instruções para este perfil. Opcional; limite de 8.192 caracteres. Use texto simples sem credenciais. Alterar o texto afeta as passagens futuras que usarem o perfil.',
  'orientacoes do projeto': 'Acrescenta contexto permanente do projeto aos papéis. Opcional; use texto claro e sem credenciais. Alterar as instruções afeta novas preparações e tentativas, sem reescrever capturas anteriores.',
  'executor': 'Informa qual executor este perfil usa. Fixo como Maestri/OMP nesta entrega e não editável. O valor determina a sessão usada por novas passagens.',
  'provider': 'Escolhe o provider disponível no catálogo OMP. Necessário para criar um perfil; selecione pelo nome exibido na lista, por exemplo uma opção do catálogo atual. Alterar o provider atualiza as opções de modelo e pode limpar escolhas incompatíveis.',
  'conta elegivel': 'Conta ativa e validada no GitHub CLI. O vínculo só muda ao confirmar a ação ao lado.',
  'modelo': 'Escolhe o modelo dentro do provider selecionado. Necessário para criar um perfil; selecione o nome de modelo mostrado no catálogo OMP. Alterar o modelo atualiza os esforços disponíveis e pode limpar uma escolha incompatível.',
  'esforco': 'Escolhe o nível de esforço oferecido pelo modelo. Necessário quando o catálogo lista níveis; selecione um dos valores apresentados. Use “Não se aplica” somente quando o modelo não oferece esforço. Alterar essa opção afeta novas passagens.',
  'github project': 'Associa o projeto a um quadro GitHub para consultar issues e acompanhar Status. Necessário para iniciar em todos os modos, inclusive manualmente, com a issue vinculada ao quadro. Escolha pelo título e proprietário, por exemplo “Roadmap · equipe”. Trocar o quadro exige mapear Status novamente.',
  'campo status': 'Campo usado para acompanhar as etapas. Trocá-lo limpa os quatro valores mapeados abaixo.',
  'status ready': 'Valor que identifica as issues prontas para entrar na fila, como “Ready”.',
  'status em andamento': 'Valor usado enquanto a implementação está em andamento, como “In progress”.',
  'status em revisao': 'Valor usado durante a revisão, como “In review”.',
  'status entregue': 'Valor usado na entrega concluída, como “Done”.',
  'prioridade (id)': 'Escolhe o campo numérico usado para ordenar candidatos da fila. Opcional; deixe vazio para usar os critérios padrão. Selecione um campo observado. Alterar a prioridade muda a ordem dos próximos candidatos.',
  'campo de prioridade (id)': 'Escolhe o campo numérico usado para ordenar candidatos da fila. Opcional; deixe vazio para usar os critérios padrão. Selecione um campo observado, por exemplo “Priority”. Alterar a prioridade muda a ordem dos próximos candidatos.',
  'ordem de prioridade': 'Ordena os valores do campo numérico em ordem crescente ou decrescente.',
  'direcao de prioridade': 'Ordena os valores do campo numérico em ordem crescente ou decrescente.',
  'usar posicao do quadro': 'Usa a posição no quadro no desempate da fila.',
  'comando do check #': 'Comando executado sobre a versão capturada, como “npm test”.',
  'cwd relativo do check #': 'Pasta do comando, relativa ao projeto: “.” ou “apps/web”, por exemplo.',
  'timeout do check #': 'Prazo máximo em milissegundos. Vazio mantém o padrão; 60000 equivale a um minuto.',
  'automation enabled': 'Controla se a fila pode iniciar tentativas automaticamente. Opcional; mantenha desativada até revisar os candidatos e a autorização da fila. Alterar a opção habilita ou pausa novos despachos automáticos.',
  'automacao global habilitada': 'Permite novos inícios automáticos pela fila. Revise os candidatos antes de habilitar. A mudança só vale após salvar.',
  'automacao deste projeto habilitada': 'Permite inícios automáticos deste projeto. Revise sua configuração e a fila antes de habilitar.',
  'habilitar automacao': 'Permite novos inícios automáticos. Revise os candidatos e a autorização da fila antes de habilitar.',
  'exclusao automatica': 'Permite remover artefatos automaticamente. Desativado preserva as evidências.',
};

function normalizeLabel(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

export function fieldGuidanceFor(label: string): string {
  const normalized = normalizeLabel(label);
  const exact = guidance[normalized];
  if (exact) return exact;
  throw new Error(`Ajuda de campo ausente para: ${label}`);
}

export function FieldHelp({ id, label, className = 'muted' }: { id: string; label: string; className?: string }) {
  return <small id={id} className={`field-guidance ${className}`}>{fieldGuidanceFor(label)}</small>;
}
