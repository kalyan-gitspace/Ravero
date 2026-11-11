import { CalendarDays, Clock3 } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';

export default function ScheduleRideScreen() {
  const router = useRouter();
  const { destination, stops } = useLocalSearchParams<{ destination?: string; stops?: string }>();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const useSchedule = () => {
    const dateParts = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeParts = time.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!dateParts || !timeParts) {
      setError('Enter a valid future date and time.');
      return;
    }
    const scheduledDate = new Date(
      Number(dateParts[1]),
      Number(dateParts[2]) - 1,
      Number(dateParts[3]),
      Number(timeParts[1]),
      Number(timeParts[2]),
    );
    if (
      scheduledDate.getFullYear() !== Number(dateParts[1]) ||
      scheduledDate.getMonth() !== Number(dateParts[2]) - 1 ||
      scheduledDate.getDate() !== Number(dateParts[3]) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      setError('Enter a valid future date and time.');
      return;
    }
    router.replace({
      pathname: '/(tabs)',
      params: {
        scheduledAt: scheduledDate.toISOString(),
        ...(typeof destination === 'string' ? { destination } : {}),
        ...(typeof stops === 'string' ? { stops } : {}),
      },
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader subtitle="Choose a preferred date and time" title="Schedule a ride" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Choose a future time to attach to your next booking request. No ride is reserved.
        </Text>
        <Text style={styles.label}>DATE</Text>
        <View style={styles.inputRow}>
          <Icon color={colors.textSecondary} icon={CalendarDays} size={19} />
          <TextInput
            accessibilityLabel="Preferred date"
            onChangeText={(value) => {
              setDate(value);
              setError(null);
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={date}
          />
        </View>
        <Text style={styles.label}>TIME</Text>
        <View style={styles.inputRow}>
          <Icon color={colors.textSecondary} icon={Clock3} size={19} />
          <TextInput
            accessibilityLabel="Preferred time"
            onChangeText={(value) => {
              setTime(value);
              setError(null);
            }}
            placeholder="HH:MM (24-hour)"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={time}
          />
        </View>
        <Pressable
          disabled={!date.trim() || !time.trim()}
          onPress={useSchedule}
          style={[styles.button, (!date.trim() || !time.trim()) && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Use this schedule</Text>
        </Pressable>
        {error ? <Text style={styles.confirmation}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    padding: spacing.lg,
  },
  intro: {
    marginBottom: spacing.xl,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  inputRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.black,
    fontSize: 14,
  },
  button: {
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmation: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
});
