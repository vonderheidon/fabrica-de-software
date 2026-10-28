export type StateLabel = { label: string; known: boolean };

const stateLabels: Readonly<Record<string, string>> = {
  accepted: 'Aceita', running: 'Em andamento', succeeded: 'Concluída', failed: 'Falhou', failed_known: 'Falha confirmada', unknown: 'Sem confirmação',
  uncertain: 'Incerta', unavailable: 'Indisponível', pending: 'Pendente', ready: 'Pronta', blocked: 'Impedida',
  passed: 'Aprovada', approved: 'Aprovado', rejected: 'Reprovada', delivered: 'Entregue', not_applicable: 'Não se aplica', not_requested: 'Não solicitado',
  observed: 'Observada', captured: 'Capturada', complete: 'Completa', partial: 'Parcial', active: 'Ativa', inactive: 'Inativa',
  draft: 'Rascunho', preparing: 'Preparando ambiente', implementation: 'Implementação', implementing: 'Implementação', implementer: 'Implementador', reviewer: 'Revisor',
  in_progress: 'Em andamento', in_review: 'Em revisão', verifying: 'Verificação', reviewing: 'Revisão', correcting: 'Correção',
  publishing: 'Publicação', finished: 'Encerrada', interrupted: 'Interrompida', open: 'Aberta', closed: 'Fechada',
  tracked: 'Acompanhada', lost: 'Acompanhamento perdido', stopped: 'Parada confirmada', requested: 'Parada solicitada',
  confirmed: 'Confirmada', removed: 'Removida', not_started: 'Ainda não iniciada', queued: 'Na fila',
  cleanup_uncertain: 'Limpeza sem confirmação', not_configured: 'Não configurado', configured: 'Configurado',
  idle: 'Aguardando ação', saving: 'Salvando', submitting: 'Enviando', expired: 'Expirada', cancelled: 'Cancelada',
  canceled: 'Cancelada', enabled: 'Habilitada', disabled: 'Desabilitada', completed: 'Concluída',
};

const codeLabels: Readonly<Record<string, string>> = {
  IMPLEMENTATION_BLOCKED: 'Implementação impedida por pré-requisito',
  ISSUE_CLOSED: 'Issue fechada', NOT_AN_ISSUE: 'O item não é uma issue executável',
  READ_INCOMPLETE: 'Leitura incompleta', REPOSITORY_MISMATCH: 'Repositório diferente do projeto',
  PROJECT_MEMBERSHIP_MISSING: 'Vínculo da issue ao quadro não confirmado', STATUS_MISMATCH: 'Status diferente do esperado', OPEN_BLOCKERS: 'Dependências abertas',
  ISSUE_TITLE_REQUIRED: 'Informe o título da issue', ISSUE_OBJECTIVE_REQUIRED: 'Informe o objetivo da issue',
  CRITERIA_LIST_INVALID: 'Revise a lista de critérios de aceite', CRITERION_ID_INVALID: 'Corrija a identificação dos critérios',
  CRITERION_ID_DUPLICATED: 'Use identificadores distintos para os critérios', CRITERION_TEXT_INVALID: 'Revise o texto dos critérios',
  SCAFFOLD_GIT_IDENTITY_REQUIRED: 'Configure seu nome e e-mail no Git antes de criar o projeto',
  GIT_VERSION_UNSUPPORTED: 'Git incompatível com a proteção contra fetch implícito',
  SCAFFOLD_GIT_CONFIG_FAILED: 'Falha ao consultar a configuração do Git',
  GIT_UNAVAILABLE: 'Executável Git indisponível',
  CREATION_REMOTE_DESCRIPTION_UNCONFIRMED: 'Descrição do repositório sem confirmação; consulte novamente a criação',
  CREATION_REMOTE_DESCRIPTION_CHANGED: 'Descrição alterada no GitHub; preserve o texto e confira a criação',
  ACCOUNT_UNOBSERVED: 'Conta GitHub sem vínculo', ACCOUNT_REQUIRED: 'Conta GitHub necessária', ACCOUNT_NOT_CONFIGURED: 'Conta GitHub sem vínculo',
  ACCOUNT_MISMATCH: 'Conta ativa diferente da conta vinculada', GITHUB_IDENTITY_CONFIRMED: 'Conta GitHub confirmada',
  PROJECTS_ROOT_REQUIRED: 'Pasta dos projetos necessária', PROJECTS_ROOT_UNAVAILABLE: 'Pasta dos projetos indisponível',
  PROJECTS_ROOT_CHANGED: 'A pasta dos projetos mudou', PROJECTS_ROOT_NOT_CONFIRMED: 'Pasta dos projetos não confirmada',
  CONFIGURATION_RECORDED: 'Configuração consultada', EXECUTION_REVALIDATION_REQUIRED: 'Nova validação necessária antes de iniciar',
  IMPLEMENTER_PROFILE_REQUIRED: 'Perfil de Implementador necessário', REVIEWER_PROFILE_REQUIRED: 'Perfil de Revisor necessário',
  PROFILE_REQUIRED: 'Perfil de execução necessário', PROFILE_TYPE_CHANGE_BLOCKED: 'Perfil ainda usado por projetos',
  PROFILE_DELETE_BLOCKED: 'Perfil ainda usado por projetos', PROFILE_ACTIVE_ATTEMPT_BLOCKED: 'Tentativa ativa usa este perfil',
  ACCOUNT_SWITCH_ATTEMPT_ACTIVE: 'Tentativa ativa impede a troca de conta', KANBAN_DIVERGENCE: 'Status do quadro divergente',
  ASSIGNEE_MISMATCH: 'Responsável da issue divergente', DELIVERY_INTEGRITY_FAILED: 'Integridade da versão não confirmada',
  CAPTURE_CONTINUITY_REVOKED: 'Continuidade da captura revogada', CAPTURE_REF_CONFLICT: 'Referência da captura divergente',
  HUMAN_DECISION: 'Aguardando decisão do operador', QUESTION_EXPIRED: 'Pergunta expirada',
  CAPTURE_FAILED: 'Captura da versão falhou',
  EXECUTOR_COST_NOT_OBSERVED: 'Custo não fornecido pelo executor', NATIVE_OPEN_UNAVAILABLE: 'Abertura nativa indisponível',
  DECLARED_NEW_FILE_IGNORED: 'Arquivo novo ignorado', KNOWN_SECRET_EXCLUDED: 'Arquivo excluído pela regra de segurança',
  RESULT_INVALID: 'Resultado precisa de correção', RESULT_CONFLICT: 'Resultado conflita com um resultado anterior',
  MAESTRI_CONTEXT_CONFIRMED: 'Contexto Maestri/OMP disponível', CONTEXT_UNAVAILABLE: 'Contexto local indisponível',
  TRACKING_LOST: 'Acompanhamento da tentativa perdido', RESOURCE_STATE_UNCERTAIN: 'Estado dos recursos sem confirmação',
  RESOURCE_OWNERSHIP_UNCONFIRMED: 'Vínculo dos recursos sem confirmação', RESOURCES_NOT_OBSERVED: 'Recursos ainda não observados',
  RESOURCES_RECORDED: 'Recursos registrados', CREATION_EFFECT_UNKNOWN: 'Efeito da criação sem confirmação',
  CREATION_RESOURCES_RECORDED: 'Recursos da criação registrados', DIAGNOSTIC_CHECK_UNAVAILABLE: 'Verificação indisponível',
  VALIDATION_FAILED: 'Dados precisam de revisão', PAYLOAD_TOO_LARGE: 'Conteúdo acima do limite permitido',
  SESSION_REQUIRED: 'Sessão técnica necessária', CSRF_INVALID: 'Sessão técnica desatualizada',
  STORAGE_UNAVAILABLE: 'Persistência local indisponível', REQUEST_TIMEOUT: 'A solicitação excedeu o prazo',
  INTERNAL_ERROR: 'Falha interna', NOT_FOUND: 'Item não encontrado',
};

