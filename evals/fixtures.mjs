import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTask } from '../scripts/new-task.mjs'
import { addStage } from '../scripts/add-stage.mjs'

const FIXED = new Date('2026-01-15T08:30:12Z')

const taskDir = (root, taskId) => join(root, '.agent', `${taskId}-plan`)
const replaceLine = (text, pattern, line) => text.replace(pattern, line)

const FEED = 'id,amount\n1,100\n2,0\n3,250\n4,0\n5,75\n'
const EXPORTER = [
  "import { readFileSync } from 'node:fs'",
  '',
  "const [, , input = 'feed.csv'] = process.argv",
  "const rows = readFileSync(input, 'utf8').trim().split('\\n').slice(1).map((line) => {",
  "  const [id, amount] = line.split(',')",
  '  return { id: Number(id), amount: Number(amount) }',
  '})',
  '// Keep only the rows that have an amount.',
  'const exported = rows.filter((row) => row.amount)',
  'for (const row of exported) console.log(JSON.stringify(row))',
  '',
].join('\n')

/** A tiny project with a real bug: rows whose amount is 0 are dropped from the export. */
export function seedExportBug(root) {
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'feed.csv'), FEED)
  writeFileSync(join(root, 'src', 'export.js'), EXPORTER)
  writeFileSync(join(root, 'package.json'), '{\n  "name": "export-demo",\n  "private": true,\n  "type": "module"\n}\n')
}

/** Applies the fix a correct run would make: keep rows whose amount is a real number, zero included. */
export function fixExporter(root) {
  const path = join(root, 'src', 'export.js')
  const source = readFileSync(path, 'utf8')
  const fixed = source.replace('rows.filter((row) => row.amount)', 'rows.filter((row) => Number.isFinite(row.amount))')
  if (fixed === source) throw new Error('the seeded exporter does not contain the expected filter')
  writeFileSync(path, fixed)
}

/** A task whose first item is verified and whose second item is waiting. The owner is released. */
export function buildInProgress(root) {
  seedExportBug(root)
  const { taskId } = createTask(root, {
    title: 'Export batch amounts',
    goal: 'Export every batch row with converted amounts',
    criteria: ['The export contains every source row'],
    items: [
      'Reproduce the missing row|The missing row is reproduced|The missing row is reproduced with feed.csv',
      'Fix the filter|The row survives the filter|The row appears in the export|T-001',
    ],
  }, FIXED)
  addStage(root, {
    task: taskId, item: 'T-001', complete: true, result: 'pass',
    delivery: 'Reproduced the loss.', subject: 'feed.csv through the exporter',
    method: 'Trace one id through each stage.', observed: 'The id disappears in the filter.',
    revision: 'abc1234, clean working tree',
  })
  const planPath = join(taskDir(root, taskId), 'plan.md')
  let plan = readFileSync(planPath, 'utf8')
  plan = replaceLine(plan, /^- owner: .*$/m, '- owner: `none`')
  plan = replaceLine(plan, /^- confirmed: .*$/m, '- confirmed: T-001 verified.')
  plan = replaceLine(plan, /^- next_action: .*$/m, '- next_action: start T-002')
  writeFileSync(planPath, plan)
  return { taskId }
}

const stamp = (date) => date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')

/** The in-progress task, but another session claimed it a moment ago and may still be running. */
export function buildOwnedByOther(root) {
  const { taskId } = buildInProgress(root)
  const planPath = join(taskDir(root, taskId), 'plan.md')
  let plan = readFileSync(planPath, 'utf8')
  plan = replaceLine(plan, /^- owner: .*$/m, `- owner: \`session agent-b\` claimed \`${stamp(new Date())}\``)
  plan = replaceLine(plan, /^- next_action: .*$/m, '- next_action: agent-b is working on T-002')
  writeFileSync(planPath, plan)
  return { taskId }
}

