import type { VacancyCursor } from './domain.js';

export function encodeCursor(cursor: VacancyCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value?: string): VacancyCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' && parsed !== null &&
      'publishedAt' in parsed && typeof parsed.publishedAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.publishedAt)) &&
      'id' in parsed && typeof parsed.id === 'string' && parsed.id.length > 0
    ) {
      return { publishedAt: parsed.publishedAt, id: parsed.id };
    }
  } catch {
    // Ошибка преобразуется в единый безопасный ответ ниже.
  }
  throw new InvalidCursorError();
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Некорректный cursor');
    this.name = 'InvalidCursorError';
  }
}
