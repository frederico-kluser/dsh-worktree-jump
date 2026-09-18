/**
 * Test doubles and fixtures: behavioral contract doubles over the host
 * services (subprocess runtime, session query, agents, web server,
 * connection fence) and disposable temp git repositories. Everything runs in
 * os.tmpdir(); no ports are bound and the running DSH home is never touched.
 * @module test/helpers
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Writable } from 'node:stream'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionObservationLike } from '../src/host-services.ts'
import type { WorktreeHost, WorkspaceRegistryLike } from '../src/service.ts'
import type { SubprocessRuntimeLike } from '../src/git.ts'
import type { ForkHost } from '../src/fork.ts'

/** A temp directory removed on scope completion. */
export interface TempDir extends Disposable {
  readonly path: string
}

/**
 * Create one disposable temp directory.
 * @param prefix - mkdtemp prefix.
 * @returns the temp dir (auto-removed at scope end).
 */
export async function tempDir(prefix: string): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-worktree-jump-test-'))
  return {
    path,
    [Symbol.dispose]: () => {
      void rm(path, { recursive: true, force: true }).catch(() => {})
    },
  }
}

/** Run git with a plain child_process call; test-side only. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Build a real git repository with one commit on `main`, ready for worktrees. */
export async function makeGitRepo(root: string): Promise<string> {
  const repo = join(root, 'repo')
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(repo, 'src', 'main.ts'), 'export {}\n', 'utf8')
  git(repo, ['init', '-q', '-b', 'main'])
  git(repo, ['config', 'user.email', 'test@example.com'])
  git(repo, ['config', 'user.name', 'Test'])
  git(repo, ['add', '.'])
  git(repo, ['commit', '-qm', 'init'])
  return repo
}

/**
 * Behavioral double of the harness `SubprocessRuntime.spawn`: a real
 * child_process following the spec's dispositions (ignore stdin, collect
 * stdout/stderr) and the outcome/collected/terminate contract. The real
 * runtime's guarantees about the spec shape are exercised here, so a version
 * swap breaks these tests loudly.
 */
export class FakeSubprocess implements SubprocessRuntimeLike {
  /** Every spawn spec seen, for assertion. */
  readonly spawned: SubprocessSpawnSpec[] = []

  spawn(spec: SubprocessSpawnSpec): import('../src/git.ts').SubprocessHandleLike {
    this.spawned.push(spec)
    const [program, ...args] = spec.argv
    const child = spawn(program as string, args as string[], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk) })
    child.stderr?.on('data', (chunk: Buffer) => { stderrChunks.push(chunk) })
    let settled = false
    const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (code, signal) => {
        settled = true
        resolve({ exitCode: code, signal: signal ?? null })
      })
    })
    return {
      stdin: undefined,
      stdout: child.stdout,
      stderr: child.stderr,
      collected: {
        stdout: {
          readFrom: (fromByte: number) => {
            const text = Buffer.concat(stdoutChunks).toString('utf8')
            return { text: text.slice(fromByte), nextOffset: text.length, lossy: false }
          },
        },
        stderr: {
          readFrom: (fromByte: number) => {
            const text = Buffer.concat(stderrChunks).toString('utf8')
            return { text: text.slice(fromByte), nextOffset: text.length, lossy: false }
          },
        },
      },
      done,
      terminate: () => {
        if (!settled) child.kill('SIGTERM')
      },
      waitForExit: async () => true,
    }
  }
}

/** A recorded HTTP response with the raw parts the routes set. */
export interface RecordedResponse {
  statusCode: number | undefined
  headers: Record<string, string | string[] | number>
  body: string
}

/** Build a ServerResponse recorder (statusCode proxies to the record). */
export function fakeResponse(): ServerResponse & { readonly record: RecordedResponse } {
  const record: RecordedResponse = { statusCode: undefined, headers: {}, body: '' }
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      record.body += String(chunk)
      callback()
    },
  })
  const target = stream as unknown as Record<string, unknown>
  Object.defineProperty(stream, 'statusCode', {
    get: () => record.statusCode,
    set: (value: number | undefined) => { record.statusCode = value },
    configurable: true,
  })
  target['setHeader'] = (name: string, value: string | string[] | number) => {
    record.headers[name] = value
    return stream
  }
  target['end'] = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' || Buffer.isBuffer(first)) record.body += String(first)
    void args
    return stream
  }
  target['record'] = record
  return stream as unknown as ServerResponse & { readonly record: RecordedResponse }
}

