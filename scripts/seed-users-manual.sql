-- Ручной сид пользователей (как prisma/seed.cjs по умолчанию).
-- Выполнять в Supabase → SQL Editor для той БД, куда смотрит Preview.
--
-- Логины/пароли: admin / admin12345 , greenwich / greenwich12345
-- ВНИМАНИЕ: не запускать на проде с этими паролями без смены паролей.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "User" (id, login, "passwordHash", role, "displayName", "isActive", "mustSetPassword", "createdAt", "updatedAt")
VALUES (
  'clmanualseedadmin00001',
  'admin',
  crypt('admin12345', gen_salt('bf', 10)),
  'WOWSTORG',
  'Администратор Wowstorg',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("login") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "displayName" = EXCLUDED."displayName",
  role = EXCLUDED.role,
  "isActive" = true,
  "mustSetPassword" = false,
  "updatedAt" = NOW();

INSERT INTO "User" (id, login, "passwordHash", role, "displayName", "isActive", "mustSetPassword", "createdAt", "updatedAt")
VALUES (
  'clmanualseedgrnwc00001',
  'greenwich',
  crypt('greenwich12345', gen_salt('bf', 10)),
  'GREENWICH',
  'Сотрудник Greenwich',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("login") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "displayName" = EXCLUDED."displayName",
  role = EXCLUDED.role,
  "isActive" = true,
  "mustSetPassword" = false,
  "updatedAt" = NOW();
