/**
 * `worktree-jump` namespace dictionaries. `pt` is the primary reader's
 * language; `en` is the required fallback. Key sets stay identical.
 * @module worktree-jump/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'worktree-jump'

/** English dictionary (fallback of every chain). */
export const en = {
  'button.label': 'New worktree',
  'button.tooltip': 'Create a new git worktree from {repo} and start the conversation inside it',
  'button.aria': 'Create a new git worktree and start this conversation inside it',
  'dialog.title': 'Create a worktree',
  'dialog.description': 'Creates a git worktree and a branch named after it, then starts this conversation inside it.',
  'dialog.name.label': 'Worktree name',
  'dialog.name.placeholder': 'my-feature',
  'dialog.name.hint': 'Letters, digits, dots, underscores, hyphens. A branch with the same name is created from HEAD.',
  'dialog.existing': 'Existing worktrees',
  'dialog.submit': 'Create and start',
  'dialog.creating': 'Creating…',
  'dialog.cancel': 'Cancel',
  'dialog.cwd': 'Repository',
  'error.invalid-name': 'Invalid name: use 1–64 letters, digits, dots, underscores or hyphens (no slashes or spaces).',
  'error.worktree-exists': 'A worktree with that name already exists.',
  'error.branch-exists': 'A branch with that name already exists.',
  'error.not-git-repo': 'The selected folder is not inside a git repository.',
  'error.fork-unavailable': 'Could not start the conversation in the worktree.',
  'error.generic': 'The worktree could not be created.',
} as const

/** Portuguese dictionary, key-identical to the English source. */
export const pt = {
  'button.label': 'Nova worktree',
  'button.tooltip': 'Criar nova git worktree a partir de {repo} e começar a conversa dentro dela',
  'button.aria': 'Criar uma nova git worktree e começar esta conversa dentro dela',
  'dialog.title': 'Criar uma worktree',
  'dialog.description': 'Cria uma git worktree e um branch com o nome dela, e começa esta conversa dentro dela.',
  'dialog.name.label': 'Nome da worktree',
  'dialog.name.placeholder': 'minha-feature',
  'dialog.name.hint': 'Letras, números, pontos, underscores e hífens. Um branch com o mesmo nome é criado a partir do HEAD.',
  'dialog.existing': 'Worktrees existentes',
  'dialog.submit': 'Criar e começar',
  'dialog.creating': 'Criando…',
  'dialog.cancel': 'Cancelar',
  'dialog.cwd': 'Repositório',
  'error.invalid-name': 'Nome inválido: use 1–64 letras, números, pontos, underscores ou hífens (sem barras ou espaços).',
  'error.worktree-exists': 'Já existe uma worktree com esse nome.',
  'error.branch-exists': 'Já existe um branch com esse nome.',
  'error.not-git-repo': 'A pasta escolhida não está dentro de um repositório git.',
  'error.fork-unavailable': 'Não foi possível começar a conversa na worktree.',
  'error.generic': 'Não foi possível criar a worktree.',
} as const

/** Key domain of the `worktree-jump` namespace (English is the source of truth). */
export type WorktreeJumpKey = keyof typeof en
