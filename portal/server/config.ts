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

/** 0~1 사이 확률. 개별 값이 없으면 FLAKY_RATE(전체 기본 확률)를 쓴다. */
function rate(name: string, fallback: number): number {
  const raw = process.env[name] ?? process.env.FLAKY_RATE;
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`환경변수 ${name} 값은 0~1 사이여야 합니다: ${raw}`);
  }
  return value;
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
  /**
   * Flaky 주입 모드. 실무에서 테스트가 회차마다 다른 결과를 낸 원인 구조를 재현한다. 기본값은 모두 꺼짐이다.
   * 확률은 시드를 고정한 난수로 정하므로, 같은 시드와 같은 요청 순서면 같은 결과가 나온다.
   */
  flaky: {
    /** 난수 시드. 지정하지 않으면 실행할 때마다 달라진다. */
    seed: num('FLAKY_SEED', Math.floor(Math.random() * 1_000_000)),
    /** ① 볼륨 그룹 삭제: 응답은 바로 성공이지만 DELETING이 길게 유지되고, 재전송된 삭제가 늦게 400을 받는다. */
    deleteLag: {
      enabled: flag('FLAKY_DELETE_LAG'),
      /** DELETING을 길게 유지할 확률 */
      rate: rate('FLAKY_DELETE_LAG_RATE', 0.5),
      /** DELETING을 유지하는 시간(ms) */
      lagMs: num('FLAKY_DELETE_LAG_MS', 1500),
      /** 콘솔에 재전송을 지시해 늦은 400을 만들 확률 */
      late400Rate: rate('FLAKY_DELETE_LATE_400_RATE', 0.5),
    },
    /** ② 보안 그룹 삭제: 처리가 늦어지고, 재전송된 삭제의 400 응답이 다음 단계 도중에 늦게 도착한다. */
    lateResponse: {
      enabled: flag('FLAKY_LATE_RESPONSE'),
      rate: rate('FLAKY_LATE_RESPONSE_RATE', 0.5),
      /** 삭제 처리를 늦추는 시간(ms). 재전송 응답은 이 시간의 절반만큼 늦게 보낸다. */
      delayMs: num('FLAKY_LATE_RESPONSE_MS', 800),
    },
  },
};

export type PortalConfig = typeof config;
