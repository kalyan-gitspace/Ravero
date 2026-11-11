import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { colors } from '@ravero/design-tokens';
import { ApiError } from '../../src/api/client';
import { useCustomerAuth } from '../../components/auth/AuthProvider';
import { authStyles, AuthScreen } from '../../components/auth/AuthScreen';

export default function CompleteProfileScreen() {
  const { completeProfile } = useCustomerAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (fullName.trim().length < 2) {
      setError('Enter your full name to finish setting up your account.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await completeProfile(fullName.trim(), email.trim() || undefined);
    } catch (profileError) {
      setError(
        profileError instanceof ApiError
          ? profileError.message
          : profileError instanceof Error
            ? profileError.message
            : 'Could not complete your profile. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      title="A little about you"
      description="Add your name to complete your RAVERO customer profile. Email is optional."
    >
      <Text style={authStyles.fieldLabel}>Full name</Text>
      <TextInput
        accessibilityLabel="Full name"
        autoCapitalize="words"
        autoComplete="name"
        autoFocus
        onChangeText={setFullName}
        placeholder="Your name"
        placeholderTextColor={colors.textSecondary}
        style={[authStyles.input, styles.field]}
        value={fullName}
      />
      <Text style={authStyles.fieldLabel}>Email (optional)</Text>
      <TextInput
        accessibilityLabel="Email (optional)"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.textSecondary}
        style={[authStyles.input, styles.field]}
        value={email}
      />
      {error ? <Text style={authStyles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={() => void save()}
        style={[authStyles.primaryButton, loading && authStyles.primaryButtonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={authStyles.primaryButtonText}>Complete profile</Text>
        )}
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 20,
  },
});
