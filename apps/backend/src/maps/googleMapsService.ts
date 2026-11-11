import { AppError } from '../errors/AppError.js';
import type { Coordinates, GoogleMapsServiceOptions, GoogleMapsSku } from './types.js';

interface GooglePlacePrediction {
  placeId?: unknown;
  text?: { text?: unknown };
}

interface GoogleAutocompleteResponse {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
}

interface GoogleDetailsResponse {
  id?: unknown;
  formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
}

interface GoogleGeocodingResponse {
  status?: unknown;
  results?: Array<{ formatted_address?: unknown; place_id?: unknown }>;
}

interface GoogleRoutesResponse {
  routes?: Array<{
    distanceMeters?: unknown;
    duration?: unknown;
    polyline?: { encodedPolyline?: unknown };
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCoordinates(value: unknown): value is Coordinates {
  if (!isRecord(value)) return false;
  return (
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude)
  );
}

export class GoogleMapsService {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: GoogleMapsServiceOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async autocomplete(input: string, sessionToken: string) {
    await this.reserve('AUTOCOMPLETE_REQUESTS');
    const result = await this.request<GoogleAutocompleteResponse>(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.requireApiKey(),
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
        },
        body: JSON.stringify({ input, sessionToken }),
      },
    );

    if (!Array.isArray(result.suggestions)) throw this.upstreamError();
    const suggestions = result.suggestions
      .map((suggestion) =>
        isRecord(suggestion) && isRecord(suggestion.placePrediction)
          ? suggestion.placePrediction
          : null,
      )
      .filter(
        (prediction): prediction is Record<string, unknown> & GooglePlacePrediction =>
          prediction !== null && typeof prediction.placeId === 'string',
      )
      .map((prediction) => ({
        placeId: prediction.placeId as string,
        text:
          isRecord(prediction.text) && typeof prediction.text.text === 'string'
            ? prediction.text.text
            : '',
      }))
      .filter((prediction) => prediction.text.length > 0);

    return { suggestions };
  }

  async placeDetails(placeId: string, sessionToken?: string) {
    await this.reserve('PLACE_DETAILS_ESSENTIALS');
    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    );
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    const result = await this.request<GoogleDetailsResponse>(url, {
      headers: {
        'X-Goog-Api-Key': this.requireApiKey(),
        'X-Goog-FieldMask': 'id,formattedAddress,location',
      },
    });

    if (
      typeof result.id !== 'string' ||
      typeof result.formattedAddress !== 'string' ||
      !isCoordinates(result.location)
    ) {
      throw this.upstreamError();
    }

    return {
      placeId: result.id,
      formattedAddress: result.formattedAddress,
      location: result.location,
    };
  }

  async reverseGeocode(location: Coordinates) {
    await this.reserve('GEOCODING');
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${location.latitude},${location.longitude}`);
    url.searchParams.set('key', this.requireApiKey());
    const result = await this.request<GoogleGeocodingResponse>(url);

    if (result.status === 'ZERO_RESULTS') return { result: null };
    const first = Array.isArray(result.results) ? result.results[0] : undefined;
    if (
      result.status !== 'OK' ||
      !isRecord(first) ||
      typeof first.formatted_address !== 'string' ||
      typeof first.place_id !== 'string'
    ) {
      throw this.upstreamError();
    }

    return {
      result: {
        formattedAddress: first.formatted_address,
        placeId: first.place_id,
      },
    };
  }

  async computeRoute(origin: Coordinates, destination: Coordinates, travelMode: string) {
    await this.reserve('ROUTES_COMPUTE_ESSENTIALS');
    const result = await this.request<GoogleRoutesResponse>(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.requireApiKey(),
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: origin } },
          destination: { location: { latLng: destination } },
          travelMode,
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      },
    );

    const route = Array.isArray(result.routes) ? result.routes[0] : undefined;
    if (
      !isRecord(route) ||
      typeof route.distanceMeters !== 'number' ||
      typeof route.duration !== 'string'
    ) {
      throw this.upstreamError();
    }

    return {
      distanceMeters: route.distanceMeters,
      duration: route.duration,
      ...(typeof route.polyline?.encodedPolyline === 'string'
        ? { encodedPolyline: route.polyline.encodedPolyline }
        : {}),
    };
  }

  async reserveDynamicMapLoad(): Promise<void> {
    await this.reserve('DYNAMIC_MAPS_LOADS');
  }

  private requireApiKey(): string {
    if (!this.options.apiKey) {
      throw new AppError(
        503,
        'GOOGLE_MAPS_NOT_CONFIGURED',
        'Google Maps services are not configured.',
      );
    }
    return this.options.apiKey;
  }

  private async reserve(sku: GoogleMapsSku): Promise<void> {
    this.requireApiKey();
    const limit = this.options.monthlyLimits[sku];
    if (!limit) {
      throw new AppError(
        503,
        'GOOGLE_MAPS_BUDGET_NOT_CONFIGURED',
        'This Google Maps service is disabled until a monthly request limit is configured.',
      );
    }

    const currentMonth = this.now();
    const month = new Date(
      Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), 1),
    );
    let reserved: boolean;
    try {
      reserved = await this.options.usageRepository.reserveMonthlyUsage(sku, month, limit);
    } catch {
      throw new AppError(
        503,
        'GOOGLE_MAPS_USAGE_TRACKING_UNAVAILABLE',
        'Google Maps requests are disabled because usage tracking is unavailable.',
      );
    }

    if (!reserved) {
      throw new AppError(
        429,
        'GOOGLE_MAPS_MONTHLY_LIMIT_REACHED',
        'The configured monthly request limit for this Google Maps service has been reached.',
      );
    }
  }

  private async request<T>(url: string | URL, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, redirect: 'error' });
    } catch {
      throw this.upstreamError();
    }

    if (!response.ok) throw this.upstreamError();

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw this.upstreamError();
    }

    if (!isRecord(result)) throw this.upstreamError();
    if ('error' in result || (typeof result.status === 'string' && result.status !== 'OK' && result.status !== 'ZERO_RESULTS')) {
      throw this.upstreamError();
    }
    return result as T;
  }

  private upstreamError(): AppError {
    return new AppError(
      502,
      'GOOGLE_MAPS_UPSTREAM_ERROR',
      'The Google Maps service could not complete this request.',
    );
  }
}
