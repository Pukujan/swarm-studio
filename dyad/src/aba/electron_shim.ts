/**
 * In-process Electron shim — the substrate dyad's main process needs to run
 * with no Electron app (ABA-0005 Stage B).
 *
 * dyad's main process imports the `electron` module in 72 files, but every one
 * of those imports funnels through the same small surface: `ipcMain.handle`
 * (via `registerTrustedIpcHandler`), `app.getPath`, and a handful of inert
 * objects (`BrowserWindow`, `safeStorage`, `Notification`, `shell`, `dialog`,
 * `net`, `utilityProcess`). This module returns an object shaped like that
 * surface so the main-process graph imports and runs headlessly.
 *
 * It is the vitest-free core of `@/testing/electron_mock`: identical shape, but
 * the function stubs are supplied by the caller through `wrapFn`, so nothing
 * here imports vitest and the module can be bundled into a plain-node entry.
 * `electron_mock.ts` calls it with `vi.fn` (preserving its spies);
 * `@/aba/headless` calls it with a bare stub.
 */

import fs from "node:fs";
import path from "node:path";

export type IpcHandler = (
  event: unknown,
  input: unknown,
) => unknown | Promise<unknown>;

/**
 * The dyad checkout root — what Electron's `app.getAppPath()` returns in dev,
 * and the base dyad resolves its bundled resources against
 * (`node_modules/@vscode/ripgrep`, `node_modules/dugite/git`).
 *
 * This module sits at `src/aba/` in the tree and is bundled to `.vite/build/` —
 * two levels below the root in both — so `../..` is the checkout either way.
 * The `__dirname` reference is guarded because a pure ESM transform (vitest)
 * leaves it undefined; there the process cwd is the checkout.
 */
function resolveDyadRoot(): string {
  try {
    return path.resolve(__dirname, "..", "..");
  } catch {
    return process.cwd();
  }
}

export interface ElectronShimShared {
  /** Channel -> handler, populated by `ipcMain.handle`. */
  ipcHandlers: Map<string, IpcHandler>;
  /** Channel -> listeners, populated by `ipcMain.on`. */
  ipcListeners?: Map<string, Array<(...args: unknown[]) => void>>;
}

/** Back-compat alias: the vitest mock and the headless shim share this shape. */
export type ElectronMockShared = ElectronShimShared;

/**
 * Renderer stream events captured from a fake `event.sender.send(...)`.
 */
export interface RendererEvent {
  channel: string;
  payload: unknown;
}

type AnyFn = (...args: any[]) => any;

/**
 * Wraps a plain implementation in the caller's spy. `electron_mock.ts` passes
 * `(impl) => vi.fn(impl)`; the headless entry passes identity (a bare stub).
 */
export type WrapFn = (impl?: AnyFn) => AnyFn;

/**
 * Builds a fake IPC `event` whose `sender.send` pushes into `sink`. This is the
 * object passed as the first argument to an ipcMain handler.
 */
export function createFakeIpcEvent(sink: RendererEvent[]): {
  sender: {
    mainFrame: { url: string };
    isDestroyed: () => boolean;
    isCrashed: () => boolean;
    send: (channel: string, payload: unknown) => void;
  };
  senderFrame: { url: string };
} {
  const frame = { url: "http://localhost:5173/" };
  return {
    sender: {
      mainFrame: frame,
      isDestroyed: () => false,
      isCrashed: () => false,
      send: (channel: string, payload: unknown) => {
        sink.push({ channel, payload });
      },
    },
    senderFrame: frame,
  };
}

/**
 * Where `app.getPath(...)` resolves. Read at call time so a caller can set the
 * temp dir after the shim is constructed.
 */
export function resolveUserDataPath(): string {
  return (
    process.env.DYAD_DEV_USER_DATA_DIR ||
    process.env.DYAD_TEST_USER_DATA_DIR ||
    `${process.env.TMPDIR || "/tmp"}/dyad-headless-userdata-${process.pid}`
  );
}

/**
 * Returns an object shaped like the `electron` module. Pass the same `shared`
 * object you hand to the boot routine so the recorded handlers line up.
 *
 * `wrapFn` decides whether the exported functions are spies (vitest) or bare
 * stubs (production headless).
 */
