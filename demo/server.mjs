import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.DEMO_PORT ?? 4173);
const instances = new Map();
const sessions = new Set();
const html = await readFile(new URL('./index.html', import.meta.url));

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
      if (url.pathname === '/api/me') return send(response, 200, { user: 'demo-user' });

      if (url.pathname === '/api/v1/instances') {
        if (request.method === 'GET') {
          return send(response, 200, [...instances.values()]);
        }
        if (request.method === 'POST') {
          const body = await readJson(request);
          if (typeof body.name !== 'string' || !body.name || typeof body.flavor !== 'string' || !body.flavor) {
            return send(response, 400, { error: 'name and flavor required' });
          }
          if ([...instances.values()].some((item) => item.name === body.name)) {
            return send(response, 409, { error: 'Duplicate name' });
          }
          const instance = {
            id: randomUUID(),
            name: body.name,
            flavor: body.flavor,
            status: 'ACTIVE',
          };
          instances.set(instance.id, instance);
          return send(response, 201, instance);
        }
      }

      return send(response, 404, { error: 'Unknown endpoint' });
    }

    const pagePaths = new Set(['/', '/login', '/instances']);
    if (!pagePaths.has(url.pathname)) return send(response, 404, {});
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

server.listen(port, '127.0.0.1', () => {
  console.log(`Local instance demo: http://127.0.0.1:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
