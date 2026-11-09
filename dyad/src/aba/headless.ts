/**
 * Headless in-process boot of dyad's real main-process engine (ABA-0005
 * Stage B).
 *
 * This is the production sibling of `@/testing/chat_flow_harness`. It runs the
 * SAME machinery — the real sqlite db built by `initializeDatabase()`, real
 * settings via `writeSettings`, and the real in-process chat dispatch
 * (`executeChatStreamFromActor`, the entry dyad's chat actor calls), and through
 * it the real Pro agent loop (`handleLocalAgentStream`) with its subagent state
 * machine, BM25 code search, console-log channel and compaction — with NO
 * Electron app and NO Pro key.
 *
 * Note it drives `executeChatStreamFromActor`, NOT the `chat:stream` IPC
 * endpoint: that endpoint exists only as a test seam
 * (`registerLegacyChatStreamTestHandler`, which refuses to register outside
 * VITEST). The actor dispatch is the production path and needs only a sender to
 * emit events on.
 *
 * Differences from the vitest harness:
 *   - It imports nothing from vitest; the Electron module is supplied by the
 *     bundler aliasing `electron` to `@/aba/electron_module` (see
 *     `vite.aba-headless.config.mts`), so this module graph runs under plain
 *     `node`.
 *   - There is no fake-LLM server. Model traffic goes to the caller's gateway
 *     (the owner's LiteLLM); every dyad.sh-shaped URL is pointed at a dead
 *     loopback port so nothing leaves the machine. `installEgressGuard` proves
 *     it by recording (and optionally rejecting) outbound fetch hosts.
 *
 * Pro without a key: `isDyadProEnabled` is `enableDyadPro === true &&
 * hasDyadProKey(settings)` — a non-empty `providerSettings.auto.apiKey.value`.
 * The settings written below satisfy both, so `isBasicAgentMode` is false and
 * the free-agent quota path is never taken (agent mode with no limits), and the
 * selected model is a custom provider row pointing at the gateway, so no Pro
 * key is validated anywhere.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { closeDatabase, db, initializeDatabase } from "@/db";
import {
  apps,
  chats,
  language_model_providers,
  language_models,
  messages,
} from "@/db/schema";
import {
  blockNewStreamsForApp,
  cancelAllActiveStreams,
  executeChatStreamFromActor,
  registerChatStreamHandlers,
  type ChatStreamExecutionObserver,
} from "@/ipc/handlers/chat_stream_handlers";
import { computeChatTurnPayloadHash } from "@/ipc/utils/chat_turn_intent_hash";
import { configureTrustedRenderer } from "@/ipc/utils/renderer_security";
import { writeSettings } from "@/main/settings";
import type { UserSettings } from "@/lib/schemas";
import {
  runningApps,
  stopAppByInfo,
  stopAppGarbageCollection,
} from "@/ipc/utils/process_manager";
import { clearMcpCatalogCacheForTests } from "@/ipc/shared/remote_mcp_catalog";
import { and, asc, desc, eq } from "drizzle-orm";

import { type IpcHandler, type RendererEvent } from "./electron_shim";
import { electronShimShared } from "./electron_module";
import { applyStaticHeadlessEnv, HEADLESS_STATIC_ENV } from "./headless_env";

const BOOT_ONCE_ERROR =
  "bootDyadHeadless: one boot per process (the db is a process singleton). " +
  "Call dispose() before booting again.";

let booted = false;

/**
 * Model roles the headless boot pins to its own gateway. Every dyad role that
 * would otherwise resolve to a Dyad Pro model — the three subagent personas,
 * code/history exploration, compaction, the shell safety reviewer, themes — is
 * pointed at the run's model so a headless run never reaches for a model the
 * gateway cannot serve. `resolveAbaModel` reads these at call time and `??=`
 * leaves an explicit value (or one from ABA_ENV_FILE) untouched.
 */
