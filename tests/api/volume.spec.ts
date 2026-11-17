import {
  attachVolumeAndWait, createInstanceAndWait, createVolumeAndWait, createVolumeGroupAndWait,
  deleteAndWait, detachVolumeAndWait, waitForStatus,
} from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/api';

test.describe('볼륨·볼륨 그룹 API', () => {
  test('API-VOL-001 볼륨을 만들어 인스턴스에 연결하고, 분리한 뒤 삭제한다', async ({ api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('host'), flavorId: 'small', networkId: defaults.networkId });

    const created = await api.createVolume({ name: uniqueName('data'), sizeGb: 20 });
    expect(created.status).toBe(202);
    expect(created.body.status).toBe('CREATING');
    const volume = await waitForStatus(api, 'volumes', created.body.id, 'AVAILABLE');

    const attached = await attachVolumeAndWait(api, volume.id, instance.id);
    expect(attached).toMatchObject({ status: 'IN_USE', attachedInstanceId: instance.id });

    const detached = await detachVolumeAndWait(api, volume.id);
    expect(detached).toMatchObject({ status: 'AVAILABLE', attachedInstanceId: null });

    await deleteAndWait(api, 'volumes', volume.id);
    expect((await api.volumes()).map((v) => v.id)).not.toContain(volume.id);
  });

  test('API-VOL-002 연결된(IN_USE) 볼륨 삭제는 400으로 거부되고 볼륨은 그대로 남는다', async ({ api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('host'), flavorId: 'small', networkId: defaults.networkId });
    const volume = await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 10 });
    await attachVolumeAndWait(api, volume.id, instance.id);

    const result = await api.delete('volumes', volume.id);

    expect(result.status).toBe(400);
    expect(result.error?.code).toBe('RESOURCE_IN_USE');
    expect((await api.volumes()).find((v) => v.id === volume.id)?.status).toBe('IN_USE');
  });

  test('API-VG-001 볼륨 그룹을 만들고 AVAILABLE이 될 때까지 기다린 뒤, 삭제가 실제로 끝났는지 확인한다', async ({ api, uniqueName }) => {
    const first = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
    const second = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });

    const group = await createVolumeGroupAndWait(api, { name: uniqueName('vg'), volumeIds: [first.id, second.id] });
    expect(group.volumeIds).toEqual([first.id, second.id]);
    expect((await api.volumes()).filter((v) => v.groupId === group.id)).toHaveLength(2);

    // 삭제 응답은 successCount: 1이지만 이 시점에 그룹은 아직 DELETING으로 남아 있다.
    const deleted = await api.delete('volume-groups', group.id);
    expect(deleted.body.successCount).toBe(1);
    expect((await api.volumeGroups()).find((g) => g.id === group.id)?.status).toBe('DELETING');

    await deleteAndWait(api, 'volume-groups', group.id);
    expect((await api.volumeGroups()).map((g) => g.id)).not.toContain(group.id);
    // 그룹이 사라지면 볼륨은 그룹에서 풀려난다.
    expect((await api.volumes()).filter((v) => v.groupId !== null)).toEqual([]);
  });
});
