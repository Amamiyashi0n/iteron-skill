/**
 * Dev scenarios for optimising Iteron (visible to the optimiser; the held-out suite lives outside the repo).
 * Each scenario: { id, sessions: [{ prompt, killAfterToolCalls? }], setup(root, baselineFile) -> baseline, grade(root, baseline) }.
 * Graders import only the FROZEN checker and helpers under ~/.iteron-eval/frozen.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FROZEN = join(process.env.ITERON_EVAL_HOME ?? join(homedir(), '.iteron-eval'), 'frozen')
const frozen = (path) => import(pathToFileURL(join(FROZEN, path)).href)
const { checkRoot } = await frozen('scripts/check-records.mjs')
const { createTask } = await frozen('scripts/new-task.mjs')
const { addStage } = await frozen('scripts/add-stage.mjs')
const { seedExportBug, buildInProgress } = await frozen('evals/fixtures.mjs')

const FIXED = new Date('2026-01-15T08:30:12Z')

// ---------- helpers ----------
function git(root, ...args) {
  const run = spawnSync('git', args, {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'dev', GIT_AUTHOR_EMAIL: 'dev@example.com', GIT_COMMITTER_NAME: 'dev', GIT_COMMITTER_EMAIL: 'dev@example.com', GIT_AUTHOR_DATE: '2026-01-15T08:00:00Z', GIT_COMMITTER_DATE: '2026-01-15T08:00:00Z' },
  })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}
function gitInit(root, message = 'initial') {
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}
const write = (root, path, text) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}
const node = (root, args, input) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 20000, input })

function taskDirs(root) {
  const found = []
  for (const base of ['.agent', 'agent']) {
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const id = /^(.+)-plan$/.exec(entry.name)?.[1]
      if (id && entry.isDirectory()) found.push({ id, dir: join(dir, entry.name) })
    }
  }
  return found
}
function readTask(root, id) {
  const task = taskDirs(root).find((t) => t.id === id)
  if (!task || !existsSync(join(task.dir, 'plan.md'))) return undefined
  const plan = readFileSync(join(task.dir, 'plan.md'), 'utf8').replace(/\r\n/g, '\n')
  const field = (key) => new RegExp(`^- ${key}: \`?([^\`\\n]+)\`?\\s*$`, 'm').exec(plan)?.[1].trim()
  const lines = plan.split('\n')
  const headerAt = lines.findIndex((line) => /^\|\s*item_id\s*\|/.test(line))
  const split = (line) => line.split(/(?<!\\)\|/).map((c) => c.trim())
  const headers = headerAt === -1 ? [] : split(lines[headerAt])
  const items = new Map()
  for (const line of headerAt === -1 ? [] : lines.slice(headerAt + 2)) {
    if (!line.startsWith('|')) continue
    const cells = split(line)
    items.set(cells[headers.indexOf('item_id')], { status: cells[headers.indexOf('status')], ref: cells[headers.indexOf('acceptance_ref')] })
  }
  const recordsPath = join(task.dir, 'stages', 'records.md')
  const records = existsSync(recordsPath) ? readFileSync(recordsPath, 'utf8').replace(/\r\n/g, '\n') : ''
  const attempts = {}
  for (const m of records.matchAll(/^## \S+ \/ (T-\d+|overall) \/ \d+\s*$/gm)) attempts[m[1]] = (attempts[m[1]] ?? 0) + 1
  return { id, dir: task.dir, plan, records, items, attempts, status: field('status'), planTimestamp: field('plan_timestamp') }
}
/** Sections of records.md keyed by heading. */
function sections(records) {
  const out = []
  const parts = records.split(/^(?=## )/m)
  for (const part of parts) {
    const heading = /^## (.*)$/m.exec(part)?.[1]
    if (heading) out.push({ heading: heading.trim(), body: part })
  }
  return out
}
function checker(root, add) {
  const errors = checkRoot(root).issues.filter((i) => i.level === 'error')
  add('the frozen checker reports no errors', errors.length === 0, errors.map((i) => `${i.code} @ ${i.where}`).join('; '))
}
const grader = () => {
  const checks = []
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 300) })
  return { checks, add, done: () => ({ pass: checks.every((c) => c.ok), checks }) }
}

