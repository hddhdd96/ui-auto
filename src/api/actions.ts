import type { Instance, Volume, VolumeGroup } from '../../portal/server/types';
import type { ApiClient, ApiResult, ResourceKind } from './client';
import { poll } from './poll';

/** 실패로 보는 상태. 이 상태가 보이면 제한 시간까지 기다리지 않고 바로 실패 처리한다. */
const FAILED_STATES = ['ERROR', 'FAILED'];

const KIND_LABEL: Record<ResourceKind, string> = {
  instances: '인스턴스', volumes: '볼륨', 'volume-groups': '볼륨 그룹', networks: '네트워크', 'security-groups': '보안 그룹',
};

type Listed = { id: string; name: string; status?: string; fault?: string | null };

async function findInList(client: ApiClient, kind: ResourceKind, id: string): Promise<Listed | undefined> {
  return (await client.list(kind)).find((item) => item.id === id);
}

/** 접수 응답이 2xx인지 확인하고 본문을 돌려준다. 여기까지는 '요청 성공'일 뿐이다. */
export function accepted<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `${result.request.method} ${result.request.path} 요청이 거부됐습니다: HTTP ${result.status} ${result.error?.code ?? ''} ${result.error?.message ?? ''}`,
    );
  }
  return result.body;
}

/** 목록 API에서 리소스가 목표 상태가 될 때까지 기다린다. ERROR·FAILED면 바로 실패한다. */
export async function waitForStatus<T extends Listed>(
  client: ApiClient, kind: ResourceKind, id: string, target: string,
): Promise<T> {
  const found = await poll({
    what: `${KIND_LABEL[kind]} ${id} → ${target}`,
    evidence: client.evidence,
    read: () => findInList(client, kind, id),
    isDone: (item) => item?.status === target,
    failure: (item) => {
      if (!item) return '목록에서 리소스를 찾을 수 없습니다.';
      if (item.status && FAILED_STATES.includes(item.status)) {
        return `상태가 ${item.status}입니다.${item.fault ? ` 원인: ${item.fault}` : ''}`;
      }
      return null;
    },
    describe: (item) => item?.status ?? '목록에 없음',
  });
  return found as T;
}

/** 목록 API에서 리소스가 사라질 때까지 기다린다. 삭제가 실제로 끝났는지 확인하는 기준이다. */
export async function waitForGone(client: ApiClient, kind: ResourceKind, id: string): Promise<void> {
  await poll({
    what: `${KIND_LABEL[kind]} ${id} → 목록에서 사라짐`,
    evidence: client.evidence,
    read: () => findInList(client, kind, id),
    isDone: (item) => item === undefined,
    failure: (item) =>
      item?.status && FAILED_STATES.includes(item.status) ? `삭제 중 상태가 ${item.status}가 됐습니다.` : null,
    describe: (item) => item?.status ?? (item ? '목록에 있음' : '목록에 없음'),
  });
}

/** 생성·삭제·변경이 진행 중인 상태(…ING)가 끝날 때까지 기다린다. */
export async function waitUntilSettled(client: ApiClient, kind: ResourceKind, id: string): Promise<Listed | undefined> {
  return poll({
    what: `${KIND_LABEL[kind]} ${id} → 진행 중 상태 종료`,
    evidence: client.evidence,
    read: () => findInList(client, kind, id),
    isDone: (item) => !item?.status?.endsWith('ING'),
    describe: (item) => item?.status ?? (item ? '목록에 있음' : '목록에 없음'),
  });
}

/**
 * 리소스를 삭제하고 실제로 사라졌는지 확인한다.
 * - 2xx: 접수됐을 뿐이므로 목록에서 사라질 때까지 기다린다.
 * - 400·404: 응답만으로는 결과를 알 수 없다. 목록 API로 실제 상태를 다시 확인한다.
 *   이미 없거나 삭제 중이면 삭제가 진행된 것이고, 그대로 남아 있으면 삭제가 거부된 것이다.
 */
export async function deleteAndWait(client: ApiClient, kind: ResourceKind, id: string): Promise<void> {
  const result = await client.delete(kind, id);
  if (!result.ok) {
    if (result.status !== 400 && result.status !== 404) accepted(result);
    const actual = await findInList(client, kind, id);
    client.evidence.recordPoll(
      `${KIND_LABEL[kind]} ${id} 삭제 응답 HTTP ${result.status} 후 실제 상태 재확인`,
      actual?.status ?? (actual ? '목록에 있음' : '목록에 없음'),
    );
    if (actual && actual.status !== 'DELETING') {
      throw new Error(
        `${KIND_LABEL[kind]} ${id} 삭제가 거부됐고 리소스가 그대로 남아 있습니다: HTTP ${result.status} ${result.error?.code ?? ''} ${result.error?.message ?? ''}`,
      );
    }
  }
  await waitForGone(client, kind, id);
}

// ---------- 요청 + 완료 확인을 묶은 동작 ----------

export async function createInstanceAndWait(
  client: ApiClient, body: Parameters<ApiClient['createInstance']>[0],
): Promise<Instance> {
  const created = accepted(await client.createInstance(body));
  return waitForStatus<Instance>(client, 'instances', created.id, 'ACTIVE');
}

export async function resizeInstanceAndWait(client: ApiClient, id: string, flavorId: string): Promise<Instance> {
  accepted(await client.resizeInstance(id, flavorId));
  return waitForStatus<Instance>(client, 'instances', id, 'ACTIVE');
}

export async function createVolumeAndWait(client: ApiClient, body: { name: string; sizeGb: number }): Promise<Volume> {
  const created = accepted(await client.createVolume(body));
  return waitForStatus<Volume>(client, 'volumes', created.id, 'AVAILABLE');
}

export async function attachVolumeAndWait(client: ApiClient, id: string, instanceId: string): Promise<Volume> {
  accepted(await client.attachVolume(id, instanceId));
  return waitForStatus<Volume>(client, 'volumes', id, 'IN_USE');
}

export async function detachVolumeAndWait(client: ApiClient, id: string): Promise<Volume> {
  accepted(await client.detachVolume(id));
  return waitForStatus<Volume>(client, 'volumes', id, 'AVAILABLE');
}

export async function createVolumeGroupAndWait(
  client: ApiClient, body: { name: string; volumeIds: string[] },
): Promise<VolumeGroup> {
  const created = accepted(await client.createVolumeGroup(body));
  return waitForStatus<VolumeGroup>(client, 'volume-groups', created.id, 'AVAILABLE');
}
