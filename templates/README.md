# Record templates

Copy these files when creating Iteron records. Each template carries only the structure; the rules for every field are in [task-record.md](../references/task-record.md).

## Files

| Template | Copy to | When |
| --- | --- | --- |
| [agent.md](agent.md) | `agent.md` at the repository root | No index exists yet |
| [blocks/index-row.md](blocks/index-row.md) | One new row at the end of the `agent.md` table | Registering a task |
| [task/plan.md](task/plan.md) | `.agent/<task_id>-plan/plan.md` | Creating a task |
| [task/stages/records.md](task/stages/records.md) | `.agent/<task_id>-plan/stages/records.md` | First stage or replan to record |
| [task/distillation/notes.md](task/distillation/notes.md) | `.agent/<task_id>-plan/distillation/notes.md` | First method to distill |
| [blocks/stage.md](blocks/stage.md) | Append to `stages/records.md` | Recording one plan item |
| [blocks/overall.md](blocks/overall.md) | Append to `stages/records.md` | Closing the task |
| [blocks/replan.md](blocks/replan.md) | Append to `stages/records.md` | The plan version changes |
| [blocks/verification.md](blocks/verification.md) | Under a stage, overall, or replan heading | A check is run |
| [blocks/verification-reused.md](blocks/verification-reused.md) | Under an item heading | Fresh evidence is reused for an item |
| [blocks/distillation.md](blocks/distillation.md) | Append to `distillation/notes.md` | Distilling a verified method |

Append blocks to the end of their file; never insert them between existing blocks. The record then reads in time order, and an earlier block's line numbers stay valid.

Add `open_assumptions` when an assumption affects a decision and `delegated` when someone else is working on an item. Add links to the plan’s `records` field as the stage log and method notes are created.

## Placeholders

- `{{name}}` is required. Replace it with the value the field rules ask for.
- `{{optional: …}}` marks a line that may be omitted. Fill it, or delete the whole line.
- `{{item_anchor}}` is the item ID in lowercase, such as `t-001`. Keep the timestamp as written in the plan.
- `{{attempt}}` is the verification attempt number for a stage or overall closure, starting from 1. Increment it each time you verify the same item or run the overall check again.
- `{{n}}` is the method number for distillation, starting from 1 for the first method extracted from an item.
- `{{source_attempt}}` is the attempt number of the stage whose evidence a `reused` line cites.
- `{{claimed_at}}` is the UTC claim time in `yyyy-MM-dd_HH-mm-ss` format, the same format used for task IDs.

In the overall template, keep the sample citation only for a reused criterion. Use one `- O-<n>: [item attempt](#stage-...) — comparison` line per reused criterion. For a new check, append a Verification Block from the verification template.

## Index keys

Every record is found by one exact line. Write these lines exactly as shown so a fixed-string, whole-line search finds them.

| Record | Exact line | Anchor |
| --- | --- | --- |
| Task in the index | ``| `<task_id>` |`` at the start of a row | - |
| Task in its plan | ``- task_id: `<task_id>` `` | - |
| Current plan version | ``- plan_timestamp: `<plan_timestamp>` `` | - |
| Plan item stage | `## <plan_timestamp> / <item_id> / <attempt>` | `stage-<plan_timestamp>-<item_anchor>-<attempt>` |
| Overall stage | `## <plan_timestamp> / overall / <attempt>` | `stage-<plan_timestamp>-overall-<attempt>` |
| Replan entry | `## <plan_timestamp> / replan` | `stage-<plan_timestamp>-replan` |
| Reused overall evidence | `- O-<n>: [item attempt](#stage-...) — comparison` under the overall stage | - |
| Direct overall check | `- criteria: O-<n> …` under the overall stage | - |
| Distilled method status | `- status: active` or `- status: historical` under its heading | `distillation-<plan_timestamp>-<item_anchor>-<n>` |
| Distilled method heading | `## <plan_timestamp> / <item_id> / M-<n>` | - |
