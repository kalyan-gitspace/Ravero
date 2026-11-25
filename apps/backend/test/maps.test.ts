import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import type { CustomerAuthService } from '../src/auth/service.js';
import { AppError } from '../src/errors/AppError.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { OpenRouteServiceClient } from '../src/maps/openRouteServiceClient.js';
import { PhotonClient } from '../src/maps/photonClient.js';
import { MapsService } from '../src/maps/service.js';
import { createMapsRouter } from '../src/routes/maps.js';

const routeFeature = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[78.4, 17.4], [78.41, 17.41]],
  },
  properties: {
    summary: { distance: 1250, duration: 300 },
    segments: [{ steps: [{ distance: 1250, duration: 300, instruction: 'Continue', name: 'Road' }] }],
  },
};

function createHarness(options: {
  photonResponse?: unknown;
  routingResponse?: unknown;
  photonStatus?: number;
  routingStatus?: number;
  photonFetch?: typeof fetch;
  routingFetch?: typeof fetch;
  apiKey?: string;
} = {}) {
  const calls: Array<{ provider: string; url: URL; init?: RequestInit }> = [];
  const photonFetch: typeof fetch = options.photonFetch ?? (async (input, init) => {
    calls.push({ provider: 'photon', url: new URL(input.toString()), init });
    return new Response(JSON.stringify(options.photonResponse ?? { type: 'FeatureCollection', features: [] }), {
      status: options.photonStatus ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const routingFetch: typeof fetch = options.routingFetch ?? (async (input, init) => {
    calls.push({ provider: 'openrouteservice', url: new URL(input.toString()), init });
    return new Response(JSON.stringify(options.routingResponse ?? { features: [routeFeature] }), {
      status: options.routingStatus ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const mapsService = new MapsService({
    photon: new PhotonClient({
      baseUrl: 'https://photon.example',
      timeoutMs: 100,
      fetcher: photonFetch,
    }),
    routing: new OpenRouteServiceClient({
      baseUrl: 'https://ors.example',
      apiKey: options.apiKey ?? 'server-only-test-key',
      timeoutMs: 100,
      fetcher: routingFetch,
    }),
    tileStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    routingProfile: 'driving-car',
    cacheTtlSeconds: 30,
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
  app.use('/api/v1/maps', createMapsRouter(authService, mapsService));
  app.use(errorHandler);
  return { app, calls };
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

const authHeaders = { Authorization: 'Bearer valid-access-token' };

test('map configuration is authenticated and contains no routing credential', async () => {
  const { app } = createHarness();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/config`, { headers: authHeaders });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.includes('tiles.openfreemap.org'));
    assert.ok(body.includes('driving-car'));
    assert.equal(body.includes('server-only-test-key'), false);
  });
});

test('Photon places are authenticated, normalized, and support a geographic bias', async () => {
  const { app, calls } = createHarness({
    photonResponse: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [78.3772, 17.4435] },
        properties: {
          osm_type: 'N',
          osm_id: 123,
          name: 'HITEC City',
          street: 123,
          locality: 'Madhapur',
          city: 'Hyderabad',
          state: 'Telangana',
          country: 'India',
          osm_key: 'place',
          osm_value: 'suburb',
        },
      }],
    },
  });

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/maps/places?q=HITEC`, {});
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(
      `${baseUrl}/api/v1/maps/places?q=${encodeURIComponent('HITEC City, Hyderabad')}&lat=17.385&lon=78.4867`,
      { headers: authHeaders },
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.places[0], {
      id: 'N123',
      name: 'HITEC City',
      displayName: 'HITEC City, Madhapur, Hyderabad, Telangana, India',
      locality: 'Madhapur',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      category: 'place',
      type: 'suburb',
      coordinates: { latitude: 17.4435, longitude: 78.3772 },
    });
    const cachedResponse = await fetch(
      `${baseUrl}/api/v1/maps/search?q=${encodeURIComponent('HITEC City, Hyderabad')}&lat=17.385&lon=78.4867`,
      { headers: authHeaders },
    );
    assert.equal(cachedResponse.status, 200);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('lat'), '17.385');
  assert.equal(calls[0].url.searchParams.get('lon'), '78.4867');
});

test('Photon places return up to 15 results with a Hyderabad bias when no location is selected', async () => {
  const features = Array.from({ length: 15 }, (_, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [78.4 + index / 1000, 17.4 + index / 1000],
    },
    properties: {
      osm_type: 'N',
      osm_id: index + 1,
      name: `Hyderabad place ${index + 1}`,
      city: 'Hyderabad',
    },
  }));
  const { app, calls } = createHarness({
    photonResponse: { type: 'FeatureCollection', features },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/maps/places?q=locality&limit=15`,
      { headers: authHeaders },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.places.length, 15);
    assert.deepEqual(body.data.places[0].coordinates, {
      latitude: 17.4,
      longitude: 78.4,
    });

    const invalidLimit = await fetch(
      `${baseUrl}/api/v1/maps/places?q=locality&limit=16`,
      { headers: authHeaders },
    );
    assert.equal(invalidLimit.status, 400);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('limit'), '15');
  assert.equal(calls[0].url.searchParams.get('lat'), '17.385');
  assert.equal(calls[0].url.searchParams.get('lon'), '78.4867');
  assert.equal(calls[0].url.searchParams.get('zoom'), '12');
  assert.equal(calls[0].url.searchParams.get('location_bias_scale'), '0.1');
  assert.equal(calls[0].url.searchParams.get('countrycode'), 'IN');
});

test('ambiguous locality matches are ranked by proximity without removing other Indian results', async () => {
  const features = [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [78.0869226, 15.5426689] },
      properties: {
        name: 'Medpalli',
        state: 'Andhra Pradesh',
        osm_key: 'place',
        osm_value: 'village',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [80.1576018, 19.0881364] },
      properties: {
        name: 'Medpalli',
        state: 'Maharashtra',
        osm_key: 'place',
        osm_value: 'village',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [78.6005299, 17.4075789] },
      properties: {
        name: 'Medpally',
        state: 'Telangana',
        osm_key: 'place',
        osm_value: 'suburb',
      },
    },
  ];
  const { app, calls } = createHarness({
    photonResponse: { type: 'FeatureCollection', features },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/maps/places?q=Medpalli`,
      { headers: authHeaders },
    );
    const places = (await response.json()).data.places;

    assert.equal(response.status, 200);
    assert.equal(places[0].name, 'Medpally');
    assert.equal(places[0].state, 'Telangana');
    assert.equal(places.length, 3);
    assert.ok(places.some((place: { state: string }) => place.state === 'Andhra Pradesh'));
    assert.ok(places.some((place: { state: string }) => place.state === 'Maharashtra'));
  });

  assert.equal(calls[0].url.searchParams.get('lat'), '17.385');
  assert.equal(calls[0].url.searchParams.get('lon'), '78.4867');
});

test('reverse geocoding returns structured Photon addresses or a coordinate fallback', async () => {
  const { app, calls } = createHarness({
    photonResponse: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [78.4867, 17.385] },
        properties: { name: 'Hyderabad', state: 'Telangana', country: 'India' },
      }],
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/reverse?lat=17.385&lon=78.4867`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.result.formattedAddress, 'Hyderabad, Telangana, India');
  });

  assert.equal(calls[0].url.pathname, '/reverse');

  const empty = createHarness();
  await withServer(empty.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/reverse?lat=17.385&lon=78.4867`, {
      headers: authHeaders,
    });
    const result = (await response.json()).data.result;
    assert.equal(result.placeId, 'coords-17.38500-78.48670');
    assert.equal(result.coordinates.latitude, 17.385);
  });
});

test('empty queries and invalid coordinates are rejected before contacting providers', async () => {
  const { app, calls } = createHarness();
  await withServer(app, async (baseUrl) => {
    const emptySearch = await fetch(`${baseUrl}/api/v1/maps/search?q=%20`, {
      headers: authHeaders,
    });
    assert.equal(emptySearch.status, 400);

    const invalidReverse = await fetch(`${baseUrl}/api/v1/maps/reverse?lat=91&lon=78`, {
      headers: authHeaders,
    });
    assert.equal(invalidReverse.status, 400);

    const invalidRoute = await fetch(`${baseUrl}/api/v1/maps/route`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 181 },
        destination: { latitude: 17.5, longitude: 78.5 },
      }),
    });
    assert.equal(invalidRoute.status, 400);
  });
  assert.equal(calls.length, 0);
});

