import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/maps/RouteMap';
import { useLocationSelection } from '../components/location/LocationSelectionContext';
import { customerApi } from '../src/api/client';
import type { MapRoute } from '../src/api/types';

export default function RoutePreviewScreen() {
  const router = useRouter();
  const { pickup, drop } = useLocationSelection();
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const selectedRoute = routes[selectedRouteIndex];

  useEffect(() => {
    let active = true;
    if (!pickup || !drop) {
      return () => {
        active = false;
      };
    }

    void customerApi.computeRoute(pickup, drop)
      .then((results) => {
        if (!active) return;
        if (results.length === 0) {
          setMessage('No road route was found for these locations.');
          return;
        }
        setRoutes(results);
        setSelectedRouteIndex(0);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Could not calculate the route.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [drop, pickup]);

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
        <Text style={styles.title}>Route preview</Text>
      </View>

      <View style={styles.mapArea}>
        {!pickup || !drop ? (
          <View style={styles.status}>
            <Text style={styles.error}>
              Choose both a pickup and destination to preview a route.
            </Text>
          </View>
        ) : selectedRoute ? (
          <RouteMap
            destination={drop}
            destinationLabel={drop.label}
            origin={pickup}
            originLabel={pickup.label}
            route={selectedRoute}
          />
        ) : loading ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.black} size="large" />
            <Text style={styles.statusText}>Calculating road route…</Text>
          </View>
        ) : (
          <View style={styles.status}>
            <Text accessibilityRole="alert" style={styles.error}>
              {message}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.details}>
        {selectedRoute ? (
          <>
            <View style={styles.metrics}>
              <View>
                <Text style={styles.metricLabel}>ROAD DISTANCE</Text>
                <Text style={styles.metricValue}>{selectedRoute.distanceKm.toFixed(1)} km</Text>
              </View>
              <View>
                <Text style={styles.metricLabel}>ESTIMATED TIME</Text>
                <Text style={styles.metricValue}>
                  {Math.ceil(selectedRoute.durationMinutes)} min
                </Text>
              </View>
            </View>
            {routes.length > 1 ? (
              <View style={styles.alternatives}>
                {routes.map((route, index) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedRouteIndex === index }}
                    key={`${route.distanceMeters}-${index}`}
                    onPress={() => setSelectedRouteIndex(index)}
                    style={[
                      styles.alternative,
                      selectedRouteIndex === index && styles.alternativeSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.alternativeText,
                        selectedRouteIndex === index && styles.alternativeTextSelected,
                      ]}
                    >
                      Route {index + 1} · {route.distanceKm.toFixed(1)} km
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        <Text style={styles.disclaimer}>
          Routing uses the configured openrouteservice profile ({selectedRoute?.profile ?? 'driving-car'}).
          It is not auto-rickshaw-specific and may not reflect vehicle restrictions or live traffic.
        </Text>
        {message && selectedRoute ? (
          <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
        ) : null}
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
    minHeight: 220,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.greyLight,
  },
  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  details: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: spacing.xs,
    color: colors.black,
    fontSize: 20,
    fontWeight: '700',
  },
  alternatives: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  alternative: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  alternativeSelected: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  alternativeText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '600',
  },
  alternativeTextSelected: {
    color: colors.white,
  },
  disclaimer: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
});
