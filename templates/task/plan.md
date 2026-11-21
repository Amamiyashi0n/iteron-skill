# {{title}}

- task_id: `{{task_id}}`
- plan_timestamp: `{{plan_timestamp}}`
- status: {{status}}
- owner: `{{owner}}` claimed `{{claimed_at}}`
- next_item_number: `{{next_item_number}}`
- search_terms: {{search_terms}}
- goal: {{goal}}
- requirements: {{requirements}}
- constraints: {{constraints}}
- baseline: {{optional: starting observation, its input, and what outcome counts as enough}}
- overall_acceptance:
  - O-1: {{overall_criterion}}
- overall_acceptance_ref: -

## Resume Point

- confirmed: {{confirmed}}
- pending_checks: {{pending_checks}}
- next_action: {{next_action}}

## Current Plan

| item_id | requirement | expected_result | depends_on | acceptance_criteria | status | acceptance_ref |
| --- | --- | --- | --- | --- | --- | --- |
| {{item_id}} | {{requirement}} | {{expected_result}} | {{depends_on}} | {{acceptance_criteria}} | pending | - |
