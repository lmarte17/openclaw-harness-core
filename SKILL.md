# Harness Core Skill

Filesystem-first safety and observability layer for OpenClaw. Provides per-call guardrail enforcement, dynamic context injection, structured audit/decision/failure records, agent bootstrapping, and harness workflow management.

All tools use the `harness_` prefix. State is persisted under `.openclaw/harness/`.

---

## Architecture

Harness-core is the **safety and observability plane** — it runs alongside IAT (the coordination plane) and serves a different purpose:

| System | Role |
|--------|------|
| **IAT** | Cross-agent task routing, worker assignment, workflow coordination |
| **Harness-core** | Per-call policy enforcement, context injection, audit trail, structured records |

### Passive hooks (always running)

These fire automatically without any agent tool call:

| Hook | When | What it does | Config gate |
|------|------|-------------|-------------|
| `before_agent_start` | Before every prompt | Builds a context packet from harness docs and prepends it to the agent's context | `enableDynamicContext: true` |
| `before_tool_call` | Before every tool execution | Evaluates the call against the active policy pack. Throws if blocked | `enableGuardrails: true` |
| `tool_result` | After every tool execution | Writes a structured audit record | always |
| `agent_end` | When a session ends | Writes session-level audit record | always |
| `before_compaction` | Before context compression | Rebuilds filesystem indexes | always |

Both `enableDynamicContext` and `enableGuardrails` are currently `true` in `openclaw.json`.

---

## Tool reference

### Observability tools

#### `harness_report`
Generate a high-level observability report: workflow activity, audit event summary, policy coverage, stale sources.

```json
{ "days": 30 }
```

Call this to get a snapshot of harness health and recent activity.

---

#### `harness_recent_audit_events`
Read recent harness audit events (tool calls, session ends, guardrail checks).

```json
{ "limit": 20 }
```

---

#### `harness_validate_project`
Validate the project scaffold: required directories, registry integrity, template validity.

```json
{}
```

Run after making structural changes to the harness directory, or when debugging missing context/policy issues.

---

### Guardrails & policy tools

#### `harness_guardrails_check`
Evaluate a tool call or shell command against the active policy pack before executing it. Use for pre-flight checks on risky operations.

```json
{
  "toolName": "nb_delete",
  "paths": ["dcim.devices"],
  "agentId": "netbox",
  "workflowId": "wf_abc123"
}
```

```json
{
  "command": "git push --force origin main",
  "agentId": "main"
}
```

Returns `{ allowed, violations, approvals_required }`. If `allowed: false`, surface the violations to the user before proceeding.

---

#### `harness_policy_inspect`
Inspect the resolved policy pack for an agent.

```json
{ "agentId": "netbox" }
```

Returns the full policy pack including rules, risk thresholds, and approval requirements. Use to understand why a guardrail blocked something.

---

#### `harness_attach_policy_pack`
Attach or replace a policy pack for an agent.

```json
{
  "agentId": "netbox",
  "policyPackId": "infra-strict"
}
```

---

#### `harness_approval_resolve`
Resolve a harness-level approval request artifact.

```json
{
  "approvalId": "appr_harness_123",
  "status": "approved",
  "reviewer": "marteclaw",
  "note": "Confirmed with ops team"
}
```

---

### Record-writing tools

These write structured, durable records to the harness audit filesystem. Use them to document significant decisions and failures so they can be reviewed and learned from.

#### `harness_write_decision`
Write a structured decision record. Use when making an architectural choice, selecting an approach, or making a judgment call that should be traceable.

```json
{
  "title": "Use bulk PATCH instead of individual updates for rack decommission",
  "rationale": "47 devices to update — individual calls would exhaust the rate limit and take 4+ minutes",
  "alternatives_considered": [
    "Sequential single-object PATCH calls",
    "Manual CSV export and re-import"
  ],
  "impact_scope": ["dcim.devices", "workflow-rack-decommission"],
  "rollback_implications": "Would require re-PATCHing all 47 devices to restore previous status",
  "workflowId": "wf_abc123"
}
```

---

#### `harness_write_failure`
Write a structured failure record. Use when something went wrong and you want to document the root cause and fix for future reference.

```json
{
  "symptom": "nb_create returned ValidationError for all 12 device records",
  "root_cause": "device_type IDs in payload were from staging NetBox — not valid in production",
  "contributing_context": ["Payload was generated from a staging export without ID remapping"],
  "impacted_artifacts": ["workspace/data/device-import-payload.json"],
  "guardrail_status": "not_triggered",
  "fix_applied": "Queried production device_type IDs via nb_query and remapped the payload",
  "prevention_guidance": "Always resolve IDs against the target NetBox instance before bulk creates",
  "confidence": 0.95,
  "workflowId": "wf_abc123"
}
```

---

### Context tools

#### `harness_context_packet`
Build and inspect the context packet the harness would inject for a given prompt. Useful for understanding what context is being prepended to agents.

