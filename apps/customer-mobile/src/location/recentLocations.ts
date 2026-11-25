import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { RecentLocationReference, SelectedLocation } from './types';

const RECENT_LOCATIONS_KEY = 'ravero.location.recent-open-maps';
const LEGACY_RECENT_LOCATIONS_KEYS = [
  'ravero.location.recent-place-ids',
  'ravero.location.recent',
];
const MAX_RECENT_LOCATIONS = 8;

async function readValue(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(RECENT_LOCATIONS_KEY);
  }
  return SecureStore.getItemAsync(RECENT_LOCATIONS_KEY);
}

async function writeValue(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Local storage is unavailable.');
    window.localStorage.setItem(RECENT_LOCATIONS_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(RECENT_LOCATIONS_KEY, value);
}

async function removeLegacyValues(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      for (const key of LEGACY_RECENT_LOCATIONS_KEYS) window.localStorage.removeItem(key);
    }
    return;
  }
  await Promise.all(LEGACY_RECENT_LOCATIONS_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
}

export async function getRecentLocations(): Promise<RecentLocationReference[]> {
  await removeLegacyValues();
  const stored = await readValue();
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error('Saved recent locations have an invalid format.');
  }

  return parsed.filter(
    (location): location is RecentLocationReference =>
      typeof location === 'object' &&
      location !== null &&
      'placeId' in location &&
      typeof location.placeId === 'string' &&
      'query' in location &&
      typeof location.query === 'string' &&
      'label' in location &&
      typeof location.label === 'string' &&
      'address' in location &&
      typeof location.address === 'string' &&
      'latitude' in location &&
      typeof location.latitude === 'number' &&
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      'longitude' in location &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180,
  );
}

export async function saveRecentLocation(
  location: SelectedLocation,
  query = '',
): Promise<void> {
  if (!location.placeId) return;
  const current = await getRecentLocations();
  const next = [
    {
      placeId: location.placeId,
      query: query || location.label,
      label: location.label,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    ...current.filter((saved) => saved.placeId !== location.placeId),
  ].slice(0, MAX_RECENT_LOCATIONS);
  await writeValue(JSON.stringify(next));
}
