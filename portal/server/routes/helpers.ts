import type { Request } from 'express';
import { authOf } from '../auth.ts';
import { notFound } from '../errors.ts';

/** 현재 프로젝트에 속한 항목만 생성 순서대로 돌려준다. */
export function listInProject<T extends { projectId: string }>(req: Request, items: Map<string, T>): T[] {
  const { projectId } = authOf(req);
  return [...items.values()].filter((item) => item.projectId === projectId);
}

/** 현재 프로젝트에 속한 항목을 ID로 찾는다. 다른 프로젝트의 항목은 없는 것으로 취급한다. */
export function findInProject<T extends { projectId: string }>(
  req: Request, items: Map<string, T>, id: unknown, what: string,
): T {
  const item = typeof id === 'string' ? items.get(id) : undefined;
  if (!item || item.projectId !== authOf(req).projectId) throw notFound(what);
  return item;
}

export function newBase(req: Request, id: string, name: string) {
  return { id, projectId: authOf(req).projectId, name, createdAt: new Date().toISOString() };
}

/** 삭제 요청의 응답 형식. 삭제는 비동기로 진행되므로 이 응답은 '접수됨'만 뜻한다. */
export const deleteAccepted = () => ({ successCount: 1, failCount: 0 });

export const bodyOf = (req: Request): Record<string, unknown> =>
  typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
