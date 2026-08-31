import { Platform } from 'react-native';

import {
  clearMemorySession,
  getMemoryAccessToken,
  setMemorySession,
} from '@/services/session-memory';
import { deleteRefreshToken, readRefreshToken, writeRefreshToken } from '@/services/session-storage';
import type { AccountUser, CloudProgress, ProgressAction, SessionResponse } from '@/types/account';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '')
  ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://127.0.0.1:4000');
let refreshPromise: Promise<SessionResponse> | null = null;

export class ApiAccountError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export async function registerAccount(input: {
  email: string; password: string; displayName: string; deviceName: string;
}): Promise<AccountUser> {
  const session = await publicRequest<SessionResponse>('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) });
  await commitSession(session);
  return session.user;
}

export async function loginAccount(input: {
  email: string; password: string; deviceName: string;
}): Promise<AccountUser> {
  const session = await publicRequest<SessionResponse>('/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });
  await commitSession(session);
  return session.user;
}

export async function restoreAccountSession(): Promise<AccountUser | null> {
  if (!(await readRefreshToken())) return null;
  try {
    return (await refreshSession()).user;
  } catch {
    await clearLocalSession();
    return null;
  }
}

export async function logoutAccount(): Promise<void> {
  try { await authorizedRequest('/v1/auth/logout', { method: 'POST' }); } catch {}
  await clearLocalSession();
}

export async function deleteAccount(password: string): Promise<void> {
  await authorizedRequest('/v1/account', { method: 'DELETE', body: JSON.stringify({ password }) });
  await clearLocalSession();
}

export function exportAccountData(): Promise<unknown> {
  return authorizedRequest('/v1/account/export');
}

export function fetchCloudProgress(): Promise<CloudProgress> {
  return authorizedRequest('/v1/sync');
}

export function pushProgressActions(actions: ProgressAction[]): Promise<{
  progress: CloudProgress; acknowledgedIds: string[];
}> {
  return authorizedRequest('/v1/sync/actions', { method: 'POST', body: JSON.stringify({ actions }) });
}

async function authorizedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = getMemoryAccessToken();
  if (!token) token = (await refreshSession()).accessToken;
  let response = await fetch(`${API_URL}${path}`, withHeaders(init, token));
  if (response.status === 401) {
    const newerToken = getMemoryAccessToken();
    token = newerToken && newerToken !== token ? newerToken : (await refreshSession()).accessToken;
    response = await fetch(`${API_URL}${path}`, withHeaders(init, token));
  }
  return parseResponse<T>(response);
}

async function refreshSession(): Promise<SessionResponse> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) throw new ApiAccountError('signed_out', 'Требуется вход', 401);
    try {
      const session = await publicRequest<SessionResponse>('/v1/auth/refresh', {
        method: 'POST', body: JSON.stringify({ refreshToken }),
      });
      await commitSession(session);
      return session;
    } catch (error) {
      await clearLocalSession();
      throw error;
    }
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}

async function publicRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, withHeaders(init));
  return parseResponse<T>(response);
}

function withHeaders(init: RequestInit, token?: string): RequestInit {
  return {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiAccountError(
      body?.error?.code ?? 'request_failed',
      body?.error?.message ?? 'Не удалось выполнить запрос',
      response.status,
    );
  }
  return body as T;
}

async function commitSession(session: SessionResponse): Promise<void> {
  if (!session.user?.id || !session.accessToken || !session.refreshToken) {
    throw new ApiAccountError('invalid_response', 'Backend вернул некорректную сессию', 502);
  }
  await writeRefreshToken(session.refreshToken);
  setMemorySession(session.user, session.accessToken);
}

async function clearLocalSession(): Promise<void> {
  clearMemorySession();
  await deleteRefreshToken();
}
