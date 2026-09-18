/**
 * Git execution over the composition's subprocess seam. The runtime contract
 * is `ctx.subprocess` (`SubprocessRuntime`); the shapes are narrowed locally
 * so the host half carries no bare runtime imports and tests can double the
 * service with a behavioral contract.
 * @module dsh-worktree-jump/git
 */
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** Offset-based collected reader, narrowed from `SubprocessOutputReader`. */
export interface OutputReaderLike {
    readFrom(fromByte: number): {
        text: string;
        nextOffset: number;
        lossy: boolean;
        spillPath?: string;
    };
}
/** One live subprocess, narrowed to the members {@link runGit} reads. */
export interface SubprocessHandleLike {
    readonly stdin: unknown;
    readonly stdout: unknown;
    readonly stderr: unknown;
    readonly collected: {
        readonly stdout?: OutputReaderLike;
        readonly stderr?: OutputReaderLike;
    };
    readonly done: Promise<{
        exitCode: number | null;
        signal: string | null;
    }>;
    terminate(): void;
    waitForExit(signal?: AbortSignal): Promise<boolean>;
}
/** The slice of `SubprocessRuntime` this plugin spawns through. */
export interface SubprocessRuntimeLike {
    spawn(spec: SubprocessSpawnSpec): SubprocessHandleLike;
}
/** One completed git invocation: exit facts plus captured stream text. */
export interface GitRunResult {
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly stdout: string;
    readonly stderr: string;
}
/** The subprocess died by signal, or the deadline aborted the spawn. */
export declare class GitTimeoutError extends Error {
}
/** Error carrying one failed git invocation's exit facts. */
export declare class GitFailureError extends Error {
    readonly result: GitRunResult;
    readonly argv: readonly string[];
    constructor(result: GitRunResult, argv: readonly string[]);
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
export declare function runGit(subprocess: SubprocessRuntimeLike, argv: readonly string[], cwd: string, timeoutMs: number): Promise<GitRunResult>;
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
export declare function gitOk(subprocess: SubprocessRuntimeLike, cwd: string, timeoutMs: number, args: readonly string[]): Promise<string>;
/**
 * Read one file as UTF-8 text, or undefined when it does not exist.
 * @param fs - node:fs/promises surface (injectable for tests).
 * @param path - absolute file path.
 * @returns file text, or undefined when the file does not exist.
 */
export declare function readTextFileIfExists(fs: Pick<typeof import('node:fs/promises'), 'readFile'>, path: string): Promise<string | undefined>;
