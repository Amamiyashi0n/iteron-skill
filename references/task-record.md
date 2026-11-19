# Task index and record rules

## Text format

Use the project’s working language for descriptions. Use the headings, table columns, and lowercase field names below. Put one field on each line. Keep exact file names, field names, IDs, and links searchable. Summarize long evidence and link to its source. A stage or distilled method runs from its heading to the next heading at the same level. Read its status, applicability, and evidence together.

**Never write credentials or secrets** in `observed`, `evidence`, or any other field. Reference them by name or redact them. If evidence requires a secret value, link to a secured location outside the repository.

Keep records at the repository root, or at the target working directory if there is no repository. Create new tasks under `.agent/<Task ID>-plan/`. Existing tasks under `agent/<Task ID>-plan/` continue in place. Use one row per task in `agent.md` and link its actual `plan.md`. Set the Task ID from the UTC creation time in `yyyy-MM-dd_HH-mm-ss` format, such as `2026-01-15_08-30-12`. Check both directories for collisions and append `-2`, `-3`, and so on as needed. Use the same time format for `plan_timestamp`, which identifies the current plan version. Preserve unrelated content when updating the index.

**Version control**: Follow the repository’s convention for committing or ignoring task records in `.agent/` and any existing `agent/` task directories.

```markdown
# Task Index

| task_id | title | search_terms | status | plan_link |
| --- | --- | --- | --- | --- |
| `2026-01-15_08-30-12` | Export batch amounts | amount conversion, raw_amount, feed.csv | in_progress | [Open plan](.agent/2026-01-15_08-30-12-plan/plan.md) |
```

Use `plan.md` for the goal, current plan, and resume point. Use `stages/records.md` for stage deliveries, verification, and replanning notes. Use `distillation/notes.md` for reusable methods distilled from verified work. Create the stage and distillation files when there is content to record, then link them from the plan. Use relative links within the task directory. For cross-task references, use the Task ID to resolve the location through the index.

Create every file and block from the copyable [templates](../templates/README.md), which also list the exact line each record is searched by. The examples below show filled records.

## Discovery pointer

A new session can discover the index through the project's agent instructions. When registering the first task, add this line to the root instruction file the current agent loads if it does not already point to `agent.md`:

```markdown
Staged tasks are indexed in `agent.md`. Load the iteron-skill skill before planning, resuming, or changing them.
```

Use `CLAUDE.md` for Claude Code and `AGENTS.md` for Codex or another agent that loads it. Create the relevant file with just the pointer if it is missing. If the agent has no known project instruction file, mention the index location in the report. Report any instruction file you updated.

## Search order

Search the index first, then open the matching `plan.md`. If the index is missing or does not locate the task, search `.agent/*-plan/plan.md` and `agent/*-plan/plan.md`. Repair the index when writes are allowed and the match is clear. If multiple candidates fit, confirm which to resume. To find an item's verification, follow `acceptance_ref` or search for its exact stage heading; the closing stage is under `<plan_timestamp> / overall / <attempt>` and is linked from `overall_acceptance_ref`. An item ID such as `T-001` is unique within a task. Pair it with `plan_timestamp` to identify verification for a specific plan version. Use actual project or requirement terms in `search_terms`. The plan's `search_terms` is authoritative and the index row repeats it, so searching the plan files still finds the task when the index is stale.

### Search targets and methods

Each search below has a clear target: a task by ID, a plan by timestamp, a stage by heading, or methods by keywords. Use any tool that can search for exact text: the host's grep or glob tools, `rg` if available, or an editor's find function. The examples use `rg` because it is common and fast, but the same searches work with other tools.

- **Find a task in the index**: search `agent.md` for a line starting with ``| `<task_id>` |``
- **Find a task by keywords**: case-insensitive search of `agent.md` for a literal substring
- **Find a task's plan**: whole-line search of the plan files under both task directories for ``- task_id: `<task_id>` ``
- **Find a specific stage**: whole-line search of a task's `stages/records.md` for `## <plan_timestamp> / <item_id> / <attempt>`
- **Find methods by keywords**: case-insensitive search of `distillation/notes.md` files under both task directories for a literal substring, then check each match's `status`, `applies_when`, and `source`

