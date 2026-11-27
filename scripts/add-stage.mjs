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
  'For --overall, cover every O-<n> in one overall attempt: repeat --criteria when one check',
  'covers several criteria, repeat --reuse for reused item checks, or pass --attempt <n> to',
  'append another check to an existing overall attempt.',
  '',
  'Options:',
  '  --task <task_id>        Task to record against (required)',
  '  --item <T-nnn>          Plan item that was verified (or use --overall)',
  '  --overall               Record an overall attempt; every --criteria must start with O-<n>',
  '  --attempt <n>           With --overall: append blocks or --reuse lines to existing overall attempt <n>',
  '  --delivery <text>       What was delivered or attempted (required unless --attempt is given)',
  '  --criteria <text>       Criteria checked (default for an item: the plan\'s acceptance_criteria; repeatable with --overall)',
  '  --reuse <text>          With --overall: reused item citation, e.g. "O-1: [T-001 / 1](#stage-...) — inputs unchanged" (repeatable)',
  '  --subject <text>        What was tested (required when recording a Verification Block)',
  '  --method <text>         How it was checked (required when recording a Verification Block)',
  '  --observed <text>       What was seen (required when recording a Verification Block)',
  '  --result <pass|fail|unverified>   Outcome (required when recording a Verification Block)',
  '  --revision <text>       Exact state checked, such as a commit or "none" (required when recording a Verification Block)',
  '  --checked-by <text>     Who or what ran the check',
  '  --evidence <text>       Link to a log, report or artifact',
  '  --applied-distillation <link>   Distilled method used in this attempt, as a markdown link to its anchor',
  '                          (add-method prints it; from another task: ../../<task_id>-plan/distillation/notes.md#<anchor>)',
  '  --complete              With --result pass on an item: mark the item completed and set acceptance_ref',
  '  --json                  Print the recorded attempt as JSON',
  '  -h, --help              Show this help message',
].join('\n')

const clean = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').trim()
const toList = (value) => (value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean))
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

function verificationBlock(criteria, options) {
  return [
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
  ].join('\n')
}

function appendToSection(records, headingLine, addition) {
  const lines = records.split('\n')
  const start = lines.findIndex((line) => line.trim() === headingLine)
  if (start === -1) return undefined
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ') || /^<a name="[^"]+"><\/a>\s*$/.test(lines[i])) {
      end = i
      break
    }
  }
  while (end > start + 1 && lines[end - 1].trim() === '') end--
  const before = lines.slice(0, end).join('\n')
  const after = lines.slice(end).join('\n')
  return after ? `${before}\n\n${addition}\n\n${after}` : `${before}\n\n${addition}\n`
}

export function addStage(root, options) {
  const need = (key, flag = key) => {
    if (!options[key] || !clean(options[key])) throw new Error(`missing required option: --${flag}`)
  }
  need('task')
  if (Boolean(options.overall) === Boolean(options.item)) throw new Error('give exactly one of --item and --overall')
  if (options.attempt !== undefined && !options.overall) throw new Error('--attempt can only be used with --overall')
  if (options.reuse !== undefined && toList(options.reuse).length > 0 && !options.overall) {
    throw new Error('--reuse can only be used with --overall')
  }

  const criteriaList = toList(options.criteria)
  const reuseList = toList(options.reuse).map((line) => line.replace(/^-\s+/, ''))

  if (options.attempt === undefined) need('delivery')
  if (options.item && criteriaList.length > 1) throw new Error('only one --criteria is allowed for an item')

  const needsBlock = Boolean(options.item) || criteriaList.length > 0
  if (needsBlock) {
    need('subject')
    need('method')
    need('observed')
    need('revision')
    need('result')
    if (!RESULTS.includes(options.result)) throw new Error(`--result must be ${RESULTS.join(', ')}`)
  }
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
    if (criteriaList.length === 0) {
      const fromPlan = clean(rowCells[column('acceptance_criteria')] ?? '')
      if (fromPlan) criteriaList.push(fromPlan)
    }
    if (criteriaList.length === 0) throw new Error('missing required option: --criteria')
  } else {
    if (criteriaList.length === 0 && reuseList.length === 0) {
      throw new Error('missing required option: --criteria or --reuse (an overall attempt needs O-<n> criteria or reuse lines)')
    }
    for (const c of criteriaList) {
      if (!/^O-\d+\b/.test(c)) throw new Error('an overall --criteria must start with O-<n>, such as "O-1 Row count matches"')
    }
    for (const r of reuseList) {
      if (!/^O-\d+:\s*\[[^\]]+\]\(#stage-[^)\s]+\)/.test(r)) {
        throw new Error(`--reuse must look like "O-1: [T-001 / 1](#stage-...) — comparison", got: ${r}`)
      }
    }
  }

  const subject = options.item ?? 'overall'
  const recordsPath = join(dir, 'stages', 'records.md')
  const records = existsSync(recordsPath) ? readFileSync(recordsPath, 'utf8').replace(/\r\n/g, '\n') : RECORDS_HEADER

  const bodyParts = [
    ...criteriaList.map((c) => verificationBlock(c, options)),
    ...(reuseList.length > 0 ? [reuseList.map((line) => `- ${line}`).join('\n')] : []),
  ]
  const body = bodyParts.join('\n\n')

  if (options.attempt !== undefined) {
    const attempt = Number(options.attempt)
    if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`--attempt must be a positive integer, got: ${options.attempt}`)
    const headingLine = `## ${planTimestamp} / overall / ${attempt}`
    const updated = appendToSection(records, headingLine, body)
    if (updated === undefined) {
      throw new Error(`overall attempt ${attempt} does not exist for plan ${planTimestamp}`)
    }
    writeFileSync(recordsPath, updated)
    const anchor = `stage-${planTimestamp}-overall-${attempt}`
    return { taskId: options.task, subject, attempt, anchor, planTimestamp, recordsPath, completed: false, appended: true }
  }

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
    body,
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
  const o = { criteria: [], reuse: [] }
  const valueFlags = {
    '--task': 'task', '--item': 'item', '--delivery': 'delivery', '--subject': 'subject',
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
    else if (arg === '--criteria' || arg === '--reuse' || arg === '--attempt' || arg in valueFlags) {
      const value = args[++i]
      if (value === undefined) return { error: `missing value for ${arg}` }
      if (arg === '--criteria') o.criteria.push(value)
      else if (arg === '--reuse') o.reuse.push(value)
      else if (arg === '--attempt') {
        if (!/^\d+$/.test(value)) return { error: `--attempt must be a number, got: ${value}` }
        o.attempt = Number(value)
      } else o[valueFlags[arg]] = value
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
    else {
      const verb = result.appended ? `Appended to ${result.subject} attempt ${result.attempt}` : `Recorded ${result.subject} attempt ${result.attempt}`
      console.log(`${verb} as #${result.anchor}${result.completed ? ' and completed the item' : ''}: ${result.recordsPath}\n${checkSummary(parsed.root, result.taskId)}`)
    }
    return 0
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
