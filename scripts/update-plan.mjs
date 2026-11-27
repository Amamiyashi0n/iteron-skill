#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatTimestamp } from './new-task.mjs'
import { checkRoot } from './task-records.mjs'
/** One line the caller can act on without running the checker separately. */
function checkSummary(root, taskId) {
  const issues = checkRoot(root, taskId).issues
  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  const list = (xs) => xs.slice(0, 6).map((issue) => `${issue.code} (${issue.message})`).join('; ')
  return `check: ${errors.length} error(s)${errors.length ? ` — ${list(errors)}` : ''}, ${warnings.length} warning(s)${warnings.length ? ` — ${list(warnings)}` : ''}`
}


const USAGE = [
  'Usage: node scripts/update-plan.mjs [options] [root]',
  '',
  'Updates the owner, resume point and item statuses of a task\'s plan.md (and its agent.md row),',
  'so routine progress does not need hand edits. Use add-stage --complete to complete an item and',
  'close-task to close the task.',
  '',
  'Options:',
  '  --task <task_id>        Task to update (required)',
  '  --claim <owner>         Claim the task: owner `<owner>` claimed `<now, UTC>`',
  '  --release               Release the task: owner `none`',
  '  --confirmed <text>      Resume Point: what is confirmed so far',
  '  --pending <text>        Resume Point: unconfirmed checks or blockers (use "none" to clear)',
  '  --next <text>           Resume Point: the next action',
  '  --item <T-nnn> --status <pending|in_progress|blocked>   Set one item\'s status (repeatable as pairs)',
  '  --task-status <pending|in_progress|blocked>              Set the task status in plan.md and agent.md',
  '  --json                  Print what changed as JSON',
  '  -h, --help              Show this help message',
  '',
  'The plan\'s `records` line is kept in step with the files that exist (stages/records.md, distillation/notes.md).',
].join('\n')

const ITEM_ID = /^T-\d{3,}$/
const ITEM_STATUSES = ['pending', 'in_progress', 'blocked']
const TASK_STATUSES = ['pending', 'in_progress', 'blocked']
const clean = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').trim()
const splitRow = (line) => line.split(/(?<!\\)\|/)
const toLf = (text) => text.replace(/\r\n/g, '\n')
const withEol = (text, crlf) => (crlf ? text.replace(/\n/g, '\r\n') : text)

function findTaskDir(root, taskId) {
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base, `${taskId}-plan`)
    if (existsSync(join(dir, 'plan.md'))) return dir
  }
  return undefined
}

