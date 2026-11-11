import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AppError } from '../src/errors/AppError.js';
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
    if (!entry || entry.record.status !== 'PENDING') return null;
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
      status: 'PENDING',
      serviceType: { code: serviceType.code, name: serviceType.name },
      pickup: request.pickup,
      dropoff: request.dropoff,
      stops: request.stops,
      scheduledAt: request.scheduledAt ?? null,
      fareEstimate,
      paymentMode: 'CASH',
      createdAt: now,
      updatedAt: now,
    };
  }
}

function createHarness() {
  const repository = new InMemoryBookingRepository();
  const service = new CustomerBookingService(repository, {
    developmentBaseFare: 120,
    now: () => new Date('2026-11-10T00:00:00.000Z'),
  });
  const request: CreateBookingInput = {
    serviceTypeCode: 'AUTO',
    pickup: { label: 'Home', address: 'Banjara Hills, Hyderabad' },
    dropoff: { label: 'Charminar', address: 'Old City, Hyderabad' },
    stops: [],
  };
  return { repository, service, request };
}

test('fare estimate is explicitly development-only and does not invent route distance or duration', async () => {
  const { service, request } = createHarness();

  const estimate = await service.estimate(request);

  assert.deepEqual(estimate, {
    currency: 'INR',
    baseAmount: 120,
    distanceAmount: 0,
    timeAmount: 0,
    totalAmount: 120,
    isDevelopmentEstimate: true,
    expiresAt: '2026-11-10T00:10:00.000Z',
  });
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
      { ...request, dropoff: { label: 'Airport', address: 'Shamshabad, Telangana' } },
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
    service.estimate(request),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 400 && error.code === 'SERVICE_TYPE_UNAVAILABLE',
  );
});
