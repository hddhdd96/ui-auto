# 개발 환경: 실행 방법, 명령, 디렉터리 구조

[← README로 돌아가기](../README.md)

## 실행 방법

Node.js 20 이상, Python 3.10 이상이 필요합니다.

```bash
npm ci
pip install -r harness/report/requirements.txt
npm run lint
npm run typecheck
npm run portal
npx playwright install chromium
npm test
npm run report
```

| 명령 | 하는 일 |
|---|---|
| `npm run portal` | Mock 포털만 띄운다 |
| `npm test` | 포털을 자동으로 띄운 뒤 전체 테스트를 실행한다 |
| `npm run test:api` | REST API 테스트만 실행한다 |
| `npm run test:ui` | UI E2E 테스트만 실행한다 |
| `npm run test:negative` | 네거티브 dataset 테스트만 실행한다 |
| `npm run test:defects` | 결함 재현 테스트만 실행한다(정상 모드에서는 모두 통과) |
| `npm run defects:check` | 결함 주입 모드마다 포털을 새로 띄워, 결함 재현 테스트가 결함을 정확히 검출하는지 확인한다 |
| `npm run test:flaky` | Flaky 재현 테스트(개선 전 naive, 개선 후 stable)를 실행한다. Flaky 플래그를 켜지 않으면 둘 다 통과한다 |
| `npm run flaky:compare` | 유형마다 naive와 stable을 같은 Flaky 플래그·같은 시드로 5회씩 실행해 실패율 표를 만든다(`-- --demo`: 확률 100%, 시드 고정) |
| `npm run harness` | 테스트 하네스: 환경·프로젝트 선택 → 실행 → 증적 수집 → 실패 원인 분류 → Excel·PPT 결과서 작성 |
| `npm run guardrail` | PR 변경(diff)에서 판정 기준을 느슨하게 만드는 변경을 찾는다(기본 비교 기준 `origin/main`) |
| `npm run guardrail:selftest` | 가드레일 규칙이 예시 diff에서 기대한 대로만 걸리는지 확인한다 |
| `npm run triage` | 마지막 테스트 결과(`artifacts/results.json`)의 실패를 product / test / env로 자동 분류해 결과서를 만든다 |
| `npm run triage:eval` | 정답을 붙인 실패 시나리오를 실제로 실행해 분류 정확도를 계산한다 |
| `npm run test:negative:high` | 네거티브 dataset 중 결함이 자주 나는 영역(`risk: high`)만 실행한다 |
| `npm run report` | Playwright HTML 리포트를 연다 |

`npm run portal`을 실행하면 `http://127.0.0.1:4173`에서 웹 콘솔이, `http://127.0.0.1:4173/api`에서 REST API가 뜹니다.

## 디렉터리 구조

```text
portal/server/        Mock 포털 REST API (Express, 인메모리 저장소, 결함·Flaky 주입)
portal/web/           웹 콘솔 (빌드 없는 HTML + JS)
src/api/              API 클라이언트, 상태 폴링, 완료 판정, 일괄 삭제, 증적 기록
src/pages/            Page Object (locator와 action만)
src/fixtures/         로그인(스위트당 1회), 리소스 정리, 포털 모드 확인
src/negative/         네거티브 dataset 로더와 실행기
src/flaky/            브라우저 응답 기록, 요청-응답 짝짓기, 화면 복구
tests/api|ui/         정상 흐름 테스트
tests/negative/       네거티브 dataset과 실행기
tests/defects/        결함 재현 테스트와 결함 모드별 검출 기대 목록
tests/flaky/          Flaky 개선 전(naive) · 개선 후(stable) 테스트
harness/              테스트 하네스, 실패 원인 분류, 결과서 생성기(Python)
guardrail/            판정 완화 규칙, 검사기, 자기검증 예시
scripts/              결함 검출 확인, Flaky 비교, 분류 정확도 측정
.github/              CI · 가드레일 · Nightly 워크플로
AGENTS.md             AI 작업 지침(판정 완화 금지)
```
