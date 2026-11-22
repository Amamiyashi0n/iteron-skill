import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRoot } from '../scripts/check-records.mjs'
import { createTask } from '../scripts/new-task.mjs'
import { addStage, main } from '../scripts/add-stage.mjs'

const fixed = new Date('2026-01-15T08:30:12Z')
const base = {
  title: 'Export batch amounts',
  goal: 'Export every batch row with converted amounts',
  criteria: ['The export contains every source row'],
  items: [
    'Reproduce the missing row|Missing row is reproduced|The missing row is reproduced with feed.csv',
    'Fix the filter|Row survives the filter|The row appears in the export|T-001',
  ],
}
const stage = {
  delivery: 'Reproduced the loss.',
  subject: 'feed.csv through the exporter',
  method: 'Trace one id through each stage.',
  observed: 'The id disappears in the filter.',
  revision: 'abc1234, clean working tree',
  result: 'pass',
}
const withTask = (fn, taskOptions = base) => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-stage-'))
  try {
    const { taskId } = createTask(root, taskOptions, fixed)
    return fn(root, taskId)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const errors = (root, taskId) => checkRoot(root, taskId).issues.filter((i) => i.level === 'error')

test('an item can declare dependencies and the plan still passes the checker', () => {
  withTask((root, taskId) => {
    const plan = readFileSync(join(root, '.agent', `${taskId}-plan`, 'plan.md'), 'utf8')
    assert.match(plan, /\| T-002 \| Fix the filter \| Row survives the filter \| T-001 \|/)
    assert.deepEqual(errors(root, taskId), [])
  })
})

test('bad dependencies are rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-dep-'))
  try {
    const attempt = (item) => createTask(root, { ...base, items: [item] }, fixed)
    assert.throws(() => attempt('a|b|c|T-009'), /T-009/)
    assert.throws(() => attempt('a|b|c|T-001'), /itself/)
    assert.throws(() => attempt('a|b|c|d|e'), /requirement\|expected\|criteria/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a baseline is written to the plan', () => {
  withTask((root, taskId) => {
    const plan = readFileSync(join(root, '.agent', `${taskId}-plan`, 'plan.md'), 'utf8')
    assert.match(plan, /- baseline: 3 of 4 rows exported/)
  }, { ...base, baseline: '3 of 4 rows exported' })
})

test('a passing attempt with --complete closes the item and passes the checker', () => {
  withTask((root, taskId) => {
    const result = addStage(root, { ...stage, task: taskId, item: 'T-001', complete: true })
    assert.equal(result.attempt, 1)
    const plan = readFileSync(join(root, '.agent', `${taskId}-plan`, 'plan.md'), 'utf8')
    assert.match(plan, /\| T-001 \|.*\| completed \| \[`2026-01-15_08-30-12 \/ T-001 \/ 1`\]\(stages\/records\.md#stage-2026-01-15_08-30-12-t-001-1\) \|/)
    assert.match(plan, /\| T-002 \|.*\| pending \| - \|/)
    assert.deepEqual(errors(root, taskId), [])
  })
})

test('the criteria default to the plan wording and attempts count up', () => {
  withTask((root, taskId) => {
    addStage(root, { ...stage, task: taskId, item: 'T-001', result: 'fail' })
    const second = addStage(root, { ...stage, task: taskId, item: 'T-001', complete: true })
    assert.equal(second.attempt, 2)
    const records = readFileSync(join(root, '.agent', `${taskId}-plan`, 'stages', 'records.md'), 'utf8')
    assert.match(records, /- criteria: The missing row is reproduced with feed\.csv/)
    assert.match(records, /^## 2026-01-15_08-30-12 \/ T-001 \/ 2$/m)
    assert.deepEqual(errors(root, taskId), [])
  })
})

test('an overall attempt uses its own heading and needs an O-n criterion', () => {
  withTask((root, taskId) => {
    assert.throws(() => addStage(root, { ...stage, task: taskId, overall: true }), /O-/)
    const result = addStage(root, { ...stage, task: taskId, overall: true, criteria: 'O-1 The export contains every source row', checkedBy: 'existing test suite' })
    assert.equal(result.anchor, 'stage-2026-01-15_08-30-12-overall-1')
    const records = readFileSync(join(root, '.agent', `${taskId}-plan`, 'stages', 'records.md'), 'utf8')
    assert.match(records, /- checked_by: existing test suite/)
  })
})

test('invalid requests change nothing', () => {
  withTask((root, taskId) => {
    const plan = join(root, '.agent', `${taskId}-plan`, 'plan.md')
    const before = readFileSync(plan, 'utf8')
    assert.throws(() => addStage(root, { ...stage, task: taskId, item: 'T-009' }), /not in the current plan/)
    assert.throws(() => addStage(root, { ...stage, task: 'nope', item: 'T-001' }), /no task directory/)
    assert.throws(() => addStage(root, { ...stage, task: taskId, item: 'T-001', result: 'fail', complete: true }), /--complete/)
    assert.throws(() => addStage(root, { ...stage, task: taskId, item: 'T-001', overall: true }), /exactly one/)
    assert.throws(() => addStage(root, { ...stage, task: taskId, item: 'T-001', result: 'maybe' }), /--result/)
    assert.throws(() => addStage(root, { ...stage, task: taskId, item: 'T-001', observed: '' }), /observed/)
    assert.equal(readFileSync(plan, 'utf8'), before)
    assert.throws(() => readFileSync(join(root, '.agent', `${taskId}-plan`, 'stages', 'records.md')), /ENOENT/)
  })
})

test('the CLI records an attempt and rejects bad flags', () => {
  withTask((root, taskId) => {
    const err = console.error
    const log = console.log
    console.error = () => {}
    console.log = () => {}
    try {
      assert.equal(main(['--bogus']), 2)
      assert.equal(main(['--item']), 2)
      assert.equal(main(['--help']), 0)
      const argv = ['--task', taskId, '--item', 'T-001', '--delivery', 'd', '--subject', 's', '--method', 'm', '--observed', 'o', '--result', 'pass', '--revision', 'r', '--complete', root]
      assert.equal(main(argv), 0)
      assert.equal(main(['--task', taskId, '--item', 'T-009', '--delivery', 'd', '--subject', 's', '--method', 'm', '--observed', 'o', '--result', 'pass', '--revision', 'r', root]), 2)
    } finally {
      console.error = err
      console.log = log
    }
    assert.deepEqual(errors(root, taskId), [])
  })
})
