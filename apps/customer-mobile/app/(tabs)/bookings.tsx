import { CalendarDays, MapPin, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';
import { customerApi } from '../../src/api/client';
import type { CustomerBooking } from '../../src/api/types';

type BookingGroup = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const bookingGroups: { key: BookingGroup; label: string }[] = [
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

function getBookingGroup(status: string): BookingGroup | null {
  if (['REQUESTED', 'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED'].includes(status)) {
    return 'UPCOMING';
  }
  if (status === 'TRIP_STARTED') return 'ACTIVE';
  if (status === 'TRIP_COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return null;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: 'Requested',
    ACCEPTED: 'Driver accepted',
    DRIVER_ARRIVING: 'Driver arriving',
    DRIVER_ARRIVED: 'Driver arrived',
    TRIP_STARTED: 'In progress',
    TRIP_COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<BookingGroup>('UPCOMING');

  const loadBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setBookings(await customerApi.getBookings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load bookings.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadBookings());
  }, [loadBookings]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (bookings.some((booking) => {
        const group = getBookingGroup(booking.status);
        return group === 'UPCOMING' || group === 'ACTIVE';
      })) {
        void loadBookings(true);
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [bookings, loadBookings]);

  const visibleBookings = bookings.filter(
    (booking) => getBookingGroup(booking.status) === selectedGroup,
  );

  const cancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    setError(null);
    setNotice(null);
    try {
      const updatedBooking = await customerApi.cancelBooking(bookingId);
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? updatedBooking : booking)),
      );
      setNotice('The pending booking request was cancelled.');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel this booking.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Your bookings</Text>
      <Text style={styles.subtitle}>Track upcoming requests and review your ride history.</Text>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.black} />
          <Text style={styles.stateText}>Loading bookings…</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={() => void loadBookings()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.groupFilters}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {bookingGroups.map((group) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedGroup === group.key }}
                key={group.key}
                onPress={() => setSelectedGroup(group.key)}
                style={[
                  styles.groupFilter,
                  selectedGroup === group.key && styles.groupFilterSelected,
                ]}
              >
                <Text
                  style={[
                    styles.groupFilterText,
                    selectedGroup === group.key && styles.groupFilterTextSelected,
                  ]}
                >
                  {group.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {visibleBookings.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon color={colors.textSecondary} icon={CalendarDays} size={25} />
          </View>
          <Text style={styles.emptyTitle}>No {selectedGroup.toLowerCase()} rides</Text>
          <Text style={styles.stateText}>Rides in this section will appear here.</Text>
        </View>
      ) : (
        <View style={styles.bookingList}>
          {visibleBookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.category}>{booking.serviceType.name}</Text>
                  <Text style={styles.date}>Reference · {booking.id.slice(0, 8).toUpperCase()}</Text>
                  <Text style={styles.date}>{formatDate(booking.createdAt)}</Text>
                  {booking.scheduledAt ? (
                    <Text style={styles.date}>Scheduled · {formatDate(booking.scheduledAt)}</Text>
                  ) : null}
                </View>
                <Text style={styles.status}>{getStatusLabel(booking.status)}</Text>
              </View>

              <View style={styles.locationRow}>
                <Icon icon={MapPin} size={16} />
                <View style={styles.locationCopy}>
                  <Text style={styles.locationLabel}>PICKUP · {booking.pickup.label}</Text>
                  <Text numberOfLines={2} style={styles.address}>{booking.pickup.address}</Text>
                </View>
              </View>
              {booking.stops.map((stop, index) => (
                <View key={`${booking.id}-stop-${index}`} style={styles.locationRow}>
                  <Icon color={colors.textSecondary} icon={MapPin} size={16} />
                  <View style={styles.locationCopy}>
                    <Text style={styles.locationLabel}>STOP {index + 1} · {stop.label}</Text>
                    <Text numberOfLines={2} style={styles.address}>{stop.address}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.locationRow}>
                <Icon icon={MapPin} size={16} />
                <View style={styles.locationCopy}>
                  <Text style={styles.locationLabel}>DROP-OFF · {booking.dropoff.label}</Text>
                  <Text numberOfLines={2} style={styles.address}>{booking.dropoff.address}</Text>
                </View>
              </View>

              <View style={styles.fareRow}>
                <View style={styles.fareDetails}>
                  <Text style={styles.fareLabel}>Fare estimate · cash payment</Text>
                  <Text style={styles.date}>
                    {booking.fareEstimate.distanceKm.toFixed(2)} km · {Math.ceil(booking.fareEstimate.estimatedDurationMinutes)} min
                  </Text>
                  <Text style={styles.date}>Payment · {booking.paymentStatus.replaceAll('_', ' ')}</Text>
                </View>
                <Text style={styles.fareValue}>
                  {booking.fareEstimate.currency} {booking.fareEstimate.totalAmount.toFixed(2)}
                </Text>
              </View>
              {booking.status === 'REQUESTED' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={cancellingId === booking.id}
                  onPress={() => void cancelBooking(booking.id)}
                  style={styles.cancelButton}
                >
                  <Icon icon={X} size={15} />
                  <Text style={styles.cancelText}>
                    {cancellingId === booking.id ? 'Cancelling…' : 'Cancel request'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
        </>
      )}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!loading && !error ? (
        <Text style={styles.disclaimer}>
          Cash is the pilot payment method. Payment statuses are recorded for testing; no money changes hands in this development preview.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  title: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  state: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    backgroundColor: colors.greyLight,
  },
  emptyTitle: {
    marginVertical: spacing.md,
    color: colors.black,
    fontSize: 17,
    fontWeight: '700',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  bookingList: {
    gap: spacing.md,
  },
  groupFilters: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  groupFilter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  groupFilterSelected: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  groupFilterText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  groupFilterTextSelected: {
    color: colors.white,
  },
  bookingCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  category: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  date: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
  },
  status: {
    color: colors.black,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  locationCopy: {
    flex: 1,
  },
  locationLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  address: {
    marginTop: 3,
    color: colors.black,
    fontSize: 13,
    lineHeight: 18,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fareDetails: {
    flex: 1,
    gap: 3,
  },
  fareLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
  },
  fareValue: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  cancelText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '600',
  },
  notice: {
    marginTop: spacing.md,
    color: colors.black,
    fontSize: 12,
    textAlign: 'center',
  },
  disclaimer: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
