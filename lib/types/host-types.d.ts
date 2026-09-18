/**
 * Narrowed host-type vocabulary the plugin reads across service boundaries.
 * Types only — the real declarations live in the corresponding `@deepseek-ai`
 * packages (Session, agent, presets); this file re-states the slices the
 * plugin touches so its host half compiles and loads without a node_modules
 * of its own. Shapes are mirrored, never widened.
 * @module dsh-worktree-jump/host-types
 */
/** The publication-commit callback an optional Agent setup may return. */
export interface AgentSetupCommit {
    commit(): void;
}
/**
 * Compose an unpublished Agent scope and optionally return its publication
 * commit — the `AgentSetup` contract of `@deepseek-ai/dsh-agent`, narrowed.
 * @param agentCtx - unpublished Agent scope context.
 * @param agent - unpublished Agent being composed.
 * @returns an optional commit invoked after setup settles, before publication.
 */
export type AgentSetup = (agentCtx: unknown, agent: unknown) => AgentSetupCommit | Promise<AgentSetupCommit | void> | void;