const diagnosticCopy: Readonly<Record<string, { title: string; cause: string; nextAction: string }>> = {
  IMPLEMENTATION_BLOCKED: { title: 'Implementação impedida', cause: 'O Implementador registrou um pré-requisito bloqueante. A tentativa não avançou para revisão.', nextAction: 'Consulte o resultado do Implementador, resolva o pré-requisito e prepare uma nova tentativa, ou encerre a atual.' },
  ACCOUNT_CHANGED: { title: 'Conta ativa diferente da vinculada', cause: 'A conta GitHub observada mudou em relação à conta vinculada à preparação.', nextAction: 'Confira a conta ativa e o vínculo em Configuração; depois, consulte a preparação novamente.' },
  ISSUE_CLOSED: { title: 'Issue fechada', cause: 'A issue selecionada está fechada no GitHub.', nextAction: 'Selecione uma issue aberta ou revise seu estado no GitHub e consulte novamente.' },
  NOT_AN_ISSUE: { title: 'Item não executável', cause: 'O item selecionado não é uma issue executável; pode ser um rascunho ou pull request.', nextAction: 'Selecione uma issue vinculada ao quadro configurado.' },
  READ_INCOMPLETE: { title: 'Leitura incompleta', cause: 'A consulta não confirmou todos os dados necessários da issue e do quadro.', nextAction: 'Consulte as issues novamente antes de iniciar.' },
  REPOSITORY_MISMATCH: { title: 'Repositório diferente', cause: 'A issue pertence a um repositório diferente do configurado no projeto.', nextAction: 'Confira a origem do projeto e selecione uma issue do repositório correspondente.' },
  ISSUE_CONTEXT_INVALID: { title: 'Issue não confirmada', cause: 'A identidade ou o repositório da issue selecionada não foi confirmado.', nextAction: 'Confira o projeto e consulte a issue novamente.' },
  PROJECT_MEMBERSHIP_MISSING: { title: 'Vínculo ao quadro não confirmado', cause: 'A issue não tem um vínculo ativo confirmado com o quadro configurado.', nextAction: 'Confira o quadro, o arquivamento do item e o vínculo da issue no GitHub. Depois, consulte novamente.' },
  STATUS_MISMATCH: { title: 'Status diferente do esperado', cause: 'O Status da issue não corresponde ao esperado para este início.', nextAction: 'Confira o Status no GitHub e o mapeamento do projeto. A nova tentativa preserva a exceção existente de início fora de Ready.' },
  OPEN_BLOCKERS: { title: 'Dependências abertas', cause: 'A issue tem bloqueadores ainda abertos no GitHub.', nextAction: 'Resolva os bloqueadores e consulte a issue novamente.' },
  REMOTE_MISMATCH: { title: 'Base local e remota divergentes', cause: 'As referências local e remota observadas não apontam para a mesma base.', nextAction: 'Confira a origem e a branch-base; consulte novamente sem substituir a base silenciosamente.' },
  REPOSITORY_ARCHIVED: { title: 'Repositório arquivado', cause: 'O repositório GitHub da issue está arquivado.', nextAction: 'Revise o arquivamento no GitHub antes de preparar uma nova execução.' },
  PROJECT_CONFIGURATION_CHANGED: { title: 'Configuração do projeto alterada', cause: 'A preparação está vinculada a outra revisão da configuração do projeto.', nextAction: 'Confira a configuração efetiva e salve novamente a preparação antes de autorizar.' },
  PROFILE_REFERENCE_CHANGED: { title: 'Referência de perfil alterada', cause: 'O perfil escolhido foi alterado ou não está mais disponível na revisão selecionada.', nextAction: 'Confira o perfil efetivo e selecione uma referência atual, sem substituir a escolha automaticamente.' },
  PROFILE_TYPE_MISMATCH: { title: 'Perfil de outro papel', cause: 'O tipo do perfil escolhido não corresponde ao papel da preparação.', nextAction: 'Selecione um perfil ativo do papel correspondente.' },
  PROJECT_PROFILE_TYPE_MISMATCH: { title: 'Associação de perfil incompatível', cause: 'Um perfil associado ao projeto não corresponde ao papel esperado.', nextAction: 'Corrija a associação na configuração deste projeto.' },
  PROJECT_OWNER_MISMATCH: { title: 'Proprietário do quadro divergente', cause: 'O proprietário observado não corresponde ao quadro configurado.', nextAction: 'Confira o quadro e seu proprietário na configuração deste projeto.' },
  STATUS_MAPPING_INVALID: { title: 'Mapeamento de Status inválido', cause: 'O campo ou uma das opções de Status configuradas não foi confirmado no quadro.', nextAction: 'Atualize as opções e confira os cinco valores de Status na configuração deste projeto.' },
  STATUS_MAPPING_LEGACY: { title: 'Mapeamento histórico de quatro valores', cause: 'Esta configuração ainda não contém a coluna Backlog exigida pelo quadro V3.', nextAction: 'Na configuração do projeto, selecione novamente o campo Status e mapeie os cinco valores para gravar uma nova revisão.' },
  SCAFFOLD_GIT_IDENTITY_REQUIRED: { title: 'Autoria do commit inicial ausente', cause: 'O Git deste computador não tem nome e e-mail configurados para o commit inicial.', nextAction: 'Configure seu nome e e-mail no Git e crie novamente o projeto. Nenhum arquivo foi criado.' },
  GIT_VERSION_UNSUPPORTED: { title: 'Atualize ou selecione um Git compatível', cause: 'O executável Git não confirmou suporte a --no-lazy-fetch. Git 2.43 não oferece essa proteção contra busca implícita de objetos.', nextAction: 'Instale ou selecione Git 2.45.0 ou superior e execute nova detecção em Configuração. Não desative a proteção; esta falha não indica ausência de nome e e-mail.' },
  SCAFFOLD_GIT_CONFIG_FAILED: { title: 'Não foi possível ler a configuração do Git', cause: 'O comando de consulta da configuração falhou; a autoria do commit inicial não foi determinada.', nextAction: 'Confira o executável e a configuração do Git. Selecione Git 2.45.0 ou superior com suporte a --no-lazy-fetch e execute nova detecção antes de tentar novamente. Não reconfigure nome e e-mail apenas por esta falha.' },
  GIT_UNAVAILABLE: { title: 'Git indisponível para a operação', cause: 'O executável Git não pôde ser iniciado ou a consulta excedeu os limites; isso não comprova ausência de autoria.', nextAction: 'Confira o caminho e o acesso ao executável Git em Configuração e execute nova detecção antes de tentar novamente.' },
  GIT_ENCODING_UNSUPPORTED: { title: 'Resposta do Git não pôde ser lida', cause: 'O Git retornou texto com codificação incompatível; a autoria não pôde ser determinada.', nextAction: 'Confira a configuração e a codificação do Git antes de tentar novamente.' },
  GIT_INPUT_FAILED: { title: 'Comunicação com o Git interrompida', cause: 'O processo Git não recebeu a entrada da operação; a autoria não pôde ser determinada.', nextAction: 'Confira a disponibilidade do Git e execute nova detecção antes de tentar novamente.' },
  CREATION_REMOTE_DESCRIPTION_UNCONFIRMED: { title: 'Descrição sem confirmação', cause: 'O repositório foi criado, mas a atualização da descrição não foi confirmada.', nextAction: 'Consulte os efeitos preservados para conferir a descrição, sem recriar o repositório.' },
  CREATION_REMOTE_DESCRIPTION_CHANGED: { title: 'Descrição alterada no GitHub', cause: 'A descrição foi editada após a criação e foi preservada.', nextAction: 'Confira a descrição no GitHub antes de prosseguir com a criação.' },
  ORIGIN_INVALID: { title: 'Origem não confirmada', cause: 'Não foi possível confirmar a pasta Git ou a URL do repositório informada.', nextAction: 'Confira o tipo e a localização da origem na configuração do projeto e consulte novamente.' },
  BASE_BRANCH_INVALID: { title: 'Branch-base não confirmada', cause: 'A consulta da origem não confirmou a branch-base escolhida.', nextAction: 'Confirme a origem e selecione uma branch existente no projeto.' },
  BASE_UNCONFIRMED: { title: 'Base remota não confirmada', cause: 'O commit da branch-base no GitHub ainda não foi confirmado.', nextAction: 'Confira o remoto e a branch-base antes de consultar a preparação novamente.' },
  EXECUTOR_REVALIDATION_REQUIRED: { title: 'Executor será conferido no início', cause: 'A preparação ainda não inicia agentes. O contexto Maestri/OMP será validado ao solicitar o início.', nextAction: 'Resolva os demais impedimentos e revise o resumo. O início continuará condicionado à validação do executor.' },
  ISSUE_REVALIDATION_REQUIRED: { title: 'Issue será conferida na preparação', cause: 'A lista de issues é uma consulta inicial, sem autorização de execução.', nextAction: 'Selecione a issue para conferir responsável, quadro, critérios e base atual.' },
  PROJECT_REQUIRED: {
    title: 'Selecione o quadro do projeto',
    cause: 'O quadro GitHub e o mapeamento de Status ainda não foram configurados.',
    nextAction: 'Abra a configuração do projeto, confirme o repositório, vincule o quadro e mapeie as cinco opções de Status V3.',
  },
  REMOTE_UNCONFIRMED: {
    title: 'Confirme o repositório GitHub',
    cause: 'O projeto ainda não tem um repositório GitHub confirmado.',
    nextAction: 'Abra a configuração do projeto e confirme a origem GitHub antes de preparar uma issue.',
  },
  CODE_NOT_PUBLISHED: {
    title: 'Publique a branch-base',
    cause: 'O commit da branch-base ainda não está confirmado no repositório GitHub.',
    nextAction: 'Publique a branch-base configurada e consulte novamente a preparação ou fila.',
  },
  PROFILES_REQUIRED: {
    title: 'Selecione os perfis do projeto',
    cause: 'Falta associar um perfil de Implementador e um de Revisor ao projeto.',
    nextAction: 'Abra a configuração do projeto e selecione um perfil ativo para cada papel. Se necessário, crie-os em Perfis.',
  },
  LOCAL_CHANGES_EXCLUDED: {
    title: 'Alterações locais ficam preservadas',
    cause: 'A tentativa usa somente o histórico commitado da origem.',
    nextAction: 'Confira se as alterações necessárias já estão commitadas antes de preparar uma issue.',
  },
  PROJECT_NOT_READY: {
    title: 'Configure o projeto para a fila',
    cause: 'Um projeto ainda precisa do quadro GitHub ou do repositório confirmado.',
    nextAction: 'Abra Projetos, selecione o projeto indicado e configure a origem e o quadro pelo nome.',
  },
  PROJECT_QUEUE_BLOCKED: {
    title: 'Fila bloqueada neste projeto',
    cause: 'A consulta deste projeto não foi confirmada. Os demais projetos disponíveis podem continuar.',
    nextAction: 'Abra a configuração do projeto indicado e confira o quadro, o acesso e os perfis. A consulta será repetida automaticamente.',
  },
  GLOBAL_AUTOMATION_PAUSED: {
    title: 'Fila global pausada',
    cause: 'A automação pode estar habilitada no projeto, mas a fila global está pausada.',
    nextAction: 'Abra Configuração, marque Automação global habilitada em Automação e acompanhamento e salve a configuração.',
  },
  ACCOUNT_UNOBSERVED: {
    title: 'Vincule uma conta GitHub',
    cause: 'Nenhuma conta GitHub foi vinculada a esta instalação.',
    nextAction: 'Abra Configuração, verifique o status do GitHub e vincule uma conta ativa.',
  },
  ACCOUNT_REQUIRED: {
    title: 'Vincule uma conta GitHub',
    cause: 'A configuração ainda não tem uma conta vinculada.',
    nextAction: 'Abra Configuração, verifique o status do GitHub e vincule uma conta ativa.',
  },
  ACCOUNT_NOT_CONFIGURED: {
    title: 'Vincule uma conta GitHub',
    cause: 'A configuração ainda não tem uma conta vinculada.',
    nextAction: 'Abra Configuração, verifique o status do GitHub e vincule uma conta ativa.',
  },
  ACCOUNT_MISMATCH: {
    title: 'Confira a conta GitHub ativa',
    cause: 'A identidade ativa observada difere da conta vinculada à fábrica.',
    nextAction: 'Confirme a conta ativa no GitHub CLI e use a ação explícita de troca em Configuração.',
  },
  ACCOUNT_SWITCH_ATTEMPT_ACTIVE: {
    title: 'Aguarde a tentativa ativa',
    cause: 'A conta atual ainda tem uma tentativa sem resultado final.',
    nextAction: 'Consulte a tentativa e aguarde o encerramento antes de trocar a conta vinculada.',
  },
  KANBAN_DIVERGENCE: {
    title: 'Revise o Status do quadro',
    cause: 'O Status observado no GitHub não corresponde ao mapeamento configurado para este projeto.',
    nextAction: 'Confira o campo e as opções em Configuração e corrija o Status no GitHub quando necessário.',
  },
  ASSIGNEE_MISMATCH: {
    title: 'Confira o responsável da issue',
    cause: 'O responsável observado não corresponde à conta vinculada à esteira.',
    nextAction: 'Revise a atribuição no GitHub e revalide a autoridade antes de continuar.',
  },
  DELIVERY_INTEGRITY_FAILED: {
    title: 'Versão não íntegra',
    cause: 'A integridade da versão selecionada não foi confirmada.',
    nextAction: 'Consulte os detalhes da versão e não autorize publicação até que a integridade seja confirmada.',
  },
  PROJECTS_ROOT_REQUIRED: {
    title: 'Confirme a pasta dos projetos',
    cause: 'A pasta necessária para novos projetos ainda não foi confirmada.',
    nextAction: 'Abra Configuração, escolha uma pasta acessível e valide o acesso de gravação.',
  },
  PROJECTS_ROOT_UNAVAILABLE: {
    title: 'Revise a pasta dos projetos',
    cause: 'A pasta salva não está acessível para leitura e gravação neste momento.',
    nextAction: 'Abra Configuração e selecione uma pasta acessível para confirmar novamente.',
  },
  PROJECTS_ROOT_CHANGED: {
    title: 'Confirme novamente a pasta',
    cause: 'A pasta observada difere daquela que foi confirmada anteriormente.',
    nextAction: 'Abra Configuração e valide a pasta atual antes de continuar.',
  },
  PROJECTS_ROOT_NOT_CONFIRMED: {
    title: 'Confirme a pasta dos projetos',
    cause: 'A pasta informada ainda não tem uma confirmação válida.',
    nextAction: 'Abra Configuração, escolha a pasta e conclua a validação.',
  },
  IMPLEMENTER_PROFILE_REQUIRED: {
    title: 'Configure um perfil de Implementador',
    cause: 'Não há um perfil vivo de Implementador disponível para esta configuração.',
    nextAction: 'Abra Perfis, crie ou ajuste um perfil de Implementador e selecione-o no projeto.',
  },
  REVIEWER_PROFILE_REQUIRED: {
    title: 'Configure um perfil de Revisor',
    cause: 'Não há um perfil vivo de Revisor disponível para esta configuração.',
    nextAction: 'Abra Perfis, crie ou ajuste um perfil de Revisor e selecione-o no projeto.',
  },
  PROFILE_REQUIRED: {
    title: 'Configure os perfis do projeto',
    cause: 'A configuração precisa de um perfil para cada papel do ciclo.',
    nextAction: 'Abra Perfis e selecione um Implementador e um Revisor para o projeto.',
  },
  EXECUTION_REVALIDATION_REQUIRED: {
    title: 'Valide os pré-requisitos antes de iniciar',
    cause: 'As escolhas salvas precisam ser conferidas com o contexto atual antes de iniciar.',
    nextAction: 'Revise os pré-requisitos na preparação e consulte novamente o resumo atual.',
  },
  CONFIGURATION_RECORDED: {
    title: 'Configuração consultada',
    cause: 'Os dados salvos e os vínculos locais foram consultados.',
    nextAction: 'Revalide a conta e o executor ao preparar a próxima tentativa.',
  },
  MAESTRI_CONTEXT_CONFIRMED: {
    title: 'Contexto local disponível',
    cause: 'O terminal âncora confirmou o contexto Maestri/OMP nesta consulta.',
    nextAction: 'A confirmação vale para este instante; a execução ainda exige validação no início.',
  },
  TRACKING_LOST: {
    title: 'Acompanhamento interrompido',
    cause: 'O controlador perdeu o acompanhamento necessário para continuar a tentativa.',
    nextAction: 'Consulte os recursos e resultados registrados e avalie a ação de recuperação disponível.',
  },
  RESOURCE_STATE_UNCERTAIN: {
    title: 'Confirme o estado dos recursos',
    cause: 'Um ou mais recursos não têm confirmação atual de inicialização ou parada.',
    nextAction: 'Consulte os recursos da tentativa e a confirmação de parada no host executor.',
  },
  RESOURCE_OWNERSHIP_UNCONFIRMED: {
    title: 'Confirme os recursos registrados',
    cause: 'O vínculo de ownership de um recurso não foi confirmado.',
    nextAction: 'Atualize os recursos da tentativa e consulte o host executor.',
  },
  RESOURCES_NOT_OBSERVED: {
    title: 'Recursos ainda não observados',
    cause: 'Esta consulta não encontrou recursos registrados para o contexto.',
    nextAction: 'Atualize os fatos e consulte novamente após o início da operação correspondente.',
  },
  CREATION_EFFECT_UNKNOWN: {
    title: 'Confirme a criação parcial',
    cause: 'Um efeito da criação ainda não tem resultado confirmado.',
    nextAction: 'Abra o detalhe da criação e reconcilie somente o efeito indicado pelo controlador.',
  },
  DIAGNOSTIC_CHECK_UNAVAILABLE: {
    title: 'A verificação não terminou',
    cause: 'A consulta não terminou com uma observação válida.',
    nextAction: 'Confira o contexto e solicite outra verificação; nenhum efeito será repetido automaticamente.',
  },
};

