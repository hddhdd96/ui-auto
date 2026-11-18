import { badRequest } from './errors.ts';

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const NAME_MIN = 3;
export const NAME_MAX = 30;

/** 리소스 이름 규칙: 3~30자, 영문 소문자로 시작, 영문 소문자·숫자·하이픈만 허용 */
export function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('REQUIRED', '이름은 필수입니다.', 'name');
  }
  if (value.length < NAME_MIN || value.length > NAME_MAX) {
    throw badRequest('INVALID_LENGTH', `이름은 ${NAME_MIN}~${NAME_MAX}자여야 합니다.`, 'name');
  }
  if (!NAME_PATTERN.test(value)) {
    throw badRequest('INVALID_FORMAT', '이름은 영문 소문자로 시작하고 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.', 'name');
  }
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('REQUIRED', `${field}은(는) 필수입니다.`, field);
  }
  return value;
}

export function requireInt(value: unknown, field: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') {
    throw badRequest('REQUIRED', `${field}은(는) 필수입니다.`, field);
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('INVALID_FORMAT', `${field}은(는) 정수여야 합니다.`, field);
  }
  if (value < min || value > max) {
    throw badRequest('OUT_OF_RANGE', `${field}은(는) ${min}~${max} 범위여야 합니다.`, field);
  }
  return value;
}

export interface Cidr {
  /** 네트워크 주소(32비트 정수) */
  base: number;
  prefix: number;
  /** 대역에 포함된 주소 수 */
  size: number;
}

/** IPv4 CIDR을 해석한다. 형식이 틀리거나 네트워크 주소가 아니면 400을 던진다. */
export function requireCidr(value: unknown, field: string, minPrefix: number, maxPrefix: number): Cidr {
  const text = requireString(value, field);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(text);
  if (!match) throw badRequest('INVALID_FORMAT', `${field} 형식이 올바르지 않습니다. 예: 10.0.1.0/24`, field);
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((o) => o > 255)) {
    throw badRequest('INVALID_FORMAT', `${field}의 IP 주소가 올바르지 않습니다.`, field);
  }
  if (prefix < minPrefix || prefix > maxPrefix) {
    throw badRequest('OUT_OF_RANGE', `${field}의 prefix는 /${minPrefix}~/${maxPrefix} 범위여야 합니다.`, field);
  }
  const ip = octets.reduce((acc, o) => acc * 256 + o, 0);
  const size = 2 ** (32 - prefix);
  if (ip % size !== 0) {
    throw badRequest('INVALID_FORMAT', `${field}는 네트워크 주소여야 합니다(호스트 비트가 0).`, field);
  }
  return { base: ip, prefix, size };
}

export const cidrContains = (outer: Cidr, inner: Cidr) =>
  inner.base >= outer.base && inner.base + inner.size <= outer.base + outer.size;

export const cidrOverlaps = (a: Cidr, b: Cidr) =>
  a.base < b.base + b.size && b.base < a.base + a.size;
