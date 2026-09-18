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
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name; stable per composition. */
export declare const name = "worktree-jump";
/**
 * Required services, all Cordis Services of the web composition: webServer
 * (route carrier), connection (trust fence), subprocess (git), sessionQuery
 * (session reads), agents (fork create), agentDefaultModel (provider/model),
 * and workspaceRegistry (sidebar grouping). The fiber stays PENDING until all
 * resolve, then apply runs once.
 */
export declare const inject: string[];
/** Deployment configuration (validated, cordis.yml-overridable). */
export interface Config {
    /**
     * Directory under which new worktrees are created; absent (or null) keeps
     * the per-repository default `<repoRoot>/.worktrees`, excluded via
     * `.git/info/exclude` so no tracked file changes.
     */
    readonly worktreeRoot?: string;
    /** Per-git-command deadline in milliseconds. */
    readonly gitTimeoutMs?: number;
}
/**
 * Plugin body: parse config fail-loud, then register the routes as effects.
 * @param ctx - host context carrying the web composition.
 * @param config - deployment configuration; defaults live in the parser.
 */
export declare function apply(ctx: Context, config?: Config): void;
