/**
 * Deployment-varying configuration, parsed and validated fail-loud at load.
 * Hand validation keeps the host half free of bare runtime imports (the
 * plugin loads from an arbitrary filesystem location with no node_modules of
 * its own; type imports are erased).
 * @module dsh-worktree-jump/config
 */

/** Deployment-varying choices, all overridable from cordis.yml. */
export interface WorktreeJumpConfig {
  /**
   * Directory under which new worktrees are created. When absent (or null in
   * YAML), the default `<repoRoot>/.worktrees` applies per request, with the
   * directory excluded through `.git/info/exclude` (never a tracked file).
   */
  readonly worktreeRoot?: string
  /** Per-git-command deadline in milliseconds. */
  readonly gitTimeoutMs: number
}

const DEFAULT_GIT_TIMEOUT_MS = 30_000
const DEFAULT_CONFIG: WorktreeJumpConfig = { gitTimeoutMs: DEFAULT_GIT_TIMEOUT_MS }

/** Validate one unknown config record; every violation rejects the load. */
export function parseWorktreeJumpConfig(input: unknown): WorktreeJumpConfig {
  if (input === undefined || input === null) return { gitTimeoutMs: DEFAULT_CONFIG.gitTimeoutMs }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('worktree-jump: config must be an object')
  }
  const record = input as Record<string, unknown>
  const worktreeRoot = record['worktreeRoot']
  if (worktreeRoot !== undefined && worktreeRoot !== null) {
    if (typeof worktreeRoot !== 'string' || !worktreeRoot.startsWith('/')) {
      throw new Error('worktree-jump: config.worktreeRoot must be an absolute path when set')
    }
  }
  const gitTimeoutMs = record['gitTimeoutMs']
  if (gitTimeoutMs !== undefined) {
    if (typeof gitTimeoutMs !== 'number' || !Number.isSafeInteger(gitTimeoutMs)
      || gitTimeoutMs < 1 || gitTimeoutMs > 600_000) {
      throw new Error('worktree-jump: config.gitTimeoutMs must be a safe integer in [1, 600000]')
    }
  }
  return {
    ...(typeof worktreeRoot === 'string' ? { worktreeRoot } : {}),
    gitTimeoutMs: gitTimeoutMs ?? DEFAULT_CONFIG.gitTimeoutMs,
  }
}
