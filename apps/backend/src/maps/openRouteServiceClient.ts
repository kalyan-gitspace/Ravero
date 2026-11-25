import { AppError } from '../errors/AppError.js';
import type { Coordinates, MatrixResult, RouteOptions, RouteResult } from './types.js';

const MAX_TIMEOUT_RETRIES = 1;

interface OpenRouteServiceClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toLonLat(coordinates: Coordinates): [number, number] {
  return [coordinates.longitude, coordinates.latitude];
}

function parseRoute(feature: unknown, profile: string): RouteResult {
  if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties)) {
    throw new AppError(502, 'MAPS_INVALID_PROVIDER_RESPONSE', 'Routing provider returned invalid data.');
  }

  const summary = feature.properties.summary;
  const geometry = feature.geometry;
  if (
    !isRecord(summary) ||
    !isFiniteNumber(summary.distance) ||
    summary.distance < 0 ||
    !isFiniteNumber(summary.duration) ||
    summary.duration < 0 ||
    geometry.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    !geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        isFiniteNumber(coordinate[0]) &&
        coordinate[0] >= -180 &&
        coordinate[0] <= 180 &&
        isFiniteNumber(coordinate[1]) &&
        coordinate[1] >= -90 &&
        coordinate[1] <= 90,
    )
  ) {
    throw new AppError(502, 'MAPS_INVALID_PROVIDER_RESPONSE', 'Routing provider returned invalid data.');
  }

  const distanceMeters = summary.distance;
  const durationSeconds = summary.duration;
  const coordinates = geometry.coordinates as [number, number][];
  const bbox =
    Array.isArray(feature.bbox) &&
    feature.bbox.length === 4 &&
    feature.bbox.every(isFiniteNumber)
      ? (feature.bbox as [number, number, number, number])
      : undefined;
  const segments = Array.isArray(feature.properties.segments)
    ? feature.properties.segments
    : [];
  const providerSteps = segments.flatMap((segment) =>
    isRecord(segment) && Array.isArray(segment.steps) ? segment.steps : [],
  );
  const steps = providerSteps.flatMap((step) => {
    if (
      !isRecord(step) ||
      !isFiniteNumber(step.distance) ||
      !isFiniteNumber(step.duration)
    ) {
      return [];
    }
    return [{
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      ...(typeof step.instruction === 'string' ? { instruction: step.instruction } : {}),
      ...(typeof step.name === 'string' ? { name: step.name } : {}),
    }];
  });

  return {
    distanceMeters,
    distanceKm: distanceMeters / 1000,
    durationSeconds,
    durationMinutes: durationSeconds / 60,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    ...(bbox ? { bbox } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    profile,
  };
}

