# Private Cloud UI Test Automation

[![CI](https://github.com/hddhdd96/ui-auto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hddhdd96/ui-auto/actions/workflows/ci.yml)

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
| `npm run triage` | 직전 실행의 실패 원인 후보를 `report/tc-triage.json`에 기록 (선택, 아래 참고) |
| `npm run triage:lab` | 일부러 만든 실패 21개(기존 15 + 검증용 6)로 원인 분류 정확도 측정 |

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
| `utils/network-log.ts` | 실패한 테스트에만 네트워크 증적(4xx/5xx, 전송 실패, 지연 요청) 첨부 |
| `triage/` | 실패 원인 후보 분류(규칙 기반 기준선 + AI), 근거 원문 검증 |
| `triage-lab/`, `tests/triage-lab/` | 정답이 있는 실패 21개와 측정 스크립트 |
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

## CI 가드레일

`main` push와 모든 PR에서 GitHub Actions가 `npm run typecheck`와 `npm test`를 실행합니다(retry 0, CI에서 `test.only` 금지). 실패 여부와 관계없이 `report/tc-summary.json`, HTML report, screenshot·video·trace를 artifact로 14일 보관합니다.

AI 코딩 도구가 실패한 테스트를 고치면서 제품 대신 판정 조건을 바꿔 PASS로 만드는 일을 실무에서 겪었습니다. 이 원칙을 리뷰 습관이 아니라 파이프라인이 강제하도록, PR 단계에서 `guardrail/check_test_weakening.py`(Python 3.9 이상, 표준 라이브러리만 사용)가 판정 코드 diff를 검사하고 의심 변경이 있으면 job을 실패시킵니다.

| 규칙 | 잡아내는 변경 (예) |
|---|---|
| TW01·TW02 | PR 전체에서 assertion·실패 경로 또는 테스트 케이스 순감소 (파일 간 이동은 허용) |
| TW03 | `test.skip` / `test.only` / `test.fixme` / `test.fail` 추가 |
| TW04 | retry 증가 (`retries: process.env.CI ? 2 : 0`) |
| TW05 | 완전 일치 → 부분 일치 (`toHaveText('ACTIVE')` → `toContainText('ACTIVE')`: `INACTIVE`도 통과) |
| TW06·TW09 | 기대값 변경, 허용 값 확대 (`toBe(204)` → `toBe(200)`, reporter의 BLOCK → PASS) |
| TW07·TW08 | 실패 전파 제거·실패 무시(`throw` 삭제, 빈 `catch`), `expect(true)` 같은 항상 참인 판정 |
| TW10·TW11 | 정확 일치 옵션 제거, 가드레일 규칙·범위·워크플로 자체 변경 |

의도한 변경(제품 사양 변경 등)이면 PR 설명에 근거를 적고 `test-change-approved` 라벨을 붙입니다. 이때 발견 사항은 경고로 남고 job은 통과합니다. `main` 브랜치는 이 검사(`test-weakening guardrail`)를 병합 전 필수 체크로 지정했습니다. 검사 범위는 `guardrail/scope.txt`에서 관리합니다.

```bash
python3 -m unittest discover -s guardrail -v        # 실제 코드를 변형한 약화 사례 10건 + 정상 변경 5건
python3 guardrail/check_test_weakening.py guardrail/examples/weaken-active-check.diff   # 상태 셀 `toHaveText` → `toContainText` → exit 1
python3 guardrail/check_test_weakening.py --base origin/main                          # 현재 브랜치 검사
```

diff 기반 휴리스틱이므로 모든 약화를 잡지는 않습니다. 이 저장소의 과거 커밋에 적용해 오탐을 줄였고, 최종 판단은 사람이 diff와 근거를 보고 내립니다.

## AI 실패 원인 1차 분류 (선택)

실패가 여러 건이면 제품 결함·스크립트 문제·환경 문제를 먼저 가르는 데 시간이 듭니다. `npm run triage`는 `report/tc-summary.json`의 FAIL/BLOCK 행을 읽어 원인 후보와 근거를 `report/tc-triage.json`에 따로 씁니다.

- 판정(PASS/FAIL/BLOCK)과 원본 오류는 바꾸지 않습니다. 결과는 사람이 확인할 후보입니다.
- 입력은 오류 메시지·코드 위치, 실패 시점 화면 스냅샷, 실패한 테스트에만 남기는 네트워크 기록(`network-log.json`)입니다. TC-ID와 파일 경로는 넣지 않습니다.
- AI는 근거를 원문에서 그대로 인용해야 합니다. 원문에 없는 근거는 버리고, 근거가 남지 않으면 `판단 보류`로 내립니다. API 호출은 자동 재시도하지 않고, 무료 등급 한도에 맞춰 호출 간격만 둡니다.
- 기본 제공자는 Gemini API 무료 등급(`gemini-3.5-flash-lite`, `GEMINI_API_KEY`)이고, `TRIAGE_PROVIDER=anthropic`으로 Claude(`ANTHROPIC_API_KEY`)를 쓸 수 있습니다. 키가 없으면 규칙 기반 후보만 만듭니다. CI는 테스트가 실패했을 때만 이 단계를 실행합니다.
- 무료 등급 입력은 Google 제품 개선에 쓰일 수 있으므로 데모 데이터에만 사용합니다. 실제 업무 로그를 보낼 때는 유료 등급 또는 사내 승인된 모델을 씁니다.

### 분류 정확도 측정

원인을 정해 두고 일부러 만든 실패와 정답이 `triage-lab/cases.ts`에 있습니다. 분류 결과가 그 원인(정답)과 같으면 맞힌 것으로 셉니다. `npm run triage:lab` 또는 Actions의 **Triage eval**(수동 실행)로 같은 실패를 재현해 측정합니다.

| 세트 | 구성 |
|---|---|
| 기존 15개 | 제품 결함(상태 INACTIVE, 크기 불일치, 삭제 미반영, 목록 중복, 생성 500), 스크립트 문제(Locator 오타, 입력과 다른 기대값, strict mode 위반, 고정 이름 재사용, API 경로 오타), 환경 문제(서버 미기동, 세션 만료, 응답 지연, 브라우저 미설치, 연결 끊김). 분류기를 개선할 때 결과를 본 세트 |
| 검증용 6개 | 이름 잘림, 삭제 500, 상태 기대값 대소문자 오타, 크기 0 입력, 세션 파일 없음, DNS 실패. **분류기 강화 전에 추가하고 정답을 고정**해 개선 효과를 확인하는 세트 |

핵심 지표는 정확도와 함께 **잘못된 단정**(판단 보류가 아닌데 틀린 원인을 고른 수)입니다. 틀린 원인을 자신 있게 내놓는 것이 판단 보류보다 실무에서 더 해롭기 때문입니다.

2026-10-27 Actions 측정, AI는 `gemini-3.5-flash-lite`(무료 등급). 개선 후는 같은 측정을 3회 반복한 범위입니다.

| 분류 방법 | 기존 15개 | 검증용 6개 |
|---|---|---|
| 규칙 분류: 오류 문구 패턴 (기준선) | 10/15, 잘못된 단정 4 | 3/6, 잘못된 단정 2 |
| AI, 1차 (오류·화면·네트워크 기록) | 12/15, 잘못된 단정 3 | 4/6, 잘못된 단정 2 |
| **AI, 강화 후** (+ 테스트 코드·API 계약, 판별 순서) | **14~15/15, 잘못된 단정 0~1** | **5/6 (3회 모두), 잘못된 단정 1** |
| AI, 강화 후 네트워크 기록 없이 | 13/15 (3회 모두) | 4~6/6 |

AI가 인용한 근거 중 실패 기록에 없어 버려진 근거는 회당 40개 안팎 중 1~2개였고, API 오류는 0건, 토큰은 회당 입력 약 32,700 / 출력 약 3,300(42회 호출)입니다.

**강화 내용.** 사람이 원인을 볼 때 확인하는 정보를 분류 입력에 더했습니다. 실패한 테스트 함수 본문(넣은 값과 기대한 값), 기존 데모 계약을 정리한 `triage/context/api-contract.md`(허용 경로, 입력 규칙, 상태값), 그리고 "테스트 자체의 모순 → 테스트가 만든 4xx → 정상 요청에 대한 계약 위반 → 실행 환경" 순서의 판별 기준과 "둘 이상으로 설명되면 판단 보류" 지침입니다. 계약 문장은 근거로 인정하지 않고, 실패 기록과 테스트 코드에서 인용한 문장만 근거로 남깁니다.

**측정에서 확인한 것**

- 정확도를 가장 크게 바꾼 것은 모델이 아니라 근거였습니다. 네트워크 기록은 환경 문제를, 테스트 코드는 스크립트 문제를 가리는 데 결정적이었습니다(스크립트 문제 2/5 → 5/5).
- 같은 입력에도 AI 답이 실행마다 달랐습니다. 응답 지연(E3)은 3회 중 2회 제품 결함으로 오분류됐습니다. 그래서 1회 측정 수치를 성능으로 쓰지 않고 반복 측정 범위를 기록합니다.
- 상태 기대값 대소문자 오타(검증용 HS1)는 3회 모두 제품 결함으로 오분류했습니다. 계약에 `ACTIVE`(대문자)가 있지만 테스트의 `Active`와 연결하지 못했습니다.
- "애매하면 판단 보류" 지침에도 AI는 판단 보류를 한 번도 고르지 않았습니다. 작은 모델은 틀려도 단정하는 경향이 있으므로, 결과는 판정이 아니라 사람이 확인할 후보로만 씁니다.

**한계.** 데모 앱의 합성 실패 21개이고, 실패를 만든 사람과 분류기를 고친 사람이 같습니다(검증용 세트를 강화 전에 고정해 완화). 수치는 이 실험 조건에서의 결과이며 실제 제품 실패에서의 정확도가 아닙니다. 같은 날 상위 모델(`gemini-3.8-flash`, `gemini-3.6-flash`)은 무료 등급 혼잡(503)으로 측정하지 못했습니다. 다른 모델은 Triage eval의 모델 칸으로 같은 21개를 다시 잴 수 있습니다.

측정을 준비하며 `생성 대화상자가 닫히지 않음`이라는 같은 오류가 서버 500, 중복 이름 409, 응답 지연, 연결 끊김 네 가지 원인에서 나오는 것을 확인했습니다. 모달 때문에 화면의 오류 문구도 스냅샷에 남지 않았습니다. 그래서 분류기를 손보기 전에 실패 증적에 네트워크 기록을 추가했습니다.
