import type { RequestHandler } from 'express';
import type { CustomerAuthService } from '../auth/service.js';
import { AppError } from '../errors/AppError.js';

export function requireCustomer(authService: CustomerAuthService): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
      return;
    }

    try {
      request.customerAuth = await authService.authenticateAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
