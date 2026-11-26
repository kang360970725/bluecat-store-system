import { createHash } from 'node:crypto';

const CAPTURE_METADATA_KEYS = new Set([
  '__captured_at',
  'capturedAt',
  'crawledAt',
  'syncedAt'
]);

function canonicalBusinessValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalBusinessValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CAPTURE_METADATA_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalBusinessValue(item)])
  );
}

export function businessSourceHash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalBusinessValue(value)))
    .digest('hex');
}
