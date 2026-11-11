# RAVERO customer app brand assets

`ravero-logo-approved.png` is the untouched approved artwork supplied for the
customer app. Do not edit or recreate it. The derivative PNG files in this
directory are pixel crops/resizes from that source:

- `ravero-wordmark.png`: transparent wordmark crop for the home header.
- `ravero-lockup.png`: transparent wordmark and MADE IN INDIA lockup.
- `splash-logo.png`: padded lockup for the animated in-app splash.
- `ravero-icon.png`: black square launcher icon with the full lockup.
- `ravero-adaptive-foreground.png`: transparent, safely padded adaptive icon
  foreground.
- `ravero-monochrome.png`: monochrome adaptive icon artwork.
- `favicon.png`: black favicon with the wordmark.

The original is 768 x 768 pixels. The wordmark and complete lockup were cropped
from the visible artwork; their proportions and lettering are retained. The
native launch screen is solid black; the customer app fades in `splash-logo.png`
after React is ready. `app.json` configures the black native launch background
and the launcher/web icons.

The same approved source and its reusable derivatives can later be integrated
into `driver-mobile` without changing its current assets or configuration.
