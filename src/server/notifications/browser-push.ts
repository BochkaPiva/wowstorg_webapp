import type { InAppNotificationType } from "@prisma/client";
import webpush from "web-push";

import { prisma } from "@/server/db";

type PushPayload = {
  notificationId?: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  href?: string | null;
};

type WebPushErrorLike = {
  statusCode?: number;
  body?: unknown;
};

let configured = false;

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function getBrowserPushPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

function ensureConfigured(): boolean {
  const config = getVapidConfig();
  if (!config) return false;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return true;
}

function hrefFromPayload(payloadJson: unknown): string | null {
  if (!payloadJson || typeof payloadJson !== "object") return null;
  const payload = payloadJson as { href?: unknown; orderId?: unknown; projectId?: unknown };
  if (typeof payload.href === "string" && payload.href.length > 0) return payload.href;
  if (typeof payload.orderId === "string" && payload.orderId.length > 0) {
    return `/orders/${payload.orderId}?from=push`;
  }
  if (typeof payload.projectId === "string" && payload.projectId.length > 0) {
    return `/projects/${payload.projectId}?from=push`;
  }
  return null;
}

export async function sendBrowserPushToUser(args: {
  userId: string;
  notificationId?: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  payloadJson?: unknown;
}): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await prisma.browserPushSubscription.findMany({
    where: { userId: args.userId, disabledAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) return;

  const payload: PushPayload = {
    notificationId: args.notificationId,
    type: args.type,
    title: args.title,
    body: args.body,
    href: hrefFromPayload(args.payloadJson),
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
        );
      } catch (error) {
        const pushError = error as WebPushErrorLike;
        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          await prisma.browserPushSubscription
            .update({
              where: { id: subscription.id },
              data: { disabledAt: new Date() },
            })
            .catch(() => null);
          return;
        }
        console.error("[browser-push] send failed", pushError.statusCode, pushError.body ?? error);
      }
    }),
  );
}
