import { z } from "zod";

export const PROJECT_FREE_BOARD_COLUMNS = 48;
export const PROJECT_FREE_BOARD_MAX_ITEMS = 200;
export const PROJECT_FREE_BOARD_PORTS = ["TOP", "RIGHT", "BOTTOM", "LEFT"] as const;
export type ProjectFreeBoardPort = (typeof PROJECT_FREE_BOARD_PORTS)[number];
export const PROJECT_FREE_BOARD_ITEM_TYPES = [
  "NOTE",
  "STICKER",
  "HEADING",
  "CHECKLIST",
  "LINK",
  "TASK",
  "ORDER",
  "FILE",
  "ESTIMATE_SECTION",
  "GROUP",
  "CONNECTOR",
] as const;

export type ProjectFreeBoardItemType = (typeof PROJECT_FREE_BOARD_ITEM_TYPES)[number];
export type ProjectFreeBoardLinkedItemType = "TASK" | "ORDER" | "FILE" | "ESTIMATE_SECTION";

export type ProjectFreeBoardLinkable = {
  id: string;
  label: string;
  meta: string;
  href: string;
};

export type ProjectFreeBoardLinkables = {
  tasks: ProjectFreeBoardLinkable[];
  orders: ProjectFreeBoardLinkable[];
  files: ProjectFreeBoardLinkable[];
  estimateSections: ProjectFreeBoardLinkable[];
};

const ItemIdSchema = z.uuid();
const ColorSchema = z.enum(["LILAC", "YELLOW", "MINT", "BLUE", "ROSE", "NEUTRAL"]);
const GeometrySchema = {
  id: ItemIdSchema,
  x: z.number().int().min(0).max(PROJECT_FREE_BOARD_COLUMNS - 1),
  y: z.number().int().min(0).max(999),
  width: z.number().int().min(2).max(PROJECT_FREE_BOARD_COLUMNS),
  height: z.number().int().min(2).max(20),
  zIndex: z.number().int().min(0).max(10_000).default(0),
  expectedRevision: z.number().int().min(0).nullable().optional(),
};

const TextPayloadSchema = z
  .object({
    text: z.string().max(8_000),
    color: ColorSchema.optional(),
  })
  .strict();

const ChecklistPayloadSchema = z
  .object({
    title: z.string().max(240).optional(),
    color: ColorSchema.optional(),
    items: z
      .array(
        z
          .object({
            id: ItemIdSchema,
            text: z.string().trim().min(1).max(500),
            isDone: z.boolean(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

const LinkPayloadSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2_048)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      }, {
        message: "Укажите корректную http/https ссылку",
      }),
    label: z.string().trim().max(240).optional(),
    color: ColorSchema.optional(),
  })
  .strict();

const LinkedPayloadSchema = z
  .object({
    label: z.string().trim().max(240).optional(),
    color: ColorSchema.optional(),
  })
  .strict();

const GroupPayloadSchema = z
  .object({
    title: z.string().trim().max(240).optional(),
    color: ColorSchema.optional(),
    itemIds: z.array(ItemIdSchema).min(2).max(50),
  })
  .strict();

const ConnectorPayloadSchema = z
  .object({
    sourceId: ItemIdSchema,
    targetId: ItemIdSchema,
    sourcePort: z.enum(PROJECT_FREE_BOARD_PORTS).default("RIGHT"),
    targetPort: z.enum(PROJECT_FREE_BOARD_PORTS).default("LEFT"),
    label: z.string().trim().max(240).optional(),
    color: z.enum(["VIOLET", "ZINC", "AMBER", "EMERALD"]).default("VIOLET"),
  })
  .strict()
  .refine((value) => value.sourceId !== value.targetId, {
    message: "Связь должна соединять два разных блока",
  });

export const ProjectFreeBoardItemInputSchema = z
  .discriminatedUnion("type", [
    z.object({ ...GeometrySchema, type: z.literal("NOTE"), payload: TextPayloadSchema }).strict(),
    z.object({ ...GeometrySchema, type: z.literal("STICKER"), payload: TextPayloadSchema }).strict(),
    z.object({ ...GeometrySchema, type: z.literal("HEADING"), payload: TextPayloadSchema }).strict(),
    z.object({ ...GeometrySchema, type: z.literal("CHECKLIST"), payload: ChecklistPayloadSchema }).strict(),
    z.object({ ...GeometrySchema, type: z.literal("LINK"), payload: LinkPayloadSchema }).strict(),
    z
      .object({
        ...GeometrySchema,
        type: z.literal("TASK"),
        payload: LinkedPayloadSchema,
        linkedTaskId: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        ...GeometrySchema,
        type: z.literal("ORDER"),
        payload: LinkedPayloadSchema,
        linkedOrderId: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        ...GeometrySchema,
        type: z.literal("FILE"),
        payload: LinkedPayloadSchema,
        linkedFileId: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        ...GeometrySchema,
        type: z.literal("ESTIMATE_SECTION"),
        payload: LinkedPayloadSchema,
        linkedSectionId: z.string().trim().min(1),
      })
      .strict(),
    z.object({ ...GeometrySchema, type: z.literal("GROUP"), payload: GroupPayloadSchema }).strict(),
    z.object({ ...GeometrySchema, type: z.literal("CONNECTOR"), payload: ConnectorPayloadSchema }).strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.x + value.width > PROJECT_FREE_BOARD_COLUMNS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: "Элемент выходит за границы доски",
      });
    }
  });

