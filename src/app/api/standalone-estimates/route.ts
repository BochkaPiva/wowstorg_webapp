import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  try {
    const estimate = await prisma.$transaction(async (tx) => {
      const customerId = parsed.data.customerId?.trim() || null;
      if (customerId) {
        const exists = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!exists) throw new Error("CUSTOMER_NOT_FOUND");
      }

      return tx.standaloneEstimate.create({
        data: {
          title: parsed.data.title.trim(),
          customerId,
          leadCustomerName: customerId ? null : parsed.data.customerName?.trim() || null,
          ownerUserId: auth.user.id,
          estimateVersions: {
            create: {
              versionNumber: 1,
              title: "Смета",
              isPrimary: true,
              includeInProjectTotals: false,
              createdById: auth.user.id,
            },
          },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
      });
    });

    return jsonOk({ estimate });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    throw error;
  }
}
