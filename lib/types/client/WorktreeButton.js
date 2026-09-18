import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The Session-header worktree button and its dialog. Renders nothing until
 * the host reported the session's workspace directory as a git repository —
 * the "only in a git project" gate — and opens the naming dialog on click.
 * Styling is inline and primitive-only, so the bundle carries no stylesheet
 * pipeline.
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
/** Small inline-layout style bundle for the dialog body (no stylesheet). */
const styles = {
    body: { display: 'grid', gap: 10, minWidth: 380 },
    label: { fontSize: 12, fontWeight: 600 },
    hint: { margin: 0, fontSize: 12, opacity: 0.75 },
    repo: { margin: 0, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' },
    branch: {
        border: '1px solid currentColor', borderRadius: 999, padding: '0 8px',
        fontSize: 11, opacity: 0.8,
    },
    existing: { fontSize: 12 },
    error: { margin: 0, fontSize: 12, color: 'var(--dsw-tone-danger, #c0392b)' },
};
/**
 * Session-header icon button. Hidden until the status read names the session's
 * workspace directory a git repository, so a plain directory never grows the
 * control.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the button (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props) {
    const { sessionId, useSessions, useWorktreeStatus, t, loadStatus, create, openSession } = props;
    const cwd = useSessions(state => state.byId[sessionId]?.cwd);
    const statusMap = useWorktreeStatus(map => map);
    const [dialogOpen, setDialogOpen] = useState(false);
    useEffect(() => {
        if (cwd === undefined || cwd === '')
            return;
        loadStatus(sessionId, cwd);
    }, [sessionId, cwd, loadStatus]);
    const status = cwd === undefined ? undefined : statusMap.get(cwd);
    if (cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('button.tooltip'), side: "bottom", children: _jsx("button", { type: "button", "aria-label": t('button.aria'), title: t('button.tooltip'), onClick: () => { setDialogOpen(true); }, children: _jsx(IconBranchOutline16, { size: 15 }) }) }), _jsx(WorktreeDialog, { open: dialogOpen, onClose: () => { setDialogOpen(false); }, sessionId: sessionId, cwd: cwd, status: status, create: create, openSession: openSession, t: t })] }));
}
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * same history, new working directory.
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
                        submit(); } }), _jsx("p", { style: styles.hint, children: t('dialog.name.hint') }), _jsxs("p", { style: styles.repo, children: [t('dialog.cwd'), ": ", _jsx("code", { children: cwd }), status.branch !== undefined ? _jsx("span", { style: styles.branch, children: status.branch }) : undefined] }), existing.length > 0
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