# Atualizar a Pasta do projeto com segurança no Windows

Pesquisa da issue #51 (wayfinder:research, filha da #48). Pergunta: qual é a forma segura de fazer a entrega aprovada aterrissar na Pasta do projeto do operador (checkout local), atualizando os arquivos, com Git for Windows?

Convenções deste documento:

- **[doc]** afirmação extraída da documentação oficial (git-scm.com, código-fonte do Git for Windows) citada na seção "Fontes".
- **[teste]** comportamento verificado por experimento local com `git version 2.55.0.windows.2`, Windows 11, com `GIT_CONFIG_NOSYSTEM=1` e `GIT_CONFIG_GLOBAL=NUL` (o mesmo isolamento que `apps/controller/src/modules/workspaces/git.ts` aplica com `isolatedConfig`). Os scripts de teste não foram versionados; os resultados estão resumidos aqui. Convém repetir os testes numa versão de Git diferente antes de fixar o contrato.
- **[não verificado]** inferência ou ponto que a documentação não cobre.

## 1. Resumo e recomendação

| Opção | Recomendação |
|---|---|
| **Branch em checkout** (avançar a branch ativa) | `git merge --ff-only --no-autostash` sobre o SHA aprovado, **depois** de um pré-voo próprio (seção 3) e com hooks desligados e EOL do operador injetado (seção 5). Não usar `update-ref` sozinho e não usar `reset --hard`. |
| **Branch nova** | `git switch --no-guess --no-recurse-submodules --no-overwrite-ignore -c <branch> <sha>` com o mesmo pré-voo, hooks desligados e EOL do operador. É a única forma testada que **recusa** sobrescrever arquivo ignorado. |

Três achados mudam o desenho atual e precisam entrar no contrato da entrega:

1. **O Git aceita sobrescrever arquivos ignorados em silêncio** em `merge --ff-only`, `reset --keep` e `read-tree -m -u` **[teste]**; só `switch/checkout --no-overwrite-ignore` recusa **[doc, teste]**. O pré-voo precisa cruzar os caminhos que a entrega toca com `git status --ignored` e recusar.
2. **O isolamento de configuração do produto faz uma árvore limpa parecer suja.** Com `GIT_CONFIG_GLOBAL=NUL` e `GIT_CONFIG_NOSYSTEM=1`, `core.autocrlf` fica indefinido; arquivos CRLF escritos pelo checkout do operador (`autocrlf=true`, padrão do instalador do Git for Windows) aparecem como ` .M` no `status` isolado e como limpos no `status` com a configuração do operador **[teste]**. Esse é o falso positivo de EOL já visto no produto. O `.gitattributes` do repositório continua valendo mesmo isolado **[teste]**, então o problema é só a configuração de usuário/sistema.
3. **Um `merge --ff-only` ou `switch -c` interrompido deixa um estado parcial** (arquivos já escritos, índice ou ref ainda no estado antigo) que parece "alteração do operador" e bloqueia o retry **[teste]**. É preciso um reconciliador próprio (seção 7); o Git não oferece `--continue` para isso.

## 2. Estado atual do código

`createLocalCommit` em `apps/controller/src/modules/workspaces/delivery-target.ts` cria o commit com `git commit-tree` e move a ref com `git update-ref --no-deref <ref> <sha> <old>` sem tocar índice nem working tree. Já existem peças reaproveitáveis: `observe` (HEAD, ramo simbólico, `status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none`, hash dos arquivos e do índice), o `working_state_hash` selado no alvo e o `reconcileLocalCommit` (estados `confirmed`/`unknown`/`failed_known`). Todas as chamadas usam `isolatedConfig` e `--no-optional-locks`. Isso já protege contra `post-*` de configuração de usuário, mas **não** contra os hooks do próprio repositório (`.git/hooks` e `core.hooksPath` do `.git/config`), que continuam ativos **[teste]**.

## 3. Pré-voo: detectar "pasta suja" de forma confiável

Executar tudo com `--no-optional-locks` (o `status` não regrava o índice; confirmado: o mtime do `.git/index` não mudou **[teste]**, e a opção equivale a `GIT_OPTIONAL_LOCKS=0` **[doc: git(1), git-status]**).

### 3.1 Operações em andamento e locks

O Git recusa só parte dos casos:

