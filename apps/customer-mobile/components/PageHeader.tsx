import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@ravero/design-tokens';
import { Icon } from './Icon';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
        <Icon icon={ArrowLeft} size={21} />
      </Pressable>
      <View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greyLight,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
});
