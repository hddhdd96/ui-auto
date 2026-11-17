import { accepted, attachVolumeAndWait, createInstanceAndWait, createVolumeAndWait, createVolumeGroupAndWait } from '../../src/api/actions';
import { cleanupLeftovers } from '../../src/api/cleanup';
import { defaults, expect, test } from '../../src/fixtures/api';

test.describe('사용량 집계와 남은 리소스 일괄 삭제', () => {
  test('API-USAGE-001 사용량 API의 값이 실제로 만든 리소스와 일치한다', async ({ api, uniqueName }) => {
    const before = (await api.usage()).usage;

    await createInstanceAndWait(api, { name: uniqueName('web'), flavorId: 'medium', networkId: defaults.networkId });
    await createInstanceAndWait(api, { name: uniqueName('db'), flavorId: 'large', networkId: defaults.networkId });
    await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 30 });

    const after = (await api.usage()).usage;
    expect(after).toEqual({
      ...before,
      instances: before.instances + 2,
      vcpus: before.vcpus + 2 + 4,
      ramGb: before.ramGb + 4 + 8,
      volumes: before.volumes + 1,
      volumeGb: before.volumeGb + 30,
    });
  });

  test('API-CLEAN-001 테스트가 남긴 리소스를 의존 순서대로 한 번에 삭제하고, 기본 리소스는 남긴다', async ({ api, uniqueName }) => {
    // 서로 얽힌 리소스를 남긴다: 보안 그룹을 쓰는 인스턴스, 인스턴스에 연결된 볼륨, 볼륨을 묶은 그룹, 생성 중인 볼륨.
    const network = accepted(await api.createNetwork({ name: uniqueName('net'), cidr: '10.30.0.0/16' }));
    accepted(await api.createSubnet(network.id, { name: uniqueName('sub'), cidr: '10.30.1.0/24' }));
    const group = accepted(await api.createSecurityGroup({ name: uniqueName('sg') }));
    const instance = await createInstanceAndWait(api, {
      name: uniqueName('web'), flavorId: 'small', networkId: network.id, securityGroupIds: [group.id],
    });
    const attached = await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 10 });
    await attachVolumeAndWait(api, attached.id, instance.id);
    const grouped = await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 10 });
    await createVolumeGroupAndWait(api, { name: uniqueName('vg'), volumeIds: [grouped.id] });
    accepted(await api.createVolume({ name: uniqueName('creating'), sizeGb: 10 }));

    const report = await cleanupLeftovers(api);

    expect(report.failed).toEqual([]);
    expect(report.deleted.map((d) => d.kind)).toEqual([
      'volume-groups', 'volumes', 'volumes', 'volumes', 'instances', 'security-groups', 'networks',
    ]);
    expect(await api.instances()).toEqual([]);
    expect(await api.volumes()).toEqual([]);
    expect(await api.volumeGroups()).toEqual([]);
    // 접두어가 없는 기본 리소스는 지우지 않는다.
    expect((await api.networks()).map((n) => n.id)).toEqual([defaults.networkId]);
    expect((await api.securityGroups()).map((g) => g.id)).toEqual([defaults.securityGroupId]);
    expect((await api.usage()).usage).toMatchObject({ instances: 0, vcpus: 0, volumes: 0, volumeGb: 0 });
  });
});
