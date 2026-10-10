# Безопасность и сопровождение — рабочий план

Актуально на 10.10.2026. Владелец продукта принимает решения по доступам/рискам, агент выполняет код, проверки и подготовку выпуска. «Реализовано» не равно «в production»: проверять SHA, оба CI job и Vercel READY.

## Выпуск

1. Описать изменение/границы и проверки в PR template. Для изменения схемы — только новый migration.sql; CI запрещает правку старого SQL.
2. `npm run build:verified`: lint-ratchet без расширения baseline, тесты, production audit, build. Исправленный lint-долг уменьшает baseline сразу, чтобы ошибка не могла вернуться под старым допуском.
3. CI: чистый replay, schema/access checks, реальный HTTP smoke на одноразовой БД. Production secrets в этот job не передавать.
4. Для миграции: backup + restore proof, проверить target и pending SQL, оценить совместимость текущего и нового приложения; применить отдельно от Vercel build. Исторические data updates не перезапускать.
5. Проверить обе CI jobs и production READY на том же SHA; проверить вход, ключевую изменённую операцию и negative request. GitHub jobs пока не являются required branch checks; Vercel build gate не ждёт migrations job автоматически.
6. При регрессии кода — проверить совместимость прежней версии с новой схемой до rollback. ACL/RLS rollback из 10.10 возвращает небезопасное состояние, это не обычный способ отката.

## Бэкапы и восстановление

- Есть проверенный локальный consistent dump `data/security/2026-10-10-public.pgdump`, совпадение counts 87 таблиц. Он создан **до** archive/convergence; не включает private maintenance archive, auth/storage и файлы.
- Перед обновлением PostgreSQL создан свежий consistent dump public + maintenance `data/security/2026-10-10T09-45-49-323Z-pre-upgrade.pgdump`: восстановлен на отдельной локальной БД, counts всех 88 таблиц совпали, 7 архивных checklist rows присутствуют. Он не включает auth/storage schemas или бинарные файлы buckets и не заменяет off-device recovery комплект.
- Следующий полный recovery комплект должен включать public + maintenance (7 архивированных checklist rows), Storage-файлы и список объектов/контрольных сумм, необходимые настройки/секреты в отдельном защищённом хранилище. DB dump не сохраняет бинарные файлы buckets.
- Ежедневная off-device копия и сроки хранения **ещё не настроены**. Цель для согласования: потеря не более суток данных (RPO), восстановление не более 4 часов (RTO). Это цели, не проверенная гарантия.
- Место хранения и ключ шифрования согласовать; не грузить рабочие данные в публичный Git/CI artifacts. Не считать файлы на том же компьютере disaster-recovery резервом.
- Restore drill: изолированный PostgreSQL 17, проверить counts/constraints/миграции/права и HTTP smoke, затем восстановление нескольких фото/документов из Storage. Отключить Telegram/cron. Не восстанавливать поверх production ради проверки.
- Архив checklist восстанавливать только после валидной родительской задачи и проверки IDs; исходный JSON — в maintenance.OrphanedChecklistArchive.

## Очередь задач по риску

| Приоритет | Работа | Состояние / критерий |
|---|---|---|
| P0 | Закрыть Supabase Data API business tables | Выпущено 1228b5b; 87 tables/access 0, проверен HTTP отказ |
| P1 | CSRF и жизненный цикл сессий | Код этой итерации; proxy + negative tests + HTTP smoke + admin session revocation |
| P1 | Активация пользователя по секретному приглашению | Отложено по решению владельца: действующие коллеги активированы, pending active = 0 на проверке 10.10. Риск остаётся для будущих pending аккаунтов, отсутствие индексации не считается защитой |
| P1 | Защита login/activation от перебора | Реализован DB limiter 8 pair / 40 account / 60 IP за 10 минут, TTL/cleanup, Retry-After, fail-closed, unit + concurrent HTTP tests. Выпуск фиксируется в отчёте ADR 021; пароли/права/сессии не меняются |
| P1 | Обновление PostgreSQL | Обновлено до стабильной 17.11.0.003, SQL server_version 17.11, ACTIVE_HEALTHY; backup/restore и проверки — `SECURITY_AUTH_LIMITS_2026-10-10.md` |
| P1 | Off-device DB + Storage backups | Выбор приватного места/шифрования; проверить полный restore и зафиксировать измеренный RPO/RTO |
| P1 | Required checks / repository visibility | Административное решение владельца; workflow не равен branch protection, repo всё ещё public |
| P2 | 164 исторические React lint errors | Исправлять по модулю с browser regression QA. Не заменять setState-in-effect на setTimeout лишь для обхода правила. В этой итерации count не уменьшается |
| P2 | Dev-only ESLint advisory | Production audit 0; full audit ранее 5 high. Проверять опубликованный patch, не делать force downgrade Next |
| P2 | Мобильная и Office приёмка КП | Реальный browser + PowerPoint/Slides/LibreOffice; ZIP/PDF signature не подтверждают визуальную корректность |
| P2 | Полный CSP / upload policy / audit observability | Отдельная проверка совместимости и угроз, текущая ограниченная CSP не предотвращает весь XSS |

## Реакция на подозрение на утечку

1. Сохранить факты (время, SHA, endpoint, агрегированные логи), не публикуя данные клиентов. Отсутствие ошибок не доказывает отсутствие доступа.
2. Определить и закрыть конкретный путь; не отключать всю систему/права пользователя без причины.
3. Если скомпрометированы секреты — план ротации связанных DB/Storage/Telegram/cron ключей, проверка зависимости и сохранение доступности. Ротация требует владельца/административного доступа.
4. Отозвать затронутые сессии, проверить восстановление и negative tests. Не удалять доказательства или бизнес-данные.
5. Зафиксировать причину, ущерб (подтверждённый отдельно от предположений), исправление и предотвращающий тест.

Методика origin gate основана на [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html); лёгкая network-boundary проверка не заменяет существующую авторизацию/Prisma. Рекомендации Auth/CI/CD применены без миграции на другой auth provider и без передачи production secrets в CI.
