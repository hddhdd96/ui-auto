import type { APIRequestContext } from '@playwright/test';
import type {
  Flavor, Instance, Network, Project, Quota, SecurityGroup, SecurityGroupRule, Subnet, Volume, VolumeGroup,
} from '../../portal/server/types';
import type { Credentials } from '../config';
import { Evidence } from './evidence';

/** 요청 하나와 그 요청의 응답을 짝지은 결과. */
export interface ApiResult<T = unknown> {
  request: { method: string; path: string };
  status: number;
  ok: boolean;
  body: T;
  /** 오류 응답일 때 { code, message, field } */
  error?: { code: string; message: string; field?: string };
}

export interface DeleteAccepted { successCount: number; failCount: number }
export interface UsageReport { projectId: string; usage: Quota; quota: Quota }

/** 로그인 상태. 스위트 안의 여러 클라이언트가 같은 세션을 함께 쓴다. */
export interface Session {
  credentials: Credentials;
  projectId: string;
  token: string | null;
  loginCount: number;
}

export const newSession = (credentials: Credentials, projectId: string): Session =>
  ({ credentials, projectId, token: null, loginCount: 0 });

/** 응답을 받지 못한 네트워크 오류인지(제품 응답이 아니라 환경 요인인지) 판단한다. */
export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /socket hang up|ECONNRESET|ECONNREFUSED|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED|ERR_CONNECTION|Failed to fetch/i.test(message);
}

export interface ApiClientOptions {
  /**
   * 조회(GET) 요청이 네트워크 오류로 끝났을 때 다시 보낼 횟수. 기본 0(다시 보내지 않음).
   * 조회는 여러 번 보내도 결과가 같으므로 재시도해도 판정이 바뀌지 않는다. 생성·변경·삭제는 재시도하지 않는다.
   */
  networkRetries?: number;
}

/**
 * Mock 포털 REST API 클라이언트.
 * 모든 요청과 응답을 증적에 남기고, 토큰이 무효가 되면 한 번 다시 로그인해서 요청을 이어간다.
 */
export class ApiClient {
  constructor(
    private readonly http: APIRequestContext,
    readonly session: Session,
    readonly evidence: Evidence = new Evidence(),
    private readonly options: ApiClientOptions = {},
  ) {}

  async login(): Promise<void> {
    const result = await this.send<{ token: string }>('POST', '/auth/login', this.session.credentials, false);
    if (!result.ok) throw new Error(`로그인 실패: HTTP ${result.status} ${result.error?.message ?? ''}`);
    this.session.token = result.body.token;
    this.session.loginCount += 1;
  }

