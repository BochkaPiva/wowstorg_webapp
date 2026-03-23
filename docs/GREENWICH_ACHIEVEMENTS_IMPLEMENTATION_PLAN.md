# План внедрения: ачивки Greenwich (без деградации текущего функционала)

Документ фиксирует безопасный план внедрения системы достижений **только для роли `GREENWICH`**.
Ключевая цель: добавить прогресс/награды и in-app уведомления, не ломая текущие флоу заявок, рейтинга, выдачи/приемки и аналитики.

---

## 1) Границы и принципы безопасности

- Ачивки считаются только по валидным данным:
  - только заявки со статусом `CLOSED`;
  - заявки `CANCELLED` в прогресс **не входят**;
  - расчет выполняется после закрытия заявки (анти-абуз).
- Роль `WOWSTORG` не участвует в системе ачивок.
- Все операции обновления прогресса должны быть идемпотентными (повторный вызов не должен дублировать награды).
- Текущая бизнес-логика заявок и рейтинга не изменяется, только расширяется post-processing слоем.

---

## 2) Подтвержденный набор ачивок (Bronze/Silver/Gold)

## 2.1 Идеальные заявки
- Bronze: 10
- Silver: 50
- Gold: 100

Рекомендуемый критерий "идеальная заявка":
- `Order.status = CLOSED`
- `greenwichUserId` заполнен
- `greenwichRatingOverdueDelta = 0`
- `greenwichRatingIncidentsDelta >= 10`
  - обоснование: в текущей формуле check-in компонент дает `+10` базово и штрафует инциденты; `>=10` означает "без штрафов".

## 2.2 Башня (best score)
- Bronze: 15
- Silver: 20
- Gold: 25

## 2.3 Объем заявки (позиции реквизита)
- Bronze: 5
- Silver: 10
- Gold: 20

Метрика объема: на каждой закрытой заявке брать количество уникальных `itemId` в `OrderLine` (а не просто число строк).

## 2.4 Самый большой чек (закрытая заявка)
- Bronze: 10_000
- Silver: 25_000
- Gold: 50_000

Сумма чека считается по той же формуле, что и в dashboard (`calcOrderTotalAmount`), без расхождения формул.

## 2.5 Количество закрытых заявок (не отмененных)
- Bronze: 20
- Silver: 75
- Gold: 150

## 2.6 Серия без отмен (добавлено)
- Bronze: 10
- Silver: 25
- Gold: 50

Определение серии:
- для пользователя Greenwich берется хронологическая лента его заявок (по `createdAt`);
- серия растет на `CLOSED`, сбрасывается на `CANCELLED`.

---

## 3) Где в коде безопасно встраиваться

## 3.1 Точки жизненного цикла заявок

- Закрытие (`CLOSED`):  
  `src/app/api/orders/[id]/check-in/route.ts`
- Отмена (`CANCELLED`):  
  `src/app/api/orders/[id]/cancel/route.ts`

Именно здесь должны вызываться функции обновления ачивок после успешной транзакции доменной логики.

## 3.2 Точки UI для Greenwich

- Дашборд/главная:  
  `src/app/home/page.tsx`
- Greenwich dashboard API:  
  `src/app/api/dashboard/greenwich/route.ts`

Рекомендуется вернуть achievements в payload dashboard API (одним запросом).

## 3.3 Игра в башню

- Компонент:  
  `src/app/home/BackgroundStackGame.tsx`
- Сейчас score только в `useState` и не хранится на сервере.

Нужно добавить отдельный endpoint для сохранения best score пользователя Greenwich.

---

## 4) Модель данных (минимально необходимая)

Рекомендуемая схема (Prisma):

1. `AchievementDefinition`
- `code` (unique), `role`, `title`, `category`, `bronzeThreshold`, `silverThreshold`, `goldThreshold`, `isActive`

2. `UserAchievementProgress`
- `userId`, `achievementCode` (compound unique)
- `value` (текущее значение метрики)
- `level` (`NONE | BRONZE | SILVER | GOLD`)
- `updatedAt`

3. `UserAchievementUnlock`
- журнал получения уровня:
- `id`, `userId`, `achievementCode`, `level`, `unlockedAt`
- unique `(userId, achievementCode, level)` — защита от дублей

4. `UserTowerStats`
- `userId` (unique)
- `bestScore`, `lastScore`, `updatedAt`

5. `InAppNotification`
- `id`, `userId`, `type`, `title`, `body`, `payloadJson`, `isRead`, `createdAt`
- индекс по `(userId, isRead, createdAt desc)`

Почему отдельные таблицы:
- не блокируют текущие модели Order/Rating;
- легко откатываются/мигрируют;
- проще обеспечить идемпотентность и аудит.

---

## 5) Алгоритм пересчета (без абуза и без потери данных)

## 5.1 Общий принцип

- На событии `CLOSED` или `CANCELLED` вызывается сервис:
  `recomputeAchievementsForUser(txOrPrisma, greenwichUserId)`
- Сервис не делает "increment blindly", а пересчитывает значение метрик из источника истины и пишет состояние upsert-ом.

Это дороже, но максимально надежно и исключает накопление ошибок.

