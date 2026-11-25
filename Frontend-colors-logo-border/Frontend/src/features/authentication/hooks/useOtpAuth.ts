import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { dictionaries } from '@/i18n';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { OtpNextAction, OtpRequestPayload, SupportedLocale } from '@/types/auth';
import { isValidCameroonPhone, isValidEmail, isValidFullName, isValidOtpCode } from '@/utils/validation';

interface OtpChallenge extends OtpRequestPayload {
  nextAction: OtpNextAction;
  issuedCode: string;
  expiresAt: number | null;
}

type AuthError =
  | 'invalidPhone' | 'invalidEmail' | 'invalidOtp' | 'invalidFullName'
  | 'invalidOrExpiredOtp' | 'otpExpired' | 'rateLimited' | 'localOtpDisabled'
  | 'deliveryUnavailable' | 'authenticationFailed' | 'registrationFailed'
  | 'loginRequired' | 'unexpectedOtpResponse';

export function useOtpAuth(onSuccess?: () => void) {
  const { setSession } = useAuth();
  const { locale, setLocale, t, formatMessage } = useLanguage();
  const { pushToast } = useToast();
  const [phone, setPhone] = useState('+237');
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [preferredLang, setPreferredLang] = useState<SupportedLocale>(locale);
  const [now, setNow] = useState(Date.now);
  const [retryAt, setRetryAt] = useState(0);
  const [error, setError] = useState<AuthError | null>(null);
  const [pending, setPending] = useState<'request' | 'authenticate' | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const expiresAt = challenge?.expiresAt;
  const isExpired = expiresAt != null && expiresAt <= now;
  const cooldownSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const secondsRemaining = Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 1000));
  const clockActive = (expiresAt != null && !isExpired) || cooldownSeconds > 0;

  useEffect(() => {
    if (!clockActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [clockActive]);

  useEffect(() => () => { generation.current += 1; }, []);

  function reset() {
    if (inFlight.current) return;
    setChallenge(null);
    setCode('');
    setFullName('');
    setError(null);
    // Keep a server-issued cooldown when the user goes back to change the details.
  }

  function handleError(failure: unknown, action?: OtpNextAction) {
    if (failure instanceof ApiClientError) {
      if (failure.status === 429) {
        const time = Date.now();
        setNow(time);
        setRetryAt(time + (failure.retryAfterSeconds ?? 0) * 1000);
        setError('rateLimited');
        return;
      }
      if (failure.status === 403) return setError('localOtpDisabled');
      if (failure.code === 'LOGIN_REQUIRED' && action === 'register') {
        setChallenge((current) => current && { ...current, nextAction: 'login', issuedCode: '', expiresAt: null });
        setCode('');
        return setError('loginRequired');
      }
      if (failure.status === 422) return setError('invalidOrExpiredOtp');
      if (failure.status === 503) return setError('deliveryUnavailable');
      if (failure.status === 400 && action === 'register') {
        setChallenge((current) => current && { ...current, issuedCode: '', expiresAt: null });
        setCode('');
        return setError('registrationFailed');
      }
    }
    setError('authenticationFailed');
  }

  async function requestOtp() {
    if (inFlight.current || retryAt > Date.now()) return false;
    const requestPhone = challenge?.phone ?? phone.trim();
    const requestEmail = challenge?.email ?? email.trim();
    if (!isValidCameroonPhone(requestPhone)) {
      setError('invalidPhone');
      return false;
    }
    if (!isValidEmail(requestEmail)) {
      setError('invalidEmail');
      return false;
    }

    const active = generation.current;
    inFlight.current = true;
    setPending('request');
    setError(null);
    try {
      const response = await apiClient.requestOtp({ phone: requestPhone, email: requestEmail });
      if (active !== generation.current) return false;
      const expiry = Date.parse(response?.expiresAt);
      if (typeof response?.code !== 'string' || !isValidOtpCode(response.code) || !Number.isFinite(expiry) ||
          (response.nextAction !== 'login' && response.nextAction !== 'register')) {
        setChallenge(null);
        setCode('');
        setError('unexpectedOtpResponse');
        return false;
      }
      setChallenge({ phone: requestPhone, email: requestEmail, issuedCode: response.code, expiresAt: expiry, nextAction: response.nextAction });
      setNow(Date.now());
      setCode('');
      return true;
    } catch (failure) {
      if (active === generation.current) handleError(failure);
      return false;
    } finally {
      inFlight.current = false;
      if (active === generation.current) setPending(null);
    }
  }

  async function authenticate() {
    if (inFlight.current || retryAt > Date.now() || !challenge || challenge.expiresAt === null) return false;
    if (challenge.expiresAt <= Date.now()) {
      setNow(Date.now());
      setError('otpExpired');
      return false;
    }
    if (!isValidOtpCode(code)) {
      setError('invalidOtp');
      return false;
    }
    const name = fullName.trim();
    const action = challenge.nextAction;
    if (action === 'register' && !isValidFullName(name)) {
      setError('invalidFullName');
      return false;
    }

    const active = generation.current;
    inFlight.current = true;
    setPending('authenticate');
    setError(null);
    try {
      const proof = { phone: challenge.phone, code };
      const session = action === 'login'
        ? await apiClient.login(proof)
        : await apiClient.verifyOtp({ ...proof, fullName: name, preferredLang });
      if (active !== generation.current) return false;
      setSession(session);
      setLocale(session.user.preferredLang);
      const copy = dictionaries[session.user.preferredLang] ?? t;
      pushToast(formatMessage(action === 'login' ? copy.auth.loginSuccess : copy.auth.registerSuccess, { name: session.user.fullName }), 'success');
      onSuccess?.();
      return true;
    } catch (failure) {
      if (active === generation.current) handleError(failure, action);
      return false;
    } finally {
      inFlight.current = false;
      if (active === generation.current) setPending(null);
    }
  }

  const message = error === 'rateLimited' && cooldownSeconds > 0
    ? formatMessage(t.auth.rateLimitedCountdown, { seconds: cooldownSeconds })
    : error ? t.auth[error] : null;

  return {
    phone, setPhone, email, setEmail, challenge, code, setCode, fullName, setFullName, preferredLang, setPreferredLang,
    secondsRemaining, cooldownSeconds, isExpired, error: message, pending, requestOtp, authenticate, reset,
  };
}
