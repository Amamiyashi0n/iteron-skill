# Task index and record rules

## Text format

Write index entries and all task records in English, even when the request is in another language. Use the headings, table columns, and lowercase field names below. Put one field on each line. Keep exact file names, field names, IDs, and links searchable. Summarize long evidence and link to its source. A stage or distilled method runs from its heading to the next heading at the same level. Read its status, applicability, and evidence together.

**Never write credentials or secrets** in `observed`, `evidence`, or any other field. Reference them by name or redact them. If evidence requires a secret value, link to a secured location outside the repository.

Keep records at the repository root, or at the target working directory if there is no repository. Use one row per task in `agent.md`. Its fixed link points to `.agent/<Task ID>-plan/plan.md`. Set the Task ID from the UTC creation time in `yyyy-MM-dd_HH-mm-ss` format, such as `2026-01-15_08-30-12`. For collisions, add `-2`, `-3`, and so on. Use the same time format for `plan_timestamp`, which identifies the current plan version. Preserve unrelated content when updating the index.

**Version control**: Decide whether to commit `.agent/` to Git or add it to `.gitignore`. Committing it preserves history and enables team collaboration; excluding it keeps records local to the working copy. Document the choice in the repository's README or AGENTS.md.

```markdown
# Task Index

| task_id | title | search_terms | status | plan_link |
| --- | --- | --- | --- | --- |
| `2026-01-15_08-30-12` | Export batch amounts | amount conversion, raw_amount, feed.csv | in_progress | [Open plan](.agent/2026-01-15_08-30-12-plan/plan.md) |
```

Use `plan.md` for the goal, current plan, and resume point. Use `stages/records.md` for stage deliveries, verification, and replanning notes. Use `distillation/notes.md` for reusable methods distilled from verified work. Create the stage and distillation files when there is content to record, then link them from the plan. Use relative links within the task directory. For cross-task references, use the Task ID to resolve the location through the index.

Create every file and block from the copyable [templates](../templates/README.md), which also list the exact line each record is searched by. The examples below show filled records.

## Discovery pointer

A new session does not know the index exists unless something points to it. When registering the first task in a repository, make sure the root `AGENTS.md` contains this line, adding it if no line there already mentions `agent.md`:

```markdown
Staged tasks are indexed in `agent.md`. Load the iteron-skill skill before planning, resuming, or changing them.
```

If the root has no `AGENTS.md` but has `CLAUDE.md`, add the line there instead. If neither exists, create `AGENTS.md` with only this line. Mention the change in the next report so the user can keep or revert it.

## Search order

Search the index first, then open the matching `plan.md`. If the index is missing or does not locate the task, search only `.agent/*-plan/plan.md`. Repair the index when writes are allowed and the match is clear. If multiple candidates fit, confirm which to resume. To find an item's verification, follow `acceptance_ref` or search for its exact stage heading; the closing stage is under `<plan_timestamp> / overall / <attempt>` and is linked from `overall_acceptance_ref`. An item ID such as `T-001` is unique within a task. Pair it with `plan_timestamp` to identify verification for a specific plan version. Use actual project or requirement terms in `search_terms`. The plan's `search_terms` is authoritative and the index row repeats it, so a search of `.agent/*-plan/plan.md` still finds the task when the index is stale.

### Search targets and methods

Each search below has a clear target: a task by ID, a plan by timestamp, a stage by heading, or methods by keywords. Use any tool that can search for exact text: the host's grep or glob tools, `rg` if available, or an editor's find function. The examples use `rg` because it is common and fast, but the same searches work with other tools.

- **Find a task in the index**: search `agent.md` for a line starting with ``| `<task_id>` |``
- **Find a task by keywords**: case-insensitive search of `agent.md` for a literal substring
- **Find a task's plan**: whole-line search of `.agent/*-plan/plan.md` for ``- task_id: `<task_id>` ``
- **Find a specific stage**: whole-line search of a task's `stages/records.md` for `## <plan_timestamp> / <item_id> / <attempt>`
- **Find methods by keywords**: case-insensitive search of `.agent/**/distillation/notes.md` for a literal substring, then check each match's `status`, `applies_when`, and `source`

Run these examples from the repository root. `.agent/` is a hidden directory, and file search tools often skip hidden and ignored paths by default: pass `--hidden --no-ignore` to `rg` for searches within `.agent/`, and confirm that any other search tool includes hidden files. Use `--crlf` for exact line matching with LF or CRLF line endings. For cross-task method searches, restrict results to `distillation/notes.md`. Check the status, applicability, and source of each matching method.

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
- open_assumptions: None.
- records: [Stage records](stages/records.md) / [Distillation](distillation/notes.md)

## Resume Point

