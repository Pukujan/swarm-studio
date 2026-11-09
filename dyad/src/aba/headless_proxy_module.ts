/**
 * The headless bundle's replacement for `@/ipc/utils/start_proxy_server`.
 *
 * The headless preview path (`@/testing/headless_app_preview`, driven by the
 * native `view_render` tool) asserts that the installed proxy module is a
 * headless-capable one via the `HEADLESS_PROXY_MARKER` property. In vitest that
 * assertion is satisfied by a `vi.mock`; a plain-`node` CJS bundle has no mock,
 * so the bundler aliases the specifier to this module instead.
 *
 * This re-exports the REAL `startProxy` unchanged — the worker resolution in
 * the original (`__dirname/../../worker/proxy_server.js`) already lands on
 * `dyad/worker/proxy_server.js` when bundled to `.vite/build`, which is the
 * correct file — and only attaches the marker property the assertion looks for.
 *
 * The relative import below is deliberate: the bundler alias rewrites the
 * `@/ipc/utils/start_proxy_server` specifier to THIS module, so importing that
 * specifier here would be a circular self-import. A relative path never
 * matches the alias and reaches the real module.
 */
import { startProxy } from "../ipc/utils/start_proxy_server";
import { HEADLESS_PROXY_MARKER } from "@/testing/headless_proxy_server";

export { startProxy };

Object.defineProperty(startProxy, HEADLESS_PROXY_MARKER, { value: true });
