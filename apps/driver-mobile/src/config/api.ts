import { Platform } from 'react-native';

const defaultApiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const androidApiUrl = process.env.EXPO_PUBLIC_ANDROID_API_URL ?? 'http://10.0.2.2:3000';

export const apiConfig = {
  baseUrl: Platform.OS === 'android' ? androidApiUrl : defaultApiUrl,
} as const;
