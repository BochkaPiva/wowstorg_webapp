# Паттерн: Prisma

## Клиент

Импорт только из **`@/server/db`**: `import { prisma } from "@/server/db"`. Не создавать новый `PrismaClient` в случайных файлах.

## Транзакции

- Несколько согласованных записей (заказ + строки + движение остатков) → **`prisma.$transaction(async (tx) => { ... })`**.
- Для сценариев с **резервом по датам и конкуренцией** использовать **`{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }`** там, где это уже сделано (создание заявки, правки строк с пересчётом резерва, quick supplement).

## Ошибка сериализации

- Ловить **`e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034"`** (или общий обработчик) и отдавать клиенту **409** / сообщение о повторе — **не** как необработанный 500.

## Чтение и select

- Уменьшать `select` до нужных полей на тяжёлых списках.
- При добавлении полей в `User` и выборках в админке — помнить про связи и размер ответа.

## Миграции

- Любое изменение `schema.prisma` → новая папка в **`prisma/migrations/`**.
- Raw SQL (`$queryRaw` / `$executeRaw`) — только осознанно; документировать в ADR или в комментарии, если это долгоживущий обход (как `ReminderSent`).

## Enum и статусы

- Статусы заказов и прочие перечисления — **enum в Prisma**, не «магические строки» вне схемы.

## См. также

- [`../decisions/002-serializable-inventory-critical.md`](../decisions/002-serializable-inventory-critical.md)
- [`docs/data-model.md`](../../docs/data-model.md)
