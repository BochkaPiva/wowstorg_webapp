import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DIRECTOR_CALLBACK_PREFIX, directorHtmlPreview } from "@/server/telegram-director-ui";
import type { TelegramInlineKeyboardMarkup } from "@/server/telegram";

const PAGE_SIZE = 6;
export type DirectorView = { text: string; replyMarkup: TelegramInlineKeyboardMarkup };

/** Called only after director authorization. Every query is also owner-scoped. */
export async function directorTaskList(db: Prisma.TransactionClient, directorId: string, chatId: string, done = false, page = 0): Promise<DirectorView> {
  const where = { directorUserId: directorId, telegramChatId: chatId, task: { is: { archivedAt: null, completedAt: done ? { not: null } : null } } };
  const entries = await db.telegramDirectorInbox.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * PAGE_SIZE, take: PAGE_SIZE + 1,
    select: { task: { select: { id: true, title: true, column: { select: { title: true } } } } } });
  const tasks = entries.slice(0, PAGE_SIZE).flatMap(entry => entry.task ? [entry.task] : []);
  const filter = done ? "done" : "open";
  const text = [done ? "<b>Готовые поручения</b>" : "<b>Поручения в работе</b>", "",
    ...(tasks.length ? tasks.map((task, i) => `${page * PAGE_SIZE + i + 1}. <b>${directorHtmlPreview(task.title, 180)}</b>\n${directorHtmlPreview(task.column.title, 100)}`) : [done ? "Завершённых поручений пока нет." : "Открытых поручений нет. Новую задачу можно поставить кнопкой внизу чата."]),
    ...(tasks.length ? ["", "Нажмите на задачу ниже, чтобы посмотреть подробности."] : []),
  ].join("\n");
  const keyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [[
    { text: done ? "В работе" : "• В работе", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:open:0` },
    { text: done ? "• Готово" : "Готово", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:done:0` },
  ], ...tasks.map((task, i) => [{ text: `${page * PAGE_SIZE + i + 1}. ${Array.from(task.title).slice(0, 42).join("")}`, callback_data: `${DIRECTOR_CALLBACK_PREFIX}task:${task.id}` }])];
  const navigation = [];
  if (page > 0) navigation.push({ text: "Назад", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:${filter}:${page - 1}` });
  if (entries.length > PAGE_SIZE) navigation.push({ text: "Дальше", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:${filter}:${page + 1}` });
  if (navigation.length) keyboard.push(navigation);
  return { text, replyMarkup: { inline_keyboard: keyboard } };
}

export async function handleDirectorView(args: { data: string; chatId: string; fromId: string; chatType?: string }): Promise<{ view?: DirectorView; alert?: string }> {
  if (args.chatType !== "private" || args.chatId !== args.fromId || !/^[1-9]\d{0,15}$/u.test(args.chatId)) return { alert: "Эти кнопки доступны только директору в личном чате с ботом." };
  const settings = await prisma.telegramDirectorSettings.findUnique({ where: { id: "primary" }, include: { director: { select: { id: true, role: true, isActive: true, telegramChatId: true } } } });
  const director = settings?.director;
  if (!director?.isActive || director.role !== "WOWSTORG" || settings?.telegramChatId !== args.chatId || director.telegramChatId !== args.chatId) return { alert: "Доступ изменился. Обратитесь к администратору." };
  const list = /^director:list:(open|done):(\d{1,4})$/u.exec(args.data);
  if (list) return { view: await directorTaskList(prisma, director.id, args.chatId, list[1] === "done", Number(list[2])) };
  const detail = /^director:task:([A-Za-z0-9_-]{1,40})$/u.exec(args.data);
  if (!detail) return { alert: "Эта кнопка устарела. Откройте «Мои поручения» заново." };
  const receipt = await prisma.telegramDirectorInbox.findFirst({
    where: { taskId: detail[1], directorUserId: director.id, telegramChatId: args.chatId, task: { is: { archivedAt: null } } },
    select: {
      task: {
        select: {
          title: true, description: true, completedAt: true, dueDate: true, dueTimeMinutes: true,
          column: { select: { title: true } },
          assignee: { select: { displayName: true } },
          assignees: { select: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
  if (!receipt?.task) return { alert: "Задача удалена, в архиве или больше недоступна." };
  const task = receipt.task;
  const people = task.assignees.length ? task.assignees.map(entry => entry.user.displayName) : task.assignee ? [task.assignee.displayName] : [];
  const due = task.dueDate ? task.dueDate.toLocaleDateString("ru-RU", { timeZone: "UTC" }) : null;
  const time = task.dueTimeMinutes == null ? "" : ` · ${String(Math.floor(task.dueTimeMinutes / 60)).padStart(2, "0")}:${String(task.dueTimeMinutes % 60).padStart(2, "0")}`;
  return { view: { text: [
    `<b>${directorHtmlPreview(task.title, 600)}</b>`, "", `Статус: ${directorHtmlPreview(task.column.title, 180)}`,
    `Исполнители: ${people.length ? directorHtmlPreview(people.join(", "), 500) : "ещё не назначены"}`,
    ...(due ? [`Срок: ${due}${time}`] : []), "", task.description ? directorHtmlPreview(task.description, 2400) : "Подробности не добавлены.",
  ].join("\n"), replyMarkup: { inline_keyboard: [[{ text: "К списку поручений", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:${task.completedAt ? "done" : "open"}:0` }], [{ text: "Обновить статус", callback_data: args.data }]] } } };
}
