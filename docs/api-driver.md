# Driver API

All driver endpoints require a driver access token in `Authorization: Bearer <token>`. Tokens are issued by the driver OTP endpoints and are validated against an active driver session. Driver IDs are taken from the token; the API does not accept a caller-supplied driver ID.

Successful responses use `{ "success": true, "data": ... }`. Errors use the shared API error envelope.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/driver/send-otp` | Request a sign-in code |
| `POST` | `/api/v1/auth/driver/verify-otp` | Verify a code and create a driver session |
| `POST` | `/api/v1/auth/driver/refresh` | Rotate the refresh token |
| `POST` | `/api/v1/auth/driver/logout` | Revoke the current session |

`verify-otp` accepts `{ phone, otp, fullName? }`. A name is required when the phone number is creating a driver profile for the first time.

## Profile and availability

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/driver/profile` | Read the authenticated driver's profile and document statuses |
| `PATCH` | `/api/v1/driver/profile` | Update name, driving licence number, or Auto vehicle metadata |
| `PUT` | `/api/v1/driver/availability` | Go online or offline |
| `POST` | `/api/v1/driver/location` | Update the current location while online |

Profile updates accept document metadata only; binary uploads are not implemented. Changing the licence number or vehicle metadata resets the relevant verification state and takes the driver offline. Going online requires an active, phone-verified driver account, an approved profile and driving licence, and an approved Auto vehicle/RC.

An online request must include valid `latitude` and `longitude`. Location updates are accepted only while online. The mobile app uses foreground location permission and stops sending updates while backgrounded.

## Requests and ride lifecycle

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/driver/requests` | Get current nearby Auto ride offers |
| `POST` | `/api/v1/driver/requests/:bookingId/accept` | Atomically accept a live offer |
| `POST` | `/api/v1/driver/requests/:bookingId/reject` | Reject a live offer |
| `PATCH` | `/api/v1/driver/rides/:bookingId/status` | Advance or cancel an assigned ride |
| `GET` | `/api/v1/driver/rides` | Read the authenticated driver's ride history |

Dispatch currently considers only requested Auto bookings with a valid persisted route estimate. A driver's last location must be no more than 30 seconds old and within 5 km of pickup; distance is measured as a straight-line geographic radius. Each driver's offer expires 30 seconds after it is created when the driver polls for requests.

The allowed transitions are `REQUESTED -> ACCEPTED -> DRIVER_ARRIVING -> DRIVER_ARRIVED -> TRIP_STARTED -> TRIP_COMPLETED`. A ride may be cancelled from `ACCEPTED`, `DRIVER_ARRIVING`, or `DRIVER_ARRIVED`.

Acceptance is an atomic conditional database update, so only one driver can win a booking. Repeating an acceptance or the current ride-status update after a lost response returns the existing ride state. Completing a cash ride marks its cash payment record collected; no gateway, commission, platform fee, or deduction is applied.

## Earnings and notifications

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/driver/earnings` | Read completed rides, daily count, fares, and cash collected |
| `GET` | `/api/v1/driver/notifications` | Read the authenticated driver's notifications |
| `PATCH` | `/api/v1/driver/notifications/:notificationId/read` | Mark an owned notification as read |

Earnings are calculated from completed booking fare records and collected cash payment records. Daily counts use the India calendar day. Driver commission and platform fee are both zero.

## Pilot limitations

- Document review metadata is persisted, but there is no document-image storage or administrative review API. A trusted manual operations process must approve profile/document/vehicle statuses before drivers can go online.
- Request and ride status synchronization uses API polling and database notifications; push delivery and background location tracking are not implemented.
- The driver app must remain in the foreground to maintain a fresh location and receive offers. Production dispatch requires device/background-location validation and an appropriate review of location permissions.
- No migration has been applied to a live or local database as part of this implementation.
