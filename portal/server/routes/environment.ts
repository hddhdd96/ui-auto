import { Router } from 'express';
import { authOf, requireAdmin, requireAuth } from '../auth.ts';
import { config } from '../config.ts';
import { db, FLAVORS, resetStore } from '../store.ts';
import type { Quota } from '../types.ts';
import { quotaOf, usageOf } from '../usage.ts';
import { notFound } from '../errors.ts';
import { flakyEvents, resetFlaky } from '../inject/flaky.ts';
import { requireInt, requireString } from '../validation.ts';
import { bodyOf } from './helpers.ts';

export const environmentRouter = Router();

/** 하네스가 테스트 대상을 고를 때 쓰는 환경 목록(가상). 로그인 없이 조회할 수 있다. */
environmentRouter.get('/environments', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.json([
    { id: 'local', name: '로컬 Mock 포털', baseUrl: origin, description: '개발자 PC 또는 CI 러너에서 띄운 포털' },
  ]);
});

environmentRouter.get('/projects', requireAuth, (req, res) => {
  const { user } = authOf(req);
  res.json(db.projects.filter((p) => user.projectIds.includes(p.id)));
});

environmentRouter.get('/flavors', requireAuth, (_req, res) => {
  res.json(FLAVORS);
});

environmentRouter.get('/quota', requireAuth, (req, res) => {
  res.json(quotaOf(authOf(req).projectId));
});

/** 쿼터 변경은 관리자만 할 수 있다. 보낸 항목만 바꾼다. */
environmentRouter.put('/quota', requireAuth, requireAdmin, (req, res) => {
  const quota = quotaOf(authOf(req).projectId);
  const body = bodyOf(req);
  const next: Quota = { ...quota };
  for (const key of Object.keys(quota) as (keyof Quota)[]) {
    if (body[key] !== undefined) next[key] = requireInt(body[key], key, 0, 100000);
  }
  Object.assign(quota, next);
  res.json(quota);
});

/** 대시보드용 사용량. 쿼터와 함께 돌려준다. */
environmentRouter.get('/usage', requireAuth, (req, res) => {
  const { projectId } = authOf(req);
  res.json({ projectId, usage: usageOf(projectId), quota: quotaOf(projectId) });
});

/** 테스트용: 모든 리소스와 쿼터를 초기 상태로 되돌린다. 로그인 세션은 유지한다. */
environmentRouter.post('/test/reset', (_req, res) => {
  resetStore();
  resetFlaky();
  res.json({ ok: true });
});

/** 테스트용: 지정한 토큰을 즉시 만료시킨다. 실행 중 세션이 만료되는 상황을 기다리지 않고 재현한다. */
environmentRouter.post('/test/expire-session', (req, res) => {
  const session = db.sessions.get(requireString(bodyOf(req).token, 'token'));
  if (!session) throw notFound('세션');
  session.expiresAt = Date.now() - 1;
  res.json({ ok: true });
});

/** 테스트용: Flaky 주입 이력. 실패가 환경 요인(주입된 지연·재전송)과 겹쳤는지 판단하는 근거로 쓴다. */
environmentRouter.get('/test/flaky-events', (_req, res) => {
  res.json(flakyEvents());
});

/** 테스트용: 현재 포털 설정을 보여준다. */
environmentRouter.get('/test/flags', (_req, res) => {
  res.json(config);
});
