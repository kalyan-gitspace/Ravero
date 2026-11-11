import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@ravero/design-tokens';

interface SectionHeadingProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeading({ title, action, onAction }: SectionHeadingProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.actionButton}>
          <Text style={styles.action}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  action: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionButton: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
});
