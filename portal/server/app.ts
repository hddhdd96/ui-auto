import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.ts';
import { authRouter } from './routes/auth.ts';
import { environmentRouter } from './routes/environment.ts';
import { instanceRouter } from './routes/instances.ts';
import { networkRouter } from './routes/networks.ts';
import { volumeRouter } from './routes/volumes.ts';

export function createApp() {
  const app = express();
  app.use(express.json());

  const api = express.Router();
  api.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  api.use(authRouter, environmentRouter, instanceRouter, volumeRouter, networkRouter);
  api.use((_req, _res, next) => { next(new ApiError(404, 'NOT_FOUND', '존재하지 않는 API입니다.')); });
  app.use('/api', api);

  // 웹 콘솔(빌드 없는 정적 파일)
  app.use(express.static(path.join(import.meta.dirname, '..', 'web')));

  // 모든 오류를 { error: { code, message, field? } } 형식으로 돌려준다.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, field: err.field } });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: '요청 본문이 올바른 JSON이 아닙니다.' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류가 발생했습니다.' } });
  });

  return app;
}
