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
import { abaImageConfig, abaOctoConfig } from "@/lib/aba_model_config";

interface Args {
  prompt?: string;
  out?: string;
  workspace?: string;
  scaffold?: string;
  adoptReason?: string;
  model?: string;
  gateway?: string;
  turns: number;
  userDataDir?: string;
  smoke: boolean;
  viewRender: boolean;
  egressGuard: boolean;
  json: boolean;
}

const USAGE = `Usage: aba-headless --prompt <file> (--out <dir> | --workspace <dir>) [options]

  --prompt <file>        the task prose (required unless --smoke)
  --out <dir>            generate mode: wiped, then scaffolded
  --workspace <dir>      iterate mode: used as-is, never wiped
  --scaffold <dir>       scaffold copied into an empty workspace
  --adopt-reason <text>  record an ungateable iterate workspace as adopted
  --model <id>           model apiName (else ABA_MODEL)
  --gateway <url>        gateway base URL (else ABA_GATEWAY_URL)
  --turns <n>            max turns including the first (default 4)
  --user-data-dir <dir>  where sqlite + settings live
  --smoke                boot, report the tool surface, dispose — no model call
  --view-render          expose the native view_render (screenshot) tool
  --no-egress-guard      record egress hosts but do not reject
  --json                 print a machine-readable result line
  -h, --help             print this usage and exit
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    turns: 4,
    smoke: false,
    viewRender: false,
    egressGuard: true,
    json: false,
  };
  const take = (i: number, flag: string): [string, number] => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return [value, i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--prompt": {
        const [v, n] = take(i, a);
        args.prompt = v;
        i = n;
        break;
      }
      case "--out": {
        const [v, n] = take(i, a);
        args.out = v;
        i = n;
        break;
      }
      case "--workspace": {
        const [v, n] = take(i, a);
        args.workspace = v;
        i = n;
        break;
      }
      case "--scaffold": {
        const [v, n] = take(i, a);
        args.scaffold = v;
        i = n;
        break;
      }
      case "--adopt-reason": {
        const [v, n] = take(i, a);
        if (!v.trim()) {
          throw new Error("--adopt-reason must not be empty");
        }
        args.adoptReason = v;
        i = n;
        break;
      }
      case "--model": {
        const [v, n] = take(i, a);
        args.model = v;
        i = n;
        break;
      }
      case "--gateway": {
        const [v, n] = take(i, a);
        args.gateway = v;
        i = n;
        break;
      }
      case "--user-data-dir": {
        const [v, n] = take(i, a);
        args.userDataDir = v;
        i = n;
        break;
      }
      case "--turns": {
        const [v, n] = take(i, a);
        const parsed = Number(v);
        if (!Number.isFinite(parsed) || parsed < 1) {
          throw new Error(`--turns must be a positive number, got "${v}"`);
        }
        args.turns = parsed;
        i = n;
        break;
      }
      case "--smoke":
        args.smoke = true;
        break;
      case "--view-render":
        args.viewRender = true;
        break;
      case "--no-egress-guard":
        args.egressGuard = false;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

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
        requestedChatMode: "local-agent",
      });
      recordDenials(messages);
      const err = errored ?? event("chat:response:error")?.payload;
      if (err) {
        throw new Error(
          `${label} chat:response:error -> ${JSON.stringify(err).slice(0, 2000)}`,
        );
      }
    };

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
      chatMode: "local-agent",
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
