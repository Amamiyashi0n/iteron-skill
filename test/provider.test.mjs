import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply, inject, name } from '../index.js'

function register() {
  let provider
  apply({
    skills: {
      registerProvider(factory) {
        provider = factory()
      },
    },
  })
  return provider
}

test('the plugin declares its name and the service it needs', () => {
  assert.equal(name, 'iteron-skill')
  assert.deepEqual(inject, ['skills'])
})

test('list() returns one catalog entry built from SKILL.md', async () => {
  const [entry, ...rest] = await register().list()
  assert.equal(rest.length, 0)
  assert.equal(entry.name, 'iteron-skill')
  assert.equal(entry.provider, 'iteron-skill')
  assert.equal(entry.rank, 600)
  assert.deepEqual(entry.invocation, { modelInvocable: true, userInvocable: true })
  assert.ok(entry.description.length > 0)
  assert.ok(entry.whenToUse)
  assert.match(entry.path, /SKILL\.md$/)
})

test('get() returns the body without the frontmatter', async () => {
  const skill = await register().get()
  assert.equal(skill.name, 'iteron-skill')
  assert.match(skill.content, /^\s*# Iteron/)
  assert.ok(!skill.content.includes('whenToUse:'))
})

test('resourceBase points at the package directory', async () => {
  const [entry] = await register().list()
  assert.equal(entry.resourceBase.kind, 'directory')
  assert.ok(existsSync(join(entry.resourceBase.path, 'SKILL.md')))
})
