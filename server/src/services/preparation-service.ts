import type {
  CompletionAction,
  PreparationProfile,
  PreparationSession,
  PreparationSnapshot,
  SkillMastery,
  WeeklyPlan,
} from '../preparation-domain.js';
import { PreparationError, skillCatalog } from '../preparation-domain.js';
import type { PreparationRepository, ProfileInput } from '../repositories/preparation-repository.js';

export class PreparationService {
  constructor(private readonly repository: PreparationRepository) {}

  async snapshot(userId: string): Promise<PreparationSnapshot> {
    const profile = await this.repository.getProfile(userId);
    if (!profile) return { profile: null, skills: [], plan: null };
    const current = await this.repository.getPlan(userId);
    const today = dateInTimezone(profile.timezone);
    const plan = !current || current.periodEnd < today
      ? await this.regenerate(userId, current ? 'new_period' : 'onboarding')
      : current;
    return { profile, skills: this.withDefaults(profile, await this.repository.getSkills(userId)), plan };
  }

  async saveProfile(userId: string, input: ProfileInput): Promise<PreparationSnapshot> {
    if (input.targetDate < dateInTimezone(input.timezone)) throw new PreparationError('past_target_date', 'Дата интервью уже прошла', 400);
    await this.repository.saveProfile(userId, input);
    await this.regenerate(userId, 'onboarding');
    return this.snapshot(userId);
  }

  async saveDiagnostic(userId: string, ratings: Record<string, number>): Promise<PreparationSnapshot> {
    const profile = await this.requireProfile(userId);
    const expected = new Set(skillCatalog[profile.specialty].map((skill) => skill.key));
    if (Object.keys(ratings).length !== expected.size || Object.keys(ratings).some((key) => !expected.has(key))) {
      throw new PreparationError('invalid_diagnostic', 'Ответьте по всем навыкам выбранного направления', 400);
    }
    await this.repository.saveDiagnostic(userId, profile.specialty, ratings);
    await this.regenerate(userId, 'diagnostic');
    return this.snapshot(userId);
  }

  async complete(userId: string, action: CompletionAction): Promise<PreparationSnapshot> {
    const now = Date.now();
    const occurredAt = Date.parse(action.occurredAt);
    if (occurredAt < now - 30 * 24 * 60 * 60_000 || occurredAt > now + 5 * 60_000) {
      throw new PreparationError('invalid_action_time', 'Некорректное время завершения сессии', 400);
    }
    const result = await this.repository.applyCompletion(userId, action);
    if (result === 'not_found') throw new PreparationError('session_not_found', 'Сессия не найдена в текущем плане', 404);
    if (result === 'applied') await this.regenerate(userId, 'actual_progress');
    return this.snapshot(userId);
  }

  async regenerate(userId: string, reason: WeeklyPlan['reason'] = 'manual'): Promise<WeeklyPlan> {
    const profile = await this.requireProfile(userId);
    const previous = await this.repository.getPlan(userId);
    const skills = this.withDefaults(profile, await this.repository.getSkills(userId));
    const periodStart = dateInTimezone(profile.timezone);
    const today = new Date(`${periodStart}T12:00:00.000Z`);
    const end = new Date(today); end.setUTCDate(end.getUTCDate() + 6);
    const completed = previous && previous.periodEnd >= periodStart
      ? previous.sessions.filter((session) => session.status === 'completed')
      : [];
    const previousPending = previous && previous.periodEnd >= periodStart
      ? previous.sessions.filter((session) => session.status === 'pending')
      : [];
    const pendingCount = Math.max(0, profile.sessionsPerWeek - completed.length);
    const ranked = [...skills].sort((a, b) => {
      const due = Number(a.nextReviewAt <= periodStart) - Number(b.nextReviewAt <= periodStart);
      return due !== 0 ? -due : a.score - b.score;
    });
    const kinds: PreparationSession['kind'][] = ['theory', 'question', 'practice', 'review'];
    const pending = Array.from({ length: pendingCount }, (_, index) => {
      const skill = ranked[index % ranked.length] ?? skills[0];
      if (!skill) throw new PreparationError('skills_unavailable', 'Не удалось сформировать карту навыков', 409);
      const date = new Date(today); date.setUTCDate(date.getUTCDate() + Math.floor(index * 7 / Math.max(1, pendingCount)));
      const kind = kinds[index % kinds.length] ?? 'review';
      const session = sessionFor(periodStart, completed.length + index, date, kind, skill, profile.sessionMinutes);
      const stable = previousPending[index];
      return stable ? { ...session, id: stable.id } : session;
    });
    const plan: WeeklyPlan = {
      revision: (previous?.revision ?? 0) + 1,
      periodStart, periodEnd: isoDate(end), generatedAt: new Date().toISOString(), reason,
      sessions: [...completed, ...pending].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    };
    return this.repository.savePlan(userId, plan);
  }

  async close() { await this.repository.close(); }

  private async requireProfile(userId: string): Promise<PreparationProfile> {
    const profile = await this.repository.getProfile(userId);
    if (!profile) throw new PreparationError('profile_required', 'Сначала заполните профиль подготовки', 409);
    return profile;
  }

  private withDefaults(profile: PreparationProfile, values: SkillMastery[]): SkillMastery[] {
    const known = new Map(values.map((skill) => [skill.key, skill]));
    const now = new Date().toISOString();
    return skillCatalog[profile.specialty].map(({ key, label }) => known.get(key) ?? {
      key, label, score: 40, repetitionCount: 0, intervalDays: 0, nextReviewAt: now.slice(0, 10), updatedAt: now,
    });
  }
}

function sessionFor(periodStart: string, index: number, date: Date, kind: PreparationSession['kind'], skill: SkillMastery, duration: number): PreparationSession {
  const labels = {
    theory: ['Разобрать теорию', 'Сформулируйте основные понятия и два практических примера.'],
    question: ['Ответить на вопросы', 'Дайте ответ вслух, затем проверьте пробелы и уточните формулировку.'],
    practice: ['Решить практическую задачу', 'Решите задачу с таймером и объясните выбранный подход.'],
    review: ['Повторить слабую тему', 'Воспроизведите материал без подсказки и закрепите сложные места.'],
  } as const;
  return {
    id: `${periodStart}-${index}-${skill.key}`,
    date: isoDate(date), kind, skillKey: skill.key, skillLabel: skill.label,
    title: `${labels[kind][0]}: ${skill.label}`, description: labels[kind][1], durationMinutes: duration, status: 'pending',
  };
}
function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }
function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
