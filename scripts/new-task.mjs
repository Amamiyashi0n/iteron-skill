#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const INDEX_HEADER = [
  '# Task Index',
  '',
  'Register each task here with a link to its actual plan. New tasks use `.agent/<Task ID>-plan/plan.md`. Existing tasks can also use `agent/<Task ID>-plan/plan.md`. When replanning, update the plan and any affected index fields.',
  '',
  '| task_id | title | search_terms | status | plan_link |',
  '| --- | --- | --- | --- | --- |',
  '',
].join('\n')

const USAGE = [
  'Usage: node scripts/new-task.mjs [options] [root]',
  '',
  'Creates .agent/<task_id>-plan/plan.md and registers the task in agent.md.',
  '',
  'Options:',
  '  --title <text>          Task title (required)',
  '  --goal <text>           Goal (required)',
  '  --criterion <text>      Overall acceptance criterion; repeatable (at least one)',
  '  --item <req|expected|criteria>',
  '                          Plan item; repeatable (at least one), fields separated by "|"',
  '  --requirements <text>   Requirements (default: see goal)',
  '  --constraints <text>    Constraints (default: none)',
  '  --search-terms <text>   Search terms (default: title)',
  '  --owner <name>          Owner claiming the task (default: agent)',
  '  --json                  Print the created task as JSON',
  '  -h, --help              Show this help message',
].join('\n')

const pad = (n) => String(n).padStart(2, '0')

export function formatTimestamp(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
}

const clean = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').trim()
const cell = (text) => clean(text).replace(/\|/g, '\\|')

function pickTaskId(root, stamp) {
  const taken = (id) => existsSync(join(root, '.agent', `${id}-plan`)) || existsSync(join(root, 'agent', `${id}-plan`))
  if (!taken(stamp)) return stamp
  for (let n = 2; ; n++) if (!taken(`${stamp}-${n}`)) return `${stamp}-${n}`
}

export function createTask(root, options, now = new Date()) {
  const need = (key) => {
    if (!options[key] || !clean(options[key])) throw new Error(`missing required option: ${key}`)
  }
  need('title')
  need('goal')
  const criteria = options.criteria ?? []
  const items = options.items ?? []
  if (criteria.length === 0) throw new Error('at least one --criterion is required')
  if (items.length === 0) throw new Error('at least one --item is required')

  const rows = items.map((raw, i) => {
    const parts = raw.split('|').map(clean)
    if (parts.length !== 3 || parts.some((p) => !p)) {
      throw new Error(`--item needs "requirement|expected|criteria", got: ${raw}`)
    }
    const id = `T-${String(i + 1).padStart(3, '0')}`
    return `| ${id} | ${cell(parts[0])} | ${cell(parts[1])} | - | ${cell(parts[2])} | pending | - |`
  })

  const stamp = formatTimestamp(now)
  const taskId = pickTaskId(root, stamp)
  const dir = join(root, '.agent', `${taskId}-plan`)
  const title = clean(options.title)
  const searchTerms = clean(options.searchTerms ?? title)
  const owner = clean(options.owner ?? 'agent')

  const plan = [
    `# ${title}`,
    '',
    `- task_id: \`${taskId}\``,
    `- plan_timestamp: \`${stamp}\``,
    '- status: in_progress',
    `- owner: \`${owner}\` claimed \`${stamp}\``,
    `- next_item_number: \`${items.length + 1}\``,
    `- search_terms: ${searchTerms}`,
    `- goal: ${clean(options.goal)}`,
    `- requirements: ${clean(options.requirements ?? options.goal)}`,
    `- constraints: ${clean(options.constraints ?? 'none')}`,
    '- overall_acceptance:',
    ...criteria.map((c, i) => `  - O-${i + 1}: ${clean(c)}`),
    '- overall_acceptance_ref: -',
    '',
    '## Resume Point',
    '',
    '- confirmed: none',
    '- pending_checks: none',
    '- next_action: start T-001',
    '',
    '## Current Plan',
    '',
    '| item_id | requirement | expected_result | depends_on | acceptance_criteria | status | acceptance_ref |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')

  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plan.md'), plan)

  const indexPath = join(root, 'agent.md')
  let index = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : INDEX_HEADER
  if (!index.endsWith('\n')) index += '\n'
  index += `| \`${taskId}\` | ${cell(title)} | ${cell(searchTerms)} | in_progress | [Open plan](.agent/${taskId}-plan/plan.md) |\n`
  writeFileSync(indexPath, index)

  return { taskId, planTimestamp: stamp, planPath: join(dir, 'plan.md'), indexPath, items: rows.length }
}

function parseArgs(args) {
  const o = { criteria: [], items: [] }
  const flags = {
    '--title': 'title', '--goal': 'goal', '--requirements': 'requirements', '--constraints': 'constraints',
    '--search-terms': 'searchTerms', '--owner': 'owner',
  }
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') o.help = true
    else if (arg === '--json') o.json = true
    else if (arg === '--criterion' || arg === '--item' || arg in flags) {
      const value = args[++i]
      if (value === undefined) return { error: `missing value for ${arg}` }
      if (arg === '--criterion') o.criteria.push(value)
      else if (arg === '--item') o.items.push(value)
      else o[flags[arg]] = value
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
    const result = createTask(parsed.root, parsed)
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`Created task ${result.taskId} with ${result.items} item(s): ${result.planPath}`)
    return 0
  } catch (error) {
    console.error(`ERROR: ${error.message}\n\n${USAGE}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
