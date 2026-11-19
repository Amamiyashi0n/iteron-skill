import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { readLines, readAnchors, parseRecordSections, parseVerificationBlocks, readMarkdownLink } from './record-markdown.mjs'

export const ITEM_ID = /^T-\d{3,}$/
const RESULTS = ['pass', 'fail', 'unverified']
const UNRESOLVED_REVISION = /(?:^|\bsha-?256[\s:=]+)`?\$(?:\{\w+\}|\w+)(?=$|[`\s,;])/i

export function hasCurrentPass(block) {
  return block.get('result') === 'pass' && block.get('evidence_status') !== 'historical'
}

export function itemAttemptPassed(record) {
  return record.kind === 'item' && record.blocks.length > 0 && record.blocks.every(hasCurrentPass)
}

/** Stage sections of stages/records.md, keyed by anchor, with their structure checked. */
export function readVerificationRecords(path, location, report) {
  const records = new Map()
  if (!existsSync(path)) return records
  const lines = readLines(path)
  const anchors = readAnchors(lines)
  const attempts = new Map()
  for (const section of parseRecordSections(lines)) {
    const [subject, number] = section.parts
    let kind
    let anchor
    if (section.parts.length === 1 && subject === 'replan') {
      kind = 'replan'
      anchor = `stage-${section.planTimestamp}-replan`
    } else if (section.parts.length === 2 && subject === 'overall' && /^\d+$/.test(number)) {
      kind = 'overall'
      anchor = `stage-${section.planTimestamp}-overall-${number}`
    } else if (section.parts.length === 2 && ITEM_ID.test(subject) && /^\d+$/.test(number)) {
      kind = 'item'
      anchor = `stage-${section.planTimestamp}-${subject.toLowerCase()}-${number}`
    } else {
      report('error', 'stage-heading', location, `unrecognized heading: ${section.heading}`)
      continue
    }
    if (!anchors.has(anchor)) report('error', 'anchor-missing', location, `${section.heading} has no anchor ${anchor}`)
    const blocks = []
    for (const { fields, citation } of parseVerificationBlocks(section.body, kind)) {
      if (kind === 'overall' && !citation && fields.has('reused')) {
        report('error', 'overall-reuse-format', location, `${section.heading}: cite reused evidence on one "- O-n: [item attempt](#stage-...) — comparison" line`)
        continue
      }
      blocks.push(fields)
      if (!RESULTS.includes(fields.get('result'))) report('error', 'block-result', location, `${section.heading}: result must be pass, fail or unverified`)
      if (!fields.has('criteria')) report('error', 'criteria-missing', location, `${section.heading}: Verification Block has no criteria`)
      if (!fields.has('reused') && !fields.get('revision')) {
        report('error', 'revision-missing', location, `${section.heading}: a checked block needs a revision`)
      } else if (UNRESOLVED_REVISION.test(fields.get('revision') ?? '')) {
        report('error', 'revision-unresolved', location, `${section.heading}: write the computed value in revision; a shell variable was left in the record`)
      }
    }
    if (kind !== 'replan' && blocks.length === 0) report('warning', 'stage-without-block', location, `${section.heading} has no Verification Block`)
    if (kind !== 'replan') {
      const key = `${section.planTimestamp}/${subject}`
      attempts.set(key, [...(attempts.get(key) ?? []), Number(number)])
    }
    checkEvidenceSources(blocks, records, path, section.heading, location, report)
    records.set(anchor, { kind, planTimestamp: section.planTimestamp, itemId: kind === 'item' ? subject : undefined, attempt: number && Number(number), heading: section.heading, blocks })
  }
  for (const [key, numbers] of attempts) {
    const sorted = [...numbers].sort((a, b) => a - b)
    if (new Set(sorted).size !== sorted.length) report('error', 'attempt-duplicate', location, `${key} repeats an attempt number`)
    else if (sorted.some((n, i) => n !== i + 1)) report('warning', 'attempt-gap', location, `${key} attempts are not numbered 1, 2, 3...`)
  }
  return records
}

export function latestAttempt(records, attempt) {
  let latest = attempt
  for (const record of records.values()) {
    if (record.kind === attempt.kind && record.itemId === attempt.itemId &&
        record.planTimestamp === attempt.planTimestamp && record.attempt > latest.attempt) {
      latest = record
    }
  }
  return latest
}

/** Resolve citations against earlier entries in the append-only log. */
function checkEvidenceSources(blocks, previousRecords, path, heading, location, report) {
  for (const block of blocks) {
    if (!block.has('reused')) continue
    const link = readMarkdownLink(block.get('reused'))
    if (!link?.anchor) {
      report('error', 'reused-link-missing', location, `${heading}: reused evidence needs an item attempt link`)
      continue
    }
    const source = previousRecords.get(link.anchor)
    if ((link.path && relative(path, resolve(dirname(path), link.path)) !== '') || !source) {
      report('error', 'reused-source-broken', location, `${heading}: reuse must point to an earlier attempt in this log`)
    } else if (source.kind !== 'item' || !source.blocks.length || source.blocks.some(check => check.get('result') !== 'pass')) {
      report('error', 'reused-source-not-pass', location, `${heading}: the cited item attempt did not pass`)
    } else if (source.blocks.some(check => /^(?:none|`none`)$/i.test(check.get('revision') ?? ''))) {
      block.set('evidence_status', 'historical')
      report('error', 'reused-source-no-revision', location, `${heading}: the cited attempt has revision: none; run the check again`)
    } else if (!itemAttemptPassed(source)) {
      // Preserve old citations in the log while excluding them from current acceptance.
      block.set('evidence_status', 'historical')
    }
  }
}
