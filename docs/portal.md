# Mock 클라우드 포털

[← README로 돌아가기](../README.md)

> 이 문서의 수치는 이 저장소에서 실제로 실행한 결과입니다. 시나리오와 데이터는 모두 가상입니다.

## Mock 포털 웹 콘솔

![인스턴스 화면](screenshots/console-instances.png)

빌드 과정이 없는 정적 HTML과 바닐라 JS로 만들었습니다. 모든 입력란에 label을 붙이고 버튼에 접근 가능한 이름을 줘서, 테스트가 `getByRole`·`getByLabel`만으로 요소를 찾을 수 있습니다.

| 화면 | 할 수 있는 일 |
|---|---|
| 로그인 | 아이디·비밀번호로 로그인한다. 실패하면 오류 메시지를 보여준다. |
| 상단 바 | 작업할 프로젝트를 고르고, 세션 만료 시각을 확인하고, 세션을 연장하거나 로그아웃한다. |
| 대시보드 | 프로젝트의 사용량과 쿼터를 표로 보여준다. 관리자는 쿼터를 바꿀 수 있다. |
| 인스턴스 | 인스턴스를 만들고, 사양을 바꾸고, 삭제한다. 연결된 볼륨도 함께 보여준다. |
| 볼륨 | 볼륨을 만들고, 인스턴스에 연결·분리하고, 삭제한다. |
| 볼륨 그룹 | 볼륨 여러 개를 묶어 그룹을 만들고 삭제한다. |
| 네트워크 | 네트워크와 서브넷(IP 대역)을 만들고 삭제한다. 일반 사용자에게는 생성·삭제 기능을 보여주지 않는다. |
| 보안 그룹 | 보안 그룹과 규칙을 만들고 삭제한다. |

화면 동작에서 테스트가 알아야 할 점은 다음과 같습니다.

- 목록은 1초마다 자동으로 갱신되어, `CREATING`이 `ACTIVE`로 바뀌는 과정이 화면에 그대로 보입니다.
- 메뉴를 누르면 해당 화면을 처음부터 다시 그리고 최신 데이터를 불러옵니다.
- 쿼터를 넘는 생성 요청은 화면에서 먼저 막고 오류 메시지를 보여줍니다(서버도 같은 요청을 `409`로 거부합니다).
- 삭제, 사양 변경, 볼륨 연결, 서브넷 추가는 대화상자에서 확인한 뒤 요청합니다. 요청이 거부되면 대화상자 안에 오류를 보여주고 닫지 않습니다.
- 세션이 만료되면 로그인 화면으로 돌아가고 만료 안내 메시지를 보여줍니다.


## Mock 포털 REST API

데이터는 메모리에만 저장하고, 서버를 다시 띄우거나 리셋 API를 부르면 초기 상태로 돌아갑니다.

### 가상 계정과 프로젝트

| 계정 | 비밀번호 | 권한 | 접근할 수 있는 프로젝트 |
|---|---|---|---|
| `admin` | `admin-pass` | 관리자 | `proj-alpha`, `proj-beta` |
| `member` | `member-pass` | 일반 사용자 | `proj-alpha` |

- 로그인하면 토큰을 응답 본문과 `portal_token` 쿠키로 함께 받습니다. API를 부를 때는 `Authorization: Bearer <토큰>` 헤더를 씁니다.
- 작업할 프로젝트는 `X-Project-Id` 헤더로 고릅니다. 헤더가 없으면 사용자의 첫 번째 프로젝트를 씁니다.
- 쿼터 변경과 네트워크·서브넷 생성·삭제는 관리자만 할 수 있습니다.

### 엔드포인트

| 분류 | 엔드포인트 |
|---|---|
| 인증 | `POST /auth/login`, `POST /auth/extend`, `POST /auth/logout`, `GET /auth/me` |
| 환경 | `GET /environments`, `GET /projects`, `GET /flavors` |
| 인스턴스 | `GET·POST /instances`, `GET·DELETE /instances/:id`, `POST /instances/:id/resize` |
| 볼륨 | `GET·POST /volumes`, `GET·DELETE /volumes/:id`, `POST /volumes/:id/attach`, `POST /volumes/:id/detach` |
| 볼륨 그룹 | `GET·POST /volume-groups`, `GET·DELETE /volume-groups/:id` |
| 네트워크·서브넷 | `GET·POST /networks`, `GET·DELETE /networks/:id`, `GET·POST /networks/:id/subnets`, `DELETE /networks/:id/subnets/:subnetId` |
| 보안 그룹 | `GET·POST /security-groups`, `GET·DELETE /security-groups/:id` |
| 쿼터·사용량 | `GET·PUT /quota`, `GET /usage` |
| 테스트용 | `POST /test/reset`, `GET /test/flags` |

### 상태 전이

생성·삭제·사양 변경 요청은 바로 끝나지 않습니다. 요청은 '접수'만 하고, 실제 작업은 지연 시간(`TRANSITION_DELAY_MS`) 뒤에 끝납니다. 그래서 테스트는 응답 코드가 아니라 리소스 상태를 폴링해서 완료를 판정해야 합니다.

