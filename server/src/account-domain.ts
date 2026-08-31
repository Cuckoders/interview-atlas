import type { Specialty } from './domain.js';

export type Account = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type AccountCredentials = Account & { passwordHash: string };

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
  value: string | boolean;
  occurredAt: string;
};

export type SessionTokens = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

export function applyProgressAction(state: CloudProgress, action: ProgressAction): void {
  if (action.type === 'set_specialty' && typeof action.value === 'string') {
    state.specialty = action.value as CloudProgress['specialty'];
    return;
  }
  if (!action.targetId || typeof action.value !== 'boolean') return;
  const field = action.type === 'set_question_saved'
    ? 'savedQuestionIds'
    : action.type === 'set_vacancy_saved'
      ? 'savedVacancyIds'
      : 'completedTaskIds';
  const values = new Set(state[field]);
  if (action.value) values.add(action.targetId);
  else values.delete(action.targetId);
  state[field] = [...values].sort();
}

export class AccountError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}
