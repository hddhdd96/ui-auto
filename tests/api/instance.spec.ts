import { accepted, createInstanceAndWait, deleteAndWait, waitForStatus } from '../../src/api/actions';
import { PollError } from '../../src/api/poll';
import { testConfig } from '../../src/config';
import { defaults, expect, test } from '../../src/fixtures/api';

test.describe('인스턴스 API', () => {
  test('API-INST-001 생성 요청 후 ACTIVE가 될 때까지 확인하고, 삭제 후 목록에서 사라졌는지 확인한다', async ({ api, uniqueName }) => {
    const name = uniqueName('web');

    // 생성 응답은 '접수'다. 이 시점의 상태는 CREATING이다.
    const result = await api.createInstance({ name, flavorId: 'small', networkId: defaults.networkId });
    expect(result.status).toBe(202);
    expect(result.body.status).toBe('CREATING');

    // 실제 완료는 목록 API에서 ACTIVE를 확인해야 한다.
    const instance = await waitForStatus(api, 'instances', result.body.id, 'ACTIVE');
    expect(instance).toMatchObject({ name, flavorId: 'small', status: 'ACTIVE' });

    // 삭제 응답도 '접수'다. 목록에서 사라져야 삭제가 끝난 것이다.
    const deleted = await api.delete('instances', instance.id);
    expect(deleted.body).toEqual({ successCount: 1, failCount: 0 });
    expect((await api.instances()).find((i) => i.id === instance.id)?.status).toBe('DELETING');
    await deleteAndWait(api, 'instances', instance.id);
    expect((await api.instances()).map((i) => i.id)).not.toContain(instance.id);
  });

  test('API-INST-002 사양 변경 요청 후 RESIZING을 거쳐 ACTIVE가 되면 새 사양이 적용된다', async ({ api, uniqueName }) => {
    const instance = await createInstanceAndWait(api, { name: uniqueName('resize'), flavorId: 'small', networkId: defaults.networkId });

    const result = await api.resizeInstance(instance.id, 'medium');
    expect(result.status).toBe(202);
    // 접수 직후에는 아직 이전 사양이다.
    expect(result.body).toMatchObject({ status: 'RESIZING', flavorId: 'small' });

    const resized = await waitForStatus(api, 'instances', instance.id, 'ACTIVE');
    expect(resized).toMatchObject({ flavorId: 'medium' });
    const usage = await api.usage();
    expect(usage.usage).toMatchObject({ instances: 1, vcpus: 2, ramGb: 4 });
  });

  test('API-INST-003 인스턴스가 ERROR가 되면 제한 시간까지 기다리지 않고 바로 실패로 판정한다', async ({ api, uniqueName }) => {
    // 서브넷이 없는 네트워크에 만들면 IP를 할당하지 못해 ERROR로 끝난다.
    const network = accepted(await api.createNetwork({ name: uniqueName('net'), cidr: '10.50.0.0/16' }));
    const created = accepted(await api.createInstance({ name: uniqueName('err'), flavorId: 'small', networkId: network.id }));

    const startedAt = Date.now();
    const error = await waitForStatus(api, 'instances', created.id, 'ACTIVE').catch((e: unknown) => e);
    const elapsedMs = Date.now() - startedAt;

    expect(error).toBeInstanceOf(PollError);
    expect((error as PollError).reason).toBe('failed');
    expect((error as PollError).message).toContain('IP 할당 실패');
    expect((error as PollError).observations).toEqual(['CREATING', 'ERROR']);
    expect(elapsedMs).toBeLessThan(testConfig.pollTimeoutMs / 2);
  });

  test('API-INST-004 진행 중(CREATING)인 인스턴스 삭제는 400으로 거부되고, 목록 API로 확인하면 리소스가 그대로 남아 있다', async ({ api, uniqueName }) => {
    const created = accepted(await api.createInstance({ name: uniqueName('busy'), flavorId: 'small', networkId: defaults.networkId }));

    const result = await api.delete('instances', created.id);

    expect(result.status).toBe(400);
    expect(result.error?.code).toBe('INVALID_STATE');
    // 400만으로는 결과를 알 수 없으므로 목록 API로 실제 상태를 확인한다.
    const actual = (await api.instances()).find((i) => i.id === created.id);
    expect(actual?.status).not.toBe('DELETING');
    await expect(deleteAndWait(api, 'instances', created.id)).rejects.toThrow('그대로 남아 있습니다');
  });
});
