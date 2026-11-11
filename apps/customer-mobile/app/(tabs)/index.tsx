import {
  Bell,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Navigation2,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Keyboard,
  Modal,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';
import { customerApi } from '../../src/api/client';
import type { BookingEstimate, BookingLocation, BookingRequest } from '../../src/api/types';
import { LocationPickerModal, places, type Place } from '../../components/home/LocationPickerModal';
import { QuickActionCard } from '../../components/home/QuickActionCard';
import { RecentPlaceRow } from '../../components/home/RecentPlaceRow';
import { RideCategoryCards, type RideCategory } from '../../components/home/RideCategoryCard';
import { SectionHeading } from '../../components/home/SectionHeading';
import { TitaniumCard } from '../../components/home/TitaniumCard';
import { getGreetingForTime } from '../../src/utils/greeting';

const quickActions = [
  { label: 'Multiple stops', icon: Plus, route: '/multi-stops' },
  { label: 'Schedule ride', icon: Clock3, route: '/schedule' },
  { label: 'Family booking', icon: UsersRound, route: '/family' },
  { label: 'Favourite places', icon: Heart, route: '/favourites' },
] as const;

const recentPlaces = [places[2], places[3], places[4]] satisfies Place[];

const LOCATION_PERMISSION_PROMPT_KEY = 'ravero.location.permission-prompted';

async function hasPromptedLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' &&
      window.localStorage.getItem(LOCATION_PERMISSION_PROMPT_KEY) === 'true';
  }
  return (await SecureStore.getItemAsync(LOCATION_PERMISSION_PROMPT_KEY)) === 'true';
}

