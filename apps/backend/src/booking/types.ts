export interface BookingLocationInput {
  label: string;
  address: string;
}

export interface CreateBookingInput {
  serviceTypeCode: string;
  pickup: BookingLocationInput;
  dropoff: BookingLocationInput;
  stops: BookingLocationInput[];
  scheduledAt?: Date;
}

export interface FareEstimate {
  currency: 'INR';
  baseAmount: number;
  distanceAmount: number;
  timeAmount: number;
  totalAmount: number;
  isDevelopmentEstimate: true;
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
  createBooking(data: CreateBookingRecordInput): Promise<BookingRecord>;
  listBookings(customerId: string): Promise<BookingRecord[]>;
  getBooking(customerId: string, bookingId: string): Promise<BookingRecord | null>;
  cancelBooking(customerId: string, bookingId: string): Promise<BookingRecord | null>;
}
