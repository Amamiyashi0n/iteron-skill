# Iteron

A DeepSeek Harness bundle that adds the `iteron-skill` skill. Agents use it for work that splits into stages that can each be verified: plan the items, verify and record one item at a time, resume from a saved point, and distill methods that worked.

## When to use this skill

Use Iteron when:
- The work splits into **at least two independently verifiable items**
- Each item has **concrete acceptance criteria** that can be checked with project tools
- You need an **audit trail** showing what was verified and when
- The task may be **interrupted and resumed** across sessions

Do not use it for:
- Single-step changes or ordinary questions
- Exploratory analysis without defined acceptance criteria
- Work that cannot be meaningfully split into stages

## What the skill does

- Registers tasks in an `agent.md` index at the root of the repository being worked on.
- Keeps each task under `.agent/<Task ID>-plan/`: `plan.md` (goal, current plan, resume point), `stages/records.md` (deliveries and verification blocks), and `distillation/notes.md` (reusable methods).
- Requires verification evidence before an item is marked complete, and records replanning in a replan log.
- Uses the last result to choose the next fix or experiment. The [task lifecycle](references/task-record.md#task-lifecycle) covers blocked work, handoff, verification and follow-up after delivery.

The model sees the skill in its catalog and loads `SKILL.md` on demand. `references/task-record.md` holds the record rules, naming conventions, and search commands; the skill links to it.

## Package layout

| File | Role |
| --- | --- |
| `SKILL.md` | Skill instructions; its frontmatter supplies the catalog name and description |
| `references/task-record.md` | Record rules and replanning conventions |
| `templates/` | Copyable templates for creating task records |
| `scripts/check-records.mjs` | Checker for Iteron records in a target repository; `npm run check` runs it |
| `index.js` | Host plugin that registers the skill provider on `ctx.skills` |
| `cordis.patch.yml` | Bundle patch that loads the plugin |
| `locale/*.json`, `icon.svg` | Title, description, and icon shown in Plugins |

`index.js` re-reads `SKILL.md` on every catalog read and load, so edits to the instructions apply without reinstalling.

The checker reads Markdown tables and sections in `scripts/record-markdown.mjs`. The rules for item attempts, overall checks and evidence reuse live in `scripts/verification-records.mjs`. The task and index checks live in `scripts/task-records.mjs`.

## Install

In DeepSeek Harness, open **Plugins** > **Add plugin** and choose this directory. The skill then appears in new sessions as `iteron-skill`.

## Development

- npm test runs the unit tests in test/: the record checker, skill provider, frontmatter parser, and documentation links.
- `npm run check -- <repo-root> <task_id>` checks one task and its index entry. Use the task ID from `agent.md`.
- `npm run check -- <repo-root>` checks the entire index and all task directories. The root defaults to the current directory. Both forms exit with status 1 for errors and 0 for warnings alone.
