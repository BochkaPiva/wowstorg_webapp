import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { normalizeCustomerName } from "@/server/customers/identity";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const MergeSchema = z.object({
  targetId: z.string().trim().min(1),
  sourceIds: z.array(z.string().trim().min(1)).min(1).max(50),
}).strict();

const candidateSelect = {
  id: true,
  name: true,
  isActive: true,
  notes: true,
  logoKey: true,
  logoMimeType: true,
  logoUpdatedAt: true,
  createdAt: true,
  _count: { select: { orders: true, projects: true, standaloneEstimates: true } },
} satisfies Prisma.CustomerSelect;

function customerScore(customer: {
  isActive: boolean;
  logoKey: string | null;
  _count: { orders: number; projects: number; standaloneEstimates: number };
}) {
  return (
    customer._count.orders * 20
    + customer._count.projects * 30
    + customer._count.standaloneEstimates * 10
    + (customer.isActive ? 5 : 0)
    + (customer.logoKey ? 2 : 0)
  );
}

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const [customers, history] = await Promise.all([
    prisma.customer.findMany({
      where: { mergedIntoId: null },
      orderBy: [{ name: "asc" }],
      select: candidateSelect,
    }),
    prisma.customerMerge.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        sourceName: true,
        targetName: true,
        movedOrders: true,
        movedProjects: true,
        movedStandaloneEstimates: true,
        createdAt: true,
        actor: { select: { displayName: true } },
      },
    }),
  ]);

  const grouped = new Map<string, typeof customers>();
  for (const customer of customers) {
    const key = normalizeCustomerName(customer.name);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(customer);
    grouped.set(key, group);
  }

  const groups = [...grouped.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([identityKey, entries]) => {
      const ranked = [...entries].sort((left, right) => {
        const scoreDiff = customerScore(right) - customerScore(left);
        return scoreDiff || left.createdAt.getTime() - right.createdAt.getTime();
      });
      return {
        identityKey,
        suggestedTargetId: ranked[0].id,
        customers: entries.map((customer) => ({
          ...customer,
          createdAt: customer.createdAt.toISOString(),
          logoUrl: customer.logoKey
            ? `/api/customers/${customer.id}/logo?v=${customer.logoUpdatedAt?.getTime() ?? 0}`
            : null,
          logoKey: undefined,
          logoMimeType: undefined,
          logoUpdatedAt: undefined,
        })),
      };
    })
    .sort((left, right) => right.customers.length - left.customers.length);

  return jsonOk({
    summary: {
      groups: groups.length,
      duplicateCards: groups.reduce((sum, group) => sum + group.customers.length - 1, 0),
    },
    groups,
    history: history.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const sourceIds = [...new Set(parsed.data.sourceIds)].filter((id) => id !== parsed.data.targetId);
  if (!sourceIds.length) return jsonError(400, "Выберите хотя бы одну карточку-дубль");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customers = await tx.customer.findMany({
        where: { id: { in: [parsed.data.targetId, ...sourceIds] } },
        select: {
          ...candidateSelect,
          normalizedName: true,
          mergedIntoId: true,
          aliases: { select: { id: true, name: true, normalizedName: true } },
        },
      });
      const target = customers.find((customer) => customer.id === parsed.data.targetId);
      const sources = sourceIds.map((id) => customers.find((customer) => customer.id === id));
      if (!target || sources.some((customer) => !customer)) throw new Error("CUSTOMER_NOT_FOUND");
      if (target.mergedIntoId || sources.some((customer) => customer?.mergedIntoId)) {
        throw new Error("CUSTOMER_ALREADY_MERGED");
      }

      const targetKey = normalizeCustomerName(target.name);
      if (!targetKey || sources.some((customer) => normalizeCustomerName(customer!.name) !== targetKey)) {
        throw new Error("CUSTOMER_GROUP_CHANGED");
      }

      const sourceRows = sources.filter((customer): customer is NonNullable<typeof customer> => Boolean(customer));
      await tx.customer.updateMany({
        where: { id: { in: sourceIds } },
        data: { normalizedName: null },
      });
      await tx.customer.update({ where: { id: target.id }, data: { normalizedName: targetKey } });

      const movedBySource = sourceRows.map((source) => ({
        source,
        orders: source._count.orders,
        projects: source._count.projects,
        standaloneEstimates: source._count.standaloneEstimates,
      }));

      await tx.order.updateMany({ where: { customerId: { in: sourceIds } }, data: { customerId: target.id } });
      await tx.project.updateMany({ where: { customerId: { in: sourceIds } }, data: { customerId: target.id } });
      await tx.standaloneEstimate.updateMany({ where: { customerId: { in: sourceIds } }, data: { customerId: target.id } });
      const aliasesToCreate = sourceRows
        .flatMap((source) => [
          { name: source.name, normalizedName: normalizeCustomerName(source.name) },
          ...source.aliases.map((alias) => ({ name: alias.name, normalizedName: alias.normalizedName })),
        ])
        .filter((alias, index, aliases) =>
          alias.normalizedName
          && alias.name !== target.name
          && aliases.findIndex((candidate) => candidate.name === alias.name) === index,
        );
      await tx.customerAlias.deleteMany({ where: { customerId: { in: sourceIds } } });
      if (aliasesToCreate.length) {
        await tx.customerAlias.createMany({
          data: aliasesToCreate.map((alias) => ({ ...alias, customerId: target.id })),
          skipDuplicates: true,
        });
      }

      const sourceWithLogo = !target.logoKey ? sourceRows.find((source) => source.logoKey) : null;
      if (sourceWithLogo?.logoKey) {
        await tx.customer.update({
          where: { id: sourceWithLogo.id },
          data: { logoKey: null, logoMimeType: null, logoUpdatedAt: null },
        });
      }
      const notes = [target.notes, ...sourceRows.map((source) => source.notes)]
        .map((note) => note?.trim())
        .filter((note, index, values): note is string => Boolean(note) && values.indexOf(note) === index);

      await tx.customer.update({
        where: { id: target.id },
        data: {
          isActive: true,
          notes: notes.length ? notes.join("\n\n") : null,
          ...(sourceWithLogo?.logoKey
            ? {
                logoKey: sourceWithLogo.logoKey,
                logoMimeType: sourceWithLogo.logoMimeType,
                logoUpdatedAt: sourceWithLogo.logoUpdatedAt,
              }
            : {}),
        },
      });
      await tx.customer.updateMany({
        where: { id: { in: sourceIds } },
        data: { isActive: false, mergedIntoId: target.id },
      });

      for (const moved of movedBySource) {
        await tx.customerMerge.create({
          data: {
            sourceCustomerId: moved.source.id,
            targetCustomerId: target.id,
            actorUserId: auth.user.id,
            sourceName: moved.source.name,
            targetName: target.name,
            movedOrders: moved.orders,
            movedProjects: moved.projects,
            movedStandaloneEstimates: moved.standaloneEstimates,
            snapshot: {
              sourceActive: moved.source.isActive,
              sourceNotes: moved.source.notes,
              sourceAliases: moved.source.aliases.map((alias) => alias.name),
            },
          },
        });
      }

      return {
        targetId: target.id,
        targetName: target.name,
        mergedCustomers: sourceRows.length,
        movedOrders: movedBySource.reduce((sum, item) => sum + item.orders, 0),
        movedProjects: movedBySource.reduce((sum, item) => sum + item.projects, 0),
        movedStandaloneEstimates: movedBySource.reduce((sum, item) => sum + item.standaloneEstimates, 0),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return jsonError(404, "Одна из карточек заказчика не найдена");
    if (error instanceof Error && error.message === "CUSTOMER_ALREADY_MERGED") return jsonError(409, "Одна из карточек уже была объединена. Обновите список.");
    if (error instanceof Error && error.message === "CUSTOMER_GROUP_CHANGED") return jsonError(409, "Названия больше не относятся к одной группе. Обновите список.");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return jsonError(409, "Такой алиас уже принадлежит другому заказчику");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return jsonError(409, "Данные изменились параллельно. Обновите список и повторите объединение.");
    throw error;
  }
}
