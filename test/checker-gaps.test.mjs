import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { checkRoot } from '../scripts/check-records.mjs'

const TASK = '2026-01-15_08-30-12'
const PLAN = '2026-01-15_08-31-00'
const DIR = `.agent/${TASK}-plan`
const roots = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function makeRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'iteron-gaps-'))
  roots.push(root)
  for (const [path, lines] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, `${lines.join('\n')}\n`)
  }
  return root
}

const codesOf = (files, options) => checkRoot(makeRoot(files), undefined, options).issues.map((issue) => `${issue.level}:${issue.code}`)

/** A completed one-item task. The options vary the pieces under test. */
function task({ planCriteria = 'Rows match', checkCriteria = 'Rows match.', deps = '-', planTimestamp = PLAN, owner = 'none', status = 'completed' } = {}) {
  return {
    'agent.md': [
      '# Task Index',
      '',
      '| task_id | title | search_terms | status | plan_link |',
      '| --- | --- | --- | --- | --- |',
      `| \`${TASK}\` | Export | feed.csv | ${status} | [Open plan](${DIR}/plan.md) |`,
    ],
    [`${DIR}/plan.md`]: [
      '# Export',
      '',
      `- task_id: \`${TASK}\``,
      `- plan_timestamp: \`${planTimestamp}\``,
      `- status: ${status}`,
      `- owner: ${owner}`,
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
      `| T-001 | Export | amounts.jsonl | ${deps} | ${planCriteria} | completed | [\`${PLAN} / T-001 / 1\`](stages/records.md#stage-${PLAN}-t-001-1) |`,
    ],
    [`${DIR}/stages/records.md`]: [
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
      `- criteria: ${checkCriteria}`,
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
  }
}

test('the fixture is a clean completed task', () => {
  assert.deepEqual(codesOf(task()), [])
})

test('one word from a long criterion does not cover it', () => {
  const long = 'Every exported amounts value matches the independent reference'
  assert.deepEqual(codesOf(task({ planCriteria: long, checkCriteria: long })), [])
  assert.ok(codesOf(task({ planCriteria: long, checkCriteria: 'amounts' })).includes('error:criteria-mismatch'))
  assert.ok(codesOf(task({ planCriteria: '导出的每一行金额都与参考数据一致', checkCriteria: '金额' })).includes('error:criteria-mismatch'))
})

test('a check that states most of a criterion still covers it', () => {
  const long = 'Every exported amounts value matches the independent reference'
  assert.deepEqual(codesOf(task({ planCriteria: long, checkCriteria: 'Every exported amounts value matches the independent reference data' })), [])
  assert.deepEqual(codesOf(task({ planCriteria: long, checkCriteria: 'Exported amounts value matches the independent reference' })), [])
})

test('a malformed depends_on token is reported instead of ignored', () => {
  for (const deps of ['T1', 't-001', 'T-1', 'TO-001']) {
    assert.ok(codesOf(task({ deps })).includes('error:depends-malformed'), deps)
  }
  for (const deps of ['-', 'none', 'T-001, T-002']) {
    assert.ok(!codesOf(task({ deps })).includes('error:depends-malformed'), deps)
  }
})

test('plan and claim timestamps must be real dates', () => {
  assert.ok(codesOf(task({ planTimestamp: '2026-13-45_99-99-99' })).includes('error:plan-timestamp'))
  assert.ok(codesOf(task({ planTimestamp: '2026-02-30_08-31-00' })).includes('error:plan-timestamp'))
  const open = task({ status: 'in_progress', owner: '`agent` claimed `2026-13-45_99-99-99`' })
  assert.ok(codesOf(open).includes('warning:owner-claim-time'))
  const valid = task({ status: 'in_progress', owner: '`agent` claimed `2026-01-15_08-30-12`' })
  assert.ok(!codesOf(valid, { now: Date.UTC(2026, 0, 16) }).includes('warning:owner-claim-time'))
})
