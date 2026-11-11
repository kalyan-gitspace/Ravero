import { ArrowLeft, Crosshair, MapPin, Search, X } from 'lucide-react-native';
import type { ComponentRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { LocationSuggestion, SelectedLocation } from '../src/api/types';
import type { LocationTarget, RecentLocationReference } from '../src/location/types';
import { getRecentLocations, saveRecentLocation } from '../src/location/recentLocations';

function createSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Could not load locations. Please try again.';
}

export default function LocationSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string; placeId?: string; query?: string }>();
  const target: LocationTarget = params.target === 'drop' ? 'drop' : 'pickup';
  const { selectLocation } = useLocationSelection();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const sessionToken = useRef(createSessionToken());
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [recent, setRecent] = useState<RecentLocationReference[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    void getRecentLocations()
      .then(setRecent)
      .catch((error: unknown) => setMessage(getErrorMessage(error)));
    return () => {
      clearTimeout(focusTimer);
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const currentRequestId = ++requestId.current;
    const timer = setTimeout(() => {
      setLoadingSuggestions(true);
      setMessage(null);
      void customerApi
        .autocompletePlaces(text, sessionToken.current)
        .then((results) => {
          if (currentRequestId === requestId.current) setSuggestions(results);
        })
        .catch((error: unknown) => {
          if (currentRequestId !== requestId.current) return;
          setSuggestions([]);
          setMessage(getErrorMessage(error));
        })
        .finally(() => {
          if (currentRequestId === requestId.current) setLoadingSuggestions(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const completeSelection = useCallback(
    async (location: SelectedLocation, recentQuery = '') => {
      Keyboard.dismiss();
      let saveFailed = false;
      try {
        await saveRecentLocation(location, recentQuery);
        setRecent(await getRecentLocations());
      } catch (error) {
        saveFailed = true;
        console.error('Could not save the selected location to recent places.', error);
      }

      selectLocation(target, location);
      router.back();
      if (saveFailed) {
        Alert.alert('Location selected', 'This location could not be saved to recent places.');
      }
    },
    [router, selectLocation, target],
  );

  const selectRecentLocation = async (location: RecentLocationReference) => {
    setResolvingPlaceId(location.placeId);
    setMessage(null);
    try {
      const selectedLocation = await customerApi.getPlaceDetails(
        location.placeId,
        undefined,
        location.query || 'Recent location',
      );
      await completeSelection(selectedLocation, location.query);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setResolvingPlaceId(null);
    }
  };

  useEffect(() => {
    if (typeof params.placeId !== 'string') return;

    let active = true;
    const recentQuery = typeof params.query === 'string' ? params.query : '';
    setResolvingPlaceId(params.placeId);
    setMessage(null);
    void customerApi
      .getPlaceDetails(params.placeId, undefined, recentQuery || 'Recent location')
      .then((location) => {
        if (active) return completeSelection(location, recentQuery);
      })
      .catch((error: unknown) => {
        if (active) setMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setResolvingPlaceId(null);
      });

    return () => {
      active = false;
    };
  }, [completeSelection, params.placeId, params.query]);

  const selectSuggestion = async (suggestion: LocationSuggestion) => {
    setResolvingPlaceId(suggestion.placeId);
    setMessage(null);
    try {
      const location = await customerApi.getPlaceDetails(
        suggestion.placeId,
        sessionToken.current,
        suggestion.primaryText,
      );
      sessionToken.current = createSessionToken();
      await completeSelection(location, query.trim());
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setResolvingPlaceId(null);
    }
  };

  const selectCurrentLocation = async () => {
    setLocating(true);
    setMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage(
          permission.canAskAgain
            ? 'Allow location access to use your current position, or search for a place.'
            : 'Location access is disabled. Enable it in device settings or search for a place.',
        );
        return;
      }

      let timeout: ReturnType<typeof setTimeout> | undefined;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error('Could not determine your location. Please try again or search for a place.'),
              ),
            15_000,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      const location = await customerApi.reverseGeocode(
        position.coords.latitude,
        position.coords.longitude,
      );
      await completeSelection(location, query.trim());
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const sectionsVisible = query.trim().length < 2;
  const noResults = query.trim().length >= 2 && !loadingSuggestions && suggestions.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          style={styles.backButton}
        >
          <Icon icon={ArrowLeft} size={22} />
        </Pressable>
        <Text style={styles.title}>
          {target === 'pickup' ? 'Choose pickup' : 'Choose drop location'}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Icon color={colors.textSecondary} icon={Search} size={19} />
        <TextInput
          ref={inputRef}
          accessibilityLabel={target === 'pickup' ? 'Search pickup location' : 'Search drop location'}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onChangeText={(text) => {
            setQuery(text);
            setMessage(null);
          }}
          placeholder="Search a place, road, landmark..."
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.black}
          style={styles.searchInput}
          value={query}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel="Clear search"
            onPress={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            style={styles.clearButton}
          >
            <Icon color={colors.textSecondary} icon={X} size={18} />
          </Pressable>
        ) : null}
      </View>

      {message ? (
        <View accessibilityRole="alert" style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.results}
      >
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.results}
        >
          {sectionsVisible ? (
            <>
            <Pressable
              accessibilityRole="button"
              disabled={locating}
              onPress={() => void selectCurrentLocation()}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.currentIcon}>
                {locating ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : (
                  <Icon icon={Crosshair} size={20} />
                )}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Current location</Text>
                <Text style={styles.rowSubtitle}>
                  {locating ? 'Finding and verifying your location…' : 'Use your device GPS'}
                </Text>
              </View>
            </Pressable>

              {recent.length > 0 ? (
                <>
                <Text style={styles.sectionTitle}>Recent searches</Text>
                {recent.map((location, index) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={resolvingPlaceId !== null}
                    key={`${location.placeId}-${index}`}
                    onPress={() => void selectRecentLocation(location)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <View style={styles.placeIcon}>
                      <Icon color={colors.textSecondary} icon={MapPin} size={18} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={styles.rowTitle}>
                        {location.query || 'Recent location'}
                      </Text>
                      <Text numberOfLines={1} style={styles.rowSubtitle}>
                        Tap to refresh place details
                      </Text>
                    </View>
                  </Pressable>
                ))}
                </>
              ) : (
                <Text style={styles.emptyState}>
                  No recent searches yet. Search for a place or use your current location.
                </Text>
              )}
            </>
          ) : null}

          {loadingSuggestions ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.black} />
              <Text style={styles.loadingText}>Searching places…</Text>
            </View>
          ) : null}

          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              disabled={resolvingPlaceId !== null}
              key={suggestion.placeId}
              onPress={() => void selectSuggestion(suggestion)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.placeIcon}>
                {resolvingPlaceId === suggestion.placeId ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : (
                  <Icon color={colors.textSecondary} icon={MapPin} size={18} />
                )}
              </View>
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {suggestion.primaryText}
                </Text>
                <Text numberOfLines={1} style={styles.rowSubtitle}>
                  {suggestion.secondaryText}
                </Text>
              </View>
            </Pressable>
          ))}

          {noResults ? (
            <Text style={styles.emptyState}>
              No matching places found. Try a nearby landmark or road.
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Keyboard.dismiss();
              router.push({ pathname: '/location-map', params: { target } });
            }}
            style={({ pressed }) => [styles.utilityRow, pressed && styles.pressed]}
          >
            <Text style={styles.utilityText}>Set location on map</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {!process.env.EXPO_PUBLIC_API_URL ? (
        <Text style={styles.footer}>
          Google Maps search is unavailable until the RAVERO backend and mapping credentials are configured.
        </Text>
      ) : null}
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
  searchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    color: colors.black,
    fontSize: 15,
  },
  clearButton: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.greyLight,
  },
  messageText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  results: {
    flex: 1,
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  currentIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.greyLight,
  },
  placeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.greyLight,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyState: {
    paddingVertical: spacing.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  utilityRow: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  utilityText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.65,
  },
});
