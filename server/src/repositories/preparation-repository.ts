import type {
  CompletionAction,
  PreparationProfile,
  SkillMastery,
  WeeklyPlan,
} from '../preparation-domain.js';

export type ProfileInput = Omit<PreparationProfile, 'diagnosticCompletedAt' | 'updatedAt'>;

export interface PreparationRepository {
  getProfile(userId: string): Promise<PreparationProfile | null>;
  saveProfile(userId: string, profile: ProfileInput): Promise<PreparationProfile>;
  getSkills(userId: string): Promise<SkillMastery[]>;
  saveDiagnostic(userId: string, specialty: PreparationProfile['specialty'], ratings: Record<string, number>): Promise<SkillMastery[]>;
  getPlan(userId: string): Promise<WeeklyPlan | null>;
  savePlan(userId: string, plan: WeeklyPlan): Promise<WeeklyPlan>;
  applyCompletion(userId: string, action: CompletionAction): Promise<'applied' | 'duplicate' | 'not_found'>;
  close(): Promise<void>;
}
