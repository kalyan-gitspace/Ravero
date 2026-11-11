import { type Router, Router as createRouter } from 'express';
import { z } from 'zod';
import type { CustomerAuthService } from '../../auth/service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { AppError } from '../../errors/AppError.js';
import { GoogleMapsService } from '../../maps/googleMapsService.js';
import { PrismaGoogleMapsUsageRepository } from '../../maps/prismaGoogleMapsUsageRepository.js';
import type { GoogleMapsSku } from '../../maps/types.js';
import { createRateLimit } from '../../middleware/rateLimit.js';
import { requireCustomer } from '../../middleware/requireCustomer.js';
import { validateBody } from '../../middleware/validateRequest.js';

const sessionTokenSchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const autocompleteSchema = z.object({
  input: z.string().trim().min(1).max(256),
  sessionToken: sessionTokenSchema,
}).strict();

const placeDetailsSchema = z.object({
  placeId: z.string().trim().min(1).max(256),
  sessionToken: sessionTokenSchema.optional(),
}).strict();

const reverseGeocodeSchema = z.object({
  location: coordinatesSchema,
}).strict();

const computeRouteSchema = z.object({
  origin: coordinatesSchema,
  destination: coordinatesSchema,
  travelMode: z.enum(['DRIVE', 'WALK', 'BICYCLE']).default('DRIVE'),
}).strict();

const usageLimits: Partial<Record<GoogleMapsSku, number>> = {
  AUTOCOMPLETE_REQUESTS: env.GOOGLE_MAPS_MONTHLY_LIMIT_AUTOCOMPLETE_REQUESTS,
  PLACE_DETAILS_ESSENTIALS: env.GOOGLE_MAPS_MONTHLY_LIMIT_PLACE_DETAILS_ESSENTIALS,
  GEOCODING: env.GOOGLE_MAPS_MONTHLY_LIMIT_GEOCODING,
  ROUTES_COMPUTE_ESSENTIALS: env.GOOGLE_MAPS_MONTHLY_LIMIT_ROUTES_COMPUTE_ESSENTIALS,
  DYNAMIC_MAPS_LOADS: env.GOOGLE_MAPS_MONTHLY_LIMIT_DYNAMIC_MAPS_LOADS,
};

const defaultGoogleMapsService = new GoogleMapsService({
  apiKey: env.GOOGLE_MAPS_SERVER_API_KEY,
  monthlyLimits: usageLimits,
  usageRepository: new PrismaGoogleMapsUsageRepository(prisma),
});

export function createGoogleMapsRouter(
  authService: CustomerAuthService,
  googleMapsService: GoogleMapsService = defaultGoogleMapsService,
): Router {
  const router = createRouter();
  router.use(requireCustomer(authService));

  const rateLimit = createRateLimit({
    windowMs: 60 * 1000,
    maxRequests: 60,
    code: 'GOOGLE_MAPS_RATE_LIMITED',
    message: 'Too many Google Maps requests. Please wait before trying again.',
  });

  router.post(
    '/dynamic-maps/reserve-load',
    rateLimit,
    validateBody(z.object({}).strict()),
    async (_request, response) => {
      await googleMapsService.reserveDynamicMapLoad();
      response.json({ success: true, data: { reserved: true } });
    },
  );

  router.post(
    '/places/autocomplete',
    rateLimit,
    validateBody(autocompleteSchema),
    async (request, response) => {
      const { input, sessionToken } = request.body as z.infer<typeof autocompleteSchema>;
      const result = await googleMapsService.autocomplete(input, sessionToken);
      response.json({ success: true, data: result });
    },
  );

  router.post(
    '/places/details',
    rateLimit,
    validateBody(placeDetailsSchema),
    async (request, response) => {
      const { placeId, sessionToken } = request.body as z.infer<typeof placeDetailsSchema>;
      const result = await googleMapsService.placeDetails(placeId, sessionToken);
      response.json({ success: true, data: { place: result } });
    },
  );

  router.post(
    '/geocoding/reverse',
    rateLimit,
    validateBody(reverseGeocodeSchema),
    async (request, response) => {
      const { location } = request.body as z.infer<typeof reverseGeocodeSchema>;
      const result = await googleMapsService.reverseGeocode(location);
      response.json({ success: true, data: result });
    },
  );

  router.post(
    '/routes/compute',
    rateLimit,
    validateBody(computeRouteSchema),
    async (request, response) => {
      const { origin, destination, travelMode } =
        request.body as z.infer<typeof computeRouteSchema>;
      const route = await googleMapsService.computeRoute(origin, destination, travelMode);
      response.json({ success: true, data: { route } });
    },
  );

  router.use((_request, _response, next) => {
    next(new AppError(404, 'GOOGLE_MAPS_ENDPOINT_NOT_FOUND', 'Google Maps endpoint not found.'));
  });
  return router;
}
