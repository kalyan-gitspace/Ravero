export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type BoundingBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export interface LocationSearchResult {
  id: string;
  name: string;
  displayName: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  category?: string;
  type?: string;
  coordinates: Coordinates;
  extent?: BoundingBox;
}

export interface AddressComponents {
  name?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

export interface ReverseGeocodeResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  coordinates: Coordinates;
  components: AddressComponents;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [longitude: number, latitude: number][];
}

export interface RouteStep {
  instruction?: string;
  distanceMeters: number;
  durationSeconds: number;
  name?: string;
}

export interface RouteResult {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  geometry: RouteGeometry;
  bbox?: BoundingBox;
  steps?: RouteStep[];
  profile: string;
  fareRouteToken?: string;
}

export interface MatrixResult {
  durations: (number | null)[][];
  distances: (number | null)[][];
  sources: Coordinates[];
  destinations: Coordinates[];
}

export interface EtaResult {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  etaTimestamp: string;
}

export interface MapConfig {
  tileStyleUrl: string;
  attribution: string;
  defaultCenter: Coordinates;
  defaultZoom: number;
  routingProfile: string;
  supportedProfiles: string[];
}

export interface SearchOptions {
  limit?: number;
  biasCoordinates?: Coordinates;
}

export interface RouteOptions {
  profile: string;
  alternatives?: boolean;
}
