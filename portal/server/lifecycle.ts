import { config } from './config.ts';
import { db } from './store.ts';

/**
 * 상태 전이를 지연 시간 뒤에 실행한다.
 * 그 사이에 리셋이 일어났다면(epoch가 바뀌었다면) 실행하지 않는다.
 */
export function later(action: () => void, delayMs: number = config.transitionDelayMs): void {
  const epoch = db.epoch;
  const timer = setTimeout(() => {
    if (db.epoch === epoch) action();
  }, delayMs);
  timer.unref();
}
