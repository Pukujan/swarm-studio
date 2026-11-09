import { z } from "zod";
import log from "electron-log";
import { ToolDefinition, escapeXmlContent, AgentContext } from "./types";
import {
  getImageDimensionsFromDataUrl,
  isImageTooLarge,
  MAX_IMAGE_DIMENSION,
} from "./image_utils";

const logger = log.scope("view_render");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const viewRenderSchema = z.object({
  viewport: z
    .enum(["desktop", "mobile"])
    .optional()
    .describe("Viewport to render at. Defaults to desktop (1440x900)."),
  path: z
    .string()
    .regex(/^\//, "path must be a relative route starting with \"/\"")
    .optional()
    .describe("Route to render, e.g. \"/settings\". Defaults to \"/\"."),
});

const DESCRIPTION = `
Render the running app in a real browser and return a screenshot you can see.

Use this to LOOK at what you built before claiming it works: layout, spacing,
colors, overflow, and anything the DOM alone will not tell you. The screenshot
is attached to your next message as an image.

- Starts (or reuses) the app's dev server, opens the route, captures a JPEG.
- Call it after a change you cannot verify from source alone; skip it when the
  change is not visual or the app already looks right.
- Pass \`path\` to check a specific route and \`viewport\` to check mobile.
`;

export const viewRenderTool: ToolDefinition<z.infer<typeof viewRenderSchema>> = {
  name: "view_render",
  description: DESCRIPTION,
  inputSchema: viewRenderSchema,
  defaultConsent: "always",

  // ABA addition: only present when the headless boot opted in with
  // --view-render. Never on the Electron product path.
  isEnabled: (ctx) => process.env.ABA_VIEW_RENDER === "1" && ctx.isDyadPro,

  getConsentPreview: (args) => {
    const viewport = args.viewport ?? "desktop";
    const path = args.path ?? "/";
    return `Render ${path} (${viewport})`;
  },

  buildXml: (args, isComplete) => {
    const path = args.path ?? "/";
    let xml = `<dyad-view-render>${escapeXmlContent(path)}`;
    if (isComplete) {
      xml += "</dyad-view-render>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const viewportName = args.viewport ?? "desktop";
    const route = args.path ?? "/";
    const viewport = VIEWPORTS[viewportName];

    let browser: import("playwright").Browser | undefined;
    try {
      // Real dev server, driven exactly as the renderer's "run app" button
      // drives it. Never throws; ok:false carries the reason.
      const preview = await (
        await import("@/testing/headless_app_preview")
      ).ensureHeadlessAppPreview({ appId: ctx.appId });
      if (!preview.ok || !preview.url) {
        throw new Error(preview.error ?? "app preview did not become ready");
      }

      const { chromium } = await import("playwright");
      browser = await chromium.launch();
      const page = await browser.newPage({ viewport });
      await page.goto(new URL(route, preview.url).toString(), {
        waitUntil: "load",
        timeout: 60_000,
      });
      // A page that fetches its data on mount is still showing its loading
      // state at "load", so an immediate screenshot shows skeletons, not the
      // built UI. Wait for the network to settle, bounded so a polling app
      // cannot stall the capture; a settled-but-idle page passes immediately.
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => undefined);
      const buffer = await page.screenshot({ type: "jpeg", quality: 80 });
      const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;

      const dimensions = getImageDimensionsFromDataUrl(dataUrl);
      if (dimensions && isImageTooLarge(dimensions)) {
        return `view_render captured ${route} but the image (${dimensions.width}x${dimensions.height}) exceeds ${MAX_IMAGE_DIMENSION}px and was not attached.`;
      }

      ctx.appendUserMessage([
        {
          type: "text",
          text: `Screenshot of ${route} at ${viewportName} (${viewport.width}x${viewport.height}) — the app's current rendered state:`,
        },
        { type: "image-url", url: dataUrl },
      ]);

      return `Rendered ${route} at ${viewportName}; screenshot attached as an image.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`view_render failed: ${message}`);
      return `view_render failed — continuing without it: ${message}`;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  },
};
