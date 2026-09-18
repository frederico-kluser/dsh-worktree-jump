/**
 * Browser state and HTTP carrier for the worktree button: per-cwd status
 * caching and the create call. Failures surface through the dialog, never as
 * broken chrome; an unreachable host reads as "not a git repo" (no button).
 * @module worktree-jump/client/controller
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  WORKTREE_CREATE_ROUTE, WORKTREE_STATUS_ROUTE,
  type WorktreeCreateValue, type WorktreeStatusPayload,
} from '../shared.ts'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

/** One failed create: the HTTP status plus the server's structured code. */
export class WorktreeHttpError extends Error {
  /**
   * @param status - HTTP status of the failed create.
   * @param code - the server's structured error code, when present.
   * @param message - server message, when present.
   */
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string | undefined,
  ) {
    super(message ?? `HTTP ${String(status)}`)
    this.name = 'WorktreeHttpError'
  }
}

/**
 * Browser state and HTTP carrier for the worktree button: the per-cwd status
 * cache (every Session header shares one truth) and the create POST.
 */
export class WorktreeController {
  /** Published status per workspace directory; keyed by cwd, not session id. */
  readonly status: SnapshotStore<ReadonlyMap<string, WorktreeStatusPayload>> =
    createSnapshotStore<ReadonlyMap<string, WorktreeStatusPayload>>(new Map())

  /** In-flight status reads per cwd; concurrent readers share one fetch. */
  private readonly loading = new Map<string, Promise<void>>()

  /**
   * @param fetcher - HTTP carrier for the status read and the create POST.
   */
  constructor(private readonly fetcher: Fetch = (input, init) => fetch(input, init)) {}

  /**
   * Ensure a status read is running (or resolved) for one session's cwd.
   * Concurrent calls share the read; a failure publishes no entry, which the
   * button reads as "not a git repository".
   * @param sessionId - the current Session.
   * @param cwd - the session's workspace directory.
   * @returns resolution after the status is published or the read failed.
   */
  loadStatus(sessionId: string, cwd: string): Promise<void> {
    const inflight = this.loading.get(cwd)
    if (inflight !== undefined) return inflight
    const run = this.runStatus(sessionId, cwd).finally(() => { this.loading.delete(cwd) })
    this.loading.set(cwd, run)
    return run
  }

  /**
   * Read the cached status for a workspace directory.
   * @param cwd - the session's workspace directory.
   * @returns the published status, or undefined before the first read lands.
   */
  statusOf(cwd: string): WorktreeStatusPayload | undefined {
    return this.status.getSnapshot().get(cwd)
  }

  /**
   * Create the worktree and fork the conversation into it.
   * @param sessionId - the current Session.
   * @param name - worktree/branch name as typed (the host validates).
   * @returns the create value; rejects with {@link WorktreeHttpError} on failure.
   */
  async create(sessionId: string, name: string): Promise<WorktreeCreateValue> {
    const response = await this.fetcher(new URL(WORKTREE_CREATE_ROUTE, hostBase()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, name }),
    })
    const payload = (await response.json().catch(() => undefined)) as
      | WorktreeCreateValue
      | { code?: string; message?: string }
      | undefined
    if (!response.ok || payload === undefined || !('ok' in payload)) {
      const failure = payload as { code?: string; message?: string } | undefined
      throw new WorktreeHttpError(response.status, failure?.code, failure?.message)
    }
    return payload
  }

  private async runStatus(sessionId: string, cwd: string): Promise<void> {
    try {
      const url = new URL(WORKTREE_STATUS_ROUTE, hostBase())
      url.searchParams.set('sessionId', sessionId)
      const response = await this.fetcher(url, { headers: { accept: 'application/json' } })
      if (!response.ok) {
        this.publish(cwd, undefined)
        return
      }
      const payload = (await response.json()) as WorktreeStatusPayload
      this.publish(cwd, payload)
    } catch {
      // An unreachable host reads as no repository: the header shows no
      // button rather than a broken one.
      this.publish(cwd, undefined)
    }
  }

  /** Publish one resolved status into the shared cache. */
  private publish(cwd: string, payload: WorktreeStatusPayload | undefined): void {
    const next = new Map(this.status.getSnapshot())
    if (payload === undefined) next.delete(cwd)
    else next.set(cwd, payload)
    this.status.set(next)
  }
}
