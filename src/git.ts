/**
 * Git execution over the composition's subprocess seam. The runtime contract
 * is `ctx.subprocess` (`SubprocessRuntime`); the shapes are narrowed locally
 * so the host half carries no bare runtime imports and tests can double the
 * service with a behavioral contract.
 * @module dsh-worktree-jump/git
 */

import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** Offset-based collected reader, narrowed from `SubprocessOutputReader`. */
export interface OutputReaderLike {
  readFrom(fromByte: number): {
    text: string
    nextOffset: number
    lossy: boolean
    spillPath?: string
  }
}

/** One live subprocess, narrowed to the members {@link runGit} reads. */
export interface SubprocessHandleLike {
  readonly stdin: unknown
  readonly stdout: unknown
  readonly stderr: unknown
  readonly collected: {
    readonly stdout?: OutputReaderLike
    readonly stderr?: OutputReaderLike
  }
  readonly done: Promise<{ exitCode: number | null; signal: string | null }>
  terminate(): void
  waitForExit(signal?: AbortSignal): Promise<boolean>
}

/** The slice of `SubprocessRuntime` this plugin spawns through. */
export interface SubprocessRuntimeLike {
  spawn(spec: SubprocessSpawnSpec): SubprocessHandleLike
}

/** One completed git invocation: exit facts plus captured stream text. */
export interface GitRunResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
}

/** The subprocess died by signal, or the deadline aborted the spawn. */
export class GitTimeoutError extends Error {}

/** Error carrying one failed git invocation's exit facts. */
export class GitFailureError extends Error {
  constructor(
    readonly result: GitRunResult,
    readonly argv: readonly string[],
  ) {
    super(
      `git ${argv.slice(1).join(' ')} failed`
      + ` (exit ${String(result.exitCode)}): ${result.stderr.trim().split('\n').at(-1) ?? ''}`,
    )
    this.name = 'GitFailureError'
  }
}

/**
 * Run one git command to completion and return its captured streams.
 *
 * Spawn goes through the host's subprocess runtime (managed tree, scrubbed
 * env base), never a raw child_process call. stdin is /dev/null, both output
 * streams collect bounded, and the deadline aborts the managed range. A
 * signal death or abort reads as a timeout failure: git that stops answering
 * is exactly the state the caller cannot distinguish a hang from.
 * @param subprocess - the composition's subprocess runtime.
 * @param argv - git arguments; `argv[0]` is the git executable.
 * @param cwd - working directory for the command.
 * @param timeoutMs - per-command deadline in milliseconds.
 * @returns exit code, signal, and both captured streams.
 */
export async function runGit(
  subprocess: SubprocessRuntimeLike,
  argv: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<GitRunResult> {
  const abort = new AbortController()
  const timer = setTimeout(() => { abort.abort() }, timeoutMs)
  try {
    const child = subprocess.spawn({
      argv: [...argv],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 1 << 20 },
        stderr: { maxBytes: 1 << 16 },
      },
      graceMs: 2_000,
      signal: abort.signal,
      env: {
        // git must never stop and wait for a human; advisory locks off keep
        // status-like reads from touching the index lock.
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    })
    const outcome = await child.done
    const stdout = child.collected.stdout?.readFrom(0).text ?? ''
    const stderr = child.collected.stderr?.readFrom(0).text ?? ''
    return { exitCode: outcome.exitCode, signal: outcome.signal, stdout, stderr }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run one git command that must exit 0, returning trimmed stdout.
 * @param subprocess - the composition's subprocess runtime.
 * @param cwd - working directory for the command.
 * @param timeoutMs - per-command deadline in milliseconds.
 * @param args - git arguments after the executable.
 * @returns trimmed stdout.
 * @throws {GitTimeoutError} when the command died by signal.
 * @throws {GitFailureError} when git exited non-zero.
 */
export async function gitOk(
  subprocess: SubprocessRuntimeLike,
  cwd: string,
  timeoutMs: number,
  args: readonly string[],
): Promise<string> {
  const result = await runGit(subprocess, ['git', ...args], cwd, timeoutMs)
  if (result.signal !== null) throw new GitTimeoutError(`git ${args.join(' ')} was killed by ${result.signal}`)
  if (result.exitCode !== 0) throw new GitFailureError(result, ['git', ...args])
  return result.stdout.trim()
}

/**
 * Read one file as UTF-8 text, or undefined when it does not exist.
 * @param fs - node:fs/promises surface (injectable for tests).
 * @param path - absolute file path.
 * @returns file text, or undefined when the file does not exist.
 */
export async function readTextFileIfExists(
  fs: Pick<typeof import('node:fs/promises'), 'readFile'>,
  path: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw error
  }
}
