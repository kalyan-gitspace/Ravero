export interface DriverProfileResponse {
  id: string;
  phone: string;
  fullName: string | null;
  accountStatus: string;
  verificationStatus: string;
  isPhoneVerified: boolean;
  driverLicenseNumber: string | null;
}

export interface DriverAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  driver: DriverProfileResponse;
}

export interface DriverDocument {
  type: string;
  documentNumber: string | null;
  status: string;
  expiryDate: string | null;
}

export interface DriverVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
  registrationNumber: string;
  categoryCode: string;
  status: string;
  documents: DriverDocument[];
}

export interface DriverProfile extends DriverProfileResponse {
  userId: string;
  isAvailable: boolean;
  currentLatitude: number | null;
  currentLongitude: number | null;
  locationUpdatedAt: string | null;
  documents: DriverDocument[];
  vehicle: DriverVehicle | null;
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
  createdAt: string;
  expiresAt: string;
}

export interface DriverRide {
  id: string;
  status: string;
  pickup: { label: string; address: string };
  dropoff: { label: string; address: string };
  distanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: number;
  paymentStatus: string;
  createdAt: string;
  completedAt: string | null;
}

export interface DriverEarnings {
  completedRideCount: number;
  todayRideCount: number;
  totalEarnings: number;
  cashCollected: number;
  driverCommission: 0;
  platformFee: 0;
  currency: 'INR';
  dayStartsAt: string;
}

export interface DriverNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  bookingId: string | null;
  createdAt: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error?: { code?: string; message?: string };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;
