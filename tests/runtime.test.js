import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseConfig } from "../../../harness/core/config.js";
import { createHarnessRuntime } from "../../../harness/core/runtime.js";

async function createRuntime() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-harness-"));
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
      debug: false
    })
  );
  await runtime.init();
  return { root, runtime };
}

test("runtime init bootstraps the harness scaffold and main agent", async () => {
  const { root, runtime } = await createRuntime();
  const status = await runtime.status();

  assert.equal(status.registry.agents.length, 1);
  assert.equal(status.registry.agents[0].id, "main");
  assert.equal(status.index.counts.docs > 0, true);

  const orgDoc = await fs.readFile(path.join(root, "ORG.md"), "utf8");
  assert.match(orgDoc, /OpenClaw Harness/);
});

test("workflow transitions enforce stage order", async () => {
  const { runtime } = await createRuntime();
  const workflow = await runtime.createWorkflow("add_feature", {
    ownerAgent: "main",
    objective: "Add a reusable workflow runtime"
  });

  assert.equal(workflow.current_stage, "intake");

  const advanced = await runtime.advanceWorkflow(workflow.workflow_id, {
    to: "research"
  });
  assert.equal(advanced.current_stage, "research");

  await assert.rejects(
    () =>
      runtime.advanceWorkflow(workflow.workflow_id, {
        to: "verify"
      }),
    /Invalid stage transition/
  );
});

test("guardrails block protected commands", async () => {
  const { runtime } = await createRuntime();
  const result = await runtime.checkToolCall({
    toolName: "functions.exec_command",
    command: "git reset --hard",
    agentId: "main"
  });

  assert.equal(result.allowed, false);
  assert.match(result.violations[0], /protected command blocked/);
});

test("context packets include always-load scaffold content", async () => {
  const { runtime } = await createRuntime();
  const packet = await runtime.buildContextPacket(
    {
      prompt: "Update the platform workflow docs"
    },
    {
      agentId: "main"
    }
  );

  assert.equal(packet.target_agent, "main");
  assert.equal(packet.included_docs.includes("ORG.md"), true);
  assert.match(packet.frame, /Harness Context Packet/);
});

test("project validation passes on a fresh scaffold", async () => {
  const { runtime } = await createRuntime();
  const result = await runtime.validateProject();

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("workflow completion is blocked when required verification is missing", async () => {
  const { runtime } = await createRuntime();
  const workflow = await runtime.createWorkflow("add_feature", {
    ownerAgent: "main",
    objective: "Ship a new feature safely"
  });

  await runtime.advanceWorkflow(workflow.workflow_id, { to: "research" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "plan" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "review/gate" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "execute" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "verify" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "writeback" });

  await assert.rejects(
    () => runtime.advanceWorkflow(workflow.workflow_id, { to: "close/archive" }),
    /Workflow completion blocked/
  );
});

test("deployment execute stage requires explicit approval", async () => {
  const { runtime } = await createRuntime();
  const workflow = await runtime.createWorkflow("deployment", {
    ownerAgent: "main",
    objective: "Deploy a guarded change"
  });

  await runtime.advanceWorkflow(workflow.workflow_id, { to: "research" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "plan" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "review/gate" });

  await assert.rejects(
    () => runtime.advanceWorkflow(workflow.workflow_id, { to: "execute" }),
    /Deployment blocked by policy/
  );

  const approved = await runtime.advanceWorkflow(workflow.workflow_id, {
    to: "execute",
    approved: true
  });
  assert.equal(approved.current_stage, "execute");
});
