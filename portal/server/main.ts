import express from 'express';

const port = Number(process.env.PORTAL_PORT ?? 4173);
const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Mock 클라우드 포털 실행 중: http://127.0.0.1:${port}`);
});
