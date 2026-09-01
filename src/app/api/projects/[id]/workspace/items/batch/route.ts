import { Prisma, ProjectActivityKind } from "@prisma/client";

import {
  PROJECT_FREE_BOARD_MAX_ITEMS,
  ProjectFreeBoardBatchSchema,
  type ProjectFreeBoardItemInput,
} from "@/lib/projects/project-free-board";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { serializeProjectFreeBoardItem } from "@/server/projects/free-board";

class InvalidWorkspaceLinkError extends Error {
  constructor(readonly itemIds: string[]) {
    super("INVALID_LINK");
  }
}

function linkedFields(item: ProjectFreeBoardItemInput) {
  return {
    linkedTaskId: item.type === "TASK" ? item.linkedTaskId : null,
    linkedOrderId: item.type === "ORDER" ? item.linkedOrderId : null,
    linkedFileId: item.type === "FILE" ? item.linkedFileId : null,
    linkedSectionId: item.type === "ESTIMATE_SECTION" ? item.linkedSectionId : null,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = ProjectFreeBoardBatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const previousReceipt = await tx.projectMutationReceipt.findUnique({
          where: {
            projectId_actorUserId_mutationId: {
              projectId: id,
              actorUserId: auth.user.id,
              mutationId: parsed.data.mutationId,
            },
          },
          select: { result: true },
        });
        if (previousReceipt) return { duplicate: true, result: previousReceipt.result };

        const project = await tx.project.findUnique({
          where: { id },
          select: {
            archivedAt: true,
            widgets: {
              where: { type: "FREE_BOARD" },
              take: 1,
              select: { id: true },
            },
          },
        });
        if (!project) throw new Error("NOT_FOUND");
        if (project.archivedAt) throw new Error("ARCHIVED");
        const widget = project.widgets[0];
        if (!widget) throw new Error("NO_BOARD");

        const operationIds = parsed.data.operations.map((operation) =>
          operation.op === "UPSERT" ? operation.item.id : operation.itemId,
        );
        const storedItems = await tx.projectWorkspaceItem.findMany({
          where: { id: { in: operationIds } },
        });
        if (storedItems.some((item) => item.projectId !== id || item.widgetId !== widget.id)) {
          throw new Error("FOREIGN_ITEM");
        }
        const storedById = new Map(storedItems.map((item) => [item.id, item]));

        const upsertItems = parsed.data.operations.flatMap((operation) =>
          operation.op === "UPSERT" ? [operation.item] : [],
        );
        const taskIds = upsertItems.flatMap((item) => (item.type === "TASK" ? [item.linkedTaskId] : []));
        const orderIds = upsertItems.flatMap((item) => (item.type === "ORDER" ? [item.linkedOrderId] : []));
        const fileIds = upsertItems.flatMap((item) => (item.type === "FILE" ? [item.linkedFileId] : []));
        const sectionIds = upsertItems.flatMap((item) =>
          item.type === "ESTIMATE_SECTION" ? [item.linkedSectionId] : [],
        );
        const [tasks, orders, files, sections] = await Promise.all([
          taskIds.length
            ? tx.workTask.findMany({ where: { id: { in: taskIds }, projectId: id }, select: { id: true } })
            : [],
          orderIds.length
            ? tx.order.findMany({ where: { id: { in: orderIds }, projectId: id }, select: { id: true } })
            : [],
          fileIds.length
            ? tx.projectFile.findMany({ where: { id: { in: fileIds }, projectId: id }, select: { id: true } })
            : [],
          sectionIds.length
            ? tx.projectEstimateSection.findMany({
                where: { id: { in: sectionIds }, version: { projectId: id } },
                select: { id: true },
              })
            : [],
        ]);
        const validTaskIds = new Set(tasks.map((item) => item.id));
        const validOrderIds = new Set(orders.map((item) => item.id));
        const validFileIds = new Set(files.map((item) => item.id));
        const validSectionIds = new Set(sections.map((item) => item.id));
        const invalidLinkedItemIds = upsertItems.flatMap((item) => {
          if (item.type === "TASK" && !validTaskIds.has(item.linkedTaskId)) return [item.id];
          if (item.type === "ORDER" && !validOrderIds.has(item.linkedOrderId)) return [item.id];
          if (item.type === "FILE" && !validFileIds.has(item.linkedFileId)) return [item.id];
          if (item.type === "ESTIMATE_SECTION" && !validSectionIds.has(item.linkedSectionId)) return [item.id];
          return [];
        });
        if (invalidLinkedItemIds.length) {
          throw new InvalidWorkspaceLinkError(Array.from(new Set(invalidLinkedItemIds)));
        }

        let activeCount = await tx.projectWorkspaceItem.count({
          where: { projectId: id, widgetId: widget.id, deletedAt: null },
        });
        const activeById = new Map(storedItems.map((item) => [item.id, item.deletedAt === null]));
        for (const operation of parsed.data.operations) {
          const itemId = operation.op === "UPSERT" ? operation.item.id : operation.itemId;
          const isActive = activeById.get(itemId) === true;
          if (operation.op === "UPSERT" && !isActive) {
            activeCount += 1;
            activeById.set(itemId, true);
          } else if (operation.op === "DELETE" && isActive) {
            activeCount -= 1;
            activeById.set(itemId, false);
          }
        }
        if (activeCount > PROJECT_FREE_BOARD_MAX_ITEMS) throw new Error("ITEM_LIMIT");

        const changedIds: string[] = [];
        const deletedIds: string[] = [];
        const deletedRevisions: Record<string, number> = {};
        for (const operation of parsed.data.operations) {
          if (operation.op === "DELETE") {
            const current = storedById.get(operation.itemId);
            if (!current || current.deletedAt) {
              deletedIds.push(operation.itemId);
              if (current) deletedRevisions[operation.itemId] = current.revision;
              continue;
            }
            if (
              operation.expectedRevision != null &&
              current.revision !== operation.expectedRevision
            ) {
              throw new Error(`ITEM_CONFLICT:${operation.itemId}`);
            }
            const update = await tx.projectWorkspaceItem.updateMany({
              where: { id: current.id, revision: current.revision, deletedAt: null },
              data: {
                deletedAt: new Date(),
                updatedById: auth.user.id,
                revision: { increment: 1 },
              },
            });
            if (update.count !== 1) throw new Error(`ITEM_CONFLICT:${operation.itemId}`);
            deletedIds.push(operation.itemId);
            deletedRevisions[operation.itemId] = current.revision + 1;
            continue;
          }

          const item = operation.item;
          const current = storedById.get(item.id);
          const data = {
            type: item.type,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            zIndex: item.zIndex,
            payload: item.payload as Prisma.InputJsonValue,
            ...linkedFields(item),
            deletedAt: null,
            updatedById: auth.user.id,
          };
          if (!current) {
            if (item.expectedRevision != null) throw new Error(`ITEM_CONFLICT:${item.id}`);
            await tx.projectWorkspaceItem.create({
              data: {
                id: item.id,
                projectId: id,
                widgetId: widget.id,
                ...data,
                createdById: auth.user.id,
              },
            });
          } else {
            if (item.expectedRevision == null || current.revision !== item.expectedRevision) {
              throw new Error(`ITEM_CONFLICT:${item.id}`);
            }
            const update = await tx.projectWorkspaceItem.updateMany({
              where: { id: item.id, revision: current.revision },
              data: { ...data, revision: { increment: 1 } },
            });
            if (update.count !== 1) throw new Error(`ITEM_CONFLICT:${item.id}`);
          }
          changedIds.push(item.id);
        }

        const changedStoredItems = await tx.projectWorkspaceItem.findMany({
          where: { id: { in: changedIds }, deletedAt: null },
        });
        const changedItems = changedStoredItems.flatMap((item) => {
          const serialized = serializeProjectFreeBoardItem(item);
          return serialized ? [serialized] : [];
        });
        const receiptResult = { changedItems, deletedIds, deletedRevisions };

        await tx.projectMutationReceipt.create({
          data: {
            projectId: id,
            actorUserId: auth.user.id,
            mutationId: parsed.data.mutationId,
            kind: "FREE_BOARD_BATCH",
            result: receiptResult as Prisma.InputJsonValue,
          },
        });
        await appendProjectActivityLog(tx, {
          projectId: id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_UPDATED,
          payload: {
            changes: {
              freeBoard: {
                upserted: changedItems.length,
                deleted: deletedIds.length,
              },
            },
          } as Prisma.InputJsonValue,
        });
        return { duplicate: false, result: receiptResult };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return jsonOk(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Проект не найден");
    if (error instanceof Error && error.message === "ARCHIVED") return jsonError(400, "Архивный проект только для просмотра");
    if (error instanceof Error && error.message === "NO_BOARD") {
      return jsonError(404, "Свободная доска не подключена к проекту");
    }
    if (error instanceof Error && error.message === "FOREIGN_ITEM") {
      return jsonError(400, "Элемент принадлежит другой доске");
    }
    if (error instanceof InvalidWorkspaceLinkError) {
      return jsonError(400, "Связанная сущность не принадлежит этому проекту", {
        itemIds: error.itemIds,
      });
    }
    if (error instanceof Error && error.message === "ITEM_LIMIT") {
      return jsonError(400, `На доске может быть не более ${PROJECT_FREE_BOARD_MAX_ITEMS} элементов`);
    }
    if (error instanceof Error && error.message.startsWith("ITEM_CONFLICT:")) {
      return jsonError(409, "Элемент уже изменился в другой вкладке", {
        itemId: error.message.slice("ITEM_CONFLICT:".length),
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.projectMutationReceipt.findUnique({
        where: {
          projectId_actorUserId_mutationId: {
            projectId: id,
            actorUserId: auth.user.id,
            mutationId: parsed.data.mutationId,
          },
        },
        select: { result: true },
      });
      if (duplicate) return jsonOk({ duplicate: true, result: duplicate.result });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Доска изменилась параллельно. Повторите сохранение.");
    }
    throw error;
  }
}
