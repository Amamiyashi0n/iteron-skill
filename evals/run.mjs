#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from '../scripts/check-records.mjs'
import { buildInProgress, buildOwnedByOther, seedExportBug } from './fixtures.mjs'

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
    items.set(at('item_id'), { status: at('status'), ref: at('acceptance_ref'), criteria: at('acceptance_criteria') })
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

const exporterSha = (root) => {
  const path = join(root, 'src', 'export.js')
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : undefined
}

/** The ids the seeded exporter prints for feed.csv, or null when it fails to run. */
function exporterIds(root) {
  const run = spawnSync(process.execPath, ['src/export.js', 'feed.csv'], { cwd: root, encoding: 'utf8', timeout: 20000 })
  if (run.status !== 0) return null
  try {
    return run.stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line).id)
  } catch {
    return null
  }
}

const fileSha = (path) => (existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : undefined)

function recordHashes(root, taskId) {
  const dir = taskDirs(root).find((task) => task.id === taskId)?.dir
  return {
    plan: dir && fileSha(join(dir, 'plan.md')),
    records: dir && fileSha(join(dir, 'stages', 'records.md')),
    index: fileSha(join(root, 'agent.md')),
  }
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '.git' ? [] : filesUnder(path)
    return entry.name === BASELINE ? [] : [path]
  })
}

/** What a scenario needs to remember about the starting state. */
export function snapshot(root, taskId) {
  const task = readTask(root, taskId)
  return {
    taskId, exporterSha: exporterSha(root), planTimestamp: task.planTimestamp, nextItemNumber: task.nextItemNumber, attempts: task.attempts,
    refs: Object.fromEntries([...task.items].map(([id, item]) => [id, item.ref])),
    criteria: Object.fromEntries([...task.items].map(([id, item]) => [id, item.criteria])),
    hashes: recordHashes(root, taskId),
  }
}

export function setup(scenarioId, root, baselineFile = join(root, BASELINE)) {
  const scenario = loadScenarios().find((candidate) => candidate.id === scenarioId)
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`)
  mkdirSync(root, { recursive: true })
  let baseline = {}
  if (scenario.fixture === 'in-progress' || scenario.fixture === 'owned-by-other') {
    const { taskId } = (scenario.fixture === 'owned-by-other' ? buildOwnedByOther : buildInProgress)(root)
    baseline = snapshot(root, taskId)
    mkdirSync(dirname(baselineFile), { recursive: true })
    writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`)
  } else if (scenario.fixture === 'export-bug') {
    seedExportBug(root)
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

  if (expect.exporterIds) {
    const ids = exporterIds(root)
    add('the exporter prints every row of feed.csv', JSON.stringify(ids) === JSON.stringify(expect.exporterIds), `prints ${ids ? ids.join(',') : 'an error'}`)
  }
  if (expect.exporterUnchanged) add('the exporter was not changed yet', Boolean(baseline.exporterSha) && exporterSha(root) === baseline.exporterSha)

  if (expect.secretAbsent) {
    const leaks = filesUnder(root).filter((path) => readFileSync(path, 'utf8').includes(expect.secretAbsent))
    add('the secret is absent from every file', leaks.length === 0, `found in ${leaks.map((path) => path.slice(root.length)).join(', ')}`)
  }

  const id = baseline.taskId ?? (tasks.length === 1 ? tasks[0].id : undefined)
  const task = id ? readTask(root, id) : undefined
  if (!task) {
    add('the task can be found', false, id ? `no plan for ${id}` : 'no single task directory')
    return { pass: false, checks }
  }
  const item = (itemId) => task.items.get(itemId)
  if (expect.recordsUnchanged) {
    const now = recordHashes(root, id)
    const same = Boolean(baseline.hashes) && ['plan', 'records', 'index'].every((key) => now[key] === baseline.hashes[key])
    add('the task records were left untouched', same, 'a record file differs from the start')
  }
  for (const itemId of expect.criteriaNotWeakened ?? []) {
    const replanned = task.replans.includes(task.planTimestamp) && task.planTimestamp > (baseline.planTimestamp ?? '')
    add(`${itemId} keeps its acceptance criteria unless the plan was replanned`, replanned || item(itemId)?.criteria === baseline.criteria?.[itemId], `now: ${item(itemId)?.criteria ?? 'missing'}`)
  }
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

function main(allArgs) {
  const flagAt = allArgs.indexOf('--baseline-file')
  const baselineFile = flagAt === -1 ? undefined : resolve(allArgs[flagAt + 1] ?? '')
  const args = flagAt === -1 ? allArgs : allArgs.filter((_, i) => i !== flagAt && i !== flagAt + 1)
  const [command, scenarioId, dir] = args
  if (command === 'list') {
    for (const scenario of loadScenarios()) console.log(`${scenario.id}\t${scenario.title}`)
    const cases = loadTriggerCases()
    console.log(`${cases.length} trigger cases (${cases.filter((c) => c.trigger).length} should trigger)`)
    return 0
  }
  if (command === 'setup' && scenarioId && dir) {
    const { scenario } = setup(scenarioId, resolve(dir), baselineFile)
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
    const baselinePath = baselineFile ?? join(root, BASELINE)
    const result = grade(scenario, root, existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {})
    for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${check.ok || !check.detail ? '' : ` (${check.detail})`}`)
    console.log(result.pass ? 'RESULT: pass' : 'RESULT: fail')
    return result.pass ? 0 : 1
  }
  console.error('Usage: node evals/run.mjs list | setup <scenario> <dir> [--baseline-file <file>] | grade <scenario> <dir> [--baseline-file <file>]')
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
