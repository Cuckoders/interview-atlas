# Interview Atlas API

Локальный адрес по умолчанию: `http://127.0.0.1:4000`.

## Состояние сервиса

```http
GET /health
```

Возвращает `status`, количество вакансий, время последней успешной синхронизации и тип хранилища (`memory` или `postgres`).

## Лента вакансий

```http
GET /v1/vacancies?query=react&specialty=Frontend&workFormat=Удалённо&limit=20&cursor=...
```

Параметры:

- `query` — строка до 100 символов;
- `specialty` — `Frontend`, `Backend`, `Mobile` или `QA`;
- `workFormat` — `Удалённо`, `Гибрид` или `Офис`;
- `limit` — от 1 до 50;
- `cursor` — непрозрачное значение `nextCursor` из предыдущего ответа.

Ответ содержит `items`, `nextCursor`, `syncedAt` и `stale`. Raw payload источника и внутренние идентификаторы в клиент не передаются.

## Детальная карточка

```http
GET /v1/vacancies/:id
```

Возвращает нормализованную вакансию или безопасную ошибку `404`.

## Хранение и миграция

Без `DATABASE_URL` backend запускается с in-memory repository. Для PostgreSQL задайте `DATABASE_URL` в `server/.env` и выполните:

```bash
npm --prefix server run migrate
```

Миграция `server/migrations/001_vacancies.sql` создаёт источники, вакансии, историю снимков, точные unique-ключи и составные индексы ленты.