const ABA_ROLE_ENV_KEYS = [
  "ABA_MODEL_CHAT",
  "ABA_MODEL_COMPACTION",
  "ABA_MODEL_SUBAGENT_EXPLORER",
  "ABA_MODEL_SUBAGENT_IMPLEMENTER",
  "ABA_MODEL_SUBAGENT_REVIEWER",
  "ABA_MODEL_EXPLORE_CODE",
  "ABA_MODEL_EXPLORE_HISTORY",
  "ABA_MODEL_SAFETY_REVIEW",
  "ABA_MODEL_THEMES",
] as const;

/** Env vars the boot owns; snapshotted so dispose() restores them. */
const BOOT_ENV_KEYS = [
  "NODE_ENV",
  "DYAD_DEV_USER_DATA_DIR",
  "DYAD_LANGUAGE_MODEL_CATALOG_URL",
  "DYAD_MCP_CATALOG_URL",
  "DYAD_USER_INFO_URL",
  "DYAD_ENGINE_URL",
  "DYAD_GATEWAY_URL",
  "DYAD_DEFAULT_APPROVE_BUILDS_URL",
  "DYAD_DESKTOP_CONFIG_URL",
  "DYAD_SUBSCRIPTION_STATUS_URL",
  "DYAD_DISABLE_PTY",
  "ABA_VIEW_RENDER",
  ...ABA_ROLE_ENV_KEYS,
] as const;

/**
 * Tools whose declared default consent is "ask". A headless run has no renderer
 * to answer a consent prompt, so the park would sit until its five-minute
 * deadline and resolve to a denial — the tool silently no-ops while the run
 * still reports success. Approving them up front is the same act a user takes by
 * clicking "always" in the Electron app; it changes no engine code, only the
 * consent the run carries. Every other tool already defaults to "always".
 */
const HEADLESS_TOOL_CONSENTS = {
  execute_sql: "always",
  add_dependency: "always",
  reinstall_and_restart_app: "always",
  web_search: "always",
  web_crawl: "always",
} as const;

export interface HeadlessBootOptions {
  /** OpenAI-compatible gateway base, e.g. http://127.0.0.1:4000/v1. */
  gatewayUrl: string;
  /** Bearer key for the gateway. */
  apiKey: string;
  /** Model apiName served by the gateway, e.g. ih/ali/qwen3.8-flash. */
  model: string;
  /** Provider row id (default "localgw"). */
  providerId?: string;
  /** Provider row display name. */
  providerName?: string;
  /** Directory holding the app to operate on. Created + git-init'd if absent. */
  appDir: string;
  /**
   * Scaffold copied into `appDir` when it is empty (generate mode). Ignored
   * when `appDir` already holds files (iterate mode).
   */
  scaffoldDir?: string;
  /** Per-run userData dir (sqlite + settings live here). */
  userDataDir: string;
  /**
   * Reuse the app's existing chat row when the userData db already holds one
   * for this app path (iterate continuity). Default true. A generate run wipes
   * its `--out`, so it passes false to always start a fresh conversation.
   */
  reuseChat?: boolean;
  /** App row name (default: basename of appDir). */
  appName?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
  /** Trusted renderer origin for the fake IPC event. Default localhost:5173. */
  trustedRendererUrl?: string;
  /**
   * Expose the native `view_render` tool: the agent screenshots the running
   * app (real dev server + Playwright) and sees the image. Off by default.
   */
  viewRender?: boolean;
}

export interface HeadlessHandle {
  appDir: string;
  appId: number;
  chatId: number;
  userDataDir: string;
  /** The raw ipcMain handler map — populated by `registerChatStreamHandlers`. */
  ipcHandlers: Map<string, IpcHandler>;
  /**
   * Submit one turn through dyad's real in-process dispatch
   * (`executeChatStreamFromActor`, the same entry the chat actor uses) and
   * resolve when the stream reaches a terminal state.
   */
  streamChat: (
    prompt: string,
    options?: { requestedChatMode?: "local-agent" | "build" | "plan" | "ask" },
  ) => Promise<{
    result: unknown;
    events: RendererEvent[];
    messages: Array<typeof messages.$inferSelect>;
    /** Terminal payloads observed on the stream, if any. */
    ended?: { updatedFiles: boolean; wasCancelled: boolean };
    errored?: { error: string };
    event: (channel: string) => RendererEvent | undefined;
    eventsFor: (channel: string) => RendererEvent[];
  }>;
  /** Snapshot of the app's files (node_modules/.git/dist excluded). */
  getAppFiles: () => Array<{ relativePath: string; content: string }>;
  readAppFile: (relativePath: string) => string;
  appFileExists: (relativePath: string) => boolean;
  gitLog: () => string[];
  dispose: () => Promise<void>;
}