```json
{
  "prompt": "Audit rack density at the ny01 site",
  "filePaths": ["workspace/projects/nb-proj/system/workflows/wf_abc123.json"],
  "workflowId": "wf_abc123"
}
```

Returns the assembled context frame.

---

#### `harness_prune_rules`
Identify stale context sources and documents not referenced within the given threshold. Returns candidates for pruning review.

```json
{ "days": 30 }
```

---

#### `harness_rebuild_indexes`
Rebuild the harness filesystem index. Run after adding new docs, templates, or agents.

```json
{}
```

---

### Harness workflow tools

Harness workflows are file-based coordination records distinct from IAT workflows. They track multi-stage work with structured verification and handoff records.

#### `harness_workflow_create`
Create a harness workflow from a template.

```json
{
  "templateId": "infra-audit",
  "ownerAgent": "main",
  "assignedAgents": ["netbox", "orchestrator"],
  "objective": "Full rack density audit for ny01",
  "riskLevel": "advisory"
}
```

---

#### `harness_workflow_advance`
Advance a harness workflow to the next stage.

```json
{
  "workflowId": "hwf_abc123",
  "to": "verification",
  "note": "Data collection complete, moving to verification stage"
}
```

---

#### `harness_workflow_verify`
Attach a verification result to a harness workflow.

```json
{
  "workflowId": "hwf_abc123",
  "name": "data-completeness-check",
  "status": "passed",
  "details": "All 12 racks present, device counts match NB export"
}
```

---

#### `harness_handoff_create`
Create a structured handoff attached to a harness workflow.

```json
{
  "workflowId": "hwf_abc123",
  "sourceAgent": "main",
  "targetAgent": "netbox",
  "objective": "Query all devices in racks at ny01 and return density percentages",
  "scope": ["dcim.devices", "dcim.racks", "dcim.sites"],
  "constraints": ["Read-only operations only", "Do not modify any device records"],
  "verificationRequirements": ["Device count per rack matches total rack unit capacity data"]
}
```

---

### Project management tools

#### `harness_init_project`
Initialize or re-initialize the harness project layout. Creates required directories, seeds root docs, policy packs, workflow templates, and agent registry if missing.

```json
{}
```

Run once when setting up a new environment, or to repair a damaged harness layout.

---

#### `harness_create_workflow_template`
Create a new workflow template by copying an existing one.

```json
{
  "sourceTemplateId": "infra-audit",
  "newTemplateId": "netbox-device-audit"
}
```

---

### Agent management tools

#### `harness_bootstrap_agent`
Create a new agent in the harness registry, initialize its memory-plus store, and optionally scaffold its workspace with `AGENTS.md`, `SOUL.md`, and supporting files.

```json
{
  "id": "tickets",
  "displayName": "Tickets Agent",
  "domain": "issue-tracking",
  "templateId": "service-agent",
  "policyPack": "read-write-safe",
  "workspacePath": "workspace-tickets"
}
```

Pass `workspacePath` (relative to harness root) to scaffold the full workspace. Omit it to register the agent in the harness only.

---

## Common workflows

### Pre-flight check a risky operation

```
1. harness_guardrails_check  toolName=..., paths=..., agentId=...
2. if allowed: proceed
3. if blocked: harness_policy_inspect agentId=...  → understand the rule
4. if approval_required: surface to user, wait for harness_approval_resolve
```

### Document a significant decision

```
1. harness_write_decision  title=..., rationale=..., alternatives_considered=[...]
```

Call this whenever making a non-obvious architectural choice during a workflow. The record is written to the harness audit filesystem and factored into future context packets.

### Debug a guardrail block

```
1. harness_policy_inspect  agentId=<blocked agent>   → read the policy
2. harness_recent_audit_events  limit=20              → find the blocked call
3. harness_report                                      → broader health overview
```

### Bootstrap a new agent

```
1. harness_bootstrap_agent  id=..., displayName=..., workspacePath=...
2. harness_validate_project                            → confirm layout is clean
3. [update openclaw.json to add agent + tool allow list]
4. iat_worker_register  worker_id=..., supported_task_types=[...]
```

### Maintain harness health

```
1. harness_validate_project          → check for structural issues
2. harness_prune_rules  days=30      → find stale context sources
3. harness_rebuild_indexes           → refresh after adding docs/templates
4. harness_report                    → activity and coverage overview
```

---

## Tips

- `harness_write_decision` and `harness_write_failure` are cheap to call and valuable long-term. Write them liberally for any non-trivial choice or unexpected failure.
- `harness_guardrails_check` is a pre-flight tool — call it before any `external_write` or `infrastructure_change` operation, not after.
- The passive `before_tool_call` hook runs `harness_guardrails_check` automatically for every tool call. The active tool lets you check explicitly before a sequence of operations, or to understand a block that already happened.
- Harness workflows (`hwf_*`) and IAT workflows (`wf_*`) coexist — harness workflows are for structured file-based audit trails with verification gates, IAT workflows are for live cross-agent task routing.
- `harness_rebuild_indexes` is called automatically on every `before_compaction` event. You only need to call it manually after structural changes outside of normal agent operation.
