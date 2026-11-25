import 'dotenv/config';
import { env } from '../src/config/env.js';
import { AppError } from '../src/errors/AppError.js';
import { OpenRouteServiceClient } from '../src/maps/openRouteServiceClient.js';
import { PhotonClient } from '../src/maps/photonClient.js';
import { MapsService } from '../src/maps/service.js';
import type { Coordinates, RouteResult } from '../src/maps/types.js';

const OFFICIAL_ORS_ORIGIN = 'https://api.heigit.org';
const OFFICIAL_ORS_PATH = '/openrouteservice';

const locations = {
  charminar: {
    label: 'Charminar',
    coordinates: { latitude: 17.3616, longitude: 78.4747 },
  },
  gachibowli: {
    label: 'Gachibowli',
    coordinates: { latitude: 17.4401, longitude: 78.3489 },
  },
  madhapur: {
    label: 'Madhapur',
    coordinates: { latitude: 17.4483, longitude: 78.3915 },
  },
  hitecCity: {
    label: 'HITEC City',
    coordinates: { latitude: 17.4435, longitude: 78.3772 },
  },
  uppal: {
    label: 'Uppal',
    coordinates: { latitude: 17.4018, longitude: 78.5591 },
  },
  secunderabad: {
    label: 'Secunderabad Clock Tower',
    coordinates: { latitude: 17.4399, longitude: 78.4983 },
  },
  lbNagar: {
    label: 'LB Nagar',
    coordinates: { latitude: 17.3457, longitude: 78.5522 },
  },
  airport: {
    label: 'Rajiv Gandhi International Airport terminal',
    coordinates: { latitude: 17.2403, longitude: 78.4294 },
  },
} satisfies Record<string, { label: string; coordinates: Coordinates }>;

const routePairs = [
  { id: 'charminar-gachibowli', origin: locations.charminar, destination: locations.gachibowli },
  { id: 'madhapur-hitec', origin: locations.madhapur, destination: locations.hitecCity },
  { id: 'uppal-secunderabad', origin: locations.uppal, destination: locations.secunderabad },
  { id: 'lb-nagar-airport', origin: locations.lbNagar, destination: locations.airport },
] as const;
type RoutePair = (typeof routePairs)[number];

type Attempt<T> =
  | { ok: true; httpStatus: number | null; value: T }
  | {
      ok: false;
      httpStatus: number | null;
      failureCategory: string;
      providerErrorCode?: string;
    };

interface LiveReport {
  reportType: 'ravero-ors-live-verification';
  mode: 'preflight' | 'live';
  runAt: string;
  provider: 'OpenRouteService';
  endpointHost: string;
  profile: string;
  scope: string;
  keyConfigured: boolean;
  liveRequestsSent: boolean;
  retryPolicy: {
    timeoutMs: number;
    maxTimeoutRetries: number;
    retryCondition: string;
  };
  overallStatus: 'not_run' | 'blocked' | 'passed' | 'failed';
  failureCategory?: string;
  inputCoordinateNote: string;
  routeTests: Array<Record<string, unknown>>;
  matrixTest?: Record<string, unknown>;
  etaTest?: Record<string, unknown>;
  cacheChecks: Array<Record<string, unknown>>;
  requestCounts: {
    attempts: number;
    httpResponses: number;
  };
}

let lastHttpStatus: number | null = null;
let requestAttempts = 0;
let httpResponses = 0;

