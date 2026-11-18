import { createApp } from './app.ts';
import { config } from './config.ts';

createApp().listen(config.port, '127.0.0.1', () => {
  console.log(`Mock 클라우드 포털 실행 중: http://127.0.0.1:${config.port}`);
  const defects = Object.entries(config.defects).filter(([, on]) => on).map(([name]) => name);
  if (defects.length > 0) console.warn(`[주의] 결함 주입 모드가 켜져 있습니다: ${defects.join(', ')}`);
  const flaky = Object.entries(config.flaky).filter(([, v]) => typeof v === 'object' && v.enabled).map(([name]) => name);
  if (flaky.length > 0) console.warn(`[주의] Flaky 주입 모드가 켜져 있습니다: ${flaky.join(', ')} (seed ${config.flaky.seed})`);
});
