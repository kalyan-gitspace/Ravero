import { createHash } from 'node:crypto';
import { AppError as createAppError } from '../errors/AppError.js';
import { calculateAutoFare } from './fare.js';
import { verifyFareRouteToken } from './routeQuote.js';
import type {
  BookingRecord,
  BookingRepository,
  CreateBookingInput,
  FareEstimate,
} from './types.js';

export class CustomerBookingService {
  constructor(
    private readonly repository: BookingRepository,
    private readonly options: { routeQuoteSecret: string; now?: () => Date },
  ) {}

  async estimate(customerId: string, input: CreateBookingInput): Promise<FareEstimate> {
    const serviceType = await this.repository.getActiveServiceType(input.serviceTypeCode);
    if (!serviceType) {
      throw new createAppError(400, 'SERVICE_TYPE_UNAVAILABLE', 'This ride category is not available.');
    }

    return this.createEstimate(customerId, input);
  }

  async create(
    customerId: string,
    input: CreateBookingInput,
    idempotencyKey: string,
  ): Promise<BookingRecord> {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...input,
          scheduledAt: input.scheduledAt?.toISOString() ?? null,
        }),
      )
      .digest('hex');

    const existing = await this.repository.getIdempotentBooking(
      customerId,
      idempotencyKey,
      requestHash,
    );
    if (existing) return existing;

    const serviceType = await this.repository.getActiveServiceType(input.serviceTypeCode);
    if (!serviceType) {
      throw new createAppError(400, 'SERVICE_TYPE_UNAVAILABLE', 'This ride category is not available.');
    }

    const fareEstimate = this.createEstimate(customerId, input);
    return this.repository.createBooking({
      customerId,
      serviceType,
      request: input,
      idempotencyKey,
      requestHash,
      fareEstimate,
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

  private createEstimate(customerId: string, input: CreateBookingInput): FareEstimate {
    if (input.serviceTypeCode !== 'AUTO') {
      throw new createAppError(400, 'SERVICE_TYPE_UNAVAILABLE', 'Only Auto rides have an approved fare model.');
    }
    if (input.stops.length > 0) {
      throw new createAppError(
        400,
        'FARE_ROUTE_STOPS_UNSUPPORTED',
        'Auto fare estimates currently require a direct pickup-to-destination route.',
      );
    }

    const now = this.options.now?.() ?? new Date();
    const quote = verifyFareRouteToken(
      input.fareRouteToken,
      {
        customerId,
        origin: {
          latitude: input.pickup.latitude ?? Number.NaN,
          longitude: input.pickup.longitude ?? Number.NaN,
        },
        destination: {
          latitude: input.dropoff.latitude ?? Number.NaN,
          longitude: input.dropoff.longitude ?? Number.NaN,
        },
      },
      this.options.routeQuoteSecret,
      now.getTime(),
    );
    const fare = calculateAutoFare(quote.distanceMeters);
    return {
      currency: 'INR',
      ...fare,
      estimatedDurationSeconds: quote.durationSeconds,
      estimatedDurationMinutes: quote.durationSeconds / 60,
      isDevelopmentEstimate: false,
      expiresAt: new Date(quote.expiresAt).toISOString(),
    };
  }
}
