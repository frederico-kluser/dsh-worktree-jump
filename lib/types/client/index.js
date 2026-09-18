/**
 * Browser half of dsh-worktree-jump: one compact trigger floated at the
 * composer card's top-right corner — beside the workspace/mode selector row —
 * through the `conversation.input.overlay` slot, creating a git worktree and
 * starting the conversation inside it. The trigger renders only while the
 * current Session is blank and its workspace directory is a git repository
 * (status arrives per cwd from the host route); a started conversation never
 * shows it again.
 * @module worktree-jump/client
 */
import { WorktreeController } from "./controller.js";
import { WorktreeAction } from "./WorktreeButton.js";
import { en, NS, pt } from "./locales.js";
/** Required services: locale registration and the overlay-slot contribution. */
export const inject = ['sessions', 'slots', 'locale'];
/**
 * Client plugin body: register the language, the dictionaries, and the
 * floating trigger.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const controller = new WorktreeController();
    // Portuguese is the primary reader's language here; English stays the
    // fallback the locale system requires.
    ctx.effect(() => ctx.locale.addLanguage({ id: 'pt', label: 'Português', fallback: 'en' }), 'worktree-jump: language');
    ctx.effect(() => ctx.locale.register(NS, 'en', en), 'worktree-jump: dictionary (en)');
    ctx.effect(() => ctx.locale.register(NS, 'pt', pt), 'worktree-jump: dictionary (pt)');
    ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'worktree-jump',
        order: 5,
        locale: NS,
        inject: () => ({
            hooks: {
                worktreeStatus: controller.status,
            },
            loadStatus: (sessionId, cwd) => { void controller.loadStatus(sessionId, cwd); },
            create: (sessionId, name) => controller.create(sessionId, name),
            openSession: (childId) => {
                // The documented navigation verb, when its owner plugin is mounted;
                // otherwise the plain session-list open.
                const uiWorkspace = ctx.get('uiWorkspace');
                if (uiWorkspace !== undefined) {
                    uiWorkspace.openSession(childId);
                    return;
                }
                const sessions = ctx.get('sessions');
                sessions?.open(childId);
            },
        }),
    }, WorktreeAction));
}
//# sourceMappingURL=index.js.map