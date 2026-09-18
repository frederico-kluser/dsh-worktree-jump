# dsh-worktree-jump

A DeepSeek Harness (DSH) plugin: **one button in the web UI that creates a git worktree and moves the current conversation into it.**

Click the branch icon in a session header, type a name (e.g. `my-feature`), confirm — and the conversation continues inside `<repo>/.worktrees/<my-feature>`, with the model working there instead of the original folder. The button only appears when the session's workspace directory is inside a git repository.

```
┌────────────────────────────────────────────────────────────────┐
│  session header …                    [branch icon] [open-in] ⋯ │
└────────────────────────────────────────────────────────────────┘
        │ click
        ▼
┌─ Create a worktree ────────────────────────────────────────────┐
│  Worktree name  [ my-feature              ]                    │
│  Letters, digits, dots, underscores, hyphens.                  │
│  Repository: /home/you/proj  ·  main                           │
│  Existing worktrees (2) ▸                                      │
│                        [Cancel]  [Create and move]             │
└────────────────────────────────────────────────────────────────┘
        │  host: git worktree add <repo>/.worktrees/<name> -b <name>
        │        + fork the live Session with meta.cwd = worktree
        ▼
  the same conversation, now rooted in the worktree
  (sidebar nests the child under the source; a Workspace is
   created over the worktree directory)
```

## Why a fork is the transport

