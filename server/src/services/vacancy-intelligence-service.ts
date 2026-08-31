import { createHash, randomUUID } from 'node:crypto';

import type { PublicVacancy } from '../domain.js';
import type { PreparationProfile, SkillMastery } from '../preparation-domain.js';
import type { VacancyIntelligenceRepository } from '../repositories/vacancy-intelligence-repository.js';
import {
  VacancyIntelligenceError,
  type SavedVacancySearchInput,
  type SavedVacancyStatus,
  type SkillGap,
  type VacancyMatch,
  type VacancyPreparationPlan,
} from '../vacancy-intelligence-domain.js';
import type { AccountService } from './account-service.js';
import type { PreparationService } from './preparation-service.js';
import type { VacancyService } from './vacancy-service.js';

const MAX_SEARCHES = 10;
const MAX_ALERT_ITEMS = 5;

export class VacancyIntelligenceService {
  constructor(
    private readonly repository: VacancyIntelligenceRepository,
    private readonly vacancies: VacancyService,
    private readonly accounts: AccountService,
    private readonly preparation: PreparationService,
  ) {}

  listSearches(userId: string) { return this.repository.listSearches(userId); }

  async createSearch(userId: string, input: SavedVacancySearchInput) {
    if ((await this.repository.listSearches(userId)).length >= MAX_SEARCHES) {
      throw new VacancyIntelligenceError('search_limit', `Можно сохранить не больше ${MAX_SEARCHES} поисков`, 409);
    }
    return this.repository.createSearch(userId, randomUUID(), input);
  }

  async updateSearch(userId: string, id: string, input: SavedVacancySearchInput) {
    const result = await this.repository.updateSearch(userId, id, input);
    if (!result) throw new VacancyIntelligenceError('search_not_found', 'Сохранённый поиск не найден', 404);
    return result;
  }

  async deleteSearch(userId: string, id: string) {
    if (!(await this.repository.deleteSearch(userId, id))) {
      throw new VacancyIntelligenceError('search_not_found', 'Сохранённый поиск не найден', 404);
    }
  }

  async checkSearches(userId: string, force = false) {
    const now = new Date();
    const checkedAt = now.toISOString();
    const results = [];
    for (const search of await this.repository.listSearches(userId)) {
      if (!search.notificationsEnabled || (!force && !isDue(search.lastCheckedAt, search.intervalHours, now))) continue;
      const page = await this.vacancies.search({
        ...(search.query ? { query: search.query } : {}),
        ...(search.specialty ? { specialty: search.specialty } : {}),
        ...(search.workFormat ? { workFormat: search.workFormat } : {}),
        limit: 20,
      });
      const claimedIds = await this.repository.claimNotifications(userId, search.id, page.items.map((item) => item.id), checkedAt);
      const claimed = new Set(claimedIds);
      const items = page.items.filter((item) => claimed.has(item.id));
      results.push({
        search: { ...search, lastCheckedAt: checkedAt },
        newCount: items.length,
        items: items.slice(0, MAX_ALERT_ITEMS),
      });
    }
    return { checkedAt, totalNew: results.reduce((sum, result) => sum + result.newCount, 0), searches: results };
  }

  async match(userId: string, vacancyId: string): Promise<VacancyMatch> {
    const vacancy = await this.requireVacancy(vacancyId);
    const snapshot = await this.preparation.snapshot(userId);
    if (!snapshot.profile) {
      throw new VacancyIntelligenceError('profile_required', 'Сначала настройте профиль подготовки', 409);
    }
    return calculateMatch(vacancy, snapshot.profile, snapshot.skills);
  }

  async getPlan(userId: string, vacancyId: string) { return this.repository.getPlan(userId, vacancyId); }

  async generatePlan(userId: string, vacancyId: string): Promise<VacancyPreparationPlan> {
    const vacancy = await this.requireVacancy(vacancyId);
    const snapshot = await this.preparation.snapshot(userId);
    if (!snapshot.profile) throw new VacancyIntelligenceError('profile_required', 'Сначала настройте профиль подготовки', 409);
    const match = calculateMatch(vacancy, snapshot.profile, snapshot.skills);
    const topics = match.gaps.length > 0
      ? match.gaps.slice(0, 4)
      : (vacancy.skills.length ? vacancy.skills.slice(0, 3).map((skill) => ({ skill })) : [{ skill: vacancy.specialty }]);
    const kinds = ['theory', 'question', 'practice', 'review'] as const;
    const plan: VacancyPreparationPlan = {
      vacancyId, vacancyTitle: vacancy.title, company: vacancy.company,
      matchScore: match.score, generatedAt: new Date().toISOString(),
      sessions: topics.map((topic, index) => {
        const kind = kinds[index % kinds.length] ?? 'practice';
        return {
          id: randomUUID(), kind, skill: topic.skill,
          title: planTitle(kind, topic.skill),
          description: planDescription(kind, vacancy.title),
          durationMinutes: snapshot.profile?.sessionMinutes ?? 30,
          href: kind === 'practice' ? '/(tabs)/practice' : '/(tabs)/learn',
        };
      }),
    };
    return this.repository.savePlan(userId, plan);
  }

