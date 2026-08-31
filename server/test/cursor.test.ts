import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeCursor, encodeCursor, InvalidCursorError } from '../src/cursor.js';

test('cursor round-trip preserves the stable sort pair', () => {
  const cursor = { publishedAt: '2026-08-31T12:00:00.000Z', id: 'arbeitnow-example' };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test('invalid cursor is rejected', () => {
  assert.throws(() => decodeCursor('not-a-cursor'), InvalidCursorError);
});
