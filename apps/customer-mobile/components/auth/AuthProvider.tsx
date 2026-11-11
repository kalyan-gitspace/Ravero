import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, customerApi } from '../../src/api/client';
import type { CustomerProfile, SendOtpResponse } from '../../src/api/types';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  customer: CustomerProfile | null;
  startupError: string | null;
  developmentOtp: string | null;
  requestOtp(phone: string): Promise<SendOtpResponse>;
  verifyOtp(phone: string, otp: string): Promise<'complete-profile' | 'authenticated'>;
  completeProfile(fullName: string, email?: string): Promise<void>;
  getProfile(): Promise<CustomerProfile>;
  updateProfile(data: { fullName?: string; email?: string | null }): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [developmentOtp, setDevelopmentOtp] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState<{
    phone: string;
    otp: string;
  } | null>(null);

  useEffect(() => {
    customerApi.setSessionExpiredHandler(() => {
      setCustomer(null);
      setStatus('unauthenticated');
      setPendingVerification(null);
    });

    void customerApi
      .restoreSession()
      .then(async (restoredCustomer) => {
        if (!restoredCustomer) return null;
        const profile = await customerApi.getProfile();
        return profile ?? restoredCustomer;
      })
      .then((profile) => {
        if (profile) {
          setCustomer(profile);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      })
      .catch((error: unknown) => {
        setStartupError(
          error instanceof Error ? error.message : 'Could not restore your RAVERO session.',
        );
        setStatus('unauthenticated');
      });

    return () => customerApi.setSessionExpiredHandler(null);
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const result = await customerApi.sendOtp(phone);
    setDevelopmentOtp(result.developmentOtp ?? null);
    return result;
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    try {
      const session = await customerApi.verifyOtp(phone, otp);
      setPendingVerification(null);
      setDevelopmentOtp(null);
      setCustomer(session.customer);
      setStatus('authenticated');
      return 'authenticated' as const;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CUSTOMER_DETAILS_REQUIRED') {
        setPendingVerification({ phone, otp });
        return 'complete-profile' as const;
      }
      throw error;
    }
  }, []);

  const completeProfile = useCallback(
    async (fullName: string, email?: string) => {
      if (!pendingVerification) {
        throw new Error('Your verification has expired. Request a new code.');
      }

      const session = await customerApi.verifyOtp(
        pendingVerification.phone,
        pendingVerification.otp,
        { fullName, ...(email ? { email } : {}) },
      );
      setPendingVerification(null);
      setDevelopmentOtp(null);
      setCustomer(session.customer);
      setStatus('authenticated');
    },
    [pendingVerification],
  );

  const updateProfile = useCallback(
    async (data: { fullName?: string; email?: string | null }) => {
      const updatedCustomer = await customerApi.updateProfile(data);
      setCustomer(updatedCustomer);
    },
    [],
  );

  const getProfile = useCallback(async () => {
    const profile = await customerApi.getProfile();
    setCustomer(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await customerApi.logout();
    } finally {
      setPendingVerification(null);
      setCustomer(null);
      setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      customer,
      startupError,
      developmentOtp,
      requestOtp,
      verifyOtp,
      completeProfile,
      getProfile,
      updateProfile,
      logout,
    }),
    [
      status,
      customer,
      startupError,
      developmentOtp,
      requestOtp,
      verifyOtp,
      completeProfile,
      getProfile,
      updateProfile,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCustomerAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within AuthProvider.');
  }
  return context;
}
