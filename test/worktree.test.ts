/** Pure planning tests: name grammar, path composition, exclude maintenance. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  DEFAULT_WORKTREE_DIRNAME, excludeContains, planWorktree, validateWorktreeName, withExcludeEntry,
} from '../src/worktree.ts'

test('validateWorktreeName admits a safe single segment', () => {
  assert.equal(validateWorktreeName('my-feature'), 'my-feature')
  assert.equal(validateWorktreeName('Feature_2.0'), 'Feature_2.0')
  assert.equal(validateWorktreeName('a'), 'a')
})

test('validateWorktreeName rejects separators, dots, dashes, and oversize names', () => {
  for (const bad of ['', ' leading', 'trail ', 'has/slash', 'has space', '-lead', '.lead', 'a'.repeat(65), 'a/b']) {
    assert.throws(() => validateWorktreeName(bad), `expected rejection for ${JSON.stringify(bad)}`)
  }
})

test('planWorktree defaults to <repoRoot>/.worktrees with a repo-local exclude', () => {
  const plan = planWorktree('/home/u/proj', '/home/u/proj/.git', 'feature', undefined)
  assert.equal(plan.worktreeRoot, join('/home/u/proj', DEFAULT_WORKTREE_DIRNAME))
  assert.equal(plan.worktreePath, join('/home/u/proj', DEFAULT_WORKTREE_DIRNAME, 'feature'))
  assert.equal(plan.branch, 'feature')
  assert.equal(plan.excludeEntry, '.worktrees/')
  assert.equal(plan.excludeFile, join('/home/u/proj/.git', 'info', 'exclude'))
})

test('planWorktree with a configured root outside the repo excludes nothing', () => {
  const plan = planWorktree('/home/u/proj', '/home/u/proj/.git', 'feature', '/srv/worktrees')
  assert.equal(plan.worktreeRoot, '/srv/worktrees')
  assert.equal(plan.worktreePath, join('/srv/worktrees', 'feature'))
  assert.equal(plan.excludeEntry, undefined)
})

test('withExcludeEntry appends once with a marker and stays idempotent', () => {
  const first = withExcludeEntry(undefined, '.worktrees/')
  assert.match(first, /# added by dsh-worktree-jump/)
  assert.match(first, /\.worktrees\/\n$/)
  assert.equal(withExcludeEntry(first, '.worktrees/'), first)
  const existing = 'node_modules/\n'
  const appended = withExcludeEntry(existing, '.worktrees/')
  assert.match(appended, /^node_modules\/\n/)
  assert.match(appended, /\.worktrees\/\n$/)
  assert.equal(withExcludeEntry(appended, '.worktrees/'), appended)
})

test('excludeContains matches trimmed lines only', () => {
  assert.equal(excludeContains('.worktrees/\n', '.worktrees/'), true)
  assert.equal(excludeContains('# comment\n  .worktrees/  \n', '.worktrees/'), true)
  assert.equal(excludeContains(undefined, '.worktrees/'), false)
  assert.equal(excludeContains('node_modules/\n', '.worktrees/'), false)
})
