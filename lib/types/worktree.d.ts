/**
 * Pure worktree planning: name grammar, path composition, and the
 * `.git/info/exclude` maintenance rule. No I/O here — the routes own every
 * effect, this module owns the decisions so tests can pin them without git.
 * @module dsh-worktree-jump/worktree
 */
import { isAbsolute, join, relative } from 'node:path';
/** Directory (inside the repository) this plugin creates worktrees under by default. */
export declare const DEFAULT_WORKTREE_DIRNAME = ".worktrees";
/** One planned worktree creation. */
export interface WorktreePlan {
    /** Absolute root the worktree directory lives under. */
    readonly worktreeRoot: string;
    /** Absolute worktree directory (`git worktree add` target). */
    readonly worktreePath: string;
    /** Branch to create and check out (the validated name). */
    readonly branch: string;
    /**
     * Exclude-line (repo-root-relative, forward slashes, trailing slash) to keep
     * the worktree directory out of git status, or undefined when the worktree
     * root sits outside the repository and nothing must be excluded.
     */
    readonly excludeEntry: string | undefined;
    /** Absolute `.git/info/exclude` path of the main worktree. */
    readonly excludeFile: string;
}
/**
 * Validate one requested worktree name.
 * @param name - raw client-supplied name.
 * @returns the validated name.
 * @throws when the name is not a single safe filesystem and git segment.
 */
export declare function validateWorktreeName(name: string): string;
/**
 * Plan one worktree creation from the repository facts and configuration.
 * The default root is `<repoRoot>/.worktrees` (kept out of git through the
 * repository-local `.git/info/exclude`, so no tracked file is touched); an
 * explicit config root outside the repository excludes nothing.
 * @param repoRoot - absolute repository working-tree root.
 * @param gitDir - absolute main-worktree `.git` directory from rev-parse.
 * @param name - validated worktree name.
 * @param configRoot - configured worktree root, or undefined for the default.
 * @returns the creation plan.
 */
export declare function planWorktree(repoRoot: string, gitDir: string, name: string, configRoot: string | undefined): WorktreePlan;
/**
 * Whether the exclude file already ignores the worktree directory, matching
 * the exact entry {@link planWorktree} would add (line-trimmed compare).
 * @param content - current exclude file text, or undefined when absent.
 * @param entry - the directory entry with trailing slash.
 * @returns true when the entry is already present.
 */
export declare function excludeContains(content: string | undefined, entry: string): boolean;
/**
 * Build the full exclude-file text after appending the entry, preserving
 * trailing-newline shape and adding a provenance comment once.
 * @param content - current exclude file text, or undefined when absent.
 * @param entry - the directory entry with trailing slash.
 * @returns the complete new file text; unchanged when the entry already exists.
 */
export declare function withExcludeEntry(content: string | undefined, entry: string): string;
/** Convert one path to forward slashes for display and wire payloads. */
declare function toPosix(value: string): string;
/** Re-exported path helpers the routes reuse. */
export { isAbsolute, join, relative, toPosix };
