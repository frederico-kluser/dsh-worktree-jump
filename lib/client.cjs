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
		* The Session-header worktree button and its dialog. Renders nothing until
		* the host reported the session's workspace directory as a git repository —
		* the "only in a git project" gate — and opens the naming dialog on click.
		* Styling is inline and primitive-only, so the bundle carries no stylesheet
		* pipeline.
		* @module worktree-jump/client/WorktreeButton
		*/
		/** Server-code → dictionary-key table for the dialog's error line. */
		const ERROR_KEY = {
			"invalid-name": "error.invalid-name",
			"worktree-exists": "error.worktree-exists",
			"branch-exists": "error.branch-exists",
			"not-git-repo": "error.not-git-repo",
			"fork-unavailable": "error.fork-unavailable",
			"session-not-found": "error.generic",
			"subagent-session": "error.generic",
			"no-workspace": "error.generic",
			"git-failed": "error.generic",
			"create-failed": "error.generic"
		};
		/** Small inline-layout style bundle for the dialog body (no stylesheet). */
		const styles = {
			body: {
				display: "grid",
				gap: 10,
				minWidth: 380
			},
			label: {
				fontSize: 12,
				fontWeight: 600
			},
			hint: {
				margin: 0,
				fontSize: 12,
				opacity: .75
			},
			repo: {
				margin: 0,
				fontSize: 12,
				display: "flex",
				gap: 8,
				alignItems: "center"
			},
			branch: {
				border: "1px solid currentColor",
				borderRadius: 999,
				padding: "0 8px",
				fontSize: 11,
				opacity: .8
			},
			existing: { fontSize: 12 },
			error: {
				margin: 0,
				fontSize: 12,
				color: "var(--dsw-tone-danger, #c0392b)"
			}
		};
		/**
		* Session-header icon button. Hidden until the status read names the session's
		* workspace directory a git repository, so a plain directory never grows the
		* control.
		* @param props - session runtime, injected controller face, and localized copy.
		* @returns the button (and dialog when open), or null when not applicable.
		*/
		function WorktreeAction(props) {
			const { sessionId, useSessions, useWorktreeStatus, t, loadStatus, create, openSession } = props;
			const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
			const statusMap = useWorktreeStatus((map) => map);
			const [dialogOpen, setDialogOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (cwd === void 0 || cwd === "") return;
				loadStatus(sessionId, cwd);
			}, [
				sessionId,
				cwd,
				loadStatus
			]);
			const status = cwd === void 0 ? void 0 : statusMap.get(cwd);
			if (cwd === void 0 || cwd === "" || status === void 0 || !status.isGitRepo) return null;
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("button.tooltip"),
				side: "bottom",
				children: (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": t("button.aria"),
					title: t("button.tooltip"),
					onClick: () => {
						setDialogOpen(true);
					},
					children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size: 15 })
				})
			}), (0, react_jsx_runtime.jsx)(WorktreeDialog, {
				open: dialogOpen,
				onClose: () => {
					setDialogOpen(false);
				},
				sessionId,
				cwd,
				status,
				create,
				openSession,
				t
			})] });
		}
		/**
		* The naming dialog: one input, repository facts, the existing-worktree hint,
		* and the create action. On success the UI opens the forked child Session —
		* same history, new working directory.
		*/
		function WorktreeDialog(props) {
			const { open, onClose, sessionId, cwd, status, create, openSession, t } = props;
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
			const submit = () => {
				if (phase === "creating" || name.trim() === "") return;
				setPhase("creating");
				setError(void 0);
				create(sessionId, name.trim()).then((value) => {
					setPhase("idle");
					onClose();
					openSession(value.sessionId);
				}).catch((cause) => {
					setPhase("idle");
					setError(errorTextOf(cause, t));
				});
			};
			const existing = status.worktrees?.slice(1) ?? [];
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: () => {
					if (phase !== "creating") onClose();
				},
				title: t("dialog.title"),
				description: t("dialog.description"),
				closeLabel: t("dialog.cancel"),
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					disabled: phase === "creating",
					onClick: onClose,
					children: t("dialog.cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: phase === "creating" || name.trim() === "",
					onClick: submit,
					children: phase === "creating" ? t("dialog.creating") : t("dialog.submit")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					style: styles.body,
					children: [
						(0, react_jsx_runtime.jsx)("label", {
							htmlFor: "dsh-worktree-jump-name",
							children: t("dialog.name.label")
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							id: "dsh-worktree-jump-name",
							autoFocus: true,
							placeholder: t("dialog.name.placeholder"),
							value: name,
							disabled: phase === "creating",
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
							style: styles.repo,
							children: [
								t("dialog.cwd"),
								": ",
								(0, react_jsx_runtime.jsx)("code", { children: cwd }),
								status.branch !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
									style: styles.branch,
									children: status.branch
								}) : void 0
							]
						}),
						existing.length > 0 ? (0, react_jsx_runtime.jsxs)("details", {
							style: styles.existing,
							children: [(0, react_jsx_runtime.jsx)("summary", { children: `${t("dialog.existing")} (${String(existing.length)})` }), (0, react_jsx_runtime.jsx)("ul", { children: existing.map((worktree) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", {
								style: styles.branch,
								children: worktree.branch
							}), (0, react_jsx_runtime.jsx)("code", { children: worktree.path })] }, worktree.path)) })]
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
			"button.tooltip": "New git worktree (continues this conversation there)",
			"button.aria": "Create a git worktree and move this conversation into it",
			"dialog.title": "Create a worktree",
			"dialog.description": "Creates a git worktree and a branch named after it, then moves this conversation there.",
			"dialog.name.label": "Worktree name",
			"dialog.name.placeholder": "my-feature",
			"dialog.name.hint": "Letters, digits, dots, underscores, hyphens. A branch with the same name is created from HEAD.",
			"dialog.existing": "Existing worktrees",
			"dialog.submit": "Create and move",
			"dialog.creating": "Creating…",
			"dialog.cancel": "Cancel",
			"dialog.cwd": "Repository",
			"error.invalid-name": "Invalid name: use 1–64 letters, digits, dots, underscores or hyphens (no slashes or spaces).",
			"error.worktree-exists": "A worktree with that name already exists.",
			"error.branch-exists": "A branch with that name already exists.",
			"error.not-git-repo": "This session's directory is not inside a git repository.",
			"error.fork-unavailable": "Could not fork this conversation into the worktree.",
			"error.generic": "The worktree could not be created."
		};
		/** Portuguese dictionary, key-identical to the English source. */
		const pt = {
			"button.tooltip": "Nova git worktree (continua esta conversa nela)",
			"button.aria": "Criar uma git worktree e mover esta conversa para ela",
			"dialog.title": "Criar uma worktree",
			"dialog.description": "Cria uma git worktree e um branch com o nome dela, e move esta conversa para lá.",
			"dialog.name.label": "Nome da worktree",
			"dialog.name.placeholder": "minha-feature",
			"dialog.name.hint": "Letras, números, pontos, underscores e hífens. Um branch com o mesmo nome é criado a partir do HEAD.",
			"dialog.existing": "Worktrees existentes",
			"dialog.submit": "Criar e mover",
			"dialog.creating": "Criando…",
			"dialog.cancel": "Cancelar",
			"dialog.cwd": "Repositório",
			"error.invalid-name": "Nome inválido: use 1–64 letras, números, pontos, underscores ou hífens (sem barras ou espaços).",
			"error.worktree-exists": "Já existe uma worktree com esse nome.",
			"error.branch-exists": "Já existe um branch com esse nome.",
			"error.not-git-repo": "A pasta desta sessão não está dentro de um repositório git.",
			"error.fork-unavailable": "Não foi possível forkar esta conversa para a worktree.",
			"error.generic": "Não foi possível criar a worktree."
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Browser half of dsh-worktree-jump: one Session-header button creating a git
		* worktree and moving the conversation into it. Status arrives per cwd from
		* the host route; the button renders nothing outside a git repository.
		* @module worktree-jump/client
		*/
		/** Required services: locale registration and the header-slot contribution. */
		const inject = [
			"sessions",
			"slots",
			"locale"
		];
		/**
		* Client plugin body: register the language, the dictionaries, and the
		* header button.
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
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "worktree-jump",
				order: -8,
				locale: NS,
				inject: () => ({
					hooks: { worktreeStatus: controller.status },
					loadStatus: (sessionId, cwd) => {
						controller.loadStatus(sessionId, cwd);
					},
					create: (sessionId, name) => controller.create(sessionId, name),
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