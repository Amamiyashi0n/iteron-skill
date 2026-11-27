#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from './task-records.mjs'
/** One line the caller can act on without running the checker separately. */
function checkSummary(root, taskId) {
  const issues = checkRoot(root, taskId).issues
  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  const list = (xs) => xs.slice(0, 6).map((issue) => `${issue.code} (${issue.message})`).join('; ')
  return `check: ${errors.length} error(s)${errors.length ? ` — ${list(errors)}` : ''}, ${warnings.length} warning(s)${warnings.length ? ` — ${list(warnings)}` : ''}`
}


const ITEM_ID = /^T-\d{3,}$/
const RESULTS = ['pass', 'fail', 'unverified']
const RECORDS_HEADER = '# Stage Records\n\n[Current plan](../plan.md)\n'

const USAGE = [
  'Usage: node scripts/add-stage.mjs [options] [root]',
  '',
  'Appends one verification attempt to a task\'s stages/records.md.',
  '',
  'Options:',
  '  --task <task_id>        Task to record against (required)',
  '  --item <T-nnn>          Plan item that was verified (or use --overall)',
  '  --overall               Record an overall attempt; --criteria must start with O-<n>',
  '  --delivery <text>       What was delivered or attempted (required)',
  '  --criteria <text>       Criteria checked (default for an item: the plan\'s acceptance_criteria)',
  '  --subject <text>        What was tested (required)',
  '  --method <text>         How it was checked (required)',
  '  --observed <text>       What was seen (required)',
  '  --result <pass|fail|unverified>   Outcome (required)',
  '  --revision <text>       Exact state checked, such as a commit or "none" (required)',
  '  --checked-by <text>     Who or what ran the check',
  '  --evidence <text>       Link to a log, report or artifact',
  '  --applied-distillation <link>   Distilled method used in this attempt, as a markdown link to its anchor',
  '                          (add-method prints it; from another task: ../../<task_id>-plan/distillation/notes.md#<anchor>)',
  '  --complete              With --result pass on an item: mark the item completed and set acceptance_ref',
  '  --json                  Print the recorded attempt as JSON',
  '  -h, --help              Show this help message',
].join('\n')

const clean = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').trim()
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const splitRow = (line) => line.split(/(?<!\\)\|/)

function findTaskDir(root, taskId) {
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base, `${taskId}-plan`)
    if (existsSync(join(dir, 'plan.md'))) return dir
  }
  return undefined
}

function readPlanField(text, key) {
  const match = new RegExp(`^- ${key}: \`?([^\`\\r\\n]+)\`?\\s*$`, 'm').exec(text)
  return match?.[1].trim()
}

function planTable(lines) {
  const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
  if (headerAt === -1) throw new Error('plan.md has no Current Plan table')
  const headers = splitRow(lines[headerAt]).map((cell) => cell.trim())
  return { headerAt, headers }
}

