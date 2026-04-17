import { prisma } from "@/server/db";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";
import {
  CONTACT_PATCH_FIELD_LABEL,
  formatActivityValue,
  PROJECT_CONTACT_CATEGORY_LABEL,
  PROJECT_PATCH_FIELD_LABEL,
} from "@/lib/project-activity-ui";

const PROJECT_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

function getProjectTopicId(): string | undefined {
  return (
    process.env.TELEGRAM_PROJECTS_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_PROJECT_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_NOTIFICATION_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_WAREHOUSE_TOPIC_ID?.trim() ||
    undefined
  );
}

function projectUrl(projectId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://wowstorg.example.com";
  return `${base}/projects/${projectId}`;
}

async function getProjectContext(projectId: string, actorUserId?: string) {
  const [project, actor] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true },
    }),
    actorUserId
      ? prisma.user.findUnique({
          where: { id: actorUserId },
          select: { displayName: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    projectTitle: project?.title ?? "Проект",
    actorName: actor?.displayName ?? "Система",
  };
}

async function shouldSuppressNoisy(projectId: string, blockKey: string) {
  const now = new Date();
  const current = await prisma.projectNotificationCooldown.findUnique({
    where: {
      projectId_blockKey: {
        projectId,
        blockKey,
      },
    },
    select: { muteUntil: true },
  });
  if (current && current.muteUntil > now) {
    return true;
  }
  await prisma.projectNotificationCooldown.upsert({
    where: {
      projectId_blockKey: {
        projectId,
        blockKey,
      },
    },
    create: {
      projectId,
      blockKey,
      muteUntil: new Date(now.getTime() + PROJECT_NOTIFICATION_COOLDOWN_MS),
    },
    update: {
      muteUntil: new Date(now.getTime() + PROJECT_NOTIFICATION_COOLDOWN_MS),
    },
  });
  return false;
}

async function sendProjectNotification(args: {
  projectId: string;
  title: string;
  actorUserId?: string;
  lines: string[];
  cooldownBlock?: "estimate" | "schedule" | "files";
}) {
  const chatId = getWarehouseChatId();
  if (!chatId || !isTelegramConfigured()) return false;
  if (args.cooldownBlock) {
    const suppressed = await shouldSuppressNoisy(args.projectId, args.cooldownBlock);
    if (suppressed) return false;
  }

  const { projectTitle, actorName } = await getProjectContext(args.projectId, args.actorUserId);
  const topicId = getProjectTopicId();
  const text = [
    `📁 <b>${escapeTelegramHtml(args.title)}</b>`,
    `👤 ${escapeTelegramHtml(actorName)}`,
    `🎯 <a href="${projectUrl(args.projectId)}">${escapeTelegramHtml(projectTitle)}</a>`,
    ...args.lines.map((line) => escapeTelegramHtml(line)),
  ].join("\n\n");
  return sendTelegramMessage(chatId, text, {
    messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
  });
}

export async function notifyProjectFieldChanges(args: {
  projectId: string;
  actorUserId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}) {
  const lines = Object.entries(args.changes).map(([field, value]) => {
    const label = PROJECT_PATCH_FIELD_LABEL[field] ?? field;
    return `${label}: ${formatActivityValue(field, value.from)} -> ${formatActivityValue(field, value.to)}`;
  });
  if (lines.length === 0) return false;
  return sendProjectNotification({
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    title: "Изменения в карточке проекта",
    lines,
  });
}

export async function notifyProjectContactChange(args: {
  projectId: string;
  actorUserId: string;
  contactName: string;
  category?: string | null;
  action: "created" | "updated" | "entry";
  changes?: Record<string, { from: unknown; to: unknown }>;
}) {
  const title =
    args.action === "created"
      ? "Новый контакт в проекте"
      : args.action === "entry"
        ? "Новая запись по контакту"
        : "Обновлён контакт проекта";
  const lines = [`Контакт: ${args.contactName}`];
  if (args.category) {
    lines.push(`Категория: ${PROJECT_CONTACT_CATEGORY_LABEL[args.category] ?? args.category}`);
  }
  if (args.changes) {
    for (const [field, value] of Object.entries(args.changes)) {
      const label = CONTACT_PATCH_FIELD_LABEL[field] ?? field;
      lines.push(`${label}: ${formatActivityValue(field, value.from)} -> ${formatActivityValue(field, value.to)}`);
    }
  }
  return sendProjectNotification({
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    title,
    lines,
  });
}

export async function notifyProjectNoisyBlock(args: {
  projectId: string;
  actorUserId: string;
  block: "estimate" | "schedule" | "files";
  action: string;
}) {
  const label =
    args.block === "estimate"
      ? "Смета проекта"
      : args.block === "schedule"
        ? "Тайминг проекта"
        : "Файлы проекта";
  return sendProjectNotification({
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    title: `${label}: изменение`,
    lines: [args.action, "Повторные уведомления по этому блоку приглушены на 15 минут."],
    cooldownBlock: args.block,
  });
}
