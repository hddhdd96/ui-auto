import { createInstanceAndWait, createVolumeAndWait } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/ui';

test.describe('볼륨·볼륨 그룹 화면', () => {
  test('UI-VOL-001 화면에서 볼륨을 만들어 인스턴스에 연결하고 분리한다', async ({ console, api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('host'), flavorId: 'small', networkId: defaults.networkId });
    const name = uniqueName('data');
    const volumes = await console.openVolumes();

    await volumes.create(name, 20);
    await expect(volumes.status(name)).toHaveText('AVAILABLE');

    await volumes.attach(name, instance.name);
    await expect(volumes.status(name)).toHaveText('IN_USE');
    await expect(volumes.attachedInstance(name)).toHaveText(instance.name);
    expect((await api.volumes()).find((v) => v.name === name)).toMatchObject({ status: 'IN_USE', attachedInstanceId: instance.id, sizeGb: 20 });

    await volumes.detach(name);
    await expect(volumes.status(name)).toHaveText('AVAILABLE');
    await expect(volumes.attachedInstance(name)).toHaveText('-');
    expect((await api.volumes()).find((v) => v.name === name)).toMatchObject({ status: 'AVAILABLE', attachedInstanceId: null });
  });

  test('UI-VOL-002 화면에서 볼륨을 삭제하면 목록에서 사라지고, API 목록에도 없다', async ({ console, api, uniqueName }) => {
    const volume = await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 10 });
    const volumes = await console.openVolumes();

    await volumes.delete(volume.name);

    await expect(volumes.row(volume.name)).toHaveCount(0);
    expect((await api.volumes()).map((v) => v.id)).not.toContain(volume.id);
  });

  test('UI-VG-001 화면에서 볼륨 그룹을 만들고 삭제하면, 그룹이 사라진 뒤 볼륨은 그룹에서 풀려난다', async ({ console, api, uniqueName }) => {
    const first = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
    const second = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
    const name = uniqueName('vg');
    const groups = await console.openVolumeGroups();

    await groups.create(name, [first.name, second.name]);
    await expect(groups.status(name)).toHaveText('AVAILABLE');
    await expect(groups.volumes(name)).toHaveText(`${first.name}, ${second.name}`);

    await groups.delete(name);
    await expect(groups.row(name)).toHaveCount(0);
    expect((await api.volumeGroups()).map((g) => g.name)).not.toContain(name);
    expect((await api.volumes()).map((v) => v.groupId)).toEqual([null, null]);
  });

  test('UI-VG-002 볼륨 그룹에 속한 볼륨을 삭제하려 하면 대화상자에 오류를 보여주고 볼륨은 그대로 남는다', async ({ console, api, uniqueName }) => {
    const volume = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
    const groupName = uniqueName('vg');
    const groups = await console.openVolumeGroups();
    await groups.create(groupName, [volume.name]);
    await expect(groups.status(groupName)).toHaveText('AVAILABLE');
    const volumes = await console.openVolumes();
    await expect(volumes.volumeGroup(volume.name)).toHaveText(groupName);

    await volumes.delete(volume.name);

    await expect(volumes.dialogError).toHaveText('볼륨 그룹에 속한 볼륨은 삭제할 수 없습니다.');
    await volumes.cancelDialog();
    expect((await api.volumes()).find((v) => v.id === volume.id)?.status).toBe('AVAILABLE');
  });
});
