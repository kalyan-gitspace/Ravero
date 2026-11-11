import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'ravero.customer.refresh-token';

export const refreshTokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return typeof window === 'undefined' ? null : window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    }

    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
      }
      return;
    }

    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      return;
    }

    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
