import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { Button, IconBranchOutline16, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { WorktreeHttpError } from "./controller.js";
/** Server-code → dictionary-key table for the dialog's error line. */
const ERROR_KEY = {
    'invalid-name': 'error.invalid-name',
    'worktree-exists': 'error.worktree-exists',
    'branch-exists': 'error.branch-exists',
    'not-git-repo': 'error.not-git-repo',
    'fork-unavailable': 'error.fork-unavailable',
    'session-not-found': 'error.generic',
    'subagent-session': 'error.generic',
    'no-workspace': 'error.generic',
    'git-failed': 'error.generic',
    'create-failed': 'error.generic',
};
/** The composer-stack card family look (Goal/Todo/Queue), over DSH tokens. */
const styles = {
    dock: {
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 'calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset))',
        height: 36,
        margin: '0 auto',
        padding: '4px 5px 4px 12px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-specific-tip)',
        cursor: 'pointer',
        textAlign: 'left',
    },
    glyph: {
        display: 'inline-flex',
        flex: 'none',
        color: 'var(--dsw-alias-label-tertiary)',
    },
    label: {
        flex: 'none',
        fontSize: 13,
        lineHeight: '24px',
        fontWeight: 500,
        color: 'var(--dsw-alias-label-primary)',
    },
    repo: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary-dimmed)',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'right',
    },
    body: { display: 'grid', gap: 10, minWidth: 380 },
    hint: { margin: 0, fontSize: 12, opacity: 0.75 },
    repoLine: { margin: 0, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' },
    branch: {
        border: '1px solid currentColor', borderRadius: 999, padding: '0 8px',
        fontSize: 11, opacity: 0.8,
    },
    existing: { fontSize: 12 },
    error: { margin: 0, fontSize: 12, color: 'var(--dsw-tone-danger, #c0392b)' },
};
/**
 * The input-dock card. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the dock card (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props) {
    const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, openSession } = props;
    const blank = useSession(state => state?.blank ?? false);
    const cwd = useSessions(state => state.byId[sessionId]?.cwd);
    const statusMap = useWorktreeStatus(map => map);
    const [dialogOpen, setDialogOpen] = useState(false);
    useEffect(() => {
        if (cwd === undefined || cwd === '')
            return;
        loadStatus(sessionId, cwd);
    }, [sessionId, cwd, loadStatus]);
    const status = cwd === undefined ? undefined : statusMap.get(cwd);
    if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo)
        return null;
    const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd;
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('button.tooltip'), side: "bottom", children: _jsxs("button", { type: "button", style: styles.dock, "aria-label": t('button.aria'), onClick: () => { setDialogOpen(true); }, children: [_jsx("span", { style: styles.glyph, children: _jsx(IconBranchOutline16, { size: 15 }) }), _jsx("span", { style: styles.label, children: t('button.label') }), _jsx("span", { style: styles.repo, children: repoName })] }) }), _jsx(WorktreeDialog, { open: dialogOpen, onClose: () => { setDialogOpen(false); }, sessionId: sessionId, cwd: cwd, status: status, create: create, openSession: openSession, t: t })] }));
}
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * the conversation starts inside the worktree.
 * @param props - open state, session facts, host status, and injected verbs.
 * @returns the modal, or null when closed.
 */
export function WorktreeDialog(props) {
    const { open, onClose, sessionId, cwd, status, create, openSession, t } = props;
    const [name, setName] = useState('');
    const [phase, setPhase] = useState('idle');
    const [error, setError] = useState(undefined);
    useEffect(() => {
        if (!open) {
            setName('');
            setError(undefined);
            setPhase('idle');
        }
    }, [open]);
    const submit = () => {
        if (phase === 'creating' || name.trim() === '')
            return;
        setPhase('creating');
        setError(undefined);
        create(sessionId, name.trim())
            .then((value) => {
            setPhase('idle');
            onClose();
            openSession(value.sessionId);
        })
            .catch((cause) => {
            setPhase('idle');
            setError(errorTextOf(cause, t));
        });
    };
    const existing = status.worktrees?.slice(1) ?? [];
    return (_jsx(Modal, { open: open, onClose: () => { if (phase !== 'creating')
            onClose(); }, title: t('dialog.title'), description: t('dialog.description'), closeLabel: t('dialog.cancel'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", disabled: phase === 'creating', onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "primary", disabled: phase === 'creating' || name.trim() === '', onClick: submit, children: phase === 'creating' ? t('dialog.creating') : t('dialog.submit') })] })), children: _jsxs("div", { style: styles.body, children: [_jsx("label", { htmlFor: "dsh-worktree-jump-name", children: t('dialog.name.label') }), _jsx(Input, { id: "dsh-worktree-jump-name", autoFocus: true, placeholder: t('dialog.name.placeholder'), value: name, disabled: phase === 'creating', onChange: (event) => { setName(event.target.value); }, onKeyDown: (event) => { if (event.key === 'Enter')
                        submit(); } }), _jsx("p", { style: styles.hint, children: t('dialog.name.hint') }), _jsxs("p", { style: styles.repoLine, children: [t('dialog.cwd'), ": ", _jsx("code", { children: cwd }), status.branch !== undefined ? _jsx("span", { style: styles.branch, children: status.branch }) : undefined] }), existing.length > 0
                    ? (_jsxs("details", { style: styles.existing, children: [_jsx("summary", { children: `${t('dialog.existing')} (${String(existing.length)})` }), _jsx("ul", { children: existing.map(worktree => (_jsxs("li", { children: [_jsx("span", { style: styles.branch, children: worktree.branch }), _jsx("code", { children: worktree.path })] }, worktree.path))) })] }))
                    : undefined, error !== undefined ? _jsx("p", { style: styles.error, role: "alert", children: error }) : undefined] }) }));
}
/** Localized error text for one failed create. */
function errorTextOf(error, t) {
    if (error instanceof WorktreeHttpError) {
        const key = error.code === undefined ? undefined : ERROR_KEY[error.code];
        if (key !== undefined)
            return t(key);
        return error.message;
    }
    if (error instanceof Error)
        return error.message;
    return t('error.generic');
}
//# sourceMappingURL=WorktreeButton.js.map