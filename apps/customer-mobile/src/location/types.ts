export type LocationTarget = 'pickup' | 'drop';

export interface SelectedLocation {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export interface RecentLocationReference {
  placeId: string;
  query: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface LocationSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}
