import { Platform } from 'react-native';
import { apiConfig } from '../config/api';
import type { DriverRideStatus } from '../driver/rideLifecycle';
import { refreshTokenStorage } from './tokenStorage';
import type {
  ApiEnvelope,
  DriverAuthResponse,
  DriverEarnings,
  DriverNotification,
  DriverProfile,
  DriverProfileResponse,
  DriverRide,
  DriverRideRequest,
} from './types';

export class DriverApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DriverApiError';
  }
}

class DriverApiClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<DriverAuthResponse> | null = null;
  private onSessionExpired: (() => void) | null = null;

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  async sendOtp(phone: string): Promise<{ message: string; expiresIn: number; developmentOtp?: string }> {
    return this.request('/api/v1/auth/driver/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOtp(phone: string, otp: string, fullName?: string): Promise<DriverAuthResponse> {
    const session = await this.request<DriverAuthResponse>('/api/v1/auth/driver/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, ...(fullName ? { fullName } : {}) }),
    });
    await this.saveSession(session);
    return session;
  }

  async restoreSession(): Promise<DriverProfileResponse | null> {
    const refreshToken = await refreshTokenStorage.get();
    if (!refreshToken) return null;
    return (await this.refresh(refreshToken)).driver;
  }

  async logout(): Promise<void> {
    try {
      await this.request<{ loggedOut: boolean }>('/api/v1/auth/driver/logout', { method: 'POST' });
    } finally {
      this.accessToken = null;
      await refreshTokenStorage.clear();
    }
  }

  async getProfile(): Promise<DriverProfile> {
    return (await this.request<{ profile: DriverProfile }>('/api/v1/driver/profile')).profile;
  }

  async updateProfile(data: {
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
  }): Promise<DriverProfile> {
    return (
      await this.request<{ profile: DriverProfile }>('/api/v1/driver/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    ).profile;
  }

  async setAvailability(
    isAvailable: boolean,
    coordinates?: { latitude: number; longitude: number },
  ): Promise<DriverProfile> {
    return (
      await this.request<{ profile: DriverProfile }>('/api/v1/driver/availability', {
        method: 'PUT',
        body: JSON.stringify({
          isAvailable,
          ...(coordinates ?? {}),
        }),
      })
    ).profile;
  }

  async updateLocation(coordinates: { latitude: number; longitude: number }): Promise<void> {
    await this.request<{ updated: boolean }>('/api/v1/driver/location', {
      method: 'POST',
      body: JSON.stringify(coordinates),
    });
  }

  async getRequests(): Promise<DriverRideRequest[]> {
    return (await this.request<{ requests: DriverRideRequest[] }>('/api/v1/driver/requests')).requests;
  }

  async acceptRequest(bookingId: string): Promise<DriverRide> {
    return (
      await this.request<{ ride: DriverRide }>(
        `/api/v1/driver/requests/${encodeURIComponent(bookingId)}/accept`,
        { method: 'POST' },
      )
    ).ride;
  }

  async rejectRequest(bookingId: string): Promise<void> {
    await this.request<{ rejected: boolean }>(
      `/api/v1/driver/requests/${encodeURIComponent(bookingId)}/reject`,
      { method: 'POST' },
    );
  }

  async updateRideStatus(bookingId: string, status: DriverRideStatus): Promise<DriverRide> {
    return (
      await this.request<{ ride: DriverRide }>(
        `/api/v1/driver/rides/${encodeURIComponent(bookingId)}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      )
    ).ride;
  }

  async getRides(): Promise<DriverRide[]> {
    return (await this.request<{ rides: DriverRide[] }>('/api/v1/driver/rides')).rides;
  }

  async getEarnings(): Promise<DriverEarnings> {
    return (await this.request<{ earnings: DriverEarnings }>('/api/v1/driver/earnings')).earnings;
  }

  async getNotifications(): Promise<DriverNotification[]> {
    return (
      await this.request<{ notifications: DriverNotification[] }>('/api/v1/driver/notifications')
    ).notifications;
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await this.request<{ read: boolean }>(
      `/api/v1/driver/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' },
    );
  }

  private async saveSession(session: DriverAuthResponse): Promise<void> {
    await refreshTokenStorage.set(session.refreshToken);
    this.accessToken = session.accessToken;
  }

  private async refresh(refreshToken: string): Promise<DriverAuthResponse> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.request<DriverAuthResponse>(
        '/api/v1/auth/driver/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        false,
      )
        .then(async (session) => {
          await this.saveSession(session);
          return session;
        })
        .catch(async (error: unknown) => {
          if (error instanceof DriverApiError && error.status === 401) {
            this.accessToken = null;
            await refreshTokenStorage.clear();
            this.onSessionExpired?.();
          }
          throw error;
        })
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    allowRefresh = true,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${apiConfig.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      const message =
        Platform.OS === 'web'
          ? 'Could not connect to RAVERO. Check that the local backend is running.'
          : 'Could not connect to RAVERO. Check the backend address and network connection.';
      throw new DriverApiError(message, 0, 'NETWORK_ERROR');
    }

    if (response.status === 401 && allowRefresh) {
      const refreshToken = await refreshTokenStorage.get();
      if (refreshToken) {
        try {
          await this.refresh(refreshToken);
          return this.request<T>(path, init, false);
        } catch (error) {
          if (!(error instanceof DriverApiError) || error.status !== 401) throw error;
        }
      }
    }

    if (response.status === 401) {
      this.accessToken = null;
      await refreshTokenStorage.clear();
      this.onSessionExpired?.();
    }

    let payload: ApiEnvelope<T>;
    try {
      payload = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new DriverApiError('The server returned an unreadable response.', response.status, 'INVALID_RESPONSE');
    }

    if (!response.ok || !payload.success) {
      const error = 'error' in payload ? payload.error : undefined;
      throw new DriverApiError(
        error?.message ?? 'The request could not be completed.',
        response.status,
        error?.code ?? 'REQUEST_FAILED',
      );
    }
    return payload.data;
  }
}

export const driverApi = new DriverApiClient();
