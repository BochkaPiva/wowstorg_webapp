import type { Prisma } from "@prisma/client";

type CustomerIdentityDb = Pick<Prisma.TransactionClient, "customer" | "customerAlias">;

export function normalizeCustomerName(value: string) {
  return value
    .replaceAll("№", "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function findCustomerByIdentity(
  db: CustomerIdentityDb,
  name: string,
  options?: { excludeCustomerId?: string; includeInactive?: boolean },
) {
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) return null;

  return db.customer.findFirst({
    where: {
      id: options?.excludeCustomerId ? { not: options.excludeCustomerId } : undefined,
      mergedIntoId: null,
      isActive: options?.includeInactive ? undefined : true,
      OR: [
        { normalizedName },
        { aliases: { some: { normalizedName } } },
      ],
    },
    select: { id: true, name: true, isActive: true },
  });
}

export async function findOrCreateCustomerByIdentity(
  db: CustomerIdentityDb,
  name: string,
) {
  const cleanName = name.trim();
  const normalizedName = normalizeCustomerName(cleanName);
  if (!normalizedName) throw new Error("CUSTOMER_NAME_INVALID");

  const existing = await findCustomerByIdentity(db, cleanName);
  if (existing) return existing;

  return db.customer.upsert({
    where: { normalizedName },
    create: { name: cleanName, normalizedName },
    update: {},
    select: { id: true, name: true, isActive: true },
  });
}
