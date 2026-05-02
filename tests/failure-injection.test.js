import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseConfig } from "../../../harness/core/config.js";
import { createHarnessRuntime } from "../../../harness/core/runtime.js";

async function createRuntime() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-harness-failure-"));
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

test("failure injection: failed tool results create a failure record and playbook candidate", async () => {
  const { root, runtime } = await createRuntime();
  const workflow = await runtime.createWorkflow("bugfix", {
    ownerAgent: "main",
    objective: "Reproduce a known failure"
  });

  await runtime.handleToolResult(
    {
      toolName: "functions.exec_command",
      command: "npm test",
      failed: true,
      error: "Tests failed with a missing workflow transition handler.",
      paths: ["src/runtime.js", "tests/runtime.test.js"]
    },
    {
      agentId: "main",
      workflowId: workflow.workflow_id
    }
  );

  const failureFiles = await fs.readdir(path.join(root, "failures", new Date().toISOString().slice(0, 4)));
  const playbookCandidates = await fs.readFile(path.join(root, "playbooks", "candidates.jsonl"), "utf8");

  assert.equal(failureFiles.length > 0, true);
  assert.match(playbookCandidates, /Playbook candidate/);
});

