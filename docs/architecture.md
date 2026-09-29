# 구조와 실행 흐름

```text
run.sh
  ├── products/product-a/main.sh
  │     ├── products/product-a/scripts/...
  │     └── lib/...
  └── products/product-b/main.sh
        ├── products/product-b/scripts/...
        ├── products/product-b/templates/...
        └── lib/...

report/tc_registry → report/product-script → report/product-result
```

| 경로 | 책임 |
| --- | --- |
| `run.sh` | 제품 실행 진입점을 호출하는 전체 실행기 |
| `products/<product>/main.sh` | 해당 제품 자동화의 실행 흐름 시작 |
| `products/<product>/scripts/` | 공통 함수와 제품별 시나리오 |
| `products/<product>/config/` | 로컬 환경, 리소스 ID, 인증서 설정 경계 |
| `products/<product>/templates/` | API 요청 템플릿 위치 |
| `lib/` | HTTP, 인증, 로깅과 환경 처리 등 공유 기능 |
| `report/` | 케이스 등록 자료, 결과 처리 도구와 생성 결과 |
| `logs/`, `tools/` | 로컬 로그와 폐쇄망 도구 위치 |

샘플에는 폴더와 실행 차단용 진입점만 있습니다. 실제 API 호출, 환경 설정, 요청 데이터, 실행 도구와 증적은 포함하지 않습니다.
