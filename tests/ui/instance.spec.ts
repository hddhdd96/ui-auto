import { createInstanceAndWait, createVolumeAndWait, attachVolumeAndWait } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/ui';

test.describe('인스턴스 화면', () => {
  test('UI-INST-001 화면에서 인스턴스를 만들면 CREATING을 거쳐 ACTIVE로 표시되고, API의 실제 상태와 일치한다', async ({ console, api, uniqueName }) => {
    const name = uniqueName('web');
    const instances = await console.openInstances();

    await instances.create({ name, flavorId: 'small', securityGroups: ['default-sg'] });

    await expect(console.message).toHaveText(`${name} 생성을 요청했습니다.`);
    await expect(instances.status(name)).toHaveText('ACTIVE');
    await expect(instances.flavor(name)).toHaveText('small (1 vCPU / 2 GB)');
    // 화면 표시가 실제 리소스와 같은지 API로 확인한다.
    const actual = (await api.instances()).find((i) => i.name === name);
    expect(actual).toMatchObject({ status: 'ACTIVE', flavorId: 'small', securityGroupIds: [defaults.securityGroupId] });
  });

  test('UI-INST-002 화면에서 사양을 변경하면 화면에 표시된 사양이 API의 실제 사양과 일치한다', async ({ console, api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('resize'), flavorId: 'small', networkId: defaults.networkId });
    const instances = await console.openInstances();

    await instances.resize(instance.name, 'large');

    await page.waitForTimeout(3000);
    await expect(instances.status(instance.name)).toHaveText('ACTIVE');
    await expect(instances.flavor(instance.name)).toHaveText('large (4 vCPU / 8 GB)');
    const actual = (await api.instances()).find((i) => i.id === instance.id);
    expect(actual).toMatchObject({ status: 'ACTIVE', flavorId: 'large' });
  });

  test('UI-INST-003 화면에서 인스턴스를 삭제하면 DELETING을 거쳐 목록에서 사라지고, API 목록에도 없다', async ({ console, api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('gone'), flavorId: 'small', networkId: defaults.networkId });
    const instances = await console.openInstances();

    await instances.delete(instance.name);

    await expect(instances.status(instance.name)).toHaveText('DELETING');
    await expect(instances.row(instance.name)).toHaveCount(0);
    expect((await api.instances()).map((i) => i.id)).not.toContain(instance.id);
  });

  test('UI-INST-004 같은 사양으로 변경하면 대화상자에 오류를 보여주고 인스턴스는 그대로 ACTIVE다', async ({ console, api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('same'), flavorId: 'small', networkId: defaults.networkId });
    const instances = await console.openInstances();

    await instances.resize(instance.name, 'small');

    await expect(instances.dialogError).toHaveText('현재와 같은 사양입니다.');
    await instances.cancelDialog();
    await expect(instances.status(instance.name)).toHaveText('ACTIVE');
    expect((await api.instances()).find((i) => i.id === instance.id)).toMatchObject({ status: 'ACTIVE', flavorId: 'small' });
  });

  test('UI-INST-005 인스턴스 목록에 연결된 볼륨 이름이 표시된다', async ({ console, api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('host'), flavorId: 'small', networkId: defaults.networkId });
    const volume = await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 10 });
    await attachVolumeAndWait(api, volume.id, instance.id);

    const instances = await console.openInstances();

    await expect(instances.attachedVolumes(instance.name)).toHaveText(volume.name);
  });
});