Run these examples from the repository root. Repeat directory searches with `agent/` if it exists, and use the task's actual directory for a specific stage. Pass `--hidden --no-ignore` to `rg` so it includes hidden and ignored task paths. Use `--crlf` for exact line matching with LF or CRLF line endings.

```powershell
rg -n -F -- '| `2026-01-15_08-30-12` |' agent.md
rg -ni -F -- 'raw_amount' agent.md
rg -n -x --crlf --hidden --no-ignore -g '**/*-plan/plan.md' -F -- '- task_id: `2026-01-15_08-30-12`' .agent/
rg -n -x --crlf --hidden --no-ignore -F -- '## 2026-01-15_08-31-00 / T-001 / 1' .agent/2026-01-15_08-30-12-plan/stages/records.md
rg -ni --hidden --no-ignore -g '**/distillation/notes.md' -F -- 'raw_amount' .agent/
```

## `plan.md`

```markdown
# Export batch amounts

- task_id: `2026-01-15_08-30-12`
- plan_timestamp: `2026-01-15_08-31-00`
- status: in_progress
- owner: `session 7f3c2a, lead` claimed `2026-01-15_08-30-12`
- next_item_number: `3`
- search_terms: amount conversion, raw_amount, feed.csv
- goal: Export amounts for the current batch.
- requirements: Include id and amount in feed order.
- constraints: Read only the feed when generating the export. Use the reference data for verification.
- overall_acceptance:
  - O-1: Row count and order match the feed.
  - O-2: All amounts match the independent reference.
- overall_acceptance_ref: -
- records: [Stage records](stages/records.md) / [Distillation](distillation/notes.md)

## Resume Point

- confirmed: Both plan items passed.
- pending_checks: Verify the final export against the reference.
- next_action: Run overall verification on the exported file.

## Current Plan

| item_id | requirement | expected_result | depends_on | acceptance_criteria | status | acceptance_ref |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | Batch amount conversion | Verified unit for raw_amount | - | Every amount matches the independent reference | completed | [`2026-01-15_08-31-00 / T-001 / 1`](stages/records.md#stage-2026-01-15_08-31-00-t-001-1) |
| T-002 | Generate amounts output | `amounts.jsonl` for the current batch | T-001 | Row count and order match the input | completed | [`2026-01-15_08-31-00 / T-002 / 2`](stages/records.md#stage-2026-01-15_08-31-00-t-002-2) |
```

Use `pending`, `in_progress`, `blocked`, or `completed` for index and plan statuses. The plan's `status` field is the task status, and the index row repeats it; when they disagree, the plan wins and the index is repaired. Order items by dependencies and priority. Assign increasing IDs starting at `T-001`, with at least three digits and leading zeros as needed. `next_item_number` is the next unassigned number. Keep it when resuming or replanning. Removed IDs stay retired. Use `pending_checks` for unconfirmed actions, checks, or blockers, with a place to look or a condition for resuming.

### Task lifecycle