export class OpenRouteServiceClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenRouteServiceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
  }

  async route(
    origin: Coordinates,
    destination: Coordinates,
    options: RouteOptions,
  ): Promise<RouteResult[]> {
    const body: Record<string, unknown> = {
      coordinates: [toLonLat(origin), toLonLat(destination)],
      instructions: true,
      units: 'm',
    };
    if (options.alternatives !== false) {
      body.alternative_routes = { target_count: 2, weight_factor: 1.6, share_factor: 0.6 };
    }

    const payload = await this.request(
      `/v2/directions/${encodeURIComponent(options.profile)}/geojson`,
      body,
      'route',
    );
    if (!Array.isArray(payload.features) || payload.features.length === 0) {
      throw new AppError(502, 'MAPS_INVALID_PROVIDER_RESPONSE', 'Routing provider returned no routes.');
    }
    return payload.features.map((feature) => parseRoute(feature, options.profile));
  }

  async matrix(
    sources: Coordinates[],
    destinations: Coordinates[],
    profile: string,
  ): Promise<MatrixResult> {
    const sourceIndexes = sources.map((_source, index) => index);
    const destinationIndexes = destinations.map((_destination, index) => sources.length + index);
    const locations = [...sources, ...destinations].map(toLonLat);
    const payload = await this.request(
      `/v2/matrix/${encodeURIComponent(profile)}`,
      {
        locations,
        sources: sourceIndexes,
        destinations: destinationIndexes,
        metrics: ['duration', 'distance'],
        units: 'm',
      },
      'matrix',
    );

    const durations = payload.durations;
    const distances = payload.distances;
    if (
      !Array.isArray(durations) ||
      !Array.isArray(distances) ||
      durations.length !== sources.length ||
      distances.length !== sources.length ||
      durations.some((row: unknown) => !Array.isArray(row) || row.length !== destinations.length) ||
      distances.some((row: unknown) => !Array.isArray(row) || row.length !== destinations.length) ||
      !durations.every(
        (row: unknown) =>
          Array.isArray(row) && row.every((value: unknown) => value === null || isFiniteNumber(value)),
      ) ||
      !distances.every(
        (row: unknown) =>
          Array.isArray(row) && row.every((value: unknown) => value === null || isFiniteNumber(value)),
      )
    ) {
      throw new AppError(502, 'MAPS_INVALID_PROVIDER_RESPONSE', 'Routing provider returned an invalid matrix.');
    }

    return {
      durations: durations as (number | null)[][],
      distances: distances as (number | null)[][],
      sources,
      destinations,
    };
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    operation: string,
  ): Promise<Record<string, unknown>> {
    if (!this.options.apiKey) {
      throw new AppError(
        503,
        'ROUTING_NOT_CONFIGURED',
        'Routing is unavailable until an openrouteservice API key is configured.',
      );
    }

    for (let attempt = 0; attempt <= MAX_TIMEOUT_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            Accept: 'application/geo+json, application/json',
            Authorization: this.options.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          console.warn('Map provider request failed.', {
            provider: 'openrouteservice',
            operation,
            failure: 'http',
            status: response.status,
          });
          throw new AppError(
            response.status === 429 ? 429 : 502,
            response.status === 429 ? 'MAPS_PROVIDER_RATE_LIMITED' : 'MAPS_PROVIDER_ERROR',
            response.status === 429
              ? 'Routing provider is rate limiting requests. Please try again shortly.'
              : 'Routing provider could not complete the request.',
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (controller.signal.aborted) throw new Error('MAPS_PROVIDER_TIMEOUT');
          console.warn('Map provider request failed.', {
            provider: 'openrouteservice',
            operation,
            failure: 'invalid-response',
          });
          throw new AppError(
            502,
            'MAPS_INVALID_PROVIDER_RESPONSE',
            'Routing provider returned invalid data.',
          );
        }
        if (!isRecord(payload) || 'error' in payload) {
          console.warn('Map provider request failed.', {
            provider: 'openrouteservice',
            operation,
            failure: 'invalid-response',
          });
          throw new AppError(
            502,
            'MAPS_INVALID_PROVIDER_RESPONSE',
            'Routing provider returned invalid data.',
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof AppError && !controller.signal.aborted) throw error;

        const timedOut =
          controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError');
        if (timedOut && attempt < MAX_TIMEOUT_RETRIES) {
          console.warn('Map provider request timed out; retrying once.', {
            provider: 'openrouteservice',
            operation,
            attempt: attempt + 1,
          });
          continue;
        }

        console.warn('Map provider request failed.', {
          provider: 'openrouteservice',
          operation,
          failure: timedOut ? 'timeout' : 'network',
        });
        throw new AppError(
          timedOut ? 504 : 502,
          timedOut ? 'MAPS_PROVIDER_TIMEOUT' : 'MAPS_PROVIDER_UNAVAILABLE',
          timedOut ? 'Routing provider request timed out.' : 'Routing provider is currently unavailable.',
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new AppError(504, 'MAPS_PROVIDER_TIMEOUT', 'Routing provider request timed out.');
  }
}
