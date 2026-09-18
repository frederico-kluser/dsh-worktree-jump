/**
 * Browser half of dsh-worktree-jump: one Session-header button creating a git
 * worktree and moving the conversation into it. Status arrives per cwd from
 * the host route; the button renders nothing outside a git repository.
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
import { en, NS, pt, type WorktreeJumpKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header worktree-creation copy. */
    'worktree-jump': WorktreeJumpKey
  }
}

export type { WorktreeActionInjected, WorktreeActionProps } from './WorktreeButton.tsx'
export type { WorktreeJumpKey } from './locales.ts'

/** Required services: locale registration and the header-slot contribution. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the language, the dictionaries, and the
 * header button.
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
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'worktree-jump',
    order: -8,
    locale: NS,
    inject: (): WorktreeActionInjected => ({
      hooks: {
        worktreeStatus: controller.status,
      },
      loadStatus: (sessionId, cwd) => { void controller.loadStatus(sessionId, cwd) },
      create: (sessionId, name) => controller.create(sessionId, name),
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
