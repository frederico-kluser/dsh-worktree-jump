/**
 * The Session-header worktree button and its dialog. Renders nothing until
 * the host reported the session's workspace directory as a git repository —
 * the "only in a git project" gate — and opens the naming dialog on click.
 * Styling is inline and primitive-only, so the bundle carries no stylesheet
 * pipeline.
 * @module worktree-jump/client/WorktreeButton
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorktreeStatusPayload } from '../shared.ts';
import { NS } from './locales.ts';
/** Browser operations and state injected into the header contribution. */
export interface WorktreeActionInjected {
    hooks: {
        /** Published status per cwd; the button renders only on `isGitRepo`. */
        readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>;
    };
    /** Ensure the status read for one session's cwd is running or resolved. */
    readonly loadStatus: (sessionId: string, cwd: string) => void;
    /** Create the worktree and fork the conversation into it. */
    readonly create: (sessionId: string, name: string) => Promise<{
        readonly sessionId: string;
    }>;
    /** Transport the UI to one session (uiWorkspace when present, else the list). */
    readonly openSession: (sessionId: string) => void;
}
/** Full props of the Session-header worktree button. */
export type WorktreeActionProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<WorktreeActionInjected>;
/**
 * Session-header icon button. Hidden until the status read names the session's
 * workspace directory a git repository, so a plain directory never grows the
 * control.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the button (and dialog when open), or null when not applicable.
 */
export declare function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null;
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * same history, new working directory.
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
