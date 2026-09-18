/** Route behaviors: fence, wire validation, and the create flow on real git. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerWorktreeRoutes } from '../src/routes.ts'
import { WORKTREE_CREATE_ROUTE, WORKTREE_STATUS_ROUTE } from '../src/shared.ts'
import {
  FakeAgents, FakeConnection, FakeSubprocess, FakeWebServer, fakeHost, fakeObservation,
  fakeRequest, fakeResponse, readExclude, tempDir,
} from './helpers.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Wire up a full routes fixture against a temp git repo. */
async function setup() {
  const dir = await tempDir('routes-')
  const repo = await makeRepo(dir.path)
  const sessionId = 'session-1'
  const sessions = {
    [sessionId]: fakeObservation({ id: sessionId, cwd: repo, events: [
      { type: 'turn/end', seq: 0 },
      { type: 'turn/start', seq: 1 },
    ] as never }),
  }
  const query = new FakeSessionQuery(sessions as never)
  const subprocess = new FakeSubprocess()
  const agents = new FakeAgents()
  const connection = new FakeConnection()
  const webServer = new FakeWebServer()
  const host = fakeHost({ query, subprocess, agents: agents as never })
  const disposer = registerWorktreeRoutes(webServer as never, {
    host,
    config: { gitTimeoutMs: 10_000 },
    connection: connection as never,
  })
  return {
    dir, repo, sessionId, agents, connection, webServer, disposer,
    status: expectHandler(webServer, WORKTREE_STATUS_ROUTE),
    create: expectHandler(webServer, WORKTREE_CREATE_ROUTE),
    [Symbol.dispose]: () => { dir[Symbol.dispose]() },
  }
}

function expectHandler(
  webServer: FakeWebServer,
  path: string,
): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void> {
  const handler = webServer.handler(path)
  assert.ok(handler, `route ${path} must be registered`)
  return handler
}

import { makeGitRepo as makeRepo, FakeSessionQuery } from './helpers.ts'

function jsonOf(record: { statusCode: number | undefined; body: string }): { status: number; payload: Record<string, unknown> } {
  return { status: record.statusCode ?? 0, payload: JSON.parse(record.body) as Record<string, unknown> }
}

test('routes register exactly two exact routes', async () => {
  using routes = await setup()
  assert.equal(routes['webServer'].routes.size, 2)
  assert.ok(routes['webServer'].handler(WORKTREE_STATUS_ROUTE))
  assert.ok(routes['webServer'].handler(WORKTREE_CREATE_ROUTE))
})

test('the trust fence answers before any logic', async () => {
  using routes = await setup()
  routes.connection.rejectWith = 403
  const res = fakeResponse()
  await routes.status(fakeRequest({ method: 'GET', url: `${WORKTREE_STATUS_ROUTE}?sessionId=x` }), res)
  assert.equal(res.record.statusCode, 403)
  assert.equal(res.record.body, '')
})

test('status without sessionId answers 400', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.status(fakeRequest({ method: 'GET', url: WORKTREE_STATUS_ROUTE }), res)
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 400)
  assert.equal(payload.code, 'bad-request')
})

test('status rejects non-GET with 405', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.status(fakeRequest({ method: 'POST', url: `${WORKTREE_STATUS_ROUTE}?sessionId=x` }), res)
  assert.equal(res.record.statusCode, 405)
})

test('status reports a git repository with root, branch, and worktrees', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.status(
    fakeRequest({ method: 'GET', url: `${WORKTREE_STATUS_ROUTE}?sessionId=${routes.sessionId}` }),
    res,
  )
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 200)
  assert.equal(payload.isGitRepo, true)
  assert.equal(payload.repoRoot, routes.repo)
  assert.equal(payload.branch, 'main')
  assert.ok(Array.isArray(payload.worktrees) && payload.worktrees.length === 1)
  assert.equal(payload.worktreeRoot, join(routes.repo, '.worktrees'))
})

