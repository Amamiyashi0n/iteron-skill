import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { readLines, parseTable, checkColumns, parseFields, parseRecordSections, readAnchors, readMarkdownLink } from './record-markdown.mjs'
import { ITEM_ID, readVerificationRecords, hasCurrentPass, itemAttemptPassed, latestAttempt, missingEvidenceFields } from './verification-records.mjs'

const TASK_ID = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?$/
const CREDENTIAL_KEYS = 'password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret'
const CREDENTIAL_ASSIGNMENT = new RegExp(`\\b(?:${CREDENTIAL_KEYS})\\b["'\`]?\\s*[:=]\\s*(\\S.*)$`, 'i')
const SPOKEN_CREDENTIALS = [/(?:密码|口令|密钥)\s*(?:是|为|[:：=])\s*([\x21-\x7e]{4,})/, /\bpw\s*[:=]\s*(\S+)/i]
const URL_CREDENTIAL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]+)@/i
const SECRET_SHAPES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/, 'an API secret key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/, 'a JSON web token'],
  [/\bbearer\s+[\w.~+/=-]{16,}/i, 'a bearer token'],
  [/\bauthorization\s*[:=]\s*basic\s+[A-Za-z0-9+/]{8,}={0,2}/i, 'a basic-auth header'],
]
const UNFILLED_HEADING = /^#+\s+`?\{\{[^{}]+\}\}`?$/
const UNFILLED_FIELD = /^\s*- (?:[a-z_]+|O-\d+):\s*`?\{\{[^{}]+\}\}`?\.?$/
const UNFILLED_OWNER = /^- owner:.*\{\{(?:owner|claimed_at)\}\}/
const UNFILLED_STRUCT = /(?:<a name="[^"]*\{\{[^{}]+\}\}[^"]*"><\/a>|^## [^\n]*\{\{[^{}]+\}\}|\[[^\]]*\{\{[^{}]+\}\}[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\{\{[^{}]+\}\}[^)]*\)|^- (?:O-\d+|reused):[^\n]*\{\{comparison\}\})/
const UNFILLED_CELL = /\|\s*`?\{\{[^{}]+\}\}`?\s*(?=\|)/
const OPEN_STATUSES = ['pending', 'in_progress', 'blocked']
const DAY_MS = 24 * 60 * 60 * 1000
const BENIGN_SECRET_VALUE = /^(?:none|n\/a|-|redacted|\[redacted\]|\*{3,}|<[^>]*>)\.?$/i
const PLAN_STATUSES = ['pending', 'in_progress', 'blocked', 'completed']
const TASK_STATUSES = [...PLAN_STATUSES, 'cancelled']
const METHOD_STATUSES = ['active', 'historical']
const METHOD_FIELDS = ['title', 'status', 'applies_when', 'route', 'check', 'source', 'search_terms']
const INDEX_COLUMNS = ['task_id', 'title', 'search_terms', 'status', 'plan_link']
const PLAN_COLUMNS = ['item_id', 'requirement', 'expected_result', 'depends_on', 'acceptance_criteria', 'status', 'acceptance_ref']
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'in', 'for', 'on', 'and', 'or', 'be', 'it', 'that', 'this', 'with', 'by', 'as', 'at', 'ok', 'yes', 'no'])

function isRealTimestamp(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(text)
  if (!match) return false
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    hour < 24 && minute < 60 && second < 60
}

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

