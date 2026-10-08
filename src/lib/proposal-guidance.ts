import type { ProposalVariant } from "./proposals";

export type ProposalNextStep = {
  kind: "SECTION" | "CATALOG" | "ITEM" | "DOCUMENT" | "PREVIEW";
  title: string; reason: string; action: string;
  sectionId?: string; itemId?: string;
};

/** Explainable guidance only. Never inserts services or changes a budget. */
export function proposalNextStep(variant: ProposalVariant | undefined, intro: string | null): ProposalNextStep {
  if (!variant?.sections.length) return { kind: "SECTION", title: "Начните со структуры мероприятия", reason: "Первый раздел поможет подобрать нужных подрядчиков.", action: "Добавить первый раздел" };
  for (const section of variant.sections) {
    const missing = section.items.find((item) => item.selectionRole === "PRIMARY" && item.clientUnitPrice == null);
    if (missing) return { kind: "ITEM", title: "Уточните цену основного состава", reason: `«${missing.offerTitleSnapshot}» пока не входит в сумму: цена по запросу.`, action: "Указать цену", sectionId: section.id, itemId: missing.id };
  }
  const empty = variant.sections.find((section) => !section.items.some((item) => item.selectionRole !== "EXCLUDED"));
  if (empty) return { kind: "CATALOG", title: `Подберите услуги для «${empty.title}»`, reason: "В этом разделе пока нет предложений для клиента.", action: "Подобрать услуги", sectionId: empty.id };
  const primary = variant.sections.some((section) => section.items.some((item) => item.selectionRole === "PRIMARY"));
  if (!primary) {
    const section = variant.sections.find((entry) => entry.items.some((item) => item.selectionRole !== "EXCLUDED"))!;
    return { kind: "ITEM", title: "Выберите основной состав", reason: "Сейчас все услуги — альтернативы или опции. Они не входят в базовый итог.", action: "Выбрать услугу", sectionId: section.id, itemId: section.items.find((item) => item.selectionRole !== "EXCLUDED")!.id };
  }
  if (!intro?.trim()) return { kind: "DOCUMENT", title: "Добавьте пару слов для клиента", reason: "Краткое вступление объяснит идею мероприятия, а не только его стоимость.", action: "Оформить КП" };
  return { kind: "PREVIEW", title: "Посмотрите КП глазами клиента", reason: "Проверьте состав, описания и цены перед печатью. Наличие подрядчиков ещё нужно согласовать.", action: "Открыть клиентский вид" };
}
