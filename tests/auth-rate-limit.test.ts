import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { $queryRaw: db.query, $executeRaw: db.execute, $transaction: db.transaction } }));
import { authBudgetKey, canonicalClientNetwork, clientNetwork, consumeAuthBudget, guardAuthAccount, guardAuthIp } from "@/server/auth/rate-limit";

const request = (headers: Record<string, string> = {}) => new Request("https://app.example/api/auth/login", { headers });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("VERCEL", "1");
  db.query.mockResolvedValue([{ attempts: 1, retryAfterSeconds: 600 }]);
  db.execute.mockResolvedValue(0);
  db.transaction.mockImplementation(callback => callback({ $queryRaw: db.query }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("trusted network identity", () => {
  it.each([
    ["192.0.2.1", "192.0.2.1"], ["::ffff:192.0.2.1", "192.0.2.1"],
    ["2001:db8:abcd:12::1", "2001:0db8:abcd:0012::/64"],
    ["2001:0db8:abcd:0012:ffff:eeee:aaaa:bbbb", "2001:0db8:abcd:0012::/64"],
    ["192.0.2.1, 192.0.2.2", null], ["invalid", null], ["fe80::1%eth0", null],
  ])("canonicalises %s", (input, expected) => expect(canonicalClientNetwork(input)).toBe(expected));
  it("does not accept a client-supplied fallback forwarded header", () => {
    expect(clientNetwork(request({ "x-forwarded-for": "192.0.2.1" }))).toBeNull();
    expect(clientNetwork(request({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }))).toBe("192.0.2.1");
  });
  it("does not trust forwarding headers outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientNetwork(request({ "x-vercel-forwarded-for": "192.0.2.1" }))).toBe("non-vercel");
  });
  it("stores scoped pseudonyms, not raw identity", () => {
    const key = authBudgetKey("pair", "192.0.2.1", "employee");
    expect(key).toMatch(/^auth:pair:[a-f0-9]{64}$/);
    expect(key).not.toContain("employee");
    expect(key).not.toEqual(authBudgetKey("pair", "employee", "192.0.2.1"));
  });
});

describe("shared budgets", () => {
  const req = () => request({ "x-vercel-forwarded-for": "192.0.2.1" });
  it("uses an atomic parameterised upsert with a fixed expiry and bounded counter", async () => {
    await consumeAuthBudget({ $queryRaw: db.query }, "untrusted-key", 8);
    const [sql, ...params] = db.query.mock.calls[0];
    expect(sql.join("?")).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(sql.join("?")).not.toContain("untrusted-key");
    expect(params).toContain("untrusted-key"); expect(params).toContain(9);
    expect(sql.join("?")).toContain('ELSE "AuthRateLimit"."expiresAt" END');
  });
  it("allows the last permitted request and rejects the next with Retry-After", async () => {
    db.query.mockResolvedValueOnce([{ attempts: 60, retryAfterSeconds: 120 }]);
    expect(await guardAuthIp(req())).toBeNull();
    db.query.mockResolvedValueOnce([{ attempts: 61, retryAfterSeconds: 120 }]);
    const denied = await guardAuthIp(req());
    expect(denied?.status).toBe(429); expect(denied?.headers.get("Retry-After")).toBe("120");
    expect(denied?.headers.get("Cache-Control")).toBe("no-store");
  });
  it("checks account and pair together, using the longest remaining wait", async () => {
    db.query.mockResolvedValueOnce([{ attempts: 41, retryAfterSeconds: 300 }])
      .mockResolvedValueOnce([{ attempts: 9, retryAfterSeconds: 120 }]);
    const denied = await guardAuthAccount(req(), " employee ");
    expect(denied?.status).toBe(429); expect(denied?.headers.get("Retry-After")).toBe("300");
    expect(db.query.mock.calls[0][1]).toBe(authBudgetKey("account", "employee"));
    expect(db.query.mock.calls[1][1]).toBe(authBudgetKey("pair", "192.0.2.1", "employee"));
    expect(db.transaction.mock.calls[0][1]).toEqual({ maxWait: 3000, timeout: 5000 });
  });
  it.each(["ip", "account", "missing-header"])("fails closed for %s without exposing database errors", async mode => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.query.mockRejectedValue(new Error("secret-connection-string"));
    const result = mode === "account" ? await guardAuthAccount(req(), "employee")
      : await guardAuthIp(mode === "missing-header" ? request() : req());
    expect(result?.status).toBe(503); expect(result?.headers.get("Retry-After")).toBe("60");
    expect(await result?.text()).not.toContain("secret-connection-string");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-connection-string");
  });
});
