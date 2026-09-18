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
    readonly worktreeRoot?: string;
    /** Per-git-command deadline in milliseconds. */
    readonly gitTimeoutMs: number;
}
/** Validate one unknown config record; every violation rejects the load. */
export declare function parseWorktreeJumpConfig(input: unknown): WorktreeJumpConfig;
