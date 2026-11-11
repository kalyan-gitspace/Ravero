import type { ComponentRef, RefObject } from 'react';
import { CalendarDays, CircleUserRound, House, LayoutGrid } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { colors, spacing } from '@ravero/design-tokens';
import { Icon } from './Icon';

interface BottomTabBarProps {
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
}

const tabs = [
  { label: 'Home', path: '/(tabs)', icon: House, selectedPath: '/' },
  { label: 'Categories', path: '/(tabs)/categories', icon: LayoutGrid, selectedPath: '/categories' },
  { label: 'Bookings', path: '/(tabs)/bookings', icon: CalendarDays, selectedPath: '/bookings' },
  { label: 'Profile', path: '/(tabs)/profile', icon: CircleUserRound, selectedPath: '/profile' },
] as const;

export function BottomTabBar({ blurTarget }: BottomTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      nativeID="customer-tab-bar-positioner"
      style={[styles.positioner, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
    >
      <View style={styles.container}>
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget}
          intensity={20}
          nativeID="customer-tab-bar-glass"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint="default"
        />
        <View style={styles.tabs}>
          {tabs.map((tab) => {
            const selected =
              tab.selectedPath === '/'
                ? pathname === '/' || pathname === tab.path
                : pathname === tab.selectedPath || pathname.startsWith(`${tab.selectedPath}/`);

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={tab.path}
                onPress={() => router.replace(tab.path)}
                style={styles.tab}
              >
                <View style={[styles.indicator, selected && styles.indicatorSelected]}>
                  <Icon
                    color={selected ? colors.white : colors.textSecondary}
                    icon={tab.icon}
                    size={20}
                    strokeWidth={selected ? 2 : 1.7}
                  />
                </View>
                <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    right: spacing.md,
    bottom: 0,
    left: spacing.md,
    zIndex: 20,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 390,
    minHeight: 72,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 40,
    backgroundColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 4,
  },
  tabs: {
    width: '100%',
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  indicator: {
    width: 42,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  indicatorSelected: {
    backgroundColor: colors.black,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
  },
  labelSelected: {
    color: colors.black,
    fontWeight: '700',
  },
});
