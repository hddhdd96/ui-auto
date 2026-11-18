import type { FailedTest } from './report';

export type Category = 'product' | 'test' | 'env';

export interface Rule {
  id: string;
  category: Category;
  /** 규칙이 맞을 때 판정 근거로 남길 설명 */
  description: string;
  /** 어떤 실패에나 맞기 쉬운 넓은 규칙. 반대 증거 판단에서 뺀다. */
  broad?: boolean;
  /** 맞으면 근거 문장 목록, 안 맞으면 null */
  match: (t: FailedTest) => string[] | null;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);
const first = (text: string) => text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';

/** 오류 메시지에서 기대값과 실제값을 뽑아 한 줄로 만든다. 없으면 첫 줄을 쓴다. */
function expectedVsReceived(text: string): string {
  const pick = (label: string) => text.match(new RegExp(`^\\s*${label}(?: string| value)?:\\s*(.+)$`, 'm'))?.[1]?.trim();
  const locator = text.match(/^Locator:\s*(.+)$/m)?.[1]?.trim();
  const expected = pick('Expected');
  const received = pick('Received');
  if (!expected && !received) return `오류 메시지: ${first(text)}`;
  return `${first(text)} → 기대: ${expected ?? '?'} / 실제: ${received ?? '?'}${locator ? ` (화면 요소: ${locator})` : ''}`;
}

/** 응답을 받지 못한 네트워크 오류 표시 */
const NETWORK = /socket hang up|ECONNRESET|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|Failed to fetch|^\[env\]/im;
/**
 * 화면 요소를 찾지 못했을 때 Playwright가 내는 메시지.
 * 'waiting for getByRole(...)'은 값을 확인하는 모든 assertion의 호출 로그에도 나오므로 근거로 쓰지 않는다.
 */
const LOCATOR = /strict mode violation|resolved to \d+ elements|element\(s\) not found|locator\.\w+: Timeout \d+ms exceeded|waitFor: Timeout \d+ms exceeded|Test timeout of \d+ms exceeded/;
/** 요소를 찾아서 실제 값을 받았다는 표시(Received: <element(s) not found>는 제외) */
const RECEIVED_VALUE = /Received(?: string| value)?:\s+(?!<element)\S/;
/** 테스트 코드 자체의 실행 오류 */
const CODE_ERROR = /^(TypeError|ReferenceError|SyntaxError)\b|is not a function|Cannot read properties of/m;

const networkRecords = (t: FailedTest) => t.http.filter((r) => r.status === 0);
const retryErrors = (t: FailedTest) => t.http.filter((r) => r.source === 'browser' && r.retry && r.status >= 400);

/**
 * 실패 원인 분류 규칙. 위에서부터 차례로 보고 처음 맞은 규칙으로 판정한다(env → test → product).
 * 환경 요인을 먼저 보는 이유: 네트워크가 끊기면 화면 요소도 못 찾고 응답 코드도 틀리게 보여서,
 * 뒤의 규칙들이 잘못 맞기 때문이다.
 */
