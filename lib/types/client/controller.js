/**
 * Browser state and HTTP carrier for the worktree button: per-cwd status
 * caching and the create call. Failures surface through the dialog, never as
 * broken chrome; an unreachable host reads as "not a git repo" (no button).
 * @module worktree-jump/client/controller
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { WORKTREE_CREATE_ROUTE, WORKTREE_START_ROUTE, WORKTREE_STATUS_ROUTE, } from "../shared.js";
/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase() {
    const origin = globalThis.location?.origin;
    return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal';
}
/** One failed create: the HTTP status plus the server's structured code. */
export class WorktreeHttpError extends Error {
    status;
    code;
    /**
     * @param status - HTTP status of the failed create.
     * @param code - the server's structured error code, when present.
     * @param message - server message, when present.
     */
    constructor(status, code, message) {
        super(message ?? `HTTP ${String(status)}`);
        this.status = status;
        this.code = code;
        this.name = 'WorktreeHttpError';
    }
}
/**
 * Browser state and HTTP carrier for the worktree button: the per-cwd status
 * cache (every Session header shares one truth) and the create POST.
 */
export class WorktreeController {
    fetcher;
    /** Published status per workspace directory; keyed by cwd, not session id. */
    status = createSnapshotStore(new Map());
    /** In-flight status reads per cwd; concurrent readers share one fetch. */
    loading = new Map();
    /**
     * @param fetcher - HTTP carrier for the status read and the create POST.
     */
    constructor(fetcher = (input, init) => fetch(input, init)) {
        this.fetcher = fetcher;
    }
    /**
     * Ensure a status read is running (or resolved) for one session's cwd.
     * Concurrent calls share the read; a failure publishes no entry, which the
     * button reads as "not a git repository".
     * @param sessionId - the current Session.
     * @param cwd - the session's workspace directory.
     * @returns resolution after the status is published or the read failed.
     */
    loadStatus(sessionId, cwd) {
        const inflight = this.loading.get(cwd);
        if (inflight !== undefined)
            return inflight;
        const run = this.runStatus(sessionId, cwd).finally(() => { this.loading.delete(cwd); });
        this.loading.set(cwd, run);
        return run;
    }
    /**
     * Read the cached status for a workspace directory.
     * @param cwd - the session's workspace directory.
     * @returns the published status, or undefined before the first read lands.
     */
    statusOf(cwd) {
        return this.status.getSnapshot().get(cwd);
    }
    /**
     * Create the worktree and fork the conversation into it.
     * @param sessionId - the current Session.
     * @param name - worktree/branch name as typed (the host validates).
     * @returns the create value; rejects with {@link WorktreeHttpError} on failure.
     */
    async create(sessionId, name) {
        const response = await this.fetcher(new URL(WORKTREE_CREATE_ROUTE, hostBase()), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, name }),
        });
        return this.parseCreateResponse(response);
    }
    /**
     * Start the conversation inside an existing worktree directory.
     * @param sessionId - the current Session.
     * @param path - absolute existing worktree directory.
     * @returns the start value; rejects with {@link WorktreeHttpError} on failure.
     */
    async start(sessionId, path) {
        const response = await this.fetcher(new URL(WORKTREE_START_ROUTE, hostBase()), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, path }),
        });
        return this.parseCreateResponse(response);
    }
    /** Shared create/start answer handling: ok value or structured failure. */
    async parseCreateResponse(response) {
        const payload = (await response.json().catch(() => undefined));
        if (!response.ok || payload === undefined || !('ok' in payload)) {
            const failure = payload;
            throw new WorktreeHttpError(response.status, failure?.code, failure?.message);
        }
        return payload;
    }
    async runStatus(sessionId, cwd) {
        try {
            const url = new URL(WORKTREE_STATUS_ROUTE, hostBase());
            url.searchParams.set('sessionId', sessionId);
            const response = await this.fetcher(url, { headers: { accept: 'application/json' } });
            if (!response.ok) {
                this.publish(cwd, undefined);
                return;
            }
            const payload = (await response.json());
            this.publish(cwd, payload);
        }
        catch {
            // An unreachable host reads as no repository: the header shows no
            // button rather than a broken one.
            this.publish(cwd, undefined);
        }
    }
    /** Publish one resolved status into the shared cache. */
    publish(cwd, payload) {
        const next = new Map(this.status.getSnapshot());
        if (payload === undefined)
            next.delete(cwd);
        else
            next.set(cwd, payload);
        this.status.set(next);
    }
}
//# sourceMappingURL=controller.js.map