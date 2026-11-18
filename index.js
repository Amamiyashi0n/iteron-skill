/**
 * Iteron skill provider.
 *
 * Registers the `iteron-skill` skill on `ctx.skills`. SKILL.md is the single
 * source of truth: its frontmatter supplies the catalog entry and its body is
 * re-read on every load, so edits to SKILL.md need no rebuild.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const name = 'iteron-skill'
// Same rank as other bundled skills (BUNDLED_SKILL_RANK in @deepseek-ai/dsh-skill).
const BUNDLED_SKILL_RANK = 600
const SKILL_URL = new URL('./SKILL.md', import.meta.url)
const SKILL_PATH = fileURLToPath(SKILL_URL)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('./', import.meta.url)),
}

/** Split `---` YAML frontmatter from the body; supports flat `key: value` lines. */
export function parseSkillFile(text) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter')
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!field) {
      if (/^\s+\S/.test(line)) throw new Error('SKILL.md frontmatter: indented continuation lines are not supported')
      continue
    }
    let value = field[2].trim()
    if (/^[>|][+-]?$/.test(value)) {
      throw new Error(`SKILL.md frontmatter: ${field[1]} uses a block scalar; write the value on one line`)
    }
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    fields[field[1]] = value
  }
  if (!fields.name || !fields.description) {
    throw new Error('SKILL.md frontmatter needs name and description')
  }
  return { fields, body: text.slice(match[0].length) }
}

async function loadSkill() {
  return parseSkillFile(await readFile(SKILL_URL, 'utf8'))
}

function skillMetadata(fields) {
  return {
    name: fields.name,
    description: fields.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: name,
    source: 'bundled',
    path: SKILL_PATH,
    resourceBase: RESOURCE_BASE,
  }
}

const provider = {
  name: name,
  async list() {
    const { fields } = await loadSkill()
    return [{ ...skillMetadata(fields), rank: BUNDLED_SKILL_RANK, locator: SKILL_URL }]
  },
  async get() {
    const { fields, body } = await loadSkill()
    return { ...skillMetadata(fields), content: body }
  },
}

/** Service required by the provider. */
export const inject = ['skills']

/** Register the Iteron skill provider on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
