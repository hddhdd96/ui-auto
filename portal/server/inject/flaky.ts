import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';

/**
 * Flaky 주입 공통 기능: 시드를 고정한 난수, 콘솔에 보내는 재전송 지시, 주입 이력.
 */

/** 콘솔에게 "이 요청을 N ms 뒤에 다시 보내라"고 지시하는 응답 헤더(게이트웨이 시간 초과를 흉내 낸다) */
export const RETRY_AFTER_HEADER = 'x-portal-retry-ms';
/** 콘솔이 재전송한 요청에 붙이는 헤더 */
export const RETRY_MARK_HEADER = 'x-portal-retry';

/** mulberry32: 작고 빠른 시드 고정 난수 생성기 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = mulberry32(config.flaky.seed);

export interface FlakyEvent {
  at: string;
  type: string;
  detail: string;
}

const events: FlakyEvent[] = [];

/** 확률 rate로 참을 돌려준다. 시드가 같으면 같은 순서로 같은 결과가 나온다. */
export function chance(rate: number): boolean {
  return random() < rate;
}

/** 주입한 내용을 기록한다. 실패 원인 분류에서 환경 요인인지 판단하는 근거로 쓴다. */
export function recordFlaky(type: string, detail: string): void {
  events.push({ at: new Date().toISOString(), type, detail });
  if (events.length > 1000) events.shift();
}

export const flakyEvents = (): readonly FlakyEvent[] => events;

/** 연결을 끊을 수 있는 요청: 리소스 목록·단건 조회 */
const RESOURCE_READ = /^\/(instances|volumes|volume-groups|networks|security-groups)(\/[^/]+)?$/;
const lastDropped = new Map<string, number>();

/**
 * [Flaky 주입 ④: FLAKY_NETWORK] 리소스 조회 요청의 소켓을 응답 없이 끊는다.
 * 브라우저는 네트워크 오류(ERR_EMPTY_RESPONSE)를, 테스트 코드는 socket hang up을 받는다.
 */
export function networkDropMiddleware(req: Request, res: Response, next: NextFunction): void {
  const flaky = config.flaky.network;
  if (!flaky.enabled || req.method !== 'GET' || !RESOURCE_READ.test(req.path)) {
    next();
    return;
  }
  const last = lastDropped.get(req.path) ?? 0;
  if (Date.now() - last < flaky.cooldownMs || !chance(flaky.rate)) {
    next();
    return;
  }
  lastDropped.set(req.path, Date.now());
  recordFlaky('network-drop', `GET ${req.path}: 연결 끊김`);
  req.socket.destroy();
}

/** 테스트용 리셋: 주입 이력을 비우고 난수를 시드부터 다시 시작한다. */
export function resetFlaky(): void {
  events.length = 0;
  lastDropped.clear();
  random = mulberry32(config.flaky.seed);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
