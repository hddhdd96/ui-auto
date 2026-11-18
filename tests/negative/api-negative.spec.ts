import path from 'node:path';
import { ApiClient } from '../../src/api/client';
import { loadApiDatasets, resolvePlaceholders } from '../../src/negative/dataset';
import type { Verify } from '../../src/negative/dataset';
import { createdKind, removeCreated, runSetup, sendCaseRequest, withQuotaRestored } from '../../src/negative/runner';
import type { RunContext } from '../../src/negative/runner';
import { defaults, expect, test } from '../../src/fixtures/api';

/**
 * 네거티브 dataset 실행기. 케이스는 tests/negative/datasets/api-*.json에 있고 이 파일에는 판정 절차만 있다.
 * 판정 절차:
 *   1. 응답 코드·오류 코드·오류 필드가 기대와 같은지 확인한다.
 *   2. 응답만 믿지 않고 목록 API로 실제 상태를 확인한다(리소스가 생기지 않았는지, 그대로 남아 있는지).
 *   3. 거부된 요청이면 프로젝트 사용량과 쿼터가 바뀌지 않았는지 확인한다.
 */
const cases = loadApiDatasets(path.join(import.meta.dirname, 'datasets'));
const areas = [...new Set(cases.map((c) => c.area))];

async function verifyActualState(ctx: RunContext, rule: Verify): Promise<void> {
  if ('name' in rule) {
    const found = (await ctx.api.list(rule.kind)).filter((item) => item.name === rule.name);
    expect(found, `목록 API에서 이름이 '${rule.name}'인 ${rule.kind} 수`).toHaveLength(rule.count);
    return;
  }
  const client = rule.projectId
    ? new ApiClient(ctx.bare, { ...ctx.api.session, projectId: rule.projectId }, ctx.api.evidence)
    : ctx.api;
  const item = (await client.list(rule.kind)).find((i) => i.id === rule.id);
  expect(item, `목록 API에 ${rule.kind} ${rule.id}가 남아 있어야 한다`).toBeDefined();
  if (rule.fields) expect(item, `${rule.kind} ${rule.id}의 실제 상태`).toMatchObject(rule.fields);
  if (rule.statusIn) expect(rule.statusIn, `${rule.kind} ${rule.id}의 실제 상태`).toContain(item?.status);
}

/**
 * 프로젝트에 따라 달라지는 값. dataset은 프로젝트 ID를 직접 쓰지 않고 이 자리표시자를 쓴다.
 * project: 테스트 대상 프로젝트, other: 관리자가 접근할 수 있는 다른 프로젝트, member: 일반 사용자의 프로젝트
 */
function projectVars(ctx: RunContext): Record<string, string> {
  const ids = (projectId: string, prefix: string) => ({
    [`${prefix}.id`]: projectId,
    [`${prefix}.project`]: projectId,
    [`${prefix}.network`]: `net-default-${projectId}`,
    [`${prefix}.sg`]: `sg-default-${projectId}`,
  });
  const other = ctx.projectId === 'proj-alpha' ? 'proj-beta' : 'proj-alpha';
  return { ...ids(ctx.projectId, 'project'), ...ids(other, 'other'), ...ids(ctx.memberApi.session.projectId, 'member') };
}

for (const area of areas) {
  test.describe(`네거티브 dataset: ${area}`, () => {
    for (const c of cases.filter((x) => x.area === area)) {
      test(`${c.id} ${c.title}`, { tag: ['@negative', `@risk-${c.risk}`, `@${c.category}`] },
        async ({ api, memberApi, playwright, baseURL, uniqueName }) => {
          const bare = await playwright.request.newContext({ baseURL });
          const ctx: RunContext = { api, memberApi, bare, projectId: api.session.projectId, uniqueName };

          const run = async () => {
            const vars = { unique: uniqueName('neg'), ...projectVars(ctx), ...(await runSetup(ctx, c.setup ?? [], defaults.networkId)) };
            const request = resolvePlaceholders(c.request, vars);
            const verify = resolvePlaceholders(c.verify ?? [], vars);
            const before = { usage: (await api.usage()).usage, quota: await api.quota() };

            const result = await sendCaseRequest(ctx, request);

            expect(result.status, `${request.method} ${request.path} 응답 코드`).toBe(c.expect.status);
            if (c.expect.code) expect(result.error?.code, '오류 코드').toBe(c.expect.code);
            if (c.expect.field) expect(result.error?.field, '오류 필드').toBe(c.expect.field);

            for (const rule of verify) await verifyActualState(ctx, rule);

            if (result.ok) {
              // 경계값 통과 케이스: 만든 리소스를 지운다.
              const kind = createdKind(request);
              if (kind) await removeCreated(api, kind, (request.body as { name: string }).name);
            } else {
              expect((await api.usage()).usage, '거부된 요청 뒤 사용량').toEqual(before.usage);
              expect(await api.quota(), '거부된 요청 뒤 쿼터').toEqual(before.quota);
            }
          };

          try {
            if (c.setup?.some((step) => step.type === 'quota')) await withQuotaRestored(api, run);
            else await run();
          } finally {
            await bare.dispose();
          }
        });
    }
  });
}