// ---------- d1: two bugs in a git repo, real revisions expected ----------
const CSV_JS = `export function parseCsv(text) {
  const [header, ...rows] = text.trim().split('\\n')
  const keys = header.split(',')
  return rows.map((line) => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])))
}
`
const REPORT_JS = `import { readFileSync } from 'node:fs'
import { parseCsv } from './csv.js'

const [, , input = 'items.csv'] = process.argv
const items = parseCsv(readFileSync(input, 'utf8'))
let grand = 0
for (const item of items) {
  const total = Math.floor(Number(item.qty) * Number(item.price) * 100) / 100
  grand += total
  console.log(JSON.stringify({ sku: item.sku, total: total.toFixed(2) }))
}
console.log(JSON.stringify({ grand: grand.toFixed(2) }))
`
const ITEMS = 'sku,name,qty,price\nA1,Widget,3,19.99\nB2,"Bolt, large",10,0.35\nC3,Nut,7,1.10\n'
const HIDDEN_ITEMS = [['K9', 'Cable, 2m, braided', 3, '0.29'], ['M4', 'Mouse', 1, '24.10'], ['Z1', 'Pad, XL, black', 9, '1.15'], ['Q7', 'Hub', 3, '33.33']]
function d1Expected() {
  let grand = 0
  const lines = HIDDEN_ITEMS.map(([sku, , qty, price]) => {
    const cents = qty * Math.round(Number(price) * 100)
    grand += cents
    return JSON.stringify({ sku, total: (cents / 100).toFixed(2) })
  })
  return [...lines, JSON.stringify({ grand: (grand / 100).toFixed(2) })]
}
const d1 = {
  id: 'd1-git-two-bugs',
  sessions: [{ prompt: '用 Iteron 分阶段修复 src/report.js 的两个问题：1）商品名里带逗号时（用双引号括起来）这一行会解析错列；2）金额合计有时会少一分钱。两个问题分别验收，用 items.csv 验证，最后整体验收并关闭任务。这个目录是 git 仓库，修复请提交。' }],
  setup(root) {
    write(root, 'package.json', '{\n  "name": "inventory-report",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n')
    write(root, 'src/csv.js', CSV_JS)
    write(root, 'src/report.js', REPORT_JS)
    write(root, 'items.csv', ITEMS)
    write(root, 'test/report.test.js', "import assert from 'node:assert/strict'\nimport { test } from 'node:test'\nimport { parseCsv } from '../src/csv.js'\n\ntest('parses a simple row', () => {\n  assert.deepEqual(parseCsv('sku,qty\\nC3,7\\n'), [{ sku: 'C3', qty: '7' }])\n})\n")
    write(root, 'README.md', '# inventory-report\n\n`node src/report.js items.csv` prints one JSON line per item with its total, then the grand total.\n')
    const head = gitInit(root)
    return { head }
  },
  grade(root, baseline) {
    const g = grader()
    const csv = ['sku,name,qty,price', ...HIDDEN_ITEMS.map(([sku, name, qty, price]) => [sku, `"${name.replaceAll('"', '""')}"`, qty, price].join(','))].join('\n') + '\n'
    writeFileSync(join(root, '.hidden-items.csv'), csv)
    const run = node(root, ['src/report.js', '.hidden-items.csv'])
    spawnSync('rm', ['-f', join(root, '.hidden-items.csv')])
    const got = run.status === 0 ? run.stdout.trim().split('\n') : [`error: ${run.stderr}`]
    g.add('report is correct on hidden items (quoted commas, cents)', JSON.stringify(got) === JSON.stringify(d1Expected()), got.join(' / '))
    checker(root, g.add)
    const tasks = taskDirs(root)
    g.add('exactly one task', tasks.length === 1, `found ${tasks.length}`)
    const task = tasks[0] && readTask(root, tasks[0].id)
    g.add('task is completed', task?.status === 'completed', task?.status)
    g.add('at least two plan items', (task?.items.size ?? 0) >= 2, task?.items.size)
    const commits = Number(git(root, 'rev-list', '--count', 'HEAD'))
    g.add('the fix was committed', commits > 1, `commits: ${commits}`)
    // Every passing item attempt cited by acceptance_ref must record a revision that really identifies the tested state.
    const bad = []
    for (const [itemId, item] of task?.items ?? []) {
      const anchor = /#(stage-[^)\s]+)/.exec(item.ref ?? '')?.[1]
      const section = sections(task.records).find((s) => s.body.includes(`name="${anchor}"`) || s.heading.endsWith(`/ ${itemId} / ${anchor?.split('-').pop()}`))
      const revision = /^- revision: (.*)$/m.exec(section?.body ?? '')?.[1] ?? ''
      const hashes = revision.match(/\b[0-9a-f]{7,40}\b/g) ?? []
      const real = hashes.some((h) => spawnSync('git', ['cat-file', '-e', `${h}^{commit}`], { cwd: root }).status === 0) || /sha256/i.test(revision)
      if (!real) bad.push(`${itemId}: ${revision || 'missing'}`)
    }
    g.add('cited item attempts record a real commit or content hash', task && bad.length === 0, bad.join('; '))
    return g.done()
  },
}

