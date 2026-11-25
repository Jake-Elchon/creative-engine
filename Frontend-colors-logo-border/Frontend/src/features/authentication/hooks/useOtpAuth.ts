import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { OtpChannel, SupportedLocale } from '@/types/auth';
import {
  isValidCameroonPhone,
  isValidEmail,
  isValidFullName,
  isValidOtpCode,
} from '@/utils/validation';

export function useOtpAuth(onSuccess?: () => void) {
  const { setSession } = useAuth();
  const { locale, setLocale, t, formatMessage } = useLanguage();
  const { pushToast } = useToast();

  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phone, setPhone] = useState('+237');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [preferredLang, setPreferredLang] = useState<SupportedLocale>(locale);

  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync OTP expiry countdown
  useEffect(() => {
    if (!expiresAtMs) {
      setSecondsRemaining(0);
      return;
    }

    const update = () => {
      const diff = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsRemaining(diff);
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs]);

  // Sync Retry-After cooldown countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const reset = useCallback(() => {
    setStep('PHONE');
    setCode('');
    setError(null);
    setExpiresAtMs(null);
    setSecondsRemaining(0);
    setCooldownSeconds(0);
  }, []);

  const requestOtp = useCallback(async (): Promise<boolean> => {
    if (isSubmitting || cooldownSeconds > 0) return false;
    setError(null);

    if (!isValidCameroonPhone(phone)) {
      setError(t.auth.invalidPhone);
      return false;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.requestOtp({ phone, channel });
      const parsedExpiry = Date.parse(res.expiresAt);
      setExpiresAtMs(Number.isNaN(parsedExpiry) ? null : parsedExpiry);
      setCode('');
      setStep('OTP');
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.kind === 'RATE_LIMITED') {
          if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
            setCooldownSeconds(err.retryAfterSeconds);
            setError(
              formatMessage(t.auth.rateLimitedCountdown, {
                seconds: err.retryAfterSeconds,
              }),
            );
          } else {
            setError(t.auth.rateLimited);
          }
        } else if (err.kind === 'SERVICE_UNAVAILABLE') {
          setError(t.auth.deliveryUnavailable);
        } else if (err.kind === 'VALIDATION_ERROR') {
          setError(err.message || t.auth.invalidPhone);
        } else {
          setError(err.message);
        }
      } else {
        setError(t.discovery.initialErrorServer);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    channel,
    cooldownSeconds,
    formatMessage,
    isSubmitting,
    phone,
    t.auth.deliveryUnavailable,
    t.auth.invalidPhone,
    t.auth.rateLimited,
    t.auth.rateLimitedCountdown,
    t.discovery.initialErrorServer,
  ]);

  const verifyOtp = useCallback(async (): Promise<boolean> => {
    if (isSubmitting || cooldownSeconds > 0) return false;
    setError(null);

    if (!isValidCameroonPhone(phone)) {
      setError(t.auth.invalidPhone);
      return false;
    }

    if (!isValidOtpCode(code)) {
      setError(t.auth.invalidOtp);
      return false;
    }

    const trimmedName = fullName.trim();
    if (trimmedName.length > 0 && !isValidFullName(trimmedName)) {
      setError(t.auth.invalidFullName);
      return false;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 0 && !isValidEmail(trimmedEmail)) {
      setError(t.auth.invalidEmail);
      return false;
    }

    setIsSubmitting(true);
    try {
      const session = await apiClient.verifyOtp({
        phone,
        code,
        fullName: trimmedName || undefined,
        preferredLang,
        email: trimmedEmail || undefined,
      });

      setSession(session);
      if (session.user.preferredLang) {
        setLocale(session.user.preferredLang);
      }
      pushToast(
        session.isMockDemo
          ? `${session.user.fullName} — [DEMO MOCK]`
          : session.user.fullName,
        'success',
      );
      reset();
      onSuccess?.();
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'INVALID_OR_EXPIRED_OTP' || err.kind === 'UNPROCESSABLE_ENTITY') {
          setError(t.auth.invalidOrExpiredOtp);
        } else if (err.kind === 'RATE_LIMITED') {
          if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
            setCooldownSeconds(err.retryAfterSeconds);
            setError(
              formatMessage(t.auth.rateLimitedCountdown, {
                seconds: err.retryAfterSeconds,
              }),
            );
          } else {
            setError(t.auth.rateLimited);
          }
        } else {
          setError(err.message);
        }
      } else {
        setError(t.discovery.initialErrorServer);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    code,
    cooldownSeconds,
    email,
    formatMessage,
    fullName,
    isSubmitting,
    onSuccess,
    phone,
    preferredLang,
    pushToast,
    reset,
    setLocale,
    setSession,
    t.auth.invalidEmail,
    t.auth.invalidFullName,
    t.auth.invalidOrExpiredOtp,
    t.auth.invalidOtp,
    t.auth.invalidPhone,
    t.auth.rateLimited,
    t.auth.rateLimitedCountdown,
    t.discovery.initialErrorServer,
  ]);

  const isExpired = expiresAtMs !== null && secondsRemaining === 0;

  return {
    step,
    setStep,
    phone,
    setPhone,
    channel,
    setChannel,
    code,
    setCode,
    fullName,
    setFullName,
    email,
    setEmail,
    preferredLang,
    setPreferredLang,
    secondsRemaining,
    cooldownSeconds,
    isExpired,
    error,
    setError,
    isSubmitting,
    requestOtp,
    verifyOtp,
    reset,
  };
}
