import { Bike, CarFront, CarTaxiFront } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../Icon';

export type RideCategory = 'Auto' | 'Cab' | 'Two-wheeler';

const categories = [
  { name: 'Auto', description: 'Three-wheeler', icon: CarTaxiFront },
  { name: 'Cab', description: 'Four-wheeler', icon: CarFront },
  { name: 'Two-wheeler', description: 'Two-wheeler', icon: Bike },
] as const;

interface RideCategoryCardProps {
  selected: RideCategory;
  onSelect: (category: RideCategory) => void;
}

export function RideCategoryCards({ selected, onSelect }: RideCategoryCardProps) {
  return (
    <View style={styles.row}>
      {categories.map((category) => {
        const isSelected = selected === category.name;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            key={category.name}
            onPress={() => onSelect(category.name)}
            style={({ pressed }) => [
              styles.card,
              isSelected && styles.cardSelected,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              color={isSelected ? colors.white : colors.black}
              icon={category.icon}
              size={25}
              strokeWidth={1.7}
            />
            <Text style={[styles.name, isSelected && styles.nameSelected]}>{category.name}</Text>
            <Text style={[styles.description, isSelected && styles.descriptionSelected]}>
              {category.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  cardSelected: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  name: {
    marginTop: spacing.sm,
    color: colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  nameSelected: {
    color: colors.white,
  },
  description: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
  },
  descriptionSelected: {
    color: '#D5D5D5',
  },
  pressed: {
    opacity: 0.78,
  },
});
