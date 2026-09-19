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

import { randomUUID } from 'node:crypto'
import { brandString } from './brand.ts'
import { SessionLogOffset } from './session-brands.ts'
import type { AgentSetup } from './host-types.ts'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'

/** Source Session facts the fork reads, narrowed from a `SessionObservation`. */
export interface ForkSource {
  readonly header: {
    readonly id: SessionId
    readonly cwd?: string
    readonly origin?: 'subagent'
  }
  readonly events: readonly SessionEvent[]
  readonly projections?: {
    readonly values: {
      readonly agentPreset?: string
      readonly [key: string]: unknown
    }
    readonly [key: string]: unknown
  }
}

/** Rejection reasons the fork raises before any host mutation. */
export type ForkRejectionCode =
  | 'session-not-found'
  | 'subagent-session'
  | 'no-workspace'
  | 'not-git-repo'
  | 'worktree-exists'
  | 'branch-exists'
  | 'fork-unavailable'

/** Typed rejection; the routes translate it to a wire error. */
export class ForkRejection extends Error {
  constructor(
    readonly code: ForkRejectionCode,
    message: string,
  ) {
    super(message)
    this.name = 'ForkRejection'
  }
}

/**
 * The completed-turn cut the fork carries: seed events plus the exact
 * inherited length, or a blank continuation when the source has no completed
 * turn (nothing durable exists to inherit yet).
 */
export interface ForkCut {
  readonly seed: readonly SessionEvent[]
  readonly inheritedEventCount: number
  /** Whether the child inherits real history (true) or starts blank. */
  readonly seeded: boolean
}

/**
 * Compute the fork cut: everything through the last completed turn, extended
 * to the next turn boundary exactly like the harness's own fork command, or
 * an empty cut when no turn ever completed.
 * @param events - the source Session's full event log.
 * @returns the balanced seed cut, or a blank cut for an eventless source.
 */
export function computeForkCut(events: readonly SessionEvent[]): ForkCut {
  const boundary = events.findLast(event => event.type === 'turn/end')
  if (boundary === undefined) return { seed: [], inheritedEventCount: 0, seeded: false }
  let cut = boundary.seq + 1
  while (cut < events.length && events[cut]?.type !== 'turn/start') {
    cut += 1
  }
  return { seed: events.slice(0, cut), inheritedEventCount: cut, seeded: true }
}

/** Host capabilities the fork needs, all narrowed for standalone tests. */
export interface ForkHost {
  /** Creates the child Agent/Session pair under one identity. */
  readonly agents: {
    create(options: {
      sessionId: SessionId
      seed?: readonly SessionEvent[]
      inheritedEventCount?: SessionLogOffset
      meta?: {
        readonly cwd?: string
        readonly parentSession?: SessionId
        readonly isSeeded?: boolean
        readonly agentPreset?: string
      }
      agentOptions?: { readonly provider: string; readonly model: string }
      setup?: AgentSetup
    }): Promise<unknown>
  }
  /** Current deployment default provider/model pair. */
  readonly agentDefaultModel: { currentSelection(): { provider: string; model: string } }
  /** Optional agent-preset capability; absence means no preset mounting.
   * The real `AgentPresets.mount` resolves to the mounted preset (NOT void) —
   * consume it with `await` and return nothing, or the agent loop reads the
   * preset as a publication commit. */
  readonly agentPresets:
    | {
      resolve(presetId: string | undefined): Promise<{ id: string }>
      mount(agentCtx: unknown, presetId: string): Promise<unknown>
    }
    | undefined
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
export async function forkSessionInto(
  host: ForkHost,
  sourceId: SessionId,
  worktreePath: string,
  source: ForkSource,
): Promise<SessionId> {
  if (source.header.id !== sourceId) {
    throw new ForkRejection('session-not-found', `session "${sourceId}" not found`)
  }
  if (source.header.origin === 'subagent') {
    throw new ForkRejection('subagent-session', `session "${sourceId}" is a subagent session`)
  }
  if (source.header.cwd === undefined) {
    throw new ForkRejection('no-workspace', `session "${sourceId}" records no workspace directory`)
  }

  const presetId = source.projections?.values['agentPreset']
  let agentPreset: string | undefined
  let setup: AgentSetup | undefined
  if (host.agentPresets !== undefined) {
    const resolved = await host.agentPresets.resolve(typeof presetId === 'string' ? presetId : undefined)
    agentPreset = resolved.id
    // The wrapper must be an async function that AWAITS and returns nothing:
    // `AgentPresets.mount` resolves to the mounted AgentPreset, and the agent
    // loop reads the setup's awaited result as an optional publication commit
    // (`setupCommit?.commit()`), so repassing the mount's promise directly
    // hands it a preset object and crashes the creation. The first-party
    // fork command wraps the same way.
    setup = async (agentCtx: unknown) => {
      await host.agentPresets!.mount(agentCtx, resolved.id)
    }
  }

  const cut = computeForkCut(source.events)
  const childId = brandString<SessionId>(`session-${randomUUID()}`)
  const { provider, model } = host.agentDefaultModel.currentSelection()
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
    })
  } catch (error) {
    if (error instanceof ForkRejection) throw error
    throw new ForkRejection(
      'fork-unavailable',
      `failed to fork session "${sourceId}" into "${worktreePath}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return childId
}
