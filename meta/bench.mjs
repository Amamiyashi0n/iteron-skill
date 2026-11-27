#!/usr/bin/env node
/**
 * Iteron optimisation bench: runs scenarios against a packed copy of the skill in an
 * isolated DeepSeek Harness profile, grades them with a FROZEN grader, and flags runs
 * whose tool calls touched anything outside their own work directory.
 *
 *   node meta/bench.mjs run --variant <label> [--pack <dir>] --scenarios a,b|all [--suite <module>] [--n 4] [--jobs 4]
 *   node meta/bench.mjs report <batchDir...>
 *
 * Nothing here is shipped: `meta/` is not in package.json `files`, so `npm pack` leaves it out.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOME = process.env.ITERON_EVAL_HOME ?? join(homedir(), '.iteron-eval')
const DSH_HOME = join(HOME, 'dsh-home')
const FROZEN = join(HOME, 'frozen') // grader + checker from the baseline commit; the optimiser never edits it
const KEY_FILE = join(homedir(), '.config', 'iteron-eval', 'deepseek.key')
const TEMPLATE_PROFILE = join(DSH_HOME, 'profiles', 'iteron-eval')
const SESSION_TIMEOUT_MS = Number(process.env.ITERON_SESSION_TIMEOUT_MS ?? 20 * 60 * 1000)

const arg = (args, name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : args[at + 1]
}

/** Pack the skill at `packDir` and install it into a per-variant profile that sees no other skill. */
function prepareProfile(label, packDir) {
  const profile = `iteron-eval-${label}`
  const dir = join(DSH_HOME, 'profiles', profile)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const file of ['cordis.yml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) copyFileSync(join(TEMPLATE_PROFILE, file), join(dir, file))
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${profile}`, private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } },
  }, null, 2)}\n`)
  const pkgDir = join(HOME, 'pkgs', label)
  rmSync(pkgDir, { recursive: true, force: true })
  mkdirSync(pkgDir, { recursive: true })
  const pack = spawnSync('npm', ['pack', '--silent', '--pack-destination', pkgDir], { cwd: packDir, encoding: 'utf8' })
  if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`)
  const tgz = join(pkgDir, pack.stdout.trim().split('\n').pop())
  const add = spawnSync('dsh', ['plugin', '--profile', profile, 'add', `file:${tgz}`], { cwd: dir, encoding: 'utf8', env: { ...process.env, DSH_HOME } })
  if (add.status !== 0) throw new Error(`plugin add failed: ${add.stdout}\n${add.stderr}`)
  const installed = join(dir, 'node_modules', '@local', 'iteron-skill')
  if (existsSync(join(installed, 'evals')) || existsSync(join(installed, 'meta'))) throw new Error('the installed skill copy contains eval material')
  return { profile, installed }
}

/** Builtin scenarios use the frozen evals/run.mjs; a suite module may add more with its own setup/grade. */
async function loadSuite(suitePath) {
  const run = await import(pathToFileURL(join(FROZEN, 'evals', 'run.mjs')).href)
  const scenarios = run.loadScenarios().map((scenario) => ({
    id: scenario.id,
    sessions: [{ prompt: scenario.prompt }],
    setup: (root, baselineFile) => run.setup(scenario.id, root, baselineFile).baseline,
    grade: (root, baseline) => run.grade(scenario, root, baseline),
  }))
  if (suitePath) {
    const extra = await import(pathToFileURL(resolve(suitePath)).href)
    scenarios.push(...extra.scenarios)
  }
  return scenarios
}

function runSession({ profile, cwd, prompt, eventsPath, killAfterToolCalls }) {
  return new Promise((done) => {
    const started = Date.now()
    const child = spawn('dsh', ['--profile', profile, '--json', '--permission-mode', 'workspace-write', '--approval-policy', 'never', '-'], {
      cwd, env: { ...process.env, DSH_HOME, DEEPSEEK_API_KEY: readFileSync(KEY_FILE, 'utf8').trim() },
    })
    let out = ''
    let toolCalls = 0
    let killed = null
    const timer = setTimeout(() => { killed = 'timeout'; child.kill('SIGTERM') }, SESSION_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => {
      out += chunk
      if (killAfterToolCalls) {
        toolCalls = (out.match(/"type":"tool_result"/g) ?? []).length
        if (toolCalls >= killAfterToolCalls && !killed) { killed = 'interrupted'; child.kill('SIGTERM') }
      }
    })
    let err = ''
    child.stderr.on('data', (chunk) => { err += chunk })
    child.stdin.end(prompt)
    child.on('close', (code) => {
      clearTimeout(timer)
      writeFileSync(eventsPath, out)
      writeFileSync(`${eventsPath}.stderr`, err)
      done({ code, killed, ms: Date.now() - started })
    })
  })
}

/** Paths a run may touch: its work dir, the installed skill, and ordinary system locations. */
function auditEvents(events, workDir, installed) {
  const forbidden = [/iteron-work/, /\.iteron-eval\/(runs|frozen|pkgs|heldout)/, /baseline\.json/, /\/evals\//, /scenarios\.json/, /fixtures\.mjs/]
  const allowedPrefixes = [workDir, installed, '/usr/', '/bin/', '/etc/', '/proc/', '/dev/null', '/tmp/']
  const violations = []
  const outside = new Set()
  for (const event of events) {
    if (event.type !== 'tool_call') continue
    const text = JSON.stringify(event.input ?? {}).replace(new RegExp(workDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<work>')
    for (const pattern of forbidden) if (pattern.test(text.replaceAll(installed, '<skill>'))) violations.push(`${event.tool}: ${pattern}`)
    for (const path of text.match(/\/home\/[^\s"'`\\]+/g) ?? []) if (!allowedPrefixes.some((prefix) => path.startsWith(prefix))) outside.add(path)
  }
  return { valid: violations.length === 0, violations, outside: [...outside] }
}

