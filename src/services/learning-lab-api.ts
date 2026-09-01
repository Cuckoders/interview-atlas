import { authorizedRequest } from '@/services/account-api';
import type { Specialty } from '@/types/domain';
import type { InterviewSimulation, QuizResult, TaskSubmission, VideoProgress } from '@/types/learning-lab';

export function fetchVideoProgress(videoId: string, contentVersion: number) {
  return authorizedRequest<VideoProgress | null>(`/v1/learning/videos/${encodeURIComponent(videoId)}/progress?contentVersion=${contentVersion}`);
}
export function saveVideoProgress(videoId: string, contentVersion: number, positionSeconds: number, durationSeconds: number, completed: boolean) {
  return authorizedRequest<VideoProgress>(`/v1/learning/videos/${encodeURIComponent(videoId)}/progress`, {
    method: 'PUT', body: JSON.stringify({ contentVersion, positionSeconds, durationSeconds, completed }),
  });
}
export function submitVideoQuiz(videoId: string, contentVersion: number, answers: { questionId: string; optionIndex: number }[]) {
  return authorizedRequest<QuizResult>(`/v1/learning/videos/${encodeURIComponent(videoId)}/quiz`, {
    method: 'POST', body: JSON.stringify({ contentVersion, answers }),
  });
}
export function runTaskCode(taskId: string, contentVersion: number, code: string) {
  return authorizedRequest<TaskSubmission>(`/v1/learning/tasks/${encodeURIComponent(taskId)}/run`, {
    method: 'POST', body: JSON.stringify({ contentVersion, code }),
  });
}
export function fetchTaskSubmissions(taskId: string) {
  return authorizedRequest<TaskSubmission[]>(`/v1/learning/tasks/${encodeURIComponent(taskId)}/submissions`);
}
export function startInterviewSimulation(specialty: Specialty, durationMinutes: number) {
  return withClockOffset(() => authorizedRequest<InterviewSimulation>('/v1/learning/simulations', {
    method: 'POST', body: JSON.stringify({ specialty, durationMinutes }),
  }));
}
export function fetchInterviewSimulation(id: string) {
  return withClockOffset(() => authorizedRequest<InterviewSimulation>(`/v1/learning/simulations/${encodeURIComponent(id)}`));
}
export function saveSimulationAnswer(id: string, input: { promptId: string; response: string; spentSeconds: number }) {
  return withClockOffset(() => authorizedRequest<InterviewSimulation>(`/v1/learning/simulations/${encodeURIComponent(id)}/answer`, {
    method: 'PUT', body: JSON.stringify(input),
  }));
}
export function finishInterviewSimulation(id: string, answer?: { promptId: string; response: string; spentSeconds: number }) {
  return withClockOffset(() => authorizedRequest<InterviewSimulation>(`/v1/learning/simulations/${encodeURIComponent(id)}/finish`, {
    method: 'POST', body: JSON.stringify(answer ? { answer } : {}),
  }));
}

async function withClockOffset(request: () => Promise<InterviewSimulation>): Promise<InterviewSimulation> {
  const startedAt = Date.now();
  const value = await request();
  const receivedAt = Date.now();
  const serverNow = value.serverNow ? Date.parse(value.serverNow) : Number.NaN;
  return Number.isFinite(serverNow) ? { ...value, clockOffsetMs: serverNow - (startedAt + receivedAt) / 2 } : value;
}
