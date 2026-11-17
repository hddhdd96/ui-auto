import { testConfig } from '../config';
import type { Evidence } from './evidence';

export class PollError extends Error {
  constructor(
    message: string,
    /** timeout: 제한 시간 안에 끝나지 않음, failed: 실패 상태를 관측해 바로 중단 */
    readonly reason: 'timeout' | 'failed',
    readonly observations: string[],
  ) {
    super(message);
    this.name = 'PollError';
  }
}

export interface PollOptions<T> {
  /** 무엇을 기다리는지. 로그와 오류 메시지에 쓴다. */
  what: string;
  read: () => Promise<T>;
  isDone: (value: T) => boolean;
  /** 실패 상태면 이유를 돌려준다. 이유가 나오면 기다리지 않고 바로 실패 처리한다. */
  failure?: (value: T) => string | null;
  /** 관측값을 이력에 남길 짧은 문자열로 바꾼다. */
  describe: (value: T) => string;
  evidence?: Evidence;
  timeoutMs?: number;
  intervalMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 조건이 참이 될 때까지 상태를 반복 조회한다.
 * '요청 성공'이 아니라 '실제 작업 완료'를 판정하기 위한 공통 함수다.
 */
export async function poll<T>(options: PollOptions<T>): Promise<T> {
  const timeoutMs = options.timeoutMs ?? testConfig.pollTimeoutMs;
  const intervalMs = options.intervalMs ?? testConfig.pollIntervalMs;
  const deadline = Date.now() + timeoutMs;
  const observations: string[] = [];

  for (;;) {
    const value = await options.read();
    const observed = options.describe(value);
    // 같은 값이 이어지면 이력에는 한 번만 남긴다.
    if (observations.at(-1) !== observed) {
      observations.push(observed);
      options.evidence?.recordPoll(options.what, observed);
    }
    if (options.isDone(value)) return value;

    const failure = options.failure?.(value) ?? null;
    if (failure) {
      throw new PollError(`${options.what}: 실패 상태를 확인해 대기를 중단했습니다. ${failure}`, 'failed', observations);
    }
    if (Date.now() + intervalMs > deadline) {
      throw new PollError(
        `${options.what}: ${timeoutMs}ms 안에 끝나지 않았습니다. 관측 이력: ${observations.join(' → ')}`,
        'timeout', observations,
      );
    }
    await sleep(intervalMs);
  }
}