const errorCopy: Readonly<Record<string, string>> = {
  DELIVERY_BRANCH_IN_USE: 'A branch de destino está aberta em um checkout. Troque a branch desse checkout e tente concluir a entrega novamente.',
  DELIVERY_BRANCH_NOT_FOUND: 'A branch de destino não existe no repositório local. Confira o nome e disponibilize essa branch antes de concluir a entrega.',
  DELIVERY_BRANCH_INVALID: 'Informe um nome Git válido para a branch de destino.',
  DELIVERY_BRANCH_COLLISION: 'A nova branch escolhida já existe ou está reservada. Confira o destino antes de continuar.',
  PR_BRANCH_EQUALS_BASE: 'A branch entregue e a base do PR são iguais. Escolha branches diferentes antes de iniciar uma tentativa com PR.',
  PUSH_NOT_AUTHORIZED: 'O controlador não reconheceu a autorização para enviar a versão aprovada. Verifique se o controlador está atualizado e consulte novamente a tentativa.',
  MUTATION_NOT_AUTHORIZED: 'O controlador não reconheceu a autorização para publicar no GitHub. Verifique se o controlador está atualizado e consulte novamente a tentativa.',
  VALIDATION_FAILED: 'Revise os campos destacados e corrija os valores informados.',
  REQUEST_REJECTED: 'A solicitação não pôde ser aceita com os dados e o contexto atuais.',
  PAYLOAD_TOO_LARGE: 'O conteúdo enviado excede o limite permitido. Reduza o texto e tente novamente.',
  SESSION_REQUIRED: 'A sessão expirou. Atualize os dados antes de tentar novamente.',
  CSRF_INVALID: 'A sessão mudou. Atualize os dados antes de continuar.',
  STORAGE_UNAVAILABLE: 'O armazenamento local não está disponível. Tente novamente após consultar o estado atual.',
  REQUEST_TIMEOUT: 'A solicitação excedeu o prazo. Consulte o estado atual antes de repetir qualquer ação.',
  INTERNAL_ERROR: 'O controlador não conseguiu concluir a solicitação. Consulte o estado atual antes de tentar novamente.',
  ACCOUNT_UNOBSERVED: 'Vincule uma conta GitHub ativa em Configuração antes de continuar.',
  ACCOUNT_REQUIRED: 'Vincule uma conta GitHub ativa em Configuração antes de continuar.',
  ACCOUNT_NOT_CONFIGURED: 'Vincule uma conta GitHub ativa em Configuração antes de continuar.',
  ACCOUNT_MISMATCH: 'A conta ativa do GitHub difere da conta vinculada. Confira a conta em Configuração.',
  ACCOUNT_SWITCH_ATTEMPT_ACTIVE: 'A conta atual tem uma tentativa ativa. Consulte-a e aguarde o resultado antes de trocar a conta.',
  KANBAN_DIVERGENCE: 'O Status observado do quadro difere do mapeamento configurado. Revise Configuração e atualize o Status no GitHub.',
  SUMMARY_CHANGED: 'O resumo mudou. Revise os dados atuais antes de autorizar novamente.',
  ATTEMPT_ACTIVE: 'Esta issue já tem uma tentativa em andamento. Consulte-a antes de preparar outra.',
  PROJECTS_ROOT_REQUIRED: 'Confirme a pasta dos projetos em Configuração antes de continuar.',
  PROJECTS_ROOT_UNAVAILABLE: 'A pasta dos projetos não está acessível. Escolha outra pasta e valide novamente.',
  PROFILE_ACTIVE_ATTEMPT_BLOCKED: 'Uma tentativa ativa usa este perfil. Aguarde o resultado antes de alterá-lo.',
  PROFILE_DELETE_BLOCKED: 'Um ou mais projetos ainda usam este perfil. Substitua-o nas configurações indicadas.',
  PROFILE_TYPE_CHANGE_BLOCKED: 'Um ou mais projetos usam este perfil neste papel. Substitua a seleção antes de mudar o tipo.',
  QUEUE_SUMMARY_CHANGED: 'A observação da fila mudou. Revise os candidatos atuais antes de confirmar.',
  ARTIFACT_INTEGRITY_FAILED: 'A integridade da evidência não foi confirmada; o conteúdo foi recusado.',
  ARTIFACT_MISSING: 'A evidência não está disponível nesta versão.',
};

