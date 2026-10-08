import { Prisma } from "@prisma/client";
import { z } from "zod";

const QuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  categoryId: z.string().trim().max(120).default(""),
  paged: z.enum(["1"]).optional(),
  all: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  cursor: z.string().max(2000).optional(),
});
const CursorSchema = z.object({ name: z.string().max(200), id: z.string().max(120), active: z.boolean(), query: z.string().max(500) }).strict();

export function catalogQuery(params: URLSearchParams) {
  const input = QuerySchema.parse(Object.fromEntries(params));
  const paged = input.paged === "1";
  if (input.cursor && !paged) throw new Error("INVALID_CURSOR");
  const query = JSON.stringify([input.search, input.categoryId, input.all === "true"]);
  let cursor: z.infer<typeof CursorSchema> | null = null;
  if (input.cursor) {
    cursor = CursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
    if (cursor.query !== query) throw new Error("INVALID_CURSOR");
  }
  const filters: Prisma.ContractorWhereInput[] = [
    { isActive: input.all === "true" ? undefined : true },
    ...(input.search ? [{ OR: [
      { name: { contains: input.search, mode: "insensitive" as const } },
      { shortDescription: { contains: input.search, mode: "insensitive" as const } },
      { offers: { some: { isActive: true, title: { contains: input.search, mode: "insensitive" as const } } } },
    ] }] : []),
    ...(input.categoryId ? [{ offers: { some: { categoryId: input.categoryId, isActive: true } } }] : []),
  ];
  // Keyset order includes the ID tie-breaker, so identical names never disappear.
  if (cursor) filters.push({ OR: [
    ...(cursor.active ? [{ isActive: false }] : []),
    { isActive: cursor.active, name: { gt: cursor.name } },
    { isActive: cursor.active, name: cursor.name, id: { gt: cursor.id } },
  ] });
  return {
    paged, includeInactive: input.all === "true", categoryId: input.categoryId,
    where: { AND: filters } satisfies Prisma.ContractorWhereInput,
    take: paged ? input.limit + 1 : 500,
    limit: input.limit,
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }] satisfies Prisma.ContractorOrderByWithRelationInput[],
    encodeCursor: (row: { id: string; name: string; isActive: boolean }) => Buffer.from(JSON.stringify({ id: row.id, name: row.name, active: row.isActive, query })).toString("base64url"),
  };
}