export const ProjectFreeBoardBatchSchema = z
  .object({
    mutationId: z.uuid(),
    operations: z
      .array(
        z.discriminatedUnion("op", [
          z.object({ op: z.literal("UPSERT"), item: ProjectFreeBoardItemInputSchema }).strict(),
          z
            .object({
              op: z.literal("DELETE"),
              itemId: ItemIdSchema,
              expectedRevision: z.number().int().min(0).nullable().optional(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type ProjectFreeBoardItemInput = z.infer<typeof ProjectFreeBoardItemInputSchema>;
export type ProjectFreeBoardBatchInput = z.infer<typeof ProjectFreeBoardBatchSchema>;

type ProjectFreeBoardItemDtoFor<T> = T extends ProjectFreeBoardItemInput
  ? Omit<T, "expectedRevision"> & {
      revision: number;
      createdAt: string;
      updatedAt: string;
    }
  : never;

export type ProjectFreeBoardItemDto = ProjectFreeBoardItemDtoFor<ProjectFreeBoardItemInput>;

export function createProjectFreeBoardItem(
  type: "NOTE" | "STICKER" | "HEADING" | "CHECKLIST" | "LINK",
  position: { x: number; y: number },
): ProjectFreeBoardItemInput {
  const common = {
    id: crypto.randomUUID(),
    x: position.x,
    y: position.y,
    width: type === "HEADING" ? 12 : type === "CHECKLIST" ? 8 : 6,
    height: type === "CHECKLIST" ? 6 : type === "HEADING" ? 2 : 4,
    zIndex: 0,
    expectedRevision: null,
  };

  if (type === "CHECKLIST") {
    return { ...common, type, payload: { title: "Новый список", color: "NEUTRAL", items: [] } };
  }
  if (type === "LINK") {
    return { ...common, type, payload: { url: "", label: "Новая ссылка", color: "BLUE" } };
  }
  return {
    ...common,
    type,
    payload: {
      text: type === "HEADING" ? "Новый раздел" : type === "STICKER" ? "Новая идея" : "Новая заметка",
      color: type === "STICKER" ? "YELLOW" : type === "HEADING" ? "NEUTRAL" : "LILAC",
    },
  };
}

export function createProjectFreeBoardLinkedItem(
  type: ProjectFreeBoardLinkedItemType,
  linkable: ProjectFreeBoardLinkable,
  position: { x: number; y: number },
): ProjectFreeBoardItemInput {
  const common = {
    id: crypto.randomUUID(),
    x: position.x,
    y: position.y,
    width: 8,
    height: 4,
    zIndex: 0,
    expectedRevision: null,
    payload: { label: linkable.label, color: type === "TASK" ? "BLUE" as const : "NEUTRAL" as const },
  };

  if (type === "TASK") return { ...common, type, linkedTaskId: linkable.id };
  if (type === "ORDER") return { ...common, type, linkedOrderId: linkable.id };
  if (type === "FILE") return { ...common, type, linkedFileId: linkable.id };
  return { ...common, type, linkedSectionId: linkable.id };
}

export function createProjectFreeBoardGroup(
  items: readonly ProjectFreeBoardItemInput[],
  position: { x: number; y: number },
): ProjectFreeBoardItemInput {
  const itemIds = Array.from(new Set(items.filter((item) => item.type !== "GROUP" && item.type !== "CONNECTOR").map((item) => item.id)));
  if (itemIds.length < 2) {
    throw new Error("Для группы нужно выбрать минимум два блока");
  }
  if (itemIds.length > 50) {
    throw new Error("В одной группе может быть не более 50 блоков");
  }
  return ProjectFreeBoardItemInputSchema.parse({
    id: crypto.randomUUID(),
    type: "GROUP",
    x: position.x,
    y: position.y,
    width: 8,
    height: 4,
    zIndex: 0,
    expectedRevision: null,
    payload: {
      title: "Новая группа",
      color: "LILAC",
      itemIds,
    },
  });
}

export function createProjectFreeBoardConnector(
  sourceId: string,
  targetId: string,
  sourcePort: ProjectFreeBoardPort = "RIGHT",
  targetPort: ProjectFreeBoardPort = "LEFT",
): ProjectFreeBoardItemInput {
  return ProjectFreeBoardItemInputSchema.parse({
    id: crypto.randomUUID(),
    type: "CONNECTOR",
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    zIndex: 0,
    expectedRevision: null,
    payload: { sourceId, targetId, sourcePort, targetPort, color: "VIOLET" },
  });
}

export function duplicateProjectFreeBoardItem(
  item: ProjectFreeBoardItemInput,
  position: { x: number; y: number },
): ProjectFreeBoardItemInput {
  const clone = structuredClone(item);
  clone.id = crypto.randomUUID();
  clone.x = position.x;
  clone.y = position.y;
  clone.expectedRevision = null;
  if (clone.type === "CHECKLIST") {
    clone.payload.items = clone.payload.items.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
    }));
  }
  return ProjectFreeBoardItemInputSchema.parse(clone);
}
