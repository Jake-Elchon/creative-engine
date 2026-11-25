import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ToastProvider } from '@/app/providers/ToastProvider';
import { StudioRouteGuard } from '@/app/guards/StudioRouteGuard';
import { PublicLayout } from '@/layouts/PublicLayout';
import { apiClient } from '@/services/api';
import type { AuthSession, OtpRequestResponse } from '@/types/auth';
import { ApiClientError } from '@/types/api';
import { SignInPage } from '../components/SignInPage';

vi.mock('@/config/env', async (importOriginal) => {
  const source = await importOriginal<typeof import('@/config/env')>();
  return { env: { ...source.env, localOtpAvailable: true } };
});

const proof = { phone: '+237677000000', email: 'fan@example.test' };
const session: AuthSession = {
  accessToken: 'test-access', refreshToken: 'test-refresh',
  user: { ...proof, id: 'fan', fullName: 'Amina N.', preferredLang: 'en', registeredAt: '' },
  home: { status: 'ready', artists: [], nextCursor: null },
};

function RouteDestination() {
  const { pathname, search, hash } = useLocation();
  return <div>{pathname}{search}{hash}</div>;
}

function renderSignIn(initialEntry = '/') {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<h1>Discover</h1>} />
                <Route path="/login" element={<SignInPage key="login" />} />
                <Route path="/create-account" element={<SignInPage key="create-account" createAccount />} />
              </Route>
              <Route path="/studio/products" element={<StudioRouteGuard><RouteDestination /></StudioRouteGuard>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>,
  );
}

async function enterDetails(user: ReturnType<typeof userEvent.setup>) {
  const phone = await screen.findByRole('textbox', { name: /phone number/i });
  await user.clear(phone);
  await user.type(phone, proof.phone);
  await user.type(screen.getByRole('textbox', { name: /email address/i }), proof.email);
}

describe('Zibi login page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('links to sign-in from public navigation, logs in with only the OTP, and exposes sign-out', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'login',
    });
    const login = vi.spyOn(apiClient, 'login')
      .mockRejectedValueOnce(new ApiClientError({ code: 'INVALID_OR_EXPIRED_OTP', message: 'Invalid code', kind: 'UNPROCESSABLE_ENTITY', status: 422 }))
      .mockResolvedValueOnce(session);
    const register = vi.spyOn(apiClient, 'verifyOtp');
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole('link', { name: 'Sign In' }));
    await enterDetails(user);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    const firstDigit = await screen.findByRole('textbox', { name: 'Digit 1 of 6' });
    expect(screen.queryByRole('textbox', { name: 'Full Name' })).toBeNull();
    await user.click(firstDigit);
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be verified/i);

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeInTheDocument();
    expect(login).toHaveBeenLastCalledWith({ phone: proof.phone, code: '012345' });
    expect(register).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(screen.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  it('returns to the requested Studio page with its query and hash after sign-in', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'login',
    });
    vi.spyOn(apiClient, 'login').mockResolvedValue(session);
    const user = userEvent.setup();
    renderSignIn('/studio/products?focus=prices#price');

    await enterDetails(user);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    await user.click(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }));
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('/studio/products?focus=prices#price')).toBeInTheDocument();
  });

  it('shows a loading state while requesting the code and a clear network error on failure', async () => {
    let fail!: (reason: unknown) => void;
    vi.spyOn(apiClient, 'requestOtp').mockReturnValueOnce(new Promise<OtpRequestResponse>((_, reject) => { fail = reject; }));
    const user = userEvent.setup();
    renderSignIn('/login');
    await enterDetails(user);

    const submit = screen.getByRole('button', { name: /send verification code/i });
    await user.click(submit);
    expect(submit).toBeDisabled();
    expect(submit.closest('form')).toHaveAttribute('aria-busy', 'true');

    await act(async () => { fail(new Error('Offline')); });
    expect(await screen.findByRole('alert')).toHaveTextContent(/check your connection/i);
    expect(submit).toBeEnabled();
  });

  it('creates an account from the public entry point using the server-selected registration form', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'register',
    });
    const verify = vi.spyOn(apiClient, 'verifyOtp').mockResolvedValue(session);
    const login = vi.spyOn(apiClient, 'login');
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole('link', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeVisible();
    await enterDetails(user);
    await user.click(screen.getByRole('button', { name: 'Get code' }));
    await user.click(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }));
    await user.paste('012345');
    await user.type(screen.getByRole('textbox', { name: 'Full Name' }), session.user.fullName);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Preferred Language' }), 'en');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeVisible();
    expect(verify).toHaveBeenCalledExactlyOnceWith({
      phone: proof.phone, code: '012345', fullName: session.user.fullName, preferredLang: 'en',
    });
    expect(login).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull();
  });

  it('preserves the Studio destination when switching to create account and logs in if the API finds an existing account', async () => {
    vi.spyOn(apiClient, 'requestOtp').mockResolvedValue({
      code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString(), nextAction: 'login',
    });
    const verify = vi.spyOn(apiClient, 'verifyOtp');
    const login = vi.spyOn(apiClient, 'login').mockResolvedValue(session);
    const user = userEvent.setup();
    renderSignIn('/studio/products?focus=prices#price');

    await user.click(await within(screen.getByRole('main')).findByRole('link', { name: 'Create account' }));
    await enterDetails(user);
    await user.click(screen.getByRole('button', { name: 'Get code' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Full Name' })).toBeNull();
    await user.click(screen.getByRole('textbox', { name: 'Digit 1 of 6' }));
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('/studio/products?focus=prices#price')).toBeInTheDocument();
    expect(login).toHaveBeenCalledExactlyOnceWith({ phone: proof.phone, code: '012345' });
    expect(verify).not.toHaveBeenCalled();
  });
});
