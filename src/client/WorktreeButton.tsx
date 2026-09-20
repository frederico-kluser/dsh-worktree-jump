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

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconBranchOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation SlotMap and ui-session standard-prop merges.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorktreeStatusPayload } from '../shared.ts'
import { WorktreeHttpError } from './controller.ts'
import { NS, type WorktreeJumpKey } from './locales.ts'

/** One create/start outcome the dialog acts on. */
export interface WorktreeOutcome {
  readonly sessionId?: string
  readonly workspaceId?: string
}

/** Browser operations and state injected into the overlay contribution. */
export interface WorktreeActionInjected {
  hooks: {
    /** Published status per cwd; the trigger renders only on `isGitRepo`. */
    readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>
  }
  /** Ensure the status read for one session's cwd is running or resolved. */
  readonly loadStatus: (sessionId: string, cwd: string) => void
  /** Create the worktree and start the conversation inside it. */
  readonly create: (sessionId: string, name: string) => Promise<WorktreeOutcome>
  /** Start the conversation inside an existing worktree directory. */
  readonly start: (sessionId: string, path: string) => Promise<WorktreeOutcome>
  /** Fallback: open a brand-new Session inside the workspace over the worktree. */
  readonly startInWorkspace: (workspaceId: string) => Promise<void>
  /** Transport the UI to one session (uiWorkspace when present, else the list). */
  readonly openSession: (sessionId: string) => void
}

/** Full props of the overlay trigger. */
export type WorktreeActionProps =
  PropsRuntime<'conversation.input.overlay'>
  & InjectFace<WorktreeActionInjected>
  & PropsLocale<typeof NS>

/** Server-code → dictionary-key table for the dialog's error line. Codes
 * whose server message carries the actionable cause (fork-unavailable,
 * git-failed) fall through to the server's own message. */
const ERROR_KEY: Partial<Record<string, WorktreeJumpKey>> = {
  'invalid-name': 'error.invalid-name',
  'worktree-exists': 'error.worktree-exists',
  'branch-exists': 'error.branch-exists',
  'not-git-repo': 'error.not-git-repo',
}

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
const WORKSPACE_CHIP_SELECTOR = '[data-conversation-scroll] button[aria-haspopup="menu"]:not([title])'

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
  } satisfies React.CSSProperties,
  /** Hover feedback: the same token the workspace chip uses. */
  triggerHover: {
    background: 'var(--dsw-alias-interactive-bg-hover)',
  } satisfies React.CSSProperties,
  /** One-line label with ellipsis, like the chip's; `maxWidth` caps the label
   * so the inline chip never shoves the workspace chip out of the row. */
  label: {
    maxWidth: 360,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,
  /** The Modal body column has no intrinsic gap; this grid restores the
   * spacing between the field, hint, repository line, and picker. */
  bodyGrid: {
    display: 'grid',
    gap: 10,
    alignContent: 'start',
    minWidth: 0,
  } satisfies React.CSSProperties,
  fieldLabel: {
    fontSize: 13,
    lineHeight: '20px',
    fontWeight: 500,
    color: 'var(--dsw-alias-label-primary)',
  } satisfies React.CSSProperties,
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
  } satisfies React.CSSProperties,
  hint: {
    margin: 0,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-secondary)',
  } satisfies React.CSSProperties,
  repoLine: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-secondary)',
    minWidth: 0,
  } satisfies React.CSSProperties,
  repoPath: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,
  branch: {
    flex: 'none',
    border: '0.5px solid var(--dsw-alias-border-l2)',
    borderRadius: 999,
    padding: '0 8px',
    fontSize: 11,
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-secondary)',
  } satisfies React.CSSProperties,
  picker: { display: 'grid', gap: 6 } satisfies React.CSSProperties,
  pickTitle: {
    margin: 0,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-secondary)',
  } satisfies React.CSSProperties,
  pickButton: { width: '100%' } satisfies React.CSSProperties,
  /** Two-line pick content: the branch name leads, the directory explains. */
  pickContent: {
    display: 'grid',
    justifyItems: 'start',
    gap: 1,
    minWidth: 0,
    textAlign: 'left',
  } satisfies React.CSSProperties,
  pickBranch: {
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 500,
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  } satisfies React.CSSProperties,
  pickPath: {
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--dsw-alias-label-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  } satisfies React.CSSProperties,
  existingList: {
    display: 'grid',
    gap: 6,
    maxHeight: 180,
    overflowY: 'auto',
  } satisfies React.CSSProperties,
  error: {
    margin: 0,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--dsw-tone-danger, #c0392b)',
  } satisfies React.CSSProperties,
} as const

