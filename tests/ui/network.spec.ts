import { accepted, createInstanceAndWait } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/ui';

test.describe('네트워크·보안 그룹 화면', () => {
  test('UI-NET-001 화면에서 네트워크를 만들고 서브넷을 추가하면 목록에 IP 대역이 표시된다', async ({ console, api, uniqueName }) => {
    const name = uniqueName('net');
    const subnet = uniqueName('sub');
    const networks = await console.openNetworks();

    await networks.create(name, '10.40.0.0/16');
    await expect(networks.cidr(name)).toHaveText('10.40.0.0/16');

    await networks.addSubnet(name, subnet, '10.40.1.0/24');
    await expect(networks.subnets(name)).toHaveText(`${subnet} (10.40.1.0/24)`);
    expect((await api.networks()).find((n) => n.name === name)).toMatchObject({
      cidr: '10.40.0.0/16', subnets: [{ name: subnet, cidr: '10.40.1.0/24' }],
    });
  });

  test('UI-NET-002 네트워크 대역을 벗어난 서브넷은 대화상자에 오류를 보여주고 추가되지 않는다', async ({ console, api, uniqueName }) => {
    const network = accepted(await api.createNetwork({ name: uniqueName('net'), cidr: '10.41.0.0/16' }));
    const networks = await console.openNetworks();

    await networks.addSubnet(network.name, uniqueName('sub'), '192.168.0.0/24');

    await expect(networks.dialogError).toHaveText('서브넷 대역은 네트워크 대역(10.41.0.0/16) 안에 있어야 합니다.');
    await networks.cancelDialog();
    expect((await api.networks()).find((n) => n.id === network.id)?.subnets).toEqual([]);
  });

  test('UI-SG-001 화면에서 규칙이 있는 보안 그룹을 만들면 목록에 규칙이 표시된다', async ({ console, api, uniqueName }) => {
    const name = uniqueName('sg');
    const groups = await console.openSecurityGroups();

    await groups.create({ name, description: '웹 서버용', rule: { direction: 'ingress', protocol: 'tcp', port: 443, cidr: '0.0.0.0/0' } });

    await expect(groups.rules(name)).toHaveText('인바운드 TCP 443 0.0.0.0/0');
    expect((await api.securityGroups()).find((g) => g.name === name)?.rules).toEqual([
      { direction: 'ingress', protocol: 'tcp', port: 443, cidr: '0.0.0.0/0' },
    ]);
  });

  test('UI-SG-002 인스턴스가 쓰는 보안 그룹을 삭제하려 하면 대화상자에 오류를 보여주고 보안 그룹은 그대로 남는다', async ({ console, api, uniqueName }) => {
    const group = accepted(await api.createSecurityGroup({ name: uniqueName('sg') }));
    await createInstanceAndWait(api, {
      name: uniqueName('web'), flavorId: 'small', networkId: defaults.networkId, securityGroupIds: [group.id],
    });
    const groups = await console.openSecurityGroups();

    await groups.delete(group.name);

    await expect(groups.dialogError).toHaveText('인스턴스가 쓰고 있는 보안 그룹은 삭제할 수 없습니다.');
    await groups.cancelDialog();
    await expect(groups.row(group.name)).toHaveCount(1);
    expect((await api.securityGroups()).map((g) => g.id)).toContain(group.id);
  });
});
