import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.DEMO_PORT ?? 4173);
const volumes = new Map();
const sessions = new Set();
const html = await readFile(new URL('./index.html', import.meta.url));

// 실패 원인 분류 실험(triage-lab) 전용 결함 주입. 설정하지 않으면 정상 동작한다.
// DEMO_FAULT: status-inactive | size-off-by-one | delete-noop | list-duplicates | create-500 | drop-api
//             | name-truncated | delete-500
// DEMO_LATENCY_MS: /api/v1 응답 지연(ms)
const fault = process.env.DEMO_FAULT ?? '';
const latencyMs = Number(process.env.DEMO_LATENCY_MS ?? 0);
const knownFaults = ['', 'status-inactive', 'size-off-by-one', 'delete-noop', 'list-duplicates', 'create-500', 'drop-api', 'name-truncated', 'delete-500'];
if (!knownFaults.includes(fault)) throw new Error(`Unknown DEMO_FAULT: ${fault}`);
if (fault || latencyMs) console.log(`[demo] fault injection active: fault=${fault || '-'} latencyMs=${latencyMs}`);

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new Error('Request too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/health') return send(response, 200, { ready: true });
    if (request.method === 'POST' && url.pathname === '/api/login') {
      const body = await readJson(request);
      if (body.username !== 'demo-user' || body.password !== 'demo-password') {
        return send(response, 401, { error: 'Invalid demo credentials' });
      }
      const session = randomUUID();
      sessions.add(session);
      response.setHeader('Set-Cookie', `demo-session=${session}; HttpOnly; SameSite=Strict; Path=/`);
      return send(response, 200, { user: 'demo-user' });
    }
    const session = /(?:^|;\s*)demo-session=([^;]+)/.exec(request.headers.cookie ?? '')?.[1];
    const authenticated = sessions.has(session);
    if (url.pathname.startsWith('/api/')) {
      if (!authenticated) return send(response, 401, { error: 'Authentication required' });
      if (url.pathname.startsWith('/api/v1/')) {
        if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
        if (fault === 'drop-api') return request.socket.destroy();
      }
      if (url.pathname === '/api/me') return send(response, 200, { user: 'demo-user' });
      if (url.pathname === '/api/v1/volumes') {
        if (request.method === 'GET') {
          const name = url.searchParams.get('name');
          const listed = [...volumes.values()].filter(volume => !name || volume.name === name);
          return send(response, 200, fault === 'list-duplicates' ? listed.flatMap(volume => [volume, volume]) : listed);
        }
        if (request.method === 'POST') {
          const body = await readJson(request);
          if (typeof body.name !== 'string' || !body.name || !Number.isInteger(body.sizeGiB) || body.sizeGiB <= 0) {
            return send(response, 400, { error: 'Name and positive integer sizeGiB required' });
          }
          if ([...volumes.values()].some(volume => volume.name === body.name)) {
            return send(response, 409, { error: 'Duplicate name' });
          }
          if (fault === 'create-500') return send(response, 500, { error: 'Internal error while allocating volume' });
          const volume = {
            id: randomUUID(), name: fault === 'name-truncated' ? body.name.slice(0, 20) : body.name, sizeGiB: body.sizeGiB + (fault === 'size-off-by-one' ? 1 : 0),
            status: fault === 'status-inactive' ? 'INACTIVE' : 'ACTIVE', bootable: true,
          };
          volumes.set(volume.id, volume);
          return send(response, 201, volume);
        }
      }
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/v1/volumes/')) {
        const id = url.pathname.split('/').at(-1);
        if (fault === 'delete-noop') return send(response, volumes.has(id) ? 204 : 404, {});
        if (fault === 'delete-500') return send(response, 500, { error: 'Storage backend rejected the delete request' });
        return send(response, volumes.delete(id) ? 204 : 404, {});
      }
      return send(response, 404, { error: 'Unknown endpoint' });
    }
    if (!['/', '/login', '/volumes'].includes(url.pathname)) return send(response, 404, {});
    if (url.pathname !== '/login' && !authenticated) {
      response.writeHead(302, { Location: '/login' });
      return response.end();
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  } catch (error) {
    send(response, 400, { error: error.message });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local volume demo: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
