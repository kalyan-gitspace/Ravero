const app = require('./app.json');
const androidMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
const webMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;

module.exports = {
  ...app.expo,
  plugins: [
    ...app.expo.plugins,
    [
      'react-native-maps',
      {
        ...(androidMapsApiKey ? { androidGoogleMapsApiKey: androidMapsApiKey } : {}),
        ...(iosMapsApiKey ? { iosGoogleMapsApiKey: iosMapsApiKey } : {}),
      },
    ],
  ],
  android: {
    ...app.expo.android,
    config: {
      ...app.expo.android?.config,
      googleMaps: {
        ...app.expo.android?.config?.googleMaps,
        apiKey: androidMapsApiKey,
      },
    },
  },
  ios: {
    ...app.expo.ios,
    config: {
      ...app.expo.ios?.config,
      googleMapsApiKey: iosMapsApiKey,
    },
  },
  extra: {
    ...app.expo.extra,
    googleMapsAndroidConfigured: Boolean(androidMapsApiKey),
    googleMapsIosConfigured: Boolean(iosMapsApiKey),
    googleMapsWebConfigured: Boolean(webMapsApiKey),
  },
};
