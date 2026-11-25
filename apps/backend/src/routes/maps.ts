import { type Router, Router as createRouter } from 'express';
import { z } from 'zod';
import type { CustomerAuthService } from '../auth/service.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { createFareRouteToken } from '../booking/routeQuote.js';
import { MapsService, supportedRoutingProfiles } from '../maps/service.js';
import { OpenRouteServiceClient } from '../maps/openRouteServiceClient.js';
import { PhotonClient } from '../maps/photonClient.js';
import type { Coordinates } from '../maps/types.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { requireCustomer } from '../middleware/requireCustomer.js';

const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const profileSchema = z.enum(supportedRoutingProfiles);

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(256),
  limit: z.coerce.number().int().min(1).max(15).default(15),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lon: z.coerce.number().finite().min(-180).max(180).optional(),
}).strict().refine(
  (query) => (query.lat === undefined) === (query.lon === undefined),
  { message: 'lat and lon must be supplied together.' },
);

const reverseQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lon: z.coerce.number().finite().min(-180).max(180),
}).strict();

const routeSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  profile: profileSchema.optional(),
  alternatives: z.boolean().default(true),
}).strict();

const matrixSchema = z.object({
  sources: z.array(coordinateSchema).min(1).max(25),
  destinations: z.array(coordinateSchema).min(1).max(25),
  profile: profileSchema.optional(),
}).strict();

const etaSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  profile: profileSchema.optional(),
}).strict();

const defaultMapsService = new MapsService({
  photon: new PhotonClient({
    baseUrl: env.PHOTON_BASE_URL,
    timeoutMs: env.MAPS_REQUEST_TIMEOUT_MS,
  }),
  routing: new OpenRouteServiceClient({
    baseUrl: env.OPENROUTESERVICE_BASE_URL,
    apiKey: env.OPENROUTESERVICE_API_KEY,
    timeoutMs: env.MAPS_REQUEST_TIMEOUT_MS,
  }),
  tileStyleUrl: env.MAP_TILE_STYLE_URL,
  routingProfile: env.OPENROUTESERVICE_PROFILE,
  cacheTtlSeconds: env.MAPS_CACHE_TTL_SECONDS,
});

function mapProfile(requestedProfile: string | undefined, mapsService: MapsService): string {
  return requestedProfile ?? mapsService.getConfig().routingProfile;
}

function optionalBias(lat: number | undefined, lon: number | undefined): Coordinates | undefined {
  return lat === undefined || lon === undefined ? undefined : { latitude: lat, longitude: lon };
}

function searchBias(
  lat: number | undefined,
  lon: number | undefined,
  mapsService: MapsService,
): Coordinates {
  return optionalBias(lat, lon) ?? mapsService.getConfig().defaultCenter;
}

export function createMapsRouter(
  authService: CustomerAuthService,
  mapsService: MapsService = defaultMapsService,
): Router {
  const router = createRouter();
  router.use(requireCustomer(authService));
  router.use(createRateLimit({
    windowMs: 60 * 1000,
    maxRequests: 60,
    code: 'MAPS_RATE_LIMITED',
    message: 'Too many map requests. Please wait before trying again.',
  }));

  router.get('/config', (_request, response) => {
    response.json({ success: true, data: mapsService.getConfig() });
  });

  router.get('/search', async (request, response) => {
    const query = searchQuerySchema.parse(request.query);
    const results = await mapsService.search(
      query.q,
      query.limit,
      searchBias(query.lat, query.lon, mapsService),
    );
    response.json({ success: true, data: { results } });
  });

  router.get('/places', async (request, response) => {
    const query = searchQuerySchema.parse(request.query);
    const places = await mapsService.search(
      query.q,
      query.limit,
      searchBias(query.lat, query.lon, mapsService),
    );
    response.json({ success: true, data: { places } });
  });

  router.get('/reverse', async (request, response) => {
    const query = reverseQuerySchema.parse(request.query);
    const result = await mapsService.reverse({ latitude: query.lat, longitude: query.lon });
    response.json({ success: true, data: { result } });
  });

  router.post('/route', async (request, response) => {
    const body = routeSchema.parse(request.body);
    const profile = mapProfile(body.profile, mapsService);
    const routes = await mapsService.route(
      body.origin,
      body.destination,
      profile,
      body.alternatives,
    );
    const auth = request.customerAuth;
    if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    response.json({
      success: true,
      data: {
        routes: routes.map((route) => ({
          ...route,
          ...(profile === 'driving-car'
            ? {
                fareRouteToken: createFareRouteToken({
                  customerId: auth.userId,
                  origin: body.origin,
                  destination: body.destination,
                  distanceMeters: route.distanceMeters,
                  durationSeconds: route.durationSeconds,
                  profile: route.profile,
                }, env.ACCESS_TOKEN_SECRET),
              }
            : {}),
        })),
      },
    });
  });

  router.post('/matrix', async (request, response) => {
    const body = matrixSchema.parse(request.body);
    const matrix = await mapsService.matrix(
      body.sources,
      body.destinations,
      mapProfile(body.profile, mapsService),
    );
    response.json({ success: true, data: { matrix } });
  });

  router.post('/eta', async (request, response) => {
    const body = etaSchema.parse(request.body);
    const eta = await mapsService.eta(
      body.origin,
      body.destination,
      mapProfile(body.profile, mapsService),
    );
    response.json({ success: true, data: { eta } });
  });

  router.use((_request, _response, next) => {
    next(new AppError(404, 'MAPS_ENDPOINT_NOT_FOUND', 'Maps endpoint not found.'));
  });
  return router;
}