function summarise(events) {
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let steps = 0
  const tools = {}
  let skillLoaded = false
  for (const event of events) {
    if (event.type === 'status' && event.phase === 'step_end' && event.usage) {
      steps++
      for (const key of Object.keys(usage)) usage[key] += event.usage[key] ?? 0
    }
    if (event.type === 'tool_call') {
      tools[event.tool] = (tools[event.tool] ?? 0) + 1
      if (/skill/.test(event.tool) && JSON.stringify(event.input).includes('iteron-skill')) skillLoaded = true
    }
  }
  const final = events.findLast((event) => event.type === 'final')
  return { steps, usage, tools, skillLoaded, finalText: final?.text ?? null, finalReason: final?.reason?.kind ?? null }
}

const parseEvents = (path) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } }) : [])

async function runOne({ scenario, index, batchDir, profile, installed }) {
  const runDir = join(batchDir, `${scenario.id}-${index}`)
  const work = join(runDir, 'work')
  mkdirSync(work, { recursive: true })
  const baselineFile = join(runDir, 'baseline.json')
  const baseline = (await scenario.setup(work, baselineFile)) ?? {}
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2))
  const sessions = []
  for (const [i, session] of scenario.sessions.entries()) {
    const eventsPath = join(runDir, `events-${i + 1}.jsonl`)
    const result = await runSession({ profile, cwd: work, prompt: session.prompt, eventsPath, killAfterToolCalls: session.killAfterToolCalls })
    const events = parseEvents(eventsPath)
    sessions.push({ ...result, ...summarise(events), audit: auditEvents(events, work, installed) })
  }
  let graded
  try {
    graded = await scenario.grade(work, baseline)
  } catch (error) {
    graded = { pass: false, checks: [{ name: 'grader crashed', ok: false, detail: String(error) }] }
  }
  const valid = sessions.every((session) => session.audit.valid)
  const record = { scenario: scenario.id, index, pass: graded.pass, valid, checks: graded.checks, sessions }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(record, null, 2))
  const failed = graded.checks.filter((check) => !check.ok).map((check) => check.name)
  console.log(`${valid ? '' : '[INVALID] '}${graded.pass ? 'PASS' : 'FAIL'}  ${scenario.id}#${index}  ${Math.round(sessions.reduce((a, s) => a + s.ms, 0) / 1000)}s${failed.length ? `  -> ${failed.join('; ')}` : ''}`)
  return record
}

async function pool(tasks, jobs) {
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]
      results.push(await task())
    }
  }))
  return results
}

