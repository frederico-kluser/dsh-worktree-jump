import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The New-Conversation worktree trigger and its dialog. The trigger renders
 * as a chip in the same style as the "Choose workspace" selector and sits
 * immediately to its LEFT, in the same row, through the
 * `conversation.input.overlay` slot (the session-scoped overlay strip the
 * shipped command popup also uses). The hero affords a plugin no hook before
 * the workspace chip, so the chip is anchored to the live chip element: the
 * trigger's right edge is fixed at the chip's left edge (8px gap) and it
 * re-measures on mount, resize, and scroll. It renders only while the current
 * Session is blank (the New-Conversation state) and the picked workspace
 * directory is a git repository; a started conversation never shows it again.
 * Styling rides DSH tokens only — no stylesheet pipeline.
 * @module worktree-jump/client/WorktreeButton
 */
import { useEffect, useState } from 'react';
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
 * The "Choose workspace" chip this trigger flanks. The chip keeps this
 * aria-label in every state (placeholder and named), so the query is stable
 * across workspace picks. Never prefixes this plugin's own button, whose
 * aria-label is its own localized string.
 */
const WORKSPACE_CHIP_SELECTOR = '[aria-label="Choose workspace"]';
/** Gap (px) between the worktree chip and the workspace chip it flanks. */
const CHIP_GAP = 8;
/** Measure the workspace chip's current viewport box, when it exists. */
function measureChipAnchor() {
    const chip = document.querySelector(WORKSPACE_CHIP_SELECTOR);
    if (chip === null)
        return undefined;
    const rect = chip.getBoundingClientRect();
    return rect.width > 0 ? { top: rect.top, left: rect.left } : undefined;
}
/** Trigger styles, mirroring the host's workspace chip (HeroShell.module.css
 * `.workspace`): pill, transparent, primary label, 13/20/500. */
const styles = {
    trigger: {
        position: 'fixed',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        boxSizing: 'border-box',
        maxWidth: 360,
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
    /** One-line label with ellipsis, like the chip's. */
    label: {
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
 * @returns the flanking chip (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props) {
    const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, startInWorkspace, openSession } = props;
    const blank = useSession(state => state.blank);
    const cwd = useSessions(state => state.byId[sessionId]?.cwd);
    const statusMap = useWorktreeStatus(map => map);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [anchor, setAnchor] = useState(undefined);
    useEffect(() => {
        if (cwd === undefined || cwd === '')
            return;
        loadStatus(sessionId, cwd);
    }, [sessionId, cwd, loadStatus]);
    // Anchor the chip to the workspace chip's live box: measure on mount, one
    // frame later (so a settling hero is caught), and on any resize or scroll —
    // the chip is plain DOM in the scrollable conversation column, and the
    // trigger itself is a fixed overlay that must follow it.
    useEffect(() => {
        const measure = () => { setAnchor(measureChipAnchor()); };
        measure();
        const frame = requestAnimationFrame(measure);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, []);
    const status = cwd === undefined ? undefined : statusMap.get(cwd);
    if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo)
        return null;
    // No chip element on screen (menu layout without the hero row): nothing to flank.
    if (anchor === undefined)
        return null;
    const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd;
    // The trigger's RIGHT edge is fixed at the chip's left edge minus the gap,
    // so the browser lays it out leftward at natural width (capped and
    // ellipsized), vertically aligned to the chip's own top edge — the same
    // row, immediately beside the "Choose workspace" selector.
    const anchorStyle = {
        ...styles.trigger,
        ...(hovered ? styles.triggerHover : undefined),
        top: anchor.top,
        right: window.innerWidth - anchor.left + CHIP_GAP,
    };
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", onPointerDown: (event) => { event.stopPropagation(); }, onClick: (event) => {
                    event.stopPropagation();
                    setDialogOpen(true);
                }, onMouseEnter: () => { setHovered(true); }, onMouseLeave: () => { setHovered(false); }, "aria-label": t('button.aria'), title: t('button.tooltip', { repo: repoName }), style: anchorStyle, children: [_jsx(IconBranchOutline16, { size: 16 }), _jsx("span", { style: styles.label, children: `${t('button.label')} · ${repoName}` })] }), _jsx(WorktreeDialog, { open: dialogOpen, onClose: () => { setDialogOpen(false); }, sessionId: sessionId, cwd: cwd, status: status, create: create, start: start, startInWorkspace: startInWorkspace, openSession: openSession, t: t })] }));
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