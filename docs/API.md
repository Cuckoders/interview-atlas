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

## Аккаунт и сессии

```http
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
GET    /v1/account
GET    /v1/account/export
DELETE /v1/account
```

Регистрация и вход возвращают короткоживущий `accessToken` и ротируемый `refreshToken`. Защищённые маршруты принимают `Authorization: Bearer <accessToken>`. Refresh-токен используется только телом `/v1/auth/refresh`; после успешной ротации предыдущая пара токенов перестаёт действовать. Ответы с данными сессии содержат `Cache-Control: no-store`.

Удаление аккаунта требует повторного ввода пароля. PostgreSQL каскадно удаляет все сессии, облачное состояние и историю idempotency keys.

## Облачная синхронизация

```http
GET  /v1/sync
POST /v1/sync/actions
```

`GET` возвращает версию и полный snapshot прогресса. `POST` принимает до 100 операций с уникальным `id`, `occurredAt`, типом и желаемым значением. Повторная отправка того же `id` подтверждается, но не увеличивает версию и не применяет действие повторно.

## Персональная подготовка

Все пользовательские маршруты требуют `Authorization: Bearer <accessToken>` и возвращают `Cache-Control: no-store`:

```http
GET  /v1/preparation
PUT  /v1/preparation/profile
POST /v1/preparation/diagnostic
POST /v1/preparation/sessions/:id/complete
POST /v1/preparation/plan/regenerate
GET  /v1/preparation/skills/:specialty
```

`GET /v1/preparation` возвращает единый snapshot `profile + skills + plan`. Профиль задаёт направление, уровень, целевую дату, компании, от 1 до 7 сессий в неделю, длительность 15–120 минут, часовой пояс, время напоминаний и quiet hours.

Диагностика принимает оценку 1–5 для каждого из пяти навыков выбранного направления. Завершение сессии принимает уникальный `actionId`, `occurredAt` и качество `hard`, `good` или `easy`. Ключ идемпотентности не позволяет повторной доставке дважды изменить навык. После нового результата оставшиеся сессии пересобираются с приоритетом тем, у которых ниже score или наступила дата повторения.

## Хранение и миграция

Без `DATABASE_URL` backend запускается с in-memory repository. Для PostgreSQL задайте `DATABASE_URL` в `server/.env` и выполните:

```bash
npm --prefix server run migrate
```

Миграции применяются по имени и записываются в `schema_migrations`. `001_vacancies.sql` создаёт вакансии и снимки, `002_content_cms.sql` — материалы и редакционный workflow, `003_accounts_and_sync.sql` — аккаунты и облачный прогресс, `004_personal_preparation.sql` — профиль подготовки, карту навыков, текущий план и idempotency keys завершённых сессий.
