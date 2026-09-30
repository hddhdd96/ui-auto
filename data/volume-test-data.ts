/** 테스트 입력. 실환경 이름은 .env의 prefix로만 조합 */
export function buildVolumeName(prefix = process.env.TEST_RESOURCE_PREFIX ?? 'qa-'): string {
  const p = prefix.endsWith('-') ? prefix : `${prefix}-`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 12);
  return `${p}volume-${stamp}`;
}

export const DEFAULT_VOLUME_SIZE_GIB = 10;
