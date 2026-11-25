import { AppError } from '../errors/AppError.js';
import type {
  AddressComponents,
  BoundingBox,
  Coordinates,
  LocationSearchResult,
  ReverseGeocodeResult,
  SearchOptions,
} from './types.js';

interface PhotonProperties {
  osm_type?: string;
  osm_id?: number | string;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  extent?: number[];
}

interface PhotonFeature {
  geometry: { type: 'Point'; coordinates: number[] };
  properties?: PhotonProperties;
}

export interface PhotonClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSearchName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

function differsByAtMostOneCharacter(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return differences + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function isNearSearchName(query: string, name: string): boolean {
  const normalizedQuery = normalizeSearchName(query);
  const normalizedName = normalizeSearchName(name);
  return (
    normalizedName === normalizedQuery ||
    normalizedName.startsWith(normalizedQuery) ||
    (normalizedQuery.length >= 5 && differsByAtMostOneCharacter(normalizedQuery, normalizedName))
  );
}

function distanceMeters(first: Coordinates, second: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizeProperties(value: unknown): PhotonProperties {
  if (!isRecord(value)) return {};

  const osmId =
    typeof value.osm_id === 'number' && Number.isFinite(value.osm_id)
      ? value.osm_id
      : text(value.osm_id);
  const extent =
    Array.isArray(value.extent) &&
    value.extent.length === 4 &&
    value.extent.every((point) => typeof point === 'number' && Number.isFinite(point))
      ? value.extent
      : undefined;

  return {
    ...(text(value.osm_type) ? { osm_type: text(value.osm_type) } : {}),
    ...(osmId !== undefined ? { osm_id: osmId } : {}),
    ...(text(value.osm_key) ? { osm_key: text(value.osm_key) } : {}),
    ...(text(value.osm_value) ? { osm_value: text(value.osm_value) } : {}),
    ...(text(value.name) ? { name: text(value.name) } : {}),
    ...(text(value.street) ? { street: text(value.street) } : {}),
    ...(text(value.housenumber) ? { housenumber: text(value.housenumber) } : {}),
    ...(text(value.locality) ? { locality: text(value.locality) } : {}),
    ...(text(value.district) ? { district: text(value.district) } : {}),
    ...(text(value.city) ? { city: text(value.city) } : {}),
    ...(text(value.county) ? { county: text(value.county) } : {}),
    ...(text(value.state) ? { state: text(value.state) } : {}),
    ...(text(value.country) ? { country: text(value.country) } : {}),
    ...(text(value.postcode) ? { postcode: text(value.postcode) } : {}),
    ...(extent ? { extent } : {}),
  };
}

function addressParts(properties: PhotonProperties): string[] {
  const parts: string[] = [];
  const add = (value: string | undefined) => {
    if (value && !parts.includes(value)) parts.push(value);
  };

  add(properties.name);
  if (properties.housenumber && properties.street) {
    add(`${properties.housenumber} ${properties.street}`);
  } else {
    add(properties.street);
  }
  add(properties.locality);
  add(properties.district);
  add(properties.city);
  add(properties.state);
  add(properties.country);
  return parts;
}

function buildDisplayName(properties: PhotonProperties): string {
  return addressParts(properties).join(', ') || 'Unknown location';
}

function coordinatePlaceId(coordinates: Coordinates): string {
  return `coords-${coordinates.latitude.toFixed(5)}-${coordinates.longitude.toFixed(5)}`;
}

function providerPlaceId(properties: PhotonProperties, coordinates: Coordinates): string {
  return properties.osm_type && properties.osm_id
    ? `${properties.osm_type}${properties.osm_id}`
    : coordinatePlaceId(coordinates);
}

function components(properties: PhotonProperties): AddressComponents {
  return {
    ...(properties.name ? { name: properties.name } : {}),
    ...(properties.street ? { street: properties.street } : {}),
    ...(properties.locality ? { locality: properties.locality } : {}),
    ...(properties.district ? { district: properties.district } : {}),
    ...(properties.city ? { city: properties.city } : {}),
    ...(properties.state ? { state: properties.state } : {}),
    ...(properties.country ? { country: properties.country } : {}),
    ...(properties.postcode ? { postcode: properties.postcode } : {}),
  };
}

export class PhotonClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PhotonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
  }

  async search(query: string, searchOptions: SearchOptions = {}): Promise<LocationSearchResult[]> {
    const url = new URL(`${this.baseUrl}/api/`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', String(Math.min(Math.max(searchOptions.limit ?? 15, 1), 15)));
    if (searchOptions.biasCoordinates) {
      url.searchParams.set('lat', String(searchOptions.biasCoordinates.latitude));
      url.searchParams.set('lon', String(searchOptions.biasCoordinates.longitude));
      url.searchParams.set('zoom', '12');
      url.searchParams.set('location_bias_scale', '0.1');
    }
    url.searchParams.set('countrycode', 'IN');

    const data = await this.request(url, 'search');
    const results = data.features.flatMap((feature) => {
      if (!isRecord(feature) || !isRecord(feature.geometry)) return [];
      const coordinates = feature.geometry.coordinates;
      if (!isCoordinatePair(coordinates)) return [];

      const properties = normalizeProperties(feature.properties);
      const location = { latitude: coordinates[1], longitude: coordinates[0] };
      const displayName = buildDisplayName(properties);
      const name =
        properties.name ??
        properties.street ??
        properties.locality ??
        properties.city ??
        displayName.split(',')[0] ??
        'Unknown place';
      const extent =
        Array.isArray(properties.extent) &&
        properties.extent.length === 4 &&
        properties.extent.every((point) => typeof point === 'number' && Number.isFinite(point))
          ? (properties.extent as BoundingBox)
          : undefined;

      return [{
        id: providerPlaceId(properties, location),
        name,
        displayName,
        ...(properties.street ? { street: properties.street } : {}),
        ...(properties.locality ? { locality: properties.locality } : {}),
        ...(properties.district ? { district: properties.district } : {}),
        ...(properties.city ? { city: properties.city } : {}),
        ...(properties.county ? { county: properties.county } : {}),
        ...(properties.state ? { state: properties.state } : {}),
        ...(properties.country ? { country: properties.country } : {}),
        ...(properties.postcode ? { postcode: properties.postcode } : {}),
        ...(properties.osm_key ? { category: properties.osm_key } : {}),
        ...(properties.osm_value ? { type: properties.osm_value } : {}),
        coordinates: location,
        ...(extent ? { extent } : {}),
      }];
    });

    const bias = searchOptions.biasCoordinates;
    if (!bias) return results;

    const nearbyLocalities = results
      .map((result, index) => ({ result, index }))
      .filter(
        ({ result }) =>
          result.category === 'place' && isNearSearchName(query, result.name),
      )
      .sort(
        (first, second) =>
          distanceMeters(first.result.coordinates, bias) -
            distanceMeters(second.result.coordinates, bias) ||
          first.index - second.index,
      );
    if (nearbyLocalities.length === 0) return results;

    const prioritized = new Set(nearbyLocalities.map(({ result }) => result));
    return [
      ...nearbyLocalities.map(({ result }) => result),
      ...results.filter((result) => !prioritized.has(result)),
    ];
  }

  async reverse(coordinates: Coordinates): Promise<ReverseGeocodeResult> {
    const url = new URL(`${this.baseUrl}/reverse`);
    url.searchParams.set('lat', String(coordinates.latitude));
    url.searchParams.set('lon', String(coordinates.longitude));
    const data = await this.request(url, 'reverse');
    const feature = data.features.find(
      (candidate) =>
        isRecord(candidate) &&
        isRecord(candidate.geometry) &&
        isCoordinatePair(candidate.geometry.coordinates),
    );

    if (!feature) {
      const displayName = `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
      return {
        placeId: coordinatePlaceId(coordinates),
        displayName,
        formattedAddress: displayName,
        coordinates,
        components: {},
      };
    }

    const [longitude, latitude] = feature.geometry.coordinates;
    const location = { latitude, longitude };
    const properties = normalizeProperties(feature.properties);
    const formattedAddress = buildDisplayName(properties);
    return {
      placeId: providerPlaceId(properties, location),
      displayName: properties.name ?? properties.street ?? formattedAddress,
      formattedAddress,
      coordinates: location,
      components: components(properties),
    };
  }

  private async request(url: URL, operation: string): Promise<{ features: PhotonFeature[] }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RAVERO-Maps/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn('Map provider request failed.', {
          provider: 'photon',
          operation,
          failure: 'http',
          status: response.status,
        });
        throw new AppError(
          response.status === 429 ? 429 : 502,
          response.status === 429 ? 'MAPS_PROVIDER_RATE_LIMITED' : 'MAPS_PROVIDER_ERROR',
          response.status === 429
            ? 'Location provider is rate limiting requests. Please try again shortly.'
            : 'Location provider could not complete the request.',
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) throw new Error('MAPS_PROVIDER_TIMEOUT');
        console.warn('Map provider request failed.', {
          provider: 'photon',
          operation,
          failure: 'invalid-response',
        });
        throw new AppError(
          502,
          'MAPS_INVALID_PROVIDER_RESPONSE',
          'Location provider returned invalid data.',
        );
      }
      if (
        !isRecord(payload) ||
        payload.type !== 'FeatureCollection' ||
        !Array.isArray(payload.features)
      ) {
        console.warn('Map provider request failed.', {
          provider: 'photon',
          operation,
          failure: 'invalid-response',
        });
        throw new AppError(
          502,
          'MAPS_INVALID_PROVIDER_RESPONSE',
          'Location provider returned invalid data.',
        );
      }
      return payload as { features: PhotonFeature[] };
    } catch (error) {
      if (error instanceof AppError && !controller.signal.aborted) throw error;

      const timedOut =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError');
      console.warn('Map provider request failed.', {
        provider: 'photon',
        operation,
        failure: timedOut ? 'timeout' : 'network',
      });
      throw new AppError(
        timedOut ? 504 : 502,
        timedOut ? 'MAPS_PROVIDER_TIMEOUT' : 'MAPS_PROVIDER_UNAVAILABLE',
        timedOut ? 'Location provider request timed out.' : 'Location provider is currently unavailable.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
