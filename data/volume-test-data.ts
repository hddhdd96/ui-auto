import { randomUUID } from 'node:crypto';

export function buildVolumeName(prefix = process.env.TEST_RESOURCE_PREFIX ?? 'qa-'): string {
  const normalizedPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;
  return `${normalizedPrefix}volume-${randomUUID()}`;
}
export const DEFAULT_VOLUME_SIZE_GIB = 10;