function setField(text, key, value, { after } = {}) {
  const pattern = new RegExp(`^- ${key}: .*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, () => `- ${key}: ${value}`)
  if (after) {
    const anchor = new RegExp(`^- ${after}: .*$`, 'm')
    if (anchor.test(text)) return text.replace(anchor, (line) => `${line}\n- ${key}: ${value}`)
  }
  throw new Error(`plan.md has no "${key}" line`)
}

export function updatePlan(root, options, now = new Date()) {
  if (!options.task) throw new Error('missing required option: --task')
  if (options.claim && options.release) throw new Error('give only one of --claim and --release')
  const dir = findTaskDir(root, options.task)
  if (!dir) throw new Error(`no task directory found for ${options.task}`)
  const planPath = join(dir, 'plan.md')
  const raw = readFileSync(planPath, 'utf8')
  let plan = toLf(raw)
  const changed = []

  let replacedOwner
  if (options.claim) {
    const prev = /^- owner: (.*)$/m.exec(plan)?.[1]?.trim()
    if (prev && !/^`?none`?$/i.test(prev) && !prev.startsWith(`\`${clean(options.claim)}\``)) {
      replacedOwner = prev
    }
    plan = setField(plan, 'owner', `\`${clean(options.claim)}\` claimed \`${formatTimestamp(now)}\``)
    changed.push('owner')
  }
  if (options.release) {
    plan = setField(plan, 'owner', '`none`')
    changed.push('owner')
  }
  for (const [flag, key] of [['confirmed', 'confirmed'], ['pending', 'pending_checks'], ['next', 'next_action']]) {
    if (options[flag] === undefined) continue
    if (!clean(options[flag])) throw new Error(`--${flag} needs a value`)
    plan = setField(plan, key, clean(options[flag]))
    changed.push(key)
  }

  const items = options.items ?? []
  if (items.length > 0) {
    const lines = plan.split('\n')
    const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
    if (headerAt === -1) throw new Error('plan.md has no Current Plan table')
    const headers = splitRow(lines[headerAt]).map((cell) => cell.trim())
    for (const { item, status } of items) {
      if (!ITEM_ID.test(item ?? '')) throw new Error(`--item must look like T-001, got: ${item}`)
      if (!ITEM_STATUSES.includes(status)) throw new Error(`--status must be one of ${ITEM_STATUSES.join(', ')} (complete an item with add-stage --complete)`)
      const at = lines.findIndex((line, i) => i > headerAt + 1 && line.startsWith('|') && splitRow(line)[headers.indexOf('item_id')]?.trim() === item)
      if (at === -1) throw new Error(`${item} is not in the current plan`)
      const cells = splitRow(lines[at])
      if (cells[headers.indexOf('status')].trim() === 'completed') throw new Error(`${item} is completed; reopen it only after reviewing its evidence, by editing the plan`)
      cells[headers.indexOf('status')] = ` ${status} `
      lines[at] = cells.join('|')
      changed.push(`${item}.status`)
    }
    plan = lines.join('\n')
  }

  const indexPath = join(root, 'agent.md')
  let indexRaw
  let indexNext
  if (options.taskStatus !== undefined) {
    if (!TASK_STATUSES.includes(options.taskStatus)) throw new Error(`--task-status must be one of ${TASK_STATUSES.join(', ')} (close with close-task)`)
    plan = setField(plan, 'status', options.taskStatus)
    changed.push('status')
    if (existsSync(indexPath)) {
      indexRaw = readFileSync(indexPath, 'utf8')
      const lines = toLf(indexRaw).split('\n')
      const headerAt = lines.findIndex((line) => /^\|\s*task_id\s*\|/.test(line))
      const headers = headerAt === -1 ? [] : splitRow(lines[headerAt]).map((cell) => cell.trim())
      const at = lines.findIndex((line, i) => i > headerAt && line.startsWith('|') && splitRow(line)[headers.indexOf('task_id')]?.replace(/`/g, '').trim() === options.task)
      if (at !== -1) {
        const cells = splitRow(lines[at])
        cells[headers.indexOf('status')] = ` ${options.taskStatus} `
        lines[at] = cells.join('|')
        indexNext = withEol(lines.join('\n'), indexRaw.includes('\r\n'))
      }
    }
  }

  // Keep the records line pointing at the files that exist.
  const links = []
  if (existsSync(join(dir, 'stages', 'records.md'))) links.push('[Stage records](stages/records.md)')
  if (existsSync(join(dir, 'distillation', 'notes.md'))) links.push('[Distillation](distillation/notes.md)')
  if (links.length > 0) {
    const current = /^- records: (.*)$/m.exec(plan)?.[1]
    const wanted = links.join(' / ')
    if (current === undefined || links.some((link) => !current.includes(link.split('](')[1]))) {
      plan = setField(plan, 'records', wanted, { after: 'overall_acceptance_ref' })
      changed.push('records')
    }
  }

  if (changed.length === 0) throw new Error('nothing to change; pass at least one option such as --next or --claim')
  writeFileSync(planPath, withEol(plan, raw.includes('\r\n')))
  if (indexNext !== undefined) writeFileSync(indexPath, indexNext)
  return { taskId: options.task, changed, ...(replacedOwner ? { replacedOwner } : {}) }
}

function parseArgs(args) {
  const o = { items: [] }
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = () => {
      const next = args[++i]
      if (next === undefined) throw new Error(`missing value for ${arg}`)
      return next
    }
    try {
      if (arg === '-h' || arg === '--help') o.help = true
      else if (arg === '--json') o.json = true
      else if (arg === '--release') o.release = true
      else if (arg === '--task') o.task = value()
      else if (arg === '--claim') o.claim = value()
      else if (arg === '--confirmed') o.confirmed = value()
      else if (arg === '--pending') o.pending = value()
      else if (arg === '--next') o.next = value()
      else if (arg === '--task-status') o.taskStatus = value()
      else if (arg === '--item') o.items.push({ item: value() })
      else if (arg === '--status') {
        const last = o.items[o.items.length - 1]
        if (!last || last.status) return { error: '--status must follow its --item' }
        last.status = value()
      } else if (arg.startsWith('-')) return { error: `unknown option: ${arg}` }
      else positionals.push(arg)
    } catch (error) {
      return { error: error.message }
    }
  }
  if (o.items.some((entry) => !entry.status)) return { error: 'every --item needs a --status' }
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
    const result = updatePlan(parsed.root, parsed)
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else {
      const takeover = result.replacedOwner ? `\nnote: replaced previous owner ${result.replacedOwner}; keep the takeover note (naming that previous owner) in a durable record rather than overwriting it in confirmed` : ''
      console.log(`Updated ${result.taskId}: ${result.changed.join(', ')}${takeover}\n${checkSummary(parsed.root, result.taskId)}`)
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
