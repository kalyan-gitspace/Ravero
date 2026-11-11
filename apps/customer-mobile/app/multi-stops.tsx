import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';

export default function MultipleStopsScreen() {
  const router = useRouter();
  const { destination, scheduledAt, stops: stopsParam } = useLocalSearchParams<{
    destination?: string;
    scheduledAt?: string;
    stops?: string;
  }>();
  const [stops, setStops] = useState(() => {
    if (typeof stopsParam !== 'string') return [''];
    try {
      const savedStops: unknown = JSON.parse(stopsParam);
      if (
        Array.isArray(savedStops) &&
        savedStops.length > 0 &&
        savedStops.length <= 3 &&
        savedStops.every(
          (stop): stop is string => typeof stop === 'string' && stop.trim().length > 0,
        )
      ) {
        return savedStops;
      }
    } catch {
      return [''];
    }
    return [''];
  });
  const [saved, setSaved] = useState(false);

  const updateStop = (index: number, value: string) => {
    setStops((current) => current.map((stop, stopIndex) => (stopIndex === index ? value : stop)));
    setSaved(false);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader subtitle="Plan a route with more than one stop" title="Multiple stops" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Add places in the order you want to visit them.</Text>
        {stops.map((stop, index) => (
          <View key={`stop-${index}`} style={styles.stopRow}>
            <View style={styles.number}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <TextInput
              accessibilityLabel={`Stop ${index + 1}`}
              onChangeText={(value) => updateStop(index, value)}
              placeholder={`Stop ${index + 1} address`}
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              value={stop}
            />
            {stops.length > 1 ? (
              <Pressable
                accessibilityLabel={`Remove stop ${index + 1}`}
                onPress={() => setStops((current) => current.filter((_, i) => i !== index))}
                style={styles.remove}
              >
                <Icon color={colors.textSecondary} icon={X} size={17} />
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          disabled={stops.length >= 3}
          onPress={() => {
            setStops((current) => [...current, '']);
            setSaved(false);
          }}
          style={[styles.addButton, stops.length >= 3 && styles.addDisabled]}
        >
          <Icon icon={Plus} size={17} />
          <Text style={styles.addText}>Add another stop</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          Up to three stops can be attached to a development booking request. No route is calculated.
        </Text>
        <Pressable
          disabled={stops.some((stop) => !stop.trim())}
          onPress={() => {
            const stopAddresses = stops.map((stop) => stop.trim());
            setSaved(true);
            router.replace({
              pathname: '/(tabs)',
              params: {
                stops: JSON.stringify(stopAddresses),
                ...(typeof destination === 'string' ? { destination } : {}),
                ...(typeof scheduledAt === 'string' ? { scheduledAt } : {}),
              },
            });
          }}
          style={[styles.primaryButton, stops.some((stop) => !stop.trim()) && styles.buttonDisabled]}
        >
          <Text style={styles.primaryText}>{saved ? 'Stops added to request' : 'Use these stops'}</Text>
        </Pressable>
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
    marginBottom: spacing.lg,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  number: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.greyLight,
  },
  numberText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.black,
    fontSize: 14,
  },
  remove: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  primaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  addDisabled: {
    opacity: 0.4,
  },
});
