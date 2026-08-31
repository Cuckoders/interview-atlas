import type { Specialty } from './domain.js';

export const preparationLevels = ['Junior', 'Middle', 'Senior'] as const;
export const completionQualities = ['hard', 'good', 'easy'] as const;
export type PreparationLevel = (typeof preparationLevels)[number];
export type CompletionQuality = (typeof completionQualities)[number];
export type PreparationSessionKind = 'theory' | 'question' | 'practice' | 'review';

export type PreparationProfile = {
  specialty: Specialty;
  level: PreparationLevel;
  targetDate: string;
  targetCompanies: string[];
  sessionsPerWeek: number;
  sessionMinutes: number;
  remindersEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  quietStartMinute: number;
  quietEndMinute: number;
  timezone: string;
  diagnosticCompletedAt: string | null;
  updatedAt: string;
};

export type SkillMastery = {
  key: string;
  label: string;
  score: number;
  repetitionCount: number;
  intervalDays: number;
  nextReviewAt: string;
  updatedAt: string;
};

export type PreparationSession = {
  id: string;
  date: string;
  kind: PreparationSessionKind;
  skillKey: string;
  skillLabel: string;
  title: string;
  description: string;
  durationMinutes: number;
  status: 'pending' | 'completed';
  completedAt?: string;
  quality?: CompletionQuality;
};

export type WeeklyPlan = {
  revision: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  reason: 'onboarding' | 'diagnostic' | 'actual_progress' | 'manual' | 'new_period';
  sessions: PreparationSession[];
};

export type PreparationSnapshot = {
  profile: PreparationProfile | null;
  skills: SkillMastery[];
  plan: WeeklyPlan | null;
};

export type CompletionAction = {
  actionId: string;
  sessionId: string;
  quality: CompletionQuality;
  occurredAt: string;
};

export const skillCatalog: Record<Specialty, { key: string; label: string }[]> = {
  Frontend: [
    { key: 'javascript', label: 'JavaScript' },
    { key: 'typescript', label: 'TypeScript' },
    { key: 'react', label: 'React' },
    { key: 'browser', label: 'Браузер' },
    { key: 'frontend-architecture', label: 'Архитектура' },
  ],
  Backend: [
    { key: 'api-design', label: 'API design' },
    { key: 'databases', label: 'Базы данных' },
    { key: 'algorithms', label: 'Алгоритмы' },
    { key: 'observability', label: 'Наблюдаемость' },
    { key: 'backend-security', label: 'Безопасность' },
  ],
  Mobile: [
    { key: 'react-native', label: 'React Native' },
    { key: 'mobile-lifecycle', label: 'Lifecycle' },
    { key: 'offline-first', label: 'Offline-first' },
    { key: 'mobile-performance', label: 'Производительность' },
    { key: 'native-apis', label: 'Native API' },
  ],
  QA: [
    { key: 'test-design', label: 'Тест-дизайн' },
    { key: 'automation', label: 'Автоматизация' },
    { key: 'api-testing', label: 'API testing' },
    { key: 'delivery-quality', label: 'Качество поставки' },
    { key: 'performance-testing', label: 'Нагрузочное тестирование' },
  ],
};

export class PreparationError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) { super(message); }
}
