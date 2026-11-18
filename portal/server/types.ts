export type Role = 'admin' | 'member';

export interface User {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: Role;
  projectIds: string[];
}

export interface Project {
  id: string;
  name: string;
}

export interface Flavor {
  id: string;
  name: string;
  vcpus: number;
  ramGb: number;
}

export interface Quota {
  instances: number;
  vcpus: number;
  ramGb: number;
  volumes: number;
  volumeGb: number;
  volumeGroups: number;
  networks: number;
  securityGroups: number;
}

export type InstanceStatus = 'CREATING' | 'ACTIVE' | 'RESIZING' | 'DELETING' | 'ERROR';
export type VolumeStatus = 'CREATING' | 'AVAILABLE' | 'ATTACHING' | 'IN_USE' | 'DETACHING' | 'DELETING' | 'ERROR';
export type VolumeGroupStatus = 'CREATING' | 'AVAILABLE' | 'DELETING' | 'ERROR';

interface Base {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface Instance extends Base {
  status: InstanceStatus;
  flavorId: string;
  /** 포털 화면에 표시하는 사양 이름. 사양을 바꾸면 함께 갱신돼야 한다. */
  flavorName: string;
  networkId: string;
  securityGroupIds: string[];
  /** ERROR 상태일 때 원인 */
  fault: string | null;
}

export interface Volume extends Base {
  status: VolumeStatus;
  sizeGb: number;
  attachedInstanceId: string | null;
  groupId: string | null;
}

export interface VolumeGroup extends Base {
  status: VolumeGroupStatus;
  volumeIds: string[];
}

export interface Subnet {
  id: string;
  name: string;
  cidr: string;
}

export interface Network extends Base {
  status: 'ACTIVE';
  cidr: string;
  subnets: Subnet[];
}

export interface SecurityGroupRule {
  direction: 'ingress' | 'egress';
  protocol: 'tcp' | 'udp' | 'icmp';
  port: number | null;
  cidr: string;
}

export interface SecurityGroup extends Base {
  status: 'ACTIVE' | 'DELETING';
  description: string;
  rules: SecurityGroupRule[];
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}