| Situação | Comportamento do `merge --ff-only` | Fonte |
|---|---|---|
| `MERGE_HEAD` presente | recusa: "You have not concluded your merge" | [teste] |
| `CHERRY_PICK_HEAD` presente | recusa: "You have not concluded your cherry-pick" | [teste] |
| `rebase-merge/` ou `rebase-apply/` presentes | **não recusa**; o merge avançou a ref no meio de um rebase | [teste] |
| `index.lock` presente | recusa: "Unable to create ...index.lock: File exists", sem alterar nada; `status` continua funcionando | [teste] |
| ref detached (`symbolic-ref --quiet HEAD` sai com 1) | é detectável, mas não é erro do Git | [teste] |

Portanto o pré-voo deve checar por conta própria, via `git rev-parse --git-path <nome>` (resolve worktrees vinculados): `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, `rebase-apply`, `BISECT_LOG`, `sequencer`, `index.lock`, `HEAD.lock`, `refs/heads/<branch>.lock`, `shallow.lock`. `git status` (formato humano) diz "You are currently rebasing" mas o formato `--porcelain=v2` **não** expõe operação em andamento **[doc: git-status; teste]**, então não dá para depender dele. Se `index.lock` existir, tratar como `failed_known`/"pasta ocupada" e **não apagar** o arquivo: o lock pode ser de um IDE ou de outro `git` do operador.

Também exigir: `symbolic-ref HEAD` igual à ref esperada, `HEAD` igual ao `base_sha` selado, e (para a branch ativa) nenhum outro worktree com a mesma branch (`git worktree list --porcelain -z`, linhas `branch refs/heads/...`) **[doc: git-worktree]**.

### 3.2 Árvore rastreada, não rastreada e ignorada

Comando recomendado (lido com `-z`, sem aspas nos caminhos):

```
git --no-optional-locks status --porcelain=v2 -z --branch --untracked-files=all --ignored=matching --ignore-submodules=none
```

- Linhas `1`/`2`/`u` = rastreados alterados, renomeados, em conflito; `?` = não rastreados; `!` = ignorados; campo `<sub>` com `S<c><m><u>` marca submódulo com mudança de commit, modificado ou não rastreado **[doc: git-status]**.
- Com `--ignored=matching` o diretório ignorado inteiro vem como uma linha só; para cruzar com caminhos da entrega use `--ignored=traditional --untracked-files=all` ou `git ls-files --others --ignored --exclude-standard -z` **[doc]**. No teste, `--ignored=matching -z` devolveu `? .gitignore` e `! ign.log` como esperado **[teste]**.
- Qualquer linha `u`, qualquer linha `1`/`2` (alteração tracked, staged ou não) = **pasta suja**: o produto não atualiza.
- Linhas `?` e `!` só bloqueiam quando o caminho (ou um diretório pai/filho) é tocado pela entrega.

Cálculo dos caminhos tocados: `git diff-tree -r -z --no-renames --raw BASE APP` (modos e tipos incluídos).

Casos que o `status` esconde, mas que o pré-voo precisa tratar:

1. **Arquivo ignorado que a entrega cria/altera.** `merge --ff-only` sobrescreveu `x` (ignorado, conteúdo do operador) sem aviso; `reset --keep` e `read-tree -m -u` idem; `read-tree -n` (dry-run) também não avisa **[teste]**. `git checkout --[no-]overwrite-ignore` documenta "silently overwrite ignored files ... This is the default" e `--no-overwrite-ignore` aborta **[doc: git-checkout]**; o `git switch` expõe a mesma opção (`--[no-]overwrite-ignore`) e `switch -c --no-overwrite-ignore` recusou com "untracked working tree files would be overwritten" sem mudar a branch **[teste]**. Para a opção 1 não há flag equivalente no `merge`: a interseção deve ser feita pelo produto.
2. **`assume-unchanged` e `skip-worktree`.** O `status` ficou mudo com `assume-unchanged` e o arquivo continuava modificado; o `merge --ff-only` ainda recusou ("local changes would be overwritten") nos dois casos **[teste]**; a documentação diz que o Git "fails gracefully" quando precisa modificar o arquivo **[doc: git-update-index]**. Mesmo assim, listar `git ls-files -v -z` e tratar letras minúsculas (`h`) e `S` como sujeira/indeterminado quando o caminho for tocado pela entrega, para a recusa vir do produto com mensagem clara.
3. **Arquivo não rastreado que seria sobrescrito.** `merge`, `switch -c`, `reset --keep` e `read-tree -m -u` recusam sem alterar nada ("untracked working tree files would be overwritten") **[teste]**. Mesmo assim o pré-voo deve prever e dar mensagem própria.
4. **Alterações rastreadas sobrepostas.** Recusa sem alterar nada em `merge`, `switch -c`, `reset --keep`, `read-tree -m -u` **[teste]**. Alterações **não sobrepostas** são preservadas, mas o produto deve ser mais rígido que o Git e recusar qualquer sujeira rastreada (decisão de política, ver seção 9).
5. **Alteração staged não sobreposta.** `merge --ff-only` aceitou e preservou o arquivo staged **[teste]**, mas a doc diz que o `merge` normalmente aborta quando o índice difere do `HEAD` **[doc: git-merge]**; tratar como suja mesmo assim.
6. **Submódulos.** `--ignore-submodules=none` (já usado em `observe`) torna visível mudança de commit, modificado ou não rastreado **[doc]**. `switch`/`checkout` só atualizam o conteúdo do submódulo com `--recurse-submodules`; sem isso o conteúdo não é atualizado **[doc: git-switch]**. Recomendação: se a entrega altera um gitlink (modo `160000` no `diff-tree`), **recusar** (fora do escopo) e sempre passar `--no-recurse-submodules` nas escritas.
7. **Symlinks, modo executável e nomes inválidos no NTFS.** `core.symlinks=false` escreve symlink como arquivo comum **[doc: git-config]**; `core.protectNTFS` é `true` por padrão no Windows e recusa caminhos problemáticos (por exemplo nomes 8.3) **[doc: Git for Windows]**. Se a entrega contém entrada `120000` ou nome que o Windows rejeita (`con`, `aux`, terminadores `.`/espaço, `:`), recusar antes de começar (o `observe` já rejeita `\` e `:` nos caminhos existentes).
8. **Filtros (clean/smudge, Git LFS) e `working-tree-encoding`.** Um `filter=` no `.gitattributes` sem driver na configuração vira **passagem direta, sem erro**, a menos que `filter.<driver>.required=true` **[doc: gitattributes]**. Como o produto isola a configuração global, o driver de LFS do operador some: o checkout poderia gravar o ponteiro LFS no lugar do conteúdo real **[não verificado]**. Recomendação: detectar `filter`/`working-tree-encoding` nos caminhos tocados (`git check-attr -z --stdin filter working-tree-encoding`) e recusar a entrega até existir decisão explícita.
9. **Árvore esparsa.** `core.sparseCheckout`/`skip-worktree` fazem o `read-tree` adicionar ou remover arquivos conforme o padrão **[doc: git-read-tree]**; se o repositório usa sparse checkout, recusar.

### 3.3 Dry-run

`git read-tree -n -m -u BASE APP` simulou corretamente a recusa por arquivo rastreado sujo e por não rastreado sobreposto, sem alterar nada, mas **não** acusa arquivo ignorado **[teste]**; a documentação define `-n` apenas como "Check if the command would error out, without updating the index or the files" **[doc: git-read-tree]**. Pode ser usado como segunda barreira, nunca como a única.

## 4. Sequência para cada opção

### 4.1 Branch em checkout (avançar a branch ativa)

Pré-condição: o commit aprovado `APP` tem como pai o `HEAD` observado (`BASE`), a branch ativa é a esperada e o pré-voo da seção 3 passou.

```
git --no-optional-locks <config da seção 5> merge --ff-only --no-autostash --no-edit --quiet <APP-sha>
```

Por que `merge --ff-only` e não as alternativas:

| Alternativa | Avaliação |
|---|---|
| `merge --ff-only` | Recusa se não houver fast-forward **[doc]**; recusa sobreposição com alteração rastreada e com não rastreados **[teste]**; recusa com `MERGE_HEAD`/`CHERRY_PICK_HEAD` **[teste]**; faz checkout do working tree e do índice **antes** de mover a ref (numa falha no meio, o `HEAD` ficou onde estava) **[teste]**. Sobrescreve ignorados em silêncio **[teste]**. |
| `reset --keep APP` | Mesma proteção de sobreposição e não rastreados **[teste]**, mas também sobrescreve ignorados **[teste]** e é destrutivo por natureza (um deslize de flag vira `--hard`). Sem vantagem. |
| `read-tree -m -u BASE APP` + `update-ref` | Dois passos, com a ref e o checkout podendo divergir se o processo cair entre eles **[teste]** (sem o `-u` a ref anda e o índice/arquivos ficam no estado antigo, aparecendo como alteração revertida). Só vale como ferramenta do reconciliador, não como caminho principal. |
| `update-ref` sozinho (hoje) | Move a ref sem tocar o índice nem os arquivos: o `status` passa a mostrar a entrega inteira como alteração "revertida" staged **[teste]**. Exatamente o que a issue quer evitar. |
| `--autostash`/`switch --merge` | Rejeitar: reaplica alterações do operador por cima e pode gerar conflito difícil de reverter **[doc: git-merge]**. |

Um `--no-verify` não ajuda aqui: ele só pula `pre-merge-commit`/`commit-msg`, e não menciona `post-merge` **[doc: git-merge, githooks]**; hooks se desligam pela configuração (seção 6).

### 4.2 Branch nova

```
git --no-optional-locks <config da seção 5> switch --no-guess --no-recurse-submodules --no-overwrite-ignore -c <nome> <APP-sha>
```

- `-c` só cria a branch se o `switch` for bem-sucedido **[doc: git-switch]**; **atenção**: isso falhou na prática. Com arquivo travado (`FileShare.Read`) o Git emitiu `unable to unlink old 'b.txt'` mas **terminou criando e entrando na branch nova**, deixando `b.txt` no conteúdo antigo (` .M b.txt`) **[teste]**. Logo `exit code 0` não prova que o working tree está completo; sempre verificar (seção 7).
- `--no-guess` evita que o nome vire rastreamento de remoto **[doc]**; `-c` (e não `-C`) garante que uma branch já existente não seja redefinida **[doc]**.
- Recusa sobreposição com rastreado alterado e com não rastreado, sem criar a branch **[teste]**.
- O `switch` sem `-f`/`--discard-changes`/`--merge` nunca descarta alterações **[doc]**. Nunca passar essas flags.
- Idempotência: repetir `switch -c <nome>` quando a branch já existe falha com `fatal: a branch named ... already exists` **[teste]**. O reconciliador deve usar `rev-parse` na ref, não reexecutar o comando.

### 4.3 Quando não há fast-forward

Se a pasta tem `HEAD` distinto do `base_sha` selado, não há fast-forward: o produto já trata como `DELIVERY_CHECKOUT_CHANGED`/`DELIVERY_BASE_CHANGED`. Não tentar merge não-fast-forward nem rebase automático nesta etapa.

## 5. EOL, autocrlf e `.gitattributes`

### 5.1 Como o Git decide

- `text` ligado normaliza para LF no índice; `text` desligado não converte; indefinido segue `core.autocrlf` **[doc: gitattributes]**.
- `eol=crlf`/`eol=lf` define a escrita no working tree e implica `text`; sem `eol` e sem `autocrlf`/`core.eol`, o padrão do `text` é `crlf` no Windows **[doc]**.
- `core.autocrlf=true` equivale a `text=auto` em todos os arquivos **[doc: git-config]**; `core.eol` define o EOL para arquivos marcados como texto **[doc]**; `core.safecrlf` verifica se a conversão é reversível **[doc]**.
- Trocar atributos exige renormalização (`git add --renormalize .`); até lá arquivos aparecem como alterados no `status` **[doc: gitattributes]**.

### 5.2 O que aconteceu nos testes

| Cenário | Resultado |
|---|---|
| Checkout do operador com `autocrlf=true` (arquivo `lf.txt` vira CRLF no disco), visto com `autocrlf=true` | `status` limpo **[teste]** |
| Mesmo arquivo, visto com a configuração isolada do produto (sem `autocrlf`) | ` .M lf.txt`, falso positivo de EOL **[teste]** |
| `.gitattributes` com `* text=auto eol=crlf` | arquivo CRLF no disco e `status` limpo mesmo sem nenhuma configuração **[teste]** (atributos do repositório sempre valem) |
| `git ls-files --eol` | mostra `i/lf w/crlf attr/text=auto eol=crlf`, útil para diagnóstico **[teste]** |

Ou seja, o falso positivo vem do **isolamento da configuração**, não do Git. Dois riscos relacionados: (a) o `workingStateHash` selado hoje usa `status` isolado, então qualquer arquivo CRLF do operador entra no hash como "modificado", e (b) escrever os arquivos da entrega sem `autocrlf` gera arquivos LF numa pasta CRLF, o que o `status` do operador não acusa com `autocrlf=true`, mas deixa EOL misturado.

### 5.3 Recomendação

1. Ler, da configuração **efetiva do operador** (uma leitura sem isolamento, só de chaves allowlist: `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.filemode`, `core.symlinks`, `core.ignorecase`, `core.longpaths`, `core.protectNTFS`), e reaplicar esses valores com `-c` em **todas** as chamadas de `status`, `merge` e `switch` do alvo, mantendo `GIT_CONFIG_GLOBAL=NUL`/`NOSYSTEM=1` para o resto. Registrar os valores no `local_identity` selado e recusar se mudarem entre a inspeção e a escrita.
2. Não tentar "consertar" EOL (`add --renormalize`, `core.autocrlf=false` forçado). Se, mesmo com a configuração do operador, houver alteração só de EOL (`git diff --ignore-cr-at-eol --quiet` indica que a diferença é só EOL), classificar como **pasta suja**, igual a qualquer outra alteração rastreada, e pedir ao operador que resolva.
3. Preferir comparar conteúdo pelo mecanismo do Git (`status`, `diff-index`, `ls-files --eol`) a comparar bytes; o `fileDigest` do `observe` continua útil para detectar que a pasta mudou entre inspeção e escrita, mas não para decidir "sujo".

## 6. Hooks, travas e caminhos longos no Windows

### 6.1 Hooks

Sem nenhuma proteção, o `merge --ff-only` disparou `reference-transaction` (preparing/prepared/committed), `post-merge` e `post-index-change`; o `switch -c` disparou `reference-transaction`, `post-checkout` (com os dois SHAs e flag `1`) e `post-index-change`; o `read-tree -m -u` disparou `post-index-change` **[teste]**. Documentação: `post-checkout` e `post-merge` não alteram o resultado do comando, mas o código de saída do hook de `post-checkout` vira o do `checkout`/`switch` **[doc: githooks]**; `reference-transaction` pode **abortar** a transação em `preparing`/`prepared` **[doc]**. Hooks sem bit executável são ignorados **[doc]**. `--no-verify` só vale para `pre-merge-commit`/`commit-msg` **[doc]**.

Desligar com `-c core.hooksPath=<valor>`. Os três formatos testados funcionaram e nenhum hook disparou: valor vazio (`core.hooksPath=`), diretório vazio existente e `NUL` **[teste]**. O `integration.ts` do produto já usa `-c core.hooksPath=`. Recomendação: usar um **diretório vazio gerenciado** (por exemplo em `var/factory/...`), que não depende de como o Git for Windows traduz `NUL`/`/dev/null`, e passar sempre como `-c` (a configuração isolada não remove `core.hooksPath` gravado no `.git/config` do repositório, mas `-c` na linha de comando tem precedência). Anotação: o `-c` não impede um `fsmonitor` configurado como hook; passar também `-c core.fsmonitor=false` **[não verificado]**.

### 6.2 Arquivos travados por IDE/antivírus

O Git for Windows repete `unlink`, `rmdir` e `rename` automaticamente com esperas fixas `{0, 1, 10, 20, 40}` ms em `ERROR_SHARING_VIOLATION`/`ERROR_ACCESS_DENIED`; depois só pergunta "Should I try again?" se `stdin` e `stderr` são terminais (ou se `GIT_ASK_YESNO` estiver definido). Em execução não interativa não há nova tentativa e não há configuração para o número de tentativas **[doc: compat/mingw.c, Git for Windows]**.

Resultados dos testes com um arquivo `b.txt` aberto por outro processo:

| Trava | Efeito do `merge --ff-only` | Estado deixado |
|---|---|---|
| `FileShare.None` | falha na checagem de sujeira, antes de escrever ("local changes would be overwritten") | nada alterado **[teste]** |
| `FileShare.Read` (como um leitor/antivírus) | `error: open("b.txt"): Permission denied`, `unable to unlink old 'b.txt'` | **parcial**: `HEAD` e índice no estado antigo, `a.txt` e `c.txt` já com o conteúdo novo (aparecem como ` .M`), `b.txt` com o conteúdo antigo **[teste]** |
| `FileShare.Read` com `read-tree -m -u` | idem, parcial | ` .M` nos já escritos **[teste]** |
| `FileShare.Read` com `switch -c` | branch criada e ativa, `b.txt` antigo | `HEAD`/índice no alvo, ` .M b.txt` **[teste]** |

Consequências: (a) o pré-voo não detecta trava, só a escrita; (b) falha do comando **não** quer dizer "nada mudou", é preciso classificar o estado (seção 7); (c) tentar de novo logo depois bloqueia com "local changes would be overwritten", porque os arquivos já escritos parecem alteração do operador. Mitigação: o produto pode abrir cada caminho a escrever com leitura exclusiva antes (sondagem), mas isso não elimina a corrida; a defesa real é o reconciliador.

### 6.3 Caminhos longos

Sem `core.longpaths`, o `merge --ff-only` de um caminho absoluto de 426 caracteres falhou com `fatal: cannot create directory ... Filename too long` e não mudou a ref; com `-c core.longpaths=true` funcionou, com `LongPathsEnabled=1` no registro **[teste]**. `core.longpaths` é opção do Git for Windows, desligada por padrão, que habilita caminhos acima de 260 caracteres nos comandos internos **[doc: Git for Windows, config/core]**. Recomendação: passar `-c core.longpaths=true` em toda escrita e **também** validar no pré-voo o comprimento do caminho absoluto de cada arquivo tocado; acima de 260 sem `LongPathsEnabled` do sistema operacional, recusar com mensagem clara, porque ferramentas do operador (IDE, Explorer) podem não abrir o arquivo. Binários externos (hooks de terceiros, antivírus) seguem o limite do sistema, não o do Git.

## 7. Idempotência e reconciliação após interrupção

A escrita do working tree não é atômica: é uma sequência de arquivos, depois índice, depois ref (no `merge`) ou ref e depois arquivos (no `switch -c`, a ordem observada no teste de falha foi branch criada mesmo com falha em um arquivo). Portanto "o comando saiu com erro" ou "o processo morreu" são sempre `unknown` até o reconciliador observar.

### 7.1 O que observar (somente leitura, `--no-optional-locks`)

Com `BASE` (SHA esperado antes), `APP` (SHA aprovado), `TREE_APP` (`APP^{tree}`) e o conjunto `P` de caminhos tocados (`diff-tree BASE APP`):

| Observação | Comando |
|---|---|
| Branch atual e SHA | `symbolic-ref --quiet HEAD`, `rev-parse --verify HEAD^{commit}` |
| SHA da ref esperada (branch nova) | `rev-parse --verify --quiet --end-of-options refs/heads/<nome>` |
| Índice igual a `APP`? | `diff-index --cached --quiet APP --` (código 0 = igual); equivalente a comparar `write-tree` com `TREE_APP` (grava objeto de árvore, evitar em estado conflitado) |
| Working tree igual ao índice? | `diff-files --quiet` e `status --porcelain=v2 -z` sem linhas `1`, `2`, `u` nos caminhos de `P` |
| Cada caminho de `P` tem o conteúdo do alvo? | `git hash-object --path=<p> <p>` (aplica filtros/EOL) contra `rev-parse APP:<p>` |
| Operação ou lock pendente | lista da seção 3.1 |

### 7.2 Classificação

| Estado | HEAD/ref | Índice | Working tree | Resultado |
|---|---|---|---|---|
| A. Intacto | em `BASE` (branch nova inexistente) | = `BASE` | = pré-estado selado | `failed_known`, seguro repetir |
| B. Concluído | em `APP` | = `APP` | limpo nos caminhos de `P` | `confirmed` (recibo com `APP`, branch, `TREE_APP`) |
| C. Escrita parcial no merge | em `BASE` | = `BASE` | parte de `P` já com conteúdo de `APP`, parte antiga | `unknown` reparável |
| D. Ref movida, arquivos não (branch nova com falha, ou `update-ref`) | em `APP` | = `APP` ou `BASE` | caminhos de `P` com conteúdo antigo | `unknown` reparável |
| E. Qualquer outra combinação, ou caminho de `P` com conteúdo diferente de `BASE` e de `APP` (edição do operador no meio) | qualquer | qualquer | qualquer | `unknown` não reparável: parar, mostrar ao operador |

Em C o reconciliador só pode reparar se, para **todo** caminho sujo, o conteúdo no disco for exatamente o do pré-estado selado (`BASE`) ou o de `APP`. Se algum diferir dos dois, é edição do operador: estado E.

### 7.3 Reparo (testado)

Estado C (merge parcial, trava depois liberada), partindo de `HEAD=BASE`, índice `=BASE`, `a.txt`/`c.txt` já novos, `b.txt` antigo, mais uma edição do operador em `d.txt`:

```
git reset --mixed APP                         # move HEAD+ref e índice para APP; não toca nos arquivos
git restore --worktree --source=APP -- <caminhos de P ainda com conteúdo antigo>
```

Resultado: `HEAD=APP`, `b.txt` restaurado, `a.txt`/`c.txt` limpos, e `d.txt` com a edição do operador preservada **[teste]**. Antes do `reset --mixed`, tentativas de `merge --ff-only` e de `read-tree -m` bloquearam com "local changes would be overwritten" e "Entry not uptodate" **[teste]**, por isso o reparo não pode reutilizar o comando original. Só executar o reparo depois de provar a condição da seção 7.2 (nenhum caminho sujo fora de `BASE`/`APP`); `reset --mixed` não descarta nada no disco, mas mover a ref sem essa prova mascararia edição do operador.

Estado D: `restore --worktree --source=APP -- <caminhos pendentes>` (somente se o conteúdo atual é o de `BASE`) e, se necessário, `reset --mixed APP` para alinhar o índice.

Idempotência dos comandos: `merge --ff-only APP` quando `HEAD==APP` devolve "Already up to date." com código 0 **[teste]**; aceitou também o caso de índice que já tem o conteúdo de `APP` para um arquivo **[teste]**. Para branch nova, nunca reexecutar `switch -c`; consultar a ref.

### 7.4 Integração com o modelo `confirmed`/`unknown`

- Gravar a intenção antes da mutação (já existe `mutationStarted` e `authorize()`), incluindo `BASE`, `APP`, `P` e o hash do pré-estado do working tree por caminho de `P`.
- Depois de qualquer saída (sucesso, erro, timeout, queda do processo) rodar sempre `reconcileLocalCommit`, estendido para: ref no alvo + índice = `TREE_APP` + working tree limpo em `P` + sem arquivos pendentes (`lock`, `rebase-*`, `MERGE_HEAD`). Só então `confirmed`.
- O `working_state_hash` selado só vale **antes** da escrita; depois dela o estado esperado é "árvore de `APP` + ref no alvo". Guardar também o hash esperado pós-estado para o `verifyDeliveryTarget` posterior.
- Se o reparo automático não for seguro (estado E), o efeito permanece `unknown` e a UI orienta o operador; nunca usar `reset --hard`, `checkout -f`, `clean` ou `stash` automático.

## 8. Quando a pasta está em uso pelo operador durante a escrita

Janela de corrida entre pré-voo e escrita: usar `observe` imediatamente antes (já feito) e deixar o próprio Git recusar sobreposição (testado), sem reimplementar a checagem. Para travar de fato a janela, não há mecanismo público: o `index.lock` do Git só existe durante o comando. Aceitar a janela, com recusa segura (nada perdido nos casos testados) em vez de tentar bloqueio próprio. Fechar a janela totalmente **[não verificado]** exigiria uma trava cooperativa que o operador/IDE não respeitaria.

## 9. Recomendação final por opção

### Branch em checkout

1. Pré-voo completo (seções 3 e 5.3): sem operação pendente nem `index.lock`; `HEAD`/branch/`BASE` conforme selado; `status` sem nenhuma linha `1`/`2`/`u` com a configuração de EOL do operador; sem submódulo, symlink, filtro, sparse, `assume-unchanged`/`skip-worktree` nos caminhos tocados; nenhum caminho tocado coincide com não rastreado ou **ignorado**; comprimentos de caminho ok.
2. `git -c core.hooksPath=<dir vazio> -c core.longpaths=true -c core.autocrlf=... -c core.eol=... --no-optional-locks merge --ff-only --no-autostash --no-edit --quiet <APP>` com `GIT_TERMINAL_PROMPT=0`, sem stdin.
3. Reconciliar sempre (seção 7); `confirmed` só com ref, índice e árvore conferindo.
4. Política mais rígida que a do Git: recusar qualquer sujeira rastreada, mesmo não sobreposta, para manter a atualização explicável ao operador; relaxar depois com decisão consciente.

### Branch nova

1. Mesmo pré-voo. Como a branch ativa não muda de commit, a diferença é que o `HEAD` pode ser qualquer um; exigir `BASE == HEAD` (ou que `BASE` seja ancestral e a árvore de `BASE` seja a que o operador vê), senão o `switch` pode misturar alterações.
2. `git switch --no-guess --no-recurse-submodules --no-overwrite-ignore -c <nome> <APP>` com as mesmas opções de configuração. É a opção com **mais proteção nativa** (recusa ignorados) e a de menor risco de perda.
3. A ordem observada de falha deixa a branch criada mesmo com erro de escrita; reconciliar pelo estado D (restaurar apenas caminhos pendentes) ou, se o operador desistir, voltar com `git switch -` (sem `--discard-changes`) e remover a branch **somente** se `APP` ainda for o seu tip e ninguém a usou.
4. A branch fica em checkout: avisar que a branch anterior segue intacta, sem commits do produto.

### Perguntas em aberto para a issue pai

- Decidir se alteração rastreada não sobreposta deve ser tolerada (o Git tolera; este documento recomenda recusar).
- Decidir o tratamento de repositórios com LFS/filtros (recusar vs. usar a configuração do operador para o filtro).
- Confirmar em outra versão do Git for Windows (a testada é 2.55.0.windows.2) a ordem de escrita do `switch -c` e a recusa de `--no-overwrite-ignore`.

## Fontes

Documentação oficial do Git (git-scm.com/docs):

- `git-merge`: `--ff-only`, comportamento com alterações locais, índice versus `HEAD`, `--autostash`, `--no-verify` (`pre-merge-commit` e `commit-msg`).
- `git-read-tree`: tabela de "Two Tree Merge", `-m`, `-u`, `-n`, `--reset`, sparse checkout.
- `git-switch` e `git-checkout`: recusa por alterações locais, `-c/-C`, `--no-guess`, `--discard-changes`, `--merge`, `--[no-]overwrite-ignore` ("silently overwrite ignored files ... default"), `--recurse-submodules`.
- `git-status`: formato `--porcelain=v2`, tipos `1/2/u/?/!`, campo `<sub>`, `--ignored`, `--untracked-files`, `--ignore-submodules`, `-z`, `--no-optional-locks`.
- `git-update-index`: `--refresh`, `--assume-unchanged`, `--skip-worktree` e as ressalvas.
- `git-update-ref`: verificação do valor antigo, `--no-deref`, transações `--stdin`.
- `git-worktree`: `list --porcelain`, recusa de branch em uso por outro worktree.
- `githooks`: `post-checkout`, `post-merge`, `reference-transaction`, `post-index-change`, `core.hooksPath`.
- `gitattributes`: `text`, `eol`, `text=auto`, renormalização, `filter` (driver ausente vira passagem direta), `working-tree-encoding`.
- `git-config` (fonte `Documentation/config/core.adoc`): `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.symlinks`, `core.hooksPath`, `core.protectNTFS`.
- `git(1)`: `--no-optional-locks`/`GIT_OPTIONAL_LOCKS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM`, `GIT_TERMINAL_PROMPT`.

Git for Windows (github.com/git-for-windows/git):

- `Documentation/config/core.adoc`: `core.longpaths` (desligado por padrão, habilita caminhos acima de 260 caracteres), `core.fscache`, `core.protectNTFS` (padrão `true` no Windows).
- `compat/mingw.c`: `retry_ask_yes_no`, `ask_yes_no_if_possible`, `is_file_in_use_error`, `mingw_unlink`/`mingw_rmdir`/`mingw_rename` (esperas `{0,1,10,20,40}` ms; pergunta só com terminal; `GIT_ASK_YESNO`).

Código do produto lido: `apps/controller/src/modules/workspaces/delivery-target.ts` (`observe`, `createLocalCommit`, `reconcileLocalCommit`, `verifyWorkingState`), `apps/controller/src/modules/workspaces/git.ts` (isolamento com `GIT_CONFIG_GLOBAL=NUL`, `GIT_CONFIG_NOSYSTEM=1`) e `apps/controller/src/modules/workspaces/integration.ts` (uso de `-c core.hooksPath=`).
