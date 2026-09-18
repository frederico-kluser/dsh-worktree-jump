/**
 * Wire contract shared by the host routes and the browser half: route paths,
 * payload types, and the worktree-name grammar. Types and constants only —
 * both halves import this file, so it must carry no runtime dependencies.
 * @module dsh-worktree-jump/shared
 */
/** Route prefix owned by this plugin on the composition's web server. */
export const WORKTREE_ROUTE_PREFIX = '/dsh-worktree';
/** Status read: is the session's workspace directory a git work tree. */
export const WORKTREE_STATUS_ROUTE = `${WORKTREE_ROUTE_PREFIX}/status`;
/** Mutation: create a worktree and fork the session into it. */
export const WORKTREE_CREATE_ROUTE = `${WORKTREE_ROUTE_PREFIX}/create`;
/**
 * Worktree/branch-name grammar the create route admits: one filesystem and
 * git-safe segment, no separators, no leading dot or dash, 1–64 chars.
 */
export const WORKTREE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
//# sourceMappingURL=shared.js.map