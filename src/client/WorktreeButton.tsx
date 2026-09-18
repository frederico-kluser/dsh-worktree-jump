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

import { useEffect, useState } from 'react'
import { Button, IconBranchOutline16, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation SlotMap and ui-session standard-prop merges.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorktreeStatusPayload } from '../shared.ts'
import { WorktreeHttpError } from './controller.ts'
import { NS, type WorktreeJumpKey } from './locales.ts'

/** Browser operations and state injected into the dock contribution. */
export interface WorktreeActionInjected {
  hooks: {
    /** Published status per cwd; the card renders only on `isGitRepo`. */
    readonly worktreeStatus: ObservableSnapshot<ReadonlyMap<string, WorktreeStatusPayload>>
  }
  /** Ensure the status read for one session's cwd is running or resolved. */
  readonly loadStatus: (sessionId: string, cwd: string) => void
  /** Create the worktree and start the conversation inside it. */
  readonly create: (sessionId: string, name: string) => Promise<{ readonly sessionId: string }>
  /** Transport the UI to one session (uiWorkspace when present, else the list). */
  readonly openSession: (sessionId: string) => void
}

/** Full props of the input-dock worktree card. */
export type WorktreeActionProps =
  PropsRuntime<'conversation.input.dock'>
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
  } satisfies React.CSSProperties,
  glyph: {
    display: 'inline-flex',
    flex: 'none',
    color: 'var(--dsw-alias-label-tertiary)',
  } satisfies React.CSSProperties,
  label: {
    flex: 'none',
    fontSize: 13,
    lineHeight: '24px',
    fontWeight: 500,
    color: 'var(--dsw-alias-label-primary)',
  } satisfies React.CSSProperties,
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
  } satisfies React.CSSProperties,
  body: { display: 'grid', gap: 10, minWidth: 380 } satisfies React.CSSProperties,
  hint: { margin: 0, fontSize: 12, opacity: 0.75 } satisfies React.CSSProperties,
  repoLine: { margin: 0, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' } satisfies React.CSSProperties,
  branch: {
    border: '1px solid currentColor', borderRadius: 999, padding: '0 8px',
    fontSize: 11, opacity: 0.8,
  } satisfies React.CSSProperties,
  existing: { fontSize: 12 } satisfies React.CSSProperties,
  error: { margin: 0, fontSize: 12, color: 'var(--dsw-tone-danger, #c0392b)' } satisfies React.CSSProperties,
} as const

/**
 * The input-dock card. Hidden until the current Session is a blank one (the
 * New-Conversation state) whose picked workspace directory the host reported
 * as a git repository; a started conversation never shows it again.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the dock card (and dialog when open), or null when not applicable.
 */
export function WorktreeAction(props: WorktreeActionProps): React.JSX.Element | null {
  const { sessionId, useSession, useSessions, useWorktreeStatus, t, loadStatus, create, openSession } = props
  const blank = useSession(state => state?.blank ?? false)
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
      <Tooltip label={t('button.tooltip')} side="bottom">
        <button
          type="button"
          style={styles.dock}
          aria-label={t('button.aria')}
          onClick={() => { setDialogOpen(true) }}
        >
          <span style={styles.glyph}><IconBranchOutline16 size={15} /></span>
          <span style={styles.label}>{t('button.label')}</span>
          <span style={styles.repo}>{repoName}</span>
        </button>
      </Tooltip>
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
 * the conversation starts inside the worktree.
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
      <div style={styles.body}>
        <label htmlFor="dsh-worktree-jump-name">{t('dialog.name.label')}</label>
        <Input
          id="dsh-worktree-jump-name"
          autoFocus
          placeholder={t('dialog.name.placeholder')}
          value={name}
          disabled={phase === 'creating'}
          onChange={(event) => { setName(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
        />
        <p style={styles.hint}>{t('dialog.name.hint')}</p>
        <p style={styles.repoLine}>
          {t('dialog.cwd')}: <code>{cwd}</code>
          {status.branch !== undefined ? <span style={styles.branch}>{status.branch}</span> : undefined}
        </p>
        {existing.length > 0
          ? (
              <details style={styles.existing}>
                <summary>{`${t('dialog.existing')} (${String(existing.length)})`}</summary>
                <ul>
                  {existing.map(worktree => (
                    <li key={worktree.path}>
                      <span style={styles.branch}>{worktree.branch}</span>
                      <code>{worktree.path}</code>
                    </li>
                  ))}
                </ul>
              </details>
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
