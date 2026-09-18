/**
 * Browser state and HTTP carrier for the worktree button: per-cwd status
 * caching and the create call. Failures surface through the dialog, never as
 * broken chrome; an unreachable host reads as "not a git repo" (no button).
 * @module worktree-jump/client/controller
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import { type WorktreeCreateValue, type WorktreeStartValue, type WorktreeStatusPayload } from '../shared.ts';
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
/** One failed create: the HTTP status plus the server's structured code. */
export declare class WorktreeHttpError extends Error {
    readonly status: number;
    readonly code: string | undefined;
    /**
     * @param status - HTTP status of the failed create.
     * @param code - the server's structured error code, when present.
     * @param message - server message, when present.
     */
    constructor(status: number, code: string | undefined, message: string | undefined);
}
/**
 * Browser state and HTTP carrier for the worktree button: the per-cwd status
 * cache (every Session header shares one truth) and the create POST.
 */
export declare class WorktreeController {
    private readonly fetcher;
    /** Published status per workspace directory; keyed by cwd, not session id. */
    readonly status: SnapshotStore<ReadonlyMap<string, WorktreeStatusPayload>>;
    /** In-flight status reads per cwd; concurrent readers share one fetch. */
    private readonly loading;
    /**
     * @param fetcher - HTTP carrier for the status read and the create POST.
     */
    constructor(fetcher?: Fetch);
    /**
     * Ensure a status read is running (or resolved) for one session's cwd.
     * Concurrent calls share the read; a failure publishes no entry, which the
     * button reads as "not a git repository".
     * @param sessionId - the current Session.
     * @param cwd - the session's workspace directory.
     * @returns resolution after the status is published or the read failed.
     */
    loadStatus(sessionId: string, cwd: string): Promise<void>;
    /**
     * Read the cached status for a workspace directory.
     * @param cwd - the session's workspace directory.
     * @returns the published status, or undefined before the first read lands.
     */
    statusOf(cwd: string): WorktreeStatusPayload | undefined;
    /**
     * Create the worktree and fork the conversation into it.
     * @param sessionId - the current Session.
     * @param name - worktree/branch name as typed (the host validates).
     * @returns the create value; rejects with {@link WorktreeHttpError} on failure.
     */
    create(sessionId: string, name: string): Promise<WorktreeCreateValue>;
    /**
     * Start the conversation inside an existing worktree directory.
     * @param sessionId - the current Session.
     * @param path - absolute existing worktree directory.
     * @returns the start value; rejects with {@link WorktreeHttpError} on failure.
     */
    start(sessionId: string, path: string): Promise<WorktreeStartValue>;
    /** Shared create/start answer handling: ok value or structured failure. */
    private parseCreateResponse;
    private runStatus;
    /** Publish one resolved status into the shared cache. */
    private publish;
}
export {};
