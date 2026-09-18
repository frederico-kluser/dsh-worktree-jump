/**
 * The New-Conversation worktree trigger and its dialog. The trigger is a
 * compact outline button floated at the composer card's top-right corner —
 * beside the workspace/mode selector row — through the
 * `conversation.input.overlay` slot (the same anchored strip the shipped
 * command popup uses). It renders only while the current Session is blank
 * (the New-Conversation state) and the picked workspace directory is a git
 * repository; a started conversation never shows it again. Styling rides
 * DSH primitives and tokens only — no stylesheet pipeline.
 * @module worktree-jump/client/WorktreeButton
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorktreeStatusPayload } from '../shared.ts';
import { NS } from './locales.ts';
/** Browser operations and state injected into the overlay contribution. */
export interface WorktreeActionInjected {
    hooks: {
        /** Published status per cwd; the trigger renders only on `isGitRepo`. */
        readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>;
    };
    /** Ensure the status read for one session's cwd is running or resolved. */
    readonly loadStatus: (sessionId: string, cwd: string) => void;
    /** Create the worktree and start the conversation inside it. */
    readonly create: (sessionId: string, name: string) => Promise<{
        readonly sessionId: string;
    }>;
    /** Start the conversation inside an existing worktree directory. */
    readonly start: (sessionId: string, path: string) => Promise<{
        readonly sessionId: string;
    }>;
    /** Transport the UI to one session (uiWorkspace when present, else the list). */
    readonly openSession: (sessionId: string) => void;
}
/** Full props of the overlay trigger. */
export type WorktreeActionProps = PropsRuntime<'conversation.input.overlay'> & InjectFace<WorktreeActionInjected> & PropsLocale<typeof NS>;
/**
 * The overlay trigger. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the floating trigger (and dialog when open), or null when not applicable.
 */
export declare function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null;
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * the conversation starts inside the worktree. The Modal primitive owns the
 * chrome; the body flows in its native content column.
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
    readonly start: (sessionId: string, path: string) => Promise<{
        readonly sessionId: string;
    }>;
    readonly openSession: (sessionId: string) => void;
    readonly t: PropsLocale<typeof NS>['t'];
}): React.JSX.Element | null;
