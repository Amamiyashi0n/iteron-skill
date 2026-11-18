import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
      '',
      '## Resume Point',
      '',
      '- confirmed: T-001 verified.',
      '- pending_checks: None.',
      '- next_action: completed.',
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

test('a verification can quote literal template syntax', () => {
  const files = edit(validTask(), RECORDS, lines => replaceAll(lines, '- observed: 3 rows.', '- observed: The page displayed {{username}}.'))
  assert.deepEqual(codesOf(files), [])
})

test('historical evidence cannot complete an item or its reused overall criterion', () => {
  const files = reuseInOverall(validTask())
  const resultLine = files[RECORDS].indexOf('- result: pass')
  files[RECORDS].splice(resultLine + 1, 0, '- evidence_status: historical')
  assert.deepEqual(codesOf(files), ['error:acceptance-ref-not-pass', 'error:overall-criterion', 'error:method-source-not-verified'])
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

test('an active method needs a resolvable source for its own verified item', () => {
  const anchor = `#stage-${PLAN}-t-001-1`
  for (const [source, code] of [
    ['checked manually', 'method-source-broken'],
    [`[other file](../wrong.md${anchor})`, 'method-source-broken'],
    [`[missing](../stages/records.md#stage-${PLAN}-t-008-1)`, 'method-source-broken'],
    [`[overall](../stages/records.md#stage-${PLAN}-overall-1)`, 'method-source-not-verified'],
  ]) {
    const files = edit(validTask(), NOTES, lines => lines.map(line => line.startsWith('- source:') ? `- source: ${source}` : line))
    assert.deepEqual(codesOf(files), [`error:${code}`])
  }

  const files = validTask()
  files[NOTES] = files[NOTES].map(line => line.startsWith('## ') || line.startsWith('<a ')
    ? line.replace('T-001', 'T-002').replace('t-001', 't-002') : line)
  assert.deepEqual(codesOf(files), ['error:method-source-not-verified'])
})

test('a failed attempt can explain a discovery but cannot verify an active method', () => {
  const files = validTask()
  appendAttempt(files, 2, 'fail')
  files[NOTES].push(`- rationale: [filter diagnosis](../stages/records.md#stage-${PLAN}-t-001-2)`)
  assert.deepEqual(codesOf(files), ['warning:acceptance-ref-recheck'])
  files[NOTES] = files[NOTES].map(line => line.startsWith('- source:') ? line.replace('t-001-1)', 't-001-2)') : line)
  assert.ok(codesOf(files).includes('error:method-source-not-verified'))
  files[NOTES] = replaceAll(files[NOTES], '- status: active', '- status: historical')
  files[NOTES].push('- reason: Later verification contradicted the method.')
  assert.deepEqual(codesOf(files), ['warning:acceptance-ref-recheck'])
})

test('credential-looking text is flagged as a warning', () => {
  const sample = ['pass', 'word: hunter2'].join('')
  const files = edit(validTask(), RECORDS, (lines) => [...lines, `- observed: ${sample}`])
  assert.ok(codesOf(files).includes('warning:possible-secret'))
})

test('ordinary text that mentions a credential word is not flagged', () => {
  const files = edit(validTask(), RECORDS, (lines) => [
    ...lines,
    '- observed: password reset worked',
    '- observed: token: none',
    '- observed: api_key: <redacted>',
  ])
  assert.ok(!codesOf(files).includes('warning:possible-secret'))
})

test('an item attempt can reuse a previous passing attempt', () => {
  const files = validTask()
  files[RECORDS].push(
    `<a name="stage-${PLAN}-t-002-1"></a>`, `## ${PLAN} / T-002 / 1`,
    '### Verification Block', '- criteria: Rows match.',
    `- reused: [row count](#stage-${PLAN}-t-001-1) — input hashes match.`,
    '- result: pass',
  )
  assert.deepEqual(codesOf(files), [])
  files[RECORDS] = files[RECORDS].map(line => line.replace('row count](#stage-', 'row count](#stage-missing-'))
  assert.ok(codesOf(files).includes('error:reused-source-broken'))
})

test('a full reuse block cannot satisfy an overall criterion', () => {
  const files = validTask()
  files[RECORDS] = [
    ...files[RECORDS].slice(0, files[RECORDS].lastIndexOf('### Verification Block')),
    '### Verification Block', '- criteria: O-1 Row count',
    `- reused: [row count](#stage-${PLAN}-t-001-1) — input hashes match.`, '- result: pass',
  ]
  const codes = codesOf(files)
  assert.ok(codes.includes('error:overall-reuse-format'))
  assert.ok(codes.includes('error:overall-criterion'))
})

function appendAttempt(files, attempt, result, plan = PLAN) {
  files[RECORDS].push(
    '', `<a name="stage-${plan}-t-001-${attempt}"></a>`, `## ${plan} / T-001 / ${attempt}`,
    '### Verification Block', '- criteria: Rows match.', '- revision: def5678', `- result: ${result}`,
  )
}

test('a completed item flags the latest attempt in the same plan version', () => {
  for (const result of ['pass', 'fail', 'unverified']) {
    const files = validTask()
    appendAttempt(files, 2, result)
    const { issues } = checkRoot(makeRoot(files))
    assert.deepEqual(issues.map(issue => issue.level), ['warning'])
    assert.equal(issues[0].code, result === 'pass' ? 'acceptance-ref-stale' : 'acceptance-ref-recheck')
    assert.ok(issues[0].message.includes('attempt 2'))
    assert.ok(issues[0].message.includes(result))
  }
})

test('an older failure is resolved by citing the later pass', () => {
  const files = validTask()
  appendAttempt(files, 2, 'fail')
  appendAttempt(files, 3, 'pass')
  appendAttempt(files, 1, 'fail', '2026-01-16_08-31-00')
  files[PLAN_PATH] = files[PLAN_PATH].map(line => line.replace(' / T-001 / 1', ' / T-001 / 3').replace('t-001-1)', 't-001-3)'))
  assert.deepEqual(codesOf(files), [])
})

test('plan tables are read by column name', () => {
  const files = edit(validTask(), PLAN_PATH, (lines) => lines.map((line) => line.replace('| acceptance_ref |', '| evidence |')))
  assert.ok(codesOf(files).includes('error:table-column-missing'))
})

function reuseInOverall(files) {
  return edit(files, RECORDS, lines => [
    ...lines.slice(0, lines.lastIndexOf('### Verification Block')),
    `- O-1: [row count](#stage-${PLAN}-t-001-1) — input hashes match.`,
  ])
}

test('closure accepts a compact citation alongside a new check', () => {
  const files = reuseInOverall(validTask())
  files[PLAN_PATH].splice(files[PLAN_PATH].indexOf('  - O-1: Row count matches the feed.') + 1, 0, '  - O-2: Check export order.')
  files[RECORDS].push('### Verification Block', '- criteria: O-2 Order', '- result: pass', '- revision: abc1234')
  assert.deepEqual(codesOf(files), [])
})

test('a passing attempt for a different item cannot complete the plan item', () => {
  const files = edit(validTask(), PLAN_PATH, lines => lines.map(line => line.replace('| T-001 |', '| T-002 |')))
  files[PLAN_PATH] = replaceAll(files[PLAN_PATH], '- next_item_number: `2`', '- next_item_number: `3`')
  assert.deepEqual(codesOf(files), ['error:acceptance-ref-wrong-item'])
})

test('compact reuse cannot close a criterion with failed evidence', () => {
  const files = reuseInOverall(validTask())
  files[RECORDS] = replaceAll(files[RECORDS], '- result: pass', '- result: fail')
  assert.ok(codesOf(files).includes('error:reused-source-not-pass'))
})

test('a replan decision needs no verification block', () => {
  const files = edit(validTask(), RECORDS, lines => [
    ...lines, `<a name="stage-${PLAN}-replan"></a>`, `## ${PLAN} / replan`, '- decision: Split export and verification.',
  ])
  assert.deepEqual(codesOf(files), [])
})

test('the CLI isolates a selected task and retains repository-wide checks', () => {
  const other = '2026-02-01_00-00-00'
  const files = validTask()
  files['agent.md'].push(`| ${other} | Other export | export | completed | [plan](.agent/${other}-plan/plan.md) |`)
  files[`.agent/${other}-plan/plan.md`] = ['# Incomplete plan']
  const root = makeRoot(files)
  const cli = fileURLToPath(new URL('../scripts/check-records.mjs', import.meta.url))
  const run = (...args) => spawnSync(process.execPath, [cli, root, ...args], { encoding: 'utf8' })

  const selected = run(TASK)
  assert.equal(selected.status, 0, selected.stderr)
  assert.match(selected.stdout, /1 task\(s\) checked: 0 error\(s\), 0 warning\(s\)/)
  const full = run()
  assert.equal(full.status, 1)
  assert.match(full.stdout, /2 task\(s\) checked/)
  assert.match(full.stdout, /\[task-id-mismatch\]/)
  const invalid = run(other)
  assert.equal(invalid.status, 1)
  assert.match(invalid.stdout, /\[task-id-mismatch\]/)
  const unknown = run('2026-03-01_00-00-00')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stdout, /\[task-not-found\]/)
})
