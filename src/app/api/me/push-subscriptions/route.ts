import { z } from "zod";

import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { getBrowserPushPublicKey } from "@/server/notifications/browser-push";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const DeleteSchema = z.object({
  endpoint: z.string().url().optional(),
  deleteAll: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const publicKey = getBrowserPushPublicKey();

  return jsonOk({
    enabled: Boolean(publicKey),
    publicKey,
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const publicKey = getBrowserPushPublicKey();
  if (!publicKey) return jsonError(500, "Browser push is not configured");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid subscription", parsed.error.flatten());

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const now = new Date();
  await prisma.browserPushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      userId: auth.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      lastSeenAt: now,
    },
    update: {
      userId: auth.user.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      disabledAt: null,
      lastSeenAt: now,
    },
  });

  return jsonOk({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = { deleteAll: true };
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());
  if (!parsed.data.deleteAll && !parsed.data.endpoint) {
    return jsonError(400, "Provide endpoint or deleteAll=true");
  }

  const result = await prisma.browserPushSubscription.updateMany({
    where: {
      userId: auth.user.id,
      disabledAt: null,
      ...(parsed.data.deleteAll ? {} : { endpoint: parsed.data.endpoint }),
    },
    data: { disabledAt: new Date() },
  });

  return jsonOk({ ok: true, disabled: result.count });
}
