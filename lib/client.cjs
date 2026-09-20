window.__ModuleLoader__.load({
	id: "dsh-worktree-jump",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
		/** Mutation: start the conversation from an existing worktree directory. */
		const WORKTREE_START_ROUTE = `${WORKTREE_ROUTE_PREFIX}/start`;
		//#endregion
		//#region lib/types/client/controller.js
		/**
		* Browser state and HTTP carrier for the worktree button: per-cwd status
		* caching and the create call. Failures surface through the dialog, never as
		* broken chrome; an unreachable host reads as "not a git repo" (no button).
		* @module worktree-jump/client/controller
		*/
		/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
		function hostBase() {
			const origin = globalThis.location?.origin;
			return origin !== void 0 && origin !== "null" ? origin : "http://dsh.internal";
		}
		/** One failed create: the HTTP status plus the server's structured code. */
		var WorktreeHttpError = class extends Error {
			status;
			code;
			/**
			* @param status - HTTP status of the failed create.
			* @param code - the server's structured error code, when present.
			* @param message - server message, when present.
			*/
			constructor(status, code, message) {
				super(message ?? `HTTP ${String(status)}`);
				this.status = status;
				this.code = code;
				this.name = "WorktreeHttpError";
			}
		};
		/**
		* Browser state and HTTP carrier for the worktree button: the per-cwd status
		* cache (every Session header shares one truth) and the create POST.
		*/
		var WorktreeController = class {
			fetcher;
			/** Published status per workspace directory; keyed by cwd, not session id. */
			status = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(/* @__PURE__ */ new Map());
			/** In-flight status reads per cwd; concurrent readers share one fetch. */
			loading = /* @__PURE__ */ new Map();
			/**
			* @param fetcher - HTTP carrier for the status read and the create POST.
			*/
			constructor(fetcher = (input, init) => fetch(input, init)) {
				this.fetcher = fetcher;
			}
			/**
			* Ensure a status read is running (or resolved) for one session's cwd.
			* Concurrent calls share the read; a failure publishes no entry, which the
			* button reads as "not a git repository".
			* @param sessionId - the current Session.
			* @param cwd - the session's workspace directory.
			* @returns resolution after the status is published or the read failed.
			*/
			loadStatus(sessionId, cwd) {
				const inflight = this.loading.get(cwd);
				if (inflight !== void 0) return inflight;
				const run = this.runStatus(sessionId, cwd).finally(() => {
					this.loading.delete(cwd);
				});
				this.loading.set(cwd, run);
				return run;
			}
			/**
			* Read the cached status for a workspace directory.
			* @param cwd - the session's workspace directory.
			* @returns the published status, or undefined before the first read lands.
			*/
			statusOf(cwd) {
				return this.status.getSnapshot().get(cwd);
			}
			/**
			* Create the worktree and fork the conversation into it.
			* @param sessionId - the current Session.
			* @param name - worktree/branch name as typed (the host validates).
			* @returns the create value; rejects with {@link WorktreeHttpError} on failure.
			*/
			async create(sessionId, name) {
				const response = await this.fetcher(new URL(WORKTREE_CREATE_ROUTE, hostBase()), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						name
					})
				});
				return this.parseCreateResponse(response);
			}
			/**
			* Start the conversation inside an existing worktree directory.
			* @param sessionId - the current Session.
			* @param path - absolute existing worktree directory.
			* @returns the start value; rejects with {@link WorktreeHttpError} on failure.
			*/
			async start(sessionId, path) {
				const response = await this.fetcher(new URL(WORKTREE_START_ROUTE, hostBase()), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						path
					})
				});
				return this.parseCreateResponse(response);
			}
			/** Shared create/start answer handling: ok value or structured failure. */
			async parseCreateResponse(response) {
				const payload = await response.json().catch(() => void 0);
				if (!response.ok || payload === void 0 || !("ok" in payload)) {
					const failure = payload;
					throw new WorktreeHttpError(response.status, failure?.code, failure?.message);
				}
				return payload;
			}
			async runStatus(sessionId, cwd) {
				try {
					const url = new URL(WORKTREE_STATUS_ROUTE, hostBase());
					url.searchParams.set("sessionId", sessionId);
					const response = await this.fetcher(url, { headers: { accept: "application/json" } });
					if (!response.ok) {
						this.publish(cwd, void 0);
						return;
					}
					const payload = await response.json();
					this.publish(cwd, payload);
				} catch {
					this.publish(cwd, void 0);
				}
			}
			/** Publish one resolved status into the shared cache. */
			publish(cwd, payload) {
				const next = new Map(this.status.getSnapshot());
				if (payload === void 0) next.delete(cwd);
				else next.set(cwd, payload);
				this.status.set(next);
			}
		};
		//#endregion
		//#region lib/types/client/WorktreeButton.js
		/**
		* The New-Conversation worktree trigger and its dialog. The trigger renders
		* as a chip in the same style as the "Choose workspace" selector and sits
		* immediately to its LEFT, in the same row, through the
		* `conversation.input.overlay` slot (the session-scoped overlay strip the
		* shipped command popup also uses). The hero affords a plugin no hook before
		* the workspace chip, so the chip is anchored to the live chip element: the
		* trigger's right edge is fixed at the chip's left edge (8px gap) and it
		* re-measures on mount, resize, and scroll. It renders only while the current
		* Session is blank (the New-Conversation state) and the picked workspace
		* directory is a git repository; a started conversation never shows it again.
		* Styling rides DSH tokens only — no stylesheet pipeline.
		* @module worktree-jump/client/WorktreeButton
		*/
		/** Server-code → dictionary-key table for the dialog's error line. Codes
		* whose server message carries the actionable cause (fork-unavailable,
		* git-failed) fall through to the server's own message. */
		const ERROR_KEY = {
			"invalid-name": "error.invalid-name",
			"worktree-exists": "error.worktree-exists",
			"branch-exists": "error.branch-exists",
			"not-git-repo": "error.not-git-repo"
		};
		/**
		* The "Choose workspace" chip this trigger flanks. The chip keeps this
		* aria-label in every state (placeholder and named), so the query is stable
		* across workspace picks. Never prefixes this plugin's own button, whose
		* aria-label is its own localized string.
		*/
		const WORKSPACE_CHIP_SELECTOR = "[aria-label=\"Choose workspace\"]";
		/** Gap (px) between the worktree chip and the workspace chip it flanks. */
		const CHIP_GAP = 8;
		/** Measure the workspace chip's current viewport box, when it exists. */
		function measureChipAnchor() {
			const chip = document.querySelector(WORKSPACE_CHIP_SELECTOR);
			if (chip === null) return void 0;
			const rect = chip.getBoundingClientRect();
			return rect.width > 0 ? {
				top: rect.top,
				left: rect.left
			} : void 0;
		}
		/** Trigger styles, mirroring the host's workspace chip (HeroShell.module.css
		* `.workspace`): pill, transparent, primary label, 13/20/500. */
		const styles = {
			trigger: {
				position: "fixed",
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				boxSizing: "border-box",
				maxWidth: 360,
				minHeight: 28,
				padding: "0 8px",
				border: "none",
				borderRadius: 16,
				background: "transparent",
				color: "var(--dsw-alias-label-primary)",
				fontSize: 13,
				lineHeight: "20px",
				fontWeight: 500,
				cursor: "pointer"
			},
			/** Hover feedback: the same token the workspace chip uses. */
			triggerHover: { background: "var(--dsw-alias-interactive-bg-hover)" },
			/** One-line label with ellipsis, like the chip's. */
			label: {
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			/** The Modal body column has no intrinsic gap; this grid restores the
			* spacing between the field, hint, repository line, and picker. */
			bodyGrid: {
				display: "grid",
				gap: 10,
				alignContent: "start",
				minWidth: 0
			},
			fieldLabel: {
				fontSize: 13,
				lineHeight: "20px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			fieldInput: {
				boxSizing: "border-box",
				width: "100%",
				height: 32,
				padding: "0 8px",
				border: "0.5px solid var(--dsw-alias-border-l4)",
				borderRadius: 8,
				background: "var(--dsw-alias-bg-layer-1)",
				fontSize: 14,
				lineHeight: "22px",
				color: "var(--dsw-alias-label-primary)",
				outline: "none"
			},
			hint: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)"
			},
			repoLine: {
				margin: 0,
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)",
				minWidth: 0
			},
			repoPath: {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			branch: {
				flex: "none",
				border: "0.5px solid var(--dsw-alias-border-l2)",
				borderRadius: 999,
				padding: "0 8px",
				fontSize: 11,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)"
			},
			picker: {
				display: "grid",
				gap: 6
			},
			pickTitle: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)"
			},
			pickButton: { width: "100%" },
			/** Two-line pick content: the branch name leads, the directory explains. */
			pickContent: {
				display: "grid",
				justifyItems: "start",
				gap: 1,
				minWidth: 0,
				textAlign: "left"
			},
			pickBranch: {
				fontSize: 13,
				lineHeight: "18px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				maxWidth: "100%"
			},
			pickPath: {
				fontSize: 11,
				lineHeight: "16px",
				color: "var(--dsw-alias-label-secondary)",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				maxWidth: "100%"
			},
			existingList: {
				display: "grid",
				gap: 6,
				maxHeight: 180,
				overflowY: "auto"
			},
			error: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-tone-danger, #c0392b)"
			}
		};
		/**
		* The trigger. Hidden until the current Session is a blank one (the
		* New-Conversation state) whose picked workspace directory the host reported
		* as a git repository; a started conversation never shows it again.
		* @param props - session runtime, injected controller face, and localized copy.
		* @returns the flanking chip (and dialog when open), or null when not applicable.
		*/
		function WorktreeAction(props) {
			const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, startInWorkspace, openSession } = props;
			const blank = useSession((state) => state.blank);
			const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
			const statusMap = useWorktreeStatus((map) => map);
			const [dialogOpen, setDialogOpen] = (0, react.useState)(false);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [anchor, setAnchor] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				if (cwd === void 0 || cwd === "") return;
				loadStatus(sessionId, cwd);
			}, [
				sessionId,
				cwd,
				loadStatus
			]);
			(0, react.useEffect)(() => {
				const measure = () => {
					setAnchor(measureChipAnchor());
				};
				measure();
				const frame = requestAnimationFrame(measure);
				window.addEventListener("resize", measure);
				window.addEventListener("scroll", measure, true);
				return () => {
					cancelAnimationFrame(frame);
					window.removeEventListener("resize", measure);
					window.removeEventListener("scroll", measure, true);
				};
			}, []);
			const status = cwd === void 0 ? void 0 : statusMap.get(cwd);
			if (!blank || cwd === void 0 || cwd === "" || status === void 0 || !status.isGitRepo) return null;
			if (anchor === void 0) return null;
			const repoName = cwd.split("/").filter((part) => part !== "").at(-1) ?? cwd;
			const anchorStyle = {
				...styles.trigger,
				...hovered ? styles.triggerHover : void 0,
				top: anchor.top,
				right: window.innerWidth - anchor.left + CHIP_GAP
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onPointerDown: (event) => {
					event.stopPropagation();
				},
				onClick: (event) => {
					event.stopPropagation();
					setDialogOpen(true);
				},
				onMouseEnter: () => {
					setHovered(true);
				},
				onMouseLeave: () => {
					setHovered(false);
				},
				"aria-label": t("button.aria"),
				title: t("button.tooltip", { repo: repoName }),
				style: anchorStyle,
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size: 16 }), (0, react_jsx_runtime.jsx)("span", {
					style: styles.label,
					children: `${t("button.label")} · ${repoName}`
				})]
			}), (0, react_jsx_runtime.jsx)(WorktreeDialog, {
				open: dialogOpen,
				onClose: () => {
					setDialogOpen(false);
				},
				sessionId,
				cwd,
				status,
				create,
				start,
				startInWorkspace,
				openSession,
				t
			})] });
		}
		/**
		* The naming dialog: one input, repository facts, the pickable existing
		* worktrees, and the create action. On success the UI opens the forked child
		* Session — the conversation starts inside the worktree; when the host
		* reports a fork failure it fell back to a fresh Session inside the
		* workspace, which the dialog starts and opens. The Modal primitive owns the
		* chrome; the body is one token-native grid with breathing room.
		* @param props - open state, session facts, host status, and injected verbs.
		* @returns the modal, or null when closed.
		*/
		function WorktreeDialog(props) {
			const { open, onClose, sessionId, cwd, status, create, start, startInWorkspace, openSession, t } = props;
			const [name, setName] = (0, react.useState)("");
			const [phase, setPhase] = (0, react.useState)("idle");
			const [error, setError] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				if (!open) {
					setName("");
					setError(void 0);
					setPhase("idle");
				}
			}, [open]);
			const busy = phase !== "idle";
			/** Adopt one create/start outcome: fork opened, else the workspace fallback. */
			const adopt = (value) => {
				setPhase("idle");
				onClose();
				if (value.sessionId !== void 0) {
					openSession(value.sessionId);
					return;
				}
				if (value.workspaceId !== void 0) startInWorkspace(value.workspaceId).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			const submit = () => {
				if (busy || name.trim() === "") return;
				setPhase("creating");
				setError(void 0);
				create(sessionId, name.trim()).then(adopt).catch((cause) => {
					setPhase("idle");
					setError(errorTextOf(cause, t));
				});
			};
			const beginAt = (worktreePath) => {
				if (busy) return;
				setPhase("starting");
				setError(void 0);
				start(sessionId, worktreePath).then(adopt).catch((cause) => {
					setPhase("idle");
					setError(errorTextOf(cause, t));
				});
			};
			const existing = status.worktrees?.slice(1) ?? [];
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: () => {
					if (!busy) onClose();
				},
				title: t("dialog.title"),
				description: t("dialog.description"),
				closeLabel: t("dialog.cancel"),
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					disabled: busy,
					onClick: onClose,
					children: t("dialog.cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim() === "",
					onClick: submit,
					children: phase === "creating" ? t("dialog.creating") : t("dialog.submit")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					style: styles.bodyGrid,
					children: [
						(0, react_jsx_runtime.jsx)("label", {
							htmlFor: "dsh-worktree-jump-name",
							style: styles.fieldLabel,
							children: t("dialog.name.label")
						}),
						(0, react_jsx_runtime.jsx)("input", {
							id: "dsh-worktree-jump-name",
							autoFocus: true,
							placeholder: t("dialog.name.placeholder"),
							value: name,
							disabled: busy,
							style: styles.fieldInput,
							onChange: (event) => {
								setName(event.target.value);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") submit();
							}
						}),
						(0, react_jsx_runtime.jsx)("p", {
							style: styles.hint,
							children: t("dialog.name.hint")
						}),
						(0, react_jsx_runtime.jsxs)("p", {
							style: styles.repoLine,
							children: [
								(0, react_jsx_runtime.jsxs)("span", {
									style: { flex: "none" },
									children: [t("dialog.cwd"), ":"]
								}),
								(0, react_jsx_runtime.jsx)("span", {
									style: styles.repoPath,
									children: (0, react_jsx_runtime.jsx)("code", { children: cwd })
								}),
								status.branch !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
									style: styles.branch,
									children: status.branch
								}) : void 0
							]
						}),
						existing.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
							style: styles.picker,
							children: [(0, react_jsx_runtime.jsx)("p", {
								style: styles.pickTitle,
								children: `${t("dialog.existing")} · ${t("dialog.pick.existing")}`
							}), (0, react_jsx_runtime.jsx)("div", {
								style: styles.existingList,
								children: existing.map((worktree) => (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									style: styles.pickButton,
									disabled: busy,
									title: worktree.path,
									"aria-label": `${t("dialog.pick.existing")}: ${worktree.branch}`,
									onClick: () => {
										beginAt(worktree.path);
									},
									children: (0, react_jsx_runtime.jsxs)("span", {
										style: styles.pickContent,
										children: [(0, react_jsx_runtime.jsx)("span", {
											style: styles.pickBranch,
											children: worktree.branch
										}), (0, react_jsx_runtime.jsx)("span", {
											style: styles.pickPath,
											children: worktree.path
										})]
									})
								}, worktree.path))
							})]
						}) : void 0,
						error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
							style: styles.error,
							role: "alert",
							children: error
						}) : void 0
					]
				})
			});
		}
		/** Localized error text for one failed create. */
		function errorTextOf(error, t) {
			if (error instanceof WorktreeHttpError) {
				const key = error.code === void 0 ? void 0 : ERROR_KEY[error.code];
				if (key !== void 0) return t(key);
				return error.message;
			}
			if (error instanceof Error) return error.message;
			return t("error.generic");
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `worktree-jump` namespace dictionaries. `pt` is the primary reader's
		* language; `en` is the required fallback. Key sets stay identical.
		* @module worktree-jump/client/locales
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "worktree-jump";
		/** English dictionary (fallback of every chain). */
		const en = {
			"button.label": "New worktree",
			"button.tooltip": "Create a new git worktree from {repo} and start the conversation inside it",
			"button.aria": "Create a new git worktree and start this conversation inside it",
			"dialog.title": "Create a worktree",
			"dialog.description": "Creates a git worktree and a branch named after it, then starts this conversation inside it.",
			"dialog.name.label": "Worktree name",
			"dialog.name.placeholder": "my-feature",
			"dialog.name.hint": "Letters, digits, dots, underscores, hyphens. A branch with the same name is created from HEAD.",
			"dialog.existing": "Existing worktrees",
			"dialog.pick.existing": "Start the conversation inside an existing worktree instead",
			"dialog.submit": "Create and start",
			"dialog.creating": "Creating…",
			"dialog.cancel": "Cancel",
			"dialog.cwd": "Repository",
			"error.invalid-name": "Invalid name: use 1–64 letters, digits, dots, underscores or hyphens (no slashes or spaces).",
			"error.worktree-exists": "A worktree with that name already exists.",
			"error.branch-exists": "A branch with that name already exists.",
			"error.not-git-repo": "The selected folder is not inside a git repository.",
			"error.fork-unavailable": "Could not start the conversation in the worktree.",
			"error.generic": "The worktree could not be created."
		};
		/** Portuguese dictionary, key-identical to the English source. */
		const pt = {
			"button.label": "Nova worktree",
			"button.tooltip": "Criar nova git worktree a partir de {repo} e começar a conversa dentro dela",
			"button.aria": "Criar uma nova git worktree e começar esta conversa dentro dela",
			"dialog.title": "Criar uma worktree",
			"dialog.description": "Cria uma git worktree e um branch com o nome dela, e começa esta conversa dentro dela.",
			"dialog.name.label": "Nome da worktree",
			"dialog.name.placeholder": "minha-feature",
			"dialog.name.hint": "Letras, números, pontos, underscores e hífens. Um branch com o mesmo nome é criado a partir do HEAD.",
			"dialog.existing": "Worktrees existentes",
			"dialog.pick.existing": "Começar a conversa dentro de uma worktree existente",
			"dialog.submit": "Criar e começar",
			"dialog.creating": "Criando…",
			"dialog.cancel": "Cancelar",
			"dialog.cwd": "Repositório",
			"error.invalid-name": "Nome inválido: use 1–64 letras, números, pontos, underscores ou hífens (sem barras ou espaços).",
			"error.worktree-exists": "Já existe uma worktree com esse nome.",
			"error.branch-exists": "Já existe um branch com esse nome.",
			"error.not-git-repo": "A pasta escolhida não está dentro de um repositório git.",
			"error.fork-unavailable": "Não foi possível começar a conversa na worktree.",
			"error.generic": "Não foi possível criar a worktree."
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Browser half of dsh-worktree-jump: one chip, styled like the "Choose
		* workspace" selector, placed immediately to its LEFT in the New-Conversation
		* hero row through the `conversation.input.overlay` slot — creating a git
		* worktree and starting the conversation inside it. The trigger renders only
		* while the current Session is blank and its workspace directory is a git
		* repository (status arrives per cwd from the host route); a started
		* conversation never shows it again.
		* @module worktree-jump/client
		*/
		/** Required services: locale registration and the overlay-slot contribution. */
		const inject = [
			"sessions",
			"slots",
			"locale"
		];
		/**
		* Client plugin body: register the language, the dictionaries, and the
		* floating trigger.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const controller = new WorktreeController();
			ctx.effect(() => ctx.locale.addLanguage({
				id: "pt",
				label: "Português",
				fallback: "en"
			}), "worktree-jump: language");
			ctx.effect(() => ctx.locale.register(NS, "en", en), "worktree-jump: dictionary (en)");
			ctx.effect(() => ctx.locale.register(NS, "pt", pt), "worktree-jump: dictionary (pt)");
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "worktree-jump",
				order: 5,
				locale: NS,
				inject: () => ({
					hooks: { worktreeStatus: controller.status },
					loadStatus: (sessionId, cwd) => {
						controller.loadStatus(sessionId, cwd);
					},
					create: (sessionId, name) => controller.create(sessionId, name),
					start: (sessionId, path) => controller.start(sessionId, path),
					startInWorkspace: async (workspaceId) => {
						const uiWorkspace = ctx.get("uiWorkspace");
						if (uiWorkspace !== void 0) {
							uiWorkspace.startSession(workspaceId);
							return;
						}
						const sessions = ctx.get("sessions");
						if (sessions === void 0) throw new Error("sessions controller unavailable");
						const result = await sessions.create({ workspaceId });
						if (!result.ok || result.value === void 0) throw new Error(result.error?.message ?? "the new session was rejected");
						const uiOpen = ctx.get("uiWorkspace");
						if (uiOpen !== void 0) uiOpen.openSession(result.value.sessionId);
						else sessions.open?.(result.value.sessionId);
					},
					openSession: (childId) => {
						const uiWorkspace = ctx.get("uiWorkspace");
						if (uiWorkspace !== void 0) {
							uiWorkspace.openSession(childId);
							return;
						}
						ctx.get("sessions")?.open(childId);
					}
				})
			}, WorktreeAction));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.cjs.map