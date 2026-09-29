# API 자동화 포트폴리오 샘플

실제 API 자동화 업무에서 사용한 프로젝트 구성을 바탕으로 실행기, 공통 라이브러리, 제품별 흐름과 결과 관리를 분리한 구조를 소개합니다. 회사 소스 코드와 환경값은 포함하지 않고 폴더 역할과 안전한 진입점 예시만 제공합니다.

## 폴더 구조

```text
api-auto/
├── docs/                         # 구조·운영 가이드와 시나리오 템플릿
├── lib/                          # HTTP, 인증, 로깅, 환경 공통 처리
├── logs/                         # 로컬 실행 로그 위치 (로그 파일 제외)
├── products/
│   ├── product-a/
│   │   ├── config/               # 환경·리소스 ID·인증서 설정 경계
│   │   ├── scripts/
│   │   │   ├── common/           # 공통 실행·검증 함수
│   │   │   ├── cloud-platform/   # 제품 API 시나리오
│   │   │   └── storage/          # 스토리지 API 시나리오
│   │   └── main.sh               # 제품별 실행 진입점
│   └── product-b/
│       ├── config/
│       ├── scripts/
│       │   ├── cluster/          # 클러스터 관련 자동화
│       │   ├── common/           # 공통 요청·인증·실행 처리
│       │   └── scenarios/        # 제품별 API 흐름
│       ├── templates/            # 시나리오별 요청 템플릿 위치
│       └── main.sh
├── report/
│   ├── product-result/           # 제품별 실행 결과 위치
│   ├── product-script/           # 결과 생성·집계 도구
│   └── tc_registry/              # 테스트 케이스 등록 자료 위치
├── tools/                        # 폐쇄망 실행 도구 위치 (바이너리 미포함)
├── run.sh                        # 전체 실행 진입점
└── .gitignore
```

## 폴더를 나눈 이유

- 루트 `run.sh`와 제품별 `main.sh`를 분리해 제품 선택과 시나리오 구성을 독립적으로 확장할 수 있습니다.
- `lib/`에는 HTTP 요청, 인증, 로깅처럼 여러 제품에서 재사용되는 기능을 둡니다.
- `products/<product>/` 안에서 제품별 설정, 공통 함수, 시나리오와 템플릿을 함께 관리합니다.
- `report/`에서 테스트 명세, 집계 스크립트와 실행 결과를 구분해 결과 형식 변경이 시나리오에 번지지 않도록 합니다.
- 실행 로그, 실제 설정 파일, 인증서, 바이너리와 결과 데이터는 저장소에 포함하지 않습니다.

이 샘플은 실제 서비스에 요청을 보내지 않습니다. 실제 구현에서는 승인된 API 계약과 환경에서 검증한 요청만 연결합니다.

## 실행 흐름

```text
run.sh → products/<product>/main.sh → scenario → lib 공통 기능 → report
```

각 `run.sh`/`main.sh`는 포트폴리오 예시의 오작동을 막기 위해 실행을 거부합니다. 상세한 구조는 [아키텍처 설명](docs/architecture.md)과 [시나리오 템플릿](docs/scenario-template.md)을 참고하세요.