| Event | What to do |
| --- | --- |
| The work is planned | Start the task and its items as `pending`. When work begins, mark the task and the chosen ready item `in_progress`. |
| An attempt yields evidence | Compare the observation with the item's acceptance criteria. On a pass, link the attempt and complete the item. With a useful next experiment or fix, keep it `in_progress` and update `next_action`. |
| An item cannot advance | Mark the item `blocked` and save the missing input or condition in `pending_checks`. Continue independent items. Mark the task `blocked` only when none can proceed. |
| Work resumes or changes hands | Save the latest finding and next action on handoff and release the owner. On return, claim the task and check the latest recorded attempt against the plan. If a saved pass still applies but the plan missed it, record its `acceptance_ref`, complete the item and select the next action. If the saved attempt has `revision: none`, run the check again and cite the new attempt if it passes. Verify any other uncertainty before proceeding. A handoff alone leaves the task status intact. |
| All items pass | Keep the task `in_progress` through overall verification. A gap in the final deliverable sends the affected item back to work. Follow [Closing a task](#closing-a-task) once the criteria pass. |
| Feedback arrives after delivery | If it shows that an agreed criterion was missed, reopen the affected work under the original task and verify it again. If the user requests a new outcome, start a new task and refer back to the completed one when its evidence helps. |

### Closing a task

After [overall verification](#overall-verification) passes, set `status: completed`, link `overall_acceptance_ref` to the passing stage, set `owner: none` and `next_action: completed`, and update the index row. Clear resolved entries from `pending_checks`. The single-task checker reads the saved plan and index to validate closure.

The session that writes those fields remains responsible for record corrections through the final check, including while the saved owner is `none`. For a record error such as a broken link to a passing check, correct the record and rerun the checker. If the deliverable fails a criterion, reclaim the task, reopen the affected item, update the task and index status, clear `overall_acceptance_ref`, and record the next action. Verify the corrected delivery in a new overall attempt before closing again.

### Ownership

`owner` identifies the writer of an open task and when it claimed the task. Use a session ID or agent name and a UTC claim time in `yyyy-MM-dd_HH-mm-ss` format. Claim the task when starting or resuming work. Set `owner: none` on handoff or when stopping with work left. For the final write and any record corrections, follow [Closing a task](#closing-a-task).

- **Another owner is recorded.** Do not write records. Reading them is fine. The other session may still be running, and its liveness cannot be checked from the files. Ask the user whether to take over. When taking over, record the previous owner and the reason in `pending_checks`, re-read the plan, and confirm the resume point before acting.
- **Write against the current file.** Re-read `plan.md` or `stages/records.md` immediately before editing it. If its content changed since you last read it and you did not make the change, stop and reconcile before writing.
- **Delegated items.** Only the owner writes task records. A subagent receives the item, its acceptance criteria, and the relevant evidence, and returns its delivery and a filled Verification Block as text. The owner checks the returned block against the item's criteria, then writes it to `stages/records.md`. Record each running delegation in `delegated`, as in `T-003 to agent reviewer`, and remove it when the result is recorded or discarded. Items delegated in parallel must not change the same files.

## `stages/records.md`

Identify a stage by `Plan Timestamp / Plan Item ID / Attempt Number`. Each verification of an item is a separate stage, numbered starting from 1. Give each stage an anchor and point `acceptance_ref` to the latest successful attempt. Record the criteria actually checked in the Verification Block.

A failed verification is still recorded as a stage, with `result: fail` or `result: unverified`. When fixing the problem and verifying again, increment the attempt number. Keep the most recent passing attempt in `acceptance_ref`. If the latest attempt under that plan version fails or is unverified, review what changed before relying on the earlier result. Reopen the item when the evidence no longer supports completion.

For improvement work, use an existing observation as the baseline, or measure it before changing the relevant inputs. Compare attempts on the same case using the same acceptance check. A useful result can be qualitative, such as locating the point where a record disappears. If a change makes no difference, use that finding to rule out a cause or try a different approach. When no useful check is possible, record what would unblock the item. Stop iterating once the agreed criteria pass.

```markdown
# Stage Records

[Current plan](../plan.md)

<a name="stage-2026-01-15_08-31-00-t-001-1"></a>

## 2026-01-15_08-31-00 / T-001 / 1

- delivery: Confirmed the conversion unit for raw_amount in this batch.

### Verification Block

- criteria: Every amount matches the independent reference.
- subject: This batch's `feed.csv` and its independent reference.
- revision: `a1b2c3d`, clean working tree; `feed.csv` sha256 `9f2e…41c0`
- method: Match rows by id, derive a candidate ratio from a nonzero sample, and compare every converted value.
- result: pass
- observed: 3 of 3 rows matched. A raw value of 1250 corresponds to 1.250.
```

**Example: Use a failed check to pick the next change**

```markdown
<a name="stage-2026-01-15_08-31-00-t-002-1"></a>

## 2026-01-15_08-31-00 / T-002 / 1

- delivery: Generated `amounts.jsonl` from the verified conversion.

### Verification Block

- criteria: Output row count and order match the input.
- subject: `amounts.jsonl` against `feed.csv`.
- revision: `b2c3d4e`, clean working tree
- method: Compare line counts and the id sequences.
- result: fail
- observed: Only 2 of 3 rows were exported. ID 103 is present after parsing with amount 0 and missing after filtering.

<a name="stage-2026-01-15_08-31-00-t-002-2"></a>

## 2026-01-15_08-31-00 / T-002 / 2

- delivery: Changed the filter to omit missing amounts and retain zero, then regenerated the export from the same feed.

### Verification Block

- criteria: Output row count and order match the input.
- subject: `amounts.jsonl` against `feed.csv`.
- revision: `c3d4e5f`, clean working tree
- method: Compare line counts and the id sequences.
- result: pass
- observed: The export now contains all 3 IDs in feed order, including ID 103 with amount 0.
```

The plan item's `acceptance_ref` points to the second stage: `[2026-01-15_08-31-00 / T-002 / 2](#stage-2026-01-15_08-31-00-t-002-2)`.


### Evidence freshness

`revision` records the exact state that was checked, so a later session can tell whether the evidence still applies. Record it when the check runs. When writing a hash from a script, save the computed value and read back the record to confirm it matches the check output.

- For committed inputs, record the commit that was tested. Before reuse, compare the relevant paths against that commit and check for relevant untracked inputs.
- For modified or untracked inputs, record their paths and content hashes at verification time. Compare those hashes with the current files before reuse, including when the working tree is now clean. A commit comparison alone cannot identify the bytes tested in a dirty tree.
- For external inputs, record a content hash or a stable version identifying the tested input. If you cannot identify it, write `revision: none` and record what the check found. This result describes that attempt. For a later check, including overall verification, run the check on the current input and record a new result.

Reuse passing item evidence only while its checked inputs and acceptance conditions still match. Record the comparison alongside the link. When evidence becomes stale, add `evidence_status: historical` to its Verification Block and verify the changed inputs again.

When a distilled method is used, add `applied_distillation` to the downstream stage, link to the method, and state which implementation or check it affected. Use `pass`, `fail`, or `unverified` for `result`. Put actual findings in `observed`. Use `subject` to identify what was tested and the assumptions that affect the result. Add `evidence` when a log, report, or artifact can be linked. Use `resume_when` for blockers. When evidence becomes invalid, follow [Evidence freshness](#evidence-freshness).

When items, execution order, dependencies, or acceptance criteria materially change, replace the Current Plan and record the actual UTC `plan_timestamp`, distinct from the previous value. Keep the Task ID and directory fixed. Progress updates keep the current timestamp. Remove canceled or replaced items from the current plan. Reuse only evidence that still covers the new conditions. Evaluate in-flight or late results against the current conditions too. If a pending operation might change an artifact, confirm its result and inspect the artifact before resuming dependent work.

When replanning, append one replan entry to the stage file, identified by the new `plan_timestamp`. Include impact and resume details as needed.

```markdown
<a name="stage-2026-01-15_09-02-40-replan"></a>

## 2026-01-15_09-02-40 / replan

- previous_plan_timestamp: `2026-01-15_08-31-00`
- trigger: The requirement change or observed result that prompted replanning.
- affected_items: The item IDs affected and any replacements.
- decision: The revised order, ownership, or acceptance criteria.
- evidence_impact: The conditions still covered, the checks to repeat, and the distilled methods affected.
- dependency_changes: The revised acceptance order or unresolved dependency cycle.
- resume_when: Saved progress, the conditions for resuming, and how to verify them.
```

For `evidence_impact`, link the actual check and identify what must be reverified and which action waits for the result. For `dependency_changes`, name the deliverable or acceptance condition each dependent item needs. Preserve overall acceptance gates when downstream feedback or dependency cycles are involved. When a blocker is resolved, record the input received, the verification result, and the first action that can resume.

## Overall verification

After all items are complete, verify the final deliverable against the numbered overall criteria in the current plan. For a criterion already covered by a passing item attempt, record one line with its criterion ID, source link and freshness comparison. For a new check, use a Verification Block with its result and revision.

Use the user’s final acceptance conditions to choose the overall criteria. For example, if delivery requires an image to have alt text and a button to have an explicit type, those two conditions are enough. If both need a fresh check on the final HTML, inspect the file once and record both observations. Add a separate overall criterion when the parts interact in a way that needs its own check.

```markdown
<a name="stage-2026-01-15_08-31-00-overall-1"></a>

## 2026-01-15_08-31-00 / overall / 1

- delivery: `amounts.jsonl` for the current batch.

### Verification Block

- criteria: O-2 Exported amounts match the independent reference.
- subject: Final `amounts.jsonl` and the reference amounts for this batch.
- revision: `e4f5a6b`, clean working tree
- method: Compare the amount for each exported ID with its reference value.
- result: pass
- observed: All three exported amounts matched.

- O-1: [Export row count and order](#stage-2026-01-15_08-31-00-t-002-2) — checked inputs are tracked and unchanged from `c3d4e5f` to `e4f5a6b`.
```

Close the task only when every criterion has passing evidence in this stage. If a newer overall attempt exists under the same plan version, review it before relying on an earlier pass. If the deliverable falls short, add or reopen the affected items and write a new overall attempt after they pass. If an attempted recheck could not run, check whether the earlier evidence still applies to the current deliverable and criteria. After changing the plan version, verify the overall criteria under the new `plan_timestamp`.

## Complex replanning

- **Split or merge.** Give replacement items new IDs and record the relationship in the replan entry. Assign each acceptance criterion to a replacement item, and name the item responsible for checks that span multiple items. Follow links back to the actual checks and reuse only the covered conditions. When merging, retain required external prerequisites and preserve the order of steps inside the merged item. Downstream items wait for the results they actually need. Items that require overall acceptance still wait for it.
- **Downstream feedback.** Check dependencies against concrete deliverables and acceptance conditions. If feedback can be based on a verified intermediate result that later steps will not change, verify that result first, collect the feedback, then verify the whole delivery. When prerequisites change after downstream work starts, preserve confirmed progress and pause the affected actions.
- **Unresolvable cycle.** Record each hard prerequisite, the actions blocked, and what would break the cycle. Continue independent work. Resume affected actions only after the required prerequisite is verified. When external material or an authorization change arrives, verify it against the current requirements, then resume from the first unfinished action that is ready.

## `distillation/notes.md`

Distillation extracts a reusable execution method from verified work. Identify each method by `Plan Timestamp / Item ID / M-N`, where N starts from 1 for the first method distilled from that item. Give each method an anchor and a `title` field that describes the situation and problem. Use `route` for actionable steps, `check` for the condition that must pass, and `source` for a link to the passing attempt for the item and plan version in the method heading. When a failed attempt helped identify the cause, cite it in `rationale` and use the attempt that verified the solution as `source`. `applies_when` and `search_terms` are required.

Before adopting a method, confirm `status: active`, valid source evidence, and that `applies_when` matches. If any of these are uncertain, verify before using it. Record actual use in the downstream stage's `applied_distillation` field. Add `rationale` when a tradeoff changes execution. Keep one-off values in the source evidence and delivery-specific requirements, such as output order, in the current plan. If a method no longer applies, set its status to `historical`, record the `reason`, and retain its `source`.

```markdown
# Distillation

[Current plan](../plan.md)

<a name="distillation-2026-01-15_08-31-00-t-001-1"></a>

## 2026-01-15_08-31-00 / T-001 / M-1

- title: Confirm a missing feed unit against an independent reference
- status: active
- applies_when: The feed contains integer raw_amount values, the unit is unspecified, and an independent reference exists for the same batch.
- route: Match rows by id, derive a candidate ratio from a nonzero sample, check it against every reference value, then pass the verified ratio to the export stage.
- rationale: Units can vary by batch. Checking every row catches inconsistent ratios or a coincidental match.
- check: IDs match one to one and every converted value agrees. Pause the export if the check fails and investigate the discrepancy.
- source: [2026-01-15_08-31-00 / T-001 / 1](../stages/records.md#stage-2026-01-15_08-31-00-t-001-1)
- search_terms: amount conversion, raw_amount, feed.csv
```

### Feedback from reuse

If a method works as written, the downstream stage’s `applied_distillation` and verification result are enough. If a new case reveals a limit, narrow the original note’s `applies_when` or clarify its `check` and link the downstream observation beside the change. Keep the originating `source` intact. For example, if a feed repeats IDs for different currencies, narrow “match rows by ID” to feeds with unique IDs. If a downstream attempt verifies a different matching procedure, such as matching by ID and currency, save it as a separate method with that passing attempt as its `source`.

For feedback across tasks, use a relative link from the method note to the downstream observation. An update to a completed task’s method note leaves its delivery closed. If another session owns the source task, record the proposed wording and observation in the downstream attempt for that owner to apply.
