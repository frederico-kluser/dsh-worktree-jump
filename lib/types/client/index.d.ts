/**
 * Browser half of dsh-worktree-jump: one chip, styled like the "Choose
 * workspace" selector, rendered as a real flex item at the LEFT of the
 * New-Conversation hero row (ported into it from the
 * `conversation.input.overlay` slot) — creating a git worktree and starting
 * the conversation inside it. The trigger renders only while the current
 * Session is blank and its workspace directory is a git repository (status
 * arrives per cwd from the host route); a started conversation never shows it
 * again.
 * @module worktree-jump/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type WorktreeJumpKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Input-overlay worktree-creation copy. */
        'worktree-jump': WorktreeJumpKey;
    }
}
export type { WorktreeActionInjected, WorktreeActionProps } from './WorktreeButton.tsx';
export type { WorktreeJumpKey } from './locales.ts';
/** Required services: locale registration and the overlay-slot contribution. */
export declare const inject: string[];
/**
 * Client plugin body: register the languages, the dictionaries, and the
 * inline trigger.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
