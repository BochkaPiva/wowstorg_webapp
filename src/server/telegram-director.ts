import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { appendWorkTaskActivity } from "@/server/work-task-activity";
import { nextTaskSortOrder } from "@/server/work-tasks";
import { DIRECTOR_TASK_COLOR } from "@/lib/director-task";
import { DIRECTOR_CANCEL, DIRECTOR_HOME_TEXT, DIRECTOR_INPUT_KEYBOARD, DIRECTOR_KEYBOARD, DIRECTOR_MY_TASKS, DIRECTOR_NEW_TASK, directorHtmlPreview } from "@/server/telegram-director-ui";
import { directorTaskList } from "@/server/telegram-director-views";
import type { TelegramInlineKeyboardMarkup, TelegramReplyKeyboardMarkup } from "@/server/telegram";

export { DIRECTOR_TASK_COLOR } from "@/lib/director-task";
export const DIRECTOR_SETTINGS_ID = "primary";
export const DirectorSettingsSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  directorUserId: z.string().trim().min(1).max(64).nullable(),
  telegramChatId: z.string().trim().regex(/^[1-9]\d{0,15}$/u).nullable(),
  boardId: z.string().trim().min(1).max(64).nullable(),
  columnId: z.string().trim().min(1).max(64).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.directorUserId && (!value.telegramChatId || !value.boardId || !value.columnId)) ctx.addIssue({ code: "custom", message: "Выберите директора, его личный Telegram ID, доску и входящую колонку" });
  if (value.telegramChatId && !Number.isSafeInteger(Number(value.telegramChatId))) ctx.addIssue({ code: "custom", path: ["telegramChatId"], message: "Некорректный Telegram ID" });
});

export class DirectorConfigurationError extends Error {}

async function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        // Lock the singleton before reading authorization, draft state or settings.
        await tx.$queryRaw`SELECT "id" FROM "TelegramDirectorSettings" WHERE "id" = ${DIRECTOR_SETTINGS_ID} FOR UPDATE`;
        return operation(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2034" && attempt < 2) continue;
      throw cause;
    }
  }
}

export async function readDirectorSettings() {
  const [settings, users, boards] = await Promise.all([
    prisma.telegramDirectorSettings.findUnique({ where: { id: DIRECTOR_SETTINGS_ID } }),
    prisma.user.findMany({ where: { role: "WOWSTORG", isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, telegramChatId: true } }),
    prisma.workTaskBoard.findMany({ where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { title: "asc" }], select: { id: true, title: true, columns: { where: { isDone: false }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } } } }),
  ]);
  return { settings: { revision: settings?.revision ?? 0, directorUserId: settings?.directorUserId ?? null, telegramChatId: settings?.telegramChatId ?? null, boardId: settings?.boardId ?? null, columnId: settings?.columnId ?? null }, users, boards };
}

export async function saveDirectorSettings(input: z.infer<typeof DirectorSettingsSchema>) {
  return transaction(async tx => {
    const previous = await tx.telegramDirectorSettings.findUniqueOrThrow({ where: { id: DIRECTOR_SETTINGS_ID } });
    if (previous.revision !== input.expectedRevision) throw new DirectorConfigurationError("Настройки уже изменены другим сотрудником. Обновите страницу.");
    let chatId: string | null = null;
    if (input.directorUserId) {
      const director = await tx.user.findFirst({ where: { id: input.directorUserId, role: "WOWSTORG", isActive: true }, select: { id: true } });
      if (!director) throw new DirectorConfigurationError("Директор должен быть активным пользователем Wowstorg");
      const column = await tx.workTaskColumn.findFirst({ where: { id: input.columnId!, boardId: input.boardId!, isDone: false, board: { archivedAt: null } }, select: { id: true } });
      if (!column) throw new DirectorConfigurationError("Выбранная входящая колонка недоступна");
      chatId = input.telegramChatId!;
      const duplicate = await tx.user.findFirst({ where: { id: { not: director.id }, telegramChatId: chatId }, select: { id: true } });
      if (duplicate) throw new DirectorConfigurationError("Этот Telegram ID уже принадлежит другому пользователю");
      await tx.user.update({ where: { id: director.id }, data: { telegramChatId: chatId } });
    }
    const saved = await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: {
      directorUserId: input.directorUserId,
      telegramChatId: chatId,
      boardId: input.directorUserId ? input.boardId : null,
      columnId: input.directorUserId ? input.columnId : null,
      pendingAfterMessageId: null, pendingExpiresAt: null,
      lastMessageId: previous.telegramChatId === chatId ? previous.lastMessageId : null,
      revision: { increment: 1 },
    } });
    return { saved, oldChatId: previous.telegramChatId };
  });
}

export type DirectorTelegramMessage = { messageId: number; chatId: string; fromId: string; chatType?: string; isBot?: boolean; text?: string };
export type DirectorReply = { handled: boolean; text?: string; setupMenu?: boolean; taskId?: string; created?: boolean; replyMarkup?: TelegramInlineKeyboardMarkup | TelegramReplyKeyboardMarkup };

export function parseDirectorTask(text: string): { title: string; description: string | null } | null {
  const [first, ...remaining] = text.trim().split(/\r?\n/u);
  const title = first.trim();
  if (!title || title.length > 500 || text.length > 4096) return null;
  return { title, description: remaining.join("\n").trim() || null };
}

const HELP = DIRECTOR_HOME_TEXT;

