import { ArrowUpRight, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../Icon';

interface TitaniumCardProps {
  onPress: () => void;
}

export function TitaniumCard({ onPress }: TitaniumCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={styles.mark}>
          <Icon color={colors.white} icon={Sparkles} size={18} />
        </View>
        <Text style={styles.eyebrow}>RAVERO REWARDS</Text>
        <Icon color="#C8C8C8" icon={ArrowUpRight} size={19} />
      </View>
      <Text style={styles.title}>A little more from every ride.</Text>
      <Text style={styles.description}>
        Discover Titanium rewards and see what you can earn.
      </Text>
      <View style={styles.link}>
        <Text style={styles.linkText}>Explore Titanium</Text>
        <View style={styles.rule} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.black,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5B5B5B',
    borderRadius: 15,
  },
  eyebrow: {
    flex: 1,
    color: '#D0D0D0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.white,
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  description: {
    maxWidth: 270,
    marginTop: spacing.sm,
    color: '#C4C4C4',
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
  linkText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  rule: {
    height: 1,
    marginTop: 5,
    backgroundColor: '#8E8E8E',
  },
  pressed: {
    opacity: 0.86,
  },
});
