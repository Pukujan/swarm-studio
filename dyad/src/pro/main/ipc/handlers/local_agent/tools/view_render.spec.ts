import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentContext } from "./types";
import { shouldIncludeTool } from "../tool_definitions";
import { viewRenderTool } from "./view_render";

vi.mock("@/testing/headless_app_preview", () => ({
  ensureHeadlessAppPreview: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => {
      throw new Error("Executable doesn't exist (playwright not installed)");
    }),
  },
}));

describe("view_render tool", () => {
  const baseCtx = {
    appId: 42,
    isDyadPro: true,
    appendUserMessage: vi.fn(),
  } as unknown as AgentContext;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ABA_VIEW_RENDER;
  });

  it("is excluded without ABA_VIEW_RENDER", () => {
    expect(
      shouldIncludeTool(viewRenderTool, baseCtx),
    ).toBe(false);
  });

  it("is excluded with ABA_VIEW_RENDER but without Pro", () => {
    process.env.ABA_VIEW_RENDER = "1";
    expect(
      shouldIncludeTool(viewRenderTool, { ...baseCtx, isDyadPro: false }),
    ).toBe(false);
  });

  it("is included with ABA_VIEW_RENDER and Pro", () => {
    process.env.ABA_VIEW_RENDER = "1";
    expect(shouldIncludeTool(viewRenderTool, baseCtx)).toBe(true);
  });

  it("auto-approves and does not declare state mutation", () => {
    expect(viewRenderTool.defaultConsent).toBe("always");
    expect(viewRenderTool.modifiesState).toBeUndefined();
  });

  it("rejects an unknown viewport and an absolute path", () => {
    expect(() => viewRenderTool.inputSchema.parse({ viewport: "wide" })).toThrow();
    expect(() =>
      viewRenderTool.inputSchema.parse({ path: "https://evil.example" }),
    ).toThrow();
    expect(viewRenderTool.inputSchema.parse({})).toEqual({});
    expect(
      viewRenderTool.inputSchema.parse({ path: "/settings", viewport: "mobile" }),
    ).toEqual({ path: "/settings", viewport: "mobile" });
  });

  it("builds an xml tag from the partial path arg", () => {
    expect(viewRenderTool.buildXml?.({}, false)).toBe("<dyad-view-render>/");
    expect(viewRenderTool.buildXml?.({ path: "/about" }, false)).toBe(
      "<dyad-view-render>/about",
    );
    expect(viewRenderTool.buildXml?.({}, true)).toBe(
      "<dyad-view-render>/</dyad-view-render>",
    );
  });

  it("returns a refusal instead of throwing when the browser cannot launch", async () => {
    process.env.ABA_VIEW_RENDER = "1";
    const { ensureHeadlessAppPreview } = await import(
      "@/testing/headless_app_preview"
    );
    vi.mocked(ensureHeadlessAppPreview).mockResolvedValue({
      ok: true,
      url: "http://127.0.0.1:30001",
      port: 30001,
    });

    const appendUserMessage = vi.fn();
    const ctx = { ...baseCtx, appendUserMessage } as AgentContext;

    const result = await viewRenderTool.execute({}, ctx);

    expect(result).toContain("view_render failed — continuing without it");
    expect(result).not.toContain("undefined");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("refuses when the app preview never becomes ready", async () => {
    process.env.ABA_VIEW_RENDER = "1";
    const { ensureHeadlessAppPreview } = await import(
      "@/testing/headless_app_preview"
    );
    vi.mocked(ensureHeadlessAppPreview).mockResolvedValue({
      ok: false,
      port: 30001,
      error: "dev server failed to become ready",
    });

    const result = await viewRenderTool.execute({}, baseCtx);

    expect(result).toContain("view_render failed — continuing without it");
    expect(result).toContain("dev server failed to become ready");
  });
});
