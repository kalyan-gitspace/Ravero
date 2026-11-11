import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SelectedLocation } from './types';
import type { RecentLocationReference } from './types';

const RECENT_LOCATIONS_KEY = 'ravero.location.recent-place-ids';
const LEGACY_RECENT_LOCATIONS_KEY = 'ravero.location.recent';
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

async function removeLegacyValue(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(LEGACY_RECENT_LOCATIONS_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(LEGACY_RECENT_LOCATIONS_KEY);
}

export async function getRecentLocations(): Promise<RecentLocationReference[]> {
  await removeLegacyValue();
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
      typeof location.query === 'string',
  );
}

export async function saveRecentLocation(
  location: SelectedLocation,
  query = '',
): Promise<void> {
  if (!location.placeId) return;
  const current = await getRecentLocations();
  const next = [
    { placeId: location.placeId, query },
    ...current.filter((saved) => saved.placeId !== location.placeId),
  ].slice(0, MAX_RECENT_LOCATIONS);
  await writeValue(JSON.stringify(next));
}
