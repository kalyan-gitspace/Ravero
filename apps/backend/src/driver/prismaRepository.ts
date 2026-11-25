import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { prisma } from '../db/client.js';
import type {
  DriverCoordinates,
  DriverDocumentSummary,
  DriverEarnings,
  DriverNotification,
  DriverProfileRecord,
  DriverProfileUpdate,
  DriverRepository,
  DriverRideRecord,
  DriverRideRequest,
} from './types.js';

const profileInclude = {
  user: true,
  documents: { orderBy: { createdAt: 'desc' as const } },
  vehicles: {
    include: {
      vehicleCategory: true,
      documents: { orderBy: { createdAt: 'desc' as const } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const rideInclude = {
  pickupAddress: true,
  dropoffAddress: true,
  fareEstimate: true,
  paymentRecords: { orderBy: { createdAt: 'desc' as const } },
} as const;

const verifiedProfileInclude = {
  user: true,
  documents: true,
  vehicles: {
    include: { vehicleCategory: true, documents: true },
  },
} as const;

type DriverProfileWithRelations = Prisma.DriverProfileGetPayload<{
  include: typeof profileInclude;
}>;
type DriverProfileWithVerification = Prisma.DriverProfileGetPayload<{
  include: typeof verifiedProfileInclude;
}>;
type DriverBookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof rideInclude;
}>;

const activeRideStatuses = ['ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'];

function isDriverVerified(profile: DriverProfileWithVerification): boolean {
  return (
    profile.status === 'APPROVED' &&
    profile.user.status === 'ACTIVE' &&
    profile.user.isPhoneVerified &&
    Boolean(profile.driverLicenseNumber) &&
    profile.documents.some(
      (document) => document.documentType === 'DRIVING_LICENCE' && document.status === 'APPROVED',
    ) &&
    profile.vehicles.some(
      (vehicle) =>
        vehicle.status === 'ACTIVE' &&
        vehicle.vehicleCategory.slug === 'auto' &&
        vehicle.documents.some(
          (document) => document.documentType === 'RC' && document.status === 'APPROVED',
        ),
    )
  );
}

function mapDocument(document: {
  documentType: string;
  documentNumber: string | null;
  status: string;
  expiryDate: Date | null;
}): DriverDocumentSummary {
  return {
    type: document.documentType,
    documentNumber: document.documentNumber,
    status: document.status,
    expiryDate: document.expiryDate,
  };
}

function mapProfile(profile: DriverProfileWithRelations): DriverProfileRecord {
  const vehicle = profile.vehicles[0] ?? null;
  const firstName = profile.firstName ?? '';
  const lastName = profile.lastName ?? '';
  return {
    id: profile.id,
    userId: profile.userId,
    phone: profile.user.phone ?? '',
    fullName: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
    accountStatus: profile.user.status,
    isPhoneVerified: profile.user.isPhoneVerified,
    verificationStatus: profile.status,
    isAvailable: profile.isAvailable,
    currentLatitude: profile.currentLatitude === null ? null : Number(profile.currentLatitude),
    currentLongitude: profile.currentLongitude === null ? null : Number(profile.currentLongitude),
    locationUpdatedAt: profile.locationUpdatedAt,
    driverLicenseNumber: profile.driverLicenseNumber,
    documents: profile.documents.map(mapDocument),
    vehicle: vehicle
      ? {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plateNumber: vehicle.plateNumber,
          registrationNumber: vehicle.registrationNumber,
          categoryCode: vehicle.vehicleCategory.slug.toUpperCase(),
          status: vehicle.status,
          documents: vehicle.documents.map(mapDocument),
        }
      : null,
  };
}

function mapRide(booking: DriverBookingWithRelations): DriverRideRecord {
  if (!booking.fareEstimate) {
    throw new Error('Driver booking is missing its fare estimate.');
  }
  return {
    id: booking.id,
    status: booking.status,
    pickup: {
      label: booking.pickupAddress.label,
      address: booking.pickupAddress.addressLine,
    },
    dropoff: {
      label: booking.dropoffAddress?.label ?? '',
      address: booking.dropoffAddress?.addressLine ?? '',
    },
    distanceKm: Number(booking.fareEstimate.distanceMeters) / 1000,
    estimatedDurationMinutes: booking.fareEstimate.estimatedDurationSeconds / 60,
    estimatedFare: Number(booking.fareEstimate.totalAmount),
    paymentStatus: booking.paymentRecords[0]?.status ?? 'UNKNOWN',
    createdAt: booking.createdAt,
    completedAt: booking.completedAt,
  };
}

function distanceKm(first: DriverCoordinates, second: DriverCoordinates): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const haversine = Math.min(1,
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2,
  );
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getNotificationBookingId(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const bookingId = metadata.bookingId;
  return typeof bookingId === 'string' ? bookingId : null;
}

export class PrismaDriverRepository implements DriverRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async getProfile(userId: string): Promise<DriverProfileRecord | null> {
    const profile = await this.database.driverProfile.findUnique({
      where: { userId },
      include: profileInclude,
    });
    return profile ? mapProfile(profile) : null;
  }

  async updateProfile(userId: string, input: DriverProfileUpdate): Promise<DriverProfileRecord> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.driverProfile.findUnique({ where: { userId } });
      if (!current) {
        throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
      }

      const profileData: Prisma.DriverProfileUpdateInput = {};
      if (input.fullName !== undefined) {
        const [firstName, ...lastName] = input.fullName.trim().split(/\s+/);
        profileData.firstName = firstName;
        profileData.lastName = lastName.length ? lastName.join(' ') : null;
      }
      if (input.driverLicenseNumber !== undefined) {
        profileData.driverLicenseNumber = input.driverLicenseNumber;
      }
      if (Object.keys(profileData).length > 0) {
        await transaction.driverProfile.update({ where: { userId }, data: profileData });
      }

      if (input.driverLicenseNumber !== undefined) {
        const existingDocument = await transaction.driverDocument.findFirst({
          where: { driverProfileId: current.id, documentType: 'DRIVING_LICENCE' },
        });
        if (existingDocument) {
          await transaction.driverDocument.update({
            where: { id: existingDocument.id },
            data: {
              documentNumber: input.driverLicenseNumber,
              status: 'PENDING',
              fileUrl: null,
            },
          });
        } else {
          await transaction.driverDocument.create({
            data: {
              driverProfileId: current.id,
              documentType: 'DRIVING_LICENCE',
              documentNumber: input.driverLicenseNumber,
              status: 'PENDING',
            },
          });
        }
      }

      if (input.vehicle) {
        const autoService = await transaction.serviceType.findUnique({
          where: { code: 'AUTO' },
          include: { vehicleCategory: true },
        });
        if (!autoService?.vehicleCategory?.active) {
          throw new AppError(400, 'VEHICLE_CATEGORY_UNAVAILABLE', 'The Auto vehicle category is not configured.');
        }
        const vehicle = await transaction.vehicle.findFirst({
          where: { driverProfileId: current.id, vehicleCategoryId: autoService.vehicleCategoryId! },
          orderBy: { createdAt: 'desc' },
        });
        const vehicleData = {
          make: input.vehicle.make,
          model: input.vehicle.model,
          year: input.vehicle.year,
          color: input.vehicle.color,
          plateNumber: input.vehicle.plateNumber,
          registrationNumber: input.vehicle.registrationNumber,
          vehicleCategoryId: autoService.vehicleCategoryId!,
          status: 'PENDING',
        };
        const savedVehicle = vehicle
          ? await transaction.vehicle.update({
              where: { id: vehicle.id },
              data: vehicleData,
            })
          : await transaction.vehicle.create({
              data: { ...vehicleData, driverProfileId: current.id },
            });
        const existingRc = await transaction.vehicleDocument.findFirst({
          where: { vehicleId: savedVehicle.id, documentType: 'RC' },
        });
        if (existingRc) {
          await transaction.vehicleDocument.update({
            where: { id: existingRc.id },
            data: {
              documentNumber: input.vehicle.registrationNumber,
              status: 'PENDING',
              fileUrl: null,
            },
          });
        } else {
          await transaction.vehicleDocument.create({
            data: {
              vehicleId: savedVehicle.id,
              documentType: 'RC',
              documentNumber: input.vehicle.registrationNumber,
              status: 'PENDING',
            },
          });
        }
      }

      if (input.driverLicenseNumber !== undefined || input.vehicle !== undefined) {
        await transaction.driverProfile.update({
          where: { userId },
          data: {
            status: 'PENDING',
            isAvailable: false,
            currentLatitude: null,
            currentLongitude: null,
            locationUpdatedAt: null,
          },
        });
      }

      const updated = await transaction.driverProfile.findUnique({
        where: { userId },
        include: profileInclude,
      });
      if (!updated) throw new Error('Driver profile disappeared during update.');
      return mapProfile(updated);
    });
  }

  async setAvailability(
    userId: string,
    isAvailable: boolean,
    coordinates: DriverCoordinates | null,
    now: Date,
  ): Promise<DriverProfileRecord> {
    if (isAvailable) {
      const profile = await this.database.driverProfile.findUnique({
        where: { userId },
        include: verifiedProfileInclude,
      });
      if (!profile) {
        throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
      }
      if (!isDriverVerified(profile)) {
        throw new AppError(
          403,
          'DRIVER_VERIFICATION_REQUIRED',
          'Driver, licence, and Auto vehicle verification must be approved before going online.',
        );
      }
      if (!coordinates) {
        throw new AppError(400, 'DRIVER_LOCATION_REQUIRED', 'A current location is required to go online.');
      }
    }

    await this.database.driverProfile.update({
      where: { userId },
      data: isAvailable
        ? {
            isAvailable: true,
            currentLatitude: coordinates!.latitude,
            currentLongitude: coordinates!.longitude,
            locationUpdatedAt: now,
          }
        : {
            isAvailable: false,
            currentLatitude: null,
            currentLongitude: null,
            locationUpdatedAt: null,
          },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
      }
      throw error;
    });
    const updated = await this.getProfile(userId);
    if (!updated) throw new Error('Driver profile disappeared during availability update.');
    return updated;
  }

  async updateLocation(userId: string, coordinates: DriverCoordinates, now: Date): Promise<void> {
    const result = await this.database.driverProfile.updateMany({
      where: { userId, isAvailable: true },
      data: {
        currentLatitude: coordinates.latitude,
        currentLongitude: coordinates.longitude,
        locationUpdatedAt: now,
      },
    });
    if (result.count > 0) return;
    const profileExists = await this.database.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profileExists) {
      throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
    }
    throw new AppError(409, 'DRIVER_NOT_ONLINE', 'Location updates are accepted only while the driver is online.');
  }

  async listRequests(
    userId: string,
    now: Date,
    radiusKm: number,
    freshnessMs: number,
    offerExpiryMs: number,
  ): Promise<DriverRideRequest[]> {
    const profile = await this.database.driverProfile.findUnique({
      where: { userId },
      include: verifiedProfileInclude,
    });
    if (!profile) {
      throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile was not found.');
    }
    if (!profile.isAvailable) {
      throw new AppError(409, 'DRIVER_NOT_ONLINE', 'Go online to receive ride requests.');
    }
    if (
      !isDriverVerified(profile) ||
      profile.currentLatitude === null ||
      profile.currentLongitude === null ||
      !profile.locationUpdatedAt ||
      now.getTime() - profile.locationUpdatedAt.getTime() > freshnessMs
    ) {
      throw new AppError(409, 'DRIVER_LOCATION_STALE', 'A fresh driver location is required to receive ride requests.');
    }

    const activeRide = await this.database.booking.findFirst({
      where: { driverId: userId, status: { in: activeRideStatuses } },
      select: { id: true },
    });
    if (activeRide) return [];

    const candidates = await this.database.booking.findMany({
      where: {
        status: 'REQUESTED',
        driverId: null,
        serviceType: { code: 'AUTO', active: true },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        fareEstimate: { is: { distanceMeters: { gt: 0 } } },
      },
      include: {
        pickupAddress: true,
        dropoffAddress: true,
        fareEstimate: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const driverCoordinates = {
      latitude: Number(profile.currentLatitude),
      longitude: Number(profile.currentLongitude),
    };
    const offers: DriverRideRequest[] = [];
    for (const booking of candidates) {
      if (
        booking.pickupAddress.latitude === null ||
        booking.pickupAddress.longitude === null ||
        !booking.dropoffAddress ||
        booking.dropoffAddress.latitude === null ||
        booking.dropoffAddress.longitude === null ||
        !booking.fareEstimate
      ) {
        continue;
      }
      const pickup = {
        latitude: Number(booking.pickupAddress.latitude),
        longitude: Number(booking.pickupAddress.longitude),
      };
      if (distanceKm(driverCoordinates, pickup) > radiusKm) continue;

      const assignment = await this.offerToDriver(booking.id, userId, now, offerExpiryMs);
      if (!assignment) continue;
      offers.push({
        id: booking.id,
        pickup: {
          label: booking.pickupAddress.label,
          address: booking.pickupAddress.addressLine,
          ...pickup,
        },
        dropoff: {
          label: booking.dropoffAddress.label,
          address: booking.dropoffAddress.addressLine,
          latitude: Number(booking.dropoffAddress.latitude),
          longitude: Number(booking.dropoffAddress.longitude),
        },
        distanceMeters: Number(booking.fareEstimate.distanceMeters),
        distanceKm: Number(booking.fareEstimate.distanceMeters) / 1000,
        estimatedDurationSeconds: booking.fareEstimate.estimatedDurationSeconds,
        estimatedDurationMinutes: booking.fareEstimate.estimatedDurationSeconds / 60,
        estimatedFare: Number(booking.fareEstimate.totalAmount),
        currency: 'INR',
        createdAt: booking.createdAt,
        expiresAt: new Date(assignment.assignedAt.getTime() + offerExpiryMs),
      });
    }
    return offers;
  }

  private async offerToDriver(
    bookingId: string,
    driverId: string,
    now: Date,
    offerExpiryMs: number,
  ): Promise<{ assignedAt: Date } | null> {
    return this.database.$transaction(async (transaction) => {
      const lockKey = `${bookingId}:${driverId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const requested = await transaction.booking.findFirst({
        where: { id: bookingId, status: 'REQUESTED', driverId: null },
        select: { id: true },
      });
      if (!requested) return null;

      const existing = await transaction.bookingAssignment.findFirst({
        where: { bookingId, driverId },
        orderBy: { assignedAt: 'desc' },
      });
      if (existing) {
        if (existing.status !== 'ASSIGNED') return null;
        if (existing.assignedAt.getTime() + offerExpiryMs > now.getTime()) {
          return { assignedAt: existing.assignedAt };
        }
        await transaction.bookingAssignment.update({
          where: { id: existing.id },
          data: { status: 'EXPIRED' },
        });
        return null;
      }

      const assignment = await transaction.bookingAssignment.create({
        data: { bookingId, driverId, status: 'ASSIGNED', assignedAt: now },
      });
      await transaction.notification.create({
        data: {
          userId: driverId,
          title: 'New Auto ride request',
          body: 'A nearby passenger ride request is available.',
          type: 'BOOKING',
          metadata: { bookingId },
        },
      });
      return { assignedAt: assignment.assignedAt };
    });
  }

  async acceptRequest(
    userId: string,
    bookingId: string,
    now: Date,
    radiusKm: number,
    freshnessMs: number,
    offerExpiryMs: number,
  ): Promise<DriverRideRecord> {
    return this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
      const existingBooking = await transaction.booking.findFirst({
        where: { id: bookingId, driverId: userId },
        include: rideInclude,
      });
      if (existingBooking && existingBooking.status !== 'REQUESTED') {
        return mapRide(existingBooking);
      }

      const activeRide = await transaction.booking.findFirst({
        where: { driverId: userId, status: { in: activeRideStatuses } },
        select: { id: true },
      });
      if (activeRide) {
        throw new AppError(409, 'DRIVER_HAS_ACTIVE_RIDE', 'Complete or cancel the current ride before accepting another.');
      }

      const profile = await transaction.driverProfile.findUnique({
        where: { userId },
        include: verifiedProfileInclude,
      });
      if (
        !profile ||
        !profile.isAvailable ||
        !isDriverVerified(profile) ||
        profile.currentLatitude === null ||
        profile.currentLongitude === null ||
        !profile.locationUpdatedAt ||
        now.getTime() - profile.locationUpdatedAt.getTime() > freshnessMs
      ) {
        throw new AppError(409, 'DRIVER_LOCATION_STALE', 'A verified online driver with a fresh location is required.');
      }

      const booking = await transaction.booking.findFirst({
        where: { id: bookingId, status: 'REQUESTED', driverId: null },
        include: rideInclude,
      });
      if (!booking) {
        throw new AppError(409, 'RIDE_REQUEST_UNAVAILABLE', 'This ride request has already been accepted or cancelled.');
      }
      if (
        booking.pickupAddress.latitude === null ||
        booking.pickupAddress.longitude === null
      ) {
        throw new AppError(409, 'RIDE_REQUEST_LOCATION_UNAVAILABLE', 'The ride pickup location is unavailable.');
      }
      const distanceFromPickup = distanceKm(
        {
          latitude: Number(profile.currentLatitude),
          longitude: Number(profile.currentLongitude),
        },
        {
          latitude: Number(booking.pickupAddress.latitude),
          longitude: Number(booking.pickupAddress.longitude),
        },
      );
      if (distanceFromPickup > radiusKm) {
        throw new AppError(409, 'RIDE_REQUEST_OUT_OF_RANGE', 'The ride request is no longer within your service radius.');
      }

      const assignmentCutoff = new Date(now.getTime() - offerExpiryMs);
      const assignment = await transaction.bookingAssignment.findFirst({
        where: {
          bookingId,
          driverId: userId,
          status: 'ASSIGNED',
          assignedAt: { gt: assignmentCutoff },
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (!assignment) {
        throw new AppError(409, 'RIDE_REQUEST_EXPIRED', 'This ride offer has expired.');
      }

      const acceptedOffer = await transaction.bookingAssignment.updateMany({
        where: {
          id: assignment.id,
          status: 'ASSIGNED',
          assignedAt: { gt: assignmentCutoff },
        },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (acceptedOffer.count !== 1) {
        throw new AppError(409, 'RIDE_REQUEST_EXPIRED', 'This ride offer has expired.');
      }
      const acceptedBooking = await transaction.booking.updateMany({
        where: { id: bookingId, status: 'REQUESTED', driverId: null },
        data: { status: 'ACCEPTED', driverId: userId },
      });
      if (acceptedBooking.count !== 1) {
        throw new AppError(409, 'RIDE_REQUEST_UNAVAILABLE', 'Another driver has accepted this ride.');
      }
      await transaction.bookingStatusHistory.create({
        data: { bookingId, status: 'ACCEPTED', note: 'Driver accepted the ride request.' },
      });
      await transaction.notification.create({
        data: {
          userId: booking.customerId,
          title: 'Driver accepted your ride',
          body: 'A driver has accepted your RAVERO ride request.',
          type: 'BOOKING',
          metadata: { bookingId },
        },
      });
      const updated = await transaction.booking.findFirst({
        where: { id: bookingId, driverId: userId },
        include: rideInclude,
      });
      if (!updated) throw new Error('Accepted booking disappeared during transaction.');
      return mapRide(updated);
    });
  }

  async rejectRequest(
    userId: string,
    bookingId: string,
    now: Date,
    offerExpiryMs: number,
  ): Promise<void> {
    const result = await this.database.bookingAssignment.updateMany({
      where: {
        bookingId,
        driverId: userId,
        status: 'ASSIGNED',
        assignedAt: { gt: new Date(now.getTime() - offerExpiryMs) },
        booking: { status: 'REQUESTED', driverId: null },
      },
      data: { status: 'REJECTED', rejectedAt: now },
    });
    if (result.count > 0) return;
    const existing = await this.database.bookingAssignment.findFirst({
      where: { bookingId, driverId: userId },
      orderBy: { assignedAt: 'desc' },
      select: { status: true },
    });
    if (existing?.status === 'REJECTED') return;
    throw new AppError(409, 'RIDE_REQUEST_EXPIRED', 'This ride offer has expired or is no longer available.');
  }

  async updateRideStatus(
    userId: string,
    bookingId: string,
    status: string,
    allowedFrom: string[],
    now: Date,
  ): Promise<DriverRideRecord> {
    return this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
      const booking = await transaction.booking.findFirst({
        where: { id: bookingId, driverId: userId },
        include: rideInclude,
      });
      if (!booking) {
        throw new AppError(404, 'DRIVER_RIDE_NOT_FOUND', 'Ride was not found for this driver.');
      }
      if (booking.status === status) return mapRide(booking);
      if (!allowedFrom.includes(booking.status)) {
        throw new AppError(409, 'RIDE_STATUS_TRANSITION_INVALID', 'The ride cannot move to the requested status.');
      }

      const update = await transaction.booking.updateMany({
        where: { id: bookingId, driverId: userId, status: booking.status },
        data: {
          status,
          ...(status === 'TRIP_STARTED' ? { startedAt: now } : {}),
          ...(status === 'TRIP_COMPLETED' ? { completedAt: now } : {}),
        },
      });
      if (update.count !== 1) {
        throw new AppError(409, 'RIDE_STATUS_TRANSITION_INVALID', 'The ride status changed before this update completed.');
      }

      await transaction.bookingStatusHistory.create({
        data: { bookingId, status, note: `Driver updated ride status to ${status}.` },
      });
      if (status === 'TRIP_COMPLETED') {
        const payment = await transaction.paymentRecord.updateMany({
          where: { bookingId, paymentMode: 'CASH', status: 'PENDING' },
          data: { status: 'COLLECTED', driverId: userId, capturedAt: now },
        });
        if (payment.count !== 1) {
          throw new Error('Completed cash ride is missing its pending payment record.');
        }
        await transaction.driverProfile.update({
          where: { userId },
          data: { totalTrips: { increment: 1 } },
        });
      } else if (status === 'CANCELLED') {
        await transaction.paymentRecord.updateMany({
          where: { bookingId, status: 'PENDING' },
          data: { status: 'VOIDED' },
        });
        await transaction.bookingAssignment.updateMany({
          where: { bookingId, status: 'ASSIGNED' },
          data: { status: 'EXPIRED' },
        });
      }

      await transaction.notification.create({
        data: {
          userId: booking.customerId,
          title: status === 'TRIP_COMPLETED' ? 'Ride completed' : 'Ride status updated',
          body: `Your RAVERO ride status is now ${status.toLowerCase().replaceAll('_', ' ')}.`,
          type: 'BOOKING',
          metadata: { bookingId },
        },
      });
      const updated = await transaction.booking.findFirst({
        where: { id: bookingId, driverId: userId },
        include: rideInclude,
      });
      if (!updated) throw new Error('Updated driver ride disappeared during transaction.');
      return mapRide(updated);
    });
  }

  async listRides(userId: string): Promise<DriverRideRecord[]> {
    const bookings = await this.database.booking.findMany({
      where: { driverId: userId },
      include: rideInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return bookings.map(mapRide);
  }

  async getEarnings(userId: string, now: Date): Promise<DriverEarnings> {
    const indiaTime = new Date(now.getTime() + 330 * 60 * 1000);
    const dayStartsAt = new Date(
      Date.UTC(indiaTime.getUTCFullYear(), indiaTime.getUTCMonth(), indiaTime.getUTCDate()) -
        330 * 60 * 1000,
    );
    const bookings = await this.database.booking.findMany({
      where: { driverId: userId, status: 'TRIP_COMPLETED' },
      include: {
        fareEstimate: true,
        paymentRecords: {
          where: { paymentMode: 'CASH', status: 'COLLECTED' },
        },
      },
      orderBy: { completedAt: 'desc' },
    });
    const completed = bookings.filter((booking) => booking.fareEstimate);
    return {
      completedRideCount: completed.length,
      todayRideCount: completed.filter(
        (booking) => booking.completedAt !== null && booking.completedAt >= dayStartsAt,
      ).length,
      totalEarnings: completed.reduce(
        (sum, booking) => sum + Number(booking.fareEstimate!.totalAmount),
        0,
      ),
      cashCollected: completed.reduce(
        (sum, booking) =>
          sum + booking.paymentRecords.reduce((amount, payment) => amount + Number(payment.amount), 0),
        0,
      ),
      driverCommission: 0,
      platformFee: 0,
      currency: 'INR',
      dayStartsAt,
    };
  }

  async getNotifications(userId: string): Promise<DriverNotification[]> {
    const notifications = await this.database.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      isRead: notification.isRead,
      bookingId: getNotificationBookingId(notification.metadata),
      createdAt: notification.createdAt,
    }));
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.database.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return result.count === 1;
  }
}
