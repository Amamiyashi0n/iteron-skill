---
name: iteron-skill
description: Execute multistage tasks with verifiable milestones. Index tasks in agent.md, track the plan and verification evidence, resume from saved points, and distill reusable methods. Use for staged, verifiable work that is being planned, replanned, or resumed, including requests about 分阶段, 逐项验证, 断点续做, 恢复任务, or 重新规划.
whenToUse: Use when the work splits into at least two independently verifiable items with concrete acceptance criteria, when it may be interrupted and resumed, or when an audit trail is needed. Skip single-step changes and ordinary questions.
---

# Iteron

Use the task index to find work and the task plan to resume it. Each plan item describes a deliverable and its acceptance criteria. Each verification attempt records what was actually checked.

## Plan or resume

Find the task in `agent.md`, or register a new task using the [templates](templates/README.md). For the first task, add the [discovery pointer](references/task-record.md#discovery-pointer). In planning mode, draft the plan in conversation and save it when writes are allowed.

Keep the current plan and next action in `plan.md`. When the goal is an improvement, identify the starting observation and what outcome would count as enough. On resumption, read the last attempt for the next item so the new session can use what the previous one learned. Claim the task before writing, following the [task lifecycle](references/task-record.md#task-lifecycle) and [ownership rules](references/task-record.md#ownership).

## Work and verify

Choose a ready item, do the work, and check its acceptance criteria with project tools. Append the result to `stages/records.md` and link the item’s own passing attempt from `acceptance_ref`. Record the tested inputs as described under [evidence freshness](references/task-record.md#evidence-freshness).

Use the result to choose the next action. Complete the item once its acceptance criteria pass. A failure with a known cause calls for a fix and another check against the same criterion. If the cause is unclear, choose a small check whose possible results would lead to different fixes. Record what it revealed in `observed` and put the resulting action in the resume point. If a check cannot run, record what would make it possible and continue ready work.

Keep the item and plan version for another attempt at the same deliverable. Replan when the evidence changes what must be delivered, its dependencies, or how success is defined.

When a verified approach could help another task, record when it applies, how to use it and how to check the outcome. On reuse, record what happened in the downstream attempt. If it reveals a new limit or a better check, [update the original method](references/task-record.md#feedback-from-reuse) with that evidence.

## Close

Check each overall criterion against the final deliverable. Link applicable evidence, run the remaining checks, and record the [overall verification](references/task-record.md#overall-verification).

Once the criteria pass, the session closing the task writes the [closure fields](references/task-record.md#closing-a-task) and runs the [single-task check](scripts/check-records.mjs) with Node 20 or later: `node <skill-dir>/scripts/check-records.mjs <repo-root> <task_id>`. That session corrects record errors and reruns the check. Review any newer attempt that conflicts with the cited evidence. If the deliverable falls short, reopen the affected item and verify the fix. Report completion once the deliverable meets the criteria and the final records pass the check.

Tell the user what was delivered and how it was verified. If an observation changed the approach, briefly connect the starting result, that finding and the final outcome. Link a distilled method when it will help the reader repeat the work.
