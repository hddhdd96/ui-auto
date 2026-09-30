# Private Cloud UI Test Automation (Playwright)

This repository is a sanitized reconstruction of a Playwright automation framework used in a private cloud QA environment.

Private Cloud 콘솔의 **반복 UI 회귀 테스트**를 Playwright + TypeScript로 자동화한 경험을, 제품·고객·인프라 정보를 제거한 뒤 공개용으로 재구성한 프로젝트입니다.

---

## Overview

현장에서는 리소스 생성 → 상태 확인 → 상세 검증 → 증적 캡처 → 삭제를 수동으로 반복했습니다.  
이 프레임워크는 그 흐름을 E2E 자동화로 옮겨, 회귀 시간을 줄이고 실패 지점을 리포트·스크린샷으로 남기도록 설계했습니다.

공개 저장소는 전체 제품 스펙을 옮기지 않고, **설계(POM · fixture · storageState · lifecycle · evidence)** 와 **실행 가능한 Public Demo**를 함께 보여 줍니다.

---

## Results

업무 기준(개인 담당 범위)의 자동화 성과입니다.

| Metric | Value |
|---|---|
| Regression TC | 65 |
| Automation Target | 60 |
| Automated | 60 |
| Implementation rate | **60 / 60 automation target = 100%** |
| Overall (of 65) | **60 / 65 regression test cases automated** |
| Defects found via automation | 약 3건 |

> “Automation Coverage 100%”처럼 65개 전체를 자동화한 표현은 사용하지 않습니다.

---

## Background

- 릴리즈마다 반복되는 UI 회귀
- 리소스 생성 / 상태 대기 / 검증 / 삭제 루프
- 현장·원격 환경에서의 장시간 수동 확인
- 단계별 스크린샷 증적의 수작업
- 동일 시나리오 반복에 따른 QA 리소스 소모

---

## Tech Stack

| Stack | Role |
|---|---|
| Playwright Test (^1.62) | E2E 실행 |
| TypeScript | 타입 안전한 Page Object · fixture |
| Node.js / npm | 실행 환경 |
| dotenv | `BASE_URL`, 계정 등 환경 분리 |
| HTML · List reporter | 실행 결과 |
| screenshot / video / trace | 실패·단계 증적 (설정상 사용) |

---

## Architecture

```text
Test Spec
   ↓
Fixture (Page Object 주입)
   ↓
Page Object (locator + action)
   ↓
UI
   ↓
Assertion (상태 기반 대기)
   ↓
Evidence (screenshot attach) / HTML Report
```

```text
.
├── auth/
│   └── auth.setup.ts          # 로그인 1회 → storageState 저장
├── pages/
│   ├── BasePage.ts
│   ├── auth/LoginPage.ts
│   ├── compute/InstancePage.ts
│   └── storage/VolumePage.ts
├── fixtures/
│   └── base-test.ts           # test.extend 로 Page·Evidence 주입
├── data/
│   └── volume-test-data.ts
├── utils/
│   ├── evidence-recorder.ts   # 단계 스크린샷 첨부
│   └── test-logger.ts
├── tests/
│   ├── testsuite/storage/     # 업무형 시나리오 (실 BASE_URL)
│   ├── demo/                  # 공개 사이트 실행 데모
│   └── unit/
├── playwright.config.ts
├── .env.example
└── package.json
```

| Path | Responsibility |
|---|---|
| `pages/` | Locator·UI 동작을 캡슐화해 스펙에서 UI 세부사항을 분리 |
| `fixtures/` | Page Object·증적 헬퍼를 테스트에 주입 |
| `auth/` | storageState 기반 세션 재사용 |
| `tests/testsuite/` | 클라우드 콘솔 lifecycle 시나리오 |
| `tests/demo/` | 회사 UI 없이 실행 가능한 Public Demo |

---

## Test Flow

대표 시나리오: **Volume lifecycle**

```text
Authentication (storageState)
        ↓
Navigate to Storage / Volumes
        ↓
Create Volume
        ↓
Wait until Active   ← expect 기반 폴링 (고정 sleep 지양)
        ↓
Validate row / status
        ↓
Capture evidence screenshot
        ↓
Delete Volume
        ↓
Verify removal
```

업무 원본에서도 create 모듈과 delete 모듈을 나누고, 인스턴스·볼륨 등은 목록의 상태가 Active가 될 때까지 대기한 뒤 증적을 남기는 방식을 사용했습니다.

---

## Key Implementation

### Page Object Model

Locator와 사용자 동작을 `VolumePage` / `InstancePage`에 모아, 스펙은 시나리오 의도만 읽히게 합니다.  
UI 라벨·구조 변경 시 Page 수정 범위로 영향을 제한합니다.

### Custom fixture

`fixtures/base-test.ts`에서 `test.extend`로 Page Object와 `EvidenceRecorder`를 주입합니다.  
원본 업무 코드의 product fixture와 같은 역할입니다.

### Authentication · storageState

`auth/auth.setup.ts`에서 로그인 후 `storageState`를 저장하고, chromium 프로젝트가 이를 재사용합니다.  
원본의 `globalSetup` + `.playwright/auth/*.json` 패턴과 같습니다.

### Status wait

`waitUntilActive`는 `waitForTimeout` 대신 `expect(...).toBeVisible({ timeout })`으로 상태 텍스트를 폴링합니다.

### Evidence

검증 직후 `EvidenceRecorder.capture()`로 스크린샷을 테스트 리포트에 첨부합니다.  
원본의 step 증적(`captureStep`)과 같은 목적입니다.

### Reporter

`list` + `html` reporter, 실패 시 `screenshot` / `video` / `trace` 를 남기도록 설정했습니다.

---

## How to Run

```bash
npm install
npx playwright install chromium

cp .env.example .env
# 실 콘솔을 쓸 때만 BASE_URL / USERNAME / PASSWORD 설정

# Public Demo (회사 UI 불필요)
npm run test:demo

# 단위 테스트
npm run test:unit

# 실환경 lifecycle (BASE_URL 필요)
npm run test:e2e

# HTML 리포트
npm run report
```

---

## Public Demo

`tests/demo/todo-lifecycle.spec.ts`는 [Playwright TodoMVC Demo](https://demo.playwright.dev/todomvc/)를 대상으로

**추가 → 검증 → 완료 → 삭제** 흐름을 실행합니다.

업무용 sanitized example(`tests/testsuite`)과 실행용 demo를 구분해 두었습니다.

---

## Confidentiality

- 회사명 / 제품명 / 고객사명 / 내부 URL·IP → 제거 또는 `$BASE_URL`
- 계정·Password·Token → `.env` (커밋하지 않음)
- 제품 고유 메뉴·문구·Selector → Storage / Volume / Instance 등 일반 명칭
- 실 UI Screenshot / Video / Trace / HTML Report 산출물 → 저장소에 포함하지 않음

This repository is a sanitized reconstruction of a Playwright automation framework used in a private cloud QA environment.

실서비스·사내 자격증명으로 공개 Demo 이외의 스펙을 돌리지 마세요.
