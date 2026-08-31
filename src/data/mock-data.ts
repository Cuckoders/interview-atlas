import type {
  InterviewQuestion,
  LearningTrack,
  PracticeTask,
  Vacancy,
  VideoLesson,
} from '@/types/domain';

const DEMO_SYNC_TIME = Date.UTC(2026, 7, 31, 15, 0, 0);
const hoursAgo = (hours: number) => new Date(DEMO_SYNC_TIME - hours * 3_600_000).toISOString();

export const tracks: LearningTrack[] = [
  {
    id: 'frontend-core',
    title: 'Frontend: сильная база',
    description: 'JavaScript, браузер, React и архитектура интерфейсов.',
    specialty: 'Frontend',
    lessons: 28,
    durationMinutes: 420,
    progress: 0.38,
  },
  {
    id: 'backend-system',
    title: 'Backend и system design',
    description: 'API, базы данных, очереди и проектирование систем.',
    specialty: 'Backend',
    lessons: 32,
    durationMinutes: 540,
    progress: 0.12,
  },
  {
    id: 'mobile-ready',
    title: 'Mobile interview',
    description: 'Жизненный цикл, offline-first и платформенные детали.',
    specialty: 'Mobile',
    lessons: 24,
    durationMinutes: 360,
    progress: 0.2,
  },
  {
    id: 'qa-automation',
    title: 'QA и автоматизация',
    description: 'Стратегия тестирования, API, UI и инфраструктура.',
    specialty: 'QA',
    lessons: 22,
    durationMinutes: 330,
    progress: 0,
  },
];

export const questions: InterviewQuestion[] = [
  {
    id: 'event-loop',
    title: 'Как работает Event Loop в JavaScript?',
    shortAnswer: 'Цикл координирует стек вызовов, microtask и task queues.',
    fullAnswer:
      'Синхронный код выполняется в стеке. После его очистки среда сначала выполняет microtasks — например, обработчики Promise — и затем берёт следующую task, например таймер или событие ввода. На интервью важно объяснить порядок выполнения на коротком примере и различие между браузером и Node.js.',
    specialty: 'Frontend',
    difficulty: 'Средний',
    tags: ['JavaScript', 'Browser'],
    updatedAt: hoursAgo(6),
    sourceLabel: 'Редакция Interview Atlas',
  },
  {
    id: 'react-render',
    title: 'Что вызывает повторный рендер React-компонента?',
    shortAnswer: 'Изменение state, props, context или рендер родителя.',
    fullAnswer:
      'Компонент рассматривается React повторно при изменении его состояния, входных свойств или используемого контекста, а также при рендере родителя. Memo может пропустить работу, если props эквивалентны, но это оптимизация, а не гарантия. Следует отдельно говорить о фазах render и commit.',
    specialty: 'Frontend',
    difficulty: 'Начальный',
    tags: ['React', 'Performance'],
    updatedAt: hoursAgo(20),
    sourceLabel: 'Редакция Interview Atlas',
  },
  {
    id: 'database-indexes',
    title: 'Когда индекс базы данных ухудшает производительность?',
    shortAnswer: 'При частых записях, низкой селективности и лишних индексах.',
    fullAnswer:
      'Индекс ускоряет чтение ценой места и дополнительной работы при INSERT, UPDATE и DELETE. Индекс по полю с малым числом уникальных значений часто не помогает. На практике решение принимают по плану запроса, статистике и профилю нагрузки, а не по правилу «индексировать всё».',
    specialty: 'Backend',
    difficulty: 'Средний',
    tags: ['SQL', 'Databases'],
    updatedAt: hoursAgo(28),
    sourceLabel: 'Редакция Interview Atlas',
  },
  {
    id: 'idempotency',
    title: 'Как спроектировать идемпотентный API?',
    shortAnswer: 'Повтор одинакового запроса не должен создавать новый эффект.',
    fullAnswer:
      'Клиент передаёт уникальный idempotency key, сервер атомарно связывает его с результатом операции и возвращает сохранённый результат при повторе. Нужно продумать TTL, область уникальности, конкурентные запросы и поведение при частично завершённой операции.',
    specialty: 'Backend',
    difficulty: 'Продвинутый',
    tags: ['API', 'System Design'],
    updatedAt: hoursAgo(44),
    sourceLabel: 'Редакция Interview Atlas',
  },
  {
    id: 'mobile-lifecycle',
    title: 'Что происходит с мобильным приложением в background?',
    shortAnswer: 'ОС ограничивает выполнение и может завершить процесс.',
    fullAnswer:
      'При уходе в background приложение должно быстро сохранить черновики и критическое состояние. Нельзя рассчитывать на длительную работу: ОС может заморозить или завершить процесс. Возвращаясь, приложение восстанавливает локальный снимок и обновляет устаревшие данные.',
    specialty: 'Mobile',
    difficulty: 'Средний',
    tags: ['Lifecycle', 'Offline'],
    updatedAt: hoursAgo(13),
    sourceLabel: 'Редакция Interview Atlas',
  },
  {
    id: 'test-pyramid',
    title: 'Когда пирамида тестирования не подходит?',
    shortAnswer: 'Когда риск продукта сосредоточен в интеграциях или UI-потоках.',
    fullAnswer:
      'Пирамида — эвристика. Для продукта с тонкой логикой и сложными интеграциями полезнее «трофей» или профиль тестов, основанный на риске. Важно объяснить стоимость обратной связи, стабильность среды и то, какие дефекты должен ловить каждый слой.',
    specialty: 'QA',
    difficulty: 'Продвинутый',
    tags: ['Testing', 'Strategy'],
    updatedAt: hoursAgo(50),
    sourceLabel: 'Редакция Interview Atlas',
  },
];

