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

function flag(name: string): boolean {
  const raw = (process.env[name] ?? '').toLowerCase();
  if (raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  throw new Error(`환경변수 ${name}는 true 또는 false여야 합니다: ${raw}`);
}

export const config = {
  port: num('PORTAL_PORT', 4173),
  /** CREATING → ACTIVE 같은 상태 전이에 걸리는 시간(ms) */
  transitionDelayMs: num('TRANSITION_DELAY_MS', 1000),
  /** 로그인 토큰 유효 시간(초). 짧게 줄이면 실행 중 세션 만료를 재현할 수 있다. */
  tokenTtlSec: num('TOKEN_TTL_SEC', 3600),
  /**
   * 결함 주입 모드. 실무에서 겪은 결함 유형을 같은 원인 구조로 재현한다. 기본값은 모두 꺼짐(정상 동작)이다.
   */
  defects: {
    /** 쿼터를 넘는 인스턴스 생성을 API가 거부하지 않고 접수해, 인스턴스가 ERROR로 생성된다. */
    quotaApiBypass: flag('DEFECT_QUOTA_API_BYPASS'),
    /** 무중단 사양 변경 후 실제 사양은 바뀌지만, 포털에 표시되는 사양 이름은 갱신되지 않는다. */
    resizeMismatch: flag('DEFECT_RESIZE_MISMATCH'),
  },
};

export type PortalConfig = typeof config;
