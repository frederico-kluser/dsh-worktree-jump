/**
 * Host business operations for the worktree routes: the status read and the
 * create flow (plan → exclude → worktree add → session fork → workspace
 * attach). This module owns every effect; `routes.ts` only unwraps HTTP.
 * @module dsh-worktree-jump/service
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import { runGit, gitOk, type SubprocessRuntimeLike } from './git.ts'
import { forkSessionInto, ForkRejection, type ForkHost } from './fork.ts'
import type { SessionQueryEngineLike } from './host-services.ts'
import {
  DEFAULT_WORKTREE_DIRNAME, planWorktree, withExcludeEntry,
  type WorktreePlan,
} from './worktree.ts'
import type { WorktreeInfo } from './shared.ts'

/** Narrowed node:fs/promises surface, injectable for tests. */
export type FsLike = Pick<typeof import('node:fs/promises'), 'mkdir' | 'readFile' | 'writeFile'>

/** The optional workspace capability: find-or-create a Workspace over a directory. */
export interface WorkspaceRegistryLike {
  create(path: string): Promise<{ attachSession(sessionId: SessionId): Promise<void> }>
}

/** Full host capability set the business operations read through. */
export interface WorktreeHost {
  readonly subprocess: SubprocessRuntimeLike
  readonly sessionQuery: SessionQueryEngineLike
  readonly agents: ForkHost['agents']
  readonly agentDefaultModel: { currentSelection(): { provider: string; model: string } }
  readonly agentPresets: ForkHost['agentPresets']
  /** Optional workspace capability; absence only skips sidebar grouping. */
  readonly workspaceRegistry: WorkspaceRegistryLike | undefined
  readonly fs: FsLike
}

/** Everything the routes learned about the session's repository. */
export interface RepoFacts {
  /** The session's workspace directory, when it declares one. */
  readonly cwd?: string
  readonly isGitRepo: boolean
  readonly repoRoot?: string
  readonly gitDir?: string
  readonly branch?: string
  readonly worktreeRoot?: string
  readonly worktrees: readonly WorktreeInfo[]
}

/**
 * Read the session's workspace repository facts: repo root, common git dir,
 * current branch, and the full worktree list. A session without a cwd, or
 * whose cwd is not inside a git working tree, reports `isGitRepo: false` —
 * the state the browser button hides on.
 * @param query - narrowed session-query engine.
 * @param subprocess - the composition's subprocess runtime.
 * @param sessionId - session whose workspace directory to inspect.
 * @param timeoutMs - per-git-command deadline.
 * @param configuredRoot - configured worktree root override, when set.
 * @returns the repository facts.
 */
export async function repoFacts(
  query: SessionQueryEngineLike,
  subprocess: SubprocessRuntimeLike,
  sessionId: string,
  timeoutMs: number,
  configuredRoot: string | undefined,
): Promise<RepoFacts> {
  const cwd = await workspaceOf(query, sessionId)
  if (cwd === undefined) return { isGitRepo: false, worktrees: [] }
  const inside = await insideWorkTree(subprocess, cwd, timeoutMs)
  if (!inside.inside) {
    return { cwd, isGitRepo: false, worktrees: [] }
  }
  const [branch, worktrees] = await Promise.all([
    currentBranch(subprocess, cwd, timeoutMs),
    worktreeList(subprocess, inside.repoRoot, timeoutMs),
  ])
  return {
    cwd,
    isGitRepo: true,
    repoRoot: inside.repoRoot,
    gitDir: inside.gitDir,
    branch,
    worktreeRoot: configuredRoot ?? `${inside.repoRoot}/${DEFAULT_WORKTREE_DIRNAME}`,
    worktrees,
  }
}

/** Result of one successful create. */
export interface CreateOutcome {
  readonly plan: WorktreePlan
  readonly childId: SessionId
  /** Whether the child Session was attached to a Workspace over the worktree. */
  readonly workspaceAttached: boolean
}

