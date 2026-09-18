/**
 * Browser half of dsh-worktree-jump: one Session-header button creating a git
 * worktree and moving the conversation into it. Status arrives per cwd from
 * the host route; the button renders nothing outside a git repository.
 * @module worktree-jump/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type WorktreeJumpKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Session-header worktree-creation copy. */
        'worktree-jump': WorktreeJumpKey;
    }
}
export type { WorktreeActionInjected, WorktreeActionProps } from './WorktreeButton.tsx';
export type { WorktreeJumpKey } from './locales.ts';
/** Required services: locale registration and the header-slot contribution. */
export declare const inject: string[];
/**
 * Client plugin body: register the language, the dictionaries, and the
 * header button.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
