import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { readLines, parseTable, checkColumns, parseFields, parseRecordSections, readAnchors, readMarkdownLink } from './record-markdown.mjs'
import { ITEM_ID, readVerificationRecords, hasCurrentPass, itemAttemptPassed, latestAttempt } from './verification-records.mjs'

const TASK_ID = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?$/
const CREDENTIAL_ASSIGNMENT = /\b(?:password|passwd|secret|token|api[_-]?key)\b["'`]?\s*[:=]\s*(\S.*)$/i
const BENIGN_SECRET_VALUE = /^(?:none|n\/a|-|redacted|\[redacted\]|\*{3,}|<[^>]*>)\.?$/i
const PLAN_STATUSES = ['pending', 'in_progress', 'blocked', 'completed']
const METHOD_STATUSES = ['active', 'historical']
const METHOD_FIELDS = ['title', 'status', 'applies_when', 'route', 'check', 'source', 'search_terms']
const INDEX_COLUMNS = ['task_id', 'title', 'search_terms', 'status', 'plan_link']
const PLAN_COLUMNS = ['item_id', 'requirement', 'expected_result', 'depends_on', 'acceptance_criteria', 'status', 'acceptance_ref']

const plainText = (value = '') => value.replace(/`/g, '').trim()
const criterionId = (block) => /^(O-\d+)\b/.exec(block.get('criteria') ?? '')?.[1]

function linksToFile(link, fromDir, path) {
  return Boolean(link?.path) && relative(path, resolve(fromDir, link.path)) === ''
}

function overallCriterionPassed(attempt, criterion) {
  const checks = attempt.blocks.filter(block => criterionId(block) === criterion)
  return checks.length > 0 && checks.every(hasCurrentPass)
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

function checkForCredentials(lines, location, report, includeLine) {
  lines.forEach((line, index) => {
    if (includeLine && !includeLine(line)) return
    const at = `${location}:${index + 1}`
    const secret = CREDENTIAL_ASSIGNMENT.exec(line)
    if (secret && !BENIGN_SECRET_VALUE.test(secret[1].trim())) report('warning', 'possible-secret', at, 'looks like a credential; redact it or link to a secured location')
  })
}

function checkMethods(path, location, records, report) {
  const lines = readLines(path)
  const anchors = readAnchors(lines)
  for (const section of parseRecordSections(lines)) {
    const [item, method] = section.parts
    const number = /^M-(\d+)$/.exec(method ?? '')
    if (!ITEM_ID.test(item ?? '') || !number) {
      report('error', 'method-heading', location, `unrecognized heading: ${section.heading}`)
      continue
    }
    const anchor = `distillation-${section.planTimestamp}-${item.toLowerCase()}-${number[1]}`
    if (!anchors.has(anchor)) report('error', 'anchor-missing', location, `${section.heading} has no anchor ${anchor}`)
    const fields = parseFields(section.body)
    for (const key of METHOD_FIELDS) {
      if (!fields.get(key)) report('error', 'method-field-missing', location, `${section.heading} is missing ${key}`)
    }
    const status = fields.get('status')
    if (status && !METHOD_STATUSES.includes(status)) report('error', 'method-status', location, `${section.heading} has invalid status ${status}`)
    if (status === 'historical' && !fields.get('reason')) report('error', 'method-reason', location, `${section.heading} is historical but has no reason`)
    const source = fields.get('source')
    if (!source) continue // Covered by the required-field check above.
    const link = readMarkdownLink(source)
    const notesDir = dirname(path)
    if (!linksToFile(link, notesDir, join(notesDir, '../stages/records.md')) || !records.has(link.anchor)) {
      report('error', 'method-source-broken', location, `${section.heading}: source must link to an attempt in this task's stages/records.md`)
      continue
    }
    const attempt = records.get(link.anchor)
    if (status === 'active' && (attempt.itemId !== item || attempt.planTimestamp !== section.planTimestamp || !itemAttemptPassed(attempt))) {
      report('error', 'method-source-not-verified', location, `${section.heading}: an active method needs a current passing attempt for its plan item`)
    }
  }
}