export function createElectronShim(
  shared: ElectronShimShared,
  wrapFn: WrapFn = (impl) => impl ?? (() => undefined),
) {
  const ipcListeners =
    shared.ipcListeners ??
    (shared.ipcListeners = new Map<
      string,
      Array<(...args: unknown[]) => void>
    >());

  const noop = wrapFn(() => undefined);

  const dyadRoot = resolveDyadRoot();

  // Mirror dyad's own startup (src/main.ts:395-408): dugite finds its embedded
  // git through LOCAL_GIT_DIRECTORY when that is set, and otherwise through its
  // own `__dirname` — which, inlined into this bundle, is `.vite/build`, not
  // `node_modules/dugite`. Left unset, every git-backed operation (each change
  // dyad commits) fails with "Git failed to execute". dyad's main.ts sets this
  // before any tool runs; the headless graph does not include main.ts, so the
  // shim that stands in for Electron does it here.
  const gitDir = path.join(dyadRoot, "node_modules", "dugite", "git");
  if (fs.existsSync(gitDir)) {
    process.env.LOCAL_GIT_DIRECTORY = gitDir;
  }

  return {
    app: {
      on: wrapFn(),
      once: wrapFn(),
      whenReady: wrapFn(() => Promise.resolve()),
      // Read at call time so the caller can set the temp dir after this shim is
      // created. All path names collapse to the per-run userData dir.
      getPath: wrapFn((_name?: string) => resolveUserDataPath()),
      // The checkout root, not cwd: ripgrep_utils resolves the `rg` binary off
      // this path (dev branch), so cwd points it at a directory with no
      // node_modules.
      getAppPath: wrapFn(() => dyadRoot),
      getName: wrapFn(() => "dyad"),
      getVersion: wrapFn(() => "0.0.0-headless"),
      isPackaged: false,
      quit: wrapFn(),
      exit: wrapFn(),
      setAppUserModelId: wrapFn(),
      commandLine: { appendSwitch: wrapFn() },
      dock: { hide: wrapFn(), show: wrapFn() },
    },
    ipcMain: {
      // Match real Electron: registering a second handler for a channel is a
      // hard error, not a silent overwrite. dispose() clears the map (the moral
      // equivalent of the Electron process exiting), so sequential boots in one
      // process still work.
      handle: wrapFn((channel: string, fn: IpcHandler) => {
        if (shared.ipcHandlers.has(channel)) {
          throw new Error(
            `Attempted to register a second handler for '${channel}'`,
          );
        }
        shared.ipcHandlers.set(channel, fn);
      }),
      handleOnce: wrapFn((channel: string, fn: IpcHandler) => {
        if (shared.ipcHandlers.has(channel)) {
          throw new Error(
            `Attempted to register a second handler for '${channel}'`,
          );
        }
        // Real handleOnce deregisters after the first invocation.
        shared.ipcHandlers.set(channel, (event, input) => {
          shared.ipcHandlers.delete(channel);
          return fn(event, input);
        });
      }),
      removeHandler: wrapFn((channel: string) => {
        shared.ipcHandlers.delete(channel);
      }),
      on: wrapFn((channel: string, fn: (...args: unknown[]) => void) => {
        const list = ipcListeners.get(channel) ?? [];
        list.push(fn);
        ipcListeners.set(channel, list);
      }),
      once: wrapFn((channel: string, fn: (...args: unknown[]) => void) => {
        const list = ipcListeners.get(channel) ?? [];
        list.push(fn);
        ipcListeners.set(channel, list);
      }),
      removeAllListeners: wrapFn((channel?: string) => {
        if (channel) {
          ipcListeners.delete(channel);
        } else {
          ipcListeners.clear();
        }
      }),
    },
    BrowserWindow: {
      getAllWindows: wrapFn(() => []),
      // Return the caller's own webContents so sends keep flowing to the
      // bridge sink — a stub `send` here would silently swallow messages
      // (e.g. main/settings.ts drains queued error toasts through this path).
      fromWebContents: wrapFn((webContents: { send?: unknown }) => ({
        isDestroyed: () => false,
        webContents,
      })),
      fromId: wrapFn(() => null),
    },
    WebContentsView: wrapFn(function WebContentsView() {
      return { webContents: { send: () => undefined } };
    }),
    nativeTheme: {
      shouldUseDarkColors: false,
      themeSource: "system",
      on: wrapFn(),
      off: wrapFn(),
    },
    safeStorage: {
      isEncryptionAvailable: wrapFn(() => false),
      encryptString: wrapFn((s: string) => Buffer.from(s)),
      decryptString: wrapFn((b: Buffer) => b.toString()),
    },
    Notification: wrapFn(function Notification() {
      return { show: noop, on: noop, close: noop };
    }),
    shell: {
      openExternal: wrapFn(() => Promise.resolve()),
      openPath: wrapFn(() => Promise.resolve("")),
      showItemInFolder: wrapFn(),
      trashItem: wrapFn(() => Promise.resolve()),
    },
    dialog: {
      showOpenDialog: wrapFn(() =>
        Promise.resolve({ canceled: true, filePaths: [] }),
      ),
      showSaveDialog: wrapFn(() => Promise.resolve({ canceled: true })),
      showMessageBox: wrapFn(() => Promise.resolve({ response: 0 })),
    },
    // Electron's `net` is a Node-http-backed request API; in-process runs reach
    // the network through global fetch instead, so this stays inert.
    net: {
      request: wrapFn(() => {
        throw new Error("electron.net.request is not available headless");
      }),
      fetch: wrapFn(() => Promise.reject(new Error("electron.net.fetch is not available headless"))),
      isOnline: wrapFn(() => true),
    },
    // Menu/protocol/nativeImage/autoUpdater/crashReporter/clipboard/session are
    // imported at module scope by handlers the headless entry never invokes.
    // They must exist so the import graph resolves; they are never called.
    Menu: {
      setApplicationMenu: noop,
      buildFromTemplate: wrapFn(() => ({})),
      getApplicationMenu: wrapFn(() => null),
    },
    protocol: {
      handle: noop,
      registerSchemesAsPrivileged: noop,
      registerFileProtocol: noop,
    },
    nativeImage: {
      createFromPath: wrapFn(() => ({ isEmpty: () => true })),
      createFromBuffer: wrapFn(() => ({ isEmpty: () => true })),
    },
    autoUpdater: {
      on: noop,
      checkForUpdates: noop,
      setFeedURL: noop,
      quitAndInstall: noop,
    },
    crashReporter: { start: noop },
    clipboard: {
      writeText: noop,
      readText: wrapFn(() => ""),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: noop,
        webRequest: { onBeforeRequest: noop, onHeadersReceived: noop },
      },
      fromPartition: wrapFn(() => ({
        setPermissionRequestHandler: noop,
        webRequest: { onBeforeRequest: noop, onHeadersReceived: noop },
      })),
    },
    powerMonitor: { on: noop, off: noop },
    globalShortcut: { register: noop, unregisterAll: noop },
    screen: { getPrimaryDisplay: wrapFn(() => ({ workAreaSize: { width: 1440, height: 900 } })) },
    Tray: wrapFn(function Tray() {
      return { setToolTip: noop, setContextMenu: noop, destroy: noop, on: noop };
    }),
    desktopCapturer: { getSources: wrapFn(() => Promise.resolve([])) },
    // Preload-only surfaces. The headless path has no renderer, so these are
    // inert; they exist so a stray import does not resolve to undefined.
    contextBridge: { exposeInMainWorld: noop },
    ipcRenderer: {
      invoke: wrapFn(() => Promise.reject(new Error("no renderer headless"))),
      send: noop,
      on: noop,
      once: noop,
      removeListener: noop,
    },
    webFrame: { setZoomFactor: noop },
    utilityProcess: {
      // Functional shim: forks the real worker bundle via child_process with a
      // parentPort bridge (code_explorer_fork_wrapper.cjs), so utility-process
      // consumers (code explorer / subagents) actually WORK headless instead of
      // hanging on a ready-promise that an inert stub would never resolve.
      fork: wrapFn((modulePath: string, _args?: string[], _opts?: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { fork } =
          require("node:child_process") as typeof import("node:child_process");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeFs = require("node:fs") as typeof import("node:fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodePath = require("node:path") as typeof import("node:path");
        const repoRoot = nodePath.resolve(__dirname, "..", "..");
        const base = nodePath.basename(modulePath);
        const candidates = [
          modulePath,
          nodePath.join(repoRoot, "dist", base),
          nodePath.join(repoRoot, "dist", base.replace(/\.js$/, ".cjs")),
        ];
        const bundle = candidates.find((p) => nodeFs.existsSync(p));
        if (!bundle) {
          throw new Error(
            `utilityProcess shim: worker bundle not found (tried ${candidates.join(", ")}). ` +
              `Build it: npx vite build --config vite.code-explorer-worker.config.mts`,
          );
        }
        const child = fork(
          nodePath.join(__dirname, "code_explorer_fork_wrapper.cjs"),
          [],
          {
            env: { ...process.env, DYAD_TEST_WORKER_BUNDLE: bundle },
            // utilityProcess execArgv V8 flags aren't applied by Electron 40
            // either (see code_explorer.ts) — drop them here too.
            execArgv: [],
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          },
        );
        return {
          on: (event: string, cb: (...a: unknown[]) => void) => {
            if (event === "error") {
              child.on("error", (err) => cb("unknown", "spawn", String(err)));
            } else {
              child.on(event as "spawn" | "message" | "exit", cb);
            }
          },
          postMessage: (m: unknown) => child.send(m as object),
          kill: () => child.kill(),
          pid: child.pid,
        };
      }),
    },
  };
}
