import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ResourceKind } from '../api/client';

/**
 * 네거티브 시나리오 dataset 형식.
 * 정상 흐름 테스트와 분리해 JSON 파일로 관리하고, 버전마다 같은 dataset을 반복 실행한다.
 */

/** 요청을 보내는 주체 */
export type Actor = 'admin' | 'member' | 'anonymous' | 'invalidToken' | 'expiredToken';

export type Category =
  | 'boundary' | 'required' | 'format' | 'reference' | 'duplicate' | 'quota' | 'state' | 'permission' | 'auth';

/**
 * 사전 준비 단계. as로 이름을 붙이면 요청과 검증에서 {{이름.id}}, {{이름.name}}으로 참조할 수 있다.
 * - instance: ACTIVE 인스턴스 / instanceCreating: 생성을 요청만 해서 CREATING인 인스턴스
 * - volume: AVAILABLE 볼륨 / attach: 볼륨을 인스턴스에 연결
 * - network: 네트워크(서브넷은 선택) / quota: 쿼터를 임시로 바꾼다(테스트 후 원래 값으로 되돌린다)
 */
export type SetupStep =
  | { type: 'instance' | 'instanceCreating'; as: string; flavorId?: string }
  | { type: 'volume'; as: string; sizeGb?: number }
  | { type: 'attach'; volume: string; instance: string }
  | { type: 'network'; as: string; cidr: string; subnets?: string[] }
  | { type: 'quota'; values: Record<string, number> };

/** 요청이 거부된 뒤 목록 API로 실제 상태를 확인하는 방법 */
export type Verify =
  /** 이름이 name인 리소스가 count개여야 한다(0이면 생기지 않았어야 한다) */
  | { kind: ResourceKind; name: string; count: number }
  /** 리소스가 남아 있고 필드가 그대로여야 한다. projectId를 주면 그 프로젝트에서 찾는다. */
  | { kind: ResourceKind; id: string; projectId?: string; fields?: Record<string, unknown>; statusIn?: string[] };

export interface NegativeCase {
  id: string;
  title: string;
  category: Category;
  /** high: 결함이 자주 나는 영역이라 우선 실행한다 */
  risk: 'high' | 'normal';
  setup?: SetupStep[];
  request: { as?: Actor; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; projectId?: string };
  expect: { status: number; code?: string; field?: string };
  verify?: Verify[];
}

export interface DatasetFile {
  area: string;
  description: string;
  /** risk: high로 고른 이유 */
  riskReason?: string;
  cases: NegativeCase[];
}

export interface LoadedCase extends NegativeCase {
  area: string;
  file: string;
}

const CATEGORIES: Category[] = ['boundary', 'required', 'format', 'reference', 'duplicate', 'quota', 'state', 'permission', 'auth'];

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`dataset 형식 오류: ${message}`);
}

/** dataset 디렉터리의 api-*.json을 읽고 형식을 검사한다. 형식이 틀리면 테스트를 만들기 전에 실패한다. */
export function loadApiDatasets(dir: string): LoadedCase[] {
  const files = readdirSync(dir).filter((f) => f.startsWith('api-') && f.endsWith('.json')).sort();
  const cases: LoadedCase[] = [];
  const ids = new Set<string>();
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as DatasetFile;
    check(typeof data.area === 'string' && Array.isArray(data.cases), `${file}: area와 cases가 필요합니다.`);
    for (const c of data.cases) {
      const where = `${file} ${c.id ?? '(id 없음)'}`;
      check(/^NEG-[A-Z]+-\d{3}$/.test(c.id), `${where}: id는 NEG-영역-번호 형식이어야 합니다.`);
      check(!ids.has(c.id), `${where}: id가 중복됩니다.`);
      check(typeof c.title === 'string' && c.title.length > 0, `${where}: title이 필요합니다.`);
      check(CATEGORIES.includes(c.category), `${where}: category가 올바르지 않습니다.`);
      check(c.risk === 'high' || c.risk === 'normal', `${where}: risk는 high 또는 normal이어야 합니다.`);
      check(typeof c.request?.method === 'string' && typeof c.request?.path === 'string', `${where}: request가 필요합니다.`);
      check(Number.isInteger(c.expect?.status), `${where}: expect.status가 필요합니다.`);
      check(c.expect.status < 300 || typeof c.expect.code === 'string', `${where}: 실패를 기대하면 expect.code가 필요합니다.`);
      ids.add(c.id);
      cases.push({ ...c, area: data.area, file });
    }
  }
  check(cases.length > 0, `${dir}에 dataset이 없습니다.`);
  return cases;
}

/** {{이름.필드}} 자리표시자를 실제 값으로 바꾼다. 정의되지 않은 이름을 쓰면 바로 실패한다. */
export function resolvePlaceholders<T>(value: T, vars: Record<string, string>): T {
  const json = JSON.stringify(value).replace(/\{\{([\w.]+)\}\}/g, (_m, key: string) => {
    const resolved = vars[key];
    if (resolved === undefined) throw new Error(`dataset 자리표시자 {{${key}}}에 해당하는 값이 없습니다.`);
    return resolved;
  });
  return JSON.parse(json) as T;
}

/** 화면 입력 dataset(ui-*.json)의 케이스 */
export interface UiFormCase {
  id: string;
  title: string;
  category: Category;
  risk: 'high' | 'normal';
  /** 화면에서 보내기 전에 바꿀 쿼터 */
  quota?: Record<string, number>;
  input: Record<string, string>;
  /** 화면에 표시돼야 하는 오류 메시지 */
  expectMessage: string;
}

export function loadUiDataset(file: string): { area: string; description: string; cases: UiFormCase[] } {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { area: string; description: string; cases: UiFormCase[] };
  for (const c of data.cases) {
    check(/^NEG-UI-[A-Z]+-\d{3}$/.test(c.id), `${file} ${c.id}: id는 NEG-UI-영역-번호 형식이어야 합니다.`);
    check(typeof c.expectMessage === 'string' && c.expectMessage.length > 0, `${file} ${c.id}: expectMessage가 필요합니다.`);
  }
  return data;
}