const factLabels: Readonly<Record<string, string>> = {
  expected_account_id: 'Conta esperada', observed_account_id: 'Conta observada', account_id: 'Conta vinculada',
  observed_host: 'Host observado', expected_host: 'Host esperado', expected_status_id: 'Status esperado', observed_status_id: 'Status observado', observed_at_ms: 'Observado em', profile_count: 'Perfis disponíveis',
  profile_counts: 'Perfis disponíveis por papel', implementer_profile_count: 'Perfis de Implementador',
  reviewer_profile_count: 'Perfis de Revisor', project_count: 'Projetos encontrados', eligible_count: 'Issues elegíveis',
  attempt_id: 'Tentativa', project_id: 'Projeto',
  operation_id: 'Operação', request_id: 'Solicitação',
  blocking_project_count: 'Projetos relacionados', blocking_project_ids: 'Projetos relacionados',
  resource_count: 'Recursos registrados', uncertain_count: 'Recursos sem confirmação', retry_at_ms: 'Próxima consulta permitida',
  revision: 'Revisão técnica', expected_revision: 'Revisão esperada', current_revision: 'Revisão atual',
  state: 'Estado técnico', phase: 'Etapa registrada', result: 'Resultado registrado', tracking: 'Acompanhamento registrado',
  status: 'Estado técnico', reason: 'Motivo registrado', code: 'Código técnico',
  id: 'Identificador técnico', round: 'Rodada', role: 'Papel', verdict: 'Parecer', declared_verdict: 'Parecer declarado',
  blocking: 'Impeditivo', category: 'Categoria', exit_code: 'Código de saída', duration_ms: 'Duração em milissegundos',
  passed: 'Aprovado', kind: 'Tipo de recurso', started_at_ms: 'Início', completed_at_ms: 'Conclusão', finished_at_ms: 'Término',
  producer_passage_id: 'Passagem do Implementador', delivery_id: 'Versão',
  criterion_id: 'Critério', finding_id: 'Achado', old_path: 'Caminho anterior', new_path: 'Caminho atual',
  content_identity: 'Identidade do conteúdo', base_sha: 'Referência da base', sha256: 'Verificação SHA-256',
  pendencias_de_medicao: 'Pendências de medição', requisitos_afetados: 'Requisitos associados', authorized_summary_hash: 'Hash do resumo autorizado',
};

