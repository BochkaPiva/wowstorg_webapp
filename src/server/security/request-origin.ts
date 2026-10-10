// Network-boundary CSRF defence. Role/session checks still belong to handlers.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MACHINE_ENDPOINTS = new Set([
  "/api/reminders/run",
  "/api/admin/inventory-audit/cron",
  "/api/telegram/webhook",
]);

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function isTrustedMutation(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  let target = parseHttpUrl(request.url);
  if (!target) return false;
  // NextURL normalizes loopback addresses to localhost. Preserve the actual
  // HTTP authority (including port), without trusting caller-supplied forwarded hosts.
  const host = request.headers.get("host");
  if (host !== null) {
    if (!/^[a-z0-9.\[\]:-]+$/i.test(host)) return false;
    const authority = parseHttpUrl(`${target.protocol}//${host}`);
    if (!authority) return false;
    target = new URL(target.pathname, authority);
  }
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (origin !== null) {
    const source = parseHttpUrl(origin);
    // Origin must be a single serialized origin, never a path, null or a list.
    return source !== null && origin === source.origin && source.origin === target.origin;
  }
  const referer = request.headers.get("referer");
  if (referer !== null) return parseHttpUrl(referer)?.origin === target.origin;
  if (site === "same-origin") return true;

  // Sibling subdomains are not trusted. Only these exact token-authenticated
  // machine routes can omit browser origin metadata; handlers verify secrets.
  return site === null && MACHINE_ENDPOINTS.has(target.pathname);
}
