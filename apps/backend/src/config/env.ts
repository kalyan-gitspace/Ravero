import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(32).optional(),
);

const providerUrlSchema = z.string().url().refine(
  (value) => new URL(value).protocol === 'https:',
  'Provider URLs must use HTTPS.',
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  OTP_PROVIDER: z.enum(['development', 'sms']).optional(),
  ACCESS_TOKEN_SECRET: optionalSecretSchema,
  OTP_HASH_SECRET: optionalSecretSchema,
  DATABASE_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
  PHOTON_BASE_URL: providerUrlSchema.default('https://photon.komoot.io'),
  OPENROUTESERVICE_BASE_URL: providerUrlSchema.default('https://api.heigit.org/openrouteservice'),
  OPENROUTESERVICE_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().optional(),
  ),
  OPENROUTESERVICE_PROFILE: z.enum([
    'driving-car',
    'driving-hgv',
    'cycling-regular',
    'cycling-road',
    'cycling-mountain',
    'foot-walking',
    'foot-hiking',
  ]).default('driving-car'),
  MAP_TILE_STYLE_URL: z.string().url().refine(
    (value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.search;
    },
    'Map style URLs must use HTTPS and must not contain credentials or query parameters.',
  ).default('https://tiles.openfreemap.org/styles/liberty'),
  MAPS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  MAPS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidVariables = [
    ...new Set(parsedEnvironment.error.issues.map((issue) => issue.path.join('.'))),
  ];
  throw new Error(`Invalid environment configuration: ${invalidVariables.join(', ')}`);
}

const { DATABASE_URL, OPENROUTESERVICE_API_KEY, ...applicationEnvironment } = parsedEnvironment.data;
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
  DATABASE_URL,
  PHOTON_BASE_URL: publicEnvironment.PHOTON_BASE_URL,
  OPENROUTESERVICE_BASE_URL: publicEnvironment.OPENROUTESERVICE_BASE_URL,
  OPENROUTESERVICE_API_KEY,
  OPENROUTESERVICE_PROFILE: publicEnvironment.OPENROUTESERVICE_PROFILE,
  MAP_TILE_STYLE_URL: publicEnvironment.MAP_TILE_STYLE_URL,
  MAPS_CACHE_TTL_SECONDS: publicEnvironment.MAPS_CACHE_TTL_SECONDS,
  MAPS_REQUEST_TIMEOUT_MS: publicEnvironment.MAPS_REQUEST_TIMEOUT_MS,
  isDatabaseConfigured: Boolean(DATABASE_URL),
} as const;
