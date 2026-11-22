import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { buildInProgress, goldenClose, goldenResume } from '../evals/fixtures.mjs'
import { addStage } from '../scripts/add-stage.mjs'
import { checkRoot } from '../scripts/check-records.mjs'
import { closeTask, main } from '../scripts/close-task.mjs'

const roots = []
const freshRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-close-'))
  roots.push(root)
  return root
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const overall = (taskId, result = 'pass') => ({
  task: taskId, overall: true, criteria: 'O-1 The export contains every source row', result,
  delivery: 'The final export.', subject: 'The final export against feed.csv',
  method: 'Compare the row count and ids.', observed: result === 'pass' ? 'Every source row is present.' : 'Two rows are missing.',
  revision: 'abc1234, clean working tree',
})
const planOf = (root, taskId) => join(root, '.agent', `${taskId}-plan`, 'plan.md')
const errorsOf = (root, taskId) => checkRoot(root, taskId).issues.filter((issue) => issue.level === 'error')

/** A task whose items are all completed and which has not been closed. */
function ready() {
  const root = freshRoot()
  const { taskId } = buildInProgress(root)
  goldenResume(root, taskId)
  return { root, taskId }
}

test('closing writes the same records as a hand-written close and passes the checker', () => {
  const scripted = ready()
  addStage(scripted.root, overall(scripted.taskId))
  const result = closeTask(scripted.root, { task: scripted.taskId })
  assert.equal(result.overallAttempt, 1)
  assert.deepEqual(errorsOf(scripted.root, scripted.taskId), [])

  const manual = ready()
  goldenClose(manual.root, manual.taskId)
  assert.equal(scripted.taskId, manual.taskId)
  assert.equal(readFileSync(planOf(scripted.root, scripted.taskId), 'utf8'), readFileSync(planOf(manual.root, manual.taskId), 'utf8'))
  assert.equal(readFileSync(join(scripted.root, 'agent.md'), 'utf8'), readFileSync(join(manual.root, 'agent.md'), 'utf8'))
})

test('the latest overall attempt is cited unless one is named', () => {
  const { root, taskId } = ready()
  addStage(root, overall(taskId))
  addStage(root, overall(taskId))
  assert.equal(closeTask(root, { task: taskId }).overallAttempt, 2)
  assert.throws(() => closeTask(root, { task: taskId }), /already completed/)
  const other = ready()
  addStage(other.root, overall(other.taskId))
  addStage(other.root, overall(other.taskId))
  assert.throws(() => closeTask(other.root, { task: other.taskId, overallAttempt: 5 }), /does not exist/)
  assert.equal(closeTask(other.root, { task: other.taskId, overallAttempt: 1 }).overallAttempt, 1)
})

test('it refuses to close while items are open, no overall attempt exists, or pending_checks remain', () => {
  const open = freshRoot()
  const { taskId } = buildInProgress(open)
  assert.throws(() => closeTask(open, { task: taskId }), /items still open: T-002/)

  const none = ready()
  assert.throws(() => closeTask(none.root, { task: none.taskId }), /no overall attempt/)

  const pending = ready()
  addStage(pending.root, overall(pending.taskId))
  const path = planOf(pending.root, pending.taskId)
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^- pending_checks: .*$/m, '- pending_checks: Re-run the export on the full feed.'))
  assert.throws(() => closeTask(pending.root, { task: pending.taskId }), /pending_checks/)
})

test('a failing overall attempt leaves every file exactly as it was', () => {
  const { root, taskId } = ready()
  addStage(root, overall(taskId, 'fail'))
  const before = { plan: readFileSync(planOf(root, taskId), 'utf8'), index: readFileSync(join(root, 'agent.md'), 'utf8') }
  assert.throws(() => closeTask(root, { task: taskId }), /nothing was changed.*overall-criterion/)
  assert.equal(readFileSync(planOf(root, taskId), 'utf8'), before.plan)
  assert.equal(readFileSync(join(root, 'agent.md'), 'utf8'), before.index)
})

test('an unknown task is reported and CRLF files stay CRLF', () => {
  const { root, taskId } = ready()
  assert.throws(() => closeTask(root, { task: 'nope' }), /no task directory/)
  assert.throws(() => closeTask(root, {}), /--task/)
  addStage(root, overall(taskId))
  const path = planOf(root, taskId)
  writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'))
  closeTask(root, { task: taskId })
  const text = readFileSync(path, 'utf8')
  assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text))
  assert.deepEqual(errorsOf(root, taskId), [])
})

test('the CLI closes a task and rejects bad flags', () => {
  const { root, taskId } = ready()
  addStage(root, overall(taskId))
  const err = console.error
  const log = console.log
  console.error = () => {}
  console.log = () => {}
  try {
    assert.equal(main(['--bogus']), 2)
    assert.equal(main(['--task']), 2)
    assert.equal(main(['--task', taskId, '--overall-attempt', 'x', root]), 2)
    assert.equal(main(['--help']), 0)
    assert.equal(main(['--task', 'nope', root]), 2)
    assert.equal(main(['--task', taskId, root]), 0)
  } finally {
    console.error = err
    console.log = log
  }
  assert.deepEqual(errorsOf(root, taskId), [])
})
