import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Map } from '@maplibre/maplibre-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { LocationTarget } from '../src/location/types';
import { saveRecentLocation } from '../src/location/recentLocations';

const INITIAL_CENTER = {
  latitude: 17.385,
  longitude: 78.4867,
};

export default function LocationMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string }>();
  const target: LocationTarget = params.target === 'drop' ? 'drop' : 'pickup';
  const { selectLocation } = useLocationSelection();
  const [center, setCenter] = useState(INITIAL_CENTER);
  const [mapStyleUrl, setMapStyleUrl] = useState<string | null>(null);
  const [attribution, setAttribution] = useState('© OpenStreetMap contributors · OpenFreeMap');
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void customerApi.getMapConfig()
      .then((config) => {
        if (active) {
          setMapStyleUrl(config.tileStyleUrl);
          setAttribution(config.attribution);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Map configuration is unavailable.');
        setMapLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMessage(
        'OpenFreeMap did not finish loading. Check your internet connection and try again.',
      );
      setMapLoadError(true);
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [mapReady]);

  const confirmLocation = async () => {
    setConfirming(true);
    setMessage(null);
    try {
      const location = await customerApi.reverseGeocode(center.latitude, center.longitude);
      let saveFailed = false;
      try {
        await saveRecentLocation(location);
      } catch (error) {
        saveFailed = true;
        console.error('Could not save the selected map location to recent places.', error);
      }
      selectLocation(target, location);
      router.dismiss(2);
      if (saveFailed) {
        Alert.alert('Location selected', 'This location could not be saved to recent places.');
      }
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
        {mapStyleUrl ? (
          <Map
            mapStyle={mapStyleUrl}
            onDidFailLoadingMap={() => {
              setMessage('OpenFreeMap could not load. Check your internet connection and try again.');
              setMapLoadError(true);
            }}
            onDidFinishLoadingMap={() => {
              setMapReady(true);
              setMapLoadError(false);
              setMessage(null);
            }}
            onRegionDidChange={(event) => {
              const [longitude, latitude] = event.nativeEvent.center;
              setCenter({ latitude, longitude });
            }}
            style={StyleSheet.absoluteFill}
          >
            <Camera
              initialViewState={{
                center: [INITIAL_CENTER.longitude, INITIAL_CENTER.latitude],
                zoom: 13,
              }}
            />
          </Map>
        ) : null}
        {!mapReady && !mapLoadError ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color={colors.black} size="large" />
            <Text style={styles.mapLoadingText}>Loading OpenFreeMap…</Text>
          </View>
        ) : null}
        {!mapReady && mapLoadError ? (
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
        <Text style={styles.attribution}>© OpenStreetMap contributors · OpenFreeMap</Text>
      </View>

      <View style={styles.bottomPanel}>
        {message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        ) : null}
        <Text style={styles.helper}>
          The map starts near Hyderabad, not your GPS location. Move it to place the pin at your
          pickup or drop location.
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
  mapLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greyLight,
  },
  mapLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
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