// ---------- d2: resume after the input changed; stale evidence must not close the task ----------
const d2 = {
  id: 'd2-resume-input-changed',
  sessions: [{ prompt: '继续任务 2026-01-15_08-30-12，把剩下的条目做完，做总验收并关闭任务。' }],
  setup(root) {
    const { taskId } = buildInProgress(root)
    const first = gitInit(root, 'export demo with task records')
    // Point T-001's evidence at the real commit, then change the input it was checked on.
    const recordsPath = join(root, '.agent', `${taskId}-plan`, 'stages', 'records.md')
    writeFileSync(recordsPath, readFileSync(recordsPath, 'utf8').replace('abc1234, clean working tree', `${first.slice(0, 7)}, clean working tree`))
    git(root, 'commit', '-qam', 'record the real revision of T-001')
    writeFileSync(join(root, 'feed.csv'), 'id,amount\n1,100\n2,0\n3,250\n4,0\n5,75\n6,0\n7,-40\n8,12\n')
    git(root, 'commit', '-qam', 'feed: add batch 2 rows (refund and zero rows)')
    return { taskId }
  },
  grade(root, baseline) {
    const g = grader()
    const run = node(root, ['src/export.js', 'feed.csv'])
    const ids = run.status === 0 ? run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : null
    g.add('the export contains every row of the current feed', JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), ids)
    checker(root, g.add)
    const task = readTask(root, baseline.taskId)
    g.add('task is completed', task?.status === 'completed', task?.status)
    const overall = sections(task?.records ?? '').filter((s) => /\/ overall \/ \d+$/.test(s.heading)).pop()
    g.add('the closing overall stage checks O-1 directly on the current feed', /^- criteria: O-1\b/m.test(overall?.body ?? '') && /^- result: pass$/m.test(overall?.body ?? ''), overall ? overall.heading : 'no overall stage')
    g.add('exactly one task', taskDirs(root).length === 1, taskDirs(root).length)
    return g.done()
  },
}

// ---------- d3: interrupted session, resumed by a new one ----------
const DEDUPE_JS = `import { readFileSync } from 'node:fs'

const [, , input = 'emails.txt'] = process.argv
const seen = new Set()
for (const line of readFileSync(input, 'utf8').split('\\n')) {
  if (!line) continue
  if (seen.has(line)) continue
  seen.add(line)
  console.log(line)
}
`
const d3 = {
  id: 'd3-interrupted-resume',
  sessions: [
    { prompt: '用 Iteron 分阶段修复 src/dedupe.js：同一个邮箱如果只是大小写或首尾空格不同，也应该算重复，只保留第一次出现的那个（输出规范化成小写、去掉首尾空格）。先复现，再修复，然后用 emails.txt 验收，最后关闭任务。', killAfterToolCalls: 14 },
    { prompt: '上一个会话在修 src/dedupe.js 的时候中断了。请接着把这个任务做完并关闭。' },
  ],
  setup(root) {
    write(root, 'package.json', '{\n  "name": "dedupe",\n  "private": true,\n  "type": "module"\n}\n')
    write(root, 'src/dedupe.js', DEDUPE_JS)
    write(root, 'emails.txt', 'ann@example.com\nBob@Example.com\n  ann@example.com\nbob@example.com \ncarl@example.com\nANN@EXAMPLE.COM\n')
    gitInit(root)
    return {}
  },
  grade(root) {
    const g = grader()
    const hidden = 'Zed@x.io\nzed@x.io\n\n  amy@x.io\nAMY@X.IO  \nbo@x.io\nZED@X.IO\n'
    writeFileSync(join(root, '.hidden-emails.txt'), hidden)
    const run = node(root, ['src/dedupe.js', '.hidden-emails.txt'])
    spawnSync('rm', ['-f', join(root, '.hidden-emails.txt')])
    const got = run.status === 0 ? run.stdout.trim().split('\n') : [`error: ${run.stderr}`]
    g.add('dedupe is correct on hidden input', JSON.stringify(got) === JSON.stringify(['zed@x.io', 'amy@x.io', 'bo@x.io']), got.join(','))
    checker(root, g.add)
    const tasks = taskDirs(root)
    g.add('exactly one task (the resumed session did not start over)', tasks.length === 1, tasks.length)
    const task = tasks[0] && readTask(root, tasks[0].id)
    g.add('task is completed', task?.status === 'completed', task?.status)
    g.add('owner released', task && /^- owner: `?none`?\s*$/m.test(task.plan), /^- owner: .*$/m.exec(task?.plan ?? '')?.[0])
    return g.done()
  },
}

