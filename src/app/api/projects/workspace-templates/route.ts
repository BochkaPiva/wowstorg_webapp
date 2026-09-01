import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  PROJECT_WORKSPACE_TEMPLATE_SCHEMA_VERSION,
  ProjectWorkspaceTemplateWidgetsSchema,
  parseProjectWorkspaceTemplateWidgets,
  serializeProjectWorkspaceTemplateWidgets,
} from "@/lib/projects/project-workspace-template";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const CreateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  widgets: ProjectWorkspaceTemplateWidgetsSchema,
}).strict();

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const records = await prisma.projectWorkspaceTemplate.findMany({
    where: { ownerUserId: auth.user.id },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 20,
    select: { id: true, name: true, widgets: true, updatedAt: true },
  });

  return jsonOk({
    templates: records.flatMap((record) => {
      try {
        return [{ ...record, widgets: parseProjectWorkspaceTemplateWidgets(record.widgets) }];
      } catch {
        return [];
      }
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Проверьте название и состав шаблона", parsed.error.flatten());

  const widgets = serializeProjectWorkspaceTemplateWidgets(parsed.data.widgets);
  const count = await prisma.projectWorkspaceTemplate.count({ where: { ownerUserId: auth.user.id } });
  if (count >= 20) return jsonError(409, "Можно сохранить не больше 20 личных шаблонов");

  try {
    const template = await prisma.projectWorkspaceTemplate.create({
      data: {
        ownerUserId: auth.user.id,
        name: parsed.data.name,
        schemaVersion: PROJECT_WORKSPACE_TEMPLATE_SCHEMA_VERSION,
        widgets: widgets as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, name: true, widgets: true, updatedAt: true },
    });
    return jsonOk({ template: { ...template, widgets } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Шаблон с таким названием уже существует");
    }
    throw error;
  }
}
