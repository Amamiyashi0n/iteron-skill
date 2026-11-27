import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRoot } from '../scripts/check-records.mjs'
import { createTask } from '../scripts/new-task.mjs'
import { addStage } from '../scripts/add-stage.mjs'
import { updatePlan, main as updateMain } from '../scripts/update-plan.mjs'
import { addMethod } from '../scripts/add-method.mjs'
import { closeTask } from '../scripts/close-task.mjs'

const fixed = new Date('2026-01-15T08:30:12Z')
const base = {
  title: 'Export batch amounts',
  goal: 'Export every batch row',
  criteria: ['O-1: The export contains every source row'],
  items: ['Reproduce|Reproduced|The missing row is reproduced with feed.csv', 'Fix|Row survives|The row appears in the export|T-001'],
}
const stage = { delivery: 'Did it.', subject: 'feed.csv', method: 'Ran the exporter.', observed: 'Seen.', revision: 'abc1234', result: 'pass' }
const errors = (root, taskId) => checkRoot(root, taskId).issues.filter((i) => i.level === 'error')
const withTask = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-plan-'))
  try {
    const { taskId } = createTask(root, base, fixed)
    return fn(root, taskId)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const plan = (root, taskId) => readFileSync(join(root, '.agent', `${taskId}-plan`, 'plan.md'), 'utf8')

test('new-task does not repeat an O-n prefix the caller already wrote', () => {
  withTask((root, taskId) => {
    assert.match(plan(root, taskId), /^ {2}- O-1: The export contains every source row$/m)
  })
})

test('update-plan claims, moves the resume point and sets item and task status', () => {
  withTask((root, taskId) => {
    updatePlan(root, { task: taskId, claim: 'session s1', confirmed: 'T-001 reproduced', next: 'fix T-002', items: [{ item: 'T-002', status: 'in_progress' }], taskStatus: 'in_progress' }, new Date('2026-01-15T09:00:00Z'))
    const text = plan(root, taskId)
    assert.match(text, /^- owner: `session s1` claimed `2026-01-15_09-00-00`$/m)
    assert.match(text, /^- confirmed: T-001 reproduced$/m)
    assert.match(text, /^- next_action: fix T-002$/m)
    assert.match(text, /^\| T-002 \|.*\| in_progress \|/m)
    assert.deepEqual(errors(root, taskId), [])
    updatePlan(root, { task: taskId, release: true })
    assert.match(plan(root, taskId), /^- owner: `none`$/m)
  })
})

test('update-plan refuses to complete or touch a completed item and rejects empty calls', () => {
  withTask((root, taskId) => {
    assert.throws(() => updatePlan(root, { task: taskId, items: [{ item: 'T-001', status: 'completed' }] }), /add-stage --complete/)
    addStage(root, { ...stage, task: taskId, item: 'T-001', complete: true })
    assert.throws(() => updatePlan(root, { task: taskId, items: [{ item: 'T-001', status: 'pending' }] }), /is completed/)
    assert.equal(updateMain(['--task', taskId, root]), 0, 'records link is added once stages exist')
    assert.match(plan(root, taskId), /^- records: \[Stage records\]\(stages\/records\.md\)$/m)
    assert.equal(updateMain(['--task', taskId, root]), 2, 'nothing left to change')
    assert.equal(updateMain(['--task', taskId, '--item', 'T-002', root]), 2, '--item needs --status')
  })
})

test('a full scripted lifecycle with a distilled method and its reuse passes the checker', () => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-life-'))
  try {
    const { taskId } = createTask(root, base, fixed)
    updatePlan(root, { task: taskId, claim: 'session s1' })
    addStage(root, { ...stage, task: taskId, item: 'T-001', complete: true })
    addStage(root, { ...stage, task: taskId, item: 'T-002', complete: true })
    const method = addMethod(root, { task: taskId, item: 'T-001', title: 'Trace one id', appliesWhen: 'A row goes missing', route: 'Follow one id through each stage', check: 'The id is found where it disappears', searchTerms: 'missing row, trace' })
    assert.match(plan(root, taskId), /^- records: \[Stage records\]\(stages\/records\.md\) \/ \[Distillation\]\(distillation\/notes\.md\)$/m)
    addStage(root, { ...stage, task: taskId, overall: true, criteria: 'O-1 The export contains every source row' })
    closeTask(root, { task: taskId })
    assert.deepEqual(errors(root, taskId), [])

    const second = createTask(root, { ...base, title: 'Second export' }, new Date('2026-01-16T08:00:00Z')).taskId
    addStage(root, { ...stage, task: second, item: 'T-001', appliedDistillation: method.link })
    assert.match(readFileSync(join(root, '.agent', `${second}-plan`, 'stages', 'records.md'), 'utf8'), /^- applied_distillation: \[.*\]\(\.\.\/\.\.\/.*#distillation-/m)
    assert.deepEqual(errors(root, second), [])

    addStage(root, { ...stage, task: second, item: 'T-002', appliedDistillation: '[gone](../../nope-plan/distillation/notes.md#distillation-x)' })
    assert.ok(errors(root, second).some((i) => i.code === 'applied-distillation-broken'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('add-method only distils from a completed item', () => {
  withTask((root, taskId) => {
    assert.throws(() => addMethod(root, { task: taskId, item: 'T-001', title: 't', appliesWhen: 'a', route: 'r', check: 'c', searchTerms: 's' }), /not completed/)
  })
})

test('add-stage --overall supports multi-criteria, --reuse, and --attempt appending', () => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-overall-'))
  try {
    const { taskId } = createTask(root, {
      ...base,
      criteria: ['Every source row is exported', 'Totals match reference', 'No errors printed'],
    }, fixed)
    const t1 = addStage(root, { ...stage, task: taskId, item: 'T-001', complete: true })
    const t2 = addStage(root, { ...stage, task: taskId, item: 'T-002', complete: true })

    // Mix direct check + reuse in one overall attempt, then append a third criterion to the same attempt.
    const o1 = addStage(root, {
      ...stage, task: taskId, overall: true,
      criteria: ['O-2 Totals match reference'],
      reuse: [`O-1: [T-001 / 1](#${t1.anchor}) — checked inputs unchanged`],
    })
    assert.equal(o1.attempt, 1)
    const appended = addStage(root, {
      ...stage, task: taskId, overall: true, attempt: 1,
      criteria: ['O-3 No errors printed'],
    })
    assert.equal(appended.attempt, 1)
    assert.equal(appended.appended, true)
    closeTask(root, { task: taskId })
    assert.deepEqual(errors(root, taskId), [])

    // Reuse-only overall attempt needs no subject/method/observed/revision/result.
    const second = createTask(root, { ...base, title: 'Reuse only', criteria: ['Row is reproduced'] }, new Date('2026-01-16T08:00:00Z')).taskId
    const s1 = addStage(root, { ...stage, task: second, item: 'T-001', complete: true })
    addStage(root, { ...stage, task: second, item: 'T-002', complete: true })
    addStage(root, { task: second, overall: true, delivery: 'Final delivery.', reuse: [`O-1: [T-001 / 1](#${s1.anchor}) — inputs unchanged`] })
    closeTask(root, { task: second })
    assert.deepEqual(errors(root, second), [])

    // Bad flags are rejected.
    assert.throws(() => addStage(root, { ...stage, task: second, item: 'T-001', reuse: ['O-1: [x](#stage-a) — ok'] }), /--reuse can only/)
    assert.throws(() => addStage(root, { ...stage, task: second, item: 'T-001', attempt: 1 }), /--attempt can only/)
    assert.throws(() => addStage(root, { ...stage, task: second, overall: true, attempt: 9, criteria: 'O-1 x' }), /does not exist/)
    assert.throws(() => addStage(root, { task: second, overall: true, delivery: 'd', reuse: ['bad reuse'] }), /--reuse must look like/)
    assert.ok(t2.anchor)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
