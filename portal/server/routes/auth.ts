import { Router } from 'express';
import { authOf, issueSession, publicUser, requireAuth, setTokenCookie, TOKEN_COOKIE } from '../auth.ts';
import { config } from '../config.ts';
import { unauthorized } from '../errors.ts';
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
  const { session } = authOf(req);
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
