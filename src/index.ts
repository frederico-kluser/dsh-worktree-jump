/**
 * dsh-worktree-jump — host half.
 *
 * A web button that creates a git worktree from the current session's
 * repository and transports the conversation into it: the browser half
 * (`dsh.client` + `exports["./client"]`) contributes an input-dock card in
 * the New-Conversation hero, and the create route forks the live Session
 * with its frozen creation `cwd` pointed at the new worktree (a Session
 * header's cwd is immutable, so the fork IS the transport — same history, new
 * working directory).
 *
 * Routes run behind the composition's connection trust fence; trust is asked
 * first, wire validation second, business logic last.
 * @module dsh-worktree-jump
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-workspace'
import { parseWorktreeJumpConfig } from './config.ts'
import { registerWorktreeRoutes } from './routes.ts'
import type { ConnectionLike, WebServerLike } from './host-services.ts'
import type { WorktreeHost } from './service.ts'
import type { SubprocessRuntimeLike } from './git.ts'

/** Cordis plugin name; stable per composition. */
export const name = 'worktree-jump'

/**
 * Required services, all Cordis Services of the web composition: webServer
 * (route carrier), connection (trust fence), subprocess (git), sessionQuery
 * (session reads), agents (fork create), agentDefaultModel (provider/model),
 * and workspaceRegistry (sidebar grouping). The fiber stays PENDING until all
 * resolve, then apply runs once.
 */
export const inject = [
  'webServer', 'connection', 'subprocess', 'sessionQuery', 'agents', 'agentDefaultModel', 'workspaceRegistry',
]

/** Deployment configuration (validated, cordis.yml-overridable). */
export interface Config {
  /**
   * Directory under which new worktrees are created; absent (or null) keeps
   * the per-repository default `<repoRoot>/.worktrees`, excluded via
   * `.git/info/exclude` so no tracked file changes.
   */
  readonly worktreeRoot?: string
  /** Per-git-command deadline in milliseconds. */
  readonly gitTimeoutMs?: number
}

/**
 * Plugin body: parse config fail-loud, then register the routes as effects.
 * @param ctx - host context carrying the web composition.
 * @param config - deployment configuration; defaults live in the parser.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const parsed = parseWorktreeJumpConfig(config)
  const webServer = ctx.get('webServer') as unknown as WebServerLike | undefined
  const connection = ctx.get('connection') as unknown as ConnectionLike | undefined
  const subprocess = ctx.get('subprocess') as unknown as SubprocessRuntimeLike | undefined
  const sessionQuery = ctx.get('sessionQuery') as unknown as WorktreeHost['sessionQuery'] | undefined
  const agents = ctx.get('agents') as unknown as WorktreeHost['agents'] | undefined
  const agentDefaultModel = ctx.get('agentDefaultModel') as unknown as WorktreeHost['agentDefaultModel'] | undefined
  const workspaceRegistry = ctx.get('workspaceRegistry') as unknown as
    | WorktreeHost['workspaceRegistry']
    | undefined
  const agentPresets = ctx.get('agentPresets') as unknown as WorktreeHost['agentPresets'] | undefined

  // Fail loud at load: the web composition provides every injected service
  // next to the webserver; a missing one means the plugin mounted where it
  // cannot be hosted (no silent route-less degradation).
  if (webServer === undefined || connection === undefined || subprocess === undefined
    || sessionQuery === undefined || agents === undefined || agentDefaultModel === undefined) {
    throw new Error(
      'worktree-jump: a required service (webServer, connection, subprocess, sessionQuery, agents, '
      + 'agentDefaultModel) is missing; this plugin requires the standard web composition',
    )
  }

  const host: WorktreeHost = {
    subprocess,
    sessionQuery,
    agents,
    agentDefaultModel,
    // Optional capabilities: absence only skips preset mounting / grouping.
    agentPresets,
    workspaceRegistry,
    fs: { mkdir, readFile, writeFile },
  }
  ctx.effect(
    () => registerWorktreeRoutes(webServer, { host, config: parsed, connection }),
    'worktree-jump: routes',
  )
}
