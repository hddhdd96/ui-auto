/** 테스트 실행 설정. 계정은 Mock 포털의 가상 계정이며 환경변수로 바꿀 수 있다. */
export const testConfig = {
  projectId: process.env.PROJECT_ID ?? 'proj-alpha',
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin-pass',
  },
  member: {
    username: process.env.MEMBER_USERNAME ?? 'member',
    password: process.env.MEMBER_PASSWORD ?? 'member-pass',
  },
  /** 테스트가 만든 리소스 이름 앞에 붙인다. 일괄 삭제는 이 접두어로 대상을 고른다. */
  resourcePrefix: 'qa-',
  /** 상태 폴링 제한 시간과 간격(ms) */
  pollTimeoutMs: 10_000,
  pollIntervalMs: 100,
};

export type Credentials = { username: string; password: string };
