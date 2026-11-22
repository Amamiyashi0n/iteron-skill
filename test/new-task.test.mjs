import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRoot } from '../scripts/check-records.mjs'
import { createTask, formatTimestamp, main } from '../scripts/new-task.mjs'

const base = {
  title: 'Export batch amounts',
  goal: 'Export every batch row with converted amounts',
  criteria: ['The export contains every source row'],
  items: ['Reproduce the missing row|Missing row is reproduced|The missing row is reproduced with feed.csv'],
}
const fixed = new Date('2026-01-15T08:30:12Z')
const withRoot = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-new-'))
  try { return fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('formats UTC task timestamps', () => {
  assert.equal(formatTimestamp(fixed), '2026-01-15_08-30-12')
})

test('a new task passes the checker without errors', () => {
  withRoot((root) => {
    const result = createTask(root, { ...base, items: [...base.items, 'Fix filter|Row survives|Row appears in the export'] }, fixed)
    assert.equal(result.taskId, '2026-01-15_08-30-12')
    const { issues, tasks } = checkRoot(root, result.taskId)
    assert.equal(tasks, 1)
    assert.deepEqual(issues.filter((i) => i.level === 'error'), [])
    assert.match(readFileSync(join(root, 'agent.md'), 'utf8'), /\| `2026-01-15_08-30-12` \| Export batch amounts/)
  })
})

test('a second task keeps the index and gets a suffix on collision', () => {
  withRoot((root) => {
    createTask(root, base, fixed)
    const second = createTask(root, { ...base, title: 'Second' }, fixed)
    assert.equal(second.taskId, '2026-01-15_08-30-12-2')
    const { issues, tasks } = checkRoot(root)
    assert.equal(tasks, 2)
    assert.deepEqual(issues.filter((i) => i.level === 'error'), [])
  })
})

test('pipes in cells are escaped', () => {
  withRoot((root) => {
    createTask(root, { ...base, title: 'a | b' }, fixed)
    assert.match(readFileSync(join(root, 'agent.md'), 'utf8'), /a \\\| b/)
  })
})

test('missing inputs are rejected before anything is written', () => {
  withRoot((root) => {
    assert.throws(() => createTask(root, { ...base, title: '' }, fixed), /title/)
    assert.throws(() => createTask(root, { ...base, criteria: [] }, fixed), /criterion/)
    assert.throws(() => createTask(root, { ...base, items: ['only|two'] }, fixed), /requirement\|expected\|criteria/)
    assert.equal(existsSync(join(root, 'agent.md')), false)
    assert.equal(existsSync(join(root, '.agent')), false)
  })
})

test('the CLI creates a task and rejects bad flags', () => {
  withRoot((root) => {
    const err = console.error
    const log = console.log
    console.error = () => {}
    console.log = () => {}
    try {
      assert.equal(main(['--bogus']), 2)
      assert.equal(main(['--title']), 2)
      assert.equal(main(['--help']), 0)
      assert.equal(main(['--title', 'T', '--goal', 'G', '--criterion', 'C', '--item', 'r|e|a', root]), 0)
    } finally {
      console.error = err
      console.log = log
    }
    assert.equal(checkRoot(root).issues.filter((i) => i.level === 'error').length, 0)
  })
})