function checkItemEvidence(itemId, reference, records, planTimestamp, planPath, location, report) {
  const link = readMarkdownLink(reference)
  if (!link?.anchor) return report('error', 'acceptance-ref-missing', location, `${itemId} has no verification attempt link`)
  const attempt = records.get(link.anchor)
  const planDir = dirname(planPath)
  if (!linksToFile(link, planDir, join(planDir, 'stages/records.md')) || !attempt) {
    return report('error', 'acceptance-ref-broken', location, `${itemId} must link to an existing attempt in its stages/records.md`)
  }
  if (attempt.kind !== 'item' || attempt.itemId !== itemId) {
    return report('error', 'acceptance-ref-wrong-item', location, `${itemId} must cite its own verification attempt`)
  }
  if (!itemAttemptPassed(attempt)) report('error', 'acceptance-ref-not-pass', location, `${itemId} needs current passing evidence`)
  if (attempt.planTimestamp !== planTimestamp) report('warning', 'acceptance-ref-old-plan', location, `${itemId} cites plan ${attempt.planTimestamp}`)
  const latest = latestAttempt(records, attempt)
  if (latest === attempt) return
  if (itemAttemptPassed(latest)) {
    report('warning', 'acceptance-ref-stale', location, `${itemId} cites attempt ${attempt.attempt}, but attempt ${latest.attempt} passed later`)
  } else {
    const results = latest.blocks.map(block => block.get('result')).join(', ') || 'no recorded result'
    report('warning', 'acceptance-ref-recheck', location, `${itemId} cites attempt ${attempt.attempt}. Review attempt ${latest.attempt} (${results}) before relying on the earlier evidence.`)
  }
}

