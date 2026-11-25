import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AppError } from '../src/errors/AppError.js';
import { calculateAutoFare } from '../src/booking/fare.js';
import {
  createFareRouteToken,
  FARE_ROUTE_QUOTE_TTL_MS,
} from '../src/booking/routeQuote.js';
import { CustomerBookingService } from '../src/booking/service.js';
import type {
  BookingRecord,
  BookingRepository,
  CreateBookingInput,
  CreateBookingRecordInput,
  FareEstimate,
  ServiceTypeRecord,
} from '../src/booking/types.js';

class InMemoryBookingRepository implements BookingRepository {
  readonly bookings = new Map<string, { customerId: string; requestHash: string; record: BookingRecord }>();
  createCount = 0;
  readonly serviceTypes = new Map<string, ServiceTypeRecord>([
    ['AUTO', { id: randomUUID(), code: 'AUTO', name: 'Auto' }],
    ['CAB', { id: randomUUID(), code: 'CAB', name: 'Cab' }],
    ['TWO_WHEELER', { id: randomUUID(), code: 'TWO_WHEELER', name: 'Two-wheeler' }],
  ]);

  async getActiveServiceType(code: string): Promise<ServiceTypeRecord | null> {
    return this.serviceTypes.get(code) ?? null;
  }

  async getIdempotentBooking(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<BookingRecord | null> {
    const existing = this.bookings.get(`${customerId}:${idempotencyKey}`);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Request key reused.');
    }
    return existing.record;
  }

  async createBooking(data: CreateBookingRecordInput): Promise<BookingRecord> {
    const key = `${data.customerId}:${data.idempotencyKey}`;
    const existing = this.bookings.get(key);
    if (existing) {
      if (existing.requestHash !== data.requestHash) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Request key reused.');
      }
      return existing.record;
    }

    this.createCount += 1;
    const record = this.createRecord(data.serviceType, data.request, data.fareEstimate);
    this.bookings.set(key, {
      customerId: data.customerId,
      requestHash: data.requestHash,
      record,
    });
    return record;
  }

  async listBookings(customerId: string): Promise<BookingRecord[]> {
    return [...this.bookings.values()]
      .filter((entry) => entry.customerId === customerId)
      .map((entry) => entry.record);
  }

  async getBooking(customerId: string, bookingId: string): Promise<BookingRecord | null> {
    return (
      [...this.bookings.values()].find(
        (entry) => entry.customerId === customerId && entry.record.id === bookingId,
      )?.record ?? null
    );
  }

  async cancelBooking(customerId: string, bookingId: string): Promise<BookingRecord | null> {
    const entry = [...this.bookings.values()].find(
      (candidate) => candidate.customerId === customerId && candidate.record.id === bookingId,
    );
    if (!entry || entry.record.status !== 'REQUESTED') return null;
    entry.record.status = 'CANCELLED';
    return entry.record;
  }

  private createRecord(
    serviceType: ServiceTypeRecord,
    request: CreateBookingInput,
    fareEstimate: FareEstimate,
  ): BookingRecord {
    const now = new Date('2026-11-10T00:00:00.000Z');
    return {
      id: randomUUID(),
      status: 'REQUESTED',
      serviceType: { code: serviceType.code, name: serviceType.name },
      pickup: request.pickup,
      dropoff: request.dropoff,
      stops: request.stops,
      scheduledAt: request.scheduledAt ?? null,
      fareEstimate,
      paymentMode: 'CASH',
      paymentStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
  }
}

function createHarness() {
  const now = new Date('2026-11-10T00:00:00.000Z');
  const routeQuoteSecret = 'test-route-quote-secret';
  const repository = new InMemoryBookingRepository();
  const service = new CustomerBookingService(repository, {
    routeQuoteSecret,
    now: () => now,
  });
  const request: CreateBookingInput = {
    serviceTypeCode: 'AUTO',
    pickup: {
      label: 'Home',
      address: 'Banjara Hills, Hyderabad',
      latitude: 17.4123,
      longitude: 78.4482,
      placeId: 'pickup-place',
    },
    dropoff: {
      label: 'Charminar',
      address: 'Old City, Hyderabad',
      latitude: 17.3616,
      longitude: 78.4747,
      placeId: 'drop-place',
    },
    stops: [],
    fareRouteToken: createFareRouteToken({
      customerId: 'customer-1',
      origin: { latitude: 17.4123, longitude: 78.4482 },
      destination: { latitude: 17.3616, longitude: 78.4747 },
      distanceMeters: 13_500,
      durationSeconds: 2_400,
      profile: 'driving-car',
    }, routeQuoteSecret, now.getTime()),
  };
  return { repository, service, request, routeQuoteSecret, now };
}

