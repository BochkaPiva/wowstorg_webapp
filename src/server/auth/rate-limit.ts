import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";

export const AUTH_LIMITS = { ip: 60, account: 40, pair: 8, windowSeconds: 600 } as const;
type BudgetRow = { attempts: number; retryAfterSeconds: number };
type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

// SHA-256 is pseudonymisation, not encryption; the table remains server-only.
export function authBudgetKey(scope: "ip" | "account" | "pair", ...parts: string[]) {
  return `auth:${scope}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export function canonicalClientNetwork(value: string): string | null {
  const address = value.trim();
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6 || address.includes("%")) return null;
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const a = left ? left.split(":") : [];
  const b = right ? right.split(":") : [];
  const groups = right === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  const numbers = groups.map(group => parseInt(group, 16));
  // IPv4-mapped IPv6 must share the same budget as its IPv4 spelling.
  if (numbers.slice(0, 5).every(n => n === 0) && numbers[5] === 0xffff) {
    return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join(".");
  }
  // Group IPv6 privacy addresses in /64 so rotating the suffix cannot reset limits.
  return `${numbers.slice(0, 4).map(n => n.toString(16).padStart(4, "0")).join(":")}::/64`;
}

export function clientNetwork(request: Request): string | null {
  // Vercel overwrites this header. Arbitrary client-forwarded headers on other
  // hosts are NOT trusted. A self-hosted deployment needs its own verified adapter.
  if (process.env.VERCEL === "1") {
    const value = request.headers.get("x-vercel-forwarded-for");
    return value ? canonicalClientNetwork(value) : null;
  }
  // Conservative shared budget for local/self-hosted requests (including HTTP smoke).
  return "non-vercel";
}

export async function consumeAuthBudget(db: QueryClient, key: string, limit: number): Promise<BudgetRow> {
  const [row] = await db.$queryRaw<BudgetRow[]>`
    INSERT INTO "AuthRateLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, statement_timestamp() + ${AUTH_LIMITS.windowSeconds} * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."expiresAt" <= statement_timestamp() THEN 1
        ELSE LEAST("AuthRateLimit"."attempts" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= statement_timestamp()
        THEN statement_timestamp() + ${AUTH_LIMITS.windowSeconds} * interval '1 second'
        ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "attempts", GREATEST(1, CEIL(EXTRACT(EPOCH FROM
      ("expiresAt" - statement_timestamp()))))::int AS "retryAfterSeconds"
  `;
  if (!row) throw new Error("AUTH_LIMIT_BUDGET_MISSING");
  return row;
}

function denied(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return jsonError(429, `Слишком много попыток входа. Попробуйте через ${minutes} мин.`,
    { retryAfterSeconds: seconds }, { headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } });
}

function unavailable() {
  // Never log DB exception text: SQL errors can contain identifiers or credentials.
  console.error("Authentication attempt limiter unavailable.");
  return jsonError(503, "Вход временно недоступен. Попробуйте через минуту.", undefined,
    { headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
}

/** Count all requests before parsing JSON. Limits rotation of logins and malformed bodies. */
export async function guardAuthIp(request: Request): Promise<Response | null> {
  const network = clientNetwork(request);
  if (!network) return unavailable();
  try {
    const row = await consumeAuthBudget(prisma, authBudgetKey("ip", network), AUTH_LIMITS.ip);
    // Bounded opportunistic GC. No user/business data; only expired counters.
    // The expiry index keeps this cheap; SKIP LOCKED avoids waiting on another cleanup.
    await prisma.$executeRaw`
      DELETE FROM "AuthRateLimit" WHERE "key" IN (
        SELECT "key" FROM "AuthRateLimit" WHERE "expiresAt" < statement_timestamp() - interval '1 day'
        ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED
      )
    `;
    return row.attempts > AUTH_LIMITS.ip ? denied(row.retryAfterSeconds) : null;
  } catch { return unavailable(); }
}

/** Account and IP+account budgets are shared across login and first-login. */
export async function guardAuthAccount(request: Request, login: string): Promise<Response | null> {
  const network = clientNetwork(request);
  if (!network) return unavailable();
  try {
    // Same lock order everywhere; no password hashing inside this short transaction.
    const rows = await prisma.$transaction(async tx => [
      await consumeAuthBudget(tx, authBudgetKey("account", login.trim()), AUTH_LIMITS.account),
      await consumeAuthBudget(tx, authBudgetKey("pair", network, login.trim()), AUTH_LIMITS.pair),
    ], { maxWait: 3000, timeout: 5000 });
    const waits = rows.filter((row, index) => row.attempts > [AUTH_LIMITS.account, AUTH_LIMITS.pair][index])
      .map(row => row.retryAfterSeconds);
    return waits.length ? denied(Math.max(...waits)) : null;
  } catch { return unavailable(); }
}
