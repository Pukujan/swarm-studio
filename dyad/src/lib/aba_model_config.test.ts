// @vitest-environment node
//
// Unit tests for the ABA model-routing config — the one place every model role
// is chosen. Proves the resolution rules the builder relies on: unset roles
// pass the caller's literal through untouched, `name@provider` pins a provider,
// and a bare name resolves against custom providers (or fails closed).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(dbState.rows),
        }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  language_models: { id: "id", apiName: "apiName", customProviderId: "cp" },
  language_model_providers: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

import {
  abaImageConfig,
  abaVideoCommand,
  resolveAbaModel,
} from "@/lib/aba_model_config";
import { SMALL_MODEL_NAME } from "@/ipc/shared/language_model_constants";

const LITERAL = { provider: "openai", name: SMALL_MODEL_NAME } as const;

const ROLE_VARS = [
  "ABA_MODEL_CHAT",
  "ABA_MODEL_COMPACTION",
  "ABA_MODEL_SUBAGENT_EXPLORER",
  "ABA_MODEL_SUBAGENT_IMPLEMENTER",
  "ABA_MODEL_SUBAGENT_REVIEWER",
  "ABA_MODEL_EXPLORE_CODE",
  "ABA_MODEL_EXPLORE_HISTORY",
  "ABA_MODEL_SAFETY_REVIEW",
  "ABA_MODEL_THEMES",
  "ABA_IMAGE_BASE_URL",
  "ABA_IMAGE_MODEL",
  "ABA_IMAGE_API_KEY",
  "INFERHUB_BASE_URL",
  "INFERHUB_IMAGE_MODEL",
  "INFERHUB_API_KEY",
  "ABA_VIDEO_CMD",
  "ABA_ENV_FILE",
];

describe("aba_model_config", () => {
  beforeEach(() => {
    dbState.rows = [];
    for (const v of ROLE_VARS) delete process.env[v];
  });
  afterEach(() => {
    for (const v of ROLE_VARS) delete process.env[v];
  });

  it("passes the caller's literal through when the role is unset", async () => {
    const out = await resolveAbaModel("COMPACTION", LITERAL);
    expect(out).toBe(LITERAL);
    expect(out).toEqual({ provider: "openai", name: "gpt-6-luna" });
  });

  it("pins an exact provider with name@providerId", async () => {
    process.env.ABA_MODEL_COMPACTION =
      "ih/cb/deepseek-v4.1-flash@localgw";
    const out = await resolveAbaModel("COMPACTION", LITERAL);
    expect(out).toEqual({
      provider: "localgw",
      name: "ih/cb/deepseek-v4.1-flash",
    });
  });

  it("resolves a bare name against a custom provider", async () => {
    process.env.ABA_MODEL_SUBAGENT_EXPLORER = "ih/cb/deepseek-v4.1-flash";
    dbState.rows = [
      { id: 7, apiName: "ih/cb/deepseek-v4.1-flash", providerId: "localgw" },
    ];
    const out = await resolveAbaModel("SUBAGENT_EXPLORER", LITERAL);
    expect(out).toEqual({
      provider: "localgw",
      name: "ih/cb/deepseek-v4.1-flash",
      customModelId: 7,
    });
  });

  it("fails closed when a bare name matches no custom provider", async () => {
    process.env.ABA_MODEL_SAFETY_REVIEW = "no-such-model";
    await expect(resolveAbaModel("SAFETY_REVIEW", LITERAL)).rejects.toThrow(
      /ABA_MODEL_SAFETY_REVIEW="no-such-model"/,
    );
  });

  it("defaults the image route to the upstream values", () => {
    const upstream = {
      baseUrl: "https://engine.dyad.sh/v1/",
      model: "dyad/image-gen",
      apiKey: "k",
    };
    expect(abaImageConfig(upstream)).toEqual({
      baseUrl: "https://engine.dyad.sh/v1",
      model: "dyad/image-gen",
      apiKey: "k",
    });
  });

  it("falls back to the InferHub route when only INFERHUB_API_KEY is set", () => {
    process.env.INFERHUB_API_KEY = "ih-key";
    expect(
      abaImageConfig({
        baseUrl: "https://engine.dyad.sh/v1",
        model: "dyad/image-gen",
        apiKey: "pro-key",
      }),
    ).toEqual({
      baseUrl: "https://api.inferhub.dev/v1",
      model: "cb/gpt-image-2",
      apiKey: "ih-key",
    });
  });

  it("honours INFERHUB_BASE_URL and INFERHUB_IMAGE_MODEL on the InferHub route", () => {
    process.env.INFERHUB_API_KEY = "ih-key";
    process.env.INFERHUB_BASE_URL = "https://alt.inferhub.dev/v1/";
    process.env.INFERHUB_IMAGE_MODEL = "cb/gpt-image-2-hd";
    expect(
      abaImageConfig({ baseUrl: "x", model: "y", apiKey: "z" }),
    ).toEqual({
      baseUrl: "https://alt.inferhub.dev/v1",
      model: "cb/gpt-image-2-hd",
      apiKey: "ih-key",
    });
  });

  it("prefers ABA_IMAGE_* over the InferHub route when its key is set", () => {
    process.env.ABA_IMAGE_API_KEY = "aba-key";
    process.env.ABA_IMAGE_MODEL = "cb/gpt-image-2";
    process.env.INFERHUB_API_KEY = "ih-key";
    process.env.INFERHUB_IMAGE_MODEL = "ih/other-model";
    const out = abaImageConfig({ baseUrl: "x", model: "y", apiKey: "z" });
    expect(out.model).toBe("cb/gpt-image-2");
    expect(out.apiKey).toBe("aba-key");
  });

  it("overrides the image route from env", () => {
    process.env.ABA_IMAGE_BASE_URL = "https://api.inferhub.dev/v1";
    process.env.ABA_IMAGE_MODEL = "cb/gpt-image-2";
    process.env.ABA_IMAGE_API_KEY = "ih-key";
    expect(
      abaImageConfig({ baseUrl: "x", model: "y", apiKey: "z" }),
    ).toEqual({
      baseUrl: "https://api.inferhub.dev/v1",
      model: "cb/gpt-image-2",
      apiKey: "ih-key",
    });
  });

  it("documents the video command", () => {
    expect(abaVideoCommand()).toBe("progrok video");
    process.env.ABA_VIDEO_CMD = "progrok video --model grok-imagine-video";
    expect(abaVideoCommand()).toBe("progrok video --model grok-imagine-video");
  });
});