function isValidCoordinates(coordinates: Coordinates): boolean {
  return (
    Number.isFinite(coordinates.latitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

function configuredProxy(): boolean {
  const proxyNames = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ];
  return (
    proxyNames.some((name) => Boolean(process.env[name]?.trim())) ||
    /(?:^|\s)--use-env-proxy(?:\s|=|$)/i.test(process.env.NODE_OPTIONS ?? '') ||
    process.env.NODE_USE_ENV_PROXY === '1'
  );
}

function validateConfiguration(): string | undefined {
  if (!env.OPENROUTESERVICE_API_KEY) return 'credential_missing';
  if (configuredProxy()) return 'proxy_configuration_detected';

  const endpoint = new URL(env.OPENROUTESERVICE_BASE_URL);
  if (
    endpoint.origin !== OFFICIAL_ORS_ORIGIN ||
    endpoint.pathname.replace(/\/+$/, '') !== OFFICIAL_ORS_PATH ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    return 'non_official_endpoint';
  }

  if (!Object.values(locations).every(({ coordinates }) => isValidCoordinates(coordinates))) {
    return 'invalid_test_coordinates';
  }

  return undefined;
}

function failureCategory(error: unknown): { category: string; code?: string } {
  const code = error instanceof AppError ? error.code : undefined;
  if (lastHttpStatus === 401 || lastHttpStatus === 403) {
    return { category: 'authorization_error', ...(code ? { code } : {}) };
  }
  if (lastHttpStatus === 429) return { category: 'quota_or_rate_limit', ...(code ? { code } : {}) };
  if (
    lastHttpStatus === 408 ||
    lastHttpStatus === 504 ||
    code === 'MAPS_PROVIDER_TIMEOUT'
  ) {
    return { category: 'timeout', ...(code ? { code } : {}) };
  }
  if (lastHttpStatus !== null && lastHttpStatus >= 500) {
    return { category: 'provider_error', ...(code ? { code } : {}) };
  }
  if (code === 'ROUTING_NOT_CONFIGURED') {
    return { category: 'credential_missing', ...(code ? { code } : {}) };
  }
  if (code === 'MAPS_INVALID_PROVIDER_RESPONSE') {
    return { category: 'invalid_provider_response', ...(code ? { code } : {}) };
  }
  if (code === 'ROUTE_NOT_FOUND') {
    return { category: 'route_not_found', ...(code ? { code } : {}) };
  }
  if (code === 'MAPS_PROVIDER_UNAVAILABLE' || lastHttpStatus === null) {
    return { category: 'network_or_connection_error', ...(code ? { code } : {}) };
  }
  return { category: 'provider_http_error', ...(code ? { code } : {}) };
}

async function attempt<T>(operation: () => Promise<T>): Promise<Attempt<T>> {
  lastHttpStatus = null;
  try {
    const value = await operation();
    return { ok: true, httpStatus: lastHttpStatus, value };
  } catch (error) {
    const failure = failureCategory(error);
    return {
      ok: false,
      httpStatus: lastHttpStatus,
      failureCategory: failure.category,
      ...(failure.code ? { providerErrorCode: failure.code } : {}),
    };
  }
}

function validGeometry(route: RouteResult): boolean {
  return (
    route.geometry.type === 'LineString' &&
    route.geometry.coordinates.length >= 2 &&
    route.geometry.coordinates.every(
      ([longitude, latitude]) =>
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90,
    )
  );
}

function routeReport(route: RouteResult): Record<string, unknown> {
  return {
    distanceMeters: route.distanceMeters,
    distanceKilometers: route.distanceKm,
    durationSeconds: route.durationSeconds,
    durationMinutes: route.durationMinutes,
    profile: route.profile,
    geometryValid: validGeometry(route),
    geometry: route.geometry,
  };
}

function createMapsService(): MapsService {
  const routing = new OpenRouteServiceClient({
    baseUrl: env.OPENROUTESERVICE_BASE_URL,
    apiKey: env.OPENROUTESERVICE_API_KEY,
    timeoutMs: env.MAPS_REQUEST_TIMEOUT_MS,
    fetcher: async (input, init) => {
      const requestUrl =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : String(input);
      const target = new URL(requestUrl);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (
        target.origin !== OFFICIAL_ORS_ORIGIN ||
        !/^\/openrouteservice\/v2\/(directions|matrix)\//.test(target.pathname) ||
        target.search ||
        target.username ||
        target.password ||
        authorization !== env.OPENROUTESERVICE_API_KEY
      ) {
        throw new AppError(500, 'ORS_TARGET_NOT_ALLOWED', 'ORS request configuration was rejected.');
      }

      requestAttempts += 1;
      const response = await fetch(input, { ...init, redirect: 'manual' });
      lastHttpStatus = response.status;
      httpResponses += 1;
      return response;
    },
  });

  return new MapsService({
    photon: new PhotonClient({
      baseUrl: env.PHOTON_BASE_URL,
      timeoutMs: env.MAPS_REQUEST_TIMEOUT_MS,
    }),
    routing,
    tileStyleUrl: env.MAP_TILE_STYLE_URL,
    routingProfile: env.OPENROUTESERVICE_PROFILE,
    cacheTtlSeconds: env.MAPS_CACHE_TTL_SECONDS,
  });
}

function createReport(mode: LiveReport['mode'], scope: string): LiveReport {
  return {
    reportType: 'ravero-ors-live-verification',
    mode,
    runAt: new Date().toISOString(),
    provider: 'OpenRouteService',
    endpointHost: 'api.heigit.org',
    profile: env.OPENROUTESERVICE_PROFILE,
    scope,
    keyConfigured: Boolean(env.OPENROUTESERVICE_API_KEY),
    liveRequestsSent: false,
    retryPolicy: {
      timeoutMs: env.MAPS_REQUEST_TIMEOUT_MS,
      maxTimeoutRetries: 1,
      retryCondition: 'client-side timeout only',
    },
    overallStatus: 'not_run',
    inputCoordinateNote:
      'Representative fixed locality/landmark coordinates; this utility does not call a geocoder.',
    routeTests: [],
    cacheChecks: [],
    requestCounts: { attempts: 0, httpResponses: 0 },
  };
}

function recordCacheCheck(
  report: LiveReport,
  name: string,
  requestCountBeforeRepeat: number,
  repeatSucceeded: boolean,
) {
  report.cacheChecks.push({
    operation: name,
    cacheHit: requestAttempts === requestCountBeforeRepeat,
    repeatSucceeded,
  });
}

async function runLive(
  report: LiveReport,
  selectedRoutes: readonly RoutePair[],
  includeMatrixAndEta: boolean,
): Promise<void> {
  const maps = createMapsService();

  for (const pair of selectedRoutes) {
    const requestCountBefore = requestAttempts;
    const result = await attempt(() =>
      maps.route(
        pair.origin.coordinates,
        pair.destination.coordinates,
        env.OPENROUTESERVICE_PROFILE,
        true,
      ),
    );

    if (!result.ok) {
      report.routeTests.push({
        routeId: pair.id,
        origin: pair.origin.label,
        destination: pair.destination.label,
        ok: false,
        httpStatus: result.httpStatus,
        providerAttempts: requestAttempts - requestCountBefore,
        timeoutRetries: Math.max(requestAttempts - requestCountBefore - 1, 0),
        failureCategory: result.failureCategory,
        ...(result.providerErrorCode ? { providerErrorCode: result.providerErrorCode } : {}),
      });
      continue;
    }

    report.routeTests.push({
      routeId: pair.id,
      origin: pair.origin.label,
      destination: pair.destination.label,
      ok: true,
      httpStatus: result.httpStatus,
      providerAttempts: requestAttempts - requestCountBefore,
      timeoutRetries: Math.max(requestAttempts - requestCountBefore - 1, 0),
      routesReturned: result.value.length,
      alternateRoutesAvailable: result.value.length > 1,
      routes: result.value.map(routeReport),
    });

    const requestsBeforeRepeat = requestAttempts;
    const repeated = await attempt(() =>
      maps.route(
        pair.origin.coordinates,
        pair.destination.coordinates,
        env.OPENROUTESERVICE_PROFILE,
        true,
      ),
    );
    recordCacheCheck(
      report,
      `route:${pair.origin.label}->${pair.destination.label}`,
      requestsBeforeRepeat,
      repeated.ok &&
        JSON.stringify(repeated.value) === JSON.stringify(result.value),
    );
  }

  if (includeMatrixAndEta) {
    const sources = routePairs.map((pair) => pair.origin.coordinates);
    const destinations = routePairs.map((pair) => pair.destination.coordinates);
    const matrixRequestCountBefore = requestAttempts;
    const matrix = await attempt(() =>
      maps.matrix(sources, destinations, env.OPENROUTESERVICE_PROFILE),
    );

    if (matrix.ok) {
      report.matrixTest = {
        ok: true,
        httpStatus: matrix.httpStatus,
        providerAttempts: requestAttempts - matrixRequestCountBefore,
        sourceLabels: routePairs.map((pair) => pair.origin.label),
        destinationLabels: routePairs.map((pair) => pair.destination.label),
        durationsSeconds: matrix.value.durations,
        distancesMeters: matrix.value.distances,
      };
      const requestsBeforeRepeat = requestAttempts;
      const repeated = await attempt(() =>
        maps.matrix(sources, destinations, env.OPENROUTESERVICE_PROFILE),
      );
      recordCacheCheck(
        report,
        'matrix',
        requestsBeforeRepeat,
        repeated.ok && JSON.stringify(repeated.value) === JSON.stringify(matrix.value),
      );
    } else {
      report.matrixTest = {
        ok: false,
        httpStatus: matrix.httpStatus,
        providerAttempts: requestAttempts - matrixRequestCountBefore,
        failureCategory: matrix.failureCategory,
        ...(matrix.providerErrorCode ? { providerErrorCode: matrix.providerErrorCode } : {}),
      };
    }

    const etaPair = routePairs[0];
    const etaRequestCountBefore = requestAttempts;
    const eta = await attempt(() =>
      maps.eta(
        etaPair.origin.coordinates,
        etaPair.destination.coordinates,
        env.OPENROUTESERVICE_PROFILE,
      ),
    );

    if (eta.ok) {
      report.etaTest = {
        ok: true,
        httpStatus: eta.httpStatus,
        providerAttempts: requestAttempts - etaRequestCountBefore,
        origin: etaPair.origin.label,
        destination: etaPair.destination.label,
        ...eta.value,
      };
      const requestsBeforeRepeat = requestAttempts;
      const repeated = await attempt(() =>
        maps.eta(
        etaPair.origin.coordinates,
        etaPair.destination.coordinates,
        env.OPENROUTESERVICE_PROFILE,
        ),
      );
      recordCacheCheck(
        report,
        'eta-route',
        requestsBeforeRepeat,
        repeated.ok &&
          repeated.value.distanceMeters === eta.value.distanceMeters &&
          repeated.value.durationSeconds === eta.value.durationSeconds,
      );
    } else {
      report.etaTest = {
        ok: false,
        httpStatus: eta.httpStatus,
        providerAttempts: requestAttempts - etaRequestCountBefore,
        failureCategory: eta.failureCategory,
        ...(eta.providerErrorCode ? { providerErrorCode: eta.providerErrorCode } : {}),
      };
    }
  }

  report.requestCounts = { attempts: requestAttempts, httpResponses };
  report.liveRequestsSent = requestAttempts > 0;
  const routeTestsPassed = report.routeTests.length === selectedRoutes.length &&
    report.routeTests.every((route) => route.ok === true);
  const matrixPassed = !includeMatrixAndEta || report.matrixTest?.ok === true;
  const etaPassed = !includeMatrixAndEta || report.etaTest?.ok === true;
  const geometryPassed = report.routeTests.every((route) => {
    const routes = route.routes;
    return (
      route.ok === true &&
      Array.isArray(routes) &&
      routes.every(
        (candidate) =>
          typeof candidate === 'object' &&
          candidate !== null &&
          'geometryValid' in candidate &&
          candidate.geometryValid === true,
      )
    );
  });
  const cacheChecksPassed =
    report.cacheChecks.length === selectedRoutes.length + (includeMatrixAndEta ? 2 : 0) &&
    report.cacheChecks.every((check) => check.cacheHit === true && check.repeatSucceeded === true);

  report.overallStatus =
    routeTestsPassed && matrixPassed && etaPassed && geometryPassed && cacheChecksPassed
      ? 'passed'
      : 'failed';
}

function emit(report: LiveReport): void {
  console.log(JSON.stringify(report, null, 2));
}

function parseOptions(args: string[]): {
  mode: LiveReport['mode'];
  routeId?: string;
  failure?: string;
} {
  let preflight = false;
  let routeId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--preflight' && !preflight) {
      preflight = true;
    } else if (argument === '--route' && routeId === undefined && args[index + 1]) {
      routeId = args[index + 1];
      index += 1;
    } else {
      return { mode: preflight ? 'preflight' : 'live', failure: 'invalid_arguments' };
    }
  }

  if (routeId && !routePairs.some((pair) => pair.id === routeId)) {
    return { mode: preflight ? 'preflight' : 'live', failure: 'unknown_route_id' };
  }
  return { mode: preflight ? 'preflight' : 'live', ...(routeId ? { routeId } : {}) };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const mode = options.mode;
  const routeId = options.routeId;
  const scope = routeId ? `route:${routeId}` : 'all';
  const report = createReport(mode, scope);
  if (options.failure) {
    report.overallStatus = 'blocked';
    report.failureCategory = options.failure;
    emit(report);
    process.exitCode = 2;
    return;
  }

  const configurationFailure = validateConfiguration();

  if (configurationFailure) {
    report.overallStatus = 'blocked';
    report.failureCategory = configurationFailure;
    emit(report);
    process.exitCode = 2;
    return;
  }

  if (mode === 'preflight') {
    report.overallStatus = 'not_run';
    emit(report);
    return;
  }

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const selectedRoutes = routeId
      ? routePairs.filter((pair) => pair.id === routeId)
      : routePairs;
    await runLive(report, selectedRoutes, routeId === undefined);
  } catch {
    report.overallStatus = 'failed';
    report.failureCategory = 'local_verification_error';
    report.requestCounts = { attempts: requestAttempts, httpResponses };
    report.liveRequestsSent = requestAttempts > 0;
  } finally {
    console.warn = originalWarn;
  }

  emit(report);
  if (report.overallStatus !== 'passed') process.exitCode = 1;
}

void main().catch(() => {
  console.log(JSON.stringify({
    reportType: 'ravero-ors-live-verification',
    mode: 'live',
    liveRequestsSent: requestAttempts > 0,
    overallStatus: 'failed',
    failureCategory: 'local_verification_error',
    requestCounts: { attempts: requestAttempts, httpResponses },
  }, null, 2));
  process.exitCode = 1;
});
