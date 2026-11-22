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

test('both record directories work in the same repository', () => {
  const files = validTask()
  const other = '2026-02-01_00-00-00'
  const legacy = validTask()
  const legacyDir = `agent/${other}-plan`
  files['agent.md'].push(legacy['agent.md'].at(-1).replaceAll(TASK, other).replace('.agent/', 'agent/'))
  for (const [path, lines] of Object.entries(legacy)) {
    if (path.startsWith(DIR)) files[path.replace(DIR, legacyDir)] = lines.map(line => line.replaceAll(TASK, other))
  }
  files['agent/release-plan/plan.md'] = ['# Unrelated document']
  const root = makeRoot(files)
  assert.deepEqual(checkRoot(root), { issues: [], tasks: 2 })
  assert.deepEqual(checkRoot(root, other), { issues: [], tasks: 1 })
})

test('a task ID cannot appear in both record directories', () => {
  const files = validTask()
  files[PLAN_PATH.replace('.agent/', 'agent/')] = files[PLAN_PATH]
  assert.deepEqual(codesOf(files), ['error:task-dir-duplicate'])
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

test('task and evidence links must point to the files users open', () => {
  const files = reuseInOverall(validTask())
  files['agent.md'] = files['agent.md'].map(line => line.replace(PLAN_PATH, '.agent/other-plan/plan.md'))
  files[PLAN_PATH] = files[PLAN_PATH].map(line => line.replaceAll('(stages/records.md#', '(wrong.md#'))
  files[RECORDS] = files[RECORDS].map(line => line.replace('[row count](#', '[row count](wrong.md#'))
  assert.deepEqual(codesOf(files), [
    'error:index-plan-link', 'error:reused-source-broken', 'error:acceptance-ref-broken', 'error:overall-ref',
  ])
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

test('a revision must contain the recorded hash when it cites one', () => {
  const placeholder = '- revision: `index.html` SHA-256 `$hash`; source commit `abc1234`.'
  const original = '- revision: abc1234, clean working tree'
  const files = edit(validTask(), RECORDS, lines => replaceAll(lines, original, placeholder))
  assert.deepEqual(codesOf(files), ['error:revision-unresolved', 'error:revision-unresolved'])

  const recordedHash = placeholder.replace('$hash', '58f0ac0de1c0bcef093cb46630501936b2f02323ee2987b7722e40d6429fbf2f')
  files[RECORDS] = replaceAll(files[RECORDS], placeholder, recordedHash)
  assert.deepEqual(codesOf(files), [])
})

test('a failing overall criterion blocks closure', () => {
  const files = edit(validTask(), RECORDS, (lines) => replaceAll(lines, '- result: pass', '- result: fail'))
  assert.ok(codesOf(files).includes('error:overall-criterion'))
})

test('overall attempts in the same plan cannot share a number', () => {
  const files = edit(validTask(), RECORDS, lines => {
    const start = lines.indexOf(`<a name="stage-${PLAN}-overall-1"></a>`)
    return [...lines, '', ...lines.slice(start)]
  })
  assert.deepEqual(codesOf(files), ['error:attempt-duplicate'])
})

test('a newer overall attempt in the same plan is surfaced when closure cites an older pass', () => {
  for (const result of ['pass', 'fail', 'unverified']) {
    const files = validTask()
    files[RECORDS].push(
      `<a name="stage-${PLAN}-overall-2"></a>`, `## ${PLAN} / overall / 2`,
      '### Verification Block', '- criteria: O-1 Row count', '- revision: def5678', `- result: ${result}`,
    )
    const expected = result === 'pass' ? 'warning:overall-ref-stale' : 'warning:overall-ref-recheck'
    assert.deepEqual(codesOf(files), [expected])
  }
})

test('a closed task must release its owner', () => {
  const files = edit(validTask(), PLAN_PATH, (lines) => replaceAll(lines, '- owner: `none`', '- owner: `session abc, lead` claimed `2026-01-15_08-30-12`'))
  assert.ok(codesOf(files).includes('error:owner-not-released'))
})

test('a closed task cannot leave a pending next action', () => {
  const files = edit(validTask(), PLAN_PATH, lines => replaceAll(
    lines, '- next_action: completed.', '- next_action: Run overall verification.',
  ))
  assert.deepEqual(codesOf(files), ['error:completed-next-action'])
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
  files[PLAN_PATH] = replaceAll(files[PLAN_PATH], '- next_item_number: `2`', '- next_item_number: `3`')
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
    '### Verification Block', '- criteria: Rows match.', '- subject: amounts.jsonl against feed.csv.', '- method: Compare the id sequences.', '- observed: Rows match.', '- revision: def5678', `- result: ${result}`,
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

test('an unversioned check can pass directly but cannot be reused', () => {
  const original = '- revision: abc1234, clean working tree'
  const files = edit(validTask(), RECORDS, lines => replaceAll(lines, original, '- revision: none'))
  assert.deepEqual(codesOf(files), [])

  const reused = reuseInOverall(files)
  assert.deepEqual(codesOf(reused), ['error:reused-source-no-revision', 'error:overall-criterion'])
})

test('closure accepts a compact citation alongside a new check', () => {
  const files = reuseInOverall(validTask())
  files[PLAN_PATH].splice(files[PLAN_PATH].indexOf('  - O-1: Row count matches the feed.') + 1, 0, '  - O-2: Check export order.')
  files[RECORDS].push('### Verification Block', '- criteria: O-2 Check export order', '- subject: amounts.jsonl', '- method: Compare the id sequences.', '- observed: Order matches.', '- result: pass', '- revision: abc1234')
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

// --- Checks for gaps in the record checker ---

import { splitCells } from '../scripts/record-markdown.mjs'

const OLD_PLAN = '2025-12-31_00-00-00'

function stageBlock(plan, item, attempt) {
  return [
    '', `<a name="stage-${plan}-${item.toLowerCase()}-${attempt}"></a>`, '', `## ${plan} / ${item} / ${attempt}`, '',
    '- delivery: Earlier delivery.', '', '### Verification Block', '',
    '- criteria: Rows match.', '- subject: amounts.jsonl against feed.csv.', '- revision: abc1234, clean working tree',
    '- method: Compare the id sequences.', '- result: pass', '- observed: 3 rows in both files.',
  ]
}

function openTask(owner) {
  const files = validTask()
  files['agent.md'] = files['agent.md'].map(line => line.replace('| completed |', '| in_progress |'))
  files[PLAN_PATH] = files[PLAN_PATH].map(line => line.replace('- status: completed', '- status: in_progress').replace(/^- owner: .*$/, `- owner: ${owner}`))
  return files
}

const issuesAt = (files, now) => checkRoot(makeRoot(files), undefined, { now }).issues.map(issue => `${issue.level}:${issue.code}`)

test('a completed item must check the criterion the plan states', () => {
  const files = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: Rows match.', '- criteria: The page loads.'))
  assert.ok(codesOf(files).includes('error:criteria-mismatch'))
  const reworded = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: Rows match.', '- criteria: Output rows match the input feed.'))
  assert.deepEqual(codesOf(reworded), [])
  const overall = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: O-1 Row count matches the feed.', '- criteria: O-1 Looks fine.'))
  assert.ok(codesOf(overall).includes('error:criteria-mismatch'))
})

test('closing evidence must say what was tested, how and what was seen', () => {
  const item = edit(validTask(), RECORDS, lines => dropFirst(lines, '- observed: 3 rows in both files.'))
  assert.deepEqual(codesOf(item), ['error:evidence-incomplete'])
  const overall = edit(validTask(), RECORDS, lines => dropFirst(lines, '- method: Compare line counts.'))
  assert.deepEqual(codesOf(overall), ['error:evidence-incomplete'])
})

test('an unfilled template placeholder is an error', () => {
  const field = edit(validTask(), RECORDS, lines => [...lines, '- observed: {{observed}}'])
  assert.ok(codesOf(field).includes('error:placeholder-unfilled'))
  const cell = edit(validTask(), PLAN_PATH, lines => lines.map(line => line.replace('| Export |', '| {{requirement}} |')))
  assert.ok(codesOf(cell).includes('error:placeholder-unfilled'))
})

test('a newer plan version needs its replan entry', () => {
  const files = validTask()
  files[RECORDS].push(...stageBlock(OLD_PLAN, 'T-001', 1))
  assert.ok(codesOf(files).includes('error:replan-missing'))
  files[RECORDS].push('', `<a name="stage-${PLAN}-replan"></a>`, '', `## ${PLAN} / replan`, '', `- previous_plan_timestamp: \`${OLD_PLAN}\``, '- decision: Split the export.')
  assert.deepEqual(codesOf(files), [])
})

test('a replan entry must move the plan version forward', () => {
  const same = validTask()
  same[RECORDS].push('', `<a name="stage-${PLAN}-replan"></a>`, '', `## ${PLAN} / replan`, '', `- previous_plan_timestamp: \`${PLAN}\``)
  assert.ok(codesOf(same).includes('error:replan-timestamp'))
  const later = '2026-02-01_00-00-00'
  const ahead = validTask()
  ahead[RECORDS].push('', `<a name="stage-${later}-replan"></a>`, '', `## ${later} / replan`, '', `- previous_plan_timestamp: \`${PLAN}\``)
  assert.ok(codesOf(ahead).includes('error:replan-ahead'))
})

test('depends_on must name items in the current plan', () => {
  const withDeps = (deps) => (lines) => lines.map(line => line.replace('| amounts.jsonl | - |', `| amounts.jsonl | ${deps} |`))
  assert.ok(codesOf(edit(validTask(), PLAN_PATH, withDeps('T-099'))).includes('error:depends-unknown'))
  assert.ok(codesOf(edit(validTask(), PLAN_PATH, withDeps('T-001'))).includes('error:depends-self'))
  const cycle = edit(validTask(), PLAN_PATH, withDeps('T-002'))
  cycle[PLAN_PATH] = replaceAll(cycle[PLAN_PATH], '- next_item_number: `2`', '- next_item_number: `3`')
  cycle[PLAN_PATH].push('| T-002 | Report | report.md | T-001 | Report exists | pending | - |')
  assert.ok(codesOf(cycle).includes('warning:depends-cycle'))
})

test('a retired item ID cannot be reused', () => {
  const files = validTask()
  files[RECORDS].push(...stageBlock(PLAN, 'T-002', 1))
  assert.ok(codesOf(files).includes('error:next-item-number'))
  files[PLAN_PATH] = replaceAll(files[PLAN_PATH], '- next_item_number: `2`', '- next_item_number: `3`')
  assert.deepEqual(codesOf(files), [])
})

test('an open task with an old or unreadable claim is flagged', () => {
  const files = openTask('`session abc` claimed `2026-01-01_00-00-00`')
  assert.ok(issuesAt(files, Date.UTC(2026, 0, 20)).includes('warning:owner-stale'))
  assert.ok(!issuesAt(files, Date.UTC(2026, 0, 2)).includes('warning:owner-stale'))
  assert.ok(issuesAt(openTask('session abc'), Date.UTC(2026, 0, 2)).includes('warning:owner-claim-time'))
})

test('a cancelled task needs a reason and a released owner', () => {
  const files = validTask()
  files['agent.md'] = files['agent.md'].map(line => line.replace('| completed |', '| cancelled |'))
  files[PLAN_PATH] = files[PLAN_PATH].map(line => line.replace('- status: completed', '- status: cancelled'))
  assert.deepEqual(codesOf(files), ['error:cancel-reason-missing'])
  files[PLAN_PATH].splice(files[PLAN_PATH].indexOf('- goal: Export amounts.') + 1, 0, '- cancel_reason: The user dropped the work.')
  assert.deepEqual(codesOf(files), [])
  files[PLAN_PATH] = replaceAll(files[PLAN_PATH], '- owner: `none`', '- owner: `session abc` claimed `2026-01-15_08-30-12`')
  assert.deepEqual(codesOf(files), ['error:owner-not-released'])
})

test('a closed task has no pending checks or delegations', () => {
  const pending = edit(validTask(), PLAN_PATH, lines => replaceAll(lines, '- pending_checks: None.', '- pending_checks: Verify the export.'))
  assert.deepEqual(codesOf(pending), ['error:closure-pending-checks'])
  const delegated = edit(validTask(), PLAN_PATH, lines => [...lines, '- delegated: T-001 to agent reviewer'])
  assert.deepEqual(codesOf(delegated), ['error:closure-delegated'])
})

test('pipes inside table cells stay in their cell', () => {
  assert.deepEqual(splitCells('| a | `x|y` | c \\| d |'), ['a', '`x|y`', 'c | d'])
  assert.deepEqual(splitCells('| a | `unbalanced | b |'), ['a', '`unbalanced', 'b'])
  const withCriterion = (text) => (lines) => lines.map(line => line.replace('| Rows match |', `| ${text} |`))
  assert.deepEqual(codesOf(edit(validTask(), PLAN_PATH, withCriterion('Rows match `rg a|b`'))), [])
  assert.deepEqual(codesOf(edit(validTask(), PLAN_PATH, withCriterion('Rows match a \\| b'))), [])
  assert.ok(codesOf(edit(validTask(), PLAN_PATH, withCriterion('Rows match a|b'))).includes('error:table-row-columns'))
})

test('credential shapes are rejected and ordinary text is left alone', () => {
  const flagged = [
    [['-----BEGIN RSA ', 'PRIVATE KEY-----'].join(''), 'error:secret-detected'],
    [['AKIA', 'IOSFODNN7EXAMPLE'].join(''), 'error:secret-detected'],
    [['postgres://admin:', 'hunter2@db.local/app'].join(''), 'error:secret-detected'],
    [['Authorization: Bearer ', 'abcdefghijklmnop1234'].join(''), 'error:secret-detected'],
    [['密码是 ', 'hunter2x'].join(''), 'warning:possible-secret'],
  ]
  for (const [sample, code] of flagged) {
    const files = edit(validTask(), RECORDS, lines => [...lines, `- observed: ${sample}`])
    assert.ok(codesOf(files).includes(code), sample)
  }
  for (const sample of ['postgres://admin:${DB_PASS}@db.local/app', '密码是否正确', 'the bearer token was rotated', 'token: none']) {
    const files = edit(validTask(), RECORDS, lines => [...lines, `- observed: ${sample}`])
    assert.deepEqual(codesOf(files), [], sample)
  }
})

function stillOpen(files) {
  const open = edit(files, PLAN_PATH, lines => replaceAll(lines, '- status: completed', '- status: in_progress'))
  return edit(open, 'agent.md', lines => lines.map(line => line.replace('| completed |', '| in_progress |')))
}

test('an evidence gap is a warning while the task is open and an error once it is closed', () => {
  const mismatch = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: Rows match.', '- criteria: The page loads.'))
  const open = codesOf(stillOpen(mismatch))
  assert.ok(open.includes('warning:criteria-mismatch'))
  assert.ok(!open.some(code => code.startsWith('error:criteria-mismatch')))
  const gap = edit(validTask(), RECORDS, lines => dropFirst(lines, '- observed: 3 rows in both files.'))
  assert.ok(codesOf(stillOpen(gap)).includes('warning:evidence-incomplete'))
  assert.ok(codesOf(gap).includes('error:evidence-incomplete'))
})

test('the criteria-mismatch message names the three ways forward', () => {
  const files = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: Rows match.', '- criteria: The page loads.'))
  const issue = checkRoot(makeRoot(files)).issues.find(found => found.code === 'criteria-mismatch')
  assert.match(issue.message, /quote the plan's wording/)
  assert.match(issue.message, /new attempt/)
  assert.match(issue.message, /replan/)
})

test('an unresolved merge conflict in the index or a task file is an error', () => {
  const index = edit(validTask(), 'agent.md', lines => [...lines, '=======', '>>>>>>> feature'].reduce((all, line, i) => (i === lines.length ? [...all, '<<<<<<< HEAD', line] : [...all, line]), []))
  assert.ok(codesOf(index).includes('error:merge-conflict'))
  const records = edit(validTask(), RECORDS, lines => [...lines, '<<<<<<< HEAD'])
  assert.ok(codesOf(records).includes('error:merge-conflict'))
  assert.ok(!codesOf(validTask()).includes('error:merge-conflict'))
})

test('a setext underline or a table of equals signs is not a conflict', () => {
  const files = edit(validTask(), RECORDS, lines => [...lines, '', 'Heading', '=======', ''])
  assert.ok(!codesOf(files).includes('error:merge-conflict'))
})

// --- Checks for gap fixes ---

test('reused evidence must include a comparison after the link', () => {
  const overallBare = edit(validTask(), RECORDS, lines => [
    ...lines.slice(0, lines.lastIndexOf('### Verification Block')),
    `- O-1: [row count](#stage-${PLAN}-t-001-1)`,
  ])
  assert.ok(codesOf(overallBare).includes('error:reused-comparison-missing'))

  const itemBare = validTask()
  itemBare[PLAN_PATH] = replaceAll(itemBare[PLAN_PATH], '- next_item_number: `2`', '- next_item_number: `3`')
  itemBare[RECORDS].push(
    `<a name="stage-${PLAN}-t-002-1"></a>`, `## ${PLAN} / T-002 / 1`,
    '### Verification Block', '- criteria: Rows match.',
    `- reused: [row count](#stage-${PLAN}-t-001-1) —`,
    '- result: pass',
  )
  assert.ok(codesOf(itemBare).includes('error:reused-comparison-missing'))
})

test('unfilled placeholders are caught in headings, indented criteria, owner, links and index', () => {
  assert.ok(codesOf(edit(validTask(), PLAN_PATH, lines => replaceAll(lines, '# Export', '# {{title}}'))).includes('error:placeholder-unfilled'))
  assert.ok(codesOf(edit(validTask(), PLAN_PATH, lines => replaceAll(lines, '  - O-1: Row count matches the feed.', '  - O-1: {{overall_criterion}}'))).includes('error:placeholder-unfilled'))
  assert.ok(codesOf(openTask('`{{owner}}` claimed `{{claimed_at}}`')).includes('error:placeholder-unfilled'))
  assert.ok(codesOf(edit(validTask(), 'agent.md', lines => lines.map(line => line.replace('| Export |', '| {{title}} |')))).includes('error:placeholder-unfilled'))
  const linkPlaceholder = edit(validTask(), RECORDS, lines => [
    ...lines.slice(0, lines.lastIndexOf('### Verification Block')),
    `- O-1: [row count](#stage-${PLAN}-t-001-1) — {{comparison}}`,
  ])
  assert.ok(codesOf(linkPlaceholder).includes('error:placeholder-unfilled'))
})

test('criteria matching rejects trivial fragments and stop words while keeping real phrases', () => {
  for (const trivial of ['at', 'the', 'ok', 's']) {
    const files = edit(validTask(), RECORDS, lines => replaceAll(lines, '- criteria: Rows match.', `- criteria: ${trivial}`))
    assert.ok(codesOf(files).includes('error:criteria-mismatch'), trivial)
  }
  const zh = edit(validTask(), PLAN_PATH, lines => lines.map(line => line.replace('| Rows match |', '| 导出行数一致 |')))
  zh[RECORDS] = replaceAll(zh[RECORDS], '- criteria: Rows match.', '- criteria: 导出行数一致。')
  assert.deepEqual(codesOf(zh), [])
})

test('indented overall criteria and compact markdown tables parse cleanly', () => {
  const files = edit(validTask(), PLAN_PATH, lines => lines
    .map(line => line === '  - O-1: Row count matches the feed.' ? '    - O-1: Row count matches the feed.' : line)
    .map(line => line.startsWith('| item_id |') ? '|item_id|requirement|expected_result|depends_on|acceptance_criteria|status|acceptance_ref|' : line))
  assert.deepEqual(codesOf(files), [])
})

test('a replan entry cannot point to a previous_plan_timestamp newer than itself', () => {
  const files = validTask()
  files[RECORDS].push('', `<a name="stage-${PLAN}-replan"></a>`, '', `## ${PLAN} / replan`, '', '- previous_plan_timestamp: `2026-02-01_00-00-00`', '- decision: Reorder.')
  assert.ok(codesOf(files).includes('error:replan-timestamp'))
})

test('unlabeled API key shapes are rejected as secrets', () => {
  const samples = [
    ['sk-proj-', '1234567890abcdefghijklmnop'].join(''),
    ['AIza', 'SyA12345678901234567890123456789012'].join(''),
  ]
  for (const sample of samples) {
    const files = edit(validTask(), RECORDS, lines => [...lines, `- observed: ${sample}`])
    assert.ok(codesOf(files).includes('error:secret-detected'), sample)
  }
})

test('applied_distillation links are resolved and historical methods warn', () => {
  const active = edit(validTask(), RECORDS, lines => {
    const idx = lines.indexOf('- delivery: Exported the amounts.')
    return [...lines.slice(0, idx + 1), `- applied_distillation: [M-1](../distillation/notes.md#distillation-${PLAN}-t-001-1) — unit check`, ...lines.slice(idx + 1)]
  })
  assert.deepEqual(codesOf(active), [])

  const historical = edit(active, NOTES, lines => [...replaceAll(lines, '- status: active', '- status: historical'), '- reason: Superseded.'])
  assert.deepEqual(codesOf(historical), ['warning:applied-distillation-historical'])

  const broken = edit(active, RECORDS, lines => lines.map(line => line.replace('t-001-1)', 't-999-1)')))
  assert.deepEqual(codesOf(broken), ['error:applied-distillation-broken'])
})

test('the CLI supports --help, --json, --strict, --stale-days and rejects unknown flags', () => {
  const cli = fileURLToPath(new URL('../scripts/check-records.mjs', import.meta.url))
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })

  const help = run('--help')
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage: node scripts\/check-records\.mjs/)

  const badFlag = run('--bogus')
  assert.equal(badFlag.status, 2)
  assert.match(badFlag.stderr, /unknown option/)

  const stale = openTask('`session abc` claimed `2020-01-01_00-00-00`')
  const root = makeRoot(stale)
  const jsonRun = run('--json', '--stale-days', '1', root)
  assert.equal(jsonRun.status, 0, jsonRun.stderr)
  const payload = JSON.parse(jsonRun.stdout)
  assert.equal(payload.tasks, 1)
  assert.equal(payload.errors, 0)
  assert.ok(payload.warnings >= 1)
  assert.ok(payload.issues.some(i => i.code === 'owner-stale'))

  const strictRun = run('--strict', root)
  assert.equal(strictRun.status, 1)
})
