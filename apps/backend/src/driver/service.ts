import { AppError } from '../errors/AppError.js';
import type {
  DriverCoordinates,
  DriverEarnings,
  DriverNotification,
  DriverProfileRecord,
  DriverProfileUpdate,
  DriverRepository,
  DriverRideRecord,
  DriverRideRequest,
} from './types.js';

export const DRIVER_MATCHING_RADIUS_KM = 5;
export const DRIVER_LOCATION_FRESHNESS_MS = 30 * 1000;
export const DRIVER_OFFER_EXPIRY_MS = 30 * 1000;

const allowedTransitions: Record<string, string[]> = {
  DRIVER_ARRIVING: ['ACCEPTED'],
  DRIVER_ARRIVED: ['DRIVER_ARRIVING'],
  TRIP_STARTED: ['DRIVER_ARRIVED'],
  TRIP_COMPLETED: ['TRIP_STARTED'],
  CANCELLED: ['ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED'],
};

export class DriverService {
  constructor(
    private readonly repository: DriverRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getProfile(userId: string): Promise<DriverProfileRecord> {
    const profile = await this.repository.getProfile(userId);
    if (!profile) {
      throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
    }
    return profile;
  }

  updateProfile(userId: string, input: DriverProfileUpdate): Promise<DriverProfileRecord> {
    return this.repository.updateProfile(userId, input);
  }

  setAvailability(
    userId: string,
    isAvailable: boolean,
    coordinates: DriverCoordinates | null,
  ): Promise<DriverProfileRecord> {
    if (
      isAvailable &&
      (!coordinates ||
        !Number.isFinite(coordinates.latitude) ||
        coordinates.latitude < -90 ||
        coordinates.latitude > 90 ||
        !Number.isFinite(coordinates.longitude) ||
        coordinates.longitude < -180 ||
        coordinates.longitude > 180)
    ) {
      throw new AppError(400, 'DRIVER_LOCATION_REQUIRED', 'A valid current location is required to go online.');
    }
    return this.repository.setAvailability(userId, isAvailable, coordinates, this.now());
  }

  updateLocation(userId: string, coordinates: DriverCoordinates): Promise<void> {
    if (
      !Number.isFinite(coordinates.latitude) ||
      coordinates.latitude < -90 ||
      coordinates.latitude > 90 ||
      !Number.isFinite(coordinates.longitude) ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180
    ) {
      throw new AppError(400, 'DRIVER_LOCATION_INVALID', 'The location coordinates are invalid.');
    }
    return this.repository.updateLocation(userId, coordinates, this.now());
  }

  listRequests(userId: string): Promise<DriverRideRequest[]> {
    return this.repository.listRequests(
      userId,
      this.now(),
      DRIVER_MATCHING_RADIUS_KM,
      DRIVER_LOCATION_FRESHNESS_MS,
      DRIVER_OFFER_EXPIRY_MS,
    );
  }

  acceptRequest(userId: string, bookingId: string): Promise<DriverRideRecord> {
    return this.repository.acceptRequest(
      userId,
      bookingId,
      this.now(),
      DRIVER_MATCHING_RADIUS_KM,
      DRIVER_LOCATION_FRESHNESS_MS,
      DRIVER_OFFER_EXPIRY_MS,
    );
  }

  rejectRequest(userId: string, bookingId: string): Promise<void> {
    return this.repository.rejectRequest(userId, bookingId, this.now(), DRIVER_OFFER_EXPIRY_MS);
  }

  updateRideStatus(userId: string, bookingId: string, status: string): Promise<DriverRideRecord> {
    const allowedFrom = allowedTransitions[status];
    if (!allowedFrom) {
      throw new AppError(400, 'RIDE_STATUS_INVALID', 'The requested ride status is not supported.');
    }
    return this.repository.updateRideStatus(userId, bookingId, status, allowedFrom, this.now());
  }

  listRides(userId: string): Promise<DriverRideRecord[]> {
    return this.repository.listRides(userId);
  }

  getEarnings(userId: string): Promise<DriverEarnings> {
    return this.repository.getEarnings(userId, this.now());
  }

  getNotifications(userId: string): Promise<DriverNotification[]> {
    return this.repository.getNotifications(userId);
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    const updated = await this.repository.markNotificationRead(userId, notificationId);
    if (!updated) {
      throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found.');
    }
  }
}
