import { type OrderStatus } from "@prisma/client";

import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { prisma } from "@/server/db";

const OMSK_TZ = "Asia/Omsk";
const PROJECT_SIGNAL_BLOCK_KEY = "dashboard-attention";

const ACTIVE_ORDER_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const satisfies readonly OrderStatus[];

const UPCOMING_TIMELINE_DAYS = 5;
const UPCOMING_TIMELINE_START_OFFSET = 1;
const UPCOMING_TIMELINE_MAX_OFFSET = UPCOMING_TIMELINE_START_OFFSET + UPCOMING_TIMELINE_DAYS - 1;
const TIMELINE_EVENTS_PER_DAY = 20;

type Urgency = "normal" | "soon" | "today" | "overdue" | "critical";
type SignalSeverity = "info" | "warning" | "critical";

export type DashboardEvent = {
  id: string;
  kind:
    | "task_due"
    | "task_overdue"
    | "order_ready"
    | "order_start"
    | "order_end"
    | "project_event"
    | "project_signal";
  title: string;
  subtitle?: string;
  date: string;
  urgency: Urgency;
  href: string;
  projectId?: string;
  orderId?: string;
  taskId?: string;
  isAssignedToMe?: boolean;
};

export type DashboardTask = {
  id: string;
  title: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate: string | null;
  columnTitle: string;
  projectTitle: string | null;
  orderTitle: string | null;
  checklistDone: number;
  checklistTotal: number;
  href: string;
};

export type DashboardSignal = {
  id: string;
  type:
    | "TASK_OVERDUE"
    | "TASK_DUE_SOON"
    | "PROJECT_EVENT_SOON_WITHOUT_ESTIMATE"
    | "PROJECT_BLOCKED"
    | "ORDER_ESTIMATE_REQUIRED";
  severity: SignalSeverity;
  title: string;
  reason: string;
  href: string;
  projectId?: string;
  orderId?: string;
  taskId?: string;
  entityKind: "task" | "project" | "order";
  canSnooze: boolean;
};

export type OperationsDashboardPayload = {
  today: DashboardEvent[];
  upcomingDays: Array<{ date: string; label: string; events: DashboardEvent[] }>;
  myTasks: {
    overdue: DashboardTask[];
    today: DashboardTask[];
    soon: DashboardTask[];
    noDueDate: DashboardTask[];
  };
  signals: DashboardSignal[];
  summary: {
    todayCount: number;
    overdueCount: number;
    signalCount: number;
    nearestOrderTitle: string | null;
  };
};

function getOmskTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, days: number): string {
  const dt = parseDateOnlyToUtcMidnight(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = parseDateOnlyToUtcMidnight(fromYmd).getTime();
  const to = parseDateOnlyToUtcMidnight(toYmd).getTime();
  return Math.round((to - from) / 86_400_000);
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dayLabel(offset: number, ymd: string): string {
  if (offset === 0) return "Сегодня";
  if (offset === 1) return "Завтра";
  if (offset === 2) return "Послезавтра";
  const [, month, day] = ymd.split("-");
  return `${day}.${month}`;
}

function taskHref(task: { id: string; projectId: string | null }): string {
  return task.projectId ? `/projects/${task.projectId}` : "/tasks";
}

function signalRank(signal: DashboardSignal): number {
  if (signal.severity === "critical") return 0;
  if (signal.severity === "warning") return 1;
  return 2;
}

function eventRank(event: DashboardEvent): number {
  const urgencyRank: Record<Urgency, number> = {
    critical: 0,
    overdue: 1,
    today: 2,
    soon: 3,
    normal: 4,
  };
  return urgencyRank[event.urgency] ?? 9;
}

function taskToDashboardTask(task: {
  id: string;
  title: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate: Date | null;
  column: { title: string };
  project: { id: string; title: string } | null;
  projectId: string | null;
  order: { id: string; customer: { name: string } } | null;
  checklistItems: Array<{ isDone: boolean }>;
}): DashboardTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: dateOnly(task.dueDate),
    columnTitle: task.column.title,
    projectTitle: task.project?.title ?? null,
    orderTitle: task.order?.customer.name ?? null,
    checklistDone: task.checklistItems.filter((item) => item.isDone).length,
    checklistTotal: task.checklistItems.length,
    href: taskHref(task),
  };
}

