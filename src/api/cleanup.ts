import { testConfig } from '../config';
import { deleteAndWait, detachVolumeAndWait, waitUntilSettled } from './actions';
import type { ApiClient, ResourceKind } from './client';

export interface CleanupReport {
  deleted: { kind: ResourceKind; name: string }[];
  failed: { kind: ResourceKind; name: string; reason: string }[];
}

/**
 * 테스트가 남긴 리소스를 한 번에 삭제한다. 이름이 접두어(기본 qa-)로 시작하는 것만 지운다.
 * 의존 관계 때문에 순서가 중요하다: 볼륨 그룹 → 볼륨(연결돼 있으면 먼저 분리) → 인스턴스 → 보안 그룹 → 네트워크.
 * 하나가 실패해도 멈추지 않고 끝까지 진행한 뒤, 실패한 항목을 보고서로 돌려준다.
 */
export async function cleanupLeftovers(
  client: ApiClient, prefix: string = testConfig.resourcePrefix,
): Promise<CleanupReport> {
  const report: CleanupReport = { deleted: [], failed: [] };
  const order: ResourceKind[] = ['volume-groups', 'volumes', 'instances', 'security-groups', 'networks'];

  for (const kind of order) {
    const targets = (await client.list(kind)).filter((item) => item.name.startsWith(prefix));
    for (const target of targets) {
      try {
        // 생성·변경이 진행 중이면 끝난 뒤에 삭제한다.
        const settled = await waitUntilSettled(client, kind, target.id);
        if (!settled) continue;
        if (kind === 'volumes' && settled.status === 'IN_USE') {
          await detachVolumeAndWait(client, target.id);
        }
        await deleteAndWait(client, kind, target.id);
        report.deleted.push({ kind, name: target.name });
      } catch (error) {
        report.failed.push({ kind, name: target.name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return report;
}
