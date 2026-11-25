import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeRideStatuses,
  canCancelRide,
  getNextRideStatus,
} from '../src/driver/rideLifecycle.ts';

test('driver lifecycle advances through validated ride states', () => {
  assert.equal(getNextRideStatus('ACCEPTED'), 'DRIVER_ARRIVING');
  assert.equal(getNextRideStatus('DRIVER_ARRIVING'), 'DRIVER_ARRIVED');
  assert.equal(getNextRideStatus('DRIVER_ARRIVED'), 'TRIP_STARTED');
  assert.equal(getNextRideStatus('TRIP_STARTED'), 'TRIP_COMPLETED');
});

test('completed and cancelled rides are terminal and cannot be cancelled again', () => {
  assert.equal(getNextRideStatus('TRIP_COMPLETED'), null);
  assert.equal(getNextRideStatus('CANCELLED'), null);
  assert.equal(canCancelRide('TRIP_STARTED'), false);
  assert.equal(canCancelRide('CANCELLED'), false);
});

test('only assigned active rides appear in the active set', () => {
  assert.equal(activeRideStatuses.has('ACCEPTED'), true);
  assert.equal(activeRideStatuses.has('TRIP_STARTED'), true);
  assert.equal(activeRideStatuses.has('REQUESTED'), false);
  assert.equal(activeRideStatuses.has('TRIP_COMPLETED'), false);
});
