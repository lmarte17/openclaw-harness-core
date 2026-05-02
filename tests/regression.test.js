import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseConfig } from "../../../harness/core/config.js";
import { createHarnessRuntime } from "../../../harness/core/runtime.js";

async function createRuntime() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-harness-regression-"));
  const api = {
    homeDir: root,
    logger: {
      info() {},
      debug() {},
      error() {},
      warn() {}
    }
  };
  const runtime = createHarnessRuntime(
    api,
    parseConfig({
      defaultAgentId: "main",
      projectId: "default",
      contextBudgets: {
        total_chars: 2500,
        always_load_ratio: 0.25,
        task_load_ratio: 0.45,
        artifact_load_ratio: 0.3
      }
    })
  );
  await runtime.init();
  return { root, runtime };
}

async function loadFixture(name) {
  const fixturePath = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

test("regression: approval-gated paths create approval request artifacts", async () => {
  const { root, runtime } = await createRuntime();
  const codingTask = await loadFixture("coding-task.json");
  const workflow = await runtime.createWorkflow(codingTask.templateId, codingTask);

  const result = await runtime.checkToolCall({
    toolName: "functions.exec_command",
    command: "touch cron/jobs.json",
    paths: ["cron/jobs.json"],
    agentId: "main",
    workflowId: workflow.workflow_id
  });

  assert.equal(result.allowed, true);
  assert.equal(result.approvals_required.length, 1);
  assert.equal(result.approval_request_paths.length, 1);

  const approvalPath = path.join(root, result.approval_request_paths[0]);
  const approval = await fs.readFile(approvalPath, "utf8");
  assert.match(approval, /status: pending/);
});

test("regression: context packets stay inside configured budgets under overload", async () => {
  const { runtime } = await createRuntime();
  const contextOverload = await loadFixture("context-overload.json");
  const packet = await runtime.buildContextPacket(contextOverload, { agentId: "main" });
  const totalUsed =
    packet.budget_stats.always_chars +
    packet.budget_stats.task_chars +
    packet.budget_stats.artifact_chars;

  assert.equal(totalUsed <= packet.budget_stats.total_chars_budget, true);
});

test("regression: reports surface pending approvals and stale sources", async () => {
  const { runtime } = await createRuntime();
  const check = await runtime.checkToolCall({
    toolName: "functions.exec_command",
    command: "touch cron/jobs.json",
    paths: ["cron/jobs.json"],
    agentId: "main"
  });

  const approvalPath = check.approval_request_paths[0];
  const approvalId = approvalPath
    ? (await runtime.store.readYaml(approvalPath, null))?.approval_id
    : null;
  if (approvalId) {
    await runtime.resolveApprovalRequest(approvalId, "approved", "main", "Fixture approval.");
  }

  const report = await runtime.generateReport(30);
  assert.equal(Array.isArray(report.pending_approvals), true);
  assert.equal(report.approval_latency_ms_avg !== null, true);
  assert.equal(Array.isArray(report.stale_sources), true);
});
