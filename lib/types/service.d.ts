/**
 * Host business operations for the worktree routes: the status read and the
 * create flow (plan → exclude → worktree add → session fork → workspace
 * attach). This module owns every effect; `routes.ts` only unwraps HTTP.
 * @module dsh-worktree-jump/service
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type SubprocessRuntimeLike } from './git.ts';
import { type ForkHost } from './fork.ts';
import type { SessionQueryEngineLike } from './host-services.ts';
import { type WorktreePlan } from './worktree.ts';
import type { WorktreeInfo } from './shared.ts';
/** Narrowed node:fs/promises surface, injectable for tests. */
export type FsLike = Pick<typeof import('node:fs/promises'), 'mkdir' | 'readFile' | 'writeFile'>;
/** The optional workspace capability: find-or-create a Workspace over a directory. */
export interface WorkspaceRegistryLike {
    /** Find-or-create a durable Workspace over an existing directory. */
    create(path: string): Promise<{
        readonly id: unknown;
        attachSession(sessionId: SessionId): Promise<void>;
    }>;
    /** Look up one workspace by id. */
    get(id: unknown): {
        attachSession(sessionId: SessionId): Promise<void>;
    } | undefined;
}
/** Full host capability set the business operations read through. */
export interface WorktreeHost {
    readonly subprocess: SubprocessRuntimeLike;
    readonly sessionQuery: SessionQueryEngineLike;
    readonly agents: ForkHost['agents'];
    readonly agentDefaultModel: {
        currentSelection(): {
            provider: string;
            model: string;
        };
    };
    readonly agentPresets: ForkHost['agentPresets'];
    /** Optional workspace capability; absence only skips sidebar grouping. */
    readonly workspaceRegistry: WorkspaceRegistryLike | undefined;
    readonly fs: FsLike;
    /** The host logger (property access, never injectable): the fork-failure
     * fallback logs its cause here so the real reason is diagnosable. */
    readonly logger?: {
        warn(...args: unknown[]): void;
    } | undefined;
}
/** Everything the routes learned about the session's repository. */
export interface RepoFacts {
    /** The session's workspace directory, when it declares one. */
    readonly cwd?: string;
    readonly isGitRepo: boolean;
    readonly repoRoot?: string;
    readonly gitDir?: string;
    readonly branch?: string;
    readonly worktreeRoot?: string;
    readonly worktrees: readonly WorktreeInfo[];
}
/**
 * Read the session's workspace repository facts: repo root, common git dir,
 * current branch, and the full worktree list. A session without a cwd, or
 * whose cwd is not inside a git working tree, reports `isGitRepo: false` —
 * the state the browser button hides on.
 * @param query - narrowed session-query engine.
 * @param subprocess - the composition's subprocess runtime.
 * @param sessionId - session whose workspace directory to inspect.
 * @param timeoutMs - per-git-command deadline.
 * @param configuredRoot - configured worktree root override, when set.
 * @returns the repository facts.
 */
export declare function repoFacts(query: SessionQueryEngineLike, subprocess: SubprocessRuntimeLike, sessionId: string, timeoutMs: number, configuredRoot: string | undefined): Promise<RepoFacts>;
/** Result of one successful create. */
export interface CreateOutcome {
    readonly plan: WorktreePlan;
    /** The forked continuation Session, or undefined when the fork failed and
     * the browser should start a fresh Session inside the workspace instead. */
    readonly childId: SessionId | undefined;
    /** The Workspace over the worktree (existing or newly created), when known. */
    readonly workspaceId: unknown;
    /** Whether the child Session was attached to that Workspace. */
    readonly workspaceAttached: boolean;
    /** Whether the fork succeeded; false means use the workspace fallback. */
    readonly forked: boolean;
}
/**
 * Create the worktree and fork the conversation into it, in that order so a
 * failed git step never leaves a forked Session behind.
 * @param host - the host capability set.
 * @param sessionId - session to transport.
 * @param name - worktree/branch name (already validated by the caller).
 * @param config - deployment configuration.
 * @returns the created plan, the child Session id, and grouping outcome.
 * @throws {ForkRejection} with code `no-workspace` when the session records no
 *   workspace directory, or `not-git-repo` when the directory is not a work tree.
 * @throws {GitFailureError} when a git step exits non-zero.
 * @throws {ForkRejection} when the fork pre-conditions fail.
 */
