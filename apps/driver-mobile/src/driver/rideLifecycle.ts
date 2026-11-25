export type DriverRideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'CANCELLED';

const nextRideStatus: Record<string, DriverRideStatus | undefined> = {
  ACCEPTED: 'DRIVER_ARRIVING',
  DRIVER_ARRIVING: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED: 'TRIP_STARTED',
  TRIP_STARTED: 'TRIP_COMPLETED',
};

const cancelableRideStatuses = new Set<string>([
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
]);

export const activeRideStatuses = new Set<string>([
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
]);

export function getNextRideStatus(status: string): DriverRideStatus | null {
  return nextRideStatus[status] ?? null;
}

export function canCancelRide(status: string): boolean {
  return cancelableRideStatuses.has(status);
}
