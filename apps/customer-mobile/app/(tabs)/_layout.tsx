import type { ComponentRef } from 'react';
import { useRef } from 'react';
import { Slot, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { colors } from '@ravero/design-tokens';
import { BottomTabBar } from '../../components/BottomTabBar';
import { useCustomerAuth } from '../../components/auth/AuthProvider';

export default function TabLayout() {
  const { status } = useCustomerAuth();
  const pathname = usePathname();
  const blurTarget = useRef<ComponentRef<typeof View>>(null);

  if (status !== 'authenticated') {
    return <View style={styles.safeArea} />;
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        styles.safeArea,
        (pathname === '/' || pathname === '/(tabs)') && styles.homeSafeArea,
      ]}
    >
      <BlurTargetView ref={blurTarget} style={styles.content}>
        <Slot />
      </BlurTargetView>
      <BottomTabBar blurTarget={blurTarget} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  homeSafeArea: {
    backgroundColor: colors.black,
  },
  content: {
    flex: 1,
  },
});
