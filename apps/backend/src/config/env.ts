import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(32).optional(),
);

const optionalPositiveIntegerSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().max(2_147_483_647).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  DEV_FARE_BASE_AMOUNT: z.coerce.number().finite().nonnegative().max(100_000).default(120),
  OTP_PROVIDER: z.enum(['development', 'sms']).optional(),
  ACCESS_TOKEN_SECRET: optionalSecretSchema,
  OTP_HASH_SECRET: optionalSecretSchema,
  DATABASE_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
  GOOGLE_MAPS_SERVER_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().min(1).optional(),
  ),
  GOOGLE_MAPS_MONTHLY_LIMIT_AUTOCOMPLETE_REQUESTS: optionalPositiveIntegerSchema,
  GOOGLE_MAPS_MONTHLY_LIMIT_PLACE_DETAILS_ESSENTIALS: optionalPositiveIntegerSchema,
  GOOGLE_MAPS_MONTHLY_LIMIT_GEOCODING: optionalPositiveIntegerSchema,
  GOOGLE_MAPS_MONTHLY_LIMIT_ROUTES_COMPUTE_ESSENTIALS: optionalPositiveIntegerSchema,
  GOOGLE_MAPS_MONTHLY_LIMIT_DYNAMIC_MAPS_LOADS: optionalPositiveIntegerSchema,
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidVariables = [
    ...new Set(parsedEnvironment.error.issues.map((issue) => issue.path.join('.'))),
  ];
  throw new Error(`Invalid environment configuration: ${invalidVariables.join(', ')}`);
}

const {
  DATABASE_URL,
  GOOGLE_MAPS_SERVER_API_KEY,
  ...applicationEnvironment
} = parsedEnvironment.data;
const { ACCESS_TOKEN_SECRET, OTP_HASH_SECRET, OTP_PROVIDER, ...publicEnvironment } =
  applicationEnvironment;

if (publicEnvironment.NODE_ENV === 'production') {
  if (!ACCESS_TOKEN_SECRET || !OTP_HASH_SECRET) {
    throw new Error('ACCESS_TOKEN_SECRET and OTP_HASH_SECRET are required in production.');
  }
  if (OTP_PROVIDER === 'development') {
    throw new Error('The development OTP provider cannot be enabled in production.');
  }
}

if (DATABASE_URL) {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  if (!localHosts.has(databaseUrl.hostname)) {
    throw new Error('DATABASE_URL must point to a local PostgreSQL host.');
  }
  if (decodeURIComponent(databaseUrl.pathname.slice(1)) !== 'ravero_db') {
    throw new Error('DATABASE_URL must target the local ravero_db database.');
  }
}

export const env = {
  ...publicEnvironment,
  ACCESS_TOKEN_SECRET: ACCESS_TOKEN_SECRET ?? randomBytes(32).toString('hex'),
  OTP_HASH_SECRET: OTP_HASH_SECRET ?? randomBytes(32).toString('hex'),
  OTP_PROVIDER: OTP_PROVIDER ?? (publicEnvironment.NODE_ENV === 'production' ? 'sms' : 'development'),
  DEV_FARE_BASE_AMOUNT: publicEnvironment.DEV_FARE_BASE_AMOUNT,
  DATABASE_URL,
  GOOGLE_MAPS_SERVER_API_KEY,
  GOOGLE_MAPS_MONTHLY_LIMIT_AUTOCOMPLETE_REQUESTS:
    publicEnvironment.GOOGLE_MAPS_MONTHLY_LIMIT_AUTOCOMPLETE_REQUESTS,
  GOOGLE_MAPS_MONTHLY_LIMIT_PLACE_DETAILS_ESSENTIALS:
    publicEnvironment.GOOGLE_MAPS_MONTHLY_LIMIT_PLACE_DETAILS_ESSENTIALS,
  GOOGLE_MAPS_MONTHLY_LIMIT_GEOCODING: publicEnvironment.GOOGLE_MAPS_MONTHLY_LIMIT_GEOCODING,
  GOOGLE_MAPS_MONTHLY_LIMIT_ROUTES_COMPUTE_ESSENTIALS:
    publicEnvironment.GOOGLE_MAPS_MONTHLY_LIMIT_ROUTES_COMPUTE_ESSENTIALS,
  GOOGLE_MAPS_MONTHLY_LIMIT_DYNAMIC_MAPS_LOADS:
    publicEnvironment.GOOGLE_MAPS_MONTHLY_LIMIT_DYNAMIC_MAPS_LOADS,
  isDatabaseConfigured: Boolean(DATABASE_URL),
} as const;
