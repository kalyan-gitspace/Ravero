import { useEffect, useMemo, useState } from 'react';
import { Map as MapLibreGLMap } from 'maplibre-gl';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@ravero/design-tokens';
import { configureWebMapLibreWorker } from './configureWebMapLibreWorker';
import { customerApi } from '../../src/api/client';
import type { MapRoute } from '../../src/api/types';

const MAP_CONTAINER_ID = 'ravero-route-map';

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
    ];
  }, [destination.latitude, destination.longitude, origin.latitude, origin.longitude, route]);

  useEffect(() => {
    let active = true;
    let loaded = false;
    let map: MapLibreGLMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const timeout = setTimeout(() => {
      if (active && !loaded) setMessage('OpenFreeMap did not finish loading the route map.');
    }, 20_000);
    void customerApi.getMapConfig()
      .then((config) => {
        if (!active) return;
        setMapReady(false);
        const container = document.getElementById(MAP_CONTAINER_ID);
        if (!container) throw new Error('OpenFreeMap could not find its map container.');
        setAttribution(config.attribution);

        configureWebMapLibreWorker();
        map = new MapLibreGLMap({
          container,
          style: config.tileStyleUrl,
          center: [config.defaultCenter.longitude, config.defaultCenter.latitude],
          zoom: config.defaultZoom,
          attributionControl: {},
        });
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map?.resize());
          resizeObserver.observe(container);
        }
        map.once('load', () => {
          loaded = true;
          clearTimeout(timeout);
          if (!active || !map) return;
          map.addSource('ravero-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: route.geometry,
              properties: {},
            },
          });
          map.addLayer({
            id: 'ravero-route-outline',
            type: 'line',
            source: 'ravero-route',
            paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.95 },
          });
          map.addLayer({
            id: 'ravero-route-line',
            type: 'line',
            source: 'ravero-route',
            paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 1 },
          });
          map.addSource('ravero-route-endpoints', {
            type: 'geojson',
            data: {
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
            },
          });
          map.addLayer({
            id: 'ravero-route-points',
            type: 'circle',
            source: 'ravero-route-endpoints',
            paint: {
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
            },
          });
          map.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: 28, duration: 0 },
          );
          setMapReady(true);
        });
        map.on('error', (event) => {
          if (active && !loaded) setMessage(event.error.message);
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Map configuration is unavailable.');
        }
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [bounds, destination.latitude, destination.longitude, origin.latitude, origin.longitude, route]);

  return (
    <View style={styles.container}>
      <View nativeID={MAP_CONTAINER_ID} style={StyleSheet.absoluteFill} />
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
