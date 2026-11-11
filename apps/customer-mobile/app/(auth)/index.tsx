import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@ravero/design-tokens';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { useCustomerAuth } from '../../components/auth/AuthProvider';

export default function WelcomeScreen() {
  const router = useRouter();
  const { startupError } = useCustomerAuth();

  return (
    <AuthScreen
      title={'Move around\nHyderabad with ease.'}
      description="Book local rides with RAVERO. Sign in with your mobile number to get started."
    >
      <View style={styles.bottom}>
        {startupError ? <Text style={styles.error}>{startupError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(auth)/phone')}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Continue with mobile number</Text>
        </Pressable>
        <Text style={styles.note}>By continuing, you agree to receive a one-time verification code.</Text>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  bottom: {
    marginTop: 'auto',
  },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.black,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
