import { escapeTelegramHtml, type TelegramInlineKeyboardMarkup, type TelegramReplyKeyboardMarkup } from "@/server/telegram";

export const DIRECTOR_CALLBACK_PREFIX = "director:";
export const DIRECTOR_NEW_TASK = "Новая задача";
export const DIRECTOR_MY_TASKS = "Мои поручения";
export const DIRECTOR_CANCEL = "Отменить ввод";
export const DIRECTOR_KEYBOARD: TelegramReplyKeyboardMarkup = {
  keyboard: [[{ text: DIRECTOR_NEW_TASK }, { text: DIRECTOR_MY_TASKS }]], resize_keyboard: true, is_persistent: true,
};
export const DIRECTOR_INPUT_KEYBOARD: TelegramReplyKeyboardMarkup = {
  keyboard: [[{ text: DIRECTOR_CANCEL }]], resize_keyboard: true, input_field_placeholder: "Название задачи и подробности ниже",
};
export const DIRECTOR_HOME_TEXT = "<b>Задачи команде</b>\n\nНажмите «Новая задача», чтобы дать поручение.\nВ «Мои поручения» — описание, исполнители и текущий статус.\n\nКогда команда переместит задачу, сообщу здесь.";
export const DIRECTOR_APPOINTMENT_TEXT = "<b>Теперь можно ставить задачи команде прямо здесь</b>\n\n<b>Как поставить задачу</b>\n1. Нажмите «Новая задача» внизу чата.\n2. Отправьте одно сообщение: в первой строке — короткое название, ниже — подробности. Если подробностей нет, хватит названия.\n3. Я подтвержу, что задача добавлена на рабочую доску.\n\nПример:\n<b>Заказать шатёр на пятницу</b>\nУточнить наличие, стоимость и время доставки.\n\n<b>Как следить за выполнением</b>\nНажмите «Мои поручения». Выберите «В работе» или «Готово», затем нужную задачу — покажу описание, исполнителей и срок, если он указан.\nПри смене статуса сообщу вам в этом чате.\n\nПередумали во время ввода? Нажмите «Отменить ввод».\n\nЕсли кнопки не видны, откройте «Меню» рядом с полем сообщения.";

export function directorHtmlPreview(value: string, budget: number): string {
  const escaped = escapeTelegramHtml(value);
  if (escaped.length <= budget) return escaped;
  let result = "";
  for (const character of value) {
    const entity = escapeTelegramHtml(character);
    if (result.length + entity.length > budget - 1) break;
    result += entity;
  }
  return `${result}…`;
}

export function directorTaskActions(taskId: string): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "Подробнее о задаче", callback_data: `${DIRECTOR_CALLBACK_PREFIX}task:${taskId}` }],
    [{ text: "Мои поручения", callback_data: `${DIRECTOR_CALLBACK_PREFIX}list:open:0` }],
  ] };
}