  async savedStatuses(userId: string): Promise<SavedVacancyStatus[]> {
    const progress = await this.accounts.progress(userId);
    const result: SavedVacancyStatus[] = [];
    for (const vacancyId of progress.savedVacancyIds) {
      const current = await this.vacancies.byId(vacancyId);
      const baseline = await this.repository.getBaseline(userId, vacancyId);
      if (!current) {
        result.push({ vacancyId, status: 'closed', changedFields: [], vacancy: baseline?.vacancy ?? null,
          baselineUpdatedAt: baseline?.updatedAt ?? null });
        continue;
      }
      const fingerprint = vacancyFingerprint(current);
      if (!baseline) {
        const saved = await this.repository.saveBaseline(userId, vacancyId, current, fingerprint);
        result.push({ vacancyId, status: 'active', changedFields: [], vacancy: current, baselineUpdatedAt: saved.updatedAt });
        continue;
      }
      const changedFields = baseline.fingerprint === fingerprint ? [] : changedVacancyFields(baseline.vacancy, current);
      result.push({ vacancyId, status: changedFields.length ? 'changed' : 'active', changedFields,
        vacancy: current, baselineUpdatedAt: baseline.updatedAt });
    }
    return result;
  }

  async acknowledgeStatus(userId: string, vacancyId: string): Promise<SavedVacancyStatus> {
    const progress = await this.accounts.progress(userId);
    if (!progress.savedVacancyIds.includes(vacancyId)) {
      throw new VacancyIntelligenceError('vacancy_not_saved', 'Вакансия не находится в сохранённых', 409);
    }
    const current = await this.requireVacancy(vacancyId);
    const baseline = await this.repository.saveBaseline(userId, vacancyId, current, vacancyFingerprint(current));
    return { vacancyId, status: 'active', changedFields: [], vacancy: current, baselineUpdatedAt: baseline.updatedAt };
  }

  async exportData(userId: string) {
    return { savedSearches: await this.repository.listSearches(userId), vacancyPlans: await this.repository.listPlans(userId) };
  }

  async close() { await this.repository.close(); }

  private async requireVacancy(vacancyId: string) {
    const vacancy = await this.vacancies.byId(vacancyId);
    if (!vacancy) throw new VacancyIntelligenceError('vacancy_not_found', 'Вакансия не найдена или закрыта', 404);
    return vacancy;
  }
}

export function calculateMatch(vacancy: PublicVacancy, profile: PreparationProfile, skills: SkillMastery[]): VacancyMatch {
  const specialtyScore = vacancy.specialty === profile.specialty ? 35 : 0;
  const levelScore = scoreLevel(profile.level, vacancy.level);
  const mastery = new Map(skills.map((skill) => [skill.key, skill]));
  const matchedSkills: string[] = [];
  const gaps: SkillGap[] = [];
  let skillRatio = vacancy.skills.length === 0 ? 1 : 0;
  for (const vacancySkill of vacancy.skills) {
    const skillKey = mapVacancySkill(vacancySkill, profile.specialty);
    const value = skillKey ? mastery.get(skillKey) : undefined;
    const score = value?.score ?? (skillKey ? 40 : 25);
    skillRatio += score / 100;
    if (value && value.score >= 60) matchedSkills.push(vacancySkill);
    else gaps.push({
      skill: vacancySkill, skillKey: skillKey ?? null, currentScore: value?.score ?? null,
      priority: score < 40 ? 'high' : 'medium',
      reason: value
        ? `Текущая оценка ${value.score}/100 — навык стоит закрепить перед интервью.`
        : skillKey ? 'Навык есть в карте направления, но диагностика ещё не дала уверенного результата.'
          : 'Навык указан работодателем и пока не сопоставлен с подтверждённой картой кандидата.',
    });
  }
  const skillsScore = Math.round(45 * skillRatio / Math.max(1, vacancy.skills.length));
  const total = Math.max(0, Math.min(100, specialtyScore + levelScore + skillsScore));
  return {
    vacancyId: vacancy.id, score: total,
    label: total >= 75 ? 'Сильное совпадение' : total >= 50 ? 'Стоит подготовиться' : 'Есть заметные пробелы',
    components: [
      { key: 'specialty', label: 'Направление', score: specialtyScore, maximum: 35,
        explanation: specialtyScore ? `Профиль и вакансия: ${profile.specialty}.` : `Профиль ${profile.specialty}, вакансия ${vacancy.specialty}.` },
      { key: 'level', label: 'Уровень', score: levelScore, maximum: 20,
        explanation: `Целевой уровень ${profile.level}; в вакансии указано «${vacancy.level}».` },
      { key: 'skills', label: 'Навыки', score: skillsScore, maximum: 45,
        explanation: vacancy.skills.length
          ? `${matchedSkills.length} из ${vacancy.skills.length} требований подтверждены оценкой не ниже 60/100.`
          : 'Работодатель не перечислил навыки, поэтому компонент не снижает результат.' },
    ],
    matchedSkills, gaps: gaps.sort((a, b) => Number(a.priority === 'medium') - Number(b.priority === 'medium')),
    calculatedAt: new Date().toISOString(),
  };
}