export function addStage(root, options) {
  const need = (key, flag = key) => {
    if (!options[key] || !clean(options[key])) throw new Error(`missing required option: --${flag}`)
  }
  need('task')
  need('delivery')
  need('subject')
  need('method')
  need('observed')
  need('revision')
  need('result')
  if (!RESULTS.includes(options.result)) throw new Error(`--result must be ${RESULTS.join(', ')}`)
  if (Boolean(options.overall) === Boolean(options.item)) throw new Error('give exactly one of --item and --overall')
  if (options.complete && (options.overall || options.result !== 'pass')) {
    throw new Error('--complete needs --item and --result pass')
  }

  const dir = findTaskDir(root, options.task)
  if (!dir) throw new Error(`no task directory found for ${options.task}`)
  const planPath = join(dir, 'plan.md')
  const planText = readFileSync(planPath, 'utf8')
  const lf = planText.replace(/\r\n/g, '\n')
  const planTimestamp = readPlanField(lf, 'plan_timestamp')
  if (!planTimestamp) throw new Error('plan.md has no plan_timestamp')

  const lines = lf.split('\n')
  const { headerAt, headers } = planTable(lines)
  const column = (name) => headers.indexOf(name)
  let rowAt = -1
  let rowCells
  if (options.item) {
    if (!ITEM_ID.test(options.item)) throw new Error(`--item must look like T-001, got: ${options.item}`)
    rowAt = lines.findIndex((line, i) => i > headerAt && line.startsWith('|') && splitRow(line)[column('item_id')]?.trim() === options.item)
    if (rowAt === -1) throw new Error(`${options.item} is not in the current plan`)
    rowCells = splitRow(lines[rowAt])
  }

  let criteria = options.criteria ? clean(options.criteria) : undefined
  if (options.item && !criteria) criteria = clean(rowCells[column('acceptance_criteria')] ?? '')
  if (!criteria) {
    throw new Error(options.overall ? 'missing required option: --criteria (an overall attempt needs one starting with O-<n>)' : 'missing required option: --criteria')
  }
  if (options.overall && !/^O-\d+\b/.test(criteria)) throw new Error('an overall --criteria must start with O-<n>, such as "O-1 Row count matches"')

  const subject = options.item ?? 'overall'
  const recordsPath = join(dir, 'stages', 'records.md')
  const records = existsSync(recordsPath) ? readFileSync(recordsPath, 'utf8').replace(/\r\n/g, '\n') : RECORDS_HEADER
  const heading = new RegExp(`^## ${escapeRegExp(planTimestamp)} / ${escapeRegExp(subject)} / (\\d+)\\s*$`, 'gm')
  const attempt = Math.max(0, ...[...records.matchAll(heading)].map((match) => Number(match[1]))) + 1
  const anchor = `stage-${planTimestamp}-${subject.toLowerCase()}-${attempt}`

  const block = [
    `<a name="${anchor}"></a>`,
    '',
    `## ${planTimestamp} / ${subject} / ${attempt}`,
    '',
    `- delivery: ${clean(options.delivery)}`,
    ...(options.appliedDistillation ? [`- applied_distillation: ${clean(options.appliedDistillation)}`] : []),
    '',
    '### Verification Block',
    '',
    `- criteria: ${criteria}`,
    `- subject: ${clean(options.subject)}`,
    `- revision: ${clean(options.revision)}`,
    `- method: ${clean(options.method)}`,
    `- result: ${options.result}`,
    `- observed: ${clean(options.observed)}`,
    ...(options.checkedBy ? [`- checked_by: ${clean(options.checkedBy)}`] : []),
    ...(options.evidence ? [`- evidence: ${clean(options.evidence)}`] : []),
    '',
  ].join('\n')

  let nextPlan
  if (options.complete) {
    const link = `[\`${planTimestamp} / ${subject} / ${attempt}\`](stages/records.md#${anchor})`
    rowCells[column('status')] = ' completed '
    rowCells[column('acceptance_ref')] = ` ${link} `
    const updated = [...lines]
    updated[rowAt] = rowCells.join('|')
    nextPlan = updated.join('\n')
  }

  mkdirSync(dirname(recordsPath), { recursive: true })
  writeFileSync(recordsPath, `${records.endsWith('\n') ? records : `${records}\n`}\n${block}`)
  if (nextPlan !== undefined) writeFileSync(planPath, nextPlan)
  return { taskId: options.task, subject, attempt, anchor, planTimestamp, recordsPath, completed: Boolean(options.complete) }
}

function parseArgs(args) {
  const o = {}
  const valueFlags = {
    '--task': 'task', '--item': 'item', '--delivery': 'delivery', '--criteria': 'criteria', '--subject': 'subject',
    '--method': 'method', '--observed': 'observed', '--result': 'result', '--revision': 'revision',
    '--checked-by': 'checkedBy', '--evidence': 'evidence', '--applied-distillation': 'appliedDistillation',
  }
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') o.help = true
    else if (arg === '--json') o.json = true
    else if (arg === '--overall') o.overall = true
    else if (arg === '--complete') o.complete = true
    else if (arg in valueFlags) {
      const value = args[++i]
      if (value === undefined) return { error: `missing value for ${arg}` }
      o[valueFlags[arg]] = value
    } else if (arg.startsWith('-')) return { error: `unknown option: ${arg}` }
    else positionals.push(arg)
  }
  if (positionals.length > 1) return { error: `unexpected argument: ${positionals[1]}` }
  o.root = resolve(positionals[0] ?? '.')
  return o
}

export function main(args) {
  const parsed = parseArgs(args)
  if (parsed.error) {
    console.error(`ERROR: ${parsed.error}\n\n${USAGE}`)
    return 2
  }
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  try {
    const result = addStage(parsed.root, parsed)
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`Recorded ${result.subject} attempt ${result.attempt} as #${result.anchor}${result.completed ? ' and completed the item' : ''}: ${result.recordsPath}\n${checkSummary(parsed.root, result.taskId)}`)
    return 0
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
