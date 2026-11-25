import { type Request, type Router, Router as createRouter } from 'express';
import { z } from 'zod';
import { driverAuthService } from '../../auth/runtime.js';
import type { DriverAuthService } from '../../auth/driverService.js';
import { AppError } from '../../errors/AppError.js';
import { DriverService } from '../../driver/service.js';
import { PrismaDriverRepository } from '../../driver/prismaRepository.js';
import { requireDriver } from '../../middleware/requireDriver.js';
import { createRateLimit } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validateRequest.js';

const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200).optional(),
    driverLicenseNumber: z.string().trim().min(3).max(64).optional(),
    vehicle: z
      .object({
        make: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(80),
        year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
        color: z.string().trim().min(1).max(64),
        plateNumber: z.string().trim().min(3).max(32),
        registrationNumber: z.string().trim().min(3).max(64),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required.');

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
});

const rideStatusSchema = z.object({
  status: z.enum(['DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'CANCELLED']),
});

function requireDriverId(request: Request): string {
  const auth = request.driverAuth;
  if (!auth) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Driver authentication is required.');
  }
  return auth.userId;
}

function requireRouteId(value: string | string[] | undefined, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'INVALID_REQUEST_ID', `${field} must be a valid identifier.`);
  }
  return value;
}

export function createDriverRouter(
  authService: DriverAuthService = driverAuthService,
  driverService: DriverService = new DriverService(new PrismaDriverRepository()),
): Router {
  const router = createRouter();
  router.use(requireDriver(authService));

  router.get('/profile', async (request, response) => {
    const profile = await driverService.getProfile(requireDriverId(request));
    response.json({ success: true, data: { profile } });
  });

  router.patch('/profile', validateBody(profileSchema), async (request, response) => {
    const profile = await driverService.updateProfile(
      requireDriverId(request),
      request.body as z.infer<typeof profileSchema>,
    );
    response.json({ success: true, data: { profile } });
  });

  router.put('/availability', validateBody(availabilitySchema), async (request, response) => {
    const body = request.body as z.infer<typeof availabilitySchema>;
    const coordinates =
      body.latitude !== undefined && body.longitude !== undefined
        ? { latitude: body.latitude, longitude: body.longitude }
        : null;
    const profile = await driverService.setAvailability(
      requireDriverId(request),
      body.isAvailable,
      coordinates,
    );
    response.json({ success: true, data: { profile } });
  });

  router.post(
    '/location',
    createRateLimit({
      windowMs: 60 * 1000,
      maxRequests: 24,
      code: 'DRIVER_LOCATION_RATE_LIMITED',
      message: 'Location is updating too frequently. Please wait before trying again.',
    }),
    validateBody(coordinatesSchema),
    async (request, response) => {
      const coordinates = request.body as z.infer<typeof coordinatesSchema>;
      await driverService.updateLocation(requireDriverId(request), coordinates);
      response.json({ success: true, data: { updated: true } });
    },
  );

  router.get(
    '/requests',
    createRateLimit({
      windowMs: 60 * 1000,
      maxRequests: 20,
      code: 'DRIVER_REQUEST_RATE_LIMITED',
      message: 'Ride requests are being refreshed too frequently. Please wait.',
    }),
    async (request, response) => {
      const requests = await driverService.listRequests(requireDriverId(request));
      response.json({ success: true, data: { requests } });
    },
  );

  router.post('/requests/:bookingId/accept', async (request, response) => {
    const ride = await driverService.acceptRequest(
      requireDriverId(request),
      requireRouteId(request.params.bookingId, 'bookingId'),
    );
    response.json({ success: true, data: { ride } });
  });

  router.post('/requests/:bookingId/reject', async (request, response) => {
    await driverService.rejectRequest(
      requireDriverId(request),
      requireRouteId(request.params.bookingId, 'bookingId'),
    );
    response.json({ success: true, data: { rejected: true } });
  });

  router.patch('/rides/:bookingId/status', validateBody(rideStatusSchema), async (request, response) => {
    const { status } = request.body as z.infer<typeof rideStatusSchema>;
    const ride = await driverService.updateRideStatus(
      requireDriverId(request),
      requireRouteId(request.params.bookingId, 'bookingId'),
      status,
    );
    response.json({ success: true, data: { ride } });
  });

  router.get('/rides', async (request, response) => {
    const rides = await driverService.listRides(requireDriverId(request));
    response.json({ success: true, data: { rides } });
  });

  router.get('/earnings', async (request, response) => {
    const earnings = await driverService.getEarnings(requireDriverId(request));
    response.json({ success: true, data: { earnings } });
  });

  router.get('/notifications', async (request, response) => {
    const notifications = await driverService.getNotifications(requireDriverId(request));
    response.json({ success: true, data: { notifications } });
  });

  router.patch('/notifications/:notificationId/read', async (request, response) => {
    await driverService.markNotificationRead(
      requireDriverId(request),
      requireRouteId(request.params.notificationId, 'notificationId'),
    );
    response.json({ success: true, data: { read: true } });
  });

  return router;
}

export const driverRouter: Router = createDriverRouter();
