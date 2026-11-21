#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from './task-records.mjs'

export { checkRoot }

const USAGE = [
  'Usage: node scripts/check-records.mjs [options] [root] [taskId]',
  '',
  'Options:',
  '  --json              Print findings as JSON',
  '  --strict            Exit with status 1 on warnings as well as errors',
  '  --stale-days <n>    Days before an open owner claim is flagged as stale (default: 7)',
  '  -h, --help          Show this help message',
].join('\n')

function parseArgs(args) {
  let json = false
  let strict = false
  let help = false
  let staleOwnerDays
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') {
      help = true
    } else if (arg === '--json') {
      json = true
    } else if (arg === '--strict') {
      strict = true
    } else if (arg === '--stale-days' || arg.startsWith('--stale-days=')) {
      const raw = arg.includes('=') ? arg.slice('--stale-days='.length) : args[++i]
      const days = Number(raw)
      if (!Number.isFinite(days) || days <= 0) {
        return { error: `invalid --stale-days value: ${raw ?? '(missing)'}` }
      }
      staleOwnerDays = days
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` }
    } else {
      positionals.push(arg)
    }
  }
  if (positionals.length > 2) return { error: `unexpected argument: ${positionals[2]}` }
  return { help, json, strict, staleOwnerDays, root: resolve(positionals[0] ?? '.'), taskId: positionals[1] }
}

export function main(args) {
  const parsed = parseArgs(args)
  if (parsed.error) {
    console.error(`ERROR: ${parsed.error}\n\n${USAGE}`)
    return 2
  }
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  const options = parsed.staleOwnerDays === undefined ? {} : { staleOwnerDays: parsed.staleOwnerDays }
  const { issues, tasks } = checkRoot(parsed.root, parsed.taskId, options)
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.length - errors
  if (parsed.json) {
    console.log(JSON.stringify({ root: parsed.root, taskId: parsed.taskId ?? null, tasks, errors, warnings, issues }, null, 2))
  } else {
    for (const issue of issues) {
      console.log(`${issue.level.toUpperCase()} [${issue.code}] ${issue.where}: ${issue.message}`)
    }
    console.log(`${tasks} task(s) checked: ${errors} error(s), ${warnings} warning(s)`)
  }
  return errors > 0 || (parsed.strict && warnings > 0) ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
