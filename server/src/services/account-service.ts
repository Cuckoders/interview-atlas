import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';

import {
  AccountError,
  type Account,
  type CloudProgress,
  type ProgressAction,
  type SessionTokens,
} from '../account-domain.js';
import type { AccountRepository } from '../repositories/account-repository.js';

const DUMMY_SALT = 'interview-atlas-invalid-account';

export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly accessTtlMs = 15 * 60_000,
    private readonly refreshTtlMs = 30 * 24 * 60 * 60_000,
  ) {}

  async register(input: { email: string; displayName: string; password: string; deviceName: string }) {
    const passwordHash = await hashPassword(input.password);
    const account = await this.repository.createAccount({
      id: randomUUID(),
      email: normalizeEmail(input.email),
      displayName: input.displayName.trim(),
      passwordHash,
    });
    if (!account) throw new AccountError('email_in_use', 'Аккаунт с таким email уже существует', 409);
    try {
      const tokens = await this.issueSession(account.id, input.deviceName);
      return { user: account, ...tokens };
    } catch (error) {
      await this.repository.deleteAccount(account.id).catch(() => false);
      throw error;
    }
  }

  async login(input: { email: string; password: string; deviceName: string }) {
    const credentials = await this.repository.findCredentialsByEmail(normalizeEmail(input.email));
    const valid = credentials
      ? await verifyPassword(input.password, credentials.passwordHash)
      : await verifyAgainstDummy(input.password);
    if (!credentials || !valid) throw new AccountError('invalid_credentials', 'Неверный email или пароль', 401);
    const tokens = await this.issueSession(credentials.id, input.deviceName);
    const { passwordHash: _passwordHash, ...user } = credentials;
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const tokens = createTokens(this.accessTtlMs, this.refreshTtlMs);
    const account = await this.repository.rotateSession(tokenHash(refreshToken), {
      accessHash: tokenHash(tokens.accessToken),
      refreshHash: tokenHash(tokens.refreshToken),
      accessExpiresAt: new Date(tokens.accessExpiresAt),
      refreshExpiresAt: new Date(tokens.refreshExpiresAt),
    });
    if (!account) throw new AccountError('invalid_session', 'Сессия истекла. Войдите снова', 401);
    return { user: account, ...tokens };
  }

  async authenticate(authorization: string | undefined): Promise<{ user: Account; accessHash: string }> {
    const token = parseBearer(authorization);
    const accessHash = tokenHash(token);
    const user = await this.repository.findAccountByAccessHash(accessHash);
    if (!user) throw new AccountError('invalid_session', 'Требуется вход в аккаунт', 401);
    return { user, accessHash };
  }

  async logout(accessHash: string): Promise<void> {
    await this.repository.revokeSession(accessHash);
  }

  async progress(userId: string): Promise<CloudProgress> {
    return this.repository.getProgress(userId);
  }

  async sync(userId: string, actions: ProgressAction[]) {
    const now = Date.now();
    for (const action of actions) {
      const occurredAt = Date.parse(action.occurredAt);
      if (occurredAt < now - 365 * 24 * 60 * 60_000 || occurredAt > now + 5 * 60_000) {
        throw new AccountError('invalid_action_time', 'Некорректное время offline-действия', 400);
      }
    }
    return this.repository.applyActions(userId, actions);
  }

  async exportData(user: Account) {
    return { exportedAt: new Date().toISOString(), account: user, progress: await this.repository.getProgress(user.id) };
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const credentials = await this.repository.findCredentialsById(userId);
    if (!credentials || !(await verifyPassword(password, credentials.passwordHash))) {
      throw new AccountError('invalid_credentials', 'Пароль не подошёл', 401);
    }
    if (!(await this.repository.deleteAccount(userId))) {
      throw new AccountError('account_not_found', 'Аккаунт уже удалён', 404);
    }
  }

  async close(): Promise<void> { await this.repository.close(); }

  private async issueSession(userId: string, deviceName: string): Promise<SessionTokens> {
    const tokens = createTokens(this.accessTtlMs, this.refreshTtlMs);
    await this.repository.createSession({
      id: randomUUID(),
      userId,
      accessHash: tokenHash(tokens.accessToken),
      refreshHash: tokenHash(tokens.refreshToken),
      accessExpiresAt: new Date(tokens.accessExpiresAt),
      refreshExpiresAt: new Date(tokens.refreshExpiresAt),
      deviceName: deviceName.trim(),
    });
    return tokens;
  }
}

function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

function createTokens(accessTtlMs: number, refreshTtlMs: number): SessionTokens {
  const now = Date.now();
  return {
    accessToken: randomBytes(32).toString('base64url'),
    accessExpiresAt: new Date(now + accessTtlMs).toISOString(),
    refreshToken: randomBytes(48).toString('base64url'),
    refreshExpiresAt: new Date(now + refreshTtlMs).toISOString(),
  };
}

function parseBearer(value: string | undefined): string {
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/);
  if (!match?.[1]) throw new AccountError('invalid_session', 'Требуется вход в аккаунт', 401);
  return match[1];
}

function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scryptPassword(password, salt);
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, salt, expectedValue] = encoded.split('$');
  if (!salt || !expectedValue) return verifyAgainstDummy(password);
  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = await scryptPassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function verifyAgainstDummy(password: string): Promise<boolean> {
  await scryptPassword(password, DUMMY_SALT);
  return false;
}

function scryptPassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
