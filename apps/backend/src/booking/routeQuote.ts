import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import type { Coordinates } from '../maps/types.js';

const TOKEN_CONTEXT = 'ravero-fare-route-v1';
export const FARE_ROUTE_QUOTE_TTL_MS = 10 * 60 * 1000;

export interface FareRouteQuote {
  customerId: string;
  origin: Coordinates;
  destination: Coordinates;
  distanceMeters: number;
  durationSeconds: number;
  profile: string;
  expiresAt: number;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_CONTEXT}.${payload}`)
    .digest('base64url');
}

export function createFareRouteToken(
  quote: Omit<FareRouteQuote, 'expiresAt'>,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({
    ...quote,
    expiresAt: now + FARE_ROUTE_QUOTE_TTL_MS,
  })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyFareRouteToken(
  token: string,
  expected: {
    customerId: string;
    origin: Coordinates;
    destination: Coordinates;
  },
  secret: string,
  now = Date.now(),
): FareRouteQuote {
  const parts = token.split('.');
  if (
    parts.length !== 2 ||
    token.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    throw invalidQuoteError();
  }

  const expectedSignature = Buffer.from(signature(parts[0], secret), 'base64url');
  const receivedSignature = Buffer.from(parts[1], 'base64url');
  if (
    expectedSignature.length !== receivedSignature.length ||
    !timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    throw invalidQuoteError();
  }

  let quote: unknown;
  try {
    quote = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw invalidQuoteError();
  }

  if (!isFareRouteQuote(quote)) {
    throw invalidQuoteError();
  }

  if (
    quote.customerId !== expected.customerId ||
    quote.profile !== 'driving-car' ||
    !sameCoordinates(quote.origin, expected.origin) ||
    !sameCoordinates(quote.destination, expected.destination)
  ) {
    throw invalidQuoteError();
  }

  if (quote.expiresAt <= now) {
    throw new AppError(409, 'FARE_ROUTE_QUOTE_EXPIRED', 'The route quote has expired. Please calculate the route again.');
  }

  return quote;
}

function isFareRouteQuote(value: unknown): value is FareRouteQuote {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'customerId' in value &&
      typeof value.customerId === 'string' &&
      'origin' in value &&
      isCoordinates(value.origin) &&
      'destination' in value &&
      isCoordinates(value.destination) &&
      'distanceMeters' in value &&
      typeof value.distanceMeters === 'number' &&
      Number.isFinite(value.distanceMeters) &&
      value.distanceMeters > 0 &&
      'durationSeconds' in value &&
      typeof value.durationSeconds === 'number' &&
      Number.isFinite(value.durationSeconds) &&
      value.durationSeconds >= 0 &&
      'profile' in value &&
      typeof value.profile === 'string' &&
      'expiresAt' in value &&
      typeof value.expiresAt === 'number' &&
      Number.isSafeInteger(value.expiresAt),
  );
}

function isCoordinates(value: unknown): value is Coordinates {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'latitude' in value &&
      typeof value.latitude === 'number' &&
      'longitude' in value &&
      typeof value.longitude === 'number' &&
      Number.isFinite(value.latitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      Number.isFinite(value.longitude) &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

function sameCoordinates(first: Coordinates, second: Coordinates): boolean {
  return first.latitude === second.latitude && first.longitude === second.longitude;
}

function invalidQuoteError(): AppError {
  return new AppError(400, 'FARE_ROUTE_QUOTE_INVALID', 'The selected route quote is invalid for this trip.');
}