export function operatorState(value: string | null | undefined): StateLabel {
  if (!value) return { label: 'Não informado', known: true };
  const label = stateLabels[value.toLocaleLowerCase('en').replace(/[.\s-]+/g, '_')];
  return label ? { label, known: true } : { label: 'Estado desconhecido', known: false };
}

const eventLabels: Readonly<Record<string, string>> = {
  'project.registered': 'Projeto cadastrado', 'project.configuration.updated': 'Configuração do projeto atualizada',
  'project.deletion.accepted': 'Exclusão do projeto autorizada',
  'settings.updated': 'Configuração geral atualizada', 'settings.onboarding.updated': 'Configuração inicial atualizada',
  'settings.account.bound': 'Conta GitHub vinculada', 'settings.account.switched': 'Conta GitHub alterada',
  'settings.time-defaults.updated': 'Prazos de execução atualizados',
  'preparation.created': 'Preparação criada', 'preparation.updated': 'Preparação atualizada',
  'attempt.accepted': 'Início da tentativa aceito', 'attempt.cancel.accepted': 'Cancelamento solicitado',
  'attempt.failed': 'Tentativa encerrada com falha', 'attempt.rejected': 'Tentativa reprovada',
  'attempt.authority-observed': 'Permissões da tentativa conferidas',
  'attempt.revalidate.accepted': 'Revalidação da tentativa solicitada',
  'attempt.icr-completed': 'Implementação e revisão concluídas', 'attempt.commit-completed': 'Entrega com commit concluída',
  'attempt.pr-completed': 'Entrega com pull request concluída',
  'passage-ready': 'Agente pronto para trabalhar', 'question-raised': 'Pergunta do agente recebida',
  'question-answer-receipt': 'Recebimento da resposta confirmado', 'result-accepted': 'Resultado do agente aceito',
  'tracking-lost': 'Acompanhamento do agente perdido', 'cleanup-updated': 'Limpeza dos recursos atualizada',
  'question.answer-recorded': 'Resposta ao agente registrada', 'question.answer-unknown': 'Entrega da resposta sem confirmação',
  'dispatch.failed': 'Falha ao iniciar o agente', 'active-time.expired': 'Prazo de execução esgotado',
  'capture.running': 'Captura da versão iniciada', 'capture.captured': 'Versão capturada',
  'capture.failed': 'Falha ao capturar a versão', 'capture.retry.accepted': 'Nova captura solicitada',
  'review.planned': 'Revisão planejada', 'review.workspace.ready': 'Ambiente da revisão pronto',
  'review.workspace.partial': 'Preparação do ambiente da revisão incompleta', 'correction.planned': 'Rodada de correção planejada',
  'diagnostic.interrupted': 'Verificação local interrompida',
  'publication.complete.accepted': 'Publicação solicitada', 'publication.reconcile.accepted': 'Conferência da publicação solicitada',
  'publication.authorize-upgrade.accepted': 'Ampliação do modo de entrega autorizada',
  'effect.intended': 'Ação de entrega preparada', 'effect.sent': 'Ação de entrega enviada',
  'effect.stage-superseded': 'Etapa de entrega substituída após nova validação',
  'attempt.created': 'Tentativa criada', 'attempt.started': 'Tentativa iniciada', 'attempt.interrupted': 'Tentativa interrompida',
  'attempt.cancel_requested': 'Cancelamento solicitado', 'attempt.cancelled': 'Tentativa cancelada', 'attempt.completed': 'Tentativa concluída',
  'attempt.result_accepted': 'Resultado registrado', 'attempt.delivery_captured': 'Versão capturada', 'attempt.reviewed': 'Revisão registrada',
  'attempt.published': 'Entrega concluída', 'attempt.retried': 'Nova tentativa criada',
  'settings.saved': 'Configuração geral atualizada', 'configuration.saved': 'Configuração do projeto atualizada',
  'profile.created': 'Perfil criado', 'profile.updated': 'Perfil atualizado', 'profile.deleted': 'Perfil removido',
  'queue.updated': 'Configuração da fila atualizada', 'queue.paused': 'Fila pausada', 'queue.enabled': 'Fila habilitada',
  'question.created': 'Pergunta do agente registrada', 'question.answered': 'Resposta registrada', 'question.expired': 'Pergunta expirada',
  'diagnostic.accepted': 'Verificação aceita', 'diagnostic.completed': 'Verificação concluída',
  'scaffold.created': 'Criação de projeto iniciada', 'scaffold.reconciled': 'Criação de projeto reconciliada',
  'creation.accepted': 'Criação de projeto aceita', 'creation.completed': 'Criação de projeto concluída',
  'creation.stopped': 'Criação de projeto interrompida', 'creation.reconcile.accepted': 'Conferência da criação aceita',
  'creation.reconciled': 'Efeitos da criação conferidos',
  'publication.completed': 'Efeitos de entrega concluídos', 'publication.reconciled': 'Efeitos de entrega reconciliados',
};

