import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The New-Conversation worktree trigger and its dialog. The trigger renders
 * as a chip in the same style as the "Choose workspace" selector and sits
 * immediately to its LEFT, in the same hero row. The hero affords a plugin no
 * slot before the workspace chip, so the chip is ported straight into the
 * hero flex row (the workspace chip's parent) via `createPortal` and pulled
 * to the front with `order: -1` — a real flex item that pushes the workspace
 * chip and the model selector to the right. It renders only while the current
 * Session is blank (the New-Conversation state) and the picked workspace
 * directory is a git repository; a started conversation never shows it again.
 * Styling rides DSH tokens only — no stylesheet pipeline.
 * @module worktree-jump/client/WorktreeButton
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconBranchOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { WorktreeHttpError } from "./controller.js";
/** Server-code → dictionary-key table for the dialog's error line. Codes
 * whose server message carries the actionable cause (fork-unavailable,
 * git-failed) fall through to the server's own message. */
const ERROR_KEY = {
    'invalid-name': 'error.invalid-name',
    'worktree-exists': 'error.worktree-exists',
    'branch-exists': 'error.branch-exists',
    'not-git-repo': 'error.not-git-repo',
};
/**
 * The "Choose workspace" chip this trigger flanks. The chip is the ONLY
 * `<button aria-haspopup="menu">` without a `title` inside the conversation
 * column, so the query keys on structural attributes instead of the
 * localized `aria-label` (DSH renders it via `t('hero.chooseWorkspace')`,
 * which differs per locale). The `[data-conversation-scroll]` scope excludes
 * the sidebar and settings; the other `button[aria-haspopup="menu"]` elements
 * always carry a `title` (the agent-preset seat and the model selector), and
 * the composer's menu trigger is a contentEditable `<div>`, not a `<button>`.
 * Its parent is the hero flex row the trigger ports into.
 */
const WORKSPACE_CHIP_SELECTOR = '[data-conversation-scroll] button[aria-haspopup="menu"]:not([title])';
/** Trigger styles, mirroring the host's workspace chip (HeroShell.module.css
 * `.workspace`): pill, transparent, primary label, 13/20/500. */
const styles = {
    trigger: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        order: -1,
        minHeight: 28,
        padding: '0 8px',
        border: 'none',
        borderRadius: 16,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: '20px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    /** Hover feedback: the same token the workspace chip uses. */
    triggerHover: {
        background: 'var(--dsw-alias-interactive-bg-hover)',
    },
    /** One-line label with ellipsis, like the chip's; `maxWidth` caps the label
     * so the inline chip never shoves the workspace chip out of the row. */
    label: {
        maxWidth: 360,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    /** The Modal body column has no intrinsic gap; this grid restores the
     * spacing between the field, hint, repository line, and picker. */
    bodyGrid: {
        display: 'grid',
        gap: 10,
        alignContent: 'start',
        minWidth: 0,
    },
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
    pickButton: { width: '100%' },
    /** Two-line pick content: the branch name leads, the directory explains. */
    pickContent: {
        display: 'grid',
        justifyItems: 'start',
        gap: 1,
        minWidth: 0,
        textAlign: 'left',
    },
    pickBranch: {
        fontSize: 13,
        lineHeight: '18px',
        fontWeight: 500,
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    },
    pickPath: {
        fontSize: 11,
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    },
    existingList: {
        display: 'grid',
        gap: 6,
        maxHeight: 180,
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
 * The trigger. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the inline chip (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props) {
    const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, startInWorkspace, openSession } = props;
    const blank = useSession(state => state.blank);
    const cwd = useSessions(state => state.byId[sessionId]?.cwd);
    const statusMap = useWorktreeStatus(map => map);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [heroRow, setHeroRow] = useState(undefined);
    useEffect(() => {
        if (cwd === undefined || cwd === '')
            return;
        loadStatus(sessionId, cwd);
    }, [sessionId, cwd, loadStatus]);
    const status = cwd === undefined ? undefined : statusMap.get(cwd);
    const visible = blank && cwd !== undefined && cwd !== '' && status !== undefined && status.isGitRepo;
    // Resolve the hero flex row the trigger ports into, once it becomes
    // relevant. The trigger is a real flex item inside the row, so it needs no
    // resize/scroll re-anchoring the way the old fixed overlay did.
    useEffect(() => {
        if (!visible) {
            setHeroRow(undefined);
            return;
        }
        let disposed = false;
        let observer = null;
        const resolve = () => {
            if (disposed)
                return;
            const chip = document.querySelector(WORKSPACE_CHIP_SELECTOR);
            if (chip !== null) {
                setHeroRow(chip.parentElement ?? undefined);
                observer?.disconnect(); // found it — stop observing; the row is stable while the hero is visible
                observer = null;
            }
        };
        // settling → hero can mount its row AFTER `visible` turns true; watch the
        // DOM and stop as soon as the chip appears.
        observer = new MutationObserver(() => { resolve(); });
        observer.observe(document.body, { childList: true, subtree: true });
        resolve();
        const frame = requestAnimationFrame(resolve);
        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, [visible]);
    // The guard below narrows `cwd` and `status` for the render; `visible`
    // (the same condition) drives the resolve effect's dependency above.
    if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo)
        return null;
    // No hero row on screen (menu layout without it): nothing to precede.
    if (heroRow === undefined)
        return null;
    const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd;
    // `order: -1` pulls the ported button to the front of the hero flex row,
    // left of the "Choose workspace" chip and the model selector.
    const triggerStyle = {
        ...styles.trigger,
        ...(hovered ? styles.triggerHover : undefined),
    };
    return (_jsxs(_Fragment, { children: [createPortal(_jsxs("button", { type: "button", onPointerDown: (event) => { event.stopPropagation(); }, onClick: (event) => {
                    event.stopPropagation();
                    setDialogOpen(true);
                }, onMouseEnter: () => { setHovered(true); }, onMouseLeave: () => { setHovered(false); }, "aria-label": t('button.aria'), title: t('button.tooltip', { repo: repoName }), style: triggerStyle, children: [_jsx(IconBranchOutline16, { size: 16 }), _jsx("span", { style: styles.label, children: `${t('button.label')} · ${repoName}` })] }), heroRow), _jsx(WorktreeDialog, { open: dialogOpen, onClose: () => { setDialogOpen(false); }, sessionId: sessionId, cwd: cwd, status: status, create: create, start: start, startInWorkspace: startInWorkspace, openSession: openSession, t: t })] }));
}
/**
 * The naming dialog: one input, repository facts, the pickable existing
 * worktrees, and the create action. On success the UI opens the forked child
 * Session — the conversation starts inside the worktree; when the host
 * reports a fork failure it fell back to a fresh Session inside the
 * workspace, which the dialog starts and opens. The Modal primitive owns the
 * chrome; the body is one token-native grid with breathing room.
 * @param props - open state, session facts, host status, and injected verbs.
 * @returns the modal, or null when closed.
 */
export function WorktreeDialog(props) {
    const { open, onClose, sessionId, cwd, status, create, start, startInWorkspace, openSession, t } = props;
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
    /** Adopt one create/start outcome: fork opened, else the workspace fallback. */
    const adopt = (value) => {
        setPhase('idle');
        onClose();
        if (value.sessionId !== undefined) {
            openSession(value.sessionId);
            return;
        }
        if (value.workspaceId !== undefined) {
            // The host kept the worktree and its workspace; start a fresh Session
            // there. A failure here surfaces as the dialog's error line.
            startInWorkspace(value.workspaceId).catch((cause) => {
                setError(cause instanceof Error ? cause.message : String(cause));
            });
        }
    };
    const submit = () => {
        if (busy || name.trim() === '')
            return;
        setPhase('creating');
        setError(undefined);
        create(sessionId, name.trim())
            .then(adopt)
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
            .then(adopt)
            .catch((cause) => {
            setPhase('idle');
            setError(errorTextOf(cause, t));
        });
    };
    const existing = status.worktrees?.slice(1) ?? [];
    return (_jsx(Modal, { open: open, onClose: () => { if (!busy)
            onClose(); }, title: t('dialog.title'), description: t('dialog.description'), closeLabel: t('dialog.cancel'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", disabled: busy, onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "primary", disabled: busy || name.trim() === '', onClick: submit, children: phase === 'creating' ? t('dialog.creating') : t('dialog.submit') })] })), children: _jsxs("div", { style: styles.bodyGrid, children: [_jsx("label", { htmlFor: "dsh-worktree-jump-name", style: styles.fieldLabel, children: t('dialog.name.label') }), _jsx("input", { id: "dsh-worktree-jump-name", autoFocus: true, placeholder: t('dialog.name.placeholder'), value: name, disabled: busy, style: styles.fieldInput, onChange: (event) => { setName(event.target.value); }, onKeyDown: (event) => { if (event.key === 'Enter')
                        submit(); } }), _jsx("p", { style: styles.hint, children: t('dialog.name.hint') }), _jsxs("p", { style: styles.repoLine, children: [_jsxs("span", { style: { flex: 'none' }, children: [t('dialog.cwd'), ":"] }), _jsx("span", { style: styles.repoPath, children: _jsx("code", { children: cwd }) }), status.branch !== undefined ? _jsx("span", { style: styles.branch, children: status.branch }) : undefined] }), existing.length > 0
                    ? (_jsxs("div", { style: styles.picker, children: [_jsx("p", { style: styles.pickTitle, children: `${t('dialog.existing')} · ${t('dialog.pick.existing')}` }), _jsx("div", { style: styles.existingList, children: existing.map(worktree => (_jsx(Button, { variant: "outline", style: styles.pickButton, disabled: busy, title: worktree.path, "aria-label": `${t('dialog.pick.existing')}: ${worktree.branch}`, onClick: () => { beginAt(worktree.path); }, children: _jsxs("span", { style: styles.pickContent, children: [_jsx("span", { style: styles.pickBranch, children: worktree.branch }), _jsx("span", { style: styles.pickPath, children: worktree.path })] }) }, worktree.path))) })] }))
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