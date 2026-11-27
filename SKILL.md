---
name: iteron-skill
description: "Plan and execute work that splits into independently verifiable stages. Record acceptance evidence in the project, resume from saved progress, and distill reusable methods. Use for staged work, replanning, and handoffs, including 分阶段、逐项验证、断点续做、恢复任务 and 重新规划. Skip single-step changes and ordinary questions."
---

# Iteron

Use the task index to find work and the task plan to resume it. Each plan item describes a deliverable and its acceptance criteria. Each verification attempt records what was actually checked.

## Write records with the scripts

The scripts in the `scripts/` directory next to this `SKILL.md` write records in the exact format the checker expects. Run them with Node 20 or later, passing the project root as the last argument. You do not need to read their source or the checker's; each prints its options with `--help`, and the checker's codes are explained in [resolving checker findings](references/task-record.md#resolving-checker-findings).

| Step | Command |
| --- | --- |
| Create a task and its index row | `new-task.mjs --title … --goal … --criterion "…" --item "requirement\|expected result\|acceptance criteria[\|T-001]" [--baseline …] [--search-terms …] <root>` |
| Claim, release or move the resume point | `update-plan.mjs --task <id> [--claim <session> \| --release] [--confirmed …] [--pending …] [--next …] [--item T-002 --status in_progress] <root>` |
| Record a check of an item | `add-stage.mjs --task <id> --item T-001 --delivery … --subject … --method … --observed … --result pass\|fail\|unverified --revision "<commit or sha256>" [--complete] [--checked-by …] [--applied-distillation <link>] <root>` (`--criteria` defaults to the plan row) |
| Record the overall check | `add-stage.mjs --task <id> --overall --delivery … [--criteria "O-1 <plan wording>" --subject … --method … --observed … --result pass --revision …] [--reuse "O-2: [T-001 / 1](#stage-…) — why still valid"] [--attempt <n>] <root>` (cover every `O-n` in **one** overall attempt via repeatable `--criteria`, repeatable `--reuse`, or `--attempt <n>`; use `--reuse` only when inputs and criteria are unchanged and the cited attempt is not `revision: none`—otherwise rerun and use `--criteria`) |
| Distil a verified method | `add-method.mjs --task <id> --item T-001 --title … --applies-when … --route … --check … --search-terms … <root>` |
| Close and check | `close-task.mjs --task <id> <root>` (checks and rolls back on error); always run `check-records.mjs <root> <id>` after hand edits or before handing off an open task |

`--complete` marks the item completed and links it from `acceptance_ref`. Write by hand only what no script covers, such as a replan entry or a takeover note, then run `check-records.mjs`. Every script prints the checker's result for that task, so read that line instead of re-reading the files.

What the checker accepts, so you never need to read its source:

- An item is completed when `acceptance_ref` links its own latest passing attempt in the current plan version, and that attempt's `criteria` contains the plan's acceptance wording (case and punctuation are ignored) and has `subject`, `revision`, `method` and `observed`.
- `revision` holds a literal value: a commit, file hashes, or `none`. Evidence recorded with `revision: none` cannot be reused later.
- Attempts are numbered 1, 2, 3 per item and plan version. Never rewrite an attempt; append a new one.
- A task closes when every item is completed and a passing overall attempt in the current plan version covers each `O-n`: either its own Verification Block whose `criteria` starts with `O-n` and the plan's wording, or a line `- O-n: [item attempt](#stage-…) — why that evidence still applies`. `close-task.mjs` writes the remaining closure fields.
- A replan needs a new `plan_timestamp` and a `## <plan_timestamp> / replan` entry in `stages/records.md`.

## Plan or resume

Find the task in `agent.md`. Keep existing tasks in their recorded `.agent/` or `agent/` directory. Treat a request for a different deliverable as a new task, even when another task for the same project is open. Reuse an existing task only when the user names it or the request continues its goal. Create new tasks under `.agent/` using the [templates](templates/README.md), or run [scripts/new-task.mjs](scripts/new-task.mjs) with `--help` to generate the plan and index row, then add any optional fields by hand. For the first task, follow the [discovery pointer rule](references/task-record.md#discovery-pointer) for the current agent, which asks the user before touching an instruction file. In planning mode, draft the plan in conversation and save it when writes are allowed.

Before drafting a new plan, [search existing methods](references/task-record.md#search-targets-and-methods) with the goal's project and requirement terms. Adopt one only after the checks listed under [distillation](references/task-record.md#distillationnotesmd), and plan its check as a normal item.

Keep the current plan and next action in `plan.md`. When the goal is an improvement, identify the starting observation and what outcome would count as enough, and save both in `baseline`. On resumption, compare the plan with the latest attempt for the next item. If a passing attempt was saved before the plan was updated, check whether it still covers the current inputs and criteria, then link it and continue if it applies. If that attempt says `revision: none`, rerun the check and cite the new passing attempt. Claim the task before writing, following the [task lifecycle](references/task-record.md#task-lifecycle) and [ownership rules](references/task-record.md#ownership). A user's request to continue a task authorizes taking it over from another recorded owner; the ownership rules say how to record the takeover.

## Work and verify

Choose a ready item, do the work, and check its acceptance criteria with project tools. Append the result to `stages/records.md` (or run [scripts/add-stage.mjs](scripts/add-stage.mjs) with `--help` to number and write the attempt) and link the item’s own passing attempt from `acceptance_ref`. Record the tested inputs as described under [evidence freshness](references/task-record.md#evidence-freshness). Prefer a check that does not depend on your own change, such as an existing test, reference data, or a verifier that did not produce the deliverable, and name it in `checked_by`; see [independent verification](references/task-record.md#independent-verification).

Use the result to choose the next action. Complete the item once its acceptance criteria pass. A failure with a known cause calls for a fix and another check against the same criterion. If the cause is unclear, choose a small check whose possible results would lead to different fixes. Record what it revealed in `observed` and put the resulting action in the resume point. If a check cannot run, record what would make it possible and continue ready work.

Keep the item and plan version for another attempt at the same deliverable. Replan when the evidence changes what must be delivered, its dependencies, or how success is defined.

When a verified approach could help another task, record when it applies, how to use it and how to check the outcome. On reuse, record what happened in the downstream attempt. Use the [reuse feedback rules](references/task-record.md#feedback-from-reuse) to narrow an existing method or save a newly verified approach.

## Close

Check the user’s acceptance criteria against the final deliverable. Reuse evidence that still covers a criterion and run only the checks that remain. If one check covers several criteria, run it once and record the result for each criterion it covers. Record the [overall verification](references/task-record.md#overall-verification).

Once the criteria pass, the session closing the task writes the [closure fields](references/task-record.md#closing-a-task) (or runs [scripts/close-task.mjs](scripts/close-task.mjs), which writes them and changes nothing if the check then reports errors) and runs the [single-task check](scripts/check-records.mjs) with Node 20 or later. Resolve the script from the directory containing this `SKILL.md` and pass the target project root and task ID as its two arguments. That session corrects record errors as described in [resolving checker findings](references/task-record.md#resolving-checker-findings) and reruns the check. Without Node, follow [the manual review](references/task-record.md#without-node) and tell the user the script was not run. Review any newer attempt that conflicts with the cited evidence. If the deliverable falls short, reopen the affected item and verify the fix. Report completion once the deliverable meets the criteria and the final records pass the check.

Tell the user what was delivered and how it was verified, including any criterion that only its author could check. If an observation changed the approach, briefly connect the starting result, that finding and the final outcome. Link a distilled method when it will help the reader repeat the work.