export declare function createWorktreeAndFork(host: WorktreeHost, sessionId: string, name: string, config: {
    worktreeRoot?: string;
    gitTimeoutMs: number;
}): Promise<CreateOutcome>;
/** Result of one successful start-from-existing. */
export interface StartOutcome {
    /** Plan-shaped view over the chosen worktree (no creation happened). */
    readonly plan: WorktreePlan;
    /** The forked continuation Session, or undefined when the fork failed and
     * the browser should start a fresh Session inside the workspace instead. */
    readonly childId: SessionId | undefined;
    /** The Workspace over the worktree (existing or newly created), when known. */
    readonly workspaceId: unknown;
    /** Whether the child Session was attached to that Workspace. */
    readonly workspaceAttached: boolean;
    /** Whether the fork succeeded; false means use the workspace fallback. */
    readonly forked: boolean;
}
/**
 * Start the conversation inside an existing worktree of the source's
 * repository: the child Session is forked from the source (a blank source
 * starts fresh) with its frozen creation `cwd` pointed at the chosen
 * worktree directory. The directory must be an existing git work tree; a
 * workspace is found-or-created over it for sidebar grouping, and an
 * attachment failure never fails the start.
 * @param host - the host capability set.
 * @param sessionId - session to transport.
 * @param worktreePath - absolute existing worktree directory.
 * @param config - deployment configuration.
 * @returns the chosen worktree view, the child Session id, and grouping outcome.
 * @throws {ForkRejection} `not-git-repo` when the directory is not a work tree.
 * @throws {ForkRejection} `no-workspace` when the session records no cwd.
 */
export declare function startInExistingWorktree(host: WorktreeHost, sessionId: string, worktreePath: string, config: {
    worktreeRoot?: string;
    gitTimeoutMs: number;
}): Promise<StartOutcome>;
/**
 * Resolve a session's workspace directory, rejecting unknown sessions and
 * sessions that record none.
 * @param query - narrowed session-query engine.
 * @param sessionId - wire-supplied session identity.
 * @returns the absolute workspace directory.
 * @throws {ForkRejection} when the session records no workspace directory.
 */
export declare function resolveWorkspaceDirectory(query: SessionQueryEngineLike, sessionId: string): Promise<string>;
/**
 * Read the session's workspace directory, or undefined when it records none.
 * Unknown sessions reject through the session-query engine.
 * @param query - narrowed session-query engine.
 * @param sessionId - session identity.
 * @returns the workspace directory, or undefined.
 */
export declare function workspaceOf(query: SessionQueryEngineLike, sessionId: string): Promise<string | undefined>;
/** Result of the inside-a-work-tree probe. */
interface InsideResult {
    readonly inside: boolean;
    readonly repoRoot: string;
    readonly gitDir: string;
}
/**
 * Probe whether a directory is inside a git working tree and resolve the
 * repository root plus the common `.git` directory (the worktree metadata
 * home, shared by every linked worktree of the repository).
 * @param subprocess - the composition's subprocess runtime.
 * @param cwd - directory to probe.
 * @param timeoutMs - per-command deadline.
 * @returns the probe result; `inside: false` when git rejects the directory.
 */
export declare function insideWorkTree(subprocess: SubprocessRuntimeLike, cwd: string, timeoutMs: number): Promise<InsideResult>;
/**
 * Parse `git worktree list --porcelain` into structured rows, in git's own
 * order (main worktree first).
 * @param porcelain - the command's stdout.
 * @returns one row per worktree block that carries a path.
 */
export declare function parseWorktreeList(porcelain: string): readonly WorktreeInfo[];
/**
 * List the repository's worktrees; a failing command reads as an empty list
 * (status display is best effort; creation re-fails loud on its own step).
 * @param subprocess - the composition's subprocess runtime.
 * @param repoRoot - repository root to list from.
 * @param timeoutMs - per-command deadline.
 * @returns the worktree rows.
 */
export declare function worktreeList(subprocess: SubprocessRuntimeLike, repoRoot: string, timeoutMs: number): Promise<readonly WorktreeInfo[]>;
/** Re-export so route code imports the plan type from one place. */
export type { WorktreePlan, WorktreeInfo };
