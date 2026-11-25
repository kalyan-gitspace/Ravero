module.exports = ({ config }) => ({
  ...config,
  name: 'RAVERO',
  plugins: [
    ...(config.plugins || []),
    '@maplibre/maplibre-react-native',
    [
      'expo-build-properties',
      {
        android: {
          buildArchs: ['armeabi-v7a', 'arm64-v8a'],
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          enablePngCrunchInReleaseBuilds: true,
        },
      },
    ],
  ],
  android: {
    ...config.android,
    package: 'com.ravero.customer',
  },
});
