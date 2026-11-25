import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ToastProvider } from '@/app/providers/ToastProvider';
import { useOtpAuth } from '@/features/authentication/hooks/useOtpAuth';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

describe('useOtpAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests OTP with SMS/WhatsApp channel and advances to OTP step', async () => {
    const reqSpy = vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    const { result } = renderHook(() => useOtpAuth(), { wrapper });

    act(() => {
      result.current.setPhone('+237677000000');
      result.current.setChannel('whatsapp');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestOtp();
    });

    expect(ok).toBe(true);
    expect(reqSpy).toHaveBeenCalledWith({
      phone: '+237677000000',
      channel: 'whatsapp',
    });
    expect(result.current.step).toBe('OTP');
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
  });

  it('respects Retry-After header on 429 RATE_LIMITED', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockRejectedValue(
      new ApiClientError({
        message: 'Too many requests',
        code: 'RATE_LIMITED',
        status: 429,
        kind: 'RATE_LIMITED',
        retryAfterSeconds: 45,
      }),
    );

    const { result } = renderHook(() => useOtpAuth(), { wrapper });
    act(() => {
      result.current.setPhone('+237677000000');
    });

    await act(async () => {
      await result.current.requestOtp();
    });

    expect(result.current.cooldownSeconds).toBe(45);
    expect(result.current.error).toContain('45');
  });

  it('handles 422 INVALID_OR_EXPIRED_OTP and verifies valid 6-digit code with leading zero', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    const verifySpy = vi
      .spyOn(apiClient, 'verifyOtp')
      .mockRejectedValueOnce(
        new ApiClientError({
          message: 'Invalid code',
          code: 'INVALID_OR_EXPIRED_OTP',
          status: 422,
          kind: 'UNPROCESSABLE_ENTITY',
        }),
      )
      .mockResolvedValueOnce({
        accessToken: 'tok_acc',
        refreshToken: 'tok_ref',
        user: {
          id: 'u_1',
          email: 'amina@example.com',
          fullName: 'Amina N.',
          preferredLang: 'fr',
          registeredAt: new Date().toISOString(),
          phone: '+237677000000',
        },
        home: {
          status: 'ready',
          artists: [],
          nextCursor: null,
        },
      });

    const { result } = renderHook(
      () => ({ otp: useOtpAuth(), auth: useAuth() }),
      { wrapper },
    );

    act(() => {
      result.current.otp.setPhone('+237677000000');
    });
    await act(async () => {
      await result.current.otp.requestOtp();
    });

    act(() => {
      result.current.otp.setCode('012345');
      result.current.otp.setFullName('Amina N.');
      result.current.otp.setEmail('amina@example.com');
      result.current.otp.setPreferredLang('fr');
    });

    await act(async () => {
      await result.current.otp.verifyOtp();
    });
    expect(result.current.otp.error).toBeTruthy();
    expect(result.current.auth.session).toBeNull();

    await act(async () => {
      await result.current.otp.verifyOtp();
    });

    expect(verifySpy).toHaveBeenLastCalledWith({
      phone: '+237677000000',
      code: '012345',
      fullName: 'Amina N.',
      preferredLang: 'fr',
      email: 'amina@example.com',
    });
    expect(result.current.auth.session?.user.fullName).toBe('Amina N.');
    expect(result.current.auth.homeSeed?.status).toBe('ready');

    act(() => {
      result.current.auth.signOut();
    });
    expect(result.current.auth.session).toBeNull();
    expect(result.current.auth.homeSeed).toBeNull();
  });
});
