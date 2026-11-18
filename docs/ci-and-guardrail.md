# GitHub Actions CI와 판정 완화 가드레일

[← README로 돌아가기](../README.md)

> 이 문서의 수치는 이 저장소에서 실제로 실행한 결과입니다. 시나리오와 데이터는 모두 가상입니다.

## GitHub Actions CI

| 워크플로 | 언제 | 하는 일 |
|---|---|---|
| `ci.yml` | 모든 브랜치 push, PR, 수동 실행 | 정적 검사(lint, type check, 가드레일 자기검증) → 테스트 하네스 실행(API·UI·네거티브·결함 재현·Flaky 개선 후, Flaky 플래그 끔) → HTML 리포트·Excel·PPT 결과서·증적을 artifact로 업로드 → 결함 모드 매트릭스. main에 병합되면 HTML 리포트와 결과서를 GitHub Pages에 배포 |
| `guardrail.yml` | PR 열림·갱신·라벨 변경 | 판정 완화 검사. `guardrail-approved` 라벨이 없으면 실패 |
| `nightly.yml` | 매일 18:17 UTC(한국 시간 03:17), 수동 실행 | 전체 회귀(하네스), Flaky 개선 전/후 비교(별도 job, 기본 5회), 결함 검출 확인(전체 모드) |

- **Job Summary**: 하네스는 실행 대상, 결과 요약, 스위트별 결과를 쓰고, 실패가 있으면 실패 원인 분류 표(product / test / env와 근거)를 함께 씁니다. 결함 검출 확인과 Flaky 비교도 결과 표를 씁니다.
- **결함 모드 매트릭스**: `normal`에서는 결함 재현 테스트가 모두 통과해야 하고, `quota-api-bypass`·`resize-mismatch`에서는 기대한 테스트가 정확히 실패해야(결함을 검출해야) job이 초록색이 됩니다.
- **Flaky 플래그**: 정기 CI의 stable 테스트는 Flaky 플래그를 끈 상태로 실행하고, naive/stable 비교는 Nightly의 별도 job에서 실행합니다.
- 세 워크플로의 준비 단계(Node 의존성, Python 결과서 라이브러리, Playwright Chromium 캐시)는 `.github/actions/setup`으로 묶었습니다.

## CI 가드레일: 판정 완화 변경 차단

AI나 사람이 실패한 테스트를 고칠 때, 원인을 고치는 대신 **판정 기준을 바꿔 통과시키는 변경**이 생길 수 있습니다. assert를 지우거나, 기대값을 실패한 값에 맞추거나, retry·timeout을 늘리는 식입니다. 이런 변경은 코드 리뷰에서 놓치기 쉬워서 PR마다 자동으로 검사합니다.

### 규칙 목록

규칙은 `guardrail/rules.ts`에 목록으로 관리합니다. 같은 목록이 AI 작업 지침(`AGENTS.md`)에도 있어서, AI는 작업 전에 지침으로 알고, 작업 후에는 가드레일이 검사합니다.

| 규칙 | 탐지하는 변경 | 막는 이유 |
|---|---|---|
| GR-01-ASSERT-REMOVED | 파일에서 `expect`가 순감소 | 확인하던 조건을 지우면 결함이 있어도 통과한다 |
| GR-02-ASSERT-WEAKENED | 같은 대상을 더 느슨한 matcher로 확인(`toEqual` → `toBeTruthy` 등), `expect.soft` 추가 | 틀린 값도 통과하거나 실패가 테스트를 멈추지 않는다 |
| GR-03-EXPECTED-CHANGED | 같은 assertion의 기대값 변경, dataset·검출 목록의 `status`·`code`·`category`·`mustFail` 변경 | 제품이 틀리게 바뀌어도 그 동작을 정답으로 받아들인다 |
| GR-04-RETRY-INCREASED | `retries`·`networkRetries` 증가, `--retries` 추가 | Flaky의 원인이 남은 채 결과만 초록색이 된다 |
| GR-05-TIMEOUT-INCREASED | `timeout`·`pollTimeoutMs` 증가, `test.setTimeout`·`test.slow` 추가, assertion에 `timeout` 지정 | 느려진 원인(지연, 상태 불일치)을 숨긴다 |
| GR-06-TEST-SKIPPED | `skip`·`only`·`fixme`·`fail` 추가 | 실행되는 판정 자체가 사라진다 |
| GR-07-FIXED-WAIT | `waitForTimeout` 추가 | 실제 작업 완료를 확인하지 않고 판정한다 |
| GR-08-TEST-REMOVED | 테스트 순감소, dataset 케이스 삭제 | 그 조건을 더 이상 확인하지 않는다 |
| GR-09-GUARDRAIL-CHANGED | `guardrail/`, `AGENTS.md`, `.github/workflows/` 변경 | 규칙을 고쳐 검사를 피할 수 있다 |

- 검사 범위는 `guardrail/scope.json`에 있습니다. 개선 전 Flaky 테스트(`tests/flaky/naive/`)와 분류기 검증 샘플(`tests/triage-samples/`)은 나쁜 방식을 일부러 보여주는 파일이라 제외했습니다.
- 위반이 있으면 실패합니다. 요구사항이 바뀌어 판정 기준을 바꿔야 하면, PR 설명에 이유를 적고 **사람이** `guardrail-approved` 라벨을 붙입니다. 라벨이 있으면 위반을 보고만 하고 통과합니다(`GUARDRAIL_APPROVED=true`).
- 결과는 `artifacts/guardrail/report.md`로 남고, GitHub Actions에서는 Job Summary에도 표시됩니다.

### 검증

| 확인한 것 | 결과 |
|---|---|
| 자기검증(`npm run guardrail:selftest`) | 예시 diff 24개(위반 예시 17개, 통과해야 하는 예시 7개)와 "모든 규칙에 위반 예시가 있는지" 확인 1건, 총 25건 통과 |
| 통과해야 하는 예시 | 새 테스트 추가, matcher 강화, timeout 단축, assertion 위치 이동, 주석만 변경, 포털 코드 변경, 제외 디렉터리의 고정 대기 |
| 실제 코드로 만든 판정 완화 커밋 | 임시 worktree에서 retry 0→2, `toBe` → `toBeTruthy`, `test.skip` 추가, `expect` 삭제, `waitForTimeout` 추가를 한 커밋을 만들어 검사: 5건 모두 탐지, 종료 코드 1. 승인 라벨 환경변수를 주면 같은 보고와 함께 종료 코드 0 |

자기검증 중 오탐 1건을 고쳤습니다. assertion에 `{ timeout: 30_000 }` 옵션만 붙였는데 '기대값 변경'으로도 잡혀서, 기대값 비교에서 끝의 옵션 객체를 빼도록 바꿨습니다(옵션의 timeout은 GR-05가 따로 봅니다).

알려진 한계: 여러 줄에 걸친 assertion의 matcher·기대값 변경은 줄 단위로 비교하지 못합니다. 이 경우에도 `expect` 개수가 줄면 GR-01이, 테스트가 줄면 GR-08이 잡습니다.
