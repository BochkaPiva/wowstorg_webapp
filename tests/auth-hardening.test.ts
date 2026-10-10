import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  session: { findFirst: vi.fn(), deleteMany: vi.fn() },
  transaction: vi.fn(), query: vi.fn(), execute: vi.fn(), hash: vi.fn(), cookies: vi.fn(), role: vi.fn(),
}));
vi.mock("@/server/db", () => ({ prisma: {
  user: mocks.user, session: mocks.session, $transaction: mocks.transaction, $queryRaw: mocks.query,
} }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.role }));
vi.mock("@/server/auth/rate-limit", () => ({ guardAuthIp: vi.fn(async () => null), guardAuthAccount: vi.fn(async () => null) }));
import { getCurrentUser } from "@/server/auth/session";
import { POST as activate } from "@/app/api/auth/first-login/route";
import { PATCH as editUser } from "@/app/api/admin/users/[id]/route";

const user = { id: "user", login: "test", displayName: "Test", role: "GREENWICH", isActive: true, mustSetPassword: false };
const context = { params: Promise.resolve({ id: "user" }) };
const request = (body: object) => new Request("https://app.example/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "opaque-cookie" }) });
  mocks.hash.mockResolvedValue("hashed-password");
  mocks.user.findUnique.mockResolvedValue(user);
  mocks.user.update.mockResolvedValue({ ...user, createdAt: new Date("2026-01-01") });
  mocks.role.mockResolvedValue({ ok: true, user: { id: "admin", role: "WOWSTORG" } });
  mocks.query.mockResolvedValue([]);
  mocks.transaction.mockImplementation(callback => callback({ user: mocks.user, session: mocks.session, $executeRaw: mocks.execute }));
});

describe("session lifecycle hardening", () => {
  it.each([{ isActive: false }, { mustSetPassword: true }])("rejects sessions when account needs reauthorization: %j", fields => {
    mocks.session.findFirst.mockResolvedValue({ user: { ...user, ...fields } });
    return expect(getCurrentUser()).resolves.toBeNull();
  });
  it("loads only public identity and authorization flags, not password hashes", async () => {
    mocks.session.findFirst.mockResolvedValue({ user });
    expect(await getCurrentUser()).toEqual({ id: "user", login: "test", displayName: "Test", role: "GREENWICH" });
    expect(mocks.session.findFirst.mock.calls[0][0].select.user.select).not.toHaveProperty("passwordHash");
  });
  it.each([{ password: "new-password" }, { mustSetPassword: true }, { isActive: false }, { role: "WOWSTORG" }])("revokes sessions atomically for admin security change %j", async body => {
    expect((await editUser(request(body), context)).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user" } });
  });
  it("does not log out users for profile-only changes", async () => {
    expect((await editUser(request({ displayName: "New name", telegramChatId: "123" }), context)).status).toBe(200);
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it("does not mutate when role authorization fails", async () => {
    mocks.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await editUser(request({ password: "new-password" }), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("single winner for first password setup", () => {
  const body = { login: "test", password: "new-password", passwordConfirm: "new-password" };
  beforeEach(() => mocks.user.findUnique.mockResolvedValue({ ...user, mustSetPassword: true }));
  it("claims a still-active, still-pending account and revokes previous sessions", async () => {
    mocks.user.updateMany.mockResolvedValue({ count: 1 });
    expect((await activate(request(body))).status).toBe(200);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user", isActive: true, mustSetPassword: true },
      data: { passwordHash: "hashed-password", mustSetPassword: false, passwordSetAt: expect.any(Date) },
    });
    expect(mocks.session.deleteMany).toHaveBeenCalledOnce();
  });
  it("rejects a concurrent activation/block instead of overwriting the password", async () => {
    mocks.user.updateMany.mockResolvedValue({ count: 0 });
    expect((await activate(request(body))).status).toBe(409);
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
  });
  it("rejects mismatched passwords without hashing or writes", async () => {
    expect((await activate(request({ ...body, passwordConfirm: "different-password" }))).status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
