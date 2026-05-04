-- При вводе rental частей суток дефолт «вечер» на конце периода применился ко всем уже существующим заявкам,
-- из-за этого учёт календарных дней мог завышаться. Проставляем «утро — утро» по всей таблице
-- и задаём новый COLUMN DEFAULT под ожидания складской логики.
UPDATE "Order"
SET
  "rentalStartPartOfDay" = 'MORNING'::"RentalPartOfDay",
  "rentalEndPartOfDay" = 'MORNING'::"RentalPartOfDay";

ALTER TABLE "Order"
  ALTER COLUMN "rentalEndPartOfDay"
  SET DEFAULT 'MORNING'::"RentalPartOfDay";
