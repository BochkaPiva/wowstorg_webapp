# Reference — машинно-проверяемые реестры

Документы в этой папке описывают **фактическое состояние кода**. Если описание расходится с репозиторием, править нужно **либо код, либо реестр** (и заново прогнать генератор).

| Файл | Содержание |
|------|------------|
| [`api-inventory.md`](./api-inventory.md) | Все `src/app/api/**/route.ts` → путь + HTTP-методы |
| [`env-inventory.md`](./env-inventory.md) | Все имена переменных окружения из кода + Prisma schema |
| [`prisma-transactions.md`](./prisma-transactions.md) | Файлы с `$transaction` и флаг Serializable |
| [`schedule-after-response.md`](./schedule-after-response.md) | Вызовы отложенных задач после ответа |

## Обновление

```bash
npm run brain:inventory
```

Скрипт: `scripts/generate-brain-inventory.mjs` — перезаписывает **`api-inventory.md`** и **`env-inventory.md`**. Файлы **`prisma-transactions.md`** и **`schedule-after-response.md`** пока ведутся вручную при изменении соответствующих паттернов (при желании их тоже можно добавить в скрипт).

## После добавления API

1. Реализовать `route.ts`.  
2. Выполнить `npm run brain:inventory`.  
3. Закоммитить изменения в `brain/reference/*.md`.
