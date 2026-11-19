---
name: iteron-skill
description: "Plan and execute work that splits into independently verifiable stages. Record acceptance evidence in the project, resume from saved progress, and distill reusable methods. Use for staged work, replanning, and handoffs, including 分阶段、逐项验证、断点续做、恢复任务 and 重新规划. Skip single-step changes and ordinary questions."
---

# Iteron

Use the task index to find work and the task plan to resume it. Each plan item describes a deliverable and its acceptance criteria. Each verification attempt records what was actually checked.

## Plan or resume

Find the task in `agent.md`. Keep existing tasks in their recorded `.agent/` or `agent/` directory. Create new tasks under `.agent/` using the [templates](templates/README.md). For the first task, follow the [discovery pointer rule](references/task-record.md#discovery-pointer) for the current agent. In planning mode, draft the plan in conversation and save it when writes are allowed.

Keep the current plan and next action in `plan.md`. When the goal is an improvement, identify the starting observation and what outcome would count as enough. On resumption, compare the plan with the latest attempt for the next item. If a passing attempt was saved before the plan was updated, check whether it still covers the current inputs and criteria, then link it and continue if it applies. If that attempt says `revision: none`, rerun the check and cite the new passing attempt. Claim the task before writing, following the [task lifecycle](references/task-record.md#task-lifecycle) and [ownership rules](references/task-record.md#ownership).

## Work and verify

Choose a ready item, do the work, and check its acceptance criteria with project tools. Append the result to `stages/records.md` and link the item’s own passing attempt from `acceptance_ref`. Record the tested inputs as described under [evidence freshness](references/task-record.md#evidence-freshness).

Use the result to choose the next action. Complete the item once its acceptance criteria pass. A failure with a known cause calls for a fix and another check against the same criterion. If the cause is unclear, choose a small check whose possible results would lead to different fixes. Record what it revealed in `observed` and put the resulting action in the resume point. If a check cannot run, record what would make it possible and continue ready work.

Keep the item and plan version for another attempt at the same deliverable. Replan when the evidence changes what must be delivered, its dependencies, or how success is defined.

When a verified approach could help another task, record when it applies, how to use it and how to check the outcome. On reuse, record what happened in the downstream attempt. Use the [reuse feedback rules](references/task-record.md#feedback-from-reuse) to narrow an existing method or save a newly verified approach.

## Close

Check the user’s acceptance criteria against the final deliverable. Reuse evidence that still covers a criterion and run only the checks that remain. If one check covers several criteria, run it once and record the result for each criterion it covers. Record the [overall verification](references/task-record.md#overall-verification).

Once the criteria pass, the session closing the task writes the [closure fields](references/task-record.md#closing-a-task) and runs the [single-task check](scripts/check-records.mjs) with Node 20 or later. Resolve the script from the directory containing this `SKILL.md` and pass the target project root and task ID as its two arguments. That session corrects record errors and reruns the check. Review any newer attempt that conflicts with the cited evidence. If the deliverable falls short, reopen the affected item and verify the fix. Report completion once the deliverable meets the criteria and the final records pass the check.

Tell the user what was delivered and how it was verified. If an observation changed the approach, briefly connect the starting result, that finding and the final outcome. Link a distilled method when it will help the reader repeat the work.
