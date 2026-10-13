import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { configure } = require(path.resolve("scripts/configure-speed-trivia-admission.cjs")) as {
  configure: (options: { token: string; secret?: string; apply?: boolean; transport: typeof fetch }) => Promise<Record<string, unknown>>;
};
describe("private Speed admission key provisioning", () => {
  const secret = "synthetic-key-for-isolated-configuration-checks";
  const response = (rows: unknown) => new Response(JSON.stringify(rows), { status: 201 });
  it("defaults to a read-only prerequisite check without a key", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response([{ executor: "postgres", bypass_rls: true, schema_present: false }]));
    expect(await configure({ token: "synthetic-token", transport })).toMatchObject({ mode: "dry-run", mutations: 0, schema_present: false });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject({ parameters: ["postgres"], read_only: true });
  });
  it("binds the key only after validating DBA and schema prerequisites", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ executor: "postgres", bypass_rls: true, schema_present: true }]))
      .mockResolvedValueOnce(response([{ configured: true }]));
    const result = await configure({ token: "synthetic-token", secret, apply: true, transport });
    const body = JSON.parse(String(transport.mock.calls[1][1]?.body)) as { query: string; parameters: string[]; read_only: boolean };
    expect(body.query).toContain("admission_secret=$1"); expect(body.query).not.toContain(secret);
    expect(body.query).toContain("admission_secret is null or admission_secret=$1");
    expect(body.parameters).toEqual([secret]); expect(body.read_only).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("refuses missing keys, insufficient privilege, and an existing different key", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(configure({ token: "synthetic-token", apply: true, transport })).rejects.toThrow("missing-admission-secret");
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValueOnce(response([{ executor: "service_role", bypass_rls: false, schema_present: true }]));
    await expect(configure({ token: "synthetic-token", secret, apply: true, transport })).rejects.toThrow("DBA-prerequisites-missing");
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockResolvedValueOnce(response([{ executor: "postgres", bypass_rls: true, schema_present: true }])).mockResolvedValueOnce(response([]));
    await expect(configure({ token: "synthetic-token", secret, apply: true, transport })).rejects.toThrow("existing-key-or-control-state-conflict");
  });
});
