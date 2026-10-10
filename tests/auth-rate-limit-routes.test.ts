import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ip:vi.fn(), account:vi.fn(), user:vi.fn(), compare:vi.fn(), hash:vi.fn(), session:vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { user: { findUnique:mocks.user } } }));
vi.mock("@/server/auth/rate-limit", () => ({ guardAuthIp:mocks.ip, guardAuthAccount:mocks.account }));
vi.mock("bcryptjs", () => ({ compare:mocks.compare, hash:mocks.hash }));
vi.mock("@/server/auth/session", () => ({ createSession:mocks.session }));
import { POST as login } from "@/app/api/auth/login/route";
import { POST as activate } from "@/app/api/auth/first-login/route";
const body = { login:"employee", password:"old", passwordConfirm:"old" };
const req = (value: unknown = body) => new Request("https://app.example/api", { method:"POST", body:JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); mocks.ip.mockResolvedValue(null); mocks.account.mockResolvedValue(null); });
describe("auth limiter route integration", () => {
  it.each([login, activate])("rejects before JSON parsing or account lookup when IP budget exhausted", async handler => {
    mocks.ip.mockResolvedValue(new Response(null, { status:429 }));
    const invalid = new Request("https://app.example/api", { method:"POST", body:"invalid JSON" });
    expect((await handler(invalid)).status).toBe(429);
    expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each([login, activate])("rejects before bcrypt or account mutation when identity budget exhausted", async handler => {
    mocks.account.mockResolvedValue(new Response(null, { status:429 }));
    expect((await handler(req({ ...body, password:"123456", passwordConfirm:"123456" }))).status).toBe(429);
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
  });
  it("keeps existing short passwords and login sessions working", async () => {
    mocks.user.mockResolvedValue({ id:"u", login:"employee", isActive:true, mustSetPassword:false, passwordHash:"hash", role:"WOWSTORG" });
    mocks.compare.mockResolvedValue(true);
    expect((await login(req())).status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledWith("old", "hash"); expect(mocks.session).toHaveBeenCalledWith("u");
  });
});
