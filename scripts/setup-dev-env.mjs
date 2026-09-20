#!/usr/bin/env node
/**
 * Dev-environment bootstrap for dsh-worktree-jump.
 *
 * The plugin is standalone (no pnpm workspace of its own) and carries zero
 * runtime dependencies; this script symlinks the BUILD-TIME tools and type
 * packages from the local DeepSeek Harness checkout into the plugin's
 * node_modules, so `npm run build` and `npm run test` resolve them. Nothing
 * here runs at plugin runtime: the host half imports only node builtins, and
 * the client bundle requires module-table words inside the browser.
 * @module scripts/setup-dev-env
 */

import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const PLUGIN_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const DSH_ROOT = process.env['DSH_CHECKOUT'] ?? '/home/ondokai/Projects/deepseek-harness'

/** Build-time type/tool links: [checkout-relative target, node_modules path]. */
const SYMLINKS = [
  ['vendor/cordis', '@deepseek-ai/cordis'],
  ['packages/host/webserver', '@deepseek-ai/dsh-host-webserver'],
  ['packages/subprocess/subprocess', '@deepseek-ai/dsh-subprocess'],
  ['packages/subprocess/subprocess-local', '@deepseek-ai/dsh-subprocess-local'],
  ['packages/core/session', '@deepseek-ai/dsh-session'],
  ['packages/session-query/session-query', '@deepseek-ai/dsh-session-query'],
  ['packages/core/agent', '@deepseek-ai/dsh-agent'],
  ['packages/core/agent-default-model', '@deepseek-ai/dsh-agent-default-model'],
  ['packages/core/agent-loop', '@deepseek-ai/dsh-agent-loop'],
  ['packages/core/system-prompt', '@deepseek-ai/dsh-system-prompt'],
  ['packages/bundle/base', '@deepseek-ai/dsh-base'],
  ['packages/bundle/web-app', '@deepseek-ai/dsh-web-app'],
  ['packages/workspace/workspace', '@deepseek-ai/dsh-workspace'],
  ['packages/api/workspace-controller', '@deepseek-ai/dsh-api-workspace-controller'],
  ['packages/api/remotes', '@deepseek-ai/dsh-api-remotes'],
  ['packages/client/modules', '@deepseek-ai/dsh-client-modules'],
  ['packages/client/connection', '@deepseek-ai/dsh-client-connection'],
  ['packages/client/store', '@deepseek-ai/dsh-client-store'],
  ['packages/client/locale', '@deepseek-ai/dsh-client-locale'],
  ['packages/client/web', '@deepseek-ai/dsh-client-runtime'],
  ['packages/client/ui-slots', '@deepseek-ai/dsh-client-ui-slots'],
  ['packages/client/ui-primitives', '@deepseek-ai/dsh-client-ui-primitives'],
  ['packages/client/ui-renderer', '@deepseek-ai/dsh-client-ui-renderer'],
  ['packages/client/ui-session', '@deepseek-ai/dsh-client-ui-session'],
  ['packages/client/ui-conversation', '@deepseek-ai/dsh-client-ui-conversation'],
  ['packages/client/ui-workspace', '@deepseek-ai/dsh-client-ui-workspace'],
  ['packages/client/ui-layout', '@deepseek-ai/dsh-client-ui-layout'],
  ['packages/preset/agent-presets', '@deepseek-ai/dsh-agent-presets'],
  ['packages/util/brand', '@deepseek-ai/dsh-brand'],
  ['packages/typert/protocol', '@deepseek-ai/dsh-typert-protocol'],
  ['node_modules/typescript', 'typescript'],
  ['node_modules/tsdown', 'tsdown'],
]

/** The first pnpm-store directory whose name starts with the prefix. */
function storeDir(prefix) {
  const store = join(DSH_ROOT, 'node_modules/.pnpm')
  if (!existsSync(store)) return undefined
  return readdirSync(store)
    .filter(entry => entry.startsWith(prefix))
    .sort()
    .at(-1)
}

function main() {
  if (!existsSync(DSH_ROOT)) {
    console.error(`setup-dev-env: DSH checkout not found at ${DSH_ROOT}`)
    process.exit(1)
  }
  const nodeModules = join(PLUGIN_ROOT, 'node_modules')
  mkdirSync(join(nodeModules, '@deepseek-ai'), { recursive: true })
  mkdirSync(join(nodeModules, '@types'), { recursive: true })

  let created = 0
  let present = 0
  let skipped = 0
  const link = (nodePath, target) => {
    if (existsSync(nodePath)) {
      present += 1
      return
    }
    if (!existsSync(target)) {
      console.warn(`setup-dev-env: skip ${nodePath}: target missing (${target})`)
      skipped += 1
      return
    }
    symlinkSync(target, nodePath, 'dir')
    created += 1
  }

  for (const [relativeTarget, linkPath] of SYMLINKS) {
    link(join(nodeModules, linkPath), join(DSH_ROOT, relativeTarget))
  }

  // React + React DOM runtime and types from the checkout's pnpm store.
  // `react-dom` types are needed for the client trigger's `createPortal`.
  const react = storeDir('react@')
  const reactTypes = storeDir('@types+react@')
  const reactDom = storeDir('react-dom@')
  const reactDomTypes = storeDir('@types+react-dom@')
  if (react !== undefined) link(join(nodeModules, 'react'), join(DSH_ROOT, `node_modules/.pnpm/${react}/node_modules/react`))
  if (reactTypes !== undefined) link(join(nodeModules, '@types/react'), join(DSH_ROOT, `node_modules/.pnpm/${reactTypes}/node_modules/@types/react`))
  if (reactDom !== undefined) link(join(nodeModules, 'react-dom'), join(DSH_ROOT, `node_modules/.pnpm/${reactDom}/node_modules/react-dom`))
  if (reactDomTypes !== undefined) link(join(nodeModules, '@types/react-dom'), join(DSH_ROOT, `node_modules/.pnpm/${reactDomTypes}/node_modules/@types/react-dom`))

  console.log(
    `setup-dev-env: ${String(created)} links created, ${String(present)} already present, ${String(skipped)} skipped`,
  )
}

main()
