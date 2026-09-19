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

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import type { WorktreeHost } from './service.ts'
import { createWorktreeAndFork, repoFacts, startInExistingWorktree } from './service.ts'
import { validateWorktreeName } from './worktree.ts'
import { GitFailureError, GitTimeoutError } from './git.ts'
import { ForkRejection } from './fork.ts'
import type { WebServerLike } from './host-services.ts'
import {
  WORKTREE_CREATE_ROUTE, WORKTREE_START_ROUTE, WORKTREE_STATUS_ROUTE,
  type WorktreeCreateValue, type WorktreeErrorPayload, type WorktreeStartValue,
} from './shared.ts'

/** POST bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/** Uniform JSON answer; status and create outcomes are live facts (no-store). */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 carrying the route's single supported method. */
function sendMethodNotAllowed(res: ServerResponse, allow: 'GET' | 'POST'): void {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling (stream drained). */
async function readBoundedBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      // Drain the remainder so the refusal is a readable response, not a socket cut.
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/** Parse one create body: JSON object with non-empty string sessionId and a name. */
export function parseCreateBody(text: string): { sessionId: string; name: string } | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const { sessionId, name } = body as { sessionId?: unknown; name?: unknown }
  if (typeof sessionId !== 'string' || sessionId === '' || typeof name !== 'string') return null
  return { sessionId, name }
}

/** Parse one start body: JSON object with non-empty string sessionId and path. */
export function parseStartBody(text: string): { sessionId: string; path: string } | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const { sessionId, path } = body as { sessionId?: unknown; path?: unknown }
  if (typeof sessionId !== 'string' || sessionId === '' || typeof path !== 'string' || path === '') return null
  return { sessionId, path }
}