## 5.2 Метрики (источники данных)

- `closedOrdersCount`: `Order where greenwichUserId=userId and status=CLOSED`
- `perfectOrdersCount`: `Order where CLOSED and overdueDelta=0 and incidentsDelta>=10`
- `maxCheck`: максимум по формуле totalAmount на `CLOSED` заказах
- `maxPositionsPerClosedOrder`: максимум `count(distinct itemId)` по `OrderLine` в одном `CLOSED` заказе
- `noCancelStreak`: серия по `Order` пользователя по `createdAt` (CLOSED -> +1, CANCELLED -> reset)
- `towerBestScore`: из `UserTowerStats.bestScore`

## 5.3 Выдача уровней

Для каждой метрики:
- вычислить `newLevel` по порогам;
- если `newLevel > storedLevel`:
  - обновить `UserAchievementProgress.level`;
  - вставить `UserAchievementUnlock` (unique guard);
  - создать `InAppNotification` "Новая ачивка".

---

## 6) In-app "пуши" (внутри сайта)

Реалистичный MVP без WebSocket:
- endpoint `GET /api/me/notifications?unreadOnly=true`
- endpoint `POST /api/me/notifications/read`
- на клиенте polling раз в 20-30 секунд на главной + моментальный fetch после действий пользователя.

Плюсы:
- минимальный риск для существующей архитектуры;
- не нужен realtime-инфраструктурный слой.

Дальше можно перейти на SSE/WebSocket, если потребуется.

---

## 7) API-контракты (предлагаемые)

1) `GET /api/greenwich/achievements`
- возвращает:
  - summary progress по категориям;
  - массив ачивок с level/progress/nextThreshold;
  - unread notifications count.

2) `POST /api/greenwich/tower-score`
- body: `{ score: number }`
- логика:
  - only role GREENWICH;
  - upsert `UserTowerStats` с `bestScore = max(current, score)`;
  - при росте bestScore запустить recompute ачивок башни.

3) Опционально: расширить `GET /api/dashboard/greenwich`
- добавить блок `achievements`.

---

## 8) Последовательность внедрения (безопасный rollout)

### Этап A. Data layer
- Prisma-модели + миграция.
- Никаких изменений в существующих API флоу.

### Этап B. Backend service
- Новый сервис:
  - `src/server/achievements/definitions.ts`
  - `src/server/achievements/recompute.ts`
  - `src/server/achievements/serializers.ts`

### Этап C. Хуки в жизненный цикл
- После успешного `CLOSED` в `check-in`: recompute для `greenwichUserId` (если есть).
- После `CANCELLED` в `cancel`: recompute для `greenwichUserId` (если есть).
- Вызов через `scheduleAfterResponse` (как notifications), чтобы не тормозить ответ.

### Этап D. Tower score
- endpoint сохранения best score.
- вызов из `BackgroundStackGame` только при завершении раунда.

### Этап E. UI
- блок "Достижения" на Greenwich dashboard.
- модальное/секция "Все достижения".
- тосты/центр уведомлений по `InAppNotification`.

### Этап F. Backfill
- одноразовый скрипт пересчета для всех Greenwich пользователей по историческим `CLOSED/CANCELLED`.
- запуск вручную после деплоя, затем верификация.

---

## 9) Риски и контроль качества

## Риск 1: конфликт обновлений и дубли наград
- Митигировать unique constraints (`(userId, code, level)`) + upsert + транзакция.

## Риск 2: расхождение формул "чека"
- Использовать одну функцию расчета суммы (вынести общую helper-функцию).

## Риск 3: падение производительности dashboard
- Не считать тяжелые метрики в каждом рендере с нуля; использовать persisted progress.

## Риск 4: влияние на существующие order API
- Ни одной замены текущей логики статусов;
- achievements запускаются post-response (через deferred job), fail-safe.

## Риск 5: неверный критерий "идеальности"
- Зафиксировать контракт в коде и документации:
  - `overdueDelta == 0`
  - `incidentsDelta >= 10`

---

## 10) Тест-план (обязательно до релиза)

1. Закрыть заявку без просрочки/инцидентов -> рост perfect/count/check/positions.
2. Закрыть заявку с инцидентом -> perfect не растет.
3. Отменить заявку -> общий count не растет, серия без отмен сбрасывается.
4. Отправить tower score 14/15/20/25 -> корректные уровни.
5. Повторно триггернуть recompute на той же заявке -> нет дублей unlock/notifications.
6. Проверить роли: WOWSTORG не видит endpoint achievements.
7. Проверить нагрузочно: dashboard latency не деградирует критично.

---

## 11) Что нужно от бизнеса/дизайна

- PNG-иконки по каждой категории и уровню (`bronze/silver/gold`).
- Финальные русские названия и описания ачивок.
- Подтверждение текста in-app уведомлений (тон, длина).

---

## 12) Итог

Реализация безопасна и уместна:
- не ломает существующие флоу заказов;
- защищена от абуза (только `CLOSED`, пересчет после закрытия);
- сохраняет прогресс и историю получения;
- поддерживает in-app “пуши” без сложной realtime-инфры на MVP.

