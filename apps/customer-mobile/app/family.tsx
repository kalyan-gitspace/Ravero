import { Minus, Plus, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';

export default function FamilyBookingScreen() {
  const [passengers, setPassengers] = useState(2);
  const [saved, setSaved] = useState(false);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader subtitle="A local setup preview for a shared ride" title="Family booking" />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Icon icon={UsersRound} size={25} />
        </View>
        <Text style={styles.title}>Plan together</Text>
        <Text style={styles.description}>
          Set the number of people travelling. No family profiles or ride details are shared or stored.
        </Text>
        <View style={styles.counterCard}>
          <View style={styles.counterCopy}>
            <Text style={styles.counterTitle}>Passengers</Text>
            <Text style={styles.counterHint}>Local preview only</Text>
          </View>
          <Pressable
            accessibilityLabel="Remove passenger"
            disabled={passengers <= 1}
            onPress={() => {
              setPassengers((count) => Math.max(1, count - 1));
              setSaved(false);
            }}
            style={styles.counterButton}
          >
            <Icon color={passengers <= 1 ? '#AAAAAA' : colors.black} icon={Minus} size={17} />
          </Pressable>
          <Text style={styles.passengerCount}>{passengers}</Text>
          <Pressable
            accessibilityLabel="Add passenger"
            onPress={() => {
              setPassengers((count) => count + 1);
              setSaved(false);
            }}
            style={styles.counterButton}
          >
            <Icon color={colors.black} icon={Plus} size={17} />
          </Pressable>
        </View>
        <Pressable onPress={() => setSaved(true)} style={styles.button}>
          <Text style={styles.buttonText}>
            {saved ? 'Family preference saved locally' : 'Save preference'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  iconCircle: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: colors.greyLight,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.black,
    fontSize: 22,
    fontWeight: '700',
  },
  description: {
    maxWidth: 310,
    marginTop: spacing.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
  counterCard: {
    width: '100%',
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  counterCopy: {
    flex: 1,
  },
  counterTitle: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  counterHint: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
  },
  counterButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
  },
  passengerCount: {
    minWidth: 20,
    color: colors.black,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  button: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  buttonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
