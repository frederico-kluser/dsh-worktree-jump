import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, relative } from "node:path";
//#region lib/types/config.js
const DEFAULT_CONFIG = { gitTimeoutMs: 3e4 };
/** Validate one unknown config record; every violation rejects the load. */
function parseWorktreeJumpConfig(input) {
	if (input === void 0 || input === null) return { gitTimeoutMs: DEFAULT_CONFIG.gitTimeoutMs };
	if (typeof input !== "object" || Array.isArray(input)) throw new Error("worktree-jump: config must be an object");
	const record = input;
	const worktreeRoot = record["worktreeRoot"];
	if (worktreeRoot !== void 0 && worktreeRoot !== null) {
		if (typeof worktreeRoot !== "string" || !worktreeRoot.startsWith("/")) throw new Error("worktree-jump: config.worktreeRoot must be an absolute path when set");
	}
	const gitTimeoutMs = record["gitTimeoutMs"];
	if (gitTimeoutMs !== void 0) {
		if (typeof gitTimeoutMs !== "number" || !Number.isSafeInteger(gitTimeoutMs) || gitTimeoutMs < 1 || gitTimeoutMs > 6e5) throw new Error("worktree-jump: config.gitTimeoutMs must be a safe integer in [1, 600000]");
	}
	return {
		...typeof worktreeRoot === "string" ? { worktreeRoot } : {},
		gitTimeoutMs: gitTimeoutMs ?? DEFAULT_CONFIG.gitTimeoutMs
	};
}
//#endregion
//#region lib/types/git.js
/**
* Git execution over the composition's subprocess seam. The runtime contract
* is `ctx.subprocess` (`SubprocessRuntime`); the shapes are narrowed locally
* so the host half carries no bare runtime imports and tests can double the
* service with a behavioral contract.
* @module dsh-worktree-jump/git
*/
/** The subprocess died by signal, or the deadline aborted the spawn. */
var GitTimeoutError = class extends Error {};
/** Error carrying one failed git invocation's exit facts. */
var GitFailureError = class extends Error {
	result;
	argv;
	constructor(result, argv) {
		super(`git ${argv.slice(1).join(" ")} failed (exit ${String(result.exitCode)}): ${result.stderr.trim().split("\n").at(-1) ?? ""}`);
		this.result = result;
		this.argv = argv;
		this.name = "GitFailureError";
	}
};
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
async function runGit(subprocess, argv, cwd, timeoutMs) {
	const abort = new AbortController();
	const timer = setTimeout(() => {
		abort.abort();
	}, timeoutMs);
	try {
		const child = subprocess.spawn({
			argv: [...argv],
			cwd,
			stdio: {
				stdin: "ignore",
				stdout: { maxBytes: 1 << 20 },
				stderr: { maxBytes: 65536 }
			},
			graceMs: 2e3,
			signal: abort.signal,
			env: {
				GIT_TERMINAL_PROMPT: "0",
				GIT_OPTIONAL_LOCKS: "0"
			}
		});
		const outcome = await child.done;
		const stdout = child.collected.stdout?.readFrom(0).text ?? "";
		const stderr = child.collected.stderr?.readFrom(0).text ?? "";
		return {
			exitCode: outcome.exitCode,
			signal: outcome.signal,
			stdout,
			stderr
		};
	} finally {
		clearTimeout(timer);
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
async function gitOk(subprocess, cwd, timeoutMs, args) {
	const result = await runGit(subprocess, ["git", ...args], cwd, timeoutMs);
	if (result.signal !== null) throw new GitTimeoutError(`git ${args.join(" ")} was killed by ${result.signal}`);
	if (result.exitCode !== 0) throw new GitFailureError(result, ["git", ...args]);
	return result.stdout.trim();
}
//#endregion
//#region lib/types/brand.js
/**
* Local duplicate of the compile-time brand primitives (`@deepseek-ai/dsh-brand`
* semantics, `packages/util/brand` is the source of truth): a brand makes
* structurally identical strings non-interchangeable at the type level while
* comparison and serialization keep the underlying primitive. The package
* carries no runtime identity, so a local copy is interchangeable with the
* installed one — and keeps this plugin free of bare runtime imports, since
* it loads from an arbitrary filesystem location with no node_modules.
* @module dsh-worktree-jump/brand
*/
/**
* Apply a compile-time string brand without changing the value. The
* constraint is a plain string (not the local `Branded`): brands from other
* declaration sites (the installed `@deepseek-ai/dsh-brand`) are structurally
* distinct types, and this helper only re-labels admitted values.
* @param value - string admitted by the domain that owns the target brand.
* @returns the same string with the requested compile-time brand.
*/
function brandString(value) {
	return value;
}
//#endregion
//#region lib/types/session-brands.js
/**
* Local admission for the Session log-offset brand (runtime twin of the
* `SessionLogOffset` function in `@deepseek-ai/dsh-session`, whose durable
* boundary re-validates): non-negative safe integer in, brand out. Kept local
* so the plugin carries no bare runtime imports; the branded type is a local
* alias, which is safe here because the receiving boundary validates the
* number again.
* @module dsh-worktree-jump/session-brands
*/
/**
* Admit a numeric value as a Session log offset.
* @param value - non-negative safe integer used as a gap or prefix length.
* @returns the same number with the Session-log-offset brand.
* @throws {TypeError} when the value is not a non-negative safe integer.
*/
function SessionLogOffset(value) {
	if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`SessionLogOffset must be a non-negative safe integer, got ${String(value)}`);
	return value;
}
//#endregion
//#region lib/types/fork.js
/**
* Session fork engine for the "conversation transport": fork a live Session
* into a new Session whose creation `cwd` is the worktree path, instead of
* the source's own (a Session header's `cwd` is frozen creation metadata, so
* DSH has no in-place switch). The child inherits the source's history
* through its last completed turn, rides `parentSession` lineage, mounts the
* source's agent preset (or the deployment default), and starts with the
* current default model selection — the same flow the harness's own fork
* command runs, with the cwd overridden.
* @module dsh-worktree-jump/fork
*/
/** Typed rejection; the routes translate it to a wire error. */
var ForkRejection = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "ForkRejection";
	}
};
/**
* Compute the fork cut: everything through the last completed turn, extended
* to the next turn boundary exactly like the harness's own fork command, or
* an empty cut when no turn ever completed.
* @param events - the source Session's full event log.
* @returns the balanced seed cut, or a blank cut for an eventless source.
*/
function computeForkCut(events) {
	const boundary = events.findLast((event) => event.type === "turn/end");
	if (boundary === void 0) return {
		seed: [],
		inheritedEventCount: 0,
		seeded: false
	};
	let cut = boundary.seq + 1;
	while (cut < events.length && events[cut]?.type !== "turn/start") cut += 1;
	return {
		seed: events.slice(0, cut),
		inheritedEventCount: cut,
		seeded: true
	};
}
/**
* Fork the source Session into `worktreePath` and return the child identity.
*
* The child inherits the source's history through its last completed turn,
* is created with `meta.cwd` set to the worktree path, and mounts the same
* agent preset the source runs (the deployment default when the source
* records none). The parent identity rides `parentSession`, so session
* lineage keeps showing the continuation relationship.
* @param host - narrowed host capabilities.
* @param sourceId - the Session to transport.
* @param worktreePath - absolute worktree directory for the child's cwd.
* @param source - observed source Session (header, events, projections).
* @returns the child Session id.
* @throws {ForkRejection} for every pre-condition failure, before any mutation.
*/
async function forkSessionInto(host, sourceId, worktreePath, source) {
	if (source.header.id !== sourceId) throw new ForkRejection("session-not-found", `session "${sourceId}" not found`);
	if (source.header.origin === "subagent") throw new ForkRejection("subagent-session", `session "${sourceId}" is a subagent session`);
	if (source.header.cwd === void 0) throw new ForkRejection("no-workspace", `session "${sourceId}" records no workspace directory`);
	const presetId = source.projections?.values["agentPreset"];
	let agentPreset;
	let setup;
	if (host.agentPresets !== void 0) {
		const resolved = await host.agentPresets.resolve(typeof presetId === "string" ? presetId : void 0);
		agentPreset = resolved.id;
		setup = (agentCtx) => host.agentPresets.mount(agentCtx, resolved.id);
	}
	const cut = computeForkCut(source.events);
	const childId = brandString(`session-${randomUUID()}`);
	const { provider, model } = host.agentDefaultModel.currentSelection();
	try {
		await host.agents.create({
			sessionId: childId,
			...cut.seeded ? {
				seed: cut.seed,
				inheritedEventCount: SessionLogOffset(cut.inheritedEventCount)
			} : {},
			meta: {
				cwd: worktreePath,
				parentSession: source.header.id,
				...cut.seeded ? { isSeeded: true } : {},
				...agentPreset !== void 0 ? { agentPreset } : {}
			},
			agentOptions: {
				provider,
				model
			},
			...setup !== void 0 ? { setup } : {}
		});
	} catch (error) {
		if (error instanceof ForkRejection) throw error;
		throw new ForkRejection("fork-unavailable", `failed to fork session "${sourceId}" into "${worktreePath}": ${error instanceof Error ? error.message : String(error)}`);
	}
	return childId;
}
//#endregion
//#region lib/types/shared.js
/**
* Wire contract shared by the host routes and the browser half: route paths,
* payload types, and the worktree-name grammar. Types and constants only —
* both halves import this file, so it must carry no runtime dependencies.
* @module dsh-worktree-jump/shared
*/
/** Route prefix owned by this plugin on the composition's web server. */
const WORKTREE_ROUTE_PREFIX = "/dsh-worktree";
/** Status read: is the session's workspace directory a git work tree. */
const WORKTREE_STATUS_ROUTE = `${WORKTREE_ROUTE_PREFIX}/status`;
/** Mutation: create a worktree and fork the session into it. */
const WORKTREE_CREATE_ROUTE = `${WORKTREE_ROUTE_PREFIX}/create`;
/**
* Worktree/branch-name grammar the create route admits: one filesystem and
* git-safe segment, no separators, no leading dot or dash, 1–64 chars.
*/
const WORKTREE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
/**
* Validate one requested worktree name.
* @param name - raw client-supplied name.
* @returns the validated name.
* @throws when the name is not a single safe filesystem and git segment.
*/
function validateWorktreeName(name) {
	if (!WORKTREE_NAME_PATTERN.test(name)) throw new Error("invalid worktree name: use 1-64 characters, letters/digits first, then letters, digits, dots, underscores, or hyphens; no slashes or spaces");
	if (name === "." || name === "..") throw new Error("invalid worktree name: \".\" and \"..\" are reserved");
	return name;
}
/**
* Plan one worktree creation from the repository facts and configuration.
* The default root is `<repoRoot>/.worktrees` (kept out of git through the
* repository-local `.git/info/exclude`, so no tracked file is touched); an
* explicit config root outside the repository excludes nothing.
* @param repoRoot - absolute repository working-tree root.
* @param gitDir - absolute main-worktree `.git` directory from rev-parse.
* @param name - validated worktree name.
* @param configRoot - configured worktree root, or undefined for the default.
* @returns the creation plan.
*/
function planWorktree(repoRoot, gitDir, name, configRoot) {
	const worktreeRoot = configRoot ?? join(repoRoot, ".worktrees");
	const worktreePath = join(worktreeRoot, name);
	const rel = relative(repoRoot, worktreeRoot);
	return {
		worktreeRoot,
		worktreePath,
		branch: name,
		excludeEntry: rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? toPosix(rel) + "/" : void 0,
		excludeFile: join(gitDir, "info", "exclude")
	};
}
/**
* Whether the exclude file already ignores the worktree directory, matching
* the exact entry {@link planWorktree} would add (line-trimmed compare).
* @param content - current exclude file text, or undefined when absent.
* @param entry - the directory entry with trailing slash.
* @returns true when the entry is already present.
*/
function excludeContains(content, entry) {
	if (content === void 0) return false;
	return content.split("\n").some((line) => line.trim() === entry);
}
/**
* Build the full exclude-file text after appending the entry, preserving
* trailing-newline shape and adding a provenance comment once.
* @param content - current exclude file text, or undefined when absent.
* @param entry - the directory entry with trailing slash.
* @returns the complete new file text; unchanged when the entry already exists.
*/
function withExcludeEntry(content, entry) {
	if (excludeContains(content, entry)) return content ?? "";
	const marker = "# added by dsh-worktree-jump (created worktrees live here)";
	if (content === void 0 || content.trim() === "") return `${marker}\n${entry}\n`;
	return `${content}${!content.endsWith("\n") ? "\n" : ""}${marker}\n${entry}\n`;
}
/** Convert one path to forward slashes for display and wire payloads. */
function toPosix(value) {
	return value.split("\\").join("/");
}
//#endregion
//#region lib/types/service.js
/**
* Host business operations for the worktree routes: the status read and the
* create flow (plan → exclude → worktree add → session fork → workspace
* attach). This module owns every effect; `routes.ts` only unwraps HTTP.
* @module dsh-worktree-jump/service
*/
var __addDisposableResource = function(env, value, async) {
	if (value !== null && value !== void 0) {
		if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
		var dispose, inner;
		if (async) {
			if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
			dispose = value[Symbol.asyncDispose];
		}
		if (dispose === void 0) {
			if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
			dispose = value[Symbol.dispose];
			if (async) inner = dispose;
		}
		if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
		if (inner) dispose = function() {
			try {
				inner.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		};
		env.stack.push({
			value,
			dispose,
			async
		});
	} else if (async) env.stack.push({ async: true });
	return value;
};
var __disposeResources = (function(SuppressedError) {
	return function(env) {
		function fail(e) {
			env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
			env.hasError = true;
		}
		var r, s = 0;
		function next() {
			while (r = env.stack.pop()) try {
				if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
				if (r.dispose) {
					var result = r.dispose.call(r.value);
					if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
						fail(e);
						return next();
					});
				} else s |= 1;
			} catch (e) {
				fail(e);
			}
			if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
			if (env.hasError) throw env.error;
		}
		return next();
	};
})(typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
	var e = new Error(message);
	return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
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
async function repoFacts(query, subprocess, sessionId, timeoutMs, configuredRoot) {
	const cwd = await workspaceOf(query, sessionId);
	if (cwd === void 0) return {
		isGitRepo: false,
		worktrees: []
	};
	const inside = await insideWorkTree(subprocess, cwd, timeoutMs);
	if (!inside.inside) return {
		cwd,
		isGitRepo: false,
		worktrees: []
	};
	const [branch, worktrees] = await Promise.all([currentBranch(subprocess, cwd, timeoutMs), worktreeList(subprocess, inside.repoRoot, timeoutMs)]);
	return {
		cwd,
		isGitRepo: true,
		repoRoot: inside.repoRoot,
		gitDir: inside.gitDir,
		branch,
		worktreeRoot: configuredRoot ?? `${inside.repoRoot}/.worktrees`,
		worktrees
	};
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
async function createWorktreeAndFork(host, sessionId, name, config) {
	const cwd = await workspaceDirectory(host.sessionQuery, sessionId);
	const inside = await insideWorkTree(host.subprocess, cwd, config.gitTimeoutMs);
	if (!inside.inside) throw new ForkRejection("not-git-repo", `"${cwd}" is not inside a git working tree`);
	const plan = planWorktree(inside.repoRoot, inside.gitDir, name, config.worktreeRoot);
	await ensureExcluded(host.fs, plan);
	await mkdir(plan.worktreeRoot, { recursive: true });
	await gitOk(host.subprocess, inside.repoRoot, config.gitTimeoutMs, [
		"worktree",
		"add",
		plan.worktreePath,
		"-b",
		plan.branch
	]);
	const childId = await forkObservedSession(host, sessionId, plan.worktreePath);
	return {
		plan,
		childId,
		workspaceAttached: await attachWorkspace(host.workspaceRegistry, plan.worktreePath, childId)
	};
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
async function attachWorkspace(registry, worktreePath, childId) {
	if (registry === void 0) return false;
	try {
		await (await registry.create(worktreePath)).attachSession(childId);
		return true;
	} catch {
		return false;
	}
}
/**
* Keep the worktree root out of git status via `.git/info/exclude` — the
* repository-local, never-tracked exclusion file, so no tracked file changes.
* @param fs - filesystem surface.
* @param plan - the creation plan naming the exclude file and entry.
*/
async function ensureExcluded(fs, plan) {
	const entry = plan.excludeEntry;
	if (entry === void 0) return;
	const current = await readFileIfExists(fs, plan.excludeFile);
	await mkdir(dirnameOf(plan.excludeFile), { recursive: true });
	await fs.writeFile(plan.excludeFile, withExcludeEntry(current, entry), "utf8");
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
async function forkObservedSession(host, sessionId, worktreePath) {
	const env_1 = {
		stack: [],
		error: void 0,
		hasError: false
	};
	try {
		const observation = __addDisposableResource(env_1, await host.sessionQuery.observeSession(sessionId), false);
		return forkSessionInto({
			agents: host.agents,
			agentDefaultModel: host.agentDefaultModel,
			agentPresets: host.agentPresets
		}, observation.header.id, worktreePath, {
			header: observation.header,
			events: observation.events,
			...observation.projections !== void 0 ? { projections: observation.projections } : {}
		});
	} catch (e_1) {
		env_1.error = e_1;
		env_1.hasError = true;
	} finally {
		__disposeResources(env_1);
	}
}
/**
* Read the session's workspace directory, or undefined when it records none.
* Unknown sessions reject through the session-query engine.
* @param query - narrowed session-query engine.
* @param sessionId - session identity.
* @returns the workspace directory, or undefined.
*/
async function workspaceOf(query, sessionId) {
	const env_2 = {
		stack: [],
		error: void 0,
		hasError: false
	};
	try {
		return __addDisposableResource(env_2, await query.observeSession(sessionId), false).header.cwd;
	} catch (e_2) {
		env_2.error = e_2;
		env_2.hasError = true;
	} finally {
		__disposeResources(env_2);
	}
}
/** The session's workspace directory, rejecting sessions without one. */
async function workspaceDirectory(query, sessionId) {
	const cwd = await workspaceOf(query, sessionId);
	if (cwd === void 0) throw new ForkRejection("no-workspace", `session "${sessionId}" records no workspace directory`);
	return cwd;
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
async function insideWorkTree(subprocess, cwd, timeoutMs) {
	try {
		return {
			inside: true,
			repoRoot: await gitOk(subprocess, cwd, timeoutMs, ["rev-parse", "--show-toplevel"]),
			gitDir: await gitOk(subprocess, cwd, timeoutMs, [
				"rev-parse",
				"--path-format=absolute",
				"--git-common-dir"
			])
		};
	} catch {
		return {
			inside: false,
			repoRoot: "",
			gitDir: ""
		};
	}
}
/** Current branch name; a detached or unborn HEAD reads as `(detached)`. */
async function currentBranch(subprocess, cwd, timeoutMs) {
	try {
		return await gitOk(subprocess, cwd, timeoutMs, [
			"rev-parse",
			"--abbrev-ref",
			"HEAD"
		]);
	} catch {
		return "(detached)";
	}
}
/**
* Parse `git worktree list --porcelain` into structured rows, in git's own
* order (main worktree first).
* @param porcelain - the command's stdout.
* @returns one row per worktree block that carries a path.
*/
function parseWorktreeList(porcelain) {
	const rows = [];
	for (const block of porcelain.split("\n\n")) {
		let path;
		let head;
		let branch;
		for (const line of block.split("\n")) if (line.startsWith("worktree ")) path = line.slice(9);
		else if (line.startsWith("HEAD ")) head = line.slice(5);
		else if (line.startsWith("branch refs/heads/")) branch = line.slice(18);
		if (path === void 0) continue;
		rows.push({
			path,
			branch: branch ?? "(detached)",
			head: head?.slice(0, 9) ?? ""
		});
	}
	return rows;
}
/**
* List the repository's worktrees; a failing command reads as an empty list
* (status display is best effort; creation re-fails loud on its own step).
* @param subprocess - the composition's subprocess runtime.
* @param repoRoot - repository root to list from.
* @param timeoutMs - per-command deadline.
* @returns the worktree rows.
*/
async function worktreeList(subprocess, repoRoot, timeoutMs) {
	const result = await runGit(subprocess, [
		"git",
		"worktree",
		"list",
		"--porcelain"
	], repoRoot, timeoutMs);
	if (result.exitCode !== 0 || result.signal !== null) return [];
	return parseWorktreeList(result.stdout);
}
/** Read one UTF-8 file through the injected surface, or undefined when absent. */
async function readFileIfExists(fs, path) {
	try {
		return await fs.readFile(path, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return void 0;
		throw error;
	}
}
/** Directory portion of an absolute file path (node:path dirname twin). */
function dirnameOf(filePath) {
	const index = filePath.lastIndexOf("/");
	return index === -1 ? "." : filePath.slice(0, index);
}
//#endregion
//#region lib/types/routes.js
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
/** POST bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024;
/** Uniform JSON answer; status and create outcomes are live facts (no-store). */
function sendJson(res, status, payload) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(payload));
}
/** 405 carrying the route's single supported method. */
function sendMethodNotAllowed(res, allow) {
	res.statusCode = 405;
	res.setHeader("allow", allow);
	res.end();
}
/** Collect a bounded request body as UTF-8 text; null past the ceiling (stream drained). */
async function readBoundedBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.byteLength;
		if (size > MAX_BODY_BYTES) {
			req.resume();
			return null;
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size).toString("utf8");
}
/** Parse one create body: JSON object with non-empty string sessionId and a name. */
function parseCreateBody(text) {
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof body !== "object" || body === null) return null;
	const { sessionId, name } = body;
	if (typeof sessionId !== "string" || sessionId === "" || typeof name !== "string") return null;
	return {
		sessionId,
		name
	};
}
/** Map one operation failure to its wire status and structured body. */
function wireErrorOf(error) {
	if (error instanceof ForkRejection) return {
		status: error.code === "session-not-found" ? 404 : error.code === "subagent-session" ? 409 : error.code === "no-workspace" ? 409 : error.code === "not-git-repo" ? 409 : 502,
		body: {
			code: error.code,
			message: error.message
		}
	};
	if (error instanceof Error && error.message.startsWith("invalid worktree name")) return {
		status: 400,
		body: {
			code: "invalid-name",
			message: error.message
		}
	};
	if (error instanceof Error && (error.name === "SessionQueryError" || error.message.includes("SESSION_QUERY_SESSION_NOT_FOUND") || error.message.includes("not found"))) return {
		status: 404,
		body: {
			code: "session-not-found",
			message: error.message
		}
	};
	return {
		status: 500,
		body: {
			code: "create-failed",
			message: error instanceof Error ? error.message : String(error)
		}
	};
}
/**
* Register the status and create routes as effects on the composition's web
* server. Every request passes the trust fence before any logic runs, and the
* fence's 401/403 is answered without a body, like the host's own denials.
* @param webServer - the composition's web-server service.
* @param deps - host capability set, configuration, and trust fence.
* @returns a disposer that removes both routes.
*/
function registerWorktreeRoutes(webServer, deps) {
	/** Answer an untrusted/unauthenticated request; true when rejected. */
	const rejected = (req, res) => {
		const rejection = deps.connection.requestRejection(req);
		if (rejection === void 0) return false;
		res.statusCode = rejection;
		res.end();
		return true;
	};
	const disposeStatus = webServer.register({
		kind: "exact",
		path: WORKTREE_STATUS_ROUTE,
		handler: async (req, res) => {
			if (rejected(req, res)) return;
			if (req.method !== "GET") {
				sendMethodNotAllowed(res, "GET");
				return;
			}
			const sessionId = new URL(String(req.url), "http://localhost").searchParams.get("sessionId");
			if (sessionId === null || sessionId === "") {
				sendJson(res, 400, {
					code: "bad-request",
					message: "sessionId query parameter is required"
				});
				return;
			}
			try {
				const facts = await repoFacts(deps.host.sessionQuery, deps.host.subprocess, sessionId, deps.config.gitTimeoutMs, deps.config.worktreeRoot);
				sendJson(res, 200, {
					cwd: facts.cwd,
					isGitRepo: facts.isGitRepo,
					...facts.repoRoot !== "" && facts.repoRoot !== void 0 ? { repoRoot: facts.repoRoot } : {},
					...facts.gitDir !== "" && facts.gitDir !== void 0 ? { gitDir: facts.gitDir } : {},
					...facts.isGitRepo ? { worktreeRoot: facts.worktreeRoot } : {},
					...facts.branch !== void 0 ? { branch: facts.branch } : {},
					worktrees: facts.worktrees
				});
			} catch (error) {
				const { status, body } = wireErrorOf(error);
				sendJson(res, status, body);
			}
		}
	});
	const disposeCreate = webServer.register({
		kind: "exact",
		path: WORKTREE_CREATE_ROUTE,
		handler: async (req, res) => {
			if (rejected(req, res)) return;
			if (req.method !== "POST") {
				sendMethodNotAllowed(res, "POST");
				return;
			}
			if (String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
				sendJson(res, 415, {
					code: "bad-request",
					message: "content-type must be application/json"
				});
				return;
			}
			let text;
			try {
				text = await readBoundedBody(req);
			} catch {
				sendJson(res, 400, {
					code: "bad-request",
					message: "request body unreadable"
				});
				return;
			}
			if (text === null) {
				sendJson(res, 413, {
					code: "bad-request",
					message: "request body is too large"
				});
				return;
			}
			const body = parseCreateBody(text);
			if (body === null) {
				sendJson(res, 400, {
					code: "bad-request",
					message: "request body must be JSON with string \"sessionId\" and \"name\""
				});
				return;
			}
			try {
				const name = validateWorktreeName(body.name);
				const outcome = await createWorktreeAndFork(deps.host, body.sessionId, name, deps.config);
				sendJson(res, 200, {
					ok: true,
					sessionId: outcome.childId,
					worktreePath: outcome.plan.worktreePath,
					branch: outcome.plan.branch
				});
			} catch (error) {
				const { status, body: payload } = wireErrorOf(error);
				sendJson(res, status, payload);
			}
		}
	});
	return () => {
		disposeCreate();
		disposeStatus();
	};
}
//#endregion
//#region lib/types/index.js
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
/** Cordis plugin name; stable per composition. */
const name = "worktree-jump";
/**
* Required services, all Cordis Services of the web composition: webServer
* (route carrier), connection (trust fence), subprocess (git), sessionQuery
* (session reads), agents (fork create), agentDefaultModel (provider/model),
* and workspaceRegistry (sidebar grouping). The fiber stays PENDING until all
* resolve, then apply runs once.
*/
const inject = [
	"webServer",
	"connection",
	"subprocess",
	"sessionQuery",
	"agents",
	"agentDefaultModel",
	"workspaceRegistry"
];
/**
* Plugin body: parse config fail-loud, then register the routes as effects.
* @param ctx - host context carrying the web composition.
* @param config - deployment configuration; defaults live in the parser.
*/
function apply(ctx, config = {}) {
	const parsed = parseWorktreeJumpConfig(config);
	const webServer = ctx.get("webServer");
	const connection = ctx.get("connection");
	const subprocess = ctx.get("subprocess");
	const sessionQuery = ctx.get("sessionQuery");
	const agents = ctx.get("agents");
	const agentDefaultModel = ctx.get("agentDefaultModel");
	const workspaceRegistry = ctx.get("workspaceRegistry");
	const agentPresets = ctx.get("agentPresets");
	if (webServer === void 0 || connection === void 0 || subprocess === void 0 || sessionQuery === void 0 || agents === void 0 || agentDefaultModel === void 0) throw new Error("worktree-jump: a required service (webServer, connection, subprocess, sessionQuery, agents, agentDefaultModel) is missing; this plugin requires the standard web composition");
	const host = {
		subprocess,
		sessionQuery,
		agents,
		agentDefaultModel,
		agentPresets,
		workspaceRegistry,
		fs: {
			mkdir,
			readFile,
			writeFile
		}
	};
	ctx.effect(() => registerWorktreeRoutes(webServer, {
		host,
		config: parsed,
		connection
	}), "worktree-jump: routes");
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=index.js.map