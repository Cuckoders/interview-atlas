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

Публичный payload видео содержит вопросы квиза, но не `correctIndex` и `explanation`. Публичный payload задачи сообщает только язык и имя функции runner; скрытые тест-кейсы доступны исключительно внутри backend.

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

## Сопоставление с вакансиями

Все маршруты требуют пользовательский access token и возвращают `Cache-Control: no-store`:

```http
GET  /v1/vacancies/:id/match
GET  /v1/vacancies/:id/preparation-plan
POST /v1/vacancies/:id/preparation-plan
```

`match` требует настроенный профиль подготовки и возвращает score 0–100, три объяснённых компонента (`specialty`, `level`, `skills`), подтверждённые требования и приоритизированные пробелы. `POST preparation-plan` создаёт до четырёх коротких сессий из этих пробелов; повторный вызов пересобирает план и сохраняет его в облаке.

## Сохранённые поиски и уведомления

```http
GET    /v1/vacancy-searches
POST   /v1/vacancy-searches
PUT    /v1/vacancy-searches/:id
DELETE /v1/vacancy-searches/:id
POST   /v1/vacancy-searches/check
```

Пользователь может хранить до 10 поисков. Поиск содержит хотя бы один фильтр, флаг уведомлений и `intervalHours`: `6`, `24` или `168`. Проверка без `force` пропускает ещё не наступившие интервалы. PostgreSQL-ограничение `(user_id, search_id, vacancy_id)` атомарно исключает повторную выдачу одной вакансии по одному поиску. Ответ ограничивает детальный preview пятью карточками, но сохраняет общий `newCount`; клиент группирует результаты в одно локальное уведомление.

## Статусы сохранённых вакансий

```http
GET  /v1/saved-vacancies/status
POST /v1/saved-vacancies/:id/acknowledge
```

Первое чтение создаёт baseline. Следующие чтения сравнивают существенные поля, не включая техническое время сбора. Статус `changed` и список полей сохраняются до `acknowledge`; отсутствующая в активном repository вакансия получает `closed`, но продолжает возвращать последний подтверждённый снимок. Если источник не даёт достоверный признак закрытия, backend не пытается объявить вакансию закрытой только по отсутствию в одной странице импорта.

## Продвинутое обучение

Все маршруты требуют пользовательский access token и возвращают `Cache-Control: no-store`:

```http
GET  /v1/learning/videos/:id/progress
PUT  /v1/learning/videos/:id/progress
POST /v1/learning/videos/:id/quiz
POST /v1/learning/tasks/:id/run
GET  /v1/learning/tasks/:id/submissions
POST /v1/learning/simulations
GET  /v1/learning/simulations/:id
PUT  /v1/learning/simulations/:id/answer
POST /v1/learning/simulations/:id/finish
```

`GET progress` требует query-параметр `contentVersion`, а `PUT progress` принимает его в JSON вместе с позицией и длительностью до 24 часов и монотонным флагом `completed`. Сервер сохраняет максимальную достигнутую позицию только внутри одной ревизии; при публикации новой версии позиция, completion и лучший результат квиза начинаются заново. Валидная ненулевая длительность заменяет старые метаданные, а позиция ограничивается концом файла. Квиз принимает `contentVersion` и до 10 пар `questionId + optionIndex`, проверяется только по показанной клиенту ревизии и возвращает score с объяснениями уже после отправки.

Runner принимает `contentVersion`, до 12 000 символов кода, ограничен восемью запусками в минуту и возвращает результат скрытых тестов только для актуальной показанной ревизии. История отдаёт до 20 последних попыток. Симуляция принимает направление и длительность 5–60 минут, создаётся минимум из трёх опубликованных вопросов/задач, а принадлежность prompt и окончание времени проверяет сервер. Ответы симуляции включают `serverNow`, по которому клиент компенсирует расхождение часов устройства.

## Хранение и миграция

Без `DATABASE_URL` backend запускается с in-memory repository. Для PostgreSQL задайте `DATABASE_URL` в `server/.env` и выполните:

```bash
npm --prefix server run migrate
```

Миграции применяются по имени и записываются в `schema_migrations`. `001_vacancies.sql` создаёт вакансии и снимки, `002_content_cms.sql` — материалы и редакционный workflow, `003_accounts_and_sync.sql` — аккаунты и облачный прогресс, `004_personal_preparation.sql` — профиль подготовки, карту навыков, текущий план и idempotency keys завершённых сессий, `005_vacancy_intelligence.sql` — поиски, дедупликацию уведомлений, baseline сохранённых вакансий и планы под вакансию, `006_advanced_learning.sql` — прогресс видео, попытки квизов, решения задач и интервью-симуляции.
