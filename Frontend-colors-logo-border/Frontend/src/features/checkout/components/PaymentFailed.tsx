import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';

export interface PaymentFailedProps {
  isExpired?: boolean;
  onRetryAttempt: () => void;
  onBackToStorefront: () => void;
}

export function PaymentFailed({
  isExpired = false,
  onRetryAttempt,
  onBackToStorefront,
}: PaymentFailedProps) {
  const { t } = useLanguage();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div
        style={{
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--state-error-bg)',
          border: '1px solid rgba(229, 82, 74, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'var(--space-2)',
        }}
        role="alert"
      >
        <AlertTriangle size={30} color="var(--state-error)" />
        <h3 style={{ fontSize: 'var(--text-xl)' }}>
          {isExpired ? t.checkout.sessionExpiredTitle : t.checkout.failedTitle}
        </h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {isExpired ? t.checkout.sessionExpiredSubtitle : t.checkout.failedSubtitle}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Button type="button" variant="primary" fullWidth onClick={onRetryAttempt}>
          {t.checkout.tryNewAttempt}
        </Button>
        <Button type="button" variant="secondary" fullWidth onClick={onBackToStorefront}>
          {t.checkout.continueAction}
        </Button>
      </div>
    </div>
  );
}