test('approved progressive Auto fares match all required distance boundaries', async () => {
  const { service, request, routeQuoteSecret, now } = createHarness();
  const boundaries: [number, number][] = [
    [1, 30],
    [1.59, 30],
    [1.6, 30],
    [1.61, 30.13],
    [4.99, 74.07],
    [5, 74.2],
    [5.01, 74.31],
    [9.99, 129.09],
    [10, 129.2],
    [10.01, 129.31],
    [19.99, 234.1],
    [20, 234.2],
    [20.01, 234.3],
    [25, 284.2],
  ];

  for (const [distanceKm, expectedTotal] of boundaries) {
    const fareRouteToken = createFareRouteToken({
      customerId: 'customer-1',
      origin: { latitude: 17.4123, longitude: 78.4482 },
      destination: { latitude: 17.3616, longitude: 78.4747 },
      distanceMeters: distanceKm * 1000,
      durationSeconds: 2_400,
      profile: 'driving-car',
    }, routeQuoteSecret, now.getTime());
    const estimate = await service.estimate('customer-1', { ...request, fareRouteToken });

    assert.equal(estimate.totalAmount, expectedTotal, `${distanceKm} km`);
    assert.equal(estimate.distanceKm, distanceKm);
    assert.equal(estimate.baseAmount, 30);
    assert.equal(estimate.estimatedDurationSeconds, 2_400);
    assert.equal(estimate.estimatedDurationMinutes, 40);
    assert.equal(estimate.timeAmount, 0);
    assert.equal(estimate.platformFeeAmount, 0);
    assert.equal(estimate.driverCommissionAmount, 0);
    assert.equal(estimate.isDevelopmentEstimate, false);
    assert.equal(estimate.roundingPolicy, 'NEAREST_PAISE_HALF_UP_FINAL_TOTAL');
    assert.equal(estimate.expiresAt, '2026-11-10T00:10:00.000Z');
  }
});

test('Auto fare rejects absent, non-finite, zero, and negative route distances', () => {
  for (const distance of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    assert.throws(
      () => calculateAutoFare(distance),
      (error: unknown) =>
        error instanceof AppError && error.statusCode === 400 && error.code === 'INVALID_ROUTE_DISTANCE',
    );
  }
});

test('switching signed ORS alternatives recalculates and persists the selected route fare', async () => {
  const { service, request, routeQuoteSecret, now } = createHarness();
  const quoteFor = (distanceMeters: number) => createFareRouteToken({
    customerId: 'customer-1',
    origin: { latitude: 17.4123, longitude: 78.4482 },
    destination: { latitude: 17.3616, longitude: 78.4747 },
    distanceMeters,
    durationSeconds: 2_400,
    profile: 'driving-car',
  }, routeQuoteSecret, now.getTime());
  const shortRoute = { ...request, fareRouteToken: quoteFor(5_000) };
  const longRoute = { ...request, fareRouteToken: quoteFor(10_000) };

  assert.equal((await service.estimate('customer-1', shortRoute)).totalAmount, 74.2);
  assert.equal((await service.estimate('customer-1', longRoute)).totalAmount, 129.2);
  const booking = await service.create('customer-1', longRoute, 'selected-route-0001');
  assert.equal(booking.fareEstimate.distanceMeters, 10_000);
  assert.equal(booking.fareEstimate.totalAmount, 129.2);
});

test('fare route quotes are customer-, endpoint-, profile-, and expiry-bound', async () => {
  const { service, request, routeQuoteSecret, now } = createHarness();

  await assert.rejects(
    service.estimate('customer-2', request),
    (error: unknown) => error instanceof AppError && error.code === 'FARE_ROUTE_QUOTE_INVALID',
  );
  await assert.rejects(
    service.estimate('customer-1', {
      ...request,
      pickup: { ...request.pickup, latitude: 17.4 },
    }),
    (error: unknown) => error instanceof AppError && error.code === 'FARE_ROUTE_QUOTE_INVALID',
  );

  const expiredToken = createFareRouteToken({
    customerId: 'customer-1',
    origin: { latitude: 17.4123, longitude: 78.4482 },
    destination: { latitude: 17.3616, longitude: 78.4747 },
    distanceMeters: 10_000,
    durationSeconds: 2_400,
    profile: 'driving-car',
  }, routeQuoteSecret, now.getTime() - FARE_ROUTE_QUOTE_TTL_MS - 1);
  await assert.rejects(
    service.estimate('customer-1', { ...request, fareRouteToken: expiredToken }),
    (error: unknown) => error instanceof AppError && error.code === 'FARE_ROUTE_QUOTE_EXPIRED',
  );
});

test('booking preserves selected pickup and destination coordinates', async () => {
  const { service, request } = createHarness();

  const booking = await service.create('customer-1', request, 'request-key-coords');

  assert.deepEqual(booking.pickup, request.pickup);
  assert.deepEqual(booking.dropoff, request.dropoff);
});

test('booking requests are idempotent for a customer and reject key reuse with a different request', async () => {
  const { repository, service, request } = createHarness();

  const first = await service.create('customer-1', request, 'request-key-0001');
  const retry = await service.create('customer-1', request, 'request-key-0001');
  assert.equal(first.id, retry.id);
  assert.equal(repository.createCount, 1);

  await assert.rejects(
    service.create(
      'customer-1',
      {
        ...request,
        dropoff: { ...request.dropoff, label: 'Airport', address: 'Shamshabad, Telangana' },
        fareRouteToken: 'different-request-route-token',
      },
      'request-key-0001',
    ),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 409 && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('booking reads are customer-scoped and pending bookings can be cancelled once', async () => {
  const { service, request } = createHarness();
  const booking = await service.create('customer-1', request, 'request-key-0002');

  assert.equal((await service.list('customer-2')).length, 0);
  await assert.rejects(
    service.get('customer-2', booking.id),
    (error: unknown) => error instanceof AppError && error.code === 'BOOKING_NOT_FOUND',
  );
  assert.equal((await service.cancel('customer-1', booking.id)).status, 'CANCELLED');
  await assert.rejects(
    service.cancel('customer-1', booking.id),
    (error: unknown) => error instanceof AppError && error.code === 'BOOKING_NOT_CANCELLABLE',
  );
});

test('unseeded or inactive service types cannot be estimated', async () => {
  const { repository, service, request } = createHarness();
  repository.serviceTypes.delete('AUTO');

  await assert.rejects(
    service.estimate('customer-1', request),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 400 && error.code === 'SERVICE_TYPE_UNAVAILABLE',
  );
});
