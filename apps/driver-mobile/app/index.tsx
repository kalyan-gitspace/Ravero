import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DriverApiError, driverApi } from '../src/api/client';
import type {
  DriverEarnings,
  DriverNotification,
  DriverProfile,
  DriverRide,
  DriverRideRequest,
} from '../src/api/types';
import {
  activeRideStatuses,
  canCancelRide,
  getNextRideStatus,
  type DriverRideStatus,
} from '../src/driver/rideLifecycle';

type AppSection = 'home' | 'rides' | 'earnings' | 'profile';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function money(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function titleCase(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'words',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function DocumentStatus({ label, status }: { label: string; status: string }) {
  const tone = status === 'APPROVED' || status === 'ACTIVE' ? styles.goodText : styles.pendingText;
  return (
    <View style={styles.documentRow}>
      <Text style={styles.bodyText}>{label}</Text>
      <Text style={[styles.smallStrong, tone]}>{titleCase(status)}</Text>
    </View>
  );
}

export default function IndexScreen() {
  const [booting, setBooting] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState<string | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [requests, setRequests] = useState<DriverRideRequest[]>([]);
  const [rides, setRides] = useState<DriverRide[]>([]);
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [section, setSection] = useState<AppSection>('home');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [lastLocationAt, setLastLocationAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const dashboardInFlight = useRef(false);
  const locationUpdateInFlight = useRef(false);
  const actionInFlight = useRef(false);

  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');

  const reloadDashboard = useCallback(async () => {
    if (dashboardInFlight.current) return;
    dashboardInFlight.current = true;
    try {
      const nextProfile = await driverApi.getProfile();
      setProfile(nextProfile);
      const [nextRides, nextEarnings, nextNotifications, nextRequests] = await Promise.all([
        driverApi.getRides(),
        driverApi.getEarnings(),
        driverApi.getNotifications(),
        nextProfile.isAvailable ? driverApi.getRequests() : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setRides(nextRides);
      setEarnings(nextEarnings);
      setNotifications(nextNotifications);
      setRequests(nextRequests);
      setFullName(nextProfile.fullName ?? '');
      setLicenseNumber(nextProfile.driverLicenseNumber ?? '');
      setVehicleMake(nextProfile.vehicle?.make ?? '');
      setVehicleModel(nextProfile.vehicle?.model ?? '');
      setVehicleYear(nextProfile.vehicle ? String(nextProfile.vehicle.year) : '');
      setVehicleColor(nextProfile.vehicle?.color ?? '');
      setVehiclePlate(nextProfile.vehicle?.plateNumber ?? '');
      setVehicleRegistration(nextProfile.vehicle?.registrationNumber ?? '');
      setError(null);
      setRestoreError(null);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      dashboardInFlight.current = false;
    }
  }, []);

  const restore = useCallback(async () => {
    setBooting(true);
    setRestoreError(null);
    try {
      const driver = await driverApi.restoreSession();
      if (!driver) {
        setAuthenticated(false);
        setBooting(false);
        return;
      }
      setAuthenticated(true);
      await reloadDashboard();
    } catch (requestError) {
      if (requestError instanceof DriverApiError && requestError.status === 401) {
        setAuthenticated(false);
        setRestoreError(null);
        setError('Your saved session expired. Sign in again to continue.');
      } else {
        setRestoreError(messageFrom(requestError));
      }
    } finally {
      setBooting(false);
    }
  }, [reloadDashboard]);

  useEffect(() => {
    driverApi.setSessionExpiredHandler(() => {
      setAuthenticated(false);
      setProfile(null);
      setError('Your session expired. Sign in again to continue.');
    });
    void Promise.resolve().then(restore);
    return () => driverApi.setSessionExpiredHandler(null);
  }, [restore]);

  useEffect(() => {
    if (requests.length === 0) return undefined;
    const initialUpdate = setTimeout(() => setCurrentTime(Date.now()), 0);
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(interval);
    };
  }, [requests.length]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authenticated || !profile?.isAvailable || !appIsActive) return undefined;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 25,
      },
      (location) => {
        if (cancelled || locationUpdateInFlight.current) return;
        locationUpdateInFlight.current = true;
        void driverApi
          .updateLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          })
          .then(() => {
            setLastLocationAt(new Date());
            setNotice(null);
          })
          .catch((locationError: unknown) => setNotice(messageFrom(locationError)))
          .finally(() => {
            locationUpdateInFlight.current = false;
          });
      },
      (reason) => setNotice(`Location updates paused: ${reason}`),
    )
      .then((locationSubscription) => {
        if (cancelled) locationSubscription.remove();
        else subscription = locationSubscription;
      })
      .catch((locationError: unknown) => setNotice(messageFrom(locationError)));

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [appIsActive, authenticated, profile?.isAvailable]);

  useEffect(() => {
    if (!authenticated || !profile?.isAvailable || !appIsActive) return undefined;
    const interval = setInterval(() => {
      void reloadDashboard();
    }, 8_000);
    return () => clearInterval(interval);
  }, [appIsActive, authenticated, profile?.isAvailable, reloadDashboard]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setWorking(key);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(messageFrom(actionError));
    } finally {
      actionInFlight.current = false;
      setWorking(null);
    }
  };

  const sendOtp = async () => {
    await runAction('send-otp', async () => {
      const result = await driverApi.sendOtp(phone.trim());
      setOtpSent(true);
      setDevelopmentOtp(result.developmentOtp ?? null);
      setNotice(result.message);
    });
  };

  const verifyOtp = async () => {
    await runAction('verify-otp', async () => {
      const session = await driverApi.verifyOtp(phone.trim(), otp.trim(), fullName.trim());
      setAuthenticated(true);
      setProfile(null);
      setNotice(`Welcome${session.driver.fullName ? `, ${session.driver.fullName}` : ''}.`);
      await reloadDashboard();
    });
  };

  const signOut = async () => {
    await runAction('logout', async () => {
      try {
        await driverApi.logout();
      } finally {
        setAuthenticated(false);
        setProfile(null);
        setRequests([]);
        setRides([]);
        setEarnings(null);
        setNotifications([]);
        setOtpSent(false);
        setOtp('');
        setNotice('You have signed out.');
      }
    });
  };

  const saveProfile = async () => {
    if (!profile) return;
    await runAction('save-profile', async () => {
      const data: {
        fullName?: string;
        driverLicenseNumber?: string;
        vehicle?: {
          make: string;
          model: string;
          year: number;
          color: string;
          plateNumber: string;
          registrationNumber: string;
        };
      } = {};
      if (fullName.trim() !== (profile.fullName ?? '')) data.fullName = fullName.trim();
      if (licenseNumber.trim() !== (profile.driverLicenseNumber ?? '')) {
        data.driverLicenseNumber = licenseNumber.trim();
      }
      const vehicleValues = [
        vehicleMake.trim(),
        vehicleModel.trim(),
        vehicleYear.trim(),
        vehicleColor.trim(),
        vehiclePlate.trim(),
        vehicleRegistration.trim(),
      ];
      const vehicleChanged =
        !profile.vehicle ||
        vehicleValues.some((value, index) => {
          const current = [
            profile.vehicle?.make,
            profile.vehicle?.model,
            profile.vehicle ? String(profile.vehicle.year) : '',
            profile.vehicle?.color,
            profile.vehicle?.plateNumber,
            profile.vehicle?.registrationNumber,
          ][index] ?? '';
          return value !== current;
        });
      if (vehicleValues.some(Boolean) && vehicleChanged) {
        if (vehicleValues.some((value) => !value)) {
          throw new Error('Complete every vehicle field before saving the vehicle details.');
        }
        data.vehicle = {
          make: vehicleMake.trim(),
          model: vehicleModel.trim(),
          year: Number(vehicleYear),
          color: vehicleColor.trim(),
          plateNumber: vehiclePlate.trim(),
          registrationNumber: vehicleRegistration.trim(),
        };
      }
      if (!Object.keys(data).length) {
        throw new Error('There are no profile changes to save.');
      }
      const updatedProfile = await driverApi.updateProfile(data);
      setProfile(updatedProfile);
      setNotice('Profile saved. Changed licence or vehicle details require manual verification.');
      await reloadDashboard();
    });
  };

  const toggleAvailability = async () => {
    if (!profile) return;
    await runAction('availability', async () => {
      if (!profile.isAvailable) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('Location permission is required to go online. Enable it in system settings and try again.');
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const updatedProfile = await driverApi.setAvailability(true, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setProfile(updatedProfile);
        setLastLocationAt(new Date());
        setNotice('You are online. Keep the app open to receive requests and send location updates.');
      } else {
        const updatedProfile = await driverApi.setAvailability(false);
        setProfile(updatedProfile);
        setRequests([]);
        setNotice('You are offline.');
      }
      await reloadDashboard();
    });
  };

  const acceptRequest = async (request: DriverRideRequest) => {
    await runAction(`accept-${request.id}`, async () => {
      const ride = await driverApi.acceptRequest(request.id);
      setNotice('Ride accepted.');
      setRequests([]);
      setRides((current) => [ride, ...current.filter((item) => item.id !== ride.id)]);
      await reloadDashboard();
    });
  };

  const rejectRequest = async (request: DriverRideRequest) => {
    await runAction(`reject-${request.id}`, async () => {
      await driverApi.rejectRequest(request.id);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice('Ride request rejected.');
    });
  };

  const transitionRide = async (ride: DriverRide, status: DriverRideStatus) => {
    await runAction(`ride-${ride.id}`, async () => {
      const updatedRide = await driverApi.updateRideStatus(ride.id, status);
      setRides((current) => [updatedRide, ...current.filter((item) => item.id !== ride.id)]);
      setNotice(status === 'TRIP_COMPLETED' ? 'Trip completed. Cash collection recorded.' : `Ride marked ${titleCase(status)}.`);
      await reloadDashboard();
    });
  };

  const markRead = async (notification: DriverNotification) => {
    await runAction(`notification-${notification.id}`, async () => {
      await driverApi.markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item),
      );
    });
  };

  const activeRide = rides.find((ride) => activeRideStatuses.has(ride.status)) ?? null;
  const activeRideNextStatus = activeRide ? getNextRideStatus(activeRide.status) : null;
  const isVerified =
    profile?.accountStatus === 'ACTIVE' &&
    profile.isPhoneVerified &&
    profile?.verificationStatus === 'APPROVED' &&
    profile.documents.some((document) => document.type === 'DRIVING_LICENCE' && document.status === 'APPROVED') &&
    profile.vehicle?.status === 'ACTIVE' &&
    profile.vehicle.documents.some((document) => document.type === 'RC' && document.status === 'APPROVED');

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.mutedText}>Restoring your secure driver session…</Text>
      </SafeAreaView>
    );
  }

  if (restoreError && !authenticated) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.brand}>RAVERO</Text>
        <Text style={styles.screenTitle}>Connection needed</Text>
        <Text style={styles.bodyText}>{restoreError}</Text>
        <Button title="Retry connection" onPress={() => void restore()} />
      </SafeAreaView>
    );
  }

  if (!authenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.brand}>RAVERO</Text>
            <Text style={styles.screenTitle}>Driver sign in</Text>
            <Text style={styles.mutedText}>Use your mobile number to receive a one-time code.</Text>
            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
            {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}
            {!otpSent ? (
              <>
                <Field
                  label="Mobile number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 98765 43210"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Button
                  title={working === 'send-otp' ? 'Sending…' : 'Send OTP'}
                  disabled={Boolean(working) || phone.trim().length < 8}
                  onPress={() => void sendOtp()}
                />
              </>
            ) : (
              <>
                <Field
                  label="Driver name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                />
                <Field
                  label="One-time code"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                />
                {developmentOtp ? (
                  <Text style={styles.devCode}>Local development code: {developmentOtp}</Text>
                ) : null}
                <Button
                  title={working === 'verify-otp' ? 'Verifying…' : 'Verify and sign in'}
                  disabled={Boolean(working) || otp.trim().length !== 6}
                  onPress={() => void verifyOtp()}
                />
                <Button
                  title="Use a different number"
                  secondary
                  disabled={Boolean(working)}
                  onPress={() => {
                    setOtpSent(false);
                    setOtp('');
                    setDevelopmentOtp(null);
                  }}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>RAVERO</Text>
          <Text style={styles.headerSubtitle}>DRIVER</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.smallStrong}>{working === 'logout' ? '…' : 'Sign out'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}

        {section === 'home' ? (
          <>
            <View style={styles.welcomeRow}>
              <View style={styles.flex}>
                <Text style={styles.screenTitle}>Hello{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''}</Text>
                <Text style={styles.mutedText}>Ready for your next Auto ride?</Text>
              </View>
              <View style={[styles.statusPill, profile?.isAvailable ? styles.onlinePill : styles.offlinePill]}>
                <Text style={styles.statusText}>{profile?.isAvailable ? 'ONLINE' : 'OFFLINE'}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Driver availability</Text>
              <Text style={styles.bodyText}>
                {isVerified
                  ? 'You can receive passenger requests within 5 km while your location is fresh.'
                  : 'Profile, driving licence, and Auto vehicle RC must be approved before you can go online.'}
              </Text>
              {profile?.isAvailable && lastLocationAt ? (
                <Text style={styles.smallMuted}>Location sent {lastLocationAt.toLocaleTimeString()}</Text>
              ) : null}
              <Button
                title={
                  working === 'availability'
                    ? 'Updating…'
                    : profile?.isAvailable
                      ? 'Go offline'
                      : 'Go online'
                }
                disabled={Boolean(working) || (!profile?.isAvailable && !isVerified)}
                onPress={() => void toggleAvailability()}
              />
              {profile?.isAvailable ? (
                <Text style={styles.smallMuted}>
                  Location is shared only while online and the app is in the foreground.
                </Text>
              ) : null}
            </View>

            {activeRide ? (
              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>ACTIVE RIDE</Text>
                <Text style={styles.cardTitle}>{titleCase(activeRide.status)}</Text>
                <RideDetails ride={activeRide} />
                {activeRideNextStatus ? (
                  <Button
                    title={
                      working === `ride-${activeRide.id}`
                        ? 'Updating…'
                        : activeRide.status === 'TRIP_STARTED'
                          ? 'Complete trip · cash collected'
                        : `Mark ${titleCase(activeRideNextStatus)}`
                    }
                    disabled={Boolean(working)}
                    onPress={() => void transitionRide(activeRide, activeRideNextStatus)}
                  />
                ) : null}
                {canCancelRide(activeRide.status) ? (
                  <Button
                    title="Cancel ride"
                    secondary
                    disabled={Boolean(working)}
                    onPress={() => void transitionRide(activeRide, 'CANCELLED')}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Nearby requests</Text>
              {profile?.isAvailable ? (
                <Pressable accessibilityRole="button" onPress={() => void reloadDashboard()}>
                  <Text style={styles.linkText}>Refresh</Text>
                </Pressable>
              ) : null}
            </View>
            {!profile?.isAvailable ? (
              <EmptyState text="Go online to receive nearby ride requests." />
            ) : requests.length === 0 ? (
              <EmptyState text="No nearby requests right now. New offers refresh automatically." />
            ) : (
              requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  now={currentTime}
                  working={working === `accept-${request.id}` || working === `reject-${request.id}`}
                  onAccept={() => void acceptRequest(request)}
                  onReject={() => void rejectRequest(request)}
                />
              ))
            )}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Notifications</Text>
              <Text style={styles.smallMuted}>
                {notifications.filter((notification) => !notification.isRead).length} unread
              </Text>
            </View>
            {notifications.slice(0, 4).map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onPress={() => void markRead(notification)}
              />
            ))}
            {notifications.length === 0 ? <EmptyState text="No notifications yet." /> : null}
          </>
        ) : null}

        {section === 'rides' ? (
          <>
            <Text style={styles.screenTitle}>Ride history</Text>
            {rides.length ? rides.map((ride) => <RideCard key={ride.id} ride={ride} />) : (
              <EmptyState text="Your accepted and completed rides will appear here." />
            )}
          </>
        ) : null}

        {section === 'earnings' ? (
          <>
            <Text style={styles.screenTitle}>Earnings</Text>
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>TOTAL CASH FARES</Text>
              <Text style={styles.earningsAmount}>{money(earnings?.totalEarnings ?? 0)}</Text>
              <View style={styles.statRow}>
                <Stat label="Completed rides" value={String(earnings?.completedRideCount ?? 0)} />
                <Stat label="Today" value={String(earnings?.todayRideCount ?? 0)} />
                <Stat label="Cash recorded" value={money(earnings?.cashCollected ?? 0)} />
              </View>
              <Text style={styles.smallMuted}>Commission ₹0 · Platform fee ₹0</Text>
            </View>
            <Text style={styles.sectionTitle}>Completed rides</Text>
            {rides.filter((ride) => ride.status === 'TRIP_COMPLETED').map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
            {!rides.some((ride) => ride.status === 'TRIP_COMPLETED') ? (
              <EmptyState text="Completed rides and cash totals will appear after your first trip." />
            ) : null}
          </>
        ) : null}

        {section === 'profile' ? (
          <>
            <Text style={styles.screenTitle}>Driver profile</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Verification</Text>
              <DocumentStatus label="Driver profile" status={profile?.verificationStatus ?? 'PENDING'} />
              <DocumentStatus
                label="Driving licence"
                status={profile?.documents.find((document) => document.type === 'DRIVING_LICENCE')?.status ?? 'NOT_SUBMITTED'}
              />
              <DocumentStatus
                label="Vehicle"
                status={profile?.vehicle?.status ?? 'NOT_SUBMITTED'}
              />
              <DocumentStatus
                label="Registration certificate"
                status={profile?.vehicle?.documents.find((document) => document.type === 'RC')?.status ?? 'NOT_SUBMITTED'}
              />
              <Text style={styles.smallMuted}>
                Verification is manual. This pilot records document metadata only; it does not upload document images.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your details</Text>
              <Text style={styles.smallMuted}>Phone · {profile?.phone}</Text>
              <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Full name" />
              <Field
                label="Driving licence number"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                placeholder="Licence number"
                autoCapitalize="characters"
              />
              <Text style={styles.sectionTitle}>Auto vehicle</Text>
              <Field label="Make" value={vehicleMake} onChangeText={setVehicleMake} placeholder="Vehicle make" />
              <Field label="Model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="Vehicle model" />
              <Field
                label="Year"
                value={vehicleYear}
                onChangeText={setVehicleYear}
                placeholder="2024"
                keyboardType="number-pad"
              />
              <Field label="Color" value={vehicleColor} onChangeText={setVehicleColor} placeholder="Black" />
              <Field
                label="Plate number"
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                placeholder="TS 09 AB 1234"
                autoCapitalize="characters"
              />
              <Field
                label="Registration number"
                value={vehicleRegistration}
                onChangeText={setVehicleRegistration}
                placeholder="Registration number"
                autoCapitalize="characters"
              />
              <Button
                title={working === 'save-profile' ? 'Saving…' : 'Save profile'}
                disabled={Boolean(working)}
                onPress={() => void saveProfile()}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.tabBar}>
        <Tab title="Home" selected={section === 'home'} onPress={() => setSection('home')} />
        <Tab title="Rides" selected={section === 'rides'} onPress={() => setSection('rides')} />
        <Tab title="Earnings" selected={section === 'earnings'} onPress={() => setSection('earnings')} />
        <Tab title="Profile" selected={section === 'profile'} onPress={() => setSection('profile')} />
      </View>
    </SafeAreaView>
  );
}

function RideDetails({ ride }: { ride: DriverRide }) {
  return (
    <View style={styles.rideDetails}>
      <Text style={styles.bodyText}>Pickup · {ride.pickup.label} — {ride.pickup.address}</Text>
      <Text style={styles.bodyText}>Dropoff · {ride.dropoff.label} — {ride.dropoff.address}</Text>
      <Text style={styles.smallStrong}>
        {ride.distanceKm.toFixed(2)} km · {Math.round(ride.estimatedDurationMinutes)} min · {money(ride.estimatedFare)}
      </Text>
      <Text style={styles.smallMuted}>Payment · Cash · {titleCase(ride.paymentStatus)}</Text>
    </View>
  );
}

function RequestCard({
  request,
  now,
  working,
  onAccept,
  onReject,
}: {
  request: DriverRideRequest;
  now: number;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const secondsRemaining = Math.max(0, Math.ceil((new Date(request.expiresAt).getTime() - now) / 1000));
  return (
    <View style={styles.card}>
      <View style={styles.requestTop}>
        <Text style={styles.cardEyebrow}>
          NEW REQUEST{secondsRemaining >= 0 ? ` · ${secondsRemaining}s` : ''}
        </Text>
        <Text style={styles.requestFare}>{money(request.estimatedFare)}</Text>
      </View>
      <Text style={styles.bodyText}>Pickup · {request.pickup.label} — {request.pickup.address}</Text>
      <Text style={styles.bodyText}>Dropoff · {request.dropoff.label} — {request.dropoff.address}</Text>
      <Text style={styles.smallStrong}>
        {request.distanceKm.toFixed(2)} km · {Math.round(request.estimatedDurationMinutes)} min · Cash
      </Text>
      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button
            title={working ? 'Working…' : 'Accept'}
            disabled={working || (secondsRemaining === 0 && now > 0)}
            onPress={onAccept}
          />
        </View>
        <View style={styles.flex}>
          <Button title="Reject" secondary disabled={working} onPress={onReject} />
        </View>
      </View>
    </View>
  );
}

function RideCard({ ride }: { ride: DriverRide }) {
  return (
    <View style={styles.card}>
      <View style={styles.requestTop}>
        <Text style={styles.cardTitle}>{titleCase(ride.status)}</Text>
        <Text style={styles.smallStrong}>{money(ride.estimatedFare)}</Text>
      </View>
      <RideDetails ride={ride} />
      <Text style={styles.smallMuted}>
        {ride.completedAt ? `Completed ${new Date(ride.completedAt).toLocaleString()}` : `Requested ${new Date(ride.createdAt).toLocaleString()}`}
      </Text>
    </View>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: DriverNotification;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.notification, !notification.isRead && styles.unreadNotification]}>
      <View style={styles.flex}>
        <Text style={styles.smallStrong}>{notification.title}</Text>
        <Text style={styles.bodyText}>{notification.body}</Text>
      </View>
      {!notification.isRead ? <Text style={styles.linkText}>Mark read</Text> : null}
    </Pressable>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.mutedText}>{text}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.smallMuted}>{label}</Text>
      <Text style={styles.smallStrong}>{value}</Text>
    </View>
  );
}

