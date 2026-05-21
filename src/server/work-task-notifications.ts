import { prisma } from "@/server/db";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";

function getTaskTopicId(): string | undefined {
  return (
    process.env.TELEGRAM_TASKS_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_PROJECTS_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_PROJECT_TOPIC_ID?.trim() ||
    getWarehouseTopicId()
  );
}

function taskTopicOptions() {
  const topicId = getTaskTopicId();
  return topicId ? { messageThreadId: topicId } : undefined;
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/u, "") || "https://wowstorg.example.com";
  return `${base}${path}`;
}

function taskLink(label = "Открыть доску"): string {
  return `<a href="${appUrl("/tasks")}">${escapeTelegramHtml(label)}</a>`;
}

function formatDueDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

async function sendTaskTopicMessage(text: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  const chatId = getWarehouseChatId();
  if (!chatId) return;
  const ok = await sendTelegramMessage(chatId, text, taskTopicOptions());
  if (!ok) console.warn("[work-task-notifications] Telegram did not accept task notification");
}

async function taskForNotification(taskId: string) {
  return prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      dueDate: true,
      priority: true,
      assignee: { select: { id: true, displayName: true } },
      column: { select: { title: true } },
      project: { select: { title: true } },
      order: { select: { eventName: true, customer: { select: { name: true } } } },
    },
  });
}

async function actorName(actorUserId: string): Promise<string> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { displayName: true },
  });
  return actor?.displayName ?? "Сотрудник";
}

function taskContextLines(task: NonNullable<Awaited<ReturnType<typeof taskForNotification>>>): string[] {
  const lines = [`Задача: <b>${escapeTelegramHtml(task.title)}</b>`];
  if (task.assignee) lines.push(`Исполнитель: <b>${escapeTelegramHtml(task.assignee.displayName)}</b>`);
  if (task.column) lines.push(`Статус: ${escapeTelegramHtml(task.column.title)}`);
  const due = formatDueDate(task.dueDate);
  if (due) lines.push(`Дедлайн: <b>${escapeTelegramHtml(due)}</b>`);
  if (task.project) lines.push(`Проект: ${escapeTelegramHtml(task.project.title)}`);
  if (task.order) {
    const orderLabel = task.order.eventName || task.order.customer.name;
    lines.push(`Заявка: ${escapeTelegramHtml(orderLabel)}`);
  }
  return lines;
}

export async function notifyWorkTaskAssigned(args: {
  taskId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const task = await taskForNotification(args.taskId);
    if (!task?.assignee || task.assignee.id === args.actorUserId) return;

    const actor = await actorName(args.actorUserId);
    const text = [
      "<b>Новая назначенная задача</b>",
      "",
      `${escapeTelegramHtml(actor)} назначил задачу для ${escapeTelegramHtml(task.assignee.displayName)}.`,
      "",
      ...taskContextLines(task),
      "",
      taskLink(),
    ].join("\n");
    await sendTaskTopicMessage(text);
  } catch (e) {
    console.warn("[work-task-notifications] notifyWorkTaskAssigned failed", e);
  }
}

export async function notifyWorkTaskStatusChanged(args: {
  taskId: string;
  actorUserId: string;
  fromColumnTitle: string;
  toColumnTitle: string;
}): Promise<void> {
  if (args.fromColumnTitle === args.toColumnTitle) return;
  try {
    const task = await taskForNotification(args.taskId);
    if (!task) return;

    const actor = await actorName(args.actorUserId);
    const text = [
      "<b>Статус задачи изменен</b>",
      "",
      `${escapeTelegramHtml(actor)} перенес задачу: ${escapeTelegramHtml(args.fromColumnTitle)} -> ${escapeTelegramHtml(args.toColumnTitle)}.`,
      "",
      ...taskContextLines(task),
      "",
      taskLink(),
    ].join("\n");
    await sendTaskTopicMessage(text);
  } catch (e) {
    console.warn("[work-task-notifications] notifyWorkTaskStatusChanged failed", e);
  }
}

export async function sendWorkTaskDeadlineReminder(taskId: string): Promise<boolean> {
  const task = await taskForNotification(taskId);
  if (!task) return false;

  const text = [
    "<b>Напоминание по дедлайну задачи</b>",
    "",
    "До дедлайна остались сутки.",
    "",
    ...taskContextLines(task),
    "",
    taskLink(),
  ].join("\n");

  if (!isTelegramConfigured()) return false;
  const chatId = getWarehouseChatId();
  if (!chatId) return false;
  return sendTelegramMessage(chatId, text, taskTopicOptions());
}

