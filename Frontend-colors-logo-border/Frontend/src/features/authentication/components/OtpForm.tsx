import type { FormEvent } from 'react';
import { Clock, Mail, Phone, RefreshCw, User } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Select } from '@/components/ui/Select/Select';
import { env } from '@/config/env';
import { apiClient } from '@/services/api';
import { MAX_EMAIL_LENGTH, MAX_FULL_NAME_LENGTH } from '@/utils/validation';
import type { SupportedLocale } from '@/types/auth';
import { useOtpAuth } from '../hooks/useOtpAuth';
import { OtpInput } from './OtpInput';
import './OtpForm.css';

interface OtpFormProps {
  auth: ReturnType<typeof useOtpAuth>;
  showChallengeTitle?: boolean;
  requestLabel?: string;
}

export function OtpForm({ auth, showChallengeTitle = true, requestLabel }: OtpFormProps) {
  const { t, formatMessage } = useLanguage();
  const { challenge, pending, cooldownSeconds, isExpired } = auth;
  const busy = pending !== null;
  const registration = challenge?.nextAction === 'register';
  const canAuthenticate = challenge?.expiresAt != null && !isExpired && cooldownSeconds === 0;
  const countdown = `${Math.floor(auth.secondsRemaining / 60)}:${String(auth.secondsRemaining % 60).padStart(2, '0')}`;
  const resendLabel = cooldownSeconds
    ? formatMessage(t.auth.resendIn, { seconds: cooldownSeconds })
    : t.auth.resendOtp;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (challenge) void auth.authenticate();
    else void auth.requestOtp();
  }

  if (!env.localOtpAvailable) {
    return <p className="zibi-otp-note" role="status">{t.auth.hostedUnavailable}</p>;
  }

  return (
    <div className="zibi-otp-flow">
      <p className="zibi-otp-note">{t.auth.localOnly}</p>
      {apiClient.isMock && <Badge variant="gold">{t.auth.mockHint}</Badge>}
      <form onSubmit={submit} noValidate aria-busy={busy} className="zibi-otp-flow">
        {challenge ? (
          <>
            {showChallengeTitle && <h2 className="zibi-otp-form-title">{registration ? t.auth.registerTitle : t.auth.loginTitle}</h2>}
            <div className="zibi-otp-challenge">
              {challenge.issuedCode && !isExpired && (
                <p>{formatMessage(t.auth.localCode, { phone: challenge.phone, code: challenge.issuedCode })}</p>
              )}
              <div className="zibi-otp-challenge__actions">
                {challenge.expiresAt !== null && (
                  <span className={isExpired ? 'zibi-field__error' : undefined}>
                    <Clock size={14} aria-hidden="true" />
                    {isExpired ? t.auth.otpExpired : formatMessage(t.auth.otpExpiresIn, { time: countdown })}
                  </span>
                )}
                <Button type="button" variant="ghost" size="sm" leftIcon={<RefreshCw size={14} aria-hidden="true" />}
                  isLoading={pending === 'request'} disabled={busy || cooldownSeconds > 0}
                  onClick={() => void auth.requestOtp()}>{resendLabel}</Button>
              </div>
            </div>
            <OtpInput value={auth.code} onChange={auth.setCode} disabled={busy || !canAuthenticate}
              hasError={Boolean(auth.error)} />
            {registration && (
              <div className="zibi-otp-flow">
                <hr className="cultural-divider" />
                <Input label={t.auth.fullNameLabel} placeholder={t.auth.fullNamePlaceholder} autoComplete="name"
                  leftIcon={<User size={16} aria-hidden="true" />} maxLength={MAX_FULL_NAME_LENGTH}
                  value={auth.fullName} onChange={(event) => auth.setFullName(event.target.value)}
                  required disabled={busy} />
                <Select label={t.auth.preferredLangLabel} value={auth.preferredLang} disabled={busy}
                  onChange={(event) => auth.setPreferredLang(event.target.value as SupportedLocale)}
                  options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} required />
              </div>
            )}
          </>
        ) : (
          <>
            <Input label={t.auth.phoneLabel} placeholder={t.auth.phonePlaceholder} hint={t.auth.phoneHint}
              type="tel" autoComplete="tel" leftIcon={<Phone size={16} aria-hidden="true" />}
              value={auth.phone} onChange={(event) => auth.setPhone(event.target.value)} required disabled={busy} />
            <Input label={t.auth.emailLabel} placeholder={t.auth.emailPlaceholder} type="email" autoComplete="email"
              leftIcon={<Mail size={16} aria-hidden="true" />} maxLength={MAX_EMAIL_LENGTH}
              value={auth.email} onChange={(event) => auth.setEmail(event.target.value)} required disabled={busy} />
          </>
        )}

        {auth.error && <p className="zibi-field__error" role="alert">{auth.error}</p>}
        <div className="zibi-otp-form-actions">
          {challenge && (
            <Button type="button" variant="secondary" disabled={busy} onClick={auth.reset}>{t.auth.changePhone}</Button>
          )}
          <Button type="submit" fullWidth isLoading={challenge ? pending === 'authenticate' : pending === 'request'}
            disabled={busy || cooldownSeconds > 0 || (challenge !== null && !canAuthenticate)}>
            {challenge ? (registration ? t.auth.registerSubmit : t.auth.loginTitle)
              : cooldownSeconds ? resendLabel : (requestLabel ?? t.auth.sendOtp)}
          </Button>
        </div>
      </form>
    </div>
  );
}
