/**
 * Narrowed host service contracts the plugin reads across boundaries. Types
 * only — the real declarations live in the corresponding `@deepseek-ai`
 * packages; these slices are mirrored for the narrowed-call style the plugin
 * uses (explicit local interfaces over `Reflect.get`).
 * @module dsh-worktree-jump/host-services
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import type { AgentSetup } from './host-types.ts';
/** One exact Session observation, narrowed from `SessionObservation` (Disposable). */
export interface SessionObservationLike extends Disposable {
    readonly header: {
        readonly id: SessionId;
        readonly cwd?: string;
        readonly origin?: 'subagent';
    };
    readonly inheritedEventCount: number;
    readonly events: readonly SessionEvent[];
    readonly projections?: {
        readonly values: {
            readonly agentPreset?: string;
            readonly [key: string]: unknown;
        };
    } | undefined;
}
/**
 * The session-query engine slice the plugin uses: exact observations. The
 * real service is a Cordis `Service` (`sessionQuery`), so it is injectable.
 */
export interface SessionQueryEngineLike {
    /**
     * Observe one exact immutable Session cut.
     * @param sessionId - session identity.
     * @returns the observation; rejects when the session is unknown.
     */
    observeSession(sessionId: SessionId): Promise<SessionObservationLike>;
}
/**
 * The connection service's trust-fence slice (node half of the web
 * connection package): every route asks for a rejection first, so the
 * Host/Origin fence and browser authentication gate every caller.
 */
export interface ConnectionLike {
    requestRejection(request: {
        readonly headers: import('node:http').IncomingMessage['headers'];
    }): 401 | 403 | undefined;
}
/** The web-server slice the plugin registers routes on. */
export interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>;
    }): () => void;
}
/** The agents registry slice: create with cwd override. */
export interface AgentsRegistryLike {
    create(options: {
        sessionId: SessionId;
        seed?: readonly SessionEvent[];
        inheritedEventCount?: number;
        meta?: {
            readonly cwd?: string;
            readonly parentSession?: SessionId;
            readonly isSeeded?: boolean;
            readonly agentPreset?: string;
        };
        agentOptions?: {
            readonly provider: string;
            readonly model: string;
        };
        setup?: AgentSetup;
    }): Promise<unknown>;
}
