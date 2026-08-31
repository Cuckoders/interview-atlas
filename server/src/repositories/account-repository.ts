import type { Account, AccountCredentials, CloudProgress, ProgressAction } from '../account-domain.js';

export type NewAccount = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

export type NewSession = {
  id: string;
  userId: string;
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  deviceName: string;
};

export type RotatedSession = Omit<NewSession, 'id' | 'userId' | 'deviceName'>;

export interface AccountRepository {
  createAccount(input: NewAccount): Promise<Account | null>;
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  findCredentialsById(id: string): Promise<AccountCredentials | null>;
  createSession(input: NewSession): Promise<void>;
  findAccountByAccessHash(accessHash: string): Promise<Account | null>;
  rotateSession(refreshHash: string, next: RotatedSession): Promise<Account | null>;
  revokeSession(accessHash: string): Promise<void>;
  getProgress(userId: string): Promise<CloudProgress>;
  applyActions(userId: string, actions: ProgressAction[]): Promise<{ progress: CloudProgress; acknowledgedIds: string[] }>;
  deleteAccount(userId: string): Promise<boolean>;
  close(): Promise<void>;
}
