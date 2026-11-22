#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from '../scripts/check-records.mjs'
import { buildInProgress } from './fixtures.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const BASELINE = '.iteron-eval.json'
const splitRow = (line) => line.split(/(?<!\\)\|/).map((cell) => cell.trim())

export const loadScenarios = () => JSON.parse(readFileSync(here('./scenarios.json'), 'utf8'))
export const loadTriggerCases = () => JSON.parse(readFileSync(here('./trigger-cases.json'), 'utf8'))

function taskDirs(root) {
  const found = []
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const id = /^(.+)-plan$/.exec(entry.name)?.[1]
      if (id && entry.isDirectory()) found.push({ id, dir: join(dir, entry.name) })
    }
  }
  return found
}

function readTask(root, id) {
  const task = taskDirs(root).find((candidate) => candidate.id === id)
  if (!task || !existsSync(join(task.dir, 'plan.md'))) return undefined
  const plan = readFileSync(join(task.dir, 'plan.md'), 'utf8').replace(/\r\n/g, '\n')
  const field = (key) => new RegExp(`^- ${key}: \`?([^\`\\n]+)\`?\\s*$`, 'm').exec(plan)?.[1].trim()
  const lines = plan.split('\n')
  const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
  const headers = headerAt === -1 ? [] : splitRow(lines[headerAt])
  const items = new Map()
  for (const line of lines.slice(headerAt + 2)) {
    if (!line.startsWith('|')) continue
    const cells = splitRow(line)
    const at = (name) => cells[headers.indexOf(name)] ?? ''
    items.set(at('item_id'), { status: at('status'), ref: at('acceptance_ref') })
  }
  const recordsPath = join(task.dir, 'stages', 'records.md')
  const records = existsSync(recordsPath) ? readFileSync(recordsPath, 'utf8').replace(/\r\n/g, '\n') : ''
  const attempts = {}
  for (const match of records.matchAll(/^## \S+ \/ (T-\d+) \/ \d+\s*$/gm)) attempts[match[1]] = (attempts[match[1]] ?? 0) + 1
  const replans = [...records.matchAll(/^## (\S+) \/ replan\s*$/gm)].map((match) => match[1])
  return {
    planTimestamp: field('plan_timestamp'), status: field('status'), nextItemNumber: Number(field('next_item_number')),
    items, attempts, replans,
  }
}

/** What a scenario needs to remember about the starting state. */
export function snapshot(root, taskId) {
  const task = readTask(root, taskId)
  return {
    taskId, planTimestamp: task.planTimestamp, nextItemNumber: task.nextItemNumber, attempts: task.attempts,
    refs: Object.fromEntries([...task.items].map(([id, item]) => [id, item.ref])),
  }
}

export function setup(scenarioId, root) {
  const scenario = loadScenarios().find((candidate) => candidate.id === scenarioId)
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`)
  mkdirSync(root, { recursive: true })
  let baseline = {}
  if (scenario.fixture === 'in-progress') {
    const { taskId } = buildInProgress(root)
    baseline = snapshot(root, taskId)
    writeFileSync(join(root, BASELINE), `${JSON.stringify(baseline, null, 2)}\n`)
  } else if (scenario.fixture !== null) {
    throw new Error(`unknown fixture: ${scenario.fixture}`)
  }
  return { scenario, baseline }
}

export function grade(scenario, root, baseline = {}) {
  const checks = []
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail })
  const expect = scenario.expect
  const tasks = taskDirs(root)
  const errors = checkRoot(root).issues.filter((issue) => issue.level === 'error')
  add('the checker reports no errors', errors.length === 0, errors.map((issue) => `${issue.code} @ ${issue.where}`).join('; '))
  if (expect.tasks !== undefined) add(`there ${expect.tasks === 1 ? 'is exactly 1 task' : `are ${expect.tasks} tasks`}`, tasks.length === expect.tasks, `found ${tasks.length}`)

  const id = baseline.taskId ?? (tasks.length === 1 ? tasks[0].id : undefined)
  const task = id ? readTask(root, id) : undefined
  if (!task) {
    add('the task can be found', false, id ? `no plan for ${id}` : 'no single task directory')
    return { pass: false, checks }
  }
  const item = (itemId) => task.items.get(itemId)
  if (expect.minItems !== undefined) add(`the plan has at least ${expect.minItems} items`, task.items.size >= expect.minItems, `has ${task.items.size}`)
  if (expect.allItemsCompleted) add('every item is completed', [...task.items.values()].every((entry) => entry.status === 'completed'))
  if (expect.status) add(`the task status is ${expect.status}`, task.status === expect.status, `is ${task.status}`)
  for (const itemId of expect.itemsCompleted ?? []) add(`${itemId} is completed`, item(itemId)?.status === 'completed', `is ${item(itemId)?.status ?? 'missing'}`)
  for (const itemId of expect.unchangedRefs ?? []) add(`${itemId} keeps its acceptance_ref`, baseline.refs?.[itemId] !== undefined && item(itemId)?.ref === baseline.refs[itemId])
  for (const itemId of expect.attemptsUnchanged ?? []) add(`${itemId} was not re-verified`, baseline.attempts?.[itemId] !== undefined && task.attempts[itemId] === baseline.attempts[itemId], `attempts ${task.attempts[itemId] ?? 0}, was ${baseline.attempts?.[itemId]}`)
  if (expect.planTimestampChanged) add('the plan version moved forward', Boolean(baseline.planTimestamp) && task.planTimestamp > baseline.planTimestamp, `is ${task.planTimestamp}`)
  if (expect.replanEntry) add('a replan entry matches the plan version', task.replans.includes(task.planTimestamp), `entries: ${task.replans.join(', ') || 'none'}`)
  if (expect.nextItemNumberNotLower) add('next_item_number did not go down', task.nextItemNumber >= (baseline.nextItemNumber ?? 0), `is ${task.nextItemNumber}`)
  return { pass: checks.every((check) => check.ok), checks }
}

function main(args) {
  const [command, scenarioId, dir] = args
  if (command === 'list') {
    for (const scenario of loadScenarios()) console.log(`${scenario.id}\t${scenario.title}`)
    const cases = loadTriggerCases()
    console.log(`${cases.length} trigger cases (${cases.filter((c) => c.trigger).length} should trigger)`)
    return 0
  }
  if (command === 'setup' && scenarioId && dir) {
    const { scenario } = setup(scenarioId, resolve(dir))
    console.log(`Scenario ${scenario.id} is ready in ${resolve(dir)}.\nGive the agent this prompt in that directory:\n\n${scenario.prompt}\n`)
    return 0
  }
  if (command === 'grade' && scenarioId && dir) {
    const root = resolve(dir)
    const scenario = loadScenarios().find((candidate) => candidate.id === scenarioId)
    if (!scenario) {
      console.error(`unknown scenario: ${scenarioId}`)
      return 2
    }
    const baselinePath = join(root, BASELINE)
    const result = grade(scenario, root, existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {})
    for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${check.ok || !check.detail ? '' : ` (${check.detail})`}`)
    console.log(result.pass ? 'RESULT: pass' : 'RESULT: fail')
    return result.pass ? 0 : 1
  }
  console.error('Usage: node evals/run.mjs list | setup <scenario> <dir> | grade <scenario> <dir>')
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
