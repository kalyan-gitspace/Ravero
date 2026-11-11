import { useEffect } from 'react';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@ravero/design-tokens';
import { useCustomerAuth } from './AuthProvider';

export function AuthNavigator() {
  const { status } = useCustomerAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const inAuthFlow = segments[0] === '(auth)';
  const blocked =
    status === 'loading' ||
    (status === 'authenticated' && inAuthFlow) ||
    (status === 'unauthenticated' && !inAuthFlow);

  useEffect(() => {
    if (!navigationState?.key || status === 'loading') return;

    if (status === 'authenticated' && inAuthFlow) {
      router.replace('/(tabs)');
    } else if (status === 'unauthenticated' && !inAuthFlow) {
      router.replace('/(auth)');
    }
  }, [navigationState?.key, router, segments, status]);

  if (blocked) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.black} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
});
