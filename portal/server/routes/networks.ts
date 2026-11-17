import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { db, nextId } from '../store.ts';
import type { Network, SecurityGroup, SecurityGroupRule } from '../types.ts';
import { assertQuota } from '../usage.ts';
import { cidrContains, cidrOverlaps, requireCidr, requireName } from '../validation.ts';
import { bodyOf, deleteAccepted, findInProject, listInProject, newBase } from './helpers.ts';

export const networkRouter = Router();
networkRouter.use(['/networks', '/security-groups'], requireAuth);

// ---------- 네트워크·서브넷 (생성·삭제는 관리자만) ----------

networkRouter.get('/networks', (req, res) => {
  res.json(listInProject(req, db.networks));
});

networkRouter.get('/networks/:id', (req, res) => {
  res.json(findInProject(req, db.networks, req.params.id, '네트워크'));
});

networkRouter.post('/networks', requireAdmin, (req, res) => {
  const body = bodyOf(req);
  const name = requireName(body.name);
  requireCidr(body.cidr, 'cidr', 16, 24);
  const base = newBase(req, nextId('net'), name);
  if (listInProject(req, db.networks).some((n) => n.name === name)) {
    throw conflict('DUPLICATE_NAME', '같은 이름의 네트워크가 이미 있습니다.');
  }
  assertQuota(base.projectId, { networks: 1 });
  const network: Network = { ...base, status: 'ACTIVE', cidr: String(body.cidr), subnets: [] };
  db.networks.set(network.id, network);
  res.status(201).json(network);
});

networkRouter.delete('/networks/:id', requireAdmin, (req, res) => {
  const network = findInProject(req, db.networks, req.params.id, '네트워크');
  if ([...db.instances.values()].some((i) => i.networkId === network.id)) {
    throw badRequest('RESOURCE_IN_USE', '인스턴스가 쓰고 있는 네트워크는 삭제할 수 없습니다.');
  }
  db.networks.delete(network.id);
  res.json(deleteAccepted());
});

networkRouter.get('/networks/:id/subnets', (req, res) => {
  res.json(findInProject(req, db.networks, req.params.id, '네트워크').subnets);
});

/** 서브넷 IP 대역은 네트워크 대역 안에 있어야 하고, 다른 서브넷과 겹치면 안 된다. */
networkRouter.post('/networks/:id/subnets', requireAdmin, (req, res) => {
  const network = findInProject(req, db.networks, req.params.id, '네트워크');
  const body = bodyOf(req);
  const name = requireName(body.name);
  const cidr = requireCidr(body.cidr, 'cidr', 16, 29);
  if (!cidrContains(requireCidr(network.cidr, 'cidr', 0, 32), cidr)) {
    throw badRequest('OUT_OF_RANGE', `서브넷 대역은 네트워크 대역(${network.cidr}) 안에 있어야 합니다.`, 'cidr');
  }
  const overlapped = network.subnets.find((s) => cidrOverlaps(requireCidr(s.cidr, 'cidr', 0, 32), cidr));
  if (overlapped) {
    throw conflict('CIDR_OVERLAP', `기존 서브넷 ${overlapped.name}(${overlapped.cidr})과 대역이 겹칩니다.`);
  }
  const subnet = { id: nextId('sub'), name, cidr: String(body.cidr) };
  network.subnets.push(subnet);
  res.status(201).json(subnet);
});

networkRouter.delete('/networks/:id/subnets/:subnetId', requireAdmin, (req, res) => {
  const network = findInProject(req, db.networks, req.params.id, '네트워크');
  const index = network.subnets.findIndex((s) => s.id === req.params.subnetId);
  if (index < 0) throw notFound('서브넷');
  network.subnets.splice(index, 1);
  res.json(deleteAccepted());
});

// ---------- 보안 그룹 ----------

function parseRules(value: unknown): SecurityGroupRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest('INVALID_FORMAT', 'rules는 배열이어야 합니다.', 'rules');
  return value.map((raw: Record<string, unknown>) => {
    const direction = raw?.direction;
    const protocol = raw?.protocol;
    if (direction !== 'ingress' && direction !== 'egress') {
      throw badRequest('INVALID_FORMAT', '규칙 방향은 ingress 또는 egress여야 합니다.', 'rules.direction');
    }
    if (protocol !== 'tcp' && protocol !== 'udp' && protocol !== 'icmp') {
      throw badRequest('INVALID_FORMAT', '프로토콜은 tcp, udp, icmp 중 하나여야 합니다.', 'rules.protocol');
    }
    const port = raw.port ?? null;
    if (port !== null && (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)) {
      throw badRequest('OUT_OF_RANGE', '포트는 1~65535 범위여야 합니다.', 'rules.port');
    }
    requireCidr(raw.cidr, 'rules.cidr', 0, 32);
    return { direction, protocol, port, cidr: String(raw.cidr) };
  });
}

networkRouter.get('/security-groups', (req, res) => {
  res.json(listInProject(req, db.securityGroups));
});

networkRouter.get('/security-groups/:id', (req, res) => {
  res.json(findInProject(req, db.securityGroups, req.params.id, '보안 그룹'));
});

networkRouter.post('/security-groups', (req, res) => {
  const body = bodyOf(req);
  const name = requireName(body.name);
  const rules = parseRules(body.rules);
  const base = newBase(req, nextId('sg'), name);
  if (listInProject(req, db.securityGroups).some((g) => g.name === name)) {
    throw conflict('DUPLICATE_NAME', '같은 이름의 보안 그룹이 이미 있습니다.');
  }
  assertQuota(base.projectId, { securityGroups: 1 });
  const group: SecurityGroup = {
    ...base, description: typeof body.description === 'string' ? body.description : '', rules,
  };
  db.securityGroups.set(group.id, group);
  res.status(201).json(group);
});

networkRouter.delete('/security-groups/:id', (req, res) => {
  const group = findInProject(req, db.securityGroups, req.params.id, '보안 그룹');
  if ([...db.instances.values()].some((i) => i.securityGroupIds.includes(group.id))) {
    throw badRequest('RESOURCE_IN_USE', '인스턴스가 쓰고 있는 보안 그룹은 삭제할 수 없습니다.');
  }
  db.securityGroups.delete(group.id);
  res.json(deleteAccepted());
});
