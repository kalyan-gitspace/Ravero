import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../src/errors/AppError.js';
import {
  DRIVER_LOCATION_FRESHNESS_MS,
  DRIVER_MATCHING_RADIUS_KM,
  DRIVER_OFFER_EXPIRY_MS,
  DriverService,
} from '../src/driver/service.js';
import type {
  DriverCoordinates,
  DriverEarnings,
  DriverNotification,
  DriverProfileRecord,
  DriverProfileUpdate,
  DriverRepository,
  DriverRideRecord,
  DriverRideRequest,
} from '../src/driver/types.js';

class FakeDriverRepository implements DriverRepository {
  calls: { method: string; args: unknown[] }[] = [];
  notificationExists = true;

  async getProfile(_userId: string): Promise<DriverProfileRecord | null> {
    this.calls.push({ method: 'getProfile', args: [_userId] });
    return null;
  }
  async updateProfile(userId: string, input: DriverProfileUpdate): Promise<DriverProfileRecord> {
    this.calls.push({ method: 'updateProfile', args: [userId, input] });
    throw new Error('not used');
  }
  async setAvailability(
    userId: string,
    isAvailable: boolean,
    coordinates: DriverCoordinates | null,
    now: Date,
  ): Promise<DriverProfileRecord> {
    this.calls.push({ method: 'setAvailability', args: [userId, isAvailable, coordinates, now] });
    throw new Error('not used');
  }
  async updateLocation(userId: string, coordinates: DriverCoordinates, now: Date): Promise<void> {
    this.calls.push({ method: 'updateLocation', args: [userId, coordinates, now] });
  }
  async listRequests(
    ...args: [string, Date, number, number, number]
  ): Promise<DriverRideRequest[]> {
    this.calls.push({ method: 'listRequests', args });
    return [];
  }
  async acceptRequest(
    ...args: [string, string, Date, number, number, number]
  ): Promise<DriverRideRecord> {
    this.calls.push({ method: 'acceptRequest', args });
    return {
      id: args[1],
      status: 'ACCEPTED',
      pickup: { label: 'Pickup', address: 'Pickup address' },
      dropoff: { label: 'Dropoff', address: 'Dropoff address' },
      distanceKm: 1,
      estimatedDurationMinutes: 5,
      estimatedFare: 30,
      paymentStatus: 'PENDING',
      createdAt: args[2],
      completedAt: null,
    };
  }
  async rejectRequest(
    ...args: [string, string, Date, number]
  ): Promise<void> {
    this.calls.push({ method: 'rejectRequest', args });
  }
  async updateRideStatus(
    ...args: [string, string, string, string[], Date]
  ): Promise<DriverRideRecord> {
    this.calls.push({ method: 'updateRideStatus', args });
    throw new Error('not used');
  }
  async listRides(userId: string): Promise<DriverRideRecord[]> {
    this.calls.push({ method: 'listRides', args: [userId] });
    return [];
  }
  async getEarnings(userId: string, now: Date): Promise<DriverEarnings> {
    this.calls.push({ method: 'getEarnings', args: [userId, now] });
    throw new Error('not used');
  }
  async getNotifications(userId: string): Promise<DriverNotification[]> {
    this.calls.push({ method: 'getNotifications', args: [userId] });
    return [];
  }
  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    this.calls.push({ method: 'markNotificationRead', args: [userId, notificationId] });
    return this.notificationExists;
  }
}

test('driver cannot go online without valid location coordinates', async () => {
  const repository = new FakeDriverRepository();
  const service = new DriverService(repository);

  assert.throws(
    () => service.setAvailability('driver-1', true, null),
    (error: unknown) => error instanceof AppError && error.code === 'DRIVER_LOCATION_REQUIRED',
  );
  assert.throws(
    () => service.setAvailability('driver-1', true, { latitude: 91, longitude: 78 }),
    (error: unknown) => error instanceof AppError && error.code === 'DRIVER_LOCATION_REQUIRED',
  );
  assert.equal(repository.calls.length, 0);
});

test('ride matching uses the agreed radius, freshness, and offer expiry', async () => {
  const repository = new FakeDriverRepository();
  const now = new Date('2026-03-01T10:00:00.000Z');
  const service = new DriverService(repository, () => now);

  await service.listRequests('driver-1');
  await service.acceptRequest('driver-1', 'booking-1');

  assert.deepEqual(repository.calls[0], {
    method: 'listRequests',
    args: [
      'driver-1',
      now,
      DRIVER_MATCHING_RADIUS_KM,
      DRIVER_LOCATION_FRESHNESS_MS,
      DRIVER_OFFER_EXPIRY_MS,
    ],
  });
  assert.deepEqual(repository.calls[1], {
    method: 'acceptRequest',
    args: [
      'driver-1',
      'booking-1',
      now,
      DRIVER_MATCHING_RADIUS_KM,
      DRIVER_LOCATION_FRESHNESS_MS,
      DRIVER_OFFER_EXPIRY_MS,
    ],
  });
});

test('ride transitions reject unsupported states before persistence', async () => {
  const repository = new FakeDriverRepository();
  const service = new DriverService(repository);

  assert.throws(
    () => service.updateRideStatus('driver-1', 'booking-1', 'ACCEPTED'),
    (error: unknown) => error instanceof AppError && error.code === 'RIDE_STATUS_INVALID',
  );
  assert.equal(repository.calls.length, 0);
});

test('notification read updates are scoped and report missing notifications', async () => {
  const repository = new FakeDriverRepository();
  const service = new DriverService(repository);

  await service.markNotificationRead('driver-1', 'notification-1');
  repository.notificationExists = false;
  await assert.rejects(
    service.markNotificationRead('driver-1', 'notification-2'),
    (error: unknown) => error instanceof AppError && error.code === 'NOTIFICATION_NOT_FOUND',
  );
});
