import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

const ACTIVE_ORDER_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const;

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const [users, projects, orders] = await Promise.all([
    prisma.user.findMany({
      where: { role: "WOWSTORG", isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    prisma.project.findMany({
      where: { archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, title: true, leadCustomerName: true, customer: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
      orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        eventName: true,
        readyByDate: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  return jsonOk({
    users,
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      customerName: project.customer?.name ?? project.leadCustomerName ?? "Заказчик не указан",
    })),
    orders: orders.map((order) => ({
      id: order.id,
      label: `${order.customer.name}${order.eventName ? ` · ${order.eventName}` : ""}`,
      readyByDate: order.readyByDate.toISOString().slice(0, 10),
    })),
  });
}
