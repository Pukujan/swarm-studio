import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./types";
import { executeSqlTool } from "./execute_sql";
import { getDatabaseTableSchemaTool } from "./get_database_table_schema";

const {
  executeSupabaseSqlMock,
  executeNeonSqlMock,
  executeOctoSqlMock,
  getSupabaseTableSchemaMock,
  getNeonTableSchemaMock,
  getOctoTableSchemaMock,
} = vi.hoisted(() => ({
  executeSupabaseSqlMock: vi.fn(),
  executeNeonSqlMock: vi.fn(),
  executeOctoSqlMock: vi.fn(),
  getSupabaseTableSchemaMock: vi.fn(),
  getNeonTableSchemaMock: vi.fn(),
  getOctoTableSchemaMock: vi.fn(),
}));

vi.mock("../../../../../../supabase_admin/supabase_management_client", () => ({
  executeSupabaseSql: executeSupabaseSqlMock,
}));
vi.mock("../../../../../../neon_admin/neon_context", () => ({
  executeNeonSql: executeNeonSqlMock,
  getNeonTableSchema: getNeonTableSchemaMock,
}));
vi.mock("../../../../../../octo_admin/octo_context", () => ({
  executeOctoSql: executeOctoSqlMock,
  getOctoTableSchema: getOctoTableSchemaMock,
}));
vi.mock("../../../../../../supabase_admin/supabase_context", () => ({
  getSupabaseTableSchema: getSupabaseTableSchemaMock,
}));
vi.mock("../../../../../../main/settings", () => ({
  readSettings: () => ({ enableSupabaseWriteSqlMigration: false }),
}));
vi.mock("../../../../../../ipc/utils/file_utils", () => ({
  writeMigrationFile: vi.fn(),
}));

function supabaseContext(): AgentContext {
  return {
    appPath: "/tmp/app",
    supabaseProjectId: "supabase-project",
    supabaseOrganizationSlug: "supabase-org",
    supabaseProviderToolsAvailable: true,
    neonProjectId: null,
    neonActiveBranchId: null,
    neonProviderToolsAvailable: false,
    onXmlStream: vi.fn(),
    onXmlComplete: vi.fn(),
  } as unknown as AgentContext;
}

function neonContext(): AgentContext {
  return {
    appPath: "/tmp/app",
    supabaseProjectId: null,
    supabaseOrganizationSlug: null,
    supabaseProviderToolsAvailable: false,
    neonProjectId: "neon-project",
    neonActiveBranchId: "neon-branch",
    neonProviderToolsAvailable: true,
    onXmlStream: vi.fn(),
    onXmlComplete: vi.fn(),
  } as unknown as AgentContext;
}

function dualProviderContext(): AgentContext {
  return {
    ...supabaseContext(),
    neonProjectId: "neon-project",
    neonActiveBranchId: "neon-branch",
    neonProviderToolsAvailable: true,
  } as AgentContext;
}

