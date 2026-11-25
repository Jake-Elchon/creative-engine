import type { FormEvent } from 'react';
import { Clock, Mail, Phone, RefreshCw, User } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { Select } from '@/components/ui/Select/Select';
import { OtpInput } from '@/features/authentication/components/OtpInput';
import { useOtpAuth } from '@/features/authentication/hooks/useOtpAuth';
import { apiClient } from '@/services/api';
import type { SupportedLocale } from '@/types/auth';
import { MAX_EMAIL_LENGTH, MAX_FULL_NAME_LENGTH } from '@/utils/validation';

function formatCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface OtpModalProps {
  onSuccess?: () => void;
}

export function OtpModal({ onSuccess }: OtpModalProps = {}) {
  const { isAuthModalOpen, closeAuthModal } = useAuth();
  const { t, formatMessage } = useLanguage();

  const otpAuth = useOtpAuth(() => {
    closeAuthModal();
    onSuccess?.();
  });

  const handleClose = () => {
    otpAuth.reset();
    closeAuthModal();
  };

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await otpAuth.requestOtp();
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    await otpAuth.verifyOtp();
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={handleClose}
      title={t.auth.modalTitle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {t.auth.modalSubtitle}
        </p>

        {apiClient.isMock && <Badge variant="gold">{t.auth.mockHint}</Badge>}

        {otpAuth.step === 'PHONE' ? (
          <form
            onSubmit={handlePhoneSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            <Input
              label={t.auth.phoneLabel}
              placeholder={t.auth.phonePlaceholder}
              hint={t.auth.phoneHint}
              value={otpAuth.phone}
              onChange={(e) => otpAuth.setPhone(e.target.value)}
              leftIcon={<Phone size={16} />}
              error={otpAuth.error ?? undefined}
              autoComplete="tel"
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span className="zibi-field__label">{t.auth.channelLabel}</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {(['sms', 'whatsapp'] as const).map((ch) => (
                  <Button
                    key={ch}
                    type="button"
                    size="sm"
                    variant={otpAuth.channel === ch ? 'gold' : 'secondary'}
                    onClick={() => otpAuth.setChannel(ch)}
                  >
                    {ch === 'sms' ? t.auth.channelSms : t.auth.channelWhatsapp}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              isLoading={otpAuth.isSubmitting}
              disabled={otpAuth.cooldownSeconds > 0}
            >
              {otpAuth.cooldownSeconds > 0
                ? formatMessage(t.auth.resendIn, { seconds: otpAuth.cooldownSeconds })
                : t.auth.sendOtp}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifySubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {formatMessage(t.auth.otpSentTo, {
                  channel:
                    otpAuth.channel === 'sms'
                      ? t.auth.channelSms
                      : t.auth.channelWhatsapp,
                  phone: otpAuth.phone,
                })}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  color: otpAuth.isExpired ? 'var(--state-error)' : 'var(--color-gold)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} />
                  {otpAuth.isExpired
                    ? t.auth.otpExpired
                    : formatMessage(t.auth.otpExpiresIn, {
                        time: formatCountdown(otpAuth.secondsRemaining),
                      })}
                </span>
                <button
                  type="button"
                  disabled={otpAuth.isSubmitting || otpAuth.cooldownSeconds > 0}
                  onClick={() => void otpAuth.requestOtp()}
                  style={{
                    color: 'var(--text-primary)',
                    textDecoration: 'underline',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: otpAuth.cooldownSeconds > 0 ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} />
                  {otpAuth.cooldownSeconds > 0
                    ? formatMessage(t.auth.resendIn, {
                        seconds: otpAuth.cooldownSeconds,
                      })
                    : t.auth.resendOtp}
                </button>
              </div>
            </div>

            <OtpInput
              value={otpAuth.code}
              onChange={otpAuth.setCode}
              disabled={otpAuth.isSubmitting}
              hasError={Boolean(otpAuth.error)}
            />

            {otpAuth.error && (
              <p className="zibi-field__error" role="alert">
                {otpAuth.error}
              </p>
            )}

            <hr className="cultural-divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t.auth.registrationSectionTitle}
              </span>

              <Input
                label={t.auth.fullNameLabel}
                placeholder={t.auth.fullNamePlaceholder}
                maxLength={MAX_FULL_NAME_LENGTH}
                value={otpAuth.fullName}
                onChange={(e) => otpAuth.setFullName(e.target.value)}
                leftIcon={<User size={16} />}
              />

              <Input
                label={t.auth.emailLabel}
                placeholder={t.auth.emailPlaceholder}
                type="email"
                maxLength={MAX_EMAIL_LENGTH}
                value={otpAuth.email}
                onChange={(e) => otpAuth.setEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
              />

              <Select
                label={t.auth.preferredLangLabel}
                value={otpAuth.preferredLang}
                onChange={(e) =>
                  otpAuth.setPreferredLang(e.target.value as SupportedLocale)
                }
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'fr', label: 'Français' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  otpAuth.setStep('PHONE');
                  otpAuth.setError(null);
                }}
              >
                {t.auth.changePhone}
              </Button>
              <Button
                type="submit"
                fullWidth
                isLoading={otpAuth.isSubmitting}
                disabled={otpAuth.cooldownSeconds > 0 || otpAuth.isExpired}
              >
                {t.auth.verifyOtp}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
