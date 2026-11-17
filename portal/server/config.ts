/** 환경변수로 조절하는 포털 설정. 기본값은 모두 '정상 동작'이다. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`환경변수 ${name} 값이 올바르지 않습니다: ${raw}`);
  }
  return value;
}

export const config = {
  port: num('PORTAL_PORT', 4173),
  /** CREATING → ACTIVE 같은 상태 전이에 걸리는 시간(ms) */
  transitionDelayMs: num('TRANSITION_DELAY_MS', 1000),
  /** 로그인 토큰 유효 시간(초). 짧게 줄이면 실행 중 세션 만료를 재현할 수 있다. */
  tokenTtlSec: num('TOKEN_TTL_SEC', 3600),
};

export type PortalConfig = typeof config;
