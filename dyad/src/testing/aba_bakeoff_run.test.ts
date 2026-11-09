// @vitest-environment node
//
// ABA bakeoff — combination A (dyad's machinery) on task 0001.
//
// Drives dyad's REAL chat pipeline (chat:stream, real tag processor, real file
// writes, real git commits) headlessly against the local LiteLLM gateway, using
// a custom [OI]-compatible provider row. This is dyad's core build machinery
// (Apache-2.0). The Pro local-agent / blueprint design machinery is not used:
// it needs a Dyad Pro key.
//
// After the first build turn, this loops `npm run typecheck` + `npm run build`
// and feeds any failure back to the model, mirroring the typecheck-repair loop
// in this repo's builder (`server/src/loop.mjs`) so the two combinations get
// the same "iterate until it builds" opportunity.
//
// Private Stage-1 use for the app-builder-automation bakeoff. Not a dyad product
// test.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
const MODEL = process.env.ABA_MODEL ?? "ih/ag/gemini-3.7-flash-high";
const KEY = process.env.HADES_LITELLM_API_KEY ?? "";
const FIXTURE = process.env.ABA_FIXTURE ?? "";
const OUT = process.env.ABA_OUT ?? "";
const PROMPT_FILE = process.env.ABA_PROMPT_FILE ?? "";
const NODE_MODULES_SRC = process.env.ABA_NODE_MODULES ?? "";
// Total model turns including the first build turn.
const MAX_TURNS = Number(process.env.ABA_MAX_TURNS ?? "5");

// Task 0001's prompt is the block between the first two `---` rules.
function readPrompt(file: string): string {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/m);
  return (m ? m[1] : raw).trim();
}

function runScript(appDir: string, script: string): { ok: boolean; out: string } {
  const r = spawnSync("npm", ["run", script], {
    cwd: appDir,
    encoding: "utf8",
    shell: true,
    timeout: 300_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0, out };
}

// Run the app's real gates. Returns "" when both pass, else the failure text.
function gateFailures(appDir: string): string {
  const tc = runScript(appDir, "typecheck");
  const bd = runScript(appDir, "build");
  const parts: string[] = [];
  if (!tc.ok) parts.push(`\`npm run typecheck\` failed:\n${tc.out.slice(-2500)}`);
  if (!bd.ok) parts.push(`\`npm run build\` failed:\n${bd.out.slice(-2500)}`);
  return parts.join("\n\n");
}

// Copy the produced app out of the harness temp dir before it is disposed.
function copyOut(appDir: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(appDir, outDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== ".git" && base !== "node_modules";
    },
  });
}

describe("aba bakeoff — combination A (dyad machinery)", () => {
  let harness: ChatFlowHarness;

  beforeAll(async () => {
    if (!FIXTURE || !fs.existsSync(FIXTURE)) {
      throw new Error(`ABA_FIXTURE not found: ${FIXTURE}`);
    }
    if (!PROMPT_FILE || !fs.existsSync(PROMPT_FILE)) {
      throw new Error(`ABA_PROMPT_FILE not found: ${PROMPT_FILE}`);
    }
    harness = await setupChatFlowHarness({
      electronMock: h,
      fixtureAppPath: FIXTURE,
      provider: { id: "localgw", name: "Local Gateway", apiBaseUrl: GATEWAY },
      model: {
        displayName: "ABA Run Model",
        apiName: MODEL,
        maxOutputTokens: 32_000,
        contextWindow: 1_000_000,
      },
      selectedModel: { provider: "localgw", name: MODEL },
      settings: { providerSettings: { localgw: { apiKey: { value: KEY } } } },
      useFakeCatalog: false,
      engine: false,
      chatMode: "build",
    });
    // Make the app's own typecheck/build runnable inside the harness temp dir.
    if (NODE_MODULES_SRC && fs.existsSync(NODE_MODULES_SRC)) {
      const target = path.join(harness.appDir, "node_modules");
      if (!fs.existsSync(target)) {
        fs.symlinkSync(
          NODE_MODULES_SRC,
          target,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
    }
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it(`builds task 0001 with ${MODEL}`, async () => {
    const prompt = readPrompt(PROMPT_FILE);
    console.log(`[aba] model=${MODEL} maxTurns=${MAX_TURNS}`);

    const stream = async (label: string, userText: string) => {
      const { event } = await harness.streamChat(userText, {
        requestedChatMode: "build",
      });
      const err = event("chat:response:error");
      if (err) {
        throw new Error(
          `${label} chat:response:error -> ${JSON.stringify(err.payload).slice(0, 2000)}`,
        );
      }
      console.log(`[aba] ${label} done`);
    };

    await stream("turn 1 (build)", prompt);

    let failures = gateFailures(harness.appDir);
    let turn = 1;
    while (failures && turn < MAX_TURNS) {
      turn += 1;
      console.log(`[aba] turn ${turn}: repairing build/typecheck`);
      await stream(
        `turn ${turn} (repair)`,
        `The app does not pass its own gates. Fix every error below so that ` +
          `\`npm run typecheck\` and \`npm run build\` both succeed. Do not change ` +
          `anything else.\n\n${failures}`,
      );
      failures = gateFailures(harness.appDir);
    }

    const files = harness.getAppFiles();
    const commits = harness.gitLog();
    console.log(`[aba] ${files.length} files, ${commits.length} commits, turns=${turn}`);
    console.log(`[aba] gates: ${failures ? "FAIL" : "PASS"}`);

    if (OUT) {
      copyOut(harness.appDir, OUT);
      fs.writeFileSync(
        path.join(OUT, "RUN_META.json"),
        JSON.stringify(
          {
            model: MODEL,
            turns: turn,
            gatesPassed: !failures,
            files: files.map((f) => f.relativePath),
            commits,
          },
          null,
          2,
        ),
      );
      console.log(`[aba] copied app to ${OUT}`);
    }

    expect(files.length).toBeGreaterThan(0);
    // The floor itself is scored by eval/verify-app.mjs; here we only require
    // that the app's own gates pass after the repair loop.
    expect(failures).toBe("");
  }, 2_400_000);
});
