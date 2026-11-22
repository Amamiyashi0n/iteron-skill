#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from './task-records.mjs'

const USAGE = [
  'Usage: node scripts/close-task.mjs [options] [root]',
  '',
  'Writes the closing fields of a task whose items are all completed and whose overall attempt passed,',
  'then runs the single-task check. If the check reports errors, nothing is changed.',
  '',
  'Options:',
  '  --task <task_id>          Task to close (required)',
  '  --overall-attempt <n>     Overall attempt to cite (default: the latest one for the current plan version)',
  '  --json                    Print the result as JSON',
  '  -h, --help                Show this help message',
].join('\n')

const splitRow = (line) => line.split(/(?<!\\)\|/)
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const emptyField = (value) => /^(?:-|none|n\/a|无)?\.?$/i.test(String(value ?? '').replace(/`/g, '').trim())
const toLf = (text) => text.replace(/\r\n/g, '\n')
const withEol = (text, crlf) => (crlf ? text.replace(/\n/g, '\r\n') : text)

function findTaskDir(root, taskId) {
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base, `${taskId}-plan`)
    if (existsSync(join(dir, 'plan.md'))) return dir
  }
  return undefined
}

const readField = (text, key) => new RegExp(`^- ${key}: (.*)$`, 'm').exec(text)?.[1]

function setField(text, key, value) {
  const pattern = new RegExp(`^- ${key}: .*$`, 'm')
  if (!pattern.test(text)) throw new Error(`plan.md has no "${key}" line`)
  return text.replace(pattern, () => `- ${key}: ${value}`)
}

export function closeTask(root, options) {
  if (!options.task) throw new Error('missing required option: --task')
  const dir = findTaskDir(root, options.task)
  if (!dir) throw new Error(`no task directory found for ${options.task}`)
  const indexPath = join(root, 'agent.md')
  if (!existsSync(indexPath)) throw new Error('agent.md is missing')
  const planPath = join(dir, 'plan.md')
  const planRaw = readFileSync(planPath, 'utf8')
  const indexRaw = readFileSync(indexPath, 'utf8')
  const plan = toLf(planRaw)

  const status = (readField(plan, 'status') ?? '').replace(/`/g, '').trim()
  if (status === 'completed') throw new Error('the task is already completed')
  if (status === 'cancelled') throw new Error('the task is cancelled')
  const planTimestamp = (readField(plan, 'plan_timestamp') ?? '').replace(/`/g, '').trim()
  if (!planTimestamp) throw new Error('plan.md has no plan_timestamp')

  const lines = plan.split('\n')
  const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
  if (headerAt === -1) throw new Error('plan.md has no Current Plan table')
  const headers = splitRow(lines[headerAt]).map((cell) => cell.trim())
  const open = []
  for (const line of lines.slice(headerAt + 2)) {
    if (!line.startsWith('|')) continue
    const cells = splitRow(line).map((cell) => cell.trim())
    if (cells[headers.indexOf('status')] !== 'completed') open.push(cells[headers.indexOf('item_id')])
  }
  if (open.length > 0) throw new Error(`items still open: ${open.join(', ')}`)
  if (!emptyField(readField(plan, 'pending_checks'))) throw new Error('pending_checks is not empty; resolve or clear it first')
  if (readField(plan, 'delegated') !== undefined && !emptyField(readField(plan, 'delegated'))) {
    throw new Error('delegated is not empty; record or discard the delegated work first')
  }

  const recordsPath = join(dir, 'stages', 'records.md')
  const records = existsSync(recordsPath) ? toLf(readFileSync(recordsPath, 'utf8')) : ''
  const attempts = [...records.matchAll(new RegExp(`^## ${escapeRegExp(planTimestamp)} / overall / (\\d+)\\s*$`, 'gm'))].map((match) => Number(match[1]))
  if (attempts.length === 0) throw new Error(`no overall attempt is recorded for plan ${planTimestamp}; record one with add-stage --overall first`)
  const attempt = options.overallAttempt === undefined ? Math.max(...attempts) : Number(options.overallAttempt)
  if (!attempts.includes(attempt)) throw new Error(`overall attempt ${options.overallAttempt} does not exist for plan ${planTimestamp}; found ${attempts.join(', ')}`)
  const anchor = `stage-${planTimestamp}-overall-${attempt}`

  let nextPlan = plan
  nextPlan = setField(nextPlan, 'status', 'completed')
  nextPlan = setField(nextPlan, 'owner', '`none`')
  nextPlan = setField(nextPlan, 'next_action', 'completed')
  nextPlan = setField(nextPlan, 'overall_acceptance_ref', `[overall](stages/records.md#${anchor})`)

  const indexCrlf = indexRaw.includes('\r\n')
  const indexLines = toLf(indexRaw).split('\n')
  const indexHeaderAt = indexLines.findIndex((line) => /^\|\s*task_id\s*\|/.test(line))
  const indexHeaders = indexHeaderAt === -1 ? [] : splitRow(indexLines[indexHeaderAt]).map((cell) => cell.trim())
  const rowAt = indexLines.findIndex((line, i) => i > indexHeaderAt && line.startsWith('|') &&
    splitRow(line)[indexHeaders.indexOf('task_id')]?.replace(/`/g, '').trim() === options.task)
  if (rowAt === -1) throw new Error(`${options.task} is not listed in agent.md`)
  const cells = splitRow(indexLines[rowAt])
  cells[indexHeaders.indexOf('status')] = ' completed '
  indexLines[rowAt] = cells.join('|')

  writeFileSync(planPath, withEol(nextPlan, planRaw.includes('\r\n')))
  writeFileSync(indexPath, withEol(indexLines.join('\n'), indexCrlf))
  const errors = checkRoot(root, options.task).issues.filter((issue) => issue.level === 'error')
  if (errors.length > 0) {
    writeFileSync(planPath, planRaw)
    writeFileSync(indexPath, indexRaw)
    throw new Error(`closing would leave record errors, so nothing was changed: ${errors.map((issue) => `${issue.code} (${issue.where})`).join('; ')}`)
  }
  return { taskId: options.task, planTimestamp, overallAttempt: attempt, anchor }
}

function parseArgs(args) {
  const o = {}
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') o.help = true
    else if (arg === '--json') o.json = true
    else if (arg === '--task' || arg === '--overall-attempt') {
      const value = args[++i]
      if (value === undefined) return { error: `missing value for ${arg}` }
      if (arg === '--task') o.task = value
      else if (!/^\d+$/.test(value)) return { error: `--overall-attempt must be a number, got: ${value}` }
      else o.overallAttempt = Number(value)
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
    const result = closeTask(parsed.root, parsed)
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`Closed ${result.taskId} citing overall attempt ${result.overallAttempt}.`)
    return 0
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
