import { AppError } from '../errors/AppError.js';
import { MemoryCache } from './cache.js';
import { OpenRouteServiceClient } from './openRouteServiceClient.js';
import { PhotonClient } from './photonClient.js';
import type {
  Coordinates,
  EtaResult,
  LocationSearchResult,
  MapConfig,
  MatrixResult,
  ReverseGeocodeResult,
  RouteResult,
} from './types.js';

const HYDERABAD_CENTER: Coordinates = { latitude: 17.385, longitude: 78.4867 };

export const supportedRoutingProfiles = [
  'driving-car',
  'driving-hgv',
  'cycling-regular',
  'cycling-road',
  'cycling-mountain',
  'foot-walking',
  'foot-hiking',
] as const;
const supportedRoutingProfileSet = new Set<string>(supportedRoutingProfiles);

export interface MapsServiceOptions {
  photon: PhotonClient;
  routing: OpenRouteServiceClient;
  tileStyleUrl: string;
  routingProfile: string;
  cacheTtlSeconds: number;
}

export class MapsService {
  private readonly cache: MemoryCache<unknown>;
  private readonly config: MapConfig;

  constructor(private readonly options: MapsServiceOptions) {
    this.cache = new MemoryCache({ maxEntries: 1000, defaultTtlSeconds: options.cacheTtlSeconds });
    this.config = {
      tileStyleUrl: options.tileStyleUrl,
      attribution: '© OpenStreetMap contributors · OpenFreeMap',
      defaultCenter: HYDERABAD_CENTER,
      defaultZoom: 13,
      routingProfile: options.routingProfile,
      supportedProfiles: [...supportedRoutingProfiles],
    };
  }

  getConfig(): MapConfig {
    return this.config;
  }

  async search(
    query: string,
    limit: number,
    biasCoordinates?: Coordinates,
  ) {
    const key = `search:${JSON.stringify([query.trim().toLowerCase(), limit, biasCoordinates])}`;
    const cached = this.cache.get(key);
    if (cached) return cached as LocationSearchResult[];

    const results = await this.options.photon.search(query, { limit, biasCoordinates });
    this.cache.set(key, results);
    return results;
  }

  async reverse(coordinates: Coordinates) {
    const key = `reverse:${this.coordinateKey(coordinates)}`;
    const cached = this.cache.get(key);
    if (cached) return cached as ReverseGeocodeResult;

    const result = await this.options.photon.reverse(coordinates);
    this.cache.set(key, result);
    return result;
  }

  async route(
    origin: Coordinates,
    destination: Coordinates,
    profile: string,
    alternatives = true,
  ): Promise<RouteResult[]> {
    this.validateProfile(profile);
    const key = `route:${JSON.stringify([
      profile,
      this.coordinateKey(origin),
      this.coordinateKey(destination),
      alternatives,
    ])}`;
    const cached = this.cache.get(key);
    if (cached) return cached as RouteResult[];

    const routes = await this.options.routing.route(origin, destination, { profile, alternatives });
    this.cache.set(key, routes, Math.min(this.options.cacheTtlSeconds, 60));
    return routes;
  }

  async matrix(
    sources: Coordinates[],
    destinations: Coordinates[],
    profile: string,
  ): Promise<MatrixResult> {
    this.validateProfile(profile);
    const key = `matrix:${JSON.stringify([
      profile,
      sources.map((point) => this.coordinateKey(point)),
      destinations.map((point) => this.coordinateKey(point)),
    ])}`;
    const cached = this.cache.get(key);
    if (cached) return cached as MatrixResult;

    const result = await this.options.routing.matrix(sources, destinations, profile);
    this.cache.set(key, result, Math.min(this.options.cacheTtlSeconds, 30));
    return result;
  }

  async eta(origin: Coordinates, destination: Coordinates, profile: string): Promise<EtaResult> {
    const [route] = await this.route(origin, destination, profile, false);
    if (!route) {
      throw new AppError(502, 'ROUTE_NOT_FOUND', 'No route was found for these locations.');
    }

    return {
      distanceMeters: route.distanceMeters,
      distanceKm: route.distanceKm,
      durationSeconds: route.durationSeconds,
      durationMinutes: route.durationMinutes,
      etaTimestamp: new Date(Date.now() + route.durationSeconds * 1000).toISOString(),
    };
  }

  private validateProfile(profile: string): void {
    if (!supportedRoutingProfileSet.has(profile)) {
      throw new AppError(400, 'UNSUPPORTED_ROUTING_PROFILE', 'The requested routing profile is not supported.');
    }
  }

  private coordinateKey(coordinates: Coordinates): string {
    return `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
  }
}
