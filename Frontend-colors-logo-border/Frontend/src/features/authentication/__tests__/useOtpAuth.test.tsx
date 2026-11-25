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
    window.localStorage.removeItem('zibi.locale');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('requests local OTP with the phone and email and advances to OTP step', async () => {
    const reqSpy = vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345',
      nextAction: 'register',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    const { result } = renderHook(() => useOtpAuth(), { wrapper });

    act(() => {
      result.current.setPhone('+237677000000');
      result.current.setEmail('amina@example.com');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestOtp();
    });

    expect(ok).toBe(true);
    expect(reqSpy).toHaveBeenCalledWith({
      phone: '+237677000000',
      email: 'amina@example.com',
    });
    expect(result.current.challenge?.nextAction).toBe('register');
    expect(result.current.challenge?.issuedCode).toBe('012345');
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
      result.current.setEmail('amina@example.com');
    });

    await act(async () => {
      await result.current.requestOtp();
    });

    expect(result.current.cooldownSeconds).toBe(45);
    expect(result.current.error).toContain('45');
  });

  it('handles 422 INVALID_OR_EXPIRED_OTP and verifies valid 6-digit code with leading zero', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345',
      nextAction: 'register',
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
      result.current.otp.setEmail('amina@example.com');
    });
    await act(async () => {
      await result.current.otp.requestOtp();
    });

    act(() => {
      result.current.otp.setCode('012345');
      result.current.otp.setFullName('Amina N.');
      result.current.otp.setEmail('another@example.com');
      result.current.otp.setPreferredLang('fr');
    });

    await act(async () => {
      await result.current.otp.authenticate();
    });
    expect(result.current.otp.error).toBeTruthy();
    expect(result.current.auth.session).toBeNull();

    await act(async () => {
      await result.current.otp.authenticate();
    });

    expect(verifySpy).toHaveBeenLastCalledWith({
      phone: '+237677000000',
      code: '012345',
      fullName: 'Amina N.',
      preferredLang: 'fr',
    });
    expect(result.current.auth.session?.user.fullName).toBe('Amina N.');
    expect(result.current.auth.homeSeed?.status).toBe('ready');

    act(() => {
      result.current.auth.signOut();
    });
    expect(result.current.auth.session).toBeNull();
    expect(result.current.auth.homeSeed).toBeNull();
  });

  it('rejects an invalid phone or missing email before calling the API and blocks duplicate requests', async () => {
    const request = vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'login',
    });
    const { result } = renderHook(() => useOtpAuth(), { wrapper });

    await act(async () => { expect(await result.current.requestOtp()).toBe(false); });
    act(() => result.current.setPhone('+237677000000'));
    await act(async () => { expect(await result.current.requestOtp()).toBe(false); });
    expect(request).not.toHaveBeenCalled();

    act(() => result.current.setEmail('amina@example.com'));
    await act(async () => {
      const first = result.current.requestOtp();
      expect(await result.current.requestOtp()).toBe(false);
      expect(await first).toBe(true);
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('requires a full name for registration and switches to login only after issuing a fresh code', async () => {
    const request = vi.spyOn(apiClient, 'requestOtp')
      .mockResolvedValueOnce({ code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'register' })
      .mockResolvedValueOnce({ code: '054321', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'login' });
    const verify = vi.spyOn(apiClient, 'verifyOtp').mockRejectedValue(
      new ApiClientError({ message: 'Account exists', code: 'LOGIN_REQUIRED', status: 409, kind: 'CONFLICT' }),
    );
    const login = vi.spyOn(apiClient, 'login');
    const { result } = renderHook(() => useOtpAuth(), { wrapper });

    act(() => {
      result.current.setPhone('+237677000000');
      result.current.setEmail('amina@example.com');
    });
    await act(async () => { await result.current.requestOtp(); });
    act(() => result.current.setCode('012345'));
    await act(async () => { expect(await result.current.authenticate()).toBe(false); });
    expect(verify).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/full name/i);

    act(() => result.current.setFullName('Amina N.'));
    await act(async () => { await result.current.authenticate(); });

    expect(result.current.challenge).toMatchObject({ nextAction: 'login', expiresAt: null, issuedCode: '' });
    expect(result.current.error).toMatch(/request a fresh code/i);
    await act(async () => { expect(await result.current.authenticate()).toBe(false); });
    expect(login).not.toHaveBeenCalled();

    await act(async () => { await result.current.requestOtp(); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.challenge).toMatchObject({ nextAction: 'login', issuedCode: '054321' });
  });

  it('blocks expired OTPs before calling login', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 1000).toISOString(), nextAction: 'login',
    });
    const login = vi.spyOn(apiClient, 'login');
    const { result } = renderHook(() => useOtpAuth(), { wrapper });

    act(() => {
      result.current.setPhone('+237677000000');
      result.current.setEmail('amina@example.com');
    });
    await act(async () => { await result.current.requestOtp(); });
    act(() => result.current.setCode('012345'));
    act(() => { vi.advanceTimersByTime(1001); });
    await act(async () => { expect(await result.current.authenticate()).toBe(false); });
    expect(result.current.isExpired).toBe(true);
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects an outdated OTP response without choosing an authentication endpoint', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: undefined!,
    });
    const { result } = renderHook(() => useOtpAuth(), { wrapper });
    act(() => {
      result.current.setPhone('+237677000000');
      result.current.setEmail('amina@example.com');
    });
    await act(async () => { expect(await result.current.requestOtp()).toBe(false); });
    expect(result.current.challenge).toBeNull();
    expect(result.current.error).toMatch(/current login API/i);
  });
});
