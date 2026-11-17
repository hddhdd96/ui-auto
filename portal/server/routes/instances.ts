import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import { badRequest, conflict } from '../errors.ts';
import { later } from '../lifecycle.ts';
import { db, nextId } from '../store.ts';
import type { Instance } from '../types.ts';
import { assertQuota, flavorOf } from '../usage.ts';
import { requireName, requireString } from '../validation.ts';
import { bodyOf, deleteAccepted, findInProject, listInProject, newBase } from './helpers.ts';

export const instanceRouter = Router();
instanceRouter.use('/instances', requireAuth);

function requireFlavor(value: unknown) {
  const flavor = flavorOf(requireString(value, 'flavorId'));
  if (!flavor) throw badRequest('INVALID_REFERENCE', '존재하지 않는 사양입니다.', 'flavorId');
  return flavor;
}

instanceRouter.get('/instances', (req, res) => {
  res.json(listInProject(req, db.instances));
});

instanceRouter.get('/instances/:id', (req, res) => {
  res.json(findInProject(req, db.instances, req.params.id, '인스턴스'));
});

instanceRouter.post('/instances', (req, res) => {
  const body = bodyOf(req);
  const name = requireName(body.name);
  const flavor = requireFlavor(body.flavorId);
  const networkId = requireString(body.networkId, 'networkId');
  const network = db.networks.get(networkId);
  const base = newBase(req, nextId('inst'), name);
  if (!network || network.projectId !== base.projectId) {
    throw badRequest('INVALID_REFERENCE', '존재하지 않는 네트워크입니다.', 'networkId');
  }
  const securityGroupIds = Array.isArray(body.securityGroupIds) ? body.securityGroupIds.map(String) : [];
  for (const sgId of securityGroupIds) {
    if (db.securityGroups.get(sgId)?.projectId !== base.projectId) {
      throw badRequest('INVALID_REFERENCE', '존재하지 않는 보안 그룹입니다.', 'securityGroupIds');
    }
  }
  if (listInProject(req, db.instances).some((i) => i.name === name)) {
    throw conflict('DUPLICATE_NAME', '같은 이름의 인스턴스가 이미 있습니다.');
  }
  assertQuota(base.projectId, { instances: 1, vcpus: flavor.vcpus, ramGb: flavor.ramGb });

  const instance: Instance = {
    ...base, status: 'CREATING', flavorId: flavor.id, networkId, securityGroupIds, fault: null,
  };
  db.instances.set(instance.id, instance);
  later(() => {
    // 서브넷이 없는 네트워크에서는 IP를 할당할 수 없어 ERROR로 끝난다.
    if (network.subnets.length === 0) {
      instance.status = 'ERROR';
      instance.fault = 'IP 할당 실패: 네트워크에 서브넷이 없습니다.';
    } else {
      instance.status = 'ACTIVE';
    }
  });
  res.status(202).json(instance);
});

/** 사양 변경(무중단). RESIZING을 거쳐 ACTIVE로 돌아오면 새 사양이 적용된다. */
instanceRouter.post('/instances/:id/resize', (req, res) => {
  const instance = findInProject(req, db.instances, req.params.id, '인스턴스');
  const next = requireFlavor(bodyOf(req).flavorId);
  if (instance.status !== 'ACTIVE') {
    throw conflict('INVALID_STATE', `ACTIVE 상태에서만 사양을 바꿀 수 있습니다(현재 ${instance.status}).`);
  }
  if (next.id === instance.flavorId) {
    throw badRequest('SAME_FLAVOR', '현재와 같은 사양입니다.', 'flavorId');
  }
  const current = flavorOf(instance.flavorId);
  assertQuota(instance.projectId, {
    vcpus: next.vcpus - (current?.vcpus ?? 0),
    ramGb: next.ramGb - (current?.ramGb ?? 0),
  });
  instance.status = 'RESIZING';
  later(() => {
    instance.flavorId = next.id;
    instance.status = 'ACTIVE';
  });
  res.status(202).json(instance);
});

instanceRouter.delete('/instances/:id', (req, res) => {
  const instance = findInProject(req, db.instances, req.params.id, '인스턴스');
  if (instance.status === 'DELETING') {
    throw badRequest('ALREADY_DELETING', '이미 삭제 중인 인스턴스입니다.');
  }
  if (instance.status === 'CREATING' || instance.status === 'RESIZING') {
    throw badRequest('INVALID_STATE', `${instance.status} 상태에서는 삭제할 수 없습니다.`);
  }
  instance.status = 'DELETING';
  later(() => {
    db.instances.delete(instance.id);
    // 연결돼 있던 볼륨은 분리된 상태로 남긴다.
    for (const volume of db.volumes.values()) {
      if (volume.attachedInstanceId === instance.id) {
        volume.attachedInstanceId = null;
        volume.status = 'AVAILABLE';
      }
    }
  });
  res.json(deleteAccepted());
});