export const videoLessons: VideoLesson[] = [
  {
    id: 'video-js-loop',
    title: 'Event Loop на схемах',
    author: 'Interview Atlas',
    durationMinutes: 14,
    specialty: 'Frontend',
    url: 'https://example.com/videos/event-loop',
  },
  {
    id: 'video-system-design',
    title: 'System design: с чего начать ответ',
    author: 'Interview Atlas',
    durationMinutes: 22,
    specialty: 'Backend',
    url: 'https://example.com/videos/system-design',
  },
  {
    id: 'video-mobile',
    title: 'Lifecycle без магии',
    author: 'Interview Atlas',
    durationMinutes: 16,
    specialty: 'Mobile',
    url: 'https://example.com/videos/mobile-lifecycle',
  },
];

export const practiceTasks: PracticeTask[] = [
  {
    id: 'debounce',
    title: 'Реализовать debounce',
    description: 'Напишите функцию, откладывающую вызов до окончания серии событий.',
    specialty: 'Frontend',
    difficulty: 'Начальный',
    estimatedMinutes: 15,
    skills: ['JavaScript', 'Closures'],
    starterCode:
      'function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {\n  // your code\n}',
    solution:
      'Храните идентификатор таймера в замыкании. При каждом вызове очищайте прошлый таймер и создавайте новый, сохраняя this и аргументы.',
  },
  {
    id: 'lru-cache',
    title: 'LRU Cache за O(1)',
    description: 'Спроектируйте кеш с get/put за константное время.',
    specialty: 'Backend',
    difficulty: 'Средний',
    estimatedMinutes: 35,
    skills: ['Algorithms', 'Data Structures'],
    solution:
      'Сочетайте hash map для доступа и двусвязный список для порядка использования. Чтение и запись перемещают узел в начало.',
  },
  {
    id: 'feed-design',
    title: 'Спроектировать ленту вакансий',
    description: 'Опишите API, дедупликацию, курсоры и обновление сохранённых фильтров.',
    specialty: 'Backend',
    difficulty: 'Продвинутый',
    estimatedMinutes: 45,
    skills: ['System Design', 'API'],
    solution:
      'Разделите сбор, нормализацию, дедупликацию и выдачу. Используйте cursor pagination, provenance полей и стабильный canonical vacancy id.',
  },
  {
    id: 'offline-sync',
    title: 'Offline-first список задач',
    description: 'Продумайте локальную запись, очередь синхронизации и конфликты.',
    specialty: 'Mobile',
    difficulty: 'Средний',
    estimatedMinutes: 30,
    skills: ['Offline', 'Lifecycle'],
    solution:
      'Локальная БД — источник истины. Действия получают client id и sync status. При сети очередь отправляется идемпотентно, конфликты решаются по правилам сущности.',
  },
  {
    id: 'test-plan',
    title: 'Тест-план оплаты',
    description: 'Составьте риск-ориентированный набор проверок для нового checkout.',
    specialty: 'QA',
    difficulty: 'Средний',
    estimatedMinutes: 25,
    skills: ['Test Design', 'Payments'],
    solution:
      'Начните с потери денег, двойного списания и расхождения статусов. Добавьте идемпотентность, повторы webhook, 3DS, отмену, валюты и наблюдаемость.',
  },
];

