import { Bike, CarFront, Truck } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';

const categories = [
  { title: 'Auto', detail: 'Three-wheeler rides', icon: Truck },
  { title: 'Cab', detail: 'Four-wheeler rides', icon: CarFront },
  { title: 'Two-wheeler', detail: 'Two-wheeler rides', icon: Bike },
] as const;

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Categories</Text>
      <Text style={styles.description}>Explore ride types available in the RAVERO preview.</Text>
      {categories.map((category) => (
        <View key={category.title} style={styles.card}>
          <View style={styles.icon}>
            <Icon icon={category.icon} size={22} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.name}>{category.title}</Text>
            <Text style={styles.detail}>{category.detail}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.note}>Availability and eligibility are subject to confirmation.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    color: colors.black,
    fontSize: 26,
    fontWeight: '700',
  },
  description: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.greyLight,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '600',
  },
  detail: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
  },
  note: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
