import { z } from "zod";

export const PROJECT_CONTRACTOR_STATUSES = ["PENDING", "CONFIRMED", "DONE", "CANCELLED"] as const;
export type ProjectContractorStatus = typeof PROJECT_CONTRACTOR_STATUSES[number];
export const PROJECT_CONTRACTOR_STATUS_LABEL: Record<ProjectContractorStatus, string> = {
  PENDING: "На согласовании", CONFIRMED: "Подтверждён", DONE: "Работа выполнена", CANCELLED: "Не участвует",
};
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
export const ProjectContractorFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  responsibility: z.string().trim().min(1).max(3000),
  categoryNames: z.array(z.string().trim().min(1).max(80)).max(12).transform((names) => [...new Set(names)]).optional(),
  contactName: optionalText(200), phone: optionalText(80),
  email: z.union([z.string().trim().email().max(200), z.literal(""), z.null()]).transform((value) => value || null),
  status: z.enum(PROJECT_CONTRACTOR_STATUSES),
  scheduleSlotId: optionalText(100), arrivalNote: optionalText(1000), internalNotes: optionalText(5000),
}).strict();
export const AddProjectContractorSchema = ProjectContractorFieldsSchema.extend({
  action: z.literal("ADD"), id: z.uuid(), contractorId: optionalText(100),
}).strict();
export const ImportProjectContractorsSchema = z.object({
  action: z.literal("IMPORT_PROPOSAL"), variantId: z.string().trim().min(1).max(100),
  expectedProposalRevision: z.number().int().nonnegative(),
}).strict();
export const ProjectContractorPostSchema = z.discriminatedUnion("action", [AddProjectContractorSchema, ImportProjectContractorsSchema]);
export const UpdateProjectContractorSchema = ProjectContractorFieldsSchema.extend({ expectedRevision: z.number().int().nonnegative() }).strict();
export type ProjectContractorFields = z.infer<typeof ProjectContractorFieldsSchema>;
export type ProjectContractorRow = ProjectContractorFields & {
  id: string; contractorId: string | null; revision: number; photoUrl: string | null;
  updatedAt: string; scheduleLabel: string | null;
};

export function groupProjectContractors(rows: readonly ProjectContractorRow[]) {
  const groups = new Map<string, ProjectContractorRow[]>();
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    const category = row.categoryNames?.[0] || "Без категории";
    groups.set(category, [...(groups.get(category) ?? []), row]);
  }
  return [...groups].sort(([a], [b]) => a === "Без категории" ? 1 : b === "Без категории" ? -1 : a.localeCompare(b, "ru"));
}
export type ProjectContractorsPayload = {
  assignments: ProjectContractorRow[];
  scheduleSlots: { id: string; label: string }[];
  proposal: { revision: number; variants: { id: string; title: string; contractorCount: number; isRecommended: boolean }[] } | null;
};

// One person per project, even if they supply multiple services in the selected proposal.
export function groupProposalContractors(items: readonly {
  contractorId: string | null; contractorNameSnapshot: string; offerTitleSnapshot: string;
  selectionRole: string; sectionTitle: string;
}[]) {
  const groups = new Map<string, { contractorId: string; name: string; responsibilities: Set<string> }>();
  for (const item of items) {
    if (!item.contractorId || item.selectionRole !== "PRIMARY") continue;
    const group = groups.get(item.contractorId) ?? { contractorId: item.contractorId, name: item.contractorNameSnapshot, responsibilities: new Set<string>() };
    group.responsibilities.add(`${item.sectionTitle}: ${item.offerTitleSnapshot}`);
    groups.set(item.contractorId, group);
  }
  return [...groups.values()].map((group) => ({ contractorId: group.contractorId, name: group.name, responsibility: [...group.responsibilities].join("\n") }));
}
