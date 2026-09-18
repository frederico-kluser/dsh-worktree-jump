/**
 * Browser half of dsh-worktree-jump: one input-dock card in the
 * New-Conversation hero — directly below the workspace/mode selector row —
 * creating a git worktree and starting the conversation inside it. The card
 * renders only while the current Session is blank and its workspace
 * directory is a git repository (status arrives per cwd from the host
 * route); a started conversation never shows it again.
 * @module worktree-jump/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type WorktreeJumpKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Input-dock worktree-creation copy. */
        'worktree-jump': WorktreeJumpKey;
    }
}
export type { WorktreeActionInjected, WorktreeActionProps } from './WorktreeButton.tsx';
export type { WorktreeJumpKey } from './locales.ts';
/** Required services: locale registration and the dock-slot contribution. */
export declare const inject: string[];
/**
 * Client plugin body: register the language, the dictionaries, and the dock
 * card.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
