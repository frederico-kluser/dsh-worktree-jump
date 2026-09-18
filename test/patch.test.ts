/**
 * Bundle-patch semantics, exercised against the vendored cordis include
 * plugin (the same code the harness applies at boot and on live reload):
 * the plugin's insert row joins the composition without touching other ids.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEntryPatches, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk up from the compiled test file to the plugin root (holds package.json). */
function pluginRoot(): string {
  let dir = dirname(fileURLToPath(new URL(import.meta.url)))
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error('plugin root not found')
    dir = parent
  }
}

const PLUGIN_ROOT = pluginRoot()

test('the bundle patch declares a single insert with its own id', () => {
  const patchPath = join(PLUGIN_ROOT, 'cordis.patch.yml')
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')) as {
    dsh?: { bundle?: { patch?: string } }
  }
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  const text = readFileSync(patchPath, 'utf8')
  assert.match(text, /id: worktree-jump/)
  assert.match(text, /name: '\.\/lib\/index\.js'/)
  // The patch never targets another package's row id (whole-entry replace rule).
  for (const forbidden of ['webserver', 'modules', 'web-runtime', 'connection']) {
    assert.doesNotMatch(text, new RegExp(`- id: ${forbidden}\\b`), `must not target ${forbidden}`)
  }
})

test('applying the insert leaves existing rows byte-identical and adds one row', () => {
  const base = [
    { id: 'webserver', name: '@deepseek-ai/dsh-host-webserver', config: { port: 3080 } },
    { id: 'modules', name: '@deepseek-ai/dsh-client-modules' },
  ]
  const patches: PatchOptions[] = [{ insert: [{ id: 'worktree-jump', name: './lib/index.js' }] }]
  const applied = applyEntryPatches(base, patches, () => {})
  assert.equal(applied.length, 3)
  assert.deepEqual(applied[0], base[0])
  assert.deepEqual(applied[1], base[1])
  assert.deepEqual(applied[2], { id: 'worktree-jump', name: './lib/index.js' })
  // The input is never mutated.
  assert.equal(base.length, 2)
})

test('an empty patch list leaves the entry list untouched', () => {
  const base = [{ id: 'webserver', name: '@deepseek-ai/dsh-host-webserver' }]
  const applied = applyEntryPatches(base, [], () => {})
  assert.equal(applied.length, 1)
  assert.deepEqual(applied[0], base[0])
})
