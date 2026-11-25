# Customer Booking API

These authenticated endpoints persist cash-mode customer ride requests. Booking endpoints remain limited to `NODE_ENV=development`; enabling this API does not make the service production-ready.

## Supported service

Only `AUTO` has an approved fare model. Other service types remain unbookable until their fare rules are approved. Fare estimates currently support a direct pickup-to-destination route; requests with stops are rejected rather than underquoted.

## Route quote

`POST /api/v1/maps/route` returns ORS route alternatives. Each `driving-car` alternative includes a signed `fareRouteToken` bound to the authenticated customer and exact pickup and destination coordinates. Tokens expire after ten minutes and cannot be changed by the customer.

Use the token belonging to the selected alternative for both estimate and booking creation. The backend verifies the signature and calculates the fare from its signed ORS distance; it never trusts a client-supplied distance.

## Estimate

`POST /api/v1/customer/bookings/estimate`

Requires a valid customer bearer access token and the route token from the selected ORS alternative.

```json
{
  "serviceTypeCode": "AUTO",
  "pickup": {
    "label": "Home",
    "address": "Banjara Hills, Hyderabad",
    "latitude": 17.4123,
    "longitude": 78.4482
  },
  "dropoff": {
    "label": "Charminar",
    "address": "Old City, Hyderabad",
    "latitude": 17.3616,
    "longitude": 78.4747
  },
  "stops": [],
  "fareRouteToken": "<selected route token>"
}
```

The approved progressive fare is:

| Route distance | Rate |
|---|---:|
| First 1.6 km | ₹30 fixed |
| 1.6–5 km | ₹13/km |
| 5–10 km | ₹11/km |
| 10–20 km | ₹10.50/km |
| Above 20 km | ₹10/km |

Rates apply only to distance within each slab. The final fare is rounded once to the nearest paisa using half-up rounding. There is no per-minute charge, surge, platform fee, driver commission, tax, or other added charge. The response includes the distance and fare breakdown; `timeAmount`, `platformFeeAmount`, and `driverCommissionAmount` are zero.

## Create a booking request

`POST /api/v1/customer/bookings`

Uses the same request as the estimate and requires an `Idempotency-Key` header (8–64 ASCII letters, digits, `.`, `_`, `:`, or `-`). Requests with the same customer, key, and body return the same booking. Reusing the key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`. An identical retry can return the persisted booking even after its quote expires.

Creation persists the booking, selected locations, route distance, fare breakdown, initial `REQUESTED` status history, and a pending cash payment record. Cash mode records a payment method only; no payment is collected. Booking creation does not itself dispatch a driver.

## List, retrieve, and cancel

- `GET /api/v1/customer/bookings` returns the authenticated customer’s latest 100 bookings.
- `GET /api/v1/customer/bookings/:bookingId` returns a booking only if it belongs to that customer.
- `POST /api/v1/customer/bookings/:bookingId/cancel` cancels a `REQUESTED` booking and voids its pending cash payment record.

## Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request fields |
| 400 | `SERVICE_TYPE_UNAVAILABLE` | The category is inactive or has no approved fare model |
| 400 | `FARE_ROUTE_QUOTE_INVALID` | Route quote does not match the user or trip |
| 400 | `INVALID_ROUTE_DISTANCE` | ORS returned an invalid distance |
| 400 | `FARE_ROUTE_STOPS_UNSUPPORTED` | Stop routes are not included in the selected route quote |
| 400 | `INVALID_IDEMPOTENCY_KEY` | The request key is missing or malformed |
| 401 | `AUTHENTICATION_REQUIRED` | A valid customer access token is required |
| 404 | `BOOKING_NOT_FOUND` | Booking does not exist for this customer |
| 409 | `FARE_ROUTE_QUOTE_EXPIRED` | Route quote expired; calculate a new route |
| 409 | `IDEMPOTENCY_KEY_REUSED` | A key was reused with a different request body |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking is no longer requested |
| 429 | `BOOKING_RATE_LIMITED` | Too many booking creates from this IP |
| 429 | `BOOKING_ESTIMATE_RATE_LIMITED` | Too many estimates from this IP |
| 503 | `BOOKING_DEVELOPMENT_ONLY` | Booking APIs are disabled outside local development |

## Local setup

1. Apply migrations with `corepack pnpm@12.18.0 --filter @ravero/backend exec prisma migrate deploy`.
2. Run the existing seed with `corepack pnpm@12.18.0 --filter @ravero/backend db:seed`.
3. Keep `NODE_ENV=development` and configure the local PostgreSQL URL and stable backend secrets in the ignored backend `.env`.
4. Start the backend and customer app using the local development commands in [Customer Authentication API](./api-authentication.md#local-development).
