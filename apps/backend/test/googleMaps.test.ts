import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import type { CustomerAuthService } from '../src/auth/service.js';
import { AppError } from '../src/errors/AppError.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { GoogleMapsService } from '../src/maps/googleMapsService.js';
import type {
  GoogleMapsSku,
  GoogleMapsUsageRepository,
} from '../src/maps/types.js';
import { createGoogleMapsRouter } from '../src/routes/customer/googleMaps.js';

class InMemoryGoogleMapsUsageRepository implements GoogleMapsUsageRepository {
  readonly counts = new Map<string, number>();
  fail = false;

  async reserveMonthlyUsage(sku: GoogleMapsSku, month: Date, monthlyLimit: number) {
    if (this.fail) throw new Error('tracking database unavailable');
    const key = `${month.toISOString().slice(0, 10)}:${sku}`;
    const count = this.counts.get(key) ?? 0;
    if (count >= monthlyLimit) return false;
    this.counts.set(key, count + 1);
    return true;
  }
}

function createHarness(options: {
  limits?: Partial<Record<GoogleMapsSku, number>>;
  apiKey?: string;
  response?: unknown;
  status?: number;
  fetchError?: boolean;
  trackingError?: boolean;
} = {}) {
  const usageRepository = new InMemoryGoogleMapsUsageRepository();
  usageRepository.fail = options.trackingError ?? false;
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(input.toString()), init });
    if (options.fetchError) throw new Error('upstream unavailable');
    return new Response(JSON.stringify(options.response ?? {}), {
      status: options.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const mapsService = new GoogleMapsService({
    apiKey: options.apiKey ?? 'server-only-test-key',
    monthlyLimits: options.limits ?? {
      AUTOCOMPLETE_REQUESTS: 10,
      PLACE_DETAILS_ESSENTIALS: 10,
      GEOCODING: 10,
      ROUTES_COMPUTE_ESSENTIALS: 10,
    },
    usageRepository,
    fetcher,
    now: () => new Date('2026-11-11T14:00:00.000Z'),
  });
  const authService = {
    authenticateAccessToken: async (token: string) => {
      if (token !== 'valid-access-token') {
        throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
      }
      return { userId: 'customer-1', sessionId: 'session-1' };
    },
  } as unknown as CustomerAuthService;
  const app = express();
  app.use(express.json());
  app.use('/api/v1/customer/maps', createGoogleMapsRouter(authService, mapsService));
  app.use(errorHandler);
  return { app, calls, usageRepository };
}

async function withServer<T>(app: express.Express, callback: (baseUrl: string) => Promise<T>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function post(baseUrl: string, path: string, body: unknown, authenticated = true) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer valid-access-token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

test('autocomplete is customer-authenticated, requires a session token, and requests minimal fields', async () => {
  const { app, calls, usageRepository } = createHarness({
    response: {
      suggestions: [
        { placePrediction: { placeId: 'place-1', text: { text: 'Ravero Cafe' } } },
        { queryPrediction: { text: { text: 'ignored query' } } },
      ],
    },
  });

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await post(
      baseUrl,
      '/api/v1/customer/maps/places/autocomplete',
      { input: 'Ravero', sessionToken: 'session-token-1' },
      false,
    );
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, 0);

    const invalid = await post(baseUrl, '/api/v1/customer/maps/places/autocomplete', {
      input: 'Ravero',
    });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 0);

    const response = await post(baseUrl, '/api/v1/customer/maps/places/autocomplete', {
      input: 'Ravero',
      sessionToken: 'session-token-1',
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.suggestions, [
      { placeId: 'place-1', text: 'Ravero Cafe' },
    ]);
  });

  assert.equal(usageRepository.counts.get('2026-11-01:AUTOCOMPLETE_REQUESTS'), 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.toString(), 'https://places.googleapis.com/v1/places:autocomplete');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    input: 'Ravero',
    sessionToken: 'session-token-1',
  });
  assert.equal(
    new Headers(calls[0].init?.headers).get('X-Goog-FieldMask'),
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
  );
  assert.equal(new Headers(calls[0].init?.headers).get('X-Goog-Api-Key'), 'server-only-test-key');
});

test('Place Details sends the autocomplete session token and only Essentials fields', async () => {
  const { app, calls } = createHarness({
    response: {
      id: 'place-1',
      formattedAddress: '1 Example Road',
      location: { latitude: 17.4, longitude: 78.4 },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/places/details', {
      placeId: 'place-1',
      sessionToken: 'session-token-1',
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.place, {
      placeId: 'place-1',
      formattedAddress: '1 Example Road',
      location: { latitude: 17.4, longitude: 78.4 },
    });
  });

  assert.equal(calls[0].url.searchParams.get('sessionToken'), 'session-token-1');
  assert.equal(
    new Headers(calls[0].init?.headers).get('X-Goog-FieldMask'),
    'id,formattedAddress,location',
  );
});

