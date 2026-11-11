# Customer Authentication API

The customer authentication API is served by the central Express backend. The mobile app and website must call these endpoints; neither client connects directly to PostgreSQL.

Base paths:

- Customer auth: `/api/v1/auth/customer`
- Customer profile: `/api/v1/customer`

All responses use `{ "success": boolean, "data"?: object, "error"?: object }`.

## Phone number format

Phone numbers must be provided in international E.164 format. Separators such as spaces, hyphens, and parentheses are removed before validation. The country code is not inferred; for example, use `+919876543210`.

## Send an OTP

`POST /api/v1/auth/customer/send-otp`

Request:

```json
{
  "phone": "+919876543210"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "message": "If this number can receive a code, one has been sent.",
    "expiresIn": 300
  }
}
```

In the local development environment only, a request received over loopback (`127.0.0.1` or `::1`) also receives `developmentOtp` in `data`. This restriction remains in place when the backend listens on a LAN interface for Android development; Android emulator and physical-device requests do not receive the code in the response. OTP values are never logged or returned in production. Send requests are limited by IP, and each phone number has a resend cooldown and an hourly send cap.

The current `development` provider is a local-only adapter. The `sms` provider boundary is prepared, but an actual SMS integration is intentionally not configured; selecting it returns `SMS_PROVIDER_NOT_CONFIGURED`.

## Verify an OTP and register or log in

`POST /api/v1/auth/customer/verify-otp`

For a new customer, include `fullName`; `email` is optional. Existing customers can omit both.

```json
{
  "phone": "+919876543210",
  "otp": "123456",
  "fullName": "Asha Rao",
  "email": "asha@example.com"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "<short-lived bearer token>",
    "refreshToken": "<rotating refresh token>",
    "expiresIn": 900,
    "customer": {
      "id": "<uuid>",
      "fullName": "Asha Rao",
      "phone": "+919876543210",
      "email": "asha@example.com",
      "profileImageUrl": null,
      "status": "ACTIVE",
      "isPhoneVerified": true
    }
  }
}
```

The OTP is six digits, expires after five minutes, and allows at most five attempts. A successful code is consumed once. OTP values are stored as keyed HMAC-SHA-256 hashes, not plaintext.

## Refresh a session

`POST /api/v1/auth/customer/refresh`

Request:

```json
{
  "refreshToken": "<refresh token returned by verify or refresh>"
}
```

Response has the same token shape as OTP verification. Each successful refresh rotates the refresh token. Reuse of an older token revokes that session.

## Log out

`POST /api/v1/auth/customer/logout`

Requires `Authorization: Bearer <accessToken>`.

Response:

```json
{
  "success": true,
  "data": {
    "loggedOut": true
  }
}
```

Logout revokes the associated session. Protected routes check the session record, so the access token stops working immediately.

## Read customer profile

`GET /api/v1/customer/profile`

Requires `Authorization: Bearer <accessToken>`.

