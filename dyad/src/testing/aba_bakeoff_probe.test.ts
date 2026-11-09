// @vitest-environment node
//
// ABA bakeoff — probe. Proves that dyad's REAL chat pipeline can be driven
// headlessly against the local LiteLLM gateway through a custom provider row,
// before we spend a full agentic run on task 0001.
//
// Private Stage-1 use of dyad's machinery for the app-builder-automation
// bakeoff. Not part of dyad's product surface.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.NODE_ENV = "development";
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
const MODEL = process.env.ABA_MODEL ?? "ih/ag/gemini-3.8-flash-high";
const KEY = process.env.HADES_LITELLM_API_KEY ?? "";

describe("aba bakeoff probe (dyad machinery -> local gateway)", () => {
  let harness: ChatFlowHarness;

  beforeAll(async () => {
    harness = await setupChatFlowHarness({
      electronMock: h,
      fixtureApp: "minimal",
      provider: { id: "localgw", name: "Local Gateway", apiBaseUrl: GATEWAY },
      model: {
        displayName: "Gemini 3.8 Flash",
        apiName: MODEL,
        maxOutputTokens: 32_000,
        contextWindow: 1_000_000,
      },
      selectedModel: { provider: "localgw", name: MODEL },
      settings: {
        providerSettings: { localgw: { apiKey: { value: KEY } } },
      },
      useFakeCatalog: false,
      engine: false,
      chatMode: "build",
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it("streams from the gateway and applies a file write", async () => {
    const { result, event, messages } = await harness.streamChat(
      'Create a file at src/aba-probe.txt whose entire contents are exactly: probe-ok',
      { requestedChatMode: "build" },
    );

    const err = event("chat:response:error");
    if (err) {
      throw new Error(
        `chat:response:error -> ${JSON.stringify(err.payload).slice(0, 1500)}`,
      );
    }

    const assistant = messages.find((m) => m.role === "assistant");
    console.log(
      "[probe] assistant content (first 400):",
      (assistant?.content ?? "").slice(0, 400),
    );
    console.log("[probe] files:", harness.getAppFiles().map((f) => f.relativePath));

    expect(harness.appFileExists("src/aba-probe.txt")).toBe(true);
    expect(harness.readAppFile("src/aba-probe.txt")).toContain("probe-ok");
    expect(result).toBe(harness.chatId);
  }, 180_000);
});
