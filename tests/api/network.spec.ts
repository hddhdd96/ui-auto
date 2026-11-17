import { accepted, createInstanceAndWait, deleteAndWait } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/api';

test.describe('네트워크·보안 그룹 API', () => {
  test('API-NET-001 네트워크와 서브넷을 만들고 조회한 뒤 삭제한다', async ({ api, uniqueName }) => {
    const network = accepted(await api.createNetwork({ name: uniqueName('net'), cidr: '10.20.0.0/16' }));
    const subnet = accepted(await api.createSubnet(network.id, { name: uniqueName('sub'), cidr: '10.20.1.0/24' }));

    const listed = (await api.networks()).find((n) => n.id === network.id);
    expect(listed).toMatchObject({ cidr: '10.20.0.0/16', subnets: [{ id: subnet.id, cidr: '10.20.1.0/24' }] });

    await deleteAndWait(api, 'networks', network.id);
    expect((await api.networks()).map((n) => n.id)).not.toContain(network.id);
  });

  test('API-SG-001 규칙이 있는 보안 그룹을 만들고 삭제한다', async ({ api, uniqueName }) => {
    const group = accepted(await api.createSecurityGroup({
      name: uniqueName('sg'), description: '웹 서버용',
      rules: [{ direction: 'ingress', protocol: 'tcp', port: 443, cidr: '0.0.0.0/0' }],
    }));
    expect((await api.securityGroups()).find((g) => g.id === group.id)?.rules).toEqual([
      { direction: 'ingress', protocol: 'tcp', port: 443, cidr: '0.0.0.0/0' },
    ]);

    await deleteAndWait(api, 'security-groups', group.id);
    expect((await api.securityGroups()).map((g) => g.id)).not.toContain(group.id);
  });

  test('API-SG-002 인스턴스가 쓰는 보안 그룹 삭제는 400으로 거부되고, 목록 API로 확인하면 그대로 남아 있다', async ({ api, uniqueName }) => {
    const group = accepted(await api.createSecurityGroup({ name: uniqueName('sg') }));
    await createInstanceAndWait(api, {
      name: uniqueName('web'), flavorId: 'small', networkId: defaults.networkId, securityGroupIds: [group.id],
    });

    const result = await api.delete('security-groups', group.id);

    expect(result.status).toBe(400);
    expect(result.error?.code).toBe('RESOURCE_IN_USE');
    expect((await api.securityGroups()).map((g) => g.id)).toContain(group.id);
  });
});
