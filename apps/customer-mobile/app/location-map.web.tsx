import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Map as MapLibreGLMap } from 'maplibre-gl';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { configureWebMapLibreWorker } from '../components/maps/configureWebMapLibreWorker';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { LocationTarget } from '../src/location/types';
import { saveRecentLocation } from '../src/location/recentLocations';

const INITIAL_CENTER = { latitude: 17.385, longitude: 78.4867 };
const MAP_CONTAINER_ID = 'ravero-maplibre-map-container';

export default function LocationMapWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string }>();
  const target: LocationTarget = params.target === 'drop' ? 'drop' : 'pickup';
  const { selectLocation } = useLocationSelection();
  const [center, setCenter] = useState(INITIAL_CENTER);
  const [attribution, setAttribution] = useState('© OpenStreetMap contributors · OpenFreeMap');
  const [mapReady, setMapReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let styleLoaded = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let map: MapLibreGLMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    void customerApi.getMapConfig()
      .then((config) => {
        if (!active) return;
        const container = document.getElementById(MAP_CONTAINER_ID);
        if (!container) throw new Error('OpenFreeMap could not find its map container.');

        setAttribution(config.attribution);
        configureWebMapLibreWorker();
        map = new MapLibreGLMap({
          container,
          style: config.tileStyleUrl,
          center: [config.defaultCenter.longitude, config.defaultCenter.latitude],
          zoom: config.defaultZoom,
        });
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map?.resize());
          resizeObserver.observe(container);
        }
        timeout = setTimeout(() => {
          if (active && !styleLoaded) {
            setMessage('OpenFreeMap did not finish loading. Check your internet connection and try again.');
          }
        }, 20_000);
        map.once('load', () => {
          styleLoaded = true;
          if (timeout) clearTimeout(timeout);
          if (active) {
            setMessage(null);
            setMapReady(true);
          }
        });
        map.on('moveend', () => {
          if (!map) return;
          const { lat, lng } = map.getCenter();
          setCenter({ latitude: lat, longitude: lng });
        });
        map.on('error', (event) => {
          if (active && !styleLoaded) {
            if (timeout) clearTimeout(timeout);
            setMessage(event.error.message);
          }
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : 'Map configuration is unavailable.',
          );
        }
      });

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      resizeObserver?.disconnect();
      map?.remove();
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
        <View nativeID={MAP_CONTAINER_ID} style={StyleSheet.absoluteFill} />
        {!mapReady && !message ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color={colors.black} size="large" />
            <Text style={styles.loadingText}>Loading OpenFreeMap…</Text>
          </View>
        ) : null}
        {!mapReady && message ? (
          <View pointerEvents="none" style={styles.mapUnavailable}>
            <Icon color={colors.textSecondary} icon={MapPin} size={30} />
            <Text style={styles.unavailableTitle}>OpenFreeMap is unavailable</Text>
            <Text style={styles.unavailableCopy}>{message}</Text>
          </View>
        ) : null}
        {mapReady ? (
          <View pointerEvents="none" style={styles.centerMarker}>
            <Icon color={colors.black} icon={MapPin} size={36} />
          </View>
        ) : null}
        <Text style={styles.attribution}>{attribution}</Text>
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
            : 'Map confirmation stays disabled until OpenFreeMap is ready.'}
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
  attribution: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    color: colors.textSecondary,
    fontSize: 9,
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
