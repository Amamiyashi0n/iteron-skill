#!/usr/bin/env node
/**
 * Iteron record checker.
 *
 * Checks a repository that uses Iteron against the record rules in
 * references/task-record.md: the agent.md index, each task's plan.md,
 * stages/records.md, and distillation/notes.md.
 *
 * Usage: node scripts/check-records.mjs [root]
 *
 * Errors make the process exit with status 1. Warnings are reported only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TASK_ID = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?$/
const ITEM_ID = /^T-\d{3,}$/
const STAGE_HEADING = /^## (\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?) \/ (.+)$/
const ANCHOR = /<a name="([^"]+)"><\/a>/g
const LINK_TO_STAGE = /#(stage-[^)\s]+)/
const CREDENTIAL_ASSIGNMENT = /\b(?:password|passwd|secret|token|api[_-]?key)\b["'`]?\s*[:=]\s*(\S.*)$/i
const BENIGN_SECRET_VALUE = /^(?:none|n\/a|-|redacted|\[redacted\]|\*{3,}|<[^>]*>)\.?$/i
const PLAN_STATUSES = ['pending', 'in_progress', 'blocked', 'completed']
const RESULTS = ['pass', 'fail', 'unverified']
const METHOD_STATUSES = ['active', 'historical']
const METHOD_FIELDS = ['title', 'status', 'applies_when', 'route', 'check', 'source', 'search_terms']
const RETRY_LIMIT = 3
const INDEX_COLUMNS = ['task_id', 'title', 'search_terms', 'status', 'plan_link']
const PLAN_COLUMNS = ['item_id', 'requirement', 'expected_result', 'depends_on', 'acceptance_criteria', 'status', 'acceptance_ref']

const unticks = (value = '') => value.replace(/`/g, '').trim()
const criterionOf = (block) => /^(O-\d+)\b/.exec(block.get('criteria') ?? '')?.[1]
const lastResult = (stage) => stage.blocks.at(-1)?.get('result')

function readLines(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

/** Cells of the table whose header row starts with `| firstColumn |`. */
function tableRows(lines, firstColumn) {
  const start = lines.findIndex((line) => line.startsWith(`| ${firstColumn} |`))
  if (start < 0) return []
  const headers = lines[start].slice(1, -1).split('|').map((cell) => cell.trim())
  const rows = []
  rows.headers = headers
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].slice(1, -1).split('|').map((cell) => cell.trim())
    // `by` lets callers read a cell by its column name instead of its position.
    cells.by = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
    rows.push(cells)
  }
  return rows
}

/** Reports a missing table or required columns that its header row lacks. */
function checkColumns(rows, required, label, where, add) {
  if (!rows.headers) return add('error', 'table-missing', where, `${label} table is missing`)
  for (const column of required) {
    if (!rows.headers.includes(column)) add('error', 'table-column-missing', where, `${label} table has no ${column} column`)
  }
}

/** `- key: value` lines as a map. The first occurrence of a key wins. */
function fieldsOf(lines) {
  const fields = new Map()
  for (const line of lines) {
    const match = /^- ([a-z_]+): ?(.*)$/.exec(line)
    if (match && !fields.has(match[1])) fields.set(match[1], match[2].trim())
  }
  return fields
}

function anchorsOf(lines) {
  return new Set([...lines.join('\n').matchAll(ANCHOR)].map((match) => match[1]))
}

/** Sections that start with a record heading `## <plan_timestamp> / ...`. */
function recordSections(lines) {
  const sections = []
  let current = null
  for (const line of lines) {
    const match = STAGE_HEADING.exec(line)
    if (match) {
      current = { heading: line, plan: match[1], rest: match[2].split(' / '), body: [] }
      sections.push(current)
    } else if (line.startsWith('## ')) {
      current = null
    } else if (current) {
      current.body.push(line)
    }
  }
  return sections
}

