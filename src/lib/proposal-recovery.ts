import { z } from "zod";

const Fields = z.record(z.string().max(80), z.string().max(4000)).refine((value) => Object.keys(value).length <= 20);
const Entry = z.object({ id: z.string().uuid(), label: z.string().max(160) });
export const proposalRecoverySchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), savedAt: z.string(),
  variantId: z.string().max(200), sectionId: z.string().max(200),
  drawer: z.object({ kind: z.enum(["item", "manual", "document", "convert"]), targetId: z.string().max(200).optional(), fields: Fields }).nullable(),
  sectionFields: Fields.nullable(),
  undo: z.array(Entry).max(50), redo: z.array(Entry).max(50),
  pending: z.object({
    operation: z.object({
      mutationId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
      action: z.enum(["UPDATE_PROPOSAL", "ADD_VARIANT", "ADD_SECTION", "UPDATE_SECTION", "REMOVE_SECTION", "ADD_CATALOG_ITEM", "ADD_MANUAL_ITEM", "UPDATE_ITEM", "REMOVE_ITEM", "RESTORE_CHANGE", "MOVE_SECTION", "MOVE_ITEM"]),
    }).catchall(z.unknown()).refine((value) => JSON.stringify(value).length <= 16000),
    direction: z.enum(["undo", "redo"]).optional(), label: z.string().max(160),
    savedForm: z.enum(["drawer", "section"]).optional(),
  }).nullable(),
});
export type ProposalRecovery = z.infer<typeof proposalRecoverySchema>;
export type ProposalHistoryEntry = z.infer<typeof Entry>;

export function readProposalRecovery(raw: string | null): ProposalRecovery | null {
  if (!raw || raw.length > 100000) return null;
  try { const parsed = proposalRecoverySchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}

export function formFields(form: HTMLFormElement | null): Record<string, string> | null {
  if (!form) return null;
  return Object.fromEntries([...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function restoreFormFields(form: HTMLFormElement | null, fields: Record<string, string>) {
  if (!form) return;
  for (const [name, value] of Object.entries(fields)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) input.value = value;
  }
}

export function proposalCommandLabel(action: unknown) {
  switch (action) {
    case "MOVE_SECTION": return "Перемещение раздела";
    case "MOVE_ITEM": return "Перемещение услуги";
    case "ADD_VARIANT": return "Создание варианта";
    case "ADD_SECTION": return "Добавление раздела";
    case "REMOVE_SECTION": return "Удаление раздела";
    case "ADD_CATALOG_ITEM": case "ADD_MANUAL_ITEM": return "Добавление услуги";
    case "REMOVE_ITEM": return "Удаление услуги";
    case "UPDATE_ITEM": return "Изменение услуги";
    case "UPDATE_SECTION": return "Изменение раздела";
    default: return "Оформление КП";
  }
}
