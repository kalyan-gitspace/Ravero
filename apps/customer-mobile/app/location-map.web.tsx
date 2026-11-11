import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { LocationTarget } from '../src/location/types';
import { saveRecentLocation } from '../src/location/recentLocations';

const INITIAL_CENTER = { latitude: 17.385, longitude: 78.4867 };
const MAP_CONTAINER_ID = 'ravero-google-map-container';
const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;

interface GoogleMapInstance {
  getCenter(): { lat: () => number; lng: () => number } | null;
}

interface GoogleMapsApi {
  maps: {
    Map: new (
      container: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        disableDefaultUI: boolean;
        gestureHandling: 'greedy';
      },
    ) => GoogleMapInstance;
    event: {
      addListener(
        instance: GoogleMapInstance,
        event: 'idle',
        handler: () => void,
      ): { remove: () => void };
    };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsApi;
    gm_authFailure?: () => void;
  }
}

let googleMapsApiPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMapsApi(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google) return Promise.resolve(window.google);
  if (googleMapsApiPromise) return googleMapsApiPromise;

  googleMapsApiPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('v', 'weekly');
    url.searchParams.set('loading', 'async');
    script.src = url.toString();
    script.async = true;
    script.dataset.raveroGoogleMaps = 'true';
    script.onload = () => {
      if (window.google) resolve(window.google);
      else reject(new Error('Google Maps JavaScript API loaded without its map library.'));
    };
    script.onerror = () => reject(new Error('Could not load Google Maps JavaScript API.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    googleMapsApiPromise = null;
    throw error;
  });

  return googleMapsApiPromise;
}

function isCoordinates(
  value: { latitude: number; longitude: number },
): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

export default function LocationMapWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string }>();
  const target: LocationTarget = params.target === 'drop' ? 'drop' : 'pickup';
  const { selectLocation } = useLocationSelection();
  const [center, setCenter] = useState(INITIAL_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Preparing Google Maps…');
  const mapRef = useRef<GoogleMapInstance | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_WEB_API_KEY) {
      setMessage(
        'Google Maps web key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY in apps/customer-mobile/.env and reload the web app.',
      );
      return;
    }

    let active = true;
    let idleListener: { remove: () => void } | undefined;
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!active) return;
      setMessage(
        'Google Maps rejected the web key. Verify Maps JavaScript API is enabled and the key allows this website origin.',
      );
      setMapReady(false);
    };

    const initializeMap = async () => {
      try {
        setLoadingMessage('Checking the Google Maps usage limit…');
        await customerApi.reserveDynamicMapLoad();
        if (!active) return;

        setLoadingMessage('Loading Google Maps…');
        const google = await loadGoogleMapsApi(GOOGLE_MAPS_WEB_API_KEY);
        if (!active) return;

        const container = document.getElementById(MAP_CONTAINER_ID);
        if (!container) throw new Error('Google Maps could not find its map container.');

        const map = new google.maps.Map(container, {
          center: { lat: INITIAL_CENTER.latitude, lng: INITIAL_CENTER.longitude },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        idleListener = google.maps.event.addListener(map, 'idle', () => {
          const mapCenter = map.getCenter();
          if (!mapCenter) return;
          const nextCenter = { latitude: mapCenter.lat(), longitude: mapCenter.lng() };
          if (isCoordinates(nextCenter)) setCenter(nextCenter);
        });
        setMapReady(true);
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Google Maps could not be initialized. Check the Maps JavaScript API key and network.',
          );
        }
      }
    };

    void initializeMap();
    return () => {
      active = false;
      idleListener?.remove();
      mapRef.current = null;
      window.gm_authFailure = previousAuthFailure;
    };
  }, []);

  const confirmLocation = async () => {
    setConfirming(true);
    setMessage(null);
    try {
      const location = await customerApi.reverseGeocode(center.latitude, center.longitude);
      try {
        await saveRecentLocation(location, 'Map location');
      } catch (error) {
        console.error('Could not save the selected map location to recent places.', error);
      }
      selectLocation(target, location);
      router.dismiss(2);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not verify the selected map location.',
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Icon icon={ArrowLeft} size={22} />
        </Pressable>
        <Text style={styles.title}>Set location on map</Text>
      </View>

      <View style={styles.mapArea}>
        {GOOGLE_MAPS_WEB_API_KEY ? (
          <View nativeID={MAP_CONTAINER_ID} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.mapUnavailable}>
            <Icon color={colors.textSecondary} icon={MapPin} size={30} />
            <Text style={styles.unavailableTitle}>Google Maps is not configured</Text>
            <Text style={styles.unavailableCopy}>
              Add a referrer-restricted Maps JavaScript API key to the customer web environment.
              No location has been selected.
            </Text>
          </View>
        )}
        {GOOGLE_MAPS_WEB_API_KEY && !mapReady && !message ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color={colors.black} size="large" />
            <Text style={styles.loadingText}>{loadingMessage}</Text>
          </View>
        ) : null}
        {GOOGLE_MAPS_WEB_API_KEY && !mapReady && message ? (
          <View pointerEvents="none" style={styles.mapUnavailable}>
            <Icon color={colors.textSecondary} icon={MapPin} size={30} />
            <Text style={styles.unavailableTitle}>Google Maps is unavailable</Text>
            <Text style={styles.unavailableCopy}>{message}</Text>
          </View>
        ) : null}
        {mapReady ? (
          <View pointerEvents="none" style={styles.centerMarker}>
            <Icon color={colors.black} icon={MapPin} size={36} />
          </View>
        ) : null}
      </View>

      <View style={styles.bottomPanel}>
        {message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        ) : null}
        <Text style={styles.helper}>
          {mapReady
            ? 'Move the map to place the pin at your pickup or drop location.'
            : 'Map confirmation stays disabled until Google Maps and usage tracking are ready.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!mapReady || confirming}
          onPress={() => void confirmLocation()}
          style={({ pressed }) => [
            styles.confirmButton,
            (!mapReady || confirming) && styles.confirmDisabled,
            pressed && mapReady && styles.pressed,
          ]}
        >
          {confirming ? <ActivityIndicator color={colors.white} /> : null}
          <Text style={styles.confirmText}>
            {confirming ? 'Verifying location…' : 'Confirm location'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    color: colors.black,
    fontSize: 20,
    fontWeight: '700',
  },
  mapArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.greyLight,
  },
  mapUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  unavailableTitle: {
    marginTop: spacing.md,
    color: colors.black,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  unavailableCopy: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  mapLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greyLight,
  },
  loadingText: {
    maxWidth: 300,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
  },
  centerMarker: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -34,
  },
  bottomPanel: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  helper: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    marginBottom: spacing.sm,
    color: '#A00000',
    fontSize: 12,
    lineHeight: 18,
  },
  confirmButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  confirmDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
