/**
 * The headless CLI's arguments (headless_cli.ts), kept in a file with no imports so plain node can
 * load it for a test (Swarm Studio: tests/headless-mode.test.mjs) without booting dyad's module graph.
 * Only erasable TypeScript here: node strips the types and runs it as it is.
 */

/** dyad's own chat modes (ChatModeSchema, src/lib/schemas.ts). */
export const CHAT_MODES = ["build", "ask", "local-agent", "plan"] as const;
export type HeadlessChatMode = (typeof CHAT_MODES)[number];

/**
 * ask and plan talk and write no app code: one turn on an existing workspace, with no dependency
 * install, no typecheck/build gates and no RUN_META.json. The assistant's words are the result.
 */
export const talkOnly = (mode: HeadlessChatMode): boolean =>
  mode === "ask" || mode === "plan";

/**
 * dyad's tools that wait for a person in its window: each parks a request in the user-input registry
 * (src/user_input/registry.ts) that only an answer from the renderer settles. A headless run has no
 * renderer, so the boot (headless.ts) sets their consent to "never", which is how dyad itself removes
 * a tool from a turn (shouldIncludeTool, tool_definitions.ts) and from the prompt's questionnaire
 * steps (chat_stream_handlers.ts). Left on, planning_questionnaire or exit_plan ended the run at once
 * with exit code 0 and no result line (nothing keeps the process alive while it waits), and
 * add_integration held it for its 30-minute deadline (suggest_plugin has the same deadline, and
 * generate_test_assertions waits for a review of a recording made in dyad's window).
 * Swarm Studio's tests/headlessasks.test.mjs fails when a tool that parks is missing from this list.
 */
export const HEADLESS_OFF_TOOLS = [
  "planning_questionnaire",
  "add_integration",
  "suggest_plugin",
  "exit_plan",
  "generate_test_assertions",
] as const;

/**
 * The off tool a turn ended on, if it did. dyad ends a turn on an add_integration or exit_plan call
 * (stopWhen, local_agent_handler.ts), and its window then sends a hidden "continue" once the person is
 * done. Headless the call is refused as unavailable and the turn still ends there, with the work not
 * done, so the runner sends nobodyHere() instead (headless_cli.ts). `content` is the assistant message
 * of the turn: a refused call is its last `<dyad-status title="Tool &quot;name&quot; failed">` block.
 */
export const offToolStop = (content: string | null | undefined): string | null => {
  const blocks = [
    ...String(content ?? "").matchAll(
      /<dyad-status title="Tool &quot;([a-z_]+)&quot; failed" state="error">[\s\S]*?<\/dyad-status>/g,
    ),
  ];
  const last = blocks.at(-1);
  if (!last) return null;
  const after = String(content).slice((last.index ?? 0) + last[0].length).trim();
  return !after && (HEADLESS_OFF_TOOLS as readonly string[]).includes(last[1])
    ? last[1]
    : null;
};

/** What the runner says in place of the person, so the turn goes on. */
export const nobodyHere = (tool: string): string =>
  `Nobody is here to answer: this run has no person in it, and \`${tool}\` is not available. ` +
  `Do not call it again. Decide for yourself from the request and what the app already has, ` +
  `and go on until the work is done.`;

export interface Args {
  prompt?: string;
  out?: string;
  workspace?: string;
  scaffold?: string;
  adoptReason?: string;
  model?: string;
  gateway?: string;
  turns: number;
  mode: HeadlessChatMode;
  userDataDir?: string;
  smoke: boolean;
  viewRender: boolean;
  egressGuard: boolean;
  json: boolean;
}

export const USAGE = `Usage: aba-headless --prompt <file> (--out <dir> | --workspace <dir>) [options]

  --prompt <file>        the task prose (required unless --smoke)
  --out <dir>            generate mode: wiped, then scaffolded
  --workspace <dir>      iterate mode: used as-is, never wiped
  --scaffold <dir>       scaffold copied into an empty workspace
  --adopt-reason <text>  record an ungateable iterate workspace as adopted
  --model <id>           model apiName (else ABA_MODEL)
  --gateway <url>        gateway base URL (else ABA_GATEWAY_URL)
  --turns <n>            max turns including the first (default 4)
  --mode <mode>          chat mode: local-agent (default), build, ask or plan;
                         ask and plan are one turn on --workspace: no gates, no commit
  --user-data-dir <dir>  where sqlite + settings live
  --smoke                boot, report the tool surface, dispose — no model call
  --view-render          expose the native view_render (screenshot) tool
  --no-egress-guard      record egress hosts but do not reject
  --json                 print a machine-readable result line
  -h, --help             print this usage and exit
`;

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    turns: 4,
    mode: "local-agent",
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
      case "--mode": {
        const [v, n] = take(i, a);
        if (!(CHAT_MODES as readonly string[]).includes(v)) {
          throw new Error(
            `--mode must be one of ${CHAT_MODES.join(", ")}, got "${v}"`,
          );
        }
        args.mode = v as HeadlessChatMode;
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
  // A talk-only turn reads an app that is already there: --out would wipe it, and a scaffold or an
  // adoption belongs to a build.
  if (talkOnly(args.mode)) {
    if (args.out) {
      throw new Error(`--mode ${args.mode} reads an existing app: use --workspace, not --out`);
    }
    if (args.scaffold || args.adoptReason) {
      throw new Error(`--mode ${args.mode} takes no --scaffold or --adopt-reason`);
    }
  }
  return args;
}

/**
 * The assistant's words from a stored dyad message: its <think> blocks and dyad's own tags
 * (<dyad-read …>, <dyad-status …>…</dyad-status>, the tool cards the chat window draws) taken out.
 */
export function cleanAnswer(content: string | null | undefined): string {
  return String(content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<(dyad-[a-z-]+)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<dyad-[a-z-]+\b[^>]*\/?>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
