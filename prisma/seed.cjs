/* eslint-disable @typescript-eslint/no-require-imports */
const { hash } = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const adminLogin = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Администратор Wowstorg";

  const greenwichLogin = process.env.SEED_GREENWICH_LOGIN ?? "greenwich";
  const greenwichPassword =
    process.env.SEED_GREENWICH_PASSWORD ?? "greenwich12345";
  const greenwichName =
    process.env.SEED_GREENWICH_NAME ?? "Сотрудник Greenwich";

  const adminHash = await hash(adminPassword, 10);
  const greenwichHash = await hash(greenwichPassword, 10);

  await prisma.user.upsert({
    where: { login: adminLogin },
    update: {
      displayName: adminName,
      role: "WOWSTORG",
      isActive: true,
      passwordHash: adminHash,
    },
    create: {
      login: adminLogin,
      displayName: adminName,
      role: "WOWSTORG",
      isActive: true,
      passwordHash: adminHash,
    },
  });

  await prisma.user.upsert({
    where: { login: greenwichLogin },
    update: {
      displayName: greenwichName,
      role: "GREENWICH",
      isActive: true,
      passwordHash: greenwichHash,
    },
    create: {
      login: greenwichLogin,
      displayName: greenwichName,
      role: "GREENWICH",
      isActive: true,
      passwordHash: greenwichHash,
    },
  });

  const existingCustomer = await prisma.customer.findFirst({
    where: { name: "Greenwich (тест)" },
    select: { id: true },
  });
  if (!existingCustomer) {
    await prisma.customer.create({
      data: { name: "Greenwich (тест)", notes: "Создано сидом" },
    });
  }

  const existingItem = await prisma.item.findFirst({
    where: { name: "Стул (тест)" },
    select: { id: true },
  });
  if (!existingItem) {
    await prisma.item.create({
      data: {
        name: "Стул (тест)",
        type: "ASSET",
        pricePerDay: "500.00",
        total: 20,
      },
    });
  }

  // Categories (подборки)
  const categoriesSeed = [
    { name: "Фотозоны", slug: "photozones", order: 10 },
    { name: "Игры", slug: "games", order: 20 },
    { name: "Мебель", slug: "furniture", order: 30 },
    { name: "Декор", slug: "decor", order: 40 },
    { name: "Свет", slug: "lights", order: 50 },
    { name: "Текстиль", slug: "textile", order: 60 },
  ];

  const categoryBySlug = new Map();
  const slugToName = new Map();
  for (const c of categoriesSeed) {
    slugToName.set(c.slug, c.name);
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, order: c.order },
      create: { name: c.name, slug: c.slug, order: c.order },
      select: { id: true, slug: true },
    });
    categoryBySlug.set(cat.slug, cat.id);
  }

  // Подборки (Collections) = те же названия, что и категории — чтобы в CRUD подборок и в каталоге было единообразие
  const collectionByName = new Map();
  for (const c of categoriesSeed) {
    let col = await prisma.collection.findFirst({
      where: { name: c.name },
      select: { id: true },
    });
    if (!col) {
      col = await prisma.collection.create({
        data: { name: c.name, isActive: true },
        select: { id: true },
      });
    }
    collectionByName.set(c.name, col.id);
  }

  // Items for testing (more positions)
  const itemsSeed = [
    { name: "Неон 'Happy Birthday'", type: "ASSET", price: "1800.00", total: 2, cat: "photozones" },
    { name: "Арка круглая (белая)", type: "ASSET", price: "2500.00", total: 3, cat: "photozones" },
    { name: "Фон тканевый 3×2 (фиолет)", type: "ASSET", price: "900.00", total: 6, cat: "textile" },
    { name: "Гирлянда ламповая 10м", type: "ASSET", price: "700.00", total: 8, cat: "lights" },
    { name: "Стул складной (черный)", type: "ASSET", price: "250.00", total: 40, cat: "furniture" },
    { name: "Стол коктейльный", type: "ASSET", price: "650.00", total: 12, cat: "furniture" },
    { name: "Пуф мягкий (жёлтый)", type: "ASSET", price: "500.00", total: 10, cat: "furniture" },
    { name: "Дженга гигантская", type: "ASSET", price: "1200.00", total: 2, cat: "games" },
    { name: "Твистер", type: "ASSET", price: "400.00", total: 4, cat: "games" },
    { name: "Мафия (набор)", type: "ASSET", price: "300.00", total: 6, cat: "games" },
    { name: "Свечи декоративные (набор)", type: "BULK", price: "150.00", total: 50, cat: "decor" },
    { name: "Ваза стеклянная", type: "ASSET", price: "200.00", total: 20, cat: "decor" },
    { name: "Ковёр (малый)", type: "ASSET", price: "350.00", total: 8, cat: "decor" },
    { name: "Лента атласная (рулон)", type: "CONSUMABLE", price: "90.00", total: 200, cat: "textile" },
    { name: "Плед (серый)", type: "ASSET", price: "300.00", total: 14, cat: "textile" },
    { name: "Прожектор LED", type: "ASSET", price: "900.00", total: 6, cat: "lights" },
    { name: "Диско-шар", type: "ASSET", price: "800.00", total: 3, cat: "lights" },
    { name: "Подсветка пола (RGB)", type: "ASSET", price: "600.00", total: 10, cat: "lights" },
    { name: "Панно 'WOW' (декор)", type: "ASSET", price: "500.00", total: 5, cat: "decor" },
    { name: "Шары (набор 50)", type: "CONSUMABLE", price: "250.00", total: 30, cat: "decor" },
    { name: "Ширма (белая)", type: "ASSET", price: "700.00", total: 4, cat: "photozones" },
    { name: "Подиум (малый)", type: "ASSET", price: "900.00", total: 2, cat: "photozones" },
    { name: "Баннер стойка", type: "ASSET", price: "750.00", total: 6, cat: "photozones" },
    { name: "Набор табличек (фразы)", type: "BULK", price: "120.00", total: 80, cat: "photozones" },
  ];

  const itemByName = new Map();
  for (const it of itemsSeed) {
    const existing = await prisma.item.findFirst({
      where: { name: it.name },
      select: { id: true, name: true },
    });

    const item = existing
      ? await prisma.item.update({
          where: { id: existing.id },
          data: {
            type: it.type,
            pricePerDay: it.price,
            total: it.total,
            internalOnly: false,
            isActive: true,
          },
          select: { id: true, name: true },
        })
      : await prisma.item.create({
          data: {
            name: it.name,
            type: it.type,
            pricePerDay: it.price,
            total: it.total,
          },
          select: { id: true, name: true },
        });

    itemByName.set(item.name, item.id);

    const catId = categoryBySlug.get(it.cat);
    if (catId) {
      await prisma.itemCategory.upsert({
        where: { itemId_categoryId: { itemId: item.id, categoryId: catId } },
        update: {},
        create: { itemId: item.id, categoryId: catId },
      });
    }
    const catName = slugToName.get(it.cat);
    const collectionId = catName ? collectionByName.get(catName) : null;
    if (collectionId) {
      await prisma.collectionItem.upsert({
        where: { collectionId_itemId: { collectionId, itemId: item.id } },
        update: {},
        create: { collectionId, itemId: item.id, position: 0 },
      });
    }
  }

  // Kits (пакетные предложения)
  const kitsSeed = [
    {
      name: "Пакет: Мини-фотозона",
      description: "Быстрый набор для маленькой фотозоны.",
      lines: [
        { item: "Арка круглая (белая)", qty: 1 },
        { item: "Фон тканевый 3×2 (фиолет)", qty: 1 },
        { item: "Гирлянда ламповая 10м", qty: 1 },
      ],
    },
    {
      name: "Пакет: Игровая зона",
      description: "Топ игры для гостей.",
      lines: [
        { item: "Дженга гигантская", qty: 1 },
        { item: "Твистер", qty: 1 },
        { item: "Мафия (набор)", qty: 1 },
      ],
    },
    {
      name: "Пакет: Свет и настроение",
      description: "Световые эффекты для вечеринки.",
      lines: [
        { item: "Диско-шар", qty: 1 },
        { item: "Подсветка пола (RGB)", qty: 2 },
        { item: "Прожектор LED", qty: 1 },
      ],
    },
    {
      name: "Пакет: Коктейль",
      description: "Мебель и декор под фуршет.",
      lines: [
        { item: "Стол коктейльный", qty: 2 },
        { item: "Стул складной (черный)", qty: 10 },
        { item: "Ваза стеклянная", qty: 4 },
      ],
    },
    {
      name: "Пакет: Декор базовый",
      description: "Быстро добавляет «уют» в зону.",
      lines: [
        { item: "Плед (серый)", qty: 3 },
        { item: "Ковёр (малый)", qty: 1 },
        { item: "Свечи декоративные (набор)", qty: 6 },
      ],
    },
  ];

  for (const k of kitsSeed) {
    const existingKit = await prisma.kit.findFirst({
      where: { name: k.name },
      select: { id: true },
    });

    const kit = existingKit
      ? await prisma.kit.update({
          where: { id: existingKit.id },
          data: { description: k.description, isActive: true },
          select: { id: true },
        })
      : await prisma.kit.create({
          data: { name: k.name, description: k.description, isActive: true },
          select: { id: true },
        });

    for (const l of k.lines) {
      const itemId = itemByName.get(l.item);
      if (!itemId) continue;
      await prisma.kitLine.upsert({
        where: { kitId_itemId: { kitId: kit.id, itemId } },
        update: { defaultQty: l.qty },
        create: { kitId: kit.id, itemId, defaultQty: l.qty },
      });
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

