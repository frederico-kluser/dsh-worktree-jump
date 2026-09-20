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

import { useEffect, useState } from 'react'
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
 * The "Choose workspace" chip this trigger flanks. The chip keeps this
 * aria-label in every state (placeholder and named), so the query is stable
 * across workspace picks. Never prefixes this plugin's own button, whose
 * aria-label is its own localized string.
 */
const WORKSPACE_CHIP_SELECTOR = '[aria-label="Choose workspace"]'

/** Gap (px) between the worktree chip and the workspace chip it flanks. */
const CHIP_GAP = 8

/** One viewport-anchored measurement of the workspace chip element. */
interface ChipAnchor {
  /** Chip top edge in CSS viewport px. */
  readonly top: number
  /** Chip left edge in CSS viewport px. */
  readonly left: number
}

/** Measure the workspace chip's current viewport box, when it exists. */
function measureChipAnchor(): ChipAnchor | undefined {
  const chip = document.querySelector(WORKSPACE_CHIP_SELECTOR)
  if (chip === null) return undefined
  const rect = chip.getBoundingClientRect()
  return rect.width > 0 ? { top: rect.top, left: rect.left } : undefined
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
  } satisfies React.CSSProperties,
  /** Hover feedback: the same token the workspace chip uses. */
  triggerHover: {
    background: 'var(--dsw-alias-interactive-bg-hover)',
  } satisfies React.CSSProperties,
  /** One-line label with ellipsis, like the chip's. */
  label: {
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
 * @returns the flanking chip (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null {
  const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, start, startInWorkspace, openSession } = props
  const blank = useSession(state => state.blank)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const statusMap = useWorktreeStatus(map => map)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [anchor, setAnchor] = useState<ChipAnchor | undefined>(undefined)

  useEffect(() => {
    if (cwd === undefined || cwd === '') return
    loadStatus(sessionId, cwd)
  }, [sessionId, cwd, loadStatus])

  // Anchor the chip to the workspace chip's live box: measure on mount, one
  // frame later (so a settling hero is caught), and on any resize or scroll —
  // the chip is plain DOM in the scrollable conversation column, and the
  // trigger itself is a fixed overlay that must follow it.
  useEffect(() => {
    const measure = (): void => { setAnchor(measureChipAnchor()) }
    measure()
    const frame = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [])

  const status = cwd === undefined ? undefined : statusMap.get(cwd)
  if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo) return null
  // No chip element on screen (menu layout without the hero row): nothing to flank.
  if (anchor === undefined) return null

  const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd

  // The trigger's RIGHT edge is fixed at the chip's left edge minus the gap,
  // so the browser lays it out leftward at natural width (capped and
  // ellipsized), vertically aligned to the chip's own top edge — the same
  // row, immediately beside the "Choose workspace" selector.
  const anchorStyle: React.CSSProperties = {
    ...styles.trigger,
    ...(hovered ? styles.triggerHover : undefined),
    top: anchor.top,
    right: window.innerWidth - anchor.left + CHIP_GAP,
  }

  return (
    <>
      {/* The composer card is a click target while it fronts the workspace
          picker, so this floating chip swallows its own pointer events. */}
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
        style={anchorStyle}
      >
        <IconBranchOutline16 size={16} />
        <span style={styles.label}>{`${t('button.label')} · ${repoName}`}</span>
      </button>
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