export function operatorEventLabel(eventType: string): string {
  const normalized = eventType.toLocaleLowerCase('en');
  if (eventLabels[normalized]) return eventLabels[normalized]!;
  const board = /^creation\.board\.(create_board|configure_status|link_repository|configure_view|verify_board)\.(accepted|running|sent|confirmed|failed_known|unknown)$/.exec(normalized);
  if (board) {
    const operations: Record<string, string> = {
      create_board: 'Criação do quadro Kanban', configure_status: 'Configuração das colunas do Kanban',
      link_repository: 'Vínculo do repositório ao Kanban', configure_view: 'Configuração da visualização Kanban',
      verify_board: 'Verificação do quadro Kanban',
    };
    const states: Record<string, string> = {
      accepted: 'solicitada', running: 'em andamento', sent: 'solicitação enviada ao GitHub',
      confirmed: 'confirmada', failed_known: 'falhou', unknown: 'resultado sem confirmação',
    };
    return `${operations[board[1]!]}: ${states[board[2]!]}`;
  }
  const transition = /^(workspace|publication|effect)\.(\w+)$/.exec(normalized);
  if (transition && operatorState(transition[2]).known) {
    const subjects: Record<string, string> = { workspace: 'Ambiente da tentativa', publication: 'Publicação', effect: 'Ação de entrega' };
    return `${subjects[transition[1]!]}: ${operatorState(transition[2]).label}`;
  }
  const recovery = /^(resource\.remove|folder\.open|interaction\.open)\.(accepted|confirmed|failed|unknown)$/.exec(normalized);
  if (recovery) {
    const subjects: Record<string, string> = { 'resource.remove': 'Remoção de recurso', 'folder.open': 'Abertura da pasta', 'interaction.open': 'Abertura do terminal' };
    return `${subjects[recovery[1]!]}: ${operatorState(recovery[2]).label}`;
  }
  const step = /^creation\.(directory|files|git|baseline|registration)\.(not_started|running|confirmed|unknown)$/.exec(normalized);
  if (step) {
    const labels: Record<string, string> = { directory: 'Pasta do projeto', files: 'Arquivos do projeto', git: 'Repositório Git local', baseline: 'Commit inicial', registration: 'Cadastro do projeto' };
    return `${labels[step[1]!]}: ${operatorState(step[2]).label}`;
  }
  return 'Evento sem descrição disponível';
}

