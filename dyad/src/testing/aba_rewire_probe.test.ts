// @vitest-environment node
//
// ABA rewire — probe (increment 2). Proves the COPIED dyad tree's own Pro
// agent loop (handleLocalAgentStream) runs headlessly against our BYOK
// gateway: custom provider row + the Pro settings shim (enableDyadPro + an
// "auto" provider key so isDyadProEnabled passes) + DYAD_ENGINE_URL pointed at
// the harness's fake engine so billing/user-info never leaves the machine.
//
// This is the gate between "the tree is installed" and "the full generation
// run is worth spending model tokens on". Not part of dyad's product surface.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.NODE_ENV = "development";
  // dyad's socket_firewall reads this at module load and defaults to
  // https://api.dyad.sh/v1/default-approve-builds.txt. Point it at a dead
  // loopback port so any pnpm allow-builds step falls back to dyad's bundled
  // allowlist and the probe makes no dyad.sh request.
  process.env.DYAD_DEFAULT_APPROVE_BUILDS_URL =
    "http://127.0.0.1:9/default-approve-builds.txt";
  // readEffectiveSettings() fetches this at runtime and defaults to
  // https://api.dyad.sh/v1/desktop-config. Same dead-port treatment so the
  // probe reads no remote settings.
  process.env.DYAD_DESKTOP_CONFIG_URL = "http://127.0.0.1:9/desktop-config";
  return { ipcHandlers: new Map() };
});

vi.mock("electron", async () => {
  const { createElectronMock } = await import("@/testing/electron_mock");
  return createElectronMock(h);
});

import {
  setupChatFlowHarness,
  type ChatFlowHarness,
} from "@/testing/chat_flow_harness";

const GATEWAY = process.env.ABA_GATEWAY_URL ?? "http://127.0.0.1:4000/v1";
const MODEL = process.env.ABA_MODEL ?? "ih/cb/deepseek-v4.1-flash";
const KEY = process.env.HADES_LITELLM_API_KEY ?? "";

// Every auxiliary model role (compaction, subagents, safety review) resolves
// through the one canonical config and is routed to the same local gateway the
// chat model uses — never the Dyad engine.
const AUX_ROLES = [
  "COMPACTION",
  "SUBAGENT_EXPLORER",
  "SUBAGENT_IMPLEMENTER",
  "SUBAGENT_REVIEWER",
  "EXPLORE_CODE",
  "EXPLORE_HISTORY",
  "SAFETY_REVIEW",
  "THEMES",
] as const;
function routeAuxRolesToGateway(model: string) {
  for (const role of AUX_ROLES) {
    process.env[`ABA_MODEL_${role}`] = `${model}@localgw`;
  }
}

describe("aba rewire probe (local-agent loop -> local gateway)", () => {
  let harness: ChatFlowHarness;

  beforeAll(async () => {
    routeAuxRolesToGateway(MODEL);
    harness = await setupChatFlowHarness({
      electronMock: h,
      fixtureApp: "minimal",
      provider: { id: "localgw", name: "Local Gateway", apiBaseUrl: GATEWAY },
      model: {
        displayName: "ABA Model",
        apiName: MODEL,
        maxOutputTokens: 32_000,
        contextWindow: 1_000_000,
      },
      selectedModel: { provider: "localgw", name: MODEL },
      settings: {
        enableDyadPro: true,
        providerSettings: {
          auto: { apiKey: { value: KEY } },
          localgw: { apiKey: { value: KEY } },
        },
      },
      // Keep every network face on the harness fake server: the model catalog
      // (else it fetches api.dyad.sh) and the engine/gateway (else billing
      // posts to engine.dyad.sh). The run must make zero dyad.sh requests.
      useFakeCatalog: true,
      engine: true,
      chatMode: "local-agent",
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it("streams through the Pro agent loop and applies a file write", async () => {
    const { result, event, messages } = await harness.streamChat(
      'Create a file at src/aba-rewire-probe.txt whose entire contents are exactly: rewire-ok',
      { requestedChatMode: "local-agent" },
    );

    const err = event("chat:response:error");
    if (err) {
      throw new Error(
        `chat:response:error -> ${JSON.stringify(err.payload).slice(0, 1500)}`,
      );
    }

    // local-agent mode completes without a legacy chat-id result (the loop
    // sends chat:stream:end / chat:response:end instead).
    expect(result).toBeUndefined();

    const assistant = messages.find((m) => m.role === "assistant");
    console.log(
      "[rewire-probe] assistant content (first 600):",
      (assistant?.content ?? "").slice(0, 600),
    );
    console.log(
      "[rewire-probe] files:",
      harness.getAppFiles().map((f) => f.relativePath),
    );
    console.log("[rewire-probe] git:", harness.gitLog());

    expect(harness.appFileExists("src/aba-rewire-probe.txt")).toBe(true);
    expect(harness.readAppFile("src/aba-rewire-probe.txt")).toContain(
      "rewire-ok",
    );

    // Egress proof: the fake server stands in for the Dyad engine, so a model
    // call routed through the engine transport would land here as a request to
    // /engine/v1/{chat/completions,responses,messages}. Zero such requests means
    // the Pro agent loop's model roles all resolved to the local gateway.
    const requests = harness.getFakeRequests();
    const engineModelCalls = requests.filter((r) =>
      /\/engine\/v1\/(chat\/completions|responses|messages)$/.test(r.path),
    );
    console.log(
      "[rewire-probe] fake-server requests:",
      requests.length,
      "engine model calls:",
      engineModelCalls.length,
    );
    expect(engineModelCalls).toEqual([]);
  }, 180_000);
});
