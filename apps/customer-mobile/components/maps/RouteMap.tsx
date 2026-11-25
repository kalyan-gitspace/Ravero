import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { colors } from '@ravero/design-tokens';
import { customerApi } from '../../src/api/client';
import type { MapRoute } from '../../src/api/types';

interface RouteMapProps {
  route: MapRoute;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  originLabel: string;
  destinationLabel: string;
}

export function RouteMap({
  route,
  origin,
  destination,
  originLabel,
  destinationLabel,
}: RouteMapProps) {
  const [tileStyleUrl, setTileStyleUrl] = useState<string | null>(null);
  const [attribution, setAttribution] = useState('© OpenStreetMap contributors · OpenFreeMap');
  const [mapReady, setMapReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const bounds = useMemo(() => {
    const points = [
      ...route.geometry.coordinates,
      [origin.longitude, origin.latitude] as [number, number],
      [destination.longitude, destination.latitude] as [number, number],
    ];
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    return [
      Math.min(...longitudes),
      Math.min(...latitudes),
      Math.max(...longitudes),
      Math.max(...latitudes),
    ] as [number, number, number, number];
  }, [destination.latitude, destination.longitude, origin.latitude, origin.longitude, route]);
  const routeGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(
    () => ({
      type: 'Feature',
      geometry: route.geometry,
      properties: {},
    }),
    [route.geometry],
  );
  const endpointsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [origin.longitude, origin.latitude] },
          properties: { kind: 'pickup' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [destination.longitude, destination.latitude],
          },
          properties: { kind: 'destination' },
        },
      ],
    }),
    [destination.latitude, destination.longitude, origin.latitude, origin.longitude],
  );

  useEffect(() => {
    let active = true;
    void customerApi.getMapConfig()
      .then((config) => {
        if (!active) return;
        setTileStyleUrl(config.tileStyleUrl);
        setAttribution(config.attribution);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Map configuration is unavailable.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      {tileStyleUrl ? (
        <Map
          attribution
          attributionPosition={{ bottom: 4, right: 4 }}
          compass={false}
          logo={false}
          mapStyle={tileStyleUrl}
          onDidFailLoadingMap={() => setMessage('OpenFreeMap could not load the route map.')}
          onDidFinishLoadingMap={() => setMapReady(true)}
          style={StyleSheet.absoluteFill}
        >
          <Camera
            initialViewState={{
              bounds,
              padding: { top: 28, right: 28, bottom: 28, left: 28 },
            }}
          />
          <GeoJSONSource id="ravero-route" data={routeGeoJson}>
            <Layer
              id="ravero-route-outline"
              type="line"
              paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.95 }}
            />
            <Layer
              id="ravero-route-line"
              type="line"
              paint={{ 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 1 }}
            />
          </GeoJSONSource>
          <GeoJSONSource id="ravero-route-endpoints" data={endpointsGeoJson}>
            <Layer
              id="ravero-route-points"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': [
                  'match',
                  ['get', 'kind'],
                  'pickup',
                  '#16A34A',
                  '#DC2626',
                ],
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
              }}
            />
          </GeoJSONSource>
        </Map>
      ) : null}
      {!mapReady ? (
        <View pointerEvents="none" style={styles.unavailable}>
          <Text style={styles.unavailableText}>{message ?? 'Loading route map…'}</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.locationLabels}>
        <Text numberOfLines={1} style={styles.locationLabel}>
          Pickup · {originLabel}
        </Text>
        <Text numberOfLines={1} style={styles.locationLabel}>
          Destination · {destinationLabel}
        </Text>
      </View>
      <Text style={styles.attribution}>{attribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 180,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.greyLight,
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  unavailableText: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
  },
  locationLabels: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    gap: 5,
  },
  locationLabel: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.94)',
    color: colors.black,
    fontSize: 11,
    fontWeight: '600',
  },
  attribution: {
    position: 'absolute',
    right: 4,
    bottom: 3,
    paddingHorizontal: 3,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    color: colors.textSecondary,
    fontSize: 9,
  },
});
