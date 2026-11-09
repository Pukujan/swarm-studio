/**
 * The `electron` module replacement for the headless bundle (ABA-0005 Stage B).
 *
 * `vite.aba-headless.config.mts` aliases the bare specifier `electron` to this
 * module, so every `import { app } from "electron"` in dyad's real main-process
 * graph resolves here instead of to the real Electron runtime. It owns the
 * process-wide `electronShimShared` map, so the handlers dyad registers (via
 * `ipcMain.handle` → `registerTrustedIpcHandler`) land in the SAME map that
 * `@/aba/headless` reads back when it invokes `chat:stream`.
 *
 * Named exports mirror the main-process surface of the shim exactly. The
 * renderer/preload-only bindings (`ipcRenderer`, `contextBridge`, `webFrame`)
 * are deliberately NOT re-exported here: real Electron's main process does not
 * have them, and their presence makes `electron-log` take its preload branch
 * (it probes `electron.ipcRenderer`), which then assigns an implicit global and
 * throws under the bundle's strict mode. Only `src/preload.ts` imports those,
 * and preload is not part of the headless graph.
 */
import { createElectronShim, type ElectronShimShared } from "./electron_shim";

/** The one handler/listener registry this process's dyad graph shares. */
export const electronShimShared: ElectronShimShared = { ipcHandlers: new Map() };

const electron = createElectronShim(electronShimShared);

export const {
  app,
  ipcMain,
  BrowserWindow,
  WebContentsView,
  nativeTheme,
  safeStorage,
  Notification,
  shell,
  dialog,
  net,
  Menu,
  protocol,
  nativeImage,
  autoUpdater,
  crashReporter,
  clipboard,
  session,
  powerMonitor,
  globalShortcut,
  screen,
  Tray,
  desktopCapturer,
  utilityProcess,
} = electron;

export default electron;