Response:

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "<uuid>",
      "fullName": "Asha Rao",
      "phone": "+919876543210",
      "email": "asha@example.com",
      "profileImageUrl": null,
      "status": "ACTIVE",
      "isPhoneVerified": true
    }
  }
}
```

## Update customer profile

`PATCH /api/v1/customer/profile`

Requires `Authorization: Bearer <accessToken>`. At least one supported field is required. Set optional `email` or `profileImageUrl` to `null` to clear it. Image URLs must use HTTPS. Phone number changes are not supported by this endpoint because a future phone-change flow must verify the new number separately.

```json
{
  "fullName": "Asha R Rao",
  "email": "asha.rao@example.com",
  "profileImageUrl": "https://example.com/avatar.png"
}
```

The response contains the updated customer object in `data.customer`.

## Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request fields are invalid |
| 400 | `OTP_NOT_FOUND` | No active challenge exists |
| 400 | `OTP_EXPIRED` | The challenge expired |
| 400 | `INVALID_OTP` | The submitted code did not match |
| 400 | `OTP_ALREADY_USED` | The challenge was consumed |
| 400 | `CUSTOMER_DETAILS_REQUIRED` | A new customer must provide a full name |
| 401 | `AUTHENTICATION_REQUIRED` | A bearer access token is required |
| 401 | `INVALID_ACCESS_TOKEN` | The bearer token is invalid or expired |
| 401 | `SESSION_EXPIRED` | The session is expired or revoked |
| 401 | `INVALID_REFRESH_TOKEN` | The refresh token is invalid or expired |
| 401 | `REFRESH_TOKEN_REUSED` | A rotated token was replayed; its session was revoked |
| 403 | `CUSTOMER_ACCOUNT_REQUIRED` | The identity belongs to a non-customer account |
| 403 | `CUSTOMER_ACCOUNT_UNAVAILABLE` | The customer account is not active |
| 409 | `EMAIL_ALREADY_IN_USE` | The email belongs to another account |
| 429 | `OTP_RESEND_COOLDOWN` | Wait before requesting another code |
| 429 | `OTP_SEND_LIMIT_EXCEEDED` | The per-number hourly send limit was reached |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | The challenge attempt limit was reached |
| 429 | `OTP_RATE_LIMITED` | The per-IP send limit was reached |
| 429 | `OTP_VERIFY_RATE_LIMITED` | The per-IP verification limit was reached |
| 503 | `SMS_PROVIDER_NOT_CONFIGURED` | An SMS provider has not been configured |

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | Backend port |
| `HOST` | Backend interface; use `0.0.0.0` for Android emulator or LAN access |
| `DATABASE_URL` | Local PostgreSQL URL targeting `ravero_db` |
| `OTP_PROVIDER` | `development` (local only) or `sms` |
| `ACCESS_TOKEN_SECRET` | HMAC signing secret; at least 32 characters in production |
| `OTP_HASH_SECRET` | Key for OTP HMAC hashes; at least 32 characters in production |
| `DEV_FARE_BASE_AMOUNT` | Local-only placeholder base amount (INR) for development booking estimates; never a production quote |

Secrets are not committed. In development, omitted token and OTP secrets are randomly generated per process; existing access tokens and outstanding OTP challenges become invalid when the backend restarts. Configure stable local secrets in the ignored backend `.env` file when persistent development sessions are needed.

## Local development

1. Copy `apps/backend/.env.example` to `apps/backend/.env` if needed.
2. Set `NODE_ENV=development`, `OTP_PROVIDER=development`, and the local `DATABASE_URL`.
3. Keep `HOST=0.0.0.0` when testing from Android; local firewall rules may need to allow the backend port.
4. Optionally set stable random values of at least 32 characters for `ACCESS_TOKEN_SECRET` and `OTP_HASH_SECRET`.
5. Start with `pnpm --filter @ravero/backend dev`.
6. For Chrome, set the Customer App `EXPO_PUBLIC_API_URL` to `http://localhost:<PORT>`. For the Android emulator use `http://10.0.2.2:<PORT>`; for a physical device use the development computer's LAN IP. Create `apps/customer-mobile/.env.local` from `.env.example` and set `EXPO_PUBLIC_ANDROID_API_URL` as appropriate.
7. Run the app with `pnpm --filter @ravero/customer-mobile web` for Chrome or `pnpm --filter @ravero/customer-mobile android` for Android.

For Android OTP testing, request the code from the development computer over `127.0.0.1` and enter that returned local-development code in the app. Do not request it from the Android device: non-loopback clients intentionally do not receive `developmentOtp`.

The Customer App stores the native refresh token with Expo SecureStore. In the browser, it stores only the refresh token in tab-scoped `sessionStorage` (never `localStorage`); access tokens stay in memory and refresh tokens rotate on restoration and after access-token expiry. A production web deployment should move refresh tokens to an HttpOnly, Secure, SameSite cookie when the backend supports cookie-based sessions.

During development, the backend allows browser CORS only from loopback Expo origins on ports 8081, 8082, and 19006. The API does not enable cross-origin credentials.

The IP limiter is process-local and intended for the current single-backend local development setup. Before deploying multiple backend instances, replace it with a shared rate-limit store. No SMS, email, or other external provider is currently integrated.

See [Customer booking API](./api-bookings.md) for the development-only booking estimate and request endpoints.
