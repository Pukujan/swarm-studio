/**
 * Headless CLI entry for dyad's in-process engine (ABA-0005 Stage B).
 *
 * Bundled by `vite.aba-headless.config.mts` into `.vite/aba-headless/` and run
 * with plain `node` — no Electron, no vitest. It boots dyad's real main-process
 * engine via `@/aba/headless`, streams the prompt through the real `chat:stream`
 * handler (which dispatches to dyad's Pro agent loop), runs the app's own
 * typecheck/build gates, feeds failures back for repair turns, and writes
 * `RUN_META.json` into the workspace.
 *
 * Flags (fail-closed: an unknown flag or a stray positional exits 2):
 *   --prompt <file>        the task prose (required unless --smoke)
 *   --out <dir>            generate mode: wiped, then scaffolded
 *   --workspace <dir>      iterate mode: used as-is, never wiped
 *   --scaffold <dir>       scaffold copied into an empty workspace
 *   --adopt-reason <text>  record an ungateable iterate workspace as adopted
 *   --model <id>           model apiName (else ABA_MODEL)
 *   --gateway <url>        gateway base URL (else ABA_GATEWAY_URL)
 *   --turns <n>            max turns including the first (default 4)
 *   --mode <mode>          dyad's chat mode: local-agent (default), build, ask or plan.
 *                          ask and plan are one turn on an existing --workspace: no
 *                          install, no gates, no RUN_META.json, and the assistant's
 *                          words come back as `answer` in the result (headless_args.ts)
 *   --user-data-dir <dir>  where sqlite + settings live
 *   --smoke                boot, report the tool surface, dispose — no model call
 *   --view-render          expose the native view_render (screenshot) tool
 *   --no-egress-guard      record egress hosts but do not reject
 *   --json                 print a machine-readable result line
 */
// MUST be first: it sets the dead-loopback env vars before dyad's module graph
// is evaluated (several dyad modules read them at import time — see
// headless_env.ts). ES imports run in source order, so nothing may precede it
// that transitively imports dyad.
import "./headless_env";

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { bootDyadHeadless, installEgressGuard } from "./headless";
import { parseArgs, talkOnly, cleanAnswer, USAGE, type Args } from "./headless_args";
import { abaImageConfig, abaOctoConfig } from "@/lib/aba_model_config";

