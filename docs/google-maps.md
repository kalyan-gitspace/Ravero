# Google Maps backend setup

The customer API proxies Google Maps requests so the server API key is never sent to a
browser or mobile client. Configure these values in `apps/backend/.env` (or the backend
deployment secret store):

- `GOOGLE_MAPS_SERVER_API_KEY`
- `GOOGLE_MAPS_MONTHLY_LIMIT_AUTOCOMPLETE_REQUESTS`
- `GOOGLE_MAPS_MONTHLY_LIMIT_PLACE_DETAILS_ESSENTIALS`
- `GOOGLE_MAPS_MONTHLY_LIMIT_GEOCODING`
- `GOOGLE_MAPS_MONTHLY_LIMIT_ROUTES_COMPUTE_ESSENTIALS`
- `GOOGLE_MAPS_MONTHLY_LIMIT_DYNAMIC_MAPS_LOADS` (web map loads only)

In Google Cloud, select the correct billing project, enable Places API (New), Geocoding
API, Routes API, Maps SDK for Android, Maps SDK for iOS, and Maps JavaScript API. Use
separate keys for the backend, Android, iOS, and web. Restrict the backend key by its
known outbound IP addresses and only the server-side APIs. Restrict Android/iOS keys
to the native app identifier plus signing certificate/bundle ID and the respective
Maps SDK. Restrict the web key by allowed HTTP referrers and Maps JavaScript API.
Never put the server key in a `VITE_` or `EXPO_PUBLIC_` variable, mobile app, or
checked-in environment file.

The customer app reads these public, platform-restricted keys at native/web build time:

- `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`

The Android and iOS app identifiers are not currently declared in `app.json`. Set
stable production identifiers before creating application-restricted native keys;
do not use a guessed identifier or a development Expo Go key for production.

Before setting a monthly limit, verify the current Google Cloud SKU, pricing, billing
account eligibility, any applicable allowance, and your desired safety margin for the
specific project and region. Configure each value as the maximum number of requests
the backend may reserve for that SKU in a UTC calendar month after accounting for that
margin. This service assumes no free allowance or price. An unset limit disables that
SKU; a limit reached or unavailable usage database prevents the upstream request.
Usage is stored persistently by month and SKU, and a request is reserved atomically
before contacting Google (including requests that later fail upstream).

For orientation only, Google's India pricing table currently lists a 70,000 monthly
free usage cap for India Autocomplete Requests, Place Details Essentials, Geocoding,
Routes Compute Essentials, and Dynamic Maps. The native Maps SDK India entry is
currently listed as unlimited. The free caps aggregate use across projects linked to
the same billing account, so the RAVERO limits must account for other projects' usage
and leave the operator's safety margin; these figures are not a guarantee of ₹0. The
web map route reserves one `DYNAMIC_MAPS_LOADS` counter before creating a map. Native
Maps SDK rendering is separate from the billable proxy requests and does not call that
reservation endpoint. Recheck the [India pricing page](https://developers.google.com/maps/billing-and-pricing/pricing-india)
and Google Cloud billing before the pilot.

Authenticated customer endpoints:

- `POST /api/v1/customer/maps/places/autocomplete` — `{ "input": "...", "sessionToken": "..." }`
- `POST /api/v1/customer/maps/places/details` — `{ "placeId": "...", "sessionToken": "..." }` (`sessionToken` is optional for saved place IDs)
- `POST /api/v1/customer/maps/geocoding/reverse` — `{ "location": { "latitude": 0, "longitude": 0 } }`
- `POST /api/v1/customer/maps/routes/compute` — `{ "origin": { "latitude": 0, "longitude": 0 }, "destination": { "latitude": 0, "longitude": 0 }, "travelMode": "DRIVE" }`
- `POST /api/v1/customer/maps/dynamic-maps/reserve-load` — `{}` (web only; reserves the configured Dynamic Maps threshold before the public web key is used)

Generate a fresh client-side session token for an autocomplete session and send the
same token with its selected place's details request. A saved place ID can be refreshed
without a session token. Route computation is a separate explicit request and is not
triggered by autocomplete, details, or reverse geocoding.

Native Android and iOS use `react-native-maps` with the Google provider and the matching
key. The web picker loads the Google Maps JavaScript API after the backend reserves its
own Dynamic Maps allowance. Without the appropriate public key or backend allowance,
map confirmation remains disabled and the screen shows the configuration error; no map
or location result is faked.

Recent-location storage in the customer app retains only Google place IDs (which are
exempt from Maps content caching restrictions) and the user's own search text; it
fetches fresh place details when a recent place is selected. Before production, review
Google Maps Platform terms for any retention of returned addresses or coordinates in
booking records. The current development booking implementation persists those values,
so retention and permitted use must be confirmed before a pilot.

The current backend environment validator only accepts a local PostgreSQL database.
Hosted database support and verified monthly limits are required before enabling these
endpoints in a production deployment.
