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
import { randomUUID } from 'node:crypto';
import { brandString } from "./brand.js";
import { SessionLogOffset } from "./session-brands.js";
/** Typed rejection; the routes translate it to a wire error. */
export class ForkRejection extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ForkRejection';
    }
}
/**
 * Compute the fork cut: everything through the last completed turn, extended
 * to the next turn boundary exactly like the harness's own fork command, or
 * an empty cut when no turn ever completed.
 * @param events - the source Session's full event log.
 * @returns the balanced seed cut, or a blank cut for an eventless source.
 */
export function computeForkCut(events) {
    const boundary = events.findLast(event => event.type === 'turn/end');
    if (boundary === undefined)
        return { seed: [], inheritedEventCount: 0, seeded: false };
    let cut = boundary.seq + 1;
    while (cut < events.length && events[cut]?.type !== 'turn/start') {
        cut += 1;
    }
    return { seed: events.slice(0, cut), inheritedEventCount: cut, seeded: true };
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
export async function forkSessionInto(host, sourceId, worktreePath, source) {
    if (source.header.id !== sourceId) {
        throw new ForkRejection('session-not-found', `session "${sourceId}" not found`);
    }
    if (source.header.origin === 'subagent') {
        throw new ForkRejection('subagent-session', `session "${sourceId}" is a subagent session`);
    }
    if (source.header.cwd === undefined) {
        throw new ForkRejection('no-workspace', `session "${sourceId}" records no workspace directory`);
    }
    const presetId = source.projections?.values['agentPreset'];
    let agentPreset;
    let setup;
    if (host.agentPresets !== undefined) {
        const resolved = await host.agentPresets.resolve(typeof presetId === 'string' ? presetId : undefined);
        agentPreset = resolved.id;
        // The wrapper must be an async function that AWAITS and returns nothing:
        // `AgentPresets.mount` resolves to the mounted AgentPreset, and the agent
        // loop reads the setup's awaited result as an optional publication commit
        // (`setupCommit?.commit()`), so repassing the mount's promise directly
        // hands it a preset object and crashes the creation. The first-party
        // fork command wraps the same way.
        setup = async (agentCtx) => {
            await host.agentPresets.mount(agentCtx, resolved.id);
        };
    }
    const cut = computeForkCut(source.events);
    const childId = brandString(`session-${randomUUID()}`);
    const { provider, model } = host.agentDefaultModel.currentSelection();
    try {
        await host.agents.create({
            sessionId: childId,
            ...(cut.seeded
                ? {
                    seed: cut.seed,
                    inheritedEventCount: SessionLogOffset(cut.inheritedEventCount),
                }
                : {}),
            meta: {
                cwd: worktreePath,
                parentSession: source.header.id,
                ...(cut.seeded ? { isSeeded: true } : {}),
                ...(agentPreset !== undefined ? { agentPreset } : {}),
            },
            agentOptions: { provider, model },
            ...(setup !== undefined ? { setup } : {}),
        });
    }
    catch (error) {
        if (error instanceof ForkRejection)
            throw error;
        throw new ForkRejection('fork-unavailable', `failed to fork session "${sourceId}" into "${worktreePath}": ${error instanceof Error ? error.message : String(error)}`);
    }
    return childId;
}
//# sourceMappingURL=fork.js.map