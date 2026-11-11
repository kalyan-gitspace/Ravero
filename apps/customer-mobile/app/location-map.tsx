import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { LocationTarget } from '../src/location/types';
import { saveRecentLocation } from '../src/location/recentLocations';

const INITIAL_REGION: Region = {
  latitude: 17.385,
  longitude: 78.4867,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

function isMapsConfigured(): boolean {
  if (Platform.OS === 'android') {
    return Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY);
  }
  if (Platform.OS === 'ios') {
    return Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY);
  }
  return false;
}

export default function LocationMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string }>();
  const target: LocationTarget = params.target === 'drop' ? 'drop' : 'pickup';
  const { selectLocation } = useLocationSelection();
  const [region, setRegion] = useState(INITIAL_REGION);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapsConfigured = isMapsConfigured();

  useEffect(() => {
    if (!mapsConfigured || mapReady) return;

    const timeout = setTimeout(() => {
      setMessage(
        'Google Maps did not finish loading. Verify the Maps SDK is enabled, billing is active, and this key is restricted to the app identifier and signing certificate.',
      );
      setMapLoadError(true);
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [mapReady, mapsConfigured]);

  const confirmLocation = async () => {
    setConfirming(true);
    setMessage(null);
    try {
      const location = await customerApi.reverseGeocode(region.latitude, region.longitude);
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
        {mapsConfigured ? (
          <MapView
            initialRegion={INITIAL_REGION}
            onMapReady={() => setMapReady(true)}
            onRegionChangeComplete={setRegion}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.mapUnavailable}>
            <Icon color={colors.textSecondary} icon={MapPin} size={30} />
            <Text style={styles.unavailableTitle}>Google Maps is not configured</Text>
            <Text style={styles.unavailableCopy}>
              Add a platform-restricted Maps SDK key to the customer app environment, rebuild the
              native app, and try again. No location has been selected.
            </Text>
          </View>
        )}
        {mapsConfigured && !mapReady ? (
          mapLoadError ? (
            <View pointerEvents="none" style={styles.mapUnavailable}>
              <Icon color={colors.textSecondary} icon={MapPin} size={30} />
              <Text style={styles.unavailableTitle}>Google Maps failed to load</Text>
              <Text style={styles.unavailableCopy}>
                Verify the API key, enabled SDK, billing, app identifier and signing-certificate
                restrictions.
              </Text>
            </View>
          ) : (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator color={colors.black} size="large" />
              <Text style={styles.mapLoadingText}>Loading Google Maps…</Text>
            </View>
          )
        ) : null}
        {mapsConfigured && mapReady ? (
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
          {mapsConfigured
            ? 'The map starts near Hyderabad, not your GPS location. Move it to place the pin at your pickup or drop location.'
            : 'Map selection is unavailable until Google Maps SDK configuration is complete.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!mapsConfigured || confirming}
          onPress={() => void confirmLocation()}
          style={({ pressed }) => [
            styles.confirmButton,
            (!mapsConfigured || confirming) && styles.confirmDisabled,
            pressed && mapsConfigured && styles.pressed,
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
