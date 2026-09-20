/**
 * `worktree-jump` namespace dictionaries. `pt` is the primary reader's
 * language; `en` is the required fallback. Key sets stay identical.
 * @module worktree-jump/client/locales
 */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "worktree-jump";
/** English dictionary (fallback of every chain). */
export declare const en: {
    readonly 'button.label': "New worktree";
    readonly 'button.tooltip': "Create a new git worktree from {repo} and start the conversation inside it";
    readonly 'button.aria': "Create a new git worktree and start this conversation inside it";
    readonly 'dialog.title': "Create a worktree";
    readonly 'dialog.description': "Creates a git worktree and a branch named after it, then starts this conversation inside it.";
    readonly 'dialog.name.label': "Worktree name";
    readonly 'dialog.name.placeholder': "my-feature";
    readonly 'dialog.name.hint': "Letters, digits, dots, underscores, hyphens. A branch with the same name is created from HEAD.";
    readonly 'dialog.existing': "Existing worktrees";
    readonly 'dialog.pick.existing': "Start the conversation inside an existing worktree instead";
    readonly 'dialog.submit': "Create and start";
    readonly 'dialog.creating': "Creating…";
    readonly 'dialog.cancel': "Cancel";
    readonly 'dialog.cwd': "Repository";
    readonly 'error.invalid-name': "Invalid name: use 1–64 letters, digits, dots, underscores or hyphens (no slashes or spaces).";
    readonly 'error.worktree-exists': "A worktree with that name already exists.";
    readonly 'error.branch-exists': "A branch with that name already exists.";
    readonly 'error.not-git-repo': "The selected folder is not inside a git repository.";
    readonly 'error.fork-unavailable': "Could not start the conversation in the worktree.";
    readonly 'error.generic': "The worktree could not be created.";
};
/** Portuguese dictionary, key-identical to the English source. */
export declare const pt: {
    readonly 'button.label': "Nova worktree";
    readonly 'button.tooltip': "Criar nova git worktree a partir de {repo} e começar a conversa dentro dela";
    readonly 'button.aria': "Criar uma nova git worktree e começar esta conversa dentro dela";
    readonly 'dialog.title': "Criar uma worktree";
    readonly 'dialog.description': "Cria uma git worktree e um branch com o nome dela, e começa esta conversa dentro dela.";
    readonly 'dialog.name.label': "Nome da worktree";
    readonly 'dialog.name.placeholder': "minha-feature";
    readonly 'dialog.name.hint': "Letras, números, pontos, underscores e hífens. Um branch com o mesmo nome é criado a partir do HEAD.";
    readonly 'dialog.existing': "Worktrees existentes";
    readonly 'dialog.pick.existing': "Começar a conversa dentro de uma worktree existente";
    readonly 'dialog.submit': "Criar e começar";
    readonly 'dialog.creating': "Criando…";
    readonly 'dialog.cancel': "Cancelar";
    readonly 'dialog.cwd': "Repositório";
    readonly 'error.invalid-name': "Nome inválido: use 1–64 letras, números, pontos, underscores ou hífens (sem barras ou espaços).";
    readonly 'error.worktree-exists': "Já existe uma worktree com esse nome.";
    readonly 'error.branch-exists': "Já existe um branch com esse nome.";
    readonly 'error.not-git-repo': "A pasta escolhida não está dentro de um repositório git.";
    readonly 'error.fork-unavailable': "Não foi possível começar a conversa na worktree.";
    readonly 'error.generic': "Não foi possível criar a worktree.";
};
/** Simplified Chinese dictionary, key-identical to the English source. */
export declare const zh: {
    readonly 'button.label': "新建工作树";
    readonly 'button.tooltip': "从 {repo} 创建新的 git 工作树，并在其中开始对话";
    readonly 'button.aria': "创建新的 git 工作树，并在其中开始此对话";
    readonly 'dialog.title': "创建工作树";
    readonly 'dialog.description': "创建 git 工作树以及以其命名的分支，然后在其中开始此对话。";
    readonly 'dialog.name.label': "工作树名称";
    readonly 'dialog.name.placeholder': "my-feature";
    readonly 'dialog.name.hint': "字母、数字、点、下划线和连字符。会从 HEAD 创建同名分支。";
    readonly 'dialog.existing': "已有工作树";
    readonly 'dialog.pick.existing': "改为在已有工作树中开始对话";
    readonly 'dialog.submit': "创建并开始";
    readonly 'dialog.creating': "创建中…";
    readonly 'dialog.cancel': "取消";
    readonly 'dialog.cwd': "仓库";
    readonly 'error.invalid-name': "名称无效：使用 1–64 个字母、数字、点、下划线或连字符（不含斜杠或空格）。";
    readonly 'error.worktree-exists': "已存在同名工作树。";
    readonly 'error.branch-exists': "已存在同名分支。";
    readonly 'error.not-git-repo': "所选文件夹不在 git 仓库内。";
    readonly 'error.fork-unavailable': "无法在工作树中开始对话。";
    readonly 'error.generic': "无法创建工作树。";
};
/** Key domain of the `worktree-jump` namespace (English is the source of truth). */
export type WorktreeJumpKey = keyof typeof en;
