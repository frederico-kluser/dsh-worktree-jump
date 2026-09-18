/**
 * `worktree-jump` namespace dictionaries. `pt` is the primary reader's
 * language; `en` is the required fallback. Key sets stay identical.
 * @module worktree-jump/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'worktree-jump'

/** English dictionary (fallback of every chain). */
export const en = {
  'button.tooltip': 'New git worktree (continues this conversation there)',
  'button.aria': 'Create a git worktree and move this conversation into it',
  'dialog.title': 'Create a worktree',
  'dialog.description': 'Creates a git worktree and a branch named after it, then moves this conversation there.',
  'dialog.name.label': 'Worktree name',
  'dialog.name.placeholder': 'my-feature',
  'dialog.name.hint': 'Letters, digits, dots, underscores, hyphens. A branch with the same name is created from HEAD.',
  'dialog.existing': 'Existing worktrees',
  'dialog.submit': 'Create and move',
  'dialog.creating': 'Creating…',
  'dialog.cancel': 'Cancel',
  'dialog.cwd': 'Repository',
  'error.invalid-name': 'Invalid name: use 1–64 letters, digits, dots, underscores or hyphens (no slashes or spaces).',
  'error.worktree-exists': 'A worktree with that name already exists.',
  'error.branch-exists': 'A branch with that name already exists.',
  'error.not-git-repo': 'This session\'s directory is not inside a git repository.',
  'error.fork-unavailable': 'Could not fork this conversation into the worktree.',
  'error.generic': 'The worktree could not be created.',
} as const

/** Portuguese dictionary, key-identical to the English source. */
export const pt = {
  'button.tooltip': 'Nova git worktree (continua esta conversa nela)',
  'button.aria': 'Criar uma git worktree e mover esta conversa para ela',
  'dialog.title': 'Criar uma worktree',
  'dialog.description': 'Cria uma git worktree e um branch com o nome dela, e move esta conversa para lá.',
  'dialog.name.label': 'Nome da worktree',
  'dialog.name.placeholder': 'minha-feature',
  'dialog.name.hint': 'Letras, números, pontos, underscores e hífens. Um branch com o mesmo nome é criado a partir do HEAD.',
  'dialog.existing': 'Worktrees existentes',
  'dialog.submit': 'Criar e mover',
  'dialog.creating': 'Criando…',
  'dialog.cancel': 'Cancelar',
  'dialog.cwd': 'Repositório',
  'error.invalid-name': 'Nome inválido: use 1–64 letras, números, pontos, underscores ou hífens (sem barras ou espaços).',
  'error.worktree-exists': 'Já existe uma worktree com esse nome.',
  'error.branch-exists': 'Já existe um branch com esse nome.',
  'error.not-git-repo': 'A pasta desta sessão não está dentro de um repositório git.',
  'error.fork-unavailable': 'Não foi possível forkar esta conversa para a worktree.',
  'error.generic': 'Não foi possível criar a worktree.',
} as const

/** Key domain of the `worktree-jump` namespace (English is the source of truth). */
export type WorktreeJumpKey = keyof typeof en
