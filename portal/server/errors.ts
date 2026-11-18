/** API 오류. 응답 본문은 { error: { code, message, field? } } 형식으로 통일한다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, field?: string) =>
  new ApiError(400, code, message, field);
export const unauthorized = (code: string, message: string) => new ApiError(401, code, message);
export const forbidden = (message: string) => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what}을(를) 찾을 수 없습니다.`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
