import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { checkRoot } from '../scripts/check-records.mjs'

const TASK = '2026-01-15_08-30-12'
const PLAN = '2026-01-15_08-31-00'
const DIR = `.agent/${TASK}-plan`
const PLAN_PATH = `${DIR}/plan.md`
const RECORDS = `${DIR}/stages/records.md`
const NOTES = `${DIR}/distillation/notes.md`
const roots = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function makeRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'iteron-check-'))
  roots.push(root)
  for (const [path, lines] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, `${lines.join('\n')}\n`)
  }
  return root
}

const codesOf = (files) => checkRoot(makeRoot(files)).issues.map((issue) => `${issue.level}:${issue.code}`)

function edit(files, path, change) {
  return { ...files, [path]: change(files[path]) }
}

function dropFirst(lines, text) {
  const index = lines.indexOf(text)
  assert.notEqual(index, -1, `fixture line not found: ${text}`)
  return lines.filter((_, i) => i !== index)
}

function replaceAll(lines, from, to) {
  return lines.map((line) => (line === from ? to : line))
}

/** A completed task whose index, plan, stage records and method are all valid. */
function validTask() {
  return {
    'agent.md': [
      '# Task Index',
      '',
      '| task_id | title | search_terms | status | plan_link |',
      '| --- | --- | --- | --- | --- |',
      `| \`${TASK}\` | Export | feed.csv | completed | [Open plan](${PLAN_PATH}) |`,
    ],
    [PLAN_PATH]: [
      '# Export',
      '',
      `- task_id: \`${TASK}\``,
      `- plan_timestamp: \`${PLAN}\``,
      '- status: completed',
      '- owner: `none`',
      '- next_item_number: `2`',
      '- search_terms: feed.csv',
      '- goal: Export amounts.',
      '- requirements: Include id and amount.',
      '- constraints: None.',
      '- overall_acceptance:',
      '  - O-1: Row count matches the feed.',
      `- overall_acceptance_ref: [overall](stages/records.md#stage-${PLAN}-overall-1)`,
      '- open_assumptions: None.',
      '',
      '## Resume Point',
      '',
      '- confirmed: T-001 verified.',
      '- pending_checks: None.',
      '- next_action: completed.',
      '- delegated: None.',
      '',
      '## Current Plan',
      '',
      '| item_id | requirement | expected_result | depends_on | acceptance_criteria | status | acceptance_ref |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      `| T-001 | Export | amounts.jsonl | - | Rows match | completed | [\`${PLAN} / T-001 / 1\`](stages/records.md#stage-${PLAN}-t-001-1) |`,
    ],
    [RECORDS]: [
      '# Stage Records',
      '',
      '[Current plan](../plan.md)',
      '',
      `<a name="stage-${PLAN}-t-001-1"></a>`,
      '',
      `## ${PLAN} / T-001 / 1`,
      '',
      '- delivery: Exported the amounts.',
      '',
      '### Verification Block',
      '',
      '- criteria: Rows match.',
      '- subject: amounts.jsonl against feed.csv.',
      '- revision: abc1234, clean working tree',
      '- method: Compare the id sequences.',
      '- result: pass',
      '- observed: 3 rows in both files.',
      '- evidence_status: current',
      '',
      `<a name="stage-${PLAN}-overall-1"></a>`,
      '',
      `## ${PLAN} / overall / 1`,
      '',
      '- delivery: amounts.jsonl for the batch.',
      '',
      '### Verification Block',
      '',
      '- criteria: O-1 Row count matches the feed.',
      '- subject: amounts.jsonl against feed.csv.',
      '- revision: abc1234, clean working tree',
      '- method: Compare line counts.',
      '- result: pass',
      '- observed: 3 rows.',
      '- evidence_status: current',
    ],
    [NOTES]: [
      '# Distillation',
      '',
      '[Current plan](../plan.md)',
      '',
      `<a name="distillation-${PLAN}-t-001-1"></a>`,
      '',
      `## ${PLAN} / T-001 / M-1`,
      '',
      '- title: Confirm the unit against a reference',
      '- status: active',
      '- applies_when: The unit is unspecified.',
      '- route: Compare every row with the reference.',
      '- check: Every value agrees.',
      `- source: [${PLAN} / T-001 / 1](../stages/records.md#stage-${PLAN}-t-001-1)`,
      '- search_terms: unit, feed.csv',
    ],
  }
}

test('a complete task has no issues', () => {
  assert.deepEqual(codesOf(validTask()), [])
})

test('an empty repository has nothing to check', () => {
  assert.deepEqual(checkRoot(makeRoot({})).issues, [])
})

test('unfilled placeholders are errors', () => {
  const files = edit(validTask(), PLAN_PATH, (lines) => [...lines, '- note: {{todo}}'])
  assert.ok(codesOf(files).includes('error:placeholder'))
})

test('the index status must match the plan', () => {
  const files = edit(validTask(), 'agent.md', (lines) => lines.map((line) => line.replace('| completed |', '| in_progress |')))
  assert.ok(codesOf(files).includes('error:index-status-mismatch'))
})

test('a task directory missing from the index is an error', () => {
  const files = { ...validTask(), '.agent/2026-02-01_00-00-00-plan/plan.md': ['# Other'] }
  assert.ok(codesOf(files).includes('error:index-missing-row'))
})

test('a completed item must point at a passing stage', () => {
  const files = edit(validTask(), RECORDS, (lines) => {
    const index = lines.indexOf('- result: pass')
    return lines.map((line, i) => (i === index ? '- result: fail' : line))
  })
  assert.ok(codesOf(files).includes('error:acceptance-ref-not-pass'))
})

test('a checked block needs a revision', () => {
  const files = edit(validTask(), RECORDS, (lines) => dropFirst(lines, '- revision: abc1234, clean working tree'))
  assert.ok(codesOf(files).includes('error:revision-missing'))
})

test('a failing overall criterion blocks closure', () => {
  const files = edit(validTask(), RECORDS, (lines) => replaceAll(lines, '- result: pass', '- result: fail'))
  assert.ok(codesOf(files).includes('error:overall-criterion'))
})

test('a closed task must release its owner', () => {
  const files = edit(validTask(), PLAN_PATH, (lines) => replaceAll(lines, '- owner: `none`', '- owner: `session abc, lead` claimed `2026-01-15_08-30-12`'))
  assert.ok(codesOf(files).includes('error:owner-not-released'))
})

test('a stage heading needs its anchor', () => {
  const files = edit(validTask(), RECORDS, (lines) => dropFirst(lines, `<a name="stage-${PLAN}-t-001-1"></a>`))
  assert.ok(codesOf(files).includes('error:anchor-missing'))
})

test('a method must carry its required fields', () => {
  const files = edit(validTask(), NOTES, (lines) => dropFirst(lines, '- applies_when: The unit is unspecified.'))
  assert.ok(codesOf(files).includes('error:method-field-missing'))
})

test('credential-looking text is flagged as a warning', () => {
  const sample = ['pass', 'word: hunter2'].join('')
  const files = edit(validTask(), RECORDS, (lines) => [...lines, `- observed: ${sample}`])
  assert.ok(codesOf(files).includes('warning:possible-secret'))
})
