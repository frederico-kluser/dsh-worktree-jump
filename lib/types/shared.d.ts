/**
 * Wire contract shared by the host routes and the browser half: route paths,
 * payload types, and the worktree-name grammar. Types and constants only —
 * both halves import this file, so it must carry no runtime dependencies.
 * @module dsh-worktree-jump/shared
 */
/** Route prefix owned by this plugin on the composition's web server. */
export declare const WORKTREE_ROUTE_PREFIX = "/dsh-worktree";
/** Status read: is the session's workspace directory a git work tree. */
export declare const WORKTREE_STATUS_ROUTE = "/dsh-worktree/status";
/** Mutation: create a worktree and fork the session into it. */
export declare const WORKTREE_CREATE_ROUTE = "/dsh-worktree/create";
/** Mutation: start the conversation from an existing worktree directory. */
export declare const WORKTREE_START_ROUTE = "/dsh-worktree/start";
/** One existing git worktree of the session's repository. */
export interface WorktreeInfo {
    /** Absolute worktree directory. */
    readonly path: string;
    /** Checked-out branch, `(detached)`, or `(bare)`. */
    readonly branch: string;
    /** Commit the worktree currently points at, abbreviated. */
    readonly head: string;
}
/** Payload of `GET ${WORKTREE_STATUS_ROUTE}?sessionId=<id>`. */
export interface WorktreeStatusPayload {
    /** The session's workspace directory, when it declares one. */
    readonly cwd?: string;
    /** Whether the workspace directory lives inside a git working tree. */
    readonly isGitRepo: boolean;
    /** Repository root when {@link isGitRepo}, else absent. */
    readonly repoRoot?: string;
    /** Absolute main-worktree `.git` directory (worktree metadata home). */
    readonly gitDir?: string;
    /** Checked-out branch in the workspace directory, when resolvable. */
    readonly branch?: string;
    /** Absolute root where this plugin creates new worktrees. */
    readonly worktreeRoot?: string;
    /** Existing worktrees of the repository, main one first. */
    readonly worktrees?: readonly WorktreeInfo[];
}
/** Payload of `POST ${WORKTREE_CREATE_ROUTE}`. */
export interface WorktreeCreatePayload {
    /** Session to fork from; its workspace names the repository. */
    readonly sessionId: string;
    /** Worktree (and branch) name; matches {@link WORKTREE_NAME_PATTERN}. */
    readonly name: string;
}
/** Result of one successful create. */
export interface WorktreeCreateValue {
    readonly ok: true;
    /** The forked continuation Session; its cwd is the new worktree. */
    readonly sessionId: string;
    /** Absolute worktree directory. */
    readonly worktreePath: string;
    /** Branch checked out in the worktree. */
    readonly branch: string;
}
/** Payload of `POST ${WORKTREE_START_ROUTE}`: start from an existing worktree. */
export interface WorktreeStartPayload {
    /** Session to fork from; its repository must own the worktree. */
    readonly sessionId: string;
    /** Absolute existing worktree directory. */
    readonly path: string;
}
/** Result of one successful start-from-existing. */
export interface WorktreeStartValue {
    readonly ok: true;
    /** The forked continuation Session; its cwd is the chosen worktree. */
    readonly sessionId: string;
    /** Absolute worktree directory the conversation now runs in. */
    readonly worktreePath: string;
    /** Branch checked out in the chosen worktree. */
    readonly branch: string;
}
/**
 * Worktree/branch-name grammar the create route admits: one filesystem and
 * git-safe segment, no separators, no leading dot or dash, 1–64 chars.
 */
export declare const WORKTREE_NAME_PATTERN: RegExp;
/** Structured wire failures the routes answer with. */
export type WorktreeErrorCode = 'bad-request' | 'unauthorized' | 'session-not-found' | 'subagent-session' | 'no-workspace' | 'not-git-repo' | 'invalid-name' | 'worktree-exists' | 'branch-exists' | 'git-failed' | 'fork-unavailable' | 'create-failed';
/** Uniform JSON error body. */
export interface WorktreeErrorPayload {
    readonly code: WorktreeErrorCode;
    readonly message: string;
}