/** Verification Blocks in a section body, each as a field map. */
function blocksOf(body) {
  const blocks = []
  let current = null
  for (const line of body) {
    if (line.startsWith('### Verification Block')) {
      current = []
      blocks.push(current)
    } else if (line.startsWith('### ')) {
      current = null
    } else if (current) {
      current.push(line)
    }
  }
  return blocks.map((lines) => fieldsOf(lines))
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

/** Flags unfilled placeholders and lines that look like credentials. */
function scanFile(path, where, add) {
  readLines(path).forEach((line, index) => {
    const at = `${where}:${index + 1}`
    if (line.includes('{{')) add('error', 'placeholder', at, 'unfilled {{...}} placeholder')
    const secret = CREDENTIAL_ASSIGNMENT.exec(line)
    if (secret && !BENIGN_SECRET_VALUE.test(secret[1].trim())) add('warning', 'possible-secret', at, 'looks like a credential; redact it or link to a secured location')
  })
}

/** Stage sections of stages/records.md, keyed by anchor, with their structure checked. */
function loadStages(path, where, add) {
  const stages = new Map()
  if (!existsSync(path)) return stages
  const lines = readLines(path)
  const anchors = anchorsOf(lines)
  const attempts = new Map()
  for (const section of recordSections(lines)) {
    const [first, second] = section.rest
    let kind
    let anchor
    if (section.rest.length === 1 && first === 'replan') {
      kind = 'replan'
      anchor = `stage-${section.plan}-replan`
    } else if (section.rest.length === 2 && first === 'overall' && /^\d+$/.test(second)) {
      kind = 'overall'
      anchor = `stage-${section.plan}-overall-${second}`
    } else if (section.rest.length === 2 && ITEM_ID.test(first) && /^\d+$/.test(second)) {
      kind = 'stage'
      anchor = `stage-${section.plan}-${first.toLowerCase()}-${second}`
    } else {
      add('error', 'stage-heading', where, `unrecognized heading: ${section.heading}`)
      continue
    }
    if (!anchors.has(anchor)) add('error', 'anchor-missing', where, `${section.heading} has no anchor ${anchor}`)
    const blocks = blocksOf(section.body)
    if (blocks.length === 0) add('warning', 'stage-without-block', where, `${section.heading} has no Verification Block`)
    for (const block of blocks) {
      if (!RESULTS.includes(block.get('result'))) add('error', 'block-result', where, `${section.heading}: result must be pass, fail or unverified`)
      if (!block.has('criteria')) add('error', 'criteria-missing', where, `${section.heading}: Verification Block has no criteria`)
      if (!block.has('reused') && !block.has('revision')) add('error', 'revision-missing', where, `${section.heading}: a checked block needs a revision`)
    }
    if (kind === 'stage') {
      const key = `${section.plan}/${first}`
      attempts.set(key, [...(attempts.get(key) ?? []), Number(second)])
    }
    stages.set(anchor, { kind, plan: section.plan, item: first, attempt: Number(second), heading: section.heading, blocks })
  }
  for (const [key, numbers] of attempts) {
    const sorted = [...numbers].sort((a, b) => a - b)
    if (new Set(sorted).size !== sorted.length) add('error', 'attempt-duplicate', where, `${key} repeats an attempt number`)
    else if (sorted.some((n, i) => n !== i + 1)) add('warning', 'attempt-gap', where, `${key} attempts are not numbered 1, 2, 3...`)
  }
  checkReused(stages, where, add)
  return stages
}

/** Consecutive non-passing attempts at the end of an item history under one plan. */
function trailingFailures(stages, plan, item) {
  const history = [...stages.values()]
    .filter((stage) => stage.kind === 'stage' && stage.plan === plan && stage.item === item)
    .sort((a, b) => a.attempt - b.attempt)
  let run = 0
  for (const stage of history) run = lastResult(stage) === 'pass' ? 0 : run + 1
  return run
}

/** Highest attempt number whose last Verification Block passed, for one item under one plan. */
function latestPass(stages, plan, item) {
  return Math.max(0, ...[...stages.values()]
    .filter((stage) => stage.kind === 'stage' && stage.plan === plan && stage.item === item && lastResult(stage) === 'pass')
    .map((stage) => stage.attempt))
}

/** A reused Verification Block must cite a stage that exists in stages/records.md. */
function checkReused(stages, where, add) {
  for (const stage of stages.values()) {
    for (const block of stage.blocks) {
      if (!block.has('reused')) continue
      const link = LINK_TO_STAGE.exec(block.get('reused'))
      if (!link) add('error', 'reused-link-missing', where, `${stage.heading}: a reused block links to no stage`)
      else if (!stages.has(link[1])) add('error', 'reused-source-broken', where, `${stage.heading}: a reused block cites ${link[1]}, which is not in stages/records.md`)
    }
  }
}

function checkMethods(path, where, stages, add) {
  const lines = readLines(path)
  const anchors = anchorsOf(lines)
  for (const section of recordSections(lines)) {
    const [item, method] = section.rest
    const number = /^M-(\d+)$/.exec(method ?? '')
    if (!ITEM_ID.test(item ?? '') || !number) {
      add('error', 'method-heading', where, `unrecognized heading: ${section.heading}`)
      continue
    }
    const anchor = `distillation-${section.plan}-${item.toLowerCase()}-${number[1]}`
    if (!anchors.has(anchor)) add('error', 'anchor-missing', where, `${section.heading} has no anchor ${anchor}`)
    const fields = fieldsOf(section.body)
    for (const key of METHOD_FIELDS) {
      if (!fields.get(key)) add('error', 'method-field-missing', where, `${section.heading} is missing ${key}`)
    }
    const status = fields.get('status')
    if (status && !METHOD_STATUSES.includes(status)) add('error', 'method-status', where, `${section.heading} has invalid status ${status}`)
    if (status === 'historical' && !fields.get('reason')) add('error', 'method-reason', where, `${section.heading} is historical but has no reason`)
    const source = LINK_TO_STAGE.exec(fields.get('source') ?? '')
    if (source && !stages.has(source[1])) add('error', 'method-source-broken', where, `${section.heading} cites ${source[1]}, which is not in stages/records.md`)
  }
}

function checkTask(id, dir, row, add) {
  const planPath = join(dir, 'plan.md')
  const where = `.agent/${id}-plan/plan.md`
  if (!existsSync(planPath)) {
    add('error', 'plan-file-missing', where, 'plan.md is missing')
    return
  }
  const planLines = readLines(planPath)
  const planText = planLines.join('\n')
  const fields = fieldsOf(planLines)
  const value = (key) => unticks(fields.get(key) ?? '')
  const status = value('status')
  const planTimestamp = value('plan_timestamp')
  const ownerName = (fields.get('owner') ?? '').replace(/`/g, '').split(' claimed ')[0].trim()

  if (value('task_id') !== id) add('error', 'task-id-mismatch', where, `task_id is ${value('task_id') || 'missing'}, expected ${id}`)
  if (!TASK_ID.test(planTimestamp)) add('error', 'plan-timestamp', where, 'plan_timestamp is missing or not yyyy-MM-dd_HH-mm-ss')
  if (!PLAN_STATUSES.includes(status)) add('error', 'plan-status', where, `status must be one of ${PLAN_STATUSES.join(', ')}`)
  for (const key of ['owner', 'next_item_number', 'search_terms', 'overall_acceptance_ref']) {
    if (!fields.has(key)) add('error', 'plan-field-missing', where, `${key} is missing`)
  }
  for (const heading of ['## Resume Point', '## Current Plan']) {
    if (!planLines.includes(heading)) add('error', 'plan-section-missing', where, `${heading} is missing`)
  }
  if (row && unticks(row.by.status ?? '') !== status) {
    add('error', 'index-status-mismatch', 'agent.md', `${id} is ${unticks(row.by.status ?? '')} in the index but ${status} in its plan; the plan wins`)
  }

  const overallCriteria = [...planText.matchAll(/^ {2}- (O-\d+):/gm)].map((match) => match[1])
  if (overallCriteria.length === 0) add('warning', 'overall-criteria-missing', where, 'overall_acceptance lists no O-n criteria')

  const recordsWhere = `.agent/${id}-plan/stages/records.md`
  const stages = loadStages(join(dir, 'stages', 'records.md'), recordsWhere, add)
  const seen = new Set()
  const itemStatuses = []
  let maxNumber = 0
  const planRows = tableRows(planLines, 'item_id')
  checkColumns(planRows, PLAN_COLUMNS, 'Current Plan', where, add)
  for (const cells of planRows) {
    const itemId = unticks(cells.by.item_id ?? '')
    const itemStatus = unticks(cells.by.status ?? '')
    itemStatuses.push(itemStatus)
    if (ITEM_ID.test(itemId)) maxNumber = Math.max(maxNumber, Number(itemId.slice(2)))
    else add('error', 'item-id', where, `invalid item id ${itemId}`)
    if (seen.has(itemId)) add('error', 'item-duplicate', where, `${itemId} is listed more than once`)
    seen.add(itemId)
    if (!PLAN_STATUSES.includes(itemStatus)) add('error', 'item-status', where, `${itemId} has invalid status ${itemStatus}`)
    if (itemStatus === 'completed') {
      const link = LINK_TO_STAGE.exec(cells.by.acceptance_ref ?? '')
      const stage = link ? stages.get(link[1]) : undefined
      if (!link) add('error', 'acceptance-ref-missing', where, `${itemId} is completed but its acceptance_ref links to no stage`)
      else if (!stage) add('error', 'acceptance-ref-broken', where, `${itemId} links to ${link[1]}, which is not in stages/records.md`)
      else {
        if (lastResult(stage) !== 'pass') add('error', 'acceptance-ref-not-pass', where, `${itemId} is completed but its acceptance stage did not pass`)
        if (stage.plan !== planTimestamp) add('warning', 'acceptance-ref-old-plan', where, `${itemId} points at a stage from plan ${stage.plan}`)
        const latest = latestPass(stages, stage.plan, itemId)
        if (latest > stage.attempt) add('warning', 'acceptance-ref-stale', where, `${itemId} links to attempt ${stage.attempt}, but attempt ${latest} is the latest pass`)
      }
    }
    const failures = trailingFailures(stages, planTimestamp, itemId)
    if (failures >= RETRY_LIMIT && itemStatus !== 'blocked') {
      add('warning', 'retry-limit', where, `${itemId} has ${failures} consecutive failed attempts; set it to blocked and record the pattern`)
    }
  }
  const next = Number(value('next_item_number'))
  if (!Number.isInteger(next) || next <= maxNumber) add('error', 'next-item-number', where, `next_item_number must be an integer above ${maxNumber}`)
  if (status === 'blocked' && !itemStatuses.includes('blocked')) add('warning', 'blocked-without-item', where, 'task is blocked but no item is blocked')

  if (status === 'completed') {
    if (itemStatuses.some((s) => s !== 'completed')) add('error', 'completed-open-items', where, 'task is completed but some items are not')
    if (ownerName !== 'none') add('error', 'owner-not-released', where, 'a closed task must set owner to none')
    const link = LINK_TO_STAGE.exec(fields.get('overall_acceptance_ref') ?? '')
    const overall = link ? stages.get(link[1]) : undefined
    if (!overall || overall.kind !== 'overall') {
      add('error', 'overall-ref', where, 'completed task needs overall_acceptance_ref linking to its overall stage')
    } else {
      if (overall.plan !== planTimestamp) add('error', 'overall-stale', where, `overall stage is from plan ${overall.plan}; closing needs a new overall stage`)
      for (const criterion of overallCriteria) {
        const passed = overall.blocks.some((block) => criterionOf(block) === criterion && block.get('result') === 'pass')
        if (!passed) add('error', 'overall-criterion', where, `${criterion} has no passing Verification Block in its overall stage`)
      }
    }
  }

  for (const path of markdownFiles(dir)) {
    scanFile(path, `.agent/${id}-plan/${relative(dir, path)}`, add)
  }
  const notes = join(dir, 'distillation', 'notes.md')
  if (existsSync(notes)) checkMethods(notes, `.agent/${id}-plan/distillation/notes.md`, stages, add)
}

/** Checks a repository root. Returns the issues found and the number of task directories. */
export function checkRoot(root) {
  const issues = []
  const add = (level, code, where, message) => issues.push({ level, code, where, message })
  const indexPath = join(root, 'agent.md')
  const agentDir = join(root, '.agent')
  const planDirs = new Map()
  if (existsSync(agentDir)) {
    for (const name of readdirSync(agentDir)) {
      const match = /^(.+)-plan$/.exec(name)
      if (match && statSync(join(agentDir, name)).isDirectory()) planDirs.set(match[1], join(agentDir, name))
    }
  }
  if (!existsSync(indexPath)) {
    if (planDirs.size > 0) add('error', 'index-missing', 'agent.md', 'agent.md is missing but .agent/ has task directories')
    return { issues, tasks: planDirs.size }
  }
  scanFile(indexPath, 'agent.md', add)
  const indexRows = new Map()
  const indexTable = tableRows(readLines(indexPath), 'task_id')
  checkColumns(indexTable, INDEX_COLUMNS, 'Task index', 'agent.md', add)
  for (const cells of indexTable) {
    const id = unticks(cells.by.task_id ?? '')
    if (!TASK_ID.test(id)) continue
    if (indexRows.has(id)) add('error', 'index-duplicate', 'agent.md', `${id} is listed more than once`)
    else indexRows.set(id, cells)
  }
  for (const id of new Set([...indexRows.keys(), ...planDirs.keys()])) {
    const dir = planDirs.get(id)
    if (!dir) {
      add('error', 'plan-missing', 'agent.md', `${id} is listed but .agent/${id}-plan/ does not exist`)
      continue
    }
    if (!indexRows.has(id)) add('error', 'index-missing-row', `.agent/${id}-plan`, 'task directory is not registered in agent.md')
    checkTask(id, dir, indexRows.get(id), add)
  }
  return { issues, tasks: planDirs.size }
}

export function main(args) {
  const root = resolve(args[0] ?? '.')
  const { issues, tasks } = checkRoot(root)
  for (const issue of issues) {
    console.log(`${issue.level.toUpperCase()} [${issue.code}] ${issue.where}: ${issue.message}`)
  }
  const errors = issues.filter((issue) => issue.level === 'error').length
  console.log(`${tasks} task(s) checked: ${errors} error(s), ${issues.length - errors} warning(s)`)
  return errors > 0 ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
