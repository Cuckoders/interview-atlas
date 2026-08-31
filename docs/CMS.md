# Interview Atlas CMS

CMS доступна по адресу `/admin` на том же backend, поэтому не требует отдельной сборки или деплоя frontend.

## Безопасность этапа 2

- admin API отключён, пока не задан `CMS_ADMIN_TOKEN` длиной не менее 32 символов;
- токен передаётся в `Authorization: Bearer` и хранится только в памяти вкладки;
- заголовок Authorization исключён из server logs;
- state-changing запросы валидируются Zod и ограничены 30 запросами в минуту;
- интерфейс использует строгую Content Security Policy, не содержит inline script и не вставляет HTML из материалов;
- ссылки на источники и видео принимаются только по HTTPS;
- полноценные редакторские аккаунты и роли появятся на этапе 3.

## Workflow

```text
draft → review → published → archived
          ↓
        draft
```

Каждое сохранение создаёт новую версию `draft`. Уже опубликованная версия остаётся доступной пользователям. Когда новая версия проходит ревью и публикуется, PostgreSQL-транзакция архивирует предыдущую публикацию и активирует новую.

`expectedVersion` защищает от перезаписи материала, который уже изменил другой редактор.

## Схемы payload

Question:

```json
{"shortAnswer":"...","fullAnswer":"...","difficulty":"Средний"}
```

Task:

```json
{"description":"...","difficulty":"Средний","estimatedMinutes":30,"skills":["TypeScript"],"starterCode":"","solution":"..."}
```

Video:

```json
{"author":"...","durationMinutes":15,"url":"https://..."}
```

Track:

```json
{"description":"...","lessons":8,"durationMinutes":240}
```

## Актуальность

У каждой версии есть редактор, источник, теги, время изменения и `nextReviewAt`. Очередь просроченных ревизий и уведомления редакторам будут добавлены вместе с аккаунтами и планировщиком фоновых заданий.
