export const googleMapsSkus = [
  'AUTOCOMPLETE_REQUESTS',
  'PLACE_DETAILS_ESSENTIALS',
  'GEOCODING',
  'ROUTES_COMPUTE_ESSENTIALS',
  'DYNAMIC_MAPS_LOADS',
] as const;

export type GoogleMapsSku = (typeof googleMapsSkus)[number];

export interface GoogleMapsUsageRepository {
  reserveMonthlyUsage(sku: GoogleMapsSku, month: Date, monthlyLimit: number): Promise<boolean>;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GoogleMapsServiceOptions {
  apiKey?: string;
  monthlyLimits: Partial<Record<GoogleMapsSku, number>>;
  usageRepository: GoogleMapsUsageRepository;
  fetcher?: typeof fetch;
  now?: () => Date;
}
