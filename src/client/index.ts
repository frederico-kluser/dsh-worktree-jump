/**
 * Browser half of dsh-worktree-jump: one chip, styled like the "Choose
 * workspace" selector, rendered as a real flex item at the LEFT of the
 * New-Conversation hero row (ported into it from the
 * `conversation.input.overlay` slot) — creating a git worktree and starting
 * the conversation inside it. The trigger renders only while the current
 * Session is blank and its workspace directory is a git repository (status
 * arrives per cwd from the host route); a started conversation never shows it
 * again.
 * @module worktree-jump/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { WorktreeStatusPayload } from '../shared.ts'
import { WorktreeController } from './controller.ts'
import { WorktreeAction, type WorktreeActionInjected } from './WorktreeButton.tsx'
import { en, NS, pt, zh, type WorktreeJumpKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Input-overlay worktree-creation copy. */
    'worktree-jump': WorktreeJumpKey
  }
}

export type { WorktreeActionInjected, WorktreeActionProps } from './WorktreeButton.tsx'
export type { WorktreeJumpKey } from './locales.ts'

/** Required services: locale registration and the overlay-slot contribution. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the languages, the dictionaries, and the
 * inline trigger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new WorktreeController()
  // Portuguese is the primary reader's language here; English stays the
  // fallback the locale system requires.
  ctx.effect(() => ctx.locale.addLanguage({ id: 'pt', label: 'Português', fallback: 'en' }),
    'worktree-jump: language')
  ctx.effect(() => ctx.locale.register(NS, 'en', en), 'worktree-jump: dictionary (en)')
  ctx.effect(() => ctx.locale.register(NS, 'pt', pt), 'worktree-jump: dictionary (pt)')
  // Simplified Chinese is a built-in locale, so no addLanguage — that would
  // throw "already registered"; only the dictionary is contributed.
  ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'worktree-jump: dictionary (zh)')
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'worktree-jump',
    order: 5,
    locale: NS,
    inject: (): WorktreeActionInjected => ({
      hooks: {
        worktreeStatus: controller.status,
      },
      loadStatus: (sessionId, cwd) => { void controller.loadStatus(sessionId, cwd) },
      create: (sessionId, name) => controller.create(sessionId, name),
      start: (sessionId, path) => controller.start(sessionId, path),
      // The documented fallback when the fork fails: a brand-new Session
      // inside the Workspace the host created over the worktree.
      startInWorkspace: async (workspaceId) => {
        const uiWorkspace = ctx.get('uiWorkspace') as
          | { startSession(workspaceId?: string): void }
          | undefined
        if (uiWorkspace !== undefined) {
          uiWorkspace.startSession(workspaceId)
          return
        }
        const sessions = ctx.get('sessions') as
          | {
            create(opts: { workspaceId: string }): Promise<{
              ok: boolean
              value?: { sessionId: string }
              error?: { message: string }
            }>
            open?(sessionId: string): void
          }
          | undefined
        if (sessions === undefined) throw new Error('sessions controller unavailable')
        const result = await sessions.create({ workspaceId })
        if (!result.ok || result.value === undefined) {
          throw new Error(result.error?.message ?? 'the new session was rejected')
        }
        const uiOpen = ctx.get('uiWorkspace') as
          | { openSession(sessionId: string): void }
          | undefined
        if (uiOpen !== undefined) uiOpen.openSession(result.value.sessionId)
        else sessions.open?.(result.value.sessionId)
      },
      openSession: (childId) => {
        // The documented navigation verb, when its owner plugin is mounted;
        // otherwise the plain session-list open.
        const uiWorkspace = ctx.get('uiWorkspace') as
          | { openSession(sessionId: string): void }
          | undefined
        if (uiWorkspace !== undefined) {
          uiWorkspace.openSession(childId)
          return
        }
        const sessions = ctx.get('sessions') as { open(sessionId: string): void } | undefined
        sessions?.open(childId)
      },
    }),
  }, WorktreeAction))
}
