import type { Category } from '../triage/types';

/**
 * 일부러 만든 실패와 정답 분류. 분류기에는 이 파일의 내용(정답·설명)을 넘기지 않는다.
 * - tuning(15): 처음 측정하고 분류기를 개선할 때 결과를 본 케이스
 * - holdout(6): 개선 작업 전에 정답을 고정한 새 케이스. 개선 효과는 이 세트로 확인한다(외운 결과 방지).
 * - product: 테스트는 맞고 데모 서버가 잘못 동작 (DEMO_FAULT)
 * - script: 서버는 정상이고 테스트 코드가 잘못됨 (tests/triage-lab/volume-regression.spec.ts)
 * - environment: 테스트·서버는 맞고 실행 환경이 문제
 */
export type LabCase = {
  id: string;
  expected: Exclude<Category, 'unknown'>;
  description: string;
  args: string[];
  env?: Record<string, string>;
  /** 본 실행 전에 필요한 준비 실행(예: 세션 파일 만들기). */
  prepare?: { args: string[]; env?: Record<string, string> };
  /** 본 실행 직전에 지울 파일(저장소 루트 기준). */
  removeFiles?: string[];
  set?: 'tuning' | 'holdout';
};

export const caseSet = (labCase: LabCase) => labCase.set ?? 'tuning';

const lifecycle = ['--project=chromium'];
const lab = (tag: string) => ['--project=triage-lab', '--grep', tag];

export const LAB_CASES: LabCase[] = [
  { id: 'P1', expected: 'product', description: '생성된 볼륨 상태가 INACTIVE', args: lifecycle, env: { DEMO_FAULT: 'status-inactive' } },
  { id: 'P2', expected: 'product', description: '요청보다 1GiB 큰 볼륨이 생성됨', args: lifecycle, env: { DEMO_FAULT: 'size-off-by-one' } },
  { id: 'P3', expected: 'product', description: '삭제 API가 204를 반환하지만 실제로 지우지 않음', args: lifecycle, env: { DEMO_FAULT: 'delete-noop' } },
  { id: 'P4', expected: 'product', description: '목록 API가 같은 볼륨을 중복 반환', args: lifecycle, env: { DEMO_FAULT: 'list-duplicates' } },
  { id: 'P5', expected: 'product', description: '생성 API가 500 반환', args: lifecycle, env: { DEMO_FAULT: 'create-500' } },

  { id: 'S1', expected: 'script', description: '버튼 접근성 이름 대소문자 오타(Create Volume)', args: lab('@reg-01') },
  { id: 'S2', expected: 'script', description: '입력한 크기(10)와 다른 기대값(20)을 검증', args: lab('@reg-02') },
  { id: 'S3', expected: 'script', description: '행 범위 없이 Delete 버튼을 찾아 strict mode 위반', args: lab('@reg-03') },
  { id: 'S4', expected: 'script', description: '고정 이름 테스트 데이터를 재사용해 중복 생성(409)', args: lab('@reg-04') },
  { id: 'S5', expected: 'script', description: '테스트 코드의 API 경로 오타(/api/v1/volume)', args: lab('@reg-05') },

  {
    id: 'E1', expected: 'environment', description: '대상 서버가 기동되지 않음(연결 거부)', args: lifecycle,
    env: { BASE_URL: 'http://127.0.0.1:4999', USERNAME: 'demo-user', PASSWORD: 'demo-password' },
  },
  {
    id: 'E2', expected: 'environment', description: '서버 재시작으로 저장된 로그인 세션 만료', args: [...lifecycle, '--no-deps'],
    prepare: { args: ['--project=setup'] },
  },
  { id: 'E3', expected: 'environment', description: '백엔드 응답 지연(11초)', args: lifecycle, env: { DEMO_LATENCY_MS: '11000' } },
  { id: 'E4', expected: 'environment', description: '브라우저 실행 파일이 설치되지 않은 실행 환경', args: lifecycle, env: { PLAYWRIGHT_BROWSERS_PATH: '__EMPTY_DIR__' } },
  { id: 'E5', expected: 'environment', description: 'API 연결이 중간에 끊김(connection reset)', args: lifecycle, env: { DEMO_FAULT: 'drop-api' } },

  // holdout: 2026-10-27 분류기 강화 작업 전에 추가하고 정답을 고정했다.
  { id: 'HP1', set: 'holdout', expected: 'product', description: '서버가 볼륨 이름을 20자로 잘라 저장', args: lifecycle, env: { DEMO_FAULT: 'name-truncated' } },
  { id: 'HP2', set: 'holdout', expected: 'product', description: '삭제 API가 500 반환', args: lifecycle, env: { DEMO_FAULT: 'delete-500' } },
  { id: 'HS1', set: 'holdout', expected: 'script', description: '상태 기대값 대소문자 오타(Active)', args: lab('@reg-06') },
  { id: 'HS2', set: 'holdout', expected: 'script', description: '허용되지 않는 크기 0으로 생성 시도', args: lab('@reg-07') },
  {
    id: 'HE1', set: 'holdout', expected: 'environment', description: '저장된 로그인 세션 파일이 없음', args: [...lifecycle, '--no-deps'],
    removeFiles: ['auth/storageState.json'],
  },
  {
    id: 'HE2', set: 'holdout', expected: 'environment', description: '대상 주소의 DNS 조회 실패',
    args: lifecycle, env: { BASE_URL: 'http://volume-demo.invalid', USERNAME: 'demo-user', PASSWORD: 'demo-password' },
  },
];
