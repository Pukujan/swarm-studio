/**
 * Reusable `electron` module mock for main-process integration tests that run
 * under vitest WITHOUT launching Electron.
 *
 * The chat-flow harness (and any other main-process integration suite) mocks
 * the `electron` module so that:
 *   - `ipcMain.handle` records handlers into a Map the test can invoke directly
 *     (this is how we call `chat:stream` without a renderer);
 *   - `app.getPath("userData")` resolves to the per-test temp dir chosen by the
 *     harness via the `DYAD_DEV_USER_DATA_DIR` env var (read at call time so the
 *     harness can set it after this mock is constructed);
 *   - `BrowserWindow` / `safeStorage` / `Notification` / `shell` / `dialog` /
 *     `net` / `utilityProcess` are inert stand-ins so importing main-process
 *     code does not crash.
 *
 * The shape lives in `@/aba/electron_shim` (the vitest-free core, which the
 * headless in-process boot also uses); this module is the vitest binding that
 * makes every stub a `vi.fn()` spy.
 *
 * Usage (must be hoisted so the vi.mock factory can see the shared Map):
 *
 *   const h = vi.hoisted(() => {
 *     process.env.NODE_ENV = "development";
 *     return { ipcHandlers: new Map() };
 *   });
 *   vi.mock("electron", async () => {
 *     const { createElectronMock } = await import("@/testing/electron_mock");
 *     return createElectronMock(h);
 *   });
 *
 * The `h` object is then passed to `setupChatFlowHarness({ electronMock: h })`.
 */
import { vi } from "vitest";

import {
  createElectronShim,
  type ElectronShimShared,
  type IpcHandler,
  type RendererEvent,
  type WrapFn,
} from "@/aba/electron_shim";

export type { IpcHandler, RendererEvent };
export type ElectronMockShared = ElectronShimShared;
export { createFakeIpcEvent, resolveUserDataPath } from "@/aba/electron_shim";

const vitestWrap: WrapFn = (impl) =>
  vi.fn(impl as never) as unknown as (...args: any[]) => any;

/**
 * Returns an object shaped like the `electron` module. Pass the same hoisted
 * `shared` object you handed to `setupChatFlowHarness` so the recorded handlers
 * line up.
 */
export function createElectronMock(shared: ElectronShimShared) {
  return createElectronShim(shared, vitestWrap);
}
