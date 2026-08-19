import {
  escapeTelegramHtml,
  type TelegramInlineKeyboardMarkup,
} from "@/server/telegram";

export const TELEGRAM_TEST_CALLBACK_PREFIX = "tgtest:";

export const TELEGRAM_TEST_SCENARIO_IDS = [
  "connection",
  "new-order",
  "estimate-sent-warehouse",
  "estimate-sent-greenwich",
  "changes-requested",
  "estimate-approved",
  "discount-updated",
  "picking-started",
  "order-issued",
  "return-declared",
  "check-in-closed",
  "order-cancelled",
  "greenwich-confirmation-30",
  "greenwich-confirmation-7",
  "greenwich-confirmation-3",
  "greenwich-upcoming-changes",
  "warehouse-ready-reminder",
  "warehouse-return-reminder",
  "project-updated",
  "project-contact",
  "task-assigned",
  "task-status",
  "task-deadline",
] as const;

export type TelegramTestScenarioId = (typeof TELEGRAM_TEST_SCENARIO_IDS)[number];
export type TelegramTestAudience = "warehouse" | "greenwich";
export type TelegramTestGroup = "connection" | "orders" | "confirmations" | "operations";

export type TelegramTestScenarioMeta = {
  id: TelegramTestScenarioId;
  group: TelegramTestGroup;
  audience: TelegramTestAudience;
  title: string;
  description: string;
  hasActions?: boolean;
};

const scenario = (
  id: TelegramTestScenarioId,
  group: TelegramTestGroup,
  audience: TelegramTestAudience,
  title: string,
  description: string,
  hasActions = false,
): TelegramTestScenarioMeta => ({ id, group, audience, title, description, hasActions });

export const TELEGRAM_TEST_SCENARIOS: readonly TelegramTestScenarioMeta[] = [
  scenario("connection", "connection", "warehouse", "Проверка соединения", "Токен, чат, топик и доставка простого сообщения."),
  scenario("new-order", "orders", "warehouse", "Новая заявка", "Сообщение складу после оформления заявки."),
  scenario("estimate-sent-warehouse", "orders", "warehouse", "Смета отправлена", "Складская копия уведомления об отправленной смете."),
  scenario("estimate-sent-greenwich", "orders", "greenwich", "Смета готова", "Личное уведомление Greenwich с просьбой проверить позиции."),
  scenario("changes-requested", "orders", "warehouse", "Запрошены правки", "Greenwich вернул смету на корректировку."),
  scenario("estimate-approved", "orders", "warehouse", "Смета согласована", "Greenwich подтвердил расчёт и состав заявки."),
  scenario("discount-updated", "orders", "greenwich", "Скидка обновлена", "Личное сообщение об изменении итоговой стоимости."),
  scenario("picking-started", "orders", "greenwich", "Началась сборка", "Склад перевёл заявку на этап сборки."),
  scenario("order-issued", "orders", "greenwich", "Заявка выдана", "Реквизит выдан и начался период аренды."),
  scenario("return-declared", "orders", "warehouse", "Заявлен возврат", "Greenwich сообщил о готовности вернуть реквизит."),
  scenario("check-in-closed", "orders", "greenwich", "Приёмка завершена", "Итог возврата: норма, ремонт, поломки и потери."),
  scenario("order-cancelled", "orders", "warehouse", "Заявка отменена", "Уведомление об отмене на любом активном этапе."),
  scenario("greenwich-confirmation-30", "confirmations", "greenwich", "Актуальность · 30 дней", "Запрос подтверждения примерно за месяц.", true),
  scenario("greenwich-confirmation-7", "confirmations", "greenwich", "Актуальность · 7 дней", "Повторная проверка за неделю.", true),
  scenario("greenwich-confirmation-3", "confirmations", "greenwich", "Актуальность · 3 дня", "Финальная проверка перед событием.", true),
  scenario("greenwich-upcoming-changes", "confirmations", "warehouse", "Будут изменения", "Greenwich предупредил склад, но ещё не внёс правки."),
  scenario("warehouse-ready-reminder", "operations", "warehouse", "Подготовить к выдаче", "Напоминание складу за день до готовности."),
  scenario("warehouse-return-reminder", "operations", "warehouse", "Ожидается возврат", "Напоминание в последний день аренды."),
  scenario("project-updated", "operations", "warehouse", "Изменён проект", "Поля, смета, тайминг или файлы проекта обновлены."),
  scenario("project-contact", "operations", "warehouse", "Контакт проекта", "Новый контакт или запись по коммуникации."),
  scenario("task-assigned", "operations", "warehouse", "Назначена задача", "Новая задача назначена сотруднику."),
  scenario("task-status", "operations", "warehouse", "Статус задачи", "Задача перемещена между колонками доски."),
  scenario("task-deadline", "operations", "warehouse", "Дедлайн задачи", "До срока выполнения остались сутки."),
] as const;

function appUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/u, "") ||
    "https://wowstorg.example.com";
  return `${base}${path}`;
}

const TEST_ORDER_URL = appUrl("/orders");
const TEST_PROJECT_URL = appUrl("/projects");
const TEST_TASK_URL = appUrl("/tasks");

function testKeyboard(days: 30 | 7 | 3): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ Всё актуально", callback_data: `${TELEGRAM_TEST_CALLBACK_PREFIX}ok:${days}` }],
      [
        { text: "✏️ Есть изменения", callback_data: `${TELEGRAM_TEST_CALLBACK_PREFIX}changes:${days}` },
        { text: "❌ Отменить заявку", callback_data: `${TELEGRAM_TEST_CALLBACK_PREFIX}cancel:${days}` },
      ],
    ],
  };
}

function confirmation(days: 30 | 7 | 3) {
  const lead = days === 30 ? "примерно через месяц" : days === 7 ? "через неделю" : "через три дня";
  return {
    text: [
      "🧪 <b>ТЕСТ · Проверим актуальность заявки</b>",
      "",
      `Событие «<b>Летний корпоратив</b>» начинается ${lead}.`,
      "Заказчик: Агентство «Север»",
      "Период: 18.09.2026 (утро) — 19.09.2026 (вечер)",
      "",
      "Всё остаётся в силе или появились изменения?",
      "",
      `<a href=\"${TEST_ORDER_URL}\">Открыть заявку</a>`,
      "",
      "<i>Кнопки работают в тестовом режиме и не меняют заявки.</i>",
    ].join("\n"),
    replyMarkup: testKeyboard(days),
  };
}

