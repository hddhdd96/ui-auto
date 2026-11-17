import { conflict } from './errors.ts';
import { db, FLAVORS } from './store.ts';
import type { Quota } from './types.ts';

const inProject = <T extends { projectId: string }>(items: Iterable<T>, projectId: string) =>
  [...items].filter((item) => item.projectId === projectId);

export const flavorOf = (flavorId: string) => FLAVORS.find((f) => f.id === flavorId);

/** 프로젝트의 현재 사용량. 실제 리소스 목록에서 매번 다시 계산한다. */
export function usageOf(projectId: string): Quota {
  const instances = inProject(db.instances.values(), projectId);
  const volumes = inProject(db.volumes.values(), projectId);
  return {
    instances: instances.length,
    vcpus: instances.reduce((sum, i) => sum + (flavorOf(i.flavorId)?.vcpus ?? 0), 0),
    ramGb: instances.reduce((sum, i) => sum + (flavorOf(i.flavorId)?.ramGb ?? 0), 0),
    volumes: volumes.length,
    volumeGb: volumes.reduce((sum, v) => sum + v.sizeGb, 0),
    volumeGroups: inProject(db.volumeGroups.values(), projectId).length,
    networks: inProject(db.networks.values(), projectId).length,
    securityGroups: inProject(db.securityGroups.values(), projectId).length,
  };
}

export function quotaOf(projectId: string): Quota {
  const quota = db.quotas.get(projectId);
  if (!quota) throw new Error(`쿼터가 없는 프로젝트: ${projectId}`);
  return quota;
}

/** 추가로 쓰려는 양(delta)을 더했을 때 쿼터를 넘는 항목을 돌려준다. */
export function exceededQuota(projectId: string, delta: Partial<Quota>): (keyof Quota)[] {
  const usage = usageOf(projectId);
  const quota = quotaOf(projectId);
  return (Object.keys(delta) as (keyof Quota)[]).filter(
    (key) => usage[key] + (delta[key] ?? 0) > quota[key],
  );
}

/** 쿼터를 넘으면 409 QUOTA_EXCEEDED를 던진다. */
export function assertQuota(projectId: string, delta: Partial<Quota>): void {
  const exceeded = exceededQuota(projectId, delta);
  if (exceeded.length > 0) {
    throw conflict('QUOTA_EXCEEDED', `쿼터를 초과했습니다: ${exceeded.join(', ')}`);
  }
}
