import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import { badRequest, conflict } from '../errors.ts';
import { later } from '../lifecycle.ts';
import { db, nextId } from '../store.ts';
import type { Volume, VolumeGroup } from '../types.ts';
import { assertQuota } from '../usage.ts';
import { requireInt, requireName, requireString } from '../validation.ts';
import { bodyOf, deleteAccepted, findInProject, listInProject, newBase } from './helpers.ts';

export const VOLUME_SIZE_MIN = 1;
export const VOLUME_SIZE_MAX = 1000;

export const volumeRouter = Router();
volumeRouter.use(['/volumes', '/volume-groups'], requireAuth);

// ---------- 볼륨 ----------

volumeRouter.get('/volumes', (req, res) => {
  res.json(listInProject(req, db.volumes));
});

volumeRouter.get('/volumes/:id', (req, res) => {
  res.json(findInProject(req, db.volumes, req.params.id, '볼륨'));
});

volumeRouter.post('/volumes', (req, res) => {
  const body = bodyOf(req);
  const name = requireName(body.name);
  const sizeGb = requireInt(body.sizeGb, 'sizeGb', VOLUME_SIZE_MIN, VOLUME_SIZE_MAX);
  const base = newBase(req, nextId('vol'), name);
  if (listInProject(req, db.volumes).some((v) => v.name === name)) {
    throw conflict('DUPLICATE_NAME', '같은 이름의 볼륨이 이미 있습니다.');
  }
  assertQuota(base.projectId, { volumes: 1, volumeGb: sizeGb });
  const volume: Volume = { ...base, status: 'CREATING', sizeGb, attachedInstanceId: null, groupId: null };
  db.volumes.set(volume.id, volume);
  later(() => { volume.status = 'AVAILABLE'; });
  res.status(202).json(volume);
});

volumeRouter.post('/volumes/:id/attach', (req, res) => {
  const volume = findInProject(req, db.volumes, req.params.id, '볼륨');
  const instanceId = requireString(bodyOf(req).instanceId, 'instanceId');
  const instance = db.instances.get(instanceId);
  if (!instance || instance.projectId !== volume.projectId) {
    throw badRequest('INVALID_REFERENCE', '존재하지 않는 인스턴스입니다.', 'instanceId');
  }
  if (volume.status !== 'AVAILABLE') {
    throw conflict('INVALID_STATE', `AVAILABLE 상태의 볼륨만 연결할 수 있습니다(현재 ${volume.status}).`);
  }
  if (instance.status !== 'ACTIVE') {
    throw conflict('INVALID_STATE', `ACTIVE 상태의 인스턴스에만 연결할 수 있습니다(현재 ${instance.status}).`);
  }
  volume.status = 'ATTACHING';
  volume.attachedInstanceId = instance.id;
  later(() => { volume.status = 'IN_USE'; });
  res.status(202).json(volume);
});

volumeRouter.post('/volumes/:id/detach', (req, res) => {
  const volume = findInProject(req, db.volumes, req.params.id, '볼륨');
  if (volume.status !== 'IN_USE') {
    throw conflict('INVALID_STATE', `IN_USE 상태의 볼륨만 분리할 수 있습니다(현재 ${volume.status}).`);
  }
  volume.status = 'DETACHING';
  later(() => {
    volume.status = 'AVAILABLE';
    volume.attachedInstanceId = null;
  });
  res.status(202).json(volume);
});

volumeRouter.delete('/volumes/:id', (req, res) => {
  const volume = findInProject(req, db.volumes, req.params.id, '볼륨');
  if (volume.status === 'DELETING') throw badRequest('ALREADY_DELETING', '이미 삭제 중인 볼륨입니다.');
  if (volume.groupId) throw badRequest('RESOURCE_IN_USE', '볼륨 그룹에 속한 볼륨은 삭제할 수 없습니다.');
  if (volume.status !== 'AVAILABLE' && volume.status !== 'ERROR') {
    throw badRequest('RESOURCE_IN_USE', `${volume.status} 상태의 볼륨은 삭제할 수 없습니다.`);
  }
  volume.status = 'DELETING';
  later(() => { db.volumes.delete(volume.id); });
  res.json(deleteAccepted());
});

// ---------- 볼륨 그룹 ----------

volumeRouter.get('/volume-groups', (req, res) => {
  res.json(listInProject(req, db.volumeGroups));
});

volumeRouter.get('/volume-groups/:id', (req, res) => {
  res.json(findInProject(req, db.volumeGroups, req.params.id, '볼륨 그룹'));
});

volumeRouter.post('/volume-groups', (req, res) => {
  const body = bodyOf(req);
  const name = requireName(body.name);
  if (!Array.isArray(body.volumeIds) || body.volumeIds.length === 0) {
    throw badRequest('REQUIRED', '볼륨을 1개 이상 골라야 합니다.', 'volumeIds');
  }
  const volumes = [...new Set(body.volumeIds.map(String))].map((id) =>
    findInProject(req, db.volumes, id, '볼륨'));
  for (const volume of volumes) {
    if (volume.groupId) throw conflict('INVALID_STATE', `${volume.name}은(는) 이미 다른 볼륨 그룹에 속해 있습니다.`);
    if (volume.status !== 'AVAILABLE' && volume.status !== 'IN_USE') {
      throw conflict('INVALID_STATE', `${volume.name}은(는) 아직 준비되지 않았습니다(현재 ${volume.status}).`);
    }
  }
  const base = newBase(req, nextId('vg'), name);
  if (listInProject(req, db.volumeGroups).some((g) => g.name === name)) {
    throw conflict('DUPLICATE_NAME', '같은 이름의 볼륨 그룹이 이미 있습니다.');
  }
  assertQuota(base.projectId, { volumeGroups: 1 });
  const group: VolumeGroup = { ...base, status: 'CREATING', volumeIds: volumes.map((v) => v.id) };
  db.volumeGroups.set(group.id, group);
  for (const volume of volumes) volume.groupId = group.id;
  later(() => { group.status = 'AVAILABLE'; });
  res.status(202).json(group);
});

volumeRouter.delete('/volume-groups/:id', (req, res) => {
  const group = findInProject(req, db.volumeGroups, req.params.id, '볼륨 그룹');
  if (group.status === 'DELETING') throw badRequest('ALREADY_DELETING', '이미 삭제 중인 볼륨 그룹입니다.');
  if (group.status === 'CREATING') throw badRequest('INVALID_STATE', 'CREATING 상태에서는 삭제할 수 없습니다.');
  group.status = 'DELETING';
  later(() => {
    db.volumeGroups.delete(group.id);
    for (const volume of db.volumes.values()) {
      if (volume.groupId === group.id) volume.groupId = null;
    }
  });
  res.json(deleteAccepted());
});
