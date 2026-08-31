import { authorizedRequest } from '@/services/account-api';
import type {
  SavedVacancySearch,
  SavedVacancySearchInput,
  SavedVacancyStatus,
  VacancyAlertCheck,
  VacancyMatch,
  VacancyPreparationPlan,
} from '@/types/vacancy-intelligence';

export function fetchSavedSearches() { return authorizedRequest<SavedVacancySearch[]>('/v1/vacancy-searches'); }
export function createSavedSearch(input: SavedVacancySearchInput) {
  return authorizedRequest<SavedVacancySearch>('/v1/vacancy-searches', { method: 'POST', body: JSON.stringify(input) });
}
export function updateSavedSearch(id: string, input: SavedVacancySearchInput) {
  return authorizedRequest<SavedVacancySearch>(`/v1/vacancy-searches/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(input),
  });
}
export function deleteSavedSearch(id: string) {
  return authorizedRequest<void>(`/v1/vacancy-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function checkSavedSearches(force = false) {
  return authorizedRequest<VacancyAlertCheck>('/v1/vacancy-searches/check', {
    method: 'POST', body: JSON.stringify({ force }),
  });
}
export function fetchVacancyMatch(id: string) {
  return authorizedRequest<VacancyMatch>(`/v1/vacancies/${encodeURIComponent(id)}/match`);
}
export function fetchVacancyPreparationPlan(id: string) {
  return authorizedRequest<{ plan: VacancyPreparationPlan | null }>(`/v1/vacancies/${encodeURIComponent(id)}/preparation-plan`);
}
export function generateVacancyPreparationPlan(id: string) {
  return authorizedRequest<VacancyPreparationPlan>(`/v1/vacancies/${encodeURIComponent(id)}/preparation-plan`, { method: 'POST' });
}
export function fetchSavedVacancyStatuses() {
  return authorizedRequest<{ items: SavedVacancyStatus[] }>('/v1/saved-vacancies/status');
}
export function acknowledgeSavedVacancyStatus(id: string) {
  return authorizedRequest<SavedVacancyStatus>(`/v1/saved-vacancies/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
}