export function buildTelegramTestScenario(
  id: TelegramTestScenarioId,
  recipientName = "Тестовый получатель",
): { text: string; replyMarkup?: TelegramInlineKeyboardMarkup } {
  const safeRecipientName = escapeTelegramHtml(recipientName);
  const orderLink = `<a href=\"${TEST_ORDER_URL}\">Открыть тестовую заявку</a>`;
  switch (id) {
    case "connection":
      return { text: `🧪 <b>ТЕСТ · Бот на связи</b>\n\nПолучатель: ${safeRecipientName}\nВремя: ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Omsk" })}\n\nСоединение с Telegram работает.` };
    case "new-order":
      return { text: `🧪 <b>ТЕСТ · Новая заявка</b>\n\n<b>Летний корпоратив</b>\nЗаказчик: Агентство «Север»\nПериод: 18–19 сентября\nГотовность: 17.09.2026\nСумма: <b>48 600 ₽</b>\n\n${orderLink}` };
    case "estimate-sent-warehouse":
      return { text: `🧪 <b>ТЕСТ · Смета отправлена</b>\n\nЗаявка: <b>Летний корпоратив</b>\nПолучатель: ${safeRecipientName}\nИтого клиенту: <b>48 600 ₽</b>\n\n${orderLink}` };
    case "estimate-sent-greenwich":
      return { text: `🧪 <b>ТЕСТ · Смета готова</b>\n\n${safeRecipientName}, проверьте состав и стоимость заявки «<b>Летний корпоратив</b>». Если всё верно — согласуйте её в личном кабинете.\n\n${orderLink}` };
    case "changes-requested":
      return { text: `🧪 <b>ТЕСТ · Запрошены правки</b>\n\nGreenwich вернул заявку «<b>Летний корпоратив</b>» на корректировку.\nКомментарий: заменить игровую зону и пересчитать доставку.\n\n${orderLink}` };
    case "estimate-approved":
      return { text: `🧪 <b>ТЕСТ · Смета согласована</b>\n\nGreenwich подтвердил заявку «<b>Летний корпоратив</b>».\nСумма: <b>48 600 ₽</b>\nГотовность: 17.09.2026\n\n${orderLink}` };
    case "discount-updated":
      return { text: `🧪 <b>ТЕСТ · Скидка по заявке обновлена</b>\n\nЗаявка: <b>Летний корпоратив</b>\nСкидка: 10%\nНовая сумма: <b>43 740 ₽</b>\n\n${orderLink}` };
    case "picking-started":
      return { text: `🧪 <b>ТЕСТ · Склад начал сборку</b>\n\nЗаявка «<b>Летний корпоратив</b>» перешла на этап сборки.\nГотовность: 17.09.2026\n\n${orderLink}` };
    case "order-issued":
      return { text: `🧪 <b>ТЕСТ · Реквизит выдан</b>\n\nЗаявка «<b>Летний корпоратив</b>» выдана. Период аренды: 18–19 сентября.\n\n${orderLink}` };
    case "return-declared":
      return { text: `🧪 <b>ТЕСТ · Заявлен возврат</b>\n\nGreenwich готов вернуть реквизит по заявке «<b>Летний корпоратив</b>».\nОжидаемое время: 19.09.2026, вечер.\n\n${orderLink}` };
    case "check-in-closed":
      return { text: `🧪 <b>ТЕСТ · Приёмка завершена</b>\n\nЗаявка: <b>Летний корпоратив</b>\n✅ В норме: 18 поз.\n🛠 В ремонт: 1 поз.\n❌ Сломано: 0\n❓ Потеряно: 0\n\n${orderLink}` };
    case "order-cancelled":
      return { text: `🧪 <b>ТЕСТ · Заявка отменена</b>\n\n<b>Летний корпоратив</b>\nЗаказчик: Агентство «Север»\nПериод: 18–19 сентября\nПричина: мероприятие перенесено.\n\n${orderLink}` };
    case "greenwich-confirmation-30": return confirmation(30);
    case "greenwich-confirmation-7": return confirmation(7);
    case "greenwich-confirmation-3": return confirmation(3);
    case "greenwich-upcoming-changes":
      return { text: `🧪 <b>ТЕСТ · Greenwich сообщил о будущих правках</b>\n\n${safeRecipientName}: в заявке «<b>Летний корпоратив</b>» появятся изменения. Состав пока не изменён.\n\n${orderLink}` };
    case "warehouse-ready-reminder":
      return { text: `🧪 <b>ТЕСТ · Напоминание складу</b>\n\nЗавтра (17.09.2026) нужно подготовить реквизит.\nКлиент: <b>Агентство «Север»</b>\n\n${orderLink}` };
    case "warehouse-return-reminder":
      return { text: `🧪 <b>ТЕСТ · Напоминание складу: возврат</b>\n\nСегодня последний день аренды — ожидается возврат на приёмку.\nКлиент: <b>Агентство «Север»</b>\nОриентир: <b>19.09.2026</b>\n\n${orderLink}` };
    case "project-updated":
      return { text: `🧪 📁 <b>ТЕСТ · Изменения в карточке проекта</b>\n\n👤 Михаил Бабичев\n🎯 <a href=\"${TEST_PROJECT_URL}\">Фестиваль «Город»</a>\n\nДаты мероприятия: 18.09.2026 → 19.09.2026\nСтатус: Смета → Подготовка` };
    case "project-contact":
      return { text: `🧪 📁 <b>ТЕСТ · Новая запись по контакту</b>\n\n👤 Михаил Бабичев\n🎯 <a href=\"${TEST_PROJECT_URL}\">Фестиваль «Город»</a>\n\nКонтакт: Анна Петрова\nКатегория: Заказчик\nКомментарий: ждём финальное число гостей.` };
    case "task-assigned":
      return { text: `🧪 <b>ТЕСТ · Новая назначенная задача</b>\n\nМихаил Бабичев назначил задачу для Александра Немцова.\n\nЗадача: <b>Проверить комплектность шатра</b>\nСтатус: Новые\nДедлайн: <b>17.09.2026</b>\n\n<a href=\"${TEST_TASK_URL}\">Открыть доску</a>` };
    case "task-status":
      return { text: `🧪 <b>ТЕСТ · Статус задачи изменён</b>\n\nЗадача «<b>Проверить комплектность шатра</b>» перенесена: В работе → На согласовании.\n\n<a href=\"${TEST_TASK_URL}\">Открыть доску</a>` };
    case "task-deadline":
      return { text: `🧪 <b>ТЕСТ · Напоминание по дедлайну задачи</b>\n\nДо дедлайна остались сутки.\n\nЗадача: <b>Проверить комплектность шатра</b>\nИсполнитель: <b>Александр Немцов</b>\n\n<a href=\"${TEST_TASK_URL}\">Открыть доску</a>` };
  }
}
