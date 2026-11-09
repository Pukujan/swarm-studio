// @vitest-environment node
//
// ABA rewire — full E2E run (increment 2). Drives the COPIED dyad tree's own
// Pro agent loop (handleLocalAgentStream) end to end against our BYOK gateway
// on task 0001 (the personal-branding dashboard), from the pipeline/scaffold
// fixture, with the typecheck+build repair loop and RUN_META output — the same
// shape as aba_bakeoff_run.test.ts but in local-agent mode with the Pro
// settings shim. This is the gate that proves the copied engine generates a
// real frontend. Not part of dyad's product surface.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const h = vi.hoisted(() => {
  process.env.NODE_ENV = "development";
  // dyad reads these at module load and defaults to api.dyad.sh; both are
  // fetched while installing deps or reading effective settings. Point them at
  // a dead loopback port so those steps fall back to bundled defaults and the
  // run makes no dyad.sh request. Serving our own is increment 2b.
  process.env.DYAD_DEFAULT_APPROVE_BUILDS_URL =
    "http://127.0.0.1:9/default-approve-builds.txt";
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
const FIXTURE = process.env.ABA_FIXTURE ?? "";
const OUT = process.env.ABA_OUT ?? "";
const PROMPT_FILE = process.env.ABA_PROMPT_FILE ?? "";
const NODE_MODULES_SRC = process.env.ABA_NODE_MODULES ?? "";
// Total model turns including the first build turn.
const MAX_TURNS = Number(process.env.ABA_MAX_TURNS ?? "5");

// Task prompts are the block between the first two `---` rules.
function readPrompt(file: string): string {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/m);
  return (m ? m[1] : raw).trim();
}

function runScript(appDir: string, cmd: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, {
    cwd: appDir,
    encoding: "utf8",
    shell: true,
    timeout: 300_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0, out };
}

// Run the app's real gates. Mirrors run-dyad-pro.mjs: prefer the app's own
// `typecheck` script, else fall back to tsc (the scaffold ships no script).
// Returns "" when both pass, else the failure text.
function gateFailures(appDir: string): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(appDir, "package.json"), "utf8"),
  );
  const tc = pkg.scripts?.typecheck
    ? runScript(appDir, "npm", ["run", "typecheck"])
    : runScript(appDir, "npx", ["tsc", "--noEmit", "-p", "tsconfig.app.json"]);
  const bd = runScript(appDir, "npm", ["run", "build"]);
  const parts: string[] = [];
  if (!tc.ok) parts.push(`typecheck failed:\n${tc.out.slice(-2500)}`);
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

describe("aba rewire — full E2E (local-agent loop on task 0001)", () => {
  let harness: ChatFlowHarness;

  beforeAll(async () => {
    if (!FIXTURE || !fs.existsSync(FIXTURE)) {
      throw new Error(`ABA_FIXTURE not found: ${FIXTURE}`);
    }
    if (!PROMPT_FILE || !fs.existsSync(PROMPT_FILE)) {
      throw new Error(`ABA_PROMPT_FILE not found: ${PROMPT_FILE}`);
    }
    routeAuxRolesToGateway(MODEL);
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

  it(`builds task 0001 through the agent loop with ${MODEL}`, async () => {
    const prompt = readPrompt(PROMPT_FILE);
    console.log(`[rewire] model=${MODEL} maxTurns=${MAX_TURNS}`);

    const stream = async (label: string, userText: string) => {
      const { event } = await harness.streamChat(userText, {
        requestedChatMode: "local-agent",
      });
      const err = event("chat:response:error");
      if (err) {
        throw new Error(
          `${label} chat:response:error -> ${JSON.stringify(err.payload).slice(0, 2000)}`,
        );
      }
      console.log(`[rewire] ${label} done`);
    };

    await stream("turn 1 (build)", prompt);

    let failures = gateFailures(harness.appDir);
    let turn = 1;
    while (failures && turn < MAX_TURNS) {
      turn += 1;
      console.log(`[rewire] turn ${turn}: repairing build/typecheck`);
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
    console.log(`[rewire] ${files.length} files, ${commits.length} commits, turns=${turn}`);
    console.log(`[rewire] gates: ${failures ? "FAIL" : "PASS"}`);

    // Egress proof: the fake server stands in for the Dyad engine, so any model
    // call the loop made through the engine transport lands in this ledger as a
    // request to /engine/v1/{chat/completions,responses,messages}. Zero such
    // requests means every model role resolved to the local gateway instead.
    const requests = harness.getFakeRequests();
    const engineModelCalls = requests.filter((r) =>
      /\/engine\/v1\/(chat\/completions|responses|messages)$/.test(r.path),
    );
    const enginePaths = requests
      .filter((r) => r.path.startsWith("/engine/v1/"))
      .map((r) => r.path);
    console.log(
      `[rewire] fake-server requests: ${requests.length} total, ` +
        `engine model calls: ${engineModelCalls.length}, engine paths: ${JSON.stringify(enginePaths)}`,
    );
    expect(engineModelCalls).toEqual([]);

    if (OUT) {
      copyOut(harness.appDir, OUT);
      fs.writeFileSync(
        path.join(OUT, "RUN_META.json"),
        JSON.stringify(
          {
            model: MODEL,
            chatMode: "local-agent",
            turns: turn,
            gatesPassed: !failures,
            files: files.map((f) => f.relativePath),
            commits,
          },
          null,
          2,
        ),
      );
      console.log(`[rewire] copied app to ${OUT}`);
    }

    expect(files.length).toBeGreaterThan(0);
    // The floor itself is scored by eval/verify-app.mjs; here we only require
    // that the app's own gates pass after the repair loop.
    expect(failures).toBe("");
    // A multi-turn agentic build of the scaffold on this fixture can run well
    // past 40 minutes, so the cap is generous rather than tight.
  }, 5_400_000);
});
