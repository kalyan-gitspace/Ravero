import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useCustomerAuth } from './auth/AuthProvider';
import { AuthNavigator } from './auth/AuthNavigator';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.error('Could not hold the native RAVERO splash screen.', error);
});

function AppContent() {
  const { status } = useCustomerAuth();
  const opacity = useRef(new Animated.Value(0)).current;
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [logoFadedIn, setLogoFadedIn] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const nativeSplashStarted = useRef(false);

  const hideNativeSplash = useCallback(() => {
    if (nativeSplashStarted.current) return;
    nativeSplashStarted.current = true;
    void SplashScreen.hideAsync()
      .then(() => setNativeSplashHidden(true))
      .catch((error: unknown) => {
        console.error('Could not hide the native RAVERO splash screen.', error);
        setNativeSplashHidden(true);
      });
  }, []);

  useEffect(() => {
    if (!nativeSplashHidden) return;

    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    });

    animation.start(({ finished }) => {
      if (finished) setLogoFadedIn(true);
    });

    return () => animation.stop();
  }, [nativeSplashHidden, opacity]);

  useEffect(() => {
    if (!logoFadedIn || status === 'loading') return;

    const animation = Animated.sequence([
      Animated.delay(1500),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) setSplashVisible(false);
    });

    return () => animation.stop();
  }, [logoFadedIn, opacity, status]);

  return (
    <>
      <StatusBar hidden={splashVisible} style={splashVisible ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}
      />
      <AuthNavigator />
      {splashVisible ? (
        <View onLayout={hideNativeSplash} style={styles.splash}>
          <Animated.View style={[styles.logoFrame, { opacity }]}>
            <Image
              accessibilityLabel="RAVERO, Made in India"
              resizeMode="contain"
              source={require('../assets/branding/splash-logo.png')}
              style={styles.logo}
            />
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

export function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  logoFrame: {
    width: 340,
    height: 340,
    maxWidth: '90%',
    maxHeight: '90%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
