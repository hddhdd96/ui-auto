# AI 작업 지침

이 저장소에서 코드를 고치는 AI 에이전트와 사람이 함께 지키는 규칙이다.

## 1. 판정 기준을 바꿔서 테스트를 통과시키지 않는다

테스트가 실패하면 **실패 원인**(제품 결함, 테스트 코드 오류, 환경 문제)을 찾아서 고친다.
아래처럼 판정 기준을 느슨하게 만들어 통과시키는 변경은 금지한다.

| 금지하는 변경 | 예시 | 가드레일 규칙 |
|---|---|---|
| assertion 삭제 | `expect(...)` 줄을 지운다 | GR-01-ASSERT-REMOVED |
| assertion 완화 | `toBe` → `toContain`, `toEqual` → `toBeTruthy`, `expect.soft`로 변경 | GR-02-ASSERT-WEAKENED |
| 기대값 변경 | 실패한 값에 맞춰 기대값이나 dataset의 `status`·`code`를 고친다 | GR-03-EXPECTED-CHANGED |
| retry 증가 | `retries`, `networkRetries` 값을 올린다 | GR-04-RETRY-INCREASED |
| timeout 증가 | `timeout`, `pollTimeoutMs`를 늘리거나 `test.setTimeout`, `test.slow`를 추가한다 | GR-05-TIMEOUT-INCREASED |
| 테스트 건너뛰기 | `test.skip`, `test.fixme`, `test.fail`, `test.only`를 추가한다 | GR-06-TEST-SKIPPED |
| 고정 대기 추가 | `waitForTimeout`으로 시간을 벌어 통과시킨다 | GR-07-FIXED-WAIT |
| 테스트 삭제 | 실패하는 테스트나 dataset 케이스를 지운다 | GR-08-TEST-REMOVED |
| 가드레일 우회 | 가드레일 규칙·검사 범위·이 문서·워크플로를 바꾼다 | GR-09-GUARDRAIL-CHANGED |

이 규칙은 `guardrail/rules.ts`에 목록으로 있고, PR마다 `npm run guardrail`이 변경(diff)을 검사한다.
로컬에서 먼저 확인하려면 `npm run guardrail -- --base origin/main`을 실행한다.

판정 기준을 꼭 바꿔야 한다면(요구사항 자체가 바뀐 경우) PR 설명에 이유를 적고,
사람이 `guardrail-approved` 라벨을 붙여 승인해야 병합할 수 있다. AI가 스스로 라벨을 붙이지 않는다.

## 2. 판정은 '요청 성공'이 아니라 '실제 작업 완료'로 한다

- 생성·삭제·사양 변경 요청이 2xx를 돌려줘도 완료로 보지 않는다. 리소스 상태를 폴링해서 실제로 끝났는지 확인한다.
- HTTP 400처럼 응답만으로 결과를 알 수 없으면 목록 API로 실제 상태를 다시 확인한 뒤 판정한다.
- 응답은 해당 요청(메서드, URL, 리소스 ID)과 짝지어 해석한다. '다음에 온 응답'을 현재 작업의 결과로 쓰지 않는다.

## 3. 실행하지 않은 결과를 쓰지 않는다

- 실행해서 확인하지 않은 테스트를 "통과했다"고 쓰지 않는다.
- README와 문서의 수치는 이 저장소에서 실제로 실행한 결과만 쓴다.

## 4. 가상 데이터만 쓴다

실제 회사·고객사 이름, 제품명, TC ID, URL, 계정, IP를 넣지 않는다.