/**
 * Create the worktree and fork the conversation into it, in that order so a
 * failed git step never leaves a forked Session behind.
 * @param host - the host capability set.
 * @param sessionId - session to transport.
 * @param name - worktree/branch name (already validated by the caller).
 * @param config - deployment configuration.
 * @returns the created plan, the child Session id, and grouping outcome.
 * @throws {ForkRejection} with code `no-workspace` when the session records no
 *   workspace directory, or `not-git-repo` when the directory is not a work tree.
 * @throws {GitFailureError} when a git step exits non-zero.
 * @throws {ForkRejection} when the fork pre-conditions fail.
 */
export async function createWorktreeAndFork(
  host: WorktreeHost,
  sessionId: string,
  name: string,
  config: { worktreeRoot?: string; gitTimeoutMs: number },
): Promise<CreateOutcome> {
  const cwd = await workspaceDirectory(host.sessionQuery, sessionId)
  const inside = await insideWorkTree(host.subprocess, cwd, config.gitTimeoutMs)
  if (!inside.inside) throw new ForkRejection('not-git-repo', `"${cwd}" is not inside a git working tree`)
  const plan = planWorktree(inside.repoRoot, inside.gitDir, name, config.worktreeRoot)
  // Fail loud before mutating: an existing worktree or branch is a pickable
  // state, not an error — the dialog offers it as a start target.
  if ((await worktreeList(host.subprocess, inside.repoRoot, config.gitTimeoutMs))
    .some(worktree => worktree.path === plan.worktreePath)) {
    throw new ForkRejection('worktree-exists', `a worktree already exists at "${plan.worktreePath}"`)
  }
  const branchProbe = await runGit(
    host.subprocess,
    ['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${plan.branch}`],
    inside.repoRoot,
    config.gitTimeoutMs,
  )
  if (branchProbe.exitCode === 0) {
    throw new ForkRejection('branch-exists', `a branch named "${plan.branch}" already exists`)
  }
  await ensureExcluded(host.fs, plan)
  await host.fs.mkdir(plan.worktreeRoot, { recursive: true })
  await gitOk(
    host.subprocess,
    inside.repoRoot,
    config.gitTimeoutMs,
    ['worktree', 'add', plan.worktreePath, '-b', plan.branch],
  )
  const childId = await forkObservedSession(host, sessionId, plan.worktreePath)
  const workspaceAttached = await attachWorkspace(host.workspaceRegistry, plan.worktreePath, childId)
  return { plan, childId, workspaceAttached }
}

/** Result of one successful start-from-existing. */
export interface StartOutcome {
  /** Plan-shaped view over the chosen worktree (no creation happened). */
  readonly plan: WorktreePlan
  readonly childId: SessionId
  /** Whether the child Session was attached to a Workspace over the worktree. */
  readonly workspaceAttached: boolean
}

/**
 * Start the conversation inside an existing worktree of the source's
 * repository: the child Session is forked from the source (a blank source
 * starts fresh) with its frozen creation `cwd` pointed at the chosen
 * worktree directory. The directory must be an existing git work tree; a
 * workspace is found-or-created over it for sidebar grouping, and an
 * attachment failure never fails the start.
 * @param host - the host capability set.
 * @param sessionId - session to transport.
 * @param worktreePath - absolute existing worktree directory.
 * @param config - deployment configuration.
 * @returns the chosen worktree view, the child Session id, and grouping outcome.
 * @throws {ForkRejection} `not-git-repo` when the directory is not a work tree.
 * @throws {ForkRejection} `no-workspace` when the session records no cwd.
 */
export async function startInExistingWorktree(
  host: WorktreeHost,
  sessionId: string,
  worktreePath: string,
  config: { worktreeRoot?: string; gitTimeoutMs: number },
): Promise<StartOutcome> {
  await workspaceDirectory(host.sessionQuery, sessionId)
  const chosen = await insideWorkTree(host.subprocess, worktreePath, config.gitTimeoutMs)
  if (!chosen.inside) {
    throw new ForkRejection('not-git-repo', `"${worktreePath}" is not a git working tree`)
  }
  const branch = await currentBranch(host.subprocess, worktreePath, config.gitTimeoutMs)
  const plan: WorktreePlan = {
    worktreeRoot: chosen.repoRoot,
    worktreePath,
    branch,
    excludeEntry: undefined,
    excludeFile: join(chosen.gitDir, 'info', 'exclude'),
  }
  const childId = await forkObservedSession(host, sessionId, worktreePath)
  const workspaceAttached = await attachWorkspace(host.workspaceRegistry, worktreePath, childId)
  return { plan, childId, workspaceAttached }
}

/**
 * Find-or-create a Workspace over the worktree directory and attach the child
 * Session, so sidebar grouping shows the continuation under its directory.
 * Attachment failure never fails the create: the Session exists and is
 * openable; only grouping is affected.
 * @param registry - optional workspace registry capability.
 * @param worktreePath - absolute worktree directory.
 * @param childId - the forked child Session id.
 * @returns whether the child was attached to a workspace.
 */
async function attachWorkspace(
  registry: WorkspaceRegistryLike | undefined,
  worktreePath: string,
  childId: SessionId,
): Promise<boolean> {
  if (registry === undefined) return false
  try {
    const workspace = await registry.create(worktreePath)
    await workspace.attachSession(childId)
    return true
  } catch {
    return false
  }
}

/**
 * Keep the worktree root out of git status via `.git/info/exclude` — the
 * repository-local, never-tracked exclusion file, so no tracked file changes.
 * @param fs - filesystem surface.
 * @param plan - the creation plan naming the exclude file and entry.
 */
async function ensureExcluded(fs: FsLike, plan: WorktreePlan): Promise<void> {
  const entry = plan.excludeEntry
  if (entry === undefined) return
  const current = await readFileIfExists(fs, plan.excludeFile)
  await mkdir(dirnameOf(plan.excludeFile), { recursive: true })
  await fs.writeFile(plan.excludeFile, withExcludeEntry(current, entry), 'utf8')
}

/**
 * Fork the session through one exact observation and dispose the observation
 * promptly: the fork reads header, events, and projections synchronously
 * before `agents.create` runs, so the retained cut releases early.
 * @param host - the host capability set (fork-facing slice).
 * @param sessionId - session to transport.
 * @param worktreePath - absolute worktree directory for the child's cwd.
 * @returns the child Session id.
 */
async function forkObservedSession(
  host: Pick<WorktreeHost, 'sessionQuery' | 'agents' | 'agentDefaultModel' | 'agentPresets'>,
  sessionId: string,
  worktreePath: string,
): Promise<SessionId> {
  using observation = await host.sessionQuery.observeSession(sessionId as SessionId)
  return forkSessionInto(
    {
      agents: host.agents,
      agentDefaultModel: host.agentDefaultModel,
      agentPresets: host.agentPresets,
    },
    observation.header.id,
    worktreePath,
    {
      header: observation.header,
      events: observation.events,
      ...(observation.projections !== undefined ? { projections: observation.projections } : {}),
    },
  )
}

/**
 * Resolve a session's workspace directory, rejecting unknown sessions and
 * sessions that record none.
 * @param query - narrowed session-query engine.
 * @param sessionId - wire-supplied session identity.
 * @returns the absolute workspace directory.
 * @throws {ForkRejection} when the session records no workspace directory.
 */
export async function resolveWorkspaceDirectory(
  query: SessionQueryEngineLike,
  sessionId: string,
): Promise<string> {
  return workspaceDirectory(query, sessionId)
}

/**
 * Read the session's workspace directory, or undefined when it records none.
 * Unknown sessions reject through the session-query engine.
 * @param query - narrowed session-query engine.
 * @param sessionId - session identity.
 * @returns the workspace directory, or undefined.
 */
export async function workspaceOf(
  query: SessionQueryEngineLike,
  sessionId: string,
): Promise<string | undefined> {
  using observation = await query.observeSession(sessionId as SessionId)
  return observation.header.cwd
}

/** The session's workspace directory, rejecting sessions without one. */
async function workspaceDirectory(query: SessionQueryEngineLike, sessionId: string): Promise<string> {
  const cwd = await workspaceOf(query, sessionId)
  if (cwd === undefined) {
    throw new ForkRejection('no-workspace', `session "${sessionId}" records no workspace directory`)
  }
  return cwd
}

/** Result of the inside-a-work-tree probe. */
interface InsideResult {
  readonly inside: boolean
  readonly repoRoot: string
  readonly gitDir: string
}

/**
 * Probe whether a directory is inside a git working tree and resolve the
 * repository root plus the common `.git` directory (the worktree metadata
 * home, shared by every linked worktree of the repository).
 * @param subprocess - the composition's subprocess runtime.
 * @param cwd - directory to probe.
 * @param timeoutMs - per-command deadline.
 * @returns the probe result; `inside: false` when git rejects the directory.
 */
export async function insideWorkTree(
  subprocess: SubprocessRuntimeLike,
  cwd: string,
  timeoutMs: number,
): Promise<InsideResult> {
  try {
    const repoRoot = await gitOk(subprocess, cwd, timeoutMs, ['rev-parse', '--show-toplevel'])
    const gitDir = await gitOk(
      subprocess, cwd, timeoutMs,
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    )
    return { inside: true, repoRoot, gitDir }
  } catch {
    return { inside: false, repoRoot: '', gitDir: '' }
  }
}

/** Current branch name; a detached or unborn HEAD reads as `(detached)`. */
async function currentBranch(
  subprocess: SubprocessRuntimeLike,
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  try {
    return await gitOk(subprocess, cwd, timeoutMs, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return '(detached)'
  }
}

/**
 * Parse `git worktree list --porcelain` into structured rows, in git's own
 * order (main worktree first).
 * @param porcelain - the command's stdout.
 * @returns one row per worktree block that carries a path.
 */
export function parseWorktreeList(porcelain: string): readonly WorktreeInfo[] {
  const rows: WorktreeInfo[] = []
  for (const block of porcelain.split('\n\n')) {
    let path: string | undefined
    let head: string | undefined
    let branch: string | undefined
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch refs/heads/')) branch = line.slice('branch refs/heads/'.length)
    }
    if (path === undefined) continue
    rows.push({
      path,
      branch: branch ?? '(detached)',
      head: head?.slice(0, 9) ?? '',
    })
  }
  return rows
}

/**
 * List the repository's worktrees; a failing command reads as an empty list
 * (status display is best effort; creation re-fails loud on its own step).
 * @param subprocess - the composition's subprocess runtime.
 * @param repoRoot - repository root to list from.
 * @param timeoutMs - per-command deadline.
 * @returns the worktree rows.
 */
export async function worktreeList(
  subprocess: SubprocessRuntimeLike,
  repoRoot: string,
  timeoutMs: number,
): Promise<readonly WorktreeInfo[]> {
  const result = await runGit(
    subprocess, ['git', 'worktree', 'list', '--porcelain'], repoRoot, timeoutMs,
  )
  if (result.exitCode !== 0 || result.signal !== null) return []
  return parseWorktreeList(result.stdout)
}

/** Read one UTF-8 file through the injected surface, or undefined when absent. */
async function readFileIfExists(fs: FsLike, path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw error
  }
}

/** Directory portion of an absolute file path (node:path dirname twin). */
function dirnameOf(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index === -1 ? '.' : filePath.slice(0, index)
}

/** Re-export so route code imports the plan type from one place. */
export type { WorktreePlan, WorktreeInfo }
