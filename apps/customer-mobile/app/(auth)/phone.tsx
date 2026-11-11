import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { colors, spacing } from '@ravero/design-tokens';
import { ApiError } from '../../src/api/client';
import { useCustomerAuth } from '../../components/auth/AuthProvider';
import { authStyles, AuthScreen } from '../../components/auth/AuthScreen';

function normalizeIndianPhone(value: string): string {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[\s()-]/g, '');
  return compact.startsWith('+') ? compact : `+91${compact.replace(/^0+/, '')}`;
}

export default function PhoneScreen() {
  const router = useRouter();
  const { requestOtp } = useCustomerAuth();
  const [phoneInput, setPhoneInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const continueWithPhone = async () => {
    const phone = normalizeIndianPhone(phoneInput);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError('Enter a valid mobile number with its country code.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await requestOtp(phone);
      router.push({ pathname: '/(auth)/verify', params: { phone } });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not request a verification code. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      title="What’s your number?"
      description="We’ll send a one-time code to verify your mobile number."
    >
      <Text style={authStyles.fieldLabel}>Mobile number</Text>
      <TextInput
        accessibilityLabel="Mobile number"
        autoComplete="tel"
        autoFocus
        keyboardType="phone-pad"
        onChangeText={setPhoneInput}
        onSubmitEditing={() => void continueWithPhone()}
        placeholder="+91 98765 43210"
        placeholderTextColor={colors.textSecondary}
        style={[authStyles.input, styles.phoneInput]}
        value={phoneInput}
      />
      {error ? <Text style={authStyles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={() => void continueWithPhone()}
        style={[authStyles.primaryButton, loading && authStyles.primaryButtonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={authStyles.primaryButtonText}>Send verification code</Text>
        )}
      </Pressable>
      <Text style={authStyles.note}>Your number is stored securely and used for account access.</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  phoneInput: {
    marginBottom: spacing.lg,
  },
});
