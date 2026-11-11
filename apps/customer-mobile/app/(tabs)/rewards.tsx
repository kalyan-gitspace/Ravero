import { ArrowRight, Award, Sparkles } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>RAVERO REWARDS</Text>
      <Text style={styles.title}>Titanium</Text>
      <Text style={styles.subtitle}>A rewards experience, coming into focus.</Text>

      <View style={styles.card}>
        <View style={styles.cardIcon}>
          <Icon color={colors.white} icon={Sparkles} size={22} />
        </View>
        <Text style={styles.cardLabel}>TITANIUM MEMBERSHIP</Text>
        <Text style={styles.cardTitle}>More to look forward to.</Text>
        <Text style={styles.cardCopy}>
          Rewards, benefits and membership details will be shared here.
        </Text>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoIcon}>
          <Icon icon={Award} size={20} />
        </View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Your rewards</Text>
          <Text style={styles.infoText}>Points and reward history are not connected in this demo.</Text>
        </View>
        <Icon color={colors.textSecondary} icon={ArrowRight} size={17} />
      </View>

      <Pressable style={styles.disabledButton}>
        <Text style={styles.disabledText}>Rewards preview</Text>
      </Pressable>
      <Text style={styles.disclaimer}>Mock content only. No rewards have been issued.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: spacing.sm,
    color: colors.black,
    fontSize: 34,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.black,
  },
  cardIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#555555',
    borderRadius: 21,
  },
  cardLabel: {
    marginTop: spacing.lg,
    color: '#D5D5D5',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cardTitle: {
    marginTop: spacing.sm,
    color: colors.white,
    fontSize: 22,
    fontWeight: '600',
  },
  cardCopy: {
    marginTop: spacing.sm,
    color: '#C4C4C4',
    fontSize: 13,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.greyLight,
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  infoText: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  disabledButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
  },
  disabledText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 11,
  },
});
