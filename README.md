# UI Auto — QA Portfolio Demo

[![CI](https://github.com/hddhdd96/ui-auto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hddhdd96/ui-auto/actions/workflows/ci.yml)

Playwright + TypeScript 공개 포트폴리오 데모입니다.  
**Page Object Model · TC-ID 단위 테스트 · 시나리오 스위트 · flaky self-healing · assertion/retry/timeout 가드레일**을 최소 목 UI로 보여 줍니다.

회사 콘솔·비밀값·실제 OpenStack/K8s 엔드포인트는 포함하지 않습니다. 로컬 mock console만 사용합니다.

## 바로 실행

Node.js 20+ / npm 필요.

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run report
```

| 명령 | 범위 |
|---|---|
| `npm test` | unit(self-heal) + suites(Instance Create) |
| `npm run test:tc` | TC-ID 파일 단독 실행 (`tests/tc/`) |
| `npm run test:suites` | 시나리오 스위트만 |
| `npm run guardrail:selftest` | 가드레일 단위 테스트 |
| `npm run guardrail` | `origin/main...HEAD` diff 판정 약화 검사 |

기본 주소: `http://127.0.0.1:4173` (Playwright `webServer`가 `demo/server.mjs` 기동).

## 구조

```text
tests/tc/TC-*.spec.ts     → TC-ID당 1 파일 (시나리오 + assertion)
tests/suites/*.spec.ts    → 서비스/시나리오별 TC-ID 묶음
tests/steps/              → 공유 스텝 (페이지 액션 조합)
pages/                    → POM (locator + actions)
healing/                  → scroll / locator fallback / overlay allowlist
guardrail/                → assertion·retry·timeout 불변 CI 검사
demo/                     → 로컬 mock console (로그인 + 인스턴스 생성)
docs/screenshots/         → OCR·엑셀 리포트 포트폴리오 증적(실행 제외)
```

### POM / TC-ID / Suite

- **POM** (`pages/`): locator와 클릭·입력 같은 액션만 둔다. 기대값 assertion은 테스트에 둔다.
- **TC-ID** (`tests/tc/`): 파일·테스트 제목에 `TC-AUTH-001`, `TC-INST-002`처럼 ID를 붙인다.
- **Suite** (`tests/suites/instance-create.spec.ts`): `TC-AUTH-001` ~ `TC-INST-003`을 Instance Create 시나리오로 묶는다.

## Self-healing vs 불변 assert 정책

Self-healing이 **해도 되는 것**

1. **scroll into view** — 화면 밖 CTA를 뷰포트로 이동
2. **locator fallback** — 동일 의미의 후보 locator 체인
3. **Cloud View allowlist overlay dismiss** — 방해성 배너/투어만 (`healing/overlayAllowlist.ts`)

Self-healing이 **하면 안 되는 것**

- assertion 완화 (`toHaveText` → `toContainText`, exact 제거 등)
- `retries` 증가
- `timeout` / `expect.timeout` / action timeout 예산 증가
- `test.skip` / soft expect로 실패 은닉

호출부는 고정 예산(`ACTION_TIMEOUT_MS = 5000`, config `retries: 0`)을 넘긴다. healing 모듈은 그 숫자를 키우지 않는다.

## CI Guardrail

`guardrail/check_test_weakening.py` + `.github/workflows/guardrail.yml`

PR diff에서 판정 약화 의심 변경을 약 12개 규칙으로 차단합니다.

| 규칙 | 요지 |
|---|---|
| TW01–TW02 | assertion / 테스트 케이스 순감소 |
| TW03 | skip / only / fixme / expected-failure |
| TW04 | retry 증가 |
| TW05–TW06 | 완전일치→부분일치, 기대값 변경 |
| TW07–TW10 | 실패 삼키기, 항상 참, 허용 확대, exact 제거 |
| TW11 | 가드레일 자체 변경 |
| TW12 | timeout 예산 증가 |

의도된 정책 변경이면 PR에 근거를 적고 `test-change-approved` 라벨을 붙입니다. 라벨이 있으면 경고만 내고 통과합니다.

## 포트폴리오 증적 (실행하지 않음)

다음 항목은 이력서용 스크린샷으로만 제시합니다. 이 저장소의 `npm test`에는 포함하지 않습니다.

- OCR(Tesseract) UI 텍스트 검증 파이프라인
- Excel 증적/결과 리포트 생성기

자리 표시: [`docs/screenshots/`](docs/screenshots/README.md)

## 보안 / 범위

- 원격은 `hddhdd96/ui-auto`만 사용합니다.
- 실서비스 호스트명, 토큰, 고객명, 사내 URL을 넣지 마세요.
- mock 계정: `demo-user` / `demo-password` (로컬 전용).
