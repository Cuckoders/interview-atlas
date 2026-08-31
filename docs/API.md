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

## Опубликованный учебный контент

```http
GET /v1/content?type=question&specialty=Frontend&limit=20&cursor=...
GET /v1/content/:id
```

Типы: `question`, `task`, `video`, `track`. Публичные маршруты возвращают только статус `published`. Если редактор создаёт новую черновую версию, предыдущая публикация продолжает выдаваться до успешной публикации замены.

## CMS API

Все маршруты требуют заголовок `Authorization: Bearer <CMS_ADMIN_TOKEN>`:

```http
GET  /admin/content?type=question&status=review
POST /admin/content
PUT  /admin/content/:id
POST /admin/content/:id/transition
```

Создание всегда формирует версию 1 со статусом `draft`. `PUT` создаёт следующую версию и требует `expectedVersion`. Переходы статусов также требуют `expectedVersion`, поэтому параллельное редактирование завершается безопасной ошибкой `409`, а не потерей изменений.

## Хранение и миграция

Без `DATABASE_URL` backend запускается с in-memory repository. Для PostgreSQL задайте `DATABASE_URL` в `server/.env` и выполните:

```bash
npm --prefix server run migrate
```

Миграции применяются по имени и записываются в `schema_migrations`. `001_vacancies.sql` создаёт вакансии и снимки, `002_content_cms.sql` — материалы, версии, события workflow, partial unique-индекс публикации и индексы очереди ревью.