function scoreLevel(profileLevel: PreparationProfile['level'], rawVacancyLevel: string): number {
  const order = ['Junior', 'Middle', 'Senior'];
  const normalized = rawVacancyLevel.toLowerCase();
  const vacancyLevel = normalized.includes('senior') || normalized.includes('lead') ? 'Senior'
    : normalized.includes('middle') || normalized.includes('mid') ? 'Middle'
      : normalized.includes('junior') || normalized.includes('entry') ? 'Junior' : null;
  if (!vacancyLevel) return 10;
  const distance = Math.abs(order.indexOf(profileLevel) - order.indexOf(vacancyLevel));
  return distance === 0 ? 20 : distance === 1 ? 12 : 4;
}

function mapVacancySkill(raw: string, specialty: PreparationProfile['specialty']): string | null {
  const value = raw.toLowerCase().replace(/[^a-zа-я0-9+#.]+/g, ' ').trim();
  const aliases: [RegExp, string][] = specialty === 'Backend' ? [
    [/postgres|mysql|sql|mongo|redis|database|баз/, 'databases'], [/rest|graphql|grpc|api/, 'api-design'],
    [/prometheus|grafana|observability|monitor|sre/, 'observability'], [/security|oauth|auth|безопас/, 'backend-security'],
    [/algorithm|алгоритм/, 'algorithms'],
  ] : specialty === 'Frontend' ? [
    [/typescript/, 'typescript'], [/javascript|ecmascript|node\.js/, 'javascript'], [/react/, 'react'],
    [/browser|html|css|dom/, 'browser'], [/architect|архитект/, 'frontend-architecture'],
  ] : specialty === 'Mobile' ? [
    [/react native|expo/, 'react-native'], [/lifecycle|background|appstate/, 'mobile-lifecycle'],
    [/offline|cache|sync/, 'offline-first'], [/performance|profil/, 'mobile-performance'],
    [/native|ios|android|swift|kotlin/, 'native-apis'],
  ] : [
    [/test design|тест дизайн/, 'test-design'], [/automat|selenium|playwright|appium/, 'automation'],
    [/api|postman|rest/, 'api-testing'], [/ci|cd|delivery|релиз/, 'delivery-quality'],
    [/performance|load|нагруз/, 'performance-testing'],
  ];
  return aliases.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

function vacancyFingerprint(vacancy: PublicVacancy): string {
  const comparable = { title: vacancy.title, company: vacancy.company, location: vacancy.location,
    workFormat: vacancy.workFormat, salary: vacancy.salary ?? null, level: vacancy.level,
    specialty: vacancy.specialty, skills: vacancy.skills, description: vacancy.description, sourceUrl: vacancy.sourceUrl };
  return createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
}
function changedVacancyFields(previous: PublicVacancy, current: PublicVacancy): string[] {
  const fields: [keyof PublicVacancy, string][] = [
    ['title', 'Название'], ['location', 'Локация'], ['workFormat', 'Формат'], ['salary', 'Зарплата'],
    ['level', 'Уровень'], ['skills', 'Навыки'], ['description', 'Описание'], ['sourceUrl', 'Ссылка'],
  ];
  return fields.filter(([field]) => JSON.stringify(previous[field]) !== JSON.stringify(current[field])).map(([, label]) => label);
}
function isDue(lastCheckedAt: string | null, intervalHours: number, now: Date) {
  return !lastCheckedAt || now.getTime() - Date.parse(lastCheckedAt) >= intervalHours * 60 * 60_000;
}
function planTitle(kind: 'theory' | 'question' | 'practice' | 'review', skill: string) {
  return `${kind === 'theory' ? 'Разобрать' : kind === 'question' ? 'Ответить по теме' : kind === 'practice' ? 'Отработать' : 'Повторить'}: ${skill}`;
}
function planDescription(kind: 'theory' | 'question' | 'practice' | 'review', vacancyTitle: string) {
  if (kind === 'practice') return `Решите задачу с таймером и свяжите решение с требованиями роли «${vacancyTitle}».`;
  if (kind === 'question') return 'Дайте ответ вслух, приведите пример и проверьте слабые места.';
  if (kind === 'review') return 'Воспроизведите ключевые идеи без подсказок и уточните оставшиеся вопросы.';
  return 'Составьте короткий конспект, практический пример и список типичных ошибок.';
}