/** Build a minimal fake request with an async-iterable body. */
export function fakeRequest(options: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}): IncomingMessage {
  const body = options.body
  const iterator = (async function* generate() {
    if (body !== undefined) yield Buffer.from(body, 'utf8')
  })()
  return {
    method: options.method,
    url: options.url,
    headers: options.headers ?? {},
    [Symbol.asyncIterator]: iterator[Symbol.asyncIterator].bind(iterator),
  } as unknown as IncomingMessage
}

/** A canned Session observation. */
export function fakeObservation(overrides: {
  id?: string
  cwd?: string | undefined
  origin?: 'subagent' | undefined
  events?: SessionObservationLike['events']
  agentPreset?: string | undefined
} = {}): SessionObservationLike {
  const id = overrides.id ?? 'session-src'
  const observation = {
    header: {
      id,
      ...(overrides.cwd === undefined ? {} : { cwd: overrides.cwd }),
      ...(overrides.origin === undefined ? {} : { origin: overrides.origin }),
    },
    inheritedEventCount: 0,
    events: overrides.events ?? [],
    [Symbol.dispose]: () => {},
  }
  if (overrides.agentPreset !== undefined) {
    ;(observation as Record<string, unknown>)['projections'] = {
      values: { agentPreset: overrides.agentPreset },
    }
  }
  return observation as unknown as SessionObservationLike
}

/** A session-query double serving one canned observation per id. */
export class FakeSessionQuery {
  readonly observed: string[] = []
  private readonly map = new Map<string, SessionObservationLike>()

  constructor(sessions: Record<string, SessionObservationLike>) {
    for (const [id, observation] of Object.entries(sessions)) this.map.set(id, observation)
  }

  observeSession(sessionId: SessionId): Promise<SessionObservationLike> {
    this.observed.push(sessionId)
    const observation = this.map.get(sessionId)
    if (observation === undefined) {
      return Promise.reject(new Error(`SESSION_QUERY_SESSION_NOT_FOUND: session "${sessionId}" not found`))
    }
    return Promise.resolve(observation)
  }
}

/** An agents registry double recording every create. */
export class FakeAgents {
  readonly created: {
    sessionId: string
    seed: readonly unknown[] | undefined
    inheritedEventCount: number | undefined
    meta: Record<string, unknown> | undefined
    agentOptions: { provider: string; model: string } | undefined
    setup: unknown
  }[] = []
  /** When set, the next create rejects with this error. */
  failNext: Error | undefined

  async create(options: {
    sessionId: unknown
    seed?: readonly unknown[]
    inheritedEventCount?: number
    meta?: Record<string, unknown>
    agentOptions?: { provider: string; model: string }
    setup?: unknown
  }): Promise<unknown> {
    if (this.failNext !== undefined) {
      const error = this.failNext
      this.failNext = undefined
      throw error
    }
    this.created.push({
      sessionId: String(options.sessionId),
      seed: options.seed,
      inheritedEventCount: options.inheritedEventCount,
      meta: options.meta,
      agentOptions: options.agentOptions,
      setup: options.setup,
    })
    return { agent: {} }
  }
}

/** Assemble the plugin's host capability set with doubles (fs = real). */
export function fakeHost(options: {
  query: FakeSessionQuery
  subprocess: SubprocessRuntimeLike
  agents: ForkHost['agents']
  agentDefaultModel?: { currentSelection(): { provider: string; model: string } }
  agentPresets?: ForkHost['agentPresets']
  workspaceRegistry?: WorkspaceRegistryLike
}): WorktreeHost {
  return {
    subprocess: options.subprocess,
    sessionQuery: options.query,
    agents: options.agents,
    agentDefaultModel:
      options.agentDefaultModel ?? { currentSelection: () => ({ provider: 'deepseek', model: 'test-model' }) },
    agentPresets: options.agentPresets,
    workspaceRegistry: options.workspaceRegistry,
    fs: { mkdir, readFile, writeFile },
  }
}

/** The connection fence double: accepts everything unless told to reject. */
export class FakeConnection {
  rejectWith: 401 | 403 | undefined

  requestRejection(): 401 | 403 | undefined {
    return this.rejectWith
  }
}

/** A webServer double capturing route registrations. */
export class FakeWebServer {
  readonly routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>()

  register(route: {
    kind: string
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void {
    const key = `${route.kind} ${route.path}`
    if (this.routes.has(key)) throw new Error(`duplicate route ${key}`)
    this.routes.set(key, route.handler)
    return () => { this.routes.delete(key) }
  }

  /** The registered exact-route handler for a path (or undefined). */
  handler(path: string): ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined {
    return this.routes.get(`exact ${path}`)
  }
}

/** Read a repo's `.git/info/exclude` text, or undefined when absent. */
export async function readExclude(repoRoot: string): Promise<string | undefined> {
  try {
    return await readFile(join(repoRoot, '.git', 'info', 'exclude'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw error
  }
}
