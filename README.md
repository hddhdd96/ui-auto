# Mock 클라우드 포털 QA 자동화 포트폴리오

작은 **Mock 클라우드 포털**(웹 콘솔 + REST API)을 직접 만들고, 그 위에 Playwright 기반 UI/API 테스트 자동화, 테스트 하네스(실행 → 증적 수집 → 결과서 자동 작성), GitHub Actions CI를 적용하는 저장소입니다.

> 이 저장소의 포털, 리소스, TC ID, 계정은 모두 가상입니다. 실제 회사·제품 정보는 들어 있지 않습니다.

## 진행 상태

단계별로 개발하고 있습니다. 완료한 단계만 체크합니다.

- [x] 0단계: 프로젝트 뼈대(TypeScript, ESLint, AI 작업 지침)
- [ ] 1단계: Mock 포털 REST API
- [ ] 2단계: 웹 콘솔 화면
- [ ] 3단계: REST API 자동화(상태 폴링, 남은 리소스 일괄 삭제)
- [ ] 4단계: Playwright UI E2E(Page Object Model)
- [ ] 5단계: 네거티브 dataset 테스트
- [ ] 6단계: 결함 주입과 결함 재현 테스트
- [ ] 7단계: Flaky 재현과 안정화(naive / stable 비교)
- [ ] 8단계: 실패 증적 수집과 실패 원인 자동 분류
- [ ] 9단계: 테스트 하네스와 Excel·PPT 결과서
- [ ] 10단계: CI 가드레일(판정 완화 변경 차단)
- [ ] 11단계: GitHub Actions 워크플로
- [ ] 12단계: 시연 시나리오와 이력서 대응표 정리

## 지금 실행할 수 있는 것

Node.js 20 이상이 필요합니다.

```bash
npm ci
npm run lint
npm run typecheck
npm run portal
```

`npm run portal`을 실행하면 `http://127.0.0.1:4173/api/health`에서 포털 상태를 확인할 수 있습니다.