| 리소스 | 상태 전이 |
|---|---|
| 인스턴스 | `CREATING` → `ACTIVE` 또는 `ERROR`(서브넷이 없는 네트워크에 만들면 IP를 할당하지 못해 `ERROR`), `ACTIVE` → `RESIZING` → `ACTIVE`, `DELETING` → 목록에서 사라짐 |
| 볼륨 | `CREATING` → `AVAILABLE`, `ATTACHING` → `IN_USE`, `DETACHING` → `AVAILABLE`, `DELETING` → 목록에서 사라짐 |
| 볼륨 그룹 | `CREATING` → `AVAILABLE`, `DELETING` → 목록에서 사라짐 |

### 입력 규칙과 오류 응답

오류 응답은 `{ "error": { "code", "message", "field" } }` 형식으로 통일했습니다.

| 규칙 | 위반했을 때 |
|---|---|
| 이름은 3~30자이고, 영문 소문자로 시작하며 영문 소문자·숫자·하이픈만 쓴다 | `400 INVALID_LENGTH`, `400 INVALID_FORMAT` |
| 필수값을 빠뜨리면 안 된다 | `400 REQUIRED` |
| 볼륨 크기는 1~1000 GB | `400 OUT_OF_RANGE` |
| 서브넷 IP 대역은 네트워크 대역 안에 있어야 하고 다른 서브넷과 겹치면 안 된다 | `400 OUT_OF_RANGE`, `409 CIDR_OVERLAP` |
| 프로젝트 쿼터를 넘으면 안 된다 | `409 QUOTA_EXCEEDED` |
| 쓰이고 있는 리소스는 삭제할 수 없다(인스턴스가 쓰는 보안 그룹·네트워크, 볼륨 그룹에 속한 볼륨) | `400 RESOURCE_IN_USE` |
| 권한이 없는 작업이나 프로젝트에는 접근할 수 없다 | `403 FORBIDDEN` |
| 토큰이 없거나 만료되면 안 된다 | `401 UNAUTHENTICATED`, `401 TOKEN_EXPIRED` |

### 환경변수

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORTAL_PORT` | `4173` | 포털 포트 |
| `TRANSITION_DELAY_MS` | `1000` | 상태 전이에 걸리는 시간(ms) |
| `TOKEN_TTL_SEC` | `3600` | 토큰 유효 시간(초). 짧게 줄여 실행 중 세션 만료를 재현한다 |
| `DEFECT_QUOTA_API_BYPASS` | `false` | 결함 주입: 쿼터를 넘는 인스턴스 생성을 API가 접수해 ERROR 인스턴스가 생긴다 |
| `DEFECT_RESIZE_MISMATCH` | `false` | 결함 주입: 사양 변경 후 화면에 표시되는 사양 이름이 갱신되지 않는다 |
| `FLAKY_SEED` | 실행마다 무작위 | Flaky 주입 난수 시드. 고정하면 같은 요청 순서에서 같은 결과가 나온다 |
| `FLAKY_RATE` | - | 모든 Flaky 확률의 기본값(0~1). 개별 확률 변수가 있으면 그 값을 쓴다 |
| `FLAKY_DELETE_LAG` | `false` | ① 볼륨 그룹 삭제 지연과 늦은 400 |
| `FLAKY_DELETE_LAG_RATE` / `FLAKY_DELETE_LAG_MS` | `0.5` / `1500` | ① DELETING을 길게 유지할 확률과 유지 시간(ms) |
| `FLAKY_DELETE_LATE_400_RATE` | `0.5` | ① 콘솔에 삭제 재전송을 지시해 늦은 400을 만들 확률 |
| `FLAKY_LATE_RESPONSE` | `false` | ② 보안 그룹 삭제 응답 혼선 |
| `FLAKY_LATE_RESPONSE_RATE` / `FLAKY_LATE_RESPONSE_MS` | `0.5` / `800` | ② 삭제 처리를 늦추고 재전송을 지시할 확률과 지연 시간(ms) |
| `FLAKY_UI_STALE` / `FLAKY_UI_STALE_RATE` | `false` / `0.5` | ③ 화면을 열 때 목록 자동 갱신을 끌지, 그 확률 |
| `FLAKY_NETWORK` / `FLAKY_NETWORK_RATE` | `false` / `0.5` | ④ 리소스 조회 요청의 연결을 끊을지, 그 확률 |
| `FLAKY_NETWORK_COOLDOWN_MS` | `3000` | ④ 한 번 끊은 경로를 다시 끊지 않는 시간(ms). 재시도하면 회복할 수 있게 한다 |
| `FLAKY_TOKEN_ROTATE` / `FLAKY_TOKEN_ROTATE_RATE` | `false` / `0.5` | ④ 세션 연장 시 토큰을 교체할지, 그 확률 |