// ---------- d4: distilled method from a closed task should be found and reused ----------
const d4 = {
  id: 'd4-distill-reuse',
  sessions: [{ prompt: '用 Iteron 分阶段给项目加一个按月汇总：新建 src/monthly.js，读取 invoices.csv，按月份输出每个月的金额合计（每行一个 JSON：{"month":"YYYY-MM","total":数字}，按月份升序）。用 reference/monthly.json 验收，最后关闭任务。' }],
  setup(root) {
    write(root, 'package.json', '{\n  "name": "billing",\n  "private": true,\n  "type": "module"\n}\n')
    write(root, 'feed.csv', 'id,date,amount\n1,03/04/2026,10\n2,15/04/2026,5\n')
    write(root, 'src/export.js', "import { readFileSync } from 'node:fs'\nconst rows = readFileSync(process.argv[2] ?? 'feed.csv', 'utf8').trim().split('\\n').slice(1)\nfor (const line of rows) {\n  const [id, date, amount] = line.split(',')\n  const [d, m, y] = date.split('/')\n  console.log(JSON.stringify({ id: Number(id), date: `${y}-${m}-${d}`, amount: Number(amount) }))\n}\n")
    write(root, 'invoices.csv', 'id,date,amount\n1,03/04/2026,120\n2,12/04/2026,80\n3,04/03/2026,50\n4,30/03/2026,25\n5,01/05/2026,10\n')
    write(root, 'reference/monthly.json', '[{"month":"2026-03","total":75},{"month":"2026-04","total":200},{"month":"2026-05","total":10}]\n')
    // A closed earlier task with an active distilled method about the date format.
    const { taskId } = createTask(root, {
      title: 'Export feed dates as ISO', goal: 'Export feed rows with ISO dates', searchTerms: 'feed.csv, date format, DD/MM/YYYY, ISO date',
      criteria: ['Every feed date is exported as the right ISO date'],
      items: ['Convert feed dates|ISO dates in the export|Every exported date matches the day and month written in feed.csv'],
    }, FIXED)
    const stage = addStage(root, {
      task: taskId, item: 'T-001', complete: true, result: 'pass', delivery: 'Parsed dates as DD/MM/YYYY explicitly.',
      subject: 'feed.csv through src/export.js', method: 'Compared each exported date with the day and month written in feed.csv; 03/04/2026 must become 2026-04-03.',
      observed: 'Both rows match; Date.parse would have read 03/04 as March 4.', revision: 'feed.csv sha256 recorded at check time', checkedBy: 'author',
    })
    const dir = join(root, '.agent', `${taskId}-plan`)
    const ts = /^- plan_timestamp: `([^`]+)`/m.exec(readFileSync(join(dir, 'plan.md'), 'utf8'))[1]
    mkdirSync(join(dir, 'distillation'), { recursive: true })
    writeFileSync(join(dir, 'distillation', 'notes.md'), [
      '# Distillation', '', '[Current plan](../plan.md)', '',
      `<a name="distillation-${ts}-t-001-1"></a>`, '', `## ${ts} / T-001 / M-1`, '',
      '- title: Parse this project\'s CSV dates as DD/MM/YYYY',
      '- status: active',
      '- applies_when: A CSV in this project has a `date` column written as dd/mm/yyyy (day first), such as feed.csv.',
      '- route: Split the date on `/` and build the ISO date as year-month-day yourself. Never pass it to `new Date()` or `Date.parse`, which read it month first.',
      '- check: A date whose day is 12 or less, such as 03/04/2026, must come out as 2026-04-03.',
      `- source: [${ts} / T-001 / 1](../stages/records.md#${stage.anchor})`,
      '- search_terms: date format, DD/MM/YYYY, csv date, feed.csv, invoices', '',
    ].join('\n'))
    const overall = addStage(root, {
      task: taskId, overall: true, criteria: 'O-1 Every feed date is exported as the right ISO date', result: 'pass', delivery: 'The export.',
      subject: 'final export of feed.csv', method: 'Compared every exported date with feed.csv.', observed: 'All dates match.', revision: 'feed.csv sha256 recorded at check time',
    })
    let plan = readFileSync(join(dir, 'plan.md'), 'utf8')
    plan = plan.replace(/^- status: .*$/m, '- status: completed').replace(/^- owner: .*$/m, '- owner: `none`')
      .replace(/^- next_action: .*$/m, '- next_action: completed').replace(/^- confirmed: .*$/m, '- confirmed: T-001 and overall verified.')
      .replace(/^- overall_acceptance_ref: .*$/m, `- overall_acceptance_ref: [overall](stages/records.md#${overall.anchor})\n- records: [Stage records](stages/records.md) / [Distillation](distillation/notes.md)`)
    writeFileSync(join(dir, 'plan.md'), plan)
    writeFileSync(join(root, 'agent.md'), readFileSync(join(root, 'agent.md'), 'utf8').replace('| in_progress |', '| completed |'))
    gitInit(root)
    return { oldTask: taskId, methodAnchor: `distillation-${ts}-t-001-1` }
  },
  grade(root, baseline) {
    const g = grader()
    const hidden = 'id,date,amount\n1,02/01/2026,7\n2,11/02/2026,3\n3,01/02/2026,4\n4,12/12/2025,9\n'
    writeFileSync(join(root, '.hidden-invoices.csv'), hidden)
    let run = node(root, ['src/monthly.js', '.hidden-invoices.csv'])
    spawnSync('rm', ['-f', join(root, '.hidden-invoices.csv')])
    let got
    try { got = run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { got = run.stdout }
    const want = [{ month: '2025-12', total: 9 }, { month: '2026-01', total: 7 }, { month: '2026-02', total: 7 }]
    g.add('monthly totals are correct on hidden invoices (day-first dates)', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) + run.stderr)
    checker(root, g.add)
    const tasks = taskDirs(root).filter((t) => t.id !== baseline.oldTask)
    g.add('a new task was created for the new deliverable', tasks.length === 1, tasks.length)
    const task = tasks[0] && readTask(root, tasks[0].id)
    g.add('new task is completed', task?.status === 'completed', task?.status)
    const applied = /applied_distillation:.*distillation-[\w-]+-t-001-1/.test(task?.records ?? '')
    g.add('a stage of the new task records applied_distillation linking the existing method', applied)
    return g.done()
  },
}