test('status reports isGitRepo false outside a repository', async () => {
  using routes = await setup()
  using plain = await tempDir('plain-')
  const query = new FakeSessionQuery({
    'session-plain': fakeObservation({ id: 'session-plain', cwd: plain.path }),
  })
  const host = fakeHost({ query, subprocess: new FakeSubprocess(), agents: new FakeAgents() as never })
  const webServer = new FakeWebServer()
  registerWorktreeRoutes(webServer as never, {
    host, config: { gitTimeoutMs: 10_000 }, connection: new FakeConnection() as never,
  })
  const res = fakeResponse()
  await expectHandler(webServer, WORKTREE_STATUS_ROUTE)(fakeRequest({
    method: 'GET', url: `${WORKTREE_STATUS_ROUTE}?sessionId=session-plain`,
  }), res)
  const { payload } = jsonOf(res.record)
  assert.equal(payload.isGitRepo, false)
  assert.ok(Array.isArray(payload.worktrees) && payload.worktrees.length === 0)
})

test('create builds the worktree, excludes it, and forks with the worktree cwd', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.create(fakeRequest({
    method: 'POST',
    url: WORKTREE_CREATE_ROUTE,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: routes.sessionId, name: 'feature-x' }),
  }), res)
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 200, `expected 200, got ${String(status)}: ${res.record.body.slice(0, 200)}`)
  assert.equal(payload.ok, true)
  const worktreePath = String(payload.worktreePath)
  assert.equal(worktreePath, join(routes.repo, '.worktrees', 'feature-x'))
  assert.ok(existsSync(worktreePath), 'worktree directory exists')
  assert.ok(existsSync(join(worktreePath, 'src', 'main.ts')), 'worktree carries the tracked files')
  const exclude = await readExclude(routes.repo)
  assert.match(excludeLabel(exclude), /\.worktrees\//)
  const created = routes['agents'].created[0]
  assert.match(String(created?.sessionId), /^session-/)
  assert.equal(created?.meta?.cwd, worktreePath)
  assert.equal(payload.sessionId, String(created?.sessionId))
  assert.equal(payload.branch, 'feature-x')
})

test('create refuses invalid names with a structured error', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.create(fakeRequest({
    method: 'POST',
    url: WORKTREE_CREATE_ROUTE,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: routes.sessionId, name: 'not/valid' }),
  }), res)
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 400)
  assert.equal(payload.code, 'invalid-name')
})

test('create rejects non-JSON content types and bad bodies', async () => {
  using routes = await setup()
  const cases = [
    { headers: { 'content-type': 'text/plain' }, body: '{"sessionId":"s","name":"a"}', status: 415 },
    { headers: { 'content-type': 'application/json' }, body: 'not-json', status: 400 },
    { headers: { 'content-type': 'application/json' }, body: '{"name":"missing-session"}', status: 400 },
  ] as const
  for (const item of cases) {
    const res = fakeResponse()
    await routes.create(fakeRequest({
      method: 'POST', url: WORKTREE_CREATE_ROUTE,
      headers: { ...item.headers }, body: item.body,
    }), res)
    assert.equal(res.record.statusCode, item.status, `body case: ${item.body}`)
  }
})

test('create answers 404 for an unknown session', async () => {
  using routes = await setup()
  const res = fakeResponse()
  await routes.create(fakeRequest({
    method: 'POST',
    url: WORKTREE_CREATE_ROUTE,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-unknown', name: 'feature' }),
  }), res)
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 404)
  assert.equal(payload.code, 'session-not-found')
})

test('create answers 409 when the session directory is not a repository', async () => {
  using plain = await tempDir('plain-')
  const query = new FakeSessionQuery({
    'session-plain': fakeObservation({ id: 'session-plain', cwd: plain.path }),
  })
  const host = fakeHost({ query, subprocess: new FakeSubprocess(), agents: new FakeAgents() as never })
  const webServer = new FakeWebServer()
  registerWorktreeRoutes(webServer as never, {
    host, config: { gitTimeoutMs: 10_000 }, connection: new FakeConnection() as never,
  })
  const res = fakeResponse()
  await expectHandler(webServer, WORKTREE_CREATE_ROUTE)(fakeRequest({
    method: 'POST',
    url: WORKTREE_CREATE_ROUTE,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-plain', name: 'feature' }),
  }), res)
  const { status, payload } = jsonOf(res.record)
  assert.equal(status, 409)
  assert.equal(payload.code, 'not-git-repo')
})

function excludeLabel(content: string | undefined): string {
  return content ?? ''
}

test('routes dispose cleanly', async () => {
  using routes = await setup()
  routes.disposer()
  assert.equal(routes['webServer'].routes.size, 0)
})
