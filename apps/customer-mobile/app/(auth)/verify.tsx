import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { colors } from '@ravero/design-tokens';
import { ApiError } from '../../src/api/client';
import { useCustomerAuth } from '../../components/auth/AuthProvider';
import { authStyles, AuthScreen } from '../../components/auth/AuthScreen';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { developmentOtp, verifyOtp, requestOtp } = useCustomerAuth();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const verify = async () => {
    if (!phone || !/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit verification code.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, otp);
      if (result === 'complete-profile') {
        router.push('/(auth)/complete-profile');
      }
    } catch (verificationError) {
      setError(
        verificationError instanceof ApiError
          ? verificationError.message
          : 'Could not verify the code. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!phone) return;
    setResending(true);
    setError(null);
    try {
      await requestOtp(phone);
      setOtp('');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not resend the code. Please try again.',
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScreen
      title="Enter your code"
      description={`We sent a one-time code to ${phone ?? 'your mobile number'}.`}
    >
      <Text style={authStyles.fieldLabel}>Verification code</Text>
      <TextInput
        accessibilityLabel="Verification code"
        autoComplete="one-time-code"
        autoFocus
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(value) => setOtp(value.replace(/\D/g, ''))}
        onSubmitEditing={() => void verify()}
        placeholder="000000"
        placeholderTextColor={colors.textSecondary}
        style={styles.otpInput}
        value={otp}
      />
      {developmentOtp ? (
        <Text style={authStyles.note}>Local development code: {developmentOtp}</Text>
      ) : null}
      {error ? <Text style={[authStyles.error, styles.error]}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={() => void verify()}
        style={[authStyles.primaryButton, loading && authStyles.primaryButtonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={authStyles.primaryButtonText}>Verify and continue</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={resending}
        onPress={() => void resend()}
        style={styles.resendButton}
      >
        {resending ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.resendText}>Resend code</Text>
        )}
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  otpInput: {
    minHeight: 58,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.greyLight,
    color: colors.black,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    marginTop: 16,
  },
  resendButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  resendText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
});
