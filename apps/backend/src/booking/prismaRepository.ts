import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { AppError } from '../errors/AppError.js';
import type {
  BookingRecord,
  BookingRepository,
  CreateBookingRecordInput,
  ServiceTypeRecord,
} from './types.js';

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    serviceType: true;
    pickupAddress: true;
    dropoffAddress: true;
    stops: { orderBy: { sequence: 'asc' } };
    fareEstimate: true;
  };
}>;

function toBookingRecord(booking: BookingWithRelations): BookingRecord {
  if (!booking.fareEstimate) {
    throw new Error('Booking is missing its fare estimate.');
  }

  return {
    id: booking.id,
    status: booking.status,
    serviceType: { code: booking.serviceType.code, name: booking.serviceType.name },
    pickup: { label: booking.pickupAddress.label, address: booking.pickupAddress.addressLine },
    dropoff: {
      label: booking.dropoffAddress?.label ?? '',
      address: booking.dropoffAddress?.addressLine ?? '',
    },
    stops: booking.stops.map((stop) => ({ label: stop.label, address: stop.address })),
    scheduledAt: booking.scheduledAt,
    fareEstimate: {
      currency: 'INR',
      baseAmount: Number(booking.fareEstimate.baseFare),
      distanceAmount: Number(booking.fareEstimate.distanceFare),
      timeAmount: Number(booking.fareEstimate.timeFare),
      totalAmount: Number(booking.fareEstimate.totalAmount),
      isDevelopmentEstimate: true,
      expiresAt: (booking.fareEstimate.expiresAt ?? booking.fareEstimate.createdAt).toISOString(),
    },
    paymentMode: 'CASH',
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

const bookingIncludes = {
  serviceType: true,
  pickupAddress: true,
  dropoffAddress: true,
  stops: { orderBy: { sequence: 'asc' as const } },
  fareEstimate: true,
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaBookingRepository implements BookingRepository {
  async getActiveServiceType(code: string): Promise<ServiceTypeRecord | null> {
    return prisma.serviceType.findFirst({
      where: { code, active: true },
      select: { id: true, code: true, name: true },
    });
  }

  async createBooking(data: CreateBookingRecordInput): Promise<BookingRecord> {
    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.booking.findUnique({
          where: {
            customerId_idempotencyKey: {
              customerId: data.customerId,
              idempotencyKey: data.idempotencyKey,
            },
          },
          include: bookingIncludes,
        });
        if (existing) {
          if (existing.requestHash !== data.requestHash) {
            throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different booking.');
          }
          return toBookingRecord(existing);
        }

        const pickup = await transaction.savedAddress.create({
          data: {
            userId: data.customerId,
            label: 'Booking pickup',
            addressLine: data.request.pickup.address,
            city: 'Not specified',
            state: 'Not specified',
          },
        });
        const dropoff = await transaction.savedAddress.create({
          data: {
            userId: data.customerId,
            label: 'Booking drop-off',
            addressLine: data.request.dropoff.address,
            city: 'Not specified',
            state: 'Not specified',
          },
        });
        const booking = await transaction.booking.create({
          data: {
            customerId: data.customerId,
            serviceTypeId: data.serviceType.id,
            pickupAddressId: pickup.id,
            dropoffAddressId: dropoff.id,
            idempotencyKey: data.idempotencyKey,
            requestHash: data.requestHash,
            status: 'PENDING',
            scheduledAt: data.request.scheduledAt,
            stops: {
              create: data.request.stops.map((stop, index) => ({
                sequence: index + 1,
                label: stop.label,
                address: stop.address,
              })),
            },
            fareEstimate: {
              create: {
                baseFare: data.fareEstimate.baseAmount,
                distanceFare: data.fareEstimate.distanceAmount,
                timeFare: data.fareEstimate.timeAmount,
                totalAmount: data.fareEstimate.totalAmount,
                currency: data.fareEstimate.currency,
                expiresAt: new Date(data.fareEstimate.expiresAt),
                breakdowns: {
                  create: [
                    { label: 'Development base fare', amount: data.fareEstimate.baseAmount, type: 'BASE' },
                    { label: 'Distance (not calculated)', amount: 0, type: 'DISTANCE' },
                    { label: 'Duration (not calculated)', amount: 0, type: 'TIME' },
                  ],
                },
              },
            },
            history: {
              create: { status: 'PENDING', note: 'Customer booking request created.' },
            },
            paymentRecords: {
              create: {
                userId: data.customerId,
                paymentMode: 'CASH',
                amount: data.fareEstimate.totalAmount,
                status: 'PENDING',
              },
            },
          },
          include: bookingIncludes,
        });
        return toBookingRecord(booking);
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (!isUniqueConstraintError(error)) throw error;

      const existing = await prisma.booking.findUnique({
        where: {
          customerId_idempotencyKey: {
            customerId: data.customerId,
            idempotencyKey: data.idempotencyKey,
          },
        },
        include: bookingIncludes,
      });
      if (!existing) throw error;
      if (existing.requestHash !== data.requestHash) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different booking.');
      }
      return toBookingRecord(existing);
    }
  }

  async listBookings(customerId: string): Promise<BookingRecord[]> {
    const bookings = await prisma.booking.findMany({
      where: { customerId },
      include: bookingIncludes,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return bookings.map(toBookingRecord);
  }

  async getBooking(customerId: string, bookingId: string): Promise<BookingRecord | null> {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, customerId },
      include: bookingIncludes,
    });
    return booking ? toBookingRecord(booking) : null;
  }

  async cancelBooking(customerId: string, bookingId: string): Promise<BookingRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const booking = await transaction.booking.findFirst({
        where: { id: bookingId, customerId },
        select: { id: true, status: true },
      });
      if (!booking || booking.status !== 'PENDING') return null;

      const cancellation = await transaction.booking.updateMany({
        where: { id: bookingId, customerId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (cancellation.count === 0) return null;
      const updated = await transaction.booking.findFirst({
        where: { id: bookingId, customerId },
        include: bookingIncludes,
      });
      if (!updated) return null;
      await transaction.bookingStatusHistory.create({
        data: { bookingId, status: 'CANCELLED', note: 'Cancelled by customer.' },
      });
      await transaction.paymentRecord.updateMany({
        where: { bookingId, status: 'PENDING' },
        data: { status: 'VOIDED' },
      });
      return toBookingRecord(updated);
    });
  }
}