export const RULES: Rule[] = [
  // ---------- env ----------
  {
    id: 'ENV-PORTAL-MODE', category: 'env', description: '테스트가 기대한 포털 실행 모드와 실제 모드가 다름(실행 환경 설정 문제)',
    match: (t) => (has(t.message, /포털 모드.*다릅니다/) ? [first(t.message)] : null),
  },
  {
    id: 'ENV-PORTAL-DOWN', category: 'env', description: '포털에 연결할 수 없음(포털이 떠 있지 않거나 주소가 틀림)',
    match: (t) => (has(t.message, /ECONNREFUSED|connect ECONNREFUSED|webServer/) ? [first(t.message)] : null),
  },
  {
    id: 'ENV-NETWORK', category: 'env', description: '응답을 받지 못한 네트워크 오류(연결 끊김)',
    match: (t) => {
      const records = networkRecords(t);
      const drops = t.flakyEvents.filter((e) => e.type === 'network-drop');
      if (!has(t.message, NETWORK) && records.length === 0) return null;
      // 화면 요소를 못 찾은 실패라도, 그 테스트 중 네트워크 오류가 있었으면 환경 요인으로 본다.
      if (!has(t.message, NETWORK) && !has(t.message, LOCATOR)) return null;
      return [
        has(t.message, NETWORK) ? `오류 메시지: ${first(t.message)}` : '화면 요소 대기 중 실패',
        ...(records.length ? [`응답 없는 요청 ${records.length}건: ${records.slice(0, 3).map((r) => `${r.method} ${r.path}`).join(', ')}`] : []),
        ...(drops.length ? [`포털이 연결을 끊은 기록 ${drops.length}건`] : []),
      ];
    },
  },
  {
    id: 'ENV-AUTH-TOKEN', category: 'env', description: '쓰던 인증 토큰이 바뀌거나 만료돼 401·403을 받음(제품 결함이 아닌 세션 문제)',
    match: (t) => {
      if (!has(t.message, /Received:\s*40[13]\b/)) return null;
      // 인증·권한을 검증하는 테스트에서 401·403은 제품 동작이므로 여기서 다루지 않는다.
      if (t.tags.some((tag) => ['@auth', '@permission'].includes(tag))) return null;
      const extended = t.http.some((r) => r.path === '/auth/extend' && r.status === 200);
      const rotated = t.flakyEvents.some((e) => e.type === 'token-rotate');
      if (!extended && !rotated) return null;
      return [
        `오류 메시지: ${first(t.message)}`,
        ...(extended ? ['실패 전에 세션 연장(POST /auth/extend)이 있었음'] : []),
        ...(rotated ? ['포털이 세션 연장 때 토큰을 교체한 기록이 있음'] : []),
      ];
    },
  },
  // ---------- test ----------
  {
    id: 'TEST-DATASET', category: 'test', description: '테스트 dataset 형식 오류',
    match: (t) => (has(t.message, /dataset 형식 오류|자리표시자/) ? [first(t.message)] : null),
  },
  {
    id: 'TEST-CODE-ERROR', category: 'test', description: '테스트 코드 실행 오류(타입 오류, 없는 속성 접근 등)',
    match: (t) => (has(t.message, CODE_ERROR) ? [first(t.message)] : null),
  },
  {
    id: 'TEST-DATA-CONFLICT', category: 'test', description: '테스트가 준비한 데이터가 기존 데이터와 충돌(이름 중복)',
    match: (t) => {
      const conflict = t.http.find((r) => r.method === 'POST' && r.status === 409 && r.errorCode === 'DUPLICATE_NAME');
      if (!conflict || !has(t.message, /DUPLICATE_NAME|요청이 거부됐습니다/)) return null;
      return [`${conflict.method} ${conflict.path} → 409 DUPLICATE_NAME`, first(t.message)];
    },
  },
  {
    id: 'TEST-RESPONSE-PAIRING', category: 'test', description: '다른 요청(재전송)의 응답을 현재 단계의 결과로 해석함(요청-응답 짝짓기 오류)',
    match: (t) => {
      const retries = retryErrors(t);
      if (retries.length === 0 || !has(t.message, /Received:?\s*(400|4\d\d)|4xx/)) return null;
      return [
        `오류 메시지: ${first(t.message)}`,
        `화면에 보이지 않는 재전송 요청의 4xx 응답 ${retries.length}건: ${retries.map((r) => `${r.method} ${r.path} ${r.status}`).join(', ')}`,
      ];
    },
  },
  {
    id: 'TEST-FIXED-WAIT', category: 'test', description: '고정 시간 대기 후 바로 판정함(실제 작업이 끝났는지 확인하지 않음)',
    match: (t) => {
      if (!t.source.includes('waitForTimeout(') || !has(t.message, /Expected|Received/)) return null;
      const injected = t.flakyEvents.filter((e) => ['delete-lag', 'ui-stale'].includes(e.type));
      return [
        '테스트 코드가 waitForTimeout으로 고정 시간을 기다린 뒤 판정함',
        `오류 메시지: ${first(t.message)}`,
        ...(injected.length ? [`그 사이 포털이 작업 완료나 화면 갱신을 늦춘 기록: ${injected.map((e) => e.detail).join(' / ')}`] : []),
      ];
    },
  },
  {
    id: 'TEST-LOCATOR', category: 'test', description: '화면 요소를 찾지 못함(locator가 틀렸거나 여러 개에 맞음)',
    match: (t) => (has(t.message, LOCATOR) && !has(t.message, RECEIVED_VALUE) ? [expectedVsReceived(t.message)] : null),
  },
  // ---------- product ----------
  {
    id: 'PRODUCT-ERROR-STATE', category: 'product', description: '리소스가 실패 상태(ERROR·FAILED)로 끝남',
    match: (t) => {
      const error = t.polls.find((p) => p.observed === 'ERROR' || p.observed === 'FAILED');
      if (!has(t.message, /실패 상태를 확인해 대기를 중단/) && !error) return null;
      return [expectedVsReceived(t.message), ...(error ? [`폴링 이력: ${error.what} → ${error.observed}`] : [])];
    },
  },
  {
    id: 'PRODUCT-API-CONTRACT', category: 'product', description: 'API 응답 코드·오류 코드가 입력 규칙과 다름',
    match: (t) => (has(t.message, /응답 코드|오류 코드|"status":\s*\d{3}|status:\s*\d{3}/) && has(t.message, /Expected/) ? [expectedVsReceived(t.message)] : null),
  },
  {
    id: 'PRODUCT-UI-MISMATCH', category: 'product', description: '화면에 표시된 값이 실제 상태와 다름',
    match: (t) => (has(t.message, /toHaveText|toHaveCount|toHaveValue/) && has(t.message, RECEIVED_VALUE) ? [expectedVsReceived(t.message)] : null),
  },
  {
    id: 'PRODUCT-ASSERTION', category: 'product', broad: true, description: '제품이 돌려준 값이 기대값과 다름',
    match: (t) => (has(t.message, /Expected|Received|expect\(/) ? [expectedVsReceived(t.message)] : null),
  },
];
