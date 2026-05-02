# OpenClaw Harness Core

Filesystem-first safety and observability layer for OpenClaw.

This extension provides the harness runtime used for context architecture, workflow scaffolding, guardrail checks, audit logs, structured decision/failure records, and project bootstrap state.

It is the safety and observability plane in a multi-agent OpenClaw setup. Pair it with `openclaw-inter-agent-tasks` when you want task routing and worker coordination as a separate layer.

## What it does

- Injects bounded project context before supported agent runs.
- Evaluates tool calls and shell commands against policy packs.
- Writes durable audit events for tool results and agent lifecycle events.
- Records architecture decisions and failures in structured files.
- Manages harness workflows, templates, handoffs, and verification records.
- Bootstraps and validates the harness filesystem layout.

## Runtime hooks

The plugin registers passive OpenClaw hooks:

- `before_agent_start`: builds and injects a context packet when `enableDynamicContext` is enabled.
- `before_tool_call`: checks tool calls against guardrails when `enableGuardrails` is enabled.
- `tool_result`: writes structured audit records.
- `agent_end`: writes session-level audit records.
- `before_compaction`: rebuilds filesystem indexes before context compression.

## Tool groups

All tools use the `harness_` prefix.

- Observability: reports, recent audit events, project validation.
- Guardrails: policy inspection, policy attachment, preflight checks, approval resolution.
- Records: decision records and failure records.
- Context: context packet preview, stale-source pruning, index rebuilds.
- Workflows: workflow creation, inspection, updates, handoffs, verification, and artifact tracking.
- Bootstrap: project initialization and scaffold repair.

See [SKILL.md](./SKILL.md) for the full tool reference and examples.

## Configuration

The plugin supports these options through `openclaw.plugin.json`:

- `defaultAgentId`: fallback agent owner, usually `main`.
- `projectId`: project identifier for workflow and bootstrap state.
- `projectRoot`: optional project root under the OpenClaw home.
- `enableBootstrap`: create required scaffold files when missing.
- `enableDynamicContext`: inject context packets before runs.
- `enableGuardrails`: enforce policy checks before tool calls.
- `enableWriteback`: write session state and durable records.
- `enableAudit`: append audit and policy events.
- `debug`: emit verbose plugin logs.
- `contextBudgets`: tune context packet size allocation.

## State

Harness state is persisted under the OpenClaw home, generally below:

```text
.openclaw/harness/
```

The exact paths depend on the OpenClaw home and plugin configuration.

## Development

```bash
npm run check
npm test
```

