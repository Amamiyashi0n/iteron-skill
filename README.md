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

The model sees the skill in its catalog and loads `SKILL.md` on demand. `references/task-record.md` holds the record rules, naming conventions, and search commands; the skill links to it.

## Package layout

| File | Role |
| --- | --- |
| `SKILL.md` | Skill instructions; its frontmatter supplies the catalog name and description |
| `references/task-record.md` | Record rules and replanning conventions |
| `templates/` | Copyable templates for creating task records |
| `index.js` | Host plugin that registers the skill provider on `ctx.skills` |
| `cordis.patch.yml` | Bundle patch that loads the plugin |
| `locale/*.json`, `icon.svg` | Title, description, and icon shown in Plugins |

`index.js` re-reads `SKILL.md` on every catalog read and load, so edits to the instructions apply without reinstalling.

## Install

In DeepSeek Harness, open **Plugins** > **Add plugin** and choose this directory. The skill then appears in new sessions as `iteron-skill`.

## Development

- npm test runs the unit tests in test/: the record checker, the frontmatter parser, and the links in the skill docs.
- npm run check [root] validates Iteron records in a repository (the agent.md index and .agent/ task directories) against references/task-record.md. It exits with status 1 when it finds errors.
