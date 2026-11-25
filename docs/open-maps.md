# Open-source maps setup

RAVERO uses MapLibre for map rendering, OpenFreeMap styles and OSM-based tiles, Photon for
search and reverse geocoding, and openrouteservice for directions and matrices. Mobile
applications call the authenticated backend API; they do not call the geocoding or routing
providers directly. The ORS API key is server-only.

## Backend configuration

Copy `apps/backend/.env.example` to `apps/backend/.env` and set:

- `PHOTON_BASE_URL` — Photon service base URL. The default public Photon instance is
  suitable for development and small manual tests only. For production, operate an
  appropriately sized Photon service or select a provider/plan whose terms and capacity
  explicitly cover RAVERO's commercial traffic.
- `OPENROUTESERVICE_API_KEY` — obtain a key from the
  [openrouteservice developer portal](https://openrouteservice.org/dev/#/signup). Keep it
  in backend environment secrets; never add an `EXPO_PUBLIC_` or `VITE_` prefix.
- `OPENROUTESERVICE_BASE_URL` — ORS API base URL; the current default is
  `https://api.heigit.org/openrouteservice`. HeiGIT retired `api.openrouteservice.org`
  in November 2026; the routing provider and API key remain OpenRouteService. Check current
  usage limits and commercial terms before launch.
- `OPENROUTESERVICE_PROFILE` — defaults to `driving-car`. ORS does not provide an
  auto-rickshaw-specific profile; the default is a general road-routing approximation and
  does not model auto restrictions, informal roads, or live traffic.
- `MAP_TILE_STYLE_URL` — defaults to OpenFreeMap's Liberty style. Confirm the current
  OpenFreeMap service terms, attribution, capacity, and commercial use requirements for
  the expected production traffic. Do not treat a public tile endpoint as a guaranteed
  production service.
- The web renderer points MapLibre's worker to the same installed package version on
  unpkg because Expo Metro does not resolve MapLibre's package-relative worker URL.
  Production Content Security Policy must permit the worker's `blob:` URL and the pinned
  unpkg script.
- `MAPS_CACHE_TTL_SECONDS` and `MAPS_REQUEST_TIMEOUT_MS` — bounded in-memory cache
  lifetime and provider request timeout.

Do not use the public Nominatim instance for autocomplete. This implementation uses Photon.
For Photon/OSM results and maps, preserve the displayed `© OpenStreetMap contributors`
attribution and review the ODbL attribution and share-alike requirements for any
redistribution or derived database. Follow the selected Photon, tile, and ORS provider's
current usage limits, caching rules, attribution requirements, and commercial terms.
Customer autocomplete is debounced, returns up to 15 Photon results, and biases results
toward the selected opposite endpoint or the configured Hyderabad map center. The bias
affects ranking only; searches are limited to India but are not restricted to a Hyderabad
bounding box. Photon may return fewer results depending on its data and instance limits.

For physical-device development, set the customer app's `EXPO_PUBLIC_API_URL` to the
development machine's LAN address and configure the backend to listen on an interface
reachable from the device. Allow that port only on the trusted development network; do
not expose the development backend publicly. Rebuild/install the native app after adding
or changing native MapLibre dependencies. Emulator loopback addresses are not reachable
from a physical device.

## Local live ORS verification

The backend includes `apps/backend/scripts/verify-ors-live.ts` for an explicitly local
live check. Run it from `apps/backend` so `dotenv/config` loads that directory's `.env`.
The utility reuses `MapsService` and `OpenRouteServiceClient`, calls only
`https://api.heigit.org/openrouteservice`, refuses configured proxy use, disables redirects, and
never prints request headers, credentials, raw provider bodies, or exception messages.
It does not call Photon or start the backend server.

The script uses fixed representative coordinates for the named Hyderabad localities; it
does not geocode them. Check or adjust those anchors in the script if a different pickup
pin is intended. A live run makes six ORS requests: four directions, one 4-by-4 matrix,
and one ETA route. Repeated calls check the service's in-memory cache and should not add
provider requests.

Run a no-network configuration preflight first:

```powershell
Set-Location D:\Projects\Ravero\apps\backend
pnpm exec tsx .\scripts\verify-ors-live.ts --preflight
```

Then run the live validation and save its sanitized JSON report outside the repository:

```powershell
Set-Location D:\Projects\Ravero\apps\backend
$reportPath = Join-Path $env:TEMP 'ravero-ors-live-report.json'
pnpm exec tsx .\scripts\verify-ors-live.ts | Tee-Object -FilePath $reportPath
if ($LASTEXITCODE -ne 0) {
  throw "ORS verification did not pass. Review the sanitized report at $reportPath"
}
```

To rerun only Madhapur → HITEC City and its route-cache check:

```powershell
Set-Location D:\Projects\Ravero\apps\backend
$reportPath = Join-Path $env:TEMP 'ravero-ors-madhapur-hitec-report.json'
pnpm exec tsx .\scripts\verify-ors-live.ts --route madhapur-hitec |
  Tee-Object -FilePath $reportPath
if ($LASTEXITCODE -ne 0) {
  throw "The targeted ORS check did not pass. Review $reportPath"
}
```

The route-scoped run skips the matrix and ETA checks. The unqualified live command still
checks all four routes, the matrix, ETA, and their applicable cache hits.

The report's `mode: "live"`, HTTP status codes, route metrics, returned GeoJSON geometry,
alternative-route count, matrix, ETA, and cache checks are actual results only when the
live command has completed. A preflight report has `mode: "preflight"` and
`liveRequestsSent: false`; it is not routing evidence. Existing backend tests use mocked
providers and must not be reported as live results.

Example shape only (placeholder values, not live results):

```json
{
  "reportType": "ravero-ors-live-verification",
  "mode": "live",
  "liveRequestsSent": true,
  "overallStatus": "passed",
  "routeTests": [
    {
      "origin": "Charminar",
      "destination": "Gachibowli",
      "ok": true,
      "httpStatus": 200,
      "routesReturned": 1,
      "alternateRoutesAvailable": false,
      "routes": [
        {
          "distanceMeters": "<actual ORS value>",
          "durationSeconds": "<actual ORS value>",
          "geometryValid": true,
          "geometry": { "type": "LineString", "coordinates": "<actual ORS coordinates>" }
        }
      ]
    }
  ],
  "requestCounts": { "attempts": 6, "httpResponses": 6 }
}
```

The ORS client uses `MAPS_REQUEST_TIMEOUT_MS` (10 seconds by default) and retries exactly
once after a client-side timeout. A single observed timeout is not enough to conclude that
the timeout is too short, so the configured duration is unchanged. The retry does not
apply to HTTP responses, authentication failures, quota responses, invalid input, or
invalid provider data; the total wait for two timed-out attempts is at most twice the
configured timeout. `failureCategory` values include `authorization_error` (check that
the backend `.env` contains a valid active ORS key), `quota_or_rate_limit` (review the
ORS account quota and wait before retrying), `timeout` (check network connectivity and
the configured timeout), `provider_error`, `network_or_connection_error`,
`proxy_configuration_detected`, and `non_official_endpoint`. The utility intentionally
does not include raw errors or credentials in its report.

## API

All map service endpoints require a valid customer bearer access token and share a
60-requests-per-minute in-memory IP limit. The limit is per backend process; deploy a
shared limiter before horizontally scaling. Errors use the normal RAVERO
`{ success: false, error: { code, message } }` envelope.

- `GET /api/v1/maps/config` — safe client configuration (style URL, attribution, default
  Hyderabad camera, and routing profile).
- `GET /api/v1/maps/search?q=...&limit=15&lat=...&lon=...` — structured Photon results.
- `GET /api/v1/maps/places?q=...&limit=15&lat=...&lon=...` — autocomplete-style structured
  Photon results. The limit is capped at 15; `lat` and `lon` must be supplied together.
  Requests without a bias use the configured Hyderabad map center for relevance ranking.
- `GET /api/v1/maps/reverse?lat=...&lon=...` — structured address; returns a
  coordinate-derived label if Photon has no nearby feature.
- `POST /api/v1/maps/route` — `{ "origin": { "latitude": 17.4, "longitude": 78.4 },
  "destination": { "latitude": 17.5, "longitude": 78.5 } }`. Returns normalized route
  geometry, metres/kilometres, seconds/minutes, and alternatives where ORS supports them.
- `POST /api/v1/maps/matrix` — `{ "sources": [coordinates], "destinations":
  [coordinates] }`; each list accepts up to 25 coordinates. Matrix rows contain durations
  (seconds) and distances (metres), with `null` for unreachable pairs.
- `POST /api/v1/maps/eta` — `{ "origin": coordinates, "destination": coordinates }`;
  returns route distance, estimated duration, and an ETA timestamp.

Route, matrix, and ETA requests accept an optional `profile` from the backend's supported
profile list. `driving-car` is the current default for every ride category, including
auto-rickshaws. Configure a different profile only after checking ORS support and the
actual local routing result; no profile should be described as auto-rickshaw-aware.

Provider responses are normalized by the backend. Search and reverse results use
coordinates in `{ latitude, longitude }` order; route GeoJSON uses standard `[longitude,
latitude]` positions suitable for MapLibre. Provider credentials and upstream error
bodies are not returned to clients. Search, reverse, route, and matrix responses are
cached in process memory with bounded entry count and shorter routing TTLs.

## Database / PostGIS assessment

The current PostgreSQL schema stores booking coordinates as numeric values. Its existing
migrations enable `pgcrypto`, but do not install PostGIS or define PostGIS geometry types.
This migration does not require spatial SQL, so PostGIS was not enabled as part of the map
provider work. Evaluate a separately reviewed PostGIS migration before adding spatial
indexing, proximity queries, service-area geometry, or database-side route operations.

## Current readiness and limitations

- Photon/OSM coverage varies by locality and landmark; no complete Indian address coverage
  is claimed. Verify Hyderabad search results against the actual deployment and provide
  users a pin-on-map fallback.
- The customer ride preview opens its MapLibre route map in-place so returning to the
  preview retains the selected route, locations, ETA, and fare estimate. The map shows
  actual backend route geometry and available alternatives; tile availability still
  depends on the configured OpenFreeMap service.
- ORS traffic, turn restrictions, routing coverage, API quotas, and profiles can vary.
- The backend currently enforces local-only PostgreSQL URLs and booking is development
  only, so this repository is not production-deployment ready.
- Booking estimates remain the fixed development base fare; routed distance and duration
  are not used in fare calculation. Do not treat these estimates as production fares.
- The driver app is a scaffold. MapLibre and location packages are configured for future
  driver screens, but driver authentication, location tracking, and trip UI are not
  implemented.
