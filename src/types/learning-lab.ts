import type { Specialty } from '@/types/domain';

export type VideoProgress = {
  videoId: string; contentVersion: number; positionSeconds: number; durationSeconds: number; completed: boolean;
  bestQuizScore: number | null; updatedAt: string;
};
export type QuizResult = {
  id: string; videoId: string; contentVersion: number; score: number; correctCount: number; totalCount: number; createdAt: string;
  results: { questionId: string; correct: boolean; correctIndex: number; explanation: string }[];
};
export type TaskSubmission = {
  id: string; taskId: string; contentVersion: number; language: 'javascript'; code: string; passedCount: number; totalCount: number;
  durationMs: number; tests: { name: string; passed: boolean; message?: string }[]; createdAt: string;
};
export type SimulationPrompt = { id: string; type: 'question' | 'task'; title: string; statement?: string; tags: string[] };
export type SimulationAnswer = { promptId: string; response: string; spentSeconds: number; answeredAt: string };
export type SimulationResult = {
  score: number; answeredCount: number; totalCount: number; strengths: string[]; improvements: string[]; summary: string;
};
export type InterviewSimulation = {
  id: string; specialty: Specialty; durationSeconds: number; status: 'active' | 'finished';
  prompts: SimulationPrompt[]; answers: SimulationAnswer[]; result: SimulationResult | null;
  startedAt: string; endsAt: string; finishedAt: string | null; updatedAt: string;
  serverNow?: string; clockOffsetMs?: number;
};