/**
 * The trigger. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the inline chip (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null {
  const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, startInWorkspace, openSession } = props
  const blank = useSession(state => state.blank)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const statusMap = useWorktreeStatus(map => map)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [heroRow, setHeroRow] = useState<HTMLElement | undefined>(undefined)

  useEffect(() => {
    if (cwd === undefined || cwd === '') return
    loadStatus(sessionId, cwd)
  }, [sessionId, cwd, loadStatus])

  const status = cwd === undefined ? undefined : statusMap.get(cwd)
  const visible = blank && cwd !== undefined && cwd !== '' && status !== undefined && status.isGitRepo

  // Resolve the hero flex row the trigger ports into, once it becomes
  // relevant. The trigger is a real flex item inside the row, so it needs no
  // resize/scroll re-anchoring the way the old fixed overlay did.
  useEffect(() => {
    if (!visible) {
      setHeroRow(undefined)
      return
    }
    let disposed = false
    let observer: MutationObserver | null = null
    const resolve = (): void => {
      if (disposed) return
      const chip = document.querySelector(WORKSPACE_CHIP_SELECTOR)
      if (chip !== null) {
        setHeroRow(chip.parentElement ?? undefined)
        observer?.disconnect() // found it — stop observing; the row is stable while the hero is visible
        observer = null
      }
    }
    // settling → hero can mount its row AFTER `visible` turns true; watch the
    // DOM and stop as soon as the chip appears.
    observer = new MutationObserver(() => { resolve() })
    observer.observe(document.body, { childList: true, subtree: true })
    resolve()
    const frame = requestAnimationFrame(resolve)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [visible])

  // The guard below narrows `cwd` and `status` for the render; `visible`
  // (the same condition) drives the resolve effect's dependency above.
  if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo) return null
  // No hero row on screen (menu layout without it): nothing to precede.
  if (heroRow === undefined) return null

  const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd

  // `order: -1` pulls the ported button to the front of the hero flex row,
  // left of the "Choose workspace" chip and the model selector.
  const triggerStyle: React.CSSProperties = {
    ...styles.trigger,
    ...(hovered ? styles.triggerHover : undefined),
  }

  return (
    <>
      {createPortal(
        <button
          type="button"
          onPointerDown={(event) => { event.stopPropagation() }}
          onClick={(event) => {
            event.stopPropagation()
            setDialogOpen(true)
          }}
          onMouseEnter={() => { setHovered(true) }}
          onMouseLeave={() => { setHovered(false) }}
          aria-label={t('button.aria')}
          title={t('button.tooltip', { repo: repoName })}
          style={triggerStyle}
        >
          <IconBranchOutline16 size={16} />
          <span style={styles.label}>{`${t('button.label')} · ${repoName}`}</span>
        </button>,
        heroRow,
      )}
      <WorktreeDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false) }}
        sessionId={sessionId}
        cwd={cwd}
        status={status}
        create={create}
        start={start}
        startInWorkspace={startInWorkspace}
        openSession={openSession}
        t={t}
      />
    </>
  )
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
export function WorktreeDialog(
  props: {
    readonly open: boolean
    readonly onClose: () => void
    readonly sessionId: string
    readonly cwd: string
    readonly status: WorktreeStatusPayload
    readonly create: (sessionId: string, name: string) => Promise<WorktreeOutcome>
    readonly start: (sessionId: string, path: string) => Promise<WorktreeOutcome>
    readonly startInWorkspace: (workspaceId: string) => Promise<void>
    readonly openSession: (sessionId: string) => void
    readonly t: PropsLocale<typeof NS>['t']
  },
): React.JSX.Element | null {
  const { open, onClose, sessionId, cwd, status, create, start, startInWorkspace, openSession, t } = props
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'idle' | 'creating' | 'starting'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      setName('')
      setError(undefined)
      setPhase('idle')
    }
  }, [open])

  const busy = phase !== 'idle'

  /** Adopt one create/start outcome: fork opened, else the workspace fallback. */
  const adopt = (value: WorktreeOutcome): void => {
    setPhase('idle')
    onClose()
    if (value.sessionId !== undefined) {
      openSession(value.sessionId)
      return
    }
    if (value.workspaceId !== undefined) {
      // The host kept the worktree and its workspace; start a fresh Session
      // there. A failure here surfaces as the dialog's error line.
      startInWorkspace(value.workspaceId).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    }
  }

  const submit = (): void => {
    if (busy || name.trim() === '') return
    setPhase('creating')
    setError(undefined)
    create(sessionId, name.trim())
      .then(adopt)
      .catch((cause: unknown) => {
        setPhase('idle')
        setError(errorTextOf(cause, t))
      })
  }

  const beginAt = (worktreePath: string): void => {
    if (busy) return
    setPhase('starting')
    setError(undefined)
    start(sessionId, worktreePath)
      .then(adopt)
      .catch((cause: unknown) => {
        setPhase('idle')
        setError(errorTextOf(cause, t))
      })
  }

  const existing = status.worktrees?.slice(1) ?? []

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose() }}
      title={t('dialog.title')}
      description={t('dialog.description')}
      closeLabel={t('dialog.cancel')}
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim() === ''}
            onClick={submit}
          >
            {phase === 'creating' ? t('dialog.creating') : t('dialog.submit')}
          </Button>
        </>
      )}
    >
      <div style={styles.bodyGrid}>
        <label htmlFor="dsh-worktree-jump-name" style={styles.fieldLabel}>
          {t('dialog.name.label')}
        </label>
        <input
          id="dsh-worktree-jump-name"
          autoFocus
          placeholder={t('dialog.name.placeholder')}
          value={name}
          disabled={busy}
          style={styles.fieldInput}
          onChange={(event) => { setName(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
        />
        <p style={styles.hint}>{t('dialog.name.hint')}</p>
        <p style={styles.repoLine}>
          <span style={{ flex: 'none' }}>{t('dialog.cwd')}:</span>
          <span style={styles.repoPath}><code>{cwd}</code></span>
          {status.branch !== undefined ? <span style={styles.branch}>{status.branch}</span> : undefined}
        </p>
        {existing.length > 0
          ? (
              <div style={styles.picker}>
                <p style={styles.pickTitle}>{`${t('dialog.existing')} · ${t('dialog.pick.existing')}`}</p>
                <div style={styles.existingList}>
                  {existing.map(worktree => (
                    <Button
                      key={worktree.path}
                      variant="outline"
                      style={styles.pickButton}
                      disabled={busy}
                      title={worktree.path}
                      aria-label={`${t('dialog.pick.existing')}: ${worktree.branch}`}
                      onClick={() => { beginAt(worktree.path) }}
                    >
                      <span style={styles.pickContent}>
                        <span style={styles.pickBranch}>{worktree.branch}</span>
                        <span style={styles.pickPath}>{worktree.path}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )
          : undefined}
        {error !== undefined ? <p style={styles.error} role="alert">{error}</p> : undefined}
      </div>
    </Modal>
  )
}

/** Localized error text for one failed create. */
function errorTextOf(error: unknown, t: PropsLocale<typeof NS>['t']): string {
  if (error instanceof WorktreeHttpError) {
    const key = error.code === undefined ? undefined : ERROR_KEY[error.code]
    if (key !== undefined) return t(key)
    return error.message
  }
  if (error instanceof Error) return error.message
  return t('error.generic')
}