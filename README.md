# Private Cloud UI Test Automation

Playwright + TypeScript로 클라우드 콘솔 QA의 **생성 → 상태 검증 → 증적 → 삭제** 흐름을 공개용으로 재구성한 데모입니다. 회사 계정 없이 로컬에서 실행합니다.

## 바로 실행

Node.js 20 이상과 npm이 필요합니다.

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run report
```

실행 시 로컬 데모 서버를 자동으로 시작·종료합니다. 기본 주소는 `http://127.0.0.1:4173`입니다. 설치 이후 기본 테스트는 외부 사이트에 연결하지 않습니다. 오프라인 장비에서는 의존성과 Playwright 브라우저를 사전에 준비해야 합니다.

| 명령 | 범위 |
|---|---|
| `npm test` | 단위 검증 + 로그인 + 볼륨 lifecycle + 불확실한 생성 결과 정리 |
| `npm run test:demo` | 로컬 브라우저 데모 2개와 인증 setup |
| `npm run test:unit` | 이름 고유성, 정리 실패 보존, 결과 분류 |
| `npm run test:e2e` | 로그인 + 대표 볼륨 lifecycle |
| `npm run test:external` | 별도 TodoMVC 예제. 인터넷 필요, 기본 검증에는 포함하지 않음 |

## 대표 사례

### 1. UI와 API가 같은 리소스 상태를 보여주는지 확인

`DEMO-VOL-001`은 이름과 크기를 입력하고 다음을 함께 확인합니다.

- API: 정확한 이름, 크기, `ACTIVE`, `bootable: true`
- UI: 정확히 한 행, 상태 셀의 `ACTIVE` 완전 일치, 입력한 크기
- 삭제: UI에서 행이 사라지고 API에서도 대상 이름이 조회되지 않음

`Inactive`나 다른 셀에 들어 있는 `Active` 문자열을 성공으로 인정하지 않습니다. 생성 폼의 Locator는 dialog 안으로 제한합니다.

### 2. 생성 이후 확인에 실패해도 자원 추적 유지

`DEMO-VOL-002`는 생성이 성공한 뒤 관측 오류를 합성합니다. 생성 시도 전에 등록한 고유 이름으로 API를 조회해 정리하고, 원래 오류 객체와 삭제 결과를 검증합니다. 예상된 합성 오류를 검사하는 테스트이며 실패한 실제 테스트를 PASS로 바꾸는 방식이 아닙니다.

일반 테스트에서도 fixture teardown이 정리를 수행합니다. 삭제에 실패하면 해당 이름과 오류를 증적에 보존하고 테스트를 실패시킵니다. 동일 삭제를 자동 재시도하지 않습니다.

### 3. 읽기 쉬운 요약과 원본 증거

- `list` / HTML reporter와 원본 error·stack 유지
- `report/tc-summary.json`: TC-ID, PASS/FAIL/BLOCK, 한국어 요약, 원본 오류, 첨부 경로
- 실행되지 않음·중단은 BLOCK, assertion·timeout은 FAIL
- 단계 캡처는 `TC-ID__단계명`, 자원 정리 이력은 JSON attachment
- 실패 시 screenshot / video / trace 수집

## 구조

```text
Test → fixture → Flow → Page Object / API client
                 └── ResourceCleanup → teardown evidence
```

| 경로 | 책임 |
|---|---|
| `pages/` | readonly Locator, 페이지 동작·assertion |
| `flows/volume-lifecycle.ts` | UI와 API를 연결하는 업무 흐름 |
| `services/volume-client.ts` | 로컬 API 계약과 백엔드 결과 검증 |
| `fixtures/base-test.ts` | 객체 주입, 실패 후 정리, 정리 기록 첨부 |
| `utils/resource-cleanup.ts` | 생성 결과가 불확실한 자원과 정리 실패 추적 |
| `reporters/failure-summary.ts` | 원본 오류를 유지하는 TC별 결과 요약 |
| `demo/` | Node 표준 라이브러리로 만든 로컬 UI·API |
| `auth/` | 사용자 확인 후 storageState 저장 |
| `tests/testsuite/`, `tests/demo/` | 대표 lifecycle, 실패 경로 데모 |
| `tests/unit/` | 정리·분류·데이터 계약 검증 |
| `tests/external/` | 기존 외부 TodoMVC 예제 |

## 업무 경험과 공개 범위

| 업무 기준 | 범위 |
|---|---|
| 회귀 TC | 65 |
| 환경 제약 제외 자동화 대상 | 60 |
| QA팀 자동화 | 60 / 60 |
| 개인 설계·구현 UI E2E | 20 |
| 자동화로 발견한 결함 | 약 3건 |

위 수치는 업무 경험의 범위이며 로컬 데모의 실행 건수와 다릅니다. 실무에서 사용한 POM·fixture·인증 재사용·증적 관리와, 생성 결과가 불확실할 때의 정리·TC별 결과 관리 방식을 일반화했습니다.

로컬 서비스는 생성 즉시 `ACTIVE`가 되는 합성 계약입니다. 실제 OpenStack/Kubernetes의 비동기 전환이나 운영 성능을 검증하지 않습니다. OCR, 마이그레이션, 전체 업무 TC는 포함하지 않습니다. `InstancePage`는 구조 참고용이며 실행 데모는 Volume에 한정합니다.

다른 테스트 서비스에 연결하려면 `.env.example`의 설정뿐 아니라 페이지 경로·라벨·API 응답 계약을 맞춰야 합니다. 운영 계정·사내 URL·실제 업무 증적을 넣지 마세요.

## 실패 처리 원칙

자동 retry는 0이며 첫 실패에서 실행을 중단합니다. 기대값을 완화하거나 실패를 skip하지 않습니다. 실패가 발생하면 원본 오류와 증적을 확인하고, 필요 시 해당 실패만 단독 1회 재검사한 뒤 원인과 수정안을 검토합니다.
