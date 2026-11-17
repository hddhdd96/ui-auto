import { createInstanceAndWait, createVolumeAndWait } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/ui';

test.describe('대시보드와 쿼터', () => {
  test('UI-DASH-001 대시보드의 사용량이 실제로 만든 리소스와 일치한다', async ({ console, api, uniqueName }) => {
    await createInstanceAndWait(api, { name: uniqueName('web'), flavorId: 'medium', networkId: defaults.networkId });
    await createInstanceAndWait(api, { name: uniqueName('db'), flavorId: 'large', networkId: defaults.networkId });
    await createVolumeAndWait(api, { name: uniqueName('data'), sizeGb: 30 });

    const dashboard = await console.openDashboard();

    await expect(dashboard.used('인스턴스 수')).toHaveText('2');
    await expect(dashboard.used('vCPU')).toHaveText('6');
    await expect(dashboard.used('메모리(GB)')).toHaveText('12');
    await expect(dashboard.used('볼륨 수')).toHaveText('1');
    await expect(dashboard.used('볼륨 용량(GB)')).toHaveText('30');
    await expect(dashboard.quota('vCPU')).toHaveText('16');
  });

  test('UI-QUOTA-001 쿼터를 넘는 인스턴스 생성은 화면에서 막고, API 목록에도 인스턴스가 생기지 않는다', async ({ console, api, uniqueName }) => {
    // vCPU 쿼터 16 중 16을 먼저 쓴다.
    await createInstanceAndWait(api, { name: uniqueName('big'), flavorId: 'xlarge', networkId: defaults.networkId });
    await createInstanceAndWait(api, { name: uniqueName('big'), flavorId: 'xlarge', networkId: defaults.networkId });
    const name = uniqueName('over');
    const instances = await console.openInstances();

    await instances.create({ name, flavorId: 'small' });

    await expect(console.error).toHaveText('쿼터를 초과해서 만들 수 없습니다: vcpus, ramGb');
    await expect(instances.row(name)).toHaveCount(0);
    expect((await api.instances()).map((i) => i.name)).not.toContain(name);
    expect((await api.usage()).usage).toMatchObject({ instances: 2, vcpus: 16 });
  });

  test('UI-QUOTA-002 관리자가 대시보드에서 쿼터를 바꾸면 표와 API에 반영된다', async ({ console, api }) => {
    const original = await api.quota();
    const dashboard = await console.openDashboard();

    try {
      await dashboard.changeQuota('인스턴스 수', original.instances + 1);

      await expect(console.message).toHaveText('쿼터를 저장했습니다.');
      await expect(dashboard.quota('인스턴스 수')).toHaveText(String(original.instances + 1));
      expect((await api.quota()).instances).toBe(original.instances + 1);
    } finally {
      // 다른 테스트에 영향을 주지 않도록 쿼터를 원래 값으로 되돌린다.
      await api.expectOk('PUT', '/quota', { instances: original.instances });
    }
  });
});

test.describe('일반 사용자 권한', () => {
  test.use({ consoleUser: 'member' });

  test('UI-ROLE-001 일반 사용자에게는 쿼터 변경과 네트워크 생성·삭제 기능이 보이지 않고, 자신의 프로젝트만 고를 수 있다', async ({ console }) => {
    await expect(console.userName).toHaveText('일반 사용자 (일반 사용자)');
    await expect(console.projectSelect.getByRole('option')).toHaveText(['Alpha 프로젝트']);

    const dashboard = await console.openDashboard();
    await expect(dashboard.table).toBeVisible();
    await expect(dashboard.quotaForm).toHaveCount(0);

    const networks = await console.openNetworks();
    await expect(networks.adminOnlyNotice).toBeVisible();
    await expect(networks.form).toHaveCount(0);
    await expect(networks.row('default-net')).toHaveCount(1);
    await expect(networks.row('default-net').getByRole('button')).toHaveCount(0);
  });
});
