import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isTrustedMutation } from "@/server/security/request-origin";
import { proxy, config } from "@/proxy";

const target = "https://wowstorgwebapp.vercel.app";
function request(headers: Record<string, string> = {}, method = "POST", path = "/api/proposals", origin = target) {
  return new NextRequest(origin + path, { method, headers: { Host: new URL(origin).host, ...headers } });
}

describe("same-origin API mutation boundary", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("allows %s without replacing handler authorization", method => {
    expect(isTrustedMutation(request({ Origin: "https://other.example" }, method))).toBe(true);
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("requires origin evidence for %s", method => {
    expect(isTrustedMutation(request({}, method))).toBe(false);
    expect(isTrustedMutation(request({ Origin: target }, method))).toBe(true);
  });
  it.each(["null", "https://evil.example", "http://wowstorgwebapp.vercel.app", `${target}:444`,
    `${target}.evil.example`, `${target}/path`, `${target}, https://evil.example`, "not a URL"])("rejects untrusted origin %s", origin => {
    expect(isTrustedMutation(request({ Origin: origin, "Sec-Fetch-Site": "same-origin", Referer: target + "/" }))).toBe(false);
  });
  it("rejects cross-site metadata even if an Origin matches", () => {
    expect(isTrustedMutation(request({ Origin: target, "Sec-Fetch-Site": "cross-site" }))).toBe(false);
  });
  it("does not implicitly trust sibling domains", () => {
    expect(isTrustedMutation(request({ "Sec-Fetch-Site": "same-site" }))).toBe(false);
    expect(isTrustedMutation(request({ Origin: "https://sibling.vercel.app", "Sec-Fetch-Site": "same-site" }))).toBe(false);
  });
  it("supports legacy browsers with same-origin Referer and metadata-only requests", () => {
    expect(isTrustedMutation(request({ Referer: target + "/projects/test?view=board" }))).toBe(true);
    expect(isTrustedMutation(request({ "Sec-Fetch-Site": "same-origin" }))).toBe(true);
    expect(isTrustedMutation(request({ Referer: "https://other.example/page" }))).toBe(false);
  });
  it.each(["http://localhost:3000", "http://127.0.0.1:3217", "https://custom.example", "https://preview-unique.vercel.app"])("supports the actual deployment origin %s", origin => {
    expect(isTrustedMutation(request({ Origin: origin }, "POST", "/api/auth/login", origin))).toBe(true);
    expect(isTrustedMutation(request({ Origin: target }, "POST", "/api/auth/login", origin))).toBe(false);
  });
  it.each(["/api/reminders/run", "/api/admin/inventory-audit/cron", "/api/telegram/webhook"])("leaves secret validation on exact machine route %s", path => {
    expect(isTrustedMutation(request({}, "POST", path))).toBe(true);
    expect(isTrustedMutation(request({}, "POST", path + "/extra"))).toBe(false);
    expect(isTrustedMutation(request({ "Sec-Fetch-Site": "cross-site" }, "POST", path))).toBe(false);
  });
  it("does not allow cookies or bearer headers to bypass browser origin checks", () => {
    expect(isTrustedMutation(request({ Cookie: "wowstorg_session=opaque", Authorization: "Bearer opaque" }))).toBe(false);
  });
  it("ignores forwarded-host spoofing and rejects malformed authorities", () => {
    expect(isTrustedMutation(request({ Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" }))).toBe(false);
    expect(isTrustedMutation(request({ Origin: target, Host: "wowstorgwebapp.vercel.app, evil.example" }))).toBe(false);
  });
  it("returns the common 403 envelope without forwarding blocked requests", async () => {
    const response = proxy(request({ Origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.message).toContain("другого сайта");
    expect(config.matcher).toBe("/api/:path*");
    expect(proxy(request({ Origin: target })).headers.get("x-middleware-next")).toBe("1");
  });
});
