import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { goldenFresh, goldenReplan, goldenResume } from '../evals/fixtures.mjs'
import { grade, loadScenarios, loadTriggerCases, setup } from '../evals/run.mjs'

const roots = []
const freshRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'iteron-eval-'))
  roots.push(root)
  return root
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
const scenario = (id) => loadScenarios().find((candidate) => candidate.id === id)

test('trigger cases are well formed and balanced', () => {
  const cases = loadTriggerCases()
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, 'ids are unique')
  for (const c of cases) {
    assert.equal(typeof c.prompt, 'string', c.id)
    assert.equal(typeof c.trigger, 'boolean', c.id)
    assert.ok(['clear', 'boundary'].includes(c.kind), c.id)
    assert.ok(c.why, c.id)
  }
  const clear = cases.filter((c) => c.kind === 'clear')
  assert.ok(clear.filter((c) => c.trigger).length >= 10)
  assert.ok(clear.filter((c) => !c.trigger).length >= 10)
  assert.ok(cases.some((c) => c.kind === 'boundary'))
})

test('scenarios are well formed', () => {
  const scenarios = loadScenarios()
  assert.equal(new Set(scenarios.map((s) => s.id)).size, scenarios.length)
  for (const s of scenarios) {
    assert.ok(s.title && s.prompt && s.expect, s.id)
    assert.ok([null, 'in-progress'].includes(s.fixture), s.id)
  }
})

test('a correct fresh run passes and an empty repository fails', () => {
  const good = freshRoot()
  goldenFresh(good)
  const result = grade(scenario('fresh'), good)
  assert.deepEqual(result.checks.filter((c) => !c.ok), [])
  assert.equal(result.pass, true)
  assert.equal(grade(scenario('fresh'), freshRoot()).pass, false)
})

test('a correct resume passes and doing nothing fails', () => {
  const good = freshRoot()
  const { baseline } = setup('resume', good)
  assert.equal(grade(scenario('resume'), good, baseline).pass, false)
  goldenResume(good, baseline.taskId)
  const result = grade(scenario('resume'), good, baseline)
  assert.deepEqual(result.checks.filter((c) => !c.ok), [])
  assert.equal(result.pass, true)
})

test('redoing the first item fails the resume scenario', () => {
  const root = freshRoot()
  const { baseline } = setup('resume', root)
  goldenResume(root, baseline.taskId)
  const again = {
    task: baseline.taskId, item: 'T-001', complete: true, result: 'pass', delivery: 'Again.', subject: 's',
    method: 'm', observed: 'o', revision: 'r',
  }
  return import('../scripts/add-stage.mjs').then(({ addStage }) => {
    addStage(root, again)
    const failed = grade(scenario('resume'), root, baseline).checks.filter((c) => !c.ok).map((c) => c.name)
    assert.ok(failed.some((name) => name.includes('T-001')), failed.join('; '))
  })
})

test('a correct replan passes and doing nothing fails', () => {
  const good = freshRoot()
  const { baseline } = setup('replan', good)
  assert.equal(grade(scenario('replan'), good, baseline).pass, false)
  goldenReplan(good, baseline.taskId)
  const result = grade(scenario('replan'), good, baseline)
  assert.deepEqual(result.checks.filter((c) => !c.ok), [])
  assert.equal(result.pass, true)
})