async function markLocationPermissionPrompted(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCATION_PERMISSION_PROMPT_KEY, 'true');
    }
    return;
  }
  await SecureStore.setItemAsync(LOCATION_PERMISSION_PROMPT_KEY, 'true');
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    destination: destinationParam,
    stops: stopsParam,
    scheduledAt: scheduledAtParam,
  } = useLocalSearchParams<{ destination?: string; stops?: string; scheduledAt?: string }>();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    | 'checking'
    | 'needs-explanation'
    | 'requesting'
    | 'locating'
    | 'detected'
    | 'denied'
    | 'unavailable'
    | 'manual'
  >('checking');
  const [locationRationaleVisible, setLocationRationaleVisible] = useState(false);
  const [canOpenLocationSettings, setCanOpenLocationSettings] = useState(false);
  const [greeting, setGreeting] = useState(() => getGreetingForTime(new Date()));
  const manualPickupSelected = useRef(false);
  const locationLookupAttempted = useRef(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RideCategory>('Auto');
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [ridePreviewVisible, setRidePreviewVisible] = useState(false);
  const [bookingRequest, setBookingRequest] = useState<BookingRequest | null>(null);
  const [bookingEstimate, setBookingEstimate] = useState<BookingEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const [stops, setStops] = useState<BookingLocation[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string | undefined>();
  const updateCurrentLocation = useCallback(async () => {
    if (manualPickupSelected.current || locationLookupAttempted.current) return;
    locationLookupAttempted.current = true;
    setLocationStatus('locating');
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      const name = address?.district ?? address?.city ?? address?.region ?? address?.name;
      if (!address || !name) {
        setLocationStatus('unavailable');
        return;
      }

      const addressLine = [
        address.name,
        address.street,
        address.district,
        address.city,
        address.region,
        address.postalCode,
      ]
        .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
        .join(', ');

      if (manualPickupSelected.current) return;
      setPickup({ name, address: addressLine || name });
      setLocationStatus('detected');
    } catch {
      setLocationStatus('unavailable');
    }
  }, []);

  const checkLocationPermission = useCallback(async () => {
    if (manualPickupSelected.current) return;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        setCanOpenLocationSettings(false);
        await updateCurrentLocation();
        return;
      }

      locationLookupAttempted.current = false;
      setCanOpenLocationSettings(permission.canAskAgain === false);
      if (
        permission.canAskAgain &&
        !(await hasPromptedLocationPermission()) &&
        (Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'geolocation' in navigator))
      ) {
        setLocationStatus('needs-explanation');
        setLocationRationaleVisible(true);
      } else {
        const geolocationUnavailable =
          Platform.OS === 'web' &&
          (typeof navigator === 'undefined' || !('geolocation' in navigator));
        setLocationStatus(geolocationUnavailable ? 'unavailable' : 'denied');
      }
    } catch {
      const webGeolocationAvailable =
        Platform.OS === 'web' &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator;
      const promptWasShown = await hasPromptedLocationPermission().catch(() => true);
      if (webGeolocationAvailable && !promptWasShown) {
        setLocationStatus('needs-explanation');
        setLocationRationaleVisible(true);
      } else {
        setLocationStatus('unavailable');
      }
    }
  }, [updateCurrentLocation]);

  const requestLocationPermission = async () => {
    setLocationRationaleVisible(false);
    setLocationStatus('requesting');
    try {
      await markLocationPermissionPrompted();
      const permission = await Location.requestForegroundPermissionsAsync();
      setCanOpenLocationSettings(permission.canAskAgain === false);
      if (permission.granted) {
        await updateCurrentLocation();
      } else {
        setLocationStatus('denied');
      }
    } catch {
      setLocationStatus('unavailable');
    }
  };

  useEffect(() => {
    void checkLocationPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkLocationPermission();
    });
    return () => subscription.remove();
  }, [checkLocationPermission]);

  useEffect(() => {
    const refreshGreeting = () => setGreeting(getGreetingForTime(new Date()));
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextHour = () => {
      const now = new Date();
      const delay =
        (60 - now.getMinutes()) * 60_000 -
        now.getSeconds() * 1_000 -
        now.getMilliseconds() +
        50;
      timer = setTimeout(() => {
        refreshGreeting();
        scheduleNextHour();
      }, delay);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshGreeting();
        clearTimeout(timer);
        scheduleNextHour();
      }
    });
    scheduleNextHour();
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  const destinationMatches = useMemo(() => {
    const query = destinationQuery.trim().toLowerCase();
    if (!query) return [];
    return places
      .filter(
        (place) =>
          place.name.toLowerCase().includes(query) || place.address.toLowerCase().includes(query),
      )
      .slice(0, 3);
  }, [destinationQuery]);

  useEffect(() => {
    if (typeof destinationParam !== 'string') return;
    const place = places.find((candidate) => candidate.name === destinationParam);
    if (place) setDestination(place);
  }, [destinationParam]);

  useEffect(() => {
    if (typeof stopsParam !== 'string') return;
    try {
      const savedStops: unknown = JSON.parse(stopsParam);
      if (
        Array.isArray(savedStops) &&
        savedStops.length <= 3 &&
        savedStops.every(
          (stop): stop is string => typeof stop === 'string' && stop.trim().length > 0,
        )
      ) {
        setStops(savedStops.map((address) => ({ label: address, address })));
      }
    } catch {
      setBookingError('Could not load the saved stops. Please add them again.');
    }
  }, [stopsParam]);

  useEffect(() => {
    if (typeof scheduledAtParam === 'string') setScheduledAt(scheduledAtParam);
  }, [scheduledAtParam]);

  const openLocationPicker = () => setLocationPickerVisible(true);

  const selectDestination = (place: Place) => {
    setDestination(place);
    setDestinationQuery('');
    Keyboard.dismiss();
  };

  const handleReviewRide = () => {
    Keyboard.dismiss();
    if (!pickup) {
      setLocationPickerVisible(true);
      return;
    }

    let selectedDestination = destination;
    if (destination) {
      selectedDestination = destination;
    } else {
      const queryMatch = places.find(
        (place) =>
          place.name.toLowerCase() === destinationQuery.trim().toLowerCase() ||
          place.address.toLowerCase() === destinationQuery.trim().toLowerCase(),
      );
      if (queryMatch) {
        selectedDestination = queryMatch;
      } else {
        const customDestination = destinationQuery.trim();
        if (customDestination) {
          selectedDestination = { name: customDestination, address: customDestination };
        }
      }
    }
    if (!selectedDestination) return;

    setDestination(selectedDestination);
    setDestinationQuery('');
    const request: BookingRequest = {
      serviceTypeCode:
        selectedCategory === 'Auto'
          ? 'AUTO'
          : selectedCategory === 'Cab'
            ? 'CAB'
            : 'TWO_WHEELER',
      pickup: { label: pickup.name, address: pickup.address },
      dropoff: { label: selectedDestination.name, address: selectedDestination.address },
      stops,
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    setBookingRequest(request);
    setBookingEstimate(null);
    setBookingError(null);
    setEstimateLoading(true);
    setRidePreviewVisible(true);
    void customerApi
      .estimateBooking(request)
      .then(setBookingEstimate)
      .catch((error: unknown) => {
        setBookingError(error instanceof Error ? error.message : 'Could not load a fare estimate.');
      })
      .finally(() => setEstimateLoading(false));
  };

  const handleCreateBooking = async () => {
    if (!bookingRequest || !bookingEstimate || bookingLoading) return;
    idempotencyKey.current ??= `customer-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    setBookingLoading(true);
    setBookingError(null);
    try {
      await customerApi.createBooking(bookingRequest, idempotencyKey.current);
      idempotencyKey.current = null;
      setRidePreviewVisible(false);
      router.push('/(tabs)/bookings');
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Could not save this booking request.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image
            accessibilityLabel="RAVERO"
            resizeMode="contain"
            source={require('../../assets/branding/ravero-wordmark.png')}
            style={styles.brandLogo}
          />
          <Pressable
            accessibilityLabel="Choose pickup location"
            accessibilityRole="button"
            onPress={openLocationPicker}
            style={styles.locationButton}
          >
            <Icon color={colors.white} icon={MapPin} size={15} />
            <Text numberOfLines={1} style={styles.locationText}>
              {pickup?.name ??
                (locationStatus === 'locating' ? 'Finding location…' : 'Choose pickup')}
            </Text>
            <Icon color="#BDBDBD" icon={ChevronDown} size={14} />
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="Open notifications"
          accessibilityRole="button"
          onPress={() => router.push('/notifications')}
          style={styles.headerAction}
        >
          <Icon color={colors.white} icon={Bell} size={20} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.homeScroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 112 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {locationStatus === 'denied' || locationStatus === 'unavailable' ? (
          <View accessibilityRole="alert" style={styles.locationNotice}>
            <Text style={styles.locationNoticeText}>
              {locationStatus === 'denied'
                ? 'Location access is off. Choose a pickup manually or enable location in your browser or device settings.'
                : 'Current location is unavailable. Choose a pickup manually.'}
            </Text>
            {canOpenLocationSettings && Platform.OS !== 'web' ? (
              <Pressable onPress={() => void Linking.openSettings()}>
                <Text style={styles.locationSettingsLink}>Open device settings</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.greeting}>
          <Text style={styles.greetingLabel}>{greeting}</Text>
          <Text style={styles.headline}>Where are you{'\n'}going?</Text>
        </View>

        <View style={styles.bookingCard}>
          <View style={styles.fieldColumn}>
            <View style={styles.fieldMarkerColumn}>
              <View style={styles.pickupMarker} />
              <View style={styles.routeDashes} />
              <View style={styles.dropMarker} />
            </View>
            <View style={styles.fields}>
              <Pressable onPress={openLocationPicker} style={styles.pickupField}>
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>PICKUP</Text>
                  <Text numberOfLines={1} style={styles.fieldValue}>
                    {pickup?.name ?? 'Choose pickup'}
                    {pickup?.address ? (
                      <Text style={styles.addressInline}> · {pickup.address}</Text>
                    ) : null}
                  </Text>
                </View>
                <Icon color={colors.textSecondary} icon={ChevronRight} size={17} />
              </Pressable>
              <View style={styles.divider} />
              <View style={styles.destinationField}>
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>DROP</Text>
                  <TextInput
                    accessibilityLabel="Destination"
                    autoCapitalize="words"
                    onChangeText={(text) => {
                      setDestination(null);
                      setDestinationQuery(text);
                    }}
                    onFocus={() => {
                      if (destination) {
                        setDestinationQuery(destination.name);
                        setDestination(null);
                      }
                    }}
                    onSubmitEditing={handleReviewRide}
                    placeholder="Where to?"
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="search"
                    style={styles.destinationInput}
                    value={destination?.name ?? destinationQuery}
                  />
                </View>
                <Pressable
                  accessibilityLabel="Swap pickup and destination"
                  disabled={!destination || !pickup}
                  onPress={() => {
                    if (!destination || !pickup) return;
                    manualPickupSelected.current = true;
                    setPickup(destination);
                    setDestination(pickup);
                  }}
                  style={[styles.swapButton, (!destination || !pickup) && styles.swapDisabled]}
                >
                  <Icon
                    color={destination ? colors.black : '#AAAAAA'}
                    icon={ArrowDownUp}
                    size={17}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {destinationMatches.length > 0 ? (
            <View style={styles.suggestions}>
              {destinationMatches.map((place) => (
                <Pressable
                  key={place.name}
                  onPress={() => selectDestination(place)}
                  style={styles.suggestion}
                >
                  <View style={styles.suggestionIcon}>
                    <Icon color={colors.textSecondary} icon={MapPin} size={17} />
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text style={styles.suggestionName}>{place.name}</Text>
                    <Text numberOfLines={1} style={styles.suggestionAddress}>
                      {place.address}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeading title="Choose a ride category" />
          <RideCategoryCards selected={selectedCategory} onSelect={setSelectedCategory} />
          <Text style={styles.note}>
            Categories are for preview only. Availability and eligibility are subject to confirmation.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!destination && !destinationQuery.trim()}
          onPress={handleReviewRide}
          style={({ pressed }) => [
            styles.searchButton,
            (!destination && !destinationQuery.trim()) && styles.searchButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon color={colors.white} icon={Search} size={18} />
          <Text style={styles.searchButtonText}>Review ride</Text>
        </Pressable>

        <View style={styles.section}>
          <SectionHeading title="Make it yours" />
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <QuickActionCard
                icon={action.icon}
                key={action.label}
                label={action.label}
                onPress={() =>
                  router.push({
                    pathname: action.route,
                    params: {
                      ...(destination ? { destination: destination.name } : {}),
                      ...(stops.length > 0
                        ? { stops: JSON.stringify(stops.map((stop) => stop.address)) }
                        : {}),
                      ...(scheduledAt ? { scheduledAt } : {}),
                    },
                  })
                }
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading
            action="See all"
            onAction={() => router.push('/favourites')}
            title="Recent places"
          />
          <View style={styles.recentList}>
            {recentPlaces.map((place) => (
              <RecentPlaceRow
                key={place.name}
                onPress={() => selectDestination(place)}
                place={place}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TitaniumCard onPress={() => router.push('/(tabs)/rewards')} />
        </View>
        <Text style={styles.footerNote}>
          Booking requests are saved for development review. No routing, driver matching, payment, or dispatch is connected.
        </Text>
      </ScrollView>

      <LocationPickerModal
        onClose={() => setLocationPickerVisible(false)}
        onSelect={(place) => {
          manualPickupSelected.current = true;
          setPickup(place);
          setLocationStatus('manual');
          setLocationPickerVisible(false);
        }}
        title="Choose pickup"
        visible={locationPickerVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => {
          void markLocationPermissionPrompted().catch(() => setLocationStatus('unavailable'));
          setLocationRationaleVisible(false);
          setLocationStatus('denied');
        }}
        transparent
        visible={locationRationaleVisible}
      >
        <View style={styles.locationRationaleScrim}>
          <View style={styles.locationRationaleCard}>
            <Text style={styles.locationRationaleTitle}>Use your current location?</Text>
            <Text style={styles.locationRationaleCopy}>
              RAVERO uses your location while the app is open to suggest a pickup in this header.
              Your coordinates are not sent to RAVERO servers just to display this location.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void requestLocationPermission()}
              style={styles.locationRationalePrimary}
            >
              <Text style={styles.locationRationalePrimaryText}>Continue</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void markLocationPermissionPrompted().catch(() => setLocationStatus('unavailable'));
                setLocationRationaleVisible(false);
                setLocationStatus('denied');
              }}
              style={styles.locationRationaleSecondary}
            >
              <Text style={styles.locationRationaleSecondaryText}>Choose pickup manually</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setRidePreviewVisible(false)}
        transparent
        visible={ridePreviewVisible}
      >
        <View style={styles.previewScrim}>
          <View style={styles.previewCard}>
            <View style={styles.previewIcon}>
              <Icon icon={Navigation2} size={21} />
            </View>
            <Text style={styles.previewTitle}>Your ride preview</Text>
            <Text style={styles.previewSubtitle}>Review the request details before saving.</Text>
            <View style={styles.previewRoute}>
              <Text style={styles.previewLabel}>FROM</Text>
              <Text style={styles.previewValue}>{pickup?.name ?? 'Pickup not selected'}</Text>
              <View style={styles.previewDivider} />
              <Text style={styles.previewLabel}>TO</Text>
              <Text style={styles.previewValue}>{destination?.name ?? destinationQuery}</Text>
            </View>
            <View style={styles.previewCategory}>
              <Text style={styles.previewLabel}>CATEGORY</Text>
              <Text style={styles.previewValue}>{selectedCategory}</Text>
            </View>
            {stops.length > 0 || scheduledAt ? (
              <View style={styles.previewOptions}>
                {stops.length > 0 ? (
                  <Text style={styles.previewOptionText}>
                    {stops.length} additional {stops.length === 1 ? 'stop' : 'stops'}
                  </Text>
                ) : null}
                {scheduledAt ? (
                  <Text style={styles.previewOptionText}>
                    Scheduled · {new Date(scheduledAt).toLocaleString('en-IN')}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.farePanel}>
              <Text style={styles.previewLabel}>DEVELOPMENT FARE ESTIMATE</Text>
              {estimateLoading ? (
                <Text style={styles.fareValue}>Calculating…</Text>
              ) : bookingEstimate ? (
                <Text style={styles.fareValue}>
                  {bookingEstimate.currency} {bookingEstimate.totalAmount.toFixed(2)}
                </Text>
              ) : null}
              <Text style={styles.fareDisclaimer}>
                Base fare only. Route distance, duration, availability, and final fare are not calculated.
              </Text>
            </View>
            <Text style={styles.previewDisclaimer}>
              Saving creates a pending development request only. No driver is notified and no ride is dispatched.
            </Text>
            {bookingError ? <Text style={styles.bookingError}>{bookingError}</Text> : null}
            <Pressable
              disabled={estimateLoading || !bookingEstimate || bookingLoading}
              onPress={() => void handleCreateBooking()}
              style={({ pressed }) => [
                styles.previewButton,
                (estimateLoading || !bookingEstimate || bookingLoading) && styles.previewButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.previewButtonText}>
                {bookingLoading ? 'Saving…' : 'Save booking request'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRidePreviewVisible(false)}
              style={({ pressed }) => [styles.previewCancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.previewCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  homeScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.black,
  },
  brandWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandLogo: {
    width: 108,
    height: 24,
  },
  locationButton: {
    flex: 1,
    minWidth: 0,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
  },
  locationText: {
    flexShrink: 1,
    color: '#E5E5E5',
    fontSize: 12,
    fontWeight: '500',
  },
  headerAction: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginLeft: spacing.sm,
  },
  locationNotice: {
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  locationNoticeText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  locationSettingsLink: {
    marginTop: spacing.sm,
    color: colors.black,
    fontSize: 12,
    fontWeight: '700',
  },
  locationRationaleScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  locationRationaleCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
  },
  locationRationaleTitle: {
    color: colors.black,
    fontSize: 20,
    fontWeight: '700',
  },
  locationRationaleCopy: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  locationRationalePrimary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  locationRationalePrimaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  locationRationaleSecondary: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  locationRationaleSecondaryText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  greeting: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  greetingLabel: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  headline: {
    color: colors.black,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 39,
  },
  bookingCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
  },
  fieldColumn: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
  },
  fieldMarkerColumn: {
    width: 14,
    alignItems: 'center',
    paddingTop: 23,
    paddingBottom: 20,
  },
  pickupMarker: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: colors.black,
    borderRadius: 5,
  },
  routeDashes: {
    height: 28,
    marginVertical: 3,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B8B8B8',
  },
  dropMarker: {
    width: 9,
    height: 9,
    backgroundColor: colors.black,
  },
  fields: {
    flex: 1,
  },
  pickupField: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldCopy: {
    flex: 1,
  },
  fieldLabel: {
    marginBottom: 4,
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  fieldValue: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  addressInline: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  destinationField: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  destinationInput: {
    minHeight: 27,
    padding: 0,
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  swapButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  swapDisabled: {
    backgroundColor: colors.greyLight,
  },
  suggestions: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  suggestionIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.greyLight,
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionName: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionAddress: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  section: {
    marginTop: spacing.xl,
  },
  note: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
  },
  searchButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  searchButtonDisabled: {
    opacity: 0.4,
  },
  searchButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recentList: {
    marginTop: -spacing.sm,
  },
  footerNote: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 11,
  },
  previewScrim: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
  },
  previewIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.greyLight,
  },
  previewTitle: {
    marginTop: spacing.md,
    color: colors.black,
    fontSize: 21,
    fontWeight: '700',
  },
  previewSubtitle: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
  },
  previewRoute: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  previewValue: {
    marginTop: 3,
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  previewCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  previewDisclaimer: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  farePanel: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  previewOptions: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  previewOptionText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  fareValue: {
    marginTop: spacing.xs,
    color: colors.black,
    fontSize: 20,
    fontWeight: '700',
  },
  fareDisclaimer: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  bookingError: {
    marginTop: spacing.md,
    color: colors.black,
    fontSize: 12,
    lineHeight: 17,
  },
  previewButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  previewButtonDisabled: {
    opacity: 0.45,
  },
  previewButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  previewCancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  previewCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