export function isKnownOperatorEvent(eventType: string): boolean {
  return operatorEventLabel(eventType) !== 'Evento sem descrição disponível';
}

export function operatorCodeLabel(code: string): string {
  const configExit = /^SCAFFOLD_GIT_CONFIG_FAILED_EXIT_(\d+)$/.exec(code)?.[1];
  if (configExit) return `Falha ao consultar a configuração do Git (saída ${configExit})`;
  return codeLabels[code] ?? errorCopy[code] ?? 'Situação que precisa de atenção';
}

export function operatorFactLabel(key: string): string {
  const normalized = key.replace(/([A-Z])/g, '_$1').replace(/[\s.-]+/g, '_').toLocaleLowerCase('en').replace(/^_/, '');
  return factLabels[normalized] ?? factLabels[key] ?? 'Informação adicional';
}

export function operatorFactValue(value: unknown): string {
  if (value === null || value === undefined) return 'Não observado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Não observado';
  if (typeof value === 'string') {
    if (codeLabels[value]) return codeLabels[value]!;
    const state = operatorState(value);
    return state.known ? state.label : value;
  }
  if (Array.isArray(value)) return value.map(operatorFactValue).join(', ');
  return 'Informação indisponível';
}

export function operatorVisibleFactValue(key: string, value: unknown): string {
  const normalized = key.replace(/([A-Z])/g, '_$1').replace(/[\s.-]+/g, '_').toLocaleLowerCase('en').replace(/^_/, '');
  if (['state', 'status', 'phase', 'result', 'tracking', 'verdict', 'declared_verdict', 'capture_state', 'active_limit_state'].includes(normalized)) {
    return operatorState(typeof value === 'string' ? value : null).label;
  }
  return operatorFactValue(value);
}

