# Customer Booking API

These authenticated endpoints save customer booking requests for local development review. They are enabled only when the backend runs with `NODE_ENV=development`.

The current stage does not provide routing, geocoding, driver matching, dispatch, fare calculation by distance or time, or payment processing. A saved request remains `PENDING` until manually handled; no driver is notified. All location values are customer-supplied text and are not validated against live maps or service coverage.

## Service categories

The backend seed creates these active service types:

| Code | Display name |
|---|---|
| `AUTO` | Auto |
| `CAB` | Cab |
| `TWO_WHEELER` | Two-wheeler |

Run the existing idempotent seed after applying migrations to populate them.

## Estimate

`POST /api/v1/customer/bookings/estimate`

Requires a valid customer bearer access token.

Request:

```json
{
  "serviceTypeCode": "AUTO",
  "pickup": { "label": "Home", "address": "Banjara Hills, Hyderabad" },
  "dropoff": { "label": "Charminar", "address": "Old City, Hyderabad" },
  "stops": []
}
```

The optional `stops` field accepts up to three labelled, manually entered addresses. `scheduledAt` may be a future ISO 8601 date-time.

Response:

```json
{
  "success": true,
  "data": {
    "estimate": {
      "currency": "INR",
      "baseAmount": 120,
      "distanceAmount": 0,
      "timeAmount": 0,
      "totalAmount": 120,
      "isDevelopmentEstimate": true,
      "expiresAt": "2026-11-10T00:10:00.000Z"
    }
  }
}
```

The base amount comes from `DEV_FARE_BASE_AMOUNT` (default `120` INR). Distance and time are deliberately not estimated. The value is a local placeholder, not a quote or promise of service.

## Create a booking request

`POST /api/v1/customer/bookings`

Uses the same request body as estimate. Set an `Idempotency-Key` header (8–64 ASCII letters, digits, `.`, `_`, `:`, or `-`). Requests with the same customer, key, and body return the same booking. Reusing the key for a different request returns `409 IDEMPOTENCY_KEY_REUSED`.

Creation persists the booking, its manually entered pickup/drop-off/stops, a development-only base estimate, initial status history, and a pending cash-mode payment record. Cash mode records a payment method only; no payment is collected. Booking creation does not reserve a driver or dispatch a ride.

Response data contains `booking` with its id, `PENDING` status, service type, location text, fare estimate, `CASH` payment mode, and timestamps.

## List and retrieve bookings

- `GET /api/v1/customer/bookings` returns the authenticated customer’s latest 100 bookings.
- `GET /api/v1/customer/bookings/:bookingId` returns a booking only if it belongs to that customer.

Both require a valid customer bearer access token.

## Cancel a booking

`POST /api/v1/customer/bookings/:bookingId/cancel`

Only a `PENDING` request can be cancelled. The endpoint updates booking history and voids its pending cash-mode payment record. It does not notify a driver.

## Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request fields, category, or scheduled time |
| 400 | `SERVICE_TYPE_UNAVAILABLE` | The requested seeded service type is inactive or missing |
| 400 | `INVALID_IDEMPOTENCY_KEY` | The request key is missing or malformed |
| 401 | `AUTHENTICATION_REQUIRED` | A valid customer access token is required |
| 404 | `BOOKING_NOT_FOUND` | Booking does not exist for this customer |
| 409 | `IDEMPOTENCY_KEY_REUSED` | A key was reused with a different request body |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking is no longer pending |
| 429 | `BOOKING_RATE_LIMITED` | Too many booking creates from this IP |
| 429 | `BOOKING_ESTIMATE_RATE_LIMITED` | Too many estimates from this IP |
| 503 | `BOOKING_DEVELOPMENT_ONLY` | Booking foundation is disabled outside local development |

## Local setup

1. Apply the additive migration with `pnpm --filter @ravero/backend exec prisma migrate deploy`.
2. Run the existing seed with `pnpm --filter @ravero/backend db:seed`.
3. Keep `NODE_ENV=development` and configure `DEV_FARE_BASE_AMOUNT` in the ignored backend `.env` only if a different local placeholder amount is desired.
4. Start the backend and customer app using the local development commands in [Customer Authentication API](./api-authentication.md#local-development).
