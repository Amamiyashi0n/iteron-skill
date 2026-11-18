import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseSkillFile } from '../index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = ['SKILL.md', 'README.md', 'references/task-record.md', 'templates/README.md']

test('parses frontmatter with quotes, BOM and CRLF', () => {
  const crlf = parseSkillFile('---\r\nname: demo\r\ndescription: "Quoted value"\r\n---\r\nBody\r\n')
  assert.equal(crlf.fields.name, 'demo')
  assert.equal(crlf.fields.description, 'Quoted value')
  assert.equal(crlf.body, 'Body\r\n')
  const bom = parseSkillFile('\uFEFF---\nname: a\ndescription: b\n---\n')
  assert.equal(bom.fields.name, 'a')
})

test('rejects missing frontmatter and required fields', () => {
  assert.throws(() => parseSkillFile('# no frontmatter'), /missing YAML frontmatter/)
  assert.throws(() => parseSkillFile('---\nname: a\n---\n'), /needs name and description/)
})

test('the shipped SKILL.md uses portable Agent Skills metadata', () => {
  const { fields, body } = parseSkillFile(readFileSync(join(ROOT, 'SKILL.md'), 'utf8'))
  assert.equal(fields.name, 'iteron-skill')
  assert.deepEqual(Object.keys(fields).sort(), ['description', 'name'])
  assert.match(fields.description, /staged work/)
  assert.match(body, /^\s*# Iteron/)
})

test('relative links in the skill docs resolve', () => {
  for (const doc of DOCS) {
    const path = join(ROOT, doc)
    const text = readFileSync(path, 'utf8').replace(/```[\s\S]*?```/g, '')
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const file = join(dirname(path), target.split('#')[0])
      assert.ok(existsSync(file), `${doc} links to missing ${target}`)
    }
  }
})

test('rejects frontmatter shapes the parser cannot read', () => {
  assert.throws(() => parseSkillFile('---\nname: a\ndescription: >\n  folded\n---\n'), /block scalar/)
  assert.throws(() => parseSkillFile('---\nname: a\ndescription: b\n  continued\n---\n'), /continuation/)
})