function snapshotEnv(): Map<string, string | undefined> {
  return new Map(BOOT_ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snap: Map<string, string | undefined>): void {
  for (const [k, v] of snap) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function git(appDir: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.email=aba@local", "-c", "user.name=ABA", ...args],
    { cwd: appDir, stdio: "pipe" },
  ).toString();
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite"]);

/**
 * A WebContents stand-in for the headless run. The chat handler only ever uses
 * its sender to emit stream events, so this records them into `sink`. `id` is
 * deliberately left undefined (not an integer): dyad's high-volume paths treat
 * non-integer endpoints as non-producers and fall back to a direct `send`,
 * which is exactly what we want with no real renderer to register.
 */
function createHeadlessEndpoint(sink: RendererEvent[], rendererUrl: string) {
  const frame = { url: rendererUrl };
  return {
    isDestroyed: () => false,
    isCrashed: () => false,
    mainFrame: frame,
    send: (channel: string, payload: unknown) => {
      sink.push({ channel, payload });
    },
    on: () => undefined,
    once: () => undefined,
    removeListener: () => undefined,
    removeAllListeners: () => undefined,
  };
}

function walkFiles(root: string, dir = root, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".env.local") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(root, full, acc);
    } else if (entry.isFile()) {
      acc.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return acc.sort();
}

/**
 * Points every dyad.sh-shaped endpoint at a dead loopback port, so a run makes
 * no request to dyad's servers: the language-model catalog and MCP catalog fall
 * back to their bundled defaults, and the desktop-config / user-info /
 * subscription fetches fail closed. Engine and gateway go to the caller's
 * gateway (Pro features resolve there, never at engine.dyad.sh).
 *
 * The dyad.sh-shaped vars are also applied at module scope by `headless_env.ts`,
 * which `headless_cli.ts` imports first. That is load-bearing, not belt-and-
 * braces: several dyad modules capture them into module-level consts at import
 * time (`socket_firewall.ts:68` pins DYAD_DEFAULT_APPROVE_BUILDS_URL), so a
 * value assigned here — inside a function body — would land after the import
 * graph already ran. The check below fails loudly if that order is ever broken.
 */
function applyHeadlessEnv(opts: HeadlessBootOptions): void {
  if (
    process.env.DYAD_DEFAULT_APPROVE_BUILDS_URL !==
    HEADLESS_STATIC_ENV.DYAD_DEFAULT_APPROVE_BUILDS_URL
  ) {
    throw new Error(
      "bootDyadHeadless: headless_env was not applied before dyad's module " +
        "graph loaded — import @/aba/headless_env first (see headless_cli.ts).",
    );
  }
  process.env.NODE_ENV = "development";
  process.env.DYAD_DEV_USER_DATA_DIR = opts.userDataDir;
  applyStaticHeadlessEnv();
  // node-pty is built for Electron's ABI; under this plain-node bundle every
  // runCommand (package-manager probe, install, dev-server start) would fail
  // posix_spawnp. The documented escape opts into a plain child_process run
  // with the same result contract. Set here (not by the caller) so the boot is
  // self-contained and dispose() restores whatever was there before.
  process.env.DYAD_DISABLE_PTY = "1";
  process.env.ABA_VIEW_RENDER = opts.viewRender ? "1" : "0";
  const gateway = opts.gatewayUrl.replace(/\/+$/, "");
  process.env.DYAD_ENGINE_URL = gateway;
  process.env.DYAD_GATEWAY_URL = gateway;
  // Pin every ABA model role to the run's model on its own provider row, so
  // the subagent personas, compaction and the safety reviewer all run on the
  // gateway instead of falling back to a Dyad Pro model this run cannot reach.
  const providerId = opts.providerId ?? "localgw";
  for (const key of ABA_ROLE_ENV_KEYS) {
    process.env[key] ??= `${opts.model}@${providerId}`;
  }
}

export interface EgressGuard {
  /** Every fetch host seen since install, with a count. */
  hosts: () => Record<string, number>;
  /** Hosts outside the allow-list (should be empty on a clean run). */
  violations: () => string[];
  /** Restore the original global fetch. */
  uninstall: () => void;
}

/**
 * Wraps globalThis.fetch to record every outbound host. With `reject` true
 * (default) a request to a host outside `allowHosts` throws instead of leaving
 * the machine — the runtime proof that a run reached only the gateway.
 */
export function installEgressGuard(options: {
  allowHosts: string[];
  reject?: boolean;
  /**
   * Also permit any loopback host (127.0.0.1 / localhost / ::1) on any port.
   * Needed by --view-render: the app's dev server port is dynamic, and loopback
   * traffic never leaves the machine.
   */
  allowLoopback?: boolean;
}): EgressGuard {
  const original = globalThis.fetch;
  const counts = new Map<string, number>();
  const violations = new Set<string>();
  const allow = new Set(options.allowHosts);
  const reject = options.reject ?? true;
  const allowLoopback = options.allowLoopback ?? false;
  const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    let host = "";
    let hostname = "";
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const parsed = new URL(url);
      host = parsed.host;
      hostname = parsed.hostname;
    } catch {
      host = "unparseable";
    }
    counts.set(host, (counts.get(host) ?? 0) + 1);
    const permitted =
      !host || allow.has(host) || (allowLoopback && LOOPBACK.has(hostname));
    if (!permitted) {
      violations.add(host);
      if (reject) {
        throw new Error(
          `ABA egress guard: refused a request to "${host}" (allowed: ${[...allow].join(", ")})`,
        );
      }
    }
    return original(input as RequestInfo, init);
  }) as typeof fetch;

  return {
    hosts: () => Object.fromEntries(counts),
    violations: () => [...violations],
    uninstall: () => {
      globalThis.fetch = original;
    },
  };
}

