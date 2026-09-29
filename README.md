# API 자동화 포트폴리오 샘플

폐쇄망 환경에서도 적용할 수 있는 API 자동화 프로젝트의 구조를 민감 정보 없이 소개합니다.

셸 기반 자동화 프레임워크를 공통 HTTP 요청, 인증, 로그, 리포트 기능과 제품별 시나리오로 나누어 구성했습니다. 실제 제품명, 엔드포인트, 계정 정보, 인증서, 리소스 식별자, 고객 데이터와 실행 결과는 포함하지 않았습니다.

## 폴더 구조

```text
api-auto/
├── config/
│   └── environments.example.env  # 설정 변수와 안전한 예시값
├── docs/
│   ├── architecture.md
│   └── scenario-template.md
├── lib/
│   ├── auth.sh                   # 인증 공통 인터페이스
│   ├── http.sh                   # 공통 요청 인터페이스
│   ├── logger.sh
│   └── report.sh
├── products/
│   ├── cloud-api/
│   │   ├── scenarios/
│   │   └── run.sh
│   ├── container-api/
│   │   ├── scenarios/
│   │   └── run.sh
│   └── storage-api/
│       ├── scenarios/
│       └── run.sh
├── reports/                      # Git에서 제외되는 실행 결과
├── scripts/
│   └── run-suite.sh
├── .env.example
└── .gitignore
```

## 설계

- `lib/`에 요청 처리, 인증 경계, 로그 형식, 결과 출력을 모아 재사용합니다.
- `products/`에서 제품별 흐름을 관리하고 각 시나리오를 독립적으로 실행할 수 있게 구성합니다.
- `config/`에는 설정 구조만 문서화하고 실제 환경값과 비밀 정보는 저장소 밖에 둡니다.
- `reports/`는 생성되는 결과물을 보관하는 위치이며 Git 추적에서 제외합니다.

이 파일들은 실제 서비스에 바로 실행하는 테스트가 아니라 구조 예시입니다. 실제 환경에서는 승인된 대상과 검증된 요청 규격을 사용해야 합니다.

## 설정

`.env.example`을 로컬 환경 파일로 복사한 뒤 실행 환경에 맞는 값을 입력합니다. 계정 비밀번호, 토큰, 개인 키, 고객 URL, 고객 데이터가 포함된 응답은 커밋하지 않습니다.

## 실행 흐름 예시

```text
전체 실행기 → 제품 실행기 → 시나리오 → 공통 HTTP/인증 도구 → 리포트
```

[구조 설명](docs/architecture.md)과 [시나리오 템플릿](docs/scenario-template.md)을 참고하세요.
