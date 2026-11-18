import { existsSync } from 'node:fs'
import { readLines, readAnchors, parseRecordSections, parseVerificationBlocks } from './record-markdown.mjs'

export const ITEM_ID = /^T-\d{3,}$/
export const LINK_TO_STAGE = /#(stage-[^)\s]+)/
const RESULTS = ['pass', 'fail', 'unverified']

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
      if (!fields.has('reused') && !fields.has('revision')) report('error', 'revision-missing', location, `${section.heading}: a checked block needs a revision`)
    }
    if (kind !== 'replan' && blocks.length === 0) report('warning', 'stage-without-block', location, `${section.heading} has no Verification Block`)
    if (kind === 'item') {
      const key = `${section.planTimestamp}/${subject}`
      attempts.set(key, [...(attempts.get(key) ?? []), Number(number)])
    }
    checkEvidenceSources(blocks, records, section.heading, location, report)
    records.set(anchor, { kind, planTimestamp: section.planTimestamp, itemId: kind === 'item' ? subject : undefined, attempt: number && Number(number), heading: section.heading, blocks })
  }
  for (const [key, numbers] of attempts) {
    const sorted = [...numbers].sort((a, b) => a - b)
    if (new Set(sorted).size !== sorted.length) report('error', 'attempt-duplicate', location, `${key} repeats an attempt number`)
    else if (sorted.some((n, i) => n !== i + 1)) report('warning', 'attempt-gap', location, `${key} attempts are not numbered 1, 2, 3...`)
  }
  return records
}

export function latestItemAttempt(records, attempt) {
  let latest = attempt
  for (const record of records.values()) {
    if (record.itemId === attempt.itemId && record.planTimestamp === attempt.planTimestamp && record.attempt > latest.attempt) {
      latest = record
    }
  }
  return latest
}

/** Resolve citations against earlier entries in the append-only log. */
function checkEvidenceSources(blocks, previousRecords, heading, location, report) {
  for (const block of blocks) {
    if (!block.has('reused')) continue
    const link = LINK_TO_STAGE.exec(block.get('reused'))
    const source = link && previousRecords.get(link[1])
    if (!link) {
      report('error', 'reused-link-missing', location, `${heading}: reused evidence needs an item attempt link`)
    } else if (!source) {
      report('error', 'reused-source-broken', location, `${heading}: no earlier record matches ${link[1]}`)
    } else if (source.kind !== 'item' || !source.blocks.length || source.blocks.some(check => check.get('result') !== 'pass')) {
      report('error', 'reused-source-not-pass', location, `${heading}: the cited item attempt did not pass`)
    } else if (!itemAttemptPassed(source)) {
      // Preserve old citations in the log while excluding them from current acceptance.
      block.set('evidence_status', 'historical')
    }
  }
}
