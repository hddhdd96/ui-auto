import { createApp } from './app.ts';
import { config } from './config.ts';

createApp().listen(config.port, '127.0.0.1', () => {
  console.log(`Mock 클라우드 포털 실행 중: http://127.0.0.1:${config.port}`);
});
