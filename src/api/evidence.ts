/** 테스트 한 건의 증적: HTTP 응답 이력(2xx 포함)과 상태 폴링 이력. */
export interface HttpRecord {
  at: string;
  method: string;
  path: string;
  status: number;
  /** 오류 응답일 때의 오류 코드 */
  errorCode?: string;
  elapsedMs: number;
}

export interface PollRecord {
  at: string;
  /** 무엇을 기다렸는지. 예: "볼륨 vol-0001 → AVAILABLE" */
  what: string;
  /** 그 시점에 관측한 값. 예: "CREATING", "목록에 없음" */
  observed: string;
}

export class Evidence {
  readonly http: HttpRecord[] = [];
  readonly polls: PollRecord[] = [];

  recordHttp(record: Omit<HttpRecord, 'at'>): void {
    this.http.push({ at: new Date().toISOString(), ...record });
  }

  recordPoll(what: string, observed: string): void {
    this.polls.push({ at: new Date().toISOString(), what, observed });
  }
}
