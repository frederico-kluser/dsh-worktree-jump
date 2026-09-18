/**
 * Pure worktree planning: name grammar, path composition, and the
 * `.git/info/exclude` maintenance rule. No I/O here — the routes own every
 * effect, this module owns the decisions so tests can pin them without git.
 * @module dsh-worktree-jump/worktree
 */
import { isAbsolute, join, relative } from 'node:path';
import { WORKTREE_NAME_PATTERN } from "./shared.js";
/** Directory (inside the repository) this plugin creates worktrees under by default. */
export const DEFAULT_WORKTREE_DIRNAME = '.worktrees';
/**
 * Validate one requested worktree name.
 * @param name - raw client-supplied name.
 * @returns the validated name.
 * @throws when the name is not a single safe filesystem and git segment.
 */
export function validateWorktreeName(name) {
    if (!WORKTREE_NAME_PATTERN.test(name)) {
        throw new Error('invalid worktree name: use 1-64 characters, letters/digits first, '
            + 'then letters, digits, dots, underscores, or hyphens; no slashes or spaces');
    }
    if (name === '.' || name === '..')
        throw new Error('invalid worktree name: "." and ".." are reserved');
    return name;
}
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
export function planWorktree(repoRoot, gitDir, name, configRoot) {
    const worktreeRoot = configRoot ?? join(repoRoot, DEFAULT_WORKTREE_DIRNAME);
    const worktreePath = join(worktreeRoot, name);
    const rel = relative(repoRoot, worktreeRoot);
    const insideRepo = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    return {
        worktreeRoot,
        worktreePath,
        branch: name,
        excludeEntry: insideRepo ? toPosix(rel) + '/' : undefined,
        excludeFile: join(gitDir, 'info', 'exclude'),
    };
}
/**
 * Whether the exclude file already ignores the worktree directory, matching
 * the exact entry {@link planWorktree} would add (line-trimmed compare).
 * @param content - current exclude file text, or undefined when absent.
 * @param entry - the directory entry with trailing slash.
 * @returns true when the entry is already present.
 */
export function excludeContains(content, entry) {
    if (content === undefined)
        return false;
    return content.split('\n').some(line => line.trim() === entry);
}
/**
 * Build the full exclude-file text after appending the entry, preserving
 * trailing-newline shape and adding a provenance comment once.
 * @param content - current exclude file text, or undefined when absent.
 * @param entry - the directory entry with trailing slash.
 * @returns the complete new file text; unchanged when the entry already exists.
 */
export function withExcludeEntry(content, entry) {
    if (excludeContains(content, entry))
        return content ?? '';
    const marker = '# added by dsh-worktree-jump (created worktrees live here)';
    if (content === undefined || content.trim() === '') {
        return `${marker}\n${entry}\n`;
    }
    const needsNewline = !content.endsWith('\n');
    return `${content}${needsNewline ? '\n' : ''}${marker}\n${entry}\n`;
}
/** Convert one path to forward slashes for display and wire payloads. */
function toPosix(value) {
    return value.split('\\').join('/');
}
/** Re-exported path helpers the routes reuse. */
export { isAbsolute, join, relative, toPosix };
//# sourceMappingURL=worktree.js.map