/** Map one operation failure to its wire status and structured body. */
export function wireErrorOf(error: unknown): { status: number; body: WorktreeErrorPayload } {
  if (error instanceof ForkRejection) {
    const status = error.code === 'session-not-found' ? 404
      : error.code === 'worktree-exists' ? 409
      : error.code === 'branch-exists' ? 409
      : error.code === 'subagent-session' ? 409
      : error.code === 'no-workspace' ? 409
      : error.code === 'not-git-repo' ? 409
      : 502
    return { status, body: { code: error.code, message: error.message } }
  }
  if (error instanceof GitFailureError || error instanceof GitTimeoutError) {
    return { status: 502, body: { code: 'git-failed', message: error.message } }
  }
  if (error instanceof Error && error.message.startsWith('invalid worktree name')) {
    return { status: 400, body: { code: 'invalid-name', message: error.message } }
  }
  if (error instanceof Error
    && (error.name === 'SessionQueryError'
      || error.message.includes('SESSION_QUERY_SESSION_NOT_FOUND')
      || error.message.includes('not found'))) {
    return { status: 404, body: { code: 'session-not-found', message: error.message } }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { status: 500, body: { code: 'create-failed', message } }
}

/** Dependencies the routes read through, already resolved from the context. */
export interface WorktreeRouteDeps {
  readonly host: import('./service.ts').WorktreeHost
  readonly config: { worktreeRoot?: string; gitTimeoutMs: number }
  /** The connection trust fence; rejection answers are byte-identical denials. */
  readonly connection: import('./host-services.ts').ConnectionLike
}

/**
 * Register the status and create routes as effects on the composition's web
 * server. Every request passes the trust fence before any logic runs, and the
 * fence's 401/403 is answered without a body, like the host's own denials.
 * @param webServer - the composition's web-server service.
 * @param deps - host capability set, configuration, and trust fence.
 * @returns a disposer that removes both routes.
 */
export function registerWorktreeRoutes(
  webServer: WebServerLike,
  deps: WorktreeRouteDeps,
): () => void {
  /** Answer an untrusted/unauthenticated request; true when rejected. */
  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    const rejection = deps.connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  const disposeStatus = webServer.register({
    kind: 'exact',
    path: WORKTREE_STATUS_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const sessionId = new URL(String(req.url), 'http://localhost').searchParams.get('sessionId')
      if (sessionId === null || sessionId === '') {
        sendJson(res, 400, { code: 'bad-request', message: 'sessionId query parameter is required' })
        return
      }
      try {
        const facts = await repoFacts(
          deps.host.sessionQuery,
          deps.host.subprocess,
          sessionId,
          deps.config.gitTimeoutMs,
          deps.config.worktreeRoot,
        )
        sendJson(res, 200, {
          cwd: facts.cwd,
          isGitRepo: facts.isGitRepo,
          ...(facts.repoRoot !== '' && facts.repoRoot !== undefined ? { repoRoot: facts.repoRoot } : {}),
          ...(facts.gitDir !== '' && facts.gitDir !== undefined ? { gitDir: facts.gitDir } : {}),
          ...(facts.isGitRepo ? { worktreeRoot: facts.worktreeRoot } : {}),
          ...(facts.branch !== undefined ? { branch: facts.branch } : {}),
          worktrees: facts.worktrees,
        })
      } catch (error) {
        const { status, body } = wireErrorOf(error)
        sendJson(res, status, body)
      }
    },
  })

  const disposeCreate = webServer.register({
    kind: 'exact',
    path: WORKTREE_CREATE_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      // Body-format validation at the wire: exactly application/json.
      // String(undefined) is 'undefined', which never matches.
      const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
      if (essence !== 'application/json') {
        sendJson(res, 415, { code: 'bad-request', message: 'content-type must be application/json' })
        return
      }
      let text: string | null
      try {
        text = await readBoundedBody(req)
      } catch {
        sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' })
        return
      }
      if (text === null) {
        sendJson(res, 413, { code: 'bad-request', message: 'request body is too large' })
        return
      }
      const body = parseCreateBody(text)
      if (body === null) {
        sendJson(res, 400, {
          code: 'bad-request',
          message: 'request body must be JSON with string "sessionId" and "name"',
        })
        return
      }
      try {
        const name = validateWorktreeName(body.name)
        const outcome = await createWorktreeAndFork(deps.host, body.sessionId, name, deps.config)
        const value: WorktreeCreateValue = {
          ok: true,
          forked: outcome.forked,
          ...(outcome.childId !== undefined ? { sessionId: outcome.childId } : {}),
          ...(outcome.workspaceId !== undefined
            ? { workspaceId: String(outcome.workspaceId) }
            : {}),
          worktreePath: outcome.plan.worktreePath,
          branch: outcome.plan.branch,
          workspaceAttached: outcome.workspaceAttached,
        }
        sendJson(res, 200, value)
      } catch (error) {
        const { status, body: payload } = wireErrorOf(error)
        sendJson(res, status, payload)
      }
    },
  })

  const disposeStart = webServer.register({
    kind: 'exact',
    path: WORKTREE_START_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
      if (essence !== 'application/json') {
        sendJson(res, 415, { code: 'bad-request', message: 'content-type must be application/json' })
        return
      }
      let text: string | null
      try {
        text = await readBoundedBody(req)
      } catch {
        sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' })
        return
      }
      if (text === null) {
        sendJson(res, 413, { code: 'bad-request', message: 'request body is too large' })
        return
      }
      const body = parseStartBody(text)
      if (body === null) {
        sendJson(res, 400, {
          code: 'bad-request',
          message: 'request body must be JSON with string "sessionId" and "path"',
        })
        return
      }
      if (!isAbsolute(body.path)) {
        sendJson(res, 400, { code: 'bad-request', message: 'path must be an absolute directory' })
        return
      }
      try {
        const outcome = await startInExistingWorktree(deps.host, body.sessionId, body.path, deps.config)
        const value: WorktreeStartValue = {
          ok: true,
          forked: outcome.forked,
          ...(outcome.childId !== undefined ? { sessionId: outcome.childId } : {}),
          ...(outcome.workspaceId !== undefined
            ? { workspaceId: String(outcome.workspaceId) }
            : {}),
          worktreePath: outcome.plan.worktreePath,
          branch: outcome.plan.branch,
          workspaceAttached: outcome.workspaceAttached,
        }
        sendJson(res, 200, value)
      } catch (error) {
        const { status, body: payload } = wireErrorOf(error)
        sendJson(res, status, payload)
      }
    },
  })

  return () => {
    disposeStart()
    disposeCreate()
    disposeStatus()
  }
}
