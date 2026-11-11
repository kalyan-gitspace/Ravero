import { Clock3, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@ravero/design-tokens';
import type { Place } from './LocationPickerModal';
import { Icon } from '../Icon';

interface RecentPlaceRowProps {
  place: Place;
  onPress: () => void;
}

export function RecentPlaceRow({ place, onPress }: RecentPlaceRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Icon color={colors.textSecondary} icon={Clock3} size={18} />
      </View>
      <View style={styles.detail}>
        <Text style={styles.name}>{place.name}</Text>
        <Text numberOfLines={1} style={styles.address}>
          {place.address}
        </Text>
      </View>
      <Icon color={colors.textSecondary} icon={MapPin} size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.greyLight,
  },
  detail: {
    flex: 1,
  },
  name: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  address: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.6,
  },
});
