import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import { forbidden, unauthorized } from './errors.ts';
import { db } from './store.ts';
import type { Session, User } from './types.ts';

export const TOKEN_COOKIE = 'portal_token';

export interface AuthContext {
  user: User;
  session: Session;
  projectId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function issueSession(userId: string): Session {
  const session: Session = {
    token: randomBytes(16).toString('hex'),
    userId,
    expiresAt: Date.now() + config.tokenTtlSec * 1000,
  };
  db.sessions.set(session.token, session);
  return session;
}

/** 콘솔 화면과 테스트가 토큰을 읽을 수 있도록 HttpOnly를 걸지 않는다(Mock 전용). */
export function setTokenCookie(res: Response, session: Session): void {
  res.cookie(TOKEN_COOKIE, session.token, { path: '/', sameSite: 'lax', expires: new Date(session.expiresAt) });
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Authorization: Bearer 헤더를 먼저 보고, 없으면 쿠키의 토큰을 쓴다. */
function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return readCookie(req, TOKEN_COOKIE);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) throw unauthorized('UNAUTHENTICATED', '로그인이 필요합니다.');
  const session = db.sessions.get(token);
  if (!session) throw unauthorized('INVALID_TOKEN', '유효하지 않은 토큰입니다.');
  if (session.expiresAt <= Date.now()) {
    db.sessions.delete(token);
    throw unauthorized('TOKEN_EXPIRED', '세션이 만료되었습니다. 다시 로그인하세요.');
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) throw unauthorized('INVALID_TOKEN', '유효하지 않은 토큰입니다.');

  // 작업 대상 프로젝트는 X-Project-Id 헤더로 고른다. 없으면 사용자의 첫 프로젝트를 쓴다.
  const requested = req.headers['x-project-id'];
  const projectId = typeof requested === 'string' && requested !== '' ? requested : user.projectIds[0];
  if (!projectId || !user.projectIds.includes(projectId)) {
    throw forbidden('이 프로젝트에 접근할 권한이 없습니다.');
  }
  req.auth = { user, session, projectId };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.user.role !== 'admin') throw forbidden('관리자만 할 수 있는 작업입니다.');
  next();
}

export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthorized('UNAUTHENTICATED', '로그인이 필요합니다.');
  return req.auth;
}

export const publicUser = (user: User) => ({
  id: user.id, username: user.username, displayName: user.displayName, role: user.role, projectIds: user.projectIds,
});
