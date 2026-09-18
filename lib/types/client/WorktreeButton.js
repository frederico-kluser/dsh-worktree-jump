import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { Button, IconBranchOutline16, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
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
/** Dialog-local styles, token-native and deliberately minimal (the Modal
 * primitive owns the chrome: header, description, body column, footer). */
const styles = {
    fieldLabel: {
        fontSize: 13,
        lineHeight: '20px',
        fontWeight: 500,
        color: 'var(--dsw-alias-label-primary)',
    },
    fieldInput: {
        boxSizing: 'border-box',
        width: '100%',
        height: 32,
        padding: '0 8px',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-1)',
        fontSize: 14,
        lineHeight: '22px',
        color: 'var(--dsw-alias-label-primary)',
        outline: 'none',
    },
    hint: {
        margin: 0,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
    },
    repoLine: {
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
        minWidth: 0,
    },
    repoPath: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    branch: {
        flex: 'none',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 999,
        padding: '0 8px',
        fontSize: 11,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
    },
    picker: { display: 'grid', gap: 6 },
    pickTitle: {
        margin: 0,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
    },
    pickButton: { width: '100%', justifyContent: 'flex-start' },
    existingList: {
        display: 'grid',
        gap: 6,
        maxHeight: 160,
        overflowY: 'auto',
    },
    error: {
        margin: 0,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-tone-danger, #c0392b)',
    },
};
/**
 * The overlay trigger. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the floating trigger (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props) {
    const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, openSession } = props;
    const blank = useSession(state => state.blank);
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
    return (_jsxs(_Fragment, { children: [_jsx("div", { onPointerDown: (event) => { event.stopPropagation(); }, onClick: (event) => { event.stopPropagation(); }, style: { position: 'absolute', top: 10, right: 16, zIndex: 100 }, children: _jsx(Tooltip, { label: t('button.tooltip', { repo: repoName }), side: "bottom", children: _jsx(Button, { variant: "outline", size: "sm", icon: _jsx(IconBranchOutline16, { size: 14 }), "aria-label": t('button.aria'), onClick: () => { setDialogOpen(true); }, children: `${t('button.label')} · ${repoName}` }) }) }), _jsx(WorktreeDialog, { open: dialogOpen, onClose: () => { setDialogOpen(false); }, sessionId: sessionId, cwd: cwd, status: status, create: create, start: start, openSession: openSession, t: t })] }));
}
/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * the conversation starts inside the worktree. The Modal primitive owns the
 * chrome; the body flows in its native content column.
 * @param props - open state, session facts, host status, and injected verbs.
 * @returns the modal, or null when closed.
 */
export function WorktreeDialog(props) {
    const { open, onClose, sessionId, cwd, status, create, start, openSession, t } = props;
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
    const busy = phase !== 'idle';
    const submit = () => {
        if (busy || name.trim() === '')
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
    const beginAt = (worktreePath) => {
        if (busy)
            return;
        setPhase('starting');
        setError(undefined);
        start(sessionId, worktreePath)
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
    return (_jsxs(Modal, { open: open, onClose: () => { if (!busy)
            onClose(); }, title: t('dialog.title'), description: t('dialog.description'), closeLabel: t('dialog.cancel'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", disabled: busy, onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "primary", disabled: busy || name.trim() === '', onClick: submit, children: phase === 'creating' ? t('dialog.creating') : t('dialog.submit') })] })), children: [_jsx("label", { htmlFor: "dsh-worktree-jump-name", style: styles.fieldLabel, children: t('dialog.name.label') }), _jsx("input", { id: "dsh-worktree-jump-name", autoFocus: true, placeholder: t('dialog.name.placeholder'), value: name, disabled: busy, style: styles.fieldInput, onChange: (event) => { setName(event.target.value); }, onKeyDown: (event) => { if (event.key === 'Enter')
                    submit(); } }), _jsx("p", { style: styles.hint, children: t('dialog.name.hint') }), _jsxs("p", { style: styles.repoLine, children: [_jsxs("span", { style: { flex: 'none' }, children: [t('dialog.cwd'), ":"] }), _jsx("span", { style: styles.repoPath, children: _jsx("code", { children: cwd }) }), status.branch !== undefined ? _jsx("span", { style: styles.branch, children: status.branch }) : undefined] }), existing.length > 0
                ? (_jsxs("div", { style: styles.picker, children: [_jsx("p", { style: styles.pickTitle, children: `${t('dialog.existing')} · ${t('dialog.pick.existing')}` }), _jsx("div", { style: styles.existingList, children: existing.map(worktree => (_jsx(Button, { variant: "outline", size: "sm", style: styles.pickButton, disabled: busy, "aria-label": `${t('dialog.pick.existing')}: ${worktree.branch}`, onClick: () => { beginAt(worktree.path); }, children: phase === 'starting' ? t('dialog.creating') : worktree.branch }, worktree.path))) })] }))
                : undefined, error !== undefined ? _jsx("p", { style: styles.error, role: "alert", children: error }) : undefined] }));
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