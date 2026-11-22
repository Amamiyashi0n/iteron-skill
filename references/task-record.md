# Task index and record rules

## Text format

Use the project’s working language for descriptions. Use the headings, table columns, and lowercase field names below. Put one field on each line. Keep exact file names, field names, IDs, and links searchable. In table cells, write a literal pipe as `\|` or keep it inside a code span. Summarize long evidence and link to its source. A stage or distilled method runs from its heading to the next heading at the same level. Read its status, applicability, and evidence together.

**Never write credentials or secrets** in `observed`, `evidence`, or any other field. Reference them by name or redact them. If evidence requires a secret value, link to a secured location outside the repository. The checker reports an error for private keys, cloud and token formats, bearer headers and URLs with an embedded password, and a warning for password-style assignments.

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

A new session can discover the index through the project's agent instructions. When registering the first task, offer to add this line to the root instruction file the current agent loads, unless it already points to `agent.md`:

```markdown
Staged tasks are indexed in `agent.md`. Load the iteron-skill skill before planning, resuming, or changing them.
```

Use `CLAUDE.md` for Claude Code and `AGENTS.md` for Codex or another agent that loads it. These files steer every later session in the project, so ask the user before creating or editing one. Once they agree, create the file with just the pointer if it is missing, and report that you changed it. If they decline, cannot be asked, or the agent has no known project instruction file, leave the instruction files alone, keep `agent.md` as the index, and give the user the line and the index location in the report.

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

## Index merge conflicts

Two branches that each register a task append a row at the end of the `agent.md` table, so merging them can conflict even though the rows are independent. Keep every row from both sides, delete the conflict markers, and make sure each `task_id` appears once. Then run the checker without a task ID. It reports leftover markers as `merge-conflict`, a task directory with no row as `index-missing-row`, and a repeated row as `index-duplicate`.

When a row is lost or stale, rebuild it from the task's `plan.md`, whose `status` and `search_terms` are authoritative. Task directories are named by task ID and written by one owner, so they rarely conflict. If a project merges `agent.md` often, it can add `agent.md merge=union` to `.gitattributes` so git keeps both sides itself; propose that to the user rather than editing the file unasked.

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

Optional plan fields: `baseline` for improvement work, naming the starting observation, the input it was taken on and what outcome counts as enough; `open_assumptions` for an assumption that affects a decision; `delegated` while someone else works on an item; and `cancel_reason` for a cancelled task.

Use `pending`, `in_progress`, `blocked`, or `completed` for index and plan statuses. A whole task can also be `cancelled`; plan items stay in the four states. The plan's `status` field is the task status, and the index row repeats it; when they disagree, the plan wins and the index is repaired. Order items by dependencies and priority. `depends_on` holds item IDs from the current plan, or `-`. The checker rejects an unknown ID or an entry that is not an item ID, and warns about a dependency cycle or a completed item whose dependency is not completed. Assign increasing IDs starting at `T-001`, with at least three digits and leading zeros as needed. `next_item_number` is the next unassigned number. Keep it when resuming or replanning. Removed IDs stay retired. The checker compares `next_item_number` with every item ID in `stages/records.md`. Use `pending_checks` for unconfirmed actions, checks, or blockers, with a place to look or a condition for resuming.

### Task lifecycle