export async function bootDyadHeadless(
  options: HeadlessBootOptions,
): Promise<HeadlessHandle> {
  if (booted) throw new Error(BOOT_ONCE_ERROR);
  booted = true;

  const envSnapshot = snapshotEnv();
  // The SAME registry the aliased `electron` module writes into (see
  // electron_module.ts), so every handler dyad registers through
  // `ipcMain.handle` is observable here.
  const shared = electronShimShared;
  shared.ipcHandlers.clear();
  shared.ipcListeners?.clear();

  try {
    const providerId = options.providerId ?? "localgw";
    const gateway = options.gatewayUrl.replace(/\/+$/, "");

    // The userData dir holds the sqlite db (chats, messages, subagent threads)
    // and the settings file. It is NOT wiped: a second boot on the same path
    // reuses the app's existing chat row, so an iterate run continues the
    // conversation the way real dyad reloads a chat's history. The provider and
    // model rows below are inserted with `onConflictDoNothing` so a re-boot
    // does not collide on their unique keys.
    fs.mkdirSync(options.userDataDir, { recursive: true });
    applyHeadlessEnv(options);

    configureTrustedRenderer({
      devServerUrl: options.trustedRendererUrl ?? "http://localhost:5173",
      packagedRendererUrl: "file:///app/renderer/main_window/index.html",
    });
    // The trusted-renderer check inspects event.senderFrame.url; keep it in
    // sync with the option above.
    const trustedUrl = options.trustedRendererUrl ?? "http://localhost:5173";

    // 1. Real sqlite db (drizzle migrations) in the run's userData dir.
    initializeDatabase();

    // 2. The Pro settings shim. enableDyadPro + a non-empty auto key satisfy
    //    isDyadProEnabled, which turns off isBasicAgentMode (no quota) and
    //    unblocks the Pro tool surface — with no real Pro key anywhere.
    const settings: Partial<UserSettings> = {
      selectedModel: { provider: providerId, name: options.model },
      selectedChatMode: "local-agent",
      defaultChatMode: "local-agent",
      autoApproveChanges: true,
      hasRunBefore: true,
      enableDyadPro: true,
      // The whole subagent surface, on. "Everything dyad has" is the owner
      // directive, so a headless run is not a cut-down one: the explorer and
      // implementer personas are enabled and the advanced orchestration tools
      // (list_agents / wait_agents / cancel_agent / send_message) are exposed.
      enableExplorerSubagent: true,
      enableImplementerSubagent: true,
      enableAdvancedSubagents: true,
      // "ask"-default tools get "always" (HEADLESS_TOOL_CONSENTS above): no
      // renderer exists to answer a consent card, so leaving them on "ask"
      // turns every execute_sql / add_dependency call into a silent denial.
      agentToolConsents: {
        ...HEADLESS_TOOL_CONSENTS,
      } as UserSettings["agentToolConsents"],
      providerSettings: {
        auto: { apiKey: { value: options.apiKey } },
        [providerId]: { apiKey: { value: options.apiKey } },
      } as UserSettings["providerSettings"],
    };
    writeSettings(settings);

    // 3. Provider + model rows pointing at the gateway (never the Dyad engine).
    //    The provider id is the primary key, so upsert it — a re-boot on a
    //    surviving db refreshes the gateway URL instead of colliding. The model
    //    row has no natural key, so find-or-create by (apiName, provider).
    await db
      .insert(language_model_providers)
      .values({
        id: providerId,
        name: options.providerName ?? "ABA Local Gateway",
        api_base_url: gateway,
      })
      .onConflictDoUpdate({
        target: language_model_providers.id,
        set: {
          name: options.providerName ?? "ABA Local Gateway",
          api_base_url: gateway,
        },
      });
    const existingModel = await db.query.language_models.findFirst({
      where: and(
        eq(language_models.apiName, options.model),
        eq(language_models.customProviderId, providerId),
      ),
    });
    if (!existingModel) {
      await db.insert(language_models).values({
        displayName: "ABA Run Model",
        apiName: options.model,
        customProviderId: providerId,
        max_output_tokens: options.maxOutputTokens ?? 32_000,
        context_window: options.contextWindow ?? 1_000_000,
      });
    }

    // 4. App checkout. Generate mode copies the scaffold into an empty dir;
    //    iterate mode leaves an existing dir untouched.
    const appDir = path.resolve(options.appDir);
    fs.mkdirSync(appDir, { recursive: true });
    const existing = fs.readdirSync(appDir).filter((n) => n !== ".git");
    if (existing.length === 0 && options.scaffoldDir) {
      fs.cpSync(options.scaffoldDir, appDir, { recursive: true });
    }
    if (!fs.existsSync(path.join(appDir, ".git"))) {
      git(appDir, "init");
      git(appDir, "add", "-A");
      // --allow-empty: an iterate run can start from an empty dir (no scaffold),
      // where there is nothing to stage and a plain commit would fail.
      git(appDir, "commit", "--allow-empty", "-m", "init");
    }

    const appName = options.appName ?? path.basename(appDir);
    // Find-or-create the app row by path, so a re-boot lands in the same app
    // instead of stacking a second row for the same directory.
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.path, appDir),
      orderBy: [desc(apps.id)],
    });
    const appRow =
      existingApp ??
      (
        await db
          .insert(apps)
          .values({ name: appName, path: appDir })
          .returning()
      )[0];
    // Reuse the app's most recent chat (iterate continuity) unless the caller
    // asked for a fresh conversation (a generate run wipes its output).
    const reusableChat =
      options.reuseChat === false
        ? undefined
        : await db.query.chats.findFirst({
            where: eq(chats.appId, appRow.id),
            orderBy: [desc(chats.id)],
          });
    const chatRow =
      reusableChat ??
      (await db.insert(chats).values({ appId: appRow.id }).returning())[0];

    // 5. Register the real chat stream handlers. This is what arms
    //    `internalChatStreamHandler`, which `executeChatStreamFromActor` (the
    //    production dispatch the chat actor calls) invokes.
    registerChatStreamHandlers();

    const appId = appRow.id;
    const chatId = chatRow.id;

    const loadMessages = () =>
      db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: [asc(messages.id)],
      });

    const streamChat: HeadlessHandle["streamChat"] = async (prompt, opts) => {
      const requestedChatMode = opts?.requestedChatMode ?? "local-agent";
      const events: RendererEvent[] = [];
      const endpoint = createHeadlessEndpoint(events, trustedUrl);

      // The intent the actor would have bound to this submission. Supplying it
      // (rather than a bare prompt) keeps the turn indistinguishable from a
      // renderer-submitted one all the way down into the agent loop.
      const intentId = `aba-${randomUUID()}`;
      const withoutHash = {
        schemaVersion: 1 as const,
        intentId,
        chatId,
        prompt,
        requestedChatMode,
      };
      const intent = {
        ...withoutHash,
        payloadHash: computeChatTurnPayloadHash(withoutHash),
      };

      let ended: { updatedFiles: boolean; wasCancelled: boolean } | undefined;
      let errored: { error: string } | undefined;
      const observer: ChatStreamExecutionObserver = {
        intent,
        sessionQueued: false,
        onEnd: (response) => {
          ended = {
            updatedFiles: response.updatedFiles ?? false,
            wasCancelled: response.wasCancelled ?? false,
          };
        },
        onError: (error) => {
          errored = { error: error.error };
        },
      };

      const result = await executeChatStreamFromActor(
        endpoint as never,
        { chatId, prompt, requestedChatMode, intentId } as never,
        observer,
      );

      return {
        result,
        events,
        messages: await loadMessages(),
        ended,
        errored,
        event: (channel) => events.find((e) => e.channel === channel),
        eventsFor: (channel) => events.filter((e) => e.channel === channel),
      };
    };

    const getAppFiles = () =>
      walkFiles(appDir).map((relativePath) => ({
        relativePath,
        content: fs.readFileSync(path.join(appDir, relativePath), "utf-8"),
      }));

    const readAppFile = (relativePath: string): string => {
      const full = path.join(appDir, relativePath);
      if (!fs.existsSync(full)) throw new Error(`App file not found: ${relativePath}`);
      return fs.readFileSync(full, "utf-8").replace(/\r\n/g, "\n");
    };

    const appFileExists = (relativePath: string): boolean =>
      fs.existsSync(path.join(appDir, relativePath));

    const gitLog = (): string[] =>
      git(appDir, "log", "--oneline").trim().split("\n").filter(Boolean);

    let disposePromise: Promise<void> | undefined;
    const dispose = (): Promise<void> => {
      disposePromise ??= (async () => {
        try {
          blockNewStreamsForApp(appId);
          await cancelAllActiveStreams();
          stopAppGarbageCollection();
          await Promise.allSettled(
            Array.from(runningApps.entries()).map(([id, info]) =>
              stopAppByInfo(id, info),
            ),
          );
        } catch {
          // best-effort teardown
        } finally {
          try {
            closeDatabase();
          } catch {
            // ignore
          }
          shared.ipcHandlers.clear();
          shared.ipcListeners?.clear();
          clearMcpCatalogCacheForTests();
          restoreEnv(envSnapshot);
          booted = false;
        }
      })();
      return disposePromise;
    };

    return {
      appDir,
      appId,
      chatId,
      userDataDir: options.userDataDir,
      ipcHandlers: shared.ipcHandlers,
      streamChat,
      getAppFiles,
      readAppFile,
      appFileExists,
      gitLog,
      dispose,
    };
  } catch (error) {
    booted = false;
    try {
      closeDatabase();
    } catch {
      // ignore
    }
    shared.ipcHandlers.clear();
    shared.ipcListeners?.clear();
    restoreEnv(envSnapshot);
    throw error;
  }
}
