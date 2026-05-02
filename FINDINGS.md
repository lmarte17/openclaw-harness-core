# OpenClaw Harness Core Analysis

## 1. Overview & Purpose
The `openclaw-harness-core` extension is the central filesystem-first framework designed for workflow routing, context packet assembly, guardrail evaluation, audit trails, and agent bootstrapping. It registers an extensive suite of `harness_*` tools.

## 2. Were the Other Packages Actually Redundant?
**Yes, completely.**
The previous packages (`openclaw-audit-reflection`, `openclaw-context-arch`, and `openclaw-guardrails`) were wrapping the exact same logic. `openclaw-harness-core`'s internal `registerTools()` method *already* registers:
- `harness_report` and `harness_recent_audit_events` (Redundant via `openclaw-audit-reflection`)
- `harness_context_packet` and `harness_prune_rules` (Redundant via `openclaw-context-arch`)
- `harness_guardrails_check` and `harness_policy_inspect` (Redundant via `openclaw-guardrails`)

Because these smaller packages all instantiated their own copies of `createHarnessRuntime()` and `runtime.init()`, they forced OpenClaw to boot five separate, conflicting copies of the same core filesystem routines on startup. 

## 3. Are Our Agents Actually Implementing It?
**No, they are not.**
Despite being the core framework, the agents are entirely detached from its toolset:
- In `.openclaw/openclaw.json`, none of the agents (`main`, `orchestrator`, `netbox`, `browser-use`) list a single `harness_*` tool in their `tools.allow` arrays.
- Instead, every agent explicitly depends on `iat_workflow_create`, `iat_task_create`, etc., confirming a full architectural shift to the newer `openclaw-inter-agent-tasks` extension for coordination and workflow execution.

## 4. Architectural Findings
Although agents previously had no access to `harness_*` tools, the `openclaw-harness-core` plugin provides capabilities that IAT does not — and the two systems are complementary, not redundant:

- **IAT** is the coordination plane: task routing, worker assignment, dependency tracking across agents.
- **Harness-core** is the safety and observability plane: per-call guardrail enforcement, dynamic context injection, structured audit/decision/failure records, and agent bootstrapping.

The hooks registered and their conditionality:
- `before_agent_start` — builds and injects a context packet before the agent sees the prompt. **Conditional**: only registered when `config.enableDynamicContext === true`.
- `before_tool_call` — evaluates every tool call against the active policy pack. **Conditional**: only registered when `config.enableGuardrails === true`.
- `tool_result` — writes structured audit records. **Always registered**.
- `agent_end` — writes audit records on session end. **Always registered**.
- `before_compaction` — rebuilds filesystem indexes before context compression. **Always registered**.

The original finding that agents couldn't see or interact with these hooks was the real problem, not the hooks themselves.

## 5. Resolution
The four splinter packages (`openclaw-audit-reflection`, `openclaw-context-arch`, `openclaw-guardrails`, `openclaw-workflow-tools`) have been removed — they were redundant wrappers around this plugin.

`openclaw-harness-core` has been kept and all `harness_*` tools have been added to the appropriate agent allow lists:
- `main`: full tool suite (all 19 tools)
- `orchestrator`: coordination + observability tools (14 tools, excluding admin-only bootstrap/init)
- `netbox`, `browser-use`: worker observability tools (`harness_write_decision`, `harness_write_failure`, `harness_guardrails_check`, `harness_policy_inspect`)