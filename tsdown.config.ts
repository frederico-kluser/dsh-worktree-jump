/**
 * Browser bundle build for `dsh-worktree-jump`.
 *
 * Hand-rolled mirror of the official `packages/client/tsdown.client.ts`
 * client-face contract (that preset resolves packages only inside the DSH
 * workspace, which this standalone plugin is not): one CJS factory artifact at
 * `lib/client.js` opening `window.__ModuleLoader__.load({ id, factory })` and
 * closing `return module.exports; } });`. Specifiers in {@link MODULE_TABLE}
 * stay `require()` externals — every one is either a platform seed word or
 * declared in package.json's `dsh.client.inject` — everything else inlines.
 */
import type { UserConfig } from 'tsdown'

/** This package's loader-table id (package name, minus any ./client suffix). */
const PLUGIN_ID = 'dsh-worktree-jump'

/**
 * Module-table words this bundle requires at factory time. Every entry is a
 * platform seed word (react and the shared client singletons) or this
 * package's own declared `dsh.client.inject` request; the browser kernel's
 * `require` answers seeds before registered factories.
 */
const MODULE_TABLE_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

export default [
  {
    // Node half: one ESM bundle from the tsc output. The host half imports no
    // bare specifiers at runtime (only node builtins), so bundling is pure
    // inlining and the artifact runs from any filesystem location.
    name: `${PLUGIN_ID}/node`,
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    // Pin the .js extension: package.json main/exports name lib/index.js.
    outExtensions: () => ({ js: '.js' }),
    deps: {
      // Nothing is a production dependency: everything inlines.
      alwaysBundle: (specifier: string) => !specifier.startsWith('node:'),
    },
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    deps: {
      neverBundle: [...MODULE_TABLE_EXTERNALS],
      alwaysBundle: (specifier: string) => !MODULE_TABLE_EXTERNALS.includes(specifier as never),
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{"MODE":"production"}',
      'process.env': '{}',
    },
    inputOptions: {
      resolve: {
        conditionNames: ['production', 'browser', 'import', 'module', 'default'],
      },
    },
  },
] satisfies import('tsdown').UserConfig[]
