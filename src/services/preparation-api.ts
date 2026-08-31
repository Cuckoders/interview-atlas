import { authorizedRequest } from '@/services/account-api';
import type {
  CompletionQuality,
  PreparationProfileInput,
  PreparationSnapshot,
} from '@/types/preparation';

export function fetchPreparation(): Promise<PreparationSnapshot> {
  return authorizedRequest('/v1/preparation');
}
export function updatePreparationProfile(profile: PreparationProfileInput): Promise<PreparationSnapshot> {
  return authorizedRequest('/v1/preparation/profile', { method: 'PUT', body: JSON.stringify(profile) });
}
export function submitDiagnostic(ratings: Record<string, number>): Promise<PreparationSnapshot> {
  return authorizedRequest('/v1/preparation/diagnostic', { method: 'POST', body: JSON.stringify({ ratings }) });
}
export function submitSessionCompletion(sessionId: string, actionId: string, quality: CompletionQuality, occurredAt: string): Promise<PreparationSnapshot> {
  return authorizedRequest(`/v1/preparation/sessions/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST', body: JSON.stringify({ actionId, quality, occurredAt }),
  });
}
export function regeneratePreparationPlan(): Promise<PreparationSnapshot> {
  return authorizedRequest('/v1/preparation/plan/regenerate', { method: 'POST' });
}