function Tab({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.tab}>
      <Text style={[styles.tabText, selected && styles.selectedTabText]}>{title}</Text>
    </Pressable>
  );
}

const COLORS = {
  background: '#F5F6F2',
  surface: '#FFFFFF',
  ink: '#10120E',
  muted: '#687064',
  border: '#E2E6DE',
  accent: '#A8D900',
  danger: '#A6332A',
  good: '#27724A',
  pending: '#80621E',
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { padding: 18, paddingBottom: 36, gap: 14 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brand: { color: COLORS.ink, fontSize: 24, fontWeight: '900', letterSpacing: 4 },
  headerSubtitle: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  screenTitle: { color: COLORS.ink, fontSize: 23, fontWeight: '800', marginTop: 8 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  mutedText: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  bodyText: { color: COLORS.ink, fontSize: 14, lineHeight: 20, marginTop: 6 },
  smallMuted: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  smallStrong: { color: COLORS.ink, fontSize: 13, fontWeight: '700', marginTop: 8 },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  cardEyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  statusPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  onlinePill: { backgroundColor: '#E5F4C5' },
  offlinePill: { backgroundColor: '#ECEEE9' },
  statusText: { color: COLORS.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  secondaryButton: { backgroundColor: '#EFF1EB', borderWidth: 1, borderColor: COLORS.border },
  disabledButton: { opacity: 0.48 },
  buttonText: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  secondaryButtonText: { color: COLORS.ink },
  field: { gap: 6, marginTop: 10 },
  fieldLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  input: {
    height: 48,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  errorBanner: {
    color: COLORS.danger,
    backgroundColor: '#FCEBE8',
    borderRadius: 10,
    padding: 12,
    lineHeight: 19,
  },
  noticeBanner: {
    color: COLORS.ink,
    backgroundColor: '#EDF5D8',
    borderRadius: 10,
    padding: 12,
    lineHeight: 19,
  },
  devCode: { color: COLORS.pending, backgroundColor: '#F8F1D9', padding: 10, borderRadius: 8, marginTop: 10 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginTop: 4 },
  linkText: { color: COLORS.good, fontSize: 13, fontWeight: '800' },
  emptyState: { backgroundColor: '#ECEFE8', borderRadius: 12, padding: 16, minHeight: 62, justifyContent: 'center' },
  rideDetails: { gap: 2, marginVertical: 4 },
  requestTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  requestFare: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  documentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  goodText: { color: COLORS.good },
  pendingText: { color: COLORS.pending },
  earningsAmount: { color: COLORS.ink, fontSize: 30, fontWeight: '900', marginVertical: 6 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 8 },
  stat: { minWidth: '28%', flexGrow: 1 },
  notification: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unreadNotification: { borderLeftWidth: 4, borderLeftColor: COLORS.accent },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  tabText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  selectedTabText: { color: COLORS.ink, fontWeight: '900' },
  signOut: { padding: 8 },
});
