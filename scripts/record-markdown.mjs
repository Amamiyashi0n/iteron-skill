import { readFileSync } from 'node:fs'

const RECORD_HEADING = /^## (\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?) \/ (.+)$/
const ANCHOR = /<a name="([^"]+)"><\/a>/g

export function readLines(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

/** Cells of the table whose header row starts with `| firstColumn |`. */
export function parseTable(lines, firstColumn) {
  const start = lines.findIndex((line) => line.startsWith(`| ${firstColumn} |`))
  if (start < 0) return { headers: [], rows: [] }
  const headers = lines[start].slice(1, -1).split('|').map((cell) => cell.trim())
  const rows = []
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].slice(1, -1).split('|').map((cell) => cell.trim())
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
  }
  return { headers, rows }
}

/** Reports a missing table or required columns that its header row lacks. */
export function checkColumns(table, required, label, location, report) {
  if (!table.headers.length) return report('error', 'table-missing', location, `${label} table is missing`)
  for (const column of required) {
    if (!table.headers.includes(column)) report('error', 'table-column-missing', location, `${label} table has no ${column} column`)
  }
}

/** `- key: value` lines as a map. The first occurrence of a key wins. */
export function parseFields(lines) {
  const fields = new Map()
  for (const line of lines) readField(line, fields)
  return fields
}

function readField(line, fields) {
  const match = /^- ([a-z_]+): ?(.*)$/.exec(line)
  if (match && !fields.has(match[1])) fields.set(match[1], match[2].trim())
}

export function readAnchors(lines) {
  return new Set([...lines.join('\n').matchAll(ANCHOR)].map((match) => match[1]))
}

/** Sections that start with a record heading `## <plan_timestamp> / ...`. */
export function parseRecordSections(lines) {
  const sections = []
  let current = null
  for (const line of lines) {
    const match = RECORD_HEADING.exec(line)
    if (match) {
      current = { heading: line, planTimestamp: match[1], parts: match[2].split(' / '), body: [] }
      sections.push(current)
    } else if (line.startsWith('## ')) {
      current = null
    } else if (current) {
      current.body.push(line)
    }
  }
  return sections
}

/** Read full checks and one-line overall citations in document order. */
export function parseVerificationBlocks(body, kind) {
  const blocks = []
  let fields
  for (const line of body) {
    const reusedCriterion = kind === 'overall' && /^- (O-\d+): (.+)$/.exec(line)
    if (reusedCriterion) {
      const [, criterion, source] = reusedCriterion
      blocks.push({ citation: true, fields: new Map([['criteria', criterion], ['reused', source], ['result', 'pass']]) })
      fields = undefined
    } else if (line.startsWith('### Verification Block')) {
      fields = new Map()
      blocks.push({ citation: false, fields })
    } else if (line.startsWith('### ')) {
      fields = undefined
    } else if (fields) {
      readField(line, fields)
    }
  }
  return blocks
}
