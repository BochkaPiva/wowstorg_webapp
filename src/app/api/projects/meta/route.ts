import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { PROJECT_WIDGET_REGISTRY } from "@/lib/projects/project-widget-registry";
import { parseProjectWorkspaceTemplateWidgets } from "@/lib/projects/project-workspace-template";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const [users, storedTemplates] = await Promise.all([
    prisma.user.findMany({
      where: { role: "WOWSTORG", isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    prisma.projectWorkspaceTemplate.findMany({
      where: { ownerUserId: auth.user.id },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 20,
      select: { id: true, name: true, widgets: true, updatedAt: true },
    }),
  ]);

  const templates = storedTemplates.flatMap((template) => {
    try {
      return [{ ...template, widgets: parseProjectWorkspaceTemplateWidgets(template.widgets) }];
    } catch {
      return [];
    }
  });

  return jsonOk({
    users,
    widgets: PROJECT_WIDGET_REGISTRY,
    templates,
    currentUserId: auth.user.id,
  });
}
