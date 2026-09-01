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
{"description":"...","difficulty":"Средний","estimatedMinutes":30,"skills":["JavaScript"],"starterCode":"function sum(a, b) {\n  return 0;\n}","solution":"...","runner":{"language":"javascript","entrypoint":"sum","tests":[{"name":"positive","args":[2,3],"expected":5}]}}
```

Video:

```json
{"author":"...","durationMinutes":15,"url":"https://cdn.example.com/lesson.mp4","quiz":[{"id":"q1","prompt":"...","options":["...","..."],"correctIndex":0,"explanation":"..."}]}
```

CMS проверяет, что видео использует прямой HTTPS URL к кроссплатформенному MP4, в вопросе 2–6 вариантов, а `correctIndex` указывает на существующий вариант. Обычная страница YouTube/Vimeo не является прямой медиассылкой и отклоняется. Runner этапа 6 поддерживает только синхронный JavaScript: `entrypoint` должен быть именем функции, каждый скрытый тест содержит массив JSON-аргументов и JSON-ожидание. Ключи квиза, объяснения и тесты runner никогда не выдаются публичным content API.

Track:

```json
{"description":"...","lessons":8,"durationMinutes":240}
```

## Актуальность

У каждой версии есть редактор, источник, теги, время изменения и `nextReviewAt`. Очередь просроченных ревизий и уведомления редакторам будут добавлены вместе с аккаунтами и планировщиком фоновых заданий.
