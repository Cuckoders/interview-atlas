import type { AccountUser } from '@/types/account';

let accessToken: string | null = null;
let account: AccountUser | null = null;

export function setMemorySession(user: AccountUser, token: string): void {
  account = user;
  accessToken = token;
}

export function getMemoryAccessToken(): string | null { return accessToken; }
export function getMemoryAccount(): AccountUser | null { return account; }
export function getMemoryAccountId(): string | null { return account?.id ?? null; }

export function clearMemorySession(): void {
  accessToken = null;
  account = null;
}
