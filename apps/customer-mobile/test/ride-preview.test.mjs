import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateSelectedRoute, loadRidePreview } from '../src/booking/ridePreview.ts';

const request = {
  serviceTypeCode: 'AUTO',
  pickup: {
    label: 'Charminar',
    address: 'Charminar, Hyderabad',
    latitude: 17.3616,
    longitude: 78.4747,
    placeId: 'pickup-place',
  },
  dropoff: {
    label: 'Gachibowli',
    address: 'Gachibowli, Hyderabad',
    latitude: 17.4401,
    longitude: 78.3489,
    placeId: 'drop-place',
  },
  stops: [],
};

const routes = [{
  distanceMeters: 13500,
  distanceKm: 13.5,
  estimatedDurationSeconds: 2400,
  estimatedDurationMinutes: 40,
  durationSeconds: 2400,
  durationMinutes: 40,
  geometry: {
    type: 'LineString',
    coordinates: [[78.4747, 17.3616], [78.3489, 17.4401]],
  },
  profile: 'driving-car',
  fareRouteToken: 'route-token-1',
}, {
  distanceMeters: 14100,
  distanceKm: 14.1,
  durationSeconds: 2250,
  durationMinutes: 37.5,
  geometry: {
    type: 'LineString',
    coordinates: [[78.4747, 17.3616], [78.3489, 17.4401]],
  },
  profile: 'driving-car',
  fareRouteToken: 'route-token-2',
}];

const estimate = {
  currency: 'INR',
  distanceMeters: 13500,
  distanceKm: 13.5,
  baseAmount: 30,
  distanceAmount: 83.3,
  timeAmount: 0,
  platformFeeAmount: 0,
  driverCommissionAmount: 0,
  totalAmount: 113.3,
  roundingPolicy: 'NEAREST_PAISE_HALF_UP_FINAL_TOTAL',
  distanceBreakdown: [],
  isDevelopmentEstimate: false,
  expiresAt: '2026-11-24T10:00:00.000Z',
};

test('ride preview routes the selected booking coordinates before requesting its estimate', async () => {
  const calls = [];
  let routeCallback;
  const api = {
    async computeRoute(origin, destination) {
      calls.push({ operation: 'route', origin, destination });
      return routes;
    },
    async estimateBooking(input, fareRouteToken) {
      calls.push({ operation: 'estimate', input, fareRouteToken });
      return estimate;
    },
  };

  const result = await loadRidePreview(api, request, (loadedRoutes) => {
    routeCallback = loadedRoutes;
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      operation: 'route',
      origin: { latitude: 17.3616, longitude: 78.4747 },
      destination: { latitude: 17.4401, longitude: 78.3489 },
    },
    { operation: 'estimate', input: request, fareRouteToken: 'route-token-1' },
  ]);
  assert.equal(routeCallback, routes);
  assert.equal(result.estimate, estimate);
  assert.equal(result.fareRouteToken, 'route-token-1');
  assert.equal(result.routes.length, 2);
  assert.equal(result.routes[0].distanceMeters, 13500);
});

test('switching alternatives estimates the fare using that ORS route quote', async () => {
  const estimates = [];
  const selectedEstimate = { ...estimate, distanceMeters: 14100, distanceKm: 14.1 };
  const api = {
    async estimateBooking(input, fareRouteToken) {
      estimates.push({ input, fareRouteToken });
      return fareRouteToken === 'route-token-2' ? selectedEstimate : estimate;
    },
  };

  const result = await estimateSelectedRoute(api, request, routes[1]);

  assert.deepEqual(estimates, [{ input: request, fareRouteToken: 'route-token-2' }]);
  assert.equal(result, selectedEstimate);
});

test('ride preview rejects missing or invalid coordinates before calling the API', async () => {
  let apiCalls = 0;
  const api = {
    async computeRoute() {
      apiCalls += 1;
      return routes;
    },
    async estimateBooking() {
      apiCalls += 1;
      return estimate;
    },
  };

  const missingPickup = await loadRidePreview(api, {
    ...request,
    pickup: { label: 'Charminar', address: 'Charminar, Hyderabad' },
  });
  const invalidDestination = await loadRidePreview(api, {
    ...request,
    dropoff: { ...request.dropoff, longitude: 181 },
  });

  assert.equal(missingPickup.ok, false);
  assert.equal(invalidDestination.ok, false);
  assert.equal(apiCalls, 0);
});

test('changing a selected location sends the updated coordinates for a new route', async () => {
  const routedEndpoints = [];
  const api = {
    async computeRoute(origin, destination) {
      routedEndpoints.push({ origin, destination });
      return routes;
    },
    async estimateBooking() {
      return estimate;
    },
  };
  const changedRequest = {
    ...request,
    dropoff: { ...request.dropoff, latitude: 17.4435, longitude: 78.3772 },
  };
  const changedPickupRequest = {
    ...request,
    pickup: { ...request.pickup, latitude: 17.385, longitude: 78.4867 },
  };

  await loadRidePreview(api, request);
  await loadRidePreview(api, changedRequest);
  await loadRidePreview(api, changedPickupRequest);

  assert.deepEqual(routedEndpoints, [
    {
      origin: { latitude: 17.3616, longitude: 78.4747 },
      destination: { latitude: 17.4401, longitude: 78.3489 },
    },
    {
      origin: { latitude: 17.3616, longitude: 78.4747 },
      destination: { latitude: 17.4435, longitude: 78.3772 },
    },
    {
      origin: { latitude: 17.385, longitude: 78.4867 },
      destination: { latitude: 17.4401, longitude: 78.3489 },
    },
  ]);
});

test('route failures and empty routes prevent fare estimation', async () => {
  let estimateCalls = 0;
  const failingApi = {
    async computeRoute() {
      throw new Error('Route provider timed out.');
    },
    async estimateBooking() {
      estimateCalls += 1;
      return estimate;
    },
  };
  const emptyApi = {
    async computeRoute() {
      return [];
    },
    async estimateBooking() {
      estimateCalls += 1;
      return estimate;
    },
  };

  const timeout = await loadRidePreview(failingApi, request);
  const noRoute = await loadRidePreview(emptyApi, request);

  assert.equal(timeout.ok, false);
  assert.equal(timeout.step, 'route');
  assert.equal(noRoute.ok, false);
  assert.equal(noRoute.step, 'route');
  assert.equal(estimateCalls, 0);
});

test('fare-estimate failure is reported after route resolution', async () => {
  const calls = [];
  const result = await loadRidePreview({
    async computeRoute() {
      calls.push('route');
      return routes;
    },
    async estimateBooking() {
      calls.push('estimate');
      throw new Error('Estimate unavailable.');
    },
  }, request);

  assert.deepEqual(calls, ['route', 'estimate']);
  assert.equal(result.ok, false);
  assert.equal(result.step, 'fare');
});
