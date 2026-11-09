import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeOctoSql,
  formatQueryResult,
  formatSchema,
  getOctoTableSchema,
} from "./octo_context";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

const fetchMock = vi.fn();

function okJson(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("octo_context", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.OCTO_API_KEY = "test-key";
    process.env.OCTO_WORKSPACE_ID = "test-workspace";
    process.env.OCTO_BASE_URL = "https://octo.example.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.OCTO_API_KEY;
    delete process.env.OCTO_WORKSPACE_ID;
    delete process.env.OCTO_BASE_URL;
  });

  it("POSTs the param-less batch shape with a bearer header to the workspace path", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ columns: ["id"], rows: [{ id: 1 }] }),
    );

    await executeOctoSql({ query: "SELECT 1 AS id" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://octo.example.test/api/workspaces/test-workspace/query",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({ sql: "SELECT 1 AS id" });
  });

  it("renders rows as readable text", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ columns: ["id", "name"], rows: [{ id: 1, name: "a" }] }),
    );

    const out = await executeOctoSql({ query: "SELECT * FROM t" });

    expect(out).toContain("OK — 1 row(s)");
    expect(out).toContain("id | name");
    expect(out).toContain("1 | a");
  });

  it("retries a 502 cold start, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({}, 502))
      .mockResolvedValueOnce(okJson({ columns: ["x"], rows: [{ x: 1 }] }));

    const out = await executeOctoSql({ query: "SELECT 1" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toContain("OK — 1 row(s)");
  });

  it("keeps Postgres's own error message and SQLSTATE verbatim", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ message: 'relation "nope" does not exist', code: "42P01" }, 400),
    );

    const out = await executeOctoSql({ query: "SELECT * FROM nope" });

    expect(out).toBe('SQL error [42P01]: relation "nope" does not exist');
  });

  it("throws a Precondition error when Octo is not configured", async () => {
    delete process.env.OCTO_API_KEY;

    await expect(executeOctoSql({ query: "SELECT 1" })).rejects.toMatchObject({
      kind: DyadErrorKind.Precondition,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws an External error when no answer arrives after retries", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(executeOctoSql({ query: "SELECT 1" })).rejects.toBeInstanceOf(
      DyadError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads the workspace schema for all tables", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        columns: ["table_schema", "table_name", "column_name"],
        rows: [
          { table_schema: "public", table_name: "users", column_name: "id" },
          { table_schema: "public", table_name: "users", column_name: "name" },
        ],
      }),
    );

    const out = await getOctoTableSchema({});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://octo.example.test/api/workspaces/test-workspace/query",
    );
    expect(JSON.parse(init.body).sql).toContain("information_schema.columns");
    expect(out).toContain("public.users (");
    expect(out).toContain("  id ");
  });

  it("binds a table name as a parameter", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ columns: [], rows: [] }));

    await getOctoTableSchema({ tableName: "users" });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.sql).toContain("table_name = $1");
    expect(payload.params).toEqual(["users"]);
  });

  it("reports when the workspace has no tables", () => {
    expect(formatSchema([])).toBe("No tables found in this workspace.");
  });

  it("formats a no-result-set statement", () => {
    expect(
      formatQueryResult({
        ok: true,
        status: 200,
        body: { rows: [], columns: [] },
        raw: "{}",
      }),
    ).toContain("no result set");
  });
});