function isBenignSecret(value = '') {
  const text = value.trim().replace(/^[`'"]+|[`'".,;]+$/g, '')
  return BENIGN_SECRET_VALUE.test(text) || /^\[redacted[^\]]*\]$/i.test(text) || /^\$\{?\w+\}?$/.test(text) ||
    /^\{\{.*\}\}$/.test(text) || /^%\w+%$/.test(text)
}

function secretShape(line) {
  for (const [pattern, label] of SECRET_SHAPES) if (pattern.test(line)) return label
  const url = URL_CREDENTIAL.exec(line)
  return url && !isBenignSecret(url[1]) ? 'a password inside a URL' : undefined
}

function checkForCredentials(lines, location, report, includeLine) {
  lines.forEach((line, index) => {
    if (includeLine && !includeLine(line)) return
    const at = `${location}:${index + 1}`
    const shape = secretShape(line)
    if (shape) return report('error', 'secret-detected', at, `contains ${shape}; remove it, redact it, or link to a secured location`)
    const found = [CREDENTIAL_ASSIGNMENT, ...SPOKEN_CREDENTIALS].map((pattern) => pattern.exec(line)).find(Boolean)
    if (found && !isBenignSecret(found[1])) report('warning', 'possible-secret', at, 'looks like a credential; redact it or link to a secured location')
  })
}

function checkPlaceholders(lines, location, report, includeLine) {
  lines.forEach((line, index) => {
    if (includeLine && !includeLine(line)) return
    if (
      UNFILLED_HEADING.test(line) ||
      UNFILLED_FIELD.test(line) ||
      UNFILLED_OWNER.test(line) ||
      UNFILLED_STRUCT.test(line) ||
      (line.trim().startsWith('|') && UNFILLED_CELL.test(line))
    ) {
      report('error', 'placeholder-unfilled', `${location}:${index + 1}`, 'a template placeholder was left unfilled; fill it or delete the line')
    }
  })
}

const CONFLICT_MARKER = /^(?:<{7}|>{7})(?: |$)/

function checkConflictMarkers(lines, location, report) {
  lines.forEach((line, index) => {
    if (CONFLICT_MARKER.test(line)) {
      report('error', 'merge-conflict', `${location}:${index + 1}`, 'unresolved merge conflict marker; keep the content from both sides when they are separate rows or records, then remove the markers')
    }
  })
}

const emptyField = (value) => /^(?:-|none|n\/a|无)?\.?$/i.test(plainText(value ?? ''))
const normalizeText = (text = '') => text.toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function phraseContained(haystack, needle) {
  if (/[^\x00-\x7f]/.test(needle)) return haystack.includes(needle)
  return ` ${haystack} `.includes(` ${needle} `)
}

function hasSubstantiveToken(text) {
  return text.split(' ').some((token) =>
    !STOP_WORDS.has(token) && (/[^\x00-\x7f]/.test(token) ? token.length >= 2 : token.length >= 4),
  )
}

/** The plan's wording and a check's wording agree when the check states the plan's criterion or a substantive phrase from it. */
function criteriaCovered(planCriteria, blocks) {
  const wanted = normalizeText(planCriteria)
  if (!wanted) return true
  return blocks.some((block) => {
    const checked = normalizeText((block.get('criteria') ?? '').replace(/^\s*O-\d+\b[:\s-]*/i, ''))
    if (!checked) return false
    return phraseContained(checked, wanted) ||
      (phraseContained(wanted, checked) && hasSubstantiveToken(checked) && checked.length * 2 >= wanted.length)
  })
}

function parseDependencies(cell) {
  return plainText(cell ?? '').split(/[\s,;，、]+/).filter((token) => ITEM_ID.test(token))
}

function findCycle(graph) {
  const state = new Map()
  const visit = (id, path) => {
    state.set(id, 1)
    for (const dep of graph.get(id) ?? []) {
      if (!graph.has(dep)) continue
      if (state.get(dep) === 1) return [...path.slice(path.indexOf(dep)), dep]
      if (!state.has(dep)) {
        const found = visit(dep, [...path, dep])
        if (found) return found
      }
    }
    state.set(id, 2)
    return null
  }
  for (const id of graph.keys()) {
    if (state.has(id)) continue
    const found = visit(id, [id])
    if (found) return found
  }
  return null
}

function checkOwner(status, fields, location, options, report) {
  const text = (fields.get('owner') ?? '').replace(/`/g, '').trim()
  const name = text.split(' claimed ')[0].trim()
  const released = name === 'none'
  if (status === 'cancelled') {
    if (!released) report('error', 'owner-not-released', location, 'a cancelled task must set owner to none')
    if (!plainText(fields.get('cancel_reason') ?? '')) report('error', 'cancel-reason-missing', location, 'a cancelled task needs cancel_reason')
    return
  }
  if (!OPEN_STATUSES.includes(status) || !name || released) return
  const claim = /\bclaimed\s+(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\b/.exec(text)
  if (!claim || !isRealTimestamp(claim[0].replace(/^claimed\s+/, ''))) {
    report('warning', 'owner-claim-time', location, 'owner needs a UTC claim time in yyyy-MM-dd_HH-mm-ss format after "claimed"')
    return
  }
  const [, year, month, day, hour, minute, second] = claim.map(Number)
  const age = (options.now ?? Date.now()) - Date.UTC(year, month - 1, day, hour, minute, second)
  const limit = options.staleOwnerDays ?? 7
  if (age > limit * DAY_MS) {
    report('warning', 'owner-stale', location, `owner claimed this task ${Math.floor(age / DAY_MS)} days ago; confirm that session is gone before taking over`)
  }
}

function checkReplans(planTimestamp, records, recordsPath, location, report) {
  if (!TASK_ID.test(planTimestamp)) return
  const replans = (existsSync(recordsPath) ? parseRecordSections(readLines(recordsPath)) : [])
    .filter((section) => section.parts.length === 1 && section.parts[0] === 'replan')
  for (const section of replans) {
    const previous = plainText(parseFields(section.body).get('previous_plan_timestamp') ?? '')
    if (previous && TASK_ID.test(previous) && previous >= section.planTimestamp) {
      report('error', 'replan-timestamp', location, `${section.heading}: previous_plan_timestamp must be earlier than the new plan_timestamp`)
    }
  }
  const latest = replans.map((section) => section.planTimestamp).sort().at(-1)
  if (latest && latest > planTimestamp) {
    report('error', 'replan-ahead', location, `a replan entry is dated ${latest}, newer than plan_timestamp ${planTimestamp}; update plan.md`)
  }
  const earlier = [...records.values()].some((record) => record.planTimestamp < planTimestamp)
  if (earlier && !replans.some((section) => section.planTimestamp === planTimestamp)) {
    report('error', 'replan-missing', location, `plan_timestamp ${planTimestamp} is newer than earlier records, but stages/records.md has no "## ${planTimestamp} / replan" entry`)
  }
}

function checkDependencies(rows, location, report) {
  for (const row of rows) {
    const bad = plainText(row.depends_on ?? '').split(/[\s,;，、]+/).filter((token) => token && !ITEM_ID.test(token) && !emptyField(token))
    if (bad.length > 0) {
      report('error', 'depends-malformed', location, `${plainText(row.item_id ?? '')} has depends_on entries that are not item IDs: ${bad.join(', ')}; write IDs such as T-001, or -`)
    }
  }
  const items = rows.map((row) => ({ id: plainText(row.item_id ?? ''), status: plainText(row.status ?? ''), deps: [...new Set(parseDependencies(row.depends_on))] }))
  const byId = new Map(items.map((item) => [item.id, item]))
  const graph = new Map()
  for (const item of items) {
    graph.set(item.id, item.deps.filter((dep) => dep !== item.id))
    for (const dep of item.deps) {
      if (dep === item.id) report('error', 'depends-self', location, `${item.id} depends on itself`)
      else if (!byId.has(dep)) report('error', 'depends-unknown', location, `${item.id} depends on ${dep}, which is not in the current plan`)
      else if (item.status === 'completed' && byId.get(dep).status !== 'completed') {
        report('warning', 'depends-order', location, `${item.id} is completed but its dependency ${dep} is not`)
      }
    }
  }
  const cycle = findCycle(graph)
  if (cycle) report('warning', 'depends-cycle', location, `dependency cycle ${cycle.join(' -> ')}; record the hard prerequisite and what would break it in a replan entry`)
}

function checkItemNumbers(fields, planTable, records, location, report) {
  const next = Number(plainText(fields.get('next_item_number') ?? ''))
  const numberOf = (id) => (ITEM_ID.test(id) ? Number(id.slice(2)) : 0)
  const planMax = Math.max(0, ...planTable.rows.map((row) => numberOf(plainText(row.item_id ?? ''))))
  const usedMax = Math.max(0, ...[...records.values()].map((record) => numberOf(record.itemId ?? '')))
  if (Number.isInteger(next) && next > planMax && next <= usedMax) {
    report('error', 'next-item-number', location, `next_item_number must be above ${usedMax}, the highest item ID already used in stages/records.md; retired IDs are not reused`)
  }
}

function readMethodStatuses(path, cache) {
  if (cache.has(path)) return cache.get(path)
  if (!existsSync(path)) {
    cache.set(path, null)
    return null
  }
  const lines = readLines(path)
  const anchors = readAnchors(lines)
  const statuses = new Map()
  for (const section of parseRecordSections(lines)) {
    const [item, method] = section.parts
    const number = /^M-(\d+)$/.exec(method ?? '')
    if (!ITEM_ID.test(item ?? '') || !number) continue
    const anchor = `distillation-${section.planTimestamp}-${item.toLowerCase()}-${number[1]}`
    const status = parseFields(section.body).get('status')
    if (status) statuses.set(anchor, status)
  }
  const entry = { anchors, statuses }
  cache.set(path, entry)
  return entry
}

function checkAppliedDistillation(records, recordsPath, recordsLocation, report) {
  const cache = new Map()
  const baseDir = dirname(recordsPath)
  for (const record of records.values()) {
    const value = record.appliedDistillation
    if (!value || emptyField(value)) continue
    const link = readMarkdownLink(value)
    if (!link) continue
    const targetPath = link.path ? resolve(baseDir, link.path) : recordsPath
    const target = readMethodStatuses(targetPath, cache)
    if (!link.anchor || !target || !target.anchors.has(link.anchor)) {
      report('error', 'applied-distillation-broken', recordsLocation, `${record.heading}: applied_distillation points to a missing method note or anchor`)
    } else if (target.statuses.get(link.anchor) === 'historical') {
      report('warning', 'applied-distillation-historical', recordsLocation, `${record.heading}: applied_distillation cites a historical method; confirm it still applies or update the note`)
    }
  }
}

/** A gap in the evidence behind a completed item is an error once the task is closed and a warning while it is still open. */
function checkClosureEvidence({ status, fields, planText, planTable, records, planPath, recordsPath, location, report }) {
  const level = status === 'completed' ? 'error' : 'warning'
  const dir = dirname(planPath)
  for (const item of planTable.rows) {
    const itemId = plainText(item.item_id ?? '')
    if (plainText(item.status ?? '') !== 'completed') continue
    const link = readMarkdownLink(item.acceptance_ref)
    const attempt = link?.anchor && linksToFile(link, dir, recordsPath) ? records.get(link.anchor) : undefined
    if (!attempt || attempt.kind !== 'item' || attempt.itemId !== itemId || attempt.blocks.length === 0) continue
    if (!criteriaCovered(item.acceptance_criteria, attempt.blocks)) {
      report(level, 'criteria-mismatch', location, `${itemId}: attempt ${attempt.attempt} does not state the plan's acceptance_criteria. Same meaning: make its criteria quote the plan's wording. Check fell short: run a new attempt that covers it and cite that. Criterion changed: replan (new plan_timestamp and a replan entry)`)
    }
    const missing = [...new Set(attempt.blocks.flatMap((block) => missingEvidenceFields(block)))]
    if (missing.length > 0) report(level, 'evidence-incomplete', location, `${itemId}: attempt ${attempt.attempt} lacks ${missing.join(', ')}. Fill only what was actually done; if it was not recorded, run the check again as a new attempt`)
  }
  const link = readMarkdownLink(fields.get('overall_acceptance_ref'))
  const overall = linksToFile(link, dir, recordsPath) ? records.get(link.anchor) : undefined
  if (overall?.kind !== 'overall') return
  for (const [, criterion, text] of planText.matchAll(/^[ \t]+- (O-\d+):\s*(.*)$/gm)) {
    const checks = overall.blocks.filter((block) => criterionId(block) === criterion && !block.has('reused'))
    if (checks.length > 0 && !criteriaCovered(text, checks)) {
      report(level, 'criteria-mismatch', location, `${criterion}: overall attempt ${overall.attempt} does not state the plan's criterion. Same meaning: make its criteria quote the plan's wording. Check fell short: run a new overall attempt. Criterion changed: replan`)
    }
  }
  const missing = [...new Set(overall.blocks.flatMap((block) => missingEvidenceFields(block)))]
  if (missing.length > 0) report(level, 'evidence-incomplete', location, `overall attempt ${overall.attempt} lacks ${missing.join(', ')}. Fill only what was actually done; if it was not recorded, run the check again as a new overall attempt`)
}

/** Checks that the plan, its stage log and its owner agree with each other beyond the shape of each record. */
function checkTaskIntegrity(context) {
  const { status, planTimestamp, fields, planTable, records, recordsPath, recordsLocation, location, report, options } = context
  if (!plainText(fields.get('goal') ?? '')) report('warning', 'plan-goal-missing', location, 'goal is missing')
  checkOwner(status, fields, location, options, report)
  checkReplans(planTimestamp, records, recordsPath, location, report)
  checkDependencies(planTable.rows, location, report)
  checkItemNumbers(fields, planTable, records, location, report)
  checkAppliedDistillation(records, recordsPath, recordsLocation, report)
  if (status === 'completed') {
    if (!emptyField(fields.get('pending_checks'))) report('error', 'closure-pending-checks', location, 'a completed task must clear pending_checks')
    if (!emptyField(fields.get('delegated'))) report('error', 'closure-delegated', location, 'a completed task must not list delegated work')
  }
  checkClosureEvidence(context)
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

function checkTask(id, root, taskLocation, row, report, options = {}) {
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
  if (!TASK_ID.test(planTimestamp) || !isRealTimestamp(planTimestamp)) report('error', 'plan-timestamp', location, 'plan_timestamp is missing or not yyyy-MM-dd_HH-mm-ss')
  if (!TASK_STATUSES.includes(status)) report('error', 'plan-status', location, `status must be one of ${TASK_STATUSES.join(', ')}`)
  for (const key of ['owner', 'next_item_number', 'search_terms', 'overall_acceptance_ref']) {
    if (!fields.has(key)) report('error', 'plan-field-missing', location, `${key} is missing`)
  }
  for (const heading of ['## Resume Point', '## Current Plan']) {
    if (!planLines.includes(heading)) report('error', 'plan-section-missing', location, `${heading} is missing`)
  }
  if (row && plainText(row.status ?? '') !== status) {
    report('error', 'index-status-mismatch', 'agent.md', `${id} is ${plainText(row.status ?? '')} in the index but ${status} in its plan; the plan wins`)
  }

  const overallCriteria = [...planText.matchAll(/^[ \t]+- (O-\d+):/gm)].map((match) => match[1])
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

  checkTaskIntegrity({ status, planTimestamp, fields, planText, planTable, records, planPath, recordsPath, recordsLocation, location, report, options })
  for (const path of markdownFiles(dir)) {
    const lines = readLines(path)
    const where = `${taskLocation}/${relative(dir, path).replaceAll('\\', '/')}`
    checkForCredentials(lines, where, report)
    checkPlaceholders(lines, where, report)
    checkConflictMarkers(lines, where, report)
  }
  const notes = join(dir, 'distillation', 'notes.md')
  if (existsSync(notes)) checkMethods(notes, `${taskLocation}/distillation/notes.md`, records, report)
}

/** Checks a repository root. Returns the issues found and the number of task directories. */
export function checkRoot(root, taskId, options = {}) {
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
  checkPlaceholders(indexLines, 'agent.md', report, selectedRow)
  checkConflictMarkers(indexLines, 'agent.md', report)
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
    checkTask(id, root, dir, indexRows.get(id), report, options)
  }
  return { issues, tasks: planDirs.size }
}
