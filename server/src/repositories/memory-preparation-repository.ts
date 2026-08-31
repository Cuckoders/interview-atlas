import type {
  CompletionAction,
  PreparationProfile,
  SkillMastery,
  WeeklyPlan,
} from '../preparation-domain.js';
import { skillCatalog } from '../preparation-domain.js';
import type { PreparationRepository, ProfileInput } from './preparation-repository.js';

export class MemoryPreparationRepository implements PreparationRepository {
  private readonly profiles = new Map<string, PreparationProfile>();
  private readonly skills = new Map<string, SkillMastery[]>();
  private readonly plans = new Map<string, WeeklyPlan>();
  private readonly actions = new Map<string, Set<string>>();

  async getProfile(userId: string) { return clone(this.profiles.get(userId) ?? null); }

  async saveProfile(userId: string, input: ProfileInput): Promise<PreparationProfile> {
    const current = this.profiles.get(userId);
    const profile: PreparationProfile = {
      ...input,
      diagnosticCompletedAt: current?.specialty === input.specialty ? current.diagnosticCompletedAt : null,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, profile);
    if (current?.specialty !== input.specialty) this.skills.delete(userId);
    return clone(profile);
  }

  async getSkills(userId: string) { return clone(this.skills.get(userId) ?? []); }

  async saveDiagnostic(userId: string, specialty: PreparationProfile['specialty'], ratings: Record<string, number>) {
    const now = new Date().toISOString();
    const nextReviewAt = now.slice(0, 10);
    const skills = skillCatalog[specialty].map(({ key, label }) => ({
      key, label, score: (ratings[key] ?? 1) * 20, repetitionCount: 0, intervalDays: 0, nextReviewAt, updatedAt: now,
    }));
    this.skills.set(userId, skills);
    const profile = this.profiles.get(userId);
    if (profile) this.profiles.set(userId, { ...profile, diagnosticCompletedAt: now, updatedAt: now });
    return clone(skills);
  }

  async getPlan(userId: string) { return clone(this.plans.get(userId) ?? null); }
  async savePlan(userId: string, plan: WeeklyPlan) { this.plans.set(userId, clone(plan)); return clone(plan); }

  async applyCompletion(userId: string, action: CompletionAction): Promise<'applied' | 'duplicate' | 'not_found'> {
    const known = this.actions.get(userId) ?? new Set<string>();
    if (known.has(action.actionId)) return 'duplicate';
    const plan = this.plans.get(userId);
    const session = plan?.sessions.find((item) => item.id === action.sessionId);
    if (!plan || !session) return 'not_found';
    known.add(action.actionId);
    this.actions.set(userId, known);
    if (session.status === 'completed') return 'duplicate';
    session.status = 'completed';
    session.completedAt = action.occurredAt;
    session.quality = action.quality;
    const skills = this.skills.get(userId) ?? [];
    let mastery = skills.find((item) => item.key === session.skillKey);
    if (!mastery) {
      mastery = { key: session.skillKey, label: session.skillLabel, score: 40, repetitionCount: 0,
        intervalDays: 0, nextReviewAt: action.occurredAt.slice(0, 10), updatedAt: action.occurredAt };
      skills.push(mastery);
      this.skills.set(userId, skills);
    }
    applyReview(mastery, action.quality, action.occurredAt);
    return 'applied';
  }

  async close(): Promise<void> {}
}

export function applyReview(skill: SkillMastery, quality: CompletionAction['quality'], occurredAt: string): void {
  const intervals = quality === 'hard' ? [1] : quality === 'good' ? [1, 3, 7, 14, 30] : [3, 7, 14, 30, 60];
  skill.score = Math.min(100, skill.score + (quality === 'hard' ? 2 : quality === 'good' ? 7 : 12));
  skill.repetitionCount = quality === 'hard' ? 0 : skill.repetitionCount + 1;
  const intervalIndex = quality === 'hard' ? 0 : Math.max(0, skill.repetitionCount - 1);
  skill.intervalDays = intervals[Math.min(intervalIndex, intervals.length - 1)] ?? 1;
  const review = new Date(occurredAt);
  review.setUTCDate(review.getUTCDate() + skill.intervalDays);
  skill.nextReviewAt = review.toISOString().slice(0, 10);
  skill.updatedAt = occurredAt;
}

function clone<T>(value: T): T { return value === null ? value : structuredClone(value); }