const wilson = (k, n, z = 1.96) => {
  if (!n) return [0, 0]
  const p = k / n
  const centre = (p + z * z / (2 * n)) / (1 + z * z / n)
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export function report(batchDirs) {
  const rows = new Map()
  for (const batchDir of batchDirs) {
    const meta = existsSync(join(batchDir, 'batch.json')) ? JSON.parse(readFileSync(join(batchDir, 'batch.json'), 'utf8')) : { variant: basename(batchDir) }
    for (const entry of readdirSync(batchDir)) {
      const path = join(batchDir, entry, 'result.json')
      if (!existsSync(path)) continue
      const result = JSON.parse(readFileSync(path, 'utf8'))
      const key = `${meta.variant}\t${result.scenario}`
      const row = rows.get(key) ?? { variant: meta.variant, scenario: result.scenario, n: 0, pass: 0, invalid: 0, tokens: [], fails: {} }
      if (!result.valid) { row.invalid++; rows.set(key, row); continue }
      row.n++
      if (result.pass) row.pass++
      row.tokens.push(result.sessions.reduce((a, s) => a + s.usage.inputTokens + s.usage.outputTokens + s.usage.cacheReadTokens, 0))
      for (const check of result.checks) if (!check.ok) row.fails[check.name] = (row.fails[check.name] ?? 0) + 1
      rows.set(key, row)
    }
  }
  const lines = ['| variant | scenario | pass/valid | 95% CI | invalid | median tokens | failing checks |', '| --- | --- | --- | --- | --- | --- | --- |']
  const totals = new Map()
  for (const row of [...rows.values()].sort((a, b) => a.variant.localeCompare(b.variant) || a.scenario.localeCompare(b.scenario))) {
    const [lo, hi] = wilson(row.pass, row.n)
    const sorted = [...row.tokens].sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
    lines.push(`| ${row.variant} | ${row.scenario} | ${row.pass}/${row.n} | ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}% | ${row.invalid} | ${median} | ${Object.entries(row.fails).map(([k, v]) => `${k} ×${v}`).join('; ')} |`)
    const total = totals.get(row.variant) ?? { pass: 0, n: 0 }
    total.pass += row.pass
    total.n += row.n
    totals.set(row.variant, total)
  }
  lines.push('', '| variant | total pass/valid | 95% CI |', '| --- | --- | --- |')
  for (const [variant, total] of totals) {
    const [lo, hi] = wilson(total.pass, total.n)
    lines.push(`| ${variant} | ${total.pass}/${total.n} | ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}% |`)
  }
  return lines.join('\n')
}

async function main(args) {
  const [command] = args
  if (command === 'report') {
    console.log(report(args.slice(1).filter((a) => !a.startsWith('--')).map((dir) => resolve(dir))))
    return 0
  }
  if (command !== 'run') {
    console.error('usage: bench.mjs run --variant <label> [--pack <dir>] --scenarios <ids|all> [--suite <module>] [--n 4] [--jobs 4] | report <batchDir...>')
    return 2
  }
  const variant = arg(args, 'variant')
  if (!variant || !/^[a-z0-9-]+$/.test(variant)) throw new Error('--variant <label> (lowercase, digits, dashes) is required')
  const packDir = resolve(arg(args, 'pack', '.'))
  const n = Number(arg(args, 'n', '4'))
  const jobs = Number(arg(args, 'jobs', '4'))
  const suite = await loadSuite(arg(args, 'suite'))
  const wanted = arg(args, 'scenarios', 'all')
  const selected = wanted === 'all' ? suite : wanted.split(',').map((id) => suite.find((s) => s.id === id) ?? (() => { throw new Error(`unknown scenario ${id}`) })())
  const { profile, installed } = prepareProfile(variant, packDir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const batchDir = join(HOME, 'runs', `${stamp}-${variant}`)
  mkdirSync(batchDir, { recursive: true })
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: packDir, encoding: 'utf8' }).stdout.trim()
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: packDir, encoding: 'utf8' }).stdout.trim() !== ''
  writeFileSync(join(batchDir, 'batch.json'), JSON.stringify({ variant, commit, dirty, scenarios: selected.map((s) => s.id), n, startedAt: new Date().toISOString() }, null, 2))
  console.log(`batch ${batchDir}\nprofile ${profile} (skill from ${packDir} @ ${commit}${dirty ? ' + uncommitted changes' : ''})`)
  const tasks = selected.flatMap((scenario) => Array.from({ length: n }, (_, i) => () => runOne({ scenario, index: i + 1, batchDir, profile, installed })))
  await pool(tasks, jobs)
  const table = report([batchDir])
  writeFileSync(join(batchDir, 'report.md'), `${table}\n`)
  console.log(`\n${table}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => { console.error(error); process.exitCode = 1 })
}
