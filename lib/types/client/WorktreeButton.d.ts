/**
 * The input-dock worktree card and its dialog. The card lives in the
 * New-Conversation hero — directly below the workspace/mode selector row —
 * as one composer-stack card in the Goal/Todo/Queue family. It renders only
 * while the current Session is still blank (a conversation has not started)
 * and the host reported the picked workspace directory as a git repository;
 * the first message of the conversation then runs inside the new worktree.
 * Styling is inline over DSH tokens, primitive-only, no stylesheet pipeline.
 * @module worktree-jump/client/WorktreeButton
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorktreeStatusPayload } from '../shared.ts';
import { NS } from './locales.ts';
/** Browser operations and state injected into the dock contribution. */
export interface WorktreeActionInjected {
    hooks: {
        /** Published status per cwd; the card renders only on `isGitRepo`. */
        readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>;
    };
    /** Ensure the status read for one session's cwd is running or resolved. */
    readonly loadStatus: (sessionId: string, cwd: string) => void;
    /** Create the worktree and start the conversation inside it. */
    readonly create: (sessionId: string, name: string) => Promise<{
        readonly sessionId: string;
    }>;
    /** Transport the UI to one session (uiWorkspace when present, else the list). */
    readonly openSession: (sessionId: string) => void;
}
/** Full props of the input-dock worktree card. */
export type WorktreeActionProps = PropsRuntime<'conversation.input.dock'> & InjectFace<WorktreeActionInjected> & PropsLocale<typeof NS>;
/**
 * The input-dock card. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the dock card (and dialog when open), or null when not applicable.
 */
export declare function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null;
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * the conversation starts inside the worktree.
 * @param props - open state, session facts, host status, and injected verbs.
 * @returns the modal, or null when closed.
 */
export declare function WorktreeDialog(props: {
    readonly open: boolean;
    readonly onClose: () => void;
    readonly sessionId: string;
    readonly cwd: string;
    readonly status: WorktreeStatusPayload;
    readonly create: (sessionId: string, name: string) => Promise<{
        readonly sessionId: string;
    }>;
    readonly openSession: (sessionId: string) => void;
    readonly t: PropsLocale<typeof NS>['t'];
}): React.JSX.Element | null;
