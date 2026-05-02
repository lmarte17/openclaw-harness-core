import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseConfig } from "../../../harness/core/config.js";
import { createHarnessRuntime } from "../../../harness/core/runtime.js";

async function createRuntime() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-harness-performance-"));
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
  return { runtime };
}

test("performance: context packet assembly stays within a reasonable local bound", async () => {
  const { runtime } = await createRuntime();
  const started = Date.now();
  const packet = await runtime.buildContextPacket(
    {
      prompt: "Review the harness docs and workflow templates for context assembly.",
      filePaths: ["ORG.md", "docs/architecture-overview.md", "templates/workflows/add_feature.yaml"]
    },
    {
      agentId: "main"
    }
  );
  const elapsedMs = Date.now() - started;

  assert.equal(Boolean(packet?.frame), true);
  assert.equal(elapsedMs < 1000, true);
});