| Event | What to do |
| --- | --- |
| The work is planned | Start the task and its items as `pending`. When work begins, mark the task and the chosen ready item `in_progress`. |
| An attempt yields evidence | Compare the observation with the item's acceptance criteria. On a pass, link the attempt and complete the item. With a useful next experiment or fix, keep it `in_progress` and update `next_action`. |
| An item cannot advance | Mark the item `blocked` and save the missing input or condition in `pending_checks`. Continue independent items. Mark the task `blocked` only when none can proceed. |
| Work resumes or changes hands | Save the latest finding and next action on handoff and release the owner. On return, claim the task and check the latest recorded attempt against the plan. If a saved pass still applies but the plan missed it, record its `acceptance_ref`, complete the item and select the next action. If the saved attempt has `revision: none`, run the check again and cite the new attempt if it passes. Verify any other uncertainty before proceeding. A handoff alone leaves the task status intact. |
| All items pass | Keep the task `in_progress` through overall verification. A gap in the final deliverable sends the affected item back to work. Follow [Closing a task](#closing-a-task) once the criteria pass. |
| The user abandons the task | Set the task and index `status: cancelled`, record `cancel_reason` in `plan.md`, set `owner: none` and leave the records in place. Start a new task that cites it to resume the work. |
| Feedback arrives after delivery | If it shows that an agreed criterion was missed, reopen the affected work under the original task and verify it again. If the user requests a new outcome, start a new task and refer back to the completed one when its evidence helps. |

### Closing a task

After [overall verification](#overall-verification) passes, set `status: completed`, link `overall_acceptance_ref` to the passing stage, set `owner: none` and `next_action: completed`, and update the index row. Clear resolved entries from `pending_checks`. A completed task must also have no open `pending_checks` and no `delegated` entries. The single-task checker reads the saved plan and index to validate closure.

The session that writes those fields remains responsible for record corrections through the final check, including while the saved owner is `none`. For a record error such as a broken link to a passing check, correct the record and rerun the checker. If the deliverable fails a criterion, reclaim the task, reopen the affected item, update the task and index status, clear `overall_acceptance_ref`, and record the next action. Verify the corrected delivery in a new overall attempt before closing again.

### Ownership

`owner` identifies the writer of an open task and when it claimed the task. Use a session ID or agent name and a UTC claim time in `yyyy-MM-dd_HH-mm-ss` format. Claim the task when starting or resuming work. Set `owner: none` on handoff or when stopping with work left. The checker warns when an open task's claim is older than seven days or has no claim time. For the final write and any record corrections, follow [Closing a task](#closing-a-task).

- **Another owner is recorded.** The other session may still be running, and its liveness cannot be checked from the files, so the user decides. If the user's request names this task or tells you to continue, resume or finish it, that request is consent to take over, even when the other claim is recent. Take over without asking: record the previous owner and the reason in `pending_checks`, re-read the plan, confirm the resume point before acting, and claim the task. `pending_checks` is cleared when the task closes, so also keep the previous owner's name in the Resume Point or the stage `delivery`, and say in your report whose claim you took over. If you reached the task on your own, without the user naming it or telling you to continue, do not write records: read them and ask the user whether to take over. Taking over covers only the task the user named. Never take over, replan or retire another session's items to host different work; start a new task for it.
- **Write against the current file.** Re-read `plan.md` or `stages/records.md` immediately before editing it. If its content changed since you last read it and you did not make the change, stop and reconcile before writing.
- **Delegated items.** Only the owner writes task records. A subagent receives the item, its acceptance criteria, and the relevant evidence, and returns its delivery and a filled Verification Block as text. The owner checks the returned block against the item's criteria, then writes it to `stages/records.md`. Record each running delegation in `delegated`, as in `T-003 to agent reviewer`, and remove it when the result is recorded or discarded. Items delegated in parallel must not change the same files.

## `stages/records.md`

Identify a stage by `Plan Timestamp / Plan Item ID / Attempt Number`. Each verification of an item is a separate stage, numbered starting from 1. Give each stage an anchor and point `acceptance_ref` to the latest successful attempt. Record the criteria actually checked in the Verification Block. The `criteria` of the attempt that closes an item or a criterion must cover the plan's wording, so quote that wording and put specifics in `method` and `observed`. The checker ignores case and punctuation and accepts the match when the check's wording contains the plan's, or when the plan's wording contains the check's and the check states at least half of it. A single word from a long criterion does not cover it. The block also needs `subject`, `method` and `observed`. The checker reports a gap as an error on a completed task and as a warning before that.

A failed verification is still recorded as a stage, with `result: fail` or `result: unverified`. When fixing the problem and verifying again, increment the attempt number. Keep the most recent passing attempt in `acceptance_ref`. If the latest attempt under that plan version fails or is unverified, review what changed before relying on the earlier result. Reopen the item when the evidence no longer supports completion.

For improvement work, use an existing observation as the baseline, or measure it before changing the relevant inputs, and save it in the plan's `baseline` field. Compare attempts on the same case using the same acceptance check. A useful result can be qualitative, such as locating the point where a record disappears. If a change makes no difference, use that finding to rule out a cause or try a different approach. When no useful check is possible, record what would unblock the item. Stop iterating once the agreed criteria pass.

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


### Independent verification

A check is only as strong as its distance from the work it judges. Prefer, in this order:

1. A check that exists independently of the change: an existing test suite, reference data, a tool's own output, or the user's acceptance.
2. A check run by a verifier that did not produce the deliverable, such as a subagent that receives only the criteria and the deliverable and returns a filled Verification Block.
3. A check the author wrote and ran.

Name which one in the optional `checked_by` field, for example `existing test suite`, `subagent reviewer` or `author`. When a criterion could only be checked by the person who wrote the deliverable, say so in the final report so the user can decide whether that is enough. The checker verifies that the block is complete; it cannot judge independence.

### Evidence freshness

`revision` records the exact state that was checked, so a later session can tell whether the evidence still applies. Record it when the check runs. When writing a hash from a script, save the computed value and read back the record to confirm it matches the check output.

- For committed inputs, record the commit that was tested. Before reuse, compare the relevant paths against that commit and check for relevant untracked inputs.
- For modified or untracked inputs, record their paths and content hashes at verification time. Compare those hashes with the current files before reuse, including when the working tree is now clean. A commit comparison alone cannot identify the bytes tested in a dirty tree.
- For external inputs, record a content hash or a stable version identifying the tested input. If you cannot identify it, write `revision: none` and record what the check found. This result describes that attempt. For a later check, including overall verification, run the check on the current input and record a new result.

Reuse passing item evidence only while its checked inputs and acceptance conditions still match. Record the comparison alongside the link. When evidence becomes stale, add `evidence_status: historical` to its Verification Block and verify the changed inputs again.

When a distilled method is used, add `applied_distillation` to the downstream stage, link to the method, and state which implementation or check it affected. Use `pass`, `fail`, or `unverified` for `result`. Put actual findings in `observed`. Use `subject` to identify what was tested and the assumptions that affect the result. Add `evidence` when a log, report, or artifact can be linked. Use `resume_when` for blockers. When evidence becomes invalid, follow [Evidence freshness](#evidence-freshness).

When items, execution order, dependencies, or acceptance criteria materially change, replace the Current Plan and record the actual UTC `plan_timestamp`, distinct from the previous value. Keep the Task ID and directory fixed. Progress updates keep the current timestamp. Remove canceled or replaced items from the current plan. Reuse only evidence that still covers the new conditions. Evaluate in-flight or late results against the current conditions too. If a pending operation might change an artifact, confirm its result and inspect the artifact before resuming dependent work.

When replanning, append one replan entry to the stage file, identified by the new `plan_timestamp`. The checker reports an error when records from an earlier plan version exist but no entry carries the current `plan_timestamp`, or when an entry is newer than `plan_timestamp`. Include impact and resume details as needed.

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

## Resolving checker findings

The checker prints a level, a code, a location and a message. An error means the records cannot be trusted as written and blocks closing. A warning needs a look, and one that stays should be explained in the report. Correct the records the check read; do not edit a past attempt to read differently, and do not reword a plan criterion to match a weaker check.

| Code | Meaning | What to do |
| --- | --- | --- |
| `criteria-mismatch` | A cited attempt does not state the plan's criterion. | Decide which is true. If the check did cover it and only the wording differs, run the attempt again or add one whose `criteria` quotes the plan. If the check fell short, run it properly as a new attempt and cite that. If the criterion itself changed, replan and verify under the new `plan_timestamp`. |
| `evidence-incomplete` | A checked block lacks `subject`, `method` or `observed`. | Fill the missing fields only if the attempt really did and saw those things. Otherwise run the check again as a new attempt. |
| `merge-conflict` | Conflict markers are left in a record. | Follow [Index merge conflicts](#index-merge-conflicts). |
| `secret-detected`, `possible-secret` | A credential-looking value is recorded. | Redact it or link to a secured location. If it was real, rotate it, because version history keeps the old text. |
| `owner-stale`, `owner-claim-time` | The recorded claim is old or has no time. | Confirm with the user that the other session is gone, then take over as described under [Ownership](#ownership). |
| `placeholder-unfilled` | A template placeholder remains. | Fill it or delete the line. |
| `replan-missing`, `replan-ahead`, `replan-timestamp` | The plan version and the replan entries disagree. | Add the missing entry or correct `plan_timestamp` so the newest entry matches it. |
| `depends-malformed` | A `depends_on` entry is not an item ID such as `T-001`, for example `T1` or `t-001`. | Write the exact item ID, or `-` when nothing is required first. |
| `next-item-number` | The next number would reuse a retired item ID. | Raise `next_item_number` above every ID in the plan and in `stages/records.md`. |
| `reused-comparison-missing` | A reused evidence citation links to a passing attempt without explaining why it still applies. | Add the freshness and scope comparison after the link (for example `— checked inputs unchanged`), or run a fresh check. |
| `applied-distillation-broken`, `applied-distillation-historical` | `applied_distillation` links to a missing method anchor or a `historical` method. | Fix the link to an existing method anchor, or verify whether the historical method still applies before relying on it. |
| `index-missing`, `index-missing-row`, `index-duplicate`, `index-plan-link`, `index-status-mismatch`, `plan-missing`, `plan-file-missing`, `task-not-found`, `task-dir-duplicate`, `task-id-mismatch` | The index and the task directories disagree: a row or directory is missing, a task ID appears twice, a link does not open the task's actual `plan.md`, or the statuses differ. | Rebuild the row from `plan.md`, whose `status` and `search_terms` win. Keep one row and one directory per task ID, and link the actual `plan.md`. See [Search order](#search-order) and [Index merge conflicts](#index-merge-conflicts). |
| `plan-timestamp`, `plan-status`, `plan-field-missing`, `plan-section-missing`, `plan-goal-missing`, `overall-criteria-missing` | `plan.md` lacks a required field, section or `O-n` criterion, or a value is invalid. | Add or correct it as in the `plan.md` example. `plan_timestamp` must be a real UTC date in `yyyy-MM-dd_HH-mm-ss` format, and `status` one of the listed values. |
| `item-id`, `item-duplicate`, `item-status`, `table-missing`, `table-column-missing`, `table-row-columns` | The Current Plan or index table is malformed: an item ID is invalid or repeated, a status is invalid, a table or column is missing, or a row has the wrong number of cells. | Use the column names from the template, one row per item with a unique `T-nnn` ID, and a status of `pending`, `in_progress`, `blocked` or `completed`. Write a literal pipe as `\|` or keep it in a code span. |
| `depends-self`, `depends-unknown`, `depends-order`, `depends-cycle` | A dependency names the item itself or an unknown ID, a completed item depends on one that is not completed, or the dependencies form a cycle. | Correct the ID or the status. For a real cycle, record the hard prerequisite and what would break it in a replan entry, as in [Complex replanning](#complex-replanning). |
| `blocked-without-item` | The task is `blocked` but no item is. | Mark the blocked item, or change the task status. |
| `owner-not-released`, `cancel-reason-missing` | A closed or cancelled task still names an owner, or a cancelled task has no `cancel_reason`. | Set `owner: none` and record `cancel_reason`, as in [Task lifecycle](#task-lifecycle). |
| `acceptance-ref-missing`, `acceptance-ref-broken`, `acceptance-ref-wrong-item`, `acceptance-ref-not-pass`, `acceptance-ref-old-plan`, `acceptance-ref-stale`, `acceptance-ref-recheck` | A completed item's `acceptance_ref` is missing, does not resolve, cites another item, does not cite a passing attempt, cites an older plan version, or a later attempt exists. | Link the item's own latest passing attempt in the current plan version. For the stale and recheck warnings, read the newer attempt and either cite it or run the check again. |
| `completed-open-items`, `completed-next-action`, `closure-pending-checks`, `closure-delegated`, `overall-ref`, `overall-stale`, `overall-criterion`, `overall-ref-recheck`, `overall-ref-stale` | The closing fields of a completed task disagree with its items or its overall stage. | Follow [Closing a task](#closing-a-task): complete every item, clear `pending_checks` and `delegated`, set `next_action: completed`, and link a passing overall attempt from the current plan version that covers every `O-n`. Review a newer overall attempt before relying on an older pass. |
| `stage-heading`, `anchor-missing`, `block-result`, `criteria-missing`, `revision-missing`, `revision-unresolved`, `stage-without-block`, `attempt-duplicate`, `attempt-gap`, `overall-reuse-format` | A stage record or its anchor is malformed, a Verification Block lacks `criteria`, a valid `result` or a `revision`, a shell variable was left in `revision`, or attempts are repeated or skip a number. | Use the headings and anchors from the templates, `result` of `pass`, `fail` or `unverified`, and a computed `revision`. Number attempts 1, 2, 3 without repeating one. Put reused evidence on one `- O-n: [item attempt](#stage-...) — comparison` line. |
| `reused-link-missing`, `reused-source-broken`, `reused-source-not-pass`, `reused-source-no-revision` | Reused evidence has no link, points to something that is not an earlier attempt in the same log, cites an attempt that did not pass, or cites one with `revision: none`. | Link an earlier passing attempt that recorded a `revision`, or run the check again as a new attempt. |
| `method-heading`, `method-field-missing`, `method-status`, `method-reason`, `method-source-broken`, `method-source-not-verified` | A distilled method has an unrecognized heading, lacks a required field, has an invalid status, is `historical` without a `reason`, or its `source` is not a current passing attempt for its item. | Fill the fields listed under [distillation](#distillationnotesmd), use `active` or `historical`, and link `source` to the passing attempt of the method's own plan item. |

Rerun the checker after each correction.

## Without Node

The checker needs Node.js 20 or later. If it is not available, do not install a runtime unasked, and do not report that the check passed. Read the records against this list, then tell the user that the script was not run and that the review was manual:

1. Index: one row per task, its status equal to the plan's, its link opening the actual `plan.md`, and no conflict markers.
2. Plan: `task_id`, `plan_timestamp`, `status`, `owner`, `next_item_number`, `search_terms` and `overall_acceptance_ref` present; item IDs unique; `depends_on` naming only items in the plan; `next_item_number` above every ID ever used in the plan or `stages/records.md`.
3. Each completed item: `acceptance_ref` links its own latest passing attempt in the current plan version, and that attempt has `criteria` quoting the plan's wording, `subject`, `revision`, `method`, `result: pass` and `observed`.
4. Plan version: if records from an earlier version exist, a `## <plan_timestamp> / replan` entry exists and is not newer than `plan_timestamp`.
5. Closing: every item completed, every `O-n` passing in the overall stage the plan cites, `owner: none`, `next_action: completed`, and `pending_checks` and `delegated` empty.
6. No credentials, unfilled `{{placeholders}}` or leftover template text in the task directory.

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
