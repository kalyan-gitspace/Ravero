import { type Router, Router as createRouter } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { createRateLimit } from '../../middleware/rateLimit.js';
import { requireCustomer } from '../../middleware/requireCustomer.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { customerAuthService } from '../../auth/runtime.js';
import { CustomerBookingService } from '../../booking/service.js';
import { PrismaBookingRepository } from '../../booking/prismaRepository.js';
import type { CreateBookingInput } from '../../booking/types.js';

const locationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  address: z.string().trim().min(3).max(255),
});

const createBookingSchema = z.object({
  serviceTypeCode: z.enum(['AUTO', 'CAB', 'TWO_WHEELER']),
  pickup: locationSchema,
  dropoff: locationSchema,
  stops: z.array(locationSchema).max(3).default([]),
  scheduledAt: z.iso.datetime().optional(),
});

const bookingService = new CustomerBookingService(new PrismaBookingRepository(), {
  developmentBaseFare: env.DEV_FARE_BASE_AMOUNT,
});

function parseBookingInput(value: z.infer<typeof createBookingSchema>): CreateBookingInput {
  const { scheduledAt: scheduledAtInput, ...request } = value;
  const scheduledAt = scheduledAtInput ? new Date(scheduledAtInput) : undefined;
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new AppError(400, 'SCHEDULED_TIME_INVALID', 'Scheduled time must be in the future.');
  }
  return {
    ...request,
    ...(scheduledAt ? { scheduledAt } : {}),
  };
}

export function createBookingRouter(): Router {
  const router = createRouter();
  router.use((_request, _response, next) => {
    if (env.NODE_ENV !== 'development') {
      next(new AppError(503, 'BOOKING_DEVELOPMENT_ONLY', 'Booking requests are not enabled outside local development.'));
      return;
    }
    next();
  });
  router.use(requireCustomer(customerAuthService));

  router.post(
    '/estimate',
    createRateLimit({
      windowMs: 60 * 1000,
      maxRequests: 30,
      code: 'BOOKING_ESTIMATE_RATE_LIMITED',
      message: 'Too many fare estimate requests. Please wait before trying again.',
    }),
    validateBody(createBookingSchema),
    async (request, response) => {
      const estimate = await bookingService.estimate(
        parseBookingInput(request.body as z.infer<typeof createBookingSchema>),
      );
      response.json({ success: true, data: { estimate } });
    },
  );

  router.post(
    '/',
    createRateLimit({
      windowMs: 60 * 1000,
      maxRequests: 10,
      code: 'BOOKING_RATE_LIMITED',
      message: 'Too many booking requests. Please wait before trying again.',
    }),
    validateBody(createBookingSchema),
    async (request, response) => {
      const auth = request.customerAuth;
      if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');

      const providedKey = request.header('idempotency-key');
      if (!providedKey || !/^[A-Za-z0-9._:-]{8,64}$/.test(providedKey)) {
        throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'The idempotency key format is invalid.');
      }

      const booking = await bookingService.create(
        auth.userId,
        parseBookingInput(request.body as z.infer<typeof createBookingSchema>),
        providedKey,
      );
      response.status(201).json({ success: true, data: { booking } });
    },
  );

  router.get('/', async (request, response) => {
    const auth = request.customerAuth;
    if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    const bookings = await bookingService.list(auth.userId);
    response.json({ success: true, data: { bookings } });
  });

  router.get('/:bookingId', async (request, response) => {
    const auth = request.customerAuth;
    if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    const booking = await bookingService.get(auth.userId, request.params.bookingId);
    response.json({ success: true, data: { booking } });
  });

  router.post('/:bookingId/cancel', async (request, response) => {
    const auth = request.customerAuth;
    if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    const booking = await bookingService.cancel(auth.userId, request.params.bookingId);
    response.json({ success: true, data: { booking } });
  });

  return router;
}

export const bookingRouter = createBookingRouter();
