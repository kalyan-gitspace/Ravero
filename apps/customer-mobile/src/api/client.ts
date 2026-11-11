import { Platform } from 'react-native';
import { refreshTokenStorage } from './tokenStorage';
import { apiConfig } from '../config/api';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AuthTokenResponse,
  BookingEstimate,
  BookingRequest,
  CustomerProfile,
  CustomerBooking,
  SendOtpResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class CustomerApiClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<AuthTokenResponse> | null = null;
  private onSessionExpired: (() => void) | null = null;

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  async sendOtp(phone: string): Promise<SendOtpResponse> {
    return this.request('/api/v1/auth/customer/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async checkHealth(): Promise<{ status: string }> {
    const result = await this.request<{ status: string; service: string }>('/health', {
      method: 'GET',
    });
    return { status: result.status };
  }

  async verifyOtp(
    phone: string,
    otp: string,
    profile?: { fullName: string; email?: string },
  ): Promise<AuthTokenResponse> {
    const result = await this.request<AuthTokenResponse>('/api/v1/auth/customer/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, ...profile }),
    });
    await this.saveSession(result);
    return result;
  }

  async getProfile(): Promise<CustomerProfile> {
    const result = await this.request<{ customer: CustomerProfile }>('/api/v1/customer/profile');
    return result.customer;
  }

  async updateProfile(data: {
    fullName?: string;
    email?: string | null;
    profileImageUrl?: string | null;
  }): Promise<CustomerProfile> {
    const result = await this.request<{ customer: CustomerProfile }>('/api/v1/customer/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return result.customer;
  }

  async estimateBooking(request: BookingRequest): Promise<BookingEstimate> {
    const result = await this.request<{ estimate: BookingEstimate }>(
      '/api/v1/customer/bookings/estimate',
      { method: 'POST', body: JSON.stringify(request) },
    );
    return result.estimate;
  }

  async createBooking(request: BookingRequest, idempotencyKey: string): Promise<CustomerBooking> {
    const result = await this.request<{ booking: CustomerBooking }>('/api/v1/customer/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(request),
    });
    return result.booking;
  }

  async getBookings(): Promise<CustomerBooking[]> {
    const result = await this.request<{ bookings: CustomerBooking[] }>('/api/v1/customer/bookings');
    return result.bookings;
  }

  async getBooking(bookingId: string): Promise<CustomerBooking> {
    const result = await this.request<{ booking: CustomerBooking }>(
      `/api/v1/customer/bookings/${encodeURIComponent(bookingId)}`,
    );
    return result.booking;
  }

  async cancelBooking(bookingId: string): Promise<CustomerBooking> {
    const result = await this.request<{ booking: CustomerBooking }>(
      `/api/v1/customer/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: 'POST' },
    );
    return result.booking;
  }

  async restoreSession(): Promise<CustomerProfile | null> {
    const refreshToken = await refreshTokenStorage.get();
    if (!refreshToken) {
      return null;
    }

    const session = await this.refresh(refreshToken);
    return session.customer;
  }

  async logout(): Promise<void> {
    try {
      await this.request<{ loggedOut: boolean }>('/api/v1/auth/customer/logout', {
        method: 'POST',
      });
    } finally {
      this.accessToken = null;
      await refreshTokenStorage.clear();
    }
  }

  private async saveSession(session: AuthTokenResponse): Promise<void> {
    await refreshTokenStorage.set(session.refreshToken);
    this.accessToken = session.accessToken;
  }

  private async refresh(refreshToken: string): Promise<AuthTokenResponse> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.request<AuthTokenResponse>(
        '/api/v1/auth/customer/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        },
        false,
      )
        .then(async (session) => {
          await this.saveSession(session);
          return session;
        })
        .catch(async (error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
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
    } catch (error) {
      if (__DEV__) {
        console.warn('RAVERO API request failed.', {
          path,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }

      const message =
        Platform.OS === 'web'
          ? 'Could not connect to RAVERO. Check that the local backend is running and that the browser allows this local connection.'
          : 'Could not connect to RAVERO. Check that the backend is running and the development API address is correct.';
      throw new ApiError(message, 0, 'NETWORK_ERROR');
    }

    if (response.status === 401 && allowRefresh) {
      const refreshToken = await refreshTokenStorage.get();
      if (refreshToken) {
        try {
          await this.refresh(refreshToken);
          return this.request<T>(path, init, false);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) {
            throw error;
          }
        }
      }
    }

    if (response.status === 401) {
      this.accessToken = null;
      await refreshTokenStorage.clear();
      this.onSessionExpired?.();
    }

    let payload: ApiEnvelope<T> | ApiErrorEnvelope;
    try {
      payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
    } catch {
      throw new ApiError('The server returned an unreadable response.', response.status, 'INVALID_RESPONSE');
    }

    if (!response.ok || !payload.success) {
      const error = 'error' in payload ? payload.error : undefined;
      const message =
        error?.message ??
        (response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : response.status === 404
            ? 'The requested RAVERO service is not available.'
            : response.status === 429
              ? 'Too many requests. Please wait and try again.'
              : response.status >= 500
                ? 'RAVERO is temporarily unavailable. Please try again shortly.'
                : 'The request could not be completed.');
      throw new ApiError(
        message,
        response.status,
        error?.code ??
          (response.status === 401
            ? 'AUTHENTICATION_REQUIRED'
            : response.status === 404
              ? 'NOT_FOUND'
              : response.status === 429
                ? 'RATE_LIMITED'
                : response.status >= 500
                  ? 'SERVER_ERROR'
                  : 'REQUEST_FAILED'),
      );
    }

    return payload.data;
  }
}

export const customerApi = new CustomerApiClient();