export function operatorErrorMessage(code: string, message: string, status?: number): string {
  const translated = errorCopy[code];
  if (translated) return translated;
  if (isPortugueseOperatorText(message)) return message;
  if (code.startsWith('PROFILE_')) return 'Revise o perfil e as referências de projeto antes de continuar.';
  if (code.startsWith('PROJECTS_ROOT_')) return 'Revise e confirme novamente a pasta dos projetos em Configuração.';
  if (status === 409 || code.includes('CONFLICT') || code.endsWith('_CHANGED')) return 'Os dados mudaram durante esta ação. Consulte o estado atual antes de continuar.';
  if (status === 412) return 'A configuração mudou desde a leitura. Consulte os dados atuais e revise sua edição.';
  if (status === 413) return 'O conteúdo enviado excede o limite permitido. Reduza o texto e tente novamente.';
  if (status === 404) return 'O item solicitado não está disponível no contexto atual.';
  if (status === 503 || code.endsWith('_UNAVAILABLE')) return 'O serviço local está indisponível. Consulte o estado atual e tente novamente.';
  if (status !== undefined && status >= 500) return 'O controlador não conseguiu concluir a solicitação. Consulte o estado atual antes de tentar novamente.';
  return 'A solicitação não pôde ser concluída. Consulte o estado atual antes de tentar novamente.';
}

export function diagnosticCopyFor(code: string, state: string, cause?: string | null, recovery?: string | null) {
  const configExit = /^SCAFFOLD_GIT_CONFIG_FAILED_EXIT_(\d+)$/.exec(code)?.[1];
  if (configExit) {
    const copy = diagnosticCopy.SCAFFOLD_GIT_CONFIG_FAILED!;
    return { ...copy, cause: `${copy.cause} Código de saída do Git: ${configExit}.` };
  }
  const known = diagnosticCopy[code];
  if (known) return ['PROJECT_NOT_READY', 'PROJECT_QUEUE_BLOCKED', 'PROJECT_REQUIRED', 'REMOTE_UNCONFIRMED', 'CODE_NOT_PUBLISHED', 'STATUS_MAPPING_LEGACY', 'STATUS_MAPPING_INVALID'].includes(code) && cause && isPortugueseOperatorText(cause) ? { ...known, cause, ...(recovery && isPortugueseOperatorText(recovery) ? { nextAction: recovery } : {}) } : known;
  const status = operatorState(state);
  return {
    title: status.known && state.toLocaleLowerCase('en') === 'passed' ? 'Verificação concluída' : 'Atenção necessária',
    cause: cause && isPortugueseOperatorText(cause) ? cause : 'O controlador registrou uma situação que precisa de consulta.',
    nextAction: recovery && isPortugueseOperatorText(recovery) ? recovery : 'Atualize os dados deste contexto e tente novamente.',
  };
}

export function isPortugueseOperatorText(value: string): boolean {
  return /[áàâãéêíóôõúüç]|\b(não|nao|esta|está|foram|foi|consulte|verifique|abra|salve|escolha|configuração|tentativa|conta|pasta|perfil|solicitação)\b/i.test(value);
}

export function operatorFieldLabel(path: string): string {
  const field = path.split('.').filter(Boolean).at(-1)?.toLocaleLowerCase('en') ?? '';
  const labels: Readonly<Record<string, string>> = {
    name: 'Nome', source: 'Origem', location: 'Localização', base_branch: 'Branch-base', basebranch: 'Branch-base',
    project_id: 'Projeto', account_id: 'Conta vinculada', projects_root: 'Raiz dos projetos', polling_interval_ms: 'Intervalo de consulta',
    passage_active_time_ms: 'Tempo ativo por passagem', question_ttl: 'TTL da pergunta', implementer_profile_id: 'Perfil de Implementador',
    reviewer_profile_id: 'Perfil de Revisor', correction_limit: 'Limite de correções', delivery_mode: 'Modo de entrega',
    guidance: 'Orientações', command: 'Comando do check', cwd_relative: 'Pasta relativa do check', timeout_ms: 'Prazo do check',
    profile_type: 'Tipo do perfil', provider: 'Provider', model: 'Modelo', effort: 'Esforço',
  };
  return labels[field] ?? 'Campo informado';
}