export async function handleDirectorMessage(message: DirectorTelegramMessage, now = new Date()): Promise<DirectorReply> {
  if (message.chatType !== "private" || message.isBot || message.fromId !== message.chatId || !/^[1-9]\d{0,15}$/u.test(message.chatId) || !Number.isSafeInteger(message.messageId) || message.messageId <= 0 || message.messageId > 2147483647) return { handled: false };
  // Ordinary bot users must not contend on the director conversation lock.
  const candidate = await prisma.telegramDirectorSettings.findUnique({ where: { id: DIRECTOR_SETTINGS_ID }, select: { telegramChatId: true, directorUserId: true } });
  if (!candidate?.directorUserId || candidate.telegramChatId !== message.chatId) return { handled: false };
  return transaction(async tx => {
    const settings = await tx.telegramDirectorSettings.findUnique({ where: { id: DIRECTOR_SETTINGS_ID }, include: { director: { select: { id: true, displayName: true, role: true, isActive: true, telegramChatId: true } }, column: { select: { id: true, title: true, boardId: true, isDone: true } }, board: { select: { id: true, title: true, archivedAt: true } } } });
    const director = settings?.director;
    if (!settings || !director || !director.isActive || director.role !== "WOWSTORG" || settings.telegramChatId !== message.chatId || director.telegramChatId !== message.chatId) return { handled: false };
    const receiptId = `${message.chatId}:${message.messageId}`;
    const previous = await tx.telegramDirectorInbox.findUnique({ where: { id: receiptId }, select: { id: true } });
    if (previous || settings.lastMessageId !== null && message.messageId <= settings.lastMessageId) return { handled: true };
    await tx.telegramDirectorInbox.create({ data: { id: receiptId, telegramChatId: message.chatId, messageId: message.messageId, directorUserId: director.id, directorName: director.displayName } });
    await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: { lastMessageId: message.messageId } });
    const rawText = message.text?.trim() ?? "";
    const text = rawText === DIRECTOR_NEW_TASK ? "/task" : rawText === DIRECTOR_MY_TASKS ? "/mytasks" : rawText === DIRECTOR_CANCEL ? "/cancel" : rawText;
    const command = /^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu.exec(text);
    const name = command?.[1].toLowerCase();
    if (name === "start" || name === "help") {
      await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: { pendingAfterMessageId: null, pendingExpiresAt: null } });
      return { handled: true, text: HELP, setupMenu: true, replyMarkup: DIRECTOR_KEYBOARD };
    }
    if (name === "cancel") {
      await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: { pendingAfterMessageId: null, pendingExpiresAt: null } });
      return { handled: true, text: "Ввод отменён. Задачу не добавлял.", replyMarkup: DIRECTOR_KEYBOARD };
    }
    if (name === "mytasks") {
      return { handled: true, ...await directorTaskList(tx, director.id, message.chatId) };
    }
    if (command && name !== "task") return { handled: true, text: HELP, replyMarkup: DIRECTOR_KEYBOARD };
    if (name === "task" && !command?.[2]?.trim()) {
      await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: { pendingAfterMessageId: message.messageId, pendingExpiresAt: new Date(now.getTime() + 30 * 60_000) } });
      return { handled: true, text: "<b>Что нужно сделать?</b>\n\nНапишите задачу одним сообщением.\nПервая строка — короткое название, ниже — подробности, если они есть.", replyMarkup: DIRECTOR_INPUT_KEYBOARD };
    }
    const inline = name === "task" ? command?.[2]?.trim() : null;
    const pending = settings.pendingAfterMessageId !== null && settings.pendingExpiresAt && settings.pendingExpiresAt > now && message.messageId > settings.pendingAfterMessageId;
    if (!inline && !pending) return { handled: true, text: "Чтобы поставить задачу, нажмите «Новая задача» и отправьте её текст.", replyMarkup: DIRECTOR_KEYBOARD };
    const content = parseDirectorTask(inline ?? text);
    if (!content) return { handled: true, text: "Пока принимаю только текст. Напишите короткое название в первой строке (до 500 символов), подробности — ниже.", replyMarkup: DIRECTOR_INPUT_KEYBOARD };
    if (!settings.board || settings.board.archivedAt || !settings.column || settings.column.isDone || settings.column.boardId !== settings.board.id) return { handled: true, text: "Рабочая доска сейчас недоступна. Задачу не добавлял — попросите администратора проверить настройки бота.", replyMarkup: DIRECTOR_KEYBOARD };
    const task = await tx.workTask.create({ data: { ...content, boardId: settings.board.id, columnId: settings.column.id, createdById: director.id, color: DIRECTOR_TASK_COLOR, sortOrder: await nextTaskSortOrder(tx, settings.column.id) }, select: { id: true } });
    await tx.telegramDirectorInbox.update({ where: { id: receiptId }, data: { taskId: task.id } });
    await appendWorkTaskActivity(tx, { taskId: task.id, actorUserId: director.id, kind: "CREATED", message: "Поручение директора из Telegram" });
    await tx.telegramDirectorSettings.update({ where: { id: DIRECTOR_SETTINGS_ID }, data: { pendingAfterMessageId: null, pendingExpiresAt: null } });
    return { handled: true, taskId: task.id, created: true, text: `<b>Задача добавлена</b>\n\n<b>${directorHtmlPreview(content.title, 900)}</b>${content.description ? `\n${directorHtmlPreview(content.description, 600)}` : ""}\n\n${directorHtmlPreview(settings.board.title, 250)} · ${directorHtmlPreview(settings.column.title, 250)}`, replyMarkup: DIRECTOR_KEYBOARD };
  });
}
