import { createHash } from 'node:crypto';
import { AppError as createAppError } from '../errors/AppError.js';
import type {
  BookingRecord,
  BookingRepository,
  CreateBookingInput,
  FareEstimate,
} from './types.js';

export class CustomerBookingService {
  constructor(
    private readonly repository: BookingRepository,
    private readonly options: { developmentBaseFare: number; now?: () => Date },
  ) {}

  async estimate(input: CreateBookingInput): Promise<FareEstimate> {
    const serviceType = await this.repository.getActiveServiceType(input.serviceTypeCode);
    if (!serviceType) {
      throw new createAppError(400, 'SERVICE_TYPE_UNAVAILABLE', 'This ride category is not available.');
    }

    return this.createEstimate();
  }

  async create(
    customerId: string,
    input: CreateBookingInput,
    idempotencyKey: string,
  ): Promise<BookingRecord> {
    const serviceType = await this.repository.getActiveServiceType(input.serviceTypeCode);
    if (!serviceType) {
      throw new createAppError(400, 'SERVICE_TYPE_UNAVAILABLE', 'This ride category is not available.');
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...input,
          scheduledAt: input.scheduledAt?.toISOString() ?? null,
        }),
      )
      .digest('hex');

    return this.repository.createBooking({
      customerId,
      serviceType,
      request: input,
      idempotencyKey,
      requestHash,
      fareEstimate: this.createEstimate(),
    });
  }

  async list(customerId: string): Promise<BookingRecord[]> {
    return this.repository.listBookings(customerId);
  }

  async get(customerId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.repository.getBooking(customerId, bookingId);
    if (!booking) {
      throw new createAppError(404, 'BOOKING_NOT_FOUND', 'Booking was not found.');
    }
    return booking;
  }

  async cancel(customerId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.repository.cancelBooking(customerId, bookingId);
    if (!booking) {
      throw new createAppError(409, 'BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled.');
    }
    return booking;
  }

  private createEstimate(): FareEstimate {
    const now = this.options.now?.() ?? new Date();
    const baseAmount = Math.round(this.options.developmentBaseFare * 100) / 100;
    return {
      currency: 'INR',
      baseAmount,
      distanceAmount: 0,
      timeAmount: 0,
      totalAmount: baseAmount,
      isDevelopmentEstimate: true,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    };
  }
}
