/** 테스트 실행 설정. 계정은 Mock 포털의 가상 계정이며 환경변수로 바꿀 수 있다. */
export const testConfig = {
  /** 테스트 대상 프로젝트. 하네스가 API로 조회한 목록에서 골라 PROJECT_ID로 넘긴다. */
  projectId: process.env.PROJECT_ID ?? 'proj-alpha',
  /** 일반 사용자 계정이 속한 프로젝트 */
  memberProjectId: process.env.MEMBER_PROJECT_ID ?? 'proj-alpha',
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
