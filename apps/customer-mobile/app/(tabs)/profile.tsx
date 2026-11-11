import { CircleUserRound, LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@ravero/design-tokens';
import { Icon } from '../../components/Icon';
import { useCustomerAuth } from '../../components/auth/AuthProvider';
import { ApiError } from '../../src/api/client';

export default function ProfileScreen() {
  const { customer, getProfile, updateProfile, logout } = useCustomerAuth();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState(customer?.fullName ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getProfile()
      .then((profile) => {
        if (!active) return;
        setFullName(profile.fullName ?? '');
        setEmail(profile.email ?? '');
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof ApiError
              ? error.message
              : 'Could not load your profile. Please try again.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [getProfile]);

  const saveProfile = async () => {
    if (fullName.trim().length < 2) {
      setMessage('Enter a full name of at least two characters.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({ fullName: fullName.trim(), email: email.trim() || null });
      setMessage('Your profile has been updated.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Could not save your profile. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setMessage('You are signed out on this device, but the server could not confirm revocation.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}>
      <Text style={styles.title}>Your profile</Text>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Icon color={colors.textSecondary} icon={CircleUserRound} size={30} />
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{customer?.fullName || 'RAVERO customer'}</Text>
          <Text style={styles.description}>{customer?.phone}</Text>
          <Text style={styles.description}>
            {customer?.isPhoneVerified ? 'Mobile number verified' : 'Mobile number not verified'}
          </Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Personal details</Text>
      <Text style={styles.fieldLabel}>Full name</Text>
      <TextInput
        accessibilityLabel="Full name"
        autoCapitalize="words"
        onChangeText={setFullName}
        style={styles.input}
        value={fullName}
      />
      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        style={styles.input}
        value={email}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void saveProfile()}
        style={[styles.primaryButton, saving && styles.disabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={loggingOut}
        onPress={() => void signOut()}
        style={[styles.logoutButton, loggingOut && styles.disabled]}
      >
        <Icon icon={LogOut} size={18} />
        <Text style={styles.logoutText}>{loggingOut ? 'Signing out…' : 'Log out'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    color: colors.black,
    fontSize: 26,
    fontWeight: '700',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.greyLight,
  },
  profileCopy: {
    flex: 1,
  },
  name: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    color: colors.black,
    fontSize: 17,
    fontWeight: '700',
  },
  fieldLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.black,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.greyLight,
    color: colors.black,
    fontSize: 14,
  },
  message: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  logoutText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