function runScript(appDir: string, cmd: string, cmdArgs: string[]): {
  ok: boolean;
  out: string;
} {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: appDir,
    encoding: "utf8",
    shell: true,
    timeout: 600_000,
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

interface GateResult {
  /** Concatenated failure text; "" when every gate that ran passed. */
  failures: string;
  /** Gate names that actually executed, in order. */
  ran: string[];
  /** Set when no gate could run at all: the workspace is not an ABA app. */
  reason?: string;
}

/**
 * Run the app's own gates. A workspace without a package.json or without a
 * build script has no gate to run, so it reports a reason rather than an empty
 * failure string — an empty failure string reads as a pass.
 */
function runGates(appDir: string): GateResult {
  const pkgPath = path.join(appDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return {
      failures: "",
      ran: [],
      reason: "no package.json: the workspace is not an ABA app",
    };
  }
  let pkg: { scripts?: Record<string, unknown> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (error) {
    return {
      failures: "",
      ran: [],
      reason: `package.json is not valid JSON: ${String(error)}`,
    };
  }
  if (!pkg || typeof pkg !== "object") {
    return {
      failures: "",
      ran: [],
      reason: "package.json is not an object",
    };
  }
  const scripts = pkg.scripts ?? {};
  const build = scripts.build;
  if (typeof build !== "string" || !build.trim()) {
    return {
      failures: "",
      ran: [],
      reason: "package.json has no `build` script: the workspace is not an ABA app",
    };
  }
  const parts: string[] = [];
  const ran: string[] = [];
  if (typeof scripts.typecheck === "string" && scripts.typecheck.trim()) {
    ran.push("typecheck");
    const tc = runScript(appDir, "npm", ["run", "typecheck"]);
    if (!tc.ok) parts.push(`typecheck failed:\n${tc.out.slice(-2500)}`);
  }
  ran.push("build");
  const bd = runScript(appDir, "npm", ["run", "build"]);
  if (!bd.ok) parts.push(`\`npm run build\` failed:\n${bd.out.slice(-2500)}`);
  return { failures: parts.join("\n\n"), ran };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }

  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${String(error)}\n\n${USAGE}`);
    return 2;
  }

  const gateway = (
    args.gateway ??
    process.env.ABA_GATEWAY_URL ??
    process.env.BUILDER_BASE_URL ??
    ""
  ).replace(/\/+$/, "");
  // A role value may be `<model>@<providerId>` (see aba_model_config.ts). The
  // boot creates a provider row with this id, so split the two apart.
  const modelSpec =
    args.model ??
    process.env.ABA_MODEL ??
    process.env.BUILDER_MODEL ??
    process.env.ABA_MODEL_CHAT ??
    "";
  const at = modelSpec.lastIndexOf("@");
  const model = at > 0 ? modelSpec.slice(0, at) : modelSpec;
  const providerId = at > 0 ? modelSpec.slice(at + 1) : undefined;
  const apiKey =
    process.env.ABA_API_KEY ??
    process.env.HADES_LITELLM_API_KEY ??
    process.env.BUILDER_API_KEY ??
    "";

  if (!gateway) {
    process.stderr.write("aba-headless: no gateway (--gateway or ABA_GATEWAY_URL)\n");
    return 2;
  }
  if (!model) {
    process.stderr.write("aba-headless: no model (--model or ABA_MODEL)\n");
    return 2;
  }
  if (!args.smoke && !args.prompt) {
    process.stderr.write(`aba-headless: --prompt is required\n\n${USAGE}`);
    return 2;
  }
  if (!args.smoke && !args.out && !args.workspace) {
    process.stderr.write(`aba-headless: one of --out / --workspace is required\n\n${USAGE}`);
    return 2;
  }
  if (args.out && args.workspace) {
    process.stderr.write("aba-headless: --out and --workspace are mutually exclusive\n");
    return 2;
  }

  const appDir = path.resolve(args.workspace ?? args.out ?? ".");
  const generate = Boolean(args.out);
  // ask and plan read an app that is already there. Booting on an empty or missing folder would
  // create it and make a git commit in it, which a question must never do.
  const talk = talkOnly(args.mode);
  if (
    talk &&
    !args.smoke &&
    !["package.json", ".git"].every((name) => fs.existsSync(path.join(appDir, name)))
  ) {
    process.stderr.write(
      `aba-headless: --mode ${args.mode} needs an existing app in --workspace (no package.json or no .git in ${appDir})\n`,
    );
    return 2;
  }
  // Whether the scaffold will populate this workspace. Must be read before the
  // generate wipe; an iterate workspace with only .git counts as empty.
  const startedEmpty =
    !fs.existsSync(appDir) ||
    fs.readdirSync(appDir).filter((name) => name !== ".git").length === 0;
  if (generate) {
    // Generate wipes the target, exactly like run-dyad-pro.mjs.
    fs.rmSync(appDir, { recursive: true, force: true });
  }
  fs.mkdirSync(appDir, { recursive: true });

  const userDataDir =
    args.userDataDir ??
    path.join(path.dirname(appDir), `.aba-headless-${path.basename(appDir)}`);

  // The gateway is the only non-loopback host a run may reach. With
  // --view-render the native view_render tool loads the app over loopback, so
  // any loopback host is permitted too (loopback never leaves the machine).
  // generate_image calls a second host (InferHub by default), so that host is
  // allow-listed as well — otherwise the image tool would be advertised but its
  // one network call would be refused. The Octo DB host (delta 7) is a third:
  // execute_sql / get_database_table_schema reach it over HTTP.
  const imageHost = hostOf(
    abaImageConfig({
      baseUrl: gateway,
      model: "",
      apiKey,
    }).baseUrl,
  );
  const octo = abaOctoConfig();
  const octoHost = octo.configured ? hostOf(octo.baseUrl) : undefined;
  const allowHosts = [hostOf(gateway)];
  if (imageHost && !allowHosts.includes(imageHost)) allowHosts.push(imageHost);
  if (octoHost && !allowHosts.includes(octoHost)) allowHosts.push(octoHost);
  const guardOptions = {
    allowHosts,
    reject: args.egressGuard,
    allowLoopback: args.viewRender,
  };
  const guard = installEgressGuard(guardOptions);

  const handle = await bootDyadHeadless({
    gatewayUrl: gateway,
    apiKey,
    model,
    providerId,
    appDir,
    scaffoldDir: args.scaffold,
    userDataDir,
    appName: path.basename(appDir),
    viewRender: args.viewRender,
    // A generate run wipes --out, so it always starts a fresh conversation; an
    // iterate run reuses the app's chat so it continues where the last one left off.
    reuseChat: !generate,
  });

  try {
    if (args.smoke) {
      const files = handle.getAppFiles().length;
      const { TOOL_DEFINITIONS } = await import(
        "@/pro/main/ipc/handlers/local_agent/tool_definitions"
      );
      const names = TOOL_DEFINITIONS.map((t) => t.name);
      const expected = ["code_search", "read_logs", "spawn_agent", "run_tests"];
      if (args.viewRender) expected.push("view_render");
      if (octo.configured) expected.push("execute_sql", "get_database_table_schema");
      const missing = expected.filter((n) => !names.includes(n as never));
      const imageRoute = imageHost
        ? `images -> ${imageHost}`
        : "images -> engine (no InferHub key)";
      const octoRoute = octo.configured
        ? `octo -> ${octoHost}`
        : "octo -> not configured";
      process.stdout.write(
        `aba-headless: smoke ok — booted, ${files} files, ` +
          `${handle.ipcHandlers.size} ipc handlers\n` +
          `aba-headless: tool surface ${names.length} definitions` +
          (missing.length ? `, MISSING ${missing.join(", ")}` : "") +
          `\n` +
          `aba-headless: ${imageRoute}; ${octoRoute}; egress allows ${allowHosts.join(", ")}\n`,
      );
      return missing.length ? 1 : 0;
    }

    // Mirror run-dyad-pro.mjs: the scaffold ships no node_modules, and dyad's
    // build/typecheck tools assume the app's deps are present. dyad installs
    // them itself when it creates an app through its own UI; the headless boot
    // inserts the app row directly and never runs that path, so the entry point
    // installs once up front. Only when deps are missing — an iterate workspace
    // may already have them.
    const pkgJson = path.join(handle.appDir, "package.json");
    if (
      !talk &&
      fs.existsSync(pkgJson) &&
      !fs.existsSync(path.join(handle.appDir, "node_modules"))
    ) {
      const pm = fs.existsSync(path.join(handle.appDir, "pnpm-lock.yaml"))
        ? "pnpm"
        : "npm";
      process.stdout.write(`[aba-headless] installing deps (${pm})\n`);
      const install = runScript(handle.appDir, pm, ["install", "--prefer-offline"]);
      if (!install.ok) {
        process.stderr.write(
          `[aba-headless] ${pm} install issue:\n${install.out.slice(-1500)}\n`,
        );
      }
    }

    const prompt = fs.readFileSync(args.prompt!, "utf8").trim();
    let turn = 0;
    // A consent denial is thrown as UserCancelled inside the tool and shows up
    // in the transcript as "User denied permission for <tool>" — but the run
    // itself still finishes ok:true with gates green. Scan every turn's
    // messages so RUN_META carries the refusal instead of hiding it.
    const deniedTools = new Map<string, number>();
    const DENIED_RE = /User denied permission for ([a-z_]+)/g;
    const recordDenials = (
      msgs: Array<{ content: string | null } | undefined>,
    ) => {
      for (const msg of msgs) {
        if (typeof msg?.content !== "string") continue;
        for (const match of msg.content.matchAll(DENIED_RE)) {
          deniedTools.set(match[1], (deniedTools.get(match[1]) ?? 0) + 1);
        }
      }
    };
    const stream = async (label: string, text: string) => {
      turn += 1;
      process.stdout.write(`[aba-headless] ${label} (turn ${turn})\n`);
      const { event, errored, messages } = await handle.streamChat(text, {
        requestedChatMode: args.mode,
      });
      recordDenials(messages);
      const err = errored ?? event("chat:response:error")?.payload;
      if (err) {
        throw new Error(
          `${label} chat:response:error -> ${JSON.stringify(err).slice(0, 2000)}`,
        );
      }
      return messages;
    };

    if (talk) {
      // One turn in dyad's ask or plan mode (chat_stream_handlers.ts: ask is the agent with
      // readOnly, plan is the agent with planModeOnly). No gates, no repair turns, no
      // RUN_META.json: the result is what the assistant said. `changed` is the app's own git
      // saying whether anything moved, so a caller never has to take "read-only" on trust.
      const head = () => handle.gitLog()[0] ?? "";
      const dirty = () =>
        spawnSync("git", ["status", "--porcelain"], {
          cwd: handle.appDir,
          encoding: "utf8",
        }).stdout.trim();
      const before = { head: head(), dirty: dirty() };
      const messages = await stream(args.mode, prompt);
      const last = [...messages]
        .reverse()
        .find((m) => m?.role === "assistant" && typeof m.content === "string");
      const answer = cleanAnswer(last?.content);
      const changed = head() !== before.head || dirty() !== before.dirty;
      // plan mode's write_plan saves the plan beside the app (planPersistence.ts)
      const planDir = path.join(handle.appDir, ".dyad", "plans");
      const plans = fs.existsSync(planDir)
        ? fs.readdirSync(planDir).filter((name) => name.endsWith(".md"))
        : [];
      const result = {
        ok: Boolean(answer) || plans.length > 0,
        engine: "dyad-headless (ABA-0005 Stage B)",
        model,
        chatMode: args.mode,
        turns: turn,
        answer,
        changed,
        ...(args.mode === "plan" ? { plans } : {}),
        deniedTools: Object.fromEntries(deniedTools),
        egressHosts: guard.hosts(),
        egressViolations: guard.violations(),
      };
      if (args.json) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else {
        process.stdout.write(
          `${answer}\n[aba-headless] ${args.mode}: turns=${turn}, changed=${changed}\n`,
        );
      }
      return result.ok ? 0 : 1;
    }

    await stream("build", prompt);

    const gatesRan = new Set<string>();
    let gate = runGates(handle.appDir);
    gate.ran.forEach((name) => gatesRan.add(name));
    let ungateable = gate.reason ?? null;
    let failures = gate.failures;

    while (!ungateable && failures && turn < args.turns) {
      const named = [...gatesRan].map((name) => `\`npm run ${name}\``).join(" and ");
      await stream(
        "repair",
        `The app does not pass its own gates. Fix every error below so that ` +
          `${named} succeeds. Do not change anything else.\n\n${failures}`,
      );
      gate = runGates(handle.appDir);
      gate.ran.forEach((name) => gatesRan.add(name));
      ungateable = gate.reason ?? null;
      failures = gate.failures;
    }

    const adopted = Boolean(args.adoptReason);
    const gatePassed = !ungateable && !failures;
    // Provenance is what the run ended with: a workspace ABA could gate is an
    // ABA app; one it could not is foreign unless the operator adopted it.
    const workspaceOrigin =
      generate || startedEmpty
        ? "scaffolded"
        : !ungateable
          ? "aba-app"
          : adopted
            ? "adopted"
            : "foreign";
    const ok = gatePassed || (adopted && ungateable);

    const files = handle.getAppFiles();
    const commits = handle.gitLog();
    const meta = {
      engine: "dyad-headless (ABA-0005 Stage B)",
      model,
      chatMode: args.mode,
      turns: turn,
      gatesPassed: workspaceOrigin === "adopted" ? null : gatePassed,
      gatesRun: [...gatesRan],
      workspaceOrigin,
      ...(workspaceOrigin === "adopted" ? { adoptReason: args.adoptReason } : {}),
      ...(ungateable ? { gatesSkipped: ungateable } : {}),
      deniedTools: Object.fromEntries(deniedTools),
      files: files.map((f) => f.relativePath),
      commits,
      egressHosts: guard.hosts(),
      egressViolations: guard.violations(),
    };
    fs.writeFileSync(
      path.join(handle.appDir, "RUN_META.json"),
      JSON.stringify(meta, null, 2),
    );

    if (ungateable) {
      process.stderr.write(`[aba-headless] cannot gate: ${ungateable}\n`);
    }
    const gateLine = ungateable
      ? adopted
        ? `gates: SKIPPED (${ungateable}; adopted: ${args.adoptReason})`
        : `gates: FAIL (${ungateable})`
      : `gates: ${failures ? "FAIL" : "PASS"} (${[...gatesRan].join(", ")})`;

    if (args.json) {
      process.stdout.write(`${JSON.stringify({ ok, ...meta })}\n`);
    } else {
      process.stdout.write(
        `[aba-headless] ${files.length} files, ${commits.length} commits, turns=${turn}\n` +
          `[aba-headless] ${gateLine}\n` +
          (deniedTools.size
            ? `[aba-headless] DENIED tool consents: ${JSON.stringify(Object.fromEntries(deniedTools))}\n`
            : "") +
          `[aba-headless] egress hosts: ${JSON.stringify(guard.hosts())}\n`,
      );
    }
    return ok ? 0 : 1;
  } finally {
    guard.uninstall();
    await handle.dispose();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`aba-headless: ${error?.stack ?? String(error)}\n`);
    process.exit(1);
  });
