import { pluginConfigSchema, parseConfig } from "../../harness/core/config.js";
import { HARNESS_PLUGIN_ID, HARNESS_PLUGIN_NAME } from "../../harness/core/constants.js";
import { createHarnessRuntime } from "../../harness/core/runtime.js";
import { registerCli } from "../../harness/runtime/cli.js";
import {
  buildAgentEndHandler,
  buildBeforeAgentStartHandler,
  buildBeforeCompactionHandler,
  buildBeforeToolCallHandler,
  buildToolResultHandler
} from "../../harness/runtime/hooks.js";
import { registerTools } from "../../harness/runtime/tools.js";

export default {
  id: HARNESS_PLUGIN_ID,
  name: HARNESS_PLUGIN_NAME,
  description:
    "Filesystem-first harness for OpenClaw with workflows, context assembly, guardrails, audit, and bootstrap tooling.",
  kind: "runtime",
  configSchema: pluginConfigSchema,

  register(api) {
    const config = parseConfig(api.pluginConfig || {});
    const runtime = createHarnessRuntime(api, config);

    registerCli(api, runtime);
    registerTools(api, runtime);

    if (config.enableDynamicContext) {
      api.on("before_agent_start", buildBeforeAgentStartHandler(runtime));
    }

    if (config.enableGuardrails) {
      api.on("before_tool_call", buildBeforeToolCallHandler(runtime));
    }

    api.on("tool_result", buildToolResultHandler(runtime));
    api.on("agent_end", buildAgentEndHandler(runtime));
    api.on("before_compaction", buildBeforeCompactionHandler(runtime));

    api.registerService({
      id: HARNESS_PLUGIN_ID,
      start: async () => {
        await runtime.init();
      },
      stop: () => {
        runtime.logger("info", `${HARNESS_PLUGIN_ID}: stopped`);
      }
    });
  }
};

