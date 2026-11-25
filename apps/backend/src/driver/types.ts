export interface DriverDocumentSummary {
  type: string;
  documentNumber: string | null;
  status: string;
  expiryDate: Date | null;
}

export interface DriverVehicleSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
  registrationNumber: string;
  categoryCode: string;
  status: string;
  documents: DriverDocumentSummary[];
}

export interface DriverProfileRecord {
  id: string;
  userId: string;
  phone: string;
  fullName: string | null;
  accountStatus: string;
  isPhoneVerified: boolean;
  verificationStatus: string;
  isAvailable: boolean;
  currentLatitude: number | null;
  currentLongitude: number | null;
  locationUpdatedAt: Date | null;
  driverLicenseNumber: string | null;
  documents: DriverDocumentSummary[];
  vehicle: DriverVehicleSummary | null;
}

export interface DriverProfileUpdate {
  fullName?: string;
  driverLicenseNumber?: string;
  vehicle?: {
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
    registrationNumber: string;
  };
}

export interface DriverCoordinates {
  latitude: number;
  longitude: number;
}

export interface DriverRideRequest {
  id: string;
  pickup: { label: string; address: string; latitude: number; longitude: number };
  dropoff: { label: string; address: string; latitude: number; longitude: number };
  distanceMeters: number;
  distanceKm: number;
  estimatedDurationSeconds: number;
  estimatedDurationMinutes: number;
  estimatedFare: number;
  currency: 'INR';
  createdAt: Date;
  expiresAt: Date;
}

export interface DriverRideRecord {
  id: string;
  status: string;
  pickup: { label: string; address: string };
  dropoff: { label: string; address: string };
  distanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: number;
  paymentStatus: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface DriverEarnings {
  completedRideCount: number;
  todayRideCount: number;
  totalEarnings: number;
  cashCollected: number;
  driverCommission: 0;
  platformFee: 0;
  currency: 'INR';
  dayStartsAt: Date;
}

export interface DriverNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  bookingId: string | null;
  createdAt: Date;
}

export interface DriverRepository {
  getProfile(userId: string): Promise<DriverProfileRecord | null>;
  updateProfile(userId: string, input: DriverProfileUpdate): Promise<DriverProfileRecord>;
  setAvailability(
    userId: string,
    isAvailable: boolean,
    coordinates: DriverCoordinates | null,
    now: Date,
  ): Promise<DriverProfileRecord>;
  updateLocation(userId: string, coordinates: DriverCoordinates, now: Date): Promise<void>;
  listRequests(userId: string, now: Date, radiusKm: number, freshnessMs: number, offerExpiryMs: number): Promise<DriverRideRequest[]>;
  acceptRequest(
    userId: string,
    bookingId: string,
    now: Date,
    radiusKm: number,
    freshnessMs: number,
    offerExpiryMs: number,
  ): Promise<DriverRideRecord>;
  rejectRequest(userId: string, bookingId: string, now: Date, offerExpiryMs: number): Promise<void>;
  updateRideStatus(
    userId: string,
    bookingId: string,
    status: string,
    allowedFrom: string[],
    now: Date,
  ): Promise<DriverRideRecord>;
  listRides(userId: string): Promise<DriverRideRecord[]>;
  getEarnings(userId: string, now: Date): Promise<DriverEarnings>;
  getNotifications(userId: string): Promise<DriverNotification[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<boolean>;
}
