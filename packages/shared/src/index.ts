export type UserId = string;
export type DriverId = string;
export type VehicleId = string;
export type BookingId = string;

export interface User {
  id: UserId;
  name: string;
  phoneNumber: string;
  email?: string;
}

export interface Driver {
  id: DriverId;
  name: string;
  phoneNumber: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
}

export interface Vehicle {
  id: VehicleId;
  driverId: DriverId;
  category: 'auto' | 'cab';
  registrationNumber: string;
  make?: string;
  model?: string;
}

export interface BookingStop {
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface FareEstimate {
  currency: 'INR';
  baseFare: number;
  distanceFare: number;
  waitingFare: number;
  total: number;
}

export interface Booking {
  id: BookingId;
  customerId: UserId;
  pickup: BookingStop;
  destination: BookingStop;
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  fareEstimate?: FareEstimate;
}

export interface Reward {
  id: string;
  name: string;
  pointsRequired: number;
  description?: string;
}
