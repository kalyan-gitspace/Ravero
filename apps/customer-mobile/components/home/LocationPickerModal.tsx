import { MapPin, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../Icon';

export interface Place {
  name: string;
  address: string;
}

export const places: Place[] = [
  { name: 'Home', address: 'Banjara Hills, Hyderabad' },
  { name: 'Work', address: 'HITEC City, Hyderabad' },
  { name: 'Charminar', address: 'Old City, Hyderabad' },
  { name: 'Secunderabad Station', address: 'Railway Station Road, Secunderabad' },
  { name: 'Rajiv Gandhi International Airport', address: 'Shamshabad, Telangana' },
  { name: 'Birla Mandir', address: 'Hill Fort Road, Hyderabad' },
];

interface LocationPickerModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (place: Place) => void;
}

export function LocationPickerModal({
  visible,
  title,
  onClose,
  onSelect,
}: LocationPickerModalProps) {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return places;
    return places.filter(
      (place) =>
        place.name.toLowerCase().includes(normalizedQuery) ||
        place.address.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const selectPlace = (place: Place) => {
    onSelect(place);
    setQuery('');
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Choose a place or enter a pickup location</Text>
            </View>
            <Pressable accessibilityLabel="Close location picker" onPress={onClose} style={styles.close}>
              <Icon color={colors.textSecondary} icon={X} size={19} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Icon color={colors.textSecondary} icon={Search} size={19} />
            <TextInput
              autoCapitalize="words"
              onChangeText={setQuery}
              placeholder="Search or enter a location"
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.map((place) => (
              <Pressable
                key={place.name}
                onPress={() => selectPlace(place)}
                style={({ pressed }) => [styles.place, pressed && styles.pressed]}
              >
                <View style={styles.placeIcon}>
                  <Icon icon={MapPin} size={18} />
                </View>
                <View style={styles.placeText}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  <Text numberOfLines={1} style={styles.placeAddress}>
                    {place.address}
                  </Text>
                </View>
              </Pressable>
            ))}
            {results.length === 0 && query.trim() ? (
              <Pressable
                onPress={() =>
                  selectPlace({
                    name: query.trim(),
                    address: query.trim(),
                  })
                }
                style={styles.customPlace}
              >
                <View style={styles.placeIcon}>
                  <Icon icon={MapPin} size={18} />
                </View>
                <View style={styles.placeText}>
                  <Text style={styles.placeName}>Use “{query.trim()}”</Text>
                  <Text style={styles.placeAddress}>Entered pickup location</Text>
                </View>
              </Pressable>
            ) : null}
          </ScrollView>
          <Text style={styles.disclaimer}>
            Example places are provided for convenience. Device location is used only with your
            permission and is not sent to RAVERO just to display the header.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    maxHeight: '82%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.black,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
  },
  close: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.greyLight,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.black,
    fontSize: 15,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  placeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.greyLight,
  },
  placeText: {
    flex: 1,
  },
  placeName: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  placeAddress: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  customPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  disclaimer: {
    paddingTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 11,
  },
  pressed: {
    opacity: 0.65,
  },
});