A DSH Session header's `cwd` is **frozen creation metadata** — the harness has no in-place directory switch (the system prompt's `{{cwd}}`, the shell tool's default workdir, and the sandbox root all derive from `session.header.cwd`). The documented way to carry a conversation into a new directory is a fork: the harness's own `session.fork` RPC inherits the source `cwd` verbatim, so this plugin runs the *same* host-side fork flow (`sessionQuery` observation → `agents.create` with a balanced completed-turn seed, `parentSession` lineage, the source's mounted agent preset, the current default model) with the one difference the product needs: **`meta.cwd` is the worktree path**.

Concretely, clicking *Create and move* does, in order:

1. **Validate** the name (1–64 chars, letters/digits first, then letters, digits, `.`, `_`, `-`; no slashes, spaces, or leading `.`/`-`) — a single safe filesystem and git segment, reused as the branch name.
2. **Plan** the worktree: default root `<repoRoot>/.worktrees/`, overridable via config.
3. **Exclude** the worktree root through `.git/info/exclude` (the repository-local, never-tracked file — no tracked file is ever modified).
4. **Create**: `git worktree add <path> -b <name>` through the host's subprocess runtime (managed process tree, scrubbed env, per-command deadline, `GIT_TERMINAL_PROMPT=0` so git never waits for a human).
5. **Fork**: `agents.create` with the source's events through its last completed turn (`isSeeded` + exact inherited length), `parentSession` lineage, the source's agent preset mounted, and `meta.cwd` overridden to the worktree path. A source with no completed turn yet forks as a blank continuation (nothing durable exists to inherit; the original stays untouched).
6. **Group**: find-or-create a Workspace over the worktree directory and attach the child, so the sidebar groups the continuation under its directory. Attachment failure never fails the create — the session exists and is openable either way.
7. The browser half opens the child session (`ctx.uiWorkspace.openSession`, falling back to the session list) — same transcript, new working directory.

The **original session stays behind** in the original folder; the fork is the continuation. That is the DSH model (immutable creation metadata), and it also means the move is reversible by simply switching back in the sidebar.

## Install

The plugin is standalone ESM with **zero runtime dependencies** (the host half imports only node builtins; the browser half requires only platform module-table words). The built artifacts are committed under `lib/`, so installing never runs a build script.

**From GitHub** (git-hosted bundle; no prepare script, so no `allowBuilds` dance):

```sh
dsh plugin --profile web add github:frederico-kluser/dsh-worktree-jump
```

`dsh plugin add` appends the package to the profile's bundle list (`dsh.profile.bundles`) because this package declares `dsh.bundle.patch`. Restart `dsh web` (or reload it if your build supports live profile patches) and the button appears in every session whose workspace is a git repository.

**From a local checkout** (dev loop): point a user patch layer at the built entry — absolute paths are valid loader entries:

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml
- insert:
    - id: worktree-jump
      name: '/absolute/path/to/dsh-worktree-jump/lib/index.js'
```

Remove the entry to deactivate. Precedence and the four patch layers are documented in the DSH plugin docs.

## Configuration

Validated at load; a violation fails the load loud (never a permissive fallback).

| Key | Default | Meaning |
| --- | --- | --- |
| `worktreeRoot` | per-repo `<repoRoot>/.worktrees` | Where new worktrees are created. A root outside the repository skips the exclude-file step. |
| `gitTimeoutMs` | `30000` | Per-git-command deadline (1–600000). |

```yaml
- id: worktree-jump
  name: 'dsh-worktree-jump'
  config:
    worktreeRoot: /srv/worktrees
    gitTimeoutMs: 10000
```

## Security model

The surface is two loopback routes behind the composition's existing trust fence — the same fence every first-party web route asks first (`connection.requestRejection`: Host/Origin fence against DNS rebinding + browser authentication). On top of it:

- **No path is ever accepted from the wire.** The status and create routes take a `sessionId`; the workspace directory, repository root, and worktree path derive from the session's own header and the resolved repository. A malicious page cannot probe arbitrary directories.
- **Wire validation** on the create body: exactly `application/json`, 64 KiB ceiling, string fields, and the name grammar above. Method guards answer 405; denials are structured and byte-identical per code (no information leaks).
- **No shell**: git runs through the host subprocess seam with an explicit argv (never shell-interpreted), stdin ignored, a bounded environment (`GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`), and a deadline that aborts the managed process range.
- **No secrets** are stored, logged, or transmitted; the plugin writes exactly one file per create (`.git/info/exclude`) and one directory tree (the worktree).
- Client `POST`s carry a JSON content type, which cross-site pages cannot send without a CORS preflight the host never grants.

## Development

Build and tests expect a DeepSeek Harness checkout nearby (for the TypeScript toolchain and the `@deepseek-ai/*` type declarations — build-time only, symlinked into `node_modules/`):

```sh
DSH_CHECKOUT=/path/to/deepseek-harness npm run setup   # or pnpm run setup
npm run build      # tsc typecheck + tsdown (node half ESM + browser CJS factory bundle)
npm test           # 35 node:test cases
```

Tests are **fully isolated by construction**: real git only inside `os.tmpdir()` fixtures, no ports, no sockets, no `DSH_HOME` access, no network. Doubles follow behavioral contracts (the subprocess double spawns real processes through the spawn-spec shape, so a runtime change breaks tests loudly); the patch-semantics tests run the vendored harness code (`applyEntryPatches`) itself. The suite asserts the security behaviors adversarially: fence ordering (rejection before any logic), method guards, media-type and body-size refusals, unknown sessions, non-repositories, name forgery, and that the fork always lands on the worktree path — never the original folder.

## Verified API surface

Everything the plugin touches was checked against real DSH sources, not prose: `webServer.register` exact routes and duplicate-throw semantics (`@deepseek-ai/dsh-host-webserver`), the connection trust fence (`@deepseek-ai/dsh-client-connection` node half, the same call the shipped open-in-app host half makes), `subprocess` spawn-spec subprocesses, `sessionQuery.observeSession` (exact observations with projections), `agents.create` with `meta.cwd` override + seed/inheritedEventCount (`@deepseek-ai/dsh-agent` `CreateAgentOptions`), `agentPresets.resolve/mount`, `workspaceRegistry.create/attachSession`, the `conversation.session.header.utilities` slot and `useSessions` standard prop (the shipped `ui-open-in-app` contribution is the reference), the client-module `dsh.client`/`exports["./client"]` browser roster, the `__ModuleLoader__.load({id, factory})` CJS-factory bundle contract, and the live user-patch watcher (`watchUserPatches` → `entry.update`, which no-ops unchanged entries — the property that makes hot activation safe).

## License

[MIT](./LICENSE)
