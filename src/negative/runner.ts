import type { APIRequestContext } from '@playwright/test';
import { accepted, attachVolumeAndWait, createInstanceAndWait, createVolumeAndWait, deleteAndWait, waitUntilSettled } from '../api/actions';
import type { ApiClient, ApiResult, ResourceKind } from '../api/client';
import type { Quota } from '../../portal/server/types';
import type { Actor, NegativeCase, SetupStep } from './dataset';

export interface RunContext {
  /** 준비·검증에 쓰는 관리자 클라이언트 */
  api: ApiClient;
  memberApi: ApiClient;
  /** 쿠키가 없는 요청 컨텍스트. 주체별 토큰을 헤더로 직접 넣는다. */
  bare: APIRequestContext;
  projectId: string;
  uniqueName: (label: string) => string;
}

/** 준비 단계를 실행하고, 자리표시자에 쓸 값을 돌려준다. */
export async function runSetup(ctx: RunContext, steps: SetupStep[], networkId: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  const remember = (as: string, item: { id: string; name: string }) => {
    vars[`${as}.id`] = item.id;
    vars[`${as}.name`] = item.name;
  };
  for (const step of steps) {
    switch (step.type) {
      case 'instance':
        remember(step.as, await createInstanceAndWait(ctx.api, {
          name: ctx.uniqueName(step.as), flavorId: step.flavorId ?? 'small', networkId,
        }));
        break;
      case 'instanceCreating':
        remember(step.as, accepted(await ctx.api.createInstance({
          name: ctx.uniqueName(step.as), flavorId: step.flavorId ?? 'small', networkId,
        })));
        break;
      case 'volume':
        remember(step.as, await createVolumeAndWait(ctx.api, { name: ctx.uniqueName(step.as), sizeGb: step.sizeGb ?? 10 }));
        break;
      case 'attach': {
        const volumeId = vars[`${step.volume}.id`];
        const instanceId = vars[`${step.instance}.id`];
        if (!volumeId || !instanceId) throw new Error(`attach 준비 단계가 참조하는 리소스가 없습니다: ${step.volume}, ${step.instance}`);
        await attachVolumeAndWait(ctx.api, volumeId, instanceId);
        break;
      }
      case 'network': {
        const network = accepted(await ctx.api.createNetwork({ name: ctx.uniqueName(step.as), cidr: step.cidr }));
        for (const cidr of step.subnets ?? []) {
          accepted(await ctx.api.createSubnet(network.id, { name: ctx.uniqueName('sub'), cidr }));
        }
        remember(step.as, network);
        break;
      }
      case 'quota':
        await ctx.api.expectOk('PUT', '/quota', step.values);
        break;
    }
  }
  return vars;
}

/** 주체에 맞는 토큰을 준비한다. 401을 받아도 다시 로그인하지 않도록 ApiClient를 거치지 않는다. */
async function tokenFor(ctx: RunContext, actor: Actor): Promise<string | null> {
  switch (actor) {
    case 'admin':
    case 'member': {
      const client = actor === 'admin' ? ctx.api : ctx.memberApi;
      await client.expectOk('GET', '/auth/me');
      return client.session.token;
    }
    case 'anonymous':
      return null;
    case 'invalidToken':
      return 'invalid-token-for-negative-test';
    case 'expiredToken': {
      // 이 케이스만의 세션을 새로 만들어 즉시 만료시킨다. 다른 테스트의 세션은 건드리지 않는다.
      const login = await ctx.bare.post('/api/auth/login', { data: ctx.api.session.credentials });
      const { token } = (await login.json()) as { token: string };
      await ctx.bare.post('/api/test/expire-session', { data: { token } });
      return token;
    }
  }
}

/** 케이스의 요청을 그대로 보내고, 요청과 응답을 짝지은 결과를 돌려준다. 증적에도 남긴다. */
export async function sendCaseRequest(ctx: RunContext, request: NegativeCase['request']): Promise<ApiResult> {
  const token = await tokenFor(ctx, request.as ?? 'admin');
  const headers: Record<string, string> = { 'x-project-id': request.projectId ?? ctx.projectId };
  if (token) headers.authorization = `Bearer ${token}`;
  const startedAt = Date.now();
  const response = await ctx.bare.fetch(`/api${request.path}`, { method: request.method, headers, data: request.body });
  const body = (await response.json().catch(() => null)) as { error?: ApiResult['error'] } | null;
  ctx.api.evidence.recordHttp({
    method: request.method, path: request.path, status: response.status(),
    errorCode: body?.error?.code, elapsedMs: Date.now() - startedAt,
  });
  return {
    request: { method: request.method, path: request.path },
    status: response.status(), ok: response.ok(), body, error: body?.error,
  };
}

/** 경계값 통과 케이스가 만든 리소스를 지운다. 이름에 qa- 접두어가 없을 수 있어 일괄 삭제에 맡기지 않는다. */
export async function removeCreated(api: ApiClient, kind: ResourceKind, name: string): Promise<void> {
  const created = (await api.list(kind)).find((item) => item.name === name);
  if (!created) return;
  await waitUntilSettled(api, kind, created.id);
  await deleteAndWait(api, kind, created.id);
}

/** 쿼터를 바꾸는 케이스를 위해 원래 쿼터를 저장해 두고, 끝나면 되돌린다. */
export async function withQuotaRestored<T>(api: ApiClient, run: () => Promise<T>): Promise<T> {
  const original: Quota = await api.quota();
  try {
    return await run();
  } finally {
    await api.expectOk('PUT', '/quota', original);
  }
}

/** POST /instances 같은 생성 요청이면 리소스 종류를 돌려준다. */
export function createdKind(request: NegativeCase['request']): ResourceKind | null {
  if (request.method !== 'POST') return null;
  const kinds: ResourceKind[] = ['instances', 'volumes', 'volume-groups', 'networks', 'security-groups'];
  return kinds.find((kind) => request.path === `/${kind}`) ?? null;
}
