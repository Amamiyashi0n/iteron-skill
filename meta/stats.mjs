#!/usr/bin/env node
/**
 * Process-efficiency comparison between bench batches (pass rate is reported by bench.mjs).
 *   node meta/stats.mjs <batchDir> [<batchDir> ...]
 * Per batch: tool calls, steps, fresh tokens (input+output), cache-read tokens, wall time, and how many calls
 * went to process overhead (reading the skill's docs/scripts, hand-editing records, running the checker).
 * The first batch is the reference; others get a scenario-stratified bootstrap CI of the mean ratio.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const parse = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })

function runMetrics(runDir) {
  const result = JSON.parse(readFileSync(join(runDir, 'result.json'), 'utf8'))
  let events = []
  for (let i = 1; existsSync(join(runDir, `events-${i}.jsonl`)); i++) events = events.concat(parse(join(runDir, `events-${i}.jsonl`)))
  const calls = events.filter((e) => e.type === 'tool_call')
  const text = (c) => JSON.stringify(c.input ?? {})
  const m = {
    scenario: result.scenario, pass: result.pass, valid: result.valid,
    calls: calls.length,
    steps: result.sessions.reduce((a, s) => a + s.steps, 0),
    fresh: result.sessions.reduce((a, s) => a + s.usage.inputTokens + s.usage.outputTokens, 0),
    cache: result.sessions.reduce((a, s) => a + s.usage.cacheReadTokens, 0),
    sec: result.sessions.reduce((a, s) => a + s.ms, 0) / 1000,
    docRead: 0, scriptSource: 0, handEdit: 0, checker: 0,
  }
  for (const c of calls) {
    const s = text(c)
    const runsNode = /node [^"]*scripts\/[a-z-]+\.mjs/.test(s)
    if (/iteron-skill/.test(s) && /(SKILL\.md|task-record\.md|templates)/.test(s) && !runsNode) m.docRead++
    if (/iteron-skill[^"]*scripts\/[a-z-]+\.mjs/.test(s) && !runsNode) m.scriptSource++
    if (/check-records/.test(s) && runsNode) m.checker++
    if (/(python3|edit|write|sed -i|cat >)/.test(c.tool + s) && /\.agent\/|plan\.md|records\.md|notes\.md|agent\.md/.test(s) && !runsNode) m.handEdit++
  }
  return m
}

function batch(dir) {
  const meta = existsSync(join(dir, 'batch.json')) ? JSON.parse(readFileSync(join(dir, 'batch.json'), 'utf8')) : {}
  const runs = readdirSync(dir).filter((e) => existsSync(join(dir, e, 'result.json'))).map((e) => runMetrics(join(dir, e))).filter((r) => r.valid)
  return { name: meta.variant ?? basename(dir), runs }
}

const KEYS = ['calls', 'steps', 'fresh', 'cache', 'sec', 'docRead', 'scriptSource', 'handEdit', 'checker']
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

/** Mean over scenarios of each scenario's mean, so scenarios weigh equally. */
const stratMean = (runs, key, scenarios) => mean(scenarios.map((sc) => mean(runs.filter((r) => r.scenario === sc).map((r) => r[key]))))

function bootstrapRatio(ref, alt, key, scenarios, iters = 2000) {
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)]
  const ratios = []
  for (let i = 0; i < iters; i++) {
    const sample = (runs) => scenarios.map((sc) => { const xs = runs.filter((r) => r.scenario === sc); return mean(xs.map(() => pick(xs)[key])) })
    ratios.push(mean(sample(alt)) / mean(sample(ref)))
  }
  ratios.sort((a, b) => a - b)
  return [ratios[Math.floor(iters * 0.025)], ratios[Math.floor(iters * 0.975)]]
}

const batches = process.argv.slice(2).map((d) => batch(resolve(d)))
if (batches.length === 0) { console.error('usage: stats.mjs <batchDir...>'); process.exit(2) }
const scenarios = [...new Set(batches[0].runs.map((r) => r.scenario))].filter((sc) => batches.every((b) => b.runs.some((r) => r.scenario === sc))).sort()
console.log(`scenarios compared: ${scenarios.length} (${scenarios.join(', ')})\n`)
console.log(`| metric (scenario-weighted mean) | ${batches.map((b) => `${b.name} (n=${b.runs.filter((r) => scenarios.includes(r.scenario)).length})`).join(' | ')} |`)
console.log(`| --- | ${batches.map(() => '---').join(' | ')} |`)
const passRow = batches.map((b) => { const rs = b.runs.filter((r) => scenarios.includes(r.scenario)); return `${rs.filter((r) => r.pass).length}/${rs.length}` })
console.log(`| pass | ${passRow.join(' | ')} |`)
for (const key of KEYS) {
  const ref = batches[0]
  const cells = batches.map((b, i) => {
    const v = stratMean(b.runs, key, scenarios)
    if (i === 0) return v.toFixed(key === 'sec' ? 0 : 1)
    const [lo, hi] = bootstrapRatio(ref.runs, b.runs, key, scenarios)
    return `${v.toFixed(key === 'sec' ? 0 : 1)} (×${(v / stratMean(ref.runs, key, scenarios)).toFixed(2)}, CI ${lo.toFixed(2)}–${hi.toFixed(2)})`
  })
  console.log(`| ${key} | ${cells.join(' | ')} |`)
}
console.log('\nper-scenario median calls:')
for (const sc of scenarios) console.log(`  ${sc.padEnd(26)} ${batches.map((b) => `${b.name}=${median(b.runs.filter((r) => r.scenario === sc).map((r) => r.calls))}`).join('  ')}`)
