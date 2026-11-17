import type {
  Flavor, Instance, Network, Project, Quota, SecurityGroup, Session, User, Volume, VolumeGroup,
} from './types.ts';

/** 모든 데이터는 가상이다. 실제 계정·프로젝트가 아니다. */
const USERS: User[] = [
  { id: 'user-admin', username: 'admin', password: 'admin-pass', displayName: '포털 관리자', role: 'admin', projectIds: ['proj-alpha', 'proj-beta'] },
  { id: 'user-member', username: 'member', password: 'member-pass', displayName: '일반 사용자', role: 'member', projectIds: ['proj-alpha'] },
];

const PROJECTS: Project[] = [
  { id: 'proj-alpha', name: 'Alpha 프로젝트' },
  { id: 'proj-beta', name: 'Beta 프로젝트' },
];

export const FLAVORS: Flavor[] = [
  { id: 'small', name: 'small (1 vCPU / 2 GB)', vcpus: 1, ramGb: 2 },
  { id: 'medium', name: 'medium (2 vCPU / 4 GB)', vcpus: 2, ramGb: 4 },
  { id: 'large', name: 'large (4 vCPU / 8 GB)', vcpus: 4, ramGb: 8 },
  { id: 'xlarge', name: 'xlarge (8 vCPU / 16 GB)', vcpus: 8, ramGb: 16 },
];

const DEFAULT_QUOTA: Quota = {
  instances: 5, vcpus: 16, ramGb: 32, volumes: 10, volumeGb: 500,
  volumeGroups: 3, networks: 3, securityGroups: 10,
};

interface State {
  /** 리셋할 때마다 1씩 올린다. 리셋 전에 예약된 상태 전이 타이머를 무시하는 데 쓴다. */
  epoch: number;
  seq: number;
  users: User[];
  projects: Project[];
  quotas: Map<string, Quota>;
  sessions: Map<string, Session>;
  instances: Map<string, Instance>;
  volumes: Map<string, Volume>;
  volumeGroups: Map<string, VolumeGroup>;
  networks: Map<string, Network>;
  securityGroups: Map<string, SecurityGroup>;
}

function initialState(epoch: number): State {
  const state: State = {
    epoch,
    seq: 0,
    users: USERS,
    projects: PROJECTS,
    quotas: new Map(PROJECTS.map((p) => [p.id, { ...DEFAULT_QUOTA }])),
    sessions: new Map(),
    instances: new Map(),
    volumes: new Map(),
    volumeGroups: new Map(),
    networks: new Map(),
    securityGroups: new Map(),
  };
  // 프로젝트마다 기본 네트워크·서브넷·보안 그룹을 하나씩 둔다.
  for (const project of PROJECTS) {
    const createdAt = new Date().toISOString();
    const netId = `net-default-${project.id}`;
    state.networks.set(netId, {
      id: netId, projectId: project.id, name: 'default-net', createdAt, status: 'ACTIVE',
      cidr: '10.0.0.0/16',
      subnets: [{ id: `sub-default-${project.id}`, name: 'default-subnet', cidr: '10.0.0.0/24' }],
    });
    const sgId = `sg-default-${project.id}`;
    state.securityGroups.set(sgId, {
      id: sgId, projectId: project.id, name: 'default-sg', createdAt, description: '기본 보안 그룹',
      rules: [{ direction: 'egress', protocol: 'tcp', port: null, cidr: '0.0.0.0/0' }],
    });
  }
  return state;
}

export let db: State = initialState(1);

/** 테스트용 리셋. 세션은 유지해서 로그인한 테스트가 끊기지 않게 한다. */
export function resetStore(): void {
  const sessions = db.sessions;
  db = initialState(db.epoch + 1);
  db.sessions = sessions;
}

export function nextId(prefix: string): string {
  db.seq += 1;
  return `${prefix}-${String(db.seq).padStart(4, '0')}`;
}
