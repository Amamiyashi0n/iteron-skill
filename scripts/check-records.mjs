#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRoot } from './task-records.mjs'

export { checkRoot }

export function main(args) {
  const root = resolve(args[0] ?? '.')
  const { issues, tasks } = checkRoot(root, args[1])
  for (const issue of issues) {
    console.log(`${issue.level.toUpperCase()} [${issue.code}] ${issue.where}: ${issue.message}`)
  }
  const errors = issues.filter((issue) => issue.level === 'error').length
  console.log(`${tasks} task(s) checked: ${errors} error(s), ${issues.length - errors} warning(s)`)
  return errors > 0 ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
