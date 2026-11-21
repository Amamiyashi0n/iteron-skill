import { readFileSync } from 'node:fs'

const RECORD_HEADING = /^## (\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?) \/ (.+)$/
const ANCHOR = /<a name="([^"]+)"><\/a>/g

export function readLines(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

export function readMarkdownLink(text = '') {
  const match = /\[[^\]]*\]\(([^#)]*)(?:#([^\s)]+))?\)/.exec(text)
  if (!match) return undefined
  return { path: match[1], anchor: match[2] }
}

/** Splits a table row into cells. A pipe written as `\|` or placed in a code span stays inside its cell. */
export function splitCells(line) {
  const split = (protectCode) => {
    const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
    const cells = []
    let current = ''
    let inCode = false
    for (let i = 0; i < body.length; i++) {
      const char = body[i]
      if (char === '\\' && body[i + 1] === '|') {
        current += '|'
        i++
      } else if (char === '`' && protectCode) {
        inCode = !inCode
        current += char
      } else if (char === '|' && !inCode) {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current.trim())
    return { cells, open: inCode }
  }
  const protectedSplit = split(true)
  return protectedSplit.open ? split(false).cells : protectedSplit.cells
}

/** Cells of the table whose header row starts with `firstColumn`. Rows with extra cells are listed in `overflow`. */
export function parseTable(lines, firstColumn) {
  const start = lines.findIndex((line, i) =>
    line.trim().startsWith('|') &&
    splitCells(line)[0] === firstColumn &&
    (lines[i + 1] ?? '').trim().startsWith('|'),
  )
  if (start < 0) return { headers: [], rows: [], overflow: [] }
  const headers = splitCells(lines[start])
  const rows = []
  const overflow = []
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = splitCells(lines[i])
    if (cells.length > headers.length) overflow.push({ line: i + 1, cells: cells.length })
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
  }
  return { headers, rows, overflow }
}

/** Reports a missing table or required columns that its header row lacks. */
export function checkColumns(table, required, label, location, report) {
  if (!table.headers.length) return report('error', 'table-missing', location, `${label} table is missing`)
  for (const column of required) {
    if (!table.headers.includes(column)) report('error', 'table-column-missing', location, `${label} table has no ${column} column`)
  }
  for (const { line, cells } of table.overflow ?? []) {
    report('error', 'table-row-columns', `${location}:${line}`, `${label} row has ${cells} cells but the header has ${table.headers.length}; write a literal pipe as \\| or put it in a code span`)
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