export async function buildOperationsDashboard(userId: string): Promise<OperationsDashboardPayload> {
  const today = getOmskTodayYmd();
  const todayDate = parseDateOnlyToUtcMidnight(today);
  const end7 = addDaysYmd(today, 7);
  const end14 = addDaysYmd(today, 14);
  const now = new Date();

  const [tasks, orders, projects] = await Promise.all([
    prisma.workTask.findMany({
      where: {
        completedAt: null,
        archivedAt: null,
        OR: [
          { assigneeUserId: userId },
          { dueDate: { gte: todayDate, lte: parseDateOnlyToUtcMidnight(end14) } },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
      take: 80,
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        assigneeUserId: true,
        projectId: true,
        orderId: true,
        column: { select: { title: true, isDone: true } },
        project: { select: { id: true, title: true, archivedAt: true, status: true } },
        order: { select: { id: true, customer: { select: { name: true } } } },
        checklistItems: { select: { isDone: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        status: { in: [...ACTIVE_ORDER_STATUSES] },
        OR: [
          { readyByDate: { gte: todayDate, lte: parseDateOnlyToUtcMidnight(end7) } },
          { startDate: { gte: todayDate, lte: parseDateOnlyToUtcMidnight(end7) } },
          { endDate: { gte: todayDate, lte: parseDateOnlyToUtcMidnight(end7) } },
        ],
      },
      orderBy: [{ readyByDate: "asc" }, { updatedAt: "asc" }],
      take: 60,
      select: {
        id: true,
        status: true,
        customer: { select: { name: true } },
        readyByDate: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    }),
    prisma.project.findMany({
      where: {
        archivedAt: null,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        OR: [
          { eventStartDate: { gte: todayDate, lte: parseDateOnlyToUtcMidnight(end14) } },
          { openBlockers: { not: null } },
        ],
      },
      orderBy: [{ eventStartDate: "asc" }, { updatedAt: "asc" }],
      take: 80,
      select: {
        id: true,
        title: true,
        status: true,
        eventStartDate: true,
        eventEndDate: true,
        eventDateConfirmed: true,
        openBlockers: true,
        updatedAt: true,
        estimateVersions: { where: { isPrimary: true }, select: { id: true }, take: 1 },
        tasks: { where: { completedAt: null, archivedAt: null }, select: { id: true }, take: 1 },
        notificationCooldowns: {
          where: { blockKey: PROJECT_SIGNAL_BLOCK_KEY, muteUntil: { gt: now } },
          select: { muteUntil: true },
          take: 1,
        },
      },
    }),
  ]);

  const events: DashboardEvent[] = [];
  const signals: DashboardSignal[] = [];

  for (const task of tasks) {
    const due = dateOnly(task.dueDate);
    const isMine = task.assigneeUserId === userId;
    const projectActive =
      task.project == null ||
      (task.project.archivedAt == null && task.project.status !== "COMPLETED" && task.project.status !== "CANCELLED");
    if (!due || !projectActive) continue;

    const delta = daysBetween(today, due);
    const href = taskHref(task);
    const subtitle = task.project?.title ?? task.order?.customer.name ?? task.column.title;

    if (delta < 0 && (isMine || task.projectId)) {
      const severity = delta <= -2 ? "critical" : "warning";
      signals.push({
        id: `task-overdue:${task.id}`,
        type: "TASK_OVERDUE",
        severity,
        title: task.title,
        reason: delta <= -2 ? `Просрочено ${Math.abs(delta)} дн.` : "Просрочено со вчера",
        href,
        projectId: task.projectId ?? undefined,
        orderId: task.orderId ?? undefined,
        taskId: task.id,
        entityKind: "task",
        canSnooze: false,
      });
      events.push({
        id: `task-overdue:${task.id}`,
        kind: "task_overdue",
        title: task.title,
        subtitle,
        date: today,
        urgency: delta <= -2 ? "critical" : "overdue",
        href,
        projectId: task.projectId ?? undefined,
        orderId: task.orderId ?? undefined,
        taskId: task.id,
        isAssignedToMe: isMine,
      });
      continue;
    }

    if (delta >= 0 && delta <= UPCOMING_TIMELINE_MAX_OFFSET) {
      events.push({
        id: `task-due:${task.id}`,
        kind: "task_due",
        title: task.title,
        subtitle,
        date: due,
        urgency: delta === 0 ? "today" : delta <= 1 ? "soon" : "normal",
        href,
        projectId: task.projectId ?? undefined,
        orderId: task.orderId ?? undefined,
        taskId: task.id,
        isAssignedToMe: isMine,
      });
    }

    if (isMine && delta >= 0 && delta <= 1) {
      signals.push({
        id: `task-due-soon:${task.id}`,
        type: "TASK_DUE_SOON",
        severity: "warning",
        title: task.title,
        reason: delta === 0 ? "Дедлайн сегодня" : "Дедлайн завтра",
        href,
        projectId: task.projectId ?? undefined,
        orderId: task.orderId ?? undefined,
        taskId: task.id,
        entityKind: "task",
        canSnooze: false,
      });
    }
  }

  for (const order of orders) {
    const orderTitle = order.customer.name;
    const points: Array<{ kind: DashboardEvent["kind"]; date: string; label: string }> = [
      { kind: "order_ready", date: dateOnly(order.readyByDate)!, label: "готовность" },
      { kind: "order_start", date: dateOnly(order.startDate)!, label: "выдача" },
      { kind: "order_end", date: dateOnly(order.endDate)!, label: "возврат" },
    ];

    for (const point of points) {
      const delta = daysBetween(today, point.date);
      if (delta < 0 || delta > UPCOMING_TIMELINE_MAX_OFFSET) continue;
      events.push({
        id: `${point.kind}:${order.id}:${point.date}`,
        kind: point.kind,
        title: orderTitle,
        subtitle: point.label,
        date: point.date,
        urgency: delta === 0 ? "today" : delta <= 1 ? "soon" : "normal",
        href: `/orders/${order.id}?from=dashboard`,
        orderId: order.id,
      });
    }

    if (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") {
      const waitingDays = Math.max(0, Math.floor((now.getTime() - order.updatedAt.getTime()) / 86_400_000));
      const changesRequested = order.status === "CHANGES_REQUESTED";
      signals.push({
        id: `order-estimate-required:${order.id}`,
        type: "ORDER_ESTIMATE_REQUIRED",
        severity: waitingDays >= 2 ? "critical" : "warning",
        title: orderTitle,
        reason: changesRequested
          ? "Клиент запросил изменения — обновите расчёт, цены допуслуг и отправьте смету."
          : "Greenwich ждёт расчёт — проверьте цены допуслуг и отправьте смету.",
        href: `/orders/${order.id}?from=dashboard`,
        orderId: order.id,
        entityKind: "order",
        canSnooze: false,
      });
    }

  }

  for (const project of projects) {
    const eventDate = dateOnly(project.eventStartDate);
    const hasMute = project.notificationCooldowns.length > 0;
    const blockers = project.openBlockers?.trim();

    if (eventDate) {
      const delta = daysBetween(today, eventDate);
      if (delta >= 0 && delta <= UPCOMING_TIMELINE_MAX_OFFSET) {
        events.push({
          id: `project-event:${project.id}`,
          kind: "project_event",
          title: project.title,
          subtitle: "мероприятие",
          date: eventDate,
          urgency: delta === 0 ? "today" : delta <= 1 ? "soon" : "normal",
          href: `/projects/${project.id}`,
          projectId: project.id,
        });
      }

      if (!hasMute && project.eventDateConfirmed && delta >= 0 && delta <= 14 && project.estimateVersions.length === 0) {
        signals.push({
          id: `project-no-estimate:${project.id}`,
          type: "PROJECT_EVENT_SOON_WITHOUT_ESTIMATE",
          severity: delta <= 3 ? "critical" : "warning",
          title: project.title,
          reason: delta <= 3 ? "Скоро мероприятие, нет основной сметы" : "Нет основной сметы",
          href: `/projects/${project.id}`,
          projectId: project.id,
          entityKind: "project",
          canSnooze: delta > 0,
        });
      }
    }

    if (!hasMute && blockers) {
      const delta = eventDate ? daysBetween(today, eventDate) : 99;
      signals.push({
        id: `project-blocked:${project.id}`,
        type: "PROJECT_BLOCKED",
        severity: delta >= 0 && delta <= 3 ? "critical" : "warning",
        title: project.title,
        reason: blockers.length > 90 ? `${blockers.slice(0, 90)}...` : blockers,
        href: `/projects/${project.id}`,
        projectId: project.id,
        entityKind: "project",
        canSnooze: !(delta >= 0 && delta <= 0),
      });
    }
  }

  const dashboardTasks = tasks
    .filter((task) => task.assigneeUserId === userId)
    .map(taskToDashboardTask);
  const myTasks = {
    overdue: dashboardTasks.filter((task) => task.dueDate != null && daysBetween(today, task.dueDate) < 0).slice(0, 8),
    today: dashboardTasks.filter((task) => task.dueDate != null && daysBetween(today, task.dueDate) === 0).slice(0, 8),
    soon: dashboardTasks
      .filter((task) => task.dueDate != null && daysBetween(today, task.dueDate) > 0 && daysBetween(today, task.dueDate) <= 7)
      .slice(0, 8),
    noDueDate: dashboardTasks.filter((task) => task.dueDate == null).slice(0, 8),
  };

  const upcomingDays = Array.from({ length: UPCOMING_TIMELINE_DAYS }, (_, index) => {
    const offset = UPCOMING_TIMELINE_START_OFFSET + index;
    const date = addDaysYmd(today, offset);
    return {
      date,
      label: dayLabel(offset, date),
      events: events
        .filter((event) => event.date === date)
        .sort((a, b) => eventRank(a) - eventRank(b))
        .slice(0, TIMELINE_EVENTS_PER_DAY),
    };
  });

  const todayEvents = events
    .filter((event) => event.date === today || event.urgency === "overdue" || event.urgency === "critical")
    .sort((a, b) => eventRank(a) - eventRank(b))
    .slice(0, TIMELINE_EVENTS_PER_DAY);

  const sortedSignals = signals
    .sort((a, b) => signalRank(a) - signalRank(b) || a.title.localeCompare(b.title, "ru"))
    .slice(0, 8);

  return {
    today: todayEvents,
    upcomingDays,
    myTasks,
    signals: sortedSignals,
    summary: {
      todayCount: todayEvents.length,
      overdueCount: signals.filter((signal) => signal.type === "TASK_OVERDUE").length,
      signalCount: sortedSignals.length,
      nearestOrderTitle: orders[0]?.customer.name ?? null,
    },
  };
}
