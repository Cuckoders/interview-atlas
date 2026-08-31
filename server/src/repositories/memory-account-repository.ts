import { applyProgressAction, type Account, type AccountCredentials, type CloudProgress, type ProgressAction } from '../account-domain.js';
import type { AccountRepository, NewAccount, NewSession, RotatedSession } from './account-repository.js';

type StoredSession = NewSession & { revokedAt: Date | null };

export class MemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountCredentials>();
  private readonly emailToId = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly progress = new Map<string, CloudProgress>();
  private readonly actionIds = new Map<string, Set<string>>();

  async createAccount(input: NewAccount): Promise<Account | null> {
    if (this.emailToId.has(input.email)) return null;
    const now = new Date().toISOString();
    const account: AccountCredentials = { ...input, createdAt: now };
    this.accounts.set(input.id, account);
    this.emailToId.set(input.email, input.id);
    this.progress.set(input.id, emptyProgress(now));
    this.actionIds.set(input.id, new Set());
    return publicAccount(account);
  }

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    const id = this.emailToId.get(email);
    return id ? this.accounts.get(id) ?? null : null;
  }

  async findCredentialsById(id: string): Promise<AccountCredentials | null> {
    return this.accounts.get(id) ?? null;
  }

  async createSession(input: NewSession): Promise<void> {
    this.sessions.set(input.id, { ...input, revokedAt: null });
  }

  async findAccountByAccessHash(accessHash: string): Promise<Account | null> {
    const session = [...this.sessions.values()].find((item) => item.accessHash === accessHash);
    if (!session || session.revokedAt || session.accessExpiresAt <= new Date()) return null;
    const account = this.accounts.get(session.userId);
    return account ? publicAccount(account) : null;
  }

  async rotateSession(refreshHash: string, next: RotatedSession): Promise<Account | null> {
    const session = [...this.sessions.values()].find((item) => item.refreshHash === refreshHash);
    if (!session || session.revokedAt || session.refreshExpiresAt <= new Date()) return null;
    session.accessHash = next.accessHash;
    session.refreshHash = next.refreshHash;
    session.accessExpiresAt = next.accessExpiresAt;
    session.refreshExpiresAt = next.refreshExpiresAt;
    const account = this.accounts.get(session.userId);
    return account ? publicAccount(account) : null;
  }

  async revokeSession(accessHash: string): Promise<void> {
    const session = [...this.sessions.values()].find((item) => item.accessHash === accessHash);
    if (session) session.revokedAt = new Date();
  }

  async getProgress(userId: string): Promise<CloudProgress> {
    return cloneProgress(this.progress.get(userId) ?? emptyProgress(new Date().toISOString()));
  }

  async applyActions(userId: string, actions: ProgressAction[]) {
    const known = this.actionIds.get(userId) ?? new Set<string>();
    const state = cloneProgress(this.progress.get(userId) ?? emptyProgress(new Date().toISOString()));
    const acknowledgedIds: string[] = [];
    for (const action of actions) {
      acknowledgedIds.push(action.id);
      if (known.has(action.id)) continue;
      known.add(action.id);
      applyProgressAction(state, action);
      state.version += 1;
    }
    state.updatedAt = new Date().toISOString();
    this.actionIds.set(userId, known);
    this.progress.set(userId, state);
    return { progress: cloneProgress(state), acknowledgedIds };
  }

  async deleteAccount(userId: string): Promise<boolean> {
    const account = this.accounts.get(userId);
    if (!account) return false;
    this.accounts.delete(userId);
    this.emailToId.delete(account.email);
    this.progress.delete(userId);
    this.actionIds.delete(userId);
    for (const [id, session] of this.sessions) if (session.userId === userId) this.sessions.delete(id);
    return true;
  }

  async close(): Promise<void> {}
}

function emptyProgress(now: string): CloudProgress {
  return { version: 0, specialty: 'Frontend', savedQuestionIds: [], savedVacancyIds: [], completedTaskIds: [], updatedAt: now };
}

function publicAccount(account: AccountCredentials): Account {
  const { passwordHash: _passwordHash, ...value } = account;
  return value;
}

function cloneProgress(progress: CloudProgress): CloudProgress {
  return {
    ...progress,
    savedQuestionIds: [...progress.savedQuestionIds],
    savedVacancyIds: [...progress.savedVacancyIds],
    completedTaskIds: [...progress.completedTaskIds],
  };
}
