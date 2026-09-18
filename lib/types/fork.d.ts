/**
 * Session fork engine for the "conversation transport": fork a live Session
 * into a new Session whose creation `cwd` is the worktree path, instead of
 * the source's own (a Session header's `cwd` is frozen creation metadata, so
 * DSH has no in-place switch). The child inherits the source's history
 * through its last completed turn, rides `parentSession` lineage, mounts the
 * source's agent preset (or the deployment default), and starts with the
 * current default model selection — the same flow the harness's own fork
 * command runs, with the cwd overridden.
 * @module dsh-worktree-jump/fork
 */
import { SessionLogOffset } from './session-brands.ts';
import type { AgentSetup } from './host-types.ts';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types';
/** Source Session facts the fork reads, narrowed from a `SessionObservation`. */
export interface ForkSource {
    readonly header: {
        readonly id: SessionId;
        readonly cwd?: string;
        readonly origin?: 'subagent';
    };
    readonly events: readonly SessionEvent[];
    readonly projections?: {
        readonly values: {
            readonly agentPreset?: string;
            readonly [key: string]: unknown;
        };
        readonly [key: string]: unknown;
    };
}
/** Rejection reasons the fork raises before any host mutation. */
export type ForkRejectionCode = 'session-not-found' | 'subagent-session' | 'no-workspace' | 'not-git-repo' | 'worktree-exists' | 'branch-exists' | 'fork-unavailable';
/** Typed rejection; the routes translate it to a wire error. */
export declare class ForkRejection extends Error {
    readonly code: ForkRejectionCode;
    constructor(code: ForkRejectionCode, message: string);
}
/**
 * The completed-turn cut the fork carries: seed events plus the exact
 * inherited length, or a blank continuation when the source has no completed
 * turn (nothing durable exists to inherit yet).
 */
export interface ForkCut {
    readonly seed: readonly SessionEvent[];
    readonly inheritedEventCount: number;
    /** Whether the child inherits real history (true) or starts blank. */
    readonly seeded: boolean;
}
/**
 * Compute the fork cut: everything through the last completed turn, extended
 * to the next turn boundary exactly like the harness's own fork command, or
 * an empty cut when no turn ever completed.
 * @param events - the source Session's full event log.
 * @returns the balanced seed cut, or a blank cut for an eventless source.
 */
export declare function computeForkCut(events: readonly SessionEvent[]): ForkCut;
/** Host capabilities the fork needs, all narrowed for standalone tests. */
export interface ForkHost {
    /** Creates the child Agent/Session pair under one identity. */
    readonly agents: {
        create(options: {
            sessionId: SessionId;
            seed?: readonly SessionEvent[];
            inheritedEventCount?: SessionLogOffset;
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
    };
    /** Current deployment default provider/model pair. */
    readonly agentDefaultModel: {
        currentSelection(): {
            provider: string;
            model: string;
        };
    };
    /** Optional agent-preset capability; absence means no preset mounting. */
    readonly agentPresets: {
        resolve(presetId: string | undefined): Promise<{
            id: string;
        }>;
        mount(agentCtx: unknown, presetId: string): Promise<void>;
    } | undefined;
}
/**
 * Fork the source Session into `worktreePath` and return the child identity.
 *
 * The child inherits the source's history through its last completed turn,
 * is created with `meta.cwd` set to the worktree path, and mounts the same
 * agent preset the source runs (the deployment default when the source
 * records none). The parent identity rides `parentSession`, so session
 * lineage keeps showing the continuation relationship.
 * @param host - narrowed host capabilities.
 * @param sourceId - the Session to transport.
 * @param worktreePath - absolute worktree directory for the child's cwd.
 * @param source - observed source Session (header, events, projections).
 * @returns the child Session id.
 * @throws {ForkRejection} for every pre-condition failure, before any mutation.
 */
export declare function forkSessionInto(host: ForkHost, sourceId: SessionId, worktreePath: string, source: ForkSource): Promise<SessionId>;
