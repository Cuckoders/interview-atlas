import type { Specialty } from '@/types/domain';

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};
export type CloudProgress = {
  version: number;
  specialty: Specialty;
  savedQuestionIds: string[];
  savedVacancyIds: string[];
  completedTaskIds: string[];
  updatedAt: string;
};

export type ProgressAction = {
  id: string;
  type: 'set_specialty' | 'set_question_saved' | 'set_vacancy_saved' | 'set_task_completed';
  targetId?: string;
  value: Specialty | boolean;
  occurredAt: string;
};

export type SessionResponse = {
  user: AccountUser;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};
