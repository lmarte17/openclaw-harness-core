import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseConfig } from "../../../harness/core/config.js";
import { createHarnessRuntime } from "../../../harness/core/runtime.js";

async function createRuntime() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-harness-integration-"));
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
      projectId: "default"
    })
  );
  await runtime.init();
  return { root, runtime };
}

test("integration: workflow, handoff, verification, and archival work end to end", async () => {
  const { root, runtime } = await createRuntime();
  const workflow = await runtime.createWorkflow("add_feature", {
    ownerAgent: "main",
    objective: "Implement workflow integration"
  });

  const handoff = await runtime.attachHandoff(workflow.workflow_id, {
    targetAgent: "main",
    objective: "Perform bounded implementation work",
    scope: ["workflow runtime"],
    constraints: ["Preserve file-backed state"],
    verificationRequirements: ["tests"]
  });

  await runtime.advanceWorkflow(workflow.workflow_id, { to: "research" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "plan" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "review/gate" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "execute" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "verify" });
  await runtime.recordVerification(workflow.workflow_id, {
    name: "tests",
    status: "pass",
    details: "Fixture verification passed."
  });
  await runtime.recordVerification(workflow.workflow_id, {
    name: "review",
    status: "pass",
    details: "Fixture review passed."
  });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "writeback" });
  await runtime.advanceWorkflow(workflow.workflow_id, { to: "close/archive" });

  const archivedWorkflowPath = path.join(root, "workflows", "archive", `${workflow.workflow_id}.yaml`);
  const handoffPath = path.join(root, "handoffs", "active", `${handoff.handoff_id}.yaml`);

  assert.equal(Boolean(await fs.readFile(archivedWorkflowPath, "utf8")), true);
  assert.equal(Boolean(await fs.readFile(handoffPath, "utf8")), true);
});

test("e2e: agent bootstrap, policy attachment, and workflow template copy validate cleanly", async () => {
  const { runtime } = await createRuntime();
  const agent = await runtime.bootstrapAgent({
    id: "reviewer1",
    displayName: "Reviewer 1",
    domain: "platform",
    templateId: "reviewer",
    policyPack: "review"
  });

  assert.equal(agent.id, "reviewer1");

  const updated = await runtime.attachPolicyPack("reviewer1", "research");
  assert.equal(updated.policy_pack, "research");

  const copied = await runtime.createWorkflowTemplateFromExisting("bugfix", "bugfix_fastlane");
  assert.equal(copied.id, "bugfix_fastlane");

  const validation = await runtime.validateProject();
  assert.equal(validation.ok, true);
});
