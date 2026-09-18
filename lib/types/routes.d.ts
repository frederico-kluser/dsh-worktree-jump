/**
 * HTTP surface of the plugin: two routes behind the composition's connection
 * trust fence (Host/Origin fence + browser authentication), with wire-level
 * body validation and byte-identical denial bodies per code.
 *
 * - `GET  /dsh-worktree/status?sessionId=<id>` — repository facts the button
 *   gates on (git repo? root? branch? existing worktrees? worktree root).
 * - `POST /dsh-worktree/create` — `{ sessionId, name }`: create the worktree,
 *   fork the conversation into it, and answer with the child Session id.
 * @module dsh-worktree-jump/routes
 */
import type { WebServerLike } from './host-services.ts';
import { type WorktreeErrorPayload } from './shared.ts';
/** Parse one create body: JSON object with non-empty string sessionId and a name. */
export declare function parseCreateBody(text: string): {
    sessionId: string;
    name: string;
} | null;
/** Map one operation failure to its wire status and structured body. */
export declare function wireErrorOf(error: unknown): {
    status: number;
    body: WorktreeErrorPayload;
};
/** Dependencies the routes read through, already resolved from the context. */
export interface WorktreeRouteDeps {
    readonly host: import('./service.ts').WorktreeHost;
    readonly config: {
        worktreeRoot?: string;
        gitTimeoutMs: number;
    };
    /** The connection trust fence; rejection answers are byte-identical denials. */
    readonly connection: import('./host-services.ts').ConnectionLike;
}
/**
 * Register the status and create routes as effects on the composition's web
 * server. Every request passes the trust fence before any logic runs, and the
 * fence's 401/403 is answered without a body, like the host's own denials.
 * @param webServer - the composition's web-server service.
 * @param deps - host capability set, configuration, and trust fence.
 * @returns a disposer that removes both routes.
 */
export declare function registerWorktreeRoutes(webServer: WebServerLike, deps: WorktreeRouteDeps): () => void;
