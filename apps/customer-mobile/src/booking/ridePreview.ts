import type {
  BookingEstimate,
  BookingRequest,
  MapRoute,
} from '../api/types';

type Coordinates = { latitude: number; longitude: number };

export interface RidePreviewApi {
  computeRoute(origin: Coordinates, destination: Coordinates): Promise<MapRoute[]>;
  estimateBooking(request: BookingRequest, fareRouteToken: string): Promise<BookingEstimate>;
}

export type RidePreviewResult =
  | { ok: true; routes: MapRoute[]; estimate: BookingEstimate; fareRouteToken: string }
  | { ok: false; step: 'route' | 'fare'; error: unknown };

export async function estimateSelectedRoute(
  api: RidePreviewApi,
  request: BookingRequest,
  route: MapRoute,
): Promise<BookingEstimate> {
  if (!route.fareRouteToken) {
    throw new Error('The selected ORS route is missing its fare quote.');
  }
  return api.estimateBooking(request, route.fareRouteToken);
}

function getCoordinates(
  location: BookingRequest['pickup'],
): Coordinates | null {
  const { latitude, longitude } = location;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export async function loadRidePreview(
  api: RidePreviewApi,
  request: BookingRequest,
  onRoute?: (routes: MapRoute[]) => void,
): Promise<RidePreviewResult> {
  const origin = getCoordinates(request.pickup);
  const destination = getCoordinates(request.dropoff);
  if (!origin || !destination) {
    return {
      ok: false,
      step: 'route',
      error: new Error('Choose valid pickup and destination locations.'),
    };
  }

  let routes: MapRoute[];
  try {
    routes = await api.computeRoute(origin, destination);
  } catch (error) {
    return { ok: false, step: 'route', error };
  }
  if (routes.length === 0) {
    return {
      ok: false,
      step: 'route',
      error: new Error('No road route was found for these locations.'),
    };
  }

  onRoute?.(routes);
  try {
    const fareRouteToken = routes[0].fareRouteToken;
    if (!fareRouteToken) {
      return {
        ok: false,
        step: 'fare',
        error: new Error('The selected ORS route is missing its fare quote.'),
      };
    }
    const estimate = await estimateSelectedRoute(api, request, routes[0]);
    return { ok: true, routes, estimate, fareRouteToken };
  } catch (error) {
    return { ok: false, step: 'fare', error };
  }
}
