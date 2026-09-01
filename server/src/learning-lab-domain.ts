import type { Specialty } from './domain.js';

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type RunnerTest = { name: string; args: unknown[]; expected: unknown };
export type TaskRunnerConfig = {
  language: 'javascript';
  entrypoint: string;
  tests: RunnerTest[];
};

export type VideoProgress = {
  videoId: string;
  contentVersion: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  bestQuizScore: number | null;
  updatedAt: string;
};

export type QuizAttempt = {
  id: string;
  videoId: string;
  contentVersion: number;
  score: number;
  correctCount: number;
  totalCount: number;
  createdAt: string;
};

export type CodeTestResult = { name: string; passed: boolean; message?: string };
export type CodeRunResult = {
  passedCount: number;
  totalCount: number;
  durationMs: number;
  tests: CodeTestResult[];
};

export type TaskSubmission = CodeRunResult & {
  id: string;
  taskId: string;
  contentVersion: number;
  language: 'javascript';
  code: string;
  createdAt: string;
};

export type SimulationPrompt = {
  id: string;
  type: 'question' | 'task';
  title: string;
  statement?: string;
  tags: string[];
};
export type SimulationAnswer = { promptId: string; response: string; spentSeconds: number; answeredAt: string };
export type SimulationResult = {
  score: number;
  answeredCount: number;
  totalCount: number;
  strengths: string[];
  improvements: string[];
  summary: string;
};
export type InterviewSimulation = {
  id: string;
  specialty: Specialty;
  durationSeconds: number;
  status: 'active' | 'finished';
  prompts: SimulationPrompt[];
  answers: SimulationAnswer[];
  result: SimulationResult | null;
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
  updatedAt: string;
};

export function analyzeSimulation(simulation: InterviewSimulation): SimulationResult {
  const targetSeconds = simulation.durationSeconds / simulation.prompts.length;
  const scores = simulation.prompts.map((prompt) => {
    const answer = simulation.answers.find((item) => item.promptId === prompt.id);
    if (!answer) return { title: prompt.title, score: 0 };
    const length = answer.response.trim().length;
    const completeness = length >= 180 ? 100 : length >= 80 ? 75 : length >= 30 ? 50 : 25;
    const pace = answer.spentSeconds === 0 ? 25
      : answer.spentSeconds < 15 ? 75
      : answer.spentSeconds <= targetSeconds ? 100
      : answer.spentSeconds <= targetSeconds * 1.5 ? 75 : 50;
    const score = Math.round(completeness * 0.8 + pace * 0.2);
    return { title: prompt.title, score };
  });
  const score = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);
  const strengths = scores.filter((item) => item.score >= 75).map((item) => item.title).slice(0, 3);
  const improvements = scores.filter((item) => item.score < 75).map((item) => item.title).slice(0, 3);
  const answeredCount = simulation.answers.length;
  return {
    score, answeredCount, totalCount: simulation.prompts.length, strengths, improvements,
    summary: `Дано ${answeredCount} из ${simulation.prompts.length} ответов. Оценка отражает полноту и темп, а не гарантирует техническую правильность.`,
  };
}

export class LearningLabError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'LearningLabError';
  }
}
