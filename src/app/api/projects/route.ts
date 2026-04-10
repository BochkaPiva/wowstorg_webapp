import { Prisma, ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { ensureDefaultProjectFolders } from "@/server/projects/project-files";

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    ball: z.nativeEnum(ProjectBall).optional(),
  })
  .strict();

const SORT_VALUES = ["updated_desc", "updated_asc", "created_desc", "created_asc", "title_asc"] as const;

const ListQuerySchema = z.object({
  archive: z.enum(["0", "1"]).optional().default("0"),
  sort: z.enum(SORT_VALUES).optional().default("updated_desc"),
  status: z.union([z.literal("all"), z.nativeEnum(ProjectStatus)]).optional().default("all"),
  ball: z.union([z.literal("all"), z.nativeEnum(ProjectBall)]).optional().default("all"),
  q: z.string().trim().max(120).optional(),
});

function orderByFromSort(sort: (typeof SORT_VALUES)[number]): Prisma.ProjectOrderByWithRelationInput[] {
  switch (sort) {
    case "updated_asc":
      return [{ updatedAt: "asc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "title_asc":
      return [{ title: "asc" }];
    case "updated_desc":
    default:
      return [{ updatedAt: "desc" }];
  }
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = ListQuerySchema.safeParse({
    archive: url.searchParams.get("archive") === "1" ? "1" : "0",
    sort: url.searchParams.get("sort") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    ball: url.searchParams.get("ball") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Некорректные параметры запроса", parsed.error.flatten());
  }

  const { archive, sort, status: statusFilter, ball: ballFilter, q } = parsed.data;
  const archived = archive === "1";

  const searchWhere: Prisma.ProjectWhereInput | undefined =
    q && q.length > 0
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { id: { contains: q, mode: "insensitive" } },
            { owner: { displayName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined;

  const statusWhere: Prisma.ProjectWhereInput | undefined =
    statusFilter === "all" ? undefined : { status: statusFilter };

  const ballWhere: Prisma.ProjectWhereInput | undefined =
    ballFilter === "all" ? undefined : { ball: ballFilter };

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        archived ? { archivedAt: { not: null } } : { archivedAt: null },
        ...(statusWhere ? [statusWhere] : []),
        ...(ballWhere ? [ballWhere] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    },
    orderBy: orderByFromSort(sort),
    take: 500,
    select: {
      id: true,
      title: true,
      status: true,
      ball: true,
      archivedAt: true,
      archiveNote: true,
      updatedAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, displayName: true } },
      _count: { select: { orders: true } },
    },
  });

  return jsonOk({ projects });
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

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  if (!parsed.data.customerId && !parsed.data.customerName) {
    return jsonError(400, "Укажите заказчика");
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      let customerId = parsed.data.customerId?.trim() || "";

      if (!customerId) {
        const name = parsed.data.customerName!.trim();
        const existing = await tx.customer.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const created = await tx.customer.create({
            data: { name },
            select: { id: true },
          });
          customerId = created.id;
        }
      } else {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }
      }

      const p = await tx.project.create({
        data: {
          title: parsed.data.title,
          customerId,
          ownerUserId: auth.user.id,
          status: parsed.data.status ?? ProjectStatus.LEAD,
          ball: parsed.data.ball ?? ProjectBall.CLIENT,
        },
        select: {
          id: true,
          title: true,
          status: true,
          ball: true,
          archivedAt: true,
          customerId: true,
          ownerUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await ensureDefaultProjectFolders(tx, p.id);
      await appendProjectActivityLog(tx, {
        projectId: p.id,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_CREATED,
        payload: { title: p.title },
      });
      return p;
    });

    return jsonOk({ project });
  } catch (e) {
    if (e instanceof Error && e.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    throw e;
  }
}