- confirmed: `T-001` verified the conversion for the current feed.
- pending_checks: The export has not yet been generated.
- next_action: Complete `T-002` using the conversion verified by `T-001`.
- delegated: None.

## Current Plan

| item_id | requirement | expected_result | depends_on | acceptance_criteria | status | acceptance_ref |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | Batch amount conversion | Verified unit for raw_amount | - | Every amount matches the independent reference | completed | [`2026-01-15_08-31-00 / T-001 / 1`](stages/records.md#stage-2026-01-15_08-31-00-t-001-1) |
| T-002 | Generate amounts output | `amounts.jsonl` for the current batch | T-001 | Row count and order match the input | completed | [`2026-01-15_08-31-00 / T-002 / 2`](stages/records.md#stage-2026-01-15_08-31-00-t-002-2) |
```

Use `pending`, `in_progress`, `blocked`, or `completed` for index and plan statuses. The plan's `status` field is the task status, and the index row repeats it; when they disagree, the plan wins and the index is repaired. Order items by dependencies and priority. Assign increasing IDs starting at `T-001`, with at least three digits and leading zeros as needed. `next_item_number` is the next unassigned number. Keep it when resuming or replanning. Removed IDs stay retired. Use `pending_checks` for unconfirmed actions, checks, or blockers, with a place to look or a condition for resuming.

A task is `blocked` when at least one plan item is `blocked` and no other items can proceed independently. Set an item to `blocked` after three consecutive failed verification attempts, or when it waits for an external prerequisite that is not yet available. Record the blocking condition in `pending_checks`. The task remains `blocked` until the condition is resolved or the plan is changed to work around it.

A task closes only through the overall verification stage described under [Overall verification](#overall-verification). On closure, in the same edit, set `status: completed`, point `overall_acceptance_ref` at that stage, set `owner: none`, write `next_action: completed`, and update the index row.

### Ownership

`owner` names the one session or agent allowed to write this task's records, and when it claimed them. Use whatever identifies the writer to the user, such as a session ID or an agent name. Record the claim time in UTC using the same `yyyy-MM-dd_HH-mm-ss` format as task IDs. Claim the task before the first write: when starting it, or when resuming a task whose `owner` is `none`. Release it with `owner: none` on handoff, on closure, or when stopping with work left.

- **Another owner is recorded.** Do not write records. Reading them is fine. The other session may still be running, and its liveness cannot be checked from the files. Ask the user whether to take over. When taking over, record the previous owner and the reason in `pending_checks`, re-read the plan, and confirm the resume point before acting.
- **Write against the current file.** Re-read `plan.md` or `stages/records.md` immediately before editing it. If its content changed since you last read it and you did not make the change, stop and reconcile before writing.
- **Delegated items.** Only the owner writes task records. A subagent receives the item, its acceptance criteria, and the relevant evidence, and returns its delivery and a filled Verification Block as text. The owner checks the returned block against the item's criteria, then writes it to `stages/records.md`. Record each running delegation in `delegated`, as in `T-003 to agent reviewer`, and remove it when the result is recorded or discarded. Items delegated in parallel must not change the same files.

## `stages/records.md`

Identify a stage by `Plan Timestamp / Plan Item ID / Attempt Number`. Each verification of an item is a separate stage, numbered starting from 1. Give each stage an anchor and point `acceptance_ref` to the latest successful attempt. Record the criteria actually checked in the Verification Block.

A failed verification is still recorded as a stage, with `result: fail` or `result: unverified`. When fixing the problem and verifying again, increment the attempt number. The plan item's `acceptance_ref` always points to the most recent `pass` result.

**Retry limit**: After three consecutive failed attempts for the same item under the same plan version, set the item's status to `blocked` and record the failure pattern in `pending_checks`. Either replan to work around the problem, or ask the user for guidance before attempting a fourth verification.

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
- evidence_status: current
```

**Example: Failed verification followed by success**

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
- observed: Output has 2 rows; feed.csv has 3. Row id=103 is missing.
- evidence_status: current

<a name="stage-2026-01-15_08-31-00-t-002-2"></a>

## 2026-01-15_08-31-00 / T-002 / 2

- delivery: Regenerated `amounts.jsonl` after fixing the filter bug.

### Verification Block

- criteria: Output row count and order match the input.
- subject: `amounts.jsonl` against `feed.csv`.
- revision: `c3d4e5f`, clean working tree
- method: Compare line counts and the id sequences.
- result: pass
- observed: 3 rows in both files, in the same order.
- evidence_status: current
```

The plan item's `acceptance_ref` points to the second stage: `[2026-01-15_08-31-00 / T-002 / 2](#stage-2026-01-15_08-31-00-t-002-2)`.


### Evidence freshness

`revision` records the exact state that was checked, so a later session can tell whether the evidence still applies. Record it when the check runs, not afterwards.

- **Inside Git.** Record the short commit SHA from `git rev-parse --short HEAD`. If `git status --porcelain` lists changes to any file the check depends on, add the working-tree state: commit or stash first when the user allows it; otherwise write `dirty:` followed by the changed paths that matter, and add a content hash for each.
- **Outside Git or for external inputs.** Record a SHA-256 of each tested file, or a version, timestamp, or query that identifies the input exactly. Write the first and last few hex characters when the full hash is long, and keep the full value in linked evidence.
- **Nothing identifiable.** Write `revision: none` and say why in `subject`. Such evidence cannot be reused in a later session and must be rechecked.

Before reusing evidence, compare its recorded state with the current one: `git diff --stat <revision> -- <paths the check depends on>` inside Git, or recompute the recorded hashes. Reuse it only when the paths it depends on and its external inputs are unchanged, and name the comparison you ran in the downstream stage. If they changed, set `evidence_status: historical`, record which change invalidated it, and verify again under a new Verification Block.

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

Close a task with one overall stage identified as `Plan Timestamp / overall / Attempt Number`, using the current plan version. Write it after every plan item is `completed`. Number the overall criteria `O-1`, `O-2`, and so on in `plan.md`, and check each one in its own Verification Block whose `criteria` line starts with that number. Cite an item's stage in a `reused` line when its evidence covers the criterion and passes the freshness comparison above, naming the comparison; otherwise run the check now. Every check run in this stage needs a `revision`.

Each overall verification is a separate stage with its own attempt number, starting from 1. If the overall verification fails, reopen or add the needed plan items, verify them, then write a new overall stage with an incremented attempt number.

### How to verify overall criteria

Before writing the overall stage, systematically check each O-N criterion:

1. **Identify what to check**: Translate the criterion into concrete checks (file exists, pattern matches, test passes, counts agree, specific content present)
2. **Determine the method**: Decide whether to reuse item evidence (when it covers this criterion and passes the freshness check) or run a new check
3. **Run the check**: Execute it and record exactly what was observed, including the revision
4. **Document the result**: Write the Verification Block immediately with the observed result

Use a checklist or verification script when there are multiple criteria. This prevents skipping criteria or judging by assumption. Failed checks stay explicit: write the `fail` block, reopen or add the needed plan items, then run overall verification again with an incremented attempt number after those items pass.

```markdown
<a name="stage-2026-01-15_08-31-00-overall-1"></a>

## 2026-01-15_08-31-00 / overall / 1

- delivery: `amounts.jsonl` for the current batch.

### Verification Block

- criteria: O-1 Row count and order match the feed.
- subject: `amounts.jsonl` against this batch's `feed.csv`.
- revision: `e4f5a6b`, clean working tree
- method: Compare the id sequences line by line.
- result: pass
- observed: 3 rows in both files, in the same order.
- evidence_status: current

### Verification Block

- criteria: O-2 All amounts match the independent reference.
- reused: [`2026-01-15_08-31-00 / T-002 / 2`](#stage-2026-01-15_08-31-00-t-002-2); `git diff --stat c7d8e9f e4f5a6b -- amounts.jsonl feed.csv` reports no changes.
- result: pass
- evidence_status: current
```

Close the task only when every criterion has a `pass` block in this stage. A `fail` or `unverified` result keeps the task open: add or reopen the plan items it needs, then write a new overall stage after they pass. If the plan changes after an overall stage is written, that stage is `historical`, and the closure needs a new overall stage under the new `plan_timestamp`.

## Complex replanning

- **Split or merge.** Give replacement items new IDs and record the relationship in the replan entry. Assign each acceptance criterion to a replacement item, and name the item responsible for checks that span multiple items. Follow links back to the actual checks and reuse only the covered conditions. When merging, retain required external prerequisites and preserve the order of steps inside the merged item. Downstream items wait for the results they actually need. Items that require overall acceptance still wait for it.
- **Downstream feedback.** Check dependencies against concrete deliverables and acceptance conditions. If feedback can be based on a verified intermediate result that later steps will not change, verify that result first, collect the feedback, then verify the whole delivery. When prerequisites change after downstream work starts, preserve confirmed progress and pause the affected actions.
- **Unresolvable cycle.** Record each hard prerequisite, the actions blocked, and what would break the cycle. Continue independent work. Resume affected actions only after the required prerequisite is verified. When external material or an authorization change arrives, verify it against the current requirements, then resume from the first unfinished action that is ready.

## `distillation/notes.md`

Distillation extracts a reusable execution method from verified work. Identify each method by `Plan Timestamp / Item ID / M-N`, where N starts from 1 for the first method distilled from that item. Give each method an anchor and a `title` field that describes the situation and problem. Use `route` for actionable steps, `check` for the condition that must pass, and `source` for the verified stage. `applies_when` and `search_terms` are required.

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
