/** Git execution over the subprocess contract, against real git in temp repos. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { insideWorkTree, parseWorktreeList, worktreeList } from '../src/service.ts'
import { gitOk, runGit, GitFailureError } from '../src/git.ts'
import { FakeSubprocess, makeGitRepo, tempDir, git } from './helpers.ts'

test('insideWorkTree resolves repo root and common git dir', async () => {
  using dir = await tempDir('git-inside-')
  const repo = await makeGitRepo(dir.path)
  const subprocess = new FakeSubprocess()
  const inside = await insideWorkTree(subprocess, repo, 10_000)
  assert.equal(inside.inside, true)
  assert.equal(inside.repoRoot, repo)
  assert.ok(inside.gitDir.endsWith('/.git'))
})

test('insideWorkTree rejects a plain directory', async () => {
  using dir = await tempDir('git-plain-')
  const subprocess = new FakeSubprocess()
  const result = await insideWorkTree(subprocess, dir.path, 10_000)
  assert.equal(result.inside, false)
})

test('gitOk returns trimmed stdout and rejects non-zero exits', async () => {
  using dir = await tempDir('git-ok-')
  const repo = await makeGitRepo(dir.path)
  const subprocess = new FakeSubprocess()
  await assert.equal(await gitOk(subprocess, repo, 10_000, ['rev-parse', '--is-inside-work-tree']), 'true')
  await assert.rejects(
    gitOk(subprocess, repo, 10_000, ['rev-parse', '--verify', 'definitely-not-a-ref']),
    GitFailureError,
  )
})

test('git commands carry an explicit non-interactive env and managed spec', async () => {
  using dir = await tempDir('git-spec-')
  const repo = await makeGitRepo(dir.path)
  const subprocess = new FakeSubprocess()
  await runGit(subprocess, ['git', 'status'], repo, 10_000)
  const spec = subprocess.spawned[0]
  assert.ok(spec, 'the spawn spec was captured')
  assert.deepEqual(spec.argv.slice(0, 1), ['git'])
  assert.equal(spec.cwd, repo)
  assert.equal(spec.stdio.stdin, 'ignore')
  assert.equal(spec.env?.GIT_TERMINAL_PROMPT, '0')
  assert.ok(spec.graceMs > 0)
})

test('parseWorktreeList reads porcelain rows in order, detached as (detached)', () => {
  const porcelain = [
    'worktree /repo',
    'HEAD abcdef1234567890',
    'branch refs/heads/main',
    '',
    'worktree /repo/.worktrees/feature',
    'HEAD bcdef12345678900',
    '',
  ].join('\n')
  const rows = parseWorktreeList(porcelain)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { path: '/repo', branch: 'main', head: 'abcdef123' })
  assert.deepEqual(rows[1], { path: '/repo/.worktrees/feature', branch: '(detached)', head: 'bcdef1234' })
})

test('worktreeList runs the real command and reflects a new worktree', async () => {
  using dir = await tempDir('git-list-')
  const repo = await makeGitRepo(dir.path)
  const subprocess = new FakeSubprocess()
  assert.equal((await worktreeList(subprocess, repo, 10_000)).length, 1)
  git(repo, ['worktree', 'add', join(repo, '.worktrees', 'wt-a'), '-b', 'wt-a'])
  const rows = await worktreeList(subprocess, repo, 10_000)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.branch, 'main')
  assert.equal(rows[1]?.branch, 'wt-a')
})

test('runGit reports a killed command as a signal outcome', async () => {
  using dir = await tempDir('git-signal-')
  const repo = await makeGitRepo(dir.path)
  const subprocess = new FakeSubprocess()
  const result = await runGit(subprocess, ['git', 'rev-parse', 'HEAD'], repo, 10_000)
  assert.equal(result.signal, null)
  assert.equal(result.exitCode, 0)
})
