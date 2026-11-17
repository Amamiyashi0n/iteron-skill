/**
 * Iteron skill provider.
 *
 * Registers the `iteron-skill` skill on `ctx.skills`. SKILL.md is the single
 * source of truth: its frontmatter supplies the catalog entry and its body is
 * re-read on every load, so edits to SKILL.md need no rebuild.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PROVIDER_NAME = 'iteron-skill'
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
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    fields[m[1]] = value
  }
  if (!fields.name || !fields.description) {
    throw new Error('SKILL.md frontmatter needs name and description')
  }
  return { fields, body: text.slice(match[0].length) }
}

async function loadSkill() {
  return parseSkillFile(await readFile(SKILL_URL, 'utf8'))
}

function summaryOf(fields) {
  return {
    name: fields.name,
    description: fields.description,
    ...(fields.whenToUse ? { whenToUse: fields.whenToUse } : {}),
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    path: SKILL_PATH,
    resourceBase: RESOURCE_BASE,
  }
}

const provider = {
  name: PROVIDER_NAME,
  async list() {
    const { fields } = await loadSkill()
    return [{ ...summaryOf(fields), rank: BUNDLED_SKILL_RANK, locator: SKILL_URL }]
  },
  async get() {
    const { fields, body } = await loadSkill()
    return { ...summaryOf(fields), content: body }
  },
}

/** Cordis plugin name. */
export const name = 'iteron-skill'
/** Service required by the provider. */
export const inject = ['skills']

/** Register the Iteron skill provider on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
