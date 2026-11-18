import { Router } from 'express';
import { authOf, issueSession, publicUser, requireAuth, setTokenCookie, TOKEN_COOKIE } from '../auth.ts';
import { config } from '../config.ts';
import { unauthorized } from '../errors.ts';
import { chance, recordFlaky } from '../inject/flaky.ts';
import { db } from '../store.ts';
import { requireString } from '../validation.ts';
import { bodyOf } from './helpers.ts';

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const body = bodyOf(req);
  const username = requireString(body.username, 'username');
  const password = requireString(body.password, 'password');
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) throw unauthorized('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  const session = issueSession(user.id);
  setTokenCookie(res, session);
  res.json({ token: session.token, expiresAt: new Date(session.expiresAt).toISOString(), user: publicUser(user) });
});

/** 세션 연장. 정상 모드에서는 같은 토큰의 만료 시간만 늘린다. */
authRouter.post('/auth/extend', requireAuth, (req, res) => {
  const { session, user } = authOf(req);
  const flaky = config.flaky.tokenRotate;
  if (flaky.enabled && chance(flaky.rate)) {
    // [Flaky 주입 ④: FLAKY_TOKEN_ROTATE] 연장할 때 토큰을 새로 발급하고 이전 토큰은 무효화한다.
    // 브라우저 쿠키는 새 토큰으로 바뀌지만, 이전 토큰을 들고 있는 API 호출은 401을 받는다.
    db.sessions.delete(session.token);
    const rotated = issueSession(user.id);
    setTokenCookie(res, rotated);
    recordFlaky('token-rotate', `세션 연장 시 토큰 교체: ${session.token.slice(0, 6)}… → ${rotated.token.slice(0, 6)}…`);
    res.json({ token: rotated.token, expiresAt: new Date(rotated.expiresAt).toISOString() });
    return;
  }
  session.expiresAt = Date.now() + config.tokenTtlSec * 1000;
  setTokenCookie(res, session);
  res.json({ token: session.token, expiresAt: new Date(session.expiresAt).toISOString() });
});

authRouter.post('/auth/logout', requireAuth, (req, res) => {
  db.sessions.delete(authOf(req).session.token);
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  const { user, session, projectId } = authOf(req);
  res.json({ user: publicUser(user), projectId, expiresAt: new Date(session.expiresAt).toISOString() });
});