test('route requests use ORS GeoJSON coordinates and return normalized distance, duration and geometry', async () => {
  const { app, calls } = createHarness({ routingResponse: { features: [routeFeature] } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/route`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 78.4 },
        destination: { latitude: 17.41, longitude: 78.41 },
      }),
    });
    assert.equal(response.status, 200);
    const route = (await response.json()).data.routes[0];
    assert.equal(route.distanceMeters, 1250);
    assert.equal(route.distanceKm, 1.25);
    assert.equal(route.durationSeconds, 300);
    assert.equal(route.durationMinutes, 5);
    assert.deepEqual(route.geometry, routeFeature.geometry);
    assert.equal(route.profile, 'driving-car');
    assert.equal(typeof route.fareRouteToken, 'string');
    assert.ok(route.fareRouteToken.length > 0);
  });

  assert.equal(calls[0].url.pathname, '/v2/directions/driving-car/geojson');
  assert.equal(new Headers(calls[0].init?.headers).get('Authorization'), 'server-only-test-key');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)).coordinates, [
    [78.4, 17.4],
    [78.41, 17.41],
  ]);
  assert.equal(JSON.parse(String(calls[0].init?.body)).alternative_routes.target_count, 2);
});

test('ORS retries a timed-out request once and returns a later successful response', async () => {
  let attempts = 0;
  const client = new OpenRouteServiceClient({
    baseUrl: 'https://ors.example',
    apiKey: 'server-only-test-key',
    timeoutMs: 10,
    fetcher: (_input, init) => {
      attempts += 1;
      if (attempts > 1) {
        return Promise.resolve(new Response(JSON.stringify({ features: [routeFeature] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });

  const routes = await client.route(
    { latitude: 17.4, longitude: 78.4 },
    { latitude: 17.41, longitude: 78.41 },
    { profile: 'driving-car' },
  );

  assert.equal(attempts, 2);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].distanceMeters, 1250);
});

test('ORS does not retry authorization or quota responses', async () => {
  for (const [status, code] of [
    [401, 'MAPS_PROVIDER_ERROR'],
    [429, 'MAPS_PROVIDER_RATE_LIMITED'],
  ] as const) {
    let attempts = 0;
    const client = new OpenRouteServiceClient({
      baseUrl: 'https://ors.example',
      apiKey: 'server-only-test-key',
      timeoutMs: 10,
      fetcher: async () => {
        attempts += 1;
        return new Response('{}', { status });
      },
    });

    await assert.rejects(
      client.route(
        { latitude: 17.4, longitude: 78.4 },
        { latitude: 17.41, longitude: 78.41 },
        { profile: 'driving-car' },
      ),
      (error: unknown) => error instanceof AppError && error.code === code,
    );
    assert.equal(attempts, 1);
  }
});

test('matrix requests support multiple driver origins and ETA uses the routed duration', async () => {
  const { app, calls } = createHarness({
    routingResponse: { durations: [[300, 600]], distances: [[1200, 2500]] },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/matrix`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [{ latitude: 17.4, longitude: 78.4 }],
        destinations: [
          { latitude: 17.5, longitude: 78.5 },
          { latitude: 17.6, longitude: 78.6 },
        ],
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.matrix.durations, [[300, 600]]);
  });
  assert.equal(calls[0].url.pathname, '/v2/matrix/driving-car');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)).locations, [
    [78.4, 17.4],
    [78.5, 17.5],
    [78.6, 17.6],
  ]);

  const etaHarness = createHarness({ routingResponse: { features: [routeFeature] } });
  await withServer(etaHarness.app, async (baseUrl) => {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/api/v1/maps/eta`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 78.4 },
        destination: { latitude: 17.41, longitude: 78.41 },
      }),
    });
    const eta = (await response.json()).data.eta;
    assert.equal(eta.durationSeconds, 300);
    assert.ok(Date.parse(eta.etaTimestamp) >= before + 300_000);
  });
});

test('provider timeouts, outages, missing routing credentials, and API rate limits are explicit', async () => {
  const timeoutHarness = createHarness({
    photonFetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });
  await withServer(timeoutHarness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/search?q=Hyderabad`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'MAPS_PROVIDER_TIMEOUT');
  });

  const unavailable = createHarness({ photonStatus: 503 });
  await withServer(unavailable.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/search?q=Hyderabad`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'MAPS_PROVIDER_ERROR');
  });

  const unconfigured = createHarness({ apiKey: '' });
  await withServer(unconfigured.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/route`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 78.4 },
        destination: { latitude: 17.41, longitude: 78.41 },
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'ROUTING_NOT_CONFIGURED');
  });

  const routingUnavailable = createHarness({ routingStatus: 503 });
  await withServer(routingUnavailable.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/route`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 78.4 },
        destination: { latitude: 17.41, longitude: 78.41 },
      }),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'MAPS_PROVIDER_ERROR');
  });

  let routingTimeoutAttempts = 0;
  const routingTimeout = createHarness({
    routingFetch: (_input, init) => {
      routingTimeoutAttempts += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  await withServer(routingTimeout.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/route`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 17.4, longitude: 78.4 },
        destination: { latitude: 17.41, longitude: 78.41 },
      }),
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'MAPS_PROVIDER_TIMEOUT');
  });
  assert.equal(routingTimeoutAttempts, 2);

  const limited = createHarness();
  await withServer(limited.app, async (baseUrl) => {
    for (let request = 0; request < 60; request += 1) {
      const response = await fetch(`${baseUrl}/api/v1/maps/config`, { headers: authHeaders });
      assert.equal(response.status, 200);
    }
    const response = await fetch(`${baseUrl}/api/v1/maps/config`, { headers: authHeaders });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'MAPS_RATE_LIMITED');
  });
});