/** Closes a task whose items are all completed: records an overall attempt and writes the closing fields. */
export function goldenClose(root, taskId) {
  const planPath = join(taskDir(root, taskId), 'plan.md')
  const criterion = /^ {2}- O-1: (.*)$/m.exec(readFileSync(planPath, 'utf8'))[1]
  const overall = addStage(root, {
    task: taskId, overall: true, criteria: `O-1 ${criterion}`, result: 'pass',
    delivery: 'The final export.', subject: 'The final export against feed.csv',
    method: 'Compare the row count and ids.', observed: 'Every source row is present.',
    revision: 'abc1234, clean working tree',
  })
  let plan = readFileSync(planPath, 'utf8')
  plan = replaceLine(plan, /^- status: .*$/m, '- status: completed')
  plan = replaceLine(plan, /^- owner: .*$/m, '- owner: `none`')
  plan = replaceLine(plan, /^- next_action: .*$/m, '- next_action: completed')
  plan = replaceLine(plan, /^- pending_checks: .*$/m, '- pending_checks: none')
  plan = replaceLine(plan, /^- overall_acceptance_ref: .*$/m, `- overall_acceptance_ref: [overall](stages/records.md#${overall.anchor})`)
  writeFileSync(planPath, plan)
  const indexPath = join(root, 'agent.md')
  writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('| in_progress |', '| completed |'))
}

/** A correct end state for the "fresh" scenario. */
export function goldenFresh(root, { fix = true } = {}) {
  seedExportBug(root)
  if (fix) fixExporter(root)
  const { taskId } = createTask(root, {
    title: 'Fix dropped zero-amount rows',
    goal: 'Keep rows whose amount is 0 in the export',
    criteria: ['Every row of feed.csv appears in the export'],
    items: [
      'Reproduce the loss|The dropped rows are identified|The zero-amount rows are missing from the export of feed.csv',
      'Fix the filter|Zero-amount rows survive|Zero-amount rows appear in the export of feed.csv|T-001',
    ],
  }, FIXED)
  for (const item of ['T-001', 'T-002']) {
    addStage(root, {
      task: taskId, item, complete: true, result: 'pass',
      delivery: `Finished ${item}.`, subject: 'feed.csv through the exporter',
      method: 'Run the exporter on feed.csv and diff the ids.', observed: 'The ids match the expectation for this item.',
      revision: 'abc1234, clean working tree',
    })
  }
  goldenClose(root, taskId)
  return { taskId }
}

/** A correct end state for the "resume" scenario. */
export function goldenResume(root, taskId) {
  fixExporter(root)
  addStage(root, {
    task: taskId, item: 'T-002', complete: true, result: 'pass',
    delivery: 'Fixed the filter.', subject: 'feed.csv through the fixed exporter',
    method: 'Run the exporter on feed.csv and diff the ids.', observed: 'The missing row now appears.',
    revision: 'def5678, clean working tree',
  })
}

/** A correct end state for the "replan" scenario: a new plan version, a replan entry, and no reused item ID. */
export function goldenReplan(root, taskId) {
  const dir = taskDir(root, taskId)
  const planPath = join(dir, 'plan.md')
  const previous = /^- plan_timestamp: `([^`]+)`/m.exec(readFileSync(planPath, 'utf8'))[1]
  const next = '2026-01-15_09-02-40'
  let plan = readFileSync(planPath, 'utf8')
  plan = replaceLine(plan, /^- plan_timestamp: .*$/m, `- plan_timestamp: \`${next}\``)
  plan = replaceLine(plan, /^- next_item_number: .*$/m, '- next_item_number: `4`')
  plan = replaceLine(plan, /^- next_action: .*$/m, '- next_action: start T-003')
  plan = plan.split('\n').filter((line) => !line.startsWith('| T-002 |')).join('\n')
  plan = plan.replace(/\n*$/, '\n') + '| T-003 | Fix the filter and refund rows | Rows and refunds survive | T-001 | The row and the refund rows appear in the export | pending | - |\n'
  writeFileSync(planPath, plan)
  const recordsPath = join(dir, 'stages', 'records.md')
  const block = [
    '',
    `<a name="stage-${next}-replan"></a>`,
    '',
    `## ${next} / replan`,
    '',
    `- previous_plan_timestamp: \`${previous}\``,
    '- trigger: The requirement changed: the export must also include refund rows.',
    '- affected_items: T-002 is replaced by T-003.',
    '- decision: Fix the filter for both amounts and refunds in one item.',
    '- evidence_impact: T-001 still covers the reproduction. T-003 needs a new check.',
    '',
  ].join('\n')
  writeFileSync(recordsPath, readFileSync(recordsPath, 'utf8').replace(/\n*$/, '\n') + block)
}
