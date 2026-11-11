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
  baseAmount: number;
  distanceAmount: number;
  timeAmount: number;
  totalAmount: number;
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
    details?: Array<{ field: string; message: string }>;
  };
}