function checkTask(id, root, taskLocation, row, report) {
  const dir = join(root, taskLocation)
  const planPath = join(dir, 'plan.md')
  const location = `${taskLocation}/plan.md`
  if (!existsSync(planPath)) {
    report('error', 'plan-file-missing', location, 'plan.md is missing')
    return
  }
  const planLines = readLines(planPath)
  const planText = planLines.join('\n')
  const fields = parseFields(planLines)
  const value = (key) => plainText(fields.get(key) ?? '')
  const status = value('status')
  const planTimestamp = value('plan_timestamp')
  const ownerName = (fields.get('owner') ?? '').replace(/`/g, '').split(' claimed ')[0].trim()

  if (value('task_id') !== id) report('error', 'task-id-mismatch', location, `task_id is ${value('task_id') || 'missing'}, expected ${id}`)
  if (!TASK_ID.test(planTimestamp)) report('error', 'plan-timestamp', location, 'plan_timestamp is missing or not yyyy-MM-dd_HH-mm-ss')
  if (!PLAN_STATUSES.includes(status)) report('error', 'plan-status', location, `status must be one of ${PLAN_STATUSES.join(', ')}`)
  for (const key of ['owner', 'next_item_number', 'search_terms', 'overall_acceptance_ref']) {
    if (!fields.has(key)) report('error', 'plan-field-missing', location, `${key} is missing`)
  }
  for (const heading of ['## Resume Point', '## Current Plan']) {
    if (!planLines.includes(heading)) report('error', 'plan-section-missing', location, `${heading} is missing`)
  }
  if (row && plainText(row.status ?? '') !== status) {
    report('error', 'index-status-mismatch', 'agent.md', `${id} is ${plainText(row.status ?? '')} in the index but ${status} in its plan; the plan wins`)
  }

  const overallCriteria = [...planText.matchAll(/^ {2}- (O-\d+):/gm)].map((match) => match[1])
  if (overallCriteria.length === 0) report(status === 'completed' ? 'error' : 'warning', 'overall-criteria-missing', location, 'overall_acceptance lists no O-n criteria')

  const recordsLocation = `${taskLocation}/stages/records.md`
  const recordsPath = join(dir, 'stages', 'records.md')
  const records = readVerificationRecords(recordsPath, recordsLocation, report)
  const seenItemIds = new Set()
  const itemStatuses = []
  let maxNumber = 0
  const planTable = parseTable(planLines, 'item_id')
  checkColumns(planTable, PLAN_COLUMNS, 'Current Plan', location, report)
  for (const item of planTable.rows) {
    const itemId = plainText(item.item_id ?? '')
    const itemStatus = plainText(item.status ?? '')
    itemStatuses.push(itemStatus)
    if (ITEM_ID.test(itemId)) maxNumber = Math.max(maxNumber, Number(itemId.slice(2)))
    else report('error', 'item-id', location, `invalid item id ${itemId}`)
    if (seenItemIds.has(itemId)) report('error', 'item-duplicate', location, `${itemId} is listed more than once`)
    seenItemIds.add(itemId)
    if (!PLAN_STATUSES.includes(itemStatus)) report('error', 'item-status', location, `${itemId} has invalid status ${itemStatus}`)
    if (itemStatus === 'completed') checkItemEvidence(itemId, item.acceptance_ref, records, planTimestamp, planPath, location, report)
  }
  const next = Number(value('next_item_number'))
  if (!Number.isInteger(next) || next <= maxNumber) report('error', 'next-item-number', location, `next_item_number must be an integer above ${maxNumber}`)
  if (status === 'blocked' && !itemStatuses.includes('blocked')) report('warning', 'blocked-without-item', location, 'task is blocked but no item is blocked')

  if (status === 'completed') {
    if (itemStatuses.some((s) => s !== 'completed')) report('error', 'completed-open-items', location, 'task is completed but some items are not')
    if (ownerName !== 'none') report('error', 'owner-not-released', location, 'a closed task must set owner to none')
    if (!/^completed\.?$/i.test(value('next_action'))) {
      report('error', 'completed-next-action', location, 'set next_action to completed after overall verification passes')
    }
    const link = readMarkdownLink(fields.get('overall_acceptance_ref'))
    const overall = linksToFile(link, dir, recordsPath) ? records.get(link.anchor) : undefined
    if (!overall || overall.kind !== 'overall') {
      report('error', 'overall-ref', location, 'completed task needs overall_acceptance_ref linking to its overall stage')
    } else {
      if (overall.planTimestamp !== planTimestamp) report('error', 'overall-stale', location, `overall stage is from plan ${overall.planTimestamp}; closing needs a new overall stage`)
      for (const criterion of overallCriteria) {
        if (!overallCriterionPassed(overall, criterion)) {
          report('error', 'overall-criterion', location, `${criterion} needs current passing evidence in its overall stage`)
        }
      }
      const latest = latestAttempt(records, overall)
      if (latest !== overall) {
        const unresolved = overallCriteria.filter(criterion => !overallCriterionPassed(latest, criterion))
        if (unresolved.length > 0) {
          report('warning', 'overall-ref-recheck', location, `Overall attempt ${latest.attempt} lacks passing evidence for ${unresolved.join(', ')}. Review it before relying on attempt ${overall.attempt}.`)
        } else {
          report('warning', 'overall-ref-stale', location, `Overall attempt ${latest.attempt} passed after the cited attempt ${overall.attempt}`)
        }
      }
    }
  }

  for (const path of markdownFiles(dir)) {
    checkForCredentials(readLines(path), `${taskLocation}/${relative(dir, path).replaceAll('\\', '/')}`, report)
  }
  const notes = join(dir, 'distillation', 'notes.md')
  if (existsSync(notes)) checkMethods(notes, `${taskLocation}/distillation/notes.md`, records, report)
}

/** Checks a repository root. Returns the issues found and the number of task directories. */
export function checkRoot(root, taskId) {
  const issues = []
  const report = (level, code, location, message) => issues.push({ level, code, where: location, message })
  const indexPath = join(root, 'agent.md')
  const planDirs = new Map()
  for (const recordsRoot of ['.agent', 'agent']) {
    const agentDir = join(root, recordsRoot)
    if (!statSync(agentDir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const entry of readdirSync(agentDir, { withFileTypes: true })) {
      const id = /^(.+)-plan$/.exec(entry.name)?.[1]
      if (!id || !entry.isDirectory() || (taskId !== undefined && id !== taskId)) continue
      if (recordsRoot === 'agent' && !TASK_ID.test(id)) continue
      const taskLocation = `${recordsRoot}/${entry.name}`
      if (planDirs.has(id)) {
        report('error', 'task-dir-duplicate', taskLocation, `${id} already has a task directory at ${planDirs.get(id)}`)
      } else {
        planDirs.set(id, taskLocation)
      }
    }
  }
  if (!existsSync(indexPath)) {
    if (planDirs.size > 0 || taskId !== undefined) report('error', 'index-missing', 'agent.md', 'task index is missing')
    return { issues, tasks: planDirs.size }
  }
  const indexLines = readLines(indexPath)
  const selectedRow = taskId === undefined ? undefined : line =>
    line.startsWith('|') && plainText(line.split('|')[1]) === taskId
  checkForCredentials(indexLines, 'agent.md', report, selectedRow)
  const indexRows = new Map()
  const indexTable = parseTable(indexLines, 'task_id')
  checkColumns(indexTable, INDEX_COLUMNS, 'Task index', 'agent.md', report)
  for (const row of indexTable.rows) {
    const id = plainText(row.task_id ?? '')
    if (!TASK_ID.test(id) || (taskId !== undefined && id !== taskId)) continue
    const taskLocation = planDirs.get(id)
    if (taskLocation && !linksToFile(readMarkdownLink(row.plan_link), root, join(root, taskLocation, 'plan.md'))) {
      report('error', 'index-plan-link', 'agent.md', `${id} must link to its ${taskLocation}/plan.md`)
    }
    if (indexRows.has(id)) report('error', 'index-duplicate', 'agent.md', `${id} is listed more than once`)
    else indexRows.set(id, row)
  }
  if (taskId !== undefined && !indexRows.has(taskId) && !planDirs.has(taskId)) {
    report('error', 'task-not-found', 'agent.md', `no task found for ${taskId}`)
  }
  for (const id of new Set([...indexRows.keys(), ...planDirs.keys()])) {
    const dir = planDirs.get(id)
    if (!dir) {
      report('error', 'plan-missing', 'agent.md', `${id} has no task directory under .agent/ or agent/`)
      continue
    }
    if (!indexRows.has(id)) report('error', 'index-missing-row', dir, 'task directory is not registered in agent.md')
    checkTask(id, root, dir, indexRows.get(id), report)
  }
  return { issues, tasks: planDirs.size }
}
