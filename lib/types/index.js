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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseWorktreeJumpConfig } from "./config.js";
import { registerWorktreeRoutes } from "./routes.js";
/** Cordis plugin name; stable per composition. */
export const name = 'worktree-jump';
/**
 * Required services, all Cordis Services of the web composition: webServer
 * (route carrier), connection (trust fence), subprocess (git), sessionQuery
 * (session reads), agents (fork create), agentDefaultModel (provider/model),
 * and workspaceRegistry (sidebar grouping). The fiber stays PENDING until all
 * resolve, then apply runs once.
 */
export const inject = [
    'webServer', 'connection', 'subprocess', 'sessionQuery', 'agents', 'agentDefaultModel', 'workspaceRegistry',
];
/**
 * Plugin body: parse config fail-loud, then register the routes as effects.
 * @param ctx - host context carrying the web composition.
 * @param config - deployment configuration; defaults live in the parser.
 */
export function apply(ctx, config = {}) {
    const parsed = parseWorktreeJumpConfig(config);
    const webServer = ctx.get('webServer');
    const connection = ctx.get('connection');
    const subprocess = ctx.get('subprocess');
    const sessionQuery = ctx.get('sessionQuery');
    const agents = ctx.get('agents');
    const agentDefaultModel = ctx.get('agentDefaultModel');
    const workspaceRegistry = ctx.get('workspaceRegistry');
    const agentPresets = ctx.get('agentPresets');
    // Fail loud at load: the web composition provides every injected service
    // next to the webserver; a missing one means the plugin mounted where it
    // cannot be hosted (no silent route-less degradation).
    if (webServer === undefined || connection === undefined || subprocess === undefined
        || sessionQuery === undefined || agents === undefined || agentDefaultModel === undefined) {
        throw new Error('worktree-jump: a required service (webServer, connection, subprocess, sessionQuery, agents, '
            + 'agentDefaultModel) is missing; this plugin requires the standard web composition');
    }
    const host = {
        subprocess,
        sessionQuery,
        agents,
        agentDefaultModel,
        // Optional capabilities: absence only skips preset mounting / grouping.
        agentPresets,
        workspaceRegistry,
        fs: { mkdir, readFile, writeFile },
    };
    ctx.effect(() => registerWorktreeRoutes(webServer, { host, config: parsed, connection }), 'worktree-jump: routes');
}
//# sourceMappingURL=index.js.map