import { type Router, Router as createRouter } from 'express';
import { updateCustomerProfileSchema } from '../../auth/schemas.js';
import { customerAuthService } from '../../auth/runtime.js';
import type { CustomerAuthService } from '../../auth/service.js';
import { requireCustomer } from '../../middleware/requireCustomer.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { bookingRouter } from './bookings.js';

export function createCustomerRouter(authService: CustomerAuthService): Router {
  const router = createRouter();

  router.use('/bookings', bookingRouter);

  router.get('/profile', requireCustomer(authService), async (request, response) => {
    const auth = request.customerAuth;
    if (!auth) {
      response.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      });
      return;
    }

    const customer = await authService.getProfile(auth.userId);
    response.json({ success: true, data: { customer } });
  });

  router.patch(
    '/profile',
    requireCustomer(authService),
    validateBody(updateCustomerProfileSchema),
    async (request, response) => {
      const auth = request.customerAuth;
      if (!auth) {
        response.status(401).json({
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
        });
        return;
      }

      const customer = await authService.updateProfile(
        auth.userId,
        request.body as {
          fullName?: string;
          email?: string | null;
          profileImageUrl?: string | null;
        },
      );
      response.json({ success: true, data: { customer } });
    },
  );

  return router;
}

export const customerRouter = createCustomerRouter(customerAuthService);
