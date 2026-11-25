import {
  ArrowLeft,
  Bell,
  ArrowDownUp,
  ChevronRight,
  Clock3,
  Heart,
  Navigation2,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  Modal,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';
import { useLocationSelection } from '../../components/location/LocationSelectionContext';
import { RouteMap } from '../../components/maps/RouteMap';
import { customerApi } from '../../src/api/client';
import type {
  BookingEstimate,
  BookingLocation,
  BookingRequest,
  MapRoute,
} from '../../src/api/types';
import type {
  LocationTarget,
  RecentLocationReference,
} from '../../src/location/types';
import { getRecentLocations } from '../../src/location/recentLocations';
import { estimateSelectedRoute, loadRidePreview } from '../../src/booking/ridePreview';
import { QuickActionCard } from '../../components/home/QuickActionCard';
import { RecentPlaceRow } from '../../components/home/RecentPlaceRow';
import { ServiceCategoryGrid, type RideCategory } from '../../components/home/ServiceCategoryGrid';
import { SectionHeading } from '../../components/home/SectionHeading';
import { TitaniumCard } from '../../components/home/TitaniumCard';
import { getGreetingForTime } from '../../src/utils/greeting';

const quickActions = [
  { label: 'Multiple stops', icon: Plus, route: '/multi-stops' },
  { label: 'Schedule ride', icon: Clock3, route: '/schedule' },
  { label: 'Family booking', icon: UsersRound, route: '/family' },
  { label: 'Favourite places', icon: Heart, route: '/favourites' },
] as const;

function parseRouteParams(
  stopsParam: string | string[] | undefined,
  scheduledAtParam: string | string[] | undefined,
): {
  stops: BookingLocation[] | null;
  scheduledAt: string | undefined;
  error: string | null;
} {
  let stops: BookingLocation[] | null = null;
  let error: string | null = null;
  if (typeof stopsParam === 'string') {
    try {
      const savedStops: unknown = JSON.parse(stopsParam);
      if (
        Array.isArray(savedStops) &&
        savedStops.length <= 3 &&
        savedStops.every(
          (stop): stop is string => typeof stop === 'string' && stop.trim().length > 0,
        )
      ) {
        stops = savedStops.map((address) => ({ label: address, address }));
      }
    } catch {
      error = 'Could not load the saved stops. Please add them again.';
    }
  }
  return {
    stops,
    scheduledAt: typeof scheduledAtParam === 'string' ? scheduledAtParam : undefined,
    error,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stops: stopsParam, scheduledAt: scheduledAtParam } =
    useLocalSearchParams<{ stops?: string; scheduledAt?: string }>();
  const { pickup, drop, selectLocation, swapLocations } = useLocationSelection();
  const routeParams = useMemo(
    () => parseRouteParams(stopsParam, scheduledAtParam),
    [scheduledAtParam, stopsParam],
  );
  const [greeting, setGreeting] = useState(() => getGreetingForTime(new Date()));
  const [recentPlaces, setRecentPlaces] = useState<RecentLocationReference[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<RideCategory>('Auto');
  const [ridePreviewVisible, setRidePreviewVisible] = useState(false);
  const [bookingRequest, setBookingRequest] = useState<BookingRequest | null>(null);
  const [bookingEstimate, setBookingEstimate] = useState<BookingEstimate | null>(null);
  const [estimateRouteToken, setEstimateRouteToken] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [routeSummary, setRouteSummary] = useState<{
    distanceKm: number;
    durationMinutes: number;
  } | null>(null);
  const [routeOptions, setRouteOptions] = useState<MapRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [mapPreviewVisible, setMapPreviewVisible] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(routeParams.error);
  const idempotencyKey = useRef<string | null>(null);
  const routeRequestId = useRef(0);
  const fareRequestId = useRef(0);
  const [stops, setStops] = useState<BookingLocation[]>(routeParams.stops ?? []);
  const [scheduledAt, setScheduledAt] = useState<string | undefined>(routeParams.scheduledAt);
  const [recentPlacesError, setRecentPlacesError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    void getRecentLocations()
      .then((locations) => {
        if (active) {
          setRecentPlaces(locations);
          setRecentPlacesError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRecentPlacesError(
            error instanceof Error ? error.message : 'Could not load recent locations.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [pickup, drop]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (routeParams.stops) setStops(routeParams.stops);
      if (routeParams.scheduledAt) setScheduledAt(routeParams.scheduledAt);
      if (routeParams.error) setBookingError(routeParams.error);
    });
  }, [routeParams]);

  const openLocationPicker = (target: LocationTarget) => {
    Keyboard.dismiss();
    router.push({ pathname: '/location-search', params: { target } });
  };

  const handleReviewRide = () => {
    Keyboard.dismiss();
    if (!pickup || !drop) {
      return;
    }

    const serviceTypeCodes: Record<RideCategory, BookingRequest['serviceTypeCode']> = {
      Auto: 'AUTO',
      Cab: 'CAB',
      'Two-wheeler': 'TWO_WHEELER',
      Rentals: 'RENTALS',
      Package: 'PACKAGE',
      Schedule: 'SCHEDULE',
      Transport: 'TRANSPORT',
      Machinery: 'MACHINERY',
      Outstation: 'OUTSTATION',
    };
    const serviceTypeCode = serviceTypeCodes[selectedCategory];
    const request: BookingRequest = {
      serviceTypeCode,
      pickup: {
        label: pickup.label,
        address: pickup.address,
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        ...(pickup.placeId ? { placeId: pickup.placeId } : {}),
      },
      dropoff: {
        label: drop.label,
        address: drop.address,
        latitude: drop.latitude,
        longitude: drop.longitude,
        ...(drop.placeId ? { placeId: drop.placeId } : {}),
      },
      stops,
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    setBookingRequest(request);
    setBookingEstimate(null);
    setEstimateRouteToken(null);
    setBookingError(null);
    setRouteSummary(null);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setMapPreviewVisible(false);
    setRouteError(null);
    setRouteLoading(true);
    const routeRequest = ++routeRequestId.current;
    fareRequestId.current += 1;
    setEstimateLoading(true);
    setRidePreviewVisible(true);
    void loadRidePreview(customerApi, request, (routes) => {
      if (routeRequest !== routeRequestId.current) return;
      setRouteOptions(routes);
      setSelectedRouteIndex(0);
      setRouteSummary({
        distanceKm: routes[0].distanceKm,
        durationMinutes: routes[0].durationMinutes,
      });
      setRouteLoading(false);
    })
      .then((result) => {
        if (routeRequest !== routeRequestId.current) return;
        if (result.ok) {
          setBookingEstimate(result.estimate);
          setEstimateRouteToken(result.fareRouteToken);
          return;
        }

        const message = result.error instanceof Error
          ? result.error.message
          : result.step === 'route'
            ? 'Could not calculate the route.'
            : 'Could not load a fare estimate.';
        if (result.step === 'route') setRouteError(message);
        else setBookingError(message);
      })
      .finally(() => {
        if (routeRequest !== routeRequestId.current) return;
        setRouteLoading(false);
        setEstimateLoading(false);
      });
  };

  const handleSelectRoute = (index: number) => {
    const route = routeOptions[index];
    if (!route || !bookingRequest) return;

    setSelectedRouteIndex(index);
    setRouteSummary({
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
    });
    setBookingEstimate(null);
    setEstimateRouteToken(null);
    setBookingError(null);
    setEstimateLoading(true);
    const fareRequest = ++fareRequestId.current;

    void estimateSelectedRoute(customerApi, bookingRequest, route)
      .then((estimate) => {
        if (fareRequest !== fareRequestId.current) return;
        setBookingEstimate(estimate);
        setEstimateRouteToken(route.fareRouteToken);
      })
      .catch((error: unknown) => {
        if (fareRequest !== fareRequestId.current) return;
        setBookingError(error instanceof Error ? error.message : 'Could not load a fare estimate.');
      })
      .finally(() => {
        if (fareRequest === fareRequestId.current) setEstimateLoading(false);
      });
  };

  const handleCreateBooking = async () => {
    const selectedRoute = routeOptions[selectedRouteIndex];
    if (
      !bookingRequest ||
      !bookingEstimate ||
      !selectedRoute ||
      estimateRouteToken !== selectedRoute.fareRouteToken ||
      !routeSummary ||
      routeLoading ||
      estimateLoading ||
      routeError ||
      bookingLoading
    ) return;
    idempotencyKey.current ??= `customer-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    setBookingLoading(true);
    setBookingError(null);
    try {
      await customerApi.createBooking(
        bookingRequest,
        selectedRoute.fareRouteToken,
        idempotencyKey.current,
      );
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
              <Pressable
                accessibilityRole="button"
                onPress={() => openLocationPicker('pickup')}
                style={styles.pickupField}
              >
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>PICKUP</Text>
                  <Text numberOfLines={1} style={styles.fieldValue}>
                    {pickup?.label ?? 'Choose pickup'}
                    {pickup?.address ? (
                      <Text style={styles.addressInline}> · {pickup.address}</Text>
                    ) : null}
                  </Text>
                </View>
                <Icon color={colors.textSecondary} icon={ChevronRight} size={17} />
              </Pressable>
              <View style={styles.divider} />
              <View style={styles.destinationField}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openLocationPicker('drop')}
                  style={styles.fieldCopy}
                >
                  <Text style={styles.fieldLabel}>DROP</Text>
                  <Text numberOfLines={1} style={styles.destinationInput}>
                    {drop?.label ?? 'Where to?'}
                    {drop?.address ? (
                      <Text style={styles.addressInline}> · {drop.address}</Text>
                    ) : null}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Swap pickup and destination"
                  accessibilityRole="button"
                  disabled={!drop || !pickup}
                  onPress={swapLocations}
                  style={[styles.swapButton, (!drop || !pickup) && styles.swapDisabled]}
                >
                  <Icon
                    color={drop && pickup ? colors.black : '#AAAAAA'}
                    icon={ArrowDownUp}
                    size={17}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading title="Choose a service category" />
          <ServiceCategoryGrid selected={selectedCategory} onSelect={setSelectedCategory} />
          <Text style={styles.note}>
            Categories are for preview only. Availability and eligibility are subject to confirmation.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!pickup || !drop || !selectedCategory}
          onPress={handleReviewRide}
          style={({ pressed }) => [
            styles.searchButton,
            (!pickup || !drop || !selectedCategory) && styles.searchButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon
            color={pickup && drop && selectedCategory ? colors.white : colors.textSecondary}
            icon={Search}
            size={18}
          />
          <Text
            style={[
              styles.searchButtonText,
              (!pickup || !drop || !selectedCategory) && styles.searchButtonTextDisabled,
            ]}
          >
            Review ride
          </Text>
        </Pressable>
        {bookingError && !ridePreviewVisible ? (
          <Text accessibilityRole="alert" style={styles.bookingError}>
            {bookingError}
          </Text>
        ) : null}

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
                      ...(drop ? { destination: drop.label } : {}),
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
                key={place.placeId}
                onPress={() => selectLocation('drop', {
                  label: place.label,
                  address: place.address,
                  placeId: place.placeId,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })}
                place={{
                  name: place.label || place.query || 'Recent location',
                  address: place.address,
                }}
              />
            ))}
          </View>
          {recentPlaces.length === 0 && !recentPlacesError ? (
            <Text style={styles.note}>Your recent locations will appear here.</Text>
          ) : null}
          {recentPlacesError ? (
            <Text accessibilityRole="alert" style={styles.locationNoticeText}>
              {recentPlacesError}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <TitaniumCard onPress={() => router.push('/(tabs)/rewards')} />
        </View>
        <Text style={styles.footerNote}>
          Ride requests are offered to eligible nearby Auto drivers. This development preview does not process online payments.
        </Text>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (mapPreviewVisible) setMapPreviewVisible(false);
          else setRidePreviewVisible(false);
        }}
        transparent
        visible={ridePreviewVisible}
      >
        <View style={styles.previewScrim}>
          <View style={styles.previewCard}>
            {mapPreviewVisible ? (
              <>
                <Pressable
                  accessibilityLabel="Back to ride preview"
                  accessibilityRole="button"
                  onPress={() => setMapPreviewVisible(false)}
                  style={styles.mapPreviewBack}
                >
                  <Icon icon={ArrowLeft} size={19} />
                  <Text style={styles.mapPreviewBackText}>Back to ride preview</Text>
                </Pressable>
                <View style={styles.routeMapPreview}>
                  {pickup && drop && routeOptions[selectedRouteIndex] ? (
                    <RouteMap
                      destination={drop}
                      destinationLabel={drop.label}
                      origin={pickup}
                      originLabel={pickup.label}
                      route={routeOptions[selectedRouteIndex]}
                    />
                  ) : (
                    <Text style={styles.routeMapUnavailable}>
                      The selected route map is unavailable.
                    </Text>
                  )}
                </View>
                {routeSummary ? (
                  <Text style={styles.mapPreviewMetrics}>
                    {routeSummary.distanceKm.toFixed(1)} km · {Math.ceil(routeSummary.durationMinutes)} min
                  </Text>
                ) : null}
                {routeOptions.length > 1 ? (
                  <ScrollView
                    contentContainerStyle={styles.mapRouteChoices}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {routeOptions.map((route, index) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedRouteIndex === index }}
                        key={`${route.distanceMeters}-${index}`}
                        onPress={() => handleSelectRoute(index)}
                        style={[
                          styles.mapRouteChoice,
                          selectedRouteIndex === index && styles.mapRouteChoiceSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.mapRouteChoiceText,
                            selectedRouteIndex === index && styles.mapRouteChoiceTextSelected,
                          ]}
                        >
                          Route {index + 1} · {route.distanceKm.toFixed(1)} km
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </>
            ) : (
              <>
            <View style={styles.previewIcon}>
              <Icon icon={Navigation2} size={21} />
            </View>
            <Text style={styles.previewTitle}>Your ride preview</Text>
            <Text style={styles.previewSubtitle}>Review the request details before saving.</Text>
            <View style={styles.previewRoute}>
              <Text style={styles.previewLabel}>FROM</Text>
              <Text style={styles.previewValue}>{pickup?.label ?? 'Pickup not selected'}</Text>
              <View style={styles.previewDivider} />
              <Text style={styles.previewLabel}>TO</Text>
              <Text style={styles.previewValue}>{drop?.label ?? 'Drop not selected'}</Text>
            </View>
            <View style={styles.previewCategory}>
              <Text style={styles.previewLabel}>CATEGORY</Text>
              <Text style={styles.previewValue}>{selectedCategory}</Text>
            </View>
            <View style={styles.routeSummary}>
              <Text style={styles.previewLabel}>ROAD ROUTE</Text>
              {routeLoading ? (
                <Text style={styles.routeSummaryText}>Calculating distance and time…</Text>
              ) : routeSummary ? (
                <>
                  <Text style={styles.routeSummaryText}>
                    {routeSummary.distanceKm.toFixed(1)} km · {Math.ceil(routeSummary.durationMinutes)} min
                  </Text>
                  <Pressable
                    accessibilityLabel="View route on map"
                    accessibilityRole="button"
                    onPress={() => setMapPreviewVisible(true)}
                    style={styles.viewRouteButton}
                  >
                    <Text style={styles.viewRouteText}>View route on map</Text>
                  </Pressable>
                </>
              ) : (
                <Text accessibilityRole={routeError ? 'alert' : undefined} style={styles.routeSummaryText}>
                  {routeError ?? 'Route preview is unavailable.'}
                </Text>
              )}
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
              <Text style={styles.previewLabel}>AUTO FARE ESTIMATE</Text>
              {estimateLoading ? (
                <Text style={styles.fareValue}>Calculating…</Text>
              ) : bookingEstimate ? (
                <Text style={styles.fareValue}>
                  {bookingEstimate.currency} {bookingEstimate.totalAmount.toFixed(2)}
                </Text>
              ) : null}
              {bookingEstimate ? (
                <>
                  <Text style={styles.fareDisclaimer}>
                    {bookingEstimate.distanceKm.toFixed(2)} km · base fare ₹{bookingEstimate.baseAmount.toFixed(2)}
                  </Text>
                  <Text style={styles.fareDisclaimer}>
                    Progressive distance fare ₹{bookingEstimate.distanceAmount.toFixed(2)} · time ₹0.00 · platform ₹0.00
                  </Text>
                </>
              ) : null}
              <Text style={styles.fareDisclaimer}>
                Backend-calculated fare from the selected ORS route. Rounded to the nearest paisa (half-up).
              </Text>
            </View>
            <Text style={styles.previewDisclaimer}>
              Cash payment · 0% driver commission · ₹0 platform fee.
            </Text>
            {bookingError ? <Text style={styles.bookingError}>{bookingError}</Text> : null}
            <Pressable
              disabled={
                routeLoading ||
                estimateLoading ||
                !routeSummary ||
                Boolean(routeError) ||
                !bookingEstimate ||
                bookingLoading
              }
              onPress={() => void handleCreateBooking()}
              style={({ pressed }) => [
                styles.previewButton,
                (
                  routeLoading ||
                  estimateLoading ||
                  !routeSummary ||
                  Boolean(routeError) ||
                  !bookingEstimate ||
                  bookingLoading
                ) && styles.previewButtonDisabled,
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
              </>
            )}
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
    backgroundColor: colors.greyLight,
  },
  searchButtonTextDisabled: {
    color: colors.textSecondary,
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
  mapPreviewBack: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  mapPreviewBackText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  routeMapPreview: {
    width: '100%',
    height: 320,
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  routeMapUnavailable: {
    padding: spacing.lg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  mapPreviewMetrics: {
    marginTop: spacing.sm,
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  mapRouteChoices: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  mapRouteChoice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  mapRouteChoiceSelected: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  mapRouteChoiceText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '600',
  },
  mapRouteChoiceTextSelected: {
    color: colors.white,
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
  routeSummary: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  routeSummaryText: {
    marginTop: spacing.xs,
    color: colors.black,
    fontSize: 13,
    lineHeight: 19,
  },
  viewRouteButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  viewRouteText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
