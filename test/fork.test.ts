/** Fork-with-cwd engine: the cut, the cwd override, and the rejections. */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { computeForkCut, ForkRejection, forkSessionInto, type ForkSource } from '../src/fork.ts'
import { FakeAgents, fakeObservation, type FakeSessionQuery } from './helpers.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Build a small balanced event log: one completed turn then a running one. */
function sampleEvents(): SessionEvent[] {
  return [
    { type: 'session/start', seq: 0 } as unknown as SessionEvent,
    { type: 'turn/start', seq: 1 } as unknown as SessionEvent,
    { type: 'turn/end', seq: 2 } as unknown as SessionEvent,
    { type: 'turn/start', seq: 3 } as unknown as SessionEvent,
    { type: 'user/message', seq: 4 } as unknown as SessionEvent,
  ]
}

test('computeForkCut carries everything through the last completed turn', () => {
  const events = sampleEvents()
  const cut = computeForkCut(events)
  assert.equal(cut.seeded, true)
  assert.equal(cut.inheritedEventCount, 3)
  assert.deepEqual(cut.seed.map(event => event.seq), [0, 1, 2])
})

test('computeForkCut returns a blank cut for an eventless source', () => {
  const cut = computeForkCut([])
  assert.equal(cut.seeded, false)
  assert.deepEqual(cut.seed, [])
})

test('forkSessionInto overrides the cwd and keeps lineage', async () => {
  const agents = new FakeAgents()
  const source = fakeObservation({ id: 'session-src', cwd: '/repo', events: sampleEvents() }) as ForkSource
  const mounted: string[] = []
  const childId = await forkSessionInto(
    {
      agents: agents as unknown as import('../src/fork.ts').ForkHost['agents'],
      agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
      agentPresets: {
        resolve: async (presetId) => ({ id: presetId ?? 'default-preset' }),
        mount: async (_ctx, id) => { mounted.push(id) },
      },
    },
    'session-src' as SessionId,
    '/repo/.worktrees/feature',
    source,
  )
  assert.match(childId, /^session-/)
  const created = agents.created[0]
  assert.equal(created?.sessionId, childId)
  assert.equal(created?.meta?.cwd, '/repo/.worktrees/feature')
  assert.equal(created?.meta?.parentSession, 'session-src')
  assert.equal(created?.meta?.isSeeded, true)
  assert.equal(created?.meta?.agentPreset, 'default-preset')
  assert.equal(created?.inheritedEventCount, 3)
  assert.deepEqual(created?.agentOptions, { provider: 'p', model: 'm' })
  const setup = created?.setup as ((agentCtx: unknown, agent: unknown) => Promise<void> | void) | undefined
  await setup?.(undefined, undefined)
  assert.deepEqual(mounted, ['default-preset'])
})

test('forkSessionInto forks blank when the source has no completed turn', async () => {
  const agents = new FakeAgents()
  const source = fakeObservation({
    id: 'session-src',
    cwd: '/repo',
    events: [{ type: 'turn/start', seq: 0 } as unknown as SessionEvent],
  }) as ForkSource
  await forkSessionInto(
    {
      agents: agents as unknown as import('../src/fork.ts').ForkHost['agents'],
      agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
      agentPresets: undefined,
    },
    'session-src' as SessionId,
    '/repo/.worktrees/x',
    source,
  )
  const created = agents.created[0]
  assert.equal(created?.seed, undefined)
  assert.equal(created?.inheritedEventCount, undefined)
  assert.equal(created?.meta?.isSeeded, undefined)
  assert.equal(created?.meta?.parentSession, 'session-src')
  assert.equal(created?.setup, undefined)
})

test('forkSessionInto rejects subagent sessions before any mutation', async () => {
  const agents = new FakeAgents()
  const source = fakeObservation({
    id: 'session-sub',
    cwd: '/repo',
    origin: 'subagent',
    events: sampleEvents(),
  }) as ForkSource
  await assert.rejects(
    forkSessionInto(
      { agents, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) }, agentPresets: undefined },
      'session-sub' as SessionId,
      '/repo/.worktrees/x',
      source,
    ),
    (error: unknown) => error instanceof ForkRejection && error.code === 'subagent-session',
  )
  assert.equal(agents.created.length, 0)
})

test('forkSessionInto rejects sessions without a workspace directory', async () => {
  const agents = new FakeAgents()
  const source = fakeObservation({ id: 'session-x', cwd: undefined, events: [] }) as ForkSource
  await assert.rejects(
    forkSessionInto(
      { agents, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) }, agentPresets: undefined },
      'session-x' as SessionId,
      '/repo/.worktrees/x',
      source,
    ),
    (error: unknown) => error instanceof ForkRejection && error.code === 'no-workspace',
  )
})

test('forkSessionInto wraps create failures as fork-unavailable', async () => {
  const agents = new FakeAgents()
  agents.failNext = new Error('disk full')
  const source = fakeObservation({ id: 'session-src', cwd: '/repo', events: [] }) as ForkSource
  await assert.rejects(
    forkSessionInto(
      { agents, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) }, agentPresets: undefined },
      'session-src' as SessionId,
      '/repo/.worktrees/x',
      source,
    ),
    (error: unknown) => error instanceof ForkRejection && error.code === 'fork-unavailable',
  )
})
