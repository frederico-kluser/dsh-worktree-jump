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

import { useEffect, useState } from 'react'
import { Button, IconBranchOutline16, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation SlotMap and ui-session standard-prop merges.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorktreeStatusPayload } from '../shared.ts'
import { WorktreeHttpError } from './controller.ts'
import { NS, type WorktreeJumpKey } from './locales.ts'

/** Browser operations and state injected into the overlay contribution. */
export interface WorktreeActionInjected {
  hooks: {
    /** Published status per cwd; the trigger renders only on `isGitRepo`. */
    readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>
  }
  /** Ensure the status read for one session's cwd is running or resolved. */
  readonly loadStatus: (sessionId: string, cwd: string) => void
  /** Create the worktree and start the conversation inside it. */
  readonly create: (sessionId: string, name: string) => Promise<{ readonly sessionId: string }>
  /** Transport the UI to one session (uiWorkspace when present, else the list). */
  readonly openSession: (sessionId: string) => void
}

/** Full props of the overlay trigger. */
export type WorktreeActionProps =
  PropsRuntime<'conversation.input.overlay'>
  & InjectFace<WorktreeActionInjected>
  & PropsLocale<typeof NS>

/** Server-code → dictionary-key table for the dialog's error line. */
const ERROR_KEY: Partial<Record<string, WorktreeJumpKey>> = {
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
}

/** Dialog-local styles, token-native and deliberately minimal (the Modal
 * primitive owns the chrome: header, description, body column, footer). */
const styles = {
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
  existing: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-secondary)',
  } satisfies React.CSSProperties,
  existingList: {
    margin: '4px 0 0',
    paddingLeft: 16,
    maxHeight: 120,
    overflowY: 'auto',
    display: 'grid',
    gap: 2,
  } satisfies React.CSSProperties,
  error: {
    margin: 0,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--dsw-tone-danger, #c0392b)',
  } satisfies React.CSSProperties,
} as const

/**
 * The overlay trigger. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the floating trigger (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null {
  const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, openSession } = props
  const blank = useSession(state => state.blank)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const statusMap = useWorktreeStatus(map => map)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (cwd === undefined || cwd === '') return
    loadStatus(sessionId, cwd)
  }, [sessionId, cwd, loadStatus])

  const status = cwd === undefined ? undefined : statusMap.get(cwd)
  if (!blank || cwd === undefined || cwd === '' || status === undefined || !status.isGitRepo) return null

  const repoName = cwd.split('/').filter(part => part !== '').at(-1) ?? cwd

  return (
    <>
      {/* The composer card is a click target while it fronts the workspace
          picker, so this floating trigger swallows its own pointer events. */}
      <div
        onPointerDown={(event) => { event.stopPropagation() }}
        onClick={(event) => { event.stopPropagation() }}
        style={{ position: 'absolute', top: 10, right: 16, zIndex: 100 }}
      >
        <Tooltip label={t('button.tooltip', { repo: repoName })} side="bottom">
          <Button
            variant="outline"
            size="sm"
            icon={<IconBranchOutline16 size={14} />}
            aria-label={t('button.aria')}
            onClick={() => { setDialogOpen(true) }}
          >
            {`${t('button.label')} · ${repoName}`}
          </Button>
        </Tooltip>
      </div>
      <WorktreeDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false) }}
        sessionId={sessionId}
        cwd={cwd}
        status={status}
        create={create}
        openSession={openSession}
        t={t}
      />
    </>
  )
}

/**
 * The naming dialog: one input, repository facts, the existing-worktree hint,
 * and the create action. On success the UI opens the forked child Session —
 * the conversation starts inside the worktree. The Modal primitive owns the
 * chrome; the body flows in its native content column.
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
    readonly create: (sessionId: string, name: string) => Promise<{ readonly sessionId: string }>
    readonly openSession: (sessionId: string) => void
    readonly t: PropsLocale<typeof NS>['t']
  },
): React.JSX.Element | null {
  const { open, onClose, sessionId, cwd, status, create, openSession, t } = props
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'idle' | 'creating'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      setName('')
      setError(undefined)
      setPhase('idle')
    }
  }, [open])

  const submit = (): void => {
    if (phase === 'creating' || name.trim() === '') return
    setPhase('creating')
    setError(undefined)
    create(sessionId, name.trim())
      .then((value) => {
        setPhase('idle')
        onClose()
        openSession(value.sessionId)
      })
      .catch((cause: unknown) => {
        setPhase('idle')
        setError(errorTextOf(cause, t))
      })
  }

  const existing = status.worktrees?.slice(1) ?? []

  return (
    <Modal
      open={open}
      onClose={() => { if (phase !== 'creating') onClose() }}
      title={t('dialog.title')}
      description={t('dialog.description')}
      closeLabel={t('dialog.cancel')}
      footer={(
        <>
          <Button variant="ghost" disabled={phase === 'creating'} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={phase === 'creating' || name.trim() === ''}
            onClick={submit}
          >
            {phase === 'creating' ? t('dialog.creating') : t('dialog.submit')}
          </Button>
        </>
      )}
    >
      <label htmlFor="dsh-worktree-jump-name" style={styles.fieldLabel}>
        {t('dialog.name.label')}
      </label>
      <input
        id="dsh-worktree-jump-name"
        autoFocus
        placeholder={t('dialog.name.placeholder')}
        value={name}
        disabled={phase === 'creating'}
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
            <details style={styles.existing}>
              <summary>{`${t('dialog.existing')} (${String(existing.length)})`}</summary>
              <ul style={styles.existingList}>
                {existing.map(worktree => (
                  <li key={worktree.path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={styles.branch}>{worktree.branch}</span>{' '}
                    <code>{worktree.path}</code>
                  </li>
                ))}
              </ul>
            </details>
          )
        : undefined}
      {error !== undefined ? <p style={styles.error} role="alert">{error}</p> : undefined}
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
