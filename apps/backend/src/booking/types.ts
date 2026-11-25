export interface BookingLocationInput {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export interface CreateBookingInput {
  serviceTypeCode: string;
  pickup: BookingLocationInput;
  dropoff: BookingLocationInput;
  stops: BookingLocationInput[];
  fareRouteToken: string;
  scheduledAt?: Date;
}

export interface FareSlabBreakdown {
  label: string;
  distanceKm?: number;
  ratePerKm?: number | null;
  amount: number;
}

export interface FareEstimate {
  currency: 'INR';
  distanceMeters: number;
  distanceKm: number;
  estimatedDurationSeconds: number;
  estimatedDurationMinutes: number;
  baseAmount: number;
  distanceAmount: number;
  timeAmount: number;
  platformFeeAmount: number;
  driverCommissionAmount: number;
  totalAmount: number;
  roundingPolicy: 'NEAREST_PAISE_HALF_UP_FINAL_TOTAL';
  distanceBreakdown?: FareSlabBreakdown[];
  isDevelopmentEstimate: false;
  expiresAt: string;
}

export interface BookingRecord {
  id: string;
  status: string;
  serviceType: { code: string; name: string };
  pickup: BookingLocationInput;
  dropoff: BookingLocationInput;
  stops: BookingLocationInput[];
  scheduledAt: Date | null;
  fareEstimate: FareEstimate;
  paymentMode: 'CASH';
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceTypeRecord {
  id: string;
  code: string;
  name: string;
}

export interface CreateBookingRecordInput {
  customerId: string;
  serviceType: ServiceTypeRecord;
  request: CreateBookingInput;
  idempotencyKey: string;
  requestHash: string;
  fareEstimate: FareEstimate;
}

export interface BookingRepository {
  getActiveServiceType(code: string): Promise<ServiceTypeRecord | null>;
  getIdempotentBooking(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<BookingRecord | null>;
  createBooking(data: CreateBookingRecordInput): Promise<BookingRecord>;
  listBookings(customerId: string): Promise<BookingRecord[]>;
  getBooking(customerId: string, bookingId: string): Promise<BookingRecord | null>;
  cancelBooking(customerId: string, bookingId: string): Promise<BookingRecord | null>;
}