  /** 요청을 보내고 응답을 그대로 돌려준다. 상태 코드로 예외를 던지지 않는다. */
  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    if (!this.session.token) await this.login();
    let result = await this.send<T>(method, path, body, true);
    if (result.status === 401) {
      // 토큰 만료·무효는 제품 실패가 아니라 환경 요인이다. 다시 로그인해서 같은 요청을 한 번 더 보낸다.
      await this.login();
      result = await this.send<T>(method, path, body, true);
    }
    return result;
  }

  /** 성공해야 하는 요청에 쓴다. 2xx가 아니면 요청과 응답을 담은 오류를 던진다. */
  async expectOk<T>(method: string, path: string, body?: unknown): Promise<T> {
    const result = await this.request<T>(method, path, body);
    if (!result.ok) {
      throw new Error(`${method} ${path} 실패: HTTP ${result.status} ${result.error?.code ?? ''} ${result.error?.message ?? ''}`);
    }
    return result.body;
  }

  private async send<T>(method: string, path: string, body: unknown, withAuth: boolean): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { 'x-project-id': this.session.projectId };
    if (withAuth && this.session.token) headers.authorization = `Bearer ${this.session.token}`;
    const startedAt = Date.now();
    const response = await this.fetchWithNetworkRetry(method, path, headers, body);
    const parsed = (await response.json().catch(() => null)) as { error?: ApiResult['error'] } | null;
    const status = response.status();
    this.evidence.recordHttp({
      method, path, status, errorCode: parsed?.error?.code, elapsedMs: Date.now() - startedAt,
    });
    return { request: { method, path }, status, ok: response.ok(), body: parsed as T, error: parsed?.error };
  }

  private async fetchWithNetworkRetry(method: string, path: string, headers: Record<string, string>, body: unknown) {
    const retries = method === 'GET' ? (this.options.networkRetries ?? 0) : 0;
    for (let attempt = 0; ; attempt += 1) {
      const startedAt = Date.now();
      try {
        return await this.http.fetch(`/api${path}`, { method, headers, data: body ?? undefined });
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        this.evidence.recordHttp({ method, path, status: 0, errorCode: 'NETWORK_ERROR', elapsedMs: Date.now() - startedAt });
        // 재시도를 쓰지 않는 클라이언트(개선 전 방식)는 원인을 분류하지 않고 오류를 그대로 던진다.
        if (retries === 0) throw error;
        const recovered = attempt < retries;
        this.evidence.recordCause('env', `${method} ${path} 네트워크 오류(${(error as Error).message.split('\n')[0]})${recovered ? ', 다시 보냄' : ''}`, recovered);
        if (!recovered) {
          throw new Error(`[env] ${method} ${path} 요청이 네트워크 오류로 ${attempt + 1}회 실패했습니다. 제품 응답이 아니라 환경 요인입니다.`, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  // ---------- 환경 조회 ----------
  projects = () => this.expectOk<Project[]>('GET', '/projects');
  flavors = () => this.expectOk<Flavor[]>('GET', '/flavors');
  quota = () => this.expectOk<Quota>('GET', '/quota');
  usage = () => this.expectOk<UsageReport>('GET', '/usage');

  // ---------- 목록 조회 ----------
  instances = () => this.expectOk<Instance[]>('GET', '/instances');
  volumes = () => this.expectOk<Volume[]>('GET', '/volumes');
  volumeGroups = () => this.expectOk<VolumeGroup[]>('GET', '/volume-groups');
  networks = () => this.expectOk<Network[]>('GET', '/networks');
  securityGroups = () => this.expectOk<SecurityGroup[]>('GET', '/security-groups');

  // ---------- 생성·변경 요청(접수만 한다. 완료 판정은 actions.ts에서 한다) ----------
  createInstance = (body: { name: string; flavorId: string; networkId: string; securityGroupIds?: string[] }) =>
    this.request<Instance>('POST', '/instances', body);
  resizeInstance = (id: string, flavorId: string) =>
    this.request<Instance>('POST', `/instances/${id}/resize`, { flavorId });
  createVolume = (body: { name: string; sizeGb: number }) => this.request<Volume>('POST', '/volumes', body);
  attachVolume = (id: string, instanceId: string) =>
    this.request<Volume>('POST', `/volumes/${id}/attach`, { instanceId });
  detachVolume = (id: string) => this.request<Volume>('POST', `/volumes/${id}/detach`);
  createVolumeGroup = (body: { name: string; volumeIds: string[] }) =>
    this.request<VolumeGroup>('POST', '/volume-groups', body);
  createNetwork = (body: { name: string; cidr: string }) => this.request<Network>('POST', '/networks', body);
  createSubnet = (networkId: string, body: { name: string; cidr: string }) =>
    this.request<Subnet>('POST', `/networks/${networkId}/subnets`, body);
  createSecurityGroup = (body: { name: string; description?: string; rules?: SecurityGroupRule[] }) =>
    this.request<SecurityGroup>('POST', '/security-groups', body);

  /** 삭제 요청. 응답은 '접수'만 뜻하므로 완료 판정에 쓰지 않는다. */
  delete = (kind: ResourceKind, id: string) => this.request<DeleteAccepted>('DELETE', `/${kind}/${id}`);

  /** 종류별 목록 조회. 삭제 완료 확인과 일괄 삭제에 쓴다. */
  list(kind: ResourceKind): Promise<{ id: string; name: string; status?: string }[]> {
    return this.expectOk('GET', `/${kind}`);
  }
}

export type ResourceKind = 'instances' | 'volumes' | 'volume-groups' | 'networks' | 'security-groups';