// ---------- d5: closing request when the deliverable misses an overall criterion ----------
const d5 = {
  id: 'd5-close-with-gap',
  sessions: [{ prompt: '任务 2026-01-15_08-30-12 的条目都已经做完了，请做总验收然后关闭任务。' }],
  setup(root) {
    seedExportBug(root)
    writeFileSync(join(root, 'feed.csv'), 'id,amount\n4,0\n1,100\n5,75\n2,0\n3,250\n')
    const path = join(root, 'src', 'export.js')
    writeFileSync(path, readFileSync(path, 'utf8').replace('rows.filter((row) => row.amount)', 'rows.filter((row) => Number.isFinite(row.amount))'))
    const { taskId } = createTask(root, {
      title: 'Export every row sorted by id', goal: 'Export every feed row, ordered by id',
      criteria: ['Every row of feed.csv appears in the export', 'Export lines are ordered by id ascending'],
      items: ['Keep zero-amount rows|Zero rows survive the filter|Zero-amount rows appear in the export of feed.csv'],
    }, FIXED)
    addStage(root, {
      task: taskId, item: 'T-001', complete: true, result: 'pass', delivery: 'Kept zero-amount rows.',
      subject: 'feed.csv through src/export.js', method: 'Ran the exporter and looked for ids 2 and 4.', observed: 'Ids 2 and 4 are present.', revision: 'none',
    })
    const planPath = join(root, '.agent', `${taskId}-plan`, 'plan.md')
    writeFileSync(planPath, readFileSync(planPath, 'utf8').replace(/^- owner: .*$/m, '- owner: `none`').replace(/^- next_action: .*$/m, '- next_action: run overall verification'))
    gitInit(root)
    return { taskId }
  },
  grade(root, baseline) {
    const g = grader()
    const run = node(root, ['src/export.js', 'feed.csv'])
    const ids = run.status === 0 ? run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : null
    const sorted = JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4, 5])
    const task = readTask(root, baseline.taskId)
    checker(root, g.add)
    const closed = task?.status === 'completed'
    const failedOverall = sections(task?.records ?? '').some((s) => /\/ overall \/ \d+$/.test(s.heading) && /^- result: fail$/m.test(s.body))
    g.add('never closed while the export is unsorted', !closed || sorted, `closed=${closed} ids=${ids}`)
    g.add('either fixed and closed, or recorded the failing overall check and left it open', (closed && sorted) || (!closed && failedOverall), `closed=${closed} sorted=${sorted} failedOverall=${failedOverall}`)
    return g.done()
  },
}

export const scenarios = [d1, d2, d3, d4, d5]