export const vacancies: Vacancy[] = [
  {
    id: 'vac-frontend-platform',
    title: 'Senior Frontend Engineer',
    company: 'Northstar Product',
    location: 'Москва',
    workFormat: 'Гибрид',
    salary: 'от 320 000 ₽',
    level: 'Senior',
    specialty: 'Frontend',
    skills: ['TypeScript', 'React', 'Architecture'],
    description:
      'Развитие дизайн-системы и клиентской платформы для нескольких продуктовых команд.',
    source: 'hh.ru · демо',
    sourceUrl: 'https://hh.ru',
    publishedAt: hoursAgo(3),
    collectedAt: hoursAgo(1),
  },
  {
    id: 'vac-backend-go',
    title: 'Backend Engineer (Go)',
    company: 'Finwave',
    location: 'Россия',
    workFormat: 'Удалённо',
    salary: '280 000–390 000 ₽',
    level: 'Middle+',
    specialty: 'Backend',
    skills: ['Go', 'PostgreSQL', 'Kafka'],
    description:
      'Платёжные сервисы, высокая нагрузка, observability и развитие событийной архитектуры.',
    source: 'Хабр Карьера · демо',
    sourceUrl: 'https://career.habr.com',
    publishedAt: hoursAgo(8),
    collectedAt: hoursAgo(2),
  },
  {
    id: 'vac-mobile-rn',
    title: 'React Native Developer',
    company: 'Wayfinder',
    location: 'Санкт-Петербург',
    workFormat: 'Удалённо',
    level: 'Middle',
    specialty: 'Mobile',
    skills: ['React Native', 'Expo', 'Offline'],
    description:
      'Мобильный продукт с офлайн-картами, синхронизацией и нативными интеграциями.',
    source: 'hh.ru · демо',
    sourceUrl: 'https://hh.ru',
    publishedAt: hoursAgo(16),
    collectedAt: hoursAgo(4),
  },
  {
    id: 'vac-qa-auto',
    title: 'QA Automation Engineer',
    company: 'Relay Cloud',
    location: 'Россия',
    workFormat: 'Удалённо',
    salary: 'до 270 000 ₽',
    level: 'Middle+',
    specialty: 'QA',
    skills: ['TypeScript', 'Playwright', 'API'],
    description:
      'Автоматизация критических сценариев, контрактные тесты и качество релизного процесса.',
    source: 'Хабр Карьера · демо',
    sourceUrl: 'https://career.habr.com',
    publishedAt: hoursAgo(26),
    collectedAt: hoursAgo(6),
  },
  {
    id: 'vac-platform',
    title: 'Platform Engineer',
    company: 'Vektor Data',
    location: 'Москва',
    workFormat: 'Офис',
    level: 'Senior',
    specialty: 'Backend',
    skills: ['Kubernetes', 'Go', 'SRE'],
    description:
      'Внутренняя платформа разработки, инфраструктурные API и SLO продуктовых сервисов.',
    source: 'hh.ru · демо',
    sourceUrl: 'https://hh.ru',
    publishedAt: hoursAgo(31),
    collectedAt: hoursAgo(7),
  },
];