describe("database provider tool routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeSupabaseSqlMock.mockResolvedValue("supabase result");
    executeNeonSqlMock.mockResolvedValue("neon result");
    executeOctoSqlMock.mockResolvedValue("octo result");
    getSupabaseTableSchemaMock.mockResolvedValue("supabase schema");
    getNeonTableSchemaMock.mockResolvedValue("neon schema");
    getOctoTableSchemaMock.mockResolvedValue("octo schema");
    // Octo is off unless a test turns it on: it resolves from env, not from an
    // app link, so the other cases below must see it unconfigured.
    delete process.env.OCTO_API_KEY;
    delete process.env.OCTO_WORKSPACE_ID;
  });

  describe("octo (delta 7)", () => {
    beforeEach(() => {
      process.env.OCTO_API_KEY = "test-key";
      process.env.OCTO_WORKSPACE_ID = "test-workspace";
    });
    afterEach(() => {
      delete process.env.OCTO_API_KEY;
      delete process.env.OCTO_WORKSPACE_ID;
    });

    it("routes SQL to Octo and never to a linked provider", async () => {
      await executeSqlTool.execute({ query: "select 1" }, dualProviderContext());

      expect(executeOctoSqlMock).toHaveBeenCalledWith({ query: "select 1" });
      expect(executeSupabaseSqlMock).not.toHaveBeenCalled();
      expect(executeNeonSqlMock).not.toHaveBeenCalled();
    });

    it("routes schema reads to Octo and never to a linked provider", async () => {
      await getDatabaseTableSchemaTool.execute({}, dualProviderContext());

      expect(getOctoTableSchemaMock).toHaveBeenCalled();
      expect(getSupabaseTableSchemaMock).not.toHaveBeenCalled();
      expect(getNeonTableSchemaMock).not.toHaveBeenCalled();
    });

    it("enables the database tools without any app link", async () => {
      const bare = {
        appPath: "/tmp/app",
        supabaseProjectId: null,
        neonProjectId: null,
        onXmlStream: vi.fn(),
        onXmlComplete: vi.fn(),
      } as unknown as AgentContext;

      expect(executeSqlTool.isEnabled?.(bare)).toBe(true);
      expect(getDatabaseTableSchemaTool.isEnabled?.(bare)).toBe(true);
    });
  });

  it("routes SQL to an available Supabase provider", async () => {
    await executeSqlTool.execute({ query: "select 1" }, supabaseContext());

    expect(executeSupabaseSqlMock).toHaveBeenCalled();
    expect(executeNeonSqlMock).not.toHaveBeenCalled();
  });

  it("routes schema reads to an available Supabase provider", async () => {
    await getDatabaseTableSchemaTool.execute({}, supabaseContext());

    expect(getSupabaseTableSchemaMock).toHaveBeenCalled();
    expect(getNeonTableSchemaMock).not.toHaveBeenCalled();
  });

  it("routes SQL and schema reads consistently for a dual-linked app", async () => {
    const ctx = dualProviderContext();

    await executeSqlTool.execute({ query: "select 1" }, ctx);
    await getDatabaseTableSchemaTool.execute({}, ctx);

    expect(executeNeonSqlMock).toHaveBeenCalled();
    expect(getNeonTableSchemaMock).toHaveBeenCalled();
    expect(executeSupabaseSqlMock).not.toHaveBeenCalled();
    expect(getSupabaseTableSchemaMock).not.toHaveBeenCalled();
  });

  it("routes SQL to an available Neon provider", async () => {
    await executeSqlTool.execute({ query: "select 1" }, neonContext());

    expect(executeNeonSqlMock).toHaveBeenCalled();
    expect(executeSupabaseSqlMock).not.toHaveBeenCalled();
  });

  it("routes schema reads to an available Neon provider", async () => {
    await getDatabaseTableSchemaTool.execute({}, neonContext());

    expect(getNeonTableSchemaMock).toHaveBeenCalled();
    expect(getSupabaseTableSchemaMock).not.toHaveBeenCalled();
  });

  it("guides the user to select a missing Neon branch", async () => {
    const ctx = {
      ...neonContext(),
      neonActiveBranchId: null,
      neonProviderToolsAvailable: false,
    };

    await expect(
      executeSqlTool.execute({ query: "select 1" }, ctx),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Select an active branch"),
    });
    await expect(
      getDatabaseTableSchemaTool.execute({}, ctx),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Select an active branch"),
    });
  });

  it("guides the user to reconnect retained provider associations", async () => {
    const neon = {
      ...neonContext(),
      neonProviderToolsAvailable: false,
    };
    const supabase = {
      ...supabaseContext(),
      supabaseProviderToolsAvailable: false,
    };

    await expect(
      executeSqlTool.execute({ query: "select 1" }, neon),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Reconnect the Neon account"),
    });
    await expect(
      getDatabaseTableSchemaTool.execute({}, supabase),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Reconnect the Supabase organization"),
    });
  });

  it("uses the preferred dual-linked provider in unavailable guidance", async () => {
    const ctx = {
      ...dualProviderContext(),
      supabaseProviderToolsAvailable: false,
      neonActiveBranchId: null,
      neonProviderToolsAvailable: false,
    };

    await expect(
      executeSqlTool.execute({ query: "select 1" }, ctx),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Neon integration settings"),
    });
  });

  it("fails closed instead of switching a dual-linked database to Supabase", async () => {
    const ctx = {
      ...dualProviderContext(),
      neonProviderToolsAvailable: false,
    };

    await expect(
      executeSqlTool.execute({ query: "select 1" }, ctx),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Reconnect the Neon account"),
    });
    await expect(
      getDatabaseTableSchemaTool.execute({}, ctx),
    ).rejects.toMatchObject({
      kind: "precondition",
      message: expect.stringContaining("Reconnect the Neon account"),
    });
    expect(executeSupabaseSqlMock).not.toHaveBeenCalled();
    expect(getSupabaseTableSchemaMock).not.toHaveBeenCalled();
    expect(executeSqlTool.isEnabled?.(ctx)).toBe(false);
    expect(getDatabaseTableSchemaTool.isEnabled?.(ctx)).toBe(false);
  });
});
