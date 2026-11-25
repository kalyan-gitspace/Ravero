export interface CustomerProfile {
  id: string;
  fullName: string | null;
  phone: string;
  email: string | null;
  profileImageUrl: string | null;
  status: string;
  isPhoneVerified: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  customer: CustomerProfile;
}

export interface SendOtpResponse {
  message: string;
  expiresIn: number;
  developmentOtp?: string;
}

export interface BookingLocation {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export interface LocationSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  address: string;
  latitude: number;
  longitude: number;
  category?: string;
}

export interface MapConfig {
  tileStyleUrl: string;
  attribution: string;
  defaultCenter: { latitude: number; longitude: number };
  defaultZoom: number;
  routingProfile: string;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [longitude: number, latitude: number][];
}

export interface MapRoute {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  geometry: RouteGeometry;
  profile: string;
  fareRouteToken: string;
}

export interface MapEta {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  etaTimestamp: string;
}

export interface SelectedLocation extends BookingLocation {
  latitude: number;
  longitude: number;
}

export interface BookingRequest {
  serviceTypeCode:
    | 'AUTO'
    | 'CAB'
    | 'TWO_WHEELER'
    | 'RENTALS'
    | 'PACKAGE'
    | 'SCHEDULE'
    | 'TRANSPORT'
    | 'MACHINERY'
    | 'OUTSTATION';
  pickup: BookingLocation;
  dropoff: BookingLocation;
  stops: BookingLocation[];
  scheduledAt?: string;
}

export interface BookingEstimate {
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
  distanceBreakdown?: {
    label: string;
    distanceKm?: number;
    ratePerKm?: number | null;
    amount: number;
  }[];
  isDevelopmentEstimate: boolean;
  expiresAt: string;
}

export interface CustomerBooking {
  id: string;
  status: string;
  serviceType: { code: string; name: string };
  pickup: BookingLocation;
  dropoff: BookingLocation;
  stops: BookingLocation[];
  scheduledAt: string | null;
  fareEstimate: BookingEstimate;
  paymentMode: 'CASH';
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}