test('Place Details can refresh a saved place ID without a session token', async () => {
  const { app, calls } = createHarness({
    response: {
      id: 'place-1',
      formattedAddress: '1 Example Road',
      location: { latitude: 17.4, longitude: 78.4 },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/places/details', {
      placeId: 'place-1',
    });
    assert.equal(response.status, 200);
  });

  assert.equal(calls[0].url.searchParams.has('sessionToken'), false);
});

test('reverse geocoding maps a result without triggering route computation', async () => {
  const { app, calls, usageRepository } = createHarness({
    response: {
      status: 'OK',
      results: [{ formatted_address: 'Hyderabad, Telangana', place_id: 'place-2' }],
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/geocoding/reverse', {
      location: { latitude: 17.4, longitude: 78.4 },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.result, {
      formattedAddress: 'Hyderabad, Telangana',
      placeId: 'place-2',
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.hostname, 'maps.googleapis.com');
  assert.equal(calls[0].url.searchParams.get('latlng'), '17.4,78.4');
  assert.equal(calls[0].url.searchParams.get('key'), 'server-only-test-key');
  assert.equal(usageRepository.counts.size, 1);
  assert.equal([...usageRepository.counts.keys()][0].endsWith(':GEOCODING'), true);
});

test('route computation is an explicit Essentials request with its own budget SKU', async () => {
  const { app, calls, usageRepository } = createHarness({
    response: {
      routes: [{
        distanceMeters: 1200,
        duration: '300s',
        polyline: { encodedPolyline: 'abc' },
      }],
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/routes/compute', {
      origin: { latitude: 17.4, longitude: 78.4 },
      destination: { latitude: 17.5, longitude: 78.5 },
      travelMode: 'DRIVE',
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.route, {
      distanceMeters: 1200,
      duration: '300s',
      encodedPolyline: 'abc',
    });
  });

  assert.equal(calls[0].url.toString(), 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(
    new Headers(calls[0].init?.headers).get('X-Goog-FieldMask'),
    'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
  );
  assert.deepEqual(
    [...usageRepository.counts.keys()],
    ['2026-11-01:ROUTES_COMPUTE_ESSENTIALS'],
  );
});

test('dynamic web map loads reserve their own SKU without making a Google API request', async () => {
  const { app, calls, usageRepository } = createHarness({
    limits: {
      AUTOCOMPLETE_REQUESTS: 10,
      PLACE_DETAILS_ESSENTIALS: 10,
      GEOCODING: 10,
      ROUTES_COMPUTE_ESSENTIALS: 10,
      DYNAMIC_MAPS_LOADS: 2,
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(
      baseUrl,
      '/api/v1/customer/maps/dynamic-maps/reserve-load',
      {},
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { reserved: true });
  });

  assert.equal(usageRepository.counts.get('2026-11-01:DYNAMIC_MAPS_LOADS'), 1);
  assert.equal(calls.length, 0);
});

test('monthly reservations atomically stop over-limit requests before upstream calls', async () => {
  const { app, calls, usageRepository } = createHarness({
    limits: { AUTOCOMPLETE_REQUESTS: 1 },
    response: { suggestions: [] },
  });

  await withServer(app, async (baseUrl) => {
    const body = { input: 'Ravero', sessionToken: 'session-token-1' };
    assert.equal((await post(baseUrl, '/api/v1/customer/maps/places/autocomplete', body)).status, 200);
    const limited = await post(baseUrl, '/api/v1/customer/maps/places/autocomplete', body);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'GOOGLE_MAPS_MONTHLY_LIMIT_REACHED');
  });

  assert.equal(calls.length, 1);
  assert.equal(usageRepository.counts.get('2026-11-01:AUTOCOMPLETE_REQUESTS'), 1);
});

test('unconfigured budgets and unavailable tracking fail closed without contacting Google', async () => {
  const noBudget = createHarness({ limits: {} });
  await withServer(noBudget.app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/geocoding/reverse', {
      location: { latitude: 17.4, longitude: 78.4 },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'GOOGLE_MAPS_BUDGET_NOT_CONFIGURED');
  });
  assert.equal(noBudget.calls.length, 0);

  const trackingUnavailable = createHarness({ trackingError: true });
  await withServer(trackingUnavailable.app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/geocoding/reverse', {
      location: { latitude: 17.4, longitude: 78.4 },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'GOOGLE_MAPS_USAGE_TRACKING_UNAVAILABLE');
  });
  assert.equal(trackingUnavailable.calls.length, 0);
});

test('missing server key fails explicitly without contacting Google', async () => {
  const { app, calls } = createHarness({ apiKey: '' });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/places/autocomplete', {
      input: 'Ravero',
      sessionToken: 'session-token-1',
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'GOOGLE_MAPS_NOT_CONFIGURED');
  });

  assert.equal(calls.length, 0);
});

test('upstream failures return an explicit error and keep the request reserved', async () => {
  const { app, calls, usageRepository } = createHarness({ fetchError: true });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, '/api/v1/customer/maps/geocoding/reverse', {
      location: { latitude: 17.4, longitude: 78.4 },
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'GOOGLE_MAPS_UPSTREAM_ERROR');
  });

  assert.equal(calls.length, 1);
  assert.equal(usageRepository.counts.get('2026-11-01:GEOCODING'), 1);
});
