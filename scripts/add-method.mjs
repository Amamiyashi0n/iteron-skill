#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { updatePlan } from './update-plan.mjs'

const USAGE = [
  'Usage: node scripts/add-method.mjs [options] [root]',
  '',
  'Appends a distilled method to a task\'s distillation/notes.md, citing the item\'s passing attempt',
  'from its acceptance_ref, and links the notes from the plan\'s records line.',
  '',
  'Options:',
  '  --task <task_id>          Task the method was verified in (required)',
  '  --item <T-nnn>            Completed plan item whose passing attempt is the source (required)',
  '  --title <text>            The situation and problem the method solves (required)',
  '  --applies-when <text>     When the method applies (required)',
  '  --route <text>            Actionable steps (required)',
  '  --check <text>            The condition that must pass after using it (required)',
  '  --search-terms <text>     Comma-separated project and requirement terms (required)',
  '  --rationale <text>        Tradeoff or failed attempt that shaped the method',
  '  --json                    Print the recorded method as JSON',
  '  -h, --help                Show this help message',
  '',
  'To use a method in later work, pass its link to add-stage --applied-distillation.',
].join('\n')

const ITEM_ID = /^T-\d{3,}$/
const clean = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').trim()
const splitRow = (line) => line.split(/(?<!\\)\|/)
const NOTES_HEADER = '# Distillation\n\n[Current plan](../plan.md)\n'

function findTaskDir(root, taskId) {
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base, `${taskId}-plan`)
    if (existsSync(join(dir, 'plan.md'))) return dir
  }
  return undefined
}

export function addMethod(root, options) {
  for (const key of ['task', 'item', 'title', 'appliesWhen', 'route', 'check', 'searchTerms']) {
    if (!options[key] || !clean(options[key])) throw new Error(`missing required option: --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)
  }
  if (!ITEM_ID.test(options.item)) throw new Error(`--item must look like T-001, got: ${options.item}`)
  const dir = findTaskDir(root, options.task)
  if (!dir) throw new Error(`no task directory found for ${options.task}`)
  const plan = readFileSync(join(dir, 'plan.md'), 'utf8').replace(/\r\n/g, '\n')
  const planTimestamp = /^- plan_timestamp: `?([^`\n]+)`?\s*$/m.exec(plan)?.[1].trim()
  const lines = plan.split('\n')
  const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
  const headers = headerAt === -1 ? [] : splitRow(lines[headerAt]).map((cell) => cell.trim())
  const row = lines.find((line, i) => i > headerAt + 1 && line.startsWith('|') && splitRow(line)[headers.indexOf('item_id')]?.trim() === options.item)
  if (!row) throw new Error(`${options.item} is not in the current plan`)
  const cells = splitRow(row).map((cell) => cell.trim())
  if (cells[headers.indexOf('status')] !== 'completed') throw new Error(`${options.item} is not completed; distil a method only from a verified item`)
  const ref = /#(stage-[^)\s]+)/.exec(cells[headers.indexOf('acceptance_ref')] ?? '')?.[1]
  const attempt = ref && new RegExp(`^stage-${planTimestamp}-${options.item.toLowerCase()}-(\\d+)$`).exec(ref)?.[1]
  if (!attempt) throw new Error(`${options.item}'s acceptance_ref does not cite an attempt in the current plan version`)

  const notesPath = join(dir, 'distillation', 'notes.md')
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8').replace(/\r\n/g, '\n') : NOTES_HEADER
  const heading = new RegExp(`^## ${planTimestamp} / ${options.item} / M-(\\d+)\\s*$`, 'gm')
  const n = Math.max(0, ...[...notes.matchAll(heading)].map((match) => Number(match[1]))) + 1
  const anchor = `distillation-${planTimestamp}-${options.item.toLowerCase()}-${n}`
  const block = [
    `<a name="${anchor}"></a>`,
    '',
    `## ${planTimestamp} / ${options.item} / M-${n}`,
    '',
    `- title: ${clean(options.title)}`,
    '- status: active',
    `- applies_when: ${clean(options.appliesWhen)}`,
    `- route: ${clean(options.route)}`,
    ...(options.rationale ? [`- rationale: ${clean(options.rationale)}`] : []),
    `- check: ${clean(options.check)}`,
    `- source: [${planTimestamp} / ${options.item} / ${attempt}](../stages/records.md#${ref})`,
    `- search_terms: ${clean(options.searchTerms)}`,
    '',
  ].join('\n')
  mkdirSync(dirname(notesPath), { recursive: true })
  writeFileSync(notesPath, `${notes.endsWith('\n') ? notes : `${notes}\n`}\n${block}`)
  try {
    updatePlan(root, { task: options.task })
  } catch (error) {
    if (!/nothing to change/.test(error.message)) throw error
  }
  const link = `[${planTimestamp} / ${options.item} / M-${n}](../../${options.task}-plan/distillation/notes.md#${anchor})`
  return { taskId: options.task, anchor, notesPath, link }
}

function parseArgs(args) {
  const o = {}
  const flags = {
    '--task': 'task', '--item': 'item', '--title': 'title', '--applies-when': 'appliesWhen', '--route': 'route',
    '--check': 'check', '--search-terms': 'searchTerms', '--rationale': 'rationale',
  }
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') o.help = true
    else if (arg === '--json') o.json = true
    else if (arg in flags) {
      const value = args[++i]
      if (value === undefined) return { error: `missing value for ${arg}` }
      o[flags[arg]] = value
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
    const result = addMethod(parsed.root, parsed)
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`Recorded ${result.anchor}. Cite it from another task's stage with add-stage --applied-distillation ${result.link}`)
    return 0
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
