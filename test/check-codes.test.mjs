import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** Every finding code the checker scripts can report. */
function sourceCodes() {
  const codes = new Set()
  const call = /report\(\s*(?:'(?:error|warning)'|level|status === 'completed' \? 'error' : 'warning')\s*,\s*'([a-z][a-z0-9-]*)'/g
  for (const file of readdirSync(root('scripts')).filter((name) => name.endsWith('.mjs'))) {
    for (const match of readFileSync(root(`scripts/${file}`), 'utf8').matchAll(call)) codes.add(match[1])
  }
  return codes
}

/** Every code named in the first column of the "Resolving checker findings" table. */
function documentedCodes() {
  const text = readFileSync(root('references/task-record.md'), 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('## Resolving checker findings')
  assert.notEqual(start, -1, 'the findings section is missing')
  const section = text.slice(start).split(/\n## /)[0]
  const codes = new Set()
  for (const line of section.split('\n')) {
    if (!line.startsWith('| `')) continue
    for (const match of line.split('|')[1].matchAll(/`([a-z][a-z0-9-]*)`/g)) codes.add(match[1])
  }
  return codes
}

test('the scripts report a meaningful set of codes', () => {
  assert.ok(sourceCodes().size > 40)
})

test('every code the checker can report is documented', () => {
  const documented = documentedCodes()
  const missing = [...sourceCodes()].filter((code) => !documented.has(code)).sort()
  assert.deepEqual(missing, [], `add these codes to "Resolving checker findings" in references/task-record.md`)
})

test('the documentation does not name codes the checker never reports', () => {
  const source = sourceCodes()
  const stale = [...documentedCodes()].filter((code) => !source.has(code)).sort()
  assert.deepEqual(stale, [], 'remove these codes from "Resolving checker findings"')
})
