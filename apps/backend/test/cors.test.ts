import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { app } from '../src/app.js';

test('development CORS allows the customer web preview origins and requested API headers', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    for (const origin of [
      'http://localhost:8082',
      'http://localhost:8084',
      'http://127.0.0.1:8082',
      'http://127.0.0.1:8084',
    ]) {
      const preflight = await fetch(`${baseUrl}/api/v1/auth/customer/send-otp`, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      assert.equal(preflight.status, 204, origin);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.match(preflight.headers.get('vary') ?? '', /Origin/i);
      assert.deepEqual(
        preflight.headers.get('access-control-allow-methods')?.split(', '),
        ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      );
      assert.deepEqual(
        preflight.headers.get('access-control-allow-headers')?.split(', '),
        ['Content-Type', 'Authorization', 'Idempotency-Key'],
      );
    }

    const unapproved = await fetch(`${baseUrl}/api/v1/auth/customer/send-otp`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://malicious.example',
        'access-control-request-method': 'POST',
      },
    });

    assert.equal(unapproved.status, 403);
    assert.equal(unapproved.headers.get('access-control-allow-origin'), null);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
