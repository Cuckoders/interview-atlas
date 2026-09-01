import type {
  InterviewSimulation, QuizAttempt, SimulationAnswer, TaskSubmission, VideoProgress,
} from '../learning-lab-domain.js';

export interface LearningLabRepository {
  getVideoProgress(userId: string, videoId: string, contentVersion: number): Promise<VideoProgress | null>;
  upsertVideoProgress(userId: string, progress: VideoProgress): Promise<VideoProgress>;
  saveQuizResult(userId: string, attempt: QuizAttempt, progress: VideoProgress): Promise<VideoProgress>;
  listQuizAttempts(userId: string): Promise<QuizAttempt[]>;
  listVideoProgress(userId: string): Promise<VideoProgress[]>;
  saveSubmission(userId: string, submission: TaskSubmission): Promise<void>;
  listSubmissions(userId: string, taskId: string, limit: number): Promise<TaskSubmission[]>;
  listAllSubmissions(userId: string): Promise<TaskSubmission[]>;
  createSimulation(userId: string, simulation: InterviewSimulation): Promise<InterviewSimulation>;
  getSimulation(userId: string, id: string): Promise<InterviewSimulation | null>;
  saveSimulationAnswer(userId: string, id: string, answer: SimulationAnswer): Promise<InterviewSimulation | null>;
  finishSimulation(userId: string, id: string, finishedAt: string, finalAnswer?: SimulationAnswer): Promise<InterviewSimulation | null>;
  listSimulations(userId: string): Promise<InterviewSimulation[]>;
  close(): Promise<void>;
}
